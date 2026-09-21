// Which job a run is working on, when nothing told it: the open job whose status.md moved
// most recently. A finished job (next: []) is left out unless includeFinished is set.
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const states = require('./lib-states.js');

const STATE_LINE = /\*\*Current state:\*\*\s*`?([A-Z_]+)`?/;
const stateIn = text => (String(text || '').match(STATE_LINE) || [])[1] || null;

function openJob(argv, options) {
  const opts = options || {};
  const root = ws.clientsDir(argv);
  let clients;
  try { clients = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  let best = null;
  for (const c of clients) {
    if (!c.isDirectory() || c.name.startsWith('.')) continue;
    const jobs = path.join(root, c.name, 'jobs');
    let entries = [];
    try { entries = fs.readdirSync(jobs); } catch { continue; }
    for (const job of entries) {
      const dir = path.join(jobs, job);
      const status = path.join(dir, 'status.md');
      let at = null, text = '';
      try { at = fs.statSync(status).mtimeMs; text = fs.readFileSync(status, 'utf8'); } catch { continue; }
      const state = stateIn(text);
      const done = state && states.exists(state) && (states.get(state).next || []).length === 0;
      if (done && !opts.includeFinished) continue;
      if (!best || at > best.at) best = { at, client: c.name, brand: c.name, jobId: job, dir, status, state, text };
    }
  }
  return best;
}

module.exports = { openJob, stateIn, STATE_LINE };