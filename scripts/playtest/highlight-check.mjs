// 逐字高亮, with real clicks, against the FAKE voice server (python scripts/playtest/server_fake_voice.py):
//   1. a cloud clip that comes with word times: the highlighted word follows the clip
//   2. the device's voice, with an engine that reports every word (onboundary)
//   3. the device's voice, with an engine that reports nothing: the estimate moves the highlight
//   4. the teacher turns highlighting off for the level: plain text, nothing is marked
// In each case: the word marked "now" moves forward while the sentence is read, both in the sentence
// box and on the card in hand, and nothing stays marked when the reading is over.
//   node scripts/playtest/highlight-check.mjs [outDir]
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = process.argv[2] || ".playwright-mcp/highlight";
const problems = [], notes = [];
const problem = (where, what) => { problems.push(`${where}: ${what}`); console.error("PROBLEM", where, what); };
const j = async (path, opt) => (await fetch(BASE + path, opt)).json();
const admin = await j("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "AdminPass123" }) });
if (!admin.access_token) { console.error("Cannot sign in as admin. Is scripts/playtest/server_fake_voice.py running?"); process.exit(2); }
if (!(await fetch(BASE + "/_test/voice-calls")).ok) { console.error("This check needs the fake-voice server: python scripts/playtest/server_fake_voice.py"); process.exit(2); }
const put = body => fetch(BASE + "/teacher/tts", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin.access_token }, body: JSON.stringify(body) });
await put({ accents: ["en-US", "en-GB"], default: "en-US", highlight: ["A1", "A2", "B1", "B2"] });
await fetch(BASE + "/_test/voice-broken?on=false", { method: "POST" });

// A speech engine for the page: says one word every 130 ms. reports = true → fires onboundary for each word.
const ENGINE = reports => `(() => { const fake = { speaking: false, pending: false, paused: false, onvoiceschanged: null, getVoices: () => [], cancel() { this._c = (this._c || 0) + 1; }, pause() {}, resume() {},
  speak(u) { const mine = this._c || 0, text = u.text, words = [...text.matchAll(/\\S+/g)]; this._q = (this._q || Promise.resolve()).then(() => new Promise(done => {
    if ((this._c || 0) !== mine) return done(); u.onstart && u.onstart({}); let i = 0;
    const step = () => { if ((this._c || 0) !== mine) return done(); if (i >= words.length) { u.onend && u.onend({}); return done(); }
      ${reports ? `u.onboundary && u.onboundary({ name: "word", charIndex: words[i].index });` : ""} i++; setTimeout(step, 130); };
    step(); })); } };
  try { Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true }); } catch (e) {} })();`;

const now = page => page.evaluate(`(() => { const box = document.querySelector("#sentenceBox .pk-w.now"), card = document.querySelector("#dealtCardHolder .pk-w.now");
  return { box: box ? +box.dataset.w : -1, card: card ? +card.dataset.w : -1, boxText: box ? box.textContent : "", spans: document.querySelectorAll("#sentenceBox .pk-w").length, said: document.querySelectorAll("#sentenceBox .pk-w.said").length }; })()`);

async function oneCase(name, { init, accent, expectSpans = true }) {
  const page = await (await browserP).page({ width: 1024, height: 768, init });
  try {
    await page.goto(BASE + "/health");
    await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))}); localStorage.setItem("cardlearn_tts_accent", ${JSON.stringify(accent)});`);
    await page.goto(BASE + "/pages/pecha_kucha_builder.html");
    await page.waitFor(`typeof PK_READY !== "undefined" && PK_READY && !!document.querySelector(".pk-tcard") && PK_TTS.on`, 15000, "menu ready");
    await page.click(`.pk-tc-open[data-topic="9-1"]`); await page.waitForSelector(`#pkPick.open .pk-lv[data-level="A2"]`); await page.sleep(750);
    await page.click(`#pkPick .pk-lv[data-level="A2"]`); await page.waitForSelector("#pkMissionGo"); await page.sleep(300);
    await page.click("#pkQuick"); await page.sleep(300); await page.click("#pkMissionGo");
    await page.click("#topicGrid .topic:nth-child(1)");
    await page.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`); await page.sleep(500);
    await page.click("#mainDeck"); await page.sleep(250);
    const total = await page.evaluate(`currentCardData.english.trim().split(/\\s+/).length`);
    await page.click("#pkSpeakBtn");
    if (!expectSpans) {
      await page.sleep(900);
      const s = await now(page);
      if (s.spans !== 0 || s.box !== -1) problem(name, "highlighting is off for this level but words are marked: " + JSON.stringify(s));
      await page.waitFor(`canDrag === true`, 20000);
      notes.push(`${name}: plain text, nothing marked`);
      return;
    }
    await page.waitFor(`!!document.querySelector("#sentenceBox .pk-w.now")`, 8000, "a word is highlighted");
    const a = await now(page); await page.sleep(900);
    const b = await now(page); await page.shot(`${OUT}/${name.replace(/\W+/g, "-")}.png`);
    await page.sleep(900);
    const c = await now(page);
    if (a.spans !== total) problem(name, `the sentence box has ${a.spans} word spans for ${total} words`);
    if (!(b.box > a.box && c.box > b.box)) problem(name, `the highlighted word does not move forward: ${a.box} → ${b.box} → ${c.box}`);
    if (b.card !== b.box && Math.abs(b.card - b.box) > 1) problem(name, `the card in hand (${b.card}) and the sentence box (${b.box}) mark different words`);
    if (b.said !== b.box) problem(name, `${b.said} words are marked as said but word ${b.box} is being read`);
    await page.waitFor(`canDrag === true`, 25000, "the sentence finished");
    await page.sleep(500);
    const end = await page.evaluate(`document.querySelectorAll(".pk-w.now, .pk-w.said").length`);
    if (end) problem(name, end + " words are still marked after the reading ended");
    notes.push(`${name}: ${total} words, highlighted word at three moments: ${a.box} → ${b.box} → ${c.box} (“${b.boxText}” in the middle)`);
    page.errors.forEach(e => problem(name + " browser", e));
  } catch (e) { problem(name, e.message); await page.shot(`${OUT}/error-${name.replace(/\W+/g, "-")}.png`); }
  finally { await page.close(); }
}

const browserP = launch();
await oneCase("1 cloud clip with word times", { init: ENGINE(true), accent: "en-GB" });
await oneCase("2 device voice, engine reports words", { init: ENGINE(true), accent: "device" });
await oneCase("3 device voice, engine reports nothing", { init: ENGINE(false), accent: "device" });
await put({ highlight: ["B1", "B2"] });
await oneCase("4 teacher turned it off for A2", { init: ENGINE(true), accent: "device", expectSpans: false });
await put({ highlight: ["A1", "A2", "B1", "B2"] });
await (await browserP).close();
console.log(JSON.stringify({ notes, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
