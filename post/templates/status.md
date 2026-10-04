# Project status: {job-id}

> **When resuming any project, read this file first.** Do not infer state from conversation.
> The files win over this file: `resume-post-project` checks every artefact on disk against `plan.md`.

**Client:** {client}
**Job:** `{job-id}`
**Title:** {title}
**Folder:** `workspaces/{client}/jobs/{job-id}/`
**Current state:** `INTAKE_PENDING`
**Last updated:** YYYY-MM-DD HH:MM
**Next action:** {what happens next, in one line}
**Blocked on:** {who or what, or "Nothing"}
**Credits spent:** 0 of 0 approved

---

## States

Full state list and transitions: `scripts/lib-states.js`, and the `orchestrator` agent.
This file records where **this** project is, not how the pipeline works.

---

## Stage log

Append a row at every transition. Never rewrite history.

| Timestamp | From | To | By | Note |
|---|---|---|---|---|
| YYYY-MM-DD HH:MM | - | `INTAKE_PENDING` | orchestrator | Project folder created |

---

## Approval record

| Gate | Round | Decision | By | When | Hash prefix |
|---|---|---|---|---|---|

---

## Notes

**This section describes the CURRENT state only. Rewrite it at every transition, do not append.**

{Current state summary. Live constraints. Open items. Running credit tally.}