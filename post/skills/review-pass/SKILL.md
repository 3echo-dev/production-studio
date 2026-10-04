---
name: review-pass
description: >-
  Runs the Gate A rubric against the artefacts on disk (EDL, synced track, storyboard, script). Produces validation/review-a-{round}.md with critical, major and minor findings. Emits a verdict: CLEAR, NEEDS REVISION, or WARNINGS ONLY. Never approves. Use before every Gate A attempt.
metadata:
  version: 0.1.0
user-invocable: false
---

# Skill: Review pass

## Inputs

- `job.json`, `manifest.json`, `rough-edl.json`, `synced-track.json`, `bgm-choice.json`.
- Pre-prod `script.md`, `storyboard.json`, `storyboard/v{n}/P*.png`.
- `${CLAUDE_PLUGIN_ROOT}/playbooks/review-rubrics.md` — Gate A section.
- Any prior `validation/review-a-{k}.md` for round context.

## Steps

1. For each rubric item in Gate A:
   - Check the referenced artefact.
   - Record `pass`, `warn`, `fail`, `n/a` with a one-line reason and a pointer (file:line or panel id).
2. Score: `critical` (six critical items), `major` (twelve major items), `minor` (rest).
3. Write `validation/review-a-{round}.md`:
   - Header: verdict, counts.
   - Sections: critical, major, minor.
   - Per finding: `- [ ] {id}: {one-line}. Evidence: {pointer}. Fix: {director}.`
4. Verdict:
   - `CLEAR` = no critical, ≤3 major.
   - `NEEDS REVISION` = any critical, or >3 major.
   - `WARNINGS ONLY` = no critical, 1-3 major.
5. If `NEEDS REVISION`, write one `revisions/{n}.json` per critical, addressed to the owning director.

## Rules

- Never edit an artefact under review.
- Every finding cites evidence.
- Every rubric item scored on its own; no combining.
- `n/a` is a scoring choice with a reason, not silence.

## Output contract

`validation/review-a-{round}.md` with verdict, counts, findings.

## Boundary

Does not approve, does not rewrite artefacts, does not spawn.

## Failure modes

| Failure | Fix |
|---|---|
| Missing artefact | Verdict is `NEEDS REVISION`, finding cites the missing file |
| Rubric section missing | Stop; the playbook is incomplete |
| Two rounds pass without CLEAR | Escalate to the human; do not run a third |
