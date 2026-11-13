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
  const EXPIRED = { ok: false, reason: "login", message: "You are signed out. Sign in again, then send." };

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
      wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-label", "Send your recording to your teacher");
      wrap.style.cssText = "position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:16px;background:rgba(2,6,23,.8);font-family:Arial,'Microsoft JhengHei','PingFang TC',sans-serif";
      wrap.innerHTML = `
        <div style="width:min(480px,100%);max-height:92vh;overflow:auto;background:#fff;color:#0f172a;border-radius:20px;padding:22px 22px 18px;line-height:1.6;text-align:left">
          <h2 style="margin:0 0 8px;font-size:20px">Send your recording to your teacher</h2>
          <ul style="margin:0 0 12px;padding-left:20px;font-size:14.5px;color:#334155">
            <li>Only your teacher and the platform administrators can listen. It is never made public and never used to train AI.</li>
            <li>It is deleted automatically after ${days} days, and you can ask your teacher to delete it at any time.</li>
            <li>You can finish the game without sending it. Your result does not change.</li>
            <li>If the page shows “what the computer heard”, that comes from the browser sending the sound to Google for recognition.</li>
          </ul>
          <p style="margin:0 0 14px;font-size:13px;color:#64748b">Only your teacher can listen. Recordings are deleted after ${days} days. You can finish the game without sending.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
            <button type="button" data-a="no" style="border:0;border-radius:12px;padding:12px 16px;min-height:44px;font-weight:800;font-size:15px;background:#eef2f7;color:#0f172a;cursor:pointer">Not now</button>
            <button type="button" data-a="yes" style="border:0;border-radius:12px;padding:12px 18px;min-height:44px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(135deg,#2563eb,#0ea5e9);cursor:pointer">I agree: send my recordings to my teacher</button>
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
      if (!Voice.canSend()) return { ok: false, reason: "guest", message: "Sign in to send recordings to your teacher." };
      if (!blob || !blob.size) return { ok: false, reason: "error", message: "Nothing was recorded." };
      const c = await loadConsent();
      if (!c && (consentStatus === 401 || consentStatus === 403)) return EXPIRED;
      if (!c) return { ok: false, reason: "offline", message: "The server cannot be reached. The recording has not been sent." };
      if (c.required && c.audio !== true) {
        if (!(await ask(c.retention_days || 150))) return { ok: false, reason: "declined", message: "Not sent. The recording stays on this device." };
        try { const r = await call("/me/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: true }) }); if (r.ok) consent = r.data; else throw 0; }
        catch (e) { return { ok: false, reason: "offline", message: "The server cannot be reached. The recording has not been sent." }; }
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
        if (r.status === 413) return { ok: false, reason: "too-large", message: "The recording is too long. Please record a shorter one." };
        return { ok: false, reason: "error", message: (r.data && r.data.detail) || "Not sent. Please try again." };
      } catch (e) { return { ok: false, reason: "offline", message: "You are offline. The recording has not been sent. Press send again when you are online." }; }
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
