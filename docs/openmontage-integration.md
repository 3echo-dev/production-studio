# OpenMontage integration

This plugin depends on OpenMontage as a Python + Node library. It does not depend on OpenMontage's orchestrator, executive-producer, or delivery renderer.

## What we import

| OpenMontage module | Used by our skill | Purpose |
|---|---|---|
| `lib/clip_embedder.py` | `sequence-first-cut` | CLIP ViT-L/14 embedding of storyboard panels and footage frames; nearest-neighbour retrieval to match panel → clip. |
| `lib/checkpoint.py` | (not used) | Checked present by `check-om.js`. Our gate records are `approvals/*.json`, written by record-approval.js and board-sync.js pull, verified by check-approval.js. |
| `lib/media_profiles.py` | `ingest-footage` | Codec / container presets for ProRes, DNxHD, H.264, AAC, WAV. |
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
2. `scripts/check-om.js` runs at start of session and fails if:
   - `$OM_ROOT/lib/clip_embedder.py` is missing
   - `$OM_ROOT/lib/checkpoint.py` is missing
   - `$OM_ROOT/lib/media_profiles.py` is missing
   - `$OM_ROOT/lib/delivery_promise.py` is missing
   - `$OM_ROOT/remotion-composer/package.json` is missing
3. For Python: skills prepend `$OM_ROOT` to `sys.path` at run time, or expect a `pip install -e $OM_ROOT`.
4. For Node: `mograph-generate` cd's into `$OM_ROOT/remotion-composer` and runs `npx remotion render` with our props.

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
