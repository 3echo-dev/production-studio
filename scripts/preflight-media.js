#!/usr/bin/env node
// Prove a generated asset can reach the workspace, before spending credits on any.
//
//   node preflight-media.js "<media-url>" [outdir] [--timeout <ms>]
//
// Pass a media URL from get_asset on any existing asset, in quotes: a signed URL carries its
// signature after an &. Generates nothing. Exits 0 only when a real image or video lands on disk.
//
// Exit 0 ok · 1 something came back and it is not media · 2 usage · 3 the host is not reachable.
const fs = require('fs');
const os = require('os');
const path = require('path');

const url = process.argv[2];
if (!url) { console.error('usage: preflight-media.js <media-url-from-get_asset> [outdir] [--timeout <ms>]'); process.exit(2); }
const flags = process.argv.slice(3);
const outdir = flags.find(a => !a.startsWith('--') && flags[flags.indexOf(a) - 1] !== '--timeout') || os.tmpdir();
const ti = flags.indexOf('--timeout');
const timeoutMs = ti >= 0 && Number(flags[ti + 1]) > 0 ? Number(flags[ti + 1]) : 45000;
const out = path.join(outdir, 'preflight-' + Date.now() + '.bin');

function blockedHost(why) {
  console.error('HTTP BLOCKED: the asset host is not reachable from this session.');
  console.error('  ' + why);
  console.error('  Do not generate. Allowlist the host, or resume this job in Claude Code where egress is not proxied.');
  process.exit(3);
}
const clean = () => { try { fs.unlinkSync(out); } catch { /* nothing was written */ } };

(async () => {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    blockedHost(e.name === 'TimeoutError' ? 'No answer within ' + Math.round(timeoutMs / 1000) + ' seconds.' : 'The connection failed: ' + (e.cause && e.cause.code ? e.cause.code : e.message) + '.');
  }
  if (res.status === 401 || res.status === 403) {
    let params = 0;
    try { params = Array.from(new URL(url).searchParams.keys()).length; } catch { params = 0; }
    console.error('BLOCKED: the host answered ' + res.status + ', so the URL is reachable but not authorised.');
    if (params <= 1) console.error('  The URL carries ' + (params ? 'one query parameter' : 'no query string') + '. A signed media URL carries several; run again with the whole URL in double quotes. If it still answers ' + res.status + ' the URL has expired: call get_asset again.');
    else console.error('  The signature is present, so the URL has expired. Call get_asset again for a fresh one before generating.');
    process.exit(1);
  }
  if (!res.ok) blockedHost('The host answered ' + res.status + ' ' + res.statusText + '.');
  let size = 0;
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const body = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(out, body);
    size = body.length;
  } catch (e) {
    clean();
    console.error('BLOCKED: the bytes arrived but could not be written to disk: ' + e.message);
    process.exit(1);
  }
  const head = size ? fs.readFileSync(out).subarray(0, 12) : Buffer.alloc(0);
  const isPNG = head.length > 3 && head[0] === 0x89 && head[1] === 0x50;
  const isJPEG = head.length > 2 && head[0] === 0xFF && head[1] === 0xD8;
  const isWEBP = head.length > 11 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
  const isMP4 = head.length > 11 && head.toString('ascii', 4, 8) === 'ftyp';
  clean();
  if (!size) { console.error('BLOCKED: the request returned nothing.'); process.exit(1); }
  if (!isPNG && !isJPEG && !isWEBP && !isMP4) {
    console.error(`BLOCKED: ${size} bytes came back but they are not an image or video. Usually an error page. Do not spend credits.`);
    process.exit(1);
  }
  const kind = isPNG ? 'PNG' : isJPEG ? 'JPEG' : isWEBP ? 'WebP' : 'MP4';
  console.log(`ok: round trip works. ${size} bytes, ${kind}. Safe to generate.`);
})();