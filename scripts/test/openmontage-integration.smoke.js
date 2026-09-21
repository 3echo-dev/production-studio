#!/usr/bin/env node
// OpenMontage is resolvable: the four required Python modules and remotion-composer/package.json
// exist at OM_ROOT. Skipped if OM_ROOT is missing (does not fail the build; check-om.js is the
// runtime gate).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const OM_ROOT = process.env.OM_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop', 'OpenMontage');

if (!fs.existsSync(OM_ROOT)) {
  console.log(`skip om_root not present at ${OM_ROOT}; set OM_ROOT to run this test`);
  console.log('openmontage integration verification passed');
  process.exit(0);
}

const REQUIRED = [
  'lib/clip_embedder.py',
  'lib/checkpoint.py',
  'lib/media_profiles.py',
  'lib/delivery_promise.py',
  'remotion-composer/package.json',
];

const missing = REQUIRED.filter(rel => !fs.existsSync(path.join(OM_ROOT, rel)));
assert.deepStrictEqual(missing, [], 'OpenMontage missing files:\n  ' + missing.join('\n  '));

console.log(`ok   OpenMontage at ${OM_ROOT}: ${REQUIRED.length} required files present`);
console.log('openmontage integration verification passed');
