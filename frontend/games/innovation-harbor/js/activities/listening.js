// Part 1 · Listening: the conference opening plays on the harbor speakers;
// students fill two target-vocabulary blanks per slide (choose at A2, type at B1/B2).
import { esc, shuffle, cleanTitle, starsFromErrors } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { speak } from "../speech.js";
import { targetWords, distractors, GLOSSARY } from "../vocab.js";
import { openSheet, closeSheet, finishRow, addStars, hintP } from "../ui/sheet.js";
import { mcq, typeIn, glossLine } from "./common.js";

export async function actListening(slides, ctx) {
  let mistakes = 0; const pool = Object.keys(GLOSSARY);
  let body;
  for (const [k, s] of slides.entries()) {
    body = openSheet(`Part 1 · Listening · ${k + 1}/${slides.length}`, cleanTitle(s.title_en), s.title_zh);
    body.innerHTML = hintP("The conference opening is playing on the harbor speakers. Press Play, listen as often as you need, then fill in the two missing words.", "大會開場正在港口廣播播放。按 Play 聆聽（可重播），然後填入兩個空格。")
      + `<div class="row"><button class="btn" id="play" type="button">▶ Play</button><span class="count" id="pc">not played yet</span></div><div id="q"></div>`;
    const q = body.querySelector("#q"), pc = body.querySelector("#pc"); let plays = 0;
    const targets = targetWords(s.script, 2);
    await new Promise(ready => {
      body.querySelector("#play").onclick = async () => {
        plays++; if (plays > 1) S.metrics.replays++; pc.textContent = `played ${plays}×`;
        log("listen.play", `slide ${s.no} play #${plays}`);
        ctx?.traffic && (ctx.traffic.aiTalking = true);
        if (!q.children.length) ready(); // questions appear on the first Play; the audio keeps going
        await speak(s.script, "speaker");
        ctx?.traffic && (ctx.traffic.aiTalking = false);
      };
    });
    let html = esc(s.script);
    targets.forEach((t, i) => { html = html.replace(new RegExp(`\\b${t.word}\\b`), `<span class="blank" data-i="${i}">______</span>`); });
    const p = document.createElement("div"); p.className = "passage"; p.innerHTML = html; q.appendChild(p);
    for (const [i, t] of targets.entries()) {
      let wrong;
      if (S.level === "A2") {
        const opts = shuffle([t.key, ...distractors(t.key, pool, 3)]);
        wrong = await mcq(q, `Blank ${i + 1}: which word did you hear?`, opts.map(w => ({ text: w, correct: w === t.key })), "空格 " + (i + 1) + "：你聽到的是哪個字？");
      } else {
        wrong = await typeIn(q, `Blank ${i + 1}: type the word you heard.`, t.key, "空格 " + (i + 1) + "：輸入你聽到的字。");
      }
      mistakes += wrong;
      const bl = p.querySelector(`.blank[data-i="${i}"]`); bl.textContent = t.word; bl.classList.add("filled");
      q.insertAdjacentHTML("beforeend", glossLine(t));
      log("listen.answer", `slide ${s.no} "${t.key}" wrong ${wrong} (plays ${plays})`);
      if (wrong > 0) S.metrics.missed.push(t.key);
    }
    if (k < slides.length - 1) { const b = document.createElement("div"); b.className = "row"; b.innerHTML = `<button class="btn" type="button">Next slide ▸</button>`; q.appendChild(b); await new Promise(r => b.querySelector(".btn").onclick = r); }
  }
  const n = starsFromErrors(mistakes);
  await finishRow(body, n, `${mistakes} mistake${mistakes === 1 ? "" : "s"}. Replays and missed words are logged for the teacher's listening diagnostics.`, "錯誤次數、重播次數與漏聽單字都會記錄到老師後台。");
  closeSheet(); addStars(n, "Listening");
}
