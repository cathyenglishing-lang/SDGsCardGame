// Teacher dashboard → 系統 › 訪客與潛在客戶 (admins). Data: backend/visits.py (/teacher/visitors).
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const tw = s => (s ? new Date(Date.parse(s) + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ") : "–");
  let days = 30;
  async function load() {
    const box = $("vsBody"); box.innerHTML = `<section class="panel"><p class="vs-hint">讀取中…</p></section>`;
    try {
      const r = await fetch(API() + "/teacher/visitors?days=" + days, { headers: { Authorization: "Bearer " + auth.getToken() } });
      if (!r.ok) throw new Error("讀取失敗，請再試一次。");
      paint(await r.json());
    } catch (e) { box.innerHTML = `<section class="panel"><p class="vs-hint">${esc(e.message)}</p></section>`; }
  }
  const list = (rows, max) => rows.map(([k, v]) => `<div class="vs-bar"><span>${esc(k)}</span><i><b style="width:${(v / max) * 100}%"></b></i><em>${v}</em></div>`).join("") || `<p class="vs-hint">還沒有資料</p>`;
  function paint(d) {
    const maxDay = Math.max(1, ...d.daily.map(x => x.visitors));
    $("vsBody").innerHTML = `
      <section class="panel"><div class="section-h"><h2>訪客與潛在客戶<small>記錄每一次造訪：IP 和大約地區、網路（學校或電信）、從哪裡來、看了什麼、有沒有試玩或成為帳號</small></h2>
        <div class="vs-days">${[7, 30, 90].map(n => `<button type="button" class="${n === days ? "on" : ""}" data-d="${n}">最近 ${n} 天</button>`).join("")}</div></div>
        <div class="vs-tiles"><div><b>${d.visitors}</b><span>不同的訪客</span></div><div><b>${d.views}</b><span>瀏覽次數</span></div><div><b>${d.guest_players}</b><span>用訪客模式試玩</span></div><div><b>${d.became_users}</b><span>有登入的帳號</span></div>
          <div><b>${d.visitors ? Math.round((d.guest_players / d.visitors) * 100) : 0}%</b><span>訪客 → 試玩</span></div></div></section>
      <section class="panel"><h3 class="vs-h">每天的訪客</h3><div class="vs-daily">${d.daily.map(x => `<div title="${esc(x.day)}：${x.visitors} 位（新 ${x.new}）、試玩 ${x.guests}"><i style="height:${(x.visitors / maxDay) * 100}%"><s style="height:${x.visitors ? (x.new / x.visitors) * 100 : 0}%"></s></i><small>${esc(x.day.slice(5))}</small></div>`).join("") || `<p class="vs-hint">還沒有資料（上線後開始累積）</p>`}</div>
        <p class="vs-hint">深色＝第一次來的新訪客。</p></section>
      <div class="vs-grid">
        <section class="panel"><h3 class="vs-h">從哪裡來</h3>${list(d.sources, Math.max(1, ...d.sources.map(x => x[1])))}</section>
        <section class="panel"><h3 class="vs-h">看了哪些頁面</h3>${list(d.pages, Math.max(1, ...d.pages.map(x => x[1])))}</section>
        <section class="panel"><h3 class="vs-h">裝置</h3>${list(d.devices, Math.max(1, ...d.devices.map(x => x[1])))}</section>
        <section class="panel"><h3 class="vs-h">地區（每位訪客算一次）</h3>${list(d.regions || [], Math.max(1, ...(d.regions || []).map(x => x[1])))}</section>
        <section class="panel"><h3 class="vs-h">網路：學校或電信公司</h3>${list(d.orgs || [], Math.max(1, ...(d.orgs || []).map(x => x[1])))}
          <p class="vs-hint">學校自己的網路會直接顯示校名（例如 National Pingtung University）；用手機網路或家裡網路的會顯示電信公司。</p></section>
      </div>
      ${d.geoip ? "" : '<section class="panel"><p class="vs-hint">⚠ 地區資料庫還沒裝好：目前只記 IP，地區和網路是空的。</p></section>'}
      <details class="panel vs-fold"><summary><h3 class="vs-h">沒有帳號的訪客（潛在客戶，看最多頁的在前面）</h3></summary>
        <div class="scrollx"><table class="mini-tbl"><thead><tr><th>第一次來</th><th>最近一次</th><th>瀏覽</th><th>地區</th><th>網路</th><th>IP</th><th>從哪裡來</th><th>試玩</th><th>看最多的頁面</th><th>裝置</th></tr></thead><tbody>
        ${d.prospects.map(p => `<tr><td>${esc(tw(p.first))}</td><td>${esc(tw(p.last))}</td><td>${p.views}</td><td>${esc(p.place || "–")}</td><td>${esc(p.org || "–")}</td><td><code>${esc((p.ips || []).join(", ") || "–")}</code></td><td>${esc(p.source)}</td><td>${p.guest ? "✔" : ""}</td><td><small>${esc((p.pages || []).join("、"))}</small></td><td>${esc(p.device)}</td></tr>`).join("") || `<tr><td colspan="10">還沒有資料</td></tr>`}
        </tbody></table></div><p class="vs-hint">想知道某個推廣管道帶來多少人，分享連結時加上 ?utm_source=名稱（例如 ?utm_source=fb、?utm_source=研討會），這裡就會分開算。</p></details>
      <details class="panel vs-fold"><summary><h3 class="vs-h">最近 200 次造訪（每一次的 IP 和地區）</h3></summary>
        <div class="scrollx"><table class="mini-tbl"><thead><tr><th>時間</th><th>IP</th><th>地區</th><th>網路</th><th>頁面</th><th>從哪裡來</th><th>裝置</th><th></th></tr></thead><tbody>
        ${(d.recent || []).map(r => `<tr><td>${esc(tw(r.at))}</td><td><code>${esc(r.ip || "–")}</code></td><td>${esc(r.place || "–")}</td><td>${esc(r.org || "–")}</td><td>${esc(r.path || "")}</td><td>${esc(r.source || "")}</td><td>${esc(r.device || "")}</td><td>${r.account ? "有帳號" : r.guest ? "試玩" : ""}</td></tr>`).join("") || `<tr><td colspan="8">還沒有資料</td></tr>`}
        </tbody></table></div>
        <button type="button" class="btn" id="vsCsv">⬇ 下載 CSV</button></details>
      <p class="vs-hint">地區是用 IP 推估的大約位置（城市可能不準，國家和學校網路比較準）。只有管理員看得到 IP。${esc(d.geoip_credit || "")}（<a href="https://db-ip.com" target="_blank" rel="noopener">db-ip.com</a>）</p>`;
    const csvBtn = document.getElementById("vsCsv");
    if (csvBtn) csvBtn.onclick = () => {
      const rows = [["時間(台灣)", "IP", "地區", "網路", "頁面", "從哪裡來", "裝置", "帳號/試玩"], ...(d.recent || []).map(r => [tw(r.at), r.ip, r.place, r.org, r.path, r.source, r.device, r.account ? "有帳號" : r.guest ? "試玩" : ""])];
      const csv = "\ufeff" + rows.map(row => row.map(v => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "visitors-" + days + "d.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    document.querySelectorAll("#vsBody [data-d]").forEach(b => b.onclick = () => { days = Number(b.dataset.d); load(); });
  }
  window.loadVisitors = load;
})();
