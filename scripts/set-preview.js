#!/usr/bin/env node
// Attach a rendered preview to an item's card on the board. The MP4 is uploaded to the board
// artifact's asset store by the orchestrator (Artifact tool, asset: true) and the url it gets
// back (/_blob/<id>, which resolves in every view) is what the card plays; the filmstrip stays as the poster.
//
//   node set-preview.js <client> <job-id> --item sequence|sync --video-url <url> [--asset-id <id>]
//        [--strip previews/cut-v1-strip.png] [--caption "..."]
//
// Exit 0 queued · 2 usage · 3 strip missing
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
const item = opt('--item'), url = opt('--video-url');
if (!client || !jobId || !item || !url || !/^(https:\/\/|\/_blob\/)/.test(url)) { console.error('usage: set-preview.js <client> <job-id> --item <item> --video-url </_blob/<id> or https url> [--asset-id <id>] [--strip <png>] [--caption "..."]'); process.exit(2); }
const data = { video: url, updatedAt: new Date().toISOString() };
if (opt('--asset-id')) data.assetId = opt('--asset-id');
if (opt('--caption')) data.caption = opt('--caption');
const strip = opt('--strip');
if (strip) {
  const p = path.join(dir, strip);
  if (!fs.existsSync(p)) { console.error(strip + ' is not there.'); process.exit(3); }
  if (fs.statSync(p).size > 200 * 1024) { console.error(strip + ' is over 200 KB; the board card cannot carry it.'); process.exit(3); }
  data.thumb = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
}
board.appendOutbox(process.cwd(), client, jobId, { collection: 'previews', docId: item, op: 'update', data });
console.log('Preview video attached to ' + item + ' on the board (queued). Push next.');