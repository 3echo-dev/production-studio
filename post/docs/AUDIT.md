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

The first draft said the plugin would add five server-side tools to the AgentC MCP and would use third-party checkpoint and delivery-promise libraries. Neither is true of the build:

- No new server-side tools. Sequencing, the BGM shortlist, sync and export are local scripts; B-roll is the existing `create_video_job`. `docs/agentc-integration.md` has the mapping.
- Gate records are the plugin's own (`record-approval.js`, `board-sync.js pull`, `check-approval.js`). No outside checkpoint library is called.
- `build-bundle.js` checks the bundle against the Gate A hashes.
- No music service is wired. Suno, Musicbed and Artlist appear in the first draft as options; the client supplies the BGM files.

## Where the state lives

- The job folder under `workspaces/{client}/jobs/{job-id}/` is the truth: `job.json`, `route.json`, `plan.md`, `status.md`, `versions.jsonl`, `runs/`, `approvals/`, `bundle/`.
- The board mirrors it. Every write the scripts want on the board queues in `.board/outbox.jsonl` and is pushed as a batch; every decision a person makes there lands back through `board-sync.js land`.
- Money moves in one place: the orchestrator, after a quote on the board and a yes. The spend guard refuses otherwise.

## Buttons ring the chat: audit

The board is only useful if a person's click reaches a Claude chat without a prompt. The wiring is the same pattern the cs-pre-production board proved live on 21 Sep 2026.

**Wire-for-wire equivalents in `board/src/post-control.html`:**

| Building block | Line | What it does |
|---|---|---|
| `bellLog(why, outcome, detail)` | 484 | writes every attempt to `bells/{id}` and `meta/bell` |
| `consentForComments(why)` | 491 | calls `claude.use(''permissions'').request([''comments''])`; a denial toasts and returns false |
| `sendToClaude({anchor, text})` | 501 | fires the comment; anchor is the item card, text carries the "Land the board" order |
| `embedSource` / `buildDocument` | 480, 481 | pin the page''s own source so a republish never rings the bell falsely |
| Signal-pipeline button | 742 | manual ring; the same call the actions make |
| Copy-board-for-chat button | 613 | fallback for a chat that lost the connection |

**Every action rings the bell.** `signalPipeline(...)` is called by:

- Item approved (401), item N/A (403), change requested (413), gate locked (425)
- BGM chosen (432)
- B-roll requested (441), approved (446), declined (737)
- Mograph sample or alpha approved (454)
- Question answered (459)
- New project opened from the slate (468)

The Pre-prod board has the same coverage plus storyboard-specific rings (batch generate, sample approve, panel redo) that this plugin does not run.

**Prove-live test.** On the published Post Control artifact:

1. Open a Claude chat pointed at the artifact.
2. Press "Signal pipeline" in the council card, or lock Gate B on the rehearsal job.
3. A comment "Post board: Signal from {you}" (or "Gate B locked") should appear in the chat within a few seconds, prefixed with the board''s slate.
4. If nothing arrives, check the first-ever click of the session for a permissions prompt; a denial is the only silent-fail path. Read `bells/*` on the artifact database (`ArtifactData action:list collection:bells`) to see what the page tried.

If the prompt was denied, revoke and retry: browser tab -> artifact permissions -> clear -> reload -> click.

## Known gaps, in the order they should close

1. Prove the bell live on the Post board. Wired at parity with the Pre board (see "Buttons ring the chat" above); needs one recorded round trip on the published artifact.
2. Push the repo to the organisation (the org repo does not exist yet).
3. Run one real job end to end on client footage. `docs/materials-needed.md` lists what that needs.
