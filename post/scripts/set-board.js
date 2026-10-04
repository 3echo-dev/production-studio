#!/usr/bin/env node
// Record which Post Control board this workspace talks to.
//
//   node set-board.js <artifact url>     writes boardUrl into <cwd>/.creative-studio-post/config.json
//   node set-board.js --show             prints the board in use and where it came from, exit 3 when none
//
// The board page ships with the plugin at board/post-control.html. Every account publishes its
// own copy (the `board-setup` skill does it with the Artifact tool, capabilities db, artifact
// and comments) and records the address here, so the pipeline never points at somebody else's
// private board. CREATIVE_STUDIO_POST_BOARD_URL in the environment wins over the config file.
// Without either, board-sync.js runs in file mode against .board/db/ (tests and offline work).
//
// Exit 0 done · 2 usage or not an artifact address · 3 no board set (--show)
const fs = require('fs');
const path = require('path');
const lib = require('./lib-board.js');

const argv = process.argv.slice(2);
const ARTIFACT = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{8,40})$/i;

if (argv.includes('--show')) {
  const c = lib.boardWithSource();
  if (!c) {
    console.log('No board is set for ' + lib.fwd(process.cwd()) + '. Publish one with the board-setup skill, then: node set-board.js <artifact url>');
    process.exit(3);
  }
  console.log(JSON.stringify(c));
  process.exit(0);
}

const url = argv.find(a => /^https?:/i.test(a));
if (!url) {
  console.error('usage: set-board.js <the artifact address the publish returned> | --show');
  process.exit(2);
}
const clean = url.replace(/[?#].*$/, '');
if (!ARTIFACT.test(clean)) {
  console.error('Not a claude.ai artifact address: ' + url + '. The board is an artifact published from board/post-control.html.');
  process.exit(2);
}
const cfgPath = path.join(process.cwd(), lib.CONFIG_DIR, lib.CONFIG_FILE);
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) || {}; } catch { /* first write */ }
fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
cfg.boardUrl = clean;
cfg.boardSetAt = new Date().toISOString();
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
console.log('Board recorded in ' + lib.fwd(cfgPath) + '. Every project in ' + lib.fwd(process.cwd()) + ' now opens on it.');