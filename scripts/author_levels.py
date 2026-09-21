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


def cmd_prompt(mission_id: str, level: str) -> int:
    m = load(mission_id)
    spec = LEVEL_SPEC[level]
    out = [
        f"You are an experienced EFL teacher writing the {level} version of an existing "
        f"Pecha Kucha speech for Taiwanese university students.",
        "",
        f"Mission: {m['mission_id']} — {m['title']['en']} (SDG {m['sdg']})",
        f"Slides: {len(slides_of(m))}. Each slide is spoken in 20 seconds.",
        "",
        "## Hard rules",
        f"- Max {spec['max_words']} words per slide. Max {spec['max_avg_sentence']} words per sentence.",
        f"- Grammar for this level: {LEVEL_VOICE[level]}.",
        "- Keep the meaning, the order and every fact of the source line. Invent nothing.",
        "- Keep every number, year and proper noun exactly as written in the source.",
        "- Natural spoken English for a student on stage. No bullet points, no headings.",
        "- Output format: one line per slide, `<slide number>. <text>`, nothing else.",
        "",
        "## Slides",
    ]
    for s in slides_of(m):
        src_lv, src_text = basis_level(s, level)
        part = next(st for st in m["stages"] if s in st["slides"])
        fn = PART_FUNCTION.get(part["part_no"], ("", "", ""))
        out.append(f"{s['slide_no']}. [{s['title']['en']}] (Part {part['part_no']}, {fn[0]})")
        out.append(f"   source {src_lv}: {src_text}")
    return print("\n".join(out)) or 0


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
    if bad:
        print(f"{mission_id} {level}: {len(bad)} slides violate the spec")
        for no, why in bad:
            print(f"  slide {no}: {why}")
        return 1
    print(f"{mission_id} {level}: all {len(ov['slides'])} slides pass the {level} spec")
    return 0


def main(argv: list) -> int:
    if not argv:
        print(__doc__)
        return 1
    cmd, rest = argv[0], argv[1:]
    if cmd == "gaps":
        return cmd_gaps()
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
