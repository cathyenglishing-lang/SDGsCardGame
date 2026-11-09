// Walks the teacher's side with real clicks, after making a small class play:
//   1. (API) a course, a roster with 系級, the topics the course opens
//   2. (browser, as three students) sign in with the one-time password, change it, play a run of the
//      card game with different numbers of mistakes, read a slide aloud — the take is uploaded
//   3. (browser, as the teacher) 學習紀錄: the game → the class table → one student → one run →
//      the voice queue: play a recording, mark it "請重錄" with a note; Excel export
//   4. (browser, as that student) the note shows up on the read-aloud step
// Screenshots of every teacher screen go to the output folder; problems are listed at the end.
//   node scripts/playtest/teacher-walkthrough.mjs [outDir]
// Needs the backend on http://127.0.0.1:8000 with a throw-away database (admin@example.com / AdminPass123).
import { launch, FAKE_SPEECH } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = process.argv[2] || ".playwright-mcp/teacher-walk";
const problems = [], notes = [];
const problem = (where, what) => { problems.push(`${where}: ${what}`); console.error("PROBLEM", where, what); };
const api = async (method, path, body, token) => {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const admin = (await api("POST", "/auth/login", { email: "admin@example.com", password: "AdminPass123" })).body;
if (!admin || !admin.access_token) { console.error("Cannot sign in as admin. Is the test backend running?"); process.exit(2); }
const T = admin.access_token, stamp = Date.now().toString().slice(-6);

// ── 1. course, roster with 系級, opened topics ──
const course = (await api("POST", "/teacher/courses", { term: "1151", code: "EN" + stamp, name: "英語簡報 " + stamp }, T)).body.course;
await api("PUT", `/teacher/courses/${course.id}/activities`, { activities: [{ topic_id: "9-1", levels: ["A2", "B1"] }, { topic_id: "9-2", levels: ["A2"] }] }, T);
const roster = [
  { section: "資工三甲", student_no: "41" + stamp + "1", name: "王小明" },
  { section: "資工三甲", student_no: "41" + stamp + "2", name: "陳美麗" },
  { section: "應英二乙", student_no: "41" + stamp + "3", name: "林大華" },
  { section: "應英二乙", student_no: "41" + stamp + "4", name: "還沒玩的同學" },
];
const commit = (await api("POST", "/teacher/roster/commit", { course_id: course.id, rows: roster }, T)).body;
if (commit.counts.new !== 4) problem("roster", "expected 4 new accounts, got " + JSON.stringify(commit.counts));
const sheet = Object.fromEntries(commit.account_sheet.map(a => [a.name, a]));

const browser = await launch();
const audit = async (page, where) => {
  const bad = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push("the page scrolls sideways (" + document.documentElement.scrollWidth + " > " + innerWidth + ")");
    document.querySelectorAll("#recordsModule .tr-tile b").forEach(b => { if (/undefined|NaN|null/.test(b.textContent)) out.push("a tile shows " + b.textContent); });
    document.querySelectorAll("#recordsModule td, #recordsModule .tr-summary").forEach(c => { if (/undefined|NaN|\[object/.test(c.textContent)) out.push("a cell shows: " + c.textContent.trim().slice(0, 40)); });
    return [...new Set(out)].slice(0, 6);
  });
  bad.forEach(b => problem(where, b));
};

// ── 2. three students play ──
async function studentPlays(name, { topic, level, mistakes, width = 1024, height = 768, record = true, second = false }) {
  const page = await browser.page({ width, height, init: FAKE_SPEECH });
  const acct = sheet[name];
  try {
    await page.goto(BASE + "/health"); await page.evaluate("localStorage.clear()");
    const pw = "Student" + stamp;
    // First visit: the one-time password signs in, and the game sends the student to choose a new one.
    const s0 = (await api("POST", "/auth/login", { email: acct.email, password: second ? pw : acct.password })).body;
    if (!s0 || !s0.access_token) throw new Error("sign-in failed for " + name);
    await page.evaluate(`localStorage.setItem("user", ${JSON.stringify(JSON.stringify(s0))})`);
    if (!second) {
      if (!s0.user.must_change_password) problem(name, "an imported account is not asked to change its password");
      await page.goto(BASE + "/pages/pecha_kucha_builder.html");
      await page.waitFor(`location.pathname.endsWith("/change_password.html")`, 12000, name + " is sent to the password page");
      await page.type("#current", acct.password); await page.type("#next", pw); await page.type("#again", pw);
      await page.click("#go");
      await page.waitFor(`location.pathname.endsWith("/pecha_kucha_builder.html")`, 12000, name + " returns to the game after changing the password");
    }
    await page.goto(BASE + "/pages/pecha_kucha_builder.html");
    await page.waitForSelector(".pk-course-bar");
    const menu = await page.evaluate(`[...document.querySelectorAll(".pk-topic .pk-tbadge")].map(e => e.textContent.replace(/.*·\\s*/, "").trim()).join(",")`);
    if (menu !== "9-1,9-2") problem(name, "the menu should show only the course's topics 9-1,9-2 but shows " + menu);
    if (!(await page.evaluate(`document.querySelector(".pk-course-bar").textContent`)).includes(acct.section)) problem(name, "the course line does not show the student's 系級 " + acct.section);
    await page.click(`.pk-lvl[onclick*="'${topic}','${level}'"]`);
    await page.waitForSelector("#pkMissionGo"); await page.sleep(700);
    const mission = await page.evaluate(`document.getElementById("pkMissionBody").textContent`);
    await page.click("#pkMissionGo");
    let wrong = mistakes;
    const parts = await page.evaluate(`document.querySelectorAll("#topicGrid .topic").length`);
    for (let i = 1; i <= parts; i++) {
      await page.click(`#topicGrid .topic:nth-child(${i})`);
      await page.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`);
      await page.sleep(500);
      for (;;) {
        if (!(await page.evaluate(`gameData.length + (currentCardData ? 1 : 0)`))) break;
        await page.click("#mainDeck"); await page.sleep(200);
        await page.click("#pkSpeakBtn"); await page.waitFor(`canDrag === true`);
        if (i === 2) { await page.click("#pkSpeakBtn"); await page.waitFor(`canDrag === true`); }   // one repeat in part 2
        const sub = await page.evaluate(`currentCardData.subId`);
        if (wrong > 0) { wrong--; await page.click(`#subBox .subtopic-poker:not(.correct):not([data-sub-id="${sub}"])`); await page.sleep(450); }
        await page.click(`#subBox .subtopic-poker[data-sub-id="${sub}"]`); await page.sleep(130);
      }
      await page.sleep(400);
    }
    await page.waitForSelector("#pkWrap .pkw-card"); await page.sleep(800);
    await page.click("#pkwNext"); await page.waitForSelector("#pkwRec");
    const teacherNote = await page.evaluate(`(document.querySelector(".pkw-teacher") || {}).textContent || ""`);
    if (record) {
      await page.click("#pkwRec"); await page.waitFor(`document.getElementById("pkwRec").classList.contains("live")`, 10000);
      await page.sleep(2200); await page.click("#pkwRec");
      await page.waitFor(`!!document.querySelector(".pkw-sent.ok, .pkw-sent.warn")`, 15000, name + " upload");
      if (!(await page.evaluate(`!!document.querySelector(".pkw-sent.ok")`))) problem(name, "recording not sent: " + (await page.evaluate(`document.querySelector(".pkw-sent").textContent`)));
      await page.click("#pkwNext");
    } else await page.click("#pkwSkip");
    await page.waitForSelector("#pkwAgain");
    await page.waitFor(`/已儲存/.test(document.getElementById("pkwSave").textContent)`, 15000, name + " saved");
    await page.sleep(600);
    return { mission, teacherNote, errors: page.errors.slice() };
  } catch (e) { problem(name, e.message); await page.shot(`${OUT}/error-${name}.png`); return { mission: "", teacherNote: "", errors: page.errors.slice() }; }
  finally { await page.close(); }
}
const a = await studentPlays("王小明", { topic: "9-1", level: "A2", mistakes: 4 });
const b = await studentPlays("陳美麗", { topic: "9-1", level: "A2", mistakes: 1, width: 390, height: 844 });
const c = await studentPlays("林大華", { topic: "9-1", level: "A2", mistakes: 0, record: false });
[a, b, c].forEach((r, i) => r.errors.forEach(e => problem("student " + (i + 1), e)));

// ── 3. the teacher ──
const page = await browser.page({ width: 1366, height: 900 });
let n = 0; const shot = async name => { await page.shot(`${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, { fullPage: true }); };
const step = async (where, fn) => { try { await fn(); await audit(page, where); } catch (e) { problem(where, e.message); await page.shot(`${OUT}/error-${where.replace(/\W+/g, "-")}.png`); } };
await page.goto(BASE + "/health"); await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(admin))});`);
await page.goto(BASE + "/pages/teacher_dashboard.html");
await page.waitFor(`typeof MODULE_LOADERS === "object" && /\\d/.test(document.body.textContent)`, 8000, "dashboard ready"); await page.sleep(800);   // the menu answers once the sign-in check is done

await step("courses", async () => {
  await page.click('[data-module="courses"]'); await page.waitForSelector("#tcCourse");
  await page.evaluate(`(() => { const s = document.getElementById("tcCourse"); s.value = "${course.id}"; s.dispatchEvent(new Event("change")); })()`);
  await page.waitFor(`document.querySelectorAll("#tcRoster tbody tr").length === 4`, 8000, "roster of 4");
  const classes = await page.evaluate(`[...document.querySelectorAll("#tcRoster tbody tr")].map(r => r.children[0].textContent).join(",")`);
  if (!classes.includes("資工三甲") || !classes.includes("應英二乙")) problem("courses", "the roster does not show the 系級: " + classes);
  await shot("courses-roster");
});

await step("records: by game", async () => {
  await page.click('[data-module="records"]'); await page.waitForSelector("#trCourse");
  await page.evaluate(`(() => { const s = document.getElementById("trCourse"); s.value = "${course.id}"; s.dispatchEvent(new Event("change")); })()`);
  await page.waitFor(`document.querySelectorAll("#trView [data-student]").length === 4`, 10000, "class table with 4 students");
  const rows = await page.evaluate(`[...document.querySelectorAll("#trView [data-student]")].map(r => [...r.children].slice(0, 6).map(c => c.textContent.trim()).join(" | "))`);
  notes.push("class table: " + rows.join("  //  "));
  if (!rows.some(r => /還沒玩/.test(r))) problem("records: by game", "the student who has not played is not marked 還沒玩");
  if (!(await page.evaluate(`document.querySelector("#trView").textContent`)).includes("最難的句子")) problem("records: by game", "no hardest-sentences table");
  const hardest = await page.evaluate(`(() => { const r = document.querySelector("#trView section:nth-of-type(3) tbody tr"); return r ? [...r.children].map(c => c.textContent.trim()).join(" | ") : ""; })()`);
  notes.push("hardest sentence row: " + hardest);
  await shot("records-game");
});

await step("records: 系級 filter", async () => {
  const opt = await page.evaluate(`[...document.querySelectorAll("#trSection option")].map(o => o.textContent).join(",")`);
  if (!opt.includes("資工三甲") || !opt.includes("應英二乙")) problem("records: 系級 filter", "系級 options missing: " + opt);
  await page.evaluate(`(() => { const s = document.getElementById("trSection"); s.value = [...s.options].find(o => o.textContent.includes("資工三甲")).value; s.dispatchEvent(new Event("change")); })()`);
  await page.waitFor(`document.querySelectorAll("#trView [data-student]").length === 2`, 10000, "2 students in 資工三甲");
  await shot("records-game-one-class");
  await page.evaluate(`(() => { const s = document.getElementById("trSection"); s.value = ""; s.dispatchEvent(new Event("change")); })()`);
  await page.waitFor(`document.querySelectorAll("#trView [data-student]").length === 4`, 10000);
});

await step("records: one student", async () => {
  await page.evaluate(`[...document.querySelectorAll("#trView [data-student]")].find(r => r.textContent.includes("王小明")).click()`);
  await page.waitForSelector("#trBack"); await page.sleep(500);
  const text = await page.evaluate(`document.getElementById("trView").textContent`);
  for (const must of ["王小明", "卡牌遊戲", "需要再練的句子", "語音", "這位學生的每一局"]) if (!text.includes(must)) problem("records: one student", "missing on the student page: " + must);
  if (!(await page.evaluate(`document.querySelectorAll("#trView .tr-clip").length`))) problem("records: one student", "the student's recording is not on the student page");
  await shot("records-student");
});

await step("records: one run", async () => {
  await page.click("#trView [data-run]"); await page.waitForSelector("#trClose"); await page.sleep(300);
  const summary = await page.evaluate(`document.querySelector(".tr-summary").textContent`);
  notes.push("run summary: " + summary);
  const cards = await page.evaluate(`document.querySelectorAll(".tr-sheet table tbody tr").length`);
  if (cards < 12) problem("records: one run", "the card-by-card table has only " + cards + " rows");
  await page.evaluate(`document.querySelector(".tr-sheet details").open = true`);
  await page.shot(`${OUT}/${String(++n).padStart(2, "0")}-records-run.png`);
  await page.click("#trClose");
});

await step("records: voice queue", async () => {
  await page.click("#trBack"); await page.waitFor(`document.querySelectorAll("#trView [data-student]").length === 4`);
  await page.click('.tr-tab[data-tab="voice"]'); await page.waitForSelector(".tr-clip");
  const clips = await page.evaluate(`document.querySelectorAll(".tr-clip").length`);
  if (clips !== 2) problem("records: voice queue", "expected 2 recordings (two students recorded), found " + clips);
  await shot("records-voice");
  // play the first one: the audio must really load and have a duration
  await page.click(".tr-clip [data-play]");
  await page.waitFor(`(() => { const a = document.querySelector(".tr-clip audio"); return a && a.readyState >= 1 && (a.duration > 0 || a.duration === Infinity); })()`, 12000, "audio loads in the teacher's player");
  const st = await page.evaluate(`document.querySelector(".tr-clip [data-st]").textContent`);
  if (st !== "已聽") problem("records: voice queue", "playing did not mark it 已聽 (shows " + st + ")");
  // ask 王小明 for a new take
  await page.evaluate(`(() => { const box = [...document.querySelectorAll(".tr-clip")].find(b => b.textContent.includes("王小明")); box.querySelector("[data-status]").value = "redo"; box.querySelector("[data-note]").value = "句尾的 s 要念出來，再錄一次。"; box.querySelector("[data-save]").click(); })()`);
  await page.waitFor(`[...document.querySelectorAll(".tr-clip")].find(b => b.textContent.includes("王小明")).querySelector("[data-st]").textContent === "請重錄"`, 8000, "status saved");
  await shot("records-voice-feedback");
});

await step("records: export", async () => {
  const r = await fetch(`${BASE}/learning/records/export.xlsx?game=pecha_kucha&course_id=${course.id}`, { headers: { Authorization: "Bearer " + T } });
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (r.status !== 200 || bytes[0] !== 0x50 || bytes.length < 8000) problem("records: export", "export failed: " + r.status + " " + bytes.length + " bytes");
  notes.push("excel export: " + bytes.length + " bytes");
});
page.errors.forEach(e => problem("teacher browser", e));
await page.close();

// ── 4. the student sees the teacher's note the next time ──
const again = await studentPlays("王小明", { topic: "9-1", level: "A2", mistakes: 4, second: true });
if (!/句尾的 s/.test(again.teacherNote)) problem("feedback loop", "the student does not see the teacher's note on the read-aloud step: '" + again.teacherNote + "'");
if (!/上次/.test(again.mission)) problem("feedback loop", "the second run's mission card does not mention last time");
again.errors.forEach(e => problem("student again", e));

await browser.close();
const storage = (await api("GET", "/teacher/recordings?limit=500", null, T)).body;
console.log(JSON.stringify({ course: course.name, recordings: storage.recordings.map(r => ({ who: r.name, class: r.section, seconds: r.seconds, kb: Math.round(r.size_bytes / 1024), status: r.status })), notes, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
