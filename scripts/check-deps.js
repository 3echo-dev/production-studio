#!/usr/bin/env node
// Start-of-session check. Reports what is on this box and whether function hooks are armed.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OM_ROOT = process.env.OM_ROOT || path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Desktop', 'OpenMontage');
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');

function has(cmd) {
  try { execSync(cmd, { stdio: 'ignore' }); return 'ok'; } catch { return 'missing'; }
}

const parts = [];
parts.push(`ffmpeg: ${has('ffmpeg -version')}`);
parts.push(`node: ${has('node --version')}`);
parts.push(`python: ${has('python --version')}`);
parts.push(`om_root: ${fs.existsSync(OM_ROOT) ? 'ok' : 'missing'}`);

const hooksJson = path.join(PLUGIN_ROOT, 'hooks/hooks.json');
let hooksArmed = 'off';
try {
  const j = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
  if (j.modules) hooksArmed = 'armed';
} catch {}
parts.push(`function_hooks: ${hooksArmed}`);

console.log('[creative-studio-post] ' + parts.join(' | '));
process.exit(0);
