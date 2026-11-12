// The Waterfront Theater as a film set (SDG 4 stage, 2026-11-12).
//
//   light     key (warm, front-left) · fill (cool, front-right) · rim (from above and behind the speaker) ·
//             two colour washes from the truss. Six presets (warm, cool, dim, split, spot, rise) that a slide picks.
//   air       fog that closes in for the heavy slides, light beams you can see (additive cones, not ray-marched),
//             dust drifting through them
//   set       lectern, SDG 4 banners, plants, an LED strip along the stage, footlights, a pool of light under the
//             speaker, a silhouette crowd that fills the tiers, phone lights in the audience
//   story     small prop sets that appear for the slide they belong to (a school that closes, empty desks, a
//             30 % bar, floating tablets …). Which slide gets what is written in js/sdg4/talk.js as `cue`.
//   camera    a crane move into the theater, one slow move per slide that starts a little closer with every
//             slide of a part, a pull-back at the end. prefers-reduced-motion: cuts only.
//
// Everything is built from boxes, cylinders and a few canvas textures: no downloads. What is expensive scales
// with post.js's tier (lights, beams, dust). Nothing here runs unless js/sdg4/main.js calls initStage().
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { scene, camera, addUpdate, hemi, quality, setMood, renderer, sunLight } from "./scene.js";
import { shot, fly } from "./camera.js";
import { cinema, onTier, setFocus, gradeTo, REDUCED } from "./post.js";

const G = 0.6, STAGE_Y = 0.9;
const SPEAKER = new THREE.Vector3(27, STAGE_Y, 5.5);
const ANCHOR = { L: [22.3, STAGE_Y, 4.8], R: [32.0, STAGE_Y, 4.6], LF: [23.4, STAGE_Y, 6.9], RF: [33.8, STAGE_Y, 6.6], UP: [27, 6.2, 3.4] };   // inside the push shot's frame
const C = hex => new THREE.Color(hex);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });
const glow = (color, k = 1.6) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: k, roughness: 0.5 });
const add = (parent, geo, m, x = 0, y = 0, z = 0, r = [0, 0, 0]) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(...r); parent.add(o); return o; };
const box = (p, w, h, d, m, x, y, z, r) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, r);
const cyl = (p, rt, rb, h, m, x, y, z, r, seg = 14) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, r);

const stage = { ready: false, lights: {}, beams: [], dust: null, phones: null, led: [], pool: null, sets: {}, crowd: null, player: null, audience: [] };
// What the picture is moving towards; every value is eased in update().
const want = { key: [C(0xffd9a8), 260], fill: [C(0x9fc4ff), 70], rim: [C(0xffe2b8), 380], washL: [C(0xffb060), 90], washR: [C(0xffb060), 90],
  led: C(0xffb060), beam: 0.5, fog: 0.25, hemi: 0.42, phones: 0, grade: { warm: 0.25, vig: 0.42, sat: 1.06 }, props: new Set() };
const PRESET = {
  warm:  { key: [0xffd9a8, 260], fill: [0x9fc4ff, 70],  rim: [0xffe2b8, 380], washL: [0xffb060, 90],  washR: [0xffb060, 90],  led: 0xffb060, beam: 0.5,  hemi: 0.42, grade: { warm: 0.3, vig: 0.42, sat: 1.08 } },
  cool:  { key: [0xe6f0ff, 240], fill: [0x7fb0ff, 95],  rim: [0xb8dcff, 400], washL: [0x39c6ff, 110], washR: [0x4a6bff, 110], led: 0x39c6ff, beam: 0.55, hemi: 0.4,  grade: { warm: -0.35, vig: 0.44, sat: 1.04 } },
  dim:   { key: [0xcfd8e8, 110], fill: [0x6f88b8, 26],  rim: [0x9fb6d8, 210], washL: [0x26324a, 14],  washR: [0x26324a, 14],  led: 0x24406e, beam: 0.22, hemi: 0.24, grade: { warm: -0.2, vig: 0.62, sat: 0.84 } },
  split: { key: [0xfff0dc, 200], fill: [0x8fa8d8, 40],  rim: [0xf2e6d2, 330], washL: [0xffc070, 240], washR: [0x31456e, 22],  led: 0xf2efe6, beam: 0.45, hemi: 0.36, grade: { warm: 0.0, vig: 0.48, sat: 1.0 } },
  spot:  { key: [0xfff4e2, 340], fill: [0x8fa8d8, 14],  rim: [0xffe9c8, 440], washL: [0xff4f9a, 60],  washR: [0xff4f9a, 60],  led: 0xff4f9a, beam: 0.7,  hemi: 0.22, grade: { warm: 0.1, vig: 0.6, sat: 1.02 } },
  rise:  { key: [0xffe0b0, 320], fill: [0xffd2a0, 120], rim: [0xfff0d0, 420], washL: [0xffc24a, 210], washR: [0xffc24a, 210], led: 0xffc24a, beam: 0.8,  hemi: 0.55, grade: { warm: 0.5, vig: 0.3, sat: 1.12 } },
};
function preset(name) {
  const p = PRESET[name] || PRESET.warm;
  for (const k of ["key", "fill", "rim", "washL", "washR"]) { want[k][0].set(p[k][0]); want[k][1] = p[k][1]; }
  want.led.set(p.led); want.beam = p.beam; want.hemi = p.hemi; want.grade = p.grade;
}

// ── textures drawn here ──
function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const bannerTex = () => canvasTex(256, 880, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#c5192d"); gr.addColorStop(1, "#7d0f1c"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "700 190px 'Chakra Petch', sans-serif"; g.fillText("4", w / 2, 210);
  g.font = "700 40px 'Chakra Petch', sans-serif"; g.fillText("QUALITY", w / 2, 300); g.fillText("EDUCATION", w / 2, 348);
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 7; g.strokeRect(86, 420, 84, 112);                      // the goal's icon: a book and a pencil
  g.beginPath(); g.moveTo(128, 420); g.lineTo(128, 532); g.stroke(); g.beginPath(); g.moveTo(196, 420); g.lineTo(196, 520); g.lineTo(186, 540); g.stroke();
  g.font = "500 30px 'Noto Sans TC', sans-serif"; g.fillText("優質教育", w / 2, 620); g.font = "600 26px 'Chakra Petch', sans-serif"; g.fillText("PECHA KUCHA", w / 2, 800);
});
const poolTex = () => canvasTex(256, 256, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); r.addColorStop(0, "rgba(255,236,200,.95)"); r.addColorStop(0.55, "rgba(255,220,170,.35)"); r.addColorStop(1, "rgba(255,220,170,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });

// ── light you can see: an additive cone, dense along its axis, fading along its length and at its edge ──
function beam(from, to, radius, color) {
  const dir = new THREE.Vector3().subVectors(to, from), len = dir.length();
  const geo = new THREE.ConeGeometry(radius, len, 28, 1, true); geo.translate(0, -len / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: C(color) }, uOpacity: { value: 0.5 }, uLen: { value: len }, uTime: { value: 0 } },
    vertexShader: "uniform float uLen; varying vec3 vN, vV; varying float vH; varying vec3 vP; void main(){ vH = -position.y / uLen; vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uTime; varying vec3 vN, vV, vP; varying float vH;
      void main(){ float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.7);
        float along = (1.0 - smoothstep(0.05, 1.0, vH)) * smoothstep(0.0, 0.06, vH);
        float haze = 0.82 + 0.18 * sin(vP.y * 1.7 + uTime * 0.6 + vP.x * 2.3);
        float a = face * along * haze * uOpacity; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const o = new THREE.Mesh(geo, m); o.position.copy(from); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize()); o.renderOrder = 5; o.frustumCulled = false;
  scene.add(o); return o;
}

// ── dust in the beams / phone lights in the audience: one Points object each ──
function points(positions, { size, color, opacity = 1, drift = 0 }) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const seed = new Float32Array(positions.length / 3).map(() => Math.random()); geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: size * renderer_dpr() }, uColor: { value: C(color) }, uOpacity: { value: opacity }, uDrift: { value: drift } },
    vertexShader: `uniform float uTime, uSize, uDrift; attribute float seed; varying float vTw;
      void main(){ vec3 p = position; float t = uTime * (0.12 + seed * 0.2) + seed * 40.0;
        p += uDrift * vec3(sin(t) * 0.5, sin(t * 0.7 + seed * 6.0) * 0.35, cos(t * 0.9) * 0.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vTw = 0.55 + 0.45 * sin(uTime * (1.2 + seed * 2.0) + seed * 30.0);
        gl_PointSize = uSize * (0.6 + seed * 0.8) / max(1.0, -mv.z); }`,
    fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying float vTw; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * uOpacity * vTw; gl_FragColor = vec4(uColor * a, a); }",
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const o = new THREE.Points(geo, m); o.frustumCulled = false; o.renderOrder = 6; scene.add(o); return o;
}
const renderer_dpr = () => Math.min(devicePixelRatio || 1, 2);

// ── the story's props. Each builder returns a Group about two metres across; `spin` animates it. ──
const SETS = {
  question(g) { const m = glow(0xffc54d, 1.8); add(g, new THREE.TorusGeometry(0.55, 0.13, 10, 24, Math.PI * 1.35), m, 0, 2.5, 0, [0, 0, -0.6]); cyl(g, 0.13, 0.13, 0.55, m, 0.05, 1.72, 0); add(g, new THREE.SphereGeometry(0.17, 12, 10), m, 0.05, 1.1, 0); g.userData.spin = (o, t) => { o.rotation.y = Math.sin(t * 0.8) * 0.5; o.position.y = Math.sin(t * 1.3) * 0.08; }; },
  scale(g, o) { const steel = mat(0xb9c0c8, { metalness: 0.7, roughness: 0.3 }); cyl(g, 0.5, 0.6, 0.12, steel, 0, 0.06, 0); cyl(g, 0.06, 0.06, 2.1, steel, 0, 1.1, 0); const arm = new THREE.Group(); arm.position.y = 2.1; g.add(arm); box(arm, 2.2, 0.07, 0.07, steel, 0, 0, 0);
    for (const s of [-1, 1]) { cyl(arm, 0.02, 0.02, 0.7, steel, s * 1.05, -0.35, 0); cyl(arm, 0.42, 0.3, 0.08, s < 0 ? glow(0xffc54d, 0.9) : glow(0x5fc79b, 0.9), s * 1.05, -0.72, 0); }
    const tilt = o && o.level ? 0 : 0.28; g.userData.spin = (_, t) => { arm.rotation.z = tilt + Math.sin(t * 0.9) * 0.04; }; },
  book(g) { const paper = mat(0xf3ead6), cover = mat(0x1f4e79); for (const s of [-1, 1]) { box(g, 0.95, 0.06, 1.3, cover, s * 0.5, 1.2, 0, [0, 0, s * -0.22]); box(g, 0.88, 0.1, 1.22, paper, s * 0.48, 1.28, 0, [0, 0, s * -0.22]); }
    add(g, new THREE.SphereGeometry(0.16, 12, 10), glow(0xffe6a8, 2.2), 0, 1.95, 0); g.userData.spin = (o, t) => { o.rotation.y = 0.5 + Math.sin(t * 0.5) * 0.3; o.children[4].position.y = 1.95 + Math.sin(t * 1.6) * 0.12; }; },
  globe(g) { add(g, new THREE.SphereGeometry(0.85, 20, 14), mat(0x1c5d8a, { emissive: 0x0d2f4a, emissiveIntensity: 0.6, roughness: 0.5 }), 0, 1.9, 0); const ring = glow(0x7fd6ff, 1.4);
    for (const r of [[Math.PI / 2, 0, 0], [0.5, 0, 0.5], [1.2, 0.6, 0]]) add(g, new THREE.TorusGeometry(1.05, 0.02, 6, 40), ring, 0, 1.9, 0, r); cyl(g, 0.3, 0.42, 0.9, mat(0x2a3440), 0, 0.45, 0);
    g.userData.spin = (o, t) => { o.children[0].rotation.y = t * 0.3; o.children[2].rotation.z = t * 0.4; o.children[3].rotation.y = t * 0.5; }; },
  chips(g) { const chip = new THREE.Group(); chip.position.y = 1.9; g.add(chip); box(chip, 1.3, 0.14, 1.3, mat(0x15202b, { roughness: 0.35 }), 0, 0, 0); box(chip, 0.7, 0.03, 0.7, glow(0x39c6ff, 1.6), 0, 0.09, 0);
    const pin = mat(0xd9b450, { metalness: 0.9, roughness: 0.25 }); for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) { box(chip, 0.09, 0.05, 0.22, pin, i * 0.24, -0.02, s * 0.74); box(chip, 0.22, 0.05, 0.09, pin, s * 0.74, -0.02, i * 0.24); }
    g.userData.spin = (_, t) => { chip.rotation.set(0.5 + Math.sin(t * 0.7) * 0.15, t * 0.5, 0); chip.position.y = 1.9 + Math.sin(t) * 0.1; }; },
  gears(g) { const m = mat(0xd98b2b, { metalness: 0.6, roughness: 0.4 }); const gear = (r, x, y) => { const q = new THREE.Group(); q.position.set(x, y, 0); g.add(q); cyl(q, r, r, 0.16, m, 0, 0, 0, [Math.PI / 2, 0, 0], 20); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(q, 0.2, 0.2, 0.16, m, Math.cos(a) * (r + 0.06), Math.sin(a) * (r + 0.06), 0, [0, 0, a]); } return q; };
    const a = gear(0.62, -0.5, 1.5), b = gear(0.42, 0.56, 2.05), c = gear(0.3, 0.75, 1.15); g.userData.spin = (_, t) => { a.rotation.z = t * 0.6; b.rotation.z = -t * 0.9 + 0.2; c.rotation.z = -t * 1.25; }; },
  school(g) { const wall = mat(0xe8dcc4), roof = mat(0x8a3324), dark = mat(0x23303d); box(g, 2.2, 1.3, 1.3, wall, 0, 0.65, 0); add(g, new THREE.CylinderGeometry(0.02, 1.35, 0.7, 4), roof, 0, 1.65, 0, [0, Math.PI / 4, 0]).scale.set(1, 1, 0.62);
    for (const x of [-0.7, 0.7]) box(g, 0.4, 0.45, 0.04, dark, x, 0.75, 0.66); box(g, 0.42, 0.75, 0.04, dark, 0, 0.38, 0.66); cyl(g, 0.02, 0.02, 1.2, dark, 0.95, 1.9, 0.4); box(g, 0.4, 0.24, 0.02, mat(0xc5192d), 1.16, 2.36, 0.4);
    box(g, 1.5, 0.3, 0.05, mat(0xf5f1e6), 0, 1.02, 0.7); const cross = glow(0xff5a4d, 1.3); box(g, 1.7, 0.09, 0.06, cross, 0, 0.7, 0.74, [0, 0, 0.6]); box(g, 1.7, 0.09, 0.06, cross, 0, 0.7, 0.74, [0, 0, -0.6]); },
  desks(g) { const top = mat(0x8a6a48), leg = mat(0x2d343c); for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const x = (c - 1) * 0.85, z = r * 0.8 - 0.3; box(g, 0.6, 0.05, 0.42, top, x, 0.62, z); for (const [dx, dz] of [[-0.26, -0.17], [0.26, -0.17], [-0.26, 0.17], [0.26, 0.17]]) box(g, 0.04, 0.6, 0.04, leg, x + dx, 0.3, z + dz); box(g, 0.34, 0.04, 0.3, leg, x, 0.38, z + 0.4); box(g, 0.34, 0.4, 0.04, leg, x, 0.6, z + 0.56); } },
  exam(g) { const sheet = mat(0xf6f3ea, { side: THREE.DoubleSide }), red = glow(0xff4d4d, 1.4); const sheets = []; for (let i = 0; i < 7; i++) { const s = add(g, new THREE.PlaneGeometry(0.5, 0.68), sheet, (i % 3 - 1) * 0.7, 1.2 + (i * 0.37) % 1.6, (i % 2) * 0.4 - 0.2, [0.2, i, 0.3]); box(s, 0.3, 0.03, 0.005, red, 0, 0.2, 0.01); box(s, 0.3, 0.03, 0.005, mat(0x9aa3ab), 0, 0.05, 0.01); box(s, 0.3, 0.03, 0.005, mat(0x9aa3ab), 0, -0.08, 0.01); sheets.push(s); }
    g.userData.spin = (_, t) => sheets.forEach((s, i) => { s.rotation.y = t * 0.5 + i; s.position.y = 1.2 + ((i * 0.37 + t * 0.12) % 1.6); }); },
  towers(g) { const m = mat(0x2c3e50, { emissive: 0xffd08a, emissiveIntensity: 0.55 }); [[-0.7, 2.6], [0, 3.3], [0.7, 2.2], [0.3, 1.5]].forEach(([x, h], i) => box(g, 0.55, h, 0.55, m, x, h / 2, i === 3 ? 0.6 : 0)); box(g, 0.9, 0.5, 0.05, glow(0x7fd6ff, 1.5), 0, 3.0, 0.3); },
  hut(g) { box(g, 1.4, 0.9, 1.1, mat(0x6f6658), 0, 0.45, 0); add(g, new THREE.CylinderGeometry(0.02, 1.0, 0.5, 4), mat(0x4a3b30), 0, 1.15, 0, [0, Math.PI / 4, 0]); box(g, 0.28, 0.3, 0.04, glow(0xffb060, 0.5), -0.3, 0.5, 0.56); cyl(g, 0.03, 0.03, 1.6, mat(0x3a3a3a), 1.1, 0.8, 0.2); },
  graduates(g) { const cap = mat(0x16202c), gold = glow(0xffc54d, 1.5); const caps = []; for (let i = 0; i < 5; i++) { const q = new THREE.Group(); q.position.set((i - 2) * 0.55, 1.6, (i % 2) * 0.3); g.add(q); cyl(q, 0.2, 0.22, 0.16, cap, 0, 0, 0); box(q, 0.56, 0.03, 0.56, cap, 0, 0.1, 0, [0, 0.6, 0]); cyl(q, 0.012, 0.012, 0.3, gold, 0.22, -0.02, 0.1); caps.push(q); }
    g.userData.spin = (_, t) => caps.forEach((q, i) => { q.position.y = 1.7 + Math.abs(Math.sin(t * 1.4 + i * 0.9)) * 0.9; q.rotation.z = Math.sin(t * 2 + i) * 0.25; }); },
  blocks(g) { [[0xff6b5c, -0.5, 0.25, 0], [0x5fc79b, 0.1, 0.25, 0.05], [0x4aa8ff, 0.7, 0.25, 0], [0xffc54d, -0.2, 0.75, 0.02], [0xc98bff, 0.4, 0.75, 0.03], [0xff8fb8, 0.1, 1.25, 0.02]].forEach(([c, x, y, r]) => box(g, 0.5, 0.5, 0.5, mat(c, { emissive: c, emissiveIntensity: 0.18 }), x, y, 0, [0, r * 8, r])); },
  bars(g) { const hs = [0.7, 1.1, 1.5, 2.0, 2.6]; const bars = hs.map((h, i) => box(g, 0.34, 1, 0.34, glow(i === 4 ? 0x5fc79b : 0x4aa8ff, i === 4 ? 1.5 : 0.8), (i - 2) * 0.48, 0.5, 0)); box(g, 2.6, 0.05, 0.6, mat(0x2a3440), 0, 0.02, 0);
    g.userData.spin = (o, t) => bars.forEach((b, i) => { const k = Math.min(1, Math.max(0.05, (o.userData.k || 0) * 1.4 - i * 0.08)); const h = hs[i] * k * (1 + Math.sin(t * 1.5 + i) * 0.03); b.scale.y = h; b.position.y = h / 2; }); },
  tablets(g) { const body = mat(0x10161d, { roughness: 0.3 }); const tabs = []; for (let i = 0; i < 5; i++) { const q = new THREE.Group(); g.add(q); box(q, 0.62, 0.86, 0.04, body, 0, 0, 0); box(q, 0.54, 0.74, 0.01, glow([0x39c6ff, 0x5fc79b, 0xffc54d, 0x7f9cff, 0x39c6ff][i], 1.5), 0, 0.02, 0.026); tabs.push(q); }
    g.userData.spin = (_, t) => tabs.forEach((q, i) => { const a = t * 0.35 + i * (Math.PI * 2 / 5); q.position.set(Math.cos(a) * 1.25, 1.9 + Math.sin(t * 0.9 + i) * 0.25, Math.sin(a) * 0.7); q.rotation.y = -a + Math.PI / 2; }); },
  turbine(g) { const w = mat(0xf2f2ee); cyl(g, 0.06, 0.1, 2.8, w, 0, 1.4, 0); box(g, 0.22, 0.2, 0.36, w, 0, 2.85, 0); const hub = new THREE.Group(); hub.position.set(0, 2.85, 0.22); g.add(hub); for (let k = 0; k < 3; k++) { const b = new THREE.Group(); b.rotation.z = k * 2.094; hub.add(b); box(b, 0.12, 1.25, 0.03, w, 0, 0.62, 0); }
    add(g, new THREE.SphereGeometry(0.14, 10, 8), glow(0x5fc79b, 1.8), 0.6, 0.3, 0.2); g.userData.spin = (_, t) => { hub.rotation.z = t * 1.6; }; },
  bar30(g) { const on = glow(0xff4f9a, 1.7), off = mat(0x39424d, { emissive: 0x39424d, emissiveIntensity: 0.25 }); for (let i = 0; i < 10; i++) { const q = new THREE.Group(); q.position.set((i - 4.5) * 0.3, 0, 0); g.add(q); cyl(q, 0.09, 0.11, 1.0, i < 3 ? on : off, 0, 0.6, 0, undefined, 10); add(q, new THREE.SphereGeometry(0.13, 10, 8), i < 3 ? on : off, 0, 1.28, 0); }
    box(g, 3.2, 0.05, 0.5, mat(0x2a3440), 0, 0.05, 0); box(g, 0.9, 0.06, 0.06, on, -1.05, 1.7, 0); },
  lanterns(g) { const m = glow(0xffcf7a, 2.0); const ls = []; for (let i = 0; i < 16; i++) { const q = add(g, new THREE.SphereGeometry(0.1 + (i % 3) * 0.03, 10, 8), m, ((i * 7) % 16 - 8) * 0.9, 0, ((i * 5) % 7 - 3) * 0.5); ls.push(q); }
    g.userData.spin = (o, t) => ls.forEach((q, i) => { q.position.y = 0.6 + ((t * (0.35 + (i % 4) * 0.08) + i * 0.6) % 6.5); q.position.x += Math.sin(t + i) * 0.002; }); },
};
// name → [builder, anchor, options]
const PLACE = { question: ["question", "L"], scale: ["scale", "R"], scaleLevel: ["scale", "R", { level: true }], book: ["book", "L"], globe: ["globe", "R"], chips: ["chips", "L"], gears: ["gears", "R"],
  school: ["school", "L"], desks: ["desks", "RF"], exam: ["exam", "R"], towers: ["towers", "L"], hut: ["hut", "R"], graduates: ["graduates", "L"], blocks: ["blocks", "RF"], bars: ["bars", "R"],
  tablets: ["tablets", "UP"], turbine: ["turbine", "R"], bar30: ["bar30", "LF"], lanterns: ["lanterns", "UP"] };

// The set modelled in Blender (scripts/blender/sdg4_theater.py): proscenium, velvet curtains, lattice truss with PAR
// lamps, speakers, steps. Its ambient occlusion is baked into vertex colours. Its origin is the game point (27, 0, 5).
// If the file cannot be loaded the stage still works with the pieces built below.
export function loadTheater(manager) {
  return new Promise(res => {
    new GLTFLoader(manager).load("assets/sdg4/theater.glb", g => {
      const o = g.scene; o.position.set(27, 0, 5);
      o.traverse(m => { if (m.isMesh) { m.castShadow = !!quality.high; m.receiveShadow = true; if (m.material && m.material.name === "velvet") m.material.side = THREE.DoubleSide; } });
      // harbor.js hangs three plain cone lamps on the truss: the Blender lamps replace them
      scene.traverse(m => { if (m.isMesh && m.geometry.type === "ConeGeometry" && Math.abs(m.position.y - 9.6) < 0.02 && Math.abs(m.position.z - 2.5) < 0.02) m.visible = false; });
      scene.add(o); stage.theater = o; res(true);
    }, undefined, () => res(false));
  });
}

export function initStage() {
  if (stage.ready) return stage;
  setMood("best");                                   // blue hour: the lamps are on, the sky still has colour
  // ── lights ──
  const spot = (color, intensity, pos, at, angle, pen = 0.7) => { const l = new THREE.SpotLight(color, intensity, 40, angle, pen, 1.6); l.position.set(...pos); l.target.position.set(...at); scene.add(l, l.target); return l; };
  const L = stage.lights;
  L.key = spot(0xffd9a8, 260, [21.2, 9.4, 11.5], [27, 1.9, 5.4], 0.42);
  L.rim = spot(0xffe2b8, 380, [29.8, 9.6, 2.6], [27, 2.2, 5.6], 0.5, 0.6);
  L.fill = spot(0x9fc4ff, 70, [33.8, 6.2, 11.2], [27, 1.8, 5.4], 0.6);
  L.washL = spot(0xffb060, 90, [22, 9.5, 2.9], [21.5, 0.9, 5.2], 0.62, 0.9);
  L.washR = spot(0xffb060, 90, [32, 9.5, 2.9], [32.5, 0.9, 5.2], 0.62, 0.9);
  // ── beams from the truss lamps (x 22 / 27 / 32) and two from the wings ──
  const B = (fx, fy, fz, tx, ty, tz, r, c) => stage.beams.push(beam(new THREE.Vector3(fx, fy, fz), new THREE.Vector3(tx, ty, tz), r, c));
  B(27, 9.5, 2.7, 27, 0.9, 5.6, 2.1, 0xffe9c8); B(22, 9.5, 2.7, 21.5, 0.9, 5.4, 2.4, 0xffb060); B(32, 9.5, 2.7, 32.5, 0.9, 5.4, 2.4, 0xffb060);
  B(18.2, 8.6, 3.2, 25.5, 0.9, 6.8, 1.8, 0xbcd8ff); B(35.8, 8.6, 3.2, 28.5, 0.9, 6.8, 1.8, 0xbcd8ff);
  // ── dust ──
  const dust = []; for (let i = 0; i < 520; i++) dust.push(19 + Math.random() * 16, 1.2 + Math.random() * 8.2, 2.6 + Math.random() * 6.4);
  stage.dust = points(dust, { size: 46, color: 0xfff0d2, opacity: 0.55, drift: 1 });
  // ── the set ──
  const set = new THREE.Group(); scene.add(set); stage.set = set;
  const wood = mat(0x3b2a1e, { roughness: 0.55 }), dark = mat(0x161b21, { roughness: 0.5 });
  const lect = new THREE.Group(); lect.position.set(30.4, STAGE_Y, 6.3); lect.rotation.y = -0.35; set.add(lect);     // lectern, stage left of the speaker
  box(lect, 0.7, 1.05, 0.5, wood, 0, 0.52, 0); box(lect, 0.82, 0.05, 0.6, wood, 0, 1.1, 0.02, [-0.28, 0, 0]); cyl(lect, 0.012, 0.012, 0.36, dark, 0.2, 1.3, 0.1, [0.5, 0, 0]); add(lect, new THREE.SphereGeometry(0.035, 8, 6), glow(0x5fc79b, 2), 0.2, 1.46, 0.19);
  box(lect, 0.5, 0.3, 0.02, glow(0xc5192d, 0.7), 0, 0.62, 0.262);
  const bt = bannerTex(); for (const x of [17.0, 37.0]) { add(set, new THREE.PlaneGeometry(1.5, 5.2), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.22 }), x, G + 4.3, 2.7); if (!stage.theater) cyl(set, 0.04, 0.04, 6.4, dark, x - 0.82, G + 3.5, 2.66); box(set, 1.7, 0.06, 0.06, dark, x, G + 6.95, 2.72); }
  const leaf = mat(0x2f6b3c, { roughness: 0.9 }), pot = mat(0x8f5a3c);
  for (const [x, z] of [[18.6, 7.4], [35.4, 7.4]]) { cyl(set, 0.3, 0.22, 0.5, pot, x, STAGE_Y + 0.25, z); for (let i = 0; i < 5; i++) add(set, new THREE.IcosahedronGeometry(0.3 + (i % 2) * 0.1, 0), leaf, x + Math.cos(i * 1.3) * 0.2, STAGE_Y + 0.75 + i * 0.16, z + Math.sin(i * 1.3) * 0.2); }
  const led = () => { const m = glow(0xffb060, 1.5); stage.led.push(m); return m; };
  box(set, 17.7, 0.07, 0.07, led(), 27, STAGE_Y - 0.12, 8.03); for (const x of [18.02, 35.98]) box(set, 0.07, 0.07, 5.9, led(), x, STAGE_Y - 0.12, 5);        // along the stage edge
  const trim = led(); box(set, 12.7, 0.06, 0.06, trim, 27, G + 8.5, 2.3); box(set, 12.7, 0.06, 0.06, trim, 27, G + 1.1, 2.3); for (const x of [20.65, 33.35]) box(set, 0.06, 7.4, 0.06, trim, x, G + 4.8, 2.3);       // around the screen
  for (let i = 0; i < 7; i++) { const x = 20 + i * 2.33; cyl(set, 0.12, 0.14, 0.14, dark, x, STAGE_Y + 0.07, 7.7); cyl(set, 0.09, 0.09, 0.02, glow(0xfff0d0, 1.6), x, STAGE_Y + 0.15, 7.7); }          // footlights
  stage.pool = add(set, new THREE.CircleGeometry(1.9, 32), new THREE.MeshBasicMaterial({ map: poolTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }), SPEAKER.x, STAGE_Y + 0.012, SPEAKER.z, [-Math.PI / 2, 0, 0]);
  // ── a crowd that fills the tiers: two instanced meshes (bodies, heads), dark so the lit actors in front read.
  //    The camera sees them from behind, so the heads are hair-coloured, not faces. ──
  const seats = []; for (let r = 0; r < 4; r++) for (let x = 16.2; x <= 37.8; x += 0.95) if (Math.random() > 0.2) seats.push([x + (Math.random() - 0.5) * 0.3, G + 0.5 * (r + 1), 9.75 + r * 1.8 + (Math.random() - 0.5) * 0.3]);
  const tones = [0x2a3442, 0x3a2f3a, 0x25343a, 0x403a30, 0x2f3b4d];
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.5, 3, 8), mat(0xffffff, { roughness: 0.9 }), seats.length), heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xffffff, { roughness: 0.95 }), seats.length);
  const m4 = new THREE.Matrix4(); seats.forEach(([x, y, z], i) => { const h = 0.55 + Math.random() * 0.12; m4.makeTranslation(x, y + h, z); bodies.setMatrixAt(i, m4); bodies.setColorAt(i, C(tones[i % tones.length])); m4.makeTranslation(x, y + h + 0.62, z + 0.02); heads.setMatrixAt(i, m4); heads.setColorAt(i, C([0x1c1714, 0x2a211b, 0x14110f, 0x33271f][i % 4])); });
  scene.add(bodies, heads); stage.crowd = [bodies, heads]; stage.seats = seats;
  // ── phone lights (off until a slide asks) ──
  const ph = []; seats.forEach(([x, y, z], i) => { if (i % 2 === 0) ph.push(x + 0.18, y + 1.05, z - 0.1); });
  stage.phones = points(ph, { size: 60, color: 0xfff2d0, opacity: 0, drift: 0.12 });
  // ── the story's props ──
  for (const [name, [builder, anchor, opt]] of Object.entries(PLACE)) {
    const g = new THREE.Group(); SETS[builder](g, opt); g.position.set(...ANCHOR[anchor]); if (anchor === "L" || anchor === "LF") g.rotation.y = 0.35; if (anchor === "R" || anchor === "RF") g.rotation.y = -0.35;
    g.userData.k = 0; g.userData.base = g.position.clone(); g.visible = false; scene.add(g); stage.sets[name] = g;
  }
  onTier(applyTier);
  addUpdate(update);
  stage.ready = true;
  return stage;
}

// What each tier pays for (post.js steps the tier down when the frame rate is low).
function applyTier(t) {
  const L = stage.lights; if (!L.key) return;
  // The harbor's sun shadow covers the whole map and is the most expensive pass: only tier 3 keeps it (the stage
  // is lit by its own spots, and the Blender set has its shadows baked in).
  if (renderer.shadowMap.enabled !== (t >= 3 && !!quality.high)) { renderer.shadowMap.enabled = t >= 3 && !!quality.high; sunLight.castShadow = renderer.shadowMap.enabled; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
  L.fill.visible = L.washL.visible = L.washR.visible = t >= 2;                // 5 spot lights on tiers 2–3, 2 below
  stage.beams.forEach((b, i) => { b.visible = t >= 3 ? true : t === 2 ? i < 3 : t === 1 ? i < 1 : false; });
  stage.dust.visible = t >= 2; stage.dust.geometry.setDrawRange(0, t >= 3 ? 520 : 260);
  stage.phones.visible = t >= 1;
  if (stage.crowd) stage.crowd.forEach(m => { m.count = t === 0 ? Math.floor(stage.seats.length / 2) : stage.seats.length; });
}

export function bindCast({ player, audience }) { stage.player = player; stage.audience = audience || []; }

const tmp = new THREE.Vector3(), fogC = { near: 160, far: 900 };
function update(dt, t) {
  const k = 1 - Math.exp(-dt * 2.2), L = stage.lights;
  for (const n of ["key", "fill", "rim", "washL", "washR"]) { L[n].color.lerp(want[n][0], k); L[n].intensity += (want[n][1] - L[n].intensity) * k; }
  for (const m of stage.led) m.emissive.lerp(want.led, k);
  hemi.intensity += (want.hemi - hemi.intensity) * k;
  stage.beams.forEach((b, i) => { const u = b.material.uniforms; u.uTime.value = t; u.uOpacity.value += (want.beam * (i === 0 ? 1 : 0.75) - u.uOpacity.value) * k; if (i === 1) u.uColor.value.lerp(want.washL[0], k); if (i === 2) u.uColor.value.lerp(want.washR[0], k); });
  stage.dust.material.uniforms.uTime.value = t; stage.dust.material.uniforms.uOpacity.value = 0.25 + want.beam * 0.55;
  const pu = stage.phones.material.uniforms; pu.uTime.value = t; pu.uOpacity.value += (want.phones - pu.uOpacity.value) * k;
  stage.pool.material.opacity += ((0.25 + want.beam * 0.5) - stage.pool.material.opacity) * k;
  // fog closes in for the heavy slides (0 = clear evening, 1 = thick)
  const near = 150 - want.fog * 125, far = 820 - want.fog * 640; fogC.near += (near - fogC.near) * k; fogC.far += (far - fogC.far) * k;
  if (scene.fog) { scene.fog.near = fogC.near; scene.fog.far = fogC.far; }
  gradeTo(want.grade, k);
  for (const [name, g] of Object.entries(stage.sets)) {
    const target = want.props.has(name) ? 1 : 0; g.userData.k += (target - g.userData.k) * (1 - Math.exp(-dt * 3));
    const q = g.userData.k; g.visible = q > 0.02; if (!g.visible) continue;
    const e = q * q * (3 - 2 * q); g.scale.setScalar(0.2 + 0.8 * e); g.position.y = g.userData.base.y - (1 - e) * 0.8;
    g.userData.spin?.(g, t);
  }
  if (stage.player) setFocus(camera.position.distanceTo(stage.player.headWorld(tmp)));
  moveCamera(dt);
}

// ── camera ──
// One move per slide: from `a` to `b`, eased over the slide's seconds. `depth` (0..1, how far into the part we are)
// starts the move closer, so a part reads as one slow approach that resets when the next part begins.
const MOVES = {
  wide: { a: [[27, 6.7, 21.0], [27, -0.4, 4]], b: [[27, 5.9, 17.6], [27, -0.1, 4]] },
  side: { a: [[16.6, 2.6, 7.8], [27, 0.4, 5.2]], b: [[18.6, 2.3, 6.3], [27, 0.6, 5.2]] },
  sideR: { a: [[37.2, 2.8, 7.9], [26, 0.4, 4.6]], b: [[35.6, 2.4, 6.6], [26, 0.6, 4.7]] },
  push: { a: [[27.9, 4.9, 15.0], [27, 1.3, 5.2]], b: [[27.5, 4.4, 12.6], [27, 1.45, 5.2]] },     // above the audience's heads (the tiers rise to y 2.6), wide enough for the props on both sides
  low: { a: [[24.6, 1.25, 9.0], [27.4, 2.5, 4.0]], b: [[25.4, 1.2, 8.3], [27.3, 2.7, 4.0]] },
};
const cam = { move: null, t: 0, dur: 1 };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
function moveCamera(dt) {
  const m = cam.move; if (!m) return;
  cam.t = Math.min(cam.dur, cam.t + dt);
  const k = REDUCED ? 0 : (x => x * x * (3 - 2 * x))(cam.t / cam.dur);
  shot(lerp3(m.from[0], m.to[0], k), lerp3(m.from[1], m.to[1], k), { k: 2.2 });
}
export function slideCamera(style, seconds, depth = 0) {
  const mv = MOVES[style] || MOVES.wide, d = Math.min(0.6, depth * 0.6);
  cam.move = { from: [lerp3(mv.a[0], mv.b[0], d), lerp3(mv.a[1], mv.b[1], d)], to: [lerp3(mv.a[0], mv.b[0], Math.min(1, d + 0.55)), lerp3(mv.a[1], mv.b[1], Math.min(1, d + 0.55))] };
  cam.t = 0; cam.dur = Math.max(1, seconds);
  shot(cam.move.from[0], cam.move.from[1], { cut: true, k: 2.2 });
}
export const holdCamera = () => { cam.move = null; };       // the caller takes the camera (the result on the big screen, a dialogue)

// The crane into the theater: over the water behind the back row, down the aisle, to the stage.
export function entrance() {
  cam.move = null;
  if (REDUCED) { shot([27, 5.2, 17.5], [27, 2.4, 4], { instant: true }); return Promise.resolve(); }
  shot([27, 15, 40], [27, 4, 4], { instant: true });
  return fly([{ pos: [24.5, 9.5, 27], look: [27, 3.2, 4.5], t: 2.6 }, { pos: [27, 5.2, 17.5], look: [27, 2.4, 4], t: 2.4 }]);
}
// The ending: the lights come up and the camera lifts away from the stage.
export function finale() {
  cam.move = null; preset("rise"); want.phones = 1; want.fog = 0.15; want.props = new Set(["lanterns"]);
  if (REDUCED) { shot([27, 5.2, 17.5], [27, 2.4, 4]); return Promise.resolve(); }
  return fly([{ pos: [27, 5.4, 17.0], look: [27, 2.4, 4], t: 0.9 }, { pos: [27, 10.5, 29], look: [27, 3.0, 5], t: 5.5 }]);
}

// A part begins: neutral warm light, nothing on stage, the wide shot.
export function partCue() { preset("warm"); want.fog = 0.25; want.phones = 0; want.props = new Set(); cam.move = null; shot([27, 6.4, 19.5], [27, -0.4, 4]); }
// A slide begins. cue: talk.js's `cue` for that slide; seconds: how long the slide lasts; depth: 0..1 through the part.
export function cue(c, seconds, depth) {
  c = c || {};
  preset(c.light); want.fog = typeof c.fog === "number" ? c.fog : 0.25; want.phones = c.light === "rise" ? 1 : 0;
  want.props = new Set((c.props || []).filter(p => stage.sets[p]));
  slideCamera(c.cam, seconds, depth);
}
// Before the talk (pier, walk, backstage): the theater waits in a calm warm light.
export function rest() { preset("warm"); want.fog = 0.2; want.phones = 0; want.props = new Set(); cam.move = null; }
export const stageInfo = () => ({ tier: cinema.tier, steps: cinema.steps, lights: Object.values(stage.lights).filter(l => l.visible).length, beams: stage.beams.filter(b => b.visible).length, props: [...want.props] });
