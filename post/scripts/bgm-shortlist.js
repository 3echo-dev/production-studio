#!/usr/bin/env node
// Shortlist three music candidates from the files under audio/bgm/ in the manifest, write
// bgm-options.json (schemas/bgm-option.schema.json) and queue the three cards for the board.
//
//   node bgm-shortlist.js <client> <job-id> [--tone "warm,hopeful"] [--curve build|flat|peak-mid|peak-end|release]
//
// No music service is wired: the client supplies the files, this script describes them (bpm
// from the filename when it carries one, key not analysed, licensing as declared or custom)
// and the person picks one on the board. Exit 0 · 1 fault · 2 usage · 3 fewer than three tracks
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');
const { validate } = require('./validate-schema.js');

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: bgm-shortlist.js <client> <job-id> [--tone "a,b"] [--curve build|flat|peak-mid|peak-end|release]'); process.exit(2); }
const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const tracks = (manifest.audio || []).filter(a => a.kind === 'bgm');
if (tracks.length < 3) { console.error('Only ' + tracks.length + ' music file(s) under audio/bgm; three are needed for a shortlist. Ask the client for more, or mark BGM not applicable on the board.'); process.exit(3); }
let edlTotal = null;
try { const edl = JSON.parse(fs.readFileSync(path.join(dir, 'rough-edl.json'), 'utf8')); edlTotal = Math.round((edl.cuts || []).reduce((s, c) => s + (c.outSec - c.inSec), 0) * 10) / 10; } catch { /* no cut yet */ }
const tone = (opt('--tone') || 'to be decided by the creative director').split(',').map(s => s.trim()).filter(Boolean);
const curve = opt('--curve') || 'flat';
// Prefer tracks that cover the deliverable, then the cut; keep the order the folder gave.
const target = Number(job.deliverableDurationSec) || edlTotal || 0;
const scored = tracks.map(t => ({ t, cover: t.durationSec >= target ? 1 : 0 })).sort((a, b) => b.cover - a.cover).slice(0, 3);
const candidates = scored.map(({ t }, i) => {
  const name = path.parse(t.path).name;
  const bpm = Number((name.match(/(\d{2,3})\s*bpm/i) || [])[1]) || 0;
  // A generated track carries a sidecar <name>.json {source, prompt, moodTags, licensing} written when it landed.
  let side = {}; try { side = JSON.parse(fs.readFileSync(t.path.replace(/\.[^.]+$/, '.json'), 'utf8')); } catch { side = {}; }
  return {
    id: 'c' + (i + 1), source: side.source || 'library-local', title: name.replace(/[_-]+/g, ' ').replace(/\s*\d{2,3}\s*bpm/i, '').trim() || name, artist: null,
    durationSec: t.durationSec, bpm, keyRoot: 'not analysed', keyMode: 'minor',
    moodTags: side.moodTags || [], licensing: side.licensing || 'custom', previewUrl: null, localPath: t.path,
    rationale: (bpm ? bpm + ' bpm; ' : '') + (t.durationSec >= target ? 'covers the ' + target + ' s deliverable' : 'shorter than the deliverable (' + t.durationSec + ' s); would loop or fade') + '. ' + (side.prompt ? 'Generated: ' + side.prompt : 'Supplied with the shoot; licensing as the client declares.'),
  };
});
const options = { schemaVersion: '1.0', jobId, generatedAt: new Date().toISOString(), brief: { toneWords: tone, referenceTracks: [], targetBpm: null, energyCurve: curve }, candidates };
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'bgm-option.schema.json'), 'utf8'));
const errs = validate(schema, options);
if (errs.length) { console.error('bgm-options fails schema: ' + errs.map(e => e.path + ' ' + e.message).join('; ')); process.exit(1); }
const out = path.join(dir, 'bgm-options.json'); fs.writeFileSync(out + '.tmp', JSON.stringify(options, null, 2) + '\n'); fs.renameSync(out + '.tmp', out);
const cwd = process.cwd();
for (const c of candidates) board.appendOutbox(cwd, client, jobId, { collection: 'bgm', docId: c.id, data: { title: c.title, source: c.source, durationSec: c.durationSec, bpm: c.bpm || null, mood: c.moodTags.join(', ') || null, source: c.source, note: c.rationale, file: c.localPath, chosen: false } });
console.log('bgm-options.json: ' + candidates.map(c => c.id + ' ' + c.title + ' (' + c.durationSec + ' s' + (c.bpm ? ', ' + c.bpm + ' bpm' : '') + ')').join('; ') + '. Three cards queued for the board; the person picks one there.');