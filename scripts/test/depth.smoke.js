#!/usr/bin/env node
// Every director names a playbook that exists, and every playbook ends with a checklist.
// The review rubric covers Gate A. (Gate B has no rubric — it's a delivery_promise check.)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// Directors → playbooks
const DIRECTOR_PLAYBOOKS = {
  'sequence-director': 'cut-rules.md',
  'bgm-supervisor': 'bgm-rules.md',
  'audio-engineer': 'sync-rules.md',
  'broll-director': 'broll-rules.md',
  'mograph-director': 'mograph-rules.md',
  'premiere-packager': 'delivery-rules.md',
  'review-director': 'review-rubrics.md',
};

for (const [director, playbook] of Object.entries(DIRECTOR_PLAYBOOKS)) {
  const agentPath = path.join(ROOT, 'agents', director + '.md');
  const playbookPath = path.join(ROOT, 'playbooks', playbook);
  assert.ok(fs.existsSync(agentPath), `agent missing: ${director}`);
  assert.ok(fs.existsSync(playbookPath), `playbook missing: ${playbook}`);
  const agentText = fs.readFileSync(agentPath, 'utf8');
  assert.ok(agentText.includes(playbook), `agent ${director} does not name playbook ${playbook}`);
  const playbookText = fs.readFileSync(playbookPath, 'utf8');
  assert.ok(/##\s*Checklist/i.test(playbookText), `playbook ${playbook} has no Checklist section`);
}

const rubric = fs.readFileSync(path.join(ROOT, 'playbooks/review-rubrics.md'), 'utf8');
assert.ok(/gate\s+a/i.test(rubric), 'review-rubrics.md must cover Gate A');
assert.ok(/critical/i.test(rubric) && /major/i.test(rubric) && /minor/i.test(rubric),
  'review-rubrics.md must score critical/major/minor');

console.log(`ok   ${Object.keys(DIRECTOR_PLAYBOOKS).length} directors → playbooks; rubric covers Gate A`);
console.log('depth verification passed');
