"""Build the clean, canonical teaching material: one SDG = one mission, three levels.

The workbooks carry several variants per goal (4-1/4-2, 5-1/5-2, 13-1/13-2,
9-1/9-2/9-3). For the game we keep one mission per SDG and exactly three levels,
A2 / B1 / B2. The other variants are archived, not deleted.

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
from author_levels import LEVEL_BAND  # noqa: E402

LEVELS = ("A2", "B1", "B2")

# one mission per SDG; the rest stay in content/source as alternates
CANONICAL = {
    "sdg1": {"source": "sdg1", "sdg": 1, "title": "No Poverty in Taiwan"},
    "sdg4": {"source": "sdg4-1", "sdg": 4, "title": "Quality Education in Taiwan"},
    "sdg5": {"source": "sdg5-1", "sdg": 5, "title": "Gender Equality: A Fair World for Everyone"},
    "sdg9": {"source": "sdg9-1", "sdg": 9, "title": "Industry and Innovation: Can We Trust AI?"},
    "sdg13": {"source": "sdg13-1", "sdg": 13, "title": "Climate Action: Taiwan's Path to Net Zero"},
}
ALTERNATES = {
    "sdg4": ["sdg4-2 Digital Equity and Media Literacy"],
    "sdg5": ["sdg5-2 Leveling the Playing Field (Women in Sports & Media)"],
    "sdg9": ["sdg9-2 Better Prompts, Better Science", "sdg9-3 What Can Humans Do Better Than AI?"],
    "sdg13": ["sdg13-2 Climate-Resilient Taiwan"],
}

HEADER_FILL = PatternFill("solid", fgColor="1F2937")
LEVEL_FILL = {"A2": PatternFill("solid", fgColor="DCFCE7"),
              "B1": PatternFill("solid", fgColor="DBEAFE"),
              "B2": PatternFill("solid", fgColor="FEF3C7")}


def in_band(level: str, stats: dict) -> list:
    band = LEVEL_BAND[level]
    out = []
    for key, value in (("words", stats["avg_words"]),
                       ("sentence", stats["avg_sentence_words"]),
                       ("fk", stats["fk_grade"])):
        lo, hi = band[key]
        if round(value, 1) < lo:
            out.append(f"{key} {value} below {lo}")
        elif round(value, 1) > hi:
            out.append(f"{key} {value} above {hi}")
    if stats["slides_over_20s"]:
        out.append(f"{stats['slides_over_20s']} slides over 20 s")
    return out


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
    gate = {lv: in_band(lv, summary[lv]) for lv in summary}
    return {
        "mission_id": canon_id,
        "sdg": meta["sdg"],
        "title": {"en": meta["title"], "zh": None},
        "content_version": CONTENT_VERSION,
        "levels": [lv for lv in LEVELS if lv in summary],
        "source_mission": meta["source"],
        "alternates_not_used": ALTERNATES.get(canon_id, []),
        "slide_count": sum(len(st["slides"]) for st in stages),
        "level_summary": summary,
        "gate": gate,
        "ready": all(not v for v in gate.values()) and len(summary) == 3,
        "stages": stages,
    }


def write_workbook(missions: list, path: str) -> None:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for m in missions:
        ws = wb.create_sheet(f"SDG {m['sdg']}")
        ws["A1"] = f"SDG {m['sdg']}: {m['title']['en']}"
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
        "One sheet per SDG. Every sheet has the same shape:",
        "  A Part · B Part description · C slide number · D English title · E Chinese title · F/G/H = A2 / B1 / B2",
        "",
        "Each slide is spoken in 20 seconds, so a script over 43 words cannot be delivered.",
        "Level bands (average per mission): "
        "A2 26-35 words / 7-12 per sentence / FK 3-7 · "
        "B1 32-40 / 11-16 / FK 7-11 · B2 34-43 / 14-20 / FK 11-15.",
        "",
        "Coloured cells were written or re-graded for this edition; white cells are the original wording.",
        "This file is generated by scripts/build_canonical.py — edit the JSON or the overlays, not this sheet.",
    ]
    for i, line in enumerate(lines, start=3):
        notes[f"A{i}"] = line
    notes.column_dimensions["A"].width = 120
    wb.save(path)


def write_review(m: dict, path: str) -> None:
    out = [f"# SDG {m['sdg']} · {m['title']['en']}", "",
           f"{m['slide_count']} slides · levels {', '.join(m['levels'])} · "
           f"content_version {m['content_version']} · source `{m['source_mission']}`", ""]
    out += ["| 級別 | 每張字數 | 每句字數 | FK | 超過 20 秒 | 級距檢查 |", "| --- | --- | --- | --- | --- | --- |"]
    for lv in m["levels"]:
        s = m["level_summary"][lv]
        gate = "通過" if not m["gate"][lv] else "；".join(m["gate"][lv])
        out.append(f"| {lv} | {s['avg_words']} | {s['avg_sentence_words']} | {s['fk_grade']} | "
                   f"{s['slides_over_20s']} | {gate} |")
    out.append("")
    if m["alternates_not_used"]:
        out += ["未納入標準版的其他變體（保留備用）：" + "、".join(m["alternates_not_used"]), ""]
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
    for canon_id, meta in CANONICAL.items():
        m = build_mission(canon_id, meta)
        missions.append(m)
        with open(os.path.join(OUT, f"{canon_id}.json"), "w", encoding="utf-8") as fh:
            json.dump(m, fh, ensure_ascii=False, indent=2)
        write_review(m, os.path.join(OUT, f"{canon_id}.md"))
    write_workbook(missions, os.path.join(OUT, "SDGs_PechaKucha_v1.xlsx"))
    index = {
        "content_version": CONTENT_VERSION,
        "generated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "levels": list(LEVELS),
        "level_bands": LEVEL_BAND,
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
        detail = "; ".join(f"{lv}: {', '.join(v)}" for lv, v in m["gate"].items() if v)
        missing = [lv for lv in LEVELS if lv not in m["levels"]]
        if missing:
            detail = (detail + "; " if detail else "") + f"missing {', '.join(missing)}"
        print(f"{m['mission_id']:6} {m['slide_count']:3} slides  {state:10} {detail}")
    print(f"\n{index['ready_count']} / {len(missions)} missions ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
