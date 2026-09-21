#!/usr/bin/env node
// Scaffold one client workspace in a single call.
//   node scaffold-client.js <client-slug> [display name]
// Writes into the chosen root: workspaces/<client>/workspace.json, client/ (notes for the
// directors: colour direction, VO voice, house rules) and jobs/.
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const guards = require('./lib-guards.js');

const argv = process.argv.slice(2);
const pos = ws.positionals(argv);
const slug = (pos[0] || '').trim();
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('usage: scaffold-client.js <client-slug> [display name]   (slug: lowercase, hyphens)');
  process.exit(2);
}
const name = (pos.slice(1).join(' ') || slug).trim();
const badRoot = ws.refuseShootRoot(argv);
if (badRoot) { console.error(badRoot); process.exit(3); }
const dest = ws.wsDir(slug, argv);
if (fs.existsSync(dest)) { console.error('REFUSED: ' + ws.fwd(dest) + ' already exists. Edit it rather than overwriting.'); process.exit(1); }
const today = ws.now(slug, argv).slice(0, 10);
for (const d of [dest, path.join(dest, 'client'), path.join(dest, 'jobs')]) fs.mkdirSync(d, { recursive: true });

const cfg = {
  schemaVersion: '1.0', client: slug, name, status: 'active', timezone: 'Asia/Singapore',
  approvers: { cut: 'creative-director', delivery: 'lead' },
  createdAt: today,
};
fs.writeFileSync(path.join(dest, 'workspace.json'), JSON.stringify(cfg, null, 2) + '\n');
fs.writeFileSync(path.join(dest, 'client', 'notes.md'), [
  '# Post-production notes for ' + name, '',
  'What every director reads before a job for this client. Keep it to facts a person gave.', '',
  '## Colour', '', '- Grade brief or LUT: unknown', '- Who grades: unknown', '',
  '## Voice', '', '- VO voice preference: unknown', '- Language and accent: unknown', '',
  '## Music', '', '- Licensed library or client-supplied: unknown', '',
  '## Delivery', '', '- Editor and NLE: Premiere Pro', '- Handoff folder: unknown', '',
].join('\n'));

console.log('ready: ' + ws.fwd(dest) + '/  (workspace.json, client/notes.md, jobs/)');
console.log(guards.sentence(guards.arm(process.cwd()), ws.fwd));