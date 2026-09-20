"""Low-fidelity wireframe kit — SVG primitives shared by build_wireframes.py.

Greyscale boxes, one accent for the primary action, numbered annotations down the
right margin. Desktop frame is 1280x800 (decision D6: desktop + tablet first).
"""
import html
import math
import unicodedata

# tokens (same family as docs/diagrams so the two sets read as one system)
PAPER = "#f5f5f5"
CANVAS = "#ffffff"
INK = "#2d3142"
MUTED = "#4f5d75"
SOFT = "#7a8399"
LINE = "#c9ccd4"
FILL_SOFT = "#eceef1"
FILL_SOFTER = "#f4f5f7"
ACCENT = "#eb6c36"
ACCENT_SOFT = "#fdeee7"
GOOD = "#2f7d63"
WARN = "#b8891f"
SANS = "'Geist','Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"
MONO = "'Geist Mono',ui-monospace,monospace"
SERIF = "'Instrument Serif','Noto Serif','Noto Serif TC',serif"
FONT_LINK = ("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1"
             "&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600"
             "&family=Noto+Serif:ital@0;1&family=Noto+Sans+TC:wght@400;500;600"
             "&family=Noto+Serif+TC:wght@400&display=swap")


def esc(s):
    return html.escape(str(s), quote=True)


def wide(ch):
    return unicodedata.east_asian_width(ch) in ("W", "F")


def tw(s, size, mono=False):
    adv = 0.62 if mono else 0.6
    return sum(size if wide(c) else size * adv for c in s)


def f(v):
    return str(int(v)) if abs(v - round(v)) < 1e-6 else f"{v:.2f}".rstrip("0").rstrip(".")


class Screen:
    """One wireframe: id, title, the job it does, and the SVG body."""

    def __init__(self, sid, title, job, W=1280, H=800, actor="student"):
        self.sid, self.title, self.job = sid, title, job
        self.W, self.H, self.actor = W, H, actor
        self.body = []
        self.notes = []          # (n, text)
        self.states = []         # extra prose: states / edge cases
        self.mobile = ""         # one line on the phone/tablet change

    # ---------- primitives ----------
    def rect(self, x, y, w, h, fill=CANVAS, stroke=LINE, r=6, dash=None, sw=1):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        self.body.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{r}" fill="{fill}"{st}{d}/>')

    def line(self, x1, y1, x2, y2, stroke=LINE, sw=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.body.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=13, weight=400, fill=INK, anchor="start", family=SANS, ls=None):
        l = f' letter-spacing="{ls}"' if ls else ""
        self.body.append(f'<text x="{f(x)}" y="{f(y)}" fill="{fill}" font-size="{size}" font-weight="{weight}" '
                         f'font-family="{family}" text-anchor="{anchor}"{l}>{esc(s)}</text>')

    def eyebrow(self, x, y, s, fill=SOFT):
        self.text(x, y, s, 9, 500, fill, family=MONO, ls="0.14em")

    def para(self, x, y, lines, size=12, fill=MUTED, lh=17, weight=400):
        for i, ln in enumerate(lines):
            self.text(x, y + i * lh, ln, size, weight, fill)

    def placeholder(self, x, y, w, h, label=""):
        self.rect(x, y, w, h, FILL_SOFTER, LINE, 6, dash="4,3")
        if label:
            self.text(x + w / 2, y + h / 2 + 4, label, 11, 400, SOFT, "middle", MONO)

    def btn(self, x, y, w, h, label, kind="primary"):
        if kind == "primary":
            self.rect(x, y, w, h, ACCENT, ACCENT, 6)
            self.text(x + w / 2, y + h / 2 + 5, label, 14, 600, "#ffffff", "middle")
        elif kind == "ghost":
            self.rect(x, y, w, h, CANVAS, LINE, 6)
            self.text(x + w / 2, y + h / 2 + 5, label, 13, 500, INK, "middle")
        else:  # quiet
            self.rect(x, y, w, h, FILL_SOFT, None, 6)
            self.text(x + w / 2, y + h / 2 + 5, label, 13, 500, MUTED, "middle")

    def chip(self, x, y, label, fill=FILL_SOFT, color=MUTED, h=22):
        w = tw(label, 11) + 20
        self.rect(x, y, w, h, fill, None, h / 2)
        self.text(x + w / 2, y + h / 2 + 4, label, 11, 500, color, "middle")
        return w

    def meter(self, x, y, w, label, value, maxv=10, color=INK):
        self.text(x, y, label, 11, 500, MUTED)
        self.rect(x, y + 6, w, 8, FILL_SOFT, None, 4)
        self.rect(x, y + 6, max(4, w * value / maxv), 8, color, None, 4)
        self.text(x + w + 8, y + 14, f"{value}/{maxv}", 10, 500, SOFT, family=MONO)

    def card(self, x, y, w, h, title, sub="", state="idle", body_lines=None):
        fill, stroke = CANVAS, LINE
        if state == "active":
            fill, stroke = ACCENT_SOFT, ACCENT
        elif state == "done":
            fill, stroke = "#eef5f2", GOOD
        elif state == "locked":
            fill, stroke = FILL_SOFTER, LINE
        self.rect(x, y, w, h, fill, stroke, 8, sw=1.4 if state == "active" else 1)
        self.text(x + 14, y + 26, title, 14, 600, ACCENT if state == "active" else INK)
        if sub:
            self.text(x + 14, y + 44, sub, 11, 400, SOFT, family=MONO)
        if body_lines:
            self.para(x + 14, y + (64 if sub else 48), body_lines, 12, MUTED, 17)

    def note(self, n, x, y):
        """Numbered annotation marker; the text goes in self.notes."""
        self.body.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="10" fill="{ACCENT}"/>')
        self.text(x, y + 4, str(n), 11, 600, "#ffffff", "middle", MONO)

    # ---------- composed chrome ----------
    def browser(self, url):
        self.rect(0, 0, self.W, self.H, PAPER, None, 0)
        self.rect(0, 0, self.W, 36, "#e7e9ec", None, 0)
        for i, c in enumerate(("#d9dde2", "#d9dde2", "#d9dde2")):
            self.body.append(f'<circle cx="{20 + i * 18}" cy="18" r="5" fill="{c}"/>')
        self.rect(78, 8, self.W - 110, 20, CANVAS, None, 10)
        self.text(90, 22, url, 10, 400, SOFT, family=MONO)

    def appbar(self, title, right_items=(), back=None):
        self.rect(0, 36, self.W, 56, CANVAS, None, 0)
        self.line(0, 92, self.W, 92)
        x = 24
        if back:
            self.text(x, 70, "←", 16, 600, MUTED)
            x += 26
        self.text(x, 70, title, 16, 600, INK)
        rx = self.W - 24
        for label, kind in reversed(right_items):
            w = tw(label, 12) + 28
            rx -= w
            if kind == "primary":
                self.btn(rx, 50, w, 30, label, "primary")
            else:
                self.btn(rx, 50, w, 30, label, "ghost")
            rx -= 8

    def resourcebar(self, y, energy=7, evidence=3, meters=(("Emissions", 4), ("Energy security", 6), ("Economy", 5)),
                    talk=5, stage=3):
        """Persistent chrome during a mission."""
        self.rect(0, y, self.W, 60, CANVAS, None, 0)
        self.line(0, y + 60, self.W, y + 60)
        self.text(24, y + 24, "Stage", 10, 500, SOFT, family=MONO)
        for i in range(6):
            done = i < stage - 1
            cur = i == stage - 1
            cx = 24 + i * 26
            self.rect(cx, y + 32, 18, 8, ACCENT if cur else (INK if done else FILL_SOFT), None, 4)
        self.text(190, y + 24, "Energy", 10, 500, SOFT, family=MONO)
        self.text(190, y + 42, f"⚡ {energy}", 15, 600, INK)
        self.text(266, y + 24, "Evidence", 10, 500, SOFT, family=MONO)
        self.text(266, y + 42, f"📄 {evidence}", 15, 600, INK)
        x = 366
        for label, val in meters:
            self.meter(x, y + 18, 110, label, val, 10, INK if label != "Emissions" else ACCENT)
            x += 170
        self.text(self.W - 150, y + 24, "Talk Strength", 10, 500, SOFT, family=MONO, anchor="end")
        self.text(self.W - 150, y + 44, "★" * talk + "☆" * (5 - talk), 14, 600, INK, anchor="end")
        self.btn(self.W - 120, y + 15, 96, 30, "暫停 / 離開", "ghost")

    # ---------- output ----------
    def svg(self):
        notes_svg = ""
        return (f'<svg viewBox="0 0 {self.W} {self.H}" xmlns="http://www.w3.org/2000/svg" role="img" '
                f'aria-labelledby="{self.sid}-t {self.sid}-d">'
                f'<title id="{self.sid}-t">{esc(self.title)}</title>'
                f'<desc id="{self.sid}-d">{esc(self.job)}</desc>'
                f'<rect width="{self.W}" height="{self.H}" fill="{PAPER}"/>'
                + "\n".join(self.body) + notes_svg + "</svg>")
