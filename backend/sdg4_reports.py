"""The teacher's SDG 4 Pecha Kucha Stage page (2026-11-12): class → student → one run, slide by slide.

What the stage sends (js/sdg4/main.js, every event is optional, older runs simply have less):
  run.start        load_ms, intro_ms, hq / mobile / vw / vh (how the stage ran on that device), speech engine
  phase            {phase, prev, prev_ms}: the visit moves load → intro → pier → walk → backstage → present → ending
  pk.part / pk.part.read   a part card opened / how long it was read
  pk.slide.start   {slide, part, attempt}: one slide attempt begins (so a student who leaves mid-slide still shows up there)
  pk.slide         {slide, dwell_ms, attempts, redo, heard, hit, miss, words, said_words, engine, missed[]}: the slide ends
  pk.redo / pk.model   "redo this slide" / "hear the model"
  page.hide / page.show   the tab was hidden / shown (a phone locked, another app)
  ending           phases{} totals

Everything here is worked out from the learning database's events (learning_events) and runs; nothing is
stored twice. A browser can send anything, so every number is checked before it is used (_n, _slide_no).

  GET /learning/sdg4/overview?course_id&section_id&chapter&level&mode&from&to   the whole class
  GET /learning/sdg4/student/{user_id}                                         one student, all their talks
  GET /learning/sdg4/run/{run_id}                                              one talk, slide by slide
  GET /learning/sdg4/export.xlsx                                               the same as an Excel workbook
"""
from __future__ import annotations

import io
from collections import Counter, defaultdict
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, Query, Response

from backend import learning as L
from backend import learning_reports as LR

router = APIRouter(prefix="/learning/sdg4", tags=["sdg4 stage records"])
GAME = L.SDG4_GAME
SLIDES = L.SDG4_SLIDES
PHASES = ["load", "intro", "pier", "walk", "backstage", "present", "ending"]
PHASE_ZH = {"load": "載入場景", "intro": "選等級畫面", "pier": "碼頭說明", "walk": "走去劇場", "backstage": "後台地圖與麥克風測試", "present": "上台發表", "ending": "結尾畫面"}
PART_EN = {1: "Introduction", 2: "Problem", 3: "Achievements", 4: "Solutions", 5: "Implications", 6: "Call to action"}
SLIDE_PART = {n: 1 + (0 if n <= 3 else 1 if n <= 6 else 2 if n <= 9 else 3 if n <= 12 else 4 if n <= 16 else 5) for n in range(1, SLIDES + 1)}
ACC_BINS = [(0, 20), (20, 40), (40, 60), (60, 80), (80, 101)]


# ── reading what a browser sent ──
def _n(v, lo=0, hi=4 * 3600 * 1000):
    """A number inside a sane range, or None (a string, NaN, a negative time or a huge one is ignored)."""
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and lo <= v <= hi else None


def _slide_no(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= SLIDES else None


def _words(v):
    return [w[:40] for w in v[:12] if isinstance(w, str)] if isinstance(v, list) else []


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _r(x, k=2):
    return None if x is None else round(x, k)


def _exit_label(ex):
    if not ex:
        return None
    if ex["kind"] == "slide":
        return f"第 {ex['slide']} 張（Part {ex['part']}）" + ("途中離開" if ex["state"] == "during" else "念完後離開")
    if ex["kind"] == "part":
        return f"Part {ex['part']} 說明卡片時離開"
    return PHASE_ZH.get(ex["phase"], str(ex["phase"])) + "時離開"


def analyze_run(run, evs):
    """One run, worked out from its events: slides, phases, accuracy, and (for a run that did not finish) where it was left."""
    m = run.get("metrics") or {}
    slides, parts_ms = {}, {}

    def sl(n):
        return slides.setdefault(n, {"slide": n, "part": SLIDE_PART.get(n), "starts": 0, "done": False, "dwell_ms": None, "attempt_ms": None, "redo": 0, "model": 0,
                                     "heard": None, "hit": None, "miss": None, "words": None, "said_words": None, "engine": None, "missed": []})

    phases, cur_phase, cur_t, last_t = {}, None, 0.0, 0.0
    start, ending, state, hides, shows, speech_failed, mic_ok = {}, None, None, 0, 0, None, None
    for e in evs:
        t, d = e["type"], e.get("data") or {}
        ts = (e.get("t_ms") or 0) / 1000
        last_t = max(last_t, ts)
        n = _slide_no(d.get("slide"))
        if t == "run.start":
            start = d
            cur_phase, cur_t = ("backstage" if d.get("quick") else "pier"), ts
            state = ("phase", cur_phase)
        elif t == "phase":
            prev, ms = d.get("prev"), _n(d.get("prev_ms"))
            if prev in PHASES and ms is not None:
                phases[prev] = phases.get(prev, 0) + ms
            if d.get("phase") in PHASES:
                cur_phase, cur_t = d["phase"], ts
                state = ("phase", cur_phase)
        elif t == "pk.part":
            p = d.get("part")
            if isinstance(p, int) and 1 <= p <= 6:
                state = ("part", p)
        elif t == "pk.part.read":
            p, ms = d.get("part"), _n(d.get("ms"))
            if isinstance(p, int) and 1 <= p <= 6 and ms is not None:
                parts_ms[p] = parts_ms.get(p, 0) + ms
        elif t == "pk.slide.start" and n:
            s = sl(n); s["starts"] += 1
            state = ("slide", n, "during")
        elif t == "pk.redo" and n:
            sl(n)["redo"] += 1
        elif t == "pk.model" and n:
            sl(n)["model"] += 1
        elif t == "pk.slide" and n:
            s = sl(n); s["done"] = True
            s["dwell_ms"], s["attempt_ms"] = _n(d.get("dwell_ms")), _n(d.get("attempt_ms"))
            heard = d.get("heard") if d.get("heard") is not None else d.get("coverage")
            s["heard"] = _n(heard, 0, 1)
            s["hit"], s["miss"], s["words"], s["said_words"] = (_n(d.get(k), 0, 300) for k in ("hit", "miss", "words", "said_words"))
            s["engine"] = d.get("engine") if d.get("engine") in ("listen", "read") else ("listen" if s["heard"] is not None else None)
            s["missed"] = _words(d.get("missed"))
            s["attempts"] = _n(d.get("attempts"), 1, 50)
            state = ("slide", n, "after")
        elif t == "page.hide":
            hides += 1
        elif t == "page.show":
            shows += 1
        elif t == "speech.mode" and isinstance(d.get("code"), str):
            speech_failed = d["code"][:40]
        elif t == "speech.test":
            mic_ok = bool(d.get("heard"))
        elif t == "ending":
            ending = d
    for s in slides.values():                      # redo = redo events; a v2 slide also says how many attempts it took
        s["attempts"] = s.get("attempts") or max(1, s["starts"])
        s["redo"] = max(s["redo"], s["attempts"] - 1 if s["done"] else s["starts"] - 1 if s["starts"] else 0)
    # Finished = the stage said so, or every slide was read (the page was closed during the applause before the
    # result was sent: older versions of the stage sent it only after Ms. Lin's last words). Leaving = not finishing the talk.
    finished = (bool(run.get("ended_at")) and bool(run.get("ending"))) or sum(1 for s in slides.values() if s["done"]) >= SLIDES
    # Phase totals: the stage's own totals when it finished, else the sum of the phases that ended plus the open one.
    given = (ending or {}).get("phases") or m.get("phases")
    if isinstance(given, dict) and any(_n(v) is not None for v in given.values()):
        phases = {k: int(v) for k, v in given.items() if k in PHASES and _n(v) is not None}
    else:
        if _n(start.get("load_ms")) is not None:
            phases["load"] = int(start["load_ms"])
        if _n(start.get("intro_ms")) is not None:
            phases["intro"] = int(start["intro_ms"])
        if cur_phase and not finished:
            phases[cur_phase] = phases.get(cur_phase, 0) + int(max(0, last_t - cur_t) * 1000)
    ordered = [slides[k] for k in sorted(slides)]
    hit = sum(s["hit"] for s in ordered if s["hit"] is not None and s["miss"] is not None)
    miss = sum(s["miss"] for s in ordered if s["hit"] is not None and s["miss"] is not None)
    heard_slides = [s for s in ordered if s["heard"] is not None]
    exit_ = None
    if not finished:
        if state and state[0] == "slide":
            exit_ = {"kind": "slide", "slide": state[1], "part": SLIDE_PART.get(state[1]), "state": state[2]}
        elif state and state[0] == "part":
            exit_ = {"kind": "part", "part": state[1]}
        else:
            exit_ = {"kind": "phase", "phase": (state[1] if state else None) or "intro"}
        exit_["label"] = _exit_label(exit_)
        exit_["last_t"] = round(last_t, 1)
        exit_["hidden"] = bool(evs) and evs[-1]["type"] == "page.hide"
    dwell = [s["dwell_ms"] for s in ordered if s["dwell_ms"] is not None]
    return {
        "slides": ordered, "finished": finished, "exit": exit_, "phases": phases, "parts_ms": parts_ms,
        "accuracy": round(hit / (hit + miss), 3) if hit + miss else None, "hit": hit, "miss": miss,
        "heard_avg": _r(_mean([s["heard"] for s in heard_slides]), 3), "slides_done": sum(1 for s in ordered if s["done"]),
        "redo": sum(s["redo"] for s in ordered), "model": sum(s["model"] for s in ordered),
        "dwell_total_s": round(sum(dwell) / 1000, 1) if dwell else None, "has_timing": bool(dwell),
        "engine": "listen" if heard_slides else ("read" if any(s["engine"] == "read" for s in ordered) else None),
        "speech_failed": speech_failed, "mic_ok": mic_ok, "hides": hides, "shows": shows,
        "device": {"hq": start.get("hq") if isinstance(start.get("hq"), bool) else None, "mobile": start.get("mobile") if isinstance(start.get("mobile"), bool) else None,
                   "vw": _n(start.get("vw"), 0, 20000), "vh": _n(start.get("vh"), 0, 20000), "load_s": _r((_n(start.get("load_ms")) or 0) / 1000, 1) if _n(start.get("load_ms")) is not None else None},
    }


# ── what does not look like ordinary practice: one talk at a time ──
# kind "too_good": the result is better than the play behind it can explain (chips, grades);
# kind "watch":    something to look at with the student (no voice, kept leaving the tab).
def run_flags(run, an):
    m = run.get("metrics") or {}
    out = []
    server = [f for f in (m.get("flags") or []) if isinstance(f, str)] if isinstance(m.get("flags"), list) else []
    reading = m.get("reading") if isinstance(m.get("reading"), dict) else {}
    if "too_fast" in server:
        secs = reading.get("seconds")
        out.append({"code": "too_fast", "kind": "too_good", "reason": f"整場只花了 {secs if isinstance(secs, (int, float)) else '很少'} 秒就送出完成，比 20 張投影片該花的時間短很多"})
    if an["finished"] and an["slides_done"] < SLIDES - 2:
        out.append({"code": "few_slides", "kind": "too_good", "reason": f"只念了 {an['slides_done']} 張就送出「完成」"})
    done = [s for s in an["slides"] if s["done"]]
    said = [s for s in done if s["said_words"] is not None and s["hit"] is not None]
    if said and sum(s["hit"] for s in said) > sum(s["said_words"] for s in said) * 1.15 + 5:
        out.append({"code": "more_right_than_said", "kind": "too_good", "reason": "念對的字比實際說出口的字還多，這些數字很可能不是從遊戲畫面送出的"})
    timed = sorted(s["dwell_ms"] for s in done if s["dwell_ms"] is not None)
    slide_sec = m.get("slideSec") if isinstance(m.get("slideSec"), (int, float)) and not isinstance(m.get("slideSec"), bool) and 5 <= m.get("slideSec") <= 60 else 20
    if len(timed) >= 8 and timed[len(timed) // 2] < slide_sec * 600:
        out.append({"code": "short_slides", "kind": "too_good", "reason": f"每張只停留約 {round(timed[len(timed) // 2] / 1000)} 秒（這一場每張應該是 {round(slide_sec)} 秒）"})
    listen = [s for s in done if s["engine"] == "listen"]
    quiet = [s for s in listen if (s["heard"] or 0) < 0.1]
    if len(listen) >= 6 and len(quiet) >= len(listen) * 0.6:
        out.append({"code": "no_voice", "kind": "watch", "reason": f"麥克風開著，但 {len(quiet)} / {len(listen)} 張幾乎沒有聽到聲音（可能沒有念出聲，或麥克風有問題）"})
    if an["hides"] >= 3:
        out.append({"code": "left_tab", "kind": "watch", "reason": f"中途切到別的分頁或鎖螢幕 {an['hides']} 次"})
    return out


STATE_ZH = {"none": "還沒有上台", "steady": "穩定完成", "recovered": "放棄後又完成（不穩定，不是學習不佳）", "unstable": "完成過，但最近一次又中途離開", "abandoned_only": "還沒有完成過任何一次"}


def student_state(items):
    """items: [(row, analysis)] of one student, any order. A student who gave up and later finished is `recovered`:
    unsteady, not weak. The talk that represents the student is the best FINISHED one that is not flagged as too good."""
    if not items:
        return "none", None
    ordered = sorted(items, key=lambda x: x[0]["started_at"])
    fin = [x for x in ordered if x[1]["finished"]]
    left = [x for x in ordered if not x[1]["finished"]]
    if not fin:
        state = "abandoned_only"
    elif not left:
        state = "steady"
    else:
        state = "recovered" if ordered[-1][1]["finished"] else "unstable"
    clean = [x for x in fin if not any(f["kind"] == "too_good" for f in x[0].get("anomalies") or [])] or fin
    best = max(clean, key=lambda x: (x[1]["accuracy"] if x[1]["accuracy"] is not None else -1, x[1]["slides_done"], x[0]["started_at"])) if clean else None
    return state, ({"run_id": best[0]["id"], "accuracy": best[1]["accuracy"], "at": best[0]["started_at"], "mode": best[0]["mode"]} if best else None)


def student_anomaly(items):
    """Reasons to look at one student in this game, gathered from their talks and from how the talks relate."""
    why, good = [], False
    kinds = Counter(f["code"] for r, _ in items for f in r.get("anomalies") or [])
    first = {}
    for r, _ in items:
        for f in r.get("anomalies") or []:
            first.setdefault(f["code"], f)
    for code, n in kinds.items():
        f = first[code]
        why.append(f"{n} 次上台：{f['reason']}" if n > 1 else f["reason"])
        good = good or f["kind"] == "too_good"
    ordered = sorted((x for x in items if x[1]["accuracy"] is not None and x[1]["finished"]), key=lambda x: x[0]["started_at"])
    jumps = [(a[1]["accuracy"], b[1]["accuracy"]) for a, b in zip(ordered, ordered[1:]) if b[1]["accuracy"] - a[1]["accuracy"] >= 0.4]
    if jumps:
        a, b = max(jumps, key=lambda p: p[1] - p[0])
        why.append(f"念對率一次跳了 {round((b - a) * 100)} 個百分點（{round(a * 100)}% → {round(b * 100)}%）"); good = True
    spans = sorted((r["started_at"], r.get("ended_at") or r["started_at"]) for r, _ in items)
    overlap = sum(1 for (a1, e1), (a2, _e2) in zip(spans, spans[1:]) if a2 < e1)
    if overlap:
        why.append(f"有 {overlap} 次在上一場還沒結束時又開了新的一場（多個分頁，或有人一起用這個帳號）")
    if not why:
        return None
    return {"severity": "high" if good and len(why) >= 2 else "watch", "too_good": good, "reasons": why}


def _mode(run):
    """practice / formal. A talk that was left has no metrics yet: the stage also writes the mode at the start of `client`."""
    m = (run.get("metrics") or {}).get("mode")
    if m in ("practice", "formal"):
        return m
    head = str(run.get("client") or "").split(" ", 1)[0]
    return head if head in ("practice", "formal") else None


# ── loading ──
def _load(course_id, section_id, chapter, level, mode, date_from, date_to, user_id=None, run_id=None):
    conn, cur = L.get_db()
    runs = LR._runs(cur, game=GAME, course_id=course_id, section_id=section_id, chapter=chapter, level=level, date_from=date_from, date_to=date_to, user_id=user_id, run_id=run_id)
    if mode in ("practice", "formal"):
        runs = [r for r in runs if _mode(r) == mode]
    events = LR._events(cur, [r["id"] for r in runs])
    conn.close()
    return runs, events


def _row(run, people, an):
    base = LR._run_row(run, people)
    m = run.get("metrics") or {}
    reading = m.get("reading") if isinstance(m.get("reading"), dict) else {}
    return {**base, "mode": _mode(run), "score": None, "accuracy": an["accuracy"], "hit": an["hit"], "miss": an["miss"], "finished": an["finished"], "slides_done": an["slides_done"],
            "redo": an["redo"], "model": an["model"], "engine": an["engine"], "phases": an["phases"], "exit": an["exit"], "hides": an["hides"], "device": an["device"],
            "talk_s": an["dwell_total_s"], "active_minutes": None,
            "flags": [f for f in (m.get("flags") or []) if isinstance(f, str)][:4] if isinstance(m.get("flags"), list) else [],
            "server_accuracy": reading.get("accuracy") if isinstance(reading.get("accuracy"), (int, float)) and not isinstance(reading.get("accuracy"), bool) else None}


def _slide_table(analyses):
    """Per slide over the runs given: how many reached it, finished it, how long they stayed, redid it, heard of it."""
    out = []
    for n in range(1, SLIDES + 1):
        rows = [a for a in analyses if any(s["slide"] == n for s in a["slides"])]
        ss = [next(s for s in a["slides"] if s["slide"] == n) for a in rows]
        reached = [s for s in ss if s["starts"] or s["done"]]
        done = [s for s in ss if s["done"]]
        dw = sorted(s["dwell_ms"] for s in done if s["dwell_ms"] is not None)
        hit = sum(s["hit"] for s in done if s["hit"] is not None and s["miss"] is not None)
        miss = sum(s["miss"] for s in done if s["hit"] is not None and s["miss"] is not None)
        words = Counter(w.lower() for s in done for w in s["missed"])
        out.append({"slide": n, "part": SLIDE_PART[n], "reached": len(reached), "done": len(done),
                    "completion": _r(len(done) / len(reached), 3) if reached else None,
                    "dwell_median_s": _r(dw[len(dw) // 2] / 1000, 1) if dw else None,
                    "attempts_avg": _r(_mean([s["attempts"] for s in done]), 2),
                    "redo_rate": _r(sum(1 for s in reached if s["redo"]) / len(reached), 3) if reached else None,
                    "model_rate": _r(sum(1 for s in reached if s["model"]) / len(reached), 3) if reached else None,
                    "heard_avg": _r(_mean([s["heard"] for s in done]), 3), "heard_n": sum(1 for s in done if s["heard"] is not None),
                    "accuracy": _r(hit / (hit + miss), 3) if hit + miss else None,
                    "top_missed": [{"word": w, "n": c} for w, c in words.most_common(5)]})
    return out


def _report(course_id, section_id, chapter, level, mode, date_from, date_to, run_limit=300):
    runs, events = _load(course_id, section_id, chapter, level, mode, date_from, date_to)
    people = LR._people(course_id, section_id)
    recs = L._auth["recordings"](course_id, GAME) if L._auth.get("recordings") else {}
    analyses = {r["id"]: analyze_run(r, events.get(r["id"], [])) for r in runs}
    rows = [_row(r, people, analyses[r["id"]]) for r in runs]
    for row, r in zip(rows, runs):
        row["active_minutes"] = LR._active_minutes(events.get(r["id"], []))
        row["anomalies"] = run_flags(r, analyses[r["id"]])
    counted = [(row, analyses[row["id"]]) for row in rows if not row["excluded"]]
    excluded = Counter(row["excluded"] for row in rows if row["excluded"])
    students = {}
    if course_id:
        for uid, p in people.items():
            if p.get("status") in (None, "active"):
                students[uid] = []
    for row, an in counted:
        key = row["user_id"] if row["user_id"] is not None else f"anon:{row['id']}"
        students.setdefault(key, []).append((row, an))
    srows = []
    for key, items in students.items():
        p = people.get(key) or {}
        base = {"user_id": key if isinstance(key, int) else None, "name": p.get("name") or (items[0][0]["name"] if items else None) or "anonymous", "student_no": p.get("student_no"),
                "public_id": p.get("public_id"), "section": p.get("section"), "test": bool(p.get("test")), "recordings": recs.get(key, {"total": 0, "new": 0})}
        if not items:
            srows.append({**base, "runs": 0, "finished": 0, "finish_rate": None, "best": None, "last": None, "avg": None, "redo": 0, "minutes": 0, "last_played": None, "exits": 0, "trend": [], "formal": 0, "practice": 0,
                          "state": "none", "state_zh": STATE_ZH["none"], "best_run": None, "anomaly": None})
            continue
        acc = [a["accuracy"] for _, a in items if a["accuracy"] is not None]
        ordered = sorted(items, key=lambda x: x[0]["started_at"])
        state, best_run = student_state(items)
        srows.append({**base, "state": state, "state_zh": STATE_ZH[state], "best_run": best_run, "anomaly": None if base["test"] else student_anomaly(items), "runs": len(items), "finished": sum(1 for _, a in items if a["finished"]), "finish_rate": _r(sum(1 for _, a in items if a["finished"]) / len(items), 3),
                      "best": max(acc) if acc else None, "last": ordered[-1][1]["accuracy"], "avg": _r(_mean(acc), 3), "redo": sum(a["redo"] for _, a in items),
                      "minutes": _r(sum(r["active_minutes"] or 0 for r, _ in items), 1), "last_played": ordered[-1][0]["started_at"], "exits": sum(1 for _, a in items if not a["finished"]),
                      "trend": [x[1]["accuracy"] for x in ordered][-10:], "formal": sum(1 for r, _ in items if r["mode"] == "formal"), "practice": sum(1 for r, _ in items if r["mode"] == "practice")})
    real = [s for s in srows if not s["test"]]
    played = [s for s in real if s["runs"]]
    an_list = [a for _, a in counted]
    done_runs = [a for a in an_list if a["finished"]]
    # Phase times: the median over the runs that have that phase.
    phase_rows = []
    for ph in PHASES:
        xs = sorted(a["phases"][ph] for a in an_list if ph in a["phases"])
        phase_rows.append({"phase": ph, "zh": PHASE_ZH[ph], "n": len(xs), "median_s": _r(xs[len(xs) // 2] / 1000, 1) if xs else None, "mean_s": _r(sum(xs) / len(xs) / 1000, 1) if xs else None})
    exits = Counter()
    for a in an_list:
        if a["exit"]:
            ex = a["exit"]
            exits[(ex["kind"], ex.get("slide") or ex.get("part") or ex.get("phase"), ex["label"])] += 1
    accs = [a["accuracy"] for a in an_list if a["accuracy"] is not None]
    dist = [{"from": lo, "to": min(hi, 100), "n": sum(1 for x in accs if lo <= x * 100 < hi)} for lo, hi in ACC_BINS]
    mins = [r["minutes"] for r, _ in counted if r["minutes"] is not None]
    devices = Counter(("手機／平板" if a["device"]["mobile"] else "電腦") if a["device"]["mobile"] is not None else "?" for a in an_list)
    low = [a for a in an_list if a["device"]["hq"] is False]
    loads = [a["device"]["load_s"] for a in an_list if a["device"]["load_s"] is not None]
    return {"game": GAME, "name": LR.GAME_NAMES[GAME],
            "overview": {"runs": len(counted), "finished": len(done_runs), "finish_rate": _r(len(done_runs) / len(counted), 3) if counted else None, "students_played": len(played),
                         "students_listed": len(real), "not_played": len(real) - len(played), "accuracy_avg": _r(_mean(accs), 3), "accuracy_median": _r(sorted(accs)[len(accs) // 2], 3) if accs else None,
                         "redo_per_run": _r(_mean([a["redo"] for a in an_list]), 2), "model_per_run": _r(_mean([a["model"] for a in an_list]), 2), "avg_minutes": _r(_mean(mins), 1),
                         "listen_share": _r(sum(1 for a in an_list if a["engine"] == "listen") / len(an_list), 3) if an_list else None, "left_tab": sum(a["hides"] > 0 for a in an_list),
                         "formal": sum(1 for r, _ in counted if r["mode"] == "formal"), "practice": sum(1 for r, _ in counted if r["mode"] == "practice"),
                         "runs_total": len(rows), "excluded_runs": sum(excluded.values()), "excluded": {k: excluded[k] for k in LR.EXCLUDED if excluded[k]}, "test_accounts": len(srows) - len(real),
                         "low_tier": len(low), "mobile": sum(1 for a in an_list if a["device"]["mobile"]), "load_median_s": _r(sorted(loads)[len(loads) // 2], 1) if loads else None,
                         "with_timing": sum(1 for a in an_list if a["has_timing"]), "devices": dict(devices)},
            "slides": _slide_table(an_list), "phases": phase_rows,
            "exits": [{"kind": k[0], "key": k[1], "label": k[2], "runs": n} for k, n in exits.most_common()], "accuracy_dist": dist,
            "anomalies": sorted(({"user_id": s["user_id"], "name": s["name"], "student_no": s["student_no"], "section": s["section"], **s["anomaly"]} for s in srows if s.get("anomaly")),
                                key=lambda a: (a["severity"] != "high", not a["too_good"])),
            "states": {k: sum(1 for s in real if s["state"] == k) for k in STATE_ZH},
            "students": sorted(srows, key=lambda x: (x["section"] or "", x["student_no"] or "~", x["name"] or "")),
            "runs": sorted(rows, key=lambda r: r["started_at"], reverse=True)[:run_limit or None],
            "topics": sorted({r["chapter"] for r in runs if r.get("chapter")}, key=LR.topic_key), "levels": sorted({r["level"] for r in runs if r.get("level")})}


# ── endpoints ──
@router.get("/overview")
def overview(course_id: int | None = None, section_id: int | None = None, chapter: str | None = None, level: str | None = None, mode: str | None = None,
             date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"), authorization: str | None = Header(default=None)):
    L._teacher(authorization)
    return _report(course_id, section_id, chapter, level, mode, date_from, date_to)


@router.get("/student/{user_id}")
def student(user_id: int, date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"), authorization: str | None = Header(default=None)):
    L._teacher(authorization)
    person = LR._people().get(user_id)
    if not person:
        raise HTTPException(status_code=404, detail="student not found")
    runs, events = _load(None, None, None, None, None, date_from, date_to, user_id=user_id)
    people = {user_id: person}
    out, ans = [], []
    for r in runs:
        a = analyze_run(r, events.get(r["id"], []))
        row = _row(r, people, a); row["active_minutes"] = LR._active_minutes(events.get(r["id"], []))
        row["anomalies"] = run_flags(r, a)
        out.append(row)
        if not row["excluded"] or row["excluded"] == "test_account":
            ans.append((row, a))
    # What this student keeps missing, and how each slide went in the latest and in the best talk.
    words = Counter(w.lower() for _, a in ans for s in a["slides"] for w in s["missed"])
    by_acc = [x for x in ans if x[1]["accuracy"] is not None]
    best = max(by_acc, key=lambda x: x[1]["accuracy"]) if by_acc else None
    last = sorted(ans, key=lambda x: x[0]["started_at"])[-1] if ans else None
    cmp_ = [{"slide": n, "last": next((s["heard"] for s in last[1]["slides"] if s["slide"] == n), None) if last else None,
             "best": next((s["heard"] for s in best[1]["slides"] if s["slide"] == n), None) if best else None} for n in range(1, SLIDES + 1)]
    accs = [x[1]["accuracy"] for x in sorted(ans, key=lambda x: x[0]["started_at"])]
    state, best_run = student_state(ans)
    return {"state": state, "state_zh": STATE_ZH[state], "best_run": best_run, "anomaly": student_anomaly(ans),
            "student": {"user_id": user_id, "name": person.get("name"), "student_no": person.get("student_no"), "public_id": person.get("public_id"), "test": bool(person.get("test")),
                        "section": person.get("section")},
            "totals": {"runs": len(out), "finished": sum(1 for x in out if x["finished"]), "accuracy_best": max((a for a in accs if a is not None), default=None),
                       "accuracy_last": next((a for a in reversed(accs) if a is not None), None), "redo": sum(x[1]["redo"] for x in ans),
                       "minutes": _r(sum(x["active_minutes"] or 0 for x in out), 1), "left": sum(1 for x in out if not x["finished"])},
            "trend": [{"run_id": x[0]["id"], "at": x[0]["started_at"], "accuracy": x[1]["accuracy"], "mode": x[0]["mode"], "level": x[0]["level"]} for x in sorted(ans, key=lambda x: x[0]["started_at"])],
            "slides": cmp_, "missed_words": [{"word": w, "n": c} for w, c in words.most_common(30)],
            "runs": sorted(out, key=lambda r: r["started_at"], reverse=True)}


@router.get("/run/{run_id}")
def run_detail(run_id: int, authorization: str | None = Header(default=None)):
    L._teacher(authorization)
    runs, events = _load(None, None, None, None, None, None, None, run_id=run_id) if 0 < run_id <= L.INT_MAX else ([], {})
    if not runs:
        raise HTTPException(status_code=404, detail="run not found")
    run, evs = runs[0], events.get(run_id, [])
    a = analyze_run(run, evs)
    row = _row(run, LR._people(), a); row["active_minutes"] = LR._active_minutes(evs)
    row["anomalies"] = run_flags(run, a)
    # The ladder of one talk: every slide in order, with a plain sentence per slide.
    for s in a["slides"]:
        bits = []
        if s["heard"] is not None:
            bits.append(f"觀眾聽到 {round(s['heard'] * 100)}%")
        if s["redo"]:
            bits.append(f"重講 {s['redo']} 次")
        if s["model"]:
            bits.append(f"聽示範 {s['model']} 次")
        if s["dwell_ms"] is not None:
            bits.append(f"停留 {round(s['dwell_ms'] / 1000)} 秒")
        if not s["done"]:
            bits.append("沒有念完")
        s["note"] = "，".join(bits)
    summary = [f"{row['name'] or 'anonymous'}：{'完成' if a['finished'] else '中途離開'}（念完 {a['slides_done']} / {SLIDES} 張）"]
    if a["accuracy"] is not None:
        summary.append(f"念對的字 {round(a['accuracy'] * 100)}%（錯 {a['miss']} 個字）")
    elif a["engine"] == "read":
        summary.append("這次是默讀，沒有語音辨識，所以沒有念對率")
    if a["redo"]:
        summary.append(f"共重講 {a['redo']} 張")
    if a["exit"]:
        summary.append(a["exit"]["label"] + ("（離開了分頁）" if a["exit"]["hidden"] else ""))
    if a["speech_failed"]:
        summary.append(f"語音辨識失敗（{a['speech_failed']}）")
    return {"run": row, "summary": "。".join(summary) + "。", "analysis": a, "metrics": run.get("metrics"), "client": run.get("client"),
            "events": [{"seq": e["seq"], "t": round((e["t_ms"] or 0) / 1000, 1), "type": e["type"], "detail": e["detail"], "data": e["data"], "at": e["created_at"]} for e in evs]}


overall = APIRouter(prefix="/learning/records", tags=["learning records"])


@overall.get("/watchlist")
def watchlist(course_id: int | None = None, section_id: int | None = None, date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"),
              authorization: str | None = Header(default=None)):
    """Students who are flagged, game by game and across games: one row per student with the reasons of each game.
    A student flagged in more than one game comes first."""
    L._teacher(authorization)
    card = LR._game_report(LR.CARD, course_id, section_id, None, None, date_from, date_to)
    stage = _report(course_id, section_id, None, None, None, date_from, date_to)
    people = {}
    for game, name, rows in ((LR.CARD, LR.GAME_NAMES[LR.CARD], card["anomalies"]), (GAME, LR.GAME_NAMES[GAME], stage["anomalies"])):
        for a in rows:
            if a["user_id"] is None:
                continue
            p = people.setdefault(a["user_id"], {"user_id": a["user_id"], "name": a["name"], "student_no": a["student_no"], "section": a.get("section"), "games": []})
            p["games"].append({"game": game, "name": name, "severity": a["severity"], "too_good": a["too_good"], "reasons": a["reasons"]})
    out = sorted(people.values(), key=lambda p: (-len(p["games"]), not any(g["severity"] == "high" for g in p["games"]), p["student_no"] or "~"))
    return {"students": out, "in_several_games": sum(1 for p in out if len(p["games"]) > 1),
            "by_game": {LR.CARD: len(card["anomalies"]), GAME: len(stage["anomalies"])}, "not_checked": ["innovation-harbor"]}


@router.get("/export.xlsx")
def export(course_id: int | None = None, section_id: int | None = None, chapter: str | None = None, level: str | None = None, mode: str | None = None,
           date_from: str | None = Query(default=None, alias="from"), date_to: str | None = Query(default=None, alias="to"), names: bool = True, authorization: str | None = Header(default=None)):
    """names=false leaves out names and student numbers: only the research code identifies a student."""
    L._teacher(authorization)
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl is not installed")
    rep = _report(course_id, section_id, chapter, level, mode, date_from, date_to, run_limit=None)
    runs, events = _load(course_id, section_id, chapter, level, mode, date_from, date_to)
    people = LR._people(course_id, section_id)
    ident = (lambda r: [r.get("public_id"), r.get("student_no"), r.get("name")]) if names else (lambda r: [r.get("public_id")])
    id_head = ["research_code", "student_no", "name"] if names else ["research_code"]
    wb = Workbook(); wb.remove(wb.active)
    head_font, head_fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F3A5F")

    def sheet(title, headers, rows):
        ws = wb.create_sheet(title); ws.append(headers)
        for c in ws[1]:
            c.font, c.fill = head_font, head_fill
        for r in rows:
            ws.append([L.excel_cell(v) for v in r])
        ws.freeze_panes = "A2"

    sheet("說明 README", ["工作表 sheet", "欄位 column", "說明"], [
        ["(file)", "", "含姓名與學號：只給授課老師。" if names else "不含姓名、學號、email：學生只用研究代碼（research_code）表示。"],
        ["Students", "", "每位學生一列（選了課程時，還沒玩的學生也會列出）。老師、助教、標成測試帳號的人不在這張表，也不進任何統計"],
        ["Runs", "accuracy", "念對的字比例（0–1）：語音辨識聽到的字 ÷ 講稿的字。默讀（沒有語音辨識）的局沒有這個數字"],
        ["Runs", "finished / exit", "finished = 走到結尾；沒走到的局，exit 寫最後離開的位置（第幾張、說明卡片或哪個階段）"],
        ["Runs", "redo / model", "重講幾張 / 聽了幾次示範朗讀（練習模式才有）"],
        ["Runs", "load_s / hq / mobile", "場景載入秒數、是否高畫質、是否手機或平板（看低階裝置跑得動不動）"],
        ["Slides", "", "每張投影片全班的數字：reached 走到、done 念完、completion = done ÷ reached、dwell 停留秒數（中位數）、redo_rate 有人重講的比例、heard 觀眾聽到的比例"],
        ["RunSlides", "", "每一局的每一張：停留毫秒、念了幾次、聽到比例、對錯字數、沒念對的字"],
        ["Phases", "", "每一局各階段花的秒數：load → intro → pier → walk → backstage → present → ending"],
        ["Exits", "", "沒走到結尾的局，最後停在哪裡（次數）"],
        ["MissedWords", "", "全班最常沒念對的字"],
        ["Students", "state", "steady 穩定完成；recovered 放棄後又完成（不穩定，不是學習不佳）；unstable 完成過但最近又離開；abandoned_only 還沒完成過"],
        ["Students", "best_run_accuracy", "代表這位學生的一次：念完的上台裡念對率最高、而且沒有被標成「好得不合理」的那一次"],
        ["Anomalies", "", "每一次上台的異常（一列一個原因）：too_good = 結果比過程能解釋的好；watch = 值得和學生一起看"],
        ["(older runs)", "", "新版之前的局沒有停留時間與階段耗時，這些欄位是空白"],
    ])
    ov = rep["overview"]
    sheet("Summary", ["metric", "value"], [["exported", L._now()], ["game", rep["name"]], ["filters", {"course_id": course_id, "section_id": section_id, "chapter": chapter, "level": level, "mode": mode, "from": date_from, "to": date_to}]] +
          [[k, v] for k, v in ov.items()])
    students = [s for s in rep["students"] if not s["test"]]
    sheet("Students", id_head + ["class", "state", "runs", "finished", "finish_rate", "best_run_accuracy", "best_accuracy", "last_accuracy", "avg_accuracy", "redo", "active_minutes", "left_early", "practice_runs", "formal_runs", "last_played", "anomaly"],
          [ident(s) + [s.get("section"), s["state"], s["runs"], s["finished"], s["finish_rate"], (s["best_run"] or {}).get("accuracy"), s["best"], s["last"], s["avg"], s["redo"], s["minutes"], s["exits"], s["practice"], s["formal"], s["last_played"],
                       "; ".join((s.get("anomaly") or {}).get("reasons") or [])] for s in students])
    sheet("Anomalies", ["run_id"] + id_head + ["started_at", "code", "kind", "reason"], [[r["id"]] + ident(r) + [r["started_at"], f["code"], f["kind"], f["reason"]] for r in rep["runs"] if not r["excluded"] for f in r.get("anomalies") or []])
    sheet("Runs", ["run_id"] + id_head + ["topic", "level", "mode", "started_at", "ended_at", "finished", "slides_done", "accuracy", "hit_words", "missed_words", "redo", "model", "speech_engine", "left_tab", "exit", "load_s", "hq", "mobile", "viewport", "active_minutes", "excluded_reason"],
          [[r["id"]] + ident(r) + [r["chapter"], r["level"], r["mode"], r["started_at"], r["ended_at"], r["finished"], r["slides_done"], r["accuracy"], r["hit"], r["miss"], r["redo"], r["model"], r["engine"], r["hides"],
                                    (r["exit"] or {}).get("label"), r["device"]["load_s"], r["device"]["hq"], r["device"]["mobile"], f"{r['device']['vw']}x{r['device']['vh']}" if r["device"]["vw"] else None, r["active_minutes"], r["excluded"]] for r in rep["runs"]])
    sheet("Slides", ["slide", "part", "reached", "done", "completion", "dwell_median_s", "attempts_avg", "redo_rate", "model_rate", "heard_avg", "word_accuracy", "top_missed_words"],
          [[s["slide"], s["part"], s["reached"], s["done"], s["completion"], s["dwell_median_s"], s["attempts_avg"], s["redo_rate"], s["model_rate"], s["heard_avg"], s["accuracy"], ", ".join(f"{w['word']}({w['n']})" for w in s["top_missed"])] for s in rep["slides"]])
    counted_ids = {r["id"] for r in rep["runs"] if not r["excluded"]}
    who = {r["id"]: r for r in rep["runs"]}
    per_slide, per_phase = [], []
    for run in runs:
        if run["id"] not in counted_ids:
            continue
        a = analyze_run(run, events.get(run["id"], []))
        r = who[run["id"]]
        for s in a["slides"]:
            per_slide.append([run["id"]] + ident(r) + [s["slide"], s["part"], s["starts"], s["done"], s["dwell_ms"], s["attempts"], s["redo"], s["model"], s["heard"], s["hit"], s["miss"], s["words"], s["said_words"], s["engine"], ", ".join(s["missed"])])
        per_phase.append([run["id"]] + ident(r) + [round(a["phases"].get(p, 0) / 1000, 1) if p in a["phases"] else None for p in PHASES])
    sheet("RunSlides", ["run_id"] + id_head + ["slide", "part", "attempt_starts", "done", "dwell_ms", "attempts", "redo", "model", "heard", "hit_words", "missed_words", "script_words", "said_words", "engine", "missed_list"], per_slide)
    sheet("Phases", ["run_id"] + id_head + [f"{p}_s" for p in PHASES], per_phase)
    sheet("Exits", ["where", "runs"], [[e["label"], e["runs"]] for e in rep["exits"]])
    mw = Counter()
    for run in runs:
        if run["id"] in counted_ids:
            for s in analyze_run(run, events.get(run["id"], []))["slides"]:
                for w in s["missed"]:
                    mw[w.lower()] += 1
    sheet("MissedWords", ["word", "times"], [[w, c] for w, c in mw.most_common(200)])
    ev_rows = []
    for run in runs:
        for e in events.get(run["id"], []):
            ev_rows.append([run["id"], who[run["id"]].get("public_id"), e["seq"], round((e["t_ms"] or 0) / 1000, 1), e["type"], e["detail"], e["data"], e["created_at"]])
            if len(ev_rows) >= 150000:
                break
    sheet("Events", ["run_id", "research_code", "seq", "t_s", "type", "detail", "data", "stored_at"], ev_rows)
    buf = io.BytesIO(); wb.save(buf)
    name = f"sdg4-stage-{datetime.now(L.TAIPEI).strftime('%Y%m%d-%H%M')}-{'WITH-NAMES' if names else 'codes-only'}.xlsx"
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{name}"'})
