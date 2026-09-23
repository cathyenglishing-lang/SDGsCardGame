# Where the material work stands

Resume point for the SDGs Pecha Kucha material. Everything below is reproducible
from the repo — no state lives only in a chat transcript.

## Phase 1 — DONE: level the five existing SDGs (10 missions)

All ten missions that had workbook source (sdg1, sdg4-1, sdg4-2, sdg5-1, sdg5-2,
sdg9-1, sdg9-2, sdg9-3, sdg13-1, sdg13-2) pass the four-part gate and the
grammatical-range check at A2/B1/B2. Full detail: doc tab "教材品質稽核",
commits through `da4430c`.

## Phase 2 — IN PROGRESS: all 17 SDGs, three missions each (51 total)

User instruction (2026-09-23): fill out every SDG, not just the five with
existing workbook content, so the final material has 3 missions per SDG for
all 17 — same standard as SDG 9. Scope: English-quality material only; the
game build is a later, separately-directed phase.

### What "3 missions each" requires

| SDG | Have | Need | Status |
| --- | --- | --- | --- |
| 1 No Poverty | 1 (sdg1) | +2 | not started |
| 2 Zero Hunger | 0 | +3 | not started |
| 3 Good Health | 0 | +3 | not started |
| 4 Quality Education | 2 (sdg4-1/2) | +1 | not started |
| 5 Gender Equality | 2 (sdg5-1/2) | +1 | not started |
| 6 Clean Water | 0 | +3 | not started |
| 7 Clean Energy | 0 | +3 | not started |
| 8 Decent Work | 0 | +3 | not started |
| 9 Industry/Innovation | 3 (sdg9-1/2/3) | 0 | done |
| 10 Reduced Inequalities | 0 | +3 | not started |
| 11 Sustainable Cities | 0 | +3 | not started |
| 12 Responsible Consumption | 0 | +3 | not started |
| 13 Climate Action | 2 (sdg13-1/2) | +1 | not started |
| 14 Life Below Water | 0 | +3 | not started |
| 15 Life on Land | 0 | +3 | not started |
| 16 Peace/Justice/Institutions | 0 | +3 | not started |
| 17 Partnerships | 0 | +3 | not started |

41 new missions total. Proposed topics for all of them are in the doc tab
"SDGs 教材擴充計畫" — that is the source of truth for what each agent is
writing; this file tracks completion state only.

### Infrastructure built for this phase

- `scripts/extract_content.py` now auto-discovers any
  `content/authored/missions/<id>.source.json` with no matching workbook sheet
  (generalizes what used to be an sdg1-only special case).
- `scripts/build_canonical.py` discovers missions from `content/source/*.json`
  instead of a hand-maintained dict — a new mission needs no code edit.
- `docs/plans/new-mission-playbook.md` — the full workflow every new-mission
  agent follows: research real facts, draft with Gemini, verify and fix
  against the same gate as phase 1, report facts and sources. Read this before
  touching a new mission; it is not repeated per-agent.

### How to check anything

```
python scripts/extract_content.py           # merge shells + overlays
python scripts/gate.py                      # the matrix, one line per mission
python scripts/gate.py overlay <mission>     # per-slide failures, fast loop
python scripts/grammar_range.py              # does each level use its grammar
python scripts/build_canonical.py            # rebuild the deliverable Excel/JSON/MD
```

### Open question for the user (unresolved from phase 1)

Whether to keep the reference to Taiwan being excluded from the international
climate negotiations (sdg13-1/13-2). Wording was made accurate; the fact was
not removed. Still the user's call.
