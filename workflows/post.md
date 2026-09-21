# Workflow: post-production pipeline

One workflow. Twelve states. Two gates. Seven director agents.

Read left to right. `State after` is the next state on a clean pass. `Rollback to` is where an XX (human hold) or a failed review sends us. Picture and audio lock together at Gate A — in agency post they go to the client in the same review, so one gate carries both.

| # | State | Director agent | Skill invoked | Playbook | Human required | Output artefact | State after | Rollback to |
|---|-------|----------------|---------------|----------|----------------|-----------------|-------------|-------------|
| 1 | intake | post-intake-director | new-post-project | intake-rules | XX Drive folder, pre-prod release path, aspect ratio, duration, audio-led flag | project.json | 2 | 1 |
| 2 | ingest | ingest-director | ingest-footage | ingest-rules | XX confirm footage + audio file counts | manifest.json (clips, audio, checksums) | 3 | 2 |
| 3 | sequence | sequence-director | sequence-first-cut | cut-rules | - | rough-edl.json, timeline.png | 4 | 3 |
| 4 | bgm | bgm-supervisor | bgm-options | bgm-rules | XX pick 1 of 3 | bgm-choice.json | 5 | 4 |
| 5 | vo-drop | audio-engineer | vo-drop-in | sync-rules | XX confirm VO takes | vo-track.json | 6 | 5 |
| 6 | sync | audio-engineer | audio-sync | sync-rules | - | synced-track.wav, synced-track.json, waveform.png | 7 | 6 |
| 7 | cut-audio-review | review-director | review-pass | review-rubrics | XX approve/reject combined picture+audio | validation/review-a-{round}.md | 8 | 3 |
| 8 | GATE A picture+audio lock | orchestrator | board-sync | - | XX board approval | approvals/gate-a.json (hash-bound) | 9 | 7 |
| 9 | broll | broll-director | broll-generate | broll-rules | XX request shots (on-demand, one per request) | bundle/broll/*.mp4 | 10 | 9 |
| 10 | mograph | mograph-director | mograph-generate | mograph-rules | XX confirm template + variants | bundle/mograph/*.mov (alpha) | 11 | 10 |
| 11 | package | premiere-packager | export-premiere-bundle | delivery-rules | - | bundle/project.fcpxml, bundle/README.md | 12 | 11 |
| 12 | GATE B delivery released | orchestrator | board-sync | - | XX editor handoff acknowledged | approvals/gate-b.json (hash-bound) | done | 11 |

## State machine invariants

- Every `State after` and `Rollback to` value points at a real state in this table.
- Every gate (`GATE A`, `GATE B`) is a state on its own row.
- Gate A is preceded by the combined cut+audio review row.
- Gate B has no review row — delivery is a mechanical `delivery_promise.validate('bundle')` check plus the human's release call.
- No stage runs without the prior stage's output artefact on disk. The orchestrator reads the artefact set to decide the next state.
- Human holds (`XX`) block the orchestrator until the item lands on the Post Control board.

## Inputs from pre-prod

The intake state expects the pre-prod release package at a known path:

- `script.md` — final approved script
- `storyboard.json` — the panel table with frame references
- `concept-breakdown.xlsx` — the line items
- `call-sheet-day-*.pdf` — one per shoot day
- `storyboard/v{n}/P*.png` — the visual panels used for CLIP retrieval

If any of these are missing, intake refuses with a clear message and does not advance.

## Handoff to editor

Gate B release payload:

- `bundle/project.fcpxml` — Premiere-importable timeline
- `bundle/footage/` — selected takes, transcoded to editing proxies where the codec needed it
- `bundle/audio/synced-track.wav` — synced VO + BGM + SFX
- `bundle/broll/` — on-demand generated clips with a slate frame each
- `bundle/mograph/` — alpha-channel overlays (ProRes 4444)
- `bundle/README.md` — what the editor picks up on the timeline, what is in the bins, unmatched panels, colour direction
- `bundle/.pipeline/manifest.json` — sha256 index for the Gate B hash-binding

## Notes for the review pass

- Cut+audio review (state 7) checks: shot order matches storyboard, best takes selected, no orphan clips, VO in sync with picture, BGM level ducked under VO, EDL sha256 bound to synced track.
- Gate B has no review — `delivery_promise.validate('bundle')` is the mechanical check, and the human's editor-handoff acknowledgement is the sign-off.
