// Boot: load assets, build the harbor, place the cast, run the intro cinematic and the story graph.
import { scene, manager, quality, setMood, start, addUpdate } from "./world/scene.js";
import { buildHarbor, SPOTS, H, drawScreen, PATHS } from "./world/harbor.js";
import { buildTraffic } from "./world/traffic.js";
import { buildVehicles } from "./world/vehicles.js";
import { buildChatter } from "./world/chatter.js";
import { buildPortals } from "./world/portals.js";
import { buildDrivable } from "./world/drive.js";
import { buildDressing } from "./world/dressing.js";
import { hardHat, vest, glasses, lanyard, dressRandom } from "./world/outfits.js";
import { loadCharacterAssets, makeActor, CROWD_KINDS, CROWD_TINTS } from "./world/characters.js";
import { shot, fly, fade, setFollow, cancelFlight } from "./world/camera.js";
import { buildStationLabels, runStory } from "./story.js";
import { wireHints } from "./i18n.js";
import { titleCard } from "./ui/fx.js";
import { wireLogPanel, log, startRun } from "./telemetry.js";
import { renderHud } from "./ui/sheet.js";
import { S } from "./state.js";
import { $, wait, pick, rand } from "./util.js";
import { startAmbience, setMuted, isMuted } from "./audio.js";
import { SPEECH_LABEL, getRate, cycleRate } from "./speech.js";
import { accountAvatar } from "./account.js";

const avatarKind = accountAvatar();
wireHints(); wireLogPanel();
const showRate = r => { $("#rateBtn").textContent = `Speed ${r}×`; };
showRate(getRate()); $("#rateBtn").onclick = () => { const r = cycleRate(); showRate(r); log("settings.rate", `speech speed ${r}×`); };
$("#sound").onclick = () => { setMuted(!isMuted()); $("#sound").textContent = isMuted() ? "🔇" : "🔊"; };

// loading progress
manager.onProgress = (url, loaded, total) => { const p = Math.round(loaded / total * 100); $("#loadBar").style.width = p + "%"; $("#loadPct").textContent = p + "%"; };
manager.onError = url => console.warn("asset failed", url);

setMood("dusk");
buildHarbor(); buildDressing();
const traffic = buildTraffic(); window.__traffic = traffic;
let player = null;
const vehicles = buildVehicles();
const portals = buildPortals(() => player);
const drivable = buildDrivable(() => player);
buildStationLabels();
drawScreen("PECHA KUCHA STAGE", "Can We Trust AI?", "Innovation Harbor · SDG 9");
start();

// slow aerial drift while the intro card is open
let introA = 0;
const introDrift = addUpdate(dt => { if (S.started) return; introA += dt * 0.025; shot([Math.sin(introA) * 80, 26, 30 + Math.cos(introA) * 80], [0, 4, 10], { k: 1.2 }); });

await loadCharacterAssets();
$("#loading").hidden = true; $("#intro").hidden = false;

// ── cast ──
S.avatar = await avatarKind;
player = makeActor(S.avatar, "Envoy");
// Mei shares the female model; give her a dark uniform when the player is female too.
const mei = makeActor("female", "Harbor Master Mei", { tint: S.avatar === "female" ? 0x4a6a9a : 0xc8d2e6 });
const kai = makeActor("preview", "Kai", { tint: 0x8fb3d9 });
const hsu = makeActor("female", "Dr. Hsu", { tint: 0x9a7f6a }); // the story calls Dr. Hsu "she"
const wang = makeActor("male", "Councillor Wang", { tint: 0x8c8c9c });
const councilA = makeActor("female", "Councillor", { tint: 0xb8b0c8 });
const councilB = makeActor("preview", "Councillor", { tint: 0x5a5a66 });
const foreman = makeActor("preview", "Foreman Lee", { tint: 0xf0a030 });   // hi-vis orange
const reporter = makeActor("female", "Ana Reyes", { tint: 0x3aa0a0 }); reporter.root.visible = false; // appears on the "hide" route
player.setPos(...SPOTS.playerStart).face(10, 0, true);
mei.setPos(...SPOTS.mei).face(10, -14, true);
kai.setPos(...SPOTS.kai).face(-28, 26, true);
hsu.setPos(...SPOTS.hsu).face(-6, 44, true);
wang.setPos(...SPOTS.wang).face(26, 48, true); councilA.setPos(...SPOTS.councilA).face(26, 48, true); councilB.setPos(...SPOTS.councilB).face(26, 48, true);
foreman.setPos(-21.5, 0.6, 14.3).face(-19.5, 16, true);
reporter.setPos(18.4, 0.6, 46.2).face(20, 48, true);
// named cast keeps the plain idle (the "variations" clips shift weight and lean, which reads as a glitch on someone standing at a podium)
for (const a of [mei, kai, hsu, wang, councilA, councilB, foreman, reporter]) a.idleVariant = 0;
// accessories: what tells the characters apart (all share four bodies)
hardHat(foreman, "white"); vest(foreman); glasses(hsu); lanyard(hsu); lanyard(kai); glasses(wang); lanyard(mei); glasses(councilB);
// crowd on the sidewalks
const crowd = [];
const loops = [PATHS.crowdA, PATHS.crowdB, PATHS.crowdC];
for (let i = 0; i < quality.crowd; i++) {
  const a = makeActor(pick(CROWD_KINDS), "pedestrian", { tint: pick(CROWD_TINTS) });
  const loop = loops[i % loops.length]; const startIdx = Math.floor(Math.random() * loop.length);
  const pts = loop.slice(startIdx).concat(loop.slice(0, startIdx));
  const s0 = pts[0]; a.setPos(s0[0] + rand(-0.6, 0.6), 0.6, s0[1] + rand(-0.6, 0.6));
  a.walk(pts.slice(1).concat([pts[0]]), { speed: rand(1.1, 1.7), loop: true });
  dressRandom(a, i); crowd.push(a);
}
// people chatting in pairs (overhear them for hints)
const chatter = buildChatter(() => S.started ? player : null);
// audience on the theater tiers
const audience = [];
for (let i = 0; i < quality.audience; i++) {
  const t = H.tiers[i % H.tiers.length];
  const a = makeActor(pick(CROWD_KINDS), "audience", { tint: pick(CROWD_TINTS) });
  a.setPos(18 + (i * 2.3) % 18 + rand(-0.4, 0.4), t.y, t.z + rand(-0.3, 0.3)); a.face(27, 4, true);
  a.play("idle", { variant: i }); dressRandom(a, i + 40);
  audience.push(a);
}

// dev console hook: window.__dbg.act.cards(window.__dbg.slides(3)) opens an activity directly
const { actCards } = await import("./activities/cards.js"); const { actListening } = await import("./activities/listening.js"); const { actReading } = await import("./activities/reading.js");
const { DATA } = await import("./data.js");
window.__dbg = { shot, player, mei, kai, hsu, wang, councilA, councilB, foreman, reporter, audience, crowd, chatter, S, traffic, vehicles, portals, drivable, H, drawScreen, act: { cards: actCards, listening: actListening, reading: actReading }, slides: part => DATA[S.level].filter(s => s.part === part).sort((a, b) => a.no - b.no) };

// ── intro card ──
$("#lvPick").onclick = e => { const b = e.target.closest("[data-lv]"); if (!b) return; S.level = b.dataset.lv; $("#lvPick").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); };
$("#startBtn").onclick = async () => {
  if (S.started) return; // guard: a double click (or a replayed event) must not start two story loops
  $("#intro").hidden = true; S.started = true; S.t0 = performance.now(); introDrift();
  startAmbience();
  log("run.start", `level ${S.level}, avatar ${S.avatar}, speech: ${SPEECH_LABEL[S.speech]}, quality: ${quality.high ? "high" : "low"}`, { level: S.level, avatar: S.avatar, speech: S.speech, quality: quality.high ? "high" : "low" });
  startRun({ game: "innovation-harbor", chapter: "9-1", level: S.level, avatar: S.avatar, client: navigator.userAgent.slice(0, 160) });
  $("#hud").hidden = false; $("#lvChip").textContent = S.level; renderHud();
  // arrival: ride the ferry into the harbor
  const fy = traffic.ferry.mesh; traffic.ferry.manual = true;
  fy.add(player.root); player.root.position.set(4, 1.6, 2.2); player.root.rotation.y = 0; player.yaw = player.targetYaw = 0;
  await fade(true, 10); shot([-30, 14, -70], [-38, 6, -8], { instant: true }); await fade(false, 900);
  $("#skipCine").hidden = false;
  const arrival = traffic.ferry.arrive();
  const flight = fly([{ pos: [-30, 14, -70], look: [-38, 6, -8], t: 3 }, { pos: [-6, 9, -62], look: [12, 3, -14], t: 6 }, { pos: [28, 6, -34], look: [17, 3, -14], t: 7 }]);
  $("#skipCine").onclick = () => { cancelFlight(); traffic.ferry.state = "docked"; traffic.ferry.t = 0; fy.position.z = -14; traffic.ferry.onDock && traffic.ferry.onDock(); };
  await Promise.all([arrival, flight]);
  $("#skipCine").hidden = true; traffic.ferry.manual = false;
  await fade(true, 400);
  scene.attach(player.root); player.setPos(13.5, 0.6, -14); player.face(10, -11, true); player.yaw = player.targetYaw;
  setFollow(player, { dist: 6, height: 2.1 });
  await wait(100); await fade(false, 500);
  await titleCard({ kicker: "Chapter 1 · Innovation Harbor", title: "Can We Trust AI?", zh: "我們能信任 AI 嗎？", sub: "SDG 9 · Industry, Innovation and Infrastructure" }, 3200);
  await runStory({ player, mei, kai, hsu, wang, councilA, councilB, foreman, reporter, traffic, vehicles, portals, audience, crowd });
};
