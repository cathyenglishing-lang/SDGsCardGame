// Free roaming: WASD / arrow keys / on-screen joystick, Space to jump, third-person chase camera,
// a simple walkable map with building blockers, one tall glowing beacon per available NPC,
// an on-screen compass to the chosen objective, and knock-back when a vehicle hits the player.
import * as THREE from "three";
import { scene, addUpdate, camera } from "./scene.js";
import { setFreeFollow, rig } from "./camera.js";
import { G } from "./harbor.js";
import { clamp, esc } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";

// Axis-aligned blockers [x0, x1, z0, z1] (buildings, container stacks, council platform, filler blocks).
export const BLOCKS = [
  [-46.5, -29.5, 26.4, 41.5],   // AI Lab tower + screen
  [-15.5, 7.5, 52.6, 67.5],     // Harbor Archive
  [13, 39, 52, 74.5],           // Port Council platform + hall
  [49.5, 74.5, 22.5, 41.5],     // Innovation Workshop
  [-61.8, -14.6, 7.4, 13.8],    // container quay
  [-89, -63, 64, 106],          // filler blocks west
  [65, 87, 51, 101],            // filler blocks east
];
export const addBlock = b => { BLOCKS.push(b); };
const inBox = (x, z, b) => x > b[0] && x < b[1] && z > b[2] && z < b[3];
const onLand = (x, z) => (x > -92 && x < 92 && z > 1.6 && z < 114) || (x > 6.7 && x < 13.3 && z > -22.6 && z <= 1.6);
export const walkable = (x, z) => onLand(x, z) && !BLOCKS.some(b => inBox(x, z, b));

export function groundY(x, z) {
  if (x > 18 && x < 36 && z > 2 && z < 8) return 0.9;                       // theater stage
  if (x > 15 && x < 39 && z >= 8.5 && z < 15.7) return G + 0.5 * (clamp(Math.floor((z - 8.5) / 1.8), 0, 3) + 1); // tiers
  if (x > 14 && x < 38 && z >= 49 && z < 52) return G + 0.4 * (clamp(Math.floor(z - 49), 0, 2) + 1); // council steps
  if (x > 14 && x < 38 && z >= 52 && z < 60) return 1.8;                     // council platform
  return G;
}

// ── input ──
const keys = new Set();
const typing = e => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "") || e.target?.isContentEditable;
addEventListener("keydown", e => { if (typing(e)) return; const k = e.key.toLowerCase(); keys.add(k); if (active && (/^arrow/.test(k) || k === " ")) e.preventDefault(); });
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const stick = { x: 0, y: 0 };
let joyId = null, joyKnob = null, jumpWanted = false;
function releaseStick() { joyId = null; stick.x = stick.y = 0; if (joyKnob) joyKnob.style.transform = ""; }
// Current movement intent (also used by the driving controller).
export function roamInput() {
  let ix = 0, iz = 0;
  if (keys.has("w") || keys.has("arrowup")) iz += 1;
  if (keys.has("s") || keys.has("arrowdown")) iz -= 1;
  if (keys.has("d") || keys.has("arrowright")) ix += 1;
  if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
  if (stick.x || stick.y) { ix = stick.x; iz = -stick.y; }
  const mag = Math.min(1, Math.hypot(ix, iz));
  return { ix, iz, mag, run: keys.has("shift") || (mag > 0.92 && !!(stick.x || stick.y)) };
}

function buildJoystick() {
  const pad = document.createElement("div"); pad.className = "joy"; pad.hidden = true;
  pad.innerHTML = `<i></i>`; document.getElementById("ui").appendChild(pad);
  joyKnob = pad.firstChild; let cx = 0, cy = 0; const R = 46;
  pad.addEventListener("pointerdown", e => { e.preventDefault(); joyId = e.pointerId; pad.setPointerCapture(joyId); const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); });
  const move = e => { if (e.pointerId !== joyId) return; let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } stick.x = dx / R; stick.y = dy / R; joyKnob.style.transform = `translate(${dx}px,${dy}px)`; };
  const end = e => { if (e.pointerId === joyId) releaseStick(); };
  pad.addEventListener("pointermove", move); pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end); pad.addEventListener("lostpointercapture", end);
  const jb = document.createElement("button"); jb.className = "jumpbtn"; jb.type = "button"; jb.textContent = "Jump"; jb.hidden = true;
  jb.addEventListener("pointerdown", e => { e.preventDefault(); jumpWanted = true; });
  document.getElementById("ui").appendChild(jb);
  pad._jump = jb;
  return pad;
}
let joy = null;

// ── beacons: a tall light column + floating arrow per available target; the chosen one is orange ──
const beacons = [];
function makeBeacon() {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xfd6925, transparent: true, opacity: 0.85, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.0, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfd6925, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 60, 20, 1, true), beamMat); beam.position.y = 30; g.add(beam);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfd6925 });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 10), arrowMat); arrow.rotation.x = Math.PI; arrow.position.y = 3.6; g.add(arrow);
  return { g, ring, ringMat, beam, beamMat, arrow, arrowMat };
}

// ── physics (jump / knock-back) ──
const phys = { vy: 0, air: false, knock: null };
export function knockdown(player, dirX, dirZ, strength = 3) {
  phys.knock = { t: 0, dur: 0.55, dx: dirX * strength, dz: dirZ * strength };
  player.playFor("fall", 1.6);
}
export const isAirborne = () => phys.air;
let drivingFlag = false;
export const setDriving = v => { drivingFlag = v; };
export const drivingNow = () => drivingFlag;

// ── compass (HUD) ──
const fwd = new THREE.Vector3(), rightV = new THREE.Vector3();
function updateCompass(player, tg) {
  const el = document.getElementById("compass"); if (!el) return;
  if (!tg) { el.hidden = true; return; }
  el.hidden = false;
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); rightV.set(-fwd.z, 0, fwd.x);
  const dx = tg.x - player.pos.x, dz = tg.z - player.pos.z;
  const a = Math.atan2(dx * rightV.x + dz * rightV.z, dx * fwd.x + dz * fwd.z);
  el.querySelector("i").style.transform = `rotate(${a}rad)`;
  el.querySelector("b").textContent = tg.label; el.querySelector("span").textContent = `${tg.place || ""} · ${Math.round(tg.d)} m`;
}

// ── loop ──
let active = null; // { player, targets: [{id,x,z,radius,label,place,primary}], onArrive, onDistance }
const mv = new THREE.Vector3(), rv = new THREE.Vector3();
let walkClock = 0;
addUpdate((dt, t) => {
  for (const [i, b] of beacons.entries()) {
    if (!b.g.visible) continue;
    const prim = active?.targets[i]?.primary; const col = prim ? 0xfd6925 : 0xffc54d;
    const s = 1 + Math.sin(t * 3 + i) * 0.08; b.ring.scale.set(s, s, 1); b.ringMat.opacity = (prim ? 0.8 : 0.45) + Math.sin(t * 3 + i) * 0.2;
    b.ringMat.color.set(col); b.beamMat.color.set(col); b.arrowMat.color.set(col); b.beamMat.opacity = prim ? 0.26 : 0.1;
    b.arrow.position.y = 3.6 + Math.sin(t * 2.5 + i) * 0.35; b.arrow.rotation.y = t * 1.5;
  }
  if (!active) { rig.moving = false; return; }
  const { player } = active; const p = player.pos;
  if (drivingFlag) {
    // the driving controller moves the player; only distances and arrival are tracked here
    rig.moving = true;
    const ds = active.targets.map(tg => ({ ...tg, d: Math.hypot(p.x - tg.x, p.z - tg.z) })); active.onDistance?.(ds); updateCompass(player, ds.find(x => x.primary));
    const here = ds.find(tg => tg.d < tg.radius + 2.5); if (here) { const a = active; stopRoam(); a.onArrive(here); }
    return;
  }
  if (phys.knock) {
    const k = phys.knock; k.t += dt; const f = Math.max(0, 1 - k.t / k.dur) * dt / k.dur * 2;
    const nx = p.x + k.dx * f, nz = p.z + k.dz * f; if (walkable(nx, nz)) { p.x = nx; p.z = nz; }
    if (k.t >= k.dur) phys.knock = null;
    return;
  }
  if (player.held) return; // still getting up
  const inp = roamInput(); const { ix, iz, mag, run } = inp;
  const ground = groundY(p.x, p.z);
  if ((keys.has(" ") || jumpWanted) && !phys.air && p.y <= ground + 0.05) {
    phys.vy = 5.6; phys.air = true; S.metrics.jumps++;
    player.play("jump", { fade: 0.08, once: true, variant: run ? 1 : 0, onDone: () => { if (phys.air) player.play("idle", { fade: 0.2 }); } });
  }
  jumpWanted = false;
  rig.moving = mag > 0.08;
  if (mag > 0.08) {
    const ang = rig.orbit.theta; // camera sits at player + (sin ang, cos ang) * dist
    mv.set(-Math.sin(ang), 0, -Math.cos(ang)); rv.set(-mv.z, 0, mv.x);
    const dir = mv.multiplyScalar(iz).addScaledVector(rv, ix).normalize();
    const speed = (run ? 5.4 : 3.0) * mag * (phys.air ? 0.9 : 1);
    const nx = p.x + dir.x * speed * dt, nz = p.z + dir.z * speed * dt;
    if (walkable(nx, nz) || !walkable(p.x, p.z)) { p.x = nx; p.z = nz; }
    else if (walkable(nx, p.z)) p.x = nx;
    else if (walkable(p.x, nz)) p.z = nz;
    player.targetYaw = Math.atan2(dir.x, dir.z);
    walkClock += dt;
    if (!phys.air) { const kind = run ? "jog" : "walk"; if (player.kind !== kind) { player.speedFactor = run ? 1 : 1.25; player.play(kind, { fade: 0.2 }); } }
  } else if (!phys.air && (player.kind === "walk" || player.kind === "jog")) player.play("idle", { fade: 0.25 });
  if (phys.air) {
    p.y += phys.vy * dt; phys.vy -= 14 * dt;
    const g2 = groundY(p.x, p.z);
    if (p.y <= g2 && phys.vy < 0) { p.y = g2; phys.air = false; phys.vy = 0; player.play(mag > 0.08 ? (run ? "jog" : "walk") : "idle", { fade: 0.15 }); }
  } else p.y += (ground - p.y) * Math.min(1, dt * 12);
  const ds = active.targets.map(tg => ({ ...tg, d: Math.hypot(p.x - tg.x, p.z - tg.z) }));
  active.onDistance?.(ds); updateCompass(player, ds.find(x => x.primary));
  const here = ds.find(tg => tg.d < tg.radius);
  if (here && !phys.air) { const a = active; S.metrics.walkSec += Math.round(walkClock); walkClock = 0; stopRoam(); a.onArrive(here); }
});

// targets: [{ id, x, z, radius?, label?, place?, primary? }] or a single [x, z]
export function startRoam(player, targets, { onArrive, onDistance } = {}) {
  player.stopWalk(); releaseStick();
  const list = Array.isArray(targets[0]) || typeof targets[0] === "number"
    ? [{ id: "target", x: targets[0], z: targets[1], radius: 2.6, primary: true, label: "Next stop" }]
    : targets.map((t, i) => ({ radius: 2.6, primary: i === 0, ...t }));
  active = { player, targets: list, onArrive, onDistance };
  while (beacons.length < list.length) beacons.push(makeBeacon());
  beacons.forEach((b, i) => { const t = list[i]; if (t) { b.g.position.set(t.x, groundY(t.x, t.z), t.z); b.g.visible = true; } else b.g.visible = false; });
  if (!drivingFlag) setFreeFollow(player);
  joy ||= buildJoystick(); joy.hidden = false; joy._jump.hidden = drivingFlag;
}
export function setPrimary(id) { if (!active) return; active.targets.forEach(t => t.primary = t.id === id); }
export function stopRoam() {
  if (!active) return;
  const { player } = active; active = null; beacons.forEach(b => b.g.visible = false); releaseStick();
  if (joy) { joy.hidden = true; joy._jump.hidden = true; }
  const c = document.getElementById("compass"); if (c) c.hidden = true;
  rig.moving = false;
  if (!drivingFlag && (player.kind === "walk" || player.kind === "jog")) player.play("idle");
  player.speedFactor = 1; phys.air = false; phys.vy = 0;
}
export const roaming = () => !!active;
export const roamPlayer = () => active?.player || null;
