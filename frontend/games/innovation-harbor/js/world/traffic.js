// Everything that moves in the harbor: ships, ferry, cranes, trucks, gulls, flags,
// buoys, turbines, lighthouse beam, workshop drone and robot arm.
import * as THREE from "three";
import { scene, quality, addUpdate } from "./scene.js";
import { M, CONTAINER_COLORS } from "./materials.js";
import { mesh, box, cyl, H, spawnContainer, G } from "./harbor.js";
import { rand, pick, smoothstep } from "../util.js";
import { horn } from "../audio.js";

const SH = quality.high;

function hullGeometry(L, W, Hh) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -W / 2); s.lineTo(L * 0.28, -W / 2); s.quadraticCurveTo(L * 0.46, -W / 2, L / 2, 0);
  s.quadraticCurveTo(L * 0.46, W / 2, L * 0.28, W / 2); s.lineTo(-L / 2, W / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Hh, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}
function hull(L, W, Hh, mat, draft) { const m = new THREE.Mesh(hullGeometry(L, W, Hh), mat); m.position.y = -draft; m.castShadow = SH; return m; }

export function containerShip(L = 48, W = 11, bridgeAtStern = true) {
  const g = new THREE.Group();
  g.add(hull(L, W, 6, M.hullDark, 2.2));
  box(L - 4, 0.6, W - 1, M.paint(0x3a4653, .7, .3), 0, 4.1, 0, { parent: g });
  // bridge
  box(9, 9, W - 2, M.windows(5, 5, .5), -L / 2 + 6.5, 8.8, 0, { parent: g });
  box(9.6, 0.5, W - 1, M.white, -L / 2 + 6.5, 13.5, 0, { parent: g });
  cyl(0.9, 1.1, 5, M.paint(0xb33a2a, .6, .3), -L / 2 + 4, 16, 0, { parent: g, seg: 10 });
  cyl(0.1, 0.12, 10, M.steel, L / 2 - 4, 9, 0, { parent: g, seg: 6 });
  // container bays
  let ci = 0;
  for (let bx = -L / 2 + 13; bx < L / 2 - 6; bx += 6.4) for (let bz = -W / 2 + 2; bz < W / 2 - 1; bz += 2.6) { const n = 1 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) box(6.1, 2.6, 2.44, M.container(CONTAINER_COLORS[ci++ % CONTAINER_COLORS.length]), bx, 5.7 + k * 2.6, bz, { parent: g }); }
  return g;
}
export function tug(color = 0xb8402f) {
  const g = new THREE.Group(); g.add(hull(13, 5, 2.6, M.paint(color, .6, .4), 1));
  box(4, 2.4, 3.4, M.white, -1, 2.8, 0, { parent: g }); box(3.2, 1.6, 2.8, M.windows(3, 1, .8), -1, 4.8, 0, { parent: g });
  cyl(0.3, 0.35, 2, M.black, -3.5, 4.5, 0, { parent: g, seg: 8 });
  return g;
}
export function ferry() {
  const g = new THREE.Group(); g.add(hull(24, 7.4, 2.6, M.hullWhite, 1));
  box(15, 2.8, 5.2, M.windows(10, 1, .9, "#fff3d6"), 0, 3, 0, { parent: g });
  box(16, 0.3, 6.0, M.white, 0, 4.55, 0, { parent: g });
  box(6, 2, 4.4, M.windows(4, 1, .9), 3, 5.7, 0, { parent: g });
  cyl(0.5, 0.6, 2.2, M.paint(0x1f5b8e), -4, 5.8, 0, { parent: g, seg: 10 });
  box(1.2, 0.2, 1.6, M.hullRed, -6, 4.8, 0, { parent: g });
  // railings; the pier side (+z) has a boarding gate at x 2.9–5.3 where the gangway stairs attach
  box(20, 0.06, 0.06, M.steel, -1, 2.55, -3.6, { parent: g }); for (let x = -10; x <= 8; x += 2) cyl(0.03, 0.03, 0.9, M.steel, x, 2.1, -3.6, { parent: g, seg: 5 });
  box(13.9, 0.06, 0.06, M.steel, -4.05, 2.55, 3.6, { parent: g }); box(3.7, 0.06, 0.06, M.steel, 7.15, 2.55, 3.6, { parent: g });
  for (const x of [-10, -8, -6, -4, -2, 0, 2, 2.9, 5.3, 6, 8]) cyl(0.03, 0.03, 0.9, M.steel, x, 2.1, 3.6, { parent: g, seg: 5 });
  return g;
}
function sailboat() {
  const g = new THREE.Group(); g.add(hull(7.5, 2.4, 1.5, M.hullWhite, .5));
  cyl(0.06, 0.08, 9.5, M.steelDark, 0.5, 5.6, 0, { parent: g, seg: 6 });
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, 8.4); s.lineTo(-4.2, 0.2); s.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(s), M.sail); sail.position.set(0.5, 1.5, 0.08); sail.rotation.y = Math.PI / 2; g.add(sail);
  const s2 = new THREE.Shape(); s2.moveTo(0, 0); s2.lineTo(0, 6.5); s2.lineTo(2.6, 0.2); s2.closePath();
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(s2), M.sail); jib.position.set(0.55, 1.5, -0.08); jib.rotation.y = Math.PI / 2; g.add(jib);
  return g;
}
function fishingBoat() {
  const g = new THREE.Group(); g.add(hull(11, 4.2, 2.2, M.paint(0x2f6b8c, .7, .3), .9));
  box(3.6, 2.2, 3.2, M.white, -2, 2.4, 0, { parent: g }); box(3, 1.4, 2.8, M.windows(3, 1, .9), -2, 4.2, 0, { parent: g });
  cyl(0.08, 0.1, 6, M.steelDark, 2, 4, 0, { parent: g, seg: 6 }); box(4, 0.1, 0.1, M.steelDark, 3.5, 6, 0, { parent: g, rz: -.5 });
  return g;
}
function gull() {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.22, 8, 6), M.white, 0, 0, 0, { parent: g, cast: false }); body.scale.set(1, 0.7, 1.8);
  const wl = new THREE.Group(), wr = new THREE.Group(); g.add(wl, wr);
  mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), M.white, -0.5, 0, 0, { parent: wl, cast: false }); mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), M.white, 0.5, 0, 0, { parent: wr, cast: false });
  g.userData.wings = [wl, wr]; return g;
}
function flag(colorA = 0xe8e2d4, colorB = 0xfd6925) {
  const geo = new THREE.PlaneGeometry(3, 1.9, 18, 10);
  const c = document.createElement("canvas"); c.width = 192; c.height = 128; const g2 = c.getContext("2d");
  g2.fillStyle = "#" + colorA.toString(16).padStart(6, "0"); g2.fillRect(0, 0, 192, 128); g2.fillStyle = "#" + colorB.toString(16).padStart(6, "0"); g2.beginPath(); g2.arc(96, 64, 34, 0, Math.PI * 2); g2.fill();
  g2.fillStyle = "#fff"; g2.font = "bold 36px sans-serif"; g2.textAlign = "center"; g2.fillText("9", 96, 77);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: .9 }));
  m.userData.base = geo.attributes.position.array.slice(); m.castShadow = SH; return m;
}

export function buildTraffic() {
  const api = { speed: 1, cranesFrozen: false };
  const upd = [];

  // ── moored container ship + 2 STS cranes ──
  const moored = containerShip(48, 11); moored.position.set(-38, 0, -8.5); scene.add(moored);
  upd.push((dt, t) => { moored.position.y = Math.sin(t * .5) * .06; moored.rotation.x = Math.sin(t * .4) * .004; });

  api.cranes = [-48, -28].map((cx, i) => {
    const g = new THREE.Group(); g.position.set(cx, G, 2); scene.add(g);
    for (const x of [-5, 5]) for (const z of [0.5, 7]) box(1.1, 27, 1.1, M.crane, x, 13.5, z, { parent: g });
    for (const z of [0.5, 7]) box(12, 1, 1, M.crane, 0, 27.2, z, { parent: g });
    for (const x of [-5, 5]) box(1, 1, 8, M.crane, x, 27.2, 3.75, { parent: g });
    box(1.4, 1.4, 50, M.craneRed, 0, 28.4, -14, { parent: g });
    box(1.4, 1.4, 50, M.craneRed, 0, 28.4, -14, { parent: g }).position.x = 2.4;
    box(0.6, 8, 0.6, M.crane, 0, 32, 6, { parent: g }); box(0.3, 0.3, 40, M.steel, 0, 34, -12, { parent: g, rx: 0.12 });
    const trolley = new THREE.Group(); trolley.position.set(1.2, 27.4, -8); g.add(trolley); box(3.6, 1.2, 2.6, M.yellow, 0, 0, 0, { parent: trolley });
    const cables = [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]].map(([x, z]) => { const c = cyl(0.03, 0.03, 1, M.steelDark, x, 0, z, { parent: trolley, seg: 4, cast: false }); return c; });
    const spreader = new THREE.Group(); spreader.position.y = -6; trolley.add(spreader); box(6.3, 0.5, 2.5, M.yellow, 0, 0, 0, { parent: spreader });
    const carried = spawnContainer(spreader); carried.position.y = -1.55; carried.visible = false;
    const st = { g, trolley, cables, spreader, carried, phase: i * 3, prog: 0, hoist: 6, frozen: false, stackN: 0, placed: [] };
    const PH = [{ tz: -8 }, { hoist: 20 }, { grab: true }, { hoist: 6 }, { tz: 4 }, { hoist: 23.4 }, { release: true }, { hoist: 6 }];
    st.step = (dt) => {
      if (st.frozen || api.cranesFrozen) return;
      const p = PH[st.phase % PH.length]; const v = dt * api.speed;
      if (p.tz !== undefined) { const d = p.tz - trolley.position.z; const s = Math.sign(d) * Math.min(Math.abs(d), 2.2 * v); trolley.position.z += s; if (Math.abs(d) < .05) st.phase++; }
      else if (p.hoist !== undefined) { const d = p.hoist - st.hoist; const s = Math.sign(d) * Math.min(Math.abs(d), 3.2 * v); st.hoist += s; if (Math.abs(d) < .05) st.phase++; }
      else if (p.grab) { carried.visible = true; st.phase++; }
      else if (p.release) {
        carried.visible = false;
        const slot = H.stackSlots[(i * 3 + st.stackN) % H.stackSlots.length]; const level = Math.floor(st.stackN / H.stackSlots.length) % 2;
        const m = spawnContainer(scene, carried.material.color.getHex()); m.position.set(slot[0], G + 1.3 + level * 2.6, slot[1]); st.placed.push(m);
        if (st.placed.length > 6) { const old = st.placed.shift(); scene.remove(old); }
        carried.material = M.container(pick(CONTAINER_COLORS)); st.stackN++; st.phase++;
      }
      spreader.position.y = -st.hoist; cables.forEach(c => { c.scale.y = st.hoist; c.position.y = -st.hoist / 2; });
    };
    upd.push(st.step);
    return st;
  });

  // ── transit cargo ship with tugs on the shipping lane ──
  const big = containerShip(86, 14); big.scale.setScalar(1.15); big.position.set(150, 0, -96); scene.add(big);
  const tugs = [tug(0xb8402f), tug(0x2f6b8c)]; tugs.forEach(t => scene.add(t));
  const wake = mesh(new THREE.PlaneGeometry(60, 8), new THREE.MeshBasicMaterial({ color: 0xdfeaf0, transparent: true, opacity: .22, depthWrite: false }), 0, 0.06, 0, { rx: -Math.PI / 2, cast: false, recv: false });
  let bigX = 150, bigDir = -1, horned = false;
  upd.push((dt, t) => {
    bigX += bigDir * 3.2 * dt * api.speed;
    if (bigX < -190) { bigX = 190; horned = false; }
    big.position.x = bigX; big.rotation.y = Math.PI; big.position.y = Math.sin(t * .6) * .1;
    tugs[0].position.set(bigX + 30, 0, -86); tugs[0].rotation.y = Math.PI; tugs[1].position.set(bigX - 48, 0, -104); tugs[1].rotation.y = Math.PI;
    tugs.forEach((tg, k) => { tg.position.y = Math.sin(t * 1.3 + k) * .15; tg.rotation.z = Math.sin(t * .9 + k) * .03; });
    wake.position.set(bigX + 70, 0.06, -96); wake.scale.x = 1 + Math.sin(t) * .05;
    if (!horned && bigX < 60 && bigX > 40) { horned = true; horn(true); }
  });
  api.anchorShips = () => { api.speed = 0; };

  // ── ferry: arrival cinematic + regular loop ──
  const fy = ferry(); fy.position.set(18.2, 0, -140); fy.rotation.y = -Math.PI / 2; scene.add(fy);
  api.ferry = { mesh: fy, state: "away", t: 0 };
  api.ferry.arrive = () => new Promise(res => { api.ferry.state = "arriving"; api.ferry.t = 0; api.ferry.onDock = res; });
  upd.push((dt, t) => {
    const f = api.ferry;
    const bob = () => { fy.position.y = Math.sin(t * .9) * .12; fy.rotation.z = Math.sin(t * .7) * .015; };
    if (f.state === "arriving") { f.t += dt; const k = Math.min(1, f.t / 16); const e = smoothstep(k); fy.position.z = -140 + (126) * e; fy.rotation.y = -Math.PI / 2 + Math.sin(k * Math.PI) * .12; bob(); if (k >= 1) { f.state = "docked"; f.t = 0; f.onDock && f.onDock(); } }
    else if (f.state === "docked") { bob(); f.t += dt; if (f.t > 75) { f.state = "leaving"; f.t = 0; horn(false); } }
    else if (f.state === "leaving") { f.t += dt; const k = Math.min(1, f.t / 20); fy.position.z = -14 - 126 * smoothstep(k); bob(); if (k >= 1) { f.state = "away"; f.t = 0; } }
    else if (f.state === "away") { f.t += dt; if (f.t > 40 && !f.manual) { f.state = "arriving"; f.t = 0; } }
  });

  // ── small craft near the lighthouse ──
  const boats = [];
  for (let i = 0; i < 3; i++) { const b = sailboat(); b.position.set(30 + i * 14, 0, -60 - i * 9); b.rotation.y = rand(0, 6); scene.add(b); boats.push({ m: b, ph: rand(0, 6), sail: i === 2 }); }
  const fb = fishingBoat(); scene.add(fb); let fbA = 0;
  upd.push((dt, t) => {
    boats.forEach(b => { b.m.position.y = Math.sin(t * .8 + b.ph) * .18; b.m.rotation.z = Math.sin(t * .6 + b.ph) * .06; b.m.rotation.x = Math.cos(t * .5 + b.ph) * .03; if (b.sail) { b.m.position.x += Math.sin(b.m.rotation.y + Math.PI / 2) * .8 * dt; b.m.position.z += Math.cos(b.m.rotation.y + Math.PI / 2) * .8 * dt; if (b.m.position.x > 90 || b.m.position.x < -10) b.m.rotation.y += Math.PI; } });
    fbA += dt * .05 * api.speed; fb.position.set(40 + Math.cos(fbA) * 22, Math.sin(t * 1.1) * .2, -40 + Math.sin(fbA) * 16); fb.rotation.y = -fbA + Math.PI / 2; fb.rotation.z = Math.sin(t * .8) * .04;
  });

  // (road vehicles live in vehicles.js)

  // ── gulls ──
  const gulls = [];
  for (let i = 0; i < quality.gulls; i++) { const g = gull(); scene.add(g); gulls.push({ m: g, c: [rand(-50, 40), rand(9, 18), rand(-30, 10)], r: rand(8, 22), w: rand(.25, .5) * (Math.random() < .5 ? 1 : -1), ph: rand(0, 6), fl: rand(6, 9) }); }
  upd.push((dt, t) => { for (const g of gulls) { const a = t * g.w + g.ph; const x = g.c[0] + Math.cos(a) * g.r, z = g.c[2] + Math.sin(a) * g.r; g.m.position.set(x, g.c[1] + Math.sin(t * .7 + g.ph) * 1.2, z); g.m.rotation.y = -a - (g.w > 0 ? 0 : Math.PI); g.m.rotation.z = -Math.sign(g.w) * .35; const f = Math.sin(t * g.fl + g.ph) * .55; g.m.userData.wings[0].rotation.z = f; g.m.userData.wings[1].rotation.z = -f; } });

  // ── flags ──
  const flags = H.flagPoles.map(([x, y, z]) => { const f = flag(); f.position.set(x + 1.5, y, z); scene.add(f); return f; });
  const pf = flag(0x1f5b8e, 0xe8e2d4); pf.position.set(13.8 + 1.5, G + 4.2, -8.6); scene.add(pf); flags.push(pf);
  upd.push((dt, t) => { for (const f of flags) { const p = f.geometry.attributes.position; const b = f.userData.base; for (let i = 0; i < p.count; i++) { const x = b[i * 3], y = b[i * 3 + 1]; const k = (x + 1.5) / 3; p.setZ(i, Math.sin(x * 2.2 - t * 5) * .22 * k + Math.sin(y * 3 + t * 3) * .06 * k); } p.needsUpdate = true; f.geometry.computeVertexNormals(); } });

  // ── buoys, turbines, lighthouse beam, drone, arm, AI ring ──
  upd.push((dt, t) => {
    H.buoys.forEach(b => { b.g.position.y = Math.sin(t * 1.2 + b.phase) * .25; b.g.rotation.z = Math.sin(t * .8 + b.phase) * .08; b.l.material.emissiveIntensity = (Math.sin(t * 2.5 + b.phase) > .6) ? 2.5 : .2; });
    H.turbines.forEach((h, i) => h.rotation.z += dt * (.6 + i * .12));
    if (api.beamOn) { H.beam.rotation.y += dt * .8; H.beamMat.opacity = Math.min(.26, H.beamMat.opacity + dt * .1); H.lighthouseLight.intensity = Math.min(6, H.lighthouseLight.intensity + dt * 2); }
    H.drone.position.y = G + 4.5 + Math.sin(t * 1.4) * .5; H.drone.position.x = 54 + Math.sin(t * .5) * 2; H.drone.rotation.y = t * .3; H.props.forEach(p => p.rotation.y += dt * 40);
    H.armJoints[0].rotation.y = Math.sin(t * .6) * 1.2; H.armJoints[1].rotation.x = .6 + Math.sin(t * .9) * .5;
    H.core.rotation.y += dt * .6; H.core.rotation.x += dt * .2;
    H.aiRing.rotation.z += dt * 1.5; H.aiRing.material.emissiveIntensity = api.aiTalking ? 1.6 + Math.sin(t * 12) * .6 : .6;
    H.holo.material.opacity = .55 + Math.sin(t * 3) * .15;
  });

  addUpdate((dt, t) => { for (const f of upd) f(dt, t); });
  api.lighthouse = on => { api.beamOn = on; };
  api.freezeCrane = (i, on = true) => { api.cranes[i].frozen = on; };
  return api;
}
