#!/usr/bin/env node
// The Gate B package: bundle/project.fcpxml plus README and a hash index, built only on a
// picture and audio lock that still holds.
//
//   node build-bundle.js <client> <job-id> [--json]
//
// Refuses unless check-approval.js exits 0 for gate A (an edit after the lock is a hash
// mismatch, not a document somebody has to notice), runs build-fcpxml.py, checks the FCPXML
// and its sha256 sidecar, writes bundle/README.md and bundle/.pipeline/manifest.json.
// Exit 0 built · 1 the approval no longer covers the files, or the build failed · 2 usage · 3 no approval
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: build-bundle.js <client> <job-id> [--json]'); process.exit(2); }
const rootArgs = argv.includes('--root') ? ['--root', argv[argv.indexOf('--root') + 1]] : [];

const check = spawnSync(process.execPath, [path.join(__dirname, 'check-approval.js'), client, jobId, 'A', '--json', ...rootArgs], { encoding: 'utf8' });
let verdict = null;
try { verdict = JSON.parse(check.stdout); } catch { verdict = null; }
if (check.status === 3 || !verdict) { console.error('No approved record for gate A. The creative director locks picture and audio on the board first.'); process.exit(3); }
if (check.status !== 0) {
  console.error('Gate A was locked on other versions of these files:');
  for (const c of verdict.changed || []) console.error('  changed: ' + c.path);
  for (const m of verdict.missing || []) console.error('  gone: ' + m);
  console.error('Ask for Gate A again on the current versions.');
  process.exit(1);
}

// Stage the takes the first cut uses under bundle/footage/, so every src in the FCPXML resolves
// inside the bundle and Premiere never shows offline media. Same basename, bytes compared by size.
{
  const stageEdl = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'rough-edl.json'), 'utf8')); } catch { return null; } })();
  const stageMan = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { return null; } })();
  if (!stageEdl || !stageMan) { console.error('rough-edl.json or manifest.json is missing; nothing to stage.'); process.exit(1); }
  const footageDir = path.join(dir, 'bundle', 'footage'); fs.mkdirSync(footageDir, { recursive: true });
  const bySha = new Map((stageMan.clips || []).map(c => [c.sha256, c]));
  const staged = new Set();
  for (const cut of stageEdl.cuts || []) {
    const clip = bySha.get(cut.clipSha256);
    if (!clip) { console.error('cut ' + cut.panelId + ' references a clip not in manifest.json (' + String(cut.clipSha256).slice(0, 12) + ').'); process.exit(1); }
    const src = path.isAbsolute(clip.path) ? clip.path : path.join(dir, clip.path);
    if (!fs.existsSync(src)) { console.error('take not on disk: ' + clip.path); process.exit(1); }
    const dest = path.join(footageDir, path.basename(src));
    if (path.resolve(src) !== path.resolve(dest) && (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size)) fs.copyFileSync(src, dest);
    staged.add(path.basename(src));
  }
  if (staged.size) console.log('Staged ' + staged.size + ' take(s) under bundle/footage/: ' + [...staged].join(', '));
}

// build-fcpxml.py reads workspaces/{client}/jobs/{job}/... relative to its cwd, so it runs at the root.
const rootDir = ws.root(argv);
// macOS and most Linux ship python3 only; Windows usually has python.
const PY = spawnSync('python', ['--version']).status === 0 ? 'python' : 'python3';
const build = spawnSync(PY, [path.join(__dirname, 'build-fcpxml.py'), client, jobId], { cwd: rootDir, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
if (build.status !== 0) { console.error('build-fcpxml.py failed (exit ' + build.status + '):'); console.error((build.stderr || build.stdout || '').trim()); process.exit(1); }

const bundle = path.join(dir, 'bundle');
const fcp = path.join(bundle, 'project.fcpxml');
if (!fs.existsSync(fcp)) { console.error('build-fcpxml.py exited 0 but bundle/project.fcpxml is not there.'); process.exit(1); }
const xml = fs.readFileSync(fcp, 'utf8');
if (!/<fcpxml[^>]*version="1\.10"/.test(xml)) { console.error('bundle/project.fcpxml is not FCPXML 1.10.'); process.exit(1); }
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fcpSha = sha(fcp);
const sidecar = path.join(bundle, '.pipeline', 'fcpxml.sha256');
if (fs.existsSync(sidecar)) {
  const said = fs.readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
  if (said !== fcpSha) { console.error('bundle/.pipeline/fcpxml.sha256 does not match project.fcpxml; the packager and the file disagree.'); process.exit(1); }
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
const job = readJson('job.json') || {};
const edl = readJson('rough-edl.json') || {};
const cuts = Array.isArray(edl.cuts) ? edl.cuts.length : (Array.isArray(edl.clips) ? edl.clips.length : 0);
const unmatched = edl.unmatched || edl.unmatchedPanels || [];
const listDir = (sub, re) => { try { return fs.readdirSync(path.join(bundle, sub)).filter(f => re.test(f)).sort(); } catch { return []; } };
const broll = listDir('broll', /\.(mp4|mov)$/i);
const mograph = listDir('mograph', /\.(mov|mp4|png)$/i);
const audio = listDir('audio', /\.(wav|aif|aiff|mp3|png)$/i);
const when = ws.now(client, argv);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full);
    else if (!/[\\/]\.pipeline[\\/]manifest\.json$/.test(full) && !/README\.md$/.test(full)) files.push({ file: path.relative(bundle, full).split(path.sep).join('/'), sha256: sha(full), bytes: fs.statSync(full).size });
  }
})(bundle);

const readme = [
  '# Premiere bundle: ' + (job.title || jobId), '',
  'Built ' + when + ' on the Gate A lock ' + verdict.approvalId + ' by ' + (verdict.decidedBy || 'the creative director') + '.', '',
  '## Open this', '', '- Import `project.fcpxml` into Premiere Pro (File > Import). The timeline is already loaded.',
  '- Frame ' + (job.aspectRatio || '?') + ', target ' + (job.deliverableDurationSec ? job.deliverableDurationSec + ' s' : 'unknown') + ', ' + (job.audioLed ? 'audio-led' : 'picture-led') + '.', '',
  '## On the timeline', '', '- V1: ' + cuts + ' cut' + (cuts === 1 ? '' : 's') + ' from the first cut, in story order.',
  '- A1 to A3: the synced mix (voice-over, music, effects) with levels baked as clip gains.', '',
  '## In the bins, not placed', '',
  '- B-roll: ' + (broll.length ? broll.join(', ') : 'none generated'),
  '- Motion graphics (alpha): ' + (mograph.length ? mograph.join(', ') : 'none rendered'),
  '- Audio stems: ' + (audio.length ? audio.join(', ') : 'none staged'), '',
  '## Panels without a take', '', ...(unmatched.length ? unmatched.map(p => '- ' + (typeof p === 'string' ? p : JSON.stringify(p))) : ['- none']), '',
  '## Colour', '', '- ' + (job.colourDirection || 'No grade direction was declared; the editor grades.'), '',
  'Every file is indexed with its sha256 in `.pipeline/manifest.json`. A later change is a new bundle and Gate B is asked again.', '',
].join('\n');
fs.writeFileSync(path.join(bundle, 'README.md'), readme);
fs.mkdirSync(path.join(bundle, '.pipeline'), { recursive: true });
const manifest = { schemaVersion: '1.0', jobId, client, gate: 'A', approvalId: verdict.approvalId, lockedBy: verdict.decidedBy || null, builtAt: when, fcpxmlSha256: fcpSha, files };
fs.writeFileSync(path.join(bundle, '.pipeline', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

if (json) console.log(JSON.stringify(manifest, null, 2));
else {
  console.log('Bundle built at ' + ws.fwd(bundle) + ': project.fcpxml (' + fcpSha.slice(0, 12) + '), ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' indexed, README written.');
  console.log('Gate B: the production lead releases it on the board; record-approval.js ' + client + ' ' + jobId + ' B approve --by lead bundle/project.fcpxml bundle/.pipeline/manifest.json');
}