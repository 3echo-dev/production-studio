#!/usr/bin/env node
// An answer given to a person who wrote in an agent's chat has to land in that chat, not only
// in the board's comment thread. board-say.js queues it as a message from the agent, and the
// board draws a message from an agent as that agent's bubble.
//   node scripts/test/board-say.smoke.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'board-say.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'board-say-'));
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--root', tmp], { encoding: 'utf8' });
const ok = (name, fn) => { fn(); console.log('ok   ' + name); };

ok('an agent\'s answer is queued as a message from that agent, on its step', () => {
  const r = run('job-1', '--as', 'script-director', '--item', 'script', 'The cold open is one shot now.');
  assert.strictEqual(r.status, 0, r.stderr);
  const rows = fs.readFileSync(path.join(tmp, '.board', 'outbox.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'message');
  assert.deepStrictEqual(rows[0].payload, { key: 'job-1', by: 'script-director', text: 'The cold open is one shot now.', item: 'script' });
});
ok('a short name for the agent works, and the step is optional', () => {
  const r = run('job-1', '--as', 'producer', 'Both answers are in.');
  assert.strictEqual(r.status, 0, r.stderr);
  const rows = fs.readFileSync(path.join(tmp, '.board', 'outbox.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.strictEqual(rows[1].payload.by, 'orchestrator');
  assert.strictEqual(rows[1].payload.item, null);
});
ok('an unknown agent, an unknown step or no words queues nothing and exits 2', () => {
  const before = fs.readFileSync(path.join(tmp, '.board', 'outbox.jsonl'), 'utf8');
  for (const args of [['job-1', '--as', 'nobody', 'hello'], ['job-1', '--as', 'script-director', '--item', 'nothing', 'hello'], ['job-1', '--as', 'script-director']]) {
    const r = run(...args);
    assert.strictEqual(r.status, 2, 'exit 2 for ' + args.join(' '));
    assert.ok(/Nothing was queued/.test(r.stderr), 'it says nothing was queued');
  }
  assert.strictEqual(fs.readFileSync(path.join(tmp, '.board', 'outbox.jsonl'), 'utf8'), before);
});
ok('the board draws a message from an agent as that agent\'s bubble and asks the run for one', () => {
  const src = fs.readFileSync(path.join(ROOT, 'board', 'src', 'pre-production.html'), 'utf8');
  assert.ok(src.includes('function isAgentSeat('), 'the board knows an agent from a person');
  assert.ok(src.includes('board-say.js'), 'the bell asks for the answer in the chat');
});
console.log('board-say verification passed');
