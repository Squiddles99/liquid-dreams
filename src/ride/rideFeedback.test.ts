import { describe, expect, it } from 'vitest';
import { newRumble, rumbleFor } from './rideFeedback';
import { playRumble } from './rideInput';

describe('rumble follows the load (Andrew 2026-10-14)', () => {
  it('the strong motor carries the extra load: none at 1 g, full by 1.8 g', () => {
    expect(rumbleFor(1, newRumble(), 0)!.strong).toBe(0);
    expect(rumbleFor(1.4, newRumble(), 0)!.strong).toBeCloseTo(0.5);
    expect(rumbleFor(2.5, newRumble(), 0)!.strong).toBe(1);
  });
  it('one tick per load peak over 1.2 g: the moment to extend', () => {
    const s = newRumble();
    expect(rumbleFor(1.3, s, 0)!.weak).toBeGreaterThan(0);
    expect(rumbleFor(1.35, s, 0.1)!.weak).toBe(0); // same peak, 40 ms tick over
    rumbleFor(1.0, s, 0.2); // the load falls away
    expect(rumbleFor(1.3, s, 0.3)!.weak).toBeGreaterThan(0); // the next peak
  });
  it('chunks of 100 ms: nothing new due inside one, unless a tick starts', () => {
    const s = newRumble();
    rumbleFor(1.1, s, 0);
    expect(rumbleFor(1.1, s, 0.05)).toBeNull();
    expect(rumbleFor(1.3, s, 0.06)).not.toBeNull();
  });
  it('no pad, or a pad that went away: never throws', () => {
    expect(() => playRumble(1, 1, 100)).not.toThrow();
  });
});
