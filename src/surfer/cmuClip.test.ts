import { existsSync, readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { type AmcFrame, parseAmc, parseAsf } from './asfAmc';
import { sampleClip } from './clipPlayer';
import { riderClipsProblems } from './clips';
import { CMU_BONE, cmuClip, restAlign } from './cmuClip';
import { BONES, type BoneName, referenceSkeleton } from './rig';

/** A CMU-shaped skeleton (its bone names, a T-pose's directions) so the tests run without the downloaded files. */
function cmuLikeAsf(): string {
  const B: [string, string, number[], number, number[], string][] = [
    ['lhipjoint', 'root', [0.56, -0.76, 0.32], 2.5, [0, 0, 0], ''], ['lfemur', 'lhipjoint', [0.34, -0.94, 0], 7.6, [0, 0, 20], 'rx ry rz'],
    ['ltibia', 'lfemur', [0.34, -0.94, 0], 7.9, [0, 0, 20], 'rx'], ['lfoot', 'ltibia', [0.06, -0.17, 0.98], 2.7, [-90, 0, 20], 'rx rz'],
    ['ltoes', 'lfoot', [0, 0, 1], 1.4, [-90, 0, 20], 'rx'],
    ['rhipjoint', 'root', [-0.56, -0.76, 0.32], 2.5, [0, 0, 0], ''], ['rfemur', 'rhipjoint', [-0.34, -0.94, 0], 7.5, [0, 0, -20], 'rx ry rz'],
    ['rtibia', 'rfemur', [-0.34, -0.94, 0], 8.1, [0, 0, -20], 'rx'], ['rfoot', 'rtibia', [-0.07, -0.18, 0.98], 2.7, [-90, 0, -20], 'rx rz'],
    ['rtoes', 'rfoot', [0, 0, 1], 1.3, [-90, 0, -20], 'rx'],
    ['lowerback', 'root', [-0.05, 0.99, -0.11], 2.1, [0, 0, 0], 'rx ry rz'], ['upperback', 'lowerback', [0, 1, 0], 2.1, [0, 0, 0], 'rx ry rz'],
    ['thorax', 'upperback', [0.03, 1, 0.05], 2.1, [0, 0, 0], 'rx ry rz'], ['lowerneck', 'thorax', [0.04, 0.98, 0.19], 1.8, [0, 0, 0], 'rx ry rz'],
    ['upperneck', 'lowerneck', [-0.02, 0.99, -0.14], 1.9, [0, 0, 0], 'rx ry rz'], ['head', 'upperneck', [0, 1, -0.07], 1.9, [0, 0, 0], 'rx ry rz'],
    ['lclavicle', 'thorax', [0.87, 0.48, 0.08], 3.4, [0, 0, 0], 'ry rz'], ['lhumerus', 'lclavicle', [1, 0, 0], 5.6, [180, -30, -90], 'rx ry rz'],
    ['lradius', 'lhumerus', [1, 0, 0], 3.6, [180, -30, -90], 'rx'], ['lwrist', 'lradius', [1, 0, 0], 1.8, [0, 90, 90], 'ry'],
    ['lhand', 'lwrist', [1, 0, 0], 0.6, [0, 90, 90], 'rx rz'],
    ['rclavicle', 'thorax', [-0.89, 0.44, 0.1], 3.5, [0, 0, 0], 'ry rz'], ['rhumerus', 'rclavicle', [-1, 0, 0], 5.8, [180, 30, 90], 'rx ry rz'],
    ['rradius', 'rhumerus', [-1, 0, 0], 3.7, [180, 30, 90], 'rx'], ['rwrist', 'rradius', [-1, 0, 0], 1.8, [0, -90, -90], 'ry'],
    ['rhand', 'rwrist', [-1, 0, 0], 0.6, [0, -90, -90], 'rx rz'],
  ];
  const data = B.map(([n, , d, l, a, dof]) => `  begin\n     name ${n}\n     direction ${d.join(' ')}\n     length ${l}\n     axis ${a.join(' ')} XYZ\n${dof ? `    dof ${dof}\n` : ''}  end`).join('\n');
  const kids: Record<string, string[]> = {};
  for (const [n, p] of B) (kids[p] ??= []).push(n);
  const hier = Object.entries(kids).map(([p, c]) => `    ${p} ${c.join(' ')}`).join('\n');
  return `:version 1.10\n:units\n  length 0.45\n  angle deg\n:root\n   order TX TY TZ RX RY RZ\n   axis XYZ\n:bonedata\n${data}\n:hierarchy\n  begin\n${hier}\n  end\n`;
}
/** A skater rolling toward its left (+x), rocking its knees: 120 frames at 120 fps. */
function rolling(n = 120): AmcFrame[] {
  return Array.from({ length: n }, (_, i) => {
    const w = Math.sin((2 * Math.PI * i) / n) * 10;
    return { root: [i * 0.1, 15, 0, 0, 0, 0], lfemur: [-20 - w, 0, 0], ltibia: [40 + 2 * w], rfemur: [-20 - w, 0, 0], rtibia: [40 + 2 * w], lhumerus: [0, 0, 0] } as AmcFrame;
  });
}

describe('a CMU clip on our riders (clip slice Task 8)', () => {
  const asf = parseAsf(cmuLikeAsf()), rest = referenceSkeleton(1.7);
  it('maps every one of our bones but the root to a CMU bone', () => {
    for (const b of BONES) if (b !== 'root') expect(asf.bones[CMU_BONE[b as Exclude<BoneName, 'root'>]] ?? (CMU_BONE.pelvis === 'root'), b).toBeTruthy();
  });
  it('aims our rest bones along CMU’s first (their T-pose onto our A-pose): at a zero frame each of our bones points CMU’s way', () => {
    const c = cmuClip(asf, [{ root: [0, 15, 0, 0, 0, 0] }, { root: [1, 15, 0, 0, 0, 0] }], rest, { fps: 120, outFps: 30, loop: false, noseSide: 'left' });
    const A = restAlign(asf, rest);
    for (const [b, child] of [['thigh_l', 'shin_l'], ['upperarm_r', 'forearm_r'], ['spine_02', 'spine_03'], ['foot_l', 'toe_l']] as [BoneName, BoneName][]) {
      const ours = rest.joint[child].clone().sub(rest.joint[b]).normalize();
      const q = new Quaternion(...(c.rot[b].slice(0, 4) as [number, number, number, number]));
      expect(ours.applyQuaternion(q).distanceTo(asf.bones[CMU_BONE[b as Exclude<BoneName, 'root'>]].direction), b).toBeLessThan(1e-4);
      expect(q.angleTo(A[b])).toBeLessThan(1e-4);
    }
  });
  it('resamples 120 fps to 30, puts the pelvis over the ankles at our leg length, and is a well-formed clip', () => {
    const c = cmuClip(asf, rolling(), rest, { fps: 120, outFps: 30, loop: true, noseSide: 'auto' });
    expect(c.frames).toBe(30);
    expect(riderClipsProblems({ rider: 't', fps: 30, clips: { trim: c } })).toEqual([]);
    const p = new Vector3(c.pelvis[0], c.pelvis[1], c.pelvis[2]);
    expect(p.y).toBeGreaterThan(0.6 * 0.49 * 1.7); // above the ankles by most of a bent leg
    expect(p.y).toBeLessThan(0.49 * 1.7 + 0.1);
  });
  it('works out which foot leads from the way the skater travels: toward its left is regular (nose left)', () => {
    expect(cmuClip(asf, rolling(), rest, { fps: 120, outFps: 30, loop: true, noseSide: 'auto' }).noseSide).toBe('left');
    const back = rolling().map((f) => ({ ...f, root: [-f.root[0], ...f.root.slice(1)] }));
    expect(cmuClip(asf, back, rest, { fps: 120, outFps: 30, loop: true, noseSide: 'auto' }).noseSide).toBe('right');
  });
  it('loops without a jump (< 2°) once the seam is blended', () => {
    const c = cmuClip(asf, rolling(97), rest, { fps: 120, outFps: 30, loop: true, noseSide: 'left' });
    const a = sampleClip(c, 30, c.frames / 30 - 1e-6), b = sampleClip(c, 30, 0);
    for (const k of Object.keys(c.rot)) expect((a.rot[k]!.angleTo(b.rot[k]!) * 180) / Math.PI, k).toBeLessThan(2);
  });
  const real = '../liquid-dreaming/anim-source/cmu-134/134.asf';
  it.skipIf(!existsSync(real))('reads the real CMU skater and every trial makes a well-formed clip', () => {
    const a = parseAsf(readFileSync(real, 'utf8'));
    for (const t of ['02', '03', '05', '15']) {
      const c = cmuClip(a, parseAmc(readFileSync(`../liquid-dreaming/anim-source/cmu-134/134_${t}.amc`, 'utf8')), rest, { fps: 120, outFps: 30, loop: true, noseSide: 'auto' });
      expect(riderClipsProblems({ rider: 't', fps: 30, clips: { x: c } }), t).toEqual([]);
    }
  });
});
