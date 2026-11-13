"""Course detail for the teacher: when a class meets, what each class session plays, who played it,
and a calendar across every class (owner, 2026-11-13: "務必讓老師之後自己知道安排甚麼時候哪一班學生有玩").
Also one-student account work inside a course (add, edit), next to the roster import in classroom.py.

Teacher endpoints (teacher/admin token):
  PUT    /teacher/courses/{id}/meeting             weekday, periods and times the class meets
  GET    /teacher/courses/{id}/sessions            class sessions with how many played and the mean score
  POST   /teacher/courses/{id}/sessions            add or change one session (date, time, game, topic, levels, note)
  POST   /teacher/courses/{id}/sessions/weekly     one session per week on the meeting day, between two dates
  DELETE /teacher/sessions/{id}                    remove a session (no play data is touched)
  GET    /teacher/sessions/{id}/report             every student of the course: played in class / that day /
                                                   later / not yet, runs, best score; and the class mean
  GET    /teacher/calendar?month=YYYY-MM           every session of every course in a month, with counts
  POST   /teacher/courses/{id}/students            add one student (a new account with a one-time password,
                                                   or an existing account put in the course)
  PATCH  /teacher/users/{id}/profile               name, student number, email, 系級 of one student

What counts as "played" for a session: a run of the session's game (and topic, when the session names
one) by a student of the course, started on the session's day or later, before the course's next
session (at most 7 days). Runs that were only started are shown, not counted. Test accounts are listed
but left out of every count and mean. Run data lives in the learning database (backend/learning.py);
this module only reads it.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from backend import classroom as C
from backend import learning as L

router = APIRouter(tags=["course plan"])
D = C.D       # the platform-database helpers main.py gave classroom.configure

WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]      # 0 = Monday, as date.weekday()
TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LATE_DAYS = 7          # a session's "played later" window when the course has no later session
MAX_WEEKLY = 30        # sessions one "weekly" request may add


def init_db():
    conn = D.get_db()
    cur = conn.cursor()
    have = D.table_columns(cur, "courses")
    for name, ddl in (("meet_weekday", "INTEGER"), ("meet_periods", "TEXT"), ("meet_start", "TEXT"), ("meet_end", "TEXT")):
        if name not in have:
            D.execute_with_retry(cur, f"ALTER TABLE courses ADD COLUMN {name} {ddl}")
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS course_sessions (
            id {D.auto_pk_sql()},
            course_id INTEGER NOT NULL REFERENCES courses(id),
            day TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            game TEXT,
            topic_id TEXT,
            levels TEXT,
            title TEXT,
            note TEXT,
            created_at TEXT,
            updated_at TEXT
        )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_course_sessions_course ON course_sessions(course_id, day)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_course_sessions_day ON course_sessions(day)")
    conn.commit()
    conn.close()


def forget_course(cur, course_id):
    """Called when a course is deleted."""
    cur.execute("DELETE FROM course_sessions WHERE course_id = ?", (course_id,))


# ── helpers ──
def _rows(cur):
    return [dict(r) for r in cur.fetchall()]


def _day(v, what="日期"):
    v = str(v or "").strip()
    if not DAY.match(v):
        raise HTTPException(status_code=400, detail=f"{what}格式要是 YYYY-MM-DD。")
    try:
        date.fromisoformat(v)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{what}不是有效的日期：{v}")
    return v


def _time(v, what):
    v = str(v or "").strip()
    if v and not TIME.match(v):
        raise HTTPException(status_code=400, detail=f"{what}格式要是 HH:MM（24 小時制），例如 13:30。")
    return v or None


def _clean_session(s):
    s = dict(s)
    s["levels"] = [x for x in (s.get("levels") or "").split(",") if x]
    s["weekday"] = WEEKDAYS[date.fromisoformat(s["day"]).weekday()]
    return s


def _meeting(course):
    wd = course.get("meet_weekday")
    return {"weekday": wd, "weekday_zh": WEEKDAYS[wd] if isinstance(wd, int) and 0 <= wd < 7 else None,
            "periods": course.get("meet_periods") or "", "start": course.get("meet_start") or "", "end": course.get("meet_end") or ""}


def _roster(cur, course_id):
    """Students of the course (active and dropped), with whether their plays are test data."""
    cur.execute("""
        SELECT u.id AS user_id, u.name, u.student_no, u.email, u.role, u.test_account, e.status, s.label AS section
        FROM enrollments e JOIN users u ON u.id = e.user_id JOIN course_sections s ON s.id = e.section_id
        WHERE e.course_id = ? ORDER BY s.label, u.student_no, u.name""", (course_id,))
    out = _rows(cur)
    for p in out:
        p["test"] = C.is_test_person(p)
    return out


def _sessions_of(cur, course_id):
    cur.execute("SELECT * FROM course_sessions WHERE course_id = ? ORDER BY day, start_time, id", (course_id,))
    return [_clean_session(s) for s in _rows(cur)]


def _window(session, later_days):
    """[from, to) of the days a session's plays are looked for: its day up to the course's next session day."""
    start = date.fromisoformat(session["day"])
    nxt = [d for d in later_days if d > session["day"]]
    end = date.fromisoformat(nxt[0]) if nxt else start + timedelta(days=LATE_DAYS)
    if end <= start:
        end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _learning_runs(course_ids, day_from, day_to):
    """Runs of these courses started on day_from … day_to (exclusive), from the learning database."""
    if not course_ids:
        return []
    conn, cur = L.get_db()
    try:
        marks = ",".join("?" for _ in course_ids)
        cur.execute(f"""SELECT id, user_id, game, chapter, level, started_at, ended_at, course_id, metrics_json, stars_json
                        FROM learning_runs WHERE course_id IN ({marks}) AND started_at >= ? AND started_at < ? ORDER BY started_at""",
                    (*course_ids, day_from, day_to))
        out = []
        for r in cur.fetchall():
            d = dict(r)
            d["metrics"] = L._loads(d.pop("metrics_json"), {}) or {}
            d["stars"] = L._loads(d.pop("stars_json"), {}) or {}
            out.append(d)
        return out
    finally:
        conn.close()


def _run_score(run):
    """0–100 for a finished run when the game gives one: the card game's "understood" score, the SDG 4
    stage's reading accuracy, the 3D game's mean stars out of 3."""
    m = run.get("metrics") or {}
    if isinstance(m.get("score"), (int, float)) and not isinstance(m.get("score"), bool):
        return round(float(m["score"]))
    acc = (m.get("reading") or {}).get("accuracy") if isinstance(m.get("reading"), dict) else None
    if isinstance(acc, (int, float)):
        return round(acc * 100 if acc <= 1 else acc)
    stars = L._numeric_stars(run.get("stars") or {})
    if stars:
        return round(sum(stars) / len(stars) / 3 * 100)
    return None


def _excluded_run(run):
    m = run.get("metrics") or {}
    return bool(m.get("embed") or m.get("test"))


def _matches(session, run):
    if session.get("game") and run.get("game") != session["game"]:
        return False
    if session.get("topic_id") and run.get("chapter") != session["topic_id"]:
        return False
    if session.get("levels") and run.get("level") and run["level"] not in session["levels"]:
        return False
    return True


def _report(session, roster, runs, window):
    """Per student: when they played (in class / that day / later / only started / not yet), runs, best score."""
    day_from, day_to = window
    start, end = session.get("start_time"), session.get("end_time")
    by_user = {}
    for r in runs:
        if r.get("course_id") != session["course_id"] or not (day_from <= r["started_at"][:10] < day_to) or not _matches(session, r) or _excluded_run(r):
            continue
        by_user.setdefault(r.get("user_id"), []).append(r)
    students, counted = [], []
    for p in roster:
        mine = by_user.get(p["user_id"], [])
        done = [r for r in mine if r.get("ended_at")]
        scores = [s for s in (_run_score(r) for r in done) if s is not None]
        when = "none"
        if done:
            first = min(r["started_at"] for r in done)
            hm = first[11:16]
            if first[:10] == session["day"] and start and end and start <= hm <= end:
                when = "class"
            elif first[:10] == session["day"]:
                when = "day"
            else:
                when = "later"
        elif mine:
            when = "started"
        row = {"user_id": p["user_id"], "name": p["name"], "student_no": p["student_no"], "section": p["section"], "status": p["status"],
               "test": p["test"], "when": when, "runs": len(done), "started_only": len(mine) - len(done),
               "best": max(scores) if scores else None, "last": scores[-1] if scores else None,
               "levels": sorted({r["level"] for r in done if r.get("level")}),
               "first_at": min((r["started_at"] for r in done), default=None)}
        students.append(row)
        if not p["test"] and p["status"] == "active":
            counted.append(row)
    played = [s for s in counted if s["runs"]]
    best = [s["best"] for s in played if s["best"] is not None]
    summary = {"students": len(counted), "played": len(played), "not_played": len(counted) - len(played),
               "in_class": sum(1 for s in counted if s["when"] == "class"), "same_day": sum(1 for s in counted if s["when"] == "day"),
               "later": sum(1 for s in counted if s["when"] == "later"), "started_only": sum(1 for s in counted if s["when"] == "started"),
               "runs": sum(s["runs"] for s in counted), "mean_best": round(sum(best) / len(best), 1) if best else None,
               "window": {"from": day_from, "to": day_to}}
    return summary, students


def _with_stats(cur, course_ids, sessions_by_course, windows=None):
    """Adds `stats` to every session (the counts of its report, no student rows)."""
    if not any(sessions_by_course.values()):
        return
    if windows is None:
        windows = {}
        for ss in sessions_by_course.values():
            days = sorted(s["day"] for s in ss)
            for s in ss:
                windows[s["id"]] = _window(s, days)
    runs = _learning_runs(course_ids, min(w[0] for w in windows.values()), max(w[1] for w in windows.values()))
    rosters = {cid: _roster(cur, cid) for cid in course_ids}
    for cid, ss in sessions_by_course.items():
        for s in ss:
            s["stats"], _ = _report(s, rosters[cid], runs, windows[s["id"]])


# ── meeting time ──
class MeetingIn(BaseModel):
    weekday: int | None = None        # 0 = Monday … 6 = Sunday; None = not set
    periods: str = ""                 # what the school calls it, e.g. "5–6 節"
    start: str = ""                   # "13:30"
    end: str = ""


@router.put("/teacher/courses/{course_id}/meeting")
def save_meeting(course_id: int, data: MeetingIn, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    if data.weekday is not None and not 0 <= data.weekday <= 6:
        raise HTTPException(status_code=400, detail="星期要是 0（一）到 6（日）。")
    start, end = _time(data.start, "開始時間"), _time(data.end, "結束時間")
    if start and end and end <= start:
        raise HTTPException(status_code=400, detail="結束時間要比開始時間晚。")
    conn = D.get_db()
    cur = conn.cursor()
    C._course_or_404(cur, course_id)
    cur.execute("UPDATE courses SET meet_weekday = ?, meet_periods = ?, meet_start = ?, meet_end = ? WHERE id = ?",
                (data.weekday, data.periods.strip()[:40] or None, start, end, course_id))
    conn.commit()
    course = C._course_or_404(cur, course_id)
    conn.close()
    return {"meeting": _meeting(course)}


# ── sessions ──
class SessionIn(BaseModel):
    id: int | None = None
    day: str
    start: str = ""
    end: str = ""
    game: str = ""
    topic_id: str = ""
    levels: list[str] = []
    title: str = ""
    note: str = ""


def _session_values(data: SessionIn):
    day = _day(data.day)
    start, end = _time(data.start, "開始時間"), _time(data.end, "結束時間")
    if start and end and end <= start:
        raise HTTPException(status_code=400, detail="結束時間要比開始時間晚。")
    game = data.game.strip()
    if game and game not in C.GAMES:
        raise HTTPException(status_code=400, detail="不認得這個遊戲。")
    levels = [l for l in C.LEVELS if l in data.levels]
    topic = re.sub(r"[^0-9A-Za-z\-_.]", "", data.topic_id.strip())[:20]
    return day, start, end, game or None, topic or None, ",".join(levels), data.title.strip()[:80] or None, data.note.strip()[:500] or None


@router.get("/teacher/courses/{course_id}/sessions")
def list_sessions(course_id: int, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    course = C._course_or_404(cur, course_id)
    sessions = _sessions_of(cur, course_id)
    _with_stats(cur, [course_id], {course_id: sessions})
    conn.close()
    return {"course": {"id": course["id"], "term": course["term"], "code": course["code"], "name": course["name"]},
            "meeting": _meeting(course), "sessions": sessions, "games": list(C.GAMES), "levels": list(C.LEVELS), "today": C._today()}


@router.post("/teacher/courses/{course_id}/sessions")
def save_session(course_id: int, data: SessionIn, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    values = _session_values(data)
    conn = D.get_db()
    cur = conn.cursor()
    C._course_or_404(cur, course_id)
    if data.id:
        cur.execute("SELECT id FROM course_sessions WHERE id = ? AND course_id = ?", (data.id, course_id))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="session not found")
        cur.execute("""UPDATE course_sessions SET day = ?, start_time = ?, end_time = ?, game = ?, topic_id = ?, levels = ?, title = ?, note = ?, updated_at = ?
                       WHERE id = ?""", (*values, C._now(), data.id))
        sid = data.id
    else:
        sid = D.execute_insert_returning(cur, """
            INSERT INTO course_sessions (course_id, day, start_time, end_time, game, topic_id, levels, title, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (course_id, *values, C._now(), C._now()), "id")
    conn.commit()
    cur.execute("SELECT * FROM course_sessions WHERE id = ?", (sid,))
    out = _clean_session(cur.fetchone())
    conn.close()
    return {"session": out}


class WeeklyIn(BaseModel):
    day_from: str
    day_to: str
    game: str = ""
    topic_id: str = ""
    levels: list[str] = []
    skip: list[str] = []              # days with no class (holidays, exams)


@router.post("/teacher/courses/{course_id}/sessions/weekly")
def weekly_sessions(course_id: int, data: WeeklyIn, authorization: str | None = Header(default=None)):
    """One session on the meeting day of every week from day_from to day_to; days that already have a
    session, and the days in `skip`, are left alone."""
    D.require_teacher(authorization)
    a, b = date.fromisoformat(_day(data.day_from, "開始日期")), date.fromisoformat(_day(data.day_to, "結束日期"))
    if b < a:
        raise HTTPException(status_code=400, detail="結束日期要在開始日期之後。")
    skip = {_day(d, "不上課的日期") for d in data.skip if str(d).strip()}
    conn = D.get_db()
    cur = conn.cursor()
    course = C._course_or_404(cur, course_id)
    wd = course.get("meet_weekday")
    if not isinstance(wd, int):
        conn.close()
        raise HTTPException(status_code=400, detail="請先設定這門課星期幾上課。")
    first = a + timedelta(days=(wd - a.weekday()) % 7)
    days = []
    d = first
    while d <= b:
        days.append(d.isoformat())
        d += timedelta(days=7)
    if len(days) > MAX_WEEKLY:
        conn.close()
        raise HTTPException(status_code=400, detail=f"一次最多 {MAX_WEEKLY} 週。")
    have = {s["day"] for s in _sessions_of(cur, course_id)}
    values = _session_values(SessionIn(day=first.isoformat(), start=course.get("meet_start") or "", end=course.get("meet_end") or "",
                                       game=data.game, topic_id=data.topic_id, levels=data.levels))
    made, skipped = [], []
    for day in days:
        if day in have or day in skip:
            skipped.append(day)
            continue
        D.execute_insert_returning(cur, """
            INSERT INTO course_sessions (course_id, day, start_time, end_time, game, topic_id, levels, title, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (course_id, day, *values[1:], C._now(), C._now()), "id")
        made.append(day)
    conn.commit()
    conn.close()
    return {"made": made, "skipped": skipped}


@router.delete("/teacher/sessions/{session_id}")
def delete_session(session_id: int, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM course_sessions WHERE id = ?", (session_id,))
    s = cur.fetchone()
    if not s:
        conn.close()
        raise HTTPException(status_code=404, detail="session not found")
    cur.execute("DELETE FROM course_sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return {"deleted": _clean_session(s)}


@router.get("/teacher/sessions/{session_id}/report")
def session_report(session_id: int, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM course_sessions WHERE id = ?", (session_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="session not found")
    session = _clean_session(row)
    course = C._course_or_404(cur, session["course_id"])
    days = sorted(s["day"] for s in _sessions_of(cur, session["course_id"]))
    window = _window(session, days)
    roster = _roster(cur, session["course_id"])
    conn.close()
    summary, students = _report(session, roster, _learning_runs([session["course_id"]], *window), window)
    return {"course": {"id": course["id"], "code": course["code"], "name": course["name"]}, "session": session, "summary": summary, "students": students}


@router.get("/teacher/calendar")
def calendar(month: str = "", authorization: str | None = Header(default=None)):
    """Every session of every active course in one month (YYYY-MM), with its counts."""
    D.require_teacher(authorization)
    month = month.strip() or C._today()[:7]
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", month):
        raise HTTPException(status_code=400, detail="month 要是 YYYY-MM。")
    y, m = int(month[:4]), int(month[5:])
    first = date(y, m, 1)
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM courses WHERE active = 1 ORDER BY term DESC, code")
    courses = _rows(cur)
    by_course = {c["id"]: _sessions_of(cur, c["id"]) for c in courses}
    # A session's window ends at the course's next session, so the windows come from every session of
    # the course; only this month's sessions get counted and returned.
    windows = {}
    for cid, ss in by_course.items():
        days = sorted(s["day"] for s in ss)
        by_course[cid] = [s for s in ss if first.isoformat() <= s["day"] < nxt.isoformat()]
        for s in by_course[cid]:
            windows[s["id"]] = _window(s, days)
    _with_stats(cur, [c["id"] for c in courses], by_course, windows)
    conn.close()
    out = []
    for c in courses:
        for s in by_course[c["id"]]:
            if first.isoformat() <= s["day"] < nxt.isoformat():
                out.append({**s, "course_code": c["code"], "course_name": c["name"]})
    out.sort(key=lambda s: (s["day"], s.get("start_time") or "", s["course_code"]))
    return {"month": month, "today": C._today(),
            "courses": [{"id": c["id"], "code": c["code"], "name": c["name"], "term": c["term"], "meeting": _meeting(c)} for c in courses],
            "sessions": out}


# ── one student ──
class StudentIn(BaseModel):
    name: str
    student_no: str = ""
    section: str                      # 系級
    email: str = ""                   # empty = student_no@<school domain>
    send_email: bool = False


@router.post("/teacher/courses/{course_id}/students")
def add_student(course_id: int, data: StudentIn, authorization: str | None = Header(default=None)):
    """Add one student. A new account gets a one-time password (returned once, stored only as a hash);
    an account that already exists (same email or student number) is put in the course as it is."""
    D.require_teacher(authorization)
    name = re.sub(r"\s+", " ", data.name.strip())[:80]
    student_no = re.sub(r"\s+", "", data.student_no.strip()).upper()[:30]
    section = C._clean_label(data.section, "")
    if not name or not section:
        raise HTTPException(status_code=400, detail="姓名和系級都要填。")
    email = D.normalize_email(data.email.strip() or (f"{student_no.lower()}@{C.DEFAULT_EMAIL_DOMAIN}" if student_no else ""))
    if not email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="請填 email，或填學號讓系統用「學號@" + C.DEFAULT_EMAIL_DOMAIN + "」。")
    conn = D.get_db()
    cur = conn.cursor()
    try:
        course = C._course_or_404(cur, course_id)
        cur.execute("SELECT id, name, email, student_no, role FROM users WHERE email = ?", (email,))
        by_mail = cur.fetchone()
        by_no = None
        if student_no:
            cur.execute("SELECT id, name, email, student_no, role FROM users WHERE student_no = ?", (student_no,))
            by_no = cur.fetchone()
        if by_mail and by_no and by_mail["id"] != by_no["id"]:
            raise HTTPException(status_code=409, detail=f"這個 email 是 {by_mail['name']} 的帳號，學號 {student_no} 卻是 {by_no['name']} 的帳號，請先確認。")
        existing = by_mail or by_no
        password = None
        if existing:
            if existing["role"] != "student":
                raise HTTPException(status_code=409, detail="這個 email 是老師或管理員的帳號，不能當學生加入。")
            user_id, action = existing["id"], "enroll"
            cur.execute("UPDATE users SET class_name = ? WHERE id = ?", (section, user_id))
        else:
            password = C.make_password()
            user_id = D.execute_insert_returning(cur, """
                INSERT INTO users (name, gender, birth_date, email, password_hash, email_verified, privacy_agreed, role,
                                   student_no, institution, public_id, must_change_password, account_source, class_name)
                VALUES (?, NULL, NULL, ?, ?, 1, 1, 'student', ?, ?, ?, 1, 'teacher', ?)""",
                (name, email, D.hash_password(password), student_no or None, C.DEFAULT_INSTITUTION, D.new_public_id(cur), section), "id")
            action = "new"
        section_id = C._ensure_section(cur, course_id, section)
        cur.execute("SELECT id, status FROM enrollments WHERE course_id = ? AND user_id = ?", (course_id, user_id))
        e = cur.fetchone()
        if e:
            if e["status"] == "active" and action == "enroll":
                action = "already"
            cur.execute("UPDATE enrollments SET section_id = ?, status = 'active', updated_at = ? WHERE id = ?", (section_id, C._now(), e["id"]))
        else:
            cur.execute("INSERT INTO enrollments (course_id, section_id, user_id, status, source, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)",
                        (course_id, section_id, user_id, f"teacher:{C._today()}", C._now(), C._now()))
        conn.commit()
    except Exception:
        conn.close()
        raise
    conn.close()
    sheet = {"section": section, "student_no": student_no, "name": name if action == "new" else existing["name"], "email": email if action == "new" else existing["email"], "password": password}
    mailed = None
    if password and data.send_email:
        try:
            D.send_email(email, "CardLearn SDGs 帳號 / Your CardLearn SDGs account", C._account_email(name, email, password, course["name"]))
            mailed = True
        except HTTPException as error:
            mailed = str(error.detail)
    return {"user_id": user_id, "action": action, "account": sheet, "emailed": mailed}


class ProfileIn(BaseModel):
    name: str | None = None
    student_no: str | None = None
    email: str | None = None
    class_name: str | None = None     # 系級; with course_id the student also moves to that group of the course
    course_id: int | None = None


@router.patch("/teacher/users/{user_id}/profile")
def edit_profile(user_id: int, data: ProfileIn, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, role, email, student_no FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="user not found")
        if user["role"] != "student" and teacher.get("role") != "admin":
            raise HTTPException(status_code=403, detail="只有管理員可以改老師或管理員的資料。")
        sets = {}
        if data.name is not None:
            name = re.sub(r"\s+", " ", data.name.strip())[:80]
            if not name:
                raise HTTPException(status_code=400, detail="姓名不能空白。")
            sets["name"] = name
        if data.student_no is not None:
            no = re.sub(r"\s+", "", data.student_no.strip()).upper()[:30] or None
            if no and no != user["student_no"]:
                cur.execute("SELECT name FROM users WHERE student_no = ? AND id <> ?", (no, user_id))
                other = cur.fetchone()
                if other:
                    raise HTTPException(status_code=409, detail=f"學號 {no} 已經是 {other['name']} 的帳號。")
            sets["student_no"] = no
        if data.email is not None:
            email = D.normalize_email(data.email.strip())
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email or ""):
                raise HTTPException(status_code=400, detail="email 格式不對。")
            if email != user["email"]:
                cur.execute("SELECT name FROM users WHERE email = ? AND id <> ?", (email, user_id))
                other = cur.fetchone()
                if other:
                    raise HTTPException(status_code=409, detail=f"{email} 已經是 {other['name']} 的帳號（email 就是登入帳號）。")
            sets["email"] = email
        if data.class_name is not None:
            label = C._clean_label(data.class_name, "")
            if not label:
                raise HTTPException(status_code=400, detail="系級不能空白。")
            sets["class_name"] = label
            if data.course_id:
                section_id = C._ensure_section(cur, data.course_id, label)
                cur.execute("UPDATE enrollments SET section_id = ?, updated_at = ? WHERE course_id = ? AND user_id = ?", (section_id, C._now(), data.course_id, user_id))
        if sets:
            cur.execute(f"UPDATE users SET {', '.join(k + ' = ?' for k in sets)} WHERE id = ?", (*sets.values(), user_id))
        conn.commit()
        cur.execute("SELECT id AS user_id, name, email, student_no, class_name FROM users WHERE id = ?", (user_id,))
        out = dict(cur.fetchone())
    except Exception:
        conn.close()
        raise
    conn.close()
    return {"user": out, "login_changed": "email" in sets and sets["email"] != user["email"]}
