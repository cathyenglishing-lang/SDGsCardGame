// Static harbor geometry: land, roads, quays, pier, buildings for the six stations,
// lighthouse island, breakwater, skyline, props. Animated things live in traffic.js.
import * as THREE from "three";
import { scene, quality, registerLamp } from "./scene.js";
import { M, T, CONTAINER_COLORS } from "./materials.js";
import { rand, pick } from "../util.js";

const SH = quality.high;
export const mesh = (geo, mat, x = 0, y = 0, z = 0, { ry = 0, rx = 0, rz = 0, cast = true, recv = true, parent = scene } = {}) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = SH && cast; m.receiveShadow = SH && recv; parent.add(m); return m;
};
export const box = (w, h, d, mat, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
export const boxOn = (w, h, d, mat, x, baseY, z, o) => box(w, h, d, mat, x, baseY + h / 2, z, o);
export const cyl = (rt, rb, h, mat, x, y, z, o = {}) => mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 12), mat, x, y, z, o);
export const G = 0.6; // ground level (quay top)

// ── stations & actor spots ──
export const STATIONS = {
  pier:     { name: "Ferry Pier",          pos: [10, G, -11], label: [10, 6, -14], view: { pos: [-2, 5, 0], look: [11, 2, -12] } },
  lab:      { name: "AI Lab",              pos: [-30, G, 26], label: [-38, 44, 34], view: { pos: [-20, 5, 16], look: [-34, 9, 30] } },
  archive:  { name: "Harbor Archive",      pos: [-6, G, 46],  label: [-4, 13, 60], view: { pos: [-18, 4, 38], look: [-4, 4, 54] } },
  council:  { name: "Port Council",        pos: [26, G, 47.5], label: [26, 17, 66], view: { pos: [12, 5, 40], look: [26, 6, 57] } },
  workshop: { name: "Innovation Workshop", pos: [46, G, 30],  label: [62, 12, 32], view: { pos: [36, 4, 22], look: [54, 4, 32] } },
  theater:  { name: "Waterfront Theater",  pos: [27, 0.9, 5.5], label: [27, 10, 2], view: { pos: [27, 6, 24], look: [27, 4, 4] } },
};
export const SPOTS = {
  playerStart: [10, G, -21],
  mei: [12.6, G, -8.2],
  kai: [-33.6, G, 24.4], // on the plaza in front of the AI Lab (the tower occupies z 27–41)
  hsu: [-4, 1.1, 51],
  wang: [26, 1.8, 55.5], councilA: [21, 1.8, 56.5], councilB: [31, 1.8, 56.5],
  podium: [26, 1.8, 53.2],
  hsu2: [48.6, G, 32.2], kai2: [48.6, G, 27.8],
  meiTheater: [23.5, 1.1, 9.2],
  stage: [27, 0.9, 5.5],
  speakerPole: new THREE.Vector3(13.8, 5.2, -8.6),
  councilHolo: new THREE.Vector3(32, 4.2, 52),
};
// Walk legs between stations (x, z) on sidewalks. y = ground unless given.
export const PATHS = {
  arrive: [[10, -11]],
  pierToLab: [[10, 15], [-15, 15], [-15, 26], [-30, 26]],
  labToArchive: [[-15, 26], [-15, 46], [-6, 46]],
  archiveToCouncil: [[26, 47.5]],
  councilToWorkshop: [[35, 47.5], [35, 30], [46, 30]],
  workshopToTheater: [[35, 30], [35, 15]],
  stageEntry: [[18, 0.9, 5.5], [27, 0.9, 5.5]],
  toPodium: [[26, 0.6, 49], [26, 1.0, 49.8], [26, 1.4, 50.8], [26, 1.8, 51.8], [26, 1.8, 53.2]],
  crowdA: [[-60, 15], [60, 15], [60, 23.2], [-60, 23.2]],
  crowdB: [[-15, 27], [-15, 46.5], [34, 46.5], [34, 27]],
  crowdC: [[43, 24], [43, 47], [-14, 47.5], [-14, 24]],
};

export const screenCanvas = document.createElement("canvas");
screenCanvas.width = 1024; screenCanvas.height = 576;
export const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.colorSpace = THREE.SRGBColorSpace;
export function drawScreen(kicker, title, body = "", footer = "SDG 9 · INDUSTRY, INNOVATION AND INFRASTRUCTURE") {
  const g = screenCanvas.getContext("2d"); const W = 1024, H = 576;
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, "#101c28"); gr.addColorStop(1, "#1d3246");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = "#fd6925"; g.fillRect(64, 64, 140, 10);
  g.fillStyle = "#fd6925"; g.font = "600 30px 'Chakra Petch', sans-serif"; g.fillText(kicker, 64, 128);
  g.fillStyle = "#f1ecdf"; g.font = "700 56px 'Chakra Petch', 'Manrope', sans-serif";
  let y = 210; const wrap = (text, font, lh, max) => { g.font = font; let line = ""; for (const w of String(text).split(" ")) { if (g.measureText(line + w).width > max) { g.fillText(line, 64, y); y += lh; line = ""; } line += w + " "; } g.fillText(line, 64, y); y += lh; };
  wrap(title, "700 56px 'Chakra Petch', 'Manrope', sans-serif", 66, 896);
  if (body) { y += 10; g.fillStyle = "#cfd8e0"; wrap(body, "500 28px 'Manrope', sans-serif", 38, 896); }
  g.fillStyle = "#8fa3b3"; g.font = "500 22px 'Chakra Petch', sans-serif"; g.fillText(footer, 64, 528);
  screenTex.needsUpdate = true;
}

export const H = {}; // handles to objects other modules animate or re-style

export function buildHarbor() {
  // ── land, quay edge, pier ──
  const land = box(190, 2.6, 118, M.concrete, 0, G - 1.3, 59, { cast: false }); land.receiveShadow = SH;
  box(190, 0.1, 3, M.quay, 0, G + 0.03, 1.5, { cast: false });
  for (let x = -88; x <= 88; x += 8) { cyl(0.22, 0.26, 0.7, M.steelDark, x, G + 0.35, 0.9, { seg: 10 }); }
  for (let x = -60; x <= -14; x += 6) mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.4, 8), M.rubber, x, 0.2, -0.3, { rz: Math.PI / 2 });
  // ferry pier
  box(8, 1.2, 24, M.quay, 10, 0, -11);
  for (let z = -22; z <= 0; z += 4) for (const x of [6.6, 13.4]) cyl(0.35, 0.35, 3, M.trunk, x, -1, z, { seg: 8 });
  for (const x of [6.3, 13.7]) { for (let z = -22.5; z <= 0.5; z += 2.3) cyl(0.05, 0.05, 1.1, M.steel, x, G + 0.55, z, { seg: 6 }); box(0.06, 0.06, 24, M.steel, x, G + 1.1, -11); box(0.06, 0.06, 24, M.steel, x, G + 0.7, -11); }
  // loudspeaker pole (HARBOR-AI voice)
  cyl(0.12, 0.16, 5, M.steelDark, 13.8, G + 2.5, -8.6, { seg: 8 });
  for (const a of [0.6, 2.6, 4.2]) mesh(new THREE.ConeGeometry(0.28, 0.6, 10, 1, true), M.steelDark, 13.8 + Math.sin(a) * 0.4, G + 4.9, -8.6 + Math.cos(a) * 0.4, { ry: a, rx: Math.PI / 2 });
  H.aiRing = mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), M.cyan, 13.8, G + 5.25, -8.6, { rx: Math.PI / 2 });

  // ── roads & sidewalks ──
  const road = (w, d, x, z) => { box(w, 0.08, d, M.asphalt, x, G + 0.04, z, { cast: false }); };
  const walk = (w, d, x, z) => box(w, 0.14, d, M.paving, x, G + 0.07, z, { cast: false });
  road(180, 6, 0, 19); walk(180, 2, 0, 15); walk(180, 2.5, 0, 23.25);
  road(150, 6, 5, 43); walk(150, 2, 5, 39); walk(150, 2, 5, 47);
  road(6, 46, -19, 38); walk(2, 46, -15, 38); walk(2, 46, -23, 38);
  road(6, 46, 39, 38); walk(2, 46, 35, 38); walk(2, 46, 43, 38);
  const line = (w, d, x, z) => { const m = box(w, 0.01, d, new THREE.MeshStandardMaterial({ map: T.roadLine, transparent: true, roughness: 1 }), x, G + 0.09, z, { cast: false }); return m; };
  line(180, 0.3, 0, 19); line(150, 0.3, 5, 43);
  // trees & lamps
  for (let x = -80; x <= 80; x += 16) { if (Math.abs(x + 38) < 12) continue; tree(x + rand(-1, 1), 25.2); }
  for (let x = -70; x <= 70; x += 18) { if (x > 10 && x < 42) continue; tree(x + rand(-1, 1), 49.2); } // keep the Council frontage clear
  for (let x = -84; x <= 84; x += 14) lamp(x, 24.2, 0); for (let x = -66; x <= 66; x += 18) { if (x > 10 && x < 42) continue; lamp(x, 48.3, Math.PI); }
  bench(-26, 25.2, Math.PI); bench(-34, 25.2, Math.PI); bench(6, 24, Math.PI); bench(20, 14.2, 0);

  // ── container quay ──
  let ci = 0;
  for (let x = -58; x <= -18; x += 6.6) for (let z = 9; z <= 12; z += 2.7) { const n = 1 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) container(x, G + k * 2.6, z, CONTAINER_COLORS[ci++ % CONTAINER_COLORS.length], rand(-.03, .03)); }
  H.stackSlots = []; for (let x = -56; x <= -20; x += 6.6) H.stackSlots.push([x, 6]);

  // ── AI Lab: glass tower + plaza + outdoor screen + rooftop core ──
  box(22, 0.14, 8, M.paving, -35, G + 0.07, 27, { cast: false });
  box(16, 40, 14, M.windows(10, 28, .5, "#bfe7ff"), -38, G + 20, 34);
  box(16.6, 0.8, 14.6, M.steelDark, -38, G + 40.4, 34);
  box(5, 2.2, 5, M.steelDark, -38, G + 41.9, 34);
  H.core = mesh(new THREE.TorusKnotGeometry(1.6, 0.42, 96, 10), M.orange, -38, G + 45.5, 34);
  mesh(new THREE.PlaneGeometry(9, 5), M.screen(T.lab), -38, G + 7.5, 26.9, { ry: Math.PI, cast: false });
  box(9.4, 5.4, 0.3, M.steelDark, -38, G + 7.5, 27.1);
  cyl(0.2, 0.25, 2.6, M.steelDark, -30, G + 1.3, 31, { seg: 8 }); // info post

  // ── Harbor Archive: brick building with arcade ──
  box(24, 0.5, 5.2, M.stone, -4, G + 0.25, 51);
  box(24, 0.3, 1.2, M.stone, -4, G + 0.15, 48.3);
  box(22, 10, 14, M.brick, -4, G + 5.5, 60);
  box(23, 0.6, 15, M.stone, -4, G + 10.8, 60);
  for (let x = -14; x <= 6; x += 4) cyl(0.42, 0.42, 5.4, M.stone, x, G + 3.2, 51.2, { seg: 14 });
  box(24, 0.6, 5, M.stone, -4, G + 6.1, 52);
  for (let x = -12; x <= 4; x += 4) box(2.2, 3, 0.3, M.windows(2, 3, .4), x, G + 8.4, 53.0);
  box(3, 5, 0.3, M.steelDark, -4, G + 3, 53.1);
  mesh(new THREE.PlaneGeometry(8, 1.2), M.screen(label("HARBOR ARCHIVE")), -4, G + 6.9, 49.45, { ry: Math.PI, cast: false });

  // ── Port Council: stone hall with steps, columns, dome, flags ──
  for (let i = 0; i < 3; i++) box(26, 0.4 * (i + 1), 1, M.stone, 26, G + 0.2 * (i + 1), 49.5 + i);
  box(26, 1.2, 8, M.stone, 26, G + 0.6, 56);
  box(24, 13, 16, M.windows(8, 6, .35), 26, G + 1.2 + 6.5, 66);
  for (let x = 16; x <= 36; x += 4) cyl(0.5, 0.5, 9, M.stone, x, G + 1.2 + 4.5, 58, { seg: 14 });
  box(26, 1.2, 4, M.stone, 26, G + 1.2 + 9.6, 58);
  mesh(new THREE.CylinderGeometry(3, 3, 26, 3), M.stone, 26, G + 1.2 + 11.6, 58.2, { rz: Math.PI / 2, ry: 0, rx: 0 });
  mesh(new THREE.SphereGeometry(5.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.paint(0x6f9a93, .5, .4), 26, G + 14.2, 66);
  // flags: two per side, so the podium sight line stays clear
  H.flagPoles = [15, 20, 32, 37].map(x => { cyl(0.08, 0.1, 11, M.steel, x, G + 5.5, 48.2, { seg: 8 }); return [x, G + 10.3, 48.2]; });
  H.holo = mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshBasicMaterial({ map: T.screenGlow, transparent: true, opacity: .7 }), 32, G + 3.6, 52, { ry: Math.PI, cast: false });
  cyl(0.08, 0.1, 3.4, M.steelDark, 32, G + 1.7, 52.3, { seg: 8 });
  // podium
  box(1.2, 1.1, 0.7, M.wood, 26, G + 1.2 + 0.55, 53.9);

  // ── Innovation Workshop: sawtooth warehouse, open door, drone, robot arm ──
  box(24, 8, 18, M.paint(0x8c6a52, .8, .3), 62, G + 4, 32);
  for (let k = 0; k < 3; k++) mesh(new THREE.CylinderGeometry(3.2, 3.2, 18, 3), M.paint(0x9c7b63, .8, .3), 54.5 + k * 7.5, G + 9.6, 32, { rx: Math.PI / 2 });
  box(0.4, 6.2, 8.4, M.steelDark, 49.9, G + 3.1, 32);
  const doorGlow = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xffc27a, emissiveIntensity: .8 });
  box(0.1, 6, 8, doorGlow, 49.7, G + 3, 32, { cast: false });
  H.drone = new THREE.Group(); H.drone.position.set(54, G + 4.5, 29); scene.add(H.drone);
  box(0.6, 0.2, 0.6, M.steelDark, 0, 0, 0, { parent: H.drone });
  H.props = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([x, z]) => box(0.8, 0.04, 0.08, M.white, x, 0.15, z, { parent: H.drone }));
  H.arm = new THREE.Group(); H.arm.position.set(56, G, 37); scene.add(H.arm);
  cyl(0.6, 0.8, 0.5, M.steelDark, 0, 0.25, 0, { parent: H.arm, seg: 12 });
  const armA = new THREE.Group(); armA.position.y = 0.5; H.arm.add(armA); box(0.5, 3, 0.5, M.yellow, 0, 1.5, 0, { parent: armA });
  const armB = new THREE.Group(); armB.position.y = 3; armA.add(armB); box(0.4, 2.4, 0.4, M.yellow, 0, 1.2, 0, { parent: armB });
  H.armJoints = [armA, armB];
  mesh(new THREE.PlaneGeometry(10, 1.4), M.screen(label("INNOVATION WORKSHOP")), 49.6, G + 7.3, 32, { ry: -Math.PI / 2, cast: false });

  // ── Waterfront Theater: stage, LED screen, truss, tiers ──
  box(18, 0.3, 6, M.wood, 27, G + 0.15, 5);
  box(18.6, 0.2, 6.6, M.steelDark, 27, G + 0.02, 5);
  H.screen = mesh(new THREE.PlaneGeometry(12, 6.75), M.screen(screenTex), 27, G + 4.8, 2.2, { cast: false });
  box(12.6, 7.3, 0.4, M.steelDark, 27, G + 4.8, 1.95);
  for (const x of [20, 34]) { cyl(0.18, 0.18, 9.5, M.steel, x, G + 4.75, 2, { seg: 8 }); }
  box(14.6, 0.3, 0.3, M.steel, 27, G + 9.4, 2);
  for (const x of [22, 27, 32]) { const sp = mesh(new THREE.ConeGeometry(0.3, 0.6, 10), M.steelDark, x, G + 9, 2.5, { rx: -Math.PI / 2.6 }); }
  for (let i = 0; i < 4; i++) box(24, 0.5 * (i + 1), 1.8, i % 2 ? M.quay : M.stone, 27, G + 0.25 * (i + 1), 9.4 + i * 1.8);
  H.tiers = [0, 1, 2, 3].map(i => ({ z: 9.4 + i * 1.8, y: G + 0.5 * (i + 1) }));
  mesh(new THREE.PlaneGeometry(10, 1.2), M.screen(label("WATERFRONT THEATER")), 27, G + 9.9, 2.3, { cast: false });

  // ── lighthouse island & breakwater & buoys ──
  const isl = new THREE.Group(); isl.position.set(70, 0, -70); scene.add(isl);
  // rocks ring the base (fixed layout: the base top, radius 6, stays clear for the player and the keeper)
  for (const [dx, y, dz, r, rot] of [[-7.5, -1.2, 2.5, 4, 0.4], [6.8, -1.5, -3, 3.5, 1.1], [-3, -1.8, -7.5, 4.2, 2.0], [4, -1.4, 7, 3.2, 0.7], [8, -2, 4, 3, 1.6], [-8, -2.2, -5, 3.4, 2.5], [1, -2.4, -9, 3.6, 0.2], [9, -2.3, -1, 2.8, 1.9]]) { const rk = mesh(new THREE.DodecahedronGeometry(r, 0), M.paint(0x59606a, .95, 0), dx, y, dz, { parent: isl }); rk.rotation.set(rot, rot * 1.7, rot * 0.6); }
  // jetty toward the harbor (the patrol boat lands at its end)
  box(1.6, 0.16, 7.5, M.wood, -6.2, 1.15, 6.2, { parent: isl, ry: -Math.PI / 4 }); for (const k of [-2.5, 0, 2.5]) for (const s of [-0.7, 0.7]) cyl(0.09, 0.09, 2.4, M.trunk, -6.2 + k * 0.707 - s * 0.707, 0, 6.2 - k * 0.707 - s * 0.707, { parent: isl, seg: 6 });
  for (const k of [-3, -1, 1, 3]) box(0.3, 0.3, 0.3, M.steelDark, -6.2 + k * 0.707 + 0.6, 1.4, 6.2 - k * 0.707 + 0.6, { parent: isl });
  cyl(5, 6, 2.5, M.paint(0x6b7079, .95, 0), 0, 1.4, 0, { parent: isl, seg: 10 });
  cyl(1.4, 1.9, 16, new THREE.MeshStandardMaterial({ map: T.stripes("#e8e2d4", "#c8412e"), roughness: .6 }), 0, 10.6, 0, { parent: isl, seg: 16 });
  cyl(2.1, 2.1, 0.5, M.steelDark, 0, 18.9, 0, { parent: isl, seg: 16 });
  const lampMat = M.warm(); registerLamp(lampMat, 3);
  H.lighthouseLamp = mesh(new THREE.SphereGeometry(1, 14, 10), lampMat, 0, 20.3, 0, { parent: isl });
  cyl(1.5, 1.5, 0.3, M.steelDark, 0, 21.4, 0, { parent: isl, seg: 16 });
  H.beam = new THREE.Group(); H.beam.position.y = 20.3; isl.add(H.beam);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const s of [1, -1]) { const b = mesh(new THREE.ConeGeometry(4, 60, 18, 1, true), beamMat, s * 30, 0, 0, { parent: H.beam, rz: s * Math.PI / 2, cast: false, recv: false }); }
  H.beamMat = beamMat;
  H.lighthouseLight = new THREE.PointLight(0xffd59a, 0, 140); H.lighthouseLight.position.set(0, 20.3, 0); isl.add(H.lighthouseLight);
  const bw = box(56, 2.6, 5, M.paint(0x6a717b, .95, 0), 58, 0.3, -43, { ry: -0.46 });
  cyl(0.5, 0.6, 4, M.white, 80, 2.4, -55, { seg: 10 }); H.bwLight = mesh(new THREE.SphereGeometry(0.45, 10, 8), M.navGreen, 80, 4.6, -55);
  H.buoys = [[-4, -34, M.navRed], [24, -34, M.navGreen], [-30, -50, M.navRed]].map(([x, z, m]) => { const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g); cyl(0.6, 0.9, 1.4, m === M.navRed ? M.hullRed : M.paint(0x2f7d3a), 0, 0.5, 0, { parent: g, seg: 10 }); cyl(0.08, 0.08, 2, M.steelDark, 0, 2, 0, { parent: g, seg: 6 }); const l = mesh(new THREE.SphereGeometry(0.28, 8, 6), m, 0, 3.1, 0, { parent: g }); return { g, l, phase: Math.random() * 6 }; });

  // ── wind turbines (built here, animated in traffic.js) ──
  H.turbines = [[-95, -60], [-115, -82], [-82, -98], [-130, -112]].map(([x, z]) => {
    cyl(0.9, 1.6, 44, M.white, x, 22, z, { seg: 12 });
    box(3.5, 2.2, 2.2, M.white, x, 44.5, z + 0.5);
    const hub = new THREE.Group(); hub.position.set(x, 44.5, z - 1); scene.add(hub);
    for (let k = 0; k < 3; k++) { const arm = new THREE.Group(); arm.rotation.z = k * 2.094; const bl = box(0.9, 20, 0.25, M.white, 0, 10, 0, { parent: arm }); bl.scale.set(1, 1, 1); hub.add(arm); }
    return hub;
  });

  // ── skyline ──
  for (let i = 0; i < 26; i++) { const h = rand(18, 62), w = rand(8, 16); box(w, h, rand(8, 16), M.windows(Math.round(w / 2), Math.round(h / 3), .45, i % 3 ? "#ffd59a" : "#bfe7ff"), -120 + i * 9.6 + rand(-2, 2), G + h / 2, 125 + rand(-8, 10)); }
  // right/left filler blocks near roads
  for (let i = 0; i < 6; i++) { const h = rand(9, 16); box(12, h, 10, M.windows(5, Math.round(h / 2.6), .4), -82 + i * 3, G + h / 2, 70 + i * 6); }
  for (let i = 0; i < 5; i++) { const h = rand(10, 18); box(12, h, 12, M.windows(5, Math.round(h / 2.6), .4), 80 - i * 2, G + h / 2, 58 + i * 9); }
}

function container(x, y, z, color, ry = 0) { return box(6.1, 2.6, 2.44, M.container(color), x, y + 1.3, z, { ry }); }
export function spawnContainer(parent, color = pick(CONTAINER_COLORS)) { const m = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.44), M.container(color)); m.castShadow = SH; parent.add(m); return m; }
function tree(x, z) { const g = new THREE.Group(); g.position.set(x, G, z); scene.add(g); cyl(0.14, 0.22, 2.4, M.trunk, 0, 1.2, 0, { parent: g, seg: 7 }); const s = rand(0.9, 1.3); for (const [dx, dy, dz, r] of [[0, 3.2, 0, 1.5], [0.8, 2.7, 0.3, 1.1], [-0.7, 2.9, -0.4, 1.0], [0.1, 4.0, 0.2, 1.0]]) mesh(new THREE.IcosahedronGeometry(r * s, 1), Math.random() < .5 ? M.leaf : M.leaf2, dx, dy, dz, { parent: g }); }
function lamp(x, z, ry) { const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = ry; scene.add(g); cyl(0.07, 0.1, 6, M.steelDark, 0, 3, 0, { parent: g, seg: 8 }); box(1.2, 0.08, 0.08, M.steelDark, 0.55, 6, 0, { parent: g }); const m = M.warm(); registerLamp(m, 1.4); box(0.5, 0.18, 0.3, m, 1.1, 5.92, 0, { parent: g, cast: false }); }
function bench(x, z, ry) { const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = ry; scene.add(g); box(1.8, 0.08, 0.5, M.wood, 0, 0.45, 0, { parent: g }); box(1.8, 0.5, 0.08, M.wood, 0, 0.75, -0.24, { parent: g }); for (const dx of [-0.8, 0.8]) box(0.08, 0.45, 0.5, M.steelDark, dx, 0.22, 0, { parent: g }); }
function label(text) { const c = document.createElement("canvas"); c.width = 1024; c.height = 128; const g = c.getContext("2d"); g.fillStyle = "#121a22"; g.fillRect(0, 0, 1024, 128); g.fillStyle = "#f1ecdf"; g.font = "700 64px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillText(text, 512, 86); g.fillStyle = "#fd6925"; g.fillRect(40, 20, 12, 88); g.fillRect(972, 20, 12, 88); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
