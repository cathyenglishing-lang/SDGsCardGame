"""Does a level actually use the grammar its CEFR band claims?

The four tests in quality.py measure how hard the words are and how long the
sentences run. An external examiner pass on the SDG 13 reference showed that is
not sufficient: a text can clear every numeric band by swapping in academic
vocabulary while its syntax stays B1. The examiner's words were that the B2
"achieves complexity solely through C1/C2 academic lexical insertion".

This module looks for the structures themselves. The patterns are deliberately
conservative — they under-count rather than guess — so a mission that passes has
the features for real. Run it after the gate, not instead of it:

  python scripts/grammar_range.py            # every mission
  python scripts/grammar_range.py sdg13-1    # one mission, slide by slide
"""
from __future__ import annotations

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(REPO, "content", "source")
LEVELS = ("A2", "B1", "B2")

# Feature name -> (pattern, the level at which it starts to count)
FEATURES = {
    "cleft": (r"\b(?:[Ii]t (?:is|was) (?!a |an |the )\w+ (?:that|who)\b"
              r"|[Ww]hat (?:\w+ ){1,6}(?:is|was|are|were) )", "B2"),
    # Only the inverted forms count. "So where are we now?" is an ordinary
    # question, not fronting, and matching it flagged every A2 mission.
    "fronting": (r"(?:^|(?<=[.!?] ))(?:Not only|Only (?:then|when|after|by|if)|Never|"
                 r"Rarely|Seldom|No sooner)\b", "B2"),
    "participle_clause": (r"(?:^|[,;] )(?:[A-Za-z]+(?:ing|ed)) [a-z]+(?:[ ,]|$)", "B2"),
    "reduced_relative": (r"\b(?:\w+s|\w+) (?:built|made|manufactured|produced|written|"
                         r"given|taken|used|exchanged|held|based|found|sold) (?:here|in|by|on|at|with)\b", "B2"),
    "concession": (r"\b(?:although|though|whereas|even though|nevertheless|nonetheless|"
                   r"even so|while)\b", "B1"),
    "passive": (r"\b(?:is|are|was|were|been|being|has been|have been|had been)\s+"
                r"\w+(?:ed|en|t)\b", "B1"),
    "modal_hedge": (r"\b(?:may|might|could|tends? to|appears? to|seems? to|is likely to)\b", "B1"),
    "conditional": (r"\b[Ii]f\b[^.?!]*\b(?:will|would|can|could|might)\b", "B1"),
    "present_perfect": (r"\b(?:has|have)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b|"
                        r"\b(?:has|have)\s+(?:been|become|begun|done|gone|made|passed|built|"
                        r"spread|paid|written|taken|grown|risen)\b", "B1"),
    "relative_clause": (r"\b(?:which|who|whose|that)\s+\w+", "B1"),
    "subordinator": (r"\b(?:because|since|so that|unless|until|after|before|when)\b", "A2"),
}

# A level must show at least this many DISTINCT features across the mission, and
# these particular ones must appear somewhere.
REQUIRED = {
    "A2": {"min_distinct": 2, "must": ["subordinator"],
           "forbidden": ["cleft", "fronting", "participle_clause"]},
    "B1": {"min_distinct": 5,
           "must": ["present_perfect", "conditional", "relative_clause"],
           "forbidden": ["cleft", "fronting"]},
    "B2": {"min_distinct": 7,
           "must": ["concession", "passive", "participle_clause"],
           "forbidden": []},
}

# Structures a B2 should show somewhere in twenty slides, even if not on every
# one. Missing all of these is the "hard words, easy syntax" failure.
B2_SIGNATURE = ["cleft", "fronting", "participle_clause", "reduced_relative"]
B2_SIGNATURE_MIN = 2


def find(text: str) -> set:
    return {name for name, (pat, _) in FEATURES.items() if re.search(pat, text)}


def audit(slides: dict, level: str) -> dict:
    per_slide = {no: find(t) for no, t in slides.items()}
    present = set().union(*per_slide.values()) if per_slide else set()
    rule = REQUIRED[level]
    missing = [f for f in rule["must"] if f not in present]
    leaked = sorted(f for f in rule.get("forbidden", []) if f in present)
    counts = {f: sum(1 for s in per_slide.values() if f in s) for f in sorted(present)}
    out = {
        "level": level,
        "distinct": len(present),
        "counts": counts,
        "missing_required": missing,
        "above_level": leaked,
        "bare_slides": sorted((no for no, s in per_slide.items() if not s), key=int),
    }
    ok = len(present) >= rule["min_distinct"] and not missing
    if level == "B2":
        sig = [f for f in B2_SIGNATURE if f in present]
        out["b2_signature"] = sig
        out["b2_signature_ok"] = len(sig) >= B2_SIGNATURE_MIN
        ok = ok and out["b2_signature_ok"]
    if level != "B2" and leaked:
        ok = False
    out["pass"] = ok
    return out


def levels_of(m: dict) -> dict:
    out = {}
    for st in m["stages"]:
        for s in st["slides"]:
            for lv, sc in s["scripts"].items():
                out.setdefault(lv, {})[str(s["slide_no"])] = sc["text"]
    return out


def main(argv: list) -> int:
    names = [argv[0]] if argv else [f[:-5] for f in sorted(os.listdir(SOURCE))
                                    if f.endswith(".json") and not f.startswith("_")]
    bad = 0
    for name in names:
        with open(os.path.join(SOURCE, f"{name}.json"), encoding="utf-8") as fh:
            m = json.load(fh)
        lv = levels_of(m)
        for level in LEVELS:
            if level not in lv:
                print(f"{name:9} {level}  -- missing")
                bad += 1
                continue
            r = audit(lv[level], level)
            state = "ok    " if r["pass"] else "FAIL  "
            print(f"{name:9} {level}  {state} {r['distinct']} features"
                  + (f"; missing {','.join(r['missing_required'])}" if r["missing_required"] else "")
                  + (f"; above level: {','.join(r['above_level'])}" if r["above_level"] else "")
                  + (f"; B2 signature {r.get('b2_signature')}" if level == "B2" else "")
                  + (f"; {len(r['bare_slides'])} slides with no marked structure"
                     if r["bare_slides"] else ""))
            if argv:
                for f, c in r["counts"].items():
                    print(f"              {f}: {c} slides")
            bad += not r["pass"]
    print(f"\n{bad} level(s) fail the grammatical-range check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
