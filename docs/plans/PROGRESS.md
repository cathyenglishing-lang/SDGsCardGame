# Where the material work stands

Resume point for the SDGs Pecha Kucha material. Everything below is reproducible
from the repo — no state lives only in a chat transcript.

## The goal

One mission per SDG card on the live site, every one carrying the same three
levels A2 / B1 / B2, every level genuinely at that level and genuinely good
English. Ten missions exist: sdg1, sdg4-1, sdg4-2, sdg5-1, sdg5-2, sdg9-1,
sdg9-2, sdg9-3, sdg13-1, sdg13-2. The stray A1 on sdg4-1 and sdg5-1 is left in
the data but is not part of the standard ladder.

## How to check anything

```
python scripts/extract_content.py          # merge overlays into content/source
python scripts/gate.py                     # the matrix, one line per mission
python scripts/gate.py overlay <mission>   # per-slide failures, fast loop
python scripts/grammar_range.py            # does each level use its grammar
python scripts/author_levels.py brief <m>  # the full writing brief for a mission
```

Source workbooks are never edited. All new writing lives in
`content/authored/levels/<mission>.<LEVEL>.json` as overlays, each carrying its
own `basis` and `provenance`, and merged at extract time.

## State as of 2026-09-22

Gate = the four per-slide tests in `scripts/quality.py`.
Grammar = `scripts/grammar_range.py`.

| Mission | Gate A2 | Gate B1 | Gate B2 | What is left |
| --- | --- | --- | --- | --- |
| sdg13-1 | pass | pass | pass | none — this is the calibration reference |
| sdg9-1 | pass | pass | pass | grammar check not yet confirmed |
| sdg13-2 | pass | 1 slide | pass | that slide, plus per-slide A2/B1 overlap |
| sdg5-1 | pass | 1 slide | soft 35% | that slide, and nudge B2 near-misses inside band |
| sdg4-1 | pass | pass | 20 slides | B2 needs rewriting |
| sdg1 | pass | 12 slides | 18 slides | B1 and B2 need rewriting |
| sdg4-2 | 19 slides | 20 slides | 20 slides | all three; B1→B2 distance 0.40 over limit |
| sdg9-2 | 8 slides | 10 slides | 11 slides | all three; B1→B2 distance 0.52 over limit |
| sdg5-2 | 20 slides | 19 slides | 19 slides | all three; A2→B1 distance 0.63 — one text, three labels |
| sdg9-3 | 12 slides | 11 slides | 11 slides | all three; both distances 0.57 — one text, three labels |

Where a distance is over 0.34, do not edit the existing pair — write the two
levels as separate texts. Editing does not move 0.57 to under 0.34.

## What was decided, and why

- **The ladder is syntax and lexis, not word count.** Pecha Kucha fixes the
  time, so all three levels get a similar number of words. Bands are in
  `scripts/quality.py`.
- **Each level has its own speaking rate** (A2 95, B1 110, B2 120 wpm). One
  shared rate of 130 was the original bug: it made every normal A2 slide look
  like it left five seconds of dead air.
- **Digits are words.** "2050" is spoken, so it counts.
- **An overlay keeps the workbook text it replaced** in `workbook_text`, so a
  rewrite can still be audited for faithfulness. Without this nobody could check
  whether a rewrite had quietly dropped a fact — and two had.
- **Level distance ignores proper nouns and numbers.** A law is called the same
  thing at every level.
- **Grammatical range is checked separately** because the numeric gate cannot
  see the difference between real B2 syntax and B1 syntax wearing hard words.

## Audits on file

`docs/research/gemini-sdg13-examiner-review.md` plus two agent audits summarised
in the doc tab "教材品質稽核". Their accepted findings are already applied to
sdg13-1. Two factual corrections were rejected with reasons recorded: the carbon
fee is in force (effective 2025-01-01, first payments due 2026-05-31), and the
1.3 °C global figure is the same-period comparison from the Taiwan NSTC 2024
report, not the present-day anomaly.

## Open question for the user

Whether to keep the reference to Taiwan being excluded from the international
climate negotiations. The wording was made more accurate (it is UNFCCC and COP,
not UN membership) but the fact was not removed. That is the user's call.

## Not started

The 3D speech game itself. The user directs that once the material is confirmed.
