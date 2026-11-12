"""Cloud voices for the read-aloud sentences (雲端語音), with accents the teacher chooses.

Why: the games spoke with whatever voice the browser had, so every device sounded different and
abbreviations were guessed. This is an English course: the listening material should be a good neural
voice, the same on every device, in more than one accent.

How it stays cheap and safe
  • A sentence is synthesised ONCE per accent and kept as an mp3 on disk (TTS_DIR); every later play
    is that file. The whole question bank is about 123,000 characters, inside the free monthly
    allowance of either provider.
  • Only text that is in the published material is synthesised for students (no open "say anything"
    endpoint); a teacher may try a short sentence of their own.
  • Two providers, tried in the order the teacher sets: Azure Speech and Google Cloud Text-to-Speech.
    Each has a monthly character budget (default: just under its free allowance). When a budget is
    used up, a key is missing or the provider fails, the next one is tried; when none can answer the
    endpoint says so and the browser falls back to its own voice. Nothing ever blocks the game.
  • The text spoken goes through the platform's 念法表 first (backend/speech_rules.py), so a change
    there makes a new clip; old clips are simply never asked for again.

  GET  /content/tts/options            anyone: is a cloud voice available, which accents, the default
  GET  /content/tts?text=&accent=      anyone: the mp3 of a sentence of the published material
                                       (409 + {"fallback": true, "reason"} when the browser must speak)
Word-by-word highlighting (逐字高亮): when a provider can say WHEN each word starts (Azure through its
Speech SDK, if the `azure-cognitiveservices-speech` package is installed), the start times are kept
beside the mp3 (<hash>.words.json, one time per word of the text as it is SHOWN) and sent with the
clip in the X-Word-Times header. Without them the browser estimates from the clip's length. The times
belong to the clip, so a changed sentence gets new times together with its new clip.
  GET  /teacher/tts                    teacher: keys present, this month's use, budgets, accents, cache
  PUT  /teacher/tts                    teacher: accents offered, default accent, provider order, budgets
  POST /teacher/tts/try                teacher: hear any short sentence in an accent
  POST /teacher/tts/prepare            teacher: synthesise the next few missing clips of the material
Keys come from the environment only (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION, GOOGLE_TTS_API_KEY).
"""
from __future__ import annotations

import base64
import hashlib
import re
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel

router = APIRouter(tags=["cloud voices"])
D = SimpleNamespace()
TW = timezone(timedelta(hours=8))
MAX_TEXT = 700                       # one slide's script; the longest in the bank is under 500
TRY_MAX = 300
PREPARE_BATCH = 8                    # clips per /prepare call: the page repeats the call and shows progress

# Accents a teacher can offer. One voice per accent and provider, chosen for clear classroom English.
# (Azure voice names: https://learn.microsoft.com/azure/ai-services/speech-service/language-support ;
#  Google: https://cloud.google.com/text-to-speech/docs/chirp3-hd — both can be changed with the
#  TTS_VOICES_JSON environment variable without touching the code.)
ACCENTS = [
    {"code": "en-US", "label": "美式 American", "azure": "en-US-JennyNeural", "google": "en-US-Chirp3-HD-Aoede"},
    {"code": "en-GB", "label": "英式 British", "azure": "en-GB-SoniaNeural", "google": "en-GB-Chirp3-HD-Aoede"},
    {"code": "en-AU", "label": "澳洲 Australian", "azure": "en-AU-NatashaNeural", "google": "en-AU-Chirp3-HD-Aoede"},
    {"code": "en-IN", "label": "印度 Indian", "azure": "en-IN-NeerjaNeural", "google": "en-IN-Chirp3-HD-Aoede"},
    {"code": "en-CA", "label": "加拿大 Canadian", "azure": "en-CA-ClaraNeural", "google": None},
    {"code": "en-IE", "label": "愛爾蘭 Irish", "azure": "en-IE-EmilyNeural", "google": None},
    {"code": "en-NZ", "label": "紐西蘭 New Zealand", "azure": "en-NZ-MollyNeural", "google": None},
    {"code": "en-SG", "label": "新加坡 Singaporean", "azure": "en-SG-LunaNeural", "google": None},
    {"code": "en-ZA", "label": "南非 South African", "azure": "en-ZA-LeahNeural", "google": None},
    {"code": "en-PH", "label": "菲律賓 Philippine", "azure": "en-PH-RosaNeural", "google": None},
    {"code": "en-HK", "label": "香港 Hong Kong", "azure": "en-HK-YanNeural", "google": None},
]
try:
    for code, voices in json.loads(os.getenv("TTS_VOICES_JSON", "") or "{}").items():
        for a in ACCENTS:
            if a["code"] == code and isinstance(voices, dict):
                a.update({k: (str(v) if v else None) for k, v in voices.items() if k in ("azure", "google")})
except Exception as error:  # a typo in the variable must not stop the server
    print(f"[TTS] TTS_VOICES_JSON ignored: {error}")
BY_CODE = {a["code"]: a for a in ACCENTS}
PROVIDER_NAMES = {"azure": "Azure Speech", "google": "Google Cloud Text-to-Speech"}
LEVELS = ["A1", "A2", "B1", "B2"]
DEFAULT_SETTINGS = {"accents": ["en-US", "en-GB"], "default": "en-US", "order": ["azure", "google"],
                    "budget": {"azure": 450_000, "google": 900_000},     # free allowance: 500,000 and 1,000,000 a month
                    "highlight": list(LEVELS)}                           # levels at which the sentence is highlighted word by word while it is read
_paused = {}                         # provider -> time until which it is skipped after a failure


def _now():
    return datetime.now(TW)


def _month():
    return _now().strftime("%Y-%m")


def _dir():
    explicit = os.getenv("TTS_DIR", "").strip()
    if explicit:
        base = Path(explicit)
    elif os.getenv("AUDIO_DIR", "").strip():
        base = Path(os.getenv("AUDIO_DIR").strip()) / "tts"      # inside the folder the VM keeps and backs up (deploy/vm: ./data/audio)
    elif os.getenv("CARDLEARN_SQLITE_DIR", "").strip():
        base = Path(os.getenv("CARDLEARN_SQLITE_DIR").strip()) / "tts"
    else:
        base = Path(__file__).resolve().parent.parent / "sql" / "tts"
    base.mkdir(parents=True, exist_ok=True)
    return base


# ── the two providers: text in, mp3 bytes out (an exception means "try the next one") ──
def _http(url, data, headers, timeout=20):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def azure_key():
    return os.getenv("AZURE_SPEECH_KEY", "").strip(), os.getenv("AZURE_SPEECH_REGION", "").strip()


def synth_azure(text, voice, locale):
    """mp3 bytes, or (mp3 bytes, [(seconds, word), …]) when the Speech SDK is installed and reports word starts."""
    try:
        import azure.cognitiveservices.speech as sdk      # optional: pip install azure-cognitiveservices-speech
    except Exception:
        sdk = None
    if sdk is not None:
        try:
            return _synth_azure_sdk(sdk, text, voice, locale)
        except Exception as error:                          # the plain REST call below still gives the audio
            print(f"[TTS] azure SDK failed, using REST without word times: {str(error)[:160]}")
    key, region = azure_key()
    ssml = (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{locale}">'
            f'<voice name="{xml_escape(voice)}">{xml_escape(text)}</voice></speak>')
    return _http(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", ssml.encode("utf-8"),
                 {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                  "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "cardlearn-sdgs"})


def _synth_azure_sdk(sdk, text, voice, locale):
    """NOT yet tried against the real service (no key on the machine it was written on): the event and
    property names are the documented ones (synthesis_word_boundary: audio_offset in 100-ns ticks)."""
    key, region = azure_key()
    cfg = sdk.SpeechConfig(subscription=key, region=region)
    cfg.speech_synthesis_voice_name = voice
    cfg.set_speech_synthesis_output_format(sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3)
    synth = sdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
    marks = []

    def on_word(evt):
        kind = getattr(evt, "boundary_type", None)
        if kind is None or "Word" in str(kind):
            marks.append((evt.audio_offset / 10_000_000, evt.text))
    synth.synthesis_word_boundary.connect(on_word)
    result = synth.speak_text_async(text).get()
    if result.reason != sdk.ResultReason.SynthesizingAudioCompleted:
        raise RuntimeError(f"azure sdk: {result.reason}")
    return result.audio_data, marks


def google_key():
    return os.getenv("GOOGLE_TTS_API_KEY", "").strip()


def synth_google(text, voice, locale):
    body = json.dumps({"input": {"text": text}, "voice": {"languageCode": locale, "name": voice}, "audioConfig": {"audioEncoding": "MP3"}}).encode("utf-8")
    out = _http("https://texttospeech.googleapis.com/v1/text:synthesize", body, {"Content-Type": "application/json", "X-Goog-Api-Key": google_key()})
    return base64.b64decode(json.loads(out)["audioContent"])


PROVIDERS = {"azure": {"ready": lambda: all(azure_key()), "synth": synth_azure},
             "google": {"ready": lambda: bool(google_key()), "synth": synth_google}}


# ── storage ──
def configure(**deps):
    D.__dict__.update(deps)
    conn = D.get_db()
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS tts_settings (id INTEGER PRIMARY KEY, settings_json TEXT NOT NULL, updated_at TEXT, updated_by INTEGER)")
    cur.execute("CREATE TABLE IF NOT EXISTS tts_usage (month TEXT NOT NULL, provider TEXT NOT NULL, chars INTEGER NOT NULL DEFAULT 0, clips INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (month, provider))")
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS tts_clips (
            id {D.auto_pk_sql()},
            clip_hash TEXT NOT NULL UNIQUE,
            accent TEXT NOT NULL,
            provider TEXT NOT NULL,
            voice TEXT NOT NULL,
            chars INTEGER NOT NULL,
            bytes INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )""")
    conn.commit()
    conn.close()


def settings(cur):
    cur.execute("SELECT settings_json FROM tts_settings WHERE id = 1")
    row = cur.fetchone()
    try:
        saved = json.loads(row["settings_json"]) if row else {}
    except Exception:
        saved = {}
    return clean_settings({**DEFAULT_SETTINGS, **(saved if isinstance(saved, dict) else {})})


def clean_settings(s):
    highlight = [l for l in LEVELS if l in (s.get("highlight") if isinstance(s.get("highlight"), list) else LEVELS)]
    accents = [a for a in dict.fromkeys(s.get("accents") or []) if a in BY_CODE]
    default = s.get("default") if s.get("default") in accents else (accents[0] if accents else None)
    order = [p for p in dict.fromkeys(s.get("order") or []) if p in PROVIDERS] + [p for p in PROVIDERS if p not in (s.get("order") or [])]
    budget = {}
    for p in PROVIDERS:
        try:
            budget[p] = max(0, min(int((s.get("budget") or {}).get(p, DEFAULT_SETTINGS["budget"][p])), 50_000_000))
        except (TypeError, ValueError):
            budget[p] = DEFAULT_SETTINGS["budget"][p]
    return {"accents": accents, "default": default, "order": order, "budget": budget, "highlight": highlight}


def usage(cur, month=None):
    cur.execute("SELECT provider, chars, clips FROM tts_usage WHERE month = ?", (month or _month(),))
    return {r["provider"]: {"chars": int(r["chars"]), "clips": int(r["clips"])} for r in cur.fetchall()}


def _count(cur, provider, chars):
    month = _month()
    cur.execute("SELECT chars FROM tts_usage WHERE month = ? AND provider = ?", (month, provider))
    if cur.fetchone():
        cur.execute("UPDATE tts_usage SET chars = chars + ?, clips = clips + 1 WHERE month = ? AND provider = ?", (chars, month, provider))
    else:
        cur.execute("INSERT INTO tts_usage (month, provider, chars, clips) VALUES (?, ?, ?, 1)", (month, provider, chars))


def spoken(text):
    """What is sent to the voice: the 念法表 applied (so 'SDGs' is spelt the way the teacher wants)."""
    return D.say(text) if getattr(D, "say", None) else " ".join(str(text).split())


def clip_hash(accent, spoken_text):
    return hashlib.sha256(f"{accent}\x01{spoken_text}".encode("utf-8")).hexdigest()[:32]


_ACCENT_CODE = re.compile(r"[a-z]{2}-[A-Z]{2}")
_HASH = re.compile(r"[0-9a-f]{32}")


def clip_path(accent, h):
    # Both parts come from code (a known accent, a sha256), but they are checked anyway: a clip's file is always
    # <TTS_DIR>/<xx-YY>/<32 hex>.mp3 and never anything a request could steer.
    if not _ACCENT_CODE.fullmatch(str(accent)) or not _HASH.fullmatch(str(h)):
        raise HTTPException(status_code=400, detail="bad clip")
    base = _dir().resolve()
    folder = (base / accent).resolve()
    if folder.parent != base:
        raise HTTPException(status_code=400, detail="bad clip")
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{h}.mp3"


def word_times(text, marks):
    """One start time (seconds) per word of the text AS SHOWN, from the provider's marks for the text as
    SPOKEN ("SDGs" is shown as one word and spoken as three: it starts when its first spoken word starts).
    None when the two cannot be lined up — the browser then estimates."""
    shown = str(text).split()
    spoken_counts = [len(spoken(w).split()) for w in shown]
    starts = [float(m[0]) for m in marks or [] if str(m[1]).strip() and any(ch.isalnum() for ch in str(m[1]))]
    if not shown or sum(spoken_counts) != len(starts):
        return None
    out, at = [], 0
    for n in spoken_counts:
        out.append(round(starts[min(at, len(starts) - 1)], 3) if n else (out[-1] if out else 0.0))
        at += n
    return out if all(b >= a for a, b in zip(out, out[1:])) else None


def available(st=None):
    """Providers that could answer right now: a key is set and the provider is not paused."""
    now = time.time()
    return [p for p in (st["order"] if st else PROVIDERS) if PROVIDERS[p]["ready"]() and _paused.get(p, 0) < now]


def make_clip(text, accent, st=None):
    """(path, None) for the mp3 of this text in this accent, synthesising it when it is not on disk yet;
    (None, reason) when the browser has to speak instead."""
    if accent not in BY_CODE:
        return None, "unknown_accent"
    say = spoken(text)
    if not say:
        return None, "empty"
    h = clip_hash(accent, say)
    path = clip_path(accent, h)
    if path.exists() and path.stat().st_size > 200:
        return path, None
    conn = D.get_db()
    cur = conn.cursor()
    try:
        st = st or settings(cur)
        used = usage(cur)
        reason = "no_key"
        for p in st["order"]:
            voice = BY_CODE[accent].get(p)
            if not voice or not PROVIDERS[p]["ready"]():
                continue
            if _paused.get(p, 0) > time.time():
                reason = "provider_error"
                continue
            if used.get(p, {}).get("chars", 0) + len(say) > st["budget"][p]:
                reason = "budget_used_up"
                continue
            try:
                audio = PROVIDERS[p]["synth"](say, voice, accent)
                marks = None
                if isinstance(audio, tuple):
                    audio, marks = audio
                if not audio or len(audio) < 200:
                    raise ValueError("empty audio")
            except Exception as error:
                code = getattr(error, "code", None)
                # 401/403: a wrong key will not fix itself soon; 429/5xx/timeouts: try again in a few minutes
                _paused[p] = time.time() + (1800 if code in (401, 403) else 300)
                print(f"[TTS] {p} failed for {accent} ({code or type(error).__name__}): {str(error)[:160]}")
                reason = "provider_error"
                continue
            tmp = path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_bytes(audio)
            os.replace(tmp, path)
            times = word_times(text, marks) if marks else None
            words_file = path.with_suffix(".words.json")
            if times:
                words_file.write_text(json.dumps(times), encoding="utf-8")
            elif words_file.exists():
                words_file.unlink()
            _count(cur, p, len(say))
            try:
                cur.execute("INSERT INTO tts_clips (clip_hash, accent, provider, voice, chars, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (h, accent, p, voice, len(say), len(audio), _now().isoformat(timespec="seconds")))
            except Exception:
                conn.rollback()             # another worker stored the same clip a moment ago
                _count(cur, p, len(say))    # …but the characters were still paid for
            conn.commit()
            return path, None
        return None, reason
    finally:
        conn.close()


# ── which text students may ask for ──
_allowed = {"at": 0.0, "set": set()}


def material_texts():
    """Every sentence the card game reads aloud (the scripts of the published topics), refreshed each minute."""
    if time.time() - _allowed["at"] < 60 and _allowed["set"]:
        return _allowed["set"]
    texts = set(D.material_texts()) if getattr(D, "material_texts", None) else set()
    _allowed.update(at=time.time(), set={" ".join(t.split()) for t in texts if t and t.strip()})
    return _allowed["set"]


def _fallback(reason):
    return Response(json.dumps({"fallback": True, "reason": reason}), status_code=409, media_type="application/json", headers={"Cache-Control": "no-store"})


def _mp3(path):
    headers = {"Cache-Control": "public, max-age=2592000, immutable"}
    words_file = path.with_suffix(".words.json")
    if words_file.exists():
        try:      # start of each shown word, in milliseconds
            headers["X-Word-Times"] = ",".join(str(int(round(float(t) * 1000))) for t in json.loads(words_file.read_text(encoding="utf-8")))
        except Exception:
            pass
    return Response(path.read_bytes(), media_type="audio/mpeg", headers=headers)


@router.get("/content/tts/options")
def options():
    conn = D.get_db()
    cur = conn.cursor()
    st = settings(cur)
    conn.close()
    on = bool(available(st)) and bool(st["accents"])
    return {"available": on, "accents": [{"code": a, "label": BY_CODE[a]["label"]} for a in st["accents"]] if on else [], "default": st["default"] if on else None,
            "highlight": st["highlight"]}      # also used with the device's own voice


@router.get("/content/tts")
def clip(text: str, accent: str):
    text = " ".join(str(text or "").split())
    if not text or len(text) > MAX_TEXT:
        return _fallback("text")
    conn = D.get_db()
    cur = conn.cursor()
    st = settings(cur)
    conn.close()
    if accent not in st["accents"]:
        return _fallback("accent_not_offered")
    if text not in material_texts():
        return _fallback("not_in_material")      # only the published sentences: nobody can spend the allowance on other text
    path, reason = make_clip(text, accent, st)
    return _mp3(path) if path else _fallback(reason)


def _status(cur):
    st = settings(cur)
    used = usage(cur)
    cur.execute("SELECT accent, COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM tts_clips GROUP BY accent")
    clips = {r["accent"]: {"clips": int(r["n"]), "bytes": int(r["b"])} for r in cur.fetchall()}
    now = time.time()
    total = len(material_texts())
    return {"settings": st, "month": _month(), "sentences": total, "sentence_chars": sum(len(spoken(t)) for t in material_texts()),
            "providers": [{"key": p, "name": PROVIDER_NAMES[p], "configured": bool(PROVIDERS[p]["ready"]()), "paused": _paused.get(p, 0) > now,
                           "used": used.get(p, {}).get("chars", 0), "clips": used.get(p, {}).get("clips", 0), "budget": st["budget"][p]} for p in st["order"]],
            "accents": [{"code": a["code"], "label": a["label"], "offered": a["code"] in st["accents"], "providers": [p for p in PROVIDERS if a.get(p)],
                         "ready": _ready_count(a["code"]), "clips": clips.get(a["code"], {}).get("clips", 0), "bytes": clips.get(a["code"], {}).get("bytes", 0)} for a in ACCENTS],
            "available": bool(available(st))}


def _ready_count(accent):
    """How many of the material's sentences already have a clip in this accent (with today's 念法表)."""
    folder = _dir() / accent
    if not folder.exists():
        return 0
    have = {f.stem for f in folder.glob("*.mp3")}
    return sum(1 for t in material_texts() if clip_hash(accent, spoken(t)) in have)


@router.get("/teacher/tts")
def status(authorization: str | None = Header(default=None)):
    D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    out = _status(cur)
    conn.close()
    return out


class SettingsIn(BaseModel):
    accents: list[str] | None = None
    default: str | None = None
    order: list[str] | None = None
    budget: dict | None = None
    highlight: list[str] | None = None


@router.put("/teacher/tts")
def save_settings(data: SettingsIn, authorization: str | None = Header(default=None)):
    user = D.require_teacher(authorization)
    conn = D.get_db()
    cur = conn.cursor()
    now = settings(cur)
    wanted = {k: v for k, v in data.model_dump().items() if v is not None}
    unknown = [a for a in wanted.get("accents", []) if a not in BY_CODE]
    if unknown:
        conn.close()
        raise HTTPException(status_code=400, detail=f"沒有這個口音：{'、'.join(map(str, unknown[:3]))}")
    new = clean_settings({**now, **wanted})
    cur.execute("SELECT id FROM tts_settings WHERE id = 1")
    if cur.fetchone():
        cur.execute("UPDATE tts_settings SET settings_json = ?, updated_at = ?, updated_by = ? WHERE id = 1", (json.dumps(new), _now().isoformat(timespec="seconds"), user["id"]))
    else:
        cur.execute("INSERT INTO tts_settings (id, settings_json, updated_at, updated_by) VALUES (1, ?, ?, ?)", (json.dumps(new), _now().isoformat(timespec="seconds"), user["id"]))
    conn.commit()
    out = _status(cur)
    conn.close()
    return out


class TryIn(BaseModel):
    text: str
    accent: str


@router.post("/teacher/tts/try")
def try_voice(data: TryIn, authorization: str | None = Header(default=None)):
    """Any short sentence, for the teacher's ears (counted against the budget like every clip)."""
    D.require_teacher(authorization)
    text = " ".join(str(data.text or "").split())
    if not text or len(text) > TRY_MAX:
        raise HTTPException(status_code=400, detail=f"請打 1–{TRY_MAX} 個字元的句子。")
    if data.accent not in BY_CODE:
        raise HTTPException(status_code=400, detail="沒有這個口音。")
    path, reason = make_clip(text, data.accent)
    if not path:
        raise HTTPException(status_code=409, detail={"fallback": True, "reason": reason, "message": REASONS.get(reason, reason)})
    return _mp3(path)


REASONS = {"no_key": "還沒有設定雲端語音的金鑰（或這個口音在已設定的廠商沒有聲音）。", "budget_used_up": "這個月的額度用完了。",
           "provider_error": "雲端語音暫時沒有回應，幾分鐘後會自動再試。", "unknown_accent": "沒有這個口音。", "empty": "沒有文字。"}


class PrepareIn(BaseModel):
    accent: str


@router.post("/teacher/tts/prepare")
def prepare(data: PrepareIn, authorization: str | None = Header(default=None)):
    """Synthesise the next few sentences of the material that have no clip in this accent yet.
    The page calls this again until `left` is 0, so a long job never holds one request open."""
    D.require_teacher(authorization)
    if data.accent not in BY_CODE:
        raise HTTPException(status_code=400, detail="沒有這個口音。")
    folder = _dir() / data.accent
    have = {f.stem for f in folder.glob("*.mp3")} if folder.exists() else set()
    missing = sorted(t for t in material_texts() if clip_hash(data.accent, spoken(t)) not in have)
    made, reason = 0, None
    for text in missing[:PREPARE_BATCH]:
        path, reason = make_clip(text, data.accent)
        if not path:
            break
        made += 1
    return {"accent": data.accent, "made": made, "left": len(missing) - made, "total": len(material_texts()),
            "stopped": None if made or not missing else reason, "message": None if made or not missing else REASONS.get(reason, reason)}
