import * as THREE from 'three/webgpu';
import { Fn, If, Loop, cameraPosition, float, length, max, min, normalize, positionWorld, pow, select, vec2 } from 'three/tsl';
import type { Seabed } from '../seabed/Seabed';
import { seabedRadianceNode } from '../seabed/seabedShading';
import { MARCH_REFINE, MAX_MARCH_DIST_M } from '../seabed/waterColumn';
import type { Sky } from '../sky/Sky';
import { throughWaterNode, waterColourAtDepthNode } from './underwaterNodes';
import { type WaterOpticsUniforms, deepWaterUpwelling } from './waterShading';

type N = any;

/** Steps of the underwater march (denser near the eye: (i/N)^1.6, as the look-through's march). */
const UNDERWATER_MARCH_STEPS = 24;

/**
 * vec2(distance, hit 0/1) of the first point along `dir` from `origin`, within `maxDist`, that is at or below the bed: in
 * any direction, so level and rising rays meet a reef wall too (the look-through's marchSeabedNode only marches down).
 */
export function marchBedAlongNode(origin: N, dir: N, maxDist: N, seabed: Seabed): N {
  return Fn(() => {
    const result = vec2(0.0, 0.0).toVar();
    If(origin.y.lessThanEqual(seabed.bedHeightNode(origin.xz)), () => {
      result.assign(vec2(0.0, 1.0));
    }).Else(() => {
      const prev = float(0.0).toVar(), lo = float(0.0).toVar(), hi = float(0.0).toVar(), found = float(0.0).toVar();
      Loop(UNDERWATER_MARCH_STEPS, ({ i }: N) => {
        If(found.lessThan(0.5), () => {
          const s = maxDist.mul(pow(float(i).add(1.0).div(UNDERWATER_MARCH_STEPS), 1.6));
          const q = origin.add(dir.mul(s));
          If(q.y.lessThanEqual(seabed.bedHeightNode(q.xz)), () => {
            found.assign(1.0);
            lo.assign(prev);
            hi.assign(s);
          });
          prev.assign(s);
        });
      });
      If(found.greaterThan(0.5), () => {
        Loop(MARCH_REFINE, () => {
          const mid = lo.add(hi).mul(0.5);
          const q = origin.add(dir.mul(mid));
          If(q.y.lessThanEqual(seabed.bedHeightNode(q.xz)), () => { hi.assign(mid); }).Else(() => { lo.assign(mid); });
        });
        result.assign(vec2(lo.add(hi).mul(0.5), 1.0));
      });
    });
    return result;
  })();
}

/** The water's own colour seen from an eye at `origin` (its depth below the still water). */
function waterColourFrom(origin: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  // From `origin`, not cameraPosition: the self-tests evaluate this in a compute pass, which has no camera.
  // The sun shaded as at the eye: the camera's sun through the clouds (final review I2).
  return waterColourAtDepthNode(deepWaterUpwelling(sky, u, sky.cloudSunTransmittance), u.extinction, max(seabed.tide.sub(origin.y), 0.0));
}

/**
 * The reef along `dir` from `origin` within `maxDist`, through the water; `behind` where there is none. The march fades
 * the reef into the water's colour before its reach, as the look-through from above does.
 */
function reefOrNode(origin: N, dir: N, maxDist: N, behind: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  return Fn(() => {
    const out = behind.toVar();
    const march = marchBedAlongNode(origin, dir, maxDist, seabed);
    If(march.y.greaterThan(0.5).and(march.x.lessThan(MAX_MARCH_DIST_M)), () => {
      const bed = seabedRadianceNode(origin.add(dir.mul(march.x)), seabed, sky, u, sky.cloudSunTransmittance);
      out.assign(throughWaterNode(bed, waterColourFrom(origin, seabed, sky, u), u.extinction, march.x));
    });
    return out;
  })();
}

/**
 * What an underwater eye at `origin` sees along `dir` where nothing is drawn: the reef where the march meets it (down,
 * level or rising, stopping at the surface), through the water, else the water's own colour at the eye's depth.
 */
export function waterVolumeColourNode(origin: N, dir: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  const inf = waterColourFrom(origin, seabed, sky, u);
  // A rising ray leaves the water at the still surface: the sheet from below draws beyond it (reefInFrontNode). Only a
  // rising ray: a level or falling one from a surface point above the still water (the mirror's reflected ray, from a
  // crest) would get a negative distance and see no reef at all.
  const toSurface = max(seabed.tide.sub(origin.y), 0.0).div(max(dir.y, 1e-3));
  const reach = select(dir.y.greaterThan(1e-3), min(float(MAX_MARCH_DIST_M), toSurface), float(MAX_MARCH_DIST_M));
  return reefOrNode(origin, dir, reach, inf, seabed, sky, u);
}

/**
 * `surface` (what the sheet from below shows `dist` away along `dir`), unless the reef stands between the eye and that
 * point: then the reef, through the water.
 */
export function reefInFrontNode(origin: N, dir: N, dist: N, surface: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  return reefOrNode(origin, dir, min(dist, float(MAX_MARCH_DIST_M)), surface, seabed, sky, u);
}

/**
 * A mesh's `colour` at `point` as an underwater eye at `origin` sees it: through the water, fading into it where the reef
 * does (throughWaterNode), so nothing drawn shows beyond the water volume's reach.
 */
export function seenThroughWaterNode(origin: N, point: N, colour: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  return throughWaterNode(colour, waterColourFrom(origin, seabed, sky, u), u.extinction, length(point.sub(origin)));
}

/**
 * Whether `point` lies under the bed the underwater view draws: the volume's march writes no depth, so a mesh must hide
 * its own buried part from an underwater eye (the land, which does that above water, is hidden below it).
 */
export function belowBedNode(point: N, seabed: Seabed): N {
  return point.y.lessThan(seabed.bedHeightNode(point.xz));
}

/** The water around an underwater eye: drawn first, in place of the sky dome, wherever the sheet doesn't cover. */
export class WaterVolume {
  readonly mesh: THREE.Mesh;

  constructor(seabed: Seabed, sky: Sky, u: WaterOpticsUniforms) {
    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    const dir = normalize(positionWorld.sub(cameraPosition));
    material.colorNode = waterVolumeColourNode(cameraPosition, dir, seabed, sky, u);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
    this.mesh.scale.setScalar(1000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.visible = false;
  }

  followCamera(p: THREE.Vector3): void {
    this.mesh.position.copy(p);
  }
}
