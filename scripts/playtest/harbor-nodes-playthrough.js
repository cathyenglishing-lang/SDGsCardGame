// Automated end-to-end playtest of Innovation Harbor (story-graph version).
// Run with the Playwright MCP tool browser_run_code (filename: scripts/playtest/harbor-nodes-playthrough.js)
// or wrap in @playwright/test. Needs the frontend server (scripts/serve-frontend.py 8766) and,
// for the learning database, the backend on 8001 (events are best-effort; the game runs without it).
//
// It stubs browser speech recognition so the speaking step and the Pecha Kucha presentation run
// end to end (20 s per slide, LED screen, camera cuts, applause), walks the first leg with the
// keyboard, uses "Skip walk" for the rest, plays the embedded card game, and reports:
//   - page errors / console errors
//   - interactive elements or speech bubbles outside the viewport (跑框)
//   - speaker off screen or hidden behind geometry during dialogue
//   - the Pecha Kucha stage: timer, slide changes, screen, scoring
async (page) => {
  const BASE = 'http://127.0.0.1:8766';
  const API = 'http://127.0.0.1:8001';
  const VIEW = globalThis.__view || { width: 1366, height: 800 };
  const issues = [], log = [];
  const note = (k, d) => { const s = k + ': ' + d; if (!issues.includes(s)) issues.push(s); };
  page.on('pageerror', e => note('pageerror', String(e.message).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|manifest\.json|pk-result/.test(m.text())) note('console', m.text().slice(0, 160) + ' ' + (m.location()?.url || '')); });
  await page.setViewportSize(VIEW);
  // log in (local admin) so runs carry a user id; fake speech recognition that "hears" the target text
  let token = null;
  try { const r = await page.request.post(`${API}/auth/login`, { data: { email: 'admin@harbor-dev.com', password: 'LocalAdmin123' } }); if (r.ok()) token = (await r.json()).access_token; } catch (e) {}
  await page.addInitScript((tok) => {
    if (tok) localStorage.setItem('user', JSON.stringify({ access_token: tok, user: { name: 'Admin' } }));
    localStorage.setItem('cardlearn_tts_rate', '1.3');
    class FakeSR {
      constructor() { this.lang = ''; this.continuous = true; this.interimResults = true; }
      start() {
        const say = () => {
          const el = document.querySelector('#sheet:not([hidden]) #tg') || document.querySelector('#sheet:not([hidden]) .target');
          const text = (el?.textContent || 'hello harbor').trim();
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
        };
        this._t = setTimeout(say, 1200);
        this._t2 = setTimeout(() => this.onend?.(), 2600);
      }
      stop() { clearTimeout(this._t); clearTimeout(this._t2); this.onend?.(); }
      abort() { this.stop(); }
    }
    window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  }, token);
  await page.goto(`${BASE}/games/innovation-harbor/index.html?q=low&speed=4&api=${encodeURIComponent(API)}`);
  await page.waitForSelector('#intro:not([hidden])', { timeout: 120000 });
  await page.click('#startBtn');
  await page.waitForSelector('#skipCine:not([hidden])', { timeout: 30000 }); await page.waitForTimeout(600); await page.click('#skipCine');
  await page.evaluate(async () => {
    const THREE = await import('three');
    const C = await import('/games/innovation-harbor/js/world/camera.js');
    const { scene, camera } = await import('/games/innovation-harbor/js/world/scene.js');
    window.__t = { THREE, rig: C.rig, scene, camera };
  });

  const offscreen = () => page.evaluate(() => [...document.querySelectorAll('#ui button, #ui input, #ui select, #labels .bubble, #labels .bubble button, .obj, .opt, .hchip, .passage.sel-able')]
    .filter(b => { if (b.closest('[hidden]') || (!b.offsetParent && getComputedStyle(b).position !== 'fixed' && !b.closest('#labels'))) return false; if (b.closest('.body, #shBody, .tbl, .sa-scroll, .logp, .cover')) return false; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return false; return r.top < -1 || r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; })
    .map(b => (b.id || b.className || b.tagName) + ':' + (b.textContent || '').trim().slice(0, 24)));
  const speakerCheck = () => page.evaluate(() => {
    const b = document.querySelector('#labels .bubble'); if (!b) return null;
    const who = b.querySelector('.bname').childNodes[0].textContent.trim();
    const map = { 'Harbor Master Mei': 'mei', 'Kai': 'kai', 'Dr. Hsu': 'hsu', 'Councillor Wang': 'wang', 'Foreman Lee': 'foreman', 'Ana Reyes': 'reporter', 'You': 'player' };
    if (b.classList.contains('thought')) { window.__thoughts = (window.__thoughts || 0) + 1; }
    const a = window.__dbg[map[who]]; const r = b.getBoundingClientRect(); const nx = b.querySelector('.bnext, .opt')?.getBoundingClientRect();
    const res = { who, bubbleOn: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, btnOn: !!nx && nx.top >= 0 && nx.bottom <= innerHeight };
    if (a) {
      const { THREE, scene, camera } = window.__t; const h = new THREE.Vector3(); a.headWorld(h);
      const p = h.clone().project(camera); res.inView = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      const ray = new THREE.Raycaster(camera.position, h.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(h) - 0.3);
      const isActor = o => { for (; o; o = o.parent) if (o.userData.actor) return true; return false; };
      res.occluded = !!ray.intersectObjects(scene.children, true).find(x => x.object.isMesh && x.object.visible && !isActor(x.object) && !x.object.material?.transparent);
    }
    return res;
  });

  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1366, 800], [1920, 1080]];
  const layoutCheck = () => page.evaluate(() => {
    const vis = el => { if (el.closest('[hidden]')) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const out = { off: [], overlap: [] };
    const inter = [...document.querySelectorAll('#ui button, #ui input, #ui select, #labels .bubble, #labels .bubble button, .obj, .opt, .hchip, .passage.sel-able')].filter(vis).filter(b => !b.closest('.body, #shBody, .tbl, .sa-scroll, .logp, .cover'));
    for (const b of inter) { const r = b.getBoundingClientRect(); if (r.top < -1 || r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.off.push((b.id || b.className.split(' ')[0] || b.tagName) + ':' + (b.textContent || '').trim().slice(0, 18) + '[' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + (b.classList.contains('docked') ? ' docked' : '') + ']'); }
    const panels = ['#hud', '#compass', '#travel', '.joy', '.jumpbtn', '.drivebtn', '#sheet', '#labels .bubble', '#toast', '#skipCine', '.cardgame header', '#ticketCard', '#endCard'].map(s => document.querySelector(s)).filter(el => el && vis(el));
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i].getBoundingClientRect(), b = panels[j].getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 4 && h > 4) { const area = w * h, small = Math.min(a.width * a.height, b.width * b.height); if (area > small * 0.15) out.overlap.push(`${panels[i].id || panels[i].className.split(' ')[0]} x ${panels[j].id || panels[j].className.split(' ')[0]} (${Math.round(area / small * 100)}%)`); }
    }
    return out;
  });
  const sweep = async (label) => {
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(350);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // resize event + one placed frame (slow under software GL)
      const r = await layoutCheck();
      if (r.off.length) note(`${label} @${w}x${h}`, 'off-screen: ' + r.off.slice(0, 6).join(', '));
      if (r.overlap.length) note(`${label} @${w}x${h}`, 'overlap: ' + r.overlap.slice(0, 4).join('; '));
      if (w === 390 || w === 768) await shot(`${label.replace(/\W+/g, '_').slice(0, 24)}-${w}`);
    }
    await page.setViewportSize(VIEW); await page.waitForTimeout(300);
  };
  const shot = (name) => page.screenshot({ path: `.playwright-mcp/report/nodes-${name}.jpg`, type: 'jpeg', quality: 70 }).catch(() => {});

  const t0 = Date.now(); let lastKick = '', walkedOnce = false, pkSeen = false, pkSlides = new Set(), stepGuard = 0, lastStep = 'start'; const seen = new Set(), fxSeen = new Set();
  try { while (Date.now() - t0 < 12 * 60 * 1000) {
    if (++stepGuard > 900) { note('loop', 'too many steps'); break; }
    // story effects: screenshot each kind once (title/location card, emotion badge, flashback)
    const fx = await page.evaluate(() => ({ title: !!document.querySelector('.titlecard.in'), emote: !!document.querySelector('.emote'), flash: document.body.classList.contains('flashback'), deal: window.__dbg.S.events.some(e => e.type === 'story.deal') }));
    for (const k of Object.keys(fx)) if (fx[k] && !fxSeen.has(k)) { fxSeen.add(k); log.push('fx: ' + k); if (k === 'flash') await page.waitForTimeout(1500); await shot('fx-' + k); if (k === 'emote') { const r = await page.evaluate(() => { const e = document.querySelector('.emote'); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }); log.push('emote rect ' + (r ? r.join(',') : 'gone')); if (r && r[0] < 40 && r[1] < 40) note('fx emote', 'badge stuck at the top-left corner (not following the head)'); } if (k === 'title') { const r = await layoutCheck(); if (r.off.length) note('fx title', 'off-screen: ' + r.off.join(', ')); } }
    if (await page.locator('#ending:not([hidden])').count()) { log.push('ENDING ' + await page.locator('#endCard .ending-title').textContent()); await shot('ending'); await sweep('ending'); break; }
    // ferry ticket (officer check at the pier, or reopened from the HUD)
    if (await page.locator('#ticket:not([hidden])').count()) { lastStep = 'ticket'; if (!fxSeen.has('ticket')) { fxSeen.add('ticket'); log.push('ticket shown'); await page.waitForTimeout(500); await shot('ticket'); await sweep('ticket'); } await page.locator('#ticketOk').evaluate(el => el.click()); await page.waitForTimeout(400); continue; }
    // objectives: walk the first leg with the keyboard (tests roam + compass), skip the rest
    if (await page.locator('#travel:not([hidden])').count()) {
      lastStep = 'objectives';
      const names = await page.locator('#tvList .obj b').allTextContents();
      const off = await offscreen(); if (off.length) note('objectives', 'off-screen: ' + off.join(', '));
      const compass = await page.locator('#compass:not([hidden])').count();
      if (!compass) note('objectives', 'compass not shown for ' + names.join('/'));
      if (!walkedOnce) {
        walkedOnce = true; await shot('objectives'); await sweep('objectives');
        const tStart = Date.now(); let lastPos = null, stuckFor = 0;
        await page.keyboard.down('Shift');
        while (await page.locator('#travel:not([hidden])').count() && Date.now() - tStart < 60000) {
          const st = await page.evaluate(() => { const t = window.__t; const p = window.__dbg.player.pos; const tg = [...document.querySelectorAll('#tvList .obj')].find(b => b.classList.contains('primary')); const bb = window.__dbg.S; return { pos: [p.x, p.z] }; });
          await page.evaluate(() => { const t = window.__t; const p = window.__dbg.player.pos; const prim = [...document.querySelectorAll('#tvList .obj')].find(b => b.classList.contains('primary')); const id = prim?.dataset.id; const n = window.__dbg.graph?.nodes.find(n => n.id === id); if (!n) return; t.rig.orbit.theta = Math.atan2(-(n.spot[0] - p.x), -(n.spot[1] - p.z)); });
          await page.keyboard.down('w'); await page.waitForTimeout(250);
          if (lastPos && Math.hypot(st.pos[0] - lastPos[0], st.pos[1] - lastPos[1]) < 0.05) stuckFor += 250; else stuckFor = 0;
          lastPos = st.pos;
          if (stuckFor > 3000) { note('walk', `stuck at ${st.pos.map(v => v.toFixed(1))}`); await shot('stuck'); await page.keyboard.up('w'); await page.click('#tvSkip'); break; }
        }
        await page.keyboard.up('w'); await page.keyboard.up('Shift');
        log.push(`walked first leg in ${((Date.now() - tStart) / 1000).toFixed(0)} s (${names.join('/')})`);
      } else { log.push('skip walk → ' + names[0]); await page.click('#tvSkip'); }
      await page.waitForTimeout(1200); continue;
    }
    // dialogue
    if (await page.locator('#labels .bubble').count()) {
      lastStep = 'dialogue';
      await page.waitForTimeout(700);
      const c = await speakerCheck();
      if (c) {
        if (!c.bubbleOn) note('bubble ' + c.who, 'bubble not fully on screen');
        if (!c.btnOn) note('bubble ' + c.who, 'Continue/option off screen');
        if (c.inView === false) note('speaker ' + c.who, 'speaker off screen');
        if (c.occluded) note('speaker ' + c.who, 'speaker hidden behind geometry');
        if (!seen.has(c.who)) { seen.add(c.who); await shot('line-' + c.who.replace(/\W+/g, '_')); if (seen.size <= 3) await sweep('dialogue ' + c.who); }
      }
      const opt = page.locator('#labels .bubble .opt').first();
      if (await opt.count()) { const txt = (await opt.textContent()).trim().slice(0, 40); log.push('choice: ' + txt); await opt.evaluate(el => el.click()); }
      else await page.locator('#labels .bubble .bnext').evaluate(el => el.click());
      await page.waitForTimeout(450); continue;
    }
    // embedded card game
    if (await page.locator('.cardgame iframe').count()) {
      lastStep = 'cardgame';
      let f = null; for (let k = 0; k < 40 && !f; k++) { f = page.frames().find(fr => fr.url().includes('pecha_kucha_builder')); if (!f) await page.waitForTimeout(500); }
      if (!f) { note('cardgame', 'iframe never attached'); await page.waitForTimeout(3000); continue; }
      await page.waitForTimeout(2500); await shot('cardgame');
      const n = await f.evaluate(() => totalToMatchAll());
      for (let i = 0; i < n; i++) {
        await f.evaluate(() => dealNextCard()); await page.waitForTimeout(350);
        await f.evaluate(() => { const b = document.querySelector('#dealtCardHolder .listen-btn') || document.querySelector('#dealtCardHolder .card-inner'); b && b.click(); });
        await f.waitForFunction(() => canDrag, null, { timeout: 60000 }).catch(() => note('cardgame', 'card never became draggable'));
        await f.evaluate(() => { const el = document.querySelector(`.subtopic-poker[data-sub-id="${currentCardData.subId}"]`); el && el.click(); });
        await page.waitForTimeout(250);
      }
      await f.waitForSelector('#pkBackHarbor', { timeout: 20000 }).catch(() => note('cardgame', 'finish overlay never appeared'));
      log.push(`card game: ${n} cards matched`);
      await f.click('#pkBackHarbor').catch(() => {}); await page.waitForTimeout(2000); continue;
    }
    // activity sheet
    if (await page.locator('#sheet:not([hidden])').count()) {
      lastStep = 'activity';
      const kick = await page.locator('#shKick').textContent();
      if (kick !== lastKick) { lastKick = kick; log.push('activity: ' + kick); await page.waitForTimeout(400); await shot('act-' + kick.replace(/\W+/g, '_').slice(0, 30)); await sweep('activity ' + kick.slice(0, 18)); }
      if (/Pecha Kucha/.test(kick)) {
        const st = await page.evaluate(() => ({ sec: document.querySelector('#pk #sec')?.textContent, slide: document.querySelector('#pk .slide small')?.textContent, live: !!document.querySelector('#pk .dot.live'), onStage: Math.hypot(window.__dbg.player.pos.x - 27, window.__dbg.player.pos.z - 5.5) < 3, kind: window.__dbg.player.kind }));
        if (st.slide && !pkSlides.has(st.slide)) { pkSlides.add(st.slide); pkSeen = true; log.push(`PK slide: ${st.slide} (timer ${st.sec}s, mic ${st.live}, on stage ${st.onStage}, anim ${st.kind})`); await shot('pk-' + pkSlides.size); if (pkSlides.size === 1) await sweep('pecha kucha'); if (!st.onStage) note('pk', 'player not on the stage'); }
      }
      const did = await page.evaluate(async () => {
        const B = document.querySelector('#shBody'); const vis = el => el && !el.disabled && !el.hidden && el.offsetParent !== null && !el.closest('[hidden]');
        const click = el => { el.scrollIntoView({ block: 'nearest' }); el.click(); };
        const done = B.querySelector('.result .btn'); if (vis(done)) { click(done); return 'done'; }
        const next = [...B.querySelectorAll('.row .btn')].find(b => /Next slide/.test(b.textContent) && vis(b)); if (next) { click(next); return 'next'; }
        const play = B.querySelector('#play'); if (vis(play) && !B.querySelector('#q .passage')) { click(play); return 'play'; }
        const inp = [...B.querySelectorAll('.inp:not([disabled])')].find(vis); if (inp) { inp.value = 'zzz'; inp.nextElementSibling.click(); return 'type'; }
        const pool = B.querySelector('#pool'); if (pool) { const n = B.querySelectorAll('#out div').length; const o = pool.querySelector(`.opt[data-i="${n}"]`); if (o) { click(o); return 'seq'; } return 'wait'; }
        const mcqOpt = [...B.querySelectorAll('.seq .opt')].find(b => vis(b)); if (mcqOpt) { click(mcqOpt); return 'mcq'; }
        const chip = [...B.querySelectorAll('.hchip:not(.used)')][0]; if (chip && B.querySelector('#chk')) { chip.click(); B.querySelector(`.passage.sel-able[data-no="${chip.dataset.no}"]`).click(); return 'match'; }
        const chk = B.querySelector('#chk'); if (vis(chk)) { click(chk); return 'check'; }
        const pw = [...B.querySelectorAll('.passage')].find(x => x.querySelector('.w') && !x.querySelector('.hit')); if (pw && B.querySelector('#vocab .q')) { const s = pw.querySelector('.w:not(.missw)'); if (s) { s.click(); return 'word'; } }
        const go = B.querySelector('#go'); if (vis(go)) { click(go); return 'speak-go'; }
        const ok = B.querySelector('#ok'); if (vis(ok)) { click(ok); return 'use-attempt'; }
        const pkGo = B.querySelector('#pkGo'); if (vis(pkGo)) { click(pkGo); return 'pk-go'; }
        const skip = B.querySelector('[data-a="skip"]'); if (vis(skip)) { click(skip); return 'skip-mic'; }
        const rGo = B.querySelector('#rGo'); if (vis(rGo)) { click(rGo); return 'rec-go'; }
        const send = B.querySelector('#rSend, #send'); if (vis(send)) { click(send); return 'send'; }
        return 'wait';
      });
      if (did !== 'wait' && did !== 'word' && did !== 'mcq') log.push('  ' + did);
      await page.waitForTimeout(did === 'wait' ? 1200 : 300); continue;
    }
    await page.waitForTimeout(500);
  } } catch (e) { note('script error', `${String(e.message).slice(0, 200)} @ ${lastStep}`); }
  if (!pkSeen) note('pk', 'the Pecha Kucha presentation never ran');
  const S = await page.evaluate(() => ({ fx: window.__dbg.S.events.filter(e => /^story\.(emote|title|flashback)$/.test(e.type)).length, thoughts: window.__thoughts || 0, events: window.__dbg.S.events.length, stars: window.__dbg.S.stars, vars: window.__dbg.S.vars, done: window.__dbg.S.done }));
  return { minutes: ((Date.now() - t0) / 60000).toFixed(1), viewport: VIEW, issues, log: log.filter((l, i, a) => a.indexOf(l) === i), state: S };
}
