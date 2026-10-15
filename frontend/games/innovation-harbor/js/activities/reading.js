// Part 2 · Reading: match slide titles to passages, then find target words by their definitions.
import { esc, shuffle, cleanTitle, starsFromErrors } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { targetWords, stem } from "../vocab.js";
import { openSheet, closeSheet, finishRow, addStars, hintP, shake } from "../ui/sheet.js";
import { chime } from "../audio.js";
import { glossLine } from "./common.js";

export async function actReading(slides, extra) {
  const all = [...slides, ...extra].map(s => ({ ...s, title: cleanTitle(s.title_en) }));
  const body = openSheet("Part 2 · Reading", "Kai's draft notes: which note belongs to which slide?", "凱的草稿筆記：哪段筆記對應哪張投影片？");
  body.innerHTML = hintP("Tap a slide title, then tap the note it describes. When all four are matched, press Check.", "先點一個投影片標題，再點它描述的段落。四段都配好後按 Check。")
    + `<div class="chips" id="hc">${shuffle(all).map(s => `<button class="hchip" type="button" data-no="${s.no}">${esc(s.title)}</button>`).join("")}</div>
    <div id="ps" class="seq">${shuffle(all).map(s => `<div class="passage sel-able" data-no="${s.no}" tabindex="0"><span class="slot">unmatched</span><br>${esc(s.script)}</div>`).join("")}</div>
    <div class="row"><button class="btn" type="button" id="chk" disabled>Check</button><span class="count" id="rc"></span></div><div id="vocab"></div>`;
  const t0 = performance.now(); let sel = null, mistakes = 0; const assign = {};
  const refresh = () => {
    body.querySelectorAll(".hchip").forEach(c => { c.classList.toggle("sel", sel === c.dataset.no); c.classList.toggle("used", Object.values(assign).includes(c.dataset.no)); });
    body.querySelectorAll(".passage.sel-able").forEach(p => { const a = assign[p.dataset.no]; const sl = p.querySelector(".slot"); sl.textContent = a ? all.find(s => String(s.no) === a).title : "unmatched"; sl.classList.toggle("filled", !!a); });
    body.querySelector("#chk").disabled = Object.keys(assign).length < all.length;
  };
  body.querySelector("#hc").onclick = e => { const c = e.target.closest(".hchip"); if (!c) return; sel = sel === c.dataset.no ? null : c.dataset.no; refresh(); };
  const place = p => { if (!sel || p.classList.contains("ok")) return; for (const k in assign) if (assign[k] === sel) delete assign[k]; assign[p.dataset.no] = sel; sel = null; refresh(); };
  body.querySelector("#ps").onclick = e => { const p = e.target.closest(".passage"); if (p) place(p); };
  body.querySelector("#ps").onkeydown = e => { if (e.key === "Enter") { const p = e.target.closest(".passage"); if (p) place(p); } };
  await new Promise(res => {
    body.querySelector("#chk").onclick = () => {
      let wrong = 0;
      body.querySelectorAll(".passage.sel-able").forEach(p => { if (assign[p.dataset.no] === p.dataset.no) p.classList.add("ok"); else { wrong++; delete assign[p.dataset.no]; shake(p); } });
      mistakes += wrong; refresh(); chime(!wrong);
      body.querySelector("#rc").textContent = wrong ? `${wrong} wrong, try again` : "All matched";
      log("read.match", `wrong ${wrong}`, { wrong });
      if (!wrong) { body.querySelector("#chk").disabled = true; res(); }
    };
  });
  // Task B: find the word by its definition (target vocabulary of this part only).
  const vocab = body.querySelector("#vocab");
  const targets = slides.flatMap(s => targetWords(s.script, 1, []).map(t => ({ ...t, no: s.no })));
  for (const t of targets) {
    const p = body.querySelector(`.passage[data-no="${t.no}"]`);
    const text = p.innerHTML.split("<br>")[1];
    p.innerHTML = p.innerHTML.split("<br>")[0] + "<br>" + text.replace(/[A-Za-z][A-Za-z'’-]*[A-Za-z]/g, w => `<span class="w">${w}</span>`);
    const qEl = document.createElement("p"); qEl.className = "hint q";
    qEl.innerHTML = `Find the word in the <b>${esc(cleanTitle(slides.find(s => s.no === t.no).title_en))}</b> note that means: <i>${esc(t.def || "a topic word")}</i>`;
    vocab.appendChild(qEl); p.scrollIntoView({ block: "nearest" });
    let wrong = 0;
    await new Promise(res => {
      p.onclick = e => { const w = e.target.closest(".w"); if (!w) return; if (stem(w.textContent.toLowerCase()) === stem(t.key)) { w.classList.add("hit"); chime(true); p.onclick = null; res(); } else { w.classList.add("missw"); wrong++; chime(false); } };
    });
    mistakes += wrong; if (wrong) S.metrics.missed.push(t.key);
    vocab.insertAdjacentHTML("beforeend", glossLine(t));
    log("read.find", `"${t.key}" wrong ${wrong}`, { word: t.key, wrong });
  }
  const sec = Math.round((performance.now() - t0) / 1000); S.metrics.readSec += sec;
  const n = starsFromErrors(mistakes);
  await finishRow(body, n, `${mistakes} mistake${mistakes === 1 ? "" : "s"} · ${sec} s reading time. The teacher dashboard compares reading time and accuracy across the class.`, "閱讀時間與正確率會與全班比較。");
  closeSheet(); addStars(n, "Reading");
}
