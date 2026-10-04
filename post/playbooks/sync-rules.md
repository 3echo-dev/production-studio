# Sync rules

For the sync stage. Owned by `audio-engineer`. The money shot: VO, BGM and SFX aligned to picture without the editor doing the mechanical work.

## Rules

1. **Refuse without a signed `bgm-choice.json`.** The hook enforces; the skill checks first.
2. **48kHz stereo output** for broadcast. Downstream can downsample; upstream cannot upsample.
3. **BGM ducks -12 dB under VO by default.** Configurable per project; recorded in `synced-track.json` as `duckDb`.
4. **VO placement comes from `vo-track.json`.** Sync never re-transcribes; it takes the placement as given.
5. **Attack 20ms, release 200ms** for the sidechain ducking, unless the project brief says otherwise.
6. **SFX are placed by `sfx-cues.json` if present,** otherwise omitted. Never guess SFX placement from the picture.
7. **Waveform PNG shows three lanes:** VO, BGM, SFX. Same colour rules across projects (VO: paper, BGM: amber, SFX: slate).
8. **`synced-track.json` binds to `rough-edl.json` by sha256.** A later EDL change invalidates the sync and reopens the row.
9. **Never modify `rough-edl.json`.** If the audio needs the picture to breathe more, note it and hand back to `sequence-director`.
10. **Duration match within one frame.** WAV length off from picture by more than one frame is a warning; the human decides.

## Checklist

- [ ] `bgm-choice.json` exists and is signed
- [ ] Output `synced-track.wav` at 48kHz stereo
- [ ] `duckDb` recorded in `synced-track.json` (0 is a value)
- [ ] Waveform PNG shows the same duration as the WAV
- [ ] EDL sha256 in `synced-track.json` matches disk
- [ ] No modification to `rough-edl.json`
- [ ] `synced-track.json` validates against `schemas/sync.schema.json`
