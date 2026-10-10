// shelf-polish Task 3: where the ribbon's run ends vs where the crest still breaks. Per band (225°, mid tide, the biggest wave
// of the first set after 300 s, as _retuneMoments) at t + times: the trace's runs at its reach (TRACE_REACH_M, or --reach), each
// run's ends (x, z, m from the tip), and every 10 m of crest past the default reach: r, tb, phase, hollow, ρ, alive.
// npx tsx tools/_ribbonRun.ts [--bands=Pumping,Huge] [--times=3,5] [--reach=400]
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { DEFAULT_SET_PARAMS, wavesBetween } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { SWELL_BANDS } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const { TIP } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const sw = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const ct = await imp<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
const ws = await imp<typeof import('../src/breaker/wombSection')>('/src/breaker/wombSection.ts');
const { coastReefField } = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
// --camera=x,z: the game's spacing rule from that camera (the stand: 208.3,60.8) instead of 2 m; prints each run's spacing.
const cam = arg('camera')?.split(',').map(Number);
const bands = (arg('bands') ?? 'Pumping,Huge').split(','), times = (arg('times') ?? '3,5').split(',').map(Number), reach = Number(arg('reach') ?? 400);
const d = (x: number, z: number) => Math.hypot(x - TIP[0], z - TIP[1]);
for (const label of bands) {
  const b = SWELL_BANDS.find((x) => x.label === label)!;
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = b.ft; c.swell.periodS = b.periodS; c.swell.directionDeg = 225; c.tideM = 0;
  const waves = wavesBetween(300, 900, c, DEFAULT_SET_PARAMS), set = waves.filter((w) => w.slot === waves[0].slot);
  const big = set.reduce((a, w) => (w.heightM > a.heightM ? w : a));
  const field = coastReefField({ periodS: b.periodS, fromDeg: 225, tideM: 0, peel: true });
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const all = wavesBetween(big.arrivalS - 60, big.arrivalS + 60, c, DEFAULT_SET_PARAMS).map(sw.toActiveWave);
  const minH = ct.minRibbonHeight(sw.fieldBreakingHeight(field, P), P);
  { const g = field.grid; console.log(`grid x ${g.x0}..${g.x0 + (g.nx - 1) * g.cellM}, z ${g.z0}..${g.z0 + (g.nz - 1) * g.cellM}`); }
  for (const dt of times) {
    const t = big.arrivalS + dt;
    for (const R of [ct.TRACE_REACH_M, reach]) {
      const e = ct.traceStations(field, all, t, ctx, { cameraX: TIP[0], cameraZ: TIP[1], params: P, minHeightM: minH, spacingM: cam ? undefined : 2, reachM: R, ...(cam ? { cameraX: cam[0], cameraZ: cam[1] } : {}) });
      const runs: { x: number; z: number; wave: number }[][] = [[]];
      for (const s of e) { if (s.gap) runs.push([]); else runs[runs.length - 1].push(s); }
      const desc = runs.filter((r) => r.length).map((r) => { const a = r[0], z = r[r.length - 1]; const sp = r.slice(1).map((q, i) => Math.hypot(q.x - r[i].x, q.z - r[i].z)); const spTxt = cam && sp.length ? ` sp ${Math.min(...sp).toFixed(2)}-${Math.max(...sp).toFixed(2)} m` : ''; return `w${r[0].wave} (${(all[r[0].wave].arrivalS - big.arrivalS).toFixed(1)} s, ${all[r[0].wave].heightM.toFixed(2)} m) ${r.length} st (${a.x.toFixed(0)}, ${a.z.toFixed(0)}) ${d(a.x, a.z).toFixed(0)} m -> (${z.x.toFixed(0)}, ${z.z.toFixed(0)}) ${d(z.x, z.z).toFixed(0)} m${spTxt}`; });
      console.log(`${label} ${big.heightM.toFixed(2)} m t+${dt} reach ${R}: ${desc.join(' | ')}`);
    }
  }
}
// the crest past the reach, sampled: rerun with every station (not only alive): traceStations drops the dead ones, so walk via a reach sweep
void ws;

// --crest: the crest's numbers across the inside leg (rows z, the crest found by ξ's sign change along x), as a station there
// would read them (stationOnset, sectionNumbers, curlWeight), the sheet's height at the crest and its drop 3 m ahead.
if (process.argv.includes('--crest')) {
  const { sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
  const { breakingRatio } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
  const z0 = Number(arg('z0') ?? -120), z1 = Number(arg('z1') ?? -360), dz = Number(arg('dz') ?? -10);
  for (const label of bands) {
    const b = SWELL_BANDS.find((x) => x.label === label)!;
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = b.ft; c.swell.periodS = b.periodS; c.swell.directionDeg = 225; c.tideM = 0;
    const waves = wavesBetween(300, 900, c, DEFAULT_SET_PARAMS), set = waves.filter((w) => w.slot === waves[0].slot);
    const big = set.reduce((a, w) => (w.heightM > a.heightM ? w : a));
    const field = coastReefField({ periodS: b.periodS, fromDeg: 225, tideM: 0, peel: true });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o = sw.breakOptions(field, P);
    const near = wavesBetween(big.arrivalS - 60, big.arrivalS + 60, c, DEFAULT_SET_PARAMS).map(sw.toActiveWave);
    for (const dt of times) {
      const t = big.arrivalS + dt;
      console.log(`${label} t+${dt}: z | crest x, m from tip | H r | tb until | phase rho curlW | sheet eta, drop 3 m ahead`);
      for (const w of near) for (let z = z0; dz > 0 ? z <= z1 : z >= z1; z += dz) {
        if (Math.abs(w.arrivalS - big.arrivalS) > 40) continue;
        let prev = NaN, xc = NaN;
        for (let x = -220; x <= 120; x += 0.5) {
          const xi = sw.phaseXi(x, z, t, sampleField(field, x, z), w, ctx);
          if (Number.isFinite(prev) && prev > 0 !== xi > 0 && Math.abs(xi - prev) < 1) { xc = x - 0.25; }
          prev = xi;
        }
        if (!Number.isFinite(xc)) continue;
        const f = sampleField(field, xc, z), H = sw.localHeight(w, f);
        const s = { x: xc, z, H, r: breakingRatio(w.heightM * f.amp, f.hminBreak, P), tb: null as number | null, until: null as number | null };
        ct.stationOnset(field, w, s, P);
        const Hb = s.tb !== null ? ct.stationSize(field, w, s, P) : null;
        const sec = ws.sectionNumbers({ H, Hb, r: s.r, tb: s.tb, until: s.until, psi: ct.stationPsi(field, w, xc, z, { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0 }), periodS: b.periodS }, { ribbonOnset: P.ribbonOnset });
        const eta = (x: number, zz: number) => sw.sumWaves(x, zz, t, sampleField(field, x, zz), near, ctx, o).eta;
        const e0 = eta(xc, z), e3 = eta(xc + 3 * f.dirX, z + 3 * f.dirZ);
        const wFar = ((u) => u * u * (3 - 2 * u))(Math.min(1, Math.max(0, (d(xc, z) - sw.TAPER_NEAR_M) / (sw.TAPER_FAR_M - sw.TAPER_NEAR_M))));
        const q = (2 * (-(xc - TIP[0]) * w.travelZ + (z - TIP[1]) * w.travelX - w.crestOffsetM)) / w.crestLengthM, lat = 1 + (Math.exp(-(q ** 4)) - 1) * wFar;
        console.log(`  w ${(w.arrivalS - big.arrivalS).toFixed(1)} s ${w.heightM.toFixed(2)} m z ${z}: ${xc.toFixed(1)}, ${d(xc, z).toFixed(0)} | ${H.toFixed(2)} ${s.r.toFixed(2)} | ${s.tb?.toFixed(2) ?? 'null'} ${s.until?.toFixed(2) ?? 'null'} | ${sec.phase.toFixed(2)} ${sec.rho.toFixed(2)} ${ws.curlWeight(sec).toFixed(3)} h ${sec.hollow.toFixed(2)} | ${e0.toFixed(2)} ${(e0 - e3).toFixed(2)} | lateral ${lat.toFixed(3)}`);
      }
    }
  }
}
