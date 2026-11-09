"""Students' voice recordings: upload, the teacher's listening queue, feedback, retention.

Design: docs/handoff/2026-11-08-card-game-learning-design.md, section "錄音上傳的同意與隱私".
  - Consent: the school holds a signed paper consent for all data on the platform (owner,
    2026-11-09), so by default the platform does not ask again and a signed-in student's
    recording is accepted. AUDIO_REQUIRE_CONSENT=true brings the in-app question back: uploads are
    then refused until the student has agreed (users.consent_audio = 1, apart from research consent).
  - Only teachers and admins can list or play recordings. File names and ids carry no names.
  - Every recording has an expiry date (AUDIO_RETENTION_DAYS, default 150 ≈ one term + 30 days)
    and is deleted after it; expired rows are purged at start-up and whenever the list is read.
  - Where the audio is kept: with AUDIO_DIR set (the lab VM), each clip is a file under
    <AUDIO_DIR>/<yyyy-mm>/ and the database holds only its path; without it (Railway, local) the
    clip is stored in the database column `audio`, so it survives a redeploy that has no disk.
    One clip is capped at AUDIO_MAX_BYTES (default 4 MB).

Student:  GET/POST /me/consent · POST /me/recordings (multipart) · GET /me/recordings
Teacher:  GET /teacher/recordings · GET /teacher/recordings/{id}/audio · PATCH · DELETE
"""
from __future__ import annotations

import math
import os
import secrets
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel

router = APIRouter(tags=["recordings"])
D = SimpleNamespace()

RETENTION_DAYS = int(os.getenv("AUDIO_RETENTION_DAYS", "").strip() or 150)
MAX_BYTES = int(os.getenv("AUDIO_MAX_BYTES", "").strip() or 4 * 1024 * 1024)
MAX_PER_DAY = int(os.getenv("AUDIO_MAX_PER_DAY", "").strip() or 60)      # clips one student can send in a day
AUDIO_DIR = os.getenv("AUDIO_DIR", "").strip()
REQUIRE_CONSENT = os.getenv("AUDIO_REQUIRE_CONSENT", "").strip().lower() in {"1", "true", "yes", "on"}
EXTENSIONS = {"audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "video/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav"}
STATUSES = ("new", "heard", "feedback", "redo")     # 未聽 / 已聽 / 已回饋 / 請重錄
GAMES = ("pecha_kucha", "innovation-harbor", "sdg4-stage")


def configure(**deps):
    D.__dict__.update(deps)
    init_db()


def init_db():
    conn = D.get_db()
    cur = conn.cursor()
    blob = "BYTEA" if D.use_postgres else "BLOB"
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS speech_recordings (
            id {D.auto_pk_sql()},
            user_id INTEGER NOT NULL REFERENCES users(id),
            course_id INTEGER,
            section_id INTEGER,
            game TEXT NOT NULL,
            run_id INTEGER,
            topic_id TEXT,
            level TEXT,
            label TEXT,
            content_version INTEGER,
            script_text TEXT,
            mime TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            seconds REAL,
            target_seconds REAL,
            wpm INTEGER,
            heard_ratio REAL,
            client_id TEXT UNIQUE,
            status TEXT NOT NULL DEFAULT 'new',
            teacher_note TEXT,
            reviewed_by INTEGER,
            reviewed_at TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            audio {blob} NOT NULL
        )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_speech_recordings_user ON speech_recordings(user_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_speech_recordings_course ON speech_recordings(course_id)")
    if "file_path" not in D.table_columns(cur, "speech_recordings"):
        D.execute_with_retry(cur, "ALTER TABLE speech_recordings ADD COLUMN file_path TEXT")
    if "consent_at" not in D.table_columns(cur, "users"):
        D.execute_with_retry(cur, "ALTER TABLE users ADD COLUMN consent_at TEXT")
    _purge(cur)
    conn.commit()
    conn.close()


def _now():
    return D.now_taipei().isoformat(timespec="seconds")


def _remove_files(cur, where, params):
    """Delete the audio files of the rows about to be deleted (file storage only)."""
    cur.execute(f"SELECT file_path FROM speech_recordings WHERE {where} AND file_path IS NOT NULL", params)
    for row in cur.fetchall():
        try:
            Path(row["file_path"]).unlink(missing_ok=True)
        except OSError as error:
            print(f"[RECORDINGS] could not delete {row['file_path']}: {error}")


def _purge(cur):
    now = _now()
    _remove_files(cur, "expires_at < ?", (now,))
    cur.execute("DELETE FROM speech_recordings WHERE expires_at < ?", (now,))


def forget_user(cur, user_id):
    _remove_files(cur, "user_id = ?", (user_id,))
    cur.execute("DELETE FROM speech_recordings WHERE user_id = ?", (user_id,))


def _store_file(audio, mime):
    """Write the clip under AUDIO_DIR and return its path; the name is random and carries no personal data."""
    folder = Path(AUDIO_DIR) / D.now_taipei().strftime("%Y-%m")
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{secrets.token_hex(12)}.{EXTENSIONS.get(mime, 'bin')}"
    path.write_bytes(audio)
    return str(path)


def storage_info():
    """Where recordings are kept and how much they take (for the storage estimate)."""
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS b, COALESCE(SUM(seconds), 0) AS s FROM speech_recordings")
    row = cur.fetchone()
    conn.close()
    return {"where": f"files in {AUDIO_DIR}" if AUDIO_DIR else "database", "recordings": row["n"], "bytes": int(row["b"]), "seconds": float(row["s"] or 0),
            "retention_days": RETENTION_DAYS, "max_bytes": MAX_BYTES}


COLUMNS = """r.id, r.user_id, r.course_id, r.section_id, r.game, r.run_id, r.topic_id, r.level, r.label, r.content_version,
             r.script_text, r.mime, r.size_bytes, r.seconds, r.target_seconds, r.wpm, r.heard_ratio, r.status,
             r.teacher_note, r.reviewed_at, r.created_at, r.expires_at"""


# ── consent ──
class ConsentIn(BaseModel):
    audio: bool | None = None
    research: bool | None = None


def _consent(cur, user_id):
    cur.execute("SELECT consent_audio, consent_research, consent_at FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    as_bool = lambda v: None if v is None else bool(v)
    return {"audio": as_bool(row["consent_audio"]), "research": as_bool(row["consent_research"]), "at": row["consent_at"],
            "retention_days": RETENTION_DAYS, "required": REQUIRE_CONSENT}


@router.get("/me/consent")
def my_consent(authorization: str | None = Header(default=None)):
    user = D.get_current_user(authorization)
    conn = D.get_db()
    out = _consent(conn.cursor(), user["id"])
    conn.close()
    return out


@router.post("/me/consent")
def set_consent(data: ConsentIn, authorization: str | None = Header(default=None)):
    user = D.get_current_user(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    if data.audio is not None:
        cur.execute("UPDATE users SET consent_audio = ?, consent_at = ? WHERE id = ?", (1 if data.audio else 0, _now(), user["id"]))
    if data.research is not None:
        cur.execute("UPDATE users SET consent_research = ?, consent_at = ? WHERE id = ?", (1 if data.research else 0, _now(), user["id"]))
    conn.commit()
    out = _consent(cur, user["id"])
    conn.close()
    return out


# ── student ──
@router.post("/me/recordings")
async def upload_recording(
    file: UploadFile = File(...), game: str = Form(...), client_id: str = Form(""),
    topic_id: str = Form(""), level: str = Form(""), label: str = Form(""), script_text: str = Form(""),
    run_id: int | None = Form(default=None), course_id: int | None = Form(default=None), content_version: int | None = Form(default=None),
    seconds: float | None = Form(default=None), target_seconds: float | None = Form(default=None),
    wpm: int | None = Form(default=None), heard_ratio: float | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    user = D.get_current_user(authorization)
    if game not in GAMES:
        raise HTTPException(status_code=400, detail="unknown game")
    mime = (file.content_type or "").split(";")[0].strip().lower()
    if not (mime.startswith("audio/") or mime in ("video/webm", "video/mp4", "application/octet-stream")):
        raise HTTPException(status_code=400, detail="這不是錄音檔。Not an audio file.")
    too_large = HTTPException(status_code=413, detail=f"錄音太大（上限 {MAX_BYTES // 1024 // 1024} MB）。The recording is too large.")
    if (getattr(file, "size", None) or 0) > MAX_BYTES:
        raise too_large
    audio = await file.read(MAX_BYTES + 1)       # never more than the limit in memory
    if not audio:
        raise HTTPException(status_code=400, detail="錄音是空的。The recording is empty.")
    if len(audio) > MAX_BYTES:
        raise too_large
    # B6: numbers from the browser must be real numbers in a sensible range (nan/inf would break the teacher's list)
    def number(v, low, high):
        return min(max(float(v), low), high) if v is not None and math.isfinite(float(v)) else None
    seconds, target_seconds, heard_ratio = number(seconds, 0, 3600), number(target_seconds, 0, 3600), number(heard_ratio, 0, 1)
    wpm = int(number(wpm, 0, 600)) if wpm is not None else None
    run_id = run_id if run_id is not None and 0 < run_id <= 2_000_000_000 else None
    course_id = course_id if course_id is not None and 0 < course_id <= 2_000_000_000 else None
    content_version = content_version if content_version is not None and 0 <= content_version <= 2_000_000_000 else None
    game, topic_id, level, label, script_text = (x.replace("\x00", "") for x in (game, topic_id, level, label, script_text))
    client_id = client_id.replace("\x00", "").strip()[:64] or None
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT consent_audio FROM users WHERE id = ?", (user["id"],))
    if REQUIRE_CONSENT and cur.fetchone()["consent_audio"] != 1:
        conn.close()
        raise HTTPException(status_code=403, detail="要先同意上傳錄音，才能送出給老師。Agree to uploading recordings first.")
    if client_id:
        cur.execute("SELECT id, user_id FROM speech_recordings WHERE client_id = ?", (client_id,))
        old = cur.fetchone()
        if old:
            conn.close()
            if old["user_id"] != user["id"]:
                raise HTTPException(status_code=403, detail="not your recording")
            return {"id": old["id"], "saved": True, "duplicate": True}
    cur.execute("SELECT COUNT(*) AS c FROM speech_recordings WHERE user_id = ? AND created_at >= ?", (user["id"], _now()[:10]))
    if cur.fetchone()["c"] >= MAX_PER_DAY:
        conn.close()
        raise HTTPException(status_code=429, detail=f"今天送出的錄音已經到上限（{MAX_PER_DAY} 段），明天再送。")
    course, section = D.resolve_course(cur, user["id"], course_id)
    expires = (D.now_taipei() + timedelta(days=RETENTION_DAYS)).isoformat(timespec="seconds")
    file_path = _store_file(audio, mime) if AUDIO_DIR else None
    try:
        rec_id = D.execute_insert_returning(cur, """
            INSERT INTO speech_recordings (user_id, course_id, section_id, game, run_id, topic_id, level, label, content_version,
                script_text, mime, size_bytes, seconds, target_seconds, wpm, heard_ratio, client_id, status, created_at, expires_at, audio, file_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)""",
            (user["id"], course, section, game, run_id, topic_id.strip()[:20] or None, level.strip()[:8] or None, label.strip()[:80] or None,
             content_version, script_text.strip()[:3000] or None, mime or "audio/webm", len(audio), seconds, target_seconds, wpm, heard_ratio,
             client_id, _now(), expires, b"" if file_path else audio, file_path), "id")
        conn.commit()
    except Exception as error:
        if file_path:
            Path(file_path).unlink(missing_ok=True)
        conn.close()
        if D.is_integrity_error(error):   # two copies of the same upload raced
            return {"saved": True, "duplicate": True}
        raise
    conn.close()
    return {"id": rec_id, "saved": True, "expires_at": expires}


@router.get("/me/recordings")
def my_recordings(game: str | None = None, topic_id: str | None = None, label: str | None = None, authorization: str | None = Header(default=None)):
    user = D.get_current_user(authorization)
    where, params = ["r.user_id = ?"], [user["id"]]
    for col, val in (("game", game), ("topic_id", topic_id), ("label", label)):
        if val:
            where.append(f"r.{col} = ?"); params.append(val)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute(f"SELECT {COLUMNS} FROM speech_recordings r WHERE {' AND '.join(where)} ORDER BY r.id DESC LIMIT 50", params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"recordings": rows}


# ── teacher ──
@router.get("/teacher/recordings")
def list_recordings(course_id: int | None = None, section_id: int | None = None, user_id: int | None = None, status: str | None = None,
                    game: str | None = None, topic_id: str | None = None, level: str | None = None,
                    date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"), limit: int = 300,
                    authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    where, params = [], []
    for col, val in (("course_id", course_id), ("section_id", section_id), ("user_id", user_id), ("status", status), ("game", game), ("topic_id", topic_id), ("level", level)):
        if val not in (None, ""):
            where.append(f"r.{col} = ?"); params.append(val)
    if date_from:
        where.append("r.created_at >= ?"); params.append(date_from)
    if date_to:
        where.append("r.created_at <= ?"); params.append(date_to + "T23:59:59")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    conn = D.get_db()
    cur = conn.cursor()
    _purge(cur)
    conn.commit()
    cur.execute(f"""
        SELECT {COLUMNS}, u.name, u.student_no, u.public_id, s.label AS section, c.name AS course_name
        FROM speech_recordings r JOIN users u ON u.id = r.user_id
        LEFT JOIN course_sections s ON s.id = r.section_id LEFT JOIN courses c ON c.id = r.course_id
        {clause} ORDER BY r.id DESC LIMIT ?""", params + [max(1, min(limit, 1000))])
    rows = [dict(r) for r in cur.fetchall()]
    cur.execute(f"SELECT r.status, COUNT(*) AS c FROM speech_recordings r{clause} GROUP BY r.status", params)
    counts = {r["status"]: r["c"] for r in cur.fetchall()}
    conn.close()
    return {"recordings": rows, "counts": {s: counts.get(s, 0) for s in STATUSES}, "retention_days": RETENTION_DAYS}


@router.get("/teacher/recordings/{rec_id}/audio")
def recording_audio(rec_id: int, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT audio, file_path, mime, status FROM speech_recordings WHERE id = ?", (rec_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="recording not found")
    if row["status"] == "new":   # playing it is what "heard" means
        cur.execute("UPDATE speech_recordings SET status = 'heard', reviewed_by = ?, reviewed_at = ? WHERE id = ?", (teacher["id"], _now(), rec_id))
        conn.commit()
    conn.close()
    if row["file_path"]:
        try:
            audio = Path(row["file_path"]).read_bytes()
        except OSError:
            raise HTTPException(status_code=410, detail="錄音檔已不在磁碟上。The audio file is no longer on disk.")
    else:
        audio = bytes(row["audio"])
    return Response(content=audio, media_type=row["mime"] or "audio/webm", headers={"Cache-Control": "private, no-store"})


class RecordingPatch(BaseModel):
    status: str | None = None
    note: str | None = None


@router.patch("/teacher/recordings/{rec_id}")
def patch_recording(rec_id: int, data: RecordingPatch, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    if data.status is not None and data.status not in STATUSES:
        raise HTTPException(status_code=400, detail="status must be one of " + ", ".join(STATUSES))
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM speech_recordings WHERE id = ?", (rec_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="recording not found")
    if data.note is not None:
        cur.execute("UPDATE speech_recordings SET teacher_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?", (data.note.strip()[:1000] or None, teacher["id"], _now(), rec_id))
    if data.status is not None:
        cur.execute("UPDATE speech_recordings SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?", (data.status, teacher["id"], _now(), rec_id))
    conn.commit()
    cur.execute(f"SELECT {COLUMNS} FROM speech_recordings r WHERE r.id = ?", (rec_id,))
    out = dict(cur.fetchone())
    conn.close()
    return {"recording": out}


@router.delete("/teacher/recordings/{rec_id}")
def delete_recording(rec_id: int, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    _remove_files(cur, "id = ?", (rec_id,))
    cur.execute("DELETE FROM speech_recordings WHERE id = ?", (rec_id,))
    conn.commit()
    conn.close()
    return {"message": "recording deleted"}


def counts_by_user(course_id=None):
    """user_id → {total, new} for the learning reports."""
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT user_id, COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh FROM speech_recordings"
                + (" WHERE course_id = ?" if course_id else "") + " GROUP BY user_id", (course_id,) if course_id else ())
    out = {r["user_id"]: {"total": r["total"], "new": int(r["fresh"] or 0)} for r in cur.fetchall()}
    conn.close()
    return out
