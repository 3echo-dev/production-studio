---
name: mograph-generate
description: >-
  Renders one mograph variant via OpenMontage's remotion-composer. Sample-then-batch pattern. Alpha-channel ProRes 4444 MOV under bundle/mograph/, ready for Premiere overlay. Orchestrator only. Use at the mograph stage per human request.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Mograph generate

## Inputs

- `mograph-requests/{n}.json`: `template` (one of `cinematic`, `explainer`, `talkinghead`, `collageburst`, `lyricoverlay`), `props`, `durationSec`, `aspectRatio`, `note`.
- `bundle/mograph/plates/` for any plate art already generated.
- OpenMontage `$OM_ROOT/remotion-composer/`.

## Steps

1. Validate `template` in supported list. Reject otherwise.
2. If template needs plate art missing on disk, quote a `create_image_job` (1 credit per image), present, wait for yes, land under `bundle/mograph/plates/`.
3. Sample render: `cd $OM_ROOT/remotion-composer && npx remotion render {template} out=sample.mov props="{propsJson}" --codec=prores --pixelFormat=argb --fps={jobFps} --width={w} --height={h}`.
4. Land as `bundle/mograph/sample_{template}_{n}.mov`. Extract a preview PNG. Push to board. End the turn.
5. Next turn: `board-sync.js land`. If approved: batch (usually one variant, unless A/B). Land as `bundle/mograph/{template}_{nn}_{slug}_v{k}.mov`.
6. Update `mograph-requests/{n}.json`: `status: delivered`, `deliveredPath`.

## Rules

- Alpha channel present (`pixelFormat=argb`).
- ProRes 4444 codec.
- Templates outside the shipping five refused.
- Never bake a background into an alpha export.

## Output contract

`bundle/mograph/{template}_{nn}_{slug}_v{k}.mov` with alpha. Sample preserved as `sample_*`.

## Boundary

Does not edit template code (that is an OpenMontage upstream change). Does not composite; the editor overlays.

## Failure modes

| Failure | Fix |
|---|---|
| Remotion render fails | Report the error verbatim; check Node 20+ and `npx remotion --version` |
| Template props mismatch schema | Reject with the schema pointer |
| Plate art missing | Quote and generate before render |
