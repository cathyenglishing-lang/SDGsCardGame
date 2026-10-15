// Chapter 1 · Innovation Harbor · "Can We Trust AI?" (SDG 9-1) as a graph of NPC encounters.
//
//   Mei (start) ──▶ Kai ─┬─ help/report ──▶ Council ──▶ Workshop ──▶ Theater ──▶ ending
//                 ├──▶ Dr. Hsu ─┘  (any order; each one adds evidence)
//                 └──▶ Foreman Lee (optional, +evidence)
//   Kai "hide" ──▶ Reporter Ana appears; denying her ends the chapter early at the Council ("Front Page").
//   The Council sends you back until you bring two pieces of evidence.
import { SPOTS, PATHS, drawScreen } from "../world/harbor.js";
import { setFollow, shot, fade, frontShot, fly } from "../world/camera.js";
import { say, ask, think } from "../ui/bubble.js";
import { renderHud, toast } from "../ui/sheet.js";
import { S, STAGES } from "../state.js";
import { log, finishRun } from "../telemetry.js";
import { $, esc, wait, isNum } from "../util.js";
import { DATA } from "../data.js";
import { hint } from "../i18n.js";
import { glossaryFor } from "../vocab.js";
import { horn, foghorn, applause, carHorn } from "../audio.js";
import { emote, flashback } from "../ui/fx.js";
import { setMood } from "../world/scene.js";
import { actListening } from "../activities/listening.js";
import { actChart } from "../activities/chart.js";
import { actReading } from "../activities/reading.js";
import { actCardGame } from "../activities/cardgame.js";
import { actSpeak } from "../activities/speaking.js";
import { actSequence } from "../activities/sequence.js";
import { actPechaKucha } from "../activities/pechakucha.js";
import { markStations, tagDone } from "../story.js";

const slidesOf = part => DATA[S.level].filter(s => s.part === part).sort((a, b) => a.no - b.no);
const L = (who, role, voice, en, zh, extra = {}) => ({ who, role, voice, en, zh, ...extra });
const bump = (k, d) => { S.vars[k] = (S.vars[k] || 0) + d; renderHud(); };

export function chapter1Nodes(ctx) {
  const { player, mei, kai, hsu, wang, councilA, councilB, foreman, reporter, audience, traffic } = ctx;
  const m = (en, zh, o) => say({ actor: mei }, L("Harbor Master Mei", "Port Authority", "mei", en, zh, o), player);
  const k = (en, zh, o) => say({ actor: kai }, L("Kai", "Cadet intern · report assistant", "kai", en, zh, o), player);
  const h = (en, zh, o) => say({ actor: hsu }, L("Dr. Hsu", "AI researcher", "hsu", en, zh, o), player);
  const w = (en, zh, o) => say({ actor: wang }, L("Councillor Wang", "Port Council", "wang", en, zh, o), player);
  const f = (en, zh, o) => say({ actor: foreman }, L("Foreman Lee", "Container quay", "wang", en, zh, o), player);
  const r = (en, zh, o) => say({ actor: reporter }, L("Ana Reyes", "Harbor Times reporter", "hsu", en, zh, o), player);
  const ai = (en, zh, where = { anchor: SPOTS.speakerPole }) => say(where, L("HARBOR-AI", "port management system", "ai", en, zh, { ai: true, anim: null }));
  // thought clouds: the player's inner voice, or an NPC's private thought the audience gets to overhear
  const me = (en, zh, o) => think({ actor: player }, L("You", "", "narrator", en, zh, o));
  const thinks = (actor, who, voice) => (en, zh, o) => think({ actor }, L(who, "", voice, en, zh, o), player);
  const kT = thinks(kai, "Kai", "kai"), wT = thinks(wang, "Councillor Wang", "wang"), mT = thinks(mei, "Harbor Master Mei", "mei");

  return [
    // ── 1. Mei · Ferry Pier · listening ──
    { id: "mei", title: "Harbor Master Mei", place: "Ferry Pier", spot: [10, -11], stage: 0, async run() {
      mei.faceTo(player);
      await m("Welcome to Innovation Harbor, Envoy. Next week the Port Council votes on one big question: should HARBOR-AI run the whole port?", "歡迎來到創新港，特使。下週港務議會要投票：要不要讓 HARBOR-AI 管理整個港口？");
      await ai("Assessment complete. New pier project: safety score ninety-nine percent. Twelve references cited. Recommendation: approve immediately.", "評估完成。新碼頭計畫：安全指數 99%，引用文獻 12 篇。建議：立即通過。");
      emote(mei, "?");
      await m("The report looks perfect. Too perfect. Before we start, listen to the opening talk of today's conference. It is playing on the harbor speakers.", "報告看起來很完美，完美得讓我不安。開始前，先聽聽今天大會的開場，港口廣播正在播。");
      await me("Ninety-nine percent safe… Who checked that number? And who wrote those twelve references?", "百分之九十九安全……這個數字是誰查的？那十二篇參考文獻又是誰寫的？");
      await actListening(slidesOf(1), ctx);
      await m("Three people can help you find out what is wrong with that report: Kai, my intern, at the AI Lab; Dr. Hsu at the Harbor Archive; and Foreman Lee on the container quay.", "有三個人可以幫你查出報告的問題：AI 實驗室的實習生凱、檔案館的許博士，還有貨櫃碼頭的李領班。");
      await m("Talk to them in any order. The Council will want evidence, not opinions. Bring at least two sources. And mind the trucks on the harbor road.", "順序隨你。議會要的是證據，不是意見，至少帶兩個來源回來。還有，小心港區道路上的卡車。");
      tagDone("pier"); return "briefed";
    } },

    // ── 2. Kai · AI Lab plaza · reading + the first big choice ──
    { id: "kai", title: "Kai", place: "AI Lab plaza", spot: [-30, 26], stage: 1, requires: (v, done) => done.has("mei"), async run(ctx, graph) {
      kai.faceTo(player);
      if (graph.done.has("hsu")) await k("Dr. Hsu sent you? Then you already know what the AI does with references…", "許博士叫你來的？那你已經知道 AI 怎麼處理參考文獻了……");
      emote(kai, "sweat", 2400);
      await k("Envoy… I have to tell you something. The references in the report? I asked the AI to write them. I never checked them one by one.", "特使……我得坦白一件事。報告裡的參考文獻是我請 AI 寫的，我沒有一篇一篇查。");
      await k("Here are my draft notes. Match each note to the right slide and you will see the problem.", "這是我的草稿筆記。把每段筆記對到正確的投影片，你就會看到問題。");
      await actReading(slidesOf(2), [slidesOf(1)[1], slidesOf(3)[0]]);
      await k("So… some of those papers may not exist at all? What should I do?", "所以……有些論文可能根本不存在？我該怎麼辦？");
      await kT("If the Envoy reports me, my internship is over. If we hide it, the whole port is at risk. Why did I trust the machine?", "如果特使通報我，實習就完了。如果藏起來，整個港口都有風險。我為什麼會相信機器？", { anim: "react" });
      const o = await ask(player, { en: "How do you answer Kai?", zh: "你要怎麼回應凱？" }, [
        { en: "\"I'll check every reference with you. If it's wrong, we fix it.\"", zh: "「我陪你一篇一篇查，錯了就改。」", kai: "help", d: 2 },
        { en: "\"We must report this to the Council right now.\"", zh: "「這件事必須馬上向議會通報。」", kai: "report", d: 1 },
        { en: "\"Let's keep quiet. The Council will never notice.\"", zh: "「先別聲張，議會不會發現的。」", kai: "hide", d: -2 },
      ], kai);
      S.vars.kai = o.kai; bump("integrity", o.d); log("story.choice", `answer to Kai: ${o.kai} (integrity ${o.d > 0 ? "+" : ""}${o.d})`, { key: "kai", value: o.kai, d: o.d });
      if (o.kai === "help") { bump("evidence", 1); bump("trust", 1); emote(kai, "ok"); await k("Thank you. Let's search Google Scholar together… there. Three of the twelve papers do not exist. Take this list to the Council.", "謝謝你。我們一起用 Google Scholar 查……你看，十二篇裡有三篇根本不存在。把這份清單帶去議會。", { anim: "react" }); }
      else if (o.kai === "report") { bump("evidence", 1); emote(kai, "worry"); await k("…I understand. If I made a mistake, I should face it. Here is my confession in writing. Take it to the Council.", "……我懂。做錯事就要面對。這是我寫的自白書，帶去議會吧。", { anim: "react" }); }
      else { emote(kai, "worry"); await k("Are you sure? …Okay. But people on the quay are already talking.", "真的可以嗎？……好吧。可是碼頭上的人已經在傳了。", { anim: "react" }); reporter.root.visible = true; toast("A reporter has arrived at the Council square."); }
      if (!graph.done.has("hsu")) await k("Dr. Hsu at the Harbor Archive can explain why the AI does this. She is expecting you.", "資料檔案館的許博士可以解釋 AI 為什麼會這樣。她在等你。");
      tagDone("lab"); return o.kai;
    } },

    // ── 3. Dr. Hsu · Harbor Archive · the card game ──
    { id: "hsu", title: "Dr. Hsu", place: "Harbor Archive", spot: [-6, 46], stage: 2, requires: (v, done) => done.has("mei"), async run(ctx, graph) {
      hsu.faceTo(player);
      if (!graph.done.has("kai")) { S.vars.hsuBeforeKai = true; await h("You came to me first. Good. Kai has not told you yet, has he? Then let me show you what the AI really does.", "你先來找我，很好。凱還沒告訴你吧？那我先讓你看看 AI 到底在做什麼。"); }
      else if (S.vars.kai === "help") await h("Kai told me you are checking the references with him. That is exactly the right instinct.", "凱說你在陪他一篇一篇查。這正是對的直覺。");
      else if (S.vars.kai === "report") await h("Kai was here. He said you reported him. Hard, but honest. Now let me show you why it happened.", "凱來過，說你通報了他。很硬，但很誠實。現在讓我告訴你為什麼會這樣。");
      else await h("Kai was here. He looked worried and would not say why. Whatever it is, the truth comes out in this harbor.", "凱來過，一臉擔心卻不肯說原因。不管是什麼，在這個港口真相總會浮出來。");
      await h("Why does an AI invent papers with such confidence? I prepared a short talk about it, but the sea wind scattered my cards! Come inside the Archive and help me put the sentences back on the right slides.", "AI 為什麼能這麼有自信地捏造論文？我準備了一段短講，可是海風把卡片吹散了！進檔案館幫我把句子放回正確的投影片。");
      await actCardGame({ topic: "9-1", parts: [2, 3, 4, 5] });
      emote(hsu, "idea");
      await h("Exactly. The AI guesses the next word. It does not check facts. Sounding right is not the same as being right.", "沒錯。AI 是在猜下一個字，不是在查證事實。聽起來對，不代表是真的。", { anim: "react" });
      bump("evidence", 1);
      await h("Take my analysis to the Council as evidence. And if you have not met Foreman Lee yet, he has seen HARBOR-AI make mistakes with his own eyes.", "把我的分析當證據帶去議會。如果你還沒見過李領班，他親眼看過 HARBOR-AI 出錯。");
      tagDone("archive"); return "explained";
    } },

    // ── 4. Foreman Lee · container quay · optional side node, one quick listening check ──
    { id: "foreman", title: "Foreman Lee", place: "Container quay", spot: [-19.5, 15.2], radius: 2.8, requires: (v, done) => done.has("mei"), async run() {
      foreman.faceTo(player); emote(foreman, "!");
      await f("Envoy. See crane two? Last Tuesday HARBOR-AI rerouted the trucks three times in one hour and the crane stopped twice. The report says ninety-nine percent safe. Not from where I stand.", "特使，看到二號起重機沒？上週二 HARBOR-AI 一小時內把卡車改道三次，起重機停了兩次。報告說 99% 安全，從我站的地方看可不是。");
      // flashback: sepia replay of last Tuesday — trucks honking, crane two frozen mid-lift
      await flashback(async () => {
        const cr = traffic?.cranes?.[1];
        shot([-13, 6, 18], [-28, 16, 0], { instant: true }); carHorn(true); await wait(900);
        if (cr) cr.frozen = true; await wait(600); carHorn(true); await wait(1300);
        shot([-21, 3.5, 23], [-26, 2, 9], { instant: true }); carHorn(); await wait(1900);
        if (cr) cr.frozen = false;
      }, { caption: "Last Tuesday · Container quay", zh: "上週二・貨櫃碼頭" });
      await f("I wrote it in the logbook. Listen to my entry and fill in the words, so you can quote me exactly.", "我寫進了日誌。聽我念一遍，把字填上，這樣你才能一字不差地引用。");
      const prevStage = S.stage; S.stage = "side";
      await actListening([{ no: 90, part: 1, title_en: "Foreman's logbook, Tuesday", title_zh: "領班日誌，星期二", script: "On Tuesday the system rerouted every truck three times in one hour. Crane two stopped twice, and the drivers waited forty minutes. Nobody checked the AI's decision." }], ctx);
      S.stage = prevStage; renderHud();
      const got = isNum(S.stars.side) ? S.stars.side : 0;
      if (got >= 1) { bump("evidence", 1); bump("trust", 1); await f("Good. That's my statement. Tell the Council a human has to check the machine.", "很好，這就是我的證詞。告訴議會，機器要有人盯著。", { anim: "react" }); }
      else await f("Hmm, not quite my words. Quote me wrong and the Council will laugh. Come back if you want to try again.", "嗯，不太是我的原話。引用錯了議會會笑的。想再試就回來。");
      return got >= 1 ? "statement" : "retry";
    } },

    // ── 4b. Lighthouse keeper · by patrol boat · the hallucinated-navigation scene (optional, +evidence) ──
    // HARBOR-AI offers a confident route straight through the breakwater. The student either trusts
    // it (and hits the stones while the AI reports "99% safe") or checks the chart and radios the
    // lighthouse first. Either way the keeper's hand-written logbook becomes a fourth source.
    { id: "lighthouse", title: "Lighthouse Keeper", place: "Patrol boat · ferry pier", spot: [8.2, -17], radius: 2.8, requires: (v, done) => done.has("mei"), async run() {
      const { boat, keeper } = ctx; const G0 = 0.6;
      mei.faceTo(player);
      await m("One more source, Envoy. The lighthouse keeper logs every ship movement by hand. His logbook is the one record HARBOR-AI cannot edit.", "還有一個來源，特使。燈塔管理員親手記錄每一艘船的動態，那本日誌是 HARBOR-AI 改不了的紀錄。");
      await m("Take the patrol boat. HARBOR-AI will offer to navigate. Whether you trust it is your call.", "開巡邏艇去。HARBOR-AI 會主動幫你導航，要不要信它，你自己決定。");
      const prevStage = S.stage; S.stage = "side2";
      await fade(true, 400); boat.enter(player); await fade(false, 400);
      await ai("Smart Navigation engaged. Confidence: ninety-nine percent. Fastest route to the lighthouse: the North Channel, straight through the breakwater gap. Hold your course and do not deviate.", "智慧導航啟動。信心指數：99%。前往燈塔最快路線：北航道，直接穿過防波堤缺口。保持航向，不要偏離。", { anchor: boat.radioAnchor });
      await me("Through the breakwater? It sounds very sure…", "穿過防波堤？它聽起來很篤定……");
      const o = await ask(player, { en: "How do you navigate?", zh: "你要怎麼導航？" }, [
        { en: "Follow HARBOR-AI. Ninety-nine percent is good enough.", zh: "跟著 HARBOR-AI 走，99% 夠了。", nav: "trust", d: 0 },
        { en: "Check the harbor chart and radio the lighthouse first.", zh: "先看海圖，並用無線電呼叫燈塔。", nav: "verify", d: 1 },
      ]);
      S.vars.nav = o.nav; bump("integrity", o.d); log("story.choice", `navigation: ${o.nav}`, { key: "nav", value: o.nav, d: o.d });
      const radio = (en, zh) => say({ anchor: boat.radioAnchor }, L("Keeper Ho", "radio · channel 16", "keeper", en, zh, { anim: null }));
      if (o.nav === "verify") {
        boat.frozen = true;
        await actChart();
        await actSpeak({ no: 93, part: 1, script: "Lighthouse, this is the harbor patrol boat. Requesting the safe channel to the island, over." }, { kicker: "Radio call · Speaking", title: "Call the lighthouse on channel 16", zh: "用 16 頻道呼叫燈塔" });
        await radio("Patrol boat, lighthouse. Good call. There is no gap in that breakwater — the AI is reading a chart from before it was built. Go east, around the green light, keep the red buoys on your left, then straight to my jetty.", "巡邏艇，這裡是燈塔。問得好。防波堤沒有缺口，AI 讀的是建堤之前的舊海圖。往東繞過綠燈，紅浮標保持在你左邊，然後直直開到我的小碼頭。");
        boat.frozen = false;
      }
      emote(player, o.nav === "verify" ? "ok" : "?");
      let crashed = 0;
      const trip = await boat.tripTo({ id: "lighthouse", x: 61.5, z: -61.5, radius: 6, label: "Lighthouse island", place: o.nav === "trust" ? "via the AI's North Channel" : "east, around the green light" }, {
        onCrash: async (n, kind) => {
          if (n > 1 || kind !== "breakwater") return;
          crashed = n; boat.frozen = true;
          await ai("Route status: on track. Safety: ninety-nine percent. Continue through the channel.", "路線狀態：正常。安全指數：99%。請繼續穿越航道。", { anchor: boat.radioAnchor });
          emote(player, "angry");
          await me("We are sitting on the rocks and it says ninety-nine percent.", "我們卡在石頭上，它還說 99%。");
          await radio("Patrol boat! You are on the breakwater! There is no gap — the AI is reading an old chart. Back off slowly, go east around the green light, keep the red buoys on your left.", "巡邏艇！你撞上防波堤了！那裡沒有缺口，AI 讀的是舊海圖。慢慢倒退，往東繞過綠燈，紅浮標保持在左邊。");
          boat.frozen = false;
        },
      });
      if (!crashed && trip.crashes) crashed = trip.crashes;
      log("boat.trip", `${o.nav}, ${trip.seconds}s, ${trip.crashes} collisions${trip.skipped ? ", skipped" : ""}`, { nav: o.nav, seconds: trip.seconds, crashes: trip.crashes, skipped: trip.skipped });
      // ashore on the island
      await fade(true, 450); boat.exit(66.3, 2.65, -67.8); player.face(69.5, -66, true); setFollow(player, { instant: true }); await fade(false, 450);
      keeper.faceTo(player); emote(keeper, "!");
      const kp = (en, zh, o2) => say({ actor: keeper }, L("Keeper Ho", "Lighthouse keeper", "keeper", en, zh, o2), player);
      await kp(crashed ? "I heard the hull on the stones from up here. Ninety-nine percent safe, was it?" : o.nav === "verify" ? "You called before you sailed. That is how a sailor stays alive." : "You made it in one piece. Lucky. That channel the AI talks about does not exist.", crashed ? "我在上面就聽到船殼撞石頭的聲音。99% 安全，是嗎？" : o.nav === "verify" ? "你出發前先呼叫了。水手就是這樣活下來的。" : "你全身而退了，算你運氣好。AI 說的那條航道根本不存在。");
      await kp("Here is Tuesday's entry. Listen, fill in the words, and quote me to the Council word for word.", "這是星期二的記錄。聽好、填上字，然後一字不差地引用給議會。");
      await actListening([{ no: 94, part: 1, title_en: "Lighthouse logbook, Tuesday", title_zh: "燈塔日誌，星期二", script: "On Tuesday HARBOR-AI sent a tanker toward the north gap. There is no north gap. I called the pilot by radio and the ship turned in time. A machine cannot see the rocks." }], ctx);
      const got = isNum(S.stars.side2) ? S.stars.side2 : 0;
      if (got >= 1) { bump("evidence", 1); bump("trust", 1); emote(keeper, "ok"); await kp("Good. That is my statement. Tell the Council: a confident voice is not a safe channel.", "很好，這就是我的證詞。告訴議會：講得篤定，不等於航道安全。", { anim: "react" }); }
      else await kp("Not quite my words. Come back and listen again if you want to quote me.", "不太是我的原話。想引用我，再回來聽一次。");
      await me(crashed ? "Ninety-nine percent, while we sat on the rocks. Confidence is not evidence." : "The AI was sure. The chart was right. Now I know which one to check first.", crashed ? "我們卡在石頭上時它說 99%。有信心不等於有證據。" : "AI 很篤定，海圖才是對的。現在我知道該先查哪一個了。");
      // back to the pier
      await fade(true, 500); boat.reset(); player.setPos(8.2, G0, -17); player.face(12.6, -8.2, true); setFollow(player, { instant: true }); await fade(false, 500);
      S.stage = prevStage; renderHud();
      return got >= 1 ? "logbook" : "retry";
    } },

    // ── 5. Ana the reporter · Council square · only on the "hide" route ──
    { id: "reporter", title: "Ana Reyes (reporter)", place: "Council square", spot: [20, 47.2], requires: v => v.kai === "hide", async run() {
      reporter.faceTo(player);
      await r("Envoy! Ana Reyes, Harbor Times. A source says the pier report cites papers nobody can find. Is that true?", "特使！我是《港灣時報》的安娜。有消息說碼頭報告引用的論文沒人找得到，是真的嗎？");
      const o = await ask(player, { en: "What do you tell the reporter?", zh: "你要怎麼回答記者？" }, [
        { en: "\"Yes. Some references were generated by AI and were never checked. We are fixing it.\"", zh: "「是的，有些文獻是 AI 生成、沒有查證過，我們正在修正。」", rep: "told", d: 2 },
        { en: "\"No comment until the Council has reviewed the report.\"", zh: "「議會審完報告前不予置評。」", rep: "silent", d: -1 },
        { en: "\"That is a rumor. The report is fine.\"", zh: "「那是謠言，報告沒問題。」", rep: "denied", d: -2 },
      ], reporter);
      S.vars.reporter = o.rep; bump("integrity", o.d); if (o.rep === "denied") S.vars.scandal = true;
      log("story.choice", `reporter: ${o.rep}`, { key: "reporter", value: o.rep, d: o.d });
      await r(o.rep === "told" ? "Thank you for being straight with me. That is the story: a harbor that checks its AI." : o.rep === "silent" ? "No comment. All right. I will keep digging." : "The report is fine. I'll quote you on that, Envoy.", o.rep === "told" ? "謝謝你坦白。這就是新聞：一個會檢查 AI 的港口。" : o.rep === "silent" ? "不予置評。好吧，我會繼續挖。" : "報告沒問題。這句話我會引用你的，特使。", { anim: "react" });
      return o.rep;
    } },

    // ── 6. Council · needs Kai and Dr. Hsu; needs two sources; speaking at the podium ──
    { id: "council", title: "Councillor Wang", place: "Port Council steps", spot: [26, 47.5], stage: 3, requires: (v, done) => done.has("kai") && done.has("hsu"), async run(ctx, graph) {
      const kv = S.vars.kai;
      mei.setPos(22, 0.6, 48.5); mei.faceTo(player); player.faceTo(mei);
      if (S.vars.scandal) {
        await m("Envoy… the Harbor Times printed your words this morning: “the report is fine.” Next to three papers that do not exist.", "特使……《港灣時報》今早登了你的話：「報告沒問題」，旁邊就是三篇不存在的論文。");
        wang.faceTo(player);
        await w("The Council cannot work with an envoy who tells the press one thing and knows another. This session is closed.", "議會沒辦法和一個對媒體說一套、心裡知道另一套的特使合作。會議到此為止。");
        S.vars.ending = "frontpage"; return "END";
      }
      if (graph.visits.council === 1) {
        if (kv === "help") await m("You and Kai found three papers that do not exist. The councillors are nervous.", "你和凱查出三篇根本不存在的論文。議員們開始緊張了。");
        else if (kv === "report") await m("The Council received your report. Kai is suspended for now… but at least the problem is on the table.", "議會收到你的通報，凱暫時被停職……但問題總算被看見了。");
        else await m("The meeting goes on as planned. Nobody mentions the references. But a reporter is asking questions…", "會議照常進行，沒人提到文獻的問題。不過，有記者開始追問了……");
      }
      wang.faceTo(player);
      if (S.vars.evidence < 2) {
        emote(wang, "angry");
        await w(`Envoy, you bring us ${S.vars.evidence === 1 ? "one source" : "no evidence"}. The Council needs at least two independent sources before it listens. Come back when you have them.`, `特使，你帶來的${S.vars.evidence === 1 ? "只有一個來源" : "沒有證據"}。議會至少要兩個獨立來源才會聽。有了再回來。`);
        toast("Bring two sources: Dr. Hsu's analysis, Kai's list, or the foreman's statement."); return "retry";
      }
      emote(wang, S.vars.evidence >= 3 ? "!" : "?");
      await wT(S.vars.evidence >= 3 ? "Three independent sources against a report I was ready to approve this morning. If the Envoy can explain it in plain English, the whole Council will follow." : "Two sources. Enough to listen, not enough to vote. Let us hear how the Envoy explains it.", S.vars.evidence >= 3 ? "三個獨立來源，對上一份我今早還打算批准的報告。如果特使能用簡單的英文解釋清楚，整個議會都會跟。" : "兩個來源。夠我聽，還不夠投票。先聽特使怎麼說。");
      await w(`${S.vars.evidence >= 3 ? "Three sources. Impressive." : "Two sources. Acceptable."} Step up to the podium and tell the Council in English: why does this problem matter?`, `${S.vars.evidence >= 3 ? "三個來源，了不起。" : "兩個來源，可以。"}請上講台，用英文告訴議會：這個問題為什麼重要？`);
      await fade(true, 400); player.setPos(26, 0.6, 49); setFollow(player, { dist: 5, height: 1.8, instant: true }); await fade(false, 400);
      await player.walk(PATHS.toPodium, { speed: 1.6 });
      player.face(26, 60); [wang, councilA, councilB].forEach(c => c.faceTo(player));
      const p4 = slidesOf(4); const slide = (kv === "help" ? p4[0] : p4[p4.length - 1]) || slidesOf(3)[0];
      shot([30, 2.7, 58], [26, 2.2, 53]);
      await actSpeak(slide, { kicker: "Part 4 · Speaking", title: "Convince the Council: why does this matter?", zh: "說服議會：這件事為什麼重要？", on: { start: () => { player.play("talk"); frontShot(player, { dist: 3.4, height: 0.3, side: 0.9 }); }, stop: () => { player.play("idle"); shot([30, 2.7, 58], [26, 2.2, 53]); } } });
      [wang, councilA, councilB].forEach((c, i) => setTimeout(() => c.play("react"), i * 300));
      await w(kv === "hide" ? "Interesting… but why are we hearing this only now? We will look into it. Now bring us a plan: how should the port use AI?" : "We understand. Now bring us a plan: how should the port use AI? Dr. Hsu is waiting at the Innovation Workshop.", kv === "hide" ? "有道理……但為什麼現在才說？我們會再查。接下來，提出港口使用 AI 的規則。" : "我們明白了。下一步，請提出港口使用 AI 的規則。許博士在創新工坊等你。");
      tagDone("council");
      await fade(true, 400); player.setPos(26, 0.6, 47.5); player.face(35, 47.5, true); hsu.setPos(...SPOTS.hsu2); hsu.face(46, 30, true); if (kv === "help") { kai.setPos(...SPOTS.kai2); kai.face(46, 30, true); } await fade(false, 400);
      return "heard";
    } },

    // ── 7. Workshop · Dr. Hsu · sequencing + the policy choice ──
    { id: "workshop", title: "Dr. Hsu", place: "Innovation Workshop", spot: [46, 30], stage: 4, requires: (v, done) => done.has("council"), async run() {
      hsu.faceTo(player);
      await h("The Council wants rules for HARBOR-AI. First, put the verification steps in the correct order.", "議會要你提出 HARBOR-AI 的使用規則。先把查證步驟排對。");
      await actSequence(slidesOf(5));
      const o2 = await ask(player, { en: "Which plan do you propose to the Council?", zh: "你要向議會提出哪一個方案？" }, [
        { en: "AI assists, humans verify: every source is double-checked in a trusted database.", zh: "AI 協助、人類查證：每份資料都用可信資料庫雙重核對。", a: "verify", d: 2 },
        { en: "Ban AI completely. Go back to manual work.", zh: "全面禁用 AI，回到人工作業。", a: "ban", d: 0 },
        { en: "AI is fastest. Just accept the report as it is.", zh: "AI 效率最高，報告直接採用就好。", a: "trust", d: -2 },
      ], hsu);
      S.vars.approach = o2.a; bump("integrity", o2.d); log("story.choice", `AI policy: ${o2.a} (integrity ${o2.d > 0 ? "+" : ""}${o2.d})`, { key: "approach", value: o2.a, d: o2.d });
      await h(o2.a === "verify" ? "Good. Let AI help, but let people decide." : o2.a === "ban" ? "Safe, yes… but innovation in this harbor would stop too." : "Are you sure? Those fake papers are still in the report.", o2.a === "verify" ? "很好。讓 AI 幫忙，但最後由人來判斷。" : o2.a === "ban" ? "安全是安全……但港口的創新也會停下來。" : "你確定？那些假論文還在報告裡。", { anim: "react" });
      await h("The whole harbor is waiting at the Waterfront Theater. Go and present your conclusion.", "全港的人都在海濱劇場等你。去發表你的結論吧。");
      tagDone("workshop"); return o2.a;
    } },

    // ── 8. Theater · final node · Pecha Kucha ──
    { id: "theater", title: "Waterfront Theater", place: "the stage", spot: [27, 15], stage: 5, final: true, requires: (v, done) => done.has("workshop"), async run() {
      mei.setPos(...SPOTS.meiTheater); mei.face(27, 5, true);
      await fade(true, 500); player.setPos(16.5, 0.9, 5.5); player.face(27, 5.5, true); shot([27, 3.2, 16], [22, 2, 5.5], { instant: true }); drawScreen("PECHA KUCHA", "Can We Trust AI?", "Sustainability Envoy · Innovation Harbor"); await fade(false, 500);
      await player.walk(PATHS.stageEntry, { speed: 1.5 });
      player.face(27, 20); await wait(300);
      audience.forEach(a => a.faceTo(player));
      await say({ actor: mei }, L("Harbor Master Mei", "front row", "mei", "This is it, Envoy. Pecha Kucha rules: twenty seconds per slide, and the slides change by themselves. Speak clearly. The harbor is listening.", "就是現在，特使。Pecha Kucha 規則：每張二十秒，自動換頁。說清楚，整個港口都在聽。"), player);
      await me("Twenty seconds a slide. Breathe. I know this story now: I walked every step of it.", "每張二十秒。深呼吸。這個故事我現在很清楚：每一步都是我自己走過的。", { hold: 6000 });
      shot([27, 5.2, 17.5], [27, 2.4, 4]);
      await actPechaKucha(slidesOf(6), { player, audience, mei });
      tagDone("theater"); return "presented";
    } },
  ];
}

// ── endings ──
export const ENDINGS = {
  best:      { title: "Harbor of Integrity", mood: "best", en: "The lighthouse lights up again. The Council passes the “AI assists, humans verify” charter, and Kai leads the new verification team. Innovation Harbor becomes the first port in the country with public rules for AI.", zh: "燈塔重新亮起。議會通過「AI 協作、人類查證」規章，凱成為查證小組組長。創新港成為全國第一個公開 AI 使用規範的港口。" },
  evidence:  { title: "The Evidence Speaks", mood: "best", en: "Your talk was shaky, but three independent sources were not. The Council passes the charter on the strength of the evidence, and Foreman Lee's logbook becomes the model for every AI decision in the port: a human signs off.", zh: "你的發表不太穩，但三個獨立來源很穩。議會憑證據通過規章，李領班的日誌成為港口每一個 AI 決策的範本：要有人簽字。" },
  cautious:  { title: "Proceed with Caution", mood: "dusk", en: "The direction is right, but the speech did not fully convince the Council. They approve a one-year trial: HARBOR-AI works under human supervision. Stronger evidence, listening and speaking unlock the best ending.", zh: "方向是對的，但說服力還不夠。議會只通過一年試行方案，HARBOR-AI 在人工監督下運作。更多證據、更好的聽說表現能解鎖最好的結局。" },
  stall:     { title: "Standstill Harbor", mood: "dim", en: "AI is banned. The port is safe, but the new pier project stops. Three years later, a neighboring port overtakes Innovation Harbor by using AI responsibly.", zh: "AI 被全面禁用。港口很安全，但新碼頭計畫停擺。三年後，鄰近港口靠著負責任的 AI 超越了創新港。" },
  fog:       { title: "Fog of Hallucination", mood: "fog", en: "The Council accepts the report as it is. The “safety score” was built on fake papers, and the new pier fails. A fog of scandal covers the harbor. The investigation starts again, and this time everyone checks the sources first.", zh: "議會照單全收。「安全指數」建立在假論文上，新碼頭工程失敗，港口被醜聞的迷霧籠罩。調查重新開始，這次大家記得先查證。" },
  frontpage: { title: "Front Page", mood: "fog", en: "“THE REPORT IS FINE” — your quote runs on the front page next to three papers that do not exist. The Council closes its doors to you before you can present anything. Play again, and try telling the truth earlier.", zh: "「報告沒問題」——你的話登上頭版，旁邊是三篇不存在的論文。你還沒發表，議會就對你關上大門。再玩一次，試著早一點說實話。" },
};
export function decideEnding() {
  const vals = Object.values(S.stars).filter(isNum); const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const v = S.vars;
  if (v.ending === "frontpage") return { key: "frontpage", avg };
  if (v.approach === "trust" || (v.kai === "hide" && v.approach !== "verify")) return { key: "fog", avg };
  if (v.approach === "ban") return { key: "stall", avg };
  if (v.approach === "verify" && v.integrity >= 3 && v.evidence >= 2 && avg >= 2.3) return { key: "best", avg };
  if (v.approach === "verify" && v.evidence >= 3 && v.integrity >= 1) return { key: "evidence", avg };
  return { key: "cautious", avg };
}

// Personal feedback for the student: what each skill looked like, the words to practise (with
// meanings), what their choices meant, and a one-line reflection that goes to the teacher.
function feedbackHtml(missed) {
  const SKILL = ["Listening", "Reading", "Card game", "Speaking", "Sequencing", "Pecha Kucha"];
  const TIP = {
    3: ["Strong — you got this part right away.", "很好，這一關一次就對。"],
    2: ["Good — one or two slips; a second listen or read would make it perfect.", "不錯，有一兩個小錯，再聽／讀一次就完美。"],
    1: ["Needs practice — replay the audio and read the glossary before trying again.", "需要練習：重播音檔、先看字彙表再試一次。"],
    0: ["Not scored yet.", "尚未計分。"],
    pending: ["Recorded — your teacher will grade it.", "已錄音，等老師評分。"],
    skip: ["Skipped (no microphone) — try it on a device with a mic.", "略過（沒有麥克風），換有麥克風的裝置再試。"],
  };
  const rows = STAGES.map((st, i) => { const v = S.stars[i]; const k = isNum(v) ? v : (v || 0); const t = TIP[k] || TIP[0]; return `<li><b>${SKILL[i]}</b> ${isNum(v) ? "★".repeat(v) + "☆".repeat(3 - v) : v === "pending" ? "…" : "–"} <span>${t[0]}${hint(t[1])}</span></li>`; }).join("");
  const words = glossaryFor([...new Set(missed)]).slice(0, 6).map(g => `<li><b>${esc(g.word)}</b> — ${esc(g.def)}${hint(g.zh)}</li>`).join("");
  const v = S.vars; const ch = [];
  if (v.kai) ch.push(v.kai === "help" ? ["You helped Kai check every reference — honest and practical.", "你陪凱查證每一篇文獻：誠實又務實。"] : v.kai === "report" ? ["You reported Kai — honest, but think about how it felt for him.", "你通報了凱：誠實，但想想他的感受。"] : ["You kept Kai's secret — the story shows where that leads.", "你替凱隱瞞：故事會告訴你後果。"]);
  if (v.nav) ch.push(v.nav === "verify" ? ["You checked the chart before trusting the AI's route. That is exactly the habit this chapter is about.", "你先看海圖再信 AI 的路線，這正是這一章要養成的習慣。"] : ["You followed the AI's confident route. Confidence is not evidence — check the chart next time.", "你照著 AI 篤定的路線走。有信心不等於有證據，下次先看海圖。"]);
  if (v.approach) ch.push(v.approach === "verify" ? ["Your policy: AI assists, humans verify.", "你的政策：AI 協助，人來查證。"] : v.approach === "ban" ? ["Your policy: ban AI. Safe, but the harbor stops innovating.", "你的政策：禁用 AI。安全，但港口停止創新。"] : ["Your policy: trust AI as it is. The fake references are still in the report.", "你的政策：照單全收。假文獻還在報告裡。"]);
  const next = S.level === "A2" ? ["Next time: try the other choices, or play at B1 for longer sentences.", "下次：試試其他選擇，或挑戰 B1 的長句。"] : ["Next time: try a different route and see another ending.", "下次：走不同路線，看看另一個結局。"];
  return `<div class="fb">
    <h3>Your feedback</h3>
    <ul class="fbs">${rows}</ul>
    ${words ? `<h3>Words to practise</h3><ul class="fbw">${words}</ul>` : `<p>No missed words this time. ${hint("這次沒有漏掉的字。")}</p>`}
    <h3>What your choices meant</h3><ul class="fbc">${ch.map(c => `<li>${c[0]}${hint(c[1])}</li>`).join("")}</ul>
    <p>${next[0]}${hint(next[1])}</p>
    <h3>One sentence for your teacher</h3>
    <p>What is one thing you would tell Kai about using AI? ${hint("你會對凱說一句什麼關於使用 AI 的話？")}</p>
    <div class="row"><textarea id="reflText" rows="2" maxlength="300" placeholder="In English…"></textarea><button class="btn ghost" type="button" id="reflSend">Send</button></div>
    <h3>Write Chapter 2 with us</h3>
    <p>What should happen next at Signal Hill? A new character, a problem, a choice… 2–3 sentences in English. The best ideas go into the real game. ${hint("第二章 Signal Hill 該發生什麼？新角色、新問題、新選擇……用英文寫 2–3 句，好點子會真的做進遊戲。")}</p>
    <div class="row"><textarea id="propText" rows="3" maxlength="800" placeholder="In Chapter 2, …"></textarea><button class="btn ghost" type="button" id="propSend">Send my idea</button></div>
  </div>`;
}
export async function runEnding(ctx) {
  const { player, traffic, audience, vehicles, portals } = ctx;
  const { key, avg } = decideEnding(); const E = ENDINGS[key];
  const pend = Object.values(S.stars).filter(v => v === "pending").length;
  log("ending", `${E.title} (avg ${avg.toFixed(1)} stars, integrity ${S.vars.integrity}, evidence ${S.vars.evidence}, route ${S.done.join(">")})`, { key, title: E.title, avg: +avg.toFixed(2), integrity: S.vars.integrity, evidence: S.vars.evidence, route: S.done.slice() });
  finishRun({ ending: key, vars: S.vars, stars: S.stars, metrics: S.metrics, route: S.done });
  markStations(null);
  await fade(true, 700);
  setMood(E.mood);
  if (key === "best" || key === "evidence") { portals?.unlock?.("east"); traffic.lighthouse(true); horn(true); setTimeout(() => horn(true), 1500); audience[0]?.play("dance"); drawScreen("CHARTER PASSED", "AI assists, humans verify", "Innovation Harbor · first port with public AI rules"); }
  if (key === "cautious") { traffic.speed = 0.5; drawScreen("TRIAL PERIOD", "Human review required", "HARBOR-AI operates under supervision for one year"); }
  if (key === "stall") { traffic.anchorShips(); traffic.cranesFrozen = true; if (vehicles) vehicles.speed = 0.3; drawScreen("NOTICE", "AI systems suspended", "Manual operations only"); }
  if (key === "fog" || key === "frontpage") { traffic.freezeCrane(0, true); foghorn(); drawScreen(key === "fog" ? "INVESTIGATION" : "HARBOR TIMES", key === "fog" ? "Safety score under review" : "“The report is fine”", key === "fog" ? "All sources must be verified" : "Three cited papers do not exist, sources say"); }
  player.setPos(10, 0.6, -16); player.face(10, -40, true);
  await fly([{ pos: [-4, 6, -4], look: [20, 6, -40], t: 0.01 }]);
  await fade(false, 1200);
  fly([{ pos: [-10, 8, 2], look: [30, 8, -50], t: 18 }]);
  const sp = S.metrics.speakBest.length ? Math.round(S.metrics.speakBest.reduce((a, b) => a + b, 0) / S.metrics.speakBest.length * 100) + "%" : (S.speech === "record" ? "awaiting teacher" : "incomplete");
  const missed = Object.entries(S.metrics.missed.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  const keys = Object.keys(ENDINGS);
  $("#endCard").innerHTML = `
    <span class="kicker">Ending ${keys.indexOf(key) + 1} of ${keys.length}</span>
    <h2 class="ending-title">${E.title}</h2><p>${esc(E.en)}${hint(E.zh)}</p>
    <div class="sum">
      <div><small>Route</small><b>${S.done.map(esc).join(" → ")}</b></div>
      <div><small>Evidence / Integrity</small><b>${S.vars.evidence} / ${S.vars.integrity}</b></div>
      <div><small>Stages</small><b>${STAGES.map((s, i) => isNum(S.stars[i]) ? "★".repeat(S.stars[i]) : S.stars[i] === "pending" ? "…" : "–").join(" ")}</b></div>
      <div><small>Average stars</small><b>${avg.toFixed(1)}${pend ? ` (${pend} awaiting teacher)` : ""}</b></div>
      <div><small>Listening replays</small><b>${S.metrics.replays}</b></div>
      <div><small>Card errors</small><b>${S.metrics.cardErrors}</b></div>
      <div><small>Reading time</small><b>${S.metrics.readSec} s</b></div>
      <div><small>Speaking coverage</small><b>${sp}</b></div>
      <div><small>Chinese hints</small><b>${S.metrics.zhHints}</b></div>
      <div><small>Overheard / jumps / hit by traffic</small><b>${S.metrics.eavesdrops} / ${S.metrics.jumps} / ${S.metrics.hits}</b></div>
    </div>
    ${feedbackHtml(missed)}
    <p class="note">These are the metrics the teacher dashboard will show. The full Learning Log has <strong>${S.events.length}</strong> events.</p>
    <div class="row"><button class="btn" type="button" id="again">Play again with different choices ▸</button><button class="btn ghost" type="button" id="seeLog">See the Learning Log</button></div>`;
  $("#ending").hidden = false;
  const refl = $("#reflSend"); if (refl) refl.onclick = () => { const t = $("#reflText").value.trim(); if (!t) return; log("story.reflection", t.slice(0, 300), { text: t.slice(0, 1000), ending: key }); refl.disabled = true; $("#reflText").disabled = true; refl.textContent = "Sent to your teacher ✓"; };
  const prop = $("#propSend"); if (prop) prop.onclick = () => { const t = $("#propText").value.trim(); if (!t) return; log("story.proposal", t.slice(0, 300), { text: t.slice(0, 1000), ending: key }); prop.disabled = true; $("#propText").disabled = true; prop.textContent = "Idea sent ✓"; };
  $("#again").onclick = () => location.reload();
  $("#seeLog").onclick = () => { $("#ending").hidden = true; $("#logp").hidden = false; };
}
