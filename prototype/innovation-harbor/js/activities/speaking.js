// Part 4 · Speaking: shadow one slide at the Council podium.
// Three tiers: live browser recognition → recording for the teacher → microphone help (never self-rating).
import { esc, starsFromRatio } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { speak, listen, recordClip, detectSpeech, speechFailed, SPEECH_LABEL } from "../speech.js";
import { coverage, stem, targetWords } from "../vocab.js";
import { openSheet, closeSheet, finishRow, addStars, hintP } from "../ui/sheet.js";

export function targetHtml(text, cov) {
  const hit = new Set(cov.hit.map(stem)), miss = new Set(cov.miss.map(stem));
  return esc(text).replace(/[A-Za-z’']+/g, w => { const k = stem(w.toLowerCase().replace(/[’]/g, "'")); return hit.has(k) ? `<span class="hit">${w}</span>` : miss.has(k) ? `<span class="miss">${w}</span>` : w; });
}
export function tiersHtml() {
  return `<div class="tiers">
    <div class="tier ${S.speech === "browser" ? "on" : ""}"><b>LIVE</b>Browser speech recognition: instant score, drives the story</div>
    <div class="tier"><b>CLOUD</b>Pronunciation scoring: enabled at the Part 6 presentation in the full version</div>
    <div class="tier ${S.speech === "record" ? "on" : ""}"><b>TEACHER</b>Recording uploaded for the teacher to grade</div></div>`;
}
export function micHelp(host) {
  return new Promise(res => {
    const d = document.createElement("div"); d.className = "passage";
    d.innerHTML = `<p class="hint" style="color:var(--paper)">The microphone is not available, and this step needs your voice.</p>
      <p class="hint">Click the lock (or camera) icon next to the address bar → set <b>Microphone</b> to Allow, check that your headset is connected, then press Retry. Chrome or Edge works best.</p>
      <div class="row" style="margin-top:10px"><button class="btn" type="button" data-a="retry">Retry</button><button class="btn ghost" type="button" data-a="skip">Skip (marked incomplete)</button></div>`;
    host.appendChild(d);
    d.onclick = e => { const b = e.target.closest("[data-a]"); if (!b) return; d.remove(); res(b.dataset.a); };
  });
}
export function recordPanel(host, ms, label) {
  return new Promise(res => {
    const d = document.createElement("div"); d.className = "seq";
    d.innerHTML = `<p class="hint">This browser has no live recognition, so your voice is <b>recorded for the teacher</b>. Listen back before you send it.</p>
      <div class="row"><button class="btn" type="button" id="rGo">🎙 Start recording</button><button class="btn ghost" type="button" id="rStop" hidden>Stop</button><span class="dot" id="rDot"></span><span class="count" id="rInfo"></span></div><div id="rOut"></div>`;
    host.appendChild(d);
    const go = d.querySelector("#rGo"), stop = d.querySelector("#rStop");
    stop.onclick = () => recordClip.stop && recordClip.stop();
    go.onclick = async () => {
      go.hidden = true;
      const r = await recordClip(ms, () => { stop.hidden = false; d.querySelector("#rDot").classList.add("live"); d.querySelector("#rInfo").textContent = "Recording…"; });
      stop.hidden = true; d.querySelector("#rDot").classList.remove("live");
      if (!r.ok) { d.remove(); return res({ fail: r.code }); }
      d.querySelector("#rInfo").textContent = `${r.sec} s recorded`;
      d.querySelector("#rOut").innerHTML = `<audio controls src="${r.url}" style="width:100%"></audio><div class="row" style="margin-top:8px"><button class="btn" type="button" id="rSend">Send to teacher ▸</button><button class="btn ghost" type="button" id="rRe">Record again</button></div>`;
      d.querySelector("#rRe").onclick = () => { d.querySelector("#rOut").innerHTML = ""; go.hidden = false; go.click(); };
      d.querySelector("#rSend").onclick = () => { log("speak.record", `${label} ${r.sec} s (${r.kb} KB) awaiting teacher`); d.querySelector("#rOut").innerHTML = `<p class="hint" style="color:var(--good)">Sent. Your score appears after the teacher listens.</p>`; res({ pending: true }); };
    };
  });
}
function browserPanel(body, slide, on) {
  return new Promise(res => {
    const ctl = document.createElement("div"); ctl.className = "seq";
    ctl.innerHTML = `<div class="row"><button class="btn" type="button" id="go">🎙 Start speaking</button><button class="btn ghost" type="button" id="stop" hidden>Stop</button><span class="count" id="att"></span></div>
      <div class="mic"><span class="dot" id="dot"></span><div class="transcript" id="tr">(what the browser hears appears here)</div></div>`;
    body.querySelector("#ctl").appendChild(ctl);
    const go = ctl.querySelector("#go"), stop = ctl.querySelector("#stop"); let best = 0, tries = 0;
    stop.onclick = () => listen.stop && listen.stop();
    go.onclick = async () => {
      try { speechSynthesis.cancel(); } catch (e) {}
      tries++; go.hidden = true; stop.hidden = false; ctl.querySelector("#dot").classList.add("live"); on?.start?.();
      const r = await listen(30000, t => ctl.querySelector("#tr").textContent = t);
      ctl.querySelector("#dot").classList.remove("live"); stop.hidden = true; go.hidden = false; on?.stop?.();
      if (!r.ok && speechFailed(r.code)) { ctl.remove(); return res({ fail: r.code }); }
      const cov = coverage(slide.script, r.text);
      ctl.querySelector("#tr").textContent = r.text || "(nothing heard — try again)";
      body.querySelector("#tg").innerHTML = targetHtml(slide.script, cov);
      best = Math.max(best, cov.ratio);
      log("speak.attempt", `slide ${slide.no} try ${tries} coverage ${Math.round(cov.ratio * 100)}% missed: ${cov.miss.slice(0, 6).join(", ") || "none"}`);
      S.metrics.missed.push(...cov.miss);
      ctl.querySelector("#att").textContent = `attempt ${tries}/3 · best ${Math.round(best * 100)}%`;
      if (tries >= 3 || best >= .8) { go.disabled = true; return res({ best }); }
      if (!ctl.querySelector("#ok")) { const b = document.createElement("button"); b.className = "btn ghost"; b.id = "ok"; b.type = "button"; b.textContent = "Use this attempt"; b.onclick = () => { go.disabled = true; b.remove(); res({ best }); }; go.parentElement.appendChild(b); }
    };
  });
}

export async function actSpeak(slide, { kicker, title, zh, on } = {}) {
  const body = openSheet(kicker, title, zh);
  const tw = targetWords(slide.script, 3);
  body.innerHTML = hintP("Listen to the model, then read the passage aloud. Key words are underlined; the browser scores how much of the passage it heard.", "先聽示範，再大聲唸出段落。關鍵字有底線；瀏覽器會計算聽到了多少。")
    + `<div class="passage target" id="tg">${esc(slide.script).replace(new RegExp(`\\b(${tw.map(t => t.word).join("|")})\\b`, "g"), "<u>$1</u>")}</div>
    <div class="row"><button class="btn ghost" type="button" id="demo">🔊 Listen to a model</button></div><div id="ctl"></div><div id="tiers">${tiersHtml()}</div>`;
  body.querySelector("#demo").onclick = () => { log("speak.demo", `slide ${slide.no}`); speak(slide.script, "speaker"); };
  const ctl = body.querySelector("#ctl"); let out;
  for (;;) {
    body.querySelector("#tiers").innerHTML = tiersHtml();
    if (S.speech === "browser") out = await browserPanel(body, slide, on);
    else if (S.speech === "record") { on?.start?.(); out = await recordPanel(ctl, 60000, `slide ${slide.no}`); on?.stop?.(); }
    else { const a = await micHelp(ctl); if (a === "retry") { S.speech = detectSpeech(); continue; } out = { skipped: true }; }
    if (!out.fail) break;
  }
  if (out.best != null) {
    const n = Math.max(1, starsFromRatio(out.best)); S.metrics.speakBest.push(out.best);
    await finishRow(body, n, `Best coverage ${Math.round(out.best * 100)}%. Red words were missed or not recognized; they build your "words to practise" list.`, "紅字是漏念或辨識不到的字，會累積成「待練習單字」清單。");
    closeSheet(); addStars(n, "Speaking");
  } else if (out.pending) {
    await finishRow(body, "pending", "Recording sent. The stars for this step arrive after the teacher grades it; the story continues.", "錄音已送出，星數等老師評分後補上，不影響劇情。");
    closeSheet(); addStars("pending", "Speaking");
  } else {
    log("speak.skip", `slide ${slide.no} skipped (no microphone)`);
    await finishRow(body, "skip", "This step is marked incomplete. The teacher can see it in the Learning Log.", "此關記為未完成，老師後台看得到。");
    closeSheet(); addStars("skip", "Speaking");
  }
}
