// Teacher dashboard → 系統 › 資料庫: the tables drawn as an ER diagram (Mermaid), one area at a time.
// Input: /teacher/db-schema (tables, columns, row counts, and the relationships the backend declares).
(function () {
  const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
  const AREAS = [
    ["learning", "學習紀錄", "每一局、每個操作、成績和錄音怎麼接到學生", ["users", "courses", "learning_runs", "learning_events", "pk_results", "speech_recordings", "chip_ledger"]],
    ["class", "帳號與課程", "學生、課程、系級、修課名單", ["users", "login_events", "email_otps", "courses", "course_sections", "enrollments", "course_activities", "roster_imports"]],
    ["content", "教材", "老師在教材管理改的內容和每一版", ["content_topics", "content_versions"]],
    ["legacy", "舊版卡牌題庫", "舊的 SDGs Pecha Kucha（已停用，資料保留）", ["users", "game_sessions", "game_part_records", "sdg_options", "difficulty_options", "tbl_sdg_parts", "tbl_sdg_sub_topics", "tbl_sdg_cards"]],
    ["system", "系統", "每分鐘的系統資源紀錄", ["system_metrics"]],
    ["all", "全部（只看關係）", "所有資料表和它們之間的關係，不列欄位", null],
  ];
  let area = "learning", schema = null, lib = null;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const word = v => String(v).replace(/[^A-Za-z0-9_]/g, "_");
  const type = t => { t = String(t || "").toLowerCase(); return /int|serial/.test(t) ? "int" : /char|text|uuid/.test(t) ? "text" : /real|double|numeric|float|decimal/.test(t) ? "real" : /bool/.test(t) ? "bool" : /time|date/.test(t) ? "time" : /bytea|blob/.test(t) ? "blob" : /json/.test(t) ? "json" : "text"; };

  function loadLib() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (lib) return lib;
    lib = new Promise((ok, bad) => { const s = document.createElement("script"); s.src = MERMAID; s.onload = () => ok(window.mermaid); s.onerror = () => bad(new Error("ER 圖的繪圖元件載入失敗，請檢查網路後按「重新整理」。")); document.head.appendChild(s); });
    return lib;
  }

  function source(names) {
    const rel = (schema.relationships || []).map(r => { const [ft, fc] = r.from.split("."), [tt, tc] = r.to.split("."); return { ft, fc, tt, tc }; });
    const keyTo = new Set(rel.map(r => r.tt + "." + r.tc)), keyFrom = new Set(rel.map(r => r.ft + "." + r.fc));
    const tables = schema.tables.filter(t => !names || names.includes(t.table));
    const shown = new Set(tables.map(t => t.table));
    const lines = ["erDiagram"];
    for (const t of tables) {
      if (!names) { lines.push(`  ${word(t.table)} {`, `    int rows "${Number(t.rows) || 0} 筆"`, "  }"); continue; }
      lines.push(`  ${word(t.table)} {`);
      for (const c of t.columns) {
        const pk = c.name === "id" || keyTo.has(t.table + "." + c.name), fk = keyFrom.has(t.table + "." + c.name);
        lines.push(`    ${type(c.type)} ${word(c.name)}${pk && fk ? " PK, FK" : pk ? " PK" : fk ? " FK" : ""}`);
      }
      lines.push("  }");
    }
    for (const r of rel) if (shown.has(r.ft) && shown.has(r.tt)) lines.push(`  ${word(r.tt)} ||--o{ ${word(r.ft)} : "${word(r.fc)}"`);
    return lines.join("\n");
  }

  async function draw() {
    const box = document.getElementById("erCanvas"), note = document.getElementById("erNote");
    if (!box || !schema) return;
    const a = AREAS.find(x => x[0] === area);
    note.textContent = a[2];
    box.classList.add("er-loading");
    try {
      const m = await loadLib();
      m.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict", er: { useMaxWidth: area === "all", layoutDirection: "TB" }, fontFamily: "inherit" });
      const { svg } = await m.render("er" + Date.now(), source(a[3]));
      box.innerHTML = svg;
      if (box.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    } catch (e) { box.innerHTML = `<p class="er-msg">${esc(e.message || e)}</p>`; }
    finally { box.classList.remove("er-loading"); }
  }

  window.renderEr = function (s) {
    schema = s;
    const host = document.getElementById("dbEr");
    if (!host) return;
    host.innerHTML = `<div class="er-tabs" role="tablist">${AREAS.map(([k, l]) => `<button type="button" role="tab" class="er-tab ${k === area ? "on" : ""}" data-area="${k}">${l}</button>`).join("")}</div>
      <p class="er-note" id="erNote"></p>
      <div class="er-canvas scrollx" id="erCanvas"></div>
      <p class="er-legend">一條線＝「多」的那一邊（叉狀）記著「一」的那一邊的編號；線上的字是哪個欄位。PK＝這張表的編號，FK＝指到別張表的編號。</p>`;
    host.querySelectorAll(".er-tab").forEach(b => b.onclick = () => { area = b.dataset.area; host.querySelectorAll(".er-tab").forEach(x => x.classList.toggle("on", x === b)); draw(); });
    draw();
  };
})();
