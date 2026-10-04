#!/usr/bin/env node
// The runtime scripts, end to end on a fixture root: set-root, scaffold-client, scaffold-job,
// route-job (refused on missing XX, then ROUTED), plan-job, set-state (legal and illegal moves,
// board writes queued), record-version (hash on the board, duplicate refused), record-run,
// collect-artifacts, stage, record-approval -> state, check-approval + tamper, build-bundle on
// the real packager. Nothing under the plugin folder is touched.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-runtime-'));
const env = Object.assign({}, process.env, { PYTHONUTF8: '1' }); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const stateOf = dir => (fs.readFileSync(path.join(dir, 'status.md'), 'utf8').match(/\*\*Current state:\*\*\s*`([A-Z_]+)`/) || [])[1];
const outboxOf = dir => { try { return fs.readFileSync(path.join(dir, '.board', 'outbox.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };

// 1. root and client
let r = run('set-root.js', ['.', '--no-guards']); ok(r, 'set-root');
assert.ok(fs.existsSync(path.join(tmp, '.creative-studio-post', 'config.json')), 'config written');
assert.ok(fs.existsSync(path.join(tmp, 'workspaces')), 'workspaces/ created');
const shoot = path.join(tmp, 'shoot'); fs.mkdirSync(path.join(shoot, 'footage'), { recursive: true });
r = run('set-root.js', [shoot]); assert.strictEqual(r.status, 3, 'a shoot folder is refused as a root');
r = run('scaffold-client.js', ['acme', 'Acme', 'Films']); ok(r, 'scaffold-client');
const wsJson = JSON.parse(fs.readFileSync(path.join(tmp, 'workspaces', 'acme', 'workspace.json'), 'utf8'));
assert.strictEqual(wsJson.name, 'Acme Films'); assert.strictEqual(wsJson.approvers.cut, 'creative-director');
r = run('scaffold-client.js', ['acme']); assert.strictEqual(r.status, 1, 'no overwrite');

// 2. job
r = run('scaffold-job.js', ['acme', 'night', 'Late', 'Night']); ok(r, 'scaffold-job');
const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
assert.ok(/^job-\d{8}-\d{4}-night$/.test(jobId), 'job id shape: ' + jobId);
const jobDir = path.join(tmp, 'workspaces', 'acme', 'jobs', jobId);
assert.strictEqual(stateOf(jobDir), 'INTAKE_PENDING');
const job = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
assert.strictEqual(job.title, 'Late Night'); assert.strictEqual(job.aspectRatio, null, 'XX stays null until intake');

// 3. route: refused without the declarations, then routed
r = run('route-job.js', [path.join(jobDir, 'job.json')]);
assert.strictEqual(r.status, 3, 'route needs clarification without XX: ' + r.stdout);
assert.strictEqual(stateOf(jobDir), 'INTAKE_PENDING', 'an unclear route moves nothing');
const release = path.join(tmp, 'release');
fs.mkdirSync(path.join(release, 'storyboard', 'v1'), { recursive: true });
for (const f of ['script.md', 'storyboard.json', 'concept-breakdown.xlsx', 'call-sheet-day-01.pdf']) fs.writeFileSync(path.join(release, f), 'x');
fs.writeFileSync(path.join(release, 'storyboard', 'v1', 'P01.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const clipA = Buffer.from('CLIP-A-BYTES'), clipB = Buffer.from('CLIP-B-BYTES');
fs.writeFileSync(path.join(shoot, 'footage', 'A001_C001.mov'), clipA);
fs.writeFileSync(path.join(shoot, 'footage', 'A002_C001.mov'), clipB);
Object.assign(job, { aspectRatio: '16:9', deliverableDurationSec: 30, audioLed: false, driveFolder: shoot, prePipelineReleaseFolder: release });
writeJson(path.join(jobDir, 'job.json'), job);
r = run('route-job.js', [path.join(jobDir, 'job.json')]); ok(r, 'route-job');
const route = JSON.parse(fs.readFileSync(path.join(jobDir, 'route.json'), 'utf8'));
assert.strictEqual(route.status, 'ROUTED'); assert.deepStrictEqual(route.gates, ['A', 'B']);
assert.ok(route.tags.includes('picture_led') && route.tags.includes('no_vo'), 'tags: ' + route.tags);
assert.strictEqual(route.owner, 'orchestrator'); assert.ok(route.support.includes('sequence-director'));
assert.strictEqual(stateOf(jobDir), 'PLANNED', 'routing records PLANNED');
let ob = outboxOf(jobDir);
assert.ok(ob.some(w => w.collection === 'projects' && w.data.status === 'intake'), 'state change queued the board status');
assert.ok(ob.some(w => w.collection === 'items' && w.docId === 'ingest' && w.data.status === 'running'), 'PLANNED marks ingest working');

// 4. plan
r = run('plan-job.js', [path.join(jobDir, 'route.json')]); ok(r, 'plan-job');
const plan = fs.readFileSync(path.join(jobDir, 'plan.md'), 'utf8');
const rows = plan.split(/\r?\n/).filter(l => /^\| \d+ \|/.test(l));
assert.strictEqual(rows.length, 12, '12 plan rows'); 
assert.ok(rows[7].includes('AWAITING_GATE_A') && rows[7].includes('| A |'), 'row 8 is gate A: ' + rows[7]);
assert.ok(rows[11].includes('AWAITING_GATE_B'), 'row 12 is gate B');
assert.ok(rows[2].includes('sequence-director') && rows[2].includes('support'), 'row 3 support: ' + rows[2]);

// 5. states, versions, runs, collect, stage
ok(run('set-state.js', ['acme', jobId, 'INGESTED', '--by', 'orchestrator', '--note', 'two clips catalogued']), 'INGESTED');
r = run('set-state.js', ['acme', jobId, 'RELEASED', '--by', 'orchestrator']); assert.strictEqual(r.status, 1, 'illegal move refused');
assert.ok(/cannot go from INGESTED to RELEASED/.test(r.stderr));
const edl = { schemaVersion: '1.0', jobId, version: 1, aspectRatio: '16:9', fps: 25, cuts: [
  { order: 1, panelId: 'P01', clipSha256: sha(clipA), inSec: 0.5, outSec: 3.5, matchScore: 0.7 },
  { order: 2, panelId: 'P02', clipSha256: sha(clipB), inSec: 1.0, outSec: 6.0, matchScore: 0.6 } ] };
writeJson(path.join(jobDir, 'rough-edl.json'), edl);
fs.writeFileSync(path.join(jobDir, 'timeline.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
r = run('record-version.js', ['acme', jobId, '--item', 'sequence', '--n', '1', '--file', 'rough-edl.json', '--note', 'first cut, 2 panels', '--seat', 'sequence-director', '--preview', 'timeline.png']); ok(r, 'record-version');
const versions = fs.readFileSync(path.join(jobDir, 'versions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
assert.strictEqual(versions.length, 1); assert.strictEqual(versions[0].hash, sha(fs.readFileSync(path.join(jobDir, 'rough-edl.json'))));
ob = outboxOf(jobDir);
const itemW = ob.filter(w => w.collection === 'items' && w.docId === 'sequence').pop();
assert.strictEqual(itemW.data.sha256, versions[0].hash, 'the board item carries the hash the gate binds to');
assert.strictEqual(itemW.data.file, 'rough-edl.json'); assert.strictEqual(itemW.data.status, 'draft');
assert.ok(ob.some(w => w.collection === 'previews' && w.docId === 'sequence' && String(w.data.thumb).startsWith('data:image/png;base64,')), 'preview queued');
r = run('record-version.js', ['acme', jobId, '--item', 'sequence', '--n', '1', '--file', 'rough-edl.json']); assert.strictEqual(r.status, 1, 'duplicate version refused');
fs.writeFileSync(path.join(jobDir, 'runs', 'sequence-v1.prompt.txt'), 'Cut the storyboard against the manifest.');
r = run('record-run.js', ['acme', jobId, '--item', 'sequence', '--n', '1', '--seat', 'sequence-director', '--prompt-file', 'runs/sequence-v1.prompt.txt', '--model', 'sonnet']); ok(r, 'record-run');
const runRec = JSON.parse(fs.readFileSync(path.join(jobDir, 'runs', 'sequence-v1.json'), 'utf8'));
assert.ok(runRec.output.includes('"panelId": "P01"'), 'run output taken from the recorded version');
r = run('record-run.js', ['acme', jobId, '--item', 'bgm', '--n', '1', '--seat', 'bgm-supervisor', '--prompt-file', 'runs/sequence-v1.prompt.txt']); assert.strictEqual(r.status, 3, 'a done run with no version is refused');
ok(run('collect-artifacts.js', ['acme', jobId, 'rough-edl.json', 'timeline.png']), 'collect present');
r = run('collect-artifacts.js', ['acme', jobId, 'nowhere.json']); assert.strictEqual(r.status, 1, 'collect missing'); assert.ok(/MISSING:\s+nowhere.json/.test(r.stderr));
r = run('stage.js', ['acme', jobId, 'picture', 'running', '--substep', 'First cut', '--agents', 'sequence-director']); ok(r, 'stage');
assert.ok(outboxOf(jobDir).some(w => w.collection === 'projects' && /Picture · First cut · working/.test(w.data.activity)), 'stage queued the activity line');

// 6. through the audio states to Gate A, approval, check, tamper
for (const s of ['CUT_DRAFTED', 'BGM_PROPOSED', 'VO_PLACED', 'SYNCED', 'REVIEWED', 'AWAITING_GATE_A']) ok(run('set-state.js', ['acme', jobId, s, '--by', 'orchestrator']), s);
assert.ok(/Blocked on:\*\* You/.test(fs.readFileSync(path.join(jobDir, 'status.md'), 'utf8')), 'a gate blocks on the person');
const synced = { schemaVersion: '1.0', jobId, version: 1, picture: { edlPath: 'rough-edl.json', edlSha256: sha(fs.readFileSync(path.join(jobDir, 'rough-edl.json'))), totalDurationSec: 8 }, vo: [], bgm: { choiceId: 'c1', choicePath: 'x', duckDb: -12 }, sfx: [], output: { wavPath: 'bundle/audio/synced-track.wav', wavSha256: 'b'.repeat(64), waveformPngPath: 'bundle/audio/waveform.png' } };
writeJson(path.join(jobDir, 'synced-track.json'), synced);
r = run('record-approval.js', ['acme', jobId, 'A', 'lock', '--by', 'creative-director', '--comment', 'good', '--from-chat', 'rough-edl.json', 'synced-track.json']); ok(r, 'record-approval');
const ap = JSON.parse(fs.readFileSync(path.join(jobDir, 'approvals', 'A-1.json'), 'utf8'));
assert.strictEqual(ap.decision, 'approved'); assert.strictEqual(ap.artifacts.length, 2); assert.strictEqual(ap.channel, 'chat');
assert.strictEqual(stateOf(jobDir), 'GATE_A_PASSED', 'approval moved the state');
assert.ok(outboxOf(jobDir).some(w => w.collection === 'messages' && /Gate A: approved in chat/.test(w.data.text)), '--from-chat queued the council message');
ok(run('check-approval.js', ['acme', jobId, 'A']), 'check-approval');
const edlBytes = fs.readFileSync(path.join(jobDir, 'rough-edl.json'));
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), '{"tampered":true}');
r = run('check-approval.js', ['acme', jobId, 'A']); assert.strictEqual(r.status, 1, 'tamper detected'); assert.ok(/CHANGED since approval: rough-edl.json/.test(r.stderr));
r = run('build-bundle.js', ['acme', jobId]); assert.strictEqual(r.status, 1, 'no bundle on a broken lock');
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), edlBytes);
r = run('check-approval.js', ['acme', jobId, 'B']); assert.strictEqual(r.status, 3, 'no gate B record yet');

// 7. the bundle, on the real packager
writeJson(path.join(jobDir, 'manifest.json'), { schemaVersion: '1.0', jobId, createdAt: new Date().toISOString(), clips: [
  { path: 'footage/A001_C001.mov', sha256: sha(clipA), bytes: clipA.length, durationSec: 5, codec: 'prores', width: 1920, height: 1080, fps: 25, day: 1 },
  { path: 'footage/A002_C001.mov', sha256: sha(clipB), bytes: clipB.length, durationSec: 7, codec: 'prores', width: 1920, height: 1080, fps: 25, day: 1 } ], audio: [] });
fs.mkdirSync(path.join(jobDir, 'footage'), { recursive: true });
fs.writeFileSync(path.join(jobDir, 'footage', 'A001_C001.mov'), clipA); fs.writeFileSync(path.join(jobDir, 'footage', 'A002_C001.mov'), clipB);
fs.mkdirSync(path.join(jobDir, 'bundle', 'broll'), { recursive: true }); fs.writeFileSync(path.join(jobDir, 'bundle', 'broll', 'rain-window.mp4'), 'mp4');
ok(run('set-state.js', ['acme', jobId, 'FINISHING', '--by', 'orchestrator']), 'FINISHING');
r = run('build-bundle.js', ['acme', jobId]); ok(r, 'build-bundle');
assert.ok(/version="1\.10"/.test(fs.readFileSync(path.join(jobDir, 'bundle', 'project.fcpxml'), 'utf8')), 'fcpxml 1.10');
const man = JSON.parse(fs.readFileSync(path.join(jobDir, 'bundle', '.pipeline', 'manifest.json'), 'utf8'));
assert.strictEqual(man.approvalId, 'A-1'); assert.ok(man.files.some(f => f.file === 'project.fcpxml') && man.files.some(f => f.file === 'broll/rain-window.mp4'), 'manifest indexes the bundle');
const readme = fs.readFileSync(path.join(jobDir, 'bundle', 'README.md'), 'utf8');
assert.ok(/V1: 2 cuts/.test(readme) && /rain-window.mp4/.test(readme) && /Late Night/.test(readme), 'README names the timeline and the bins');
ok(run('set-state.js', ['acme', jobId, 'PACKAGED', '--by', 'orchestrator']), 'PACKAGED');
ok(run('set-state.js', ['acme', jobId, 'AWAITING_GATE_B', '--by', 'orchestrator']), 'AWAITING_GATE_B');
r = run('record-approval.js', ['acme', jobId, 'B', 'release', '--by', 'lead', 'bundle/project.fcpxml', 'bundle/.pipeline/manifest.json']); ok(r, 'gate B');
assert.strictEqual(stateOf(jobDir), 'RELEASED');
ok(run('check-approval.js', ['acme', jobId, 'B']), 'gate B holds');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   runtime: set-root, scaffold, route (refused then ROUTED), plan (12 rows), states, versions + hash on the board, runs, collect, stage, approval -> state, tamper, bundle on the real packager, gate B');
console.log('runtime verification passed');