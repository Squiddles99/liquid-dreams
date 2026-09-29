import { describe, expect, it } from 'vitest';
import { type Bathymetry, buildBathymetry, downsample } from '../seabed/bathymetry';
import { depthBg } from '../seabed/coastProfile';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { AMP_CAP, farSample } from './coastFarField';
import type { FieldSample } from './fieldSample';
import { computeReefField, maxAlongCrest, sampleField, sampleOnset, smoothAlongCrest, smoothAlongTravel } from './reefField';
import { DEFAULT_BREAK_PARAMS, LIP_THROW_S, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, onsetGain, onsetHeight, onsetTime } from './breaking';
import { BREAKING_RATIO } from './setWaveModel';

const reef05 = buildBathymetry();
const reef1 = downsample(reef05, 2);
const reef2 = downsample(reef05, 4);
// Solve the full 1 m field once (~1 s) and share it between the tests that inspect it.
const f225 = computeReefField({ bed: reef1, periodS: 15, fromDeg: 225, tideM: 0 });

function coastOnly(): Bathymetry {
  const grid = { x0: -400, z0: -100, cellM: 2, nx: 326, nz: 101 };
  const bed = new Float32Array(grid.nx * grid.nz);
  for (let r = 0; r < grid.nz; r++) for (let c = 0; c < grid.nx; c++) bed[r * grid.nx + c] = -depthBg(grid.x0 + c * grid.cellM);
  return { grid, bed, sand: new Float32Array(bed.length).fill(1), weed: new Float32Array(bed.length) };
}

const allFinite = (a: Float32Array) => a.every(Number.isFinite);
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
    expect(Math.abs(sampleField(f, 0, 0).tau)).toBeLessThan(0.05);
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
  it('a grazing swell (exactly 270°) does not source the whole south edge as a numerical caustic', { timeout: 20_000 }, () => {
    // dirZ is float residue of cos(90°) at exactly 270°; a bare `< 0` edge-source test used to treat that residue's
    // sign as real inflow and source the whole south edge from the far field, capping a line of cells at AMP_CAP.
    const cappedCount = (fromDeg: number) => {
      const f = computeReefField({ bed: reef1, periodS: 15, fromDeg, tideM: 0 });
      let count = 0;
      for (const v of f.amp) if (v >= AMP_CAP - 1e-6) count++;
      return count;
    };
    // 269.9° is a real, non-grazing direction: the reef genuinely focuses a cluster of cells to AMP_CAP near the
    // south edge, so a low count at 270° isn't just "nothing ever gets capped there".
    expect(cappedCount(269.9)).toBeGreaterThan(100);
    expect(cappedCount(270)).toBe(0);
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

describe('the onset record', () => {
  const f = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
  const R = ONSET_RECORD_LENGTH;
  it("its running maximum of amp/hminBreak is never below the node's own, and never falls along a ray", () => {
    const n = f.tau.length;
    for (let i = 0; i < n; i += 97) expect(f.onset[i * R]).toBeGreaterThanOrEqual(f.amp[i] / f.hminBreak[i] - 1e-6);
    // Along rays through both ledges: sampled every 0.5 m, 60 m in from 40 m out. Not through the wedge's tip: ~26 m
    // inshore of it the rays from the two ledges meet (the field's direction swings 40° in 2 m), and past that line the
    // water is the other ledge's rays, with their own maximum.
    for (const [px, pz] of [[11, -30], [27, -75], [25, 28]] as const) {
      let x = px, z = pz;
      for (let d = 0; d < 40; d += 0.5) { const s = sampleField(f, x, z); x -= s.dirX * 0.5; z -= s.dirZ * 0.5; }
      let last = 0;
      for (let d = 0; d <= 80; d += 0.5) {
        const r = sampleOnset(f, x, z)!;
        // Where sections break and settle, to 40 m inshore of the ledge: within 2% (bilinear between nodes). Further in the
        // rays fan out onto neighbours that broke less hard, and it eases off slowly: long settled by then, and the
        // lifecycle is continuous in it.
        expect(r[0], `(${px}, ${pz}) + ${d} m`).toBeGreaterThanOrEqual(last * 0.98);
        last = Math.max(last, r[0]);
        const s = sampleField(f, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5;
      }
    }
  });
  it('a higher level breaks no earlier: at every node the time since onset never rises from level to level, 0 where unbroken', () => {
    let worst = 0, unbrokenRunning = 0;
    for (let i = 0; i < f.tau.length; i += 13) {
      for (let k = 1; k < ONSET_LEVELS; k++) worst = Math.max(worst, f.onset[i * R + 1 + 2 * k] - f.onset[i * R + 1 + 2 * (k - 1)]);
      // Unbroken: the running maximum below the level by more than the dips the carry bridges (3%).
      for (let k = 0; k < ONSET_LEVELS; k++) if (0.97 * ONSET_LEVEL_Q[k] > f.onset[i * R] && f.onset[i * R + 1 + 2 * k] !== 0) unbrokenRunning++;
    }
    expect(worst, "the most a level's time exceeds the level below it (s)").toBeLessThanOrEqual(1e-4);
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
    const ledge: readonly [number, number][] = [[0, 0], [5.5, -15], [11, -30], [16.4, -45], [21.9, -60], [27, -75], [12.5, 14], [25, 28], [42, 33]];
    for (const heightM of [1.7, 2.34, 3.5]) for (const [px, pz] of ledge) for (const inshore of [5, 10, 20, 30, 45, 60]) {
      const q = 1 / (heightM * onsetGain(P));
      let x = px, z = pz;
      for (let d = 0; d < inshore; d += 0.5) { const s = sampleField(f, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5; }
      const rec = Float32Array.from(sampleOnset(f, x, z)!);
      if (!(rec[0] >= 1.3 * q)) continue;
      const tau0 = sampleField(f, x, z).tau;
      // Back up the ray in 0.25 m steps to where the running maximum drops below q: the section broke there. The throw is
      // the tallest the crest stood (its height capped by the depth, as the sheet's) in the LIP_THROW_S after that.
      let bx = x, bz = z, prev = { x, z, run: rec[0] };
      const seen: { tau: number; h: number }[] = [];
      for (let n = 0; n < 4000; n++) {
        const s = sampleField(f, bx, bz);
        seen.push({ tau: s.tau, h: Math.min(s.amp, (BREAKING_RATIO * s.hmin) / heightM) });
        const nx = bx - s.dirX * 0.25, nz = bz - s.dirZ * 0.25, run = sampleOnset(f, nx, nz)?.[0] ?? 0;
        if (run < q) {
          const fr = (q - run) / Math.max(prev.run - run, 1e-9);
          bx = nx + (prev.x - nx) * fr; bz = nz + (prev.z - nz) * fr;
          break;
        }
        prev = { x: nx, z: nz, run }; bx = nx; bz = nz;
      }
      const ref = sampleField(f, bx, bz), refTb = tau0 - ref.tau;
      const refThrow = Math.max(Math.min(ref.amp, (BREAKING_RATIO * ref.hmin) / heightM), ...seen.filter((p) => p.tau <= ref.tau + LIP_THROW_S).map((p) => p.h));
      const tb = onsetTime(rec, 0, heightM, P)!, amp = onsetHeight(rec, 0, heightM, P)! / heightM;
      const near = inshore <= 30;
      const tag = `${heightM} m at (${px}, ${pz}) +${inshore} m`;
      expect(Math.abs(tb - refTb), `${tag}: time since onset ${tb.toFixed(2)} vs ${refTb.toFixed(2)} s`).toBeLessThan(near ? 0.15 : 0.2 + 0.1 * refTb);
      const off = (amp - refThrow) / refThrow;
      expect(off, `${tag}: the throw's height (× the deep-water height) ${amp.toFixed(3)} vs ${refThrow.toFixed(3)}`).toBeGreaterThan(near ? -0.15 : -0.2);
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
