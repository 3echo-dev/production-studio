#!/usr/bin/env node
// Unit tests for hooks.mjs guards. Runs without CLAUDE_CODE_ENABLE_FUNCTION_HOOKS.
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const hooks = await import(pathToFileURL(path.resolve(ROOT, 'hooks/hooks.mjs')).href);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));

// 1. refuseBrollWithoutRequest
let out = hooks.refuseBrollWithoutRequest({ command: 'render_broll_variant --shot foo', cwd: tmp });
assert.ok(out && /no broll-requests folder/i.test(out), 'no folder = refuse');

fs.mkdirSync(path.join(tmp, 'broll-requests'));
out = hooks.refuseBrollWithoutRequest({ command: 'render_broll_variant --shot foo', cwd: tmp });
assert.ok(out && /no signed open request/i.test(out), 'empty folder = refuse');

fs.writeFileSync(path.join(tmp, 'broll-requests', '1.json'), JSON.stringify({ shot: 'foo', signedBy: 'x', status: 'open' }));
out = hooks.refuseBrollWithoutRequest({ command: 'render_broll_variant --shot foo', cwd: tmp });
assert.strictEqual(out, null, 'signed open request = allow');

// 2. refuseSyncWithoutBgmChoice
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
out = hooks.refuseSyncWithoutBgmChoice({ command: 'audio-sync', cwd: tmp2 });
assert.ok(out && /bgm-choice/i.test(out), 'no choice = refuse');

fs.writeFileSync(path.join(tmp2, 'bgm-choice.json'), JSON.stringify({ id: 'x' }));
out = hooks.refuseSyncWithoutBgmChoice({ command: 'audio-sync', cwd: tmp2 });
assert.ok(out && /unsigned/i.test(out), 'unsigned = refuse');

fs.writeFileSync(path.join(tmp2, 'bgm-choice.json'), JSON.stringify({ id: 'x', signedBy: 'y', signedAt: 'z' }));
out = hooks.refuseSyncWithoutBgmChoice({ command: 'audio-sync', cwd: tmp2 });
assert.strictEqual(out, null, 'signed = allow');

// 3. refuseManifestWrite
out = hooks.refuseManifestWrite({ command: 'write manifest.json', filePath: '/x/manifest.json' });
assert.ok(out && /only ingest-footage/i.test(out), 'random write = refuse');

out = hooks.refuseManifestWrite({ command: 'ingest-footage --write', filePath: '/x/manifest.json' });
assert.strictEqual(out, null, 'ingest-footage = allow');

out = hooks.refuseManifestWrite({ command: 'write foo.json', filePath: '/x/foo.json' });
assert.strictEqual(out, null, 'other file = allow');

// 4. refuseNonFcpxmlExport
out = hooks.refuseNonFcpxmlExport({ command: 'export-aaf' });
assert.ok(out && /FCPXML/i.test(out), 'aaf export = refuse');

out = hooks.refuseNonFcpxmlExport({ command: 'export-premiere-bundle' });
assert.strictEqual(out, null, 'fcpxml export = allow');

// runAll
out = hooks.runAll({ command: 'audio-sync', cwd: tmp2, pluginRoot: ROOT });
assert.strictEqual(out.refused, false, 'all guards pass = allow');

console.log('ok   4 refusing guards behave correctly on fixtures');
console.log('hooks-lib verification passed');
