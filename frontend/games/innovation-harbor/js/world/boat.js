// Harbor patrol boat: board at the ferry pier (west berth), drive on the water with the same
// controls as the cars (W/S throttle, A/D rudder, joystick), chase camera, bobbing, wake and
// engine. Water is everything that is not land; the breakwater, the lighthouse rocks, the
// moored ship and the quay walls are solid — hitting them at speed is a real collision
// (alarm, shake, splash, red flash) that the story uses for the hallucinated-navigation scene.
import * as THREE from "three";
import { scene, addUpdate, quality } from "./scene.js";
import { M, T } from "./materials.js";
import { mesh, box, cyl, G } from "./harbor.js";
import { onLand, groundY, roamInput, setDriving, startRoam, stopRoam } from "./roam.js";
import { setFollow, setFreeFollow, rig, shake, fade } from "./camera.js";
import { clamp } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { toast } from "../ui/sheet.js";
import { thud, engine, horn, alarm } from "../audio.js";

const SH = quality.high;
export const BERTH = { x: 3.2, z: -17, yaw: Math.PI };            // west side of the ferry pier, bow to the sea
export const LANDING = { x: 61.5, z: -61.5, radius: 6 };           // where the boat stops at the lighthouse island
const BREAKWATER = { x: 58, z: -43, ry: -0.46, hl: 29, hw: 3.6 };   // matches harbor.js
const ISLAND = { x: 70, z: -70, r: 9 };
const SHIP = [-63, -13, -15, -2];                                    // moored container ship footprint

function hullGeometry(L, W, Hh) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -W / 2); s.lineTo(L * 0.28, -W / 2); s.quadraticCurveTo(L * 0.46, -W / 2, L / 2, 0);
  s.quadraticCurveTo(L * 0.46, W / 2, L * 0.28, W / 2); s.lineTo(-L / 2, W / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Hh, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.rotateY(-Math.PI / 2); // bow toward +z
  return g;
}
function patrolBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(hullGeometry(8.4, 2.9, 1.5), M.hullWhite); hull.position.y = -0.55; hull.castShadow = SH; g.add(hull);
  box(2.95, 0.22, 8.0, M.paint(0x1f5b8e, .5, .3), 0, 0.75, -0.3, { parent: g });                 // deck edge / rub rail
  box(2.6, 0.5, 5.6, M.hullRed, 0, 0.3, -0.5, { parent: g, cast: false });                       // red waterline stripe (seen through the wash)
  box(2.2, 1.5, 2.6, M.white, 0, 1.6, 0.4, { parent: g });                                       // wheelhouse
  box(2.0, 0.7, 2.4, M.windows(3, 1, .9, "#dff3ff"), 0, 1.95, 0.42, { parent: g, cast: false });
  box(2.4, 0.12, 2.9, M.white, 0, 2.42, 0.4, { parent: g });
  cyl(0.05, 0.06, 1.6, M.steelDark, 0.6, 3.2, -0.6, { parent: g, seg: 6 });                       // mast
  box(0.9, 0.12, 0.25, M.steel, 0.6, 3.9, -0.6, { parent: g });                                    // radar bar
  const beacon = new THREE.MeshStandardMaterial({ color: 0x112244, emissive: 0x2f7dff, emissiveIntensity: 2 });
  mesh(new THREE.SphereGeometry(0.14, 8, 6), beacon, -0.6, 2.62, 0.4, { parent: g, cast: false });
  mesh(new THREE.SphereGeometry(0.08, 6, 5), M.navRed, -1.1, 1.0, 1.6, { parent: g, cast: false });
  mesh(new THREE.SphereGeometry(0.08, 6, 5), M.navGreen, 1.1, 1.0, 1.6, { parent: g, cast: false });
  for (const dx of [-1.25, 1.25]) { for (let z = -3.4; z <= 1.6; z += 1.0) cyl(0.025, 0.025, 0.7, M.steel, dx, 1.05, z, { parent: g, seg: 5 }); box(0.04, 0.04, 5.2, M.steel, dx, 1.4, -0.9, { parent: g }); }
  cyl(0.5, 0.5, 0.25, M.black, 0, 1.3, -3.6, { parent: g, seg: 12, rx: Math.PI / 2 });            // stern fender
  // "HARBOR PATROL" on both sides
  const c = document.createElement("canvas"); c.width = 512; c.height = 96; const cx = c.getContext("2d"); cx.fillStyle = "#e6e8ea"; cx.fillRect(0, 0, 512, 96); cx.fillStyle = "#1f5b8e"; cx.font = "700 54px 'Chakra Petch', sans-serif"; cx.textAlign = "center"; cx.fillText("HARBOR PATROL", 256, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: tex }), s * 1.48, 0.95, 0.2, { parent: g, ry: s * Math.PI / 2, cast: false });
  // wake: two translucent planes trailing the stern, scaled with speed
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const wake = [-1, 1].map(s => { const w = mesh(new THREE.PlaneGeometry(1.2, 9), wakeMat, s * 1.4, -0.95, -7, { parent: g, rx: -Math.PI / 2, ry: 0, cast: false, recv: false }); w.rotation.z = s * 0.18; return w; });
  g.userData.wakeMat = wakeMat; g.userData.wake = wake; g.userData.beacon = beacon;
  return g;
}

// ── water collision ──
function hitBreakwater(x, z) {
  const dx = x - BREAKWATER.x, dz = z - BREAKWATER.z, c = Math.cos(BREAKWATER.ry), s = Math.sin(BREAKWATER.ry);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < BREAKWATER.hl && Math.abs(lz) < BREAKWATER.hw;
}
const hitIsland = (x, z) => Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r;
const hitShip = (x, z) => x > SHIP[0] && x < SHIP[1] && z > SHIP[2] && z < SHIP[3];
export function waterAt(x, z) {
  if (onLand(x, z)) return "quay";
  if (x < -110 || x > 115 || z < -135 || z > 1.2) return "edge";
  if (hitBreakwater(x, z)) return "breakwater";
  if (hitIsland(x, z)) return "rocks";
  if (hitShip(x, z)) return "ship";
  return null;
}

let boat = null;
export const boatState = () => boat;

export function buildBoat(getPlayer) {
  const g = patrolBoat(); g.position.set(BERTH.x, 0, BERTH.z); g.rotation.y = BERTH.yaw; scene.add(g);
  box(2.6, 0.08, 0.9, M.wood, 5.4, G + 0.12, BERTH.z, { cast: false }); // gangway from the pier edge
  boat = { g, yaw: BERTH.yaw, v: 0, steer: 0, aboard: null, frozen: false, crashes: 0, t: 0, trip: null, radioAnchor: new THREE.Vector3() };
  const btn = document.getElementById("ui").querySelector(".drivebtn");
  const update = (dt, t) => {
    boat.t = t;
    g.position.y = Math.sin(t * 1.4) * 0.06 + (boat.aboard ? 0 : Math.sin(t * 0.9) * 0.03);
    g.rotation.z = Math.sin(t * 1.1) * 0.015 - boat.steer * boat.v / 12 * 0.08;
    g.rotation.x = Math.sin(t * 0.8) * 0.01 - clamp(boat.v / 12, -1, 1) * 0.045;
    g.userData.beacon.emissiveIntensity = boat.aboard ? (Math.sin(t * 6) > 0 ? 3 : 0.4) : 0.8;
    g.updateMatrixWorld(true); boat.radioAnchor.set(0, 2.9, 0.4).applyMatrix4(g.matrixWorld);
    if (!boat.aboard) return;
    const inp = boat.frozen ? { ix: 0, iz: 0 } : roamInput();
    const maxV = 12, acc = inp.iz > 0 ? 3.2 : inp.iz < 0 ? -3.5 : 0;
    boat.v += acc * dt; if (!inp.iz) boat.v -= Math.sign(boat.v) * Math.min(Math.abs(boat.v), 1.6 * dt);
    boat.v = clamp(boat.v, -4, maxV);
    boat.steer += (clamp(-inp.ix, -1, 1) * 0.7 - boat.steer) * Math.min(1, dt * 4);
    if (Math.abs(boat.v) > 0.2) boat.yaw += boat.steer * clamp(Math.abs(boat.v) / 6, 0.25, 1) * 1.1 * dt * Math.sign(boat.v);
    const nx = g.position.x + Math.sin(boat.yaw) * boat.v * dt, nz = g.position.z + Math.cos(boat.yaw) * boat.v * dt;
    const bx = nx + Math.sin(boat.yaw) * 4.4 * Math.sign(boat.v || 1), bz = nz + Math.cos(boat.yaw) * 4.4 * Math.sign(boat.v || 1); // bow / stern probe
    const hit = waterAt(bx, bz) || waterAt(nx, nz);
    if (!hit) { g.position.x = nx; g.position.z = nz; }
    else if (Math.abs(boat.v) > 2.5) crash(hit);
    else boat.v = 0;
    g.rotation.y = boat.yaw;
    g.userData.wakeMat.opacity = clamp(Math.abs(boat.v) / maxV, 0, 1) * 0.55;
    g.userData.wake.forEach(w => { w.scale.y = 0.4 + Math.abs(boat.v) / maxV * 1.2; });
    const p = boat.aboard; p.pos.set(g.position.x, g.position.y + 0.9, g.position.z); p.yaw = p.targetYaw = boat.yaw;
    engine(Math.abs(boat.v) / maxV * 0.8);
    S.metrics.boatSec = (S.metrics.boatSec || 0) + dt;
  };
  const crash = (kind) => {
    const speed = boat.v; boat.v = -speed * 0.2; boat.crashes++;
    shake(0.9, 700); thud(); alarm(); flashRed();
    splash(g.position.x + Math.sin(boat.yaw) * 4.2, g.position.z + Math.cos(boat.yaw) * 4.2);
    S.metrics.bumps = (S.metrics.bumps || 0) + 1;
    log("boat.crash", `${kind} at ${g.position.x.toFixed(0)},${g.position.z.toFixed(0)} at ${speed.toFixed(1)} m/s`, { kind, speed: +speed.toFixed(1), n: boat.crashes });
    boat.trip?.onCrash?.(boat.crashes, kind);
  };
  addUpdate(update);

  const proxy = { pos: g.position, get yaw() { return boat.yaw; } };
  boat.chase = (instant = false) => { setFollow(proxy, { dist: 14, height: 5, theta: 0, instant }); rig.free = true; rig.orbit.theta = boat.yaw + Math.PI; rig.chaseProxy = proxy; };
  boat.enter = (player) => {
    if (boat.aboard) return;
    boat.aboard = player; player.root.visible = false; setDriving(true);
    boat.chase(true);
    if (btn) { btn.hidden = true; }
    log("boat.enter", "patrol boat", {});
    toast("You are at the helm. W/S throttle, A/D rudder. Watch the water ahead.");
  };
  // put the player ashore at (x, y, z); keeps the boat where it is
  boat.exit = (x, y, z) => {
    const p = boat.aboard; if (!p) return;
    boat.aboard = null; boat.v = 0; boat.steer = 0; setDriving(false); rig.chaseProxy = null;
    p.setPos(x, y, z); p.root.visible = true; p.play("idle"); engine(0);
    log("boat.exit", `ashore at ${x.toFixed(0)},${z.toFixed(0)}`, {});
  };
  boat.reset = () => { boat.aboard && boat.exit(8.2, G, BERTH.z); g.position.set(BERTH.x, 0, BERTH.z); boat.yaw = BERTH.yaw; g.rotation.y = boat.yaw; boat.v = 0; boat.steer = 0; };
  boat.teleport = (x, z, yaw) => { g.position.x = x; g.position.z = z; boat.yaw = yaw; g.rotation.y = yaw; boat.v = 0; if (boat.aboard) boat.aboard.pos.set(x, 0.9, z); };
  // Drive to a target with the objective panel + compass; "Skip walk" teleports the boat there.
  // resolves { skipped, seconds, crashes }
  boat.trip = null;
  boat.tripTo = (target, { onCrash } = {}) => new Promise(res => {
    const player = boat.aboard; const t0 = performance.now(); const c0 = boat.crashes;
    const tv = document.getElementById("travel"), list = document.getElementById("tvList"), skip = document.getElementById("tvSkip");
    list.innerHTML = `<button class="obj primary" type="button" data-id="${target.id}"><b>${target.label}</b><span>${target.place || ""}</span></button>`;
    tv.hidden = false; list.onclick = null;
    boat.trip = { onCrash }; boat.chase();
    const done = (skipped) => { boat.trip = null; tv.hidden = true; skip.onclick = null; res({ skipped, seconds: Math.round((performance.now() - t0) / 1000), crashes: boat.crashes - c0 }); };
    startRoam(player, [{ id: target.id, x: target.x, z: target.z, radius: target.radius || 6, label: target.label, place: target.place }], {
      onArrive: () => { boat.v = 0; done(false); },
    });
    skip.onclick = async () => {
      stopRoam(); log("move", `skip boat trip to ${target.id}`, { node: target.id, how: "skip" });
      await fade(true, 400); boat.teleport(target.x, target.z, Math.atan2(ISLAND.x - target.x, ISLAND.z - target.z)); await fade(false, 400);
      done(true);
    };
  });
  return boat;
}

// ── effects ──
const splashMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.85, depthWrite: false });
function splash(x, z) {
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18 + Math.random() * 0.22, 6, 5), splashMat.clone()); m.position.set(x + (Math.random() - .5) * 2, 0.2, z + (Math.random() - .5) * 2);
    m.userData.v = new THREE.Vector3((Math.random() - .5) * 4, 4 + Math.random() * 5, (Math.random() - .5) * 4); scene.add(m); parts.push(m);
  }
  let t = 0; const step = dt => { t += dt; for (const m of parts) { m.position.addScaledVector(m.userData.v, dt); m.userData.v.y -= 14 * dt; m.material.opacity = Math.max(0, 0.85 - t * 0.7); } if (t > 1.4) { parts.forEach(m => { scene.remove(m); m.geometry.dispose(); }); off(); } };
  const off = addUpdate(step);
}
function flashRed() {
  const veil = document.getElementById("fade"); const old = veil.style.background; veil.style.background = "#ff2a1a"; veil.style.transitionDuration = "80ms"; veil.style.opacity = 0.55;
  setTimeout(() => { veil.style.transitionDuration = "400ms"; veil.style.opacity = 0; setTimeout(() => { veil.style.background = old || "#000"; }, 420); }, 90);
}
