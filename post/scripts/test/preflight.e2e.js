#!/usr/bin/env node
// preflight-generation spend guard: no request = exit 3; unsigned = exit 3; over ceiling = exit 1;
// clean signed request under ceiling = exit 0.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const PREFLIGHT = path.join(PLUGIN, 'scripts', 'preflight-generation.js');

const client = 'acme';
const jobId = 'job-20260915-fixture';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-pf-'));
const jobDir = path.join(tmp, 'workspaces', client, 'jobs', jobId);
fs.mkdirSync(jobDir, { recursive: true });

function run(n, kind = 'broll') {
  return spawnSync(process.execPath, [PREFLIGHT, client, jobId, String(n), '--kind', kind], { cwd: tmp, encoding: 'utf8' });
}

// 1. No request = exit 3
let r = run(1);
assert.strictEqual(r.status, 3, 'no request must exit 3. stderr:\n' + r.stderr);

// 2. Unsigned request = exit 3
const reqDir = path.join(jobDir, 'broll-requests');
fs.mkdirSync(reqDir);
fs.writeFileSync(path.join(reqDir, '1.json'), JSON.stringify({
  shot: 'walking on road', durationSec: 3, aspectRatio: '16:9', status: 'open',
}));
r = run(1);
assert.strictEqual(r.status, 3, 'unsigned must exit 3. stderr:\n' + r.stderr);

// 3. Signed + under ceiling = exit 0
fs.writeFileSync(path.join(reqDir, '1.json'), JSON.stringify({
  shot: 'walking on road', durationSec: 3, aspectRatio: '16:9', status: 'open',
  signedBy: 'creative-director', signedAt: new Date().toISOString(),
}));
r = run(1);
assert.strictEqual(r.status, 0, 'signed under ceiling must exit 0. stderr:\n' + r.stderr);

// 4. Already-delivered = exit 3
fs.writeFileSync(path.join(reqDir, '1.json'), JSON.stringify({
  shot: 'walking on road', durationSec: 3, aspectRatio: '16:9', status: 'delivered',
  signedBy: 'creative-director', signedAt: new Date().toISOString(),
}));
r = run(1);
assert.strictEqual(r.status, 3, 'delivered must exit 3. stderr:\n' + r.stderr);

// 5. Over ceiling = exit 1
fs.writeFileSync(path.join(jobDir, 'status.md'), 'credits_spent: 119\n');
fs.writeFileSync(path.join(reqDir, '2.json'), JSON.stringify({
  shot: 'city timelapse', durationSec: 12, aspectRatio: '16:9', status: 'open',
  signedBy: 'creative-director', signedAt: new Date().toISOString(),
}));
r = run(2);
assert.strictEqual(r.status, 1, 'over ceiling must exit 1. stderr:\n' + r.stderr);
assert.ok(/ceiling/.test(r.stderr));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   preflight: no-request/unsigned/delivered → 3, over-ceiling → 1, clean → 0');
console.log('preflight verification passed');
