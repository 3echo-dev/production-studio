---
name: vo-drop-in
description: >-
  Places VO tracks against script markers on the timeline. For each VO take in the manifest, matches to a script line by transcription (whisper if local) or by ordered line index; writes vo-track.json. Use at the vo-drop stage.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: VO drop-in

## Inputs

- `job.json` for `deliverableDurationSec`, `audioLed`.
- `manifest.json` for VO takes (`kind: vo`).
- `rough-edl.json` for picture cut duration.
- Pre-prod `script.md` for numbered VO markers.

## Steps

1. Enumerate VO takes from manifest.
2. If a local whisper is available, transcribe each take. Otherwise, use ordered take index to script line.
3. Match transcribed text (or ordered index) to script markers. Confidence threshold 0.6 for text match.
4. Assign a start time to each line based on the corresponding picture cut in `rough-edl.json`.
5. Compute end time from take duration.
6. Write `vo-track.json` under the job folder, referencing take `sha256`.
7. Report count placed, count unmatched. Unmatched lines wait on the human.

## Rules

- Never invent a placement time; every line references a picture cut or is unmatched.
- Never edit the VO WAV; alignment is metadata only.
- Never proceed past a script marker with no take.

## Output contract

`vo-track.json` with per-line start, end, and sha256-bound take reference.

## Boundary

Does not mix (that is `audio-sync`), does not ADR-fix (a human's job), does not select a take when multiple exist without a human pick.

## Failure modes

| Failure | Fix |
|---|---|
| Multiple takes per line | Present on board, ask for a pick |
| Transcription confidence low | Fall back to ordered index; warn |
| A line has no take | Park; the human records or an ElevenLabs scratch is a separate skill |
