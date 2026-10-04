# Materials needed for a real test — creative-studio-post

The smallest useful real run of the post-production pipeline needs the three "Required" items below. The four "Highly recommended" items unlock more stages; missing ones cause specific stages to skip or stub cleanly.

## Required (blockers)

### 1. Pre-prod release folder

- **Where it comes from:** Output of `creative-studio-pipeline` (Gate C release) OR hand-assembled from an existing job.
- **Format:** A folder containing:
  - `script.md` — final approved script
  - `storyboard.json` — the panel table with frame references
  - `concept-breakdown.xlsx` — the line items (talent / prop / location)
  - at least one `call-sheet-day-*.pdf or .xlsx` — one per shoot day
  - `storyboard/v{n}/P*.png` — the visual panel images

### 2. Shot footage

- **Where it comes from:** Actual shoot Drive folder.
- **Format:** `footage/day-01/*.{mov,mp4,mxf,braw,r3d,mts}` — camera masters; a `proxies/` subfolder is optional but recommended.

### 3. Human XX declarations

- **Where it comes from:** You, at intake.
- **Format:**
  - `aspectRatio` — one of `16:9`, `9:16`, `1:1`, `4:5`, `2.39:1`
  - `deliverableDurationSec` — integer from 5 to 900
  - `audioLed` — `true` (VO leads the cut) or `false` (picture leads)
  - `referenceCutPath` — optional; path to a reference edit for pacing
  - `colourDirection` — optional; LUT name, grade brief, or "client will grade"

## Highly recommended (else stages get skipped or stubbed)

| Material | For which stage | Blocker if missing |
|---|---|---|
| VO takes (WAV/AIF under `audio/vo/`) | vo-drop, sync | Skip both stages if none; picture-only cut |
| Lav / boom / ambient tracks (under `audio/{lav,boom,ambient,wild}/`) | sync | Nice-to-have; SFX layer stays empty if absent |
| BGM file (WAV/MP3) — the chosen track (under `audio/bgm/`) | sync | Need at least one track ready; see BGM section below |
| Slate frames (optional, under `slates/`) | ingest — for scene/take auto-parsing | Manifest will park scene/take as null; ingest still works |

## BGM sources

No Suno / Musicbed / Artlist MCP is wired in this session. For a real test today, bring your own WAV/MP3 into `audio/bgm/` and skip the three-option suggestion flow. Longer-term options for BGM sourcing are documented in `docs/agentc-integration.md`.

## One-time environment setup

These installs are needed only once per machine to unlock the CLIP sequence stage and Remotion mograph stage:

```bash
pip install numpy torch transformers
node scripts/mograph-setup.js
```

Without them, the pipeline still runs: the sequence stage falls back to a human-authored EDL, and the mograph stage is skipped.

## Credit budget

Rough estimate per full run: **15–25 3echo credits** (1 mograph plate + 1–3 B-roll shots). Your workspace currently carries 958 credits available.

## Minimum kit for the first real run

If you can put these into one folder, the pipeline can drive an end-to-end run:

1. An existing pre-prod release folder (with the five required files above)
2. 3–10 short shot clips (even phone footage; anything ffprobe can read)
3. One BGM WAV you already own (30–60 seconds, matching the deliverable length)
4. Optional: one VO take (WAV of someone reading the script). If none, output is a picture-only cut.
5. Your intake choices for aspect ratio and duration.
