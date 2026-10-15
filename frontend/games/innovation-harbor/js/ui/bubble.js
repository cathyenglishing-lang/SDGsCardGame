// 3D speech bubbles above a character's head, with typewriter text, character voice,
// optional Chinese hint, and A/B/C choice bubbles.
// Placement is done by hand every frame (not CSS2DObject) so a bubble is always fully inside
// the viewport: it sits above the head, slides sideways near the edges, flips below the head
// when the head is near the top, and docks to the bottom when the speaker is off screen
// (or on phones, where a floating bubble would cover the scene).
import * as THREE from "three";
import { scene, camera, addUpdate } from "../world/scene.js";
import { overShoulder, twoShot, frontShot } from "../world/camera.js";
import { esc, wait, REDUCED, IS_PHONE } from "../util.js";
import { hint } from "../i18n.js";
import { speak, stopSpeaking } from "../speech.js";
import { log } from "../telemetry.js";

const labels = document.getElementById("labels");
const v = new THREE.Vector3(), ndc = new THREE.Vector3();
let active = null;

function place(a) {
  const el = a.el; const W = innerWidth, H = innerHeight;
  if (a.actor) { a.actor.headWorld(v); v.y += 0.35; } else v.copy(a.anchor);
  ndc.copy(v).project(camera);
  const behind = ndc.z > 1, far = Math.abs(ndc.x) > 1.3 || Math.abs(ndc.y) > 1.3;
  const dock = a.forceDock || IS_PHONE() || behind || far;
  if (dock !== a.docked) { a.docked = dock; el.classList.toggle("docked", dock); }
  if (dock) { el.style.left = el.style.top = ""; return; }
  // the bubble has a fixed CSS width (never `auto`): an auto width would stretch to fit a stale
  // `left` and the clamp below could then settle on an off-screen position
  const r = el.getBoundingClientRect(); const bw = Math.min(r.width || 420, W - 16), bh = r.height || 140;
  const px = (ndc.x * 0.5 + 0.5) * W, py = (-ndc.y * 0.5 + 0.5) * H;
  const topMin = 64 + 8, margin = 8;
  let left = px - bw / 2, top = py - bh - 14; let below = false;
  if (top < topMin) { top = py + 36; below = true; }               // head too high: speak from below
  if (top + bh > H - margin) top = Math.max(topMin, H - margin - bh);
  left = Math.min(Math.max(margin, left), W - margin - bw);
  el.style.left = left + "px"; el.style.top = top + "px";
  el.classList.toggle("below", below);
  // the tail points at the head
  const tail = el.querySelector(".tail"); if (tail) tail.style.left = Math.min(Math.max(16, px - left), bw - 16) + "px";
}

addUpdate(() => {
  if (!active) return;
  place(active);
  if (active.actor && ++active.frames % 20 === 10 && active.reframes < 2 && !speakerVisible(active.actor)) { active.reframes++; frontShot(active.actor, { dist: 3.4, height: 0.3, side: 0.7 }); }
});

const ray = new THREE.Raycaster(), headP = new THREE.Vector3(), dir = new THREE.Vector3(), p2 = new THREE.Vector3();
const isActor = o => { for (; o; o = o.parent) if (o.userData.actor) return true; return false; };
function speakerVisible(actor) {
  actor.headWorld(headP);
  p2.copy(headP).project(camera);
  if (p2.z > 1 || Math.abs(p2.x) > 0.92 || p2.y > 0.85 || p2.y < -0.95) return false;
  const dist = camera.position.distanceTo(headP);
  ray.set(camera.position, dir.copy(headP).sub(camera.position).normalize()); ray.far = dist - 0.3;
  return !ray.intersectObjects(scene.children, true).some(h => h.object.isMesh && h.object.visible && !isActor(h.object) && !h.object.material?.transparent);
}
function open(el, { actor, anchor }) {
  close();
  el.style.position = "absolute"; labels.appendChild(el);
  active = { el, actor, anchor, frames: 0, reframes: 0, docked: null, forceDock: IS_PHONE() };
  place(active);
  return active;
}
function close() { if (active) { active.el.remove(); active = null; } }
addEventListener("resize", () => { if (active) { active.forceDock = IS_PHONE(); place(active); } });

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
    if (actor && line.anim !== null) actor.play(line.anim || "talk");
    if (actor && listener) { actor.faceTo(listener); listener.faceTo(actor); overShoulder(listener, actor, { side: Math.random() < .5 ? 1 : -1 }); }
    open(el, { actor, anchor: speaker?.anchor });
    if (line.ai) window.__traffic && (window.__traffic.aiTalking = true);
    const tx = el.querySelector(".btext");
    log("story.line", `${line.who}: ${line.en.slice(0, 60)}`, { who: line.who });
    speak(line.en, line.voice || "narrator");
    typewrite(tx, line.en);
    const finish = () => { tx.dataset.done = 1; clearTimeout(tx._t); tx.textContent = line.en; };
    el.querySelector(".replay").onclick = e => { e.stopPropagation(); log("story.replay", line.who, { who: line.who }); speak(line.en, line.voice || "narrator"); };
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

// Thought cloud: what a character is thinking (the player hears it, nobody in the scene does).
// A floating cloud with a trail of small bubbles instead of a tail, italic text, no mouth animation.
// line: { who, en, zh, voice, anim ('react'|null), hold (ms, auto-dismiss; default: stay until Continue) }
export function think(speaker, line, listener) {
  return new Promise(res => {
    const el = document.createElement("div");
    el.className = "bubble thought";
    el.innerHTML = `<div class="bname">${esc(line.who)}<small>thinks…</small></div><div class="btext"></div>
      <div class="bfoot"><button class="replay" type="button" aria-label="Play again">🔊</button>${hint(line.zh)}<button class="bnext" type="button">…</button></div><div class="tail"></div>`;
    const actor = speaker?.actor || null;
    if (actor && line.anim) actor.play(line.anim);
    if (actor && listener && listener !== actor) overShoulder(listener, actor, { side: Math.random() < .5 ? 1 : -1 });
    else if (actor) frontShot(actor, { dist: 3.0, height: 0.35, side: 0.5 });
    open(el, { actor, anchor: speaker?.anchor });
    const tx = el.querySelector(".btext");
    log("story.thought", `${line.who}: ${line.en.slice(0, 60)}`, { who: line.who });
    speak(line.en, line.voice || "narrator");
    typewrite(tx, line.en);
    const finish = () => { tx.dataset.done = 1; clearTimeout(tx._t); tx.textContent = line.en; };
    el.querySelector(".replay").onclick = e => { e.stopPropagation(); log("story.replay", line.who, { who: line.who }); speak(line.en, line.voice || "narrator"); };
    let t;
    const done = () => { document.removeEventListener("keydown", key); clearTimeout(t); stopSpeaking(); close(); if (actor && line.anim) actor.play("idle"); res(); };
    const key = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!tx.dataset.done && tx.textContent.length < line.en.length) finish(); else done(); } };
    document.addEventListener("keydown", key);
    tx.onclick = finish;
    el.querySelector(".bnext").onclick = e => { e.stopPropagation(); done(); };
    if (line.hold) t = setTimeout(done, line.hold);
  });
}

// Choice bubble above the player's head. options: [{en, zh, ...}]
export function ask(player, prompt, options, other) {
  return new Promise(res => {
    const el = document.createElement("div"); el.className = "bubble choice";
    el.innerHTML = `<div class="bname">You<small>Sustainability Envoy</small></div><div class="btext">${esc(prompt.en)}${hint(prompt.zh)}</div>
      <div class="opts">${options.map((o, i) => `<button class="opt" type="button" data-i="${i}"><b>${"ABC"[i]}</b><span>${esc(o.en)}${o.zh ? `<span class="zh-text opt-zh" hidden>${esc(o.zh)}</span>` : ""}</span></button>`).join("")}</div><div class="tail"></div>`;
    if (other) twoShot(other, player);
    open(el, { actor: player });
    el.querySelector(".opts").onclick = e => { const b = e.target.closest(".opt"); if (!b) return; const o = options[+b.dataset.i]; close(); res(o); };
  });
}
export const closeBubble = close;
