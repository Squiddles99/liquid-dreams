import * as THREE from 'three/webgpu';
import { PI, acos, cameraPosition, clamp, dot, float, min, normalize, positionWorld, smoothstep, sqrt, vec3 } from 'three/tsl';
import { SUN_ANGULAR_RADIUS_RAD, type Sky } from './Sky';

export function createSkyDome(sky: Sky): THREE.Mesh {
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const dir = normalize(positionWorld.sub(cameraPosition));
  const angle = acos(clamp(dot(dir, sky.sunDirection), -1.0, 1.0));
  const r = float(SUN_ANGULAR_RADIUS_RAD);
  const x = clamp(angle.div(r), 0.0, 1.0);
  const limbDarkening = float(1.0).sub(float(0.6).mul(float(1.0).sub(sqrt(float(1.0).sub(x.mul(x))))));
  const disk = float(1.0).sub(smoothstep(r.mul(0.92), r.mul(1.08), angle));
  // Keeps the disk well inside half-float range (max 65504) in the scene target. Exposure can still scale it past
  // that; what keeps bloom and tone mapping finite is PicturePipeline's clamp on the exposed colour (HDR_MAX).
  const sunRadiance = min(sky.sunIlluminance.div(PI.mul(r).mul(r)).mul(limbDarkening), vec3(30000.0));
  material.colorNode = sky.radiance(dir, true).add(sunRadiance.mul(disk).mul(sky.cloudSunTransmittance));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  mesh.scale.setScalar(40000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
