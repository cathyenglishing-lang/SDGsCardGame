// Learning-event log. Every entry is shown in the in-game Learning Log and sent to the
// platform's learning database (/learning/*) in small batches; the game never waits for the server.
import { S } from "./state.js";
import { $, esc } from "./util.js";

const API = String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
const QUEUE_KEY = "harbor_pending_events";
let runId = null, seq = 0, queue = [], timer = null, sending = false, startInfo = null;

const token = () => { try { return JSON.parse(localStorage.getItem("user") || "null")?.access_token || null; } catch (e) { return null; } };
const headers = () => { const h = { "Content-Type": "application/json" }; const t = token(); if (t) h.Authorization = `Bearer ${t}`; return h; };

export function log(type, detail = "", data = null) {
  const e = { t: S.t0 ? ((performance.now() - S.t0) / 1000).toFixed(1) : "0.0", stage: S.stage + 1, type, detail, data };
  S.events.push(e);
  const n = $("#logN"); if (n) n.textContent = S.events.length;
  if ($("#logp") && !$("#logp").hidden) renderLog();
  queue.push({ seq: ++seq, t: +e.t, stage: S.stage === "side" ? "side" : (typeof S.stage === "number" ? S.stage + 1 : null), node: S.node || null, activity: S.activity || null, type, detail: String(detail).slice(0, 500), data });
  schedule(queue.length >= 25 ? 50 : 4000);
  return e;
}

// Called once at run.start; events logged before the server answers are kept and sent afterwards.
export async function startRun(info) {
  startInfo = info;
  if (!API) return;
  try {
    const r = await fetch(`${API}/learning/runs`, { method: "POST", headers: headers(), body: JSON.stringify(info) });
    if (r.ok) { runId = (await r.json()).run_id; flush(); }
  } catch (e) { /* offline: events stay queued in localStorage */ persist(); }
}
export async function finishRun(payload) {
  await flush(true);
  if (!API || !runId) return;
  try { await fetch(`${API}/learning/runs/${runId}/finish`, { method: "POST", headers: headers(), body: JSON.stringify(payload) }); } catch (e) {}
}
function schedule(ms) { if (timer) return; timer = setTimeout(() => { timer = null; flush(); }, ms); }
function persist() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify({ runId, queue: queue.slice(-500) })); } catch (e) {} }
async function flush(force = false) {
  if (!API || !runId || sending || !queue.length) { if (queue.length) persist(); return; }
  sending = true;
  const batch = queue.slice(0, 200);
  try {
    const r = await fetch(`${API}/learning/events`, { method: "POST", headers: headers(), body: JSON.stringify({ run_id: runId, events: batch }), keepalive: force });
    if (r.ok) { queue = queue.slice(batch.length); try { localStorage.removeItem(QUEUE_KEY); } catch (e) {} }
    else persist();
  } catch (e) { persist(); }
  sending = false;
  if (queue.length) schedule(force ? 50 : 4000);
}
// Send what is left when the tab closes (best effort).
addEventListener("pagehide", () => { if (API && runId && queue.length) { try { navigator.sendBeacon?.(`${API}/learning/events`, new Blob([JSON.stringify({ run_id: runId, events: queue.slice(0, 200) })], { type: "application/json" })); } catch (e) {} } });
export const learningStatus = () => ({ api: API, runId, queued: queue.length, logged: S.events.length });

export function renderLog() {
  $("#logBody").innerHTML = S.events.slice().reverse().map(e =>
    `<tr><td>${e.t}</td><td>${e.stage || "–"}</td><td class="ty">${esc(e.type)}</td><td>${esc(e.detail)}</td></tr>`).join("");
}
export function wireLogPanel() {
  $("#logBtn").onclick = () => { $("#logp").hidden = !$("#logp").hidden; renderLog(); };
  $("#logClose").onclick = () => { $("#logp").hidden = true; };
}
