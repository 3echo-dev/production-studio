#!/usr/bin/env node
// The one place that arms the function hooks. The spend and write refusals live behind
// CLAUDE_CODE_ENABLE_FUNCTION_HOOKS in the project's .claude/settings.json; every entry point
// that establishes "this folder is the pipeline's" calls arm(). arm() never replaces a
// settings file it cannot parse.
const fs = require('fs');
const path = require('path');

const KEY = 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS';
const settingsPath = dir => path.join(dir, '.claude', 'settings.json');

function peek(dir) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath(dir), 'utf8'));
    return !!(s && s.env && s.env[KEY] === '1');
  } catch { return false; }
}

function arm(dir) {
  const file = settingsPath(dir);
  let settings = {};
  let raw = null;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e.code !== 'ENOENT') return { state: 'unwritable', file, why: e.message }; }
  if (raw !== null) {
    try { settings = JSON.parse(raw); } catch (e) { return { state: 'unreadable', file, why: e.message }; }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { state: 'unreadable', file, why: 'the file is not a JSON object' };
  }
  const env = (settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)) ? settings.env : {};
  if (env[KEY] === '1') return { state: 'already', file };
  env[KEY] = '1';
  settings.env = env;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  } catch (e) { return { state: 'unwritable', file, why: e.message }; }
  return { state: raw === null ? 'created' : 'updated', file };
}

function sentence(result, fwd) {
  const show = fwd || (p => p);
  switch (result.state) {
    case 'created':
    case 'updated':
      return 'The guards are on. Start a new session and a spend without an approval on disk is refused, not just discouraged.';
    case 'already':
      return 'The guards were already on.';
    default:
      return 'The guards could not be turned on: ' + result.why + '\n' + 'Add this line to ' + show(result.file) + ' by hand: "env": { "' + KEY + '": "1" }';
  }
}

module.exports = { KEY, arm, peek, sentence, settingsPath };