#!/usr/bin/env node
// Turn a footage-repurpose job (storyboard + rough cut + audio, cut from a client's existing shoot)
// into the two folders a post job starts from, so it can be re-finished here, for example as a hybrid
// job that keeps the talent and changes what is behind them.
//
//   node import-repurpose.js <repurpose-job-dir> <out-dir> [--location "Tokyo rooftop at golden hour"]
//        [--catalog <catalog/index.json>] [--keep 4,5] [--title "..."]
//
// Writes, and never touches the repurpose job or the source footage:
//   <out>/release/  storyboard.json (one panel per scene, origin footage-repurpose), storyboard/v1/P0n.png
//                   (the scene's middle frame), script.md (scenes with their VO lines), reference-cut.mp4
//   <out>/shoot/    footage/plates/P0n.mov  scenes with talent, trimmed to their in/out (ProRes 422 HQ)
//                   footage/keep/P0n.mp4    scenes with no talent (a generated pack shot, a logo), as cut
//                   audio/vo, audio/bgm, audio/sfx   the job's takes, music and effects
//   <out>/import.json   what came from where
// A scene is a plate when its catalog clip names talent; --keep forces scenes to be kept as they are.
// --location sets the storyboard location of every plate scene (their new background).
// Exit 0 ok · 1 fault · 2 usage · 3 input missing
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const [src, out] = pos;
if (!src || !out) { console.error('usage: import-repurpose.js <repurpose-job-dir> <out-dir> [--location "..."] [--catalog <index.json>] [--keep 4,5] [--title "..."]'); process.exit(2); }
const A = path.join(src, 'artifacts');
const sbPath = path.join(A, 'storyboard.json');
if (!fs.existsSync(sbPath)) { console.error('no artifacts/storyboard.json in ' + src); process.exit(3); }
const sb = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
const catPath = opt('--catalog') || path.join(src, '..', '..', 'catalog', 'index.json');
if (!fs.existsSync(catPath)) { console.error('no footage catalog at ' + catPath + ' (pass --catalog)'); process.exit(3); }
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
const clips = Array.isArray(cat) ? cat : (cat.clips || Object.values(cat).find(Array.isArray) || []);
const byId = new Map(clips.map(c => [c.id, c]));
const keepForced = new Set((opt('--keep') || '').split(',').map(s => s.trim()).filter(Boolean));
const location = opt('--location');
const fwd = p => p.replace(/\\/g, '/');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const ff = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status !== 0) { console.error('ffmpeg: ' + r.stderr); process.exit(1); } };

const rel = mk(path.join(out, 'release')); const frames = mk(path.join(rel, 'storyboard', 'v1'));
const shoot = mk(path.join(out, 'shoot'));
const log = { importedAt: new Date().toISOString(), from: fwd(path.resolve(src)), catalog: fwd(path.resolve(catPath)), scenes: [], audio: [] };
const panels = []; const script = ['# ' + (opt('--title') || sb.title || 'Imported cut'), ''];

for (const s of sb.scenes || []) {
  const id = 'P' + String(s.n).padStart(2, '0');
  const clip = s.clip_id ? byId.get(s.clip_id) : null;
  const file = clip ? clip.abs_path : s.source === 'generated' ? [path.join(A, 'generate', 'scene_' + String(s.n).padStart(2, '0') + '.mp4')].find(f => fs.existsSync(f)) : null;
  if (!file || !fs.existsSync(file)) { console.error(id + ': source clip not found (' + (s.clip_id || s.source) + ')'); process.exit(3); }
  const inS = Number(s.in_s || 0), dur = Math.max(0.5, Number(s.out_s || 0) - inS);
  const plate = clip && clip.talent && !keepForced.has(String(s.n));
  const dest = plate ? path.join(mk(path.join(shoot, 'footage', 'plates')), id + '.mov') : path.join(mk(path.join(shoot, 'footage', 'keep')), id + '.mp4');
  // Plates stay close to the source (ProRes 422 HQ, 10-bit): the actor is cut out of these pixels.
  ff(['-ss', inS.toFixed(3), '-t', dur.toFixed(3), '-i', file, '-map', '0:v:0', '-map', '0:a?', ...(plate ? ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le'] : ['-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'aac']), dest]);
  ff(['-ss', (dur / 2).toFixed(3), '-i', dest, '-frames:v', '1', path.join(frames, id + '.png')]);
  const caption = s.note || s.role || '';
  panels.push({ id, scene: s.n, storyOrder: s.n, caption, durationSec: Math.round(dur * 100) / 100, role: s.role || null, ...(plate && location ? { location } : {}), file: 'storyboard/v1/' + id + '.png' });
  script.push('Scene ' + s.n + ': ' + caption + (s.voiceover ? ' VO: "' + s.voiceover + '"' : ''));
  log.scenes.push({ panel: id, scene: s.n, as: plate ? 'plate' : 'keep', source: fwd(file), inSec: inS, durSec: Math.round(dur * 1000) / 1000, file: fwd(dest) });
}
fs.writeFileSync(path.join(rel, 'storyboard.json'), JSON.stringify({ schemaVersion: '1.0', origin: 'footage-repurpose', title: sb.title || null, client: sb.client || null, width: sb.width || null, height: sb.height || null, panels }, null, 2) + '\n');
fs.writeFileSync(path.join(rel, 'script.md'), script.join('\n') + '\n');
const cut = ['final/rough_cut.mp4', 'final/final_with_audio.mp4'].map(f => path.join(A, f)).find(f => fs.existsSync(f));
if (cut) { fs.copyFileSync(cut, path.join(rel, 'reference-cut.mp4')); log.referenceCut = fwd(cut); }

// Audio: VO takes in scene order (named for their scene so they sort and read), music, effects.
const AUD = path.join(A, 'audio');
const copy = (f, kind, name) => { if (!fs.existsSync(f)) return; const d = path.join(mk(path.join(shoot, 'audio', kind)), name || path.basename(f)); fs.copyFileSync(f, d); log.audio.push({ kind, from: fwd(f), file: fwd(d) }); };
let vo = null; try { vo = JSON.parse(fs.readFileSync(path.join(AUD, 'vo.json'), 'utf8')); } catch { vo = null; }
for (const l of (vo && vo.lines) || []) copy(path.join(AUD, l.audio), 'vo', 'vo_scene-' + l.scene_n + path.extname(l.audio));
copy(path.join(AUD, 'music.mp3'), 'bgm');
for (const f of (fs.existsSync(AUD) ? fs.readdirSync(AUD) : []).filter(f => /^sfx_.*\.(mp3|wav)$/i.test(f))) copy(path.join(AUD, f), 'sfx');
fs.writeFileSync(path.join(out, 'import.json'), JSON.stringify(log, null, 2) + '\n');

const plates = log.scenes.filter(s => s.as === 'plate').map(s => s.panel), kept = log.scenes.filter(s => s.as === 'keep').map(s => s.panel);
console.log('Imported ' + log.scenes.length + ' scene(s) from ' + path.basename(path.resolve(src)) + ': plates ' + (plates.join(', ') || 'none') + (location ? ' (location: ' + location + ')' : '') + '; kept as they are ' + (kept.join(', ') || 'none') + '.');
console.log('Audio: ' + ['vo', 'bgm', 'sfx'].map(k => k + ' ' + log.audio.filter(a => a.kind === k).length).join(', ') + (log.referenceCut ? '. Reference cut: release/reference-cut.mp4.' : '.'));
console.log('Release ' + fwd(path.resolve(rel)) + ' · shoot folder ' + fwd(path.resolve(shoot)));
