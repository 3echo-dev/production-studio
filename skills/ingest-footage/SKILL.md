---
name: ingest-footage
description: >-
  Catalogs every clip and audio file under the shoot Drive folder. Computes sha256, extracts ffprobe metadata (codec, resolution, fps, timecode, duration), parses shoot-day and slate references where filenames carry them, writes manifest.json. Use at the ingest stage.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Ingest footage

## Inputs

- `job.json` for `jobId` and `driveFolder`.
- Drive folder at `driveFolder`: `footage/day-*/`, `audio/{lav,boom,ambient,wild,vo}/`, optional `slates/`.
- OpenMontage `lib/media_profiles.py` for known codec presets.

## Steps

1. Walk `footage/` for `.mov`, `.mp4`, `.mxf`, `.braw`, `.r3d`, `.mts`. For each:
   - sha256 the bytes.
   - `ffprobe -v error -show_streams -show_format -print_format json` → codec, width, height, fps, duration, timecodeStart.
   - Parse `day` from parent folder (`day-01`); park as `day: null` with a warning if absent.
   - Parse `scene`, `take`, `slate` from filename convention `A001_C003_scene-2_t3.mov`.
   - Detect sibling `proxies/` and set `proxyPath`.
2. Walk `audio/{kind}/` for each kind in schema enum. For each `.wav`, `.aif`, `.mp3`, `.m4a`:
   - sha256, ffprobe for channels, sample rate, duration.
   - `kind` = parent folder name.
3. Assemble `manifest.json` against `schemas/manifest.schema.json`.
4. Emit warnings: clips with no `day`, unknown codecs, audio below 44.1kHz, missing expected days.
5. Push to the board: clip count, audio count, warnings. Ask the person to confirm.

## Rules

- Hash the bytes; do not trust mtime.
- ffprobe is the only source of truth for fps and duration.
- Never type a scene, take or slate that the filename does not carry.

## Output contract

`manifest.json` valid against schema. Hook enforces: only this skill writes `manifest.json`.

## Boundary

Does not transcode, does not build proxies, does not modify the Drive folder.

## Failure modes

| Failure | Fix |
|---|---|
| ffprobe not on PATH | Install ffmpeg; check `ffmpeg -version` |
| A file will not open | Skip with a warning; do not silently omit |
| Codec unknown to `media_profiles` | Warn; the sequence stage may still handle it |
