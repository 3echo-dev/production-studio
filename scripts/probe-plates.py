#!/usr/bin/env python3
"""Intake look at actor plates, before anything is cut out or spent.

    python probe-plates.py <plate> [<plate> ...]

Prints one JSON object: per plate its screen (the corner colour cutout.py keys on: green, blue, or
none, meaning AI segmentation is needed) and whether the camera moves (the four corners, where the
set or the screen is, compared across three frames; a still background cannot track a moving
camera). Plus whether rembg is installed on this machine. Reads only; writes nothing.
Exit 0 ok · 2 usage
"""
from __future__ import annotations
import importlib.util, json, shutil, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cutout import frame_at, key_colour, probe  # noqa: E402

MOVE_THRESHOLD = 10.0  # mean corner difference (0..255) between frames above which the camera is taken to move

def corners(img, s):
    w, h = img.size
    return [img.crop((x, y, x + s, y + s)) for (x, y) in [(0, 0), (w - s, 0), (0, h - s), (w - s, h - s)]]

def camera_move(plate, info):
    from PIL import Image, ImageChops, ImageStat
    tmp = Path(tempfile.mkdtemp(prefix="move-"))
    try:
        d = info["duration"]
        if d <= 0.2: return {"moving": None, "score": None}
        frames = []
        for i, t in enumerate([d * 0.15, d * 0.5, d * 0.85]):
            f = tmp / ("f%d.png" % i); frame_at(plate, t, f); frames.append(Image.open(f).convert("L"))
        s = max(8, min(frames[0].size) // 8)
        diffs = []
        for a, b in zip(frames, frames[1:]):
            for ca, cb in zip(corners(a, s), corners(b, s)):
                diffs.append(ImageStat.Stat(ImageChops.difference(ca, cb)).mean[0])
        # The median corner: one corner crossed by a hand or a passer-by does not make a camera move.
        diffs.sort(); score = round(diffs[len(diffs) // 2], 2)
        return {"moving": score > MOVE_THRESHOLD, "score": score}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def main(argv):
    if not argv: print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr); return 2
    out = {"rembgInstalled": importlib.util.find_spec("rembg") is not None, "plates": {}}
    for p in argv:
        try:
            info = probe(p)
            colour = key_colour(p, info)
            out["plates"][p] = {"durationSec": round(info["duration"], 3), "width": info["width"], "height": info["height"],
                                "screen": colour["kind"] if colour else None, "keyHex": colour["hex"] if colour else None,
                                "camera": camera_move(p, info)}
        except Exception as e:  # an unreadable plate is reported, not fatal
            out["plates"][p] = {"error": str(e)[-300:]}
    print(json.dumps(out))
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
