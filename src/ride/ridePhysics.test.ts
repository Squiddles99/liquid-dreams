import { describe, expect, it } from 'vitest';
import { type RideBody, type RideControls, type RideEvent, type RideTuning, BAIL_S, MAX_SPEED, NO_CONTROLS, POPUP_S, TUNING, forwardOf, speedOf, startBody, stepRide } from './ridePhysics';
import { type WaterFn, flatWater } from './water';

const DT = 1 / 60;
const run = (b: RideBody, c: RideControls | ((t: number, b: RideBody) => RideControls), water: (t: number) => WaterFn, seconds: number, t0 = 0): RideEvent[] => {
  const events: RideEvent[] = [];
  for (let i = 0; i < seconds / DT; i++) {
    const t = t0 + (i + 1) * DT;
    const e = stepRide(b, typeof c === 'function' ? c(t, b) : c, water(t), DT);
    if (e) events.push(e);
  }
  return events;
};

/** A plane tilted down toward +x at `s`: a wave's face running +x at c (0: a still slope, nothing carries). */
const slope = (s: number, foam = 0, c = 7): WaterFn => (x) => ({ y: -s * x, slopeX: -s, slopeZ: 0, foam, ux: 0, uz: 0, c, dirX: 1, dirZ: 0 });

/** A steep swell running +x at c (λ 30 m, 1.5 m amplitude, slope up to 0.31); the water moves with it as in shallow water. */
const swell = (t: number): WaterFn => {
  const A = 1.5, k = (2 * Math.PI) / 30, c = 7;
  return (x) => {
    const ph = k * (x - c * t), eta = A * Math.sin(ph);
    return { y: eta, slopeX: A * k * Math.cos(ph), slopeZ: 0, foam: 0, ux: (c * eta) / 6, uz: 0, c, dirX: 1, dirZ: 0 };
  };
};

describe('the board on the water', () => {
  it('paddles at about 1.5 m/s on flat water, and turns', () => {
    const b = startBody(0, 0, 90, flatWater());
    run(b, { ...NO_CONTROLS, paddle: true }, () => flatWater(), 10);
    expect(speedOf(b)).toBeGreaterThan(1.3);
    expect(speedOf(b)).toBeLessThan(1.8);
    expect(b.x).toBeGreaterThan(10);
    run(b, { ...NO_CONTROLS, paddle: true, steer: 1 }, () => flatWater(), 1);
    expect(b.headingDeg).toBeCloseTo(160, 0);
  });

  it('runs down a face it points down, and grips across one it points along', () => {
    const down = startBody(0, 0, 90, slope(0.5));
    down.phase = 'ride';
    down.vx = 4; // already up and moving (slower than STALL_SPEED and the ride is over)
    run(down, NO_CONTROLS, () => slope(0.5), 6);
    expect(down.vx).toBeGreaterThan(8);
    expect(speedOf(down)).toBeLessThanOrEqual(MAX_SPEED + 1e-9);

    const across = startBody(0, 0, 0, slope(0.3, 0, 0));
    across.phase = 'ride';
    across.vx = 0;
    across.vz = -8; // already riding north along the face
    run(across, NO_CONTROLS, () => slope(0.3, 0, 0), 0.5);
    const [fx, fz] = forwardOf(across.headingDeg);
    const alongV = across.vx * fx + across.vz * fz;
    expect(Math.abs(across.vx)).toBeLessThan(0.5 * alongV);
  });

  it('a bottom turn keeps its speed: the rail turns the slide into run (Andrew: it has to grip and keep up)', () => {
    const b = startBody(0, 0, 90, flatWater());
    b.phase = 'ride';
    b.vx = 12;
    run(b, { ...NO_CONTROLS, steer: -1 }, () => flatWater(), 0.5);
    expect(b.headingDeg).toBeLessThan(10);
    expect(speedOf(b)).toBeGreaterThan(10);
    run(b, NO_CONTROLS, () => flatWater(), 0.3); // and it runs where it points
    const [fx, fz] = forwardOf(b.headingDeg);
    expect((b.vx * fx + b.vz * fz) / speedOf(b)).toBeGreaterThan(0.95);
  });

  it('steers while popping up: the line is set before the feet land', () => {
    const b = startBody(0, 0, 90, flatWater());
    b.phase = 'popup';
    b.vx = 8;
    run(b, { ...NO_CONTROLS, steer: -1 }, () => flatWater(), 0.3);
    expect(b.headingDeg).toBeLessThan(65);
  });

  it('a swell passes under a board that only sits there', () => {
    const b = startBody(0, 0, 90, swell(0));
    const events = run(b, NO_CONTROLS, swell, 8);
    expect(events).not.toContain('caught');
    expect(Math.abs(b.x)).toBeLessThan(8);
  });

  it('paddling as the face lifts the tail catches the wave; Space then pops up and it rides', () => {
    // Start just ahead of a crest, on its front face.
    const b = startBody(4, 0, 90, swell(0));
    let caughtAt = -1;
    const events = run(b, (t, body) => {
      if (body.caught && caughtAt < 0) caughtAt = t;
      return { ...NO_CONTROLS, paddle: true, popup: caughtAt > 0 && t > caughtAt + 0.1 && body.phase === 'paddle' };
    }, swell, 6);
    expect(events).toContain('caught');
    expect(events).toContain('popup');
    expect(b.phase).toBe('ride');
    expect(speedOf(b)).toBeGreaterThan(4);
  });

  it('a rider angled along the face, moving with the wave, stays on it: the water running up the face drives the rail', () => {
    // Riding 60° off the swell's travel, on the front face just below the crest, keeping pace with the wave.
    const k = (2 * Math.PI) / 30, x0 = (Math.PI / 2 + 0.6) / k;
    const b = startBody(x0, 0, 90 - 60, swell(0));
    b.phase = 'ride';
    b.vx = 7;
    b.vz = -8;
    // A rider trims: points down the face when the wave starts to pass, along it when running ahead.
    run(b, (_t, body) => ({ ...NO_CONTROLS, steer: Math.max(-1, Math.min(1, (7 - body.vx) / 2)) }), swell, 4);
    expect(b.phase).toBe('ride');
    expect(-b.water.slopeX).toBeGreaterThan(0);
    expect(-b.vz).toBeGreaterThan(6);
  });

  it('Space too early just says so', () => {
    const b = startBody(0, 0, 90, flatWater());
    expect(run(b, { ...NO_CONTROLS, popup: true }, () => flatWater(), DT)).toEqual(['tooSoon']);
    expect(b.phase).toBe('paddle');
  });

  it('wipes out in the whitewater, and is back on the board after the bail', () => {
    const b = startBody(0, 0, 90, slope(0.3, 1));
    b.phase = 'ride';
    b.vx = 6;
    expect(run(b, NO_CONTROLS, () => slope(0.3, 1), DT)).toEqual(['wipeout']);
    expect(b.phase).toBe('bail');
    run(b, NO_CONTROLS, () => flatWater(), BAIL_S + 0.1);
    expect(b.phase).toBe('paddle');
  });

  it('kicks out once the ride stalls', () => {
    const b = startBody(0, 0, 90, flatWater());
    b.phase = 'ride';
    b.vx = 4;
    const events = run(b, NO_CONTROLS, () => flatWater(), 30);
    expect(events).toEqual(['kickout']);
    expect(b.phase).toBe('paddle');
  });

  it('runs aground in the shallows instead of riding up the beach and under it (Andrew)', () => {
    // Flat water at 0 over a beach rising toward +x: 0.3 m deep at x = 20.
    const beach: WaterFn = (x) => ({ ...flatWater()(x, 0), bedY: -1 + 0.035 * x });
    const b = startBody(0, 0, 90, beach);
    b.phase = 'ride';
    b.vx = 8;
    const events = run(b, NO_CONTROLS, () => beach, 5);
    expect(events).toContain('aground');
    expect(b.x).toBeLessThan(20);
    expect(b.phase).toBe('paddle');
    expect(b.y).toBeGreaterThanOrEqual(beach(b.x, 0).bedY!);
  });

  it('stays finite when the water is not', () => {
    const b = startBody(0, 0, 90, flatWater());
    run(b, { ...NO_CONTROLS, paddle: true }, () => () => ({ ...flatWater()(0, 0), y: NaN }), 1);
    expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
  });
});

/**
 * The takeoff spot's face as it pitches (the 2026-10-04 probe, 5.5 ft): a 3 m wall, 3 m wide at its foot, running +x at
 * 10 m/s. A still point under it rises at up to 15 m/s (the probe: 16).
 */
const wall = (t: number): WaterFn => (x) => {
  const u = Math.min(1, Math.max(0, (-20 + 10 * t - x) / 3));
  return { y: 3 * u * u * (3 - 2 * u), slopeX: -6 * u * (1 - u), slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 10, dirX: 1, dirZ: 0 };
};

describe('the board floats like a board (Andrew 2026-10-04: the bobbing over a steep swell looked fast-forward)', () => {
  it('a steep face lifts a floating board over it, not snaps it up the wall', () => {
    const b = startBody(0, 0, 270, wall(0));
    let maxVy = 0, maxTiltRate = 0, deepest = 0;
    let y = b.y, tilt = Math.atan(b.tiltX);
    for (let i = 0; i < 4 / DT; i++) {
      const t = (i + 1) * DT;
      stepRide(b, NO_CONTROLS, wall(t), DT);
      maxVy = Math.max(maxVy, Math.abs(b.y - y) / DT);
      maxTiltRate = Math.max(maxTiltRate, Math.abs(Math.atan(b.tiltX) - tilt) / DT / (Math.PI / 180));
      deepest = Math.max(deepest, wall(t)(b.x, b.z).y - b.y);
      y = b.y;
      tilt = Math.atan(b.tiltX);
    }
    // Well under the wall's own 15 m/s (read at one point it was ~15); the face washes over the nose for a moment instead.
    expect(maxVy).toBeLessThan(9);
    expect(maxTiltRate).toBeLessThan(250);
    expect(deepest).toBeLessThan(1.5);
    expect(b.y).toBeCloseTo(3, 1);
  });

  it('standing, it planes on the surface under it', () => {
    const b = startBody(0, 0, 90, slope(0.5));
    b.phase = 'ride';
    b.vx = 6;
    run(b, NO_CONTROLS, () => slope(0.5), 1);
    expect(Math.abs(b.y - slope(0.5)(b.x, b.z).y)).toBeLessThan(0.05);
    expect(b.tiltX).toBeCloseTo(-0.5, 2);
  });

  it('pops up in 0.4 s (Andrew: on his feet only at the bottom of the drop)', () => {
    expect(POPUP_S).toBeCloseTo(0.4, 5);
  });
});

describe('the catch is a late drop (R1 §3)', () => {
  // A face running toward the beach (+x); heading 90 is the nose toward the beach.
  const shoreHeading = 90, idle: RideControls = { paddle: false, steer: 0, crouch: 0, popup: false };
  const water = (s: number, c = 8): WaterFn => slope(s, 0, c);
  it('caught by slope alone: a still board, nose downhill, on a 0.4 face for 0.2 s', () => {
    const b = startBody(0, 0, shoreHeading, water(0.4));
    for (let k = 0; k < 6; k++) stepRide(b, idle, water(0.4), 1 / 30);
    expect(b.caught).toBe(true);
  });
  it('not caught on a face shallower than the catch slope without speed', () => {
    const b = startBody(0, 0, shoreHeading, water(0.2));
    for (let k = 0; k < 30; k++) stepRide(b, idle, water(0.2), 1 / 30);
    expect(b.caught).toBe(false);
  });
  it('not caught facing seaward (nose uphill), however steep', () => {
    const b = startBody(0, 0, shoreHeading + 180, water(0.6));
    for (let k = 0; k < 30; k++) stepRide(b, { paddle: true, steer: 0, crouch: 0, popup: true }, water(0.6), 1 / 30);
    expect(b.caught).toBe(false);
    expect(b.phase).toBe('paddle');
  });
  it('4 ft soft day still caught by speed: a 0.2 face at 0.5 c along the wave', () => {
    const b = startBody(0, 0, shoreHeading, water(0.2, 6));
    b.vx = 3; // 0.5 c, along the wave's travel (+x)
    stepRide(b, { paddle: true, steer: 0, crouch: 0, popup: false }, water(0.2, 6), 1 / 60);
    expect(b.caught).toBe(true);
  });
  it('the catch slope follows the experience: beginner catches 0.3, expert does not', () => {
    const run = (tune: RideTuning) => { const b = startBody(0, 0, shoreHeading, water(0.3)); for (let k = 0; k < 10; k++) stepRide(b, idle, water(0.3), 1 / 30, tune); return b.caught; };
    expect(run(TUNING.beginner)).toBe(true);
    expect(run(TUNING.expert)).toBe(false);
  });
});
