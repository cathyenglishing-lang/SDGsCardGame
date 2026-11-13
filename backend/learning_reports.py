"""The teacher's learning records: every game, every student, every run, down to single events.

Three ways in (all teacher/admin only), each filterable by course, class, topic, level and dates:
  GET /learning/records/games                  which games have data, how much, when last played
  GET /learning/records/game?game=…            one game → the whole class: per-student rows (students
                                               with no run included), per-card difficulty, confusions,
                                               the funnel through the wrap-up, where runs were left
  GET /learning/records/student/{user_id}      one student → everything played in every game, score
                                               history, weak sentences, quiz words, reflections, read-aloud
  GET /learning/records/run/{run_id}           one run → card by card, wrap-up answers, the raw event log
  GET /learning/records/export.xlsx            the same data as an Excel workbook
Names, student numbers and class come from the platform database through learning._auth["people"];
the learning database itself only holds user ids.
"""
from __future__ import annotations

import io
import json
from collections import Counter, defaultdict
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, Query, Response

from backend import learning as L

router = APIRouter(prefix="/learning/records", tags=["learning records"])
CARD = L.CARD_GAME
GAME_NAMES = {CARD: "Pecha Kucha Card Game", "innovation-harbor": "Innovation Harbor 3D", "sdg4-stage": "SDG 4 Pecha Kucha Stage"}
IDLE_GAP_MS = 90_000      # KPI 8: a pause longer than this is not learning time


# ── loading ──
def _where(game=None, course_id=None, section_id=None, chapter=None, level=None, date_from=None, date_to=None, user_id=None, run_id=None):
    where, params = [], []
    for col, val in (("game", game), ("course_id", course_id), ("section_id", section_id), ("chapter", chapter), ("level", level), ("user_id", user_id), ("id", run_id)):
        if val not in (None, ""):
            where.append(f"r.{col} = ?"); params.append(val)
    if date_from:
        where.append("r.started_at >= ?"); params.append(date_from)
    if date_to:
        where.append("r.started_at <= ?"); params.append(date_to + "T23:59:59")
    return (" WHERE " + " AND ".join(where)) if where else "", params


def _runs(cur, **filters):
    where, params = _where(**filters)
    cur.execute(f"SELECT r.* FROM learning_runs r{where} ORDER BY r.started_at", params)
    runs = []
    for r in cur.fetchall():
        d = dict(r)
        for k in ("vars_json", "stars_json", "metrics_json", "route_json"):
            d[k.replace("_json", "")] = L._loads(d.pop(k), {} if k != "route_json" else [])
        runs.append(d)
    return runs


def _events(cur, run_ids):
    out = defaultdict(list)
    for i in range(0, len(run_ids), 400):
        chunk = run_ids[i:i + 400]
        cur.execute(f"SELECT run_id, seq, t_ms, stage, type, detail, data_json, created_at FROM learning_events WHERE run_id IN ({','.join('?' for _ in chunk)}) ORDER BY run_id, seq", tuple(chunk))
        for e in cur.fetchall():
            d = dict(e); d["data"] = L.clean_data(L._loads(d.pop("data_json"), None)); out[d["run_id"]].append(d)
    return out


def topic_key(t):
    """'9-2' before '9-10' before '13-1': topic ids sort by their numbers, not as text."""
    return [int(x) if x.isdigit() else 10 ** 6 for x in str(t or "").split("-")] + [str(t or "")]


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _scored(run, evs):
    """Card detail and score of one run, or None when its events cannot be read (a damaged or forged
    run is left out of the totals instead of breaking the whole report)."""
    try:
        return card_detail(evs), L.score_events(evs)
    except Exception as err:
        print(f"[RECORDS] run {run.get('id')} skipped: {err!r}")
        return None


def _people(course_id=None, section_id=None):
    return L._auth["people"](course_id, section_id) if L._auth.get("people") else {}


def _minutes(run):
    a, b = L._parse_ts(run.get("started_at")), L._parse_ts(run.get("ended_at"))
    return round((b - a).total_seconds() / 60, 1) if a and b else None


def _active_minutes(events):
    """Learning time: the sum of the gaps between events, leaving out pauses over 90 seconds."""
    t = [e.get("t_ms") or 0 for e in events]
    return round(sum(b - a for a, b in zip(t, t[1:]) if 0 < b - a <= IDLE_GAP_MS) / 60000, 1)


# ── one card-game run, card by card ──
def card_detail(events):
    cards, order = {}, []
    quiz, remedy, reads, reflects = [], defaultdict(int), [], []
    last_part, abandon = None, None
    for e in events:
        t, d = e["type"], e.get("data") or {}
        if t == "card.deal" and d.get("card"):
            last_part = d.get("part", last_part)
            if d["card"] not in cards:
                cards[d["card"]] = {"card": d["card"], "part": d.get("part"), "review": bool(d.get("review")), "first": None, "k": None, "attempts": 0,
                                    "repeats": 0, "rt_ms": None, "listen_s": None, "wrong_targets": [], "matched": False}
                order.append(d["card"])
        elif t == "card.listen" and d.get("card") in cards:
            cards[d["card"]]["listen_s"] = d.get("seconds")
        elif t == "card.repeat" and d.get("card") in cards:
            cards[d["card"]]["repeats"] += 1
        elif t == "card.drop" and d.get("card"):
            c = cards.setdefault(d["card"], {"card": d["card"], "part": e.get("stage"), "review": bool(d.get("review")), "first": None, "k": None, "attempts": 0,
                                             "repeats": 0, "rt_ms": None, "listen_s": None, "wrong_targets": [], "matched": False})
            if d["card"] not in order:
                order.append(d["card"])
            c["attempts"] += 1
            if c["first"] is None:
                c["first"], c["k"], c["rt_ms"] = bool(d.get("correct")), d.get("k"), d.get("rt_ms")
                c["since_audio_ms"] = d.get("since_audio_ms")
            if d.get("correct"):
                c["matched"] = True
            elif isinstance(d.get("target"), str) and d["target"]:
                c["wrong_targets"].append(d["target"])
        elif t == "run.abandon":
            abandon = {"part": d.get("part"), "card": d.get("card"), "matched": _num(d.get("matched"))}
        elif t == "wrap.quiz.answer":
            quiz.append({"card": d.get("card"), "word": str(d.get("word") or "")[:80], "chosen": str(d.get("chosen") or "")[:80], "correct": bool(d.get("correct"))})
        elif t == "wrap.remedy.drop" and d.get("card"):
            remedy[d["card"]] += 1
        elif t == "wrap.read.done":
            reads.append({"at": e.get("created_at"), "clip": d.get("clip"), "seconds": d.get("seconds"), "target": _num(d.get("target")), "ratio": d.get("ratio"),
                          "wpm": d.get("wpm"), "heard": _num(d.get("heard")), "take": _num(d.get("take")), "recorded": bool(d.get("recorded")), "uploaded": bool(d.get("uploaded"))})
        elif t == "wrap.read.sent":      # the take reached the teacher
            for x in reversed(reads):
                if x.get("clip") == d.get("clip") and (d.get("take") is None or x.get("take") == d.get("take")):
                    x["uploaded"] = True
                    break
        elif t == "wrap.reflect":
            reflects.append({"at": e.get("created_at"), "facet": str(d.get("facet") or "")[:40], "question": str(d.get("question") or "")[:300],
                             "answer": str(d.get("answer") or "")[:300], "sentence": str(d.get("sentence") or "")[:600]})
    for c in cards.values():
        k = c["k"] if isinstance(c["k"], (int, float)) else 0
        c["s"] = round(((1 if c["first"] else 0) - 1 / k) / (1 - 1 / k), 3) if c["first"] is not None and k >= 2 else None
        c["remedy_attempts"] = remedy.get(c["card"], 0)
    return {"cards": [cards[c] for c in order], "quiz": quiz, "reads": reads, "reflects": reflects, "abandon": abandon, "last_part": last_part,
            "read_skipped": any(e["type"] == "wrap.read.skip" for e in events)}


def card_summary(run, events, detail=None, score=None):
    """One paragraph a teacher can read in ten seconds."""
    detail, score = detail or card_detail(events), score or L.score_events(events)
    cards = detail["cards"]
    s = [f"{run.get('username') or '這位學生'} 玩 SDG {run.get('chapter')}（{run.get('level')}）："]
    if not cards:
        return s[0] + "開了局但還沒發牌。"
    first_ok = sum(1 for c in cards if c["first"])
    s.append(f"發了 {len(cards)} 張句子卡，{first_ok} 張第一次就配對，聽懂分數 {score['score'] if score['score'] is not None else '–'}。")
    reps = sum(c["repeats"] for c in cards)
    s.append(f"重聽 {reps} 次。" if reps else "沒有重聽。")
    wrong = [c for c in cards if c["first"] is False]
    if wrong:
        s.append("第一次配錯：" + "、".join(c["card"].split("/")[-1] for c in wrong[:6]) + ("…" if len(wrong) > 6 else "") + "。")
    w = score.get("wrap") or {}
    if run.get("ended_at"):
        bits = []
        if w.get("quiz_total"): bits.append(f"小測 {w['quiz_correct']}/{w['quiz_total']}")
        if detail["reads"]: bits.append(f"朗讀 {detail['reads'][-1].get('seconds')} 秒（目標 {detail['reads'][-1].get('target')} 秒）" + ("，已送出錄音" if any(r.get("uploaded") for r in detail["reads"]) else ""))
        elif detail["read_skipped"]: bits.append("略過朗讀")
        if detail["reflects"]: bits.append("寫了反思")
        s.append("收尾：" + ("、".join(bits) if bits else "沒有作答紀錄") + ("，走完全部。" if w.get("done") else "，沒有走到最後一步。"))
    else:
        a = detail["abandon"]
        s.append(f"沒有玩完，停在 Part {a['part'] if a else detail['last_part']}。")
    if score.get("flags"):
        s.append("⚠ " + "、".join({"trial_and_error": "同一句 10 秒內連錯 3 次（像是用試的）", "fast_and_high": "反應極快又幾乎全對（暫定規則）"}.get(f, f) for f in score["flags"]) + "。")
    return " ".join(s)


# Why a run is listed but not counted (2026-11-09 meeting, T5: test data is kept, never analysed).
EXCLUDED = {"test_account": "測試帳號（老師／助教）", "embed": "3D 遊戲裡的小站", "test_run": "快速測試（只玩一段）", "partial": "只玩部分段落"}


def _excluded(metrics, person):
    if person.get("test"):
        return "test_account"
    if metrics.get("embed"):
        return "embed"
    if metrics.get("test"):
        return "test_run"
    if isinstance(metrics.get("parts"), list) and metrics.get("parts"):
        return "partial"
    return None


def _run_row(run, people, score=None):
    p = people.get(run.get("user_id")) or {}
    m = run.get("metrics") or {}
    stars = L._numeric_stars(run.get("stars") or {})
    return {"id": run["id"], "user_id": run.get("user_id"), "name": p.get("name") or run.get("username"), "student_no": p.get("student_no"), "public_id": p.get("public_id"),
            "game": run["game"], "chapter": run["chapter"], "level": run["level"], "started_at": run["started_at"], "ended_at": run.get("ended_at"),
            "minutes": _minutes(run), "events": run.get("event_count"), "course_id": run.get("course_id"), "section_id": run.get("section_id"),
            # For the 3D games score, flags and mode come from the browser: only a number / known words are passed on.
            "score": _num((score or m).get("score")), "flags": [f for f in ((score or m).get("flags") or []) if isinstance(f, str)][:6] if isinstance((score or m).get("flags"), list) else [],
            "wrap_done": bool(((score or m).get("wrap") or {}).get("done")) if isinstance((score or m).get("wrap"), dict) else False,
            "ending": run.get("ending"), "avg_stars": round(sum(stars) / len(stars), 2) if stars else None,
            "coverage": _num(m.get("heardAvg")), "mode": m.get("mode") if m.get("mode") in ("practice", "formal") else None,
            "version": run.get("content_version"), "embed": bool(m.get("embed")), "excluded": _excluded(m, p), "test": bool(p.get("test"))}


def _device(client):
    ua = client if isinstance(client, str) else ""
    os_ = "iPad" if "iPad" in ua else "iPhone" if "iPhone" in ua else "Android" if "Android" in ua else "Windows" if "Windows" in ua else "Mac" if "Mac" in ua else "ChromeOS" if "CrOS" in ua else "Linux" if "Linux" in ua else "?"
    return os_


def _mad_z(x, xs):
    """How far x is from the class, in robust standard deviations (median / MAD, so one outlier does not move the yardstick)."""
    xs = sorted(v for v in xs if v is not None)
    if len(xs) < 5 or x is None:
        return None, _median(xs)
    med = _median(xs)
    mad = _median([abs(v - med) for v in xs]) or 0
    if mad == 0:
        mad = (max(xs) - min(xs)) / 4 or 1
    return (x - med) / (1.4826 * mad), med


def _anomalies(rows, card):
    """Students whose numbers do not look like ordinary play, each with the reasons in plain words.
    The focus is on results that are better than the play behind them could explain (the class asked for
    help catching people gaming the system); clumsy trial-and-error is reported too, as a different kind."""
    played = [r for r in rows if r["runs"] and r.get("_st")]
    bests = [r["best"] for r in played]
    rt_meds = [_median(r["_st"]["rts"]) for r in played if r["_st"]["rts"]]
    out = []
    for r in played:
        st, why, good = r["_st"], [], False
        z, med = _mad_z(r["best"], bests)
        if r["best"] is not None and r["best"] >= 85 and z is not None and z >= 2:
            why.append(f"最好的聽懂分數 {r['best']}，全班中位數 {round(med)}，高出很多（{z:.1f} 個標準差）"); good = True
        rt = _median(st["rts"]) if st["rts"] else None
        class_rt = _median(rt_meds) if rt_meds else None
        rate = r["first_ok"] / r["first_n"] if r["first_n"] else 0
        if rt is not None and rt < 1500 and rate >= 0.8 and r["first_n"] >= 8:
            why.append(f"放卡的反應中位數只有 {rt / 1000:.1f} 秒" + (f"（全班 {class_rt / 1000:.1f} 秒）" if class_rt else "") + f"，又有 {round(rate * 100)}% 第一次就對"); good = True
        if st["early"] >= 3:
            why.append(f"有 {st['early']} 張卡沒有「聽」的紀錄就放對了。遊戲畫面要先念完句子才能拖卡，所以這些紀錄很可能不是從遊戲畫面送出的（例如直接呼叫 API 灌分數）"); good = True
        sc = [x["score"] for x in r["scores"]]
        jumps = [(a, b) for a, b in zip(sc, sc[1:]) if b - a >= 50]
        if jumps:
            a, b = max(jumps, key=lambda p: p[1] - p[0])
            why.append(f"分數一次跳了 {b - a} 分（{a} → {b}）"); good = True
        fast = [x for x in st["short"] if x[0] is not None and x[2] >= 8 and x[1] >= 80 and x[0] < x[2] * 0.12]
        if fast:
            m, sco, n, _ = min(fast)
            why.append(f"有一局只用了 {m} 分鐘就拿到 {sco} 分（{n} 張卡，比把句子聽完還快）"); good = True
        spans = sorted(st["spans"])
        overlap = sum(1 for (a1, e1, _), (a2, _e2, _) in zip(spans, spans[1:]) if a2 < e1)
        if overlap:
            why.append(f"有 {overlap} 次在上一局還沒結束時又開了新的一局（多個分頁，或有人一起用這個帳號）")
        devs = {d for d in st["devices"] if d != "?"}
        if len(devs) >= 3:
            why.append(f"用了 {len(devs)} 種裝置（{'、'.join(sorted(devs))}），可能有人借用帳號")
        if st["flag_kinds"].get("trial_and_error"):
            why.append(f"{st['flag_kinds']['trial_and_error']} 局在 10 秒內同一句連錯 3 次（像是用試的）")
        if st["flag_kinds"].get("fast_and_high") and not good:
            why.append(f"{st['flag_kinds']['fast_and_high']} 局反應極快又幾乎全對"); good = True
        if not why:
            continue
        severity = "high" if len(why) >= 2 or (good and any("「聽」" in w or "反應" in w for w in why)) else "watch"
        out.append({"user_id": r["user_id"], "name": r["name"], "student_no": r["student_no"], "section": r["section"], "best": r["best"], "runs": r["runs"],
                    "severity": severity, "too_good": good, "reasons": why})
    out.sort(key=lambda a: (a["severity"] != "high", not a["too_good"], -(a["best"] or 0)))
    return out


def _median(xs):
    xs = sorted(x for x in xs if isinstance(x, (int, float)))
    return xs[len(xs) // 2] if xs else None


# ── endpoints ──
@router.get("/games")
def games(course_id: int | None = None, section_id: int | None = None, authorization: str | None = Header(default=None)):
    L._teacher(authorization)
    conn, cur = L.get_db()
    where, params = _where(course_id=course_id, section_id=section_id)
    cur.execute(f"""
        SELECT r.game, COUNT(*) AS runs, SUM(CASE WHEN r.ended_at IS NOT NULL THEN 1 ELSE 0 END) AS finished,
               COUNT(DISTINCT r.user_id) AS students, MAX(r.started_at) AS last_played, COALESCE(SUM(r.event_count), 0) AS events
        FROM learning_runs r{where} GROUP BY r.game ORDER BY runs DESC""", params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    for r in rows:
        r["name"] = GAME_NAMES.get(r["game"], r["game"]); r["finished"] = int(r["finished"] or 0)
    have = {r["game"] for r in rows}
    rows += [{"game": g, "name": n, "runs": 0, "finished": 0, "students": 0, "last_played": None, "events": 0} for g, n in GAME_NAMES.items() if g not in have]
    return {"games": rows, "not_recorded": ["Around the World in 80 Conversations", "Science Every Day 365", "Science Inquiry Debate", "Morpheme Synthesis Lab", "3MT Mission Lab"]}


def _game_report(game, course_id, section_id, chapter, level, date_from, date_to, run_limit=300):
    conn, cur = L.get_db()
    runs = _runs(cur, game=game, course_id=course_id, section_id=section_id, chapter=chapter, level=level, date_from=date_from, date_to=date_to)
    events = _events(cur, [r["id"] for r in runs])
    conn.close()
    people = _people(course_id, section_id)
    recs = L._auth["recordings"](course_id, game) if L._auth.get("recordings") else {}
    card = game == CARD
    students, card_stats, confusion = {}, {}, Counter()
    funnel = Counter(); abandon_points = Counter(); run_rows = []
    excluded, excluded_by_user = Counter(), Counter()
    # With a course chosen every enrolled student gets a row, played or not (test accounts too, marked).
    if course_id:
        for uid, p in people.items():
            if p.get("status") in (None, "active"):
                students[uid] = None
    skipped = 0
    for r in runs:
        evs = events.get(r["id"], [])
        detail = score = None
        if card:
            both = _scored(r, evs)
            if both is None:
                skipped += 1
                continue
            detail, score = both
        row = _run_row(r, people, score)
        row["active_minutes"] = _active_minutes(evs)
        run_rows.append(row)
        if row["excluded"]:
            # Listed among the runs (marked) but not a run of the class: a teacher's or test account,
            # the short station inside the 3D game, a quick test or a partial play.
            excluded[row["excluded"]] += 1
            if r.get("user_id") is not None:
                excluded_by_user[r["user_id"]] += 1
            continue
        key = r.get("user_id") if r.get("user_id") is not None else f"anon:{r['id']}"
        st = students.get(key) or {"runs": 0, "finished": 0, "scores": [], "repeats": 0, "flags": 0, "active": 0.0, "last": None, "first_ok": 0, "first_n": 0,
                                   "stars": [], "endings": Counter(), "quiz_ok": 0, "quiz_n": 0, "reads": 0, "reflects": 0, "wrap_done": 0, "username": r.get("username"), "levels": set(), "topics": set(),
                                   "rts": [], "early": 0, "early_n": 0, "spans": [], "devices": set(), "short": [], "flag_kinds": Counter()}
        students[key] = st
        st["runs"] += 1; st["active"] += row["active_minutes"]; st["last"] = max(st["last"] or "", r["started_at"])
        st["levels"].add(r["level"] or ""); st["topics"].add(r["chapter"] or "")
        st["spans"].append((r["started_at"], r.get("ended_at") or r["started_at"], r["id"]))
        st["devices"].add(_device(r.get("client")))
        if r.get("ended_at"):
            st["finished"] += 1
        if card:
            funnel["started"] += 1
            if detail["cards"]: funnel["dealt"] += 1
            if score["complete"]: funnel["matched_all"] += 1
            w = score["wrap"]
            if w["quiz_total"]: funnel["quiz"] += 1
            if w["read_done"]: funnel["read"] += 1
            if w["reflect_done"]: funnel["reflect"] += 1
            if w["done"]: funnel["done"] += 1; st["wrap_done"] += 1
            if not score["complete"] and detail["cards"]:
                abandon_points[str((detail["abandon"] or {}).get("part") or detail["last_part"] or "?")] += 1
            if score["score"] is not None and score["complete"]:
                st["scores"].append({"at": r["started_at"], "score": score["score"], "chapter": r["chapter"], "level": r["level"], "run_id": r["id"]})
            st["flags"] += 1 if score["flags"] else 0
            for fl in score["flags"] or []:
                st["flag_kinds"][fl] += 1
            if score["complete"] and score["score"] is not None and row["active_minutes"] is not None:
                st["short"].append((row["active_minutes"], score["score"], len(detail["cards"]), r["id"]))
            st["quiz_ok"] += w["quiz_correct"]; st["quiz_n"] += w["quiz_total"]; st["reads"] += len(detail["reads"]); st["reflects"] += len(detail["reflects"])
            for c in detail["cards"]:
                st["repeats"] += c["repeats"]
                if c["first"] is not None:
                    st["first_n"] += 1; st["first_ok"] += 1 if c["first"] else 0
                    if isinstance(c["rt_ms"], (int, float)) and c["rt_ms"] > 0:
                        st["rts"].append(c["rt_ms"])
                    if c["first"]:
                        st["early_n"] += 1
                        # The game lets a card be dragged only after its sentence has been read out (card.listen).
                        if c["listen_s"] is None and c["repeats"] == 0:
                            st["early"] += 1
                cs = card_stats.setdefault((c["card"], r.get("content_version")), {"card": c["card"], "version": r.get("content_version"), "part": c["part"], "n": 0, "first_ok": 0, "s": [], "repeats": 0, "rt": [], "wrong": Counter(), "students": set()})
                if c["first"] is not None:
                    cs["n"] += 1; cs["first_ok"] += 1 if c["first"] else 0
                    if c["s"] is not None: cs["s"].append(c["s"])
                    if isinstance(c["rt_ms"], (int, float)): cs["rt"].append(c["rt_ms"])
                    cs["students"].add(key)
                cs["repeats"] += c["repeats"]
                for t in c["wrong_targets"]:
                    cs["wrong"][t] += 1; confusion[(c["card"], t)] += 1
        else:
            stars = L._numeric_stars(r.get("stars") or {})
            st["stars"].extend(stars)
            if r.get("ending"): st["endings"][r["ending"]] += 1
    rows = []
    for key, st in students.items():
        p = people.get(key) or {}
        base = {"user_id": key if isinstance(key, int) else None, "name": p.get("name") or (st or {}).get("username") or "anonymous", "student_no": p.get("student_no"),
                "public_id": p.get("public_id"), "section": p.get("section"), "recordings": recs.get(key, {"total": 0, "new": 0}),
                "test": bool(p.get("test")), "excluded_runs": excluded_by_user.get(key, 0)}
        if st is None:
            rows.append({**base, "runs": 0, "finished": 0, "scores": [], "best": None, "last_score": None, "last": None, "active_minutes": 0, "repeats": 0, "flags": 0,
                         "first_rate": None, "first_ok": 0, "first_n": 0, "avg_stars": None, "quiz": None, "wrap_done": 0, "reads": 0, "reflects": 0, "topics": [], "levels": []})
            continue
        sc = [x["score"] for x in st["scores"]]
        rows.append({**base, "runs": st["runs"], "finished": st["finished"], "scores": st["scores"][-12:], "best": max(sc) if sc else None, "last_score": sc[-1] if sc else None,
                     "last": st["last"], "active_minutes": round(st["active"], 1), "repeats": st["repeats"], "flags": st["flags"],
                     "first_rate": round(st["first_ok"] / st["first_n"], 3) if st["first_n"] else None, "first_ok": st["first_ok"], "first_n": st["first_n"],
                     "avg_stars": round(sum(st["stars"]) / len(st["stars"]), 2) if st["stars"] else None, "best_ending": (st["endings"].most_common(1) or [(None, 0)])[0][0],
                     "quiz": f"{st['quiz_ok']}/{st['quiz_n']}" if st["quiz_n"] else None, "wrap_done": st["wrap_done"], "reads": st["reads"], "reflects": st["reflects"],
                     "topics": sorted(t for t in st["topics"] if t), "levels": sorted(l for l in st["levels"] if l), "_st": st})
    anomalies = _anomalies([r for r in rows if not r["test"]], card) if card else []
    by_user = {a["user_id"]: a for a in anomalies}
    for r in rows:
        r.pop("_st", None)
        a = by_user.get(r["user_id"])
        r["anomaly"] = {"severity": a["severity"], "too_good": a["too_good"], "n": len(a["reasons"])} if a else None
    rows.sort(key=lambda x: (x["section"] or "", x["student_no"] or "~", x["name"] or ""))
    cards = []
    for cs in card_stats.values():
        top = cs["wrong"].most_common(1)
        cards.append({"card": cs["card"], "version": cs["version"], "part": cs["part"], "n": cs["n"], "students": len(cs["students"]),
                      "first_rate": round(cs["first_ok"] / cs["n"], 3) if cs["n"] else None, "first_ok": cs["first_ok"], "s": round(sum(cs["s"]) / len(cs["s"]), 3) if cs["s"] else None,
                      "repeats_avg": round(cs["repeats"] / cs["n"], 2) if cs["n"] else 0, "rt_median_ms": _median(cs["rt"]),
                      "top_wrong": {"target": top[0][0], "n": top[0][1]} if top else None})
    cards.sort(key=lambda c: (c["s"] if c["s"] is not None else 9, str(c["card"])))
    real = [r for r in rows if not r["test"]]            # the class: test accounts are listed, not counted
    played = [r for r in real if r["runs"]]
    counted = [r for r in run_rows if not r["excluded"]]
    all_scores = [x["score"] for r in real for x in r["scores"]]
    mins = [r["minutes"] for r in counted if r["minutes"] is not None]
    return {"game": game, "name": GAME_NAMES.get(game, game),
            "overview": {"runs": len(counted), "finished": sum(1 for r in counted if r.get("ended_at")), "students_played": len(played), "students_listed": len(real),
                         "not_played": len(real) - len(played), "avg_score": round(sum(all_scores) / len(all_scores)) if all_scores else None,
                         "avg_minutes": round(sum(mins) / len(mins), 1) if mins else None, "events": sum(r.get("event_count") or 0 for r in runs),
                         "flagged_runs": sum(1 for r in counted if r["flags"]), "unreadable_runs": skipped,
                         "runs_total": len(runs), "excluded_runs": sum(excluded.values()), "excluded": {k: excluded[k] for k in EXCLUDED if excluded[k]},
                         "test_accounts": len(rows) - len(real),
                         "runs_listed": min(len(run_rows), run_limit) if run_limit else len(run_rows)},
            "students": rows, "cards": cards, "anomalies": anomalies,
            "confusion": [{"card": c, "target": t, "n": n} for (c, t), n in confusion.most_common(20)],
            "funnel": [{"step": k, "runs": funnel.get(k, 0)} for k in ("started", "dealt", "matched_all", "quiz", "read", "reflect", "done")] if card else [],
            "abandon_points": [{"part": k, "runs": v} for k, v in sorted(abandon_points.items())],
            "runs": sorted(run_rows, key=lambda r: r["started_at"], reverse=True)[:run_limit or None],
            "topics": sorted({r["chapter"] for r in runs if r.get("chapter")}, key=topic_key), "levels": sorted({r["level"] for r in runs if r.get("level")})}


@router.get("/game")
def game_report(game: str = CARD, course_id: int | None = None, section_id: int | None = None, chapter: str | None = None, level: str | None = None,
                date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"),
                authorization: str | None = Header(default=None)):
    L._teacher(authorization)
    return _game_report(game, course_id, section_id, chapter, level, date_from, date_to)


@router.get("/student/{user_id}")
def student_report(user_id: int, date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"),
                   authorization: str | None = Header(default=None)):
    L._teacher(authorization)
    person = _people().get(user_id)
    if not person:
        raise HTTPException(status_code=404, detail="student not found")
    conn, cur = L.get_db()
    runs = _runs(cur, user_id=user_id, date_from=date_from, date_to=date_to)
    events = _events(cur, [r["id"] for r in runs])
    conn.close()
    by_game, topics, weak, quiz_missed, reflections, reads, run_rows = {}, {}, {}, Counter(), [], [], []
    total_active = 0.0
    for r in runs:
        evs = events.get(r["id"], [])
        g = by_game.setdefault(r["game"], {"game": r["game"], "name": GAME_NAMES.get(r["game"], r["game"]), "runs": 0, "finished": 0, "active_minutes": 0.0, "last": None})
        active = _active_minutes(evs)
        g["runs"] += 1; g["finished"] += 1 if r.get("ended_at") else 0; g["active_minutes"] = round(g["active_minutes"] + active, 1); g["last"] = r["started_at"]
        total_active += active
        both = _scored(r, evs) if r["game"] == CARD else None
        if r["game"] == CARD and both is None:
            continue
        score = both[1] if both else None
        row = _run_row(r, {user_id: person}, score); row["active_minutes"] = active
        run_rows.append(row)
        if r["game"] != CARD:
            for e in evs:   # what the 3D games collect about speaking
                d = e.get("data") or {}
                if e["type"] in ("speak.attempt", "pk.slide") and d.get("coverage") is not None:
                    reads.append({"at": e.get("created_at"), "game": r["game"], "run_id": r["id"], "clip": str(d.get("label") or (f"slide {d.get('slide')}" if d.get("slide") else "") or "")[:120] or None, "heard": d.get("coverage"), "recorded": False})
                elif e["type"] in ("speak.record", "pk.record"):
                    reads.append({"at": e.get("created_at"), "game": r["game"], "run_id": r["id"], "clip": str(d.get("label") or "full talk")[:120], "seconds": d.get("sec"), "recorded": True, "uploaded": bool(d.get("uploaded"))})
                elif e["type"] in ("story.reflection", "story.proposal"):
                    reflections.append({"at": e.get("created_at"), "game": r["game"], "run_id": r["id"], "question": e["type"].split(".")[1], "sentence": str(d.get("text") or e.get("detail") or "")[:600]})
            continue
        detail = both[0]
        if row["excluded"] and row["excluded"] != "test_account":   # 3D station, quick test, partial play: listed, not a card-game run
            continue
        t = topics.setdefault((r["chapter"], r["level"]), {"chapter": r["chapter"], "level": r["level"], "runs": 0, "finished": 0, "scores": [], "last": None})
        t["runs"] += 1; t["finished"] += 1 if r.get("ended_at") else 0; t["last"] = r["started_at"]
        if score["score"] is not None and score["complete"]:
            t["scores"].append({"at": r["started_at"], "score": score["score"], "run_id": r["id"]})
        for c in detail["cards"]:
            if c["first"] is None:
                continue
            w = weak.setdefault(c["card"], {"card": c["card"], "plays": 0, "misses": 0, "repeats": 0, "last_first": None, "wrong": Counter()})
            w["plays"] += 1; w["misses"] += 0 if c["first"] else 1; w["repeats"] += c["repeats"]; w["last_first"] = c["first"]
            for x in c["wrong_targets"]: w["wrong"][x] += 1
        for q in detail["quiz"]:
            if not q["correct"] and q["word"]: quiz_missed[q["word"]] += 1
        for x in detail["reflects"]: reflections.append({**x, "game": CARD, "run_id": r["id"], "chapter": r["chapter"]})
        for x in detail["reads"]: reads.append({**x, "game": CARD, "run_id": r["id"], "chapter": r["chapter"]})
    for t in topics.values():
        sc = [x["score"] for x in t["scores"]]
        t["best"], t["last_score"], t["first_score"] = (max(sc), sc[-1], sc[0]) if sc else (None, None, None)
    weak_rows = sorted(({**w, "wrong": [{"target": k, "n": v} for k, v in w["wrong"].most_common(3)]} for w in weak.values() if w["misses"]), key=lambda w: (-w["misses"], str(w["card"])))
    profile = L._auth["profile"](user_id) if L._auth.get("profile") else {}
    devices = Counter(_device(r.get("client")) for r in runs if r.get("client"))
    return {"student": {"user_id": user_id, "name": person.get("name"), "student_no": person.get("student_no"), "public_id": person.get("public_id"),
                        "test": bool(person.get("test")), "role": person.get("role")},
            "profile": {**profile, "devices": [{"device": k, "runs": v} for k, v in devices.most_common() if k != "?"]},
            "daily": [{"day": d, "runs": n} for d, n in sorted(Counter(str(r["started_at"])[:10] for r in runs).items())],
            "totals": {"runs": len(runs), "finished": sum(1 for r in runs if r.get("ended_at")), "active_minutes": round(total_active, 1),
                       "games": len(by_game), "first_played": runs[0]["started_at"] if runs else None, "last_played": runs[-1]["started_at"] if runs else None,
                       "events": sum(r.get("event_count") or 0 for r in runs)},
            "by_game": list(by_game.values()), "card_topics": sorted(topics.values(), key=lambda t: (topic_key(t["chapter"]), t["level"] or "")),
            "weak_cards": weak_rows[:40], "quiz_missed": [{"word": w, "n": n} for w, n in quiz_missed.most_common(30)],
            "reflections": sorted(reflections, key=lambda x: str(x.get("at")), reverse=True)[:60],
            "speaking": sorted(reads, key=lambda x: str(x.get("at")), reverse=True)[:120],
            "runs": sorted(run_rows, key=lambda r: r["started_at"], reverse=True)}


@router.get("/run/{run_id}")
def run_report(run_id: int, authorization: str | None = Header(default=None)):
    L._teacher(authorization)
    conn, cur = L.get_db()
    runs = _runs(cur, run_id=run_id) if 0 < run_id <= L.INT_MAX else []
    run = runs[0] if runs else None
    if not run:
        conn.close()
        raise HTTPException(status_code=404, detail="run not found")
    evs = _events(cur, [run_id]).get(run_id, [])
    conn.close()
    people = _people()
    both = _scored(run, evs) if run["game"] == CARD else None
    if run["game"] == CARD and both is None:
        raise HTTPException(status_code=422, detail="這一局的紀錄讀不出來（資料格式不對）")
    if run["game"] == CARD:
        detail, score = both
        summary = card_summary({**run, "username": (people.get(run.get("user_id")) or {}).get("name") or run.get("username")}, evs, detail, score)
        extra = {"cards": detail["cards"], "quiz": detail["quiz"], "reads": detail["reads"], "reflects": detail["reflects"], "abandon": detail["abandon"], "score": score}
        row = _run_row(run, people, score)
    else:
        raw = {**run, "stars_json": json.dumps(run.get("stars") or {}), "vars_json": json.dumps(run.get("vars") or {}), "metrics_json": json.dumps(run.get("metrics") or {}), "route_json": json.dumps(run.get("route") or [])}
        summary = L._summarize_run(raw, evs)
        flags, _ = L._run_flags(raw, evs)
        extra = {"flags": [{"code": c, "reason": m} for c, _, m in flags], "stars": run.get("stars"), "vars": run.get("vars"), "route": run.get("route")}
        row = _run_row(run, people)
    row["active_minutes"] = _active_minutes(evs)
    return {"run": row, "summary": summary, **extra, "metrics": run.get("metrics"), "client": run.get("client"),
            "events": [{"seq": e["seq"], "t": round((e["t_ms"] or 0) / 1000, 1), "stage": e["stage"], "type": e["type"], "detail": e["detail"], "data": e["data"], "at": e["created_at"]} for e in evs]}


@router.get("/export.xlsx")
def export(game: str = CARD, course_id: int | None = None, section_id: int | None = None, chapter: str | None = None, level: str | None = None,
           date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"),
           names: bool = True, authorization: str | None = Header(default=None)):
    """names=false leaves out names and student numbers: only the research code identifies a student."""
    L._teacher(authorization)
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl is not installed")
    rep = _game_report(game, course_id, section_id, chapter, level, date_from, date_to, run_limit=None)
    conn, cur = L.get_db()
    ids = [r["id"] for r in rep["runs"]]
    events = _events(cur, ids)
    conn.close()
    who = {r["id"]: r for r in rep["runs"]}
    counted_ids = [r["id"] for r in rep["runs"] if not r["excluded"]]
    students = [s for s in rep["students"] if not s["test"]]
    ident = (lambda r: [r.get("public_id"), r.get("student_no"), r.get("name")]) if names else (lambda r: [r.get("public_id")])
    id_head = ["research_code", "student_no", "name"] if names else ["research_code"]
    wb = Workbook(); wb.remove(wb.active)
    head_font, head_fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F3A5F")

    def sheet(title, headers, rows):
        ws = wb.create_sheet(title); ws.append(headers)
        for c in ws[1]: c.font, c.fill = head_font, head_fill
        for r in rows:
            ws.append([L.excel_cell(v) for v in r])
        ws.freeze_panes = "A2"

    sheet("說明 README", ["工作表 sheet", "欄位 column", "說明"], [
        ["(file)", "", "含姓名與學號：只給授課老師。" if names else "不含姓名、學號、email：學生只用研究代碼（research_code）表示，可以交給研究使用。"],
        ["Summary", "", "匯出時間、篩選條件、整體數字"],
        ["Students", "", "每位學生一列（選了課程時，還沒玩的學生也會列出）。老師、助教和標成測試帳號的人不在這張表"],
        ["(test data)", "", "測試資料（老師／管理員／測試帳號的局、3D 遊戲裡的小站、快速測試或只玩部分段落的局）只出現在 Runs（有 excluded_reason）和 Events，不進任何統計表"],
        ["Students", "best_score / last_score", "聽懂分數 0–100：每句只看第一次配對，並扣掉用猜的機率"],
        ["Students", "first_try_rate", "第一次就配對的句子比例（0–1）"],
        ["Students", "active_minutes", "實際操作的分鐘數（停超過 90 秒不算）"],
        ["Students", "flagged_runs", "有異常標記的局數（trial_and_error = 像是用試的；fast_and_high = 極快又幾乎全對）"],
        ["Runs", "", "每一局一列；version = 當時教材的版本"],
        ["Cards", "", "每一句（card = 主題/難度/投影片編號）全班的表現；title = 投影片標題"],
        ["Cards", "score_s", "這一句的平均得分（1 = 第一次都對；0 = 跟用猜的一樣；負數 = 比猜還差）"],
        ["Cards", "most_confused_with", "最常被錯放到哪一張投影片"],
        ["Confusions", "", "哪一句最常被放到哪一張（次數）"],
        ["CardAttempts", "", "每一局的每一句：第一次對不對、k = 當時桌上還有幾張標題卡、放了幾次、重聽幾次、反應時間"],
        ["Quiz / ReadAloud / Reflections", "", "收尾的小測、朗讀（秒數、目標秒數、語速 wpm、是否送出錄音）、反思句"],
        ["Events", "", "全部操作紀錄（一個動作一列），可以重算任何指標"],
    ])

    ov = rep["overview"]
    sheet("Summary", ["metric", "value"], [["exported", L._now()], ["game", rep["name"]], ["filters", {"course_id": course_id, "section_id": section_id, "chapter": chapter, "level": level, "from": date_from, "to": date_to}]] + [[k, v] for k, v in ov.items()])
    sheet("Students", id_head + ["class", "runs", "finished", "best_score", "last_score", "first_try_rate", "active_minutes", "repeats", "quiz", "wrap_ups_done", "read_aloud", "reflections", "recordings", "flagged_runs", "avg_stars", "last_played"],
          [ident(s) + [s.get("section"), s["runs"], s["finished"], s["best"], s["last_score"], s["first_rate"], s["active_minutes"], s["repeats"], s["quiz"], s["wrap_done"], s["reads"], s["reflects"], s["recordings"]["total"], s["flags"], s.get("avg_stars"), s["last"]] for s in students])
    sheet("Runs", ["run_id"] + id_head + ["topic", "level", "version", "started_at", "ended_at", "minutes", "active_minutes", "score", "wrap_up_done", "flags", "ending", "avg_stars", "events", "embedded_in_3d_game", "excluded_reason"],
          [[r["id"]] + ident(r) + [r["chapter"], r["level"], r["version"], r["started_at"], r["ended_at"], r["minutes"], r["active_minutes"], r["score"], r["wrap_done"], ", ".join(r["flags"]), r["ending"], r["avg_stars"], r["events"], r["embed"], r["excluded"]] for r in rep["runs"]])
    if game == CARD:
        titles = L._auth["titles"]() if L._auth.get("titles") else {}
        sheet("Cards", ["card", "title", "version", "part", "first_tries", "students", "first_try_rate", "score_s", "repeats_per_play", "median_reaction_ms", "most_confused_with", "confused_with_title", "times"],
              [[c["card"], titles.get(c["card"]), c["version"], c["part"], c["n"], c["students"], c["first_rate"], c["s"], c["repeats_avg"], c["rt_median_ms"], (c["top_wrong"] or {}).get("target"), titles.get((c["top_wrong"] or {}).get("target")), (c["top_wrong"] or {}).get("n")] for c in rep["cards"]])
        sheet("Confusions", ["sentence_card", "put_on", "times"], [[c["card"], c["target"], c["n"]] for c in rep["confusion"]])
        per_card, quiz, reads, reflects = [], [], [], []
        for rid in counted_ids:
            both = _scored(who[rid], events.get(rid, []))
            if both is None:
                continue
            d, r = both[0], who[rid]
            for c in d["cards"]:
                per_card.append([rid] + ident(r) + [c["card"], c["part"], c["first"], c["k"], c["s"], c["attempts"], c["repeats"], c["rt_ms"], c["listen_s"], ", ".join(str(x) for x in c["wrong_targets"]), c["review"], c["remedy_attempts"]])
            quiz += [[rid] + ident(r) + [q["card"], q["word"], q["chosen"], q["correct"]] for q in d["quiz"]]
            reads += [[rid] + ident(r) + [x["at"], x["clip"], x["seconds"], x["target"], x["ratio"], x["wpm"], x["heard"], x["take"], x["recorded"], x["uploaded"]] for x in d["reads"]]
            reflects += [[rid] + ident(r) + [x["at"], x["facet"], x["question"], x["answer"], x["sentence"]] for x in d["reflects"]]
        sheet("CardAttempts", ["run_id"] + id_head + ["card", "part", "first_try_correct", "k", "score_s", "attempts", "repeats", "reaction_ms", "listen_s", "wrong_targets", "review_card", "remedy_attempts"], per_card)
        sheet("Quiz", ["run_id"] + id_head + ["card", "word", "chosen", "correct"], quiz)
        sheet("ReadAloud", ["run_id"] + id_head + ["at", "clip", "seconds", "target_seconds", "ratio", "wpm", "heard_ratio", "take", "recorded", "uploaded"], reads)
        sheet("Reflections", ["run_id"] + id_head + ["at", "facet", "question", "answer", "sentence"], reflects)
    ev_rows = []
    for rid in ids:
        for e in events.get(rid, []):
            ev_rows.append([rid, who[rid].get("public_id"), e["seq"], round((e["t_ms"] or 0) / 1000, 1), e["stage"], e["type"], e["detail"], e["data"], e["created_at"]])
            if len(ev_rows) >= 200000: break
    sheet("Events", ["run_id", "research_code", "seq", "t_s", "part", "type", "detail", "data", "stored_at"], ev_rows)
    buf = io.BytesIO(); wb.save(buf)
    safe_game = "".join(ch for ch in game if ch.isalnum() or ch in "-_")[:40]
    name = f"learning-records-{safe_game}-{datetime.now(L.TAIPEI).strftime('%Y%m%d-%H%M')}-{'WITH-NAMES' if names else 'codes-only'}.xlsx"
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{name}"'})
