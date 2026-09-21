#!/usr/bin/env node
// The Post Control board page and the artifact mode of board-sync.
//   - the shipped page is the build of its source (build-board.js --check)
//   - the page declares the post model: two gates, ten items, the runtime calls it needs
//   - set-board.js --show exits 3 in a fresh folder and records a valid artifact address
//   - with a board address set, push prints batches under projects/{job}/... and touches no db file
//   - land takes what the tool read back, materialises the gate, and pull binds it to the file hash
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
let ok;
const run = (script, args, opts = {}) => spawnSync(process.execPath, [S(script), ...args], { encoding: 'utf8', ...opts });

// 1. build check
let r = run('build-board.js', ['--check']);
assert.strictEqual(r.status, 0, 'shipped board must be the build of its source:\n' + r.stderr);

// 2. the page's model
const src = fs.readFileSync(path.join(PLUGIN, 'board', 'src', 'post-control.html'), 'utf8');
assert.ok(src.startsWith('<title>Post Control</title>'), 'page title');
for (const id of ['intake', 'ingest', 'sequence', 'bgm', 'vo_drop', 'sync', 'review', 'broll', 'mograph', 'package']) assert.ok(src.includes(`{id:'${id}'`), 'item ' + id);
assert.ok(/const GATES = \{\s*A:/.test(src) && src.includes("B:{name:'Delivery released'"), 'two gates A and B');
assert.ok(!/\n\s+C:\{name:/.test(src), 'no Gate C');
for (const call of ["claude.use('db')", "claude.use('comments')", "claude.use('artifact')", "claude.use('permissions')", 'sendToClaude', 'canSendToClaude', 'consentForComments', 'slateOrderFor', 'async function bellLog', "getElementById('__src')"]) assert.ok(src.includes(call), 'runtime call ' + call);
assert.ok(src.indexOf('await signalPipeline(') < src.indexOf("if(!await write(base, doc)) return;"), 'the slate form rings the bell before its writes');
for (const bad of ['call sheet', 'concept breakdown', 'shot list', 'creative-studio-pipeline']) assert.ok(!src.toLowerCase().includes(bad), 'no pre-prod skin: ' + bad);
const built = fs.readFileSync(path.join(PLUGIN, 'board', 'post-control.html'), 'utf8');
assert.ok(built.includes('<script type="text/plain" id="__src">'), 'built page embeds its source');

// 3. set-board in a fresh folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-board-'));
const env = Object.assign({}, process.env); delete env.CREATIVE_STUDIO_POST_BOARD_URL;
r = run('set-board.js', ['--show'], { cwd: tmp, env });
assert.strictEqual(r.status, 3, 'no board set yet');
r = run('set-board.js', ['https://example.com/not-an-artifact'], { cwd: tmp, env });
assert.strictEqual(r.status, 2, 'refuses a non-artifact address');
const URL = 'https://claude.ai/code/artifact/0f3b1c2d-1111-4222-8333-444455556666';
r = run('set-board.js', [URL + '?x=1'], { cwd: tmp, env });
assert.strictEqual(r.status, 0, 'records the address:\n' + r.stderr);
const cfg = JSON.parse(fs.readFileSync(path.join(tmp, '.creative-studio-post', 'config.json'), 'utf8'));
assert.strictEqual(cfg.boardUrl, URL, 'query string stripped');
r = run('set-board.js', ['--show'], { cwd: tmp, env });
assert.strictEqual(r.status, 0); assert.ok(r.stdout.includes(URL));

// 4. artifact-mode push prints batches, writes nothing to the db
const client = 'acme', jobId = 'job-20260921-fixture';
const jobDir = path.join(tmp, 'workspaces', client, 'jobs', jobId);
fs.mkdirSync(jobDir, { recursive: true });
fs.writeFileSync(path.join(jobDir, 'job.json'), JSON.stringify({ schemaVersion: '1.0', jobId, client, title: 'Fixture', kind: 'postproduction', driveFolder: '/f', prePipelineReleaseFolder: '/r', aspectRatio: '16:9', deliverableDurationSec: 30, audioLed: false, approvers: { cut: 'creative-director', delivery: 'lead' }, requestedAt: new Date().toISOString() }));
r = run('board-sync.js', ['open', client, jobId], { cwd: tmp, env });
assert.strictEqual(r.status, 0, 'open queues:\n' + r.stderr);
assert.ok(/Queued the project and 10 items/.test(r.stdout), 'open in artifact mode queues, does not write');
assert.ok(!fs.existsSync(path.join(jobDir, '.board', 'db')), 'no db file written in artifact mode');
const edl = Buffer.from('{"schemaVersion":"1.0","cuts":[{"order":1}]}');
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), edl);
const sha = crypto.createHash('sha256').update(edl).digest('hex');
fs.appendFileSync(path.join(jobDir, '.board', 'outbox.jsonl'), JSON.stringify({ collection: 'items', docId: 'sequence', op: 'update', data: { status: 'draft', version: 1, file: 'rough-edl.json', sha256: sha, bytes: edl.length }, ifVersion: 2 }) + '\n');
r = run('board-sync.js', ['push', client, jobId, '--json'], { cwd: tmp, env });
assert.strictEqual(r.status, 0, 'push prints:\n' + r.stderr);
const out = JSON.parse(r.stdout);
assert.strictEqual(out.url, URL);
assert.strictEqual(out.count, 12, 'project + 10 items + message; the sequence update folds into its item');
const seq = out.batches.flat().find(w => w.doc_id === 'sequence');
assert.strictEqual(seq.collection, 'projects/' + jobId + '/items');
assert.strictEqual(seq.op, 'update'); assert.strictEqual(seq.if_version, 2);
assert.ok(out.batches.flat().some(w => w.collection === 'projects' && w.doc_id === jobId), 'project doc at the root');
assert.ok(out.pins.some(p => p.doc_id === 'sequence' && !p.mayExist), 'an update is a hard pin');
assert.ok(fs.readFileSync(path.join(jobDir, '.board', 'outbox.jsonl'), 'utf8').length > 0, 'outbox kept until ack');
r = run('board-sync.js', ['adopt', client, jobId, '--from', 'night-shift-ab12'], { cwd: tmp, env }); ok = r.status === 0; assert.ok(ok, 'adopt queues:' + r.stderr);
assert.ok(fs.readFileSync(path.join(jobDir, '.board', 'outbox.jsonl'), 'utf8').includes('"docId":"night-shift-ab12","op":"update","data":{"status":"moved","movedTo":"' + jobId + '"'), 'adopt marks the slate card moved');
r = run('board-sync.js', ['adopt', client, jobId], { cwd: tmp, env }); assert.strictEqual(r.status, 2, 'adopt needs --from');
r = run('board-sync.js', ['push', client, jobId, '--ack'], { cwd: tmp, env });
assert.strictEqual(r.status, 0); assert.strictEqual(fs.readFileSync(path.join(jobDir, '.board', 'outbox.jsonl'), 'utf8'), '', 'ack drains');

// 5. land what the page wrote, then pull binds it
fs.mkdirSync(path.join(jobDir, '.board', 'landed'), { recursive: true });
const landed = [
  { collection: 'projects/' + jobId + '/gates', documents: [{ id: 'A', version: 1, status: 'passed', decidedBy: 'creative-director', decidedAt: '2026-09-21T10:00:00+08:00', round: 1, items: { sequence: { status: 'approved', version: 1, file: 'rough-edl.json', sha256: sha, bytes: edl.length }, bgm: { status: 'approved', version: 1, file: null, sha256: null } } }] },
  { collection: 'projects/' + jobId + '/inbox', documents: [{ id: 'q-1', version: 1, type: 'question', item: 'vo_drop', text: 'Final takes?', status: 'answered', answer: 'Take 2 everywhere', answeredBy: 'creative-director' }, { id: 'b-1', version: 2, type: 'generate', item: 'broll', shot: 'Rain window', text: 'B-roll: Rain window', status: 'open', credits: 6, approvedBy: 'creative-director' }] },
  { collection: 'projects/' + jobId + '/bgm', documents: [{ id: 'c2', version: 2, title: 'Night Drive', source: 'client', chosen: true, chosenBy: 'creative-director', chosenAt: '2026-09-21T09:00:00+08:00' }] },
];
const landedFile = path.join(jobDir, '.board', 'landed', 'read.json');
fs.writeFileSync(landedFile, JSON.stringify(landed));
r = run('board-sync.js', ['land', client, jobId, landedFile], { cwd: tmp, env });
assert.strictEqual(r.status, 0, 'land:\n' + r.stderr + r.stdout);
assert.ok(/gate A approved by creative-director/.test(r.stdout), 'gate landed: ' + r.stdout);
assert.ok(/request b-1 approved/.test(r.stdout), 'approved b-roll request reported');
assert.ok(/bgm choice landed/.test(r.stdout), 'bgm choice landed');
const choice = JSON.parse(fs.readFileSync(path.join(jobDir, '.board', 'bgm-choice.json'), 'utf8'));
assert.strictEqual(choice.candidateId, 'c2'); assert.strictEqual(choice.channel, 'board');
const signed = JSON.parse(fs.readFileSync(path.join(jobDir, 'bgm-choice.json'), 'utf8'));
assert.strictEqual(signed.signedBy, 'creative-director', 'root bgm-choice.json is signed for gate-a-check');
assert.ok(fs.readFileSync(path.join(jobDir, '.board', 'inbox.jsonl'), 'utf8').includes('Take 2 everywhere'), 'inbox projected');
r = run('board-sync.js', ['pull', client, jobId, '--gate', 'A'], { cwd: tmp, env });
assert.strictEqual(r.status, 0, 'pull binds the landed gate:\n' + r.stderr + r.stdout);
const approval = JSON.parse(fs.readFileSync(path.join(jobDir, 'approvals', 'gate-a.json'), 'utf8'));
assert.strictEqual(approval.artifacts.length, 1, 'only items with a file are bound');
assert.strictEqual(approval.artifacts[0].sha256, sha);
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), '{"tampered":true}');
r = run('board-sync.js', ['pull', client, jobId, '--gate', 'A'], { cwd: tmp, env });
assert.strictEqual(r.status, 1, 'tamper after the lock is refused');

// 6. land from a folder shaped like ArtifactData out_dir: <dir>/<collection>/<id>.json with {id,data,version}
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), edl);
const od = path.join(jobDir, '.board', 'landed', 'stamp2');
fs.mkdirSync(path.join(od, 'projects', jobId, 'gates'), { recursive: true });
fs.mkdirSync(path.join(od, 'projects', jobId, 'inbox'), { recursive: true });
fs.writeFileSync(path.join(od, 'projects', jobId, 'gates', 'A.json'), JSON.stringify({ id: 'A', data: { status: 'passed', decidedBy: 'lead', decidedAt: '2026-09-21T11:00:00+08:00', round: 2, items: { sequence: { status: 'approved', version: 2, file: 'rough-edl.json', sha256: sha, bytes: edl.length } } }, version: 3, updatedAt: '2026-09-21T03:00:00Z' }));
fs.writeFileSync(path.join(od, 'projects', jobId, 'inbox', 'q-2.json'), JSON.stringify({ id: 'q-2', data: { type: 'question', item: 'bgm', text: 'Tempo?', status: 'answered', answer: 'Slow', answeredBy: 'lead' }, version: 1 }));
r = run('board-sync.js', ['land', client, jobId, od], { cwd: tmp, env });
assert.strictEqual(r.status, 0, 'land from a folder:' + String.fromCharCode(10) + r.stderr + r.stdout);
assert.ok(/gate A approved by lead/.test(r.stdout), 'folder-landed gate: ' + r.stdout);
assert.ok(/question q-2 answered -> Slow/.test(r.stdout), 'folder-landed inbox: ' + r.stdout);
const g2 = JSON.parse(fs.readFileSync(path.join(jobDir, '.board', 'db', 'gates', 'gate-a.json'), 'utf8'));
assert.strictEqual(g2.boardVersion, 3, 'board version kept'); assert.strictEqual(g2.round, 2);
r = run('board-sync.js', ['pull', client, jobId, '--gate', 'A'], { cwd: tmp, env });
assert.strictEqual(r.status, 0, 'pull after folder land:' + String.fromCharCode(10) + r.stderr + r.stdout);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(jobDir, 'approvals', 'gate-a.json'), 'utf8')).decidedBy, 'lead');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   board-page: build check, post model, set-board, artifact-mode push/ack, land (file + out_dir folder) + hash-bound pull');
console.log('board-page verification passed');