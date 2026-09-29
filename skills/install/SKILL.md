---
name: install
description: >
  Checks what this plugin needs on this computer (Node.js, Python, ffmpeg, Pillow, and the
  optional mograph composer, CLIP matcher and rembg), asks the person which missing ones to
  install, runs the installs, checks them again, and says how to connect AgentC. Use right after
  the plugin is installed, when the session-start note lists something missing, or when the user
  says "install", "set up", "what do I need" or a step fails on a missing tool.
metadata:
  version: 0.1.0
user-invocable: true
---

# Skill: Install

**Purpose:** a person who has just added the plugin should not need a terminal.

## Steps

1. **Node.js first.** Every script in this plugin runs on Node, including the check in step 2.

   ```bash
   node --version
   ```

   If it fails: on Windows, offer to run `winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements`; on a Mac, `brew install node`. After it installs, the person must **quit and reopen the Claude desktop app** (a new PATH reaches only new processes), start a new chat and run `/creative-studio-post:install` again. Stop here until then.

2. **See what is missing.**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/check-deps.js" --json
   ```

   It probes afresh and prints each tool with `present`, `required`, `why` and its `install` command. If `ready` is true and nothing optional is missing, say "Everything is installed" in one line and go to step 5.

3. **Ask once.** One question, multi-select, listing only what is missing, required ones first and ticked as recommended, each with its `why`. Recommend `mograph` too (titles, captions and end tags need it; a few minutes and a download). Say plainly what the others are for: `clip-matcher` only matters for shoot jobs matched by picture and is a large download (about 2 GB); `rembg` only for hybrid jobs whose actors were not shot on a green or blue screen. Install nothing the person did not pick.

4. **Install, one command at a time,** exactly the `install` commands from step 2, in this order: Python, ffmpeg, Pillow, then mograph, clip-matcher, rembg. Allow several minutes each. Then:
   - **Python or ffmpeg was just installed** and its `--version` still fails: Windows has not handed the new PATH to this session. Tell the person to quit and reopen the Claude desktop app, then run `/creative-studio-post:install` again for the rest.
   - **pip refuses** with a permission error: run the same command again with `--user`. With "externally managed environment" (Linux, some Macs): say so and give them the command; do not pass `--break-system-packages`.
   - **A command needs `sudo`** (Linux): never run it. Give the person the line to run themselves.
   - **winget is missing** (older Windows): say "App Installer" from the Microsoft Store provides it, and stop.

   Run step 2 again. Report each pick as installed, or as failed with the one line of error that matters. Never say something installed when the check still says missing.

5. **AgentC, for anything generated** (B-roll, AI clips, hybrid backgrounds, moving-camera backgrounds). Check whether the 3echo tools are available in this session (a tool such as `get_workspace_capabilities` from the AgentC server). If they are, call it and say the workspace name and credit balance. If not, Claude cannot connect it for them. Give these steps:
   1. In the Claude app: Settings, then Connectors, then Add custom connector.
   2. Name `AgentC`, address `https://agentc.3echo.ai/api/mcp`, then Continue and Add, leaving the sign-in settings as detected.
   3. Click Connect, sign in with the account the 3echo workspace uses, then start a new chat.

   Cutting, syncing and packaging the client's own footage work without it; nothing is ever generated without a price and a yes first.

6. **What next,** in one line: `/creative-studio-post:board-setup` once to get their board, then `/creative-studio-post:post` to start or continue a job.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Ask before installing anything, once, in step 3. A yes there covers the commands for the picks, not anything else.
2. Only the commands `check-deps.js --json` prints, plus the Node.js line in step 1 and `--user` in step 4. No other package managers, no global npm packages, no admin or `sudo`.
3. The check after installing is the proof. "Installed" means `check-deps.js --json` says present.

## Output contract

The listed tools present on this computer, or a plain list of what is still missing and why.

## Boundary

Does not publish the board (`board-setup`), open a job or spend credits. Does not connect AgentC: it tells the person how.
