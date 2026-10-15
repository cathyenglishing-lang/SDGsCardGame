// Shared game state for one run. Nothing here is persisted (prototype).
export const S = {
  level: "A2",
  stage: -1,            // 0..5 while playing, 6 = ending
  started: false,
  t0: 0,
  stars: {},            // stage index -> 0..3 | "pending" | "skip"
  // Story variables. Nodes read and write these; the ending is computed from them.
  vars: { integrity: 0, kai: null, approach: null, evidence: 0, trust: 0, scandal: false, reporter: null, hsuBeforeKai: false },
  done: [],             // node ids completed, in order
  speech: "browser",    // browser | record | none
  metrics: { replays: 0, cardErrors: 0, readSec: 0, speakBest: [], missed: [], zhHints: 0, hits: 0, jumps: 0, eavesdrops: 0, walkSec: 0 },
  events: [],
};
export const STAGES = [
  { en: "Hook", part: 1, station: "pier" },
  { en: "Problem", part: 2, station: "lab" },
  { en: "Explain", part: 3, station: "archive" },
  { en: "Impact", part: 4, station: "council" },
  { en: "Strategy", part: 5, station: "workshop" },
  { en: "Conclusion", part: 6, station: "theater" },
];
