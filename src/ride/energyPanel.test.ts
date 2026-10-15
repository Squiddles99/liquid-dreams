import { describe, expect, it } from 'vitest';
import { dragSplit } from './EnergyPanel';
import { flatWater } from './water';
import { startBody } from './ridePhysics';

describe('the energy panel\'s drag readout (ride-speed spec §6)', () => {
  it('plain riding: board drag only', () => {
    const b = startBody(0, 0, 0, flatWater());
    const d = dragSplit(b, 10);
    expect(d.board).toBeCloseTo(0.03 * 10 + 0.012 * 100, 6);
    expect(d.tail + d.body + d.hand).toBe(0);
  });
  it('a full tall stall adds tail and body drag; a hand stall adds the hand', () => {
    const b = startBody(0, 0, 0, flatWater());
    b.stall = 1;
    expect(dragSplit(b, 10).tail).toBeCloseTo(0.03 * 4 * 10, 6);
    expect(dragSplit(b, 10).body).toBeCloseTo(0.012 * 0.5 * 100, 6);
    b.hand = 1;
    expect(dragSplit(b, 8).hand).toBeCloseTo((0.5 * 1025 * 0.004 * 64) / 55, 6);
  });
});
