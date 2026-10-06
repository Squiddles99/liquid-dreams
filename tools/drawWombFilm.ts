// tools/drawWombFilm.ts: the game's own slices down the reshaped left, frame by frame through one set wave (plan
// 2026-10-05-womb-profile-step3 3b): every slice is crestTrace's station there, its section by wombSection on the plain
// swell. Andrew's check that the shape holds all along the line, not only at one slice. Run from the repo root:
//   node tools/drawWombFilm.ts [sizeFt=8] [tide=0]   → docs/superpowers/specs/2026-10-05-womb-profile-mockup/film-<ft>ft.html
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const imp = async <T>(p: string): Promise<T> => (await runnerImport<T>(p)).module;
const reef = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const bathy = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const brk = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const swm = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const ct = await imp<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
const ws = await imp<typeof import('../src/breaker/wombSection')>('/src/breaker/wombSection.ts');
const rr = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');

const sizeFt = Number(process.argv[2] ?? 8), tide = Number(process.argv[3] ?? 0), PERIOD = 15;
const OUT = `docs/superpowers/specs/2026-10-05-womb-profile-mockup/film-${sizeFt}ft.html`;
const P = brk.DEFAULT_BREAK_PARAMS;
const field = rf.computeReefField({ bed: bathy.downsample(bathy.buildBathymetry(reef.DEFAULT_REEF_PARAMS), 2), periodS: PERIOD, fromDeg: 225, tideM: tide, peel: P.peel });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const H0 = rr.setWaveHeight(sizeFt);
const wave = { arrivalS: 0, heightM: H0, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
const swell = swm.breakOptions(field, { ...P, enabled: false });

// The places down the left: along the reshaped edge (m from the peak), named for Andrew.
const edge = reef.NORTH_LEDGE;
const alongEdge = (s: number): [number, number] => {
  for (let i = 0, s0 = 0; i + 1 < edge.length; i++) {
    const [a, b] = [edge[i], edge[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= s0 + L) return [a[0] + ((b[0] - a[0]) * (s - s0)) / L, a[1] + ((b[1] - a[1]) * (s - s0)) / L];
    s0 += L;
  }
  return edge[edge.length - 1] as [number, number];
};
const lens: number[] = [];
for (let i = 0, s0 = 0; i + 1 < edge.length; i++) { lens.push(s0); s0 += Math.hypot(edge[i + 1][0] - edge[i][0], edge[i + 1][1] - edge[i][1]); }
const PLACES: [string, number][] = [['take-off', 2], ['1st section', 25], ['1st, end', 50], ['the gap', 105], ['2nd section', lens[6] + 10], ['2nd, end', lens[6] + 45]];

const PLACE_REACH_M = 30;
const TIMES = Array.from({ length: 18 }, (_, i) => -2 + i);
type P2 = readonly [number, number];
const frames = TIMES.map((t) => {
  const st = ct.traceStations(field, [wave], t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0.3, spacingM: 1 });
  return PLACES.map(([, s]) => {
    const [px, pz] = alongEdge(s);
    let best: (typeof st)[number] | null = null, bestD = 3;
    for (const e of st) {
      if (e.gap) continue;
      // The crest at this place: within PLACE_REACH_M of it along the wave's path (the swell's next crest, a wavelength
      // out to sea, crosses the same path).
      if (Math.abs((px - e.x) * e.nx + (pz - e.z) * e.nz) > PLACE_REACH_M) continue;
      const d = Math.abs((px - e.x) * -e.nz + (pz - e.z) * e.nx);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best || best.gap) return null;
    const S = best;
    const sheet = (u: number): P2 => {
      const x = S.x + S.nx * u, z = S.z + S.nz * u;
      const r = swm.sumWaves(x, z, t, rf.sampleField(field, x, z), [wave], ctx, swell);
      return [u + r.dx * S.nx + r.dz * S.nz, r.eta];
    };
    const sec = ws.wombSection({ H: S.H, Hb: S.Hb, r: S.r, tb: S.tb, psi: S.psi, periodS: PERIOD }, sheet, { ribbonOnset: P.ribbonOnset });
    const plain: P2[] = [];
    for (let u = -40; u <= 40; u += 1) plain.push(sheet(u));
    return { sec, plain, offset: (px - S.x) * S.nx + (pz - S.z) * S.nz };
  });
});

const W = 150, Hh = 75, U0 = -24, U1 = 24, Y0 = -5, Y1 = 7.5;
const X = (u: number): number => ((u - U0) / (U1 - U0)) * W, Y = (y: number): number => ((Y1 - y) / (Y1 - Y0)) * Hh;
const panel = (f: (typeof frames)[number][number]): string => {
  if (!f) return `<svg viewBox="0 0 ${W} ${Hh}"><rect width="${W}" height="${Hh}" class="sky"/><text x="${W / 2}" y="${Hh / 2}" class="none" text-anchor="middle">no wave</text></svg>`;
  const d = 'M' + f.sec.points.map(([u, y]) => `${X(u).toFixed(1)},${Y(y).toFixed(1)}`).join(' L');
  const s0 = f.sec.points[0], s1 = f.sec.points[f.sec.points.length - 1];
  const left = f.plain.filter((p) => p[0] < s1[0]).map(([u, y]) => `${X(u).toFixed(1)},${Y(y).toFixed(1)}`);
  const right = f.plain.filter((p) => p[0] > s0[0]).map(([u, y]) => `${X(u).toFixed(1)},${Y(y).toFixed(1)}`);
  // Viewpoint A: the beach on the right. The section runs front (beach) to back, so draw it reversed after the back's sea.
  const path = `M${[...left, ...[...f.sec.points].reverse().map(([u, y]) => `${X(u).toFixed(1)},${Y(y).toFixed(1)}`), ...right].join(' L')}`;
  const n = f.sec.numbers;
  return `<svg viewBox="0 0 ${W} ${Hh}"><rect width="${W}" height="${Hh}" class="sky"/><path d="${path} L${W},${Hh} L0,${Hh} Z" class="water"/>`
    + `<path d="${d}" class="line"/><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="sea"/>`
    + `<text x="3" y="9" class="tag">${n.phase.toFixed(2)} · h${n.hollow.toFixed(2)} · A${n.A.toFixed(2)}</text></svg>`;
};
const css = `:root{--bg:#f6f4ef;--ink:#1d2430;--muted:#5c6470;--card:#fff;--sky:#eef3f7;--water:#2f6f8f;--line:#123446;--sea:#b0463c}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14181e;--ink:#e6e9ee;--muted:#9aa3ae;--card:#1c222a;--sky:#1a2530;--water:#3b86aa;--line:#bfe0ef;--sea:#e07a6e}}
:root[data-theme=dark]{--bg:#14181e;--ink:#e6e9ee;--muted:#9aa3ae;--card:#1c222a;--sky:#1a2530;--water:#3b86aa;--line:#bfe0ef;--sea:#e07a6e}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif} main{max-width:1100px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:20px;margin:0 0 4px} p{color:var(--muted);max-width:80ch;margin:4px 0 12px} .wrap{overflow-x:auto}
table{border-collapse:separate;border-spacing:4px} th{font-size:12px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap} td{padding:0}
svg{width:150px;height:auto;display:block;border-radius:3px} .sky{fill:var(--sky)} .water{fill:var(--water);opacity:.85} .line{fill:none;stroke:var(--line);stroke-width:1.2}
.sea{stroke:var(--sea);stroke-width:.6;stroke-dasharray:3 2} .tag{font:8px system-ui;fill:var(--ink)} .none{font:10px system-ui;fill:var(--muted)}`;
const rows = TIMES.map((t, i) => `<tr><th>${t} s</th>${frames[i].map((f) => `<td>${panel(f)}</td>`).join('')}</tr>`).join('');
writeFileSync(OUT, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Womb Film Strip</title><style>${css}</style></head><body><main>`
  + `<h1>The left, slice by slice: ${sizeFt} ft, ${tide === 0 ? 'mid' : tide < 0 ? 'low' : 'high'} tide</h1>`
  + `<p>Each picture is the game's own slice of the wave at that place and moment (the station the game puts there, its shape from your approved drawings, set by the reef). Rows are seconds after the wave reaches the take-off; columns are places down the left. Viewpoint A: the beach is on the right. The small numbers: stage (0 swell, 0.5 pitching, 1 round barrel, 2 white water) and hollowness (1 = the Womb's barrel). Drawn 48 m across by 12.5 m tall, the same scale both ways.</p>`
  + `<div class="wrap"><table><tr><th></th>${PLACES.map(([n]) => `<th>${n}</th>`).join('')}</tr>${rows}</table></div></main></body></html>`);
console.log(`wrote ${OUT}`);
