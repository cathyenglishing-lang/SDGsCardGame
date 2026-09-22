"""Author the missing CEFR levels for each mission, with a spec gate.

The teaching material does not carry every level for every mission, and some
levels that exist do not read at the level they claim. This tool drives that
work without ever touching the source workbooks:

  prompt   emit a writing brief for one mission+level (fed to a writer model)
  ingest   turn a numbered draft back into content/authored/levels/<m>.<lv>.json
  check    measure an overlay against the CEFR spec and list every violation
  gaps     list what is still missing or failing across all missions

Usage:
  python scripts/author_levels.py gaps
  python scripts/author_levels.py prompt sdg5-1 A1 > /tmp/brief.md
  python scripts/author_levels.py ingest sdg5-1 A1 /tmp/draft.txt
  python scripts/author_levels.py check sdg5-1 A1
"""
from __future__ import annotations

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(REPO, "content", "source")
OVERLAY = os.path.join(REPO, "content", "authored", "levels")

sys.path.insert(0, os.path.join(REPO, "scripts"))
from extract_content import LEVEL_SPEC, PART_FUNCTION, measure, clean  # noqa: E402

# A level must not only stay under its ceiling; it must also feel harder than the
# level below it. These bands are the ladder the three levels have to climb.
LEVEL_BAND = {
    "A1": {"words": (16, 32), "sentence": (5, 10), "fk": (1.0, 5.0)},
    "A2": {"words": (26, 35), "sentence": (7, 12), "fk": (3.0, 7.0)},
    "B1": {"words": (32, 40), "sentence": (11, 16), "fk": (7.0, 11.0)},
    "B2": {"words": (34, 43), "sentence": (14, 20), "fk": (11.0, 15.0)},
}

REFERENCE: dict = {}

LEVEL_VOICE = {
    "A1": "present simple only, the 500 most common English words, no relative clauses, "
          "no passive voice, no conditionals; keep every number that appears in the source",
    "A2": "present simple and past simple, common everyday words, at most one clause per "
          "sentence, no participle clauses; keep every number",
    "B1": "may use present perfect, first conditional and simple linking words (however, "
          "because of this); one subordinate clause is fine",
    "B2": "may use academic vocabulary, passive voice, concession (although, while) and "
          "hedging (may, tends to), but still spoken English for a 20-second slide",
}


def _reference_samples() -> dict:
    """Three accepted slides per level from SDG 13, the calibrated reference mission."""
    out = {}
    for lv in ("A2", "B1", "B2"):
        path = os.path.join(OVERLAY, f"sdg13-1.{lv}.json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            ov = json.load(fh)
        picks = [ov["slides"].get(n) for n in ("2", "10", "16")]
        out[lv] = chr(10).join(f"  - {t}" for t in picks if t)
    return out


def load(mission_id: str) -> dict:
    with open(os.path.join(SOURCE, f"{mission_id}.json"), encoding="utf-8") as fh:
        return json.load(fh)


def slides_of(m: dict) -> list:
    return [s for st in m["stages"] for s in st["slides"]]


def basis_level(slide: dict, target: str) -> tuple:
    """Which existing level to rewrite from: the nearest one below, else above."""
    order = ["A1", "A2", "B1", "B2"]
    have = [lv for lv in order if lv in slide["scripts"]]
    if not have:
        return None, None
    ti = order.index(target)
    below = [lv for lv in have if order.index(lv) < ti]
    above = [lv for lv in have if order.index(lv) > ti]
    pick = below[-1] if below else above[0]
    return pick, slide["scripts"][pick]["text"]


def cmd_gaps() -> int:
    rows = []
    for fname in sorted(os.listdir(SOURCE)):
        if not fname.endswith(".json") or fname.startswith("_"):
            continue
        m = load(fname[:-5])
        summary = m.get("level_summary", {})
        for lv in ("A1", "A2", "B1", "B2"):
            if lv not in summary:
                rows.append((m["mission_id"], lv, "missing", ""))
                continue
            s, spec = summary[lv], LEVEL_SPEC[lv]
            problems = []
            if s["avg_sentence_words"] > spec["max_avg_sentence"]:
                problems.append(f"sentence {s['avg_sentence_words']}>{spec['max_avg_sentence']}")
            if s["avg_words"] > spec["max_words"]:
                problems.append(f"words {s['avg_words']}>{spec['max_words']}")
            if s["slides_over_20s"]:
                problems.append(f"{s['slides_over_20s']} slides over 20 s")
            if problems:
                rows.append((m["mission_id"], lv, "fails spec", "; ".join(problems)))
    print(f"{'mission':9} {'lv':3} {'state':11} detail")
    for r in rows:
        print(f"{r[0]:9} {r[1]:3} {r[2]:11} {r[3]}")
    print(f"\n{len(rows)} jobs")
    return 0


def cmd_brief(mission_id: str) -> int:
    """Everything an author needs for one mission: the spec, the calibrated
    reference, and the source text at every level that already exists."""
    from quality import BAND, FILL_BAND, LINT, MAX_JACCARD, MAX_JACCARD_MEAN, MAX_MISS_RATE
    from extract_content import LEVEL_WPM, capacity
    m = load(mission_id)
    slides = slides_of(m)
    out = [f"# Authoring brief — {mission_id}: {m['title']['en']} (SDG {m['sdg']}), "
           f"{len(slides)} slides",
           "",
           "You are a CELTA/DELTA-qualified EFL materials writer. Each slide is spoken aloud "
           "in exactly 20 seconds of a Pecha Kucha talk by a Taiwanese university student "
           "(L1 Mandarin). Write A2, B1 and B2 versions of every slide.",
           "",
           "## What makes a level, and what does not",
           "Word count is NOT the ladder — the clock is fixed, so all three levels get a "
           "similar number of words. What must climb is sentence length, lexical load and "
           "grammatical range. A B2 that is merely the B1 with Latinate words swapped in "
           "FAILS; so does an A2 that is the B1 with short synonyms.",
           ""]
    for lv in ("A2", "B1", "B2"):
        b, cap = BAND[lv], capacity(lv)
        out.append(f"### {lv} — spoken at {LEVEL_WPM[lv]} wpm, so {cap*FILL_BAND[0]:.0f}-{cap:.0f} "
                   f"words per slide")
        out.append(f"- words per sentence (slide average): {b['sentence'][0]}-{b['sentence'][1]}")
        out.append(f"- Flesch-Kincaid grade: {b['fk'][0]}-{b['fk'][1]}")
        out.append(f"- words of 8+ letters: {b['longword'][0]}-{b['longword'][1]}%")
        out.append(f"- register: {LEVEL_VOICE[lv]}")
        out.append("")
    out += [f"Every slide must sit in its band. At most {int(MAX_MISS_RATE*100)}% of slides may "
            f"miss narrowly. Vocabulary overlap between adjacent levels must stay under "
            f"{MAX_JACCARD} per slide and {MAX_JACCARD_MEAN} on average (proper nouns and "
            f"numbers are excluded, so keeping a law's name identical costs nothing).",
            "",
            "## House rules the gate enforces",
            ]
    out += [f"- {msg}" for _, _, msg in LINT]
    out += ["",
            "## Faithfulness — this is not optional",
            "- Keep the meaning, the order and every fact of the source line. Invent nothing.",
            "- Keep every number, year, law name, place and brand exactly as the source has it.",
            "- If a source claim is factually wrong or overstated, fix it and say so in `basis`; "
            "do not silently drop it.",
            "",
            "## Calibrated reference — SDG 13-1 passes the gate; match this standard"]
    for lv in ("A2", "B1", "B2"):
        path = os.path.join(OVERLAY, f"sdg13-1.{lv}.json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            ov = json.load(fh)
        out.append(f"{lv}:")
        for n in ("2", "11", "20"):
            if ov["slides"].get(n):
                out.append(f"  - {ov['slides'][n]}")
    out += ["", "## How to submit",
            f"Write content/authored/levels/{mission_id}.<LEVEL>.json with keys mission_id, "
            "level, provenance, author, basis, reviewed_by, slides (a map of slide number to "
            "text as strings).",
            f"Then run `python scripts/gate.py overlay {mission_id}` and fix until all three "
            "levels print PASS and both distances print ok.",
            "", "## Source slides"]
    for s_ in slides:
        part = next(st for st in m["stages"] if s_ in st["slides"])
        fn = PART_FUNCTION.get(part["part_no"], ("", "", ""))
        out.append("")
        out.append(f"{s_['slide_no']}. [{s_['title']['en']}] (Part {part['part_no']}, {fn[0]})")
        for lv in ("A1", "A2", "B1", "B2"):
            if lv in s_["scripts"]:
                out.append(f"   {lv}: {s_['scripts'][lv]['text']}")
    return print(chr(10).join(out)) or 0


def cmd_prompt(mission_id: str, level: str) -> int:
    m = load(mission_id)
    spec, band = LEVEL_SPEC[level], LEVEL_BAND[level]
    ref = REFERENCE.get(level, "")
    out = [
        f"You are a CELTA/DELTA-qualified EFL materials writer grading an existing Pecha Kucha "
        f"speech to CEFR {level} for Taiwanese university science students (L1 Mandarin).",
        "",
        f"Mission: {m['mission_id']} — {m['title']['en']} (SDG {m['sdg']})",
        f"{len(slides_of(m))} slides. Each slide is spoken aloud in exactly 20 seconds, so "
        f"anything over 43 words cannot be delivered.",
        "",
        "## The level must land inside a band, not merely under a ceiling",
        f"- Words per slide: {band['words'][0]}–{band['words'][1]} (hard ceiling {spec['max_words']}).",
        f"- Words per sentence, averaged: {band['sentence'][0]}–{band['sentence'][1]} "
        f"(hard ceiling {spec['max_avg_sentence']}).",
        f"- Flesch-Kincaid grade, averaged: {band['fk'][0]}–{band['fk'][1]}.",
        "- Too easy is a failure, not a safe choice: a level that reads like the level below it "
        "is rejected. Reach the top of the band with richer syntax, not with padding.",
        "",
        f"## Register for {level}",
        f"- {LEVEL_VOICE[level]}",
        "- This is a speech, not an essay: contractions are fine, rhetorical questions are good, "
        "and every slide must be sayable in one breath group per sentence.",
        "- Each slide opens the next: the six parts are Introduction, Problem, Achievements, "
        "Solutions, Implications, Call to action. Keep the discourse markers that signal them "
        "(so, however, to sum up) and keep the speaker's voice consistent across all slides.",
        "",
        "## Faithfulness",
        "- Keep the meaning, the order and every fact of the source line. Invent nothing.",
        "- Keep every number, year, law name, place and brand exactly as in the source.",
        "- Do not add new examples, statistics or opinions.",
        "",
        "## Output",
        "- One line per slide, `<slide number>. <text>`. No headings, no commentary, no markdown.",
    ]
    if ref:
        out += ["", f"## Calibration sample — this is the accepted {level} standard (SDG 13)", ref]
    out += ["", "## Slides to write"]
    for s_ in slides_of(m):
        src_lv, src_text = basis_level(s_, level)
        part = next(st for st in m["stages"] if s_ in st["slides"])
        fn = PART_FUNCTION.get(part["part_no"], ("", "", ""))
        out.append(f"{s_['slide_no']}. [{s_['title']['en']}] (Part {part['part_no']}, {fn[0]})")
        out.append(f"   source {src_lv}: {src_text}")
    return print(chr(10).join(out)) or 0


LINE_RE = re.compile(r"^\s*(\d{1,2})[\.\)]\s+(.+?)\s*$")


def cmd_ingest(mission_id: str, level: str, draft_path: str) -> int:
    m = load(mission_id)
    valid = {s["slide_no"] for s in slides_of(m)}
    slides = {}
    with open(draft_path, encoding="utf-8") as fh:
        for line in fh:
            hit = LINE_RE.match(line)
            if not hit:
                continue
            no = int(hit.group(1))
            if no in valid:
                slides[str(no)] = clean(hit.group(2))
    missing = sorted(valid - {int(k) for k in slides})
    if missing:
        print(f"WARNING: no text for slides {missing}", file=sys.stderr)
    payload = {
        "mission_id": mission_id,
        "level": level,
        "provenance": "authored" if level not in (m.get("level_summary") or {}) else "authored-replacement",
        "author": "Gemini 3.1 Pro draft, reviewed by Claude",
        "basis": f"Written from the existing levels of {mission_id} in the source workbook; "
                 f"meaning and facts unchanged, only graded for {level}.",
        "reviewed_by": None,
        "slides": slides,
    }
    os.makedirs(OVERLAY, exist_ok=True)
    path = os.path.join(OVERLAY, f"{mission_id}.{level}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"wrote {path} ({len(slides)} slides)")
    return cmd_check(mission_id, level)


def cmd_check(mission_id: str, level: str) -> int:
    path = os.path.join(OVERLAY, f"{mission_id}.{level}.json")
    if not os.path.exists(path):
        print(f"no overlay at {path}", file=sys.stderr)
        return 1
    with open(path, encoding="utf-8") as fh:
        ov = json.load(fh)
    spec = LEVEL_SPEC[level]
    bad = []
    for no, text in sorted(ov["slides"].items(), key=lambda kv: int(kv[0])):
        mm = measure(text)
        why = []
        if mm["words"] > spec["max_words"]:
            why.append(f"{mm['words']} words > {spec['max_words']}")
        if mm["avg_sentence_words"] > spec["max_avg_sentence"]:
            why.append(f"{mm['avg_sentence_words']} words/sentence > {spec['max_avg_sentence']}")
        if not mm["fits_20s"]:
            why.append(f"{mm['speak_seconds_est']} s > 20 s")
        if why:
            bad.append((no, "; ".join(why)))
    # whole-set ladder check: averages must sit inside the level band
    texts = [measure(t) for t in ov["slides"].values()]
    band = LEVEL_BAND[level]
    avg = {
        "words": sum(t["words"] for t in texts) / len(texts),
        "sentence": sum(t["avg_sentence_words"] for t in texts) / len(texts),
        "fk": sum(t["fk_grade"] for t in texts) / len(texts),
    }
    ladder = []
    for key, (lo, hi) in band.items():
        v = round(avg[key], 1)
        if v < lo:
            ladder.append(f"{key} {v:.1f} below the {level} band ({lo}-{hi}) — reads easier than {level}")
        elif v > hi:
            ladder.append(f"{key} {v:.1f} above the {level} band ({lo}-{hi})")
    if bad or ladder:
        if bad:
            print(f"{mission_id} {level}: {len(bad)} slides violate the hard spec")
            for no, why in bad:
                print(f"  slide {no}: {why}")
        for line in ladder:
            print(f"  ladder: {line}")
        return 1
    print(f"{mission_id} {level}: {len(ov['slides'])} slides pass the spec and sit inside the "
          f"{level} band (words {avg['words']:.1f}, sentence {avg['sentence']:.1f}, FK {avg['fk']:.1f})")
    return 0


def main(argv: list) -> int:
    REFERENCE.update(_reference_samples())
    if not argv:
        print(__doc__)
        return 1
    cmd, rest = argv[0], argv[1:]
    if cmd == "gaps":
        return cmd_gaps()
    if cmd == "brief" and len(rest) == 1:
        return cmd_brief(*rest)
    if cmd == "prompt" and len(rest) == 2:
        return cmd_prompt(*rest)
    if cmd == "ingest" and len(rest) == 3:
        return cmd_ingest(*rest)
    if cmd == "check" and len(rest) == 2:
        return cmd_check(*rest)
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
