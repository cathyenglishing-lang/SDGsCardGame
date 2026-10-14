// Part 3 · Card Match: the original CardLearn poker-card mechanic.
// Slide cards fly onto the table, sentence cards are drawn from the deck, must be listened to,
// then dragged (pointer events: mouse or touch) or clicked onto the matching slide card.
import { esc, shuffle, cleanTitle, starsFromErrors } from "../util.js";
import { S } from "../state.js";
import { log } from "../telemetry.js";
import { speak } from "../speech.js";
import { openSheet, closeSheet, finishRow, addStars, hintP, shake } from "../ui/sheet.js";
import { chime } from "../audio.js";

export async function actCards(slides) {
  const body = openSheet("Part 3 · Card Match", "Dr. Hsu's scattered talk: put every sentence on its slide", "許博士被吹散的講稿：把每個句子放回它的投影片");
  body.innerHTML = hintP("Draw a sentence card from the deck. Listen first (required), then drag it onto the matching slide card, or tap the slide card.", "從牌堆抽一張句子卡。必須先聽，然後拖到對應的投影片卡上，或直接點投影片卡。")
    + `<div class="table"><div class="subtopic-box" id="subBox"></div>
       <div class="deck-panel"><div class="dealt-card-container" id="dealt"></div><div class="deck" id="deck" role="button" tabindex="0" aria-label="Draw a card">SDG<small>deck · <b id="left">${slides.length}</b></small></div></div></div>
       <div class="status" id="status">Dealing slide cards…</div>`;
  const box = body.querySelector("#subBox"), dealt = body.querySelector("#dealt"), status = body.querySelector("#status");
  const say = m => status.textContent = m;
  const subs = slides.map(s => ({ id: s.no, title: cleanTitle(s.title_en), text: s.script }));
  let errors = 0, repeats = 0, matched = 0, current = null, canDrag = false, speaking = false;
  const hand = shuffle(subs);

  await new Promise(res => subs.forEach((s, i) => setTimeout(() => {
    const card = document.createElement("div"); card.className = "poker-card subtopic-poker dealing"; card.dataset.subId = s.id;
    card.innerHTML = `<div class="card-inner"><div class="card-front"><div class="match-card-face"><div class="card-corner">Slide ${i + 1}</div><div class="card-title">${esc(s.title)}</div><div class="drop-hint">Drop or tap here</div></div></div><div class="card-back">SDG</div></div>`;
    card.onclick = () => {
      if (card.classList.contains("correct")) return;
      if (!current) return say("Draw a sentence card from the deck first.");
      if (!canDrag) return say("Listen to the sentence first. Then tap a matching slide card.");
      drop(card);
    };
    box.appendChild(card);
    if (i === subs.length - 1) setTimeout(() => { say("Cards are ready. Tap the deck to draw a sentence card."); res(); }, 600);
  }, i * 220)));

  function deal() {
    if (current) return say("Match the current sentence card before drawing another.");
    if (!hand.length) return;
    canDrag = false; current = hand.pop(); body.querySelector("#left").textContent = hand.length;
    const c = document.createElement("div"); c.className = "poker-card draggable";
    c.innerHTML = `<div class="card-inner"><div class="card-front"><div class="playable-card-face"><div class="card-kicker">Sentence</div><div class="card-scroll-text">${esc(current.text)}</div><div class="drag-hint">Listen first</div></div></div><div class="card-back">SDG</div></div>
      <div class="card-controls"><button class="card-action-btn listen-btn" type="button">Listen</button><button class="card-action-btn secondary repeat-btn" type="button" disabled>Repeat</button><span class="repeat-count-chip">0 repeats</span></div>`;
    dealt.innerHTML = ""; dealt.appendChild(c);
    const listenBtn = c.querySelector(".listen-btn"), repeatBtn = c.querySelector(".repeat-btn"), chip = c.querySelector(".repeat-count-chip");
    let listened = false, myRepeats = 0;
    const play = async (isRepeat) => {
      if (speaking) return;
      if (isRepeat && !listened) return say("Listen once before using Repeat.");
      if (!isRepeat && listened) return say("Already read. Use Repeat to hear it again.");
      c.classList.add("flipped"); speaking = true; listenBtn.disabled = true; repeatBtn.disabled = true; canDrag = false;
      say(isRepeat ? "Reading again…" : "Reading aloud. Listen for the main idea.");
      if (isRepeat) { myRepeats++; repeats++; chip.textContent = `${myRepeats} repeat${myRepeats > 1 ? "s" : ""}`; log("card.repeat", `slide ${current.id} repeat #${myRepeats}`); }
      else log("card.listen", `slide ${current.id}`);
      await speak(current.text, "hsu");
      speaking = false; listened = true; canDrag = true; repeatBtn.disabled = false; c.classList.add("ready");
      c.querySelector(".drag-hint").textContent = "Drag me or tap a slide card";
      say("Drag this sentence to a slide card, or tap the matching slide card.");
    };
    listenBtn.onclick = e => { e.stopPropagation(); play(false); };
    repeatBtn.onclick = e => { e.stopPropagation(); play(true); };
    c.querySelector(".card-inner").onclick = () => { if (!listened) play(false); };
    // pointer drag (mouse + touch)
    let ghost = null, over = null;
    const inner = c.querySelector(".card-inner");
    inner.addEventListener("pointerdown", e => {
      if (!canDrag) return; e.preventDefault();
      inner.setPointerCapture(e.pointerId);
      ghost = c.cloneNode(true); ghost.className = "poker-card ghost flipped"; ghost.querySelector(".card-controls")?.remove(); document.body.appendChild(ghost);
      ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; c.classList.add("dragging"); body.classList.add("is-dragging-card");
    });
    inner.addEventListener("pointermove", e => {
      if (!ghost) return; ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px";
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".subtopic-poker:not(.correct)");
      if (over && over !== el) over.classList.remove("drop-over"); over = el; if (over) over.classList.add("drop-over");
    });
    const end = () => { if (!ghost) return; ghost.remove(); ghost = null; c.classList.remove("dragging"); body.classList.remove("is-dragging-card"); if (over) { const t = over; over.classList.remove("drop-over"); over = null; drop(t); } };
    inner.addEventListener("pointerup", end); inner.addEventListener("pointercancel", end);
    say("Tap the card or Listen to hear the sentence.");
  }
  let resolveAll;
  const allDone = new Promise(r => resolveAll = r);
  function drop(target) {
    if (!current || !canDrag) return;
    if (+target.dataset.subId === current.id) {
      matched++; target.classList.add("correct");
      target.querySelector(".card-front").innerHTML = `<div class="correct-card-face"><div class="card-corner">Correct</div><div class="card-title">${esc(current.title)}</div><div class="correct-text">${esc(current.text)}</div></div>`;
      log("card.match", `slide ${current.id} correct`); chime(true);
      dealt.innerHTML = ""; current = null; canDrag = false;
      if (matched === subs.length) { say(`All sentences matched. Errors: ${errors} · Repeats: ${repeats}`); resolveAll(); }
      else say(`Correct. ${subs.length - matched} sentence card${subs.length - matched > 1 ? "s" : ""} left. Tap the deck again.`);
    } else { errors++; S.metrics.cardErrors++; log("card.error", `slide ${current.id} dropped on slide ${target.dataset.subId}`); chime(false); shake(target); say(`Not a match. Try another slide card. Errors: ${errors}`); }
  }
  const deck = body.querySelector("#deck"); deck.onclick = deal; deck.onkeydown = e => { if (e.key === "Enter" || e.key === " ") deal(); };
  await allDone;
  const n = starsFromErrors(errors);
  log("card.done", `errors ${errors} repeats ${repeats}`);
  await finishRow(body, n, `${errors} error${errors === 1 ? "" : "s"}, ${repeats} repeat${repeats === 1 ? "" : "s"}. More errors than cards is flagged as "possible guessing" for the teacher.`, "錯誤數大於卡片數時，後台會標示「可能在猜」。");
  closeSheet(); addStars(n, "Card Match");
}
