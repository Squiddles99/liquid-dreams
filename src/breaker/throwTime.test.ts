import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS as P } from './breaking';
import { type Station, fillSections } from './crestTrace';
import { PSI_NORMAL } from './overturn';

/**
 * Step 2 (overnight 2026-10-16, Andrew's 1792137769): the lip throws over the rider, not 30 m down the line. At the end of
 * segment A (7 ft 15 s 225°, tide 0.5, t 4906.0) a station goes from the curl front passing it (tb 0) to full throw (ρ ≥ 0.95
 * and phase ≥ 0.95: the lip landed, the round barrel) within THROW_BAR_S (the brief's ~1.0 s; its 1.2 s bar on ρ alone
 * already held: ρ ≥ 0.95 at 0.86 s here). Measured live on 863cfa0 (step2-measured.md): the
 * stations near his camera at x -92 → -91, z -22 → -18, the crest 3.7-3.8 m (Hb), the curl front peeling 7.0 m/s along the
 * crest (tb 0.171 → 0.742 over 4 m); ρ ≥ 0.95 at tb 0.93-1.12 s, phase ≥ 0.95 at tb 1.0-1.38 s. The line here is that one,
 * stations 2 m apart, the front at arc 0: broken behind it (tb = arc behind / peel), waiting ahead (until = arc ahead / peel).
 * On 863cfa0 this line throws in 1.14 s (8.0 m of peel): the raw clock reaches phase 0.95 at 0.63 s (the flight, 0.70 s),
 * the section smoothing (SECTION_SMOOTHING_M 4 m) averaging the waiting stations' phase 0.45 and ρ 0 into the broken ones
 * adds the other 0.5 s.
 */
const THROW_BAR_S = 1.0;
const PEEL_MS = 7.0, HB = 3.75, PERIOD_S = 15, SPACING_M = 2;

function segmentALine(): Station[] {
  const line: Station[] = [];
  for (let a = -60; a <= 60; a += SPACING_M) {
    const broken = a <= 0;
    line.push({
      gap: false, wave: 0, x: -92 + 0.16 * a, z: -20 + 0.99 * a, arc: a, nx: -0.99, nz: 0.16, H: HB, c: 14, r: 1,
      tb: broken ? -a / PEEL_MS : null, until: broken ? 0 : a / PEEL_MS, psi: PSI_NORMAL, lipH: broken ? HB : null, Hb: broken ? HB : null,
      section: { A: 0, phase: 0, hollow: 0, rho: 0 },
    } as Station);
  }
  return line;
}

describe('the throw time at a segment-A station (step 2)', () => {
  it(`goes from the curl front (tb 0) to rho >= 0.95 and phase >= 0.95 within ${THROW_BAR_S} s`, () => {
    const line = segmentALine();
    fillSections(line, PERIOD_S, { ribbonOnset: P.ribbonOnset, surge: P.surge });
    // The broken stations, youngest first, up to the round barrel's hold (well away from the line's far end).
    const broken = line.filter((s) => s.tb !== null && s.tb <= 3).sort((p, q) => (p.tb as number) - (q.tb as number));
    const full = (s: Station): boolean => s.section.rho >= 0.95 && s.section.phase >= 0.95;
    const i = broken.findIndex((_, k) => broken.slice(k).every(full));
    const throwS = i < 0 ? Infinity : (broken[i].tb as number);
    console.log(`throw: tb ${throwS.toFixed(2)} s = ${(throwS * PEEL_MS).toFixed(1)} m of peel;`, broken.slice(0, 12).map((s) => `${(s.tb as number).toFixed(2)}:${s.section.phase.toFixed(2)}/${s.section.rho.toFixed(2)}`).join(' '));
    expect(throwS).toBeLessThanOrEqual(THROW_BAR_S);
  });
});
