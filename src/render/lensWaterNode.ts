import { Fn, If, floor, length, max, mix, mx_cell_noise_float, mx_noise_float, saturate, screenSize, screenUV, select, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';
import type { LensWaterState } from './lensWater';

type N = any;

/** The wet lens's uniforms (LensWater.state() each frame, and a clock for the water's movement). */
export function createLensWaterUniforms() {
  return { active: uniform(0), front: uniform(0), drops: uniform(0), time: uniform(0) };
}

export type LensWaterUniforms = ReturnType<typeof createLensWaterUniforms>;

export function updateLensWaterUniforms(u: LensWaterUniforms, s: LensWaterState, timeS: number): void {
  u.active.value = s.active ? 1 : 0;
  u.front.value = s.front;
  u.drops.value = s.drops;
  u.time.value = timeS;
}

/** Drops across the screen's height (cells). */
const DROP_CELLS = 7;
/** A cell holds a drop this often. */
const DROP_CHANCE = 0.45;
/** How far a drop bends the view behind it (a fraction of the screen's height at its rim)… */
const DROP_BEND = 0.06;
/** …and how far the sheet's streaming surface does. */
const SHEET_BEND = 0.035;
/** The sheet's haze: a film of water scatters a little light and softens contrast. */
const SHEET_HAZE = 0.18;

/**
 * The scene (`tex`, the HDR pass) seen through a wet lens: while `u.active` a sheet of water covers the screen below
 * `u.front` (its edge ragged and bright, its surface streaming down, bending, blurring and hazing the view), and drops
 * left behind bend the view like small lenses (blurred inside, a soft rim, a glint), fading with `u.drops`. Dry, it is
 * the scene sampled at the screen's own UV, exactly as before (the branch is on a uniform: a dry lens costs a test).
 */
export function wetLensSampleNode(tex: N, u: LensWaterUniforms): N {
  return Fn(() => {
    const out = tex.sample(screenUV).toVar();
    If(u.active.greaterThan(0.5), () => {
      const uv = screenUV;
      const aspect = screenSize.x.div(max(screenSize.y, 1.0));
      // Screen-space position with square units (height 1), y growing down the screen.
      const p = vec2(uv.x.mul(aspect), uv.y);
      const t = u.time;

      // The sheet: below its ragged front, streaming down (noise stretched along y and moving with time).
      const edge = u.front.add(mx_noise_float(vec2(p.x.mul(4.0), t.mul(0.7))).mul(0.07)).add(mx_noise_float(vec2(p.x.mul(19.0), t.mul(1.3))).mul(0.025));
      const sheet = smoothstep(edge.sub(0.01), edge.add(0.05), p.y);
      // The meniscus at the draining edge: a thin bright line where the film thickens.
      const meniscus = smoothstep(0.012, 0.0, p.y.sub(edge).abs()).mul(0.3);
      const flow = (q: N): N => mx_noise_float(vec3(q.x.mul(7.0), q.y.mul(2.5).sub(t.mul(2.0)), t.mul(0.5)));
      const e = 0.01;
      const h0 = flow(p);
      const slope = vec2(flow(p.add(vec2(e, 0.0))).sub(h0), flow(p.add(vec2(0.0, e))).sub(h0)).div(e * 7.0);
      const sheetBend = slope.mul(SHEET_BEND).mul(sheet.add(meniscus));

      // The drops: at most one per cell, at a random spot and size; each is a small lens that bends (and flips) the view.
      const c = p.mul(DROP_CELLS);
      const cell = floor(c);
      const r1 = mx_cell_noise_float(vec3(cell, 1.0)), r2 = mx_cell_noise_float(vec3(cell, 2.0));
      const r3 = mx_cell_noise_float(vec3(cell, 3.0)), r4 = mx_cell_noise_float(vec3(cell, 4.0));
      const centre = cell.add(vec2(r1, r2).mul(0.5).add(0.25));
      const radius = r3.mul(0.16).add(0.1);
      const toCentre = c.sub(centre).div(radius);
      const d = length(toCentre);
      const inDrop = smoothstep(1.0, 0.8, d).mul(select(r4.lessThan(DROP_CHANCE), 1.0, 0.0)).mul(u.drops).mul(sheet.oneMinus());
      const dropBend = toCentre.mul(radius.div(DROP_CELLS)).mul(-DROP_BEND * 12.0).mul(inDrop);

      const bent = uv.add(vec2(sheetBend.x.div(aspect), sheetBend.y)).add(vec2(dropBend.x.div(aspect), dropBend.y));
      // Blur in the sheet and inside the drops: four taps around the bent point.
      const spread = sheet.mul(3.0).add(inDrop.mul(2.0));
      const px = vec2(1.0).div(screenSize).mul(spread);
      const blurred = tex.sample(bent.add(vec2(px.x, px.y))).add(tex.sample(bent.sub(vec2(px.x, px.y))))
        .add(tex.sample(bent.add(vec2(px.x, px.y.negate())))).add(tex.sample(bent.sub(vec2(px.x, px.y.negate())))).mul(0.25);
      const seen: N = mix(tex.sample(bent), blurred, saturate(spread.mul(0.5))); // three typings gap: mix() of two samples is typed float
      // The film's haze lifts the view toward its own average brightness; the meniscus and the drops' glints catch light.
      const lum = seen.rgb.dot(vec3(0.2126, 0.7152, 0.0722));
      const hazed = mix(seen.rgb, vec3(lum).mul(1.15).add(seen.rgb.mul(0.1)), sheet.mul(SHEET_HAZE));
      const glint = smoothstep(0.3, 0.0, length(toCentre.sub(vec2(-0.35, -0.4)))).mul(inDrop).mul(0.5);
      const rim = smoothstep(0.75, 1.0, d).mul(inDrop).mul(0.12).oneMinus();
      const light = lum.mul(meniscus.mul(sheet.oneMinus().add(0.5)).add(glint));
      out.assign(vec4(hazed.mul(rim).add(light), seen.a));
    });
    return out;
  })();
}
