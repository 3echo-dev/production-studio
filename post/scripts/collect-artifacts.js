#!/usr/bin/env node
// Verify that a batch of director outputs actually landed in the job folder, recover any that
// landed elsewhere, and leave no transfer archives behind.
//
//   node collect-artifacts.js <client> <job-id> <expected-relative-path...> [--dry-run]
//
// A director reporting success is not evidence; this script's exit code is.
// Exit 0 all present · 1 something is missing · 2 usage
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const { client, jobId: job, dir, rest: expected } = ws.resolveJobArgs(argv, argv);
if (!client || !job || !expected.length) {
  console.error('usage: collect-artifacts.js <client> <job-id> <expected-relative-path...> [--dry-run]');
  process.exit(2);
}
const base = dir;
function ok(p) {
  try {
    const stat = fs.statSync(p);
    if (stat.isFile()) return stat.size > 0;
    if (!stat.isDirectory()) return false;
    const stack = [p];
    while (stack.length) {
      const d = stack.pop();
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const child = path.join(d, entry.name);
        if (entry.isDirectory()) stack.push(child);
        else if (entry.isFile() && fs.statSync(child).size > 0) return true;
      }
    }
  } catch {}
  return false;
}

function find(relativePath, roots, maxDepth = 6) {
  const seen = new Set();
  const expectedSuffix = path.join('workspaces', client, 'jobs', job, relativePath);
  const resolvedBase = path.resolve(base);
  const comparable = p => process.platform === 'win32' ? p.toLowerCase() : p;
  const isCandidate = full => {
    if (!ok(full)) return false;
    const resolved = path.resolve(full);
    const relativeToBase = path.relative(resolvedBase, resolved);
    const outsideBase = relativeToBase.startsWith('..' + path.sep) || path.isAbsolute(relativeToBase);
    const hasExpectedSuffix = comparable(resolved) === comparable(path.resolve(expectedSuffix)) || comparable(resolved).endsWith(path.sep + comparable(expectedSuffix));
    return outsideBase && hasExpectedSuffix;
  };
  for (const root of roots) {
    const stack = [[root, 0]];
    while (stack.length) {
      const [d, depth] = stack.pop();
      if (depth > maxDepth || seen.has(d)) continue;
      seen.add(d);
      let ents;
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
          if (isCandidate(full)) return full;
          stack.push([full, depth + 1]);
        } else if (isCandidate(full)) return full;
      }
    }
  }
  return null;
}

const ARCHIVE = /\.(tgz|tar|tar\.gz|zip)$/i;
const PY = spawnSync('python', ['--version']).status === 0 ? 'python' : 'python3';

function archivesInJob() {
  const out = [];
  (function walk(d, depth) {
    if (depth > 4) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (ARCHIVE.test(e.name)) out.push(full);
    }
  })(base, 0);
  return out;
}
function listArchive(archive) {
  const abs = path.resolve(archive);
  const zip = /\.zip$/i.test(abs);
  const r = zip
    ? spawnSync(PY, ['-c', 'import sys,zipfile;print(chr(10).join(zipfile.ZipFile(sys.argv[1]).namelist()))', abs], { encoding: 'utf8' })
    : spawnSync('tar', ['-tzf', path.basename(abs)], { cwd: path.dirname(abs), encoding: 'utf8' });
  if (r.status !== 0) return [];
  return (r.stdout || '').split(/\r?\n/).filter(Boolean);
}
function extractMember(archive, member, target) {
  const abs = path.resolve(archive);
  const zip = /\.zip$/i.test(abs);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
  try {
    const r = zip
      ? spawnSync(PY, ['-c', 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', abs, tmp], { encoding: 'utf8' })
      : spawnSync('tar', ['-xzf', path.basename(abs), '-C', tmp], { cwd: path.dirname(abs), encoding: 'utf8' });
    if (r.status !== 0) return false;
    const got = path.join(tmp, member);
    if (!fs.existsSync(got) || !fs.statSync(got).isFile()) return false;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(got, target);
    return true;
  } catch { return false; }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

const searchRoots = [ws.clientsDir(argv), os.tmpdir()].filter(r => path.resolve(r) !== path.resolve(os.homedir()));
const unpacked = [];
const missing = [], recovered = [], present = [];
for (const rel of expected) {
  const target = path.join(base, rel);
  if (ok(target)) { present.push(rel); continue; }
  let src = find(rel, searchRoots);
  if (!src) {
    for (const archive of archivesInJob()) {
      const member = listArchive(archive).find(m => m === rel || m.endsWith('/' + rel));
      if (!member) continue;
      if (!unpacked.includes(archive)) unpacked.push(archive);
      if (dryRun || extractMember(archive, member, path.join(base, rel))) {
        recovered.push(rel + '  <- ' + archive + (dryRun ? ' (inside archive)' : ' (unpacked)'));
        src = archive;
        break;
      }
    }
    if (src) continue;
  }
  if (src) {
    const sourceStat = fs.statSync(src);
    if (!dryRun) {
      if (sourceStat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        for (const entry of fs.readdirSync(src)) fs.cpSync(path.join(src, entry), path.join(target, entry), { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(src, target);
      }
    }
    recovered.push(`${rel}  <- ${src}`);
  } else {
    missing.push(rel);
  }
}
const junk = [], leftAlone = [];
(function sweep(d, depth) {
  if (depth > 4) return;
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) { sweep(full, depth + 1); continue; }
    if (!ARCHIVE.test(e.name)) continue;
    if (unpacked.some(u => path.resolve(u) === path.resolve(full))) { if (!dryRun) fs.unlinkSync(full); junk.push(full); }
    else leftAlone.push(full);
  }
})(base, 0);

for (const r of recovered) console.log((dryRun ? 'would recover: ' : 'recovered: ') + ws.fwd(r));
for (const j of junk) console.log((dryRun ? 'would remove: ' : 'removed:   ') + ws.fwd(j) + '  (transfer archive this run unpacked)');
for (const l of leftAlone) console.log('note:      ' + ws.fwd(l) + ' left in place (not a transfer artifact)');
if (missing.length) {
  for (const m of missing) console.error('MISSING:   ' + m + '  (the director wrote nothing anywhere)');
  process.exit(1);
}
console.log(`ok: ${expected.length} artifact(s) present in ${ws.fwd(base)}`);