// SDG 4 Pecha Kucha Stage — the simple version: one storyline, one ending, about 9 minutes.
// The student meets a teacher on the pier, learns the Pecha Kucha rules, walks to the Waterfront
// Theater and reads the full SDG 4-1 talk on stage while the 20 slides advance every 20 seconds.
// No quizzes, scores or choices. Reuses the Innovation Harbor world (scene, cast, camera, roaming).
import { quality, manager, setMood, start, addUpdate } from "../world/scene.js";
import { buildHarbor, SPOTS, H, drawScreen, PATHS, screenCanvas, screenTex } from "../world/harbor.js";
import { buildDressing } from "../world/dressing.js";
import { buildTraffic } from "../world/traffic.js";
import { lanyard, dressRandom } from "../world/outfits.js";
import { loadCharacterAssets, makeActor, CROWD_KINDS, CROWD_TINTS } from "../world/characters.js";
import { shot, fade, frontShot } from "../world/camera.js";
import { startRoam, stopRoam } from "../world/roam.js";
import { say } from "../ui/bubble.js";
import { titleCard } from "../ui/fx.js";
import { wireHints, hint } from "../i18n.js";
import { log, startRun, finishRun } from "../telemetry.js";
import { S } from "../state.js";
import { $, esc, wait, pick, rand } from "../util.js";
import { startAmbience, setMuted, isMuted, applause } from "../audio.js";
import { getRate, cycleRate, listen, detectSpeech, speechFailed } from "../speech.js";
import { coverage } from "../vocab.js";
import { accountAvatar } from "../account.js";
import { TALK } from "./talk.js";

const FAST = new URLSearchParams(location.search).has("fast"); // ?fast=1: test aid only
const SLIDE_SEC = FAST ? 2 : 20;
const RESULT_SEC = FAST ? 1 : 3; // the big screen shows what the audience heard between slides
const FOOTER = "SDG 4 · QUALITY EDUCATION";
const SLIDES = TALK.stages.flatMap((st, si) => st.slides.map(s => ({ ...s, stage: st, si })));

const avatarKind = accountAvatar();
wireHints();
$("#sound").onclick = () => { setMuted(!isMuted()); $("#sound").textContent = isMuted() ? "🔇" : "🔊"; };
const showRate = r => { $("#rateBtn").textContent = `Speed ${r}×`; };
showRate(getRate()); $("#rateBtn").onclick = () => showRate(cycleRate());
manager.onProgress = (url, loaded, total) => { const p = Math.round(loaded / total * 100); $("#loadBar").style.width = p + "%"; $("#loadPct").textContent = p + "%"; };

setMood("dusk");
buildHarbor(); buildDressing(); buildTraffic();
drawScreen("PECHA KUCHA", TALK.title, "20 slides × 20 seconds", FOOTER);
start();

let introA = 0;
const introDrift = addUpdate(dt => { if (S.started) return; introA += dt * 0.025; shot([27 + Math.sin(introA) * 40, 18, 30 + Math.cos(introA) * 30], [27, 3, 5], { k: 1.2 }); });

await loadCharacterAssets();
$("#loading").hidden = true; $("#intro").hidden = false;

S.avatar = await avatarKind;
const player = makeActor(S.avatar, "Speaker");
const lin = makeActor("female", "Ms. Lin", { tint: S.avatar === "female" ? 0x4a6a9a : 0xc8d2e6 });
lin.idleVariant = 0; lanyard(lin);
player.setPos(10.4, 0.6, -12.5).face(12.6, -8.2, true);
lin.setPos(...SPOTS.mei).face(10.4, -12.5, true);
const loops = [PATHS.crowdA, PATHS.crowdB, PATHS.crowdC];
for (let i = 0; i < quality.crowd; i++) {
  const a = makeActor(pick(CROWD_KINDS), "pedestrian", { tint: pick(CROWD_TINTS) });
  const loop = loops[i % loops.length]; const k = Math.floor(Math.random() * loop.length);
  const pts = loop.slice(k).concat(loop.slice(0, k)); a.setPos(pts[0][0] + rand(-0.6, 0.6), 0.6, pts[0][1] + rand(-0.6, 0.6));
  a.walk(pts.slice(1).concat([pts[0]]), { speed: rand(1.1, 1.7), loop: true }); dressRandom(a, i);
}
const audience = [];
for (let i = 0; i < quality.audience; i++) {
  const t = H.tiers[i % H.tiers.length];
  const a = makeActor(pick(CROWD_KINDS), "audience", { tint: pick(CROWD_TINTS) });
  a.setPos(18 + (i * 2.3) % 18 + rand(-0.4, 0.4), t.y, t.z + rand(-0.3, 0.3)); a.face(27, 4, true);
  a.play("idle", { variant: i }); dressRandom(a, i + 40); audience.push(a);
}
window.__dbg = { S, player, lin, audience, SLIDES };

const LIN = { actor: lin };
const t = (en, zh, o = {}) => say(LIN, { who: "Ms. Lin", role: "Your teacher", voice: "mei", en, zh, ...o }, player);

$("#lvPick").onclick = e => { const b = e.target.closest("[data-lv]"); if (!b) return; S.level = b.dataset.lv; $("#lvPick").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); };
$("#startBtn").onclick = async () => {
  if (S.started) return;
  $("#intro").hidden = true; S.started = true; S.t0 = performance.now(); introDrift();
  startAmbience();
  log("run.start", `SDG 4 stage, level ${S.level}, avatar ${S.avatar}`, { level: S.level, avatar: S.avatar });
  startRun({ game: "sdg4-stage", chapter: "4-1", level: S.level, avatar: S.avatar, client: navigator.userAgent.slice(0, 160) });
  $("#hud").hidden = false; $("#lvChip").textContent = S.level;
  const clock = setInterval(() => { $("#clock").textContent = mmss((performance.now() - S.t0) / 1000); }, 500);

  // ── 1. The pier: what Pecha Kucha is ──
  await fade(true, 10); shot([9, 2.6, -15.5], [12, 1.6, -9], { instant: true }); await fade(false, 700);
  await titleCard({ kicker: "SDG 4 · Quality Education", title: "Your first Pecha Kucha", zh: "你的第一場 Pecha Kucha" }, 2200);
  await t("Welcome! Today you will give your first Pecha Kucha talk. The topic is SDG 4, Quality Education in Taiwan.", "歡迎！今天你要完成第一場 Pecha Kucha 演講，主題是 SDG 4：台灣的優質教育。");
  await t("Pecha Kucha means \"chit-chat\" in Japanese. The rule is simple: 20 slides, 20 seconds each. That is only 6 minutes and 40 seconds.", "Pecha Kucha 是日文「閒聊」的意思。規則很簡單：20 張投影片，每張 20 秒，總共只有 6 分 40 秒。");
  await t("The slides change by themselves. You cannot stop, and you cannot go back. If you miss a word, just keep going.", "投影片會自動換頁，不能暫停、不能倒回。漏掉一個字也沒關係，繼續往下講。");
  await t("Read each slide out loud. One slide, one idea. After each slide, the big screen shows how much of it the audience heard.", "每張投影片都要念出聲，一張一個重點。每張念完，大螢幕會顯示觀眾聽到了多少。");
  await t("A good talk has six parts: Introduction, Problem, Achievements, Solutions, Implications, and a Call to action. Your talk is ready. Let's walk to the Waterfront Theater!", "一場好的演講有六個部分：引言、問題、成就、解方、影響、行動呼籲。講稿已經準備好了，我們走去海濱劇場吧！");

  // ── 2. Walk to the theater ──
  await walkTo([14, 8], "Waterfront Theater");
  lin.setPos(...SPOTS.meiTheater); lin.face(27, 5, true);

  // ── 3. Backstage: the talk map ──
  await fade(true, 450);
  player.setPos(16.5, 0.9, 5.5); player.face(27, 5.5, true);
  shot([15, 2.4, 9.5], [18, 1.5, 4.5], { instant: true });
  await fade(false, 450);
  await talkMap();

  // ── 4. On stage: 20 slides × 20 seconds ──
  shot([27, 5.2, 17.5], [27, 2.4, 4], { k: 1.6 });
  await player.walk(PATHS.stageEntry, { speed: 1.5 });
  player.face(27, 20); audience.forEach(a => a.faceTo(player));
  await present();

  // ── 5. The one ending ──
  clearInterval(clock);
  const secs = Math.round((performance.now() - S.t0) / 1000);
  drawScreen("THANK YOU", TALK.title, "Presented by you · 20 slides × 20 seconds", FOOTER);
  shot([27, 5.2, 17.5], [27, 2.4, 4]); applause(4);
  audience.forEach((a, i) => setTimeout(() => a.play("react"), i * 120)); player.play("idle");
  await wait(2500);
  lin.faceTo(player);
  await say(LIN, { who: "Ms. Lin", role: "Your teacher", voice: "mei", en: "Wonderful! Twenty slides, twenty seconds each, and you never stopped. That is the Pecha Kucha spirit.", zh: "太棒了！20 張投影片、每張 20 秒，你一次都沒有停下來。這就是 Pecha Kucha 的精神。" });
  const heard = HEARD.filter(x => x != null); const avg = heard.length ? heard.reduce((a, b) => a + b, 0) / heard.length : null;
  log("ending", "Your first Pecha Kucha", { key: "first-talk", seconds: secs, heardAvg: avg });
  finishRun({ ending: "first-talk", metrics: { seconds: secs, level: S.level, slides: SLIDES.length, heardAvg: avg, heard: HEARD, mode: MODE } });
  showEnding(secs);
};

function mmss(sec) { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }

function walkTo([x, z], label) {
  return new Promise(res => {
    $("#walk").hidden = false; $("#walkName").textContent = label;
    const done = how => { $("#walk").hidden = true; log("move", `${how} to ${label}`); res(); };
    startRoam(player, [{ id: "theater", x, z, radius: 3, label, place: "Your stage", primary: true }], { onArrive: () => done("walk") });
    $("#walkSkip").onclick = async () => { stopRoam(); await fade(true, 350); player.setPos(x, 0.6, z); await wait(60); await fade(false, 350); done("skip"); };
  });
}

// ── speech: "listen" = live recognition and the big-screen comparison; "read" = read silently ──
let MODE = detectSpeech() === "browser" ? "listen" : "read";
const HEARD = [];
let FAIL_CODE = null;
// Why the browser could not listen, in words a student can act on. iPad Safari hands recognition to
// Siri / Dictation: with those off it fails at once ("service-not-allowed") and never asks for the microphone.
const IS_APPLE_TOUCH = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const HAS_SR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
function micHelp(code) {
  if (!HAS_SR) return {
    en: "This browser has no speech recognition, so you will read silently. Use Chrome or Edge on a computer, or Safari on an iPad.",
    zh: "這個瀏覽器沒有語音辨識功能，會改成默讀模式。請用電腦版 Chrome、Edge，或 iPad 的 Safari。" };
  if (IS_APPLE_TOUCH && ["service-not-allowed", "not-allowed"].includes(code)) return {
    en: "The iPad did not allow speech recognition. Turn it on, then press Try again.",
    zh: "iPad 沒有允許語音辨識。請依下面步驟開啟，再按「再試一次」。",
    steps: ["設定 → Siri（或「Apple Intelligence 與 Siri」）→ 開啟 Siri；或 設定 → 一般 → 鍵盤 → 開啟「啟用聽寫」",
            "設定 → 隱私權與安全性 → 語音辨識 → 允許 Safari",
            "設定 → App（或直接在設定裡）→ Safari → 麥克風 → 選「詢問」或「允許」",
            "回到這一頁按「再試一次」，看到詢問時按「允許」"] };
  if (code === "not-allowed") return { en: "The microphone is blocked for this site. Allow it, then press Try again.", zh: "這個網站的麥克風被封鎖了。請在網址列左側的設定允許麥克風，再按「再試一次」。" };
  if (code === "audio-capture") return { en: "No microphone was found. Connect one, then press Try again.", zh: "找不到麥克風。請接上或開啟麥克風，再按「再試一次」。" };
  if (code === "network") return { en: "Speech recognition needs an internet connection. Check the network, then press Try again.", zh: "語音辨識需要網路連線。請確認網路後按「再試一次」。" };
  return { en: `Speech recognition stopped (${code}). Press Try again, or read silently.`, zh: `語音辨識無法使用（${code}）。可以按「再試一次」，或直接默讀。` };
}
function micCheckUI(failCode) {
  const box = $("#micCheck");
  if (MODE !== "listen") {
    const h = micHelp(failCode);
    box.innerHTML = `<p class="mic-off">${esc(h.en)}${hint(h.zh)}</p>`
      + (h.steps ? `<ol class="mic-steps">${h.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol><p class="mic-note">選項名稱依 iPadOS 版本可能略有不同。</p>` : "")
      + (HAS_SR ? `<div class="row"><button class="btn ghost" id="micRetry" type="button">↻ Try again 再試一次</button>${failCode ? `<span class="count">code: ${esc(failCode)}</span>` : ""}</div>` : "");
    if ($("#micRetry")) $("#micRetry").onclick = () => { MODE = "listen"; log("speech.retry", failCode || ""); micCheckUI(); $("#micTest").click(); };
    return;
  }
  box.innerHTML = `<div class="row"><button class="btn ghost" id="micTest" type="button">🎙 Test my microphone</button><span class="count" id="micState">Say: “Hello everyone, today I will talk about SDG 4.”</span></div><p class="mic-heard" id="micHeard"></p>`;
  $("#micTest").onclick = async () => {
    $("#micTest").disabled = true; $("#micState").textContent = "Listening… 正在聽";
    const r = await listen(6000, t => { $("#micHeard").textContent = t; if (t.split(/\s+/).length >= 3) listen.stop && listen.stop(); });
    $("#micTest").disabled = false;
    if (!r.ok && speechFailed(r.code)) { MODE = "read"; log("speech.mode", `read only (${r.code})`, { code: r.code }); micCheckUI(r.code); return; }
    $("#micState").textContent = r.text ? "✓ The audience can hear you. 觀眾聽得到你。" : "Nothing heard. Check the microphone and try again. 沒有聽到聲音，請檢查麥克風再試一次。";
    log("speech.test", r.text ? "heard" : "silent", { heard: !!r.text });
  };
}
// Listen for the whole slide: Chrome ends recognition after a pause, so restart until time is up.
async function listenSlide(ms, onText) {
  const end = performance.now() + ms; let text = "";
  while (MODE === "listen" && performance.now() < end - 600) {
    const r = await listen(end - performance.now(), t => onText((text + " " + t).trim()));
    if (!r.ok && speechFailed(r.code)) { MODE = "read"; FAIL_CODE = r.code; log("speech.mode", `read only (${r.code})`, { code: r.code }); break; }
    text = (text + " " + (r.text || "")).trim();
  }
  return text;
}
// Big screen: the slide's script with the words the audience heard in green and the missed ones in red.
function drawHeard(n, s, cov) {
  const g = screenCanvas.getContext("2d"); const W = 1024, Hh = 576, pct = Math.round(cov.ratio * 100);
  const tone = pct >= 70 ? "#5fc79b" : pct >= 40 ? "#ffc54d" : "#ff7466";
  const gr = g.createLinearGradient(0, 0, W, Hh); gr.addColorStop(0, "#101c28"); gr.addColorStop(1, "#1d3246");
  g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  g.fillStyle = "#fd6925"; g.font = "600 28px 'Chakra Petch', sans-serif"; g.fillText(`SLIDE ${n} / ${SLIDES.length} · WHAT THE AUDIENCE HEARD`, 56, 108);
  g.fillStyle = tone; g.font = "700 96px 'Chakra Petch', sans-serif"; g.fillText(`${pct}%`, 56, 212);
  g.fillStyle = "#cfd8e0"; g.font = "500 26px 'Manrope', sans-serif"; g.fillText(s.title, 300, 150);
  g.fillStyle = "#2a3d4d"; g.fillRect(300, 170, 660, 18); g.fillStyle = tone; g.fillRect(300, 170, 660 * cov.ratio, 18);
  const hit = new Set(cov.hit.map(w => w.toLowerCase())), miss = new Set(cov.miss.map(w => w.toLowerCase()));
  g.font = "500 30px 'Manrope', sans-serif"; let x = 56, y = 282; const maxX = W - 56, lh = 44;
  for (const w of s.text[S.level].split(/\s+/)) {
    const k = w.toLowerCase().replace(/[^a-z0-9'’-]/g, "");
    g.fillStyle = hit.has(k) ? "#5fc79b" : miss.has(k) ? "#ff7466" : "#8fa3b3";
    const ww = g.measureText(w + " ").width; if (x + ww > maxX) { x = 56; y += lh; } if (y > Hh - 70) break;
    g.fillText(w, x, y); x += ww;
  }
  g.fillStyle = "#8fa3b3"; g.font = "500 22px 'Chakra Petch', sans-serif"; g.fillText("GREEN = HEARD · RED = MISSED · " + FOOTER, 56, 540);
  screenTex.needsUpdate = true;
}

function talkMap() {
  return new Promise(res => {
    $("#mapList").innerHTML = TALK.stages.map(st => `
      <li><div class="mp-head"><b>Part ${st.part} · ${esc(st.en)}</b><span>${esc(st.zh)}</span><em>${st.slides.length} slides · ${st.slides.length * SLIDE_SEC} s</em></div>
        <ol start="${st.slides[0].no}">${st.slides.map(s => `<li>${esc(s.title)}</li>`).join("")}</ol></li>`).join("");
    $("#map").hidden = false;
    log("map.open", "talk map");
    micCheckUI();
    $("#mapGo").onclick = () => { $("#map").hidden = true; listen.stop && listen.stop(); res(); };
  });
}

async function present() {
  const tele = $("#tele"); tele.hidden = false;
  $("#teleParts").innerHTML = TALK.stages.map((st, i) => `<span data-i="${i}" title="${esc(st.zh)}">${st.part} ${esc(st.en)}</span>`).join("");
  // Camera angles that never look through the audience tiers (they start at z 8.5): a high wide shot
  // from behind the back row, a stage-wing shot, and a close front shot from the stage edge.
  const shots = [
    () => shot([27, 6.4, 19.5], [27, -0.4, 4]),      // the teleprompter covers the lower third: aim low so the speaker sits high
    () => shot([17.2, 2.4, 6.8], [27, 0.4, 5.2]),
    () => frontShot(player, { dist: 2.4, height: 0.45, side: 0.5 }),
    () => shot([36.5, 2.6, 7.2], [26, 0.4, 4.5]),
  ];
  player.play("talk");
  let lastStage = -1;
  for (const [i, s] of SLIDES.entries()) {
    S.stage = s.si;
    if (s.si !== lastStage) {
      lastStage = s.si;
      $("#teleParts").querySelectorAll("span").forEach(x => { const k = +x.dataset.i; x.className = k < s.si ? "done" : k === s.si ? "now" : ""; });
      tele.classList.remove("newpart"); void tele.offsetWidth; tele.classList.add("newpart");
      if (i) audience.forEach((a, k) => setTimeout(() => a.play("react"), k * 90));
    }
    drawScreen(`SLIDE ${i + 1} / ${SLIDES.length}`, s.title, `Part ${s.stage.part} · ${s.stage.en}`, FOOTER);
    shots[(i * 2) % shots.length]();
    $("#teleCount").textContent = `${i + 1} / ${SLIDES.length}`;
    $("#telePart").textContent = `Part ${s.stage.part} · ${s.stage.en}`;
    $("#teleTitle").innerHTML = esc(s.title) + hint(s.zh);
    $("#teleText").textContent = s.text[S.level];
    $("#teleText").scrollTop = 0;
    $("#teleHeard").textContent = MODE === "listen" ? "🎙 …" : "";
    const t0 = performance.now(); let cut = false;
    const heardP = MODE === "listen" ? listenSlide(SLIDE_SEC * 1000, txt => { $("#teleHeard").textContent = "🎙 " + (txt.length > 110 ? "…" + txt.slice(-110) : txt); }) : Promise.resolve(null);
    await new Promise(done => {
      const tick = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        $("#teleSec").textContent = Math.max(0, Math.ceil(SLIDE_SEC - el));
        $("#teleBar").style.width = Math.min(100, el / SLIDE_SEC * 100) + "%";
        if (!cut && el > SLIDE_SEC / 2) { cut = true; shots[(i * 2 + 1) % shots.length](); }
        if (el >= SLIDE_SEC) { clearInterval(tick); done(); }
      }, 100);
    });
    listen.stop && listen.stop();
    const said = await heardP;
    if (said != null && MODE === "listen") {
      // the comparison goes up on the big screen, then the camera returns to the speaker for the next slide
      const cov = coverage(s.text[S.level], said); HEARD[i] = cov.ratio;
      log("pk.slide", `slide ${s.no} (${s.stage.en}) heard ${Math.round(cov.ratio * 100)}%`, { slide: s.no, part: s.stage.part, heard: cov.ratio, missed: cov.miss.slice(0, 8) });
      drawHeard(i + 1, s, cov); tele.hidden = true; player.play("idle");
      shot([27, 5.6, 16], [27, 5.9, 2.2]);
      if (cov.ratio >= 0.7) audience.forEach((a, k) => k % 3 === 0 && a.play("react"));
      await wait(RESULT_SEC * 1000);
      tele.hidden = false; player.play("talk");
    } else {
      HEARD[i] = null;
      log("pk.slide", `slide ${s.no} (${s.stage.en})`, { slide: s.no, part: s.stage.part });
    }
  }
  tele.hidden = true;
}

function heardBlock() {
  const vals = HEARD.filter(x => x != null);
  if (!vals.length) { const h = micHelp(FAIL_CODE); return `<p class="mic-off">This time you read silently, so there is no comparison. ${esc(h.en)}${hint("這次是默讀模式，沒有比對。" + h.zh)}</p>`; }
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100);
  const bars = SLIDES.map((s, i) => { const v = HEARD[i]; const cls = v == null ? "na" : v >= .7 ? "ok" : v >= .4 ? "mid" : "low";
    return `<i class="${cls}" title="Slide ${i + 1}: ${v == null ? "—" : Math.round(v * 100) + "%"}" style="height:${v == null ? 4 : Math.max(6, Math.round(v * 100))}%"></i>`; }).join("");
  return `<div class="heard"><small>What the audience heard, slide by slide${hint("每張投影片觀眾聽到的比例")}</small><div class="bars">${bars}</div>
    <p>Average: <strong>${avg}%</strong>. The red words on the big screen are the ones to practise next time.${hint("大螢幕上的紅字就是下次要多練習的字。")}</p></div>`;
}

function showEnding(secs) {
  const card = TALK.stages.map(st => `<li><b>${esc(st.en)}</b> ${esc(st.zh)}</li>`).join("");
  $("#endCard").innerHTML = `
    <span class="kicker">SDG 4 · Pecha Kucha Stage</span>
    <h2 class="ending-title">Your First Pecha Kucha</h2>
    <p>You presented <strong>${esc(TALK.title)}</strong> at level ${S.level}: ${SLIDES.length} slides × ${SLIDE_SEC} seconds, and the slides never waited for you.${hint("你完成了「台灣的優質教育」演講：20 張投影片、每張 20 秒，一次都沒有停。")}</p>
    <div class="sum">
      <div><small>Slides</small><b>${SLIDES.length}</b></div>
      <div><small>Talk time</small><b>${mmss(SLIDES.length * SLIDE_SEC)}</b></div>
      <div><small>Whole visit</small><b>${mmss(secs)}</b></div>
    </div>
    ${heardBlock()}
    <h3>The Pecha Kucha spirit${hint("Pecha Kucha 的精神")}</h3>
    <ul class="spirit">
      <li><b>20 × 20.</b> Short and focused: every slide gets the same 20 seconds.${hint("短而聚焦：每張投影片都只有 20 秒。")}</li>
      <li><b>Keep going.</b> The slides move on their own; there is no pause and no going back.${hint("投影片自動換頁，不能暫停也不能倒回。")}</li>
      <li><b>One idea per slide.</b> Tell a story with pictures, not a wall of text.${hint("每張一個重點，用圖說故事，不是念一大段字。")}</li>
      <li><b>Six parts.</b>${hint("六個部分")}<ol class="parts">${card}</ol></li>
    </ul>
    <div class="row">
      <button class="btn" type="button" id="again">Present again ▸</button>
      <a class="btn ghost" href="/pages/pecha_kucha_builder.html?topic=4-1&level=${S.level}">Practise with the card game</a>
      <a class="btn ghost" href="/pages/member_index.html">Back to games</a>
    </div>`;
  $("#ending").hidden = false;
  $("#again").onclick = () => location.reload();
}
