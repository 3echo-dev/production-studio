# B-roll rules

For the B-roll stage. Owned by `broll-director`. B-roll is human-requested, single-shot, saved to folder, never auto-spliced.

## Rules

1. **One request = one job = one MP4.** Do not batch requests; each is a separate quote and spend.
2. **Requests come from the human on the board.** A chat mention is not a request; `broll-requests/{n}.json` on disk is.
3. **Every request names shot, duration, aspect, refs.** Missing fields park the request until the person fills them.
4. **Explicit yes before spend.** The board ask names assumptions in one line; the spend guard refuses without a yes on record.
5. **SeeDance limits: 9 image refs, 3 video refs, 3 audio refs.** Over the limit, ask which to drop; do not silently trim.
6. **Idempotency key: `{jobId}/broll/{n}`.** A retry uses the same key so re-runs do not double-spend.
7. **Slate frame extracted on landing.** First frame as PNG under `bundle/broll/slates/`; the editor browses by slate.
8. **Redo is a new request** with `supersedes: {n}`. Originals stay on disk as `_v1`, `_v2`.
9. **Never splice into `rough-edl.json`.** The editor decides where B-roll goes in Premiere.
10. **Never generate speculative B-roll.** No "just in case" shots; every shot is a request.
11. **Aspect matches the deliverable** unless the request explicitly overrides.
12. **Validate on landing:** file opens, short side ≥ 480px, duration within 0.5s of the request.

## Checklist

- [ ] `broll-requests/{n}.json` exists and is complete
- [ ] Assumptions posted to board and chat in one line
- [ ] Yes on record before `create_video_job` fires
- [ ] `idempotencyKey: "{jobId}/broll/{n}"`
- [ ] Ref counts within 9/3/3 limits
- [ ] MP4 lands at `bundle/broll/shot-{nn}_{slug}_v{k}.mp4`
- [ ] Slate PNG at `bundle/broll/slates/shot-{nn}_v{k}.png`
- [ ] Request updated: `status: delivered`, `deliveredPath`, `credits`
- [ ] Nothing added to `rough-edl.json`
