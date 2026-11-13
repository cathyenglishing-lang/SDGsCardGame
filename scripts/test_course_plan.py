"""Self-test for course detail: meeting time, class sessions, who played each session, calendar, one-student accounts.

Runs the real app against throw-away SQLite files (CARDLEARN_SQLITE_DIR), never sql/app.db:
    python scripts/test_course_plan.py
Exit code 0 = every check passed.
"""
import hashlib
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
TMP = tempfile.mkdtemp(prefix="cardlearn-test-")
os.environ["CARDLEARN_SQLITE_DIR"] = TMP
for key in ("DATABASE_URL", "LEARNING_DATABASE_URL", "REDIS_URL", "RESEND_API_KEY"):
    os.environ[key] = ""
# To run the same checks on PostgreSQL (what production uses), point these at two EMPTY throw-away
# databases:  TEST_DATABASE_URL=postgresql://…/cardlearn  TEST_LEARNING_DATABASE_URL=postgresql://…/learning
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "")
os.environ["LEARNING_DATABASE_URL"] = os.environ.get("TEST_LEARNING_DATABASE_URL", "")
os.environ["ALLOW_SELF_REGISTER"] = "false"
os.environ["INITIAL_ADMIN_EMAIL"] = "admin@example.com"
os.environ["INITIAL_ADMIN_PASSWORD"] = "AdminPass123"

import asyncio  # noqa: E402
import json  # noqa: E402
from urllib.parse import urlencode  # noqa: E402

from backend import course_plan, learning, main  # noqa: E402


class Response:
    def __init__(self, status_code, body, headers=None):
        self.status_code, self.content, self.headers = status_code, body, headers or {}
        self.text = body.decode("utf-8", errors="replace")

    def json(self):
        return json.loads(self.text)


class Client:
    """Calls the ASGI app directly (no server, no extra packages)."""

    def __init__(self, app):
        self.app = app

    def request(self, method, path, json_body=None, data=None, files=None, headers=None, params=None):
        head = {k.lower(): v for k, v in (headers or {}).items()}
        body = b""
        if files or data is not None:
            boundary = "----cardlearntest"
            parts = []
            for k, v in (data or {}).items():
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
            for k, (filename, content, ctype) in (files or {}).items():
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{filename}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + content + b"\r\n")
            body = b"".join(parts) + f"--{boundary}--\r\n".encode()
            head["content-type"] = f"multipart/form-data; boundary={boundary}"
        elif json_body is not None:
            body = json.dumps(json_body).encode()
            head["content-type"] = "application/json"
        head["content-length"] = str(len(body))
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "scheme": "http",
                 "path": path, "raw_path": path.encode(), "query_string": urlencode(params or {}).encode(),
                 "headers": [(k.encode(), v.encode()) for k, v in head.items()], "client": ("127.0.0.1", 1), "server": ("test", 80)}
        out = {"status": 500, "body": b""}

        async def run():
            sent = False

            async def receive():
                nonlocal sent
                if sent:
                    return {"type": "http.disconnect"}
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}

            async def send(message):
                if message["type"] == "http.response.start":
                    out["status"] = message["status"]
                    out["headers"] = {k.decode().lower(): v.decode("latin-1") for k, v in message.get("headers", [])}
                elif message["type"] == "http.response.body":
                    out["body"] += message.get("body", b"")

            await self.app(scope, receive, send)

        asyncio.run(run())
        return Response(out["status"], out["body"], out.get("headers"))

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)

    def post(self, path, json=None, **kw):
        return self.request("POST", path, json_body=json, **kw)

    def put(self, path, json=None, **kw):
        return self.request("PUT", path, json_body=json, **kw)

    def patch(self, path, json=None, **kw):
        return self.request("PATCH", path, json_body=json, **kw)


client = Client(main.app)
failed = []


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + (f"  → {detail}" if detail and not ok else ""))
    if not ok:
        failed.append(name)


def login(email, password):
    r = client.post("/auth/login", json={"email": email, "password": password})
    return r, ({"Authorization": f"Bearer {r.json()['access_token']}"} if r.status_code == 200 else {})


def section(title):
    print(f"\n{title}")


# ── course detail ──
r, admin = login("admin@example.com", "AdminPass123")
check("admin signs in", r.status_code == 200, r.text)
course_id = client.post("/teacher/courses", json={"term": "1151", "code": "ESC-C", "name": "English C"}, headers=admin).json()["course"]["id"]

section("One student: add, edit, enroll again")
r = client.post(f"/teacher/courses/{course_id}/students", json={"name": "王小明", "student_no": "cdn114001", "section": "資工一"}, headers=admin)
a = r.json()
check("a new student gets an account and a one-time password", r.status_code == 200 and a["action"] == "new" and len(a["account"]["password"] or "") == 12, r.text)
check("e-mail = student number @ school domain", a["account"]["email"] == "cdn114001@nptu.edu.tw", a["account"]["email"])
amy = a["user_id"]
bob = client.post(f"/teacher/courses/{course_id}/students", json={"name": "陳美麗", "student_no": "CDN114002", "section": "資工一"}, headers=admin).json()["user_id"]
tst = client.post(f"/teacher/courses/{course_id}/students", json={"name": "林測試", "student_no": "TST1", "section": "助教"}, headers=admin).json()["user_id"]
client.patch(f"/teacher/users/{tst}/test-account", json={"test": True}, headers=admin)
r = client.post(f"/teacher/courses/{course_id}/students", json={"name": "王小明", "student_no": "CDN114001", "section": "資工一"}, headers=admin)
check("the same student again: no second account, no password", r.json()["action"] == "already" and r.json()["account"]["password"] is None, r.text)
check("no name → 400", client.post(f"/teacher/courses/{course_id}/students", json={"name": " ", "student_no": "X1", "section": "A"}, headers=admin).status_code == 400)
check("mail of one, number of another → 409", client.post(f"/teacher/courses/{course_id}/students", json={"name": "x", "student_no": "CDN114002", "email": "cdn114001@nptu.edu.tw", "section": "A"}, headers=admin).status_code == 409)
r = client.patch(f"/teacher/users/{amy}/profile", json={"name": "王大明", "class_name": "資工二", "course_id": course_id}, headers=admin)
check("edit name and 系級", r.status_code == 200 and r.json()["user"]["name"] == "王大明" and r.json()["user"]["class_name"] == "資工二", r.text)
roster = client.get(f"/teacher/courses/{course_id}/roster", headers=admin).json()["students"]
check("…and the student moves to that group in the course", any(s["user_id"] == amy and s["section"] == "資工二" for s in roster), str(roster))
check("someone else's e-mail → 409", client.patch(f"/teacher/users/{amy}/profile", json={"email": "cdn114002@nptu.edu.tw"}, headers=admin).status_code == 409)
check("someone else's student number → 409", client.patch(f"/teacher/users/{amy}/profile", json={"student_no": "CDN114002"}, headers=admin).status_code == 409)
r = client.patch(f"/teacher/users/{amy}/profile", json={"email": "amy@example.com"}, headers=admin)
check("a new e-mail is the new login", r.json()["login_changed"] is True and login("amy@example.com", a["account"]["password"])[0].status_code == 200, r.text)

section("Meeting time and sessions")
check("weekly before a meeting day → 400", client.post(f"/teacher/courses/{course_id}/sessions/weekly", json={"day_from": "2026-11-16", "day_to": "2026-12-31"}, headers=admin).status_code == 400)
check("end before start → 400", client.put(f"/teacher/courses/{course_id}/meeting", json={"weekday": 0, "start": "15:20", "end": "13:30"}, headers=admin).status_code == 400)
r = client.put(f"/teacher/courses/{course_id}/meeting", json={"weekday": 0, "periods": "5–6 節", "start": "13:30", "end": "15:20"}, headers=admin)
check("meeting: Monday 5–6", r.status_code == 200 and r.json()["meeting"]["weekday_zh"] == "一", r.text)
r = client.post(f"/teacher/courses/{course_id}/sessions/weekly", json={"day_from": "2026-11-15", "day_to": "2026-12-07", "game": "pecha_kucha", "topic_id": "9-1", "skip": ["2026-11-30"]}, headers=admin)
check("weekly: Mondays 11/16, 11/23, 12/07 (11/30 skipped)", r.json()["made"] == ["2026-11-16", "2026-11-23", "2026-12-07"], r.text)
r = client.post(f"/teacher/courses/{course_id}/sessions/weekly", json={"day_from": "2026-11-15", "day_to": "2026-11-24"}, headers=admin)
check("weekly again: days that have a session are left alone", r.json()["made"] == [], r.text)
r = client.post(f"/teacher/courses/{course_id}/sessions", json={"day": "2026-11-18", "start": "10:00", "end": "11:00", "game": "sdg4-stage", "note": "補課"}, headers=admin)
check("one extra session", r.status_code == 200 and r.json()["session"]["weekday"] == "三", r.text)
extra = r.json()["session"]["id"]
check("bad date → 400", client.post(f"/teacher/courses/{course_id}/sessions", json={"day": "2026-13-01"}, headers=admin).status_code == 400)
check("unknown game → 400", client.post(f"/teacher/courses/{course_id}/sessions", json={"day": "2026-11-20", "game": "chess"}, headers=admin).status_code == 400)
sessions = client.get(f"/teacher/courses/{course_id}/sessions", headers=admin).json()["sessions"]
check("4 sessions in date order", [s["day"] for s in sessions] == ["2026-11-16", "2026-11-18", "2026-11-23", "2026-12-07"], str([s["day"] for s in sessions]))
s16 = sessions[0]
check("weekly sessions take the meeting time", s16["start_time"] == "13:30" and s16["end_time"] == "15:20")

section("Who played a session")
lconn, cur = learning.get_db()


def run(user, started, ended=True, chapter="9-1", score=None, game="pecha_kucha", level="A2", embed=False):
    metrics = json.dumps({"score": score, **({"embed": True} if embed else {})})
    cur.execute("INSERT INTO learning_runs (user_id, game, chapter, level, started_at, ended_at, metrics_json, course_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user, game, chapter, level, started, started if ended else None, metrics, course_id))


run(amy, "2026-11-16T13:45:00+08:00", score=70)                  # in class
run(amy, "2026-11-16T20:00:00+08:00", score=90)                  # again that evening: best 90
run(bob, "2026-11-17T09:00:00+08:00", score=50)                  # the next day: later
run(bob, "2026-11-16T14:00:00+08:00", chapter="9-2", score=99)   # another topic: not this session
run(tst, "2026-11-16T14:00:00+08:00", score=10)                  # a test account: listed, never counted
run(bob, "2026-11-23T13:40:00+08:00", ended=False)               # only started, in the next session
run(amy, "2026-11-23T14:00:00+08:00", score=100, embed=True)     # inside the 3D game: not counted
lconn.commit(); lconn.close()
rep = client.get(f"/teacher/sessions/{s16['id']}/report", headers=admin).json()
sm = rep["summary"]
check("window: the session day until the next session (11/18)", sm["window"] == {"from": "2026-11-16", "to": "2026-11-18"}, str(sm["window"]))
check("2 students counted, both played (test account left out)", sm["students"] == 2 and sm["played"] == 2, str(sm))
check("one in class, one later", sm["in_class"] == 1 and sm["later"] == 1, str(sm))
check("mean of each student's best: (90 + 50) / 2 = 70", sm["mean_best"] == 70, str(sm))
rows = {s["user_id"]: s for s in rep["students"]}
check("Amy: 2 runs, best 90, in class", rows[amy]["runs"] == 2 and rows[amy]["best"] == 90 and rows[amy]["when"] == "class", str(rows[amy]))
check("the test account is listed and marked", rows[tst]["test"] is True and rows[tst]["runs"] == 1)
s23 = sessions[2]
rep = client.get(f"/teacher/sessions/{s23['id']}/report", headers=admin).json()
rows = {s["user_id"]: s for s in rep["students"]}
check("11/23: Bob only started → shown, not counted as played", rows[bob]["when"] == "started" and rep["summary"]["played"] == 0, str(rep["summary"]))
check("11/23: a run inside the 3D game is not counted", rows[amy]["runs"] == 0)
client.patch(f"/teacher/enrollments/{next(s['enrollment_id'] for s in roster if s['user_id'] == bob)}", json={"status": "dropped"}, headers=admin)
rep = client.get(f"/teacher/sessions/{s16['id']}/report", headers=admin).json()
check("a dropped student is listed but not counted", rep["summary"]["students"] == 1 and any(s["user_id"] == bob and s["status"] == "dropped" for s in rep["students"]), str(rep["summary"]))

section("Calendar")
cal = client.get("/teacher/calendar", params={"month": "2026-11"}, headers=admin).json()
check("November: 3 sessions with counts", [s["day"] for s in cal["sessions"]] == ["2026-11-16", "2026-11-18", "2026-11-23"] and cal["sessions"][0]["stats"]["played"] == 1, json.dumps(cal["sessions"][0].get("stats")))
check("each session says its course", cal["sessions"][0]["course_code"] == "ESC-C")
check("December has 12/07", [s["day"] for s in client.get("/teacher/calendar", params={"month": "2026-12"}, headers=admin).json()["sessions"]] == ["2026-12-07"])
check("bad month → 400", client.get("/teacher/calendar", params={"month": "2026-13"}, headers=admin).status_code == 400)
check("students cannot read the calendar", client.get("/teacher/calendar", headers={"Authorization": "Bearer " + main.create_jwt(amy)}).status_code == 403)

section("Delete")
check("delete a session", client.delete(f"/teacher/sessions/{extra}", headers=admin).status_code == 200)
check("…it is gone", len(client.get(f"/teacher/courses/{course_id}/sessions", headers=admin).json()["sessions"]) == 3)
check("a student deleted by the teacher is gone", client.delete(f"/teacher/users/{bob}", headers=admin).status_code == 200
      and all(s["user_id"] != bob for s in client.get(f"/teacher/courses/{course_id}/roster", headers=admin).json()["students"]))
check("deleting the course deletes its sessions", client.delete(f"/teacher/courses/{course_id}", params={"confirm": "ESC-C"}, headers=admin).status_code == 200)
conn = main.get_db(); cur = conn.cursor(); cur.execute("SELECT COUNT(*) AS c FROM course_sessions"); left = cur.fetchone()["c"]; conn.close()
check("…none left", left == 0)

print("\nFAILED: " + ", ".join(failed) if failed else "\nall passed")
sys.exit(1 if failed else 0)
