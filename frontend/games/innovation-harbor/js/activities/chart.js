// Harbor chart (side activity for the lighthouse trip): an SVG map of the harbor approach
// showing HARBOR-AI's claimed "North Channel" straight through the breakwater against the real
// channel east of the green light. One question checks the student read the chart, not the AI.
import { esc } from "../util.js";
import { log } from "../telemetry.js";
import { openSheet, closeSheet, finishRow, hintP } from "../ui/sheet.js";
import { mcq } from "./common.js";

// world → chart: x -70..110 → 0..400, z 10..-100 → 0..300 (sea is down)
const X = x => ((x + 70) * 400 / 180).toFixed(0), Y = z => ((10 - z) * 300 / 110).toFixed(0);

export function chartSvg({ aiRoute = true, realRoute = true } = {}) {
  return `<svg class="chart" viewBox="0 0 400 300" role="img" aria-label="Harbor chart">
    <rect x="0" y="0" width="400" height="300" fill="#0d2a3d"/>
    <rect x="0" y="0" width="400" height="${Y(1.6)}" fill="#3a4a3a"/>
    <text x="8" y="16" class="ct">INNOVATION HARBOR</text>
    <rect x="${X(6.7)}" y="${Y(1.6)}" width="${(6.6 * 400 / 180).toFixed(0)}" height="${(24 * 300 / 110).toFixed(0)}" fill="#8d8f8c"/>
    <text x="${X(14)}" y="${Y(-14)}" class="cl">Ferry pier</text>
    <rect x="${X(-62)}" y="${Y(-3)}" width="${(48 * 400 / 180).toFixed(0)}" height="${(11 * 300 / 110).toFixed(0)}" rx="6" fill="#1e2d3f" stroke="#9db0bf"/>
    <text x="${X(-58)}" y="${Y(-20)}" class="cl">Container ship (moored)</text>
    <g transform="translate(${X(58)} ${Y(-43)}) rotate(26)"><rect x="-62" y="-7" width="124" height="14" fill="#6a717b" stroke="#c9cfd6" stroke-width="2"/><text x="0" y="-12" text-anchor="middle" class="cw">BREAKWATER — solid, no gap</text></g>
    <circle cx="${X(80)}" cy="${Y(-55)}" r="5" fill="#2dff6a"/><text x="${X(82)}" y="${Y(-51)}" class="cl">green light</text>
    <circle cx="${X(-4)}" cy="${Y(-34)}" r="4" fill="#ff2a1a"/><circle cx="${X(-30)}" cy="${Y(-50)}" r="4" fill="#ff2a1a"/><circle cx="${X(24)}" cy="${Y(-34)}" r="4" fill="#2dff6a"/>
    <text x="${X(-30)}" y="${Y(-57)}" class="cl">red buoys — keep them on your LEFT</text>
    <circle cx="${X(70)}" cy="${Y(-70)}" r="10" fill="#59606a"/><circle cx="${X(70)}" cy="${Y(-70)}" r="3.5" fill="#ffd59a"/><text x="${X(70)}" y="${Y(-83)}" text-anchor="middle" class="cl">Lighthouse</text>
    ${aiRoute ? `<path d="M ${X(4)} ${Y(-18)} L ${X(62)} ${Y(-62)}" stroke="#ff4d3a" stroke-width="2.5" stroke-dasharray="6 4" fill="none"/><text x="${X(26)}" y="${Y(-28)}" class="cr">HARBOR-AI "North Channel"</text>` : ""}
    ${realRoute ? `<path d="M ${X(4)} ${Y(-18)} C ${X(40)} ${Y(-20)}, ${X(90)} ${Y(-38)}, ${X(88)} ${Y(-58)} S ${X(70)} ${Y(-62)}, ${X(62)} ${Y(-62)}" stroke="#5fc79b" stroke-width="2.5" stroke-dasharray="2 5" fill="none"/><text x="${X(60)}" y="${Y(-30)}" class="cg">safe channel: east, around the green light</text>` : ""}
  </svg>`;
}

// resolves { wrong }
export async function actChart() {
  const body = openSheet("Harbor chart · Verify", "Where is the safe channel?", "安全航道在哪裡？");
  body.innerHTML = hintP("HARBOR-AI says the fastest route is the \"North Channel\" straight through the breakwater. Read the chart before you believe it.", "HARBOR-AI 說最快的路是直接穿過防波堤的「北航道」。相信它之前，先看海圖。") + chartSvg() + `<div id="q"></div>`;
  log("chart.open", "harbor chart", {});
  const wrong = await mcq(body.querySelector("#q"), "According to the chart, how do you reach the lighthouse safely?", [
    { text: "Straight through the breakwater gap — the AI's North Channel", correct: false },
    { text: "East, around the green light, with the red buoys on your left", correct: true },
    { text: "West, between the container ship and the quay", correct: false },
  ], "照海圖，怎麼安全到燈塔？");
  log("chart.answer", `wrong ${wrong}`, { wrong });
  await finishRow(body, wrong === 0 ? 3 : wrong === 1 ? 2 : 1, wrong === 0 ? "Right. The chart shows a solid breakwater — the AI's channel does not exist." : "The breakwater is solid on the chart. The AI's channel does not exist.", "海圖上防波堤是實心的，AI 說的航道並不存在。");
  closeSheet();
  return { wrong };
}
