// Teacher dashboard → 系統 › 系統資源 (admins): what the server went through, minute by minute.
// Data: backend/metrics.py (/teacher/metrics, /teacher/metrics.csv). One row a minute is stored for good,
// so any past day (e.g. a class day) can be looked at again and downloaded as CSV for a report.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const head = () => ({ Authorization: "Bearer " + auth.getToken() });
  const tw = d => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);   // a Date → Taiwan date "YYYY-MM-DD"
  const today = () => tw(new Date());
  const shift = (day, n) => tw(new Date(Date.parse(day + "T12:00:00+08:00") + n * 86400e3));
  const S = { from: today(), to: today(), source: "", data: null };
  const fmt = (v, d = 0) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("zh-TW", { maximumFractionDigits: d }));
  const hhmm = ms => { const d = new Date(ms + 8 * 3600e3); return d.toISOString().slice(11, 16); };
  const mdhm = ms => { const d = new Date(ms + 8 * 3600e3); return d.toISOString().slice(5, 16).replace("T", " "); };

  async function get(path, params) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    const r = await fetch(API() + path + "?" + q, { headers: head() });
    if (!r.ok) { const d = (await r.json().catch(() => ({}))).detail; throw new Error(typeof d === "string" ? d : "讀取失敗，請再試一次。"); }
    return r;
  }

  function shell() {
    const presets = [["今天", today(), today()], ["昨天", shift(today(), -1), shift(today(), -1)], ["最近 7 天", shift(today(), -6), today()], ["11/18 上課日", "2026-11-18", "2026-11-18"], ["11/23 上課日", "2026-11-23", "2026-11-23"]];
    $("rsBody").innerHTML = `
      <section class="panel">
        <div class="section-h"><h2>系統資源<small>每分鐘一筆，永久保存</small></h2><div class="row"><button class="btn" type="button" id="rsReload">↻ 重新整理</button><button class="btn" type="button" id="rsCsv">⬇ 下載 CSV（每分鐘）</button></div></div>
        <div class="rs-row">
          <div class="rs-chips">${presets.map(([l, a, b]) => `<button type="button" class="rs-chip ${S.from === a && S.to === b ? "on" : ""}" data-a="${a}" data-b="${b}">${l}</button>`).join("")}</div>
          <label>從 <input type="date" id="rsFrom" value="${S.from}"></label><label>到 <input type="date" id="rsTo" value="${S.to}"></label>
          <label>伺服器 <select id="rsSource"></select></label>
        </div>
        <p class="rs-hint" id="rsNote"></p>
      </section>
      <div id="rsView"><section class="panel"><p class="rs-hint">讀取中…</p></section></div>`;
    document.querySelectorAll("#rsBody .rs-chip").forEach(b => b.onclick = () => { S.from = b.dataset.a; S.to = b.dataset.b; shell(); load(); });
    $("rsFrom").onchange = e => { S.from = e.target.value; shell(); load(); };
    $("rsTo").onchange = e => { S.to = e.target.value; shell(); load(); };
    $("rsReload").onclick = () => load();
    $("rsCsv").onclick = () => csv($("rsCsv"));
  }

  async function load() {
    const view = $("rsView");
    view.classList.add("rs-loading");
    try {
      const d = await (await get("/teacher/metrics", { from: S.from, to: S.to, source: S.source })).json();
      S.data = d; S.source = d.source;
      $("rsSource").innerHTML = d.sources.map(s => `<option value="${esc(s)}" ${s === d.source ? "selected" : ""}>${esc(s === "vm" ? "實驗室 VM（正式站）" : s === "railway" ? "Railway（雲端備援）" : s)}</option>`).join("");
      $("rsSource").onchange = e => { S.source = e.target.value; load(); };
      paint(d);
    } catch (e) { view.innerHTML = `<section class="panel"><p class="rs-hint bad">${esc(e.message)}</p></section>`; }
    finally { view.classList.remove("rs-loading"); }
  }

  function tile(v, label, warn) { return `<div class="rs-tile ${warn ? "warn" : ""}"><b>${v}</b><span>${esc(label)}</span></div>`; }

  function paint(d) {
    const s = d.summary, pts = d.points.map(p => ({ ...p, t: Date.parse(p.ts) }));
    $("rsNote").textContent = s.minutes
      ? `${d.from === d.to ? d.from : d.from + " 到 " + d.to}：記到 ${fmt(s.minutes)} 分鐘（${s.first ? mdhm(Date.parse(s.first)) : ""} – ${s.last ? mdhm(Date.parse(s.last)) : ""}），圖上每點 ${d.step} 分鐘。`
      : "這段期間沒有紀錄。紀錄從 2026-11-09 開始。";
    const memPct = s.peak_mem_mb && s.mem_total_mb ? Math.round(s.peak_mem_mb / s.mem_total_mb * 100) : null;
    const diskLeft = s.disk_total_gb != null && s.disk_used_gb != null ? (s.disk_total_gb - s.disk_used_gb) : null;
    const top = Object.entries(s.groups || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const GN = { learning: "學習紀錄", auth: "登入", content: "教材", game: "成績", teacher: "老師後台", me: "錄音", pages: "網頁", static: "網頁檔案", games: "3D 遊戲", health: "健康檢查", other: "其他" };
    $("rsView").innerHTML = `
      <section class="panel"><div class="rs-tiles">
        ${tile(fmt(s.peak_users), "同時在線（尖峰，每分鐘不同帳號）")}${tile(fmt(s.peak_devices), "同時連線裝置（尖峰）")}
        ${tile(fmt(s.requests), "請求總數")}${tile(fmt(s.peak_requests), "每分鐘請求（尖峰）")}
        ${tile(s.peak_p95_ms == null ? "–" : fmt(s.peak_p95_ms) + " ms", "最慢的回應（95%）", s.peak_p95_ms >= 2000)}
        ${tile(fmt(s.errors_5xx), "伺服器錯誤 5xx", s.errors_5xx > 0)}${tile(fmt(s.limited_429), "被流量限制擋下 429", s.limited_429 > 0)}
        ${tile(s.peak_cpu == null ? "–" : fmt(s.peak_cpu, 1) + "%", "CPU（尖峰）", s.peak_cpu >= 85)}
        ${tile(memPct == null ? "–" : memPct + "%", `記憶體（尖峰 ${fmt(s.peak_mem_mb)} / ${fmt(s.mem_total_mb)} MB）`, memPct >= 90)}
        ${tile(diskLeft == null ? "–" : fmt(diskLeft, 1) + " GB", "硬碟剩餘", diskLeft != null && diskLeft < 5)}
        ${tile(s.db_size_mb == null ? "–" : fmt(s.db_size_mb, 1) + " MB", "資料庫大小")}${tile(s.audio_mb == null ? "–" : fmt(s.audio_mb, 1) + " MB", "錄音檔")}
      </div>
      ${top.length ? `<p class="rs-hint">請求最多的是：${top.map(([g, v]) => `${esc(GN[g] || g)} ${fmt(v)}`).join("、")}</p>` : ""}</section>
      <div class="rs-grid">
        ${card("在線人數", "每分鐘有送出請求的不同帳號與裝置", "rsUsers")}
        ${card("每分鐘請求數", "紅色是錯誤（5xx）與被擋（429）", "rsReq")}
        ${card("回應時間", "毫秒；95% 的請求比這條線快", "rsLat")}
        ${card("CPU 與負載", "CPU %（4 核合計）與 1 分鐘平均負載", "rsCpu")}
        ${card("記憶體", "MB；整台機器已用與這個網站自己用的", "rsMem")}
        ${card("網路流量", "KB／分鐘，網站收到與送出的", "rsNet")}
      </div>`;
    const X = pts.map(p => p.t), gap = d.step * 60e3 * 2.5;
    chart("rsUsers", X, gap, [{ name: "帳號", c: "#2563eb", v: pts.map(p => p.users) }, { name: "裝置", c: "#94a3b8", v: pts.map(p => p.devices) }], "");
    chart("rsReq", X, gap, [{ name: "請求", c: "#0d9488", v: pts.map(p => p.requests) }, { name: "錯誤＋被擋", c: "#dc2626", v: pts.map(p => (p.s5xx || 0) + (p.s429 || 0)) }], "");
    chart("rsLat", X, gap, [{ name: "95%", c: "#7c3aed", v: pts.map(p => p.lat_p95_ms) }, { name: "平均", c: "#a78bfa", v: pts.map(p => p.lat_avg_ms) }], " ms");
    chart("rsCpu", X, gap, [{ name: "CPU %", c: "#ea580c", v: pts.map(p => p.cpu_pct) }, { name: "負載", c: "#fbbf24", v: pts.map(p => p.load1), right: true }], "%", 100);
    chart("rsMem", X, gap, [{ name: "整台已用", c: "#0891b2", v: pts.map(p => p.mem_used_mb) }, { name: "網站", c: "#22c55e", v: pts.map(p => p.app_mem_mb) }], " MB", (s.mem_total_mb || null));
    chart("rsNet", X, gap, [{ name: "收到", c: "#2563eb", v: pts.map(p => p.net_rx_kb) }, { name: "送出", c: "#16a34a", v: pts.map(p => p.net_tx_kb) }], " KB");
  }
  const card = (title, sub, id) => `<section class="panel rs-card"><h3>${title}</h3><p class="rs-hint">${sub}</p><div class="rs-chart" id="${id}"></div></section>`;

  // A small line chart with a hover readout. Lines break where minutes are missing (server down or not yet recording).
  function chart(id, X, gap, series, unit, fixedMax) {
    const el = $(id); if (!el) return;
    if (!X.length) { el.innerHTML = `<p class="rs-hint">沒有資料</p>`; return; }
    const W = 640, H = 200, L = 46, R = 12, T = 10, B = 26;
    const x0 = X[0], x1 = Math.max(X[X.length - 1], x0 + 60e3);
    const left = series.filter(s => !s.right), right = series.filter(s => s.right);
    const maxOf = list => { const m = Math.max(0, ...list.flatMap(s => s.v.filter(v => v != null))); return m > 0 ? m * 1.1 : 1; };
    const yMax = fixedMax || maxOf(left), y2Max = right.length ? maxOf(right) : 1;
    const px = t => L + (t - x0) / (x1 - x0) * (W - L - R);
    const py = (v, m) => T + (1 - v / m) * (H - T - B);
    const path = s => { let d = "", prev = null; s.v.forEach((v, i) => { if (v == null) { prev = null; return; } const cmd = prev !== null && X[i] - X[prev] <= gap ? "L" : "M"; d += `${cmd}${px(X[i]).toFixed(1)},${py(v, s.right ? y2Max : yMax).toFixed(1)}`; prev = i; }); return d; };
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: T + (1 - f) * (H - T - B), v: yMax * f }));
    const span = x1 - x0, nx = 6, xt = Array.from({ length: nx + 1 }, (_, i) => x0 + span * i / nx);
    const lab = t => (span > 36 * 3600e3 ? mdhm(t) : hhmm(t));
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="rs-svg" role="img" aria-label="${esc(series.map(s => s.name).join("、"))}">
      ${ticks.map(k => `<line x1="${L}" x2="${W - R}" y1="${k.y}" y2="${k.y}" class="rs-grid-l"/><text x="${L - 6}" y="${k.y + 4}" class="rs-ax" text-anchor="end">${fmt(k.v, k.v < 10 ? 1 : 0)}</text>`).join("")}
      ${xt.map(t => `<text x="${px(t)}" y="${H - 6}" class="rs-ax" text-anchor="middle">${lab(t)}</text>`).join("")}
      ${series.map(s => `<path d="${path(s)}" fill="none" stroke="${s.c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.right ? ' stroke-dasharray="5 4"' : ""}/>`).join("")}
      <line class="rs-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="rs-hit"/>
    </svg>
    <div class="rs-legend">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.name)}</span>`).join("")}</div>
    <div class="rs-tip" hidden></div>`;
    const svg = el.querySelector("svg"), cross = el.querySelector(".rs-cross"), tip = el.querySelector(".rs-tip");
    const move = ev => {
      const box = svg.getBoundingClientRect(), sx = (ev.clientX - box.left) / box.width * W;
      const t = x0 + (sx - L) / (W - L - R) * (x1 - x0);
      let i = 0, best = Infinity; X.forEach((x, k) => { const d = Math.abs(x - t); if (d < best) { best = d; i = k; } });
      cross.setAttribute("x1", px(X[i])); cross.setAttribute("x2", px(X[i])); cross.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = `<b>${mdhm(X[i])}</b>${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.name)} ${fmt(s.v[i], 1)}${s.right ? "" : unit}</span>`).join("")}`;
      const rel = (px(X[i]) / W) * box.width;
      tip.style.left = Math.min(Math.max(rel + 12, 0), box.width - 170) + "px";
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  }

  async function csv(btn) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = "準備檔案中…";
    try {
      const r = await get("/teacher/metrics.csv", { from: S.from, to: S.to, source: S.source });
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob());
      a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "system-metrics.csv";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) { (window.teacherToast || alert)(e.message); }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  window.loadResources = () => { shell(); load(); };
})();
