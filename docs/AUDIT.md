# Audit guide

For whoever reviews this plugin without having built it. Everything here is checkable from the repo; nothing relies on a claim in chat.

## Read in this order

1. `docs/Post-production.html` (also published as the blueprint page): what the pipeline is, the twelve states, the two gates, and section 07, built versus proven.
2. `workflows/post.md`: the executable state table the planner reads. Twelve rows, two gate rows.
3. `CONFIG.md`: the settings a person may change, and how each rule is enforced (mechanical, structural, or an instruction the model follows).
4. `docs/SHARED-RULES.md`: the rules every agent and skill obeys.
5. `GATES.md`: fifteen gates, each with the command that checks it and the date it last passed.
6. `agents/orchestrator.md`: the one agent that walks the table, spends credits, and stops at gates.

## Run the evidence

```
node scripts/test/run-all.js
```

Fifteen test files, all green on 21 Sep 2026. `scripts/test/runtime.e2e.js` is the one to read first: it drives every runtime script on a temporary root, from set-root to a built bundle, and proves a file changed after a lock is refused.

## What is built, what is proven, what is not

| Component | Built | Proven by | Not yet |
|---|---|---|---|
| Post Control board | page, private artifact, database, self-republish, two-mode board-sync | live database writes and read-back; landing and hash-bound pull on a fixture | a board decision waking the run, live |
| Runtime scripts (22) | root, scaffold, route, plan, state, versions, runs, approvals, collect, check, bundle | `runtime.e2e.js` | a live orchestrator walk of a real job |
| Ingest | ffprobe manifest with hashes | live on 3 generated clips; refusals in `checks.e2e.js` | real camera masters |
| Sequence (CLIP) | skill, playbook; open_clip installed | import only | matching on real footage |
| BGM | three candidates, signed pick, sync guard | fixture | no music service wired; client supplies files |
| VO drop and sync | skills, EDL-bound contract | `gate-a-check` on a fixture | a real VO track through ffmpeg |
| Review pass | rubric, scoring | presence and depth | a reviewer run on a real cut |
| B-roll | request, quote, approve, spend guard, `create_video_job` | `preflight.e2e.js` | no video job submitted (credits) |
| Motion graphics | sample-then-batch; Remotion deps installed | one GPT plate landed live (1 credit) | a Remotion alpha render |
| FCPXML bundle | `build-fcpxml.py`, `build-bundle.js` | `build-fcpxml.smoke.js`, `runtime.e2e.js` | opened in Premiere by an editor |
| Function hooks | five refusing guards | `hooks-lib.unit.js` | off unless armed |

## Claims retired on 21 Sep 2026

The first draft said the plugin would add five server-side tools to the AgentC MCP and would use OpenMontage's checkpoint and delivery-promise libraries. Neither is true of the build:

- No new server-side tools. Sequencing, the BGM shortlist, sync and export are local scripts; B-roll is the existing `create_video_job`. `docs/agentc-integration.md` has the mapping.
- Gate records are the plugin's own (`record-approval.js`, `board-sync.js pull`, `check-approval.js`). OpenMontage `lib/checkpoint.py` is checked present and not called.
- OpenMontage `delivery_promise` is a promise classifier, not a bundle validator. `build-bundle.js` checks the bundle against the Gate A hashes.
- No music service is wired. Suno, Musicbed and Artlist appear in the first draft as options; the client supplies the BGM files.

## Where the state lives

- The job folder under `workspaces/{client}/jobs/{job-id}/` is the truth: `job.json`, `route.json`, `plan.md`, `status.md`, `versions.jsonl`, `runs/`, `approvals/`, `bundle/`.
- The board mirrors it. Every write the scripts want on the board queues in `.board/outbox.jsonl` and is pushed as a batch; every decision a person makes there lands back through `board-sync.js land`.
- Money moves in one place: the orchestrator, after a quote on the board and a yes. The spend guard refuses otherwise.

## Known gaps, in the order they should close

1. Prove the bell: a decision on the board should wake the run without a chat prompt.
2. Push the repo to the organisation (the org repo does not exist yet).
3. Run one real job end to end on client footage. `docs/materials-needed.md` lists what that needs.