You are an award-winning narrative game designer and systems designer, on loan to consult for one hour at maximum depth. Do not hedge, do not produce a generic options-list — commit to specific, buildable answers, argue for them, and say plainly where you think the brief below is wrong.

# The product

A CEFR-graded English-speaking learning game for Taiwanese university students, built around SDG (Sustainable Development Goals) Pecha Kucha speeches — 20 slides, 20 seconds each, 6:40 total, spoken aloud. The material (51 missions across all 17 SDGs, three CEFR levels A2/B1/B2 each, ~22 finished so far) is fully written and quality-gated already — that part is done and out of scope here. This request is purely about the GAME LAYER wrapped around that material: the existing card game is judged "boring, ends abruptly" by its owner, and he wants a real narrative game built on top, without losing the card game.

The owner's brief, verbatim intent: a game with story and multiple branching storylines (kept within a controllable range, not combinatorial explosion), 3D scenes — specifically a moment of walking up to a stage to give a speech — a speech window that pops up, each "node" feeling like a 3D scene/video, similar in feel to games he's seen elsewhere. He wants to KEEP the card game: specifically, during a speech segment, the player should be able to hand out cards to the audience, and this should connect into and continue the card-game session.

# Constraints already established by prior research (real, not negotiable without a strong reason — if you think one should be broken, say so explicitly and argue it)

1. **Narrative effect size**: Wouters et al. 2013 meta-analysis — games WITH narrative context: d=0.25; games WITHOUT: d=0.46. Narrative measurably HURTS learning outcome when it's heavy. Conclusion already adopted: narrative is a light task-frame only, ≤3 sentences per beat intro, no worldbuilding, no character side-plots.
2. **3D realism effect size**: same meta-analysis — realistic 3D: d=0.14 (not significant); schematic/diagrammatic 3D: d=0.46. 3D must be stylized/low-poly, and must justify its screen time as part of a puzzle or interaction, never a passive moving backdrop.
3. **Hardware reality**: 30 tablets on shared classroom WiFi, iPad-9-class hardware (A13). three.js after ~15 min continuous render thermal-throttles; WebGL context loss is a real classroom-killing failure mode. A prior Gemini consult on this exact project flagged 3D as a "fatal flaw" risk and recommended 2.5D parallax as the safe fallback, conceding it loses cinematic camera sweeps and depth. The existing engineering plan already specced a "StageShell" architecture: one shared shell (renderer/camera/lights/LOD/dispose) that swaps lightweight glTF "Sets" (~1.2MB each, instanced meshes, KTX2/Draco compressed), degrades in 3 tiers (high → low → 2D SVG fallback) based on live frame-time, and freezes all animation (`setIdle(true)`) the instant a text panel opens, because reading comprehension is the actual pedagogical target and animated backgrounds measurably steal attention budget from A2 learners.
4. **Existing narrative skeleton, already authored and validated** (do not redesign from scratch — build on it or argue specifically why to replace it):
   - 6 fixed beats per mission, shared across all 51 missions: S1 Arrival (intro) → S2 The Crack (problem; **Decision Point 1**) → S3 What Works (achievements; bottleneck, no branching) → S4 The Build (solutions; **Decision Point 2**) → S5 The Pushback (implications; **Challenge beat**, 3 quality tiers of response: bad/weak/strong) → S6 The Stand (call to action; ending reveal + student reads the closing line aloud).
   - 3 fixed character archetypes reused every mission: an Ally (gives evidence), a Skeptic (gives a condition that must be met with matching evidence), a Blocker (gives pressure/pushback at S5).
   - 3 meters: clarity, trust, impact (0-20 each, start at 8, clamped). Decisions and the Challenge beat move them. Total across all three, at the end, selects one of 3 endings (Standing Ovation / Working Draft / Notes for Next Time).
   - "Evidence Economy": every piece of evidence a decision option needs is a sentence lifted verbatim from that mission's actual A2/B1/B2 script (never invented) — reading comprehension IS resource collection, this is the one mechanic a prior Gemini consult identified as the load-bearing wall of the whole design and said must never be diluted.
   - Branch-and-bottleneck: choices only fork WITHIN a beat; every beat boundary re-converges — the next beat's location, cast, and intro text are identical no matter which of the (3 decisions)^2 × (3 challenge responses) = up to 27 combinations of prior choices the player made. This is what keeps authoring cost from exploding across 51 missions (a prior Gemini consult on this exact project separately estimated a single fully-unique-branching mission at 45-50 authoring hours and called that ceiling "definitely blown" at scale — DO NOT propose a design that reintroduces that blowup).
   - A "Previously on..." recap (state-generated, zero new writing) runs after any >20-minute gap, to fight context collapse across a mission split over two class periods.
   - Authoring budget actually enforced per mission: 45 writing units (6 intros + 5 evidence + 5 comprehension checks + 2×3 decision options + 3 challenge responses + 3 endings + 1 closing line + 3 character entrances + 1 mission-briefing card), hard ceiling 55.
5. Existing full worked example for one mission (SDG 13-1, Taiwan's climate law) exists already, including exact decision option text, meter deltas, and ending thresholds — available on request but not pasted here for length; assume it exists and is the pattern every mission follows.

# What I need from you

## 1. React to my strawman, specifically

My own first-pass design, which I want you to stress-test and improve rather than replace wholesale unless you think it's actually wrong:

- **Overworld = a visible node graph** (think Slay the Spire's map), one node per beat, player picks among a bounded set of next-nodes (usually 2 real choices, occasional forced single path at a bottleneck). Branching is realized as DIFFERENT PRESENTATION AND ORDER over the SAME six-beat skeleton and SAME meter math — not different underlying content per path. This is how "multiple storylines, bounded" gets satisfied without reopening the authoring-cost blowup.
- **Each node transition = the "3D video" feel**: entering a node plays a short (5-8s), non-interactive, low-poly camera move through a StageShell Set (e.g. hallway → stage wings → spotlight at the podium), skippable after first viewing. This is punctuation between beats, not an explorable walking-simulator — satisfies "walk up to the stage" without reopening the performance/attention-budget risk 3D already carries in this project.
- **The Speech Window** pops after the transition: current Pecha Kucha slide image, the student's CEFR-level script text, a 20-second pacing bar, and a hand of cards. The audience (the 3 archetypes) are visible portraits in the background, reactive via the existing `setMeters()` interface.
- **New mechanic — "play a card on the audience"**: at each Decision Point / Challenge beat, the speech pauses; the player drags one evidence card from their hand onto one audience portrait. The card's text IS the evidence sentence (from the Evidence Economy, unchanged). Playing the card that actually answers that character's known concern (e.g. the Skeptic engineer needs stability evidence) triggers the strong-tier outcome; a mismatched card triggers weak/bad — this is a direct reskin of the already-validated Decision/Challenge system as a physical card-play instead of a button, which I think is low implementation risk and high thematic payoff, but I want you to tell me if I'm wrong about the risk being low.
- **Bridge into the card game**: cards not played during the speech, or cards earned by a strong-tier play, become the deck for a post-speech "rebuttal" round against the Blocker — using (or extending) the existing card-battle system, as a continuation of the same session rather than a separate minigame launched from a menu.

Tell me directly: what's the weakest link in this chain? What would you cut, and what would you add that I haven't thought of?

## 2. Design the card system in full

I've only sketched "cards = evidence sentences." You design the rest: how many cards exist per mission (given the 45-unit authoring ceiling — evidence units are already capped at 5 per mission, so are you proposing 5 cards, or does a card decompose differently than 1:1 with an evidence unit?), what a card looks like as a game object (does it have a suit/type beyond "which archetype it answers"? does level A2 vs B2 change the card's text but not its game-mechanical identity?), how cards are ACQUIRED (all handed to the player up front, or earned progressively through earlier beats — and if progressive, where does that authoring content come from without blowing the budget), and exactly how the "leftover/earned cards → rebuttal deck" handoff works as a concrete data flow.

## 3. Walk one full mission, start to finish

Pick SDG 13-1 (Taiwan's climate law, the mission with the fully worked example) and narrate the player's actual moment-to-moment experience through all 6 beats with this new system: what they see, what they click/drag, what the 3D transition looks like at 2-3 key nodes, exactly where a card gets played and on whom, what the rebuttal round looks like, how it ends. Concrete, not abstract.

## 4. The node graph as a real data structure

Sketch the actual shape (pseudocode/JSON schema is fine) of a "node" and how the graph is authored per mission such that the SAME renderer/engine works for all 51 missions with only data changing, not code — this project explicitly cannot afford bespoke code per mission at this scale.

## 5. Where you think the existing constraints are wrong

If anything in section "Constraints" above is, in your judgment, actually a mistake for THIS specific redesign (not a re-litigation of the general evidence — argue from what this new node/card/3D system specifically changes about the tradeoff), say so and argue it. I'd rather you push back hard than comply with something you think will produce a worse game.

Answer in clearly labeled sections matching the 5 asks above. Be concrete everywhere a concrete answer is possible; use exact numbers, not ranges, wherever you're proposing a budget or a count.

---
STATUS: queued, not yet run. Gemini's individual quota (agy.exe --model
gemini-3.1-pro-high) was exhausted 2026-09-24, reset ~46h later (~2026-09-26).
Claude's own answer to all 5 questions is in the doc tab "遊戲敘事設計 DRAFT"
and in this repo's game-design notes. Re-run this exact prompt with:

  S=<scratch dir>
  /c/Users/asd03/AppData/Local/agy/bin/agy.exe --model gemini-3.1-pro-high \
    --mode plan --dangerously-skip-permissions --print-timeout 900s \
    -p "$(cat docs/plans/gemini-game-design-prompt-pending.md)" > "$S/response.md"

then fold its critique into the design doc rather than starting over.
