# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Handoff (read first)

**Production runs on the lab VM since 2026-11-09** — see `docs/handoff/2026-11-09-vm-production-dns.md` (DNS, cloud fallback, VM files).

Current state, decisions, deployment map and rules for this project: `docs/handoff/` — read `2026-10-15-conversation-log.md` (what was decided and built, day by day) and `2026-10-15-company-story-nodes.md` (§1–§15, technical detail) first, then `2026-10-14-innovation-harbor-handoff.md` (deploy map, accounts, rules). Pushing to `main` deploys to production (www.cathylanguagehub.com) — work on a branch and confirm with the owner before merging.

Meeting follow-ups T1–T5 (2026-11-09 with Cathy) and everything the company machine did on 2026-11-11 are in ONE file: `docs/handoff/2026-11-09-teacher-meeting-followups.md` — status of T1–T5 (T2, T4, T5 done; T1, T3 open), quick test, 念法表, cloud voices with accents (built, not yet tried against the real services: no key), the new topic menu, how to merge branch `claude/meeting-t4-t5` and go live, what was and was not verified. Read that file first; do not spread this over other files.

Newest work (2026-11-12, branch `claude/sdg4-cinematic-stage`, on top of `claude/meeting-t4-t5`, pushed to `backup`, not merged into `main`): `docs/handoff/2026-11-12-sdg4-cinematic-stage.md` — the SDG 4 stage as a film set (Blender-built theater, lights, cues per slide, quality tiers), its data chain, chips for the words read correctly (3 paid talks a day), the teacher's SDG 4 page (class → student → one talk, anomalies, reports per talk), what was and was not verified.

Earlier (2026-11-09, branch `company/card-game-learning`, pushed to the `backup` remote `machencompeq/SDGsCardGame` — the company machine's account cannot push to `origin` — and not merged into `main`): `docs/handoff/2026-11-09-card-game-closed-loop.md` — card game closed loop, teacher back office (courses and roster with 系級, learning records, voice recordings, material editor, chips), what was verified (SQLite and PostgreSQL), how to go live, disk estimate for the lab VM, what is still open. Research behind the back-office design: `docs/文獻回顧.md`. How-to videos: `docs/videos/`.

Newest plans (2026-11, branch `claude/class-roster-learning-data`): `docs/handoff/2026-11-08-card-game-learning-design.md` (card game design, KPIs, data rules, research plan, global chips) and `docs/handoff/2026-11-04-class-roster-learning-data-plan.md` (courses, roster import, learner IDs, content checks).

## Project

CardLearn SDGs (SDGsprogram_5.0) — SDGs Pecha Kucha card-matching English learning platform. Students select an SDG topic and CEFR difficulty, play a card-matching game, then review a script, record audio, and answer cloze questions. Teachers/admins maintain the question bank and view records.

For full architecture detail (data model, API surface, sequence diagrams, page flow), read `SYSTEM_ARCHITECTURE.md` first — it is comprehensive and current. `README.md` (Traditional Chinese) and `AGENTS.md` cover setup/build commands.

## Commands

Local backend:
```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend build (`frontend/` → `dist/` + `dist/static/`, generates `config.js` from `API_BASE_URL`/`VITE_API_BASE_URL`):
```bash
npm run build
```

Verification (there is no automated test suite — these are the only checks):
```bash
python -m py_compile backend/main.py backend/learning.py backend/classroom.py backend/recordings.py backend/learning_reports.py backend/content_library.py backend/speech_rules.py backend/tts.py backend/sdg4_reports.py backend/reports.py backend/rate_limit.py scripts/test_rate_limits.py
python scripts/test_rate_limits.py   # Redis rate-limit self-test, needs REDIS_URL
python scripts/test_classroom.py     # 290 checks: courses, roster, accounts, card-game data, chips, recordings, reports, material library, the SDG 4 stage (throw-away SQLite, never sql/app.db)
npm run build                         # frontend build check; runs the question-bank check first
npm run content:check                 # question bank only (frontend/js/pk-content.js)
```

The same backend checks on PostgreSQL (production's database): point `TEST_DATABASE_URL` and `TEST_LEARNING_DATABASE_URL` at two **empty throw-away** PostgreSQL databases and run `python scripts/test_classroom.py`. SQL that only breaks on PostgreSQL (a literal `%` inside a query, a failed statement inside a transaction) is not caught by the SQLite run.

Browser checks (headless Chrome through `scripts/playtest/cdp.mjs`, Node 22+, no packages). Start the backend on port 8000 with a throw-away database first (command in `scripts/playtest/README.md`):
```bash
node scripts/playtest/card-game-tour.mjs .playwright-mcp/tour 1024x768,768x1024,390x844   # student: a whole game at three sizes
node scripts/playtest/teacher-walkthrough.mjs .playwright-mcp/teacher-walk                # teacher: courses, roster, records, voice
node scripts/playtest/library-walkthrough.mjs .playwright-mcp/library-walk                # teacher: material editor
node scripts/playtest/quick-test-check.mjs .playwright-mcp/quick-test                      # the 快速測試 switch: Part 1 only, run not counted
node scripts/playtest/speech-rules-check.mjs .playwright-mcp/speech-rules                  # teacher: 語音念法 table, and the game uses it
node scripts/playtest/cloud-voice-check.mjs .playwright-mcp/cloud-voice                    # cloud voices and accents; needs `python scripts/playtest/server_fake_voice.py` as the backend
node scripts/playtest/highlight-check.mjs .playwright-mcp/highlight                        # word-by-word highlighting (same fake-voice backend)
node scripts/playtest/sdg4-stage-check.mjs .playwright-mcp/sdg4                            # SDG 4 stage in 3D at three sizes + the teacher's SDG 4 page (needs network: three.js CDN; slow, software WebGL)
node scripts/videos/make-videos.mjs                                                       # re-records the how-to videos in docs/videos/
```

Setup:
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Architecture

- **Backend**: single-file FastAPI app `backend/main.py` (~2500 lines) — routes, DB init, auth, teacher tools all live here. Rate limiting is factored out into `backend/rate_limit.py` (Redis-backed, only active when `REDIS_URL` + `RATE_LIMIT_ENABLED` are set).
- Backend initializes the DB at **import time**: loads `.env` → configures CORS/JWT/rate-limit/email → picks SQLite (`sql/app.db`, default) or PostgreSQL (when `DATABASE_URL` is set, via `psycopg`) → runs `init_db()` to create/patch tables and seed SDG/difficulty/part rows → mounts static frontend → registers routes → optionally creates an initial admin from `INITIAL_ADMIN_*` env vars.
- `backend/learning.py` (learning events, card-game scoring), `backend/classroom.py` (courses, roster import with 系級, chips), `backend/recordings.py` (students' voice recordings), `backend/learning_reports.py` (the teacher's 學習紀錄: class → student → run, Excel) and `backend/content_library.py` (教材管理: draft / publish / versions) are routers mounted by `main.py`; they get main's helpers through `configure()` and never import it.
- Everything a browser sends as learning data is untrusted (runs can be anonymous): `learning.clean_data()` / `json_safe()` fix the types when stored and when read; anything printed in the teacher pages goes through `esc()`. Never write a literal `%` inside SQL (psycopg reads it as a placeholder) — pass the pattern as a parameter.
- The card game's material lives in the database (`content_topics`, edited in the teacher's 教材管理 and served by `GET /content/library`). `frontend/js/pk-content.js` is only the seed for an empty database and the fallback when the API cannot be reached; changing a script or title there still needs the topic's `version` raised and `npm run content:lock`, or the build stops — and it does not change a database that is already seeded.
- Cloud voices (`backend/tts.py`): with `AZURE_SPEECH_KEY`+`AZURE_SPEECH_REGION` and/or `GOOGLE_TTS_API_KEY` the card game's sentences are synthesised once per accent, stored under `TTS_DIR` and served by `GET /content/tts` (published sentences only). No key, a used-up monthly budget or a failing provider all end in the browser's own voice. The text goes through the 念法表 first (`speech_rules.say()` must stay identical to `CardLearnSay()` in `frontend/js/speech-say.js`). Not yet tried against the real services.
- A corrected question bank reaches an existing database: at start-up `content_library._take_bank_updates` gives a topic the bank's newer version when nobody edited that topic in the editor (it becomes a new version; `content_topics.bank_version` remembers what was taken); a topic the teacher edited is never overwritten — the editor offers the bank version as a draft. Change the bank with `scripts/apply_content_patch.py` (checks word counts, punctuation a voice trips on, titles), then `npm run content:lock`.
- The line under a title card on the table is `keywords` (the teacher's hint) or, when empty, the slide's `title_zh` — so every card shows Chinese (2026-11-11, the teacher's T4). `title_zh` is required; an empty `keywords` is fine.
- The SDG 4 stage (`frontend/games/innovation-harbor/sdg4-stage.html`, `js/sdg4/`): the film-set look is opt-in code in `js/world/post.js` (bloom, depth of field, grade; tiers 3→0 that step down on a slow device) and `js/world/cinematic.js` (lights, beams, props per slide, camera); `scene.js` only gained hooks, so the harbor game renders as before. Each slide's `cue` is in `js/sdg4/talk.js`. The theater set (`assets/sdg4/theater.glb`) and the loading poster are made by `scripts/blender/sdg4_theater.py` (Blender 4.2+, headless); without the GLB the stage falls back to its built-in pieces.
- SDG 4 data: the stage's events (`phase`, `pk.slide.start`, `pk.slide` with dwell / attempts / hit / miss, `page.hide` …) go to `learning_events` like every game's; `backend/sdg4_reports.py` (`/learning/sdg4/*`, `/learning/records/watchlist`) works everything out from them, no extra table. Chips for a talk are paid on `learning.sdg4_score()` (the server's count of words heard), at most `SDG4_PAID_RUNS_PER_DAY` talks a day per account; a talk too quick to be real is held for the teacher. `reports.py` sends one report per talk (`student_reports.run_id`) and withholds talks that were left.
- API groups: `/auth`, `/content`, `/game`, `/teacher`, `/learning`, `/me`, `/health`. Auth is JWT bearer; `require_teacher()` gates teacher/admin routes; admin-only checks apply when changing/deleting admin accounts.
- **Frontend**: static HTML/CSS/JS, no framework/bundler. Pages in `frontend/pages/`, all API calls centralized in `frontend/js/api.js`. Runtime API base URL comes from `window.CARDLEARN_API_BASE_URL` (set by `frontend/config.js` locally, generated into `dist/` on build).
- `dist/` is **generated only** — always edit source under `frontend/`, then rebuild. Never hand-edit `dist/`.
- Data model core chain: `SDG_OPTIONS → TBL_SDG_PARTS → TBL_SDG_SUB_TOPICS → TBL_SDG_CARDS` (cards also keyed by `difficulty_code`), plus `USERS → GAME_SESSIONS → GAME_PART_RECORDS`. Current difficulty vocabulary: `A1`, `A2`, `B1`.
- Teacher Excel/JSON import is **upsert-based** (re-uploading updates matching rows, not duplicates); parser uses `openpyxl` when available, else a stdlib `.xlsx` XML fallback.
- Deployment: Railway runs the FastAPI backend; Vercel serves the built `dist/` static frontend, pointed at the Railway backend via `API_BASE_URL`. See `DEPLOYMENT.md`.

## Working rules

- Do not commit or expose real values from `.env`; use `.env.example` for documented configuration.
- Preserve existing data in `sql/app.db` unless a task explicitly asks for migration or reset work.
- Edit `frontend/` source, not `dist/`; rebuild `dist/` when generated output is needed.
- Keep changes scoped — this is mostly single-file backend logic plus static frontend pages; avoid broad refactors unless that's the task.
- Client-side audio recording in `finish.html` is not yet uploaded/stored server-side (`prepareRecordingPayload()` documents the planned future payload only) — don't assume server storage exists for it.
