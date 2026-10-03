import * as THREE from 'three/webgpu';
import { attribute, float, int, smoothstep, texture, vec2, vec4 } from 'three/tsl';
import type { TrackNetwork } from '../land/tracks';
import { CLEARING_SEMI_M } from '../land/tracks';
import type { GroundLayerTextures } from './groundDetail';
import { hash3 } from './procedural';

type N = any;

/** One bare footprint: where, its heading, how old (0 fresh, 1 nearly gone), and which foot. */
export interface Print {
  x: number;
  z: number;
  yaw: number;
  age: number;
  left: boolean;
}

export const MAX_PRINTS = 600;
const LANE_M = 0.15;
const PRINT_LENGTH_M = 0.28;
const PRINT_WIDTH_M = 0.11;
/** The Cape to Cape keeps this share of its prints (the beach path and the clearing keep every one: spec §4.3). */
const C2C_SHARE = 0.4;
const CLEARING_PRINTS = 40;

/**
 * The prints within `radiusM` of (x, z) (dune-up-close §4.3): two lanes along each track, a stride of 0.6–0.8 m, each
 * yawed ±12° and aged by a hash of where it is along its lane; and a scuff of prints in random directions in the clearing.
 * The same prints whatever the camera; nearest first, at most MAX_PRINTS.
 */
/** The line `offset` metres to the left of `pts` (each point moved along its corner's mean normal). */
function laneLine(pts: [number, number][], offset: number): [number, number][] {
  return pts.map(([px, pz], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    return [px - uz * offset, pz + ux * offset];
  });
}

export function printsNear(tracks: TrackNetwork, x: number, z: number, radiusM = 20): Print[] {
  const out: (Print & { d: number })[] = [];
  const r2 = (radiusM + 1) ** 2;
  tracks.data.pieces.forEach((piece, pi) => {
    for (const [li, side] of [[0, 1], [1, -1]] as const) {
      // Each foot strides along its own lane (offset from the centreline), so a turn's inside lane doesn't bunch up.
      const pts = laneLine(piece.points, LANE_M * side);
      let k = 0, next = 0.3 * hash3(pi, li, 7), along = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-9) continue;
        const near = (ax - x) ** 2 + (az - z) ** 2 < r2 + 4 || (bx - x) ** 2 + (bz - z) ** 2 < r2 + 4;
        while (next <= along + len) {
          const t = (next - along) / len, ux = (bx - ax) / len, uz = (bz - az) / len;
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          const keep = piece.name === 'beachPath' || hash3(pi * 31 + li, k, 11) < C2C_SHARE;
          if (near && keep) {
            const d = Math.hypot(px - x, pz - z);
            if (d <= radiusM) {
              out.push({ x: px, z: pz, yaw: Math.atan2(ux, uz) + (hash3(pi, k, 13 + li) - 0.5) * 2 * (12 * Math.PI / 180), age: hash3(pi, k, 17 + li), left: side > 0, d });
            }
          }
          k++;
          next += 0.6 + 0.2 * hash3(pi * 31 + li, k, 5);
        }
        along += len;
      }
    }
  });
  const j = tracks.data.junction;
  for (let k = 0; k < CLEARING_PRINTS; k++) {
    const a = hash3(k, 3, 19) * 2 * Math.PI, rr = Math.sqrt(hash3(k, 4, 19)) * 0.9;
    const u = Math.cos(a) * rr * CLEARING_SEMI_M[0], v = Math.sin(a) * rr * CLEARING_SEMI_M[1];
    const px = j.x + u * j.along[0] - v * j.along[1], pz = j.z + u * j.along[1] + v * j.along[0];
    const d = Math.hypot(px - x, pz - z);
    if (d <= radiusM) out.push({ x: px, z: pz, yaw: hash3(k, 5, 19) * 2 * Math.PI, age: hash3(k, 6, 19), left: hash3(k, 7, 19) < 0.5, d });
  }
  out.sort((p, q) => p.d - q.d);
  return out.slice(0, MAX_PRINTS).map(({ d: _, ...p }) => p);
}

/**
 * The prints as decals (spec §4.3): a quad each lying on the patch's surface, darkened where the footprint layer is
 * pressed in, softer and fainter with age.
 */
export class Footprints {
  readonly mesh: THREE.InstancedMesh;
  private readonly ages: THREE.InstancedBufferAttribute;

  constructor(layers: GroundLayerTextures) {
    const g = new THREE.PlaneGeometry(PRINT_WIDTH_M, PRINT_LENGTH_M);
    g.rotateX(-Math.PI / 2);
    this.ages = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRINTS), 1);
    g.setAttribute('printAge', this.ages);
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    const uv: N = attribute('uv', 'vec2');
    const h: N = texture(layers.nrh, uv).depth(int(4)).z; // the footprint layer's height: low where it's pressed in
    const age: N = attribute('printAge', 'float');
    const pressed: N = smoothstep(float(0.95), float(0.55).add(age.mul(0.3)), h);
    const alpha: N = pressed.mul(float(0.32).mul(float(1.0).sub(age.mul(0.7)))).mul(layers.on);
    m.colorNode = vec4(0.05, 0.035, 0.02, alpha);
    m.opacityNode = alpha;
    this.mesh = new THREE.InstancedMesh(g, m, MAX_PRINTS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
    void vec2;
  }

  /**
   * Lays the prints, each conformed to the surface under it (spec §4.3): tilted to its normal (from the surface a half
   * print either way), its length along its yaw across the slope, so toe and heel both sit on the ground.
   */
  update(prints: readonly Print[], surfaceAt: (x: number, z: number) => number): void {
    const a = this.mesh.instanceMatrix.array as Float32Array, ages = this.ages.array as Float32Array;
    const n = Math.min(prints.length, MAX_PRINTS), h = PRINT_LENGTH_M / 2;
    for (let i = 0; i < n; i++) {
      const p = prints[i], mx = p.left ? 1 : -1, o = i * 16;
      const sx = (surfaceAt(p.x + h, p.z) - surfaceAt(p.x - h, p.z)) / (2 * h), sz = (surfaceAt(p.x, p.z + h) - surfaceAt(p.x, p.z - h)) / (2 * h);
      // Up: the normal. Forward: the yaw's direction lifted onto the slope (y = its rise). Across: up × forward.
      const ul = Math.hypot(sx, 1, sz), ux = -sx / ul, uy = 1 / ul, uz = -sz / ul;
      let fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), fy = sx * fx + sz * fz;
      const fl = Math.hypot(fx, fy, fz);
      fx /= fl; fy /= fl; fz /= fl;
      const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
      a[o] = rx * mx; a[o + 1] = ry * mx; a[o + 2] = rz * mx; a[o + 3] = 0;
      a[o + 4] = ux; a[o + 5] = uy; a[o + 6] = uz; a[o + 7] = 0;
      a[o + 8] = fx; a[o + 9] = fy; a[o + 10] = fz; a[o + 11] = 0;
      a[o + 12] = p.x; a[o + 13] = surfaceAt(p.x, p.z) + 0.003; a[o + 14] = p.z; a[o + 15] = 1;
      ages[i] = p.age;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.ages.needsUpdate = true;
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on && this.mesh.count > 0;
  }
}
