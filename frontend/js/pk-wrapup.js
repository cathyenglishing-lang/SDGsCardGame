// Wrap-up of a Pecha Kucha Card Game run — short on purpose (teacher, 2026-11-09: after the cards the
// student reads aloud; the ending must not be long or painful, and it must review the learning).
// Three steps, about two minutes:
//   1 done   the score, the six parts, and the sentences missed on the first try, each with the
//            slide it belongs to and where the student put it (tap to hear it again) — no re-matching
//   2 read   read ONE slide aloud (about 20 s, a Pecha Kucha slide): the sentence the student missed
//            most, or an assigned one when nothing was missed. Each take goes to the teacher at once.
//   3 next   chips, personal best, when to come back; the review list is folded away
// Optional extras on the last step, never in the way: a five-question listening quiz, one reflection.
// Inside the 3D game only step 1 is shown, then the student goes back.
// Every answer is logged through ctx.log (frontend/js/pk-telemetry.js); guests log and send nothing.
// Not here any more: the per-part confidence rating and the re-matching of missed sentences
// (owner, 2026-11-09: 「自評信心先不要」; the teacher asked for a short ending).
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = sec => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // What each of the six parts does in the talk (20-slide talks and the 12-slide SDG 9 talks).
  const PART_ROLE = {
    20: ["Opening: the topic and the question", "Problem: what is going wrong", "Achievements: what has been done", "Solutions: what can be done", "Impact: why it matters", "Conclusion: a call to action"],
    12: ["Opening: the SDG and the topic", "Problem: from a student's situation", "Explanation: the science behind it", "Impact: what it leads to", "Strategy: how to respond", "Conclusion: summary and mission"],
  };
  const PART_EN = {
    20: ["Introduction", "Problem", "Achievements", "Solutions", "Implications", "Call to action"],
    12: ["Hook", "Problem", "Explain", "Impact", "Strategy", "Conclusion"],
  };
  const partRole = (n, total) => (PART_ROLE[total] || PART_ROLE[20])[n - 1] || "";
  const partEn = (n, total) => (PART_EN[total] || PART_EN[20])[n - 1] || `Part ${n}`;

  // Read-aloud speed used for the target time of a slide (words per second).
  const WPS = { A1: 1.5, A2: 1.6, B1: 1.9, B2: 2.1 };
  const STOP = new Set("because however therefore although through without between another together different important everyone something sometimes students student people really always should could would their there these those about which while where being having before after other every still today taiwan".split(" "));

  // The key word of a slide for the optional quiz: the longest ordinary word of its script.
  // (The question bank has no English key words yet; when it does, they take over here.)
  function keyword(script) {
    const words = String(script).match(/[A-Za-z][A-Za-z'-]*/g) || [];
    let best = "";
    words.forEach((w, i) => {
      const lw = w.toLowerCase();
      const startsSentence = i === 0 || /[.!?]\s*$/.test(String(script).slice(0, String(script).indexOf(w)));
      if (lw.length < 6 || STOP.has(lw) || (/^[A-Z]/.test(w) && !startsSentence)) return;
      if (lw.length > best.length) best = w;
    });
    return best || words.sort((a, b) => b.length - a.length)[0] || "";
  }
  function hashIndex(str, n) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return n ? Math.abs(h) % n : 0; }

  const REFLECT = [
    { facet: "planning", q: "Before listening, did you think about what this part might say?", a: ["Yes: I read the title cards and guessed", "A little: I started guessing halfway", "No: I just listened", "I did not know I could do that"] },
    { facet: "problem-solving", q: "What do you do when you hear a word you do not know?", a: ["Guess from the words around it", "Skip it and hold on to what I understand", "Press repeat and listen again", "I get stuck"] },
    { facet: "attention", q: "What do you do when you lose focus or cannot keep up?", a: ["Bring my attention back quickly", "Listen again", "Place the card first and see", "I am not sure whether I lost focus"] },
    { facet: "translation", q: "When you hear an English sentence, do you translate it into Chinese in your head?", a: ["Almost every sentence", "Only the key words", "Rarely: I understand it directly", "I never noticed"] },
    { facet: "person", q: "Compared with when you started, how do you feel about listening to English talks now?", a: ["More confident", "About the same", "Still very hard", "It depends on the topic"] },
  ];
  const MAX_TAKES = 3;

  let ctx = null, host = null, steps = [], at = 0, S = null, unsub = null, shownStep = "";

  function open(context) {
    ctx = context; host = ctx.host;
    S = {
      started: performance.now(), quiz: null, read: null, reflect: null, server: null, closing: false, reviewLogged: false, doneLogged: false,
      wrong: ctx.summary.cards.filter(c => c.first === false).sort((a, b) => b.attempts - a.attempts),
    };
    steps = ctx.embed ? ["done"] : ["done", "read", "next"];
    at = 0; shownStep = "";
    // Has the teacher asked for a passage of this topic to be read again? Then that is the one to read.
    const mine = S;
    // Fetched now, while the student looks at step 1, so step 2 is complete when it appears and
    // nothing jumps under the finger later.
    // If the student gets to step 2 before the answer, step 2 waits for it (2.5 s at most): a slow
    // network must not make the teacher's "請重錄" disappear.
    S.histDone = !(!ctx.embed && ctx.voice && ctx.voice.canSend());
    if (!S.histDone) ctx.voice.history(ctx.topic.id).then(list => {
      if (S !== mine || S.read) return;
      S.voiceHistory = list;
      S.redo = ctx.voice.requests(list).find(x => x.level === ctx.level && slideOf(+String(x.label).split("/s").pop())) || null;
    }).catch(() => {}).then(() => { if (S === mine) { S.histDone = true; if (S.histWait) S.histWait(); } });
    ctx.log("wrap.start", { steps, embed: !!ctx.embed, wrong: S.wrong.map(c => c.id) });
    if (unsub) unsub();
    unsub = ctx.onChange(() => { paintSave(); lateAnswer(); });
    host.classList.remove("hidden");
    render();
  }
  function close() {
    if (unsub) { unsub(); unsub = null; }
    stopRecording(true);
    if (S && S.read && S.read.url) { try { URL.revokeObjectURL(S.read.url); } catch (e) {} }
    if (host) { host.classList.add("hidden"); host.innerHTML = ""; }
    ctx = null;
  }
  function go(delta = 1) {
    ctx.stopSpeak();
    at = Math.min(steps.length - 1, at + delta);
    render();
    host.scrollTop = 0; window.scrollTo(0, 0);
  }
  function shell(title, sub, body, foot) {
    const dots = steps.length > 1 ? steps.map((s, i) => `<span class="pkw-dot ${i < at ? "done" : i === at ? "now" : ""}"></span>`).join("") : "";
    host.innerHTML = `
      <div class="pkw-card" role="dialog" aria-label="${esc(title)}">
        <div class="pkw-top"><div class="pkw-dots" aria-label="Step ${at + 1} of ${steps.length}">${dots}</div><span class="pkw-save" id="pkwSave"></span></div>
        <h2 class="pkw-title">${title}</h2>
        ${sub ? `<p class="pkw-sub">${sub}</p>` : ""}
        <div class="pkw-body">${body}</div>
        <div class="pkw-foot">${foot || ""}</div>
      </div>`;
    // A new screen takes no clicks for a moment: the second click of a double click would otherwise
    // press whatever button now sits where the old one was. The keyboard is not held back.
    // Only when the step really changed: a redraw of the same step (the "sent to the teacher" line
    // arriving, for one) must never swallow a tap on its buttons.
    const card = host.firstElementChild, key = steps[at] + (steps[at] === "quiz" && S.quiz ? ":" + S.quiz.i : "");
    card.tabIndex = -1;
    if (key !== shownStep) {
      shownStep = key;
      card.style.pointerEvents = "none"; setTimeout(() => { card.style.pointerEvents = ""; }, 400);
      card.focus({ preventScroll: true });
    }
    paintSave();
  }
  function paintSave() {
    const el = host && host.querySelector("#pkwSave"); if (!el || !ctx) return;
    const s = ctx.state();
    const [cls, text] = s.mode === "guest" ? ["guest", "Guest mode · nothing is saved"]
      : s.needLogin ? ["warn", "Signed out · tap here to sign in again; your result will then be sent"]
      : s.failing ? ["warn", "Not sent yet · it will be sent when you are online"]
      : s.saving ? ["busy", "Saving…"]
      : ["ok", s.mode === "anon" ? "✓ Saved (not signed in, no name)" : "✓ Result saved"];
    el.className = "pkw-save " + cls; el.textContent = text + (s.needLogin && s.mode !== "guest" ? " ▸" : "");
    const expired = s.needLogin && s.mode !== "guest";
    el.onclick = expired ? relogin : null; el.style.cursor = expired ? "pointer" : "";
    if (expired) { el.setAttribute("role", "button"); el.tabIndex = 0; el.onkeydown = e => { if (e.key === "Enter") relogin(); }; } else { el.removeAttribute("role"); el.removeAttribute("tabindex"); el.onkeydown = null; }
  }
  // Sign in again in another tab; this page stays as it is (the take and the run are kept here) and
  // carries on by itself once the new sign-in is stored.
  function relogin() { window.open("/pages/login.html?relogin=1", "_blank"); }
  addEventListener("storage", e => {
    if (e.key !== "user" || !ctx || !S) return;
    if (S.read && S.read.retry) S.read.retry();
    paintSave();
  });
  // The server's answer can arrive long after the last step was drawn (slow network, back online).
  function lateAnswer() {
    if (!ctx || !S || !S.closing) return;
    const st = ctx.state();
    if (st.server && st.server !== S.server && !st.saving) { S.server = st.server; paintChips(); }
  }
  const nextBtn = (label = "Next ▸", attrs = "") => `<button class="pkw-btn primary" type="button" id="pkwNext" ${attrs}>${label}</button>`;
  const on = (sel, fn) => { const el = host.querySelector(sel); if (el) el.onclick = fn; return el; };
  const slideOf = no => ctx.slides.find(s => s.no === no);

  function render() { ({ done: stepDone, read: stepRead, next: stepNext, quiz: stepQuiz, reflect: stepReflect })[steps[at]](); }

  // ── 1 結果與錯句回顧 ──
  function partBar() {
    const total = ctx.slides.length;
    return `<div class="pkw-parts">` + ctx.summary.parts.map(p => {
      const lvl = p.s == null ? "na" : p.s >= 0.8 ? "hi" : p.s >= 0.4 ? "mid" : "lo";
      return `<div class="pkw-part ${lvl}" title="${esc(partRole(p.part, total))}"><b>${p.part}</b><span>${esc(partEn(p.part, total))}</span></div>`;
    }).join("") + `</div><p class="pkw-legend"><i class="hi"></i>Matched first time <i class="mid"></i>Partly <i class="lo"></i>Needs practice</p>`;
  }
  function reviewItem(c) {
    const s = slideOf(c.no), was = slideOf(c.wrongNos[0]);
    return `<li><div class="pkw-rv-head"><b>${esc(s.title_en)}</b><button class="pkw-ear" type="button" data-hear="${c.no}" aria-label="Hear this sentence again">🔊</button></div>
      <span>${esc(s.script)}</span>${was ? `<small>You first put it on “${esc(was.title_en)}”</small>` : ""}</li>`;
  }
  function stepDone() {
    const sum = ctx.summary, shown = S.wrong.slice(0, 3), more = S.wrong.length - shown.length;
    const review = S.wrong.length
      ? `<h3 class="pkw-h">${S.wrong.length} sentence${S.wrong.length === 1 ? "" : "s"} not matched first time</h3><ul class="pkw-list">${shown.map(reviewItem).join("")}</ul>${more > 0 ? `<p class="pkw-note">${more} more are in the review list on the last step.</p>` : ""}`
      : `<p class="pkw-allgood">Every sentence matched first time.</p>`;
    shell("Done!", `${esc(ctx.topic.title)} (${esc(ctx.level)})`,
      `<div class="pkw-stats">
         <div><b>${sum.score == null ? "–" : sum.score}</b><span>Understanding score</span></div>
         <div><b>${fmt(sum.seconds)}</b><span>Matching time</span></div>
         <div><b>${sum.repeats}</b><span>Repeats</span></div>
       </div>
       ${partBar()}${review}
       <p class="pkw-note">The understanding score counts only the sentences matched first time, minus the chance of guessing. Listening again costs nothing.</p>`,
      ctx.embed ? harborBtn() : nextBtn("Next: read one slide aloud ▸"));
    host.querySelectorAll("[data-hear]").forEach(b => b.onclick = () => { const no = +b.dataset.hear; ctx.log("wrap.review.listen", { card: ctx.cardId(no) }); ctx.speak(slideOf(no).script); });
    const leave = () => { if (!S.reviewLogged) { S.reviewLogged = true; ctx.log("wrap.review", { missed: S.wrong.map(c => c.id), shown: shown.length }); } };
    if (ctx.embed) wireHarbor(leave); else on("#pkwNext", () => { leave(); go(); });
  }

  // ── 2 念一張投影片（每一次錄音都直接送給老師）──
  let rec = null;   // { stream, recorder, chunks, t0, timer, sr, heard }
  function stopRecording(discard) {
    if (!rec) return null;
    clearInterval(rec.timer);
    try { rec.sr && rec.sr.stop(); } catch (e) {}
    try { rec.recorder && rec.recorder.state !== "inactive" && rec.recorder.stop(); } catch (e) {}
    try { rec.stream && rec.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    const out = { seconds: (performance.now() - rec.t0) / 1000, chunks: rec.chunks, heard: rec.heard, type: rec.recorder && rec.recorder.mimeType };
    rec = null;
    return discard ? null : out;
  }
  function pickSlide() {
    if (S.redo) return { slide: slideOf(+String(S.redo.label).split("/s").pop()), why: "redo" };
    if (S.wrong.length) return { slide: slideOf(S.wrong[0].no), why: "missed" };
    return { slide: ctx.slides[hashIndex(`${ctx.userKey}|${ctx.topic.id}|${ctx.level}`, ctx.slides.length)], why: "assigned" };
  }
  function stepRead() {
    if (!S.read && !S.histDone) {   // the teacher's requests are still on their way
      shell("Read one slide aloud", "", `<p class="pkw-wait" role="status"><span class="pkw-spin"></span>Checking whether your teacher asked you to read a slide again…</p>`, nextBtn("Next ▸", "disabled"));
      const mine = S, proceed = () => { if (S === mine && ctx && steps[at] === "read" && !mine.read) render(); };
      mine.histWait = proceed;
      if (!mine.histTimer) mine.histTimer = setTimeout(() => { mine.histDone = true; proceed(); }, 2500);
      return;
    }
    if (!S.read) {
      const p = pickSlide();
      const words = p.slide.script.trim().split(/\s+/).length;
      S.read = { slide: p.slide, why: p.why, words, target: words / (WPS[ctx.level] || 1.8), takes: 0, result: null, url: null, blob: null, sent: null, busy: false, notes: null, clientId: null };
      const said = (S.voiceHistory || []).filter(x => x.label === ctx.cardId(p.slide.no) && (x.teacher_note || x.status === "redo"));
      if (said.length) S.read.notes = said;
    }
    const R = S.read, target = Math.round(R.target), res = R.result, label = ctx.cardId(R.slide.no);
    const verdict = res ? (res.ratio >= 0.85 && res.ratio <= 1.15 ? ["ok", "Right on time"] : res.ratio < 0.85 ? ["warn", "A little fast"] : ["warn", "A little slow"]) : null;
    const canSend = !!(ctx.voice && ctx.voice.canSend());
    const sentLine = !res ? "" : !R.url ? `<p class="pkw-sent warn">Nothing was recorded this time, only the time: your teacher will not get a recording.<br>To let your teacher hear you: tap the padlock next to the address (iPad: Settings → Safari → Microphone), allow the microphone, then press “Record again”.</p>`
      : !canSend ? `<p class="pkw-sent">The recording stays on this device. Sign in before you read so your teacher can hear it.</p>`
      : R.sent === "sending" ? `<p class="pkw-sent busy">Sending to your teacher…</p>`
      : R.sent === "ok" ? `<p class="pkw-sent ok">✓ Sent to your teacher</p>`
      : R.reason === "login" ? `<p class="pkw-sent warn">You are signed out. Sign in again, then send. The recording is still on this page. <button class="pkw-link" type="button" id="pkwRelogin">Sign in again</button><button class="pkw-link" type="button" id="pkwResend">Send again</button></p>`
      : `<p class="pkw-sent warn">${esc(R.sent || "Not sent yet.")} <button class="pkw-link" type="button" id="pkwResend">Send again</button></p>`;
    shell("Read one slide aloud", R.why === "redo" ? `Your teacher asked you to read this slide again. At ${esc(ctx.level)} speed it takes about ${target} seconds.`
      : R.why === "missed" ? `This is a sentence you did not match first time. At ${esc(ctx.level)} speed it takes about ${target} seconds.` : `At ${esc(ctx.level)} speed it takes about ${target} seconds: the length of one Pecha Kucha slide.`,
      `${R.notes ? `<div class="pkw-teacher"><b>Your teacher’s last feedback</b>${R.notes.slice(0, 2).map(n => `<p>${n.status === "redo" ? "Please record again: " : ""}${esc(n.teacher_note || "Please read it again.")}</p>`).join("")}</div>` : ""}
       <div class="pkw-clip"><b>${esc(R.slide.title_en)}</b><p>${esc(R.slide.script)}</p></div>
       <div class="pkw-readbar">
         <button class="pkw-btn ghost" type="button" id="pkwModel">🔊 Model</button>
         <button class="pkw-btn rec" type="button" id="pkwRec" ${res && R.takes >= MAX_TAKES ? "disabled" : ""}>${res ? (R.takes >= MAX_TAKES ? "No more takes" : "● Record again") : "● Start reading"}</button>
         <span class="pkw-clock" id="pkwClock">00:00 / ${fmt(target)}</span>
       </div>
       <div id="pkwReadOut">${res ? `
         <div class="pkw-stats">
           <div><b>${fmt(res.seconds)}</b><span>Your time</span></div>
           <div><b>${res.wpm}</b><span>Words a minute</span></div>
           <div class="${verdict[0]}"><b>${verdict[1]}</b><span>Target ${target} s</span></div>
         </div>
         ${res.heard != null ? `<p class="pkw-note">The computer heard about ${Math.round(res.heard * 100)}% of the words (for your information only, not scored).</p>` : ""}
         ${R.url ? `<audio controls src="${R.url}" class="pkw-audio"></audio>` : ""}${sentLine}` : ""}</div>
       <p class="pkw-feedback" id="pkwFb"></p>`,
      (res ? "" : `<button class="pkw-btn ghost" type="button" id="pkwSkip">Skip this time</button>`) + nextBtn("Next ▸", res ? "" : "disabled"));
    on("#pkwModel", () => { if (!rec) ctx.speak(R.slide.script); });
    on("#pkwSkip", () => { ctx.log("wrap.read.skip", { clip: label }); stopRecording(true); go(); });
    on("#pkwNext", () => { stopRecording(true); go(); });
    on("#pkwResend", () => upload());
    on("#pkwRelogin", relogin);
    R.retry = () => { if (R.reason === "login" && R.sent !== "ok") upload(); };   // called when the student has signed in again
    const btn = host.querySelector("#pkwRec");

    async function upload() {
      if (!R.blob || !canSend || R.sent === "sending") return;
      const c = ctx;
      R.sent = "sending"; if (steps[at] === "read" && !rec) render();
      const st = c.state();
      const out = await c.voice.send(R.blob, { game: "pecha_kucha", topic_id: c.topic.id, level: c.level, label, script_text: R.slide.script, content_version: c.topic.version,
        course_id: st.courseId, run_id: st.runId, seconds: +R.result.seconds.toFixed(1), target_seconds: +R.target.toFixed(1), wpm: R.result.wpm,
        heard_ratio: R.result.heard == null ? null : +R.result.heard.toFixed(2), client_id: R.clientId });
      if (out.ok) c.log("wrap.read.sent", { clip: label, take: R.takes, recording_id: out.id });   // logged even if the student has moved on
      if (!S || S.read !== R) return;
      R.sent = out.ok ? "ok" : out.message; R.reason = out.ok ? null : out.reason;
      if (ctx && steps[at] === "read" && !rec) render();
    }

    btn.onclick = async () => {
      if (R.busy) return;
      R.busy = true;
      if (rec) {   // stop this take
        btn.disabled = true;
        const out = stopRecording(false);
        const seconds = Math.max(1, out.seconds);
        setTimeout(() => {   // let the recorder hand over its last chunk
          R.busy = false;
          if (!S || S.read !== R || !ctx) return;
          if (R.url) { try { URL.revokeObjectURL(R.url); } catch (e) {} R.url = null; }
          R.blob = out.chunks && out.chunks.length ? new Blob(out.chunks, { type: out.type || "audio/webm" }) : null;
          if (R.blob) R.url = URL.createObjectURL(R.blob);
          let heard = null;
          if (out.heard != null) {
            const said = new Set(String(out.heard).toLowerCase().match(/[a-z']+/g) || []);
            const need = [...new Set((R.slide.script.toLowerCase().match(/[a-z']+/g) || []).filter(w => w.length >= 4))];
            heard = need.length ? need.filter(w => said.has(w)).length / need.length : null;
          }
          R.takes++; R.sent = null;
          R.clientId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
          R.result = { seconds, ratio: seconds / R.target, wpm: Math.round(R.words / seconds * 60), heard };
          ctx.log("wrap.read.done", { clip: label, why: R.why, seconds: +seconds.toFixed(1), target, ratio: +R.result.ratio.toFixed(2), wpm: R.result.wpm, heard: heard == null ? null : +heard.toFixed(2), take: R.takes, recorded: !!R.url, uploaded: false });
          if (steps[at] === "read") render();
          if (R.blob && canSend) upload();
        }, 250);
        return;
      }
      ctx.stopSpeak();
      btn.disabled = true;
      const mine = rec = { stream: null, recorder: null, chunks: [], t0: performance.now(), timer: null, sr: null, heard: null };
      let stream = null;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {}
      if (rec !== mine || !S || S.read !== R || !ctx || steps[at] !== "read") {   // the student left this step while the browser was asking
        if (stream) stream.getTracks().forEach(t => t.stop());
        R.busy = false; return;
      }
      const fb = host.querySelector("#pkwFb");
      if (stream) {
        mine.stream = stream;
        try {
          mine.recorder = new MediaRecorder(stream, (ctx.voice && ctx.voice.recorderOptions) || {});
          const chunks = mine.chunks;
          mine.recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
          mine.recorder.start();
        } catch (e) { mine.recorder = null; }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
          try {
            const sr = new SR(); sr.lang = "en-US"; sr.continuous = true; sr.interimResults = false;
            let text = "";
            sr.onresult = ev => { for (let i = ev.resultIndex; i < ev.results.length; i++) text += " " + ev.results[i][0].transcript; mine.heard = text; };
            sr.onend = () => { if (rec === mine) { try { sr.start(); } catch (e) {} } };
            sr.start(); mine.sr = sr;
          } catch (e) {}
        }
      } else if (fb) fb.innerHTML = "No microphone: this time <b>only the time is measured, and your teacher gets no recording</b>. Press “Done reading” when you finish.<br>To record: tap the padlock next to the address (iPad: Settings → Safari → Microphone), allow the microphone, then record again.";
      mine.t0 = performance.now();
      const live = host.querySelector("#pkwRec"), clock = host.querySelector("#pkwClock");
      if (live) { live.textContent = "■ Done reading"; live.classList.add("live"); setTimeout(() => { if (rec === mine && live.isConnected) live.disabled = false; }, 1500); }
      if (clock) clock.classList.add("live");
      mine.timer = setInterval(() => { if (clock && rec === mine) clock.textContent = `${fmt((performance.now() - mine.t0) / 1000)} / ${fmt(target)}`; }, 250);
      R.busy = false;
    };
  }

  // ── 3 下一步 ──
  function stepNext() {
    const sum = ctx.summary;
    const wrong = sum.cards.filter(c => c.first === false).map(c => slideOf(c.no)).filter(Boolean);
    const missed = S.quiz ? S.quiz.missed : [];
    const back = new Date(Date.now() + 2 * 86400000), back2 = new Date(Date.now() + 3 * 86400000);
    const day = d => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
    const best = ctx.bestBefore;
    const bestLine = sum.score == null || best === undefined ? "–" : best == null ? "This is your first result on this topic." : sum.score > best ? `Personal best! Your best was ${best}; this time ${sum.score}.` : `Your personal best is ${best}; this time ${sum.score}.`;
    const extras = [!S.quiz ? `<button class="pkw-btn ghost" type="button" id="pkwQuiz">5-question quiz</button>` : "", !S.reflect ? `<button class="pkw-btn ghost" type="button" id="pkwReflect">Write one reflection</button>` : ""].join("");
    shell("Well done!", "", `
      <div class="pkw-next-grid">
        <div class="pkw-box dark" id="pkwChips"><h3>Chips</h3><p>Working it out…</p></div>
        <div class="pkw-box"><h3>Your record</h3><p>${esc(bestLine)}</p></div>
        <div class="pkw-box"><h3>When to come back</h3><p>Play the same topic again on ${day(back)} or ${day(back2)}: that is when it sticks best.</p></div>
      </div>
      ${extras ? `<div class="pkw-extras"><span>Want more practice? (optional)</span>${extras}</div>` : ""}
      ${wrong.length || missed.length ? `<details class="pkw-box pkw-review"><summary>Review list (${wrong.length} sentence${wrong.length === 1 ? "" : "s"}${missed.length ? ", " + missed.length + " word" + (missed.length === 1 ? "" : "s") : ""})</summary>
        ${wrong.length ? `<ul class="pkw-list">${wrong.map(s => `<li><b>${esc(s.title_en)}</b><span>${esc(s.script)}</span></li>`).join("")}</ul>` : ""}
        ${missed.length ? `<p class="pkw-listhead">Words missed in the quiz</p><p class="pkw-words">${missed.map(m => `<b>${esc(m.word)}</b>`).join(" ")}</p>` : ""}</details>` : ""}`,
      `<button class="pkw-btn ghost" type="button" id="pkwTopic">← Topics</button><button class="pkw-btn primary" type="button" id="pkwAgain">Play again</button>`);
    on("#pkwTopic", () => { const a = ctx.actions; close(); a.changeTopic(); });
    on("#pkwAgain", () => { const a = ctx.actions; close(); a.again(); });
    on("#pkwQuiz", () => extra("quiz"));
    on("#pkwReflect", () => extra("reflect"));
    if (!S.closing) {
      S.closing = true;
      if (!S.doneLogged) { S.doneLogged = true; ctx.log("wrap.done", { steps, seconds: Math.round((performance.now() - S.started) / 1000) }); }
      const c = ctx, mine = S;
      c.finish({ wrap_seconds: Math.round((performance.now() - S.started) / 1000) }).then(data => {
        if (data && S === mine) S.server = data;
        if (ctx === c) paintChips();
        c.done();   // c, not ctx: the student may already have pressed 再玩一次, which clears ctx
      });
    }
    paintChips();
  }
  // An optional extra: do it, then come back to the last step, where the chips are counted again.
  function extra(name) { steps = ["done", "read", name, "next"]; at = 2; S.closing = false; render(); host.scrollTop = 0; }
  const CHIP_LABEL = { "pk.score": "Understanding score", "pk.finish": "Finished the game", "pk.remedy": "Missed sentences matched again", "pk.quiz": "Quiz answers", "pk.read": "Read aloud", "pk.reflect": "Reflection", "spaced.return": "Came back after a few days" };
  // The chip box settles this run's pile (ctx.provisional, what the table showed: the listening
  // score's chips) to what the server really gave. The server's number is the only one shown as
  // earned; the count runs from the table's pile to it (down too, when today's 60 is full), the
  // server's items pop in one by one with chips flying from each into the pile, then the balance.
  function paintChips() {
    const p = host && host.querySelector("#pkwChips p"); if (!p || !ctx) return;
    const s = ctx.state(), prov = typeof ctx.provisional === "number" ? ctx.provisional : null;
    const pile = (n, extra = "") => ctx.pileImg ? `<img class="pkw-pile" src="${esc(ctx.pileImg(n))}" alt=""${extra}>` : "";
    const table = cls => prov === null ? "" : `<span class="pkw-settle ${cls}">${pile(prov)}<b class="pkw-chipnum">+${prov}</b></span>`;
    if (s.mode === "guest") { p.innerHTML = table("off") + "Guest mode earns no chips. Sign in to have your games saved."; return; }
    if (s.mode === "anon") { p.innerHTML = table("off") + "Sign in to earn chips."; return; }
    const chips = S.server && S.server.chips;
    if (!chips) { p.innerHTML = table("wait") + esc(s.needLogin ? "Signed out: chips are worked out after you sign in again." : s.failing ? "Chips are worked out when you are online." : "Working it out…"); return; }
    const items = chips.items.filter(i => i.chips > 0), earned = chips.earned || 0;
    // The same answer again (a save-state change, a late copy): keep what is on screen, which may be mid-count.
    const key = JSON.stringify(chips);
    if (S.chipKey === key && p.querySelector(".pkw-items")) return;
    S.chipKey = key;
    p.classList.remove("pkw-settling", "pkw-settled");
    const note = (chips.test ? "Test game: no chips, and not counted in the class." : chips.held ? "These chips are added after your teacher checks this game." : `You now have <b class="pkw-bal">${chips.balance}</b> chips.`)
      + (chips.capped ? " You have reached today's chip limit. Come back tomorrow." : "")
      + (S.server.history && S.server.history.finished_today_same >= 2 ? " From the 3rd game of the same topic and level in a day, only the understanding score pays. Come back after two days for 5 extra chips." : "");
    const start = typeof S.shownEarned === "number" ? S.shownEarned : prov === null ? 0 : prov, fx = ctx.fx;
    const play = S.shownEarned !== earned && fx && fx.motion() && (earned !== start || items.length);
    S.shownEarned = earned;   // a later redraw (after the quiz, a late answer) counts on from here
    p.innerHTML = `<span class="pkw-settle${chips.held ? " held" : ""}">${pile(play ? start : earned)}<b class="pkw-chipnum">+${play ? start : earned}</b></span>`
      + `<span class="pkw-items">${items.map(i => `<span class="pkw-item">${esc(CHIP_LABEL[i.reason] || i.reason)} +${i.chips}</span>`).join("")}</span>`
      + `<span class="pkw-chipnote">${note}</span>`;
    if (!play) return;
    // The animation: items in turn, a few chips from each, the number counting toward the server's.
    const img = p.querySelector(".pkw-pile"), num = p.querySelector(".pkw-chipnum"), bal = p.querySelector(".pkw-bal"), mine = S;
    p.classList.add("pkw-settling");
    const els = [...p.querySelectorAll(".pkw-item")], step = 420, total = Math.max(1, els.length) * step + 500;
    els.forEach((el, i) => setTimeout(() => {
      if (S !== mine) return;
      el.classList.add("in");
      fx.chipsTo(el, img, Math.min(3, items[i].chips), () => { if (S === mine) fx.clink(img, "top"); }, "top");
    }, 250 + i * step));
    const t0 = performance.now(), balEnd = chips.balance, balStart = chips.held ? balEnd : Math.max(0, balEnd - earned);
    const tick = now => {
      if (S !== mine || !num.isConnected) return;
      const k = Math.min(1, (now - t0) / total), v = Math.round(start + (earned - start) * k);
      if (num.textContent !== "+" + v) { num.textContent = "+" + v; if (ctx.pileImg) { const src = ctx.pileImg(v); if (img.getAttribute("src") !== src) img.src = src; } }
      if (bal) bal.textContent = Math.round(balStart + (balEnd - balStart) * k);
      if (k < 1) requestAnimationFrame(tick);
      else { p.classList.remove("pkw-settling"); p.classList.add("pkw-settled"); }
    };
    requestAnimationFrame(tick);
  }

  // ── optional: 小測 5 題 ──
  function buildQuiz() {
    const wrongNos = new Set(ctx.summary.cards.filter(c => c.first === false).map(c => c.no));
    const pool = ctx.slides.map(s => ({ s, word: keyword(s.script) })).filter(x => x.word);
    const picked = [...shuffle(pool.filter(x => wrongNos.has(x.s.no))), ...shuffle(pool.filter(x => !wrongNos.has(x.s.no)))].slice(0, 5);
    const words = [...new Set(pool.map(x => x.word.toLowerCase()))];
    return picked.map(x => {
      const w = x.word.toLowerCase();
      const others = shuffle(words.filter(o => o !== w && !x.s.script.toLowerCase().includes(o))).sort((a, b) => Math.abs(a.length - w.length) - Math.abs(b.length - w.length)).slice(0, 3);
      const safe = x.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return { slide: x.s, word: x.word, options: shuffle([w, ...others]), text: x.s.script.replace(new RegExp(`\\b${safe}\\b`), "_____") };
    });
  }
  function stepQuiz() {
    if (!S.quiz) S.quiz = { items: buildQuiz(), i: 0, correct: 0, missed: [] };
    const Q = S.quiz, item = Q.items[Q.i];
    if (!item) {
      shell("Quiz done", "", `<div class="pkw-stats one"><div><b>${Q.correct} / ${Q.items.length}</b><span>correct</span></div></div>`
        + (Q.missed.length ? `<p class="pkw-note">Missed words go into the review list: ${Q.missed.map(m => `<b>${esc(m.word)}</b>`).join(", ")}</p>` : `<p class="pkw-note">All correct!</p>`), nextBtn("Back to the last step ▸"));
      on("#pkwNext", () => go());
      return;
    }
    let answered = false;
    shell(`Listen and choose the missing word (${Q.i + 1} / ${Q.items.length})`, "Listen first, then choose the word for the gap.",
      `<div class="pkw-sentence"><p>${esc(item.text)}</p><button class="pkw-btn ghost" type="button" id="pkwListen">🔊 Listen again</button></div>
       <div class="pkw-options words">${item.options.map(o => `<button type="button" class="pkw-opt" data-w="${esc(o)}">${esc(o)}</button>`).join("")}</div>
       <p class="pkw-feedback" id="pkwFb"></p>`,
      nextBtn(Q.i + 1 < Q.items.length ? "Next question ▸" : "See the result ▸", "disabled"));
    ctx.speak(item.slide.script);
    on("#pkwListen", () => ctx.speak(item.slide.script));
    host.querySelectorAll(".pkw-opt").forEach(b => b.onclick = () => {
      if (answered) return;
      answered = true;
      const correct = b.dataset.w === item.word.toLowerCase();
      if (correct) Q.correct++; else Q.missed.push({ word: item.word, no: item.slide.no });
      ctx.log("wrap.quiz.answer", { card: ctx.cardId(item.slide.no), word: item.word.toLowerCase(), chosen: b.dataset.w, correct });
      host.querySelectorAll(".pkw-opt").forEach(x => { x.disabled = true; if (x.dataset.w === item.word.toLowerCase()) x.classList.add("right"); });
      if (!correct) b.classList.add("wrong");
      host.querySelector("#pkwFb").innerHTML = (correct ? "✓ Correct." : `The answer is <b>${esc(item.word)}</b>.`) + ` <span class="pkw-full">${esc(item.slide.script)}</span>`;
      host.querySelector("#pkwNext").disabled = false;
    });
    on("#pkwNext", () => {
      Q.i++;
      if (Q.i >= Q.items.length) ctx.log("wrap.quiz.done", { correct: Q.correct, total: Q.items.length });
      ctx.stopSpeak(); render();
    });
  }

  // ── optional: 反思 ──
  function stepReflect() {
    if (!S.reflect) S.reflect = { item: REFLECT[(ctx.runsBefore || 0) % REFLECT.length], answer: null, sentence: "" };
    const F = S.reflect;
    shell("Think about it", "There is no right answer.", `
      <p class="pkw-q">${esc(F.item.q)}</p>
      <div class="pkw-options">${F.item.a.map((a, i) => `<button type="button" class="pkw-opt ${F.answer === i ? "on" : ""}" data-i="${i}">${esc(a)}</button>`).join("")}</div>
      <label class="pkw-q" for="pkwSentence">In one English sentence, connect SDG ${esc(String(ctx.topic.sdg))} with your own life:</label>
      <textarea id="pkwSentence" class="pkw-text" rows="2" maxlength="300" placeholder="In my daily life, I …">${esc(F.sentence)}</textarea>`,
      `<button class="pkw-btn ghost" type="button" id="pkwSkip">Skip</button>` + nextBtn("Send ▸", "disabled"));
    const sync = () => { host.querySelector("#pkwNext").disabled = !(F.answer != null && F.sentence.trim().split(/\s+/).filter(Boolean).length >= 3); };
    host.querySelectorAll(".pkw-opt").forEach(b => b.onclick = () => { F.answer = +b.dataset.i; host.querySelectorAll(".pkw-opt").forEach(x => x.classList.toggle("on", x === b)); sync(); });
    host.querySelector("#pkwSentence").oninput = e => { F.sentence = e.target.value; sync(); };
    sync();
    on("#pkwSkip", () => { S.reflect = null; steps = ["done", "read", "next"]; at = 2; S.closing = true; render(); });
    on("#pkwNext", () => {
      ctx.log("wrap.reflect", { facet: F.item.facet, question: F.item.q, answer: F.item.a[F.answer], answer_index: F.answer, sentence: F.sentence.trim().slice(0, 300), words: F.sentence.trim().split(/\s+/).length });
      go();
    });
  }

  // ── inside the 3D game ──
  function harborBtn(attrs = "") { return `<button class="pkw-btn primary" type="button" id="pkwHarbor" ${attrs}>Back to Innovation Harbor ▸</button>`; }
  function wireHarbor(before) {
    on("#pkwHarbor", () => {
      if (before) before();
      ctx.log("wrap.done", { steps, embed: true });
      const btn = host.querySelector("#pkwHarbor"); btn.disabled = true; btn.textContent = "Saving…";
      // Leaving removes this frame, so give the save a moment first; what is not through by then
      // stays in the browser and is sent the next time the card game opens.
      const c = ctx, actions = ctx.actions;
      c.finish({}, 2000).then(() => { c.done(); actions.backHarbor(); });
    });
  }

  window.PKWrap = { open, close, keyword, partRole };
})();
