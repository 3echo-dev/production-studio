// The reference library of a job and what each storyboard panel needs from it.
//
// Where it lives: job.referencesFolder, or <driveFolder>/references. Five kinds, one folder each:
//
//   references/characters/<name>/*.png|jpg|webp     one folder per person (or a single image named after them)
//   references/wardrobe/<name>/...                   costumes and outfits
//   references/locations/<name>/...                  sets and places
//   references/props/<name>/...                      objects that must look the same every time
//   references/motion/<P03|scene-3|name>.mp4|mov      camera moves or performance to follow
//
// Optional references/labels.json adds aliases, so the script can say "the girl" for a folder named "mei":
//   { "characters": { "mei": { "aliases": ["the girl"] } } }
//
// What a panel needs comes from three places, strongest first: fields the storyboard already carries
// (characters, location, wardrobe, props), names from the library found in the panel's words (caption,
// shot, the scene's script line), and screenplay CAPITALS in those words (THE GIRL). A need with no
// match in the library is reported as "from text": the model draws it from the prompt alone.
const fs = require('fs');
const path = require('path');

const KINDS = ['characters', 'wardrobe', 'locations', 'props', 'motion'];
const IMG = /\.(png|jpe?g|webp)$/i;
const VID = /\.(mp4|mov|webm|m4v)$/i;
// AgentC / SeeDance 2 per request: at most 9 image, 3 video and 3 audio references.
const LIMITS = { image: 9, video: 3 };
const PER_KIND = { characters: 4, wardrobe: 2, locations: 1, props: 2 };
const NOT_NAMES = new Set(['INT', 'EXT', 'VO', 'V.O', 'O.S', 'OS', 'CU', 'ECU', 'MS', 'MCU', 'WS', 'EWS', 'POV', 'DAY', 'NIGHT', 'CUT', 'TO', 'FADE', 'IN', 'OUT', 'CONT', 'CONTINUOUS', 'LATER', 'SCENE', 'TBC', 'OTS', 'LS', 'TV', 'AI', 'SFX', 'BGM', 'TITLE', 'SUPER', 'THE', 'A', 'AND', 'OF']);

const norm = s => String(s || '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
const fwd = p => p.replace(/\\/g, '/');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function libraryRoot(job) {
  if (job.referencesFolder) return job.referencesFolder;
  return job.driveFolder ? path.join(job.driveFolder, 'references') : null;
}

// Every item in the library: { kind, name, key, aliases, images[], videos[] }
function scanLibrary(root) {
  const lib = { root: root ? fwd(root) : null, exists: !!(root && fs.existsSync(root)), items: [] };
  if (!lib.exists) return lib;
  let labels = {};
  try { labels = JSON.parse(fs.readFileSync(path.join(root, 'labels.json'), 'utf8')); } catch { labels = {}; }
  for (const kind of KINDS) {
    const kd = path.join(root, kind);
    if (!fs.existsSync(kd) || !fs.statSync(kd).isDirectory()) continue;
    const groups = new Map();
    for (const e of fs.readdirSync(kd, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(kd, e.name);
      if (e.isDirectory()) {
        const files = fs.readdirSync(full).filter(f => !f.startsWith('.')).sort().map(f => path.join(full, f));
        groups.set(e.name, (groups.get(e.name) || []).concat(files));
      } else if (IMG.test(e.name) || VID.test(e.name)) {
        const name = e.name.replace(/\.[^.]+$/, '').replace(/[_\-\s]+\d+$/, '') || e.name;
        groups.set(name, (groups.get(name) || []).concat([full]));
      }
    }
    for (const [name, files] of groups) {
      const lab = ((labels[kind] || {})[name]) || ((labels[kind] || {})[norm(name)]) || {};
      lib.items.push({
        kind, name, key: norm(name), aliases: (lab.aliases || []).map(norm).filter(Boolean), note: lab.note || null,
        images: files.filter(f => IMG.test(f)).map(fwd), videos: files.filter(f => VID.test(f)).map(fwd),
      });
    }
  }
  return lib;
}

function asList(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]).map(String).filter(Boolean); }

// The screenplay convention: a character is written in capitals. Phrases of capital words, 2+ letters.
function capitalNames(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\b([A-Z][A-Z'\.]+(?:\s+[A-Z][A-Z'\.]+){0,2})\b/g)) {
    const words = m[1].split(/\s+/).filter(w => !NOT_NAMES.has(w.replace(/\.$/, '')));
    if (!words.length) continue;
    const phrase = m[1].replace(/\.$/, '');
    if (words.every(w => w.length < 2)) continue;
    if (NOT_NAMES.has(phrase)) continue;
    out.add(phrase);
  }
  return [...out];
}

function mentions(text, item) {
  const t = ' ' + norm(text) + ' ';
  return [item.key].concat(item.aliases).some(n => n && new RegExp('(^|[^a-z0-9])' + esc(n) + '([^a-z0-9]|$)').test(t));
}

// What one panel needs and what the library gives it.
function panelNeeds(panel, words, lib) {
  const found = [];     // { kind, name, item }
  const missing = [];   // { kind, name, why }
  const byKind = k => lib.items.filter(i => i.kind === k);
  const explicit = { characters: asList(panel.characters), locations: asList(panel.location || panel.locations), wardrobe: asList(panel.wardrobe), props: asList(panel.props) };
  for (const kind of ['characters', 'wardrobe', 'locations', 'props']) {
    const seen = new Set();
    for (const want of explicit[kind]) {
      const hit = byKind(kind).find(i => i.key === norm(want) || i.aliases.includes(norm(want)));
      if (hit) { if (!seen.has(hit.key)) { found.push({ kind, name: hit.name, item: hit }); seen.add(hit.key); } }
      else missing.push({ kind, name: want, why: 'named on the storyboard, no reference in the library' });
    }
    for (const it of byKind(kind)) if (!seen.has(it.key) && mentions(words, it)) { found.push({ kind, name: it.name, item: it }); seen.add(it.key); }
  }
  // Characters in capitals that nothing in the library covers.
  const covered = found.filter(f => f.kind === 'characters').flatMap(f => [f.item.key].concat(f.item.aliases));
  for (const cap of capitalNames(words)) {
    const n = norm(cap);
    if (covered.some(c => c === n || n.includes(c) || c.includes(n))) continue;
    if (missing.some(m => norm(m.name) === n)) continue;
    missing.push({ kind: 'characters', name: cap, why: 'in the script in capitals, no reference in the library' });
  }
  // Motion: by panel id, by scene, or by name in the words.
  const motion = byKind('motion').filter(i => i.key === norm(panel.id) || (panel.scene != null && (i.key === 'scene ' + String(panel.scene) || i.key === 's' + String(panel.scene))) || mentions(words, i));
  for (const m of motion) found.push({ kind: 'motion', name: m.name, item: m });
  return { found, missing };
}

// The reference list one generation request carries, in the order the prompt names them.
function attach(framePath, found) {
  const images = [{ kind: 'frame', name: 'storyboard frame', file: fwd(framePath) }];
  const videos = [];
  for (const kind of ['characters', 'locations', 'wardrobe', 'props']) {
    let n = 0;
    for (const f of found.filter(x => x.kind === kind)) {
      if (n >= PER_KIND[kind] || images.length >= LIMITS.image) break;
      if (!f.item.images.length) continue;
      images.push({ kind, name: f.name, file: f.item.images[0] }); n++;
      if (kind === 'characters' && f.item.images[1] && images.length < LIMITS.image && found.filter(x => x.kind === 'characters').length <= 2) images.push({ kind, name: f.name, file: f.item.images[1] });
    }
  }
  for (const f of found.filter(x => x.kind === 'motion')) {
    for (const v of f.item.videos) { if (videos.length >= LIMITS.video) break; videos.push({ kind: 'motion', name: f.name, file: v }); }
  }
  return { images, videos };
}

// The sentence that tells the model what each attached reference is for.
function legend(refs) {
  const role = { frame: 'the storyboard frame, for composition and framing', characters: 'keep this face, build and hair', locations: 'this is the place', wardrobe: 'this is the costume', props: 'this object, exactly as shown' };
  const parts = refs.images.map((r, i) => '[Image ' + (i + 1) + '] ' + (r.kind === 'frame' ? role.frame : r.name + ' (' + r.kind.replace(/s$/, '') + '): ' + role[r.kind]));
  refs.videos.forEach((r, i) => parts.push('[Video ' + (i + 1) + '] ' + r.name + ': follow this camera move and timing'));
  return parts.length ? 'References: ' + parts.join('; ') + '.' : '';
}

module.exports = { KINDS, LIMITS, libraryRoot, scanLibrary, panelNeeds, attach, legend, capitalNames };
