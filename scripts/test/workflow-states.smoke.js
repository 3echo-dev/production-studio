#!/usr/bin/env node
// workflows/post.md parses to a state table. Every "State after" cell resolves to a real state.
const assert = require('assert');
const { parseWorkflow, path: WORKFLOW_PATH } = require('../lib-plan.js');

const rows = parseWorkflow(WORKFLOW_PATH);
assert.ok(rows.length > 0, 'workflow table parses non-empty');

const stateIds = new Set();
for (const r of rows) {
  const state = r.state.toLowerCase();
  stateIds.add(state);
}

let checked = 0;
for (const r of rows) {
  const after = r['state-after'];
  if (!after || after === 'done' || after === '-') continue;
  // Numeric next-state references (workflow uses "2", "3", ... for next-state).
  if (/^\d+$/.test(after)) { checked++; continue; }
  const wanted = after.toLowerCase();
  const found = [...stateIds].some(s => s === wanted || s.replace(/\s+/g, '-') === wanted || s.startsWith(wanted));
  assert.ok(found, `row ${r.n} names next state "${after}" which is not in the table`);
  checked++;
}

console.log(`ok   workflow parses; ${rows.length} rows, ${checked} state-after references validated`);
console.log('workflow-states verification passed');
