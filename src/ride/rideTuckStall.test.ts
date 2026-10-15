import { describe, expect, it } from 'vitest';
import { type RideBody, type RideControls, NO_CONTROLS, TUNING, speedOf, startBody, stepRide } from './ridePhysics';
import { LINE_OFF_DEG } from './rideLine';
import type { WaterFn } from './water';
import { OPEN_FACE, type RideContext, headHeight } from './riderBody';

const DT = 1 / 60;
const face = (s: number): WaterFn => (x) => ({ y: -s * x, slopeX: -s, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });
const riding = (water: WaterFn, headingDeg: number, v: number): RideBody => {
  const b = startBody(0, 0, headingDeg, water);
  const h = (headingDeg * Math.PI) / 180;
  b.phase = 'ride';
  b.phaseT = 1;
  b.vx = Math.sin(h) * v;
  b.vz = -Math.cos(h) * v;
  return b;
};
const run = (b: RideBody, c: RideControls, water: WaterFn, s: number): void => {
  for (let i = 0; i < s / DT; i++) stepRide(b, c, water, DT, TUNING.intermediate);
};

describe('tuck and drive (ride-speed spec §4.2)', () => {
  it('on the line, a tuck keeps more speed over 3 s than standing', () => {
    // heading 340: along the line (north), a little down the face
    const t = riding(face(0.3), 340, 12), s = riding(face(0.3), 340, 12);
    run(t, { ...NO_CONTROLS, crouch: 1 }, face(0.3), 3);
    run(s, NO_CONTROLS, face(0.3), 3);
    expect(t.tuck).toBeGreaterThan(0.8);
    expect(speedOf(t)).toBeGreaterThan(speedOf(s));
  });
  it('on the ride\'s own line (LINE_OFF_DEG off the wave\'s travel, what keeps a rider with the wave), S builds the tuck', () => {
    // Andrew's real-key captures (2026-10-15): S held 2.5 s on the line, tuck 0.00 throughout.
    const t = riding(face(0.3), 90 - LINE_OFF_DEG, 12);
    run(t, { ...NO_CONTROLS, crouch: 1 }, face(0.3), 1.5);
    expect(t.tuck).toBeGreaterThan(0.8);
  });
  it('straightened out (heading down the face, off the line), it is no tuck and the rider still slows on the flats', () => {
    const flat: WaterFn = () => ({ y: 0, slopeX: 0, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });
    const t = riding(flat, 90, 10);
    run(t, { ...NO_CONTROLS, crouch: 1 }, flat, 2);
    expect(t.tuck).toBeLessThan(0.05);
    expect(speedOf(t)).toBeLessThan(10);
  });
});

const runCtx = (b: RideBody, c: RideControls, water: WaterFn, s: number, ctx: (t: number) => RideContext): string[] => {
  const ev: string[] = [];
  for (let i = 0; i < s / DT; i++) {
    const e = stepRide(b, c, water, DT, TUNING.intermediate, ctx((i + 1) * DT));
    if (e) ev.push(e);
  }
  return ev;
};
const level: WaterFn = () => ({ y: 0, slopeX: 0, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });

describe('the stall brakes (ride-speed spec §4.3)', () => {
  it('a full stall on the open face slows 10 → about 6–7.5 m/s in a second; free, the rider keeps more', () => {
    const s = riding(level, 0, 10), f = riding(level, 0, 10);
    runCtx(s, { ...NO_CONTROLS, stall: true }, level, 1, () => OPEN_FACE);
    runCtx(f, NO_CONTROLS, level, 1, () => OPEN_FACE);
    expect(speedOf(s)).toBeGreaterThan(5.5);
    expect(speedOf(s)).toBeLessThan(7.5);
    expect(speedOf(f) - speedOf(s)).toBeGreaterThan(1.0);
  });
  it('released, the plain drag is back within 0.3 s', () => {
    const s = riding(level, 0, 10);
    runCtx(s, { ...NO_CONTROLS, stall: true }, level, 0.5, () => OPEN_FACE);
    runCtx(s, NO_CONTROLS, level, 0.31, () => OPEN_FACE);
    expect(s.stall).toBe(0);
  });
  it('with the crest close behind, the hand-drag stall brakes harder than the tall one', () => {
    const t = riding(level, 0, 10), h = riding(level, 0, 10);
    runCtx(t, { ...NO_CONTROLS, stall: true }, level, 1, () => OPEN_FACE);
    runCtx(h, { ...NO_CONTROLS, stall: true }, level, 1, () => ({ ...OPEN_FACE, crestBehindM: 1 }));
    expect(h.hand).toBeGreaterThan(0.8);
    expect(speedOf(h)).toBeLessThan(speedOf(t));
  });
});

describe('the lip (ride-speed spec §4.4)', () => {
  const lowLip = { ...OPEN_FACE, cover: 0.9, roomM: 1.6, curlSpeed: 8 };
  it('RT under a low lip: the head goes into it, a lip wipeout', () => {
    const b = riding(level, 0, 9);
    const ev = runCtx(b, { ...NO_CONTROLS, crouch: -1 }, level, 1, () => lowLip);
    expect(ev).toContain('lip');
    expect(b.phase).toBe('bail');
  });
  it('the auto-stall, the assist and the tuck never put the head in it', () => {
    for (const c of [{ ...NO_CONTROLS, stall: true }, { ...NO_CONTROLS, pump: true }, { ...NO_CONTROLS, crouch: 1 }, NO_CONTROLS]) {
      const b = riding(level, 0, 9);
      expect(runCtx(b, c, level, 2, () => lowLip)).not.toContain('lip');
    }
  });
  it('the room dropping in a jump (the real wave’s stations): the game-driven body is never struck (Task 12)', () => {
    for (const c of [{ ...NO_CONTROLS, pump: true }, { ...NO_CONTROLS, stall: true }, NO_CONTROLS]) {
      const b = riding(level, 0, 9);
      const ev = runCtx(b, c, level, 1.5, (t) => ({ ...OPEN_FACE, cover: 0.9, roomM: t < 0.7 ? 3 : 1.35, curlSpeed: 8 }));
      expect(ev).not.toContain('lip');
    }
  });
  it('the room shrinking: the stand-up blends down to low before the head reaches the lip', () => {
    const b = riding(level, 0, 9);
    const room = (t: number): number => Math.max(1.4, 3 - 0.5 * t);
    const ev = runCtx(b, { ...NO_CONTROLS, stall: true }, level, 3, (t) => ({ ...OPEN_FACE, cover: 0.9, roomM: room(t), curlSpeed: 8 }));
    expect(ev).not.toContain('lip');
    expect(headHeight(b.comH, b.standH)).toBeLessThanOrEqual(room(3) - 0.29);
    expect(b.stallW.lowBarrel).toBeGreaterThan(0.8);
  });
});

describe('final review fixes (ride-speed)', () => {
  const steep: WaterFn = (x) => ({ y: -0.8 * x, slopeX: -0.8, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });
  it('a straight run on a steep face reads no extra load (drag and gravity along the path are not the legs\' load)', () => {
    const b = riding(steep, 0, 8);
    runCtx(b, NO_CONTROLS, steep, 2, () => OPEN_FACE);
    expect(Math.abs(b.load - b.n0)).toBeLessThan(0.03);
  });
  it('the carve still loads the rider (its centripetal pull is the pump\'s)', () => {
    const b = riding(level, 0, 8);
    runCtx(b, { ...NO_CONTROLS, steer: 1 }, level, 0.4, () => OPEN_FACE);
    expect(b.load - b.n0).toBeGreaterThan(0.5);
  });
  it('a prone rider (bodyboard) is never hit by the lip, and LB / RB do nothing to their body', () => {
    const b = riding(level, 0, 9);
    b.prone = true;
    const ev = runCtx(b, { ...NO_CONTROLS, crouch: -1, stall: true, pump: true }, level, 1, () => ({ ...OPEN_FACE, cover: 0.9, roomM: 1.2, curlSpeed: 8 }));
    expect(ev).not.toContain('lip');
    expect(b.stall).toBe(0);
  });
  it('W still held from paddling through the pop-up: no strike in the drop\'s first 0.5 s', () => {
    const b = riding(level, 0, 9);
    b.phaseT = 0;
    const ev = runCtx(b, { ...NO_CONTROLS, crouch: -1 }, level, 0.45, () => ({ ...OPEN_FACE, cover: 0.9, roomM: 1.6, curlSpeed: 8 }));
    expect(ev).not.toContain('lip');
  });
});
