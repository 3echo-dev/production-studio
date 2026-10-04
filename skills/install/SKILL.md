---
name: install
description: >
  Checks that this computer has what both pipelines need, asks before installing anything, and
  checks again. Use when the user types /production-studio:install, after a fresh plugin install,
  or when a session-start line says a tool is missing.
---

# Skill: Install

**Purpose:** one entry point for setting the computer up. The two pipelines have different needs
(pre-production: Node, Python, the Excel and PowerPoint libraries; post-production: those plus
ffmpeg, the motion composer and the clip matcher), and each keeps its own check and install
steps. This skill runs them in order and reports once.

## Steps

1. **Pre-production.** Follow `${CLAUDE_PLUGIN_ROOT}/pre/skills/install/SKILL.md`
   (the `pre-install` skill): it runs `pre/scripts/check-deps.js`, lists what is missing, asks,
   installs, and checks again.
2. **Post-production.** Follow `${CLAUDE_PLUGIN_ROOT}/post/skills/install/SKILL.md`
   (the `post-install` skill): the same for `post/scripts/check-deps.js`, `check-mograph.js` and
   `check-agentc.js`.
3. **The board.** If neither pipeline has a board set, offer the `board-setup` skill, which
   publishes one Production Studio board and records it for both.
4. **Report** in one short list: what was already there, what was installed, what is still
   missing and why.

## Rules

- Ask before every install; never install anything the person did not say yes to.
- A tool one pipeline needs and the other does not is reported under that pipeline's name.
