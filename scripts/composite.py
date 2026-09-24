#!/usr/bin/env python
"""composite: the composite-director's tool. Lays each cut-out actor over its location's background.

Usage:
    python composite.py <client> <job-id> [--panel P03] [--match 0.5] [--min-preserved 97]

Run from the workspace root after cutout.py. Per panel with a cut-out and a ready background
(library or delivered in hybrid-brief.json) it writes footage/composite/<panel>.mp4: the background
scaled to cover the plate's frame, its brightness nudged towards the actor's (--match, 0 = off),
the cut-out laid on top, the plate's own sound kept. It then checks the performance was not touched:
on five frames it compares the actor's pixels in the composite with the plate's (inside the fully
opaque part of the cut-out) and records the share kept. Below --min-preserved the panel is flagged,
never passed silently. A before/after still (plate | composite) goes to previews/hybrid/ for the board.
Exit 0 ok · 1 fault · 2 usage · 3 not ready (no brief, no cut-out, no background)
"""
from __future__ import annotations
import json, subprocess, sys, tempfile, hashlib, shutil
from pathlib import Path

def die(msg, code=1):
    print(msg, file=sys.stderr); sys.exit(code)

def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: raise RuntimeError(" ".join(cmd[:3]) + ": " + (r.stderr or "")[-600:])
    return r.stdout

def probe(path):
    j = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", str(path)]))
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), {})
    num, den = (v.get("r_frame_rate") or "25/1").split("/")
    return {"width": int(v.get("width") or 0), "height": int(v.get("height") or 0), "fps": float(num) / float(den or 1),
            "duration": float((j.get("format") or {}).get("duration") or 0), "audio": any(s.get("codec_type") == "audio" for s in j.get("streams", []))}

def grab(src, t, out, rgba=False):
    run(["ffmpeg", "-v", "error", "-y", "-ss", "%.3f" % t, "-i", str(src), "-frames:v", "1"] + (["-pix_fmt", "rgba"] if rgba else []) + [str(out)])

def luma(im, mask=None):
    from PIL import ImageStat
    g = im.convert("L")
    return ImageStat.Stat(g, mask).mean[0] if mask is not None else ImageStat.Stat(g).mean[0]

def main(argv):
    if len(argv) < 3: die("usage: composite.py <client> <job-id> [--panel P03] [--match 0.5] [--min-preserved 97]", 2)
    from PIL import Image, ImageChops
    client, job_id = argv[1], argv[2]
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv and argv.index(k) + 1 < len(argv) else d
    job_dir = (Path("workspaces") / client / "jobs" / job_id).resolve()
    brief_p = job_dir / "hybrid-brief.json"
    if not brief_p.exists(): die("no hybrid-brief.json; run hybrid.js brief first", 3)
    brief = json.loads(brief_p.read_text(encoding="utf-8"))
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    match = float(opt("--match", str((job.get("hybrid") or {}).get("match", 0.5))))
    min_kept = float(opt("--min-preserved", "97"))
    only = opt("--panel", None)
    out_dir = Path(job["driveFolder"]) / "footage" / "composite"; out_dir.mkdir(parents=True, exist_ok=True)
    prev_dir = job_dir / "previews" / "hybrid"; prev_dir.mkdir(parents=True, exist_ok=True)
    todo = [p for p in brief["panels"] if p.get("plate") and (only is None or p["id"].upper() == only.upper())]
    if not todo: die("no panel with a plate%s" % ((" matching " + only) if only else ""), 3)
    waiting, flagged = [], []
    for p in todo:
        cut = (p.get("cutout") or {}).get("file")
        bg = brief["backgrounds"].get(p["background"]) or {}
        if not cut or not Path(cut).exists(): waiting.append(p["id"] + " (no cut-out yet)"); continue
        if bg.get("status") not in ("provided", "delivered") or not bg.get("file") or not Path(bg["file"]).exists():
            waiting.append(p["id"] + " (background " + (bg.get("name") or p["background"]) + " not ready)"); continue
        plate = Path(p["plate"]); info = probe(plate)
        W, H, dur, fps = info["width"], info["height"], info["duration"], info["fps"]
        is_video = Path(bg["file"]).suffix.lower() in (".mp4", ".mov", ".m4v", ".webm")
        tmp = Path(tempfile.mkdtemp(prefix="comp-"))
        try:
            # Brightness: nudge the background towards the actor's level, by `match` of the gap, capped.
            mid = max(0.0, dur / 2)
            grab(cut, mid, tmp / "cut.png", rgba=True)
            ca = Image.open(tmp / "cut.png").convert("RGBA"); alpha = ca.getchannel("A")
            if is_video: grab(bg["file"], 0.5, tmp / "bg.png")
            bgi = Image.open(tmp / "bg.png" if is_video else bg["file"]).convert("RGB").resize((W, H))
            a_l = luma(ca.convert("RGB"), alpha.point(lambda v: 255 if v > 200 else 0)); b_l = luma(bgi)
            shift = max(-0.15, min(0.15, (a_l - b_l) / 255.0 * match)) if match else 0.0
            out = out_dir / (p["id"] + ".mp4")
            bg_in = (["-stream_loop", "-1", "-t", "%.3f" % dur, "-i", bg["file"]] if is_video else ["-loop", "1", "-t", "%.3f" % dur, "-i", bg["file"]])
            fc = ("[0:v]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1,fps=%.4f,eq=brightness=%.4f[bg];"
                  "[bg][1:v]overlay=0:0:shortest=1,format=yuv420p[v]") % (W, H, W, H, fps, shift)
            cmd = ["ffmpeg", "-v", "error", "-y"] + bg_in + ["-i", str(cut), "-i", str(plate), "-filter_complex", fc, "-map", "[v]"]
            if info["audio"]: cmd += ["-map", "2:a", "-c:a", "aac", "-b:a", "192k"]
            cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-t", "%.3f" % dur, str(out)]
            run(cmd)
            # Performance check: the actor's pixels in the composite against the plate's, on five frames.
            kept = []
            for i in range(5):
                t = dur * (i + 0.5) / 5
                grab(plate, t, tmp / "p.png"); grab(out, t, tmp / "c.png"); grab(cut, t, tmp / "a.png", rgba=True)
                pl = Image.open(tmp / "p.png").convert("RGB"); co = Image.open(tmp / "c.png").convert("RGB").resize(pl.size)
                m = Image.open(tmp / "a.png").convert("RGBA").getchannel("A").resize(pl.size).point(lambda v: 255 if v >= 250 else 0)
                if not m.getbbox(): continue
                diff = ImageChops.difference(pl, co).convert("L")
                from PIL import ImageStat
                mean = ImageStat.Stat(diff, m).mean[0]
                kept.append(round(100.0 - mean / 255.0 * 100.0, 2))
            pct = round(sum(kept) / len(kept), 2) if kept else None
            worst = min(kept) if kept else None
            # Before / after still for the board.
            grab(plate, mid, tmp / "pm.png"); grab(out, mid, tmp / "cm.png")
            a_img = Image.open(tmp / "pm.png").convert("RGB"); b_img = Image.open(tmp / "cm.png").convert("RGB").resize(a_img.size)
            sc = 640.0 / a_img.width if a_img.width > 640 else 1.0
            a_img = a_img.resize((int(a_img.width * sc), int(a_img.height * sc))); b_img = b_img.resize(a_img.size)
            ba = Image.new("RGB", (a_img.width * 2 + 12, a_img.height), (7, 26, 58)); ba.paste(a_img, (0, 0)); ba.paste(b_img, (a_img.width + 12, 0))
            ba_p = prev_dir / (p["id"] + "-before-after.jpg"); ba.save(ba_p, quality=86)
            p["composite"] = {"file": str(out).replace("\\", "/"), "sha256": sha256(out), "backgroundKey": p["background"], "backgroundSha": bg.get("sha256"),
                              "cutoutSha": (p.get("cutout") or {}).get("sha256"), "brightnessShift": round(shift, 4), "actorPreservedPct": pct, "worstFramePct": worst,
                              "preview": str(ba_p).replace("\\", "/")}
            ok = pct is not None and worst is not None and worst >= min_kept
            p["status"] = "composited" if ok else "needs-review"
            if not ok: flagged.append(p["id"])
            print("%s composited over %s: actor kept %s%% (worst frame %s%%)%s" % (p["id"], bg.get("name"), pct, worst, "" if ok else "  FLAGGED: below %s%%, check the before/after" % min_kept))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    brief_p.write_text(json.dumps(brief, indent=2) + "\n", encoding="utf-8")
    if waiting: print("waiting: " + "; ".join(waiting))
    if flagged: print("flagged for review: " + ", ".join(flagged))

if __name__ == "__main__":
    main(sys.argv)
