#!/usr/bin/env node
// Sync VO and the chosen BGM against the picture cut with ffmpeg: VO placed per vo-track.json,
// BGM trimmed to picture and ducked under the VO, output 48 kHz stereo, plus a three-lane
// waveform (VO, BGM, mix). Refuses without a signed bgm-choice.json.
//
//   node audio-sync.js <client> <job-id> [--duck-db -12]
//
// Exit 0 synced · 1 fault (ffmpeg error verbatim) · 2 usage · 3 refused (no signed choice)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');
const { validate } = require('./validate-schema.js');

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const { client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: audio-sync.js <client> <job-id> [--duck-db -12]'); process.exit(2); }
const duckDb = Number(opt('--duck-db') || -12);
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const choicePath = path.join(dir, 'bgm-choice.json');
if (!fs.existsSync(choicePath)) { console.error('No bgm-choice.json: the music has not been chosen on the board. The sync does not start without it.'); process.exit(3); }
const choice = JSON.parse(fs.readFileSync(choicePath, 'utf8'));
if (!choice.signedBy || !choice.signedAt) { console.error('bgm-choice.json is unsigned; the pick must come from the board.'); process.exit(3); }
if (!fs.existsSync(choice.file)) { console.error('BGM file not on disk: ' + choice.file); process.exit(3); }
const edl = read('rough-edl.json'); const vo = read('vo-track.json'); const manifest = read('manifest.json');
const T = Math.round(edl.cuts.reduce((s, c) => s + (c.outSec - c.inSec), 0) * 1000) / 1000;
const fps = edl.fps || 25;
const audioDir = path.join(dir, 'bundle', 'audio'); board.ensureDir(audioDir);
const wav = path.join(audioDir, 'synced-track.wav'); const png = path.join(audioDir, 'waveform.png');
const run = (args, what) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status !== 0) { console.error(what + ' failed:\n' + (r.stderr || r.error)); process.exit(1); } };
// Inputs: every VO line as its own input, delayed to its start; the BGM last.
const inputs = []; const parts = []; const voLabels = [];
vo.lines.forEach((l, i) => { inputs.push('-i', l.path); const ms = Math.round(l.startSec * 1000); parts.push('[' + i + ':a]aformat=channel_layouts=stereo:sample_rates=48000,adelay=' + ms + '|' + ms + '[v' + i + ']'); voLabels.push('[v' + i + ']'); });
const b = vo.lines.length; inputs.push('-i', choice.file);
const voMix = voLabels.length > 1 ? voLabels.join('') + 'amix=inputs=' + voLabels.length + ':normalize=0[vo]' : (voLabels.length === 1 ? voLabels[0] + 'anull[vo]' : 'anullsrc=r=48000:cl=stereo[vo]');
parts.push(voMix);
parts.push('[vo]asplit=2[voa][vob]');
parts.push('[' + b + ':a]aformat=channel_layouts=stereo:sample_rates=48000,atrim=0:' + T + ',asetpts=PTS-STARTPTS[bgm]');
// Duck: the compressor listens to the VO and pulls the BGM down by about duckDb while the voice speaks.
const ratio = Math.max(2, Math.round(Math.pow(10, Math.abs(duckDb) / 20)));
parts.push('[bgm][voa]sidechaincompress=threshold=0.03:ratio=' + ratio + ':attack=20:release=400:makeup=1[duck]');
parts.push('[duck][vob]amix=inputs=2:duration=first:normalize=0[out]');
run([...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-ac', '2', '-ar', '48000', '-t', String(T), '-c:a', 'pcm_s24le', wav], 'ffmpeg mix');
// Waveform: three lanes, VO / BGM / mix, same time base as the WAV.
const wp = []; vo.lines.forEach((l, i) => { const ms = Math.round(l.startSec * 1000); wp.push('[' + i + ':a]aformat=channel_layouts=stereo:sample_rates=48000,adelay=' + ms + '|' + ms + ',apad,atrim=0:' + T + '[w' + i + ']'); });
wp.push((voLabels.length ? voLabels.map((_, i) => '[w' + i + ']').join('') + (voLabels.length > 1 ? 'amix=inputs=' + voLabels.length + ':normalize=0,' : '') : 'anullsrc=r=48000:cl=stereo,atrim=0:' + T + ',') + 'showwavespic=s=1200x140:scale=log:colors=0xE8B84A[l1]');
wp.push('[' + b + ':a]atrim=0:' + T + ',asetpts=PTS-STARTPTS,showwavespic=s=1200x140:scale=log:colors=0x6FA8DC[l2]');
wp.push('[' + (b + 1) + ':a]showwavespic=s=1200x140:scale=log:colors=0xDDDDDD[l3]');
wp.push('[l1][l2][l3]vstack=inputs=3[wave]');
run([...inputs, '-i', wav, '-filter_complex', wp.join(';'), '-map', '[wave]', '-frames:v', '1', png], 'ffmpeg waveform');
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,channels:format=duration', '-of', 'json', wav], { encoding: 'utf8' });
const info = JSON.parse(probe.stdout || '{}'); const st = (info.streams || [])[0] || {}; const wavSec = Number((info.format || {}).duration || 0);
const warnings = [];
if (Math.abs(wavSec - T) > 1 / fps) warnings.push('WAV is ' + wavSec.toFixed(3) + ' s against ' + T + ' s of picture (more than one frame off).');
for (const l of vo.lines) if (l.endSec > T + 1 / fps) warnings.push(l.scriptMarker + ' runs to ' + l.endSec + ' s; the mix stops at picture (' + T + ' s), so the tail of the take is cut. Trim the cut or the read.');
const out = {
  schemaVersion: '1.0', jobId, version: 1,
  picture: { edlPath: 'rough-edl.json', edlSha256: board.sha256File(path.join(dir, 'rough-edl.json')), totalDurationSec: T, fps },
  vo: vo.lines.map(l => ({ clipSha256: l.clipSha256, startSec: l.startSec, endSec: l.endSec, scriptMarker: l.scriptMarker })),
  bgm: { choiceId: choice.candidateId, choicePath: choice.file, startSec: 0, duckDb, sha256: (manifest.audio.find(a => a.path === choice.file) || {}).sha256 || null },
  sfx: [],
  output: { wavPath: 'bundle/audio/synced-track.wav', wavSha256: board.sha256File(wav), waveformPngPath: 'bundle/audio/waveform.png', sampleRateHz: Number(st.sample_rate), channels: st.channels, durationSec: wavSec },
  warnings, generatedAt: new Date().toISOString(),
};
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'sync.schema.json'), 'utf8'));
const errs = validate(schema, out); if (errs.length) { console.error('synced-track fails schema: ' + errs.map(e => e.path + ' ' + e.message).join('; ')); process.exit(1); }
const p = path.join(dir, 'synced-track.json'); fs.writeFileSync(p + '.tmp', JSON.stringify(out, null, 2) + '\n'); fs.renameSync(p + '.tmp', p);
console.log('synced-track.wav: ' + wavSec.toFixed(2) + ' s, ' + st.sample_rate + ' Hz, ' + st.channels + ' ch; VO ' + vo.lines.length + ' line(s), BGM ' + choice.title + ' ducked ' + duckDb + ' dB; waveform.png written.' + (warnings.length ? '\n  warning: ' + warnings.join('\n  warning: ') : ''));