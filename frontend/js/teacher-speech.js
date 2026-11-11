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
      </section>
      <section class="panel" id="tsCloud"><p class="ts-hint">讀取雲端語音的狀態…</p></section>`;
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
      shell(); paintRows(); paintState(); loadCloud();
    } catch (e) { $("tsBody").innerHTML = `<section class="panel"><p class="ts-hint">${esc(e.message)}</p><button class="btn" type="button" id="tsRetry">再試一次</button></section>`; $("tsRetry").onclick = load; }
  }
  // ── 雲端語音與口音 (backend/tts.py) ──
  const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");
  const num = n => Number(n || 0).toLocaleString("en-US");
  let cloud = null, preparing = null, player = null;
  async function playCloud(text, accent, btn) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = "產生中…";
    try {
      const r = await fetch(API() + "/teacher/tts/try", { method: "POST", headers: { Authorization: "Bearer " + auth.getToken(), "Content-Type": "application/json" }, body: JSON.stringify({ text, accent }) });
      if (!r.ok) { const d = await r.json().catch(() => null); throw new Error((d && d.detail && (d.detail.message || d.detail)) || "沒有成功，請再試一次。"); }
      if (player) player.pause();
      player = new Audio(URL.createObjectURL(await r.blob())); await player.play();
    } catch (e) { toast(typeof e.message === "string" ? e.message : "沒有成功，請再試一次。"); }
    btn.disabled = false; btn.textContent = label;
  }
  async function saveCloud(patch, done) {
    try { cloud = await call("PUT", "/teacher/tts", patch); paintCloud(); if (done) toast(done); }
    catch (e) { toast(e.message); loadCloud(); }
  }
  async function prepareAll(accent) {
    if (preparing) return;
    preparing = accent; paintCloud();
    try {
      for (;;) {
        const out = await call("POST", "/teacher/tts/prepare", { accent });
        const row = cloud.accents.find(a => a.code === accent); if (row) row.ready = out.total - out.left;
        paintCloud();
        if (!out.left) { toast(`${row ? row.label : accent}：${out.total} 句都準備好了。學生第一次聽就不用等。`); break; }
        if (!out.made) { toast(out.message || "停下來了，請再試一次。"); break; }
        if (preparing !== accent) break;
      }
    } catch (e) { toast(e.message); }
    preparing = null; loadCloud();
  }
  function paintCloud() {
    const box = $("tsCloud"); if (!box || !cloud) return;
    const st = cloud.settings, keys = cloud.providers.filter(p => p.configured).length;
    box.innerHTML = `<h3 class="ts-h">雲端語音與口音</h3>
      <p class="ts-cloud-state ${cloud.available && st.accents.length ? "ok" : "warn"}">${cloud.available && st.accents.length
        ? `已啟用：卡牌遊戲用雲端語音朗讀，學生可以選 ${st.accents.length} 種口音。每一句每種口音只產生一次，存在伺服器上，之後每台裝置聽到的都一樣。`
        : keys ? (st.accents.length ? "雲端語音暫時不能用（額度用完或廠商沒有回應）：遊戲先用各裝置自己的聲音，恢復後會自動換回來。" : "還沒有勾任何口音：遊戲用各裝置自己的聲音。")
        : "還沒有設定金鑰：遊戲用各裝置自己的聲音（和以前一樣）。請管理員在伺服器的環境變數設定 AZURE_SPEECH_KEY、AZURE_SPEECH_REGION 或 GOOGLE_TTS_API_KEY，重新啟動後這裡就會顯示「已設定」。"}</p>
      <div class="scrollx"><table class="part-table ts-ctable"><thead><tr><th>順序</th><th>語音服務</th><th>金鑰</th><th>這個月已用（字元）</th><th>每月上限</th></tr></thead><tbody>
        ${cloud.providers.map((p, i) => `<tr><td class="nw">${i === 0 ? "先用" : `<button class="btn" type="button" data-first="${esc(p.key)}">改成先用</button>`}</td><td><b>${esc(p.name)}</b></td>
          <td>${p.configured ? `<span class="ts-pill ok">已設定</span>${p.paused ? ` <span class="ts-pill warn">暫停中，幾分鐘後再試</span>` : ""}` : `<span class="ts-pill">未設定</span>`}</td>
          <td class="nw">${num(p.used)}<span class="ts-meter"><i style="width:${Math.min(100, p.budget ? (p.used / p.budget) * 100 : 100)}%" class="${p.budget && p.used / p.budget > 0.9 ? "bad" : ""}"></i></span>${p.budget && p.used >= p.budget ? ` <span class="ts-pill warn">用完了</span>` : ""}</td>
          <td><input type="number" min="0" step="10000" value="${Number(p.budget)}" data-budget="${esc(p.key)}" aria-label="${esc(p.name)} 每月上限"></td></tr>`).join("")}
      </tbody></table></div>
      <p class="ts-hint">上限是保險：用到上限就換下一家，都用完就退回各裝置自己的聲音，不會多花錢。預設值略低於各家每月的免費額度（Azure 50 萬、Google 100 萬字元）。目前的教材共 ${num(cloud.sentences)} 句、約 ${num(cloud.sentence_chars)} 字元，也就是每多一種口音大約用掉這麼多，而且只算一次。</p>
      <div class="scrollx"><table class="part-table ts-ctable"><thead><tr><th>開放給學生</th><th>口音</th><th>預設</th><th>哪一家有</th><th>已準備好的句子</th><th></th></tr></thead><tbody>
        ${cloud.accents.map(a => `<tr class="${a.offered ? "" : "mute"}"><td><label class="check"><input type="checkbox" data-offer="${esc(a.code)}" ${a.offered ? "checked" : ""}> 開放</label></td>
          <td><b>${esc(a.label)}</b><small class="ts-sub">${esc(a.code)}</small></td>
          <td><input type="radio" name="tsDefault" data-default="${esc(a.code)}" ${st.default === a.code ? "checked" : ""} ${a.offered ? "" : "disabled"} aria-label="${esc(a.label)} 設為預設"></td>
          <td>${a.providers.map(k => esc(k === "azure" ? "Azure" : "Google")).join("、")}</td>
          <td class="nw">${num(a.ready)} / ${num(cloud.sentences)}<span class="ts-meter"><i style="width:${cloud.sentences ? (a.ready / cloud.sentences) * 100 : 0}%"></i></span>${a.bytes ? `<small class="ts-sub">${kb(a.bytes)}</small>` : ""}</td>
          <td class="nw"><button class="btn" type="button" data-try="${esc(a.code)}" ${keys ? "" : "disabled"}>🔊 試聽</button>
            ${a.offered ? `<button class="btn" type="button" data-prep="${esc(a.code)}" ${!keys || a.ready >= cloud.sentences || (preparing && preparing !== a.code) ? "disabled" : ""}>${preparing === a.code ? "準備中…（按一下停止）" : a.ready >= cloud.sentences && cloud.sentences ? "都準備好了" : "先準備好全部"}</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="ts-hint">「試聽」會用上面「試一句」的句子（沒打就用範例句），照念法表轉換後交給雲端語音。「先準備好全部」是事先把教材每一句都產生好，學生第一次聽就不用等一兩秒；不按也可以，第一位聽到那一句的學生會等一下。改了念法表或講稿，只有受影響的句子會重新產生。</p>`;
    box.querySelectorAll("[data-first]").forEach(b => b.onclick = () => saveCloud({ order: [b.dataset.first, ...st.order.filter(k => k !== b.dataset.first)] }, "已改變順序。"));
    box.querySelectorAll("[data-budget]").forEach(inp => inp.onchange = () => saveCloud({ budget: { ...st.budget, [inp.dataset.budget]: Math.max(0, Math.round(Number(inp.value) || 0)) } }, "已儲存每月上限。"));
    box.querySelectorAll("[data-offer]").forEach(c => c.onchange = () => {
      const list = cloud.accents.filter(a => (a.code === c.dataset.offer ? c.checked : a.offered)).map(a => a.code);
      saveCloud({ accents: list }, c.checked ? "已開放這個口音給學生。" : "已收起這個口音。");
    });
    box.querySelectorAll("[data-default]").forEach(r => r.onchange = () => saveCloud({ default: r.dataset.default }, "已設為預設口音：學生沒有自己選的時候用這個。"));
    // The sentence is read when the button is pressed, so what the teacher has just typed is what is heard.
    box.querySelectorAll("[data-try]").forEach(b => b.onclick = () => playCloud((($("tsTry") && $("tsTry").value.trim()) || SAMPLE).slice(0, 300), b.dataset.try, b));
    box.querySelectorAll("[data-prep]").forEach(b => b.onclick = () => { if (preparing === b.dataset.prep) { preparing = null; b.disabled = true; } else prepareAll(b.dataset.prep); });
  }
  async function loadCloud() {
    if (!$("tsCloud")) return;
    try { cloud = await call("GET", "/teacher/tts"); paintCloud(); }
    catch (e) { $("tsCloud").innerHTML = `<h3 class="ts-h">雲端語音與口音</h3><p class="ts-hint">${esc(e.message)}</p>`; }
  }
  window.addEventListener("beforeunload", e => { if ($("tsSave") && rows.length && dirty()) { e.preventDefault(); e.returnValue = ""; } });
  window.loadSpeechRules = load;
})();
