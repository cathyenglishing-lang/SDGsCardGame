"""
Build the SDGs x English x Card Game report diagrams.

One definition per diagram -> three outputs:
  diagrams.html          all diagrams on one editorial page (diagram-design skin)
  png_src/<slug>.html    one page per diagram, screenshotted to png/<slug>.png
  sdgs-system.drawio     same diagrams as editable draw.io pages

Style follows cathrynlavery/diagram-design (default skin): paper/ink/muted/accent
tokens, 4px grid, orthogonal rounded connectors, one accent per diagram.

Run:  python build_diagrams.py            (writes html + drawio)
      python build_diagrams.py --png      (also renders png via headless Chrome)
"""
import html
import math
import os
import subprocess
import sys
import unicodedata
import uuid

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- tokens
PAPER = "#f5f5f5"
INK = "#2d3142"
MUTED = "#4f5d75"
SOFT = "#7a8399"
ACCENT = "#eb6c36"
LINK = "#2e5aa8"
SANS = "'Geist','Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"
MONO = "'Geist Mono',ui-monospace,monospace"
SERIF = "'Instrument Serif','Noto Serif','Noto Serif TC',serif"
FONT_LINK = ("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1"
             "&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600"
             "&family=Noto+Serif:ital@0;1&family=Noto+Sans+TC:wght@400;500;600"
             "&family=Noto+Serif+TC:wght@400&display=swap")


def _rgb(hexcolor):
    h = hexcolor.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def blend(color, alpha, base=PAPER):
    """Flatten color@alpha over base into a hex value (draw.io has no rgba)."""
    c, b = _rgb(color), _rgb(base)
    return "#" + "".join(f"{round(b[i] * (1 - alpha) + c[i] * alpha):02x}" for i in range(3))


def rgba(color, alpha):
    r, g, b = _rgb(color)
    return f"rgba({r},{g},{b},{alpha})"


# node kind -> (svg fill, svg stroke, dashed, drawio fill, drawio stroke)
KINDS = {
    "backend":  ("#ffffff", INK, False, "#ffffff", INK),
    "station":  (PAPER, INK, False, PAPER, INK),
    "focal":    (rgba(ACCENT, 0.08), ACCENT, False, blend(ACCENT, 0.08), ACCENT),
    "store":    (rgba(INK, 0.05), MUTED, False, blend(INK, 0.05), MUTED),
    "external": (rgba(INK, 0.03), rgba(INK, 0.30), False, blend(INK, 0.03), blend(INK, 0.30)),
    "input":    (rgba(MUTED, 0.10), SOFT, False, blend(MUTED, 0.10), SOFT),
    "optional": (rgba(INK, 0.02), rgba(INK, 0.20), True, blend(INK, 0.02), blend(INK, 0.30)),
    "hub":      (INK, INK, False, INK, INK),
}


def is_wide(ch):
    return unicodedata.east_asian_width(ch) in ("W", "F")


def has_cjk(s):
    return any(is_wide(ch) for ch in s)


def text_w(s, size, mono=False):
    adv = 0.62 if mono else 0.60
    return sum(size if is_wide(ch) else size * adv for ch in s)


def f(v):
    """Compact number formatting for SVG coordinates."""
    if abs(v - round(v)) < 1e-6:
        return str(int(round(v)))
    return f"{v:.3f}".rstrip("0").rstrip(".")


def esc(s):
    return html.escape(s, quote=True)


def round4(v):
    return int(round(v / 4.0) * 4)


# ---------------------------------------------------------------- model
class Diagram:
    def __init__(self, slug, eyebrow, title, desc, takeaway, W, H):
        self.slug, self.eyebrow, self.title = slug, eyebrow, title
        self.desc, self.takeaway = desc, takeaway
        self.W, self.H = W, H
        self.zones, self.nodes, self.edges = [], {}, []
        self.raw_svg_back, self.raw_svg_front = [], []   # extra svg (arcs, callouts)
        self.raw_drawio = []                              # extra drawio cells
        self.legend = []                                  # (kind, label)

    def zone(self, x, y, w, h, label):
        self.zones.append(dict(x=x, y=y, w=w, h=h, label=label))

    def node(self, nid, x, y, w, h, name, sub="", kind="backend", shape="rect", tag="", fields=None):
        self.nodes[nid] = dict(id=nid, x=x, y=y, w=w, h=h, name=name, sub=sub, kind=kind,
                               shape=shape, tag=tag, fields=fields or [])

    def edge(self, src, dst, pts, style="default", label="", label_at=None, card=None):
        self.edges.append(dict(src=src, dst=dst, pts=pts, style=style, label=label,
                               label_at=label_at, card=card))


# ---------------------------------------------------------------- svg render
def rounded_path(pts, r=8):
    d = f"M{f(pts[0][0])} {f(pts[0][1])}"
    for i in range(1, len(pts) - 1):
        (px, py), (cx, cy), (nx, ny) = pts[i - 1], pts[i], pts[i + 1]
        l1 = math.hypot(cx - px, cy - py)
        l2 = math.hypot(nx - cx, ny - cy)
        rr = min(r, l1 / 2, l2 / 2)
        ax, ay = cx - (cx - px) / l1 * rr, cy - (cy - py) / l1 * rr
        bx, by = cx + (nx - cx) / l2 * rr, cy + (ny - cy) / l2 * rr
        d += f" L{f(ax)} {f(ay)} Q{f(cx)} {f(cy)} {f(bx)} {f(by)}"
    d += f" L{f(pts[-1][0])} {f(pts[-1][1])}"
    return d


EDGE_STYLES = {
    # style: (stroke, width, dash, marker)
    "default": (MUTED, 1.2, "", "arrow"),
    "accent":  (ACCENT, 1.2, "", "arrow-accent"),
    "link":    (LINK, 1.2, "", "arrow-link"),
    "dashed":  (MUTED, 1, "4,3", "arrow"),
    "dashed-link": (LINK, 1, "4,3", "arrow-link"),
    "soft":    (SOFT, 1, "5,4", "arrow-soft"),
    "line":    (MUTED, 1, "", None),
    "er":      (MUTED, 1, "", None),
}


def label_svg(text, x, y, anchor="middle"):
    """Masked label whose text baseline block is centred on (x, y)."""
    cjk = has_cjk(text)
    size = 12 if cjk else 8
    w = text_w(text, size, mono=not cjk) + (8 if cjk else 8)
    h = 16 if cjk else 12
    w = math.ceil(w / 4) * 4
    if anchor == "middle":
        rx = x - w / 2
    elif anchor == "start":
        rx = x - 4
    else:
        rx = x - w + 4
    ry = y - h / 2
    if cjk:
        t = (f'<text x="{f(x)}" y="{f(ry + 12.5)}" fill="{SOFT}" font-size="12" font-weight="500" '
             f'font-family="{SANS}" text-anchor="{anchor}">{esc(text)}</text>')
    else:
        t = (f'<text x="{f(x)}" y="{f(ry + 9)}" fill="{SOFT}" font-size="8" letter-spacing="0.06em" '
             f'font-family="{MONO}" text-anchor="{anchor}">{esc(text)}</text>')
    return f'<rect x="{f(rx)}" y="{f(ry)}" width="{f(w)}" height="{h}" rx="2" fill="{PAPER}"/>' + t


def auto_label_pos(pts, text):
    """Centre of the longest segment, offset off the stroke by a 6-10px gap."""
    best, bi = -1, 0
    for i in range(len(pts) - 1):
        L = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        if L > best:
            best, bi = L, i
    (x1, y1), (x2, y2) = pts[bi], pts[bi + 1]
    cjk = has_cjk(text)
    h = 16 if cjk else 12
    if abs(y1 - y2) < 1e-6:                      # horizontal -> above
        return ((x1 + x2) / 2, y1 - 6 - h / 2, "middle")
    return (x1 + 10, (y1 + y2) / 2, "start")    # vertical -> right side


def node_svg(n):
    x, y, w, h = n["x"], n["y"], n["w"], n["h"]
    cx, cy = x + w / 2, y + h / 2
    fill, stroke, dashed, _, _ = KINDS[n["kind"]]
    sw = 1.2 if n["kind"] == "focal" else 1
    dash = ' stroke-dasharray="4,3"' if dashed else ""
    out = []
    if n["shape"] == "diamond":
        pts = f"{f(cx)},{f(y)} {f(x + w)},{f(cy)} {f(cx)},{f(y + h)} {f(x)},{f(cy)}"
        out.append(f'<polygon points="{pts}" fill="{PAPER}"/>')
        out.append(f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash}/>')
    elif n["shape"] == "entity":
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PAPER}"/>')
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
        out.append(f'<line x1="{x}" y1="{y + 28}" x2="{x + w}" y2="{y + 28}" stroke="{stroke}" stroke-opacity="0.35" stroke-width="0.8"/>')
        tagc = ACCENT if n["kind"] == "focal" else MUTED
        out.append(f'<rect x="{x + 8}" y="{y + 8}" width="40" height="12" rx="2" fill="none" stroke="{tagc}" stroke-opacity="0.45" stroke-width="0.8"/>')
        out.append(f'<text x="{x + 28}" y="{y + 17}" fill="{tagc}" font-size="7" letter-spacing="0.08em" font-family="{MONO}" text-anchor="middle">ENTITY</text>')
        namec = ACCENT if n["kind"] == "focal" else INK
        out.append(f'<text x="{x + 56}" y="{y + 18.5}" fill="{namec}" font-size="12" font-weight="600" font-family="{SANS}">{esc(n["name"])}</text>')
        for i, fld in enumerate(n["fields"]):
            fy = y + 28 + 18 + i * 16
            col = INK if fld.startswith("#") else (LINK if fld.startswith("→") else MUTED)
            out.append(f'<text x="{x + 12}" y="{fy}" fill="{col}" font-size="9" font-family="{MONO}">{esc(fld)}</text>')
        return "\n".join(out)
    else:
        rx = h / 2 if n["shape"] == "oval" else (8 if n["kind"] == "hub" else 6)
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{f(rx)}" fill="{PAPER}"/>')
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{f(rx)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash}/>')
    # tag chip
    top_pad = 0
    if n["tag"]:
        tc = ACCENT if n["kind"] == "focal" else SOFT
        tw_ = math.ceil((text_w(n["tag"], 7, mono=True) + 10) / 4) * 4
        out.append(f'<rect x="{x + 8}" y="{y + 6}" width="{tw_}" height="12" rx="2" fill="none" stroke="{tc}" stroke-opacity="0.5" stroke-width="0.8"/>')
        out.append(f'<text x="{x + 8 + tw_ / 2}" y="{y + 15}" fill="{tc}" font-size="7" letter-spacing="0.08em" font-family="{MONO}" text-anchor="middle">{esc(n["tag"])}</text>')
        top_pad = 6
    # name + sub
    hub = n["kind"] == "hub"
    name_fill = PAPER if hub else (ACCENT if n["kind"] == "focal" else INK)
    name_size = 16 if hub else 12
    lines = n["name"].split("\n")
    sub = n["sub"]
    sub_cjk = has_cjk(sub)
    block = len(lines) * (name_size + 4) + (16 if sub else 0)
    base = cy - block / 2 + name_size - 1 + top_pad
    for i, ln in enumerate(lines):
        out.append(f'<text x="{f(cx)}" y="{f(base + i * (name_size + 4))}" fill="{name_fill}" font-size="{name_size}" '
                   f'font-weight="600" font-family="{SANS}" text-anchor="middle">{esc(ln)}</text>')
    if sub:
        sy = base + (len(lines) - 1) * (name_size + 4) + 17
        sub_fill = PAPER if hub else SOFT
        op = ' opacity="0.72"' if hub else ""
        if sub_cjk:
            out.append(f'<text x="{f(cx)}" y="{f(sy)}" fill="{sub_fill}"{op} font-size="12" font-weight="500" '
                       f'font-family="{SANS}" text-anchor="middle">{esc(sub)}</text>')
        else:
            out.append(f'<text x="{f(cx)}" y="{f(sy)}" fill="{sub_fill}"{op} font-size="9" '
                       f'font-family="{MONO}" text-anchor="middle">{esc(sub)}</text>')
    return "\n".join(out)


def legend_svg(d):
    if not d.legend:
        return ""
    y = d.H - 36
    out = [f'<line x1="32" y1="{y - 16}" x2="{d.W - 32}" y2="{y - 16}" stroke="{rgba(INK, 0.10)}" stroke-width="0.8"/>',
           f'<text x="32" y="{y + 4}" fill="{MUTED}" font-size="8" letter-spacing="0.14em" font-family="{MONO}">LEGEND</text>']
    x = 104
    for kind, label in d.legend:
        if kind.startswith("edge:"):
            st = EDGE_STYLES[kind[5:]]
            dash = f' stroke-dasharray="{st[2]}"' if st[2] else ""
            out.append(f'<line x1="{x}" y1="{y}" x2="{x + 24}" y2="{y}" stroke="{st[0]}" stroke-width="{st[1]}"{dash}/>')
            sw_w = 24
        elif kind == "diamond":
            out.append(f'<polygon points="{x + 8},{y - 7} {x + 16},{y} {x + 8},{y + 7} {x},{y}" fill="#ffffff" stroke="{INK}" stroke-width="1"/>')
            sw_w = 16
        elif kind == "oval":
            out.append(f'<rect x="{x}" y="{y - 6}" width="24" height="12" rx="6" fill="#ffffff" stroke="{INK}" stroke-width="1"/>')
            sw_w = 24
        else:
            fill, stroke, dashed, _, _ = KINDS[kind]
            dash = ' stroke-dasharray="4,3"' if dashed else ""
            out.append(f'<rect x="{x}" y="{y - 6}" width="20" height="12" rx="3" fill="{fill}" stroke="{stroke}" stroke-width="1"{dash}/>')
            sw_w = 20
        out.append(f'<text x="{x + sw_w + 8}" y="{y + 4.5}" fill="{MUTED}" font-size="12" font-weight="500" font-family="{SANS}">{esc(label)}</text>')
        x += sw_w + 8 + text_w(label, 12) + 32
    return "\n".join(out)


def render_svg(d):
    s = d.slug
    out = [f'<svg viewBox="0 0 {d.W} {d.H}" xmlns="http://www.w3.org/2000/svg" role="img" '
           f'aria-labelledby="{s}-title {s}-desc">',
           f'<title id="{s}-title">{esc(d.title)}</title>',
           f'<desc id="{s}-desc">{esc(d.desc)}</desc>',
           '<defs>',
           f'<marker id="{s}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{MUTED}"/></marker>',
           f'<marker id="{s}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{ACCENT}"/></marker>',
           f'<marker id="{s}-arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{LINK}"/></marker>',
           f'<marker id="{s}-arrow-soft" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{SOFT}"/></marker>',
           '</defs>',
           f'<rect width="{d.W}" height="{d.H}" fill="{PAPER}"/>']
    # zones
    for z in d.zones:
        out.append(f'<rect x="{z["x"]}" y="{z["y"]}" width="{z["w"]}" height="{z["h"]}" rx="8" '
                   f'fill="{rgba(INK, 0.02)}" stroke="{rgba(INK, 0.10)}" stroke-width="0.8"/>')
        lw = math.ceil((text_w(z["label"], 7, mono=True) * 1.15 + 12) / 4) * 4
        out.append(f'<rect x="{z["x"] + 12}" y="{z["y"] + 4}" width="{lw}" height="12" rx="2" fill="{PAPER}"/>')
        out.append(f'<text x="{z["x"] + 18}" y="{z["y"] + 13}" fill="{rgba(INK, 0.45)}" font-size="7" '
                   f'letter-spacing="0.14em" font-family="{MONO}">{esc(z["label"])}</text>')
    out.extend(d.raw_svg_back)
    # edges before nodes
    labels = []
    for e in d.edges:
        stroke, width, dash, marker = EDGE_STYLES[e["style"]]
        da = f' stroke-dasharray="{dash}"' if dash else ""
        mk = f' marker-end="url(#{s}-{marker})"' if marker else ""
        out.append(f'<path d="{rounded_path(e["pts"])}" fill="none" stroke="{stroke}" stroke-width="{width}"{da}{mk}/>')
        if e["label"]:
            lx, ly, anc = e["label_at"] if e["label_at"] else auto_label_pos(e["pts"], e["label"])
            labels.append(label_svg(e["label"], lx, ly, anc))
        if e["card"]:
            for (tx, ty, txt) in e["card"]:
                labels.append(f'<text x="{tx}" y="{ty}" fill="{MUTED}" font-size="8" font-family="{MONO}" text-anchor="middle">{esc(txt)}</text>')
    out.extend(labels)
    for n in d.nodes.values():
        out.append(node_svg(n))
    out.extend(d.raw_svg_front)
    out.append(legend_svg(d))
    out.append("</svg>")
    return "\n".join(out)


# ---------------------------------------------------------------- drawio render
class Ids:
    def __init__(self):
        self.n = 1

    def next(self):
        self.n += 1
        return f"c{self.n}"


DRAWIO_FONT = "fontFamily=Noto Sans TC;fontSource=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DNoto%2BSans%2BTC;"


def drawio_node_value(n):
    if n["shape"] == "entity":
        rows = "".join(
            f'<div style="font-family:Geist Mono,monospace;font-size:9px;color:'
            f'{INK if fl.startswith("#") else (LINK if fl.startswith("→") else MUTED)}">{esc(fl)}</div>'
            for fl in n["fields"])
        return (f'<div style="font-weight:600;font-size:12px;border-bottom:1px solid #c8cad0;padding-bottom:4px;'
                f'margin-bottom:4px">{esc(n["name"])}</div>{rows}')
    hub = n["kind"] == "hub"
    col = PAPER if hub else (ACCENT if n["kind"] == "focal" else INK)
    size = 16 if hub else 12
    v = f'<div style="font-weight:600;font-size:{size}px;color:{col}">{esc(n["name"]).replace(chr(10), "<br>")}</div>'
    if n["sub"]:
        fam = "Noto Sans TC" if has_cjk(n["sub"]) else "Geist Mono,monospace"
        sz = 11 if has_cjk(n["sub"]) else 9
        sc = PAPER if hub else SOFT
        v += f'<div style="font-family:{fam};font-size:{sz}px;color:{sc}">{esc(n["sub"])}</div>'
    if n["tag"]:
        v = f'<div style="font-family:Geist Mono,monospace;font-size:7px;letter-spacing:1px;color:{SOFT}">{esc(n["tag"])}</div>' + v
    return v


def drawio_node_style(n):
    _, _, dashed, fill, stroke = KINDS[n["kind"]]
    sw = 1.2 if n["kind"] == "focal" else 1
    base = f"whiteSpace=wrap;html=1;{DRAWIO_FONT}fontColor={INK};fillColor={fill};strokeColor={stroke};strokeWidth={sw};"
    if dashed:
        base += "dashed=1;dashPattern=4 3;"
    if n["shape"] == "diamond":
        return "rhombus;" + base
    if n["shape"] == "oval":
        return "rounded=1;arcSize=50;" + base
    if n["shape"] == "entity":
        return "rounded=1;arcSize=6;absoluteArcSize=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=4;" + base
    arc = 8 if n["kind"] == "hub" else 6
    return f"rounded=1;arcSize={arc};absoluteArcSize=1;" + base


def drawio_edge_style(e):
    stroke, width, dash, marker = EDGE_STYLES[e["style"]]
    st = (f"edgeStyle=none;rounded=1;html=1;strokeColor={stroke};strokeWidth={width};"
          f"fontFamily=Geist Mono;fontSize=9;fontColor={SOFT};labelBackgroundColor={PAPER};")
    if dash:
        st += f"dashed=1;dashPattern={dash.replace(',', ' ')};"
    if e["style"] == "er":
        st += "endArrow=ERmany;startArrow=ERone;endFill=0;startFill=0;"
    elif marker is None:
        st += "endArrow=none;"
    else:
        st += "endArrow=block;endFill=1;endSize=5;"
    return st


def rel(n, p):
    return ((p[0] - n["x"]) / n["w"], (p[1] - n["y"]) / n["h"])


def render_drawio_page(d):
    ids = Ids()
    cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
    title_id = ids.next()
    cells.append(f'<mxCell id="{title_id}" value="{esc(d.title)}" style="text;html=1;align=left;verticalAlign=top;'
                 f'fontFamily=Noto Serif TC;fontSize=20;fontColor={INK};" vertex="1" parent="1">'
                 f'<mxGeometry x="0" y="-48" width="{d.W}" height="32" as="geometry"/></mxCell>')
    for z in d.zones:
        cells.append(f'<mxCell id="{ids.next()}" value="{esc(z["label"])}" style="rounded=1;arcSize=8;absoluteArcSize=1;'
                     f'fillColor={blend(INK, 0.02)};strokeColor={blend(INK, 0.12)};strokeWidth=0.8;verticalAlign=top;align=left;'
                     f'spacingLeft=10;spacingTop=0;fontFamily=Geist Mono;fontSize=8;fontColor={blend(INK, 0.45)};html=1;" '
                     f'vertex="1" parent="1"><mxGeometry x="{z["x"]}" y="{z["y"]}" width="{z["w"]}" height="{z["h"]}" as="geometry"/></mxCell>')
    node_ids = {}
    for n in d.nodes.values():
        cid = ids.next()
        node_ids[n["id"]] = cid
        cells.append(f'<mxCell id="{cid}" value="{esc(drawio_node_value(n))}" style="{esc(drawio_node_style(n))}" '
                     f'vertex="1" parent="1"><mxGeometry x="{f(n["x"])}" y="{f(n["y"])}" width="{f(n["w"])}" '
                     f'height="{f(n["h"])}" as="geometry"/></mxCell>')
    for e in d.edges:
        s, t = d.nodes.get(e["src"]), d.nodes.get(e["dst"])
        st = drawio_edge_style(e)
        if s is not None:
            ex, ey = rel(s, e["pts"][0])
            st += f"exitX={ex:.4f};exitY={ey:.4f};exitDx=0;exitDy=0;exitPerimeter=0;"
        if t is not None:
            nx, ny = rel(t, e["pts"][-1])
            st += f"entryX={nx:.4f};entryY={ny:.4f};entryDx=0;entryDy=0;entryPerimeter=0;"
        if e.get("curved"):
            st += "curved=1;"
        attrs = ""
        if s is not None:
            attrs += f' source="{node_ids[e["src"]]}"'
        if t is not None:
            attrs += f' target="{node_ids[e["dst"]]}"'
        geo = '<mxGeometry relative="1" as="geometry">'
        if s is None:
            geo += f'<mxPoint x="{f(e["pts"][0][0])}" y="{f(e["pts"][0][1])}" as="sourcePoint"/>'
        if t is None:
            geo += f'<mxPoint x="{f(e["pts"][-1][0])}" y="{f(e["pts"][-1][1])}" as="targetPoint"/>'
        inner = e.get("drawio_points", e["pts"][1:-1])
        if inner:
            geo += '<Array as="points">' + "".join(f'<mxPoint x="{f(px)}" y="{f(py)}"/>' for px, py in inner) + "</Array>"
        geo += "</mxGeometry>"
        cells.append(f'<mxCell id="{ids.next()}" value="{esc(e["label"])}" style="{esc(st)}" edge="1" parent="1"{attrs}>{geo}</mxCell>')
    for raw in d.raw_drawio:
        cells.append(raw.replace("{ID}", ids.next()))
    body = "".join(cells)
    return (f'<diagram id="{uuid.uuid5(uuid.NAMESPACE_URL, d.slug)}" name="{esc(d.eyebrow)}">'
            f'<mxGraphModel dx="0" dy="0" grid="1" gridSize="4" guides="1" tooltips="1" connect="1" arrows="1" '
            f'fold="1" page="1" pageScale="1" pageWidth="{d.W}" pageHeight="{d.H}" background="{PAPER}" math="0" shadow="0">'
            f'<root>{body}</root></mxGraphModel></diagram>')


def drawio_text(x, y, w, h, value, style_extra=""):
    return (f'<mxCell id="{{ID}}" value="{esc(value)}" style="text;html=1;whiteSpace=wrap;{DRAWIO_FONT}'
            f'fontColor={INK};{style_extra}" vertex="1" parent="1"><mxGeometry x="{f(x)}" y="{f(y)}" '
            f'width="{f(w)}" height="{f(h)}" as="geometry"/></mxCell>')


def drawio_rect(x, y, w, h, value, fill, stroke, extra=""):
    return (f'<mxCell id="{{ID}}" value="{esc(value)}" style="rounded=1;arcSize=4;absoluteArcSize=1;html=1;'
            f'whiteSpace=wrap;{DRAWIO_FONT}fontColor={INK};fillColor={fill};strokeColor={stroke};{extra}" vertex="1" '
            f'parent="1"><mxGeometry x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" as="geometry"/></mxCell>')


# ================================================================ diagrams
def d_loop():
    d = Diagram("mission-loop", "01 · Loop", "Mission 學習遊戲迴圈",
                "八個步驟順時針構成一個 Mission，每一步都把作答與決策寫回中央的學習者紀錄，英文決策是唯一的關鍵閘門。",
                "一個 Mission 由八步組成；卡牌配對只是其中一步，真正的關卡是「讀懂英文再做決策」。每一步都寫回學習者紀錄，報告與複習才有依據。",
                960, 800)
    cx, cy, R = 440, 380, 264
    sw_, sh_ = 168, 64
    hw, hh = 208, 104
    stations = [
        ("Mission 簡報", "role · goal", "station"),
        ("前測 3 題", "baseline", "station"),
        ("單字暖身", "+ energy", "station"),
        ("卡牌建構", "match · data cards", "station"),
        ("英文決策", "read → choose", "focal"),
        ("事件與後果", "SDG meters move", "station"),
        ("Showtime", "20 s × slides", "station"),
        ("報告與複習", "weakness → review", "station"),
    ]
    N = len(stations)
    rects = []
    for k, (name, sub, kind) in enumerate(stations):
        th = math.radians(-90 + k * 360 / N)
        px, py = cx + R * math.cos(th), cy + R * math.sin(th)
        x, y = round4(px - sw_ / 2), round4(py - sh_ / 2)
        d.node(f"s{k}", x, y, sw_, sh_, name, sub, kind)
        rects.append((x, y, th))
    d.node("hub", cx - hw // 2, cy - hh // 2, hw, hh, "學習者紀錄", "mastery · vocab · choices", "hub")

    def inter(x, y):
        pts = []
        for xe in (x, x + sw_):
            dx = xe - cx
            if abs(dx) <= R:
                dy = math.sqrt(R * R - dx * dx)
                for yy in (cy + dy, cy - dy):
                    if y - 1e-6 <= yy <= y + sh_ + 1e-6:
                        pts.append((xe, yy))
        for ye in (y, y + sh_):
            dy = ye - cy
            if abs(dy) <= R:
                dx = math.sqrt(R * R - dy * dy)
                for xx in (cx + dx, cx - dx):
                    if x - 1e-6 <= xx <= x + sw_ + 1e-6:
                        pts.append((xx, ye))
        return pts

    def norm(a):
        while a <= -math.pi:
            a += 2 * math.pi
        while a > math.pi:
            a -= 2 * math.pi
        return a

    exits, entries = [], []
    for (x, y, th) in rects:
        pts = inter(x, y)
        best_exit, best_entry = None, None
        for p in pts:
            diff = norm(math.atan2(p[1] - cy, p[0] - cx) - th)
            if diff > 0 and (best_exit is None or diff < best_exit[0]):
                best_exit = (diff, p)
            if diff < 0 and (best_entry is None or diff > best_entry[0]):
                best_entry = (diff, p)
        exits.append(best_exit[1])
        entries.append(best_entry[1])
    for k in range(N):
        j = (k + 1) % N
        q0 = exits[k]
        phi_e = math.atan2(entries[j][1] - cy, entries[j][0] - cx)
        phi_end = phi_e - 1.2 / R
        q1 = (cx + R * math.cos(phi_end), cy + R * math.sin(phi_end))
        d.raw_svg_back.append(
            f'<path d="M{f(q0[0])} {f(q0[1])} A{R} {R} 0 0 1 {f(q1[0])} {f(q1[1])}" fill="none" '
            f'stroke="{MUTED}" stroke-width="1.2" marker-end="url(#{d.slug}-arrow)"/>')
        # drawio: curved edge through arc midpoint
        a0 = math.atan2(q0[1] - cy, q0[0] - cx)
        a1 = phi_e
        if a1 < a0:
            a1 += 2 * math.pi
        am = (a0 + a1) / 2
        mid = (cx + R * math.cos(am), cy + R * math.sin(am))
        e = dict(src=f"s{k}", dst=f"s{j}", pts=[q0, mid, entries[j]], style="default", label="",
                 label_at=None, card=None, curved=True)
        d.raw_drawio.append(("edge", e))
    # spokes
    spoke_labels = {1: "SCORES", 4: "CHOICES"}
    for k, (x, y, th) in enumerate(rects):
        u = (math.cos(th), math.sin(th))

        def box_d(v, a, b):
            c = []
            if abs(v[0]) > 1e-9:
                c.append(a / abs(v[0]))
            if abs(v[1]) > 1e-9:
                c.append(b / abs(v[1]))
            return min(c)
        pcx, pcy = x + sw_ / 2, y + sh_ / 2
        ds = box_d(u, sw_ / 2, sh_ / 2)
        dh = box_d(u, hw / 2, hh / 2)
        start = (pcx - ds * u[0], pcy - ds * u[1])
        end = (cx + (dh + 6) * u[0], cy + (dh + 6) * u[1])
        d.raw_svg_back.append(
            f'<path d="M{f(start[0])} {f(start[1])} L{f(end[0])} {f(end[1])}" fill="none" stroke="{SOFT}" '
            f'stroke-width="1" stroke-dasharray="5,4" marker-end="url(#{d.slug}-arrow-soft)"/>')
        if k in spoke_labels:
            mx, my = (start[0] + end[0]) / 2, (start[1] + end[1]) / 2
            # offset perpendicular to the spoke, clear of the stroke
            px_, py_ = -u[1], u[0]
            lx, ly = mx + px_ * 30, my + py_ * 30
            d.raw_svg_back.append(label_svg(spoke_labels[k], lx, ly, "middle"))
        e = dict(src=f"s{k}", dst="hub", pts=[start, end], style="soft", label=spoke_labels.get(k, ""),
                 label_at=None, card=None)
        d.raw_drawio.append(("edge", e))
    # editorial callout: stages repeat
    tx, ty = 928, 468
    d.raw_svg_front.append(
        f'<text x="{tx}" y="{ty}" fill="{ACCENT}" font-size="15" font-style="italic" font-family="{SERIF}" '
        f'text-anchor="end">Stage 1–6 各跑一次</text>')
    d.raw_svg_front.append(
        f'<text x="{tx}" y="{ty + 18}" fill="{MUTED}" font-size="12" font-family="{SANS}" text-anchor="end">單字 → 卡牌 → 決策 → 後果</text>')
    s3 = d.nodes["s3"]
    lead_end = (s3["x"] + s3["w"] - 16, s3["y"] - 4)
    d.raw_svg_front.append(
        f'<path d="M{tx - 60} {ty + 28} Q{tx - 60} {f(lead_end[1])} {f(lead_end[0] + 8)} {f(lead_end[1])}" '
        f'fill="none" stroke="{rgba(ACCENT, 0.5)}" stroke-width="1" stroke-dasharray="4,3"/>')
    d.raw_svg_front.append(f'<circle cx="{f(lead_end[0] + 6)}" cy="{f(lead_end[1])}" r="2" fill="{ACCENT}"/>')
    d.raw_drawio.append(("cell", drawio_text(tx - 240, ty - 16, 240, 40,
                         '<i style="color:#eb6c36;font-size:15px">Stage 1–6 各跑一次</i><br>'
                         '<span style="font-size:12px;color:#4f5d75">單字 → 卡牌 → 決策 → 後果</span>', "align=right;")))
    d.legend = [("station", "迴圈步驟"), ("focal", "關鍵閘門"), ("hub", "累積狀態"), ("edge:soft", "寫回紀錄")]
    return d


def d_personal():
    d = Diagram("personalized-loop", "02 · Flowchart", "測驗後的個人化學習迴圈",
                "測驗結束後依六項技能分數分流：全部掌握則升級挑戰，兩項以上偏弱則建議降級，其餘進入弱項複習、單字複習與迷你挑戰，通過後回到遊戲任務。",
                "測驗不再以分數結束：系統先判斷分流，再把學生送進一條 8–12 分鐘的複習路徑，通過迷你挑戰才回到遊戲，並額外拿到 Evidence。",
                840, 880)
    X = 360
    d.node("start", 280, 32, 160, 40, "測驗結束", "", "backend", "oval")
    d.node("d1", 256, 104, 208, 96, "所有技能\n≥ 80%？", "", "backend", "diamond")
    d.node("d2", 256, 248, 208, 96, "≥ 2 項\n< 60%？", "", "backend", "diamond")
    d.node("rev", 268, 392, 184, 56, "最弱技能複習", "3 min · 3 items", "backend")
    d.node("voc", 268, 488, 184, 56, "錯題單字複習", "Leitner box 1", "backend")
    d.node("d3", 256, 584, 208, 96, "迷你挑戰\n5 題對 4？", "", "backend", "diamond")
    d.node("mis", 268, 728, 184, 56, "遊戲任務", "+1 evidence", "focal")
    d.node("up", 548, 124, 184, 56, "Level Up 挑戰", "next level", "backend")
    d.node("down", 548, 268, 184, 56, "建議降一級", "student may decline", "input")
    d.edge("start", "d1", [(X, 72), (X, 104)])
    d.edge("d1", "up", [(464, 152), (548, 152)], label="是")
    d.edge("d1", "d2", [(X, 200), (X, 248)], label="否")
    d.edge("d2", "down", [(464, 296), (548, 296)], label="是")
    d.edge("d2", "rev", [(X, 344), (X, 392)], label="否")
    d.edge("down", "rev", [(640, 324), (640, 420), (452, 420)])
    d.edge("up", "mis", [(732, 152), (776, 152), (776, 756), (452, 756)])
    d.edge("rev", "voc", [(X, 448), (X, 488)])
    d.edge("voc", "d3", [(X, 544), (X, 584)])
    d.edge("d3", "mis", [(X, 680), (X, 728)], style="accent", label="是")
    d.edge("d3", "rev", [(256, 632), (208, 632), (208, 420), (268, 420)], style="dashed",
           label="否，再複習", label_at=(164, 526, "middle"))
    d.legend = [("oval", "開始"), ("backend", "步驟"), ("diamond", "判斷"), ("focal", "回到遊戲"), ("edge:dashed", "回圈")]
    return d


def d_arch():
    d = Diagram("system-architecture", "03 · Architecture", "MVP 系統架構",
                "學生與教師透過 Vercel 上的靜態前端與遊戲引擎，呼叫 Railway 上的 FastAPI 模組化單體；資料存 PostgreSQL 與 Redis，AI Gateway 於 Phase 2 接上外部 AI。",
                "沿用現有 Vercel + Railway，不換平台。遊戲規則在瀏覽器跑、分數在伺服器算；音檔預先產生成靜態檔；AI 只經過一個 Gateway，Phase 2 才開。",
                1080, 720)
    d.zone(224, 200, 256, 296, "CLIENT · VERCEL")
    d.zone(536, 200, 528, 296, "SERVER · RAILWAY")
    d.zone(536, 528, 256, 108, "EXTERNAL")
    d.node("user", 32, 252, 152, 56, "學生 / 教師", "phone · tablet · laptop", "input")
    d.node("ui", 248, 248, 208, 64, "Web UI + Game Engine", "static JS · offline queue", "backend", tag="UI")
    d.node("audio", 248, 404, 208, 64, "講稿音檔", "pre-generated mp3", "store", tag="ASSET")
    d.node("api", 560, 248, 216, 64, "FastAPI 模組化單體", "content · assess · game · events", "focal", tag="API")
    d.node("aigw", 560, 404, 216, 64, "AI Gateway", "phase 2 · cache · quota", "optional", tag="AI")
    d.node("ext", 560, 560, 216, 56, "外部 AI 服務", "LLM API", "external")
    d.node("pg", 864, 248, 176, 64, "PostgreSQL", "state + event log", "store", tag="DB")
    d.node("redis", 864, 404, 176, 64, "Redis", "rate limit · cache", "store", tag="CACHE")
    d.node("prep", 864, 100, 176, 56, "備課流程", "excel → ai draft → review", "input")
    d.edge("user", "ui", [(184, 280), (248, 280)], label="HTTPS")
    d.edge("ui", "api", [(456, 280), (560, 280)], style="link", label="REST · JSON")
    d.edge("ui", "audio", [(352, 312), (352, 404)], label="FETCH")
    d.edge("api", "pg", [(776, 268), (864, 268)], label="SQL")
    d.edge("api", "redis", [(776, 296), (820, 296), (820, 436), (864, 436)])
    d.edge("api", "aigw", [(668, 312), (668, 404)], style="dashed", label="PHASE 2")
    d.edge("aigw", "ext", [(668, 468), (668, 560)], style="dashed-link", label="HTTPS")
    d.edge("prep", "pg", [(952, 156), (952, 248)], label="IMPORT")
    d.legend = [("focal", "核心 API"), ("backend", "服務"), ("store", "資料"), ("input", "人 / 流程"),
                ("optional", "Phase 2"), ("external", "外部"), ("edge:link", "API 呼叫")]
    return d


def d_dataflow():
    d = Diagram("event-pipeline", "04 · Data Flow", "學習事件與分析資料流",
                "瀏覽器把學習事件批次送到 POST /events，寫入只新增的事件日誌與狀態表；事件彙總後供教師儀表板與去識別化研究匯出，狀態表驅動推薦引擎產生複習路徑回到學生端。",
                "所有分析都從同一份事件日誌長出來：教師看彙總、研究拿去識別化匯出、推薦引擎讀狀態表，再把複習路徑送回學生。",
                1160, 540)
    d.node("q", 32, 152, 176, 56, "瀏覽器事件佇列", "batch ≤ 50 · retry", "input")
    d.node("in", 256, 152, 176, 56, "POST /events", "dedupe by event_id", "focal")
    d.node("ev", 496, 152, 176, 56, "learning_events", "append-only log", "store")
    d.node("agg", 736, 152, 176, 56, "彙總視圖", "nightly / live", "backend")
    d.node("t", 968, 100, 160, 56, "教師儀表板", "class · student", "backend")
    d.node("r", 968, 204, 160, 56, "研究匯出", "de-identified", "external")
    d.node("st", 496, 312, 176, 56, "狀態表", "attempts · mastery · vocab", "store")
    d.node("rec", 736, 312, 176, 56, "推薦引擎", "rules → review path", "backend")
    d.edge("q", "in", [(208, 180), (256, 180)])
    d.edge("in", "ev", [(432, 180), (496, 180)], label="APPEND")
    d.edge("in", "st", [(344, 208), (344, 340), (496, 340)], label="UPSERT", label_at=(420, 322, "middle"))
    d.edge("ev", "agg", [(672, 180), (736, 180)])
    d.edge("agg", "t", [(912, 168), (940, 168), (940, 128), (968, 128)])
    d.edge("agg", "r", [(912, 192), (940, 192), (940, 232), (968, 232)])
    d.edge("st", "rec", [(672, 340), (736, 340)], label="SKILLS")
    d.edge("rec", "q", [(824, 368), (824, 428), (120, 428), (120, 208)], style="dashed",
           label="複習路徑", label_at=(472, 410, "middle"))
    d.legend = [("focal", "收事件"), ("store", "資料"), ("backend", "計算 / 呈現"), ("external", "研究"), ("edge:dashed", "回饋到學生")]
    return d


def d_tree():
    d = Diagram("content-hierarchy", "05 · Tree", "新版教材內容層級",
                "一個 Mission 對應一份 SDG 講稿，下分六個 Stage 與最終挑戰；每個 Stage 由 slide 卡組成，每張卡掛上各級講稿音檔、目標字句型與題目數據卡。",
                "不重寫講稿，只在外層補結構：Mission = 一份講稿、Stage = 一個 Part、Card = 一張 slide；各級講稿、單字、題目都掛在同一張卡上。",
                880, 560)
    d.node("m", 352, 40, 176, 56, "Mission × 9", "one SDG script", "focal")
    d.node("st", 176, 160, 176, 56, "Stage × 6", "pecha kucha part 1–6", "backend")
    d.node("fc", 528, 160, 176, 56, "Final Challenge", "showtime", "backend")
    d.node("c", 176, 280, 176, 56, "Card = slide", "20 or 12 per mission", "backend")
    d.node("a1", 32, 400, 176, 56, "講稿 · 音檔", "A2 · B1 · B2", "store")
    d.node("a2", 240, 400, 176, 56, "目標字 · 句型", "6 / 8 / 10 per part", "store")
    d.node("a3", 448, 400, 176, 56, "題目 · 數據卡", "tagged by skill", "store")
    d.edge("m", "st", [(440, 96), (440, 128), (264, 128), (264, 160)], style="line")
    d.edge("m", "fc", [(440, 96), (440, 128), (616, 128), (616, 160)], style="line")
    d.edge("st", "c", [(264, 216), (264, 280)], style="line")
    d.edge("c", "a1", [(264, 336), (264, 368), (120, 368), (120, 400)], style="line")
    d.edge("c", "a2", [(264, 336), (264, 368), (328, 368), (328, 400)], style="line")
    d.edge("c", "a3", [(264, 336), (264, 368), (536, 368), (536, 400)], style="line")
    d.raw_svg_front.append(
        f'<text x="848" y="296" fill="{MUTED}" font-size="15" font-style="italic" font-family="{SERIF}" '
        f'text-anchor="end">級別是卡上的欄位，</text>')
    d.raw_svg_front.append(
        f'<text x="848" y="316" fill="{MUTED}" font-size="15" font-style="italic" font-family="{SERIF}" '
        f'text-anchor="end">不是另一套教材</text>')
    d.raw_drawio.append(("cell", drawio_text(640, 280, 208, 44,
                         '<i style="color:#4f5d75;font-size:15px">級別是卡上的欄位，不是另一套教材</i>', "align=right;")))
    d.legend = [("focal", "Mission（一份講稿）"), ("backend", "結構"), ("store", "學習素材")]
    return d


def d_er():
    d = Diagram("data-model", "06 · ER", "核心資料模型",
                "左側是內容模型（Mission、Stage、Card、Item），右側是以匿名 Player 為中心的學習與遊戲紀錄（Attempt、Game Session、Learning Event）。",
                "左邊是教材、右邊是學生；兩邊只在「題目 → 作答」與「Mission → 遊戲場次」相接。所有學習資料都掛在匿名 anon_id 上，不掛姓名。",
                960, 700)
    d.node("mi", 40, 40, 224, 104, "missions", "", "backend", "entity",
           fields=["# mission_id", "sdg · sdg_target", "role · scenario", "version · status"])
    d.node("sg", 40, 184, 224, 104, "stages", "", "backend", "entity",
           fields=["# stage_id", "→ mission_id", "part_no · function", "can_do · pattern"])
    d.node("ca", 40, 328, 224, 88, "cards", "", "backend", "entity",
           fields=["# card_id", "→ stage_id", "card_type · payload"])
    d.node("it", 40, 456, 224, 120, "items", "", "backend", "entity",
           fields=["# item_id", "→ card_id", "skill · subskill", "level · type", "is_anchor · status"])
    d.node("gs", 360, 40, 224, 120, "game_sessions", "", "backend", "entity",
           fields=["# game_id", "→ anon_id", "→ mission_id", "level · ending_id", "meters · score"])
    d.node("at", 360, 456, 224, 120, "attempts", "", "backend", "entity",
           fields=["# attempt_id", "→ anon_id", "→ item_id", "is_correct · attempt_no", "duration_ms · error_tag"])
    d.node("pl", 680, 248, 224, 104, "player_profiles", "", "focal", "entity",
           fields=["# anon_id", "→ user_id (login only)", "nickname · level", "consent flags"])
    d.node("ev", 680, 456, 224, 120, "learning_events", "", "backend", "entity",
           fields=["# event_id", "→ anon_id", "type · object_id", "result_json", "content_version"])

    def rel_(a, b, pts, c1, c2):
        d.edge(a, b, pts, style="er", card=[c1, c2])
    rel_("mi", "sg", [(152, 144), (152, 184)], (162, 158, "1"), (162, 178, "N"))
    rel_("sg", "ca", [(152, 288), (152, 328)], (162, 302, "1"), (162, 322, "N"))
    rel_("ca", "it", [(152, 416), (152, 456)], (162, 430, "1"), (162, 450, "N"))
    rel_("mi", "gs", [(264, 92), (360, 92)], (276, 86, "1"), (348, 86, "N"))
    rel_("it", "at", [(264, 516), (360, 516)], (276, 510, "1"), (348, 510, "N"))
    rel_("pl", "gs", [(680, 276), (632, 276), (632, 100), (584, 100)], (670, 270, "1"), (596, 94, "N"))
    rel_("pl", "at", [(680, 324), (648, 324), (648, 516), (584, 516)], (670, 318, "1"), (596, 510, "N"))
    rel_("pl", "ev", [(792, 352), (792, 456)], (802, 366, "1"), (802, 450, "N"))
    d.raw_svg_front.append(f'<text x="152" y="620" fill="{SOFT}" font-size="12" font-weight="500" font-family="{SANS}" text-anchor="middle">內容模型</text>')
    d.raw_svg_front.append(f'<text x="632" y="620" fill="{SOFT}" font-size="12" font-weight="500" font-family="{SANS}" text-anchor="middle">學習與遊戲紀錄</text>')
    d.legend = [("focal", "匿名學習身分（中心）"), ("backend", "資料表"), ("edge:er", "1 對 N 關係")]
    return d


def d_gantt():
    d = Diagram("roadmap", "07 · Gantt", "分階段開發 Roadmap",
                "五個階段依序進行：Phase 0 教材整理 3 週、Phase 1 MVP 8 週、Phase 2 遊戲化 8 週、Phase 3 學習分析 6 週、Phase 4 AI 個人化 8 週以上；MVP 結束時於一個班級試行。",
                "Phase 0–1 是必要條件（約 11 週，一位兼職開發者估算），MVP 結束就上一個班試行；Phase 2 之後依試行結果決定。",
                1000, 380)
    weeks, x0, pitch = 33, 232, 22
    top = 72
    for wk in range(0, weeks + 1, 4):
        x = x0 + wk * pitch
        d.raw_svg_back.append(f'<text x="{x}" y="{top - 16}" fill="{SOFT}" font-size="8" font-family="{MONO}" text-anchor="middle">W{wk}</text>')
        d.raw_svg_back.append(f'<line x1="{x}" y1="{top - 8}" x2="{x}" y2="{top + 5 * 40}" stroke="{rgba(INK, 0.06)}" stroke-width="0.8"/>')
    d.raw_svg_back.append(f'<line x1="{x0}" y1="{top - 8}" x2="{x0 + weeks * pitch}" y2="{top - 8}" stroke="{rgba(INK, 0.12)}" stroke-width="0.8"/>')
    phases = [
        ("Phase 0", "教材整理與架構", 0, 3, False),
        ("Phase 1", "MVP：3 個 Mission", 3, 11, True),
        ("Phase 2", "遊戲化功能", 11, 19, False),
        ("Phase 3", "Learning Analytics", 19, 25, False),
        ("Phase 4", "AI / 個人化", 25, 33, False),
    ]
    for i, (ph, name, s, e, focal) in enumerate(phases):
        y = top + i * 40
        d.raw_svg_back.append(f'<text x="32" y="{y + 15}" fill="{SOFT}" font-size="8" letter-spacing="0.14em" font-family="{MONO}">{ph.upper()}</text>')
        d.raw_svg_back.append(f'<text x="32" y="{y + 31}" fill="{INK}" font-size="12" font-weight="600" font-family="{SANS}">{esc(name)}</text>')
        bx, bw = x0 + s * pitch, (e - s) * pitch
        fill = rgba(ACCENT, 0.12) if focal else rgba(MUTED, 0.15)
        stroke = ACCENT if focal else MUTED
        dash = ' stroke-dasharray="4,3"' if ph == "Phase 4" else ""
        d.raw_svg_back.append(f'<rect x="{bx}" y="{y + 8}" width="{bw}" height="24" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1"{dash}/>')
        label = f"{e - s} 週" + ("+" if ph == "Phase 4" else "")
        d.raw_svg_back.append(f'<text x="{bx + 8}" y="{y + 25}" fill="{ACCENT if focal else INK}" font-size="12" font-weight="600" font-family="{SANS}">{label}</text>')
        dfill = blend(ACCENT, 0.12) if focal else blend(MUTED, 0.15)
        d.raw_drawio.append(("cell", drawio_text(32, y + 4, 180, 32,
                             f'<span style="font-size:8px;color:#7a8399;font-family:Geist Mono">{ph.upper()}</span><br><b>{esc(name)}</b>')))
        d.raw_drawio.append(("cell", drawio_rect(bx, y + 8, bw, 24, label, dfill, stroke,
                             "align=left;spacingLeft=8;fontStyle=1;" + ("dashed=1;" if ph == "Phase 4" else ""))))
    # pilot milestone
    mx = x0 + 11 * pitch
    d.raw_svg_front.append(f'<line x1="{mx}" y1="{top - 8}" x2="{mx}" y2="{top + 5 * 40 + 8}" stroke="{ACCENT}" stroke-width="1" stroke-dasharray="4,3"/>')
    d.raw_svg_front.append(label_svg("班級試行", mx, top + 5 * 40 + 20, "middle"))
    d.raw_drawio.append(("cell", drawio_text(mx - 40, top + 5 * 40 + 8, 80, 20, '<span style="color:#eb6c36">班級試行</span>', "align=center;")))
    d.legend = [("focal", "MVP（關鍵路徑）"), ("store", "其他階段"), ("optional", "視試行結果")]
    return d


DIAGRAMS = [d_loop, d_personal, d_arch, d_dataflow, d_tree, d_er, d_gantt]


# ================================================================ pages
PAGE_CSS = f"""
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{--paper:{PAPER};--ink:{INK};--muted:{MUTED};--soft:{SOFT};--accent:{ACCENT};--rule:rgba(45,49,66,0.12)}}
body{{background:var(--paper);color:var(--ink);font-family:{SANS};line-height:1.6}}
.eyebrow{{font:500 0.66rem {MONO};letter-spacing:0.18em;text-transform:uppercase;color:var(--muted);margin-bottom:0.5rem}}
h1{{font:400 clamp(1.6rem,2.4vw + 0.8rem,2.2rem)/1.15 {SERIF};letter-spacing:-0.01em;margin-bottom:0.75rem}}
h2{{font:400 1.5rem/1.2 {SERIF};margin-bottom:0.5rem}}
svg{{display:block;width:100%;height:auto}}
"""


def page_all(ds):
    toc = "".join(f'<li><a href="#{d.slug}">{esc(d.eyebrow)} — {esc(d.title)}</a></li>' for d in ds)
    secs = []
    for i, d in enumerate(ds, 1):
        secs.append(f"""
<section id="{d.slug}">
  <p class="eyebrow">{esc(d.eyebrow)} · draw.io page {i}</p>
  <h2>{esc(d.title)}</h2>
  <p class="take">{esc(d.takeaway)}</p>
  <div class="fig">{render_svg(d)}</div>
</section>""")
    return f"""<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SDGs 教材系統架構圖集</title>
<link href="{FONT_LINK}" rel="stylesheet">
<style>{PAGE_CSS}
.wrap{{max-width:1160px;margin:0 auto;padding:3rem 1.5rem 4rem}}
.sub{{color:var(--muted);max-width:62ch;margin-bottom:1.5rem}}
.toc{{list-style:none;display:grid;grid-template-columns:1.1fr 1fr;gap:0.25rem 2rem;padding:1rem 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin-bottom:2rem}}
.toc a{{color:var(--ink);text-decoration:none;font-size:0.9rem}} .toc a:hover{{color:var(--accent)}}
section{{padding:2rem 0;border-bottom:1px solid var(--rule)}}
.take{{color:var(--muted);max-width:70ch;margin-bottom:1.25rem}}
.fig{{overflow-x:auto}} .fig svg{{min-width:760px}}
footer{{margin-top:2rem;font:400 0.7rem {MONO};color:var(--soft);letter-spacing:0.06em}}
@media (max-width:720px){{.toc{{grid-template-columns:1fr}}}}
</style></head><body><main class="wrap">
<p class="eyebrow">SDGs × English × Card Game · System Diagrams</p>
<h1>教材與系統重構：架構圖集</h1>
<p class="sub">Round 1 提案的七張核心圖。每張圖都有可編輯版本：report_diagrams/sdgs-system.drawio（用 draw.io 開啟，頁籤順序同本頁）。</p>
<ul class="toc">{toc}</ul>
{''.join(secs)}
<footer>Generated by build_diagrams.py · skin: diagram-design default · 2026-09-20</footer>
</main></body></html>"""


def page_one(d):
    return f"""<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><title>{esc(d.title)}</title>
<link href="{FONT_LINK}" rel="stylesheet">
<style>{PAGE_CSS}
body{{padding:28px 32px 20px;width:{d.W + 64}px}}
</style></head><body>
<p class="eyebrow">{esc(d.eyebrow)} · SDGs × English × Card Game</p>
<h1 style="font-size:1.9rem">{esc(d.title)}</h1>
<div style="width:{d.W}px">{render_svg(d)}</div>
</body></html>"""


def build(png=False):
    ds = [fn() for fn in DIAGRAMS]
    # move deferred drawio edges/cells into place
    for d in ds:
        extra = []
        for kind, obj in d.raw_drawio:
            if kind == "edge":
                d.edges_drawio_extra = getattr(d, "edges_drawio_extra", []) + [obj]
            else:
                extra.append(obj)
        d.raw_drawio = extra
    with open(os.path.join(OUT, "diagrams.html"), "w", encoding="utf-8") as fh:
        fh.write(page_all(ds))
    pages = []
    for d in ds:
        saved = d.edges
        d.edges = saved + getattr(d, "edges_drawio_extra", [])
        pages.append(render_drawio_page(d))
        d.edges = saved
    with open(os.path.join(OUT, "sdgs-system.drawio"), "w", encoding="utf-8") as fh:
        fh.write('<mxfile host="app.diagrams.net" type="device" version="24.0.0">' + "".join(pages) + "</mxfile>")
    os.makedirs(os.path.join(OUT, "png_src"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "png"), exist_ok=True)
    for i, d in enumerate(ds, 1):
        src = os.path.join(OUT, "png_src", f"{i:02d}-{d.slug}.html")
        with open(src, "w", encoding="utf-8") as fh:
            fh.write(page_one(d))
        if png:
            chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            outp = os.path.join(OUT, "png", f"{i:02d}-{d.slug}.png")
            w, h = d.W + 64, d.H + 140
            subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                            f"--window-size={w},{h}", "--force-device-scale-factor=2",
                            "--virtual-time-budget=8000", f"--screenshot={outp}",
                            "file:///" + src.replace("\\", "/")], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("png", outp)
    print("ok", len(ds), "diagrams")


if __name__ == "__main__":
    build(png="--png" in sys.argv)
