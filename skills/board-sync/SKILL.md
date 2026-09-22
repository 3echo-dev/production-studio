---
name: board-sync
description: >-
  How the orchestrator keeps the Post Control board and the job folder agreeing: push the outbox after every row, land what the person decided at every gate and on every resume, bind a locked gate to the file hashes. Orchestrator only.
metadata:
  version: 0.2.0
user-invocable: false
---

# Skill: Board sync

**Purpose:** the board shows what the files say; the files record what the board decided. Only the orchestrator reaches the board, through the ArtifactData tool.

## The board

Its address comes from `lib-board.js` (`CREATIVE_STUDIO_POST_BOARD_URL`, else `.creative-studio-post/config.json`); pass it to the tool as `url`, never print it in chat. With no address set the scripts use the file board at `.board/db/`.

Collections under `projects/{job-id}`: `items`, `versions`, `runs`, `gates`, `inbox`, `messages`, `bgm`, `mograph`, `previews`. An item the pipeline delivers carries `file`, `sha256` and `bytes`; the page copies them into the gate record at lock time, which is what makes the approval hash-bound. A `previews/{item}` document carries `thumb` (PNG data URI under 200 KB) and, after `set-preview.js`, `video` (an asset url the card plays; the MP4 is uploaded with the Artifact tool, `asset: true`). `push --files` writes each body to `.board/push/{n}.json` and names it as `file_path`, so nothing large is retyped.

## Open, once

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" open {client} {job-id}
```

Queues the project and its ten items from `job.json`. Push next.

## Push, after every row

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" push {client} {job-id} --json
```

It prints batches of at most fifty with a `pins` list: `ArtifactData get` each pinned document and put its `version` as `if_version` on that write (`mayExist` pins: skip when nothing is found). Hand each batch to `ArtifactData` `action: batch`. On success:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" push {client} {job-id} --ack
```

A rejected batch is not acknowledged; fix what it names, push again.

## Land, at a gate and on every resume

Read the board with `ArtifactData`, every call with the same `out_dir` `.board/landed/{stamp}` so the tool writes one file per document:

1. `action: get`, collection `projects/{job-id}/gates`, doc_id `A` or `B`.
2. `action: list`, collection `projects/{job-id}/inbox` (open, quoted, waiting and answered rows together).
3. `action: list` on `/items`, `/bgm` and, past Gate A, `/mograph`.

Then hand the folder over (a JSON file of `{"collection", "documents": [...]}` groups is accepted too):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" land {client} {job-id} ".board/landed/{stamp}"
```

It writes the records under `.board/db/`, `.board/inbox.jsonl` and, once a candidate is chosen, `.board/bgm-choice.json`, and prints what changed: approvals, change notes, answers, approved B-roll quotes. A file with no documents exits 3.

## Pull, once a gate is locked

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" pull {client} {job-id} --gate A
```

Exit 0: every file bound in the gate record still matches disk; `approvals/gate-{a|b}.json` is written. Exit 1 names the file that changed after the lock: re-present it. Exit 3: nothing landed; say what waits, end the turn.

## Ask

A question only a person can answer goes to the board and the chat:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-sync.js" ask {client} {job-id} --item vo_drop --text "Which takes are final for scenes 1, 4 and 9?" --options "Take 2 everywhere|Mixed, see notes|Send me the scratch first"
```

Say the printed text in chat, push; the answer arrives with the next `land`. `--blocks {request id}` on a question that blocks a B-roll or mograph request marks the request waiting; `land` says when it can proceed.

## B-roll quotes

A `generate` record for `broll` arrives `requested`. Quote it (AgentC estimate), queue an `update` with `status: quoted`, `credits`, `quoteText`; push. The person approves on the board; `land` prints it; only then may the generation fire. After the shot lands, update the record to `delivered` with `path` and a small `thumb`.

## Rules

The shared rules in `${CLAUDE_PLUGIN_ROOT}/docs/SHARED-RULES.md` apply.

1. Push before ending any turn; an unpushed version is a person waiting for nothing.
2. Land before deciding anything on a resume; the decision is usually already there.
3. Silence is not approval. `pull --gate` waits, it does not assume.

## Output contract

`.board/outbox.jsonl` drained on ack; `.board/db/`, `.board/inbox.jsonl` and `.board/bgm-choice.json` after a landing; `approvals/gate-{a|b}.json` after a pull.

## Boundary

Does not decide a gate, write a version or spawn a director.

## Failure modes

| Failure | Fix |
|---|---|
| Acknowledging a batch the tool rejected | Only after success |
| Pull finds no decision | Land first; then wait, do not assume |
| Pull refuses a changed file | Re-present the item; the person locks again |
| Hand-editing `inbox.jsonl` | Only `board-sync.js land` writes it |
| ArtifactData unavailable | Say so; decisions are taken in chat and recorded with `record-approval.js --from-chat` |