#!/usr/bin/env node
// Move a job to a new state. The only thing that writes status.md after scaffolding.
//
//   node set-state.js <client> <job-id> <STATE> --by <who> [--note "<text>"] [--notes-file <path>]
//        [--next "<one line>"] [--blocked "<who or what>"] [--json]
//
// Also queues the board: the project's status word and activity line, and the items this
// state works on as Working, so no director has to remember a second call.
// Exit 0 moved · 1 illegal transition or write failure · 2 usage · 3 job not found
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const json = argv.includes('--json');
const { client, jobId, dir, rest } = ws.resolveJobArgs(argv, argv);
const target = rest[0];
const by = flag('by');
if (!client || !jobId || !target || !by) {
  console.error('usage: set-state.js <client> <job-id> <STATE> --by <who> [--note "<text>"] [--notes-file <path>] [--next "<line>"] [--blocked "<text>"]');
  console.error('states: ' + states.ids().join(' '));
  process.exit(2);
}
if (!states.exists(target)) { console.error('"' + target + '" is not a state. Known states:\n  ' + states.ids().join(' ')); process.exit(2); }
const statusPath = path.join(dir, 'status.md');
if (!fs.existsSync(statusPath)) { console.error('No project at ' + ws.fwd(dir) + '. Check the client and job id, or scaffold it first.'); process.exit(3); }

const raw = fs.readFileSync(statusPath, 'utf8');
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
let text = raw.replace(/\r\n/g, '\n');
const field = name => { const m = text.match(new RegExp('\\*\\*' + name + ':\\*\\*\\s*`?([^`\\n]*)`?')); return m ? m[1].trim() : ''; };
const current = field('Current state');
if (current && !states.exists(current)) { console.error('status.md says the state is "' + current + '", which is not in the state table. Fix that line before moving on.'); process.exit(1); }
if (current && !states.canMove(current, target)) {
  console.error('cannot go from ' + current + ' to ' + target + '.');
  const allowed = states.get(current).next || [];
  console.error('From ' + states.label(current) + ' the job can go to: ' + (allowed.length ? allowed.join(', ') : 'nowhere, it is finished') + '.');
  process.exit(1);
}

const stamp = ws.now(client, argv);
const note = flag('notes-file') ? fs.readFileSync(flag('notes-file'), 'utf8').trim() : flag('note', '');
const setField = (name, value) => {
  const re = new RegExp('(\\*\\*' + name + ':\\*\\*\\s*)`?[^`\\n]*`?', '');
  if (re.test(text)) text = text.replace(re, '$1' + (name === 'Current state' ? '`' + value + '`' : value));
};
setField('Current state', target);
setField('Last updated', stamp);
setField('Next action', flag('next', states.sentence(target)));
setField('Blocked on', flag('blocked', states.isGate(target) || target === 'BLOCKED' || target === 'ESCALATED' ? 'You' : 'Nothing'));

const logHeader = /\| Timestamp \| From \| To \| By \| Note \|\n\|[-| ]+\|\n/;
const row = '| ' + [stamp, current || '-', '`' + target + '`', by, (note || states.label(target)).replace(/\|/g, '/').replace(/\n+/g, ' ')].join(' | ') + ' |\n';
if (logHeader.test(text)) {
  const start = text.search(logHeader);
  const after = start + text.match(logHeader)[0].length;
  let end = after;
  while (end < text.length) {
    const lineEnd = text.indexOf('\n', end);
    const line = text.slice(end, lineEnd === -1 ? text.length : lineEnd);
    if (!line.trim().startsWith('|')) break;
    end = (lineEnd === -1 ? text.length : lineEnd + 1);
  }
  text = text.slice(0, end) + row + text.slice(end);
} else {
  console.error('status.md has no stage log table; the transition was not recorded. Re-scaffold from templates/status.md.');
  process.exit(1);
}
if (note) {
  const m = text.match(/(\n## Notes\n)([\s\S]*)$/);
  if (m) {
    const keep = m[2].split('\n').filter(l => l.startsWith('**') && l.includes('CURRENT state')).join('\n');
    text = text.slice(0, m.index) + m[1] + (keep ? keep + '\n\n' : '\n') + note + '\n';
  } else text += '\n## Notes\n\n' + note + '\n';
}
fs.writeFileSync(statusPath, text.replace(/\n/g, nl));

// The board: status word and activity on the project card; Working on the items this state holds.
const cwd = process.cwd();
const iso = new Date().toISOString();
const status = states.boardStatusOf(target);
board.appendOutbox(cwd, client, jobId, { collection: 'projects', docId: jobId, op: 'update', data: { ...(status ? { status } : {}), activity: states.sentence(target), heartbeatAt: iso, updatedAt: iso } });
const delivered = new Set();
try { for (const l of fs.readFileSync(path.join(dir, 'versions.jsonl'), 'utf8').split(/\r?\n/)) if (l.trim()) delivered.add(JSON.parse(l).item); } catch { /* nothing delivered yet */ }
for (const item of states.itemsWorkedIn(target)) {
  if (delivered.has(item)) continue;
  board.appendOutbox(cwd, client, jobId, { collection: 'items', docId: item, op: 'update', data: { status: 'running', updatedBy: by, updatedAt: iso } });
}

const result = { client, job: jobId, from: current || null, to: target, label: states.label(target), sentence: states.sentence(target), gate: states.gateOf(target), at: stamp, boardStatus: status };
if (json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
console.log('Now: ' + states.sentence(target));
console.log('Queued for the board. Push next.');