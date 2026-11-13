"""Courses, class rosters, student accounts and the chip account.

Plans: docs/handoff/2026-11-04-class-roster-learning-data-plan.md (courses, roster import, IDs)
and docs/handoff/2026-11-08-card-game-learning-design.md (chips). Tables live in the platform
database next to `users`; main.py passes its helpers in through configure() so this module
never imports main.py.

Teacher endpoints (teacher/admin token):
  GET  /teacher/courses                      courses with sections, activities and head counts
  POST /teacher/courses                      create or update a course and its sections
  PUT  /teacher/courses/{id}/activities      topics and levels the course has opened
  GET  /teacher/courses/{id}/roster          enrolled students
  POST /teacher/roster/preview               read a CSV / XLSX / pasted list and say what would happen
  POST /teacher/roster/commit                do it; returns the one-time account sheet
  PATCH /teacher/enrollments/{id}            section, status or research group of one student
  POST /teacher/users/{id}/reset-password    new one-time password for one student
  GET  /teacher/chips  ·  POST /teacher/chips/adjust  ·  POST /teacher/chips/{id}/resolve
Student endpoints (own token):
  GET  /me/courses                           own courses and what each has opened
  GET  /me/chips                             chip balance and recent entries
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import secrets
from types import SimpleNamespace

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter(tags=["classroom"])
D = SimpleNamespace()  # helpers from main.py (see configure)

DEFAULT_INSTITUTION = "nptu"
DEFAULT_EMAIL_DOMAIN = os.getenv("ROSTER_EMAIL_DOMAIN", "").strip() or "nptu.edu.tw"
PUBLIC_SITE_URL = (os.getenv("PUBLIC_SITE_URL", "").strip() or "https://www.cathylanguagehub.com").rstrip("/")
MAX_ROSTER_ROWS = 500
GAMES = ("pecha_kucha", "innovation-harbor", "sdg4-stage")
LEVELS = ("A1", "A2", "B1", "B2")
# One-time passwords: 12 characters, none of 0/O, 1/l/I, so they survive being read off a slip of paper.
PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# Chips (2026-11-08 design, "全域個人籌碼"). Changing a rule means a new CHIP_RULE_VERSION;
# entries already written keep the version they were made with and are never recalculated.
CHIP_RULE_VERSION = 2             # 2: SDG 4 stage pays for the words read correctly
CHIP_DAILY_CAP = 60
CHIP_FULL_REWARD_RUNS_PER_DAY = 2   # same topic and level: from the 3rd run of a day only the score pays
CHIP_SPACED_DAYS = 2
SDG4_PAID_RUNS_PER_DAY = 3          # one account earns chips from at most this many SDG 4 talks a day


def configure(**deps):
    D.__dict__.update(deps)
    init_db()


def init_db():
    pk = D.auto_pk_sql()
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS courses (
            id {pk},
            term TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            teacher_id INTEGER REFERENCES users(id),
            active INTEGER DEFAULT 1,
            created_at TEXT,
            UNIQUE(term, code)
        )""")
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS course_sections (
            id {pk},
            course_id INTEGER NOT NULL REFERENCES courses(id),
            label TEXT NOT NULL,
            UNIQUE(course_id, label)
        )""")
    # One enrolment per student and course; the section can change (a student moves class).
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS enrollments (
            id {pk},
            course_id INTEGER NOT NULL REFERENCES courses(id),
            section_id INTEGER NOT NULL REFERENCES course_sections(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'active',
            research_group TEXT,
            source TEXT,
            created_at TEXT,
            updated_at TEXT,
            UNIQUE(course_id, user_id)
        )""")
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS course_activities (
            id {pk},
            course_id INTEGER NOT NULL REFERENCES courses(id),
            game TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            levels TEXT NOT NULL,
            open_from TEXT,
            open_until TEXT,
            UNIQUE(course_id, game, topic_id)
        )""")
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS roster_imports (
            id {pk},
            course_id INTEGER,
            by_user INTEGER,
            filename TEXT,
            at TEXT,
            created INTEGER DEFAULT 0,
            updated INTEGER DEFAULT 0,
            skipped INTEGER DEFAULT 0,
            report_json TEXT
        )""")
    # A ledger, never a balance that is edited: the balance is the sum of the posted entries.
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS chip_ledger (
            id {pk},
            user_id INTEGER NOT NULL REFERENCES users(id),
            delta INTEGER NOT NULL,
            reason TEXT NOT NULL,
            game TEXT,
            run_id INTEGER,
            course_id INTEGER,
            status TEXT NOT NULL DEFAULT 'posted',
            rule_version INTEGER NOT NULL DEFAULT 1,
            idempotency_key TEXT UNIQUE,
            by_user INTEGER,
            note TEXT,
            created_at TEXT NOT NULL
        )""")
    # 系級: the student's own department-and-class, one per student, required by the roster import.
    # Inside a course the group a student sits in (course_sections.label) is this same 系級.
    if "class_name" not in D.table_columns(cur, "users"):
        D.execute_with_retry(cur, "ALTER TABLE users ADD COLUMN class_name TEXT")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_enrollments_section ON enrollments(section_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chip_ledger_user ON chip_ledger(user_id)")
    conn.commit()
    conn.close()


def _now():
    return D.now_taipei().isoformat(timespec="seconds")


def _today():
    return D.now_taipei().date().isoformat()


def _rows(cur):
    return [dict(r) for r in cur.fetchall()]


# ── courses ──
class CourseIn(BaseModel):
    id: int | None = None
    term: str
    code: str
    name: str
    sections: list[str] = []
    active: bool = True


class ActivityIn(BaseModel):
    game: str = "pecha_kucha"
    topic_id: str
    levels: list[str] = []
    open_from: str | None = None
    open_until: str | None = None


class ActivitiesIn(BaseModel):
    activities: list[ActivityIn]


def _course_or_404(cur, course_id):
    cur.execute("SELECT * FROM courses WHERE id = ?", (course_id,))
    course = cur.fetchone()
    if not course:
        raise HTTPException(status_code=404, detail="course not found")
    return dict(course)


def _clean_label(value, fallback="A"):
    return re.sub(r"\s+", " ", str(value or "").strip())[:40] or fallback


def _ensure_section(cur, course_id, label):
    label = _clean_label(label)
    cur.execute("SELECT id FROM course_sections WHERE course_id = ? AND label = ?", (course_id, label))
    row = cur.fetchone()
    if row:
        return row["id"]
    return D.execute_insert_returning(cur, "INSERT INTO course_sections (course_id, label) VALUES (?, ?)", (course_id, label), "id")


def _courses(cur, only_id=None):
    cur.execute("SELECT c.*, u.name AS teacher_name FROM courses c LEFT JOIN users u ON u.id = c.teacher_id"
                + (" WHERE c.id = ?" if only_id else "") + " ORDER BY c.active DESC, c.term DESC, c.code",
                (only_id,) if only_id else ())
    courses = _rows(cur)
    for c in courses:
        cur.execute("""
            SELECT s.id, s.label,
                   COALESCE(SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END), 0) AS students
            FROM course_sections s LEFT JOIN enrollments e ON e.section_id = s.id
            WHERE s.course_id = ? GROUP BY s.id, s.label ORDER BY s.label""", (c["id"],))
        c["sections"] = _rows(cur)
        c["students"] = sum(s["students"] for s in c["sections"])
        cur.execute("SELECT id, game, topic_id, levels, open_from, open_until FROM course_activities WHERE course_id = ? ORDER BY game, topic_id", (c["id"],))
        c["activities"] = [{**a, "levels": [l for l in (a["levels"] or "").split(",") if l]} for a in _rows(cur)]
        c["active"] = bool(c["active"])
    return courses


@router.get("/teacher/courses")
def list_courses(authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    out = _courses(cur)
    conn.close()
    return {"courses": out, "email_domain": DEFAULT_EMAIL_DOMAIN, "games": list(GAMES), "levels": list(LEVELS)}


@router.post("/teacher/courses")
def save_course(data: CourseIn, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    term, code, name = data.term.strip()[:20], data.code.strip()[:40], data.name.strip()[:120]
    if not term or not code or not name:
        raise HTTPException(status_code=400, detail="學期、課號、課程名稱都要填。Term, code and name are required.")
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM courses WHERE term = ? AND code = ?", (term, code))
    clash = cur.fetchone()
    if clash and clash["id"] != data.id:
        conn.close()
        raise HTTPException(status_code=400, detail=f"{term} 學期已經有課號 {code} 的課程。")
    if data.id:
        _course_or_404(cur, data.id)
        cur.execute("UPDATE courses SET term = ?, code = ?, name = ?, active = ? WHERE id = ?", (term, code, name, 1 if data.active else 0, data.id))
        course_id = data.id
    else:
        course_id = D.execute_insert_returning(
            cur, "INSERT INTO courses (term, code, name, teacher_id, active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (term, code, name, teacher["id"], 1 if data.active else 0, _now()), "id")
    for label in data.sections:      # optional; groups are normally made by the roster import, one per 系級
        _ensure_section(cur, course_id, label)
    conn.commit()
    out = _courses(cur, course_id)[0]
    conn.close()
    return {"course": out}


def _course_counts(cur, course_id):
    q = lambda sql: (cur.execute(sql, (course_id,)), cur.fetchone()["c"])[1]
    return {"sections": q("SELECT COUNT(*) AS c FROM course_sections WHERE course_id = ?"),
            "students": q("SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ?"),
            "topics": q("SELECT COUNT(*) AS c FROM course_activities WHERE course_id = ?"),
            "imports": q("SELECT COUNT(*) AS c FROM roster_imports WHERE course_id = ?")}


@router.get("/teacher/courses/{course_id}/delete-preview")
def course_delete_preview(course_id: int, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db(); cur = conn.cursor()
    c = _course_or_404(cur, course_id)
    out = {"course": {"id": c["id"], "term": c["term"], "code": c["code"], "name": c["name"]}, **_course_counts(cur, course_id)}
    conn.close()
    return out


@router.delete("/teacher/courses/{course_id}")
def course_delete(course_id: int, confirm: str = "", authorization: str | None = Header(default=None)):
    """Delete a course: its 系級 groups, enrolments, opened topics and import log. Student accounts, games
    played, recordings and chips stay (they keep the old course number, so they are no longer listed under any course)."""
    D.require_teacher(authorization)
    conn = D.get_db(); cur = conn.cursor()
    c = _course_or_404(cur, course_id)
    if confirm.strip() != c["code"]:
        conn.close()
        raise HTTPException(status_code=400, detail=f"請輸入課號 {c['code']} 確認刪除。")
    counts = _course_counts(cur, course_id)
    for table in ("course_sessions", "course_activities", "enrollments", "course_sections", "roster_imports"):   # course_sessions: backend/course_plan.py
        cur.execute(f"DELETE FROM {table} WHERE course_id = ?", (course_id,))
    cur.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    conn.commit(); conn.close()
    return {"deleted": {"id": course_id, "code": c["code"], "name": c["name"]}, **counts}


@router.put("/teacher/courses/{course_id}/activities")
def save_activities(course_id: int, data: ActivitiesIn, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    seen, clean = set(), []
    for a in data.activities:
        game, topic = a.game.strip(), a.topic_id.strip()[:20]
        levels = [l for l in LEVELS if l in {x.strip().upper() for x in a.levels}]
        if game not in GAMES:
            raise HTTPException(status_code=400, detail=f"unknown game: {game}")
        if not re.fullmatch(r"\d+-\d+", topic):
            raise HTTPException(status_code=400, detail=f"主題代碼要像 9-2：{topic}")
        if not levels:
            raise HTTPException(status_code=400, detail=f"{topic}：至少選一個難度。")
        if (game, topic) in seen:
            raise HTTPException(status_code=400, detail=f"{topic} 重複了。")
        seen.add((game, topic))
        clean.append((course_id, game, topic, ",".join(levels), (a.open_from or "").strip()[:25] or None, (a.open_until or "").strip()[:25] or None))
    conn = D.get_db()
    cur = conn.cursor()
    _course_or_404(cur, course_id)
    cur.execute("DELETE FROM course_activities WHERE course_id = ?", (course_id,))
    for row in clean:
        cur.execute("INSERT INTO course_activities (course_id, game, topic_id, levels, open_from, open_until) VALUES (?, ?, ?, ?, ?, ?)", row)
    conn.commit()
    out = _courses(cur, course_id)[0]
    conn.close()
    return {"course": out}


@router.get("/teacher/courses/{course_id}/roster")
def course_roster(course_id: int, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    course = _course_or_404(cur, course_id)
    cur.execute("""
        SELECT e.id AS enrollment_id, e.status, e.research_group, e.source, e.created_at AS enrolled_at,
               s.id AS section_id, s.label AS section,
               u.id AS user_id, u.name, u.email, u.student_no, u.public_id, u.must_change_password, u.account_source, u.class_name,
               u.role, u.test_account
        FROM enrollments e JOIN users u ON u.id = e.user_id JOIN course_sections s ON s.id = e.section_id
        WHERE e.course_id = ? ORDER BY e.status, s.label, u.student_no, u.name""", (course_id,))
    students = _rows(cur)
    conn.close()
    for s in students:
        s["must_change_password"] = bool(s["must_change_password"])
        s["test"] = is_test_person(s)
        s["test_fixed"] = s["role"] in TEST_ROLES      # a teacher's own account is always a test account
    return {"course": {"id": course["id"], "term": course["term"], "code": course["code"], "name": course["name"]}, "students": students}


class EnrollmentPatch(BaseModel):
    status: str | None = None
    research_group: str | None = None
    section: str | None = None


@router.patch("/teacher/enrollments/{enrollment_id}")
def patch_enrollment(enrollment_id: int, data: EnrollmentPatch, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM enrollments WHERE id = ?", (enrollment_id,))
    e = cur.fetchone()
    if not e:
        conn.close()
        raise HTTPException(status_code=404, detail="enrollment not found")
    if data.status is not None:
        if data.status not in ("active", "dropped"):
            conn.close()
            raise HTTPException(status_code=400, detail="status must be active or dropped")
        cur.execute("UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?", (data.status, _now(), enrollment_id))
    if data.research_group is not None:
        cur.execute("UPDATE enrollments SET research_group = ?, updated_at = ? WHERE id = ?", (data.research_group.strip()[:40] or None, _now(), enrollment_id))
    if data.section is not None:
        cur.execute("UPDATE enrollments SET section_id = ?, updated_at = ? WHERE id = ?", (_ensure_section(cur, e["course_id"], data.section), _now(), enrollment_id))
    conn.commit()
    conn.close()
    return {"message": "enrollment updated"}


# ── which course does a play belong to ──
def resolve_course(cur, user_id, requested_course_id=None):
    """(course_id, section_id) for a student's play, decided here and never taken from the browser:
    the course asked for when the student is really in it, else the only course the student has,
    else nothing (several courses and none chosen, a self-registered account, or a guest)."""
    if not user_id:
        return None, None
    cur.execute("""
        SELECT e.course_id, e.section_id FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = ? AND e.status = 'active' AND c.active = 1 ORDER BY e.id""", (user_id,))
    rows = cur.fetchall()
    if requested_course_id is not None:
        for r in rows:
            if r["course_id"] == requested_course_id:
                return r["course_id"], r["section_id"]
    if len(rows) == 1:
        return rows[0]["course_id"], rows[0]["section_id"]
    return None, None


def resolve_course_for_user(user_id, requested_course_id=None):
    conn = D.get_db()
    try:
        return resolve_course(conn.cursor(), user_id, requested_course_id)
    finally:
        conn.close()


TEST_ROLES = ("teacher", "admin")


def is_test_person(row):
    """A play by this account is test data: the teacher's and the admin's own accounts, and any
    account the teacher marked as a test account (an assistant, a demo login). The data is kept and
    shown on the person's own page, but never counted in a class number, a card difficulty or an export
    meant for analysis (2026-11-09 meeting, T5)."""
    return (row.get("role") in TEST_ROLES) or bool(row.get("test_account"))


def people_for_report(course_id=None, section_id=None):
    """user_id → who they are, for the learning reports (the learning database holds no names).
    With a course: its enrolled students. Without: every account. `test` says whose plays are test data."""
    conn = D.get_db()
    cur = conn.cursor()
    if course_id:
        cur.execute("""
            SELECT u.id AS user_id, u.name, u.student_no, u.public_id, s.label AS section, e.status, e.research_group, u.role, u.test_account
            FROM enrollments e JOIN users u ON u.id = e.user_id JOIN course_sections s ON s.id = e.section_id
            WHERE e.course_id = ?""" + (" AND e.section_id = ?" if section_id else ""),
            (course_id, section_id) if section_id else (course_id,))
    else:
        cur.execute("SELECT id AS user_id, name, student_no, public_id, class_name AS section, NULL AS status, NULL AS research_group, role, test_account FROM users")
    out = {}
    for r in cur.fetchall():
        d = dict(r)
        d["test"] = is_test_person(d)
        out[d["user_id"]] = d
    conn.close()
    return out


def test_user_ids():
    """The accounts whose plays are test data (see is_test_person)."""
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE role IN (?, ?) OR test_account = 1", TEST_ROLES)
    ids = {r["id"] for r in cur.fetchall()}
    conn.close()
    return ids


class TestAccountIn(BaseModel):
    test: bool


@router.patch("/teacher/users/{user_id}/test-account")
def set_test_account(user_id: int, data: TestAccountIn, authorization: str | None = Header(default=None)):
    """Mark an account as a test account (or unmark it). Teacher and admin accounts are always test
    accounts, so the mark is only remembered for the others."""
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, role FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="user not found")
    if user["role"] in TEST_ROLES and not data.test:
        conn.close()
        raise HTTPException(status_code=400, detail="老師和管理員的帳號一定是測試帳號，不能取消。")
    cur.execute("UPDATE users SET test_account = ? WHERE id = ?", (1 if data.test else 0, user_id))
    conn.commit()
    conn.close()
    return {"user_id": user_id, "test": data.test or user["role"] in TEST_ROLES, "test_fixed": user["role"] in TEST_ROLES}


def forget_user(cur, user_id):
    """Called before an account is deleted (rows here point at users.id)."""
    cur.execute("DELETE FROM enrollments WHERE user_id = ?", (user_id,))
    cur.execute("DELETE FROM chip_ledger WHERE user_id = ?", (user_id,))
    cur.execute("UPDATE courses SET teacher_id = NULL WHERE teacher_id = ?", (user_id,))   # a deleted teacher's courses stay


@router.get("/me/courses")
def my_courses(authorization: str | None = Header(default=None)):
    user = D.get_current_user(authorization)
    now = _now()
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT c.id AS course_id, c.term, c.code, c.name, s.id AS section_id, s.label AS section
        FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN course_sections s ON s.id = e.section_id
        WHERE e.user_id = ? AND e.status = 'active' AND c.active = 1 ORDER BY c.term DESC, c.code""", (user["id"],))
    courses = _rows(cur)
    for c in courses:
        cur.execute("SELECT game, topic_id, levels, open_from, open_until FROM course_activities WHERE course_id = ? ORDER BY game, topic_id", (c["course_id"],))
        c["activities"] = [
            {"game": a["game"], "topic_id": a["topic_id"], "levels": [l for l in (a["levels"] or "").split(",") if l],
             "open": (not a["open_from"] or a["open_from"] <= now) and (not a["open_until"] or now <= a["open_until"]),
             "open_from": a["open_from"], "open_until": a["open_until"]}
            for a in _rows(cur)]
    conn.close()
    return {"courses": courses}


# ── roster import ──
HEADER_ALIASES = {
    "section": ("系級", "系級班別", "班級", "班別", "系班", "系所", "科系", "班", "section", "class", "department"),
    "student_no": ("學號", "student no", "student_no", "student id", "studentid", "student number", "id", "學生學號"),
    "name": ("姓名", "名字", "學生姓名", "name", "student name", "full name"),
    "email": ("email", "e-mail", "信箱", "電子郵件", "電子信箱", "學校信箱", "mail"),
    "course": ("課程", "課程名稱", "課號", "course"),
}
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
STUDENT_NO_RE = re.compile(r"^[A-Z0-9]{4,15}$")


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():  # Excel turns a numeric student number into 41012345.0
        value = int(value)
    return str(value).replace("　", " ").strip()


def _table_from_upload(file_bytes, filename, text):
    """Rows of cells from an .xlsx / .csv upload or from text pasted out of Google Sheets."""
    name = (filename or "").lower()
    if file_bytes and (name.endswith(".xlsx") or file_bytes[:2] == b"PK"):
        sheets = D.load_xlsx_rows(file_bytes)
        for _, rows in sheets:  # first sheet that has anything in it
            table = [[_cell(c) for c in (row or [])] for row in rows]
            table = [r for r in table if any(r)]
            if table:
                return table
        return []
    if file_bytes:
        for encoding in ("utf-8-sig", "cp950"):
            try:
                text = file_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(status_code=400, detail="讀不出這個檔案的文字編碼，請另存成 UTF-8 的 CSV 或 XLSX。")
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip():
        return []
    first = next((l for l in text.split("\n") if l.strip()), "")
    delimiter = "\t" if first.count("\t") >= max(first.count(","), 1) else ("," if "," in first else ("\t" if "\t" in first else ","))
    table = [[_cell(c) for c in row] for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
    return [r for r in table if any(r)]


def _map_columns(table):
    """Find which column is what, from a header row; without one, from what the cells look like."""
    if not table:
        return {}, 0
    head = [re.sub(r"\s+", " ", c).strip().lower() for c in table[0]]
    cols = {}
    for key, names in HEADER_ALIASES.items():
        for i, h in enumerate(head):
            if h in names or any(h.startswith(n) and len(h) <= len(n) + 6 for n in names if len(n) >= 2):
                cols.setdefault(key, i)
    if "student_no" in cols or "email" in cols or "name" in cols:
        return cols, 1
    # No header row: 系級 and 姓名 are both plain text, so guessing would file students under the wrong
    # 系級 or use the 系級 as their name. Ask for the header instead.
    raise HTTPException(status_code=400, detail="第一列不是欄位名稱。請在第一列放欄位名稱：系級、學號、姓名、email（email 可以不填）。")
    sample = table[:20]
    width = max(len(r) for r in sample)
    def share(i, test):
        vals = [r[i] for r in sample if i < len(r) and r[i]]
        return sum(1 for v in vals if test(v)) / len(vals) if vals else 0
    for i in range(width):
        if "email" not in cols and share(i, lambda v: bool(EMAIL_RE.match(v))) >= 0.8:
            cols["email"] = i
        elif "student_no" not in cols and share(i, lambda v: bool(re.fullmatch(r"[A-Za-z]{0,3}\d{5,12}", v))) >= 0.8:
            cols["student_no"] = i
    for i in range(width):
        if i not in cols.values() and "name" not in cols and share(i, lambda v: not re.search(r"\d", v) and len(v) <= 40) >= 0.8:
            cols["name"] = i
    return cols, 0


def parse_roster(file_bytes=None, filename="", text=""):
    table = _table_from_upload(file_bytes, filename, text)
    cols, start = _map_columns(table)
    if "student_no" not in cols and "email" not in cols:
        raise HTTPException(status_code=400, detail="找不到「學號」或「email」欄。請在第一列放欄位名稱：系級、學號、姓名、email。")
    rows = []
    for n, r in enumerate(table[start:], start=start + 1):
        get = lambda key: (r[cols[key]] if key in cols and cols[key] < len(r) else "")
        rows.append({"line": n, "section": get("section"), "student_no": get("student_no"), "name": get("name"), "email": get("email")})
    if len(rows) > MAX_ROSTER_ROWS:
        raise HTTPException(status_code=400, detail=f"一次最多 {MAX_ROSTER_ROWS} 列（這份有 {len(rows)} 列）。")
    return rows, sorted(cols)


def _same_name(a, b):
    squash = lambda s: re.sub(r"\s+", "", str(s or "")).lower()
    return squash(a) == squash(b)


def plan_roster(cur, course_id, rows, default_section="", email_domain=None):
    """Decide, row by row, what an import would do. Used by both preview and commit, so what the
    teacher confirmed is what happens. Nothing is written here."""
    domain = (email_domain or DEFAULT_EMAIL_DOMAIN).strip().lstrip("@").lower()
    cur.execute("SELECT e.id, e.user_id, e.section_id, e.status, s.label FROM enrollments e JOIN course_sections s ON s.id = e.section_id WHERE e.course_id = ?", (course_id,))
    enrolled = {e["user_id"]: dict(e) for e in cur.fetchall()}
    plan, seen_no, seen_email, in_file = [], {}, {}, set()
    for raw in rows:
        line = raw.get("line")
        student_no = re.sub(r"[\s\-]", "", str(raw.get("student_no") or "")).upper()
        name = re.sub(r"\s+", " ", str(raw.get("name") or "")).strip()[:80]
        email = str(raw.get("email") or "").strip().lower()
        # 系級 written on this row; when blank, the one already on the student's account is kept (decided below)
        given = _clean_label(raw.get("section"), "") or _clean_label(default_section, "")
        section = given
        item = {"line": line, "section": section, "student_no": student_no, "name": name, "email": email,
                "action": "", "notes": [], "user_id": None, "force": bool(raw.get("force"))}
        plan.append(item)

        def stop(action, note):
            item["action"] = action
            item["notes"].append(note)

        # Whoever this row is about is "in the file" even if the row has a mistake further on:
        # a typo must never make a student look missing (and get marked as dropped).
        if student_no:
            cur.execute("SELECT id FROM users WHERE institution = ? AND student_no = ?", (DEFAULT_INSTITUTION, student_no))
            known = cur.fetchone()
            if known:
                in_file.add(known["id"]); item["identified"] = True
        if email:
            cur.execute("SELECT id FROM users WHERE email = ?", (email,))
            known = cur.fetchone()
            if known:
                in_file.add(known["id"]); item["identified"] = True

        if not student_no and not email:
            stop("error", "沒有學號也沒有 email"); continue
        if student_no and not STUDENT_NO_RE.match(student_no):
            stop("error", f"學號格式不對（{student_no}）：只能是 4–15 個英文字母或數字"); continue
        if not email:
            if not student_no:
                stop("error", "沒有 email，也沒有學號可以產生 email"); continue
            email = item["email"] = f"{student_no.lower()}@{domain}"
            item["notes"].append("email 由學號產生")
        if not EMAIL_RE.match(email):
            stop("error", f"email 格式不對（{email}）"); continue
        if student_no and student_no in seen_no:
            stop("error", f"學號和第 {seen_no[student_no]} 列重複"); continue
        if email in seen_email:
            stop("error", f"email 和第 {seen_email[email]} 列重複"); continue
        if student_no:
            seen_no[student_no] = line
        seen_email[email] = line

        by_no = None
        if student_no:
            cur.execute("SELECT id, name, email, role, student_no, class_name FROM users WHERE institution = ? AND student_no = ?", (DEFAULT_INSTITUTION, student_no))
            by_no = cur.fetchone()
        cur.execute("SELECT id, name, email, role, student_no, class_name FROM users WHERE email = ?", (email,))
        by_email = cur.fetchone()
        if by_no and by_email and by_no["id"] != by_email["id"]:
            stop("conflict", f"學號 {student_no} 和 email {email} 分別屬於兩個不同的帳號（{by_no['name']}／{by_email['name']}）"); continue
        user = by_no or by_email
        if not user:
            if not name:
                stop("error", "新帳號需要姓名"); continue
            if not section:
                stop("error", "沒有系級（每位學生都要有一個系級）"); continue
            item["action"] = "new"
            item["notes"].append("建立帳號並加入課程")
            continue
        item["user_id"] = user["id"]
        in_file.add(user["id"])
        if user["role"] in ("teacher", "admin"):
            stop("conflict", f"{email} 是老師／管理員帳號，不會當成學生匯入"); continue
        if not by_no and user["student_no"] and student_no and user["student_no"] != student_no:
            stop("conflict", f"{email} 這個帳號已經綁定另一個學號 {user['student_no']}"); continue
        changes = []
        had = _clean_label(user["class_name"], "")
        section = item["section"] = given or had
        if not section:
            stop("error", "沒有系級（每位學生都要有一個系級）"); continue
        if had and given and had != given:
            changes.append(f"系級由「{had}」改為「{given}」")      # one 系級 per student: the roster replaces the old one
        elif not had:
            changes.append("補上系級")
        if name and not _same_name(name, user["name"]):
            if not item["force"]:
                stop("conflict", f"姓名和系統裡的不同：名單「{name}」，系統「{user['name']}」。確認是同一人就勾「以名單為準」。"); continue
            changes.append(f"姓名改為「{name}」")
        if student_no and not user["student_no"]:
            changes.append("補上學號")
        if by_no and user["email"] != email:
            item["notes"].append(f"登入帳號維持原本的 {user['email']}（名單上是 {email}）")
            item["email"] = user["email"]
        item["changes"] = changes
        e = enrolled.get(user["id"])
        if not e:
            item["action"] = "enroll"; item["notes"].append("已有帳號，加入課程")
        elif e["status"] != "active":
            item["action"] = "reactivate"; item["notes"].append("之前標為退選，恢復修課")
        elif e["label"] != section:
            item["action"] = "move"
        elif changes:
            item["action"] = "update"
        else:
            item["action"] = "same"; item["notes"].append("沒有變動")
        item["notes"].extend(changes)
    missing = []
    if enrolled:
        ids = [uid for uid, e in enrolled.items() if e["status"] == "active" and uid not in in_file]
        for uid in ids:
            cur.execute("SELECT id, name, student_no, email FROM users WHERE id = ?", (uid,))
            u = cur.fetchone()
            if u:
                missing.append({"user_id": uid, "name": u["name"], "student_no": u["student_no"], "email": u["email"], "section": enrolled[uid]["label"]})
    counts = {}
    for item in plan:
        counts[item["action"]] = counts.get(item["action"], 0) + 1
    return plan, missing, counts


def make_password():
    while True:
        pw = "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(12))
        if re.search(r"[A-Za-z]", pw) and re.search(r"\d", pw):
            return pw


@router.post("/teacher/roster/preview")
async def roster_preview(course_id: int = Form(...), default_section: str = Form(""), email_domain: str = Form(""),
                         text: str = Form(""), file: UploadFile | None = File(default=None),
                         authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    file_bytes = await file.read() if file is not None else None
    if file_bytes and len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="檔案超過 5 MB。")
    rows, columns = parse_roster(file_bytes, file.filename if file is not None else "", text)
    if not rows:
        raise HTTPException(status_code=400, detail="名單是空的。")
    conn = D.get_db()
    cur = conn.cursor()
    _course_or_404(cur, course_id)
    plan, missing, counts = plan_roster(cur, course_id, rows, default_section, email_domain)
    conn.close()
    return {"rows": plan, "missing": missing, "counts": counts, "columns": columns,
            "filename": file.filename if file is not None else "", "email_domain": (email_domain or DEFAULT_EMAIL_DOMAIN)}


class RosterRowIn(BaseModel):
    line: int | None = None
    section: str | None = None
    student_no: str | None = None
    name: str | None = None
    email: str | None = None
    force: bool = False


class RosterCommitIn(BaseModel):
    course_id: int
    rows: list[RosterRowIn]
    default_section: str = ""
    email_domain: str | None = None
    mark_missing_dropped: bool = False
    send_email: bool = False
    filename: str | None = None


def _account_email(name, email, password, course_name):
    return (
        f"{name} 同學你好：\n\n"
        f"老師已經幫你在 CardLearn SDGs 建立帳號（課程：{course_name}）。\n\n"
        f"登入網址：{PUBLIC_SITE_URL}\n帳號：{email}\n初始密碼：{password}\n\n"
        "第一次登入時，系統會請你換成自己的密碼。這封信請不要轉寄給別人。\n\n"
        "------\n"
        f"Hello {name},\n\n"
        f"Your teacher has created a CardLearn SDGs account for you (course: {course_name}).\n\n"
        f"Sign in: {PUBLIC_SITE_URL}\nAccount: {email}\nFirst password: {password}\n\n"
        "You will be asked to choose your own password the first time you sign in.\n\nCardLearn SDGs"
    )


@router.post("/teacher/roster/commit")
def roster_commit(data: RosterCommitIn, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    if not data.rows or len(data.rows) > MAX_ROSTER_ROWS:
        raise HTTPException(status_code=400, detail=f"1–{MAX_ROSTER_ROWS} 列。")
    source = f"import:{_today()}"
    conn = D.get_db()
    cur = conn.cursor()
    sheet, done = [], {"new": 0, "enroll": 0, "reactivate": 0, "move": 0, "update": 0, "same": 0, "conflict": 0, "error": 0, "dropped": 0}
    try:
        course = _course_or_404(cur, data.course_id)
        # Decided again from the database as it is now; the preview the browser holds is only a picture.
        plan, missing, _ = plan_roster(cur, data.course_id, [r.model_dump() for r in data.rows], data.default_section, data.email_domain)
        for item in plan:
            action = item["action"]
            done[action] = done.get(action, 0) + 1
            if action in ("error", "conflict", "same"):
                continue
            section_id = _ensure_section(cur, data.course_id, item["section"])
            if action == "new":
                password = make_password()
                item["user_id"] = D.execute_insert_returning(cur, """
                    INSERT INTO users (name, gender, birth_date, email, password_hash, email_verified, privacy_agreed, role,
                                       student_no, institution, public_id, must_change_password, account_source, class_name)
                    VALUES (?, NULL, NULL, ?, ?, 1, 1, 'student', ?, ?, ?, 1, 'import', ?)""",
                    (item["name"], item["email"], D.hash_password(password), item["student_no"] or None, DEFAULT_INSTITUTION, D.new_public_id(cur), item["section"]), "id")
                sheet.append({"section": item["section"], "student_no": item["student_no"], "name": item["name"], "email": item["email"], "password": password})
            else:
                if item["force"] and item["name"]:
                    cur.execute("UPDATE users SET name = ? WHERE id = ?", (item["name"], item["user_id"]))
                if item["student_no"]:
                    cur.execute("UPDATE users SET student_no = ?, institution = ? WHERE id = ? AND student_no IS NULL", (item["student_no"], DEFAULT_INSTITUTION, item["user_id"]))
                cur.execute("UPDATE users SET class_name = ? WHERE id = ?", (item["section"], item["user_id"]))
            cur.execute("SELECT id FROM enrollments WHERE course_id = ? AND user_id = ?", (data.course_id, item["user_id"]))
            existing = cur.fetchone()
            if existing:
                cur.execute("UPDATE enrollments SET section_id = ?, status = 'active', source = ?, updated_at = ? WHERE id = ?", (section_id, source, _now(), existing["id"]))
            else:
                cur.execute("INSERT INTO enrollments (course_id, section_id, user_id, status, source, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)",
                            (data.course_id, section_id, item["user_id"], source, _now(), _now()))
        # A row in error that matches no account could be anyone: we cannot be sure who is really missing, so nobody is dropped this time.
        unsure = any(item["action"] == "error" and not item.get("identified") for item in plan)
        drop_skipped = bool(data.mark_missing_dropped and unsure and missing)
        if data.mark_missing_dropped and not unsure:
            for m in missing:
                cur.execute("UPDATE enrollments SET status = 'dropped', updated_at = ? WHERE course_id = ? AND user_id = ?", (_now(), data.course_id, m["user_id"]))
                done["dropped"] += 1
        report = {"counts": done, "rows": [{k: item[k] for k in ("line", "section", "student_no", "name", "email", "action", "notes")} for item in plan],
                  "dropped": missing if data.mark_missing_dropped and not unsure else [], "drop_skipped": drop_skipped}
        updated = done["enroll"] + done["reactivate"] + done["move"] + done["update"] + done["dropped"]
        import_id = D.execute_insert_returning(cur, """
            INSERT INTO roster_imports (course_id, by_user, filename, at, created, updated, skipped, report_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.course_id, teacher["id"], (data.filename or "")[:200], _now(), done["new"], updated, done["error"] + done["conflict"],
             json.dumps(report, ensure_ascii=False)), "id")
        conn.commit()
    except Exception:
        conn.close()  # nothing is kept from a half-finished import
        raise
    conn.close()

    emails = {"requested": bool(data.send_email), "sent": 0, "failed": []}
    if data.send_email:
        for row in sheet:
            try:
                D.send_email(row["email"], "CardLearn SDGs 帳號 / Your CardLearn SDGs account", _account_email(row["name"], row["email"], row["password"], course["name"]))
                emails["sent"] += 1
            except HTTPException as error:
                emails["failed"].append({"email": row["email"], "student_no": row["student_no"], "name": row["name"], "reason": str(error.detail)})
    return {"import_id": import_id, "counts": done, "rows": report["rows"], "dropped": report["dropped"],
            # Shown once: the passwords are stored only as hashes, so this list cannot be fetched again.
            "account_sheet": sheet, "emails": emails}


@router.post("/teacher/users/{user_id}/reset-password")
def reset_password(user_id: int, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, role, student_no FROM users WHERE id = ?", (user_id,))
    target = cur.fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="user not found")
    if target["role"] != "student" and teacher.get("role") != "admin":
        conn.close()
        raise HTTPException(status_code=403, detail="只有管理員可以重設老師或管理員的密碼。")
    if target["id"] == teacher["id"]:
        conn.close()
        raise HTTPException(status_code=400, detail="自己的密碼請從「更改密碼」頁面改。")
    password = make_password()
    cur.execute("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", (D.hash_password(password), user_id))
    conn.commit()
    conn.close()
    return {"user_id": user_id, "name": target["name"], "email": target["email"], "student_no": target["student_no"], "password": password}


# ── chips ──
def _balance(cur, user_id):
    cur.execute("SELECT COALESCE(SUM(delta), 0) AS c FROM chip_ledger WHERE user_id = ? AND status = 'posted'", (user_id,))
    return int(cur.fetchone()["c"])


def _earned_today(cur, user_id):
    """Chips earned by playing today (posted or waiting for the teacher); teacher adjustments are not play."""
    cur.execute("""
        SELECT COALESCE(SUM(delta), 0) AS c FROM chip_ledger
        WHERE user_id = ? AND delta > 0 AND status IN ('posted', 'held') AND reason NOT LIKE ? AND created_at >= ?""",
        (user_id, "teacher.%", _today()))      # the pattern is a value: a % written inside the SQL breaks on PostgreSQL
    return int(cur.fetchone()["c"])


def chips_for_run(run, score, context):
    """The chips one finished run is worth, before the daily cap: a list of (reason, chips).
    Pure, so the rules can be tested without a database."""
    game, metrics, stars = run.get("game"), run.get("metrics") or {}, run.get("stars") or {}
    out = []
    if game == "pecha_kucha":
        if metrics.get("embed"):
            return []  # a station inside the 3D game: that run's stars pay, not this one
        if score and score.get("score") is not None:
            out.append(("pk.score", min(10, int(score["score"] / 10 + 0.5))))  # half rounds up
        full = context.get("finished_today_same", 0) < CHIP_FULL_REWARD_RUNS_PER_DAY
        wrap = (score or {}).get("wrap") or {}
        if full and score and score.get("complete") and wrap.get("done"):
            out.append(("pk.finish", 5))          # the whole run, wrap-up included
        if full and wrap.get("remedy_ok"):
            out.append(("pk.remedy", 3))          # every missed sentence matched again
        if full and wrap.get("quiz_correct"):
            out.append(("pk.quiz", min(5, int(wrap["quiz_correct"]))))
        if full and wrap.get("read_done"):
            out.append(("pk.read", 3))            # read aloud on the device; uploading is never rewarded
        if full and wrap.get("reflect_done"):
            out.append(("pk.reflect", 2))
        if full and context.get("days_since_previous") is not None and context["days_since_previous"] >= CHIP_SPACED_DAYS:
            out.append(("spaced.return", 5))
    elif game == "innovation-harbor":
        # The stars come from the browser: at most 3 per stage and 12 stages, whatever was sent.
        vals = [min(3, max(0, int(v))) for v in list(stars.values())[:12] if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) < 1e6]
        n = sum(vals)
        if n:
            out.append(("harbor.stars", n))
    elif game == "sdg4-stage":
        # Paid on what the server worked out from the events (learning.sdg4_score), not on what the browser says.
        s = score or {}
        if not s.get("complete"):
            return []
        if metrics.get("mode") == "formal":
            out.append(("sdg4.formal", 5))                       # the real 20-second talk, finished
        if s.get("accuracy") is not None:
            out.append(("sdg4.read", int(s["accuracy"] * 10 + 0.5)))   # one chip per 10% of the words read correctly
    return [(reason, chips) for reason, chips in out if chips > 0]


def award_for_run(run, score, context):
    """Write the chip entries for a finished run (called by backend/learning.py). Safe to call
    again for the same run: each entry has a key and is written once."""
    user_id = run.get("user_id")
    if not user_id:
        return None
    conn = D.get_db()
    cur = conn.cursor()
    m = run.get("metrics") or {}
    if m.get("test") or (isinstance(m.get("parts"), list) and m.get("parts") and not m.get("embed")) or user_id in test_user_ids():
        # A quick test, a partial play or a test account: no chips, and the wrap-up says so.
        out = {"items": [], "earned": 0, "held": False, "capped": False, "test": True,
               "balance": _balance(cur, user_id), "today": _earned_today(cur, user_id), "daily_cap": CHIP_DAILY_CAP}
        conn.close()
        return out
    wanted = chips_for_run(run, score, context)
    run_limit = None
    if run.get("game") == "sdg4-stage":
        # At most SDG4_PAID_RUNS_PER_DAY talks a day pay chips. Counted from the ledger (held ones too, voided ones not),
        # leaving out this run, so asking again for the same run gives the same answer.
        cur.execute("""
            SELECT COUNT(DISTINCT run_id) AS n FROM chip_ledger
            WHERE user_id = ? AND game = ? AND run_id <> ? AND status IN ('posted', 'held') AND created_at >= ?""",
            (user_id, "sdg4-stage", run["id"], _today()))
        used = int(cur.fetchone()["n"])
        run_limit = {"limit": SDG4_PAID_RUNS_PER_DAY, "used": used}
        if used >= SDG4_PAID_RUNS_PER_DAY:
            wanted = []
    held = bool(score and score.get("held"))
    items, room = [], max(0, CHIP_DAILY_CAP - _earned_today(cur, user_id))
    for reason, chips in wanted:
        key = f"run:{run['id']}:{reason}"
        cur.execute("SELECT delta, status FROM chip_ledger WHERE idempotency_key = ?", (key,))
        old = cur.fetchone()
        if old:
            items.append({"reason": reason, "chips": old["delta"], "status": old["status"]})
            continue
        give = min(chips, room)
        if give <= 0:
            items.append({"reason": reason, "chips": 0, "status": "capped"})
            continue
        room -= give
        status = "held" if held else "posted"
        cur.execute("""
            INSERT INTO chip_ledger (user_id, delta, reason, game, run_id, course_id, status, rule_version, idempotency_key, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING""",
            (user_id, give, reason, run.get("game"), run["id"], run.get("course_id"), status, CHIP_RULE_VERSION, key, _now()))
        items.append({"reason": reason, "chips": give, "status": status})
    conn.commit()
    out = {"items": items, "earned": sum(i["chips"] for i in items if i["status"] in ("posted", "held")),
           "held": held and any(i["status"] == "held" for i in items),
           "capped": any(i["status"] == "capped" for i in items) or any(i["chips"] < c for i, (_, c) in zip(items, wanted)),
           "balance": _balance(cur, user_id), "today": _earned_today(cur, user_id), "daily_cap": CHIP_DAILY_CAP, "run_limit": run_limit}
    conn.close()
    return out


@router.get("/me/chips")
def my_chips(authorization: str | None = Header(default=None)):
    user = D.get_current_user(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT COALESCE(SUM(delta), 0) AS c FROM chip_ledger WHERE user_id = ? AND status = 'held'", (user["id"],))
    held = int(cur.fetchone()["c"])
    cur.execute("SELECT delta, reason, game, run_id, status, note, created_at FROM chip_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30", (user["id"],))
    recent = _rows(cur)
    out = {"balance": _balance(cur, user["id"]), "held": held, "today": _earned_today(cur, user["id"]), "daily_cap": CHIP_DAILY_CAP, "recent": recent}
    conn.close()
    return out


class ChipAdjustIn(BaseModel):
    user_id: int
    delta: int
    note: str


class ChipResolveIn(BaseModel):
    action: str  # post | void
    note: str | None = None


@router.get("/teacher/chips")
def teacher_chips(course_id: int | None = None, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    # Chips are one global balance per student. With a course chosen, the list is that course's
    # students (active enrolments) with all their chips, wherever they were earned.
    where, params = ("WHERE l.user_id IN (SELECT user_id FROM enrollments WHERE course_id = ? AND status = 'active')", (course_id,)) if course_id else ("", ())
    cur.execute(f"""
        SELECT l.id, l.user_id, u.name, u.student_no, u.public_id, u.class_name, l.delta, l.reason, l.game, l.run_id, l.course_id, l.status, l.note, l.created_at
        FROM chip_ledger l JOIN users u ON u.id = l.user_id {where} {'AND' if where else 'WHERE'} l.status = 'held' ORDER BY l.id DESC""", params)
    held = _rows(cur)
    cur.execute(f"""
        SELECT l.user_id, u.name, u.student_no, u.public_id, u.class_name,
               COALESCE(SUM(CASE WHEN l.status = 'posted' THEN l.delta ELSE 0 END), 0) AS balance,
               COALESCE(SUM(CASE WHEN l.status = 'held' THEN l.delta ELSE 0 END), 0) AS held
        FROM chip_ledger l JOIN users u ON u.id = l.user_id {where}
        GROUP BY l.user_id, u.name, u.student_no, u.public_id, u.class_name ORDER BY u.student_no, u.name""", params)
    students = _rows(cur)
    if course_id:      # students of the course who have no chips yet are listed too
        have = {s["user_id"] for s in students}
        cur.execute("""
            SELECT u.id AS user_id, u.name, u.student_no, u.public_id, u.class_name FROM enrollments e JOIN users u ON u.id = e.user_id
            WHERE e.course_id = ? AND e.status = 'active' ORDER BY u.student_no, u.name""", (course_id,))
        students += [{**r, "balance": 0, "held": 0} for r in _rows(cur) if r["user_id"] not in have]
    conn.close()
    return {"held": held, "students": students, "class_total": sum(s["balance"] for s in students), "daily_cap": CHIP_DAILY_CAP}


@router.post("/teacher/chips/adjust")
def adjust_chips(data: ChipAdjustIn, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    if not data.delta or abs(data.delta) > 1000:
        raise HTTPException(status_code=400, detail="加減的數量要在 1–1000 之間。")
    if not data.note.strip():
        raise HTTPException(status_code=400, detail="請填理由。")
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE id = ?", (data.user_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="user not found")
    cur.execute("""
        INSERT INTO chip_ledger (user_id, delta, reason, status, rule_version, by_user, note, created_at)
        VALUES (?, ?, ?, 'posted', ?, ?, ?, ?)""",
        (data.user_id, data.delta, "teacher.grant" if data.delta > 0 else "teacher.deduct", CHIP_RULE_VERSION, teacher["id"], data.note.strip()[:300], _now()))
    conn.commit()
    balance = _balance(cur, data.user_id)
    conn.close()
    return {"balance": balance}


@router.post("/teacher/chips/{entry_id}/resolve")
def resolve_chips(entry_id: int, data: ChipResolveIn, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    if data.action not in ("post", "void"):
        raise HTTPException(status_code=400, detail="action must be post or void")
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, user_id, status FROM chip_ledger WHERE id = ?", (entry_id,))
    entry = cur.fetchone()
    if not entry:
        conn.close()
        raise HTTPException(status_code=404, detail="entry not found")
    if entry["status"] != "held":
        conn.close()
        raise HTTPException(status_code=400, detail="這筆不是「待確認」。")
    cur.execute("UPDATE chip_ledger SET status = ?, by_user = ?, note = ? WHERE id = ?",
                ("posted" if data.action == "post" else "void", teacher["id"], (data.note or "").strip()[:300] or None, entry_id))
    conn.commit()
    balance = _balance(cur, entry["user_id"])
    conn.close()
    return {"status": "posted" if data.action == "post" else "void", "balance": balance}


def profile_for_report(user_id):
    """Who a student is, for the teacher's drill-down: account, class, courses, sign-ins, chips, recordings."""
    conn = D.get_db()
    cur = conn.cursor()
    def one(sql, args=()):
        try:
            cur.execute(sql, args); r = cur.fetchone(); return dict(r) if r else {}
        except Exception:
            return {}
    def many(sql, args=()):
        try:
            cur.execute(sql, args); return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
    u = one("SELECT id, name, email, role, student_no, class_name, public_id, created_at, account_source, must_change_password FROM users WHERE id = ?", (user_id,))
    logins = one("SELECT COUNT(*) AS n, MIN(at) AS first, MAX(at) AS last FROM login_events WHERE user_id = ?", (user_id,))
    recent = many("SELECT at, ip FROM login_events WHERE user_id = ? ORDER BY at DESC LIMIT 8", (user_id,))
    courses = many("SELECT c.term, c.code, c.name, s.label AS section, e.status FROM enrollments e JOIN courses c ON c.id = e.course_id "
                   "LEFT JOIN course_sections s ON s.id = e.section_id WHERE e.user_id = ? ORDER BY c.term DESC", (user_id,))
    chips = one("SELECT COALESCE(SUM(CASE WHEN status = 'posted' THEN delta ELSE 0 END), 0) AS balance, "
                "COALESCE(SUM(CASE WHEN status = 'held' THEN delta ELSE 0 END), 0) AS held FROM chip_ledger WHERE user_id = ?", (user_id,))
    recs = one("SELECT COUNT(*) AS n, MAX(created_at) AS last FROM speech_recordings WHERE user_id = ?", (user_id,))
    conn.close()
    u.pop("id", None)
    return {**u, "logins": logins.get("n") or 0, "first_login": logins.get("first"), "last_login": logins.get("last"),
            "recent_logins": recent, "courses": courses, "chips": chips.get("balance") or 0, "chips_held": chips.get("held") or 0,
            "recordings": recs.get("n") or 0, "last_recording": recs.get("last")}
