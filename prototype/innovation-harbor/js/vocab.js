// Target vocabulary for SDG 9-1 "Can We Trust AI?" (A2 / B1 / B2).
// Cloze blanks, distractors and "find the word" tasks are drawn from GLOSSARY first,
// so students practise topic vocabulary instead of random long words like "everyone".

export const GLOSSARY = {
  // ── A2 core ──
  industry: ["factories and companies that make things", "工業"],
  innovation: ["a new idea, method or product", "創新"],
  infrastructure: ["basic systems a country needs: roads, power, internet", "基礎建設"],
  technology: ["machines, tools and computer systems", "科技"],
  intelligence: ["the ability to learn and understand", "智慧"],
  artificial: ["made by people, not natural", "人工的"],
  trust: ["to believe something is true or safe", "信任"],
  scientists: ["people who study science", "科學家"],
  reports: ["written documents about work or research", "報告"],
  articles: ["pieces of writing in a journal or newspaper", "文章"],
  fake: ["not real; made to look real", "假的"],
  references: ["the books and papers a report says it used", "參考文獻"],
  papers: ["published research articles", "論文"],
  facts: ["things that are true", "事實"],
  hallucination: ["when an AI invents facts that sound real", "幻覺（AI 捏造）"],
  guesses: ["chooses an answer without knowing it is right", "猜測"],
  formulas: ["mathematical rules", "公式"],
  data: ["numbers and information", "數據"],
  blindly: ["without looking or thinking first", "盲目地"],
  assignments: ["homework or tasks for a course", "作業"],
  professors: ["university teachers", "教授"],
  classmates: ["students in the same class", "同學"],
  honest: ["telling the truth", "誠實的"],
  communication: ["sharing information with people", "傳播／溝通"],
  information: ["facts or details about something", "資訊"],
  innovations: ["new ideas or products", "創新成果"],
  immediately: ["right now, without waiting", "立刻"],
  academic: ["connected with university study", "學術的"],
  websites: ["pages on the internet", "網站"],
  decision: ["a choice you make after thinking", "決定"],
  irreplaceable: ["so special that nothing can take its place", "無可取代的"],
  algorithms: ["step-by-step rules a computer follows", "演算法"],
  organize: ["to put things in order", "整理"],
  curiosity: ["a strong wish to know or learn", "好奇心"],
  intuition: ["understanding something by feeling, not by proof", "直覺"],
  ethical: ["morally right", "合乎倫理的"],
  carefully: ["with attention, to avoid mistakes", "小心地"],
  wisely: ["in a smart, sensible way", "明智地"],
  truth: ["what is real and correct", "真相"],
  internet: ["the global computer network", "網際網路"],
  // ── B1 ──
  essential: ["completely necessary", "必要的"],
  progress: ["moving forward; improvement", "進步"],
  economic: ["connected with money, trade and industry", "經濟的"],
  framework: ["a basic structure or plan", "架構"],
  revolutionary: ["causing a complete change", "革命性的"],
  researchers: ["people who do research", "研究人員"],
  analyze: ["to study something in detail", "分析"],
  accelerate: ["to make something happen faster", "加速"],
  discoveries: ["things found out for the first time", "發現"],
  outputs: ["the results a system produces", "輸出結果"],
  undergraduate: ["a university student before a first degree", "大學部學生"],
  generative: ["able to create new text, images or code", "生成式的"],
  streamline: ["to make a process simpler and faster", "簡化流程"],
  summarize: ["to give the main points briefly", "摘要"],
  clarify: ["to make something clear", "釐清"],
  concepts: ["ideas or principles", "概念"],
  misleading: ["giving a wrong idea", "誤導的"],
  possess: ["to have or own", "擁有"],
  predict: ["to say what will happen next", "預測"],
  patterns: ["regular ways that things repeat", "模式"],
  probabilities: ["how likely things are to happen", "機率"],
  professional: ["expert; of a high standard", "專業的"],
  integrity: ["being honest and following strong moral rules", "誠信"],
  credibility: ["the quality of being believed and trusted", "可信度"],
  reliable: ["can be trusted to be correct", "可靠的"],
  responsible: ["in charge of, and answering for, something", "負責的"],
  critical: ["judging carefully; not accepting things easily", "批判性的"],
  benefit: ["to help; to be good for", "有益於"],
  society: ["people living together in a community", "社會"],
  wisdom: ["good judgment from knowledge and experience", "智慧"],
  trustworthy: ["able to be trusted", "值得信賴的"],
  // ── B2 ──
  resilient: ["able to recover quickly from problems", "有韌性的"],
  initiative: ["a new plan to achieve something", "倡議"],
  utilize: ["to use in an effective way", "運用"],
  foster: ["to help something grow or develop", "促進"],
  sustainable: ["able to continue without harming the future", "永續的"],
  integrate: ["to combine into one whole", "整合"],
  comprehensive: ["including everything that is needed", "全面的"],
  synthesizing: ["combining ideas from many sources", "整合歸納"],
  theoretical: ["based on ideas, not practice", "理論的"],
  flawless: ["without any mistakes", "完美無瑕的"],
  phenomenon: ["something that happens and can be observed", "現象"],
  fabricates: ["invents false information", "捏造"],
  deceptive: ["making people believe something false", "欺騙性的"],
  nonexistent: ["not existing at all", "不存在的"],
  citations: ["references to sources in a text", "引用"],
  assertions: ["strong statements that something is true", "斷言"],
  authentic: ["real; genuine", "真實的"],
  probable: ["likely to happen or be true", "可能的"],
  sequence: ["the order in which things follow each other", "序列"],
  verifying: ["checking that something is true", "查證"],
  evidence: ["facts that show something is true", "證據"],
  convincing: ["making you believe it is true", "有說服力的"],
  fluency: ["speaking or writing smoothly", "流暢度"],
  accuracy: ["being correct and exact", "準確度"],
  threaten: ["to put in danger", "威脅"],
  ethics: ["moral principles", "倫理"],
  consequences: ["results of an action", "後果"],
  inaccurate: ["not correct", "不準確的"],
  verification: ["the process of checking something is true", "查證"],
  acceptance: ["agreeing that something is true", "接受"],
  consulting: ["asking an expert or source for information", "查詢"],
  judgment: ["the ability to make good decisions", "判斷力"],
  automated: ["done by machines without people", "自動化的"],
  optimizing: ["making something as good as possible", "最佳化"],
  genuine: ["real; sincere", "真正的"],
  evaluation: ["judging how good or useful something is", "評估"],
  misinformation: ["false information", "錯誤資訊"],
  uphold: ["to defend or keep a principle", "維護"],
  thoughtfully: ["with careful thought", "深思熟慮地"],
};

// Frequent / structural words that must never become a blank.
export const COMMON = new Set(`a an the and or but of to in on at for with by from as is are was were be been being it its this that these those we our us you your i my me they their them he she his her so if not do does did can will would should must have has had there what which who how why than then also very just into about more most such only every all one two three let lets let's thank thanks good morning everyone today want talk think work day days many much new strong great big small fast help share ideas idea time also even still really things thing problem problems question questions answer answers first next last finally conclusion people world better around always sometimes because important like use used uses using make makes made need needs example together future understand understands read write learn learns help helps save saves lot lots easy hard right wrong true real some any each other another same different way ways before after again now here where when while however therefore instead without within far much well often never always may might could come comes become becomes get gets give gives take takes look looks sound sounds seem seems say says said tell tells call called part parts own both few several enough too amazing better best worse worst build builds building support supports sharing something nothing everything anything someone human humans students student science school classroom university college computer computers tools tool machine machines word words sentence sentences next final answer start begin end stop keep keeps simple short long high low later early quickly slowly truly completely entirely especially mainly exactly maybe perhaps certainly clearly fully immediately problem based`.split(/\s+/));

const NAMES = new Set(["chatgpt", "gemini", "google", "scholar", "pubmed", "sdg", "ai", "united", "nations", "artificial"]);

export const tokenize = s => (String(s).toLowerCase().replace(/[’‘]/g, "'").match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || []);
export const stem = w => w.replace(/'s$/, "").replace(/ies$/, "y").replace(/(sses|shes|ches|xes)$/, m => m.slice(0, -2)).replace(/([^s])s$/, "$1");

// Words in `script` that are worth practising, in order of appearance.
export function targetWords(script, n = 2, exclude = []) {
  const toks = String(script).match(/[A-Za-z][A-Za-z'’-]*[A-Za-z]/g) || [];
  const seen = new Set(), out = [];
  const ex = new Set(exclude.map(w => w.toLowerCase()));
  for (const raw of toks) {
    const w = raw.toLowerCase().replace(/[’]/g, "'");
    if (seen.has(w) || ex.has(w)) continue;
    seen.add(w);
    if (NAMES.has(w) || COMMON.has(w) || w.length < 5) continue;
    const g = GLOSSARY[w] || GLOSSARY[stem(w)];
    const rare = !COMMON.has(stem(w)) && w.length >= 7;
    if (g || rare) out.push({ word: raw, key: w, score: g ? 2 : 1, def: g?.[0] || "", zh: g?.[1] || "" });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, n).sort((a, b) => String(script).indexOf(a.word) - String(script).indexOf(b.word));
}

// Distractors of similar length/shape taken from the same level's glossary words.
export function distractors(word, pool, n = 3) {
  const w = word.toLowerCase();
  const cands = [...new Set(pool.map(x => x.toLowerCase()))].filter(x => x !== w && stem(x) !== stem(w));
  cands.sort((a, b) => Math.abs(a.length - w.length) - Math.abs(b.length - w.length) + (Math.random() - .5));
  return cands.slice(0, n);
}

// Coverage of target vocabulary in what the student said (for speaking).
const SPEAK_STOP = new Set([...COMMON].filter(w => w.length <= 4).concat("every everyone morning today want talk think".split(" ")));
export function coverage(target, said) {
  const T = [...new Set(tokenize(target).filter(w => !SPEAK_STOP.has(w) && w.length > 2))];
  const Sd = new Set(tokenize(said).map(stem));
  const hit = T.filter(w => Sd.has(stem(w)));
  return { ratio: T.length ? hit.length / T.length : 0, hit, miss: T.filter(w => !hit.includes(w)) };
}

export function glossaryFor(words) {
  return words.map(w => { const k = w.toLowerCase(); const g = GLOSSARY[k] || GLOSSARY[stem(k)]; return g ? { word: w, def: g[0], zh: g[1] } : null; }).filter(Boolean);
}
