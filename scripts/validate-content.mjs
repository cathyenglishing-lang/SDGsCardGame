// Checks the Pecha Kucha Card Game question bank (frontend/js/pk-content.js) before a build.
// Errors stop the build; warnings are printed only.
//   node scripts/validate-content.mjs                 check
//   node scripts/validate-content.mjs --update-lock   accept the current content as the locked version
// The lock (scripts/pk-content.lock.json) holds one hash per topic and level. If a script or title
// changes while the topic's "version" stays the same, the check fails: learning data is stored
// with the version, so a new wording needs a new number.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = resolve(rootDir, "frontend/js/pk-content.js");
const UNLOCKS = resolve(rootDir, "frontend/js/unlocks.js");
const LOCK = resolve(rootDir, "scripts/pk-content.lock.json");

const PART_SIZES = { 20: [3, 3, 3, 3, 4, 4], 12: [2, 2, 2, 2, 2, 2] };
// Read-aloud speed (words per second) used only for the "longer than 20 seconds" warning.
const WORDS_PER_SECOND = { A1: 1.5, A2: 1.6, B1: 1.9, B2: 2.1 };
const LEVELS = ["A1", "A2", "B1", "B2"];

function loadWindowScript(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(file, "utf8"), sandbox, { filename: file });
  return sandbox.window;
}

export function cardId(topicId, level, no) {
  return `${topicId}/${level}/s${String(no).padStart(2, "0")}`;
}

export function levelHash(slides) {
  const h = createHash("sha256");
  for (const s of slides) h.update(`${s.no}\u0001${s.part}\u0001${s.title_en}\u0001${s.script}\u0002`);
  return h.digest("hex").slice(0, 16);
}

const TITLE_STOP = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "for", "is"]);
const titleWords = t => new Set(String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !TITLE_STOP.has(w)));
// Too alike: every word of one title is in the other, or 60% or more of all their words are shared.
// The same rule is in backend/content_library.py (titles_too_alike).
export function titlesTooAlike(a, b) {
  const A = titleWords(a), B = titleWords(b);
  if (!A.size || !B.size) return false;
  const shared = [...A].filter(w => B.has(w)).length;
  return shared === Math.min(A.size, B.size) || shared / (A.size + B.size - shared) >= 0.6;
}

export function validate(content, topicNames = {}) {
  const errors = [], warnings = [];
  const topics = content?.topics;
  if (!Array.isArray(topics) || !topics.length) return { errors: ["pk-content.js has no topics"], warnings };
  const seenTopic = new Set();
  for (const t of topics) {
    const T = `${t.id}`;
    if (seenTopic.has(t.id)) errors.push(`${T}: topic id appears twice`);
    seenTopic.add(t.id);
    if (!/^\d+-\d+$/.test(String(t.id))) errors.push(`${T}: topic id must look like 9-2`);
    if (Number(String(t.id).split("-")[0]) !== Number(t.sdg)) errors.push(`${T}: "sdg" (${t.sdg}) does not match the topic id`);
    if (!Number.isInteger(t.version) || t.version < 1) errors.push(`${T}: "version" must be a whole number from 1`);
    if (!String(t.title_en || "").trim()) errors.push(`${T}: English topic title is empty`);
    if (/^(SDG\s*\d+(-\d+)?\s*[:：]?|Topic\s*\d+\s*[:：])/i.test(String(t.title_en || ""))) errors.push(`${T}: topic title "${t.title_en}" is a placeholder or still has a "Topic n:" / "SDG n:" prefix`);
    if (!String(t.title_zh || "").trim()) errors.push(`${T}: Chinese topic title is empty`);
    if (Object.keys(topicNames).length) {
      if (!topicNames[t.id]) errors.push(`${T}: not listed in frontend/js/unlocks.js TOPICS`);
      else if (topicNames[t.id].en !== t.title_en) errors.push(`${T}: title "${t.title_en}" differs from unlocks.js "${topicNames[t.id].en}"`);
    }
    const levels = Object.keys(t.levels || {});
    if (!levels.length) errors.push(`${T}: no levels`);
    let reference = null;
    for (const l of levels) {
      const L = `${T}/${l}`;
      if (!LEVELS.includes(l)) errors.push(`${L}: unknown level`);
      const slides = t.levels[l];
      if (!Array.isArray(slides) || !slides.length) { errors.push(`${L}: no slides`); continue; }
      const sizes = PART_SIZES[slides.length];
      if (!sizes) errors.push(`${L}: ${slides.length} slides (expected 20 or 12)`);
      slides.forEach((s, i) => { if (s.no !== i + 1) errors.push(`${L}: slide numbers are not 1..${slides.length} in order (position ${i + 1} is no ${s.no})`); });
      const byPart = {};
      for (const s of slides) {
        const id = cardId(t.id, l, s.no);
        if (!Number.isInteger(s.part) || s.part < 1 || s.part > 6) errors.push(`${id}: part must be 1-6`);
        (byPart[s.part] ||= []).push(s);
        for (const [k, label] of [["title_en", "English title"], ["script", "script"]]) {
          if (!String(s[k] || "").trim()) errors.push(`${id}: ${label} is empty`);
        }
        // 2026-11-09 meeting (T4): every card needs a Chinese hint. The table prints the hint line
        // (keywords) or, when that is empty, the Chinese title — so the Chinese title must be there.
        if (!String(s.title_zh || "").trim()) errors.push(`${id}: Chinese title is empty`);
        // 5-1 and 5-2 once had the A2 script in this field (shown on the teacher's pages and in exports; the table prints `keywords`).
        else if (!/[\u3400-\u9fff]/.test(s.title_zh)) errors.push(`${id}: the Chinese title has no Chinese in it ("${String(s.title_zh).slice(0, 40)}")`);
        else if (String(s.title_zh).trim() === String(s.script || "").trim()) errors.push(`${id}: the Chinese title is the script itself`);
        const text = `${s.title_en}${s.title_zh}${s.script}${s.keywords}`;
        if (/�|Ã[\u0080-¿]|â€|ï¿½/.test(text)) errors.push(`${id}: text looks garbled (encoding)`);
        // Keywords written in English must really be in the script; a Chinese outline hint is not checked.
        for (const kw of String(s.keywords || "").split(/[,;、，；]/).map(k => k.trim()).filter(k => /^[A-Za-z][A-Za-z '\-]*$/.test(k))) {
          if (!s.script.toLowerCase().includes(kw.toLowerCase())) errors.push(`${id}: keyword "${kw}" is not in the script`);
        }
        const seconds = s.script.trim().split(/\s+/).length / (WORDS_PER_SECOND[l] || 1.8);
        if (seconds > 20) warnings.push(`${id}: about ${seconds.toFixed(0)} s to read aloud (Pecha Kucha slide is 20 s)`);
      }
      if (sizes) sizes.forEach((n, i) => { const got = (byPart[i + 1] || []).length; if (got !== n) errors.push(`${L}: part ${i + 1} has ${got} slides (expected ${n})`); });
      for (const [p, list] of Object.entries(byPart)) {
        const seen = new Map();
        for (const s of list) {
          const key = s.title_en.trim().toLowerCase();
          if (seen.has(key)) errors.push(`${L}: part ${p} has two cards titled "${s.title_en}" (slides ${seen.get(key)} and ${s.no}); the game cannot tell them apart`);
          seen.set(key, s.no);
        }
      }
      // 2026-11-09 meeting, T1: the title cards on the table are the choices A, B, C, D. Two titles that
      // differ by a word ("Conclusion" / "Conclusion & Call to Action") cannot be told apart by meaning.
      // Any other slide of the talk can also be dealt as the trap card, so the whole topic is compared.
      if (l === levels[0]) for (let i = 0; i < slides.length; i++) for (let j = i + 1; j < slides.length; j++) {
        if (titlesTooAlike(slides[i].title_en, slides[j].title_en)) errors.push(`${T}: the titles of slides ${slides[i].no} and ${slides[j].no} are too alike to choose between ("${slides[i].title_en}" / "${slides[j].title_en}")`);
      }
      // The same slide keeps its title at every level; only the script changes.
      if (!reference) reference = { level: l, slides };
      else slides.forEach((s, i) => { const r = reference.slides[i]; if (r && r.title_en !== s.title_en) errors.push(`${cardId(t.id, l, s.no)}: title "${s.title_en}" differs from ${reference.level} "${r.title_en}"`); });
    }
  }
  return { errors, warnings };
}

export function hashes(content) {
  const out = {};
  for (const t of content.topics) for (const [l, slides] of Object.entries(t.levels)) out[`${t.id}/${l}`] = { version: t.version, hash: levelHash(slides) };
  return out;
}

export function checkLock(content, lock) {
  const errors = [];
  const now = hashes(content);
  for (const [key, cur] of Object.entries(now)) {
    const old = lock[key];
    if (!old) { errors.push(`${key}: new content is not in the lock yet (run: npm run content:lock)`); continue; }
    if (cur.hash !== old.hash && cur.version === old.version) errors.push(`${key}: the scripts or titles changed but the topic is still version ${cur.version}. Raise "version" in pk-content.js, then run: npm run content:lock`);
    else if (cur.hash !== old.hash || cur.version !== old.version) errors.push(`${key}: version ${old.version} -> ${cur.version} is not locked yet (run: npm run content:lock)`);
    if (cur.version < old.version) errors.push(`${key}: version went down (${old.version} -> ${cur.version})`);
  }
  return errors;
}

export function run({ updateLock = false, quiet = false } = {}) {
  const content = loadWindowScript(CONTENT).PK_CONTENT;
  const names = loadWindowScript(UNLOCKS).CARDLEARN_UNLOCKS?.TOPICS || {};
  const { errors, warnings } = validate(content, names);
  if (updateLock) {
    if (errors.length) { errors.forEach(e => console.error("ERROR  " + e)); console.error(`\nLock not updated: fix the ${errors.length} error(s) first.`); return false; }
    writeFileSync(LOCK, JSON.stringify(hashes(content), null, 1) + "\n", "utf8");
    console.log(`Locked ${Object.keys(hashes(content)).length} topic levels in scripts/pk-content.lock.json`);
    return true;
  }
  if (!existsSync(LOCK)) errors.push("scripts/pk-content.lock.json is missing (run: npm run content:lock)");
  else errors.push(...checkLock(content, JSON.parse(readFileSync(LOCK, "utf8"))));
  if (!quiet) warnings.forEach(w => console.warn("warning  " + w));
  errors.forEach(e => console.error("ERROR  " + e));
  const slides = content.topics.reduce((a, t) => a + Object.values(t.levels).reduce((b, s) => b + s.length, 0), 0);
  console.log(`Question bank: ${content.topics.length} topics, ${slides} cards, ${errors.length} error(s), ${warnings.length} warning(s)`);
  return errors.length === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const ok = run({ updateLock: process.argv.includes("--update-lock"), quiet: process.argv.includes("--quiet") });
  if (!ok) process.exit(1);
}
