import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { minRibbonHeight } from '../breaker/crestTrace';
import { sampleField } from '../breaker/reefField';
import { setWaveHeight } from '../breaker/reefReport';
import { type ActiveWave, type WaveContext, fieldBreakingHeight } from '../breaker/setWaveModel';
import { coastReefField } from '../breaker/testField';
import { crestLineRows } from './crestLineProbe';

// womb-story Task 0 Step 1: the probe's depth (the still water under the station, tide in) and hmin (the ray's running
// shallowest) columns read back the field at the station.
describe('crestLineProbe', () => {
  it('reads the depth and hmin under every station', () => {
    const field = coastReefField({ periodS: 14, fromDeg: 270, tideM: 0.5 });
    const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const wave: ActiveWave = { arrivalS: 0, heightM: setWaveHeight(7), omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
    const P = DEFAULT_BREAK_PARAMS;
    const rows = crestLineRows({ field, ctx, waves: [wave], t: 2, params: P, minHeightM: minRibbonHeight(fieldBreakingHeight(field, P), P), offshoreMs: 0 });
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      const f = sampleField(field, r.x, r.z);
      expect(r.depth).toBeCloseTo(f.depth, 6);
      expect(r.hmin).toBeCloseTo(f.hmin, 6);
      expect(r.depth).toBeGreaterThan(0);
    }
  }, 60_000);
});
