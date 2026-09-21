# Mograph rules

For the mograph stage. Owned by `mograph-director`. Alpha-channel overlays for Premiere; sample-then-batch; templates from OpenMontage's `remotion-composer`.

## Rules

1. **Templates are the five that ship with `remotion-composer`:** `cinematic`, `explainer`, `talkinghead`, `collageburst`, `lyricoverlay`. A request naming any other template is refused.
2. **Alpha channel is mandatory.** `--pixelFormat=argb` in the render. A rendered background is a bug.
3. **ProRes 4444 codec.** `--codec=prores`. Any other codec breaks the Premiere overlay flow.
4. **Frame rate matches `job.json` fps** unless the request says otherwise. Off-fps mograph is a sync headache for the editor.
5. **Sample-then-batch.** One sample render, board approval, then the batch. Usually the batch is one variant; a request may ask for A/B (two variants max).
6. **Plate art is a separate quote.** If the template needs a logo or hero image and it's not on disk, `create_image_job` for one plate with its own board yes.
7. **Props schema is the template's own.** Reject a request whose props don't match; point at the template's schema file in `$OM_ROOT/remotion-composer/src/{template}/props.ts`.
8. **Duration is the request's, not the template's default.** Override with `--durationInFrames = fps × durationSec`.
9. **File naming:** `bundle/mograph/{template}_{nn}_{slug}_v{k}.mov`; samples as `sample_{template}_{n}.mov`.
10. **Never edit template code.** A needed change goes upstream to OpenMontage; we bump `docs/om-lockfile.txt` after.
11. **Editor places mograph in Premiere.** Time-parking metadata in `mograph-requests/{n}.json` is a hint, not an auto-splice.

## Checklist

- [ ] Template in supported list
- [ ] Props validate against template schema
- [ ] Plate art quoted, approved and landed before render
- [ ] Sample rendered first; board approval on record
- [ ] `--pixelFormat=argb` and `--codec=prores` in the command
- [ ] Frame rate matches `job.json` fps
- [ ] File named per convention with `v{k}` version
- [ ] `mograph-requests/{n}.json` updated with `status: delivered`
