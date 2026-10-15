"""Create class / demo accounts through the admin bulk endpoint and write them to a text file.

Usage (PowerShell):
  $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="..."
  python scripts/create_class_accounts.py --api https://web-production-ee62.up.railway.app --out demo-accounts.txt ^
      --prefix demo --domain cathylanguagehub.com --count 10 [--admin-email x@y --admin-password ...]

The output file contains passwords: keep it out of git (demo-accounts.txt is ignored) and share it
only with the people who need it. Accounts made this way skip e-mail verification, so password
reset by e-mail will not work for them; the admin resets them from the dashboard instead.
"""
import argparse, json, os, sys, urllib.request, urllib.error

def call(api, path, body, token=None):
    req = urllib.request.Request(api.rstrip("/") + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{path} failed: {e.code} {e.read().decode(errors='replace')[:300]}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--out", default="demo-accounts.txt")
    ap.add_argument("--prefix", default="demo")
    ap.add_argument("--domain", default="cathylanguagehub.com")
    ap.add_argument("--count", type=int, default=10)
    ap.add_argument("--password-base", default="Harbor2026")
    ap.add_argument("--admin-email", help="also create this admin account")
    ap.add_argument("--admin-password")
    ap.add_argument("--admin-name", default="Cathy Admin")
    a = ap.parse_args()
    login_email, login_pw = os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD")
    if not login_email or not login_pw:
        sys.exit("set ADMIN_EMAIL and ADMIN_PASSWORD (an existing admin) in the environment")
    token = call(a.api, "/auth/login", {"email": login_email, "password": login_pw})["access_token"]
    users = [{"name": f"Student {i:02d}", "email": f"{a.prefix}{i:02d}@{a.domain}", "password": f"{a.password_base}-{i:02d}", "role": "student"} for i in range(1, a.count + 1)]
    if a.admin_email and a.admin_password:
        users.append({"name": a.admin_name, "email": a.admin_email, "password": a.admin_password, "role": "admin"})
    res = call(a.api, "/teacher/users/bulk", {"users": users}, token)
    lines = [f"CardLearn SDGs demo accounts  ({a.api})", "login: https://www.cathylanguagehub.com", ""]
    for u in users:
        status = "created" if any(c["email"] == u["email"] for c in res["created"]) else "skipped: " + next((s["reason"] for s in res["skipped"] if s["email"] == u["email"]), "?")
        lines.append(f"{u['role']:8s} {u['email']:40s} {u['password']:20s} {status}")
    open(a.out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nwritten {a.out}: created {len(res['created'])}, skipped {len(res['skipped'])}")

if __name__ == "__main__":
    main()
