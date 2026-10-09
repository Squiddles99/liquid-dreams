// womb-retune Task 2 (spec §3): the reef sweep. NORTH_LEDGE's leg-0 bearing × leg-1 bearing × ledgeDepthM (plus lever 3/4
// rows on request), legs kept at today's lengths and leg 2 due north from leg 1's end. Each row at 225°, mid tide, on the
// coast-seeded field (the dial at the coast seed, Task 1): per band the first leg (peel, hollow, start, broken), the first
// break's depth and distance off the ledge, the second leg's peel, leg 2's peel and the right (south ledge, legs 0 and 1:
// start, peel); then 202° and 247° first-leg peel at the row's two middle offered bands. A band is OFFERED when the
// select rule holds (first leg 28/28-of-its-points broken, start ≤ 2.0 s, peel 8–13 m/s). PASS = every §3 target met.
// The coast field is solved once per swell over today's reef and reused for every row (`--rebuild-coast` solves it per
// row: the check that reuse moves nothing that matters).
// Task 2b (--tip): the take-off moves seaward (Andrew's ruling 2026-10-09). Rows: tip x {-100, -130, -160} (z 0) x the
// left's one 42 deg ledge {150, 180, 210} m, then due north (the inside); the right is SOUTH_LEDGE moved to the tip; ledge
// 3.5, face 15/15, shelf 4. The coast map is rebuilt per row (the reef moves inside the coast's halo). Times are on the
// tip's clock (tau at the tip subtracted). Per band: the first leg, where its first break leaves the ledge by > 5 m (the
// inside takes over), the inside's peel, the right's two legs; 202/247 deg first-leg peel at Pumping and Big.
// Run: npx node tools/_reefSweep.ts <out.txt> [--shard=i/n] [--rows=0,5] [--bands=Fun,Solid,...] [--lever3] [--lever4] [--rebuild-coast] [--tip]
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { REFRACT_FLOOR_M, computeReefField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { computeCoastField } = await imp<typeof import('../src/breaker/coastField')>('/src/breaker/coastField.ts');
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { setWaveHeight, leftStretches, firstBreakDepth } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { DEFAULT_REEF_PARAMS, NORTH_LEDGE, SOUTH_LEDGE, leftLedgeFrom, rightLedgeFrom } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { DEFAULT_COAST_PARAMS } = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const { buildCoastMap } = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const { SWELL_BANDS } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const { sampleField, sampleOnset } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { onsetTime } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');

type Pt = readonly [number, number];
const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => args.includes(`--${k}`);
const bands = SWELL_BANDS.filter((b) => (opt('bands') ?? 'Fun,Solid,Pumping,Big,Huge').split(',').includes(b.label));

// Today's legs: 69.9 m and 47.5 m; bearings from north (−z) toward the beach (+x).
const L0 = Math.hypot(NORTH_LEDGE[1][0], NORTH_LEDGE[1][1]);
const L1 = Math.hypot(NORTH_LEDGE[2][0] - NORTH_LEDGE[1][0], NORTH_LEDGE[2][1] - NORTH_LEDGE[1][1]);
const bearing = (a: Pt, b: Pt) => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
function ledge(b0: number, b1: number): Pt[] {
  const r = Math.PI / 180, p1: Pt = [L0 * Math.sin(b0 * r), -L0 * Math.cos(b0 * r)];
  const p2: Pt = [p1[0] + L1 * Math.sin(b1 * r), p1[1] - L1 * Math.cos(b1 * r)];
  return [[0, 0], p1, p2, [p2[0], -450]];
}

if (flag('tip')) {
  type F = ReturnType<typeof computeReefField>;
  const rowsT: { id: number; tipX: number; lenM: number; bearing: number }[] = [];
  const list = (k: string, d: number[]) => opt(k)?.split(',').map(Number) ?? d;
  // --bearings (womb-retune Task 2b follow-up rows): the left turned further from the crest, to slow its peel.
  for (const bearing of list('bearings', [42])) for (const tipX of list('tips', [-100, -130, -160])) for (const lenM of list('lens', [150, 180, 210])) rowsT.push({ id: rowsT.length, tipX, lenM, bearing });
  let pickT = rowsT;
  if (opt('rows')) { const ids = opt('rows')!.split(',').map(Number); pickT = rowsT.filter((r) => ids.includes(r.id)); }
  if (opt('shard')) { const [i, n] = opt('shard')!.split('/').map(Number); pickT = pickT.filter((_, k) => k % n === i); }
  const f1 = (v: number | undefined | null, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '  –  ' : v.toFixed(d).padStart(5));
  /** Along the left's first leg every 2.5 m: the first broken point on its ray (120 m seaward to 60 m inshore), d m along the
   * ray from the ledge (negative: seaward). `leave`: where the break leaves the ledge for good (> 5 m off it to the ledge's
   * end: the inside or the beach ramp takes over). */
  const leaveAt = (f: F, H: number, a: Pt, b: Pt): { leave: number; len: number; offs: number[] } => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), offs: number[] = [];
    let leave = NaN;
    for (let s = 0; s < L; s += 2.5) {
      let x = a[0] + ((b[0] - a[0]) * s) / L, z = a[1] + ((b[1] - a[1]) * s) / L, hit = NaN;
      for (let d = 0; d < 120; d++) { const sf = sampleField(f, x, z); x -= sf.dirX; z -= sf.dirZ; }
      for (let d = -120; d <= 60 && Number.isNaN(hit); d += 0.5) {
        const r = sampleOnset(f, x, z), sf = sampleField(f, x, z);
        if (r && onsetTime(r, 0, H, P) !== null) hit = d;
        x += sf.dirX * 0.5; z += sf.dirZ * 0.5;
      }
      offs.push(hit);
    }
    // The inside takes over for good: the start of the last run of points > 5 m off the ledge that reaches the ledge's
    // end (NaN: the ledge's last point still breaks on it). Off-ledge runs that return to the ledge (the corner) don't count.
    let i = offs.length;
    while (i > 0 && !(Math.abs(offs[i - 1]) <= 5)) i--;
    if (i < offs.length) leave = i * 2.5;
    return { leave, len: L, offs };
  };
  const lines: string[] = [];
  const out = args.find((a) => !a.startsWith('--'));
  for (const r of pickT) {
    const t0 = Date.now();
    const tip: Pt = [r.tipX, 0], north = leftLedgeFrom(tip, r.lenM, r.bearing), south = rightLedgeFrom(tip);
    const params = { ...DEFAULT_REEF_PARAMS, tip, northLedge: north, southLedge: south };
    const bed = downsample(buildBathymetry(params), 2), coast = buildCoastMap(bed, DEFAULT_COAST_PARAMS);
    const field = (periodS: number, fromDeg: number) => computeReefField({ bed, periodS, fromDeg, tideM: 0, smooth: true, refractFloorM: REFRACT_FLOOR_M, coast });
    const per: { label: string; offered: boolean; peel: number; hollow: number; leave: number; len: number; rightPeel: number[] }[] = [];
    const body: string[] = [];
    let tipDepth = NaN;
    for (const b of bands) {
      const f = field(b.periodS, 225), H = setWaveHeight(b.ft), tTip = sampleField(f, tip[0], tip[1]).tau;
      tipDepth = sampleField(f, tip[0] - 2, tip[1]).depth;
      const st = leftStretches(f, H, north, { first: [0], inside: [1] }, P);
      const rt = leftStretches(f, H, south, { r0: [0], r1: [1] }, P);
      const lv = leaveAt(f, H, north[0], north[1]);
      const a = st.first, start = a ? a.start - tTip : NaN;
      const offered = !!a && a.broken === a.of && start <= 2.0 && a.peel >= 8 && a.peel <= 13;
      per.push({ label: b.label, offered, peel: a?.peel ?? NaN, hollow: a?.hollow ?? NaN, leave: lv.leave, len: lv.len, rightPeel: [rt.r0?.peel ?? NaN, rt.r1?.peel ?? NaN] });
      const offs = lv.offs.filter((_, i) => i % 8 === 0).map((d) => (Number.isNaN(d) ? '–' : d.toFixed(0))).join(' ');
      body.push(`   ${b.label.padEnd(8)} ${offered ? 'OFFER' : '  -  '} | first ${a ? `${a.broken}/${a.of}` : ' – '} start ${f1(start)} peel ${f1(a?.peel)} hollow ${f1(a?.hollow, 2)} | leaves ledge at ${f1(lv.leave, 0)} of ${lv.len.toFixed(0)} m (off every 20 m: ${offs}) | inside ${f1(st.inside?.peel)} h ${f1(st.inside?.hollow, 2)} | right r0 ${f1(rt.r0?.peel)} r1 ${f1(rt.r1?.peel)}`);
    }
    const off = per.filter((p) => p.offered);
    const inner = off.slice(1, -1), mids = inner.length > 2 ? inner.slice(Math.floor((inner.length - 2) / 2), Math.floor((inner.length - 2) / 2) + 2) : off.length >= 3 ? inner : off.slice(-2);
    const fails: string[] = [];
    if (off.length === 0) fails.push('nothing offered');
    for (const p of off) if (!(p.peel >= 9 && p.peel <= 12)) fails.push(`${p.label} peel`);
    for (const p of mids) if (!(p.hollow >= 0.8)) fails.push(`${p.label} hollow`);
    if (off[0] && !(off[0].hollow < 0.6)) fails.push(`${off[0].label} (smallest) hollow ≥ 0.6`);
    const pump = per.find((p) => p.label === 'Pumping');
    if (pump && Number.isFinite(pump.leave) && pump.leave < pump.len - 20) fails.push(`Pumping leaves the ledge at ${pump.leave.toFixed(0)} m`);
    for (const p of off) if (!p.rightPeel.every((v) => !Number.isFinite(v) || v > 18 || v < 0)) fails.push(`${p.label} right peels`);
    const outer: string[] = [];
    for (const label of ['Pumping', 'Big']) for (const fromDeg of [202, 247]) {
      const b = SWELL_BANDS.find((x) => x.label === label)!;
      const st = leftStretches(field(b.periodS, fromDeg), setWaveHeight(b.ft), north, { first: [0] }, P);
      outer.push(`${label} ${fromDeg}° ${f1(st.first?.peel)} (${st.first ? `${st.first.broken}/${st.first.of}` : '–'})`);
    }
    const head = `row ${r.id} | tip (${r.tipX}, 0), ${94 - r.tipX} m off the beach, ${tipDepth.toFixed(1)} m 2 m seaward | left ${r.lenM} m at ${r.bearing}° to (${north[1][0].toFixed(0)}, ${north[1][1].toFixed(0)}), then north`;
    const verdict = fails.length ? `fails: ${fails.join(', ')}` : 'PASS';
    const block = [head, ...body, `   offered [${off.map((p) => p.label).join(', ')}] mids [${mids.map((p) => p.label).join(', ')}] | outer first-leg peel: ${outer.join('; ')}`, `   => ${verdict}   (${((Date.now() - t0) / 1000).toFixed(0)} s)`];
    console.log(block.join('\n'));
    lines.push(...block);
    if (out) writeFileSync(out, lines.join('\n') + '\n');
  }
  process.exit(0);
}

interface Row { id: number; b0: number; b1: number; ledgeDepthM: number; faceWidthM: number; faceBaseDepthM: number; shelfDepthM: number; today?: boolean }
const rows: Row[] = [];
const base = { faceWidthM: DEFAULT_REEF_PARAMS.faceWidthM, faceBaseDepthM: DEFAULT_REEF_PARAMS.faceBaseDepthM, shelfDepthM: DEFAULT_REEF_PARAMS.shelfDepthM };
rows.push({ id: 0, b0: bearing(NORTH_LEDGE[0], NORTH_LEDGE[1]), b1: bearing(NORTH_LEDGE[1], NORTH_LEDGE[2]), ledgeDepthM: DEFAULT_REEF_PARAMS.ledgeDepthM, ...base, today: true });
for (const b0 of [24, 30, 34, 38, 42]) for (const d1 of [20, 15, 9, 5]) for (const ledgeDepthM of [3.5, 3.0, 2.5]) rows.push({ id: rows.length, b0, b1: b0 - d1, ledgeDepthM, ...base });
// Follow-up rows (Task 2.2 rulings): at leg 0 42° (the first leg's best) and today's 3.5 m ledge, leg 1 turned sharper
// (lever 1: the second leg ran 35–80 m/s at every b0 − 5…20), the face (lever 3) and the shelf (lever 4) at leg 1 22°.
if (flag('lever3')) for (const [faceWidthM, faceBaseDepthM] of [[10, 15], [15, 10], [10, 10]]) rows.push({ id: rows.length, b0: 42, b1: 22, ledgeDepthM: 3.5, ...base, faceWidthM, faceBaseDepthM });
if (flag('lever4')) for (const shelfDepthM of [5, 6]) rows.push({ id: rows.length, b0: 42, b1: 22, ledgeDepthM: 3.5, ...base, shelfDepthM });
if (flag('turn')) for (const b1 of [12, 7, 2]) rows.push({ id: rows.length, b0: 42, b1, ledgeDepthM: 3.5, ...base });
if (flag('turn')) for (const b1 of [12, 2]) rows.push({ id: rows.length, b0: 42, b1, ledgeDepthM: 3.5, ...base, shelfDepthM: 5 });

let pick = rows;
if (opt('rows')) { const ids = opt('rows')!.split(',').map(Number); pick = rows.filter((r) => ids.includes(r.id)); }
if (opt('shard')) { const [i, n] = opt('shard')!.split('/').map(Number); pick = pick.filter((_, k) => k % n === i); }

const todayBed = downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2);
const todayCoast = buildCoastMap(todayBed, DEFAULT_COAST_PARAMS);
const coastCache = new Map<string, ReturnType<typeof computeCoastField>>();
const coastFor = (periodS: number, fromDeg: number) => {
  const k = `${periodS}:${fromDeg}`;
  if (!coastCache.has(k)) coastCache.set(k, computeCoastField({ bed: todayCoast, periodS, fromDeg, tideM: 0, refractFloorM: REFRACT_FLOOR_M }));
  return coastCache.get(k)!;
};
/** computeReefField shifts the coast's clock in place: each use gets a copy. */
const copyCoast = (c: ReturnType<typeof computeCoastField>) => ({ ...c, tau: c.tau.slice(), far: { ...c.far, tau: c.far.tau.slice() } });

const f1 = (v: number | undefined | null, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '  –  ' : v.toFixed(d).padStart(5));
const lines: string[] = [];
const out = args.find((a) => !a.startsWith('--'));
for (const r of pick) {
  const t0 = Date.now();
  const north = r.today ? NORTH_LEDGE : ledge(r.b0, r.b1);
  const params = { ...DEFAULT_REEF_PARAMS, ledgeDepthM: r.ledgeDepthM, faceWidthM: r.faceWidthM, faceBaseDepthM: r.faceBaseDepthM, shelfDepthM: r.shelfDepthM, ...(r.today ? {} : { northLedge: north }) };
  const bed = downsample(buildBathymetry(params), 2);
  const ownCoast = flag('rebuild-coast') ? buildCoastMap(bed, DEFAULT_COAST_PARAMS) : null;
  const field = (periodS: number, fromDeg: number) => computeReefField({ bed, periodS, fromDeg, tideM: 0, smooth: true, refractFloorM: REFRACT_FLOOR_M,
    ...(ownCoast ? { coast: ownCoast } : { coastField: copyCoast(coastFor(periodS, fromDeg)) }) });
  const head = `row ${String(r.id).padStart(2)} | leg0 ${r.b0.toFixed(1)}° leg1 ${r.b1.toFixed(1)}° ledge ${r.ledgeDepthM} m face ${r.faceWidthM}/${r.faceBaseDepthM} shelf ${r.shelfDepthM}${r.today ? ' (today)' : ''} | north ${north.map((p) => `(${p[0].toFixed(0)},${p[1].toFixed(0)})`).join(' ')}`;
  const per: { label: string; offered: boolean; peel: number; hollow: number; fbD: number; second: number; leg2: number }[] = [];
  const body: string[] = [];
  for (const b of bands) {
    const f = field(b.periodS, 225), H = setWaveHeight(b.ft);
    const st = leftStretches(f, H, north, { first: [0], second: [1], leg2: [2] }, P);
    const rt = leftStretches(f, H, SOUTH_LEDGE, { r0: [0], r1: [1] }, P);
    const fb = firstBreakDepth(f, H, P);
    const a = st.first;
    const offered = !!a && a.broken === a.of && a.start <= 2.0 && a.peel >= 8 && a.peel <= 13;
    per.push({ label: b.label, offered, peel: a?.peel ?? NaN, hollow: a?.hollow ?? NaN, fbD: fb?.d ?? NaN, second: st.second?.peel ?? NaN, leg2: st.leg2?.peel ?? NaN });
    body.push(`   ${b.label.padEnd(8)} ${offered ? 'OFFER' : '  -  '} | first ${a ? `${a.broken}/${a.of}` : ' – '} start ${f1(a?.start)} peel ${f1(a?.peel)} hollow ${f1(a?.hollow, 2)} | fb depth ${f1(fb?.depth)} off ledge ${f1(fb?.d)} | second ${f1(st.second?.peel)} h ${f1(st.second?.hollow, 2)} | leg2 ${f1(st.leg2?.peel)} | right r0 start ${f1(rt.r0?.start)} peel ${f1(rt.r0?.peel)} r1 start ${f1(rt.r1?.start)} peel ${f1(rt.r1?.peel)}`);
  }
  const off = per.filter((p) => p.offered);
  const inner = off.slice(1, -1), mids = inner.length > 2 ? inner.slice(Math.floor((inner.length - 2) / 2), Math.floor((inner.length - 2) / 2) + 2) : off.length >= 3 ? inner : off.slice(-2);
  const fails: string[] = [];
  if (off.length === 0) fails.push('nothing offered');
  for (const p of off) if (!(p.peel >= 9 && p.peel <= 12)) fails.push(`${p.label} peel`);
  for (const p of mids) if (!(p.hollow >= 0.8)) fails.push(`${p.label} hollow`);
  if (off[0] && !(off[0].hollow < 0.6)) fails.push(`${off[0].label} (smallest) hollow ≥ 0.6`);
  if (off[0] && !(off[0].fbD <= 5)) fails.push(`${off[0].label} first break > 5 m off`);
  for (const p of mids) if (!(p.second >= 8 && p.second <= 15)) fails.push(`${p.label} second leg`);
  for (const p of off) if (!(p.leg2 > 18 || p.leg2 < 0)) fails.push(`${p.label} leg2 no closeout`);
  const outer: string[] = [];
  for (const m of mids) for (const fromDeg of [202, 247]) {
    const b = bands.find((x) => x.label === m.label)!;
    const st = leftStretches(field(b.periodS, fromDeg), setWaveHeight(b.ft), north, { first: [0] }, P);
    outer.push(`${m.label} ${fromDeg}° ${f1(st.first?.peel)} (${st.first ? `${st.first.broken}/${st.first.of}` : '–'})`);
  }
  const verdict = fails.length ? `fails: ${fails.join(', ')}` : 'PASS';
  const block = [head, ...body, `   offered [${off.map((p) => p.label).join(', ')}] mids [${mids.map((p) => p.label).join(', ')}] | outer first-leg peel: ${outer.join('; ')}`, `   => ${verdict}   (${((Date.now() - t0) / 1000).toFixed(0)} s)`];
  console.log(block.join('\n'));
  lines.push(...block);
  if (out) writeFileSync(out, lines.join('\n') + '\n');
}
