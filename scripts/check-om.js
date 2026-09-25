#!/usr/bin/env node
// Is OpenMontage's remotion-composer at OM_ROOT? Only the mograph stage needs it (lower thirds and
// reveals). Everything else in the plugin runs without OpenMontage: picture matching is
// scripts/clip_match.py, screen detection is cutout.py's own. This reports and never refuses.
const fs = require('fs');
const path = require('path');

const OM_ROOT = process.env.OM_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Desktop', 'OpenMontage');
const COMPOSER = 'remotion-composer/package.json';

if (fs.existsSync(path.join(OM_ROOT, COMPOSER))) console.log('[creative-studio-post] om_root ok: ' + OM_ROOT + ' (mograph available)');
else console.log('[creative-studio-post] OpenMontage not at ' + OM_ROOT + ': mograph is unavailable (set OM_ROOT or om_root in CONFIG.md); every other stage runs without it.');
process.exit(0);
