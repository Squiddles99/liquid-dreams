import { describe, expect, it } from 'vitest';
import { type RideBody, type RideControls, type RideEvent, BAIL_S, MAX_SPEED, NO_CONTROLS, forwardOf, speedOf, startBody, stepRide } from './ridePhysics';
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

  it('the wave carries a rider angled along its face', () => {
    // Riding 70° off the swell's travel, on the front face just below the crest.
    const k = (2 * Math.PI) / 30, x0 = (Math.PI / 2 + 0.6) / k;
    const b = startBody(x0, 0, 90 - 70, swell(0));
    b.phase = 'ride';
    b.vx = 3;
    b.vz = -8;
    run(b, NO_CONTROLS, swell, 4);
    const front = -b.water.slopeX;
    expect(b.phase).toBe('ride');
    expect(front).toBeGreaterThan(0);
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
