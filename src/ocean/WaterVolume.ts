import * as THREE from 'three/webgpu';
import { Fn, If, cameraPosition, float, max, normalize, positionWorld, smoothstep } from 'three/tsl';
import type { Seabed } from '../seabed/Seabed';
import { marchSeabedNode, seabedRadianceNode } from '../seabed/seabedShading';
import { MAX_MARCH_DEPTH_M, MAX_MARCH_DIST_M, REACH_FADE_DEPTH_M, REACH_FADE_DIST_M } from '../seabed/waterColumn';
import type { Sky } from '../sky/Sky';
import { alongPathNode, waterColourAtDepthNode } from './underwaterNodes';
import { type WaterOpticsUniforms, deepWaterUpwelling } from './waterShading';

type N = any;

/**
 * What an underwater eye at `origin` sees along `dir` where nothing is drawn: the seabed where the march reaches it,
 * through the water, else the water's own colour at the eye's depth. The march's reach fade takes the bed into the water
 * colour before its cutoffs, as the look-through from above does.
 */
export function waterVolumeColourNode(origin: N, dir: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  return Fn(() => {
    // The eye's depth from `origin`, not cameraPosition: the self-test evaluates this in a compute pass, which has no camera.
    const inf = waterColourAtDepthNode(deepWaterUpwelling(sky, u), u.extinction, max(seabed.tide.sub(origin.y), 0.0)).toVar();
    const out = inf.toVar();
    If(dir.y.lessThan(0.0), () => {
      const march = marchSeabedNode(origin, dir, seabed);
      const aboveBed = origin.y.sub(seabed.bedHeightNode(origin.xz));
      const fade = float(1.0).sub(smoothstep(REACH_FADE_DEPTH_M, MAX_MARCH_DEPTH_M, aboveBed))
        .mul(float(1.0).sub(smoothstep(REACH_FADE_DIST_M, MAX_MARCH_DIST_M, march.x)));
      If(march.y.greaterThan(0.5).and(fade.greaterThan(0.0)), () => {
        const bed = seabedRadianceNode(origin.add(dir.mul(march.x)), seabed, sky, u);
        // The bed through the path, then the reach fade toward the water colour.
        const seen = alongPathNode(bed, inf, u.extinction, march.x);
        out.assign(inf.add(seen.sub(inf).mul(fade)));
      });
    });
    return out;
  })();
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
