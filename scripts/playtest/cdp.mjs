// A very small browser driver for the playtests: starts a headless Chrome and talks to it over the
// Chrome DevTools Protocol with Node's built-in WebSocket (Node 22+). No packages to install.
//   import { launch } from "./cdp.mjs";
//   const b = await launch(); const page = await b.page({ width: 1024, height: 768 });
//   await page.goto(url); await page.click("#mainDeck"); await page.shot("out.png"); await b.close();
// click() uses real mouse events and refuses to click something another element covers — that is
// how an overlapped button is caught.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  join(process.env.LOCALAPPDATA || "", "ms-playwright/chromium-1248/chrome-win64/chrome.exe"),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].filter(Boolean);

export async function launch({ headless = true } = {}) {
  const exe = CANDIDATES.find(p => existsSync(p));
  if (!exe) throw new Error("No Chrome found; set CHROME_PATH");
  const profile = mkdtempSync(join(tmpdir(), "pk-cdp-"));
  const proc = spawn(exe, [headless ? "--headless=new" : "", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "about:blank"].filter(Boolean), { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ""; const t = setTimeout(() => reject(new Error("Chrome did not start")), 20000);
    proc.stderr.on("data", d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
    proc.on("exit", c => reject(new Error("Chrome exited " + c)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiting = new Map(), listeners = new Set();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else listeners.forEach(fn => fn(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { waiting.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

  async function page({ width = 1024, height = 768, init = "" } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const S = (method, params) => send(method, params, sessionId);
    const errors = [];
    listeners.add(m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === "Runtime.exceptionThrown") errors.push("pageerror: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console: " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    });
    await S("Page.enable"); await S("Runtime.enable");
    await S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    if (init) await S("Page.addScriptToEvaluateOnNewDocument", { source: init });
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const evaluate = async (expr) => {
      const r = await S("Runtime.evaluate", { expression: typeof expr === "function" ? `(${expr})()` : expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error("evaluate: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const waitFor = async (expr, timeout = 15000, what = "") => {
      const end = Date.now() + timeout;
      for (;;) { try { const v = await evaluate(expr); if (v) return v; } catch (e) {} if (Date.now() > end) throw new Error("waitFor timed out: " + (what || String(expr).slice(0, 120))); await sleep(80); }
    };
    return {
      errors, evaluate, waitFor, sleep,
      raw: S,                                   // any other DevTools command for this page
      on(method, fn) { const l = m => { if (m.sessionId === sessionId && m.method === method) fn(m.params); }; listeners.add(l); return () => listeners.delete(l); },
      setViewport: (w, h) => S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }),
      async goto(url) { await S("Page.navigate", { url }); await waitFor("document.readyState === 'complete'", 20000, "load " + url); },
      waitForSelector: (sel, timeout) => waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })()`, timeout, sel),
      // Real click at the element's centre. Fails if the element is missing, disabled, off screen or covered.
      async click(sel, { timeout = 8000 } = {}) {
        const end = Date.now() + timeout; let why = "";
        for (;;) {
          const r = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return { why: "not found" };
            e.scrollIntoView({ block: "center", inline: "center" }); const b = e.getBoundingClientRect();
            if (!b.width || !b.height) return { why: "not visible" }; if (e.disabled) return { why: "disabled" };
            const x = b.left + b.width / 2, y = b.top + b.height / 2;
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { why: "outside the screen" };
            const top = document.elementFromPoint(x, y);
            if (top !== e && !e.contains(top)) return { why: "covered by " + (top ? (top.id ? "#" + top.id : top.className || top.tagName) : "nothing") };
            return { x, y }; })()`);
          if (r.x !== undefined) {
            await S("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
            await S("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
            await S("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
            return;
          }
          why = r.why;
          if (Date.now() > end) throw new Error(`click ${sel}: ${why}`);
          await sleep(100);
        }
      },
      async type(sel, text) { await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event("input", { bubbles: true })); })()`); },
      async shot(file, { fullPage = false } = {}) {
        mkdirSync(dirname(file), { recursive: true });
        const r = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage });
        writeFileSync(file, Buffer.from(r.data, "base64"));
      },
      offline: on => S("Network.emulateNetworkConditions", { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
      close: () => send("Target.closeTarget", { targetId }),
    };
  }
  return { page, async close() { try { ws.close(); } catch (e) {} proc.kill(); await new Promise(r => setTimeout(r, 300)); try { rmSync(profile, { recursive: true, force: true }); } catch (e) {} } };
}

// Speech that ends at once, so a run takes seconds instead of minutes.
export const FAKE_SPEECH = `(() => { const fake = { speaking: false, pending: false, paused: false, onvoiceschanged: null, getVoices: () => [], cancel() {}, pause() {}, resume() {}, speak(u) { setTimeout(() => u.onend && u.onend({}), 30); } };
  try { Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true }); } catch (e) {} })();`;
