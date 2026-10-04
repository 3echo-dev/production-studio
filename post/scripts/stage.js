#!/usr/bin/env node
// Say which stage is running, at the start and the end of every workflow row.
//
//   node stage.js <client> <job-id> <stage> running|done|waiting [--substep "First cut"] [--agents "sequence-director"]
//
// A workflow row is not a state: ingest runs for minutes inside one state and the card would
// read the same throughout. This queues the activity line on the project card (the slate
// shows it with a Working pill). Stages are the board's own words: intake, picture, audio,
// gate_a, finish, gate_b, released. Nothing here fails the caller. Exit 0 · 2 usage
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const STAGES = ['intake', 'picture', 'audio', 'gate_a', 'finish', 'gate_b', 'released'];
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const { client, jobId, rest } = ws.resolveJobArgs(argv, argv);
const [stage, said] = rest;
const status = { running: 'running', working: 'running', started: 'running', done: 'done', finished: 'done', waiting: 'waiting', blocked: 'waiting' }[String(said || '').toLowerCase()];
if (!client || !jobId || !STAGES.includes(stage) || !status) {
  console.error('usage: stage.js <client> <job-id> <' + STAGES.join('|') + '> running|done|waiting [--substep "<line>"] [--agents "a,b"]');
  process.exit(2);
}
const substep = flag('substep', '');
const agents = String(flag('agents', '')).split(',').map(s => s.trim()).filter(Boolean);
const word = { intake: 'Intake', picture: 'Picture', audio: 'Audio', gate_a: 'Gate A', finish: 'Finish', gate_b: 'Gate B', released: 'Released' }[stage];
const activity = word + (substep ? ' · ' + substep : '') + ' · ' + (status === 'running' ? 'working' : status) + (agents.length ? ' · ' + agents.join(', ') : '');
const iso = new Date().toISOString();
try {
  board.appendOutbox(process.cwd(), client, jobId, { collection: 'projects', docId: jobId, op: 'update', data: { activity, heartbeatAt: iso } });
  console.log('Board: ' + activity);
} catch { /* the board is never allowed to fail the work it reports on */ }