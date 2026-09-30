import { describe, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, onsetPsi } from './breaking';
import { type Vec2, buildProfile } from './lipProfile';
import { psiStateLabel } from './overturn';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { sampleField, sampleOnset } from './reefField';

const OUT: string = import.meta.env.VITE_OVERTURN_VIEW_OUT ?? '';
// node:fs through a computed specifier: the project's typecheck has no Node types, and this viewer only runs under Vitest.
const nodeFs = (): Promise<{ writeFileSync(p: string, d: string): void }> => import(/* @vite-ignore */ ['node', 'fs'].join(':'));

/** One side view: the profile (water, the tube as air) over the sheet and the seabed along the peak's ray, true scale. */
function side(title: string, caption: string, sea: Vec2[], bed: Vec2[], pts: Vec2[]): string {
  const U0 = -30, U1 = 35, Y0 = -16, Y1 = 9, PX = 14, W = (U1 - U0) * PX, H = (Y1 - Y0) * PX;
  const X = (u: number) => ((u - U0) * PX).toFixed(1), Y = (y: number) => ((Y1 - y) * PX).toFixed(1);
  const path = (q: Vec2[]) => 'M' + q.map((p) => `${X(p[0])},${Y(p[1])}`).join('L');
  const xFront = pts[0][0], xBack = pts[pts.length - 1][0];
  const fill = (q: Vec2[]) => (q.length ? `<path d="${path(q)}L${X(q[q.length - 1][0])},${Y(Y0)}L${X(q[0][0])},${Y(Y0)}Z" fill="#1f4e9c" stroke="#1f4e9c" stroke-width="1.5"/>` : '');
  const behind = [...sea.filter((q) => q[0] <= xBack), pts[pts.length - 1]], ahead = [pts[0], ...sea.filter((q) => q[0] >= xFront)];
  return `<figure><figcaption><b>${title}</b> ${caption}</figcaption><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto;background:#eef3f8">
    ${fill(behind)}${fill(ahead)}<path d="${path(pts)}L${X(xBack)},${Y(Y0)}L${X(xFront)},${Y(Y0)}Z" fill="#1f4e9c" stroke="#1f4e9c" stroke-width="1.5"/>
    <path d="${path(pts)}" fill="none" stroke="#bdf0f7" stroke-width="1.4"/>
    <path d="${path(bed)}L${X(U1)},${Y(Y0)}L${X(U0)},${Y(Y0)}Z" fill="#8b6f4e"/>
    <line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#c33" stroke-dasharray="4 4"/></svg></figure>`;
}

describe.skipIf(!OUT)('the barrel from the maths, drawn from the code', () => {
  it('draws the tide × size table at the peak, and the collapse of the normal day', { timeout: 1_800_000 }, async () => {
    const fs = await nodeFs();
    const figs: string[] = [];
    const biggest = (ft: number) => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = ft; return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0); };
    const cases: [string, number, number][] = [['low tide', -1.5, 6], ['low tide', -1.5, 10], ['low tide', -1.5, 15], ['mid tide', 0, 8], ['mid tide', 0, 12], ['high tide', 1.5, 4], ['high tide', 1.5, 12]];
    for (const [tideName, tideM, ft] of cases) {
      const setup = peakSetup(ft, tideM);
      const rec = sampleOnset(setup.field, 0, 0)!, psi = onsetPsi(rec, 0, biggest(ft), DEFAULT_BREAK_PARAMS);
      const tau = peakLanding(psi, { setup }), st = peakStation(psi, tau, { setup });
      const prof = buildProfile(st.base, st.input, st.lip, st.frameBase), f = prof.frame;
      const sea: Vec2[] = []; for (let u = -60; u <= 70; u += 0.25) sea.push(st.base(u)); // past the frame both ways: the water fills it
      const f0 = sampleField(setup.field, 0, 0), bed: Vec2[] = [];
      for (let u = -30; u <= 35; u += 1) { const s = st.s0 + u; const g = sampleField(setup.field, f0.dirX * s, f0.dirZ * s); bed.push([u, -g.depth]); }
      figs.push(side(`${ft} ft, ${tideName}`, `ψ₀ ${psi.toFixed(3)}: ${psiStateLabel(psi)}. The lip lands ${((f.K[1] - f.P[1]) / (f.K[1] - f.F[1]) * 100).toFixed(0)}% of the way down, ${(f.P[0] - f.K[0]).toFixed(1)} m ahead of the crest.`, sea, bed, prof.points));
    }
    const mid = peakSetup(12, 0), psiN = onsetPsi(sampleOnset(mid.field, 0, 0)!, 0, biggest(12), DEFAULT_BREAK_PARAMS), tauN = peakLanding(psiN, { setup: mid });
    for (const dt of [-0.5, 0, 0.5, 1]) {
      const st = peakStation(psiN, tauN + dt, { setup: mid }), prof = buildProfile(st.base, st.input, st.lip, st.frameBase);
      const sea: Vec2[] = []; for (let u = -60; u <= 70; u += 0.25) sea.push(st.base(u)); // past the frame both ways: the water fills it
      const f0 = sampleField(mid.field, 0, 0), bed: Vec2[] = [];
      for (let u = -30; u <= 35; u += 1) { const s = st.s0 + u; const g = sampleField(mid.field, f0.dirX * s, f0.dirZ * s); bed.push([u, -g.depth]); }
      figs.push(side(`12 ft, mid tide, ${dt === 0 ? 'the lip landing' : `${dt > 0 ? '+' : ''}${dt} s`}`, `ψ₀ ${psiN.toFixed(3)}`, sea, bed, prof.points));
    }
    // The ψ₀ table at the peak (the biggest set wave, the three tides).
    const rows: string[] = [];
    const fields = [-1.5, 0, 1.5].map((tideM) => peakSetup(4, tideM).field);
    for (const ft of [4, 6, 8, 10, 12, 15]) {
      const cells = fields.map((fl) => { const p = onsetPsi(sampleOnset(fl, 0, 0)!, 0, biggest(ft), DEFAULT_BREAK_PARAMS); return `<td>${p.toFixed(3)}<br><small>${psiStateLabel(p)}</small></td>`; });
      rows.push(`<tr><th>${ft} ft</th>${cells.join('')}</tr>`);
    }
    const table = `<table border="1" cellpadding="4" style="border-collapse:collapse;margin:8px 0 16px"><tr><th></th><th>low tide</th><th>mid tide</th><th>high tide</th></tr>${rows.join('')}</table>`;
    fs.writeFileSync(OUT, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Womb Barrels</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:16px;background:#fff;color:#222}figure{margin:0 0 16px}</style>
<h2>The barrel from the maths, on the softened Womb</h2><p>From the game's own code: the biggest set wave at the peak for each tide and size, at the moment the lip lands, over the seabed it breaks on. True scale; still water dashed.</p>
<p><b>ψ₀ at the peak</b> (Pick &amp; Feddersen's number, from the reef where the wave breaks): below 0.02 no tube, 0.02–0.05 oval (4), 0.05–0.08 cylinder (5), 0.08–0.1 thrown out (6), past 0.1 a slab.</p>${table}
${figs.join('\n')}</html>`);
  });
});
