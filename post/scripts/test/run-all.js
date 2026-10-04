#!/usr/bin/env node
// Runs every test file under scripts/test/ and reports pass/fail counts.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const files = fs.readdirSync(HERE)
  .filter(f => (f.endsWith('.smoke.js') || f.endsWith('.e2e.js') || f.endsWith('.unit.js')) && f !== 'run-all.js')
  .sort();

let passed = 0, failed = 0;
const results = [];
for (const f of files) {
  const abs = path.join(HERE, f);
  const r = spawnSync(process.execPath, [abs], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (ok) passed++; else failed++;
  results.push({ file: f, ok, stdout: r.stdout, stderr: r.stderr });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + f);
  if (!ok) {
    if (r.stdout) console.log(r.stdout.trim().split('\n').map(l => '  | ' + l).join('\n'));
    if (r.stderr) console.log(r.stderr.trim().split('\n').map(l => '  ! ' + l).join('\n'));
  }
}

console.log('');
if (failed) {
  console.log(`${failed} test files failed, ${passed} passed`);
  process.exit(1);
} else {
  console.log(`all ${passed} test files passed`);
  process.exit(0);
}
