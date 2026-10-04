#!/usr/bin/env node
// The spend hook on a generated job: create_video_job is refused without the scope's approval in
// generation-brief.json, allowed with it, and refused again once every panel has a clip.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
(async () => {
  const hooks = await import('file://' + path.resolve(__dirname, '..', '..', 'hooks', 'hooks.mjs').replace(/\\/g, '/'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-hook-gen-'));
  const brief = p => fs.writeFileSync(path.join(tmp, 'generation-brief.json'), JSON.stringify(p));
  const call = () => hooks.refuseBrollWithoutRequest({ command: 'create_video_job', cwd: tmp });
  brief({ panels: [{ id: 'P01', status: 'pending' }, { id: 'P02', status: 'pending' }], approvals: {} });
  assert.match(call(), /no sample approval/);
  brief({ panels: [{ id: 'P01', status: 'pending' }, { id: 'P02', status: 'pending' }], approvals: { sample: { by: 'creative-director', at: 'now' } } });
  assert.strictEqual(call(), null, 'sample approved: allowed');
  brief({ panels: [{ id: 'P01', status: 'delivered' }, { id: 'P02', status: 'pending' }], approvals: { sample: { by: 'creative-director', at: 'now' } } });
  assert.match(call(), /no batch approval/);
  brief({ panels: [{ id: 'P01', status: 'delivered' }, { id: 'P02', status: 'pending' }], approvals: { sample: { by: 'x', at: 'now' }, batch: { by: 'creative-director', at: 'now' } } });
  assert.strictEqual(call(), null, 'batch approved: allowed');
  brief({ panels: [{ id: 'P01', status: 'delivered' }, { id: 'P02', status: 'delivered' }], approvals: { sample: { by: 'x', at: 'now' }, batch: { by: 'x', at: 'now' } } });
  assert.match(call(), /every panel already has a clip/);
  console.log('ok   hook: generated job spend guarded by generation-brief.json approvals');
})().catch(e => { console.error(e); process.exit(1); });