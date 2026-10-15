// Camera rig: follow (orbitable), fixed shots (over-shoulder, two-shot, establishing),
// and cinematic flights with fades.
import * as THREE from "three";
import { camera, canvas, addUpdate } from "./scene.js";
import { smoothstep, clamp } from "../util.js";

const cur = new THREE.Vector3(0, 12, -40), curLook = new THREE.Vector3(0, 2, 0);
const want = new THREE.Vector3(), wantLook = new THREE.Vector3();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
export const rig = { mode: "shot", free: false, follow: null, orbit: { theta: 0, height: 2.0, dist: 6.5 }, k: 3, flight: null, moving: false, lastDrag: 0, chaseProxy: null };

export function setFollow(actor, { dist = 6.5, height = 2.0, theta = 0 } = {}) { rig.mode = "follow"; rig.free = false; rig.follow = actor; rig.orbit.dist = dist; rig.orbit.height = height; rig.orbit.theta = theta; rig.k = 3.2; }
// Free roam: the orbit angle is absolute (world space), so turning the player doesn't swing the camera.
export function setFreeFollow(actor, { dist = 7, height = 2.6 } = {}) {
  setFollow(actor, { dist, height, theta: actor.yaw + Math.PI }); rig.free = true; rig.k = 4;
}
export function shot(pos, look, { instant = false, k = 2.4 } = {}) {
  rig.mode = "shot"; rig.flight = null; want.set(...pos); wantLook.set(...look); rig.k = k;
  if (instant) { cur.copy(want); curLook.copy(wantLook); }
}
export function overShoulder(listener, speaker, { side = 1 } = {}) {
  const lh = listener.headWorld(tmp).clone(), sh = speaker.headWorld(tmp2).clone();
  const dir = sh.clone().sub(lh); dir.y = 0; const d = dir.length() || 1; dir.normalize();
  const right = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(side);
  const pos = lh.clone().sub(dir.clone().multiplyScalar(1.6)).add(right.multiplyScalar(0.9)); pos.y = lh.y + 0.35;
  const look = sh.clone().lerp(lh, 0.15); look.y = sh.y - 0.1;
  shot(pos.toArray(), look.toArray(), { k: 2.6 });
}
export function twoShot(a, b) {
  const ah = a.headWorld(tmp).clone(), bh = b.headWorld(tmp2).clone();
  const mid = ah.clone().add(bh).multiplyScalar(0.5); const dir = bh.clone().sub(ah); dir.y = 0; const len = dir.length() || 1; dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const pos = mid.clone().add(side.multiplyScalar(len * 1.3 + 2.4)); pos.y = mid.y + 0.4;
  shot(pos.toArray(), [mid.x, mid.y - 0.2, mid.z], { k: 2.4 });
}
export function frontShot(actor, { dist = 3.2, height = 0.3, side = 0.6 } = {}) {
  const h = actor.headWorld(tmp).clone(); const f = new THREE.Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
  const right = new THREE.Vector3(f.z, 0, -f.x);
  const pos = h.clone().add(f.multiplyScalar(dist)).add(right.multiplyScalar(side)); pos.y = h.y + height;
  shot(pos.toArray(), [h.x, h.y - 0.25, h.z], { k: 2.6 });
}
// keys: [{pos, look, t}] flown in sequence from the current camera pose.
export function fly(keys) {
  return new Promise(res => { rig.mode = "fly"; rig.flight = { keys, i: 0, t: 0, from: cur.clone(), fromLook: curLook.clone(), res }; });
}
export function cancelFlight() { if (rig.flight) { const r = rig.flight.res; rig.flight = null; r(); } }
export function fade(toBlack, ms = 600) {
  const el = document.getElementById("fade"); el.style.transitionDuration = ms + "ms"; el.style.opacity = toBlack ? 1 : 0; el.style.pointerEvents = toBlack ? "auto" : "none";
  return new Promise(r => setTimeout(r, ms));
}
export const camPos = () => cur;
// Brief camera shake (collisions, impacts): decaying random offset added after the smoothing step.
let shakeAmt = 0, shakeT = 0;
export function shake(amount = 0.35, ms = 450) { shakeAmt = amount; shakeT = ms / 1000; }

// ── pointer orbit on canvas (follow mode) ──
const pointers = new Map(); let pinch0 = 0;
canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
canvas.addEventListener("pointermove", e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  if (pointers.size === 1 && rig.mode === "follow") { rig.orbit.theta -= (e.clientX - p.x) * 0.006; rig.orbit.height = clamp(rig.orbit.height + (e.clientY - p.y) * 0.02, 0.6, 9); rig.lastDrag = performance.now() / 1000; }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) rig.orbit.dist = clamp(rig.orbit.dist * pinch0 / d, 2.5, 18); pinch0 = d; }
});
const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", e => { e.preventDefault(); rig.orbit.dist = clamp(rig.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08), 2.5, 18); }, { passive: false });

addUpdate(dt => {
  if (rig.mode === "follow" && rig.follow) {
    const a = rig.follow;
    // third-person chase: while moving (and not dragging), the camera eases in behind the character
    if (rig.free && rig.moving && performance.now() / 1000 - rig.lastDrag > 1.2) {
      const want = a.yaw + Math.PI; let d = want - rig.orbit.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
      rig.orbit.theta += d * Math.min(1, dt * (rig.chaseProxy ? 3.2 : 2.2));
    }
    const ang = rig.free ? rig.orbit.theta : a.yaw + Math.PI + rig.orbit.theta;
    want.set(a.pos.x + Math.sin(ang) * rig.orbit.dist, a.pos.y + rig.orbit.height, a.pos.z + Math.cos(ang) * rig.orbit.dist);
    if (rig.free) wantLook.set(a.pos.x, a.pos.y + 1.5, a.pos.z);
    else wantLook.set(a.pos.x + Math.sin(a.yaw) * 1.2, a.pos.y + 1.45, a.pos.z + Math.cos(a.yaw) * 1.2);
  }
  if (rig.mode === "fly" && rig.flight) {
    const f = rig.flight; const key = f.keys[f.i]; f.t += dt; const k = smoothstep(Math.min(1, f.t / key.t));
    cur.lerpVectors(f.from, tmp.set(...key.pos), k); curLook.lerpVectors(f.fromLook, tmp2.set(...key.look), k);
    if (f.t >= key.t) { f.i++; f.t = 0; f.from.copy(cur); f.fromLook.copy(curLook); if (f.i >= f.keys.length) { const r = f.res; rig.flight = null; rig.mode = "shot"; want.copy(cur); wantLook.copy(curLook); r(); } }
  } else {
    const s = 1 - Math.exp(-rig.k * dt);
    cur.lerp(want, s); curLook.lerp(wantLook, s);
  }
  camera.position.copy(cur); camera.lookAt(curLook);
  if (shakeT > 0) { shakeT -= dt; const a = shakeAmt * Math.max(0, shakeT) * 2; camera.position.x += (Math.random() - .5) * a; camera.position.y += (Math.random() - .5) * a; }
});
