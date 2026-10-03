// src/frontend/boardPick.test.ts
import { describe, expect, it } from 'vitest';
import { PRESETS, type PresetName, boardsFor } from '../surfer/presets';
import { type Fit, boardBars, fitOf, inchFraction, lengthLabel, pickBoard, reasonLine, specsLine } from './boardPick';

const RANK: Record<Fit, number> = { IDEAL: 0, GOOD: 1, OK: 2 };
const NAMES: PresetName[] = ['female', 'male', 'grommet'];

describe('the board pick (dune select spec §8)', () => {
  it('fits boards at the band edges', () => {
    expect(fitOf('thruster', 2, 12)).toBe('IDEAL');
    expect(fitOf('thruster', 6, 12)).toBe('IDEAL');
    expect(fitOf('thruster', 6.5, 12)).toBe('GOOD');
    expect(fitOf('thruster', 1.5, 12)).toBe('GOOD');
    expect(fitOf('thruster', 1, 12)).toBe('OK');
    expect(fitOf('thruster', 9, 12)).toBe('OK');
    expect(fitOf('stepUp', 6, 12)).toBe('IDEAL');
    expect(fitOf('stepUp', 5, 12)).toBe('GOOD');
    expect(fitOf('stepUp', 4, 12)).toBe('OK');
    expect(fitOf('bodyboard', 1.5, 9)).toBe('IDEAL');
    expect(fitOf('bodyboard', 7, 14)).toBe('IDEAL');
    expect(fitOf('bodyboard', 7, 12)).toBe('GOOD');
    expect(fitOf('bodyboard', 9, 16)).toBe('GOOD');
  });
  it('always gives Grommet his bodyboard', () => {
    for (let ft = 1; ft <= 12; ft += 0.5) expect(pickBoard('grommet', ft, 14)).toBe('bodyboard');
  });
  it('picks one board a rider owns and fits best, for every condition', () => {
    for (const name of NAMES) for (let ft = 1; ft <= 12; ft += 0.5) for (let p = 8; p <= 20; p++) {
      const pick = pickBoard(name, ft, p), quiver = boardsFor(PRESETS[name]);
      expect(quiver).toContain(pick);
      for (const k of quiver) expect(RANK[fitOf(pick, ft, p)]).toBeLessThanOrEqual(RANK[fitOf(k, ft, p)]);
    }
  });
  it('breaks ties by taste: the thruster before the bodyboard', () => {
    expect(pickBoard('female', 4, 15)).toBe('thruster');
    expect(pickBoard('male', 4, 15)).toBe('thruster');
    expect(pickBoard('female', 7, 15)).toBe('stepUp');
  });
  it('says why, naming the board and the size', () => {
    const line = reasonLine('female', 'thruster', 4, 3);
    expect(line).toMatch(/thruster/i);
    expect(reasonLine('female', 'thruster', 4, 3)).toBe(line);
  });
  it('rates Paddle, Hold and Turn from 1 to 5', () => {
    for (const name of NAMES) for (const kind of boardsFor(PRESETS[name])) {
      const b = boardBars(name, kind);
      for (const v of [b.paddle, b.hold, b.turn]) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(5); }
    }
    for (const name of ['female', 'male'] as const) {
      expect(boardBars(name, 'thruster').turn).toBeGreaterThan(boardBars(name, 'stepUp').turn);
      expect(boardBars(name, 'stepUp').paddle).toBeGreaterThanOrEqual(boardBars(name, 'thruster').paddle);
      expect(boardBars(name, 'stepUp').hold).toBeGreaterThan(boardBars(name, 'thruster').hold);
    }
    expect(boardBars('grommet', 'bodyboard').turn).toBe(5);
  });
  it('formats lengths and fractions of an inch', () => {
    expect(lengthLabel(70)).toBe('5\'10"');
    expect(lengthLabel(76)).toBe('6\'4"');
    expect(inchFraction(18.75)).toBe('18¾');
    expect(inchFraction(2.3125)).toBe('2 5⁄16');
    expect(inchFraction(19)).toBe('19');
    expect(inchFraction(2.625)).toBe('2⅝');
    expect(inchFraction(2.5)).toBe('2½');
  });
  it('writes the specs line', () => {
    expect(specsLine('female', 'thruster')).toBe('5\'10" × 18¾" × 2 5⁄16" · squash tail · thruster');
    expect(specsLine('female', 'stepUp')).toBe('6\'4" × 19" × 2½" · round pin tail · thruster');
    expect(specsLine('grommet', 'bodyboard')).toBe('38" × 20" × 2½" · crescent tail');
  });
});
