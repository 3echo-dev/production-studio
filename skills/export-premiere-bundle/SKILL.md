---
name: export-premiere-bundle
description: >-
  Builds bundle/project.fcpxml plus the bundle/ folder tree Premiere Pro imports in one step, through scripts/build-bundle.js, which refuses unless the Gate A lock still covers the files. Writes bundle/README.md naming what the editor picks up and bundle/.pipeline/manifest.json. Use at the package stage.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Export Premiere bundle

## Inputs

- `job.json` for `aspectRatio`, `deliverableDurationSec`.
- `rough-edl.json` — picture cuts (sha256-bound).
- `synced-track.json` — audio mix (sha256-bound to EDL).
- `bundle/broll/*.mp4`, `bundle/mograph/*.mov`, `bundle/audio/synced-track.wav`, `bundle/audio/waveform.png`.
- `mograph-requests/*.json` for mograph placement times.
- OpenMontage `$OM_ROOT/lib/delivery_promise.py`.

## Steps

1. Build FCPXML 1.10 XML tree via `scripts/build-fcpxml.py`:
   - Sequence at `aspectRatio` and manifest fps.
   - V1: cuts from EDL, each referencing `bundle/footage/*.mov` relative path.
   - A1, A2, A3: VO, BGM, SFX from `synced-track.json` with gain adjustments baked as clip levels.
   - V2: mograph clips parked at human-declared times.
   - Bins: `B-Roll (imported, not placed)` for `bundle/broll/*.mp4`.
2. Write `bundle/project.fcpxml`. Validate XML parses; validate against FCPXML 1.10 DTD if available.
3. Ensure every referenced file exists under `bundle/`. Copy `bundle/footage/` selected takes if not already staged.
4. Write `bundle/README.md`: what is on the timeline, what is in the bins, unmatched panels, mograph shots on-time vs floating, colour direction note.
5. Compute `bundle/.pipeline/manifest.json` — full sha256 index.
6. Run `python -c "from delivery_promise import validate; validate('bundle')"`. Any failure = hard stop.

## Rules

- FCPXML only (hook refuses other exports).
- Every path in FCPXML is relative to `bundle/`.
- No auto-splice for B-roll or mograph on V1.
- No colour grade baked in.

## Output contract

`bundle/project.fcpxml` (valid), `bundle/README.md`, `bundle/.pipeline/manifest.json`, `delivery_promise` exit 0.

## Boundary

Does not upload; does not push to WeTransfer or Drive (a separate ops step).

## Failure modes

| Failure | Fix |
|---|---|
| Referenced file missing | Stop; name the missing file plainly |
| `delivery_promise` fails | Read the reason; fix the offending file; re-run |
| FCPXML DTD mismatch | Report the exact XML line |
