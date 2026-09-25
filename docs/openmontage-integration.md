# OpenMontage integration

OpenMontage is optional: only the mograph stage uses it, through `remotion-composer/`. OpenMontage is AGPL; nothing of it is copied into this plugin (MIT), it is called in place. It does not depend on OpenMontage's orchestrator, executive-producer, or delivery renderer.

## What we import

| OpenMontage module | Used by our skill | Purpose |
|---|---|---|
| `lib/clip_embedder.py` | (replaced) | `scripts/clip_match.py` loads the same model (openai/clip-vit-base-patch32) itself; checked on real frames to give identical scores (difference 0.0). |
| `lib/checkpoint.py` | (not used) | Our gate records are `approvals/*.json`, written by record-approval.js and board-sync.js pull, verified by check-approval.js. |
| `lib/media_profiles.py` | (not used) | Ingest reads codecs from ffprobe. |
| `tools/video/green_screen_processor.py` | (replaced) | Its detector tests pure #00FF00 only; `cutout.py` samples the plate's own screen colour. |
| `lib/delivery_promise.py` | (not used) | A promise classifier (motion-led, source-led ...), not a bundle validator. The bundle contract is checked by `scripts/build-bundle.js` on the Gate A hashes instead. |
| `schemas/artifacts/` | test suite | Reused as fixtures for our own artefact validation harness. |
| `remotion-composer/` (Node) | `mograph-generate` | Five templates: Cinematic, Explainer, TalkingHead, CollageBurst, LyricOverlay. Rendered to ProRes 4444 with alpha. |

## What we do not import

- `backlot/` — OpenMontage's UI server. Post has its own board (Post Control artifact).
- `pipeline_defs/*.yaml` — OpenMontage's pipeline manifests. Our workflow is `workflows/post.md`.
- `lib/corpus.py` and retrieval from Pexels / Archive.org / NASA — post-prod matches shot footage from the client, not a stock library.
- OpenMontage's executive-producer orchestration mode.
- OpenMontage's final-render delivery. Ours ends at FCPXML.

## Resolution

1. `CONFIG.md` sets `om_root`. Default: `~/Desktop/OpenMontage`.
2. `scripts/check-om.js` reports at start of session whether `$OM_ROOT/remotion-composer/package.json` is there. It never refuses the session; the mograph director refuses without it.
3. For Node: `mograph-generate` cd's into `$OM_ROOT/remotion-composer` and runs `npx remotion render` with our props.

## Versions we pin against

OpenMontage does not tag releases yet. We pin against a commit SHA in `docs/om-lockfile.txt`, updated deliberately. `check-om.js` warns when the checkout HEAD differs from the pinned SHA.

## When OpenMontage changes

If OpenMontage changes an API we call:

1. `scripts/test/openmontage-integration.smoke.js` fails (Gate G12 in `GATES.md`).
2. Update the calling skill to match the new API.
3. Bump `docs/om-lockfile.txt` to the new SHA.
4. Note the change in `docs/CHANGELOG.md`.

We do not carry a shim layer. If OpenMontage renames `clip_embedder.embed_frames` we update our skill; we do not maintain a compatibility wrapper.

## Environment

- Python 3.11+ with `torch`, `open_clip_torch`, `ffmpeg-python` (see OpenMontage's `requirements.txt`).
- Node 20+ with `@remotion/cli` (comes from `remotion-composer/package.json`).
- ffmpeg on PATH (used by both OpenMontage and our own scripts).
- GPU optional for clip_embedder — CPU works, slower.
