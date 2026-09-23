#!/usr/bin/env node
// The generate stage of a generated job (footageSource "generated"): one AI clip per storyboard
// panel, made through the 3echo AgentC video model by the orchestrator, landed here.
//
//   node generate-clips.js <client> <job-id> brief                 write generation-brief.json from the storyboard and script
//   node generate-clips.js <client> <job-id> approve sample|batch --by <who> --at <iso> [--credits N] [--panels P02,P03]
//   node generate-clips.js <client> <job-id> quote <panelId> --credits N [--job-ref <agentc job id>]
//   node generate-clips.js <client> <job-id> land <panelId> --file <mp4> | --url <https media url> [--job-ref <id>] [--credits N]
//   node generate-clips.js <client> <job-id> status
//
// The brief is the request the spend guard reads (preflight-generation.js --kind generate): a
// prompt, reference panel, duration and ratio per panel, and the approvals landed from the board.
// The MCP calls (estimate_video_job, create_video_job, wait_for_job, get_job_result) are made by
// the orchestrator in the session; this script never spends. Exit 0 ok · 1 fault · 2 usage · 3 not ready
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { client, jobId, dir, rest } = ws.resolveJobArgs(argv, argv);
const cmd = rest[0];
if (!client || !jobId || !['brief', 'approve', 'quote', 'land', 'status'].includes(cmd)) { console.error('usage: generate-clips.js <client> <job-id> brief|approve|quote|land|status ...'); process.exit(2); }
const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
if (job.footageSource !== 'generated') { console.error('job.json footageSource is not "generated"; this job cuts shot footage.'); process.exit(3); }
const briefPath = path.join(dir, 'generation-brief.json');
const readBrief = () => { if (!fs.existsSync(briefPath)) { console.error('no generation-brief.json yet; run brief first'); process.exit(3); } return JSON.parse(fs.readFileSync(briefPath, 'utf8')); };
const writeBrief = b => { fs.writeFileSync(briefPath + '.tmp', JSON.stringify(b, null, 2) + '\n'); fs.renameSync(briefPath + '.tmp', briefPath); };
const RATIO = { '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '4:5': '3:4', '2.39:1': '21:9' };
const gen = job.generation || {};
const outDir = path.join(job.driveFolder, 'footage', 'generated');

if (cmd === 'brief') {
  const rel = job.prePipelineReleaseFolder;
  const sb = JSON.parse(fs.readFileSync(path.join(rel, 'storyboard.json'), 'utf8'));
  const panels = (sb.panels || []).slice().sort((a, b) => (a.storyOrder || 0) - (b.storyOrder || 0) || String(a.id).localeCompare(String(b.id)));
  if (!panels.length) { console.error('storyboard.json has no panels'); process.exit(1); }
  const script = fs.existsSync(path.join(rel, 'script.md')) ? fs.readFileSync(path.join(rel, 'script.md'), 'utf8') : '';
  const sceneLine = scene => { if (scene == null) return null; const re = new RegExp('^\\s*Scene\\s+' + String(scene).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[^\\n]*', 'im'); const m = script.match(re); return m ? m[0].trim() : null; };
  const clipSec = Number(gen.clipSec) || 6;
  // Generate longer, use less: the model is asked for the used length plus headroom (capped at 15 s), and
  // the cut takes its window from headSec in, so the weak first frames and the drifting tail are never on screen.
  const headroomSec = gen.headroomSec == null ? 2 : Math.max(0, Number(gen.headroomSec) || 0);
  const headSec = gen.headSec == null ? 0.5 : Math.max(0, Number(gen.headSec) || 0);
  const prev = fs.existsSync(briefPath) ? JSON.parse(fs.readFileSync(briefPath, 'utf8')) : null;
  const keep = new Map(((prev || {}).panels || []).map(p => [p.id, p]));
  const out = {
    schemaVersion: '1.0', jobId, generatedAt: new Date().toISOString(),
    model: 'agentc/seedance', ratio: RATIO[job.aspectRatio] || '16:9', resolution: gen.resolution || '720p', generateAudio: gen.generateAudio === true, workspaceId: gen.workspaceId || null,
    approvals: (prev || {}).approvals || {},
    panels: panels.map(p => {
      const old = keep.get(p.id) || {};
      const useSec = Math.min(15, Math.max(1, Math.round((Number(p.durationSec) || clipSec) * 10) / 10));
      const durationSec = Math.min(15, Math.max(4, Math.ceil(useSec + headroomSec)));
      const inSec = Math.max(0, Math.min(headSec, durationSec - useSec));
      const line = sceneLine(p.scene);
      // The prompt: the panel caption, the line spoken over it (mood only, the VO is added in the audio
      // stages), and the frame. The reference-panel sentence is added by the orchestrator only when a
      // panel image is actually attached as a reference asset.
      const voLine = line ? (line.match(/VO:\s*"([^"]+)"/i) || [])[1] || null : null;
      const action = line ? line.replace(/^Scene\s+\S+:?\s*/i, '').replace(/,?\s*VO:\s*"[^"]*"/i, '').trim().replace(/[.\s]+$/, '') : '';
      const capText = p.caption || p.description || ('Storyboard panel ' + p.id);
      const prompt = [capText + '.', action && action.toLowerCase() !== capText.toLowerCase() ? action + '.' : null, voLine ? 'The moment carries the line "' + voLine + '" (unspoken; no dialogue, no lip movement).' : null, 'Live-action, cinematic, natural light, ' + (job.aspectRatio || '16:9') + ' frame, one continuous shot, subtle camera move; no text, no captions, no logos, no watermarks.'].filter(Boolean).join(' ');
      return { id: p.id, storyOrder: p.storyOrder || null, scene: p.scene == null ? null : String(p.scene), prompt: old.promptOverride || prompt, referencePanel: path.join(rel, p.file || ('storyboard/v1/' + p.id + '.png')).replace(/\\/g, '/'), durationSec, useSec, inSec, ratio: RATIO[job.aspectRatio] || '16:9', idempotencyKey: jobId + '/generate/' + p.id, status: old.status === 'delivered' ? 'delivered' : 'pending', quotedCredits: old.quotedCredits || null, jobRef: old.jobRef || null, file: old.file || null, sha256: old.sha256 || null, credits: old.credits || null };
    }),
  };
  const missingRef = out.panels.filter(p => !fs.existsSync(p.referencePanel)).map(p => p.id);
  if (missingRef.length) { console.error('reference panel image missing for ' + missingRef.join(', ')); process.exit(1); }
  writeBrief(out);
  console.log('generation-brief.json: ' + out.panels.length + ' panel(s); the cut uses ' + out.panels.reduce((s, p) => s + p.useSec, 0) + ' s, the model is asked for ' + out.panels.reduce((s, p) => s + p.durationSec, 0) + ' s (' + headroomSec + ' s headroom per clip, window from ' + headSec + ' s in) at ' + out.ratio + ' ' + out.resolution + (out.generateAudio ? ' with model audio' : ', silent') + '. Quote the sample (first panel) with estimate_video_job and ask on the board before anything is spent.');
  process.exit(0);
}
if (cmd === 'approve') {
  const scope = rest[1]; if (!['sample', 'batch'].includes(scope) || !opt('--by') || !opt('--at')) { console.error('usage: approve sample|batch --by <who> --at <iso> [--credits N]'); process.exit(2); }
  const b = readBrief(); b.approvals = b.approvals || {}; b.approvals[scope] = { by: opt('--by'), at: opt('--at'), credits: opt('--credits') ? Number(opt('--credits')) : null, channel: 'board', panels: opt('--panels') ? opt('--panels').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : null };
  writeBrief(b); console.log(scope + ' approved by ' + opt('--by') + (opt('--credits') ? ' for ' + opt('--credits') + ' credits' : '') + '; recorded in generation-brief.json.'); process.exit(0);
}
if (cmd === 'quote') {
  const b = readBrief(); const p = b.panels.find(x => x.id === rest[1]); if (!p || !opt('--credits')) { console.error('usage: quote <panelId> --credits N [--job-ref <id>]'); process.exit(2); }
  p.quotedCredits = Number(opt('--credits')); if (opt('--job-ref')) p.jobRef = opt('--job-ref'); writeBrief(b); console.log(p.id + ' quoted at ' + p.quotedCredits + ' credits.'); process.exit(0);
}
if (cmd === 'land') {
  const b = readBrief(); const p = b.panels.find(x => x.id === rest[1]); if (!p) { console.error('no panel ' + rest[1] + ' in the brief'); process.exit(2); }
  const scope = b.panels.filter(x => x.status === 'delivered').length === 0 ? 'sample' : 'batch';
  if (!(b.approvals || {})[scope]) { console.error('no ' + scope + ' approval on record; nothing lands without a yes from the board'); process.exit(3); }
  const only = scope === 'batch' && b.approvals.batch.panels;
  if (only && !only.includes(p.id.toUpperCase())) { console.error(p.id + ' is outside the approved batch (' + only.join(', ') + '); ask on the board for it first'); process.exit(3); }
  board.ensureDir(outDir);
  const dest = path.join(outDir, p.id + '.mp4');
  if (opt('--file')) { if (!fs.existsSync(opt('--file'))) { console.error('file not there: ' + opt('--file')); process.exit(1); } fs.copyFileSync(opt('--file'), dest); }
  else if (opt('--url')) { const r = spawnSync('curl', ['-sSL', '--fail', '-o', dest, opt('--url')], { encoding: 'utf8' }); if (r.status !== 0) { console.error('download failed: ' + (r.stderr || r.error)); process.exit(1); } }
  else { console.error('land needs --file <mp4> or --url <media url>'); process.exit(2); }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name:format=duration', '-of', 'json', dest], { encoding: 'utf8' });
  let info = {}; try { info = JSON.parse(probe.stdout); } catch { info = {}; }
  const st = (info.streams || [])[0]; if (!st) { fs.unlinkSync(dest); console.error('the landed file has no video stream; not kept'); process.exit(1); }
  p.status = 'delivered'; p.file = dest.replace(/\\/g, '/'); p.sha256 = board.sha256File(dest); p.landedAt = new Date().toISOString(); p.width = st.width; p.height = st.height; p.actualDurationSec = Number((info.format || {}).duration) || null;
  if (opt('--job-ref')) p.jobRef = opt('--job-ref'); if (opt('--credits')) p.credits = Number(opt('--credits'));
  writeBrief(b);
  const left = b.panels.filter(x => x.status !== 'delivered').length;
  console.log(p.id + ' landed: ' + path.basename(dest) + ' ' + st.width + 'x' + st.height + ' ' + (p.actualDurationSec || 0).toFixed(1) + ' s (' + p.sha256.slice(0, 12) + '). ' + (left ? left + ' panel(s) still to generate.' : 'Every panel has a clip; run ingest-footage.js next.'));
  process.exit(0);
}
if (cmd === 'status') {
  const b = readBrief(); const done = b.panels.filter(p => p.status === 'delivered');
  console.log('generate: ' + done.length + '/' + b.panels.length + ' delivered; approvals: ' + Object.keys(b.approvals || {}).join(', ') + (Object.keys(b.approvals || {}).length ? '' : 'none') + '; credits spent ' + done.reduce((s, p) => s + (Number(p.credits) || 0), 0));
  for (const p of b.panels) console.log('  ' + p.id + ' ' + p.status + (p.quotedCredits ? ' quoted ' + p.quotedCredits : '') + (p.file ? ' ' + path.basename(p.file) : ''));
  process.exit(0);
}