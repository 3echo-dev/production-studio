# creative-studio-post

Sibling to `creative-studio-pipeline`. Where the pre-prod plugin turns a brief into a release package (script, storyboard, concept breakdown, call sheets), this one turns the **shoot output** into a Premiere-ready first cut.

## What it does

Given the pre-prod release package + a Drive folder of shot footage and audio files, the post-prod orchestrator walks a twelve-state pipeline (two of the states are the gates) that ends with an FCPXML bundle the editor drops straight into Premiere Pro.

Six stages, in JGN's whiteboard order:

1. **Sequence -> first cut.** Frame-match the storyboard against the ingested footage. Pick best takes. Emit a rough EDL.
2. **BGM options.** Suggest three tracks informed by script tone and storyboard beats. Human picks one.
3. **Voiceover drop-in.** Place VO on the timeline against script markers.
4. **Audio syncing.** ffmpeg aligns VO, BGM and SFX against the picture cut. The "money shot."
5. **B-roll generation.** On-demand: editor types a shot ("two seconds, walking on road") and gets a variant saved to the project folder. Not auto-spliced.
6. **Motion graphics.** Infographic lower thirds and mograph number reveals as alpha exports.

## Handoff shape

The plugin **does not** render a final master. It delivers **assets to a folder + one FCPXML** so the editor opens Premiere Pro and finishes the pass with the automated legwork already done. Target: reach 70-80% of a first cut in one day.

## Setting up a machine

Every session starts with a one-line check of this machine (`scripts/check-deps.js`). It names anything missing and what it is needed for. For the full list with install commands, run:

```
node scripts/check-deps.js --setup
```

| Item | Needed | For |
|---|---|---|
| ffmpeg (with ffprobe), node, python 3, Pillow | required | every job |
| mograph setup (`node scripts/mograph-setup.js`, once; the 3echo Motion composer ships in the plugin) | optional | titles, end tags, captions |
| numpy, torch, transformers | optional | shoot jobs, the same picture matching |
| rembg (`pip install "rembg[cpu]"`; downloads a 176 MB model on first use) | optional | hybrid jobs, only for actors shot without a green or blue screen |

Nothing is installed by the plugin. A stage that needs a missing optional item stops with a plain message; the rest of the pipeline runs. Works on Windows and macOS (`python` falls back to `python3`). rembg runs on the CPU anywhere, about 30 s for 2 s of 480p footage; `rembg[gpu]` in its own environment is faster on an NVIDIA card.

To try the hybrid route (real actors, new backgrounds) end to end: `docs/try-the-hybrid-route.md`.

## MCP dependency

Same AgentC server as pre-prod; no new server-side tools. The pipeline uses the existing `create_video_job` (SeeDance, B-roll), `create_image_job` (GPT image, mograph plates), `upload_asset`, `wait_for_job`, `get_job_result` and `fetch_asset_bytes`. Sequencing, BGM shortlisting, audio sync and the FCPXML export are local scripts (`docs/agentc-integration.md`, `docs/motion-composer.md`).

## Human gates

Two, because in agency post the picture and the audio go to the client in one review:

- **Gate A: picture + audio lock** - counts confirmed, first cut approved, one BGM chosen, VO confirmed, synced track approved, review verdict on disk
- **Gate B: delivery released** - every requested B-roll shot and alpha delivered or not applicable, FCPXML bundle built and checked, editor handoff acknowledged

## The board

Decisions are made on **Post Control**, an artifact page that ships with the plugin at `board/post-control.html` (source in `board/src/`, built by `scripts/build-board.js`; the test suite checks the build). Every account publishes its own copy with the `board-setup` skill and records the address with `scripts/set-board.js`; with no address set, `board-sync.js` runs against a file board under `.board/db/` so tests and offline runs need nothing else. The page keeps its state in the artifact's database: the slate, the two gates, the ten item cards, the BGM candidates, B-roll requests with their quotes, the sample alpha, the inbox and the council log. Every decision a person makes there rings the run as a comment sent to Claude; the `post-board-sync` skill has the push, land and pull calls.
## Not in scope

- Final render / colour grade / titles polish - editor's job in Premiere
- Client review deliverables (WeTransfer links etc) - handled downstream
- Auto-splicing B-roll into first cut - editor decides
