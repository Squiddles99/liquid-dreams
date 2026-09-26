import * as THREE from 'three/webgpu';
import { float, max, select, smoothstep, texture, uniform, vec2 } from 'three/tsl';
import type { Bathymetry } from './bathymetry';
import { FAR_DEPTH_M, REEF_SURROUND_DEPTH_M, SHORE_FLAT_DEPTH_M, SHORE_X } from './coastProfile';

type N = any;

/** TSL mirror of depthBg(): the same piecewise smoothstep profile, as one select chain. */
export function depthBgNode(x: N): N {
  const s = float(SHORE_X).sub(x);
  const nearShore = float(SHORE_FLAT_DEPTH_M).add(float(1.5 - SHORE_FLAT_DEPTH_M).mul(smoothstep(0, 30, s)));
  const slope = float(1.5).add(float(REEF_SURROUND_DEPTH_M - 1.5).mul(smoothstep(30, 140, s)));
  const offshore = float(REEF_SURROUND_DEPTH_M).add(float(FAR_DEPTH_M - REEF_SURROUND_DEPTH_M).mul(smoothstep(260, 590, s)));
  return select(s.lessThan(30), nearShore, select(s.lessThan(140), slope, offshore));
}

function packTexture(b: Bathymetry, target?: THREE.DataTexture): THREE.DataTexture {
  const { nx, nz } = b.grid;
  const data = target ? (target.image.data as Uint16Array) : new Uint16Array(nx * nz * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < nx * nz; i++) {
    data[i * 4] = toHalf(b.bed[i]);
    data[i * 4 + 1] = toHalf(b.sand[i]);
    data[i * 4 + 2] = toHalf(b.weed[i]);
    data[i * 4 + 3] = toHalf(1);
  }
  const tex = target ?? new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** The Womb's seabed on the GPU and CPU, with the tide. One source of truth for water depth. */
export class Seabed {
  readonly tide = uniform(0);
  bathymetry: Bathymetry;
  private readonly tex: THREE.DataTexture;
  private readonly origin = uniform(new THREE.Vector2());
  private readonly cell = uniform(1);
  private readonly size = uniform(new THREE.Vector2(1, 1));

  constructor(b: Bathymetry) {
    this.bathymetry = b;
    this.tex = packTexture(b);
    this.syncGrid();
  }

  /** Replace the reef (dev edits). Grid dimensions must stay the same. */
  setBathymetry(b: Bathymetry): void {
    if (b.grid.nx !== this.bathymetry.grid.nx || b.grid.nz !== this.bathymetry.grid.nz) throw new Error('Seabed grid size cannot change');
    this.bathymetry = b;
    packTexture(b, this.tex);
    this.syncGrid();
  }

  setTide(m: number): void {
    this.tide.value = m;
  }

  private syncGrid(): void {
    const g = this.bathymetry.grid;
    this.origin.value.set(g.x0, g.z0);
    this.cell.value = g.cellM;
    this.size.value.set(g.nx, g.nz);
  }

  private gridCoords(xz: N): N {
    return xz.sub(this.origin).div(this.cell);
  }

  insideNode(xz: N): N {
    const g = this.gridCoords(xz);
    const lo = g.greaterThanEqual(vec2(0.0));
    const hi = g.lessThanEqual(this.size.sub(1.0));
    return select(lo.x.and(lo.y).and(hi.x).and(hi.y), float(1.0), float(0.0));
  }

  private sample(xz: N): N {
    const uv = this.gridCoords(xz).add(0.5).div(this.size);
    return texture(this.tex, uv).level(float(0)); // three typings gap: level() wants a node
  }

  /** Seabed height y (m) at world xz; the coast profile outside the map. */
  bedHeightNode(xz: N): N {
    return select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).x, depthBgNode(xz.x).negate());
  }

  /** Still-water depth (m) including the tide, never negative. */
  waterDepthNode(xz: N): N {
    return max(this.tide.sub(this.bedHeightNode(xz)), 0.0);
  }

  /** vec2(sand, weed) weights; open sand outside the map. */
  materialNode(xz: N): N {
    return select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).yz, vec2(1.0, 0.0));
  }
}
