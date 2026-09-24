#!/usr/bin/env node
// Intake inventory: what this job already has, and what will have to be generated.
//
//   node scan-references.js <client> <job-id> [--json]
//
// Reads the reference library (job.referencesFolder or <driveFolder>/references, see lib-references.js),
// the storyboard and the script, and, for a generated job, the clips already sitting in
// footage/generated/. Writes reference-inventory.json in the job folder and prints a plain summary:
//
//   available   characters, wardrobe, locations, props and motion clips the library holds
//   per panel   which of them each panel uses; a clip already there is used as it is, not generated
//   from text   names the storyboard or script asks for that the library has no picture of
//   unused      library items no panel mentions (worth a look: a name may be spelled differently)
//
// It never spends and never asks. The orchestrator puts the summary on the board (Intake item) and
// asks only about the "from text" list: add a reference, or let the model draw it from the prompt.
// Exit 0 ok · 1 fault · 2 usage · 3 no storyboard
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const R = require('./lib-references.js');

const argv = process.argv.slice(2);
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: scan-references.js <client> <job-id> [--json]'); process.exit(2); }
const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
const rel = job.prePipelineReleaseFolder;
const sbPath = rel && path.join(rel, 'storyboard.json');
if (!sbPath || !fs.existsSync(sbPath)) { console.error('no storyboard.json in the pre-prod release; nothing to match references against'); process.exit(3); }

const inv = build(job, dir);
fs.writeFileSync(path.join(dir, 'reference-inventory.json'), JSON.stringify(inv, null, 2) + '\n');
if (argv.includes('--json')) { console.log(JSON.stringify(inv, null, 2)); process.exit(0); }
console.log(summary(inv).join('\n'));
process.exit(0);

function build(job, dir) {
  const rel = job.prePipelineReleaseFolder;
  const sb = JSON.parse(fs.readFileSync(path.join(rel, 'storyboard.json'), 'utf8'));
  const script = fs.existsSync(path.join(rel, 'script.md')) ? fs.readFileSync(path.join(rel, 'script.md'), 'utf8') : '';
  const lib = R.scanLibrary(R.libraryRoot(job));
  const clipsDir = job.driveFolder ? path.join(job.driveFolder, 'footage', 'generated') : null;
  const panels = (sb.panels || []).slice().sort((a, b) => (a.storyOrder || 0) - (b.storyOrder || 0) || String(a.id).localeCompare(String(b.id)));
  const used = new Set();
  const fromText = new Map();
  const rows = panels.map(p => {
    const words = [p.caption, p.description, p.shot, sceneLine(script, p.scene)].filter(Boolean).join('. ');
    const { found, missing } = R.panelNeeds(p, words, lib);
    found.forEach(f => used.add(f.kind + '/' + f.item.key));
    missing.forEach(m => { const k = m.kind + '/' + m.name.toLowerCase(); if (!fromText.has(k)) fromText.set(k, { kind: m.kind, name: m.name, why: m.why, panels: [] }); fromText.get(k).panels.push(p.id); });
    const frame = path.join(rel, p.file || ('storyboard/v1/' + p.id + '.png'));
    const refs = R.attach(frame, found);
    const clip = clipsDir && ['.mp4', '.mov'].map(x => path.join(clipsDir, p.id + x)).find(f => fs.existsSync(f));
    return {
      id: p.id, scene: p.scene == null ? null : String(p.scene),
      footage: job.footageSource === 'generated' ? (clip ? 'provided' : 'generate') : 'shoot',
      clip: clip ? clip.replace(/\\/g, '/') : null,
      uses: found.map(f => ({ kind: f.kind, name: f.name })),
      fromText: missing.map(m => ({ kind: m.kind, name: m.name })),
      refs,
    };
  });
  const available = {};
  for (const k of R.KINDS) available[k] = lib.items.filter(i => i.kind === k).map(i => ({ name: i.name, images: i.images.length, videos: i.videos.length, aliases: i.aliases }));
  return {
    schemaVersion: '1.0', jobId: job.jobId, scannedAt: new Date().toISOString(),
    library: { root: lib.root, exists: lib.exists, folders: lib.folders || {}, unrecognised: lib.unrecognised || [] },
    available,
    panels: rows,
    fromText: [...fromText.values()],
    unused: lib.items.filter(i => !used.has(i.kind + '/' + i.key)).map(i => ({ kind: i.kind, name: i.name })),
    footage: job.footageSource === 'generated' ? { provided: rows.filter(r => r.footage === 'provided').map(r => r.id), generate: rows.filter(r => r.footage === 'generate').map(r => r.id) } : null,
  };
}

function sceneLine(script, scene) {
  if (scene == null || !script) return null;
  const m = script.match(new RegExp('^\\s*Scene\\s+' + String(scene).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[^\\n]*', 'im'));
  return m ? m[0].trim() : null;
}

function summary(inv) {
  const out = [];
  if (!inv.library.exists) out.push('No reference library at ' + (inv.library.root || '(no footage folder)') + '. Every character, place and costume will be drawn from the prompt and the storyboard frame alone.');
  else {
    const have = R.KINDS.map(k => inv.available[k].length ? k + ': ' + inv.available[k].map(i => i.name + ' (' + (i.images || i.videos) + ')').join(', ') : null).filter(Boolean);
    out.push('Reference library ' + inv.library.root + (have.length ? '' : ' is empty.'));
    const mapped = Object.entries(inv.library.folders || {}).filter(([f, k]) => f.toLowerCase() !== k);
    if (mapped.length) out.push('  read as    ' + mapped.map(([f, k]) => f + ' → ' + k).join(', '));
    if ((inv.library.unrecognised || []).length) out.push('  not used   ' + inv.library.unrecognised.join(', ') + ' (a folder name no kind matches: rename it, or ask to have it read as characters, wardrobe, locations, props or motion)');
    have.forEach(h => out.push('  available  ' + h));
  }
  if (inv.footage) {
    out.push('Footage: ' + inv.footage.provided.length + ' clip(s) already there, used as they are' + (inv.footage.provided.length ? ' (' + inv.footage.provided.join(', ') + ')' : '') + '; ' + inv.footage.generate.length + ' to generate' + (inv.footage.generate.length ? ' (' + inv.footage.generate.join(', ') + ')' : '') + '.');
  }
  for (const p of inv.panels) {
    const bits = [];
    if (p.uses.length) bits.push('uses ' + p.uses.map(u => u.name).join(', '));
    if (p.fromText.length) bits.push('from text ' + p.fromText.map(u => u.name).join(', '));
    if (p.footage === 'provided') bits.push('clip provided');
    if (bits.length) out.push('  ' + p.id + '  ' + bits.join(' · '));
  }
  if (inv.fromText.length) {
    out.push('Needs a reference or will be drawn from text:');
    inv.fromText.forEach(m => out.push('  ' + m.kind.replace(/s$/, '') + ' "' + m.name + '" in ' + m.panels.join(', ') + ' (' + m.why + ')'));
  }
  if (inv.unused.length) out.push('In the library but no panel mentions it: ' + inv.unused.map(u => u.kind.replace(/s$/, '') + ' ' + u.name).join(', ') + '. Check the spelling, or add an alias in references/labels.json.');
  return out;
}
