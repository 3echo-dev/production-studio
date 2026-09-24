#!/usr/bin/env python
"""sequence-first-cut: match storyboard panels to the best take with OpenMontage's CLIP embedder.

Usage:
    python sequence-first-cut.py <client> <job-id> [--stride 1.0] [--threshold 0.28] [--om-root <dir>]

Run from the workspace root (the folder that holds workspaces/). Reads job.json, manifest.json
and the pre-prod storyboard.json + panels. Samples one frame per `stride` seconds from every
clip with ffmpeg, embeds panels and frames with lib/clip_embedder.py (CLIP ViT-B/32 through
transformers), and writes rough-edl.json (one cut per panel in storyboard order, a window
centred on the best frame, clamped by the deliverable duration) and timeline.png (the matched
frame per cut, labelled). Panels under the threshold go to unmatchedPanels for a human pick.

Exit 0 ok · 1 fault (missing input, embedder unavailable) · 2 usage · 3 no panels matched
"""
from __future__ import annotations
import json, os, subprocess, sys, tempfile, hashlib, math
from pathlib import Path

def die(msg, code=1):
    print(msg, file=sys.stderr); sys.exit(code)

def by_panel(job, job_id, job_dir, manifest, panels, clips):
    """One cut per panel from the clip that carries the panel id in its name (footage/generated/P01.mp4)."""
    try:
        from PIL import Image, ImageDraw
    except Exception as e:
        die("Pillow is needed for timeline.png: %s" % e)
    by_stem = {Path(c["path"]).stem.upper(): c for c in clips}
    # The brief says how much of each generated clip the cut uses and from where (generate longer, use less).
    brief_p = job_dir / "generation-brief.json"
    windows = {}
    if brief_p.exists():
        for bp in json.loads(brief_p.read_text(encoding="utf-8")).get("panels", []):
            windows[str(bp.get("id")).upper()] = (float(bp.get("inSec") or 0), float(bp.get("useSec") or 0))
    total_budget = float(job.get("deliverableDurationSec") or 0) or None
    fps = float(clips[0].get("fps") or 25)
    cuts, unmatched, tiles = [], [], []
    tmp = Path(tempfile.mkdtemp(prefix="seq-"))
    for p in panels:
        clip = by_stem.get(str(p["id"]).upper())
        if not clip:
            unmatched.append(p["id"]); continue
        dur = float(clip.get("durationSec") or 0)
        head, use = windows.get(str(p["id"]).upper(), (0.0, 0.0))
        want = use or float(p.get("durationSec") or 0) or dur
        start = max(0.0, min(head, dur - want)) if dur else head
        end = round(min(dur, start + want) if dur else start + want, 3)
        cuts.append({"order": len(cuts) + 1, "panelId": p["id"], "clipSha256": clip["sha256"], "inSec": round(start, 3), "outSec": end,
                     "matchScore": 1.0, "matchReason": "generated for panel %s (%s)" % (p["id"], Path(clip["path"]).name), "note": None})
        fpath = tmp / ("%s.png" % p["id"])
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "%.3f" % ((start + end) / 2), "-i", clip["path"], "-frames:v", "1", "-vf", "scale=320:-2", str(fpath)], check=False)
        tiles.append((p["id"], 1.0, str(fpath), Path(clip["path"]).name, (start + end) / 2))
    if not cuts: die("no panel has a generated clip yet; land them with generate-clips.js first", 3)
    total = sum(c["outSec"] - c["inSec"] for c in cuts)
    note = None
    if total_budget and total > total_budget + 0.5:
        note = "cuts total %.1fs against a %.0fs deliverable; ask which panels to shorten" % (total, total_budget)
    edl = {"schemaVersion": "1.0", "jobId": job_id, "version": 1, "aspectRatio": job.get("aspectRatio") or "16:9",
           "fps": fps, "generatedBy": "panel-id", "cuts": cuts, "unmatchedPanels": unmatched}
    if note: edl["cuts"][0]["note"] = note
    out = job_dir / "rough-edl.json"; tmpf = out.with_suffix(".json.tmp")
    tmpf.write_text(json.dumps(edl, indent=2) + "\n", encoding="utf-8"); tmpf.replace(out)
    th = 480; tw = int(th * 16 / 9); pad = 8; label_h = 44
    strip = Image.new("RGB", (len(tiles) * (tw + pad) + pad, th + label_h + pad * 2), (14, 16, 20))
    d = ImageDraw.Draw(strip)
    for i, (pid, score, fpath, name, t) in enumerate(tiles):
        x = pad + i * (tw + pad)
        if Path(fpath).exists():
            im = Image.open(fpath).convert("RGB"); im.thumbnail((tw, th))
            strip.paste(im, (x + (tw - im.width) // 2, pad + (th - im.height) // 2))
        d.text((x + 6, th + pad + 6), "%s  generated" % pid, fill=(228, 232, 237))
        d.text((x + 6, th + pad + 24), name[:28], fill=(157, 167, 180))
    strip.save(job_dir / "timeline.png")
    small = strip.copy(); small.thumbnail((1600, 400)); small.save(job_dir / "timeline-preview.png", optimize=True)
    print("rough-edl.json: %d cut(s) from %d panel(s) by panel id, %d unmatched, %.1fs total%s" % (len(cuts), len(panels), len(unmatched), total, ("; " + note) if note else ""))
    for c in cuts: print("  %s -> %s %.1f-%.1fs" % (c["panelId"], c["matchReason"], c["inSec"], c["outSec"]))
    if unmatched: print("  unmatched (no clip yet): " + ", ".join(unmatched))
    return 0


def main(argv):
    if len(argv) < 3: die("usage: sequence-first-cut.py <client> <job-id> [--stride 1.0] [--threshold 0.28] [--om-root <dir>] [--by-panel]", 2)
    client, job_id = argv[1], argv[2]
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv and argv.index(k) + 1 < len(argv) else d
    stride = float(opt("--stride", "1.0")); threshold = float(opt("--threshold", "0.28"))
    om_root = Path(opt("--om-root", os.environ.get("OM_ROOT", str(Path.home() / "Desktop" / "OpenMontage"))))
    job_dir = Path("workspaces") / client / "jobs" / job_id
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    man_p = job_dir / "manifest.json"
    if not man_p.exists(): die("manifest.json is missing; run the ingest stage first")
    manifest = json.loads(man_p.read_text(encoding="utf-8"))
    release = Path(job["prePipelineReleaseFolder"])
    sb = json.loads((release / "storyboard.json").read_text(encoding="utf-8"))
    panels = sorted(sb.get("panels", []), key=lambda p: (p.get("storyOrder") or 0, p.get("id")))
    if not panels: die("storyboard.json has no panels")


    clips = [c for c in manifest.get("clips", []) if Path(c["path"]).exists()]
    if not clips: die("no clips from the manifest exist on disk")
    # --by-panel: a generated job has one clip per panel, named after it; no frame matching, the whole clip is the cut.
    if "--by-panel" in argv or job.get("footageSource") in ("generated", "hybrid"):
        return by_panel(job, job_id, job_dir, manifest, panels, clips)

    sys.path.insert(0, str(om_root))
    try:
        from lib import clip_embedder
    except Exception as e:
        die("OpenMontage clip_embedder could not be imported from %s: %s (pip install transformers torch)" % (om_root, e))
    import numpy as np
    try:
        from PIL import Image, ImageDraw
    except Exception as e:
        die("Pillow is needed for timeline.png: %s" % e)

    # 1. panel images
    panel_paths = []
    for p in panels:
        f = release / p.get("file", "storyboard/v1/%s.png" % p["id"])
        if not f.exists(): die("panel image missing: %s" % f)
        panel_paths.append(str(f))
    # 2. frames per clip, one per stride, at a small size (CLIP sees 224 px anyway)
    tmp = Path(tempfile.mkdtemp(prefix="seq-"))
    frames = []  # (clip index, t seconds, path)
    for ci, c in enumerate(clips):
        out = tmp / ("clip%02d_%%05d.png" % ci)
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", c["path"], "-vf", "fps=1/%s,scale=320:-2" % stride, str(out)], capture_output=True, text=True)
        if r.returncode != 0:
            print("warning: ffmpeg could not sample %s: %s" % (c["path"], r.stderr.strip()[:200]), file=sys.stderr); continue
        for i, f in enumerate(sorted(tmp.glob("clip%02d_*.png" % ci))):
            frames.append((ci, i * stride, str(f)))
    if not frames: die("no frames could be sampled from the clips")
    # 3. embed and compare
    P = clip_embedder.embed_images(panel_paths)            # (n_panels, d), L2-normalised
    F = clip_embedder.embed_images([f[2] for f in frames])  # (n_frames, d)
    sims = P @ F.T                                          # cosine
    # 4. cuts
    total_budget = float(job.get("deliverableDurationSec") or 0) or None
    per_panel = (total_budget / len(panels)) if total_budget else 3.0
    window = max(1.0, min(3.0, per_panel))
    fps = float(clips[0].get("fps") or 25)
    cuts, unmatched, tiles = [], [], []
    for pi, p in enumerate(panels):
        j = int(np.argmax(sims[pi])); score = float(sims[pi][j])
        if score < threshold:
            unmatched.append(p["id"]); continue
        ci, t, fpath = frames[j]; clip = clips[ci]
        dur = float(clip.get("durationSec") or 0)
        start = max(0.0, min(t - window / 2, max(0.0, dur - window)))
        end = min(dur, start + window) if dur else start + window
        cuts.append({"order": len(cuts) + 1, "panelId": p["id"], "clipSha256": clip["sha256"], "inSec": round(start, 3), "outSec": round(end, 3),
                     "matchScore": round(score, 4), "matchReason": "best frame at %.1fs of %s" % (t, Path(clip["path"]).name), "note": None})
        tiles.append((p["id"], score, fpath, Path(clip["path"]).name, t))
    if not cuts: die("no panel matched any frame above %.2f; the shoot may not cover the storyboard" % threshold, 3)
    total = sum(c["outSec"] - c["inSec"] for c in cuts)
    note = None
    if total_budget and total > total_budget + 0.5:
        note = "cuts total %.1fs against a %.0fs deliverable; ask which panels to compress" % (total, total_budget)
    edl = {"schemaVersion": "1.0", "jobId": job_id, "version": 1, "aspectRatio": job.get("aspectRatio") or manifest.get("aspectRatio") or "16:9",
           "fps": fps, "generatedBy": "clip-embedder", "cuts": cuts, "unmatchedPanels": unmatched}
    if note: edl["cuts"][0]["note"] = note
    out = job_dir / "rough-edl.json"; tmpf = out.with_suffix(".json.tmp")
    tmpf.write_text(json.dumps(edl, indent=2) + "\n", encoding="utf-8"); tmpf.replace(out)
    # 5. timeline strip: the matched frame per cut, short side >= 480 px
    th = 480; tw = int(th * 16 / 9); pad = 8; label_h = 44
    strip = Image.new("RGB", (len(tiles) * (tw + pad) + pad, th + label_h + pad * 2), (14, 16, 20))
    d = ImageDraw.Draw(strip)
    for i, (pid, score, fpath, name, t) in enumerate(tiles):
        im = Image.open(fpath).convert("RGB"); im.thumbnail((tw, th))
        x = pad + i * (tw + pad)
        strip.paste(im, (x + (tw - im.width) // 2, pad + (th - im.height) // 2))
        d.text((x + 6, th + pad + 6), "%s  %.2f" % (pid, score), fill=(228, 232, 237))
        d.text((x + 6, th + pad + 24), "%s @ %.1fs" % (name[:28], t), fill=(157, 167, 180))
    strip.save(job_dir / "timeline.png")
    # small copy for the board preview (under 200 KB)
    small = strip.copy(); small.thumbnail((1600, 400)); small.save(job_dir / "timeline-preview.png", optimize=True)
    print("rough-edl.json: %d cut(s) from %d panel(s), %d unmatched, %.1fs total%s" % (len(cuts), len(panels), len(unmatched), total, ("; " + note) if note else ""))
    for c in cuts: print("  %s -> %s %.1f-%.1fs (%.2f)" % (c["panelId"], c["matchReason"], c["inSec"], c["outSec"], c["matchScore"]))
    if unmatched: print("  unmatched: " + ", ".join(unmatched))
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))