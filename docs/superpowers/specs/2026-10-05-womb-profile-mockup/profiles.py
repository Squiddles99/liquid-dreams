"""Side-on profile family drawn from Andrew's sketch (2026-10-05).

One curve per station: back -> crest -> lip outside -> lip tip -> lip underside
-> barrel wall -> barrel floor -> trough in front -> flat water. Units of H
(crest height above sea level). x points to the beach (wave runs left->right).
Three numbers drive it: H, phase (0 unbroken swell .. 1 round barrel), hollow.
"""
import math, sys

# 14 points per key phase, in units of H, crest base at x=0.
KEYS = {
    0.00: [(-7, 0), (-3.5, .10), (-1.5, .38), (0, .55), (.35, .53), (.6, .49), (.85, .43),
           (1.05, .37), (1.25, .30), (1.5, .21), (1.8, .09), (2.7, -.10), (4.2, -.04), (7, 0)],
    0.25: [(-7, 0), (-3.5, .14), (-1.4, .52), (0, .82), (.25, .81), (.45, .76), (.6, .69),
           (.68, .60), (.73, .48), (.77, .32), (.86, .10), (1.6, -.20), (3.2, -.08), (7, 0)],
    0.50: [(-7, 0), (-3.5, .17), (-1.4, .60), (.1, 1.0), (.5, 1.0), (.82, .9), (.98, .72),
           (.8, .72), (.55, .72), (.42, .42), (.5, .0), (1.5, -.30), (3.2, -.11), (7, 0)],
    0.75: [(-7, 0), (-3.5, .18), (-1.4, .62), (.15, 1.0), (.8, 1.0), (1.3, .76), (1.48, .30),
           (1.12, .58), (.62, .64), (.36, .30), (.55, -.22), (1.65, -.34), (3.2, -.12), (7, 0)],
    1.00: [(-7, 0), (-3.5, .18), (-1.4, .62), (.2, 1.0), (.98, .98), (1.55, .6), (1.62, -.14),
           (1.36, .40), (.86, .64), (.38, .28), (.7, -.30), (1.85, -.36), (3.3, -.12), (7, 0)],
}
LIP = range(4, 9)     # points that throw forward with hollowness
DIP = (10, 11)        # points drawn below sea level with hollowness


def smooth(t):
    return t * t * (3 - 2 * t)


def station(phase, hollow=1.0):
    ks = sorted(KEYS)
    for a, b in zip(ks, ks[1:]):
        if a <= phase <= b:
            break
    t = smooth((phase - a) / (b - a))
    pts = [(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t)
           for pa, pb in zip(KEYS[a], KEYS[b])]
    cx = pts[3][0]
    out = []
    for i, (x, y) in enumerate(pts):
        if i in LIP:
            x = cx + (x - cx) * (0.55 + 0.45 * hollow)
            y = y + (1 - hollow) * 0.25 * max(0, phase - 0.5) * (1 - y)
        if i in DIP and y < 0:
            y *= 0.45 + 0.55 * hollow
        out.append((x, y))
    return out


def catmull(pts, n=24):
    """Centripetal Catmull-Rom through all points: one smooth curve."""
    P = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        def tj(ti, a, b):
            return ti + max(1e-6, math.dist(a, b)) ** 0.5
        t0 = 0; t1 = tj(t0, p0, p1); t2 = tj(t1, p1, p2); t3 = tj(t2, p2, p3)
        for k in range(n):
            t = t1 + (t2 - t1) * k / n
            def L(a, b, ta, tb):
                return tuple(((tb - t) * a[j] + (t - ta) * b[j]) / (tb - ta) for j in (0, 1))
            A1 = L(p0, p1, t0, t1); A2 = L(p1, p2, t1, t2); A3 = L(p2, p3, t2, t3)
            B1 = L(A1, A2, t0, t2); B2 = L(A2, A3, t1, t3)
            out.append(L(B1, B2, t1, t2))
    out.append(pts[-1])
    return out


def svg(phase, hollow, w=300, h=None, x0=-2.4, x1=3.0, y0=-0.6, y1=1.2,
        label="", sub="", surfer=None, mirror=False):
    h = h or round(w * (y1 - y0) / (x1 - x0))  # same scale both ways: no squashing
    sx = w / (x1 - x0); sy = h / (y1 - y0)
    X = (lambda x: w - (x - x0) * sx) if mirror else (lambda x: (x - x0) * sx)
    Y = lambda y: (y1 - y) * sy
    c = catmull(station(phase, hollow))
    d = "M" + " L".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in c)
    fill = d + f" L{X(7):.1f},{Y(y0 - 1):.1f} L{X(-7):.1f},{Y(y0 - 1):.1f} Z"
    s = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{label}">',
         f'<rect width="{w}" height="{h}" class="sky"/>',
         f'<path d="{fill}" class="water"/>',
         f'<path d="{d}" class="line"/>',
         f'<line x1="0" x2="{w}" y1="{Y(0):.1f}" y2="{Y(0):.1f}" class="sea"/>']
    if surfer == "paddle":
        # on the back, part way up: the crest is uphill of her
        pts = station(phase, hollow)
        bx = -1.6; by = next(y for x, y in reversed(c) if x <= bx and x > bx - 0.1)
        s.append(f'<ellipse cx="{X(bx):.1f}" cy="{Y(by) - 3:.1f}" rx="7" ry="2.4" class="rider"/>')
    if surfer == "tube":
        s.append(f'<circle cx="{X(.92):.1f}" cy="{Y(.18):.1f}" r="3.4" class="rider"/>'
                 f'<line x1="{X(.92):.1f}" y1="{Y(.12):.1f}" x2="{X(.86):.1f}" y2="{Y(-.2):.1f}" class="riderl"/>')
    s.append("</svg>")
    return "".join(s)


PHASES = [(0.0, "Unbroken swell", "Back and front nearly even; crest about half its final height."),
          (0.25, "Standing up", "Front steepens, water in front starts to draw down."),
          (0.5, "Lip pitching", "Face goes vertical; the lip leaves from the crest itself."),
          (0.75, "Throwing", "Thick lip flies forward; the trough drops below sea level."),
          (1.0, "Round barrel", "Lip lands far out in front; the barrel floor sits below sea level.")]
HOLLOW = [(0.0, "Less hollow", "Shorter throw, shallower trough: a thick, open curl."),
          (0.5, "Middle", ""),
          (1.0, "Most hollow", "Longest throw, deepest draw-down: the Womb's barrel.")]

css = """
:root{--bg:#f6f4ef;--ink:#1d2430;--muted:#5c6470;--card:#fff;--sky:#eef3f7;--water:#2f6f8f;--line:#123446;--sea:#b0463c;--rider:#e0a030}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14181e;--ink:#e6e9ee;--muted:#9aa3ae;--card:#1c222a;--sky:#1a2530;--water:#3b86aa;--line:#bfe0ef;--sea:#e07a6e;--rider:#f0b84a}}
:root[data-theme=dark]{--bg:#14181e;--ink:#e6e9ee;--muted:#9aa3ae;--card:#1c222a;--sky:#1a2530;--water:#3b86aa;--line:#bfe0ef;--sea:#e07a6e;--rider:#f0b84a}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:32px 0 6px}
p{margin:4px 0 12px;color:var(--muted);max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
figure{margin:0;background:var(--card);border-radius:8px;padding:8px}
figcaption{font-size:13px;color:var(--muted);padding:4px 2px 0} figcaption b{color:var(--ink)}
svg{width:100%;height:auto;display:block;border-radius:4px}
.sky{fill:var(--sky)} .water{fill:var(--water);opacity:.85} .line{fill:none;stroke:var(--line);stroke-width:1.6}
.sea{stroke:var(--sea);stroke-width:1;stroke-dasharray:4 3} .rider{fill:var(--rider)} .riderl{stroke:var(--rider);stroke-width:2.4}
.sand{fill:#d9c49a} .lab{fill:var(--ink);font-size:15px} .crest{fill:none;stroke:var(--line);stroke-width:5} .foam{fill:none;stroke:#fff;stroke-width:14;stroke-linecap:round} .arrow{stroke:var(--ink);stroke-width:3} .arrowh{fill:none;stroke:var(--ink);stroke-width:3} .eye circle{fill:var(--card);stroke:var(--ink);stroke-width:2} .eye path{stroke:var(--ink);stroke-width:3} .eye text{fill:var(--ink);font:bold 14px system-ui}

"""

PLAN = """<svg viewBox="0 0 960 300" role="img" aria-label="Plan view, facing the beach">
<rect width="960" height="300" class="sky"/>
<rect width="960" height="70" class="sand"/><text x="480" y="42" class="lab" text-anchor="middle">BEACH</text>
<rect y="70" width="960" height="230" class="water" opacity=".55"/>
<path d="M60,190 C300,175 520,168 620,166" class="crest"/>
<path d="M620,166 C700,163 820,160 920,158" class="foam"/>
<text x="770" y="140" class="lab" text-anchor="middle">already broken (white water)</text>
<text x="230" y="160" class="lab" text-anchor="middle">wall still to come</text>
<circle cx="600" cy="176" r="8" class="rider"/>
<path d="M585,200 L470,200" class="arrow"/><path d="M478,193 L466,200 L478,207" class="arrowh"/>
<text x="530" y="225" class="lab" text-anchor="middle">peels right to left: the ride</text>
<g class="eye"><circle cx="890" cy="250" r="13"/><path d="M874,250 L840,250"/><text x="890" y="255" text-anchor="middle">A</text></g>
<text x="890" y="285" class="lab" text-anchor="middle">behind the rider</text>
<g class="eye"><circle cx="70" cy="250" r="13"/><path d="M86,250 L120,250"/><text x="70" y="255" text-anchor="middle">B</text></g>
<text x="40" y="285" class="lab">ahead, in the channel</text>
<text x="480" y="290" class="lab" text-anchor="middle">OPEN SEA (you are out here, facing the beach)</text>
</svg>"""

body = ['<main><h1>The Womb, side on: the profile family</h1>',
        '<h2>Which way round</h2><p>Seen from the water, facing the beach, the Womb\'s left peels from right to left. '
        'A side-on drawing is a slice across the wave, looked at along the wave. There are two ends to look from:</p>',
        '<figure>', PLAN, '<figcaption><b>Plan view, facing the beach.</b> A looks down the line the way the rider '
        'is heading; B looks back at the oncoming wave from the channel.</figcaption></figure>',
        '<div class="grid" style="margin-top:12px"><figure>', svg(1.0, 1.0, w=470, x0=-3.0, x1=3.6, y0=-0.6, y1=1.2, surfer="tube"),
        '<figcaption><b>A: behind the rider, looking where she is going.</b> Beach on the right, open sea on the left; '
        'the lip throws left to right. This is how the drawings below were made.</figcaption></figure><figure>',
        svg(1.0, 1.0, w=470, x0=-3.0, x1=3.6, y0=-0.6, y1=1.2, surfer="tube", mirror=True),
        '<figcaption><b>B: from the channel, looking back at the wave.</b> Beach on the left, open sea on the right; '
        'the lip throws right to left.</figcaption></figure></div>',
        '<h2>The target</h2>',
        '<p>Every drawing below is the same shape rule with different numbers fed in. '
        'Drawn from viewpoint A. The red dashed line is sea level. '
        'Nothing here is in the game yet; this is the picture to agree before any code.</p>',
        '<div class="big"><figure>', svg(1.0, 1.0, w=960, x0=-3.0, x1=3.6, y0=-0.6, y1=1.2,
                                           label="Round barrel, most hollow", surfer="tube"),
        '<figcaption><b>The target, as in your drawing.</b> Gentle back rising from sea level to a crest '
        'well above it; a thick lip thrown far forward into a round barrel; barrel floor and the water in '
        'front below the level behind.</figcaption></figure></div>',
        '<h2>One spot on the reef, through time</h2>',
        '<p>Number 1: <b>phase</b>. The same crest point goes through these five shapes as it breaks. '
        'In between, the shape slides smoothly from one to the next.</p><div class="grid">']
for ph, t, sub in PHASES:
    body.append(f'<figure>{svg(ph, 1.0, label=t, surfer="paddle" if ph == 0.5 else None)}'
                f'<figcaption><b>{t}</b> {sub}</figcaption></figure>')
body.append('</div><h2>How hollow</h2><p>Number 2: <b>hollowness</b>, from the reef underneath. '
            'All three are at the round-barrel moment. The plan is for the reef to keep the left at '
            'the hollow end the whole way down the line.</p><div class="grid">')
for hv, t, sub in HOLLOW:
    body.append(f'<figure>{svg(1.0, hv, label=t)}<figcaption><b>{t}</b> {sub}</figcaption></figure>')
body.append('</div><h2>How big</h2><p>Number 3: <b>height</b>. It scales the whole drawing; '
            'the shape stays the same, so a 4 ft and a 12 ft wave barrel alike.</p></main>')

html = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>Womb Profile Family</title><style>{css}</style></head><body>'
        + "".join(body) + '</body></html>')
open(sys.argv[1], "w").write(html)
