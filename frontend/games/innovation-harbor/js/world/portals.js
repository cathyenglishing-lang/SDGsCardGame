// Locked chapters: at both ends of the waterfront road a bridge leads to the next region.
// A frosted glass wall seals each bridge; the region beyond stays visible (and alive) through it.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { scene, camera, addUpdate, registerLamp } from "./scene.js";
import { M, T } from "./materials.js";
import { mesh, box, cyl, G } from "./harbor.js";
import { addBlock } from "./roam.js";
import { rand } from "../util.js";
import { toast } from "../ui/sheet.js";
import { log } from "../telemetry.js";

const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xbfe7ff, transparent: true, opacity: 0.22, roughness: 0.2, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
// hologram layer: scan lines + hex cells, scrolled every frame, additive so it glows over the glass
function holoTex() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 512; const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 4) { g.fillStyle = `rgba(120,230,255,${(y / 4) % 2 ? 0.28 : 0.08})`; g.fillRect(0, y, 256, 2); }
  g.strokeStyle = "rgba(160,240,255,.35)"; g.lineWidth = 1.2;
  for (let r = 0; r < 9; r++) for (let q = 0; q < 5; q++) { const cx = q * 56 + (r % 2) * 28 + 20, cy = r * 60 + 30; g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; g.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); } g.closePath(); g.stroke(); }
  g.fillStyle = "rgba(255,255,255,.9)"; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1.2); return t;
}
function signTex(top, bottom) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d");
  g.fillStyle = "#0b1a22"; g.fillRect(0, 0, 512, 256); g.strokeStyle = "#1fc1d6"; g.lineWidth = 10; g.strokeRect(10, 10, 492, 236);
  g.fillStyle = "#f3f3f3"; g.font = "700 54px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillText(top, 256, 110);
  g.fillStyle = "#1fc1d6"; g.font = "600 36px 'Chakra Petch', sans-serif"; g.fillText(bottom, 256, 180);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const hazardMat = () => new THREE.MeshStandardMaterial({ color: 0x331a05, emissive: 0xff8a1a, emissiveIntensity: 2 });

function bridge(x0, x1, z) {
  const len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
  box(len, 0.8, 11, M.concrete, cx, G - 0.4, z, { cast: false });
  box(len, 0.08, 6, M.asphalt, cx, G + 0.04, z, { cast: false });
  for (const dz of [-5.3, 5.3]) { box(len, 1.1, 0.3, M.steel, cx, G + 0.55, z + dz); }
  for (let x = Math.min(x0, x1) + 6; x < Math.max(x0, x1); x += 12) { for (const dz of [-4.5, 4.5]) cyl(0.5, 0.6, 5, M.concrete, x, -2.5, z + dz, { seg: 10 }); const lm = M.warm(); registerLamp(lm, 1.4); cyl(0.07, 0.09, 5, M.steelDark, x, G + 2.5, z + 5.6, { seg: 6 }); box(0.4, 0.16, 0.26, lm, x, G + 5, z + 5.3, { cast: false }); }
}
function wall(x, z, label, sub, dir, chapter) {
  const g = new THREE.Group(); g.position.set(x, G, z); scene.add(g);
  const glass = mesh(new THREE.BoxGeometry(0.35, 7.5, 13.5), glassMat(), 0, 3.75, 0, { parent: g, cast: false, recv: false });
  const holoMat = new THREE.MeshBasicMaterial({ map: holoTex(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0x9fe8ff });
  const holo = mesh(new THREE.PlaneGeometry(13.5, 7.5), holoMat, dir * 0.2, 3.75, 0, { parent: g, ry: Math.PI / 2, cast: false, recv: false });
  for (const dz of [-6.9, 6.9]) box(0.6, 8, 0.5, M.steelDark, 0, 4, dz, { parent: g });
  const strip = new THREE.MeshStandardMaterial({ color: 0x0b2a36, emissive: 0x1fc1d6, emissiveIntensity: 1.6 });
  box(0.7, 0.3, 14, strip, 0, 8.1, 0, { parent: g, cast: false });
  box(0.7, 0.3, 14, M.steelDark, 0, 8.4, 0, { parent: g });
  // hazard lights up both posts, a striped stop line on the deck, warning signs facing the harbor
  const hazards = [];
  for (const dz of [-6.9, 6.9]) for (let i = 0; i < 5; i++) { const hm = hazardMat(); hazards.push(hm); box(0.66, 0.22, 0.56, hm, 0, 1 + i * 1.45, dz, { parent: g, cast: false }); }
  box(0.9, 0.03, 6.2, new THREE.MeshStandardMaterial({ map: T.stripes("#f2c531", "#15171a"), roughness: .8 }), -dir * 2.2, 0.1, 0, { parent: g, cast: false });
  for (const dz of [-6.9, 6.9]) mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: signTex("RESTRICTED", chapter) }), -dir * 0.32, 5.4, dz + (dz > 0 ? -1.6 : 1.6), { parent: g, ry: -dir * Math.PI / 2, cast: false });
  // lock badge in the middle of the glass
  const ring = mesh(new THREE.TorusGeometry(0.7, 0.08, 10, 40), strip, dir * 0.25, 4.2, 0, { parent: g, ry: Math.PI / 2, cast: false });
  const el = document.createElement("div"); el.className = "portal-label";
  el.innerHTML = `<b>${label}</b><span>${sub}</span><i>🔒 Locked · finish Chapter 1 to open</i><em class="prog"><s></s></em>`;
  const obj = new CSS2DObject(el); obj.position.set(0, 6.6, 0); obj.center.set(0.5, 1); g.add(obj);
  addBlock([x - 0.6, x + 0.6, z - 7, z + 7]);
  return { g, glass, holo, holoMat, ring, strip, hazards, el, x, z, dir, unlocked: false, opening: 0 };
}
// fog banks drifting over the region behind a gate
function fogBanks(cx, cz, n = 6, spread = 40) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, "rgba(220,235,245,.55)"); gr.addColorStop(1, "rgba(220,235,245,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); const banks = [];
  for (let i = 0; i < n; i++) { const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, depthWrite: false }); const p = mesh(new THREE.PlaneGeometry(26, 9), m, cx + rand(-spread, spread), 2 + rand(0, 5), cz + rand(-spread, spread), { cast: false, recv: false }); p.userData.v = rand(0.4, 1.1); p.userData.ph = rand(0, 6); banks.push(p); }
  return banks;
}
// a small drone (body + 4 rotors) for the Signal Hill sky
function drone(color = 0x1fc1d6) {
  const g = new THREE.Group(); box(0.9, 0.25, 0.9, M.steelDark, 0, 0, 0, { parent: g });
  const props = [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]].map(([x, z]) => box(1.0, 0.04, 0.1, M.white, x, 0.2, z, { parent: g }));
  const lm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.5 }); mesh(new THREE.SphereGeometry(0.16, 8, 6), lm, 0, -0.2, 0, { parent: g, cast: false });
  g.userData.props = props; scene.add(g); return g;
}
// industrial robot arm for Automation Valley
function robotArm(x, z, color = 0xe0a33a) {
  const base = new THREE.Group(); base.position.set(x, 0, z); scene.add(base);
  cyl(1.2, 1.5, 1, M.steelDark, 0, 0.5, 0, { parent: base, seg: 14 });
  const a = new THREE.Group(); a.position.y = 1; base.add(a); box(1, 6, 1, M.paint(color, .5, .4), 0, 3, 0, { parent: a });
  const b = new THREE.Group(); b.position.y = 6; a.add(b); box(0.8, 5, 0.8, M.paint(color, .5, .4), 0, 2.5, 0, { parent: b });
  box(1.4, 0.5, 1.4, M.steelDark, 0, 5.1, 0, { parent: b });
  return { base, a, b, ph: rand(0, 6) };
}

export function buildPortals(getPlayer) {
  // ── east: Signal Hill Research Campus (Chapter 2) ──
  bridge(92, 128, 19);
  const east = wall(93.5, 19, "Chapter 2 · Signal Hill Research Campus", "How to Talk to AI Like a Scientist", 1, "CHAPTER 2");
  const hill = mesh(new THREE.SphereGeometry(62, 28, 14), M.paint(0x3f5a3c, .95, 0), 180, -34, 10); hill.scale.set(1, 0.75, 1);
  // campus buildings on the slope, observatory on top
  const campus = [[150, 4, 2, 10, 14], [160, 9, -8, 8, 22], [168, 7, 14, 9, 18], [176, 13, 0, 10, 26], [156, 6, 24, 12, 12]];
  campus.forEach(([x, y, z, w, h], i) => box(w, h, w * .9, M.windows(Math.round(w / 1.6), Math.round(h / 2.2), .6, i % 2 ? "#bfe7ff" : "#ffd59a"), x, y + h / 2, z));
  cyl(4, 4.6, 7, M.white, 182, 15.6, 2, { seg: 18 }); mesh(new THREE.SphereGeometry(4.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.paint(0xdfe6ee, .4, .5), 182, 19, 2);
  for (let i = 0; i < 14; i++) { const lm = M.warm(); registerLamp(lm, 1.6); mesh(new THREE.SphereGeometry(0.3, 6, 5), lm, 140 + rand(0, 50), 2 + rand(0, 14), -20 + rand(0, 50), { cast: false }); }
  // ── west: Automation Valley (Chapter 3) ──
  bridge(-92, -128, 19);
  const west = wall(-93.5, 19, "Chapter 3 · Automation Valley", "What Can Humans Do Better Than AI?", -1, "CHAPTER 3");
  box(110, 2, 90, M.concrete, -185, -1, 25, { cast: false });
  const plants = [[-150, 10, 0, 26, 12], [-172, 12, 30, 20, 16], [-200, 14, 8, 30, 14], [-160, 8, 52, 22, 10], [-205, 11, 44, 18, 12]];
  plants.forEach(([x, y, z, w, h]) => { box(w, h, w * .7, M.paint(0x6f7a84, .8, .35), x, h / 2, z); box(w, 0.6, w * .7 + 1, M.steelDark, x, h + .3, z); });
  for (const [x, z] of [[-140, -6], [-176, 20], [-196, 36]]) cyl(1.4, 1.8, 26, M.paint(0x8a8f96, .8, .3), x, 13, z, { seg: 12 });
  box(70, 1.6, 2.2, M.steelDark, -175, 3.2, 18); box(70, 0.3, 1.8, M.yellow, -175, 4.1, 18);
  const beacons = [];
  for (const [x, y, z] of [[-150, 17, 0], [-200, 22, 8], [-172, 21, 30], [-140, 27, -6]]) { const bm = new THREE.MeshStandardMaterial({ color: 0x331010, emissive: 0xff3a2a, emissiveIntensity: 2 }); mesh(new THREE.SphereGeometry(0.5, 8, 6), bm, x, y, z, { cast: false }); beacons.push(bm); }
  for (let i = 0; i < 10; i++) { const lm = M.warm(); registerLamp(lm, 1.4); mesh(new THREE.SphereGeometry(0.3, 6, 5), lm, -150 - rand(0, 60), 1.5 + rand(0, 6), -10 + rand(0, 60), { cast: false }); }

  // life behind the gates: fog banks, survey drones circling the observatory, robot arms and a conveyor
  const fogE = fogBanks(165, 5, 7, 38), fogW = fogBanks(-178, 22, 7, 42);
  const drones = [0, 1, 2].map(i => ({ g: drone(i === 1 ? 0xff8a1a : 0x1fc1d6), r: 22 + i * 7, h: 26 + i * 4, ph: i * 2.1, spd: 0.25 + i * 0.05 }));
  const arms = [robotArm(-150, 22), robotArm(-176, 44, 0x8a9aa8), robotArm(-200, 26)];
  const belt = { boxes: [], x0: -215, x1: -140, z: 36 };
  box(76, 0.8, 2.2, M.steelDark, -177.5, 1.6, 36, { cast: false }); for (let x = -214; x <= -141; x += 8) box(0.4, 1.6, 2.4, M.steelDark, x, 0.8, 36, { cast: false });
  for (let i = 0; i < 9; i++) belt.boxes.push(box(1.4, 1.1, 1.4, M.paint([0xa83c2b, 0x2f6b3c, 0xc9a227, 0x1f5b8e][i % 4], .8, .1), belt.x0 + i * 8.4, 2.55, 36));
  const portals = { east, west };
  let warnAt = 0;
  addUpdate((dt, t) => {
    const pulse = 1.2 + Math.sin(t * 2.4) * 0.5;
    for (const p of [east, west]) {
      if (!p.unlocked) { p.strip.emissiveIntensity = pulse; p.ring.rotation.x = t * 0.8; p.holoMat.map.offset.y = -t * 0.08; p.holoMat.opacity = 0.42 + Math.sin(t * 3.1) * 0.12; p.hazards.forEach((h, i) => h.emissiveIntensity = Math.sin(t * 5 + i * 1.3) > 0 ? 2.4 : 0.25); }
      else if (p.opening < 1) { p.opening = Math.min(1, p.opening + dt / 1.8); const k = 1 - p.opening; p.glass.material.opacity = 0.22 * k; p.holoMat.opacity = 0.5 * k; p.holoMat.map.offset.y = -t * 0.6; p.hazards.forEach(h => { h.emissive.set(0x3dff6a); h.emissiveIntensity = 2 * k + 0.4; }); if (p.burst) { p.burst.material.opacity = k; p.burst.position.y += dt * 2.2; } }
    }
    fogE.concat(fogW).forEach(f => { f.position.x += Math.sin(t * 0.15 + f.userData.ph) * f.userData.v * dt; f.material.opacity = 0.35 + Math.sin(t * 0.4 + f.userData.ph) * 0.15; f.lookAt(camera.position.x, f.position.y, camera.position.z); });
    for (const d of drones) { const a = t * d.spd + d.ph; d.g.position.set(182 + Math.cos(a) * d.r, d.h + Math.sin(t * 0.9 + d.ph) * 1.2, 2 + Math.sin(a) * d.r); d.g.rotation.y = -a; d.g.rotation.z = 0.15; d.g.userData.props.forEach(pr => pr.rotation.y += dt * 45); }
    for (const a of arms) { a.a.rotation.y = Math.sin(t * 0.5 + a.ph) * 1.3; a.b.rotation.x = 0.5 + Math.sin(t * 0.8 + a.ph) * 0.6; }
    for (const b of belt.boxes) { b.position.x += dt * 2.4; if (b.position.x > belt.x1) b.position.x = belt.x0; }
    beacons.forEach((b, i) => b.emissiveIntensity = Math.sin(t * 2 + i) > 0.5 ? 3 : 0.3);
    const player = getPlayer(); if (!player) return;
    for (const p of [east, west]) {
      if (p.unlocked) continue;
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < 4 && t - warnAt > 8) { warnAt = t; toast("Locked. Finish Chapter 1 to open this bridge."); log("portal.touch", p.el.querySelector("b").textContent); }
    }
  });
  // progress shown on both gates ("4/10 done"); unlock() dissolves a gate with a burst of light
  portals.setProgress = (done, total) => { for (const p of [east, west]) { const e = p.el.querySelector(".prog"); if (e) e.innerHTML = `<s style="width:${Math.round(done / total * 100)}%"></s><span>Chapter 1 · ${done}/${total} done</span>`; } };
  portals.unlock = (key) => {
    const p = portals[key]; if (!p || p.unlocked) return; p.unlocked = true; p.strip.emissive.set(0x3dff6a); p.strip.emissiveIntensity = 3; p.ring.material = p.strip;
    p.el.querySelector("i").textContent = "Open"; p.el.classList.add("open");
    const n = 220, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = p.x + rand(-0.4, 0.4); pos[i * 3 + 1] = G + rand(0, 7.5); pos[i * 3 + 2] = p.z + rand(-6.5, 6.5); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    p.burst = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fe8ff, size: 0.22, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(p.burst);
    log("portal.unlock", key, { key });
  };
  return portals;
}
