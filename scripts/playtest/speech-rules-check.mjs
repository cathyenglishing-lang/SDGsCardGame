// Checks 老師後台 › 教材 › 語音念法 with real clicks, and that the games use the saved table:
//   open the page from the top menu → the built-in rows are there → type a sentence and see what will be
//   said → add a row → a duplicate is refused beside the row → save → the card game says it the new way.
//   node scripts/playtest/speech-rules-check.mjs [outDir]
// Needs the backend on http://127.0.0.1:8000 with a throw-away database (admin@example.com / AdminPass123).
import { launch, FAKE_SPEECH } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = process.argv[2] || ".playwright-mcp/speech-rules";
const problems = [];
const problem = (where, what) => { problems.push(`${where}: ${what}`); console.error("PROBLEM", where, what); };
const admin = await (await fetch(BASE + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "AdminPass123" }) })).json();
if (!admin.access_token) { console.error("Cannot sign in as admin. Is the test backend running?"); process.exit(2); }

const browser = await launch();
for (const [w, h] of [[1366, 900], [390, 844]]) {
  const page = await browser.page({ width: w, height: h, init: FAKE_SPEECH });
  const where = `${w}x${h}`;
  try {
    await page.goto(BASE + "/health");
    await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))});`);
    await page.goto(BASE + "/pages/teacher_dashboard.html");
    await page.waitFor(`typeof MODULE_LOADERS === "object" && /\\d/.test(document.body.textContent)`, 8000, "dashboard ready"); await page.sleep(800);
    if (w > 900) {
      await page.click('.tn-item[data-menu="content"] .tn-btn');
      await page.waitFor(`document.querySelector('.tn-item[data-menu="content"]').classList.contains("open")`, 5000, "the 教材 menu opens"); await page.sleep(350);
      await page.click('.tn-item[data-menu="content"] [data-module="speech"]');
    } else await page.evaluate(`setModule("speech")`);          // the phone menu is checked by the dashboard's own walkthroughs
    await page.waitForSelector("#tsRows tr[data-i]"); await page.sleep(300);
    const n0 = await page.evaluate(`document.querySelectorAll("#tsRows tr[data-i]").length`);
    if (n0 < 10) problem(where, "the built-in table has only " + n0 + " rows");
    const heard0 = await page.evaluate(`document.getElementById("tsHeard").textContent`);
    if (!/S D Gs/.test(heard0) || !/for example/.test(heard0)) problem(where, "the sample sentence is not shown as it will be said: " + heard0);
    if (!(await page.evaluate(`document.getElementById("tsSave").disabled`))) problem(where, "儲存 is enabled before anything changed");
    await page.shot(`${OUT}/${where}-1-table.png`, { fullPage: true });
    // a duplicate is refused beside the row, and cannot be saved
    await page.click("#tsAdd");
    await page.type(`#tsRows input[data-i="${n0}"][data-f="written"]`, "SDG");
    await page.type(`#tsRows input[data-i="${n0}"][data-f="spoken"]`, "x");
    const msg = await page.evaluate(`document.querySelector('#tsRows [data-msg="${n0}"]').textContent`);
    if (!/重複/.test(msg) || !(await page.evaluate(`document.getElementById("tsSave").disabled`))) problem(where, "a duplicate row is not refused (message: '" + msg + "')");
    await page.click(`#tsRows [data-del="${n0}"]`); await page.sleep(200);
    // a new row, tried on a sentence, then saved
    await page.click("#tsAdd");
    await page.type(`#tsRows input[data-i="${n0}"][data-f="written"]`, "NPTU");
    await page.type(`#tsRows input[data-i="${n0}"][data-f="spoken"]`, "N P T U");
    await page.type("#tsTry", "NPTU students learn the SDGs.");
    const heard = await page.evaluate(`document.getElementById("tsHeard").textContent`);
    if (heard !== "N P T U students learn the S D Gs.") problem(where, "the try-out line shows: " + heard);
    await page.click("#tsHear");                                // must not throw
    await page.shot(`${OUT}/${where}-2-new-row.png`, { fullPage: true });
    await page.click("#tsSave");
    await page.waitFor(`/已儲存/.test(document.getElementById("tsState").textContent)`, 8000, "saved");
    const over = await page.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`);
    if (over) problem(where, "the page scrolls sideways");
    const served = await (await fetch(BASE + "/content/speech")).json();
    if (!served.rules.some(r => r.written === "NPTU" && r.spoken === "N P T U")) problem(where, "the saved row is not served to the games");
    // the card game picks the table up
    await page.goto(BASE + "/pages/pecha_kucha_builder.html");
    await page.waitFor(`typeof CardLearnSay === "function"`, 8000, "the game loads the table"); await page.sleep(900);
    const inGame = await page.evaluate(`CardLearnSay("NPTU and SDG 4; AI")`);
    if (inGame !== "N P T U and S D G 4, A I") problem(where, "the card game would say: " + inGame);
    page.errors.forEach(e => problem(where + " browser", e));
    // put the table back for the next size
    await fetch(BASE + "/teacher/speech/reset", { method: "POST", headers: { Authorization: "Bearer " + admin.access_token } });
  } catch (e) { problem(where, e.message); await page.shot(`${OUT}/${where}-error.png`); }
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ problems }, null, 1));
process.exit(problems.length ? 1 : 0);
