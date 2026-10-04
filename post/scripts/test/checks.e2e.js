#!/usr/bin/env node
// End-to-end: ingest-check refuses orphans; gate-a-check refuses unsigned BGM and
// mismatched EDL hash. Fixture workspace under a fresh tmp cwd.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const INGEST = path.join(PLUGIN, 'scripts', 'ingest-check.js');
const GATEA = path.join(PLUGIN, 'scripts', 'gate-a-check.js');

const client = 'acme';
const jobId = 'job-20260915-fixture';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-checks-'));
const jobDir = path.join(tmp, 'workspaces', client, 'jobs', jobId);
fs.mkdirSync(jobDir, { recursive: true });

function run(script, args = []) {
  return spawnSync(process.execPath, [script, client, jobId, ...args], { cwd: tmp, encoding: 'utf8' });
}
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// -------------- INGEST-CHECK --------------
// Fixture: one real clip on disk + one manifest entry pointing at it.
const clipBytes = Buffer.from('FAKE-CLIP-BYTES');
const clipPath = path.join(jobDir, 'footage', 'day-01', 'A001_C001.mov');
fs.mkdirSync(path.dirname(clipPath), { recursive: true });
fs.writeFileSync(clipPath, clipBytes);
const clipSha = sha(clipBytes);

const manifest = {
  schemaVersion: '1.0', jobId, createdAt: new Date().toISOString(),
  clips: [{
    path: 'footage/day-01/A001_C001.mov', sha256: clipSha, bytes: clipBytes.length,
    durationSec: 5.0, codec: 'prores', width: 1920, height: 1080, fps: 25, day: 1,
  }],
  audio: [],
};
fs.writeFileSync(path.join(jobDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

let r = run(INGEST);
assert.strictEqual(r.status, 0, 'ingest-check should pass with real file. stderr:\n' + r.stderr);

// Delete the file — must exit 3
fs.unlinkSync(clipPath);
r = run(INGEST);
assert.strictEqual(r.status, 3, 'ingest-check must exit 3 on missing file. stderr:\n' + r.stderr);
assert.ok(/file missing/.test(r.stderr), 'stderr names missing file');

// Restore the file but change its bytes — sha mismatch
fs.writeFileSync(clipPath, Buffer.from('TAMPERED'));
r = run(INGEST);
assert.strictEqual(r.status, 3, 'ingest-check must exit 3 on size or sha mismatch. stderr:\n' + r.stderr);

// -------------- GATE-A-CHECK --------------
// Missing everything
r = run(GATEA);
assert.strictEqual(r.status, 3, 'gate-a-check refuses missing artefacts. stderr:\n' + r.stderr);
assert.ok(/rough-edl\.json: missing/.test(r.stderr));

// Add rough-edl.json
const edlBytes = Buffer.from('{"schemaVersion":"1.0","cuts":[]}');
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), edlBytes);
const edlSha = sha(edlBytes);

// Add synced-track.json with correct hash but missing bgm-choice
fs.writeFileSync(path.join(jobDir, 'synced-track.json'), JSON.stringify({
  schemaVersion: '1.0', jobId, version: 1,
  picture: { edlPath: 'rough-edl.json', edlSha256: edlSha, totalDurationSec: 30 },
  vo: [], bgm: { choiceId: 'x', choicePath: 'x', duckDb: -12 }, sfx: [],
  output: { wavPath: 'bundle/audio/synced-track.wav', wavSha256: 'a'.repeat(64), waveformPngPath: 'bundle/audio/waveform.png' },
}, null, 2));

r = run(GATEA);
assert.strictEqual(r.status, 3, 'gate-a-check refuses without bgm-choice. stderr:\n' + r.stderr);
assert.ok(/bgm-choice\.json: missing/.test(r.stderr));

// Add unsigned bgm-choice
fs.writeFileSync(path.join(jobDir, 'bgm-choice.json'), JSON.stringify({ id: 'bgm-1' }));
r = run(GATEA);
assert.strictEqual(r.status, 3, 'gate-a-check refuses unsigned bgm-choice. stderr:\n' + r.stderr);
assert.ok(/unsigned/.test(r.stderr));

// Sign the bgm-choice
fs.writeFileSync(path.join(jobDir, 'bgm-choice.json'), JSON.stringify({
  id: 'bgm-1', signedBy: 'creative-director', signedAt: new Date().toISOString(),
}));
r = run(GATEA);
assert.strictEqual(r.status, 0, 'gate-a-check passes with signed BGM and matching hash. stderr:\n' + r.stderr);

// Tamper EDL — hash mismatch
fs.writeFileSync(path.join(jobDir, 'rough-edl.json'), Buffer.from('{"schemaVersion":"1.0","cuts":[{"order":1}]}'));
r = run(GATEA);
assert.strictEqual(r.status, 3, 'gate-a-check refuses EDL hash mismatch. stderr:\n' + r.stderr);
assert.ok(/does not match current EDL/.test(r.stderr));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   ingest-check refuses orphans; gate-a-check refuses unsigned BGM and EDL drift');
console.log('checks verification passed');
