---
name: sequence-first-cut
description: >-
  Frame-matches storyboard panels against ingested footage using CLIP ViT-B/32 (scripts/clip_match.py). Emits rough-edl.json plus timeline.png preview strip. Unmatched panels park for human take-picks. Use at the sequence stage.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Sequence first cut

## Inputs

- `job.json` for `aspectRatio`, `deliverableDurationSec`, `audioLed`, optional `referenceCutPath`.
- `manifest.json` for clips.
- Pre-prod `storyboard.json` and `storyboard/v{n}/P*.png`.
- `scripts/clip_match.py` (needs numpy, torch, transformers).

## Steps

1. Load every panel PNG. Embed with `clip_match.embed_images(panel_paths)`.
2. For each clip in manifest, sample frames every 1 second with ffmpeg and embed them the same way.
3. Cosine similarity: panel → all clip frames. Top-5 candidates per panel.
4. Assemble EDL: one cut per panel in storyboard order. Cut window = 3s centred on best-match frame, clamped by `deliverableDurationSec / panelCount`.
5. Panels with best score below `0.28` → `unmatchedPanels[]`; no cut.
6. Render `timeline.png`: horizontal strip, first frame of each cut labelled with panel id and score. Short-side ≥ 480px.
7. Write `rough-edl.json` against `schemas/edl.schema.json`.
8. Render the silent preview: `render-preview.js {client} {job-id} --stage cut` writes `previews/cut-v{n}.mp4` (the cuts in story order, panel id burned in, no audio: picture is judged before any audio touches it) and a filmstrip PNG under 200 KB. Upload the MP4 to the board artifact's asset store (Artifact tool, `asset: true`, one file per call) and attach it with `set-preview.js {client} {job-id} --item sequence --video-url /_blob/{id} --asset-id {id} --strip previews/cut-v{n}-strip.png`; the card then plays it.

## Rules

- Never invent a take not in the manifest.
- Never auto-place a cut below the threshold.
- Never reorder panels; storyboard order is authoritative.
- Never cut past `deliverableDurationSec`; if the sum overshoots, park with a note asking which panels to compress.

## Output contract

`rough-edl.json` valid against schema. `timeline.png` created. `previews/cut-v{n}.mp4` rendered and playing on the First cut card.

## Boundary

Does not sync audio (that is `audio-sync`), does not modify the storyboard, does not render a preview MP4.

## Failure modes

| Failure | Fix |
|---|---|
| torch or transformers missing | Stop; `check-deps.js --setup` has the install line |
| Panels have no matches at any threshold | Warn; the shoot may not cover the storyboard |
| GPU unavailable, CPU too slow | Reduce stride to 2s; retry |
