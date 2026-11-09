// Teacher dashboard → 帳號管理: 異常帳號 on top. Data: backend/metrics.py (/teacher/user-anomalies).
// An account is listed when it hits the site much harder than people do (requests in one minute, a day),
// is stopped by the rate limit, or its password keeps being typed wrong; each comes with the reasons.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  let days = 7;
  async function load() {
    const box = $("uaWatch"); if (!box) return;
    box.innerHTML = `<p class="ua-hint">讀取中…</p>`;
    try {
      const r = await fetch(API() + "/teacher/user-anomalies?days=" + days, { headers: { Authorization: "Bearer " + auth.getToken() } });
      if (!r.ok) throw new Error("讀取失敗，請再試一次。");
      paint(await r.json());
    } catch (e) { box.innerHTML = `<p class="ua-hint bad">${esc(e.message)}</p>`; }
  }
  function paint(d) {
    const box = $("uaWatch");
    const bar = (v, max) => `<span class="ua-bar"><i style="width:${Math.min(100, (v / Math.max(1, max)) * 100)}%"></i></span>`;
    const maxReq = Math.max(1, ...d.busiest.map(u => u.requests));
    box.innerHTML = `
      <div class="ua-head"><h3>異常帳號</h3>
        <div class="ua-days">${[1, 7, 30].map(n => `<button type="button" class="ua-day ${n === days ? "on" : ""}" data-days="${n}">${n === 1 ? "今天" : "最近 " + n + " 天"}</button>`).join("")}</div></div>
      ${d.accounts.length ? `<div class="ua-list">${d.accounts.map(a => `<article class="ua-card ${a.severity}">
          <header><span class="ua-tag ${a.severity}">${a.severity === "high" ? "優先查看" : "留意"}</span><b>${esc(a.section || "")} ${esc(a.name || a.email)}</b><small>${esc(a.student_no || a.email || "")}</small></header>
          <ul>${a.reasons.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          ${a.days.length ? `<details><summary>每天的紀錄</summary><table class="mini-tbl"><thead><tr><th>日期</th><th>請求</th><th>最忙的一分鐘</th><th>被擋</th></tr></thead><tbody>${a.days.map(x => `<tr><td>${esc(x.day)}</td><td>${x.requests}</td><td>${x.peak_per_min}</td><td>${x.limited_429 || "–"}</td></tr>`).join("")}</tbody></table></details>` : ""}
        </article>`).join("")}</div>`
        : `<p class="ua-ok">✓ ${days === 1 ? "今天" : "最近 " + days + " 天"}沒有發現異常帳號${d.typical_peak_per_min ? `（一般學生最忙的一分鐘約 ${d.typical_peak_per_min} 次請求）` : ""}。</p>`}
      ${d.ips.length || d.unknown_emails.length ? `<div class="ua-warn"><b>可能有人在猜密碼</b>
        ${d.ips.length ? `<p>這些地方登入失敗很多次：${d.ips.map(x => `${esc(x.ip)}（${x.failures} 次、${x.accounts} 個帳號）`).join("、")}</p>` : ""}
        ${d.unknown_emails.length ? `<p>有人一直用不存在的帳號登入：${d.unknown_emails.map(x => `${esc(x.email)}（${x.failures} 次）`).join("、")}</p>` : ""}</div>` : ""}
      <details class="ua-more"><summary>請求最多的帳號（前 ${d.busiest.length} 名）· 登入失敗共 ${d.failed_logins} 次</summary>
        <table class="mini-tbl"><thead><tr><th>帳號</th><th>系級</th><th>身分</th><th>請求</th><th></th><th>最忙的一分鐘</th><th>被擋</th></tr></thead><tbody>
        ${d.busiest.map(u => `<tr><td>${esc(u.name || "")}<small class="ua-sub">${esc(u.email || "")}</small></td><td>${esc(u.section || "")}</td><td>${esc(u.role || "")}</td><td>${u.requests}</td><td>${bar(u.requests, maxReq)}</td><td>${u.peak_per_min}</td><td>${u.limited_429 || "–"}</td></tr>`).join("") || `<tr><td colspan="7">還沒有紀錄（上線後開始累積）。</td></tr>`}
        </tbody></table></details>`;
    box.querySelectorAll("[data-days]").forEach(b => b.onclick = () => { days = Number(b.dataset.days); load(); });
  }
  window.loadAccountWatch = load;
})();
