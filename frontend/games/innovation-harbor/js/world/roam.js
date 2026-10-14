// Free roaming: WASD / arrow keys / on-screen joystick, camera-relative, with a simple walkable map.
import * as THREE from "three";
import { scene, addUpdate } from "./scene.js";
import { setFreeFollow, rig } from "./camera.js";
import { G } from "./harbor.js";
import { clamp } from "../util.js";

// Axis-aligned blockers [x0, x1, z0, z1] (buildings, container stacks, council platform, filler blocks).
const BLOCKS = [
  [-46.5, -29.5, 26.4, 41.5],   // AI Lab tower + screen
  [-15.5, 7.5, 52.6, 67.5],     // Harbor Archive
  [13, 39, 52, 74.5],           // Port Council platform + hall
  [49.5, 74.5, 22.5, 41.5],     // Innovation Workshop
  [-61.8, -14.6, 7.4, 13.8],    // container quay
  [-89, -63, 64, 106],          // filler blocks west
  [65, 87, 51, 101],            // filler blocks east
];
const inBox = (x, z, b) => x > b[0] && x < b[1] && z > b[2] && z < b[3];
const onLand = (x, z) => (x > -92 && x < 92 && z > 1.6 && z < 114) || (x > 6.7 && x < 13.3 && z > -22.6 && z <= 1.6);
export const walkable = (x, z) => onLand(x, z) && !BLOCKS.some(b => inBox(x, z, b));

export function groundY(x, z) {
  if (x > 18 && x < 36 && z > 2 && z < 8) return 0.9;                       // theater stage
  if (x > 15 && x < 39 && z >= 8.5 && z < 15.7) return G + 0.5 * (clamp(Math.floor((z - 8.5) / 1.8), 0, 3) + 1); // tiers
  return G;
}

// ── input ──
const keys = new Set();
const typing = e => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "") || e.target?.isContentEditable;
addEventListener("keydown", e => { if (typing(e)) return; const k = e.key.toLowerCase(); keys.add(k); if (active && /^arrow/.test(k)) e.preventDefault(); });
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const stick = { x: 0, y: 0 };

function buildJoystick() {
  const pad = document.createElement("div"); pad.className = "joy"; pad.hidden = true;
  pad.innerHTML = `<i></i>`; document.getElementById("ui").appendChild(pad);
  const knob = pad.firstChild; let id = null, cx = 0, cy = 0; const R = 46;
  pad.addEventListener("pointerdown", e => { id = e.pointerId; pad.setPointerCapture(id); const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); });
  const move = e => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } stick.x = dx / R; stick.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; };
  const end = e => { if (e.pointerId !== id) return; id = null; stick.x = stick.y = 0; knob.style.transform = ""; };
  pad.addEventListener("pointermove", move); pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
  return pad;
}
const touchUI = matchMedia("(pointer: coarse)").matches;
let joy = null;

// ── target beacon ──
const beacon = new THREE.Group(); beacon.visible = false; scene.add(beacon);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xfd6925, transparent: true, opacity: 0.85, depthWrite: false });
const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; beacon.add(ring);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfd6925, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
beam.position.y = 4.5; beacon.add(beam);

// ── loop ──
let active = null; // { player, target: Vector3, radius, onArrive, onDistance }
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
addUpdate((dt, t) => {
  if (!beacon.visible) return;
  const s = 1 + Math.sin(t * 3) * 0.08; ring.scale.set(s, s, 1); ringMat.opacity = 0.6 + Math.sin(t * 3) * 0.25;
  if (!active) return;
  const { player } = active;
  let ix = 0, iz = 0;
  if (keys.has("w") || keys.has("arrowup")) iz += 1;
  if (keys.has("s") || keys.has("arrowdown")) iz -= 1;
  if (keys.has("d") || keys.has("arrowright")) ix += 1;
  if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
  if (stick.x || stick.y) { ix = stick.x; iz = -stick.y; }
  const mag = Math.min(1, Math.hypot(ix, iz));
  const run = keys.has("shift") || mag > 0.92 && (stick.x || stick.y);
  if (mag > 0.08) {
    const ang = rig.orbit.theta; // camera sits at player + (sin ang, cos ang) * dist
    fwd.set(-Math.sin(ang), 0, -Math.cos(ang)); right.set(-fwd.z, 0, fwd.x);
    const dir = fwd.multiplyScalar(iz).addScaledVector(right, ix).normalize();
    const speed = (run ? 5.4 : 3.0) * mag, p = player.pos;
    const nx = p.x + dir.x * speed * dt, nz = p.z + dir.z * speed * dt;
    if (walkable(nx, nz)) { p.x = nx; p.z = nz; }
    else if (walkable(nx, p.z)) p.x = nx;
    else if (walkable(p.x, nz)) p.z = nz;
    p.y += (groundY(p.x, p.z) - p.y) * Math.min(1, dt * 12);
    player.targetYaw = Math.atan2(dir.x, dir.z);
    const kind = run ? "jog" : "walk";
    if (player.kind !== kind) { player.speedFactor = run ? 1 : 1.25; player.play(kind, { fade: 0.2 }); }
  } else if (player.kind === "walk" || player.kind === "jog") player.play("idle", { fade: 0.25 });
  const d = Math.hypot(player.pos.x - active.target.x, player.pos.z - active.target.z);
  active.onDistance?.(d);
  if (d < active.radius) { const a = active; stopRoam(); a.onArrive(); }
});

export function startRoam(player, target, { radius = 2.6, onArrive, onDistance } = {}) {
  player.stopWalk();
  active = { player, target: new THREE.Vector3(target[0], 0, target[1]), radius, onArrive, onDistance };
  beacon.position.set(target[0], groundY(target[0], target[1]), target[1]); beacon.visible = true;
  setFreeFollow(player);
  if (touchUI) { joy ||= buildJoystick(); joy.hidden = false; }
}
export function stopRoam() {
  if (!active) return;
  const { player } = active; active = null; beacon.visible = false; stick.x = stick.y = 0;
  if (joy) joy.hidden = true;
  if (player.kind === "walk" || player.kind === "jog") player.play("idle");
  player.speedFactor = 1;
}
export const roaming = () => !!active;
