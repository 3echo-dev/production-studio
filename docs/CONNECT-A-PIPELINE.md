# Connecting a third pipeline to the Production Studio board

For the agent that adds the social pipeline (or any other plugin) to this board. Read it all
before changing anything; the order of the steps matters.

## What you are connecting to

One claude.ai artifact per account, published once by `board-setup` from
`pre/board/pre-production.html`. It is a single HTML page with the `db`, `artifact`,
`comments`, `downloads` and `assets` capabilities. Everything on it is read live from the
artifact database; nothing is baked into the page except the pipeline models.

Today the page knows two pipelines, `pre` and `post`. A project document carries
`kind: 'pre' | 'post'`, and the page swaps its whole vocabulary (steps, stages, gates, agents)
to that pipeline's model when it draws the project. You are adding `kind: 'social'`.

Two halves, and both are needed:

1. **The page** has to learn the social model, or a social project draws as pre-production.
   The page lives in this repo and ships as a plugin release.
2. **The plugin** has to write the board the way the other two do: an outbox on disk that one
   script turns into `ArtifactData` writes, a landing script that turns board reads into files,
   and the bell that wakes the run.

The social plugin's current gate layer (`scripts/lib-gate.js`, `gate-app.json`, the HTTP gate
app) is the old kernel pattern. It is replaced, not bridged: a script cannot reach the artifact
database over HTTP; only the session's `ArtifactData` tool can.

## Part 1. Teach the page the social pipeline

File: `pre/board/src/pre-production.html` (the source; `pre/board/pre-production.html` is the
build and is never edited by hand). Build with `node pre/scripts/build-board.js`.

### 1.1 The model

Find `const PRE = {...}` and `const POST = {...}` (around line 787). Add `const SOCIAL = {...}`
with the same fields, then add it to `const PIPES = {pre:PRE, post:POST, social:SOCIAL}`.

| Field | What it is | Shape |
|---|---|---|
| `kind` | `'social'` | string |
| `label`, `tag` | Door title and one-line promise | `'Social', 'A brief in, scheduled posts out.'` |
| `ITEMS` | The steps, in pipeline order | `{id, stage, name, xx, seat, produces, deps:[ids]}`; `xx:true` means a person enters or approves it; `seat` is the agent id that owns it |
| `STAGES` | Stage headings | `{n, name, sub, gate}` |
| `GATES` | One per gate letter | `{name, after:<stage n>, items:[ids], approver, cond}`; wording is sign-off language, never "lock" |
| `GATE_RELEASES`, `GATE_ROLLBACK` | One sentence per gate | `{A:'...', B:'...'}` |
| `SEATS` | Every agent, then every human role | `{id, n:'01', label, kind:'agent'|'new'|'human', note}`; the orchestrator first; human ids come from `HUMANS` |
| `STAGE_GATE` | Which gate opens which stage | `{2:'A', 3:'B'}` |
| `gateNext` | Project status after a gate passes | `{A:'stage2', ...}` |
| `order` | Rank of every project status, for the gate chips | `{intake:0, stage1:1, gate_a:1, ...}` |
| `na`, `naNote` | Which items may be marked not applicable, and the note per gate | function, function |
| `rules` | The five house rules shown under the pipeline banner | array of HTML strings |

Item ids are the collection document ids under `projects/<id>/items/`, so keep them short
snake_case and never rename one after a project exists. Seat ids must be the plugin's agent ids
(the registry's `agentId`), because `board-say.js --as` and the chat bubbles are keyed on them.

Faces are automatic: `blob()` draws every seat in `SEATS` as a character with a hue from its
index and a mood from its state. Do not add icons for agents.

### 1.2 Where `pre`/`post` is spelled out

Each of these has a two-way branch; make it three-way.

- `kindOf(p)` and `projectKind()`: a project with `kind:'social'` must return `'social'`. Keep
  the inference for untagged projects as it is.
- `route()`: the slate regex `^#\/(pre|post)` gains `social`. Routes are `#/` home, `#/social`
  slate, `#/p/<id>` project.
- `homePage()`: `door('social')`. The door icon comes from `ic(...)`; add an `<symbol id="ic-...">`
  to the sprite if neither `flow` nor `film` fits.
- `projSub(p)`: the subtitle fields for a social card (brand, platform, deliverable count).
- `slateOrderFor(d, id)`: add `slateOrderSocial(d, id)`. This is the bell text for a project
  opened on the slate; it names the skill to run (`new-social-job` or whatever the plugin calls
  it), lists the answers already given, and says "ask nothing these answer".
- A form and a creator: copy `preForm()`/`createProject()` (or `postForm()`/`createPostProject()`)
  into `socialForm()`/`createSocialProject()`. The creator rings the bell first, then writes
  the project document with `kind:'social'`, one `items/<id>` document per step with
  `{status:'pending', version:0, summary:'', updatedAt, updatedBy}`, and one opening message.
- `slatePage()`: draw the social form when the slate kind is social.
- `STEP_IMG`: one picture per item id. The existing ones are Microsoft Fluent 3D emoji (MIT),
  shrunk to 112 px PNG and embedded as data URIs; add yours the same way and list the source
  in `pre/docs/THIRD_PARTY_SOURCES.md`.

### 1.3 Styling

The page is graphite with one warm accent. Each pipeline owns one colour field, used in two
places only: the home door (`.hcard.k-<kind>`) and the pipeline banner
(`details.model.k-<kind>`). Pre is yellow-orange, post is red-pink; give social a third that
reads as a different door at a glance (teal-cyan or violet-blue both sit well). Copy the
`.hcard.k-post` rule and change the four gradient stops and `--hg`; same for the banner rule.
Everything else (step cards, slate cards, inbox, chat) is shared and takes no per-pipeline
colour.

Never name a class `pre`, `post` or `social` on its own; `.pre` is the monospace block. The
pipeline classes are `k-pre`, `k-post`, `k-social`.

### 1.4 Prove the page before publishing

```
node pre/scripts/build-board.js
node pre/scripts/test/run-all.js        # board-build.smoke pins the page structure and parses the script
node post/scripts/test/run-all.js
```

Then open the built page as a file with `#example` on the end, or render it headless with
`node pre/scripts/dev/render-board.mjs` (Chrome, no packages; PNGs land in `.tmp/render`), and
look at: the home page with three doors, the social
slate with its form, a social project page, one agent chat, the pipeline banner. A JavaScript
string with an apostrophe once blanked the whole page; the parse guard in the build test exists
for that.

For design review publish a preview copy (title changed, demo forced with
`(!runtime || true)`), never the real board.

## Part 2. Make the plugin write the board

Every pipeline keeps its own scripts under its own folder (`pre/scripts`, `post/scripts`,
and yours), but they all speak the same board. Copy `pre/scripts/lib-board.js`,
`board-sync.js`, `board-say.js`, `set-board.js`, `stage.js`, `set-state.js` and the hooks as
your starting point; they are small and commented.

### 2.1 The address

`set-board.js` records the board URL in the workspace's config folder. Pre keeps it in
`.creative-studio-pipeline/config.json`, post in `.creative-studio-post/config.json`. Keep
yours in `.social-pipeline/config.json` under the same key, `boardUrl`, and extend
`skills/board-setup/SKILL.md` step 1 and step 3 so one `board-setup` records the address for
all three. One board per workspace root; never point a workspace at a board the account does
not own.

### 2.2 The outbox and `push`

A script never reaches the database. It appends a record to
`<root>/.board/outbox.jsonl` (pre) or `<job>/.board/outbox.jsonl` (post); pick one and stay
with it. `board-sync.js push <client> <job>` folds the outbox into write batches of at most 50
and prints them; the orchestrator hands each batch to `ArtifactData` (`action: "batch"`) and then
runs `push --ack` to clear what was delivered.

The write shapes the page reads. `base` is `projects/<job id>`.

| Record kind | Write | Fields the page uses |
|---|---|---|
| `project` | `set projects/<id>` | `kind:'social'`, `title`, `client`, `status`, `stage`, `activity`, `heartbeatAt`, `createdAt`, `createdBy`, `cost:{runs,tokens,creditsSpent,creditsCeiling}` |
| `item` | `set` (first, pending) then `update base/items/<item>` | `status` (`pending`, `running`, `draft`; the run never writes `approved`, `needs_review` or `na`, those are a person's), `version`, `summary`, `artifactPath`, `updatedAt`, `updatedBy` |
| `version` | `set base/versions/v-<item>-<n>` | `item`, `n`, `note`, `path`, `hash`, `seat`, `at`, `files` |
| `run` | `set base/runs/<item>-v<n>` | `item`, `version`, `seat`, `status` (`running`/`done`), `output` (markdown shown as the agent's bubble), `prompt`, `model`, `turns`, `tokens`, `startedAt`, `finishedAt` |
| `message` | `set base/messages/<id>` | `by` (an agent seat id, a human id, or `pipeline`), `text`, `item` (step id or null), `at`, `files` |
| `question` | `set base/inbox/<id>` | `type:'question'`, `item`, `text`, `options:[]`, `from` (seat id), `status:'open'`, `createdAt`, optional `thumb` |
| `progress` | `update projects/<id>` | `stage`, `stageStatus`, `activity`, `status` |
| `heartbeat` | `update projects/<id>` | `activity`, `heartbeatAt` |
| `answered` / `waiting` | `update base/inbox/<id>` | `status`, `answer`, `answeredBy`, `waitingText` |
| `moved` | `update projects/<slate id>` | `status:'moved'`, `movedTo:<job id>` (adopting a slate project) |

Messages and runs are what the chat is made of: a `run` with `output` is the agent's delivery
bubble; a `message` whose `by` is an agent seat is that agent's reply; a `message` by a human
is the person's bubble; a `question` is a bubble with option buttons. Keep every `by` and
`seat` equal to an id in `SEATS` or `HUMANS`, or the page cannot place it.

Gate documents (`base/gates/<A|B|C>`) and approvals on items are written by the page only,
when a person decides. The run reads them.

### 2.3 `land` and `pull`

`board-sync.js land <client> <job>` is the other direction: the orchestrator reads the project's
`inbox`, `gates`, `items` and the register collections with `ArtifactData` and hands the result
to `land`, which writes `<root>/.board/inbox.jsonl` and any files the pipeline keeps on disk
(answers, approvals, chosen rows). `pull --gate A` turns a landed gate record into the
hash-bound approval file and refuses when a file changed after the sign-off. Every resume lands
before reading state; every gate pulls before the next stage runs.

### 2.4 `kind` on open

`board-sync.js open` writes the project document. Post does it in one line:

```js
lib.appendOutbox(CWD, client, jobId, { collection: 'projects', docId: jobId, data: { kind: 'post', ...project } });
```

Yours writes `kind: 'social'`. Without it the page draws the project as pre-production.

### 2.5 Adopting a slate project

A person can open a project on the board before any job folder exists. The card gets a slate id
(`<slug>-<4 chars>`) and the bell carries the order text from `slateOrderSocial`. The run creates
the job from the answers in the bell, then
`board-sync.js adopt <client> <job> --from <slate id>` and push: the slate card is marked
`moved` and hidden, and the job's own page carries on. Never reply "shall I start"; the answers
are in the bell.

## Part 3. The bell, both ways

### 3.1 Board to run

A decision on the board is sent as a comment to Claude, anchored to the page, with text like
`Social board: Script v2 approved on Launch teaser (job id). Land the board and carry on; ...`.
The session that watches the artifact gets a turn headed `[Artifact comment sent to Claude]`.
Only a session that published the board, or in which the person pasted the board link, is
watching; `ArtifactComments action: "watch"` with no url lists the watches and the orchestrator
quotes that line at the start of every project and resume. On such a turn: land first, act,
reply.

The page needs one consent per board and per viewer before it may send; the first press shows
the prompt. `meta/bell` on the database records every bell outcome; read it when a press
seemed to do nothing. Every bell is also logged under `bells/`.

### 3.2 Run to board

The page cannot read the comment thread. A reply left only there is invisible on the board, and
the person sees "Told, waiting for the run" and nothing else. So, in the same turn as any thread
reply:

```
node board-say.js <job> --as <agent> [--item <step>] "<one line>"   # queues; then board-sync.js push
node board-say.js --slate <slate id> --as orchestrator "<one line>"   # before a job exists: prints the ArtifactData write, make it at once
```

The agent is the one the person wrote to (`--as`), the step the one it was about (`--item`).
The board shows it as that agent's bubble, and the newest project-level reply also sits in the
Needs-you box with a button into the chat. This holds for a reply that only says what is still
needed; that is exactly the reply the board must show.

### 3.3 Working, visibly

Heartbeats (a `PostToolUse` hook, one line every 15 s at most) and `stage.js <job> <stage> running`
only reach the board on a push. So push right after the `running` call, before a director is
spawned, and again when the row is verified. A director at work that the board shows as
Not started is a person who thinks the run has died.

## Part 4. Wiring it into the plugin

- `.claude-plugin/plugin.json`: add your skills folder to `skills`, each agent file to `agents`
  (folders are refused), and your hooks to `hooks/hooks.json` (SessionStart check-deps,
  PostToolUse heartbeat, PostToolUseFailure note-failure, Stop turn). Skill and agent names are
  namespaced `production-studio:<name>` and must be unique across all three pipelines: prefix
  the ones that collide (`social-board-sync`, `social-review-pass`, `social-orchestrator.md`;
  the seat id inside stays `orchestrator`).
- Bump `version` in `plugin.json` and `.claude-plugin/marketplace.json` together; the installed
  copy only moves on a bump (`claude plugin marketplace update production-studio`,
  `claude plugin update production-studio@production-studio`, restart).
- Line endings are LF throughout (`core.autocrlf false`); post's structure test rejects CR.
- Wording: no "lock" on any gate; "sign-off" and "release". No person's name as a skill, agent
  or approver id; use the role. Nothing paid runs without a quote and a yes on the board.
- Tests: add `scripts/test/run-all.js` for your side and keep `pre` and `post` green at every
  step. The `size.smoke` budgets are 900 words per agent file and 700 per skill.

## Part 5. Permissions

A turn that only a board comment asked for runs under the session's permission mode. In Auto
mode the classifier may refuse a script on such a turn (seen once as "Unrequested Commit in a
Connected App" on a client scaffold). The fix is on the workspace: `Bash(node:*)` and
`Bash(python:*)` under `permissions.allow` in `<root>/.claude/settings.local.json`, or a mode
that does not classify. If a script is refused, say so once, in the thread and on the board,
and never land by hand.

## Part 6. Prove it live, in this order

1. `board-setup` from the session that will run the pipeline: publish, record the address for
   all three sides, one `meta/board` write, the watch listed as connected and armed.
2. Press Signal pipeline on the board, approve the consent prompt, see the turn arrive.
3. Open a social project from the slate: the bell carries the order, the run creates the job,
   adopts the card, pushes, and the page shows the job with its steps.
4. One stage: push after `running` (the agent reads Working), the director's run record
   lands as a bubble with output, the item reads Ready for review.
5. A note in that agent's chat: the turn arrives, the reply shows in the same chat
   (`board-say.js`), and in the Needs-you box.
6. A question from the run (`board-sync.js ask`): the option buttons answer it, the bell rings,
   the run lands and continues.
7. Approve, request a change, sign off a gate: each rings, each lands, `pull --gate` writes the
   approval file.

Each of those has been proven for pre-production and most for post-production on this board;
do not take any as given for social until it has run once.

## Where things are

```
pre/board/src/pre-production.html   the page source (models, routes, styling, chat, bell)
pre/scripts/build-board.js          builds pre/board/pre-production.html (embeds the source as base64)
pre/scripts/lib-board.js            outbox, configured(), boardUrl()
pre/scripts/board-sync.js           open | push | land | pull | ask | answer | adopt
pre/scripts/board-say.js            an agent's reply into the chat (and --slate)
pre/scripts/hooks/heartbeat.js      the PostToolUse pulse
pre/scripts/dev/render-board.mjs    headless screenshots of every pipeline's pages
pre/docs/SHARED-RULES.md            the rules every orchestrator reads; the bell section is the contract
skills/board-setup/SKILL.md         the shared publish-and-record skill
post/scripts/board-sync.js          the post side's writer, same shapes, per-job outbox
```
