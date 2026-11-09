"""System resource and traffic log: one row per minute per server, kept (about 1,440 small rows a day).

What a row holds (table system_metrics):
  traffic   requests, by status class, 429s, slow ones (>= 3 s), average and 95th-percentile response time,
            distinct signed-in accounts and distinct devices (IP) in that minute, requests per API group
  machine   CPU %, load, memory used / total, this app's memory, disk used / total, network in / out
  database  size and open connections; the recordings folder size once an hour

How: every request adds to counters in Redis under the current minute (shared by all worker processes;
without Redis each process counts for itself). A thread in every worker wakes just after each minute;
the one that wins a Redis lock for that minute writes the row. CPU and network are measured as the
difference since the previous row, kept in Redis too, so it does not matter which worker writes.
Times are stored in UTC ("2026-11-18T01:23:00Z"); the teacher page shows Taiwan time.
"""
import csv, io, json, os, shutil, socket, threading, time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["metrics"])
D = SimpleNamespace()

SOURCE = (os.getenv("METRICS_SOURCE", "").strip() or ("railway" if os.getenv("RAILWAY_ENVIRONMENT") else socket.gethostname()))[:30]
ENABLED = os.getenv("METRICS_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}
AUDIO_DIR = os.getenv("AUDIO_DIR", "").strip()
EDGES = (50, 100, 200, 500, 1000, 2000, 5000)          # response-time buckets in ms (last bucket: above 5 s)
GROUPS = ("auth", "learning", "game", "content", "teacher", "me", "health", "pages", "static", "games", "other")
TW = timezone(timedelta(hours=8))
COLUMNS = ["requests", "s2xx", "s3xx", "s4xx", "s429", "s5xx", "slow", "lat_avg_ms", "lat_p95_ms", "users", "devices",
           "cpu_pct", "load1", "mem_used_mb", "mem_total_mb", "app_mem_mb", "disk_used_gb", "disk_total_gb",
           "net_rx_kb", "net_tx_kb", "db_size_mb", "db_conns", "audio_mb"]
SUMS = {"requests", "s2xx", "s3xx", "s4xx", "s429", "s5xx", "slow", "net_rx_kb", "net_tx_kb"}

_redis = None
_local = {}                     # minute -> counters, only when there is no Redis
_local_lock = threading.Lock()
_started = False


def configure(**deps):
    D.__dict__.update(deps)
    global _redis
    url = os.getenv("REDIS_URL", "").strip()
    if url:
        try:
            from redis import Redis
            _redis = Redis.from_url(url, socket_timeout=0.5, socket_connect_timeout=0.5, decode_responses=True)
        except Exception as error:
            print(f"[METRICS] no Redis, counting per process: {error}")
    init_db()


def init_db():
    conn = D.get_db()
    cur = conn.cursor()
    nums = ",\n            ".join(f"{c} REAL" for c in COLUMNS)
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS system_metrics (
            id {D.auto_pk_sql()},
            ts TEXT NOT NULL,
            source TEXT NOT NULL,
            {nums},
            groups_json TEXT,
            UNIQUE (ts, source)
        )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_system_metrics_ts ON system_metrics (ts)")
    conn.commit()
    conn.close()


# ── counting requests ──
def _group(path):
    seg = path.strip("/").split("/", 1)[0]
    return seg if seg in GROUPS else ("pages" if seg == "" else "other")


def record(path, status, ms, user_id=None, ip=None):
    """Called by the HTTP middleware for every request. Never raises."""
    if not ENABLED:
        return
    try:
        minute = int(time.time() // 60)
        cls = f"s{int(status) // 100}xx" if 200 <= int(status) < 600 else "other"
        bucket = next((i for i, e in enumerate(EDGES) if ms < e), len(EDGES))
        fields = {"requests": 1, cls: 1, f"b{bucket}": 1, f"g:{_group(path)}": 1}
        if int(status) == 429:
            fields["s429"] = 1
        if ms >= 3000:
            fields["slow"] = 1
        if _redis is not None:
            key = f"metrics:{SOURCE}:{minute}"
            p = _redis.pipeline(transaction=False)
            for k, v in fields.items():
                p.hincrby(key, k, v)
            p.hincrbyfloat(key, "lat_sum", round(ms, 2))
            if user_id:
                p.pfadd(key + ":u", str(user_id))
            if ip:
                p.pfadd(key + ":ip", str(ip))
            p.expire(key, 3 * 86400); p.expire(key + ":u", 3 * 86400); p.expire(key + ":ip", 3 * 86400)
            p.execute()
        else:
            with _local_lock:
                c = _local.setdefault(minute, {"lat_sum": 0.0, "u": set(), "ip": set()})
                for k, v in fields.items():
                    c[k] = c.get(k, 0) + v
                c["lat_sum"] += ms
                if user_id:
                    c["u"].add(user_id)
                if ip:
                    c["ip"].add(ip)
    except Exception:
        pass


def _counters(minute):
    if _redis is not None:
        key = f"metrics:{SOURCE}:{minute}"
        h = _redis.hgetall(key)
        c = {k: float(v) for k, v in h.items()}
        c["users"] = _redis.pfcount(key + ":u")
        c["devices"] = _redis.pfcount(key + ":ip")
        return c
    with _local_lock:
        c = _local.pop(minute, None) or {}
        for old in [m for m in _local if m < minute - 5]:
            _local.pop(old, None)
    out = {k: v for k, v in c.items() if k not in ("u", "ip")}
    out["users"] = len(c.get("u", ())); out["devices"] = len(c.get("ip", ()))
    return out


# ── the machine ──
def _read(path):
    try:
        with open(path) as f:
            return f.read()
    except Exception:
        return ""


def _cpu_times():
    line = _read("/proc/stat").split("\n", 1)[0].split()
    if not line or line[0] != "cpu":
        return None
    vals = [int(x) for x in line[1:]]
    idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
    return sum(vals), idle


def _net_bytes():
    rx = tx = 0
    for line in _read("/proc/net/dev").splitlines()[2:]:
        name, _, rest = line.partition(":")
        if name.strip() == "lo" or not rest:
            continue
        f = rest.split()
        rx += int(f[0]); tx += int(f[8])
    return rx, tx


def _state(name, now_value):
    """The previous sample of a counter (CPU, network), shared through Redis; stores the new one."""
    prev = None
    if _redis is not None:
        key = f"metrics:{SOURCE}:prev:{name}"
        raw = _redis.get(key)
        prev = json.loads(raw) if raw else None
        _redis.set(key, json.dumps(now_value), ex=3600)
    else:
        prev = D.__dict__.get("prev_" + name)
        D.__dict__["prev_" + name] = now_value
    return prev


def _machine(minute):
    m = {}
    cpu = _cpu_times()
    if cpu:
        prev = _state("cpu", cpu)
        if prev and cpu[0] > prev[0]:
            m["cpu_pct"] = round(100 * (1 - (cpu[1] - prev[1]) / (cpu[0] - prev[0])), 1)
    load = _read("/proc/loadavg").split()
    if load:
        m["load1"] = float(load[0])
    mem = {}
    for line in _read("/proc/meminfo").splitlines():
        k, _, v = line.partition(":")
        if v.strip():
            mem[k] = int(v.split()[0])
    if mem.get("MemTotal"):
        m["mem_total_mb"] = round(mem["MemTotal"] / 1024)
        m["mem_used_mb"] = round((mem["MemTotal"] - mem.get("MemAvailable", mem.get("MemFree", 0))) / 1024)
    app = _read("/sys/fs/cgroup/memory.current").strip() or _read("/sys/fs/cgroup/memory/memory.usage_in_bytes").strip()
    if app.isdigit():
        m["app_mem_mb"] = round(int(app) / 1048576)
    try:
        du = shutil.disk_usage("/")
        m["disk_used_gb"] = round(du.used / 1e9, 2); m["disk_total_gb"] = round(du.total / 1e9, 2)
    except Exception:
        pass
    net = _net_bytes()
    prev = _state("net", net)
    if prev and net[0] >= prev[0] and net[1] >= prev[1]:
        m["net_rx_kb"] = round((net[0] - prev[0]) / 1024, 1); m["net_tx_kb"] = round((net[1] - prev[1]) / 1024, 1)
    if AUDIO_DIR and minute % 60 == 0:
        total = 0
        for root, _, files in os.walk(AUDIO_DIR):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
        m["audio_mb"] = round(total / 1048576, 1)
    return m


def _database(cur):
    m = {}
    try:
        if D.use_postgres:
            cur.execute("SELECT pg_database_size(current_database()) AS b")
            m["db_size_mb"] = round(cur.fetchone()["b"] / 1048576, 1)
            cur.execute("SELECT COUNT(*) AS c FROM pg_stat_activity WHERE datname = current_database()")
            m["db_conns"] = cur.fetchone()["c"]
        elif D.sqlite_path:
            m["db_size_mb"] = round(os.path.getsize(D.sqlite_path) / 1048576, 1)
    except Exception:
        pass
    return m


def flush(minute):
    """Write the row for one finished minute (only one process does it, thanks to the lock)."""
    if _redis is not None and not _redis.set(f"metrics:{SOURCE}:lock:{minute}", "1", nx=True, ex=600):
        return False
    c = _counters(minute)
    n = c.get("requests", 0)
    row = {k: c.get(k, 0) for k in ("requests", "s2xx", "s3xx", "s4xx", "s429", "s5xx", "slow")}
    row["users"] = c.get("users", 0); row["devices"] = c.get("devices", 0)
    if n:
        row["lat_avg_ms"] = round(c.get("lat_sum", 0) / n, 1)
        need, seen = 0.95 * n, 0
        for i, edge in enumerate(EDGES + (10000,)):
            seen += c.get(f"b{i}", 0)
            if seen >= need:
                row["lat_p95_ms"] = edge
                break
    row.update(_machine(minute))
    groups = {k[2:]: int(v) for k, v in c.items() if k.startswith("g:")}
    ts = datetime.fromtimestamp(minute * 60, timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
    conn = D.get_db()
    cur = conn.cursor()
    row.update(_database(cur))
    cols = [k for k in COLUMNS if row.get(k) is not None]
    cur.execute(f"INSERT INTO system_metrics (ts, source, {', '.join(cols)}, groups_json) VALUES (?, ?, {', '.join('?' for _ in cols)}, ?) ON CONFLICT (ts, source) DO NOTHING",
                (ts, SOURCE, *[row[k] for k in cols], json.dumps(groups)))
    conn.commit()
    conn.close()
    return True


def _loop():
    while True:
        now = time.time()
        time.sleep(60 - (now % 60) + 2)            # 2 s after each minute ends
        try:
            flush(int(time.time() // 60) - 1)
        except Exception as error:
            print(f"[METRICS] flush failed: {error}")


def start():
    """Start the per-minute writer in this worker process (call once per process, after forking)."""
    global _started
    if _started or not ENABLED:
        return
    _started = True
    threading.Thread(target=_loop, name="metrics", daemon=True).start()


# ── reading it back (admin) ──
def _admin(authorization):
    user = D.require_teacher(authorization)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="admin only")
    return user


def _range(date_from, date_to):
    """Taiwan dates (inclusive) -> UTC timestamps for the ts column."""
    today = datetime.now(TW).date()
    try:
        d1 = datetime.strptime(date_from, "%Y-%m-%d").date() if date_from else today
        d2 = datetime.strptime(date_to, "%Y-%m-%d").date() if date_to else d1
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式要是 YYYY-MM-DD")
    if d2 < d1:
        d1, d2 = d2, d1
    if (d2 - d1).days > 120:
        raise HTTPException(status_code=400, detail="一次最多看 120 天")
    a = datetime.combine(d1, datetime.min.time(), TW).astimezone(timezone.utc)
    b = datetime.combine(d2 + timedelta(days=1), datetime.min.time(), TW).astimezone(timezone.utc)
    return a.strftime("%Y-%m-%dT%H:%M:00Z"), b.strftime("%Y-%m-%dT%H:%M:00Z"), d1, d2


def _rows(source, a, b):
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM system_metrics WHERE source = ? AND ts >= ? AND ts < ? ORDER BY ts", (source, a, b))
    rows = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT DISTINCT source FROM system_metrics")
    sources = sorted(r["source"] for r in cur.fetchall())
    conn.close()
    return rows, sources


@router.get("/teacher/metrics")
def metrics(date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"),
            source: str | None = None, step: int | None = None, authorization: str | None = Header(default=None)):
    _admin(authorization)
    a, b, d1, d2 = _range(date_from, date_to)
    src = source or SOURCE
    rows, sources = _rows(src, a, b)
    days = (d2 - d1).days + 1
    step = max(1, min(60, step or (1 if days == 1 else 5 if days <= 3 else 15 if days <= 14 else 60)))
    points, bucket, key = [], [], None
    def close():
        if not bucket:
            return
        p = {"ts": bucket[0]["ts"], "n": len(bucket)}
        for col in COLUMNS:
            vals = [r[col] for r in bucket if r.get(col) is not None]
            if not vals:
                p[col] = None
            elif col in SUMS:
                p[col] = round(sum(vals), 1)
            elif col in ("lat_avg_ms",):
                w = sum((r.get("requests") or 0) for r in bucket if r.get(col) is not None)
                p[col] = round(sum(r[col] * (r.get("requests") or 0) for r in bucket if r.get(col) is not None) / w, 1) if w else None
            else:
                p[col] = max(vals)
        points.append(p)
    for r in rows:
        t = datetime.strptime(r["ts"], "%Y-%m-%dT%H:%M:00Z")
        k = int(t.timestamp() // (60 * step))
        if k != key:
            close(); bucket = []; key = k
        bucket.append(r)
    close()
    peak = lambda col: max((r[col] for r in rows if r.get(col) is not None), default=None)
    groups = {}
    for r in rows:
        for g, v in json.loads(r.get("groups_json") or "{}").items():
            groups[g] = groups.get(g, 0) + v
    summary = {
        "minutes": len(rows), "requests": sum(r.get("requests") or 0 for r in rows),
        "errors_5xx": sum(r.get("s5xx") or 0 for r in rows), "limited_429": sum(r.get("s429") or 0 for r in rows),
        "slow": sum(r.get("slow") or 0 for r in rows),
        "peak_users": peak("users"), "peak_devices": peak("devices"), "peak_requests": peak("requests"),
        "peak_p95_ms": peak("lat_p95_ms"), "peak_cpu": peak("cpu_pct"), "peak_mem_mb": peak("mem_used_mb"),
        "mem_total_mb": peak("mem_total_mb"), "disk_used_gb": rows[-1].get("disk_used_gb") if rows else None,
        "disk_total_gb": rows[-1].get("disk_total_gb") if rows else None, "db_size_mb": rows[-1].get("db_size_mb") if rows else None,
        "audio_mb": next((r["audio_mb"] for r in reversed(rows) if r.get("audio_mb") is not None), None), "groups": groups,
        "first": rows[0]["ts"] if rows else None, "last": rows[-1]["ts"] if rows else None,
    }
    return {"source": src, "sources": sources or [src], "from": d1.isoformat(), "to": d2.isoformat(), "step": step, "points": points, "summary": summary}


@router.get("/teacher/metrics.csv")
def metrics_csv(date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"),
                source: str | None = None, authorization: str | None = Header(default=None)):
    _admin(authorization)
    a, b, d1, d2 = _range(date_from, date_to)
    rows, _ = _rows(source or SOURCE, a, b)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["time_taiwan", "time_utc", "source"] + COLUMNS + ["requests_by_group"])
    for r in rows:
        t = datetime.strptime(r["ts"], "%Y-%m-%dT%H:%M:00Z").replace(tzinfo=timezone.utc)
        w.writerow([t.astimezone(TW).strftime("%Y-%m-%d %H:%M"), r["ts"], r["source"]] + [r.get(c) for c in COLUMNS] + [r.get("groups_json") or ""])
    name = f"system-metrics-{source or SOURCE}-{d1.isoformat()}" + (f"_{d2.isoformat()}" if d2 != d1 else "") + ".csv"
    return StreamingResponse(iter(["﻿" + out.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})
