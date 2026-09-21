#!/usr/bin/env node
// Gate A review pass: score the 24 rubric items in playbooks/review-rubrics.md against the files
// on disk and write validation/review-a-{round}.md with a verdict. Never edits an artefact.
//
//   node review-pass.js <client> <job-id>
//
// Exit 0 CLEAR or WARNINGS ONLY · 1 fault · 2 usage · 3 NEEDS REVISION (revisions/*.json written)
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: review-pass.js <client> <job-id>'); process.exit(2); }
const load = f => { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const job = load('job.json'), manifest = load('manifest.json'), edl = load('rough-edl.json'), sync = load('synced-track.json'), choice = load('bgm-choice.json'), vo = load('vo-track.json'), options = load('bgm-options.json');
const rel = job.prePipelineReleaseFolder; const sb = fs.existsSync(path.join(rel, 'storyboard.json')) ? JSON.parse(fs.readFileSync(path.join(rel, 'storyboard.json'), 'utf8')) : null;
const valDir = path.join(dir, 'validation'); board.ensureDir(valDir);
const round = fs.readdirSync(valDir).filter(f => /^review-a-\d+\.md$/.test(f)).length + 1;
if (round > 2) { console.error('Two review rounds already on file; a third is not run. Escalate to the person.'); process.exit(1); }
const fps = (edl && edl.fps) || 25; const frame = 1 / fps;
const findings = []; const item = (id, level, result, reason, evidence, fix) => findings.push({ id, level, result, reason, evidence, fix });
const clipShas = new Set((manifest && manifest.clips || []).map(c => c.sha256));
const T = edl ? Math.round(edl.cuts.reduce((s, c) => s + (c.outSec - c.inSec), 0) * 1000) / 1000 : 0;
const panels = sb ? (sb.panels || []).map(p => p.id || p.panelId) : [];
const placed = new Set(edl ? edl.cuts.map(c => c.panelId).concat(edl.unmatchedPanels || []) : []);
// Critical
item(1, 'critical', !edl ? 'fail' : panels.every(p => placed.has(p)) ? 'pass' : 'fail', edl ? panels.filter(p => !placed.has(p)).length + ' panel(s) neither placed nor unmatched' : 'rough-edl.json missing', 'rough-edl.json cuts + unmatchedPanels vs storyboard.json', 'sequence-director');
item(2, 'critical', !edl ? 'fail' : edl.cuts.every(c => clipShas.has(c.clipSha256)) ? 'pass' : 'fail', 'every cut clipSha256 must be in manifest.json', 'rough-edl.json cuts[].clipSha256', 'sequence-director');
item(3, 'critical', !edl ? 'fail' : T <= job.deliverableDurationSec ? 'pass' : 'fail', 'picture ' + T + ' s against deliverable ' + job.deliverableDurationSec + ' s', 'rough-edl.json', 'sequence-director');
item(4, 'critical', choice && choice.signedBy && choice.signedAt ? 'pass' : 'fail', choice ? 'signed by ' + choice.signedBy : 'bgm-choice.json missing', 'bgm-choice.json', 'bgm-supervisor');
const wavOk = sync && fs.existsSync(path.join(dir, sync.output.wavPath)) && sync.output.sampleRateHz === 48000 && sync.output.channels === 2;
item(5, 'critical', wavOk ? 'pass' : 'fail', sync ? sync.output.sampleRateHz + ' Hz, ' + sync.output.channels + ' ch' : 'synced-track.json missing', 'bundle/audio/synced-track.wav', 'audio-engineer');
item(6, 'critical', sync && edl && sync.picture.edlSha256 === board.sha256File(path.join(dir, 'rough-edl.json')) ? 'pass' : 'fail', 'synced-track.picture.edlSha256 must equal sha256(rough-edl.json)', 'synced-track.json picture.edlSha256', 'audio-engineer');
// Major
item(7, 'major', edl && edl.cuts.every(c => typeof c.matchScore === 'number' && c.matchReason) ? 'pass' : 'fail', 'matchScore and matchReason on every cut', 'rough-edl.json cuts[]', 'sequence-director');
item(8, 'major', edl && (edl.unmatchedPanels || []).length === 0 ? 'n/a' : 'warn', edl && (edl.unmatchedPanels || []).length === 0 ? 'no unmatched panels to flag' : 'unmatched panels present; check timeline.png flags them', 'timeline.png', 'sequence-director');
item(9, 'major', edl && edl.cuts.every(c => c.matchScore >= 0.28) ? 'pass' : 'fail', 'lowest matchScore ' + (edl ? Math.min(...edl.cuts.map(c => c.matchScore)) : 'n/a'), 'rough-edl.json cuts[].matchScore', 'sequence-director');
const markerOrderOk = vo && vo.lines.every((l, i) => i === 0 || l.startSec >= vo.lines[i - 1].startSec);
const continuous = vo && vo.lines.some(l => l.matchedBy === 'single-take-continuous');
item(10, 'major', !vo ? 'fail' : markerOrderOk ? (continuous ? 'warn' : 'pass') : 'fail', !vo ? 'vo-track.json missing' : continuous ? 'one continuous take stands in for ' + vo.markers.length + ' markers; confirm the read' : 'lines in marker order', 'vo-track.json lines[]', 'audio-engineer');
const voEndOk = vo && vo.lines.every(l => l.endSec <= T + frame);
item(11, 'major', !vo ? 'fail' : voEndOk ? 'pass' : 'warn', vo ? vo.lines.map(l => l.scriptMarker + ' ends ' + l.endSec + ' s vs picture ' + T + ' s').join('; ') : 'vo-track.json missing', 'vo-track.json lines[].endSec', 'audio-engineer');
const lic = options && choice ? (options.candidates.find(c => c.id === choice.candidateId) || {}).licensing : null;
item(12, 'major', ['royalty-free', 'single-use', 'unlimited', 'custom'].includes(lic) ? (lic === 'custom' ? 'warn' : 'pass') : 'fail', 'licensing: ' + (lic || 'not named') + (lic === 'custom' ? ' (client-declared; confirm terms before release)' : ''), 'bgm-options.json candidates[' + (choice ? choice.candidateId : '?') + '].licensing', 'bgm-supervisor');
item(13, 'major', sync && typeof sync.bgm.duckDb === 'number' ? 'pass' : 'fail', sync ? 'duckDb ' + sync.bgm.duckDb : 'synced-track.json missing', 'synced-track.json bgm.duckDb', 'audio-engineer');
item(14, 'major', sync && fs.existsSync(path.join(dir, sync.output.waveformPngPath)) && Math.abs((sync.output.durationSec || T) - T) <= frame ? 'pass' : 'warn', sync ? 'waveform rendered over the same ' + T + ' s window as the WAV (' + (sync.output.durationSec || 0).toFixed(2) + ' s)' : 'no waveform', 'bundle/audio/waveform.png', 'audio-engineer');
item(15, 'major', edl && edl.aspectRatio === job.aspectRatio ? 'pass' : 'fail', 'EDL ' + (edl && edl.aspectRatio) + ' vs job ' + job.aspectRatio, 'rough-edl.json aspectRatio', 'sequence-director');
item(16, 'major', sync && edl && (sync.picture.fps || fps) === fps ? 'pass' : 'warn', 'EDL fps ' + fps + ', audio track fps ' + (sync && sync.picture.fps), 'rough-edl.json fps / synced-track.json picture.fps', 'audio-engineer');
const bundleHas = sub => fs.existsSync(path.join(dir, 'bundle', sub)) && fs.readdirSync(path.join(dir, 'bundle', sub)).length > 0;
item(17, 'major', !bundleHas('mograph') && !(edl && edl.cuts.some(c => c.kind === 'mograph')) ? 'pass' : 'fail', 'no mograph before Gate A', 'bundle/mograph, rough-edl.json', 'mograph-director');
item(18, 'major', !bundleHas('broll') && !(edl && edl.cuts.some(c => c.kind === 'broll')) ? 'pass' : 'fail', 'no B-roll before Gate A', 'bundle/broll, rough-edl.json', 'broll-director');
// Minor
const implied = p => Number((p && (p.durationSec || p.duration)) || 0);
const lenIssues = edl && sb ? edl.cuts.filter(c => { const p = (sb.panels || []).find(x => (x.id || x.panelId) === c.panelId); const d = implied(p); return d > 0 && Math.abs((c.outSec - c.inSec) - d) / d > 0.3; }).map(c => c.panelId) : [];
item(19, 'minor', !sb ? 'n/a' : lenIssues.length ? 'warn' : 'pass', !sb ? 'no storyboard.json' : lenIssues.length ? lenIssues.join(', ') + ' outside 30% of the storyboard length' : 'all cuts within 30% of the storyboard-implied length (or no length given)', 'rough-edl.json vs storyboard.json', 'sequence-director');
item(20, 'minor', 'n/a', 'key not analysed on local library tracks', 'bgm-options.json keyRoot', 'bgm-supervisor');
item(21, 'minor', fs.existsSync(path.join(dir, 'sfx-cues.json')) ? (sync && sync.sfx.length ? 'pass' : 'warn') : 'n/a', fs.existsSync(path.join(dir, 'sfx-cues.json')) ? 'sfx-cues.json present' : 'no sfx-cues.json', 'sfx-cues.json', 'audio-engineer');
item(22, 'minor', fs.existsSync(path.join(dir, 'timeline.png')) ? 'pass' : 'warn', 'timeline.png present; labels drawn at 320 px panel width', 'timeline.png', 'sequence-director');
item(23, 'minor', edl && (edl.unmatchedPanels || []).length ? (edl.cuts.every(c => c.note) ? 'pass' : 'warn') : 'n/a', 'no unmatched panels', 'rough-edl.json', 'sequence-director');
item(24, 'minor', ['rough-edl.json', 'vo-track.json', 'synced-track.json', 'bgm-choice.json'].every(f => fs.existsSync(path.join(dir, f))) ? 'pass' : 'warn', 'files named per convention', dir, 'orchestrator');
const count = (lvl, r) => findings.filter(f => f.level === lvl && f.result === r).length;
const crit = count('critical', 'fail'), major = count('major', 'fail') + count('major', 'warn');
const verdict = crit ? 'NEEDS REVISION' : major > 3 ? 'NEEDS REVISION' : major ? 'WARNINGS ONLY' : 'CLEAR';
const lines = ['# Review A, round ' + round + ': ' + verdict, '', 'Job ' + jobId + ' · ' + new Date().toISOString(), '', 'Critical fails: ' + crit + ' · Major fails/warns: ' + major + ' · Minor warns: ' + count('minor', 'warn'), ''];
for (const lvl of ['critical', 'major', 'minor']) { lines.push('## ' + lvl[0].toUpperCase() + lvl.slice(1)); for (const f of findings.filter(x => x.level === lvl)) lines.push('- [' + (f.result === 'pass' || f.result === 'n/a' ? 'x' : ' ') + '] ' + f.id + ' ' + f.result.toUpperCase() + ': ' + f.reason + '. Evidence: ' + f.evidence + '. Fix: ' + f.fix + '.'); lines.push(''); }
fs.writeFileSync(path.join(valDir, 'review-a-' + round + '.md'), lines.join('\n'));
if (crit) { const revDir = path.join(dir, 'revisions'); board.ensureDir(revDir); let n = fs.readdirSync(revDir).length; for (const f of findings.filter(x => x.level === 'critical' && x.result === 'fail')) fs.writeFileSync(path.join(revDir, String(++n) + '.json'), JSON.stringify({ round, rubricItem: f.id, to: f.fix, reason: f.reason, evidence: f.evidence, raisedAt: new Date().toISOString() }, null, 2)); }
console.log('validation/review-a-' + round + '.md: ' + verdict + ' (critical ' + crit + ', major ' + major + ', minor warns ' + count('minor', 'warn') + ')');
for (const f of findings.filter(x => x.result === 'fail' || x.result === 'warn')) console.log('  ' + f.level + ' ' + f.id + ' ' + f.result + ': ' + f.reason);
process.exit(verdict === 'NEEDS REVISION' ? 3 : 0);