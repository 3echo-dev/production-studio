---
name: post
description: >-
  Entry command for creative-studio-post. Starts a new post-production job or resumes an existing one. Reads job.json where it exists; otherwise routes to new-post-project. Invoke as /production-studio:post.
metadata:
  version: 0.1.0
user-invocable: true
---

# Skill: Post entry

## Steps

1. Read the current workspace. If `workspaces/{client}/jobs/{job-id}/job.json` exists and `plan.md` shows any row not `verified`, route to `resume-post-project`.
2. Otherwise, route to `new-post-project`. Woken by the board's slate form (the bell names a slate id and the seven answers): pass them straight through and ask nothing they answer (`docs/SHARED-RULES.md`, "A project opened on the slate"). Otherwise ask, once, on the board and in chat, for client, title, footage folder, release folder, aspect ratio, duration and who leads.
3. Run `check-deps.js`. A required item missing stops with a plain sentence naming it. Mograph not set up does not stop the job; the mograph stage offers `mograph-setup.js` when it is reached.
4. Hand off to the orchestrator to walk the workflow table.

## Boundary

Does not sequence, sync, render or package. Only routes.

## Failure modes

| Failure | Fix |
|---|---|
| `check-deps.js` names a required item | Install it (`check-deps.js --setup` prints the command) |
| No `--pre-release` given | Ask; the pre-prod release folder is required for a post job |
| Two workspaces detected | Ask which client |
