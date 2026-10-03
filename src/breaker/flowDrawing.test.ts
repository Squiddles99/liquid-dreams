import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { flowAt } from './flow';
import { computeReefField, sampleField } from './reefField';
import { breakOptions, sumWaves, toActiveWave } from './setWaveModel';

const OUT = '.superpowers/drawings/reef-flow';
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const o = breakOptions(field, DEFAULT_BREAK_PARAMS);

function setFor(ft: number) {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell = { sizeFt: ft, periodS: 15, directionDeg: 225 };
  c.tideM = 0;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  return { c, big };
}

/** Plan view, 120 m around the peak: arrows 0.5 m above the bed every 8 m (red seaward, blue shoreward, 1 m/s = 1.5 m). */
function planView(ft: number, dt: number): string {
  const { c, big } = setFor(ft), t = big.arrivalS + dt;
  const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
  const S = 4, R = 60; // px per m, half-width m
  let body = '';
  for (let x = -R; x <= R; x += 2) for (let z = -R; z <= R; z += 2) {
    const f = sampleField(field, x, z), eta = sumWaves(x, z, t, f, waves, ctx, o).eta;
    const v = Math.max(0, Math.min(255, 128 + eta * 40));
    body += `<rect x="${(x + R) * S}" y="${(z + R) * S}" width="${2 * S}" height="${2 * S}" fill="rgb(${v},${v},${v})"/>`;
  }
  for (let x = -R + 4; x <= R; x += 8) for (let z = -R + 4; z <= R; z += 8) {
    const f = sampleField(field, x, z), u = flowAt(x, z, -f.depth + 0.5, t, f, waves, ctx, o);
    const along = u.ux * f.dirX + u.uz * f.dirZ, col = along < 0 ? '#d22' : '#22d';
    const x0 = (x + R) * S, z0 = (z + R) * S;
    body += `<line x1="${x0}" y1="${z0}" x2="${x0 + u.ux * 1.5 * S}" y2="${z0 + u.uz * 1.5 * S}" stroke="${col}" stroke-width="2.5"/><circle cx="${x0}" cy="${z0}" r="2.5" fill="${col}"/>`;
  }
  const W = 2 * R * S + 2 * S;
  return `<figure><figcaption>${ft} ft, ${dt >= 0 ? '+' : ''}${dt} s from the biggest wave reaching the peak (grey: surface height; arrows: near-bed flow)</figcaption><svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${body}<circle cx="${R * S}" cy="${R * S}" r="5" fill="none" stroke="#0a0"/></svg></figure>`;
}

/** Slice along the ray through the peak, 80 m seaward to 40 m inshore: surface, bed, and flow arrows at 3 heights. */
function slice(ft: number, dt: number): string {
  const { c, big } = setFor(ft), t = big.arrivalS + dt;
  const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
  const f0 = sampleField(field, 0, 0), SX = 6, SY = 20, Y0 = 200, W = 120 * SX;
  let surf = '', bed = '', arrows = '';
  for (let s = -80; s <= 40; s += 1) {
    const x = s * f0.dirX, z = s * f0.dirZ, f = sampleField(field, x, z), eta = sumWaves(x, z, t, f, waves, ctx, o).eta;
    const px = (s + 80) * SX;
    surf += `${px},${Y0 - eta * SY} `;
    bed += `${px},${Y0 + f.depth * SY} `;
    if (s % 10 === 0) for (const frac of [0.08, 0.5, 0.95]) {
      const y = -f.depth * frac, u = flowAt(x, z, y, t, f, waves, ctx, o), along = u.ux * f.dirX + u.uz * f.dirZ;
      const py = Y0 - y * SY;
      arrows += `<line x1="${px}" y1="${py}" x2="${px + along * 1.5 * SX}" y2="${py}" stroke="${along < 0 ? '#d22' : '#22d'}" stroke-width="2.5"/><circle cx="${px}" cy="${py}" r="2.5" fill="${along < 0 ? '#d22' : '#22d'}"/>`;
    }
  }
  return `<figure><figcaption>${ft} ft, ${dt >= 0 ? '+' : ''}${dt} s: slice along the ray through the peak (seaward left, beach right; heights ×${(SY / SX).toFixed(1)}; blue line the surface, brown the reef, arrows the flow near the surface, mid-depth and near the bed)</figcaption><svg width="${W}" height="${Y0 + 16 * SY}"><polyline points="${surf}" fill="none" stroke="#06c" stroke-width="2"/><polyline points="${bed}" fill="none" stroke="#753" stroke-width="2"/>${arrows}<line x1="${80 * SX}" y1="0" x2="${80 * SX}" y2="${Y0 + 16 * SY}" stroke="#0a0" stroke-dasharray="4"/></svg></figure>`;
}

describe.runIf(process.env.LD_DRAW === '1')('Gate 1 drawings', () => {
  it('writes the flow drawings', () => {
    mkdirSync(OUT, { recursive: true });
    for (const ft of [4, 12]) {
      const figs = [-8, -3, 0, 3].map((dt) => `<div class="row">${planView(ft, dt)}${slice(ft, dt)}</div>`).join('');
      writeFileSync(`${OUT}/flow-${ft}ft.html`, `<!doctype html><meta charset="utf-8"><style>body{font:15px sans-serif;margin:8px}.row{display:flex;gap:16px;align-items:flex-start}figure{margin:6px}figcaption{max-width:720px}</style><p><b>${ft} ft, mid tide.</b> Red: water moving seaward, toward the wave (the draw). Blue: moving shoreward (the shove). Arrow length 1.5 m per m/s. The green circle and dashed line are the peak.</p>${figs}`);
    }
  }, 600000);
});
