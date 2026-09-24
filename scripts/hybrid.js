#!/usr/bin/env node
// The hybrid route (footageSource "hybrid"): real actors kept exactly as shot, backgrounds replaced.
// Per storyboard panel there is one actor plate; the actor is cut out (cutout.py, plate-director),
// laid over a background for its location (composite.py, composite-director), and the composite
// becomes the clip the panel-id first cut uses. The actor's pixels are never redrawn.
//
//   node hybrid.js <client> <job-id> brief                        write hybrid-brief.json: plates, locations, backgrounds
//   node hybrid.js <client> <job-id> quote <bgKey> --credits N    the AgentC quote for one background to generate
//   node hybrid.js <client> <job-id> approve backgrounds --by <who> --at <iso> [--credits N] [--keys a,b]
//   node hybrid.js <client> <job-id> land <bgKey> --file <png|jpg|mp4> | --url <https media url> [--job-ref <id>] [--credits N]
//   node hybrid.js <client> <job-id> status
//
// Plates: footage/plates/, one file per panel named after it (P03.mov), or footage/plates/plates.json
// mapping panel ids to files ({"P03": "day-01/A001_C004.mov"}). Locations: the storyboard's
// `location` field, else a location the reference library holds and the panel names, else the scene.
// A background is the library's picture of that location (provided, no credits) or one generated on
// AgentC after a quote and a yes on the board. This script never spends.
// Exit 0 ok · 1 fault · 2 usage · 3 not ready
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');
const R = require('./lib-references.js');

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { client, jobId, dir, rest } = ws.resolveJobArgs(argv, argv);
const cmd = rest[0];
if (!client || !jobId || !['brief', 'quote', 'approve', 'land', 'status'].includes(cmd)) { console.error('usage: hybrid.js <client> <job-id> brief|quote|approve|land|status ...'); process.exit(2); }
const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
if (job.footageSource !== 'hybrid') { console.error('job.json footageSource is not "hybrid".'); process.exit(3); }
const briefPath = path.join(dir, 'hybrid-brief.json');
const readBrief = () => { if (!fs.existsSync(briefPath)) { console.error('no hybrid-brief.json yet; run brief first'); process.exit(3); } return JSON.parse(fs.readFileSync(briefPath, 'utf8')); };
const writeBrief = b => { fs.writeFileSync(briefPath + '.tmp', JSON.stringify(b, null, 2) + '\n'); fs.renameSync(briefPath + '.tmp', briefPath); };
const fwd = p => p.replace(/\\/g, '/');
const MEDIA = /\.(mov|mp4|mxf|m4v|mkv|avi)$/i;
const IMG = /\.(png|jpe?g|webp)$/i;
const norm = s => String(s || '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
const platesDir = path.join(job.driveFolder, 'footage', 'plates');
const bgDir = path.join(job.driveFolder, 'footage', 'backgrounds');

function walk(d, out = []) { let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; } for (const x of e) { const f = path.join(d, x.name); if (x.isDirectory()) walk(f, out); else out.push(f); } return out; }

if (cmd === 'brief') {
  const rel = job.prePipelineReleaseFolder;
  const sb = JSON.parse(fs.readFileSync(path.join(rel, 'storyboard.json'), 'utf8'));
  const panels = (sb.panels || []).slice().sort((a, b) => (a.storyOrder || 0) - (b.storyOrder || 0) || String(a.id).localeCompare(String(b.id)));
  if (!panels.length) { console.error('storyboard.json has no panels'); process.exit(1); }
  const script = fs.existsSync(path.join(rel, 'script.md')) ? fs.readFileSync(path.join(rel, 'script.md'), 'utf8') : '';
  const sceneLine = s => { if (s == null) return null; const m = script.match(new RegExp('^\\s*Scene\\s+' + String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[^\\n]*', 'im')); return m ? m[0].trim() : null; };
  let mapping = {}; try { mapping = JSON.parse(fs.readFileSync(path.join(platesDir, 'plates.json'), 'utf8')); } catch { mapping = {}; }
  const plateFiles = walk(platesDir).filter(f => MEDIA.test(f));
  const plateFor = id => { if (mapping[id]) { const f = path.join(platesDir, mapping[id]); return fs.existsSync(f) ? f : null; } return plateFiles.find(f => path.parse(f).name.toUpperCase() === String(id).toUpperCase()) || null; };
  const lib = R.scanLibrary(R.libraryRoot(job), R.scopeOf(job));
  const prev = fs.existsSync(briefPath) ? JSON.parse(fs.readFileSync(briefPath, 'utf8')) : null;
  const oldPanels = new Map(((prev || {}).panels || []).map(p => [p.id, p]));
  const oldBg = (prev || {}).backgrounds || {};
  const backgrounds = {};
  const rows = panels.map(p => {
    const line = sceneLine(p.scene);
    const words = [p.caption, p.description, p.shot, line].filter(Boolean).join('. ');
    const needs = R.panelNeeds(p, words, lib);
    const libLoc = needs.found.find(f => f.kind === 'locations');
    const named = p.location || (libLoc && libLoc.name) || null;
    const key = norm(named || ('scene ' + (p.scene == null ? p.id : p.scene)));
    if (!backgrounds[key]) {
      const item = libLoc && norm(libLoc.name) === key ? libLoc.item : lib.items.find(i => i.kind === 'locations' && (i.key === key || i.aliases.includes(key)));
      const old = oldBg[key] || {};
      const frame = fwd(path.join(rel, p.file || ('storyboard/v1/' + p.id + '.png')));
      if (item && item.images.length) backgrounds[key] = { name: named || key, source: 'library', file: item.images[0], sha256: board.sha256File(item.images[0]), status: 'provided', panels: [] };
      else backgrounds[key] = {
        name: named || key, source: 'generate', status: old.status === 'delivered' ? 'delivered' : 'pending', file: old.status === 'delivered' ? old.file : null, sha256: old.status === 'delivered' ? old.sha256 : null,
        prompt: old.promptOverride || ['An empty ' + (named || ('set for scene ' + p.scene)) + ', with no people in it, as a film background plate for a live-action scene.', words ? 'The scene: ' + words.replace(/,?\s*VO:\s*"[^"]*"/i, '') + '.' : null, 'Keep the framing, camera height and light direction of the storyboard frame; leave the space the actor stands in clear.', 'Photographic, cinematic, natural light, ' + (job.aspectRatio || '16:9') + ' frame; no text, no people, no logos.'].filter(Boolean).join(' '),
        referenceFrame: frame, ratio: job.aspectRatio || '16:9', idempotencyKey: jobId + '/background/' + key.replace(/\s+/g, '-'),
        quotedCredits: old.quotedCredits || null, jobRef: old.jobRef || null, credits: old.credits || null, panels: [],
      };
    }
    backgrounds[key].panels.push(p.id);
    const plate = plateFor(p.id);
    const old = oldPanels.get(p.id) || {};
    const plateSha = plate ? board.sha256File(plate) : null;
    // A plate that changed since the cut-out was made voids the cut-out and the composite.
    const keep = plate && old.plateSha === plateSha;
    return {
      id: p.id, scene: p.scene == null ? null : String(p.scene), storyOrder: p.storyOrder || null, durationSec: p.durationSec || null,
      plate: plate ? fwd(plate) : null, plateSha, background: key,
      cutout: keep ? (old.cutout || null) : null, composite: keep ? (old.composite || null) : null,
      status: !plate ? 'no-plate' : keep && old.composite ? old.status : (keep && old.cutout ? 'cut-out' : 'plate'),
    };
  });
  const out = { schemaVersion: '1.0', jobId, generatedAt: new Date().toISOString(), library: { root: lib.root, layout: lib.layout, project: lib.project, warnings: lib.warnings }, cutoutMethod: (job.hybrid || {}).cutout || 'auto', approvals: (prev || {}).approvals || {}, backgrounds, panels: rows };
  writeBrief(out);
  const noPlate = rows.filter(r => !r.plate).map(r => r.id);
  const gen = Object.entries(backgrounds).filter(([, b]) => b.source === 'generate' && b.status !== 'delivered');
  const lines = [];
  lines.push('hybrid-brief.json: ' + rows.length + ' panel(s), ' + (rows.length - noPlate.length) + ' with an actor plate' + (noPlate.length ? '; no plate for ' + noPlate.join(', ') : '') + '.');
  lines.push('Backgrounds: ' + Object.keys(backgrounds).length + ' location(s)');
  for (const [k, b] of Object.entries(backgrounds)) lines.push('  ' + b.name + ' (' + b.panels.join(', ') + '): ' + (b.source === 'library' ? 'from the library, ' + path.basename(b.file) : b.status === 'delivered' ? 'generated, ' + path.basename(b.file) : 'to generate'));
  if (gen.length) lines.push(gen.length + ' background(s) to generate: quote the first on AgentC (create_image_job is 1 credit per image) and ask on the board before anything is spent.');
  (lib.warnings || []).forEach(w => lines.push('WARNING ' + w.text));
  console.log(lines.join('\n'));
  process.exit(0);
}
if (cmd === 'quote') {
  const b = readBrief(); const bg = b.backgrounds[norm(rest[1])]; if (!bg || !opt('--credits')) { console.error('usage: quote <bgKey> --credits N'); process.exit(2); }
  if (bg.source !== 'generate') { console.error(rest[1] + ' comes from the library; nothing to quote'); process.exit(3); }
  bg.quotedCredits = Number(opt('--credits')); if (opt('--job-ref')) bg.jobRef = opt('--job-ref'); writeBrief(b); console.log(bg.name + ' quoted at ' + bg.quotedCredits + ' credit(s).'); process.exit(0);
}
if (cmd === 'approve') {
  if (rest[1] !== 'backgrounds' || !opt('--by') || !opt('--at')) { console.error('usage: approve backgrounds --by <who> --at <iso> [--credits N] [--keys a,b]'); process.exit(2); }
  const b = readBrief(); b.approvals = b.approvals || {};
  b.approvals.backgrounds = { by: opt('--by'), at: opt('--at'), credits: opt('--credits') ? Number(opt('--credits')) : null, channel: 'board', keys: opt('--keys') ? opt('--keys').split(',').map(norm).filter(Boolean) : null };
  writeBrief(b); console.log('backgrounds approved by ' + opt('--by') + (opt('--credits') ? ' for ' + opt('--credits') + ' credit(s)' : '') + '.'); process.exit(0);
}
if (cmd === 'land') {
  const b = readBrief(); const key = norm(rest[1]); const bg = b.backgrounds[key]; if (!bg) { console.error('no background ' + rest[1] + ' in the brief'); process.exit(2); }
  const ap = (b.approvals || {}).backgrounds; if (!ap) { console.error('no background approval on record; nothing lands without a yes from the board'); process.exit(3); }
  if (ap.keys && !ap.keys.includes(key)) { console.error(bg.name + ' is outside the approved backgrounds (' + ap.keys.join(', ') + ')'); process.exit(3); }
  board.ensureDir(bgDir);
  let src = opt('--file'); let ext = src ? path.extname(src) : '.png';
  if (opt('--url')) { const tmp = path.join(bgDir, '.dl-' + Date.now()); const r = spawnSync('curl', ['-sSL', '--fail', '-o', tmp, opt('--url')], { encoding: 'utf8' }); if (r.status !== 0) { console.error('download failed: ' + (r.stderr || r.error)); process.exit(1); } src = tmp; ext = /\.mp4|video/i.test(opt('--url')) ? '.mp4' : '.png'; }
  if (!src || !fs.existsSync(src)) { console.error('land needs --file <png|jpg|mp4> or --url <media url>'); process.exit(2); }
  const dest = path.join(bgDir, key.replace(/\s+/g, '-') + ext.toLowerCase());
  fs.copyFileSync(src, dest); if (opt('--url')) fs.unlinkSync(src);
  bg.status = 'delivered'; bg.file = fwd(dest); bg.sha256 = board.sha256File(dest); bg.landedAt = new Date().toISOString();
  if (opt('--job-ref')) bg.jobRef = opt('--job-ref'); if (opt('--credits')) bg.credits = Number(opt('--credits'));
  writeBrief(b);
  const left = Object.values(b.backgrounds).filter(x => x.source === 'generate' && x.status !== 'delivered').length;
  console.log(bg.name + ' landed: ' + path.basename(dest) + '. ' + (left ? left + ' background(s) still to generate.' : 'Every location has a background; run cutout.py then composite.py.'));
  process.exit(0);
}
if (cmd === 'status') {
  const b = readBrief();
  const bgs = Object.values(b.backgrounds);
  console.log('hybrid: ' + b.panels.filter(p => p.composite).length + '/' + b.panels.filter(p => p.plate).length + ' composited; backgrounds ' + bgs.filter(x => ['provided', 'delivered'].includes(x.status)).length + '/' + bgs.length + ' ready; credits spent ' + bgs.reduce((s, x) => s + (Number(x.credits) || 0), 0));
  for (const p of b.panels) console.log('  ' + p.id + ' ' + p.status + (p.cutout ? ' · cut-out ' + p.cutout.method : '') + (p.composite ? ' · actor kept ' + p.composite.actorPreservedPct + '%' : '') + ' · ' + b.backgrounds[p.background].name);
  process.exit(0);
}
