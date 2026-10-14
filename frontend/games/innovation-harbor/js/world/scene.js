// Renderer, camera, sky, sun, water, fog, label renderer and the frame loop.
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

const params = new URLSearchParams(location.search);
const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
export const quality = {
  high: params.get("q") ? params.get("q") === "high" : !(mobile || (navigator.hardwareConcurrency || 4) <= 4),
  mobile,
};
const SPEED = Math.max(0.1, parseFloat(params.get("speed")) || 1); // dev aid: ?speed=4 runs the simulation faster
quality.crowd = quality.high ? 8 : 3;
quality.audience = quality.high ? 10 : 6;
quality.gulls = quality.high ? 7 : 3;

export const manager = new THREE.LoadingManager();
export const canvas = document.getElementById("scene");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.high ? 2 : 1.25));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = quality.high;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.2, 2500);
camera.position.set(0, 12, -40);
export const labelRenderer = new CSS2DRenderer({ element: document.getElementById("labels") });
export const clock = new THREE.Clock();

// ── sky & sun ──
export const sky = new Sky();
sky.scale.setScalar(4000);
scene.add(sky);
export const sunDir = new THREE.Vector3(0, 1, 0);
export const sunLight = new THREE.DirectionalLight(0xffd6b0, 3.2);
sunLight.castShadow = quality.high;
if (quality.high) {
  sunLight.shadow.mapSize.set(2048, 2048);
  const c = sunLight.shadow.camera; c.left = -130; c.right = 130; c.top = 150; c.bottom = -110; c.near = 20; c.far = 900;
  sunLight.shadow.bias = -0.0006; sunLight.shadow.normalBias = 0.03;
}
scene.add(sunLight); scene.add(sunLight.target);
export const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30241c, 0.45);
scene.add(hemi);
scene.fog = new THREE.Fog(0x9fb0c4, 150, 900);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
let envRT = null;

export function setSun(elevation, azimuth, o = {}) {
  const u = sky.material.uniforms;
  u.turbidity.value = o.turbidity ?? 6; u.rayleigh.value = o.rayleigh ?? 2.3;
  u.mieCoefficient.value = o.mie ?? 0.006; u.mieDirectionalG.value = o.mieG ?? 0.85;
  const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);
  sunLight.position.copy(sunDir).multiplyScalar(500).add(new THREE.Vector3(0, 0, 40));
  sunLight.target.position.set(0, 0, 40);
  sunLight.intensity = o.sun ?? 3.2; sunLight.color.set(o.sunColor ?? 0xffd6b0);
  hemi.intensity = o.hemi ?? 0.45;
  renderer.toneMappingExposure = o.exposure ?? 0.55;
  if (water.material.uniforms?.sunDirection) water.material.uniforms.sunDirection.value.copy(sunDir).normalize();
  if (envRT) envRT.dispose();
  envScene.add(sky); envRT = pmrem.fromScene(envScene); scene.add(sky);
  scene.environment = envRT.texture;
}

// ── water ──
const waterNormals = new THREE.TextureLoader(manager).load("assets/lib/waternormals.jpg", t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
const waterGeo = new THREE.PlaneGeometry(5000, 5000);
export let water;
if (quality.high) {
  water = new Water(waterGeo, {
    textureWidth: 512, textureHeight: 512, waterNormals,
    sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x0d3a46,
    distortionScale: 3.0, fog: true,
  });
  water.material.uniforms.size.value = 6;
} else {
  waterNormals.repeat.set(260, 260);
  water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x0f3f4d, roughness: 0.22, metalness: 0.4, normalMap: waterNormals, normalScale: new THREE.Vector2(0.5, 0.5) }));
}
water.rotation.x = -Math.PI / 2;
scene.add(water);

// ── lamps (street lights, lighthouse, windows) switch on for the night moods ──
export const lamps = [];
export function registerLamp(mat, intensity = 1.2) { lamps.push({ mat, on: intensity }); mat.emissiveIntensity = 0.15; }
export function lampsOn(on) { for (const l of lamps) l.mat.emissiveIntensity = on ? l.on : 0.15; }

export let mood = "dusk";
export function setMood(name) {
  mood = name;
  const f = scene.fog;
  if (name === "dusk") { setSun(3.5, 248, { turbidity: 7, rayleigh: 3.4, mie: 0.02, mieG: 0.9, exposure: 0.5, sun: 2.8 }); f.color.set(0xb89a8c); f.near = 140; f.far = 850; lampsOn(false); }
  if (name === "best") { setSun(2.2, 250, { turbidity: 4, rayleigh: 3.6, mie: 0.012, exposure: 0.6, sun: 2.4 }); f.color.set(0x8a93b8); f.near = 160; f.far = 900; lampsOn(true); }
  if (name === "dim") { setSun(-0.6, 250, { turbidity: 8, rayleigh: 1.2, mie: 0.004, exposure: 0.3, sun: 0.8, hemi: 0.3 }); f.color.set(0x3a4152); f.near = 110; f.far = 650; lampsOn(true); }
  if (name === "fog") { setSun(4, 250, { turbidity: 20, rayleigh: 0.4, mie: 0.02, mieG: 0.95, exposure: 0.45, sun: 1.1, hemi: 0.5 }); f.color.set(0x9aa3ab); f.near = 12; f.far = 150; lampsOn(true); }
}

// ── loop ──
const updaters = new Set();
export const addUpdate = fn => { updaters.add(fn); return () => updaters.delete(fn); };
export const removeUpdate = fn => updaters.delete(fn);
let running = false;
export function start() {
  if (running) return; running = true;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()) * SPEED, t = clock.elapsedTime * SPEED;
    if (water.material.uniforms?.time) water.material.uniforms.time.value += dt * 0.55;
    else waterNormals.offset.x += dt * 0.004;
    for (const f of updaters) f(dt, t);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });
}
export function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); labelRenderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();
