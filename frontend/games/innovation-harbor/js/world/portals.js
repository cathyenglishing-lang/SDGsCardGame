// Locked chapters: at both ends of the waterfront road a bridge leads to the next region.
// A frosted glass wall seals each bridge; the region beyond stays visible (and alive) through it.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { scene, addUpdate, registerLamp } from "./scene.js";
import { M } from "./materials.js";
import { mesh, box, cyl, G } from "./harbor.js";
import { addBlock } from "./roam.js";
import { rand } from "../util.js";
import { toast } from "../ui/sheet.js";
import { log } from "../telemetry.js";

const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xbfe7ff, transparent: true, opacity: 0.3, roughness: 0.25, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });

function bridge(x0, x1, z) {
  const len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
  box(len, 0.8, 11, M.concrete, cx, G - 0.4, z, { cast: false });
  box(len, 0.08, 6, M.asphalt, cx, G + 0.04, z, { cast: false });
  for (const dz of [-5.3, 5.3]) { box(len, 1.1, 0.3, M.steel, cx, G + 0.55, z + dz); }
  for (let x = Math.min(x0, x1) + 6; x < Math.max(x0, x1); x += 12) { for (const dz of [-4.5, 4.5]) cyl(0.5, 0.6, 5, M.concrete, x, -2.5, z + dz, { seg: 10 }); const lm = M.warm(); registerLamp(lm, 1.4); cyl(0.07, 0.09, 5, M.steelDark, x, G + 2.5, z + 5.6, { seg: 6 }); box(0.4, 0.16, 0.26, lm, x, G + 5, z + 5.3, { cast: false }); }
}
function wall(x, z, label, sub, dir) {
  const g = new THREE.Group(); g.position.set(x, G, z); scene.add(g);
  const glass = mesh(new THREE.BoxGeometry(0.35, 7.5, 13.5), glassMat(), 0, 3.75, 0, { parent: g, cast: false, recv: false });
  for (const dz of [-6.9, 6.9]) box(0.6, 8, 0.5, M.steelDark, 0, 4, dz, { parent: g });
  const strip = new THREE.MeshStandardMaterial({ color: 0x0b2a36, emissive: 0x1fc1d6, emissiveIntensity: 1.6 });
  box(0.7, 0.3, 14, strip, 0, 8.1, 0, { parent: g, cast: false });
  box(0.7, 0.3, 14, M.steelDark, 0, 8.4, 0, { parent: g });
  // lock badge in the middle of the glass
  const ring = mesh(new THREE.TorusGeometry(0.7, 0.08, 10, 40), strip, dir * 0.25, 4.2, 0, { parent: g, ry: Math.PI / 2, cast: false });
  const el = document.createElement("div"); el.className = "portal-label";
  el.innerHTML = `<b>${label}</b><span>${sub}</span><i>🔒 Locked · finish Chapter 1 to open</i>`;
  const obj = new CSS2DObject(el); obj.position.set(0, 6.6, 0); obj.center.set(0.5, 1); g.add(obj);
  addBlock([x - 0.6, x + 0.6, z - 7, z + 7]);
  return { g, glass, ring, strip, el, x, z, unlocked: false };
}

export function buildPortals(getPlayer) {
  // ── east: Signal Hill Research Campus (Chapter 2) ──
  bridge(92, 128, 19);
  const east = wall(93.5, 19, "Chapter 2 · Signal Hill Research Campus", "How to Talk to AI Like a Scientist", 1);
  const hill = mesh(new THREE.SphereGeometry(62, 28, 14), M.paint(0x3f5a3c, .95, 0), 180, -34, 10); hill.scale.set(1, 0.75, 1);
  // campus buildings on the slope, observatory on top
  const campus = [[150, 4, 2, 10, 14], [160, 9, -8, 8, 22], [168, 7, 14, 9, 18], [176, 13, 0, 10, 26], [156, 6, 24, 12, 12]];
  campus.forEach(([x, y, z, w, h], i) => box(w, h, w * .9, M.windows(Math.round(w / 1.6), Math.round(h / 2.2), .6, i % 2 ? "#bfe7ff" : "#ffd59a"), x, y + h / 2, z));
  cyl(4, 4.6, 7, M.white, 182, 15.6, 2, { seg: 18 }); mesh(new THREE.SphereGeometry(4.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.paint(0xdfe6ee, .4, .5), 182, 19, 2);
  for (let i = 0; i < 14; i++) { const lm = M.warm(); registerLamp(lm, 1.6); mesh(new THREE.SphereGeometry(0.3, 6, 5), lm, 140 + rand(0, 50), 2 + rand(0, 14), -20 + rand(0, 50), { cast: false }); }
  // ── west: Automation Valley (Chapter 3) ──
  bridge(-92, -128, 19);
  const west = wall(-93.5, 19, "Chapter 3 · Automation Valley", "What Can Humans Do Better Than AI?", -1);
  box(110, 2, 90, M.concrete, -185, -1, 25, { cast: false });
  const plants = [[-150, 10, 0, 26, 12], [-172, 12, 30, 20, 16], [-200, 14, 8, 30, 14], [-160, 8, 52, 22, 10], [-205, 11, 44, 18, 12]];
  plants.forEach(([x, y, z, w, h]) => { box(w, h, w * .7, M.paint(0x6f7a84, .8, .35), x, h / 2, z); box(w, 0.6, w * .7 + 1, M.steelDark, x, h + .3, z); });
  for (const [x, z] of [[-140, -6], [-176, 20], [-196, 36]]) cyl(1.4, 1.8, 26, M.paint(0x8a8f96, .8, .3), x, 13, z, { seg: 12 });
  box(70, 1.6, 2.2, M.steelDark, -175, 3.2, 18); box(70, 0.3, 1.8, M.yellow, -175, 4.1, 18);
  const beacons = [];
  for (const [x, y, z] of [[-150, 17, 0], [-200, 22, 8], [-172, 21, 30], [-140, 27, -6]]) { const bm = new THREE.MeshStandardMaterial({ color: 0x331010, emissive: 0xff3a2a, emissiveIntensity: 2 }); mesh(new THREE.SphereGeometry(0.5, 8, 6), bm, x, y, z, { cast: false }); beacons.push(bm); }
  for (let i = 0; i < 10; i++) { const lm = M.warm(); registerLamp(lm, 1.4); mesh(new THREE.SphereGeometry(0.3, 6, 5), lm, -150 - rand(0, 60), 1.5 + rand(0, 6), -10 + rand(0, 60), { cast: false }); }

  const portals = { east, west };
  let warnAt = 0;
  addUpdate((dt, t) => {
    const pulse = 1.2 + Math.sin(t * 2.4) * 0.5;
    for (const p of [east, west]) { if (!p.unlocked) { p.strip.emissiveIntensity = pulse; p.ring.rotation.x = t * 0.8; } }
    beacons.forEach((b, i) => b.emissiveIntensity = Math.sin(t * 2 + i) > 0.5 ? 3 : 0.3);
    const player = getPlayer(); if (!player) return;
    for (const p of [east, west]) {
      if (p.unlocked) continue;
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < 4 && t - warnAt > 8) { warnAt = t; toast("Locked. Finish Chapter 1 to open this bridge."); log("portal.touch", p.el.querySelector("b").textContent); }
    }
  });
  portals.unlock = (key) => { const p = portals[key]; if (!p || p.unlocked) return; p.unlocked = true; p.glass.material.opacity = 0; p.strip.emissiveIntensity = 3; p.el.querySelector("i").textContent = "Open"; };
  return portals;
}
