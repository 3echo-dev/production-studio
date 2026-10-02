#!/usr/bin/env node
// Say something in an agent's chat on the board.
//
//   node board-say.js <job-id> --as <agent> [--item <step>] "<what the agent says>"
//
// A person who writes in an agent's chat was answered in the board's comment thread, where
// nobody looks for it: the page can post comments but cannot read them. This queues the same
// answer as a board message from that agent, so it appears as the agent's bubble in the chat
// the person wrote in and is kept with the project. `board-sync.js push` delivers it.
//
// --as is the agent speaking (orchestrator, script-director, ...; the usual short names work).
// --item is the step the answer is about (script, storyboard, ...); leave it out for the
// orchestrator or for an answer about no step in particular.
//
// Exit 0 queued · 2 usage, an unknown agent or an unknown step
const board = require('./lib-board.js');
const roles = require('./lib-roles.js');

const ITEMS = ['intake', 'scraper', 'script', 'storyboard', 'shot_list', 'budget_sheet', 'timeline', 'audio', 'talents', 'props', 'locations', 'concept_breakdown', 'call_sheet'];
const argv = process.argv.slice(2);
const valueOf = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const VALUE = ['--as', '--item', '--root'];
const rest = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { if (VALUE.includes(argv[i])) i++; continue; } rest.push(argv[i]); }
const [job, ...words] = rest;
const text = words.join(' ').trim();
const said = String(valueOf('--as') || '').trim().toLowerCase();
const seat = roles.ROLES[said] ? said : roles.ALIASES[said];
const item = valueOf('--item');

function refuse(why) {
  console.error(why + '\nusage: board-say.js <job-id> --as <agent> [--item <step>] "<what the agent says>"\nNothing was queued.');
  process.exit(2);
}
if (!job || !text) refuse('A job id and the words to say are both needed.');
if (!seat) refuse('Unknown agent "' + (valueOf('--as') || '') + '". Use one of: ' + Object.keys(roles.ROLES).join(', ') + '.');
if (item && !ITEMS.includes(item)) refuse('Unknown step "' + item + '". Use one of: ' + ITEMS.join(', ') + '.');

board.call('message', { key: job, by: seat, text, item: item || null }, { argv: process.argv }).then(() => {
  console.log('Queued for the board: ' + roles.ROLES[seat].label + ' says it in the chat' + (item ? ' on ' + item : '') + '. Deliver it with board-sync.js push.');
}).catch(e => { console.error('Could not queue the message: ' + (e && e.message || e)); process.exit(1); });
