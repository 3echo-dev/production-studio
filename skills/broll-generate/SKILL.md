---
name: broll-generate
description: >-
  Handles one B-roll request. Quotes credits, waits for board yes, calls render_broll_variant on the 3echo AgentC MCP (SeeDance), lands the MP4 with a slate frame under bundle/broll/. Orchestrator only. Use at the B-roll stage per human request.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: B-roll generate

## Inputs

- `broll-requests/{n}.json` from the human on the board: `shot`, `durationSec`, `aspectRatio`, `referenceAssetIds`, `note`.
- `job.json` for `aspectRatio` default.
- `preflight-generation.js {client} {job-id} {n}` — exit 0 is the only permission to quote.

## Steps

1. Preflight. Exit 3 = no request. Exit 1 = fault. Exit 0 = quote.
2. Quote: 1 SeeDance video job at `durationSec`. Say assumptions in one line (aspect, refs, ceiling). `board-sync.js ask --item broll-{n}`. Wait for explicit yes; the spend guard refuses without it.
3. `list_workspaces` for id + balance. `check-3echo.js --credits {balance}`.
4. For each named `referenceAssetIds` not already in the workspace: `upload_asset` or `import_asset_from_url`. Record ids.
5. `create_video_job` via `render_broll_variant` with `{ prompt, aspectRatio, durationSec, imageRefs (≤9), videoRefs (≤3), audioRefs (≤3), idempotencyKey: "{jobId}/broll/{n}" }`. `wait_for_job`, `get_job_result`.
6. `fetch_asset_bytes` `variant: "hd"` piped to `save-asset-bytes.py bundle/broll/shot-{nn}_{slug}_v{k}.mp4`. Validate opens with Pillow (frame extract): short side ≥ 480px.
7. Extract first frame: `ffmpeg -i clip.mp4 -frames:v 1 bundle/broll/slates/shot-{nn}_v{k}.png`.
8. Update `broll-requests/{n}.json` with `status: delivered`, `deliveredPath`, `credits`.

## Rules

- No spend without a yes on record.
- One request = one MP4 = one slate.
- Redo is a new request with `supersedes: {n}`; originals stay on disk.
- Never splice into `rough-edl.json`.

## Output contract

`bundle/broll/shot-{nn}_{slug}_v{k}.mp4`, `bundle/broll/slates/shot-{nn}_v{k}.png`. Request updated.

## Boundary

Does not choose shots; the human names each. Does not composite into the timeline.

## Failure modes

| Failure | Fix |
|---|---|
| Preflight exit 3 | No request on disk; ask on the board first |
| SeeDance rejects prompt | Report verbatim; ask for a reworded shot |
| Refs over the 9/3/3 limit | Trim to closest; ask which to drop |
