# Browser checks (playtest)

These scripts drive a headless Chrome with real mouse clicks (`cdp.mjs`: Node 22+, no packages to
install; it uses the Chromium that Playwright installed, or Chrome/Edge, or `CHROME_PATH`).
A button that is covered, off screen or disabled cannot be clicked, so layout mistakes show up as failures.

## 1. Start the backend on a throw-away database

Never run these against `sql/app.db` or a real database: they create courses, students, runs and topics.

Git Bash:

```bash
TMPDB=$(mktemp -d)
CARDLEARN_SQLITE_DIR="$TMPDB" AUDIO_DIR="$TMPDB/audio" DATABASE_URL= LEARNING_DATABASE_URL= REDIS_URL= RESEND_API_KEY= \
ALLOW_SELF_REGISTER=false INITIAL_ADMIN_EMAIL=admin@example.com INITIAL_ADMIN_PASSWORD=AdminPass123 PYTHONIOENCODING=utf-8 \
.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --log-level warning
```

## 2. Run

```bash
node scripts/playtest/card-game-tour.mjs .playwright-mcp/tour 1024x768,768x1024,390x844,360x640,1180x820
node scripts/playtest/teacher-walkthrough.mjs .playwright-mcp/teacher-walk
node scripts/playtest/library-walkthrough.mjs .playwright-mcp/library-walk
node scripts/playtest/quick-test-check.mjs .playwright-mcp/quick-test
node scripts/playtest/speech-rules-check.mjs .playwright-mcp/speech-rules
```

Each prints a JSON report that ends with `"problems": []` when everything is fine, and saves a
screenshot of every step in the folder given (`.playwright-mcp/` is git-ignored).

| Script | What it walks through |
|---|---|
| `card-game-tour.mjs` | Student: menu → mission card → every state of the table → wrong and right drops → switching parts → the three wrap-up steps, the optional quiz and reflection → a second run. Also fails if a sentence in hand is cut off or a title card is hidden under the dock. `TOPIC=9-1 LEVEL=B1` picks another topic. |
| `teacher-walkthrough.mjs` | Makes a small class play (roster import, first sign-in, password change, runs with different mistakes, read-aloud upload), then the teacher's 學習紀錄: class → student → run → 語音 → Excel. |
| `library-walkthrough.mjs` | 教材管理: tree, edit, checks, draft, publish, versions, delete and undo, new topic, import, preview in the game. |
| `quick-test-check.mjs` | 快速測試: the teacher's account ticks it on the mission card, only Part 1 is on the table, the wrap-up pays no chips, and the report lists the run without counting it. |
| `speech-rules-check.mjs` | 語音念法: the table opens from the top menu, a sentence shows how it will be said, a duplicate row is refused, a new row is saved, and the card game then says it that way. |
| `cloud-voice-check.mjs` | 雲端語音: the teacher's panel (offer an accent, 試聽, prepare clips) and the game (accent on the level card and on the table, one provider call per sentence, the device's voice when the provider fails). Start `python scripts/playtest/server_fake_voice.py` as the backend for this one: a fake provider that answers with a short tone, so no key is needed. |

Trying the game by hand without matching every card: sign in as a teacher or admin and tick 快速測試 on the mission card, or add `?quick=1` to the game's address. Such a run is stored as a test and never counted.

The speech in these runs is faked (it ends at once) and the microphone is Chrome's fake device.
A real tablet with real sound still has to be tried by hand.

## 3. How-to videos

`node scripts/videos/make-videos.mjs` records the videos in `docs/videos/` (same backend as above,
ideally a fresh database) and writes `操作說明.md` beside them. It needs the ffmpeg that Playwright
installed (or `FFMPEG_PATH`).
