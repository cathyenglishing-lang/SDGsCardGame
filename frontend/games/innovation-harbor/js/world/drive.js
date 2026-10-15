// Drivable cars: walk up to a parked car, press E (or tap Drive) to get in, drive with
// WASD / arrows / joystick in a third-person chase view, press E again to get out.
// The car respects the same walkable map as the player (buildings, water, locked bridges).
import * as THREE from "three";
import { scene, addUpdate } from "./scene.js";
import { sedan, van } from "./vehicles.js";
import { walkable, groundY, roaming, setDriving, roamInput } from "./roam.js";
import { setFreeFollow, setFollow, rig, shake } from "./camera.js";
import { G } from "./harbor.js";
import { clamp } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { toast } from "../ui/sheet.js";
import { thud, engine } from "../audio.js";

const cars = [];
let driving = null;   // { car, player }
export const isDriving = () => !!driving;
export const drivingPos = () => driving ? driving.car.g.position : null;

export function buildDrivable(getPlayer) {
  const specs = [{ x: 14, z: 22.7, yaw: Math.PI / 2, mk: () => sedan(0x1e6fd0), name: "the blue sedan" }, { x: 44, z: 46.8, yaw: Math.PI / 2, mk: () => van(0xe8e8ea), name: "the white van" }, { x: -40, z: 22.7, yaw: -Math.PI / 2, mk: () => sedan(0xb8402f), name: "the red sedan" }];
  for (const s of specs) {
    const g = s.mk(); g.position.set(s.x, G, s.z); g.rotation.y = s.yaw; scene.add(g);
    cars.push({ g, name: s.name, yaw: s.yaw, v: 0, steer: 0, home: [s.x, s.z] });
  }
  const btn = document.createElement("button"); btn.className = "btn drivebtn"; btn.type = "button"; btn.hidden = true; btn.textContent = "E · Drive"; document.getElementById("ui").appendChild(btn);
  let near = null;
  const enter = () => {
    const player = getPlayer(); if (!near || !player || driving) return;
    driving = { car: near, player, t: 0 }; player.root.visible = false; setDriving(true);
    const proxy = { pos: near.g.position, get yaw() { return near.yaw; } };
    setFollow(proxy, { dist: 9.5, height: 3.4, theta: 0 }); rig.free = true; rig.orbit.theta = near.yaw + Math.PI; rig.chaseProxy = proxy;
    btn.textContent = "E · Get out"; log("drive.enter", near.name, { car: near.name }); toast(`You are driving ${near.name}. W/S speed, A/D steer, E to get out.`);
  };
  const exit = (silent) => {
    if (!driving) return;
    const { car, player } = driving; driving = null; setDriving(false);
    const sx = car.g.position.x - Math.cos(car.yaw) * 2.2, sz = car.g.position.z + Math.sin(car.yaw) * 2.2;
    player.setPos(walkable(sx, sz) ? sx : car.g.position.x, groundY(sx, sz), walkable(sx, sz) ? sz : car.g.position.z + 2.4);
    player.root.visible = true; player.face(car.g.position.x, car.g.position.z, true); player.play("idle");
    rig.chaseProxy = null; if (roaming()) setFreeFollow(player);
    car.v = 0; btn.textContent = "E · Drive"; log("drive.exit", `${car.name} at ${car.g.position.x.toFixed(0)},${car.g.position.z.toFixed(0)}`);
    if (!silent) toast("You got out of the car.");
  };
  btn.onclick = () => driving ? (Math.abs(driving.car.v) < 1.5 ? exit() : toast("Slow down before getting out.")) : enter();
  addEventListener("keydown", e => { if (e.key.toLowerCase() === "e" && !/INPUT|TEXTAREA/.test(e.target?.tagName || "")) btn.onclick(); });

  addUpdate((dt, t) => {
    const player = getPlayer();
    if (!driving) {
      near = null;
      if (player && roaming()) { for (const c of cars) { if (Math.hypot(player.pos.x - c.g.position.x, player.pos.z - c.g.position.z) < 3.2) { near = c; break; } } }
      btn.hidden = !near; return;
    }
    const { car } = driving; const inp = roamInput();
    const maxV = 15, acc = inp.iz > 0 ? 7 : inp.iz < 0 ? -9 : 0;
    car.v += acc * dt; if (!inp.iz) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), 6 * dt);
    car.v = clamp(car.v, -5, maxV);
    car.steer += (clamp(-inp.ix, -1, 1) * 0.55 - car.steer) * Math.min(1, dt * 8);
    if (Math.abs(car.v) > 0.3) car.yaw += car.steer * (car.v / maxV) * 2.4 * dt * (car.v > 0 ? 1 : -1);
    const nx = car.g.position.x + Math.sin(car.yaw) * car.v * dt, nz = car.g.position.z + Math.cos(car.yaw) * car.v * dt;
    const fx = nx + Math.sin(car.yaw) * 2.4 * Math.sign(car.v || 1), fz = nz + Math.cos(car.yaw) * 2.4 * Math.sign(car.v || 1);
    if (walkable(fx, fz) && walkable(nx, nz) && Math.abs(nx) < 96 && nz > 2.5) { car.g.position.x = nx; car.g.position.z = nz; }
    else if (Math.abs(car.v) > 2) { shake(0.3, 300); thud(); log("drive.bump", `at ${nx.toFixed(0)},${nz.toFixed(0)} v ${car.v.toFixed(1)}`, { speed: +car.v.toFixed(1) }); car.v *= -0.25; S.metrics.bumps = (S.metrics.bumps || 0) + 1; }
    else car.v = 0;
    car.g.position.y = groundY(car.g.position.x, car.g.position.z);
    car.g.rotation.y = car.yaw; car.g.rotation.z = -car.steer * car.v / maxV * 0.06;
    car.g.userData.wheels.forEach((w, i) => { w.rotation.y += car.v * dt * 2.2; if (i < 2) w.rotation.z = car.steer * 0.5; });
    car.g.userData.tailMat.emissiveIntensity = inp.iz < 0 ? 2.6 : 0.7;
    driving.player.pos.set(car.g.position.x, car.g.position.y, car.g.position.z); driving.player.yaw = driving.player.targetYaw = car.yaw;
    engine(Math.abs(car.v) / maxV);
    driving.t += dt; S.metrics.driveSec = (S.metrics.driveSec || 0) + dt;
  });
  return { cars, exit, isDriving };
}
