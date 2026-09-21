#!/usr/bin/env node
// Place the VO takes against the script markers. Alignment is metadata only: no WAV is edited.
//
//   node vo-drop-in.js <client> <job-id>
//
// Markers are the lines of the pre-prod script.md that carry VO: "..." in order. With no local
// transcriber the takes map to markers by ordered index. One take against several markers is
// read as one continuous take and placed once, with a warning; every other shortfall parks the
// unmatched markers for the person. Exit 0 placed · 1 fault · 2 usage · 3 nothing to place
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');

const argv = process.argv.slice(2);
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: vo-drop-in.js <client> <job-id>'); process.exit(2); }
const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const edl = JSON.parse(fs.readFileSync(path.join(dir, 'rough-edl.json'), 'utf8'));
const scriptPath = path.join(job.prePipelineReleaseFolder, 'script.md');
const scriptText = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';
const markers = [];
scriptText.split(/\r?\n/).forEach((line, i) => {
  const m = line.match(/VO:\s*"([^"]+)"/i) || line.match(/VO:\s*(.+)$/i);
  if (m) markers.push({ id: 'M' + (markers.length + 1), line: i + 1, text: m[1].trim(), scene: (line.match(/Scene\s+(\d+)/i) || [])[1] || null });
});
const takes = (manifest.audio || []).filter(a => a.kind === 'vo');
if (!takes.length) { console.error('No VO take under audio/vo in the manifest; nothing to place. Mark VO not applicable on the board or add the takes.'); process.exit(3); }
// Timeline position of each cut, in order.
let t = 0; const cutStarts = edl.cuts.map(c => { const s = t; t += c.outSec - c.inSec; return { panelId: c.panelId, startSec: s, endSec: t, scene: (c.panelId.match(/\d+/) || [])[0] }; });
const pictureSec = Math.round(t * 1000) / 1000;
const warnings = []; const lines = []; const unmatched = [];
const startFor = idx => { const cut = cutStarts[Math.min(idx, cutStarts.length - 1)] || { startSec: 0 }; return cut.startSec; };
if (takes.length === 1 && markers.length > 1) {
  const take = takes[0];
  lines.push({ scriptMarker: markers.map(m => m.id).join('+'), markerText: markers.map(m => m.text).join(' / '), clipSha256: take.sha256, path: take.path, startSec: startFor(0), endSec: Math.round((startFor(0) + take.durationSec) * 1000) / 1000, matchedBy: 'single-take-continuous', confidence: null });
  warnings.push('One take (' + path.basename(take.path) + ') against ' + markers.length + ' script markers: placed as one continuous read from the first cut. Split takes or confirm the read on the board.');
} else {
  markers.forEach((m, i) => {
    const take = takes[i];
    if (!take) { unmatched.push({ scriptMarker: m.id, text: m.text, reason: 'no take for this marker' }); return; }
    lines.push({ scriptMarker: m.id, markerText: m.text, clipSha256: take.sha256, path: take.path, startSec: startFor(i), endSec: Math.round((startFor(i) + take.durationSec) * 1000) / 1000, matchedBy: 'ordered-index', confidence: null });
  });
  if (takes.length > markers.length) warnings.push((takes.length - markers.length) + ' take(s) beyond the script markers were not placed.');
}
for (const l of lines) if (l.endSec > pictureSec + 1 / (edl.fps || 25)) warnings.push(l.scriptMarker + ' ends at ' + l.endSec + ' s, past the picture (' + pictureSec + ' s); the sync trims the mix to picture and the review flags it.');
const out = { schemaVersion: '1.0', jobId, version: 1, generatedAt: new Date().toISOString(), scriptPath: scriptPath.replace(/\\/g, '/'), transcriber: 'none', pictureDurationSec: pictureSec, markers, lines, unmatched, warnings };
const p = path.join(dir, 'vo-track.json'); fs.writeFileSync(p + '.tmp', JSON.stringify(out, null, 2) + '\n'); fs.renameSync(p + '.tmp', p);
console.log('vo-track.json: ' + lines.length + ' line(s) placed, ' + unmatched.length + ' unmatched, ' + markers.length + ' marker(s) in script.md.' + (warnings.length ? '\n  warning: ' + warnings.join('\n  warning: ') : ''));
if (unmatched.length) { console.error('Unmatched markers wait on the person: ' + unmatched.map(u => u.scriptMarker).join(', ')); process.exit(3); }