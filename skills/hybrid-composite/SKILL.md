---
name: hybrid-composite
description: >-
  Hybrid jobs: a background for every location (the library's picture, or one generated on AgentC after a quote and a yes), the cut-out actor laid over it, brightness nudged towards the actor, plate sound kept, and a performance check that the actor's pixels are unchanged. Run by the composite-director after hybrid-plates.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Hybrid composite

## Inputs

- `hybrid-brief.json` with cut-outs; `job.json` (`hybrid.match`, `hybrid.workspaceId`).
- `scripts/hybrid.js`, `scripts/composite.py`, `scripts/preflight-generation.js --kind backgrounds`.
- AgentC MCP tools: `list_workspaces`, `upload_asset`, `create_image_job`, `wait_for_job`, `get_job_result`.

## Steps

1. **Quote.** For each background `to generate` (one per location, or one per panel with `hybrid.backgroundPer: "panel"`): 1 credit per image (flat). `hybrid.js quote {location} --credits 1`. Ask once for all of them: `board-sync.js ask --item ingest --text "Generate N background(s) for M credit(s): {locations}?" --options "Approve M credits|Decline"`; push; end the turn.
2. **Land the yes.** On the bell, `land`; `hybrid.js approve backgrounds --by {who} --at {answeredAt} --credits M`. `preflight-generation.js {client} {job-id} batch --kind backgrounds` must exit 0.
3. **Generate.** A background with no `continuityOf` first. Per background: `upload_asset` its storyboard frame (`referenceFrame`); for one with `continuityOf`, also the landed file of that background (same place and light); `create_image_job` with the brief's `prompt`, those assets, the ratio, and the `idempotencyKey`; `wait_for_job`; `get_job_result`; `hybrid.js land {location} --url {media url} --job-ref {id} --credits 1` in the same turn.
4. **Composite.** `python composite.py {client} {job-id}`. A motion-transfer panel (`hybrid-motion`) uses its generated clip as the background and also reports `model drift`. Per panel: background scaled to cover the plate's frame, brightness moved `match` of the way to the actor's (capped), cut-out on top, plate sound kept, `footage/composite/{panel}.mp4`, and the performance check on five frames. It names any panel still waiting.
5. **Check.** `actor kept` 97% or more passes; under it the panel is `needs-review`: put its before/after still on the board. Look at each before/after anyway: an edge, a shadow or a light direction that does not sit is a person's call.
6. **Record and ingest.** `record-version.js --item ingest --n 2 --status needs_review --preview {before/after}`; push. `ingest-footage.js` catalogues only the composites; the sequence row cuts by panel id.

## Rules

- One background per location, reused by every panel there; or, with `backgroundPer: "panel"`, one per panel from its own angle, generated against the location's first as the continuity reference (`land` refuses one before its reference).
- Letterbox bars stay black: the background fills the picture inside them.
- A changed cut-out or background makes a new composite; the old one is not patched.
- No credits without the yes; `land` and the preflight refuse.

## Output contract

`footage/composite/{panel}.mp4` for every plated panel, each with `actorPreservedPct` in `hybrid-brief.json`, and `manifest.json` from ingest.

## Boundary

Does not cut the actor out (hybrid-plates), does not cut the film (sequence), never redraws the actor.

## Failure modes

| Failure | Fix |
|---|---|
| Actor kept under 97% | Before/after on the board; usually a cut-out edge: back to hybrid-plates |
| Background too bright or dark | `--match 0.8`, or a better background; brightness is capped at ±0.15 |
| Camera moves in the plate | The still background will not track it: put the panel in `hybrid.motionPanels` and run `hybrid-motion` first |
| Media url expired before landing | `get_job_result` again in the same turn; never re-generate |
