// SDG 4 Pecha Kucha Stage, in a real (headless) browser:
//   A. the 3D stage: the loading bar, a whole formal talk at ?fast=1 (2 s a slide), the ending with chips,
//      then clean stills of several slides' cues; at desktop (tier 3, pinned with ?q=high), a tablet (the tier the
//      device gets) and a phone (?q=low). No console errors; the harbor game still loads.
//   B. the teacher's SDG 4 page: seeded talks → the class page, one student, one talk, sending reports
//      (a talk that was left is withheld and named), Excel.
//   node scripts/playtest/sdg4-stage-check.mjs [outDir]
// Needs the backend on http://127.0.0.1:8000 with a throw-away database (admin@example.com / AdminPass123) and
// network access (three.js comes from a CDN). Headless Chrome renders WebGL in software: frame rates here say
// nothing about real devices; draw calls, triangles and light counts do.
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
// The test backend serves the frontend folder under /static (production serves the built site at the root).
const GAME = process.env.GAME || BASE + "/static/games/innovation-harbor";
const OUT = process.argv[2] || ".playwright-mcp/sdg4";
const ONLY = process.env.ONLY || "";          // "stage" or "teacher" to run one half
const problems = [], notes = [];
const STILL_MS = Number(process.env.STILL_MS || 9000);   // software rendering is slow: give a cue time to settle before the still
const problem = (where, what) => { problems.push(`${where}: ${what}`); console.error("PROBLEM", where, what); };
const api = async (method, path, body, token) => {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const admin = (await api("POST", "/auth/login", { email: "admin@example.com", password: "AdminPass123" })).body;
if (!admin || !admin.access_token) { console.error("Cannot sign in as admin. Is the test backend running?"); process.exit(2); }
const T = admin.access_token;
const tag = Date.now().toString(36);
const people = ["Lin Mei", "Chen Wei", "Wu Hao", "Tsai Yu"].map((name, i) => ({ name, email: `s4-${tag}-${i}@example.com`, password: "TalkPass123", role: "student" }));
await api("POST", "/teacher/users/bulk", { users: people }, T);
const sign = async p => (await api("POST", "/auth/login", { email: p.email, password: p.password })).body;
const students = []; for (const p of people) students.push(await sign(p));
if (!students[0] || !students[0].access_token) { console.error("Could not create the test students."); process.exit(2); }

const browser = await launch({ webgl: true });
const user = u => `localStorage.clear(); localStorage.setItem("user", ${JSON.stringify(JSON.stringify(u))});`;
const PART = n => (n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : n <= 12 ? 4 : n <= 16 ? 5 : 6);

// ── A. the stage ──
async function stage(name, size, query, who, { whole = false, stills = [] } = {}) {
  const [w, h] = size;
  const page = await browser.page({ width: w, height: h });
  try {
    await page.goto(BASE + "/health");
    await page.evaluate(user(who));
    const t0 = Date.now();
    await page.goto(`${GAME}/sdg4-stage.html?${query}`);
    await page.sleep(400);
    const loading = await page.evaluate(`(() => { const c = document.querySelector("#loading .card"); if (!c) return null; const r = c.getBoundingClientRect(); return { hidden: document.getElementById("loading").hidden, pct: document.getElementById("loadPct").textContent, label: document.getElementById("loadLabel").textContent, fits: r.left >= 0 && r.right <= innerWidth + 1, over: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
    if (!loading) problem(name, "no loading card");
    else { if (!loading.fits || loading.over) problem(name, "the loading card does not fit the screen: " + JSON.stringify(loading)); if (!loading.hidden) await page.shot(`${OUT}/${name}-loading.png`); }
    await page.waitFor("window.__stageReady === true", 150000, "the stage is ready");
    const loadSec = ((Date.now() - t0) / 1000).toFixed(1);
    const bar = await page.evaluate(`document.getElementById("loadPct").textContent`);
    if (bar !== "100%") problem(name, "the loading bar ended at " + bar);
    await page.waitFor(`!!document.querySelector("#map:not([hidden]) #mapGo")`, 30000, "the talk map");
    await page.sleep(600);
    await page.click("#mapGo");
    await page.waitFor(`!document.getElementById("tele").hidden`, 240000, "on stage");
    await page.sleep(1500);
    await page.shot(`${OUT}/${name}-on-stage.png`);
    const info = async () => JSON.parse(await page.evaluate(`JSON.stringify({ ...__dbg.perfInfo(), ...__dbg.C.stageInfo() })`));
    const first = await info();
    if (whole) {
      await page.waitFor(`/^6 \\//.test(document.getElementById("teleCount").textContent)`, 240000, "slide 6"); await page.sleep(1300);
      await page.shot(`${OUT}/${name}-talk-slide06.png`);
      // Ms. Lin's last bubble waits for "Continue": press whatever bubble button is up until the ending card shows
      const end0 = Date.now();
      while (!(await page.evaluate(`!document.getElementById("ending").hidden`))) {
        if (Date.now() - end0 > 480000) throw new Error("the ending never showed");
        await page.evaluate(`(() => { const b = [...document.querySelectorAll("#labels button, .bubble button, button")].find(x => /Continue/.test(x.textContent) && x.offsetParent); if (b) b.click(); })()`);
        await page.sleep(1500);
      }
      await page.sleep(800);
      await page.shot(`${OUT}/${name}-ending.png`);
      const end = await page.evaluate(`(() => { const c = document.querySelector(".chips-end"); return { chips: !!c, text: c ? c.textContent.trim().slice(0, 160) : "", over: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
      if (!end.chips) problem(name, "the ending shows no chips block");
      notes.push(`${name}: ending chips block: “${end.text}”`);
    }
    // clean stills of single cues: the overlays are hidden and the cue is called directly, as the talk does
    for (const n of stills) {
      await page.evaluate(`(() => { for (const id of ["ending", "tele", "hud", "map"]) { const e = document.getElementById(id); if (e) e.hidden = true; } const s = __dbg.SLIDES[${n - 1}]; __dbg.C.cue(s.cue, 4, 0.5); window.__cueNote = s.cue.note; })()`);
      await page.sleep(STILL_MS);
      await page.shot(`${OUT}/${name}-cue-slide${String(n).padStart(2, "0")}.png`);
    }
    if (stills.length) { await page.evaluate(`__dbg.C.finale()`); await page.sleep(STILL_MS * 2); await page.shot(`${OUT}/${name}-finale.png`); }
    const last = await info();
    notes.push(`${name} (${w}×${h}, ?${query}): ready in ${loadSec} s; tier ${first.tier}→${last.tier} (${last.steps} step-downs), ${last.lights} spot lights, ${last.beams} beams, ${last.drawCalls} draw calls, ${last.triangles} triangles, pixel ratio ${last.pixelRatio}, ${last.fps} fps in software rendering`);
    page.errors.filter(e => !/favicon/.test(e)).forEach(e => problem(name + " browser", e));
  } catch (e) { problem(name, e.message); await page.shot(`${OUT}/error-${name}.png`).catch(() => {}); }
  finally { await page.close(); }
}
if (ONLY !== "teacher") {
  const SIZES = (process.env.SIZES || "desktop,tablet,phone").split(",");
  if (SIZES.includes("desktop")) await stage("desktop-high", [1366, 768], "quick=1&fast=1&speed=6&mode=formal&lv=A2&q=high", students[0], { whole: true, stills: [1, 4, 6, 11, 14] });
  if (SIZES.includes("tablet")) await stage("tablet-auto", [768, 1024], "quick=1&fast=1&speed=6&mode=practice&lv=A2", students[1], { whole: true, stills: [6] });
  if (SIZES.includes("phone")) await stage("phone-low", [390, 844], "quick=1&fast=1&speed=3&mode=formal&lv=B1&q=low", students[2], { whole: true, stills: [4, 20] });
  // the other game shares scene.js / camera.js: it must still start
  const page = await browser.page({ width: 1024, height: 768 });
  try {
    await page.goto(BASE + "/health"); await page.evaluate(user(students[0]));
    await page.goto(GAME + "/index.html");
    await page.waitFor(`(() => { const l = document.getElementById("loading"); return l && l.hidden; })()`, 150000, "the harbor game finished loading");
    await page.sleep(1500); await page.shot(`${OUT}/harbor-still-loads.png`);
    const post = await page.evaluate(`!!document.body.classList.contains("vignette-lite")`);
    if (post) problem("harbor", "the cinematic look leaked into the harbor game");
    page.errors.filter(e => !/favicon/.test(e)).forEach(e => problem("harbor browser", e));
    notes.push("harbor game: loads, no errors, no cinematic pass");
  } catch (e) { problem("harbor", e.message); } finally { await page.close(); }
}

// ── B. the teacher's page ──
async function talk(s, id, { mode = "formal", hit = 16, miss = 4, finish = true, leave = 0, redo = [] } = {}) {
  const run = (await api("POST", "/learning/runs", { game: "sdg4-stage", chapter: "4-1", level: "A2", client_id: `${tag}-${id}`, client: `${mode} · Mozilla/5.0 (Windows NT 10.0) playtest` }, s.access_token)).body;
  const ev = []; let t = 0; const add = (type, data, dt = 0.5) => { t += dt; ev.push({ seq: ev.length + 1, t, type, detail: "", data }); };
  add("run.start", { level: "A2", mode, quick: false, load_ms: 5200, intro_ms: 8000, hq: id.charCodeAt(0) % 2 === 0, mobile: id.charCodeAt(1) % 2 === 0, vw: 1366, vh: 768, speech: "listen" });
  add("phase", { phase: "walk", prev: "pier", prev_ms: 38000 }, 38); add("phase", { phase: "backstage", prev: "walk", prev_ms: 14000 }, 14); add("phase", { phase: "present", prev: "backstage", prev_ms: 26000 }, 26);
  for (let n = 1; n <= 20; n++) {
    if ([1, 4, 7, 10, 13, 17].includes(n)) { add("pk.part", { part: PART(n) }); add("pk.part.read", { part: PART(n), ms: 5000 }, 5); }
    add("pk.slide.start", { slide: n, part: PART(n), attempt: 1 });
    let attempts = 1;
    if (redo.includes(n)) { add("pk.redo", { slide: n, attempt: 1 }, 9); add("pk.slide.start", { slide: n, part: PART(n), attempt: 2 }); attempts = 2; }
    if (leave === n) { add("page.hide", { phase: "present", slide: n }, 7); break; }
    const wobble = ((n * 7) % 5) - 2, h = Math.max(0, Math.min(20, hit + wobble - (n === 6 || n === 14 ? 6 : 0)));
    add("pk.slide", { slide: n, part: PART(n), heard: h / 20, hit: h, miss: 20 - h, words: 20, said_words: h + 1, engine: "listen", missed: ["laboratory", "inequality", "stereotypes", "semiconductor"].slice(0, Math.min(4, Math.ceil((20 - h) / 4))),
      dwell_ms: 20000 + 9000 * (attempts - 1), attempt_ms: 20000, attempts, redo: attempts - 1 }, 20);
  }
  if (finish && !leave) { add("phase", { phase: "ending", prev: "present", prev_ms: 425000 }); add("ending", { key: mode, phases: { load: 5200, intro: 8000, pier: 38000, walk: 14000, backstage: 26000, present: 425000, ending: 4000 } }); }
  await api("POST", "/learning/events", { run_id: run.run_id, events: ev }, s.access_token);
  if (finish && !leave) await api("POST", `/learning/runs/${run.run_id}/finish`, { ending: mode, metrics: { mode, slideSec: mode === "formal" ? 20 : 30 } }, s.access_token);
  return run.run_id;
}
if (ONLY !== "stage") {
  await talk(students[0], "aa", { mode: "practice", hit: 11, redo: [3, 6] }); await talk(students[0], "ab", { hit: 15 }); await talk(students[0], "ac", { hit: 18 });
  await talk(students[1], "ba", { leave: 5 }); await talk(students[1], "bb", { hit: 14, redo: [6] });          // gave up, then finished
  await talk(students[2], "ca", { leave: 2 }); const leftRun = await talk(students[2], "cb", { leave: 8 });     // never finished
  await talk(students[3], "da", { hit: 5 }); await talk(students[3], "db", { hit: 19 });                          // a jump
  const rep = (await api("GET", "/learning/sdg4/overview", null, T)).body;
  const xl = await fetch(BASE + "/learning/sdg4/export.xlsx", { headers: { Authorization: "Bearer " + T } });
  if (xl.status !== 200) problem("teacher", "Excel export answered " + xl.status);
  for (const [name, size] of [["teacher-desktop", [1366, 900]], ["teacher-phone", [390, 844]]]) {
    const page = await browser.page({ width: size[0], height: size[1] });
    try {
      await page.goto(BASE + "/health"); await page.evaluate(user(admin));
      await page.goto(BASE + "/pages/teacher_dashboard.html");
      await page.waitFor(`typeof setModule === "function" && typeof loadSdg4 === "function"`, 20000, "dashboard scripts");
      await page.evaluate(`setModule("sdg4")`);
      await page.waitFor(`!!document.querySelector("#s4Root .s4-kpis") && document.querySelectorAll("#s4Root .s4-chart").length >= 2`, 20000, "the class page");
      await page.sleep(500);
      const over = () => page.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`);
      if (await over()) problem(name, "the class page scrolls sideways");
      await page.shot(`${OUT}/${name}-class.png`, { fullPage: true });
      const seen = await page.evaluate(`(() => { const t = document.getElementById("s4Root").textContent; return { recovered: t.includes("放棄後又完成"), never: t.includes("還沒完成過"), anomalies: document.querySelectorAll("#s4Root .s4-anom > li").length, picks: document.querySelectorAll("#s4Root [data-pick]").length, withheld: t.includes("放棄，不發") }; })()`);
      if (!seen.recovered || !seen.never || !seen.withheld || (name === "teacher-desktop" && !seen.picks)) problem(name, "the class page misses a state or the report column: " + JSON.stringify(seen));
      if (name === "teacher-desktop") {
        // the page draws itself again when the watch list and the report list arrive: wait for that, then click
        await page.sleep(1500);
        await page.click("#s4Root .s4-table .s4-link[data-student]").catch(async () => { await page.sleep(1000); await page.evaluate(`document.querySelector("#s4Root .s4-table .s4-link[data-student]").click()`); });
        await page.waitFor(`document.querySelector("#s4Root .s4-crumb.now") === null && document.querySelectorAll("#s4Root .s4-crumb").length === 2`, 15000, "the student page");
        await page.sleep(400); await page.shot(`${OUT}/${name}-student.png`, { fullPage: true });
        await page.click("#s4Root [data-run]");
        await page.waitFor(`!!document.querySelector("#s4Root .s4-crumb.now")`, 15000, "the talk page");
        await page.sleep(400); await page.shot(`${OUT}/${name}-talk.png`, { fullPage: true });
        if (await over()) problem(name, "the talk page scrolls sideways");
        await page.click(`#s4Root [data-go="class"]`);
        await page.waitFor(`!!document.getElementById("s4PickAll")`, 15000, "back on the class page");
        await page.click("#s4PickAll"); await page.sleep(200);
        await page.evaluate(`document.getElementById("s4Note").value = "Slide 6 is the hard one. Practise the red words, then try the real 20 seconds."`);
        await page.click("#s4Send");
        await page.waitFor(`!!document.querySelector("#s4Root .s4-sendresult")`, 15000, "the result of sending");
        await page.sleep(400); await page.shot(`${OUT}/${name}-reports-sent.png`);
        const res = await page.evaluate(`document.querySelector("#s4Root .s4-sendresult").textContent.replace(/\\s+/g, " ").trim().slice(0, 200)`);
        notes.push(`teacher: after sending → “${res}”`);
        if (!/中途離開/.test(res)) problem(name, "sending did not remind the teacher of the student who gave up: " + res);
        const w = await api("POST", "/teacher/reports/sdg4-run", { run_ids: [leftRun] }, T);
        if (!(w.body.sent === 0 && w.body.withheld.length === 1)) problem("teacher", "a talk that was left was not withheld: " + JSON.stringify(w.body));
      }
      page.errors.filter(e => !/favicon/.test(e)).forEach(e => problem(name + " browser", e));
    } catch (e) { problem(name, e.message); await page.shot(`${OUT}/error-${name}.png`).catch(() => {}); }
    finally { await page.close(); }
  }
  notes.push(`teacher: ${rep.overview.runs} talks counted, ${rep.overview.finished} finished, states ${JSON.stringify(rep.states)}, ${rep.anomalies.length} students flagged`);
}
await browser.close();
console.log(JSON.stringify({ notes, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
