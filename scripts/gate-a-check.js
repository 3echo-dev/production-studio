#!/usr/bin/env node
// gate-a-check — refuse a Gate A attempt without: rough-edl.json + synced-track.json +
// signed bgm-choice.json, and with the synced-track picture.edlSha256 matching disk.
//
// Exit codes:
//   0  Gate A is ready
//   1  fault (schema, IO)
//   2  usage
//   3  gate refused (reason on stderr)

const fs = require('fs');
const path = require('path');
const lib = require('./lib-board.js');

const args = process.argv.slice(2);
const [client, jobId] = args;
if (!client || !jobId) { console.error('usage: gate-a-check.js {client} {job-id}'); process.exit(2); }

const jobDir = lib.jobRoot(process.cwd(), client, jobId);
const problems = [];

function loadJson(rel) {
  const p = path.join(jobDir, rel);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { problems.push(`${rel}: invalid JSON (${e.message})`); return null; }
}

const edl = loadJson('rough-edl.json');
if (!edl) problems.push('rough-edl.json: missing');

const sync = loadJson('synced-track.json');
if (!sync) problems.push('synced-track.json: missing');

const bgm = loadJson('bgm-choice.json');
if (!bgm) problems.push('bgm-choice.json: missing');
else if (!bgm.signedBy || !bgm.signedAt) problems.push('bgm-choice.json: unsigned');

if (edl && sync) {
  const edlPath = path.join(jobDir, 'rough-edl.json');
  const edlShaNow = lib.sha256File(edlPath);
  const edlShaClaimed = sync.picture && sync.picture.edlSha256;
  if (!edlShaClaimed) problems.push('synced-track.json: picture.edlSha256 missing');
  else if (edlShaClaimed !== edlShaNow) problems.push(`synced-track.json: picture.edlSha256 (${edlShaClaimed.slice(0, 8)}...) does not match current EDL (${edlShaNow.slice(0, 8)}...)`);
}

if (problems.length) {
  console.error('gate-a-check refused: ' + problems.length + ' problem(s):');
  for (const p of problems) console.error('  - ' + p);
  process.exit(3);
}

console.log(`gate-a-check ok: EDL bound to synced-track (${lib.sha256File(path.join(jobDir, 'rough-edl.json')).slice(0, 12)}...) and BGM signed by ${bgm.signedBy}`);
process.exit(0);
