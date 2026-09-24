#!/usr/bin/env node
// The hybrid route end to end on synthetic footage: two green-screen plates with a moving "actor"
// (an orange block) and plate sound; one location in the reference library, one to generate.
// Routes and plans the hybrid rows, briefs plates and backgrounds, refuses a background without a
// yes, cuts the actor out by chroma key, composites over both backgrounds, checks the actor's pixels
// are kept and the green is gone, ingests only the composites, cuts them by panel id, and voids a
// cut-out when its plate changes. Needs ffmpeg and Pillow; skipped cleanly without them.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
const have = (c, a) => spawnSync(c, a, { encoding: 'utf8' }).status === 0;
if (!have('ffmpeg', ['-version']) || !have('python', ['-c', 'import PIL'])) { console.log('skip hybrid.e2e: ffmpeg or Pillow missing'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-hybrid-'));
const env = Object.assign({}, process.env, { PYTHONUTF8: '1' }); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args, extra) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env: Object.assign({}, env, extra || {}) });
const py = (script, args, extra) => spawnSync('python', [S(script), ...args], { cwd: tmp, encoding: 'utf8', env: Object.assign({}, env, extra || {}) });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const ff = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, 'ffmpeg: ' + r.stderr); };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const pixel = (file, x, y) => { const r = spawnSync('python', ['-c', `from PIL import Image;im=Image.open(r'${file}').convert('RGB');print(*im.getpixel((${x},${y})))`], { encoding: 'utf8' }); return r.stdout.trim().split(/\s+/).map(Number); };

ok(run('set-root.js', ['.', '--no-guards']), 'set-root');
ok(run('scaffold-client.js', ['3echo', '3echo']), 'scaffold-client');
let r = run('scaffold-job.js', ['3echo', 'late-again', 'Late', 'Again']); ok(r, 'scaffold-job');
const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
const jobDir = path.join(tmp, 'workspaces', '3echo', 'jobs', jobId);

// Release: a shoot (call sheet present), two panels, one in the apartment, one at the harbour.
const release = path.join(tmp, 'release'); fs.mkdirSync(path.join(release, 'storyboard', 'v1'), { recursive: true });
fs.writeFileSync(path.join(release, 'script.md'), '# Late Again\n\nScene 1: Maya waits in the apartment.\nScene 2: Maya at the harbour.\n');
fs.writeFileSync(path.join(release, 'concept-breakdown.xlsx'), 'x'); fs.writeFileSync(path.join(release, 'call-sheet-day-01.pdf'), 'x');
writeJson(path.join(release, 'storyboard.json'), { schemaVersion: '1.0', panels: [
  { id: 'P01', scene: 1, storyOrder: 1, caption: 'Maya waits in the apartment', durationSec: 2 },
  { id: 'P02', scene: 2, storyOrder: 2, caption: 'Maya at the harbour', location: 'harbour', durationSec: 2 },
] });
for (const id of ['P01', 'P02']) ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180', '-frames:v', '1', path.join(release, 'storyboard', 'v1', id + '.png')]);

// Shoot folder: two green-screen plates with a moving orange "actor" and sound; the apartment in the library.
const drive = path.join(tmp, 'shoot');
const plate = (id, x0) => { fs.mkdirSync(path.join(drive, 'footage', 'plates'), { recursive: true }); ff(['-f', 'lavfi', '-i', `color=c=0x00B140:s=320x180:d=2:r=24[bg];color=c=0xD2691E:s=70x110:d=2:r=24[fg];[bg][fg]overlay=x='${x0}+30*t':y=40`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(drive, 'footage', 'plates', id + '.mp4')]); };
plate('P01', 40); plate('P02', 120);
fs.mkdirSync(path.join(drive, 'references', 'locations'), { recursive: true });
ff(['-f', 'lavfi', '-i', 'color=c=0x3A4A8A:s=320x180', '-frames:v', '1', path.join(drive, 'references', 'locations', 'apartment.png')]);
fs.mkdirSync(path.join(drive, 'audio', 'vo'), { recursive: true });

const job = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
Object.assign(job, { aspectRatio: '16:9', deliverableDurationSec: 6, audioLed: false, driveFolder: drive, prePipelineReleaseFolder: release, footageSource: 'hybrid', hybrid: { cutout: 'auto' } });
writeJson(path.join(jobDir, 'job.json'), job);

// ---- route and plan
r = run('route-job.js', [path.join(jobDir, 'job.json')]); ok(r, 'route');
const route = JSON.parse(fs.readFileSync(path.join(jobDir, 'route.json'), 'utf8'));
assert.ok(route.tags.includes('hybrid_footage') && route.riskFlags.includes('credit_spend'), 'hybrid tags: ' + route.tags);
ok(run('plan-job.js', [path.join(jobDir, 'route.json')]), 'plan');
const plan = fs.readFileSync(path.join(jobDir, 'plan.md'), 'utf8');
assert.ok(/\| 2 \| plates \+ backgrounds \+ composite \+ ingest \|.*plate-director.*hybrid-plates, hybrid-composite/.test(plan), 'row 2 is the hybrid stage:\n' + plan);
assert.ok(/\| 3 \|.*sequence-first-cut --by-panel/.test(plan), 'row 3 cuts by panel id');

// ---- brief: the apartment comes from the library, the harbour is to generate
r = run('hybrid.js', ['3echo', jobId, 'brief']); ok(r, 'brief');
let brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));
assert.strictEqual(brief.backgrounds.apartment.source, 'library'); assert.strictEqual(brief.backgrounds.apartment.status, 'provided');
assert.strictEqual(brief.backgrounds.harbour.source, 'generate'); assert.strictEqual(brief.backgrounds.harbour.status, 'pending');
assert.ok(/no people/.test(brief.backgrounds.harbour.prompt), 'a background prompt asks for an empty set');
assert.deepStrictEqual(brief.panels.map(p => p.status), ['plate', 'plate']);

// ---- cut-out: auto samples the screen colour from the corners and picks chroma key (with or without OpenMontage)
r = py('cutout.py', ['3echo', jobId], { OM_ROOT: path.join(tmp, 'no-openmontage') }); ok(r, 'cutout');
brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));
for (const p of brief.panels) {
  assert.strictEqual(p.cutout.method, 'chromakey'); assert.strictEqual(p.cutout.decidedBy, 'corner-sample');
  assert.ok(fs.existsSync(p.cutout.file) && p.cutout.keyColour.kind === 'green');
  assert.ok(p.cutout.actorCoveragePct > 5 && p.cutout.actorCoveragePct < 30, 'the actor block is about 13% of the frame: ' + p.cutout.actorCoveragePct);
}

// ---- composite: the harbour waits for its background, which lands only after a yes
r = py('composite.py', ['3echo', jobId]); ok(r, 'composite (first pass)');
assert.ok(/P02 \(background harbour not ready\)/.test(r.stdout), r.stdout);
r = run('hybrid.js', ['3echo', jobId, 'land', 'harbour', '--file', path.join(drive, 'references', 'locations', 'apartment.png')]);
assert.strictEqual(r.status, 3, 'no background lands without a yes');
const hooksUrl = 'file:///' + path.join(PLUGIN, 'hooks', 'hooks.mjs').split(path.sep).join('/');
const hook = () => spawnSync(process.execPath, ['--input-type=module', '-e', "import('" + hooksUrl + "').then(m => console.log(m.refuseBackgroundWithoutApproval({ command: 'create_image_job', cwd: process.argv[1] }) || 'allowed'))", jobDir], { encoding: 'utf8' }).stdout;
assert.ok(/no background approval/.test(hook()), 'hook refuses the image job before the yes');
r = run('preflight-generation.js', ['3echo', jobId, 'batch', '--kind', 'backgrounds']); assert.strictEqual(r.status, 3, 'preflight refuses before the yes');
ok(run('hybrid.js', ['3echo', jobId, 'approve', 'backgrounds', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '1']), 'approve backgrounds');
assert.ok(/allowed/.test(hook()), 'hook allows it after the yes');
ok(run('preflight-generation.js', ['3echo', jobId, 'batch', '--kind', 'backgrounds']), 'preflight backgrounds');
const harbourPng = path.join(tmp, 'harbour.png'); ff(['-f', 'lavfi', '-i', 'color=c=0x1E5B6B:s=640x360', '-frames:v', '1', harbourPng]);
ok(run('hybrid.js', ['3echo', jobId, 'land', 'harbour', '--file', harbourPng, '--credits', '1']), 'land harbour');
r = py('composite.py', ['3echo', jobId]); ok(r, 'composite');
brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));
for (const p of brief.panels) {
  assert.strictEqual(p.status, 'composited', p.id + ' ' + JSON.stringify(p.composite));
  assert.ok(p.composite.actorPreservedPct >= 97, p.id + ' actor kept ' + p.composite.actorPreservedPct);
  assert.ok(fs.existsSync(p.composite.preview));
  const mid = path.join(tmp, p.id + '-mid.png'); ff(['-ss', '1', '-i', p.composite.file, '-frames:v', '1', mid]);
  const [cr, cg] = pixel(mid, 5, 5);
  assert.ok(cg < 120, p.id + ': the corner is no longer green screen (' + cr + ',' + cg + ')');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', p.composite.file], { encoding: 'utf8' }).stdout;
  assert.ok(/audio/.test(probe), p.id + ' keeps the plate sound');
}
r = run('hybrid.js', ['3echo', jobId, 'status']); ok(r, 'status'); assert.ok(/2\/2 composited/.test(r.stdout), r.stdout);

// ---- ingest takes only the composites; the first cut is by panel id from them
ok(run('ingest-footage.js', ['3echo', jobId]), 'ingest');
const man = JSON.parse(fs.readFileSync(path.join(jobDir, 'manifest.json'), 'utf8'));
assert.strictEqual(man.clips.length, 2, 'only the two composites: ' + man.clips.map(c => c.path).join(', '));
assert.ok(man.clips.every(c => /[\\/]composite[\\/]/.test(c.path)));
r = py('sequence-first-cut.py', ['3echo', jobId]); ok(r, 'sequence');
const edl = JSON.parse(fs.readFileSync(path.join(jobDir, 'rough-edl.json'), 'utf8'));
assert.deepStrictEqual(edl.cuts.map(c => c.panelId), ['P01', 'P02']);

// ---- a plate that changes voids its cut-out and composite
plate('P01', 60);
ok(run('hybrid.js', ['3echo', jobId, 'brief']), 'brief after a plate change');
brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));
const p1 = brief.panels.find(p => p.id === 'P01'), p2 = brief.panels.find(p => p.id === 'P02');
assert.strictEqual(p1.cutout, null); assert.strictEqual(p1.status, 'plate');
assert.ok(p2.composite && p2.status === 'composited', 'the unchanged plate keeps its composite');
assert.strictEqual(brief.backgrounds.harbour.status, 'delivered', 'a landed background survives a re-brief');

// ---- rembg: a plain refusal when it is not installed
if (!have('python', ['-c', 'import rembg'])) {
  r = py('cutout.py', ['3echo', jobId, '--panel', 'P01', '--method', 'rembg']);
  assert.strictEqual(r.status, 3); assert.ok(/rembg is not installed/.test(r.stderr), r.stderr);
}

if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('kept ' + tmp);
console.log('hybrid.e2e: route, plan, brief, chroma-key cut-out, approved background, composite with the actor kept, composite-only ingest, panel cut and plate-change voiding all correct');
