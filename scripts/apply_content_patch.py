"""Apply reviewed changes to the question bank (frontend/js/pk-content.js) from patch files, with checks.

    python scripts/apply_content_patch.py --roundtrip            # prove the file is rewritten byte for byte
    python scripts/apply_content_patch.py <dir with *.json>      # check the patches, change nothing
    python scripts/apply_content_patch.py <dir> --write          # apply, raise the version of every topic whose
                                                                 # scripts or English titles changed, write a
                                                                 # before/after report (--report file.md)
A patch file (one per topic):
    {"topic": "9-1",
     "titles":  {"5": {"title_en": "...", "title_zh": "..."}},      a title belongs to the slide at EVERY level
     "scripts": {"A2": {"11": "the full new script"}},
     "notes":   [{"card": "9-1/A2/s11", "change": "...", "source": "url or null", "verified": "opened|…"}]}
After --write run `npm run content:lock` and `npm run build`.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "frontend" / "js" / "pk-content.js"
MARK = "window.PK_CONTENT = "
BUDGET = {"A1": (22, 34), "A2": (24, 38), "B1": (28, 44), "B2": (32, 50)}      # words per script (a 20-second slide)
PARTS = {20: [3, 3, 3, 3, 4, 4], 12: [2, 2, 2, 2, 2, 2]}
SLIDE_KEYS = ("no", "part", "title_en", "title_zh", "script", "purpose", "keywords")


def read_bank():
    text = BANK.read_text(encoding="utf-8").replace("\r\n", "\n")
    head = text[:text.index(MARK)]
    data = json.loads(text[text.index(MARK) + len(MARK):].rstrip().rstrip(";"))
    return head, data


def dump_bank(head, data):
    j = lambda v: json.dumps(v, ensure_ascii=False)
    out = [head + MARK + '{"topics": [']
    topics = []
    for t in data["topics"]:
        lines = ['{"id": %s, "sdg": %s, "version": %s, "title_en": %s, "title_zh": %s, "levels": {' % (j(t["id"]), j(t["sdg"]), j(t["version"]), j(t["title_en"]), j(t["title_zh"]))]
        levels = []
        for level, slides in t["levels"].items():
            rows = ["    " + json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in slides]
            levels.append('  %s: [\n%s\n  ]' % (j(level), ",\n".join(rows)))
        lines.append(",\n".join(levels))
        lines.append("}}")
        topics.append("\n".join(lines))
    out.append(",\n".join(topics))
    out.append("]};\n")
    return "\n".join(out)


def words(text):
    return len(str(text).split())


def check_script(card, level, text):
    """Problems a reviewer should not have to find by ear."""
    bad = []
    n = words(text)
    lo, hi = BUDGET[level]
    if not lo <= n <= hi:
        bad.append(f"{card}: {n} words (this level: {lo}–{hi})")
    if re.search(r"[;—–]", text):
        bad.append(f"{card}: a semicolon or dash (the voice runs on)")
    if re.search(r"\bCO2\b|24/7|°C", text):
        bad.append(f"{card}: CO2 / 24/7 / °C is written for the eye, not the voice")
    for q in ('"', "“", "”"):
        pass
    if (text.count('"') % 2) or (text.count("“") != text.count("”")):
        bad.append(f"{card}: quotation marks do not pair up")
    if re.search(r"\s{2,}|\s[,.!?]", text) or text != text.strip():
        bad.append(f"{card}: stray spaces")
    if not re.search(r"[.!?][\"”']?$", text):
        bad.append(f"{card}: does not end with a full stop")
    return bad


def note_lookup(notes):
    """A note may name one card (9-1/A2/s07), several levels (9-1/A2,B1/s07), every level (9-1/全部/s07)
    or a title (… slide 7). Returns find(card label) -> note or {}."""
    parsed = []
    for n in notes:
        if not isinstance(n, dict):
            continue
        m = re.match(r"^\s*([\d-]+)\s*/\s*([^/]+?)\s*/\s*s?0*(\d+)", str(n.get("card") or ""))
        if m:
            levels = [x.strip() for x in re.split(r"[,、，]", m.group(2))]
            parsed.append((m.group(1), levels, int(m.group(3)), n))
        else:
            m = re.search(r"([\d]+-[\d]+).*?(\d+)", str(n.get("card") or ""))
            if m:
                parsed.append((m.group(1), ["*"], int(m.group(2)), n))

    def find(label):
        m = re.match(r"^([\d-]+)/(\w+)/s0*(\d+)$", label)
        title = re.match(r"^([\d-]+) 第 (\d+) 張", label)
        best = {}
        for topic, levels, no, n in parsed:
            if m and topic == m.group(1) and no == int(m.group(3)) and (m.group(2) in levels or any(not re.fullmatch(r"[AB][12]", x) for x in levels)):
                if m.group(2) in levels:
                    return n
                best = best or n
            if title and topic == title.group(1) and no == int(title.group(2)) and ("title" in str(n.get("card")).lower() or "標題" in str(n.get("card")) + str(n.get("change"))):
                return n
        return best
    return find


def apply(data, patches, write):
    problems, report, bumped = [], [], []
    by_id = {t["id"]: t for t in data["topics"]}
    for patch in patches:
        t = by_id.get(patch.get("topic"))
        if not t:
            problems.append(f"{patch.get('topic')}: no such topic"); continue
        tid, hashed_before = t["id"], json.dumps([[s["no"], s["part"], s["title_en"], s["script"]] for ss in t["levels"].values() for s in ss], ensure_ascii=False)
        rows = []
        for no, title in (patch.get("titles") or {}).items():
            en, zh = str(title.get("title_en") or "").strip(), str(title.get("title_zh") or "").strip()
            if not en or not zh:
                problems.append(f"{tid} slide {no}: a title change needs both title_en and title_zh"); continue
            if not re.search("[㐀-鿿]", zh):
                problems.append(f"{tid} slide {no}: the Chinese title has no Chinese")
            if words(en) > 8:
                problems.append(f"{tid} slide {no}: the English title has {words(en)} words")
            hit = False
            for level, slides in t["levels"].items():
                for s in slides:
                    if str(s["no"]) == str(no):
                        hit = True
                        if (s["title_en"], s["title_zh"]) != (en, zh):
                            if level == next(iter(t["levels"])):
                                rows.append((f"{tid} 第 {no} 張 標題（所有難度）", f"{s['title_en']}｜{s['title_zh']}", f"{en}｜{zh}"))
                            s["title_en"], s["title_zh"] = en, zh
            if not hit:
                problems.append(f"{tid} slide {no}: no such slide")
        for level, cards in (patch.get("scripts") or {}).items():
            if level not in t["levels"]:
                problems.append(f"{tid}/{level}: no such level"); continue
            for no, text in cards.items():
                text = " ".join(str(text).split())
                slide = next((s for s in t["levels"][level] if str(s["no"]) == str(no)), None)
                card = f"{tid}/{level}/s{int(no):02d}"
                if not slide:
                    problems.append(f"{card}: no such slide"); continue
                problems += check_script(card, level, text)
                if slide["script"] != text:
                    rows.append((card, slide["script"], text))
                    slide["script"] = text
        # titles: unique in the topic, and no two alike inside a part
        first = next(iter(t["levels"].values()))
        seen = {}
        for s in first:
            key = s["title_en"].strip().lower()
            if key in seen:
                problems.append(f"{tid}: slides {seen[key]} and {s['no']} have the same title “{s['title_en']}”")
            seen[key] = s["no"]
        for level, slides in t["levels"].items():
            for a, b in zip(first, slides):
                if a["title_en"] != b["title_en"]:
                    problems.append(f"{tid}/{level} slide {b['no']}: title differs from the other levels")
        hashed_after = json.dumps([[s["no"], s["part"], s["title_en"], s["script"]] for ss in t["levels"].values() for s in ss], ensure_ascii=False)
        if hashed_after != hashed_before and write != "no-bump":      # --no-bump: a second round on a version nobody has played yet
            t["version"] = int(t["version"]) + 1
            bumped.append(f"{tid} → v{t['version']}")
        report.append((tid, rows, note_lookup(patch.get("notes") or []), patch.get("notes") or []))
    return problems, report, bumped


def write_report(path, report, bumped):
    out = ["# 題庫修改前後對照", "", "由 `scripts/apply_content_patch.py` 產生。每一列是一張卡的講稿，或一張投影片的標題（標題改了，所有難度一起改）。", "",
           "版本：" + ("、".join(bumped) if bumped else "沒有主題升版"), ""]
    esc = lambda s: str(s).replace("|", "｜").replace("\n", " ")
    for tid, rows, notes, all_notes in report:
        out += [f"## {tid}（{len(rows)} 處）", "", "| 卡片 | 原本 | 改成 | 為什麼／來源 |", "|---|---|---|---|"]
        for card, before, after in rows:
            n = notes(card) or {}
            why = esc(n.get("change") or "")
            if n.get("source"):
                why += " " + " ".join(f"[來源]({u.strip()})" for u in re.split(r"\s*;\s*|\s+", str(n["source"])) if u.strip().startswith("http"))
            if n.get("verified") and n["verified"] != "n/a":
                why += f"（{ {'opened': '已打開原文確認', 'summary-only': '只看到摘要', 'number-removed': '查不到，數字已拿掉'}.get(n['verified'], n['verified']) }）"
            out.append(f"| {card} | {esc(before)} | {esc(after)} | {why} |")
        used = {id(notes(card)) for card, _, _ in rows}
        extra = [n for n in all_notes if isinstance(n, dict) and id(n) not in used]
        if extra:
            out += ["", "其他說明：", ""] + [f"- {esc(n.get('card') or '')}：{esc(n.get('change') or '')}" + (f" [來源]({n['source']})" if n.get("source") else "") for n in extra]
        out.append("")
    Path(path).write_text("\n".join(out), encoding="utf-8", newline="\n")


def main(argv):
    head, data = read_bank()
    if "--roundtrip" in argv:
        same = dump_bank(head, data) == BANK.read_text(encoding="utf-8").replace("\r\n", "\n")
        print("round trip:", "identical" if same else "DIFFERENT — do not use --write")
        return 0 if same else 1
    folder = Path(argv[0])
    patches = []
    for f in sorted(folder.glob("*.json")):
        try:
            loaded = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(loaded, list):      # a proof-reader's flat list of fixes: [{topic, level, slide, script, problem} | {topic, slide, title_en, title_zh, problem}]
                grouped = {}
                for x in loaded:
                    g = grouped.setdefault(x["topic"], {"topic": x["topic"], "titles": {}, "scripts": {}, "notes": []})
                    if "script" in x:
                        g["scripts"].setdefault(x["level"], {})[str(x["slide"])] = x["script"]
                        g["notes"].append({"card": f"{x['topic']}/{x['level']}/s{int(x['slide']):02d}", "change": "複審：" + str(x.get("problem") or ""), "source": x.get("source"), "verified": x.get("verified", "n/a")})
                    else:
                        g["titles"][str(x["slide"])] = {"title_en": x["title_en"], "title_zh": x["title_zh"]}
                        g["notes"].append({"card": f"{x['topic']} title slide {x['slide']}", "change": "複審（標題）：" + str(x.get("problem") or ""), "source": None, "verified": "n/a"})
                patches.extend(grouped.values())
                continue
            patches.append(loaded)
        except Exception as error:
            print(f"ERROR  {f.name}: not valid JSON ({error})"); return 1
    problems, report, bumped = apply(data, patches, "no-bump" if "--no-bump" in argv else "--write" in argv)
    for tid, rows, _, _ in report:
        print(f"{tid}: {len(rows)} change(s)")
    for p in problems:
        print("PROBLEM  " + p)
    print(f"{len(problems)} problem(s); versions: {', '.join(bumped) or 'none'}")
    if "--report" in argv:
        write_report(argv[argv.index("--report") + 1], report, bumped)
    if "--write" in argv:
        if problems and "--force" not in argv:
            print("Not written: fix the problems first (or --force)."); return 1
        BANK.write_text(dump_bank(head, data), encoding="utf-8", newline="\n")
        print("written:", BANK)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
