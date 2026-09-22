// Function-hook guards. Off unless CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 and hooks.json
// declares a "modules" entry. Every guard refuses the tool call itself.
//
// Six refusing guards:
//  1. B-roll generation without a matching broll-requests/{n}.json signed by a human
//  2. Sync stage start without a signed bgm-choice.json
//  3. Any spend past credit_ceiling_per_job in CONFIG.md
//  4. Any spend without a matching yes on record
//  5. manifest.json written by anything but ingest-footage
//  6. Delivery export in any format but FCPXML

import fs from 'node:fs';
import path from 'node:path';

const CEILING_DEFAULT = 120;

export function readCeiling(pluginRoot) {
  try {
    const cfg = fs.readFileSync(path.join(pluginRoot, 'CONFIG.md'), 'utf8');
    const m = cfg.match(/credit_ceiling_per_job:\s*(\d+)/);
    if (m) return parseInt(m[1], 10);
  } catch {}
  return CEILING_DEFAULT;
}

export function refuseBrollWithoutRequest({ command, cwd }) {
  if (!/render_broll_variant|create_video_job/.test(command)) return null;
  const jobDir = cwd;
  // A generated job (footageSource "generated") carries its yes in generation-brief.json:
  // sample first, then batch, each approved on the board and recorded by generate-clips.js.
  const briefPath = path.join(jobDir, 'generation-brief.json');
  if (fs.existsSync(briefPath)) {
    try {
      const b = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
      const pending = (b.panels || []).filter(p => p.status !== 'delivered');
      const scope = (b.panels || []).some(p => p.status === 'delivered') ? 'batch' : 'sample';
      const ap = (b.approvals || {})[scope];
      if (!pending.length) return 'Generation refused: every panel already has a clip.';
      if (!ap || !ap.by || !ap.at) return 'Generation refused: no ' + scope + ' approval on record from the board.';
      return null;
    } catch { return 'Generation refused: generation-brief.json is unreadable.'; }
  }
  const requestsDir = path.join(jobDir, 'broll-requests');
  if (!fs.existsSync(requestsDir)) return 'B-roll generation refused: no broll-requests folder on disk.';
  const requests = fs.readdirSync(requestsDir).filter(f => f.endsWith('.json'));
  const openReqs = requests.filter(f => {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(requestsDir, f), 'utf8'));
      return r.status !== 'delivered' && r.signedBy;
    } catch { return false; }
  });
  if (!openReqs.length) return 'B-roll generation refused: no signed open request.';
  return null;
}

export function refuseSyncWithoutBgmChoice({ command, cwd }) {
  if (!/audio-sync|sync_audio_track/.test(command)) return null;
  const choice = path.join(cwd, 'bgm-choice.json');
  if (!fs.existsSync(choice)) return 'Sync refused: bgm-choice.json missing.';
  try {
    const c = JSON.parse(fs.readFileSync(choice, 'utf8'));
    if (!c.signedBy || !c.signedAt) return 'Sync refused: bgm-choice.json is unsigned.';
  } catch {
    return 'Sync refused: bgm-choice.json unreadable.';
  }
  return null;
}

export function refuseOverCeiling({ command, cwd, pluginRoot }) {
  if (!/create_(image|video)_job/.test(command)) return null;
  const ceiling = readCeiling(pluginRoot);
  const spentPath = path.join(cwd, 'status.md');
  if (!fs.existsSync(spentPath)) return null;
  const spent = (fs.readFileSync(spentPath, 'utf8').match(/credits_spent:\s*(\d+)/) || [])[1];
  if (spent && parseInt(spent, 10) >= ceiling) return `Spend refused: ceiling ${ceiling} reached.`;
  return null;
}

export function refuseManifestWrite({ command, filePath }) {
  if (!filePath) return null;
  const isManifest = /(^|\/)manifest\.json$/.test(filePath.replace(/\\/g, '/'));
  if (!isManifest) return null;
  const bySkill = /ingest-footage/.test(command);
  if (!bySkill) return 'manifest.json write refused: only ingest-footage writes this file.';
  return null;
}

export function refuseNonFcpxmlExport({ command }) {
  if (!/export.*(aaf|omf|edl-primary)/i.test(command)) return null;
  return 'Export refused: FCPXML is the primary delivery format. EDL is available as a fallback but not primary.';
}

export const guards = [
  refuseBrollWithoutRequest,
  refuseSyncWithoutBgmChoice,
  refuseOverCeiling,
  refuseManifestWrite,
  refuseNonFcpxmlExport,
];

export function runAll(ctx) {
  for (const g of guards) {
    const msg = g(ctx);
    if (msg) return { refused: true, message: msg };
  }
  return { refused: false };
}
