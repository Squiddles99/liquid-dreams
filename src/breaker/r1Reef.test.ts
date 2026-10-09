import { describe, expect, it } from 'vitest';
import { TIP } from '../seabed/wombReef';
import { SWELL_BANDS } from '../frontend/sessionSetup';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { sampleField } from './reefField';
import { firstBreakDepth, setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

// The Womb on the real shelf (womb-retune, 2026-10-09): the coast field seeds the reef field (the swell dial read at the
// coast seed) and the take-off sits 224 m off the beach (wombReef.TIP). R1's "basin at one depth" is gone: the bed outside
// the reef is the coast's. Measured in docs/superpowers/evidence/womb-retune/pins-225.txt.
const band = (label: string) => SWELL_BANDS.find((b) => b.label === label)!;
const TIDES_M = [-0.5, -0.25, 0, 0.5] as const;

describe('the swell on the real shelf (womb-retune)', () => {
  it('reaches the take-off at the measured arrival: travel bearing 65° ± 2° 30 m seaward and south of the tip (Pumping, mid tide)', { timeout: 300_000 }, () => {
    const f = sampleField(coastReefField({ periodS: band('Pumping').periodS }), TIP[0] - 30, TIP[1] + 30);
    const bearing = (Math.atan2(f.dirX, -f.dirZ) * 180) / Math.PI;
    expect(Math.abs(bearing - 65)).toBeLessThanOrEqual(2);
  });
});

describe('the break starts on the ledge (R1 §2, per offered band)', () => {
  // Still-water depth at the first break, every select tide: the measured worst + ~0.5 m (Solid 4.0, Pumping 4.0, Big 5.5,
  // Huge 6.6).
  const MAX_DEPTH: Record<string, number> = { Solid: 4.5, Pumping: 4.5, Big: 6, Huge: 7 };
  it.each(Object.keys(MAX_DEPTH))('%s first breaks on the face at every tide', { timeout: 900_000 }, (label) => {
    const b = band(label);
    for (const tideM of TIDES_M) {
      const fb = firstBreakDepth(coastReefField({ periodS: b.periodS, tideM }), setWaveHeight(b.ft), DEFAULT_BREAK_PARAMS);
      expect(fb, `${label} ${tideM} m: breaks within reach of the peak`).not.toBeNull();
      expect(fb!.depth, `${label} ${tideM} m`).toBeLessThanOrEqual(MAX_DEPTH[label]);
    }
  });
  it('Pumping at mid tide first breaks within 5 m seaward of the tip', { timeout: 300_000 }, () => {
    const fb = firstBreakDepth(coastReefField({ periodS: band('Pumping').periodS }), setWaveHeight(band('Pumping').ft), DEFAULT_BREAK_PARAMS)!;
    expect(fb.d).toBeLessThanOrEqual(5);
  });
});
