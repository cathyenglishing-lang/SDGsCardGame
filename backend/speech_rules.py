"""How abbreviations are read aloud (念法表) — one table for the whole platform.

The games speak with the browser's built-in voices, which guess how to say "SDG", "AI" or "CO2" and
guess differently on every device (2026-11-09 meeting, T2). Each row here says: when the text has
`written`, say `spoken` instead. Only the spoken text changes; what is shown on screen stays as written.

  GET /content/speech            anyone: the rows the games use (frontend/js/speech-say.js loads them)
  GET /teacher/speech            teacher: the rows, who changed them last, and the built-in defaults
  PUT /teacher/speech            teacher: replace the whole table
  POST /teacher/speech/reset     teacher: back to the built-in defaults
"""
import re
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["speech rules"])
D = SimpleNamespace()
TW = timezone(timedelta(hours=8))
MAX_ROWS = 300

# The same list ships inside frontend/js/speech-say.js as the fallback when the server cannot be reached.
DEFAULTS = [
    ("SDG", "S D G"), ("AI", "A I"), ("GPT", "G P T"), ("OECD", "O E C D"), ("MRT", "M R T"), ("UN", "U N"), ("EU", "E U"),
    ("UK", "U K"), ("USA", "U S A"), ("UFO", "U F O"), ("GDP", "G D P"), ("NGO", "N G O"), ("CEO", "C E O"), ("DIY", "D I Y"),
    ("CEFR", "C E F R"), ("ESG", "E S G"), ("CO2", "C O 2"), ("PM2.5", "P M 2.5"),
    ("e.g.", "for example"), ("i.e.", "that is"), ("vs.", "versus"), ("etc.", "et cetera"), ("&", "and"),
]


def _now():
    return datetime.now(TW).isoformat(timespec="seconds")


def configure(**deps):
    D.__dict__.update(deps)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS speech_rules (
            id {D.auto_pk_sql()},
            written TEXT NOT NULL UNIQUE,
            spoken TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            updated_by INTEGER
        )""")
    cur.execute("SELECT COUNT(*) AS c FROM speech_rules")
    if cur.fetchone()["c"] == 0:
        _write(cur, [{"written": w, "spoken": s} for w, s in DEFAULTS], None)
    conn.commit()
    conn.close()


def _write(cur, rows, user_id):
    _cache["at"] = 0.0                      # the next say() reads the new table
    cur.execute("DELETE FROM speech_rules")
    now = _now()
    for i, r in enumerate(rows):
        cur.execute("INSERT INTO speech_rules (written, spoken, position, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)",
                    (r["written"], r["spoken"], i, now, user_id))


def _rows(cur):
    cur.execute("SELECT written, spoken, updated_at, updated_by FROM speech_rules ORDER BY position, id")
    return [dict(r) for r in cur.fetchall()]


def clean(rows):
    """The table as it will be stored, or a 400 that names the row. Text is plain text: no control
    characters, nothing longer than a short phrase."""
    out, seen = [], set()
    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"最多 {MAX_ROWS} 列。")
    for i, r in enumerate(rows, 1):
        written = "".join(ch for ch in str(r.get("written") or "") if ch.isprintable()).strip()
        spoken = " ".join("".join(ch for ch in str(r.get("spoken") or "") if ch.isprintable()).split())
        if not written and not spoken:
            continue                                    # an empty row in the editor
        if not written:
            raise HTTPException(status_code=400, detail=f"第 {i} 列：「寫成」是空的。")
        if not spoken:
            raise HTTPException(status_code=400, detail=f"第 {i} 列（{written}）：「念成」是空的。")
        if len(written) > 40 or len(spoken) > 120:
            raise HTTPException(status_code=400, detail=f"第 {i} 列（{written[:20]}）：太長了（寫成最多 40 字，念成最多 120 字）。")
        if " " in written:
            raise HTTPException(status_code=400, detail=f"第 {i} 列（{written}）：「寫成」只能是一個字或縮寫，中間不能有空格。")
        if written in seen:
            raise HTTPException(status_code=400, detail=f"第 {i} 列：「{written}」出現兩次。")
        seen.add(written)
        out.append({"written": written, "spoken": spoken})
    return out


_cache = {"at": 0.0, "map": {}, "re": None}


def _compiled():
    """The table as one pattern, re-read from the database every 30 seconds (and at once after a save)."""
    if time.time() - _cache["at"] < 30:
        return _cache["map"], _cache["re"]
    conn = D.get_db()
    cur = conn.cursor()
    rows = _rows(cur)
    conn.close()
    table = {r["written"]: r["spoken"] for r in rows if r["written"] and r["spoken"] and " " not in r["written"]}
    keys = sorted(table, key=len, reverse=True)
    pattern = re.compile("(^|[^A-Za-z0-9])(" + "|".join(re.escape(k) for k in keys) + ")(s?)(?![A-Za-z0-9])") if keys else None
    _cache.update(at=time.time(), map=table, re=pattern)
    return table, pattern


def say(text):
    """What a voice is given for this text. Must stay the same as CardLearnSay() in
    frontend/js/speech-say.js: whole tokens only, a plural s kept on capital abbreviations,
    dashes / semicolons / colons turned into a pause."""
    t = str(text or "")
    table, pattern = _compiled()
    if pattern:
        def swap(m):
            before, word, plural = m.group(1), m.group(2), m.group(3)
            if plural and not re.fullmatch(r"[A-Z0-9.]+", word):
                return m.group(0)
            return (before + ("" if re.match(r"[A-Za-z0-9]", word) else " ") + table[word] + plural
                    + ("" if re.search(r"[A-Za-z0-9.]$", word) else " "))
        t = pattern.sub(swap, t)
    t = re.sub(r"\s*[—–]\s*|\s+-\s+", ", ", t)
    t = re.sub(r"\s*;\s*", ", ", t)
    t = re.sub(r"\s*:\s+", ", ", t)
    t = re.sub(r"\s{2,}", " ", t)
    return re.sub(r"\s+,", ",", t).strip()


@router.get("/content/speech")
def speech_for_games():
    conn = D.get_db()
    cur = conn.cursor()
    rows = _rows(cur)
    conn.close()
    return {"rules": [{"written": r["written"], "spoken": r["spoken"]} for r in rows], "updated_at": max((r["updated_at"] for r in rows), default=None)}


@router.get("/teacher/speech")
def speech_for_teacher(authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    rows = _rows(cur)
    conn.close()
    return {"rules": [{"written": r["written"], "spoken": r["spoken"]} for r in rows], "updated_at": max((r["updated_at"] for r in rows), default=None),
            "defaults": [{"written": w, "spoken": s} for w, s in DEFAULTS], "max_rows": MAX_ROWS}


class RulesIn(BaseModel):
    rules: list[dict]


@router.put("/teacher/speech")
def save_speech(data: RulesIn, authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    rows = clean(data.rules)
    conn = D.get_db()
    cur = conn.cursor()
    _write(cur, rows, user["id"])
    conn.commit()
    conn.close()
    return {"rules": rows, "updated_at": _now(), "saved": len(rows)}


@router.post("/teacher/speech/reset")
def reset_speech(authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    rows = [{"written": w, "spoken": s} for w, s in DEFAULTS]
    conn = D.get_db()
    cur = conn.cursor()
    _write(cur, rows, user["id"])
    conn.commit()
    conn.close()
    return {"rules": rows, "updated_at": _now(), "saved": len(rows)}
