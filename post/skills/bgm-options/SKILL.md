---
name: bgm-options
description: >-
  Reads script tone and storyboard beats, shortlists three BGM candidates locally from the supplied tracks (no MCP tool) with tempo, mood and licensing metadata, writes bgm-options.json, presents on the board for a human pick. Use at the BGM stage.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: BGM options

## Inputs

- `job.json` for `deliverableDurationSec`, `audioLed`.
- Pre-prod `script.md`.
- Pre-prod `storyboard.json`.
- `rough-edl.json` for total duration.

## Steps

1. Read the script; extract 3-6 tone words and an energy curve (`build`, `flat`, `peak-mid`, `peak-end`, `release`). Note any reference track the script names.
2. Build the shortlist locally (no MCP tool) from `{ toneWords, energyCurve, targetBpm?, durationSec, licensing: 'royalty-free' }` by default.
3. Receive three candidates. Validate against `schemas/bgm-option.schema.json`.
4. Write `bgm-options.json`.
5. Push to board: three cards (title, artist, tempo, key, mood tags, licensing, preview URL, one-line rationale).
6. End the turn. The human picks on the board.
7. Next turn: `board-sync.js land`. Write `bgm-choice.json` referencing the picked `id`, with `signedBy` and `signedAt`.

## Rules

- Exactly three candidates.
- Never pick yourself.
- Each candidate names licensing plainly; unclear licensing is dropped and re-quoted.

## Output contract

`bgm-options.json` (3 candidates, valid schema). `bgm-choice.json` (signed, one candidate id) after the board reply.

## Boundary

Does not sync (that is `audio-sync`), does not download the picked track (the sync skill does).

## Failure modes

| Failure | Fix |
|---|---|
| MCP returns fewer than 3 | Retry once; then ask the person for a manual pick from a library |
| A candidate previewUrl is 404 | Drop and requote |
| Script has no discernible tone | Ask on the board |
