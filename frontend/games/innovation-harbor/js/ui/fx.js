// Story presentation effects: emotion badges over a character's head, cinematic title / location
// cards, and sepia flashbacks. All of them are optional decoration — the story never waits on
// them for logic, only for timing.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { $, esc, wait, REDUCED } from "../util.js";
import { hint } from "../i18n.js";
import { fade } from "../world/camera.js";
import { scene, addUpdate } from "../world/scene.js";
const fxScene = { scene };
import { log } from "../telemetry.js";

// ── emotion badge: "!", "?", "idea", "worry", "ok", "love", "angry", "sweat" ──
const EMOTES = { "!": "❗", "?": "❓", idea: "💡", worry: "😟", ok: "✅", love: "💛", angry: "💢", sweat: "💦", music: "🎵" };
const live = new Map();
export function emote(actor, kind = "!", ms = 1800) {
  if (!actor?.root) return Promise.resolve();
  live.get(actor)?.();
  // the animation lives on the inner span: CSS2DRenderer positions the outer element with an
  // inline transform, which a transform animation on the same element would override
  const el = document.createElement("div"); el.className = "emote"; el.innerHTML = `<span>${EMOTES[kind] || kind}</span>`;
  const obj = new CSS2DObject(el); obj.center.set(0.5, 1);
  const host = actor.head || actor.root; obj.position.set(0, actor.head ? 0.32 : 2.05, 0); host.add(obj);
  const remove = () => { obj.removeFromParent(); el.remove(); if (live.get(actor) === remove) live.delete(actor); };
  live.set(actor, remove); // one badge per character: a new one replaces the old
  log("story.emote", `${actor.name || "actor"} ${kind}`, { who: actor.name, kind });
  return wait(ms).then(() => { el.classList.add("out"); return wait(260); }).then(remove);
}

// ── title / location card: slides in at the lower third, holds, slides out ──
// { kicker, title, zh, sub } — kicker above the title (chapter / place), sub under it.
export function titleCard({ kicker = "", title, zh = "", sub = "" }, ms = 2600) {
  const el = document.createElement("div"); el.className = "titlecard";
  el.innerHTML = `<i></i><div>${kicker ? `<small>${esc(kicker)}</small>` : ""}<b>${esc(title)}${hint(zh)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`;
  $("#ui").appendChild(el);
  log("story.title", `${kicker} ${title}`.trim(), { kicker, title });
  return wait(REDUCED ? 10 : 60).then(() => { el.classList.add("in"); return wait(ms); }).then(() => { el.classList.remove("in"); el.classList.add("out"); return wait(500); }).then(() => el.remove());
}

// ── flashback: white flash, sepia + vignette + caption while fn() runs, then back ──
export async function flashback(fn, { caption = "Flashback", zh = "", ms = 0 } = {}) {
  const veil = $("#fade"); const old = veil.style.background;
  veil.style.background = "#fff"; await fade(true, 350);
  document.body.classList.add("flashback");
  const cap = document.createElement("div"); cap.className = "flashcap"; cap.innerHTML = `<b>${esc(caption)}</b>${hint(zh)}`; $("#ui").appendChild(cap);
  log("story.flashback", caption, { caption });
  await wait(150); await fade(false, 500);
  try { await fn?.(); if (ms) await wait(ms); } finally {
    await fade(true, 450);
    document.body.classList.remove("flashback"); cap.remove();
    veil.style.background = old || "#000";
    await wait(120); await fade(false, 500);
  }
}

// ── card dealing: the NPC fans a hand of cards out to the player before the card game ──
const findBone = (actor, re) => { let b = null; actor.inner?.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
let cardTex = null;
function cardTexture() {
  if (cardTex) return cardTex;
  const c = document.createElement("canvas"); c.width = 128; c.height = 180; const g = c.getContext("2d");
  g.fillStyle = "#f6f1e4"; g.fillRect(0, 0, 128, 180); g.strokeStyle = "#fd6925"; g.lineWidth = 8; g.strokeRect(8, 8, 112, 164);
  g.fillStyle = "#fd6925"; g.font = "700 30px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillText("SDG", 64, 80); g.fillText("9", 64, 118);
  g.fillStyle = "#1c2129"; g.font = "600 13px 'Manrope', sans-serif"; g.fillText("PECHA KUCHA", 64, 150);
  cardTex = new THREE.CanvasTexture(c); cardTex.colorSpace = THREE.SRGBColorSpace; return cardTex;
}
export function dealCards(from, to, n = 8, { ms = 1800 } = {}) {
  return new Promise(res => {
    const { scene } = fxScene; if (!scene) return res();
    const hand = findBone(from, /RightHand$/) || from.head || from.root;
    const start = new THREE.Vector3(); hand.getWorldPosition(start);
    const head = new THREE.Vector3(); to.headWorld(head);
    const fwd = new THREE.Vector3(Math.sin(to.yaw), 0, Math.cos(to.yaw)), right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const geo = new THREE.PlaneGeometry(0.3, 0.42);
    const mat = new THREE.MeshStandardMaterial({ map: cardTexture(), side: THREE.DoubleSide, roughness: .6, transparent: true });
    const cards = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat.clone()); m.position.copy(start); m.frustumCulled = false; scene.add(m);
      const spread = (i - (n - 1) / 2) * 0.09;
      const end = head.clone().addScaledVector(fwd, 0.55).addScaledVector(right, spread); end.y = head.y - 0.35 + Math.abs(spread) * -0.15;
      cards.push({ m, end, delay: i * 0.07, t: 0, yaw: Math.atan2(fwd.x, fwd.z) + Math.PI + spread * 1.6 });
    }
    from.play?.("react"); log("story.deal", `${from.name} deals ${n} cards`, { who: from.name, n });
    let t = 0; const total = ms / 1000;
    const off = addUpdate(dt => {
      t += dt;
      for (const c of cards) {
        const k = Math.min(1, Math.max(0, (t - c.delay) / (total * 0.55)));
        const e = k * k * (3 - 2 * k);
        c.m.position.lerpVectors(start, c.end, e); c.m.position.y += Math.sin(e * Math.PI) * 0.6;
        c.m.rotation.set(Math.sin(e * Math.PI) * 1.2, c.yaw + (1 - e) * Math.PI * 2, 0);
        if (t > total - 0.35) c.m.material.opacity = Math.max(0, (total - t) / 0.35);
      }
      if (t >= total) { cards.forEach(c => { scene.remove(c.m); c.m.material.dispose(); }); geo.dispose(); off(); from.play?.("idle"); res(); }
    });
  });
}
