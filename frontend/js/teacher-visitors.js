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
      <section class="panel"><div class="section-h"><h2>訪客與潛在客戶<small>匿名記錄每一次造訪：從哪裡來、看了什麼、有沒有試玩或成為帳號</small></h2>
        <div class="vs-days">${[7, 30, 90].map(n => `<button type="button" class="${n === days ? "on" : ""}" data-d="${n}">最近 ${n} 天</button>`).join("")}</div></div>
        <div class="vs-tiles"><div><b>${d.visitors}</b><span>不同的訪客</span></div><div><b>${d.views}</b><span>瀏覽次數</span></div><div><b>${d.guest_players}</b><span>用訪客模式試玩</span></div><div><b>${d.became_users}</b><span>有登入的帳號</span></div>
          <div><b>${d.visitors ? Math.round((d.guest_players / d.visitors) * 100) : 0}%</b><span>訪客 → 試玩</span></div></div></section>
      <section class="panel"><h3 class="vs-h">每天的訪客</h3><div class="vs-daily">${d.daily.map(x => `<div title="${esc(x.day)}：${x.visitors} 位（新 ${x.new}）、試玩 ${x.guests}"><i style="height:${(x.visitors / maxDay) * 100}%"><s style="height:${x.visitors ? (x.new / x.visitors) * 100 : 0}%"></s></i><small>${esc(x.day.slice(5))}</small></div>`).join("") || `<p class="vs-hint">還沒有資料（上線後開始累積）</p>`}</div>
        <p class="vs-hint">深色＝第一次來的新訪客。</p></section>
      <div class="vs-grid">
        <section class="panel"><h3 class="vs-h">從哪裡來</h3>${list(d.sources, Math.max(1, ...d.sources.map(x => x[1])))}</section>
        <section class="panel"><h3 class="vs-h">看了哪些頁面</h3>${list(d.pages, Math.max(1, ...d.pages.map(x => x[1])))}</section>
        <section class="panel"><h3 class="vs-h">裝置</h3>${list(d.devices, Math.max(1, ...d.devices.map(x => x[1])))}</section>
      </div>
      <details class="panel vs-fold"><summary><h3 class="vs-h">沒有帳號的訪客（潛在客戶，看最多頁的在前面）</h3></summary>
        <table class="mini-tbl"><thead><tr><th>第一次來</th><th>最近一次</th><th>瀏覽</th><th>從哪裡來</th><th>裝置</th></tr></thead><tbody>
        ${d.prospects.map(p => `<tr><td>${esc(tw(p.first))}</td><td>${esc(tw(p.last))}</td><td>${p.views}</td><td>${esc(p.source)}</td><td>${esc(p.device)}</td></tr>`).join("") || `<tr><td colspan="5">還沒有資料</td></tr>`}
        </tbody></table><p class="vs-hint">想知道某個推廣管道帶來多少人，分享連結時加上 ?utm_source=名稱（例如 ?utm_source=fb、?utm_source=研討會），這裡就會分開算。</p></details>`;
    document.querySelectorAll("#vsBody [data-d]").forEach(b => b.onclick = () => { days = Number(b.dataset.d); load(); });
  }
  window.loadVisitors = load;
})();
