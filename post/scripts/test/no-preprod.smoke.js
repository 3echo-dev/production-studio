#!/usr/bin/env node
// No leftover pre-prod skin: agents, skills, workflows, playbooks and templates never mention
// call sheet, concept breakdown, shot list, screenplay, storyboard-director or
// breakdown-compiler as if they belong to this plugin. Docs may reference the pre-prod plugin.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['agents', 'skills', 'workflows', 'playbooks', 'templates'];
const BAD_TERMS = [
  /\bcall[\s-]sheet\b/i,
  /\bconcept[\s-]breakdown\b/i,
  /\bshot[\s-]list\b/i,
  /\bscreenplay\b/i,
  /\bstoryboard-director\b/i,
  /\bbreakdown-compiler\b/i,
  /\bcall-sheet-builder\b/i,
];
// The intake needs to reference the pre-prod release which contains these files.
// Whitelist explicit mentions in the post-intake and new-post-project contexts.
const WHITELIST = new Set([
  'agents/post-intake-director.md',
  'agents/orchestrator.md',
  'agents/sequence-director.md',
  'skills/new-post-project/SKILL.md',
  'workflows/post.md',
  'schemas/job.schema.json',
  'templates/job.json',
]);

const hits = [];
for (const dir of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  const walk = d => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(md|json|yaml|yml)$/i.test(name)) continue;
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (WHITELIST.has(rel)) continue;
      const text = fs.readFileSync(p, 'utf8');
      for (const re of BAD_TERMS) if (re.test(text)) hits.push(rel + ' :: ' + re.source);
    }
  };
  walk(abs);
}

assert.deepStrictEqual(hits, [], 'pre-prod skin left in the plugin:\n  ' + hits.join('\n  '));
console.log('ok   no pre-prod skin in agents, skills, workflows, playbooks or templates');
console.log('no-preprod verification passed');
