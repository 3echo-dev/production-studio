#!/usr/bin/env node
// Choose where projects and clients are saved.
//   node set-root.js <folder>               write the setting (and arm the guards)
//   node set-root.js                        show what is in use now
//   node set-root.js <folder> --no-guards   skip the settings.json line
//
// Writes .creative-studio-post/config.json in the current folder. Scripts read it from the
// nearest ancestor of wherever they run, so this only has to be done once per project.
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const guards = require('./lib-guards.js');

const argv = process.argv.slice(2);
const target = ws.positionals(argv)[0];

if (!target) {
  const { path: p, source } = ws.rootWithSource();
  const clients = ws.listClients();
  console.log('Projects and clients are saved in ' + ws.fwd(ws.clientsDir()) + '.');
  console.log('That comes from: ' + source + '.');
  console.log(clients.length ? 'Clients here: ' + clients.join(', ') : 'No clients here yet.');
  const marks = ws.shootMarks(p);
  if (marks.length) console.log('WARNING: that is the shoot folder (it holds ' + marks.join(', ') + '). Scaffolding there is refused; set-root.js <folder> from outside it first.');
  console.log(guards.peek(process.cwd()) ? 'The guards are on, so a spend without an approval on disk is refused.' : 'The guards are off, so a spend or a stray write is a rule rather than a refusal.');
  console.log('');
  console.log('To change it: set-root.js <folder>');
  process.exit(0);
}

const abs = path.resolve(target);
if (fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) { console.error(ws.fwd(abs) + ' is a file, not a folder.'); process.exit(2); }
const marks = ws.shootMarks(abs);
if (marks.length) {
  console.error('REFUSED: ' + ws.fwd(abs) + ' is the shoot folder (it holds ' + marks.join(', ') + '). The pipeline never writes beside the footage. Name a folder of its own. Nothing was changed.');
  process.exit(3);
}
try { fs.mkdirSync(path.join(abs, 'workspaces'), { recursive: true }); }
catch (e) { console.error('Could not create ' + ws.fwd(abs) + ': ' + e.message); process.exit(1); }

const dir = path.join(process.cwd(), ws.CONFIG_DIR);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, ws.CONFIG_FILE);
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first time */ }
const rel = path.relative(process.cwd(), abs);
cfg.root = (!rel.startsWith('..') && !path.isAbsolute(rel)) ? (rel || '.') : abs;
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');

console.log('Projects and clients will be saved in ' + ws.fwd(abs) + '.');
if (process.env.CREATIVE_STUDIO_POST_ROOT) console.log('Note: CREATIVE_STUDIO_POST_ROOT is set in this shell and wins over this setting until you unset it.');
if (argv.includes('--no-guards')) console.log('The guards were left alone, as asked.');
else console.log(guards.sentence(guards.arm(process.cwd()), ws.fwd));