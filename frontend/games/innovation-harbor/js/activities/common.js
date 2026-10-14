// Small interaction primitives shared by the activities.
import { esc, shuffle } from "../util.js";
import { hint } from "../i18n.js";
import { chime } from "../audio.js";
import { shake } from "../ui/sheet.js";

// Multiple choice; resolves with the number of wrong clicks.
export function mcq(host, question, options, zh = "") {
  return new Promise(res => {
    let wrong = 0;
    const box = document.createElement("div"); box.className = "seq";
    box.innerHTML = `<p class="hint q">${esc(question)}${hint(zh)}</p>` + options.map((o, i) => `<button class="opt" type="button" data-i="${i}">${esc(o.text)}</button>`).join("");
    host.appendChild(box); box.scrollIntoView({ block: "nearest" });
    box.onclick = e => {
      const b = e.target.closest(".opt"); if (!b || b.disabled) return;
      const o = options[+b.dataset.i];
      if (o.correct) { b.classList.add("ok"); box.querySelectorAll(".opt").forEach(x => x.disabled = true); chime(true); res(wrong); }
      else { b.classList.add("no"); b.disabled = true; wrong++; chime(false); shake(b); }
    };
  });
}

// Typed answer with progressive hints; resolves with the number of wrong tries (max 3).
export function typeIn(host, label, answer, zh = "") {
  return new Promise(res => {
    let wrong = 0; const a = answer.toLowerCase();
    const box = document.createElement("div"); box.className = "seq";
    box.innerHTML = `<p class="hint q">${esc(label)}${hint(zh)}</p><div class="row"><input class="inp" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(a[0])}…"><button class="btn" type="button">Check</button><span class="count fb"></span></div>`;
    host.appendChild(box); const inp = box.querySelector("input"), fb = box.querySelector(".fb");
    setTimeout(() => inp.focus({ preventScroll: true }), 50);
    const check = () => {
      const v = inp.value.trim().toLowerCase().replace(/[^a-z'-]/g, "");
      if (v === a) { inp.classList.add("ok"); inp.disabled = true; box.querySelector(".btn").disabled = true; fb.textContent = "Correct"; chime(true); return res(wrong); }
      wrong++; chime(false); shake(inp);
      if (wrong >= 3) { inp.value = answer; inp.classList.add("no"); inp.disabled = true; box.querySelector(".btn").disabled = true; fb.textContent = "The word was shown"; return res(wrong); }
      fb.textContent = wrong === 1 ? `Try again · starts with "${answer.slice(0, 2)}"` : `One more try · "${answer.slice(0, 3)}…" (${answer.length} letters)`;
    };
    box.querySelector(".btn").onclick = check; inp.onkeydown = e => { if (e.key === "Enter") check(); };
  });
}

export function glossLine(t) { return `<div class="gloss"><b>${esc(t.word)}</b> — ${esc(t.def || "topic word")}${hint(t.zh)}</div>`; }
export const trunc = (t, n = 120) => t.length > n ? t.slice(0, n - 2) + "…" : t;
