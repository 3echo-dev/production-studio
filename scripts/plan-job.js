#!/usr/bin/env node
// Planner: route.json + workflows/post.md -> plan.md. The markdown stage table is the executable truth.
//
//   node plan-job.js <route.json> [--job <job.json>] [--out <plan.md>]
//
// Every row of the post table is kept (post has no conditional rows); a gate row is kept only
// when the route carries that gate. Owner resolves per job. Exit: 0 ok · 1 error · 2 usage · 3 route not ROUTED
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');
const plan = require('./lib-plan.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const routePath = ws.positionals(args)[0];
if (!routePath) { console.error('usage: plan-job.js <route.json> [--job <job.json>] [--out <plan.md>]'); process.exit(2); }
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const jobPath = opt('--job', path.join(path.dirname(routePath), 'job.json'));
const outPath = opt('--out', path.join(path.dirname(routePath), 'plan.md'));

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let route, job;
try { route = readJson(routePath); job = fs.existsSync(jobPath) ? readJson(jobPath) : {}; }
catch (e) { console.error('cannot read inputs: ' + e.message); process.exit(1); }
if (route.status !== 'ROUTED') { console.error('route is ' + route.status + ', not ROUTED. Resolve intake first.'); process.exit(3); }

const rows = plan.parseWorkflow(plan.path);
if (!rows.length) { console.error('no stage table in workflows/post.md'); process.exit(1); }
const gates = route.gates || [];
const kept = rows.filter(r => { const g = states.ROW_GATE[Number(r.n)]; return !g || gates.includes(g); });

const owner = route.owner;
const support = new Set(route.support || []);
const routeHash = crypto.createHash('sha256').update(fs.readFileSync(routePath)).digest('hex').slice(0, 12);
const client = job.client || path.basename(path.dirname(path.dirname(path.dirname(path.resolve(routePath)))));
const stamp = ws.now(client, process.argv);

let out = fs.readFileSync(path.join(ROOT, 'templates', 'plan.md'), 'utf8')
  .split('{job-id}').join(route.jobId || '?')
  .split('{workflowId}').join(route.workflowId || 'post')
  .split('{workflowVersion}').join(route.workflowVersion || '1.0')
  .split('{timestamp}').join(stamp)
  .split('{route sha256 prefix}').join(routeHash)
  .split('{owner}').join(owner || '-')
  .split('{support}').join((route.support || []).join(', ') || 'none')
  .split('{gates}').join(gates.join(', ') || 'none');
if (!out.endsWith('\n')) out += '\n';

const cell = s => String(s || '').replace(/\|/g, '/').trim();
for (const r of kept) {
  const n = Number(r.n);
  const agent = cell(r['director-agent']) || 'orchestrator';
  const ownership = agent === owner ? 'owner' : (support.has(agent) ? 'support' : cell(agent));
  const gate = states.ROW_GATE[n] || '';
  out += '| ' + [n, cell(r.state), cell(r['output-artefact']), agent, gate ? 'orchestrator' : agent, ownership, cell(r['skill-invoked']), cell(r['output-artefact']), states.ROW_STATE[n] || '', gate, 'pending', ''].join(' | ') + ' |\n';
}
fs.writeFileSync(outPath, out);
if (args.includes('--human')) console.log('Planned: ' + kept.length + ' steps, ' + gates.length + ' of them waiting on you.');
console.log('ok: ' + kept.length + ' of ' + rows.length + ' stages kept for ' + (route.workflowId || 'post') + ' (tags: ' + (route.tags || []).join(', ') + ')');
console.log('wrote ' + ws.fwd(outPath));
const { advance } = require('./lib-advance.js');
advance(path.dirname(routePath), 'PLANNED', { by: 'planner', note: 'Planned ' + kept.length + ' stages.' });