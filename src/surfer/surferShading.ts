import * as THREE from 'three/webgpu';
import { abs, attribute, cameraPosition, clamp, dot, exp, float, length, max, mix, mx_noise_float, mx_worley_noise_float, normalize, normalWorld, positionGeometry, positionLocal, positionWorld, pow, smoothstep, step, uniform, uv, vec2, vec3 } from 'three/tsl';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import type { SurferPreset } from './presets';
import type { SkinZones } from './skinDetail';
import type { OutfitMasks } from './wardrobe';

type N = any;
const rgb = (c: [number, number, number]): N => vec3(...c);

export type OutfitUniforms = { [K in keyof OutfitMasks]: THREE.UniformNode<'float', number> };
export const outfitUniforms = (): OutfitUniforms => ({ spring: uniform(0), steamer: uniform(0), rashie: uniform(0), bottoms: uniform(0), top: uniform(0), boardies: uniform(0) });

const gauss = (P: N, c: [number, number, number], s: number): N => exp(P.sub(vec3(...c)).lengthSq().div(-s * s));
function toSegment(P: N, a: [number, number, number], b: [number, number, number]): N {
  const A = vec3(...a), AB = vec3(...b).sub(A);
  const t = clamp(dot(P.sub(A), AB).div(dot(AB, AB)), 0, 1);
  return length(P.sub(A.add(AB.mul(t))));
}

/** Freckles, pimples and a sunburn flush over the skin's albedo (grommet spec §5), pinned to the unskinned surface. */
function skinDetail(albedo: N, p: SurferPreset, z: SkinZones): N {
  const P: N = positionGeometry;
  const face = max(max(gauss(P, z.cheeks[0], 0.028), gauss(P, z.cheeks[1], 0.028)), gauss(P, z.bridge, 0.02));
  const arms = max(float(1).sub(smoothstep(0.02, 0.05, toSegment(P, ...z.forearms[0]))), float(1).sub(smoothstep(0.02, 0.05, toSegment(P, ...z.forearms[1]))));
  const density = clamp(face.add(gauss(P, z.forehead, 0.035).mul(0.35)).add(max(gauss(P, z.shoulders[0], 0.08), gauss(P, z.shoulders[1], 0.08)).mul(0.45)).add(arms.mul(0.3)), 0, 1).mul(p.freckles);
  // Speckles 1–4 mm, clustered: a Worley field at ~4 mm cells, its threshold opening with the density.
  const cells = mx_worley_noise_float(P.mul(250.0));
  const size = mx_noise_float(P.mul(90.0)).mul(0.5).add(0.5);
  const spot = float(1).sub(smoothstep(density.mul(0.32).mul(size.mul(0.6).add(0.4)), density.mul(0.32).mul(size.mul(0.6).add(0.4)).add(0.06), cells)).mul(step(0.02, density));
  let out: N = mix(albedo, albedo.mul(vec3(0.72, 0.5, 0.36)), spot.mul(0.75));
  // The sunburn flush.
  const burn = clamp(gauss(P, z.bridge, 0.018).add(max(gauss(P, z.cheeks[0], 0.022), gauss(P, z.cheeks[1], 0.022))).add(max(gauss(P, z.earTops[0], 0.012), gauss(P, z.earTops[1], 0.012))).add(max(gauss(P, z.shoulders[0], 0.07), gauss(P, z.shoulders[1], 0.07)).mul(0.6)), 0, 1).mul(p.sunburn);
  out = mix(out, vec3(0.78, 0.3, 0.27), burn.mul(0.35));
  // Pimples: a red bump with a lighter centre and a pink halo.
  for (const [x, y, zc, r] of z.pimples) {
    const d = length(P.sub(vec3(x, y, zc)));
    const halo = float(1).sub(smoothstep(r, r * 2.6, d)), bump = float(1).sub(smoothstep(r * 0.4, r, d)), head = float(1).sub(smoothstep(0, r * 0.35, d));
    out = mix(out, vec3(0.62, 0.22, 0.2), halo.mul(0.3));
    out = mix(out, vec3(0.55, 0.12, 0.1), bump.mul(0.65));
    out = mix(out, vec3(0.85, 0.7, 0.6), head.mul(0.5));
  }
  return out;
}

/** Skin, with the outfit's baked masks painting neoprene, lycra, fabric and the boardies' shadow over it (spec §4.3–4.4). */
/**
 * `detail` (Grommet): the freckles, pimples and sunburn over the skin when the build wrote landmarks, and the wetness
 * (0 dry … 1 wet) that glosses the skin; without it the skin is wet and plain, as before.
 */
export function bodyMaterial(sky: Sky, p: SurferPreset, w: OutfitUniforms, sv?: (xz: N) => N, detail?: { zones: SkinZones | null; wet: THREE.UniformNode<'float', number> }): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  // glTF stores texture coordinates with V flipped (v → 1 − v; three's loader keeps it), so each mask packed into
  // a UV map's second channel comes back as 1 − mask: undo it.
  const mask = (name: string): N => {
    const a: N = attribute(name, 'vec2');
    return vec2(a.x, float(1).sub(a.y));
  };
  const mA = mask('uv1'), mB = mask('uv2'), mC = mask('uv3');
  const neo = max(w.spring.mul(mA.x), w.steamer.mul(mA.y));
  const inLycra = step(0.5, w.rashie.mul(mB.x));
  const fabric = max(w.bottoms.mul(mB.y), w.top.mul(mC.x));
  const inNeo = step(0.5, neo), inFabric = step(0.5, fabric), inUnder = step(0.5, w.boardies.mul(mC.y));
  const hem = inNeo.mul(float(1).sub(step(0.72, neo)));
  const skin = rgb(p.skin).mul(1 - 0.3 * p.tan);
  // The face and scalp (COLOR_0, tools/surfer/face.py): R hair under the hair, G brows, B lips, A lash line.
  const paint: N = attribute('color', 'vec4');
  let face: N = mix(skin, rgb(p.hairRoot).mul(0.85), smoothstep(0.25, 0.75, paint.x));
  face = mix(face, rgb(p.brows), smoothstep(0.3, 0.7, paint.y).mul(0.9));
  face = mix(face, rgb(p.lips), smoothstep(0.2, 0.8, paint.z).mul(0.75));
  face = mix(face, vec3(0.015, 0.012, 0.012), smoothstep(0.3, 0.7, paint.w).mul(0.85));
  if (detail?.zones && (p.freckles > 0 || p.sunburn > 0)) face = skinDetail(face, p, detail.zones);
  let albedo: N = mix(face, rgb(p.fabric), inFabric);
  albedo = mix(albedo, rgb(p.boardies), inUnder);
  albedo = mix(albedo, rgb(p.rashie), inLycra);
  albedo = mix(albedo, vec3(0.025, 0.025, 0.03), inNeo);
  albedo = mix(albedo, rgb(p.neopreneAccent), hem);
  const cloth = max(inFabric, inLycra);
  // Dry skin is duller than wet.
  const wet: N = detail?.wet ?? float(1);
  const skinSpec = mix(float(0.018), float(0.028), wet), skinShine = mix(float(25), float(60), wet);
  const specular = mix(mix(skinSpec, float(0.03), cloth), float(0.04), inNeo);
  const shininess = mix(mix(skinShine, float(25), cloth), float(18), inNeo);
  const wrap = mix(float(0.3), float(0.05), max(inNeo, cloth));
  m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular, shininess, wrap }, sv);
  return m;
}

/** Wet hair on cards (spec §4.2): strands drawn from the card's UVs, bleached toward the tips, alpha-tested. */
/**
 * Wet hair on cards (spec §4.2). `headCentre` (world, updated each pose) lights the cards as one volume: each card's
 * normal points out from the head's centre, so cards facing every which way don't shade into a patchwork.
 */
export function hairMaterial(sky: Sky, p: SurferPreset, headCentre: THREE.UniformNode<'vec3', THREE.Vector3>, sv?: (xz: N) => N, wet?: THREE.UniformNode<'float', number>): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const u: N = uv();
  const w: N = wet ?? float(1);
  // Solid through each card's middle (with the scalp painted underneath there are no holes to see through); only the
  // edges and the tips break into strands (gate 2: the old alpha looked moth-eaten).
  const strands = mx_noise_float(vec3(u.x.mul(26.0), u.y.mul(1.2), 1.7)).mul(0.5).add(0.5);
  const across = abs(u.x.mul(2).sub(1));
  const tip = smoothstep(0.7, 1.0, u.y);
  // Roots fade in, so the hairline is the painted scalp's soft edge, not a row of card ends.
  const root = smoothstep(0.0, 0.26, u.y.add(strands.mul(0.16)).sub(0.04));
  // Solid almost to each card's edge (slicked, wet hair reads as one surface), fraying only at the very edge and tips.
  m.opacityNode = float(1).sub(smoothstep(0.82, 1.0, across.add(strands.mul(0.12)))).sub(tip.mul(strands).mul(0.8)).mul(root);
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  // Strands live in the colour: fine lines along each card, a darker line where cards overlap, root to bleached tip.
  const fine = mx_noise_float(vec3(u.x.mul(70.0), u.y.mul(2.0), 7.3)).mul(0.5).add(0.5);
  const lines = fine.mul(0.22).add(0.86).mul(float(1).sub(across.mul(across).mul(0.3)));
  const albedo = mix(rgb(p.hairRoot), rgb(p.hairTip), pow(u.y, 1.4)).mul(lines).mul(mix(float(0.95), float(0.72), w)); // wet: a shade darker
  const volume = normalize(positionWorld.sub(headCentre));
  m.colorNode = litColor(sky, { albedo, normal: volume, specular: mix(float(0.03), float(0.045), w), shininess: mix(float(40), float(120), w), wrap: float(0.25) }, sv);
  // Wet curls pull in toward the head, most at the tips (grommet spec §3). The surfer's group sits at the world origin
  // with identity nodes (manifest.test pins it), so the skinned local position and headCentre share a space.
  if (p.curlTighten > 0) m.positionNode = mix(positionLocal, headCentre, float(p.curlTighten).mul(w).mul(u.y));
  return m;
}

export function eyesMaterial(sky: Sky, p: SurferPreset, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  // The angle from straight ahead (COLOR_0.r = (cos + 1) / 2, tools/surfer/face.py) draws a round iris (27°), a dark
  // limbus ring, and the pupil (11°), with a little radial streaking in the iris, under a wet highlight.
  const c: N = attribute('color', 'vec4').x.mul(2).sub(1);
  const iris = smoothstep(0.885, 0.9, c), limbus = smoothstep(0.87, 0.885, c).sub(iris), pupil = smoothstep(0.978, 0.984, c);
  const streak = mx_noise_float(vec3(c.mul(60.0), 0.0, 2.3)).mul(0.25).add(0.9);
  let albedo: N = mix(vec3(0.74, 0.71, 0.68), rgb(p.iris).mul(0.4), limbus);
  albedo = mix(albedo, rgb(p.iris).mul(streak), iris);
  albedo = mix(albedo, vec3(0.008, 0.008, 0.01), pupil);
  m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular: float(0.04), shininess: float(300), wrap: float(0.3) }, sv);
  return m;
}

export function fabricMaterial(sky: Sky, color: [number, number, number], sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.DoubleSide;
  m.colorNode = litColor(sky, { albedo: rgb(color), normal: normalWorld, specular: float(0.03), shininess: float(20), wrap: float(0.1) }, sv);
  return m;
}

/** Clear glass: little colour, the sky's reflection and a crisp highlight, stronger toward grazing angles. */
export function lensMaterial(sky: Sky, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.side = THREE.DoubleSide;
  const facing = abs(normalWorld.dot(normalize(cameraPosition.sub(positionWorld))));
  m.colorNode = litColor(sky, { albedo: vec3(0.02, 0.025, 0.03), normal: normalWorld, specular: float(0.9), shininess: float(400), wrap: float(0) }, sv);
  m.opacityNode = mix(float(0.55), float(0.12), facing);
  return m;
}

/** Off-white teeth, a little translucent at the tips (a touch of wrap lighting). */
export function teethMaterial(sky: Sky, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = litColor(sky, { albedo: vec3(0.72, 0.68, 0.58), normal: normalWorld, specular: float(0.05), shininess: float(80), wrap: float(0.45) }, sv);
  return m;
}

/** Glossy plastic (Grommet's black frames): a tight bright highlight on a dark body, not fabric's broad sheen. */
export function plasticMaterial(sky: Sky, color: [number, number, number], sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.DoubleSide;
  m.colorNode = litColor(sky, { albedo: rgb(color), normal: normalWorld, specular: float(0.05), shininess: float(300), wrap: float(0) }, sv);
  return m;
}
