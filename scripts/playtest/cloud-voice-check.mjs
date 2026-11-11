// Cloud voices, with real clicks, against the FAKE provider (start scripts/playtest/server_fake_voice.py
// instead of the usual backend — no key, no network, every sentence is a short tone):
//   teacher: 教材 › 語音念法 → the cloud panel says it is on → offer a third accent → 試聽 → prepare a few clips
//   student: the level card offers the accents → a part is played with the stored clip (the
//            provider is asked once per sentence) → the accent button changes the accent →
//            the provider breaks → the same game goes on with the device's voice
//   node scripts/playtest/cloud-voice-check.mjs [outDir]
import { launch, FAKE_SPEECH } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = process.argv[2] || ".playwright-mcp/cloud-voice";
const problems = [];
const problem = (where, what) => { problems.push(`${where}: ${what}`); console.error("PROBLEM", where, what); };
const j = async (path, opt) => (await fetch(BASE + path, opt)).json();
const admin = await j("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "AdminPass123" }) });
if (!admin.access_token) { console.error("Cannot sign in as admin. Is scripts/playtest/server_fake_voice.py running?"); process.exit(2); }
if (!(await fetch(BASE + "/_test/voice-calls")).ok) { console.error("This check needs the fake-voice server: python scripts/playtest/server_fake_voice.py"); process.exit(2); }
const calls = async () => (await j("/_test/voice-calls")).calls;
// Start from the same settings every time (the check can be run again on the same server).
await fetch(BASE + "/teacher/tts", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin.access_token }, body: JSON.stringify({ accents: ["en-US", "en-GB"], default: "en-US" }) });
await fetch(BASE + "/_test/voice-broken?on=false", { method: "POST" });

const browser = await launch();
// ── the teacher ──
{
  const page = await browser.page({ width: 1366, height: 900, init: FAKE_SPEECH });
  try {
    await page.goto(BASE + "/health");
    await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))});`);
    await page.goto(BASE + "/pages/teacher_dashboard.html");
    await page.waitFor(`typeof MODULE_LOADERS === "object" && /\\d/.test(document.body.textContent)`, 8000, "dashboard ready"); await page.sleep(800);
    await page.click('.tn-item[data-menu="content"] .tn-btn');
    await page.waitFor(`document.querySelector('.tn-item[data-menu="content"]').classList.contains("open")`, 5000, "menu"); await page.sleep(350);
    await page.click('.tn-item[data-menu="content"] [data-module="speech"]');
    await page.waitForSelector("#tsCloud [data-offer]"); await page.sleep(300);
    const state = await page.evaluate(`document.querySelector("#tsCloud .ts-cloud-state").textContent`);
    if (!/已啟用/.test(state)) problem("teacher", "the panel does not say the cloud voice is on: " + state);
    await page.click('#tsCloud [data-offer="en-AU"]');
    await page.waitFor(`document.querySelector('#tsCloud [data-offer="en-AU"]').checked && !document.querySelector('#tsCloud [data-default="en-AU"]').disabled`, 8000, "en-AU offered");
    const mine = "Our SDGs club met at " + Date.now() + ".";        // a sentence nobody has asked for before
    await page.type("#tsTry", mine);
    const before = (await calls()).length;
    await page.click('#tsCloud [data-try="en-AU"]');
    await page.waitFor(`document.querySelector('#tsCloud [data-try="en-AU"]').textContent.includes("試聽") && !document.querySelector('#tsCloud [data-try="en-AU"]').disabled`, 10000, "try-out finished");
    const last = (await calls()).slice(before);
    if (last.length !== 1 || last[0].locale !== "en-AU" || last[0].text !== mine.replace("SDGs", "S D Gs")) problem("teacher", "試聽 did not ask for the sentence just typed, in en-AU, with the 念法表 applied: " + JSON.stringify(last));
    await page.click('#tsCloud [data-prep="en-GB"]');
    await page.waitFor(`/^[1-9]/.test(document.querySelector('#tsCloud [data-offer="en-GB"]').closest("tr").children[4].textContent.trim())`, 20000, "some en-GB clips prepared");
    await page.click('#tsCloud [data-prep="en-GB"]');                       // stop
    await page.sleep(1500);
    await page.shot(`${OUT}/1-teacher-cloud.png`, { fullPage: true });
    if (await page.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`)) problem("teacher", "the page scrolls sideways");
    page.errors.forEach(e => problem("teacher browser", e));
  } catch (e) { problem("teacher", e.message); await page.shot(`${OUT}/error-teacher.png`); }
  await page.close();
}
// ── the student (the admin's account with 快速測試: Part 1 only) ──
for (const [w, h] of [[1024, 768], [390, 844]]) {
  const where = `student ${w}x${h}`;
  const page = await browser.page({ width: w, height: h, init: FAKE_SPEECH });
  try {
    await fetch(BASE + "/_test/voice-broken?on=false", { method: "POST" });
    await page.goto(BASE + "/health");
    await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))});`);
    await page.goto(BASE + "/pages/pecha_kucha_builder.html");
    await page.waitFor(`typeof PK_READY !== "undefined" && PK_READY && !!document.querySelector(".pk-tcard") && PK_TTS.on`, 15000, "menu ready, cloud voice on");
    await page.click(`.pk-tc-open[data-topic="9-1"]`); await page.waitForSelector(`#pkPick.open #pkPickAccent`); await page.sleep(750);
    const offered = await page.evaluate(`[...document.querySelectorAll("#pkPickAccent option")].map(o => o.value).join(",")`);
    if (offered !== "en-US,en-GB,en-AU,device") problem(where, "the level card offers: " + offered);
    await page.evaluate(`(() => { const s = document.getElementById("pkPickAccent"); s.value = "en-GB"; s.dispatchEvent(new Event("change")); })()`);
    await page.shot(`${OUT}/2-level-card-${w}.png`);
    await page.click(`#pkPick .pk-lv[data-level="A2"]`); await page.waitForSelector("#pkMissionGo"); await page.sleep(400);
    await page.click("#pkQuick"); await page.sleep(300); await page.click("#pkMissionGo");
    await page.click("#topicGrid .topic:nth-child(1)");
    await page.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`); await page.sleep(500);
    if ((await page.evaluate(`document.getElementById("pkAccentBtn").textContent`)) !== "口音 英式") problem(where, "the accent button shows: " + (await page.evaluate(`document.getElementById("pkAccentBtn").textContent`)));
    if (await page.evaluate(`(() => { const b = document.getElementById("pkAccentBtn").getBoundingClientRect(); return b.right > innerWidth + 1 || b.width < 40; })()`)) problem(where, "the accent button does not fit on screen");
    // card 1: the cloud clip in British English
    const n0 = (await calls()).length;
    await page.click("#mainDeck"); await page.sleep(200);
    await page.click("#pkSpeakBtn"); await page.waitFor(`canDrag === true`, 15000, "the sentence was played");
    const played = await page.evaluate(`[PK_TTS.clips.size, [...PK_TTS.clips.values()].filter(Boolean).length].join("/")`);
    if (played !== "1/1") problem(where, "the first sentence was not played from a cloud clip (clips " + played + ")");
    const asked = (await calls()).slice(n0);
    if (asked.length > 1 || (asked.length === 1 && asked[0].locale !== "en-GB")) problem(where, "the provider was asked " + JSON.stringify(asked));
    // listen again: the same clip, the provider is not asked
    const n1 = (await calls()).length;
    await page.click("#pkSpeakBtn"); await page.waitFor(`canDrag === true`, 15000);
    if ((await calls()).length !== n1) problem(where, "listening again asked the provider again");
    await page.shot(`${OUT}/3-table-${w}.png`);
    let sub = await page.evaluate(`currentCardData.subId`);
    await page.click(`#subBox .subtopic-poker[data-sub-id="${sub}"]`); await page.sleep(200);
    // card 2: the provider is broken → the device's voice, and the game goes on
    await fetch(BASE + "/_test/voice-broken?on=true", { method: "POST" });
    await page.click("#pkAccentBtn"); await page.sleep(200);                 // 英式 → 澳洲 (no clip stored for it)
    if ((await page.evaluate(`document.getElementById("pkAccentBtn").textContent`)) !== "口音 澳洲") problem(where, "the accent button did not move to the next accent");
    await page.click("#mainDeck"); await page.sleep(200);
    await page.click("#pkSpeakBtn"); await page.waitFor(`canDrag === true`, 15000, "the sentence was spoken by the device when the provider failed");
    if (!(await page.evaluate(`PK_TTS.offUntil > Date.now()`))) problem(where, "after a failure the game keeps asking the provider");
    sub = await page.evaluate(`currentCardData.subId`);
    await page.click(`#subBox .subtopic-poker[data-sub-id="${sub}"]`);
    await page.waitForSelector("#pkWrap .pkw-card", 20000);
    page.errors.forEach(e => problem(where + " browser", e));
  } catch (e) { problem(where, e.message); await page.shot(`${OUT}/error-${w}.png`); }
  await page.close();
}
await fetch(BASE + "/_test/voice-broken?on=false", { method: "POST" });
await browser.close();
console.log(JSON.stringify({ provider_calls: (await calls()).length, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
