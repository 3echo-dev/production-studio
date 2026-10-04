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
//   footage     per panel, by route: shoot, the rushes whose names carry its scene; generated, the
//               clip already there or to generate; hybrid, the actor plate (present or missing), its
//               screen (green, blue, or none: AI cut-out, and whether rembg is on this machine), a
//               camera that moves (a still background will not track it), and its location's
//               background (the library's, free, or to generate at 1 credit)
//   audio       VO takes against the script's VO lines, music tracks (three for a shortlist), SFX
//   gaps        everything above a person has to answer, gathered so the board asks once
//
// It never spends and never asks. The orchestrator puts the summary on the board (Intake item) and
// asks once about the gaps: missing plates or takes, text-only references, backgrounds to generate.
// Exit 0 ok · 1 fault · 2 usage · 3 no storyboard
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const { spawnSync } = require('child_process');
const R = require('./lib-references.js');
const MEDIA = /\.(mov|mp4|mxf|m4v|mkv|avi)$/i;
const AUDIO = /\.(wav|aif|aiff|mp3|m4a|flac)$/i;
const NOT_RUSHES = /^(generated|plates|cutout|composite|backgrounds|references|refs|assets|library)$/i;
const fwd = p => p.replace(/\\/g, '/');
function walk(d, out = []) { let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; } for (const x of e) { const f = path.join(d, x.name); if (x.isDirectory()) walk(f, out); else out.push(f); } return out; }

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
  const lib = R.scanLibrary(R.libraryRoot(job), R.scopeOf(job));
  const clipsDir = job.driveFolder ? path.join(job.driveFolder, 'footage', 'generated') : null;
  const panels = (sb.panels || []).slice().sort((a, b) => (a.storyOrder || 0) - (b.storyOrder || 0) || String(a.id).localeCompare(String(b.id)));
  const used = new Set();
  const fromText = new Map();
  const clashes = new Map();
  const rows = panels.map(p => {
    const words = [p.caption, p.description, p.shot, sceneLine(script, p.scene)].filter(Boolean).join('. ');
    const { found, missing, clashes: cl } = R.panelNeeds(p, words, lib);
    cl.forEach(c => { const k = c.kind + '/' + c.name.toLowerCase(); if (!clashes.has(k)) clashes.set(k, Object.assign({ panels: [] }, c)); clashes.get(k).panels.push(p.id); });
    found.forEach(f => used.add(f.kind + '/' + f.item.key));
    missing.forEach(m => { const k = m.kind + '/' + m.name.toLowerCase(); if (!fromText.has(k)) fromText.set(k, { kind: m.kind, name: m.name, why: m.why, panels: [] }); fromText.get(k).panels.push(p.id); });
    const frame = path.join(rel, p.file || ('storyboard/v1/' + p.id + '.png'));
    const refs = R.attach(frame, found);
    const clip = clipsDir && ['.mp4', '.mov'].map(x => path.join(clipsDir, p.id + x)).find(f => fs.existsSync(f));
    return {
      id: p.id, scene: p.scene == null ? null : String(p.scene),
      footage: job.footageSource === 'generated' ? (clip ? 'provided' : 'generate') : job.footageSource === 'hybrid' ? 'hybrid' : 'shoot',
      clip: clip ? clip.replace(/\\/g, '/') : null,
      uses: found.map(f => ({ kind: f.kind, name: f.name })),
      fromText: missing.map(m => ({ kind: m.kind, name: m.name })),
      clashes: cl.map(c => ({ kind: c.kind, name: c.name })),
      refs,
    };
  });
  const available = {};
  for (const k of R.KINDS) available[k] = lib.items.filter(i => i.kind === k).map(i => ({ name: i.name, images: i.images.length, videos: i.videos.length, aliases: i.aliases, scope: i.scope, from: i.sources, overrides: i.overrides, clash: i.clash }));
  const src = job.footageSource || 'shoot';
  const rushes = src === 'shoot' ? rushesCheck(job, rows) : null;
  const hybrid = src === 'hybrid' ? hybridCheck(job, dir, rows) : null;
  const audio = audioCheck(job, script);
  const inv0 = { rows, fromText: [...fromText.values()], clashes: [...clashes.values()] };
  return {
    schemaVersion: '1.1', jobId: job.jobId, scannedAt: new Date().toISOString(), footageSource: src,
    rushes, hybrid, audio, gaps: gapsOf(inv0, rushes, hybrid, audio, job),
    library: { root: lib.root, exists: lib.exists, layout: lib.layout, project: lib.project, shared: lib.shared, otherProjects: lib.otherProjects, folders: lib.folders || {}, unrecognised: lib.unrecognised || [], warnings: lib.warnings },
    available,
    panels: rows,
    fromText: [...fromText.values()],
    clashes: [...clashes.values()],
    unused: lib.items.filter(i => !used.has(i.kind + '/' + i.key)).map(i => ({ kind: i.kind, name: i.name })),
    footage: job.footageSource === 'generated' ? { provided: rows.filter(r => r.footage === 'provided').map(r => r.id), generate: rows.filter(r => r.footage === 'generate').map(r => r.id) } : null,
  };
}

// Shoot: which scenes have rushes whose file names carry the scene (A001_C003_scene-2_t3.mov). Clips
// without a scene in the name are counted, not guessed: the sequence stage matches them by picture.
function rushesCheck(job, rows) {
  const root = job.driveFolder ? path.join(job.driveFolder, 'footage') : null;
  const files = root ? walk(root).filter(f => MEDIA.test(f) && !path.relative(root, f).split(path.sep).slice(0, -1).some(s => NOT_RUSHES.test(s) || R.kindOf(s))) : [];
  const byScene = {};
  let untagged = 0;
  for (const f of files) { const m = path.basename(f).match(/scene[-_ ]?([A-Za-z0-9]+)/i); if (m) (byScene[m[1].toLowerCase()] = byScene[m[1].toLowerCase()] || []).push(fwd(path.relative(root, f))); else untagged++; }
  const scenes = [...new Set(rows.map(r => r.scene).filter(s => s != null))];
  const tagged = files.length - untagged;
  for (const r of rows) r.rushes = r.scene == null ? null : (byScene[String(r.scene).toLowerCase()] || []).length;
  return { folder: root ? fwd(root) : null, clips: files.length, tagged, untagged, byScene,
    scenesWithout: tagged ? scenes.filter(s => !byScene[String(s).toLowerCase()]) : [] };
}

// Hybrid: the brief (plates, locations, backgrounds; hybrid.js, which spends nothing) plus a look at
// each plate (probe-plates.py: screen colour, camera movement, rembg on this machine).
function hybridCheck(job, dir, rows) {
  const b = spawnSync(process.execPath, [path.join(__dirname, 'hybrid.js'), dir, 'brief'], { encoding: 'utf8' });
  if (b.status !== 0) return { error: 'hybrid brief failed: ' + (b.stderr || b.stdout).trim() };
  const brief = JSON.parse(fs.readFileSync(path.join(dir, 'hybrid-brief.json'), 'utf8'));
  const plates = brief.panels.filter(p => p.plate).map(p => p.plate);
  let probe = null;
  if (plates.length) {
    const PY = spawnSync('python', ['--version']).status === 0 ? 'python' : 'python3';
    const r = spawnSync(PY, [path.join(__dirname, 'probe-plates.py'), ...plates], { encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONUTF8: '1' }) });
    try { probe = JSON.parse(r.stdout); } catch { probe = { error: ((r.stderr || '') + (r.error || '')).trim().split('\n').pop() || 'no output' }; }
  }
  const method = (job.hybrid || {}).cutout || 'auto';
  const byId = new Map(brief.panels.map(p => [p.id, p]));
  for (const r of rows) {
    const p = byId.get(r.id); if (!p) continue;
    if (p.keep) { r.keep = p.keep; r.plate = null; r.background = null; continue; }
    const bg = brief.backgrounds[p.background];
    const look = p.plate && probe && probe.plates ? probe.plates[p.plate] : null;
    r.plate = p.plate;
    r.screen = look && !look.error ? look.screen : undefined;
    r.cutout = !p.plate ? null : method !== 'auto' ? method : look && !look.error ? (look.screen ? 'chromakey' : 'rembg') : 'unchecked';
    r.cameraMoves = look && look.camera ? look.camera.moving : null;
    r.background = { key: p.background, name: bg.name, source: bg.source, status: bg.status, credits: bg.source === 'generate' && bg.status !== 'delivered' ? 1 : 0, continuityOf: bg.continuityOf || null };
    r.pictureArea = look && look.pictureArea ? look.pictureArea : null;
  }
  const toGen = Object.entries(brief.backgrounds).filter(([, b]) => b.source === 'generate' && b.status !== 'delivered');
  return {
    plates: rows.filter(r => r.plate).length, noPlate: rows.filter(r => r.footage === 'hybrid' && !r.plate && !r.keep).map(r => r.id), kept: rows.filter(r => r.keep).map(r => r.id),
    rembgInstalled: probe && !probe.error ? probe.rembgInstalled : null, probeError: probe && probe.error ? probe.error : null,
    needRembg: rows.filter(r => r.cutout === 'rembg').map(r => r.id), cameraMoves: rows.filter(r => r.cameraMoves).map(r => r.id),
    backgrounds: Object.entries(brief.backgrounds).map(([k, b]) => ({ key: k, name: b.name, source: b.source, status: b.status, panels: b.panels, continuityOf: b.continuityOf || null })),
    backgroundsToGenerate: toGen.map(([k]) => k), backgroundCredits: toGen.length,
  };
}

// Audio: VO takes against the script's VO lines (the markers vo-drop-in.js places), music, SFX.
function audioCheck(job, script) {
  const lines = script.split(/\r?\n/).filter(l => /VO:\s*\S/i.test(l)).length;
  const files = k => job.driveFolder ? walk(path.join(job.driveFolder, 'audio', k)).filter(f => AUDIO.test(f)).map(f => fwd(path.basename(f))) : [];
  const vo = files('vo'), bgm = files('bgm'), sfx = files('sfx');
  return { voLines: lines, voTakes: vo.length, vo, bgm, sfx, voShort: Math.max(0, lines - vo.length), bgmShort: bgm.length ? Math.max(0, 3 - bgm.length) : 3 };
}

// Everything a person has to answer, in one list, so the board asks once.
function gapsOf(inv, rushes, hybrid, audio, job) {
  const g = [];
  if (hybrid && hybrid.error) g.push({ kind: 'hybrid', text: hybrid.error });
  if (hybrid && hybrid.noPlate.length) g.push({ kind: 'plate', panels: hybrid.noPlate, text: 'No actor plate for ' + hybrid.noPlate.join(', ') + ': add footage/plates/{panel}.mov (or map it in plates.json), or drop the panel from the cut.' });
  if (hybrid && hybrid.needRembg.length && hybrid.rembgInstalled === false) g.push({ kind: 'rembg', panels: hybrid.needRembg, text: hybrid.needRembg.join(', ') + ': no green or blue screen, so the actor is cut out with AI (rembg), which is not installed on this machine. Install it, re-shoot on a screen, or cut these on a machine that has it.' });
  if (hybrid && hybrid.cameraMoves.length) g.push({ kind: 'camera', panels: hybrid.cameraMoves, text: 'The camera moves in ' + hybrid.cameraMoves.join(', ') + ': a still background will not move with it. Accept a locked background (free), or give these a moving background: the AgentC video model remakes the shot in the new place with the same camera move and the real actor is put back on top (priced before anything is made).' });
  if (hybrid && hybrid.backgroundCredits) g.push({ kind: 'backgrounds', credits: hybrid.backgroundCredits, text: hybrid.backgroundCredits + ' background(s) to generate (' + hybrid.backgroundsToGenerate.join(', ') + '), 1 credit each: add a picture to the library\'s locations, or approve ' + hybrid.backgroundCredits + ' credit(s) when asked.' });
  if (rushes && !rushes.clips) g.push({ kind: 'rushes', text: 'No rushes under footage/: the shoot folder is empty.' });
  if (rushes && rushes.scenesWithout.length) g.push({ kind: 'rushes', scenes: rushes.scenesWithout, text: 'No clip names scene ' + rushes.scenesWithout.join(', ') + (rushes.untagged ? ' (' + rushes.untagged + ' clip(s) carry no scene in the name; they may still match by picture)' : '') + '.' });
  if (audio.voLines && audio.voShort) g.push({ kind: 'vo', text: 'VO: ' + audio.voTakes + ' take(s) for ' + audio.voLines + ' script line(s)' + (audio.voTakes ? '' : '; the cut is music-only') + ': add takes under audio/vo, or confirm the lines are not voiced.' });
  if (audio.bgmShort && !job.audioLed) g.push({ kind: 'bgm', text: audio.bgm.length ? 'Music: ' + audio.bgm.length + ' track(s) supplied (' + audio.bgm.join(', ') + '). Use ' + (audio.bgm.length === 1 ? 'it' : 'one of them') + ' as the music, or add tracks for a shortlist of three.' : 'Music: none under audio/bgm. Add at least one track (three for a shortlist), or mark music not applicable.' });
  // On a hybrid job a location with no picture is the background to generate, already listed above.
  const text = job.footageSource === 'generated' ? inv.fromText : [];
  if (text.length) g.push({ kind: 'references', text: text.length + ' name(s) with no reference picture (' + text.map(m => m.name).join(', ') + '): add one, or let them be drawn from text.' });
  if (inv.clashes.length) g.push({ kind: 'clash', text: inv.clashes.length + ' name clash(es) in the library: a person picks which picture is meant.' });
  return g;
}

function sceneLine(script, scene) {
  if (scene == null || !script) return null;
  const m = script.match(new RegExp('^\\s*Scene\\s+' + String(scene).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[^\\n]*', 'im'));
  return m ? m[0].trim() : null;
}

function summary(inv) {
  const out = [];
  if (!inv.library.exists) out.push('No reference library at ' + (inv.library.root || '(no footage folder)') + (inv.footageSource === 'generated' ? '. Every character, place and costume will be drawn from the prompt and the storyboard frame alone.' : '. None is needed: the actors are filmed' + (inv.footageSource === 'hybrid' ? ', and each background is from the library or generated (below).' : '.')));
  else {
    const have = R.KINDS.map(k => inv.available[k].length ? k + ': ' + inv.available[k].map(i => i.name + ' (' + (i.images || i.videos) + ')').join(', ') : null).filter(Boolean);
    out.push('Reference library ' + inv.library.root + (have.length ? '' : ' is empty.'));
    if (inv.library.layout === 'by-project') out.push('  scope      this project: ' + (inv.library.project || 'no folder found') + (inv.library.shared ? ' + ' + inv.library.shared : '') + (inv.library.otherProjects.length ? '; ignored: ' + inv.library.otherProjects.join(', ') : ''));
    (inv.library.warnings || []).forEach(w => out.push('  WARNING    ' + w.text));
    const mapped = Object.entries(inv.library.folders || {}).filter(([f, k]) => f.toLowerCase() !== k);
    if (mapped.length) out.push('  read as    ' + mapped.map(([f, k]) => f + ' → ' + k).join(', '));
    if ((inv.library.unrecognised || []).length) out.push('  not used   ' + inv.library.unrecognised.join(', ') + ' (a folder name no kind matches: rename it, or ask to have it read as characters, wardrobe, locations, props or motion)');
    have.forEach(h => out.push('  available  ' + h));
  }
  if (inv.footage) {
    out.push('Footage: ' + inv.footage.provided.length + ' clip(s) already there, used as they are' + (inv.footage.provided.length ? ' (' + inv.footage.provided.join(', ') + ')' : '') + '; ' + inv.footage.generate.length + ' to generate' + (inv.footage.generate.length ? ' (' + inv.footage.generate.join(', ') + ')' : '') + '.');
  }
  if (inv.rushes) out.push('Rushes: ' + inv.rushes.clips + ' clip(s) under footage/' + (inv.rushes.clips ? ', ' + inv.rushes.tagged + ' with a scene in the name' + (inv.rushes.untagged ? ', ' + inv.rushes.untagged + ' without (matched by picture at the sequence stage)' : '') : '') + '.');
  const h = inv.hybrid;
  if (h && h.error) out.push('Hybrid: ' + h.error);
  else if (h) {
    out.push('Hybrid: ' + h.plates + ' of ' + inv.panels.length + ' panel(s) have an actor plate' + (h.kept.length ? ', ' + h.kept.join(', ') + ' kept as they are' : '') + '; backgrounds: ' + h.backgrounds.map(b => b.name + ' (' + (b.source === 'library' ? 'library, free' : b.status === 'delivered' ? 'generated' : 'to generate, 1 credit') + ')').join(', ') + '.');
    if (h.probeError) out.push('  plates not looked at (' + h.probeError + '): screen and camera are unchecked; they are checked again at the cut-out.');
    else if (h.needRembg.length) out.push('  AI cut-out (rembg) needed for ' + h.needRembg.join(', ') + ': ' + (h.rembgInstalled ? 'installed on this machine.' : 'NOT installed on this machine.'));
  }
  for (const p of inv.panels) {
    const bits = [];
    if (p.footage === 'hybrid' && p.keep) bits.push('kept as it is (' + path.basename(p.keep) + '): no cut-out, no background');
    else if (p.footage === 'hybrid') {
      if (!p.plate) bits.push('plate MISSING: add footage/plates/' + p.id + '.mov (or footage/keep/' + p.id + '.mp4 to use a clip as it is)');
      else {
        bits.push('plate ✓');
        bits.push(p.screen === undefined ? 'screen unchecked' : p.screen ? p.screen + ' screen' : 'no screen: AI cut-out' + (inv.hybrid.rembgInstalled ? '' : ' (rembg not installed)'));
        if (p.pictureArea) bits.push('letterboxed ' + p.pictureArea.w + 'x' + p.pictureArea.h + ' (bars kept)');
        if (p.cameraMoves) bits.push('camera moves: a still background will not track it');
      }
      if (p.background) bits.push('background ' + p.background.name + ' (' + (p.background.source === 'library' ? 'library, free' : p.background.credits ? 'generate, 1 credit' : 'generated') + ')');
    }
    if (p.footage === 'shoot' && inv.rushes && inv.rushes.tagged && p.rushes != null) bits.push(p.rushes ? p.rushes + ' rush clip(s) for scene ' + p.scene : 'no clip names scene ' + p.scene);
    if (p.uses.length) bits.push('uses ' + p.uses.map(u => u.name).join(', '));
    if (p.fromText.length && inv.footageSource === 'generated') bits.push('from text ' + p.fromText.map(u => u.name).join(', '));
    if (p.clashes.length) bits.push('NAME CLASH ' + p.clashes.map(u => u.name).join(', '));
    if (p.footage === 'provided') bits.push('clip provided');
    if (bits.length) out.push('  ' + p.id + '  ' + bits.join(' · '));
  }
  if (inv.fromText.length && inv.footageSource === 'generated') {
    out.push('Needs a reference or will be drawn from text:');
    inv.fromText.forEach(m => out.push('  ' + m.kind.replace(/s$/, '') + ' "' + m.name + '" in ' + m.panels.join(', ') + ' (' + m.why + ')'));
  }
  if (inv.clashes.length) {
    out.push('Two different pictures share a name; nothing is generated for these panels until a person picks one (rename one, or remove it):');
    inv.clashes.forEach(c => out.push('  ' + c.kind.replace(/s$/, '') + ' "' + c.name + '" in ' + c.sources.join(' and ') + ' (used by ' + c.panels.join(', ') + ')'));
  }
  if (inv.unused.length) out.push('In the library but no panel mentions it: ' + inv.unused.map(u => u.kind.replace(/s$/, '') + ' ' + u.name).join(', ') + '. Check the spelling, or add an alias in references/labels.json.');
  const a = inv.audio;
  out.push('Audio: VO ' + a.voTakes + ' take(s) for ' + a.voLines + ' script line(s) · music ' + (a.bgm.length ? a.bgm.length + ' track(s)' : 'none found') + ' · SFX ' + a.sfx.length + '.');
  if (inv.gaps.length) { out.push('To answer once on the board (nothing is spent before):'); inv.gaps.forEach((g, i) => out.push('  ' + (i + 1) + '. ' + g.text)); }
  else out.push('Nothing missing: every panel has what it needs.');
  return out;
}
