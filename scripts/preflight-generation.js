#!/usr/bin/env node
// preflight-generation — spend guard before B-roll or mograph generation.
//
// Usage:
//   preflight-generation.js {client} {job-id} {n} --kind broll|mograph
//   preflight-generation.js {client} {job-id} sample|batch --kind generate     (generation-brief.json)
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
if (!['broll', 'mograph', 'generate'].includes(kind)) { console.error('--kind must be broll, mograph or generate'); process.exit(2); }

const jobDir = lib.jobRoot(process.cwd(), client, jobId);
if (!fs.existsSync(jobDir)) { console.error('job dir missing: ' + jobDir); process.exit(1); }

// generate: the brief carries one approval per scope (sample, then batch) landed from the board.
if (kind === 'generate') {
  const briefPath = path.join(jobDir, 'generation-brief.json');
  if (!fs.existsSync(briefPath)) { console.error('no generation-brief.json yet; run generate-clips.js brief first'); process.exit(3); }
  let brief; try { brief = JSON.parse(fs.readFileSync(briefPath, 'utf8')); } catch (e) { console.error('generation-brief.json: invalid JSON (' + e.message + ')'); process.exit(1); }
  const scope = ['sample', 'batch'].includes(n) ? n : null; if (!scope) { console.error('generate takes sample or batch as its third argument'); process.exit(2); }
  const ap = (brief.approvals || {})[scope];
  if (!ap || !ap.by || !ap.at) { console.error('no ' + scope + ' approval on record in generation-brief.json; the yes comes from the board'); process.exit(3); }
  const pending = (brief.panels || []).filter(p => p.status !== 'delivered');
  const todo = scope === 'sample' ? pending.slice(0, 1) : pending;
  if (!todo.length) { console.error('nothing left to generate for ' + scope); process.exit(3); }
  let ceilingG = 120; try { const m = fs.readFileSync(path.resolve(__dirname, '..', 'CONFIG.md'), 'utf8').match(/credit_ceiling_per_job:\s*(\d+)/); if (m) ceilingG = parseInt(m[1], 10); } catch {}
  let spentG = 0; try { const m = fs.readFileSync(path.join(jobDir, 'status.md'), 'utf8').match(/credits_spent:\s*(\d+)/); if (m) spentG = parseInt(m[1], 10); } catch {}
  const est = todo.reduce((s, p) => s + (Number(p.quotedCredits) || (p.durationSec >= 10 ? 8 : 4)), 0);
  if (Number(ap.credits) && est > Number(ap.credits)) { console.error('the ' + scope + ' estimate (' + est + ') is above the ' + ap.credits + ' credits approved on the board; ask again'); process.exit(1); }
  if (spentG + est > ceilingG) { console.error('ceiling ' + ceilingG + ' would be exceeded (spent=' + spentG + ', est=' + est + ')'); process.exit(1); }
  console.log('preflight ok: generate ' + scope + ' of ' + todo.length + ' clip(s) approved by ' + ap.by + ' for ' + (ap.credits || 'unstated') + ' credits; est ' + est + ', spent ' + spentG + '/' + ceilingG);
  process.exit(0);
}
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
