// English-first UI. Every piece of text can carry an optional Chinese hint
// behind a small "中" button; each reveal is logged as a learning event.
import { esc } from "./util.js";
import { log } from "./telemetry.js";
import { S } from "./state.js";

export const UI = {
  continue: "Continue",
  goTo: "Go to",
  go: "Walk there",
  skipWalk: "Skip walk",
  play: "Play",
  replay: "Play again",
  check: "Check",
  done: "Done",
  next: "Next",
  startSpeaking: "Start speaking",
  stop: "Stop",
  useThis: "Use this attempt",
  demo: "Listen to a model",
  startRecording: "Start recording",
  reRecord: "Record again",
  sendTeacher: "Send to teacher",
  retry: "Retry",
  skipMic: "Skip (marked incomplete)",
  startPresenting: "Start presenting",
  presentAgain: "Present again",
  learningLog: "Learning Log",
  close: "Close",
  playAgain: "Play again with different choices",
  seeLog: "See the Learning Log",
  integrity: "Integrity",
  stars: "Stars",
};

export function hint(zh) {
  if (!zh) return "";
  return `<span class="zh-hint"><button class="zh-btn" type="button" aria-label="Show Chinese hint">中</button><span class="zh-text" hidden>${esc(zh)}</span></span>`;
}

// One delegated handler for every hint button on the page (including CSS2D bubbles).
export function wireHints() {
  document.addEventListener("click", e => {
    const b = e.target.closest(".zh-btn"); if (!b) return;
    e.stopPropagation();
    const t = b.nextElementSibling; t.hidden = !t.hidden; b.classList.toggle("on", !t.hidden);
    // A choice bubble has one 中 button (on the question) that also reveals every option's Chinese line.
    b.closest(".bubble.choice")?.querySelectorAll(".opt-zh").forEach(x => x.hidden = t.hidden);
    if (!t.hidden) { S.metrics.zhHints++; log("hint.zh", t.textContent.slice(0, 40), { text: t.textContent.slice(0, 60) }); }
  }, true);
}
