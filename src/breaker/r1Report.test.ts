import { describe, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { REFRACT_FLOOR_M, computeReefField } from './reefField';
import { TIDES, type Tide, firstBreakDepth, leftStretches, setWaveHeight } from './reefReport';

/**
 * R1's reef report (spec 2026-10-06-r1-the-ride §7.2), off by default:
 * R1_REPORT=1 npx vitest run src/breaker/r1Report.test.ts --silent=false
 * Per size and tide: the first break on the peak's ray (m seaward of the peak, still-water depth) and the left's first and
 * second sections (peel m/s, hollowness 0–1), on the field as the game bakes it.
 */
describe.skipIf(!process.env.R1_REPORT)('R1 reef report', () => {
  it('prints the table', () => {
    const bed = downsample(buildBathymetry(), 2), rows = ['size tide  first break (d m, depth m)  first (peel, hollow)  second (peel, hollow)'];
    for (const tide of Object.keys(TIDES) as Tide[]) {
      const f = computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[tide], smooth: true, refractFloorM: REFRACT_FLOOR_M });
      for (const ft of [4, 6, 8, 10, 12]) {
        const H = setWaveHeight(ft), fb = firstBreakDepth(f, H, DEFAULT_BREAK_PARAMS);
        const st = leftStretches(f, H, NORTH_LEDGE, { first: [0], second: [1] }, DEFAULT_BREAK_PARAMS);
        const sec = (s: typeof st.first) => (s ? `${s.peel.toFixed(1).padStart(5)} ${s.hollow.toFixed(2)}` : '   none   ');
        rows.push(`${String(ft).padStart(3)} ft ${tide.padEnd(4)}  ${fb ? `${fb.d.toFixed(1).padStart(6)} ${fb.depth.toFixed(1).padStart(5)}` : '  none      '}               ${sec(st.first)}            ${sec(st.second)}`);
      }
    }
    console.log(rows.join('\n'));
  });
});
