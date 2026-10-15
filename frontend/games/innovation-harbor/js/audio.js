// Procedural harbor ambience (waves, wind, gulls) and a few sound effects.
// Real recordings replace this in the production build.
let ctx = null, master = null, muted = false, running = false;
const timers = [];

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = muted ? 0 : .6; master.connect(ctx.destination);
  return ctx;
}
function noiseBuffer(sec = 4) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); const d = b.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
  return b;
}
export function startAmbience() {
  if (running) return; ensure(); running = true;
  if (ctx.state === "suspended") ctx.resume();
  // surf: brown noise through a slow-swelling low-pass filter
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
  const g = ctx.createGain(); g.gain.value = .35;
  const lfo = ctx.createOscillator(); lfo.frequency.value = .09; const lg = ctx.createGain(); lg.gain.value = 250;
  lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  src.connect(lp); lp.connect(g); g.connect(master); src.start();
  // wind: band-passed noise
  const w = ctx.createBufferSource(); w.buffer = noiseBuffer(3); w.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = .6;
  const wg = ctx.createGain(); wg.gain.value = .07; w.connect(bp); bp.connect(wg); wg.connect(master); w.start();
  // gulls now and then
  const gullLoop = () => { gull(); timers.push(setTimeout(gullLoop, 4000 + Math.random() * 9000)); };
  timers.push(setTimeout(gullLoop, 2500));
}
export function gull() {
  if (!ctx || muted) return;
  const t = ctx.currentTime; const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = "sawtooth"; const f = 1100 + Math.random() * 500;
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + .12); o.frequency.exponentialRampToValueAtTime(f * .8, t + .35);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + .4);
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2500;
  o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + .45);
}
export function horn(long = false) {
  ensure(); const t = ctx.currentTime; const o = ctx.createOscillator(); const o2 = ctx.createOscillator(); const g = ctx.createGain();
  o.type = "sawtooth"; o.frequency.value = 92; o2.type = "square"; o2.frequency.value = 138;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
  const d = long ? 2.4 : 1.1;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22, t + .15); g.gain.setValueAtTime(.22, t + d - .3); g.gain.linearRampToValueAtTime(0, t + d);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o.start(t); o2.start(t); o.stop(t + d); o2.stop(t + d);
}
// Collision alarm: three rising two-tone bleeps.
export function alarm() {
  ensure(); const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) for (const [f, k] of [[880, 0], [1175, 0.11]]) { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "square"; o.frequency.value = f;
    const s0 = t + i * 0.26 + k; g.gain.setValueAtTime(0, s0); g.gain.linearRampToValueAtTime(.07, s0 + .01); g.gain.setValueAtTime(.07, s0 + .09); g.gain.linearRampToValueAtTime(0, s0 + .11);
    o.connect(g); g.connect(master); o.start(s0); o.stop(s0 + .12); }
}
export function foghorn() { ensure(); horn(true); setTimeout(() => horn(true), 3200); }
// Car horn: short two-tone blast.
export function carHorn(long = false) {
  ensure(); const t = ctx.currentTime, d = long ? 0.7 : 0.32;
  for (const f of [415, 523]) { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "square"; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.09, t + .02); g.gain.setValueAtTime(.09, t + d - .05); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + d); }
}
// Engine hum while driving: pitch follows the throttle fraction (0 = silent).
let eng = null;
export function engine(frac) {
  if (!ctx) return;
  if (!eng) { const o = ctx.createOscillator(); const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600; o.type = "sawtooth"; o.frequency.value = 50; g.gain.value = 0; o.connect(lp); lp.connect(g); g.connect(master); o.start(); eng = { o, g }; }
  eng.o.frequency.setTargetAtTime(45 + frac * 160, ctx.currentTime, 0.1);
  eng.g.gain.setTargetAtTime(frac > 0.02 ? 0.035 + frac * 0.05 : 0, ctx.currentTime, 0.15);
}
export function thud() {
  ensure(); const t = ctx.currentTime; const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine";
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + .25);
  g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.connect(g); g.connect(master); o.start(t); o.stop(t + .32);
}
export function applause(sec = 3) {
  ensure(); const t = ctx.currentTime; const src = ctx.createBufferSource(); src.buffer = noiseBuffer(2); src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3, t + .4); g.gain.setValueAtTime(.3, t + sec - .8); g.gain.linearRampToValueAtTime(0, t + sec);
  // clap texture: amplitude modulate with fast random LFO
  const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = .5;
  lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + sec);
  src.connect(hp); hp.connect(g); g.connect(master); src.start(t); src.stop(t + sec);
}
export function chime(ok = true) {
  ensure(); const t = ctx.currentTime; const notes = ok ? [660, 880, 1320] : [220, 180];
  notes.forEach((f, i) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * .09); g.gain.linearRampToValueAtTime(.12, t + i * .09 + .02); g.gain.exponentialRampToValueAtTime(.001, t + i * .09 + .35);
    o.connect(g); g.connect(master); o.start(t + i * .09); o.stop(t + i * .09 + .4); });
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : .6; }
export const isMuted = () => muted;
