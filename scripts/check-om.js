#!/usr/bin/env node
// Refuse the session if OpenMontage's four required modules and the remotion-composer
// package are not resolvable at OM_ROOT.
const fs = require('fs');
const path = require('path');

const OM_ROOT = process.env.OM_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Desktop', 'OpenMontage');

const REQUIRED = [
  'lib/clip_embedder.py',
  'lib/checkpoint.py',
  'lib/media_profiles.py',
  'lib/delivery_promise.py',
  'remotion-composer/package.json',
];

const missing = REQUIRED.filter(rel => !fs.existsSync(path.join(OM_ROOT, rel)));
if (missing.length) {
  console.error('[creative-studio-post] OpenMontage checkout at ' + OM_ROOT + ' is missing:');
  for (const m of missing) console.error('  - ' + m);
  console.error('Set OM_ROOT or om_root in CONFIG.md to the correct checkout path.');
  process.exit(2);
}

console.log('[creative-studio-post] om_root ok: ' + OM_ROOT);
process.exit(0);
