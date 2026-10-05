// tools/drawWombProfiles.ts: Andrew's side-on drawings of the Womb's profile family, drawn by the game's own shape rule
// (src/breaker/wombProfile.ts; spec 2026-10-05-womb-profile-design §5: one source). Run from the repo root:
//   node tools/drawWombProfiles.ts            → docs/superpowers/specs/2026-10-05-womb-profile-mockup/profiles.html
//   node tools/drawWombProfiles.ts --freeze   → also src/breaker/wombProfile.approved.json (only on Andrew's sign-off)
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const { module: wp } = await runnerImport<typeof import('../src/breaker/wombProfile')>('/src/breaker/wombProfile.ts');
const { profileCurve, CURVE_SAMPLES } = wp;
type P2 = readonly [number, number];

const OUT = 'docs/superpowers/specs/2026-10-05-womb-profile-mockup/profiles.html';
const FIXTURE = 'src/breaker/wombProfile.approved.json';
const FT = 0.3048;

interface View { w: number; x0: number; x1: number; y0: number; y1: number }
const SMALL: View = { w: 300, x0: -2.4, x1: 3.0, y0: -0.6, y1: 1.2 };
const BIG: View = { w: 960, x0: -3.0, x1: 3.6, y0: -0.6, y1: 1.2 };

/** One side-on panel, viewpoint A (beach on the right), equal scale both ways. `scale` multiplies the shape (height). */
function svg(phase: number, hollow: number, v: View, label: string, opts: { surfer?: 'paddle' | 'tube'; scale?: number } = {}): string {
  const s = opts.scale ?? 1;
  const h = Math.round((v.w * (v.y1 - v.y0)) / (v.x1 - v.x0));
  const sx = v.w / (v.x1 - v.x0), sy = h / (v.y1 - v.y0);
  const X = (x: number): number => (x - v.x0) * sx, Y = (y: number): number => (v.y1 - y) * sy;
  const c = profileCurve(phase, hollow).map(([u, y]): P2 => [u * s, y * s]);
  const d = `M${X(-1e3).toFixed(1)},${Y(0).toFixed(1)} L` + c.map(([u, y]) => `${X(u).toFixed(1)},${Y(y).toFixed(1)}`).join(' L') + ` L${X(1e3).toFixed(1)},${Y(0).toFixed(1)}`;
  const fill = `${d} L${X(1e3).toFixed(1)},${Y(v.y0 - 1).toFixed(1)} L${X(-1e3).toFixed(1)},${Y(v.y0 - 1).toFixed(1)} Z`;
  const out = [`<svg viewBox="0 0 ${v.w} ${h}" role="img" aria-label="${label}">`, `<rect width="${v.w}" height="${h}" class="sky"/>`,
    `<path d="${fill}" class="water"/>`, `<path d="${d}" class="line"/>`,
    `<line x1="0" x2="${v.w}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="sea"/>`];
  if (opts.surfer === 'paddle') {
    // On the back, part way up: the crest is uphill of her.
    const bx = -1.6 * s, by = c.reduce((best, p) => (Math.abs(p[0] - bx) < Math.abs(best[0] - bx) ? p : best))[1];
    out.push(`<ellipse cx="${X(bx).toFixed(1)}" cy="${(Y(by) - 3).toFixed(1)}" rx="7" ry="2.4" class="rider"/>`);
  }
  if (opts.surfer === 'tube') {
    out.push(`<circle cx="${X(0.92 * s).toFixed(1)}" cy="${Y(0.18 * s).toFixed(1)}" r="3.4" class="rider"/>`,
      `<line x1="${X(0.92 * s).toFixed(1)}" y1="${Y(0.12 * s).toFixed(1)}" x2="${X(0.86 * s).toFixed(1)}" y2="${Y(-0.2 * s).toFixed(1)}" class="riderl"/>`);
  }
  out.push('</svg>');
  return out.join('');
}

const fig = (inner: string, title: string, sub = ''): string => `<figure>${inner}<figcaption><b>${title}</b> ${sub}</figcaption></figure>`;

const PHASES: [number, string, string][] = [
  [0, 'Unbroken swell', 'Back and front nearly even; crest about half its final height.'],
  [0.25, 'Standing up', 'Front steepens, water in front starts to draw down.'],
  [0.5, 'Lip pitching', 'Face goes vertical; the lip leaves from the crest itself.'],
  [0.75, 'Throwing', 'Thick lip flies forward; the trough drops below sea level.'],
  [1, 'Round barrel', 'Lip lands far out in front; the barrel floor sits below sea level.'],
];
const COLLAPSE: [number, string, string][] = [
  [1.25, 'Tube filling', 'The lip has landed; the tube shrinks from behind, still round.'],
  [1.5, 'Caving in', 'The tube has filled: a rounded hump with a steep front.'],
  [1.75, 'Rolling', 'The hump settles as it rolls on.'],
  [2, 'White-water wall', 'About half the wave\'s height, rolling to the beach (foam laid over it in the game).'],
];
const HOLLOW: [number, string, string][] = [
  [0, 'Less hollow', 'Shorter throw, shallower trough: a thick, open curl.'],
  [0.5, 'Middle', ''],
  [1, 'Most hollow', 'Longest throw, deepest draw-down: the Womb\'s barrel.'],
];
const SIZES_FT = [4, 8, 12];

const css = `
:root{--bg:#f6f4ef;--ink:#1d2430;--muted:#5c6470;--card:#fff;--sky:#eef3f7;--water:#2f6f8f;--line:#123446;--sea:#b0463c;--rider:#e0a030;--flag:#8a5a00}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14181e;--ink:#e6e9ee;--muted:#9aa3ae;--card:#1c222a;--sky:#1a2530;--water:#3b86aa;--line:#bfe0ef;--sea:#e07a6e;--rider:#f0b84a;--flag:#f0b84a}}
:root[data-theme=dark]{--bg:#14181e;--ink:#e6e9ee;--muted:#9aa3ae;--card:#1c222a;--sky:#1a2530;--water:#3b86aa;--line:#bfe0ef;--sea:#e07a6e;--rider:#f0b84a;--flag:#f0b84a}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:32px 0 6px}
p{margin:4px 0 12px;color:var(--muted);max-width:70ch} .flag{color:var(--flag);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
figure{margin:0;background:var(--card);border-radius:8px;padding:8px}
figcaption{font-size:13px;color:var(--muted);padding:4px 2px 0} figcaption b{color:var(--ink)}
svg{width:100%;height:auto;display:block;border-radius:4px}
.sky{fill:var(--sky)} .water{fill:var(--water);opacity:.85} .line{fill:none;stroke:var(--line);stroke-width:1.6}
.sea{stroke:var(--sea);stroke-width:1;stroke-dasharray:4 3} .rider{fill:var(--rider)} .riderl{stroke:var(--rider);stroke-width:2.4}
`;

const body: string[] = [
  '<main><h1>The Womb, side on: the profile family</h1>',
  '<p>Drawn by the game\'s own shape code, not a separate sketch: if the game\'s shape changes, these pictures change. ',
  'Viewpoint A (agreed 2026-10-05): behind the rider, looking down the line of the left; beach on the right. ',
  'The red dashed line is sea level.</p>',
  `<div class="big">${fig(svg(1, 1, BIG, 'Round barrel, most hollow', { surfer: 'tube' }), 'The target, as in your drawing.',
    'Gentle back rising from sea level to a crest well above it; a thick lip thrown far forward into a round barrel; barrel floor and the water in front below the level behind.')}</div>`,
  '<h2>One spot on the reef, through time</h2><p>Number 1: <b>phase</b>. Approved 2026-10-05, ',
  'the lip\'s end rounded so it reads thick on the 3D wave.</p><div class="grid">',
  ...PHASES.map(([ph, t, sub]) => fig(svg(ph, 1, SMALL, t, { surfer: ph === 0.5 ? 'paddle' : undefined }), t, sub)),
  '</div><h2>After the barrel: the collapse</h2><p>Approved 2026-10-05. The tube caves in ',
  'behind the surfer and becomes white water. How fast depends on the wave\'s power (step 3 sets the timing); these are the shapes it passes through.</p><div class="grid">',
  ...COLLAPSE.map(([ph, t, sub]) => fig(svg(ph, 1, SMALL, t), t, sub)),
  '</div><h2>How hollow</h2><p>Number 2: <b>hollowness</b>, from the reef underneath, at the round-barrel moment. ',
  'The left stays at the hollow end down the line, with its own character in the second section.</p><div class="grid">',
  ...HOLLOW.map(([hv, t, sub]) => fig(svg(1, hv, SMALL, t), t, sub)),
  '</div><h2>How big</h2><p>Number 3: <b>height</b>. Drawn to one scale in metres: the shape is the same, only bigger.</p><div class="grid">',
  ...SIZES_FT.map((ft) => {
    const H = ft * FT, top = SIZES_FT[SIZES_FT.length - 1] * FT;
    return fig(svg(1, 1, { w: 300, x0: -2.4 * top, x1: 3 * top, y0: -0.6 * top, y1: 1.2 * top }, `${ft} ft`, { scale: H }), `${ft} ft`, `crest ${H.toFixed(1)} m above sea level`);
  }),
  '</div></main>',
];

writeFileSync(OUT, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + `<title>Womb Profile Family</title><style>${css}</style></head><body>${body.join('')}</body></html>`);
console.log(`wrote ${OUT}`);

if (process.argv.includes('--freeze')) {
  // The shapes Andrew has signed (2026-10-05): every stage at full hollowness, and the less hollow and middle barrels.
  const signed: [number, number][] = [[0, 1], [0.25, 1], [0.5, 1], [0.75, 1], [1, 1], [1, 0], [1, 0.5], [1.25, 1], [1.5, 1], [1.75, 1], [2, 1]];
  const round = (x: number): number => Math.round(x * 1e6) / 1e6;
  const shapes = signed.map(([phase, hollow]) => ({ phase, hollow, curve: profileCurve(phase, hollow).map(([u, y]) => [round(u), round(y)]) }));
  writeFileSync(FIXTURE, JSON.stringify({ approved: '2026-10-05', n: CURVE_SAMPLES, shapes }) + '\n');
  console.log(`wrote ${FIXTURE}`);
}
