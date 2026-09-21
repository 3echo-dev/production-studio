---
name: board-setup
description: >-
  Publishes this account's own copy of the Post Control board, the page that ships with the plugin at board/post-control.html, as a claude.ai artifact with the db, artifact and comments capabilities, and records its address for the workspace. Use once per account or workspace, when set-board.js --show says no board is set, or when the user asks for a fresh board.
argument-hint: "[--new]"
metadata:
  version: 0.1.0
user-invocable: true
---

# Skill: Board setup

**Purpose:** give the account that runs the pipeline a board it owns. The plugin carries the page; the artifact belongs to whoever publishes it, only an owner's session can write its database, and only a session watching it is woken by its decisions.

## Steps

1. **Is there one already?**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/set-board.js" --show
   ```

   Exit 0 prints the board in use and where the setting came from: say so in one line and stop, unless the user asked for a new one (`--new`). Exit 3: continue.

2. **Publish the page** with the Artifact tool: `file_path` `${CLAUDE_PLUGIN_ROOT}/board/post-control.html`, `title` "Post Control", `icon` "film", `capabilities` `{"db": {}, "artifact": {}, "comments": {}}`, `description` "Post-production board: two gates, BGM choice, B-roll quotes, alphas, inbox". Publish it as it is: never edit the page, never strip the base64 copy at its end, never pass `contract`. The artifact starts private; `comments` keeps it inside the organization. The publish result says whether this session now watches the board: note it for step 5.

3. **Record the address** the publish result returned, from the workspace root (the folder that holds `workspaces/`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/set-board.js" {url}
   ```

   It writes `boardUrl` into `.creative-studio-post/config.json`. A `CREATIVE_STUDIO_POST_BOARD_URL` in the environment would win over it: say so if one is set. With an address set, `board-sync.js` switches from the file board to printing batches for the artifact.

4. **Prove the session can write it.** One `ArtifactData` set on the new artifact, collection `meta`, document `board`, data `{"installedBy": "creative-studio-post", "pluginVersion": "{version from plugin.json}", "installedAt": "{now}"}`. The first write asks the person for consent once; a refusal means the board cannot be driven from this session: say that and stop.

5. **Say who is watching.** A decision reaches the run as a comment sent to Claude, only in a session watching the artifact with replies armed; publishing from this session arms it. `ArtifactComments` `action: "watch"` with no `url` lists the watches: if the board's row is connected and armed, the session running jobs must be this one, or must watch it the same way. Otherwise say plainly that every decision on the board must also be said in chat.

6. **Open it** with the Artifact tool's `open` and say one line: the board is published, private to this account, and every project in this workspace opens on it. Do not repeat the address.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. One board per workspace root. A second `board-setup` without `--new` changes nothing.
2. The page is published unmodified. Changes to the board are a plugin release (`board/src`, then `build-board.js`), not a per-account edit.
3. `--new` publishes a fresh, empty board; projects on the old one stay there. Say that before publishing.
4. Never point a workspace at a board this account does not own: its decisions would wake nobody and the writes would be refused.

## Output contract

A private artifact of the board page with capabilities db, artifact and comments; `boardUrl` and `boardSetAt` in `<root>/.creative-studio-post/config.json`; the `meta/board` document on the artifact's database.

## Boundary

Does not push projects (`board-sync`), share the artifact, or edit the page.

## Failure modes

| Failure | Fix |
|---|---|
| Publish refused for the capabilities | Say which; the page needs `db`, `artifact` and `comments` |
| A decision on the board wakes nobody | The job session is not watching the board: watch it with ArtifactComments, or land by hand |
| The set-board.js address check fails | Use the artifact link exactly as the publish result printed it |
| The consent for the first write is declined | Stop; the board stays published but unused until a session with consent writes it |
| A board URL from another account was pasted | Refuse; run this skill to publish this account's own |