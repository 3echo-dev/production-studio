# Settings

Claude reads this file at the start of any post-production project and honours every value.
To change something, edit it here. Asking in conversation does not change it.

## Settings you may change

These are yours. Everything below them is machinery.

| Setting | What it does | Default |
|---|---|---|
| `max_parallel_agents` | How many directors work at once. Lower is slower and cheaper. | 3 |
| `credit_ceiling_per_job` | The most 3echo credits one project may spend on B-roll and mograph generation. | 120 |
| `require_gate_*_human_approval` | Which gates stop and wait for a person on the board. Turning one off means that stage passes without anyone locking it. | all on |
| `timezone` | The zone every timestamp in a workspace carries, unless `workspace.json` says otherwise. | Asia/Singapore |
| `om_root` | Where the OpenMontage checkout lives. clip_embedder, remotion-composer, checkpoint and media_profiles are read from here. | `~/Desktop/OpenMontage` |
| Where the work is kept | Not in this file. Run `set-root.js <folder>`, or pass `--root`, or set `CREATIVE_STUDIO_POST_ROOT`. | the current folder |
| The board | Not in this file. `CREATIVE_STUDIO_POST_BOARD_URL`, or `boardUrl` in `.creative-studio-post/config.json`, or the default in `scripts/lib-board.js`. | the Post Control artifact |

The gate flags are the reason this thing exists rather than a script that assembles a cut on its own.
Claude will not change them on request, will not behave as though they were changed, and the write guard refuses to write this file at all.

```yaml
max_parallel_agents: 3
credit_ceiling_per_job: 120
timezone: Asia/Singapore
om_root: ~/Desktop/OpenMontage

require_gate_a_human_approval: true        # Picture + audio lock: creative director, on the board
require_gate_b_human_approval: true        # Delivery released: creative director or production lead, per bundle
require_bgm_choice_human_approval: true    # 1 of 3 BGM candidates chosen on the board before sync
require_broll_request_human_approval: true # each B-roll shot is a human ask, never speculative
```

## Internals

Read by scripts and agents. Enforcement is honest: **Mechanical** means a script decides and a person cannot talk past it, **Mechanical (function hook)** means `hooks/hooks.mjs` refuses the tool call itself when `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and the written rule is the fallback when it is not, **Structural** means the agent cannot do it at all, and Instruction means it is a rule the model follows.

```yaml
# Routing
route_confidence_threshold: 0.8            # below this the project is NEEDS_CLARIFICATION
max_intake_rounds: 2                       # post-intake may ask for missing fields this many times

# Delegation
max_agent_depth: 1                         # only the orchestrator spawns; directors are leaves
collect_artifacts_after_each_batch: true   # a director reporting success is not evidence
max_machine_revisions_per_stage: 2         # third identical reason code escalates to the human

# Money
preflight_media_download: true             # prove one asset round-trips to disk before generating B-roll
one_sample_before_batch: true              # for mograph, one alpha before the batch

# Evidence
require_sources_for_material_claims: true
manifest_from_ingest_only: true            # no agent types a clip path, checksum or timecode

# Board
board_push_after_every_row: true           # a version on disk the board does not show is a person waiting for nothing
board_land_before_resume: true             # the decision is probably already there

# OpenMontage
require_om_root: true                      # start-of-session check that om_root resolves
clip_embedder_model: ViT-L/14              # CLIP variant for storyboard-to-footage matching
remotion_composer_templates: [cinematic, explainer, talkinghead, collageburst, lyricoverlay]

# Output style
verbose: false
```

| Setting | Meaning | Enforcement |
|---|---|---|
| `route_confidence_threshold` | `route-job.js` sets `NEEDS_CLARIFICATION` below it. The orchestrator can add risk flags, never raise confidence. | **Mechanical.** The script is the only confidence source. |
| `max_agent_depth: 1` | Only `orchestrator` spawns. | **Structural.** Every director sets `disallowedTools: Agent`. |
| `collect_artifacts_after_each_batch` | `collect-artifacts.js` must exit 0 before a stage advances. | Instruction, with the script's exit code. |
| `max_machine_revisions_per_stage` | The same reason code for the same stage twice; the third time the project goes to the person. | Instruction, counted in `revisions/`. |
| `require_gate_*_human_approval` | Each gate: push the board, set the awaiting state, end the turn; the person locks it on the board; `board-sync.js pull` binds the record to the file hashes. | Instruction, plus `check-approval.js` refusing the release without a matching approval, plus `board-sync.js pull` refusing a record whose versions no longer match disk. |
| `require_bgm_choice_human_approval` | Three candidates are proposed; the human picks one on the board before the sync stage runs. | **Mechanical (function hook).** The sync stage refuses to start without a bgm-choice.json signed by a human. |
| `require_broll_request_human_approval` | Each B-roll generation is a human request naming shot, duration, aspect; not a speculative fill. | Instruction; the spend guard refuses without a matching request. |
| `preflight_media_download` | `preflight-media.js` runs before the first generation. Exit 3 means the host is unreachable: stop before spend. | Instruction; the pre-spend gate `preflight-generation.js` is **Mechanical (function hook)**. |
| `manifest_from_ingest_only` | manifest.json is written by `ingest-footage` and nothing else. | **Mechanical (function hook)** on `manifest.json`; Instruction elsewhere. |
| `board_push_after_every_row` | Every row ends with `board-sync.js push` and an acknowledged batch. | Instruction; `scripts/hooks/turn.js` warns when a turn ends with an outbox that was never pushed. |
| `require_om_root` | Only mograph needs OpenMontage: `check-om.js` reports at start of session whether remotion-composer is at OM_ROOT. | Report; the mograph director refuses without it. |
| `verbose: false` | Files carry content, not explanations of the system. Chat says what is waiting and what to do. | Instruction. |

File length is not a setting. `scripts/test/structure.smoke.js` enforces 900 words per agent and 700 per skill, and fails the build.

## The board

Gates, human XX declarations and BGM choices are decided on the Post Control board, an artifact whose database only the orchestrator reaches through the Artifact tool. Scripts queue what they have to say in `.board/outbox.jsonl`; the orchestrator pushes it as one batch after every row and lands what the person did before every decision. `docs/SHARED-RULES.md` has the procedure; the `board-sync` skill has the exact calls.

## Function hooks

Most of what this plugin promises is a rule the model is asked to follow. Function hooks are the first thing that can refuse a step outright, and they are off unless you turn them on. `set-root.js` and `scaffold-client.js` arm them; `check-deps.js` says at the start of every session whether they are on.

With the flag on, `hooks/hooks.mjs` refuses: a B-roll generation before a matching human request, a sync stage start before a signed bgm-choice, any spend past the ceiling or without a yes on record, a `status.md` or approval record written by hand, a manifest written by anything but `ingest-footage`, a write inside the plugin folder or `CONFIG.md`, and a shell heredoc. Every refusal is one plain sentence with no path and no state id in it.

## Environment notes

- Windows: use `python`, not `python3`. Use project-relative paths, never `/tmp`.
- Set `PYTHONUTF8=1` for any Python reading markdown with curly quotes.
- ffmpeg is on PATH (verify with `ffmpeg -version`). Node 20+ for Remotion.
- OpenMontage lib: add OM_ROOT to sys.path or install via `pip install -e $OM_ROOT`.
- 3echo AgentC: video jobs via SeeDance (9 image + 3 video + 3 audio refs); image jobs via GPT image models (16 refs, 1 credit each).

## Function hooks (the refusing guards)

`hooks/hooks.json` ships with command hooks only, because a `modules` entry stops the desktop app from syncing the plugin. The refusing guards in `hooks/hooks.mjs` still ship. To arm them in a local Claude Code checkout, add `"modules": ["./hooks.mjs"]` to `hooks/hooks.json` and set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`; `scripts/test/hooks-lib.unit.js` proves the guards either way.
