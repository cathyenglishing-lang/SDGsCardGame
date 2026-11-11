"""The test backend with a FAKE cloud voice, for scripts/playtest/cloud-voice-check.mjs.

No key and no network: "Azure" answers every sentence with a short real sound (a 0.6 s tone), so the
whole path can be tried in a browser — the teacher's panel, the accent choice in the game, the stored
clip, and the way back to the device's voice. Run it instead of the usual uvicorn command:

    CARDLEARN_SQLITE_DIR=$(mktemp -d) python scripts/playtest/server_fake_voice.py

Never use this for anything but tests: it creates the admin admin@example.com / AdminPass123.
"""
import io
import math
import os
import struct
import sys
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("CARDLEARN_SQLITE_DIR", tempfile.mkdtemp(prefix="cardlearn-voice-"))
for key in ("DATABASE_URL", "LEARNING_DATABASE_URL", "REDIS_URL", "RESEND_API_KEY", "AZURE_SPEECH_KEY", "GOOGLE_TTS_API_KEY"):
    os.environ[key] = ""
os.environ.update(ALLOW_SELF_REGISTER="false", INITIAL_ADMIN_EMAIL="admin@example.com", INITIAL_ADMIN_PASSWORD="AdminPass123")

import uvicorn  # noqa: E402
from backend import main, tts  # noqa: E402


def tone(seconds=0.6, hz=440):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * hz * i / 16000))) for i in range(int(16000 * seconds))))
    return buf.getvalue()


CALLS = []


def fake(text, voice, locale):
    CALLS.append((locale, voice, text))
    return tone(hz={"en-US": 440, "en-GB": 520, "en-AU": 600}.get(locale, 660))


tts.PROVIDERS["azure"].update(ready=lambda: True, synth=fake)


@main.app.get("/_test/voice-calls")
def voice_calls():
    return {"calls": [{"locale": a, "voice": b, "text": c} for a, b, c in CALLS]}


@main.app.post("/_test/voice-broken")
def voice_broken(on: bool = True):
    """Make the provider fail (or work again), to see the game fall back to the device's voice."""
    def broken(text, voice, locale):
        raise OSError("fake outage")
    tts.PROVIDERS["azure"]["synth"] = broken if on else fake
    tts._paused.clear()
    return {"broken": on}


if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")), log_level="warning")
