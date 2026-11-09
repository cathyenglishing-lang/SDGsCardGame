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

  const GAME_ZH = { pecha_kucha: "卡牌遊戲", "innovation-harbor": "Innovation Harbor 3D", "sdg4-stage": "SDG 4 Stage" };
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
  const S = { courses: [], courseId: "", sectionId: "", from: "", to: "", tab: "game", game: "pecha_kucha", chapter: "", level: "", games: null, report: null, studentId: null, voiceStatus: "", voiceTopic: "", voiceFind: "", showOff: false };

  // card id ("9-1/A2/s02") → words a teacher can read
  const cardNo = id => T.parse(id).no;
  const cardTitle = id => { const s = T.slide(id); return s ? (s.title_en || s.title_zh || "") : ""; };
  const cardScript = id => { const s = T.slide(id); return s ? (s.script || "") : ""; };
  const cardLabel = id => { const no = cardNo(id), t = cardTitle(id); return no ? `第 ${no} 張${t ? "「" + t + "」" : ""}` : String(id ?? ""); };
  const cardCell = id => { const no = cardNo(id), t = cardTitle(id); return no ? `<b class="tr-no">${no}</b> ${esc(t || "（教材裡找不到這一張）")}` : esc(id); };
  const topicLabel = ch => { const nm = T.name(ch); return nm ? `${ch} ${nm}` : String(ch ?? ""); };
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

  async function load() {
    try {
      // Courses and topics are read again every time the module is opened, so a course or a topic
      // made a moment ago in another module is already here.
      const [c] = await Promise.all([api.teacher.courses(), T.load(true)]);
      S.courses = c.courses;
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
        <div class="section-h"><h2>學習紀錄</h2><div class="row"><button class="btn" type="button" id="trReload">↻ 重新整理</button></div></div>
        <div class="tr-row">
          <label>課程 <select id="trCourse"><option value="">全部（含沒有課程的紀錄）</option>${S.courses.map(c => `<option value="${Number(c.id)}" ${String(c.id) === String(S.courseId) ? "selected" : ""}>${esc(c.term)} · ${esc(c.name)}</option>`).join("")}</select></label>
          <label>系級 <select id="trSection"><option value="">全部</option>${(course ? course.sections : []).map(s => `<option value="${Number(s.id)}" ${String(s.id) === String(S.sectionId) ? "selected" : ""}>${esc(s.label)}（${Number(s.students)}）</option>`).join("")}</select></label>
          <label>從 <input type="date" id="trFrom" value="${esc(S.from)}"></label><label>到 <input type="date" id="trTo" value="${esc(S.to)}"></label>
          ${anyFilter() ? `<button class="btn" type="button" id="trClear">✕ 清除篩選</button>` : ""}
        </div>
        ${backwards ? `<p class="tr-msg bad" role="alert">「從」的日期比「到」晚，所以查不到資料。<button class="btn" type="button" id="trSwap">幫我對調</button></p>` : ""}
        <div class="tr-tabs" role="tablist">
          <button type="button" class="tr-tab ${S.tab !== "voice" ? "on" : ""}" data-tab="game">依遊戲看全班</button>
          <button type="button" class="tr-tab ${S.tab === "voice" ? "on" : ""}" data-tab="voice">語音 <span id="trVoiceN"></span></button>
        </div>
      </section>
      <div id="trView"></div>
      <div id="trModal" class="tr-modal" hidden></div>`;
    $("trReload").onclick = () => load();
    $("trCourse").onchange = e => { S.courseId = e.target.value; S.sectionId = ""; S.studentId = null; S.showOff = false; shell(); refresh(); };
    $("trSection").onchange = e => { S.sectionId = e.target.value; shell(); refresh(); };
    $("trFrom").onchange = e => { S.from = e.target.value; shell(); refresh(); };
    $("trTo").onchange = e => { S.to = e.target.value; shell(); refresh(); };
    if ($("trClear")) $("trClear").onclick = () => { S.sectionId = ""; S.from = ""; S.to = ""; S.chapter = ""; S.level = ""; shell(); refresh(); };
    if ($("trSwap")) $("trSwap").onclick = () => { [S.from, S.to] = [S.to, S.from]; shell(); refresh(); };
    document.querySelectorAll("#trBody .tr-tabs .tr-tab").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.studentId = null; shell(); refresh(); });
  }
  // Every refresh gets a number. A view that comes back after a newer refresh has started is thrown
  // away, so a slow answer for the old filter can never overwrite the answer for the new one.
  let round = 0;
  const stale = my => my !== round;
  async function voiceBadge(my) {
    const v = await get("/teacher/recordings", { course_id: S.courseId, section_id: S.sectionId, limit: 1 });
    if (my !== undefined && stale(my)) return v;
    const c = num(v.counts.new) || 0;
    if ($("trVoiceN")) $("trVoiceN").innerHTML = c ? `<span class="tr-badge warn">${c} 未聽</span>` : "";
    return v;
  }
  async function refresh() {
    const my = ++round;
    $("trView").innerHTML = `<section class="panel"><p class="tr-hint">讀取中…</p></section>`;
    try {
      await voiceBadge(my);
      if (stale(my)) return;
      if (S.tab === "voice") return await voiceView(my);
      if (S.studentId) return await studentView(my);
      await gameView(my);
    } catch (e) { if (!stale(my)) $("trView").innerHTML = `<section class="panel"><p class="tr-msg bad">${esc(e.message)}</p></section>`; }
  }

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

  // ── 依遊戲 ──
  async function gameView(my) {
    const [games, rep] = await Promise.all([get("/learning/records/games", { course_id: S.courseId, section_id: S.sectionId }), get("/learning/records/game", { ...filters(), game: S.game, chapter: S.chapter, level: S.level })]);
    if (stale(my)) return;
    const card = S.game === "pecha_kucha";
    if (card) await T.need([...rep.topics, ...rep.runs.map(r => r.chapter), ...rep.cards.map(c => T.parse(c.card).topic), ...rep.confusion.map(c => T.parse(c.card).topic)]);
    if (stale(my)) return;
    S.games = games; S.report = rep;
    const o = rep.overview, students = rep.students, kinds = flagKinds(rep), maxRuns = Math.max(1, ...rep.funnel.map(f => Number(f.runs) || 0));
    const hard = rep.cards.length && rep.cards[0].n ? rep.cards[0] : null;
    const opt = (list, cur, label) => list.concat(cur && !list.includes(cur) ? [cur] : []).map(t => `<option value="${esc(t)}" ${t === cur ? "selected" : ""}>${esc(label(t))}</option>`).join("");
    $("trView").innerHTML = `
      <section class="panel">
        <div class="tr-games">${games.games.map(g => `<button type="button" class="tr-game ${g.game === S.game ? "on" : ""}" data-game="${esc(g.game)}"><b>${esc(GAME_ZH[g.game] || g.name)}</b><span>${Number(g.runs)} 局 · ${Number(g.students)} 人${g.last_played ? " · 最近 " + esc(dt(g.last_played)) : ""}</span></button>`).join("")}</div>
        <p class="tr-hint">這幾個遊戲目前不記錄學習資料，所以這裡看不到：${games.not_recorded.map(esc).join("、")}。</p>
        <div class="tr-row">
          <label>主題 <select id="trChapter"><option value="">全部</option>${opt(rep.topics, S.chapter, card ? topicLabel : String)}</select></label>
          <label>難度 <select id="trLevel"><option value="">全部</option>${opt(rep.levels, S.level, String)}</select></label>
          <button class="btn" type="button" data-x="1">⬇ Excel（含姓名，老師自己看）</button><button class="btn" type="button" data-x="0">⬇ Excel（只有研究代碼，給研究用）</button>
        </div>
        <div class="tr-tiles">
          ${tile(n(o.runs), "開始的局數")}${tile(n(o.finished), "玩完的局數")}${tile(n(o.students_played), "玩過的學生")}${tile(S.courseId ? n(o.not_played) : "–", S.courseId ? "還沒玩的學生" : "還沒玩的學生（先選課程）", S.courseId && num(o.not_played) ? "warn" : "")}
          ${card ? tile(n(o.avg_score), "平均聽懂分數") : ""}${tile(n(o.avg_minutes), "平均分鐘／局")}${tile(n(o.flagged_runs), "有標記的局", num(o.flagged_runs) ? "warn" : "")}${tile(n(o.events), "操作紀錄筆數")}
        </div>
      </section>
      <div id="trFirst"></div>
      <section class="panel"><h3 class="tr-h">學生（點一列看這位學生的全部紀錄）</h3>
        <div class="scrollx"><table class="part-table tr-table"><thead><tr><th>系級</th><th>學生</th><th>局數</th>${card ? "<th>最佳／最近</th><th>分數變化</th><th>第一次就配對</th>" : "<th>平均星數</th><th>結局</th>"}<th>錄音</th><th>要注意</th></tr></thead><tbody>
          ${students.length ? students.map(s => `<tr class="${s.user_id ? "tr-click" : ""} ${s.runs ? "" : "mute"}" data-student="${s.user_id ? Number(s.user_id) : ""}" ${s.user_id ? 'tabindex="0"' : ""}>
            <td class="nw">${esc(s.section || "")}</td><td>${who(s)}</td><td class="nw">${s.runs ? `${Number(s.runs)} 局 <small>玩完 ${Number(s.finished)}</small><small class="tr-sub">最近 ${esc(dt(s.last))}</small>` : `<span class="tr-badge warn">還沒玩</span>`}</td>
            ${card ? `<td class="nw">${n(s.best)} ／ ${n(s.last_score)}</td><td>${spark(s.scores)}</td><td>${num(s.first_n) ? `${n(s.first_ok)} / ${n(s.first_n)} 句` : "–"}</td>` : `<td>${n(s.avg_stars)}</td><td>${esc(s.best_ending || "–")}</td>`}
            <td>${s.recordings && num(s.recordings.total) ? `${n(s.recordings.total)} 段${num(s.recordings.new) ? ` <span class="tr-badge warn">${n(s.recordings.new)} 未聽</span>` : ""}` : "–"}</td>
            <td>${Object.entries(kinds[s.user_id] || {}).map(([f, c]) => `<span class="tr-badge bad">${esc(FLAG[f] || f)} ×${c}</span>`).join(" ") || (num(s.flags) ? `<span class="tr-badge bad">${n(s.flags)} 局有標記</span>` : "")}</td></tr>`).join("") : `<tr><td colspan="10">這個條件下沒有學生或紀錄。</td></tr>`}
        </tbody></table></div></section>
      ${card ? `
      <section class="panel"><h3 class="tr-h">最難的句子（由難到易）</h3>
        ${hard ? `<p class="tr-say">最難的是 ${esc(cardLabel(hard.card))}：${n(hard.n)} 人次裡只有 ${n(hard.first_ok)} 人次第一次就配對${hard.top_wrong ? "，最常被放到 " + esc(cardLabel(hard.top_wrong.target)) : ""}。</p>` : ""}
        <p class="tr-hint">「聽懂程度」只看每位學生第一次放卡，並扣掉用猜的機率：0 = 跟亂猜一樣，100 = 每個人第一次就配對。人次少的時候請看「第一次就配對」的實際人數。滑鼠停在一列上可以看到那一句的講稿。</p>
        <div class="scrollx"><table class="part-table tr-table"><thead><tr><th>這一句（投影片）</th><th>最常被放到</th><th>聽懂程度</th><th>第一次就配對</th><th>每次重聽</th><th>反應秒數</th></tr></thead><tbody>
          ${rep.cards.length ? rep.cards.map(c => { const p = T.parse(c.card), s = num(c.s); return `<tr title="${esc(cardScript(c.card))}"><td>${cardCell(c.card)}<small class="tr-sub">${esc(p.topic)} ${esc(p.level)}${num(c.version) ? " · 第 " + num(c.version) + " 版教材" : ""}</small></td>
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
      </div>` : ""}
      <section class="panel"><h3 class="tr-h">最近的局（點一列看每一步）</h3>${runsTable(rep.runs.slice(0, 60), card)}</section>`;
    document.querySelectorAll(".tr-game").forEach(b => b.onclick = () => { S.game = b.dataset.game; S.chapter = ""; S.level = ""; S.showOff = false; shell(); refresh(); });
    $("trChapter").onchange = e => { S.chapter = e.target.value; shell(); refresh(); };
    $("trLevel").onchange = e => { S.level = e.target.value; shell(); refresh(); };
    document.querySelectorAll("[data-x]").forEach(b => b.onclick = () => exportXlsx(b.dataset.x === "1", b));
    document.querySelectorAll("#trView [data-student]").forEach(r => { if (r.dataset.student) { r.onclick = () => { S.studentId = Number(r.dataset.student); refresh(); }; r.onkeydown = e => { if (e.key === "Enter") r.click(); }; } });
    paintFirst();
    wireRuns();
  }
  const scoreOf = r => (num(r.score) ?? num(r.avg_stars) ?? (num(r.coverage) !== null ? pct(r.coverage) : "–"));
  function runsTable(runs, card, withName = true) {
    return `<div class="scrollx"><table class="part-table tr-table"><thead><tr><th>開始</th>${withName ? "<th>學生</th>" : "<th>遊戲</th>"}<th>主題</th><th>${card ? "聽懂分數" : "分數／星數"}</th><th>玩完</th><th>分鐘</th><th>要注意</th></tr></thead><tbody>
      ${runs.length ? runs.map(r => `<tr class="tr-click" data-run="${Number(r.id)}" tabindex="0"><td class="nw">${esc(dt(r.started_at))}</td><td>${withName ? who(r) : esc(GAME_ZH[r.game] || r.game)}</td><td>${esc(r.game === "pecha_kucha" ? topicLabel(r.chapter) : r.chapter)} <small>${esc(r.level || "")}</small></td>
        <td>${esc(scoreOf(r))}</td><td>${r.ended_at ? (r.game === "pecha_kucha" ? (r.wrap_done ? "✓ 含收尾" : "✓ 只配對") : "✓") : `<span class="tr-badge warn">沒玩完</span>`}</td><td>${n(r.minutes)}${num(r.active_minutes) !== null ? `<small class="tr-sub">有效 ${n(r.active_minutes)}</small>` : ""}</td>
        <td>${(r.flags || []).map(f => `<span class="tr-badge bad">${esc(FLAG[f] || f)}</span>`).join(" ")}${r.embed ? ` <span class="tr-badge">3D 內嵌</span>` : ""}</td></tr>`).join("") : `<tr><td colspan="7">沒有紀錄。</td></tr>`}
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

  // ── 一位學生 ──
  async function studentView(my) {
    const [d, v] = await Promise.all([get("/learning/records/student/" + Number(S.studentId), dates()), get("/teacher/recordings", { user_id: S.studentId, ...dates() })]);
    if (stale(my)) return;
    await T.need([...d.card_topics.map(x => x.chapter), ...d.weak_cards.map(w => T.parse(w.card).topic), ...d.runs.map(r => r.chapter)]);
    if (stale(my)) return;
    const st = d.student, t = d.totals, row = (S.report ? S.report.students : []).find(x => x.user_id === S.studentId) || {};
    $("trView").innerHTML = `
      <section class="panel">
        <div class="section-h"><h2>${esc(st.name)} <small>${esc(st.student_no || "")}${row.section ? " · " + esc(row.section) : ""} · 研究代碼 ${esc(st.public_id || "–")}</small></h2><div class="row"><button class="btn" type="button" id="trBack">← 回全班</button></div></div>
        ${S.from || S.to ? `<p class="tr-hint">只看 ${esc(S.from || "最早")} 到 ${esc(S.to || "今天")} 的紀錄。要看全部請按上面的「清除篩選」。</p>` : ""}
        <div class="tr-tiles">${tile(n(t.runs), "開始的局數")}${tile(n(t.finished), "玩完的局數")}${tile(n(t.active_minutes), "有效學習分鐘")}${tile(n(t.games), "玩過的遊戲")}${tile(v.recordings.length, "送出的錄音")}${tile(n(t.events), "操作紀錄筆數")}${tile(dt(t.first_played), "第一次玩")}${tile(dt(t.last_played), "最近一次")}</div>
        <table class="part-table tr-table"><thead><tr><th>遊戲</th><th>局數</th><th>玩完</th><th>有效分鐘</th><th>最近玩</th></tr></thead><tbody>${d.by_game.length ? d.by_game.map(g => `<tr><td>${esc(GAME_ZH[g.game] || g.name)}</td><td>${n(g.runs)}</td><td>${n(g.finished)}</td><td>${n(g.active_minutes)}</td><td>${esc(dt(g.last))}</td></tr>`).join("") : `<tr><td colspan="5">這位學生還沒有任何紀錄。</td></tr>`}</tbody></table>
      </section>
      ${d.card_topics.length ? `<section class="panel"><h3 class="tr-h">卡牌遊戲：每個主題的進步</h3>
        <div class="scrollx"><table class="part-table tr-table"><thead><tr><th>主題</th><th>局數</th><th>第一次 → 最佳 → 最近</th><th>分數變化</th><th>最近玩</th></tr></thead><tbody>${d.card_topics.map(x => `<tr><td>${esc(topicLabel(x.chapter))} <small>${esc(x.level)}</small></td><td>${n(x.runs)} 局<small class="tr-sub">玩完 ${n(x.finished)}</small></td><td class="nw">${n(x.first_score)} → ${n(x.best)} → ${n(x.last_score)}</td><td>${spark(x.scores)}</td><td class="nw">${esc(dt(x.last))}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      <div class="tr-two">
        <section class="panel"><h3 class="tr-h">需要再練的句子</h3>${d.weak_cards.length ? `<ul class="tr-list">${d.weak_cards.slice(0, 12).map(w => { const p = T.parse(w.card); return `<li><b>${esc(cardLabel(w.card))}</b> <small>${esc(topicLabel(p.topic))} ${esc(p.level)} · ${n(w.plays)} 次中 ${n(w.misses)} 次第一次沒配對到${w.last_first ? " · 最近一次配對了" : ""}</small><span>${esc(cardScript(w.card))}</span>${(w.wrong || []).length ? `<small>放到過：${w.wrong.map(x => esc(cardLabel(x.target)) + " ×" + n(x.n)).join("、")}</small>` : ""}</li>`; }).join("")}</ul>` : `<p class="tr-hint">沒有第一次配錯的句子。</p>`}
          ${d.quiz_missed.length ? `<h3 class="tr-h">小測沒答對的字</h3><p class="tr-words">${d.quiz_missed.map(q => `<b>${esc(q.word)}</b>${num(q.n) > 1 ? ` ×${n(q.n)}` : ""}`).join(" ")}</p>` : ""}</section>
        <section class="panel"><h3 class="tr-h">語音</h3>${voiceRows(v.recordings, false)}
          ${d.speaking.length ? `<h3 class="tr-h">口說紀錄（時間、語速、機器辨識）</h3><div class="scrollx"><table class="part-table tr-table"><thead><tr><th>時間</th><th>念的內容</th><th>秒／目標</th><th>字/分</th><th>機器聽到</th><th>錄音</th></tr></thead><tbody>${d.speaking.slice(0, 40).map(x => `<tr><td class="nw">${esc(dt(x.at))}</td><td>${esc(clipLabel(x.clip))}<small class="tr-sub">${esc(GAME_ZH[x.game] || x.game)}</small></td><td class="nw">${n(x.seconds)}${num(x.target) !== null ? " / " + n(x.target) : ""}</td><td>${n(x.wpm)}</td><td>${pct(x.heard)}</td><td>${x.uploaded ? "已送出" : x.recorded ? "只在學生裝置" : "–"}</td></tr>`).join("")}</tbody></table></div>` : ""}</section>
      </div>
      ${d.reflections.length ? `<section class="panel"><h3 class="tr-h">學生寫的反思</h3><ul class="tr-list">${d.reflections.map(x => `<li><small>${esc(dt(x.at))} · ${esc(GAME_ZH[x.game] || x.game)}${x.question ? " · " + esc(x.question) : ""}${x.answer ? " → " + esc(x.answer) : ""}</small><span>${esc(x.sentence || "")}</span></li>`).join("")}</ul></section>` : ""}
      <section class="panel"><h3 class="tr-h">這位學生的每一局（點一列看每一步）</h3>${runsTable(d.runs, false, false)}</section>`;
    $("trBack").onclick = () => { S.studentId = null; refresh(); };
    wireRuns(); wireVoice();
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
  const voiceFilter = () => ({ course_id: S.courseId, section_id: S.sectionId, topic_id: S.voiceTopic, ...dates() });
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
      ${voiceRows(v.recordings)}</section>`;
    document.querySelectorAll("#trView [data-vs]").forEach(b => b.onclick = () => { S.voiceStatus = b.dataset.vs; refresh(); });
    $("trVoiceTopic").onchange = e => { S.voiceTopic = e.target.value; refresh(); };
    $("trVoiceFind").oninput = e => { S.voiceFind = e.target.value; applyFind(); };
    wireVoice(); applyFind();
  }

  window.loadRecords = () => load();
})();
