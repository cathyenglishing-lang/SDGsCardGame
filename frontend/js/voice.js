// Sending a student's voice recording to the teacher. Shared by the card game and the 3D games.
//   const ok = await CardLearnVoice.send(blob, { game, topic_id, level, label, script_text, seconds, … })
//     → { ok: true, id } | { ok: false, reason: "guest" | "login" | "declined" | "offline" | "too-large" | "error", message }
// Consent: the school holds a signed paper consent, so by default nothing is asked here. Only when
// the server says consent is required (AUDIO_REQUIRE_CONSENT) is the student asked once, in plain words.
// Guests and signed-out players cannot send. Backend: backend/recordings.py.
(function () {
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const session = () => { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch (e) { return null; } };
  const token = () => { const s = session(); return s && s.user && s.user.role !== "guest" ? (s.access_token || "") : ""; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  let consent = null;   // { audio, research, retention_days } once known
  let consentStatus = 0; // HTTP status of the last failed try
  const EXPIRED = { ok: false, reason: "login", message: "登入已過期，重新登入後再送。" };

  async function call(path, options = {}) {
    const r = await fetch(API() + path, { ...options, headers: { ...(options.headers || {}), Authorization: "Bearer " + token() } });
    let data = null; try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, data };
  }
  async function loadConsent() {
    if (consent || !token()) return consent;
    consentStatus = 0;
    try { const r = await call("/me/consent"); if (r.ok) consent = r.data; else consentStatus = r.status; } catch (e) {}
    return consent;
  }

  // The notice, in plain words (design §"錄音上傳的同意與隱私"). Resolves true when the student agrees.
  function ask(days) {
    return new Promise(resolve => {
      const wrap = document.createElement("div");
      wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-label", "把錄音送給老師");
      wrap.style.cssText = "position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:16px;background:rgba(2,6,23,.8);font-family:Arial,'Microsoft JhengHei','PingFang TC',sans-serif";
      wrap.innerHTML = `
        <div style="width:min(480px,100%);max-height:92vh;overflow:auto;background:#fff;color:#0f172a;border-radius:20px;padding:22px 22px 18px;line-height:1.6;text-align:left">
          <h2 style="margin:0 0 8px;font-size:20px">把錄音送給老師</h2>
          <ul style="margin:0 0 12px;padding-left:20px;font-size:14.5px;color:#334155">
            <li>只有老師和平台管理員聽得到，不會公開，也不會拿去訓練 AI。</li>
            <li>保存 ${days} 天後自動刪除；你可以隨時請老師刪掉。</li>
            <li>不送出也可以完成遊戲，成績不受影響。</li>
            <li>如果畫面顯示「機器聽到的字」，那是瀏覽器把聲音送到 Google 辨識的結果。</li>
          </ul>
          <p style="margin:0 0 14px;font-size:13px;color:#64748b">Only your teacher can listen. Recordings are deleted after ${days} days. You can finish the game without sending.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
            <button type="button" data-a="no" style="border:0;border-radius:12px;padding:12px 16px;min-height:44px;font-weight:800;font-size:15px;background:#eef2f7;color:#0f172a;cursor:pointer">先不要</button>
            <button type="button" data-a="yes" style="border:0;border-radius:12px;padding:12px 18px;min-height:44px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(135deg,#2563eb,#0ea5e9);cursor:pointer">同意，以後都送出給老師</button>
          </div>
        </div>`;
      const done = v => { wrap.remove(); resolve(v); };
      wrap.querySelector('[data-a="yes"]').onclick = () => done(true);
      wrap.querySelector('[data-a="no"]').onclick = () => done(false);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-a="yes"]').focus();
    });
  }

  const Voice = {
    canSend: () => !!token() && !!API(),
    // Bit rate for speech: clear enough to mark pronunciation, small enough to keep (30 s ≈ 120 KB).
    recorderOptions: { audioBitsPerSecond: 32000 },
    async consent() { return loadConsent(); },
    async send(blob, meta = {}) {
      if (!Voice.canSend()) return { ok: false, reason: "guest", message: "登入後才能把錄音送給老師。" };
      if (!blob || !blob.size) return { ok: false, reason: "error", message: "沒有錄到聲音。" };
      const c = await loadConsent();
      if (!c && (consentStatus === 401 || consentStatus === 403)) return EXPIRED;
      if (!c) return { ok: false, reason: "offline", message: "現在連不上伺服器，錄音還沒送出。" };
      if (c.required && c.audio !== true) {
        if (!(await ask(c.retention_days || 150))) return { ok: false, reason: "declined", message: "沒有送出。錄音只留在這台裝置。" };
        try { const r = await call("/me/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: true }) }); if (r.ok) consent = r.data; else throw 0; }
        catch (e) { return { ok: false, reason: "offline", message: "現在連不上伺服器，錄音還沒送出。" }; }
      }
      const form = new FormData();
      const type = (blob.type || "audio/webm").split(";")[0];
      form.append("file", blob, "clip." + ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg" }[type] || "webm"));
      form.append("client_id", meta.client_id || newId());
      for (const k of ["game", "topic_id", "level", "label", "script_text", "run_id", "course_id", "content_version", "seconds", "target_seconds", "wpm", "heard_ratio"]) {
        if (meta[k] !== undefined && meta[k] !== null && meta[k] !== "") form.append(k, String(meta[k]));
      }
      try {
        const r = await call("/me/recordings", { method: "POST", body: form });
        if (r.ok) return { ok: true, id: r.data.id };
        if (r.status === 401) return EXPIRED;
        if (r.status === 413) return { ok: false, reason: "too-large", message: "錄音太長了，請錄短一點再送。" };
        return { ok: false, reason: "error", message: (r.data && r.data.detail) || "沒有送出，請再試一次。" };
      } catch (e) { return { ok: false, reason: "offline", message: "現在連不上網路，錄音還沒送出。連上後請再按一次送出。" }; }
    },
    // Passages of one topic the teacher wants read again: the newest recording of a passage is marked "redo".
    // → [{ label, level, teacher_note }]
    // Everything this student has sent for one topic, newest first (status and the teacher's note included).
    async history(topic_id, game = "pecha_kucha") {
      if (!Voice.canSend()) return [];
      try { const r = await call("/me/recordings?game=" + encodeURIComponent(game) + "&topic_id=" + encodeURIComponent(topic_id)); return r.ok ? r.data.recordings : []; } catch (e) { return []; }
    },
    requests(list) {
      const newest = new Map();
      for (const x of list) if (x.label && !newest.has(x.label)) newest.set(x.label, x);
      return [...newest.values()].filter(x => x.status === "redo");
    },
    // What the teacher said about earlier recordings of the same passage (newest first).
    async feedback(label) {
      if (!Voice.canSend()) return [];
      try { const r = await call("/me/recordings?label=" + encodeURIComponent(label)); return r.ok ? r.data.recordings.filter(x => x.teacher_note || x.status === "redo") : []; } catch (e) { return []; }
    },
  };
  window.CardLearnVoice = Voice;
})();
