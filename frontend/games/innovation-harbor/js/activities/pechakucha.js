// Part 6 · Pecha Kucha presentation on the waterfront stage: 20 s per slide, auto-advance,
// LED screen in the 3D scene follows the slides, camera cuts between stage and audience.
import { esc, wait, cleanTitle, starsFromRatio, pick } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { listen, recordClip, detectSpeech, speechFailed } from "../speech.js";
import { coverage } from "../vocab.js";
import { openSheet, closeSheet, finishRow, addStars, hintP } from "../ui/sheet.js";
import { tiersHtml, micHelp } from "./speaking.js";
import { drawScreen } from "../world/harbor.js";
import { frontShot, shot } from "../world/camera.js";
import { applause } from "../audio.js";

const SEC = 20;
export async function actPechaKucha(slides, { player, audience, mei }) {
  const body = openSheet("Part 6 · Pecha Kucha", "Present your conclusion to the whole harbor", "向全港發表你的結論");
  body.innerHTML = hintP(`Pecha Kucha rules: ${SEC} seconds per slide, and the slides change by themselves. ${slides.length} slides. Read the teleprompter aloud and keep going.`, `Pecha Kucha 規則：每張投影片 ${SEC} 秒，自動換頁，共 ${slides.length} 張。看提詞大聲說。`)
    + `<div id="tiers">${tiersHtml()}</div><div class="row" id="goRow" hidden><button class="btn" type="button" id="pkGo">Start presenting ▸</button></div><div class="pk" id="pk"></div><div id="help"></div>`;
  const pk = body.querySelector("#pk"); let result;
  const shots = [
    () => frontShot(player, { dist: 4.2, height: 0.25, side: 1.1 }),
    () => shot([27, 5.2, 17.5], [27, 2.4, 4]),
    () => frontShot(player, { dist: 2.6, height: 0.15, side: -0.7 }),
    () => shot([18.5, 3.6, 12], [27, 2.0, 5]),
  ];
  for (;;) {
    body.querySelector("#tiers").innerHTML = tiersHtml();
    if (S.speech === "none") { const a = await micHelp(body.querySelector("#help")); if (a === "retry") { S.speech = detectSpeech(); continue; } result = { skipped: true }; break; }
    body.querySelector("#goRow").hidden = false;
    await new Promise(r => body.querySelector("#pkGo").onclick = r);
    body.querySelector("#goRow").hidden = true;
    const mode = S.speech, ratios = []; let failed = null, clip = null;
    const recP = mode === "record" ? recordClip(SEC * slides.length * 1000 + 800) : null;
    player.play("talk");
    for (const [k, s] of slides.entries()) {
      drawScreen(`SLIDE ${k + 1} / ${slides.length}`, cleanTitle(s.title_en), s.script.split(/(?<=[.!?])\s/)[0]);
      shots[(k * 2) % shots.length]();
      pk.innerHTML = `<div class="timer"><span id="sec">${SEC}</span><div class="bar"><i id="bar"></i></div><span>${k + 1}/${slides.length}</span></div>
        <div class="slide"><small>${esc(cleanTitle(s.title_en))}</small><div class="target" id="tg">${esc(s.script)}</div></div>
        <div class="mic"><span class="dot live"></span><div class="transcript" id="tr">${mode === "browser" ? "Listening…" : "Recording…"}</div></div>`;
      const t0 = performance.now(); let cut = false;
      const tick = setInterval(() => { const el = (performance.now() - t0) / 1000; const sx = pk.querySelector("#sec"); if (!sx) return; sx.textContent = Math.max(0, Math.ceil(SEC - el)); pk.querySelector("#bar").style.width = Math.min(100, el / SEC * 100) + "%"; if (!cut && el > SEC / 2) { cut = true; shots[(k * 2 + 1) % shots.length](); } }, 100);
      if (k > 0) player.play("talk");
      const rec = mode === "browser" && !failed ? listen(SEC * 1000, t => { const tr = pk.querySelector("#tr"); if (tr) tr.textContent = t; }) : Promise.resolve(null);
      const [r] = await Promise.all([rec, wait(SEC * 1000)]);
      clearInterval(tick);
      if (r && !r.ok && speechFailed(r.code)) failed = r.code;
      else if (r) { const cov = coverage(s.script, r.text); ratios.push(cov.ratio); S.metrics.missed.push(...cov.miss); log("pk.slide", `slide ${s.no} coverage ${Math.round(cov.ratio * 100)}%`); }
    }
    player.play("idle");
    if (recP) { recordClip.stop && recordClip.stop(); clip = await recP; if (!clip.ok) failed = clip.code; }
    if (failed) { if (clip && !clip.ok) S.speech = "none"; pk.innerHTML = `<p class="hint" style="color:var(--bad)">The microphone or recognition stopped during the talk (${esc(failed)}). Fix it and present again.</p>`; continue; }
    if (mode === "browser") { result = { avg: ratios.reduce((a, b) => a + b, 0) / ratios.length, ratios }; break; }
    pk.innerHTML = `<audio controls src="${clip.url}" style="width:100%"></audio><div class="row"><button class="btn" type="button" id="send">Send to teacher ▸</button><button class="btn ghost" type="button" id="redo">Present again</button></div>`;
    const a = await new Promise(r => { pk.querySelector("#send").onclick = () => r("send"); pk.querySelector("#redo").onclick = () => r("redo"); });
    if (a === "redo") { pk.innerHTML = ""; continue; }
    log("pk.record", `full talk ${clip.sec} s (${clip.kb} KB) awaiting teacher`);
    result = { pending: true }; break;
  }
  drawScreen("THANK YOU", "Innovation Harbor", "Can We Trust AI? · Presented by the Sustainability Envoy");
  if (!result.skipped) { shot([27, 5.2, 17.5], [27, 2.4, 4]); applause(4); audience.forEach((a, i) => setTimeout(() => a.play("react"), i * 120)); mei?.play("react"); }
  if (result.avg != null) {
    const n = Math.max(1, starsFromRatio(result.avg)); S.metrics.speakBest.push(result.avg);
    pk.innerHTML = `<p class="hint">Average coverage ${Math.round(result.avg * 100)}% (${result.ratios.map(x => Math.round(x * 100) + "%").join(", ")})</p>`;
    await finishRow(body, n, "In the full version this step also sends the recording for cloud pronunciation scoring and to the teacher.", "正式版會同時送雲端發音評分，並把錄音交給老師。");
    closeSheet(); addStars(n, "Presentation");
  } else if (result.pending) {
    await finishRow(body, "pending", "Your talk was sent. Stars arrive after the teacher grades it.", "發表錄音已送出，星數等老師評分後補上。");
    closeSheet(); addStars("pending", "Presentation");
  } else {
    log("pk.skip", "presentation skipped (no microphone)");
    await finishRow(body, "skip", "This step is marked incomplete. The teacher can see it in the Learning Log.", "此關記為未完成。");
    closeSheet(); addStars("skip", "Presentation");
  }
}
