// 3D speech bubbles anchored above a character's head (CSS2D), with typewriter text,
// character voice, optional Chinese hint, and A/B/C choice bubbles.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { scene, camera, addUpdate } from "../world/scene.js";
import { overShoulder, twoShot, frontShot } from "../world/camera.js";
import { esc, wait, REDUCED, IS_PHONE } from "../util.js";
import { hint } from "../i18n.js";
import { speak, stopSpeaking } from "../speech.js";
import { log } from "../telemetry.js";

const v = new THREE.Vector3();
let active = null;
addUpdate(() => {
  if (!active) return;
  if (active.actor) { active.actor.headWorld(v); v.y += 0.42; } else v.copy(active.anchor);
  active.obj.position.copy(v);
  // The speaker must be on screen and not hidden behind a building; otherwise cut to a shot in front of them.
  if (active.actor && active.frames % 20 === 10 && active.reframes < 2 && !speakerVisible(active.actor)) { active.reframes++; frontShot(active.actor, { dist: 3.4, height: 0.3, side: 0.7 }); }
  // A bubble whose anchor is off screen (behind the camera, above the frame) would hide its Continue button: pin it.
  if (++active.frames > 2 && !active.el.classList.contains("docked")) {
    const r = active.el.getBoundingClientRect();
    const off = active.el.style.display === "none" || r.top < 56 || r.bottom > innerHeight - 4 || r.left < 0 || r.right > innerWidth;
    if (off) active.el.classList.add("docked");
  }
});

const ray = new THREE.Raycaster(), ndc = new THREE.Vector3(), headP = new THREE.Vector3(), dir = new THREE.Vector3();
const isActor = o => { for (; o; o = o.parent) if (o.userData.actor) return true; return false; };
function speakerVisible(actor) {
  actor.headWorld(headP);
  ndc.copy(headP).project(camera);
  if (ndc.z > 1 || Math.abs(ndc.x) > 0.92 || ndc.y > 0.85 || ndc.y < -0.95) return false;
  const dist = camera.position.distanceTo(headP);
  ray.set(camera.position, dir.copy(headP).sub(camera.position).normalize()); ray.far = dist - 0.3;
  return !ray.intersectObjects(scene.children, true).some(h => h.object.isMesh && h.object.visible && !isActor(h.object) && !h.object.material?.transparent);
}
function open(el, { actor, anchor }) {
  close();
  const obj = new CSS2DObject(el); obj.center.set(0.5, 1); scene.add(obj);
  active = { el, obj, actor, anchor, frames: 0, reframes: 0 };
  if (IS_PHONE()) el.classList.add("docked");
  return active;
}
function close() { if (active) { scene.remove(active.obj); active.el.remove(); active = null; } }

function typewrite(el, text) {
  return new Promise(res => {
    if (REDUCED) { el.textContent = text; return res(); }
    let i = 0; el.textContent = "";
    const tick = () => { if (el.dataset.done) return res(); i += 2; el.textContent = text.slice(0, i); if (i >= text.length) res(); else el._t = setTimeout(tick, 22); };
    tick();
  });
}

// line: { who, role, en, zh, voice, anim ('talk'|'react'|null), ai }
export function say(speaker, line, listener) {
  return new Promise(res => {
    const el = document.createElement("div");
    el.className = "bubble" + (line.ai ? " ai" : "");
    el.innerHTML = `<div class="bname">${esc(line.who)}${line.role ? `<small>${esc(line.role)}</small>` : ""}</div><div class="btext"></div>
      <div class="bfoot"><button class="replay" type="button" aria-label="Play again">🔊</button>${hint(line.zh)}<button class="bnext" type="button">Continue ▸</button></div><div class="tail"></div>`;
    const actor = speaker?.actor || null;
    open(el, { actor, anchor: speaker?.anchor });
    if (actor && line.anim !== null) actor.play(line.anim || "talk");
    if (actor && listener) { actor.faceTo(listener); listener.faceTo(actor); overShoulder(listener, actor, { side: Math.random() < .5 ? 1 : -1 }); }
    if (line.ai) window.__traffic && (window.__traffic.aiTalking = true);
    const tx = el.querySelector(".btext");
    log("story.line", `${line.who}: ${line.en.slice(0, 60)}`);
    speak(line.en, line.voice || "narrator");
    typewrite(tx, line.en);
    const finish = () => { tx.dataset.done = 1; clearTimeout(tx._t); tx.textContent = line.en; };
    el.querySelector(".replay").onclick = e => { e.stopPropagation(); log("story.replay", line.who); speak(line.en, line.voice || "narrator"); };
    const done = () => {
      document.removeEventListener("keydown", key); stopSpeaking(); close();
      if (actor) actor.play("idle"); if (line.ai) window.__traffic && (window.__traffic.aiTalking = false);
      res();
    };
    const key = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!tx.dataset.done && tx.textContent.length < line.en.length) finish(); else done(); } };
    document.addEventListener("keydown", key);
    tx.onclick = finish;
    el.querySelector(".bnext").onclick = e => { e.stopPropagation(); done(); };
  });
}

// Choice bubble above the player's head. options: [{en, zh, ...}]
export function ask(player, prompt, options, other) {
  return new Promise(res => {
    const el = document.createElement("div"); el.className = "bubble choice";
    el.innerHTML = `<div class="bname">You<small>Sustainability Envoy</small></div><div class="btext">${esc(prompt.en)}${hint(prompt.zh)}</div>
      <div class="opts">${options.map((o, i) => `<button class="opt" type="button" data-i="${i}"><b>${"ABC"[i]}</b><span>${esc(o.en)}${o.zh ? `<span class="zh-text opt-zh" hidden>${esc(o.zh)}</span>` : ""}</span></button>`).join("")}</div><div class="tail"></div>`;
    open(el, { actor: player });
    if (other) twoShot(other, player);
    el.querySelector(".opts").onclick = e => { const b = e.target.closest(".opt"); if (!b) return; const o = options[+b.dataset.i]; close(); res(o); };
  });
}
export const closeBubble = close;
