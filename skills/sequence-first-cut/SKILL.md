---
name: sequence-first-cut
description: >-
  Frame-matches storyboard panels against ingested footage using OpenMontage's CLIP ViT-L/14 embedder. Emits rough-edl.json plus timeline.png preview strip. Unmatched panels park for human take-picks. Use at the sequence stage.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Sequence first cut

## Inputs

- `job.json` for `aspectRatio`, `deliverableDurationSec`, `audioLed`, optional `referenceCutPath`.
- `manifest.json` for clips.
- Pre-prod `storyboard.json` and `storyboard/v{n}/P*.png`.
- OpenMontage `$OM_ROOT/lib/clip_embedder.py` (prepend `$OM_ROOT` to sys.path).

## Steps

1. Load every panel PNG. Embed with `clip_embedder.embed_images(panel_paths)`.
2. For each clip in manifest, sample frames every 1 second (from `media_profiles.sample_stride_sec`). Embed with `clip_embedder.embed_video_frames(clip_path, stride=1.0)`.
3. Cosine similarity: panel → all clip frames. Top-5 candidates per panel.
4. Assemble EDL: one cut per panel in storyboard order. Cut window = 3s centred on best-match frame, clamped by `deliverableDurationSec / panelCount`.
5. Panels with best score below `0.28` → `unmatchedPanels[]`; no cut.
6. Render `timeline.png`: horizontal strip, first frame of each cut labelled with panel id and score. Short-side ≥ 480px.
7. Write `rough-edl.json` against `schemas/edl.schema.json`.

## Rules

- Never invent a take not in the manifest.
- Never auto-place a cut below the threshold.
- Never reorder panels; storyboard order is authoritative.
- Never cut past `deliverableDurationSec`; if the sum overshoots, park with a note asking which panels to compress.

## Output contract

`rough-edl.json` valid against schema. `timeline.png` created.

## Boundary

Does not sync audio (that is `audio-sync`), does not modify the storyboard, does not render a preview MP4.

## Failure modes

| Failure | Fix |
|---|---|
| `check-om.js` non-zero this session | Stop; OpenMontage is not resolvable |
| Panels have no matches at any threshold | Warn; the shoot may not cover the storyboard |
| GPU unavailable, CPU too slow | Reduce stride to 2s; retry |
