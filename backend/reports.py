"""Personal learning reports a teacher sends to students (a self-contained HTML page per student).

Teacher: POST /teacher/reports/send {user_ids, note, game}  → builds one report per student from the
         same numbers the teacher sees (learning_reports.student_report) and stores it.
         GET  /teacher/reports?user_id=                    → what was sent, and whether it was opened.
Student: GET  /me/reports                                  → my reports (newest first), with unseen count
         GET  /me/reports/{id}                             → the HTML (marks it opened)
The HTML is built here with every value escaped; the student page shows it in a sandboxed iframe.
"""
import html, json
from collections import Counter
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["reports"])
D = SimpleNamespace()
TW = timezone(timedelta(hours=8))
GAME_ZH = {"pecha_kucha": "Card Game 卡牌遊戲", "innovation-harbor": "3D Harbor", "sdg4-stage": "SDG 4 Stage"}


def configure(**deps):
    D.__dict__.update(deps)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS student_reports (
            id {D.auto_pk_sql()},
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            html TEXT NOT NULL,
            note TEXT,
            created_by INTEGER,
            created_at TEXT NOT NULL,
            seen_at TEXT
        )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_student_reports_user ON student_reports (user_id)")
    conn.commit()
    conn.close()
    _init_feedback()


class SendIn(BaseModel):
    user_ids: list[int]
    note: str | None = None


e = lambda v: html.escape(str(v if v is not None else ""))


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def build_html(d, note, teacher_name, titles):
    """The report page: one screen of what the student did, how it went, and what to practise next."""
    st, t, prof = d["student"], d["totals"], d.get("profile") or {}
    topics = d.get("card_topics") or []
    scores = [(s.get("at"), _num(s.get("score")), f"{x['chapter']} {x['level']}") for x in topics for s in (x.get("scores") or []) if _num(s.get("score")) is not None]
    scores.sort(key=lambda s: str(s[0]))
    best = max((s[1] for s in scores), default=None)
    first, last = (scores[0][1], scores[-1][1]) if scores else (None, None)
    now = datetime.now(TW).strftime("%Y-%m-%d")
    # score line
    svg = ""
    if len(scores) >= 2:
        W, H = 560, 150
        pts = [(16 + i * (W - 32) / (len(scores) - 1), 12 + (1 - s[1] / 100) * (H - 30)) for i, s in enumerate(scores)]
        svg = (f'<svg viewBox="0 0 {W} {H}" class="line"><polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" />'
               + "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4"><title>{e(s[2])}：{e(s[1])}</title></circle>' for (x, y), s in zip(pts, scores))
               + f'<text x="16" y="{H - 4}">第一次</text><text x="{W - 16}" y="{H - 4}" text-anchor="end">最近一次</text></svg>')
    bars = "".join(f'<div class="bar"><span>{e(x["chapter"])} {e(titles.get(x["chapter"], ""))} <small>{e(x["level"])}</small></span><i><b style="width:{max(2, _num(x.get("best")) or 0)}%"></b></i><em>{e(x.get("best"))}</em></div>'
                   for x in topics if _num(x.get("best")) is not None)
    weak = d.get("weak_cards") or []
    practise = "".join(f'<li><b>{e(w.get("title") or w.get("card"))}</b><span>{e(w.get("script") or "")}</span><small>{e(w.get("plays"))} 次裡有 {e(w.get("misses"))} 次第一次沒配對到</small></li>' for w in weak[:6])
    growth = f"從 {first} 分進步到 {last} 分" if first is not None and last is not None and last > first else (f"最好的一次是 {best} 分" if best is not None else "")
    games = "、".join(f'{e(GAME_ZH.get(g["game"], g.get("name") or g["game"]))} {e(g["runs"])} 局' for g in d.get("by_game") or [])
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(st.get("name"))} 的學習報告</title><style>
:root{{--night:#070b24;--indigo:#1e1b4b;--gold:#e8b949;--gold-hi:#fde68a;--ivory:#fbf7ee;--ink:#1a1633;--ok:#34d399;--violet:#8b5cf6}}
*{{box-sizing:border-box}}body{{margin:0;font-family:"Noto Sans TC",system-ui,sans-serif;color:#fff;background:radial-gradient(ellipse at 50% 0%,#2d2580 0%,var(--indigo) 40%,var(--night) 100%);min-height:100vh}}
.wrap{{max-width:860px;margin:0 auto;padding:28px 18px 48px}}
header{{text-align:center;padding:10px 0 18px}}header small{{color:#a5b4fc;font-weight:700;letter-spacing:.08em}}
h1{{margin:6px 0 4px;font-size:34px;color:var(--gold-hi);text-shadow:0 0 26px rgba(232,185,73,.6)}}header p{{margin:0;color:#c7d2fe}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}}
.card{{background:var(--ivory);color:var(--ink);border-radius:16px;padding:16px 14px;text-align:center;box-shadow:0 14px 28px rgba(0,0,0,.4)}}
.card b{{display:block;font-size:30px;line-height:1.1}}.card span{{font-size:13px;color:#4b5563}}
.panel{{background:rgba(255,255,255,.06);border:1px solid rgba(232,185,73,.3);border-radius:18px;padding:18px;margin:14px 0}}
.panel h2{{margin:0 0 10px;font-size:18px;color:var(--gold-hi)}}
.growth{{font-size:18px;font-weight:800;color:var(--ok)}}
.line{{width:100%;height:auto}}.line polyline{{fill:none;stroke:var(--gold);stroke-width:3}}.line circle{{fill:var(--gold-hi)}}.line text{{fill:#a5b4fc;font-size:11px}}
.bar{{display:grid;grid-template-columns:minmax(120px,40%) 1fr 40px;gap:10px;align-items:center;margin:8px 0;font-size:14px}}
.bar small{{color:#a5b4fc}}.bar i{{height:12px;border-radius:12px;background:rgba(255,255,255,.12);overflow:hidden}}.bar i b{{display:block;height:100%;border-radius:12px;background:linear-gradient(90deg,#22d3ee,var(--violet))}}.bar em{{font-style:normal;font-weight:800}}
ul.practise{{list-style:none;padding:0;margin:0;display:grid;gap:10px}}ul.practise li{{background:var(--ivory);color:var(--ink);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}}
ul.practise span{{font-family:Georgia,serif}}ul.practise small{{color:#6b7280}}
.note{{background:linear-gradient(135deg,rgba(139,92,246,.35),rgba(99,102,241,.25));border:1px solid rgba(196,181,253,.5)}}.note p{{white-space:pre-wrap;margin:0;font-size:15.5px;line-height:1.7}}
footer{{text-align:center;color:#a5b4fc;font-size:12.5px;margin-top:22px}}
</style></head><body><div class="wrap">
<header><small>CARDLEARN SDGs · 學習報告</small><h1>{e(st.get("name"))}</h1><p>{e(prof.get("class_name") or "")} {e(st.get("student_no") or "")} · {now}</p></header>
<div class="cards"><div class="card"><b>{e(t.get("runs"))}</b><span>玩了幾局</span></div><div class="card"><b>{e(best if best is not None else "–")}</b><span>最好的聽懂分數</span></div>
<div class="card"><b>{e(t.get("active_minutes"))}</b><span>專心學習的分鐘</span></div><div class="card"><b>{e(prof.get("recordings", 0))}</b><span>送出的錄音</span></div><div class="card"><b>{e(prof.get("chips", 0))}</b><span>籌碼</span></div></div>
{f'<section class="panel note"><h2>老師的話</h2><p>{e(note)}</p></section>' if note else ""}
{f'<section class="panel"><h2>你的進步</h2><p class="growth">{e(growth)}</p>{svg}</section>' if scores else ""}
{f'<section class="panel"><h2>每個主題最好的分數</h2>{bars}</section>' if bars else ""}
{f'<section class="panel"><h2>下次先練這幾句</h2><ul class="practise">{practise}</ul></section>' if practise else ""}
{f'<section class="panel"><h2>玩過的遊戲</h2><p>{games}</p></section>' if games else ""}
<footer>由 {e(teacher_name)} 傳送 · 分數是「聽懂分數」：只看每張卡第一次放的位置，並扣掉用猜的機率</footer>
</div></body></html>"""


def _material():
    """Topic names and each slide's title and script as published, for the report text."""
    titles, cards = {}, {}
    conn = D.get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT topic_id, published_json FROM content_topics WHERE game = 'pecha_kucha'")
        for r in cur.fetchall():
            doc = json.loads(r["published_json"] or "{}")
            titles[r["topic_id"]] = doc.get("title_en") or ""
            for level, slides in (doc.get("levels") or {}).items():
                for sl in slides:
                    cards[f"{r['topic_id']}/{level}/s{int(sl.get('no') or 0):02d}"] = {"title": sl.get("title_en") or "", "script": sl.get("script") or ""}
    except Exception:
        pass
    conn.close()
    return titles, cards


@router.post("/teacher/reports/send")
def send(data: SendIn, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    ids = list(dict.fromkeys(int(i) for i in data.user_ids))[:400]
    if not ids:
        raise HTTPException(status_code=400, detail="沒有選學生")
    note = (data.note or "").strip()[:2000]
    titles, cards = _material()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sent, skipped = [], []
    conn = D.get_db()
    cur = conn.cursor()
    for uid in ids:
        try:
            d = D.student_report(uid, None, None, authorization)
        except HTTPException:
            skipped.append(uid); continue
        for w in d.get("weak_cards") or []:
            w.update(cards.get(w.get("card"), {}))
        doc = build_html(d, note, teacher.get("name") or "老師", titles)
        title = f"{datetime.now(TW).strftime('%m/%d')} 學習報告"
        cur.execute("INSERT INTO student_reports (user_id, title, html, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", (uid, title, doc, note or None, teacher.get("id"), now))
        sent.append(uid)
    conn.commit()
    conn.close()
    return {"sent": len(sent), "skipped": skipped}


@router.get("/teacher/reports")
def sent_reports(user_id: int | None = None, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT r.id, r.user_id, r.title, r.note, r.created_at, r.seen_at, u.name FROM student_reports r LEFT JOIN users u ON u.id = r.user_id"
                + (" WHERE r.user_id = ?" if user_id else "") + " ORDER BY r.created_at DESC LIMIT 300", (user_id,) if user_id else ())
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"reports": rows}


@router.get("/me/reports")
def my_reports(authorization: str | None = Header(default=None)):
    me = D.get_current_user(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, title, note, created_at, seen_at FROM student_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", (me["id"],))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"reports": rows, "unseen": sum(1 for r in rows if not r["seen_at"])}


@router.get("/me/reports/{report_id}")
def my_report(report_id: int, authorization: str | None = Header(default=None)):
    me = D.get_current_user(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, user_id, title, html, seen_at FROM student_reports WHERE id = ?", (report_id,))
    r = cur.fetchone()
    if not r or r["user_id"] != me["id"]:
        conn.close()
        raise HTTPException(status_code=404, detail="找不到這份報告")
    if not r["seen_at"]:
        cur.execute("UPDATE student_reports SET seen_at = ? WHERE id = ?", (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), report_id))
        conn.commit()
    conn.close()
    return {"id": r["id"], "title": r["title"], "html": r["html"]}


# ── teacher feedback (評語) and sending reports by email ──
# A comment is a draft per student until it is sent with a report; sending puts the report in the student's
# 「我的報告」 and, if asked, emails it. Emails go out in a background thread (Resend allows a few per
# second), and each report row keeps its own delivery status, so the page can show progress and retry failures.
import threading, time, uuid, os, urllib.request as _rq, urllib.error as _re

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM = os.getenv("RESEND_FROM", "").strip() or os.getenv("SMTP_FROM", "").strip()
SITE = (os.getenv("PUBLIC_SITE_URL", "").strip() or "https://www.cathylanguagehub.com").rstrip("/")


def _init_feedback():
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS student_feedback (
            user_id INTEGER PRIMARY KEY,
            text TEXT NOT NULL,
            updated_by INTEGER,
            updated_at TEXT NOT NULL,
            sent_at TEXT
        )""")
    conn.commit()
    for col, typ in (("batch_id", "TEXT"), ("email_to", "TEXT"), ("email_status", "TEXT"), ("email_error", "TEXT"), ("emailed_at", "TEXT")):
        if D.use_postgres:
            cur.execute(f"ALTER TABLE student_reports ADD COLUMN IF NOT EXISTS {col} {typ}")
            conn.commit()
        else:
            try:
                cur.execute(f"ALTER TABLE student_reports ADD COLUMN {col} {typ}")
                conn.commit()
            except Exception:
                pass
    conn.close()


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class FeedbackIn(BaseModel):
    text: str


class BulkFeedbackIn(BaseModel):
    user_ids: list[int]
    text: str
    mode: str = "replace"          # replace | append


class SendV2In(BaseModel):
    user_ids: list[int]
    note: str | None = None        # one message for everyone (used when use_feedback is off, or a student has no comment)
    use_feedback: bool = True      # each student's own 評語
    email: bool = False


def _feedback(cur, ids=None):
    if ids is not None and not ids:
        return {}
    if ids is None:
        cur.execute("SELECT user_id, text, updated_at, sent_at FROM student_feedback")
    else:
        cur.execute(f"SELECT user_id, text, updated_at, sent_at FROM student_feedback WHERE user_id IN ({', '.join('?' for _ in ids)})", tuple(ids))
    return {r["user_id"]: dict(r) for r in cur.fetchall()}


@router.get("/teacher/feedback")
def get_feedback(authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db(); cur = conn.cursor()
    out = _feedback(cur)
    conn.close()
    return {"feedback": {str(k): v for k, v in out.items()}, "email_ready": bool(RESEND_API_KEY and RESEND_FROM)}


@router.put("/teacher/feedback/{user_id}")
def put_feedback(user_id: int, data: FeedbackIn, authorization: str | None = Header(default=None)):
    t = D.require_teacher(authorization)
    text = data.text.strip()[:2000]
    conn = D.get_db(); cur = conn.cursor()
    if text:
        cur.execute("INSERT INTO student_feedback (user_id, text, updated_by, updated_at, sent_at) VALUES (?, ?, ?, ?, NULL) "
                    "ON CONFLICT (user_id) DO UPDATE SET text = excluded.text, updated_by = excluded.updated_by, updated_at = excluded.updated_at, sent_at = NULL",
                    (user_id, text, t.get("id"), _now()))
    else:
        cur.execute("DELETE FROM student_feedback WHERE user_id = ?", (user_id,))
    conn.commit(); conn.close()
    return {"ok": True}


@router.post("/teacher/feedback/bulk")
def bulk_feedback(data: BulkFeedbackIn, authorization: str | None = Header(default=None)):
    t = D.require_teacher(authorization)
    text = data.text.strip()[:2000]
    if not text:
        raise HTTPException(status_code=400, detail="評語是空的")
    ids = list(dict.fromkeys(int(i) for i in data.user_ids))[:400]
    conn = D.get_db(); cur = conn.cursor()
    old = _feedback(cur, ids)
    for uid in ids:
        new = (old[uid]["text"] + "\n" + text) if data.mode == "append" and uid in old else text
        cur.execute("INSERT INTO student_feedback (user_id, text, updated_by, updated_at, sent_at) VALUES (?, ?, ?, ?, NULL) "
                    "ON CONFLICT (user_id) DO UPDATE SET text = excluded.text, updated_by = excluded.updated_by, updated_at = excluded.updated_at, sent_at = NULL",
                    (uid, new[:2000], t.get("id"), _now()))
    conn.commit(); conn.close()
    return {"updated": len(ids)}


@router.post("/teacher/reports/preview")
def preview(data: SendV2In, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    uid = data.user_ids[0] if data.user_ids else None
    if not uid:
        raise HTTPException(status_code=400, detail="沒有選學生")
    conn = D.get_db(); cur = conn.cursor()
    fb = _feedback(cur, [uid]); conn.close()
    note = (fb.get(uid, {}).get("text") if data.use_feedback else None) or (data.note or "")
    d = D.student_report(uid, None, None, authorization)
    titles, cards = _material()
    for w in d.get("weak_cards") or []:
        w.update(cards.get(w.get("card"), {}))
    return {"html": build_html(d, note.strip(), teacher.get("name") or "老師", titles), "name": d["student"].get("name")}


def _email(to, subject, html_doc, text):
    if not (RESEND_API_KEY and RESEND_FROM):
        return False, "這台伺服器還沒設定寄信（RESEND_API_KEY）"
    body = json.dumps({"from": RESEND_FROM, "to": [to], "subject": subject, "html": html_doc, "text": text}).encode()
    req = _rq.Request("https://api.resend.com/emails", data=body, method="POST",
                      headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json", "User-Agent": "CardLearn-SDGs/1.0"})
    try:
        with _rq.urlopen(req, timeout=20) as r:
            return True, json.loads(r.read() or b"{}").get("id", "")
    except _re.HTTPError as e:
        return False, f"{e.code} {e.read().decode(errors='replace')[:180]}"
    except Exception as e:
        return False, str(e)[:180]


def _send_batch(batch_id):
    """Email every queued report of one batch, a little apart (provider rate limit), recording each result."""
    conn = D.get_db(); cur = conn.cursor()
    cur.execute("SELECT r.id, r.title, r.html, r.email_to, u.name FROM student_reports r LEFT JOIN users u ON u.id = r.user_id WHERE r.batch_id = ? AND r.email_status = 'queued'", (batch_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    for r in rows:
        ok, info = _email(r["email_to"], f"{r['name'] or ''} 的 CardLearn SDGs {r['title']}",
                          r["html"].replace("</footer>", f'<br><a href="{SITE}/pages/my_report.html?id={r["id"]}" style="color:#fde68a">在網站上打開這份報告</a></footer>', 1),
                          f"{r['name'] or ''} 同學好，老師傳了一份學習報告給你。請到 {SITE}/pages/my_report.html?id={r['id']} 登入後查看。")
        conn = D.get_db(); cur = conn.cursor()
        cur.execute("UPDATE student_reports SET email_status = ?, email_error = ?, emailed_at = ? WHERE id = ?", ("sent" if ok else "failed", None if ok else info, _now(), r["id"]))
        conn.commit(); conn.close()
        time.sleep(0.6)


@router.post("/teacher/reports/send-v2")
def send_v2(data: SendV2In, authorization: str | None = Header(default=None)):
    teacher = D.require_teacher(authorization)
    ids = list(dict.fromkeys(int(i) for i in data.user_ids))[:400]
    if not ids:
        raise HTTPException(status_code=400, detail="沒有選學生")
    if data.email and not (RESEND_API_KEY and RESEND_FROM):
        raise HTTPException(status_code=400, detail="這台伺服器還沒設定寄信，先取消「寄到學生信箱」，報告一樣會放進學生的「我的報告」。")
    titles, cards = _material()
    batch = uuid.uuid4().hex[:12]
    conn = D.get_db(); cur = conn.cursor()
    fb = _feedback(cur, ids)
    cur.execute(f"SELECT id, email FROM users WHERE id IN ({', '.join('?' for _ in ids)})", tuple(ids))
    emails = {r["id"]: r["email"] for r in cur.fetchall()}
    made, skipped, now = 0, [], _now()
    for uid in ids:
        try:
            d = D.student_report(uid, None, None, authorization)
        except HTTPException:
            skipped.append(uid); continue
        for w in d.get("weak_cards") or []:
            w.update(cards.get(w.get("card"), {}))
        note = ((fb.get(uid, {}).get("text") if data.use_feedback else None) or (data.note or "")).strip()[:2000]
        doc = build_html(d, note, teacher.get("name") or "老師", titles)
        to = emails.get(uid) if data.email else None
        cur.execute("INSERT INTO student_reports (user_id, title, html, note, created_by, created_at, batch_id, email_to, email_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (uid, f"{datetime.now(TW).strftime('%m/%d')} 學習報告", doc, note or None, teacher.get("id"), now, batch, to, "queued" if to else None))
        if uid in fb and data.use_feedback:
            cur.execute("UPDATE student_feedback SET sent_at = ? WHERE user_id = ?", (now, uid))
        made += 1
    conn.commit(); conn.close()
    if data.email and made:
        threading.Thread(target=_send_batch, args=(batch,), daemon=True).start()
    return {"batch": batch, "sent": made, "skipped": skipped, "emailing": bool(data.email)}


@router.get("/teacher/reports/batch/{batch_id}")
def batch_status(batch_id: str, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db(); cur = conn.cursor()
    cur.execute("SELECT r.id, r.user_id, u.name, r.email_to, r.email_status, r.email_error FROM student_reports r LEFT JOIN users u ON u.id = r.user_id WHERE r.batch_id = ?", (batch_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"rows": rows, "queued": sum(1 for r in rows if r["email_status"] == "queued"), "sent": sum(1 for r in rows if r["email_status"] == "sent"),
            "failed": sum(1 for r in rows if r["email_status"] == "failed")}


@router.post("/teacher/reports/batch/{batch_id}/retry")
def batch_retry(batch_id: str, authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db(); cur = conn.cursor()
    cur.execute("UPDATE student_reports SET email_status = 'queued', email_error = NULL WHERE batch_id = ? AND email_status = 'failed'", (batch_id,))
    conn.commit(); conn.close()
    threading.Thread(target=_send_batch, args=(batch_id,), daemon=True).start()
    return {"ok": True}
