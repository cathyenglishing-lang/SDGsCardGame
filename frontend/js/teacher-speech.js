// Teacher dashboard → 教材 › 語音念法. One table for the whole platform: when the text has "寫成",
// every game says "念成" instead (backend/speech_rules.py; the games apply it in js/speech-say.js).
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = () => String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
  const toast = (t, undo) => (window.teacherToast ? window.teacherToast(t, undo) : alert(t));
  const SAMPLE = "The SDGs matter: SDG 4 is about education, and AI can help, e.g. with CO2 data.";
  let rows = [], saved = "", defaults = [], maxRows = 300, lastSaved = null;

  async function call(method, path, body) {
    const r = await fetch(API() + path, { method, headers: { Authorization: "Bearer " + auth.getToken(), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error((d && (typeof d.detail === "string" ? d.detail : d.detail && d.detail.message)) || "沒有成功，請再試一次。");
    return d;
  }
  const key = list => JSON.stringify(list.filter(r => r.written.trim() || r.spoken.trim()).map(r => [r.written.trim(), r.spoken.trim()]));
  const dirty = () => key(rows) !== saved;
  // The table as typed, tried in the browser before it is saved.
  function sayWith(text) { const say = window.CardLearnSay; if (!say) return text; say.use(rows); return say(text); }
  function speak(text) {
    if (!window.speechSynthesis) { toast("這個瀏覽器不能朗讀。"); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(sayWith(text));
    const v = window.speechSynthesis.getVoices();
    u.voice = v.find(x => x.name === "Google US English") || v.find(x => x.name.includes("Aria")) || v.find(x => x.lang === "en-US") || null;
    u.lang = "en-US"; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }
  function problems() {
    const seen = new Map(), out = {};
    rows.forEach((r, i) => {
      const w = r.written.trim(), s = r.spoken.trim();
      if (!w && !s) return;
      if (!w) out[i] = "「寫成」是空的";
      else if (!s) out[i] = "「念成」是空的";
      else if (/\s/.test(w)) out[i] = "「寫成」只能是一個字或縮寫，中間不能有空格";
      else if (seen.has(w)) out[i] = `和第 ${seen.get(w) + 1} 列重複`;
      if (w) seen.set(w, seen.has(w) ? seen.get(w) : i);
    });
    return out;
  }
  function paintState() {
    const bad = problems(), n = Object.keys(bad).length, d = dirty();
    rows.forEach((r, i) => { const m = document.querySelector(`#tsRows [data-msg="${i}"]`); if (m) m.textContent = bad[i] || ""; const tr = document.querySelector(`#tsRows tr[data-i="${i}"]`); if (tr) tr.classList.toggle("bad", !!bad[i]); });
    $("tsSave").disabled = !d || !!n;
    $("tsDiscard").disabled = !d;
    $("tsState").textContent = n ? `有 ${n} 列要先改好才能儲存。` : d ? "有還沒儲存的修改。儲存後所有遊戲馬上照新的念。" : lastSaved ? `已儲存（${lastSaved}）。所有遊戲都用這張表。` : "所有遊戲都用這張表。";
    $("tsState").className = "ts-state " + (n ? "bad" : d ? "warn" : "ok");
    const t = $("tsTry").value || SAMPLE;
    $("tsHeard").textContent = sayWith(t);
  }
  function paintRows(focus) {
    $("tsRows").innerHTML = rows.map((r, i) => `<tr data-i="${i}">
        <td><input data-f="written" data-i="${i}" value="${esc(r.written)}" maxlength="40" placeholder="例如 SDG" aria-label="第 ${i + 1} 列：寫成" autocapitalize="off" spellcheck="false"></td>
        <td class="ts-arrow" aria-hidden="true">→</td>
        <td><input data-f="spoken" data-i="${i}" value="${esc(r.spoken)}" maxlength="120" placeholder="例如 S D G" aria-label="第 ${i + 1} 列：念成" spellcheck="false"><small class="ts-msg" data-msg="${i}"></small></td>
        <td class="nw"><button class="btn" type="button" data-hear="${i}" title="用這台電腦的聲音念念看">🔊 試聽</button>
          <button class="btn ts-del" type="button" data-del="${i}" aria-label="刪除第 ${i + 1} 列">刪除</button></td></tr>`).join("")
      || `<tr><td colspan="4" class="ts-empty">表是空的：所有縮寫都交給裝置自己決定怎麼念。按「＋ 加一列」。</td></tr>`;
    document.querySelectorAll("#tsRows input").forEach(inp => inp.oninput = () => { rows[Number(inp.dataset.i)][inp.dataset.f] = inp.value; paintState(); });
    document.querySelectorAll("#tsRows [data-hear]").forEach(b => b.onclick = () => { const r = rows[Number(b.dataset.hear)]; if (r.written.trim()) speak(`${r.written.trim()}. ${r.written.trim()} 4 is important.`); });
    document.querySelectorAll("#tsRows [data-del]").forEach(b => b.onclick = () => {
      const i = Number(b.dataset.del), gone = rows[i]; rows.splice(i, 1); paintRows(); paintState();
      if (gone.written.trim() || gone.spoken.trim()) toast(`已刪掉「${gone.written || "空白列"}」（還沒儲存）。`, () => { rows.splice(i, 0, gone); paintRows(); paintState(); });
    });
    if (focus !== undefined) { const el = document.querySelector(`#tsRows input[data-i="${focus}"][data-f="written"]`); if (el) el.focus(); }
  }
  function shell() {
    $("tsBody").innerHTML = `
      <section class="panel"><div class="section-h"><h2>語音念法<small>遊戲朗讀時，縮寫和符號要怎麼念。這張表是整個系統共用的：卡牌遊戲、Innovation Harbor 都照它念；畫面上的字不會變。</small></h2></div>
        <div class="ts-bar"><span class="ts-state" id="tsState" role="status"></span><span class="ts-grow"></span>
          <button class="btn" type="button" id="tsDiscard">放棄修改</button><button class="btn btn-primary" type="button" id="tsSave">儲存</button></div>
        <div class="scrollx"><table class="part-table ts-table"><thead><tr><th>寫成（教材裡的字）</th><th></th><th>念成</th><th></th></tr></thead><tbody id="tsRows"></tbody></table></div>
        <div class="ts-foot"><button class="btn" type="button" id="tsAdd">＋ 加一列</button><span class="ts-grow"></span><button class="btn" type="button" id="tsReset">恢復成內建的表</button></div>
        <p class="ts-hint">規則：只會換掉<b>完整的一個字</b>（ChatGPT 裡的 GPT 不會被換）。全大寫的縮寫加複數 s 也會一起處理（SDGs → S D Gs）。想讓某個縮寫照原樣念（例如 STEM、NASA），不要放進表裡就好。破折號、分號、冒號會自動變成停頓。</p>
      </section>
      <section class="panel"><h3 class="ts-h">試一句</h3>
        <label class="ts-try">打一句英文，看它會被念成什麼<textarea id="tsTry" rows="2" maxlength="400" spellcheck="false" placeholder="${esc(SAMPLE)}"></textarea></label>
        <p class="ts-heard"><span>會念成</span><b id="tsHeard"></b></p>
        <div class="row"><button class="btn btn-primary" type="button" id="tsHear">🔊 用這台電腦的聲音念</button><small class="ts-hint">每台裝置的聲音不一樣（iPad、Chromebook、Windows 各有自己的聲音），這裡聽到的是這台電腦的。</small></div>
      </section>`;
    $("tsAdd").onclick = () => { if (rows.length >= maxRows) { toast(`最多 ${maxRows} 列。`); return; } rows.push({ written: "", spoken: "" }); paintRows(rows.length - 1); paintState(); };
    $("tsDiscard").onclick = () => { rows = JSON.parse(saved).map(([written, spoken]) => ({ written, spoken })); paintRows(); paintState(); toast("已回到上次儲存的表。"); };
    $("tsSave").onclick = save;
    $("tsReset").onclick = () => {
      const before = rows.map(r => ({ ...r }));
      rows = defaults.map(r => ({ ...r })); paintRows(); paintState();
      toast("已換成內建的表（還沒儲存）。按「儲存」才會生效。", () => { rows = before; paintRows(); paintState(); });
    };
    $("tsTry").oninput = paintState;
    $("tsHear").onclick = () => speak($("tsTry").value || SAMPLE);
  }
  async function save() {
    const btn = $("tsSave"); btn.disabled = true; btn.textContent = "儲存中…";
    try {
      const out = await call("PUT", "/teacher/speech", { rules: rows.map(r => ({ written: r.written, spoken: r.spoken })) });
      rows = out.rules.map(r => ({ ...r })); saved = key(rows); lastSaved = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
      if (window.CardLearnSay) window.CardLearnSay.refresh();
      paintRows(); toast(`已儲存 ${out.saved} 列。學生重新整理頁面後就會照新的念。`);
    } catch (e) { toast(e.message); }
    btn.textContent = "儲存"; paintState();
  }
  async function load() {
    if (!$("tsBody")) return;
    $("tsBody").innerHTML = `<section class="panel"><p class="ts-hint">讀取中…</p></section>`;
    try {
      const d = await call("GET", "/teacher/speech");
      rows = d.rules.map(r => ({ ...r })); saved = key(rows); defaults = d.defaults; maxRows = d.max_rows || 300; lastSaved = null;
      shell(); paintRows(); paintState();
    } catch (e) { $("tsBody").innerHTML = `<section class="panel"><p class="ts-hint">${esc(e.message)}</p><button class="btn" type="button" id="tsRetry">再試一次</button></section>`; $("tsRetry").onclick = load; }
  }
  window.addEventListener("beforeunload", e => { if ($("tsSave") && rows.length && dirty()) { e.preventDefault(); e.returnValue = ""; } });
  window.loadSpeechRules = load;
})();
