# Innovation Harbor — SDG 9 story prototype

Playable visual prototype for the "SDG world" redesign of CardLearn SDGs. One region (Innovation Harbor, SDG 9,
topic 9-1 "Can We Trust AI?"), six Pecha Kucha stages, branching story, four endings, English-first UI with
on-demand Chinese hints, and a Learning Log preview of what the teacher dashboard will collect.

Standalone: it does not touch the production repo, backend, or database.

## Run

```
cd prototype\innovation-harbor
python serve.py 8766
```
(`python -m http.server` does not work on Windows: it serves `.js` as `text/plain`, which browsers reject for modules.)
Open http://127.0.0.1:8766/ in Chrome or Edge (speech recognition). `?q=low` forces the mobile quality tier, `?q=high` forces full quality,
`?speed=4` runs the simulation faster (development aid). In the browser console, `window.__dbg` exposes the cast, camera `shot()`,
and `act.cards(...)` / `act.listening(...)` / `act.reading(...)` to open an activity directly.

## Assets (all fetched without login)

- `assets/lib/rpm_male.glb`, `rpm_female.glb` — Ready Player Me reference avatars (readyplayerme/animation-library).
- `assets/lib/rpm_preview.glb`, `rpm_template.glb` — Ready Player Me sample avatars (readyplayerme/rpm-unity-sdk-core).
- `assets/anim/*.glb` — Ready Player Me animation library (Mixamo-compatible): idle, walk, jog, talking, expressions, dance.
- `assets/lib/waternormals.jpg` — three.js ocean normal map.
- three.js r160 is loaded from jsDelivr via an import map.

To use your own Mixamo characters later: export as glTF/GLB (or FBX → GLB), drop in `assets/lib/`, and add an entry
in `js/world/characters.js` `MODELS` (the retargeter adds the `mixamorig` prefix automatically).

## Layout

- `js/world/` — scene (sky, sun, water, fog, quality tier), harbor geometry, moving traffic, characters, camera rig.
- `js/ui/` — 3D speech bubbles (CSS2D), tablet/activity sheet, HUD.
- `js/activities/` — listening, reading, card match (original poker mechanic), speaking, sequencing, Pecha Kucha.
- `js/story.js` — stations, dialogue (EN + zh hints), choices, travel, endings.
- `js/vocab.js` — curated SDG 9-1 target vocabulary (cloze, distractors, find-the-word, speaking coverage).
- `js/telemetry.js` — learning events (the future `learning_events` table).
