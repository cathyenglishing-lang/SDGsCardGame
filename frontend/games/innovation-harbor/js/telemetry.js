// Learning-event log. In the real system every entry becomes a learning_events row.
import { S } from "./state.js";
import { $, esc } from "./util.js";

export function log(type, detail = "") {
  const e = { t: S.t0 ? ((performance.now() - S.t0) / 1000).toFixed(1) : "0.0", stage: S.stage + 1, type, detail };
  S.events.push(e);
  const n = $("#logN"); if (n) n.textContent = S.events.length;
  if ($("#logp") && !$("#logp").hidden) renderLog();
  return e;
}

export function renderLog() {
  $("#logBody").innerHTML = S.events.slice().reverse().map(e =>
    `<tr><td>${e.t}</td><td>${e.stage || "–"}</td><td class="ty">${esc(e.type)}</td><td>${esc(e.detail)}</td></tr>`).join("");
}

export function wireLogPanel() {
  $("#logBtn").onclick = () => { $("#logp").hidden = !$("#logp").hidden; renderLog(); };
  $("#logClose").onclick = () => { $("#logp").hidden = true; };
}
