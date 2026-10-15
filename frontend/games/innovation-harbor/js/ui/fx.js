// Story presentation effects: emotion badges over a character's head, cinematic title / location
// cards, and sepia flashbacks. All of them are optional decoration — the story never waits on
// them for logic, only for timing.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { $, esc, wait, REDUCED } from "../util.js";
import { hint } from "../i18n.js";
import { fade } from "../world/camera.js";
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
