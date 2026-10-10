import { beforeAll, describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_COAST_PARAMS } from '../seabed/coastFeatures';
import { buildCoastMap } from '../seabed/coastMap';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { coastBreakingCells, reportBreaking } from './coastBreaking';
import { type CoastField, computeCoastField } from './coastField';
import { REFRACT_FLOOR_M } from './reefField';
import { setWaveHeight } from './reefReport';

// Spec §4.4: the real coast map, mid tide, a 15 s south-westerly as the game solves it.
let coast: CoastField;
beforeAll(() => {
  const reef = downsample(buildBathymetry(), 4);
  coast = computeCoastField({ bed: buildCoastMap(reef, DEFAULT_COAST_PARAMS), periodS: 15, fromDeg: 225, tideM: 0, refractFloorM: REFRACT_FLOOR_M });
}, 120_000);

const at = (ft: number) => { const H = setWaveHeight(ft); return reportBreaking(coast, coastBreakingCells(coast, H, DEFAULT_BREAK_PARAMS), H, DEFAULT_BREAK_PARAMS); };

describe('no closeout: a set breaks only at the four breaks and on the beach (lineup truth, Task 4)', () => {
  // Carried at 8 ft (shelf-polish Task 5): 146 cells 69–189 m off the beach at z −988…−850 (and 3 at z ≈ 450), on the
  // hand-set 9 m inner shelf, flat to 256 m out on those rows, where the coast field focuses the set (amp 1.77–1.92, 2.54):
  // H·amp 8.1–8.4 m breaks there, beyond the band where the shelf breaks the unfocused set (6.5 m deep, 68–90 m out).
  // The fix is the bed's (a deeper inner shelf there, or the focus's source): Andrew's call (tools/_shoreBand.ts).
  for (const ft of [4, 6, 8]) {
    it(`at ${ft} ft every breaking cell is in a break's footprint, the shore band (where the shelf breaks the set, + 20 m) or (from 8 ft) the Cobblestones approach`, () => {
      const r = at(ft);
      expect(r.cells.elsewhere, `closeouts at ${JSON.stringify(r.closeouts)}`).toBe(0);
      expect(r.cells.shore).toBeGreaterThan(0);
      expect(r.cells.lefthanders).toBeGreaterThan(0);
      expect(r.cells.ellensbrook).toBeGreaterThan(0);
    });
  }

  it('the Bombie stands nothing up at 4 and 6 ft, and breaks at 8 ft', () => {
    expect(at(4).cells.bombie).toBe(0);
    expect(at(6).cells.bombie).toBe(0);
    expect(at(8).cells.bombie).toBeGreaterThan(0);
  });

  it('the Bombie breaks at 10 ft as an A-frame: ≥ 80 m of crest', () => {
    const r = at(10);
    expect(r.cells.bombie).toBeGreaterThan(0);
    expect(r.bombieCrestM).toBeGreaterThanOrEqual(80);
  });

  // Ruling (Task 4): a 10 ft set (5.7 m) breaks in 7–9 m of water, which the survey puts 300–750 m off the whole beach,
  // so from 10 ft the inside breaks (whitewater), as on the real coast on a big day; the maps are in
  // docs/superpowers/evidence/lineup-truth/t4-breaking.txt. Here only: it stays a minority of the sea.
  it('at 10 ft the breaking outside the breaks stays under 2 % of the coast map\'s sea', () => {
    const r = at(10), sea = coast.depth.filter((d) => d > 1).length;
    expect(r.cells.elsewhere / sea).toBeLessThan(0.02);
  });
});
