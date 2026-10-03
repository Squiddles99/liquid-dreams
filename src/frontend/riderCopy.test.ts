// src/frontend/riderCopy.test.ts
import { describe, expect, it } from 'vitest';
import { FIRST_PRESET, presetById } from './sessionSetup';
import {
  RIDER_COPY, RIDER_ORDER, chooseLine, crewNote, fillLine, ridesLabel, sizeBandOf, sizeWords, situationOf, stanceLabel,
  type SizeBand, type Situation,
} from './riderCopy';

const BANDS: SizeBand[] = ['small', 'fun', 'solid', 'big'];
const SITUATIONS: Situation[] = ['glassy', 'offshore', 'onshore', 'small', 'solid', 'big', 'wet', 'golden', 'default'];

describe('the riders\' copy (dune select spec §4.2.1, §8)', () => {
  it('lists the roster T-Bone, Shazza, Grommet', () => expect(RIDER_ORDER).toEqual(['male', 'female', 'grommet']));
  it('takes the stance and the boards from the presets', () => {
    expect(stanceLabel('regular')).toBe('Natural');
    expect(stanceLabel('goofy')).toBe('Goofy');
    expect(ridesLabel('female')).toBe('Shortboard, step-up');
    expect(ridesLabel('grommet')).toBe('Bodyboard');
  });
  it('has every field for every rider, three or more lines a band naming the board, two or more a situation', () => {
    for (const name of RIDER_ORDER) {
      const c = RIDER_COPY[name];
      for (const f of [c.style, c.loves, c.pickLine]) expect(f.length).toBeGreaterThan(3);
      for (const band of BANDS) {
        expect(c.boardLines[band].length, `${name} ${band}`).toBeGreaterThanOrEqual(3);
        for (const l of c.boardLines[band]) expect(l, `${name} ${band}: ${l}`).toMatch(/\{board\}|\{Board\}/);
      }
      for (const sit of SITUATIONS) expect(c.situationLines[sit].length, `${name} ${sit}`).toBeGreaterThanOrEqual(2);
      expect(c.teaseLines.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('says sizes the way a surfer does', () => {
    expect(sizeWords(4)).toBe('four foot');
    expect(sizeWords(3.5)).toBe('three and a half foot');
    expect(sizeWords(12)).toBe('twelve foot');
    expect(sizeWords(1)).toBe('one foot');
  });
  it('bands sizes for the lines', () => {
    expect(sizeBandOf(2.5)).toBe('small');
    expect(sizeBandOf(4)).toBe('fun');
    expect(sizeBandOf(5.5)).toBe('solid');
    expect(sizeBandOf(9)).toBe('big');
  });
  it('fills a line, capitalising {Board} and {Size}', () => {
    expect(fillLine('Clean {size}. {Board}, easy.', { size: 'four foot', board: 'thruster' })).toBe('Clean four foot. Thruster, easy.');
    expect(fillLine('{Size} and hollow.', { size: 'six foot' })).toBe('Six foot and hollow.');
    expect(fillLine('Bit brave, {name}.', { name: 'Shaz' })).toBe('Bit brave, Shaz.');
  });
  it('chooses a line by seed, the same every time', () => {
    const list = ['a', 'b', 'c'];
    expect(chooseLine(list, 7)).toBe(chooseLine(list, 7));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => chooseLine(list, s))).size).toBeGreaterThan(1);
  });
  it('always chooses a line from the list, for every seed', () => {
    const list = ['a', 'b', 'c'];
    for (let seed = -50; seed < 1000; seed++) expect(list, `seed ${seed}`).toContain(chooseLine(list, seed));
  });
  it('finds the situation a change makes', () => {
    const w = presetById(FIRST_PRESET)!.setup;
    expect(situationOf(w, 'wind')).toBe('offshore');
    expect(situationOf({ ...w, wind: 0 }, 'wind')).toBe('glassy');
    expect(situationOf({ ...w, wind: 5 }, 'wind')).toBe('onshore');
    expect(situationOf({ ...w, swellFt: 2.5 }, 'swell')).toBe('small');
    expect(situationOf({ ...w, swellFt: 9 }, 'swell')).toBe('big');
    expect(situationOf({ ...w, sky: 'showers' }, 'sky')).toBe('wet');
    expect(situationOf({ ...w, timeStop: 0 }, 'time')).toBe('golden');
    expect(situationOf(w, 'month')).toBe('default');
  });
  it('notes the crew paddles out together', () => {
    expect(crewNote('female')).toBe('The crew always paddles out together: T-Bone and Grommet surf beside you.');
    expect(crewNote('grommet')).toBe('The crew always paddles out together: T-Bone and Shazza surf beside you.');
  });
});
