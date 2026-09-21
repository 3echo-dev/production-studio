#!/usr/bin/env node
// Is the latest approval at a gate still valid for the artifacts as they are now?
//   node check-approval.js <client> <job-id> <A|B> [--json] [--human]
// Reads approvals/<gate>-<round>.json (record-approval.js) and approvals/gate-<g>.json
// (board-sync.js pull), latest round wins.
// Exit 0 hashes match · 1 mismatch (names the files) · 3 no approved record · 2 usage
const fs = require('fs');
const path = require('path');
const { hashFile } = require('./hash-artifact.js');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const { client, jobId: job, dir, rest: [gateArg] } = ws.resolveJobArgs(argv, argv);
const gate = String(gateArg || '').toUpperCase();
if (!client || !job || !['A', 'B'].includes(gate)) { console.error('usage: check-approval.js <client> <job-id> <A|B> [--json] [--human]'); process.exit(2); }

const apDir = path.join(dir, 'approvals');
let files = [];
try { files = fs.readdirSync(apDir).filter(f => new RegExp('^(' + gate + '-\\d+|gate-' + gate.toLowerCase() + ')\\.json$').test(f)); } catch {}
const recs = files.map(f => { try { const r = JSON.parse(fs.readFileSync(path.join(apDir, f), 'utf8')); return { ...r, _mtime: fs.statSync(path.join(apDir, f)).mtimeMs, _file: f }; } catch { return null; } })
  .filter(Boolean).sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0) || a._mtime - b._mtime);
const latest = recs[recs.length - 1];
const result = { gate, approvalId: latest ? latest.approvalId : null, decision: latest ? latest.decision : null, decidedBy: latest ? latest.decidedBy : null, artifacts: latest ? (latest.artifacts || []).map(a => a.path) : [], valid: false, changed: [], missing: [] };
if (!latest || latest.decision !== 'approved') {
  result.reason = latest ? 'latest record is ' + latest.decision : 'no approval record';
  if (json) console.log(JSON.stringify(result, null, 2)); else console.error('NO APPROVAL: ' + result.reason + ' for gate ' + gate);
  process.exit(3);
}
for (const a of latest.artifacts || []) {
  const p = path.join(dir, a.path);
  if (!fs.existsSync(p)) { result.missing.push(a.path); continue; }
  const h = hashFile(p);
  if (h.sha256 !== a.sha256) result.changed.push({ path: a.path, approved: String(a.sha256).slice(0, 12), now: h.sha256.slice(0, 12) });
}
result.valid = !result.changed.length && !result.missing.length;
if (json) console.log(JSON.stringify(result, null, 2));
else if (result.valid && argv.includes('--human')) console.log('Still the version you approved.');
else if (result.valid) console.log('ok: ' + latest.approvalId + ' still covers ' + (latest.artifacts || []).length + ' artifact(s), approved by ' + latest.decidedBy + ' at ' + latest.decidedAt);
else {
  for (const c of result.changed) console.error('CHANGED since approval: ' + c.path + ' (' + c.approved + ' -> ' + c.now + ')');
  for (const m of result.missing) console.error('MISSING since approval: ' + m);
  console.error('Re-present the changed artifact and ask for a new verdict. The approval ' + latest.approvalId + ' no longer applies.');
}
process.exit(result.valid ? 0 : 1);