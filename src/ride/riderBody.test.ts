import { describe, expect, it } from 'vitest';
import { COM_RATE, COM_REST, PUMP_EFF, PUMP_POWER_WKG, comTarget, compressionOf, newRiderState, pumpEnergy, restLoad, stepCom } from './riderBody';

describe('the rider\'s centre of mass (ride-speed spec §2)', () => {
  it('relaxed trim is 0.6; LT lowers it to 0, RT raises it to 1', () => {
    expect(comTarget(0)).toBeCloseTo(COM_REST);
    expect(comTarget(1)).toBeCloseTo(0);
    expect(comTarget(-1)).toBeCloseTo(1);
  });
  it('compression is derived: 0 at trim, +1 full tuck, −1 standing tall', () => {
    expect(compressionOf(0.6)).toBeCloseTo(0);
    expect(compressionOf(0)).toBeCloseTo(1);
    expect(compressionOf(1)).toBeCloseTo(-1);
    expect(compressionOf(0.3)).toBeCloseTo(0.5);
  });
  it('never moves faster than the legs can (COM_RATE)', () => {
    let h = 0.6;
    for (let i = 0; i < 6; i++) {
      const next = stepCom(h, 0, 1 / 60);
      expect(h - next).toBeLessThanOrEqual(COM_RATE / 60 + 1e-12);
      h = next;
    }
    expect(stepCom(0.5, 0.5, 1 / 60)).toBe(0.5);
  });
  it('a new rider stands relaxed, no stall', () => {
    const r = newRiderState(1.65, 55);
    expect(r.comH).toBe(COM_REST);
    expect(r.stall).toBe(0);
    expect(r.stallW.tall).toBe(1);
  });
});

describe('the pump is a variable-length pendulum (Kogelbauer 2023)', () => {
  it('no extra load, no work: a straight crouch or stand costs and gives nothing', () => {
    expect(pumpEnergy(1, 1, 0.5, 1 / 60, PUMP_EFF)).toBe(0);
    expect(pumpEnergy(1, 1, -0.5, 1 / 60, PUMP_EFF)).toBe(0);
  });
  it('rising under extra load gains (with the losses), lowering under it gives back in full', () => {
    const up = pumpEnergy(2, 1, 0.05, 1 / 60, PUMP_EFF), down = pumpEnergy(2, 1, -0.05, 1 / 60, PUMP_EFF);
    expect(up).toBeCloseTo(Math.min(1 * 9.81 * 0.35 * 0.05 * 0.8, PUMP_POWER_WKG / 60), 9);
    expect(down).toBeCloseTo(-1 * 9.81 * 0.35 * 0.05, 9);
  });
  it('never more than the legs’ power', () => {
    expect(pumpEnergy(10, 1, 1, 1 / 60, 1)).toBeCloseTo(PUMP_POWER_WKG / 60, 9);
  });
  it('rest load is gravity’s share normal to the face', () => {
    expect(restLoad(0, 0)).toBe(1);
    expect(restLoad(0.75, 0)).toBeCloseTo(0.8, 6);
  });
});
