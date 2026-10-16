// Comprehension guide for the SDG 4-1 talk (written for this game; the talk itself is in talk.js).
// THESIS: what the whole talk argues. PARTS: what each of the six parts does in THIS talk and the
// language it uses (the course's 6-part template). SLIDES: one Chinese gist per slide and 2–3 key
// words; a key word is underlined only when one of its forms appears in the level's script.
export const THESIS = {
  en: "Taiwan's schools look great on paper, but not every child gets the same chance in science. Help make it fair.",
  zh: "台灣的教育數字很亮眼，但不是每個孩子在科學課都有一樣的機會。請大家一起讓它更公平。",
};

export const PARTS = {
  1: { zh: "用問題抓住觀眾，說明 SDG 4 是什麼，再連到台灣。整場演講要回答：台灣的教育真的對每個孩子公平嗎？",
       lang: "反問句（Is school fair for every child?）、X is about…" },
  2: { zh: "指出三個問題：少子化讓鄉下學校關閉、考試壓力扼殺創造力、城鄉設備差距約 30%。",
       lang: "現在進行式描述趨勢（schools are shutting）、because / so 說明因果" },
  3: { zh: "公平地講好消息：12 年免學費、學前補助、升學率高。但也提醒：數字高不等於教得好。",
       lang: "現在完成式（has lifted）、比較級（beats the global average）" },
  4: { zh: "現在正在做的解方：動手做的科學課、數位教材、到科技公司實習。",
       lang: "instead of / rather than + V-ing、情態動詞 must / should" },
  5: { zh: "為什麼重要：科學教育撐起經濟與氣候調適；但性別與城鄉差距若不處理，就會浪費人才。",
       lang: "第一條件句（If we ignore…, we will…）、but / however 表轉折" },
  6: { zh: "總結進步與問題，挑戰「只看分數」，最後請觀眾採取行動。",
       lang: "總結語（In summary / So where does that leave us?）、Let's…、祈使句" },
};

export const SLIDES = {
  1: { zh: "台灣的教育在數字上很好看，但科學課顯示：每個孩子的機會其實不一樣。", kw: [["fair", "公平的"], ["on paper", "表面上、帳面上"], ["chance", "機會"]] },
  2: { zh: "SDG 4 承諾每個人不分貧富與年齡都能受教育；台灣為全世界做晶片，但學校有教我們負責任地使用科技嗎？", kw: [["promise|promises", "承諾"], ["lifelong", "終身的"], ["wisely|ethical", "明智地／合乎倫理的"]] },
  3: { zh: "台灣靠投資科學與數學（STEM）變富有，但出生率創新低——錢有花在最重要的問題上嗎？", kw: [["birth rate", "出生率"], ["invested|puts big money", "投資"], ["resources|spending", "資源／花費"]] },
  4: { zh: "問題一：出生數從 1990 年的 30 多萬降到不到 14 萬，鄉下學校關閉，孩子要通勤得更遠。", kw: [["countryside|rural", "鄉下的"], ["close|shutting", "關閉"], ["travel", "通勤、移動"]] },
  5: { zh: "問題二：科學課忙著背答案應付考試，學生很少提出自己的問題，很多人早早放棄科學。", kw: [["by heart|memorizing", "背誦"], ["creativity", "創造力"], ["drop", "放棄（科目）"]] },
  6: { zh: "問題三：城市教室有新實驗室和平板，偏鄉學校卻還在等，設備差距大約 30%。", kw: [["labs|laboratories", "實驗室"], ["gap", "差距"], ["remote|village", "偏遠的／村莊"]] },
  7: { zh: "好消息：12 年國教免學費，99% 的孩子讀完小學，名列 OECD 前段；但能上學不等於教得好。", kw: [["free|cost families nothing", "免費"], ["complete|finish", "完成（學業）"], ["quality", "品質"]] },
  8: { zh: "政府補助學前教育，96% 弱勢家庭的五歲孩子能上幼兒園，提早打好科學需要的基礎。", kw: [["preschool", "學前教育"], ["subsidies|pays for", "補助"], ["disadvantaged|poorer", "弱勢的"]] },
  9: { zh: "台灣的升學與畢業率高於全球平均，教師培訓也更好；但各地的科學教學深度並不一樣。", kw: [["global average", "全球平均"], ["teacher training|train", "教師培訓"], ["regions|towns", "地區"]] },
  10: { zh: "解方一：政府出錢推動動手做的科學課，學生做東西而不只是讀，也更早學寫程式與 AI 倫理。", kw: [["hands-on|inquiry-based", "動手做的／探究式的"], ["coding", "寫程式"], ["instead of|rather than", "而不是"]] },
  11: { zh: "解方二：超過 80% 的學校使用平板與數位教材，在螢幕上做實驗，也連結台灣的半導體產業；但要教負責任地使用。", kw: [["tablets|digital", "平板／數位的"], ["experiments|simulations", "實驗／模擬"], ["honest|responsible", "誠實的／負責任的"]] },
  12: { zh: "解方三：學生到科技公司實習、接觸綠能工程師，學校裡學的東西慢慢變成真正的工作。", kw: [["internships|program", "實習／計畫"], ["green energy|green-energy", "綠能"], ["career|job", "職涯／工作"]] },
  13: { zh: "為什麼重要：台灣一年出口約 5,000 億美元、多數是科技產品；同樣的科學也幫我們面對淹水與高溫。", kw: [["billion", "十億"], ["flooding|climate-ready", "淹水／能因應氣候的"], ["infrastructure", "基礎建設"]] },
  14: { zh: "但工程系學生只有 30% 是女性；「科學是男生的事」這種想法早就該過時。", kw: [["engineering", "工程"], ["stereotypes|thinking", "刻板印象／想法"], ["women", "女性"]] },
  15: { zh: "如果不處理這些差距，就會浪費年輕人才。問問老師：學校準備好面對 AI 帶來的新工作了嗎？", kw: [["waste|wasted", "浪費"], ["talent|bright young people", "人才"], ["gaps", "差距"]] },
  16: { zh: "好的教育讓國家強大；如果什麼都不改，台灣會慢慢落後，科學教育必須跟上世界。", kw: [["resilient|strong", "有韌性的／強大的"], ["fall behind|lose its edge", "落後"], ["reform|change", "改革／改變"]] },
  17: { zh: "總結：台灣建立了普及又免費的教育，STEM 讓國家富有，但「公平」仍是缺少的那一塊。", kw: [["fairness|fair", "公平"], ["in summary|where does that leave us", "總結來說"], ["progress", "進步"]] },
  18: { zh: "只看高分不夠：分數看不出創意，也無法讓窮學校變好——要重建制度，而不是表面裝飾。", kw: [["score|scores", "分數"], ["rebuild|reform", "重建／改革"], ["imagination|creative", "想像力／有創意的"]] },
  19: { zh: "未來科學教育要更包容：女生、偏鄉學生和弱勢家庭都屬於實驗室，每堂課都要連結真實生活。", kw: [["inclusive", "包容的"], ["belong", "屬於"], ["real life", "真實生活"]] },
  20: { zh: "我的請求：參加學校會議、幫助學弟妹、為更公平的規定發聲——一起讓台灣的學校不漏掉任何人。", kw: [["ask", "請求"], ["together", "一起"], ["misses nobody|leaves no one out", "不漏掉任何人"]] },
};
