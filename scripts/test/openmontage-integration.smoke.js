#!/usr/bin/env node
// OpenMontage is optional: only mograph uses it (remotion-composer). When the checkout is present the
// composer must be there; when it is absent the rest of the plugin must not need it: nothing outside
// the mograph director and its skill may name clip_embedder or OpenMontage's green-screen detector.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.resolve(__dirname, '..', '..');
const OM_ROOT = process.env.OM_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop', 'OpenMontage');
if (fs.existsSync(OM_ROOT)) assert.ok(fs.existsSync(path.join(OM_ROOT, 'remotion-composer', 'package.json')), 'OpenMontage at ' + OM_ROOT + ' has no remotion-composer');

const scripts = fs.readdirSync(path.join(PLUGIN, 'scripts')).filter(f => /\.(js|py)$/.test(f));
for (const f of scripts) {
  const s = fs.readFileSync(path.join(PLUGIN, 'scripts', f), 'utf8');
  assert.ok(!/from lib import clip_embedder|green_screen_processor/.test(s), f + ' still imports OpenMontage code');
}
console.log('ok   OpenMontage optional: ' + (fs.existsSync(OM_ROOT) ? 'present, composer found' : 'absent') + '; no script imports it');
console.log('openmontage integration verification passed');
