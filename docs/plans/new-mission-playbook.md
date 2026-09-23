# Writing a brand-new mission from scratch

This is a different job from the first ten missions. Those took existing
workbook text and re-graded it. These SDGs have no workbook sheet — you are
writing an original 20-slide Pecha Kucha talk, at three CEFR levels, on a topic
that has never existed in this repo before. The facts in it have to be real.

Read this whole file before starting. It is the one place the rules live, so
every new-mission agent works from the same standard.

## 0. Non-negotiables

- **Every factual claim must be researched, not invented.** Use WebSearch /
  WebFetch. A statistic, a law name, a date, an institution name — if you did
  not find it in a real source, do not put a specific number on it; say it in
  general terms instead ("a large share of," not "43%").
- **Facts go in `basis` with their source.** Not a URL dump — a phrase is
  enough ("MOEA 2024 energy statistics; Water Resources Agency reservoir
  data"), but it has to be traceable if someone wants to check it.
- **Taiwan-specific, university-STEM-audience, spoken register.** This is a
  speech a real undergraduate delivers standing up, not an essay. Contractions
  are fine, rhetorical questions are good, every sentence has to be sayable in
  one breath.
- **Quality is the point, not speed.** A mission that passes the gate by
  accident is not the goal. Read it aloud in your head before you call it
  finished.

## 1. The shape every mission takes

20 slides, six parts, in this fixed distribution (this is what makes it a true
Pecha Kucha talk — 20 slides × 20 seconds = 6:40 — and it is what the rest of
the material already uses):

| Part | Slides | Function | Language pattern |
| --- | --- | --- | --- |
| 1 Introduction | 1–3 | hook, define the SDG, ground it in Taiwan | rhetorical questions / "X is about…" |
| 2 Problem | 4–6 | trend, cause and effect | present progressive for trends / "this causes…" |
| 3 Achievements | 7–9 | evidence, comparison | present perfect / comparatives |
| 4 Solutions | 10–12 | approaches, trade-offs | instead of + V-ing / modal verbs |
| 5 Implications | 13–16 | consequences, tension | first conditional / however |
| 6 Call to action | 17–20 | summary, ask | to wrap up… / let's… |

Design the 20 slide topics before writing any script text. A weak slide plan
produces a weak talk no matter how well the sentences are written — this is
where the sdg13-1 reference's known failure was (Part 5 becoming four
disconnected mini-topics with no throughline). Make Part 5 in particular argue
one continuous tension across its four slides, not four separate items.

## 2. Register per level (from `scripts/author_levels.py`)

- **A2** — present simple and past simple, common everyday words, at most one
  clause per sentence, no participle clauses, no clefts, no fronting. Keep
  every number.
- **B1** — may use present perfect, first conditional, simple linking words
  (however, because of this); one subordinate clause is fine.
- **B2** — may use academic vocabulary, passive voice, concession (although,
  while) and hedging (may, tends to) — but still spoken English for a
  20-second slide, not written prose. `docs/research/gemini-sdg13-examiner-review.md`
  has the concrete failure mode to avoid: a B2 that raises difficulty only
  through vocabulary, with no B2 grammar, reads as "pompous," not advanced.

Word count is **not** the difficulty ladder — the clock is fixed at 20 seconds,
so all three levels carry roughly the same number of words. What has to climb
is sentence length, lexical load and grammatical range. Run
`python scripts/author_levels.py brief sdg13-1` for the full numeric spec
(exact word/sentence/FK bands per level) if you want it restated.

## 3. The calibrated reference

`content/authored/levels/sdg13-1.A2.json`, `.B1.json`, `.B2.json` are the
standard every mission is now held to — all four gates pass, three independent
reviews (a CEFR assessor, a speech coach + fact-checker, and an external
examiner run through Gemini) went into it. Read all three files. Match that
register, that level of factual density, that willingness to let B1 use real
present-perfect narrative rather than padding.

## 4. Recruiting Gemini to draft

You do not have to write the first draft alone. Calling Gemini for the initial
pass is expected — it is the fast way to get 60 slides of text on the page,
and it saves your own context for the verification loop, which is where the
real work is.

```bash
S="<your scratch dir>"
/c/Users/asd03/AppData/Local/agy/bin/agy.exe --model gemini-3.1-pro-high \
  --mode plan --dangerously-skip-permissions --print-timeout 900s \
  -p "$(cat "$S/prompt.md")" > "$S/draft.md" 2> "$S/draft.err.txt"
```

Build `prompt.md` yourself for each mission: the topic, the 20-slide outline
you designed, the researched facts (with what they're worth — don't hand
Gemini a bare topic and let it invent statistics), the register table above,
three or four calibration slides quoted from the sdg13-1 reference, and an
explicit instruction to write all three levels as genuinely different texts
(not one text with synonyms swapped — this was the single most common failure
in round one; `python scripts/quality.py` enforces a 0.34 vocabulary-overlap
ceiling between adjacent levels and will catch it).

**Never treat a Gemini draft as finished.** It is a starting point. Read it
against every rule in this file, fix what it gets wrong (register, fact
accuracy, lint issues in `scripts/quality.py`'s `LINT` list, sentence rhythm),
and expect at least one full revision pass before it is worth running through
the gate.

## 5. File format

### The shell — `content/authored/missions/<mission_id>.source.json`

This replaces "the workbook" for a mission that never had one. It carries the
title and the 20 slide topics; the actual scripts are empty here and filled by
the overlay files in step 6.

```json
{
  "mission_id": "sdg2-1",
  "sdg": 2,
  "title": {"en": "Taiwan's Food Security in a Changing Climate", "zh": null},
  "stages": [
    {
      "part_no": 1,
      "source_description": "Part 1: Introduction (Slides 1-3: hook, SDG 2 definition, Taiwan's import dependency)",
      "function_en": "Introduction",
      "function_zh": "引言：破題與定義",
      "language_pattern": "rhetorical questions / X is about ...",
      "slides": [
        {"slide_no": 1, "title": {"en": "...", "zh": null}, "numbers": [], "scripts": {}}
      ]
    }
  ]
}
```

Six `stages` entries (`part_no` 1–6, `function_en`/`function_zh`/`language_pattern`
copied verbatim from the table in section 1), 20 `slides` total across them in
the 3/3/3/3/4/4 split. `numbers` and `scripts` start empty — leave them empty
in the shell; `scripts` gets filled by merging the overlay files below when
`scripts/extract_content.py` runs.

### The overlays — `content/authored/levels/<mission_id>.<LEVEL>.json`

One file per level, same format the first ten missions used:

```json
{
  "mission_id": "sdg2-1",
  "level": "B1",
  "provenance": "authored",
  "author": "Claude + Gemini 3.1 Pro draft, reviewed by Claude",
  "basis": "New mission, no workbook source. Facts: rice self-sufficiency ~23% (COA 2023); typhoon-driven import disruption 2023 (cite). Register per docs/plans/new-mission-playbook.md.",
  "reviewed_by": null,
  "slides": {"1": "...", "2": "...", "...": "...", "20": "..."}
}
```

`provenance` is `"authored"` for every level here (there is no workbook level
to replace).

## 6. Build, gate, iterate

```bash
python scripts/extract_content.py            # merges your shell + overlays
python scripts/gate.py overlay <mission_id>   # the four per-slide tests
python scripts/grammar_range.py <mission_id>  # does each level use its grammar
```

Fix and repeat until every level of every mission you own prints PASS on the
gate and OK on grammar range. This is the same loop the first ten missions
used — read `scripts/quality.py` and `scripts/grammar_range.py` directly if a
failure reason isn't obvious; they are short and the comments explain the
"why," not just the "what."

## 7. What to report back

For each mission: the final gate + grammar-range output, the facts you used
and where they came from, and anything you found doubtful or couldn't verify
(say so — an unverifiable claim softened to a general statement is fine; an
unverifiable claim stated as a precise number is not).
