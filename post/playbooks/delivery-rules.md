# Delivery rules

For the package stage. Owned by `premiere-packager`. FCPXML + bundle folder tree the editor imports in one step.

## Rules

1. **FCPXML is the only accepted primary format.** The hook refuses AAF, EDL and OMF as primary. EDL exports on request as a fallback.
2. **FCPXML 1.10.** Older versions lose gain metadata on Premiere import.
3. **Every path in FCPXML is relative to `bundle/`.** Absolute paths break when the bundle is moved.
4. **Every referenced file must exist under `bundle/`.** A missing file is a hard stop; do not stub.
5. **V1: picture cuts** from `rough-edl.json`, in order, referencing `bundle/footage/*.mov`.
6. **A1, A2, A3: VO, BGM, SFX** from `synced-track.json`. Gain adjustments baked as clip levels; the editor can still ride.
7. **V2: mograph parked at time** if `mograph-requests/{n}.json` specifies; otherwise floating in a bin.
8. **B-roll in a bin, not on V1.** The editor drags B-roll onto the timeline as needed.
9. **Colour direction is a note, not a LUT applied.** Editor's colour session is a separate pass.
10. **`build-bundle.js` must exit 0** before Gate B is asked. Any failure is a hard stop with the reason printed.
11. **`bundle/README.md` names what the editor picks up:** timeline structure, unmatched panels, mograph placement notes, colour direction, any known gaps.
12. **`bundle/.pipeline/manifest.json`** carries the full sha256 index for the Gate B hash-binding.
13. **Nothing outside `bundle/`.** A relative path escape (`../`) is a hard stop.

## Checklist

- [ ] `bundle/project.fcpxml` present, valid XML, FCPXML 1.10
- [ ] Every path in FCPXML is relative and resolves under `bundle/`
- [ ] Every clip on V1 references a file under `bundle/footage/`
- [ ] A1, A2, A3 populated from `synced-track.json`
- [ ] Mograph on V2 or in bin per requests
- [ ] B-roll in bin, not on V1
- [ ] `bundle/README.md` written with all four required sections
- [ ] `bundle/.pipeline/manifest.json` has sha256 for every file in bundle
- [ ] `build-bundle.js` exit 0
