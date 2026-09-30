import * as THREE from 'three/webgpu';
import { abs, atan, attribute, cameraPosition, clamp, cos, cross, dFdx, dFdy, dot, exp, float, fwidth, length, max, min, mix, mx_noise_float, mx_worley_noise_float, normalize, normalWorld, positionGeometry, positionLocal, positionWorld, pow, sign, sin, smoothstep, sqrt, step, uniform, uv, vec2, vec3 } from 'three/tsl';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import type { SurferPreset } from './presets';
import type { SkinZones } from './skinDetail';
import type { OutfitMasks } from './wardrobe';

type N = any;
type V3 = [number, number, number];
const rgb = (c: [number, number, number]): N => vec3(...c);

export type OutfitUniforms = { [K in keyof OutfitMasks]: THREE.UniformNode<'float', number> };
export const outfitUniforms = (): OutfitUniforms => ({ spring: uniform(0), steamer: uniform(0), rashie: uniform(0), bottoms: uniform(0), top: uniform(0), boardies: uniform(0) });

const gauss = (P: N, c: V3, s: number): N => exp(P.sub(vec3(...c)).lengthSq().div(-s * s));
const plus = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function toSegment(P: N, a: V3, b: V3): N {
  const A = vec3(...a), AB = vec3(...b).sub(A);
  const t = clamp(dot(P.sub(A), AB).div(dot(AB, AB)), 0, 1);
  return length(P.sub(A.add(AB.mul(t))));
}

/**
 * A height field (metres, over the unskinned surface) as a perturbed world normal: the screen-derivative bump
 * (Mikkelsen 2010, "Bump Mapping Unparametrized Surfaces on the GPU"). No tangents or textures needed.
 */
function bumpNormal(n: N, h: N): N {
  const dpdx = dFdx(positionWorld), dpdy = dFdy(positionWorld);
  const r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  const det = dot(dpdx, r1);
  const grad = r1.mul(dFdx(h)).add(r2.mul(dFdy(h))).mul(sign(det));
  return normalize(abs(det).mul(n).sub(grad));
}

/**
 * Pores (closeup spec §4.2): pits at the centres of ~0.7 mm Worley cells and a finer grain, 60 µm deep at most. Faded
 * where a pore is smaller than a pixel, so the skin never shimmers at a distance.
 */
function poreHeight(P: N, strength: N): N {
  const pit = float(1).sub(smoothstep(0.0, 0.3, mx_worley_noise_float(P.mul(1400.0))));
  const grain = mx_noise_float(P.mul(3400.0));
  const pixel = length(fwidth(P)).mul(1400.0);
  const fade = float(1).sub(smoothstep(0.35, 0.9, pixel));
  return pit.mul(-0.00006).add(grain.mul(0.000012)).mul(strength).mul(fade);
}

/** Freckles, pimples and a sunburn flush over the skin's albedo (grommet spec §5), pinned to the unskinned surface. */
function frecklesAndSpots(albedo: N, p: SurferPreset, z: SkinZones): N {
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

/** The face's colour zones for every rider (closeup spec §4.2): blush, the eyes' soft shadows, eye shadow, stubble. */
function faceZones(albedo: N, p: SurferPreset, z: SkinZones, lips: N): N {
  const P: N = positionGeometry;
  const r = z.eyeRadius;
  // Blush: the cheeks' apples, the nose tip, the ears.
  const blush = clamp(max(gauss(P, z.cheeks[0], 0.022), gauss(P, z.cheeks[1], 0.022)).add(gauss(P, z.nose, 0.011).mul(0.55)).add(max(gauss(P, z.earTops[0], 0.02), gauss(P, z.earTops[1], 0.02)).mul(0.5)), 0, 1).mul(p.blush);
  let out: N = mix(albedo, albedo.mul(vec3(1.1, 0.74, 0.7)), blush.mul(0.55));
  // Soft shadow under and around the eyes (the orbits), a touch cool.
  const under = (i: 0 | 1): V3 => plus(z.eyes[i], [0, -0.8 * r, 0.75 * r]);
  const orbit = max(gauss(P, under(0), 0.6 * r), gauss(P, under(1), 0.6 * r));
  out = out.mul(float(1).sub(orbit.mul(vec3(0.1, 0.13, 0.11))));
  // Eye shadow (Shazza): a warm brown haze over the upper lids, deepest in the crease.
  const lid = (i: 0 | 1): V3 => plus(z.eyes[i], [(i === 0 ? 1 : -1) * 0.12 * r, 0.62 * r, 0.72 * r]);
  const shade = max(gauss(P, lid(0), 0.55 * r), gauss(P, lid(1), 0.55 * r)).mul(p.eyeShadow);
  out = mix(out, out.mul(vec3(0.62, 0.48, 0.42)), shade.mul(0.6));
  if (p.stubble > 0) {
    // Stubble over the jaw, chin and upper lip: under a line from the ear's foot to beside the nose, over the neck,
    // ahead of the ears, off the lips; dense dark dots on a faint shadow.
    const earX = Math.abs(z.ears[0][0]), earY = (z.ears[0][1] + z.ears[1][1]) / 2 - 0.02, noseY = z.nose[1] - 0.012;
    const across = clamp(abs(P.x).sub(0.018).div(earX - 0.018), 0, 1);
    const cheekLine = mix(float(noseY), float(earY), across);
    const beardTop = smoothstep(0.004, -0.004, P.y.sub(cheekLine));
    const neck = smoothstep(-0.095, -0.07, P.y.sub(z.mouth[1]));
    const front = smoothstep(z.ears[0][2] - 0.015, z.ears[0][2] + 0.01, P.z);
    const beard = beardTop.mul(neck).mul(front).mul(float(1).sub(lips)).mul(p.stubble);
    const dots = float(1).sub(smoothstep(0.08, 0.3, mx_worley_noise_float(P.mul(1500.0))));
    out = mix(out, out.mul(vec3(0.78, 0.76, 0.76)), beard.mul(0.6));
    out = mix(out, vec3(0.05, 0.035, 0.025), beard.mul(dots).mul(0.55));
  }
  return out;
}

/**
 * Skin, with the outfit's baked masks painting neoprene, lycra, fabric and the boardies' shadow over it (spec §4.3–4.4).
 * `detail`, where the build wrote landmarks (closeup spec §4.2): pores, subsurface-tinted wrap, the face's zones,
 * brow strands, glossy lips and Grommet's freckles; and the wetness (0 dry … 1 wet) that glosses the skin.
 */
export function bodyMaterial(sky: Sky, p: SurferPreset, w: OutfitUniforms, sv?: (xz: N) => N, detail?: { zones: SkinZones | null; wet: THREE.UniformNode<'float', number>; pores?: THREE.UniformNode<'float', number> }): THREE.MeshBasicNodeMaterial {
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
  const P: N = positionGeometry;
  const z = detail?.zones ?? null;
  const skin = rgb(p.skin).mul(1 - 0.3 * p.tan);
  // The face and scalp (COLOR_0, tools/surfer/face.py): R hair under the hair, G brows, B lips, A lash line; B and A
  // together the inside of the mouth.
  const paint: N = attribute('color', 'vec4');
  const pw = smoothstep(0.3, 0.7, paint.w), pz = smoothstep(0.2, 0.8, paint.z);
  const inside = pw.mul(pz), lips = pz.mul(float(1).sub(pw)), lashLine = pw.mul(float(1).sub(pz));
  let face: N = skin;
  if (z) face = faceZones(face, p, z, lips);
  face = mix(face, rgb(p.hairRoot).mul(0.85), smoothstep(0.25, 0.75, paint.x));
  // Brows as fine hairs: the painted band broken by streaks running along it.
  const streak = z ? smoothstep(-0.25, 0.45, mx_noise_float(vec3(P.x.mul(380.0), P.y.mul(2600.0), P.z.mul(2600.0)))).mul(0.5).add(0.5) : float(1);
  face = mix(face, rgb(p.brows), smoothstep(0.3, 0.7, paint.y).mul(0.92).mul(streak));
  // Lips: the colour deepening toward the lip line.
  const edge = lips.mul(float(1).sub(lips)).mul(4.0);
  face = mix(face, mix(rgb(p.lips), rgb(p.lips).mul(0.72), edge), lips.mul(0.8));
  face = mix(face, vec3(0.015, 0.012, 0.012), lashLine.mul(0.85));
  face = mix(face, vec3(0.1, 0.028, 0.028), inside);
  if (z && (p.freckles > 0 || p.sunburn > 0)) face = frecklesAndSpots(face, p, z);
  let albedo: N = mix(face, rgb(p.fabric), inFabric);
  albedo = mix(albedo, rgb(p.boardies), inUnder);
  albedo = mix(albedo, rgb(p.rashie), inLycra);
  albedo = mix(albedo, vec3(0.025, 0.025, 0.03), inNeo);
  albedo = mix(albedo, rgb(p.neopreneAccent), hem);
  const cloth = max(inFabric, inLycra), covered = max(max(inNeo, cloth), inUnder);
  // Dry skin is duller than wet; the T-zone a little oilier; the lips glossy.
  const wet: N = detail?.wet ?? float(1);
  const tZone = z ? clamp(gauss(P, z.nose, 0.018).add(gauss(P, z.forehead, 0.03).mul(0.6)), 0, 1) : float(0);
  const skinSpec = mix(float(0.018), float(0.028), wet).add(tZone.mul(0.008)), skinShine = mix(float(25), float(60), wet).add(tZone.mul(15));
  const lipSpec = mix(skinSpec, float(0.035 + 0.03 * p.lipGloss), lips), lipShine = mix(skinShine, float(40 + 80 * p.lipGloss), lips);
  const specular = mix(mix(lipSpec, float(0.03), cloth), float(0.04), inNeo);
  const shininess = mix(mix(lipShine, float(25), cloth), float(18), inNeo);
  const wrap = mix(float(0.42), float(0.05), max(inNeo, cloth));
  // Pores on bare skin: strongest on the nose and cheeks, faint on the body, none on the lips or under cloth.
  let normal: N = normalWorld;
  if (z) {
    const faceNear = clamp(gauss(P, z.nose, 0.045).add(max(gauss(P, z.cheeks[0], 0.025), gauss(P, z.cheeks[1], 0.025)).mul(0.5)), 0, 1);
    const strength = mix(float(0.3), float(1.0), faceNear).mul(float(1).sub(lips)).mul(float(1).sub(inside)).mul(float(1).sub(covered)).mul(detail?.pores ?? float(1));
    normal = bumpNormal(normalWorld, poreHeight(P, strength));
  }
  // Red light reaches furthest past the terminator (the skin's subsurface), cloth wraps alike.
  const scatter = mix(vec3(1.0, 0.55, 0.4), vec3(1, 1, 1), covered);
  m.colorNode = litColor(sky, { albedo, normal, specular, shininess, wrap, scatter }, sv);
  return m;
}

/**
 * Hair on cards (spec §4.2; closeup spec §4.2). `headCentre` (world, updated each pose) lights the cards as one volume:
 * each card's normal points out from the head (and, below it, out from the fall, for long hair), so cards facing every
 * which way don't shade into a patchwork. Two Kajiya–Kay highlights run along the strands, the tangent taken from the
 * cards' UV derivatives: a tight white one and a broader one tinted by the hair.
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
  m.opacityNode = float(1).sub(smoothstep(0.82, 1.0, across.add(strands.mul(0.12)))).sub(tip.mul(strands).mul(0.8)).mul(root);
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  // Strands live in the colour: fine lines along each card, a darker line where cards overlap, root to bleached tip.
  const fine = mx_noise_float(vec3(u.x.mul(70.0), u.y.mul(2.0), 7.3)).mul(0.5).add(0.5);
  const lines = fine.mul(0.22).add(0.86).mul(float(1).sub(across.mul(across).mul(0.3)));
  const albedo = mix(rgb(p.hairRoot), rgb(p.hairTip), pow(u.y, 1.4)).mul(lines).mul(mix(float(0.95), float(0.72), w)); // wet: a shade darker
  // The volume's normal: out from the head; below the head (long hair), out from the fall, not down into the sea.
  const d: N = positionWorld.sub(headCentre);
  const below = smoothstep(0.0, 0.16, d.y.negate());
  const volume = normalize(vec3(d.x, d.y.mul(float(1).sub(below.mul(0.9))), d.z));
  // Along the strand: ∂P/∂v from the screen derivatives of the position and the card's UVs.
  const dp1: N = dFdx(positionWorld), dp2: N = dFdy(positionWorld), duv1: N = dFdx(u), duv2: N = dFdy(u);
  const det = duv1.x.mul(duv2.y).sub(duv2.x.mul(duv1.y));
  const T = normalize(dp2.mul(duv1.x).sub(dp1.mul(duv2.x)).mul(sign(det)).add(vec3(0, 1e-6, 0)));
  const L = sky.sunDirection, V = normalize(cameraPosition.sub(positionWorld));
  const H = normalize(L.add(V));
  const kk = (t: N, e: N): N => pow(sqrt(max(float(1).sub(dot(t, H).mul(dot(t, H))), 0.0)), e);
  const lit = smoothstep(-0.1, 0.3, dot(volume, L));
  const primary = kk(normalize(T.add(volume.mul(0.1))), mix(float(90), float(220), w)).mul(mix(float(0.05), float(0.1), w));
  const secondary = kk(normalize(T.sub(volume.mul(0.15))), float(28)).mul(0.05);
  const sunExtra = vec3(primary, primary, primary).add(albedo.mul(secondary).mul(3.0)).mul(lit).mul(fine.mul(0.6).add(0.6));
  m.colorNode = litColor(sky, { albedo, normal: volume, specular: mix(float(0.02), float(0.03), w), shininess: mix(float(40), float(120), w), wrap: float(0.25), sunExtra }, sv);
  // Wet curls pull in toward the head, most at the tips (grommet spec §3), but never inside the scalp (~10 cm from the
  // head's centre; pulling straight to the centre sank them into his skull and left a bald orange cap). The surfer's
  // group sits at the world origin with identity nodes (manifest.test pins it), so the skinned local position and
  // headCentre share a space.
  if (p.curlTighten > 0) {
    const out: N = positionLocal.sub(headCentre), r: N = length(out);
    const pulled = max(r.mul(float(1).sub(float(p.curlTighten).mul(w).mul(u.y))), min(r, float(0.1)));
    m.positionNode = headCentre.add(out.div(r).mul(pulled));
  }
  return m;
}

/** What the eye shader needs of a rider's eyes (closeup spec §4.2): their centres and radius, and the gaze. */
export interface EyeLook {
  zones: SkinZones | null;
  gaze: THREE.UniformNode<'vec2', THREE.Vector2>;
}

/**
 * The eyes, drawn per fragment from the angle to the gaze (closeup spec §4.2): a round iris sized in millimetres against
 * the fitted eyeball, with radial fibres, a dark limbal rim and a lighter ring by the pupil; a sclera pinker toward the
 * corners and shaded by the upper lid; a wet highlight. Without landmarks (an older build) the per-vertex angle drawn
 * straight ahead, as before.
 */
export function eyesMaterial(sky: Sky, p: SurferPreset, sv?: (xz: N) => N, look?: EyeLook): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const z = look?.zones;
  if (!z || !look) {
    const c: N = attribute('color', 'vec4').x.mul(2).sub(1);
    const iris = smoothstep(0.885, 0.9, c), limbus = smoothstep(0.87, 0.885, c).sub(iris), pupil = smoothstep(0.978, 0.984, c);
    let albedo: N = mix(vec3(0.74, 0.71, 0.68), rgb(p.iris).mul(0.4), limbus);
    albedo = mix(albedo, rgb(p.iris), iris);
    albedo = mix(albedo, vec3(0.008, 0.008, 0.01), pupil);
    m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular: float(0.04), shininess: float(300), wrap: float(0.3) }, sv);
    return m;
  }
  const P: N = positionGeometry;
  const left = step(0.0, P.x);
  const centre = mix(vec3(...z.eyes[1]), vec3(...z.eyes[0]), left);
  const d: N = normalize(P.sub(centre));
  const g: N = look.gaze;
  const gz = vec3(sin(g.x).mul(cos(g.y)), sin(g.y), cos(g.x).mul(cos(g.y)));
  const c = dot(d, gz);
  const r = z.eyeRadius * 1000;
  const irisCos = Math.cos(Math.asin(Math.min(0.9, p.irisMm / r))), pupilCos = Math.cos(Math.asin(Math.min(0.5, p.pupilMm / r)));
  const iris = smoothstep(irisCos - 0.003, irisCos + 0.002, c);
  const pupil = smoothstep(pupilCos - 0.0015, pupilCos + 0.0015, c);
  // 0 at the pupil's edge … 1 at the iris's rim.
  const rr = clamp(float(1).sub(c).div(1 - irisCos), 0, 1);
  const across = normalize(cross(gz, vec3(0, 1, 0)));
  const upward = cross(across, gz);
  const around = vec2(dot(d, across), dot(d, upward));
  const ring = normalize(around.add(vec2(1e-5, 0)));
  const fibres = mx_noise_float(vec3(ring.x.mul(34.0), ring.y.mul(34.0), rr.mul(4.0))).mul(0.5).add(0.5);
  const flecks = mx_noise_float(vec3(ring.x.mul(12.0), ring.y.mul(12.0), rr.mul(9.0).add(3.0))).mul(0.5).add(0.5);
  let irisCol: N = rgb(p.iris).mul(fibres.mul(0.7).add(0.55)).mul(flecks.mul(0.3).add(0.85));
  irisCol = mix(irisCol, rgb(p.iris).mul(1.7).add(vec3(0.03, 0.025, 0.0)), exp(rr.sub(0.28).mul(rr.sub(0.28)).mul(-60.0)).mul(0.45)); // the collarette
  irisCol = mix(irisCol, rgb(p.iris).mul(0.22), smoothstep(0.72, 1.0, rr)); // the limbal rim
  const faceFwd = d.z;
  let sclera: N = mix(vec3(0.8, 0.78, 0.75), vec3(0.78, 0.58, 0.55), smoothstep(0.85, 0.45, faceFwd).mul(0.55));
  sclera = mix(sclera, vec3(0.62, 0.62, 0.64), smoothstep(irisCos - 0.06, irisCos, c).mul(0.25)); // the iris's soft grey halo
  let albedo: N = mix(sclera, irisCol, iris);
  albedo = mix(albedo, vec3(0.006, 0.006, 0.008), pupil);
  // The upper lid's shadow across the top of the eye, and the corners in shade.
  const lidShade = smoothstep(0.05, 0.55, d.y).mul(0.55).add(smoothstep(0.6, 0.25, faceFwd).mul(0.35));
  albedo = albedo.mul(float(1).sub(clamp(lidShade, 0, 0.8)));
  // The cornea: a clear bulge over the iris, so its highlight sits a little forward of the ball's.
  const normal = normalize(normalWorld.add(normalize(cameraPosition.sub(positionWorld)).mul(iris.mul(0.08))));
  m.colorNode = litColor(sky, { albedo, normal, specular: float(0.05), shininess: float(700), wrap: float(0.35) }, sv);
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

/**
 * Lashes on the base mesh's lash strips (closeup spec §4.1, §4.2). COLOR_0 on the strips carries the lash coordinates
 * (tools/surfer/face.py): R root → tip, G along the lid, B 1 upper / 0 lower. Each lash is a stripe along the lid that
 * tapers to its tip, a little clumped and uneven, alpha-tested; near black with a warm tint.
 */
export function lashesMaterial(sky: Sky, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.DoubleSide;
  const c: N = attribute('color', 'vec4');
  const t = c.x, along = c.y, upper = c.z;
  // Upper: dense and clumped, full in the middle of the lid; lower: sparse, short and fine.
  const count = mix(float(22), float(120), upper);
  const clump = mx_noise_float(vec3(along.mul(14.0), 1.3, upper.mul(5.0))).mul(0.5).add(0.5);
  const jitter = mx_noise_float(vec3(along.mul(count).floor(), 3.1, upper.mul(5.0))).mul(0.25);
  const cell = along.mul(count).add(jitter).fract();
  const width = mix(float(0.85), float(0.12), pow(t, 0.7)).mul(mix(float(0.55), float(1.0), upper)).mul(clump.mul(0.4).add(0.8));
  const lash = float(1).sub(smoothstep(width.mul(0.5), width.mul(0.5).add(0.06), abs(cell.sub(0.5))));
  const reach = smoothstep(0.0, 0.2, along).mul(smoothstep(1.0, 0.75, along)).mul(0.4).add(0.6).mul(mix(float(0.55), float(1.0), upper));
  m.opacityNode = lash.mul(float(1).sub(smoothstep(reach.sub(0.1), reach, t)));
  m.alphaTest = 0.5;
  m.colorNode = litColor(sky, { albedo: vec3(0.018, 0.012, 0.009), normal: normalWorld, specular: float(0.04), shininess: float(60), wrap: float(0.4) }, sv);
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
