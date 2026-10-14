// Part 5 · Strategy: put the verification steps (sentences) in the right order.
import { esc, shuffle, sentences, starsFromErrors } from "../util.js";
import { log } from "../telemetry.js";
import { openSheet, closeSheet, finishRow, addStars, hintP, shake } from "../ui/sheet.js";
import { chime } from "../audio.js";

export async function actSequence(slides) {
  const body = openSheet("Part 5 · Strategy", "Put the verification steps in order", "把查證步驟排成正確順序");
  const pieces = slides.flatMap(s => sentences(s.script)).slice(0, 6);
  body.innerHTML = hintP("Tap the sentences in the order of the talk, starting with the first one.", "依簡報順序，從第一句開始依序點選。")
    + `<div class="seq-out" id="out"></div><div class="seq" id="pool">${shuffle(pieces.map((t, i) => ({ t, i }))).map(p => `<button class="opt" type="button" data-i="${p.i}">${esc(p.t)}</button>`).join("")}</div><span class="count" id="sc"></span>`;
  let next = 0, errors = 0;
  await new Promise(res => {
    body.querySelector("#pool").onclick = e => {
      const b = e.target.closest(".opt"); if (!b) return;
      if (+b.dataset.i === next) { const d = document.createElement("div"); d.textContent = pieces[next]; body.querySelector("#out").appendChild(d); b.remove(); next++; chime(true); if (next === pieces.length) res(); }
      else { errors++; shake(b); chime(false); body.querySelector("#sc").textContent = `${errors} wrong`; }
    };
  });
  log("seq.done", `${pieces.length} sentences, ${errors} wrong`);
  const n = starsFromErrors(errors);
  await finishRow(body, n, `${errors} wrong tap${errors === 1 ? "" : "s"}.`, "");
  closeSheet(); addStars(n, "Strategy");
}
