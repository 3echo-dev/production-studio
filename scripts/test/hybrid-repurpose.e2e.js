#!/usr/bin/env node
// A footage-repurpose cut re-finished as a hybrid job: import-repurpose.js turns the repurpose job
// (storyboard, catalog, generated scene, VO, music) into a release and a shoot folder; the router
// accepts the release without a concept breakdown or call sheets; the talent scenes are plates, the
// logo and the generated pack shot are kept as they are; letterbox bars are found and stay black in
// the composite; backgroundPer "panel" makes one background per panel, the later ones generated
// against the first (land refuses them before it). Needs ffmpeg and Pillow; skipped without them.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
const have = (c, a) => spawnSync(c, a, { encoding: 'utf8' }).status === 0;
if (!have('ffmpeg', ['-version']) || !have('python', ['-c', 'import PIL'])) { console.log('skip hybrid-repurpose.e2e: ffmpeg or Pillow missing'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-repurpose-'));
const env = Object.assign({}, process.env, { PYTHONUTF8: '1' }); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const py = (script, args) => spawnSync('python', [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const ff = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, 'ffmpeg: ' + r.stderr); };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const pixel = (file, x, y) => { const r = spawnSync('python', ['-c', `from PIL import Image;im=Image.open(r'${file}').convert('RGB');print(*im.getpixel((${x},${y})))`], { encoding: 'utf8' }); return r.stdout.trim().split(/\s+/).map(Number); };

// ---- a repurpose job: two talent clips on green with 20 px letterbox bars, a logo, a generated pack shot
const lib = path.join(tmp, 'library'); fs.mkdirSync(lib, { recursive: true });
const talent = (name, x0) => ff(['-f', 'lavfi', '-i', `color=c=0x00B140:s=320x140:d=3:r=24[bg];color=c=0xD2691E:s=60x90:d=3:r=24[fg];[bg][fg]overlay=x='${x0}+20*t':y=30,pad=320:180:0:20:black`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(lib, name)]);
talent('maya_a.mov', 60); talent('maya_b.mov', 160);
ff(['-f', 'lavfi', '-i', 'color=c=0xC8102E:s=320x180:d=3:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(lib, 'logo.mov')]);
const rp = path.join(tmp, 'repurpose', 'workspaces', 'jobs', 'reel'); const A = path.join(rp, 'artifacts');
fs.mkdirSync(path.join(A, 'generate'), { recursive: true }); fs.mkdirSync(path.join(A, 'audio'), { recursive: true }); fs.mkdirSync(path.join(A, 'final'), { recursive: true });
ff(['-f', 'lavfi', '-i', 'color=c=0xEEE0C0:s=320x180:d=3:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(A, 'generate', 'scene_03.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:d=6:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(A, 'final', 'rough_cut.mp4')]);
for (const f of ['vo_01.mp3', 'music.mp3', 'sfx_glass.mp3']) ff(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', path.join(A, 'audio', f)]);
writeJson(path.join(A, 'audio', 'vo.json'), { lines: [{ scene_n: 1, text: 'Some mornings.', audio: 'vo_01.mp3' }] });
writeJson(path.join(rp, '..', '..', 'catalog', 'index.json'), { clips: [
  { id: 'a1', abs_path: path.join(lib, 'maya_a.mov'), talent: 'Maya', kind: 'talent_footage' },
  { id: 'a2', abs_path: path.join(lib, 'maya_b.mov'), talent: 'Maya', kind: 'talent_footage' },
  { id: 'l1', abs_path: path.join(lib, 'logo.mov'), talent: null, kind: 'logo' },
] });
writeJson(path.join(A, 'storyboard.json'), { title: 'Reel', client: '3echo', scenes: [
  { n: 1, role: 'hook', source: 'drive', clip_id: 'a1', in_s: 0.5, out_s: 2.5, note: 'Maya against the sky', voiceover: 'Some mornings.' },
  { n: 2, role: 'talent', source: 'drive', clip_id: 'a2', in_s: 0.5, out_s: 2.5, note: 'Maya smiles' },
  { n: 3, role: 'product_hero', source: 'generated', in_s: 0.5, out_s: 2.5, note: 'Pack shot' },
  { n: 4, role: 'end_card', source: 'drive', clip_id: 'l1', in_s: 0, out_s: 1.5, note: '3echo wordmark', voiceover: '3echo.' },
] });

// ---- import
const inp = path.join(tmp, 'inputs', 'rooftop');
let r = run('import-repurpose.js', [rp, inp, '--location', 'Tokyo rooftop at golden hour']); ok(r, 'import');
assert.ok(/plates P01, P02 .*kept as they are P03, P04/.test(r.stdout), r.stdout);
const rsb = JSON.parse(fs.readFileSync(path.join(inp, 'release', 'storyboard.json'), 'utf8'));
assert.strictEqual(rsb.origin, 'footage-repurpose');
assert.deepStrictEqual(rsb.panels.map(p => p.location || null), ['Tokyo rooftop at golden hour', 'Tokyo rooftop at golden hour', null, null]);
for (const f of ['footage/plates/P01.mov', 'footage/plates/P02.mov', 'footage/keep/P03.mp4', 'footage/keep/P04.mp4', 'audio/vo/vo_scene-1.mp3', 'audio/bgm/music.mp3', 'audio/sfx/sfx_glass.mp3']) assert.ok(fs.existsSync(path.join(inp, 'shoot', f)), f + ' imported');
assert.ok(/Scene 4: 3echo wordmark VO: "3echo\."/.test(fs.readFileSync(path.join(inp, 'release', 'script.md'), 'utf8')));

// ---- job, route (no call sheet, no concept breakdown), plan
ok(run('set-root.js', ['.', '--no-guards']), 'set-root');
ok(run('scaffold-client.js', ['3echo', '3echo']), 'scaffold-client');
r = run('scaffold-job.js', ['3echo', 'rooftop', 'Rooftop']); ok(r, 'scaffold-job');
const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
const jobDir = path.join(tmp, 'workspaces', '3echo', 'jobs', jobId);
const job = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
Object.assign(job, { aspectRatio: '16:9', deliverableDurationSec: 7, audioLed: false, driveFolder: path.join(inp, 'shoot'), prePipelineReleaseFolder: path.join(inp, 'release'), footageSource: 'hybrid', hybrid: { cutout: 'auto', backgroundPer: 'panel' } });
writeJson(path.join(jobDir, 'job.json'), job);
r = run('route-job.js', [path.join(jobDir, 'job.json')]); ok(r, 'route');
assert.ok(JSON.parse(fs.readFileSync(path.join(jobDir, 'route.json'), 'utf8')).blockers.length === 0, 'a repurposed release needs no call sheet');

// ---- intake: plates, keep, bars, per-panel backgrounds, no reference noise
r = run('scan-references.js', ['3echo', jobId]); ok(r, 'scan');
const inv = JSON.parse(fs.readFileSync(path.join(jobDir, 'reference-inventory.json'), 'utf8'));
assert.deepStrictEqual(inv.hybrid.kept, ['P03', 'P04']); assert.deepStrictEqual(inv.hybrid.noPlate, []);
assert.deepStrictEqual(inv.panels[0].pictureArea, { x: 0, y: 20, w: 320, h: 140 }, 'letterbox found');
assert.strictEqual(inv.panels[0].screen, 'green', 'the screen is sampled inside the bars');
assert.strictEqual(inv.hybrid.backgroundCredits, 2, 'one background per plated panel');
assert.deepStrictEqual(inv.gaps.map(g => g.kind), ['backgrounds', 'vo', 'bgm'], 'no reference gap for a hybrid job (2 VO lines, 1 take): ' + inv.gaps.map(g => g.kind));
assert.ok(/P03  kept as it is/.test(r.stdout) && /letterboxed 320x140/.test(r.stdout), r.stdout);

// ---- brief: P02's background is generated against P01's, and cannot land first
let brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));
const [k1, k2] = ['tokyo rooftop at golden hour p01', 'tokyo rooftop at golden hour p02'];
assert.ok(brief.backgrounds[k1] && !brief.backgrounds[k1].continuityOf);
assert.strictEqual(brief.backgrounds[k2].continuityOf, k1);
assert.ok(/continuity reference/.test(brief.backgrounds[k2].prompt));
assert.strictEqual(brief.panels.find(p => p.id === 'P03').status, 'keep');
ok(run('hybrid.js', ['3echo', jobId, 'approve', 'backgrounds', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '2']), 'approve');
const sky = path.join(tmp, 'sky.png'); ff(['-f', 'lavfi', '-i', 'color=c=0xF0A040:s=320x180', '-frames:v', '1', sky]);
r = run('hybrid.js', ['3echo', jobId, 'land', k2, '--file', sky]); assert.strictEqual(r.status, 3, 'P02 waits for P01: ' + r.stderr);
ok(run('hybrid.js', ['3echo', jobId, 'land', k1, '--file', sky]), 'land P01');
ok(run('hybrid.js', ['3echo', jobId, 'land', k2, '--file', sky]), 'land P02');

// ---- cut out and composite: the bars stay black, the actor is kept, the background fills the picture
ok(py('cutout.py', ['3echo', jobId]), 'cutout');
brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));
assert.deepStrictEqual(brief.panels[0].cutout.pictureArea, { x: 0, y: 20, w: 320, h: 140 });
r = py('composite.py', ['3echo', jobId]); ok(r, 'composite');
brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));
const c1 = brief.panels[0].composite; assert.ok(c1 && c1.actorPreservedPct >= 97, 'actor kept: ' + JSON.stringify(c1));
const still = path.join(tmp, 'c.png'); ff(['-ss', '1', '-i', c1.file, '-frames:v', '1', still]);
assert.ok(pixel(still, 160, 5).every(v => v < 20), 'top bar stays black: ' + pixel(still, 160, 5));
assert.ok(pixel(still, 160, 175).every(v => v < 20), 'bottom bar stays black');
const bgpx = pixel(still, 5, 90); assert.ok(bgpx[0] > 150 && bgpx[0] > bgpx[1] && bgpx[1] > bgpx[2], 'the (brightness-matched) orange background fills the picture, no green left: ' + bgpx);

// ---- ingest takes the composites and the kept clips; the cut is by panel id
ok(run('ingest-footage.js', ['3echo', jobId]), 'ingest');
const man = JSON.parse(fs.readFileSync(path.join(jobDir, 'manifest.json'), 'utf8'));
const names = man.clips.map(c => path.basename(c.path)).sort();
assert.deepStrictEqual(names, ['P01.mp4', 'P02.mp4', 'P03.mp4', 'P04.mp4'], 'composites and kept clips only: ' + names);

if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('kept ' + tmp);
console.log('hybrid-repurpose.e2e: import, route without call sheets, kept panels, letterbox found and kept black, per-panel backgrounds with continuity order, composite and ingest all correct');
