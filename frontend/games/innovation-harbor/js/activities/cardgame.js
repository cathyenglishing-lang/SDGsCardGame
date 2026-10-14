// Part 3 · Card Game: opens the platform's real Pecha Kucha Card Game (pecha_kucha_builder.html)
// in a full-screen frame, limited to this station's parts, and waits for its "pk-finished" message.
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { addStars } from "../ui/sheet.js";
import { starsFromErrors } from "../util.js";
import { fade } from "../world/camera.js";
import { setMuted, isMuted } from "../audio.js";

export async function actCardGame({ topic, parts }) {
  const q = new URLSearchParams({ topic, level: S.level, parts: parts.join(","), merge: "1", embed: "harbor" });
  const wrap = document.createElement("div"); wrap.className = "cardgame";
  wrap.innerHTML = `<header><b>Harbor Archive · Pecha Kucha Card Game</b><span>SDG ${topic} · ${S.level} · Parts ${parts[0]}–${parts[parts.length - 1]}</span></header>
    <iframe title="Pecha Kucha Card Game" src="/pages/pecha_kucha_builder.html?${q}" allow="autoplay"></iframe>`;
  const wasMuted = isMuted(); setMuted(true); // harbor ambience would cover the card game's read-aloud
  await fade(true, 450);
  document.getElementById("ui").appendChild(wrap);
  log("cardgame.open", `topic ${topic} parts ${parts.join(",")} level ${S.level}`);
  await fade(false, 350);
  const result = await new Promise(res => {
    const onMsg = e => {
      if (e.origin !== location.origin || e.source !== wrap.querySelector("iframe").contentWindow || e.data?.type !== "pk-finished") return;
      removeEventListener("message", onMsg); res(e.data);
    };
    addEventListener("message", onMsg);
  });
  await fade(true, 450);
  wrap.remove(); setMuted(wasMuted);
  const errors = Number(result.errors) || 0, repeats = Number(result.repeats) || 0;
  S.metrics.cardErrors += errors;
  log("card.done", `errors ${errors} repeats ${repeats} time ${result.seconds}s (platform card game)`);
  await fade(false, 450);
  addStars(starsFromErrors(errors), "Card Game");
}
