"""One-shot writer for the SDG 13-1 v2 reference text. Kept in the repo so the
gold reference can be regenerated and diffed rather than existing only as JSON.

What separates the three levels here is sentence length and lexical load, not
word count: Pecha Kucha fixes the time, so every level gets about the same
number of words. A2 says short things plainly, B1 says longer things in everyday
words, B2 says the same things in one complex sentence with an academic edge.
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "content", "authored", "levels")

BASIS = (
    "Rewritten against the v2 quality gate after two independent expert audits (CEFR "
    "assessor; speech coach + fact checker) found the v1 text passed on averages while "
    "individual slides missed their band, A2 and B1 were the same sentences with synonyms "
    "swapped, and several facts had drifted. Facts corrected to source: +1.6 degrees over a "
    "century (NSTC 2024) against a global 1.3; Climate Change Response Act 2023; carbon fee "
    "live 2025; Taichung capture demonstration about 2,000 t/yr, not a deployed solution; "
    "public transport share is about 14%, so 'we rely on public transport' was removed; "
    "'Silicon Shield' dropped as a cross-strait deterrence term unsuited to a climate talk. "
    "Level is carried by syntax and lexical load, not by word count."
)

A2 = {
    1: "Last summer Taiwan broke its own temperature record again. That was not bad luck. It was a warning, and today I will show you how we can answer it.",
    2: "SDG 13 is called Climate Action. It asks every country to cut carbon gas and to get ready for storms and flooding. That work has already started here.",
    3: "Think about where we live. Taiwan is a crowded island with many mountains, so typhoons and high seas reach us fast. Our big factories also need huge power.",
    4: "First, the bad news. Over one hundred years Taiwan warmed by 1.6 degrees, while the whole world warmed by 1.3. Scientists say our island is heating faster.",
    5: "Here is the main problem. Taiwan still burns coal and gas for most of its power, and our chip factories run day and night. Clean power must grow faster.",
    6: "So ask yourself two questions. Can a small island pay for all this energy? And if we keep burning coal, who will fix the damage later?",
    7: "Now the good news. In 2023 Taiwan passed a climate law that sets one target: net zero by 2050. Big polluters now pay a carbon fee too.",
    8: "You can see the change at sea. Hundreds of wind turbines now stand off our west coast. Solar panels cover school roofs, fish ponds and farm sheds.",
    9: "People help too. Taiwan recycles more than most countries, and many of us ride the MRT or a YouBike. But daily habits alone cannot stop this.",
    10: "Engineers want a smarter grid. The plan is to let computers move power to the places that need it most, minute by minute. Taipower is testing it now.",
    11: "Scientists are also trying carbon capture. At a power plant in Taichung they catch about 2,000 tonnes of carbon each year. It is small, but it is a start.",
    12: "Look at our streets. Taiwan makes electric scooters with a battery you can swap in ten seconds. Swap points now cover the whole island, from Taipei to Kenting.",
    13: "Green choices are not cheap. New machines cost money, and a small shop cannot always pay. A fair plan must help those shops, not punish them.",
    14: "Energy security is a hard choice. Our factories need steady power every hour, but wind and sun come and go. Should Taiwan pick gas, or nuclear?",
    15: "Weather does not stop at a border. Taiwan wants to share what we build, though we cannot join the big climate meetings. A storm does not check passports.",
    16: "Watch out for greenwashing. Some firms say they are green but change very little. Ask them one thing: what exactly will you do before 2050?",
    17: "So where are we now? Taiwan has passed the law, built the wind farms and started the first carbon tests. A coal-heavy island is slowly turning green.",
    18: "Why should you care? Because your choices about jobs, votes and everyday habits will shape the next thirty years. Young people move this country.",
    19: "You do not have to feel afraid. You do have to feel useful. Learn the science, question the numbers, and tell people whatever you discover.",
    20: "The clock is running, and the question is yours. Will you watch this change happen, or help to build it? Taiwan is ready for SDG 13, and so am I.",
}

B1 = {
    1: "Have you noticed how strange our weather has become? Record heat, sudden flooding and mild winters are no longer unusual, and together they mark the leading edge of a climate emergency.",
    2: "Climate Action is the thirteenth of the global goals, and it asks every government to cut carbon and prepare for disaster. Taiwan follows it, though we cannot join the United Nations.",
    3: "Geography makes this personal for us. We live on a crowded island directly on the typhoon track, and our western coastline is low and flat. The industries that pay our bills are hungry for energy.",
    4: "Start with the measurements, not the impressions. Over the past century Taiwan warmed by 1.6 degrees while the whole planet warmed by 1.3. Our island is heating faster than the worldwide average.",
    5: "The difficulty is structural. Coal and imported gas still make most of our electricity, and the chip plants that anchor our economy cannot survive a single hour without power.",
    6: "Two questions follow, and neither of them is comfortable. If industrial demand keeps rising, can clean power ever catch up? And if it cannot, who pays the bill that our generation leaves behind?",
    7: "Real progress has finally arrived. Taiwan passed the Climate Change Response Act in 2023, which wrote net zero by 2050 into law. Heavy polluters have paid a carbon fee since 2025.",
    8: "The coastline has changed in front of us, with hundreds of turbines now standing off our western shore. Solar panels have spread across school roofs, fish farms and factory estates.",
    9: "People here have done their part. Taiwan recycles more than most countries, yet scooters still fill our roads far more than buses, so personal effort alone will never be enough.",
    10: "Engineers are now designing a smarter grid. The idea is that software, not a control room, decides where power should travel each minute, and Taipower has begun testing it.",
    11: "Carbon capture is being tested here too. A demonstration unit at the Taichung power station removes about 2,000 tonnes of carbon each year. That proves the chemistry, but not yet the scale.",
    12: "Our streets carry a different kind of idea. Riders here exchange a flat battery for a charged one in seconds, and thousands of swap bays now sit outside convenience stores nationwide.",
    13: "Cutting carbon is expensive, though, and that is rarely mentioned. Cleaner machines need money that small factories rarely have, so any honest plan has to carry those firms rather than break them.",
    14: "Keeping the lights on is the hardest part. Precision plants draw current every hour, while wind and sunshine arrive whenever they please. That forces a choice between gas and a nuclear restart.",
    15: "Climate change respects no border at all. Taiwan has technology worth sharing, although being shut out of the main climate talks limits how far that help can actually travel.",
    16: "Greenwashing deserves your attention. Firms often advertise how green they are while changing very little, so ask for real numbers and a dated plan instead of a nice picture of a wind turbine.",
    17: "Where does this leave us? The target is now law, the turbines are turning and the first capture trials have started, so a coal-heavy island has genuinely begun to change direction.",
    18: "This matters to you directly. Your generation will supply the engineers, the voters and the buyers of the next thirty years, and those choices will outlast every politician now in office.",
    19: "Fear is not a useful answer to this. Curiosity is far stronger, so study the science, question the numbers you are given, and tell people honestly whatever you find out.",
    20: "So the question comes back to this room. Will your generation simply inherit this change, or will you actually decide to lead it? I have already chosen, and I hope you join me.",
}

B2 = {
    1: "Something has shifted in the way our seasons behave, and the record heat, sudden flooding and vanishing winters are no longer unusual events. They are the local signature of a global emergency.",
    2: "The thirteenth global goal asks every government to reduce emissions and to build genuine defences against disaster. Taiwan, although excluded from the United Nations, has chosen to meet the identical standard.",
    3: "Geography leaves us very little margin. We are a crowded island on the typhoon track, with a low western coastline and an export-driven economy built around power-hungry manufacturing that never stops.",
    4: "Consider the measurements rather than the impressions. A century of observations shows Taiwan warming by 1.6 degrees against a global 1.3, positioning our island among the faster-warming regions of the planet.",
    5: "Our difficulty is structural rather than moral. Coal and imported gas still dominate electricity generation, and the chip industry that underwrites our prosperity cannot lose even a single hour of supply.",
    6: "Two uncomfortable questions follow from that. If industrial demand keeps climbing, can clean power ever really overtake it, and if it cannot, which generation absorbs the debt we are quietly building?",
    7: "Progress has nonetheless been substantial. The 2023 Act wrote net zero by 2050 into statute, and a carbon fee introduced in 2025 now bills the largest emitters for what they release.",
    8: "Two industries now mark our shoreline. Offshore turbines face the Strait in their hundreds, while solar panels have occupied campus roofs, aquaculture ponds and industrial parks the length of the island.",
    9: "Public effort here is genuine but not enough. Recycling rates beat those of most economies, yet private scooters still rule everyday travel, so personal habit cannot substitute for structural reform.",
    10: "Engineers are rebuilding the grid around software rather than switchgear. The intention is that a program allocates power minute by minute, and Taipower has moved from modelling into limited trials.",
    11: "Carbon capture illustrates both the promise and the proportion of this work. A demonstration unit at Taichung removes roughly 2,000 tonnes a year, which validates the chemistry while remaining tiny beside the output of the plant.",
    12: "Urban travel offers a more convincing example. Electric scooters manufactured here operate on a battery exchanged in seconds, and thousands of swap points now form a refuelling network of national scale.",
    13: "Cutting carbon nevertheless imposes real costs on the smallest firms. Cleaner gear needs money that small factories seldom hold, so a transition designed without support will simply move the hardship elsewhere.",
    14: "Energy security remains politically unresolved. Precision factories demand power every hour, whereas wind and solar output rises and falls, forcing a hard choice between more gas and a nuclear restart.",
    15: "The atmosphere ignores sovereignty entirely. Taiwan holds technology worth sharing, yet exclusion from the main climate talks limits how far that knowledge can in practice travel beyond our own shores.",
    16: "Scepticism is a civic skill worth practising. Companies now market their green virtue while altering very little, so insist on audited figures and dated promises rather than photographs of turbines.",
    17: "The direction is encouraging without yet being sufficient. The law exists, offshore capacity is expanding and the first capture trials have begun, yet renewable generation still sits below our own target.",
    18: "This concerns you considerably more than it concerns me. Your cohort will supply the engineers, voters and consumers of the coming decades, and those choices will outlive every administration now in office.",
    19: "Despair is analytically useless here, whereas curiosity is genuinely productive. So interrogate the science, verify the figures you are given, and communicate whatever you establish as clearly as you can.",
    20: "Which returns the question to this room: will your generation merely inherit this transition, or will you actually engineer it? Taiwan is ready to deliver on SDG 13, and I have personally decided that I am.",
}

for lv, data in (("A2", A2), ("B1", B1), ("B2", B2)):
    payload = {
        "mission_id": "sdg13-1",
        "level": lv,
        "provenance": "authored-replacement",
        "author": "Claude (English teacher role), v2 after expert audit",
        "basis": BASIS,
        "reviewed_by": ["cefr-assessor-agent", "speech-coach-factcheck-agent"],
        "slides": {str(k): v for k, v in data.items()},
    }
    with open(os.path.join(OUT, f"sdg13-1.{lv}.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
print("written sdg13-1 A2/B1/B2")
