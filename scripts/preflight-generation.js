#!/usr/bin/env node
// preflight-generation — spend guard before B-roll or mograph generation.
//
// Usage:
//   preflight-generation.js {client} {job-id} {n} --kind broll|mograph
//
// Checks:
//   1. Job dir exists.
//   2. Matching request file exists ({kind}-requests/{n}.json).
//   3. Request is signed (has signedBy and signedAt).
//   4. Request status is not already 'delivered'.
//   5. Running spend ≤ ceiling from CONFIG.md.
//
// Exit codes:
//   0  allowed to quote and spend
//   1  fault (schema, IO, ceiling breached)
//   2  usage
//   3  no request on disk yet

const fs = require('fs');
const path = require('path');
const lib = require('./lib-board.js');

const args = process.argv.slice(2);
const [client, jobId, n] = args;
const flags = {};
for (let i = 3; i < args.length; i++) {
  if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[i + 1];
}
if (!client || !jobId || !n) { console.error('usage: preflight-generation.js {client} {job-id} {n} --kind broll|mograph'); process.exit(2); }
const kind = flags.kind;
if (!['broll', 'mograph'].includes(kind)) { console.error('--kind must be broll or mograph'); process.exit(2); }

const jobDir = lib.jobRoot(process.cwd(), client, jobId);
if (!fs.existsSync(jobDir)) { console.error('job dir missing: ' + jobDir); process.exit(1); }

const reqPath = path.join(jobDir, `${kind}-requests`, `${n}.json`);
if (!fs.existsSync(reqPath)) { console.error(`no ${kind} request at ${reqPath}`); process.exit(3); }

let req;
try { req = JSON.parse(fs.readFileSync(reqPath, 'utf8')); }
catch (e) { console.error(`request ${reqPath}: invalid JSON (${e.message})`); process.exit(1); }

if (!req.signedBy || !req.signedAt) { console.error(`request ${n}: unsigned`); process.exit(3); }
if (req.status === 'delivered') { console.error(`request ${n}: already delivered`); process.exit(3); }

// Ceiling check.
const cfgPath = path.resolve(__dirname, '..', 'CONFIG.md');
let ceiling = 120;
try {
  const m = fs.readFileSync(cfgPath, 'utf8').match(/credit_ceiling_per_job:\s*(\d+)/);
  if (m) ceiling = parseInt(m[1], 10);
} catch {}

const statusPath = path.join(jobDir, 'status.md');
let spent = 0;
if (fs.existsSync(statusPath)) {
  const m = fs.readFileSync(statusPath, 'utf8').match(/credits_spent:\s*(\d+)/);
  if (m) spent = parseInt(m[1], 10);
}
const estCost = kind === 'broll' ? (req.durationSec >= 10 ? 8 : 4) : 1;
if (spent + estCost > ceiling) {
  console.error(`ceiling ${ceiling} would be exceeded (spent=${spent}, est=${estCost})`);
  process.exit(1);
}

console.log(`preflight ok: ${kind} request ${n} signed by ${req.signedBy}; est ${estCost} credits, spent ${spent}/${ceiling}`);
process.exit(0);
