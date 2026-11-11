// Makes the how-to videos (real site, real clicks, a caption under each step) and the written guides:
//   docs/videos/teacher/01-課程與名單.webm        course, what it opens, roster with 系級, account sheet
//   docs/videos/student/01-登入到玩完一局.webm    first sign-in, new password, one full game, read aloud
//   docs/videos/teacher/02-學習紀錄與語音.webm    class → student → one run → listen and give feedback → Excel
//   docs/videos/teacher/03-教材管理.webm          edit, draft, checks, preview, publish, versions, import, undo
//   docs/videos/student/操作說明.md · docs/videos/teacher/操作說明.md   the same steps in words, with the time in the video
// Run:  node scripts/videos/make-videos.mjs
// Needs the backend on http://127.0.0.1:8000 with a throw-away database (admin@example.com / AdminPass123);
// the command is in scripts/playtest/README.md. Do not run it against a real database:
// it creates a course, four student accounts and a topic.
import { writeFileSync, statSync } from "node:fs";
import { launch } from "../playtest/cdp.mjs";
import { startRecording } from "./recorder.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const DIR = "docs/videos";
const api = async (method, path, body, token) => { const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => null); };
const admin = await api("POST", "/auth/login", { email: "admin@example.com", password: "AdminPass123" });
if (!admin || !admin.access_token) { console.error("Cannot sign in as admin. Is the test backend running?"); process.exit(2); }
const stamp = String(Date.now()).slice(-5);
// Speech that takes about a second, so "朗讀中" can be seen but the video stays short.
const SPEECH = `(() => { const fake = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend({}), 900); } }; try { Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true }); } catch (e) {} })()`;
const signIn = (rec, session) => rec.evaluate(`localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(session))});`);
const browser = await launch();
const made = [], failed = [];
// One video at a time; if one stops half-way the reason is printed and the next one is still made.
const video = async (name, fn) => { try { await fn(); } catch (e) { failed.push(name); console.error("FAILED " + name + ": " + e.message); if (live) { try { await live.stop(); } catch (x) {} live = null; } } };
let live = null;
const start = async opts => (live = await startRecording(browser, opts));
const done = async (rec, folder, title) => { const r = await rec.stop(); live = null; made.push({ folder, title, file: r.out, ...r, kb: Math.round(statSync(r.out).size / 1024) }); console.log("recorded", r.out, r.seconds + " s"); };

// ───────── teacher 1: course and roster ─────────
let courseName = "英語簡報 " + stamp, account = null, courseId = null;
await video("老師 1 課程與名單", async () => {
  const rec = await start({ out: `${DIR}/teacher/01-課程與名單.webm`, base: BASE });
  await rec.open("/health"); await signIn(rec, admin);
  await rec.open("/pages/teacher_dashboard.html"); await rec.sleep(1500);
  await rec.say("老師後台左邊是選單。先到「課程與名單」建立課程。");
  await rec.click('[data-module="courses"]'); await rec.waitForSelector("#tcNew");
  await rec.say("按「＋ 新增課程」，填學期、課號、課程名稱。");
  await rec.click("#tcNew");
  await rec.type("#tcTerm", "1151"); await rec.type("#tcCode", "EN" + stamp); await rec.type("#tcName", courseName);
  await rec.click('#tcForm button[type="submit"]'); await rec.waitFor(`document.querySelector("#tcCourse option:checked") && document.querySelector("#tcCourse option:checked").textContent.includes("${stamp}")`);
  courseId = Number(await rec.evaluate(`document.getElementById("tcCourse").value`));
  await rec.say("勾選這門課要開放的主題和難度：勾了就自動儲存。學生在卡牌遊戲只會看到這些。有 🔒 的主題要先到教材管理開放。");
  await rec.click('.tc-act[data-topic="9-1"] input[value="A2"]', { pause: 300 }); await rec.click('.tc-act[data-topic="13-1"] input[value="A2"]', { pause: 300 });
  await rec.waitFor(`/已儲存/.test(document.getElementById("tcActsMsg").textContent)`, 10000, "open topics saved");
  await rec.say("匯入名單：從試算表複製貼上。欄位是系級、學號、姓名、email；每位學生都要有系級。");
  const roster = `系級\t學號\t姓名\temail\n資工三甲\t41${stamp}1\t王小明\t\n資工三甲\t41${stamp}2\t陳美麗\t\n應英二乙\t41${stamp}3\t林大華\t\n應英二乙\t\t沒有學號的同學\t\n`;
  await rec.type("#tcText", roster);
  await rec.say("先按「預覽」：系統會告訴你每一列會怎麼處理，有問題的列會標出來，這時候還不會寫入。");
  await rec.click("#tcPreview"); await rec.waitForSelector("#tcCommit"); await rec.sleep(1800);
  await rec.say("確認沒問題再按「確認匯入」。同一份名單重複匯入也不會產生重複帳號。");
  await rec.click("#tcCommit"); await rec.waitForSelector("#tcSheetCsv", 20000);
  await rec.say("帳號單只顯示這一次：每位學生的帳號和初始密碼。請現在下載，發給學生。", 2600);
  account = await rec.evaluate(`(() => { const r = [...document.querySelectorAll("#tcPreviewOut table tbody tr")].find(x => x.textContent.includes("王小明")); return { email: r.children[3].textContent.trim(), password: r.children[4].textContent.trim() }; })()`);
  await rec.evaluate(`document.getElementById("tcRoster").scrollIntoView({ block: "center" })`);
  await rec.say("下面的學生名單可以重設密碼、標記退選。學生第一次登入時要先換成自己的密碼。", 2400);
  await rec.evaluate(`document.getElementById("tcChipsPanel").scrollIntoView({ block: "center" })`);
  await rec.say("最下面是籌碼：每位學生有幾個、哪些局的籌碼在等你確認，也可以手動加減並寫理由。", 2600);
  await done(rec, "teacher", "課程與名單");
});

// ───────── student: first sign-in and one game ─────────
await video("學生 登入到玩完一局", async () => {
  if (!account) throw new Error("no student account (the first video did not finish)");
  const rec = await start({ out: `${DIR}/student/01-登入到玩完一局.webm`, base: BASE, init: SPEECH });
  await rec.open("/health"); await rec.evaluate("localStorage.clear()");
  await rec.open("/pages/login.html");
  await rec.say("用老師發給你的帳號（學號@學校信箱）和初始密碼登入。");
  await rec.type('input[type="email"]', account.email); await rec.type('input[type="password"]', account.password);
  await rec.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => !x.classList.contains("guest-btn") && !x.closest(".input-icon")); b.id = "vLogin"; })()`);
  await rec.click("#vLogin");
  await rec.waitFor(`location.pathname.endsWith("/change_password.html")`, 15000, "password page");
  await rec.say("第一次登入要先換成自己的密碼：至少 8 個字，要有英文字母和數字。");
  const pw = "Student" + stamp;
  await rec.type("#current", account.password); await rec.type("#next", pw); await rec.type("#again", pw);
  await rec.click("#go"); await rec.waitFor(`location.pathname.endsWith("/member_index.html")`, 15000, "hub");
  await rec.waitForSelector('[data-game="pecha-kucha-builder"]');
  await rec.say("進到遊戲大廳。點「Pecha Kucha Card Game」。");
  await rec.click('[data-game="pecha-kucha-builder"]');
  await rec.waitFor(`location.pathname.endsWith("/pecha_kucha_builder.html") && !!document.querySelector(".pk-tcard")`, 15000, "game menu");
  await rec.evaluate(SPEECH);
  await rec.say("這裡只會出現老師這門課開放的主題。點一張主題牌。");
  await rec.click(`.pk-tc-open[data-topic="9-1"]`); await rec.waitForSelector(`#pkPick.open .pk-lv[data-level="A2"]`);
  await rec.say("牌會翻過來：選難度，按一下就開始。", 1800);
  await rec.click(`#pkPick .pk-lv[data-level="A2"]`); await rec.waitForSelector("#pkMissionGo");
  await rec.say("任務卡：今天的目標和這場演講的六段。按「開始」。", 2200);
  await rec.click("#pkMissionGo");
  await rec.say("上面的 1–6 是六段。點 1，牌會發到桌上；其中 1 張是陷阱，沒有句子屬於它。");
  await rec.click("#topicGrid .topic:nth-child(1)"); await rec.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`); await rec.sleep(900);
  await rec.say("點牌堆抽一張句子卡，再按右下的喇叭聽這一句。");
  await rec.click("#mainDeck"); await rec.click("#pkSpeakBtn"); await rec.waitFor("canDrag === true");
  await rec.say("把句子點到（或拖到）對應的投影片卡上。配錯會晃一下，可以再試；想再聽就再按喇叭。");
  let sub = await rec.evaluate("currentCardData.subId");
  await rec.click(`#subBox .subtopic-poker:not(.correct):not([data-sub-id="${sub}"])`, { pause: 900 });
  await rec.click(`#subBox .subtopic-poker[data-sub-id="${sub}"]`, { pause: 900 });
  await rec.say("配對了會打勾。繼續抽下一張，直到這一段完成。");
  const playRest = async pause => { for (;;) { if (!(await rec.evaluate("gameData.length + (currentCardData ? 1 : 0)"))) break; await rec.click("#mainDeck", { pause }); await rec.click("#pkSpeakBtn", { pause: 100 }); await rec.waitFor("canDrag === true"); sub = await rec.evaluate("currentCardData.subId"); await rec.click(`#subBox .subtopic-poker[data-sub-id="${sub}"]`, { pause }); } await rec.sleep(700); };
  await playRest(500);
  await rec.say("一段完成後，上面的數字會變成金色。其他五段也是一樣的玩法（影片加快）。", 2000);
  for (let i = 2; i <= 6; i++) { await rec.click(`#topicGrid .topic:nth-child(${i})`, { pause: 200 }); await rec.waitFor(`/牌發好了/.test(document.getElementById("status").textContent)`); await rec.sleep(300); await playRest(160); }
  await rec.waitForSelector("#pkWrap .pkw-card"); await rec.sleep(1200);
  await rec.say("六段完成！這裡有聽懂分數，和第一次沒配對到的句子：屬於哪一張、你放到哪一張，可以按喇叭再聽。", 3200);
  await rec.click("#pkwNext"); await rec.waitForSelector("#pkwRec");
  await rec.say("念一張投影片（大約 20 秒）。按「開始朗讀」，念完按「念完了」。");
  await rec.click("#pkwRec"); await rec.waitFor(`document.getElementById("pkwRec").classList.contains("live")`, 12000, "recording"); await rec.sleep(3200);
  await rec.click("#pkwRec"); await rec.waitFor(`!!document.querySelector(".pkw-sent.ok, .pkw-sent.warn")`, 20000, "upload");
  await rec.say("錄音會自動送給老師。可以試聽、重錄；老師之後給的回饋，下次念這一張時會看到。", 3000);
  await rec.click("#pkwNext"); await rec.waitForSelector("#pkwAgain"); await rec.waitFor(`/\\+\\d+/.test(document.querySelector("#pkwChips p").textContent)`, 12000).catch(() => {});
  await rec.say("最後一步：這一局拿到的籌碼、個人紀錄、建議哪一天再來。想多練可以做小測或寫一句反思。", 3200);
  await rec.click("#pkwAgain"); await rec.waitForSelector("#pkMissionGo"); await rec.sleep(900);
  await rec.say("再玩一次時，任務卡會提醒你上次配錯幾句、個人最佳是多少。牌桌左下的籌碼堆會一直累積。", 3000);
  await done(rec, "student", "登入到玩完一局");
});

// ───────── teacher 2: learning records and voice ─────────
await video("老師 2 學習紀錄與語音", async () => {
  const rec = await start({ out: `${DIR}/teacher/02-學習紀錄與語音.webm`, base: BASE });
  await rec.open("/health"); await signIn(rec, admin);
  await rec.open("/pages/teacher_dashboard.html"); await rec.sleep(1500);
  await rec.say("「學習紀錄」可以看每個遊戲、每位學生、每一局的完整資料。");
  await rec.click('[data-module="records"]'); await rec.waitForSelector("#trCourse");
  await rec.evaluate(`(() => { const s = document.getElementById("trCourse"); s.value = "${courseId}"; s.dispatchEvent(new Event("change")); })()`);
  await rec.waitFor(`document.querySelectorAll("#trView [data-student]").length >= 3`, 15000, "class table"); await rec.sleep(600);
  await rec.say("先選課程。最上面會列出「先看這幾位」和原因，例如還沒玩、分數偏低、有錄音還沒聽。", 3000);
  await rec.evaluate(`document.querySelector("#trView .tr-table").scrollIntoView({ block: "center" })`);
  await rec.say("學生表：每位學生的系級、局數、分數變化、第一次就配對幾句、有沒有送出錄音。還沒玩的也會列出來。", 3200);
  await rec.evaluate(`[...document.querySelectorAll("#trView h3")].find(h => h.textContent.includes("最難的句子")).scrollIntoView({ block: "start" })`);
  await rec.say("最難的句子：全班哪一句最常第一次配錯、最常被放到哪一張。上面有一句白話結論。", 3200);
  await rec.evaluate(`window.scrollTo(0, 0)`);
  await rec.say("點一位學生，看他的個人總覽。");
  await rec.evaluate(`(() => { const r = [...document.querySelectorAll("#trView [data-student]")].find(x => x.textContent.includes("王小明")); r.id = "vStudent"; })()`);
  await rec.click("#vStudent"); await rec.waitForSelector("#trBack"); await rec.sleep(700);
  await rec.say("個人總覽：玩過哪些遊戲、各主題的進步、需要再練的句子、他送出的錄音。", 3000);
  await rec.evaluate(`document.querySelector("#trView [data-run]").scrollIntoView({ block: "center" })`);
  await rec.say("最下面是他的每一局。點一局可以看每一張卡：第一次對不對、放了幾次、重聽幾次、放錯到哪一張。");
  await rec.click("#trView [data-run]"); await rec.waitForSelector("#trClose"); await rec.sleep(2600);
  await rec.click("#trClose");
  await rec.say("回到全班，切到「語音」：學生念完自動送出的錄音都在這裡。");
  await rec.click("#trBack"); await rec.waitFor(`document.querySelectorAll("#trView [data-student]").length >= 3`);
  await rec.click('.tr-tab[data-tab="voice"]'); await rec.waitForSelector(".tr-clip");
  await rec.say("按「播放」就能聽，旁邊有學生念的原文、秒數和語速。播放後自動標成「已聽」。");
  await rec.click(".tr-clip [data-play]"); await rec.sleep(2600);
  await rec.say("把狀態改成「請重錄」並寫一句回饋（改了就會儲存）：學生下次會被要求重念這一張，並看到你的回饋。");
  await rec.evaluate(`(() => { const s = document.querySelector(".tr-clip [data-status]"); s.value = "redo"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`); await rec.sleep(900);
  await rec.type(".tr-clip [data-note]", "句尾的 s 要念出來，再錄一次。", { blur: false });
  await rec.click(".tr-clip [data-save]"); await rec.sleep(1500);
  await rec.say("回到「依遊戲看全班」可以匯出 Excel：含姓名的給自己看，只有研究代碼的可以給研究用。", 3000);
  await done(rec, "teacher", "學習紀錄與語音");
});

// ───────── teacher 3: material editor ─────────
await video("老師 3 教材管理", async () => {
  const rec = await start({ out: `${DIR}/teacher/03-教材管理.webm`, base: BASE });
  await rec.open("/health"); await signIn(rec, admin);
  await rec.open("/pages/teacher_dashboard.html"); await rec.sleep(1500);
  await rec.say("「教材管理」：學生在遊戲裡看到的主題、投影片標題和講稿，都在這裡改。");
  await rec.click('[data-module="library"]'); await rec.waitForSelector("#tlTree [data-topic]"); await rec.sleep(900);
  await rec.say("左邊是樹狀清單：遊戲 → 主題 → 難度。可以用上面的搜尋框找主題。", 2600);
  await rec.click('#tlTree [data-topic="9-2"]'); await rec.waitFor(`document.querySelector(".tl-code") && document.querySelector(".tl-code").textContent.includes("9-2") && !!document.querySelector("#tlEdit [data-f='script']")`); await rec.sleep(600);
  await rec.say("右邊上面是主題的狀態：現在學生看到的是第幾版。下面依段落列出每一張投影片。", 3000);
  await rec.click('#tlList [data-no="3"]');
  await rec.evaluate(`document.querySelector('#tlEdit [data-f="script"]').scrollIntoView({ block: "center" })`);
  await rec.say("點一張投影片就能改標題和講稿。講稿下面會算字數和大約要念幾秒。");
  // Two wordings: whichever is not there already, so there is always something new to publish.
  const lines = ["Many of us ask AI to fix our lab reports and explain hard ideas, because it is fast and easy to use every day.", "Many of us ask AI to check our lab reports and explain hard ideas, because it is quick and easy to use every day."];
  const now = await rec.evaluate(`document.querySelector('#tlEdit [data-f="script"]').value`);
  await rec.type('#tlEdit [data-f="script"]', now.trim() === lines[0] ? lines[1] : lines[0]);
  await rec.waitFor(`/草稿已自動儲存/.test(document.getElementById("tlState").textContent)`, 10000, "draft saved");
  await rec.evaluate(`document.getElementById("tlState").scrollIntoView({ block: "center" })`);
  await rec.say("改完不用按儲存：自動存成「草稿」，學生還看不到。改到講稿時會提醒你發佈後是新的一版。", 3400);
  await rec.say("按「預覽」可以用學生的畫面先玩玩看這份草稿（不會留下紀錄）。確認後按「發佈給學生」。", 3000);
  await rec.click("#tlPublish"); await rec.waitFor(`/已發佈第 \\d+ 版/.test(document.getElementById("tlState").textContent)`, 10000, "published"); await rec.sleep(1200);
  await rec.say("發佈後學生就會看到新內容。每一版都留著，「發佈紀錄」裡可以把舊版取回來。", 2600);
  await rec.evaluate(`(() => { const d = document.querySelector(".tl-history"); d.open = true; d.scrollIntoView({ block: "center" }); })()`); await rec.sleep(2200);
  await rec.say("刪除不會跳出確認視窗：直接刪，下方會出現「復原」。例如刪掉一張投影片…");
  await rec.evaluate(`document.getElementById("tlDelSlide").scrollIntoView({ block: "center" })`);
  await rec.click("#tlDelSlide"); await rec.sleep(1500);
  await rec.say("…按「復原」就回來了。少一張時，上面也會用白話告訴你哪裡不對、不讓你發佈。");
  await rec.click("#tlUndo"); await rec.sleep(1500);
  await rec.say("要新增主題：按左下「＋ 新增主題」，可以從空白開始、複製現有主題，或從試算表整批貼上匯入。", 3000);
  await rec.click("#tlNew"); await rec.waitForSelector("#tlNewId"); await rec.sleep(2200);
  await rec.click("#tlNewCancel");
  await rec.say("每個主題都能上鎖、匯出 Excel、刪除（可復原）。3D 遊戲的教材目前還不能在這裡改，清單最下面有說明。", 3400);
  await done(rec, "teacher", "教材管理");
});
await browser.close();

// ───────── the written guides ─────────
const guide = (who, intro) => {
  const mine = made.filter(m => m.folder === who);
  return `# ${who === "student" ? "學生" : "老師"}操作說明\n\n${intro}\n\n` + mine.map(m => `## ${m.title}\n\n影片：\`${m.file.split("/").pop()}\`（${Math.floor(m.seconds / 60)} 分 ${m.seconds % 60} 秒，${m.kb} KB）\n\n| 步驟 | 影片時間 | 說明 |\n|---|---|---|\n` + m.steps.map((s, i) => `| ${i + 1} | ${s.at} | ${s.text} |`).join("\n")).join("\n\n")
    + `\n\n---\n影片是用測試資料錄的（測試課程與學生），沒有聲音；畫面下方的字幕就是上表的說明。影片格式是 WebM，用 Chrome、Edge 或 VLC 開啟。\n重新產生：啟動測試用後端後執行 \`node scripts/videos/make-videos.mjs\`。\n`;
};
writeFileSync(`${DIR}/student/操作說明.md`, guide("student", "從拿到帳號到玩完一局卡牌遊戲、朗讀並送出錄音。整個流程大約 15–20 分鐘（影片把配對的部分加快了）。"), "utf8");
writeFileSync(`${DIR}/teacher/操作說明.md`, guide("teacher", "老師後台的三件事：建立課程與匯入名單、看學習紀錄與聽錄音、修改教材。後台網址：`/pages/teacher_dashboard.html`（需要老師或管理員帳號）。"), "utf8");
console.log(JSON.stringify(made.map(m => ({ file: m.file, seconds: m.seconds, kb: m.kb, steps: m.steps.length })), null, 1));
if (failed.length) { console.error("NOT MADE: " + failed.join("; ")); process.exit(1); }
