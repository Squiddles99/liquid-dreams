import * as THREE from 'three/webgpu';
import { abs, attribute, dot, exp, float, mix, mx_noise_float, normalWorld, positionLocal, positionWorld, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import { type MeshArrays, PART, buildBoard } from './boardGeometry';
import type { BoardLook } from './boardLook';
import type { BoardSpec } from './boardSpec';

type N = any;

export function toGeometry(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  g.setAttribute('boardUV', new THREE.BufferAttribute(a.boardUV, 2));
  g.setAttribute('part', new THREE.BufferAttribute(a.part, 1));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** One board (spec §4.5): glassed foam with wax haze and a tail pad, a tinted rail band, or a bodyboard's foam and slick. */
export class BoardMesh {
  readonly mesh: THREE.Mesh;
  private readonly u = {
    deck: uniform(new THREE.Color()), bottom: uniform(new THREE.Color()), rail: uniform(new THREE.Color()),
    railBand: uniform(0), padU: uniform(0), shininess: uniform(90),
  };
  private key = '';
  /** Board-frame points (xyz) and radii (w) that shade the deck beneath them: the rider's contact shadow. */
  private readonly contacts = Array.from({ length: 6 }, () => uniform(new THREE.Vector4(0, -10, 0, 0.001)));

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    const m = new THREE.MeshBasicNodeMaterial();
    const part: N = attribute('part', 'float');
    const buv: N = attribute('boardUV', 'vec2');
    const isDeck = step(PART.deck - 0.5, part).mul(float(1).sub(step(PART.deck + 0.5, part)));
    const isRail = step(PART.rail - 0.5, part).mul(float(1).sub(step(PART.rail + 0.5, part)));
    const isFin = step(PART.fin - 0.5, part);
    const haze = mx_noise_float(positionWorld.mul(14.0)).mul(0.5).add(0.5);
    let albedo: N = mix(this.u.bottom, this.u.deck, isDeck);
    albedo = mix(albedo, this.u.rail, isRail);
    albedo = mix(albedo, albedo.mul(0.9).add(0.05), isDeck.mul(haze).mul(0.6)); // wax
    albedo = mix(albedo, this.u.rail, isDeck.mul(smoothstep(0.8, 0.9, abs(buv.y))).mul(this.u.railBand));
    const pad = isDeck.mul(step(buv.x, this.u.padU)).mul(step(abs(buv.y), 0.8));
    albedo = mix(albedo, vec3(0.035, 0.035, 0.04), pad);
    albedo = mix(albedo, vec3(0.1, 0.1, 0.11), isFin);
    // Contact shadow: the deck darkens under the feet, hands and body, fading as each point rises off the deck.
    const local: N = positionLocal;
    let shade: N = float(1);
    for (const c of this.contacts) {
      const d = local.xz.sub(c.xz);
      const near = exp(dot(d, d).div(c.w.mul(c.w)).negate());
      const low = float(1).sub(smoothstep(0.0, 0.3, c.y.sub(local.y)));
      shade = shade.mul(float(1).sub(near.mul(low).mul(0.55)));
    }
    albedo = albedo.mul(mix(float(1), shade, isDeck));
    const shininess = mix(this.u.shininess, float(8.0), pad);
    m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular: float(0.04), shininess }, sunVisibility);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    this.mesh.frustumCulled = false;
  }

  /** Rebuilds the shape only when the spec changed; the look is uniforms. */
  setBoard(spec: BoardSpec, look: BoardLook): void {
    const key = JSON.stringify(spec);
    if (key !== this.key) {
      this.key = key;
      this.mesh.geometry.dispose();
      this.mesh.geometry = toGeometry(buildBoard(spec));
    }
    this.u.deck.value.setRGB(...look.deck);
    this.u.bottom.value.setRGB(...look.bottom);
    this.u.rail.value.setRGB(...look.rail);
    this.u.railBand.value = look.railBand;
    this.u.padU.value = look.padLengthM / spec.lengthM;
    this.u.shininess.value = look.shininess;
  }

  /** Up to six board-frame points (x, y, z) with radii (m) that shade the deck beneath them; the rest are cleared. */
  setContacts(points: readonly { x: number; y: number; z: number; r: number }[]): void {
    this.contacts.forEach((u, i) => {
      const p = points[i];
      u.value.set(p ? p.x : 0, p ? p.y : -10, p ? p.z : 0, p ? p.r : 0.001);
    });
  }
}
