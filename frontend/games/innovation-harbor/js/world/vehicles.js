// Road traffic that reacts to people: sedans, a van and container trucks drive the two
// harbor roads, slow down and honk when someone steps into the lane, brake for the car
// ahead, and knock the player over on a real collision (brake lights, horn, camera shake).
import * as THREE from "three";
import { scene, quality, addUpdate } from "./scene.js";
import { M, CONTAINER_COLORS } from "./materials.js";
import { mesh, box, G } from "./harbor.js";
import { rand, pick, clamp } from "../util.js";
import { carHorn, thud } from "../audio.js";
import { knockdown, roaming, roamPlayer, drivingNow } from "./roam.js";
import { shake } from "./camera.js";
import { log } from "../telemetry.js";
import { S } from "../state.js";
import { toast, renderHud } from "../ui/sheet.js";

const SH = quality.high;
const LANES = [{ z: 17.6, dir: 1, road: "A" }, { z: 20.4, dir: -1, road: "A" }, { z: 41.6, dir: 1, road: "B" }, { z: 44.4, dir: -1, road: "B" }];
const PAINTS = [0xd84a3a, 0x2f6fbf, 0xe8e8ea, 0x1e2a36, 0x8a9aa8, 0xc9a227, 0x3c7d5a];

const lampMat = (color, i = 1.4) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: i, roughness: .3 });
function wheels(g, xs, zs, r = 0.36, w = 0.26) {
  const out = [];
  for (const x of xs) for (const z of zs) {
    const wh = mesh(new THREE.CylinderGeometry(r, r, w, 18), M.rubber, x, r, z, { parent: g, rx: Math.PI / 2 });
    mesh(new THREE.CylinderGeometry(r * .55, r * .55, w + .02, 12), M.steel, 0, 0, 0, { parent: wh });
    out.push(wh);
  }
  return out;
}
export function sedan(color) {
  const g = new THREE.Group();
  const prof = new THREE.Shape();
  prof.moveTo(-2.3, 0.4); prof.lineTo(-2.3, 0.95); prof.lineTo(-1.6, 1.0); prof.lineTo(-0.95, 1.5); prof.lineTo(0.75, 1.52); prof.lineTo(1.5, 1.0); prof.lineTo(2.3, 0.92); prof.lineTo(2.3, 0.4); prof.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 1.8, bevelEnabled: true, bevelSize: .07, bevelThickness: .07, bevelSegments: 3 }), new THREE.MeshPhysicalMaterial({ color, roughness: .28, metalness: .5, clearcoat: 1, clearcoatRoughness: .08 }));
  body.position.z = -0.9; body.castShadow = SH; g.add(body);
  const glass = new THREE.Shape(); glass.moveTo(-1.5, 1.0); glass.lineTo(-0.9, 1.47); glass.lineTo(0.7, 1.49); glass.lineTo(1.42, 1.0); glass.closePath();
  const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(glass, { depth: 1.86, bevelEnabled: false }), M.paint(0x16222e, .1, .9)); gm.position.set(0, 0.03, -0.93); g.add(gm);
  box(4.4, 0.12, 1.7, M.black, 0, 0.36, 0, { parent: g, cast: false });
  for (const z of [1.02, -1.02]) box(0.22, 0.14, 0.12, M.paint(color, .32, .55), 0.95, 1.08, z, { parent: g, cast: false }); // mirrors
  for (const x of [-0.1, 1.3]) box(0.02, 0.55, 1.84, M.black, x, 0.75, 0, { parent: g, cast: false });               // door seams
  box(0.06, 0.16, 0.5, M.white, 2.33, 0.5, 0, { parent: g, cast: false }); box(0.06, 0.16, 0.5, M.white, -2.33, 0.5, 0, { parent: g, cast: false }); // plates
  g.userData.wheels = wheels(g, [1.45, -1.45], [0.95, -0.95]);
  g.userData.head = [0.62, -0.62].map(z => box(0.12, 0.22, 0.42, lampMat(0xfff1c8, 1.6), 2.3, 0.78, z, { parent: g, cast: false }));
  const tail = lampMat(0xff2a1a, 0.7); g.userData.tailMat = tail;
  [0.62, -0.62].forEach(z => box(0.1, 0.2, 0.4, tail, -2.3, 0.78, z, { parent: g, cast: false }));
  g.userData.len = 4.6; g.userData.kind = "car"; return g;
}
export function van(color) {
  const g = new THREE.Group();
  const prof = new THREE.Shape();
  prof.moveTo(-2.6, 0.4); prof.lineTo(-2.6, 2.1); prof.lineTo(1.0, 2.1); prof.lineTo(1.9, 1.3); prof.lineTo(2.6, 1.15); prof.lineTo(2.6, 0.4); prof.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 2.0, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 2 }), M.paint(color, .4, .4)); body.position.z = -1; body.castShadow = SH; g.add(body);
  box(0.9, 0.7, 2.06, M.paint(0x16222e, .1, .9), 1.45, 1.6, 0, { parent: g });
  box(0.04, 0.9, 1.8, M.paint(0x16222e, .1, .9), -2.62, 1.5, 0, { parent: g, cast: false });
  g.userData.wheels = wheels(g, [1.6, -1.6], [1.05, -1.05], 0.4, 0.28);
  g.userData.head = [0.7, -0.7].map(z => box(0.12, 0.24, 0.4, lampMat(0xfff1c8, 1.6), 2.6, 0.85, z, { parent: g, cast: false }));
  const tail = lampMat(0xff2a1a, 0.7); g.userData.tailMat = tail;
  [0.75, -0.75].forEach(z => box(0.1, 0.5, 0.25, tail, -2.6, 1.0, z, { parent: g, cast: false }));
  g.userData.len = 5.2; g.userData.kind = "van"; return g;
}
function truck() {
  const g = new THREE.Group();
  box(2.5, 2.6, 2.4, M.paint(pick(PAINTS), .45, .4), 3.6, 1.9, 0, { parent: g });
  box(2.4, 1.2, 2.2, M.paint(0x16222e, .1, .9), 3.6, 2.9, 0, { parent: g });
  box(8, 0.5, 2.4, M.steelDark, -1.5, 1.05, 0, { parent: g });
  box(6.1, 2.6, 2.44, M.container(pick(CONTAINER_COLORS)), -1.6, 2.6, 0, { parent: g });
  g.userData.wheels = wheels(g, [3.6, -0.6, -3.4], [1.1, -1.1], 0.55, 0.4);
  g.userData.head = [0.8, -0.8].map(z => box(0.1, 0.3, 0.4, lampMat(0xfff2c0, 1.6), 4.9, 1.2, z, { parent: g, cast: false }));
  const tail = lampMat(0xff2a1a, 0.7); g.userData.tailMat = tail;
  [0.9, -0.9].forEach(z => box(0.1, 0.3, 0.3, tail, -5.5, 1.3, z, { parent: g, cast: false }));
  g.userData.len = 10.5; g.userData.kind = "truck"; return g;
}

export function buildVehicles() {
  const vehicles = [];
  const specs = [["car", 0], ["truck", 0], ["car", 1], ["van", 1], ["car", 2], ["truck", 3], ["car", 3], ["van", 2]];
  specs.slice(0, quality.high ? 8 : 5).forEach(([kind, lane], i) => {
    const g = kind === "truck" ? truck() : kind === "van" ? van(pick(PAINTS)) : sedan(pick(PAINTS));
    const L = LANES[lane]; g.rotation.y = L.dir === 1 ? 0 : Math.PI; g.position.set(-90 + i * 24 + rand(-6, 6), G, L.z); scene.add(g);
    vehicles.push({ g, lane: L, x: g.position.x, v: 0, vmax: kind === "truck" ? rand(4.5, 5.5) : rand(6, 8), len: g.userData.len, kind, brake: false, honkAt: 0, hitCd: 0 });
  });
  const api = { vehicles, speed: 1 };
  const dirV = new THREE.Vector3();
  addUpdate((dt, t) => {
    const player = roamPlayer();
    for (const v of vehicles) {
      let want = v.vmax * api.speed; v.hitCd = Math.max(0, v.hitCd - dt);
      // someone in the lane ahead?
      if (player) {
        const p = player.pos; const rel = (p.x - v.x) * v.lane.dir, dz = Math.abs(p.z - v.lane.z);
        if (dz < 2.0 && rel > -v.len / 2 && rel < 18) {
          want = Math.min(want, rel < v.len / 2 + 3.5 ? 0 : v.vmax * (rel - v.len / 2 - 3.5) / 12);
          if (v.v > 2 && rel < 14 && t - v.honkAt > 6) { v.honkAt = t; carHorn(v.kind === "truck"); }
        }
        // collision: the player is inside the vehicle's footprint while it still moves
        if (v.hitCd === 0 && v.v > 1.2 && dz < (drivingNow() ? 2.2 : 1.25) && Math.abs(p.x - v.x) < v.len / 2 + (drivingNow() ? 2.4 : 0.3) && roaming()) {
          if (drivingNow()) { v.hitCd = 3; v.v = 0; shake(0.25, 250); thud(); log("drive.collision", `AI ${v.kind} stopped against the player's car`); continue; }
          const hitV = v.v; v.hitCd = 4; v.v = 0; v.x -= v.lane.dir * 0.35;
          const side = Math.sign(p.z - v.lane.z) || 1;
          knockdown(player, v.lane.dir * 0.9, side * 0.6, 3.4); shake(0.6, 550); thud();
          S.metrics.hits++; renderHud(); toast("Ouch! Look both ways before crossing.");
          log("safety.hit", `hit by a ${v.kind} on road ${v.lane.road} at ${hitV.toFixed(1)} m/s`);
        }
      }
      // keep a gap to the vehicle ahead in the same lane
      for (const o of vehicles) {
        if (o === v || o.lane !== v.lane) continue;
        let r = (o.x - v.x) * v.lane.dir; if (r < 0) r += 210; // wrapped lane
        const gap = r - (v.len + o.len) / 2;
        if (gap < 10) want = Math.min(want, Math.max(0, (gap - 2.5) * 0.9));
      }
      const acc = want < v.v ? 9 : 2.6;
      v.v += clamp(want - v.v, -acc * dt, acc * dt);
      v.brake = want < v.v - 0.15 || v.v < 0.05;
      v.x += v.v * dt * v.lane.dir;
      if (v.x > 105) v.x = -105; if (v.x < -105) v.x = 105;
      v.g.position.x = v.x;
      v.g.userData.wheels.forEach(w => w.rotation.y += v.v * dt * 2.2);
      v.g.userData.tailMat.emissiveIntensity = v.brake ? 2.6 : 0.7;
    }
  });
  return api;
}
