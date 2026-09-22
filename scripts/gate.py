"""Run the quality gate over every mission and print the state of the material.

  python scripts/gate.py              # the whole matrix, one line per mission
  python scripts/gate.py sdg13-1      # every failure on one mission, in detail
"""
from __future__ import annotations

import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(REPO, "content", "source")
sys.path.insert(0, os.path.join(REPO, "scripts"))
from quality import LEVELS, check_distance, check_level  # noqa: E402


def load_all() -> list:
    out = []
    for fname in sorted(os.listdir(SOURCE)):
        if fname.endswith(".json") and not fname.startswith("_"):
            with open(os.path.join(SOURCE, fname), encoding="utf-8") as fh:
                out.append(json.load(fh))
    return out


def by_level(m: dict) -> dict:
    out = {}
    for st in m["stages"]:
        for s in st["slides"]:
            for lv, sc in s["scripts"].items():
                out.setdefault(lv, {})[str(s["slide_no"])] = sc["text"]
    return out


def verdicts(m: dict) -> tuple:
    levels = by_level(m)
    return ({lv: check_level(levels[lv], lv) for lv in LEVELS if lv in levels},
            check_distance(levels))


def summarise(m: dict) -> str:
    v, dist = verdicts(m)
    cells = []
    for lv in LEVELS:
        if lv not in v:
            cells.append(f"{lv}:--")
            continue
        r = v[lv]
        if r["pass"]:
            cells.append(f"{lv}:ok")
        else:
            bits = []
            if r["hard"]:
                bits.append(f"{len(r['hard'])}f")
            if not r["soft_rate_ok"]:
                bits.append(f"{int(r['soft_rate']*100)}%s")
            high = sum(1 for x in r["style"].values() for sev, _ in x if sev == "high")
            if high:
                bits.append(f"{high}L")
            cells.append(f"{lv}:{'/'.join(bits) or 'x'}")
    d = " ".join(f"{k} {x['mean']}{'' if x['pass'] else '!'}" for k, x in dist.items())
    ready = all(lv in v and v[lv]["pass"] for lv in LEVELS) and all(x["pass"] for x in dist.values())
    return f"{m['mission_id']:9} {len(by_level(m).get('B1', {}) or by_level(m).get('A2', {})):3} sl  " \
           f"{'READY  ' if ready else 'needs  '} {'  '.join(cells):34} {d}"


def detail(mission_id: str) -> int:
    path = os.path.join(SOURCE, f"{mission_id}.json")
    with open(path, encoding="utf-8") as fh:
        m = json.load(fh)
    v, dist = verdicts(m)
    for lv in LEVELS:
        r = v.get(lv)
        print(f"\n=== {mission_id} {lv} ===")
        if not r:
            print("  level missing")
            continue
        print(f"  {r['slides']} slides, soft-miss rate {r['soft_rate']} "
              f"({'ok' if r['soft_rate_ok'] else 'OVER 0.2'})")
        for no, fails in r["hard"].items():
            print(f"  [fail] slide {no}: " + "; ".join(fails))
        for no, items in r["style"].items():
            for sev, msg in items:
                print(f"  [{sev:6}] slide {no}: {msg}")
    print("\n=== level distance ===")
    for pair, x in dist.items():
        print(f"  {pair}: mean {x['mean']} {'ok' if x['mean_ok'] else 'TOO CLOSE'}"
              + (f"  slides too close: {x['too_close']}" if x["too_close"] else ""))
    return 0


def detail_overlay(mission_id: str) -> int:
    """Check the authored overlay files directly — the fast loop while writing."""
    ovdir = os.path.join(REPO, "content", "authored", "levels")
    levels = {}
    for lv in LEVELS:
        path = os.path.join(ovdir, f"{mission_id}.{lv}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                levels[lv] = json.load(fh)["slides"]
    if not levels:
        print(f"no overlays for {mission_id}")
        return 1
    bad = 0
    for lv, slides in levels.items():
        r = check_level(slides, lv)
        print(f"=== {mission_id} {lv} — {r['slides']} slides, soft {r['soft_rate']}"
              f"{'' if r['soft_rate_ok'] else ' OVER'} — {'PASS' if r['pass'] else 'FAIL'}")
        for no, fails in r["hard"].items():
            print(f"  [fail] {no}: " + "; ".join(fails))
        for no, items in r["style"].items():
            for sev, msg in items:
                if sev != "low":
                    print(f"  [{sev}] {no}: {msg}")
        bad += not r["pass"]
    for pair, x in check_distance(levels).items():
        print(f"  {pair}: mean {x['mean']} {'ok' if x['mean_ok'] else 'TOO CLOSE'}"
              + (f"  {x['too_close']}" if x["too_close"] else ""))
        bad += not x["pass"]
    return 1 if bad else 0


def main(argv: list) -> int:
    if argv and argv[0] == "overlay":
        return detail_overlay(argv[1])
    if argv:
        return detail(argv[0])
    print("mission    slides state   A2/B1/B2 (f=fail slides, s=soft-miss rate, L=lint)   distance")
    ready = 0
    for m in load_all():
        line = summarise(m)
        ready += "READY" in line
        print(line)
    print(f"\n{ready} missions fully pass the gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
