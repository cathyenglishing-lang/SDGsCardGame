"""The quality gate for graded Pecha Kucha scripts.

Two expert audits of the SDG 13 reference mission found the same failure: the
material passed on *averages* while individual slides were all over the place,
and the A2 and B1 texts were the same sentences with synonyms swapped. Averages
cannot detect either problem, so this module replaces them.

Four tests, all machine-checkable:

  fit       every slide is sayable in 20 seconds at that level's speaking rate,
            and fills enough of the slide that the speaker is not left silent
  ladder    syntax and lexis climb A2 -> B1 -> B2, per slide, not just on average
  distance  adjacent levels are not the same sentence with harder words in it
  lint      house style, known factual slips and stage risks

Word count is deliberately NOT part of the ladder. Pecha Kucha fixes the time,
so every level gets roughly the same number of words; what must climb is
sentence length, lexical load and grammatical range.
"""
from __future__ import annotations

import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "scripts"))
from extract_content import LEVEL_WPM, PECHA_SECONDS, capacity, measure  # noqa: E402

LEVELS = ("A2", "B1", "B2")

# How full a 20-second slide should be. Over the ceiling the speaker cannot
# finish. The floor allows roughly five seconds of deliberate pause across the
# slide — landing on the image, one beat before the auto-advance — which is good
# delivery. Below it the speaker genuinely runs out of script and stands there.
FILL_BAND = (0.75, 1.00)

# The ladder. Per slide, not per mission.
#   sentence  average words per sentence on that slide
#   fk        Flesch-Kincaid grade of that slide
#   longword  percentage of words of 8+ letters
BAND = {
    "A1": {"sentence": (5.0, 9.0), "fk": (1.0, 4.0), "longword": (0.0, 6.0)},
    "A2": {"sentence": (7.0, 12.0), "fk": (2.5, 6.5), "longword": (3.0, 11.0)},
    "B1": {"sentence": (11.0, 16.0), "fk": (6.5, 10.5), "longword": (8.0, 17.0)},
    "B2": {"sentence": (14.0, 20.0), "fk": (10.5, 15.0), "longword": (15.0, 27.0)},
}

# A single slide may sit this far outside its band before it counts as a miss;
# prose does not hit a target exactly and a hard edge would only invite padding.
TOLERANCE = {"sentence": 1.5, "fk": 1.5, "longword": 3.0}

# At most this share of a mission's slides may miss a band even within tolerance.
MAX_MISS_RATE = 0.20

# Vocabulary overlap between a slide's text at two adjacent levels. Above this
# the two levels are the same sentence wearing a different coat.
MAX_JACCARD = 0.42
MAX_JACCARD_MEAN = 0.34

STOPWORDS = set("""a an the and or but so if then than that this these those of in on at to for from with
by as is are was were be been being it its we our you your they their he she his her i me my not no do does
did have has had will would can could should must may might there here what which who how why when where
about into over under more most much many very can't don't won't let us""".split())


# --------------------------------------------------------------- helpers
def content_words(text: str) -> set:
    """Words that carry the writer's choices.

    Proper nouns and numbers are excluded: the Climate Change Response Act is
    called that at every level, and 2050 is 2050. Counting them as overlap would
    punish a mission for keeping its facts straight, which is the opposite of
    what this measure is for."""
    out = set()
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        for i, w in enumerate(re.findall(r"[A-Za-z0-9][A-Za-z0-9'\-]*", sentence)):
            if w[0].isupper() and i > 0:
                continue          # proper noun
            if w[0].isdigit():
                continue          # a date or a quantity
            lw = w.lower()
            if lw not in STOPWORDS and len(lw) > 2:
                out.add(lw)
    return out


def jaccard(a: str, b: str) -> float:
    sa, sb = content_words(a), content_words(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# --------------------------------------------------------------- lint
# Each rule is (pattern, severity, message). These are the concrete defects the
# two audits found; keeping them here stops them coming back in the next rewrite.
LINT = [
    (r"\blet us\b", "high", "'let us' is liturgical on stage — use 'let's'"),
    (r"\bUbike\b", "high", "the brand is 'YouBike'"),
    (r"\benergy safety\b", "high", "the term is 'energy security'"),
    (r"\bcoal and oil\b", "high", "Taiwan's power mix is coal and gas, not oil"),
    (r"\bdirty island\b", "high", "calling Taiwan a 'dirty island' on a Taiwanese stage"),
    (r"[Tt]hank you for listening\.?\s*$", "high",
     "ending on 'thank you' kills the applause line — end on the claim"),
    (r"\bit already works\b", "high",
     "overstates a 2,000 t/yr demonstration plant as a working solution"),
    (r"\brely heavily on public transport\b", "high",
     "contradicts the data: public transport share is ~14%, scooters dominate"),
    (r"\bSilicon Shield\b", "medium",
     "a cross-strait deterrence theory, not a nickname for the industry — reframe or explain"),
    (r"\bdirty air\b", "medium",
     "CO2 is not 'dirty air'; at A2 use 'carbon gas' so the science stays true"),
    (r"\babsolutely (?:uninterrupted|stable)\b", "low",
     "'absolutely' on an ungradable adjective, and the phrase repeats across slides"),
    (r"\bhide it (?:deep )?underground\b", "low", "carbon is 'stored', not 'hidden'"),
    (r"\bcool invention\b", "low", "teen slang breaks the register of the rest of the speech"),
    (r"\bacross the Taiwan Strait\b", "low",
     "the wind farms are off Taiwan's west coast; 'across the Strait' is politically loose"),
    (r";", "low", "a semicolon gives the speaker no breathing cue — use a dash or a full stop"),
]


def lint(text: str) -> list:
    out = []
    for pattern, sev, msg in LINT:
        if re.search(pattern, text):
            out.append((sev, msg))
    return out


# --------------------------------------------------------------- the gate
def check_slide(text: str, level: str) -> list:
    """Every way one slide at one level can fail. Empty list means it passes."""
    mm = measure(text, level)
    band, fails = BAND[level], []

    cap = capacity(level)
    if mm["words"] > cap:
        fails.append(f"{mm['words']} words needs {mm['speak_seconds_est']} s at "
                     f"{LEVEL_WPM[level]} wpm, over the {PECHA_SECONDS} s slide")
    elif mm["words"] < cap * FILL_BAND[0]:
        fails.append(f"only {mm['words']} words — {round(PECHA_SECONDS - mm['speak_seconds_est'], 1)} s "
                     f"of silence at {LEVEL_WPM[level]} wpm")

    for key, value in (("sentence", mm["avg_sentence_words"]),
                       ("fk", mm["fk_grade"]),
                       ("longword", mm["long_word_pct"])):
        lo, hi = band[key]
        tol = TOLERANCE[key]
        if value < lo - tol:
            fails.append(f"{key} {value} far below {level} ({lo}-{hi}) — reads below level")
        elif value > hi + tol:
            fails.append(f"{key} {value} far above {level} ({lo}-{hi})")
    return fails


def soft_miss(text: str, level: str) -> list:
    """Bands missed but inside tolerance — allowed, up to MAX_MISS_RATE."""
    mm = measure(text, level)
    out = []
    for key, value in (("sentence", mm["avg_sentence_words"]),
                       ("fk", mm["fk_grade"]),
                       ("longword", mm["long_word_pct"])):
        lo, hi = BAND[level][key]
        if not (lo <= value <= hi) and abs(value - (lo if value < lo else hi)) <= TOLERANCE[key]:
            out.append(key)
    return out


def check_level(slides: dict, level: str) -> dict:
    """slides: {slide_no: text}. Returns a verdict for one mission at one level."""
    hard, soft = {}, {}
    style = {}
    for no, text in sorted(slides.items(), key=lambda kv: int(kv[0])):
        f = check_slide(text, level)
        if f:
            hard[no] = f
        s = soft_miss(text, level)
        if s:
            soft[no] = s
        li = lint(text)
        if li:
            style[no] = li
    n = max(1, len(slides))
    return {
        "level": level,
        "slides": len(slides),
        "hard": hard,
        "soft": soft,
        "style": style,
        "soft_rate": round(len(soft) / n, 2),
        "soft_rate_ok": len(soft) / n <= MAX_MISS_RATE,
        "pass": not hard and len(soft) / n <= MAX_MISS_RATE
        and not any(sev == "high" for v in style.values() for sev, _ in v),
    }


def check_distance(by_level: dict) -> dict:
    """Are adjacent levels actually different texts?"""
    out = {}
    pairs = [(a, b) for a, b in zip(LEVELS, LEVELS[1:]) if a in by_level and b in by_level]
    for a, b in pairs:
        scores = {}
        for no, text in by_level[a].items():
            other = by_level[b].get(no)
            if other:
                scores[no] = round(jaccard(text, other), 2)
        if not scores:
            continue
        mean = sum(scores.values()) / len(scores)
        too_close = {no: v for no, v in scores.items() if v > MAX_JACCARD}
        out[f"{a}->{b}"] = {
            "mean": round(mean, 2),
            "mean_ok": mean <= MAX_JACCARD_MEAN,
            "too_close": dict(sorted(too_close.items(), key=lambda kv: -kv[1])),
            "pass": mean <= MAX_JACCARD_MEAN and not too_close,
        }
    return out
