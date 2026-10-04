#!/usr/bin/env python
"""build-fcpxml — assemble FCPXML 1.10 from rough-edl.json + synced-track.json + job.json.

Usage:
    python build-fcpxml.py <client> <job-id>

Reads:
    workspaces/{client}/jobs/{job-id}/job.json
    workspaces/{client}/jobs/{job-id}/rough-edl.json
    workspaces/{client}/jobs/{job-id}/synced-track.json
    workspaces/{client}/jobs/{job-id}/manifest.json (for clip file paths)

Writes:
    workspaces/{client}/jobs/{job-id}/bundle/project.fcpxml

Exit codes:
    0  ok
    1  fault (missing input, invalid data)
    2  usage
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, ElementTree, tostring
from xml.dom import minidom

ASPECT_TO_DIM = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "2.39:1": (2560, 1072),
}


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def sec_to_rational(sec: float, fps: float) -> str:
    """FCPXML times are rational: NNNN/DDDDs. Use fps as the denominator."""
    frames = round(sec * fps)
    denom = int(fps * 100) if fps % 1 else int(fps)
    numer = int(round(frames * (denom / fps)))
    return f"{numer}/{denom}s"


def pretty(elem: Element) -> str:
    raw = tostring(elem, encoding="unicode")
    return minidom.parseString(raw).toprettyxml(indent="  ")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        die("usage: build-fcpxml.py {client} {job-id}", 2)
    client, job_id = argv[1], argv[2]
    job_dir = Path("workspaces") / client / "jobs" / job_id
    if not job_dir.exists():
        die(f"job dir missing: {job_dir}")

    job = json.loads((job_dir / "job.json").read_text())
    edl = json.loads((job_dir / "rough-edl.json").read_text())
    sync = json.loads((job_dir / "synced-track.json").read_text())
    manifest = json.loads((job_dir / "manifest.json").read_text())

    fps = float(edl.get("fps") or manifest["clips"][0].get("fps", 25.0))
    aspect = job["aspectRatio"]
    if aspect not in ASPECT_TO_DIM:
        die(f"unknown aspectRatio: {aspect}")
    width, height = ASPECT_TO_DIM[aspect]

    # Map sha256 -> clip entry for path lookup.
    clips_by_sha = {c["sha256"]: c for c in manifest.get("clips", [])}

    fcpxml = Element("fcpxml", version="1.10")
    resources = SubElement(fcpxml, "resources")

    fmt_id = "r1"
    SubElement(
        resources, "format",
        id=fmt_id, name=f"{width}x{height}p{fps:g}",
        width=str(width), height=str(height), frameDuration=f"1/{int(fps)}s",
    )

    # One asset per distinct clip in the EDL.
    asset_ids: dict[str, str] = {}
    next_id = 2
    for cut in edl["cuts"]:
        sha = cut["clipSha256"]
        if sha in asset_ids:
            continue
        clip = clips_by_sha.get(sha)
        if not clip:
            die(f"cut references clip sha {sha[:12]}... not in manifest")
        aid = f"r{next_id}"
        next_id += 1
        rel_src = f"footage/{Path(clip['path']).name}"
        SubElement(
            resources, "asset",
            id=aid, name=Path(clip["path"]).stem,
            src=rel_src, hasVideo="1", hasAudio="0",
            format=fmt_id,
            duration=sec_to_rational(clip["durationSec"], fps),
        )
        asset_ids[sha] = aid

    library = SubElement(fcpxml, "library")
    event = SubElement(library, "event", name=job.get("title", job_id))
    project = SubElement(event, "project", name=job.get("title", job_id))
    seq_dur = sum(c["outSec"] - c["inSec"] for c in edl["cuts"])
    sequence = SubElement(
        project, "sequence",
        format=fmt_id, duration=sec_to_rational(seq_dur, fps),
    )
    spine = SubElement(sequence, "spine")

    offset = 0.0
    for cut in edl["cuts"]:
        dur = cut["outSec"] - cut["inSec"]
        SubElement(
            spine, "clip",
            name=f"panel-{cut['panelId']}",
            offset=sec_to_rational(offset, fps),
            duration=sec_to_rational(dur, fps),
            start=sec_to_rational(cut["inSec"], fps),
            ref=asset_ids[cut["clipSha256"]],
        )
        offset += dur

    # Audio: one mixdown reference to synced-track.wav on lane -1.
    # Every src is relative to bundle/, so the leading bundle/ of the recorded wavPath goes.
    wav_rel = sync["output"]["wavPath"]
    if wav_rel.startswith("bundle/"):
        wav_rel = wav_rel[len("bundle/"):]
    wav_id = f"r{next_id}"
    SubElement(
        resources, "asset",
        id=wav_id, name="synced-track",
        src=wav_rel, hasVideo="0", hasAudio="1", format=fmt_id,
        duration=sec_to_rational(seq_dur, fps),
    )
    SubElement(
        spine, "asset-clip",
        name="synced-track", ref=wav_id, lane="-1",
        offset="0/1s", duration=sec_to_rational(seq_dur, fps),
        audioRole="dialogue.mixdown",
    )

    bundle = job_dir / "bundle"
    bundle.mkdir(exist_ok=True)
    out = bundle / "project.fcpxml"
    out.write_text(pretty(fcpxml))

    # Manifest side-effect: sha256 of the FCPXML, useful for gate binding.
    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    (bundle / ".pipeline").mkdir(exist_ok=True)
    (bundle / ".pipeline" / "fcpxml.sha256").write_text(sha + "\n")

    print(f"wrote {out} ({len(edl['cuts'])} cuts, {seq_dur:.2f}s, sha={sha[:12]}...)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
