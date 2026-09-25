#!/usr/bin/env python
"""cutout: the plate-director's tool. Cuts the actor out of each plate as a transparent layer.

Usage:
    python cutout.py <client> <job-id> [--panel P03] [--method auto|chromakey|rembg]
                     [--similarity 0.12] [--blend 0.08] [--om-root <dir>]

Run from the workspace root. Reads hybrid-brief.json (hybrid.js brief) and, per panel with a plate,
writes footage/cutout/<panel>.mov: the plate's own pixels with an alpha channel (PNG codec in MOV),
so the actor is never redrawn, only separated.

  auto       the screen colour sampled from the plate's corners decides (chromakey on any green or
             blue screen); when there is none, OpenMontage's GreenScreenProcessor gives a second
             opinion; otherwise rembg.
  chromakey  ffmpeg chromakey on the screen colour sampled from the plate's corners, then despill.
             Fast, no GPU, no AI.
  rembg      AI person segmentation per frame (rembg, u2net_human_seg). Needs `pip install rembg`
             (rembg[gpu] with CUDA for speed); refused with a plain message when it is not installed.

Records method, key colour, frames and alpha coverage in the brief, and a mask still for the board.
Exit 0 ok · 1 fault · 2 usage · 3 not ready (no brief, no plate, rembg missing)
"""
from __future__ import annotations
import json, os, subprocess, sys, tempfile, hashlib, shutil
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
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", str(path)])
    j = json.loads(out); s = (j.get("streams") or [{}])[0]
    num, den = (s.get("r_frame_rate") or "25/1").split("/")
    return {"width": int(s.get("width") or 0), "height": int(s.get("height") or 0), "fps": float(num) / float(den or 1), "duration": float((j.get("format") or {}).get("duration") or 0)}

def detect_method(plate, info, om_root):
    """First the plate's own screen colour, sampled from its corners: any shade of green or blue.
    Only when the corners are not a screen, OpenMontage's detector is asked (called in place, not
    copied) as a second opinion; it tests pure #00FF00, which misses the darker chroma green most
    studios use, so it is never the first word. Without OpenMontage: AI segmentation."""
    if key_colour(plate, info): return "chromakey", "corner-sample"
    try:
        sys.path.insert(0, str(om_root))
        from tools.video.green_screen_processor import GreenScreenProcessor
        return GreenScreenProcessor()._auto_detect_method(Path(plate), info["duration"], info["width"], info["height"]), "openmontage"
    except Exception:
        return "rembg", "no-screen"

def frame_at(plate, t, out):
    run(["ffmpeg", "-v", "error", "-y", "-ss", "%.3f" % t, "-i", str(plate), "-frames:v", "1", str(out)])

def key_colour(plate, info):
    """The screen colour: the average of the four corners of the middle frame, when it is a saturated
    green or blue. None when the corners are not a screen (no chroma key possible)."""
    from PIL import Image
    tmp = Path(tempfile.mkdtemp(prefix="key-")); f = tmp / "mid.png"
    try:
        frame_at(plate, max(0.0, info["duration"] / 2), f)
        im = Image.open(f).convert("RGB"); w, h = im.size; s = max(8, min(w, h) // 12)
        px = []
        for (x, y) in [(0, 0), (w - s, 0), (0, h - s), (w - s, h - s)]:
            c = im.crop((x, y, x + s, y + s)); px += list(c.get_flattened_data() if hasattr(c, "get_flattened_data") else c.getdata())
        r = sum(p[0] for p in px) / len(px); g = sum(p[1] for p in px) / len(px); b = sum(p[2] for p in px) / len(px)
        if g > 90 and g > r * 1.35 and g > b * 1.2: kind = "green"
        elif b > 90 and b > r * 1.35 and b > g * 1.2: kind = "blue"
        else: return None
        return {"hex": "0x%02X%02X%02X" % (int(r), int(g), int(b)), "kind": kind}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def cut_chromakey(plate, out, colour, similarity, blend):
    despill = ",despill=type=%s" % colour["kind"]
    run(["ffmpeg", "-v", "error", "-y", "-i", str(plate), "-an",
         "-vf", "format=rgba,chromakey=%s:%s:%s%s,format=rgba" % (colour["hex"], similarity, blend, despill),
         "-c:v", "png", "-pix_fmt", "rgba", str(out)])

def cut_rembg(plate, out, info):
    try:
        from rembg import remove, new_session
    except Exception:
        die("rembg is not installed, so a plate without a green or blue screen cannot be cut out yet. "
            "Green-screen plates work without it. Install it in the pipeline environment: pip install 'rembg[cpu]' (or 'rembg[gpu]' with CUDA for speed); check-deps.js --setup lists it.", 3)
    from PIL import Image
    tmp = Path(tempfile.mkdtemp(prefix="rembg-"))
    try:
        run(["ffmpeg", "-v", "error", "-y", "-i", str(plate), "-fps_mode", "passthrough", str(tmp / "f%06d.png")])
        session = new_session("u2net_human_seg")
        frames = sorted(tmp.glob("f*.png"))
        for f in frames:
            remove(Image.open(f), session=session).save(tmp / ("a" + f.name[1:]))
        run(["ffmpeg", "-v", "error", "-y", "-framerate", "%.4f" % info["fps"], "-i", str(tmp / "a%06d.png"),
             "-c:v", "png", "-pix_fmt", "rgba", str(out)])
        return len(frames)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def coverage_and_mask(cut, info, mask_png):
    """How much of the middle frame is the actor (alpha > 50%), and a black/white mask still for the board."""
    from PIL import Image
    tmp = Path(tempfile.mkdtemp(prefix="mask-")); f = tmp / "mid.png"
    try:
        run(["ffmpeg", "-v", "error", "-y", "-ss", "%.3f" % max(0.0, info["duration"] / 2), "-i", str(cut), "-frames:v", "1", "-pix_fmt", "rgba", str(f)])
        a = Image.open(f).convert("RGBA").getchannel("A")
        a.save(mask_png)
        hist = a.histogram()
        return round(100.0 * sum(hist[128:]) / max(1, sum(hist)), 1)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def main(argv):
    if len(argv) < 3: die("usage: cutout.py <client> <job-id> [--panel P03] [--method auto|chromakey|rembg] [--similarity 0.12] [--blend 0.08]", 2)
    client, job_id = argv[1], argv[2]
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv and argv.index(k) + 1 < len(argv) else d
    job_dir = (Path("workspaces") / client / "jobs" / job_id).resolve()
    brief_p = job_dir / "hybrid-brief.json"
    if not brief_p.exists(): die("no hybrid-brief.json; run hybrid.js brief first", 3)
    brief = json.loads(brief_p.read_text(encoding="utf-8"))
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    hyb = job.get("hybrid") or {}
    method_opt = opt("--method", hyb.get("cutout") or brief.get("cutoutMethod") or "auto")
    similarity = float(opt("--similarity", str(hyb.get("similarity", 0.12))))
    blend = float(opt("--blend", str(hyb.get("blend", 0.08))))
    om_root = Path(opt("--om-root", os.environ.get("OM_ROOT", str(Path.home() / "Desktop" / "OpenMontage"))))
    only = opt("--panel", None)
    out_dir = Path(job["driveFolder"]) / "footage" / "cutout"; out_dir.mkdir(parents=True, exist_ok=True)
    prev_dir = job_dir / "previews" / "hybrid"; prev_dir.mkdir(parents=True, exist_ok=True)
    todo = [p for p in brief["panels"] if p.get("plate") and (only is None or p["id"].upper() == only.upper())]
    if not todo: die("no panel with a plate%s" % ((" matching " + only) if only else ""), 3)
    for p in todo:
        plate = Path(p["plate"]); info = probe(plate)
        method, how = (method_opt, "asked") if method_opt != "auto" else detect_method(plate, info, om_root)
        out = out_dir / (p["id"] + ".mov"); frames = None; colour = None
        if method == "chromakey":
            colour = key_colour(plate, info) or ({"hex": "0x00FF00", "kind": "green"} if how == "openmontage" else None)
            if not colour: die("%s: no green or blue screen found in the plate's corners; use --method rembg" % p["id"], 3)
            cut_chromakey(plate, out, colour, similarity, blend)
        elif method == "rembg":
            frames = cut_rembg(plate, out, info)
        else:
            die("unknown method " + method, 2)
        mask_png = prev_dir / (p["id"] + "-mask.png")
        cover = coverage_and_mask(out, info, mask_png)
        p["cutout"] = {"method": method, "decidedBy": how, "file": str(out).replace("\\", "/"), "sha256": sha256(out), "keyColour": colour, "similarity": similarity if method == "chromakey" else None,
                       "blend": blend if method == "chromakey" else None, "frames": frames, "actorCoveragePct": cover, "mask": str(mask_png).replace("\\", "/")}
        p["composite"] = None; p["status"] = "cut-out"
        warn = "" if 2 <= cover <= 85 else ("  WARNING: the cut-out keeps %s%% of the frame; check the mask before compositing" % cover)
        print("%s cut out by %s (%s): actor covers %s%% of the frame%s" % (p["id"], method, how, cover, warn))
    brief_p.write_text(json.dumps(brief, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main(sys.argv)
