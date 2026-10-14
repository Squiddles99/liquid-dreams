import { afterEach, describe, expect, it } from 'vitest';
import { TIP, LEFT_BEARING_DEG } from '../seabed/wombReef';
import { STAND_AHEAD_M, STOOD_PHASE, frontWeight, sectionPhase, setStandAhead, standAhead } from './wombSection';
import { frontStanding } from './setWaveModel';

// Andrew 2026-10-14 (moment 1791986608, 7 ft 225/15 tide -0.25): "the almost cube-like lump of wave face in front of the
// breaking lip". At the left's end the curl stalls (the station 1.3 m ahead waits 3.45 s): the stand-up read by the time
// alone fell from the curl's to the swell's in 5 m along the crest (phase 0.64 -> 0.07): the block's side. standAheadM: a
// station waiting its turn stands at least by its distance from the curl's front, 1 there easing to 0 over the dial.
const at = (along: number, cross = 0): [number, number] => {
  const r = (LEFT_BEARING_DEG * Math.PI) / 180;
  return [TIP[0] + along * Math.sin(r) + cross * Math.cos(r), TIP[1] - along * Math.cos(r) + cross * Math.sin(r)];
};
afterEach(() => setStandAhead(STAND_AHEAD_M));

describe('the stand-up eases off by distance from the curl front (standAheadM)', () => {
  it('dial 0 is today, bit-equal', () => {
    setStandAhead(0);
    const [x, z] = at(135);
    expect(standAhead(x, z, 133.7)).toBe(0);
    for (const u of [0, 0.5, 1, 3.45, 6, 9]) expect(frontWeight(u, 1, standAhead(x, z, 133.7))).toBe(frontWeight(u, 1));
  });
  it('down the left: 1 at the front, 0.5 at half the dial, 0 past it and behind the front, monotone', () => {
    setStandAhead(20);
    const front = 120;
    const s = (d: number) => { const [x, z] = at(front + d); return standAhead(x, z, front); };
    expect(s(0)).toBeCloseTo(1, 6);
    expect(Math.abs(s(10) - 0.5)).toBeLessThanOrEqual(0.05);
    expect(s(20)).toBe(0);
    expect(s(-5)).toBe(0);
    let last = 1;
    for (let d = 0; d <= 25; d += 0.5) { expect(s(d)).toBeLessThanOrEqual(last + 1e-12); last = s(d); }
    // No front known (the curl hasn't broken yet): nothing.
    const [x, z] = at(front + 2);
    expect(standAhead(x, z, undefined)).toBe(0);
  });
  it("at the take-off and on the right it is off (the shoulder's region)", () => {
    setStandAhead(20);
    const [x0, z0] = at(0);
    expect(standAhead(x0, z0, -2)).toBe(0);
  });
  it("Andrew's stalled curl: the station 1.3 m ahead, waiting 3.45 s, stands up with the curl (the drawn section; the sheet as today)", () => {
    setStandAhead(20);
    const [x, z] = at(135), ahead = standAhead(x, z, 133.7);
    expect(frontWeight(3.45, 1, ahead)).toBeGreaterThanOrEqual(0.95);
    expect(sectionPhase({ r: 0.5, tb: null, until: 3.45, psi: 0.3, periodS: 15, x, z, frontAlong: 133.7 } as never, { ribbonOnset: 0.4 })).toBeGreaterThanOrEqual(0.95 * STOOD_PHASE);
    // The sheet's front lean keeps the time's stand-up (the distance on it folded the sheet at the face's foot).
    const before = frontStanding(null, 0.5, 0.4, 3.45, 1);
    setStandAhead(0);
    expect(frontStanding(null, 0.5, 0.4, 3.45, 1)).toBe(before);
  });
});
