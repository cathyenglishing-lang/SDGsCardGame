async (page) => {
  const URL = 'http://127.0.0.1:8766/games/innovation-harbor/index.html' + (globalThis.__q || '');
  const issues = [], log = [], shots = [];
  const note = (k, d) => issues.push(k + ': ' + d);
  await page.goto(URL);
  await page.waitForSelector('#intro:not([hidden])', { timeout: 120000 });
  await page.click('#startBtn');
  await page.waitForSelector('#skipCine:not([hidden])', { timeout: 30000 }); await page.waitForTimeout(500); await page.click('#skipCine');
  await page.evaluate(async () => {
    const THREE = await import('three');
    const H = await import('/games/innovation-harbor/js/world/harbor.js');
    const C = await import('/games/innovation-harbor/js/world/camera.js');
    const { scene, camera } = await import('/games/innovation-harbor/js/world/scene.js');
    window.__t = { THREE, PATHS: H.PATHS, rig: C.rig, scene, camera };
  });
  const PATHKEY = { 'Ferry Pier': 'arrive', 'AI Lab': 'pierToLab', 'Harbor Archive': 'labToArchive', 'Port Council': 'archiveToCouncil', 'Innovation Workshop': 'councilToWorkshop', 'Waterfront Theater': 'workshopToTheater' };
  const offscreenButtons = () => page.evaluate(() => [...document.querySelectorAll('button, .opt, .hchip, .passage.sel-able, .joy')].filter(b => { if (b.closest('[hidden]') || !b.offsetParent && getComputedStyle(b).position !== 'fixed') return false; const r = b.getBoundingClientRect(); if (!r.width) return false; const sc = b.closest('.body, #shBody, .tbl'); if (sc) return false; return r.top < 0 || r.left < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; }).map(b => (b.id || b.className) + ':' + (b.textContent || '').trim().slice(0, 20)));
  const speakerCheck = () => page.evaluate(() => {
    const b = document.querySelector('#labels .bubble'); if (!b) return null;
    const who = b.querySelector('.bname').childNodes[0].textContent.trim();
    const map = { 'Harbor Master Mei': 'mei', 'Kai': 'kai', 'Dr. Hsu': 'hsu', 'Councillor Wang': 'wang' };
    const a = window.__dbg[map[who]]; const r = b.getBoundingClientRect(); const nx = b.querySelector('.bnext, .opt')?.getBoundingClientRect();
    const res = { who, bubbleOn: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, btnOn: !!nx && nx.top >= 0 && nx.bottom <= innerHeight };
    if (a) {
      const { THREE, scene, camera } = window.__t; const h = new THREE.Vector3(); a.headWorld(h);
      const p = h.clone().project(camera); res.inView = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      const ray = new THREE.Raycaster(camera.position, h.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(h) - 0.3);
      const isActor = o => { for (; o; o = o.parent) if (o.userData.actor) return true; return false; };
      const hit = ray.intersectObjects(scene.children, true).find(x => x.object.isMesh && x.object.visible && !isActor(x.object) && !x.object.material?.transparent);
      res.occluded = !!hit;
    }
    return res;
  });
  const t0 = Date.now(); let lastKick = '', seenWho = new Set(), stepGuard = 0;
  while (Date.now() - t0 < 14 * 60 * 1000) {
    if (++stepGuard > 600) { note('loop', 'too many steps'); break; }
    if (await page.locator('#ending:not([hidden])').count()) { log.push('ENDING ' + await page.locator('#endCard .ending-title').textContent()); await page.screenshot({ path: '.playwright-mcp/report/pt-ending.jpg', type: 'jpeg', quality: 75 }); break; }
    // travel: walk with the keyboard along the sidewalk waypoints
    if (await page.locator('#travel:not([hidden])').count()) {
      const name = (await page.locator('#tvName').textContent()).split(' · ')[0];
      const key = PATHKEY[name]; const tStart = Date.now();
      await page.screenshot({ path: `.playwright-mcp/report/pt-travel-${key}.jpg`, type: 'jpeg', quality: 70 });
      const off = await offscreenButtons(); if (off.length) note('travel ' + name, 'off-screen: ' + off.join(', '));
      await page.keyboard.down('Shift');
      let wp = 0, lastPos = null, stuckFor = 0;
      while (await page.locator('#travel:not([hidden])').count()) {
        const st = await page.evaluate(({ key, wp }) => { const t = window.__t; const pts = t.PATHS[key]; const p = window.__dbg.player.pos; let i = wp; let w = pts[Math.min(i, pts.length - 1)]; let wx = w[0], wz = w.length === 3 ? w[2] : w[1]; if (Math.hypot(wx - p.x, wz - p.z) < 1.6 && i < pts.length - 1) { i++; w = pts[i]; wx = w[0]; wz = w.length === 3 ? w[2] : w[1]; } t.rig.orbit.theta = Math.atan2(-(wx - p.x), -(wz - p.z)); return { wp: i, pos: [p.x, p.z] }; }, { key, wp });
        wp = st.wp;
        await page.keyboard.down('w'); await page.waitForTimeout(250);
        if (lastPos && Math.hypot(st.pos[0] - lastPos[0], st.pos[1] - lastPos[1]) < 0.05) stuckFor += 250; else stuckFor = 0;
        lastPos = st.pos;
        if (stuckFor > 2500) { note('walk ' + name, `stuck at ${st.pos.map(v => v.toFixed(1))} heading to waypoint ${wp}`); await page.keyboard.up('w'); await page.screenshot({ path: `.playwright-mcp/report/pt-stuck-${key}.jpg`, type: 'jpeg', quality: 70 }); await page.click('#tvSkip'); break; }
        if (Date.now() - tStart > 90000) { note('walk ' + name, 'took >90 s'); await page.click('#tvSkip'); break; }
      }
      await page.keyboard.up('w'); await page.keyboard.up('Shift');
      log.push(`walked to ${name} in ${((Date.now() - tStart) / 1000).toFixed(0)} s`);
      await page.waitForTimeout(600); continue;
    }
    // dialogue / choice bubbles
    if (await page.locator('#labels .bubble').count()) {
      await page.waitForTimeout(900);
      const c = await speakerCheck();
      if (c) {
        if (!c.bubbleOn) note('bubble ' + c.who, 'bubble not fully on screen');
        if (!c.btnOn) note('bubble ' + c.who, 'Continue/option off screen');
        if (c.inView === false) note('speaker ' + c.who, 'speaker off screen');
        if (c.occluded) note('speaker ' + c.who, 'speaker hidden behind geometry');
        if (!seenWho.has(c.who + (c.occluded || c.inView === false))) { seenWho.add(c.who + (c.occluded || c.inView === false)); await page.screenshot({ path: `.playwright-mcp/report/pt-line-${c.who.replace(/\W+/g, '_')}-${shots.length}.jpg`, type: 'jpeg', quality: 70 }); shots.push(c.who); }
      }
      const opt = page.locator('#labels .bubble .opt').first();
      if (await opt.count()) { log.push('choice: ' + (await opt.textContent()).trim().slice(0, 40)); await opt.click({ force: true }); }
      else await page.locator('#labels .bubble .bnext').click({ force: true });
      await page.waitForTimeout(500); continue;
    }
    // card game frame
    if (await page.locator('.cardgame iframe').count()) {
      const f = page.frames().find(fr => fr.url().includes('pecha_kucha_builder'));
      await page.waitForTimeout(2500);
      await page.screenshot({ path: '.playwright-mcp/report/pt-cardgame.jpg', type: 'jpeg', quality: 70 });
      const n = await f.evaluate(() => totalToMatchAll());
      for (let i = 0; i < n; i++) {
        await f.evaluate(() => dealNextCard());
        await page.waitForTimeout(400);
        await f.evaluate(() => { const b = document.querySelector('#dealtCardHolder .listen-btn') || document.querySelector('#dealtCardHolder .card-inner'); b && b.click(); });
        const tL = Date.now(); await f.waitForFunction(() => canDrag, null, { timeout: 60000 }).catch(() => note('cardgame', 'card never became draggable (speech end)'));
        if (i === 0) log.push(`card listen unlocked after ${((Date.now() - tL) / 1000).toFixed(1)} s`);
        await f.evaluate(() => { const el = document.querySelector(`.subtopic-poker[data-sub-id="${currentCardData.subId}"]`); el.click(); });
        await page.waitForTimeout(300);
      }
      await f.waitForSelector('#pkBackHarbor', { timeout: 15000 });
      await f.click('#pkBackHarbor'); await page.waitForTimeout(2000); continue;
    }
    // activity sheet
    if (await page.locator('#sheet:not([hidden])').count()) {
      const kick = await page.locator('#shKick').textContent();
      if (kick !== lastKick) { lastKick = kick; log.push('activity: ' + kick); await page.waitForTimeout(400); await page.screenshot({ path: `.playwright-mcp/report/pt-act-${kick.replace(/\W+/g, '_')}.jpg`, type: 'jpeg', quality: 70 }); const off = await offscreenButtons(); if (off.length) note('activity ' + kick, 'off-screen: ' + off.join(', ')); }
      const did = await page.evaluate(async () => {
        const B = document.querySelector('#shBody'); const vis = el => el && !el.disabled && !el.hidden && el.offsetParent !== null;
        const click = el => { el.scrollIntoView({ block: 'nearest' }); el.click(); };
        const done = B.querySelector('.result .btn'); if (vis(done)) { click(done); return 'done'; }
        const next = [...B.querySelectorAll('.row .btn')].find(b => /Next slide/.test(b.textContent) && vis(b)); if (next) { click(next); return 'next'; }
        const play = B.querySelector('#play'); if (vis(play) && /not played/.test(B.querySelector('#pc')?.textContent || '')) { click(play); return 'play'; }
        const mcqOpt = [...B.querySelectorAll('.seq .opt')].find(b => vis(b) && !b.closest('#pool')); if (mcqOpt && !B.querySelector('#pool')) { click(mcqOpt); return 'mcq'; }
        const chip = [...B.querySelectorAll('.hchip:not(.used)')][0]; if (chip && B.querySelector('#chk')) { chip.click(); B.querySelector(`.passage.sel-able[data-no="${chip.dataset.no}"]`).click(); return 'match'; }
        const chk = B.querySelector('#chk'); if (vis(chk)) { click(chk); return 'check'; }
        const w = [...B.querySelectorAll('.passage .w:not(.missw):not(.hit)')].find(x => x.closest('.passage').onclick); if (w) { w.click(); return 'word'; }
        const pool = B.querySelector('#pool'); if (pool && pool.children.length) { const i = Math.min(...[...pool.querySelectorAll('.opt')].map(b => +b.dataset.i)); pool.querySelector(`.opt[data-i="${i}"]`).click(); return 'seq'; }
        const skip = B.querySelector('[data-a="skip"]'); if (vis(skip)) { click(skip); return 'skip-mic'; }
        const go = B.querySelector('#go'); if (vis(go)) { click(go); return 'speak-go'; }
        const ok = B.querySelector('#ok'); if (vis(ok)) { click(ok); return 'use-attempt'; }
        const pkGo = B.querySelector('#pkGo'); if (vis(pkGo)) { click(pkGo); return 'pk-go'; }
        const rGo = B.querySelector('#rGo'); if (vis(rGo)) { click(rGo); return 'rec-go'; }
        const send = B.querySelector('#rSend, #send'); if (vis(send)) { click(send); return 'send'; }
        return 'wait';
      });
      if (did !== 'wait' && did !== 'word') log.push('  ' + did);
      await page.waitForTimeout(did === 'wait' ? 1500 : 350); continue;
    }
    await page.waitForTimeout(600);
  }
  const ev = await page.evaluate(() => window.__dbg.S.events.length);
  return { minutes: ((Date.now() - t0) / 60000).toFixed(1), issues, log: log.filter((l, i, a) => a.indexOf(l) === i), events: ev };
}
