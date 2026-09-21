# BGM rules

For the BGM stage. Owned by `bgm-supervisor`. Music choice fights the cut when picked without the picture in mind.

## Rules

1. **Exactly three candidates.** Not two, not four. Three keeps the pick a real choice; more turns the board into a shopping list.
2. **Tone words come from the script,** not from the storyboard. The storyboard visuals inform energy curve; the script's language sets tone.
3. **Energy curve is one of five:** `build`, `flat`, `peak-mid`, `peak-end`, `release`. Pick the one that matches the cut's dramatic arc; no free text.
4. **Duration match, or longer.** A track shorter than the cut is refused; a longer track will be trimmed at sync.
5. **Licensing is named plainly.** `royalty-free`, `single-use`, `unlimited` or `custom`. A candidate with unclear licensing is dropped and re-quoted.
6. **Preview URL is verified.** If the source did not return a preview, the candidate is dropped and re-quoted.
7. **No reuse across projects without a licence check.** A track used on job A is not automatically clear for job B.
8. **BGM choice is signed on the board.** `bgm-choice.json` carries `signedBy` and `signedAt`. Sync refuses without it.
9. **A change to the cut duration re-opens BGM.** If `rough-edl.json` changes total duration by more than 10%, the BGM options are re-quoted.
10. **Reference tracks are for tone, not for retrieval.** If the script says "in the style of X", extract tone words from X; do not try to source X itself.

## Checklist

- [ ] `bgm-options.json` has exactly three candidates
- [ ] Each candidate names `title`, `bpm`, `keyRoot`, `keyMode`, `licensing`
- [ ] Each candidate's `previewUrl` responds 200 or has a valid `localPath`
- [ ] Each candidate's `durationSec` ≥ picture duration
- [ ] Rationale one line per candidate
- [ ] `bgm-choice.json` written after board reply, with `signedBy` + `signedAt`
- [ ] Chosen candidate id matches one from options
