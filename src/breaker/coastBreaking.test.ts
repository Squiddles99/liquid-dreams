import { beforeAll, describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_COAST_PARAMS } from '../seabed/coastFeatures';
import { buildCoastMap, wombHalo } from '../seabed/coastMap';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { coastBreakingCells, footprintBreakHeight, reportBreaking } from './coastBreaking';
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
  for (const ft of [4, 6, 8]) {
    it(`at ${ft} ft every breaking cell is in a break's footprint, the shore band (where the shelf breaks the set, + 20 m) or (from 8 ft) the Cobblestones approach`, () => {
      const r = at(ft);
      // Carried at 8 ft (inner-shelf Task 1): 3 cells at z 472, 110–118 m off the beach (breaking ratio 1.004–1.008),
      // inside the Womb's south halo, where the basin's fade back to the shelf focuses the set; the halo is the Womb's
      // water and does not move (Fable's call). Inside it only, and no more of them.
      const halo = r.closeouts.filter(([, z]) => wombHalo(z) > 0);
      expect(r.cells.elsewhere - halo.length, `closeouts at ${JSON.stringify(r.closeouts)}`).toBe(0);
      expect(halo.length).toBeLessThanOrEqual(ft === 8 ? 3 : 0);
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

  it('footprintBreakHeight is where the Bombie starts to break (the bursts’ gate): between the 6 and 8 ft sets', () => {
    const h = footprintBreakHeight(coast, 'bombie', DEFAULT_BREAK_PARAMS);
    expect(h).toBeGreaterThan(setWaveHeight(6));
    expect(h).toBeLessThanOrEqual(setWaveHeight(8));
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
