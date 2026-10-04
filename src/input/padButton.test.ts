import { describe, expect, it } from 'vitest';
import { buttonDown } from './padButton';

describe('a pad button is down by its flag or its value (Andrew’s Bluetooth Xbox pad: LB, RB and View were dead)', () => {
  it('counts either', () => {
    expect(buttonDown({ pressed: true, value: 0 })).toBe(true);
    expect(buttonDown({ pressed: false, value: 1 })).toBe(true);
    expect(buttonDown({ pressed: false, value: 0.3 })).toBe(false);
  });
});
