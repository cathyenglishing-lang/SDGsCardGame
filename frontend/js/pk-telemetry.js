// Learning data for the Pecha Kucha Card Game: every match, replay and wrap-up answer goes to
// the platform's learning database (/learning/*), and the finished result to /game/pk-result.
//
// Nothing is "sent once and hoped for". Each run is kept in this browser (localStorage) with
// everything the server has not confirmed yet: the start, the events, the finish, the result.
// It is sent again — after a failed request, when the network comes back, and the next time the
// page opens — until the server has all of it. The server ignores what it already has, so
// sending twice is safe. The page shows the state through PKT.onChange (saving / saved / waiting).
//
// Guest mode (frontend/js/api.js) stores and sends nothing.
(function () {
  const API = String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const STORE = "pk_runs_pending_v1";
  const MAX_AGE_MS = 14 * 24 * 3600 * 1000;   // a run that could not be sent for two weeks is dropped
  const BATCH = 100;

  const session = () => { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch (e) { return null; } };
  let muted = false;   // a teacher previewing a draft: behaves like a guest, nothing is stored or sent
  const mode = () => { const s = session(); return muted ? "guest" : !s ? "anon" : s.user && s.user.role === "guest" ? "guest" : "user"; };
  const uid = () => { const s = session(); return s && s.user && s.user.role !== "guest" ? (s.user.id ?? null) : null; };
  const headers = () => { const h = { "Content-Type": "application/json" }; const t = session()?.access_token; if (t) h.Authorization = "Bearer " + t; return h; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

  let runs = load();        // { [clientId]: run }
  let active = null;        // clientId of the run being played in this tab
  let t0 = 0, pumping = false, timer = null, lastFailed = false, needLogin = false;
  const listeners = new Set(), finishWaiters = {};

  const gone = new Set();   // ids this tab has finished with, so a merge from disk does not bring them back
  // Runs older than two weeks are dropped whoever they belong to (a shared device may hold other accounts' runs).
  function load() { try { const all = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; for (const k in all) if (Date.now() - (all[k].created || 0) > MAX_AGE_MS) delete all[k]; return all; } catch (e) { return {}; } }
  function drop(id) { gone.add(id); delete runs[id]; }
  function save() {
    if (mode() === "guest") return;
    // Another tab (or the 3D game's frame) may have stored runs since this one loaded: keep them.
    try { const disk = load(); for (const k in disk) if (!(k in runs) && !gone.has(k)) runs[k] = disk[k]; } catch (e) {}
    try { localStorage.setItem(STORE, JSON.stringify(runs)); }
    catch (e) { // storage full: let go of the oldest finished run and try once more
      const old = Object.values(runs).filter(r => r.id !== active).sort((a, b) => a.created - b.created)[0];
      if (old) { drop(old.id); try { localStorage.setItem(STORE, JSON.stringify(runs)); } catch (e2) {} }
    }
  }
  // 401/403 (sign in again), 408/429 (try later) and 5xx can succeed later. Any other 4xx will be
  // refused every time: that one step is dropped, so it cannot hold back every later run for 14 days.
  const hopeless = st => st >= 400 && st < 500 && ![401, 403, 408, 429].includes(st);
  function pendingOf(r) { return (r.runId ? 0 : 1) + r.events.length + (r.finish ? 1 : 0) + (r.result ? 1 : 0); }
  function mine() { const me = uid(); return Object.values(runs).filter(r => (r.uid ?? null) === me).sort((a, b) => a.created - b.created); }
  function emit() { const s = PKT.state(); listeners.forEach(fn => { try { fn(s); } catch (e) {} }); }
  function schedule(ms) { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; pump(); }, ms); }

  async function post(path, body, keepalive) {
    const r = await fetch(API + path, { method: "POST", headers: headers(), body: JSON.stringify(body), keepalive: !!keepalive });
    let data = null; try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, data };
  }

  // Send whatever is still waiting, oldest run first. One step failing stops this round; the
  // rest stays stored and the next round starts where this one stopped.
  async function pump() {
    if (pumping || !API || mode() === "guest") return;
    pumping = true; let failed = false; needLogin = false;
    try {
      for (const r of mine()) {
        if (Date.now() - r.created > MAX_AGE_MS && r.id !== active) { drop(r.id); save(); continue; }
        if (!r.runId) {
          const a = await post("/learning/runs", { ...r.info, client_id: r.id });
          if (a.ok) { r.runId = a.data.run_id; r.courseId = a.data.course_id ?? null; save(); }
          else if (hopeless(a.status) && r.id !== active) { console.warn("[PKT] run dropped: the server refuses its start", a.status, a.data); drop(r.id); save(); continue; }
          else { if (a.status === 401 || a.status === 403) { needLogin = true; } failed = true; break; }
        }
        while (r.events.length) {
          const batch = r.events.slice(0, BATCH);
          const a = await post("/learning/events", { run_id: r.runId, events: batch });
          if (a.ok) { r.events = r.events.slice(batch.length); save(); }
          else if (a.status === 404) { r.runId = null; save(); failed = true; break; }   // the server lost the run: open it again next round
          else if (hopeless(a.status)) { console.warn("[PKT] events dropped: the server refuses this batch", a.status, a.data); r.events = r.events.slice(batch.length); save(); }
          else { if (a.status === 401 || a.status === 403) needLogin = true; failed = true; break; }
        }
        if (failed) break;
        if (r.finish) {
          const sent = r.finish;
          const a = await post(`/learning/runs/${r.runId}/finish`, sent);
          if (!a.ok && hopeless(a.status)) {
            console.warn("[PKT] finish dropped: the server refuses it", a.status, a.data);
            if (r.finish === sent) { r.finish = null; const w = finishWaiters[r.id]; if (w) { delete finishWaiters[r.id]; w(null); } }
            save();
          } else if (!a.ok) { if (a.status === 401 || a.status === 403) needLogin = true; failed = true; break; }
          else {
          r.server = a.data;
          // A newer finish may have been stored while this one was on its way (the wrap-up ended):
          // only the one that was sent is cleared, the newer one goes out in the next round.
          if (r.finish === sent) { r.finish = null; const w = finishWaiters[r.id]; if (w) { delete finishWaiters[r.id]; w(a.data); } }
          save();
          if (r.finish) continue;
          }
        }
        if (r.result) {
          const a = await post("/game/pk-result", { ...r.result, client_id: r.id, run_id: r.runId });
          if (a.ok) { r.result = null; r.resultSaved = true; save(); }
          else if (hopeless(a.status)) { console.warn("[PKT] result dropped: the server refuses it", a.status, a.data); r.result = null; save(); }
          else { if (a.status === 401 || a.status === 403) needLogin = true; failed = true; break; }
        }
        if (!pendingOf(r) && r.id !== active) { drop(r.id); save(); }   // fully sent and no longer being played
      }
    } catch (e) { failed = true; }
    pumping = false; lastFailed = failed;
    emit();
    if (mine().some(pendingOf)) schedule(failed ? 15000 : 400);
  }

  const PKT = {
    api: API,
    mode,
    // Start a run. info: { game, chapter, level, content_version, course_id, client }
    begin(info) {
      t0 = performance.now();
      if (mode() === "guest") { active = "guest"; return active; }
      if (active && runs[active]) runs[active].closed = true;
      const id = newId();
      runs[id] = { id, uid: uid(), created: Date.now(), info, runId: null, seq: 0, events: [], finish: null, result: null, closed: false, server: null };
      active = id; save(); schedule(50); emit();
      return id;
    },
    log(type, data = null, extra = {}) {
      const r = runs[active]; if (!r) return;
      r.events.push({ seq: ++r.seq, t: +((performance.now() - t0) / 1000).toFixed(2), stage: extra.stage ?? null, node: extra.node || null, activity: extra.activity || null, type, detail: String(extra.detail || "").slice(0, 500), data });
      save();
      schedule(r.events.length >= 20 ? 50 : 3000);
    },
    // Ask the server to close (or re-score) the run. Resolves with the server's answer —
    // { score, chips, history } — or with null if it has not got through within `waitMs`
    // (it keeps trying in the background; PKT.onChange reports when it is saved).
    finish(metrics = {}, waitMs = 7000) {
      const r = runs[active];
      if (!r) return Promise.resolve(null);
      r.finish = { metrics }; save();
      const id = r.id;
      const earlier = finishWaiters[id]; if (earlier) earlier(null);   // an earlier call waits no longer; its finish is replaced by this one
      const p = new Promise(resolve => {
        const mine = data => { clearTimeout(t); resolve(data); };
        const t = setTimeout(() => { if (finishWaiters[id] === mine) delete finishWaiters[id]; resolve(null); }, waitMs);
        finishWaiters[id] = mine;
      });
      schedule(0); emit();
      return p;
    },
    // The finished result for the old per-part table (pk_results); the teacher's first report reads it.
    result(body) { const r = runs[active]; if (!r) return; r.result = body; save(); schedule(0); emit(); },
    close() { const r = runs[active]; if (r) { r.closed = true; save(); schedule(0); } },
    // Leaving in the middle of a run: note where, and send what we have while the page is closing.
    leaving(where) {
      const r = runs[active]; if (!r || r.closed || !r.seq) return;
      if (where) PKT.log("run.abandon", where);
      if (API && r.runId && r.events.length) { try { fetch(API + "/learning/events", { method: "POST", headers: headers(), body: JSON.stringify({ run_id: r.runId, events: r.events.slice(0, BATCH) }), keepalive: true }); } catch (e) {} }
    },
    state() {
      const m = mode();
      const waiting = m === "guest" ? 0 : mine().reduce((a, r) => a + pendingOf(r), 0);
      const r = runs[active];
      // saving: the result itself (finish / result) is still on its way; events trickling out in the background do not count
      return { mode: m, waiting, saved: m !== "guest" && !!r && !pendingOf(r), saving: m !== "guest" && !!r && !!(r.finish || r.result), runId: r ? r.runId : null,
               failing: lastFailed && waiting > 0, needLogin, online: navigator.onLine !== false,
               server: r ? r.server : null, resultSaved: !!(r && r.resultSaved), courseId: r ? r.courseId ?? null : null };
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async get(path) {
      if (!API || mode() !== "user") return null;
      try { const r = await fetch(API + path, { headers: headers() }); return r.ok ? await r.json() : null; } catch (e) { return null; }
    },
    retry() { schedule(0); },
    mute() { muted = true; },
  };

  addEventListener("online", () => schedule(0));
  addEventListener("storage", e => { if (e.key === "user") { schedule(0); emit(); } });   // signed in again in another tab
  addEventListener("pagehide", () => PKT.leaving(null));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && mine().some(pendingOf)) schedule(0); });
  if (mode() !== "guest" && mine().some(pendingOf)) schedule(800);   // runs left over from an earlier visit
  window.PKT = PKT;
})();
