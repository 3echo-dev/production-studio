#!/usr/bin/env node
// Every agent under 900 words, every skill under 700. Frontmatter is strict-YAML safe (no tabs,
// no smart quotes). Registry entries point at files that exist.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const wc = s => s.trim().split(/\s+/).filter(Boolean).length;
const readText = p => fs.readFileSync(p, 'utf8');
const readJson = p => JSON.parse(readText(p));

function checkFrontmatter(text, file) {
  const fm = text.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(fm, `${file} missing YAML frontmatter`);
  const body = fm[1];
  assert.ok(!/\t/.test(body), `${file} frontmatter has a tab`);
  assert.ok(!/[‘’“”]/.test(body), `${file} frontmatter has smart quotes`);
}

for (const name of fs.readdirSync(path.join(ROOT, 'agents'))) {
  if (!name.endsWith('.md')) continue;
  const p = path.join(ROOT, 'agents', name);
  const t = readText(p);
  checkFrontmatter(t, `agents/${name}`);
  const words = wc(t.replace(/^---[\s\S]+?---/, ''));
  assert.ok(words <= 900, `agents/${name} is ${words} words, limit 900`);
}

for (const dir of fs.readdirSync(path.join(ROOT, 'skills'))) {
  const p = path.join(ROOT, 'skills', dir, 'SKILL.md');
  if (!fs.existsSync(p)) continue;
  const t = readText(p);
  checkFrontmatter(t, `skills/${dir}/SKILL.md`);
  const words = wc(t.replace(/^---[\s\S]+?---/, ''));
  assert.ok(words <= 700, `skills/${dir}/SKILL.md is ${words} words, limit 700`);
}

const agents = readJson(path.join(ROOT, 'registry/agents.json')).agents;
for (const a of agents) assert.ok(fs.existsSync(path.join(ROOT, a.file)), `agent ${a.id} missing file ${a.file}`);

const skills = readJson(path.join(ROOT, 'registry/skills.json')).skills;
for (const s of skills) assert.ok(fs.existsSync(path.join(ROOT, s.file)), `skill ${s.id} missing file ${s.file}`);

const wfs = readJson(path.join(ROOT, 'registry/workflows.json')).workflows;
for (const w of wfs) assert.ok(fs.existsSync(path.join(ROOT, w.file)), `workflow ${w.id} missing file ${w.file}`);

console.log(`ok   structure: ${agents.length} agents + ${skills.length} skills + ${wfs.length} workflow(s), all present`);
console.log('structure verification passed');
