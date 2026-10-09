import { describe, expect, it } from 'vitest';
import { type Bathymetry, buildBathymetry, downsample } from '../seabed/bathymetry';
import { SHORE_X, depthBg } from '../seabed/coastProfile';
import { NORTH_LEDGE, SOUTH_LEDGE, TIP } from '../seabed/wombReef';
import { AMP_CAP, farSample } from './coastFarField';
import type { FieldSample } from './fieldSample';
import { PEEL_MAX_HOLD_S, REFRACT_FLOOR_M, RUN_DIP, computeOnsetRecord, computeReefField, gainAhead, maxAlongCrest, sampleField, sampleOnset, smoothAlongCrest, smoothAlongTravel, smoothFieldAmplitude } from './reefField';
import { DEFAULT_BREAK_PARAMS, LIP_THROW_S, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_LEVEL_Q0, ONSET_LEVEL_RATIO, ONSET_DELAY_OFFSET, ONSET_RECORD_LENGTH, ONSET_UNTIL_OFFSET, onsetGain, onsetHeight, onsetTime } from './breaking';
import { BREAKING_RATIO } from './setWaveModel';
import { setWaveHeight } from './reefReport';
import { reefBeds } from './testField';

const reef05 = buildBathymetry();
const reef1 = downsample(reef05, 2);
const reef2 = downsample(reef05, 4);
// Solve the full 1 m field once (~1 s) and share it between the tests that inspect it.
// Seeded by the coast field, as the game's (womb-retune Task 3: the far field alone reaches the moved take-off too oblique).
const coast1 = reefBeds(2).coast;
const f225 = computeReefField({ bed: reef1, periodS: 15, fromDeg: 225, tideM: 0, coast: coast1 });

function coastOnly(): Bathymetry {
  const grid = { x0: -400, z0: -100, cellM: 2, nx: 326, nz: 101 };
  const bed = new Float32Array(grid.nx * grid.nz);
  for (let r = 0; r < grid.nz; r++) for (let c = 0; c < grid.nx; c++) bed[r * grid.nx + c] = -depthBg(grid.x0 + c * grid.cellM);
  return { grid, bed, sand: new Float32Array(bed.length).fill(1), weed: new Float32Array(bed.length) };
}

const allFinite = (a: Float32Array) => a.every(Number.isFinite);
/** A point `s` m along the left's ledge from the tip (womb-retune: the pins moved with the take-off). */
const onLeft = (s: number): [number, number] => {
  const [a, b] = [NORTH_LEDGE[0], NORTH_LEDGE[1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [Math.round((a[0] + ((b[0] - a[0]) * s) / L) * 10) / 10, Math.round((a[1] + ((b[1] - a[1]) * s) / L) * 10) / 10];
};
/** (x, z) from the tip: the right and the water around the corner moved with it unchanged. */
const fromTip = (x: number, z: number): [number, number] => [TIP[0] + x, TIP[1] + z];
const along = (line: readonly (readonly [number, number])[], metres: number, step: number): [number, number][] => {
  const [a, b] = [line[0], line[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out: [number, number][] = [];
  for (let s = 0; s <= metres + 1e-9; s += step) out.push([a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len]);
  return out;
};

describe('reef wave field', () => {
  it('equals the exact 1D coast solution on a reef-free coast (the far field joins seamlessly)', () => {
    const f = computeReefField({ bed: coastOnly(), periodS: 15, fromDeg: 225, tideM: 0 });
    for (const [x, z] of [[-300, 0], [-100, 40], [0, -20], [120, 60]] as const) {
      const inside = sampleField(f, x, z), analytic = farSample(f.far, x, z);
      expect(Math.abs(inside.tau - analytic.tau)).toBeLessThan(0.02 * Math.max(1, Math.abs(analytic.tau)) + 0.05);
      expect(inside.amp / analytic.amp).toBeCloseTo(1, 1);
    }
  });
  it('arrives at the peak at τ = 0', () => {
    const f = f225;
    expect(Math.abs(sampleField(f, TIP[0], TIP[1]).tau)).toBeLessThan(0.05);
  });
  it('peels along the north ledge and stands up at once along the south ledge (the A-frame)', () => {
    const f = f225;
    const north = along(NORTH_LEDGE, 40, 5).map(([x, z]) => sampleField(f, x, z).tau);
    const south = along(SOUTH_LEDGE, 40, 5).map(([x, z]) => sampleField(f, x, z).tau);
    for (let i = 1; i < north.length; i++) expect(north[i]).toBeGreaterThan(north[i - 1]);
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(south)).toBeLessThan(spread(north));
    const peelSpeed = 40 / (north[north.length - 1] - north[0]);
    expect(peelSpeed).toBeGreaterThan(3);
  });
  it('a grazing swell (exactly 270°) does not source the whole south edge as a numerical caustic', { timeout: 60_000 }, () => {
    // dirZ is float residue of cos(90°) at exactly 270°; a bare `< 0` edge-source test used to treat that residue's
    // sign as real inflow and source the whole south edge from the far field, capping a line of cells at AMP_CAP.
    // Seaward of the surf zone: at the waterline the coast's own shoaling reaches AMP_CAP along every row (since the coast
    // offshore is 20 m, 2026-10-05: 53 cells at x 85–137 on the edge rows, as at 269.9°).
    const cappedCount = (fromDeg: number, edgeOnly = false) => {
      const f = computeReefField({ bed: reef1, periodS: 15, fromDeg, tideM: 0 }), { nx, x0, cellM } = f.grid;
      let count = 0;
      f.amp.forEach((v, i) => {
        const c = i % nx, r = (i - c) / nx, edge = r < 3;
        if (v >= AMP_CAP - 1e-6 && (edge || !edgeOnly) && x0 + c * cellM < SHORE_X - 40) count++;
      });
      return count;
    };
    // (On the softened ramp 269.9° focused 100+ cells to AMP_CAP near the south edge, showing a low count at 270° wasn't
    // trivial; the reef build's reef caps none at 269.9° either (plan 2026-10-02 Task 4), so only the edge check is left.)
    // The caustic ran along the grid's south edge; the softened ramp genuinely focuses a grazing swell to two small clusters
    // (18 cells near (70, 0) and (240, 194), the second touching the shore-side edge), so it is the south edge that must
    // stay clear.
    expect(cappedCount(270, true)).toBe(0);
  });
  it('is finite, capped, and never records a shallower hmin than the water it has crossed allows', () => {
    const f = f225;
    for (const a of [f.tau, f.amp, f.hmin, f.k, f.dirX, f.dirZ, f.depth]) expect(allFinite(a)).toBe(true);
    for (let i = 0; i < f.amp.length; i += 97) {
      expect(f.amp[i]).toBeLessThanOrEqual(AMP_CAP);
      expect(f.hmin[i]).toBeLessThanOrEqual(f.depth[i] + 1e-4);
      expect(Math.hypot(f.dirX[i], f.dirZ[i])).toBeCloseTo(1, 4);
    }
  });
  it('unusual swell directions stay finite', { timeout: 30_000 }, () => {
    for (const fromDeg of [0, 45, 90, 135, 180, 315]) {
      const f = computeReefField({ bed: reef2, periodS: 15, fromDeg, tideM: 0 });
      for (const a of [f.tau, f.amp, f.hmin, f.k, f.dirX, f.dirZ]) expect(allFinite(a)).toBe(true);
    }
  });
  it('extreme tide stays finite (reef heads dry at −1.5 m)', { timeout: 30_000 }, () => {
    for (const tideM of [-1.5, 1.5]) for (const periodS of [4, 25]) {
      const f = computeReefField({ bed: reef2, periodS, fromDeg: 225, tideM });
      for (const a of [f.tau, f.amp, f.hmin, f.k]) expect(allFinite(a)).toBe(true);
    }
  });
  it('the field joins the outside smoothly at every edge (real reef)', () => {
    for (const f of [f225, computeReefField({ bed: reef2, periodS: 15, fromDeg: 205, tideM: 0 })]) {
      const g = f.grid;
      const x0 = g.x0, z0 = g.z0, x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM;
      const check = (a: FieldSample, b: FieldSample, dx: number, dz: number) => {
        const predicted = a.tau + (a.k / f.omega) * (a.dirX * dx + a.dirZ * dz);
        expect(Math.abs(b.tau - predicted)).toBeLessThan(0.05);
        expect(Math.abs(b.amp - a.amp)).toBeLessThan(0.1 * a.amp + 0.02);
        expect(a.dirX * b.dirX + a.dirZ * b.dirZ).toBeGreaterThan(0.97);
      };
      for (let x = x0; x <= x1 + 1e-9; x += 25) {
        check(sampleField(f, x, z0 + 0.5), sampleField(f, x, z0 - 0.5), 0, -1);
        check(sampleField(f, x, z1 - 0.5), sampleField(f, x, z1 + 0.5), 0, 1);
      }
      for (let z = z0; z <= z1 + 1e-9; z += 25) {
        check(sampleField(f, x0 + 0.5, z), sampleField(f, x0 - 0.5, z), -1, 0);
        check(sampleField(f, x1 - 0.5, z), sampleField(f, x1 + 0.5, z), 1, 0);
      }
    }
  });
});

describe('the breaking depth smoothing (along the crest and along travel)', () => {
  // A 61×61 grid of 1 m cells, travel along +x everywhere (the crest runs along z).
  const grid = { x0: 0, z0: 0, cellM: 1, nx: 61, nz: 61 };
  const n = grid.nx * grid.nz;
  const dirX = new Float32Array(n).fill(1), dirZ = new Float32Array(n);
  const field = (f: (col: number, row: number) => number) => {
    const a = new Float32Array(n);
    for (let row = 0; row < grid.nz; row++) for (let col = 0; col < grid.nx; col++) a[row * grid.nx + col] = f(col, row);
    return a;
  };
  const at = (a: Float32Array, col: number, row: number) => a[row * grid.nx + col];
  const stepAlongCrest = field((_, row) => (row < 30 ? 1 : 2)); // changes along z: along the crest
  const stepAlongTravel = field((col) => (col < 30 ? 1 : 2)); // changes along x: along travel

  it('a constant stays constant, edges included', () => {
    const c = field(() => 3);
    for (const out of [smoothAlongCrest(c, dirX, dirZ, grid, 6), smoothAlongTravel(c, dirX, dirZ, grid, 8), maxAlongCrest(c, dirX, dirZ, grid, 6)]) {
      for (const v of out) expect(v).toBeCloseTo(3, 5);
    }
  });
  it('along the crest smooths a change along the crest and leaves one along travel sharp (and the reverse)', () => {
    const crest = smoothAlongCrest(stepAlongCrest, dirX, dirZ, grid, 6);
    expect(at(crest, 30, 24)).toBeGreaterThan(1.1); // spread 6 m before the step…
    expect(at(crest, 30, 36)).toBeLessThan(1.9); // …and after it
    const untouched = smoothAlongCrest(stepAlongTravel, dirX, dirZ, grid, 6);
    for (const col of [28, 29, 31, 32]) expect(at(untouched, col, 30)).toBeCloseTo(at(stepAlongTravel, col, 30), 5);
    const travel = smoothAlongTravel(stepAlongTravel, dirX, dirZ, grid, 8);
    expect(at(travel, 22, 30)).toBeGreaterThan(1.1);
    for (const row of [28, 29, 31, 32]) expect(at(smoothAlongTravel(stepAlongCrest, dirX, dirZ, grid, 8), 30, row)).toBeCloseTo(at(stepAlongCrest, 30, row), 5);
  });
  it('the largest along the crest widens a peak by its reach and never lowers anything', () => {
    const spike = field((_, row) => (row === 30 ? 5 : 1));
    const m = maxAlongCrest(spike, dirX, dirZ, grid, 6);
    for (let row = 24; row <= 36; row++) expect(at(m, 30, row)).toBeCloseTo(5, 5);
    expect(at(m, 30, 38)).toBeCloseTo(1, 5);
    for (let i = 0; i < n; i++) expect(m[i]).toBeGreaterThanOrEqual(spike[i]);
  });
});

describe("the front's lean feels the reef ahead (Andrew's bump, 2026-10-02)", () => {
  it('reads the strongest gain within half a wavelength ahead along the ray, tapering to nothing at its end', () => {
    // A ray along +x, half a wavelength of 80 m, and reef (gain 4) from x = 100 m on.
    const grid = { x0: 0, z0: 0, cellM: 1, nx: 200, nz: 3 }, n = grid.nx * grid.nz;
    const a = new Float32Array(n), dirX = new Float32Array(n).fill(1), dirZ = new Float32Array(n), k = new Float32Array(n).fill(Math.PI / 80);
    for (let i = 0; i < n; i++) if (i % grid.nx >= 100) a[i] = 4;
    const g = gainAhead(a, dirX, dirZ, k, grid), row = grid.nx;
    expect(g[row + 60], 'the reef 40 m ahead').toBeCloseTo(4 * (1 - 40 / 80), 5);
    expect(g[row + 10], 'the reef 90 m ahead: past its front').toBe(0);
    expect(g[row + 150], 'on the reef').toBe(4);
    for (let c = 1; c < 100; c++) expect(g[row + c], `${c} m`).toBeGreaterThanOrEqual(g[row + c - 1]);
  });
  it("the lean's depth is never deeper than the slurp's, and over deep water in front of the ledge it is shallower", { timeout: 60_000 }, () => {
    const f = computeReefField({ bed: reef1, periodS: 15, fromDeg: 225, tideM: 0, coast: coast1 });
    for (let i = 0; i < f.hminLean.length; i++) expect(f.hminLean[i]).toBeLessThanOrEqual(f.hminSlurp[i]);
    // 25 m outside the peak on its ray (the swell reaches the moved tip ~18° off shore-normal, not from (−25, 15)).
    let [x, z] = TIP as readonly number[];
    for (let d = 0; d < 25; d += 0.5) { const q = sampleField(f, x, z); x -= q.dirX * 0.5; z -= q.dirZ * 0.5; }
    const s = sampleField(f, x, z);
    expect(s.depth, '25 m outside the peak').toBeGreaterThan(12);
    expect(s.hminLean).toBeLessThan(0.5 * s.hminSlurp);
  });
});

describe('the onset record', () => {
  const f = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0, coast: coast1 });
  const R = ONSET_RECORD_LENGTH;
  it("its running maximum of amp/hminBreak is never below the node's own, and never falls along a ray", () => {
    const n = f.tau.length;
    for (let i = 0; i < n; i += 97) expect(f.onset[i * R]).toBeGreaterThanOrEqual(f.amp[i] / f.hminBreak[i] - 1e-6);
    // Along rays through both ledges: sampled every 0.5 m, 60 m in from 40 m out. Not through the wedge's tip: ~26 m
    // inshore of it the rays from the two ledges meet (the field's direction swings 40° in 2 m), and past that line the
    // water is the other ledge's rays, with their own maximum.
    // The right's rays fan out from ~60 m in on the moved reef (womb-retune: 0.2% under at (−105, 28) + 65 m).
    for (const [px, pz, reach] of [[...onLeft(32), 75], [...onLeft(80), 75], [...fromTip(25, 28), 60]]) {
      let x = px, z = pz;
      for (let d = 0; d < 40; d += 0.5) { const s = sampleField(f, x, z); x -= s.dirX * 0.5; z -= s.dirZ * 0.5; }
      let last = 0;
      for (let d = 0; d <= 80; d += 0.5) {
        const r = sampleOnset(f, x, z)!;
        // Where sections break and settle, to 40 m inshore of the ledge: within 2% (bilinear between nodes). Further in the
        // rays fan out onto neighbours that broke less hard, and it eases off slowly: long settled by then, and the
        // lifecycle is continuous in it.
        // To 35 m inshore: on the reef build's face the south ledge's rays fan out from ~37 m in from (25, 28) (plan
        // 2026-10-02 Task 4; 40 m on the softened ramp).
        if (d <= reach) expect(r[0], `(${px}, ${pz}) + ${d} m`).toBeGreaterThanOrEqual(last * 0.98);
        last = Math.max(last, r[0]);
        const s = sampleField(f, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5;
      }
    }
  });
  it('a higher level breaks no earlier: at every node the time since onset never rises from level to level, 0 where unbroken', () => {
    let worst = 0, unbrokenRunning = 0;
    for (let i = 0; i < f.tau.length; i += 13) {
      // Where both levels have broken: an unbroken level reads 0, and a level below held for its turn (the curl, one-curl
      // Task 2) reads negative beside it.
      for (let k = 1; k < ONSET_LEVELS; k++) if (f.onset[i * R] >= ONSET_LEVEL_Q[k]) worst = Math.max(worst, f.onset[i * R + 1 + 2 * k] - f.onset[i * R + 1 + 2 * (k - 1)]);
      // Unbroken: the running maximum below the level by more than the dips the carry bridges (3%).
      for (let k = 0; k < ONSET_LEVELS; k++) if (0.97 * ONSET_LEVEL_Q[k] > f.onset[i * R] && f.onset[i * R + 1 + 2 * k] !== 0) unbrokenRunning++;
    }
    // 1 ms (was 0.1 ms): after the 2 m breaking floor (small-swell) the record's Float32 rounding reads 0.175 ms here; a
    // real inversion would be frames, and 1 ms is still far under one.
    expect(worst, "the most a level's time exceeds the level below it (s)").toBeLessThanOrEqual(1e-3);
    expect(unbrokenRunning, 'unbroken levels with a clock running (a broken neighbour blended in)').toBe(0);
  });
  it('the time since onset and the height of the throw match a march up the ray, for the waves that break at the Womb', () => {
    // The record is read between levels (×1.44 apart) and blends four nodes, so it is judged against a march up the ray
    // through the same running maximum, for the default set's smallest, biggest and a 1.5× wave, on every ledge ray.
    // Where sections break and settle (to 30 m inshore) it matches within 0.15 s, and the throw's height within 10% above
    // and 15% below: it is the tallest point in two seconds of travel, and the march takes it on one path, spikes and all
    // (the amplification varies ±5% node to node), where the record blends four nodes' carries. Further in the rays fan out and
    // cross, and the march itself follows one ray of many (60 m in from 16 m up the north ledge it is past the line where
    // the two ledges' rays meet, and reads the other ledge's water): within 10% + 0.2 s and 20%. Sections that barely break (ρ <
    // 1.3, at most half a break's extent) are left out: their ratio hovers at the level for tens of metres (0.301–0.305
    // for 30 m on the north ledge), where no level spacing places the crossing, and they barely collapse.
    const P = DEFAULT_BREAK_PARAMS;
    let checked = 0;
    const ledge: readonly [number, number][] = [...[0, 15, 30, 45, 60, 75].map(onLeft), fromTip(12.5, 14), fromTip(25, 28), fromTip(42, 33)];
    for (const heightM of [1.7, 2.34, 3.5]) for (const [px, pz] of ledge) for (const inshore of [5, 10, 20, 30, 45, 60]) {
      const q = 1 / (heightM * onsetGain(P));
      let x = px, z = pz;
      for (let d = 0; d < inshore; d += 0.5) { const s = sampleField(f, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5; }
      const rec = Float32Array.from(sampleOnset(f, x, z)!);
      if (!(rec[0] >= 1.3 * q)) continue;
      const tau0 = sampleField(f, x, z).tau;
      // Back up the ray in 0.25 m steps to where the running maximum crossed the level ql: the section broke there. The
      // record carries the clock through dips of the running maximum under RUN_DIP (on the softened ramp the ratio creeps
      // past a level for tens of metres), so the march backs through them too and takes the most seaward crossing. The
      // throw is the tallest the crest stood (its height capped by the depth, as the sheet's) in the LIP_THROW_S after.
      const march = (ql: number) => {
        let bx = x, bz = z, prev = { x, z, run: rec[0] }, back = 0, cross: { x: number; z: number; back: number; n: number } | null = null;
        const seen: { tau: number; h: number }[] = [];
        for (let n = 0; n < 4000; n++, back += 0.25) {
          const s = sampleField(f, bx, bz);
          seen.push({ tau: s.tau, h: Math.min(s.amp, (BREAKING_RATIO * s.hmin) / heightM) });
          const nx = bx - s.dirX * 0.25, nz = bz - s.dirZ * 0.25, run = sampleOnset(f, nx, nz)?.[0] ?? 0;
          if (run < ql && prev.run >= ql) {
            const fr = (ql - run) / Math.max(prev.run - run, 1e-9);
            cross = { x: nx + (prev.x - nx) * fr, z: nz + (prev.z - nz) * fr, back: back + 0.25 * (1 - fr), n: seen.length };
          }
          if (run < ql * (1 - RUN_DIP)) break;
          prev = { x: nx, z: nz, run }; bx = nx; bz = nz;
        }
        if (cross) { bx = cross.x; bz = cross.z; back = cross.back; seen.length = cross.n; }
        const ref = sampleField(f, bx, bz);
        return { tb: tau0 - ref.tau, back, throw: Math.max(Math.min(ref.amp, (BREAKING_RATIO * ref.hmin) / heightM), ...seen.filter((p) => p.tau <= ref.tau + LIP_THROW_S).map((p) => p.h)) };
      };
      const at = march(q), refTb = at.tb, refThrow = at.throw, back = at.back;
      // The record keeps the onset at fixed levels (×1.44 apart) and reads between the two around q: where the ratio creeps
      // past them (the softened ramp) it can say no more than that the section broke between those two levels' onsets.
      const lk = Math.min(ONSET_LEVELS - 2, Math.max(0, Math.floor(Math.log(q / ONSET_LEVEL_Q0) / Math.log(ONSET_LEVEL_RATIO))));
      const tLo = march(ONSET_LEVEL_Q[lk]).tb, tHi = march(ONSET_LEVEL_Q[lk + 1]).tb;
      const tb = onsetTime(rec, 0, heightM, P)!, amp = onsetHeight(rec, 0, heightM, P)! / heightM;
      // Where it broke and settled: within 30 m of travel of the break (on the softened ramp sections break up to ~130 m
      // seaward of the ledge, so the distance inshore of the ledge no longer says how far it has run).
      const near = back <= 30;
      const tag = `${heightM} m at (${px}, ${pz}) +${inshore} m`, tol = near ? 0.15 : 0.2 + 0.1 * refTb;
      expect(tb, `${tag}: time since onset ${tb.toFixed(2)} vs the levels' ${tLo.toFixed(2)}–${tHi.toFixed(2)} s (q ${refTb.toFixed(2)})`).toBeGreaterThan(Math.min(tLo, tHi) - tol);
      expect(tb, `${tag}: time since onset ${tb.toFixed(2)} vs the levels' ${tLo.toFixed(2)}–${tHi.toFixed(2)} s (q ${refTb.toFixed(2)})`).toBeLessThan(Math.max(tLo, tHi) + tol);
      const off = (amp - refThrow) / refThrow;
      // Far from the break −30%: on the reef build's face the ledges' rays cross sooner (the march follows one; the record
      // blends four nodes), 1.7 m at (42, 33) +30 m read 27% low (plan 2026-10-02 Task 4).
      expect(off, `${tag}: the throw's height (× the deep-water height) ${amp.toFixed(3)} vs ${refThrow.toFixed(3)}`).toBeGreaterThan(near ? -0.15 : -0.3);
      expect(off, `${tag}: the throw's height (× the deep-water height) ${amp.toFixed(3)} vs ${refThrow.toFixed(3)}`).toBeLessThan(near ? 0.1 : 0.2);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
  it('is off the record outside the grid', () => {
    expect(sampleOnset(f, f.grid.x0 - 1, 0)).toBeNull();
    expect(sampleOnset(f, 0, 0)).not.toBeNull();
  });
});

describe('smoothFieldAmplitude: the field as the game draws it', () => {
  it('smooths the amplitude, direction and depth cap, and leaves every breaking ratio as it was (Andrew, 2026-10-05: "waves going in everywhere")', async () => {
    const { smoothFieldAmplitude } = await import('./reefField');
    const nx = 60, nz = 50, n = nx * nz;
    // Streaky amplitude and depth cap (a ray streak every 4 cells), as over the inside reef.
    const amp = new Float32Array(n), hmin = new Float32Array(n), hb = new Float32Array(n), hs = new Float32Array(n), hl = new Float32Array(n);
    const dirX = new Float32Array(n), dirZ = new Float32Array(n), tau = new Float32Array(n);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = z * nx + x, streak = z % 4 === 0 ? 1.6 : 0.6;
      amp[i] = streak; hmin[i] = z % 5 === 0 ? 1.7 : 2.8; hb[i] = 2 * streak; hs[i] = 1.8 * streak; hl[i] = 1.5 * streak;
      const a = (z % 3) * 0.3; dirX[i] = Math.cos(a); dirZ[i] = Math.sin(a); tau[i] = 0.1 * x + (z % 6 === 0 ? 0.3 : 0);
    }
    const field = { grid: { x0: 0, z0: 0, cellM: 1, nx, nz }, amp, hmin, hminBreak: hb, hminSlurp: hs, hminLean: hl, dirX, dirZ, tau } as unknown as import('./reefField').ReefField;
    const ratios = Array.from(amp, (a, i) => [a / hb[i], a / hs[i], a / hl[i]]);
    const jump = (f: Float32Array): number => { let m = 0; for (let z = 1; z < nz; z++) for (let x = 0; x < nx; x++) m = Math.max(m, Math.abs(f[z * nx + x] - f[(z - 1) * nx + x])); return m; };
    const before = { amp: jump(amp), hmin: jump(hmin), tau: jump(tau) };
    smoothFieldAmplitude(field, 6, 4);
    expect(jump(amp)).toBeLessThan(0.1 * before.amp);
    expect(jump(hmin)).toBeLessThan(0.1 * before.hmin);
    expect(jump(tau)).toBeLessThan(0.5 * before.tau);
    amp.forEach((a, i) => {
      expect(a / hb[i]).toBeCloseTo(ratios[i][0], 5);
      expect(a / hs[i]).toBeCloseTo(ratios[i][1], 5);
      expect(a / hl[i]).toBeCloseTo(ratios[i][2], 5);
      expect(Math.hypot(dirX[i], dirZ[i])).toBeCloseTo(1, 5);
    });
  });
});

describe('until carries the hold (one-curl Task 1)', () => {
  // shelf-polish Task 2 (Fable's ruling): the premise is the game's field on the real shelf: peel 1 (DEFAULT_BREAK_PARAMS, the
  // App's request), the refraction floor, smoothed. Its holds are the curl's, on the Womb's ridden run (within 220 m of the
  // tip). The old premise (peel 1.7, held nodes on the left's first leg stretched from the peak) is the old peak's: on the
  // real shelf the level's one line first breaks at the right's far south end (T ≈ −10 s), so 1.7 holds the left's first
  // 6–21 m at the PEEL_MAX_HOLD_S cap (the third case pins that the cap binds there; it is not in play). Bars unchanged.
  // until = −tb is the bake's identity (the record before smoothFieldAmplitude, which smooths tb and until on their own
  // masks); the carry back along the ray is checked on the field as the game reads it (smoothed).
  const f = computeReefField({ bed: reef1, periodS: 15, fromDeg: 225, tideM: 0, coast: coast1, refractFloorM: REFRACT_FLOOR_M });
  const R = ONSET_RECORD_LENGTH, U = ONSET_UNTIL_OFFSET, { nx, cellM, x0, z0 } = f.grid;
  const heldOn = (onset: Float32Array): { i: number; k: number }[] => {
    const out: { i: number; k: number }[] = [];
    for (let i = 0; i < f.tau.length; i++) {
      const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
      if (Math.hypot(x - TIP[0], z - TIP[1]) > 220) continue;
      for (let k = 0; k < ONSET_LEVELS; k++) if (onset[i * R] >= ONSET_LEVEL_Q[k] && onset[i * R + 1 + 2 * k] < -0.2) out.push({ i, k });
    }
    return out;
  };
  const bake = f.onset.slice(), heldBake = heldOn(bake);
  smoothFieldAmplitude(f);
  const held = heldOn(f.onset);
  it('at a held node until is the hold (−tb), and no node on the ridden run is held at the cap', () => {
    expect(heldBake.length).toBeGreaterThan(100);
    let maxHold = 0;
    for (const { i, k } of heldBake) {
      expect(bake[i * R + U + k], `node ${i} level ${k}`).toBeCloseTo(-bake[i * R + 1 + 2 * k], 4);
      maxHold = Math.max(maxHold, -bake[i * R + 1 + 2 * k]);
    }
    console.log(`game field (peel 1): ${heldBake.length} held nodes within 220 m of the tip, max hold ${maxHold.toFixed(2)} s`);
    expect(maxHold).toBeLessThan(PEEL_MAX_HOLD_S - 0.25);
  });
  it('back along its ray until grows by the arrival time between (no jump at the turn)', () => {
    const errs: string[] = [];
    let checked = 0;
    for (const { i, k } of held) {
      const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM, u0 = f.onset[i * R + U + k];
      for (const cells of [1, 2]) {
        const bx = x - f.dirX[i] * cells * cellM, bz = z - f.dirZ[i] * cells * cellM;
        const rec = sampleOnset(f, bx, bz)!;
        if (rec[0] >= ONSET_LEVEL_Q[k]) continue; // broken back there too: the hold's own record, not the carry
        const err = rec[U + k] - u0 - (f.tau[i] - sampleField(f, bx, bz).tau);
        if (process.env.PROBE_UNTIL) console.log(`ERR ${cells} ${err.toFixed(3)} u0 ${u0.toFixed(2)}`);
        // One cell back the read is (nearly) the node's own ray: 0.02 s. Two cells back the bilinear blends neighbouring rays,
        // whose holds differ along the crest (with the curl a step at a held pocket's edge): within 0.2 s.
        if (Math.abs(err) >= (cells === 1 ? 0.02 : 0.2)) errs.push(`node ${i} level ${k}, ${cells} cell(s) back: ${err.toFixed(3)} s`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(errs).toEqual([]);
  });
  it('at peel 1.7 (not in play) the cap binds on the left\'s first metres: the line first breaks at the right\'s far south end', { timeout: 120_000 }, () => {
    const g = computeReefField({ bed: reef1, periodS: 15, fromDeg: 225, tideM: 0, peel: 1.7, coast: coast1 });
    const [a, b] = [NORTH_LEDGE[0], NORTH_LEDGE[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let atCap = 0;
    for (let i = 0; i < g.tau.length; i++) {
      const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
      const s = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len;
      const off = Math.abs((x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])) / len;
      if (s < 5 || s > 80 || off > 3) continue;
      for (let k = 0; k < ONSET_LEVELS; k++) if (g.onset[i * R] >= ONSET_LEVEL_Q[k] && -g.onset[i * R + 1 + 2 * k] >= PEEL_MAX_HOLD_S - 0.25) atCap++;
    }
    console.log(`peel 1.7: ${atCap} nodes on the left's first 5–80 m held within 0.25 s of the ${PEEL_MAX_HOLD_S} s cap`);
    expect(atCap).toBeGreaterThan(0);
  });
});

/** Points every `step` m along a polyline's first `metres` (its distance from the start, and the point). */
const walk = (line: readonly (readonly [number, number])[], metres: number, step: number): { s: number; x: number; z: number }[] => {
  const out: { s: number; x: number; z: number }[] = [];
  for (let sAt = 0; sAt <= metres; sAt += step) {
    let base = 0;
    for (let j = 0; j + 1 < line.length; j++) {
      const [a, b] = [line[j], line[j + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (sAt <= base + len || j + 2 === line.length) { const d = sAt - base; out.push({ s: sAt, x: a[0] + ((b[0] - a[0]) * d) / len, z: a[1] + ((b[1] - a[1]) * d) / len }); break; }
      base += len;
    }
  }
  return out;
};

describe('one curl per breaking line, in the bake (one-curl Task 2)', () => {
  const h6 = setWaveHeight(6), P = DEFAULT_BREAK_PARAMS, R = ONSET_RECORD_LENGTH;
  const k = Math.floor(Math.log(1 / (h6 * onsetGain(P) * ONSET_LEVEL_Q0)) / Math.log(ONSET_LEVEL_RATIO));
  it("along the north ledge's first 120 m the 6 ft level's onset (as held) never comes earlier down the line", () => {
    const f = f225;
    const pts: { s: number; T: number }[] = [];
    for (const p of walk(NORTH_LEDGE, 120, 1)) {
      // 4 m inshore along the swell: the level has broken there, and τ − tb (stretched) is its ray's curl time.
      const d = sampleField(f, p.x, p.z), x = p.x + 4 * d.dirX, z = p.z + 4 * d.dirZ;
      const rec = sampleOnset(f, x, z);
      if (!rec || rec[0] < ONSET_LEVEL_Q[k]) continue;
      pts.push({ s: p.s, T: sampleField(f, x, z).tau - rec[1 + 2 * k] });
    }
    expect(pts.length).toBeGreaterThan(80);
    let worst = 0, at = 0, latest = -Infinity;
    for (const q of pts) { if (latest - q.T > worst) { worst = latest - q.T; at = q.s; } latest = Math.max(latest, q.T); }
    if (process.env.PROBE_CURL) console.log(`level ${k}: ${pts.map((q) => `${q.s}:${q.T.toFixed(2)}`).join(' ')}`);
    expect(worst, `the most the onset comes early down the line (s), at ${at} m`).toBeLessThanOrEqual(0.05);
  });
});

describe('the curl pass leaves a reef with no pockets as it was (one-curl Task 2, Review Focus 1)', () => {
  // The peel stretch tests' synthetic shelf (peelStretch.test.ts): the swell runs +x at 8 m/s over a 1 m grid and every
  // level breaks along x = line(z) + 15·ln(q/0.3).
  const NX = 140, NZ = 120, C = 8, R = ONSET_RECORD_LENGTH;
  const shelf = (line: (z: number) => number, curl: boolean, curlMaxMs?: number) => {
    const n = NX * NZ, grid = { x0: 0, z0: 0, cellM: 1, nx: NX, nz: NZ };
    const tau = new Float32Array(n), amp = new Float32Array(n).fill(1), hmin = new Float32Array(n).fill(6), hminBreak = new Float32Array(n);
    const kk = new Float32Array(n), dirX = new Float32Array(n).fill(1), dirZ = new Float32Array(n), fixed = new Uint8Array(n);
    const psiHere = new Float32Array(n * ONSET_LEVELS).fill(0.05), omega = (2 * Math.PI) / 14;
    for (let row = 0; row < NZ; row++) for (let col = 0; col < NX; col++) {
      const i = row * NX + col;
      tau[i] = col / C; kk[i] = omega / C; hminBreak[i] = 1 / (0.3 * Math.exp((col - line(row)) / 15));
    }
    const order = Uint32Array.from(Array.from({ length: n }, (_, i) => i).sort((a, b) => tau[a] - tau[b] || a - b));
    return computeOnsetRecord({ grid, tau, amp, hmin, hminBreak, k: kk, dirX, dirZ, fixed, order, omega, psiHere, peel: 1, curl, curlMaxMs });
  };
  it('a line breaking ever later down the line: the record is the same with the curl (unbounded) as without', () => {
    const line = (z: number) => 30 + 0.25 * z;
    const a = shelf(line, false), b = shelf(line, true, Infinity);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    expect(worst).toBeLessThanOrEqual(1e-6);
  });
  it('a pocket down the line: only the pocket is held, up to its cap, and the line before it is as it was', () => {
    // From row 0 the line breaks later row by row (0.03 s per metre of crest); rows 70–80 jut 8 m seaward (break 1 s early).
    const line = (z: number) => 30 + 0.25 * z - (z >= 70 && z <= 80 ? 8 : 0);
    const a = shelf(line, false), b = shelf(line, true, Infinity);
    const lvl = 3, slot = 1 + 2 * lvl, at = (r: Float32Array, row: number, j: number) => r[(row * NX + 130) * R + j];
    for (let row = 0; row < 66; row++) expect(Math.abs(at(b, row, slot) - at(a, row, slot)), `row ${row}`).toBeLessThanOrEqual(1e-6);
    for (let row = 72; row <= 78; row++) {
      const d = at(b, row, ONSET_DELAY_OFFSET + lvl);
      expect(d, `row ${row} held`).toBeGreaterThan(0.5);
      expect(d, `row ${row} capped`).toBeLessThanOrEqual(PEEL_MAX_HOLD_S);
    }
  });
});
