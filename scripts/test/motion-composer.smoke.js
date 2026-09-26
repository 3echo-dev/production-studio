#!/usr/bin/env node
// The 3echo Motion composer ships inside the plugin (vendor/3echo-motion/composer) with its licence
// and notice. Every mograph template must name a composition that exists in Root.tsx, the render
// path must never wait on a person, and nothing may still look for an outside checkout.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.resolve(__dirname, '..', '..');
const M = require(path.join(PLUGIN, 'scripts', 'lib-mograph'));
const V = path.join(PLUGIN, 'vendor', '3echo-motion');

for (const f of ['LICENSE', 'NOTICE.md', 'composer/package.json', 'composer/package-lock.json', 'composer/src/index.tsx', 'composer/src/Root.tsx'])
  assert.ok(fs.existsSync(path.join(V, f)), 'vendor/3echo-motion/' + f + ' is missing');
assert.ok(!fs.existsSync(path.join(V, 'composer', 'node_modules')), 'node_modules must not ship in the plugin');
console.log('ok   composer bundled with LICENSE and NOTICE, no node_modules');

const root = fs.readFileSync(path.join(V, 'composer', 'src', 'Root.tsx'), 'utf8');
for (const [name, t] of Object.entries(M.TEMPLATES)) assert.ok(root.includes('id="' + t.id + '"'), 'template ' + name + ' -> ' + t.id + ' is not a composition in Root.tsx');
console.log('ok   ' + Object.keys(M.TEMPLATES).length + ' templates each map to a composition');

const render = fs.readFileSync(path.join(PLUGIN, 'scripts', 'mograph-render.js'), 'utf8');
assert.ok(/stdio: \['ignore'/.test(render), 'mograph-render.js must close stdin so a prompt cannot hang the render');
assert.ok(/'src\/index\.tsx', t\.id/.test(render), 'mograph-render.js must name the entry point and the composition');
console.log('ok   render names entry and composition, stdin closed');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(PLUGIN).filter(f => /\.(js|py|md|json|html|tsx|ts)$/.test(f) && !/NOTICE\.md$|motion-composer\.smoke\.js$/.test(f))) {
  const s = fs.readFileSync(f, 'utf8');
  assert.ok(!/OM_ROOT|om_root|check-om\.js|openmontage/i.test(s), path.relative(PLUGIN, f) + ' still names the old composer source');
}
console.log('ok   no file names an outside checkout or the old source');
console.log('motion composer verification passed');
