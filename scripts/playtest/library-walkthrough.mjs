// Walks the teacher's material editor (教材管理) with real clicks and typing:
//   open a topic → make the mistake the old bank had (two cards with one title) → the check appears
//   beside the field after leaving it → fix it → change a script → the draft is saved by itself and
//   the page says a new version will start → publish → students get it → delete a slide and undo →
//   a new topic from a pasted sheet → publish → delete the topic and undo → take back an old version
// and checks at every step that students only ever get what was published.
//   node scripts/playtest/library-walkthrough.mjs [outDir]
// Needs the backend on http://127.0.0.1:8000 with a throw-away database (admin@example.com / AdminPass123).
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = process.argv[2] || ".playwright-mcp/library-walk";
const problems = [];
const problem = (where, what) => { problems.push(`${where}: ${what}`); };
const admin = await (await fetch(BASE + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "AdminPass123" }) })).json();
if (!admin.access_token) { console.error("Cannot sign in. Is the test backend running?"); process.exit(2); }
const live = async id => (await (await fetch(BASE + "/content/library")).json()).topics.find(t => t.id === id);
// start from what is published: an earlier, interrupted run may have left a draft behind
await fetch(BASE + "/teacher/library/pecha_kucha/9-2/discard", { method: "POST", headers: { Authorization: "Bearer " + admin.access_token } });

const browser = await launch();
const page = await browser.page({ width: 1366, height: 900 });
let n = 0;
const shot = name => page.shot(`${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, { fullPage: true });
const step = async (where, fn) => { try { await fn(); const side = await page.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`); if (side) problem(where, "the page scrolls sideways"); } catch (e) { problem(where, e.message); await page.shot(`${OUT}/error-${where.replace(/\W+/g, "-")}.png`); } };
// type like a person: focus, replace the value, fire input, then leave the field
const fill = (sel, text) => page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event("input", { bubbles: true })); e.blur(); })()`);
const saved = () => page.waitFor(`/草稿已自動儲存|已發佈第/.test(document.getElementById("tlState").textContent) && !/儲存草稿中|有修改/.test(document.getElementById("tlState").textContent)`, 8000, "draft saved");
const text = sel => page.evaluate(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ""`);

await page.goto(BASE + "/health");
await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))});`);
await page.goto(BASE + "/pages/teacher_dashboard.html");
await page.waitFor(`typeof MODULE_LOADERS === "object" && /\\d/.test(document.body.textContent)`, 8000, "dashboard ready"); await page.sleep(800);   // the menu answers once the sign-in check is done

await step("open the editor", async () => {
  await page.click('[data-module="library"]'); await page.waitForSelector("#tlTree [data-topic]");
  const topics = await page.evaluate(`document.querySelectorAll("#tlTree [data-topic]").length`);
  if (topics < 9) problem("open the editor", "the tree lists " + topics + " topics, expected at least 9");
  if (!(await text("#tlTree")).includes("還不能在這裡編輯")) problem("open the editor", "the tree does not say which games cannot be edited here");
  await shot("tree");
});

const before = await live("9-2");
await step("open 9-2", async () => {
  await page.click('#tlTree [data-topic="9-2"]');
  await page.waitFor(`document.querySelector(".tl-code") && document.querySelector(".tl-code").textContent.includes("9-2") && !!document.querySelector("#tlEdit [data-f='script']")`, 8000, "9-2 is open");
  if (!/已發佈第 \d+ 版/.test(await text("#tlState"))) problem("open 9-2", "the state line does not say which version is published: " + (await text("#tlState")));
  if (!/檢查通過/.test(await text("#tlChecks"))) problem("open 9-2", "a published topic should pass its checks: " + (await text("#tlChecks")).slice(0, 120));
  await shot("topic");
});

await step("duplicate title → check beside the field", async () => {
  await page.click('#tlList [data-no="5"]'); await page.waitFor(`/第 5 張/.test(document.querySelector(".tl-edit-head").textContent)`);
  const t5 = await page.evaluate(`document.querySelector('#tlEdit [data-f="title_en"]').value`);
  await page.click('#tlList [data-no="6"]'); await page.waitFor(`/第 6 張/.test(document.querySelector(".tl-edit-head").textContent)`);
  const t6 = await page.evaluate(`document.querySelector('#tlEdit [data-f="title_en"]').value`);
  await fill('#tlEdit [data-f="title_en"]', t5);
  await page.waitFor(`!!document.querySelector("#tlEdit .tl-field-msg.bad")`, 8000, "the error appears beside the title field");
  if (!/標題/.test(await text("#tlEdit .tl-field-msg.bad"))) problem("duplicate title", "the message does not explain the problem: " + (await text("#tlEdit .tl-field-msg.bad")));
  if (!/個問題/.test(await text("#tlPublish"))) problem("duplicate title", "the publish button does not say there are problems: " + (await text("#tlPublish")));
  await shot("duplicate-title");
  await page.click("#tlPublish"); await page.sleep(600);
  if ((await live("9-2")).levels.A2[5].title_en !== before.levels.A2[5].title_en) problem("duplicate title", "a draft with errors reached the students");
  await fill('#tlEdit [data-f="title_en"]', t6); await saved();
  if (await page.evaluate(`!!document.querySelector("#tlEdit .tl-field-msg.bad")`)) problem("duplicate title", "the error stays after the title was put right");
});

await step("edit a script → draft → publish", async () => {
  await page.click('#tlList [data-no="1"]'); await page.waitFor(`/第 1 張/.test(document.querySelector(".tl-edit-head").textContent)`);
  await fill('#tlEdit [data-f="script"]', "Good morning, everyone. Today we look at SDG 9 and at how the way we ask changes what AI answers. Take " + Date.now() + ".");
  await saved();
  const state = await text("#tlState");
  if (!/還沒發佈的修改/.test(state) || !/分開統計/.test(state)) problem("edit a script", "the state line should say there are unpublished changes and that a new version will start: " + state);
  if (!/草稿/.test(await text('#tlTree [data-topic="9-2"]'))) problem("edit a script", "the tree does not mark the topic as having a draft");
  if ((await live("9-2")).levels.A2[0].script !== before.levels.A2[0].script) problem("edit a script", "students already get the draft");
  await shot("draft");
  await page.click("#tlPublish");
  await page.waitFor(`/已發佈第 ${before.version + 1} 版/.test(document.getElementById("tlState").textContent)`, 8000, "published as the next version");
  const now = await live("9-2");
  if (now.version !== before.version + 1 || !now.levels.A2[0].script.startsWith("Good morning, everyone. Today we look")) problem("publish", "students did not get the published text / version: v" + now.version);
  await shot("published");
});

await step("delete a slide and undo", async () => {
  const count = await page.evaluate(`document.querySelectorAll("#tlList [data-no]").length`);
  await page.click("#tlDelSlide");
  await page.waitFor(`document.querySelectorAll("#tlList [data-no]").length === ${count - 1}`, 5000, "slide removed");
  if (!(await page.evaluate(`!!document.getElementById("tlUndo")`))) problem("delete a slide", "no 復原 button after deleting");
  await shot("slide-deleted");
  await page.click("#tlUndo");
  await page.waitFor(`document.querySelectorAll("#tlList [data-no]").length === ${count}`, 5000, "slide back");
  await saved();
  if (/還沒發佈的修改/.test(await text("#tlState"))) problem("delete a slide", "after undo the topic should be back to exactly what is published");
});

const stamp = String(Date.now()).slice(-2), newId = "4-" + (10 + Number(stamp) % 80);
await step("new topic from a pasted sheet", async () => {
  await page.click("#tlNew"); await page.waitForSelector("#tlNewId");
  await page.evaluate(`document.getElementById("tlNewSlides").value = "12"; document.querySelectorAll("#tlNewBlank input[type=checkbox]").forEach(c => { c.checked = c.value === "A2"; });`);
  await fill("#tlNewId", newId); await fill("#tlNewEn", "Reading for Everyone"); await fill("#tlNewZh", "人人都能閱讀");
  await shot("new-topic");
  await page.click('#tlNewForm button[type="submit"]');
  await page.waitFor(`document.querySelector("#tlTree .tl-node.on") && document.querySelector("#tlTree .tl-node.on").textContent.includes("${newId}")`, 8000, "new topic opened");
  if (!/還沒發佈過/.test(await text("#tlState"))) problem("new topic", "a new topic should say it has never been published: " + (await text("#tlState")));
  if (await live(newId)) problem("new topic", "students can already see an unpublished topic");
  await page.click("#tlImportBtn"); await page.waitForSelector("#tlImportText");
  const rows = "張\t段落\t英文標題\t中文標題\t講稿\n" + Array.from({ length: 12 }, (_, i) => `${i + 1}\t${Math.floor(i / 2) + 1}\tReading idea ${i + 1}\t閱讀重點 ${i + 1}\tThis is sentence number ${i + 1} of a short talk about reading for everyone.`).join("\n");
  await fill("#tlImportText", rows);
  await page.click("#tlImportGo");
  await page.waitFor(`document.querySelectorAll("#tlList [data-no]").length === 12 && /Reading idea 1/.test(document.getElementById("tlList").textContent)`, 8000, "imported slides listed");
  await shot("imported");
  await page.click("#tlPublish");
  await page.waitFor(`/已發佈第 1 版/.test(document.getElementById("tlState").textContent)`, 8000, "new topic published");
  const t = await live(newId);
  if (!t || t.levels.A2.length !== 12 || t.title_en !== "Reading for Everyone") problem("new topic", "students do not get the new topic as published");
});

await step("the game shows the teacher's title", async () => {
  const game = await browser.page({ width: 1024, height: 768 });
  await game.goto(BASE + "/health"); await game.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))});`);
  await game.goto(BASE + "/pages/pecha_kucha_builder.html"); await game.waitForSelector(".pk-topic"); await game.sleep(700);
  const menu = await game.evaluate(`document.getElementById("selectorScreen").textContent`);
  if (!menu.includes("Reading for Everyone")) problem("the game", "the topic menu does not show the newly published topic");
  await game.shot(`${OUT}/${String(++n).padStart(2, "0")}-game-menu.png`);
  // preview of a draft: opens directly, says it is a preview, records nothing
  await game.goto(BASE + `/pages/pecha_kucha_builder.html?preview=1&topic=${newId}&level=A2`);
  await game.waitForSelector("#pkMissionGo"); await game.click("#pkMissionGo"); await game.sleep(300);
  if (!/預覽/.test(await game.evaluate(`document.getElementById("pkSaveChip").textContent`))) problem("the game", "preview mode is not marked on screen");
  if (await game.evaluate(`!!localStorage.getItem("pk_runs_pending_v1")`)) problem("the game", "preview mode stored a run");
  game.errors.forEach(e => problem("the game", e));
  await game.close();
});

await step("delete the topic and undo", async () => {
  await page.click("#tlDelTopic");
  await page.waitFor(`!!document.getElementById("tlUndo") && /已刪除/.test(document.getElementById("tlTree").textContent)`, 8000, "topic moved to 已刪除");
  if (await live(newId)) problem("delete the topic", "students still get a deleted topic");
  await shot("topic-deleted");
  await page.click("#tlUndo");
  await page.waitFor(`document.querySelector("#tlTree .tl-node.on") && document.querySelector("#tlTree .tl-node.on").textContent.includes("${newId}")`, 8000, "topic restored and opened");
  if (!(await live(newId))) problem("delete the topic", "undo did not give the topic back to students");
});

await step("take back an old version", async () => {
  await page.click('#tlTree [data-topic="9-2"]');
  await page.waitFor(`document.querySelector(".tl-code") && document.querySelector(".tl-code").textContent.includes("9-2") && !!document.querySelector("#tlEdit [data-f='script']")`, 8000, "9-2 is open");
  await page.sleep(300);
  await page.evaluate(`document.querySelector(".tl-history").open = true`); await page.sleep(200);
  await page.click(`.tl-history [data-ver="${before.version}"]`);
  await page.waitFor(`/還沒發佈的修改/.test(document.getElementById("tlState").textContent)`, 8000, "old version is now the draft");
  const script = await page.evaluate(`document.querySelector('#tlEdit [data-f="script"]').value`);
  if (script !== before.levels.A2[0].script) problem("old version", "the draft does not hold the old script");
  if ((await live("9-2")).version !== before.version + 1) problem("old version", "taking back a version changed what students get before publishing");
  await shot("old-version-in-draft");
  await page.click("#tlDiscard"); await page.waitFor(`/已發佈第 ${before.version + 1} 版/.test(document.getElementById("tlState").textContent)`, 8000, "draft discarded");
});

await step("search the tree", async () => {
  await fill("#tlSearch", "net zero"); await page.evaluate(`document.getElementById("tlSearch").dispatchEvent(new Event("input"))`); await page.sleep(200);
  const hits = await page.evaluate(`[...document.querySelectorAll("#tlTree [data-topic]")].map(b => b.dataset.topic).join(",")`);
  if (hits !== "13-1") problem("search", "searching 'net zero' should leave only 13-1, got: " + hits);
});

page.errors.forEach(e => problem("browser", e));
await page.close(); await browser.close();
console.log(JSON.stringify({ screenshots: n, problems: problems.map(p => p.slice(0, 260)) }, null, 1));
process.exit(problems.length ? 1 : 0);
