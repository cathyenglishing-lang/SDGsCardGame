// Realistic characters: Ready Player Me avatars + three.js Mixamo-rigged models,
// animated with the Ready Player Me animation library (Mixamo-compatible skeleton).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { scene, quality, manager, addUpdate } from "./scene.js";
import { pick } from "../util.js";

// All four share the Ready Player Me rig, so the animation library applies directly.
const MODELS = {
  male:     { url: "assets/lib/rpm_male.glb", yawFix: 0, gender: "m" },
  female:   { url: "assets/lib/rpm_female.glb", yawFix: 0, gender: "f" },
  preview:  { url: "assets/lib/rpm_preview.glb", yawFix: 0, gender: "m" },
  template: { url: "assets/lib/rpm_template.glb", yawFix: 0, gender: "m" },
};
const ANIM_FILES = {
  idle_m: ["M_Standing_Idle_001", "M_Standing_Idle_Variations_001", "M_Standing_Idle_Variations_002", "M_Standing_Idle_Variations_005"],
  idle_f: ["F_Standing_Idle_001", "F_Standing_Idle_Variations_001", "F_Standing_Idle_Variations_002"],
  walk_m: ["M_Walk_001"], walk_f: ["F_Walk_002"], jog: ["M_Jog_001"],
  talk_m: ["M_Talking_Variations_001", "M_Talking_Variations_002", "M_Talking_Variations_005", "M_Talking_Variations_007"],
  talk_f: ["F_Talking_Variations_001", "F_Talking_Variations_002", "F_Talking_Variations_005"],
  react: ["M_Standing_Expressions_001", "M_Standing_Expressions_002", "M_Standing_Expressions_006", "M_Standing_Expressions_007", "M_Standing_Expressions_012", "M_Standing_Expressions_017"],
  dance: ["M_Dances_001"],
};

const loader = new GLTFLoader(manager);
const models = {}, clips = {};
const actors = new Set();

export async function loadCharacterAssets() {
  const jobs = [];
  for (const [k, m] of Object.entries(MODELS)) jobs.push(loader.loadAsync(m.url).then(g => { models[k] = prepModel(g.scene, m); }));
  for (const [k, files] of Object.entries(ANIM_FILES)) for (const f of files) jobs.push(loader.loadAsync(`assets/anim/${f}.glb`).then(g => { (clips[k] ||= []).push(g.animations[0]); }));
  await Promise.all(jobs);
  addUpdate(dt => { for (const a of actors) a.update(dt); });
}

function prepModel(root, spec) {
  const bones = new Set(); let prefix = "";
  root.traverse(o => {
    if (o.isBone) { bones.add(o.name); if (o.name.startsWith("mixamorig")) prefix = "mixamorig"; }
    if (o.isMesh) {
      o.castShadow = quality.high; o.receiveShadow = false; o.frustumCulled = false;
      // The animation-library avatars ship unlit (KHR_materials_unlit); give them a lit PBR material.
      const lit = m => m.isMeshBasicMaterial ? new THREE.MeshStandardMaterial({ map: m.map, color: m.color, roughness: 0.85, metalness: 0, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest }) : m;
      o.material = Array.isArray(o.material) ? o.material.map(lit) : lit(o.material);
    }
  });
  const bb = new THREE.Box3().setFromObject(root); const h = bb.max.y - bb.min.y;
  const scale = (spec.gender === "f" ? 1.68 : 1.78) / h;
  const hips = root.getObjectByName(prefix + "Hips");
  return { root, bones, prefix, scale, spec, retargeted: {}, hipsBind: hips ? hips.quaternion.clone() : new THREE.Quaternion() };
}

// Rename animation tracks for the target rig; keep only Hips translation (vertical bob).
// The library's rig (Ready Player Me) has a y-up armature; the three.js Mixamo exports have a rotated
// armature, so the Hips rotation is re-based onto the target's bind pose.
const _q = new THREE.Quaternion();
function retarget(clip, model) {
  const tracks = [];
  const ref = models.male?.hipsBind || new THREE.Quaternion();
  const corr = model.hipsBind.clone().multiply(ref.clone().invert());
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf("."); const node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    const base = node.replace(/^mixamorig:?/, ""); const target = model.prefix + base;
    if (!model.bones.has(target)) continue;
    if (prop === "position") { if (base !== "Hips" || model.prefix) continue; const v = t.values; for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; } }
    const nt = t.clone(); nt.name = `${target}.${prop}`;
    if (prop === "quaternion" && base === "Hips" && model.prefix) { const v = nt.values; for (let i = 0; i < v.length; i += 4) { _q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(corr); v[i] = _q.x; v[i + 1] = _q.y; v[i + 2] = _q.z; v[i + 3] = _q.w; } }
    tracks.push(nt);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
function clipsFor(model, kind) {
  const key = `${kind}_${model.spec.gender}`; const list = clips[key] || clips[kind] || clips[`${kind}_m`] || clips.idle_m;
  const cacheKey = clips[key] ? key : (clips[kind] ? kind : `${kind}_m`);
  model.retargeted[cacheKey] ||= list.map(c => retarget(c, model));
  return model.retargeted[cacheKey];
}

export class Actor {
  constructor(kind, name, { tint } = {}) {
    const model = models[kind] || models.male;
    this.model = model; this.name = name; this.gender = model.spec.gender;
    this.root = new THREE.Group(); this.inner = SkeletonUtils.clone(model.root);
    this.inner.scale.setScalar(model.scale); this.inner.rotation.y = model.spec.yawFix; this.root.add(this.inner);
    if (tint) {
      // Recolor clothing meshes when the avatar has them; otherwise tint the single mesh lightly.
      const c = new THREE.Color(tint); let hasOutfit = false; this.inner.traverse(o => { if (o.isMesh && /Outfit/.test(o.name)) hasOutfit = true; });
      this.inner.traverse(o => { if (!o.isMesh) return; if (hasOutfit && !/Outfit/.test(o.name)) return; const cl = m => { const n = m.clone(); n.color.multiply(c); return n; }; o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material); });
    }
    this.head = null; this.inner.traverse(o => { if (o.isBone && /Head$/.test(o.name)) this.head = o; });
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.current = null; this.kind = null; this.yaw = 0; this.targetYaw = 0; this.walkState = null; this.speedFactor = 1;
    scene.add(this.root); actors.add(this);
    this.play("idle");
  }
  play(kind, { fade = 0.35, once = false, onDone, variant } = {}) {
    const list = clipsFor(this.model, kind); if (!list?.length) return;
    const clip = variant != null ? list[variant % list.length] : pick(list);
    const action = this.mixer.clipAction(clip);
    action.reset(); action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); action.clampWhenFinished = once;
    action.timeScale = kind === "walk" ? 1.1 * this.speedFactor : 1;
    if (this.current && this.current !== action) this.current.fadeOut(fade);
    action.fadeIn(fade).play();
    this.current = action; this.kind = kind;
    if (once) { const h = e => { if (e.action === action) { this.mixer.removeEventListener("finished", h); onDone ? onDone() : this.play("idle"); } }; this.mixer.addEventListener("finished", h); }
    return action;
  }
  update(dt) {
    this.mixer.update(dt);
    if (this.walkState) this.stepWalk(dt);
    let d = this.targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 7); this.root.rotation.y = this.yaw;
  }
  get pos() { return this.root.position; }
  setPos(x, y, z) { this.root.position.set(x, y, z); return this; }
  face(x, z, instant = false) { this.targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z); if (instant) { this.yaw = this.targetYaw; this.root.rotation.y = this.yaw; } return this; }
  faceTo(a, instant) { return this.face(a.pos.x, a.pos.z, instant); }
  headWorld(out) { if (this.head) this.head.getWorldPosition(out); else out.copy(this.pos).add(new THREE.Vector3(0, 1.6, 0)); return out; }
  walk(points, { speed = 2.3, loop = false, kind = "walk" } = {}) {
    return new Promise(res => {
      const pts = points.map(p => p.length === 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], this.pos.y, p[1]));
      this.walkState = { pts, i: 0, speed, loop, res }; this.play(kind);
    });
  }
  stepWalk(dt) {
    const w = this.walkState; const tgt = w.pts[w.i]; const p = this.pos;
    const dx = tgt.x - p.x, dz = tgt.z - p.z, dy = tgt.y - p.y; const dist = Math.hypot(dx, dz);
    const step = w.speed * dt;
    if (dist > 0.05) this.targetYaw = Math.atan2(dx, dz);
    if (dist <= step) { p.set(tgt.x, tgt.y, tgt.z); w.i++; if (w.i >= w.pts.length) { if (w.loop) { w.i = 0; } else { this.walkState = null; this.play("idle"); w.res(); return; } } }
    else { p.x += dx / dist * step; p.z += dz / dist * step; p.y += dy / dist * step; }
  }
  stopWalk() { if (this.walkState) { const r = this.walkState.res; this.walkState = null; this.play("idle"); r(); } }
  dispose() { scene.remove(this.root); actors.delete(this); }
}

export const makeActor = (kind, name, o) => new Actor(kind, name, o);
export const CROWD_KINDS = ["male", "female", "preview", "template"];
export const CROWD_TINTS = [0xffffff, 0xd8d8e8, 0xe6d8c8, 0xc8d8e6, 0xd0d0d0, 0xe8c8c8];
