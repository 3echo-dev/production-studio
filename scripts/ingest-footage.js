#!/usr/bin/env node
// Catalog every clip and audio file under the shoot folder into manifest.json.
//
//   node ingest-footage.js <client> <job-id> [--json]
//
// Reads job.json for driveFolder. Walks footage/ (mov mp4 mxf braw r3d mts m4v avi mkv) and
// audio/<kind>/ (wav aif aiff mp3 m4a flac). ffprobe is the only source of fps and duration;
// the bytes are hashed, never trusted by mtime. Paths are absolute into the shoot folder: the
// rushes are never copied into the job. Scene, take and slate are parsed only when the filename
// carries them (A001_C003_scene-2_t3.mov); a clip outside a day-NN folder is parked with day null.
// Exit 0 written · 1 fault (ffprobe missing, unreadable file, schema) · 2 usage · 3 no clips
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const { hashFile } = require('./hash-artifact.js');
const { validate } = require('./validate-schema.js');

const argv = process.argv.slice(2);
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: ingest-footage.js <client> <job-id> [--json]'); process.exit(2); }
const jobPath = path.join(dir, 'job.json');
if (!fs.existsSync(jobPath)) { console.error('No job.json at ' + ws.fwd(jobPath)); process.exit(2); }
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const drive = job.driveFolder && (path.isAbsolute(job.driveFolder) ? job.driveFolder : path.resolve(dir, job.driveFolder));
if (!drive || !fs.existsSync(drive)) { console.error('The shoot folder is not there: ' + ws.fwd(drive || '(driveFolder empty)')); process.exit(1); }
if (spawnSync('ffprobe', ['-version']).status !== 0) { console.error('ffprobe is not on PATH. Install ffmpeg; check ffmpeg -version'); process.exit(1); }

const MEDIA = /\.(mov|mp4|mxf|braw|r3d|mts|m4v|avi|mkv)$/i;
const AUDIO = /\.(wav|aif|aiff|mp3|m4a|flac)$/i;
const KINDS = ['lav', 'boom', 'ambient', 'wild', 'vo', 'bgm', 'sfx'];
const warnings = [];
const fwd = ws.fwd;

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-print_format', 'json', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}
function fpsOf(s) { const m = String(s.r_frame_rate || s.avg_frame_rate || '').match(/^(\d+)\/(\d+)$/); if (!m || Number(m[2]) === 0) return null; return Math.round((Number(m[1]) / Number(m[2])) * 1000) / 1000; }
function walk(d, re, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) { if (!/^proxies$/i.test(e.name)) walk(full, re, out); }
    else if (re.test(e.name)) out.push(full);
  }
  return out.sort();
}
function dayOf(file, base) {
  const rel = path.relative(base, file).split(path.sep);
  for (const seg of rel) { const m = seg.match(/^day[-_ ]?(\d{1,2})$/i); if (m) return Number(m[1]); }
  return null;
}
function proxyFor(file, base) {
  const rel = path.relative(base, file);
  const cands = [path.join(drive, 'proxies', rel), path.join(path.dirname(file), 'proxies', path.basename(file))];
  for (const c of cands) { const d = path.dirname(c), stem = path.parse(c).name; try { const hit = fs.readdirSync(d).find(n => path.parse(n).name === stem && MEDIA.test(n)); if (hit) return fwd(path.join(d, hit)); } catch { /* no proxies */ } }
  return null;
}

const footageDir = path.join(drive, 'footage');
// A hybrid job's cut is made of its composites: the plates, cut-outs and backgrounds they were built
// from, and a motion-transfer panel's reference and generated clips, are inputs to the composite
// (recorded in hybrid-brief.json), not clips to cut.
const HYBRID_INPUTS = /[\\/](plates|cutout|backgrounds|motion)[\\/]/i;
const clipFiles = walk(footageDir, MEDIA).filter(f => job.footageSource !== 'hybrid' || !HYBRID_INPUTS.test(path.relative(footageDir, f).split(path.sep).join('/').replace(/^/, '/')));
if (!clipFiles.length) { console.error('No clips under ' + fwd(footageDir) + '. Intake needs at least one.'); process.exit(3); }
const clips = [];
for (const f of clipFiles) {
  const p = probe(f);
  if (!p) { warnings.push(fwd(path.relative(drive, f)) + ': ffprobe could not open it; skipped'); continue; }
  const v = (p.streams || []).find(s => s.codec_type === 'video');
  if (!v) { warnings.push(fwd(path.relative(drive, f)) + ': no video stream; skipped'); continue; }
  const h = hashFile(f);
  const day = dayOf(f, footageDir);
  const generated = /[\\/]generated[\\/]/.test(path.relative(footageDir, f).split(path.sep).join('/') + '/') || /^generated$/i.test(path.basename(path.dirname(f)));
  if (day === null && !generated) warnings.push(fwd(path.relative(drive, f)) + ': not under a day-NN folder; day parked as null');
  const name = path.parse(f).name;
  const scene = (name.match(/scene[-_ ]?([A-Za-z0-9]+)/i) || [])[1] || null;
  const take = (name.match(/(?:^|[_-])t(?:ake)?[-_ ]?(\d+)(?:$|[_-])/i) || [])[1] || null;
  const slate = (name.match(/^([A-Z]\d{3}_C\d{3})/) || [])[1] || null;
  const tc = (v.tags && (v.tags.timecode || v.tags.TIMECODE)) || (p.format && p.format.tags && p.format.tags.timecode) || null;
  const fps = fpsOf(v);
  if (!fps) warnings.push(fwd(path.relative(drive, f)) + ': fps not reported; set to 25');
  clips.push({
    path: fwd(f), sha256: h.sha256, bytes: fs.statSync(f).size,
    durationSec: Math.round(Number((p.format && p.format.duration) || v.duration || 0) * 1000) / 1000,
    codec: v.codec_name || 'unknown', width: Number(v.width) || 0, height: Number(v.height) || 0, fps: fps || 25,
    ...(tc ? { timecodeStart: tc } : {}), day, ...(generated ? { generated: true } : {}), ...(scene ? { scene } : {}), ...(take ? { take: Number(take) } : {}), ...(slate ? { slate } : {}),
    ...(proxyFor(f, footageDir) ? { proxyPath: proxyFor(f, footageDir) } : {}),
  });
}
const audio = [];
for (const kind of KINDS) {
  for (const f of walk(path.join(drive, 'audio', kind), AUDIO)) {
    const p = probe(f);
    if (!p) { warnings.push(fwd(path.relative(drive, f)) + ': ffprobe could not open it; skipped'); continue; }
    const a = (p.streams || []).find(s => s.codec_type === 'audio');
    const h = hashFile(f);
    const rate = a ? Number(a.sample_rate) : null;
    if (rate && rate < 44100) warnings.push(fwd(path.relative(drive, f)) + ': ' + rate + ' Hz is below 44.1 kHz');
    const day = dayOf(f, path.join(drive, 'audio'));
    audio.push({ path: fwd(f), sha256: h.sha256, bytes: fs.statSync(f).size, durationSec: Math.round(Number((p.format && p.format.duration) || (a && a.duration) || 0) * 1000) / 1000, kind, ...(a ? { channels: Number(a.channels) || 1, sampleRateHz: rate } : {}), ...(day !== null ? { day } : {}) });
  }
}
// One row per shoot day: the day number and the date, from the earliest clip's creation tag,
// else the file's own time. A date the camera did not write is still a date, so it is said.
const dayNums = [...new Set(clips.map(c => c.day).filter(d => d !== null))].sort((a, b) => a - b);
const days = dayNums.map(d => {
  const of = clipFiles.filter(f => dayOf(f, footageDir) === d);
  const stamps = of.map(f => { const pr = probe(f); const tag = pr && pr.format && pr.format.tags && (pr.format.tags.creation_time || pr.format.tags['com.apple.quicktime.creationdate']); return tag ? new Date(tag) : fs.statSync(f).mtime; }).filter(x => !isNaN(x)).sort((x, y) => x - y);
  return { day: d, date: (stamps[0] || new Date()).toISOString().slice(0, 10), clips: of.length };
});
if (!audio.some(a => a.kind === 'vo')) warnings.push('no VO takes under audio/vo; the cut is picture-only unless VO arrives');
if (!audio.some(a => a.kind === 'bgm')) warnings.push('no music under audio/bgm; the BGM supervisor has nothing to shortlist');
const manifest = { schemaVersion: '1.0', jobId, createdAt: new Date().toISOString(), shootFolder: fwd(drive), shootDays: days, clips, audio, warnings };
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'manifest.schema.json'), 'utf8'));
const errs = validate(schema, manifest);
if (errs.length) { console.error('manifest fails schema: ' + errs.map(e => e.path + ' ' + e.message).join('; ')); process.exit(1); }
const out = path.join(dir, 'manifest.json');
const tmp = out + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n'); fs.renameSync(tmp, out);
if (argv.includes('--json')) console.log(JSON.stringify({ clips: clips.length, audio: audio.length, days, warnings }, null, 2));
else {
  console.log('manifest.json: ' + clips.length + ' clip' + (clips.length === 1 ? '' : 's') + ' (' + (days.length ? 'day ' + days.map(x => x.day + ' on ' + x.date).join(', ') : 'no day folders') + '), ' + audio.length + ' audio file' + (audio.length === 1 ? '' : 's') + ' (' + KINDS.filter(k => audio.some(a => a.kind === k)).map(k => k + ' ' + audio.filter(a => a.kind === k).length).join(', ') + ').');
  for (const w of warnings) console.log('  warning: ' + w);
}