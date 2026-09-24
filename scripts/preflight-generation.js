#!/usr/bin/env node
// preflight-generation — spend guard before B-roll or mograph generation.
//
// Usage:
//   preflight-generation.js {client} {job-id} {n} --kind broll|mograph
//   preflight-generation.js {client} {job-id} sample|batch --kind generate     (generation-brief.json)
//   preflight-generation.js {client} {job-id} batch --kind backgrounds          (hybrid-brief.json)
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
if (!['broll', 'mograph', 'generate', 'backgrounds'].includes(kind)) { console.error('--kind must be broll, mograph, generate or backgrounds'); process.exit(2); }

const jobDir = lib.jobRoot(process.cwd(), client, jobId);
if (!fs.existsSync(jobDir)) { console.error('job dir missing: ' + jobDir); process.exit(1); }

// backgrounds: a hybrid job's generated backgrounds carry one approval, landed from the board.
if (kind === 'backgrounds') {
  const bp = path.join(jobDir, 'hybrid-brief.json');
  if (!fs.existsSync(bp)) { console.error('no hybrid-brief.json yet; run hybrid.js brief first'); process.exit(3); }
  let b; try { b = JSON.parse(fs.readFileSync(bp, 'utf8')); } catch (e) { console.error('hybrid-brief.json: invalid JSON (' + e.message + ')'); process.exit(1); }
  const ap = (b.approvals || {}).backgrounds;
  if (!ap || !ap.by || !ap.at) { console.error('no background approval on record in hybrid-brief.json; the yes comes from the board'); process.exit(3); }
  const todo = Object.entries(b.backgrounds || {}).filter(([k, x]) => x.source === 'generate' && x.status !== 'delivered' && (!ap.keys || ap.keys.includes(k)));
  if (!todo.length) { console.error('no background left to generate'); process.exit(3); }
  let ceilingB = 120; try { const m = fs.readFileSync(path.resolve(__dirname, '..', 'CONFIG.md'), 'utf8').match(/credit_ceiling_per_job:\s*(\d+)/); if (m) ceilingB = parseInt(m[1], 10); } catch {}
  let spentB = 0; try { const m = fs.readFileSync(path.join(jobDir, 'status.md'), 'utf8').match(/credits_spent:\s*(\d+)/); if (m) spentB = parseInt(m[1], 10); } catch {}
  const est = todo.reduce((s, [, x]) => s + (Number(x.quotedCredits) || 1), 0);
  if (Number(ap.credits) && est > Number(ap.credits)) { console.error('the backgrounds estimate (' + est + ') is above the ' + ap.credits + ' credits approved on the board; ask again'); process.exit(1); }
  if (spentB + est > ceilingB) { console.error('ceiling ' + ceilingB + ' would be exceeded (spent=' + spentB + ', est=' + est + ')'); process.exit(1); }
  console.log('preflight ok: ' + todo.length + ' background(s) approved by ' + ap.by + ' for ' + (ap.credits || 'unstated') + ' credits; est ' + est + ', spent ' + spentB + '/' + ceilingB);
  process.exit(0);
}
// generate: the brief carries one approval per scope (sample, then batch) landed from the board.
if (kind === 'generate') {
  const briefPath = path.join(jobDir, 'generation-brief.json');
  if (!fs.existsSync(briefPath)) { console.error('no generation-brief.json yet; run generate-clips.js brief first'); process.exit(3); }
  let brief; try { brief = JSON.parse(fs.readFileSync(briefPath, 'utf8')); } catch (e) { console.error('generation-brief.json: invalid JSON (' + e.message + ')'); process.exit(1); }
  const scope = ['sample', 'batch'].includes(n) ? n : null; if (!scope) { console.error('generate takes sample or batch as its third argument'); process.exit(2); }
  const ap = (brief.approvals || {})[scope];
  if (!ap || !ap.by || !ap.at) { console.error('no ' + scope + ' approval on record in generation-brief.json; the yes comes from the board'); process.exit(3); }
  const pending = (brief.panels || []).filter(p => !['delivered', 'provided'].includes(p.status));
  const todo = scope === 'sample' ? pending.slice(0, 1) : (ap.panels ? pending.filter(p => ap.panels.includes(String(p.id).toUpperCase())) : pending);
  if (!todo.length) { console.error('nothing left to generate for ' + scope); process.exit(3); }
  // The pictures each clip carries: no clash left, and exactly the set a person approved (fingerprinted).
  const R = require('./lib-references.js');
  const clash = todo.filter(p => (p.clashes || []).length);
  if (clash.length) { console.error('name clash in the references of ' + clash.map(p => p.id + ' (' + p.clashes.map(c => c.name).join(', ') + ')').join('; ') + '; a person picks which picture is meant first'); process.exit(3); }
  const refAp = (brief.approvals || {}).refs;
  for (const p of todo.filter(x => x.libraryRefs)) {
    if (!refAp || !refAp.panels || !refAp.panels[p.id]) { console.error('the reference set for ' + p.id + ' has not been approved on the board (generate-clips.js refset, then approve refs)'); process.exit(3); }
    if (refAp.panels[p.id] !== R.refsHash(p.refs)) { console.error('the references for ' + p.id + ' changed since they were approved (a file was swapped or edited); ask again'); process.exit(3); }
  }
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
