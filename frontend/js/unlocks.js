// Shared rules and names for SDGs Pecha Kucha (member hub launcher, game_s) and the Pecha Kucha
// Card Game (pecha_kucha_builder.html). Edit this file to open or lock content or to rename things.
//   openAll:    SDGs whose every level is open.
//   firstLevel: the only open level for every other SDG.
// The SDGs Pecha Kucha question bank stores the three SDG 9 AI topics as sdg_level 1, 2, 3;
// DB_TOPIC maps them to the topic they really are, for the rule and for display.
window.CARDLEARN_UNLOCKS = {
  openAll: [4, 5],
  firstLevel: "A2",
  SDG_NAMES: {
    4: { en: "Quality Education", zh: "優質教育" },
    5: { en: "Gender Equality", zh: "性別平權" },
    9: { en: "Industry, Innovation & Infrastructure", zh: "工業創新" },
    13: { en: "Climate Action", zh: "氣候行動" },
  },
  DB_TOPIC: {
    1: { sdg: 9, code: "9-1", name: "Can We Trust AI?" },
    2: { sdg: 9, code: "9-2", name: "How to Talk to AI Like a Scientist" },
    3: { sdg: 9, code: "9-3", name: "What Can Humans Do Better Than AI?" },
  },
  LEVELS: { A1: "入門", A2: "基礎", B1: "進階", B2: "高階" },

  // sdg: real SDG number (4, 5, 9, 13) or a question-bank sdg_level (1, 2, 3, 4, 5, 13).
  realSdg(sdg) { const t = this.DB_TOPIC[Number(sdg)]; return t ? t.sdg : Number(sdg); },
  isOpen(sdg, level) { return this.openAll.includes(this.realSdg(sdg)) || String(level) === this.firstLevel; },
  code(sdgLevel) { const t = this.DB_TOPIC[Number(sdgLevel)]; return t ? t.code : String(sdgLevel); },
  label(sdgLevel) { return `SDG ${this.code(sdgLevel)}`; },
  // Card title: the topic name for the SDG 9 topics, otherwise the SDG's English name.
  title(sdgLevel, fallback = "") { const t = this.DB_TOPIC[Number(sdgLevel)]; return t ? t.name : (this.SDG_NAMES[Number(sdgLevel)]?.en || fallback); },
  zh(sdgLevel) { return this.SDG_NAMES[this.realSdg(sdgLevel)]?.zh || ""; },
  levelLabel(code) { return this.LEVELS[code] ? `${code} ${this.LEVELS[code]}` : code; },
  sortLevels(list, key = x => x) { const order = Object.keys(this.LEVELS); return list.slice().sort((a, b) => order.indexOf(key(a)) - order.indexOf(key(b))); },
};
