#!/usr/bin/env node
// Motion transfer on the hybrid route, on synthetic footage: one green-screen plate named in
// hybrid.motionPanels, its location from the library. Briefs the [Video 1] reference and the prompt,
// refuses the video job, the preflight and the landing before a yes, lands a stand-in for the AgentC
// clip (the plate's actor over a new place, as a faithful model would draw it), composites the
// plate's own actor back on top (actor kept, model drift measured), flags a clip where the model
// moved the person, flags the model's own person when keepActor is off, ingests only the composite,
// and voids the request when the plate changes. Needs ffmpeg and Pillow; skipped cleanly without them.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
const have = (c, a) => spawnSync(c, a, { encoding: 'utf8' }).status === 0;
if (!have('ffmpeg', ['-version']) || !have('python', ['-c', 'import PIL'])) { console.log('skip motion-transfer.e2e: ffmpeg or Pillow missing'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-motion-'));
const env = Object.assign({}, process.env, { PYTHONUTF8: '1' }); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const py = (script, args) => spawnSync('python', [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const ff = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, 'ffmpeg: ' + r.stderr); };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const readBrief = () => JSON.parse(fs.readFileSync(path.join(jobDir, 'hybrid-brief.json'), 'utf8'));

ok(run('set-root.js', ['.', '--no-guards']), 'set-root');
ok(run('scaffold-client.js', ['3echo', '3echo']), 'scaffold-client');
let r = run('scaffold-job.js', ['3echo', 'rooftop', 'Rooftop']); ok(r, 'scaffold-job');
const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
const jobDir = path.join(tmp, 'workspaces', '3echo', 'jobs', jobId);

const release = path.join(tmp, 'release'); fs.mkdirSync(path.join(release, 'storyboard', 'v1'), { recursive: true });
fs.writeFileSync(path.join(release, 'script.md'), '# Rooftop\n\nScene 1: Maya on the rooftop, the camera tracks round her.\n');
fs.writeFileSync(path.join(release, 'concept-breakdown.xlsx'), 'x'); fs.writeFileSync(path.join(release, 'call-sheet-day-01.pdf'), 'x');
writeJson(path.join(release, 'storyboard.json'), { schemaVersion: '1.0', panels: [{ id: 'P01', scene: 1, storyOrder: 1, caption: 'Maya on the rooftop', location: 'rooftop', durationSec: 2 }] });
ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180', '-frames:v', '1', path.join(release, 'storyboard', 'v1', 'P01.png')]);

const drive = path.join(tmp, 'shoot');
const plateFile = path.join(drive, 'footage', 'plates', 'P01.mp4');
const plate = x0 => { fs.mkdirSync(path.dirname(plateFile), { recursive: true }); ff(['-f', 'lavfi', '-i', `color=c=0x00B140:s=320x180:d=2:r=25[bg];color=c=0xD2691E:s=70x110:d=2:r=25[fg];[bg][fg]overlay=x='${x0}+30*t':y=40`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', plateFile]); };
plate(40);
fs.mkdirSync(path.join(drive, 'references', 'locations'), { recursive: true });
ff(['-f', 'lavfi', '-i', 'color=c=0x3A4A8A:s=320x180', '-frames:v', '1', path.join(drive, 'references', 'locations', 'rooftop.png')]);
fs.mkdirSync(path.join(drive, 'audio', 'vo'), { recursive: true });

const setJob = hybrid => { const j = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8')); Object.assign(j, { aspectRatio: '16:9', deliverableDurationSec: 6, audioLed: false, driveFolder: drive, prePipelineReleaseFolder: release, footageSource: 'hybrid', hybrid }); writeJson(path.join(jobDir, 'job.json'), j); };
setJob({ cutout: 'auto', motion: { resolution: '720p' } });
ok(run('route-job.js', [path.join(jobDir, 'job.json')]), 'route');
ok(run('plan-job.js', [path.join(jobDir, 'route.json')]), 'plan');
assert.ok(/hybrid-plates, hybrid-motion, hybrid-composite/.test(fs.readFileSync(path.join(jobDir, 'plan.md'), 'utf8')), 'the plan names the motion skill');
assert.strictEqual(run('motion-transfer.js', ['3echo', jobId, 'brief']).status, 3, 'no motion panel before a person says which');
assert.strictEqual(run('motion-transfer.js', ['3echo', jobId, 'include', 'P01']).status, 2, 'include needs who and when');
ok(run('motion-transfer.js', ['3echo', jobId, 'include', 'P01', '--by', 'creative-director', '--at', new Date().toISOString()]), 'include');
assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8')).hybrid.motionPanels, ['P01']);
ok(run('hybrid.js', ['3echo', jobId, 'brief']), 'hybrid brief');
ok(py('cutout.py', ['3echo', jobId]), 'cutout');

// ---- brief: the plate becomes [Video 1], the library rooftop [Image 1]
r = run('motion-transfer.js', ['3echo', jobId, 'brief']); ok(r, 'motion brief');
let b = readBrief(); let m = b.panels[0].motion;
assert.ok(m && m.status === 'pending' && fs.existsSync(m.refVideo), 'reference clip made: ' + JSON.stringify(m));
assert.ok(/\[Video 1\]/.test(m.prompt) && /\[Image 1\] \(rooftop\)/.test(m.prompt) && /camera move/.test(m.prompt), m.prompt);
assert.strictEqual(m.durationSec, 4, 'a 2 s plate asks the 4 s floor'); assert.strictEqual(m.resolution, '720p'); assert.strictEqual(m.keepActor, true); assert.strictEqual(m.generateAudio, false);
assert.ok(!/audio/.test(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', m.refVideo], { encoding: 'utf8' }).stdout), 'the reference is silent');
r = py('composite.py', ['3echo', jobId]); ok(r, 'composite waits'); assert.ok(/P01 \(motion-transfer clip not generated yet\)/.test(r.stdout), r.stdout);

// ---- nothing is spent or landed before the yes
const hooksUrl = 'file:///' + path.join(PLUGIN, 'hooks', 'hooks.mjs').split(path.sep).join('/');
const hook = () => spawnSync(process.execPath, ['--input-type=module', '-e', "import('" + hooksUrl + "').then(m => console.log(m.refuseBrollWithoutRequest({ command: 'create_video_job', cwd: process.argv[1] }) || 'allowed'))", jobDir], { encoding: 'utf8' }).stdout;
assert.ok(/Motion transfer refused: no approval/.test(hook()), 'hook refuses before the yes: ' + hook());
assert.strictEqual(run('preflight-generation.js', ['3echo', jobId, 'P01', '--kind', 'motion']).status, 3, 'preflight refuses before the yes');
const faithful = path.join(tmp, 'faithful.mp4'), drifted = path.join(tmp, 'drifted.mp4');
const fake = (out, dx) => ff(['-i', plateFile, '-filter_complex', `color=c=0x0A1A6A:s=640x360:d=2:r=24[bg];[0:v]scale=640:360,colorkey=0x00B140:0.3:0.1[fg];[bg][fg]overlay=x=${dx}:y=0:shortest=1,format=yuv420p`, '-an', '-r', '24', '-c:v', 'libx264', '-crf', '12', out]);
fake(faithful, 0); fake(drifted, 160);
assert.strictEqual(run('motion-transfer.js', ['3echo', jobId, 'land', 'P01', '--file', faithful]).status, 3, 'no clip lands without a yes');

ok(run('motion-transfer.js', ['3echo', jobId, 'asset', 'P01', '--video-id', 'vid1', '--image-id', 'img1']), 'asset');
assert.strictEqual(run('preflight-generation.js', ['3echo', jobId, 'P01', '--kind', 'motion']).status, 3, 'preflight wants the quote');
ok(run('motion-transfer.js', ['3echo', jobId, 'quote', 'P01', '--credits', '30']), 'quote');
ok(run('motion-transfer.js', ['3echo', jobId, 'approve', 'motion', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '30']), 'approve');
assert.ok(/allowed/.test(hook()), 'hook allows after the yes');
ok(run('preflight-generation.js', ['3echo', jobId, 'P01', '--kind', 'motion']), 'preflight motion');

// ---- faithful clip: the plate's actor goes back on top, the drift is measured and small
ok(run('motion-transfer.js', ['3echo', jobId, 'land', 'P01', '--file', faithful, '--job-ref', 'j1', '--credits', '30']), 'land');
assert.strictEqual(run('preflight-generation.js', ['3echo', jobId, 'P01', '--kind', 'motion']).status, 3, 'nothing left to generate');
r = py('composite.py', ['3echo', jobId]); ok(r, 'composite');
b = readBrief(); let c = b.panels[0].composite;
assert.strictEqual(b.panels[0].status, 'composited', r.stdout + JSON.stringify(c));
assert.ok(c.actorPreservedPct >= 97 && c.regenActorPct >= 75 && c.keepActor === true && c.brightnessShift === 0, JSON.stringify(c));
ok(run('ingest-footage.js', ['3echo', jobId]), 'ingest');
const man = JSON.parse(fs.readFileSync(path.join(jobDir, 'manifest.json'), 'utf8'));
assert.deepStrictEqual(man.clips.map(x => path.basename(path.dirname(x.path)) + '/' + path.basename(x.path)), ['composite/P01.mp4'], 'only the composite is a clip');

// ---- a model that moved the person is flagged, even though the pasted actor is intact
ok(run('motion-transfer.js', ['3echo', jobId, 'land', 'P01', '--file', drifted]), 'land drifted');
r = py('composite.py', ['3echo', jobId]); ok(r, 'composite drifted');
b = readBrief(); c = b.panels[0].composite;
assert.strictEqual(b.panels[0].status, 'needs-review', JSON.stringify(c)); assert.ok(c.actorPreservedPct >= 97 && c.regenActorPct < 75, JSON.stringify(c));
assert.ok(/FLAGGED: the model's person drifted/.test(r.stdout), r.stdout);

// ---- keepActor off: the model's own person is used, so its drift is the actor figure
setJob({ cutout: 'auto', motionPanels: ['P01'], motionDecision: { by: 'creative-director', at: new Date().toISOString(), panels: ['P01'] }, motion: { resolution: '720p', keepActor: false } });
ok(run('motion-transfer.js', ['3echo', jobId, 'brief']), 're-brief keepActor off');
assert.strictEqual(readBrief().panels[0].motion.status, 'delivered', 'unchanged references keep the landed clip');
r = py('composite.py', ['3echo', jobId]); ok(r, 'composite keepActor off');
b = readBrief(); c = b.panels[0].composite;
assert.strictEqual(c.keepActor, false); assert.strictEqual(b.panels[0].status, 'needs-review'); assert.ok(c.actorPreservedPct < 97, JSON.stringify(c));

// ---- a changed plate voids the request, its yes and its clip
plate(90);
ok(run('hybrid.js', ['3echo', jobId, 'brief']), 'hybrid brief after plate change');
assert.strictEqual(readBrief().panels[0].motion, null);
ok(py('cutout.py', ['3echo', jobId]), 'cutout again');
ok(run('motion-transfer.js', ['3echo', jobId, 'brief']), 'motion brief again');
assert.strictEqual(readBrief().panels[0].motion.status, 'pending');
ok(run('motion-transfer.js', ['3echo', jobId, 'asset', 'P01', '--video-id', 'vid2', '--image-id', 'img1']), 'asset again');
ok(run('motion-transfer.js', ['3echo', jobId, 'quote', 'P01', '--credits', '30']), 'quote again');
r = run('preflight-generation.js', ['3echo', jobId, 'P01', '--kind', 'motion']);
assert.strictEqual(r.status, 3, 'the old yes does not cover the new plate'); assert.ok(/changed since the yes/.test(r.stderr), r.stderr);
assert.ok(/Motion transfer refused/.test(hook()), 'hook refuses too');

if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('kept ' + tmp);
console.log('motion-transfer.e2e: brief, spend refusals, approval, landing, actor pasted back, drift flagged, keepActor off, composite-only ingest and plate-change voiding all correct');
