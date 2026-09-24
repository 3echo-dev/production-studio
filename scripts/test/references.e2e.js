#!/usr/bin/env node
// References at intake and in the generation brief, on a fixture root: a library with a character
// (by folder, with an alias), a location, wardrobe and a motion clip; a storyboard that names a
// second character in capitals the library does not have; one clip already in footage/generated/.
// Checks the inventory (available, per panel, from text, unused, provided vs generate), the refs
// each panel carries and the legend in its prompt, the upload cache, and that a provided clip is
// neither generated nor counted by the spend guard. Needs ffmpeg; skipped cleanly without it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('skip references.e2e: ffmpeg missing'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-refs-'));
const env = Object.assign({}, process.env); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const ff = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, 'ffmpeg: ' + r.stderr); };
const png = (file, c) => { fs.mkdirSync(path.dirname(file), { recursive: true }); ff(['-f', 'lavfi', '-i', 'color=c=' + c + ':s=64x64', '-frames:v', '1', file]); };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };

ok(run('set-root.js', ['.', '--no-guards']), 'set-root');
ok(run('scaffold-client.js', ['acme', 'Acme']), 'scaffold-client');
let r = run('scaffold-job.js', ['acme', 'drama', 'Micro']); ok(r, 'scaffold-job');
const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
const jobDir = path.join(tmp, 'workspaces', 'acme', 'jobs', jobId);

// Release: P01 names Maya in words, P02 is "the girl" (an alias of mei) and THE LANDLORD in capitals,
// P03 carries explicit storyboard fields, one of them a location the library does not have.
const release = path.join(tmp, 'release');
fs.writeFileSync((fs.mkdirSync(release, { recursive: true }), path.join(release, 'script.md')), '# Micro\n\nScene 1: Maya at the apartment window, VO: "Late again."\nScene 2: THE LANDLORD knocks; the girl hides.\nScene 3: The street.\n');
const panels = [
  { id: 'P01', scene: 1, storyOrder: 1, caption: 'Maya waits at the window' },
  { id: 'P02', scene: 2, storyOrder: 2, caption: 'The girl hides behind the door' },
  { id: 'P03', scene: 3, storyOrder: 3, caption: 'Wide street', characters: ['Maya'], location: 'Harbour', wardrobe: 'raincoat' },
];
writeJson(path.join(release, 'storyboard.json'), { schemaVersion: '1.0', panels });
for (const p of panels) png(path.join(release, 'storyboard', 'v1', p.id + '.png'), 'gray');

// Library under the footage folder (the default place).
const drive = path.join(tmp, 'gen'); const lib = path.join(drive, 'references');
png(path.join(lib, 'characters', 'maya', 'front.png'), 'red'); png(path.join(lib, 'characters', 'maya', 'side.png'), 'orange');
png(path.join(lib, 'characters', 'mei', 'a.png'), 'blue');
png(path.join(lib, 'locations', 'apartment.png'), 'green');
png(path.join(lib, 'wardrobe', 'raincoat', 'coat.png'), 'yellow');
png(path.join(lib, 'props', 'old-key.png'), 'white');
fs.mkdirSync(path.join(lib, 'motion'), { recursive: true });
ff(['-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=1', path.join(lib, 'motion', 'P03.mp4')]);
writeJson(path.join(lib, 'labels.json'), { characters: { mei: { aliases: ['the girl'] } } });
// One clip already made for P02.
fs.mkdirSync(path.join(drive, 'footage', 'generated'), { recursive: true });
ff(['-f', 'lavfi', '-i', 'color=c=black:s=64x112:d=2', path.join(drive, 'footage', 'generated', 'P02.mp4')]);

const job = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
Object.assign(job, { aspectRatio: '9:16', deliverableDurationSec: 18, audioLed: false, driveFolder: drive, prePipelineReleaseFolder: release, footageSource: 'generated', generation: { clipSec: 6 } });
writeJson(path.join(jobDir, 'job.json'), job);

// ---- the intake inventory
r = run('scan-references.js', ['acme', jobId]); ok(r, 'scan-references');
const inv = JSON.parse(fs.readFileSync(path.join(jobDir, 'reference-inventory.json'), 'utf8'));
assert.ok(inv.library.exists);
assert.deepStrictEqual(inv.available.characters.map(c => c.name).sort(), ['maya', 'mei']);
assert.strictEqual(inv.available.characters.find(c => c.name === 'maya').images, 2);
assert.deepStrictEqual(inv.available.locations.map(c => c.name), ['apartment']);
const row = id => inv.panels.find(p => p.id === id);
assert.deepStrictEqual(row('P01').uses.map(u => u.name).sort(), ['apartment', 'maya'], 'P01 finds Maya and the apartment in its words');
assert.deepStrictEqual(row('P02').uses.map(u => u.name), ['mei'], 'the girl resolves to mei through the alias');
assert.ok(row('P02').fromText.some(m => m.name === 'THE LANDLORD'), 'a capitalised character with no picture is drawn from text');
assert.ok(row('P03').fromText.some(m => m.kind === 'locations' && m.name === 'Harbour'), 'an explicit location the library lacks');
assert.ok(row('P03').uses.some(u => u.kind === 'wardrobe' && u.name === 'raincoat') && row('P03').uses.some(u => u.kind === 'motion'), 'explicit wardrobe and the motion clip by panel id');
assert.deepStrictEqual(inv.footage, { provided: ['P02'], generate: ['P01', 'P03'] });
assert.deepStrictEqual(inv.unused.map(u => u.name), ['old-key'], 'the prop nobody mentions');
assert.ok(/from text/.test(r.stdout) && /THE LANDLORD/.test(r.stdout) && /already there/.test(r.stdout), 'plain summary:\n' + r.stdout);

// ---- the brief carries the references and names them
r = run('generate-clips.js', ['acme', jobId, 'brief']); ok(r, 'brief');
const brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'generation-brief.json'), 'utf8'));
const bp = id => brief.panels.find(p => p.id === id);
assert.strictEqual(bp('P01').refs.images[0].kind, 'frame', 'the storyboard frame is always [Image 1]');
assert.strictEqual(bp('P01').refs.images.filter(i => i.kind === 'characters').length, 2, 'a lone character sends both of its pictures');
assert.ok(/\[Image 2\] maya \(character\)/.test(bp('P01').prompt), 'the prompt names what each picture is: ' + bp('P01').prompt);
assert.strictEqual(bp('P03').refs.videos.length, 1); assert.ok(/\[Video 1\] P03/.test(bp('P03').prompt));
assert.ok(bp('P03').refs.images.length <= 9 && bp('P03').refs.videos.length <= 3, 'within the model limits');
assert.strictEqual(bp('P02').status, 'provided', 'a clip already there is used as it is');
assert.ok(bp('P02').sha256 && bp('P02').file.endsWith('P02.mp4'));
assert.ok(/Already there, used as they are, not generated: P02/.test(r.stdout));

// ---- the upload cache: refs lists what to upload, asset records it, refs then returns the id
r = run('generate-clips.js', ['acme', jobId, 'refs', 'P01']); ok(r, 'refs');
let refs = JSON.parse(r.stdout);
assert.strictEqual(refs.toUpload.length, 4, 'frame + apartment + two of Maya, nothing uploaded yet');
ok(run('generate-clips.js', ['acme', jobId, 'asset', refs.toUpload.find(f => /apartment/.test(f)), '--id', 'asset-apartment']), 'asset');
r = run('generate-clips.js', ['acme', jobId, 'refs', 'P01']); refs = JSON.parse(r.stdout);
assert.deepStrictEqual(refs.assetIds, ['asset-apartment']); assert.strictEqual(refs.toUpload.length, 3);

// ---- the spend guard does not count the provided clip
fs.writeFileSync(path.join(jobDir, 'status.md'), '# status\ncredits_spent: 0\n');
ok(run('generate-clips.js', ['acme', jobId, 'approve', 'batch', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '28']), 'approve batch');
r = run('preflight-generation.js', ['acme', jobId, 'batch', '--kind', 'generate']);
assert.ok(!/P02/.test(r.stdout + r.stderr) || /P01|P03/.test(r.stdout + r.stderr), 'P02 is not in the batch to generate:\n' + r.stdout + r.stderr);
r = run('generate-clips.js', ['acme', jobId, 'status']); ok(r, 'status');
assert.ok(/1 provided/.test(r.stdout), r.stdout);

// ---- no library at all: every panel carries only its frame, and says so
fs.rmSync(lib, { recursive: true, force: true });
r = run('generate-clips.js', ['acme', jobId, 'brief']); ok(r, 'brief without a library');
assert.ok(/No reference library/.test(r.stdout));
const b2 = JSON.parse(fs.readFileSync(path.join(jobDir, 'generation-brief.json'), 'utf8'));
assert.ok(b2.panels.every(p => p.refs.images.length === 1 && p.refs.videos.length === 0));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('references.e2e: inventory, per-panel references, prompt legend, upload cache and provided clips all correct');
