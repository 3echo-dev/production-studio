# Cut rules

For the sequence stage. Owned by `sequence-director`. Every rule reflects a real cost of getting it wrong on an agency shoot.

## Rules

1. **Storyboard order is authoritative.** Panel order in `storyboard.json` is the cut order. A reorder is a pre-prod change, not a post decision.
2. **Best take, not first take.** For each panel, the CLIP embedder ranks up to five candidates; the top-1 wins unless a `revisions/{n}.json` names a different take.
3. **Match score threshold: 0.28.** Below this, the panel lands in `unmatchedPanels[]` and waits on the human. Do not silently place a weak match.
4. **Cut window default: 3 seconds** centred on the match frame. Clamp by `deliverableDurationSec / panelCount` when the sum would overshoot.
5. **Never invent a take.** Every cut references a `clipSha256` from `manifest.json`. A cut with no manifest match is a bug, not a hole to fill.
6. **Timecode is honest.** `inSec` and `outSec` come from ffprobe on the actual clip; not from filename hints.
7. **Reference cut is a hint, not a truth.** If `referenceCutPath` is set, use its pacing to inform cut lengths; do not copy its shot choices unless the storyboard matches.
8. **`audioLed: true` gets shorter default cuts.** VO-led pieces run 2s default per beat; picture-led gets 3s.
9. **Unmatched panels are surfaced, not hidden.** `timeline.png` shows a red slot per unmatched panel so the reviewer sees the holes at a glance.
10. **No B-roll fill in the sequence.** If a panel has no shot, it stays unmatched. B-roll is a human decision, not a sequence-director fill.

## Checklist

- [ ] Every panel from `storyboard.json` is either in `cuts[]` or in `unmatchedPanels[]`
- [ ] Every `clipSha256` in `cuts[]` exists in `manifest.json`
- [ ] Every cut carries a `matchScore` and `matchReason`
- [ ] Sum of `outSec - inSec` ≤ `deliverableDurationSec`
- [ ] `timeline.png` short-side ≥ 480px and labels every cut with panel id + score
- [ ] No cut has score below 0.28
- [ ] `rough-edl.json` validates against `schemas/edl.schema.json`
