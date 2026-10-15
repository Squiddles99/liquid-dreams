import * as THREE from 'three/webgpu';
import { clamp, float, floor, int, ivec2, max, min, select, textureLoad, uniform } from 'three/tsl';
import { FACE_HOLLOWS, FACE_HOLLOW_STEP, FACE_PHASES, FACE_PHASE_STEP, FACE_SAMPLES, FACE_STOOD_PHASE, faceBrokenLengths, faceTable } from './faceTable';
import { FACE_DRAWN, setFaceDrawn } from './wombSection';

type N = any;

/**
 * The drawn face on the GPU (womb-story Task 11; faceTable's mirror): the table as a float texture, FACE_SAMPLES + 1 texels
 * wide, one row per (phase, hollow): texel j < FACE_SAMPLES (S, dS/ds, L, D), texel FACE_SAMPLES (faceBrokenLengths of the
 * row's hollow, 0, 0, 0). Read with the CPU's interpolation: linear in phase and hollow, the cubic Hermite in s.
 */
export const faceDrawnUniform: N = uniform(FACE_DRAWN);
/** The dial faceDrawn, for the CPU sheet and the GPU's alike. */
export function applyFaceDrawn(v: number): void {
  setFaceDrawn(v);
  faceDrawnUniform.value = v;
}

let TEX: THREE.DataTexture | null = null;
export function faceTexture(): THREE.DataTexture {
  if (TEX) return TEX;
  const W = FACE_SAMPLES + 1, H = FACE_PHASES * FACE_HOLLOWS, t = faceTable(), b = faceBrokenLengths(), data = new Float32Array(W * H * 4);
  for (let row = 0; row < H; row++) {
    data.set(t.subarray(row * FACE_SAMPLES * 4, (row + 1) * FACE_SAMPLES * 4), row * W * 4);
    data[(row * W + FACE_SAMPLES) * 4] = b[row % FACE_HOLLOWS];
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false; tex.needsUpdate = true;
  TEX = tex;
  return tex;
}

/** faceTable's cell: the four rows and their weights (as vars). */
function cellNode(phase: N, hollow: N): { r: N[]; w: N[] } {
  const gp = clamp(phase.div(FACE_PHASE_STEP), 0.0, FACE_PHASES - 1), gh = clamp(hollow.div(FACE_HOLLOW_STEP), 0.0, FACE_HOLLOWS - 1);
  const p0 = min(floor(gp), FACE_PHASES - 2).toVar(), h0 = min(floor(gh), FACE_HOLLOWS - 2).toVar();
  const tp = gp.sub(p0).toVar(), th = gh.sub(h0).toVar();
  const row = (dp: number, dh: number): N => int(p0.add(dp).mul(FACE_HOLLOWS).add(h0).add(dh)).toVar();
  return {
    r: [row(0, 0), row(0, 1), row(1, 0), row(1, 1)],
    w: [float(1.0).sub(tp).mul(float(1.0).sub(th)), float(1.0).sub(tp).mul(th), tp.mul(float(1.0).sub(th)), tp.mul(th)],
  };
}
const texelNode = (c: { r: N[]; w: N[] }, j: N): N => {
  const tex = faceTexture(), at = (i: number): N => textureLoad(tex, ivec2(j, c.r[i]), int(0));
  return at(0).mul(c.w[0]).add(at(1).mul(c.w[1])).add(at(2).mul(c.w[2])).add(at(3).mul(c.w[3]));
};

/** faceTable.faceSize's L and faceLengthRef (units of A) at (phase, hollow). */
export function faceLengthsNode(phase: N, hollow: N): { L: N; ref: N } {
  const c = cellNode(phase, hollow), L = texelNode(c, int(0)).z.toVar();
  const gh = clamp(hollow.div(FACE_HOLLOW_STEP), 0.0, FACE_HOLLOWS - 1), h0 = min(floor(gh), FACE_HOLLOWS - 2);
  const lb = (dh: number): N => textureLoad(faceTexture(), ivec2(int(FACE_SAMPLES), int(h0.add(dh))), int(0)).x;
  const lbx = lb(0).add(lb(1).sub(lb(0)).mul(gh.sub(h0)));
  const x = clamp(phase.sub(0.25).div(FACE_STOOD_PHASE - 0.25), 0.0, 1.0), e = x.mul(x).mul(float(3.0).sub(x.mul(2.0)));
  return { L, ref: max(L, lbx.mul(e)).toVar() };
}

/** faceTable.faceShapeIn: S and dS/ds at s on a face `ref` long, the drawing over its own `L`, then level at its low. */
export function faceShapeInNode(phase: N, hollow: N, s: N, L: N, ref: N): { S: N; dS: N } {
  const c = cellNode(phase, hollow), k = ref.div(max(L, 1e-6)).toVar(), xs = s.mul(k).toVar();
  const g = clamp(xs, 0.0, 1.0).mul(FACE_SAMPLES - 1), j = min(floor(g), FACE_SAMPLES - 2).toVar(), x = g.sub(j).toVar(), h = 1 / (FACE_SAMPLES - 1);
  const a = texelNode(c, int(j)).toVar(), b = texelNode(c, int(j).add(1)).toVar();
  const x2 = x.mul(x), x3 = x2.mul(x);
  const S = x3.mul(2.0).sub(x2.mul(3.0)).add(1.0).mul(a.x).add(x3.sub(x2.mul(2.0)).add(x).mul(h).mul(a.y))
    .add(x2.mul(3.0).sub(x3.mul(2.0)).mul(b.x)).add(x3.sub(x2).mul(h).mul(b.y));
  const dS = x2.mul(6.0).sub(x.mul(6.0)).mul(a.x).add(x2.mul(3.0).sub(x.mul(4.0)).add(1.0).mul(h).mul(a.y))
    .add(x.mul(6.0).sub(x2.mul(6.0)).mul(b.x)).add(x2.mul(3.0).sub(x.mul(2.0)).mul(h).mul(b.y)).div(h);
  const past = xs.greaterThanEqual(1.0);
  return { S: select(past, float(-1.0), S), dS: select(past, float(0.0), dS.mul(k)) };
}
