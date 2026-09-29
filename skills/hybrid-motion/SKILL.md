---
name: hybrid-motion
description: >-
  Hybrid jobs, panels whose camera moves: motion transfer generated on 3echo AgentC. The plate is the video reference, the location's background the image reference, and the video model keeps the shot and replaces the surroundings; composite.py then lays the plate's own actor back on top. Every credit approved on the board first. Orchestrator only, after hybrid-plates and before hybrid-composite.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Hybrid motion transfer

A still background cannot follow a moving camera. Motion transfer asks the video model for the whole shot again, same camera move and timing, in the new place. The model redraws the person too, and on real talent that drifts (face retextured, small label text garbled; an internal test, 2026-09-28). So by default its clip is used only as a camera-tracked, relit background, and the performance in the cut is still the plate's own pixels.

## Inputs

- `job.json`: `hybrid.motionPanels` (`["P03"]`, usually the panels `scan-references.js` reports with a camera move), `hybrid.motion` (`resolution` "720p", `keepActor` true, `maxSec` 15), `hybrid.workspaceId`.
- `hybrid-brief.json` with cut-outs, and each motion panel's background ready (library or landed).
- `scripts/motion-transfer.js`, `scripts/preflight-generation.js --kind motion`, `scripts/composite.py`.
- AgentC MCP: `list_workspaces`, `upload_asset`, `estimate_video_job`, `create_video_job`, `wait_for_job`, `get_job_result`.

## Steps

1. **Brief.** `motion-transfer.js {client} {job-id} brief`. Per panel: the reference clip `footage/motion/ref/{panel}.mp4` (the plate from its start, at most 15 s, at most 720 px, silent), the prompt ([Video 1] the shot, keep the person, timing and camera move; [Image 1] the place and its light), the duration (4 to 15 s), ratio, resolution, `generateAudio` false and an idempotency key bound to the reference.
2. **Upload and quote.** Per panel: `upload_asset` the `refVideo` and the `backgroundFile`; `motion-transfer.js asset {panel} --video-id V --image-id I`. `estimate_video_job` with the prompt, ratio, resolution, duration, `generateAudio` false and `assetIds` [V, I] (video first, so the prompt's [Video 1] and [Image 1] line up); `motion-transfer.js quote {panel} --credits N`. A video reference adds about 20 credits (10 s at 720p was 57).
3. **Ask once.** `board-sync.js ask --item ingest --text "Motion transfer for {panels} (camera moves): M credits in all. The actor is pasted back from the plate." --options "Approve M credits|Decline"`; push; end the turn.
4. **Land the yes.** On the bell, `land`; `motion-transfer.js approve motion --by {who} --at {answeredAt} --credits M [--panels ...]`. The yes is bound to each panel's reference clip and background: a changed plate or background needs a new one.
5. **Generate.** Per panel in story order: `preflight-generation.js {client} {job-id} {panel} --kind motion` must exit 0; `create_video_job` with the quoted arguments and the idempotency key; `wait_for_job`; `get_job_result`; `motion-transfer.js land {panel} --url {media url} --job-ref {id} --credits N` in the same turn.
6. **Composite.** `python composite.py {client} {job-id}` (the hybrid-composite step). A motion panel uses its clip as the background, no brightness nudge, and pastes the cut-out back. It reports `actor kept` (97% or more) and `model drift` (`regenActorPct`, 75% or more): the model's person against the plate's. Low drift means the model moved or reshaped the person and a ghost can show round the pasted actor. Put the before/after on the board; a person decides.

## Rules

- Never `keepActor: false` on talent or product shots without the creative director asking for it on the board; then every such panel is `needs-review` and a person looks at the face and labels.
- One clip per panel, one approval for the set, never above the approved credits (the preflight adds what is already spent).
- The generated clip is an input, like a background: ingest skips `footage/motion/`; only `footage/composite/` is cut.
- Output is 24 fps; composite retimes it to the plate's rate and length.

## Output contract

`footage/motion/raw/{panel}.mp4` per motion panel, then `footage/composite/{panel}.mp4` with `actorPreservedPct` and `regenActorPct` in `hybrid-brief.json`.

## Failure modes

| Failure | Fix |
|---|---|
| Model drift under 75% | Before/after on the board; retry with a tighter `promptOverride` only after a new yes |
| Plate longer than 15 s | Only the first 15 s are transferred; split the plate into panels |
| Real-face filter refuses the video | Report verbatim; the panel falls back to a still background (remove it from `motionPanels`) |
| Media url expired before landing | `get_job_result` again in the same turn; never re-generate |
