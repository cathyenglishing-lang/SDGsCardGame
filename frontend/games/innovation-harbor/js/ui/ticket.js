// The ferry ticket: a boarding-pass style card the ticket officer checks when the Envoy lands.
// Its back explains what the game is for (a Pecha Kucha talk), how Pecha Kucha works and how the
// six stops train the six parts of the talk. Re-openable any time from the HUD ("Ticket").
import { $, esc } from "../util.js";
import { hint } from "../i18n.js";
import { S, STAGES } from "../state.js";
import { log } from "../telemetry.js";

const STOPS = [
  ["Ferry Pier", "Harbor Master Mei", "Listen to the opening and fill the missing words", "聽開場，填入漏掉的字"],
  ["AI Lab", "Kai", "Read his notes, match them to the slides", "讀筆記，配到正確的投影片"],
  ["Harbor Archive", "Dr. Hsu", "Card game: put every sentence on the right slide", "卡牌：把每句話放回正確的投影片"],
  ["Port Council", "Councillor Wang", "Say it out loud: why does this matter?", "開口說：這個問題為什麼重要"],
  ["Innovation Workshop", "Dr. Hsu", "Put the plan in order, choose a policy", "把計畫排序，選一個政策"],
  ["Waterfront Theater", "the whole harbor", "Your Pecha Kucha talk: 20 seconds a slide", "你的 Pecha Kucha 發表：每張 20 秒"],
];

let openedAt = 0, first = true;
export function showTicket({ officer = false } = {}) {
  return new Promise(res => {
    const el = $("#ticket"); const card = $("#ticketCard");
    card.innerHTML = `
      <div class="tk-head"><div><small>Innovation Harbor Ferry</small><b>ENVOY PASS · SDG 9</b></div><div class="tk-stamp">${officer ? "CHECKED ✓" : "VALID"}</div></div>
      <div class="tk-row"><div><small>Passenger</small><b>Sustainability Envoy</b></div><div><small>Level</small><b>${esc(S.level)}</b></div><div><small>Destination</small><b>Waterfront Theater</b></div><div><small>Talk</small><b>Can We Trust AI?</b></div></div>
      <div class="tk-tear"></div>
      <h3>Your mission${hint("你的任務")}</h3>
      <p>Find out whether HARBOR-AI can be trusted. Then stand on the Waterfront Theater stage and give a <b>Pecha Kucha</b> talk about it to the whole harbor.${hint("查清楚 HARBOR-AI 能不能相信，然後站上海濱劇場的舞台，用 Pecha Kucha 的方式對全港發表。")}</p>
      <h3>What is Pecha Kucha?${hint("什麼是 Pecha Kucha？")}</h3>
      <p><b>20 seconds per slide, and the slides change by themselves.</b> You cannot pause or go back. So you do not memorize words; you understand the story and talk about each slide for 20 seconds. Short, clear, confident.${hint("每張投影片 20 秒，自動換頁，不能暫停或倒回。所以不是背稿，而是理解故事，每張講 20 秒：短、清楚、有自信。")}</p>
      <h3>How this harbor trains you${hint("這座港口怎麼訓練你")}</h3>
      <p>Your talk has six parts: ${STAGES.map(s => `<b>${esc(s.en)}</b>`).join(" · ")}. Each stop of the harbor practises one part of the script in a different way, so by the time you reach the stage you have heard it, read it, matched it, ordered it and said it out loud.${hint("你的演講有六個部分；港口的每一站用不同方式練其中一段，走到舞台時你已經聽過、讀過、配對過、排序過、說過整份講稿。")}</p>
      <ol class="tk-stops">${STOPS.map(([pl, who, en, zh], i) => `<li><b>${i + 1}</b><div><span class="tk-place">${esc(pl)} · ${esc(who)}</span><span>${esc(en)}${hint(zh)}</span></div></li>`).join("")}</ol>
      <h3>Tips from the harbor${hint("港口的小提醒")}</h3>
      <ul class="tk-tips">
        <li>Press 🔊 to hear any line again. Listen first, then read.${hint("按 🔊 可重聽任何一句。先聽，再讀。")}</li>
        <li>Say every passage out loud, even when nobody is scoring it.${hint("每一段都開口念，即使沒人在評分。")}</li>
        <li>Use <b>中</b> only when you are stuck; the words you miss come back in your feedback.${hint("卡住才按「中」；漏掉的字會出現在結局的回饋裡。")}</li>
        <li>Two sources of evidence before the Council. A confident voice is not evidence.${hint("去議會前要有兩個證據來源。講得篤定不等於證據。")}</li>
      </ul>
      <div class="row"><button class="btn" type="button" id="ticketOk">${officer ? "Thank you, officer ▸" : "Close"}</button><span class="tk-note">You can open this ticket any time: HUD → Ticket${hint("隨時可從上方 HUD 的「Ticket」再看一次")}</span></div>`;
    el.hidden = false; openedAt = performance.now();
    log("story.ticket", officer ? "ticket checked at the pier" : "ticket reopened", { first, officer });
    $("#ticketOk").onclick = () => { el.hidden = true; log("story.ticket.close", `${((performance.now() - openedAt) / 1000).toFixed(1)} s`, { seconds: +((performance.now() - openedAt) / 1000).toFixed(1), first }); first = false; res(); };
  });
}
export function wireTicketButton() { const b = $("#ticketBtn"); if (b) b.onclick = () => { if ($("#ticket").hidden) showTicket(); }; }
