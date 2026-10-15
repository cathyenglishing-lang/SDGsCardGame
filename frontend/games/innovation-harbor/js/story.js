// Story runner: station labels in the world + the chapter's node graph (see story/graph.js, story/chapter1.js).
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { scene } from "./world/scene.js";
import { STATIONS } from "./world/harbor.js";
import { S } from "./state.js";
import { renderHud } from "./ui/sheet.js";
import { StoryGraph } from "./story/graph.js";
import { chapter1Nodes, runEnding } from "./story/chapter1.js";

// ── station labels in the 3D world ──
const tags = {};
export function buildStationLabels() {
  for (const [k, st] of Object.entries(STATIONS)) {
    const el = document.createElement("div"); el.className = "tag"; el.textContent = st.name;
    const o = new CSS2DObject(el); o.position.set(...st.label); o.center.set(0.5, 1); scene.add(o); tags[k] = { el, o, state: "" };
  }
}
export function markStations(target) {
  for (const [k, t] of Object.entries(tags)) t.el.className = "tag" + (k === target ? " target" : t.state === "done" ? " done" : "");
}
export function tagDone(key) { if (tags[key]) { tags[key].state = "done"; markStations(null); } }

export async function runStory(ctx) {
  const graph = new StoryGraph(chapter1Nodes(ctx), ctx);
  ctx.graph = graph;
  await graph.run();
  S.stage = 6; renderHud();
  await runEnding(ctx);
}
