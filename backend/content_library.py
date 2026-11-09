"""The teaching-material library: what the games show, editable by the teacher.

One document per topic of a game:
    { id: "9-1", sdg: 9, title_en, title_zh, levels: { "A2": [ {no, part, title_en, title_zh, script, purpose, keywords}, … ], … } }
Each topic row keeps two copies: `published_json` (what students get) and `draft_json` (what the
teacher is working on; null when there is nothing unpublished). Editing only ever touches the
draft; "publish" checks it, raises the topic's version when a script or title changed (learning
data is stored with that number, so different wordings are never mixed), keeps a snapshot of
every published version, and makes it live. Deleting a topic archives it (it can be restored).

Students:  GET /content/library?game=…                         published topics that are not archived
Teacher:   GET /teacher/library                                the tree: games → topics (+ what is not editable yet)
           GET /teacher/library/{game}/{topic}                 draft (or published), checks, history
           PUT /teacher/library/{game}/{topic}/draft           save the draft (the whole document)
           POST …/publish · …/discard · …/restore-version · …/archive · …/unarchive · …/lock
           POST /teacher/library/{game}                        new topic (blank 12 or 20 slides, or a copy)
           POST …/{topic}/import                               fill one level from a spreadsheet / pasted table
           GET  …/{topic}/export.xlsx
On first start the card game's library is filled from frontend/js/pk-content.js.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter, File, Form, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel

router = APIRouter(tags=["content library"])
D = SimpleNamespace()

LEVELS = ("A1", "A2", "B1", "B2")
PART_SIZES = {20: [3, 3, 3, 3, 4, 4], 12: [2, 2, 2, 2, 2, 2]}
WORDS_PER_SECOND = {"A1": 1.5, "A2": 1.6, "B1": 1.9, "B2": 2.1}
SLIDE_FIELDS = ("no", "part", "title_en", "title_zh", "script", "purpose", "keywords")
# Games whose material lives here. The others are listed in the tree as "not editable yet" with
# the file that holds their material, so the teacher sees the whole picture in one place.
GAMES = {"pecha_kucha": "Pecha Kucha 卡牌遊戲"}
NOT_EDITABLE = [
    {"game": "sdg4-stage", "name": "SDG 4 Pecha Kucha Stage（3D）", "where": "frontend/games/innovation-harbor/js/sdg4/talk.js、guide.js", "why": "講稿和每張的中文重點寫在程式檔裡，還沒有接上教材庫。"},
    {"game": "innovation-harbor", "name": "Innovation Harbor 3D", "where": "frontend/games/innovation-harbor/js/data.js、story/chapter1.js", "why": "劇情、對話和活動寫在程式檔裡；「故事編輯器」目前只是概念版，改了不會進遊戲。"},
    {"game": "others", "name": "Around the World、Science 365、Science Debate、Morpheme Lab、3MT", "where": "frontend/pages/*.html", "why": "內容寫在各自的頁面裡，也不記錄學習資料。"},
]


def configure(**deps):
    D.__dict__.update(deps)
    init_db()


def init_db():
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS content_topics (
            id {D.auto_pk_sql()},
            game TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            sdg INTEGER,
            version INTEGER NOT NULL DEFAULT 0,
            published_json TEXT,
            draft_json TEXT,
            locked INTEGER NOT NULL DEFAULT 0,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT,
            updated_at TEXT,
            updated_by INTEGER,
            published_at TEXT,
            UNIQUE(game, topic_id)
        )""")
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS content_versions (
            id {D.auto_pk_sql()},
            topic_pk INTEGER NOT NULL,
            version INTEGER NOT NULL,
            doc_json TEXT NOT NULL,
            note TEXT,
            by_user INTEGER,
            at TEXT NOT NULL
        )""")
    cur.execute("SELECT COUNT(*) AS c FROM content_topics WHERE game = ?", ("pecha_kucha",))
    if cur.fetchone()["c"] == 0:
        _seed_card_game(cur)
    conn.commit()
    conn.close()


def _now():
    return D.now_taipei().isoformat(timespec="seconds")


def _seed_card_game(cur):
    """First start: take the question bank that ships with the frontend."""
    path = Path(D.frontend_dir) / "js" / "pk-content.js"
    try:
        text = path.read_text(encoding="utf-8")
        data = json.loads(text[text.index("window.PK_CONTENT = ") + len("window.PK_CONTENT = "):].rstrip().rstrip(";"))
    except Exception as error:  # the game still works from the static file; the teacher just starts with an empty library
        print(f"[CONTENT] could not read {path}: {error}")
        return
    locked = set(D.locked_topics or [])
    for t in data.get("topics", []):
        doc = {"id": t["id"], "sdg": t.get("sdg"), "title_en": t.get("title_en", ""), "title_zh": t.get("title_zh", ""), "levels": t.get("levels", {})}
        version = int(t.get("version") or 1)
        pk = D.execute_insert_returning(cur, """
            INSERT INTO content_topics (game, topic_id, sdg, version, published_json, locked, created_at, updated_at, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("pecha_kucha", t["id"], t.get("sdg"), version, json.dumps(doc, ensure_ascii=False), 1 if t["id"] in locked else 0, _now(), _now(), _now()), "id")
        cur.execute("INSERT INTO content_versions (topic_pk, version, doc_json, note, at) VALUES (?, ?, ?, ?, ?)",
                    (pk, version, json.dumps(doc, ensure_ascii=False), "內建題庫（frontend/js/pk-content.js）", _now()))


# ── the document: cleaning, checking, comparing ──
def clean_doc(doc, topic_id):
    """Keep only what belongs in a topic document, in a fixed shape."""
    out = {"id": topic_id, "sdg": doc.get("sdg"), "title_en": str(doc.get("title_en") or "").strip()[:200], "title_zh": str(doc.get("title_zh") or "").strip()[:200], "levels": {}}
    try:
        out["sdg"] = int(out["sdg"]) if out["sdg"] not in (None, "") else int(str(topic_id).split("-")[0])
    except (TypeError, ValueError):
        out["sdg"] = None
    for level in LEVELS:
        slides = (doc.get("levels") or {}).get(level)
        if not isinstance(slides, list):
            continue
        rows = []
        for i, s in enumerate(slides):
            if not isinstance(s, dict):
                continue
            try:
                part = int(s.get("part") or 0)
            except (TypeError, ValueError):
                part = 0
            rows.append({"no": i + 1, "part": part, "title_en": str(s.get("title_en") or "").strip()[:200], "title_zh": str(s.get("title_zh") or "").strip()[:200],
                         "script": re.sub(r"\s+", " ", str(s.get("script") or "")).strip()[:2000], "purpose": str(s.get("purpose") or "").strip()[:300],
                         "keywords": str(s.get("keywords") or "").strip()[:300]})
        out["levels"][level] = rows
    return out


def check_doc(doc):
    """The same rules as scripts/validate-content.mjs. Returns (errors, warnings); each is
    {level, no, field, message} so the editor can jump to the place."""
    errors, warnings = [], []
    add = lambda bucket, message, level=None, no=None, field=None: bucket.append({"level": level, "no": no, "field": field, "message": message})
    if not doc.get("title_en"):
        add(errors, "主題還沒有英文名稱。", field="title_en")
    if not doc.get("title_zh"):
        add(warnings, "主題還沒有中文名稱。", field="title_zh")
    levels = doc.get("levels") or {}
    if not levels:
        add(errors, "這個主題還沒有任何難度。")
    reference = None
    for level, slides in levels.items():
        if not slides:
            add(errors, "這個難度沒有投影片。", level)
            continue
        sizes = PART_SIZES.get(len(slides))
        if not sizes:
            add(errors, f"有 {len(slides)} 張投影片；Pecha Kucha 要 20 張（每段 3、3、3、3、4、4）或 12 張（每段 2 張）。", level)
        by_part = {}
        for s in slides:
            by_part.setdefault(s["part"], []).append(s)
            if not 1 <= s["part"] <= 6:
                add(errors, "段落要是 1–6。", level, s["no"], "part")
            if not s["title_en"]:
                add(errors, "英文標題是空的。", level, s["no"], "title_en")
            if not s["script"]:
                add(errors, "講稿是空的。", level, s["no"], "script")
            if not s["title_zh"]:
                add(warnings, "中文標題是空的。", level, s["no"], "title_zh")
            if re.search("�|Ã[\u0080-¿]|â€", s["title_en"] + s["title_zh"] + s["script"]):
                add(errors, "文字看起來是亂碼（編碼問題）。", level, s["no"], "script")
            for kw in [k.strip() for k in re.split(r"[,;、，；]", s["keywords"]) if re.fullmatch(r"[A-Za-z][A-Za-z '\-]*", k.strip() or "")]:
                if kw.lower() not in s["script"].lower():
                    add(errors, f"提示字「{kw}」沒有出現在講稿裡。", level, s["no"], "keywords")
            seconds = len(s["script"].split()) / WORDS_PER_SECOND.get(level, 1.8)
            if seconds > 20:
                add(warnings, f"照這個難度的速度大約要念 {seconds:.0f} 秒（Pecha Kucha 一張是 20 秒）。", level, s["no"], "script")
        if sizes:
            for i, n in enumerate(sizes):
                got = len(by_part.get(i + 1, []))
                if got != n:
                    add(errors, f"Part {i + 1} 有 {got} 張，應該是 {n} 張。", level)
        for part, rows in by_part.items():
            seen = {}
            for s in rows:
                key = s["title_en"].lower()
                if key and key in seen:
                    add(errors, f"Part {part} 有兩張的英文標題都是「{s['title_en']}」（第 {seen[key]} 張和這一張）。卡面只顯示英文標題，學生分不出來，放對也會被判錯。", level, s["no"], "title_en")
                seen.setdefault(key, s["no"])
        if reference is None:
            reference = (level, slides)
        else:
            for s, r in zip(slides, reference[1]):
                if s["title_en"] != r["title_en"]:
                    add(errors, f"英文標題和 {reference[0]} 的同一張不一樣（{reference[0]}：「{r['title_en']}」）。同一張投影片換難度只換講稿。", level, s["no"], "title_en")
    return errors, warnings


def content_hash(doc):
    """Changes when a script, a title or the slide layout changes — the things learning data depends on."""
    h = hashlib.sha256()
    for level in sorted((doc.get("levels") or {})):
        for s in doc["levels"][level]:
            h.update(f"{level}\x01{s['no']}\x01{s['part']}\x01{s['title_en']}\x01{s['script']}\x02".encode())
    return h.hexdigest()[:16]


def blank_doc(topic_id, sdg, title_en, title_zh, slides, levels):
    sizes = PART_SIZES[slides]
    rows = [{"no": i + 1, "part": p + 1, "title_en": "", "title_zh": "", "script": "", "purpose": "", "keywords": ""}
            for i, p in enumerate(part for part, n in enumerate(sizes) for _ in range(n))]
    return {"id": topic_id, "sdg": sdg, "title_en": title_en, "title_zh": title_zh, "levels": {l: [dict(r) for r in rows] for l in levels}}


# ── reading ──
def _row(cur, game, topic_id):
    if game not in GAMES:
        raise HTTPException(status_code=404, detail="這個遊戲的教材還不能在這裡編輯。")
    cur.execute("SELECT * FROM content_topics WHERE game = ? AND topic_id = ?", (game, topic_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="找不到這個主題。")
    return dict(row)


def _summary(row):
    published = json.loads(row["published_json"]) if row["published_json"] else None
    draft = json.loads(row["draft_json"]) if row["draft_json"] else None
    doc = draft or published or {}
    errors, warnings = check_doc(doc) if doc else ([], [])
    return {"topic_id": row["topic_id"], "sdg": row["sdg"], "title_en": doc.get("title_en", ""), "title_zh": doc.get("title_zh", ""), "version": row["version"],
            "published": published is not None, "has_draft": draft is not None, "locked": bool(row["locked"]), "archived": bool(row["archived"]),
            "levels": {l: len(s) for l, s in (doc.get("levels") or {}).items()}, "errors": len(errors), "warnings": len(warnings),
            "updated_at": row["updated_at"], "published_at": row["published_at"]}


def card_titles(game="pecha_kucha"):
    """{'9-1/A2/s02': 'Slide title'} for every topic, deleted ones included — reports and exports
    show a title beside the card code. What is published wins over a draft."""
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT topic_id, published_json, draft_json FROM content_topics WHERE game = ?", (game,))
    out = {}
    for r in cur.fetchall():
        try:
            doc = json.loads(r["published_json"] or r["draft_json"] or "{}")
        except ValueError:
            continue
        for level, slides in (doc.get("levels") or {}).items():
            for sl in slides:
                out[f"{r['topic_id']}/{level}/s{int(sl.get('no') or 0):02d}"] = sl.get("title_en") or ""
    conn.close()
    return out


@router.get("/content/library")
def student_library(game: str = "pecha_kucha"):
    """What students play: published, not archived. Same shape as window.PK_CONTENT, plus `locked`."""
    if game not in GAMES:
        raise HTTPException(status_code=404, detail="unknown game")
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT topic_id, version, published_json, locked FROM content_topics WHERE game = ? AND archived = 0 AND published_json IS NOT NULL", (game,))
    topics = []
    for r in cur.fetchall():
        doc = json.loads(r["published_json"])
        topics.append({**doc, "id": r["topic_id"], "version": r["version"], "locked": bool(r["locked"])})
    conn.close()
    topics.sort(key=lambda t: [int(x) if x.isdigit() else 0 for x in str(t["id"]).split("-")])
    return {"game": game, "topics": topics}


@router.get("/teacher/library")
def tree(authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM content_topics ORDER BY game, sdg, topic_id")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    games = []
    for game, name in GAMES.items():
        topics = [_summary(r) for r in rows if r["game"] == game]
        topics.sort(key=lambda t: [int(x) if x.isdigit() else 0 for x in str(t["topic_id"]).split("-")])
        games.append({"game": game, "name": name, "editable": True, "topics": topics})
    return {"games": games, "not_editable": NOT_EDITABLE, "levels": list(LEVELS), "part_sizes": PART_SIZES, "words_per_second": WORDS_PER_SECOND}


@router.get("/teacher/library/{game}/{topic_id}")
def read_topic(game: str, topic_id: str, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    row = _row(cur, game, topic_id)
    cur.execute("SELECT v.version, v.note, v.at, u.name AS by_name FROM content_versions v LEFT JOIN users u ON u.id = v.by_user WHERE v.topic_pk = ? ORDER BY v.id DESC LIMIT 30", (row["id"],))
    history = [dict(r) for r in cur.fetchall()]
    conn.close()
    published = json.loads(row["published_json"]) if row["published_json"] else None
    draft = json.loads(row["draft_json"]) if row["draft_json"] else None
    doc = draft or published
    errors, warnings = check_doc(doc)
    return {"summary": _summary(row), "doc": doc, "published": published, "errors": errors, "warnings": warnings, "history": history,
            "changes_data": bool(published) and bool(draft) and content_hash(draft) != content_hash(published)}


# ── writing ──
class DocIn(BaseModel):
    doc: dict


class PublishIn(BaseModel):
    note: str | None = None


class NewTopicIn(BaseModel):
    topic_id: str
    title_en: str = ""
    title_zh: str = ""
    slides: int = 20
    levels: list[str] = ["A2", "B1", "B2"]
    copy_from: str | None = None


class VersionIn(BaseModel):
    version: int


class LockIn(BaseModel):
    locked: bool


def _save_draft(cur, row, doc, user):
    doc = clean_doc(doc, row["topic_id"])
    published = json.loads(row["published_json"]) if row["published_json"] else None
    same = published is not None and json.dumps(doc, sort_keys=True, ensure_ascii=False) == json.dumps(clean_doc(published, row["topic_id"]), sort_keys=True, ensure_ascii=False)
    cur.execute("UPDATE content_topics SET draft_json = ?, sdg = ?, updated_at = ?, updated_by = ? WHERE id = ?",
                (None if same else json.dumps(doc, ensure_ascii=False), doc["sdg"], _now(), user["id"], row["id"]))
    return doc, same


@router.put("/teacher/library/{game}/{topic_id}/draft")
def save_draft(game: str, topic_id: str, data: DocIn, authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    row = _row(cur, game, topic_id)
    doc, same = _save_draft(cur, row, data.doc, user)
    conn.commit()
    published = json.loads(row["published_json"]) if row["published_json"] else None
    conn.close()
    errors, warnings = check_doc(doc)
    return {"saved": True, "has_draft": not same, "errors": errors, "warnings": warnings,
            "changes_data": bool(published) and not same and content_hash(doc) != content_hash(published), "saved_at": _now()}


@router.post("/teacher/library/{game}/{topic_id}/publish")
def publish(game: str, topic_id: str, data: PublishIn, authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    row = _row(cur, game, topic_id)
    if not row["draft_json"]:
        conn.close()
        raise HTTPException(status_code=400, detail="沒有還沒發佈的修改。")
    doc = json.loads(row["draft_json"])
    errors, warnings = check_doc(doc)
    if errors:
        conn.close()
        raise HTTPException(status_code=400, detail={"message": f"還有 {len(errors)} 個問題要先修好才能發佈。", "errors": errors})
    published = json.loads(row["published_json"]) if row["published_json"] else None
    bump = published is None or content_hash(doc) != content_hash(published)
    version = row["version"] + 1 if bump else row["version"]
    cur.execute("UPDATE content_topics SET published_json = ?, draft_json = NULL, version = ?, updated_at = ?, updated_by = ?, published_at = ? WHERE id = ?",
                (json.dumps(doc, ensure_ascii=False), version, _now(), user["id"], _now(), row["id"]))
    cur.execute("INSERT INTO content_versions (topic_pk, version, doc_json, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?)",
                (row["id"], version, json.dumps(doc, ensure_ascii=False), (data.note or "").strip()[:300] or ("改了講稿或標題" if bump else "只改了不影響數據的欄位"), user["id"], _now()))
    conn.commit()
    conn.close()
    return {"published": True, "version": version, "version_raised": bump, "warnings": warnings}


@router.post("/teacher/library/{game}/{topic_id}/discard")
def discard(game: str, topic_id: str, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    row = _row(cur, game, topic_id)
    if not row["published_json"]:
        conn.close()
        raise HTTPException(status_code=400, detail="這個主題還沒發佈過，沒有可以回到的版本。不要它的話請刪除主題。")
    cur.execute("UPDATE content_topics SET draft_json = NULL, updated_at = ? WHERE id = ?", (_now(), row["id"]))
    conn.commit()
    conn.close()
    return {"discarded": True}


@router.post("/teacher/library/{game}/{topic_id}/restore-version")
def restore_version(game: str, topic_id: str, data: VersionIn, authorization: str | None = Header(default=None)):
    """Puts an earlier published version into the draft; it becomes live only when published again."""
    user = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    row = _row(cur, game, topic_id)
    cur.execute("SELECT doc_json FROM content_versions WHERE topic_pk = ? AND version = ? ORDER BY id DESC LIMIT 1", (row["id"], data.version))
    old = cur.fetchone()
    if not old:
        conn.close()
        raise HTTPException(status_code=404, detail="找不到這個版本。")
    _save_draft(cur, row, json.loads(old["doc_json"]), user)
    conn.commit()
    conn.close()
    return {"restored_to_draft": data.version}


@router.post("/teacher/library/{game}/{topic_id}/archive")
def archive(game: str, topic_id: str, authorization: str | None = Header(default=None)):
    return _flag(game, topic_id, "archive", None, authorization)


@router.post("/teacher/library/{game}/{topic_id}/unarchive")
def unarchive(game: str, topic_id: str, authorization: str | None = Header(default=None)):
    return _flag(game, topic_id, "unarchive", None, authorization)


@router.post("/teacher/library/{game}/{topic_id}/lock")
def lock(game: str, topic_id: str, data: LockIn, authorization: str | None = Header(default=None)):
    return _flag(game, topic_id, "lock", data, authorization)


def _flag(game, topic_id, action, data, authorization):
    user = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    row = _row(cur, game, topic_id)
    if action == "lock":
        if data is None:
            conn.close()
            raise HTTPException(status_code=400, detail="locked is required")
        cur.execute("UPDATE content_topics SET locked = ?, updated_at = ?, updated_by = ? WHERE id = ?", (1 if data.locked else 0, _now(), user["id"], row["id"]))
    else:
        cur.execute("UPDATE content_topics SET archived = ?, updated_at = ?, updated_by = ? WHERE id = ?", (1 if action == "archive" else 0, _now(), user["id"], row["id"]))
    conn.commit()
    cur.execute("SELECT * FROM content_topics WHERE id = ?", (row["id"],))
    out = _summary(dict(cur.fetchone()))
    conn.close()
    return {"summary": out}


@router.post("/teacher/library/{game}")
def new_topic(game: str, data: NewTopicIn, authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    if game not in GAMES:
        raise HTTPException(status_code=404, detail="這個遊戲的教材還不能在這裡編輯。")
    topic_id = data.topic_id.strip()
    if not re.fullmatch(r"\d{1,2}-\d{1,2}", topic_id):
        raise HTTPException(status_code=400, detail="主題代碼要像 9-2：SDG 編號、減號、第幾個主題。")
    if data.slides not in PART_SIZES:
        raise HTTPException(status_code=400, detail="投影片張數只能是 20 或 12。")
    levels = [l for l in LEVELS if l in data.levels] or ["A2"]
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, archived FROM content_topics WHERE game = ? AND topic_id = ?", (game, topic_id))
    clash = cur.fetchone()
    if clash:
        conn.close()
        raise HTTPException(status_code=400, detail=f"已經有主題 {topic_id} 了" + ("（在「已刪除」裡，可以復原）。" if clash["archived"] else "。"))
    sdg = int(topic_id.split("-")[0])
    if data.copy_from:
        src = _row(cur, game, data.copy_from)
        doc = json.loads(src["draft_json"] or src["published_json"])
        doc = {**doc, "id": topic_id, "sdg": sdg, "title_en": data.title_en.strip() or doc.get("title_en", ""), "title_zh": data.title_zh.strip() or doc.get("title_zh", "")}
    else:
        doc = blank_doc(topic_id, sdg, data.title_en.strip(), data.title_zh.strip(), data.slides, levels)
    doc = clean_doc(doc, topic_id)
    # A new topic is locked until it has been published once, so half-written material never shows.
    D.execute_insert_returning(cur, """
        INSERT INTO content_topics (game, topic_id, sdg, version, published_json, draft_json, locked, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, 0, NULL, ?, 0, ?, ?, ?)""", (game, topic_id, sdg, json.dumps(doc, ensure_ascii=False), _now(), _now(), user["id"]), "id")
    conn.commit()
    conn.close()
    return {"created": topic_id}


# ── spreadsheet in and out ──
IMPORT_HEADERS = {
    "level": ("難度", "level", "cefr"), "no": ("張", "張數", "編號", "no", "slide", "#"), "part": ("段落", "part", "段"),
    "title_en": ("英文標題", "title", "title_en", "english title", "標題"), "title_zh": ("中文標題", "title_zh", "chinese title"),
    "script": ("講稿", "script", "sentence", "句子", "內容"), "keywords": ("提示", "關鍵字", "keywords", "hint"), "purpose": ("用途", "purpose", "說明"),
}


def _table(file_bytes, filename, text):
    if file_bytes and ((filename or "").lower().endswith(".xlsx") or file_bytes[:2] == b"PK"):
        for _, rows in D.load_xlsx_rows(file_bytes):
            table = [["" if c is None else str(int(c) if isinstance(c, float) and c.is_integer() else c).strip() for c in (r or [])] for r in rows]
            table = [r for r in table if any(r)]
            if table:
                return table
        return []
    if file_bytes:
        for enc in ("utf-8-sig", "cp950"):
            try:
                text = file_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    first = next((l for l in text.split("\n") if l.strip()), "")
    delim = "\t" if "\t" in first else ","
    return [r for r in ([c.strip() for c in row] for row in csv.reader(io.StringIO(text), delimiter=delim)) if any(r)]


@router.post("/teacher/library/{game}/{topic_id}/import")
async def import_level(game: str, topic_id: str, level: str = Form(""), text: str = Form(""), file: UploadFile | None = File(default=None),
                       authorization: str | None = Header(default=None)):
    """Rows → the draft. Columns by header: 難度（可省略，改用上面選的難度）、張、段落、英文標題、中文標題、講稿、提示.
    A level present in the sheet replaces that level in the draft; other levels are left alone."""
    user = D.require_teacher(authorization)
    data = await file.read() if file is not None else None
    table = _table(data, file.filename if file is not None else "", text)
    if len(table) < 2:
        raise HTTPException(status_code=400, detail="沒有讀到資料。第一列要是欄位名稱：張、段落、英文標題、中文標題、講稿。")
    head = [re.sub(r"\s+", " ", h).strip().lower() for h in table[0]]
    cols = {}
    for key, names in IMPORT_HEADERS.items():
        for i, h in enumerate(head):
            if h in names and key not in cols:
                cols[key] = i
    if "script" not in cols or "title_en" not in cols:
        raise HTTPException(status_code=400, detail="找不到「英文標題」和「講稿」這兩欄。第一列要是欄位名稱。")
    by_level = {}
    for r in table[1:]:
        get = lambda k: (r[cols[k]] if k in cols and cols[k] < len(r) else "")
        lv = (get("level") or level).strip().upper()
        if lv not in LEVELS:
            raise HTTPException(status_code=400, detail=f"難度要是 A1、A2、B1 或 B2（讀到「{lv or '空白'}」）。沒有「難度」欄的話，請先在上面選要匯入到哪個難度。")
        by_level.setdefault(lv, []).append({"part": get("part"), "title_en": get("title_en"), "title_zh": get("title_zh"), "script": get("script"), "keywords": get("keywords"), "purpose": get("purpose")})
    conn = D.get_db()
    cur = conn.cursor()
    row = _row(cur, game, topic_id)
    doc = json.loads(row["draft_json"] or row["published_json"])
    for lv, rows in by_level.items():
        sizes = PART_SIZES.get(len(rows))
        if sizes and not any(str(x["part"]).strip() for x in rows):   # no part column: fill it from the standard layout
            order = [p + 1 for p, n in enumerate(sizes) for _ in range(n)]
            for x, p in zip(rows, order):
                x["part"] = p
        doc.setdefault("levels", {})[lv] = rows
    doc, _ = _save_draft(cur, row, doc, user)
    conn.commit()
    conn.close()
    errors, warnings = check_doc(doc)
    return {"imported": {lv: len(rows) for lv, rows in by_level.items()}, "errors": errors, "warnings": warnings}


@router.get("/teacher/library/{game}/{topic_id}/export.xlsx")
def export_topic(game: str, topic_id: str, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl is not installed")
    conn = D.get_db()
    row = _row(conn.cursor(), game, topic_id)
    conn.close()
    doc = json.loads(row["draft_json"] or row["published_json"])
    wb = Workbook()
    ws = wb.active
    ws.title = topic_id
    ws.append(["難度", "張", "段落", "英文標題", "中文標題", "講稿", "提示"])
    for level, slides in doc["levels"].items():
        for s in slides:
            ws.append([level, s["no"], s["part"], s["title_en"], s["title_zh"], s["script"], s["keywords"]])
    for col, width in zip("ABCDEFG", (8, 6, 6, 36, 28, 90, 30)):
        ws.column_dimensions[col].width = width
    buf = io.BytesIO()
    wb.save(buf)
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="material-{game}-{topic_id}.xlsx"'})
