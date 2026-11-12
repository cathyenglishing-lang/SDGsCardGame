// SDG 4 Pecha Kucha Stage — the simple version: one storyline, one ending.
// The student learns why they are speaking (the talk's message) and how a Pecha Kucha works, walks to
// the Waterfront Theater and gives the full SDG 4-1 talk. Two paces: practice (30 s a slide, model
// reading and "redo this slide", repeat as often as wanted) and formal (20 s, no pause, no going back).
// Each part opens with a card on what it does; each slide shows a Chinese gist and key words; between
// slides the big screen shows what the audience heard (browser speech recognition, where available).
import { quality, manager, setMood, start, addUpdate, renderer, scene, camera, perfInfo } from "../world/scene.js";
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
import { log, startRun, finishRun, flushNow } from "../telemetry.js";
import { S } from "../state.js";
import { $, esc, wait, pick, rand } from "../util.js";
import { startAmbience, setMuted, isMuted, applause } from "../audio.js";
import { getRate, cycleRate, listen, detectSpeech, speechFailed, speak, stopSpeaking } from "../speech.js";
import { coverage } from "../vocab.js";
import { accountAvatar } from "../account.js";
import { enableCinematic } from "../world/post.js";
import * as C from "../world/cinematic.js";
import { TALK } from "./talk.js";
import { THESIS, PARTS, SLIDES as GUIDE } from "./guide.js";

const Q = new URLSearchParams(location.search);
const FAST = Q.has("fast");                    // ?fast=1: test aid only
const QUICK = Q.has("quick");                  // "practise again" / "go formal": straight to backstage
const PACE = { practice: 30, formal: 20 };
let PRACTICE = Q.get("mode") !== "formal";
let SLIDE_SEC = 20;                            // set when the run starts
const RESULT_SEC = FAST ? 1 : 3;               // the big screen shows what the audience heard between slides
const partSec = () => FAST ? 1 : PRACTICE ? 9 : 5;
const FOOTER = "SDG 4 · QUALITY EDUCATION";
const SLIDES = TALK.stages.flatMap((st, si) => st.slides.map(s => ({ ...s, stage: st, si })));
if (["A2", "B1", "B2"].includes(Q.get("lv"))) S.level = Q.get("lv");

const avatarKind = accountAvatar();
wireHints();
$("#sound").onclick = () => { setMuted(!isMuted()); $("#sound").textContent = isMuted() ? "🔇" : "🔊"; };
const showRate = r => { $("#rateBtn").textContent = `Speed ${r}×`; };
showRate(getRate()); $("#rateBtn").onclick = () => showRate(cycleRate());
// ── loading: one bar for the whole set-up ──
// The loading manager only knows about downloads (characters, textures), so the other steps report themselves:
// harbor 0–20 %, downloads 20–72 %, the theater set 72–82 %, the cast 82–94 %, lights and shaders 94–100 %.
// The bar never goes back, and paint() lets the browser draw it between two heavy steps.
let shown = 0;
function loadTo(p, label) {
  shown = Math.max(shown, Math.min(100, Math.round(p)));
  $("#loadBar").style.width = shown + "%"; $("#loadPct").textContent = shown + "%"; $("#loadTrack").setAttribute("aria-valuenow", shown);
  if (label) $("#loadLabel").textContent = label;
}
const paint = () => new Promise(r => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 120); });
manager.onProgress = (url, loaded, total) => loadTo(20 + loaded / total * 52, "Loading the cast and textures 載入角色與貼圖");
loadTo(4, "Building the harbor 建造港口"); await paint();

setMood("dusk");
buildHarbor(); loadTo(12); await paint();
buildDressing(); buildTraffic(); loadTo(20, "Loading the cast and textures 載入角色與貼圖"); await paint();
drawScreen("PECHA KUCHA", TALK.title, "20 slides · six parts", FOOTER);
start();

let introA = 0;
const introDrift = addUpdate(dt => { if (S.started) return; introA += dt * 0.025; shot([27 + Math.sin(introA) * 40, 18, 30 + Math.cos(introA) * 30], [27, 3, 5], { k: 1.2 }); });

const theaterModel = C.loadTheater(manager);       // the Blender set downloads next to the characters
await loadCharacterAssets(); await theaterModel;
loadTo(72, "Setting the stage 佈置舞台"); await paint();
C.initStage();                                      // lights, beams, dust, the set, the story's props (js/world/cinematic.js)
loadTo(82, "Seating the audience 觀眾入座"); await paint();
let LOAD_MS = 0, INTRO_AT = 0;                        // set by stageReady(): page open → stage ready

// ── learning data (v2, 2026-11-12): where the time goes and where a student leaves ──
// PHASES: ms spent in each part of the visit (load, intro, pier, walk, backstage, present, ending).
// A slide's own numbers (dwell, attempts, heard) travel on pk.slide; pk.slide.start marks every attempt so a
// student who leaves in the middle of a slide still shows up at that slide. page.hide marks leaving the tab.
const PHASES = {};
let phase = "intro", phaseT = performance.now(), curSlide = null;
function enter(name) {
  const now = performance.now(); const ms = Math.round(now - phaseT);
  PHASES[phase] = (PHASES[phase] || 0) + ms;
  log("phase", `${phase} → ${name}`, { phase: name, prev: phase, prev_ms: ms });
  phase = name; phaseT = now;
}
const phaseTotals = () => ({ ...PHASES, [phase]: (PHASES[phase] || 0) + Math.round(performance.now() - phaseT) });
document.addEventListener("visibilitychange", () => {
  if (!S.started) return;
  if (document.hidden) { log("page.hide", `${phase}${curSlide ? " · slide " + curSlide : ""}`, { phase, slide: curSlide }); flushNow(); }
  else log("page.show", `${phase}${curSlide ? " · slide " + curSlide : ""}`, { phase, slide: curSlide });
});

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
C.bindCast({ player, audience });
loadTo(94, "Lighting and lenses 打光與鏡頭"); await paint();
enableCinematic();                                  // bloom, depth of field, grade; steps down by itself on a slow device (js/world/post.js)
try { renderer.compile(scene, camera); } catch (e) { /* shaders then compile on first use */ }
loadTo(100, "Ready 準備好了"); await paint();
$("#loading").hidden = true; window.__stageReady = true;
LOAD_MS = Math.round(performance.now()); PHASES.load = LOAD_MS; INTRO_AT = performance.now(); phaseT = INTRO_AT;   // performance.now() counts from navigation start
window.__dbg = { S, player, lin, audience, SLIDES, C, perfInfo };

const LIN = { actor: lin };
const t = (en, zh, o = {}) => say(LIN, { who: "Ms. Lin", role: "Your teacher", voice: "mei", en, zh, ...o }, player);

// ── intro: level and pace ──
const pressed = (box, b) => box.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
$("#lvPick").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.lv === S.level));
$("#modePick").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", (b.dataset.mode === "practice") === PRACTICE));
$("#lvPick").onclick = e => { const b = e.target.closest("[data-lv]"); if (!b) return; S.level = b.dataset.lv; pressed($("#lvPick"), b); };
$("#modePick").onclick = e => { const b = e.target.closest("[data-mode]"); if (!b) return; PRACTICE = b.dataset.mode === "practice"; pressed($("#modePick"), b); };
$("#startBtn").onclick = () => run();
if (QUICK) run(); else $("#intro").hidden = false;

async function run() {
  if (S.started) return;
  $("#intro").hidden = true; S.started = true; S.t0 = performance.now(); introDrift();
  SLIDE_SEC = FAST ? 2 : PRACTICE ? PACE.practice : PACE.formal;
  const mode = PRACTICE ? "practice" : "formal";
  startAmbience();
  PHASES.intro = Math.round(performance.now() - INTRO_AT); phase = QUICK ? "backstage" : "pier"; phaseT = performance.now();
  log("run.start", `SDG 4 stage, level ${S.level}, ${mode} (${SLIDE_SEC} s)`, { level: S.level, avatar: S.avatar, mode, quick: QUICK, load_ms: LOAD_MS, intro_ms: PHASES.intro, hq: (quality.tier ?? 1) >= 2, tier: quality.tier ?? null, mobile: !!quality.mobile, vw: innerWidth, vh: innerHeight, speech: detectSpeech() === "browser" ? "listen" : "read", dpr: +(devicePixelRatio || 1).toFixed(2) });
  startRun({ game: "sdg4-stage", chapter: "4-1", level: S.level, avatar: S.avatar, client: `${mode} · ` + navigator.userAgent.slice(0, 150) });
  $("#hud").hidden = false; $("#lvChip").textContent = `${S.level} · ${PRACTICE ? "練習 Practice" : "正式 Formal"}`;
  const clock = setInterval(() => { $("#clock").textContent = mmss((performance.now() - S.t0) / 1000); }, 500);

  if (!QUICK) {
    // ── 1. The pier: why you are speaking, then how a Pecha Kucha works ──
    await fade(true, 10); shot([9, 2.6, -15.5], [12, 1.6, -9], { instant: true }); await fade(false, 700);
    await titleCard({ kicker: "SDG 4 · Quality Education", title: "Your first Pecha Kucha", zh: "你的第一場 Pecha Kucha" }, 2200);
    await t("Welcome! You are a university student, and today you speak at the harbor festival. Your audience is students and teachers.", "歡迎！你是大學生，今天要在港口的活動上演講，台下是同學和老師。");
    await t("Your message: Taiwan's schools look great on paper, but not every child gets the same chance in science. You want the audience to help make it fair.", "你的主張：台灣的教育數字很亮眼，但不是每個孩子在科學課都有一樣的機會。你要請觀眾一起讓它更公平。");
    await t("You will give it as a Pecha Kucha: 20 slides, and each slide moves on by itself. You cannot stop and you cannot go back.", "你要用 Pecha Kucha 的形式來講：20 張投影片，每張時間到就自動換頁，不能暫停、不能倒回。");
    await t("The talk has six parts. Before each part, a card tells you what that part does. Under every slide, a Chinese note tells you what it means.", "這場演講有六個部分。每一段開始前，會有卡片說明這一段在做什麼；每張投影片下面也有一句中文重點。");
    await t(PRACTICE
      ? "Today you practise: 30 seconds a slide. You can hear a model reading, redo a slide, and practise as many times as you like. Then try the real 20 seconds!"
      : "Today is the real thing: 20 seconds a slide. Read out loud and keep going. Let's walk to the Waterfront Theater!",
      PRACTICE ? "今天先練習：每張 30 秒，可以聽示範朗讀、可以重來一張，想練幾次都可以。練熟了再挑戰正式的 20 秒！" : "今天是正式上場：每張 20 秒。念出聲、不要停。我們走去海濱劇場吧！");

    // ── 2. Walk to the theater ──
    enter("walk");
    await walkTo([14, 8], "Waterfront Theater");
  }
  lin.setPos(...SPOTS.meiTheater); lin.face(27, 5, true);

  // ── 3. Backstage: the talk map and a microphone check ──
  await fade(true, 450);
  player.setPos(16.5, 0.9, 5.5); player.face(27, 5.5, true);
  shot([15, 2.4, 9.5], [18, 1.5, 4.5], { instant: true });
  await fade(false, 450);
  if (phase !== "backstage") enter("backstage");
  await talkMap();

  // ── 4. On stage ──
  const crane = C.entrance();
  await player.walk(PATHS.stageEntry, { speed: 1.5 });
  await crane;
  player.face(27, 20); audience.forEach(a => a.faceTo(player));
  enter("present");
  await present();

  // ── 5. The one ending ──
  enter("ending"); curSlide = null;
  clearInterval(clock);
  const secs = Math.round((performance.now() - S.t0) / 1000);
  // The talk is over: the result goes to the server NOW, before the applause and Ms. Lin's words, so a student who
  // closes the page during them still has a finished talk (chips, a report), not one that looks abandoned.
  const heard = HEARD.filter(x => x != null); const avg = heard.length ? heard.reduce((a, b) => a + b, 0) / heard.length : null;
  const phases = phaseTotals();
  log("ending", PRACTICE ? "Practice complete" : "Your first Pecha Kucha", { key: PRACTICE ? "practice" : "formal", seconds: secs, heardAvg: avg, redo: REDO, model: MODEL, phases });
  const resP = finishRun({ ending: PRACTICE ? "practice" : "formal", metrics: { seconds: secs, level: S.level, mode: PRACTICE ? "practice" : "formal", slideSec: SLIDE_SEC, slides: SLIDES.length, heardAvg: avg, heard: HEARD, speech: MODE, redo: REDO, model: MODEL,
    quick: QUICK, phases, dwell: DWELL, attempts: ATTEMPTS, completed: SLIDES.length, v: 2, gfx: { ...perfInfo(), steps: C.stageInfo().steps } } });
  drawScreen("THANK YOU", TALK.title, `Presented by you · 20 slides × ${SLIDE_SEC} seconds`, FOOTER);
  C.finale(); applause(4);                                  // the lights come up and the camera lifts away
  audience.forEach((a, i) => setTimeout(() => a.play("react"), i * 120)); player.play("idle");
  await wait(2500);
  lin.faceTo(player);
  await say(LIN, PRACTICE
    ? { who: "Ms. Lin", role: "Your teacher", voice: "mei", en: "Good practice! You know the story now: the problem, the good news, the solutions and your ask. Practise again, or try the real 20 seconds.", zh: "練得很好！你已經知道整個故事：問題、好消息、解方，還有你的請求。可以再練一次，或挑戰正式的 20 秒。" }
    : { who: "Ms. Lin", role: "Your teacher", voice: "mei", en: "Wonderful! Twenty slides, twenty seconds each, and you never stopped. That is the Pecha Kucha spirit.", zh: "太棒了！20 張投影片、每張 20 秒，你一次都沒有停下來。這就是 Pecha Kucha 的精神。" });
  showEnding(secs, await resP);
}

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
const MISSED = new Map();                      // word → slides where it was missed (final attempt of each slide)
const HEARD = [], DWELL = [], ATTEMPTS = [];   // per slide: share heard, ms on the slide (all attempts), attempts
let FAIL_CODE = null, REDO = 0, MODEL = 0;
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
// Listen for the whole slide: Chrome ends recognition after a pause, so restart until time is up
// (or until `cancel()` says the slide is being redone).
async function listenSlide(ms, onText, cancelled) {
  const end = performance.now() + ms; let text = "";
  while (MODE === "listen" && !cancelled() && performance.now() < end - 600) {
    const r = await listen(end - performance.now(), t => onText((text + " " + t).trim()));
    if (!r.ok && speechFailed(r.code)) { MODE = "read"; FAIL_CODE = r.code; log("speech.mode", `read only (${r.code})`, { code: r.code }); break; }
    text = (text + " " + (r.text || "")).trim();
  }
  return text;
}

// ── wrapping text on the big screen (handles Chinese, which has no spaces) ──
function wrapText(g, text, x, y, maxW, lh, maxY) {
  const units = /[㐀-鿿]/.test(text) ? [...text] : text.split(/(\s+)/);
  let line = "";
  for (const u of units) {
    if (g.measureText(line + u).width > maxW && line.trim()) { g.fillText(line.trim(), x, y); y += lh; line = u.trimStart(); if (y > maxY) return y; }
    else line += u;
  }
  if (line.trim()) g.fillText(line.trim(), x, y);
  return y + lh;
}
// Big screen: the percentage heard, the script with heard words green and missed ones red, and the gist.
function drawHeard(n, s, cov) {
  const g = screenCanvas.getContext("2d"); const W = 1024, Hh = 576, pct = Math.round(cov.ratio * 100);
  const tone = pct >= 70 ? "#5fc79b" : pct >= 40 ? "#ffc54d" : "#ff7466";
  const gr = g.createLinearGradient(0, 0, W, Hh); gr.addColorStop(0, "#101c28"); gr.addColorStop(1, "#1d3246");
  g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  g.fillStyle = "#fd6925"; g.font = "600 26px 'Chakra Petch', sans-serif"; g.fillText(`SLIDE ${n} / ${SLIDES.length} · WHAT THE AUDIENCE HEARD`, 56, 100);
  g.fillStyle = tone; g.font = "700 84px 'Chakra Petch', sans-serif"; g.fillText(`${pct}%`, 56, 192);
  g.fillStyle = "#cfd8e0"; g.font = "500 24px 'Manrope', sans-serif"; g.fillText(s.title, 290, 140);
  g.fillStyle = "#2a3d4d"; g.fillRect(290, 158, 670, 16); g.fillStyle = tone; g.fillRect(290, 158, 670 * cov.ratio, 16);
  const hit = new Set(cov.hit.map(w => w.toLowerCase())), miss = new Set(cov.miss.map(w => w.toLowerCase()));
  g.font = "500 27px 'Manrope', sans-serif"; let x = 56, y = 252; const maxX = W - 56, lh = 38;
  for (const w of s.text[S.level].split(/\s+/)) {
    const k = w.toLowerCase().replace(/[^a-z0-9'’-]/g, "");
    g.fillStyle = hit.has(k) ? "#5fc79b" : miss.has(k) ? "#ff7466" : "#8fa3b3";
    const ww = g.measureText(w + " ").width; if (x + ww > maxX) { x = 56; y += lh; } if (y > 400) break;
    g.fillText(w, x, y); x += ww;
  }
  const gist = GUIDE[s.no]?.zh;
  if (gist) { g.fillStyle = "#ffc54d"; g.font = "500 26px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"; wrapText(g, "重點：" + gist, 56, Math.max(y + 56, 446), W - 112, 36, 500); }
  g.fillStyle = "#8fa3b3"; g.font = "500 20px 'Chakra Petch', sans-serif"; g.fillText("GREEN = HEARD · RED = MISSED · " + FOOTER, 56, 552);
  screenTex.needsUpdate = true;
}

function talkMap() {
  return new Promise(res => {
    $("#mapThesis").innerHTML = `<b>Your message 你的主張</b>${esc(THESIS.en)}<span>${esc(THESIS.zh)}</span>`;
    $("#mapList").innerHTML = TALK.stages.map(st => `
      <li><div class="mp-head"><b>Part ${st.part} · ${esc(st.en)}</b><span>${esc(st.zh)}</span><em>${st.slides.length} slides · ${st.slides.length * SLIDE_SEC} s</em></div>
        <p class="mp-what">${esc(PARTS[st.part].zh)}</p>
        <ol start="${st.slides[0].no}">${st.slides.map(s => `<li>${esc(s.title)}</li>`).join("")}</ol></li>`).join("");
    $("#mapPace").textContent = PRACTICE ? `練習：每張 ${SLIDE_SEC} 秒，可聽示範、可重來一張` : `正式：每張 ${SLIDE_SEC} 秒，不能暫停、不能倒回`;
    $("#map").hidden = false;
    log("map.open", "talk map");
    micCheckUI();
    $("#mapGo").onclick = () => { $("#map").hidden = true; listen.stop && listen.stop(); res(); };
  });
}

// Key words underlined in the script; each guide entry is "form|form" and matches whole words.
function markKeywords(text, kws) {
  let html = esc(text);
  for (const [forms] of kws) {
    const re = new RegExp(`\\b(${forms.split("|").map(f => f.replace(/[.*+?^${}()[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|")})\\b`, "gi");
    html = html.replace(re, "<u>$1</u>");
  }
  return html;
}

// Part card: what this part does in the talk and the language it uses (pauses the slide clock).
function partCard(st) {
  const tele = $("#tele"); tele.classList.add("partmode");
  const p = PARTS[st.part];
  $("#telePartCard").innerHTML = `<small>Part ${st.part} of 6 · ${st.slides.length} slides</small>
    <h3>${esc(st.en)} <span>${esc(st.zh)}</span></h3><p class="pc-what">${esc(p.zh)}</p><p class="pc-lang"><b>語言重點</b>${esc(p.lang)}</p>
    <div class="row"><button class="btn" id="partGo" type="button">Start this part ▸</button><span class="count" id="partSec"></span></div>`;
  log("pk.part", `part ${st.part} ${st.en}`, { part: st.part });
  return new Promise(res => {
    let left = partSec();
    const tick = () => { $("#partSec").textContent = `${left} s`; if (left-- <= 0) go(); };
    const timer = setInterval(tick, 1000); tick();
    function go() { clearInterval(timer); tele.classList.remove("partmode"); res(); }
    $("#partGo").onclick = go;
  });
}

async function present() {
  const tele = $("#tele"); tele.hidden = false;
  tele.classList.toggle("practice", PRACTICE);
  $("#teleThesis").innerHTML = `<b>Your message</b> ${esc(THESIS.en)}${hint(THESIS.zh)}`;
  $("#teleParts").innerHTML = TALK.stages.map((st, i) => `<span data-i="${i}" title="${esc(st.zh)}">${st.part} ${esc(st.en)}</span>`).join("");
  // Light, air, props and the camera move of each slide come from its `cue` in talk.js (C.cue). The moves never look
  // through the audience tiers, and aim low: the teleprompter covers the lower third, so the speaker sits high.
  let lastStage = -1;
  for (const [i, s] of SLIDES.entries()) {
    S.stage = s.si;
    if (s.si !== lastStage) {
      lastStage = s.si;
      $("#teleParts").querySelectorAll("span").forEach(x => { const k = +x.dataset.i; x.className = k < s.si ? "done" : k === s.si ? "now" : ""; });
      drawScreen(`PART ${s.stage.part} OF 6`, s.stage.en, PARTS[s.stage.part].lang, FOOTER);
      player.play("idle"); C.partCue();
      if (i) audience.forEach((a, k) => setTimeout(() => a.play("react"), k * 90));
      const pc0 = performance.now(); curSlide = null;
      await partCard(s.stage);
      log("pk.part.read", `part ${s.stage.part} card`, { part: s.stage.part, ms: Math.round(performance.now() - pc0) });
    }
    const g = GUIDE[s.no] || { zh: "", kw: [] };
    const slideT0 = performance.now(); let att = 0; curSlide = s.no;
    for (;;) { // one slide; practice can redo it or hear the model first
      att++;
      log("pk.slide.start", `slide ${s.no} attempt ${att}`, { slide: s.no, part: s.stage.part, attempt: att });
      drawScreen(`SLIDE ${i + 1} / ${SLIDES.length}`, s.title, `Part ${s.stage.part} · ${s.stage.en}`, FOOTER);
      { const n = s.stage.slides.length, k = s.stage.slides.findIndex(x => x.no === s.no); C.cue(s.cue, SLIDE_SEC, n > 1 ? k / (n - 1) : 0); }
      player.play("talk");
      $("#teleCount").textContent = `${i + 1} / ${SLIDES.length}`;
      $("#telePart").textContent = `Part ${s.stage.part} · ${s.stage.en}`;
      $("#teleTitle").innerHTML = esc(s.title) + hint(s.zh);
      $("#teleText").innerHTML = markKeywords(s.text[S.level], g.kw);
      $("#teleText").scrollTop = 0;
      $("#teleGist").textContent = g.zh ? "重點：" + g.zh : "";
      $("#teleKw").innerHTML = g.kw.filter(([forms]) => new RegExp(`\\b(${forms.split("|").join("|")})\\b`, "i").test(s.text[S.level]))
        .map(([forms, zh]) => `<span><b>${esc(forms.split("|").find(f => new RegExp(`\\b${f}\\b`, "i").test(s.text[S.level])) || forms.split("|")[0])}</b> ${esc(zh)}</span>`).join("");
      $("#teleHeard").textContent = MODE === "listen" ? "🎙 …" : "";
      let action = null; const t0 = performance.now();
      const heardP = MODE === "listen" ? listenSlide(SLIDE_SEC * 1000, txt => { $("#teleHeard").textContent = "🎙 " + (txt.length > 110 ? "…" + txt.slice(-110) : txt); }, () => !!action) : Promise.resolve(null);
      await new Promise(done => {
        const stop = a => { action = a; clearInterval(tick); done(); };
        $("#teleRedo").onclick = () => stop("redo");
        $("#teleModel").onclick = () => stop("model");
        const tick = setInterval(() => {
          const el = (performance.now() - t0) / 1000;
          $("#teleSec").textContent = Math.max(0, Math.ceil(SLIDE_SEC - el));
          $("#teleBar").style.width = Math.min(100, el / SLIDE_SEC * 100) + "%";
          if (el >= SLIDE_SEC) stop("done");
        }, 100);
      });
      listen.stop && listen.stop();
      const said = await heardP;
      if (action === "redo") { REDO++; log("pk.redo", `slide ${s.no}`, { slide: s.no, attempt: att, at_ms: Math.round(performance.now() - t0) }); continue; }
      if (action === "model") {
        // the model reads the slide (nobody is listening meanwhile), then the student tries it fresh
        MODEL++; log("pk.model", `slide ${s.no}`, { slide: s.no, attempt: att });
        player.play("idle"); $("#teleHeard").textContent = "🔊 示範朗讀中… Listen to the model"; $("#teleSec").textContent = "—";
        await speak(s.text[S.level], "speaker");
        continue;
      }
      const dwell = Math.round(performance.now() - slideT0); DWELL[i] = dwell; ATTEMPTS[i] = att;
      const common = { slide: s.no, part: s.stage.part, dwell_ms: dwell, attempt_ms: Math.round(performance.now() - t0), attempts: att, redo: att - 1 };
      if (said != null && MODE === "listen") {
        // the comparison goes up on the big screen, then the camera returns to the speaker for the next slide
        const cov = coverage(s.text[S.level], said); HEARD[i] = cov.ratio;
        for (const w of cov.miss) MISSED.set(w.toLowerCase(), (MISSED.get(w.toLowerCase()) || 0) + 1);
        log("pk.slide", `slide ${s.no} (${s.stage.en}) heard ${Math.round(cov.ratio * 100)}%`, { ...common, heard: cov.ratio, missed: cov.miss.slice(0, 8), hit: cov.hit.length, miss: cov.miss.length,
          words: s.text[S.level].split(/\s+/).length, said_words: said.split(/\s+/).filter(Boolean).length, engine: "listen" });
        drawHeard(i + 1, s, cov); tele.hidden = true; player.play("idle");
        C.holdCamera(); shot([27, 5.6, 16], [27, 5.9, 2.2]);
        if (cov.ratio >= 0.7) audience.forEach((a, k) => k % 3 === 0 && a.play("react"));
        await wait(RESULT_SEC * 1000);
        tele.hidden = false;
      } else {
        HEARD[i] = null;
        log("pk.slide", `slide ${s.no} (${s.stage.en})`, { ...common, words: s.text[S.level].split(/\s+/).length, engine: "read" });
      }
      break;
    }
  }
  stopSpeaking();
  tele.hidden = true;
}

// ── chips (2026-11-12): paid for the words read correctly; at most 3 paid runs per account per day ──
const REASON = { "sdg4.read": ["Words you read correctly", "念對的字"], "sdg4.formal": ["The real 20-second talk", "完成正式 20 秒"] };
const signedIn = () => { try { const u = JSON.parse(localStorage.getItem("user") || "null"); return !!(u && u.access_token); } catch (e) { return false; } };
function chipsBlock(res) {
  const c = res && res.chips, sc = res && res.score;
  const top = [...MISSED].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => esc(w)).join(", ");
  const words = sc && sc.accuracy != null
    ? `<p class="chip-words">You read <strong>${Math.round(sc.accuracy * 100)}%</strong> of the words the microphone could check (${sc.miss} missed).${hint("念對的字比例；麥克風沒聽到的算錯字。")}${top ? ` Practise: <em>${top}</em>` : ""}</p>` : "";
  let head;
  if (!signedIn()) head = `<p class="chip-note">Sign in with your class account to earn chips.${hint("用班級帳號登入才有籌碼。")}</p>`;
  else if (!c) head = `<p class="chip-note">Your talk is saved, but chips could not be worked out just now.${hint("這次的紀錄已存好，只是現在算不出籌碼。")}</p>`;
  else if (c.test) head = `<p class="chip-note">Test accounts do not earn chips.${hint("測試帳號不給籌碼。")}</p>`;
  else if (c.run_limit && c.run_limit.used >= c.run_limit.limit && !(c.items || []).length)
    head = `<p class="chip-note">You have already earned chips from ${c.run_limit.limit} talks today. Come back tomorrow for more.${hint("今天已經領過 " + c.run_limit.limit + " 次，明天再來。")}</p>`;
  else {
    const rows = (c.items || []).map(i => { const [en, zh] = REASON[i.reason] || [i.reason, ""];
      return `<li><span>${esc(en)}${zh ? hint(zh) : ""}</span><b>${i.status === "capped" ? "full for today" : "+" + i.chips}</b></li>`; }).join("");
    const left = c.run_limit ? Math.max(0, c.run_limit.limit - c.run_limit.used - 1) : null;
    head = `<div class="chip-sum"><div class="chip-total"><small>Chips earned${hint("這次得到的籌碼")}</small><b>+${c.earned || 0}</b></div><ul>${rows}</ul></div>
      <p class="chip-note">${c.held ? "Your teacher will check this one before the chips are added.<br>" : ""}Balance: <strong>${c.balance}</strong>${left != null ? ` · ${left} more paid talk${left === 1 ? "" : "s"} today` : ""}${hint("最多每天 3 次有籌碼" + (c.held ? "；這次要老師確認後才入帳" : ""))}</p>`;
  }
  return `<div class="chips-end">${head}${words}</div>`;
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

function showEnding(secs, res) {
  const again = mode => `?quick=1&mode=${mode}&lv=${S.level}`;
  const card = TALK.stages.map(st => `<li><b>${esc(st.en)}</b> ${esc(PARTS[st.part].zh.split("：")[0].split("，")[0])}</li>`).join("");
  $("#endCard").innerHTML = `
    <span class="kicker">SDG 4 · Pecha Kucha Stage · ${PRACTICE ? "練習 Practice" : "正式 Formal"}</span>
    <h2 class="ending-title">${PRACTICE ? "Practice complete" : "Your First Pecha Kucha"}</h2>
    <p>You presented <strong>${esc(TALK.title)}</strong> at level ${S.level}: ${SLIDES.length} slides × ${SLIDE_SEC} seconds.${PRACTICE ? ` You redid ${REDO} slide${REDO === 1 ? "" : "s"} and heard the model ${MODEL} time${MODEL === 1 ? "" : "s"}.` : " The slides never waited for you."}${hint(PRACTICE ? "練習完成。熟了就挑戰正式的 20 秒。" : "你完成了正式的 Pecha Kucha：20 張投影片、每張 20 秒，一次都沒有停。")}</p>
    <div class="thesis-end"><b>Your message 你的主張</b>${esc(THESIS.en)}<span>${esc(THESIS.zh)}</span></div>
    <div class="sum">
      <div><small>Slides</small><b>${SLIDES.length}</b></div>
      <div><small>Talk time</small><b>${mmss(SLIDES.length * SLIDE_SEC)}</b></div>
      <div><small>Whole visit</small><b>${mmss(secs)}</b></div>
    </div>
    ${chipsBlock(res)}
    ${heardBlock()}
    <h3>The Pecha Kucha spirit${hint("Pecha Kucha 的精神")}</h3>
    <ul class="spirit">
      <li><b>20 × 20.</b> Short and focused: every slide gets the same 20 seconds.${hint("短而聚焦：每張投影片都只有 20 秒。")}</li>
      <li><b>Keep going.</b> The slides move on their own; there is no pause and no going back.${hint("投影片自動換頁，不能暫停也不能倒回。")}</li>
      <li><b>One idea per slide.</b> Tell a story with pictures, not a wall of text.${hint("每張一個重點，用圖說故事，不是念一大段字。")}</li>
      <li><b>Six parts.</b>${hint("這套教材的六段結構（Pecha Kucha 本身只規定 20 × 20）")}<ol class="parts">${card}</ol></li>
    </ul>
    <div class="row">
      ${PRACTICE
        ? `<a class="btn" href="${again("practice")}">Practise again 再練一次 ▸</a><a class="btn ghost" href="${again("formal")}">Try the real 20 s 挑戰正式</a>`
        : `<a class="btn" href="${again("formal")}">Present again 再挑戰一次 ▸</a><a class="btn ghost" href="${again("practice")}">Back to practice 回到練習</a>`}
      <a class="btn ghost" href="/pages/pecha_kucha_builder.html?topic=4-1&level=${S.level}">Practise with the card game</a>
      <a class="btn ghost" href="/pages/member_index.html">Back to games</a>
    </div>`;
  $("#ending").hidden = false;
}
