# Production Studio

One plugin for the studio's two pipelines, on one board.

- **Pre-production** (`/pre-production`): a client folder, local or on Google Drive, becomes a project; ten
  director agents take it through brief, references, script, storyboard, shot list, budget,
  timeline, audio and the logistics registers to a concept breakdown and one call sheet per shoot
  day, in the client's templates. Three gates: Creative sign-off, Logistics sign-off, Release to
  shoot.
- **Post-production** (`/post`): shot footage, audio and the pre-production release become a first
  cut, music candidates, a synced track, on-demand B-roll and motion-graphic alphas, delivered as
  an FCPXML bundle the editor drops into Premiere Pro. Two gates: Picture + audio sign-off,
  Delivery released.

Every gate is signed off by a person on the **Production Studio board**, a claude.ai artifact
each account publishes once (`board-setup`). The board's home page has a door per pipeline; a
project page shows the pipeline as cards, the agents as an inbox, and each agent as a chat.

## Layout

```
.claude-plugin/   the plugin manifest; skills and agents are loaded from pre/ and post/
hooks/            one hooks file, running both pipelines' session, heartbeat and turn hooks
skills/           what both pipelines share: board-setup, install
pre/              the pre-production pipeline, complete (agents, skills, scripts, docs, tests)
post/             the post-production pipeline, complete
pre/board/        the one board page both pipelines use (source in pre/board/src)
```

Each pipeline keeps its own scripts. They share the board, the board address and the workspace
root; the two sets of scripts are being brought together one script at a time, with both test
suites green at every step.

## Running from the board

A decision on the board reaches the run as a comment sent to Claude. In Auto permission mode
that turn is refused when it tries to write files, because nobody typed the request in the
chat. Give the session that watches the board allow rules for the plugin's scripts
(`Bash(node:*)` and `Bash(python:*)` in the workspace's `.claude/settings.local.json`), or
type the go-ahead in its chat. `board-setup` offers to write the rules.

## Tests

```
node pre/scripts/test/run-all.js
node post/scripts/test/run-all.js
```

## History

This repo carries the full history of the two plugins it replaced,
[CS-pre-production](https://github.com/3echo-dev/CS-pre-production) under `pre/` and
[CS-post-production](https://github.com/3echo-dev/CS-post-production) under `post/`. Their
own READMEs are at `pre/README.md` and `post/README.md`.
