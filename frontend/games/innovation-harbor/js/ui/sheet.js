// The envoy's tablet (activity panel), HUD, toasts and results rows.
import { $, esc, starStr, isNum, REDUCED } from "../util.js";
import { S, STAGES } from "../state.js";
import { hint } from "../i18n.js";
import { chime } from "../audio.js";

export function openSheet(kicker, title, zh = "") {
  $("#shKick").textContent = kicker; $("#shTitle").innerHTML = esc(title) + hint(zh);
  const b = $("#shBody"); b.innerHTML = ""; b.scrollTop = 0; $("#sheet").hidden = false; return b;
}
export function closeSheet() { $("#sheet").hidden = true; try { speechSynthesis.cancel(); } catch (e) {} }

export function finishRow(body, n, note, zh = "") {
  const r = document.createElement("div"); r.className = "result";
  r.innerHTML = `<div class="big-stars">${starStr(n)}</div><p class="hint">${esc(note)}${hint(zh)}</p><div class="row"><button class="btn" type="button">Done ▸</button></div>`;
  body.appendChild(r); r.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" });
  chime(isNum(n) ? n >= 2 : true);
  return new Promise(res => r.querySelector(".btn").onclick = res);
}
export function addStars(n, label) { S.stars[S.stage] = n; renderHud(); toast(`${label}: ${starStr(n)}`); }

let toastT;
export function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.hidden = true, 400); }, 2000); }

export function renderHud() {
  $("#track").innerHTML = STAGES.map((s, i) => `<div class="seg ${S.stars[i] != null ? "done" : i === S.stage ? "now" : ""}" title="Part ${i + 1} ${s.en}"><i></i><small>${i + 1} ${s.en}${S.stars[i] != null ? ` <em>${isNum(S.stars[i]) ? "★".repeat(S.stars[i]) : starStr(S.stars[i])}</em>` : ""}</small></div>`).join("");
  $("#integ").textContent = S.vars.integrity;
  const ev = $("#evid"); if (ev) ev.textContent = S.vars.evidence || 0;
  $("#starTotal").textContent = "★ " + Object.values(S.stars).filter(isNum).reduce((a, b) => a + b, 0);
  const sf = $("#safety"); if (sf) { sf.hidden = !S.metrics.hits; sf.querySelector("b").textContent = S.metrics.hits; }
}

export function hintP(en, zh) { return `<p class="hint">${en}${hint(zh)}</p>`; }
export const shake = el => { el.classList.add("shake"); setTimeout(() => el.classList.remove("shake"), 400); };
