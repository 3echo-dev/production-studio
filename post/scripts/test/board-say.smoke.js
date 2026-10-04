#!/usr/bin/env node
// The post side's board-say.js: an agent's answer lands in the job outbox as a message from that
// agent, a slate project gets the write printed, and bad input queues nothing.
//   node scripts/test/board-say.smoke.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'board-say.js');
const lib = require(path.join(ROOT, 'scripts', 'lib-board.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'post-board-say-'));
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: tmp, encoding: 'utf8' });
const ok = (name, fn) => { fn(); console.log('ok   ' + name); };
const rows = () => fs.readFileSync(lib.outboxPath(tmp, 'acme', 'job-1'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

ok('an agent\'s answer is queued as a message from that agent, on its step', () => {
  const r = run('acme', 'job-1', '--as', 'bgm-supervisor', '--item', 'bgm', 'Three candidates are on the board.');
  assert.strictEqual(r.status, 0, r.stderr);
  const [row] = rows();
  assert.strictEqual(row.collection, 'messages');
  assert.deepStrictEqual({ by: row.data.by, text: row.data.text, item: row.data.item }, { by: 'bgm-supervisor', text: 'Three candidates are on the board.', item: 'bgm' });
});
ok('a short name works and the step is optional', () => {
  const r = run('acme', 'job-1', '--as', 'producer', 'Both answers are in.');
  assert.strictEqual(r.status, 0, r.stderr);
  const row = rows()[1];
  assert.strictEqual(row.data.by, 'orchestrator');
  assert.strictEqual(row.data.item, null);
});
ok('a slate project gets the write printed for ArtifactData, nothing queued', () => {
  const before = fs.readFileSync(lib.outboxPath(tmp, 'acme', 'job-1'), 'utf8');
  const r = run('--slate', 'late-again-x1', '--as', 'orchestrator', 'Type go ahead in the chat.');
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.split(/\r?\n/).find(l => l.startsWith('{')));
  assert.strictEqual(out.writes[0].collection, 'projects/late-again-x1/messages');
  assert.strictEqual(out.writes[0].data.by, 'orchestrator');
  assert.strictEqual(fs.readFileSync(lib.outboxPath(tmp, 'acme', 'job-1'), 'utf8'), before);
});
ok('an unknown agent, an unknown step or no words queues nothing and exits 2', () => {
  const before = fs.readFileSync(lib.outboxPath(tmp, 'acme', 'job-1'), 'utf8');
  for (const args of [['acme', 'job-1', '--as', 'nobody', 'hello'], ['acme', 'job-1', '--as', 'audio-engineer', '--item', 'nothing', 'hello'], ['acme', 'job-1', '--as', 'audio-engineer']]) {
    const r = run(...args);
    assert.strictEqual(r.status, 2, 'exit 2 for ' + args.join(' '));
    assert.ok(/Nothing was queued/.test(r.stderr));
  }
  assert.strictEqual(fs.readFileSync(lib.outboxPath(tmp, 'acme', 'job-1'), 'utf8'), before);
});
console.log('post board-say verification passed');
