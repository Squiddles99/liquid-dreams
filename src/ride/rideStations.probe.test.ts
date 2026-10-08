import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_REEF_PARAMS } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesBetween, wavesNear } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS as P } from '../breaker/breaking';
import { MIN_SPACING_M, type Station, type StationEntry, minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from '../breaker/reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { CurveCache, RIDE_STATION_SPACING_M, RIDE_WARM_PASSES, type SheetFrom, thinStations, withSections } from './sectionWater';
import { INVERT_ITERATIONS, type WaterFn, waterAt } from './water';
import { type RideEvent, TUNING, startBody, stepRide } from './ridePhysics';
import { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } from './takeoff';

/**
 * Plan 2026-10-07 ride-framerate addendum probe (R9: the reference and every variant but the lazy ones build dense curves, as
 * before R9) (PROBE_RIDE_STATIONS=1; run with --silent=false). R3's rider (a 35° line,
 * intermediate) at 6 ft and 12 ft, driven on today's water (every station, curves built fresh). At every frame she is on
 * a section, each variant's section under the board beside it: max |Δy| and max |Δslope|; and the station curves a
 * physics step builds on each variant's water (a copy of the body stepped on it), per frame.
 */
interface Variant {
  name: string;
  /** This frame's water from the frame's sheet and stations (`arrivals`: each station's wave's arrival); `stats.curves`
   * counts the curves it builds. */
  water: (sheet: WaterFn, entries: StationEntry[], tideM: number, arrivals: readonly number[], stats: { curves: number }, along: SheetFrom) => WaterFn;
  /** Called once a frame. */
  nextFrame?: () => void;
}
/** A cache kept across frames, keyed by the station's wave arrival and its arc in `bucketM` buckets. */
const kept = (name: string, maxAge: number, bucketM: number, thin: number | null): Variant => {
  let arrivals: readonly number[] = [];
  const cache = new CurveCache(maxAge, (s: Station) => `${arrivals[s.wave]}|${Math.round(s.arc / bucketM)}`);
  return {
    name,
    water: (sheet, entries, tide, arr, stats) => { arrivals = arr; return withSections(sheet, thin === null ? entries : thinStations(entries, thin), tide, { stats, kept: cache }); },
    nextFrame: () => cache.nextFrame(),
  };
};
const variants = (): Variant[] => ([
  { name: 'direct', water: (sheet, entries, tide, _a, stats) => withSections(sheet, entries, tide, { stats, dense: true }) },
  { name: 'lazy (R9)', water: (sheet, entries, tide, _a, stats) => withSections(sheet, entries, tide, { stats }) },
  { name: `lazy + warm ${RIDE_WARM_PASSES} passes (R8, not the game)`, water: (sheet, entries, tide, _a, stats, at) => withSections(sheet, entries, tide, { stats, along: { at, passes: RIDE_WARM_PASSES } }) },
  ...[RIDE_STATION_SPACING_M, 0.5, 0.25].map((m): Variant => ({ name: `thinned ${m} m`, water: (sheet, entries, tide, _a, stats) => withSections(sheet, thinStations(entries, m), tide, { stats, dense: true }) })),
  ...[1, 2, 4].map((a) => kept(`kept ${a}, every station, ${MIN_SPACING_M} m buckets`, a, MIN_SPACING_M, null)),
  ...[1, 2, 4].map((a) => kept(`kept ${a}, thinned 1 m (R7 as written)`, a, 1, 1)),
  { name: 'cold 12 passes (converged)', water: (sheet, entries, tide, _a, stats, at) => withSections(sheet, entries, tide, { stats, dense: true, along: { at: (x, z) => at(x, z, undefined, 12), passes: 12 } }) },
  ...[1, 2, 3].map((passes): Variant => ({ name: `warm ${passes} pass${passes > 1 ? 'es' : ''} (R8)`, water: (sheet, entries, tide, _a, stats, at) => withSections(sheet, entries, tide, { stats, dense: true, along: { at, passes } }) })),
] as Variant[]).filter((v) => !process.env.PROBE_VARIANTS || new RegExp(process.env.PROBE_VARIANTS).test(v.name));

describe.runIf(process.env.PROBE_RIDE_STATIONS)('probe: the ride’s stations thinned and their curves kept', () => {
  it.each([6, 12])('%i ft intermediate', { timeout: 1_800_000 }, (ft) => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = ft;
    const field = computeReefField({ bed: downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: P.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const set = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
    const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
    const VARIANTS = variants();
    const frame = (t: number, cx: number, cz: number): { sheet: WaterFn; along: SheetFrom; entries: StationEntry[]; arrivals: number[] } => {
      const events = wavesNear(t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const along: SheetFrom = (x, z, start, passes) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o), start, passes);
      return { sheet, along, entries: traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM }), arrivals: events.map((e) => e.arrivalS) };
    };
    const { x: sx, z: sz } = takeoffSpot(field, big.heightM, P);
    let t = big.arrivalS - takeoffLeadS(field, { x: sx, z: sz });
    const arrive = t + TAKEOFF_ARRIVE_S, PADDLE_FROM_S = 2;
    const f0 = frame(t, sx, sz), start = withSections(f0.sheet, f0.entries, c.tideM)(sx, sz);
    const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
    const b = startBody(sx, sz, swellHeading, withSections(f0.sheet, f0.entries, c.tideM));
    const line = swellHeading - 35;
    const dt = 1 / 60, tune = TUNING.intermediate, events: RideEvent[] = [];
    const rowsOf = VARIANTS.map(() => ({ dy: 0, ds: 0, curves: 0, all: [] as number[], over: [] as number[], worst: '', sums: 0 }));
    let popped = false, rows = 0, savedNormal = false;
    for (let k = 0; k < 60 * 20; k++) {
      t += dt;
      const fr = frame(t, b.x, b.z);
      for (const v of VARIANTS) v.nextFrame?.();
      const water = withSections(fr.sheet, fr.entries, c.tideM, { dense: true });
      if (b.phase === 'paddle' && !popped) b.headingDeg = swellHeading;
      const err = ((b.headingDeg - line + 540) % 360) - 180;
      const under = water(b.x, b.z);
      const popup = b.phase === 'paddle' && b.caught && !popped && Math.hypot(under.slopeX, under.slopeZ) > 0.6;
      if (popup) popped = true;
      const input = { paddle: b.phase === 'paddle' && t > arrive - PADDLE_FROM_S, steer: popped ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup };
      if (under.onSection) {
        rows++;
        // Task 10 (PROBE_SHEET_NORMAL=<file>): the first 12 ft frame on the clamped-steep wall, its nearest station's sheet
        // along the normal, 400 samples over ±8 A, for the wave-form work (the sharp feature: the step crease?).
        if (process.env.PROBE_SHEET_NORMAL && ft === 12 && !savedNormal && Math.hypot(under.slopeX, under.slopeZ) >= 1.99) {
          const near = fr.entries.filter((e): e is Station => !e.gap).map((st) => ({ st, v: Math.abs(-(b.x - st.x) * st.nz + (b.z - st.z) * st.nx), u: (b.x - st.x) * st.nx + (b.z - st.z) * st.nz })).sort((p, q) => p.v - q.v)[0];
          if (near) {
            const st = near.st, A = st.section.A, lines = [
              `# 12 ft, t ${t.toFixed(3)} s: the board on the section at u ${near.u.toFixed(3)} m (slope under it ${Math.hypot(under.slopeX, under.slopeZ).toFixed(2)}, clamped at 2)`,
              `# station x ${st.x.toFixed(3)} z ${st.z.toFixed(3)} n (${st.nx.toFixed(4)}, ${st.nz.toFixed(4)}) A ${A.toFixed(4)} phase ${st.section.phase.toFixed(4)} hollow ${st.section.hollow.toFixed(4)} rho ${st.section.rho.toFixed(3)} H ${st.H.toFixed(3)}`,
              '# u (m, along the normal) | u/A | sheet y above still water (m) | slope dy/du | label offset along n (m)',
            ];
            for (let i = 0; i < 400; i++) {
              const u = -8 * A + (16 * A * i) / 399, w = fr.sheet(st.x + st.nx * u, st.z + st.nz * u), y = w.y - c.tideM;
              const slope = w.slopeX * st.nx + w.slopeZ * st.nz, lab = ((w.lx ?? 0) - st.x) * st.nx + ((w.lz ?? 0) - st.z) * st.nz;
              lines.push(`${u.toFixed(4)} | ${(u / A).toFixed(4)} | ${y.toFixed(4)} | ${slope.toFixed(3)} | ${lab.toFixed(4)}`);
            }
            writeFileSync(process.env.PROBE_SHEET_NORMAL, lines.join('\n') + '\n');
            savedNormal = true;
          }
        }
        const refV = process.env.PROBE_REF ? VARIANTS.find((v) => new RegExp(process.env.PROBE_REF!).test(v.name)) : undefined;
        const ref = refV ? refV.water(fr.sheet, fr.entries, c.tideM, fr.arrivals, { curves: 0 }, fr.along)(b.x, b.z) : under;
        VARIANTS.forEach((v, i) => {
          const r = rowsOf[i];
          // Wave sums: a sheet read is INVERT_ITERATIONS + 1 of them, an along read its passes + 1.
          const sheetC: WaterFn = (x, z) => { r.sums += INVERT_ITERATIONS + 1; return fr.sheet(x, z); };
          const alongC: SheetFrom = (x, z, st, p) => { r.sums += p + 1; return fr.along(x, z, st, p); };
          const stats = { curves: 0 }, w = v.water(sheetC, fr.entries, c.tideM, fr.arrivals, stats, alongC);
          const got = w(b.x, b.z);
          const d = Math.abs(got.y - ref.y);
          r.all.push(d);
          if (d > 0.02) r.over.push(Math.hypot(under.slopeX, under.slopeZ));
          if (d > r.dy && process.env.PROBE_DETAIL) {
            const near = fr.entries.filter((e): e is Station => !e.gap).map((s) => ({ s, v: -(b.x - s.x) * s.nz + (b.z - s.z) * s.nx, u: (b.x - s.x) * s.nx + (b.z - s.z) * s.nz })).filter((q) => Math.abs(q.v) < 1.5).sort((p, q) => p.v - q.v);
            const kept = new Set(thinStations(fr.entries, RIDE_STATION_SPACING_M));
            r.worst = `t ${t.toFixed(3)} slope under ${Math.hypot(under.slopeX, under.slopeZ).toFixed(2)} y ${under.y.toFixed(3)} vs ${got.y.toFixed(3)} (on ${!!got.onSection}); stations by v: ` + near.map((q) => `${kept.has(q.s) ? '*' : ''}v${q.v.toFixed(2)} u${q.u.toFixed(2)} ph${q.s.section.phase.toFixed(3)} A${q.s.section.A.toFixed(2)} rho${q.s.section.rho.toFixed(2)}`).join(', ');
          }
          r.dy = Math.max(r.dy, d);
          r.ds = Math.max(r.ds, Math.hypot(got.slopeX - ref.slopeX, got.slopeZ - ref.slopeZ));
          stepRide(structuredClone(b), input, w, dt, tune);
          r.curves += stats.curves;
        });
      }
      const ev = stepRide(b, input, water, dt, tune);
      if (ev) events.push(ev);
      if (ev === 'wipeout' || ev === 'kickout') break;
    }
    const out = [`${ft} ft: ${rows} rows on a section; events ${events.join(' ')}; reference ${process.env.PROBE_REF ?? 'direct'}`, 'variant | max |Δy| cm | max |Δslope| | curves built per frame (one physics step)'];
    VARIANTS.forEach((v, i) => {
      const r = rowsOf[i], sorted = [...r.all].sort((p, q) => p - q), pc = (f: number): string => (100 * (sorted[Math.floor(f * (sorted.length - 1))] ?? 0)).toFixed(2);
      out.push(`${v.name} | ${(100 * r.dy).toFixed(2)} | ${r.ds.toFixed(4)} | ${(r.curves / Math.max(1, rows)).toFixed(1)} | wave sums per frame ${(r.sums / Math.max(1, rows)).toFixed(0)} | p50 ${pc(0.5)} p95 ${pc(0.95)} p99 ${pc(0.99)} cm, rows > 2 cm ${sorted.filter((d) => d > 0.02).length}`);
      if (r.over.length) out.push(`  slope under the board on the rows > 2 cm: ${r.over.map((x) => x.toFixed(2)).join(' ')}`);
      if (r.worst) out.push(`  worst: ${r.worst.slice(0, 400)}`);
    });
    console.log(out.join('\n'));
  });
});
