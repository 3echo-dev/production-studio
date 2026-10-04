#!/usr/bin/env node
// End-to-end: board-sync push, pull --gate, and the hash-mismatch refusal.
// Fixture workspace under a fresh tmp cwd; nothing under the plugin folder is touched.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const BOARD_SYNC = path.join(PLUGIN, 'scripts', 'board-sync.js');

const client = 'acme';
const jobId = 'job-20260915-fixture';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-e2e-'));
const jobDir = path.join(tmp, 'workspaces', client, 'jobs', jobId);
fs.mkdirSync(jobDir, { recursive: true });

// Fixture: job.json + a rough-edl.json blob.
fs.writeFileSync(path.join(jobDir, 'job.json'), JSON.stringify({
  schemaVersion: '1.0',
  jobId, client, title: 'Fixture', kind: 'postproduction',
  driveFolder: '/fake', prePipelineReleaseFolder: '/fake', aspectRatio: '16:9',
  deliverableDurationSec: 30, audioLed: false,
  approvers: { cut: 'creative-director', delivery: 'lead' },
  requestedAt: new Date().toISOString(),
}, null, 2));

const edlBytes = Buffer.from('{"schemaVersion":"1.0","cuts":[]}');
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), edlBytes);
const edlSha = crypto.createHash('sha256').update(edlBytes).digest('hex');

// Seed a gate decision in the file-backed board db as if a person approved on the board.
const dbDir = path.join(jobDir, '.board', 'db', 'gates');
fs.mkdirSync(dbDir, { recursive: true });
fs.writeFileSync(path.join(dbDir, 'gate-a.json'), JSON.stringify({
  gate: 'A', round: 1, decision: 'approved',
  artifacts: [{ path: 'rough-edl.json', sha256: edlSha, bytes: edlBytes.length }],
  decidedBy: 'creative-director',
  decidedAt: new Date().toISOString(),
  comment: 'looks good',
  _version: 1, _updatedAt: new Date().toISOString(),
}, null, 2));

function run(args, extra = {}) {
  return spawnSync(process.execPath, [BOARD_SYNC, ...args], { cwd: tmp, encoding: 'utf8', ...extra });
}

// 1. Clean pull writes approvals/gate-a.json
let r = run(['pull', '--gate', 'A', '--client', client, '--job', jobId]);
assert.strictEqual(r.status, 0, 'pull should succeed with matching hash. stderr:\n' + r.stderr);
const approvalPath = path.join(jobDir, 'approvals', 'gate-a.json');
assert.ok(fs.existsSync(approvalPath), 'approvals/gate-a.json should have been written');
const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
assert.strictEqual(approval.gate, 'A');
assert.strictEqual(approval.decision, 'approved');
assert.strictEqual(approval.artifacts[0].sha256, edlSha);

// 2. Tamper the EDL, pull again — must refuse with exit 1
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), Buffer.from('{"schemaVersion":"1.0","cuts":[{"order":1}]}'));
r = run(['pull', '--gate', 'A', '--client', client, '--job', jobId]);
assert.strictEqual(r.status, 1, 'pull must refuse on hash mismatch. stdout:\n' + r.stdout + '\nstderr:\n' + r.stderr);
assert.ok(/changed since decision/i.test(r.stderr), 'stderr should say changed since decision');

// 3. Push writes queued outbox to db
const outboxDir = path.join(jobDir, '.board');
fs.mkdirSync(outboxDir, { recursive: true });
fs.writeFileSync(path.join(outboxDir, 'outbox.jsonl'), JSON.stringify({
  collection: 'items', docId: 'sequence', data: { status: 'draft', version: 1 },
}) + '\n');
r = run(['push', client, jobId]);
assert.strictEqual(r.status, 0, 'push should succeed. stderr:\n' + r.stderr);
const itemDoc = JSON.parse(fs.readFileSync(path.join(jobDir, '.board', 'db', 'items', 'sequence.json'), 'utf8'));
assert.strictEqual(itemDoc.status, 'draft', 'push wrote the item doc');
assert.strictEqual(itemDoc._version, 1, 'first version is 1');
// Outbox drained.
assert.strictEqual(fs.readFileSync(path.join(jobDir, '.board', 'outbox.jsonl'), 'utf8'), '', 'outbox should be drained');

// 4. Version mismatch on push exits 1
fs.writeFileSync(path.join(outboxDir, 'outbox.jsonl'), JSON.stringify({
  collection: 'items', docId: 'sequence', data: { status: 'approved' }, ifVersion: 99,
}) + '\n');
r = run(['push', client, jobId]);
assert.strictEqual(r.status, 1, 'push with wrong ifVersion must exit 1. stderr:\n' + r.stderr);
assert.ok(/version mismatch/i.test(r.stderr), 'stderr should say version mismatch');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   board-sync: pull hash-binding, hash-mismatch refusal, push version-pin');
console.log('board-sync verification passed');
