import * as THREE from 'three/webgpu';
import { PI, asin, atan, clamp, dot, float, floor, int, length, max, mod, normalize, select, smoothstep, uniform, uniformArray, vec2, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import type { LandHeight } from './landHeight';
import { SKYLINE_BEARINGS, SKYLINE_EDGE_RAD, SKYLINE_HORIZON_SPREAD_RAD, SKYLINE_MOVE_M, skylineTable } from './skyline';

type N = any;

/** What the land looks like in a reflection: dark heath facing back along the ray (spec §4.9). */
const REFLECT_ALBEDO = vec3(0.1, 0.12, 0.075);

/** The skyline table on the GPU: a uniform array (not a texture: the water's material is near its texture limit). */
export class SkylineTable {
  private readonly entries: N = uniformArray( // three typings gap: element() isn't typed as a vec2 node
    Array.from({ length: SKYLINE_BEARINGS }, () => new THREE.Vector2()), 'vec2');
  private readonly eye = uniform(new THREE.Vector3(1e9, 0, 1e9));
  private builtFor = -1;

  /** Rebuild when the land changed (its version) or the eye moved SKYLINE_MOVE_M. Returns true if it rebuilt. */
  update(land: LandHeight | null, version: number, eye: THREE.Vector3): boolean {
    if (!land) return false;
    const e = this.eye.value;
    if (version === this.builtFor && Math.hypot(eye.x - e.x, eye.z - e.z) < SKYLINE_MOVE_M && Math.abs(eye.y - e.y) < SKYLINE_MOVE_M) return false;
    const t = skylineTable((x, z) => land.heightAt(x, z), { x: eye.x, y: eye.y, z: eye.z });
    const arr = this.entries.array as THREE.Vector2[];
    for (let b = 0; b < SKYLINE_BEARINGS; b++) arr[b].set(t[2 * b], t[2 * b + 1]);
    e.copy(eye);
    this.builtFor = version;
    return true;
  }

  /** How much of reflected ray r from world point p hits the land, and the land's radiance there. */
  reflectionNode(p: N, r: N, sky: Sky): { cover: N; radiance: N } {
    const deg = atan(r.x, r.z.negate()).mul(180.0 / Math.PI);
    const dirH = normalize(vec2(r.x, r.z));
    const along = dot(p.xz.sub(this.eye.xz), dirH);
    // A ray the waves send at or below the horizon sees the band just above it, so its land edge widens to
    // SKYLINE_HORIZON_SPREAD_RAD (skyline.ts landCover). A sharp edge there counted every such ray as land, even under
    // a 2 m spit: the reflection ran deep under the headland tips and stopped dead past them.
    const rElev = asin(clamp(r.y, 0.0, 1.0));
    const edge = max(2 * SKYLINE_EDGE_RAD, float(SKYLINE_HORIZON_SPREAD_RAD).sub(rElev));
    // Blend the two whole-degree bearings either side of the ray: the nearest alone cut a headland's reflection off
    // along one bearing, a hard vertical line down the water past the tip.
    const b0 = floor(deg);
    const f = deg.sub(b0);
    const bin = (b: N) => {
      const entry = this.entries.element(int(mod(b.add(360.0), 360.0)));
      const dist = max(entry.x.sub(along), 10.0);
      const sk = atan(entry.y.sub(p.y).div(dist));
      // No land where there's no skyline, or for water beyond the skyline point along the bearing (final review I2).
      const c = select(entry.x.greaterThan(0.0).and(along.lessThan(entry.x)), float(1.0).sub(smoothstep(sk.sub(edge), sk, rElev)), float(0.0));
      return { c, dist, rise: entry.y.sub(p.y) };
    };
    const lo = bin(b0), hi = bin(b0.add(1.0));
    const wLo = lo.c.mul(float(1.0).sub(f)), wHi = hi.c.mul(f);
    const cover = wLo.add(wHi);
    // The land's distance and rise for its haze, weighted by how much of each bearing's land the ray sees.
    const w = wHi.div(max(cover, 1e-4));
    const dist = lo.dist.mul(float(1.0).sub(w)).add(hi.dist.mul(w));
    const rise = lo.rise.mul(float(1.0).sub(w)).add(hi.rise.mul(w));
    const l = sky.sunDirection;
    const face = normalize(vec3(r.x.negate().mul(0.97), 0.26, r.z.negate().mul(0.97)));
    const lum = REFLECT_ALBEDO.mul(sky.skyIrradiance.mul(0.7).add(sky.sunIlluminance.mul(max(dot(face, l), 0.0)))).div(PI);
    const radiance = sky.applyAerialPerspective(lum, length(vec2(dist, rise)), normalize(r));
    return { cover, radiance };
  }
}
