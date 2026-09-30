import { describe, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, GRAVITY_MS2 } from './breaking';
import { barrelShape, withShape } from './breakIntensity';
import { type Station, traceStations } from './crestTrace';
import { type ProfileFrame, type Vec2, buildProfile, profileFrame } from './lipProfile';
import { sampleField } from './reefField';
import { type BreakOptions, breakOptions, sumWaves } from './setWaveModel';
import { TARGETS, anchorLanding, anchorStation, ctx, field, wave } from './barrelAnchors.test';

const OUT: string = import.meta.env.ANCHOR_VIEW_OUT ?? '';
const TRACES: string = import.meta.env.TRACE_DIR ?? 'C:/Dev/andrew-dev-personal-projects/liquid-dreaming/reference/wave/traces';
// node:fs through a computed specifier: the project's typecheck has no Node types, and this viewer only runs under Vitest.
const nodeFs = (): Promise<{ readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string): void }> => import(/* @vite-ignore */ ['node', 'fs'].join(':'));
const NAMES = ['gentle', 'normal', 'heavy'];

/** An SVG panel mapping (u, y) metres at PX px per metre over the given ranges, with a still-water line. */
function panel(U0: number, U1: number, Y0: number, Y1: number, PX: number, body: (X: (u: number) => string, Y: (y: number) => string) => string): string {
  const X = (u: number) => ((u - U0) * PX).toFixed(1), Y = (y: number) => ((Y1 - y) * PX).toFixed(1);
  const W = (U1 - U0) * PX, H = (Y1 - Y0) * PX;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f3f6f8"/>${body(X, Y)}<line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#c33" stroke-dasharray="4 4"/></svg>`;
}
const line = (X: (u: number) => string, Y: (y: number) => string, pts: Vec2[]) => 'M' + pts.map((p) => `${X(p[0])},${Y(p[1])}`).join('L');
/** The lip tip's height: the outer arc at its tip (lipProfile's outer at sigma = 1). */
const tipY = (f: ProfileFrame) => f.K[1] - 0.5 * GRAVITY_MS2 * (f.reach / Math.max(f.vj, 1e-6)) ** 2;

describe.skipIf(!OUT)('anchor drawings', () => {
  it('draws the three anchors side on and the lip end front on', { timeout: 900_000 }, async () => {
    const fs = await nodeFs();
    const read = (f: string) => JSON.parse(fs.readFileSync(`${TRACES}/${f}`, 'utf-8'));
    const target: Vec2[] = read('andrew-target-1s.json');
    const t7 = read('t7.json');
    const sides: string[] = [];
    for (const I of [0, 1, 2]) {
      const tau = anchorLanding(I);
      for (const dt of [-0.5, 0, 0.5, 1]) {
        const s = anchorStation(I, tau + dt);
        const prof = buildProfile(s.base, s.input, s.lip, s.frameBase), f = prof.frame;
        const sea: Vec2[] = [];
        for (let u = -20; u <= 30; u += 0.25) sea.push(s.base(u));
        const tg = TARGETS[I];
        sides.push(`<figure><figcaption><b>${NAMES[I]} (${I})</b>, ${dt === 0 ? 'the lip landing' : `${dt > 0 ? '+' : ''}${dt} s from landing`}. Target: tube ${tg.tubeRatio}, lands ${tg.landAhead} H, lip ${tg.rootThickness} H, trough ${tg.troughBelow} H.</figcaption>${panel(-20, 30, -8, 11, 16, (X, Y) => {
          let overlay = '';
          if (I === 1 && dt === 0) overlay = target.map(([u, y]) => `<circle cx="${X(u)}" cy="${Y(y)}" r="1.2" fill="#ff7a00" fill-opacity="0.55"/>`).join('');
          if (I === 2 && dt === 0) {
            // The cyan tube's mouth, mirrored (its wall is on the right in the photo), scaled to this tube's height (the
            // foot F to the lip's root R), its back wall on this tube's wall W and its floor on the foot.
            const m: [number, number][] = t7.mouth, floor: number = t7.water[0][1];
            const wallPx = Math.max(...m.map((p) => p[0])), ceilPx = Math.min(...m.map((p) => p[1]));
            const sc = (f.R[1] - f.F[1]) / (floor - ceilPx);
            overlay = `<path d="${line(X, Y, m.map(([px, py]) => [f.W[0] + (wallPx - px) * sc, f.F[1] + (floor - py) * sc]))}" fill="none" stroke="#e0249a" stroke-width="3"/>`;
          }
          // As in the game, the lip's profile replaces the sheet over its span: the sheet is drawn only behind the profile's
          // back end and ahead of its front start, and the profile's water is closed down through the bottom (the tube is air).
          const pts = prof.points, xFront = pts[0][0], xBack = pts[pts.length - 1][0];
          const behind = [...sea.filter((q) => q[0] <= xBack), pts[pts.length - 1]], ahead = [pts[0], ...sea.filter((q) => q[0] >= xFront)];
          const fillTo = (q: Vec2[]) => (q.length ? `<path d="${line(X, Y, q)}L${X(q[q.length - 1][0])},${Y(-8)}L${X(q[0][0])},${Y(-8)}Z" fill="#1f4e9c" stroke="#1f4e9c" stroke-width="1.5"/>` : '');
          return `${fillTo(behind)}${fillTo(ahead)}<path d="${line(X, Y, pts)}L${X(xBack)},${Y(-8)}L${X(xFront)},${Y(-8)}Z" fill="#1f4e9c" stroke="#1f4e9c" stroke-width="1.5"/><path d="${line(X, Y, pts)}" fill="none" stroke="#bdf0f7" stroke-width="1.4"/>${overlay}`;
        })}</figure>`);
      }
    }

    // Front on: 1 s after the peak's lip lands, every station along the crest (1 m apart) with its own cross-section at
    // intensity I: its crest top, its lip tip and the lowest water in front, against the arc along the crest. The two
    // photos' lip edges are scaled to the face (crest top to lowest water), their feet where the tip meets the water.
    const t10 = read('t10.json'), t8 = read('t8.json');
    const photoEdge = (t: { edge: [number, number][]; crest: [number, number][] }, basePx: number): Vec2[] => {
      const crestPx = Math.min(...t.crest.map((p) => p[1])), x0 = Math.min(...t.edge.map((p) => p[0]));
      return t.edge.map(([px, py]) => [(px - x0) / (basePx - crestPx), (basePx - py) / (basePx - crestPx)]); // in face heights
    };
    const edges = { dark: photoEdge(t10, 470), sunset: photoEdge(t8, 420) };
    const fronts: string[] = [];
    for (const I of [1, 2]) {
      const t = sampleField(field, 0, 0).tau + anchorLanding(I) + 1;
      const opts: BreakOptions = { ...breakOptions(field, DEFAULT_BREAK_PARAMS), force: { intensity: I } };
      const flat: BreakOptions = { ...opts, pile: false };
      const lip = withShape(DEFAULT_BREAK_PARAMS, barrelShape(I));
      const stations = traceStations(field, [wave], t, ctx, { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: 0, spacingM: 1 }).filter((e): e is Station => !e.gap);
      const rows = stations.map((s) => {
        const along = (o: BreakOptions) => (u: number): Vec2 => {
          const x = s.x + s.nx * u, z = s.z + s.nz * u, r = sumWaves(x, z, t, sampleField(field, x, z), [wave], ctx, o);
          return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
        };
        const fr = profileFrame(along(flat), { H: s.H, c: s.c, r: s.r, tb: s.tb }, lip);
        let low = Infinity;
        for (let u = 0; u <= 25; u += 0.5) low = Math.min(low, along(opts)(u)[1]);
        return { v: s.arc, crest: fr.K[1], tip: s.tb === null ? fr.K[1] : tipY(fr), low, landed: s.tb !== null && s.tb >= fr.tauLand };
      });
      // The foot: the first station, from the unbroken side (its stations have no time since onset), whose lip has landed.
      const unbrokenFirst = stations.length > 0 && stations[0].tb === null;
      const ordered = unbrokenFirst ? rows : [...rows].reverse();
      const foot = ordered.find((r) => r.landed) ?? ordered[ordered.length - 1];
      const face = Math.max(...rows.map((r) => r.crest)) - Math.min(...rows.map((r) => r.low));
      const dir = unbrokenFirst ? -1 : 1; // the photo edge rises toward the unbroken side
      const photo = (e: Vec2[]): Vec2[] => e.map(([a, b]) => [foot.v + dir * a * face, foot.low + b * face]);
      fronts.push(`<figure><figcaption><b>${NAMES[I]} (${I})</b> from in front: dark line the crest top, blue the lip tip, grey the lowest water in front. The photos' lip edges are scaled to this ${face.toFixed(1)} m face: navy the dark tube (0.66 face heights along the line), orange the sunset lip (0.94). True scale, ±40 m around where the lip meets the water.</figcaption>${panel(foot.v - 40, foot.v + 40, -6, 10, 10, (X, Y) =>
        `<path d="${line(X, Y, rows.map((r) => [r.v, r.crest]))}" fill="none" stroke="#0b1d40" stroke-width="2"/>` +
        `<path d="${line(X, Y, rows.map((r) => [r.v, r.tip]))}" fill="none" stroke="#2f7fb8" stroke-width="2"/>` +
        `<path d="${line(X, Y, rows.map((r) => [r.v, r.low]))}" fill="none" stroke="#888" stroke-width="1"/>` +
        `<path d="${line(X, Y, photo(edges.dark))}" fill="none" stroke="#0b3a5c" stroke-width="3"/>` +
        `<path d="${line(X, Y, photo(edges.sunset))}" fill="none" stroke="#c9771d" stroke-width="3"/>`)}</figure>`);
    }
    fs.writeFileSync(OUT, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Barrel Anchors</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:16px;background:#fff;color:#222}figure{margin:0 0 14px}svg{max-width:100%;height:auto;border:1px solid #ccc;display:block}</style>
<h2>The three anchors side on</h2><p>The biggest 12 ft wave on the peak's ray, crest at 0 m, true scale, at the crest point whose lip is landing. Orange dots on the normal landing: Andrew's 29 Sep markup. Magenta on the heavy landing: the cyan tube's mouth, scaled to this tube.</p>
${sides.join('\n')}<h2>From in front: the end of the lip where it peels</h2>${fronts.join('\n')}</html>`);
  });
});
