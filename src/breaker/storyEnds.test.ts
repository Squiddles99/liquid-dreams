import { describe, expect, it } from 'vitest';
import { DEFAULT_REEF_PARAMS as RP, LEFT_BEARING_DEG, TIP } from '../seabed/wombReef';
import { DEFAULT_BREAK_PARAMS as P, UNTIL_NEVER, onsetPsi, onsetTime, onsetUntil } from './breaking';
import { sampleField, sampleOnset } from './reefField';
import { hollowFromPsi, setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

// womb-story Task 3 (spec 3.2 C, re-cut at STOP 0): the ends. At 7 ft the left fizzles on the drop: no ray past ledgeWallM +
// ledgeBlendM breaks within 60 m inshore of the ledge, and the record's turn for it, where it has one, is the beach's (its
// until carries the crest past those 60 m: the shore break ~100 m in, not the reef's: 12 s at along 145). At
// 12 ft it closes out there: every ray breaks, peeling (hollow <= 0.5; closeoutWeight takes it to 0 past the turn).
const f = coastReefField({ periodS: 14, fromDeg: 270, tideM: 0.5, peel: true });
const br = (LEFT_BEARING_DEG * Math.PI) / 180;
/** The seaward-most broken point on the ray through the ledge point `along` m down the left (as reefReport.leftStretches). */
function rayAt(along: number, H: number) {
  let x = TIP[0] + along * Math.sin(br), z = TIP[1] - along * Math.cos(br);
  const lx = x, lz = z;
  for (let d = 0; d < 120; d++) { const s = sampleField(f, x, z); x -= s.dirX; z -= s.dirZ; }
  for (let d = -120; d <= 60; d += 0.5) {
    const r = sampleOnset(f, x, z), s = sampleField(f, x, z);
    if (r && onsetTime(r, 0, H, P) !== null) return { broke: true, hollow: hollowFromPsi(onsetPsi(r, 0, H, P)), until: 0, c: NaN };
    x += s.dirX * 0.5; z += s.dirZ * 0.5;
  }
  const r = sampleOnset(f, lx, lz);
  return { broke: false, hollow: NaN, until: r ? onsetUntil(r, 0, H, P) : Infinity, c: f.omega / sampleField(f, lx, lz).k };
}

describe('the story ends (womb-story spec 3.2 C)', () => {
  const C: number[] = [];
  for (let a = RP.ledgeWallM + RP.ledgeBlendM; a <= 175; a += 5) C.push(a);
  it('7 ft fizzles on the drop: no break on the reef, any turn the record holds is past it', () => {
    const H = setWaveHeight(7);
    for (const a of C) {
      const r = rayAt(a, H);
      expect(r.broke, `along ${a}`).toBe(false);
      if (r.until < UNTIL_NEVER) expect(r.until * r.c, `along ${a}: the crest runs ${(r.until * r.c).toFixed(0)} m before it breaks`).toBeGreaterThan(60);
    }
  }, 300_000);
  it('12 ft closes out on the drop: every ray breaks, peeling', () => {
    const H = setWaveHeight(12);
    for (const a of C) {
      const r = rayAt(a, H);
      expect(r.broke, `along ${a}`).toBe(true);
      expect(r.hollow, `along ${a}`).toBeLessThanOrEqual(0.5);
    }
  }, 300_000);
});
