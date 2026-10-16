// SDG 4 Pecha Kucha Stage — the simple version: one storyline, one ending, about 9 minutes.
// The student meets a teacher on the pier, learns the Pecha Kucha rules, walks to the Waterfront
// Theater and reads the full SDG 4-1 talk on stage while the 20 slides advance every 20 seconds.
// No quizzes, scores or choices. Reuses the Innovation Harbor world (scene, cast, camera, roaming).
import { quality, manager, setMood, start, addUpdate } from "../world/scene.js";
import { buildHarbor, SPOTS, H, drawScreen, PATHS } from "../world/harbor.js";
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
import { getRate, cycleRate } from "../speech.js";
import { accountAvatar } from "../account.js";
import { TALK } from "./talk.js";

const SLIDE_SEC = new URLSearchParams(location.search).has("fast") ? 2 : 20; // ?fast=1: test aid only
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
  await t("Each slide is one picture and one idea. You tell a story. You do not read a wall of text.", "每張投影片只有一張圖、一個重點。你是在說故事，不是念一大段文字。");
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
  log("ending", "Your first Pecha Kucha", { key: "first-talk", seconds: secs });
  finishRun({ ending: "first-talk", metrics: { seconds: secs, level: S.level, slides: SLIDES.length } });
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

function talkMap() {
  return new Promise(res => {
    $("#mapList").innerHTML = TALK.stages.map(st => `
      <li><div class="mp-head"><b>Part ${st.part} · ${esc(st.en)}</b><span>${esc(st.zh)}</span><em>${st.slides.length} slides · ${st.slides.length * SLIDE_SEC} s</em></div>
        <ol start="${st.slides[0].no}">${st.slides.map(s => `<li>${esc(s.title)}</li>`).join("")}</ol></li>`).join("");
    $("#map").hidden = false;
    log("map.open", "talk map");
    $("#mapGo").onclick = () => { $("#map").hidden = true; res(); };
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
    log("pk.slide", `slide ${s.no} (${s.stage.en})`, { slide: s.no, part: s.stage.part });
    const t0 = performance.now(); let cut = false;
    await new Promise(done => {
      const tick = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        $("#teleSec").textContent = Math.max(0, Math.ceil(SLIDE_SEC - el));
        $("#teleBar").style.width = Math.min(100, el / SLIDE_SEC * 100) + "%";
        if (!cut && el > SLIDE_SEC / 2) { cut = true; shots[(i * 2 + 1) % shots.length](); }
        if (el >= SLIDE_SEC) { clearInterval(tick); done(); }
      }, 100);
    });
  }
  tele.hidden = true;
}

function showEnding(secs) {
  const card = TALK.stages.map(st => `<li><b>${esc(st.en)}</b> ${esc(st.zh)}</li>`).join("");
  $("#endCard").innerHTML = `
    <span class="kicker">SDG 4 · Pecha Kucha Stage</span>
    <h2 class="ending-title">Your First Pecha Kucha</h2>
    <p>You presented <strong>${esc(TALK.title)}</strong> at level ${S.level}: ${SLIDES.length} slides × ${SLIDE_SEC} seconds, without stopping.${hint("你完成了「台灣的優質教育」演講：20 張投影片、每張 20 秒，一次都沒有停。")}</p>
    <div class="sum">
      <div><small>Slides</small><b>${SLIDES.length}</b></div>
      <div><small>Talk time</small><b>${mmss(SLIDES.length * SLIDE_SEC)}</b></div>
      <div><small>Whole visit</small><b>${mmss(secs)}</b></div>
    </div>
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
