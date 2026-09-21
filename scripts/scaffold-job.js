#!/usr/bin/env node
// Scaffold one project folder in a single call.
//   node scaffold-job.js <client> <job-slug> [title...]
// Job id is job-YYYYMMDD-HHMM-<job-slug>, and it is also the project's id on the board.
// The XX declarations (aspect ratio, duration, who leads) stay null until intake asks.
// Refuses to overwrite. Exit 0 ok · 1 name clash · 2 usage · 3 no client, or the root is the shoot folder
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const pos = ws.positionals(argv);
const client = (pos[0] || '').trim();
const slug = (pos[1] || '').trim();
if (!client || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('usage: scaffold-job.js <client> <job-slug> [title...]   (slug: lowercase, hyphens)');
  process.exit(2);
}
const badRoot = ws.refuseShootRoot(argv);
if (badRoot) { console.error(badRoot); process.exit(3); }
const clientDir = ws.wsDir(client, argv);
if (!fs.existsSync(path.join(clientDir, 'workspace.json'))) {
  console.error('REFUSED: ' + ws.fwd(clientDir) + '/workspace.json not found. Run scaffold-client.js first.');
  process.exit(3);
}
const d = new Date();
const p2 = n => String(n).padStart(2, '0');
const ymd = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
const hm = p2(d.getHours()) + p2(d.getMinutes());
const title = (pos.slice(2).join(' ') || slug).trim();
let jobId = 'job-' + ymd + '-' + hm + '-' + slug;
let dir = path.join(clientDir, 'jobs', jobId);
for (let n = 2; fs.existsSync(dir) && n <= 20; n++) { jobId = 'job-' + ymd + '-' + hm + '-' + slug + '-' + n; dir = path.join(clientDir, 'jobs', jobId); }
if (fs.existsSync(dir)) { console.error('There are already 20 projects called ' + slug + ' this minute. Give this one another name.'); process.exit(1); }
const now = ws.now(client, argv, d);

for (const s of ['validation', 'revisions', 'approvals', 'runs', 'bundle', '.board']) fs.mkdirSync(path.join(dir, s), { recursive: true });

const T = path.join(__dirname, '..', 'templates');
const read = f => { try { return fs.readFileSync(path.join(T, f), 'utf8'); } catch { return null; } };
const fallbackStatus = [
  '# Project status: {job-id}', '', '**Client:** {client}', '**Job:** `{job-id}`', '**Title:** {title}',
  '**Folder:** `workspaces/{client}/jobs/{job-id}/`', '**Current state:** `INTAKE_PENDING`', '**Last updated:** YYYY-MM-DD HH:MM',
  '**Next action:** {what happens next, in one line}', '**Blocked on:** {who or what, or "Nothing"}', '**Credits spent:** 0 of 0 approved', '', '---', '',
  '## Stage log', '', '| Timestamp | From | To | By | Note |', '|---|---|---|---|---|',
  '| YYYY-MM-DD HH:MM | - | `INTAKE_PENDING` | orchestrator | Project folder created |', '', '---', '', '## Notes', '',
  '{Current state summary. Live constraints. Open items. Running credit tally.}', '',
].join('\n');
const status = (read('status.md') || fallbackStatus)
  .split(/\r?\n/).filter(l => !l.startsWith('> **When resuming') && !l.startsWith('> The files win')).join('\n')
  .split('{job-id}').join(jobId).split('{client}').join(client).split('{title}').join(title)
  .split('YYYY-MM-DD HH:MM').join(now)
  .split('{what happens next, in one line}').join('Declare aspect ratio, duration and who leads; then route')
  .split('{who or what, or "Nothing"}').join('The intake declarations')
  .split('{Current state summary. Live constraints. Open items. Running credit tally.}').join('Project folder created. Intake declarations not given yet. Credits: 0 spent, 0 approved.');
fs.writeFileSync(path.join(dir, 'status.md'), status);

let jobT = {};
try { jobT = JSON.parse(read('job.json') || '{}'); } catch { jobT = {}; }
delete jobT._enums;
const requestedAt = now.replace(' ', 'T').replace(/ ([+-]\d\d:\d\d)$/, ':00$1');
const job = {
  schemaVersion: '1.0', kind: 'postproduction', driveFolder: '', prePipelineReleaseFolder: '', prePipelineReleaseHash: null,
  aspectRatio: null, deliverableDurationSec: null, audioLed: false, referenceCutPath: null, colourDirection: null,
  approvers: { cut: 'creative-director', delivery: 'lead' },
  ...jobT, jobId, client, title, requestedAt,
};
delete job.brand;
fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'versions.jsonl'), '');

console.log('ready: ' + ws.fwd(dir) + '/  state: INTAKE_PENDING');
console.log('job-id: ' + jobId);