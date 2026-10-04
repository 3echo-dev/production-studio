// Record the state a script has just earned, through set-state.js, so status.md, the stage log
// and the board all move the same way. Never throws and never fails the caller.
const path = require('path');
const { spawnSync } = require('child_process');

function fromJobDir(jobDir) {
  const dir = path.resolve(jobDir);
  const jobId = path.basename(dir);
  const client = path.basename(path.resolve(dir, '..', '..'));
  const root = path.resolve(dir, '..', '..', '..', '..');
  return { client, jobId, root };
}

function advance(jobDir, state, opts = {}) {
  try {
    const { client, jobId, root } = fromJobDir(jobDir);
    const args = [path.join(__dirname, 'set-state.js'), client, jobId, state, '--by', opts.by || 'pipeline'];
    if (opts.note) args.push('--note', opts.note);
    if (opts.next) args.push('--next', opts.next);
    args.push('--root', root);
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { ok: run.status === 0, out: ((run.stdout || '') + (run.stderr || '')).trim() };
  } catch (e) {
    return { ok: false, out: e.message };
  }
}

module.exports = { advance, fromJobDir };