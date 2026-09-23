"""Build the clean, canonical teaching material: one SDG = one mission, three levels.

Every mission the live site offers gets the same three levels, A2 / B1 / B2, and
nothing else: the stray A1 on a couple of missions stays in the data but is not
part of the standard ladder. Several goals carry more than one mission (4-1/4-2,
5-1/5-2, 13-1/13-2, 9-1/9-2/9-3) and all of them ship — the site shows them as
separate cards, so "one difficulty template per SDG" has to mean every card
carries the identical three levels.

Outputs (all generated, safe to delete and rebuild):
  content/canonical/<sdg>.json            game-ready, three levels only
  content/canonical/_index.json           manifest + per-level measures + gate result
  content/canonical/SDGs_PechaKucha_v1.xlsx   one sheet per SDG, the standard layout
  content/canonical/<sdg>.md              teacher review sheet

Run:  python scripts/extract_content.py && python scripts/build_canonical.py
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys

try:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError:  # pragma: no cover
    sys.exit("openpyxl required:  pip install openpyxl")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(REPO, "content", "source")
OUT = os.path.join(REPO, "content", "canonical")

sys.path.insert(0, os.path.join(REPO, "scripts"))
from extract_content import CONTENT_VERSION, PART_FUNCTION  # noqa: E402
from quality import BAND, FILL_BAND, MAX_JACCARD_MEAN, check_distance, check_level  # noqa: E402

LEVELS = ("A2", "B1", "B2")

# Every mission in content/source/ ships as its own card — discovered, not
# hand-listed, so a new mission needs no edit here. sdg9 established the
# pattern of several missions per goal (9-1/9-2/9-3); the rest now follow it.
def discover_missions() -> dict:
    out = {}
    for fname in sorted(os.listdir(SOURCE)):
        if not fname.endswith(".json") or fname.startswith("_"):
            continue
        mission_id = fname[:-5]
        with open(os.path.join(SOURCE, fname), encoding="utf-8") as fh:
            src = json.load(fh)
        out[mission_id] = {"source": mission_id, "sdg": src["sdg"], "title": src["title"]["en"]}
    return out

HEADER_FILL = PatternFill("solid", fgColor="1F2937")
LEVEL_FILL = {"A2": PatternFill("solid", fgColor="DCFCE7"),
              "B1": PatternFill("solid", fgColor="DBEAFE"),
              "B2": PatternFill("solid", fgColor="FEF3C7")}


def gate_mission(stages: list) -> tuple:
    """Run the per-slide gate over a built mission. Averages hid too much."""
    by_level = {}
    for st in stages:
        for s in st["slides"]:
            for lv, sc in s["scripts"].items():
                by_level.setdefault(lv, {})[str(s["slide_no"])] = sc["text"]
    verdict = {}
    for lv in LEVELS:
        if lv not in by_level:
            verdict[lv] = ["level missing"]
            continue
        r = check_level(by_level[lv], lv)
        why = [f"slide {no}: {'; '.join(f_)}" for no, f_ in r["hard"].items()]
        if not r["soft_rate_ok"]:
            why.append(f"{int(r['soft_rate'] * 100)}% of slides miss a band")
        why += [f"slide {no}: {msg}" for no, items in r["style"].items()
                for sev, msg in items if sev == "high"]
        verdict[lv] = why
    distance = {k: {"mean": v["mean"], "pass": v["pass"], "too_close": v["too_close"]}
                for k, v in check_distance(by_level).items()}
    return verdict, distance


def build_mission(canon_id: str, meta: dict) -> dict:
    with open(os.path.join(SOURCE, f"{meta['source']}.json"), encoding="utf-8") as fh:
        src = json.load(fh)
    stages = []
    for st in src["stages"]:
        fn = PART_FUNCTION.get(st["part_no"], ("", "", ""))
        slides = []
        for s in st["slides"]:
            scripts = {}
            for lv in LEVELS:
                sc = s["scripts"].get(lv)
                if not sc:
                    continue
                scripts[lv] = {k: sc[k] for k in
                               ("text", "words", "sentences", "avg_sentence_words",
                                "fk_grade", "speak_seconds_est", "fits_20s")}
                scripts[lv]["provenance"] = sc.get("provenance", "workbook")
            slides.append({
                "slide_no": s["slide_no"],
                "title": s["title"],
                "numbers": s["numbers"],
                "scripts": scripts,
                "authoring": s.get("authoring", {}),
            })
        stages.append({
            "part_no": st["part_no"],
            "function_en": fn[0], "function_zh": fn[1], "language_pattern": fn[2],
            "source_description": st["source_description"],
            "slides": slides,
        })
    summary = {lv: src["level_summary"][lv] for lv in LEVELS if lv in src.get("level_summary", {})}
    gate, distance = gate_mission(stages)
    return {
        "mission_id": canon_id,
        "sdg": meta["sdg"],
        "title": {"en": meta["title"], "zh": None},
        "content_version": CONTENT_VERSION,
        "levels": [lv for lv in LEVELS if lv in summary],
        "source_mission": meta["source"],
        "slide_count": sum(len(st["slides"]) for st in stages),
        "level_summary": summary,
        "gate": gate,
        "distance": distance,
        "ready": (all(not v for v in gate.values()) and len(summary) == 3
                  and all(d["pass"] for d in distance.values())),
        "stages": stages,
    }


def write_workbook(missions: list, path: str) -> None:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for m in missions:
        # Several goals carry more than one mission, so the sheet is named after
        # the mission, not the goal, or they would collide.
        label = m["mission_id"].replace("sdg", "SDG ").replace("-", "-")
        ws = wb.create_sheet(label)
        ws["A1"] = f"{label}: {m['title']['en']}"
        ws["A1"].font = Font(bold=True, size=13)
        for i, lv in enumerate(LEVELS):
            col = get_column_letter(6 + i)
            ws[f"{col}1"] = lv
            ws[f"{col}1"].font = Font(bold=True, color="FFFFFF")
            ws[f"{col}1"].fill = HEADER_FILL
            ws[f"{col}1"].alignment = Alignment(horizontal="center")
        for label, col in (("Part", "A"), ("Part description", "B"), ("No.", "C"),
                           ("Slide title (EN)", "D"), ("Slide title (ZH)", "E")):
            ws[f"{col}1"] = label if col != "A" else ws["A1"].value
        ws["B1"], ws["C1"], ws["D1"], ws["E1"] = "Part description", "No.", "Slide title (EN)", "Slide title (ZH)"
        for c in ("B1", "C1", "D1", "E1"):
            ws[c].font = Font(bold=True, color="FFFFFF")
            ws[c].fill = HEADER_FILL
        row = 2
        for st in m["stages"]:
            first = True
            for s in st["slides"]:
                if first:
                    ws[f"A{row}"] = f"Part {st['part_no']}"
                    ws[f"B{row}"] = f"{st['function_en']} / {st['function_zh']}"
                    ws[f"A{row}"].font = Font(bold=True)
                    first = False
                ws[f"C{row}"] = s["slide_no"]
                ws[f"D{row}"] = s["title"]["en"]
                ws[f"E{row}"] = s["title"]["zh"] or ""
                for i, lv in enumerate(LEVELS):
                    col = get_column_letter(6 + i)
                    sc = s["scripts"].get(lv)
                    ws[f"{col}{row}"] = sc["text"] if sc else ""
                    ws[f"{col}{row}"].alignment = Alignment(wrap_text=True, vertical="top")
                    if sc and sc["provenance"] != "workbook":
                        ws[f"{col}{row}"].fill = LEVEL_FILL[lv]
                row += 1
        for col, width in (("A", 10), ("B", 26), ("C", 6), ("D", 32), ("E", 26),
                           ("F", 62), ("G", 62), ("H", 62)):
            ws.column_dimensions[col].width = width
        ws.freeze_panes = "C2"
    notes = wb.create_sheet("README", 0)
    notes["A1"] = "SDGs Pecha Kucha — canonical teaching material"
    notes["A1"].font = Font(bold=True, size=14)
    lines = [
        f"content_version {CONTENT_VERSION} · generated {dt.date.today().isoformat()}",
        "",
        "One sheet per mission — every card on the site, all carrying the same three levels.",
        "  A Part · B Part description · C slide number · D English title · E Chinese title · F/G/H = A2 / B1 / B2",
        "",
        "Each slide is spoken in 20 seconds. How many words fit depends on the level, because a",
        "student reads an A2 script more slowly than a rehearsed B2 one: A2 95 wpm, B1 110, B2 120.",
        "So the word count is a fit constraint, not the difficulty ladder — all three levels carry a",
        "similar number of words. What climbs is sentence length and lexical load:",
        f"  A2 {BAND['A2']['sentence'][0]:.0f}-{BAND['A2']['sentence'][1]:.0f} words per sentence · "
        f"FK {BAND['A2']['fk'][0]}-{BAND['A2']['fk'][1]} · "
        f"{BAND['A2']['longword'][0]:.0f}-{BAND['A2']['longword'][1]:.0f}% long words",
        f"  B1 {BAND['B1']['sentence'][0]:.0f}-{BAND['B1']['sentence'][1]:.0f} · "
        f"FK {BAND['B1']['fk'][0]}-{BAND['B1']['fk'][1]} · "
        f"{BAND['B1']['longword'][0]:.0f}-{BAND['B1']['longword'][1]:.0f}%",
        f"  B2 {BAND['B2']['sentence'][0]:.0f}-{BAND['B2']['sentence'][1]:.0f} · "
        f"FK {BAND['B2']['fk'][0]}-{BAND['B2']['fk'][1]} · "
        f"{BAND['B2']['longword'][0]:.0f}-{BAND['B2']['longword'][1]:.0f}%",
        "Every slide is checked individually, not just the mission average, and adjacent levels must",
        f"not share more than {MAX_JACCARD_MEAN} of their vocabulary, or they are the same text twice.",
        "",
        "Coloured cells were written or re-graded for this edition; white cells are the original wording.",
        "This file is generated by scripts/build_canonical.py — edit the JSON or the overlays, not this sheet.",
    ]
    for i, line in enumerate(lines, start=3):
        notes[f"A{i}"] = line
    notes.column_dimensions["A"].width = 120
    wb.save(path)


def write_review(m: dict, path: str) -> None:
    out = [f"# {m['mission_id']} · {m['title']['en']} (SDG {m['sdg']})", "",
           f"{m['slide_count']} slides · levels {', '.join(m['levels'])} · "
           f"content_version {m['content_version']} · source `{m['source_mission']}`", ""]
    out += ["| 級別 | 每張字數 | 每句字數 | FK | 超過 20 秒 | 級距檢查 |", "| --- | --- | --- | --- | --- | --- |"]
    for lv in m["levels"]:
        s = m["level_summary"][lv]
        gate = "通過" if not m["gate"][lv] else "；".join(m["gate"][lv])
        out.append(f"| {lv} | {s['avg_words']} | {s['avg_sentence_words']} | {s['fk_grade']} | "
                   f"{s['slides_over_20s']} | {gate} |")
    out.append("")
    if m.get("distance"):
        pairs = "、".join(f"{k} {v['mean']}" + ("" if v["pass"] else " 超標")
                         for k, v in m["distance"].items())
        out += [f"相鄰兩級的詞彙重疊（上限 0.34）：{pairs}", ""]
    for st in m["stages"]:
        out += [f"## Part {st['part_no']} · {st['function_en']}（{st['function_zh']}）", "",
                f"語言功能：{st['language_pattern']}", ""]
        for s in st["slides"]:
            head = f"### {s['slide_no']}. {s['title']['en']}"
            if s["title"]["zh"]:
                head += f"（{s['title']['zh']}）"
            out.append(head)
            if s["numbers"]:
                out.append(f"數據：{' · '.join(s['numbers'])}")
            out.append("")
            for lv in m["levels"]:
                sc = s["scripts"].get(lv)
                if not sc:
                    continue
                mark = "" if sc["provenance"] == "workbook" else " ·（本版新寫）"
                out.append(f"- **{lv}**（{sc['words']} 字 / 每句 {sc['avg_sentence_words']} 字 / "
                           f"{sc['speak_seconds_est']} 秒{mark}）")
                out.append(f"  > {sc['text']}")
            out.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    missions = []
    for canon_id, meta in discover_missions().items():
        m = build_mission(canon_id, meta)
        missions.append(m)
        with open(os.path.join(OUT, f"{canon_id}.json"), "w", encoding="utf-8") as fh:
            json.dump(m, fh, ensure_ascii=False, indent=2)
        write_review(m, os.path.join(OUT, f"{canon_id}.md"))
    try:
        write_workbook(missions, os.path.join(OUT, "SDGs_PechaKucha_v1.xlsx"))
    except PermissionError:
        # Windows locks the file while it is open in Excel. The JSON and
        # Markdown outputs above already wrote successfully, so this is not
        # fatal — just tell the caller and keep going.
        print("SDGs_PechaKucha_v1.xlsx is locked (probably open in Excel) — "
              "skipped, everything else was written", file=sys.stderr)
    index = {
        "content_version": CONTENT_VERSION,
        "generated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "levels": list(LEVELS),
        "level_bands": BAND,
        "fill_band": FILL_BAND,
        "max_level_overlap": MAX_JACCARD_MEAN,
        "missions": [
            {"mission_id": m["mission_id"], "sdg": m["sdg"], "title": m["title"]["en"],
             "slides": m["slide_count"], "levels": m["levels"], "ready": m["ready"],
             "gate": m["gate"], "level_summary": m["level_summary"],
             "source_mission": m["source_mission"]}
            for m in missions
        ],
        "ready_count": sum(1 for m in missions if m["ready"]),
    }
    with open(os.path.join(OUT, "_index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=2)
    for m in missions:
        state = "READY" if m["ready"] else "needs work"
        # One line per mission. The per-slide reasons live in the generated
        # <mission>.md and in `python scripts/gate.py overlay <mission>`; printing
        # them all here buried the summary under a screen of text.
        detail = "; ".join(f"{lv} {len(v)}" for lv, v in m["gate"].items() if v)
        missing = [lv for lv in LEVELS if lv not in m["levels"]]
        if missing:
            detail = (detail + "; " if detail else "") + f"missing {', '.join(missing)}"
        far = [k for k, d in m.get("distance", {}).items() if not d["pass"]]
        if far:
            detail += f"; levels too close: {', '.join(far)}"
        print(f"{m['mission_id']:8} {m['slide_count']:3} slides  {state:10} {detail}")
    print(f"\n{index['ready_count']} / {len(missions)} missions ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
