"""Self-test for courses, roster import, accounts, card-game data and chips.

Runs the real app against throw-away SQLite files (CARDLEARN_SQLITE_DIR), never sql/app.db:
    python scripts/test_classroom.py
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

from backend import classroom, content_library, learning, main, recordings  # noqa: E402


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


# ── accounts ──
section("Passwords and sign-in")
r, admin = login("admin@example.com", "AdminPass123")
check("admin signs in", r.status_code == 200, r.text)
conn = main.get_db(); cur = conn.cursor()
cur.execute("SELECT password_hash, public_id FROM users WHERE email = ?", ("admin@example.com",))
row = cur.fetchone()
check("new passwords are salted PBKDF2", row["password_hash"].startswith("pbkdf2_sha256$"))
check("every account has a research code", bool(row["public_id"]) and row["public_id"].startswith("L-"))
# an account from before the change: unsalted SHA-256
cur.execute("INSERT INTO users (name, email, password_hash, email_verified, privacy_agreed, role, public_id) VALUES (?, ?, ?, 1, 1, 'student', ?)",
            ("Old Student", "old@example.com", hashlib.sha256(b"OldPass123").hexdigest(), main.new_public_id(cur)))
conn.commit(); conn.close()
r, old = login("old@example.com", "OldPass123")
check("an old SHA-256 account still signs in", r.status_code == 200, r.text)
conn = main.get_db(); cur = conn.cursor()
cur.execute("SELECT password_hash FROM users WHERE email = ?", ("old@example.com",))
check("…and its hash is upgraded at that sign-in", cur.fetchone()["password_hash"].startswith("pbkdf2_sha256$"))
conn.close()
check("the upgraded account signs in again", login("old@example.com", "OldPass123")[0].status_code == 200)
check("a wrong password is refused", login("old@example.com", "nope12345")[0].status_code == 400)

section("Self-registration switched off")
check("/auth/config says so", client.get("/auth/config").json() == {"self_register": False})
check("send-otp → 403", client.post("/auth/send-otp", json={"email": "new@example.com"}).status_code == 403)
check("register → 403", client.post("/auth/register", json={"name": "N", "email": "new@example.com", "password": "Passw0rd1", "confirm_password": "Passw0rd1", "privacy_agreed": True}).status_code == 403)

# ── courses and roster ──
section("Course")
r = client.post("/teacher/courses", json={"term": "1151", "code": "ENG101", "name": "English Presentation", "sections": ["A", "B"]}, headers=admin)
check("create a course with two sections", r.status_code == 200 and len(r.json()["course"]["sections"]) == 2, r.text)
course_id = r.json()["course"]["id"]
check("the same term + code again is refused", client.post("/teacher/courses", json={"term": "1151", "code": "ENG101", "name": "x"}, headers=admin).status_code == 400)
check("a student cannot open the teacher pages", client.get("/teacher/courses", headers=old).status_code == 403)

section("Roster import")
ROSTER = "班級\t學號\t姓名\temail\nA\t411012345\t王小明\t\nA\t411012346\t陳美麗\t411012346@nptu.edu.tw\nB\t411012347\t林大華\t\nB\tbad no!\t壞學號\t\nB\t411012345\t重複的人\t\n"
r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": ROSTER}, headers=admin)
check("preview reads a pasted sheet", r.status_code == 200, r.text)
p = r.json()
check("preview: 3 new, 2 errors", p["counts"].get("new") == 3 and p["counts"].get("error") == 2, str(p["counts"]))
check("preview derives e-mail from the student number", p["rows"][0]["email"] == "411012345@nptu.edu.tw")
conn = main.get_db(); cur = conn.cursor(); cur.execute("SELECT COUNT(*) AS c FROM users"); before = cur.fetchone()["c"]; conn.close()
check("preview writes nothing", before == 2)

r = client.post("/teacher/roster/commit", json={"course_id": course_id, "rows": p["rows"], "filename": "week9.tsv"}, headers=admin)
check("commit", r.status_code == 200, r.text)
c = r.json()
sheet = {s["student_no"]: s for s in c["account_sheet"]}
check("commit creates 3 accounts and returns their one-time passwords", c["counts"]["new"] == 3 and len(sheet) == 3, str(c["counts"]))
pw = sheet["411012345"]["password"]
check("password: 12 characters, no look-alike characters", len(pw) == 12 and not set(pw) & set("0O1lI"), pw)
conn = main.get_db(); cur = conn.cursor()
cur.execute("SELECT report_json FROM roster_imports ORDER BY id DESC LIMIT 1")
report = cur.fetchone()["report_json"]
cur.execute("SELECT password_hash FROM users WHERE student_no = ?", ("411012345",))
stored = cur.fetchone()["password_hash"]
conn.close()
check("no password is stored in clear text (import log, users table)", all(s["password"] not in report for s in sheet.values()) and pw not in stored)

r = client.post("/teacher/roster/commit", json={"course_id": course_id, "rows": p["rows"]}, headers=admin)
c2 = r.json()
check("the same roster again: 0 new accounts", c2["counts"]["new"] == 0 and c2["counts"]["same"] == 3 and not c2["account_sheet"], str(c2["counts"]))

r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": "學號,姓名\n411012345,王大明\n411012346,陳美麗\n"}, headers=admin)
p3 = r.json()
check("same number, different name → conflict, not overwritten", p3["rows"][0]["action"] == "conflict", str(p3["rows"][0]))
check("a student missing from the new list is reported", [m["student_no"] for m in p3["missing"]] == ["411012347"], str(p3["missing"]))
r = client.post("/teacher/roster/commit", json={"course_id": course_id, "rows": p3["rows"], "mark_missing_dropped": True}, headers=admin)
check("missing student marked dropped; account and records stay", r.json()["counts"]["dropped"] == 1, r.text)
roster = client.get(f"/teacher/courses/{course_id}/roster", headers=admin).json()["students"]
check("roster: 2 active, 1 dropped, name unchanged", sorted(s["status"] for s in roster) == ["active", "active", "dropped"] and any(s["name"] == "王小明" for s in roster))
p3["rows"][0]["force"] = True
r = client.post("/teacher/roster/commit", json={"course_id": course_id, "rows": p3["rows"]}, headers=admin)
roster = client.get(f"/teacher/courses/{course_id}/roster", headers=admin).json()["students"]
check("…with 「以名單為準」 the name is updated", any(s["name"] == "王大明" for s in roster), r.text)

csv_bytes = "班級,學號,姓名\nA,411012348,張三\n".encode("cp950")
r = client.post("/teacher/roster/preview", data={"course_id": course_id}, files={"file": ("list.csv", csv_bytes, "text/csv")}, headers=admin)
check("a Big5 CSV upload is read", r.status_code == 200 and r.json()["rows"][0]["name"] == "張三", r.text)
try:
    import io
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.append(["班級", "學號", "姓名", "Email"]); ws.append(["A", 411012349, "李四", None])
    buf = io.BytesIO(); wb.save(buf)
    r = client.post("/teacher/roster/preview", data={"course_id": course_id}, files={"file": ("list.xlsx", buf.getvalue(), "application/octet-stream")}, headers=admin)
    check("an XLSX upload is read (numeric student number)", r.status_code == 200 and r.json()["rows"][0]["student_no"] == "411012349", r.text)
except ImportError:
    print("  skip XLSX (openpyxl not installed)")

section("系級: every student has exactly one")
r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": "學號,姓名\n411019999,沒有系級\n"}, headers=admin)
check("a new student without a 系級 is an error", r.json()["rows"][0]["action"] == "error" and any("系級" in n for n in r.json()["rows"][0]["notes"]), r.text)
r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": "系級,學號,姓名\n資工三甲,411012346,陳美麗\n"}, headers=admin)
row = r.json()["rows"][0]
check("a different 系級 on the roster replaces the old one (shown in the preview)", row["action"] == "move" and any("系級由" in n for n in row["notes"]), str(row))
client.post("/teacher/roster/commit", json={"course_id": course_id, "rows": r.json()["rows"]}, headers=admin)
roster = client.get(f"/teacher/courses/{course_id}/roster", headers=admin).json()["students"]
mei = next(s for s in roster if s["student_no"] == "411012346")
check("the student now has the new 系級, on the account and in the course", mei["class_name"] == "資工三甲" and mei["section"] == "資工三甲", str(mei))
r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": "學號,姓名\n411012346,陳美麗\n"}, headers=admin)
check("a later roster without the 系級 column keeps it", r.json()["rows"][0]["section"] == "資工三甲" and r.json()["rows"][0]["action"] == "same", str(r.json()["rows"][0]))

section("First sign-in of an imported account")
r, stu = login("411012345@nptu.edu.tw", pw)
check("signs in with the one-time password", r.status_code == 200, r.text)
check("…and is told to change it", r.json()["user"]["must_change_password"] is True)
check("a weak new password is refused", client.post("/auth/change-password", json={"current_password": pw, "new_password": "short"}, headers=stu).status_code == 400)
check("the wrong current password is refused", client.post("/auth/change-password", json={"current_password": "x", "new_password": "NewPass123"}, headers=stu).status_code == 400)
check("change password", client.post("/auth/change-password", json={"current_password": pw, "new_password": "NewPass123"}, headers=stu).status_code == 200)
r, stu = login("411012345@nptu.edu.tw", "NewPass123")
check("the new password works and the flag is cleared", r.status_code == 200 and r.json()["user"]["must_change_password"] is False)
check("the one-time password no longer works", login("411012345@nptu.edu.tw", pw)[0].status_code == 400)
r = client.post(f"/teacher/users/{r.json()['user']['id']}/reset-password", headers=admin)
check("teacher can issue a new one-time password", r.status_code == 200 and len(r.json()["password"]) == 12, r.text)
r, stu = login("411012345@nptu.edu.tw", r.json()["password"])
check("…which again must be changed", r.json()["user"]["must_change_password"] is True)
student_id = r.json()["user"]["id"]

section("What a course has opened")
r = client.put(f"/teacher/courses/{course_id}/activities", json={"activities": [{"topic_id": "9-1", "levels": ["A2", "B1"]}, {"topic_id": "9-2", "levels": ["A2"]}]}, headers=admin)
check("teacher opens 9-1 and 9-2", r.status_code == 200 and len(r.json()["course"]["activities"]) == 2, r.text)
mine = client.get("/me/courses", headers=stu).json()["courses"]
check("the student sees the course and its two topics", len(mine) == 1 and [a["topic_id"] for a in mine[0]["activities"]] == ["9-1", "9-2"], str(mine))
check("a bad topic code is refused", client.put(f"/teacher/courses/{course_id}/activities", json={"activities": [{"topic_id": "nine", "levels": ["A2"]}]}, headers=admin).status_code == 400)

# ── card game data ──
section("Card game run")


def play(headers, client_id, drops, finish=True, chapter="9-1", level="A2"):
    """drops: list of (card no, target no, k, rt_ms). Returns (run_id, finish response)."""
    r = client.post("/learning/runs", json={"game": "pecha_kucha", "chapter": chapter, "level": level, "client_id": client_id, "content_version": 1, "client": "Mozilla/5.0 test"}, headers=headers)
    assert r.status_code == 200, r.text
    run_id = r.json()["run_id"]
    events, seq, t = [], 0, 0.0
    cid = lambda n: f"{chapter}/{level}/s{n:02d}"
    events.append({"seq": (seq := seq + 1), "t": t, "type": "run.start", "data": {"rate": 1}})
    dealt = set()
    for card, target, k, rt in drops:
        if card not in dealt:
            dealt.add(card)
            events.append({"seq": (seq := seq + 1), "t": (t := t + 1), "type": "card.deal", "data": {"card": cid(card)}})
        t += rt / 1000
        events.append({"seq": (seq := seq + 1), "t": t, "type": "card.drop", "data": {"card": cid(card), "target": cid(target), "correct": card == target, "k": k, "rt_ms": rt}})
    if finish:
        events.append({"seq": (seq := seq + 1), "t": t + 1, "type": "run.finish", "data": {}})
        events.append({"seq": (seq := seq + 1), "t": t + 2, "type": "wrap.done", "data": {}})
    r = client.post("/learning/events", json={"run_id": run_id, "events": events}, headers=headers)
    assert r.status_code == 200, r.text
    return run_id, events, (client.post(f"/learning/runs/{run_id}/finish", json={"metrics": {}}, headers=headers) if finish else None)


# 4 cards: 3 right on the first try, card 2 wrong once (k = 3 → s = -0.5), last card with k = 2
drops = [(1, 1, 3, 4000), (2, 3, 3, 5000), (2, 2, 2, 3000), (3, 3, 2, 4000), (4, 4, 2, 6000)]
run_id, events, fin = play(stu, "run-a", drops)
f = fin.json()
# s: card1 k3 → 1; card2 k3 wrong → -0.5; card3 k2 → 1; card4 k2 → 1 ; mean = 2.5/4 = 0.625 → 63
check("score corrects for guessing (63)", f["score"]["score"] == 63, str(f["score"]))
check("the card missed on the first try is listed", f["score"]["wrong_first"] == ["9-1/A2/s02"])
check("the run is filed under the student's course", client.get(f"/learning/runs/{run_id}/events", headers=admin).json()["run"]["course_id"] == course_id)
check("chips: 6 for the score + 5 for finishing", f["chips"]["earned"] == 11 and f["chips"]["balance"] == 11, str(f["chips"]))

r = client.post("/learning/events", json={"run_id": run_id, "events": events}, headers=stu)
check("the same events sent again are stored once", r.json()["stored"] == 0, r.text)
mixed = events[-2:] + [{"seq": 999, "t": 99, "type": "note", "data": {}}]
r = client.post("/learning/events", json={"run_id": run_id, "events": mixed}, headers=stu)
check("a batch with old and new events keeps the new one", r.json()["stored"] == 1, r.text)
r = client.post("/learning/runs", json={"game": "pecha_kucha", "chapter": "9-1", "level": "A2", "client_id": "run-a"}, headers=stu)
check("the same start sent again opens no second run", r.json()["run_id"] == run_id and r.json().get("duplicate") is True, r.text)
f2 = client.post(f"/learning/runs/{run_id}/finish", json={"metrics": {}}, headers=stu).json()
check("finishing twice pays once", f2["chips"]["balance"] == 11, str(f2["chips"]))

check("nobody else can write to the run (no token)", client.post("/learning/events", json={"run_id": run_id, "events": [{"seq": 500, "type": "x"}]}).status_code == 403)
check("nobody else can write to the run (another account)", client.post("/learning/events", json={"run_id": run_id, "events": [{"seq": 501, "type": "x"}]}, headers=old).status_code == 403)
check("nobody else can finish the run", client.post(f"/learning/runs/{run_id}/finish", json={}, headers=old).status_code == 403)

r = client.post("/learning/runs", json={"game": "pecha_kucha", "chapter": "9-1", "level": "A2", "username": "王大明"})
anon_run = r.json()["run_id"]
conn, cur = learning.get_db(); cur.execute("SELECT username, user_id FROM learning_runs WHERE id = ?", (anon_run,)); row = dict(cur.fetchone()); conn.close()
check("a run without sign-in is 'anonymous' whatever name is sent", row == {"username": "anonymous", "user_id": None}, str(row))

h = client.get("/learning/pk/me", params={"chapter": "9-1", "level": "A2"}, headers=stu).json()
check("own history: 1 run, best 63, the missed card comes back next time", h["runs"] == 1 and h["best_score"] == 63 and h["review_cards"] == ["9-1/A2/s02"], str(h))
check("own history needs sign-in", client.get("/learning/pk/me", params={"chapter": "9-1"}).status_code == 401)

section("Card game result (pk_results)")
body = {"topic_id": "9-1", "sdg_level": 9, "difficulty": "A2", "total_seconds": 300, "total_errors": 1, "total_repeats": 0, "parts": [{"part_no": 1, "errors": 1, "seconds": 300, "repeats": 0}], "client_id": "res-a", "run_id": run_id, "username": "Somebody Else"}
r = client.post("/game/pk-result", json=body, headers=stu)
check("result saved with the server's score", r.status_code == 200 and r.json()["saved"] and r.json()["score"] == 63, r.text)
check("the same result sent again is not stored twice", client.post("/game/pk-result", json=body, headers=stu).json().get("duplicate") is True)
r = client.post("/game/pk-result", json={**body, "client_id": "res-anon", "run_id": None})
conn = main.get_db(); cur = conn.cursor()
cur.execute("SELECT username, user_id, course_id, client_id FROM pk_results ORDER BY id")
rows = [dict(x) for x in cur.fetchall()]; conn.close()
check("two rows: the student's (with course) and an anonymous one", len(rows) == 2 and rows[0]["course_id"] == course_id and rows[1]["username"] == "anonymous" and rows[1]["user_id"] is None, str(rows))

section("Chip rules")
perfect = [(1, 1, 3, 4000), (2, 2, 2, 4000), (3, 3, 2, 4000), (4, 4, 2, 4000)]
_, _, fin = play(stu, "run-b", perfect)
check("2nd run today: 10 + 5", fin.json()["chips"]["earned"] == 15, str(fin.json()["chips"]))
_, _, fin = play(stu, "run-c", perfect)
check("3rd run of the same topic and level today: score only (10)", fin.json()["chips"]["earned"] == 10, str(fin.json()["chips"]))
_, _, fin = play(stu, "run-d", perfect, chapter="9-2")
check("another topic pays in full again (15)", fin.json()["chips"]["earned"] == 15, str(fin.json()["chips"]))
_, _, fin = play(stu, "run-e", perfect, chapter="9-2")
c = fin.json()["chips"]
check("daily cap 60: 11+15+10+15 = 51, so only 9 more", c["earned"] == 9 and c["today"] == 60 and c["capped"], str(c))
_, _, fin = play(stu, "run-f", perfect, chapter="9-2", level="B1")
check("after the cap nothing more is paid today", fin.json()["chips"]["earned"] == 0 and fin.json()["chips"]["balance"] == 60, str(fin.json()["chips"]))

guess = [(1, 2, 4, 900), (1, 3, 4, 900), (1, 4, 4, 900), (1, 1, 4, 900)]
_, _, fin = play(old, "run-g", guess)
g = fin.json()
check("three wrong drops in 10 s is flagged as trial and error", "trial_and_error" in g["score"]["flags"], str(g["score"]))
check("…and that run's chips wait for the teacher", g["chips"]["held"] and g["chips"]["balance"] == 0, str(g["chips"]))
held = client.get("/teacher/chips", headers=admin).json()["held"]
check("the teacher sees the held entry", len(held) >= 1, str(held))
r = client.post(f"/teacher/chips/{held[0]['id']}/resolve", json={"action": "post"}, headers=admin)
check("teacher confirms → posted", r.status_code == 200 and r.json()["balance"] > 0, r.text)
check("teacher adjustment needs a reason", client.post("/teacher/chips/adjust", json={"user_id": student_id, "delta": 5, "note": " "}, headers=admin).status_code == 400)
r = client.post("/teacher/chips/adjust", json={"user_id": student_id, "delta": -10, "note": "更正"}, headers=admin)
check("teacher can deduct with a reason", r.json()["balance"] == 50, r.text)
check("student sees the balance", client.get("/me/chips", headers=stu).json()["balance"] == 50)
check("chips_for_run: an embedded station pays nothing here", classroom.chips_for_run({"game": "pecha_kucha", "metrics": {"embed": True}}, {"score": 100, "complete": True}, {}) == [])
check("chips_for_run: coming back after 2 days adds 5", ("spaced.return", 5) in classroom.chips_for_run({"game": "pecha_kucha"}, {"score": 50, "complete": True}, {"days_since_previous": 2.5}))
check("chips_for_run: matching without the wrap-up does not pay 'finished'", classroom.chips_for_run({"game": "pecha_kucha"}, {"score": 70, "complete": True, "wrap": {"done": False}}, {}) == [("pk.score", 7)])
full_wrap = {"done": True, "remedy_ok": True, "quiz_correct": 4, "read_done": True, "reflect_done": True}
check("chips_for_run: full wrap-up = 7 + 5 + 3 + 4 + 3 + 2", classroom.chips_for_run({"game": "pecha_kucha"}, {"score": 70, "complete": True, "wrap": full_wrap}, {}) == [("pk.score", 7), ("pk.finish", 5), ("pk.remedy", 3), ("pk.quiz", 4), ("pk.read", 3), ("pk.reflect", 2)])
wrap_events = [{"type": "wrap.quiz.answer", "data": {"card": f"c{i}", "correct": i < 3}} for i in range(7)] + [{"type": "wrap.reflect", "data": {"answer": "b", "sentence": "I recycle at home"}}, {"type": "wrap.remedy.done", "data": {"all_correct": True}}]
w = learning.score_events(wrap_events)["wrap"]
check("wrap-up events: 5 quiz answers count at most, 3 right, reflection needs a real sentence", w["quiz_total"] == 5 and w["quiz_correct"] == 3 and w["reflect_done"] and w["remedy_ok"] and not w["done"], str(w))
check("chips_for_run: 3D game pays one chip per star", classroom.chips_for_run({"game": "innovation-harbor", "stars": {"0": 3, "1": 2, "2": "pending"}}, None, {}) == [("harbor.stars", 5)])

section("Voice recordings")
clip = b"\x1aE\xdf\xa3" + b"fake-opus" * 50
form = {"game": "pecha_kucha", "topic_id": "9-1", "level": "A2", "label": "9-1/A2/v1/c02", "script_text": "Many college science students use ChatGPT.", "seconds": "28.5", "target_seconds": "30", "wpm": "118", "client_id": "clip-a"}
r = client.post("/me/recordings", data=form, files={"file": ("clip.webm", clip, "audio/webm")}, headers=old)
check("a signed-in student's recording is accepted without an in-app question (paper consent at school)", r.status_code == 200 and r.json()["saved"] and client.get("/me/consent", headers=old).json()["required"] is False, r.text)
recordings.REQUIRE_CONSENT = True
check("with AUDIO_REQUIRE_CONSENT the upload waits for the student's yes", client.post("/me/recordings", data={**form, "client_id": "clip-b"}, files={"file": ("clip.webm", clip, "audio/webm")}, headers=old).status_code == 403)
check("…consent for audio is stored apart from research consent", (lambda c: c["audio"] is True and c["research"] is None)(client.post("/me/consent", json={"audio": True}, headers=old).json()))
recordings.REQUIRE_CONSENT = False
rec_id = r.json()["id"]
check("the same upload sent again is stored once", client.post("/me/recordings", data=form, files={"file": ("clip.webm", clip, "audio/webm")}, headers=old).json().get("duplicate") is True)
check("a file that is not audio is refused", client.post("/me/recordings", data={**form, "client_id": "x"}, files={"file": ("a.txt", b"hello", "text/plain")}, headers=old).status_code == 400)
check("a guest (no token) cannot upload", client.post("/me/recordings", data=form, files={"file": ("clip.webm", clip, "audio/webm")}).status_code == 401)
check("a student cannot list recordings", client.get("/teacher/recordings", headers=old).status_code == 403)
lst = client.get("/teacher/recordings", headers=admin).json()
check("the teacher sees it as not heard yet, with the text that was read", lst["counts"]["new"] == 1 and lst["recordings"][0]["script_text"].startswith("Many college") and lst["recordings"][0]["name"] == "Old Student", str(lst["counts"]))
r = client.get(f"/teacher/recordings/{rec_id}/audio", headers=admin)
check("the teacher can play it: the same bytes come back", r.status_code == 200 and r.content == clip)
check("playing it marks it heard", client.get("/teacher/recordings", headers=admin).json()["counts"] == {"new": 0, "heard": 1, "feedback": 0, "redo": 0})
r = client.patch(f"/teacher/recordings/{rec_id}", json={"status": "redo", "note": "th 的音再練一次"}, headers=admin)
check("the teacher asks for a new take with a note", r.status_code == 200 and r.json()["recording"]["status"] == "redo", r.text)
mine = client.get("/me/recordings", params={"label": "9-1/A2/v1/c02"}, headers=old).json()["recordings"]
check("the student sees the teacher's note", mine and mine[0]["teacher_note"] == "th 的音再練一次" and mine[0]["status"] == "redo", str(mine))
check("recordings are counted per student for the reports", recordings.counts_by_user().get(mine[0]["user_id"], {}).get("total") == 1)
info = recordings.storage_info()
check("storage info knows where and how much", info["recordings"] == 1 and info["bytes"] == len(clip) and info["where"] == "database", str(info))

section("Teacher's learning records")
g = client.get("/learning/records/games", headers=admin).json()
check("games list: the card game has runs; games that record nothing are named", next(x for x in g["games"] if x["game"] == "pecha_kucha")["runs"] >= 7 and len(g["not_recorded"]) == 5, str(g["games"]))
rep = client.get("/learning/records/game", params={"game": "pecha_kucha", "course_id": course_id}, headers=admin).json()
names = {s["name"]: s for s in rep["students"]}
check("by game + course: every enrolled student has a row, played or not", rep["overview"]["not_played"] >= 1 and any(s["runs"] == 0 for s in rep["students"]), str(rep["overview"]))
wang = next(s for s in rep["students"] if s["student_no"] == "411012345")
check("…with runs, best score, score history and 系級", wang["runs"] >= 6 and wang["best"] == 100 and len(wang["scores"]) >= 5 and wang["section"] == "A", str({k: wang[k] for k in ("runs", "best", "section")}))
c2 = next(c for c in rep["cards"] if c["card"] == "9-1/A2/s02")
check("per card: first-try rate and what it was confused with", c2["n"] >= 1 and c2["first_rate"] < 1 and c2["top_wrong"]["target"] == "9-1/A2/s03", str(c2))
check("the funnel counts starts and finished wrap-ups", rep["funnel"][0]["runs"] >= rep["funnel"][-1]["runs"] >= 1, str(rep["funnel"]))
check("students cannot read the records", client.get("/learning/records/game", headers=old).status_code == 403)
st = client.get(f"/learning/records/student/{student_id}", headers=admin).json()
check("by student: totals, topics played, weak sentences, run list", st["totals"]["runs"] >= 6 and any(t["chapter"] == "9-1" for t in st["card_topics"]) and st["weak_cards"][0]["card"] == "9-1/A2/s02" and len(st["runs"]) == st["totals"]["runs"], str(st["totals"]))
one = client.get(f"/learning/records/run/{run_id}", headers=admin).json()
check("one run: card by card, with a plain summary and the raw events", len(one["cards"]) == 4 and one["cards"][1]["first"] is False and one["cards"][1]["wrong_targets"] == ["9-1/A2/s03"] and "聽懂分數 63" in one["summary"] and len(one["events"]) >= 10, one["summary"])
old_api = client.get(f"/learning/runs/{run_id}/events", headers=admin).json()
check("the older per-run endpoint no longer judges a card run by the 3D story's rules", "走了" not in old_api["summary"] and not any("步行" in f["reason"] for f in old_api["flags"]), old_api["summary"])
x = client.get("/learning/records/export.xlsx", params={"game": "pecha_kucha", "course_id": course_id}, headers=admin)
check("Excel export", x.status_code == 200 and x.content[:2] == b"PK" and len(x.content) > 5000, str(x.status_code))
try:
    import io as _io
    from openpyxl import load_workbook
    wb = load_workbook(_io.BytesIO(client.get("/learning/records/export.xlsx", params={"game": "pecha_kucha", "names": "false"}, headers=admin).content))
    head = [c.value for c in wb["Students"][1]]
    check("export without names carries only the research code", head[0] == "research_code" and "name" not in head and "student_no" not in head and {"Runs", "Cards", "CardAttempts", "Events"} <= set(wb.sheetnames), str(head))
except ImportError:
    pass

section("Teaching-material library")
lib = client.get("/teacher/library", headers=admin).json()
card = lib["games"][0]
check("the card game's 9 topics are in the library, with the 3D games listed as not editable yet", len(card["topics"]) == 9 and len(lib["not_editable"]) == 3, str([t["topic_id"] for t in card["topics"]]))
check("students get the published library without signing in", len(client.get("/content/library").json()["topics"]) == 9)
check("a student cannot open the editor", client.get("/teacher/library", headers=stu).status_code == 403)
t92 = client.get("/teacher/library/pecha_kucha/9-2", headers=admin).json()
v0 = t92["summary"]["version"]      # the bank's version of this topic (it rises whenever the bank's scripts are corrected)
check("a topic opens with its slides, version and history", v0 >= 1 and len(t92["doc"]["levels"]["A2"]) == 12 and len(t92["history"]) == 1 and not t92["errors"], str(t92["summary"]))
import copy as _copy
doc = _copy.deepcopy(t92["doc"])
doc["levels"]["A2"][5]["title_en"] = doc["levels"]["A2"][4]["title_en"]          # the bug the game had: two cards with one title
r = client.put("/teacher/library/pecha_kucha/9-2/draft", json={"doc": doc}, headers=admin).json()
check("saving a draft reports the duplicate title, with the level and slide to jump to", r["has_draft"] and any(e["level"] == "A2" and e["no"] == 6 and "標題" in e["message"] for e in r["errors"]), str(r["errors"][:2]))
r = client.post("/teacher/library/pecha_kucha/9-2/publish", json={}, headers=admin)
check("a draft with errors cannot be published", r.status_code == 400 and r.json()["detail"]["errors"], r.text[:200])
check("…and students still get the old text", client.get("/content/library").json()["topics"][5]["levels"]["A2"][5]["title_en"] == t92["doc"]["levels"]["A2"][5]["title_en"])
doc = _copy.deepcopy(t92["doc"])
doc["levels"]["A2"][0]["title_zh"] = "全球永續的連結"
client.put("/teacher/library/pecha_kucha/9-2/draft", json={"doc": doc}, headers=admin)
r = client.post("/teacher/library/pecha_kucha/9-2/publish", json={"note": "改中文標題"}, headers=admin).json()
check("changing only a Chinese title publishes without a new version (learning data stays comparable)", r["published"] and r["version"] == v0 and r["version_raised"] is False, str(r))
doc["levels"]["A2"][0]["script"] = "Good morning, everyone. Today we look at SDG 9 and how we talk to AI."
r = client.put("/teacher/library/pecha_kucha/9-2/draft", json={"doc": doc}, headers=admin).json()
check("the editor is told when a change will start a new version", r["changes_data"] is True)
r = client.post("/teacher/library/pecha_kucha/9-2/publish", json={}, headers=admin).json()
check("changing a script raises the version", r["version"] == v0 + 1 and r["version_raised"] is True, str(r))
live = next(t for t in client.get("/content/library").json()["topics"] if t["id"] == "9-2")
check("students now get the new script and the new version", live["version"] == v0 + 1 and live["levels"]["A2"][0]["script"].startswith("Good morning, everyone. Today we look"))
check("saving the published text again leaves no draft", client.put("/teacher/library/pecha_kucha/9-2/draft", json={"doc": doc}, headers=admin).json()["has_draft"] is False)
client.post("/teacher/library/pecha_kucha/9-2/restore-version", json={"version": v0}, headers=admin)
back = client.get("/teacher/library/pecha_kucha/9-2", headers=admin).json()
check("an old version can be brought back as a draft (not live until published)", back["summary"]["has_draft"] and back["doc"]["levels"]["A2"][0]["script"] == t92["doc"]["levels"]["A2"][0]["script"] and live["version"] == v0 + 1)
check("discarding the draft goes back to what is published", client.post("/teacher/library/pecha_kucha/9-2/discard", headers=admin).json()["discarded"] and not client.get("/teacher/library/pecha_kucha/9-2", headers=admin).json()["summary"]["has_draft"])
r = client.post("/teacher/library/pecha_kucha", json={"topic_id": "4-3", "title_en": "Reading for Everyone", "title_zh": "人人都能閱讀", "slides": 12, "levels": ["A2"]}, headers=admin)
check("a new topic starts as a blank 12-slide draft", r.status_code == 200 and len(client.get("/teacher/library/pecha_kucha/4-3", headers=admin).json()["doc"]["levels"]["A2"]) == 12, r.text)
check("…that students do not see until it is published", all(t["id"] != "4-3" for t in client.get("/content/library").json()["topics"]))
check("a topic code that exists is refused; a wrong code is explained", client.post("/teacher/library/pecha_kucha", json={"topic_id": "4-3"}, headers=admin).status_code == 400 and client.post("/teacher/library/pecha_kucha", json={"topic_id": "four"}, headers=admin).status_code == 400)
rows = "張\t段落\t英文標題\t中文標題\t講稿\n" + "\n".join(f"{i + 1}\t{i // 2 + 1}\tTitle {i + 1}\t標題 {i + 1}\tThis is sentence number {i + 1} of the talk about reading." for i in range(12))
r = client.post("/teacher/library/pecha_kucha/4-3/import", data={"level": "A2", "text": rows}, headers=admin)
check("a pasted sheet fills the level", r.status_code == 200 and r.json()["imported"] == {"A2": 12} and not r.json()["errors"], r.text[:300])
check("…and then it can be published as version 1", client.post("/teacher/library/pecha_kucha/4-3/publish", json={}, headers=admin).json().get("version") == 1)
check("students see the new topic", any(t["id"] == "4-3" and t["levels"]["A2"][11]["title_en"] == "Title 12" for t in client.get("/content/library").json()["topics"]))
check("locking a topic is passed to the game", client.post("/teacher/library/pecha_kucha/4-3/lock", json={"locked": True}, headers=admin).json()["summary"]["locked"] and next(t for t in client.get("/content/library").json()["topics"] if t["id"] == "4-3")["locked"] is True)
check("deleting a topic archives it: gone for students, restorable for the teacher", client.post("/teacher/library/pecha_kucha/4-3/archive", headers=admin).json()["summary"]["archived"] and all(t["id"] != "4-3" for t in client.get("/content/library").json()["topics"]) and client.post("/teacher/library/pecha_kucha/4-3/unarchive", headers=admin).json()["summary"]["archived"] is False)
x = client.get("/teacher/library/pecha_kucha/4-3/export.xlsx", headers=admin)
check("a topic exports to Excel", x.status_code == 200 and x.content[:2] == b"PK")
check("the library's checks agree with the build's: no errors in the shipped material", all(t["errors"] == 0 for t in client.get("/teacher/library", headers=admin).json()["games"][0]["topics"]))

section("Scoring")
ev = lambda card, target, k, t: {"type": "card.drop", "t_ms": t, "data": {"card": card, "target": target, "correct": card == target, "k": k}}
check("all right → 100", learning.score_events([ev("a", "a", 3, 0), ev("b", "b", 2, 1)])["score"] == 100)
check("cards with one place left are not scored", learning.score_events([ev("a", "a", 1, 0)])["score"] is None)
check("never below 0", learning.score_events([ev("a", "b", 2, 0), ev("c", "d", 2, 1)])["score"] == 0)

section("Review findings (2026-11-09): forged data, PostgreSQL, embedded runs, roster safety")
src = {f.name: f.read_text(encoding="utf-8") for f in (ROOT / "backend").glob("*.py")} if "ROOT" in globals() else {f.name: f.read_text(encoding="utf-8") for f in Path(main.__file__).parent.glob("*.py")}
check("no SQL has a literal % pattern (psycopg reads it as a placeholder)", not any("LIKE '" in t for t in src.values()), str([n for n, t in src.items() if "LIKE '" in t]))
# anyone can post to an anonymous run: wrong types must not break the class report
r = client.post("/learning/runs", json={"game": "pecha_kucha", "chapter": "9-1", "level": "A2", "client_id": "forged-1"})
bad = r.json()["run_id"]
html = "<img src=x onerror=alert(1)>"
r = client.post("/learning/events", json={"run_id": bad, "events": [
    {"seq": 1, "t": 0, "type": "card.drop", "data": {"card": [1], "k": 3}},
    {"seq": 2, "t": 1, "type": "card.drop", "data": {"card": "9-1/A2/s01", "target": {"a": 1}, "k": "three", "rt_ms": html}},
    {"seq": 3, "t": 2, "type": "card.deal", "data": {"card": 7, "part": [1]}},
    {"seq": 4, "t": 3, "type": "wrap.read.done", "data": {"clip": "9-1/A2/s02", "seconds": html, "target": html, "wpm": html}},
    {"seq": 99999999999, "t": 1e308, "type": "run.abandon", "data": {"part": {"x": 1}, "matched": html}}]})
check("forged events are accepted without an error", r.status_code == 200, r.text[:200])
check("…finishing that run works", client.post(f"/learning/runs/{bad}/finish", json={"metrics": {"score": html, "big": 1e400}}).status_code == 200)
rep_ = client.get("/learning/records/game", params={"game": "pecha_kucha"}, headers=admin)
check("…the class report still opens", rep_.status_code == 200, rep_.text[:300])
one = client.get(f"/learning/records/run/{bad}", headers=admin)
check("…the run opens and its read-aloud numbers are numbers or nothing", one.status_code == 200 and all(x.get(k) is None or isinstance(x.get(k), (int, float)) for x in one.json().get("reads", []) for k in ("seconds", "target", "wpm")), one.text[:300])
check("…no HTML reached the report's numbers", html not in json.dumps([one.json().get("reads"), one.json().get("run"), one.json().get("cards")]), "")
r = client.post("/learning/runs", json={"game": "innovation-harbor", "chapter": "9-1", "level": "A2", "client_id": "forged-2"})
h = r.json()["run_id"]
client.post(f"/learning/runs/{h}/finish", json={"metrics": {"score": html, "flags": html, "mode": html}, "stars": {"x": 1000}})
hr = client.get("/learning/records/game", params={"game": "innovation-harbor"}, headers=admin)
check("a 3D-game run cannot put text into the score column", hr.status_code == 200 and html not in hr.text, hr.text[:200])
check("a run id larger than the database's integers is 'not found', not an error", client.post("/learning/events", json={"run_id": 99999999999, "events": []}).status_code == 404)
check("stars from the browser are capped at 3 per stage", classroom.chips_for_run({"game": "innovation-harbor", "stars": {"a": 1000, "b": 2}}, None, {}) == [("harbor.stars", 5)])
check("a card-game start with a token that is no longer valid is refused, not stored as anonymous",
      client.post("/learning/runs", json={"game": "pecha_kucha", "chapter": "9-1", "level": "A2", "client_id": "bad-token"}, headers={"Authorization": "Bearer not-a-token"}).status_code == 401)
check("text a student typed cannot become an Excel formula", learning.excel_cell("=HYPERLINK(1)").startswith("'") and learning.excel_cell("+1") == "'+1" and learning.excel_cell(5) == 5)
x = client.get("/learning/records/export.xlsx", params={"game": "pecha_kucha", "names": "false"}, headers=admin)
y = client.get("/learning/records/export.xlsx", params={"game": "pecha_kucha"}, headers=admin)
name_of = lambda resp: next((v for k, v in resp.headers.items() if k.lower() == "content-disposition"), "")
check("the two Excel exports have different file names", x.status_code == 200 and "codes-only" in name_of(x) and "WITH-NAMES" in name_of(y), name_of(x) + " | " + name_of(y))
# the station inside the 3D game is not a card-game run of its own
before = client.get("/learning/pk/me", params={"chapter": "9-1", "level": "A2"}, headers=stu).json()
r = client.post("/learning/runs", json={"game": "pecha_kucha", "chapter": "9-1", "level": "A2", "client_id": "embed-1"}, headers=stu)
e1 = r.json()["run_id"]
client.post("/learning/events", json={"run_id": e1, "events": [{"seq": 1, "t": 0, "type": "card.deal", "data": {"card": "9-1/A2/s01", "part": 1}},
    {"seq": 2, "t": 2, "type": "card.drop", "data": {"card": "9-1/A2/s01", "target": "9-1/A2/s01", "correct": True, "k": 3, "rt_ms": 2000}}, {"seq": 3, "t": 3, "type": "run.finish", "data": {}}]}, headers=stu)
fin = client.post(f"/learning/runs/{e1}/finish", json={"metrics": {"embed": True}}, headers=stu)
after = client.get("/learning/pk/me", params={"chapter": "9-1", "level": "A2"}, headers=stu).json()
check("an embedded station run does not count as a card-game run or a personal best", fin.status_code == 200 and after["runs"] == before["runs"] and after["best_score"] == before["best_score"], f"{before} → {after}")
# roster safety
r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": "系級,學號,姓名\n,411099001,沒有系級的人\n"}, headers=admin)
check("a new student without 系級 is an error, never a made-up one", r.status_code == 200 and r.json()["rows"][0]["action"] == "error" and "系級" in " ".join(r.json()["rows"][0]["notes"]), r.text[:300])
r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": "資工三甲\t411099002\t王小美\n資工三甲\t411099003\t李小龍\n"}, headers=admin)
check("a sheet without a header row is refused with an explanation", r.status_code == 400 and "欄位名稱" in r.text, r.text[:300])
ros = client.get(f"/teacher/courses/{course_id}/roster", headers=admin).json()["students"]
active = [s_ for s_ in ros if s_["status"] == "active"]
if active:
    a = active[0]
    others = "".join(f"\n{s_['section']},{s_['student_no']},{s_['name']}," for s_ in active[1:])
    r = client.post("/teacher/roster/preview", data={"course_id": course_id, "text": f"系級,學號,姓名,email\n{a['section']},{a['student_no']},{a['name']},typo@nptu" + others}, headers=admin)
    pv = r.json()
    check("a row with a typo is still 'in the file': that student is not listed as missing", r.status_code == 200 and pv["rows"][0]["action"] == "error" and a["student_no"] not in [m["student_no"] for m in pv["missing"]], r.text[:400])
r = client.post("/me/recordings", data={**form, "client_id": "clip-inf", "seconds": "inf", "target_seconds": "nan"}, files={"file": ("clip.webm", clip, "audio/webm")}, headers=old)
lst = client.get("/teacher/recordings", headers=admin)
check("a recording sent with seconds=inf does not break the teacher's list", r.status_code == 200 and lst.status_code == 200, f"{r.status_code} {r.text[:120]} | {lst.status_code}")
check("the teacher's recording list can be narrowed by date", client.get("/teacher/recordings", params={"from": "2099-01-01"}, headers=admin).json()["recordings"] == [])
check("…and so can a student's page", client.get(f"/learning/records/student/{student_id}", params={"from": "2099-01-01"}, headers=admin).json()["totals"]["runs"] == 0)
ch = client.get("/teacher/chips", params={"course_id": course_id}, headers=admin)
check("the chip list of a course opens and lists its students", ch.status_code == 200 and len(ch.json()["students"]) >= 1, ch.text[:200])

section("Meeting follow-ups (2026-11-09): T4 Chinese titles, T5 test data kept but not analysed")
from backend import content_library as CL  # noqa: E402
# T5 — the admin's (a teacher's) own play
a_run, _, a_fin = play(admin, "admin-run", drops)
check("T5: a teacher's / admin's run pays no chips and the answer says it is test data", a_fin.json()["chips"]["test"] is True and a_fin.json()["chips"]["earned"] == 0, str(a_fin.json()["chips"]))
rep5 = client.get("/learning/records/game", params={"game": "pecha_kucha"}, headers=admin).json()
row5 = next((r_ for r_ in rep5["runs"] if r_["id"] == a_run), None)
check("…the class report lists it with the reason 'test_account'", bool(row5) and row5["excluded"] == "test_account" and row5["test"] is True, str(row5)[:200])
check("…and does not count it", rep5["overview"]["excluded"].get("test_account", 0) >= 1 and a_run not in [x["run_id"] for s_ in rep5["students"] for x in s_["scores"]] and rep5["overview"]["runs"] == rep5["overview"]["runs_total"] - rep5["overview"]["excluded_runs"], str(rep5["overview"]))
# T5 — a student's quick test (Part 1 only, metrics.test)
q_run, _, _ = play(stu, "quick-1", [(1, 1, 3, 4000)], finish=False)
q_fin = client.post(f"/learning/runs/{q_run}/finish", json={"metrics": {"test": True, "parts": [1]}}, headers=stu)
check("T5: a quick test pays no chips", q_fin.status_code == 200 and q_fin.json()["chips"]["test"] is True and q_fin.json()["chips"]["earned"] == 0, q_fin.text[:200])
rep5 = client.get("/learning/records/game", params={"game": "pecha_kucha"}, headers=admin).json()
rowq = next((r_ for r_ in rep5["runs"] if r_["id"] == q_run), None)
check("…and is listed as 'test_run', not counted", bool(rowq) and rowq["excluded"] == "test_run" and rep5["overview"]["excluded"].get("test_run", 0) >= 1, str(rowq)[:200])
# T5 — the teacher marks a student as a test account, and back
rep_c = client.get("/learning/records/game", params={"game": "pecha_kucha", "course_id": course_id}, headers=admin).json()
listed_before = rep_c["overview"]["students_listed"]
runs_before = next(s_ for s_ in rep_c["students"] if s_["user_id"] == student_id)["runs"]
r = client.patch(f"/teacher/users/{student_id}/test-account", json={"test": True}, headers=admin)
rep_t = client.get("/learning/records/game", params={"game": "pecha_kucha", "course_id": course_id}, headers=admin).json()
srow = next(s_ for s_ in rep_t["students"] if s_["user_id"] == student_id)
check("T5: a student marked as a test account keeps a row (marked) and his runs are no longer counted",
      r.status_code == 200 and srow["test"] is True and srow["runs"] == 0 and srow["excluded_runs"] >= runs_before and rep_t["overview"]["students_listed"] == listed_before - 1 and rep_t["overview"]["test_accounts"] >= 1, str(srow)[:200] + " " + str(rep_t["overview"]))
check("…the roster shows the mark", any(s_["user_id"] == student_id and s_["test"] is True and s_["test_fixed"] is False for s_ in client.get(f"/teacher/courses/{course_id}/roster", headers=admin).json()["students"]))
sp = client.get(f"/learning/records/student/{student_id}", headers=admin).json()
check("…his own page still shows every run, marked", sp["student"]["test"] is True and sp["totals"]["runs"] >= runs_before and all(r_["excluded"] == "test_account" for r_ in sp["runs"]), str(sp["totals"]))
check("…the anomaly list leaves test accounts out", student_id not in [a_["user_id"] for a_ in rep_t.get("anomalies", [])])
admin_id = client.get("/auth/me", headers=admin).json()["id"]
check("T5: an admin's or teacher's account cannot be unmarked", client.patch(f"/teacher/users/{admin_id}/test-account", json={"test": False}, headers=admin).status_code == 400)
r = client.patch(f"/teacher/users/{student_id}/test-account", json={"test": False}, headers=admin)
rep_u = client.get("/learning/records/game", params={"game": "pecha_kucha", "course_id": course_id}, headers=admin).json()
check("…unmarking counts the student again", r.status_code == 200 and next(s_ for s_ in rep_u["students"] if s_["user_id"] == student_id)["runs"] == runs_before and rep_u["overview"]["students_listed"] == listed_before)
# T5 — the 3D analytics and the exports
r = client.post("/learning/runs", json={"game": "innovation-harbor", "chapter": "9-1", "level": "A2", "client_id": "admin-3d"}, headers=admin)
client.post(f"/learning/runs/{r.json()['run_id']}/finish", json={"metrics": {"score": 50}, "stars": {"a": 2}}, headers=admin)
an = client.get("/learning/analytics", headers=admin).json()
check("T5: the 3D story analytics leave the admin's run out and say so", an["overview"]["runs"] == 1 and an["test_runs_left_out"] == 1, str(an["overview"]) + " left_out=" + str(an.get("test_runs_left_out")))
x = client.get("/learning/records/export.xlsx", params={"game": "pecha_kucha"}, headers=admin)
try:
    import io as _io
    from openpyxl import load_workbook
    wb = load_workbook(_io.BytesIO(x.content), read_only=True)
    runs_head = [c for c in next(wb["Runs"].iter_rows(values_only=True))]
    runs_rows = list(wb["Runs"].iter_rows(values_only=True))[1:]
    admin_code = client.get("/auth/me", headers=admin).json().get("public_id")
    stu_codes = [row_[0] for row_ in list(wb["Students"].iter_rows(values_only=True))[1:]]
    excl_col = runs_head.index("excluded_reason")
    check("T5: the Excel 'Runs' sheet names why a run is not counted; 'Students' has no test account", x.status_code == 200 and any(row_[excl_col] == "test_account" for row_ in runs_rows) and admin_code not in stu_codes, f"{x.status_code} codes={stu_codes[:5]}")
    att_runs = {row_[0] for row_ in list(wb["CardAttempts"].iter_rows(values_only=True))[1:]}
    check("…and the analysis sheets have no test runs", a_run not in att_runs and q_run not in att_runs)
except ImportError:
    check("T5: Excel export opens (openpyxl missing: columns not checked)", x.status_code == 200)
# T4 — the material checks
twelve = [{"no": i + 1, "part": p_, "title_en": f"Card {i + 1}", "title_zh": "", "script": "Hello world.", "purpose": "", "keywords": ""} for i, p_ in enumerate([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6])]
errs4, warns4 = CL.check_doc({"id": "t4", "sdg": 9, "title_en": "T4", "title_zh": "", "levels": {"A2": twelve}})
check("T4: an empty Chinese title is an error (topic and card); an empty hint line is only a reminder",
      any(e["field"] == "title_zh" and e["no"] is None for e in errs4) and sum(1 for e in errs4 if e["field"] == "title_zh" and e["no"]) == 12
      and not any(e["field"] == "keywords" for e in errs4) and sum(1 for w in warns4 if w["field"] == "keywords") == 12, f"errors={[e['message'] for e in errs4][:3]}")
r = client.put("/teacher/library/pecha_kucha/13-1/draft", json={"doc": {**client.get("/teacher/library/pecha_kucha/13-1", headers=admin).json()["doc"], "title_zh": ""}}, headers=admin) if client.get("/teacher/library/pecha_kucha/13-1", headers=admin).status_code == 200 else None
if r is not None and r.status_code == 200:
    pub = client.post("/teacher/library/pecha_kucha/13-1/publish", json={}, headers=admin)
    check("T4: a topic without a Chinese name cannot be published", pub.status_code in (400, 409, 422), f"{pub.status_code} {pub.text[:120]}")
    client.post("/teacher/library/pecha_kucha/13-1/discard", json={}, headers=admin)
# T4 — an older database gets its missing Chinese titles from the question bank at start-up
seed_doc = json.loads((Path(main.FRONTEND_DIR) / "js" / "pk-content.js").read_text(encoding="utf-8").split("window.PK_CONTENT = ", 1)[1].rstrip().rstrip(";"))
seed_131 = next(t_ for t_ in seed_doc["topics"] if t_["id"] == "13-1")
conn_ = CL.D.get_db(); cur_ = conn_.cursor()
cur_.execute("SELECT id, published_json FROM content_topics WHERE game = ? AND topic_id = ?", ("pecha_kucha", "13-1"))
row_ = cur_.fetchone()
doc_ = json.loads(row_["published_json"]); lvl_ = sorted(doc_["levels"])[0]; want_ = next(s_["title_zh"] for s_ in seed_131["levels"][lvl_] if s_["no"] == 1)
doc_["levels"][lvl_][0]["title_zh"] = ""
cur_.execute("UPDATE content_topics SET published_json = ? WHERE id = ?", (json.dumps(doc_, ensure_ascii=False), row_["id"])); conn_.commit()
filled_ = CL._backfill_title_zh(cur_); conn_.commit()
cur_.execute("SELECT published_json FROM content_topics WHERE id = ?", (row_["id"],))
got_ = json.loads(cur_.fetchone()["published_json"])["levels"][lvl_][0]["title_zh"]; conn_.close()
check("T4: an older database gets a missing Chinese title back from the question bank at start-up (nothing else touched)", filled_ == 1 and got_ == want_ and bool(want_), f"filled={filled_} got={got_!r} want={want_!r}")

section("語音念法 (T2): one table for the whole platform, edited by the teacher")
sp0 = client.get("/content/speech")
check("the games get the table without signing in, with SDG and AI in it", sp0.status_code == 200 and {"written": "SDG", "spoken": "S D G"} in sp0.json()["rules"] and any(r_["written"] == "AI" for r_ in sp0.json()["rules"]), sp0.text[:200])
check("a student cannot change it", client.put("/teacher/speech", json={"rules": []}, headers=stu).status_code in (401, 403) and client.get("/teacher/speech", headers=stu).status_code in (401, 403))
mine = sp0.json()["rules"] + [{"written": "NPTU", "spoken": "N P T U"}, {"written": "", "spoken": ""}]
r = client.put("/teacher/speech", json={"rules": mine}, headers=admin)
check("the teacher adds a row; an empty row is dropped", r.status_code == 200 and r.json()["saved"] == len(sp0.json()["rules"]) + 1 and {"written": "NPTU", "spoken": "N P T U"} in client.get("/content/speech").json()["rules"], r.text[:200])
for bad_rules, why in (([{"written": "SDG", "spoken": "x"}, {"written": "SDG", "spoken": "y"}], "出現兩次"), ([{"written": "SDG", "spoken": ""}], "念成"), ([{"written": "two words", "spoken": "x"}], "空格"), ([{"written": "x" * 41, "spoken": "x"}], "太長")):
    r = client.put("/teacher/speech", json={"rules": bad_rules}, headers=admin)
    check(f"…a bad table is refused with the reason ({why})", r.status_code == 400 and why in r.text, r.text[:160])
check("…and a refused table changes nothing", {"written": "NPTU", "spoken": "N P T U"} in client.get("/content/speech").json()["rules"])
r = client.put("/teacher/speech", json={"rules": [{"written": "%s", "spoken": "100%"}, {"written": "<b>", "spoken": "it's \"quoted\""}]}, headers=admin)
check("odd characters (%, quotes, <>) are stored as plain text", r.status_code == 200 and client.get("/content/speech").json()["rules"] == [{"written": "%s", "spoken": "100%"}, {"written": "<b>", "spoken": "it's \"quoted\""}], r.text[:200])
r = client.post("/teacher/speech/reset", headers=admin)
check("the built-in table can be put back", r.status_code == 200 and client.get("/content/speech").json()["rules"] == sp0.json()["rules"])

section("雲端語音: two providers, accents the teacher offers, budgets, and the way back to the device's voice")
from backend import tts as TTS, speech_rules as SR  # noqa: E402
for raw, want in (("SDG 9 is about industry; AI helps us.", "S D G 9 is about industry, A I helps us."), ("The SDGs matter — for everyone.", "The S D Gs matter, for everyone."),
                  ("ChatGPT and GPT said STEM is fun.", "ChatGPT and G P T said STEM is fun."), ("AI can help us think, e.g. search.", "A I can help us think, for example search."),
                  ("Hook + SDG 9 & AI Connection", "Hook + S D G 9 and A I Connection"), ("PM2.5 and CO2 rise: why?", "P M 2.5 and C O 2 rise, why?")):
    check(f"the server rewrites text the same way as the browser ({raw[:18]}…)", SR.say(raw) == want, SR.say(raw))
sentences = sorted(TTS.material_texts())
s1, s2, s3, s4 = sentences[0], sentences[1], sentences[2], sentences[3]
check("the material's sentences are known to the voice service", len(sentences) > 100)
check("without a key: no cloud voice is offered", client.get("/content/tts/options").json() == {"available": False, "accents": [], "default": None})
r = client.get("/content/tts", params={"text": s1, "accent": "en-US"})
check("…and a sentence answers 'use the device's voice' (no_key)", r.status_code == 409 and r.json() == {"fallback": True, "reason": "no_key"}, r.text[:120])
calls = {"azure": [], "google": []}
fake = lambda name: (lambda text, voice, locale: (calls[name].append((text, voice, locale)), b"ID3" + name.encode() + b"\x00" * 400)[1])
real = {k: dict(v) for k, v in TTS.PROVIDERS.items()}
TTS.PROVIDERS["azure"].update(ready=lambda: True, synth=fake("azure"))
o = client.get("/content/tts/options").json()
check("with a key: the teacher's default accents are offered (American, British)", o["available"] and [a["code"] for a in o["accents"]] == ["en-US", "en-GB"] and o["default"] == "en-US", str(o))
r = client.get("/content/tts", params={"text": s1, "accent": "en-GB"})
check("a sentence of the material comes back as mp3 in the accent asked for", r.status_code == 200 and r.content.startswith(b"ID3azure") and calls["azure"][-1][1:] == ("en-GB-SoniaNeural", "en-GB") and calls["azure"][-1][0] == SR.say(s1), f"{r.status_code} {calls['azure'][-1:]}")
n1 = len(calls["azure"])
r = client.get("/content/tts", params={"text": s1, "accent": "en-GB"})
check("…the second time it is the stored file: the provider is not called again", r.status_code == 200 and len(calls["azure"]) == n1)
st_ = client.get("/teacher/tts", headers=admin).json()
az = next(p_ for p_ in st_["providers"] if p_["key"] == "azure")
check("…and the characters are counted once", az["used"] == len(SR.say(s1)) and az["clips"] == 1 and next(a for a in st_["accents"] if a["code"] == "en-GB")["ready"] == 1, str(az))
r = client.get("/content/tts", params={"text": "Please read my own essay aloud for free.", "accent": "en-GB"})
check("text that is not in the material is refused (nobody can spend the allowance)", r.status_code == 409 and r.json()["reason"] == "not_in_material" and len(calls["azure"]) == n1)
check("an accent the teacher has not offered is refused", client.get("/content/tts", params={"text": s1, "accent": "en-AU"}).json().get("reason") == "accent_not_offered")
check("a student cannot open the teacher's settings or the try-out", client.get("/teacher/tts", headers=stu).status_code in (401, 403) and client.post("/teacher/tts/try", json={"text": "Hi", "accent": "en-US"}, headers=stu).status_code in (401, 403))
r = client.put("/teacher/tts", json={"accents": ["en-US", "en-GB", "en-AU"], "default": "en-AU"}, headers=admin)
check("the teacher offers a third accent and makes it the default", r.status_code == 200 and client.get("/content/tts/options").json()["default"] == "en-AU" and len(client.get("/content/tts/options").json()["accents"]) == 3, r.text[:160])
check("…an unknown accent is refused", client.put("/teacher/tts", json={"accents": ["xx-YY"]}, headers=admin).status_code == 400)
r = client.post("/teacher/tts/try", json={"text": "The SDGs matter.", "accent": "en-AU"}, headers=admin)
check("the teacher can hear any short sentence", r.status_code == 200 and calls["azure"][-1][0] == "The S D Gs matter." and calls["azure"][-1][1] == "en-AU-NatashaNeural")
# the budget: when the first provider's month is used up, the second one answers; when both are, the device speaks
TTS.PROVIDERS["google"].update(ready=lambda: True, synth=fake("google"))
used_now = next(p_ for p_ in client.get("/teacher/tts", headers=admin).json()["providers"] if p_["key"] == "azure")["used"]
client.put("/teacher/tts", json={"budget": {"azure": used_now + 5, "google": 900000}}, headers=admin)
r = client.get("/content/tts", params={"text": s2, "accent": "en-US"})
check("when Azure's month is used up, Google answers", r.status_code == 200 and r.content.startswith(b"ID3google") and calls["google"][-1][1] == "en-US-Chirp3-HD-Aoede", f"{r.status_code} {r.content[:12]!r}")
client.put("/teacher/tts", json={"budget": {"azure": 0, "google": 0}}, headers=admin)
r = client.get("/content/tts", params={"text": s3, "accent": "en-US"})
check("when every budget is used up, the answer is 'use the device's voice'", r.status_code == 409 and r.json()["reason"] == "budget_used_up")
check("…but a clip that is already stored still plays", client.get("/content/tts", params={"text": s2, "accent": "en-US"}).status_code == 200)
client.put("/teacher/tts", json={"budget": {"azure": 450000, "google": 900000}}, headers=admin)
# a provider that fails is skipped for a while
def broken(text, voice, locale):
    raise OSError("connection refused")
TTS.PROVIDERS["azure"]["synth"] = broken
r = client.get("/content/tts", params={"text": s3, "accent": "en-US"})
paused = next(p_ for p_ in client.get("/teacher/tts", headers=admin).json()["providers"] if p_["key"] == "azure")["paused"]
check("when Azure fails, Google answers and Azure is rested for a few minutes", r.status_code == 200 and r.content.startswith(b"ID3google") and paused is True)
r = client.get("/content/tts", params={"text": s3, "accent": "en-IE"})
client.put("/teacher/tts", json={"accents": ["en-US", "en-GB", "en-AU", "en-IE"]}, headers=admin)
r = client.get("/content/tts", params={"text": s3, "accent": "en-IE"})
check("an accent only the resting provider has falls back to the device (no error)", r.status_code == 409 and r.json()["reason"] == "provider_error", r.text[:120])
TTS._paused.clear(); TTS.PROVIDERS["azure"]["synth"] = fake("azure")
# preparing the whole material, a few clips per call
out = client.post("/teacher/tts/prepare", json={"accent": "en-IE"}, headers=admin).json()
check("'prepare everything' makes a few clips per call and says how many are left", out["made"] == TTS.PREPARE_BATCH and out["left"] == out["total"] - TTS.PREPARE_BATCH and out["stopped"] is None, str(out))
# a change of the 念法表 makes a new clip for the sentences it touches
with_ai = next(t for t in sentences if " AI " in t)
client.get("/content/tts", params={"text": with_ai, "accent": "en-US"}); before_n = len(calls["azure"])
rules_now = client.get("/content/speech").json()["rules"]
client.put("/teacher/speech", json={"rules": [({"written": "AI", "spoken": "artificial intelligence"} if r_["written"] == "AI" else r_) for r_ in rules_now]}, headers=admin)
r = client.get("/content/tts", params={"text": with_ai, "accent": "en-US"})
check("changing the 念法表 re-makes the sentences it touches, with the new wording", r.status_code == 200 and len(calls["azure"]) == before_n + 1 and "artificial intelligence" in calls["azure"][-1][0] and " A I " not in calls["azure"][-1][0], calls["azure"][-1][0][:80])
client.post("/teacher/speech/reset", headers=admin)
for k_, v_ in real.items():
    TTS.PROVIDERS[k_].update(v_)
client.put("/teacher/tts", json=TTS.DEFAULT_SETTINGS, headers=admin)
check("with the keys gone again the game is told to use the device's voice, and stored clips still play", client.get("/content/tts/options").json()["available"] is False and client.get("/content/tts", params={"text": s1, "accent": "en-GB"}).status_code == 200)

section("Chinese titles must be Chinese (5-1 and 5-2 had the English script there)")
bad12 = [{**c_, "title_zh": "Think about a beautiful bird.", "keywords": "x"} for c_ in twelve]
errs_, _ = CL.check_doc({"id": "t5", "sdg": 5, "title_en": "T", "title_zh": "測試", "levels": {"A2": bad12}})
check("a 'Chinese title' with no Chinese in it is an error", sum(1 for e in errs_ if e["field"] == "title_zh" and "沒有中文" in e["message"]) == 12, str([e["message"] for e in errs_][:2]))
lib_ = client.get("/content/library").json()["topics"]
leaks = [(t_["id"], l_, s_["no"]) for t_ in lib_ for l_, ss_ in t_["levels"].items() for s_ in ss_ if not CL.re.search("[㐀-鿿]", s_.get("title_zh") or "")]
check("no card served to students has an English sentence as its Chinese title", leaks == [], str(leaks[:5]))
conn_ = CL.D.get_db(); cur_ = conn_.cursor()
cur_.execute("SELECT id, published_json FROM content_topics WHERE game = ? AND topic_id = ?", ("pecha_kucha", "5-1"))
row_ = cur_.fetchone(); doc_ = json.loads(row_["published_json"]); lvl_ = sorted(doc_["levels"])[0]
good_ = doc_["levels"][lvl_][2]["title_zh"]; doc_["levels"][lvl_][2]["title_zh"] = doc_["levels"][lvl_][2]["script"]
cur_.execute("UPDATE content_topics SET published_json = ? WHERE id = ?", (json.dumps(doc_, ensure_ascii=False), row_["id"])); conn_.commit()
n_ = CL._backfill_title_zh(cur_); conn_.commit()
cur_.execute("SELECT published_json FROM content_topics WHERE id = ?", (row_["id"],))
now_ = json.loads(cur_.fetchone()["published_json"])["levels"][lvl_][2]["title_zh"]; conn_.close()
check("an older database with the script in that field gets the real Chinese title at start-up", n_ == 1 and now_ == good_ and bool(CL.re.search("[㐀-鿿]", now_)), f"{n_} {now_!r}")

section("A newer question bank reaches an existing database (and never overwrites the teacher's edits)")
bank_ = CL._bank()
conn_ = CL.D.get_db(); cur_ = conn_.cursor()
def topic_row(tid):
    cur_.execute("SELECT * FROM content_topics WHERE game = ? AND topic_id = ?", ("pecha_kucha", tid)); return dict(cur_.fetchone())
# 13-2 was never edited in this run: pretend the database was filled from an older bank (one version behind, another script)
r13 = topic_row("13-2"); old_doc = json.loads(r13["published_json"]); lv13 = sorted(old_doc["levels"])[0]
old_doc["levels"][lv13][0]["script"] = "An older wording of this slide."
seed13 = int(bank_["13-2"].get("version") or 1)
cur_.execute("UPDATE content_topics SET published_json = ?, version = ?, bank_version = ? WHERE id = ?", (json.dumps(old_doc, ensure_ascii=False), seed13 - 1, seed13 - 1, r13["id"]))
cur_.execute("UPDATE content_versions SET version = ? WHERE topic_pk = ?", (seed13 - 1, r13["id"])); conn_.commit()
took = CL._take_bank_updates(cur_); conn_.commit()
n13 = topic_row("13-2")
check("a topic nobody edited takes the newer bank version as a new version", any(x.startswith("13-2→") for x in took) and n13["version"] == seed13 and n13["bank_version"] == seed13
      and json.loads(n13["published_json"])["levels"][lv13][0]["script"] == bank_["13-2"]["levels"][lv13][0]["script"], f"{took} v{n13['version']}")
cur_.execute("SELECT version, note FROM content_versions WHERE topic_pk = ? ORDER BY id DESC LIMIT 1", (r13["id"],)); last_ = cur_.fetchone()
check("…the version list says it came from the bank, and the old version is still there", last_["version"] == seed13 and "題庫" in last_["note"])
check("…a second start changes nothing", CL._take_bank_updates(cur_) == [])
# 9-2 was edited and published by the teacher earlier in this run: it must be left alone, and offered
r92 = topic_row("9-2"); before92 = r92["published_json"]
cur_.execute("UPDATE content_topics SET bank_version = ? WHERE id = ?", (int(bank_["9-2"].get("version") or 1) - 1, r92["id"])); conn_.commit()
took = CL._take_bank_updates(cur_); conn_.commit()
check("a topic the teacher edited is NOT overwritten by a newer bank version", not any(x.startswith("9-2→") for x in took) and topic_row("9-2")["published_json"] == before92, str(took))
conn_.close()
sum92 = client.get("/teacher/library/pecha_kucha/9-2", headers=admin).json()["summary"]
check("…the editor is told a newer bank version exists", sum92["bank_newer"] == int(bank_["9-2"].get("version") or 1), str(sum92.get("bank_newer")))
check("…a student cannot load it", client.post("/teacher/library/pecha_kucha/9-2/take-bank", headers=stu).status_code in (401, 403))
tb = client.post("/teacher/library/pecha_kucha/9-2/take-bank", headers=admin)
got92 = client.get("/teacher/library/pecha_kucha/9-2", headers=admin).json()
played92 = next(t_ for t_ in client.get("/content/library").json()["topics"] if t_["id"] == "9-2")
check("…the teacher loads it as a draft: students still get the teacher's published version", tb.status_code == 200 and got92["summary"]["has_draft"] is True and got92["summary"]["bank_newer"] is None
      and got92["doc"]["levels"]["A2"][0]["script"] == bank_["9-2"]["levels"]["A2"][0]["script"] and json.dumps(played92["levels"], sort_keys=True) == json.dumps(json.loads(before92)["levels"], sort_keys=True), tb.text[:160])
check("…and it is not offered twice", client.post("/teacher/library/pecha_kucha/9-2/take-bank", headers=admin).status_code == 400)
client.post("/teacher/library/pecha_kucha/9-2/discard", json={}, headers=admin)

section("Other pages still work")
check("3D story analytics leave card-game runs out (only the one 3D run made above is counted)", client.get("/learning/analytics", headers=admin).json()["overview"]["runs"] == 1)
check("old card-game analytics", client.get("/teacher/pk-analytics", headers=admin).status_code == 200)
check("teacher user list", client.get("/teacher/users", headers=admin).status_code == 200)
check("deleting a student with enrolments and chips works", client.delete(f"/teacher/users/{student_id}", headers=admin).status_code == 200)
old_id = client.get("/auth/me", headers=old).json()["id"]
check("deleting a student also deletes the voice recordings", client.delete(f"/teacher/users/{old_id}", headers=admin).status_code == 200 and client.get("/teacher/recordings", headers=admin).json()["recordings"] == [])

print(f"\n{'ALL PASSED' if not failed else str(len(failed)) + ' FAILED: ' + '; '.join(failed)}   (database: {TMP})")
sys.exit(1 if failed else 0)
