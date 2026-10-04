#!/usr/bin/env node
// The plugin is creative-studio-post and no file still points at pre-prod's root variable,
// config dir or manifest names. A leftover CREATIVE_STUDIO_ROOT would send this run's work
// to the wrong workspace.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const plugin = readJson('.claude-plugin/plugin.json');
assert.strictEqual(plugin.name, 'creative-studio-post', 'plugin.json name');
assert.strictEqual(plugin.displayName, 'Creative Studio Post', 'displayName');

const market = readJson('.claude-plugin/marketplace.json');
assert.ok(market.plugins.some(p => p.name === 'creative-studio-post'), 'marketplace lists creative-studio-post');
assert.ok(!market.plugins.some(p => p.name === 'creative-studio-pipeline'), 'marketplace does not list creative-studio-pipeline');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.out', '__pycache__', 'docs']);
const TEXT = /\.(js|mjs|py|md|json|yaml|yml|html|txt|csv)$/i;
// A leftover root variable or pre-prod's plugin name would misdirect a run; forbidden everywhere.
// The `.creative-studio-pipeline` config-dir string is different: the sibling guard
// (ws.foreignOwner) names it on purpose, to step aside in a pre-prod folder rather than adopt one.
// So that one pattern is allowed in the two files that hold the guard; our own config dir stays
// pinned by CONFIG_DIR in lib-workspace.js.
const BAD_ALL = [/CREATIVE_STUDIO_ROOT\b/, /"name":\s*"creative-studio-pipeline"/];
const BAD_CONFIG = /\.creative-studio-pipeline\b/;
const SIBLING_GUARD_FILES = new Set(['scripts/lib-workspace.js', 'scripts/test/sibling-yield.smoke.js']);
const hits = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) { walk(abs); continue; }
    if (!TEXT.test(name)) continue;
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (rel === 'scripts/test/identity.smoke.js') continue;
    const text = fs.readFileSync(abs, 'utf8');
    for (const re of BAD_ALL) if (re.test(text)) hits.push(rel + ': ' + re.source);
    if (!SIBLING_GUARD_FILES.has(rel) && BAD_CONFIG.test(text)) hits.push(rel + ': ' + BAD_CONFIG.source);
  }
}
walk(ROOT);
assert.deepStrictEqual(hits, [], 'pre-prod identity left behind:\n  ' + hits.join('\n  '));

console.log('ok   plugin identity is creative-studio-post and no pre-prod root or config dir remains');
console.log('identity verification passed');
