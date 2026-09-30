import * as THREE from 'three/webgpu';
import { abs, attribute, float, max, mix, mx_noise_float, normalWorld, pow, smoothstep, step, uniform, uv, vec3 } from 'three/tsl';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import type { SurferPreset } from './presets';
import type { OutfitMasks } from './wardrobe';

type N = any;
const rgb = (c: [number, number, number]): N => vec3(...c);

export type OutfitUniforms = { [K in keyof OutfitMasks]: THREE.UniformNode<'float', number> };
export const outfitUniforms = (): OutfitUniforms => ({ spring: uniform(0), steamer: uniform(0), rashie: uniform(0), bottoms: uniform(0), top: uniform(0), boardies: uniform(0) });

/** Skin, with the outfit's baked masks painting neoprene, lycra, fabric and the boardies' shadow over it (spec §4.3–4.4). */
export function bodyMaterial(sky: Sky, p: SurferPreset, w: OutfitUniforms, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const mA: N = attribute('uv1', 'vec2'), mB: N = attribute('uv2', 'vec2'), mC: N = attribute('uv3', 'vec2');
  const neo = max(w.spring.mul(mA.x), w.steamer.mul(mA.y));
  const inLycra = step(0.5, w.rashie.mul(mB.x));
  const fabric = max(w.bottoms.mul(mB.y), w.top.mul(mC.x));
  const inNeo = step(0.5, neo), inFabric = step(0.5, fabric), inUnder = step(0.5, w.boardies.mul(mC.y));
  const hem = inNeo.mul(float(1).sub(step(0.72, neo)));
  const skin = rgb(p.skin).mul(1 - 0.3 * p.tan);
  let albedo: N = mix(skin, rgb(p.fabric), inFabric);
  albedo = mix(albedo, rgb(p.boardies), inUnder);
  albedo = mix(albedo, rgb(p.rashie), inLycra);
  albedo = mix(albedo, vec3(0.025, 0.025, 0.03), inNeo);
  albedo = mix(albedo, rgb(p.neopreneAccent), hem);
  const cloth = max(inFabric, inLycra);
  const specular = mix(mix(float(0.028), float(0.03), cloth), float(0.04), inNeo);
  const shininess = mix(mix(float(60), float(25), cloth), float(18), inNeo);
  const wrap = mix(float(0.3), float(0.05), max(inNeo, cloth));
  m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular, shininess, wrap }, sv);
  return m;
}

/** Wet hair on cards (spec §4.2): strands drawn from the card's UVs, bleached toward the tips, alpha-tested. */
export function hairMaterial(sky: Sky, p: SurferPreset, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const u: N = uv();
  const strands = mx_noise_float(vec3(u.x.mul(40.0), u.y.mul(2.5), 1.7)).mul(0.5).add(0.5);
  const middle = float(1).sub(abs(u.x.mul(2).sub(1)));
  const tip = smoothstep(0.55, 1.0, u.y);
  m.opacityNode = strands.mul(0.6).add(middle.mul(0.7)).sub(tip.mul(0.6));
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  const albedo = mix(rgb(p.hairRoot), rgb(p.hairTip), pow(u.y, 1.5)).mul(strands.mul(0.3).add(0.7)).mul(0.6); // wet: darker
  m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular: float(0.035), shininess: float(90), wrap: float(0.2) }, sv);
  return m;
}

export function eyesMaterial(sky: Sky, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = litColor(sky, { albedo: vec3(0.03, 0.022, 0.018), normal: normalWorld, specular: float(0.04), shininess: float(200) }, sv);
  return m;
}

export function fabricMaterial(sky: Sky, color: [number, number, number], sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.DoubleSide;
  m.colorNode = litColor(sky, { albedo: rgb(color), normal: normalWorld, specular: float(0.03), shininess: float(20), wrap: float(0.1) }, sv);
  return m;
}
