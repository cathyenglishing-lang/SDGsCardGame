// Boot: load assets, build the harbor, place the cast, run the intro cinematic and the story.
import * as THREE from "three";
import { scene, camera, manager, quality, setMood, start, addUpdate } from "./world/scene.js";
import { buildHarbor, SPOTS, H, drawScreen, PATHS } from "./world/harbor.js";
import { buildTraffic } from "./world/traffic.js";
import { loadCharacterAssets, makeActor, CROWD_KINDS, CROWD_TINTS } from "./world/characters.js";
import { shot, fly, fade, setFollow, cancelFlight } from "./world/camera.js";
import { buildStationLabels, runStory } from "./story.js";
import { wireHints } from "./i18n.js";
import { wireLogPanel, log } from "./telemetry.js";
import { renderHud } from "./ui/sheet.js";
import { S } from "./state.js";
import { $, wait, pick, rand } from "./util.js";
import { startAmbience, setMuted, isMuted } from "./audio.js";
import { SPEECH_LABEL } from "./speech.js";

wireHints(); wireLogPanel();
$("#sound").onclick = () => { setMuted(!isMuted()); $("#sound").textContent = isMuted() ? "🔇" : "🔊"; };

// loading progress
manager.onProgress = (url, loaded, total) => { const p = Math.round(loaded / total * 100); $("#loadBar").style.width = p + "%"; $("#loadPct").textContent = p + "%"; };
manager.onError = url => console.warn("asset failed", url);

setMood("dusk");
buildHarbor();
const traffic = buildTraffic(); window.__traffic = traffic;
buildStationLabels();
drawScreen("PECHA KUCHA STAGE", "Can We Trust AI?", "Innovation Harbor · SDG 9");
start();

// slow aerial drift while the intro card is open
let introA = 0;
const introDrift = addUpdate(dt => { if (S.started) return; introA += dt * 0.025; shot([Math.sin(introA) * 80, 26, 30 + Math.cos(introA) * 80], [0, 4, 10], { k: 1.2 }); });

await loadCharacterAssets();
$("#loading").hidden = true; $("#intro").hidden = false;

// ── cast ──
const player = makeActor("male", "Envoy");
const mei = makeActor("female", "Harbor Master Mei", { tint: 0xc8d2e6 });
const kai = makeActor("preview", "Kai", { tint: 0x8fb3d9 });
const hsu = makeActor("template", "Dr. Hsu", { tint: 0xf2efe8 });
const wang = makeActor("male", "Councillor Wang", { tint: 0x8c8c9c });
const councilA = makeActor("female", "Councillor", { tint: 0xb8b0c8 });
const councilB = makeActor("preview", "Councillor", { tint: 0x5a5a66 });
player.setPos(...SPOTS.playerStart).face(10, 0, true);
mei.setPos(...SPOTS.mei).face(10, -14, true);
kai.setPos(...SPOTS.kai).face(-30, 24, true);
hsu.setPos(...SPOTS.hsu).face(-6, 44, true);
wang.setPos(...SPOTS.wang).face(26, 48, true); councilA.setPos(...SPOTS.councilA).face(26, 48, true); councilB.setPos(...SPOTS.councilB).face(26, 48, true);
// crowd on the sidewalks
const crowd = [];
const loops = [PATHS.crowdA, PATHS.crowdB, PATHS.crowdC];
for (let i = 0; i < quality.crowd; i++) {
  const a = makeActor(pick(CROWD_KINDS), "pedestrian", { tint: pick(CROWD_TINTS) });
  const loop = loops[i % loops.length]; const startIdx = Math.floor(Math.random() * loop.length);
  const pts = loop.slice(startIdx).concat(loop.slice(0, startIdx));
  const s0 = pts[0]; a.setPos(s0[0] + rand(-0.6, 0.6), 0.6, s0[1] + rand(-0.6, 0.6));
  a.walk(pts.slice(1).concat([pts[0]]), { speed: rand(1.1, 1.7), loop: true });
  crowd.push(a);
}
// audience on the theater tiers
const audience = [];
for (let i = 0; i < quality.audience; i++) {
  const t = H.tiers[i % H.tiers.length];
  const a = makeActor(pick(CROWD_KINDS), "audience", { tint: pick(CROWD_TINTS) });
  a.setPos(18 + (i * 2.3) % 18 + rand(-0.4, 0.4), t.y, t.z + rand(-0.3, 0.3)); a.face(27, 4, true);
  a.play("idle", { variant: i });
  audience.push(a);
}

// dev console hook: window.__dbg.act.cards(window.__dbg.slides(3)) opens an activity directly
const { actCards } = await import("./activities/cards.js"); const { actListening } = await import("./activities/listening.js"); const { actReading } = await import("./activities/reading.js");
const { DATA } = await import("./data.js");
window.__dbg = { shot, player, mei, kai, hsu, wang, councilA, councilB, audience, crowd, S, traffic, H, drawScreen, act: { cards: actCards, listening: actListening, reading: actReading }, slides: part => DATA[S.level].filter(s => s.part === part).sort((a, b) => a.no - b.no) };

// ── intro card ──
$("#lvPick").onclick = e => { const b = e.target.closest("[data-lv]"); if (!b) return; S.level = b.dataset.lv; $("#lvPick").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); };
$("#startBtn").onclick = async () => {
  $("#intro").hidden = true; S.started = true; S.t0 = performance.now(); introDrift();
  startAmbience();
  log("run.start", `level ${S.level}, speech: ${SPEECH_LABEL[S.speech]}, quality: ${quality.high ? "high" : "low"}`);
  $("#hud").hidden = false; $("#lvChip").textContent = S.level; renderHud();
  // arrival: ride the ferry into the harbor
  const fy = traffic.ferry.mesh; traffic.ferry.manual = true;
  fy.add(player.root); player.root.position.set(4, 1.6, 2.2); player.root.rotation.y = 0; player.yaw = player.targetYaw = 0;
  await fade(true, 10); shot([-30, 14, -70], [-38, 6, -8], { instant: true }); await fade(false, 900);
  $("#skipCine").hidden = false;
  const arrival = traffic.ferry.arrive();
  const flight = fly([{ pos: [-30, 14, -70], look: [-38, 6, -8], t: 3 }, { pos: [-6, 9, -62], look: [12, 3, -14], t: 6 }, { pos: [28, 6, -34], look: [17, 3, -14], t: 7 }]);
  let skipped = false;
  $("#skipCine").onclick = () => { skipped = true; cancelFlight(); traffic.ferry.state = "docked"; traffic.ferry.t = 0; fy.position.z = -14; traffic.ferry.onDock && traffic.ferry.onDock(); };
  await Promise.all([arrival, flight]);
  $("#skipCine").hidden = true; traffic.ferry.manual = false;
  await fade(true, 400);
  scene.attach(player.root); player.setPos(13.5, 0.6, -14); player.face(10, -11, true); player.yaw = player.targetYaw;
  setFollow(player, { dist: 6, height: 2.1 });
  await wait(100); await fade(false, 500);
  await runStory({ player, mei, kai, hsu, wang, councilA, councilB, traffic, audience, crowd });
};
