// The Innovation Harbor story: six stations, choices, travel between them, and four endings.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { scene, setMood, addUpdate } from "./world/scene.js";
import { STATIONS, SPOTS, PATHS, H, drawScreen } from "./world/harbor.js";
import { setFollow, shot, fade, overShoulder, frontShot, twoShot, fly, cancelFlight } from "./world/camera.js";
import { say, ask } from "./ui/bubble.js";
import { renderHud, toast } from "./ui/sheet.js";
import { S, STAGES } from "./state.js";
import { log } from "./telemetry.js";
import { $, esc, wait, isNum, IS_PHONE } from "./util.js";
import { DATA } from "./data.js";
import { hint } from "./i18n.js";
import { horn, foghorn, applause, isMuted } from "./audio.js";
import { actListening } from "./activities/listening.js";
import { actReading } from "./activities/reading.js";
import { actCardGame } from "./activities/cardgame.js";
import { startRoam, stopRoam, groundY } from "./world/roam.js";
import { actSpeak } from "./activities/speaking.js";
import { actSequence } from "./activities/sequence.js";
import { actPechaKucha } from "./activities/pechakucha.js";

const slidesOf = part => DATA[S.level].filter(s => s.part === part).sort((a, b) => a.no - b.no);

// ── station labels in the 3D world ──
const tags = {};
export function buildStationLabels() {
  for (const [k, st] of Object.entries(STATIONS)) {
    const el = document.createElement("div"); el.className = "tag"; el.textContent = st.name;
    const o = new CSS2DObject(el); o.position.set(...st.label); o.center.set(0.5, 1); scene.add(o); tags[k] = { el, o, state: "" };
  }
}
export function markStations(target) {
  for (const [k, t] of Object.entries(tags)) t.el.className = "tag" + (k === target ? " target" : t.state === "done" ? " done" : "");
}

// ── travel between stations: prompt, then a real walk with camera follow; long legs cut with a fade ──
function flatten(player, pts) { return pts.map(p => p.length === 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], player.pos.y, p[1])); }
async function walkLeg(player, pts, { cutAfter = 36 } = {}) {
  const v = flatten(player, pts); let total = 0; const segs = [];
  let prev = player.pos.clone(); for (const p of v) { const d = prev.distanceTo(p); segs.push({ a: prev.clone(), b: p, d }); total += d; prev = p; }
  setFollow(player, { dist: 6.2, height: 2.1 });
  if (total <= cutAfter) return player.walk(v.map(p => [p.x, p.y, p.z]));
  // walk the first 8 m, fade, continue from 9 m before the end
  const cutAt = (dist) => { let acc = 0; for (const s of segs) { if (acc + s.d >= dist) { const t = (dist - acc) / s.d; return s.a.clone().lerp(s.b, t); } acc += s.d; } return segs[segs.length - 1].b.clone(); };
  const p1 = cutAt(8), p2 = cutAt(total - 9);
  const rest = []; let acc = 0, started = false;
  for (const s of segs) { if (!started && acc + s.d >= total - 9) { started = true; rest.push(p2); } if (started && s.b !== p2) rest.push(s.b); acc += s.d; }
  const firstLeg = []; acc = 0; for (const s of segs) { if (acc + s.d >= 8) { firstLeg.push(p1); break; } firstLeg.push(s.b); acc += s.d; }
  await player.walk(firstLeg.map(p => [p.x, p.y, p.z]));
  await fade(true, 500); player.setPos(p2.x, p2.y, p2.z); const nx = rest[1] || rest[0]; player.face(nx.x, nx.z, true); setFollow(player, { dist: 6.2, height: 2.1 }); await wait(80); await fade(false, 500);
  await player.walk(rest.map(p => [p.x, p.y, p.z]));
}
// Default: the player walks freely to the glowing ring. "Auto-walk" and "Skip" stay as fallbacks.
export function travel(player, key, pathKey) {
  return new Promise(res => {
    const p = PATHS[pathKey]; const last = p[p.length - 1];
    const end = last.length === 3 ? [last[0], last[2]] : last;
    const from = player.pos.clone(); const t0 = performance.now();
    markStations(key); $("#tvName").textContent = STATIONS[key].name; $("#tvDist").textContent = ""; $("#travel").hidden = false;
    const done = how => { $("#travel").hidden = true; log("move", `${how} to ${STATIONS[key].name} (${Math.round((performance.now() - t0) / 1000)} s)`); res(); };
    startRoam(player, end, {
      onDistance: d => { $("#tvDist").textContent = `${Math.round(d)} m`; },
      onArrive: () => { setFollow(player); done("free walk"); },
    });
    $("#tvGo").onclick = async () => {
      stopRoam(); $("#travel").hidden = true;
      if (player.pos.distanceTo(from) > 3) { await fade(true, 350); player.setPos(from.x, from.y, from.z); await wait(60); await fade(false, 350); }
      await walkLeg(player, p); done("auto-walk");
    };
    $("#tvSkip").onclick = async () => {
      stopRoam(); $("#travel").hidden = true;
      await fade(true, 400); player.setPos(end[0], last.length === 3 ? last[1] : groundY(end[0], end[1]), end[1]); setFollow(player); await wait(60); await fade(false, 400);
      done("skip walk");
    };
  });
}

// ── characters' lines ──
const L = (who, role, voice, en, zh, extra = {}) => ({ who, role, voice, en, zh, ...extra });

export async function runStory(ctx) {
  const { player, mei, kai, hsu, wang, councilA, councilB, traffic, audience } = ctx;
  const MEI = { actor: mei }, KAI = { actor: kai }, HSU = { actor: hsu }, WANG = { actor: wang };
  const AI = { anchor: SPOTS.speakerPole }, AI2 = { anchor: SPOTS.councilHolo };
  const m = (en, zh, o) => say(MEI, L("Harbor Master Mei", "Port Authority", "mei", en, zh, o), player);
  const k = (en, zh, o) => say(KAI, L("Kai", "Cadet intern · report assistant", "kai", en, zh, o), player);
  const h = (en, zh, o) => say(HSU, L("Dr. Hsu", "AI researcher", "hsu", en, zh, o), player);
  const w = (en, zh, o) => say(WANG, L("Councillor Wang", "Port Council", "wang", en, zh, o), player);
  const ai = (en, zh, where = AI) => say(where, L("HARBOR-AI", "port management system", "ai", en, zh, { ai: true, anim: null }));

  const stage = async (i) => { S.stage = i; renderHud(); };

  // ── Station 1 · Ferry Pier · Listening ──
  await stage(0);
  await travel(player, "pier", "arrive");
  mei.faceTo(player);
  await m("Welcome to Innovation Harbor, Envoy. Next week the Port Council votes on one big question: should HARBOR-AI run the whole port?", "歡迎來到創新港，特使。下週港務議會要投票：要不要讓 HARBOR-AI 管理整個港口？");
  await ai("Assessment complete. New pier project: safety score ninety-nine percent. Twelve references cited. Recommendation: approve immediately.", "評估完成。新碼頭計畫：安全指數 99%，引用文獻 12 篇。建議：立即通過。");
  await m("The report looks perfect. Too perfect. Before we start, listen to the opening talk of today's conference. It is playing on the harbor speakers.", "報告看起來很完美，完美得讓我不安。開始前，先聽聽今天大會的開場，港口廣播正在播。");
  await actListening(slidesOf(1), ctx);
  await m("SDG 9 asks us to support innovation and strong infrastructure. But can we always trust AI? Go to the AI Lab. Kai, my intern, helped write that report.", "SDG 9 要我們支持創新與基礎建設。但我們能永遠信任 AI 嗎？去 AI 實驗室找凱，他是那份報告的助理。");
  tags.pier.state = "done";

  // ── Station 2 · AI Lab · Reading + choice ──
  await stage(1);
  await travel(player, "lab", "pierToLab");
  kai.faceTo(player);
  await k("Envoy… I have to tell you something. The references in the report? I asked the AI to write them. I never checked them one by one.", "特使……我得坦白一件事。報告裡的參考文獻是我請 AI 寫的，我沒有一篇一篇查。");
  await k("Here are my draft notes. Match each note to the right slide and you will see the problem.", "這是我的草稿筆記。把每段筆記對到正確的投影片，你就會看到問題。");
  await actReading(slidesOf(2), [slidesOf(1)[1], slidesOf(3)[0]]);
  await k("So… some of those papers may not exist at all? What should I do?", "所以……有些論文可能根本不存在？我該怎麼辦？");
  const o = await ask(player, { en: "How do you answer Kai?", zh: "你要怎麼回應凱？" }, [
    { en: "\"I'll check every reference with you. If it's wrong, we fix it.\"", zh: "「我陪你一篇一篇查，錯了就改。」", kai: "help", d: 2 },
    { en: "\"We must report this to the Council right now.\"", zh: "「這件事必須馬上向議會通報。」", kai: "report", d: 1 },
    { en: "\"Let's keep quiet. The Council will never notice.\"", zh: "「先別聲張，議會不會發現的。」", kai: "hide", d: -2 },
  ], kai);
  S.vars.kai = o.kai; S.vars.integrity += o.d; renderHud(); log("story.choice", `answer to Kai: ${o.kai} (integrity ${o.d > 0 ? "+" : ""}${o.d})`);
  if (o.kai === "help") await k("Thank you. Let's search Google Scholar together, one paper at a time.", "謝謝你。我們一起用 Google Scholar 一篇一篇查。", { anim: "react" });
  else if (o.kai === "report") await k("…I understand. If I made a mistake, I should face it.", "……我懂。做錯事就要面對。", { anim: "react" });
  else await k("Are you sure? …Okay.", "真的可以嗎？……好吧。", { anim: "react" });
  await k("Dr. Hsu at the Harbor Archive can explain why the AI does this. She is expecting you.", "資料檔案館的許博士可以解釋 AI 為什麼會這樣。她在等你。");
  tags.lab.state = "done";

  // ── Station 3 · Harbor Archive · Card match ──
  await stage(2);
  await travel(player, "archive", "labToArchive");
  hsu.faceTo(player);
  await h("Why does an AI invent papers with such confidence? I prepared a short talk about it, but the sea wind scattered my cards! Come inside the Archive and help me put the sentences back on the right slides.", "AI 為什麼能這麼有自信地捏造論文？我準備了一段短講，可是海風把卡片吹散了！進檔案館幫我把句子放回正確的投影片。");
  await actCardGame({ topic: "9-1", parts: [2, 3, 4, 5] });
  await h("Exactly. The AI guesses the next word. It does not check facts. Sounding right is not the same as being right.", "沒錯。AI 是在猜下一個字，不是在查證事實。聽起來對，不代表是真的。", { anim: "react" });
  await h("The Council meets now. Go and tell them why this matters.", "議會現在開會。去告訴他們為什麼這件事很重要。");
  tags.archive.state = "done";
  // Dr. Hsu moves on to the workshop while the player walks away.
  setTimeout(() => { hsu.setPos(...SPOTS.hsu2); hsu.face(46, 30, true); if (S.vars.kai === "help") { kai.setPos(...SPOTS.kai2); kai.face(46, 30, true); } }, 6000);

  // ── Station 4 · Port Council · Speaking at the podium ──
  await stage(3);
  await travel(player, "council", "archiveToCouncil");
  mei.setPos(22, 0.6, 48.5); mei.faceTo(player); player.faceTo(mei);
  const kv = S.vars.kai;
  if (kv === "help") await m("You and Kai found three papers that do not exist. The councillors are nervous.", "你和凱查出三篇根本不存在的論文。議員們開始緊張了。");
  else if (kv === "report") await m("The Council received your report. Kai is suspended for now… but at least the problem is on the table.", "議會收到你的通報，凱暫時被停職……但問題總算被看見了。");
  else await m("The meeting goes on as planned. Nobody mentions the references. But a reporter is asking questions…", "會議照常進行，沒人提到文獻的問題。不過，有記者開始追問了……");
  wang.faceTo(player);
  await w("Envoy, step up to the podium and tell the Council in English: why does this problem matter?", "特使，請上講台，用英文告訴議會：這個問題為什麼重要？");
  await fade(true, 400); player.setPos(26, 0.6, 49); setFollow(player, { dist: 5, height: 1.8 }); await fade(false, 400);
  await player.walk(PATHS.toPodium, { speed: 1.6 });
  player.face(26, 60); [wang, councilA, councilB].forEach(c => c.faceTo(player));
  const p4 = slidesOf(4); const slide = (kv === "help" ? p4[0] : p4[p4.length - 1]) || slidesOf(3)[0];
  shot([30, 2.7, 58], [26, 2.2, 53]);
  await actSpeak(slide, { kicker: "Part 4 · Speaking", title: "Convince the Council: why does this matter?", zh: "說服議會：這件事為什麼重要？", on: { start: () => { player.play("talk"); frontShot(player, { dist: 3.4, height: 0.3, side: 0.9 }); }, stop: () => { player.play("idle"); shot([30, 2.7, 58], [26, 2.2, 53]); } } });
  [wang, councilA, councilB].forEach((c, i) => setTimeout(() => c.play("react"), i * 300));
  await w(kv === "hide" ? "Interesting… but why are we hearing this only now? We will look into it." : "We understand. Now bring us a plan: how should the port use AI?", kv === "hide" ? "有道理……但為什麼現在才說？我們會再查。" : "我們明白了。下一步，請提出港口使用 AI 的規則。");
  tags.council.state = "done";
  await fade(true, 400); player.setPos(26, 0.6, 47.5); player.face(35, 47.5, true); await fade(false, 400);

  // ── Station 5 · Innovation Workshop · Sequencing + key choice ──
  await stage(4);
  await travel(player, "workshop", "councilToWorkshop");
  hsu.faceTo(player);
  await h("The Council wants rules for HARBOR-AI. First, put the verification steps in the correct order.", "議會要你提出 HARBOR-AI 的使用規則。先把查證步驟排對。");
  await actSequence(slidesOf(5));
  const o2 = await ask(player, { en: "Which plan do you propose to the Council?", zh: "你要向議會提出哪一個方案？" }, [
    { en: "AI assists, humans verify: every source is double-checked in a trusted database.", zh: "AI 協助、人類查證：每份資料都用可信資料庫雙重核對。", a: "verify", d: 2 },
    { en: "Ban AI completely. Go back to manual work.", zh: "全面禁用 AI，回到人工作業。", a: "ban", d: 0 },
    { en: "AI is fastest. Just accept the report as it is.", zh: "AI 效率最高，報告直接採用就好。", a: "trust", d: -2 },
  ], hsu);
  S.vars.approach = o2.a; S.vars.integrity += o2.d; renderHud(); log("story.choice", `AI policy: ${o2.a} (integrity ${o2.d > 0 ? "+" : ""}${o2.d})`);
  await h(o2.a === "verify" ? "Good. Let AI help, but let people decide." : o2.a === "ban" ? "Safe, yes… but innovation in this harbor would stop too." : "Are you sure? Those three fake papers are still in the report.", o2.a === "verify" ? "很好。讓 AI 幫忙，但最後由人來判斷。" : o2.a === "ban" ? "安全是安全……但港口的創新也會停下來。" : "你確定？那三篇假論文還在報告裡。", { anim: "react" });
  await h("The whole harbor is waiting at the Waterfront Theater. Go and present your conclusion.", "全港的人都在海濱劇場等你。去發表你的結論吧。");
  tags.workshop.state = "done";

  // ── Station 6 · Waterfront Theater · Pecha Kucha ──
  await stage(5);
  await travel(player, "theater", "workshopToTheater");
  mei.setPos(...SPOTS.meiTheater); mei.face(27, 5, true);
  // walk onto the stage from the wings
  await fade(true, 500); player.setPos(16.5, 0.9, 5.5); player.face(27, 5.5, true); shot([27, 3.2, 16], [22, 2, 5.5], { instant: true }); drawScreen("PECHA KUCHA", "Can We Trust AI?", "Sustainability Envoy · Innovation Harbor"); await fade(false, 500);
  await player.walk(PATHS.stageEntry, { speed: 1.5 });
  player.face(27, 20); await wait(300);
  audience.forEach(a => a.faceTo(player));
  await say(MEI, L("Harbor Master Mei", "front row", "mei", "This is it, Envoy. Pecha Kucha rules: twenty seconds per slide, and the slides change by themselves. Speak clearly. The harbor is listening.", "就是現在，特使。Pecha Kucha 規則：每張二十秒，自動換頁。說清楚，整個港口都在聽。"), player);
  shot([27, 2.8, 17], [27, 3, 5]);
  await actPechaKucha(slidesOf(6), { player, audience, mei });
  tags.theater.state = "done";
  S.stage = 6; renderHud();
  await ending(ctx);
}

// ── endings ──
const ENDINGS = {
  best: { title: "Harbor of Integrity", mood: "best", en: "The lighthouse lights up again. The Council passes the “AI assists, humans verify” charter, and Kai leads the new verification team. Innovation Harbor becomes the first port in the country with public rules for AI.", zh: "燈塔重新亮起。議會通過「AI 協作、人類查證」規章，凱成為查證小組組長。創新港成為全國第一個公開 AI 使用規範的港口。" },
  cautious: { title: "Proceed with Caution", mood: "dusk", en: "The direction is right, but the speech did not fully convince the Council. They approve a one-year trial: HARBOR-AI works under human supervision. Stronger listening and speaking unlock the best ending.", zh: "方向是對的，但說服力還不夠。議會只通過一年試行方案，HARBOR-AI 在人工監督下運作。提升聽說表現就能解鎖最好的結局。" },
  stall: { title: "Standstill Harbor", mood: "dim", en: "AI is banned. The port is safe, but the new pier project stops. Three years later, a neighboring port overtakes Innovation Harbor by using AI responsibly.", zh: "AI 被全面禁用。港口很安全，但新碼頭計畫停擺。三年後，鄰近港口靠著負責任的 AI 超越了創新港。" },
  fog: { title: "Fog of Hallucination", mood: "fog", en: "The Council accepts the report as it is. The “safety score” was built on fake papers, and the new pier fails. A fog of scandal covers the harbor. The investigation starts again, and this time everyone checks the sources first.", zh: "議會照單全收。「安全指數」建立在假論文上，新碼頭工程失敗，港口被醜聞的迷霧籠罩。調查重新開始，這次大家記得先查證。" },
};
async function ending(ctx) {
  const { player, traffic, audience } = ctx;
  const vals = Object.values(S.stars).filter(isNum); const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const pend = Object.values(S.stars).filter(v => v === "pending").length;
  let key;
  if (S.vars.approach === "trust" || (S.vars.kai === "hide" && S.vars.approach !== "verify")) key = "fog";
  else if (S.vars.approach === "ban") key = "stall";
  else if (S.vars.approach === "verify" && S.vars.integrity >= 3 && avg >= 2.3) key = "best";
  else key = "cautious";
  const E = ENDINGS[key];
  log("ending", `${E.title} (avg ${avg.toFixed(1)} stars, integrity ${S.vars.integrity})`);
  markStations(null);
  await fade(true, 700);
  setMood(E.mood);
  if (key === "best") { traffic.lighthouse(true); horn(true); setTimeout(() => horn(true), 1500); audience[0]?.play("dance"); }
  if (key === "cautious") { traffic.speed = 0.5; drawScreen("TRIAL PERIOD", "Human review required", "HARBOR-AI operates under supervision for one year"); }
  if (key === "stall") { traffic.anchorShips(); traffic.cranesFrozen = true; drawScreen("NOTICE", "AI systems suspended", "Manual operations only"); }
  if (key === "fog") { traffic.freezeCrane(0, true); foghorn(); drawScreen("INVESTIGATION", "Safety score under review", "All sources must be verified"); }
  player.setPos(10, 0.6, -16); player.face(10, -40, true);
  await fly([{ pos: [-4, 6, -4], look: [20, 6, -40], t: 0.01 }]);
  await fade(false, 1200);
  fly([{ pos: [-10, 8, 2], look: [30, 8, -50], t: 18 }]);
  const sp = S.metrics.speakBest.length ? Math.round(S.metrics.speakBest.reduce((a, b) => a + b, 0) / S.metrics.speakBest.length * 100) + "%" : (S.speech === "record" ? "awaiting teacher" : "incomplete");
  const missed = Object.entries(S.metrics.missed.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  $("#endCard").innerHTML = `
    <span class="kicker">Ending ${Object.keys(ENDINGS).indexOf(key) + 1} of 4</span>
    <h2 class="ending-title">${E.title}</h2><p>${esc(E.en)}${hint(E.zh)}</p>
    <div class="sum">
      <div><small>Stages</small><b>${STAGES.map((s, i) => isNum(S.stars[i]) ? "★".repeat(S.stars[i]) : S.stars[i] === "pending" ? "…" : "–").join(" ")}</b></div>
      <div><small>Average stars / Integrity</small><b>${avg.toFixed(1)}${pend ? ` (${pend} awaiting teacher)` : ""} / ${S.vars.integrity}</b></div>
      <div><small>Listening replays</small><b>${S.metrics.replays}</b></div>
      <div><small>Card errors</small><b>${S.metrics.cardErrors}</b></div>
      <div><small>Reading time</small><b>${S.metrics.readSec} s</b></div>
      <div><small>Speaking coverage</small><b>${sp}</b></div>
      <div><small>Chinese hints used</small><b>${S.metrics.zhHints}</b></div>
    </div>
    ${missed.length ? `<p>Words to practise: <strong>${missed.map(esc).join(", ")}</strong></p>` : ""}
    <p>These are the metrics the teacher dashboard will show. The full Learning Log has <strong>${S.events.length}</strong> events.</p>
    <div class="row"><button class="btn" type="button" id="again">Play again with different choices ▸</button><button class="btn ghost" type="button" id="seeLog">See the Learning Log</button></div>`;
  $("#ending").hidden = false;
  $("#again").onclick = () => location.reload();
  $("#seeLog").onclick = () => { $("#ending").hidden = true; $("#logp").hidden = false; };
}
