# Try the hybrid route

Real actors kept exactly as shot, a new background behind them. This walks one job from install to
the first credit question on the board. Nothing is spent before a yes on the board.

## 1. Set up the machine (once)

```
claude plugin marketplace add 3echo-dev/CS-post-production
claude plugin install creative-studio-post@3echo-post
```

Already added the marketplace before? Claude Code keeps its first copy of it, so a new version
only arrives after an update (`claude plugin list` shows the installed version; this guide needs
0.2.7 or later):

```
claude plugin marketplace update 3echo-post
claude plugin update creative-studio-post@3echo-post
```

Restart Claude Code. The first line of every session checks the machine; for the full list with
install commands:

```
node ~/.claude/plugins/cache/3echo-post/creative-studio-post/<version>/scripts/check-deps.js --setup
```

For the hybrid route you need ffmpeg, node, python 3 and Pillow, plus `pip install "rembg[cpu]"`
when an actor was shot without a green or blue screen (the first cut-out downloads a 176 MB model).
The AgentC connector must be set up in Claude to generate backgrounds.

## 2. A folder for the test

Make an empty folder, open Claude Code in it, and ask for the board: "set up the post board". It
publishes a Post Control board to your own claude.ai account (boards are private to whoever
publishes them) and records it for the folder.

## 3. Bring the footage

Either:

- **Your own shoot:** a shoot folder with one plate per storyboard panel in `footage/plates/`
  (named after the panel, `P01.mov`), clips to use as they are in `footage/keep/`, VO under
  `audio/vo`, music under `audio/bgm`; and a pre-prod release (`storyboard.json`, `script.md`,
  `storyboard/v1/P01.png`...).
- **A footage-repurpose cut** (for example a reel made with the footage-repurpose plugin):

  ```
  node <plugin>/scripts/import-repurpose.js <repurpose job folder> inputs/<name> --location "Tokyo rooftop at golden hour"
  ```

  It needs that job's footage catalog and the source clips on this machine. Scenes with talent
  become plates, the rest are kept as they are, and the VO, music and effects come along.

## 4. Start the job

Say: "new post project, client 3echo, hybrid, footage inputs/<name>/shoot, release
inputs/<name>/release, 16:9, 15 seconds, one background per scene". The orchestrator writes the
job, and the intake report lands on the board: per scene the plate, the screen (or an AI cut-out),
letterbox, camera movement, the background and its credits, VO and music. Answer its questions on
the board.

## 5. Cut-outs, then the credit question

The plate-director cuts the actors out (about 3 minutes for three 3-second full-HD shots on a
CPU) and puts the masks on the board. Look at them: a product the actor holds must still be
there. Then the board asks "Generate N backgrounds for N credits?". A yes there, and only there,
lets the composite-director generate, composite and show before/after stills.

## Settings worth knowing (job.json `hybrid`)

| Setting | Default | Use |
|---|---|---|
| `backgroundPer` | `location` | `panel`: one background per scene from its own camera angle, the first the continuity reference for the rest |
| `rembgModel` | `u2net` | `birefnet-general-lite` for fine hair (20-35x slower on a CPU); never `u2net_human_seg` when the actor holds a product: it drops it |
| `cutout` | `auto` | `chromakey` or `rembg` to force one |
| `match` | `0.5` | how far the background's brightness moves towards the actor's |

Known limits: a still background does not follow a moving camera (intake flags it); the
background's colour is not matched, only its brightness.
