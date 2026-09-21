#!/usr/bin/env node
// 12 states, two gate states named A and B.
const assert = require('assert');
const { parseWorkflow, path: WORKFLOW_PATH } = require('../lib-plan.js');

const rows = parseWorkflow(WORKFLOW_PATH);
assert.strictEqual(rows.length, 12, `expected 12 states, got ${rows.length}`);

const gates = rows.filter(r => /^gate\s+[ab]\b/i.test(r.state));
assert.strictEqual(gates.length, 2, `expected 2 gate rows, got ${gates.length}`);
const names = gates.map(g => g.state.match(/gate\s+([ab])/i)[1].toUpperCase()).sort();
assert.deepStrictEqual(names, ['A', 'B'], `gate letters should be A and B, got ${names.join(',')}`);

console.log(`ok   12 states, gates ${names.join(' and ')}`);
console.log('states verification passed');
