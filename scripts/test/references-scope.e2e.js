#!/usr/bin/env node
// References stay inside their project. A shared library split by project gives this job its own
// folder plus shared/, never another project's (even when a name matches); a project item beats a
// shared one of the same name; two pictures with one name at the same level block generation until a
// person picks; a library outside the project that is not split by project raises a warning; the
// reference set is approved on the board and fingerprinted, so a file swapped afterwards voids it and
// the spend guard (and the hook) refuse. No ffmpeg needed: reference files only need to exist.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const S = f => path.join(PLUGIN, 'scripts', f);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-refscope-'));
const env = Object.assign({}, process.env); delete env.CREATIVE_STUDIO_POST_BOARD_URL; delete env.CREATIVE_STUDIO_POST_ROOT;
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { cwd: tmp, encoding: 'utf8', env });
const ok = (r, what) => assert.strictEqual(r.status, 0, what + ' failed (exit ' + r.status + '):\n' + r.stdout + r.stderr);
const put = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || path.basename(f)); };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };

ok(run('set-root.js', ['.', '--no-guards']), 'set-root');
ok(run('scaffold-client.js', ['3echo', '3echo']), 'scaffold-client');
let r = run('scaffold-job.js', ['3echo', 'late-again', 'Late', 'Again']); ok(r, 'scaffold-job');
const jobId = (r.stdout.match(/job-id: (job-\S+)/) || [])[1];
const jobDir = path.join(tmp, 'workspaces', '3echo', 'jobs', jobId);

const release = path.join(tmp, 'release');
put(path.join(release, 'script.md'), '# Late Again\n\nScene 1: Maya in the apartment.\nScene 2: The harbour at night.\nScene 3: Maya on the stairs.\n');
writeJson(path.join(release, 'storyboard.json'), { schemaVersion: '1.0', panels: [
  { id: 'P01', scene: 1, storyOrder: 1, caption: 'Maya in the apartment' },
  { id: 'P02', scene: 2, storyOrder: 2, caption: 'The harbour at night' },
  { id: 'P03', scene: 3, storyOrder: 3, caption: 'Maya climbs the stairwell' },
] });
for (const id of ['P01', 'P02', 'P03']) put(path.join(release, 'storyboard', 'v1', id + '.png'));

// One library for the whole client, outside the project, split by project.
const lib = path.join(tmp, '3echo-library');
put(path.join(lib, 'Late Again', 'Locations', 'apartment.jpg'), 'late-again apartment');
put(path.join(lib, 'Late Again', 'Cast', 'maya', 'front.png'), 'late-again maya');
put(path.join(lib, 'Late Night', 'Locations', 'apartment.jpg'), 'night-shift apartment');   // same name, other project
put(path.join(lib, 'Late Night', 'Locations', 'harbour.jpg'), 'night-shift harbour');       // only in the other project
put(path.join(lib, 'Shared', 'Locations', 'apartment.jpg'), 'shared apartment');             // overridden by the project's
put(path.join(lib, 'Shared', 'Backgrounds', 'stairwell.jpg'), 'shared stairwell A');
put(path.join(lib, 'Shared', 'Locations', 'stairwell.jpg'), 'shared stairwell B');           // same level, same name: a clash

const drive = path.join(tmp, 'shoot'); fs.mkdirSync(path.join(drive, 'footage'), { recursive: true });
const job = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
Object.assign(job, { aspectRatio: '9:16', deliverableDurationSec: 18, audioLed: false, driveFolder: drive, prePipelineReleaseFolder: release, referencesFolder: lib, footageSource: 'generated', generation: { clipSec: 6 } });
writeJson(path.join(jobDir, 'job.json'), job);

r = run('scan-references.js', ['3echo', jobId]); ok(r, 'scan');
const inv = JSON.parse(fs.readFileSync(path.join(jobDir, 'reference-inventory.json'), 'utf8'));
assert.strictEqual(inv.library.layout, 'by-project');
assert.strictEqual(inv.library.project, 'Late Again', 'the project folder is matched by title');
assert.strictEqual(inv.library.shared, 'Shared');
assert.deepStrictEqual(inv.library.otherProjects, ['Late Night'], 'the other project is ignored');
const apt = inv.available.locations.find(l => l.name === 'apartment');
assert.strictEqual(apt.scope, 'project', 'the project apartment wins over the shared one');
assert.ok(apt.overrides && apt.overrides.some(o => /Shared/.test(o)), 'and the override is recorded');
assert.ok(!inv.available.locations.some(l => l.name === 'harbour'), "another project's harbour never enters this project");
assert.deepStrictEqual(inv.panels.find(p => p.id === 'P03').clashes.map(c => c.name), ['stairwell'], 'two shared stairwells clash');
assert.ok(/ignored: Late Night/.test(r.stdout) && /share a name/.test(r.stdout), r.stdout);

// The brief never attaches the clashing picture, and generation is blocked until it is resolved.
ok(run('generate-clips.js', ['3echo', jobId, 'brief']), 'brief');
let brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'generation-brief.json'), 'utf8'));
const p1 = brief.panels.find(p => p.id === 'P01');
assert.ok(p1.refs.images.some(i => /Late Again[\\/]Locations[\\/]apartment\.jpg$/.test(i.file)), 'P01 carries the project apartment, not the shared or other one');
assert.ok(!JSON.stringify(brief).includes('Late Night'), "nothing from the other project is in the brief");
assert.ok(brief.panels.find(p => p.id === 'P03').clashes.length === 1);
r = run('generate-clips.js', ['3echo', jobId, 'approve', 'refs', '--by', 'creative-director', '--at', new Date().toISOString()]);
assert.strictEqual(r.status, 3, 'a clash blocks the reference approval:\n' + r.stdout + r.stderr);

// Resolve the clash (remove one stairwell), brief again, approve the set.
fs.rmSync(path.join(lib, 'Shared', 'Backgrounds'), { recursive: true, force: true });
ok(run('generate-clips.js', ['3echo', jobId, 'brief']), 'brief again');
r = run('generate-clips.js', ['3echo', jobId, 'refset']); ok(r, 'refset');
assert.ok(/P01: .*maya.*apartment|P01: .*apartment.*maya/.test(r.stdout), r.stdout);
fs.writeFileSync(path.join(jobDir, 'status.md'), '# status\ncredits_spent: 0\n');
ok(run('generate-clips.js', ['3echo', jobId, 'approve', 'sample', '--by', 'creative-director', '--at', new Date().toISOString(), '--credits', '14']), 'approve sample');
r = run('preflight-generation.js', ['3echo', jobId, 'sample', '--kind', 'generate']);
assert.strictEqual(r.status, 3, 'no reference approval yet:\n' + r.stderr); assert.ok(/not been approved/.test(r.stderr));
ok(run('generate-clips.js', ['3echo', jobId, 'approve', 'refs', '--by', 'creative-director', '--at', new Date().toISOString()]), 'approve refs');
ok(run('preflight-generation.js', ['3echo', jobId, 'sample', '--kind', 'generate']), 'preflight passes once the set is approved');

// Someone swaps the project apartment after the approval: the fingerprint no longer matches.
fs.writeFileSync(path.join(lib, 'Late Again', 'Locations', 'apartment.jpg'), 'a different apartment');
r = run('preflight-generation.js', ['3echo', jobId, 'sample', '--kind', 'generate']);
assert.strictEqual(r.status, 3); assert.ok(/changed since they were approved/.test(r.stderr), r.stderr);

// The hook refuses a spend while a reference set is unapproved.
const hooks = path.join(PLUGIN, 'hooks', 'hooks.mjs').replace(/\\/g, '/');
brief = JSON.parse(fs.readFileSync(path.join(jobDir, 'generation-brief.json'), 'utf8')); delete brief.approvals.refs;
fs.writeFileSync(path.join(jobDir, 'generation-brief.json'), JSON.stringify(brief));
r = spawnSync(process.execPath, ['--input-type=module', '-e', "import('file:///" + hooks + "').then(m => console.log(m.refuseBrollWithoutRequest({ command: 'create_video_job', cwd: process.argv[1] }) || 'allowed'))", jobDir], { encoding: 'utf8' });
assert.ok(/reference set has not been approved/.test(r.stdout), 'hook: ' + r.stdout + r.stderr);

// A flat library outside the project folder is flagged as unscoped.
const flat = path.join(tmp, 'loose-library'); put(path.join(flat, 'Locations', 'apartment.jpg'));
Object.assign(job, { referencesFolder: flat }); writeJson(path.join(jobDir, 'job.json'), job);
r = run('scan-references.js', ['3echo', jobId]); ok(r, 'scan flat');
assert.ok(/WARNING .*not split by project/.test(r.stdout), r.stdout);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('references-scope.e2e: project scoping, shared override, clash block, fingerprinted approval and unscoped warning all correct');
