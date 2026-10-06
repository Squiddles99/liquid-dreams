import { describe, expect, it } from 'vitest';
import { PLATE_ASPECT, backdropFade, coverUV, easeToward, insideLayer, layerUV, windDrive } from './backdropMath';

const KN = 1 / 1.943844; // m/s per knot

describe('coverUV: the painting covers the screen, anchored bottom-right, never stretched (spec §2)', () => {
  it('is the identity at 16:9', () => {
    expect(coverUV(0.25, 0.75, PLATE_ASPECT)).toEqual([0.25, 0.75]);
  });
  it('crops the top on a wider screen and keeps the full width (21:9)', () => {
    const a = 21 / 9, [u0, v0] = coverUV(0, 0, a), [u1, v1] = coverUV(1, 1, a);
    expect([u0, u1]).toEqual([0, 1]);
    expect(v1).toBeCloseTo(1, 9);
    expect(v0).toBeCloseTo(1 - PLATE_ASPECT / a, 9);
  });
  it('crops the left on a narrower screen and keeps the full height (4:3)', () => {
    const a = 4 / 3, [u0, v0] = coverUV(0, 0, a), [u1, v1] = coverUV(1, 1, a);
    expect([v0, v1]).toEqual([0, 1]);
    expect(u1).toBeCloseTo(1, 9);
    expect(u0).toBeCloseTo(1 - a / PLATE_ASPECT, 9);
  });
  it('keeps the pixels square at any aspect (equal plate distance per screen step on both axes)', () => {
    for (const a of [4 / 3, 16 / 10, PLATE_ASPECT, 21 / 9, 32 / 9]) {
      const [ua] = coverUV(0, 0, a), [ub] = coverUV(1, 0, a), [, va] = coverUV(0, 0, a), [, vb] = coverUV(0, 1, a);
      expect(((ub - ua) / (vb - va)) * PLATE_ASPECT).toBeCloseTo(a, 9);
    }
  });
});

describe('windDrive: the game wind drives the shrubs (spec §4 table)', () => {
  const yaw = 303.9; // the lookout camera, looking north-west
  it('calm: barely a tremble, no lean, no gusts', () => {
    const d = windDrive(1 * KN, 90, yaw);
    expect(d.rate).toBeCloseTo(0.15, 6);
    expect(d.lean).toBe(0);
    expect(d.gust).toBe(0);
  });
  it('dead calm (0 kn) is finite', () => {
    const d = windDrive(0, 0, yaw);
    expect(Object.values(d).every(Number.isFinite)).toBe(true);
  });
  it('a light breeze plays as animated, with a slight lean and gentle gusts', () => {
    const d = windDrive(8 * KN, 90, yaw);
    expect(d.rate).toBeCloseTo(1, 6);
    expect(Math.abs(d.lean)).toBeGreaterThan(0.05);
    expect(Math.abs(d.lean)).toBeLessThanOrEqual(0.3);
    expect(d.gust).toBeGreaterThan(0.2);
    expect(d.gust).toBeLessThan(0.5);
  });
  it('strong wind: up to 1.8×, full strength, and never more in a gale', () => {
    expect(windDrive(20 * KN, 90, yaw).rate).toBeCloseTo(1.8, 6);
    const gale = windDrive(60 * KN, 90, yaw);
    expect(gale.rate).toBeCloseTo(1.8, 6);
    expect(gale.gust).toBe(1);
    expect(Math.hypot(gale.lean, gale.squash)).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('an offshore (from the east) leans the tips left, toward the sea; an onshore (from the west) leans them right', () => {
    expect(windDrive(15 * KN, 90, yaw).lean).toBeLessThan(0);
    expect(windDrive(15 * KN, 270, yaw).lean).toBeGreaterThan(0);
  });
  it('a wind from straight behind the camera only squashes (blows into the screen); from straight ahead the other way', () => {
    const behind = windDrive(20 * KN, (yaw + 180) % 360, yaw), ahead = windDrive(20 * KN, yaw, yaw);
    expect(behind.lean).toBeCloseTo(0, 9);
    expect(behind.squash).toBeCloseTo(1, 9);
    expect(ahead.squash).toBeCloseTo(-1, 9);
  });
  it('a wind from the screen\'s right leans the tips left, at every camera yaw', () => {
    for (const y of [0, 45, 133, 270, 303.9]) expect(windDrive(20 * KN, (y + 90) % 360, y).lean).toBeCloseTo(-1, 9);
  });
});

describe('backdropFade: the painting shows on Conditions only, and never in the surf (spec §5)', () => {
  it('is 0 when the menu is closed', () => expect(backdropFade(null)).toBe(0));
  it('is 1 on Conditions and while paddling out under the cover, 0 on Rider and Gear', () => {
    expect(backdropFade({ beat: 'conditions', move: null })).toBe(1);
    expect(backdropFade({ beat: 'out', move: null })).toBe(1);
    expect(backdropFade({ beat: 'rider', move: null })).toBe(0);
    expect(backdropFade({ beat: 'gear', move: null })).toBe(0);
  });
  it('fades out over the first half of the move to Rider, and back in over the second half of the move back', () => {
    const out = (t: number) => backdropFade({ beat: 'rider', move: { from: 'conditions', to: 'rider', t } });
    const back = (t: number) => backdropFade({ beat: 'conditions', move: { from: 'rider', to: 'conditions', t } });
    expect(out(0)).toBe(1);
    expect(out(0.5)).toBe(0);
    expect(out(0.25)).toBeGreaterThan(0);
    expect(out(0.25)).toBeLessThan(1);
    expect(back(0.5)).toBe(0);
    expect(back(1)).toBe(1);
  });
  it('stays 0 on a move between Rider and Gear', () => {
    expect(backdropFade({ beat: 'gear', move: { from: 'rider', to: 'gear', t: 0.5 } })).toBe(0);
  });
});

describe('easeToward: the painting\'s sun follows the cloud meter smoothly (final review: it reads every 0.25 s)', () => {
  it('moves only part of the way in one frame, never overshoots, and settles', () => {
    const one = easeToward(1, 0, 1 / 60, 0.4);
    expect(one).toBeLessThan(1);
    expect(one).toBeGreaterThan(0.9);
    let v = 1;
    for (let i = 0; i < 600; i++) v = easeToward(v, 0, 1 / 60, 0.4);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1e-6);
  });
  it('turns a 0.25 s staircase into steps under a third of the jump', () => {
    let v = 1, worst = 0;
    for (let f = 0; f < 120; f++) {
      const target = Math.floor(f / 15) % 2; // the meter flips between 0 and 1 every 0.25 s at 60 fps
      const next = easeToward(v, target, 1 / 60, 0.4);
      worst = Math.max(worst, Math.abs(next - v));
      v = next;
    }
    expect(worst).toBeLessThan(1 / 3);
  });
});

describe('layerUV: a painted layer placed on the ground (the crew on Conditions)', () => {
  const rect = { x: 0.3, y: 0.27, scale: 0.72 };
  it('maps the rect\'s corners to the layer\'s corners', () => {
    expect(layerUV(0.3, 0.27, rect)).toEqual([0, 0]);
    const [u, v] = layerUV(0.3 + 0.72, 0.27 + 0.72, rect);
    expect(u).toBeCloseTo(1, 9);
    expect(v).toBeCloseTo(1, 9);
  });
  it('keeps the layer\'s 16:9 shape (one scale on both axes)', () => {
    const [u0, v0] = layerUV(0.5, 0.5, rect), [u1, v1] = layerUV(0.6, 0.6, rect);
    expect(u1 - u0).toBeCloseTo(v1 - v0, 9);
  });
  it('says whether a ground point falls inside the layer', () => {
    expect(insideLayer(...layerUV(0.5, 0.5, rect))).toBe(true);
    expect(insideLayer(...layerUV(0.1, 0.5, rect))).toBe(false);
    expect(insideLayer(...layerUV(0.5, 0.1, rect))).toBe(false);
  });
});
