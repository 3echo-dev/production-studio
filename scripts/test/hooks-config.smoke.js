#!/usr/bin/env node
// Every command in hooks.json resolves to a file. hooks.mjs loads.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks/hooks.json'), 'utf8'));

function extractCommandFile(cmd) {
  const m = cmd.match(/node\s+"?[^"]*\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)"?/);
  return m ? m[1] : null;
}

let checked = 0;
for (const event of Object.keys(cfg.hooks)) {
  for (const entry of cfg.hooks[event]) {
    for (const h of entry.hooks) {
      if (h.type !== 'command') continue;
      const file = extractCommandFile(h.command);
      assert.ok(file, `command not parseable: ${h.command}`);
      assert.ok(fs.existsSync(path.join(ROOT, file)), `command file missing: ${file}`);
      checked++;
    }
  }
}

// hooks.mjs loads
try {
  const url = pathToFileURL(path.join(ROOT, 'hooks/hooks.mjs')).href;
  execSync(`node --input-type=module -e "import('${url}');"`, { stdio: 'pipe' });
} catch (e) {
  throw new Error('hooks.mjs failed to import: ' + e.message);
}

console.log(`ok   ${checked} hook commands resolve; hooks.mjs imports`);
console.log('hooks-config verification passed');
