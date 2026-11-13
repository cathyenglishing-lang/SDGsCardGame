// Teacher dashboard → 學習紀錄: every game, every student, every run, and the voice recordings.
//   依遊戲   one game → the whole class (students who have not played included), hardest sentences,
//            what gets confused with what, how far runs got, the latest runs
//   學生     one student → every game played, score history, sentences to practise, speaking, reflections
//   單一局   card by card, wrap-up answers, the raw event log
//   語音     the listening queue: play, mark heard / ask for a new take, write a note
// Data: backend/learning_reports.py (/learning/records/*) and backend/recordings.py (/teacher/recordings*).
// Topic names, slide titles and sentences come from what 教材管理 published (window.TeacherTopics in
// teacher-courses.js), never from codes. Everything a student or a client could have typed or sent
// goes through esc() or num() before it is put into the page.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // A number or nothing: a value that is not a finite number is never printed.
  const num = v => (v === null || v === undefined || v === "" || typeof v === "boolean" || !isFinite(Number(v)) ? null : Number(v));
  const n = (v, dash = "–") => { const x = num(v); return x === null ? dash : String(x); };
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const head = () => ({ Authorization: "Bearer " + auth.getToken() });
  const toast = (m, undo) => window.teacherToast(m, undo);
  const T = window.TeacherTopics;
  async function get(path, params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "")).toString();
    const r = await fetch(API() + path + (q ? "?" + q : ""), { headers: head() });
    if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "讀取失敗，請按「重新整理」再試一次。"); }
    return r.json();
  }
  async function send(method, path, body) {
    const r = await fetch(API() + path, { method, headers: { ...head(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "沒有成功，請再試一次。"); }
    return r.json();
  }

  const GAME_ZH = { pecha_kucha: "Card Game 卡牌遊戲", "innovation-harbor": "3D Harbor", "sdg4-stage": "SDG 4 Stage" };
  const GAME_SUB = { pecha_kucha: "Pecha Kucha 聽力配對", "innovation-harbor": "Innovation Harbor 3D 故事", "sdg4-stage": "SDG 4 全文朗讀" };
  const STATUS = { new: ["未聽", "warn"], heard: ["已聽", "info"], feedback: ["已回饋", "good"], redo: ["請重錄", "bad"] };
  const FLAG = { trial_and_error: "可能是用試的", fast_and_high: "極快又全對" };
  const FLAG_WHY = { trial_and_error: c => `${c} 局可能是用試的（同一句連放很多張才對）`, fast_and_high: c => `${c} 局極快又全對，請確認是不是本人作答` };
  const FUNNEL = { started: "開局", dealt: "有發牌", matched_all: "配對完", quiz: "做了小測", read: "朗讀", reflect: "反思", done: "走完收尾" };
  const EVENT = {
    "run.start": "開始一局", "mission.close": "看完任務卡", "part.start": "選一段", "card.deal": "發牌", "card.listen": "聽句子", "card.repeat": "重聽", "card.drop": "放卡",
    "part.done": "一段完成", "rate.change": "調語速", "run.finish": "配對完成", "run.abandon": "中途離開", "wrap.start": "進入收尾", "wrap.review": "看檢討", "wrap.review.listen": "檢討時重聽",
    "wrap.read.done": "朗讀完", "wrap.read.sent": "錄音送出", "wrap.read.skip": "跳過朗讀", "wrap.quiz.answer": "小測作答", "wrap.quiz.done": "小測完成", "wrap.reflect": "寫反思", "wrap.done": "收尾完成",
    "speak.record": "錄音", "speak.attempt": "口說嘗試", "speak.skip": "跳過口說", "speak.demo": "聽示範", "pk.record": "簡報錄音", "pk.slide": "換投影片", "pk.redo": "簡報重錄", "pk.skip": "跳過簡報",
    "node.start": "開始關卡", "node.done": "完成關卡", "story.choice": "劇情選擇", "story.line": "劇情對話", "ending": "結局", "listen.play": "播放聽力", "listen.answer": "聽力作答",
    "card.match": "配對", "card.error": "配錯", "card.done": "卡片完成", "chart.open": "打開圖表", "chart.answer": "圖表作答", "hint.zh": "看中文提示", "read.match": "閱讀配對", "seq.done": "排序完成",
    "cardgame.open": "打開卡牌關卡", "map.open": "打開地圖", "move": "移動", "settings.rate": "調語速",
  };
  const S = { courses: [], courseId: "", sectionId: "", from: "", to: "", tab: "class", game: "pecha_kucha", chapter: "", level: "", games: null, report: null, studentId: null, voiceStatus: "", voiceTopic: "", voiceFind: "", showOff: false, secFilter: "", find: "", voiceSort: "new", voiceGroup: "section" };

  // card id ("9-1/A2/s02") → words a teacher can read
  const cardNo = id => T.parse(id).no;
  const cardTitle = id => { const s = T.slide(id); return s ? (s.title_en || s.title_zh || "") : ""; };
  const cardScript = id => { const s = T.slide(id); return s ? (s.script || "") : ""; };
  const cardLabel = id => { const no = cardNo(id), t = cardTitle(id); return no ? `第 ${no} 張${t ? "「" + t + "」" : ""}` : String(id ?? ""); };
  const cardCell = id => { const no = cardNo(id), t = cardTitle(id); return no ? `<b class="tr-no">${no}</b> ${esc(t || "（教材裡找不到這一張）")}` : esc(id); };
  const code = id => (window.topicCode ? window.topicCode(id) : String(id ?? ""));   // 9-1 is shown as 9-A (js/topic-code.js)
  const topicLabel = ch => { const nm = T.name(ch); return nm ? `${code(ch)} ${nm}` : code(ch); };
  // Codes inside a sentence the server wrote ("第一次配錯：s02、s01") become slide numbers and titles.
  const codes = (text, run) => String(text ?? "")
    .replace(/\d{1,2}-\d{1,2}\/[A-C][12]\/s\d{2}/g, m => cardLabel(m))
    .replace(/(^|[^\w/])s(\d{2})(?![\w/])/g, (m, pre, no) => (run && run.chapter ? pre + cardLabel(`${run.chapter}/${run.level}/s${no}`) : m));
  const clipLabel = clip => { const m = /^(\d{1,2}-\d{1,2})\/([A-C][12])\/s\d{2}$/.exec(String(clip ?? "")); return m ? `${topicLabel(m[1])} ${m[2]} · ${cardLabel(clip)}` : codes(clip); };
  function device(client) {
    const ua = typeof client === "string" ? client : client && (client.ua || client.userAgent || client.user_agent) || "";
    if (!ua) return "–";
    const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : "";
    const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
    return [br, os].filter(Boolean).join(" · ") || String(ua).slice(0, 40);
  }

  const dt = s => (s ? String(s).slice(5, 16).replace("T", " ") : "–");
  const pct = v => (num(v) === null ? "–" : Math.round(num(v) * 100) + "%");
  const tile = (v, label, cls = "") => `<div class="tr-tile ${cls}"><b>${esc(v ?? "–")}</b><span>${esc(label)}</span></div>`;
  // A row without an account is a visitor; an account without a 學號 is not on any roster (a teacher or a test account).
  const who = r => (!r.user_id ? `<span class="tr-anon">未登入</span>` : `${esc(r.name || "")}${r.student_no ? ` <small>${esc(r.student_no)}</small>` : ` <small>非名單帳號（老師／測試）</small>`}`);
  function spark(scores) {
    const xs = (scores || []).map(s => num(s.score)).filter(v => v !== null);
    if (!xs.length) return "";
    if (xs.length === 1) return `<svg class="tr-spark" viewBox="0 0 80 24"><circle cx="40" cy="${22 - xs[0] * 0.2}" r="3"/></svg>`;
    const pts = xs.map((v, i) => `${(i / (xs.length - 1)) * 76 + 2},${22 - v * 0.2}`).join(" ");
    return `<svg class="tr-spark" viewBox="0 0 80 24" role="img" aria-label="分數變化 ${xs.join("、")}"><polyline points="${pts}"/><circle cx="78" cy="${22 - xs[xs.length - 1] * 0.2}" r="2.6"/></svg>`;
  }
  const bar = (v, cls = "") => `<span class="tr-bar"><i class="${cls}" style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%"></i></span>`;
  // The same dates under both names: /learning/records/game reads from/to, the student and recording lists read date_from/date_to.
  const dates = () => ({ from: S.from, to: S.to, date_from: S.from, date_to: S.to });
  const filters = () => ({ course_id: S.courseId, section_id: S.sectionId, from: S.from, to: S.to });
  const anyFilter = () => !!(S.sectionId || S.from || S.to || S.chapter || S.level);

  async function load(game) {
    if (game && game !== S.game) {
      S.game = game; S.chapter = ""; S.level = ""; S.studentId = null; S.showOff = false; S.secFilter = ""; S.find = "";
      if (S.tab === "items" && game !== "pecha_kucha") S.tab = "class";
    }
    try {
      // Courses and topics are read again every time the module is opened, so a course or a topic
      // made a moment ago in another module is already here.
      const [c] = await Promise.all([api.teacher.courses(), T.load(true)]);
      S.courses = c.courses;
      // Open on the newest course so 「還沒玩的學生」 and the 系級 comparison count the whole roster;
      // 「全部」 stays one click away and a teacher's own choice is kept.
      if (!S.courseId && !S.coursePicked && S.courses.length) S.courseId = String(S.courses[0].id);
      if (S.courseId && !S.courses.some(x => String(x.id) === String(S.courseId))) { S.courseId = ""; S.sectionId = ""; }
      shell();
      await refresh();
    } catch (e) { $("trBody").innerHTML = `<section class="panel"><p class="tr-msg bad">${esc(e.message)}</p><button class="btn" type="button" onclick="loadRecords()">↻ 再試一次</button></section>`; }
  }
  function shell() {
    const course = S.courses.find(c => String(c.id) === String(S.courseId));
    const backwards = S.from && S.to && S.from > S.to;
    $("trBody").innerHTML = `
      <section class="panel">
        <div class="section-h"><h2>${esc(GAME_ZH[S.game] || S.game)}<small>${esc(GAME_SUB[S.game] || "")}</small></h2><div class="row"><button class="btn" type="button" id="trReload">↻ 重新整理</button></div></div>
        <div class="tr-row">
          <label>課程 <select id="trCourse"><option value="">全部（含沒有課程的紀錄）</option>${S.courses.map(c => `<option value="${Number(c.id)}" ${String(c.id) === String(S.courseId) ? "selected" : ""}>${esc(c.term)} · ${esc(c.name)}</option>`).join("")}</select></label>
          <label>系級 <select id="trSection"><option value="">全部</option>${(course ? course.sections : []).map(s => `<option value="${Number(s.id)}" ${String(s.id) === String(S.sectionId) ? "selected" : ""}>${esc(s.label)}（${Number(s.students)}）</option>`).join("")}</select></label>
          <label>從 <input type="date" id="trFrom" value="${esc(S.from)}"></label><label>到 <input type="date" id="trTo" value="${esc(S.to)}"></label>
          ${anyFilter() ? `<button class="btn" type="button" id="trClear">✕ 清除篩選</button>` : ""}
        </div>
        ${backwards ? `<p class="tr-msg bad" role="alert">「從」的日期比「到」晚，所以查不到資料。<button class="btn" type="button" id="trSwap">幫我對調</button></p>` : ""}
        <div class="tr-seg" role="tablist">${tabsOf(S.game).map(([k, l]) => `<button type="button" role="tab" class="tr-segb ${S.tab === k ? "on" : ""}" aria-selected="${S.tab === k}" data-tab="${k}">${l}${k === "voice" ? ' <span id="trVoiceN"></span>' : ""}</button>`).join("")}<i class="tr-seg-ind" aria-hidden="true"></i></div>
      </section>
      <div id="trView"></div>
      <div id="trModal" class="tr-modal" hidden></div>`;
    $("trReload").onclick = () => load();
    $("trCourse").onchange = e => { S.coursePicked = true; S.courseId = e.target.value; S.sectionId = ""; S.studentId = null; S.showOff = false; shell(); refresh(); };
    $("trSection").onchange = e => { S.sectionId = e.target.value; shell(); refresh(); };
    $("trFrom").onchange = e => { S.from = e.target.value; shell(); refresh(); };
    $("trTo").onchange = e => { S.to = e.target.value; shell(); refresh(); };
    if ($("trClear")) $("trClear").onclick = () => { S.sectionId = ""; S.from = ""; S.to = ""; S.chapter = ""; S.level = ""; shell(); refresh(); };
    if ($("trSwap")) $("trSwap").onclick = () => { [S.from, S.to] = [S.to, S.from]; shell(); refresh(); };
    document.querySelectorAll("#trBody .tr-seg .tr-segb").forEach(b => b.onclick = () => { if (b.dataset.tab === "people" && S.tab !== "people") S.secFilter = ""; setTab(b.dataset.tab); });
    moveInd(false);
  }
  const tabsOf = game => [["class", "班級分析"], ["people", "個人分析"], ...(game === "pecha_kucha" ? [["items", "題目分析"]] : []), ["voice", "語音"]];
  // Move the highlight under the chosen tab; it slides (CSS transition) unless this is the first paint.
  function moveInd(animate = true) {
    const seg = document.querySelector("#trBody .tr-seg"); if (!seg) return;
    const on = seg.querySelector(".tr-segb.on"), ind = seg.querySelector(".tr-seg-ind"); if (!on || !ind) return;
    if (!animate) ind.classList.add("still");
    ind.style.width = on.offsetWidth + "px"; ind.style.transform = `translateX(${on.offsetLeft}px)`;
    if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.remove("still")));
  }
  function setTab(tab) {
    S.tab = tab; S.studentId = null;
    document.querySelectorAll("#trBody .tr-seg .tr-segb").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    moveInd(true);
    refresh();
  }
  // Every refresh gets a number. A view that comes back after a newer refresh has started is thrown
  // away, so a slow answer for the old filter can never overwrite the answer for the new one.
  let round = 0;
  const stale = my => my !== round;
  async function voiceBadge(my) {
    const v = await get("/teacher/recordings", { course_id: S.courseId, section_id: S.sectionId, game: S.game, limit: 1 });
    if (my !== undefined && stale(my)) return v;
    const c = num(v.counts.new) || 0;
    if ($("trVoiceN")) $("trVoiceN").innerHTML = c ? `<span class="tr-badge warn">${c} 未聽</span>` : "";
    return v;
  }
  async function refresh() {
    const my = ++round;
    const view = $("trView");
    if (!view.children.length) view.innerHTML = `<section class="panel"><p class="tr-hint">讀取中…</p></section>`;
    view.classList.add("tr-loading");
    try {
      await voiceBadge(my);
      if (stale(my)) return;
      if (S.tab === "voice") await voiceView(my);
      else if (S.studentId) await studentView(my);
      else await gameView(my);
      if (!stale(my)) enter(view);
    } catch (e) { if (!stale(my)) view.innerHTML = `<section class="panel"><p class="tr-msg bad">${esc(e.message)}</p></section>`; }
    finally { if (!stale(my)) view.classList.remove("tr-loading"); }
  }

  const calm = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const enter = el => { if (el.animate && !calm()) el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }); };
  // "先看這幾位": the students a teacher should look at first, each with the reason in plain words.
  // The rules are simple on purpose and shown as reasons, not as a score; a teacher can take a
  // name off the list (remembered in this browser) and bring it back; students never see any of this.
  const seenKey = () => `tr_first_done_${S.courseId || "all"}_${S.game}`;
  const dismissed = () => { try { return JSON.parse(localStorage.getItem(seenKey()) || "[]").map(Number); } catch (e) { return []; } };
  const setDismissed = list => { try { localStorage.setItem(seenKey(), JSON.stringify([...new Set(list)])); } catch (e) {} };
  // What kind of mark each student's runs carry (the class table only has the count).
  function flagKinds(rep) {
    const kinds = {};
    for (const r of rep.runs) for (const f of (r.flags || [])) { if (r.user_id) { const k = kinds[r.user_id] = kinds[r.user_id] || {}; k[f] = (k[f] || 0) + 1; } }
    return kinds;
  }
  function firstLook(rep, card) {
    const off = new Set(dismissed()), kinds = flagKinds(rep), out = [];
    const none = S.from || S.to ? "這段期間沒有紀錄" : S.chapter || S.level ? "這個主題／難度還沒玩過" : "還沒玩過";
    for (const s of rep.students) {
      if (!s.user_id) continue;
      const why = [];
      if (!s.runs) { if (S.courseId) why.push(none); }
      else {
        const sc = (s.scores || []).map(x => num(x.score)).filter(v => v !== null), best = num(s.best);
        if (!s.finished) why.push(`開了 ${Number(s.runs)} 局都沒玩完`);
        if (card && best !== null && best < 40) why.push(`最好的一次聽懂分數只有 ${best}`);
        if (card && sc.length >= 3 && sc[sc.length - 1] < sc[0] - 15) why.push(`分數往下掉（${sc[0]} → ${sc[sc.length - 1]}）`);
        const k = kinds[s.user_id] || {};
        for (const [f, c] of Object.entries(k)) why.push(FLAG_WHY[f] ? FLAG_WHY[f](c) : `${c} 局有標記`);
        if (!Object.keys(k).length && num(s.flags)) why.push(`${num(s.flags)} 局有標記（點進去看是哪一局）`);
        if (s.recordings && num(s.recordings.new)) why.push(`${num(s.recordings.new)} 段錄音還沒聽`);
      }
      if (why.length) out.push({ s, why, off: off.has(Number(s.user_id)) });
    }
    return out;
  }
  function paintFirst() {
    const box = $("trFirst"); if (!box || !S.report) return;
    const all = firstLook(S.report, S.game === "pecha_kucha"), list = all.filter(x => !x.off), gone = all.filter(x => x.off);
    if (!list.length && !gone.length) { box.innerHTML = ""; return; }
    const row = x => `<li><b>${esc(x.s.section || "")} ${esc(x.s.name)}</b><span>${esc(x.why.join("；"))}</span><button class="btn" type="button" data-open="${Number(x.s.user_id)}">看他的紀錄</button>${x.off ? `<button class="btn" type="button" data-back="${Number(x.s.user_id)}">放回名單</button>` : `<button class="btn" type="button" data-done="${Number(x.s.user_id)}">先不用看</button>`}</li>`;
    const top = list.slice(0, 8), rest = list.slice(8);
    box.innerHTML = `<section class="panel"><div class="tr-first">
      ${list.length ? `<h3>先看這幾位（${list.length} 位）</h3><p class="tr-hint">依紀錄列出，原因寫在後面。處理過就按「先不用看」，名單只有老師看得到。</p>
        <ul>${top.map(row).join("")}</ul>${rest.length ? `<details class="tr-more"><summary>還有 ${rest.length} 位</summary><ul>${rest.map(row).join("")}</ul></details>` : ""}` : `<h3>目前沒有需要先看的學生</h3>`}
      ${gone.length ? `<p class="tr-hint"><button type="button" class="tr-link" id="trShowOff">${S.showOff ? "收起" : "顯示"}已略過的 ${gone.length} 位</button></p>${S.showOff ? `<ul>${gone.map(row).join("")}</ul>` : ""}` : ""}
    </div></section>`;
    box.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { S.studentId = Number(b.dataset.open); refresh(); });
    box.querySelectorAll("[data-done]").forEach(b => b.onclick = () => { const id = Number(b.dataset.done); setDismissed([...dismissed(), id]); paintFirst(); toast("已從名單拿掉。", () => { setDismissed(dismissed().filter(x => x !== id)); paintFirst(); }); });
    box.querySelectorAll("[data-back]").forEach(b => b.onclick = () => { setDismissed(dismissed().filter(x => x !== Number(b.dataset.back))); paintFirst(); });
    if ($("trShowOff")) $("trShowOff").onclick = () => { S.showOff = !S.showOff; paintFirst(); };
  }

  // ── 一個遊戲：班級分析／個人分析／題目分析 ──
  // The game comes from the sidebar (Card Game, 3D Harbor, SDG 4 Stage); the tabs split one report.
  function classStats(rep, card) {
    const att = new Map();
    for (const x of firstLook(rep, card)) if (!x.off) { const k = x.s.section || ""; att.set(k, (att.get(k) || 0) + 1); }
    const m = new Map();
    for (const s of rep.students) {
      if (!s.user_id) continue;
      const k = s.section || "";
      const c = m.get(k) || { sec: k, n: 0, played: 0, finished: 0, best: [], last: [], stars: [], fo: 0, fn: 0, rec: 0, recNew: 0 };
      c.n++;
      if (num(s.runs)) c.played++;
      if (num(s.finished)) c.finished++;
      if (num(s.best) !== null) c.best.push(num(s.best));
      if (num(s.last_score) !== null) c.last.push(num(s.last_score));
      if (num(s.avg_stars) !== null) c.stars.push(num(s.avg_stars));
      c.fo += num(s.first_ok) || 0; c.fn += num(s.first_n) || 0;
      if (s.recordings) { c.rec += num(s.recordings.total) || 0; c.recNew += num(s.recordings.new) || 0; }
      m.set(k, c);
    }
    const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const last = "￿";
    return [...m.values()].map(c => ({ ...c, bestAvg: avg(c.best), lastAvg: avg(c.last), starsAvg: avg(c.stars), firstRate: c.fn ? c.fo / c.fn : null, attention: att.get(c.sec) || 0 }))
      .sort((a, b) => (a.sec || last).localeCompare(b.sec || last, "zh-Hant"));
  }
  const secName = k => k || "沒有系級";
  function classSay(list, card) {
    if (!list.length) return "";
    const total = list.reduce((a, c) => a + c.n, 0), played = list.reduce((a, c) => a + c.played, 0);
    const out = [`${list.length} 個系級、${total} 位學生，${played} 位玩過。`];
    const behind = S.courseId ? list.filter(c => c.n - c.played > 0).sort((a, b) => (b.n - b.played) - (a.n - a.played))[0] : null;
    if (behind) out.push(`最多人還沒玩的是「${secName(behind.sec)}」（${behind.n - behind.played} 位）。`);
    const key = c => (card ? c.bestAvg : c.starsAvg);
    const scored = list.filter(c => key(c) !== null);
    if (scored.length >= 2) {
      const hi = scored.reduce((a, b) => (key(b) > key(a) ? b : a)), lo = scored.reduce((a, b) => (key(b) < key(a) ? b : a));
      const f = v => (card ? Math.round(v) : v.toFixed(1));
      out.push(`${card ? "平均最好的聽懂分數" : "平均星數"}最高是「${secName(hi.sec)}」（${f(key(hi))}），最低是「${secName(lo.sec)}」（${f(key(lo))}）。`);
    }
    return out.join("");
  }
  async function gameView(my) {
    const [rep, fb] = await Promise.all([get("/learning/records/game", { ...filters(), game: S.game, chapter: S.chapter, level: S.level }), get("/teacher/feedback").catch(() => ({ feedback: {}, email_ready: false }))]);
    if (stale(my)) return;
    S.fb = fb.feedback || {}; S.emailReady = !!fb.email_ready;
    const card = S.game === "pecha_kucha";
    if (card) await T.need([...rep.topics, ...rep.runs.map(r => r.chapter), ...rep.cards.map(c => T.parse(c.card).topic), ...rep.confusion.map(c => T.parse(c.card).topic)]);
    if (stale(my)) return;
    S.report = rep;
    const o = rep.overview, kinds = flagKinds(rep);
    const opt = (list, cur, label) => list.concat(cur && !list.includes(cur) ? [cur] : []).map(t => `<option value="${esc(t)}" ${t === cur ? "selected" : ""}>${esc(label(t))}</option>`).join("");
    const toolbar = `<section class="panel tr-tool"><div class="tr-row">
        <label>主題 <select id="trChapter"><option value="">全部</option>${opt(rep.topics, S.chapter, card ? topicLabel : String)}</select></label>
        <label>難度 <select id="trLevel"><option value="">全部</option>${opt(rep.levels, S.level, String)}</select></label>
        <span class="tr-grow"></span>
        <button class="btn" type="button" data-x="1">⬇ Excel（含姓名）</button><button class="btn" type="button" data-x="0">⬇ Excel（研究代碼）</button>
      </div></section>`;
    let body = "";
    if (S.tab === "class") {
      const list = classStats(rep, card);
      const maxN = Math.max(1, ...list.map(c => c.n));
      body = `
      <section class="panel"><div class="tr-tiles">
        ${tile(n(o.students_played), "玩過的學生")}${tile(S.courseId ? n(o.not_played) : "–", S.courseId ? "還沒玩的學生" : "還沒玩（先選課程）", S.courseId && num(o.not_played) ? "warn" : "")}
        ${tile(n(o.runs), "開始的局數")}${tile(n(o.finished), "玩完的局數")}
        ${card ? tile(n(o.avg_score), "平均聽懂分數") : ""}${tile(n(o.avg_minutes), "平均分鐘／局")}${tile(n(o.flagged_runs), "有標記的局", num(o.flagged_runs) ? "warn" : "")}
      </div>${num(o.excluded_runs) ? `<p class="tr-hint">另有 ${n(o.excluded_runs)} 局不計入上面的數字：${Object.entries(o.excluded || {}).map(([k, v]) => `${EXCL[k] || k} ${n(v)} 局`).join("、")}${num(o.test_accounts) ? `；名單裡有 ${n(o.test_accounts)} 個測試帳號（老師、助教）` : ""}。這些局還在「個人分析」的局列表裡，有標記。</p>` : ""}</section>
      <section class="panel"><h3 class="tr-h">各系級比較</h3>
        ${list.length ? `<p class="tr-say">${esc(classSay(list, card))}</p>
        <div class="scrollx"><table class="part-table tr-table tr-cls"><thead><tr><th>系級</th><th>學生</th><th>玩過</th><th>玩完</th>${card ? "<th>平均最好分數</th><th>平均最近分數</th><th>第一次就配對</th>" : "<th>平均星數</th>"}<th>錄音</th><th>要注意</th></tr></thead><tbody>
          ${list.map(c => `<tr class="tr-click" tabindex="0" data-sec="${esc(c.sec)}">
            <td class="nw"><b>${esc(secName(c.sec))}</b></td>
            <td class="nw">${c.n}<span class="tr-mini"><i style="width:${(c.n / maxN) * 100}%"></i></span></td>
            <td class="nw">${bar(c.n ? (c.played / c.n) * 100 : 0, c.played === c.n ? "good" : "info")} ${c.played}/${c.n}</td>
            <td class="nw">${c.finished}</td>
            ${card ? `<td class="nw">${c.bestAvg === null ? "–" : bar(c.bestAvg, c.bestAvg < 40 ? "bad" : c.bestAvg < 70 ? "mid" : "good") + " " + Math.round(c.bestAvg)}</td><td class="nw">${c.lastAvg === null ? "–" : Math.round(c.lastAvg)}</td><td class="nw">${c.firstRate === null ? "–" : pct(c.firstRate) + ` <small>${c.fo}/${c.fn} 句</small>`}</td>` : `<td>${c.starsAvg === null ? "–" : c.starsAvg.toFixed(1)}</td>`}
            <td class="nw">${c.rec ? `${c.rec} 段${c.recNew ? ` <span class="tr-badge warn">${c.recNew} 未聽</span>` : ""}` : "–"}</td>
            <td>${c.attention ? `<span class="tr-badge warn">${c.attention} 位</span>` : "–"}</td></tr>`).join("")}
        </tbody></table></div><p class="tr-hint">點一個系級，看這個系級每一位學生。</p>` : `<p class="tr-hint">這個條件下還沒有學生。先到「課程與名單」匯入名單，或清除篩選。</p>`}
      </section>
      ${anomalyBox(rep.anomalies || [])}
      <div id="trFirst"></div>`;
    } else if (S.tab === "people") {
      const last = "￿";
      const secs = [...new Set(rep.students.filter(s => s.user_id).map(s => s.section || ""))].sort((a, b) => (a || last).localeCompare(b || last, "zh-Hant"));
      body = `
      <section class="panel"><h3 class="tr-h">學生（點一列看這位學生的全部紀錄）</h3>
        <div class="tr-row tr-people-tools">
          <label>找學生 <input type="search" id="trFind" value="${esc(S.find)}" placeholder="姓名或學號"></label>
          <div class="tr-chips" role="group" aria-label="系級">${["*", ...secs].map(k => `<button type="button" class="tr-chip ${(k === "*" ? !S.secFilter : S.secFilter === k) ? "on" : ""}" data-chip="${esc(k)}">${k === "*" ? "全部" : esc(secName(k))}</button>`).join("")}</div>
          <small class="tr-saved" id="trPeopleN"></small>
        </div>
        <div class="tr-selbar" id="trSelBar" hidden><b id="trSelN">已選 0 位</b><button class="btn" type="button" id="trSelFb">✎ 給選取的學生同一段評語</button><button class="btn btn-primary" type="button" id="trSelSend">📨 寄出學習報告</button><button class="btn" type="button" id="trSelClear">取消選取</button></div>
        <div class="scrollx"><table class="part-table tr-table"><thead><tr><th class="tr-ck"><input type="checkbox" id="trAll" aria-label="全選列出的學生"></th><th>系級</th><th>學生</th><th>局數</th>${card ? "<th>最佳／最近</th><th>分數變化</th><th>第一次就配對</th>" : "<th>平均星數</th><th>結局</th>"}<th>錄音</th><th>要注意</th><th>評語（寄報告時一起送出）</th></tr></thead><tbody>
          ${rep.students.length ? rep.students.map(s => `<tr class="${s.user_id ? "tr-click" : ""} ${s.runs ? "" : "mute"}" data-student="${s.user_id ? Number(s.user_id) : ""}" data-sec="${esc(s.section || "")}" data-q="${esc(((s.name || "") + " " + (s.student_no || "")).toLowerCase())}" ${s.user_id ? 'tabindex="0"' : ""}>
            <td class="tr-ck">${s.user_id ? `<input type="checkbox" data-pick="${Number(s.user_id)}" aria-label="選取 ${esc(s.name)}">` : ""}</td>
            <td class="nw">${esc(s.section || "")}</td><td>${who(s)}${s.test ? ` <span class="tr-badge" title="老師／助教／測試帳號：局會保留，不進班級統計">測試帳號</span>` : ""}</td><td class="nw">${s.runs ? `${Number(s.runs)} 局 <small>玩完 ${Number(s.finished)}</small><small class="tr-sub">最近 ${esc(dt(s.last))}</small>` : s.test ? `<span class="tr-badge">${num(s.excluded_runs) ? n(s.excluded_runs) + " 局（不計）" : "測試"}</span>` : `<span class="tr-badge warn">還沒玩</span>`}</td>
            ${card ? `<td class="nw">${n(s.best)} ／ ${n(s.last_score)}</td><td>${spark(s.scores)}</td><td>${num(s.first_n) ? `${n(s.first_ok)} / ${n(s.first_n)} 句` : "–"}</td>` : `<td>${n(s.avg_stars)}</td><td>${esc(s.best_ending || "–")}</td>`}
            <td>${s.recordings && num(s.recordings.total) ? `${n(s.recordings.total)} 段${num(s.recordings.new) ? ` <span class="tr-badge warn">${n(s.recordings.new)} 未聽</span>` : ""}` : "–"}</td>
            <td>${s.anomaly ? `<span class="tr-anom ${s.anomaly.severity}">${s.anomaly.too_good ? "好得不正常" : "行為異常"}${s.anomaly.n > 1 ? " ×" + s.anomaly.n : ""}</span> ` : ""}${Object.entries(kinds[s.user_id] || {}).map(([f, c]) => `<span class="tr-badge bad">${esc(FLAG[f] || f)} ×${c}</span>`).join(" ") || (num(s.flags) ? `<span class="tr-badge bad">${n(s.flags)} 局有標記</span>` : "")}</td>
            <td class="tr-fbcell">${s.user_id ? fbCell(s.user_id) : ""}</td></tr>`).join("") : `<tr><td colspan="12">這個條件下沒有學生或紀錄。</td></tr>`}
        </tbody></table></div></section>
      <section class="panel"><h3 class="tr-h">最近的局（點一列看每一步）</h3>${runsTable(rep.runs.slice(0, 60), card)}</section>`;
    } else {
      const maxRuns = Math.max(1, ...rep.funnel.map(f => Number(f.runs) || 0));
      const hard = rep.cards.length && rep.cards[0].n ? rep.cards[0] : null;
      body = `
      <section class="panel"><h3 class="tr-h">最難的句子（由難到易）</h3>
        ${hard ? `<p class="tr-say">最難的是 ${esc(cardLabel(hard.card))}：${n(hard.n)} 人次裡只有 ${n(hard.first_ok)} 人次第一次就配對${hard.top_wrong ? "，最常被放到 " + esc(cardLabel(hard.top_wrong.target)) : ""}。</p>` : ""}
        <p class="tr-hint">「聽懂程度」只看每位學生第一次放卡，並扣掉用猜的機率：0 = 跟亂猜一樣，100 = 每個人第一次就配對。滑鼠停在一列上可以看到那一句的講稿。</p>
        <div class="scrollx"><table class="part-table tr-table"><thead><tr><th>這一句（投影片）</th><th>最常被放到</th><th>聽懂程度</th><th>第一次就配對</th><th>每次重聽</th><th>反應秒數</th></tr></thead><tbody>
          ${rep.cards.length ? rep.cards.map(c => { const p = T.parse(c.card), s = num(c.s); return `<tr title="${esc(cardScript(c.card))}"><td>${cardCell(c.card)}<small class="tr-sub">${esc(code(p.topic))} ${esc(p.level)}${num(c.version) ? " · 第 " + num(c.version) + " 版教材" : ""}</small></td>
            <td>${c.top_wrong ? `${cardCell(c.top_wrong.target)} <small>×${n(c.top_wrong.n)}</small>` : "–"}</td>
            <td class="nw">${s === null ? "–" : bar(Math.max(0, s) * 100, s < 0.4 ? "bad" : s < 0.8 ? "mid" : "good") + " " + Math.round(Math.max(0, s) * 100)}</td><td class="nw">${n(c.first_ok)} / ${n(c.n)} 人次</td><td>${n(c.repeats_avg)}</td><td>${num(c.rt_median_ms) === null ? "–" : (num(c.rt_median_ms) / 1000).toFixed(1)}</td></tr>`; }).join("") : `<tr><td colspan="6">還沒有作答紀錄。</td></tr>`}
        </tbody></table></div></section>
      <div class="tr-two">
        <section class="panel"><h3 class="tr-h">學生把什麼和什麼搞混</h3>
          <table class="part-table tr-table"><thead><tr><th>這一句</th><th>被放到這張</th><th>次數</th></tr></thead><tbody>${rep.confusion.length ? rep.confusion.map(c => `<tr title="${esc(cardScript(c.card))}"><td>${cardCell(c.card)}</td><td>${cardCell(c.target)}</td><td>${n(c.n)}</td></tr>`).join("") : `<tr><td colspan="3">沒有配錯的紀錄。</td></tr>`}</tbody></table></section>
        <section class="panel"><h3 class="tr-h">每一局走到哪裡</h3>
          ${rep.funnel.length ? `<p class="tr-say">${n(rep.funnel[0].runs)} 局裡有 ${n(rep.funnel[rep.funnel.length - 1].runs)} 局走完收尾，${n((rep.funnel.find(f => f.step === "read") || {}).runs, "0")} 局有朗讀。</p>` : ""}
          ${rep.funnel.map(f => `<div class="tr-funnel"><span>${esc(FUNNEL[f.step] || f.step)}</span>${bar((Number(f.runs) || 0) / maxRuns * 100, "info")}<b>${n(f.runs)}</b></div>`).join("")}
          ${rep.abandon_points.length ? `<p class="tr-hint">沒配對完就離開的局，停在：${rep.abandon_points.map(a => `第 ${esc(a.part)} 段（${n(a.runs)} 局）`).join("、")}</p>` : `<p class="tr-hint">沒有中途離開的局。</p>`}</section>
      </div>`;
    }
    $("trView").innerHTML = toolbar + body;
    $("trChapter").onchange = e => { S.chapter = e.target.value; shell(); refresh(); };
    $("trLevel").onchange = e => { S.level = e.target.value; shell(); refresh(); };
    document.querySelectorAll("[data-x]").forEach(b => b.onclick = () => exportXlsx(b.dataset.x === "1", b));
    document.querySelectorAll("#trView .tr-cls [data-sec]").forEach(r => { r.onclick = () => { S.secFilter = r.dataset.sec; setTab("people"); }; r.onkeydown = e => { if (e.key === "Enter") r.click(); }; });
    document.querySelectorAll("#trView [data-student]").forEach(r => { if (r.dataset.student) { r.onclick = () => { S.studentId = Number(r.dataset.student); refresh(); }; r.onkeydown = e => { if (e.key === "Enter") r.click(); }; } });
    if ($("trFind")) {
      $("trFind").oninput = e => { S.find = e.target.value; applyPeople(); };
      document.querySelectorAll("#trView [data-chip]").forEach(b => b.onclick = () => { S.secFilter = b.dataset.chip === "*" ? "" : b.dataset.chip; document.querySelectorAll("#trView [data-chip]").forEach(x => x.classList.toggle("on", x === b)); applyPeople(); });
      applyPeople();
      wirePicks();
    }
    document.querySelectorAll("#trView [data-anom]").forEach(b => b.onclick = () => { S.studentId = Number(b.dataset.anom); refresh(); });
    paintFirst();
    wireRuns();
  }
  // 異常偵測: results that the play behind them cannot explain, each with its reasons.
  function anomalyBox(list) {
    if (!list.length) return `<section class="panel tr-anom-box ok"><h3 class="tr-h">異常偵測</h3><p class="tr-hint">目前沒有發現異常：沒有人的成績好到和他的作答過程對不起來，也沒有用試的、共用帳號的跡象。</p></section>`;
    const good = list.filter(a => a.too_good).length;
    return `<section class="panel tr-anom-box"><h3 class="tr-h">異常偵測（${list.length} 位）</h3>
      <p class="tr-say">${good ? `${good} 位的成績好得不正常，` : ""}請點進去看他每一局怎麼玩的再判斷；這些只是提醒，不會自動扣分或通知學生。</p>
      <div class="tr-anom-list">${list.map(a => `<article class="tr-anom-card ${a.severity}">
        <header><span class="tr-anom ${a.severity}">${a.too_good ? "好得不正常" : "行為異常"} · ${a.severity === "high" ? "優先查看" : "留意"}</span><b>${esc(a.section || "")} ${esc(a.name)}</b><small>${esc(a.student_no || "")}${a.best != null ? ` · 最好 ${n(a.best)} 分` : ""} · ${n(a.runs)} 局</small></header>
        <ul>${a.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
        <button class="btn" type="button" data-anom="${Number(a.user_id)}">看他每一局 →</button></article>`).join("")}</div></section>`;
  }
  // ── 評語與寄送學習報告 ──
  // Each student's comment is a draft (saved when the box loses focus) until it goes out with a report.
  // Select students with the checkboxes, then 寄出學習報告: preview one, choose email or only 「我的報告」, watch progress.
  const fbCell = uid => { const f = (S.fb || {})[uid] || {}; return `<textarea class="tr-fb" data-fb="${Number(uid)}" rows="1" maxlength="2000" placeholder="寫評語…">${esc(f.text || "")}</textarea><span class="tr-fbstate ${f.sent_at ? "sent" : ""}" data-fbstate="${Number(uid)}">${f.text ? (f.sent_at ? "已寄出 " + esc(dt(f.sent_at)) : "草稿") : ""}</span>`; };
  async function saveFb(uid, text, msgEl) {
    const old = ((S.fb || {})[uid] || {}).text || "";
    if (text.trim() === old.trim()) return;
    try {
      await send("PUT", `/teacher/feedback/${Number(uid)}`, { text });
      S.fb = S.fb || {}; if (text.trim()) S.fb[uid] = { text: text.trim(), sent_at: null }; else delete S.fb[uid];
      if (msgEl) { msgEl.textContent = text.trim() ? "草稿已儲存" : "已清除"; msgEl.className = "tr-fbstate"; }
    } catch (e) { if (msgEl) msgEl.textContent = e.message; }
  }
  const picked = () => [...document.querySelectorAll("#trView [data-pick]:checked")].map(x => Number(x.dataset.pick));
  function paintSel() {
    const n = picked().length, bar = $("trSelBar"); if (!bar) return;
    bar.hidden = !n; $("trSelN").textContent = `已選 ${n} 位`;
  }
  function wirePicks() {
    document.querySelectorAll("#trView [data-pick], #trView .tr-fb").forEach(el => { el.onclick = e => e.stopPropagation(); el.onkeydown = e => e.stopPropagation(); });
    document.querySelectorAll("#trView [data-pick]").forEach(c => c.onchange = paintSel);
    $("trAll").onchange = e => { document.querySelectorAll("#trView tr[data-q]").forEach(r => { const c = r.querySelector("[data-pick]"); if (c && !r.hidden) c.checked = e.target.checked; }); paintSel(); };
    document.querySelectorAll("#trView .tr-fb").forEach(t => t.onblur = () => saveFb(Number(t.dataset.fb), t.value, document.querySelector(`[data-fbstate="${t.dataset.fb}"]`)));
    $("trSelClear").onclick = () => { document.querySelectorAll("#trView [data-pick]").forEach(c => (c.checked = false)); $("trAll").checked = false; paintSel(); };
    $("trSelFb").onclick = () => bulkFb(picked());
    $("trSelSend").onclick = () => { const ids = picked(); sendReports(ids, `${ids.length} 位學生`); };
  }
  function bulkFb(ids) {
    const m = $("trModal"); m.hidden = false;
    m.innerHTML = `<div class="tr-sheet" role="dialog" aria-label="給同一段評語"><h3 class="tr-h">給 ${ids.length} 位學生同一段評語</h3>
      <textarea id="trBulkText" rows="4" maxlength="2000" style="width:100%" placeholder="例如：這週大家進步很多！"></textarea>
      <div class="tr-row"><label class="opt"><input type="radio" name="trBulkMode" value="append" checked> 加在原本的評語後面</label><label class="opt"><input type="radio" name="trBulkMode" value="replace"> 取代原本的評語</label></div>
      <div class="tr-row"><button class="btn btn-primary" type="button" id="trBulkGo">套用</button><button class="btn" type="button" id="trBulkNo">取消</button><small class="tr-saved" id="trBulkMsg"></small></div></div>`;
    $("trBulkNo").onclick = () => { m.hidden = true; m.innerHTML = ""; };
    $("trBulkGo").onclick = async () => {
      try { await send("POST", "/teacher/feedback/bulk", { user_ids: ids, text: $("trBulkText").value, mode: document.querySelector('[name="trBulkMode"]:checked').value });
        m.hidden = true; m.innerHTML = ""; toast(`已給 ${ids.length} 位學生評語（草稿）。`); refresh(); }
      catch (e) { $("trBulkMsg").textContent = e.message; }
    };
  }
  function sendReports(ids, who) {
    if (!ids.length) { toast("先勾選要寄給哪些學生。"); return; }
    const withFb = ids.filter(id => ((S.fb || {})[id] || {}).text).length;
    const m = $("trModal"); m.hidden = false;
    m.innerHTML = `<div class="tr-sheet tr-send" role="dialog" aria-label="寄出學習報告">
      <div><h3 class="tr-h">寄出學習報告給 ${esc(who)}</h3>
        <p class="tr-hint">每位學生收到自己的報告：玩了幾局、分數的進步、各主題最好的分數、下次先練哪幾句，加上你的評語。</p>
        <label class="opt"><input type="checkbox" id="trUseFb" checked> 用每位學生自己的評語（${withFb} / ${ids.length} 位有寫）</label>
        <label style="display:block">沒有評語的學生，或不用個別評語時，改用這段話（可以不寫）<textarea id="trRepNote" rows="3" maxlength="2000" style="width:100%" placeholder="例如：這週大家進步很多！"></textarea></label>
        <label class="opt"><input type="checkbox" id="trEmail" ${S.emailReady ? "" : "disabled"}> 同時寄到學生的信箱${S.emailReady ? "" : "（這台伺服器還沒設定寄信，先只放進「我的報告」）"}</label>
        <p class="tr-hint">一定會放進學生的「我的報告」，學生登入後右下角會跳出通知。</p>
        <div class="tr-row"><button class="btn btn-primary" type="button" id="trRepGo">寄出 ${ids.length} 份</button><button class="btn" type="button" id="trRepCancel">取消</button></div>
        <div id="trRepProg"></div></div>
      <div><h3 class="tr-h">預覽（第一位學生）</h3><iframe id="trRepPrev" sandbox title="報告預覽"></iframe></div></div>`;
    const close = () => { m.hidden = true; m.innerHTML = ""; };
    $("trRepCancel").onclick = close;
    const body = () => ({ user_ids: ids, note: $("trRepNote").value, use_feedback: $("trUseFb").checked, email: $("trEmail").checked });
    let timer = null;
    const prev = async () => { clearTimeout(timer); timer = setTimeout(async () => { try { const out = await send("POST", "/teacher/reports/preview", body()); $("trRepPrev").srcdoc = out.html; } catch (e) { } }, 300); };
    $("trUseFb").onchange = prev; $("trRepNote").oninput = prev; prev();
    $("trRepGo").onclick = async () => {
      $("trRepGo").disabled = true; $("trRepCancel").textContent = "關閉";
      try {
        const out = await send("POST", "/teacher/reports/send-v2", body());
        if (!out.emailing) { $("trRepProg").innerHTML = `<p class="tr-msg">✓ 已放進 ${out.sent} 位學生的「我的報告」。</p>`; toast(`已傳出 ${out.sent} 份學習報告。`); refresh(); return; }
        const poll = async () => {
          const st = await get(`/teacher/reports/batch/${out.batch}`);
          const total = st.rows.filter(r => r.email_status).length, done = st.sent + st.failed;
          $("trRepProg").innerHTML = `<div class="tr-prog"><i style="width:${total ? (done / total) * 100 : 100}%"></i></div><p class="tr-hint">寄信中 ${done} / ${total}（成功 ${st.sent}${st.failed ? `，失敗 ${st.failed}` : ""}）</p>
            ${st.failed && !st.queued ? `<ul>${st.rows.filter(r => r.email_status === "failed").map(r => `<li>${esc(r.name)}（${esc(r.email_to)}）：${esc(r.email_error || "")}</li>`).join("")}</ul><button class="btn" type="button" id="trRetry">重寄失敗的 ${st.failed} 封</button>` : ""}`;
          if ($("trRetry")) $("trRetry").onclick = async () => { await send("POST", `/teacher/reports/batch/${out.batch}/retry`); setTimeout(poll, 1500); };
          if (st.queued) setTimeout(poll, 1500); else { toast(`學習報告已寄出：成功 ${st.sent} 封${st.failed ? `，失敗 ${st.failed} 封` : ""}。`); }
        };
        poll();
      } catch (e) { $("trRepProg").innerHTML = `<p class="tr-msg bad">${esc(e.message)}</p>`; $("trRepGo").disabled = false; }
    };
  }
  // 個人分析: filter the class table by 系級 chip and a name / 學號 search, without asking the server again.
  function applyPeople() {
    const q = S.find.trim().toLowerCase(); let shown = 0, total = 0;
    document.querySelectorAll("#trView tr[data-q]").forEach(r => {
      if (!r.dataset.student) return;
      total++;
      const ok = (!S.secFilter || r.dataset.sec === S.secFilter) && (!q || r.dataset.q.includes(q));
      r.hidden = !ok; if (ok) shown++;
    });
    if ($("trPeopleN")) $("trPeopleN").textContent = shown === total ? `${total} 位` : `${shown} / ${total} 位`;
  }
  const EXCL = { test_account: "測試帳號", embed: "3D 內嵌", test_run: "快速測試", partial: "只玩部分" };
  const scoreOf = r => (num(r.score) ?? num(r.avg_stars) ?? (num(r.coverage) !== null ? pct(r.coverage) : "–"));
  function runsTable(runs, card, withName = true) {
    return `<div class="scrollx"><table class="part-table tr-table"><thead><tr><th>開始</th>${withName ? "<th>學生</th>" : "<th>遊戲</th>"}<th>主題</th><th>${card ? "聽懂分數" : "分數／星數"}</th><th>玩完</th><th>分鐘</th><th>要注意</th></tr></thead><tbody>
      ${runs.length ? runs.map(r => `<tr class="tr-click" data-run="${Number(r.id)}" tabindex="0"><td class="nw">${esc(dt(r.started_at))}</td><td>${withName ? who(r) : esc(GAME_ZH[r.game] || r.game)}</td><td>${esc(r.game === "pecha_kucha" ? topicLabel(r.chapter) : r.chapter)} <small>${esc(r.level || "")}</small></td>
        <td>${esc(scoreOf(r))}</td><td>${r.ended_at ? (r.game === "pecha_kucha" ? (r.wrap_done ? "✓ 含收尾" : "✓ 只配對") : "✓") : `<span class="tr-badge warn">沒玩完</span>`}</td><td>${n(r.minutes)}${num(r.active_minutes) !== null ? `<small class="tr-sub">有效 ${n(r.active_minutes)}</small>` : ""}</td>
        <td>${(r.flags || []).map(f => `<span class="tr-badge bad">${esc(FLAG[f] || f)}</span>`).join(" ")}${r.excluded ? ` <span class="tr-badge" title="這一局不計入班級統計">${esc(EXCL[r.excluded] || "不計")}</span>` : ""}</td></tr>`).join("") : `<tr><td colspan="7">沒有紀錄。</td></tr>`}
    </tbody></table></div>`;
  }
  const wireRuns = () => document.querySelectorAll("#trView [data-run]").forEach(r => { r.onclick = () => runModal(Number(r.dataset.run), r); r.onkeydown = e => { if (e.key === "Enter") r.click(); }; });
  async function exportXlsx(names, btn) {
    const label = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "準備檔案中…"; }
    try {
      const q = new URLSearchParams(Object.entries({ ...filters(), game: S.game, chapter: S.chapter, level: S.level, names }).filter(([, v]) => v !== "" && v != null)).toString();
      const r = await fetch(API() + "/learning/records/export.xlsx?" + q, { headers: head() });
      if (!r.ok) throw new Error("匯出失敗，請再試一次。");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob());
      let name = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "learning-records.xlsx";
      // The two files must never share a name: the one with names is not for sending on.
      if (!/names|codes|姓名|代碼/i.test(name)) name = name.replace(/\.xlsx$/i, "") + (names ? "-含姓名.xlsx" : "-研究代碼.xlsx");
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast(names ? `已下載 ${name}。裡面有姓名和學號，請不要外流。` : `已下載 ${name}。只有研究代碼，沒有姓名、學號和 email。`);
    } catch (e) { toast(e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }

  // ── 一位學生：身分卡與圖 ──
  function profileCard(p, row) {
    const courses = (p.courses || []).map(c => `${esc(c.term)} ${esc(c.name)}${c.section ? "（" + esc(c.section) + "）" : ""}${c.status && c.status !== "active" ? " · 已退選" : ""}`).join("、") || "沒有修課紀錄";
    const anomaly = row && row.anomaly ? `<span class="tr-anom ${row.anomaly.severity}">${row.anomaly.too_good ? "好得不正常" : "行為異常"}（見班級分析）</span>` : "";
    const f = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    return `<div class="tr-profile">
      <div class="tr-avatar">${esc(String(p.name || "?").slice(0, 1))}</div>
      <dl>
        ${f("系級", esc(p.class_name || row.section || "–"))}${f("學號", esc(p.student_no || "–"))}${f("登入帳號", esc(p.email || "–"))}${f("身分", esc({ student: "學生", teacher: "老師", admin: "管理員" }[p.role] || p.role || "–"))}
        ${f("修的課", courses)}${f("帳號建立", esc(dt(p.created_at)) + (p.account_source === "roster" ? "（名單匯入）" : ""))}
        ${f("登入", `${n(p.logins, "0")} 次 · 最近 ${esc(dt(p.last_login))}`)}${f("用過的裝置", (p.devices || []).map(x => `${esc(x.device)} ×${x.runs}`).join("、") || "–")}
        ${f("籌碼", `${n(p.chips, "0")} 枚${num(p.chips_held) ? ` · ${n(p.chips_held)} 枚等確認` : ""}`)}${f("錄音", `${n(p.recordings, "0")} 段`)}
        ${p.must_change_password ? f("狀態", "還沒改過初始密碼") : ""}
      </dl>${anomaly}
      ${(p.recent_logins || []).length ? `<details class="tr-logins"><summary>最近 ${p.recent_logins.length} 次登入</summary><ul>${p.recent_logins.map(l => `<li>${esc(dt(l.at))} <small>${esc(l.ip || "")}</small></li>`).join("")}</ul></details>` : ""}
    </div>`;
  }
  // every card-game score in time order, one line per topic/level
  function scoreChart(topics) {
    const pts = (topics || []).flatMap(t => (t.scores || []).map(s => ({ t: Date.parse(s.at), v: num(s.score), k: `${t.chapter} ${t.level}` }))).filter(p => p.v !== null && !isNaN(p.t)).sort((a, b) => a.t - b.t);
    if (!pts.length) return `<section class="tr-chart"><h4>聽懂分數的變化</h4><p class="tr-hint">還沒有卡牌遊戲的分數。</p></section>`;
    const W = 420, H = 170, L = 30, B = 22, x0 = pts[0].t, x1 = Math.max(pts[pts.length - 1].t, x0 + 1);
    const px = t => L + (t - x0) / (x1 - x0) * (W - L - 10), py = v => 8 + (1 - v / 100) * (H - B - 8);
    const keys = [...new Set(pts.map(p => p.k))], colors = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#db2777"];
    return `<section class="tr-chart"><h4>聽懂分數的變化</h4><svg viewBox="0 0 ${W} ${H}">
      ${[0, 50, 100].map(v => `<line x1="${L}" x2="${W - 10}" y1="${py(v)}" y2="${py(v)}" stroke="#e2e8f0"/><text x="${L - 5}" y="${py(v) + 4}" text-anchor="end" font-size="10" fill="#64748b">${v}</text>`).join("")}
      ${keys.map((k, i) => { const ps = pts.filter(p => p.k === k); return `<polyline fill="none" stroke="${colors[i % colors.length]}" stroke-width="2" points="${ps.map(p => `${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(" ")}"/>${ps.map(p => `<circle cx="${px(p.t).toFixed(1)}" cy="${py(p.v).toFixed(1)}" r="3.2" fill="${colors[i % colors.length]}"><title>${esc(k)}：${p.v}</title></circle>`).join("")}`; }).join("")}
      </svg><div class="tr-legend">${keys.map((k, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${esc(topicLabel(k.split(" ")[0]))} ${esc(k.split(" ")[1] || "")}</span>`).join("")}</div></section>`;
  }
  function dailyChart(days) {
    if (!days.length) return "";
    const max = Math.max(...days.map(d => d.runs));
    return `<section class="tr-chart"><h4>每天玩幾局</h4><div class="tr-days">${days.slice(-21).map(d => `<div title="${esc(d.day)}：${d.runs} 局"><i style="height:${(d.runs / max) * 100}%"></i><small>${esc(d.day.slice(5))}</small></div>`).join("")}</div></section>`;
  }
  function topicBars(topics) {
    const t = (topics || []).filter(x => num(x.best) !== null);
    if (!t.length) return "";
    return `<section class="tr-chart"><h4>各主題最好的分數</h4>${t.map(x => `<div class="tr-tbar"><span>${esc(topicLabel(x.chapter))} <small>${esc(x.level)}</small></span>${bar(num(x.best), num(x.best) < 40 ? "bad" : num(x.best) < 70 ? "mid" : "good")}<b>${n(x.best)}</b></div>`).join("")}</section>`;
  }

  // ── 錄音打包下載（ZIP）──
  // The server puts every matching clip in one ZIP (系級/學號_姓名/…) with 錄音清單.csv; downloading does not mark anything heard.
  async function downloadZip(params, btn) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = "打包中…";
    try {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "")).toString();
      const r = await fetch(API() + "/teacher/recordings/download.zip" + (q ? "?" + q : ""), { headers: head() });
      if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "下載失敗，請再試一次。"); }
      const cd = r.headers.get("Content-Disposition") || "";
      let name = "recordings.zip";
      try { const m = cd.match(/filename\*=UTF-8''([^;]+)/i); if (m) name = decodeURIComponent(m[1]); } catch (e) {}
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      const got = num(r.headers.get("X-Recordings")), miss = num(r.headers.get("X-Missing"));
      toast(`已下載 ${name}${got !== null ? `（${got} 段）` : ""}${miss ? `，其中 ${miss} 段檔案已不在` : ""}。裡面有學生姓名和聲音，請不要外流。`);
    } catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  // ── 一位學生：每一局的時間軸（什麼時候、玩什麼、怎麼作答、有沒有異常、錄音）──
  const WEEK = "日一二三四五六";
  function answersLine(a) {
    if (!a) return "";
    const parts = [`${n(a.answered)}/${n(a.cards)} 張卡有作答`, `第一次就對 <b>${n(a.first_right)}</b> 張`];
    if (num(a.first_wrong)) parts.push(`<span class="tr-bad">配錯 ${n(a.first_wrong)} 張</span>`);
    parts.push(`重聽 ${n(a.repeats, "0")} 次`);
    if (num(a.quiz)) parts.push(`小測 ${n(a.quiz_right)}/${n(a.quiz)}`);
    if (num(a.reads)) parts.push(`朗讀 ${n(a.reads)} 張`);
    return parts.join(" · ");
  }
  function runTimeline(runs, recs) {
    if (!runs.length) return `<p class="tr-hint">這位學生還沒有任何一局。</p>`;
    const byRun = new Map();
    for (const r of recs) if (r.run_id) { const k = Number(r.run_id); if (!byRun.has(k)) byRun.set(k, []); byRun.get(k).push(r); }
    let lastDay = "";
    return `<ol class="tr-tl">${runs.map(r => {
      const day = String(r.started_at || "").slice(0, 10), d = new Date(day + "T12:00:00");
      const dayHead = day !== lastDay ? `<li class="tr-tl-day">${esc(day)}${isNaN(d) ? "" : `（${WEEK[d.getDay()]}）`}</li>` : ""; lastDay = day;
      const card = r.game === "pecha_kucha", flags = r.flags || [];
      const state = flags.length ? flags.map(f => `<span class="tr-badge bad" title="${esc((FLAG_WHY[f] ? FLAG_WHY[f]("這") : ""))}">⚠ ${esc(FLAG[f] || f)}</span>`).join(" ") : `<span class="tr-badge good">✓ 沒有異常</span>`;
      const done = r.ended_at ? (card ? (r.wrap_done ? `<span class="tr-badge good">玩完＋收尾</span>` : `<span class="tr-badge info">只配對完</span>`) : `<span class="tr-badge good">玩完</span>`) : `<span class="tr-badge warn">沒玩完</span>`;
      const clips = byRun.get(Number(r.id)) || [];
      return `${dayHead}<li class="tr-tl-item${flags.length ? " flagged" : ""}">
        <time>${esc(String(r.started_at || "").slice(11, 16))}${r.ended_at ? `<small>–${esc(String(r.ended_at).slice(11, 16))}</small>` : ""}</time>
        <div class="tr-tl-body">
          <div class="tr-tl-head"><b>${esc(GAME_ZH[r.game] || r.game)} · ${esc(card ? topicLabel(r.chapter) : r.chapter || "")} ${esc(r.level || "")}</b>
            <span class="tr-tl-score">${card ? "聽懂分數" : "分數"} <b>${esc(scoreOf(r))}</b></span>${done} ${state}${r.excluded ? ` <span class="tr-badge" title="這一局不計入班級統計">${esc(EXCL[r.excluded] || "不計")}</span>` : ""}</div>
          <p class="tr-tl-ans">${r.answers ? answersLine(r.answers) : ""}${num(r.minutes) !== null ? `${r.answers ? " · " : ""}${n(r.minutes)} 分鐘（有效 ${n(r.active_minutes)}）` : ""}</p>
          ${clips.length ? `<div class="tr-tl-clips">${clips.map(c => `<span class="tr-tl-clip" data-rec-play="${Number(c.id)}"><button class="btn" type="button" title="${esc(c.script_text || "")}">▶ ${esc(c.label ? cardLabel(c.label) : "錄音")}${num(c.seconds) !== null ? ` ${n(c.seconds)} 秒` : ""}</button><span data-player></span><span class="tr-badge ${(STATUS[c.status] || STATUS.new)[1]}">${(STATUS[c.status] || STATUS.new)[0]}</span></span>`).join("")}</div>` : ""}
          <button class="btn tr-tl-more" type="button" data-run="${Number(r.id)}">看每一張卡怎麼作答 ▸</button>
        </div></li>`;
    }).join("")}</ol>`;
  }
  // The small ▶ buttons in the time line: fetch the clip (that marks it heard on the server) and play it in place.
  function wireTimelineClips() {
    document.querySelectorAll("#trView [data-rec-play]").forEach(box => {
      const btn = box.querySelector("button");
      btn.onclick = async () => {
        btn.disabled = true; const label = btn.textContent; btn.textContent = "載入中…";
        try {
          const r = await fetch(API() + `/teacher/recordings/${Number(box.dataset.recPlay)}/audio`, { headers: head() });
          if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "播放失敗"); }
          const audio = document.createElement("audio"); audio.controls = true; audio.autoplay = true; audio.src = URL.createObjectURL(await r.blob());
          box.querySelector("[data-player]").replaceChildren(audio); btn.remove();
          const b = box.querySelector(".tr-badge"); if (b && b.textContent === STATUS.new[0]) { b.textContent = STATUS.heard[0]; b.className = "tr-badge " + STATUS.heard[1]; }
          voiceBadge().catch(() => {});
        } catch (e) { btn.disabled = false; btn.textContent = label; toast(e.message); }
      };
    });
  }

  // ── 一位學生 ──
  async function studentView(my) {
    const [d, v, fbAll] = await Promise.all([get("/learning/records/student/" + Number(S.studentId), dates()), get("/teacher/recordings", { user_id: S.studentId, ...dates() }), get("/teacher/feedback").catch(() => ({ feedback: {} }))]);
    S.fb = fbAll.feedback || {}; S.emailReady = !!fbAll.email_ready;
    if (stale(my)) return;
    await T.need([...d.card_topics.map(x => x.chapter), ...d.weak_cards.map(w => T.parse(w.card).topic), ...d.runs.map(r => r.chapter)]);
    if (stale(my)) return;
    const st = d.student, t = d.totals, row = (S.report ? S.report.students : []).find(x => x.user_id === S.studentId) || {};
    $("trView").innerHTML = `
      <section class="panel">
        <div class="section-h"><h2>${esc(st.name)}${st.test ? ` <span class="tr-badge">測試帳號</span>` : ""} <small>${esc(st.student_no || "")}${row.section ? " · " + esc(row.section) : ""} · 研究代碼 ${esc(st.public_id || "–")}</small></h2><div class="row"><button class="btn btn-primary" type="button" id="trSendOne">📨 傳學習報告給他</button><button class="btn" type="button" id="trBack">← 回學生名單</button></div></div>
        ${S.from || S.to ? `<p class="tr-hint">只看 ${esc(S.from || "最早")} 到 ${esc(S.to || "今天")} 的紀錄。要看全部請按上面的「清除篩選」。</p>` : ""}
        ${st.test ? `<p class="tr-hint">這是${st.role === "teacher" ? "老師" : st.role === "admin" ? "管理員" : "標成測試"}的帳號：這一頁照常顯示他玩的每一局，但這些局不進班級統計、題目難度和研究匯出。</p>` : ""}
        ${profileCard(d.profile || {}, row)}
        <div class="tr-fbbox"><label>給 ${esc(st.name)} 的評語 <small>先存成草稿，按「傳學習報告給他」才會送出</small><textarea id="trFbOne" rows="3" maxlength="2000" placeholder="例如：第 7 張的句子多聽兩次，下次會更好！">${esc((S.fb && S.fb[S.studentId] || {}).text || "")}</textarea></label><small class="tr-saved" id="trFbOneMsg"></small></div>
        <div class="tr-tiles">${tile(n(t.runs), "開始的局數")}${tile(n(t.finished), "玩完的局數")}${tile(n(t.active_minutes), "有效學習分鐘")}${tile(n(t.games), "玩過的遊戲")}${tile(v.recordings.length, "送出的錄音")}${tile(n(t.events), "操作紀錄筆數")}${tile(dt(t.first_played), "第一次玩")}${tile(dt(t.last_played), "最近一次")}</div>
        <div class="tr-charts">${scoreChart(d.card_topics)}${dailyChart(d.daily || [])}${topicBars(d.card_topics)}</div>
        <table class="part-table tr-table"><thead><tr><th>遊戲</th><th>局數</th><th>玩完</th><th>有效分鐘</th><th>最近玩</th></tr></thead><tbody>${d.by_game.length ? d.by_game.map(g => `<tr><td>${esc(GAME_ZH[g.game] || g.name)}</td><td>${n(g.runs)}</td><td>${n(g.finished)}</td><td>${n(g.active_minutes)}</td><td>${esc(dt(g.last))}</td></tr>`).join("") : `<tr><td colspan="5">這位學生還沒有任何紀錄。</td></tr>`}</tbody></table>
      </section>
      ${d.card_topics.length ? `<section class="panel"><h3 class="tr-h">卡牌遊戲：每個主題的進步</h3>
        <div class="scrollx"><table class="part-table tr-table"><thead><tr><th>主題</th><th>局數</th><th>第一次 → 最佳 → 最近</th><th>分數變化</th><th>最近玩</th></tr></thead><tbody>${d.card_topics.map(x => `<tr><td>${esc(topicLabel(x.chapter))} <small>${esc(x.level)}</small></td><td>${n(x.runs)} 局<small class="tr-sub">玩完 ${n(x.finished)}</small></td><td class="nw">${n(x.first_score)} → ${n(x.best)} → ${n(x.last_score)}</td><td>${spark(x.scores)}</td><td class="nw">${esc(dt(x.last))}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      <div class="tr-two">
        <section class="panel"><h3 class="tr-h">需要再練的句子</h3>${d.weak_cards.length ? `<ul class="tr-list">${d.weak_cards.slice(0, 12).map(w => { const p = T.parse(w.card); return `<li><b>${esc(cardLabel(w.card))}</b> <small>${esc(topicLabel(p.topic))} ${esc(p.level)} · ${n(w.plays)} 次中 ${n(w.misses)} 次第一次沒配對到${w.last_first ? " · 最近一次配對了" : ""}</small><span>${esc(cardScript(w.card))}</span>${(w.wrong || []).length ? `<small>放到過：${w.wrong.map(x => esc(cardLabel(x.target)) + " ×" + n(x.n)).join("、")}</small>` : ""}</li>`; }).join("")}</ul>` : `<p class="tr-hint">沒有第一次配錯的句子。</p>`}
          ${d.quiz_missed.length ? `<h3 class="tr-h">小測沒答對的字</h3><p class="tr-words">${d.quiz_missed.map(q => `<b>${esc(q.word)}</b>${num(q.n) > 1 ? ` ×${n(q.n)}` : ""}`).join(" ")}</p>` : ""}</section>
        <section class="panel"><div class="section-h"><h3 class="tr-h">語音（${v.recordings.length} 段）</h3>${v.recordings.length ? `<button class="btn" type="button" id="trZipOne">⬇ 下載他的所有錄音（ZIP）</button>` : ""}</div>${voiceRows(v.recordings, false)}
          ${d.speaking.length ? `<h3 class="tr-h">口說紀錄（時間、語速、機器辨識）</h3><div class="scrollx"><table class="part-table tr-table"><thead><tr><th>時間</th><th>念的內容</th><th>秒／目標</th><th>字/分</th><th>機器聽到</th><th>錄音</th></tr></thead><tbody>${d.speaking.slice(0, 40).map(x => `<tr><td class="nw">${esc(dt(x.at))}</td><td>${esc(clipLabel(x.clip))}<small class="tr-sub">${esc(GAME_ZH[x.game] || x.game)}</small></td><td class="nw">${n(x.seconds)}${num(x.target) !== null ? " / " + n(x.target) : ""}</td><td>${n(x.wpm)}</td><td>${pct(x.heard)}</td><td>${x.uploaded ? "已送出" : x.recorded ? "只在學生裝置" : "–"}</td></tr>`).join("")}</tbody></table></div>` : ""}</section>
      </div>
      ${d.reflections.length ? `<section class="panel"><h3 class="tr-h">學生寫的反思</h3><ul class="tr-list">${d.reflections.map(x => `<li><small>${esc(dt(x.at))} · ${esc(GAME_ZH[x.game] || x.game)}${x.question ? " · " + esc(x.question) : ""}${x.answer ? " → " + esc(x.answer) : ""}</small><span>${esc(x.sentence || "")}</span></li>`).join("")}</ul></section>` : ""}
      <section class="panel" id="trTimeline"><h3 class="tr-h">什麼時候玩了什麼、怎麼作答、有沒有異常</h3>
        <p class="tr-hint">一局一列，最新的在上面。「⚠」是這一局的作答方式不像一般練習（例如同一句連放很多張才對，或極快又全對），請點「看每一張卡怎麼作答」確認。▶ 可以直接聽這一局送出的錄音。</p>
        ${runTimeline(d.runs, v.recordings)}</section>`;
    $("trBack").onclick = () => { S.studentId = null; refresh(); };
    $("trSendOne").onclick = async () => { await saveFb(S.studentId, $("trFbOne").value, $("trFbOneMsg")); sendReports([S.studentId], st.name); };
    $("trFbOne").onblur = () => saveFb(S.studentId, $("trFbOne").value, $("trFbOneMsg"));
    if ($("trZipOne")) $("trZipOne").onclick = e => downloadZip({ user_id: S.studentId, ...dates() }, e.currentTarget);
    wireRuns(); wireVoice(); wireTimelineClips();
  }

  // ── 一局 ──
  async function runModal(id, opener) {
    const m = $("trModal"); m.hidden = false; m.innerHTML = `<div class="tr-sheet"><p class="tr-hint">讀取中…</p></div>`;
    const close = () => { m.hidden = true; m.innerHTML = ""; removeEventListener("keydown", onKey); if (opener && opener.isConnected) opener.focus(); };
    const onKey = e => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    m.onclick = e => { if (e.target === m) close(); };
    try {
      const d = await get("/learning/records/run/" + Number(id)), r = d.run;
      await T.need([r.chapter]);
      const card = r.game === "pecha_kucha";
      m.innerHTML = `<div class="tr-sheet" role="dialog" aria-modal="true" aria-label="一局的紀錄">
        <div class="section-h"><h2>${who(r)} <small>${esc(GAME_ZH[r.game] || r.game)} · ${esc(card ? topicLabel(r.chapter) : r.chapter)} ${esc(r.level || "")} · ${esc(dt(r.started_at))}</small></h2><div class="row"><button class="btn" type="button" id="trClose">關閉（Esc）</button></div></div>
        <p class="tr-summary">${esc(codes(d.summary, card ? r : null))}</p>
        <div class="tr-tiles">${tile(scoreOf(r), card ? "聽懂分數" : "平均星數")}${tile(n(r.minutes), "分鐘")}${tile(n(r.active_minutes), "有效分鐘")}${tile(d.events.length, "操作筆數")}${tile(r.ended_at ? "是" : "否", "玩完")}</div>
        ${d.cards ? `<h3 class="tr-h">每一張卡（照學生抽到的順序）</h3><div class="scrollx"><table class="part-table tr-table"><thead><tr><th>#</th><th>這一句（投影片）</th><th>第一次</th><th>放錯到</th><th>放了幾次</th><th>重聽</th><th>秒</th><th>備註</th></tr></thead><tbody>
          ${d.cards.map((c, i) => `<tr title="${esc(cardScript(c.card))}"><td>${i + 1}</td><td>${cardCell(c.card)}</td><td>${c.first == null ? "沒作答" : c.first ? `<span class="tr-badge good">✓</span>` : `<span class="tr-badge bad">✗</span>`}</td><td>${(c.wrong_targets || []).map(t => esc(cardLabel(t))).join("、") || "–"}</td><td class="nw">${n(c.attempts)}${num(c.k) !== null ? `<small class="tr-sub">當時 ${n(c.k)} 張可選</small>` : ""}</td><td>${n(c.repeats)}</td><td>${num(c.rt_ms) === null ? "–" : (num(c.rt_ms) / 1000).toFixed(1)}</td><td>${c.review ? "上次配錯的複習卡" : ""}${c.matched ? "" : " 沒配對完"}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${d.quiz && d.quiz.length ? `<h3 class="tr-h">小測</h3><p class="tr-words">${d.quiz.map(q => `<b class="${q.correct ? "ok" : "no"}">${esc(q.word)}${q.correct ? " ✓" : " ✗ 選了 " + esc(q.chosen)}</b>`).join(" ")}</p>` : ""}
        ${d.reads && d.reads.length ? `<h3 class="tr-h">朗讀</h3><p class="tr-hint">${d.reads.map(x => `${esc(clipLabel(x.clip))}：${n(x.seconds)} 秒（目標 ${n(x.target)} 秒）、${n(x.wpm)} 字/分${num(x.heard) !== null ? "、機器聽到 " + pct(x.heard) : ""}、${x.uploaded ? "已送出給老師" : x.recorded ? "有錄音但沒送出" : "只計時"}`).join("；")}</p>` : ""}
        ${d.reflects && d.reflects.length ? `<h3 class="tr-h">反思</h3>${d.reflects.map(x => `<p class="tr-hint">${esc(x.question || "")} → ${esc(x.answer || "")}<br><b>${esc(x.sentence || "")}</b></p>`).join("")}` : ""}
        ${d.flags && d.flags.length ? `<h3 class="tr-h">要注意</h3><p class="tr-hint">${d.flags.map(f => esc(f.reason)).join("；")}</p>` : ""}
        <details><summary>全部操作紀錄（${d.events.length} 筆，研究用）</summary><div class="scrollx"><table class="part-table tr-table tr-events"><thead><tr><th>#</th><th>秒</th><th>段</th><th>動作</th><th>內容</th></tr></thead><tbody>
          ${d.events.map(e => `<tr><td>${n(e.seq)}</td><td>${n(e.t)}</td><td>${esc(e.stage ?? "")}</td><td class="nw">${esc(EVENT[e.type] || "其他")} <small><code>${esc(e.type)}</code></small></td><td>${esc(codes(e.detail || "", card ? r : null))} ${e.data ? `<small>${esc(JSON.stringify(e.data))}</small>` : ""}</td></tr>`).join("")}</tbody></table></div></details>
        <p class="tr-hint" title="${esc(typeof d.client === "string" ? d.client : JSON.stringify(d.client || ""))}">裝置：${esc(device(d.client))}</p></div>`;
      $("trClose").onclick = close; $("trClose").focus();
    } catch (e) {
      m.innerHTML = `<div class="tr-sheet"><p class="tr-msg bad">${esc(e.message)}</p><button class="btn" type="button" id="trClose">關閉</button></div>`;
      $("trClose").onclick = close;
    }
  }

  // ── 語音 ──
  // 排序（時間）與分組（系級／學生）只在瀏覽器裡做，不用再問伺服器。
  function voiceGrouped(list) {
    const sorted = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) * (S.voiceSort === "old" ? 1 : -1));
    if (!S.voiceGroup) return voiceRows(sorted);
    const key = r => (S.voiceGroup === "section" ? r.section || "沒有系級" : `${r.section || ""} ${r.name || ""}${r.student_no ? "（" + r.student_no + "）" : ""}`.trim());
    const groups = new Map();
    for (const r of sorted) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const order = [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    // Inside a group: not heard yet first, then by 學號; only the group with the most unheard clips starts open.
    const rank = r => (r.status === "new" ? 0 : 1);
    for (const g of groups.values()) g.sort((a, b) => rank(a) - rank(b) || String(a.student_no || "").localeCompare(String(b.student_no || "")) || String(b.created_at).localeCompare(String(a.created_at)));
    const freshOf = k => groups.get(k).filter(r => r.status === "new").length;
    const openKey = order.reduce((best, k) => (freshOf(k) > (best ? freshOf(best) : 0) ? k : best), null);
    return order.map(k => { const g = groups.get(k), fresh = freshOf(k), done = g.length - fresh, pctDone = Math.round(done / g.length * 100);
      return `<details class="tr-vgroup" data-vg="${esc(k)}" ${k === openKey ? "open" : ""}><summary><b>${esc(k)}</b>
        <span class="tr-vprog" title="已處理 ${done} / ${g.length}"><i style="width:${pctDone}%"></i></span><span>未聽 <b data-vfresh>${fresh}</b> / 共 ${g.length} 段</span>
        ${fresh ? "" : `<span class="tr-badge good">✓ 全部聽過</span>`}</summary>${voiceRows(g, S.voiceGroup !== "student")}</details>`; }).join("");
  }
  function voiceRows(list, withStudent = true) {
    if (!list.length) return `<p class="tr-hint">這個條件下沒有錄音。學生在卡牌遊戲玩完後朗讀一張投影片，念完就會自動送到這裡。</p>`;
    return `<div class="tr-voice">${list.map(r => { const st = STATUS[r.status] || STATUS.new; return `<div class="tr-clip" data-rec="${Number(r.id)}" data-find="${esc(`${r.name || ""} ${r.student_no || ""} ${r.section || ""}`.toLowerCase())}">
      <div class="tr-clip-head">${withStudent ? `<b>${esc(r.section || "")} ${who(r)}</b>` : ""}<span class="tr-badge ${st[1]}" data-st>${st[0]}</span>
        <small>${esc(dt(r.created_at))} · ${esc(GAME_ZH[r.game] || r.game)}${r.topic_id ? " · " + esc(topicLabel(r.topic_id)) : ""} ${esc(r.level || "")}${num(r.seconds) !== null ? " · " + n(r.seconds) + " 秒" : ""}${num(r.target_seconds) ? "（目標 " + Math.round(num(r.target_seconds)) + " 秒）" : ""}${num(r.wpm) ? " · " + n(r.wpm) + " 字/分" : ""} · ${Math.round((num(r.size_bytes) || 0) / 1024)} KB · 保存到 ${esc(String(r.expires_at || "").slice(0, 10))}</small></div>
      ${r.script_text ? `<p class="tr-script">${esc(r.script_text)}</p>` : ""}
      <div class="tr-clip-tools"><button class="btn btn-primary" type="button" data-play>▶ 播放</button><span data-player></span>
        <select data-status aria-label="狀態（改了就儲存）">${Object.entries(STATUS).map(([k, [label]]) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${label}</option>`).join("")}</select>
        <input data-note value="${esc(r.teacher_note || "")}" placeholder="給學生的回饋（學生下次念這一張時會看到）" maxlength="1000" aria-label="給學生的回饋">
        <button class="btn" type="button" data-save>儲存回饋</button><small class="tr-saved" data-saved role="status"></small><button class="btn" type="button" data-del title="刪除這段錄音">刪除</button></div></div>`; }).join("")}</div>`;
  }
  function advanceGroup(box) {
    const grp = box.closest(".tr-vgroup"); if (!grp) return;
    const fresh = [...grp.querySelectorAll("[data-status]")].filter(s => s.value === "new").length;
    const label = grp.querySelector("[data-vfresh]"); if (label) label.textContent = fresh;
    if (fresh) return;
    const next = [...document.querySelectorAll("#trView .tr-vgroup")].find(g => g !== grp && [...g.querySelectorAll("[data-status]")].some(s => s.value === "new"));
    setTimeout(() => { grp.open = false; if (next) { next.open = true; next.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); } }, 600);
  }
  function wireVoice() {
    document.querySelectorAll("#trView .tr-clip").forEach(box => {
      const id = Number(box.dataset.rec), sel = box.querySelector("[data-status]"), note = box.querySelector("[data-note]"), st = box.querySelector("[data-st]"), saved = box.querySelector("[data-saved]");
      let lastNote = note.value, busy = false;
      const paint = status => { const x = STATUS[status] || STATUS.new; st.textContent = x[0]; st.className = "tr-badge " + x[1]; sel.value = status; };
      // One way to save, used by the status list (at once), the note (Enter or leaving the box) and the button.
      async function save(fromNote) {
        if (busy) return; busy = true; saved.textContent = "儲存中…"; saved.className = "tr-saved";
        try {
          let status = sel.value;
          if (fromNote && note.value.trim() && (status === "new" || status === "heard")) status = "feedback";   // writing feedback is feedback
          const out = await send("PATCH", `/teacher/recordings/${id}`, { status, note: note.value });
          lastNote = note.value; paint(out.recording.status);
          advanceGroup(box);
          saved.textContent = "已儲存 " + new Date().toTimeString().slice(0, 5); saved.className = "tr-saved ok";
          voiceBadge().catch(() => {}); voiceCounts();
        } catch (err) { saved.textContent = "沒有存到：" + err.message; saved.className = "tr-saved bad"; }
        finally { busy = false; }
      }
      sel.onchange = () => save(false);
      note.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); save(true); } };
      note.onblur = () => { if (note.value !== lastNote) save(true); };
      note.oninput = () => { if (note.value !== lastNote) { saved.textContent = "還沒儲存（按 Enter）"; saved.className = "tr-saved"; } };
      box.querySelector("[data-save]").onclick = () => save(true);
      box.querySelector("[data-play]").onclick = async e => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = "載入中…";
        try {
          const r = await fetch(API() + `/teacher/recordings/${id}/audio`, { headers: head() });
          if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "播放失敗"); }
          const url = URL.createObjectURL(await r.blob());
          const audio = document.createElement("audio"); audio.controls = true; audio.autoplay = true; audio.src = url;
          box.querySelector("[data-player]").replaceChildren(audio);
          btn.remove();
          if (sel.value === "new") { paint("heard"); voiceBadge().catch(() => {}); voiceCounts(); }      // the server marks it heard when the sound is fetched
        } catch (err) { btn.disabled = false; btn.textContent = "▶ 播放"; toast(err.message); }
      };
      // Deleting sound cannot be undone, so it takes two presses on the same button instead of a pop-up.
      box.querySelector("[data-del]").onclick = async e => {
        const b = e.currentTarget;
        if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "再按一次刪除（無法復原）"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = "刪除"; } }, 5000); return; }
        try { await send("DELETE", `/teacher/recordings/${id}`); box.remove(); toast("錄音已刪除。"); voiceBadge().catch(() => {}); voiceCounts(); } catch (err) { toast(err.message); }
      };
    });
  }
  const voiceFilter = () => ({ course_id: S.courseId, section_id: S.sectionId, game: S.game, topic_id: S.voiceTopic, ...dates() });
  // The numbers on the 全部／未聽／已聽… buttons, read again after anything that changes them.
  async function voiceCounts() {
    if (S.tab !== "voice" || !document.querySelector("#trView [data-vs]")) return;
    try {
      const all = await get("/teacher/recordings", { ...voiceFilter(), limit: 1 });
      document.querySelectorAll("#trView [data-vs]").forEach(b => { const k = b.dataset.vs; const c = k ? num(all.counts[k]) || 0 : Object.values(all.counts).reduce((a, x) => a + (num(x) || 0), 0); b.querySelector("i").textContent = c; });
    } catch (e) {}
  }
  function applyFind() {
    const f = S.voiceFind.trim().toLowerCase(); let shown = 0;
    document.querySelectorAll("#trView .tr-clip").forEach(b => { const ok = !f || b.dataset.find.includes(f); b.hidden = !ok; if (ok) shown++; });
    if ($("trFindN")) $("trFindN").textContent = f ? `符合 ${shown} 段` : "";
  }
  async function voiceView(my) {
    const [v, all] = await Promise.all([get("/teacher/recordings", { ...voiceFilter(), status: S.voiceStatus }), get("/teacher/recordings", { ...voiceFilter(), limit: 1 })]);
    if (stale(my)) return;
    await T.need(v.recordings.map(r => r.topic_id));
    if (stale(my)) return;
    const topicIds = [...new Set([...T.list().map(t => t.id), ...v.recordings.map(r => r.topic_id).filter(Boolean), S.voiceTopic].filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    $("trView").innerHTML = `<section class="panel"><h3 class="tr-h">學生送出的錄音</h3>
      <p class="tr-hint">學生朗讀完會自動送到這裡。播放後自動標成「已聽」；改狀態會馬上儲存，回饋寫完按 Enter 就儲存。選「請重錄」，學生下次會先被要求重念這一張，並看到你的回饋。錄音保存 ${n(v.retention_days)} 天後自動刪除。</p>
      <div class="tr-row">${[["", "全部", Object.values(all.counts).reduce((a, b) => a + (num(b) || 0), 0)], ...Object.entries(STATUS).map(([k, [label]]) => [k, label, num(all.counts[k]) || 0])].map(([k, label, c]) => `<button type="button" class="tr-tab ${S.voiceStatus === k ? "on" : ""}" data-vs="${k}">${label} <i>${c}</i></button>`).join("")}</div>
      <div class="tr-row">
        <label>主題 <select id="trVoiceTopic"><option value="">全部</option>${topicIds.map(t => `<option value="${esc(t)}" ${t === S.voiceTopic ? "selected" : ""}>${esc(topicLabel(t))}</option>`).join("")}</select></label>
        <label>找學生 <input type="search" id="trVoiceFind" value="${esc(S.voiceFind)}" placeholder="姓名、學號或系級"></label><small class="tr-saved" id="trFindN"></small>
      </div>
      <div class="tr-row">
        <span class="tr-seglite">排序 ${[["new", "最新的在上面"], ["old", "最早的在上面"]].map(([k, l]) => `<button type="button" class="${S.voiceSort === k ? "on" : ""}" data-vsort="${k}">${l}</button>`).join("")}</span>
        <span class="tr-seglite">分組 ${[["", "不分組"], ["section", "依系級"], ["student", "依學生"]].map(([k, l]) => `<button type="button" class="${S.voiceGroup === k ? "on" : ""}" data-vgroup="${k}">${l}</button>`).join("")}</span>
      </div>
      <div class="tr-row tr-zip"><button class="btn btn-primary" type="button" id="trZipAll">⬇ 批次下載這些錄音（ZIP）</button>
        <small class="tr-hint">照上面選的課程、系級、日期、主題、狀態打包；ZIP 裡依「系級／學號_姓名」分資料夾，附一份錄音清單.csv。要下載某一位學生的全部錄音，請到「個人分析」點他的名字。</small></div>
      ${voiceGrouped(v.recordings)}</section>`;
    document.querySelectorAll("#trView [data-vs]").forEach(b => b.onclick = () => { S.voiceStatus = b.dataset.vs; refresh(); });
    document.querySelectorAll("#trView [data-vsort]").forEach(b => b.onclick = () => { S.voiceSort = b.dataset.vsort; voiceView(round); });
    document.querySelectorAll("#trView [data-vgroup]").forEach(b => b.onclick = () => { S.voiceGroup = b.dataset.vgroup; voiceView(round); });
    $("trVoiceTopic").onchange = e => { S.voiceTopic = e.target.value; refresh(); };
    $("trVoiceFind").oninput = e => { S.voiceFind = e.target.value; applyFind(); };
    $("trZipAll").onclick = e => downloadZip({ ...voiceFilter(), status: S.voiceStatus }, e.currentTarget);
    wireVoice(); applyFind();
  }

  window.loadRecords = game => load(game);
})();
