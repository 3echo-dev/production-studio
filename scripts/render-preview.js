#!/usr/bin/env node
// Render a watchable preview of the cut for the board: the EDL cuts in story order, each with
// its panel id burned in, silent after the first cut and with the synced mix after the sync.
//
//   node render-preview.js <client> <job-id> --stage cut|sync [--height 720]
//
// Writes previews/<stage>-v<n>.mp4, a filmstrip previews/<stage>-v<n>-strip.png (eight frames,
// under 200 KB, for the item card) and previews/<stage>-v<n>.json with the hashes.
// Exit 0 rendered · 1 ffmpeg fault (verbatim) · 2 usage · 3 inputs missing
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
const stage = opt('--stage');
if (!client || !jobId || !['cut', 'sync'].includes(stage)) { console.error('usage: render-preview.js <client> <job-id> --stage cut|sync [--height 720]'); process.exit(2); }
const height = Number(opt('--height') || 720);
const read = f => { const p = path.join(dir, f); if (!fs.existsSync(p)) { console.error(f + ' is missing; nothing to preview.'); process.exit(3); } return JSON.parse(fs.readFileSync(p, 'utf8')); };
const edl = read('rough-edl.json'); const manifest = read('manifest.json');
const bySha = new Map((manifest.clips || []).map(c => [c.sha256, c]));
const cuts = edl.cuts || [];
if (!cuts.length) { console.error('The EDL has no cuts.'); process.exit(3); }
let sync = null, wav = null;
if (stage === 'sync') { sync = read('synced-track.json'); wav = path.join(dir, sync.output.wavPath); if (!fs.existsSync(wav)) { console.error(sync.output.wavPath + ' is missing; run the sync first.'); process.exit(3); } }
const n = stage === 'cut' ? (edl.version || 1) : (sync.version || 1);
const outDir = path.join(dir, 'previews'); board.ensureDir(outDir);
const base = stage + '-v' + n;
const mp4 = path.join(outDir, base + '.mp4'); const strip = path.join(outDir, base + '-strip.png');
const run = (args, what) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status !== 0) { console.error(what + ' failed:\n' + (r.stderr || r.error)); process.exit(1); } };
// ffmpeg on Windows has no fontconfig, so drawtext needs a font file named outright. The drive colon is
// escaped twice: once for the filtergraph parser, once for the option parser.
const FONTS = ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Helvetica.ttc'];
const font = FONTS.find(f => fs.existsSync(f));
const fontArg = font ? 'fontfile=' + font.replace(/:/g, '\\\\:') + ':' : '';
if (!font) console.error('warning: no font file found; panel ids are not burned in.');
// One input per cut (a clip may repeat), trimmed, scaled to the preview height, panel id burned in.
const inputs = []; const parts = []; let total = 0;
cuts.forEach((c, i) => {
  const clip = bySha.get(c.clipSha256);
  if (!clip) { console.error('cut ' + c.panelId + ' references a clip not in manifest.json.'); process.exit(3); }
  if (!fs.existsSync(clip.path)) { console.error('take not on disk: ' + clip.path); process.exit(3); }
  inputs.push('-i', clip.path);
  const label = String(c.panelId).replace(/[^A-Za-z0-9_-]/g, '') + ' ' + (i + 1) + '/' + cuts.length;
  parts.push('[' + i + ':v]trim=' + c.inSec + ':' + c.outSec + ',setpts=PTS-STARTPTS,scale=-2:' + height + ',fps=' + (edl.fps || 25) + ',format=yuv420p' + (font ? ',drawtext=' + fontArg + 'text=\'' + label + '\':x=18:y=18:fontsize=' + Math.round(height / 24) + ':fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8' : '') + '[v' + i + ']');
  total += c.outSec - c.inSec;
});
parts.push(cuts.map((_, i) => '[v' + i + ']').join('') + 'concat=n=' + cuts.length + ':v=1:a=0[v]');
const args = [...inputs];
if (stage === 'sync') args.push('-i', wav);
args.push('-filter_complex', parts.join(';'), '-map', '[v]');
if (stage === 'sync') args.push('-map', String(cuts.length) + ':a', '-c:a', 'aac', '-b:a', '192k', '-shortest'); else args.push('-an');
args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', mp4);
run(args, 'ffmpeg preview');
// Filmstrip: eight frames across the whole preview, shrunk until it fits the board's 200 KB.
for (const w of [1200, 960, 720, 560]) {
  run(['-i', mp4, '-vf', 'fps=8/' + Math.max(total, 0.1) + ',scale=' + Math.round(w / 8) + ':-2,tile=8x1', '-frames:v', '1', strip], 'ffmpeg filmstrip');
  if (fs.statSync(strip).size <= 200 * 1024) break;
}
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
const meta = { schemaVersion: '1.0', jobId, stage, version: n, file: 'previews/' + base + '.mp4', sha256: board.sha256File(mp4), bytes: fs.statSync(mp4).size, durationSec: Number(String(probe.stdout).trim()) || total, edlSha256: board.sha256File(path.join(dir, 'rough-edl.json')), wavSha256: sync ? sync.output.wavSha256 : null, strip: 'previews/' + base + '-strip.png', renderedAt: new Date().toISOString() };
fs.writeFileSync(path.join(outDir, base + '.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('previews/' + base + '.mp4: ' + meta.durationSec.toFixed(2) + ' s, ' + cuts.length + ' cut(s), ' + (stage === 'sync' ? 'with the synced mix' : 'silent') + ' (' + Math.round(meta.bytes / 1024) + ' KB); filmstrip ' + Math.round(fs.statSync(strip).size / 1024) + ' KB.');