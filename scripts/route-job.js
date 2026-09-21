#!/usr/bin/env node
// Deterministic router: job.json -> route.json. Rules override the model.
//
//   node route-job.js <job.json> [--out <route.json>] [--config <CONFIG.md>] [--human]
//
// Exit codes: 0 ROUTED · 3 NEEDS_CLARIFICATION or BLOCKED · 4 UNSUPPORTED · 1 internal error · 2 usage
//
// Five rules. A script rather than a prompt because the same folder must route the same way
// every time, and the model must not be able to talk itself past a gate. The orchestrator
// may append to modelAddedRiskFlags; it never edits anything else.
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate-schema.js');
const ws = require('./lib-workspace.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const jobPath = ws.positionals(args)[0];
if (!jobPath) { console.error('usage: route-job.js <job.json> [--out <route.json>] [--config <CONFIG.md>] [--human]'); process.exit(2); }
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const outPath = opt('--out', path.join(path.dirname(jobPath), 'route.json'));
const cfgPath = opt('--config', path.join(ROOT, 'CONFIG.md'));

function readConfig(file) {
  const cfg = {};
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return cfg; }
  const m = txt.match(/```yaml\r?\n([\s\S]*?)```/);
  if (!m) return cfg;
  for (const raw of m[1].split(/\r?\n/)) {
    if (/^\s/.test(raw)) continue;
    const line = raw.replace(/#.*$/, '').trimEnd();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === '') continue;
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    else if (v === 'true') v = true;
    else if (v === 'false') v = false;
    else if (!isNaN(Number(v))) v = Number(v);
    cfg[k] = v;
  }
  return cfg;
}

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let job, agentsReg, workflowsReg;
try {
  job = readJson(jobPath);
  agentsReg = readJson(path.join(ROOT, 'registry', 'agents.json'));
  workflowsReg = readJson(path.join(ROOT, 'registry', 'workflows.json'));
} catch (e) { console.error('cannot read inputs: ' + e.message); process.exit(1); }
const loadSchema = name => { try { return readJson(path.join(ROOT, 'schemas', name)); } catch (e) { console.error('note: schemas/' + name + ' could not be read (' + e.message + ')'); return null; } };
const schema = loadSchema('job.schema.json');
const routeSchema = loadSchema('route.schema.json');
const cfg = readConfig(cfgPath);
const threshold = typeof cfg.route_confidence_threshold === 'number' ? cfg.route_confidence_threshold : 0.8;

const client = job.client || job.brand || null;
const R = {
  schemaVersion: '1.0', jobId: job.jobId || null, client, status: null,
  workflowId: null, workflowVersion: null, requiredDisciplines: [], owner: null, support: [],
  riskFlags: [], modelAddedRiskFlags: [], gates: [], tags: [],
  confidence: 1, missingFields: [], unsupported: [], blockers: [], rationale: [],
  createdAt: new Date().toISOString(),
};
const say = s => R.rationale.push(s);
const missing = f => { if (!R.missingFields.includes(f)) R.missingFields.push(f); };
const tag = t => { if (!R.tags.includes(t)) R.tags.push(t); };
const risk = t => { if (!R.riskFlags.includes(t)) R.riskFlags.push(t); };

// Rule 1: schema validity, and the XX declarations named plainly. A null aspect ratio or
// duration is an unanswered question, not a value.
// The release hash is the router's to compute (Rule 3), so a null here is not a missing field.
const forSchema = Object.assign({}, job); if (forSchema.prePipelineReleaseHash == null) delete forSchema.prePipelineReleaseHash;
if (schema) {
  for (const e of validate(schema, forSchema)) {
    const field = e.path.replace(/^\$\.?/, '');
    if (e.keyword === 'required') missing(field); else missing(field + ' (' + e.message + ')');
  }
}
for (const f of ['jobId', 'client', 'title', 'kind']) if (!job[f] && !(f === 'client' && job.brand)) missing(f);
const RATIOS = ['16:9', '9:16', '1:1', '4:5', '2.39:1'];
if (!RATIOS.includes(job.aspectRatio)) missing('aspectRatio (one of ' + RATIOS.join(', ') + ')');
if (!Number.isInteger(job.deliverableDurationSec) || job.deliverableDurationSec < 5 || job.deliverableDurationSec > 900) missing('deliverableDurationSec (5 to 900)');
if (typeof job.audioLed !== 'boolean') missing('audioLed (true when the voice-over leads the cut)');
if (!job.driveFolder) missing('driveFolder (the shoot folder with footage/)');
if (!job.prePipelineReleaseFolder) missing('prePipelineReleaseFolder (the pre-prod release package)');
if (R.missingFields.length) say('Rule 1: missing or invalid fields: ' + R.missingFields.join(', ')); else say('Rule 1: job.json is complete');

// Rule 2: the kind must have a workflow.
const wf = workflowsReg.workflows.find(w => (w.kinds || []).includes(job.kind));
if (!wf) { R.unsupported.push('kind:' + (job.kind || '?') + ' has no workflow'); say('Rule 2: no workflow for kind ' + job.kind); }
else { R.workflowId = wf.workflowId || wf.id; R.workflowVersion = wf.version || '1.0'; say('Rule 2: kind ' + job.kind + ' routes to ' + R.workflowId); }

// Rule 3: the pre-prod release and the footage must be on disk. A project with nothing to
// cut would spend the whole intake finding that out.
const jobDir = path.dirname(path.resolve(jobPath));
const resolveDir = p => (p ? (path.isAbsolute(p) ? p : path.resolve(jobDir, p)) : null);
const REQUIRED_RELEASE = ['script.md', 'storyboard.json', 'concept-breakdown.xlsx'];
const rel = resolveDir(job.prePipelineReleaseFolder);
if (rel) {
  if (!fs.existsSync(rel) || !fs.statSync(rel).isDirectory()) { R.blockers.push('the pre-prod release folder (' + ws.fwd(rel) + ' is not there)'); say('Rule 3: release folder missing'); }
  else {
    const absent = REQUIRED_RELEASE.filter(f => !fs.existsSync(path.join(rel, f)));
    let names = []; try { names = fs.readdirSync(rel); } catch { names = []; }
    if (!names.some(n => /^call-sheet-day-.*\.(pdf|xlsx)$/i.test(n))) absent.push('call-sheet-day-*.pdf or .xlsx');
    let panels = 0;
    try { for (const v of fs.readdirSync(path.join(rel, 'storyboard')).filter(n => /^v\d+$/.test(n))) panels += fs.readdirSync(path.join(rel, 'storyboard', v)).filter(n => /^P\d+.*\.(png|jpe?g|webp)$/i.test(n)).length; } catch { panels = 0; }
    if (!panels) absent.push('storyboard/v{n}/P*.png');
    if (absent.length) { R.blockers.push('the pre-prod release is incomplete: ' + absent.join(', ')); say('Rule 3: release lacks ' + absent.join(', ')); }
    else {
      say('Rule 3: the pre-prod release is complete (' + panels + ' panels)');
      // Bind the release: sha256 over the sorted 'path:sha256' lines of every required file.
      const crypto = require('crypto');
      const lines = [];
      const walkPanels = d => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walkPanels(f); else if (/^P\d+.*\.(png|jpe?g|webp)$/i.test(e.name)) lines.push(path.relative(rel, f).split(path.sep).join('/') + ':' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')); } } catch { /* none */ } };
      for (const f of REQUIRED_RELEASE.concat(names.filter(n => /^call-sheet-day-.*\.(pdf|xlsx)$/i.test(n)))) lines.push(f + ':' + crypto.createHash('sha256').update(fs.readFileSync(path.join(rel, f))).digest('hex'));
      walkPanels(path.join(rel, 'storyboard'));
      const releaseHash = crypto.createHash('sha256').update(lines.sort().join('\n')).digest('hex');
      if (job.prePipelineReleaseHash !== releaseHash) {
        job.prePipelineReleaseHash = releaseHash;
        try { fs.writeFileSync(jobPath, JSON.stringify(job, null, 2) + '\n'); say('Rule 3: release hash ' + releaseHash.slice(0, 12) + ' bound into job.json'); }
        catch (e) { say('Rule 3: release hash computed but job.json could not be written: ' + e.message); }
      } else say('Rule 3: release hash ' + releaseHash.slice(0, 12) + ' unchanged');
    }
  }
}
const MEDIA = /\.(mov|mp4|mxf|braw|r3d|mts|m4v|avi|mkv)$/i;
const AUDIO = /\.(wav|aif|aiff|mp3|flac|m4a)$/i;
function count(dir, re, depth = 0) {
  let n = 0;
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory() && depth < 4) n += count(path.join(dir, e.name), re, depth + 1); else if (e.isFile() && re.test(e.name)) n++; } } catch { /* absent */ }
  return n;
}
const drive = resolveDir(job.driveFolder);
if (drive) {
  const clips = count(path.join(drive, 'footage'), MEDIA);
  if (!clips) { R.blockers.push('the shoot footage (no clips under ' + ws.fwd(path.join(drive, 'footage')) + ')'); say('Rule 3: no footage'); }
  else say('Rule 3: ' + clips + ' clip' + (clips === 1 ? '' : 's') + ' under footage/');
  if (clips && !count(path.join(drive, 'proxies'), MEDIA)) risk('no_proxies');
  const vo = count(path.join(drive, 'audio', 'vo'), AUDIO);
  const anyAudio = count(path.join(drive, 'audio'), AUDIO);
  if (!vo) { tag('no_vo'); risk('no_vo'); say('Rule 3: no VO takes under audio/vo; the cut is picture-only unless VO arrives'); }
  if (!anyAudio) risk('no_audio_files');
}

// Rule 4: tags the planner and the directors read.
if (job.audioLed === true) tag('audio_led'); else if (job.audioLed === false) tag('picture_led');
if (job.referenceCutPath) tag('has_reference_cut');
if (job.colourDirection) tag('has_colour_direction');
if (['9:16', '4:5'].includes(job.aspectRatio)) tag('vertical');
if (Number.isInteger(job.deliverableDurationSec) && job.deliverableDurationSec > 180) risk('long_deliverable');
say('Rule 4: tags ' + (R.tags.join(', ') || 'none'));

// Rule 5: owner, support, gates. The orchestrator owns; every director supports, in registry order.
const agents = agentsReg.agents || [];
const ownerA = agents.find(a => a.id === 'orchestrator');
if (ownerA) R.owner = ownerA.id; else { R.unsupported.push('no orchestrator in the registry'); say('Rule 5: no owner'); }
R.support = agents.filter(a => a.id !== 'orchestrator').map(a => a.id);
R.requiredDisciplines = ['orchestration', 'intake', 'ingest', 'sequence', 'bgm', 'audio', 'review', 'broll', 'mograph', 'package'];
if (wf) R.gates = [...(wf.gates || [])];
say('Rule 5: owner ' + (R.owner || 'none') + '; support ' + (R.support.join(', ') || 'none') + '; gates ' + (R.gates.join(', ') || 'none'));

R.confidence = Math.max(0, Math.round((1 - 0.15 * R.missingFields.length) * 100) / 100);
if (R.confidence < threshold) risk('ambiguous_request');
if (R.unsupported.length) R.status = 'UNSUPPORTED';
else if (R.blockers.length) R.status = 'BLOCKED';
else if (R.missingFields.length || R.confidence < threshold) R.status = 'NEEDS_CLARIFICATION';
else R.status = 'ROUTED';
say('Status: ' + R.status);

if (routeSchema) {
  const selfErrs = validate(routeSchema, R);
  if (selfErrs.length) { console.error('internal error: route.json fails its own schema: ' + selfErrs.map(e => e.path + ' ' + e.message).join('; ')); process.exit(1); }
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(R, null, 2) + '\n');

if (args.includes('--human')) {
  if (R.status === 'ROUTED') console.log('I can run this. Two gates along the way are yours: the picture and audio lock, and the release.');
  else if (R.status === 'BLOCKED') console.log('I need ' + R.blockers.join(', and ') + ' before I can start.');
  else if (R.status === 'NEEDS_CLARIFICATION') console.log('I need a bit more before I start: ' + R.missingFields.join(', ') + '.');
  else console.log('I cannot run this: ' + R.unsupported.join('; ') + '.');
}
console.log(R.status + ': ' + (R.workflowId || '-') + ' · owner ' + (R.owner || '-') + ' · support [' + R.support.join(', ') + '] · gates [' + R.gates.join(', ') + '] · tags [' + R.tags.join(', ') + ']');
if (R.blockers.length) console.log('I need ' + R.blockers.join(', and ') + ' before I can start.');
if (R.missingFields.length) console.log('missing: ' + R.missingFields.join(', '));
if (R.unsupported.length) console.log('unsupported: ' + R.unsupported.join('; '));
console.log('wrote ' + ws.fwd(outPath));

const { advance } = require('./lib-advance.js');
if (R.status === 'ROUTED') advance(path.dirname(jobPath), 'PLANNED', { by: 'router', note: 'Routed to ' + R.workflowId + '.' });
else if (R.status === 'BLOCKED') advance(path.dirname(jobPath), 'BLOCKED', { by: 'router', note: 'Waiting for ' + R.blockers.join(', and ') + '.' });
process.exit(R.status === 'ROUTED' ? 0 : (R.status === 'UNSUPPORTED' ? 4 : 3));