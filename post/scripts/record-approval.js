#!/usr/bin/env node
// Record a human verdict at a gate, bound to the artifacts' content hashes at decision time.
//
//   node record-approval.js <client> <job-id> <A|B> <approve|edit|change|start over> --by "creative-director"
//        [--comment "..."] [--decided-at "<board time>"] [--channel chat|board|file] [--from-chat]
//        <file-relative-to-job...>
//
// Writes approvals/<gate>-<round>.json validated against schemas/approval.schema.json and moves
// the state: approve or edit -> the gate's passed state; change -> CHANGES_REQUESTED; start over
// -> the gate's rollback. --from-chat also queues the verdict as a council message so the board
// stops asking. Exit 0 ok · 1 refused · 2 usage
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { hashFile } = require('./hash-artifact.js');
const { validate } = require('./validate-schema.js');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const pos = [], opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); if (['from-chat', 'from-board', 'human'].includes(k)) opts[k] = true; else opts[k] = argv[++i]; }
  else pos.push(a);
}
const GATES = ['A', 'B'];
const SYNONYMS = {
  approve: 'approve', approved: 'approve', ok: 'approve', yes: 'approve', go: 'approve', ship: 'approve', lock: 'approve', release: 'approve',
  edit: 'edit',
  change: 'change', changes: 'change', update: 'change', revise: 'change', fix: 'change',
  'start-over': 'start over', startover: 'start over', reject: 'start over', no: 'start over', redo: 'start over',
};
const VERDICTS = { approve: 'approved', edit: 'approved', change: 'changes_requested', 'start over': 'rejected' };
module.exports = { GATES, SYNONYMS, VERDICTS };
if (require.main !== module) return;

const { client, jobId: job, dir, rest } = ws.resolveJobArgs(pos, argv);
const [gate, rawVerdict, ...files] = rest;
const verdict = SYNONYMS[String(rawVerdict || '').toLowerCase()] || rawVerdict;
const missing = [];
if (!client) missing.push('the client');
if (!job) missing.push('the job id');
if (!GATES.includes(gate)) missing.push('a gate (A or B)' + (gate ? ', not "' + gate + '"' : ''));
if (!VERDICTS[verdict]) missing.push('a verdict (approve, edit, change, start over)' + (rawVerdict ? ', not "' + rawVerdict + '"' : ''));
if (!opts.by) missing.push('--by "role"');
if (!files.length) missing.push('at least one file, relative to the job folder');
if (missing.length) {
  console.error('Nothing was recorded. This call needs ' + missing.join('; ') + '.');
  console.error('usage: record-approval.js <client> <job-id> <A|B> <approve|edit|change|start over> --by "role" [--comment "..."] [--decided-at "<time>"] [--channel chat|board|file] [--from-chat] <file...>');
  process.exit(2);
}
const apDir = path.join(dir, 'approvals');
fs.mkdirSync(apDir, { recursive: true });
const prev = fs.readdirSync(apDir).filter(f => new RegExp('^' + gate + '-\\d+\\.json$').test(f)).map(f => +f.slice(gate.length + 1, -5)).sort((a, b) => a - b);
const round = (prev[prev.length - 1] || 0) + 1;
const artifacts = [];
for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.error('Nothing was recorded. Missing artifact: ' + f + ' (looked in ' + ws.fwd(dir) + ').'); process.exit(1); }
  const h = hashFile(p);
  artifacts.push({ path: f.split(path.sep).join('/'), sha256: h.sha256, bytes: h.bytes });
}
const when = opts['decided-at'] || ws.now(client, process.argv);
const rec = {
  schemaVersion: '1.0', approvalId: gate + '-' + round, jobId: job, client, gate, round,
  decision: VERDICTS[verdict], edited: verdict === 'edit', artifacts,
  decidedBy: opts.by, decidedAt: when,
  channel: opts.channel === 'file' ? 'file' : (opts.channel === 'board' || opts['from-board'] ? 'board' : 'chat'),
  comment: opts.comment || '',
  scope: { maxSpendCredits: null },
  supersedes: prev.length ? gate + '-' + prev[prev.length - 1] : null,
};
const errs = validate(JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'approval.schema.json'), 'utf8')), rec);
if (errs.length) { console.error('record fails schema: ' + errs.map(e => e.path + ' ' + e.message).join('; ')); process.exit(1); }
const out = path.join(apDir, rec.approvalId + '.json');
fs.writeFileSync(out, JSON.stringify(rec, null, 2) + '\n');
if (opts.human) console.log(({ approved: 'Approved', changes_requested: 'Noted, changes wanted', rejected: 'Starting that over' })[rec.decision] + (rec.edited ? ', with your edits' : '') + '.');
else { console.log(rec.decision + (rec.edited ? ' (edited)' : '') + ': ' + ws.fwd(out)); for (const a of artifacts) console.log('  ' + a.sha256.slice(0, 12) + '  ' + a.path); }

if (opts['from-chat']) {
  const board = require('./lib-board.js');
  board.appendOutbox(process.cwd(), client, job, { collection: 'messages', docId: 'm-' + Date.now().toString(36), data: { by: rec.decidedBy, text: 'Gate ' + gate + ': ' + rec.decision.replace('_', ' ') + ' in chat' + (rec.comment ? '. ' + rec.comment : '.'), item: null, at: new Date().toISOString() } });
}

const target = rec.decision === 'approved' ? states.APPROVED_STATE[gate]
  : (rec.decision === 'changes_requested' ? 'CHANGES_REQUESTED' : states.rollbackOf(states.AWAITING_STATE[gate]));
const note = rec.decision === 'approved' ? 'Approved by ' + rec.decidedBy + (rec.comment ? ': ' + rec.comment : '') : (rec.comment || 'Sent back by ' + rec.decidedBy);
const move = spawnSync(process.execPath,
  [path.join(__dirname, 'set-state.js'), client, job, target, '--by', rec.decidedBy, '--note', note].concat(argv.includes('--root') ? ['--root', argv[argv.indexOf('--root') + 1]] : []),
  { encoding: 'utf8' });
if (move.status === 0) process.stdout.write(move.stdout);
else if (move.status === 3) console.error('Recorded. There is no status.md for this job, so nothing was moved to ' + target + '.');
else {
  console.error('The decision was recorded, but the job could not be moved to ' + target + ':');
  console.error((move.stderr || '').trim());
  console.error('Move it with: set-state.js ' + client + ' ' + job + ' ' + target + ' --by "' + rec.decidedBy + '"');
  process.exit(1);
}