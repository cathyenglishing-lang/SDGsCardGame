// Visitor log (for finding prospective schools / teachers) + the student's "new report" notice.
// Every page view sends: an anonymous visitor id kept in this browser, the page, where the visitor came
// from (referrer, utm_*), whether they are a guest / signed in, and the screen size. No names; the
// server stores a hash of the IP, not the IP. Signed-in pages also link the visitor id to the account,
// so "a visitor who later got an account" can be counted.
(function () {
  const API = String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  let vid = null;
  try { vid = localStorage.getItem("cl_vid"); if (!vid) { vid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); localStorage.setItem("cl_vid", vid); } } catch (e) {}
  const token = (() => { try { return window.auth && auth.getToken && auth.getToken(); } catch (e) { return null; } })();
  const q = new URLSearchParams(location.search);
  const body = { vid, path: location.pathname, ref: document.referrer || "", utm_source: q.get("utm_source") || "", utm_medium: q.get("utm_medium") || "", utm_campaign: q.get("utm_campaign") || "",
    guest: q.get("guest") === "1" || (() => { try { return localStorage.getItem("cardlearn_guest") === "1"; } catch (e) { return false; } })(), screen: `${screen.width}x${screen.height}`, lang: navigator.language || "" };
  try { fetch(API + "/visit", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body), keepalive: true }).catch(() => {}); } catch (e) {}

  // A student who has a new report from the teacher sees a card in the corner (checked every minute).
  if (!token || /my_report\.html$/.test(location.pathname)) return;
  async function check() {
    try {
      const r = await fetch(API + "/me/reports", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) return;
      const d = await r.json();
      const old = document.getElementById("clReportNote");
      if (!d.unseen) { if (old) old.remove(); return; }
      if (old) return;
      const a = document.createElement("a");
      a.id = "clReportNote"; a.href = "/pages/my_report.html?id=" + d.reports.find(x => !x.seen_at).id;
      a.innerHTML = `<span style="font-size:26px">📨</span><span><b style="display:block">老師傳了學習報告給你</b><small>點這裡打開${d.unseen > 1 ? `（${d.unseen} 份新的）` : ""}</small></span>`;
      a.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:16px;background:linear-gradient(135deg,#9d7bff,#6366f1);color:#fff;text-decoration:none;font-family:inherit;box-shadow:0 14px 34px rgba(76,29,149,.45);transform:translateY(20px);opacity:0;transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s";
      document.body.appendChild(a);
      requestAnimationFrame(() => { a.style.transform = "none"; a.style.opacity = "1"; });
    } catch (e) {}
  }
  check(); setInterval(check, 60000);
})();
