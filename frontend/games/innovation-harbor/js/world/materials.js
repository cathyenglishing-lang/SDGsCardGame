// Procedural textures and shared PBR materials for the harbor.
import * as THREE from "three";

function tex(draw, w = 256, h = 256, repeat = [1, 1], srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(g, w, h, base, amp, n = 4000) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.floor(Math.random() * amp); g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
}

export const T = {
  concrete: tex((g, w, h) => { noise(g, w, h, "#8d8f8c", 255, 6000); g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 2; for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }, 256, 256, [8, 8]),
  concreteLand: tex((g, w, h) => { noise(g, w, h, "#8d8f8c", 255, 6000); g.strokeStyle = "rgba(0,0,0,.14)"; g.lineWidth = 2; for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }, 256, 256, [64, 40]),
  asphalt: tex((g, w, h) => { noise(g, w, h, "#3a3d41", 120, 7000); }, 256, 256, [40, 2]),
  roadLine: tex((g, w, h) => { g.fillStyle = "rgba(0,0,0,0)"; g.clearRect(0, 0, w, h); g.fillStyle = "#e9e4c8"; g.fillRect(0, h / 2 - 3, w * 0.55, 6); }, 256, 32, [20, 1]),
  paving: tex((g, w, h) => { noise(g, w, h, "#a7a39c", 200, 3000); g.strokeStyle = "rgba(40,40,40,.35)"; g.lineWidth = 2; for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }, 256, 256, [16, 16]),
  brick: tex((g, w, h) => { g.fillStyle = "#6e2f24"; g.fillRect(0, 0, w, h); const bw = 32, bh = 14; for (let y = 0, r = 0; y < h; y += bh + 2, r++) { for (let x = -(r % 2) * bw / 2; x < w; x += bw + 2) { const s = 150 + Math.random() * 60; g.fillStyle = `rgb(${s},${s * .42 | 0},${s * .32 | 0})`; g.fillRect(x, y, bw, bh); } } g.fillStyle = "rgba(230,220,200,.35)"; for (let y = bh; y < h; y += bh + 2) g.fillRect(0, y, w, 2); }, 256, 256, [6, 4]),
  corrugated: tex((g, w, h) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = `rgba(0,0,0,${(x / 8) % 2 ? .18 : .04})`; g.fillRect(x, 0, 8, h); } for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,40,10,${Math.random() * .35})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 30, Math.random() * 6); } }, 256, 128, [1, 1]),
  steel: tex((g, w, h) => { noise(g, w, h, "#9ea4ab", 255, 2500); }, 128, 128, [2, 2]),
  wood: tex((g, w, h) => { g.fillStyle = "#6b4a32"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = `rgb(${95 + Math.random() * 30},${65 + Math.random() * 20},${40 + Math.random() * 15})`; g.fillRect(0, y, w, 15); } }, 256, 256, [4, 4]),
  windows: (cols, rows, lit = 0.55, hue = "#ffd59a") => tex((g, w, h) => {
    g.fillStyle = "#101a26"; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = Math.random() < lit; g.fillStyle = on ? (Math.random() < .3 ? "#fff3d6" : hue) : "#1b2a3a";
      g.fillRect(c * cw + cw * .15, r * ch + ch * .2, cw * .7, ch * .6);
    }
  }, 256, 512, [1, 1]),
  screenGlow: tex((g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#0b2a44"); gr.addColorStop(1, "#143d5c"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 64, 64),
  stripes: (a, b) => tex((g, w, h) => { for (let y = 0; y < h; y += 32) { g.fillStyle = (y / 32) % 2 ? a : b; g.fillRect(0, y, w, 32); } }, 64, 256, [1, 1]),
  lab: tex((g, w, h) => { g.fillStyle = "#0b1a2a"; g.fillRect(0, 0, w, h); g.fillStyle = "#1fc1d6"; g.fillRect(40, 40, 200, 8); g.font = "bold 44px sans-serif"; g.fillStyle = "#e8f6ff"; g.fillText("HARBOR-AI", 40, 110); g.font = "28px sans-serif"; g.fillStyle = "#9bd7e6"; g.fillText("Port assessment report", 40, 160); g.font = "bold 72px sans-serif"; g.fillStyle = "#6ff0a8"; g.fillText("99%", 40, 260); g.font = "24px sans-serif"; g.fillStyle = "#cde"; g.fillText("safety score · 12 references cited", 40, 300); g.fillStyle = "#2a5d7a"; for (let i = 0; i < 6; i++) g.fillRect(40, 340 + i * 26, 100 + Math.random() * 300, 10); }, 512, 512),
};

const std = (o) => new THREE.MeshStandardMaterial(o);
export const M = {
  concrete: std({ map: T.concreteLand, roughness: .95, color: 0xb9b7b0 }),
  quay: std({ map: T.steel, roughness: .9, color: 0x6f6c66 }),
  asphalt: std({ map: T.asphalt, roughness: .98, color: 0x8a8d92 }),
  paving: std({ map: T.paving, roughness: .9, color: 0xc4bfb6 }),
  brick: std({ map: T.brick, roughness: .9 }),
  stone: std({ map: T.concrete, roughness: .85, color: 0xd9d2c3 }),
  steel: std({ map: T.steel, roughness: .45, metalness: .75, color: 0xcfd4d8 }),
  steelDark: std({ roughness: .5, metalness: .8, color: 0x2e3338 }),
  rust: std({ map: T.steel, roughness: .8, metalness: .4, color: 0x8a5a3c }),
  white: std({ roughness: .6, color: 0xe9e6dd }),
  black: std({ roughness: .9, color: 0x15171a }),
  rubber: std({ roughness: 1, color: 0x0d0f11 }),
  wood: std({ map: T.wood, roughness: .85 }),
  glass: std({ color: 0x5a86a8, roughness: .08, metalness: .9, envMapIntensity: 1.4 }),
  hullDark: std({ roughness: .55, metalness: .5, color: 0x1e2d3f }),
  hullRed: std({ roughness: .6, metalness: .4, color: 0x8a2f24 }),
  hullWhite: std({ roughness: .4, metalness: .3, color: 0xe6e8ea }),
  sail: new THREE.MeshStandardMaterial({ roughness: .9, color: 0xf2efe6, side: THREE.DoubleSide }),
  leaf: std({ roughness: .9, color: 0x2f5f33 }),
  leaf2: std({ roughness: .9, color: 0x3d7a3a }),
  trunk: std({ roughness: .95, color: 0x4a3426 }),
  crane: std({ roughness: .55, metalness: .6, color: 0x3d7fb8 }),
  craneRed: std({ roughness: .55, metalness: .6, color: 0xb8402f }),
  yellow: std({ roughness: .5, metalness: .5, color: 0xe0a33a }),
  cyan: std({ roughness: .3, metalness: .2, color: 0x1fc1d6, emissive: 0x1fc1d6, emissiveIntensity: .8 }),
  orange: std({ roughness: .4, metalness: .3, color: 0xfd6925, emissive: 0xfd6925, emissiveIntensity: .9 }),
  navRed: std({ color: 0x441010, emissive: 0xff2a1a, emissiveIntensity: 1.5 }),
  navGreen: std({ color: 0x0f3d1a, emissive: 0x2dff6a, emissiveIntensity: 1.5 }),
  warm: () => std({ color: 0x2a2a2a, emissive: 0xffd59a, emissiveIntensity: 1.2 }),
  screen: (map) => new THREE.MeshBasicMaterial({ map }),
  container: (color) => std({ map: T.corrugated, color, roughness: .7, metalness: .35 }),
  windows: (cols, rows, lit, hue) => { const w = T.windows(cols, rows, lit, hue); return std({ map: w, emissiveMap: w, emissive: 0xffffff, emissiveIntensity: .9, roughness: .25, metalness: .6 }); },
  paint: (color, rough = .6, metal = .2) => std({ color, roughness: rough, metalness: metal }),
};
export const CONTAINER_COLORS = [0x1f5b8e, 0xa83c2b, 0x2f6b3c, 0xd0742b, 0x7a7f84, 0xc9a227, 0x5a3a7a];
