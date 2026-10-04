#!/usr/bin/env node
// Render the board headless and screenshot its main states, without the claude.ai runtime.
// Needs Chrome and Node 22+ (global fetch and WebSocket); no packages.
//
//   node pre/scripts/dev/render-board.mjs [out-dir]
//
// Opens the SOURCE page as a file (so it runs the example board), walks home, each slate, one
// project, one agent chat and the pipeline banner, and writes PNGs to out-dir (default
// .tmp/render). Set CHROME to the browser path when it is not the Windows default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..', 'board', 'src', 'pre-production.html');
const out = path.resolve(process.argv[2] || '.tmp/render');
fs.mkdirSync(out, { recursive: true });
const page = 'file:///' + src.replace(/\\/g, '/');
const port = 9380;
const W = 1440, H = 1000;
const chromePath = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(out, '.chrome'), `--window-size=${W},${H}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const logs = [];
async function connect() {
  for (let i = 0; i < 40; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const t = list.find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); return; } } catch {}
    await sleep(250);
  }
  throw new Error('Chrome did not answer on port ' + port);
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) logs.push('EVAL ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result && r.result.value; };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64')); console.log('wrote', name + '.png'); };
const click = async (label, sel) => { const v = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'MISSING'; e.click(); return 'ok';})()`); if (v !== 'ok') console.log(label, v, sel); await sleep(500); };
const go = async h => { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(900); };

try {
  await connect();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails).slice(0, 600)); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + JSON.stringify(d.params.args).slice(0, 300)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: page + '#/' }); await sleep(2500);
  await shot('0-home');
  const kinds = await ev(`Object.keys(PIPES)`);
  for (const k of kinds) {
    await go('#/' + k); await shot(`1-slate-${k}`);
    await click('banner', 'details.model summary'); await ev(`document.querySelector('details.model').scrollIntoView()`); await sleep(200); await shot(`1b-pipeline-${k}`);
    const pid = await ev(`(()=>{const p=projects.find(p=>kindOf(p)===${JSON.stringify(k)}&&p.status!=='moved'); return p&&p.id;})()`);
    if (!pid) { console.log('no example project for', k); continue; }
    await go('#/p/' + pid); await shot(`2-project-${k}`);
    const seat = await ev(`SEATS.filter(s=>s.kind!=='human')[1].id`);
    await click('agent', `[data-agent="${seat}"]`); await shot(`3-chat-${k}`);
    await click('back', '[data-agent-close]');
  }
} finally {
  if (logs.length) console.log(logs.join('\n'));
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
