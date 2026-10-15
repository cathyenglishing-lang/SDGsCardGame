// Ambient NPC conversations: pairs of people stand together and talk to each other with
// gestures and small speech bubbles. Walk close to overhear hints about the story.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { scene, addUpdate } from "./scene.js";
import { makeActor, CROWD_KINDS, CROWD_TINTS } from "./characters.js";
import { pick, rand, esc } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";

const PAIRS = [
  { id: "dockers", at: [[19.2, 15.4], [20.6, 16.2]], lines: [
    "HARBOR-AI rerouted my truck three times this morning. Three!",
    "Did you read the new pier report? Twelve references. I've never heard of any of them.",
    "Mei has been at the Archive all week. Something's not right with that report.",
    "If the Council votes yes, the AI runs the cranes too. Who checks the AI?",
  ] },
  { id: "students", at: [[-25.6, 24.8], [-24.2, 25.6]], lines: [
    "Kai asked the AI to write his whole bibliography. All of it.",
    "Dr. Hsu says the AI predicts the next word. It doesn't check anything.",
    "I checked mine on Google Scholar. Two of the papers don't exist.",
    "Fast is not the same as true. That's what she keeps saying.",
  ] },
  { id: "clerks", at: [[31.2, 47.6], [32.6, 48.3]], lines: [
    "The vote is next week. Councillor Wang wants proof, not opinions.",
    "If a reporter gets this story first, the pier project is finished.",
    "Someone said the safety score was ninety-nine percent. Ninety-nine!",
    "Bring evidence to the Council. Two sources at least.",
  ] },
];

const v = new THREE.Vector3();
export function buildChatter(getPlayer) {
  const pairs = PAIRS.map(p => {
    const a = makeActor(pick(CROWD_KINDS), "chat-" + p.id, { tint: pick(CROWD_TINTS) });
    const b = makeActor(pick(CROWD_KINDS), "chat-" + p.id, { tint: pick(CROWD_TINTS) });
    a.setPos(p.at[0][0], 0.6, p.at[0][1]); b.setPos(p.at[1][0], 0.6, p.at[1][1]);
    a.faceTo(b, true); b.faceTo(a, true);
    const el = document.createElement("div"); el.className = "chat"; el.hidden = true;
    const obj = new CSS2DObject(el); obj.center.set(0.5, 1); scene.add(obj);
    return { ...p, a, b, el, obj, speaker: a, listener: b, t: rand(0, 3), li: Math.floor(Math.random() * p.lines.length), near: false, heard: new Set() };
  });
  addUpdate(dt => {
    const player = getPlayer();
    for (const p of pairs) {
      p.t -= dt;
      if (p.t <= 0) {
        // swap roles, next line
        [p.speaker, p.listener] = [p.listener, p.speaker];
        p.li = (p.li + 1) % p.lines.length; p.t = 3.8 + rand(0, 1.6);
        p.speaker.play("talk", { fade: 0.3 }); p.listener.play(Math.random() < 0.4 ? "react" : "idle", { fade: 0.3 });
        p.el.textContent = p.lines[p.li];
      }
      p.speaker.headWorld(v); v.y += 0.35; p.obj.position.copy(v);
      const d = player ? Math.hypot(player.pos.x - p.a.pos.x, player.pos.z - p.a.pos.z) : 99;
      const near = d < 9;
      if (near !== p.near) { p.near = near; p.el.hidden = !near; }
      if (near && !p.heard.has(p.li)) { p.heard.add(p.li); S.metrics.eavesdrops++; log("story.overhear", `${p.id}: ${p.lines[p.li].slice(0, 50)}`); }
    }
  });
  return pairs;
}
