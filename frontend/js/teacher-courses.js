// Teacher dashboard → 課程與名單: courses, what a course has opened in the card game, roster
// import (preview → confirm → one-time account sheet) and the student list.
// Uses the page's own helpers (api, safeText) and backend/classroom.py.
// Also defines two things the other teacher modules share:
//   window.TeacherTopics   topic names, slide titles and sentences as 教材管理 published them
//   window.teacherToast    one message bar (same place, same duration, optional 復原) for all three modules

// One source for topics: what 教材管理 has published (GET /content/library). A topic that is not in
// it any more (deleted or never published) is looked up in the teacher's library; the file the site
// shipped with (pk-content.js) is only the last resort, and after that the raw code.
window.TeacherTopics = window.TeacherTopics || (() => {
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  let lib = null, loading = null;
  const extra = {};                                   // topic id → document, for topics students cannot see now
  const bank = () => ((window.PK_CONTENT || {}).topics || []);
  function load(force) {
    if (loading && !force) return loading;
    loading = fetch(API() + "/content/library").then(r => (r.ok ? r.json() : Promise.reject(new Error("library")))).then(d => { lib = d.topics || []; return lib; })
      .catch(() => { loading = null; return lib || bank(); });
    return loading;
  }
  const topic = id => (lib || []).find(t => t.id === id) || extra[id] || bank().find(t => t.id === id) || null;
  async function need(ids) {
    await load();
    const missing = [...new Set(ids)].filter(id => id && /^\d{1,2}-\d{1,2}$/.test(id) && !(lib || []).some(t => t.id === id) && !(id in extra));
    await Promise.all(missing.map(async id => {
      try {
        const r = await fetch(API() + `/teacher/library/pecha_kucha/${encodeURIComponent(id)}`, { headers: { Authorization: "Bearer " + auth.getToken() } });
        if (!r.ok) throw new Error("no topic");
        const d = await r.json(), doc = d.published || d.doc;
        extra[id] = doc ? { ...doc, id, gone: d.summary.archived ? "已刪除" : d.summary.published ? "" : "未發佈" } : null;
      } catch (e) { extra[id] = null; }
    }));
  }
  const parse = cardId => { const [t, lv, s] = String(cardId || "").split("/"); return { topic: t, level: lv, no: Number(String(s || "").replace(/\D/g, "")) || null }; };
  function slide(cardId) {
    const c = parse(cardId), t = topic(c.topic);
    if (!t || !t.levels || !c.no) return null;
    return (t.levels[c.level] || Object.values(t.levels)[0] || []).find(x => x.no === c.no) || null;
  }
  return { load, need, topic, slide, parse, list: () => lib || bank(), name: id => { const t = topic(id); return t ? (t.title_zh || t.title_en || "") : ""; } };
})();

// One message bar for the three modules. `undo` (optional) adds a 復原 button.
window.teacherToast = window.teacherToast || function (text, undo) {
  let t = document.getElementById("ttToast");
  if (!t) { t = document.createElement("div"); t.id = "ttToast"; t.className = "tt-toast"; t.setAttribute("role", "status"); t.hidden = true; document.body.appendChild(t); }
  t.textContent = "";
  const span = document.createElement("span"); span.textContent = text; t.appendChild(span);
  if (undo) { const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.id = "tlUndo"; b.textContent = "復原"; b.onclick = async () => { t.hidden = true; await undo(); }; t.appendChild(b); }
  t.hidden = false; clearTimeout(window.teacherToast.t);
  window.teacherToast.t = setTimeout(() => { t.hidden = true; }, undo ? 10000 : 4000);
};

(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, undo) => window.teacherToast(m, undo);
  const T = window.TeacherTopics;
  const LEVELS = ["A1", "A2", "B1", "B2"];
  const ACTION = {
    new: ["新增帳號", "good"], enroll: ["加入課程", "good"], reactivate: ["恢復修課", "good"], move: ["系級更新", "info"], update: ["更新資料", "info"],
    same: ["沒有變動", "mute"], conflict: ["資料衝突", "warn"], error: ["錯誤", "bad"],
  };
  let courses = [], current = null, preview = null, emailDomain = "nptu.edu.tw";
  // The one-time account sheets, per course: kept until the teacher puts them away, so ↻, another
  // preview or a look at another menu cannot lose them. { [courseId]: { rows, line, mail, downloaded } }
  const kept = {};
  const resetShown = {};                               // user id → the new password just made (shown in the list until the page is left)
  const nowHM = () => new Date().toTimeString().slice(0, 5);

  // Every published topic, plus anything this course has ticked that students cannot see any more.
  function topics(course) {
    const names = (window.CARDLEARN_UNLOCKS && window.CARDLEARN_UNLOCKS.TOPICS) || {};
    const list = T.list().map(t => ({ id: t.id, en: t.title_en || (names[t.id] || {}).en || "", zh: t.title_zh || (names[t.id] || {}).zh || "", levels: LEVELS.filter(l => t.levels && t.levels[l]), locked: !!t.locked, gone: "" }));
    for (const a of (course ? course.activities : [])) {
      if (a.game !== "pecha_kucha" || list.some(t => t.id === a.topic_id)) continue;
      const t = T.topic(a.topic_id);
      list.push({ id: a.topic_id, en: (t && t.title_en) || "", zh: (t && t.title_zh) || "", levels: a.levels, locked: false, gone: (t && t.gone) || "已刪除或還沒發佈" });
    }
    return list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }
  const pillText = c => `${c.students} 位學生 · ${(c.sections.filter(s => s.students).map(s => `${s.label} ${s.students}`).join("、") || "還沒有名單")}`;
  async function refreshCourses() {
    const data = await api.teacher.courses(); courses = data.courses; emailDomain = data.email_domain || emailDomain;
    current = courses.find(c => current && c.id === current.id) || current;
    const pill = document.querySelector("#coursesModule .tc-pill"); if (pill && current) pill.textContent = pillText(current);
  }

  async function load(keepId) {
    try {
      await flushActs();
      const [data] = await Promise.all([api.teacher.courses(), T.load(true)]);
      courses = data.courses; emailDomain = data.email_domain || emailDomain;
      await T.need(courses.flatMap(c => c.activities.filter(a => a.game === "pecha_kucha").map(a => a.topic_id)));
      current = courses.find(c => c.id === (keepId ?? current?.id)) || courses.find(c => c.active) || courses[0] || null;
      render();
      if (current) loadRoster();
    } catch (e) { $("tcBody").innerHTML = `<p class="tc-msg bad">${esc(e.message)}</p>`; }
  }

  function render() {
    preview = null;
    const opts = courses.map(c => `<option value="${Number(c.id)}" ${current && c.id === current.id ? "selected" : ""}>${esc(c.term)} · ${esc(c.name)}（${esc(c.code)}）${c.active ? "" : " · 已停用"}</option>`).join("");
    const c = current;
    $("tcBody").innerHTML = `
      <section class="panel">
        <div class="section-h"><h2>課程與名單</h2><div class="row"><button class="btn" type="button" id="tcReload">↻ 重新整理</button></div></div>
        <ol class="tc-steps"><li class="${c ? "done" : "now"}"><b>1</b>建立課程</li><li class="${c ? "now" : ""}"><b>2</b>貼上或上傳名單</li><li><b>3</b>預覽、確認匯入</li><li><b>4</b>發帳號單給學生</li></ol>
        <div class="tc-row">
          <label>課程 <select id="tcCourse">${opts || "<option value=''>（還沒有課程）</option>"}</select></label>
          <button class="btn" type="button" id="tcNew">＋ 新增課程</button>
          ${c ? `<span class="tc-pill">${esc(pillText(c))}</span>` : ""}
        </div>
        <form id="tcForm" class="tc-form" ${c ? "hidden" : ""}>
          <h3 class="tc-h wide" id="tcFormTitle"><span class="tc-no">1</span>新增課程</h3>
          <input type="hidden" id="tcId" value="">
          <label>學期 <input id="tcTerm" placeholder="1151" maxlength="20" required></label>
          <label>課號 <input id="tcCode" placeholder="ENG101" maxlength="40" required></label>
          <label class="wide">課程名稱 <input id="tcName" placeholder="English Presentation" maxlength="120" required></label>
          <input type="hidden" id="tcSections" value="">
          <label class="check"><input type="checkbox" id="tcActive" checked> 啟用（停用的課程不會出現在學生那邊，紀錄都保留）</label>
          <p class="tc-msg bad wide" id="tcFormMsg" role="alert"></p>
          <div class="tc-row wide"><button class="btn btn-primary" type="submit">儲存課程</button>${c ? `<button class="btn" type="button" id="tcCancel">取消</button>` : ""}</div>
        </form>
        ${c ? `<p class="tc-hint"><a href="#" id="tcEdit">編輯這門課（名稱、學期、停用）</a></p>` : `<p class="tc-hint">先建立一門課，再匯入名單。</p>`}
      </section>
      <section class="panel tc-import ${c ? "" : "wait"}" id="tcImportPanel">
        <h3 class="tc-h"><span class="tc-no">2</span>匯入名單${c ? `：${esc(c.name)}` : ""}</h3>
        ${c ? "" : `<p class="tc-wait">先在上面建立課程（學期、課號、課程名稱），按「儲存課程」後就可以在這裡貼名單。</p>`}
        <p class="tc-hint">從 Google Sheets 複製整塊貼上，或上傳 CSV／XLSX。第一列放欄位名稱：<b>系級、學號、姓名、email</b>。每位學生一定要有系級，而且只會有一個；email 可以空白，會用「學號@${esc(emailDomain)}」。同一份名單可以重複匯入，不會產生重複帳號。</p>
        <textarea id="tcText" rows="6" placeholder="系級&#9;學號&#9;姓名&#9;email&#10;資工三甲&#9;411012345&#9;王小明&#9;" ${c ? "" : "disabled"}></textarea>
        <div class="tc-row">
          <label class="tc-file">📄 上傳檔案 <input type="file" id="tcFile" accept=".csv,.tsv,.txt,.xlsx" ${c ? "" : "disabled"}></label>
          <input type="hidden" id="tcDefSection" value="">
          <button class="btn btn-primary" type="button" id="tcPreview" ${c ? "" : "disabled"}>預覽（還不會寫入）</button>
        </div>
        <div id="tcPreviewOut"></div>
      </section>
      ${c ? `
      <section class="panel">
        <div class="section-h"><h3 class="tc-h"><span class="tc-no">4</span>學生名單</h3><div class="row"><button class="btn" type="button" id="tcRosterCsv">⬇ 匯出名單 CSV</button></div></div>
        <div id="tcRoster" class="scrollx"><p class="tc-hint">載入中…</p></div>
      </section>
      <details class="panel tc-fold">
        <summary><h3 class="tc-h">卡牌遊戲開放的主題</h3><small>不勾＝照全站的開放規則</small></summary>
        <p class="tc-hint">勾選後，這門課的學生在卡牌遊戲只會看到這些主題和難度；全部不勾＝照全站的開放規則。<b>勾了就自動儲存。</b>這裡列的是「教材管理」已發佈的主題；上鎖的主題要先到教材管理開放，學生才玩得到。</p>
        <div class="tc-acts">${topics(c).map(t => {
          const a = c.activities.find(x => x.game === "pecha_kucha" && x.topic_id === t.id);
          return `<div class="tc-act ${t.locked || t.gone ? "off" : ""}" data-topic="${esc(t.id)}"><div><b>SDG ${esc(window.topicCode ? window.topicCode(t.id) : t.id)}</b> ${esc(t.en)}<small>${esc(t.zh)}</small>
              ${t.locked ? `<small class="tc-lock">🔒 已上鎖：先到教材管理開放，學生才玩得到</small>` : ""}${t.gone ? `<small class="tc-lock">${esc(t.gone)}：學生看不到。不需要的話把勾拿掉。</small>` : ""}</div>
            <div class="tc-lv">${t.levels.map(l => `<label><input type="checkbox" value="${esc(l)}" ${a && a.levels.includes(l) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div></div>`;
        }).join("")}</div>
        <div class="tc-row"><button class="btn" type="button" id="tcSaveActs">立即儲存</button><span id="tcActsMsg" class="tc-msg" role="status"></span></div>
      </details>
      <details class="panel tc-fold" id="tcChipsPanel">
        <summary><h3 class="tc-h">籌碼</h3><small>學生的籌碼、等你確認的局、手動加減</small></summary>
        <p class="tc-hint">學生玩遊戲會拿到籌碼（每人每天最多 <span id="tcChipCap">60</span> 個）。系統覺得不太對勁的局，籌碼會先等你確認；你也可以手動加減，並寫下理由。</p>
        <div id="tcChips"><p class="tc-hint">載入中…</p></div>
      </details>` : ""}`;
    $("tcReload").onclick = () => load();
    if ($("tcCourse")) $("tcCourse").onchange = async e => { await flushActs(); current = courses.find(x => x.id === Number(e.target.value)) || null; render(); if (current) loadRoster(); };
    $("tcNew").onclick = () => { fillForm(null); $("tcForm").hidden = false; $("tcTerm").focus(); };
    if ($("tcEdit")) $("tcEdit").onclick = e => { e.preventDefault(); fillForm(c); $("tcForm").hidden = false; $("tcName").focus(); };
    if ($("tcCancel")) $("tcCancel").onclick = () => { $("tcForm").hidden = true; };
    $("tcForm").onsubmit = saveCourse;
    if (c) {
      $("tcSaveActs").onclick = () => flushActs(true);
      document.querySelectorAll("#coursesModule .tc-lv input").forEach(i => i.onchange = () => {
        $("tcActsMsg").textContent = "儲存中…"; $("tcActsMsg").className = "tc-msg";
        clearTimeout(actsTimer); actsTimer = setTimeout(() => flushActs(true), 500);
      });
      $("tcPreview").onclick = doPreview;
      $("tcRosterCsv").onclick = rosterCsv;
      if (kept[c.id]) renderKept();
    }
  }

  function fillForm(c) {
    $("tcFormTitle").textContent = c ? "編輯課程" : "新增課程"; $("tcFormMsg").textContent = "";
    $("tcId").value = c ? c.id : ""; $("tcTerm").value = c ? c.term : ""; $("tcCode").value = c ? c.code : ""; $("tcName").value = c ? c.name : "";
    $("tcSections").value = ""; $("tcActive").checked = c ? c.active : true;
  }
  async function saveCourse(e) {
    e.preventDefault();
    try {
      await flushActs();
      const out = await api.teacher.saveCourse({
        id: Number($("tcId").value) || null, term: $("tcTerm").value, code: $("tcCode").value, name: $("tcName").value,
        sections: $("tcSections").value.split(/[,，、]/).map(s => s.trim()).filter(Boolean), active: $("tcActive").checked,
      });
      toast("課程已儲存。"); await load(out.course.id);
    } catch (err) { $("tcFormMsg").textContent = err.message; toast(err.message); }
  }
  // Ticks are saved by themselves half a second after the last one; anything that would redraw the
  // list (another course, ↻, saving the course) saves what is pending first, so a tick is never lost.
  let actsTimer = null;
  async function flushActs(force) {
    const pending = !!actsTimer; clearTimeout(actsTimer); actsTimer = null;
    if ((pending || force) && current && $("tcSaveActs")) await saveActs();
  }
  async function saveActs() {
    const activities = [...document.querySelectorAll("#coursesModule .tc-act")].map(row => ({ game: "pecha_kucha", topic_id: row.dataset.topic, levels: [...row.querySelectorAll("input:checked")].map(i => i.value) })).filter(a => a.levels.length);
    const msg = $("tcActsMsg");
    try {
      await api.teacher.saveActivities(current.id, activities);
      if (msg) { msg.textContent = activities.length ? `已儲存 ${nowHM()}：開放 ${activities.map(a => `${a.topic_id}（${a.levels.join("、")}）`).join("、")}。` : `已儲存 ${nowHM()}：這門課照全站的開放規則。`; msg.className = "tc-msg good"; }
      const data = await api.teacher.courses(); courses = data.courses; current = courses.find(c => c.id === current.id) || current;
    } catch (err) { if (msg) { msg.textContent = "沒有存到：" + err.message; msg.className = "tc-msg bad"; } }
  }

  // ── roster import ──
  async function doPreview() {
    const file = $("tcFile").files[0] || null, text = $("tcText").value;
    if (!file && !text.trim()) { toast("先貼上名單或選一個檔案。"); return; }
    $("tcPreviewOut").innerHTML = `<p class="tc-hint">讀取中…</p>`;
    try {
      preview = await api.teacher.rosterPreview({ courseId: current.id, defaultSection: $("tcDefSection").value, text: file ? "" : text, file });
      renderPreview();
    } catch (err) { $("tcPreviewOut").innerHTML = `<p class="tc-msg bad">${esc(err.message)}</p>${keptHtml()}`; wireKept(); }
  }
  function renderPreview() {
    const p = preview, n = p.counts;
    const will = (n.new || 0) + (n.enroll || 0) + (n.reactivate || 0) + (n.move || 0) + (n.update || 0);
    const summary = Object.entries(ACTION).filter(([k]) => n[k]).map(([k, [label, cls]]) => `<span class="tc-badge ${cls}">${label} ${Number(n[k])}</span>`).join(" ");
    $("tcPreviewOut").innerHTML = `
      <div class="tc-row">${summary}</div>
      <div class="scrollx"><table class="part-table tc-table"><thead><tr><th>列</th><th>系級</th><th>學號</th><th>姓名</th><th>登入帳號（email）</th><th>會怎麼做</th><th>說明</th></tr></thead><tbody>
        ${p.rows.map((r, i) => `<tr class="${ACTION[r.action]?.[1] || ""}"><td>${esc(r.line)}</td><td>${esc(r.section)}</td><td>${esc(r.student_no)}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td>
          <td><span class="tc-badge ${ACTION[r.action]?.[1] || ""}">${ACTION[r.action]?.[0] || esc(r.action)}</span></td>
          <td>${esc((r.notes || []).join("；"))}${r.action === "conflict" && /姓名/.test((r.notes || []).join("")) ? `<br><label class="check"><input type="checkbox" data-force="${i}"> 是同一人，以名單為準</label>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      ${p.missing.length ? `<div class="tc-warnbox"><b>目前在這門課、但這份名單上沒有的學生（${p.missing.length} 位）：</b> ${p.missing.map(m => `${esc(m.student_no || "")} ${esc(m.name)}`).join("、")}
        <br><label class="check"><input type="checkbox" id="tcDrop"> 把他們標為退選（帳號和紀錄都會保留）</label></div>` : ""}
      <div class="tc-row">
        <label class="check"><input type="checkbox" id="tcMail"> 同時把帳號和初始密碼寄到學生信箱</label>
        <button class="btn btn-primary" type="button" id="tcCommit" ${will || p.missing.length || (n.conflict || 0) ? "" : "disabled"}>確認匯入</button>
        <span class="tc-hint">錯誤和衝突的列會跳過，其他列照「會怎麼做」執行。</span>
      </div>${keptHtml()}`;
    $("tcCommit").onclick = doCommit; wireKept();
  }
  async function doCommit() {
    const rows = preview.rows.map(r => ({ line: r.line, section: r.section, student_no: r.student_no, name: r.name, email: r.email, force: false }));
    document.querySelectorAll("[data-force]").forEach(b => { if (b.checked) rows[Number(b.dataset.force)].force = true; });
    // The rows that will be skipped, by line and reason, so the result can name them.
    const skipped = preview.rows.filter((r, i) => r.action === "error" || (r.action === "conflict" && !rows[i].force)).map(r => `第 ${r.line} 列${r.name ? " " + r.name : ""}（${(r.notes || []).join("；") || "有問題"}）`);
    const btn = $("tcCommit"); btn.disabled = true; btn.textContent = "匯入中…";
    try {
      const out = await api.teacher.rosterCommit({ course_id: current.id, rows, default_section: $("tcDefSection").value, mark_missing_dropped: !!$("tcDrop")?.checked, send_email: !!$("tcMail")?.checked, filename: preview.filename || "pasted" });
      renderResult(out, skipped);
      await refreshCourses();
      loadRoster();
    } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = "確認匯入"; }
  }
  function csvDownload(name, header, rows) {
    const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const blob = new Blob(["﻿" + [header, ...rows].map(r => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`已下載 ${name}。`);
  }
  function renderResult(out, skipped) {
    const n = out.counts, k = kept[current.id] || (kept[current.id] = { rows: [], line: "", mail: "", skipped: "", downloaded: true });
    // A second import before the first sheet was put away adds to it; a new password for the same account replaces the old row.
    for (const s of out.account_sheet) { k.rows = k.rows.filter(x => x.email !== s.email); k.rows.push(s); k.downloaded = false; }
    k.line = `匯入完成：新增帳號 ${Number(n.new)}、加入課程 ${Number(n.enroll)}、恢復 ${Number(n.reactivate)}、系級更新 ${Number(n.move)}、更新 ${Number(n.update)}、沒有變動 ${Number(n.same)}、退選 ${Number(n.dropped)}；跳過 ${Number(n.error) + Number(n.conflict)} 列。`;
    k.skipped = skipped.length ? "跳過的列：" + skipped.join("、") + "。改好名單後可以整份再匯入一次，不會重複。" : "";
    k.mail = out.emails.requested ? `寄信：成功 ${Number(out.emails.sent)} 封${out.emails.failed.length ? `，失敗 ${out.emails.failed.length} 封（${out.emails.failed[0].reason}）。失敗的同學請用下面的帳號單發給他。` : "。"}` : "";
    k.mailBad = !!(out.emails.requested && out.emails.failed.length);
    k.fresh = true;
    // Rows were skipped: the pasted text stays so it can be corrected and imported again.
    if (!skipped.length) { $("tcText").value = ""; $("tcFile").value = ""; }
    preview = null;
    renderKept();
  }
  // The result of the last import and the account sheet. It lives in `kept`, not only on the screen.
  function keptHtml() {
    const k = current && kept[current.id]; if (!k) return "";
    return `<div id="tcKept">
      ${k.line ? `<p class="tc-msg good">${esc(k.line)}</p>` : ""}${k.skipped ? `<p class="tc-msg bad">${esc(k.skipped)}</p>` : ""}${k.mail ? `<p class="tc-msg ${k.mailBad ? "bad" : "good"}">${esc(k.mail)}</p>` : ""}
      ${k.rows.length ? `
        <div class="tc-warnbox"><b>帳號單：系統只保存加密後的密碼，離開或重新載入這一頁就查不到了。</b> 請現在下載，並且不要放進公開的地方。學生第一次登入時會被要求換成自己的密碼。${k.downloaded ? "<br>✓ 已下載過。" : ""}
          <br><button class="btn btn-primary" type="button" id="tcSheetCsv">⬇ 下載帳號單 CSV（${k.rows.length} 位）</button>
          <button class="btn" type="button" id="tcSheetHide">${k.downloaded ? "收起帳號單" : "不下載，直接收起"}</button></div>
        <div class="scrollx"><table class="part-table tc-table"><thead><tr><th>系級</th><th>學號</th><th>姓名</th><th>帳號</th><th>初始密碼</th></tr></thead><tbody>
          ${k.rows.map(s => `<tr><td>${esc(s.section)}</td><td>${esc(s.student_no)}</td><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td><code>${esc(s.password)}</code></td></tr>`).join("")}
        </tbody></table></div>` : (k.fresh ? `<p class="tc-hint">這次沒有新帳號，所以沒有帳號單。</p>` : "")}</div>`;
  }
  function wireKept() {
    const k = current && kept[current.id]; if (!k) return;
    if ($("tcSheetCsv")) $("tcSheetCsv").onclick = () => { csvDownload(`accounts-${current.code}-${new Date().toISOString().slice(0, 10)}.csv`, ["系級", "學號", "姓名", "帳號", "初始密碼"], k.rows.map(s => [s.section, s.student_no, s.name, s.email, s.password])); k.downloaded = true; renderKept(); };
    if ($("tcSheetHide")) $("tcSheetHide").onclick = e => {
      // Putting away a sheet that was never downloaded takes two clicks: the passwords cannot be shown again.
      if (!k.downloaded && !e.currentTarget.dataset.sure) { e.currentTarget.dataset.sure = "1"; e.currentTarget.textContent = "還沒下載。再按一次就收起（之後只能一位一位重設密碼）"; return; }
      delete kept[current.id]; const box = $("tcKept"); if (box) box.remove();
    };
  }
  function renderKept() { if (!$("tcPreviewOut")) return; $("tcPreviewOut").innerHTML = keptHtml(); wireKept(); }
  addEventListener("beforeunload", e => { if (Object.values(kept).some(k => k.rows.length && !k.downloaded)) { e.preventDefault(); e.returnValue = ""; } });

  // ── student list ──
  let roster = [];
  async function loadRoster() {
    if (!current || !$("tcRoster")) return;
    try {
      roster = (await api.teacher.courseRoster(current.id)).students;
      $("tcRoster").innerHTML = roster.length ? `<table class="part-table tc-table"><thead><tr><th>系級</th><th>學號</th><th>姓名</th><th>帳號</th><th>研究代碼</th><th>狀態</th><th title="勾起來的人玩的局會保留，但不進班級統計、題目難度和研究匯出">測試帳號</th><th></th></tr></thead><tbody>
        ${roster.map(s => `<tr class="${s.status === "active" ? "" : "mute"} ${s.test ? "tc-testrow" : ""}"><td>${esc(s.section)}</td><td>${esc(s.student_no || "")}</td><td>${esc(s.name)}${s.test ? ` <span class="tc-badge mute">測試</span>` : ""}</td><td>${esc(s.email)}</td><td><code>${esc(s.public_id || "")}</code></td>
          <td>${s.status === "active" ? (s.must_change_password ? `<span class="tc-badge info">還沒登入改密碼</span>` : `<span class="tc-badge good">已啟用</span>`) : `<span class="tc-badge mute">退選</span>`}
            ${resetShown[s.user_id] ? `<br><small class="tc-newpw">新的初始密碼 <code>${esc(resetShown[s.user_id])}</code>（只在這一頁顯示）</small>` : ""}</td>
          <td class="nw"><label class="check tc-test" title="${s.test_fixed ? "老師和管理員的帳號一定是測試帳號" : "勾起來：這個人玩的局不進班級統計"}"><input type="checkbox" data-test="${Number(s.user_id)}" data-name="${esc(s.name)}" ${s.test ? "checked" : ""} ${s.test_fixed ? "disabled" : ""}> ${s.test_fixed ? "老師" : "不計"}</label></td>
          <td class="tc-actions"><button class="btn" type="button" data-reset="${Number(s.user_id)}">重設密碼</button>
            <button class="btn" type="button" data-enr="${Number(s.enrollment_id)}" data-to="${s.status === "active" ? "dropped" : "active"}" data-name="${esc(s.name)}">${s.status === "active" ? "標為退選" : "恢復"}</button></td></tr>`).join("")}
      </tbody></table>` : `<p class="tc-hint">這門課還沒有學生。用上面的「匯入名單」加入。</p>`;
      document.querySelectorAll("#tcRoster [data-reset]").forEach(b => b.onclick = () => resetPw(Number(b.dataset.reset), b));
      document.querySelectorAll("#tcRoster [data-test]").forEach(c => c.onchange = async () => {
        c.disabled = true;
        try { await api.teacher.setTestAccount(Number(c.dataset.test), c.checked);
          toast(c.checked ? `${c.dataset.name} 標成測試帳號：之後和之前玩的局都不進班級統計（紀錄保留）。` : `${c.dataset.name} 不再是測試帳號：他玩的局會計入班級統計。`);
          loadRoster(); }
        catch (e) { c.checked = !c.checked; c.disabled = false; toast(e.message || "沒有存成功，請再試一次。"); }
      });
      document.querySelectorAll("#tcRoster [data-enr]").forEach(b => b.onclick = () => setEnrollment(b.dataset.enr, b.dataset.to, b.dataset.name, true));
    } catch (e) { $("tcRoster").innerHTML = `<p class="tc-msg bad">${esc(e.message)}</p>`; }
    loadChips();
  }

  // ── chips: what waits for the teacher, every student's balance, add or take away with a reason ──
  const CHIP_REASON = { "pk.score": "聽懂分數", "pk.finish": "玩完整局", "pk.remedy": "補救配對", "pk.quiz": "小測", "pk.read": "朗讀", "pk.reflect": "反思",
    "spaced.return": "隔幾天回來玩", "harbor.stars": "3D 遊戲的星星", "sdg4.formal": "正式發表", "sdg4.read": "SDG 4 念對的字", "teacher.grant": "老師加的", "teacher.deduct": "老師扣的" };
  let chipOpen = null;                                  // user id whose "add or take away" row is open
  async function loadChips() {
    const box = $("tcChips"); if (!current || !box) return;
    const mine = current.id;
    try {
      const d = await api.teacher.chips(mine);
      if (!current || current.id !== mine || !$("tcChips")) return;        // the teacher moved on meanwhile
      if ($("tcChipCap")) $("tcChipCap").textContent = Number(d.daily_cap) || 60;
      // What waits is shown one line per student and run (a run pays several kinds of chips at once).
      const groups = new Map();
      d.held.forEach(h => { const k = h.user_id + ":" + (h.run_id ?? "x" + h.id); const g = groups.get(k) || { ...h, ids: [], total: 0, why: [] }; g.ids.push(h.id); g.total += Number(h.delta) || 0; g.why.push(CHIP_REASON[h.reason] || h.reason); groups.set(k, g); });
      const held = [...groups.values()];
      const students = [...d.students].sort((a, b) => String(a.class_name || "").localeCompare(String(b.class_name || ""), "zh-Hant") || String(a.student_no || "").localeCompare(String(b.student_no || "")));
      box.innerHTML = `
        ${held.length ? `<div class="tc-held"><b>等你確認的籌碼（${held.length} 筆）</b>
          <p class="tc-hint">這些局被系統標了記號（例如「反應極快又幾乎全對」或「同一句很快連錯好幾次，像是用試的」）。到「學習紀錄」點這位學生可以看那一局的每一步；確認沒問題就按「入帳」。</p>
          <table class="part-table tc-table"><thead><tr><th>系級</th><th>學生</th><th>籌碼</th><th>來自</th><th>時間</th><th></th></tr></thead><tbody>
          ${held.map((g, i) => `<tr><td>${esc(g.class_name || "")}</td><td>${esc(g.name)}<br><small>${esc(g.student_no || "")}</small></td><td><b>+${Number(g.total)}</b></td><td>${esc([...new Set(g.why)].join("、"))}</td><td>${esc(String(g.created_at || "").slice(0, 16).replace("T", " "))}</td>
            <td class="tc-actions"><button class="btn primary" type="button" data-chip-post="${i}">入帳</button> <button class="btn" type="button" data-chip-void="${i}">不入帳</button></td></tr>`).join("")}
          </tbody></table></div>` : `<p class="tc-msg good">沒有等你確認的籌碼。</p>`}
        ${students.length ? `<table class="part-table tc-table"><thead><tr><th>系級</th><th>學號</th><th>姓名</th><th>籌碼</th><th>等確認</th><th></th></tr></thead><tbody>
          ${students.map(st => `<tr><td>${esc(st.class_name || "")}</td><td>${esc(st.student_no || "")}</td><td>${esc(st.name)}</td><td><b>${Number(st.balance) || 0}</b></td><td>${Number(st.held) ? "+" + Number(st.held) : ""}</td>
            <td class="tc-actions">${chipOpen === st.user_id
              ? `<form class="tc-chipform" data-chip-form="${Number(st.user_id)}"><input type="number" name="delta" min="-1000" max="1000" step="1" placeholder="+5 或 -5" required aria-label="加減幾個"> <input type="text" name="note" maxlength="300" placeholder="理由（必填），例如：課堂發表" required aria-label="理由"> <button class="btn primary" type="submit">確定</button> <button class="btn" type="button" data-chip-cancel>取消</button> <span class="tc-msg" data-chip-msg></span></form>`
              : `<button class="btn" type="button" data-chip-adjust="${Number(st.user_id)}">加減籌碼</button>`}</td></tr>`).join("")}
          </tbody></table><p class="tc-hint">全班合計 ${Number(d.class_total) || 0} 個。</p>` : `<p class="tc-hint">這門課還沒有學生。</p>`}`;
      const settle = async (g, action) => {
        try { for (const id of g.ids) await api.teacher.resolveChips(id, action, ""); toast(action === "post" ? `已入帳：${g.name} +${g.total}` : `已標為不入帳：${g.name}`); }
        catch (e) { toast(e.message); }
        loadChips();
      };
      box.querySelectorAll("[data-chip-post]").forEach(b => b.onclick = () => { b.disabled = true; settle(held[Number(b.dataset.chipPost)], "post"); });
      box.querySelectorAll("[data-chip-void]").forEach(b => b.onclick = () => {
        if (b.dataset.sure) { b.disabled = true; settle(held[Number(b.dataset.chipVoid)], "void"); return; }
        b.dataset.sure = "1"; b.textContent = "再按一次：確定不入帳"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = "不入帳"; } }, 4000);
      });
      box.querySelectorAll("[data-chip-adjust]").forEach(b => b.onclick = () => { chipOpen = Number(b.dataset.chipAdjust); loadChips(); });
      box.querySelectorAll("[data-chip-cancel]").forEach(b => b.onclick = () => { chipOpen = null; loadChips(); });
      box.querySelectorAll("[data-chip-form]").forEach(f => {
        f.querySelector('[name="delta"]').focus();
        f.onsubmit = async e => {
          e.preventDefault();
          const delta = Math.trunc(Number(f.delta.value)), note = f.note.value.trim(), msg = f.querySelector("[data-chip-msg]");
          if (!delta || Math.abs(delta) > 1000) { msg.textContent = "請填 1–1000 的數字，要扣就填負數。"; msg.className = "tc-msg bad"; return; }
          if (!note) { msg.textContent = "請寫理由。"; msg.className = "tc-msg bad"; return; }
          try { const out = await api.teacher.adjustChips(Number(f.dataset.chipForm), delta, note); chipOpen = null; toast(`已${delta > 0 ? "加" : "扣"} ${Math.abs(delta)} 個，現在有 ${Number(out.balance)} 個`); loadChips(); }
          catch (err) { msg.textContent = err.message; msg.className = "tc-msg bad"; }
        };
      });
    } catch (e) { if ($("tcChips")) $("tcChips").innerHTML = `<p class="tc-msg bad">${esc(e.message)}</p>`; }
  }
  async function setEnrollment(id, to, name, offerUndo) {
    try {
      await api.teacher.patchEnrollment(id, { status: to });
      await refreshCourses(); await loadRoster();
      toast(to === "dropped" ? `${name} 已標為退選。帳號和紀錄都保留。` : `${name} 已恢復修課。`, offerUndo ? () => setEnrollment(id, to === "dropped" ? "active" : "dropped", name, false) : null);
    } catch (e) { toast(e.message); }
  }
  // No browser pop-ups: the first press asks on the button itself, the second one does it, and the
  // new password stays in the student's row (and in the account sheet) until the page is left.
  async function resetPw(userId, btn) {
    const s = roster.find(x => x.user_id === userId);
    if (!btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = "再按一次：舊密碼會失效"; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = "重設密碼"; } }, 5000); return; }
    btn.disabled = true;
    try {
      const out = await api.teacher.resetPassword(userId);
      resetShown[userId] = out.password;
      const k = kept[current.id] || (kept[current.id] = { rows: [], line: "", mail: "", skipped: "", downloaded: true });
      if (s) { k.rows = k.rows.filter(x => x.email !== s.email); k.rows.push({ section: s.section, student_no: s.student_no, name: s.name, email: s.email, password: out.password }); k.downloaded = false; }
      await loadRoster(); renderKept();
      toast(`${out.name} 的新初始密碼已產生，寫在名單那一列，也加進上面的帳號單。`);
    } catch (e) { toast(e.message); btn.disabled = false; }
  }
  function rosterCsv() {
    if (!roster.length) { toast("沒有學生可以匯出。"); return; }
    csvDownload(`roster-${current.code}.csv`, ["系級", "學號", "姓名", "帳號", "研究代碼", "狀態"], roster.map(s => [s.section, s.student_no, s.name, s.email, s.public_id, s.status === "active" ? "修課中" : "退選"]));
  }

  window.loadCourses = () => load();
})();
