---
name: mograph-generate
description: >-
  Renders one mograph variant with the 3echo Motion composer bundled in the plugin. Sample-then-batch pattern. Alpha-channel ProRes 4444 MOV under bundle/mograph/, ready for Premiere overlay. Orchestrator only. Use at the mograph stage per human request.
metadata:
  version: 0.2.0
user-invocable: false
---

# Skill: Mograph generate

## Inputs

- `mograph-requests/{n}.json`: `template` (`title`, `endtag`, `captions`, `cinematic`, `explainer`, `talkinghead`, `collageburst`, `lyricoverlay`), `props`, `durationSec`, `aspectRatio`, `note`.
- `bundle/mograph/plates/` for any plate art already generated.
- The composer at `vendor/3echo-motion/composer`, installed by `scripts/mograph-setup.js`.

## Steps

1. `node scripts/mograph-setup.js --check`. Exit 1: ask once whether to run `mograph-setup.js` (one time, needs network, a few minutes, about 400 MB). No render until it prints `mograph ready`.
2. Validate `template` in supported list. Reject otherwise.
3. If template needs plate art missing on disk, quote a `create_image_job` (1 credit per image), present, wait for yes, land under `bundle/mograph/plates/`.
4. Sample render: `node scripts/mograph-render.js --request mograph-requests/{n}.json --out bundle/mograph/sample_{template}_{n}.mov --fps {jobFps} --width {w} --height {h}`.
5. The script writes `{out}.png` (middle frame) and `{out}.log`. Push the preview to the board. End the turn.
6. Next turn: `board-sync.js land`. If approved: batch (usually one variant, unless A/B). Land as `bundle/mograph/{template}_{nn}_{slug}_v{k}.mov`.
7. Update `mograph-requests/{n}.json`: `status: delivered`, `deliveredPath`.

## Rules

- Every render through `mograph-render.js`; never `npx remotion` directly (a missing package or an unnamed composition turns into a question nobody answers, and the render sits idle).
- Overlays carry alpha; the script checks it.
- Templates outside the eight refused.
- Never bake a background into an alpha export.

## Output contract

`bundle/mograph/{template}_{nn}_{slug}_v{k}.mov` with alpha. Sample preserved as `sample_*`.

## Boundary

Does not edit the composition code (a change is its own plugin change, `docs/motion-composer.md`). Does not composite; the editor overlays.

## Failure modes

| Failure | Fix |
|---|---|
| `mograph-render.js` exit 2 | Not set up or bad request: the message names which. Run `mograph-setup.js` or fix the request |
| `mograph-render.js` exit 1 | Report the last log lines verbatim, once. Offer setup again or a plain ffmpeg text overlay; no second background render |
| Title breaks mid-word on vertical | Split into `title` + `subtitle`, or use `endtag` |
| Plate art missing | Quote and generate before render |
