// How text is read aloud (2026-11-09 meeting, T2: "SDG" sounded odd).
// The browser's built-in voices guess how to say an abbreviation, and each device guesses differently.
// CardLearnSay(text) rewrites only what is SPOKEN (the text on screen stays as written):
//   • every row of the 念法表 (written → spoken):  SDG 4 → "S D G 4",  SDGs → "S D Gs",  e.g. → "for example"
//   • dashes, semicolons and colons become a comma, so the voice pauses instead of running on
// The table belongs to the whole platform: the teacher edits it in 老師後台 › 教材 › 語音念法
// (backend/speech_rules.py, GET /content/speech). The list below is only the copy used before the
// server answers and when it cannot be reached; the last table received is kept in this browser.
(function () {
  const DEFAULTS = [["SDG", "S D G"], ["AI", "A I"], ["GPT", "G P T"], ["OECD", "O E C D"], ["MRT", "M R T"], ["UN", "U N"], ["EU", "E U"],
    ["UK", "U K"], ["USA", "U S A"], ["UFO", "U F O"], ["GDP", "G D P"], ["NGO", "N G O"], ["CEO", "C E O"], ["DIY", "D I Y"],
    ["CEFR", "C E F R"], ["ESG", "E S G"], ["CO2", "C O 2"], ["PM2.5", "P M 2.5"],
    ["e.g.", "for example"], ["i.e.", "that is"], ["vs.", "versus"], ["etc.", "et cetera"], ["&", "and"]];
  const KEY = "cardlearn.speechRules";
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let map = new Map(), re = null;

  // A row matches whole tokens only ("ChatGPT" and "said" are left alone). An abbreviation in capital
  // letters also matches with a plural s, which stays attached: SDGs → "S D Gs".
  function use(rules) {
    const m = new Map();
    for (const r of rules || []) {
      const w = String((Array.isArray(r) ? r[0] : r && r.written) || "").trim(), s = String((Array.isArray(r) ? r[1] : r && r.spoken) || "").trim();
      if (w && s && !/\s/.test(w) && w.length <= 40) m.set(w, s);
    }
    map = m;
    const keys = [...m.keys()].sort((a, b) => b.length - a.length);
    re = keys.length ? new RegExp("(^|[^A-Za-z0-9])(" + keys.map(esc).join("|") + ")(s?)(?![A-Za-z0-9])", "g") : null;
  }
  function say(text) {
    let t = String(text == null ? "" : text);
    if (re) t = t.replace(re, (all, before, word, plural) => {
      if (plural && !/^[A-Z0-9.]+$/.test(word)) return all;            // "vs." + "s" is not a plural
      const spoken = map.get(word);
      return before + (/^[A-Za-z0-9]/.test(word) ? "" : " ") + spoken + plural + (/[A-Za-z0-9.]$/.test(word) ? "" : " ");
    });
    t = t.replace(/\s*[—–]\s*|\s+-\s+/g, ", ").replace(/\s*;\s*/g, ", ").replace(/\s*:\s+/g, ", ");
    return t.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
  }

  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { /* private window: the defaults are used */ }
  use(stored && Array.isArray(stored.rules) && stored.rules.length ? stored.rules : DEFAULTS);

  function refresh() {
    if (typeof fetch !== "function") return Promise.resolve(false);
    const base = String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
    return fetch(base + "/content/speech").then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d || !Array.isArray(d.rules)) return false;
      use(d.rules);
      try { localStorage.setItem(KEY, JSON.stringify({ rules: d.rules, updated_at: d.updated_at })); } catch (e) { /* not stored: fetched again next time */ }
      return true;
    }).catch(() => false);
  }
  say.use = use;            // the teacher's page tries a table before saving it
  say.refresh = refresh;
  say.defaults = DEFAULTS;
  window.CardLearnSay = say;
  if (typeof module !== "undefined") module.exports = say; else refresh();
})();
