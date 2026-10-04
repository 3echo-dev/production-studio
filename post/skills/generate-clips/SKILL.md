---
name: generate-clips
description: >-
  Generate stage of a job with footageSource "generated" (a microdrama): one AI clip per storyboard panel through the 3echo AgentC video model, sample first then batch, every credit approved on the board before it is spent. Clips land under footage/generated for ingest and the panel-id first cut. Orchestrator only.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Generate clips

## Inputs

- `job.json` with `footageSource: "generated"`, `aspectRatio`, `deliverableDurationSec`, and `generation` (`clipSec` used per panel, `headroomSec` (default 2), `headSec` (default 0.5), `resolution`, `generateAudio`, `workspaceId`). The model is asked for `useSec + headroomSec` (cap 15 s); the cut uses `useSec` from `inSec`. Quotes are on the asked length.
- The pre-prod release: `storyboard.json` (panel order, captions, per-panel `durationSec` when given), `storyboard/v{n}/P*.png` (the reference image per panel), `script.md`.
- `scripts/generate-clips.js`, `scripts/preflight-generation.js --kind generate`.
- The AgentC MCP tools: `list_workspaces`, `upload_asset`, `estimate_video_job`, `create_video_job`, `wait_for_job`, `get_job_result`.

## Steps

1. **Brief.** `generate-clips.js {client} {job-id} brief` writes `generation-brief.json`: per panel a prompt (caption plus script line), `refs` (the storyboard frame, then the library's characters, location, wardrobe, props and motion for it) named in the prompt ([Image 2] is MAYA), the duration 4 to 15 s, the ratio and an idempotency key `{job-id}/generate/{panel}`. A clip already in `footage/generated/` is `provided`: used as it is, never charged. Record it as ingest v1 (`record-version.js --item ingest --status needs_input`).
2. **Quote the sample.** `list_workspaces` for the workspace id and balance. `generate-clips.js refs {first pending panel}` lists `toUpload`; upload each once (`upload_asset`) and record it with `asset {file} --id {assetId}`. `refs` then returns `assetIds` in prompt order. `estimate_video_job` with that panel's prompt, ratio, duration, `generateAudio` and those asset ids; `generate-clips.js quote {panel} --credits N`. Multiply by the pending panel count for the batch figure (provided panels cost nothing).
3. **Ask.** First the reference set: put `refset` on the board; a yes is `approve refs` (fingerprinted; a swapped file voids it; a name clash blocks it). Then `board-sync.js ask --item ingest --text "Generate the sample clip for P01 for N credits (the batch of K is about M)?" --options "Approve N credits|Decline"`; push; end the turn. Nothing is spent yet.
4. **Land the yes.** On the bell, `land`; the answer is in `.board/inbox.jsonl`. `generate-clips.js approve sample --by {who} --at {answeredAt} --credits N`. Then `preflight-generation.js {client} {job-id} sample --kind generate` must exit 0.
5. **Generate the sample.** `create_video_job` with the estimate's arguments and the panel's idempotency key; `wait_for_job`; `get_job_result`; `generate-clips.js land P01 --url {media url} --job-ref {job id} --credits N` in the same turn (the url is short-lived). Attach a frame to the Ingest card. Ask on the board: "Sample P01 approved? Generate the remaining K-1 clips for M credits" with options; push; end the turn.
6. **Batch.** On the yes: `approve batch --credits M`, `preflight ... batch`, then per pending panel in story order: `refs`, upload what `toUpload` lists and record it with `asset`, `create_video_job` with the panel's `assetIds`, `wait_for_job`, `get_job_result`, `land`. A failed job is reported verbatim; its panel stays pending.
7. **Ingest.** `ingest-footage.js` catalogues `footage/generated/*.mp4` like rushes (day parked as null is expected). Record ingest v2, push. The sequence row then runs `sequence-first-cut.py --by-panel`.

## Rules

- No credits without a yes on record for that scope; the guard reads `generation-brief.json`, not the chat.
- Sample before batch, always; a change to the prompt style after the sample is a new brief and a new sample.
- One panel, one clip, one file named after the panel. A redo overwrites only after the person asks on the board.
- Never alter the storyboard order; never invent a panel.
- `generateAudio` stays false unless the job says otherwise: VO and music come from the audio stages.

## Output contract

`generation-brief.json` with every panel `delivered`, `footage/generated/P*.mp4` one per panel, `manifest.json` from ingest.

## Boundary

Does not cut (sequence), does not mix, does not choose prompts beyond the storyboard and script; a person edits `promptOverride` on the board or in chat when a prompt is wrong.

## Failure modes

| Failure | Fix |
|---|---|
| Reference panel missing | `brief` names it; the release is incomplete, back to intake |
| Estimate above the approved figure | The guard refuses; ask again with the new figure |
| Provider rejects a prompt | Report verbatim; set `promptOverride` for that panel and rerun that one |
| Media url expired before landing | `get_job_result` again in the same turn; never re-generate |
| Balance short of the batch | Say the shortfall; generate in story order up to the balance only after a yes for that smaller number |