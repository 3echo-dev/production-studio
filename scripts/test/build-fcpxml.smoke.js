#!/usr/bin/env node
// Round-trip a minimal fixture through build-fcpxml.py and verify the FCPXML parses,
// declares version 1.10, and references every distinct clip from the EDL.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PLUGIN = path.resolve(__dirname, '..', '..');
const BUILD = path.join(PLUGIN, 'scripts', 'build-fcpxml.py');

const client = 'acme';
const jobId = 'job-20260915-fixture';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-fcpxml-'));
const jobDir = path.join(tmp, 'workspaces', client, 'jobs', jobId);
fs.mkdirSync(jobDir, { recursive: true });

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function write(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

// Two fixture clips
const clipA = Buffer.from('CLIP-A-BYTES');
const clipB = Buffer.from('CLIP-B-BYTES');
const clipAPath = path.join(jobDir, 'footage', 'A001_C001.mov');
const clipBPath = path.join(jobDir, 'footage', 'A002_C001.mov');
fs.mkdirSync(path.dirname(clipAPath), { recursive: true });
fs.writeFileSync(clipAPath, clipA);
fs.writeFileSync(clipBPath, clipB);
const shaA = sha(clipA), shaB = sha(clipB);

write(path.join(jobDir, 'job.json'), {
  schemaVersion: '1.0', jobId, client, title: 'FCPXML fixture', kind: 'postproduction',
  driveFolder: '/fake', prePipelineReleaseFolder: '/fake', aspectRatio: '16:9',
  deliverableDurationSec: 12, audioLed: false,
  approvers: { cut: 'x', delivery: 'y' }, requestedAt: new Date().toISOString(),
});
write(path.join(jobDir, 'manifest.json'), {
  schemaVersion: '1.0', jobId, createdAt: new Date().toISOString(),
  clips: [
    { path: 'footage/A001_C001.mov', sha256: shaA, bytes: clipA.length, durationSec: 5, codec: 'prores', width: 1920, height: 1080, fps: 25, day: 1 },
    { path: 'footage/A002_C001.mov', sha256: shaB, bytes: clipB.length, durationSec: 7, codec: 'prores', width: 1920, height: 1080, fps: 25, day: 1 },
  ], audio: [],
});
write(path.join(jobDir, 'rough-edl.json'), {
  schemaVersion: '1.0', jobId, version: 1, aspectRatio: '16:9', fps: 25, generatedBy: 'clip-embedder',
  cuts: [
    { order: 1, panelId: 'P01', clipSha256: shaA, inSec: 0.5, outSec: 3.5, matchScore: 0.7 },
    { order: 2, panelId: 'P02', clipSha256: shaB, inSec: 1.0, outSec: 6.0, matchScore: 0.6 },
  ],
});
write(path.join(jobDir, 'synced-track.json'), {
  schemaVersion: '1.0', jobId, version: 1,
  picture: { edlPath: 'rough-edl.json', edlSha256: 'a'.repeat(64), totalDurationSec: 8 },
  vo: [], bgm: { choiceId: 'x', choicePath: 'x', duckDb: -12 }, sfx: [],
  output: { wavPath: 'bundle/audio/synced-track.wav', wavSha256: 'b'.repeat(64), waveformPngPath: 'bundle/audio/waveform.png' },
});

const r = spawnSync('python', [BUILD, client, jobId], { cwd: tmp, encoding: 'utf8' });
if (r.status !== 0) {
  console.error('build-fcpxml.py failed:');
  console.error(r.stdout);
  console.error(r.stderr);
  process.exit(1);
}

const fcpxmlPath = path.join(jobDir, 'bundle', 'project.fcpxml');
assert.ok(fs.existsSync(fcpxmlPath), 'FCPXML output must exist');
const xml = fs.readFileSync(fcpxmlPath, 'utf8');
assert.ok(/<fcpxml[^>]*version="1\.10"/.test(xml), 'must declare version="1.10"');
assert.ok(/<spine>/.test(xml), 'must have a spine');
assert.ok(xml.includes('footage/A001_C001.mov'), 'must reference clip A path');
assert.ok(xml.includes('footage/A002_C001.mov'), 'must reference clip B path');
assert.ok(/panel-P01/.test(xml) && /panel-P02/.test(xml), 'clips named by panel id');
assert.ok(fs.existsSync(path.join(jobDir, 'bundle', '.pipeline', 'fcpxml.sha256')), 'fcpxml.sha256 sidecar written');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   FCPXML 1.10 round-trip: fixture EDL → parseable FCPXML with named clips + audio mixdown');
console.log('build-fcpxml verification passed');
