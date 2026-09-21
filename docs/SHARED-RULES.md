# Shared rules

Everything under `plugins/creative-studio-post` obeys these. Playbooks add rules on top; nothing here is overridable by a skill or an agent.

## Files as state

The state of a job lives on disk, not in agent memory. If a stage claims completion, the artefact the stage produces must exist and validate against its schema, or the state has not advanced.

- One project per folder tree: `workspaces/{client}/{job-id}/`.
- Every stage writes one primary artefact: `manifest.json`, `rough-edl.json`, `bgm-options.json`, `bgm-choice.json`, `vo-track.json`, `synced-track.json`, `bundle/`, `approvals/gate-{a|b}.json`.
- Every write is atomic: write to `.tmp` then rename.
- Every file carries an `sha256` in the manifest that references it. A stage that reads an upstream file checks the hash matches; a mismatch is a hard stop.

## Human XX declarations

Nine things a human must declare or approve. The pipeline never fills an XX for you.

- Intake: aspect ratio, deliverable duration, audio-led flag, colour direction, reference cut (optional).
- Ingest: confirm clip and audio counts match the manifest.
- BGM: pick one of three candidates on the board.
- VO: confirm final VO takes vs scratch.
- B-roll: each request is a human ask, naming shot, duration, aspect.
- Mograph: confirm shot list before batch.
- Gate A: cut + audio lock.
- Gate B: delivery released.

A blank stays a question. Unknown is not not-applicable.

## OpenMontage boundary

We use OpenMontage as a library, not as a doctrine.

- `lib/clip_embedder.py` is imported by `sequence-first-cut`. The model is `ViT-L/14` unless CONFIG.md changes it.
- `remotion-composer/` is invoked by `mograph-generate`. Only the five shipping templates (cinematic, explainer, talkinghead, collageburst, lyricoverlay) are supported without extension.
- `lib/checkpoint.py` writes Gate A and Gate B records. The checkpoint schema is theirs; we validate against a copy under `schemas/`.
- `lib/media_profiles.py` is consulted by `ingest-footage` for codec presets.
- `lib/delivery_promise.py` is consulted by `export-premiere-bundle` to validate the bundle contract before Gate B.
- We do NOT call OpenMontage's executive-producer. Our orchestrator drives the workflow table.
- We do NOT lift the documentary-montage pipeline. Our sequence is storyboard-driven, not CLIP-thematic.
- We do NOT use OpenMontage's delivery renderer. Our output is FCPXML + bundle for Premiere, not a rendered MP4.

`om_root` in CONFIG.md points at the checkout. `check-om.js` fails start-of-session if the four modules and the composer are not there.

## Money

- 3echo credits are spent for B-roll generation (SeeDance jobs) and mograph plate art (GPT image jobs).
- Every generation is quoted before it fires. The quote is presented on the board and in chat. The spend guard refuses without an explicit yes.
- `credit_ceiling_per_job` in CONFIG.md is the hard cap. Over the ceiling the run stops and asks what to cut.
- For B-roll: one shot per human request; each is a separate quote.
- For mograph: one sample alpha per template variant; the batch waits on board approval.

## Board

- The board is the decision surface. Gates, BGM choices, B-roll requests and human confirmations happen there.
- Every row ends with `board-sync.js push`.
- Every gate begins with `board-sync.js pull` to land the decision before the next stage runs.
- A pulled record is bound to the file hashes of the artefacts it approves. A hash mismatch means the file changed after the decision — the record is refused; the run stops.

### Watching the board

The bell reaches only a session that watches the board with comment replies armed. Arming happens in two ways only: this session published the board (`board-setup`), or the person pasted the board's link in their own message. So the first step of every new project and every resume, before the first row runs:

1. `set-board.js --show` prints the address; pass it, and nothing else, to `ArtifactComments` with `action: "watch"`. This is the one tool besides `Artifact` and `ArtifactData` that receives the address.
2. `ArtifactComments` with `action: "watch"` and no `url` lists this session's watches. The board's row must say the watch is connected and auto-replies armed. Quote that line, without the address.
3. If the row is missing or not armed, say so once in plain words: "The board cannot wake this run. Either run board-setup from this session, or paste the board link here and I will watch it." Then carry on; every decision must be said in chat until it is armed. Never claim to be watching unless that listing said so.
4. When a decision does wake the run, land before acting: `board-sync.js land` first, then read what changed, then continue.

A subagent never holds a watch; the orchestrator does, in the main session, and a director never asks the board for anything itself.
## Delegation

- `orchestrator` is the only agent that spawns subagents.
- Every director sets `disallowedTools: Agent`.
- Directors read files, invoke skills, write files. They never approve anything.
- `review-director` runs the rubric and returns a verdict. It does not decide gates.

## Length and shape

- Agent files: under 900 words.
- Skill files: under 700 words.
- Frontmatter is strict-YAML safe (no tabs, no colons in unquoted values, no smart quotes).
- Every director names a playbook that exists.
- Every playbook ends with a checklist.

## Environment

- Windows-first. Use `python`, not `python3`. Set `PYTHONUTF8=1`.
- `ffmpeg` and `ffprobe` on PATH.
- Node 20+ for Remotion.
- OpenMontage checkout on disk, path in CONFIG.md `om_root`.
- Timezone: `Asia/Singapore` by default.
- Never write outside the workspace folder or into the plugin folder.
- No shell heredocs. Multi-line files go via the Write tool.
