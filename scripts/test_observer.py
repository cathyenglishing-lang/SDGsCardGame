"""Self-test for the read-only "observer" role: may open the whole back office except 班級 (courses, rosters, accounts),
no exports, and never a change.

Runs the real app against throw-away SQLite files (CARDLEARN_SQLITE_DIR), never sql/app.db:
    python scripts/test_observer.py
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
r, admin = login("admin@example.com", "AdminPass123")
check("admin signs in", r.status_code == 200, r.text)
course_id = client.post("/teacher/courses", json={"term": "1151", "code": "ESC-C", "name": "English C"}, headers=admin).json()["course"]["id"]
client.post(f"/teacher/courses/{course_id}/students", json={"name": "王小明", "student_no": "cdn114001", "section": "資工一"}, headers=admin)

section("Accounts")
r = client.post("/teacher/users/bulk", json={"users": [
    {"name": "Observer", "email": "obs@example.com", "password": "ObsPass1234", "role": "observer"},
    {"name": "Teacher", "email": "tea@example.com", "password": "TeaPass1234", "role": "teacher"},
    {"name": "Student", "email": "stu@example.com", "password": "StuPass1234", "role": "student"}]}, headers=admin)
check("admin creates an observer, a teacher and a student", len(r.json().get("created", [])) == 3, r.text)
_, obs = login("obs@example.com", "ObsPass1234")
_, tea = login("tea@example.com", "TeaPass1234")
_, stu = login("stu@example.com", "StuPass1234")
check("observer can sign in", bool(obs))
check("/auth/me says observer", client.get("/auth/me", headers=obs).json().get("role") == "observer")

section("Observer may read teaching materials and voice settings")
for path in ("/teacher/library", "/teacher/content", "/teacher/speech", "/teacher/tts"):
    r = client.get(path, headers=obs)
    check(f"GET {path} → 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
lib = client.get("/teacher/library", headers=admin).json()
item = None
for g in lib.get("games") or []:
    if g.get("topics"):
        item = (g["game"], g["topics"][0]["topic_id"]); break
check("library has at least one topic to open", item is not None, str(lib)[:200])
if item:
    r = client.get(f"/teacher/library/{item[0]}/{item[1]}", headers=obs)
    check("GET one topic in the library → 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
    check("…but not its Excel export → 403", client.get(f"/teacher/library/{item[0]}/{item[1]}/export.xlsx", headers=obs).status_code == 403)
check("export path under library is closed even for a made-up topic → 403",
      client.get("/teacher/library/pecha_kucha/9-1/export.xlsx", headers=obs).status_code == 403)

section("Observer may read game data and the system pages")
open_gets = [
    "/teacher/game-records", "/teacher/pk-analytics", "/teacher/recordings", "/teacher/reports", "/teacher/feedback",
    "/learning/records/games", "/learning/sdg4/overview",
    "/teacher/metrics", "/teacher/visitors", "/teacher/system-info", "/teacher/db-schema", "/teacher/user-analytics",
]
for path in open_gets:
    r = client.get(path, headers=obs)
    check(f"GET {path} → 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

section("Observer sees nothing of 班級 (courses, rosters, accounts) and exports nothing")
closed_gets = [
    "/teacher/courses", f"/teacher/courses/{course_id}/roster", f"/teacher/courses/{course_id}/sessions",
    f"/teacher/courses/{course_id}/delete-preview", "/teacher/calendar", "/teacher/sessions/1/report",
    "/teacher/users", "/teacher/user-anomalies", "/teacher/chips",
    "/teacher/metrics.csv", "/teacher/recordings/download.zip", "/learning/records/export.xlsx", "/learning/sdg4/export.xlsx",
]
for path in closed_gets:
    r = client.get(path, headers=obs)
    check(f"GET {path} → 403", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

section("Observer can change nothing, not even what it may read")
writes = [
    ("PUT", "/teacher/speech", {"rules": []}), ("POST", "/teacher/speech/reset", {}), ("PUT", "/teacher/tts", {}),
    ("POST", "/teacher/courses", {"term": "1151", "code": "X", "name": "X"}),
    ("POST", "/teacher/library/pecha_kucha/9-1/publish", {}), ("PUT", "/teacher/library/pecha_kucha/9-1/draft", {"doc": {}}),
    ("POST", "/teacher/users/bulk", {"users": []}), ("POST", "/teacher/cards", {"sub_topic_id": 1, "difficulty_code": "A", "card_text": "x"}),
    ("DELETE", f"/teacher/courses/{course_id}", None),
]
for method, path, body in writes:
    r = client.request(method, path, json_body=body, headers=obs)
    check(f"{method} {path} → 403", r.status_code == 403, f"{r.status_code} {r.text[:120]}")
check("course still exists after the observer's delete", any(c["id"] == course_id for c in client.get("/teacher/courses", headers=admin).json()["courses"]))

section("Other roles unchanged")
check("teacher still opens courses", client.get("/teacher/courses", headers=tea).status_code == 200)
check("teacher still opens the roster", client.get(f"/teacher/courses/{course_id}/roster", headers=tea).status_code == 200)
check("student still cannot open the library", client.get("/teacher/library", headers=stu).status_code == 403)
check("anonymous cannot open the library", client.get("/teacher/library").status_code in (401, 403))
stu_id = next(u["id"] for u in client.get("/teacher/users", headers=admin).json()["users"] if u["email"] == "stu@example.com")
check("admin can switch a user to observer", client.patch(f"/teacher/users/{stu_id}/role", json={"role": "observer"}, headers=admin).status_code == 200)
check("…and that user can now read the library", client.get("/teacher/library", headers=stu).status_code == 200)
check("unknown role still rejected", client.patch(f"/teacher/users/{stu_id}/role", json={"role": "guest"}, headers=admin).status_code == 400)

print("\n" + ("ALL PASSED" if not failed else f"{len(failed)} FAILED: " + ", ".join(failed)))
sys.exit(1 if failed else 0)
