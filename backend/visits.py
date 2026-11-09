"""Visitor log: who comes to the site (anonymous visitor id), from where, and whether they go on to play
or get an account — for finding prospective schools and teachers. No names; IPs are stored hashed.
POST /visit (anyone) · GET /teacher/visitors?days= (admin)."""
import hashlib, os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import urlparse

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(tags=["visits"])
D = SimpleNamespace()
TW = timezone(timedelta(hours=8))
SALT = os.getenv("SECRET_KEY", "cardlearn")[:16]


def configure(**deps):
    D.__dict__.update(deps)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS site_visits (
            id {D.auto_pk_sql()},
            at TEXT NOT NULL,
            vid TEXT,
            user_id INTEGER,
            path TEXT,
            ref_host TEXT,
            utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
            guest INTEGER,
            device TEXT,
            screen TEXT,
            lang TEXT,
            ip_hash TEXT
        )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_site_visits_at ON site_visits (at)")
    conn.commit()
    conn.close()


class VisitIn(BaseModel):
    vid: str | None = None
    path: str | None = None
    ref: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    guest: bool | None = None
    screen: str | None = None
    lang: str | None = None


def _device(ua):
    ua = ua or ""
    return ("iPad" if "iPad" in ua else "iPhone" if "iPhone" in ua else "Android" if "Android" in ua else "Windows" if "Windows" in ua
            else "Mac" if "Mac" in ua else "ChromeOS" if "CrOS" in ua else "Linux" if "Linux" in ua else "other")


@router.post("/visit")
def visit(data: VisitIn, request: Request, authorization: str | None = Header(default=None)):
    uid = None
    if authorization:
        try:
            uid = D.get_current_user(authorization).get("id")
        except Exception:
            uid = None
    ref = urlparse(data.ref or "").netloc[:120] if data.ref else ""
    own = request.url.hostname or ""
    if ref and own and ref.endswith(own.replace("www.", "")):
        ref = ""                                   # moving around inside the site is not a referrer
    ip = D.client_ip(request) or ""
    cut = lambda v, n: (v or "")[:n]
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO site_visits (at, vid, user_id, path, ref_host, utm_source, utm_medium, utm_campaign, guest, device, screen, lang, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), cut(data.vid, 64), uid, cut(data.path, 160), ref, cut(data.utm_source, 80), cut(data.utm_medium, 80),
                 cut(data.utm_campaign, 80), 1 if data.guest else 0, _device(request.headers.get("user-agent")), cut(data.screen, 20), cut(data.lang, 20),
                 hashlib.sha256((SALT + ip).encode()).hexdigest()[:16] if ip else None))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/teacher/visitors")
def visitors(days: int = 30, authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="admin only")
    days = max(1, min(365, days))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT at, vid, user_id, path, ref_host, utm_source, utm_campaign, guest, device FROM site_visits WHERE at >= ? ORDER BY at", (since,))
    rows = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT vid, MIN(at) AS first FROM site_visits WHERE vid IS NOT NULL GROUP BY vid")
    first_seen = {r["vid"]: r["first"] for r in cur.fetchall()}
    conn.close()
    day = lambda ts: datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(TW).strftime("%Y-%m-%d")
    by_day, vids, accounts, guests, sources, pages, devices = {}, {}, set(), set(), {}, {}, {}
    for r in rows:
        d = day(r["at"]); v = r["vid"] or "?"
        x = by_day.setdefault(d, {"day": d, "visitors": set(), "new": set(), "views": 0, "guests": set()})
        x["visitors"].add(v); x["views"] += 1
        if first_seen.get(v, "")[:10] and day(first_seen[v]) == d:
            x["new"].add(v)
        if r["guest"]:
            x["guests"].add(v); guests.add(v)
        vi = vids.setdefault(v, {"views": 0, "user": None, "src": None, "first": r["at"], "last": r["at"], "device": r["device"]})
        vi["views"] += 1; vi["last"] = r["at"]
        if r["user_id"]:
            vi["user"] = r["user_id"]; accounts.add(v)
        src = r["utm_source"] or r["ref_host"]
        if src and not vi["src"]:
            vi["src"] = src
        pages[r["path"] or "?"] = pages.get(r["path"] or "?", 0) + 1
        devices[r["device"] or "other"] = devices.get(r["device"] or "other", 0) + 1
    for v in vids.values():
        sources[v["src"] or "直接進站"] = sources.get(v["src"] or "直接進站", 0) + 1
    anon = [{"first": v["first"], "last": v["last"], "views": v["views"], "source": v["src"] or "直接進站", "device": v["device"]} for k, v in vids.items() if not v["user"]]
    anon.sort(key=lambda x: -x["views"])
    return {"days": days, "visitors": len(vids), "views": len(rows), "became_users": len(accounts), "guest_players": len(guests),
            "daily": [{"day": x["day"], "visitors": len(x["visitors"]), "new": len(x["new"]), "views": x["views"], "guests": len(x["guests"])} for x in sorted(by_day.values(), key=lambda x: x["day"])],
            "sources": sorted(([k, v] for k, v in sources.items()), key=lambda x: -x[1])[:15], "pages": sorted(([k, v] for k, v in pages.items()), key=lambda x: -x[1])[:15],
            "devices": sorted(([k, v] for k, v in devices.items()), key=lambda x: -x[1]), "prospects": anon[:40]}
