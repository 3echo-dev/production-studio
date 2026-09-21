#!/usr/bin/env node
// ingest-check — refuse a manifest.json with any orphan clip or missing file.
//
// Exit codes:
//   0  clean
//   1  fault (schema, IO)
//   2  usage
//   3  one or more orphans (message on stderr names them)

const fs = require('fs');
const path = require('path');
const lib = require('./lib-board.js');

const args = process.argv.slice(2);
const [client, jobId] = args;
if (!client || !jobId) { console.error('usage: ingest-check.js {client} {job-id}'); process.exit(2); }

const jobDir = lib.jobRoot(process.cwd(), client, jobId);
const manifestPath = path.join(jobDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) { console.error('manifest.json missing at ' + manifestPath); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const orphans = [];
// Every clip and audio entry must have a file on disk whose sha256 matches.
for (const arr of [manifest.clips || [], manifest.audio || []]) {
  for (const entry of arr) {
    const abs = path.isAbsolute(entry.path) ? entry.path : path.join(jobDir, entry.path);
    if (!fs.existsSync(abs)) { orphans.push(`${entry.path}: file missing`); continue; }
    const bytes = fs.statSync(abs).size;
    if (bytes !== entry.bytes) { orphans.push(`${entry.path}: size ${bytes} != manifest ${entry.bytes}`); continue; }
    const sha = lib.sha256File(abs);
    if (sha !== entry.sha256) orphans.push(`${entry.path}: sha256 mismatch`);
  }
}

if (orphans.length) {
  console.error('ingest-check refused: ' + orphans.length + ' orphan(s):');
  for (const o of orphans) console.error('  - ' + o);
  process.exit(3);
}

console.log(`ingest-check ok: ${(manifest.clips || []).length} clip(s), ${(manifest.audio || []).length} audio file(s)`);
process.exit(0);
