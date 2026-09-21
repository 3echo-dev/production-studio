---
name: resume-post-project
description: >-
  Resumes a stalled post-production job by reading state and artefacts on disk, comparing to plan.md, and reporting where the run stopped. Files win over status.md. Never resumes past a gate; a passed gate needs a re-approval to reopen.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Resume post project

## Steps

1. Read `job.json`, `plan.md`, `status.md`.
2. For each row in `plan.md`, verify the primary artefact exists and hashes match the manifest.
3. First row that fails: that is the resume point. Mark rows before it `verified` and rows after `pending`.
4. If a gate is passed on disk (`approvals/gate-{a|b}.json` valid and hash-bound), do NOT rewind past it.
5. If `bgm-choice.json` exists but is unsigned, park at BGM.
6. Report the resume point and the artefacts already on disk. Hand off to the orchestrator.

## Rules

- Never re-fire a stage whose artefact is already valid and hash-bound.
- Never reopen a passed gate from resume; only a change note reopens.
- Silence about a stage means the file was checked and passed.

## Boundary

Does not re-run stages; only points at where to resume.

## Failure modes

| Failure | Fix |
|---|---|
| `job.json` missing | Route to `new-post-project` instead |
| An artefact hash mismatches the manifest | Stop and ask; either the file was hand-edited or the manifest is stale |
| A gate approval refers to a hash no longer on disk | Stop; the file was replaced after the lock, the gate reopens |
