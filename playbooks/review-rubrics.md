# Review rubrics

Owned by `review-director`. One rubric per gate. Findings scored `critical`, `major`, `minor`. Verdict: `CLEAR`, `NEEDS REVISION`, `WARNINGS ONLY`.

Gate B has no rubric — delivery is a mechanical check (`delivery_promise`) and the human approver's release call.

## Gate A: picture + audio lock

Combined rubric. The creative director locks picture and audio together.

### Critical (six items)

1. **Every storyboard panel is placed or explicitly unmatched.** No silent skips.
2. **Every cut references a real clip** (`clipSha256` in `manifest.json`).
3. **Total picture duration ≤ `deliverableDurationSec`.** A cut that overshoots is a fail.
4. **`bgm-choice.json` exists and is signed on the board.**
5. **`synced-track.wav` exists at 48kHz stereo.**
6. **`synced-track.json` binds to `rough-edl.json` by matching sha256.** No dangling audio.

### Major (twelve items)

7. **Best-take rationale on file.** Every cut has a `matchScore` and `matchReason`.
8. **Unmatched panels flagged in `timeline.png`.**
9. **No cut with `matchScore` below 0.28.**
10. **VO placement matches script marker order.**
11. **VO end time within one frame of the corresponding picture cut end.**
12. **BGM licensing named plainly.** `royalty-free`, `single-use`, `unlimited`, `custom`.
13. **BGM ducking recorded.** `duckDb` is present.
14. **Waveform PNG same duration as WAV.**
15. **Aspect ratio in EDL matches `job.json`.**
16. **Frame rate consistent across EDL and audio track.**
17. **No mograph on the timeline yet.** Mograph is a later stage; Gate A is picture + audio only.
18. **No B-roll spliced into cuts.** B-roll is not-yet-requested at Gate A.

### Minor (rest)

19. **Cut lengths are within 30% of the storyboard-implied length** per panel.
20. **BGM key does not clash with VO fundamental** (informational, not blocking).
21. **SFX cues honoured if `sfx-cues.json` present.**
22. **`timeline.png` label font readable at review resolution.**
23. **Notes on unmatched panels named the shot the person asked for.**
24. **File naming per convention.**

## Verdict rules

- `CLEAR`: no critical, ≤3 major.
- `NEEDS REVISION`: any critical, or >3 major. One `revisions/{n}.json` per critical.
- `WARNINGS ONLY`: no critical, 1-3 major.

## Checklist for the reviewer

- [ ] Every rubric item scored
- [ ] Every finding cites evidence (file:line or panel id)
- [ ] Verdict named at the top of `validation/review-a-{round}.md`
- [ ] Counts named at the top
- [ ] `revisions/{n}.json` written for each critical (only)
- [ ] No edit to any reviewed artefact
- [ ] Round count ≤ 2 for the same stage
