#!/usr/bin/env node
// The generated route end to end on a fixture root: a job with footageSource "generated" routes
// without call sheets or rushes, plans the generate row, briefs one request per panel, refuses to
// land a clip without a yes, lands synthetic clips, ingests them, cuts by panel id and renders
// the silent preview and a master. Needs ffmpeg and Pillow; skipped cleanly without them.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
const have = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return r.status === 0; };
if (!have('ffmpeg', ['-version']) || !have('python', ['-c', 'import PIL'])) { console.log('skip generated.e2e: ffmpeg or Pillow missing'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-generated-'));
const env = Object.assign({}, process.env, { PYTHONUTF8: '1' }); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const py = (script, args) => spawnSync('python', [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const ff = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, 'ffmpeg: ' + r.stderr); };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };

ok(run('set-root.js', ['.', '--no-guards']), 'set-root');
ok(run('scaffold-client.js', ['acme', 'Acme']), 'scaffold-client');
let r = run('scaffold-job.js', ['acme', 'drama', 'Micro', 'Drama']); ok(r, 'scaffold-job');
const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
const jobDir = path.join(tmp, 'workspaces', 'acme', 'jobs', jobId);

// The release: script, three panels with images, breakdown; no call sheets (there was no shoot).
const release = path.join(tmp, 'release'); fs.mkdirSync(path.join(release, 'storyboard', 'v1'), { recursive: true });
fs.writeFileSync(path.join(release, 'script.md'), '# Micro\n\nScene 1: Rain on the window, VO: "Late again."\nScene 2: She turns, VO: "Not tonight."\nScene 3: Door closes.\n');
fs.writeFileSync(path.join(release, 'concept-breakdown.xlsx'), 'x');
const panels = [{ id: 'P01', scene: 1, storyOrder: 1, caption: 'Rain on the window', durationSec: 5 }, { id: 'P02', scene: 2, storyOrder: 2, caption: 'She turns to camera' }, { id: 'P03', scene: 3, storyOrder: 3, caption: 'Door closes', durationSec: 4 }];
writeJson(path.join(release, 'storyboard.json'), { schemaVersion: '1.0', panels });
for (const p of panels) ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180', '-frames:v', '1', path.join(release, 'storyboard', 'v1', p.id + '.png')]);
const drive = path.join(tmp, 'gen'); fs.mkdirSync(path.join(drive, 'footage'), { recursive: true });

// Route: generated needs no rushes and no call sheets.
const job = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
Object.assign(job, { aspectRatio: '9:16', deliverableDurationSec: 20, audioLed: false, driveFolder: drive, prePipelineReleaseFolder: release, footageSource: 'generated', generation: { clipSec: 6, resolution: '720p', generateAudio: false } });
writeJson(path.join(jobDir, 'job.json'), job);
r = run('route-job.js', [path.join(jobDir, 'job.json')]); ok(r, 'route generated');
const route = JSON.parse(fs.readFileSync(path.join(jobDir, 'route.json'), 'utf8'));
assert.ok(route.tags.includes('generated_footage') && route.tags.includes('vertical'), 'tags: ' + route.tags);
assert.ok(route.riskFlags.includes('credit_spend'), 'credit risk flagged');
ok(run('plan-job.js', [path.join(jobDir, 'route.json')]), 'plan');
const plan = fs.readFileSync(path.join(jobDir, 'plan.md'), 'utf8');
assert.ok(/\| 2 \| generate \+ ingest \|.*generate-clips/.test(plan), 'row 2 is the generate stage');
assert.ok(/\| 3 \|.*sequence-first-cut --by-panel/.test(plan), 'row 3 cuts by panel id');
assert.ok(/\| 11 \|.*bundle\/master\.mp4/.test(plan), 'row 11 renders the master');

// A shot job is refused by the generate script.
r = run('generate-clips.js', ['acme', jobId, 'status']); assert.strictEqual(r.status, 3, 'no brief yet');
ok(run('generate-clips.js', ['acme', jobId, 'brief']), 'brief');
const brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'generation-brief.json'), 'utf8'));
assert.strictEqual(brief.panels.length, 3); assert.strictEqual(brief.ratio, '9:16');
assert.deepStrictEqual(brief.panels.map(p => p.durationSec), [5, 6, 4], 'panel length, else clipSec');
assert.ok(/Late again/.test(brief.panels[0].prompt), 'the script line is in the prompt');
assert.strictEqual(brief.panels[0].idempotencyKey, jobId + '/generate/P01');

// No yes, no spend, no landing.
r = run('preflight-generation.js', ['acme', jobId, 'sample', '--kind', 'generate']); assert.strictEqual(r.status, 3, 'guard refuses without an approval');
const clip = id => { const f = path.join(tmp, id + '-gen.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc2=s=720x1280:r=25', '-t', '6', '-pix_fmt', 'yuv420p', f]); return f; };
r = run('generate-clips.js', ['acme', jobId, 'land', 'P01', '--file', clip('P01')]); assert.strictEqual(r.status, 3, 'landing refused without a yes');
ok(run('generate-clips.js', ['acme', jobId, 'approve', 'sample', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '4']), 'approve sample');
ok(run('generate-clips.js', ['acme', jobId, 'quote', 'P01', '--credits', '4']), 'quote');
ok(run('preflight-generation.js', ['acme', jobId, 'sample', '--kind', 'generate']), 'guard passes the sample');
r = run('generate-clips.js', ['acme', jobId, 'approve', 'sample', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '2']); ok(r, 'approve less');
r = run('preflight-generation.js', ['acme', jobId, 'sample', '--kind', 'generate']); assert.strictEqual(r.status, 1, 'estimate above the approved figure is refused');
ok(run('generate-clips.js', ['acme', jobId, 'approve', 'sample', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '4']), 'approve again');
ok(run('generate-clips.js', ['acme', jobId, 'land', 'P01', '--file', clip('P01'), '--credits', '4']), 'land the sample');
r = run('generate-clips.js', ['acme', jobId, 'land', 'P02', '--file', clip('P02')]); assert.strictEqual(r.status, 3, 'the batch needs its own yes');
ok(run('generate-clips.js', ['acme', jobId, 'approve', 'batch', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '8']), 'approve batch');
ok(run('preflight-generation.js', ['acme', jobId, 'batch', '--kind', 'generate']), 'guard passes the batch');
for (const id of ['P02', 'P03']) ok(run('generate-clips.js', ['acme', jobId, 'land', id, '--file', clip(id), '--credits', '4']), 'land ' + id);
r = run('generate-clips.js', ['acme', jobId, 'status']); ok(r, 'status'); assert.ok(/3\/3 delivered/.test(r.stdout) && /credits spent 12/.test(r.stdout), r.stdout);
assert.ok(fs.existsSync(path.join(drive, 'footage', 'generated', 'P03.mp4')), 'clips land under footage/generated');

// Ingest and the panel-id cut.
ok(run('ingest-footage.js', ['acme', jobId]), 'ingest');
const man = JSON.parse(fs.readFileSync(path.join(jobDir, 'manifest.json'), 'utf8'));
assert.strictEqual(man.clips.length, 3);
r = py('sequence-first-cut.py', ['acme', jobId, '--by-panel']); ok(r, 'sequence by panel');
const edl = JSON.parse(fs.readFileSync(path.join(jobDir, 'rough-edl.json'), 'utf8'));
assert.strictEqual(edl.generatedBy, 'panel-id'); assert.deepStrictEqual(edl.cuts.map(c => c.panelId), ['P01', 'P02', 'P03']);
assert.deepStrictEqual(edl.cuts.map(c => c.outSec), [5, 6, 4], 'a panel length trims the clip; no length keeps it whole');
ok(run('validate-schema.js', [path.join(PLUGIN, 'schemas', 'edl.schema.json'), path.join(jobDir, 'rough-edl.json')]), 'edl schema');
assert.ok(fs.existsSync(path.join(jobDir, 'timeline.png')), 'timeline strip');
ok(run('render-preview.js', ['acme', jobId, '--stage', 'cut', '--height', '360']), 'silent preview');
assert.ok(fs.existsSync(path.join(jobDir, 'previews', 'cut-v1.mp4')) && fs.statSync(path.join(jobDir, 'previews', 'cut-v1-strip.png')).size < 200 * 1024, 'preview and strip');
console.log('ok   generated route: routed without rushes, briefed 3 panels, guard held twice, 3 clips landed, cut by panel id, preview rendered');