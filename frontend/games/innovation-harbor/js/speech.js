// Text-to-speech with one voice per character, browser speech recognition,
// and MediaRecorder capture for the "send to teacher" tier.
import { S } from "./state.js";
import { log } from "./telemetry.js";

let voices = [];
function refresh() { voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)); }
if ("speechSynthesis" in window) { refresh(); speechSynthesis.onvoiceschanged = refresh; }

const FEMALE = /female|zira|aria|jenny|sonia|libby|michelle|samantha|karen|susan|hazel|emma|ava|serena|tessa|fiona|moira|victoria|allison|joanna|salli|clara|elizabeth|natasha|heera|google us english/i;
const MALE = /(?<!fe)male|david|mark|guy|ryan|davis|christopher|george|daniel|alex|fred|james|thomas|brian|eric|andrew|roger|steffan|aaron|oliver|matthew|william/i;
const genderOf = v => FEMALE.test(v.name) ? "f" : MALE.test(v.name) ? "m" : "";
// Pick the n-th voice of the wanted gender, preferring the named ones; null when the browser has none of that gender.
function pickVoice(gender, names, n = 0) {
  const pool = voices.filter(v => !gender || genderOf(v) === gender);
  const named = names.map(nm => pool.find(v => v.name.includes(nm))).filter(Boolean);
  const list = [...new Set([...named, ...pool])];
  return list[Math.min(n, list.length - 1)] || null;
}
// Each character gets a voice of the right gender; different voices when the browser offers several.
// When no voice of that gender exists, pitch is shifted instead (fem: higher, male: lower).
export const VOICES = {
  narrator: { g: "", names: ["Google US English", "Aria", "Jenny"], pitch: 1, rate: .95 },
  mei:      { g: "f", names: ["Google UK English Female", "Sonia", "Libby", "Aria", "Zira"], pitch: 1, rate: .92 },
  kai:      { g: "m", names: ["Guy", "Christopher", "Mark", "Fred", "Ryan"], pitch: 1.1, rate: 1.0 },
  hsu:      { g: "f", names: ["Jenny", "Michelle", "Google US English", "Aria", "Zira"], pitch: .95, rate: .9, n: 1 },
  wang:     { g: "m", names: ["Google UK English Male", "Ryan", "Davis", "David", "Guy"], pitch: .85, rate: .9 },
  ai:       { g: "", names: ["Google US English", "Aria", "Zira"], pitch: .7, rate: 1.0 },
  speaker:  { g: "", names: ["Google US English", "Aria", "Jenny"], pitch: 1, get rate() { return S.level === "A2" ? .88 : .96; } },
};

// Learner-chosen speed multiplier, shared with the card game page (same origin, same key).
export const RATES = [0.7, 0.85, 1, 1.15, 1.3];
const RATE_KEY = "cardlearn_tts_rate";
export function getRate() { try { const r = parseFloat(localStorage.getItem(RATE_KEY)); return RATES.includes(r) ? r : 1; } catch (e) { return 1; } }
export function cycleRate() { const r = RATES[(RATES.indexOf(getRate()) + 1) % RATES.length]; try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) {} return r; }

// Chrome's network voices stop after ~15 s without firing "end", so long text is spoken
// sentence by sentence, and a timer resolves the promise if the browser never reports the end.
let token = 0;
const chunksOf = text => String(text).split(/(?<=[.!?])\s+/).map(t => t.trim()).filter(Boolean);
export function speak(text, who = "narrator") {
  return new Promise(res => {
    if (!("speechSynthesis" in window)) return res();
    speechSynthesis.cancel();
    const my = ++token;
    const v = VOICES[who] || VOICES.narrator;
    const voice = pickVoice(v.g, v.names, v.n || 0);
    const mismatch = v.g && (!voice || genderOf(voice) !== v.g);
    const rate = v.rate * getRate();
    const parts = chunksOf(text);
    const words = String(text).split(/\s+/).length;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(guard); res(); };
    const guard = setTimeout(finish, (words / (2.4 * rate)) * 1000 * 1.5 + 2500);
    parts.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "en-US"; u.rate = rate; if (voice) u.voice = voice;
      u.pitch = mismatch ? (v.g === "f" ? 1.35 : 0.75) : v.pitch;
      if (i === parts.length - 1) u.onend = () => { if (my === token) finish(); };
      u.onerror = () => finish();
      speechSynthesis.speak(u);
    });
    if (!parts.length) finish();
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
