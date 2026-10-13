import type { BreakParams } from '../breaker/breaking';
import { closeoutWeight, traceEnds, traceLines } from '../breaker/crestTrace';
export { traceEnds };
import { sampleField, type ReefField } from '../breaker/reefField';
import { type ActiveWave, type WaveContext, breakOptions, crestAt, phaseXi, sumWaves, waveAtCrest, waveHeightAt } from '../breaker/setWaveModel';
import { CURL_KNOTS, EDGE_OUTER_UNITS, SHEET_KNOTS, sectionFrame, sectionKnots, sectionOf } from '../breaker/wombSection';
import { LEFT_BEARING_DEG, TIP } from '../seabed/wombReef';
import { curlFoamAt } from '../whitewater/curlFoam';
import { boilFreshness, boilWeight } from '../whitewater/pileChurn';

/**
 * The crest-line probe (womb-realism Task 0, spec §4): every traced station of every wave at one moment, with the numbers
 * the spec's bars read. On the CPU twins (the trace, the section, the sheet as the spray's frame reads it: no pile, the
 * lean shape), which the breaker parity self-tests pin to the ribbon's GPU mirror. tools/_crestLine.ts computes the bars.
 */
export interface CrestLineRow {
  wave: number; arrivalS: number; arc: number; x: number; z: number; nx: number; nz: number;
  /** Metres down the left's line from the tip (wombReef.LEFT_BEARING_DEG). */
  along: number;
  until: number | null; tb: number | null; phase: number; rho: number; hollow: number; surge: number;
  A: number; H: number; Hb: number | null;
  /** The shoaled sheet's crest height at the station (setWaveModel.waveHeightAt at its own ξ). */
  hSheet: number;
  /** The sheet's highest and lowest-in-front points along the station's normal (m above still water). */
  sheetCrestY: number; troughSheetY: number;
  /** The drawn section's highest point (the ribbon's column), its crest knot's height, the tip relative to the crest knot. */
  ribbonCrestY: number; crestY: number; tipDx: number; tipDy: number;
  /** The curtain's foot (the floor knot) minus the sheet's height under it (m). */
  footGap: number;
  /** The curtain's foot minus the sheet's lowest point in front of the section (m; womb-realism Task 3's gap bar, STOP 2 early
   * ruling: the section's front sheet knots, as wombSection.footY reads them). */
  footGapFront: number;
  closeout: number;
  /** womb-realism Task 6: the station's boil as the ribbon packs it (pileChurn.boilWeight at foam 1) and its freshness, the
   * sheet's own foam at the station (the game's break options, all waves), and the curl's face foam at mid-reach
   * (curlFoam.curlFoamAt(phase, 0.5, outside, 1): the ribbon's extras.z there). */
  boil: number; fresh: number; setFoam: number; curlFace: number;
}

export interface CrestLineInput {
  field: ReefField; ctx: WaveContext; waves: readonly ActiveWave[]; t: number; params: BreakParams;
  minHeightM: number; offshoreMs: number; spacingM?: number;
}

const SHEET_STEP_M = 0.25;

export function crestLineRows(i: CrestLineInput): CrestLineRow[] {
  const { field, ctx, t, params } = i;
  const opts = { ...breakOptions(field, params, i.offshoreMs), pile: false, shape: 'lean' as const };
  const br = (LEFT_BEARING_DEG * Math.PI) / 180, along = [Math.sin(br), -Math.cos(br)];
  const lines = traceLines(field, i.waves, t, ctx, { cameraX: 0, cameraZ: 0, params, minHeightM: i.minHeightM, spacingM: i.spacingM ?? 2, offshoreMs: i.offshoreMs, drawSurge: true });
  const rows: CrestLineRow[] = [];
  for (const line of lines) {
    for (const s of line) {
      const own = [i.waves[s.wave]];
      const base = (u: number): [number, number] => {
        const x = s.x + s.nx * u, z = s.z + s.nz * u;
        const r = sumWaves(x, z, t, sampleField(field, x, z), own, ctx, opts);
        return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
      };
      const A = s.section.A, reach = Math.max(EDGE_OUTER_UNITS * A, 10);
      const sheet: [number, number][] = [];
      for (let u = -reach; u <= reach; u += SHEET_STEP_M) sheet.push(base(u));
      let sheetCrestY = -Infinity, troughSheetY = Infinity;
      for (const [u, y] of sheet) {
        sheetCrestY = Math.max(sheetCrestY, y);
        if (u >= 0) troughSheetY = Math.min(troughSheetY, y);
      }
      const sheetYAt = (u: number): number => {
        for (let k = 0; k + 1 < sheet.length; k++) {
          const [ua, ya] = sheet[k], [ub, yb] = sheet[k + 1];
          if ((u - ua) * (u - ub) <= 0 && ub !== ua) return ya + ((yb - ya) * (u - ua)) / (ub - ua);
        }
        return NaN;
      };
      const f = sampleField(field, s.x, s.z);
      const hSheet = waveHeightAt(own[0], f, crestAt(s.x, s.z, t, f, own[0], ctx, opts), phaseXi(s.x, s.z, t, f, own[0], ctx));
      let ribbonCrestY = -Infinity, crestY = NaN, tipDx = NaN, tipDy = NaN, footGap = NaN, footGapFront = NaN;
      if (A > 0) {
        const sec = sectionOf(s.section, base);
        for (const p of sec.points) ribbonCrestY = Math.max(ribbonCrestY, p[1]);
        crestY = sec.crest[1]; tipDx = sec.tip[0] - sec.crest[0]; tipDy = sec.tip[1] - sec.crest[1];
        const fr = sectionFrame(s.section, s.H, s.c, base);
        footGap = fr.floor[1] - sheetYAt(fr.floor[0]);
        const front = sectionKnots(s.section, base).slice(SHEET_KNOTS + CURL_KNOTS);
        footGapFront = fr.floor[1] - A * Math.min(...front.map((q) => q[1]));
      }
      const game = sumWaves(s.x, s.z, t, sampleField(field, s.x, s.z), i.waves, ctx, breakOptions(field, params, i.offshoreMs));
      rows.push({
        wave: s.wave, arrivalS: i.waves[s.wave].arrivalS, arc: s.arc, x: s.x, z: s.z, nx: s.nx, nz: s.nz, along: (s.x - TIP[0]) * along[0] + (s.z - TIP[1]) * along[1],
        until: s.until, tb: s.tb, phase: s.section.phase, rho: s.section.rho, hollow: s.section.hollow, surge: s.section.surge ?? 0,
        A, H: s.H, Hb: s.Hb, hSheet, sheetCrestY, troughSheetY, ribbonCrestY, crestY, tipDx, tipDy, footGap, footGapFront, closeout: closeoutWeight(s.z),
        boil: boilWeight(s.tb, s.Hb ?? s.H, field.periodS, 1), fresh: boilFreshness(s.tb, s.Hb ?? s.H, field.periodS), setFoam: game.foam,
        curlFace: curlFoamAt(s.section.phase, 0.5, 0, 1),
      });
    }
  }
  return rows;
}

/**
 * Task 0 Step 5: the sheet's crest along the station nearest `arc` of the wave arriving at `arrivalS`, with the front's
 * standing (setWaveModel.frontStanding) as it is, forced to 0 (tb null, until ∞) and forced to 1 (tb 0). The bore is 0 in
 * both forced reads (boreWeight(0) = 0), as at an unbroken station.
 */
export function leanFrontEffect(i: CrestLineInput, arrivalS: number, arc: number): { arc: number; asIs: number; standing0: number; standing1: number } | null {
  const { field, ctx, t, params } = i;
  const opts = { ...breakOptions(field, params, i.offshoreMs), pile: false, shape: 'lean' as const };
  const wi = i.waves.findIndex((w) => Math.abs(w.arrivalS - arrivalS) < 1e-3);
  if (wi < 0) return null;
  const line = traceLines(field, [i.waves[wi]], t, ctx, { cameraX: 0, cameraZ: 0, params, minHeightM: i.minHeightM, spacingM: i.spacingM ?? 2, offshoreMs: i.offshoreMs })[0];
  if (!line) return null;
  const s = line.reduce((a, b) => (Math.abs(b.arc - arc) < Math.abs(a.arc - arc) ? b : a));
  const w = i.waves[wi], reach = Math.max(EDGE_OUTER_UNITS * s.section.A, 10);
  const top = (force: 'asIs' | 0 | 1): number => {
    let m = -Infinity;
    for (let u = -reach; u <= reach; u += SHEET_STEP_M) {
      const x = s.x + s.nx * u, z = s.z + s.nz * u, f = sampleField(field, x, z);
      const c = crestAt(x, z, t, f, w, ctx, opts);
      const crest = c && force !== 'asIs' ? { ...c, tb: force === 1 ? 0 : null, until: force === 1 ? 0 : Infinity } : c;
      m = Math.max(m, waveAtCrest(x, z, t, f, w, ctx, crest, opts).eta);
    }
    return m;
  };
  return { arc: s.arc, asIs: top('asIs'), standing0: top(0), standing1: top(1) };
}
