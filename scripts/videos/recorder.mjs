// Records a how-to video of the real site with a caption strip under it.
// The site runs in a frame at the top of the picture; the strip below shows the step number and one
// sentence of explanation, so the caption never covers what is being shown. Clicks are real mouse
// clicks (a red ring shows where). Frames go to ffmpeg as they arrive → a .webm file.
//   const rec = await startRecording(browser, { out: "docs/videos/student/x.webm", width: 1280, height: 720 });
//   await rec.open("/pages/login.html"); await rec.say("學生用老師發的帳號登入"); await rec.click("#go"); …
//   const steps = await rec.stop();     // [{ at: "0:07", text }] for the written guide
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const FFMPEG = [process.env.FFMPEG_PATH, join(process.env.LOCALAPPDATA || "", "ms-playwright/ffmpeg-1013/ffmpeg-win64.exe"), "ffmpeg"].filter(Boolean).find(p => p === "ffmpeg" || existsSync(p));
const STRIP = 96, FPS = 10;

export async function startRecording(browser, { out, width = 1280, height = 720, base = "http://127.0.0.1:8000", init = "" }) {
  mkdirSync(dirname(out), { recursive: true });
  const W = width, H = height + STRIP;
  const page = await browser.page({ width: W, height: H });
  const S = page.raw;
  await page.goto(base + "/health");
  // The outer page: the site in a frame, the caption strip, and a ring that marks each click.
  await page.evaluate(`(() => {
    document.documentElement.style.cssText = "margin:0;height:100%;background:#0f172a";
    document.body.style.cssText = "margin:0;height:100%;overflow:hidden;font-family:'Microsoft JhengHei','PingFang TC',Arial,sans-serif";
    document.body.innerHTML = '<iframe id="app" style="position:absolute;left:0;top:0;width:${W}px;height:${height}px;border:0;background:#fff"></iframe>'
      + '<div style="position:absolute;left:0;top:${height}px;width:${W}px;height:${STRIP}px;box-sizing:border-box;display:flex;align-items:center;gap:18px;padding:0 26px;background:#0f172a;color:#fff;border-top:3px solid #e0a92b">'
      + '<b id="capN" style="flex:0 0 auto;min-width:54px;height:54px;border-radius:50%;background:#e0a92b;color:#1b1838;display:grid;place-items:center;font-size:24px"></b>'
      + '<span id="capT" style="font-size:25px;line-height:1.35;font-weight:700"></span></div>'
      + '<div id="ring" style="position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.25);pointer-events:none;opacity:0;transition:opacity .25s;z-index:9"></div>';
  })()`);
  const inFrame = expr => `document.getElementById("app").contentWindow.eval(${JSON.stringify(expr)})`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const ff = spawn(FFMPEG, ["-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0", "-y", "-an", "-r", String(FPS),
    "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "6", "-crf", "34", "-b:v", "700k", "-row-mt", "1", "-pix_fmt", "yuv420p", out], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "", ffDone = false;
  ff.stderr.on("data", d => { ffErr += d; });
  ff.on("error", e => { ffErr += " spawn: " + e.message; ffDone = true; });
  ff.on("close", code => { ffDone = true; if (code) console.error("ffmpeg stopped early (" + code + "): " + ffErr.trim().slice(0, 400)); });
  ff.stdin.on("error", () => {});      // a closed pipe is reported by the line above, not by a crash
  let last = null, frames = 0;
  const off = page.on("Page.screencastFrame", p => { last = Buffer.from(p.data, "base64"); S("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {}); });
  await S("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const tick = setInterval(() => { if (last && ff.stdin.writable) { ff.stdin.write(last); frames++; } }, 1000 / FPS);
  const t0 = Date.now(), steps = [];
  // Time as the video will show it: frames written so far, not the wall clock (the two drift apart).
  const clock = () => { const s = Math.round(frames / FPS); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  const rec = {
    sleep,
    // Show a caption (and note it for the written guide), then leave it on screen long enough to read.
    async say(text, hold = 1600) {
      steps.push({ at: clock(), text });
      if (process.env.VIDEO_LOG) console.log(`  [${clock()}] ${steps.length}. ${text.slice(0, 40)}  (frames ${frames})`);
      await page.evaluate(`document.getElementById("capN").textContent = ${steps.length}; document.getElementById("capT").textContent = ${JSON.stringify(text)};`);
      await sleep(hold);
    },
    async open(path) {
      await page.evaluate(`(() => { const f = document.getElementById("app"); f.src = ${JSON.stringify(base + path)}; })()`);
      await sleep(400);
      await page.waitFor(`(() => { try { const d = document.getElementById("app").contentDocument; return d && d.readyState === "complete" && d.location.href !== "about:blank"; } catch (e) { return false; } })()`, 20000, "frame load " + path);
      if (init) await page.evaluate(inFrame(init)).catch(() => {});
      await sleep(500);
    },
    evaluate: expr => page.evaluate(inFrame(expr)),
    async waitFor(expr, timeout = 15000, what = "") {
      const end = Date.now() + timeout;
      for (;;) { try { if (await page.evaluate(inFrame(expr))) return; } catch (e) {} if (Date.now() > end) throw new Error("video: waitFor timed out: " + (what || expr.slice(0, 100))); await sleep(120); }
    },
    waitForSelector(sel, timeout) { return rec.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`, timeout, sel); },
    // Real click inside the frame (the frame sits at 0,0, so its coordinates are the screen's).
    async click(sel, { pause = 700 } = {}) {
      const end = Date.now() + 10000;
      for (;;) {
        const r = await page.evaluate(inFrame(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return { why: "not found" };
          e.scrollIntoView({ block: "center", inline: "center" }); const b = e.getBoundingClientRect(); if (!b.width || e.disabled) return { why: e.disabled ? "disabled" : "not visible" };
          const x = b.left + b.width / 2, y = b.top + b.height / 2, top = document.elementFromPoint(x, y);
          if (top !== e && !e.contains(top)) return { why: "covered" }; return { x, y }; })()`));
        if (r.x !== undefined) {
          await page.evaluate(`(() => { const g = document.getElementById("ring"); g.style.left = "${r.x}px"; g.style.top = "${r.y}px"; g.style.opacity = "1"; setTimeout(() => { g.style.opacity = "0"; }, 650); })()`);
          await sleep(380);
          await S("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
          await S("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
          await S("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
          await sleep(pause);
          return;
        }
        if (Date.now() > end) throw new Error(`video: click ${sel}: ${r.why}`);
        await sleep(150);
      }
    },
    // Type so that it can be seen: a few characters at a time.
    async type(sel, text, { blur = true } = {}) {
      await page.evaluate(inFrame(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: "center" }); e.focus(); e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); })()`));
      const step = Math.max(1, Math.ceil(text.length / 14));
      for (let i = step; i < text.length + step; i += step) {
        await page.evaluate(inFrame(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(text.slice(0, i))}; e.dispatchEvent(new Event("input", { bubbles: true })); })()`));
        await sleep(70);
      }
      if (blur) await page.evaluate(inFrame(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.dispatchEvent(new Event("change", { bubbles: true })); e.blur(); })()`));
      await sleep(350);
    },
    async stop() {
      await sleep(1200);
      clearInterval(tick); off();
      await S("Page.stopScreencast").catch(() => {});
      if (!ffDone) await new Promise(resolve => { ff.on("close", resolve); ff.stdin.end(); setTimeout(resolve, 60000); });   // never wait for ever
      await page.close();
      if (ffErr.trim()) console.error("ffmpeg:", ffErr.trim().slice(0, 300));
      return { steps, seconds: Math.round(frames / FPS), frames, out };
    },
  };
  return rec;
}
