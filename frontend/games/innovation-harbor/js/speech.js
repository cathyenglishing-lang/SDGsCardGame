// Text-to-speech with one voice per character, browser speech recognition,
// and MediaRecorder capture for the "send to teacher" tier.
import { S } from "./state.js";
import { log } from "./telemetry.js";

let voices = [];
function refresh() { voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)); }
if ("speechSynthesis" in window) { refresh(); speechSynthesis.onvoiceschanged = refresh; }

const prefer = (...names) => voices.find(v => names.some(n => v.name.includes(n)));
// Each character gets a different voice when the browser offers several.
export const VOICES = {
  narrator: { pick: () => prefer("Google US English", "Aria", "Jenny") || voices[0], pitch: 1, rate: .95 },
  mei:      { pick: () => prefer("Google UK English Female", "Sonia", "Libby", "Aria") || voices[0], pitch: .95, rate: .92 },
  kai:      { pick: () => prefer("Google US English", "Guy", "Ryan", "Christopher") || voices[1] || voices[0], pitch: 1.1, rate: 1.0 },
  hsu:      { pick: () => prefer("Google UK English Female", "Jenny", "Michelle", "Aria") || voices[0], pitch: .9, rate: .9 },
  wang:     { pick: () => prefer("Google UK English Male", "Ryan", "Guy", "Davis") || voices[2] || voices[0], pitch: .8, rate: .9 },
  ai:       { pick: () => prefer("Google US English", "Aria", "Jenny") || voices[0], pitch: .7, rate: 1.0 },
  speaker:  { pick: () => prefer("Google US English", "Aria", "Jenny") || voices[0], pitch: 1, rate: S.level === "A2" ? .88 : .96 },
};

// Learner-chosen speed multiplier, shared with the card game page (same origin, same key).
export const RATES = [0.7, 0.85, 1, 1.15, 1.3];
const RATE_KEY = "cardlearn_tts_rate";
export function getRate() { try { const r = parseFloat(localStorage.getItem(RATE_KEY)); return RATES.includes(r) ? r : 1; } catch (e) { return 1; } }
export function cycleRate() { const r = RATES[(RATES.indexOf(getRate()) + 1) % RATES.length]; try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) {} return r; }

let current = null;
export function speak(text, who = "narrator") {
  return new Promise(res => {
    if (!("speechSynthesis" in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = VOICES[who] || VOICES.narrator;
    u.lang = "en-US"; u.pitch = v.pitch; u.rate = (who === "speaker" ? VOICES.speaker.rate : v.rate) * getRate();
    const voice = v.pick(); if (voice) u.voice = voice;
    u.onend = u.onerror = () => { if (current === u) current = null; res(); };
    current = u;
    speechSynthesis.speak(u);
  });
}
export const stopSpeaking = () => { try { speechSynthesis.cancel(); } catch (e) {} };

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const CAN_RECORD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
export const detectSpeech = () => SR ? "browser" : CAN_RECORD ? "record" : "none";
S.speech = detectSpeech();
export const SPEECH_LABEL = { browser: "Live recognition", record: "Recording for teacher", none: "Microphone unavailable" };

export function listen(ms, onText) {
  return new Promise(res => {
    if (!SR) return res({ ok: false, code: "unsupported", text: "" });
    const r = new SR(); r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    let fin = "", interim = "", done = false, tm;
    const finish = (ok, code) => { if (done) return; done = true; clearTimeout(tm); try { r.stop(); } catch (e) {} res({ ok, code, text: (fin + " " + interim).trim() }); };
    r.onresult = e => { interim = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += " " + t; else interim += t; } onText && onText((fin + " " + interim).trim()); };
    r.onerror = e => { if (e.error === "no-speech" || e.error === "aborted") return; finish(false, e.error); };
    r.onend = () => finish(true);
    listen.stop = () => finish(true);
    try { r.start(); } catch (e) { finish(false, "start"); }
    tm = setTimeout(() => finish(true), ms);
  });
}

export async function recordClip(ms, onStart) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { return { ok: false, code: "not-allowed" }; }
  const rec = new MediaRecorder(stream); const chunks = []; const t0 = performance.now();
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  return new Promise(res => {
    let tm;
    const finish = () => { if (rec.state !== "inactive") rec.stop(); };
    rec.onstop = () => {
      clearTimeout(tm); stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      res({ ok: true, url: URL.createObjectURL(blob), sec: Math.round((performance.now() - t0) / 1000), kb: Math.round(blob.size / 1024) });
    };
    recordClip.stop = finish; rec.start(); onStart && onStart(); tm = setTimeout(finish, ms);
  });
}

// Decide what to do after a recognition failure.
export function speechFailed(code) {
  if (["not-allowed", "audio-capture"].includes(code)) { S.speech = "none"; log("speech.mic", `microphone unavailable (${code})`); return true; }
  if (["service-not-allowed", "network", "unsupported", "start", "language-not-supported"].includes(code)) {
    S.speech = CAN_RECORD ? "record" : "none"; log("speech.tier", `recognition unavailable (${code}) → ${SPEECH_LABEL[S.speech]}`); return true;
  }
  return false;
}
