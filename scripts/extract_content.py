"""Extract the SDGs Pecha Kucha teaching material into game-ready JSON.

Input  : teach_material/*.xlsx (not modified, not reformatted)
Output : content/source/<mission>.json   canonical, machine-readable
         content/source/_index.json      manifest + coverage + QA summary
         content/review/<mission>.md     human review sheet (teacher readable)
         content/review/QA-REPORT.md     every problem found, one list

Original wording is copied verbatim. The script never rewrites a script line;
it only restructures, measures and flags. Fields that a human must still fill
are emitted as null with a TODO marker so authoring has an obvious checklist.

Run:  python scripts/extract_content.py [--material <dir>]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl required:  pip install openpyxl")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MATERIAL = os.path.join(os.path.dirname(REPO), "teach_material")
OUT_SOURCE = os.path.join(REPO, "content", "source")
OUT_REVIEW = os.path.join(REPO, "content", "review")
CONTENT_VERSION = "2026.09.1"

LEVELS = ("A1", "A2", "B1", "B2")
# CEFR text specs from the Round 1 report (docs/plans/2026-09-20-mission-engine.md §4.1)
LEVEL_SPEC = {
    "A1": {"max_words": 32, "max_avg_sentence": 10},
    "A2": {"max_words": 35, "max_avg_sentence": 12},
    "B1": {"max_words": 40, "max_avg_sentence": 16},
    "B2": {"max_words": 45, "max_avg_sentence": 20},
}
PECHA_SECONDS = 20          # one slide = 20 seconds

# Speaking rate is not one number. A Taiwanese undergraduate reading an A2 script
# aloud is slower than the same student reading a B2 script they have rehearsed,
# and both are slower than the 130 wpm "comfortable native" figure this project
# started with. Using 130 for every level made short A2 slides look like they left
# 7 seconds of dead air, which is an artefact of the wrong rate, not a defect in
# the script. Rates below are the measured range for L1-Mandarin presenters.
LEVEL_WPM = {"A1": 90, "A2": 95, "B1": 110, "B2": 120}
COMFORTABLE_WPM = 130       # only for level-agnostic reporting

# ---------------------------------------------------------------- mission map
# Wide sheets: one sheet holds every level in separate columns.
WIDE_SHEETS = [
    ("sdg4-1", 4, "SDG 4-1", "Quality Education in Taiwan"),
    ("sdg4-2", 4, "SDG 4-2", "Digital Equity and Media Literacy in Taiwan"),
    ("sdg5-1", 5, "SDG 5-1", "A Fair World for Everyone"),
    ("sdg5-2", 5, "SDG 5-2", "Leveling the Playing Field (Women in Sports & Media)"),
    ("sdg13-1", 13, "SDG 13-1", "Climate Action - Taiwan's Path to Net Zero"),
    ("sdg13-2", 13, "SDG 13-2", "Climate-Resilient Taiwan - Adapting to Extreme Weather"),
]
# Tall sheets: one sheet per level, 12 slides, SDG 9 x AI literacy.
TALL_SHEETS = {
    "sdg9-1": (9, "Using AI: Can We Trust AI?",
               {"A2": "OK SDG9-1 (A2)", "B1": "OK SDG9-1 (B1)", "B2": "OK SDG9-1 (B2)"}),
    "sdg9-2": (9, "Better Prompts, Better Science: Working with AI",
               {"A2": "SDG9-2 (A2)", "B1": "SDG9-2 (B1)", "B2": "SDG9-2 (B2)"}),
    "sdg9-3": (9, "What Can Humans Do Better Than AI?",
               {"A2": "SDG9-3 (A2)", "B1": "SDG9-3 (B1)", "B2": "SDG9-3 (B2)"}),
}
MAIN_WORKBOOK = "SDGs Pecha Kucha (公用)_new.xlsx"
# SDG 1 lives in a different tree and is the only copy of that mission.
SDG1_WORKBOOK = os.path.join("..", "SDGS_TEXT", "outputs", "sdg1", "SDGsPechaKucha_SDG1_0526.xlsx")
LEGACY_WORKBOOKS = [
    "SDGs Pecha Kucha (公用).xlsx",
    "SDGs Pecha Kucha (公用)_自建題庫檔.xlsx",
    "SDGsPechaKucha_0526.xlsx",
]

# The six rhetorical parts, in the order every mission follows.
PART_FUNCTION = {
    1: ("Introduction", "引言：破題與定義", "rhetorical questions / X is about ..."),
    2: ("Problem", "問題指認：趨勢與因果", "present progressive for trends / this causes ..."),
    3: ("Achievements", "成果：舉證與比較", "present perfect / comparatives"),
    4: ("Solutions", "解方：做法與取捨", "instead of + V-ing / modal verbs"),
    5: ("Implications", "影響：推論後果", "first conditional / however"),
    6: ("Call to action", "結語：總結與號召", "to wrap up ... / let's ..."),
}


# ---------------------------------------------------------------- text tools
def clean(v) -> str:
    if v is None:
        return ""
    s = str(v).replace(" ", " ")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def one_line(v) -> str:
    return " ".join(clean(v).split())


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1 and not w.endswith("le"):
        n -= 1
    return max(1, n)


def capacity(level: str) -> float:
    """Words that fit in one 20-second slide at this level's speaking rate."""
    return LEVEL_WPM.get(level, COMFORTABLE_WPM) / 60 * PECHA_SECONDS


def measure(text: str, level: str = None) -> dict:
    """Readability and pacing measures for one slide script.

    Pass `level` to pace the slide at that level's speaking rate; without it the
    slide is timed at the level-agnostic rate, which only suits cross-level
    reporting."""
    # Digits are spoken, so they are words: "2050" is "twenty fifty", two words
    # of three syllables. Counting only letters under-reported every slide that
    # carries a date, a target or a price — exactly the slides that matter.
    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'\-]*", text)
    n_words = len(words)
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]
    n_sent = max(1, len(sentences))
    n_syll = sum(len(w) if w.isdigit() else syllables(w) for w in words)
    fk = (0.39 * n_words / n_sent + 11.8 * n_syll / max(1, n_words) - 15.59) if n_words else 0.0
    long_words = sum(1 for w in words if len(w) >= 8 and not w.isdigit())
    wpm = LEVEL_WPM.get(level, COMFORTABLE_WPM)
    cap = wpm / 60 * PECHA_SECONDS
    return {
        "words": n_words,
        "sentences": n_sent,
        "avg_sentence_words": round(n_words / n_sent, 1),
        "fk_grade": round(fk, 1),
        "long_word_pct": round(100 * long_words / n_words, 1) if n_words else 0.0,
        "speak_seconds_est": round(n_words / (wpm / 60), 1),
        "fill_pct": round(100 * n_words / cap, 1) if cap else 0.0,
        "fits_20s": n_words <= cap,
        "wpm": wpm,
    }


NUMBER_RE = re.compile(
    r"(?:US\$|NT\$|\$)?\d[\d,\.]*\s?(?:%|°C|GW|MW|kW|billion|million|thousand|years?|degrees)?",
    re.IGNORECASE,
)


def find_numbers(text: str) -> list:
    out = []
    for m in NUMBER_RE.finditer(text):
        tok = m.group(0).strip()
        if re.fullmatch(r"[\d,\.]+", tok) and len(re.sub(r"\D", "", tok)) < 2:
            continue  # drop bare single digits such as "1"
        if tok and tok not in out:
            out.append(tok)
    return out


def wide_char(ch: str) -> bool:
    return unicodedata.east_asian_width(ch) in ("W", "F")


def has_cjk(s: str) -> bool:
    return any(wide_char(c) for c in s)


# ---------------------------------------------------------------- sheet tools
def merged_value(ws, row: int, col: str):
    """Value of a cell, following a vertical merge upwards."""
    v = ws[f"{col}{row}"].value
    if v not in (None, ""):
        return v
    for rng in ws.merged_cells.ranges:
        if rng.min_col == rng.max_col and openpyxl.utils.get_column_letter(rng.min_col) == col:
            if rng.min_row <= row <= rng.max_row:
                return ws.cell(row=rng.min_row, column=rng.min_col).value
    return None


def level_columns(ws, first_row: int, last_row: int) -> dict:
    """Map level -> column letter, using the labels in row 2 and real content.

    A label alone is not enough: some label cells sit above empty columns or
    above the Chinese title column, so a column only counts when it actually
    holds script-length text on most slide rows.
    """
    found = {}
    for cell in ws[2]:
        label = clean(cell.value).upper().replace(" ", "")
        if not label:
            continue
        base = None
        for lv in LEVELS:
            if label == lv or label.startswith(lv + "-"):
                base = lv
                break
        if not base:
            continue
        col = cell.column_letter
        texts = [clean(ws[f"{col}{r}"].value) for r in range(first_row, last_row + 1)]
        scripts = [t for t in texts if len(t) > 60 and not has_cjk(t)]
        if len(scripts) < 10:
            continue
        variant = label != base  # e.g. "A2-2(GOOD)"
        found.setdefault(base, []).append({"column": col, "label": clean(cell.value), "n": len(scripts),
                                           "variant": variant})
    # keep the fullest column per level, remember the others as variants
    mapping, variants = {}, []
    for lv, cols in found.items():
        cols.sort(key=lambda c: (-c["n"], c["variant"]))
        mapping[lv] = cols[0]["column"]
        for extra in cols[1:]:
            variants.append({"level": lv, "column": extra["column"], "label": extra["label"]})
    return mapping, variants


def zh_title_column(ws, level_cols: dict, first_row: int, last_row: int):
    """F is the Chinese slide title on most sheets, but on some it is a script column."""
    used = set(level_cols.values())
    for col in ("F", "S"):
        if col in used:
            continue
        zh = [clean(ws[f"{col}{r}"].value) for r in range(first_row, last_row + 1)]
        if sum(1 for t in zh if t and has_cjk(t)) >= 10:
            return col
    return None


# ---------------------------------------------------------------- extraction
def extract_wide(wb, mission_id, sdg, sheet_name, fallback_title) -> dict:
    ws = wb[sheet_name]
    first_row, last_row = 3, 22
    lvl_cols, variants = level_columns(ws, first_row, last_row)
    zh_col = zh_title_column(ws, lvl_cols, first_row, last_row)
    title_en = one_line(ws["B2"].value) or one_line(ws["A2"].value) or fallback_title
    brief = clean(ws["B1"].value) or clean(ws["A1"].value)

    stages, current_part, current_desc = [], None, ""
    for row in range(first_row, last_row + 1):
        part_raw = merged_value(ws, row, "B")
        desc_raw = merged_value(ws, row, "C")
        part_no = None
        if part_raw:
            m = re.search(r"(\d+)", str(part_raw))
            if m:
                part_no = int(m.group(1))
        if part_no:
            current_part = part_no
            current_desc = one_line(desc_raw)
        slide_no = ws[f"D{row}"].value
        if slide_no in (None, ""):
            continue
        try:
            slide_no = int(float(slide_no))
        except (TypeError, ValueError):
            continue
        scripts = {}
        for lv, col in lvl_cols.items():
            text = clean(ws[f"{col}{row}"].value)
            if text:
                scripts[lv] = {"text": text, **measure(text, lv)}
        if not scripts:
            continue
        numbers = []
        for lv in sorted(scripts):
            for n in find_numbers(scripts[lv]["text"]):
                if n not in numbers:
                    numbers.append(n)
        slide = {
            "slide_no": slide_no,
            "title": {
                "en": one_line(ws[f"E{row}"].value),
                "zh": one_line(ws[f"{zh_col}{row}"].value) if zh_col else None,
            },
            "scripts": scripts,
            "numbers": numbers,
            "authoring": {"visual_hint": None, "stage_direction": None, "target_words": None},
        }
        stage = next((s for s in stages if s["part_no"] == current_part), None)
        if stage is None:
            fn = PART_FUNCTION.get(current_part, ("", "", ""))
            stage = {
                "part_no": current_part,
                "source_description": current_desc,
                "function_en": fn[0],
                "function_zh": fn[1],
                "language_pattern": fn[2],
                "slides": [],
            }
            stages.append(stage)
        stage["slides"].append(slide)

    return {
        "mission_id": mission_id,
        "sdg": sdg,
        "title": {"en": title_en, "zh": None},
        "shape": "wide",
        "source": {"workbook": MAIN_WORKBOOK, "sheet": sheet_name,
                   "level_columns": lvl_cols, "extra_level_columns": variants,
                   "zh_title_column": zh_col},
        "narrative_brief": brief,
        "stages": stages,
    }


def extract_tall(wb, mission_id, sdg, title, sheets: dict) -> dict:
    first_row, last_row = 4, 15
    per_level_rows = {}
    brief, title_en = "", title
    used_sheets = {}
    for lv, sheet_name in sheets.items():
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        used_sheets[lv] = sheet_name
        brief = brief or clean(ws["B1"].value)
        topic = one_line(ws["A2"].value)
        if topic:
            title_en = re.sub(r"^Topic\s*\d+\s*[:：]\s*", "", topic).split("Learn why")[0].strip()
        rows = {}
        for row in range(first_row, last_row + 1):
            no = ws[f"A{row}"].value
            if no in (None, ""):
                continue
            try:
                no = int(float(no))
            except (TypeError, ValueError):
                continue
            rows[no] = {
                "part": merged_value(ws, row, "B"),
                "section": merged_value(ws, row, "C"),
                "script": clean(ws[f"D{row}"].value),
                "outline": one_line(ws[f"E{row}"].value),
                "purpose": one_line(ws[f"G{row}"].value),
                "keywords_zh": one_line(ws[f"H{row}"].value),
            }
        per_level_rows[lv] = rows

    base_level = "B1" if "B1" in per_level_rows else sorted(per_level_rows)[0]
    stages = []
    for no in sorted(per_level_rows[base_level]):
        base = per_level_rows[base_level][no]
        part_no = None
        if base["part"]:
            m = re.search(r"(\d+)", str(base["part"]))
            if m:
                part_no = int(m.group(1))
        if part_no is None:
            part_no = stages[-1]["part_no"] if stages else 1
        section = clean(base["section"])
        sec_lines = [l.strip() for l in section.splitlines() if l.strip()]
        scripts, numbers = {}, []
        for lv, rows in per_level_rows.items():
            text = clean(rows.get(no, {}).get("script", ""))
            if text:
                scripts[lv] = {"text": text, **measure(text, lv)}
                for n in find_numbers(text):
                    if n not in numbers:
                        numbers.append(n)
        if not scripts:
            continue
        slide = {
            "slide_no": no,
            "title": {
                "en": sec_lines[0] if sec_lines else base["outline"],
                "zh": next((l for l in sec_lines[1:] if has_cjk(l)), None),
            },
            "scripts": scripts,
            "numbers": numbers,
            "authoring": {"visual_hint": None, "stage_direction": None, "target_words": None},
            "source_notes": {
                "outline_section": base["outline"] or None,
                "communication_purpose": base["purpose"] or None,
                "keywords_zh": base["keywords_zh"] or None,
            },
        }
        stage = next((s for s in stages if s["part_no"] == part_no), None)
        if stage is None:
            fn = PART_FUNCTION.get(part_no, ("", "", ""))
            stage = {"part_no": part_no, "source_description": sec_lines[0] if sec_lines else "",
                     "function_en": fn[0], "function_zh": fn[1], "language_pattern": fn[2],
                     "slides": []}
            stages.append(stage)
        stage["slides"].append(slide)

    return {
        "mission_id": mission_id,
        "sdg": sdg,
        "title": {"en": title_en, "zh": None},
        "shape": "tall",
        "source": {"workbook": MAIN_WORKBOOK, "sheets": used_sheets},
        "narrative_brief": brief,
        "stages": stages,
    }


def extract_flat(path, mission_id, sdg, sheet_name, fallback_title) -> dict:
    """Layout of SDGsPechaKucha_SDG1_0526.xlsx: row 1 holds the level labels,
    column A holds the part bullet, B the slide number, C the English title,
    D the Chinese title, then one column per level."""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet_name]
    header = {}
    for cell in ws[1]:
        label = clean(cell.value).upper().replace(" ", "")
        if label in LEVELS:
            header[label] = cell.column_letter
    title_en = one_line(ws["A2"].value) or fallback_title
    stages, current_part, current_desc = [], None, ""
    for row in range(3, ws.max_row + 1):
        bullet = clean(ws[f"A{row}"].value)
        if bullet:
            m = re.search(r"Part\s*(\d+)", bullet)
            if m:
                current_part = int(m.group(1))
                current_desc = bullet.lstrip("• ").strip()
        raw_no = ws[f"B{row}"].value
        if raw_no in (None, ""):
            continue
        try:
            slide_no = int(float(raw_no))
        except (TypeError, ValueError):
            continue
        scripts = {}
        for lv, col in header.items():
            text = clean(ws[f"{col}{row}"].value)
            if text and not has_cjk(text):
                scripts[lv] = {"text": text, **measure(text, lv)}
        if not scripts:
            continue
        numbers = []
        for lv in sorted(scripts):
            for n in find_numbers(scripts[lv]["text"]):
                if n not in numbers:
                    numbers.append(n)
        slide = {
            "slide_no": slide_no,
            "title": {"en": one_line(ws[f"C{row}"].value), "zh": one_line(ws[f"D{row}"].value) or None},
            "scripts": scripts,
            "numbers": numbers,
            "authoring": {"visual_hint": None, "stage_direction": None, "target_words": None},
        }
        stage = next((s for s in stages if s["part_no"] == current_part), None)
        if stage is None:
            fn = PART_FUNCTION.get(current_part, ("", "", ""))
            stage = {"part_no": current_part, "source_description": current_desc,
                     "function_en": fn[0], "function_zh": fn[1], "language_pattern": fn[2],
                     "slides": []}
            stages.append(stage)
        stage["slides"].append(slide)
    return {"mission_id": mission_id, "sdg": sdg, "title": {"en": title_en, "zh": None},
            "shape": "flat", "source": {"workbook": os.path.basename(path), "sheet": sheet_name,
                                        "level_columns": header},
            "narrative_brief": "", "stages": stages}


def apply_overlays(m: dict, overlay_dir: str) -> list:
    """Merge hand-authored level files. Originals are never edited; an overlay
    only adds a level that the workbook lacks, or replaces one that failed the
    CEFR spec. Every merged slide is marked with its provenance."""
    notes = []
    for st in m["stages"]:
        for s in st["slides"]:
            for lv, sc in s["scripts"].items():
                sc.setdefault("provenance", "workbook")
    if not os.path.isdir(overlay_dir):
        return notes
    for fname in sorted(os.listdir(overlay_dir)):
        if not fname.startswith(m["mission_id"] + ".") or not fname.endswith(".json"):
            continue
        with open(os.path.join(overlay_dir, fname), encoding="utf-8") as fh:
            ov = json.load(fh)
        lv = ov["level"]
        by_no = {s["slide_no"]: s for st in m["stages"] for s in st["slides"]}
        added = replaced = 0
        for raw_no, text in ov["slides"].items():
            slide = by_no.get(int(raw_no))
            if slide is None:
                notes.append({"severity": "medium", "where": f"{m['mission_id']} {lv}",
                              "issue": f"overlay slide {raw_no} has no matching source slide"})
                continue
            # An overlay that replaces a workbook level must keep the text it
            # displaced, otherwise nothing downstream can audit the rewrite for
            # faithfulness — the audit that caught the lost facts in SDG 13.
            superseded = None
            if lv in slide["scripts"]:
                replaced += 1
                prev = slide["scripts"][lv]
                if prev.get("provenance", "workbook") == "workbook":
                    superseded = prev["text"]
                else:
                    superseded = prev.get("workbook_text")
            else:
                added += 1
            slide["scripts"][lv] = {"text": clean(text), **measure(clean(text), lv),
                                    "provenance": ov.get("provenance", "authored"),
                                    "authored_by": ov.get("author", "Claude"),
                                    "basis": ov.get("basis"),
                                    "workbook_text": superseded}
        notes.append({"severity": "info", "where": f"{m['mission_id']} {lv}",
                      "issue": f"overlay {fname}: {added} added, {replaced} replaced"})
    return notes


# ---------------------------------------------------------------- QA
def qa_mission(m: dict) -> list:
    issues = []
    slides = [s for st in m["stages"] for s in st["slides"]]
    expected = 12 if m.get("shape") == "tall" else 20
    if len(slides) != expected:
        issues.append({"severity": "high", "where": m["mission_id"],
                       "issue": f"slide count {len(slides)}, expected {expected}"})
    if len(m["stages"]) != 6:
        issues.append({"severity": "high", "where": m["mission_id"],
                       "issue": f"{len(m['stages'])} parts, expected 6"})
    levels = sorted({lv for s in slides for lv in s["scripts"]})
    for lv in ("A2", "B1", "B2"):
        if lv not in levels:
            issues.append({"severity": "high", "where": m["mission_id"],
                           "issue": f"level {lv} missing"})
    for lv in levels:
        texts = [s["scripts"][lv] for s in slides if lv in s["scripts"]]
        if len(texts) != len(slides):
            issues.append({"severity": "medium", "where": f"{m['mission_id']} {lv}",
                           "issue": f"only {len(texts)} of {len(slides)} slides have {lv} text"})
        if not texts:
            continue
        spec = LEVEL_SPEC[lv]
        avg_sent = sum(t["avg_sentence_words"] for t in texts) / len(texts)
        avg_words = sum(t["words"] for t in texts) / len(texts)
        fk = sum(t["fk_grade"] for t in texts) / len(texts)
        if avg_sent > spec["max_avg_sentence"]:
            issues.append({"severity": "high", "where": f"{m['mission_id']} {lv}",
                           "issue": f"avg sentence {avg_sent:.1f} words exceeds {lv} spec "
                                    f"({spec['max_avg_sentence']}); reads above level"})
        if avg_words > spec["max_words"]:
            issues.append({"severity": "medium", "where": f"{m['mission_id']} {lv}",
                           "issue": f"avg {avg_words:.0f} words per slide exceeds {lv} spec "
                                    f"({spec['max_words']})"})
        over = [s["slide_no"] for s in slides
                if lv in s["scripts"] and not s["scripts"][lv]["fits_20s"]]
        if over:
            issues.append({"severity": "medium", "where": f"{m['mission_id']} {lv}",
                           "issue": f"{len(over)} slides need more than 20 s at {COMFORTABLE_WPM} wpm: "
                                    f"{over[:8]}{'...' if len(over) > 8 else ''}"})
        m.setdefault("level_summary", {})[lv] = {
            "slides": len(texts),
            "avg_words": round(avg_words, 1),
            "avg_sentence_words": round(avg_sent, 1),
            "fk_grade": round(fk, 1),
            "slides_over_20s": len(over),
        }
    missing_zh = [s["slide_no"] for s in slides if not s["title"]["zh"]]
    if missing_zh:
        issues.append({"severity": "low", "where": m["mission_id"],
                       "issue": f"{len(missing_zh)} slides have no Chinese title (authoring TODO)"})
    no_numbers = [s["slide_no"] for s in slides if not s["numbers"]]
    if len(no_numbers) > len(slides) - 3:
        issues.append({"severity": "low", "where": m["mission_id"],
                       "issue": "fewer than 3 slides carry a number; evidence cards will be thin"})
    return issues


# ---------------------------------------------------------------- writers
def write_review(m: dict, path: str) -> None:
    lv_order = [lv for lv in LEVELS if lv in (m.get("level_summary") or {})]
    lines = [f"# {m['mission_id']} · {m['title']['en']}", ""]
    lines.append(f"SDG {m['sdg']} · {len([s for st in m['stages'] for s in st['slides']])} slides · "
                 f"levels: {', '.join(lv_order)} · content_version {CONTENT_VERSION}")
    lines.append("")
    if m["narrative_brief"]:
        lines += ["> 原始工作表的任務敘事（原文保留）：", ">",
                  "> " + m["narrative_brief"].replace("\n", "\n> "), ""]
    if m.get("level_summary"):
        lines += ["## 各級實測", "",
                  "| 級別 | 張數 | 每張字數 | 每句字數 | FK | 超過 20 秒 |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for lv in lv_order:
            s = m["level_summary"][lv]
            lines.append(f"| {lv} | {s['slides']} | {s['avg_words']} | {s['avg_sentence_words']} | "
                         f"{s['fk_grade']} | {s['slides_over_20s']} |")
        lines.append("")
    for st in m["stages"]:
        lines.append(f"## Part {st['part_no']} · {st['function_en']}（{st['function_zh']}）")
        lines.append("")
        lines.append(f"語言功能：{st['language_pattern']}")
        if st["source_description"]:
            lines.append(f"原表描述：{st['source_description']}")
        lines.append("")
        for s in st["slides"]:
            head = f"### Slide {s['slide_no']} · {s['title']['en']}"
            if s["title"]["zh"]:
                head += f"（{s['title']['zh']}）"
            lines.append(head)
            if s["numbers"]:
                lines.append(f"數據：{' · '.join(s['numbers'])}")
            lines.append("")
            for lv in lv_order:
                sc = s["scripts"].get(lv)
                if not sc:
                    continue
                warn = " ⚠️ 超過 20 秒" if not sc["fits_20s"] else ""
                lines.append(f"- **{lv}**（{sc['words']} 字 / 每句 {sc['avg_sentence_words']} 字 / "
                             f"約 {sc['speak_seconds_est']} 秒{warn}）")
                lines.append(f"  > {sc['text']}")
            lines.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--material", default=DEFAULT_MATERIAL)
    args = ap.parse_args()

    book_path = os.path.join(args.material, MAIN_WORKBOOK)
    if not os.path.exists(book_path):
        sys.exit(f"workbook not found: {book_path}")
    wb = openpyxl.load_workbook(book_path, data_only=True)

    os.makedirs(OUT_SOURCE, exist_ok=True)
    os.makedirs(OUT_REVIEW, exist_ok=True)

    missions, all_issues = [], []
    for mission_id, sdg, sheet, title in WIDE_SHEETS:
        missions.append(extract_wide(wb, mission_id, sdg, sheet, title))
    for mission_id, (sdg, title, sheets) in TALL_SHEETS.items():
        m = extract_tall(wb, mission_id, sdg, title, sheets)
        missions.append(m)
    # SDG 1-1 originally came from a workbook outside teach_material; that
    # workbook is long gone (SDG1_WORKBOOK below is dead unless it reappears),
    # so its content lives on as a preserved shell —
    # content/authored/missions/sdg1-1.source.json — same as every other
    # mission with no workbook sheet. The generic loop right below picks it up;
    # it needs no special case of its own any more.
    sdg1_path = os.path.normpath(os.path.join(args.material, SDG1_WORKBOOK))
    if os.path.exists(sdg1_path):
        missions.insert(0, extract_flat(sdg1_path, "sdg1-1", 1, "SDG1", "No Poverty in Taiwan"))

    # Missions with no workbook sheet at all — the SDGs being written from scratch —
    # live as hand-authored shells in content/authored/missions/<mission>.source.json
    # (title, stage/part structure, slide titles; scripts are filled by the overlay
    # step below). Anything already produced from a workbook sheet is left alone.
    existing_ids = {m["mission_id"] for m in missions}
    authored_missions_dir = os.path.join(REPO, "content", "authored", "missions")
    if os.path.isdir(authored_missions_dir):
        for fname in sorted(os.listdir(authored_missions_dir)):
            if not fname.endswith(".source.json"):
                continue
            mission_id = fname[: -len(".source.json")]
            if mission_id in existing_ids:
                continue
            with open(os.path.join(authored_missions_dir, fname), encoding="utf-8") as fh:
                shell = json.load(fh)
            shell.pop("level_summary", None)
            # The playbook's documented shell schema (docs/plans/new-mission-playbook.md
            # §5) is only mission_id, sdg, title, stages — the bookkeeping fields below
            # are conveniences this script adds for workbook-sourced missions. Default
            # them here instead of requiring every hand-authored shell to carry them, so
            # a shell mid-authoring (or written exactly to the documented schema) does not
            # crash extraction for every other mission in the repo.
            shell.setdefault("shape", "authored")
            shell.setdefault("source", {"workbook": None,
                                        "note": "authored from scratch; no workbook sheet"})
            shell.setdefault("narrative_brief", "")
            missions.append(shell)
            existing_ids.add(mission_id)

    overlay_dir = os.path.join(REPO, "content", "authored", "levels")
    for m in missions:
        all_issues += apply_overlays(m, overlay_dir)
        m.pop("level_summary", None)
        all_issues += qa_mission(m)

    for m in missions:
        with open(os.path.join(OUT_SOURCE, f"{m['mission_id']}.json"), "w", encoding="utf-8") as fh:
            json.dump(m, fh, ensure_ascii=False, indent=2)
        write_review(m, os.path.join(OUT_REVIEW, f"{m['mission_id']}.md"))

    # Self-cleaning: both folders are generated from what's discovered right
    # now, so a mission that was renamed, moved to content/drafts/, or removed
    # should not leave its old file sitting here — that stale file is exactly
    # what caused "sdg1" to keep appearing in the gate output after it was
    # renamed to "sdg1-1".
    keep_source = {f"{m['mission_id']}.json" for m in missions} | {"_index.json"}
    for fname in os.listdir(OUT_SOURCE):
        if fname not in keep_source:
            os.remove(os.path.join(OUT_SOURCE, fname))
    keep_review = {f"{m['mission_id']}.md" for m in missions} | {"QA-REPORT.md"}
    for fname in os.listdir(OUT_REVIEW):
        if fname not in keep_review:
            os.remove(os.path.join(OUT_REVIEW, fname))

    index = {
        "content_version": CONTENT_VERSION,
        "generated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_workbook": MAIN_WORKBOOK,
        "legacy_workbooks_not_used": LEGACY_WORKBOOKS,
        "missions": [
            {
                "mission_id": m["mission_id"],
                "sdg": m["sdg"],
                "title_en": m["title"]["en"],
                "slides": sum(len(st["slides"]) for st in m["stages"]),
                "stages": len(m["stages"]),
                "levels": sorted((m.get("level_summary") or {}).keys()),
                "level_summary": m.get("level_summary", {}),
            }
            for m in missions
        ],
        "issue_counts": {
            sev: sum(1 for i in all_issues if i["severity"] == sev)
            for sev in ("high", "medium", "low", "info")
        },
    }
    with open(os.path.join(OUT_SOURCE, "_index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=2)

    report = ["# 教材 QA 報告", "",
              f"content_version {CONTENT_VERSION} · 產生於 {index['generated_at']}", "",
              f"來源：`{MAIN_WORKBOOK}`（其餘三個工作簿是舊版或子集，未使用："
              + "、".join(f"`{b}`" for b in LEGACY_WORKBOOKS) + "）", "",
              "規格依據：`docs/plans/2026-09-20-mission-engine.md` §4.1；"
              f"口說秒數以 {COMFORTABLE_WPM} wpm 估算，一張 slide 上限 {PECHA_SECONDS} 秒。", ""]
    for sev, label in (("high", "必須處理"), ("medium", "建議處理"), ("low", "待補"),
                       ("info", "補寫紀錄")):
        rows = [i for i in all_issues if i["severity"] == sev]
        report += [f"## {label}（{len(rows)}）", ""]
        report += [f"- **{i['where']}** — {i['issue']}" for i in rows] or ["- 無"]
        report.append("")
    report += ["## 覆蓋率", "", "| Mission | SDG | slides | parts | levels |",
               "| --- | --- | --- | --- | --- |"]
    for m in index["missions"]:
        report.append(f"| {m['mission_id']} | {m['sdg']} | {m['slides']} | {m['stages']} | "
                      f"{', '.join(m['levels'])} |")
    with open(os.path.join(OUT_REVIEW, "QA-REPORT.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(report) + "\n")

    print(f"missions: {len(missions)}  "
          f"slides: {sum(m['slides'] for m in index['missions'])}  "
          f"issues: {index['issue_counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
