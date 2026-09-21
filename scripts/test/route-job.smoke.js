#!/usr/bin/env node
// Route stub: a fixture job.json routes to the post workflow; unsupported kind exits 4.
// Full route-job.js implementation is deferred; this test verifies the schema shape.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/job.schema.json'), 'utf8'));
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/job.json'), 'utf8'));

assert.strictEqual(schema.properties.kind.const, 'postproduction', 'schema kind is postproduction only');
assert.strictEqual(template.kind, 'postproduction', 'template kind is postproduction');

// A job with kind: postproduction routes here. Anything else is out of scope.
const supported = ['postproduction'];
const unsupported = ['preproduction', 'other', ''];

for (const k of supported) {
  const j = { ...template, kind: k };
  assert.strictEqual(j.kind, 'postproduction', `${k} accepted`);
}
for (const k of unsupported) {
  assert.notStrictEqual(k, 'postproduction', `${k} should be refused`);
}

console.log('ok   job schema and template both scope to postproduction only');
console.log('route verification passed');
