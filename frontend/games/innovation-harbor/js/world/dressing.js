// Set dressing: the small things that make the harbor read as a working port — mooring ropes,
// tyre fenders, life rings, pallets with barrels and crates, a parked forklift, traffic cones,
// floodlight towers, zebra crossings, cable reels, a crew container office. Pure decoration:
// nothing here is referenced by the story; solid pieces register a walk block so the player
// cannot pass through them.
import * as THREE from "three";
import { scene, quality, registerLamp } from "./scene.js";
import { M, T } from "./materials.js";
import { mesh, box, boxOn, cyl, G } from "./harbor.js";
import { addBlock } from "./roam.js";
import { rand, pick } from "../util.js";

const SH = quality.high;
const std = o => new THREE.MeshStandardMaterial(o);
const D = {
  cone: std({ color: 0xf26b1d, roughness: .6 }), coneBand: std({ color: 0xf3f3f3, roughness: .5 }),
  pallet: std({ map: T.wood, roughness: .9, color: 0xb59a6a }),
  crate: std({ map: T.wood, roughness: .9, color: 0x9a7c52 }),
  barrel: [std({ color: 0x2f6fbf, roughness: .5, metalness: .4 }), std({ color: 0xc9a227, roughness: .5, metalness: .4 }), std({ color: 0x8a2f24, roughness: .5, metalness: .4 }), std({ color: 0x3c7d5a, roughness: .5, metalness: .4 })],
  rope: std({ color: 0xd9c9a3, roughness: 1 }),
  ring: std({ color: 0xf26b1d, roughness: .6 }), ringWhite: std({ color: 0xf3f3f3, roughness: .6 }),
  forklift: std({ color: 0xe0a33a, roughness: .45, metalness: .4 }),
  reel: std({ map: T.wood, roughness: .9, color: 0x8a6a44 }), cable: std({ color: 0x1b1b1f, roughness: .9 }),
  sign: std({ color: 0xf3f3f3, roughness: .5 }), signRed: std({ color: 0xc8302a, roughness: .5 }),
  office: std({ map: T.corrugated, color: 0xe8e4da, roughness: .7, metalness: .25 }),
};

// ── pieces ──
function rope(a, b, sag = 0.35) {
  // a slack mooring line: a thin tube along a 3-point curve between two bollards
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5); mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  mesh(new THREE.TubeGeometry(curve, 10, 0.035, 5), D.rope, 0, 0, 0, { cast: false });
}
function tyre(x, y, z, ry = 0) { mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 18), M.rubber, x, y, z, { ry }); }
function lifeRing(x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
  mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 24), D.ring, 0, 0, 0, { parent: g });
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) mesh(new THREE.TorusGeometry(0.3, 0.075, 8, 24, 0.5), D.ringWhite, 0, 0, 0, { parent: g, ry: 0, rz: a });
  box(0.08, 0.5, 0.08, M.steelDark, 0, -0.35, -0.08, { parent: g });
}
function pallet(x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = ry; scene.add(g);
  for (const dz of [-0.45, 0, 0.45]) box(1.2, 0.08, 0.1, D.pallet, 0, 0.1, dz, { parent: g });
  for (const dx of [-0.5, 0, 0.5]) box(0.1, 0.1, 1.0, D.pallet, dx, 0.05, 0, { parent: g });
  return g;
}
function barrels(x, z, n = 3) {
  const g = pallet(x, z, rand(-0.2, 0.2));
  const spots = [[-0.3, -0.25], [0.3, -0.25], [0, 0.3], [-0.3, 0.3], [0.3, 0.3]];
  for (let i = 0; i < n; i++) { const [dx, dz] = spots[i]; const m = pick(D.barrel); cyl(0.28, 0.28, 0.86, m, dx, 0.57, dz, { parent: g, seg: 14 }); for (const y of [0.3, 0.84]) mesh(new THREE.TorusGeometry(0.285, 0.02, 6, 18), M.steelDark, dx, y, dz, { parent: g, rx: Math.PI / 2 }); }
  addBlock([x - 0.8, x + 0.8, z - 0.8, z + 0.8]);
}
function crates(x, z) {
  const g = pallet(x, z, rand(-0.15, 0.15));
  boxOn(1.0, 0.6, 0.9, D.crate, 0, 0.14, 0, { parent: g }); boxOn(0.7, 0.5, 0.6, D.crate, 0.1, 0.74, 0.05, { parent: g, ry: 0.2 });
  for (const y of [0.3, 0.6]) box(1.04, 0.05, 0.94, M.steelDark, 0, 0.14 + y, 0, { parent: g, cast: false });
  addBlock([x - 0.7, x + 0.7, z - 0.7, z + 0.7]);
}
function cone(x, z) {
  const g = new THREE.Group(); g.position.set(x, G, z); scene.add(g);
  box(0.42, 0.04, 0.42, M.black, 0, 0.02, 0, { parent: g, cast: false });
  mesh(new THREE.ConeGeometry(0.18, 0.72, 12), D.cone, 0, 0.4, 0, { parent: g });
  mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.1, 12), D.coneBand, 0, 0.5, 0, { parent: g, cast: false });
}
function forklift(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = ry; scene.add(g);
  box(1.1, 0.5, 1.9, D.forklift, 0, 0.55, 0, { parent: g });                    // body
  box(0.9, 0.2, 0.8, M.black, 0, 0.9, 0.35, { parent: g });                      // seat base
  box(0.6, 0.5, 0.12, M.black, 0, 1.2, 0.6, { parent: g });                      // seat back
  cyl(0.18, 0.18, 0.04, M.black, 0, 1.05, -0.1, { parent: g, rx: -0.9, seg: 12 }); // steering wheel
  for (const dx of [-0.5, 0.5]) cyl(0.05, 0.05, 2.1, M.steelDark, dx, 1.3, -0.7, { parent: g, seg: 6 }); // overhead guard posts
  box(1.1, 0.06, 1.3, M.steelDark, 0, 2.3, -0.1, { parent: g });
  for (const dx of [-0.28, 0.28]) box(0.08, 2.4, 0.1, M.steelDark, dx, 1.2, -1.05, { parent: g }); // mast
  box(0.9, 0.08, 0.1, M.steelDark, 0, 0.35, -1.05, { parent: g });
  for (const dx of [-0.3, 0.3]) box(0.12, 0.05, 1.0, M.steel, dx, 0.08, -1.55, { parent: g }); // forks
  for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.65], [0.55, 0.65]]) { cyl(0.26, 0.26, 0.22, M.rubber, dx, 0.26, dz, { parent: g, rz: Math.PI / 2, seg: 14 }); cyl(0.12, 0.12, 0.24, M.steel, dx, 0.26, dz, { parent: g, rz: Math.PI / 2, seg: 10 }); }
  mesh(new THREE.SphereGeometry(0.08, 8, 6), D.cone, 0.4, 2.36, -0.1, { parent: g }); // beacon
  const c = Math.cos(ry), s = Math.sin(ry); const hw = Math.abs(c) * 0.8 + Math.abs(s) * 1.4, hd = Math.abs(s) * 0.8 + Math.abs(c) * 1.4;
  addBlock([x - hw, x + hw, z - hd, z + hd]);
}
function floodTower(x, z) {
  const g = new THREE.Group(); g.position.set(x, G, z); scene.add(g);
  box(1.4, 0.3, 1.4, M.stone, 0, 0.15, 0, { parent: g });
  cyl(0.16, 0.26, 16, M.steelDark, 0, 8.3, 0, { parent: g, seg: 10 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; box(0.1, 0.1, 1.2, M.steelDark, Math.sin(a) * 0.6, 15.6, Math.cos(a) * 0.6, { parent: g, ry: a }); }
  box(2.2, 0.08, 2.2, M.steelDark, 0, 16.3, 0, { parent: g, cast: false });
  const m = M.warm(); registerLamp(m, 2.6);
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7], [0, 0]]) box(0.55, 0.3, 0.55, m, dx, 16.1, dz, { parent: g, cast: false });
  addBlock([x - 0.8, x + 0.8, z - 0.8, z + 0.8]);
}
function zebra(x, z, w, along = "z") {
  // white bars across a road; along = axis the road runs on
  for (let i = -3; i <= 3; i++) {
    if (along === "x") box(0.6, 0.012, w, D.sign, x + i * 1.2, G + 0.095, z, { cast: false });
    else box(w, 0.012, 0.6, D.sign, x, G + 0.095, z + i * 1.2, { cast: false });
  }
}
function reel(x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = ry; scene.add(g);
  for (const dx of [-0.45, 0.45]) cyl(0.75, 0.75, 0.08, D.reel, dx, 0.75, 0, { parent: g, rz: Math.PI / 2, seg: 18 });
  cyl(0.45, 0.45, 0.82, D.cable, 0, 0.75, 0, { parent: g, rz: Math.PI / 2, seg: 18 });
  addBlock([x - 0.9, x + 0.9, z - 0.9, z + 0.9]);
}
function noEntrySign(x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = ry; scene.add(g);
  cyl(0.04, 0.05, 2.4, M.steelDark, 0, 1.2, 0, { parent: g, seg: 8 });
  cyl(0.36, 0.36, 0.04, D.signRed, 0, 2.3, 0, { parent: g, rx: Math.PI / 2, seg: 20 });
  box(0.46, 0.1, 0.05, D.sign, 0, 2.3, 0.01, { parent: g, cast: false });
}
function crewOffice(x, z) {
  // a crew container office: windows, door, a step and an air-con unit on the roof
  const g = new THREE.Group(); g.position.set(x, G, z); scene.add(g);
  boxOn(6.1, 2.7, 2.6, D.office, 0, 0, 0, { parent: g });
  for (const dx of [-1.8, 0.4]) box(1.1, 0.8, 0.06, M.windows(2, 1, 0.8, "#ffe9b8"), dx, 1.7, 1.32, { parent: g, cast: false });
  box(0.9, 2.1, 0.06, M.steelDark, 2.0, 1.05, 1.32, { parent: g, cast: false });
  box(1.2, 0.18, 0.6, M.steel, 2.0, 0.09, 1.6, { parent: g });
  box(0.9, 0.5, 0.7, M.steel, -2.2, 2.95, 0.4, { parent: g });
  const m = M.warm(); registerLamp(m, 1.2); box(0.3, 0.12, 0.2, m, 2.0, 2.4, 1.38, { parent: g, cast: false });
  addBlock([x - 3.2, x + 3.2, z - 1.5, z + 1.9]);
}

export function buildDressing() {
  // ── quay edge: mooring ropes between bollards, tyre fenders, life rings ──
  const bollards = []; for (let x = -88; x <= 88; x += 8) bollards.push(new THREE.Vector3(x, G + 0.62, 0.9));
  for (let i = 0; i < bollards.length - 1; i++) if (i % 3 !== 2) rope(bollards[i], bollards[i + 1], 0.3);
  for (let x = -10; x <= 60; x += 7) if (Math.abs(x - 10) > 5) tyre(x + rand(-1, 1), G - 0.05, 0.05, 0);
  for (const z of [-19, -11, -3]) { tyre(5.95, G - 0.1, z, Math.PI / 2); tyre(14.05, G - 0.1, z, Math.PI / 2); }
  lifeRing(6.3, G + 1.25, -16, Math.PI / 2); lifeRing(13.7, G + 1.25, -6, -Math.PI / 2); lifeRing(18, G + 1.25, 1.6, 0);

  // ── container quay: pallets, barrels, crates, a forklift, cones, cable reels, floodlights ──
  barrels(-12.5, 8.4, 3); barrels(-10.2, 10.6, 4); crates(-13.6, 12.2); crates(-9.6, 6.6);
  forklift(-13, 4.4, 0.3);
  for (const [x, z] of [[-30, 4.0], [-27.5, 4.0], [-25, 4.0], [-22.5, 4.0]]) cone(x, z);
  reel(-64, 7.5, 0.3); reel(-66.2, 7.5, -0.2);
  floodTower(-62, 13.2); floodTower(-8, 7.6);
  noEntrySign(-34, 7.0, Math.PI / 2); crewOffice(-70, 11.6);

  // ── streets: zebra crossings where the walk legs cross the roads, cones at the lab plaza ──
  zebra(-15, 19, 5.6, "x");   // road A at the lab turning
  zebra(35, 19, 5.6, "x");    // road A by the workshop
  zebra(-15, 43, 5.6, "x");   // road B at the archive
  zebra(26, 43, 5.6, "x");    // road B in front of the Council steps
  zebra(-19, 30, 5.6, "z");   // the lab's side road
  zebra(39, 30, 5.6, "z");    // the workshop's side road

  // ── pier: a cable reel and crates for the ferry crew ──
  crates(11.5, -21.5);
  if (SH) { for (let i = 0; i < 6; i++) tyre(-40 + i * 6 + rand(-1, 1), G - 0.05, 0.05, 0); }
}
