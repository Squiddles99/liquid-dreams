import { describe, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_REEF_PARAMS, type ReefParams } from '../seabed/wombReef';
import { computeReefField } from './reefField';
import { BREAK_NEAR_PEAK_M, type ReefCard, TIDES, type Tide, evaluateReef, firstBreakSeaward, formatCard, setWaveHeight } from './reefReport';

// The reef build's tuning search (plan 2026-10-02 Task 3): every candidate face and slope scored on the spec's criteria.
// The widths run past the spec's 30–40 m (to 110 m) to map the trade-off between where 12 ft breaks and how steep the face
// the barrel reads its ψ from is (plan Task 3 ruling).
describe.skipIf(!import.meta.env.VITE_REEF_TUNE)('tune the reef face and slope', () => {
  it('scores the candidates', { timeout: 7_200_000 }, () => {
    const rows: { p: ReefParams; card: ReefCard; off: number[]; score: number }[] = [];
    for (const faceBaseDepthM of [11, 12, 13, 14]) for (const faceWidthM of [25, 40, 55, 80, 110]) for (const slopeDepthM of [20, 22]) {
      const p: ReefParams = { ...DEFAULT_REEF_PARAMS, faceBaseDepthM, faceWidthM, slopeDepthM, slopeEndM: 200 };
      const bed = downsample(buildBathymetry(p), 2);
      const fields = Object.fromEntries((Object.keys(TIDES) as Tide[]).map((t) => [t, computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t] })])) as Record<Tide, ReturnType<typeof computeReefField>>;
      const card = evaluateReef(fields);
      const off = [[215, 15], [235, 15], [225, 12], [225, 18]].map(([fromDeg, periodS]) => firstBreakSeaward(computeReefField({ bed, periodS, fromDeg, tideM: 0 }), setWaveHeight(12)));
      const score = Object.values(card.passes).filter(Boolean).length + (off.every((d) => d <= BREAK_NEAR_PEAK_M) ? 1 : 0);
      rows.push({ p, card, off, score });
      console.log(`face ${faceBaseDepthM} m over ${faceWidthM} m, slope ${slopeDepthM} m: score ${score}/7; off-default 12 ft first breaks ${off.map((d) => d.toFixed(1)).join(', ')} m\n${formatCard(card)}\n`);
    }
    rows.sort((a, b) => b.score - a.score);
    console.log(`BEST: ${rows.slice(0, 5).map((r) => `${r.p.faceBaseDepthM}/${r.p.faceWidthM}/${r.p.slopeDepthM} (${r.score}/7)`).join('; ')}`);
  });
});
