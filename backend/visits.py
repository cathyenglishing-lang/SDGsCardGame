"""Visitor log: who comes to the site (anonymous visitor id), from where, and whether they go on to play
or get an account — for finding prospective schools and teachers. No names.
POST /visit (anyone) · GET /teacher/visitors?days= (admin).

Region (owner, 2026-11-13: 訪客與潛在客戶要抓地區 IP 紀錄): every visit keeps the visitor's IP and its
approximate place — country, region, city — and the network it comes from (the ISP, or a school's own
network such as "National Central University"). Looked up on this server in the free DB-IP Lite
databases (CC BY 4.0, https://db-ip.com), so no IP is sent anywhere else. The files live in GEOIP_DIR
(dbip-city-lite.mmdb, dbip-asn-lite.mmdb; deploy/update-geoip.sh refreshes them monthly). Without
them the IP is still kept and the place is left empty. Only admins can read IPs."""
import hashlib, ipaddress, os, threading
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from types import SimpleNamespace
from urllib.parse import urlparse

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(tags=["visits"])
D = SimpleNamespace()
TW = timezone(timedelta(hours=8))
SALT = os.getenv("SECRET_KEY", "cardlearn")[:16]
GEOIP_DIR = os.getenv("GEOIP_DIR", "").strip() or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "geoip")
# DB-IP's names are English (its Chinese ones are simplified); the places visitors mostly come from, in 繁體.
COUNTRY_ZH = {"TW": "台灣", "JP": "日本", "US": "美國", "CN": "中國", "HK": "香港", "MO": "澳門", "KR": "韓國", "SG": "新加坡", "MY": "馬來西亞",
              "TH": "泰國", "VN": "越南", "PH": "菲律賓", "ID": "印尼", "IN": "印度", "AU": "澳洲", "NZ": "紐西蘭", "GB": "英國", "DE": "德國",
              "FR": "法國", "CA": "加拿大", "NL": "荷蘭", "IE": "愛爾蘭", "SE": "瑞典", "FI": "芬蘭"}
TW_PLACE = {"Taipei": "台北市", "New Taipei": "新北市", "Taoyuan": "桃園市", "Taichung": "台中市", "Tainan": "台南市", "Kaohsiung": "高雄市",
            "Keelung": "基隆市", "Hsinchu": "新竹", "Hsinchu County": "新竹縣", "Miaoli": "苗栗縣", "Changhua": "彰化縣", "Nantou": "南投縣",
            "Yunlin": "雲林縣", "Chiayi": "嘉義", "Chiayi County": "嘉義縣", "Pingtung": "屏東縣", "Yilan": "宜蘭縣", "Hualien": "花蓮縣",
            "Taitung": "台東縣", "Penghu": "澎湖縣", "Kinmen": "金門縣", "Lienchiang": "連江縣"}
_geo, _geo_lock = {}, threading.Lock()


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
    have = D.table_columns(cur, "site_visits")
    for name in ("ip", "country_code", "country", "region", "city", "org"):
        if name not in have:
            cur.execute(f"ALTER TABLE site_visits ADD COLUMN {name} TEXT")
    conn.commit()
    conn.close()


# ── where a visitor is ──
def _reader(kind):
    """The opened DB-IP database ('city' or 'asn'), or None when the file or the maxminddb package is missing."""
    with _geo_lock:
        if kind not in _geo:
            try:
                import maxminddb
                path = os.path.join(GEOIP_DIR, f"dbip-{kind}-lite.mmdb")
                _geo[kind] = maxminddb.open_database(path) if os.path.exists(path) else None
            except Exception as err:
                print(f"[VISITS] geoip {kind} not loaded: {err!r}")
                _geo[kind] = None
        return _geo[kind]


@lru_cache(maxsize=4096)
def locate(ip):
    """{country_code, country, region, city, org} for an IP; an empty dict when it cannot be told."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return {}
    if addr.is_private or addr.is_loopback or addr.is_link_local:
        return {"country_code": "", "country": "內部網路", "region": "", "city": "", "org": ""}
    out = {}
    city = _reader("city")
    if city:
        try:
            r = city.get(ip) or {}
            code = (r.get("country") or {}).get("iso_code") or ""
            region = ((r.get("subdivisions") or [{}])[0].get("names") or {}).get("en", "")
            town = ((r.get("city") or {}).get("names") or {}).get("en", "")
            out.update(country_code=code, country=COUNTRY_ZH.get(code) or ((r.get("country") or {}).get("names") or {}).get("en", ""),
                       region=TW_PLACE.get(region, region) if code == "TW" else region, city=town)
        except Exception:
            pass
    asn = _reader("asn")
    if asn:
        try:
            out["org"] = (asn.get(ip) or {}).get("autonomous_system_organization", "")
        except Exception:
            pass
    return out


def real_ip(request, fallback=None):
    """The visitor's address as the proxy in front of the app saw it. X-Real-IP is set by that proxy and
    replaces anything the browser sent; the first X-Forwarded-For entry could be typed by anyone."""
    ip = (request.headers.get("x-real-ip") or "").strip()
    if not ip:
        chain = [x.strip() for x in (request.headers.get("x-forwarded-for") or "").split(",") if x.strip()]
        ip = chain[-1] if chain else ((fallback(request) if fallback else (request.client.host if request.client else "")) or "")
    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return ""


def _place(r):
    region = r.get("region") if r.get("region") != r.get("country") else ""
    return " ".join(x for x in (r.get("country"), region, r.get("city")) if x)


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
    ip = real_ip(request, D.client_ip)
    geo = locate(ip) if ip else {}
    cut = lambda v, n: (v or "")[:n]
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("""INSERT INTO site_visits (at, vid, user_id, path, ref_host, utm_source, utm_medium, utm_campaign, guest, device, screen, lang, ip_hash,
                                            ip, country_code, country, region, city, org)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), cut(data.vid, 64), uid, cut(data.path, 160), ref, cut(data.utm_source, 80), cut(data.utm_medium, 80),
                 cut(data.utm_campaign, 80), 1 if data.guest else 0, _device(request.headers.get("user-agent")), cut(data.screen, 20), cut(data.lang, 20),
                 hashlib.sha256((SALT + ip).encode()).hexdigest()[:16] if ip else None, ip or None,
                 cut(geo.get("country_code"), 2) or None, cut(geo.get("country"), 60) or None, cut(geo.get("region"), 80) or None,
                 cut(geo.get("city"), 80) or None, cut(geo.get("org"), 120) or None))
    conn.commit()
    conn.close()
    return {"ok": True}


def _tally(items, key):
    out = {}
    for v in items:
        k = key(v)
        out[k] = out.get(k, 0) + 1
    return sorted(([k, n] for k, n in out.items()), key=lambda x: -x[1])


@router.get("/teacher/visitors")
def visitors(days: int = 30, authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    if user.get("role") not in ("admin", "observer"):   # observer: read-only, GET only (see main.observer_may)
        raise HTTPException(status_code=403, detail="admin only")
    days = max(1, min(365, days))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("""SELECT at, vid, user_id, path, ref_host, utm_source, utm_campaign, guest, device, ip, country, region, city, org
                   FROM site_visits WHERE at >= ? ORDER BY at""", (since,))
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
        vi = vids.setdefault(v, {"views": 0, "user": None, "src": None, "first": r["at"], "last": r["at"], "device": r["device"],
                                 "ips": [], "place": "", "org": "", "where": "", "guest": False, "paths": {}})
        vi["views"] += 1; vi["last"] = r["at"]
        if r["guest"]:
            vi["guest"] = True
        if r.get("ip") and r["ip"] not in vi["ips"]:
            vi["ips"].append(r["ip"])
        if r.get("country"):                           # the latest place seen for this visitor
            vi["place"], vi["org"] = _place(r), r.get("org") or ""
            vi["where"] = r["country"] + (" " + r["region"] if r.get("region") and r["region"] != r["country"] else "")
        vi["paths"][r["path"] or "?"] = vi["paths"].get(r["path"] or "?", 0) + 1
        if r["user_id"]:
            vi["user"] = r["user_id"]; accounts.add(v)
        src = r["utm_source"] or r["ref_host"]
        if src and not vi["src"]:
            vi["src"] = src
        pages[r["path"] or "?"] = pages.get(r["path"] or "?", 0) + 1
        devices[r["device"] or "other"] = devices.get(r["device"] or "other", 0) + 1
    for v in vids.values():
        sources[v["src"] or "直接進站"] = sources.get(v["src"] or "直接進站", 0) + 1
    anon = [{"first": v["first"], "last": v["last"], "views": v["views"], "source": v["src"] or "直接進站", "device": v["device"],
             "ips": v["ips"][:5], "place": v["place"], "org": v["org"], "guest": v["guest"],
             "pages": [p for p, _ in sorted(v["paths"].items(), key=lambda x: -x[1])][:4]} for v in vids.values() if not v["user"]]
    anon.sort(key=lambda x: -x["views"])
    recent = [{"at": r["at"], "ip": r.get("ip"), "place": _place(r), "org": r.get("org") or "", "path": r["path"],
               "source": r["utm_source"] or r["ref_host"] or "", "device": r["device"], "account": bool(r["user_id"]), "guest": bool(r["guest"])}
              for r in rows[-200:]][::-1]
    return {"days": days, "visitors": len(vids), "views": len(rows), "became_users": len(accounts), "guest_players": len(guests),
            "daily": [{"day": x["day"], "visitors": len(x["visitors"]), "new": len(x["new"]), "views": x["views"], "guests": len(x["guests"])} for x in sorted(by_day.values(), key=lambda x: x["day"])],
            "sources": sorted(([k, v] for k, v in sources.items()), key=lambda x: -x[1])[:15], "pages": sorted(([k, v] for k, v in pages.items()), key=lambda x: -x[1])[:15],
            "devices": sorted(([k, v] for k, v in devices.items()), key=lambda x: -x[1]), "prospects": anon[:100],
            # counted per visitor (one person seen 10 times counts once)
            "regions": _tally(vids.values(), lambda v: v["where"] or "不明（舊紀錄沒有地區）")[:30],
            "orgs": _tally(vids.values(), lambda v: v["org"] or "不明")[:30],
            "recent": recent, "geoip": bool(_reader("city")), "geoip_credit": "IP 地理位置資料：DB-IP.com（CC BY 4.0）"}
