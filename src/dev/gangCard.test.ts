import { describe, expect, it } from 'vitest';
import { NICK_SIZE, REAL_SIZE, nameLayout } from './gangCard';

const crew = (xs: number[], y = 300) => xs.map((x, i) => ({ x, y, nickname: ['SHAZZA', 'GROMMET', 'T-BONE'][i], realName: ['Sharon', 'Bradley', 'Tom'][i] }));

describe('the names on the gang card (walking spec §6)', () => {
  it('sizes the nicknames at 7.5% of the frame’s height and the real names at 3.3%', () => {
    const l = nameLayout(crew([500, 960, 1420]), 1920, 1080);
    for (const n of l) {
      expect(n.nickSize).toBeCloseTo(NICK_SIZE * 1080, 6);
      expect(n.realSize).toBeCloseTo(REAL_SIZE * 1080, 6);
    }
    expect([NICK_SIZE, REAL_SIZE]).toEqual([0.075, 0.033]);
  });
  it('keeps each name inside the frame’s 4% margin and above its head', () => {
    const l = nameLayout(crew([60, 960, 1880], 120), 1920, 1080);
    for (const n of l) {
      expect(n.box.x0).toBeGreaterThanOrEqual(0.04 * 1920 - 1e-6);
      expect(n.box.x1).toBeLessThanOrEqual(0.96 * 1920 + 1e-6);
      expect(n.box.y0).toBeGreaterThanOrEqual(0.04 * 1080 - 1e-6);
    }
    const mid = nameLayout(crew([500, 960, 1420]), 1920, 1080);
    for (const [i, n] of mid.entries()) expect(n.box.y1).toBeLessThanOrEqual(300 + 1e-6 + 0 * i);
  });
  it('pushes names apart so no two overlap', () => {
    const l = nameLayout(crew([940, 960, 980]), 1920, 1080);
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const a = l[i].box, b = l[j].box;
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      expect(overlap, `${i} and ${j}`).toBe(false);
    }
  });
  it('tilts each nickname a little, alternately, like hand-painted signs', () => {
    const l = nameLayout(crew([500, 960, 1420]), 1920, 1080);
    for (const n of l) expect(Math.abs(n.angleDeg)).toBeGreaterThan(1);
    expect(Math.sign(l[0].angleDeg)).not.toBe(Math.sign(l[1].angleDeg));
  });
});
