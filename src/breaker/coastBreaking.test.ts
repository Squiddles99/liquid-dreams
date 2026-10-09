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

const at = (ft: number) => reportBreaking(coast, coastBreakingCells(coast, setWaveHeight(ft), DEFAULT_BREAK_PARAMS));

describe('no closeout: a set breaks only at the four breaks and on the beach (lineup truth, Task 4)', () => {
  for (const ft of [4, 6, 8]) {
    it(`at ${ft} ft every breaking cell is in a break's footprint, the 60 m shore band or (from 8 ft) the Cobblestones approach`, () => {
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
