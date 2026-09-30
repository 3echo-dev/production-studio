#!/usr/bin/env node
// A folder another studio/social plugin owns is not ours. The heartbeat and end-of-turn hooks
// gate on ws.foreignOwner(); this proves it, so creative-studio-post never drops a .board or warns
// about an unpushed outbox inside a Social Pipeline or cs-pre-production project. The mirror of
// social-pipeline's own siblingStudioRoot guard.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ws = require('../lib-workspace.js');

const mk = (dir, marker) => {
  fs.mkdirSync(path.join(dir, marker), { recursive: true });
  fs.writeFileSync(path.join(dir, marker, 'config.json'), JSON.stringify({ root: '.' }));
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-sibling-'));
try {
  // A Social Pipeline folder, and a cs-pre-production folder, are both foreign.
  const social = path.join(tmp, 'social'); fs.mkdirSync(social); mk(social, '.social-pipeline');
  assert.strictEqual(ws.foreignOwner(social), '.social-pipeline', 'social folder is foreign');

  const pre = path.join(tmp, 'pre'); fs.mkdirSync(pre); mk(pre, '.creative-studio-pipeline');
  assert.strictEqual(ws.foreignOwner(pre), '.creative-studio-pipeline', 'pre-prod folder is foreign');

  // Our own config wins even with a sibling marker beside it.
  const ours = path.join(tmp, 'ours'); fs.mkdirSync(ours);
  mk(ours, '.creative-studio-post'); mk(ours, '.creative-studio-pipeline');
  assert.strictEqual(ws.foreignOwner(ours), null, 'our own config wins');

  // A plain folder is not foreign.
  const plain = path.join(tmp, 'plain'); fs.mkdirSync(plain);
  assert.strictEqual(ws.foreignOwner(plain), null, 'no marker is not foreign');

  // The heartbeat hook, run in a foreign folder, must not create a .board there.
  const hb = path.resolve(__dirname, '..', 'hooks', 'heartbeat.js');
  const { spawnSync } = require('child_process');
  spawnSync(process.execPath, [hb], { cwd: social, encoding: 'utf8' });
  assert.ok(!fs.existsSync(path.join(social, '.board')), 'no .board dropped in a foreign folder');
  console.log('ok   the heartbeat hook drops no .board in a Social Pipeline folder');

  // In our own folder it does write the log.
  spawnSync(process.execPath, [hb], { cwd: ours, encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(ours, '.board', 'heartbeat.log')), 'heartbeat logs in our own folder');
  console.log('ok   the heartbeat hook still logs in our own folder');

  console.log('sibling-yield verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
