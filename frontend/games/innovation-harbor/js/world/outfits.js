// Accessories for characters, built from primitives and parented to the avatar's bones so
// they follow the animation: hard hats, caps, glasses, hi-vis vests, ID lanyards, backpacks.
// Every avatar shares the same four Ready Player Me bodies, so these are what make a crowd
// look like different people. Replace with real GLB accessories later by swapping the
// builders below (keep the bone names and offsets).
import * as THREE from "three";
import { quality } from "./scene.js";
import { T } from "./materials.js";
import { pick } from "../util.js";

const SH = quality.high;
const std = o => new THREE.MeshStandardMaterial(o);
const mat = {
  hat: { yellow: std({ color: 0xf2c531, roughness: .45 }), white: std({ color: 0xf2f0ea, roughness: .45 }), orange: std({ color: 0xf26b1d, roughness: .45 }), blue: std({ color: 0x2f6fbf, roughness: .45 }) },
  cap: [std({ color: 0x1e2a36, roughness: .8 }), std({ color: 0x8a2f24, roughness: .8 }), std({ color: 0x2f5f33, roughness: .8 }), std({ color: 0xd8d2c4, roughness: .8 }), std({ color: 0x3a5f9a, roughness: .8 })],
  frame: std({ color: 0x1a1a1f, roughness: .4, metalness: .5 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x6fa8d8, roughness: .1, metalness: .6, transparent: true, opacity: .45 }),
  vest: std({ map: T.stripes("#f26b1d", "#f26b1d"), color: 0xf26b1d, roughness: .8 }),
  vestStripe: std({ color: 0xe6e6e6, roughness: .5, emissive: 0x444444 }),
  lanyard: std({ color: 0x1fc1d6, roughness: .9 }), card: std({ color: 0xf6f4ee, roughness: .6 }),
  pack: [std({ color: 0x2b2f36, roughness: .9 }), std({ color: 0x7a2a2a, roughness: .9 }), std({ color: 0x2a4a7a, roughness: .9 })],
};
const bone = (actor, re) => { let b = null; actor.inner.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
const add = (parent, geo, m, [x, y, z], rot = [0, 0, 0]) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(...rot); o.castShadow = SH; o.frustumCulled = false; parent.add(o); return o; };
// bone scale compensation: accessories are modelled in metres, bones may carry the avatar's unit scale
const unscale = b => { const s = new THREE.Vector3(); b.getWorldScale(s); return 1 / (s.x || 1); };
// Bone local axes (measured on the RPM rigs): +z = character's front, +x = right, +y = up.
// The spine bones sit at the BACK of the torso, so chest items need ~0.1–0.15 m of +z offset.

export function hardHat(actor, color = "yellow") {
  const h = actor.head || bone(actor, /Head$/); if (!h) return;
  const g = new THREE.Group(); g.scale.setScalar(unscale(h)); g.position.set(0, 0.075, 0.01); h.add(g);
  const m = mat.hat[color] || mat.hat.yellow;
  add(g, new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, [0, 0.03, 0]);
  add(g, new THREE.CylinderGeometry(0.145, 0.15, 0.02, 20), m, [0, 0.03, 0]);
  add(g, new THREE.BoxGeometry(0.02, 0.012, 0.2), m, [0, 0.14, 0]);
  return g;
}
export function cap(actor, m = pick(mat.cap)) {
  const h = actor.head || bone(actor, /Head$/); if (!h) return;
  const g = new THREE.Group(); g.scale.setScalar(unscale(h)); g.position.set(0, 0.07, 0.0); h.add(g);
  add(g, new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, [0, 0.02, 0]);
  add(g, new THREE.CylinderGeometry(0.1, 0.12, 0.08, 18, 1, true), m, [0, 0.0, 0]).material.side = THREE.DoubleSide;
  add(g, new THREE.BoxGeometry(0.16, 0.01, 0.1), m, [0, 0.0, 0.14], [-0.12, 0, 0]); // visor (forward = +z)
  return g;
}
export function glasses(actor) {
  const h = actor.head || bone(actor, /Head$/); if (!h) return;
  const g = new THREE.Group(); g.scale.setScalar(unscale(h)); g.position.set(0, 0.07, 0.1); h.add(g); // eye level is ~7 cm above the head bone origin
  for (const dx of [-0.034, 0.034]) { add(g, new THREE.TorusGeometry(0.024, 0.003, 6, 16), mat.frame, [dx, 0, 0]); add(g, new THREE.CircleGeometry(0.022, 16), mat.lens, [dx, 0, 0]).castShadow = false; }
  add(g, new THREE.BoxGeometry(0.02, 0.004, 0.004), mat.frame, [0, 0.004, 0]);
  for (const dx of [-0.06, 0.06]) add(g, new THREE.BoxGeometry(0.004, 0.004, 0.11), mat.frame, [dx, 0.004, -0.055]); // temples run back
  return g;
}
export function vest(actor) {
  // hi-vis vest as thin front/back panels bridged over the shoulders and under the arms,
  // so it hugs the torso instead of reading as a box
  const s = bone(actor, /Spine2$/) || bone(actor, /Spine1$/) || bone(actor, /Spine$/); if (!s) return;
  const g = new THREE.Group(); g.scale.setScalar(unscale(s)); g.position.set(0, -0.05, 0.02); s.add(g);
  const front = 0.13, back = -0.1;
  for (const z of [front, back]) {
    add(g, new THREE.BoxGeometry(0.34, 0.36, 0.035), mat.vest, [0, 0, z]);
    for (const y of [-0.08, 0.04]) add(g, new THREE.BoxGeometry(0.345, 0.04, 0.04), mat.vestStripe, [0, y, z]);
  }
  for (const dx of [-0.11, 0.11]) add(g, new THREE.BoxGeometry(0.07, 0.035, front - back + 0.03), mat.vest, [dx, 0.19, (front + back) / 2]);   // over the shoulders
  for (const dx of [-0.18, 0.18]) add(g, new THREE.BoxGeometry(0.03, 0.14, front - back), mat.vest, [dx, -0.1, (front + back) / 2]);        // under the arms
  return g;
}
export function lanyard(actor) {
  const s = bone(actor, /Spine2$/) || bone(actor, /Spine1$/); if (!s) return;
  const g = new THREE.Group(); g.scale.setScalar(unscale(s)); g.position.set(0, -0.04, 0.17); s.add(g);
  for (const dx of [-0.03, 0.03]) add(g, new THREE.BoxGeometry(0.012, 0.22, 0.004), mat.lanyard, [dx * 1.5, 0.12, 0], [0, 0, dx * 4]);
  add(g, new THREE.BoxGeometry(0.07, 0.1, 0.006), mat.card, [0, -0.02, 0]);
  add(g, new THREE.BoxGeometry(0.05, 0.012, 0.007), mat.lanyard, [0, 0.0, 0.001]);
  return g;
}
export function backpack(actor, m = pick(mat.pack)) {
  const s = bone(actor, /Spine2$/) || bone(actor, /Spine1$/); if (!s) return;
  const g = new THREE.Group(); g.scale.setScalar(unscale(s)); g.position.set(0, 0.0, -0.15); s.add(g); // behind the back (-z)
  add(g, new THREE.BoxGeometry(0.3, 0.38, 0.14), m, [0, -0.02, 0]);
  add(g, new THREE.BoxGeometry(0.26, 0.16, 0.05), m, [0, -0.1, 0.09]);
  for (const dx of [-0.08, 0.08]) add(g, new THREE.BoxGeometry(0.04, 0.3, 0.02), m, [dx, 0.04, 0.17]); // straps over the shoulders toward the front
  return g;
}

// one random look for a background character (crowd / audience); seeded by index so it is stable
export function dressRandom(actor, i) {
  const r = (i * 9301 + 49297) % 233280 / 233280;
  if (r < 0.28) cap(actor);
  else if (r < 0.4) glasses(actor);
  else if (r < 0.52) backpack(actor);
  else if (r < 0.6) { cap(actor); backpack(actor); }
  else if (r < 0.66) hardHat(actor, pick(["white", "blue", "yellow"]));
}
