---
name: audio-sync
description: >-
  Aligns VO, BGM and SFX against the picture cut. Renders bundle/audio/synced-track.wav at 48kHz stereo and a waveform PNG. Refuses to start without a signed bgm-choice.json. Use at the sync stage.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Audio sync

## Inputs

- `job.json` for `audioLed`.
- `manifest.json` for audio kinds.
- `rough-edl.json` for total picture duration.
- `vo-track.json` for line start/end.
- `bgm-choice.json` (MUST exist and be signed; hook refuses without it).
- The BGM file at `bgm-choice.choicePath` (downloaded from source if needed).

## Steps

1. Read `bgm-choice.json`. If missing or unsigned, stop with a plain sentence.
2. Compute total picture duration from `rough-edl.json`.
3. Build ffmpeg graph:
   - Input 1: VO segments concatenated per `vo-track.json` timing.
   - Input 2: BGM file, trimmed to picture duration, ducked -12 dB under VO (from `sync-rules`).
   - Input 3: SFX from manifest, placed per `sfx-cues.json` if present.
4. `ffmpeg -i vo.wav -i bgm.wav -i sfx.wav -filter_complex "sidechaincompress ..." -ac 2 -ar 48000 bundle/audio/synced-track.wav`.
5. Render waveform: three-lane PNG showing VO, BGM, SFX levels over time (via ffmpeg `showwavespic` per input, composed).
6. Write `synced-track.json` against `schemas/sync.schema.json` with sha256 of the WAV and of the referenced EDL.
7. Render the audio preview: `render-preview.js {client} {job-id} --stage sync` muxes the mix onto the same picture as the silent cut preview, `previews/sync-v{n}.mp4` plus a filmstrip. Upload it to the board asset store and attach it with `set-preview.js --item sync`; Gate A is locked against this preview, not the waveform alone.

## Rules

- Refuse without a signed BGM choice.
- Never modify `rough-edl.json`.
- Ducking amount is recorded; `duckDb: 0` is a value, not an absence.
- 48kHz stereo minimum for broadcast.

## Output contract

`bundle/audio/synced-track.wav`, `bundle/audio/waveform.png`, `synced-track.json` (sha256-bound to EDL), `previews/sync-v{n}.mp4` playing on the Audio sync card.

## Boundary

Does not touch picture; does not render a preview MP4.

## Failure modes

| Failure | Fix |
|---|---|
| BGM file not on disk | Fetch from source; stop if source unreachable |
| ffmpeg filter graph fails | Report the error verbatim; check codec compatibility |
| WAV duration off from picture by more than 1 frame | Warn; the human decides |
