import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, int, storage, uniform, vec3 } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { computeWgsl } from './wgslBuild.testutil';
import { CURVE_SAMPLES, SPAN_SAMPLES, TURN_COST_H, hermitePoint, turnAngle } from './wombProfile';
import { sectionFrameKnots, sectionTangents } from './wombSection';
import { leanPhase } from './setWaveModel';
import { SAMPLES_PER_SEGMENT_MAX, SECTION_DENSE_POINTS, WOMB_FRAME_VEC4S, WOMB_KNOT_VEC4S, createKeyTable, sectionNumbersNode, wombFrameNode } from './wombSectionNodes';

type N = any;

describe('wombSectionNodes: the GPU mirror of the section', () => {
  it(`no dense segment of the walk holds more than ${SAMPLES_PER_SEGMENT_MAX} samples (the frame pass's bounded inner loop)`, () => {
    let worst = 0;
    // On a flat sea and on a leaning swell (setWaveModel.leanPhase), as the frame pass reads it.
    const sheets = [(u: number): [number, number] => [u, 0], (u: number): [number, number] => {
      const k = (2 * Math.PI) / 100, { th } = leanPhase(-k * u, 1, 0.12);
      return [u + 0.9 * Math.sin(k * u), 1.5 * (Math.cos(th) + 0.15 * Math.cos(2 * th))];
    }];
    for (const sheet of sheets) for (let ph = 0; ph <= 2; ph += 0.05) for (const hv of [0, 0.5, 1]) {
      const { knots, beyond } = sectionFrameKnots({ A: 2.5, phase: ph, hollow: hv, rho: 1 }, sheet), { t, m } = sectionTangents(knots, beyond);
      const dp = (d: number): readonly number[] => hermitePoint(knots, t, m, d), DENSE_POINTS = SECTION_DENSE_POINTS, s = [0];
      let prev = dp(0), cur = dp(1);
      s.push(Math.hypot(cur[0] - prev[0], cur[1] - prev[1]));
      for (let d = 2; d < DENSE_POINTS; d++) {
        const next = dp(d);
        s.push(s[d - 1] + Math.hypot(next[0] - cur[0], next[1] - cur[1]) + TURN_COST_H * turnAngle(cur[0] - prev[0], cur[1] - prev[1], next[0] - cur[0], next[1] - cur[1]));
        prev = cur; cur = next;
      }
      const total = s[s.length - 1], per = new Array<number>(DENSE_POINTS).fill(0);
      for (let j = 0; j < CURVE_SAMPLES - 1; j++) {
        const target = (total * j) / (CURVE_SAMPLES - 1);
        let d = 1;
        while (d < DENSE_POINTS - 1 && s[d] < target) d++;
        per[d]++;
      }
      worst = Math.max(worst, ...per);
    }
    expect(worst).toBeLessThanOrEqual(SAMPLES_PER_SEGMENT_MAX);
    expect(SPAN_SAMPLES).toBe(24);
  });

  it('builds to WGSL as a compute pass (one invocation per station)', () => {
    const stations = 4;
    const keys = storage(createKeyTable(), 'vec4', createKeyTable().count).toReadOnly();
    const knots = storage(new THREE.StorageBufferAttribute(new Float32Array(stations * WOMB_KNOT_VEC4S * 4), 4), 'vec4', stations * WOMB_KNOT_VEC4S);
    const samples = storage(new THREE.StorageBufferAttribute(new Float32Array(stations * CURVE_SAMPLES * 4), 4), 'vec4', stations * CURVE_SAMPLES);
    const frames = storage(new THREE.StorageBufferAttribute(new Float32Array(stations * WOMB_FRAME_VEC4S * 4), 4), 'vec4', stations * WOMB_FRAME_VEC4S);
    const periodS = uniform(15), ribbonOnset = uniform(0.6);
    const pass = Fn(() => {
      const i: N = int(instanceIndex).toVar();
      const nums = sectionNumbersNode({ H: float(4), r: float(1.1), tb: float(0.5), psi: float(0.08) }, { periodS, ribbonOnset });
      const f = wombFrameNode(nums, keys, (k: N) => knots.element(i.mul(WOMB_KNOT_VEC4S).add(k)), (j: N, v: N) => { samples.element(i.mul(CURVE_SAMPLES).add(j)).assign(v); }, (r: number) => vec3(float(r), 0.0, float(r)));
      frames.element(i.mul(WOMB_FRAME_VEC4S)).assign(f.A);
    })().compute(stations) as THREE.ComputeNode;
    const wgsl = computeWgsl(pass);
    expect(wgsl).toContain('fn main');
    expect((wgsl.match(/var<storage/g) ?? []).length).toBe(4);
  });
});
