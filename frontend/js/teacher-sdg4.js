// Teacher dashboard → 學習紀錄 › SDG 4 Stage (2026-11-12): the 3D Pecha Kucha stage, slide by slide.
//   全班   how far talks got, where they were left, how much of each slide was heard, time per slide and per phase
//   學生   one student's talks: accuracy over time, latest against best per slide, words to practise
//   單次   one talk: every slide (time, attempts, heard, missed words), the phases, the raw events
// How a student is judged (the teacher's brief, 2026-11-12): anomalies belong to ONE talk and are then gathered per
// student and across games; a student who gave up and later finished is "recovered" (unsteady, not weak); the talk
// that stands for a student is their best finished one. Reports go out talk by talk; a talk that was left gets no
// report and the teacher is told who that was.
// Data: backend/sdg4_reports.py (/learning/sdg4/*). Slide titles come from the game's own talk.js.
// Every value that came from a student or a browser goes through esc() or num() before it reaches the page.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = v => (v === null || v === undefined || v === "" || typeof v === "boolean" || !isFinite(Number(v)) ? null : Number(v));
  const pct = (v, dash = "–") => { const x = num(v); return x === null ? dash : Math.round(x * 100) + "%"; };
  const n = (v, dash = "–") => { const x = num(v); return x === null ? dash : String(x); };
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const toast = (m) => (window.teacherToast ? window.teacherToast(m) : alert(m));
  const head = () => ({ Authorization: "Bearer " + auth.getToken() });
  async function post(path, body) {
    const r = await fetch(API() + path, { method: "POST", headers: { ...head(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "沒有成功，請再試一次。"); }
    return r.json();
  }
  async function get(path, params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "")).toString();
    const r = await fetch(API() + path + (q ? "?" + q : ""), { headers: head() });
    if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "讀取失敗，請按「重新整理」再試一次。"); }
    return r.json();
  }

  const PART = { 1: "Introduction 引言", 2: "Problem 問題", 3: "Achievements 成果", 4: "Solutions 解方", 5: "Implications 影響", 6: "Call to action 號召" };
  const PART_COLOR = { 1: "#2563eb", 2: "#dc2626", 3: "#16a34a", 4: "#d97706", 5: "#7c3aed", 6: "#0891b2" };
  const PHASE_COLOR = { load: "#94a3b8", intro: "#cbd5e1", pier: "#60a5fa", walk: "#34d399", backstage: "#fbbf24", present: "#f97316", ending: "#a78bfa" };
  const MODE = { practice: "練習", formal: "正式" };
  const OFF = { test_account: "測試帳號", embed: "3D 小站", test_run: "快速測試", partial: "部分段落" };
  const FLAG = { too_fast: "太快，不像真的念完", few_slides: "念的張數太少", more_right_than_said: "對的字比說的還多", short_slides: "每張停太短", no_voice: "幾乎沒有聲音", left_tab: "常離開分頁" };
  const STATE = { none: ["還沒上台", ""], steady: ["穩定完成", "good"], recovered: ["放棄後又完成", "info"], unstable: ["最近又中途離開", "warn"], abandoned_only: ["還沒完成過", "bad"] };
  const EVENT = { "run.start": "開始", phase: "換階段", "pk.part": "段落說明卡", "pk.part.read": "看完說明卡", "pk.slide.start": "開始念一張", "pk.slide": "念完一張", "pk.redo": "這張重來", "pk.model": "聽示範朗讀",
    "page.hide": "離開分頁", "page.show": "回到分頁", ending: "結尾", "map.open": "打開演講地圖", move: "移動", "speech.test": "測試麥克風", "speech.mode": "改成默讀", "speech.retry": "重試麥克風" };
  const S = { courses: [], courseId: "", sectionId: "", level: "", mode: "", from: "", to: "", view: "class", report: null, studentId: null, runId: null, titles: {}, showOff: false, loaded: false, watch: null, sent: {}, pick: new Set(), lastSend: null };

  const tone = v => (v === null ? "#cbd5e1" : v >= 0.7 ? "#16a34a" : v >= 0.4 ? "#d97706" : "#dc2626");
  const when = s => String(s || "").replace("T", " ").slice(0, 16);
  const title = no => S.titles[no] || "";
  const slideName = no => `第 ${no} 張${title(no) ? "「" + esc(title(no)) + "」" : ""}`;
  const filters = () => ({ course_id: S.courseId, section_id: S.sectionId, level: S.level, mode: S.mode, from: S.from, to: S.to });

  // ── charts (inline SVG; each one is followed by a sentence that says what it shows) ──
  // Bars for the 20 slides. series: [{ key, color | colorFn, label }]; a second series is drawn narrower in front.
  function slideBars(rows, series, { max = null, fmt = v => v, height = 150, unit = "" } = {}) {
    const W = 760, H = height, L = 34, B = 34, top = 10, bw = (W - L - 8) / 20;
    const hi = max ?? Math.max(1, ...rows.flatMap(r => series.map(s => num(r[s.key]) ?? 0)));
    const y = v => top + (H - top - B) * (1 - v / hi);
    let out = `<svg class="s4-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.label).join("、"))}（第 1 到 20 張）">`;
    for (const g of [0, 0.5, 1]) out += `<line x1="${L}" x2="${W - 8}" y1="${y(hi * g)}" y2="${y(hi * g)}" class="s4-grid"/><text x="${L - 5}" y="${y(hi * g) + 4}" class="s4-ax" text-anchor="end">${esc(fmt(hi * g))}</text>`;
    rows.forEach((r, i) => {
      const x = L + i * bw;
      series.forEach((s, k) => {
        const v = num(r[s.key]); if (v === null) return;
        const w = bw * (k ? 0.42 : 0.72), off = (bw - w) / 2;
        out += `<rect x="${(x + off).toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, H - B - y(v)).toFixed(1)}" rx="2" fill="${s.colorFn ? s.colorFn(v, r) : s.color}"><title>${slideName(r.slide)}：${esc(s.label)} ${esc(fmt(v))}${unit}</title></rect>`;
      });
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - B + 13}" class="s4-ax" text-anchor="middle">${r.slide}</text>`;
      if (i === 0 || rows[i - 1].part !== r.part) {
        const span = rows.filter(q => q.part === r.part).length;
        out += `<rect x="${(x + 2).toFixed(1)}" y="${H - 14}" width="${(span * bw - 4).toFixed(1)}" height="4" rx="2" fill="${PART_COLOR[r.part]}"/><text x="${(x + span * bw / 2).toFixed(1)}" y="${H - 1}" class="s4-ax s4-part" text-anchor="middle" fill="${PART_COLOR[r.part]}">Part ${r.part}</text>`;
      }
    });
    return out + "</svg>" + `<p class="s4-legend">${series.map(s => `<span><i style="background:${s.color || "#16a34a"}"></i>${esc(s.label)}</span>`).join("")}</p>`;
  }
  function hbars(rows, { label, value, color = "#2563eb", fmt = v => v }) {
    const hi = Math.max(1, ...rows.map(r => num(value(r)) ?? 0));
    return `<div class="s4-hbars">${rows.map(r => { const v = num(value(r)) ?? 0; return `<div class="s4-hbar"><span>${label(r)}</span><i><b style="width:${(v / hi * 100).toFixed(1)}%;background:${typeof color === "function" ? color(r) : color}"></b></i><em>${esc(fmt(v))}</em></div>`; }).join("")}</div>`;
  }
  function phaseBar(phases) {   // [{phase, zh, s}] → one stacked bar
    const rows = phases.filter(p => num(p.s) !== null && p.s > 0), total = rows.reduce((a, p) => a + p.s, 0);
    if (!total) return `<p class="s4-hint">沒有階段時間的資料（新版之前的紀錄沒有這一項）。</p>`;
    return `<div class="s4-stack">${rows.map(p => `<i style="flex:${p.s};background:${PHASE_COLOR[p.phase]}" title="${esc(p.zh)} ${Math.round(p.s)} 秒"></i>`).join("")}</div>
      <p class="s4-legend">${rows.map(p => `<span><i style="background:${PHASE_COLOR[p.phase]}"></i>${esc(p.zh)} ${p.s >= 90 ? (p.s / 60).toFixed(1) + " 分" : Math.round(p.s) + " 秒"}</span>`).join("")}</p>`;
  }
  function spark(vals) {
    const v = vals.map(num), pts = v.map((x, i) => (x === null ? null : [4 + i * (72 / Math.max(1, v.length - 1)), 22 - x * 18])).filter(Boolean);
    if (pts.length < 2) return pts.length ? `<svg class="s4-spark" viewBox="0 0 80 26"><circle cx="40" cy="${pts[0][1]}" r="3" fill="#2563eb"/></svg>` : "";
    return `<svg class="s4-spark" viewBox="0 0 80 26" aria-hidden="true"><polyline points="${pts.map(p => p.map(q => q.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="#2563eb" stroke-width="2"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="3" fill="#2563eb"/></svg>`;
  }
  const meter = v => (num(v) === null ? `<span class="s4-dash">–</span>` : `<span class="s4-meter"><i><b style="width:${Math.round(v * 100)}%;background:${tone(v)}"></b></i>${pct(v)}</span>`);
  const kpi = (big, label, sub = "") => `<div class="s4-kpi"><b>${big}</b><span>${esc(label)}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;

  // ── the frame: filters, the way back, export ──
  function frame(body) {
    const course = S.courses.find(c => String(c.id) === String(S.courseId));
    const sections = (course && course.sections) || [];
    const crumbs = [`<button type="button" class="s4-crumb" data-go="class">全班</button>`];
    if (S.view !== "class" && S.student) crumbs.push(`<button type="button" class="s4-crumb" data-go="student">${esc(S.student.name || "學生")}</button>`);
    if (S.view === "run") crumbs.push(`<span class="s4-crumb now">單次發表</span>`);
    $("s4Root").innerHTML = `
      <div class="panel">
        <h2>SDG 4 Pecha Kucha Stage<small>3D 舞台上的全文朗讀：每張投影片停多久、有沒有念完、重講幾次、觀眾聽到多少、在哪裡離開。</small></h2>
        <div class="s4-row">
          <label>課程<select id="s4Course"><option value="">全部（含沒有課程的）</option>${S.courses.map(c => `<option value="${esc(c.id)}"${String(c.id) === String(S.courseId) ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
          ${sections.length ? `<label>系級<select id="s4Section"><option value="">全部</option>${sections.map(x => `<option value="${esc(x.id)}"${String(x.id) === String(S.sectionId) ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>` : ""}
          <label>等級<select id="s4Level"><option value="">全部</option>${["A2", "B1", "B2"].map(l => `<option${l === S.level ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>模式<select id="s4Mode"><option value="">練習＋正式</option><option value="practice"${S.mode === "practice" ? " selected" : ""}>只看練習</option><option value="formal"${S.mode === "formal" ? " selected" : ""}>只看正式</option></select></label>
          <label>從<input type="date" id="s4From" value="${esc(S.from)}"></label><label>到<input type="date" id="s4To" value="${esc(S.to)}"></label>
          <button class="btn" type="button" id="s4Reload">重新整理</button>
          <span class="s4-grow"></span>
          <button class="btn" type="button" data-xlsx="1">匯出 Excel（含姓名）</button>
          <button class="btn" type="button" data-xlsx="0" title="只有研究代碼，沒有姓名與學號">匯出（研究用）</button>
        </div>
        <nav class="s4-crumbs" aria-label="目前位置">${crumbs.join('<span class="s4-sep">›</span>')}</nav>
      </div>${body}`;
    const set = (id, key, also) => { const el = $(id); if (el) el.onchange = () => { S[key] = el.value; if (also) also(); S.view = "class"; load(); }; };
    set("s4Course", "courseId", () => { S.sectionId = ""; }); set("s4Section", "sectionId"); set("s4Level", "level"); set("s4Mode", "mode"); set("s4From", "from"); set("s4To", "to");
    $("s4Reload").onclick = () => load();
    $("s4Root").querySelectorAll("[data-go]").forEach(b => { b.onclick = () => (b.dataset.go === "class" ? showClass() : openStudent(S.studentId)); });
    $("s4Root").querySelectorAll("[data-xlsx]").forEach(b => { b.onclick = () => exportXlsx(b.dataset.xlsx === "1"); });
    $("s4Root").querySelectorAll("[data-student]").forEach(el => { el.onclick = () => openStudent(+el.dataset.student); });
    $("s4Root").querySelectorAll("[data-run]").forEach(el => { el.onclick = () => openRun(+el.dataset.run); });
    const off = $("s4ShowOff"); if (off) off.onchange = () => { S.showOff = off.checked; showClass(); };
    const picks = () => { const b = $("s4Send"); if (b) { b.disabled = !S.pick.size; $("s4PickN").textContent = S.pick.size ? `已勾選 ${S.pick.size} 次` : ""; } };
    $("s4Root").querySelectorAll("[data-pick]").forEach(c => { c.onchange = () => { c.checked ? S.pick.add(+c.dataset.pick) : S.pick.delete(+c.dataset.pick); picks(); }; });
    if ($("s4PickAll")) $("s4PickAll").onclick = () => { $("s4Root").querySelectorAll("[data-pick]").forEach(c => { c.checked = true; S.pick.add(+c.dataset.pick); }); picks(); };
    // Students whose latest state is "gave up" have nothing that can be ticked. Their unfinished talks go along with the
    // request anyway: the server sends nothing for them and answers with their names, which is the reminder.
    const gaveUp = () => { const who = new Set(S.report.students.filter(s => s.user_id && (s.state === "abandoned_only" || s.state === "unstable")).map(s => s.user_id)); const seen = new Set();
      return S.report.runs.filter(r => !r.finished && !r.excluded && who.has(r.user_id) && !seen.has(r.user_id) && seen.add(r.user_id)).map(r => r.id); };
    if ($("s4Send")) $("s4Send").onclick = () => sendReports([...S.pick, ...gaveUp()], $("s4Note").value);
    $("s4Root").querySelectorAll("[data-send-one]").forEach(b => { b.onclick = () => sendReports([+b.dataset.sendOne], ($("s4NoteOne") || {}).value || ""); });
    picks();
  }
  // One report per talk. The server refuses talks that were left; what it withheld is shown to the teacher.
  async function sendReports(runIds, note) {
    if (!runIds.length) return;
    try {
      const d = await post("/teacher/reports/sdg4-run", { run_ids: runIds, note });
      S.lastSend = { message: d.message, withheld: d.withheld || [], skipped: d.skipped || [] };
      S.pick.clear();
      toast(d.message);
      S.sent = (await get("/teacher/reports/sdg4-sent").catch(() => ({ runs: S.sent }))).runs || S.sent;
      if (S.view === "run") openRun(S.runId); else showClass();
    } catch (e) { toast(e.message); }
  }
  async function exportXlsx(names) {
    try {
      const q = new URLSearchParams(Object.entries({ ...filters(), names }).filter(([, v]) => v !== "" && v !== null && v !== undefined)).toString();
      const r = await fetch(API() + "/learning/sdg4/export.xlsx?" + q, { headers: head() });
      if (!r.ok) throw new Error("匯出沒有成功，請再試一次。");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob());
      a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "sdg4-stage.xlsx";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast(e.message); }
  }

  // ── 全班 ──
  function attention(rep) {
    const out = [];
    for (const s of rep.students) {
      if (s.test) continue;
      const why = [];
      const best = s.best_run ? num(s.best_run.accuracy) : null;
      if (!s.runs) { if (rep.overview.students_listed !== rep.overview.not_played) why.push("還沒有上台過"); }
      else if (s.state === "abandoned_only") why.push(`上台 ${s.runs} 次都沒有念完。放棄的上台不會發報告，建議直接和這位學生聊聊卡在哪裡`);
      else {
        // "recovered" (gave up, finished later) is unsteady, not weak: it is shown in the table, not listed here.
        if (s.state === "unstable") why.push(`完成過 ${s.finished} 次，但最近一次又中途離開`);
        if (best !== null && best < 0.4) why.push(`最好的一次完成紀錄只被聽到 ${pct(best)}`);
      }
      if (why.length) out.push({ s, why });
    }
    return out.slice(0, 12);
  }
  function showClass() {
    S.view = "class"; S.student = null;
    const rep = S.report, o = rep.overview, sl = rep.slides;
    if (!o.runs_total) {
      frame(`<div class="panel"><p class="s4-empty">這個範圍還沒有 SDG 4 Stage 的紀錄。學生用自己的帳號登入、從遊戲首頁進入「SDG 4 Pecha Kucha Stage」上台後，這裡就會出現資料。訪客模式不會留下紀錄。</p></div>`);
      return;
    }
    const first = sl[0], lastS = sl[19];
    const worstDrop = sl.filter(s => s.reached && num(s.completion) !== null && s.completion < 1).sort((a, b) => a.completion - b.completion)[0];
    const heardRows = sl.filter(s => num(s.heard_avg) !== null), hardest = heardRows.slice().sort((a, b) => a.heard_avg - b.heard_avg)[0];
    const dwellRows = sl.filter(s => num(s.dwell_median_s) !== null), slowest = dwellRows.slice().sort((a, b) => b.dwell_median_s - a.dwell_median_s)[0];
    const redoTop = sl.filter(s => num(s.redo_rate) && s.redo_rate > 0).sort((a, b) => b.redo_rate - a.redo_rate)[0];
    const phases = rep.phases.map(p => ({ phase: p.phase, zh: p.zh, s: p.median_s }));
    const exitsTotal = rep.exits.reduce((a, e) => a + e.runs, 0);
    const att = attention(rep);
    const offNote = o.excluded_runs ? `另有 ${o.excluded_runs} 次不算進來（${Object.entries(o.excluded).map(([k, v]) => `${OFF[k] || esc(k)} ${v}`).join("、")}）。` : "";
    const runs = rep.runs.filter(r => S.showOff || !r.excluded).slice(0, 60);
    const also = new Map(((S.watch && S.watch.students) || []).filter(p => p.games.length > 1).map(p => [p.user_id, p.games.filter(g => g.game !== "sdg4-stage").map(g => g.name)]));
    const st = rep.states || {};
    const ls = S.lastSend;
    frame(`
      <div class="panel">
        <div class="s4-kpis">
          ${kpi(n(o.runs), "次上台", `${n(o.practice)} 次練習 · ${n(o.formal)} 次正式`)}
          ${kpi(pct(o.finish_rate), "念完 20 張", `${n(o.finished)} / ${n(o.runs)} 次`)}
          ${kpi(pct(o.accuracy_avg), "念對的字（平均）", o.listen_share === null ? "" : `${pct(o.listen_share)} 的上台有語音辨識`)}
          ${kpi(n(o.redo_per_run), "每次重講幾張", `聽示範 ${n(o.model_per_run)} 次`)}
          ${kpi(n(o.avg_minutes), "平均分鐘", `${n(o.students_played)} / ${n(o.students_listed)} 位學生上過台`)}
          ${kpi(n(o.load_median_s) === "–" ? "–" : n(o.load_median_s) + " 秒", "場景載入（中位數）", `手機平板 ${n(o.mobile)} 次 · 低畫質 ${n(o.low_tier)} 次`)}
        </div>
        <p class="s4-hint">${offNote}${o.with_timing < o.runs ? `其中 ${o.runs - o.with_timing} 次是新版之前的紀錄，沒有停留時間與階段耗時。` : ""}</p>
      </div>
      ${ls ? `<div class="panel s4-sendresult"><h3 class="s4-h">剛剛發出的報告</h3><p>${esc(ls.message)}</p>
        ${ls.withheld.length ? `<ul class="s4-att">${ls.withheld.map(w => `<li><button type="button" class="s4-link" data-student="${num(w.user_id)}">${esc(w.name || "")}</button>：${esc(w.reason)}（念完 ${n(w.slides_done)} / 20 張），沒有發報告。</li>`).join("")}</ul>` : ""}
        ${ls.skipped.length ? `<p class="s4-hint">另有 ${ls.skipped.length} 次沒有發：${ls.skipped.map(x => esc(x.reason)).join("、")}。</p>` : ""}</div>` : ""}
      ${rep.anomalies.length ? `<div class="panel"><h3 class="s4-h">這個遊戲裡要查看的學生（${rep.anomalies.length} 位）</h3>
        <p class="s4-hint">異常是以每一次上台來判斷，再彙整到學生。紅色＝結果比過程能解釋的好（影響籌碼與成績）；黃色＝值得和學生一起看。</p>
        <ul class="s4-anom">${rep.anomalies.map(a => `<li class="${a.too_good ? "bad" : "warn"}"><button type="button" class="s4-link" ${a.user_id ? `data-student="${a.user_id}"` : "disabled"}>${esc(a.name)}</button>${a.student_no ? ` <span class="s4-no">${esc(a.student_no)}</span>` : ""}
          ${also.has(a.user_id) ? `<span class="s4-tag warn">${also.get(a.user_id).map(esc).join("、")} 也被標記</span>` : ""}<ul>${a.reasons.map(w => `<li>${esc(w)}</li>`).join("")}</ul></li>`).join("")}</ul></div>` : ""}
      ${att.length ? `<div class="panel"><h3 class="s4-h">先看這幾位</h3><ul class="s4-att">${att.map(a => `<li><button type="button" class="s4-link" ${a.s.user_id ? `data-student="${a.s.user_id}"` : "disabled"}>${esc(a.s.name)}</button>${a.s.student_no ? ` <span class="s4-no">${esc(a.s.student_no)}</span>` : ""}：${a.why.map(esc).join("；")}</li>`).join("")}</ul></div>` : ""}
      <div class="s4-two">
        <div class="panel"><h3 class="s4-h">每一張有多少次走到、多少次念完</h3>
          ${slideBars(sl, [{ key: "reached", color: "#bfdbfe", label: "走到這一張" }, { key: "done", color: "#2563eb", label: "念完這一張" }], { fmt: v => Math.round(v), unit: " 次" })}
          <p class="s4-say">${first.reached ? `走到第 1 張的 ${first.reached} 次裡，${lastS.done} 次念完第 20 張。` : "還沒有人走到第 1 張。"}${worstDrop ? `最容易在${slideName(worstDrop.slide)}停下來：${worstDrop.reached} 次走到、${worstDrop.done} 次念完。` : "走到的每一張都念完了。"}</p></div>
        <div class="panel"><h3 class="s4-h">每一張觀眾聽到多少（語音辨識）</h3>
          ${heardRows.length ? slideBars(sl, [{ key: "heard_avg", colorFn: v => tone(v), color: "#16a34a", label: "聽到的比例" }], { max: 1, fmt: v => Math.round(v * 100) + "%" }) : `<p class="s4-hint">這個範圍的上台都是默讀（沒有語音辨識），所以沒有這張圖。</p>`}
          ${hardest ? `<p class="s4-say">最難念的是${slideName(hardest.slide)}：平均只聽到 ${pct(hardest.heard_avg)}（${hardest.heard_n} 次）${hardest.top_missed.length ? "，最常沒念對的字：" + hardest.top_missed.slice(0, 4).map(w => `<b>${esc(w.word)}</b>`).join("、") : ""}。綠色是 70% 以上，紅色是 40% 以下。</p>` : ""}</div>
      </div>
      <div class="s4-two">
        <div class="panel"><h3 class="s4-h">每一張停留幾秒、多少人重講</h3>
          ${dwellRows.length ? slideBars(sl, [{ key: "dwell_median_s", color: "#fdba74", label: "停留秒數（中位數）" }], { fmt: v => Math.round(v) + " 秒" }) : `<p class="s4-hint">還沒有停留時間的資料。</p>`}
          <p class="s4-say">${slowest ? `停最久的是${slideName(slowest.slide)}（${n(slowest.dwell_median_s)} 秒）。` : ""}${redoTop ? `最常被重講的是${slideName(redoTop.slide)}：走到的 ${redoTop.reached} 次裡有 ${Math.round(redoTop.redo_rate * redoTop.reached)} 次重講。` : "沒有人按「這張重來」。"}正式模式每張固定 20 秒；超過的秒數來自重講和聽示範。</p></div>
        <div class="panel"><h3 class="s4-h">時間花在哪個階段（中位數）</h3>${phaseBar(phases)}
          <p class="s4-say">${(() => { const pre = phases.filter(p => ["pier", "walk", "backstage"].includes(p.phase) && num(p.s)).reduce((a, p) => a + p.s, 0), pr = phases.find(p => p.phase === "present"); return pr && num(pr.s) ? `上台前（碼頭、走路、後台）大約 ${Math.round(pre)} 秒，上台發表 ${(pr.s / 60).toFixed(1)} 分鐘。` : "還沒有完整的階段時間。"; })()}</p></div>
      </div>
      <div class="s4-two">
        <div class="panel"><h3 class="s4-h">沒念完的，最後停在哪裡</h3>
          ${rep.exits.length ? hbars(rep.exits.slice(0, 10), { label: e => esc(e.label), value: e => e.runs, color: "#dc2626", fmt: v => v + " 次" }) : `<p class="s4-hint">每一次上台都走到結尾。</p>`}
          ${rep.exits.length ? `<p class="s4-say">${o.runs} 次上台裡有 ${exitsTotal} 次沒走到結尾，最常停在「${esc(rep.exits[0].label)}」（${rep.exits[0].runs} 次）。${o.left_tab ? `${o.left_tab} 次中途切到別的分頁或鎖了螢幕。` : ""}</p>` : ""}</div>
        <div class="panel"><h3 class="s4-h">念對率的分布</h3>
          ${hbars(rep.accuracy_dist, { label: b => `${b.from}–${b.to}%`, value: b => b.n, color: b => tone((b.from + 10) / 100), fmt: v => v + " 次" })}
          <p class="s4-say">${num(o.accuracy_median) === null ? "還沒有語音辨識的資料。" : `一半的上台念對 ${pct(o.accuracy_median)} 以上。語音辨識不是百分之百準，數字適合拿來比較前後，不適合當成績。`}</p></div>
      </div>
      <div class="panel"><h3 class="s4-h">學生（${rep.students.filter(s => !s.test).length} 位）</h3>
        <p class="s4-hint">穩定完成 ${n(st.steady)} 位 · 放棄後又完成 ${n(st.recovered)} 位 · 最近又中途離開 ${n(st.unstable)} 位 · 還沒完成過 ${n(st.abandoned_only)} 位 · 還沒上台 ${n(st.none)} 位。「代表的一次」是念完的上台裡念對率最高、而且沒有異常的那一次：放棄過不會拉低它。</p>
        <div class="s4-sheet"><table class="s4-table"><thead><tr><th>學生</th><th>系級</th><th>狀態</th><th>上台</th><th>念完</th><th>代表的一次</th><th>最近</th><th>趨勢</th><th>重講</th><th>分鐘</th><th>最後一次</th></tr></thead><tbody>
        ${rep.students.map(s => `<tr class="${s.test ? "off" : ""}"><td>${s.user_id ? `<button type="button" class="s4-link" data-student="${s.user_id}">${esc(s.name)}</button>` : esc(s.name)}${s.student_no ? `<small>${esc(s.student_no)}</small>` : ""}${s.test ? `<span class="s4-tag">測試帳號</span>` : ""}</td>
          <td>${esc(s.section || "")}</td><td>${s.runs ? `<span class="s4-tag ${(STATE[s.state] || ["", ""])[1]}" title="${esc(s.state_zh || "")}">${esc((STATE[s.state] || [s.state])[0])}</span>` : ""}${s.anomaly ? `<span class="s4-tag ${s.anomaly.too_good ? "bad" : "warn"}" title="${esc(s.anomaly.reasons.join("；"))}">異常</span>` : ""}</td>
          <td>${s.runs ? `${s.runs}<small>練 ${s.practice} · 正 ${s.formal}</small>` : `<span class="s4-dash">還沒有</span>`}</td><td>${s.runs ? `${s.finished} / ${s.runs}` : ""}</td>
          <td>${s.best_run ? `<button type="button" class="s4-link" data-run="${num(s.best_run.run_id)}" title="打開這一次">${meter(s.best_run.accuracy)}</button>` : s.runs ? `<span class="s4-dash">還沒有完成的</span>` : ""}</td><td>${s.runs ? meter(s.last) : ""}</td><td>${spark(s.trend || [])}</td><td>${s.runs ? n(s.redo) : ""}</td><td>${s.runs ? n(s.minutes) : ""}</td><td>${esc(when(s.last_played))}</td></tr>`).join("")}
        </tbody></table></div></div>
      <div class="panel"><h3 class="s4-h">最近的上台</h3>
        <div class="s4-send"><p class="s4-hint">勾選要發報告的上台，一次一份。中途離開的不能勾：放棄的上台不發報告，發出後這裡會提醒你是哪幾位。</p>
          <textarea id="s4Note" rows="2" maxlength="2000" placeholder="想跟學生說的話（可不填），會放在報告裡"></textarea>
          <div class="s4-row"><button class="btn btn-primary" type="button" id="s4Send" disabled>發出勾選的報告</button><button class="btn" type="button" id="s4PickAll">勾選全部可以發的</button><span id="s4PickN" class="s4-hint"></span></div></div>
        ${o.excluded_runs ? `<label class="s4-check"><input type="checkbox" id="s4ShowOff"${S.showOff ? " checked" : ""}> 也顯示不計入的 ${o.excluded_runs} 次</label>` : ""}
        ${runTable(runs, true)}</div>`);
  }
  function runTable(runs, withName) {
    if (!runs.length) return `<p class="s4-hint">沒有紀錄。</p>`;
    const report = r => { const x = S.sent[String(r.id)]; return x ? `<span class="s4-tag good">${x.seen ? "報告已讀" : "報告已發"}</span>` : !r.finished ? `<span class="s4-dash">放棄，不發</span>` : (r.excluded || !r.user_id) ? `<span class="s4-dash">不發</span>` : ""; };
    const can = r => r.finished && !r.excluded && r.user_id && !S.sent[String(r.id)];
    return `<div class="s4-sheet"><table class="s4-table"><thead><tr><th><span class="s4-vh">發報告</span></th><th>時間</th>${withName ? "<th>學生</th>" : ""}<th>模式</th><th>念完</th><th>念對的字</th><th>重講</th><th>結果</th><th>裝置</th><th>報告</th><th></th></tr></thead><tbody>
      ${runs.map(r => `<tr class="${r.excluded ? "off" : ""}"><td>${can(r) ? `<input type="checkbox" data-pick="${r.id}" aria-label="發這一次的報告"${S.pick.has(r.id) ? " checked" : ""}>` : ""}</td><td>${esc(when(r.started_at))}</td>${withName ? `<td>${r.user_id ? `<button type="button" class="s4-link" data-student="${r.user_id}">${esc(r.name || "")}</button>` : esc(r.name || "anonymous")}</td>` : ""}
        <td>${esc(MODE[r.mode] || "–")} <small>${esc(r.level || "")}</small></td><td>${n(r.slides_done)} / 20</td><td>${meter(r.accuracy)}</td><td>${n(r.redo)}</td>
        <td>${r.finished ? `<span class="s4-ok">走到結尾</span>` : `<span class="s4-bad">${esc((r.exit && r.exit.label) || "中途離開")}</span>`}${(r.anomalies || []).map(f => `<span class="s4-tag ${f.kind === "too_good" ? "bad" : "warn"}" title="${esc(f.reason)}">${esc(FLAG[f.code] || f.code)}</span>`).join("")}${r.excluded ? `<span class="s4-tag">${esc(OFF[r.excluded] || r.excluded)}</span>` : ""}</td>
        <td>${r.device && r.device.mobile === true ? "手機平板" : r.device && r.device.mobile === false ? "電腦" : "–"}${r.device && r.device.hq === false ? "<small>低畫質</small>" : ""}</td>
        <td>${report(r)}</td><td><button type="button" class="btn s4-mini" data-run="${r.id}">看這一次</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  // ── 學生 ──
  async function openStudent(id) {
    try {
      const d = await get(`/learning/sdg4/student/${id}`, { from: S.from, to: S.to });
      S.view = "student"; S.studentId = id; S.student = d.student;
      const t = d.totals, tr = d.trend.filter(x => num(x.accuracy) !== null);
      const cmp = d.slides.filter(s => num(s.last) !== null || num(s.best) !== null);
      const weak = d.slides.filter(s => num(s.last) !== null).sort((a, b) => a.last - b.last).slice(0, 3);
      frame(`
        <div class="panel"><h3 class="s4-h">${esc(d.student.name || "")}${d.student.student_no ? ` <span class="s4-no">${esc(d.student.student_no)}</span>` : ""}${d.student.test ? `<span class="s4-tag">測試帳號</span>` : ""}</h3>
          <p class="s4-summary"><span class="s4-tag ${(STATE[d.state] || ["", ""])[1]}">${esc((STATE[d.state] || [d.state])[0])}</span> ${esc(d.state_zh || "")}。${d.best_run ? `代表這位學生的是 ${esc(when(d.best_run.at))} 那一次（念對 ${pct(d.best_run.accuracy)}）。` : "還沒有念完的上台，所以沒有代表的一次。"}</p>
          ${d.anomaly ? `<ul class="s4-anom"><li class="${d.anomaly.too_good ? "bad" : "warn"}"><b>要查看的地方</b><ul>${d.anomaly.reasons.map(w => `<li>${esc(w)}</li>`).join("")}</ul></li></ul>` : ""}
          <div class="s4-kpis">${kpi(n(t.runs), "次上台", `${n(t.finished)} 次走到結尾`)}${kpi(pct(t.accuracy_best), "最好的一次")}${kpi(pct(t.accuracy_last), "最近一次")}${kpi(n(t.redo), "共重講幾張")}${kpi(n(t.minutes), "總分鐘")}${kpi(n(t.left), "次中途離開")}</div></div>
        <div class="s4-two">
          <div class="panel"><h3 class="s4-h">每次上台念對多少</h3>
            ${tr.length ? hbars(tr.slice(-12), { label: x => `${esc(when(x.at).slice(5))} ${esc(MODE[x.mode] || "")}`, value: x => x.accuracy * 100, color: x => tone(x.accuracy), fmt: v => Math.round(v) + "%" }) : `<p class="s4-hint">還沒有語音辨識的紀錄。</p>`}
            ${tr.length >= 2 ? `<p class="s4-say">第一次 ${pct(tr[0].accuracy)}，最近一次 ${pct(tr.at(-1).accuracy)}${tr.at(-1).accuracy > tr[0].accuracy ? "，有進步。" : tr.at(-1).accuracy < tr[0].accuracy ? "，比第一次低。" : "。"}</p>` : ""}</div>
          <div class="panel"><h3 class="s4-h">常沒念對的字</h3>
            ${d.missed_words.length ? `<p class="s4-words">${d.missed_words.slice(0, 24).map(w => `<span>${esc(w.word)}<small>${n(w.n)}</small></span>`).join("")}</p><p class="s4-say">數字是沒被聽到的次數。可以請學生先練這幾個字再上台。</p>` : `<p class="s4-hint">沒有資料。</p>`}</div>
        </div>
        <div class="panel"><h3 class="s4-h">每一張：最近一次和最好的一次</h3>
          ${cmp.length ? slideBars(d.slides.map(s => ({ ...s, part: partOf(s.slide) })), [{ key: "best", color: "#bbf7d0", label: "最好的一次" }, { key: "last", color: "#16a34a", label: "最近一次" }], { max: 1, fmt: v => Math.round(v * 100) + "%" }) : `<p class="s4-hint">沒有語音辨識的資料。</p>`}
          ${weak.length ? `<p class="s4-say">最近一次最弱的是：${weak.map(s => `${slideName(s.slide)}（${pct(s.last)}）`).join("、")}。</p>` : ""}</div>
        <div class="panel"><h3 class="s4-h">每一次上台</h3>${runTable(d.runs, false)}</div>`);
    } catch (e) { toast(e.message); }
  }
  const partOf = no => (no <= 3 ? 1 : no <= 6 ? 2 : no <= 9 ? 3 : no <= 12 ? 4 : no <= 16 ? 5 : 6);

  // ── 單次 ──
  async function openRun(id) {
    try {
      const d = await get(`/learning/sdg4/run/${id}`);
      const r = d.run, a = d.analysis;
      S.view = "run"; S.runId = id;
      if (r.user_id) { S.studentId = r.user_id; S.student = { name: r.name }; } else { S.student = null; }
      const phases = ["load", "intro", "pier", "walk", "backstage", "present", "ending"].map(p => ({ phase: p, zh: { load: "載入場景", intro: "選等級畫面", pier: "碼頭說明", walk: "走去劇場", backstage: "後台地圖與麥克風", present: "上台發表", ending: "結尾畫面" }[p], s: num(a.phases[p]) === null ? null : a.phases[p] / 1000 }));
      const dv = a.device || {};
      frame(`
        <div class="panel"><h3 class="s4-h">${esc(when(r.started_at))}　${esc(MODE[r.mode] || "")} ${esc(r.level || "")}${r.excluded ? `<span class="s4-tag">${esc(OFF[r.excluded] || r.excluded)}（不計入全班）</span>` : ""}</h3>
          <p class="s4-summary">${esc(d.summary)}</p>
          <div class="s4-kpis">${kpi(pct(a.accuracy), "念對的字", a.accuracy === null ? "沒有語音辨識" : `對 ${n(a.hit)} · 錯 ${n(a.miss)}`)}${kpi(`${n(a.slides_done)} / 20`, "念完的張數")}${kpi(n(a.redo), "重講", `聽示範 ${n(a.model)} 次`)}${kpi(n(r.active_minutes), "實際操作分鐘")}
            ${kpi(dv.mobile === true ? "手機平板" : dv.mobile === false ? "電腦" : "–", "裝置", `${dv.hq === false ? "低畫質" : dv.hq === true ? "高畫質" : ""}${num(dv.vw) ? ` · ${n(dv.vw)}×${n(dv.vh)}` : ""}`)}${kpi(num(dv.load_s) === null ? "–" : n(dv.load_s) + " 秒", "場景載入", a.hides ? `離開分頁 ${n(a.hides)} 次` : "")}</div>
          ${(r.anomalies || []).length ? `<ul class="s4-anom">${r.anomalies.map(f => `<li class="${f.kind === "too_good" ? "bad" : "warn"}">${esc(f.reason)}</li>`).join("")}</ul>` : ""}
          ${(r.flags || []).includes("too_fast") ? `<p class="s4-warn">這一次的籌碼要老師確認後才入帳（課程與名單 › 籌碼）。</p>` : ""}
          ${S.sent[String(r.id)] ? `<p class="s4-hint">這一次的報告已經發給學生${S.sent[String(r.id)].seen ? "，學生看過了" : "，學生還沒打開"}。</p>`
            : !a.finished ? `<p class="s4-warn">這一次學生中途離開，不會發報告。建議直接和學生聊聊卡在哪裡；學生之後念完的上台才會有報告。</p>`
            : (r.excluded || !r.user_id) ? "" : `<div class="s4-send"><textarea id="s4NoteOne" rows="2" maxlength="2000" placeholder="想跟學生說的話（可不填）"></textarea><div class="s4-row"><button class="btn btn-primary" type="button" data-send-one="${r.id}">把這一次的報告發給學生</button></div></div>`}</div>
        <div class="panel"><h3 class="s4-h">時間花在哪裡</h3>${phaseBar(phases)}</div>
        <div class="panel"><h3 class="s4-h">每一張投影片</h3>
          ${a.slides.length ? `<div class="s4-sheet"><table class="s4-table"><thead><tr><th>張</th><th>標題</th><th>停留</th><th>念了幾次</th><th>觀眾聽到</th><th>對 / 錯</th><th>沒念對的字</th></tr></thead><tbody>
          ${a.slides.map(s => `<tr class="${s.done ? "" : "off"}"><td><b class="s4-pn" style="background:${PART_COLOR[s.part] || "#64748b"}">${n(s.slide)}</b></td><td>${esc(title(s.slide))}<small>Part ${n(s.part)}</small></td>
            <td>${num(s.dwell_ms) === null ? "–" : Math.round(s.dwell_ms / 1000) + " 秒"}</td><td>${n(s.attempts)}${s.redo ? `<small>重講 ${n(s.redo)}</small>` : ""}${s.model ? `<small>示範 ${n(s.model)}</small>` : ""}</td>
            <td>${s.done ? meter(s.heard) : `<span class="s4-bad">沒有念完</span>`}</td><td>${num(s.hit) === null ? "–" : `${n(s.hit)} / ${n(s.miss)}`}</td><td class="s4-missed">${(s.missed || []).map(esc).join("、")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="s4-hint">這一次還沒走到投影片。</p>`}</div>
        <div class="panel"><details><summary class="s4-h">全部操作紀錄（${d.events.length} 筆）</summary>
          <div class="s4-sheet"><table class="s4-table s4-log"><thead><tr><th>秒</th><th>動作</th><th>內容</th></tr></thead><tbody>${d.events.slice(0, 600).map(e => `<tr><td>${n(e.t)}</td><td>${esc(EVENT[e.type] || e.type)}</td><td>${esc(e.detail || "")}</td></tr>`).join("")}</tbody></table></div></details></div>`);
    } catch (e) { toast(e.message); }
  }

  async function load() {
    const root = $("s4Root"); if (!root) return;
    if (!S.loaded) root.innerHTML = `<div class="panel"><p class="s4-hint">讀取中…</p></div>`;
    try {
      if (!S.loaded) {
        const c = await api.teacher.courses().catch(() => ({ courses: [] }));
        S.courses = c.courses || [];
        // The built site serves the game at /games/…; a local backend serves the source folder at /static/games/….
        for (const base of ["/games", "/static/games"]) {
          try { const m = await import(base + "/innovation-harbor/js/sdg4/talk.js"); m.TALK.stages.forEach(st => st.slides.forEach(s => { S.titles[s.no] = s.title; })); break; } catch (e) { /* titles are a nicety: the page works with numbers only */ }
        }
        S.loaded = true;
      }
      const [rep, watch, sent] = await Promise.all([get("/learning/sdg4/overview", filters()),
        get("/learning/records/watchlist", { course_id: S.courseId, section_id: S.sectionId, from: S.from, to: S.to }).catch(() => null), get("/teacher/reports/sdg4-sent").catch(() => ({ runs: {} }))]);
      S.report = rep; S.watch = watch; S.sent = sent.runs || {};
      showClass();
    } catch (e) {
      root.innerHTML = `<div class="panel"><p class="s4-empty">${esc(e.message)}</p><button class="btn" type="button" id="s4Retry">重新整理</button></div>`;
      $("s4Retry").onclick = () => load();
    }
  }
  window.loadSdg4 = load;
})();
