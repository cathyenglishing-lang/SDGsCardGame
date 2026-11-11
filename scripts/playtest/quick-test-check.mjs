// Checks the "快速測試" switch of the card game with real clicks:
//   the teacher (admin) opens the game → the mission card offers 快速測試 → ticking it leaves only
//   Part 1 on the table → the part is played → the wrap-up opens and says no chips are paid →
//   the teacher's report lists the run as "test_account" / not counted.
// A student account must NOT see the switch (checked with ?quick=1 too: that link still works, and
// the run is stored as a quick test).
//   node scripts/playtest/quick-test-check.mjs [outDir]
// Needs the backend on http://127.0.0.1:8000 with a throw-away database (admin@example.com / AdminPass123).
import { launch, FAKE_SPEECH } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = process.argv[2] || ".playwright-mcp/quick-test";
const problems = [];
const problem = (where, what) => { problems.push(`${where}: ${what}`); console.error("PROBLEM", where, what); };
const api = async (method, path, body, token) => {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const admin = (await api("POST", "/auth/login", { email: "admin@example.com", password: "AdminPass123" })).body;
if (!admin || !admin.access_token) { console.error("Cannot sign in as admin. Is the test backend running?"); process.exit(2); }
const T = admin.access_token;
const before = (await api("GET", "/learning/records/game?game=pecha_kucha", null, T)).body.overview;

const browser = await launch();
const page = await browser.page({ width: 1024, height: 768, init: FAKE_SPEECH });
const started = Date.now();
try {
  await page.goto(BASE + "/health");
  await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))});`);
  await page.goto(BASE + "/pages/pecha_kucha_builder.html");
  await page.waitFor(`typeof PK_READY !== "undefined" && PK_READY && !!document.querySelector(".pk-tcard")`, 15000, "menu ready");
  await page.click(`.pk-tc-open[data-topic="9-1"]`); await page.waitForSelector(`#pkPick.open .pk-lv[data-level="A2"]`); await page.sleep(750); await page.click(`#pkPick .pk-lv[data-level="A2"]`);
  await page.waitForSelector("#pkMissionGo"); await page.sleep(500);
  if (!(await page.evaluate(`!!document.getElementById("pkQuick")`))) problem("mission", "the teacher's account is not offered 快速測試");
  const partsFull = await page.evaluate(`document.querySelectorAll("#topicGrid .topic").length`);
  await page.click("#pkQuick"); await page.sleep(500);
  const partsQuick = await page.evaluate(`document.querySelectorAll("#topicGrid .topic").length`);
  const goal = await page.evaluate(`document.querySelector("#pkMissionBody .pk-goal").textContent`);
  if (partsFull !== 6 || partsQuick !== 1) problem("mission", `parts on the table: ${partsFull} before, ${partsQuick} after ticking (expected 6 and 1)`);
  if (!/快速測試/.test(goal)) problem("mission", "the goal line does not say this is a quick test: " + goal);
  await page.shot(`${OUT}/01-mission-quick.png`);
  await page.click("#pkMissionGo");
  await page.click("#topicGrid .topic:nth-child(1)");
  await page.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`); await page.sleep(500);
  let cards = 0;
  for (;;) {
    if (!(await page.evaluate(`gameData.length + (currentCardData ? 1 : 0)`))) break;
    await page.click("#mainDeck"); await page.sleep(200);
    await page.click("#pkSpeakBtn"); await page.waitFor(`canDrag === true`);
    const sub = await page.evaluate(`currentCardData.subId`);
    await page.click(`#subBox .subtopic-poker[data-sub-id="${sub}"]`); await page.sleep(150); cards++;
  }
  await page.waitForSelector("#pkWrap .pkw-card", 20000); await page.sleep(1200);
  const seconds = Math.round((Date.now() - started) / 1000);
  await page.shot(`${OUT}/02-wrapup-quick.png`);
  await page.click("#pkwNext"); await page.waitForSelector("#pkwSkip"); await page.click("#pkwSkip");      // step 2 (read aloud) skipped
  await page.waitFor(`/測試局/.test((document.querySelector("#pkwChips") || {}).textContent || "")`, 15000, "the last step says this is a test run and pays no chips");
  await page.shot(`${OUT}/03-wrapup-chips.png`);
  console.error(`quick test: ${cards} cards, wrap-up reached ${seconds} s after opening the page`);
  if (cards > 4) problem("table", "a quick test dealt " + cards + " cards (Part 1 has 2–3)");
  page.errors.forEach(e => problem("browser", e));
} catch (e) { problem("quick test", e.message); await page.shot(`${OUT}/error.png`); }
await page.close(); await browser.close();

const after = (await api("GET", "/learning/records/game?game=pecha_kucha", null, T)).body;
const mine = after.runs.find(r => r.name === admin.user.name && r.excluded) || after.runs[0];
if (!(after.overview.excluded_runs > (before.excluded_runs || 0))) problem("report", "the quick test is not among the excluded runs: " + JSON.stringify(after.overview));
if (after.overview.runs !== before.runs) problem("report", `the class's run count changed from ${before.runs} to ${after.overview.runs}`);
console.log(JSON.stringify({ excluded_before: before.excluded_runs || 0, excluded_after: after.overview.excluded_runs, reasons: after.overview.excluded, newest_run: mine && { excluded: mine.excluded, score: mine.score }, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
