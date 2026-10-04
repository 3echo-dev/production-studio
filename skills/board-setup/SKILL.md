---
name: board-setup
description: >
  Publishes this account's own copy of the Production Studio board, the one page both pipelines
  decide on, shipped at pre/board/pre-production.html, as a claude.ai artifact with the db,
  artifact, comments, downloads and assets capabilities, and records its address for both
  pipelines in this workspace. Use once per account or workspace, when either set-board.js --show
  says no board is set, or when the user asks for a fresh board.
---

# Skill: Board setup

**Purpose:** give the account that runs the pipelines one board it owns. The plugin carries the
page; the artifact belongs to whoever publishes it, only an owner's session can write its
database, and only a session watching it is woken by its decisions. Pre-production and
post-production share the page: the home page has a door for each, and a project is drawn from
the model of the pipeline it belongs to.

## Steps

1. **Is there one already?** Both pipelines keep their own copy of the address; check either.

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/pre/scripts/set-board.js" --show
   node "${CLAUDE_PLUGIN_ROOT}/post/scripts/set-board.js" --show
   ```

   Exit 0 prints the board in use: say so in one line and stop, unless the user asked for a new
   one (`--new`). Exit 3 on both: continue. Exit 0 on one only: record that address on the other
   (step 3) and stop.

2. **Publish the page** with the Artifact tool, `file_path` set to
   `${CLAUDE_PLUGIN_ROOT}/pre/board/pre-production.html`, `title` "Production Studio", `icon`
   "film", `capabilities` `{"db": {}, "artifact": {}, "comments": {}, "downloads": true, "assets": {}}`,
   and a one-line description ("Production Studio board: pre-production and post-production
   pipelines, gates, inbox and chat"). Publish it as it is: never edit the page, never strip the
   base64 copy at its end, never pass `contract`. The publish result says whether this session
   now watches the board: note the answer for step 5.

3. **Record the address** the publish result returned, for both pipelines:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/pre/scripts/set-board.js" {url}
   node "${CLAUDE_PLUGIN_ROOT}/post/scripts/set-board.js" {url}
   ```

   Any `CREATIVE_STUDIO_BOARD_URL` in the environment would win over both: say so if one is set.

4. **Prove the session can write it.** One `ArtifactData` set on the new artifact, collection
   `meta`, document `board`, data `{"installedBy": "production-studio", "pluginVersion":
   "{version from plugin.json}", "installedAt": "{now}"}`. The first write asks the person for
   consent once; a refusal means the board cannot be driven from this session, say that and stop.

5. **Say who is watching.** A decision reaches the run as a comment sent to Claude, only in a
   session watching the artifact with replies armed; publishing from this session arms it.
   `ArtifactComments` `action: "watch"` with no `url` lists the watches. Otherwise say plainly
   that every decision on the board must also be said in chat.

6. **Open it** with `node "${CLAUDE_PLUGIN_ROOT}/pre/scripts/pane.js" "home" "Production Studio"`,
   then ask the person to press **Signal pipeline** on the board once and approve the prompt that
   lets the page message this session. Never repeat the address.

## Rules

1. One board per workspace root, shared by both pipelines. A second `board-setup` without
   `--new` changes nothing.
2. The page is published unmodified. Changes to the board are a plugin release.
3. `--new` publishes a fresh, empty board; projects on the old one stay there. Say that before
   publishing.
4. Never point a workspace at a board this account does not own.

## Output contract

A private artifact of the board page with capabilities db, artifact, comments, downloads and
assets; `boardUrl` and `boardSetAt` in both `<root>/.creative-studio-pipeline/config.json` and
`<root>/.creative-studio-post/config.json`; the `meta/board` document on the artifact's database.

## Failure modes

| Failure | Fix |
|---|---|
| Publish refused for the capabilities | Say which; the page needs all five |
| A decision on the board wakes nobody | Press Signal pipeline and approve the prompt |
| The consent for the first write is declined | Stop; the board stays published but unused |
