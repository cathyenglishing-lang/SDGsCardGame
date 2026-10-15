// Story graph engine. A chapter is a list of NPC nodes; each node is one encounter with a goal.
// The engine shows every currently available node as a beacon, lets the player walk to any of
// them in any order, runs the encounter, records its outcome, and repeats until a final node ends.
//
// node = { id, title, place, spot: [x, z], radius?, stage?, requires?(vars, done) -> bool,
//          repeatable?: bool, final?: bool, run(ctx, graph) -> Promise<outcome> }
import { startRoam, stopRoam, setPrimary, groundY } from "../world/roam.js";
import { setFollow, fade } from "../world/camera.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { renderHud } from "../ui/sheet.js";
import { $, esc, wait } from "../util.js";

export class StoryGraph {
  constructor(nodes, ctx) { this.nodes = nodes; this.ctx = ctx; this.done = new Set(); this.visits = {}; }
  available() { return this.nodes.filter(n => !this.done.has(n.id) && (!n.requires || n.requires(S.vars, this.done))); }
  async run() {
    for (;;) {
      const avail = this.available();
      if (!avail.length) { log("node.none", "no available node"); return null; }
      const node = await this.goTo(avail);
      this.visits[node.id] = (this.visits[node.id] || 0) + 1;
      S.node = node.id; log("node.start", `${node.id} (visit ${this.visits[node.id]}, available: ${avail.map(n => n.id).join("/")})`, { node: node.id, visit: this.visits[node.id], available: avail.map(n => n.id) });
      if (node.stage != null) { S.stage = node.stage; renderHud(); }
      const outcome = await node.run(this.ctx, this);
      if (outcome !== "retry") { this.done.add(node.id); S.done.push(node.id); }
      log("node.done", `${node.id} → ${outcome ?? "ok"} | vars ${JSON.stringify(S.vars)}`, { node: node.id, outcome: outcome ?? "ok", vars: { ...S.vars } }); S.node = null;
      if (outcome === "END" || (node.final && outcome !== "retry")) return outcome;
    }
  }
  goTo(avail) {
    return new Promise(res => {
      const { player } = this.ctx;
      const here = avail.find(n => Math.hypot(player.pos.x - n.spot[0], player.pos.z - n.spot[1]) < (n.radius || 2.6));
      if (here) return res(here);
      const targets = avail.map(n => ({ id: n.id, x: n.spot[0], z: n.spot[1], radius: n.radius || 2.6, label: n.title, place: n.place }));
      targets.sort((a, b) => Math.hypot(player.pos.x - a.x, player.pos.z - a.z) - Math.hypot(player.pos.x - b.x, player.pos.z - b.z));
      let primary = targets[0].id;
      const render = ds => {
        $("#tvList").innerHTML = (ds || targets).map(t => `<button class="obj ${t.id === primary ? "primary" : ""}" type="button" data-id="${esc(t.id)}"><b>${esc(t.label)}</b><span>${esc(t.place)}${t.d != null ? ` · ${Math.round(t.d)} m` : ""}</span></button>`).join("");
      };
      render(); $("#travel").hidden = false;
      $("#tvList").onclick = e => { const b = e.target.closest(".obj"); if (!b) return; primary = b.dataset.id; setPrimary(primary); log("objective.pick", primary, { node: primary }); render(lastDs); };
      let lastDs = null, tick = 0;
      startRoam(player, targets, {
        onDistance: ds => { lastDs = ds; if (++tick % 15 === 0) render(ds); },
        onArrive: t => { $("#travel").hidden = true; setFollow(player); res(avail.find(n => n.id === t.id)); },
      });
      $("#tvSkip").onclick = async () => {
        stopRoam(); $("#travel").hidden = true;
        const n = avail.find(x => x.id === primary);
        log("move", `skip walk to ${n.id}`, { node: n.id, how: "skip" });
        await fade(true, 400); player.setPos(n.spot[0], groundY(n.spot[0], n.spot[1]), n.spot[1]); setFollow(player, { instant: true }); await wait(60); await fade(false, 400);
        res(n);
      };
    });
  }
}
