// Course detail in 課程與名單 (backend/course_plan.py): when a class meets, what each class session
// plays, who played it, and one calendar across every class. Mounted by teacher-courses.js:
//   TeacherSchedule.calendar(host, { onPick(courseId, sessionId) })   the month calendar of all classes
//   TeacherSchedule.course(host, { course, topics, focus })          one course: meeting time, sessions, reports
(function () {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => window.teacherToast(m);
  const T = () => api.teacher;
  const WD = ["一", "二", "三", "四", "五", "六", "日"];
  const GAME = { pecha_kucha: "卡牌遊戲", "innovation-harbor": "3D 創新港", "sdg4-stage": "SDG 4 舞台" };
  const LEVELS = ["A1", "A2", "B1", "B2"];
  const WHEN = { class: ["課堂中玩", "good"], day: ["當天課後玩", "good"], later: ["之後補玩", "info"], started: ["開始了沒玩完", "warn"], none: ["還沒玩", "bad"] };
  const COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2"];
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const mmdd = day => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  const topicCode = id => (window.topicCode ? window.topicCode(id) : id);
  const what = s => [s.game ? GAME[s.game] || s.game : "", s.topic_id ? "SDG " + topicCode(s.topic_id) : "", (s.levels || []).join("/")].filter(Boolean).join(" · ") || "（還沒排活動）";
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const colorOf = (id, ids) => COLORS[Math.max(0, ids.indexOf(id)) % COLORS.length];
  const shortName = c => (String(c.name || "").match(/([A-Z])\s*班/) || [])[1] ? (String(c.name).match(/([A-Z])\s*班/)[1] + " 班") : c.code;

  function bar(st) {
    if (!st) return "";
    const p = pct(st.played, st.students);
    return `<span class="ts-bar" title="${st.played} / ${st.students} 位學生玩了"><i style="width:${p}%"></i></span> <b>${st.played}</b>/${st.students}`;
  }

  // ── calendar of every class ──
  let calMonth = today().slice(0, 7);
  async function calendar(host, opts) {
    if (!host) return;
    host.innerHTML = `<p class="tc-hint">行事曆載入中…</p>`;
    let d;
    try { d = await T().calendar(calMonth); } catch (e) { host.innerHTML = `<p class="tc-msg bad">${esc(e.message)}</p>`; return; }
    const ids = d.courses.map(c => c.id);
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7;                       // Monday first
    const byDay = {};
    d.sessions.forEach(s => (byDay[s.day] = byDay[s.day] || []).push(s));
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<div class="ts-cell off"></div>`);
    for (let n = 1; n <= days; n++) {
      const day = `${calMonth}-${pad(n)}`, list = byDay[day] || [];
      cells.push(`<div class="ts-cell ${day === d.today ? "today" : ""} ${day < d.today ? "past" : ""}"><span class="ts-dn">${n}</span>
        ${list.map(s => {
          const c = d.courses.find(x => x.id === s.course_id) || {};
          const st = s.stats || {};
          return `<button type="button" class="ts-chip" style="--c:${colorOf(s.course_id, ids)}" data-c="${Number(s.course_id)}" data-s="${Number(s.id)}"
            title="${esc(c.name)}｜${esc(what(s))}${s.note ? "｜" + esc(s.note) : ""}｜${st.played || 0}/${st.students || 0} 人玩了${st.mean_best != null ? "，平均 " + st.mean_best : ""}">
            <b>${esc(shortName(c))}</b> ${esc(s.start_time || "")}<br><small>${esc(s.topic_id ? topicCode(s.topic_id) : (s.game ? GAME[s.game] : "未排"))}</small>
            ${day <= d.today ? `<small class="ts-cnt">${st.played || 0}/${st.students || 0}${st.mean_best != null ? " · " + Math.round(st.mean_best) : ""}</small>` : ""}</button>`;
        }).join("")}</div>`);
    }
    host.innerHTML = `
      <div class="section-h"><h3 class="tc-h">全部班級行事曆</h3>
        <div class="row"><button class="btn" type="button" data-m="-1" aria-label="上個月">‹</button><b class="ts-month">${y} 年 ${m} 月</b><button class="btn" type="button" data-m="1" aria-label="下個月">›</button><button class="btn" type="button" data-m="0">本月</button></div></div>
      <div class="ts-legend">${d.courses.map(c => `<span><i style="background:${colorOf(c.id, ids)}"></i>${esc(c.name)}${c.meeting.weekday_zh ? `：週${esc(c.meeting.weekday_zh)} ${esc(c.meeting.periods)} ${esc(c.meeting.start)}–${esc(c.meeting.end)}` : "：還沒設上課時間"}</span>`).join("")}</div>
      <div class="ts-grid">${WD.map(w => `<div class="ts-wd">週${w}</div>`).join("")}${cells.join("")}</div>
      <p class="tc-hint">每格是一堂課：班別、時間、主題；已經上過的課會顯示「玩了幾人／全班人數 · 平均分」。點一堂課看誰玩了、誰還沒玩。${d.sessions.length ? "" : "<b>這個月還沒有排課。</b>先在下面選一門課、設定上課時間，再按「每週排課」。"}</p>`;
    host.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
      const k = Number(b.dataset.m);
      if (!k) calMonth = today().slice(0, 7);
      else { const t = new Date(y, m - 1 + k, 1); calMonth = `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; }
      calendar(host, opts);
    });
    host.querySelectorAll(".ts-chip").forEach(b => b.onclick = () => opts.onPick(Number(b.dataset.c), Number(b.dataset.s)));
  }

  // ── one course ──
  let state = null;          // { course, topics, data, open: session id whose report is open, edit: session id or "new", filter }
  async function course(host, opts) {
    if (!host) return;
    state = { host, course: opts.course, topics: opts.topics || [], data: null, open: opts.focus || null, edit: null, filter: "all", onChange: opts.onChange || (() => {}) };
    await reload();
    if (opts.focus) {
      const row = host.querySelector(`[data-row="${Number(opts.focus)}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  async function reload() {
    const { host, course: c } = state;
    try { state.data = await T().sessions(c.id); } catch (e) { host.innerHTML = `<p class="tc-msg bad">${esc(e.message)}</p>`; return; }
    if (state.course !== c) return;
    render();
  }

  function topicOptions(sel) {
    return `<option value="">（不限主題）</option>` + state.topics.map(t => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>SDG ${esc(topicCode(t.id))} ${esc(t.en)}${t.locked ? "（上鎖）" : ""}</option>`).join("");
  }
  const gameOptions = sel => `<option value="">（不指定）</option>` + Object.entries(GAME).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
  const levelBoxes = (name, sel) => LEVELS.map(l => `<label class="check"><input type="checkbox" name="${name}" value="${l}" ${sel && sel.includes(l) ? "checked" : ""}> ${l}</label>`).join("");

  function sessionForm(s) {
    const m = state.data.meeting;
    s = s || { day: today(), start_time: m.start, end_time: m.end, game: "pecha_kucha", topic_id: "", levels: [], title: "", note: "" };
    return `<form class="ts-form" id="tsSessForm">
      <b class="wide">${s.id ? `編輯 ${esc(mmdd(s.day))} 這堂課` : "新增一堂課"}</b>
      <label>日期 <input type="date" name="day" value="${esc(s.day)}" required></label>
      <label>開始 <input type="time" name="start" value="${esc(s.start_time || "")}"></label>
      <label>結束 <input type="time" name="end" value="${esc(s.end_time || "")}"></label>
      <label>遊戲 <select name="game">${gameOptions(s.game || "")}</select></label>
      <label class="wide">主題 <select name="topic">${topicOptions(s.topic_id || "")}</select></label>
      <div class="wide ts-lv"><span>難度（不勾＝不限）</span>${levelBoxes("lv", s.levels)}</div>
      <label class="wide">備註（例如：課堂試玩、期中考週不上課） <input name="note" maxlength="500" value="${esc(s.note || "")}"></label>
      <div class="wide tc-row"><button class="btn btn-primary" type="submit">儲存</button><button class="btn" type="button" id="tsSessCancel">取消</button><span class="tc-msg" id="tsSessMsg"></span></div>
    </form>`;
  }

  function render() {
    const { host, data: d } = state;
    const m = d.meeting;
    const past = d.sessions.filter(s => s.day <= d.today).length;
    host.innerHTML = `
      <div class="section-h"><h3 class="tc-h">上課時間與每堂課</h3><small class="tc-hint">${d.sessions.length} 堂課，已上 ${past} 堂</small></div>
      <form class="ts-meet" id="tsMeet">
        <label>星期 <select name="weekday"><option value="">（未設定）</option>${WD.map((w, i) => `<option value="${i}" ${m.weekday === i ? "selected" : ""}>週${w}</option>`).join("")}</select></label>
        <label>節次 <input name="periods" value="${esc(m.periods)}" placeholder="5–6 節" maxlength="40"></label>
        <label>從 <input type="time" name="start" value="${esc(m.start)}"></label>
        <label>到 <input type="time" name="end" value="${esc(m.end)}"></label>
        <button class="btn" type="submit">儲存上課時間</button><span class="tc-msg" id="tsMeetMsg"></span>
      </form>
      <details class="ts-weekly" ${d.sessions.length ? "" : "open"}>
        <summary><b>每週排課</b> <small>依上課時間，一次排好很多週（已經有課的日期不會重複）</small></summary>
        <form id="tsWeekly" class="ts-form">
          <label>從 <input type="date" name="from" value="${esc(d.today)}" required></label>
          <label>到 <input type="date" name="to" required></label>
          <label>遊戲 <select name="game">${gameOptions("pecha_kucha")}</select></label>
          <label>主題 <select name="topic">${topicOptions("")}</select></label>
          <div class="wide ts-lv"><span>難度（不勾＝不限）</span>${levelBoxes("lv", [])}</div>
          <label class="wide">不上課的日期（放假、考試，用逗號分開） <input name="skip" placeholder="2026-12-25, 2027-01-01"></label>
          <div class="wide tc-row"><button class="btn btn-primary" type="submit" ${m.weekday == null ? "disabled" : ""}>排課</button><span class="tc-msg" id="tsWeeklyMsg">${m.weekday == null ? "先設定星期幾上課。" : ""}</span></div>
        </form>
      </details>
      <div class="tc-row"><button class="btn" type="button" id="tsAdd">＋ 新增一堂課</button></div>
      ${state.edit === "new" ? sessionForm(null) : ""}
      ${d.sessions.length ? `<div class="scrollx"><table class="part-table tc-table ts-table"><thead><tr><th>日期</th><th>時間</th><th>活動</th><th>玩了</th><th>平均分</th><th>備註</th><th></th></tr></thead><tbody>
        ${d.sessions.map(s => {
          const st = s.stats || {}, future = s.day > d.today;
          return `<tr data-row="${Number(s.id)}" class="${s.day === d.today ? "ts-today" : ""} ${future ? "ts-future" : ""}">
            <td class="nw"><b>${esc(mmdd(s.day))}</b>（${esc(s.weekday)}）${s.day === d.today ? ` <span class="tc-badge info">今天</span>` : ""}</td>
            <td class="nw">${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""}</td>
            <td>${esc(what(s))}</td>
            <td class="nw">${future ? `<small class="tc-hint">還沒上</small>` : bar(st)}</td>
            <td>${!future && st.mean_best != null ? `<b>${esc(st.mean_best)}</b>` : ""}</td>
            <td><small>${esc(s.note || "")}</small></td>
            <td class="tc-actions"><button class="btn ${state.open === s.id ? "btn-primary" : ""}" type="button" data-open="${Number(s.id)}">${state.open === s.id ? "收起" : "誰玩了"}</button>
              <button class="btn" type="button" data-edit="${Number(s.id)}">編輯</button>
              <button class="btn" type="button" data-del="${Number(s.id)}">刪除</button></td></tr>
            ${state.edit === s.id ? `<tr><td colspan="7">${sessionForm(s)}</td></tr>` : ""}
            ${state.open === s.id ? `<tr class="ts-reprow"><td colspan="7"><div id="tsReport">載入中…</div></td></tr>` : ""}`;
        }).join("")}</tbody></table></div>`
        : `<p class="tc-hint">還沒有排課。設定上課時間後按「每週排課」，或「新增一堂課」。</p>`}`;

    host.querySelector("#tsMeet").onsubmit = async e => {
      e.preventDefault();
      const f = e.target, msg = host.querySelector("#tsMeetMsg");
      try {
        await T().saveMeeting(state.course.id, { weekday: f.weekday.value === "" ? null : Number(f.weekday.value), periods: f.periods.value, start: f.start.value, end: f.end.value });
        toast("上課時間已儲存。"); state.onChange(); reload();
      } catch (err) { msg.textContent = err.message; msg.className = "tc-msg bad"; }
    };
    host.querySelector("#tsWeekly").onsubmit = async e => {
      e.preventDefault();
      const f = e.target, msg = host.querySelector("#tsWeeklyMsg");
      try {
        const out = await T().weeklySessions(state.course.id, { day_from: f.from.value, day_to: f.to.value, game: f.game.value, topic_id: f.topic.value,
          levels: [...f.querySelectorAll('[name="lv"]:checked')].map(i => i.value), skip: f.skip.value.split(/[,，、\s]+/).filter(Boolean) });
        toast(`排了 ${out.made.length} 堂課${out.skipped.length ? `，跳過 ${out.skipped.length} 天（已經有課或不上課）` : ""}。`); state.onChange(); reload();
      } catch (err) { msg.textContent = err.message; msg.className = "tc-msg bad"; }
    };
    host.querySelector("#tsAdd").onclick = () => { state.edit = "new"; render(); host.querySelector("#tsSessForm [name=day]").focus(); };
    const form = host.querySelector("#tsSessForm");
    if (form) {
      host.querySelector("#tsSessCancel").onclick = () => { state.edit = null; render(); };
      form.onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        try {
          await T().saveSession(state.course.id, { id: state.edit === "new" ? null : state.edit, day: f.day.value, start: f.start.value, end: f.end.value, game: f.game.value,
            topic_id: f.topic.value, levels: [...f.querySelectorAll('[name="lv"]:checked')].map(i => i.value), note: f.note.value });
          toast("這堂課已儲存。"); state.edit = null; state.onChange(); reload();
        } catch (err) { const msg = host.querySelector("#tsSessMsg"); msg.textContent = err.message; msg.className = "tc-msg bad"; }
      };
    }
    host.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const id = Number(b.dataset.open); state.open = state.open === id ? null : id; state.filter = "all"; render(); });
    host.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { state.edit = Number(b.dataset.edit); render(); });
    host.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "再按一次刪除"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = "刪除"; } }, 4000); return; }
      try { await T().deleteSession(Number(b.dataset.del)); toast("已刪除這堂課（學生玩的紀錄都還在）。"); state.onChange(); reload(); } catch (err) { toast(err.message); }
    });
    if (state.open) report(state.open);
  }

  async function report(id) {
    const box = state.host.querySelector("#tsReport");
    if (!box) return;
    let r;
    try { r = await T().sessionReport(id); } catch (e) { box.innerHTML = `<p class="tc-msg bad">${esc(e.message)}</p>`; return; }
    if (state.open !== id || !box.isConnected) return;
    const sm = r.summary, s = r.session;
    const counts = { all: r.students.length, ...Object.fromEntries(Object.keys(WHEN).map(k => [k, r.students.filter(x => x.when === k).length])) };
    const shown = r.students.filter(x => state.filter === "all" || x.when === state.filter);
    const lastDay = new Date(sm.window.to); lastDay.setDate(lastDay.getDate() - 1);
    box.innerHTML = `
      <div class="ts-sum">
        <div><b>${sm.played}</b> / ${sm.students}<small>玩了（${pct(sm.played, sm.students)}%）</small></div>
        <div><b>${sm.in_class}</b><small>課堂中</small></div><div><b>${sm.same_day}</b><small>當天課後</small></div>
        <div><b>${sm.later}</b><small>之後補玩</small></div><div><b>${sm.started_only}</b><small>開始了沒玩完</small></div>
        <div><b>${sm.not_played - sm.started_only}</b><small>還沒玩</small></div>
        <div><b>${sm.mean_best ?? "—"}</b><small>平均分（每人最高分）</small></div><div><b>${sm.runs}</b><small>完成的局數</small></div>
      </div>
      <p class="tc-hint">算法：${esc(what(s))}，${esc(mmdd(sm.window.from))} 起到 ${esc(mmdd(iso(lastDay)))}（下一堂課前）完成的局。「課堂中」＝上課時間 ${esc(s.start_time || "?")}–${esc(s.end_time || "?")} 內開始。測試帳號、退選的學生列出來但不算進人數和平均；在 3D 遊戲裡玩的卡牌關卡不算。分數：卡牌遊戲＝聽懂分數，SDG 4 舞台＝念對的比例，3D 遊戲＝星星。</p>
      <div class="tc-row ts-filter">${[["all", "全部"], ...Object.entries(WHEN).map(([k, v]) => [k, v[0]])].map(([k, v]) => `<button type="button" class="btn ${state.filter === k ? "btn-primary" : ""}" data-f="${k}">${v} ${counts[k]}</button>`).join("")}
        <button type="button" class="btn" id="tsCsv">⬇ 下載這堂課 CSV</button></div>
      <div class="scrollx"><table class="part-table tc-table"><thead><tr><th>系級</th><th>學號</th><th>姓名</th><th>狀況</th><th>局數</th><th>最高分</th><th>最後一局</th><th>難度</th><th>第一次完成</th></tr></thead><tbody>
        ${shown.map(x => `<tr class="${x.status !== "active" || x.test ? "mute" : ""}"><td>${esc(x.section)}</td><td>${esc(x.student_no || "")}</td>
          <td>${esc(x.name)}${x.test ? ` <span class="tc-badge mute">測試</span>` : ""}${x.status !== "active" ? ` <span class="tc-badge mute">退選</span>` : ""}</td>
          <td><span class="tc-badge ${WHEN[x.when][1]}">${WHEN[x.when][0]}</span></td><td>${x.runs || ""}${x.started_only ? ` <small>(+${x.started_only} 沒完成)</small>` : ""}</td>
          <td>${x.best ?? ""}</td><td>${x.last ?? ""}</td><td>${esc(x.levels.join("、"))}</td><td class="nw">${x.first_at ? esc(mmdd(x.first_at.slice(0, 10)) + " " + x.first_at.slice(11, 16)) : ""}</td></tr>`).join("")
        || `<tr><td colspan="9" class="tc-hint">沒有符合的學生。</td></tr>`}</tbody></table></div>`;
    box.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { state.filter = b.dataset.f; report(id); });
    box.querySelector("#tsCsv").onclick = () => {
      const rows = [["日期", "系級", "學號", "姓名", "狀況", "局數", "最高分", "最後一局", "難度", "第一次完成", "修課狀態", "測試帳號"],
        ...r.students.map(x => [s.day, x.section, x.student_no, x.name, WHEN[x.when][0], x.runs, x.best ?? "", x.last ?? "", x.levels.join(" "), x.first_at || "", x.status === "active" ? "修課中" : "退選", x.test ? "是" : ""])];
      const csv = "﻿" + rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${r.course.code}-${s.day}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }

  window.TeacherSchedule = { calendar, course };
})();
