#!/usr/bin/env node
// The intake inventory before anything is spent. A hybrid job with three panels: P01 on a green
// screen with a locked camera (library background), P02 with no screen and a panning camera
// (background to generate), P03 with no plate; the script has three VO lines and one take, no music.
// Then a shoot job whose rushes name scene 1 but not scene 2. Checks the per-panel report and the one
// list of gaps the board asks about. Needs ffmpeg and Pillow; skipped cleanly without them.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
const have = (c, a) => spawnSync(c, a, { encoding: 'utf8' }).status === 0;
if (!have('ffmpeg', ['-version']) || !have('python', ['-c', 'import PIL'])) { console.log('skip intake-check.e2e: ffmpeg or Pillow missing'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-intake-'));
const env = Object.assign({}, process.env, { PYTHONUTF8: '1' }); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const ff = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, 'ffmpeg: ' + r.stderr); };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const touch = f => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); };

ok(run('set-root.js', ['.', '--no-guards']), 'set-root');
ok(run('scaffold-client.js', ['3echo', '3echo']), 'scaffold-client');
const newJob = (name, patch) => {
  const r = run('scaffold-job.js', ['3echo', name, name]); ok(r, 'scaffold-job ' + name);
  const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
  const dir = path.join(tmp, 'workspaces', '3echo', 'jobs', jobId);
  const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
  writeJson(path.join(dir, 'job.json'), Object.assign(job, { aspectRatio: '16:9', deliverableDurationSec: 6, audioLed: false }, patch));
  return { jobId, dir };
};

// ---- hybrid
const release = path.join(tmp, 'release'); fs.mkdirSync(path.join(release, 'storyboard', 'v1'), { recursive: true });
fs.writeFileSync(path.join(release, 'script.md'), '# Late Again\n\nScene 1: Maya waits in the apartment. VO: "Late again."\nScene 2: Maya runs to the harbour. VO: "Always late."\nScene 3: The boat leaves. VO: "Not this time."\n');
writeJson(path.join(release, 'storyboard.json'), { schemaVersion: '1.0', panels: [
  { id: 'P01', scene: 1, storyOrder: 1, caption: 'Maya waits in the apartment', durationSec: 2 },
  { id: 'P02', scene: 2, storyOrder: 2, caption: 'Maya runs', location: 'harbour', durationSec: 2 },
  { id: 'P03', scene: 3, storyOrder: 3, caption: 'The boat leaves', location: 'harbour', durationSec: 2 },
] });
for (const id of ['P01', 'P02', 'P03']) ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180', '-frames:v', '1', path.join(release, 'storyboard', 'v1', id + '.png')]);
const drive = path.join(tmp, 'shoot'); const plates = path.join(drive, 'footage', 'plates'); fs.mkdirSync(plates, { recursive: true });
// P01: green screen, locked camera, the actor moving in the middle.
ff(['-f', 'lavfi', '-i', "color=c=0x00B140:s=320x180:d=2:r=24[bg];color=c=0xD2691E:s=70x110:d=2:r=24[fg];[bg][fg]overlay=x='100+30*t':y=40", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(plates, 'P01.mp4')]);
// P02: no screen, the camera pans across a busy set.
ff(['-f', 'lavfi', '-i', 'testsrc=s=960x180:d=2:r=24', '-vf', "crop=320:180:x='t*300':y=0", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(plates, 'P02.mp4')]);
fs.mkdirSync(path.join(drive, 'references', 'locations'), { recursive: true });
ff(['-f', 'lavfi', '-i', 'color=c=0x3A4A8A:s=320x180', '-frames:v', '1', path.join(drive, 'references', 'locations', 'apartment.png')]);
touch(path.join(drive, 'audio', 'vo', 'take-01.wav'));
const H = newJob('late-again', { driveFolder: drive, prePipelineReleaseFolder: release, footageSource: 'hybrid', hybrid: { cutout: 'auto' } });

let r = run('scan-references.js', ['3echo', H.jobId]); ok(r, 'scan hybrid');
const out = r.stdout;
let inv = JSON.parse(fs.readFileSync(path.join(H.dir, 'reference-inventory.json'), 'utf8'));
const P = id => inv.panels.find(p => p.id === id);
assert.strictEqual(P('P01').screen, 'green', 'P01 is on a green screen'); assert.strictEqual(P('P01').cutout, 'chromakey');
assert.strictEqual(P('P01').cameraMoves, false, 'P01 camera is locked');
assert.strictEqual(P('P01').background.source, 'library'); assert.strictEqual(P('P01').background.credits, 0);
assert.strictEqual(P('P02').screen, null, 'P02 has no screen'); assert.strictEqual(P('P02').cutout, 'rembg');
assert.strictEqual(P('P02').cameraMoves, true, 'P02 camera pans');
assert.strictEqual(P('P02').background.source, 'generate');
assert.strictEqual(P('P03').plate, null);
assert.deepStrictEqual(inv.hybrid.noPlate, ['P03']);
assert.strictEqual(inv.hybrid.backgroundCredits, 1, 'one harbour background for P02 and P03, 1 credit');
assert.deepStrictEqual([inv.audio.voLines, inv.audio.voTakes, inv.audio.bgm.length], [3, 1, 0]);
const kinds = inv.gaps.map(g => g.kind);
for (const k of ['plate', 'camera', 'backgrounds', 'vo', 'bgm']) assert.ok(kinds.includes(k), 'gap ' + k + ' listed: ' + kinds);
assert.strictEqual(kinds.includes('rembg'), inv.hybrid.rembgInstalled === false, 'rembg gap only when it is missing');
assert.ok(/P03  plate MISSING/.test(out) && /P01  plate ✓ · green screen · background apartment \(library, free\)/.test(out), out);
assert.ok(/P02 .*camera moves.*background harbour \(generate, 1 credit\)/.test(out), out);
assert.ok(/Audio: VO 1 take\(s\) for 3 script line\(s\) · music none found/.test(out), out);
assert.ok(/To answer once on the board/.test(out), out);
assert.ok(!fs.existsSync(path.join(drive, 'footage', 'backgrounds')) && !fs.existsSync(path.join(drive, 'footage', 'cutout')), 'intake spends and cuts nothing');

// ---- shoot: rushes name scene 1 only; the reference and plate folders are not rushes
const drive2 = path.join(tmp, 'shoot2');
touch(path.join(drive2, 'footage', 'day-01', 'A001_C001_scene-1_t1.mov'));
touch(path.join(drive2, 'footage', 'day-01', 'A001_C002.mov'));
touch(path.join(drive2, 'footage', 'references', 'motion', 'pan.mp4'));
for (const k of ['vo', 'bgm']) ['a', 'b', 'c'].forEach(n => touch(path.join(drive2, 'audio', k, n + '.wav')));
const release2 = path.join(tmp, 'release2'); fs.mkdirSync(release2, { recursive: true });
fs.writeFileSync(path.join(release2, 'script.md'), '# Two\n\nScene 1: a.\nScene 2: b.\n');
writeJson(path.join(release2, 'storyboard.json'), { schemaVersion: '1.0', panels: [{ id: 'P01', scene: 1, storyOrder: 1, caption: 'a' }, { id: 'P02', scene: 2, storyOrder: 2, caption: 'b' }] });
const Sj = newJob('two-scenes', { driveFolder: drive2, prePipelineReleaseFolder: release2, footageSource: 'shoot' });
r = run('scan-references.js', ['3echo', Sj.jobId]); ok(r, 'scan shoot');
inv = JSON.parse(fs.readFileSync(path.join(Sj.dir, 'reference-inventory.json'), 'utf8'));
assert.deepStrictEqual([inv.rushes.clips, inv.rushes.tagged, inv.rushes.untagged], [2, 1, 1], 'two rushes, the reference clip is not one');
assert.deepStrictEqual(inv.rushes.scenesWithout, ['2']);
assert.deepStrictEqual(inv.gaps.map(g => g.kind), ['rushes'], 'music and VO are covered (no VO lines); only scene 2 is a gap');
assert.ok(/P02  no clip names scene 2/.test(r.stdout), r.stdout);

if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('kept ' + tmp);
console.log('intake-check.e2e: ok');
