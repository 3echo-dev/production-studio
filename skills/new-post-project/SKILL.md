---
name: new-post-project
description: >-
  Creates a project.json for a new post-production job by validating the pre-prod release package plus the shoot Drive folder plus the human XX declarations. Emits workspaces/{client}/jobs/{job-id}/job.json. Use at intake, once per job.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: New post project

## Inputs

- `--client {slug}`, `--title "..."`.
- `--drive-folder {path}` — shoot output with `footage/` and optional `audio/` subtrees.
- `--pre-release {path}` — pre-prod release package (script.md, storyboard.json, concept-breakdown.xlsx, call-sheet-day-*.pdf or .xlsx, storyboard/v{n}/P*.png).
- Human XX: `--aspect-ratio`, `--deliverable-duration-sec`, `--audio-led`, optional `--reference-cut-path`, optional `--colour-direction`.

## Steps

0. Opened on the slate: the bell carries client, title, footage folder, release folder, aspect ratio, duration, who leads and where the footage comes from (shot rushes, or generated per panel: `footageSource`). Take them as answers already given. Scaffold the client with `scaffold-client.js` if `workspaces/{client}/workspace.json` is missing.
1. `scaffold-job.js {client} {slug} "{title}"` writes the folder, `status.md` and a `job.json` whose declarations are null; the id is `job-{YYYYMMDD}-{HHMM}-{slug}`.
2. Validate `--pre-release` contains every required file. Missing = hard stop.
3. The release hash is the router's: `route-job.js` computes it over the required files and writes it into `job.json`.
4. Validate `--drive-folder` exists and has at least one clip in `footage/`. A generated job (`footageSource: generated`) needs only the folder: the generate stage fills `footage/generated/`, and the release needs no call sheets.
5. If any XX flag is unset, park at `needs_input` and ask on the board via `board-sync.js ask`.
6. Fill `templates/job.json` with the values. Validate against `schemas/job.schema.json`.
7. Write `workspaces/{client}/jobs/{job-id}/job.json`.
8. `route-job.js {job.json}` (exit 3 names what is still missing; it computes and binds `prePipelineReleaseHash`), then `plan-job.js`, `board-sync.js open` and push. Opened on the slate: `board-sync.js adopt {client} {job-id} --from {slate id}`, push.
9. Report the path, the release hash, and any open XX. Nothing else.

## Rules

- Never guess an aspect ratio or duration from the storyboard.
- Never modify anything under `--pre-release`.
- Never write past a validation failure.

## Output contract

`workspaces/{client}/jobs/{job-id}/job.json` valid against schema.

## Boundary

Does not open the board (that is `board-sync.js open`), does not walk the workflow (that is the orchestrator), does not ingest footage (that is `ingest-footage`).

## Failure modes

| Failure | Fix |
|---|---|
| Missing script.md, storyboard.json, breakdown or call sheet | Stop; the pre-prod job is not yet released |
| `--drive-folder` empty | Stop; the shoot has not been ingested to Drive yet |
| XX flag invalid enum | Ask again with the enum values from the schema |
