// Teacher dashboard → 教材管理: the material the games show, edited in place.
//   left    the tree: game → topic → level (search on top, "＋ 新增主題" under each game,
//           deleted topics and the games that cannot be edited here yet at the bottom)
//   right   the topic: names, state (draft / published version), checks, then the chosen level as a
//           list of slides by part with the editor of one slide beside it
// How it behaves (docs/research/文獻回顧.md, "教材編輯工具"):
//   - every change is saved by itself as a DRAFT; students see nothing until 發佈
//   - checks appear after leaving a field, next to the field; nothing nags while typing
//   - deleting never asks "are you sure": it happens and 復原 undoes it — in the message at the
//     bottom for a few seconds, and as「復原上一步」in the bar on top for as long as the topic is open
//   - the state of the topic, 預覽 and 發佈 stay in view while editing (the bar on top is sticky)
//   - a slide's titles are the same at every level, so they are typed once and kept in step
//   - the same five actions in the same order on every node: 新增 · 複製 · 匯入 · 匯出 · 刪除
// Backend: backend/content_library.py.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const head = () => ({ Authorization: "Bearer " + auth.getToken() });
  async function call(method, path, body, form) {
    const r = await fetch(API() + path, { method, headers: form ? head() : { ...head(), "Content-Type": "application/json" }, body: form || (body ? JSON.stringify(body) : undefined) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const d = data.detail; const e = new Error(typeof d === "string" ? d : (d && d.message) || "沒有成功，請再試一次。"); e.errors = d && d.errors; throw e; }
    return data;
  }
  const PART = { 20: ["開場", "問題", "成果", "解方", "影響", "結論"], 12: ["開場", "問題", "解釋", "影響", "策略", "結論"] };
  const partName = (n, total) => (PART[total] || PART[20])[n - 1] || "";

  const S = { tree: null, game: "pecha_kucha", topic: null, level: null, slide: 1, data: null, doc: null, filter: "", saving: false, dirty: false, savedAt: "", timer: null, undo: [], undoTopic: null, mode: "topic", wps: {}, sizes: {} };

  // The message bar is the one all three teacher modules share (teacher-courses.js); `undo` adds 復原.
  const toast = (text, undo) => window.teacherToast(text, undo);

  async function load(keep) {
    try {
      S.tree = await call("GET", "/teacher/library");
      S.wps = S.tree.words_per_second; S.sizes = S.tree.part_sizes;
      shell();
      const topics = S.tree.games[0].topics.filter(t => !t.archived);
      const want = keep || S.topic;
      if (want && S.tree.games[0].topics.some(t => t.topic_id === want)) await openTopic(want, S.level);
      else if (topics.length) await openTopic(topics[0].topic_id);
    } catch (e) { $("tlBody").innerHTML = `<section class="panel"><p class="tl-msg bad">${esc(e.message)}</p></section>`; }
  }

  function shell() {
    $("tlBody").innerHTML = `
      <section class="panel tl-top"><div class="section-h"><h2>教材管理</h2><div class="row"><button class="btn" type="button" id="tlReload">↻ 重新整理</button></div></div></section>
      <div class="tl-wrap">
        <aside class="panel tl-tree" aria-label="教材樹">
          <input id="tlSearch" type="search" placeholder="找主題：9-1、SDG 13 或名稱" value="${esc(S.filter)}" aria-label="找主題">
          <div id="tlTree"></div>
        </aside>
        <div class="tl-main" id="tlMain"><section class="panel"><p class="tl-hint">從左邊選一個主題。</p></section></div>
      </div>`;
    $("tlSearch").oninput = e => { S.filter = e.target.value.trim(); paintTree(); };
    $("tlReload").onclick = () => leave(() => load());
    // ↑ ↓ walk through the tree; Enter opens (it is a button).
    $("tlTree").onkeydown = e => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const all = [...$("tlTree").querySelectorAll(".tl-node")], i = all.indexOf(e.target.closest(".tl-node"));
      if (i < 0) return; e.preventDefault(); (all[i + (e.key === "ArrowDown" ? 1 : -1)] || all[i]).focus();
    };
    paintTree();
  }

  function paintTree() {
    // "SDG 13", "sdg13", "13-1", part of the English or the Chinese name all find a topic.
    const norm = v => String(v || "").toLowerCase().replace(/[\s\-_.．]/g, "");
    const g = S.tree.games[0], f = norm(S.filter);
    const match = t => !f || norm(`sdg${t.topic_id} sdg${t.sdg} ${t.topic_id} ${t.title_en} ${t.title_zh}`).includes(f);
    const live = g.topics.filter(t => !t.archived && match(t)), gone = g.topics.filter(t => t.archived);
    const row = t => `
      <li class="${t.topic_id === S.topic ? "open" : ""}">
        <button type="button" class="tl-node ${t.topic_id === S.topic && S.mode !== "new" ? "on" : ""}" data-topic="${esc(t.topic_id)}" title="${esc(t.title_zh || "")}">
          <b>${esc(t.topic_id)}</b><span>${esc(t.title_en || "（還沒有名稱）")}</span>
          <i>${t.published ? "v" + t.version : "未發佈"}${t.has_draft ? ' <em class="draft">草稿</em>' : ""}${t.locked ? ' <em class="lock">上鎖</em>' : ""}${t.errors ? ` <em class="err">${t.errors} 個問題</em>` : ""}</i>
        </button>
        ${t.topic_id === S.topic && S.doc ? `<ul>${Object.keys(S.doc.levels).map(l => `<li><button type="button" class="tl-node sub ${l === S.level ? "on" : ""}" data-level="${l}"><b>${l}</b><span>${S.doc.levels[l].length} 張投影片</span></button></li>`).join("")}</ul>` : ""}
      </li>`;
    $("tlTree").innerHTML = `
      <p class="tl-group">${esc(g.name)}</p>
      <ul class="tl-list">${live.map(row).join("") || `<li class="tl-hint">沒有符合的主題。</li>`}</ul>
      <button type="button" class="btn tl-add" id="tlNew">＋ 新增主題</button>
      ${gone.length ? `<p class="tl-group">已刪除（可以復原）</p><ul class="tl-list">${gone.map(t => `<li class="tl-gone"><span><b>${esc(t.topic_id)}</b> ${esc(t.title_en)}</span><button type="button" class="btn" data-restore="${esc(t.topic_id)}">復原</button></li>`).join("")}</ul>` : ""}
      <p class="tl-group">還不能在這裡編輯</p>
      <ul class="tl-list tl-na">${S.tree.not_editable.map(x => `<li><b>${esc(x.name)}</b><small>${esc(x.why)}</small></li>`).join("")}</ul>`;
    document.querySelectorAll("#tlTree [data-topic]").forEach(b => b.onclick = () => leave(() => openTopic(b.dataset.topic)));
    document.querySelectorAll("#tlTree [data-level]").forEach(b => b.onclick = () => { S.level = b.dataset.level; S.slide = 1; paintTree(); paintMain(); });
    document.querySelectorAll("#tlTree [data-restore]").forEach(b => b.onclick = async () => { try { await call("POST", `/teacher/library/${S.game}/${b.dataset.restore}/unarchive`); await load(b.dataset.restore); toast(`主題 ${b.dataset.restore} 已復原，回到主題清單了。`); } catch (e) { toast(e.message); } });
    $("tlNew").onclick = () => leave(() => { S.mode = "new"; paintTree(); paintNew(); });
  }

  // Save what is pending before going somewhere else.
  async function leave(next) { if (S.dirty) await saveNow(); S.mode = "topic"; await next(); }

  // Each open gets a number: an answer for a topic the teacher has already left is thrown away.
  let opening = 0;
  async function openTopic(id, level) {
    const my = ++opening;
    S.topic = id; S.mode = "topic";
    const data = await call("GET", `/teacher/library/${S.game}/${id}`);
    if (my !== opening) return;
    S.data = data;
    S.doc = JSON.parse(JSON.stringify(S.data.doc));
    const levels = Object.keys(S.doc.levels);
    S.level = levels.includes(level) ? level : (levels.includes("A2") ? "A2" : levels[0]) || null;
    S.slide = 1; S.dirty = false; S.savedAt = "";
    if (S.undoTopic !== id) { S.undo = []; S.undoTopic = id; }      // 復原上一步 belongs to the topic that is open
    paintTree(); paintMain();
  }

  // ── saving the draft ──
  function touch() { S.dirty = true; paintState(); clearTimeout(S.timer); S.timer = setTimeout(saveNow, 900); }
  async function saveNow() {
    clearTimeout(S.timer);
    if (!S.dirty || S.saving || !S.topic) return;
    S.saving = true; S.dirty = false; paintState();
    const id = S.topic;
    try {
      const out = await call("PUT", `/teacher/library/${S.game}/${id}/draft`, { doc: S.doc });
      if (S.topic !== id) return;
      S.data.errors = out.errors; S.data.warnings = out.warnings; S.data.changes_data = out.changes_data; S.data.summary.has_draft = out.has_draft;
      S.savedAt = String(out.saved_at).slice(11, 16);
      const t = S.tree.games[0].topics.find(x => x.topic_id === id);
      if (t) { t.has_draft = out.has_draft; t.errors = out.errors.length; t.title_en = S.doc.title_en; t.title_zh = S.doc.title_zh; t.levels = Object.fromEntries(Object.entries(S.doc.levels).map(([l, s]) => [l, s.length])); }
      paintTree(); paintState(); paintChecks(); paintList(); paintFieldMsgs();
    } catch (e) { S.dirty = true; toast("草稿沒有存到：" + e.message); }
    finally { S.saving = false; if (S.dirty) S.timer = setTimeout(saveNow, 1500); else paintState(); }
  }
  // A structural change (delete, add, move, import, discard): the document before it is remembered,
  // so 復原 can put it back — from the message at the bottom, or later from「復原上一步」on top.
  const snapshot = text => ({ text, before: JSON.stringify(S.doc), lv: S.level, sl: S.slide });
  function remember(entry) { S.undo.push(entry); if (S.undo.length > 30) S.undo.shift(); paintState(); }
  function undoEntry(entry) {
    const i = S.undo.indexOf(entry); if (i < 0) return;
    S.undo.splice(i);                                        // this step and everything done after it
    S.doc = JSON.parse(entry.before);
    S.level = S.doc.levels[entry.lv] ? entry.lv : Object.keys(S.doc.levels)[0] || null; S.slide = entry.sl;
    touch(); paintTree(); paintMain();
    toast("已復原：" + entry.text);
  }
  function withUndo(text, change) {
    const entry = snapshot(text);
    change();
    S.undo.push(entry); if (S.undo.length > 30) S.undo.shift();
    touch(); paintTree(); paintMain();
    toast(text, () => undoEntry(entry));
  }
  // Levels whose scripts are word for word the same: one was copied from the other and still has to be rewritten.
  function copiedLevels() {
    const ls = Object.keys(S.doc.levels), out = [];
    for (let i = 0; i < ls.length; i++) for (let j = 0; j < i; j++) {
      const a = S.doc.levels[ls[i]], b = S.doc.levels[ls[j]];
      const same = a.filter(x => x.script && x.script.trim() && (b.find(y => y.no === x.no) || {}).script === x.script).length;
      if (same >= Math.max(3, Math.ceil(a.length / 2))) out.push({ a: ls[i], b: ls[j], same });
    }
    return out;
  }

  const issuesAt = (level, no, field) => [...S.data.errors.map(e => ({ ...e, kind: "bad" })), ...S.data.warnings.map(e => ({ ...e, kind: "warn" }))]
    .filter(e => (level === undefined || e.level === level) && (no === undefined || e.no === no) && (field === undefined || e.field === field));
  const seconds = (script, level) => (String(script || "").trim() ? String(script).trim().split(/\s+/).length / (S.wps[level] || 1.8) : 0);

  // ── right side ──
  function paintMain() {
    const sum = S.data.summary, d = S.doc, levels = Object.keys(d.levels);
    $("tlMain").innerHTML = `
      <div class="tl-state" id="tlState"></div>
      <section class="panel">
        <div class="tl-head">
          <span class="tl-code">SDG ${esc(S.topic)}</span>
          <label class="grow">英文名稱<input id="tlTitleEn" value="${esc(d.title_en)}" maxlength="200" placeholder="How to Talk to AI Like a Scientist"></label>
          <label class="grow">中文名稱<input id="tlTitleZh" value="${esc(d.title_zh)}" maxlength="200" placeholder="像科學家一樣與 AI 對話"></label>
        </div>
        <div id="tlChecks"></div>
        <div class="tl-tools">
          <span class="tl-tools-label">這個主題</span>
          <button class="btn" type="button" id="tlCopyTopic">複製成新主題</button>
          <button class="btn" type="button" id="tlImportBtn">匯入（貼上或檔案）</button>
          <button class="btn" type="button" id="tlExport">匯出 Excel</button>
          <button class="btn" type="button" id="tlLock">${sum.locked ? "🔒 已上鎖 · 按這裡開放給學生" : "先上鎖（學生看得到但不能玩）"}</button>
          <button class="btn danger" type="button" id="tlDelTopic">刪除主題</button>
        </div>
        <div id="tlImport" hidden></div>
        <details class="tl-history"><summary>發佈紀錄（${S.data.history.length} 版）</summary>
          ${S.data.history.length ? `<table class="part-table tl-table"><thead><tr><th>版本</th><th>時間</th><th>誰</th><th>說明</th><th></th></tr></thead><tbody>${S.data.history.map((h, i) => `<tr><td>v${h.version}</td><td>${esc(String(h.at).slice(0, 16).replace("T", " "))}</td><td>${esc(h.by_name || "系統")}</td><td>${esc(h.note || "")}</td><td>${i ? `<button class="btn" type="button" data-ver="${h.version}">取回這一版（放進草稿）</button>` : "目前學生看到的"}</td></tr>`).join("")}</tbody></table>` : `<p class="tl-hint">還沒有發佈過。</p>`}
        </details>
      </section>
      <section class="panel">
        <div class="tl-levels" role="tablist" aria-label="難度">
          ${levels.map(l => `<button type="button" role="tab" class="tl-tab ${l === S.level ? "on" : ""}" data-lv="${l}">${l}<small>${d.levels[l].length} 張${issuesAt(l).filter(e => e.kind === "bad").length ? " · ⚠" : ""}</small></button>`).join("")}
          ${S.tree.levels.filter(l => !levels.includes(l)).length ? `<select id="tlAddLevel" aria-label="新增難度"><option value="">＋ 新增難度…</option>${S.tree.levels.filter(l => !levels.includes(l)).map(l => `<option value="${l}">${l}${levels.length ? "（先複製 " + (S.level || levels[0]) + " 的內容）" : ""}</option>`).join("")}</select>` : ""}
          ${S.level ? `<span class="tl-spacer"></span><button class="btn danger" type="button" id="tlDelLevel">刪除 ${esc(S.level)}</button>` : ""}
        </div>
        ${S.level ? `<div class="tl-two"><div id="tlList" class="tl-slides"></div><div id="tlEdit" class="tl-edit"></div></div>` : `<p class="tl-hint">這個主題還沒有難度。用上面的「＋ 新增難度」開始。</p>`}
      </section>`;
    const bind = (id, key) => { const el = $(id); el.oninput = () => { d[key] = el.value; touch(); }; el.onblur = saveNow; };
    bind("tlTitleEn", "title_en"); bind("tlTitleZh", "title_zh");
    document.querySelectorAll("[data-lv]").forEach(b => b.onclick = () => { S.level = b.dataset.lv; S.slide = 1; paintTree(); paintMain(); });
    if ($("tlAddLevel")) $("tlAddLevel").onchange = e => { const l = e.target.value; if (!l) return; const src = d.levels[S.level || levels[0]];
      const from = src ? (S.level || levels[0]) : "";
      withUndo(from ? `已新增 ${l}：內容是從 ${from} 複製來的，請把每一張的講稿改寫成 ${l} 的難度。` : `已新增 ${l}。`, () => { d.levels[l] = src ? JSON.parse(JSON.stringify(src)) : blank(20); S.level = l; S.slide = 1; }); };
    if ($("tlDelLevel")) $("tlDelLevel").onclick = () => { const l = S.level; withUndo(`已刪除 ${l}（${d.levels[l].length} 張）。`, () => { delete d.levels[l]; S.level = Object.keys(d.levels)[0] || null; S.slide = 1; }); };
    $("tlExport").onclick = exportXlsx;
    $("tlImportBtn").onclick = () => paintImport();
    $("tlCopyTopic").onclick = () => leave(() => { S.mode = "new"; paintTree(); paintNew(S.topic); });
    $("tlLock").onclick = async () => { try { const out = await call("POST", `/teacher/library/${S.game}/${S.topic}/lock`, { locked: !sum.locked }); S.data.summary.locked = out.summary.locked; S.tree.games[0].topics.find(t => t.topic_id === S.topic).locked = out.summary.locked; paintTree(); paintMain(); toast(!sum.published ? (out.summary.locked ? "已上鎖。這個主題還沒發佈，學生本來就看不到；發佈後也要先開放才能玩。" : "已解除上鎖。這個主題還沒發佈，發佈後學生才看得到。")
        : out.summary.locked ? "已上鎖：學生看得到這個主題，但不能玩（課程有勾選也一樣）。" : "已開放給學生。"); } catch (e) { toast(e.message); } };
    $("tlDelTopic").onclick = async () => { const id = S.topic; try { await call("POST", `/teacher/library/${S.game}/${id}/archive`); S.topic = null; await load();
      toast(`已刪除主題 ${id}。學生看不到了，學習紀錄都還在。`, async () => { await call("POST", `/teacher/library/${S.game}/${id}/unarchive`); await load(id); }); } catch (e) { toast(e.message); } };
    document.querySelectorAll("[data-ver]").forEach(b => b.onclick = async () => { try { await saveNow(); await call("POST", `/teacher/library/${S.game}/${S.topic}/restore-version`, { version: Number(b.dataset.ver) }); await openTopic(S.topic, S.level); toast(`第 ${b.dataset.ver} 版已放進草稿。確認後按「發佈」才會給學生。`); } catch (e) { toast(e.message); } });
    paintChecks(); paintList(); paintEdit(); paintState();
  }
  const blank = n => (S.sizes[n] || S.sizes[20]).flatMap((count, p) => Array.from({ length: count }, () => ({ part: p + 1, title_en: "", title_zh: "", script: "", purpose: "", keywords: "" }))).map((s, i) => ({ no: i + 1, ...s }));

  const savedText = () => (S.saving ? "儲存草稿中…" : S.dirty ? "有修改，馬上自動儲存…" : S.savedAt ? `草稿已自動儲存 ${S.savedAt}` : "");
  function paintState() {
    const el = $("tlState"); if (!el || !S.data) return;
    const sum = S.data.summary, bad = S.data.errors.length, last = S.undo[S.undo.length - 1];
    const state = !sum.published ? ["draft", "還沒發佈過：學生看不到這個主題。"]
      : sum.has_draft || S.dirty ? ["draft", `有還沒發佈的修改。學生現在看到的是第 ${sum.version} 版。`]
      : ["live", `已發佈第 ${sum.version} 版，學生看到的就是這裡的內容。`];
    el.className = "tl-state " + state[0];
    el.innerHTML = `<div><b>SDG ${esc(S.topic)} · ${state[1]}</b><small>${esc(savedText())}</small>
        ${S.data.changes_data && (sum.has_draft || S.dirty) ? `<small class="note">這次改到了講稿或標題：發佈後會變成第 ${sum.version + 1} 版，新舊版的學習數據會分開統計。</small>` : ""}</div>
      <div class="tl-state-btns">
        ${last ? `<button class="btn" type="button" id="tlUndoLast" title="${esc(last.text)}">↶ 復原上一步</button>` : ""}
        ${S.level ? `<button class="btn" type="button" id="tlPreview" title="用學生的畫面玩玩看這份草稿，不會留下紀錄">▶ 預覽 ${esc(S.level)}</button>` : ""}
        ${sum.published && (sum.has_draft || S.dirty) ? `<button class="btn" type="button" id="tlDiscard">放棄修改</button>` : ""}
        <button class="btn btn-primary" type="button" id="tlPublish" ${sum.has_draft || S.dirty ? "" : "disabled"} title="${bad ? "還有問題要先修好" : ""}">${bad && (sum.has_draft || S.dirty) ? `發佈（還有 ${bad} 個問題）` : "發佈給學生"}</button>
      </div>`;
    const near = $("tlSavedAt");        // the same thing in a few words right under the script box
    if (near) { near.textContent = S.saving ? "儲存中…" : S.dirty ? "有修改…" : S.savedAt ? `✓ 已儲存 ${S.savedAt}` : ""; }
    if ($("tlUndoLast")) $("tlUndoLast").onclick = () => undoEntry(last);
    if ($("tlPreview")) $("tlPreview").onclick = async () => { await saveNow(); window.open(`/pages/pecha_kucha_builder.html?preview=1&topic=${encodeURIComponent(S.topic)}&level=${encodeURIComponent(S.level)}`, "_blank"); };
    if ($("tlDiscard")) $("tlDiscard").onclick = async () => { const entry = snapshot("放棄修改"); clearTimeout(S.timer); S.dirty = false;
      try { await call("POST", `/teacher/library/${S.game}/${S.topic}/discard`); await openTopic(S.topic, S.level); await load(S.topic);
        remember(entry); toast("已放棄修改，回到已發佈的內容。", () => undoEntry(entry)); } catch (e) { toast(e.message); } };
    $("tlPublish").onclick = publish;
  }
  async function publish() {
    await saveNow();
    if (S.data.errors.length) { paintChecks(true); toast(`還有 ${S.data.errors.length} 個問題要先修好，已列在上面。`); return; }
    try {
      const out = await call("POST", `/teacher/library/${S.game}/${S.topic}/publish`, {});
      await load(S.topic);
      toast(out.version_raised ? `已發佈第 ${out.version} 版。之後的學習數據會記在這一版。` : `已發佈（版本維持第 ${out.version} 版，因為講稿和標題沒有變）。`);
    } catch (e) { if (e.errors) { S.data.errors = e.errors; paintChecks(true); } toast(e.message); }
  }
  function paintChecks(open) {
    const el = $("tlChecks"); if (!el) return;
    const bad = S.data.errors, warn = S.data.warnings;
    const copied = copiedLevels().map(c => `<p class="tl-note">⚠ ${esc(c.a)} 有 ${c.same} 張的講稿和 ${esc(c.b)} 一模一樣（複製來的）。發佈前請把 ${esc(c.a)} 改寫成它自己的難度。</p>`).join("");
    if (!bad.length && !warn.length) { el.innerHTML = `<p class="tl-ok">✓ 檢查通過，可以發佈。</p>${copied}`; return; }
    const line = (e, kind) => `<li class="${kind}"><button type="button" data-jl="${esc(e.level || "")}" data-jn="${e.no || ""}" data-jf="${esc(e.field || "")}">${e.level ? esc(e.level) + (e.no ? " 第 " + e.no + " 張" : "") + "：" : ""}${esc(e.message)}</button></li>`;
    // "Longer than 20 seconds" can be true of most slides of a talk: one line per level, not one per slide.
    const long = warn.filter(e => e.field === "script" && /20 秒/.test(e.message)), other = warn.filter(e => !long.includes(e));
    const byLevel = {}; long.forEach(e => (byLevel[e.level] = byLevel[e.level] || []).push(e.no));
    const longLines = Object.entries(byLevel).map(([l, nos]) => `<li class="warn"><button type="button" data-jl="${esc(l)}" data-jn="${nos[0]}" data-jf="script">${esc(l)}：有 ${nos.length} 張的講稿估計超過 20 秒（第 ${nos.slice(0, 8).join("、")}${nos.length > 8 ? "…" : ""} 張）。卡牌遊戲不限時，不影響遊玩；要當成正式 Pecha Kucha 朗讀才需要縮短。</button></li>`).join("");
    const notes = other.length + Object.keys(byLevel).length;
    if (!bad.length) { el.innerHTML = `<p class="tl-ok">✓ 檢查通過，可以發佈。</p>${copied}${notes ? `<details class="tl-checks"><summary><span class="warn">${notes} 個提醒（不擋發佈）</span></summary><ul>${other.map(e => line(e, "warn")).join("")}${longLines}</ul></details>` : ""}`; }
    else el.innerHTML = `<details class="tl-checks" open><summary><b class="bad">${bad.length} 個問題要修好才能發佈</b>${notes ? `<span class="warn">${notes} 個提醒（不擋發佈）</span>` : ""}</summary>
      <ul>${bad.map(e => line(e, "bad")).join("")}${other.map(e => line(e, "warn")).join("")}${longLines}</ul></details>${copied}`;
    el.querySelectorAll("[data-jl]").forEach(b => b.onclick = () => {
      if (b.dataset.jl && S.doc.levels[b.dataset.jl]) S.level = b.dataset.jl;
      if (b.dataset.jn) S.slide = Number(b.dataset.jn);
      paintTree(); paintMain();
      const f = b.dataset.jf && document.querySelector(`#tlEdit [data-f="${b.dataset.jf}"]`) || (b.dataset.jf === "title_en" && !b.dataset.jn ? $("tlTitleEn") : null);
      if (f) { f.focus(); f.scrollIntoView({ block: "center" }); }
    });
  }

  function paintList() {
    const el = $("tlList"); if (!el || !S.level) return;
    const slides = S.doc.levels[S.level], total = slides.length, parts = [...new Set(slides.map(s => s.part))].sort((a, b) => a - b);
    el.innerHTML = parts.map(p => `<p class="tl-part">Part ${p}${partName(p, total) ? " · " + partName(p, total) : ""}</p>` + slides.filter(s => s.part === p).map(s => {
      const sec = seconds(s.script, S.level), bad = issuesAt(S.level, s.no).some(e => e.kind === "bad");
      return `<button type="button" class="tl-slide ${s.no === S.slide ? "on" : ""} ${bad ? "bad" : ""}" data-no="${s.no}"><b>${s.no}</b><span>${esc(s.title_en || "（還沒有標題）")}</span><i class="${sec > 20 ? "long" : ""}">${s.script ? Math.round(sec) + " 秒" : "空"}</i></button>`;
    }).join("")).join("") + `<button type="button" class="btn tl-add" id="tlAddSlide">＋ 在最後加一張</button>`;
    el.querySelectorAll("[data-no]").forEach(b => b.onclick = () => { S.slide = Number(b.dataset.no); paintList(); paintEdit(); const again = $("tlList").querySelector(`[data-no="${S.slide}"]`); if (again) again.focus(); });
    // Arrows walk through the slides; Enter opens one and puts the cursor in its script.
    el.onkeydown = e => {
      const b = e.target.closest("[data-no]"); if (!b) return;
      const all = [...el.querySelectorAll("[data-no]")], i = all.indexOf(b);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); (all[i + 1] || b).focus(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); (all[i - 1] || b).focus(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); S.slide = Number(b.dataset.no); paintList(); paintEdit(); const f = document.querySelector('#tlEdit [data-f="script"]'); if (f) f.focus(); }
    };
    $("tlAddSlide").onclick = () => withUndo("已加一張投影片。", () => { for (const l of Object.keys(S.doc.levels)) S.doc.levels[l].push({ no: S.doc.levels[l].length + 1, part: 6, title_en: "", title_zh: "", script: "", purpose: "", keywords: "" }); S.slide = slides.length; });
  }

  const fieldMsgs = (no, f) => issuesAt(S.level, no, f).map(e => `<small class="tl-field-msg ${e.kind}">${esc(e.message)}</small>`).join("");
  function paintFieldMsgs() { document.querySelectorAll("#tlEdit .tl-msgs").forEach(el => { el.innerHTML = fieldMsgs(S.slide, el.dataset.m); }); }
  function paintEdit() {
    const el = $("tlEdit"); if (!el || !S.level) return;
    const slides = S.doc.levels[S.level], s = slides.find(x => x.no === S.slide) || slides[0];
    if (!s) { el.innerHTML = `<p class="tl-hint">這個難度還沒有投影片。</p>`; return; }
    S.slide = s.no;
    const others = Object.keys(S.doc.levels).filter(l => l !== S.level);
    // The messages sit in their own holder per field so they can be refreshed after a save
    // without touching the input the teacher may still be typing in.
    const msg = f => `<span class="tl-msgs" data-m="${f}">${fieldMsgs(s.no, f)}</span>`;
    el.innerHTML = `
      <div class="tl-edit-head"><b>第 ${s.no} 張</b><span>Part ${s.part}${partName(s.part, slides.length) ? " · " + partName(s.part, slides.length) : ""} · ${esc(S.level)}</span>
        <span class="tl-spacer"></span><button class="btn" type="button" id="tlPrev" ${s.no <= 1 ? "disabled" : ""}>← 上一張</button><button class="btn" type="button" id="tlNext" ${s.no >= slides.length ? "disabled" : ""}>下一張 →</button></div>
      <label>英文標題 <small class="tl-rule">卡面上顯示的就是這個。同一段裡不能有兩張一樣。${others.length ? "改這裡，" + others.join("、") + " 的同一張也會一起改。" : ""}</small>
        <input data-f="title_en" value="${esc(s.title_en)}" maxlength="200">${msg("title_en")}</label>
      <label>中文標題 <small class="tl-rule">給老師和報表看的；學生的卡面不顯示。</small>
        <input data-f="title_zh" value="${esc(s.title_zh)}" maxlength="200">${msg("title_zh")}</label>
      <label>講稿（${esc(S.level)}） <small class="tl-rule">一張投影片念 20 秒以內最剛好。</small>
        <textarea data-f="script" rows="6" maxlength="2000">${esc(s.script)}</textarea>
        <span class="tl-under"><span class="tl-count" id="tlCount"></span><span class="tl-savedat" id="tlSavedAt" role="status"></span></span>${msg("script")}</label>
      <details class="tl-adv" ${s.keywords || s.purpose ? "open" : ""}><summary>進階（可以不填）</summary>
        <label>卡面上的小提示 <small class="tl-rule">顯示在標題下面的一行小字，例如中文大綱。</small><input data-f="keywords" value="${esc(s.keywords)}" maxlength="300">${msg("keywords")}</label>
        <label>這一張的用途（給老師自己看）<input data-f="purpose" value="${esc(s.purpose)}" maxlength="300"></label>
        <label>屬於第幾段 <select data-f="part">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === s.part ? "selected" : ""}>Part ${n}${partName(n, slides.length) ? " · " + partName(n, slides.length) : ""}</option>`).join("")}</select>${msg("part")}</label>
      </details>
      <div class="tl-tools"><span class="tl-tools-label">這一張</span>
        <button class="btn" type="button" id="tlUp" ${s.no <= 1 ? "disabled" : ""} title="和前一張對調內容">↑ 往前移</button>
        <button class="btn" type="button" id="tlDown" ${s.no >= slides.length ? "disabled" : ""} title="和後一張對調內容">↓ 往後移</button>
        <button class="btn" type="button" id="tlInsert">＋ 在這一張後面插入一張</button>
        <button class="btn danger" type="button" id="tlDelSlide">刪除這一張（所有難度）</button></div>
      <p class="tl-rule">順序和張數在所有難度都一樣：移動、插入、刪除會同時改每一個難度。每一段要有幾張，上面的檢查會提醒。</p>`;
    const count = () => { const t = el.querySelector('[data-f="script"]').value, w = t.trim() ? t.trim().split(/\s+/).length : 0, sec = seconds(t, S.level); $("tlCount").textContent = `${w} 個字 · 照 ${S.level} 的速度約 ${Math.round(sec)} 秒`; $("tlCount").className = "tl-count " + (sec > 20 ? "long" : ""); };
    count();
    el.querySelectorAll("[data-f]").forEach(f => {
      const key = f.dataset.f;
      f.oninput = () => {
        const v = key === "part" ? Number(f.value) : f.value;
        // Titles and the part belong to the slide, not to one level: keep every level in step.
        if (key === "title_en" || key === "title_zh" || key === "part") for (const l of Object.keys(S.doc.levels)) { const x = S.doc.levels[l].find(y => y.no === s.no); if (x) x[key] = v; }
        else s[key] = v;
        if (key === "script") count();
        touch();
      };
      f.onblur = saveNow;      // checks are shown after leaving the field, not while typing
      if (key === "part") f.onchange = () => { f.oninput(); saveNow(); };
    });
    $("tlPrev").onclick = () => { S.slide = s.no - 1; paintList(); paintEdit(); };
    $("tlNext").onclick = () => { S.slide = s.no + 1; paintList(); paintEdit(); };
    // Moving swaps what the two slides say; the number and the part stay with the place, so the size of each part does not change.
    const move = dir => { const a = s.no, b = a + dir; if (b < 1 || b > slides.length) return;
      withUndo(`第 ${a} 張和第 ${b} 張已對調（每一段的張數不變）。`, () => { for (const l of Object.keys(S.doc.levels)) { const L = S.doc.levels[l], x = L.find(v => v.no === a), y = L.find(v => v.no === b); if (!x || !y) continue;
        for (const k of ["title_en", "title_zh", "script", "purpose", "keywords"]) { const t = x[k]; x[k] = y[k]; y[k] = t; } } S.slide = b; }); };
    $("tlUp").onclick = () => move(-1); $("tlDown").onclick = () => move(1);
    $("tlInsert").onclick = () => withUndo(`已在第 ${s.no} 張後面插入一張空白的投影片。`, () => { for (const l of Object.keys(S.doc.levels)) { const L = S.doc.levels[l], i = L.findIndex(v => v.no === s.no);
      L.splice(i < 0 ? L.length : i + 1, 0, { no: 0, part: s.part, title_en: "", title_zh: "", script: "", purpose: "", keywords: "" }); S.doc.levels[l] = L.map((v, j) => ({ ...v, no: j + 1 })); } S.slide = s.no + 1; });
    $("tlDelSlide").onclick = () => withUndo(`已刪除第 ${s.no} 張。`, () => { for (const l of Object.keys(S.doc.levels)) { S.doc.levels[l] = S.doc.levels[l].filter(x => x.no !== s.no).map((x, i) => ({ ...x, no: i + 1 })); } S.slide = Math.max(1, s.no - 1); });
  }

  // ── import / export / new topic ──
  function paintImport() {
    const el = $("tlImport"); el.hidden = !el.hidden; if (el.hidden) return;
    el.innerHTML = `<div class="tl-import">
      <p class="tl-hint">從試算表複製整塊貼上，或選 Excel／CSV 檔。第一列要是欄位名稱：<b>難度、張、段落、英文標題、中文標題、講稿、提示</b>（「匯出 Excel」出來的格式可以直接改完再匯入）。沒有「難度」欄就匯入到下面選的難度。匯入只會進草稿，可以復原。</p>
      <textarea id="tlImportText" rows="5" placeholder="張&#9;段落&#9;英文標題&#9;中文標題&#9;講稿"></textarea>
      <div class="tl-tools"><label>或選檔案 <input type="file" id="tlImportFile" accept=".xlsx,.csv,.tsv,.txt"></label>
        <label>沒有「難度」欄時匯入到 <select id="tlImportLevel">${S.tree.levels.map(l => `<option ${l === S.level ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <button class="btn btn-primary" type="button" id="tlImportGo">匯入到草稿</button></div></div>`;
    $("tlImportGo").onclick = async () => {
      const file = $("tlImportFile").files[0], text = $("tlImportText").value;
      if (!file && !text.trim()) { toast("先貼上內容或選一個檔案。"); return; }
      await saveNow();
      const entry = snapshot("匯入"), form = new FormData();
      form.append("level", $("tlImportLevel").value); form.append("text", file ? "" : text); if (file) form.append("file", file);
      try {
        const out = await call("POST", `/teacher/library/${S.game}/${S.topic}/import`, null, form);
        const lv = Object.keys(out.imported)[0];
        await openTopic(S.topic, lv); await load(S.topic);
        remember(entry);
        toast("已匯入到草稿：" + Object.entries(out.imported).map(([l, n]) => `${l} ${n} 張`).join("、") + (out.errors.length ? `。有 ${out.errors.length} 個問題，列在上面。` : "。"), () => undoEntry(entry));
      } catch (e) { toast(e.message); }
    };
  }
  async function exportXlsx() {
    try {
      await saveNow();
      const r = await fetch(API() + `/teacher/library/${S.game}/${S.topic}/export.xlsx`, { headers: head() });
      if (!r.ok) throw new Error("匯出失敗");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = `material-${S.topic}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast(`已下載 material-${S.topic}.xlsx。改完可以用「匯入」放回來。`);
    } catch (e) { toast(e.message); }
  }
  function paintNew(copyFrom) {
    const topics = S.tree.games[0].topics.filter(t => !t.archived);
    $("tlMain").innerHTML = `<section class="panel"><h3 class="tl-h">${copyFrom ? `複製 SDG ${esc(copyFrom)} 成新主題` : "新增主題"}</h3>
      <form id="tlNewForm" class="tl-new">
        <label>主題代碼 <small class="tl-rule">SDG 編號、減號、第幾個主題，例如 9-4。</small><input id="tlNewId" required pattern="\\d{1,2}-\\d{1,2}" placeholder="9-4" maxlength="5"><small class="tl-field-msg bad" id="tlNewIdMsg"></small></label>
        <label>英文名稱<input id="tlNewEn" maxlength="200"></label>
        <label>中文名稱<input id="tlNewZh" maxlength="200"></label>
        <label>內容從哪裡來 <select id="tlNewFrom"><option value="">空白的投影片（自己填或匯入）</option>${topics.map(t => `<option value="${esc(t.topic_id)}" ${t.topic_id === copyFrom ? "selected" : ""}>複製 SDG ${esc(t.topic_id)} ${esc(t.title_en)}</option>`).join("")}</select></label>
        <div id="tlNewBlank">
          <label>幾張投影片 <select id="tlNewSlides"><option value="20">20 張（每段 3、3、3、3、4、4）</option><option value="12">12 張（每段 2 張）</option></select></label>
          <fieldset><legend>要有哪些難度</legend>${S.tree.levels.map(l => `<label class="check"><input type="checkbox" value="${l}" ${["A2", "B1", "B2"].includes(l) ? "checked" : ""}> ${l}</label>`).join("")}</fieldset>
        </div>
        <div class="tl-tools"><button class="btn btn-primary" type="submit">建立（先是草稿，學生看不到）</button><button class="btn" type="button" id="tlNewCancel">取消</button></div>
      </form></section>`;
    const sync = () => { $("tlNewBlank").hidden = !!$("tlNewFrom").value; }; $("tlNewFrom").onchange = sync; sync();
    $("tlNewId").onblur = () => { const v = $("tlNewId").value.trim(); $("tlNewIdMsg").textContent = !v ? "" : !/^\d{1,2}-\d{1,2}$/.test(v) ? "代碼要像 9-4。" : S.tree.games[0].topics.some(t => t.topic_id === v) ? `已經有 ${v} 了。` : ""; };
    $("tlNewCancel").onclick = () => { S.mode = "topic"; if (S.topic) { paintTree(); paintMain(); } else load(); };
    $("tlNewForm").onsubmit = async e => {
      e.preventDefault();
      try {
        const id = $("tlNewId").value.trim();
        await call("POST", `/teacher/library/${S.game}`, { topic_id: id, title_en: $("tlNewEn").value, title_zh: $("tlNewZh").value, slides: Number($("tlNewSlides").value), levels: [...document.querySelectorAll("#tlNewBlank input:checked")].map(i => i.value), copy_from: $("tlNewFrom").value || null });
        S.mode = "topic"; S.filter = ""; await load(id); toast(`主題 ${id} 已建立。填好後按「發佈給學生」。`);
      } catch (err) { $("tlNewIdMsg").textContent = err.message; }
    };
    $("tlNewId").focus();
  }

  addEventListener("beforeunload", e => { if (S.dirty) { saveNow(); e.preventDefault(); e.returnValue = ""; } });
  window.loadLibrary = () => load();
})();
