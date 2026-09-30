import { describe, expect, it } from 'vitest';
import { type RefreshInput, createRefreshState, decideRefresh } from './cloudRefresh';

const SUN: [number, number, number] = [0.8, 0.15, -0.55];
const at = (simTimeS: number, camera: [number, number, number] = [0, 2, 0], sun = SUN): RefreshInput => ({ simTimeS, sun, camera });

describe('decideRefresh', () => {
  it('marches everything first, then nothing while nothing moves (paused)', () => {
    const s = createRefreshState();
    expect(decideRefresh(s, at(30))).toBe('full');
    expect(decideRefresh(s, at(30))).toBe('none');
  });

  it('keeps marching slices while the sim runs, and settles 16 slices after it stops', () => {
    const s = createRefreshState();
    decideRefresh(s, at(30));
    for (let k = 1; k <= 10; k++) expect(decideRefresh(s, at(30 + k / 60))).toBe('slice');
    const stopped = at(30 + 10 / 60);
    const after = Array.from({ length: 20 }, () => decideRefresh(s, stopped));
    // The last moving frame marched one slice in the final state; 15 more cover the other texels.
    expect(after.filter((d) => d === 'slice')).toHaveLength(15);
    expect(after.slice(15).every((d) => d === 'none')).toBe(true);
  });

  it('re-marches slices while the camera moves with the sim paused (final review I3)', () => {
    const s = createRefreshState();
    decideRefresh(s, at(30));
    for (let k = 1; k <= 40; k++) expect(decideRefresh(s, at(30, [k * 5, 2, 0]))).toBe('slice');
  });

  it('never marches everything for steady travel, however far (no spike every 200 m)', () => {
    const s = createRefreshState();
    decideRefresh(s, at(30));
    const d = Array.from({ length: 200 }, (_, k) => decideRefresh(s, at(30 + k / 60, [k * 5, 2, 0])));
    expect(d).not.toContain('full');
  });

  it('marches everything after a jump: the camera teleports, the clock jumps, the sun swings, the weather changes', () => {
    const s = createRefreshState();
    decideRefresh(s, at(30));
    expect(decideRefresh(s, at(30, [300, 2, 0]))).toBe('full');
    expect(decideRefresh(s, at(40, [300, 2, 0]))).toBe('full');
    const swung: [number, number, number] = [0.8, 0.17, -0.55];
    expect(decideRefresh(s, at(40, [300, 2, 0], swung))).toBe('full');
    s.dirty = true;
    expect(decideRefresh(s, at(40, [300, 2, 0], swung))).toBe('full');
    expect(decideRefresh(s, at(40, [300, 2, 0], swung))).toBe('none');
  });
});
