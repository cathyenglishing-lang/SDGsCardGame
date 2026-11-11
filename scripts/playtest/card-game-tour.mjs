// Walks through every screen and transition of the Pecha Kucha Card Game with real clicks, takes a
// screenshot of each, and reports page errors, covered or off-screen controls and broken resets.
//   node scripts/playtest/card-game-tour.mjs [outDir] [sizes]      sizes like 1180x820,1024x768,390x844
// Needs the backend on http://127.0.0.1:8000 with a throw-away database and the admin
// admin@example.com / AdminPass123 (the command is in scripts/playtest/README.md).
import { launch, FAKE_SPEECH } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = process.argv[2] || ".playwright-mcp/tour";
const SIZES = (process.argv[3] || "1180x820,1024x768,390x844").split(",").map(s => s.split("x").map(Number));
const TOPIC = process.env.TOPIC || "4-1", LEVEL = process.env.LEVEL || "A2";

const login = await (await fetch(BASE + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "AdminPass123" }) })).json();
if (!login.access_token) { console.error("Cannot sign in. Is the test backend running?", login); process.exit(2); }
const auth = { Authorization: "Bearer " + login.access_token, "Content-Type": "application/json" };

const browser = await launch();
const report = { sizes: {}, problems: [] };
const problem = (size, where, what) => { const s = `[${size}] ${where}: ${what}`; if (!report.problems.includes(s)) report.problems.push(s); };

for (const [w, h] of SIZES) {
  const size = `${w}x${h}`, steps = [];
  const page = await browser.page({ width: w, height: h, init: FAKE_SPEECH });
  let n = 0;
  const shot = async name => { const file = `${OUT}/${size}-${String(++n).padStart(2, "0")}-${name}.png`; await page.shot(file); steps.push(file); };
  // Layout rules that must hold on every screen.
  const audit = async where => {
    const bad = await page.evaluate(() => {
      const out = [], vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none"; };
      const name = e => e.id ? "#" + e.id : "." + String(e.className).split(" ")[0];
      const shown = sel => [...document.querySelectorAll(sel)].filter(vis);
      const game = !document.getElementById("gameScreen").classList.contains("hidden") && document.getElementById("pkWrap").classList.contains("hidden") && document.getElementById("pkMission").classList.contains("hidden");
      const scope = !document.getElementById("pkWrap").classList.contains("hidden") ? "#pkWrap " : !document.getElementById("pkMission").classList.contains("hidden") ? "#pkMission " : game ? "#gameScreen " : "#selectorScreen ";
      shown(scope + "button, " + scope + ".subtopic-poker, " + scope + ".topic, " + scope + ".pk-tcard, " + scope + ".pkw-card, " + scope + "#dealtCardHolder, " + scope + "#mainDeck, " + scope + "#gameTimer, " + scope + ".pk-wallet, " + scope + ".pk-hud-left > *, " + scope + ".header-actions > *").forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.left < -1 || r.right > innerWidth + 1) out.push(name(e) + " runs off the side (" + Math.round(r.left) + ".." + Math.round(r.right) + " of " + innerWidth + ")");
      });
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push("the page scrolls sideways (" + document.documentElement.scrollWidth + " > " + innerWidth + ")");
      if (game) {
        const R = s => { const e = document.querySelector(s); return e && vis(e) ? e.getBoundingClientRect() : null; };
        const hit = (a, b) => a && b && !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
        const dock = ["#gameTimer", "#pkWallet", "#dealtCardHolder", "#mainDeck", "#pkSpeakBtn", "#pkRateBtn"];
        for (let i = 0; i < dock.length; i++) for (let j = i + 1; j < dock.length; j++) if (hit(R(dock[i]), R(dock[j]))) out.push(dock[i] + " overlaps " + dock[j]);
        const hud = ["#pkSdgBadge", "#pkLevelChip", ".pk-change-btn", "#topicGrid", "#pkStreak", "#pkSaveChip"];
        for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) if (hit(R(hud[i]), R(hud[j]))) out.push(hud[i] + " overlaps " + hud[j]);
        // title cards must not hide under the dock when the page is scrolled to the top
        const dockTop = (R(".deck-panel") || { top: innerHeight }).top + 40;
        shown("#subBox .subtopic-poker").forEach(e => { const r = e.getBoundingClientRect(); if (r.bottom > document.documentElement.scrollHeight) out.push("a title card is cut off"); });
        const cards = shown("#subBox .subtopic-poker").map(e => e.getBoundingClientRect());
        for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = cards[i], b = cards[j]; const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 18 && oy > 18) out.push("two title cards overlap by " + Math.round(ox) + "px"); }
      }
      // text clipped inside buttons
      shown(scope + "button").forEach(e => { if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) out.push(name(e) + " text is clipped: " + e.textContent.trim().slice(0, 20)); });
      return out;
    });
    bad.forEach(b => problem(size, where, b));
  };
  const expect = async (where, expr, what) => { if (!(await page.evaluate(expr))) problem(size, where, what); };
  const guard = async (where, fn) => { try { await fn(); } catch (e) { problem(size, where, e.message); } };

  await page.goto(BASE + "/health");
  await page.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(login))});`);

  // ── menu → mission → empty table ──
  await page.goto(BASE + "/pages/pecha_kucha_builder.html");
  await page.waitForSelector(".pk-tcard"); await page.sleep(500);
  await audit("menu"); await shot("menu");
  await guard("mission → back to the menu", async () => {
    await page.click(`.pk-tc-open[data-topic="${TOPIC}"]`); await page.waitForSelector(`#pkPick.open .pk-lv[data-level="${LEVEL}"]`); await page.sleep(750); await page.click(`#pkPick .pk-lv[data-level="${LEVEL}"]`); await page.waitForSelector("#pkMissionBack"); await page.sleep(450);
    await page.click("#pkMissionBack"); await page.waitForSelector(".pk-tcard");
    if (await page.evaluate(`RUN !== null || !document.getElementById("pkMission").classList.contains("hidden")`)) problem(size, "mission → back", "leaving the mission card left a run or the card open");
  });
  await guard("menu → mission", async () => { await page.click(`.pk-tc-open[data-topic="${TOPIC}"]`); await page.waitForSelector(`#pkPick.open .pk-lv[data-level="${LEVEL}"]`); await page.sleep(750); await page.click(`#pkPick .pk-lv[data-level="${LEVEL}"]`); await page.waitForSelector("#pkMissionGo"); });
  await page.sleep(500); await audit("mission"); await shot("mission");
  await expect("mission", `document.getElementById("selectorScreen").classList.contains("hidden")`, "the menu is still showing behind the mission card");
  await guard("mission → table", async () => { await page.click("#pkMissionGo"); });
  await page.sleep(400); await audit("table empty"); await shot("table-empty");
  await expect("table empty", `document.getElementById("pkSpeakBtn").disabled`, "the listen button is enabled with no card in hand");

  const playPart = async (index, { mistakes = 0, shots = false } = {}) => {
    await page.click(`#topicGrid .topic:nth-child(${index})`);
    await page.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`);
    await page.sleep(650);
    // Every title card carries a Chinese line under the title: the teacher's hint, or the slide's Chinese title.
    const noHint = await page.evaluate(`[...document.querySelectorAll("#subBox .subtopic-poker")].filter(c => !/[㐀-鿿]/.test((c.querySelector(".card-kw") || {}).textContent || "")).length`);
    if (noHint) problem(size, "part dealt", noHint + " title card(s) on the table have no Chinese hint line");
    if (shots) { await audit("part dealt"); await shot("part-dealt"); }
    let first = true, wrong = mistakes;
    for (;;) {
      if (!(await page.evaluate(`gameData.length + (currentCardData ? 1 : 0)`))) break;
      await page.click("#mainDeck"); await page.sleep(350);
      const fit = await page.evaluate(`(() => { const c = document.querySelector("#dealtCardHolder .poker-card"), t = c.querySelector(".card-scroll-text"); return { over: t.scrollHeight - t.clientHeight, scroll: c.classList.contains("pk-scroll"), px: parseFloat(getComputedStyle(t).fontSize) }; })()`);
      if (fit.over > 1 && !fit.scroll) problem(size, "sentence in hand", "cut off by " + fit.over + " px with no scroll cue");
      if (fit.scroll) problem(size, "sentence in hand", "does not fit even at " + fit.px + " px (it scrolls)");
      const hid = await page.evaluate(`(() => { scrollTo(0, 0); const lim = document.getElementById("dealtCardHolder").getBoundingClientRect().top; const n = [...document.querySelectorAll("#subBox .subtopic-poker:not(.correct)")].filter(c => { const r = c.getBoundingClientRect(); return r.top + r.height * 0.6 > lim; }).length; pkTableCue(); return { n, cue: !document.getElementById("pkMoreCue").hidden }; })()`);
      if (hid.n && !hid.cue) problem(size, "table", hid.n + " title card(s) under the dock and nothing says so");
      if (shots && first) { await audit("card in hand, not heard"); await shot("hand-new"); }
      await page.click("#pkSpeakBtn");
      await page.waitFor(`canDrag === true`);
      await page.sleep(shots && first ? 500 : 60);
      if (shots && first) { await audit("card in hand, heard"); await shot("hand-heard"); await page.click("#pkSpeakBtn"); await page.waitFor(`canDrag === true`); await page.sleep(450); await shot("hand-repeat"); }
      const sub = await page.evaluate(`currentCardData.subId`);
      if (wrong > 0) { wrong--; await page.click(`#subBox .subtopic-poker:not(.correct):not([data-sub-id="${sub}"])`); await page.sleep(150); if (shots) await shot("wrong-drop"); await page.sleep(350); }
      await page.click(`#subBox .subtopic-poker[data-sub-id="${sub}"]`);
      await page.sleep(shots && first ? 400 : 140);
      if (shots && first) { await audit("first match"); await shot("first-match"); }
      first = false;
    }
    await page.sleep(500);
  };

  // ── part 1 in detail ──
  await guard("part 1", () => playPart(1, { mistakes: 1, shots: true }));
  await audit("part done"); await shot("part-done");
  await expect("part done", `document.querySelector("#topicGrid .topic:nth-child(1)").classList.contains("completed")`, "chip 1 is not marked done");
  await expect("part done", `document.getElementById("pkSpeakBtn").disabled && !document.querySelector("#dealtCardHolder .poker-card")`, "hand or listen button not cleared after the part");

  // ── switching parts in the middle of one ──
  await guard("switch part mid-way", async () => {
    await page.click("#topicGrid .topic:nth-child(2)");
    await page.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`);
    await page.click("#mainDeck"); await page.sleep(300);
    await page.click("#topicGrid .topic:nth-child(3)");            // leave part 2 with a card in hand: the page asks first
    await page.waitForSelector("#pkSwitchBar"); await page.sleep(200); await audit("switch bar"); await shot("switch-bar");
    await page.click("#pkSwitchStay"); await page.sleep(150);
    if (await page.evaluate(`currentTopic !== 2 || !currentCardData || !!document.getElementById("pkSwitchBar")`)) problem(size, "switch bar", "「繼續這一段」 did not keep the part and its card");
    await page.click("#topicGrid .topic:nth-child(3)"); await page.waitForSelector("#pkSwitchBar");
    await page.click("#pkSwitchGo");
    await page.waitFor(`currentTopic === 3 && /牌發好了/.test(document.getElementById("status").textContent)`);
    await page.sleep(900);
  });
  await audit("after switching part"); await shot("switched-part");
  await expect("after switching part", `!document.querySelector("#dealtCardHolder .poker-card") && document.getElementById("pkSpeakBtn").disabled`, "the card of the part that was left is still in hand");
  await expect("after switching part", `document.querySelectorAll("#subBox .subtopic-poker").length === DB.subtopics[currentTopic].length + document.querySelectorAll('#subBox [data-decoy="1"]').length`, "cards of the part that was left are on the new table");
  await expect("after switching part", `document.querySelectorAll('#subBox [data-decoy="1"]').length <= 1`, "more than one decoy on the table");

  // fast double switch: cards of the first choice must not land on the second table
  await guard("fast double switch", async () => {
    await page.evaluate(`(() => { const t = document.querySelectorAll("#topicGrid .topic"); t[3].click(); t[4].click(); })()`);
    await page.sleep(1800);
  });
  await expect("fast double switch", `document.querySelectorAll("#subBox .subtopic-poker").length === DB.subtopics[currentTopic].length + document.querySelectorAll('#subBox [data-decoy="1"]').length`, "after two quick part changes the table holds cards from both parts");
  await shot("fast-switch");

  // ── leave to the menu and come back ──
  await guard("table → menu", async () => { await page.click(".pk-change-btn"); await page.waitForSelector(".pk-tcard"); });
  await page.sleep(300); await audit("menu again"); await shot("menu-again");
  await expect("menu again", `document.getElementById("gameScreen").classList.contains("hidden") && document.getElementById("pkMission").classList.contains("hidden") && document.getElementById("pkWrap").classList.contains("hidden")`, "game, mission or wrap-up still showing over the menu");
  await guard("menu → mission again", async () => { await page.click(`.pk-tc-open[data-topic="${TOPIC}"]`); await page.waitForSelector(`#pkPick.open .pk-lv[data-level="${LEVEL}"]`); await page.sleep(750); await page.click(`#pkPick .pk-lv[data-level="${LEVEL}"]`); await page.waitForSelector("#pkMissionGo"); await page.click("#pkMissionGo"); });
  await page.sleep(400);
  await expect("new run", `document.querySelectorAll("#topicGrid .topic.completed").length === 0 && document.querySelectorAll("#subBox .subtopic-poker").length === 0 && document.getElementById("pkStreak").hidden && /00:00/.test(document.getElementById("gameTimer").textContent)`, "a new run did not start clean (chips, table, streak or timer left over)");
  await audit("new run"); await shot("new-run");

  // ── whole run → wrap-up ──
  await guard("full run", async () => { const count = await page.evaluate(`document.querySelectorAll("#topicGrid .topic").length`); for (let i = 1; i <= count; i++) await playPart(i, { mistakes: i <= 2 ? 1 : 0 }); });
  await guard("table → wrap-up", () => page.waitForSelector("#pkWrap .pkw-card"));
  await page.sleep(1200); await audit("wrap: done"); await shot("wrap-done");
  await expect("wrap: done", `document.querySelectorAll("#pkWrap .pkw-list li").length >= 1`, "the missed sentences are not listed on the first step");
  await guard("wrap: hear a missed sentence again", () => page.click("#pkWrap .pkw-ear"));
  await guard("wrap done → read", async () => { await page.click("#pkwNext"); await page.waitForSelector("#pkwRec"); });
  await page.sleep(300); await audit("wrap: read"); await shot("wrap-read");
  await expect("wrap: read", `document.querySelector(".pkw-clip p").textContent.length > 40 && document.getElementById("pkwNext").disabled`, "the read step has no passage, or lets the student go on before reading");
  await guard("wrap: record one take", async () => {
    await page.click("#pkwRec");
    await page.waitFor(`document.getElementById("pkwRec") && document.getElementById("pkwRec").classList.contains("live")`, 10000, "recording started");
    await page.sleep(1500); await shot("wrap-read-recording");
    await page.click("#pkwRec");
    await page.waitFor(`!!document.querySelector("#pkwReadOut .pkw-stats")`, 8000, "take result");
    await page.waitFor(`!!document.querySelector(".pkw-sent.ok, .pkw-sent.warn")`, 15000, "upload finished");
  });
  await page.sleep(200); await audit("wrap: read result"); await shot("wrap-read-result");
  await expect("wrap: read result", `!!document.querySelector(".pkw-sent.ok")`, "the take did not reach the teacher: " + (await page.evaluate(`(document.querySelector(".pkw-sent") || {}).textContent || "no status line"`)));
  await guard("wrap read → next", async () => { await page.click("#pkwNext"); await page.waitForSelector("#pkwAgain"); });
  await page.waitFor(`/\+\d+|籌碼已滿|只計/.test(document.querySelector("#pkwChips p").textContent)`, 12000, "chips").catch(() => {});
  await page.sleep(400); await audit("wrap: next"); await shot("wrap-next"); await page.shot(`${OUT}/${size}-wrap-next-full.png`, { fullPage: true });
  await expect("wrap: next", `/已儲存/.test(document.getElementById("pkwSave").textContent)`, "the last step does not say the result is saved");
  await expect("wrap: three steps", `document.querySelectorAll("#pkWrap .pkw-dot").length === 3`, "the wrap-up is not the short three-step form");

  // the optional extras must lead back to the last step
  await guard("extra: quiz", async () => {
    await page.click("#pkwQuiz");
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector(".pkw-opt[data-w]");
      if (i === 0) { await audit("wrap: quiz"); await shot("wrap-quiz"); }
      await page.click(".pkw-opt[data-w]"); await page.sleep(120);
      if (i === 0) { await audit("wrap: quiz answered"); await shot("wrap-quiz-answered"); }
      await page.click("#pkwNext"); await page.sleep(150);
    }
    await audit("wrap: quiz result"); await shot("wrap-quiz-result");
    await page.click("#pkwNext"); await page.waitForSelector("#pkwAgain");
  });
  await guard("extra: reflect", async () => {
    await page.click("#pkwReflect"); await page.waitForSelector("#pkwSentence");
    await page.click(".pkw-opt[data-i]"); await page.type("#pkwSentence", "I check facts before I share them with my friends.");
    await page.sleep(100); await audit("wrap: reflect"); await shot("wrap-reflect");
    await page.click("#pkwNext"); await page.waitForSelector("#pkwAgain");
  });
  await page.sleep(1500); await audit("wrap: next after extras"); await shot("wrap-next-extras");
  await expect("wrap: next after extras", `!document.getElementById("pkwQuiz") && !document.getElementById("pkwReflect")`, "an extra that was done is offered again");

  // ── play again, then back to the menu from the wrap-up ──
  await guard("wrap-up → again", async () => { await page.click("#pkwAgain"); await page.waitForSelector("#pkMissionGo"); });
  await page.sleep(900); await audit("mission (second run)"); await shot("mission-second");
  await expect("mission (second run)", `document.getElementById("pkWrap").classList.contains("hidden")`, "the wrap-up is still showing behind the mission card");
  await guard("second mission → table", () => page.click("#pkMissionGo"));
  await page.sleep(400);
  await expect("second run", `document.querySelectorAll("#topicGrid .topic.completed").length === 0 && document.getElementById("pkStreak").hidden`, "the second run did not start clean");
  await audit("second run"); await shot("second-run");
  report.sizes[size] = { screenshots: steps.length, pageErrors: page.errors.slice() };
  page.errors.forEach(e => problem(size, "browser", e));
  await page.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
process.exit(report.problems.length ? 1 : 0);
