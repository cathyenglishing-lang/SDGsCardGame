// Shared rules and names for SDGs Pecha Kucha (member hub launcher, game_s) and the Pecha Kucha
// Card Game (pecha_kucha_builder.html). Edit this file to open or lock topics or to rename them.
//   locked: topics that are locked as a whole (every level). Every other topic is open at every level.
// The SDGs Pecha Kucha question bank stores the three SDG 9 AI topics as sdg_level 1, 2, 3;
// DB_TOPIC maps them to the topic they really are, for the rule and for display.
window.CARDLEARN_UNLOCKS = {
  locked: ["9-2", "9-3", "13-2"],
  SDG_NAMES: {
    4: { en: "Quality Education", zh: "優質教育" },
    5: { en: "Gender Equality", zh: "性別平權" },
    9: { en: "Industry, Innovation & Infrastructure", zh: "工業創新" },
    13: { en: "Climate Action", zh: "氣候行動" },
  },
  // One display title per topic: the topic's own name, no "SDG n:" or "Topic n:" prefix.
  TOPICS: {
    "4-1": { en: "Quality Education in Taiwan", zh: "台灣的優質教育" },
    "4-2": { en: "Digital Equity and Media Literacy in Taiwan", zh: "台灣的數位平權與媒體素養" },
    "5-1": { en: "A Fair World for Everyone", zh: "人人平等的世界" },
    "5-2": { en: "Gender Equality in Sports", zh: "運動場上的性別平等" },
    "9-1": { en: "Can We Trust AI?", zh: "我們能信任 AI 嗎？" },
    "9-2": { en: "How to Talk to AI Like a Scientist", zh: "像科學家一樣與 AI 對話" },
    "9-3": { en: "What Can Humans Do Better Than AI?", zh: "人類比 AI 更擅長什麼？" },
    "13-1": { en: "Taiwan's Path to Net Zero", zh: "台灣的淨零之路" },
    "13-2": { en: "Climate Adaptation and Water in Taiwan", zh: "台灣的氣候調適與水資源" },
  },
  DB_TOPIC: { 1: "9-1", 2: "9-2", 3: "9-3" },
  LEVELS: { A1: "入門", A2: "基礎", B1: "進階", B2: "高階" },

  // x: a topic code ("9-1"), a real SDG number (4, 13) or a question-bank sdg_level (1, 2, 3, 4, 5, 13).
  code(x) { return this.DB_TOPIC[Number(x)] || String(x); },
  realSdg(x) { return Number(this.code(x).split("-")[0]); },
  isOpen(x) { return !this.locked.includes(this.code(x)); },
  label(x) { return `SDG ${this.code(x)}`; },
  // Card title: the topic's name, otherwise the SDG's English name, otherwise the fallback.
  title(x, fallback = "") { return this.TOPICS[this.code(x)]?.en || this.SDG_NAMES[Number(this.code(x))]?.en || fallback; },
  zh(x) { return this.TOPICS[this.code(x)]?.zh || this.SDG_NAMES[this.realSdg(x)]?.zh || ""; },
  levelLabel(code) { return this.LEVELS[code] ? `${code} ${this.LEVELS[code]}` : code; },
  sortLevels(list, key = x => x) { const order = Object.keys(this.LEVELS); return list.slice().sort((a, b) => order.indexOf(key(a)) - order.indexOf(key(b))); },
};
