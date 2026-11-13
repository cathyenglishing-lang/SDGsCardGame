// The cinematic image for the SDG 4 stage: bloom, depth of field, a colour grade with vignette and grain,
// and a quality ladder that steps DOWN by itself when the device cannot keep up.
//
// Opt-in: nothing here runs until enableCinematic() is called (js/sdg4/main.js). The harbor game never calls it.
//
// Tiers (quality.tier):
//   3  bloom + depth of field + grade     a laptop or desktop with a real GPU
//   2  bloom (half size) + grade          an ordinary laptop
//   1  no post-processing; a CSS vignette phones, tablets, old laptops
//   0  as 1, at a lower pixel ratio, and the particles are switched off (cinematic.js listens with onTier)
// The first tier comes from the device; ?q=high / ?q=low pin it (no stepping). Otherwise the frame rate is
// watched in 3-second windows after a warm-up, and a window under 28 fps drops one tier. It never climbs back,
// so the picture cannot flicker between two looks.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { renderer, scene, camera, quality, setRenderFrame, onResize } from "./scene.js";

const Q = new URLSearchParams(location.search).get("q");
const PINNED = Q === "high" || Q === "low";
export const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Applied after tone mapping, in display space: a gentle S-curve, cool shadows / warm highlights, saturation,
// a vignette and a little grain. `mix` uniforms are eased by cinematic.js to follow the slide's mood.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWarm: { value: 0.0 }, uSat: { value: 1.06 }, uVig: { value: 0.42 }, uGrain: { value: 0.028 }, uContrast: { value: 0.16 }, uLift: { value: 0.0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uWarm, uSat, uVig, uGrain, uContrast, uLift; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);                       // S-curve
      vec3 shadow = vec3(0.90, 1.00, 1.10), light = vec3(1.08, 1.00, 0.90); // teal shadows, amber highlights
      c *= mix(shadow, light, smoothstep(0.08, 0.75, l));
      c *= mix(vec3(1.0), vec3(1.10, 1.0, 0.86), uWarm);                    // slide mood: > 0 warmer
      c *= mix(vec3(1.0), vec3(0.86, 0.96, 1.12), max(0.0, -uWarm));        //             < 0 cooler
      c += uLift;
      vec2 d = vUv - 0.5; d.x *= 1.15;
      c *= 1.0 - uVig * smoothstep(0.28, 0.86, length(d));
      c += (hash(vUv * vec2(1920.0, 1080.0) + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export const cinema = { on: false, tier: 1, composer: null, bloom: null, bokeh: null, grade: null, focus: 12, focusWant: 12, listeners: new Set(), steps: 0 };
export const onTier = fn => { cinema.listeners.add(fn); fn(cinema.tier); };
const firstTier = () => (Q === "high" ? 3 : Q === "low" ? 1 : quality.high ? 3 : quality.mobile ? 1 : 2);

function build() {
  const t = cinema.tier;
  if (cinema.composer) { cinema.composer.dispose?.(); cinema.composer = cinema.bloom = cinema.bokeh = cinema.grade = null; }
  document.body.classList.toggle("vignette-lite", t <= 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, t === 3 ? 2 : t === 2 ? 1.5 : t === 1 ? 1.25 : 1));
  if (t <= 1) { renderer.info.autoReset = true; setRenderFrame(null); return; }
  const w = innerWidth, h = innerHeight;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (t === 3) {
    const bokeh = new BokehPass(scene, camera, { focus: cinema.focus, aperture: 0.00009, maxblur: 0.006 });
    composer.addPass(bokeh); cinema.bokeh = bokeh;
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(t === 3 ? w : w / 2, t === 3 ? h : h / 2), t === 3 ? 0.34 : 0.26, 0.62, 0.86);
  composer.addPass(bloom); cinema.bloom = bloom;
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade); cinema.grade = grade;
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  cinema.composer = composer;
  // Several passes draw in one frame: count them together so perfInfo() reports the whole frame.
  renderer.info.autoReset = false;
  setRenderFrame((dt, time) => {
    renderer.info.reset();
    grade.uniforms.uTime.value = time % 100;
    if (cinema.bokeh) { cinema.focus += (cinema.focusWant - cinema.focus) * Math.min(1, dt * 3); cinema.bokeh.uniforms.focus.value = cinema.focus; }
    composer.render(dt);
  });
}

function setTier(t) {
  t = Math.max(0, Math.min(3, t));
  if (t === cinema.tier && cinema.on) return;
  cinema.tier = quality.tier = t;
  build();
  for (const f of cinema.listeners) f(t);
}

// Watch the frame rate; called every frame by the loop below.
let warm = 2.5, acc = 0, frames = 0;
function watch(rawDt) {
  if (PINNED || cinema.tier === 0 || document.hidden) return;
  if (rawDt > 3) return;                         // a tab that came back from the background, a breakpoint: not a slow frame
  if (warm > 0) { warm -= rawDt; return; }
  acc += rawDt; frames++;
  if (acc < 3) return;
  const fps = frames / acc; acc = 0; frames = 0;
  if (fps < 28) { cinema.steps++; warm = 4; setTier(cinema.tier - 1); }
}

export function enableCinematic() {
  if (cinema.on) return cinema;
  cinema.tier = quality.tier = firstTier();
  build();
  cinema.on = true;
  onResize((w, h) => {
    if (!cinema.composer) return;
    cinema.composer.setPixelRatio(renderer.getPixelRatio()); cinema.composer.setSize(w, h);
    if (cinema.bloom) cinema.bloom.resolution.set(cinema.tier === 3 ? w : w / 2, cinema.tier === 3 ? h : h / 2);
  });
  let last = performance.now();
  const tick = () => { const now = performance.now(); watch((now - last) / 1000); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  for (const f of cinema.listeners) f(cinema.tier);
  return cinema;
}

// Where the lens focuses (metres from the camera): the speaker, usually. Only tier 3 has depth of field.
export const setFocus = dist => { cinema.focusWant = Math.max(1.5, dist); };
// The slide's mood for the grade: warm in [-1, 1], vignette 0..1, saturation around 1.
export function gradeTo({ warm = 0, vig = 0.42, sat = 1.06, lift = 0 } = {}, k = 1) {
  const u = cinema.grade?.uniforms; if (!u) return;
  u.uWarm.value += (warm - u.uWarm.value) * k; u.uVig.value += (vig - u.uVig.value) * k; u.uSat.value += (sat - u.uSat.value) * k; u.uLift.value += (lift - u.uLift.value) * k;
}
