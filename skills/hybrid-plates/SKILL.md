---
name: hybrid-plates
description: >-
  Hybrid jobs (footageSource "hybrid"): brief the actor plates, locations and backgrounds, then cut the actor out of every plate as a transparent layer. Chroma key on any green or blue screen, AI segmentation (rembg) when there is none, OpenMontage's detector as a second opinion. Run by the plate-director in the ingest row.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Hybrid plates

## Inputs

- `job.json` with `footageSource: "hybrid"`; optional `hybrid.cutout` (`auto`, `chromakey`, `rembg`), `hybrid.similarity`, `hybrid.blend`.
- `{drive}/footage/plates/`: one plate per panel named after it (`P03.mov`), or `plates.json` (`{"P03": "day-01/A001_C004.mov"}`).
- The pre-prod release and the reference library.
- `scripts/hybrid.js`, `scripts/cutout.py`.

## Steps

1. **Brief.** `hybrid.js {client} {job-id} brief` writes `hybrid-brief.json`: per panel its plate (hashed) and location; per location its background: the library's picture (`provided`) or `to generate` with a prompt for an empty set, the storyboard frame as framing reference, and an idempotency key. Put the summary on the Ingest item; a panel with no plate is named there.
2. **Cut out.** `python cutout.py {client} {job-id}` (or `--panel P03`). `auto` samples the screen colour from each plate's corners and keys any green or blue screen with ffmpeg (`chromakey` then `despill`); with no screen it asks OpenMontage's `GreenScreenProcessor`, else uses rembg. Output: `{drive}/footage/cutout/{panel}.mov` (PNG codec, alpha), a mask still in `previews/hybrid/`, and in the brief: method, decider, key colour, actor coverage.
3. **Check.** Look at every mask. Coverage under 2% or over 85% is a failed cut-out: retry with `--similarity 0.08..0.2`, `--blend`, or `--method rembg`, and say which panel.
4. **Record.** `record-version.js --item ingest --status draft --preview {mask}` with a note of methods and coverages. Push.

## Rules

- Chroma key before AI whenever there is a screen: it keeps every pixel of the performance.
- rembg missing is a plain stop for that panel, not an install.
- A changed plate is a new cut-out; `brief` voids the old one by hash.

## Output contract

`hybrid-brief.json` with every plated panel `cut-out`, and `footage/cutout/{panel}.mov` for each.

## Boundary

Does not make backgrounds, composite, spend credits or cut.

## Failure modes

| Failure | Fix |
|---|---|
| No plate for a panel | `brief` names it; ask for the plate, or drop the panel from the cut on the board |
| Screen not detected (uneven light, spill) | `--method chromakey --similarity 0.2`; or rembg |
| rembg not installed | Say so; green-screen plates still work; the install is a person's decision |
| Green fringe on hair | Lower `--blend`, keep despill; if it stays, flag the panel |
