// Ride pose blend, smoothness (Andrew 2026-10-15: the blend snapped, worst crouch ↔ stand; the bar is smooth and real).
// The ride's dials jump as fast as the physics lets them (a stall in 0.2 s, the legs at COM_RATE, a stall kind swapped);
// what the body shows follows them at a real body's pace (poseFollow). Measured on the joints, board held still, at 60 fps.
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { layoutFor } from '../board/boardSpec';
import { COM_RATE, compressionOf, newRiderState, riderDrive, type RiderDrive } from '../ride/riderBody';
import { blendOnBoard, blendWeights, loopCloses, smoothLoop } from './poseBlend';
import { FOLLOW, fadeSolved, newFollow, sampleFromSolved, smoothAt, stepFollow, stepSmooth } from './poseFollow';
import { contactFor, type PoseLib } from './poseLib';
import { PRESETS, type Stance, boardFor } from './presets';
import { BONES, type BoneName, referenceSkeleton } from './rig';
import { type BoardFrame, solvePose } from './solvePose';
import { poseTargets } from './poses';

const lib = JSON.parse(readFileSync('public/surfer/poses/poses.json', 'utf8')) as PoseLib;
const FLAT: BoardFrame = { position: new Vector3(), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };
const DT = 1 / 60;

/**
 * A real body's limits, relative to the board (the bars the blend is held to):
 * - the hips: a fast bodyweight squat or a countermovement's dip peaks near 1 m/s vertically (1.3 allows a lunge);
 *   across, a quick rail-to-rail weight shift (a skier's or a surfer's) moves them faster, ~1.5–2 m/s: 1.8;
 * - any joint: a quick reach or arm swing for balance, ~2–3 m/s at the wrist;
 * - no joint's speed changing faster than a body accelerates it: a quick reach peaks ~20–40 m/s² at the wrist; the hips
 *   reversing at a pump's bottom with a rail change on top, up to ~1.5 g (a snap, one frame's jump, reads as hundreds
 *   to thousands of m/s²).
 * Set for Shazza's 1.65 m; a taller body making the same move in the same time moves its joints further, so the bars
 * scale with height (T-Bone's 1.78 m: ×1.08).
 */
const PELVIS_MAX_MS = 1.3, PELVIS_ACROSS_MAX_MS = 1.8, JOINT_MAX_MS = 3.0, PELVIS_MAX_MS2 = 15, JOINT_MAX_MS2 = 30;

type Drive = RiderDrive & { pumpIdleT: number };
const base: Drive = { ...riderDrive({ ...newRiderState(1.65, 55), carve: 0 }), pumpIdleT: 9, pumpOnT: 0 };
const NONE = { tall: 0, hand: 0, lowBarrel: 0, standBarrel: 0 };

/** The physics at its quickest, as a script: each dial jumped (not ramped), the legs pumping at COM_RATE. */
function scriptAt(t: number): { d: Drive; comH: number } {
  const seg = Math.floor(t / 1.2), u = t - seg * 1.2;
  // The pump: comH a triangle between 0.35 and 0.85 at the legs' full rate, the phase as riderBody sets it; the rail
  // flipping rail to rail every 0.6 s, a surfer's quickest real pumping turns, landing mid-compression (the hitch).
  const half = 0.5 / COM_RATE, k = (u % (2 * half)) / half, down = k < 1;
  const comPump = down ? 0.85 - 0.5 * k : 0.35 + 0.5 * (k - 1);
  const pumpPhase = down ? 0.5 * ((0.85 - comPump) / 0.5) : 0.5 + 0.5 * ((comPump - 0.35) / 0.5);
  switch (seg % 8) {
    case 0: return { d: base, comH: 0.6 };
    case 1: return { d: { ...base, tuck: 1 }, comH: 0.05 };
    case 2: return { d: { ...base, stall: 1, stallW: { ...NONE, hand: 1 } }, comH: 0.3 };
    case 3: return { d: { ...base, stall: 1, stallW: { ...NONE, standBarrel: 1 } }, comH: 0.75 };
    case 4: return { d: { ...base, stall: 1, stallW: { ...NONE, tall: 1 } }, comH: 0.95 };
    case 5: return { d: { ...base, pumpIdleT: 0, pumpOnT: u, pumpPhase, carve: u % 1.2 < 0.6 ? 0.6 : -0.6 }, comH: comPump };
    case 6: return { d: { ...base, driveOut: 1 }, comH: 0.5 };
    default: return { d: { ...base, stall: 1, stallW: { ...NONE, lowBarrel: 1 } }, comH: 0.2 };
  }
}

function ctxFor(name: 'female' | 'male', stance: Stance) {
  const preset = PRESETS[name], rest = referenceSkeleton(preset.heightM), spec = boardFor(preset, 'thruster');
  return { rest, ctx: { spec, layout: layoutFor(spec, rest.heightM), stance, balance: null } };
}

interface Worst { speed: number; across: number; acc: number; where: string }
/** The worst joint speed and change of speed over a run of joint frames (60 fps). */
function measure(frames: Record<BoneName, Vector3>[]): { pelvis: Worst; joint: Worst } {
  const pelvis: Worst = { speed: 0, across: 0, acc: 0, where: '' }, joint: Worst = { speed: 0, across: 0, acc: 0, where: '' };
  for (let i = 2; i < frames.length; i++) {
    for (const b of BONES) {
      if (b === 'root') continue;
      const v1 = frames[i][b].clone().sub(frames[i - 1][b]).divideScalar(DT), v0 = frames[i - 1][b].clone().sub(frames[i - 2][b]).divideScalar(DT);
      const w = b === 'pelvis' ? pelvis : joint, a = v1.clone().sub(v0).length() / DT;
      // The hips: up and down against PELVIS_MAX_MS, across against PELVIS_ACROSS_MAX_MS; every other joint, its speed.
      const s = b === 'pelvis' ? Math.abs(v1.y) : v1.length();
      w.speed = Math.max(w.speed, s);
      w.across = Math.max(w.across, Math.hypot(v1.x, v1.z));
      if (a > w.acc) { w.acc = a; w.where = `${b} frame ${i}`; }
    }
  }
  return { pelvis, joint };
}

/** The script through the blend, raw (`follow` false: today's) or followed at a body's pace. */
function run(name: 'female' | 'male', stance: Stance, follow: boolean, seconds = 9.6) {
  const { rest, ctx } = ctxFor(name, stance), f = newFollow();
  const frames: Record<BoneName, Vector3>[] = [];
  for (let i = 0; i * DT < seconds; i++) {
    const t = i * DT, { d, comH } = scriptAt(t);
    const dials = { compression: compressionOf(comH) + 0.4 * Math.abs(d.carve), lean: 0.8 * d.carve, twist: 0.5 * d.carve, reach: 0 };
    const out = follow ? stepFollow(f, d, dials, stance, DT) : null;
    frames.push(blendOnBoard(lib, rest, { ...ctx, dials: out ? out.dials : dials }, d, t, FLAT, null, out ?? undefined).joint);
  }
  return measure(frames);
}

describe('poseFollow: a body\'s pace', () => {
  it('a move from rest starts still (no jump in speed or acceleration), never overshoots and settles within its time', () => {
    const sm = smoothAt(0);
    let x = 0, peak = 0, at95 = -1;
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) {
      x = stepSmooth(sm, 1, 0.5, DT);
      xs.push(x);
      peak = Math.max(peak, x);
      if (at95 < 0 && x >= 0.95) at95 = (i + 1) * DT;
    }
    expect(xs[0]).toBeLessThan(0.002); // no jump on the first frame…
    expect(xs[1] - 2 * xs[0]).toBeLessThan(0.005); // …nor in its speed on the second
    expect(peak).toBeLessThanOrEqual(1 + 1e-9);
    expect(at95).toBeGreaterThan(0.4);
    expect(at95).toBeLessThan(0.6);
  });
  it('crouching in is quicker than standing back up (the legs rise against the load)', () => {
    expect(FOLLOW.tuck.in).toBeLessThan(FOLLOW.tuck.out);
    expect(FOLLOW.compression.in).toBeLessThan(FOLLOW.compression.out);
  });
  it('the followed weights still sum within 1 over the base', () => {
    const f = newFollow();
    for (let i = 0; i < 90; i++) {
      const d = i < 45 ? { ...base, tuck: 1 } : { ...base, stall: 1, stallW: { ...NONE, hand: 1 }, driveOut: 1 };
      const w = stepFollow(f, d, { compression: 0, lean: 0, twist: 0, reach: 0 }, 'regular', DT).w;
      expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('the pump as played: no corners at its keys, every key where it was, slowing into the bottom and the top', () => {
    // The approved clip runs straight between keys every 10 frames: a jolt at each, a piston's turn at the bottom.
    const raw = lib.clips.pumpCycle, c = smoothLoop(raw), n = c.frames, P = (i: number) => new Vector3().fromArray(c.pelvis, 3 * (((i % n) + n) % n));
    const acc = (c2: typeof c, i: number) => {
      const Q = (j: number) => new Vector3().fromArray(c2.pelvis, 3 * (((j % n) + n) % n));
      return Q(i + 1).add(Q(i - 1)).sub(Q(i).multiplyScalar(2)).multiplyScalar(lib.fps * lib.fps);
    };
    let jump = 0, rawJump = 0, fastest = 0;
    for (let i = 0; i < n; i++) {
      jump = Math.max(jump, acc(c, i + 1).distanceTo(acc(c, i)));
      rawJump = Math.max(rawJump, acc(raw, i + 1).distanceTo(acc(raw, i)));
      fastest = Math.max(fastest, Math.abs(P(i + 1).y - P(i - 1).y));
    }
    // No jump in acceleration from frame to frame (the raw clip's jumps ~22 m/s² at its keys).
    expect(rawJump).toBeGreaterThan(15);
    expect(jump).toBeLessThan(1.5);
    for (const k of [0, 10, 20, 30, 40, 50, 60, 70]) expect(P(k).distanceTo(new Vector3().fromArray(raw.pelvis, 3 * k)), `key ${k}`).toBeLessThan(1e-6);
    // Through each bottom key the hips are near still (the raw clip keeps its full speed into the turn); the heel half's
    // keys sit unevenly about its bottom, so its lowest point falls just off the key.
    for (const k of [30, 70]) expect(Math.abs(P(k + 1).y - P(k - 1).y) / fastest, `bottom ${k}`).toBeLessThan(0.3);
  });
  it('reaches what the dials ask for once they hold still', () => {
    const f = newFollow(), d = { ...base, tuck: 1 };
    let w = blendWeights(base);
    for (let i = 0; i < 120; i++) w = stepFollow(f, d, { compression: 0, lean: 0, twist: 0, reach: 0 }, 'regular', DT).w;
    expect(w.tuck).toBeCloseTo(blendWeights(d).tuck, 2);
  });
});

describe('the blend at a real body\'s pace (Andrew: no snap, crouch ↔ stand above all)', () => {
  it('today\'s raw dials break the bars (the snap Andrew saw)', () => {
    const { pelvis, joint } = run('female', 'regular', false);
    expect(Math.max(pelvis.speed / PELVIS_MAX_MS, pelvis.acc / PELVIS_MAX_MS2, joint.speed / JOINT_MAX_MS, joint.acc / JOINT_MAX_MS2)).toBeGreaterThan(1);
  });
  for (const name of ['female', 'male'] as const) for (const stance of ['regular', 'goofy'] as const) {
    it(`${name} ${stance}: every move and every switch within a body's speed and acceleration`, () => {
      const { pelvis, joint } = run(name, stance, true), k = PRESETS[name].heightM / 1.65;
      const msg = `pelvis ${pelvis.speed.toFixed(2)} m/s up/down, ${pelvis.across.toFixed(2)} across, ${pelvis.acc.toFixed(1)} m/s² (${pelvis.where}); joints ${joint.speed.toFixed(2)} m/s ${joint.acc.toFixed(1)} m/s² (${joint.where})`;
      expect(pelvis.speed, msg).toBeLessThanOrEqual(PELVIS_MAX_MS * k);
      expect(pelvis.across, msg).toBeLessThanOrEqual(PELVIS_ACROSS_MAX_MS * k);
      expect(pelvis.acc, msg).toBeLessThanOrEqual(PELVIS_MAX_MS2 * k);
      expect(joint.speed, msg).toBeLessThanOrEqual(JOINT_MAX_MS * k);
      expect(joint.acc, msg).toBeLessThanOrEqual(JOINT_MAX_MS2 * k);
    });
  }
});

describe('switching into the blend (the drop → riding cut, the first ride\'s pop)', () => {
  const { rest, ctx } = ctxFor('female', 'regular');
  const dials = { compression: 0.3, lean: 0, twist: 0, reach: 0 };
  const drop = solvePose(rest, poseTargets('drop', { spec: ctx.spec, layout: ctx.layout, rest, stance: 'regular', dials, phaseT: 0, who: 'female', glasses: false }), FLAT, null);
  const from = sampleFromSolved(drop, FLAT, 'regular');
  const at = (k: number) => blendOnBoard(lib, rest, { ...ctx, dials }, base, 0, FLAT, null, { from: { sample: from, k } }).joint;

  it('the first frame of the fade is the old pose (within 2 cm at every joint)', () => {
    const J = at(1);
    for (const b of BONES) if (b !== 'root') expect(J[b].distanceTo(drop.joint[b]), b).toBeLessThan(0.02);
  });
  it('the feet stay on the deck through the fade', () => {
    const end = at(0);
    for (const k of [1, 0.75, 0.5, 0.25, 0]) {
      const J = at(k);
      for (const s of ['l', 'r'] as const) expect(J[`foot_${s}`].distanceTo(end[`foot_${s}`]), `${s} at ${k}`).toBeLessThan(0.01);
    }
  });
  it('the fade itself moves at a body\'s pace', () => {
    const f = newFollow(), frames: Record<BoneName, Vector3>[] = [];
    f.from = from;
    for (let i = 0; i < 60; i++) {
      const out = stepFollow(f, base, dials, 'regular', DT);
      frames.push(blendOnBoard(lib, rest, { ...ctx, dials: out.dials }, base, i * DT, FLAT, null, out).joint);
    }
    const { pelvis, joint } = measure(frames);
    expect(pelvis.speed).toBeLessThanOrEqual(PELVIS_MAX_MS);
    expect(joint.speed).toBeLessThanOrEqual(JOINT_MAX_MS);
    expect(joint.acc).toBeLessThanOrEqual(JOINT_MAX_MS2);
  });
});

describe('final review of the smoothness pass', () => {
  const none = { compression: 0, lean: 0, twist: 0, reach: 0 };
  it('1: the body never pumps backwards (legs reversing low: the raw phase steps back by under half a cycle)', () => {
    const f = newFollow();
    let last = -Infinity;
    const raw = [...Array.from({ length: 20 }, (_, i) => 0.55 + 0.005 * i), ...Array.from({ length: 40 }, (_, i) => 0.35 + 0.004 * i)];
    for (const p of raw) {
      stepFollow(f, { ...base, pumpIdleT: 0, pumpOnT: 1, pumpPhase: p }, none, 'regular', DT);
      expect(f.phase).toBeGreaterThanOrEqual(last - 1e-9);
      last = f.phase;
    }
  });
  it('3: a follower started mid-move (no pose to fade from) starts where the dials are, not standing', () => {
    const d = { ...base, tuck: 1 }, dials = { compression: 0.8, lean: 0.3, twist: 0.2, reach: 0 };
    const out = stepFollow(newFollow({ d, dials, stance: 'regular' }), d, dials, 'regular', DT);
    expect(out.w.tuck).toBeCloseTo(blendWeights(d).tuck, 3);
    expect(out.dials.compression).toBeCloseTo(0.8, 3);
    expect(out.dials.lean).toBeCloseTo(0.3, 3);
  });
  it('5: held, the hand is in the wall by 0.9 s (within 2 cm of its spot), at a real reach speed', () => {
    const { rest, ctx } = ctxFor('female', 'regular'), f = newFollow(), d = { ...base, stall: 1, stallW: { ...NONE, hand: 1 } };
    let J = blendOnBoard(lib, rest, { ...ctx, dials: none }, d, 0, FLAT, null).joint;
    for (let i = 0; i * DT < 0.9; i++) {
      const out = stepFollow(f, d, none, 'regular', DT);
      J = blendOnBoard(lib, rest, { ...ctx, dials: out.dials }, d, i * DT, FLAT, null, out).joint;
    }
    const c = contactFor(lib, 'stallHand', 'regular')!, w = new Vector3(...c.wrist);
    expect(J[`hand_${c.side}`].distanceTo(J[`foot_${c.side}`])).toBeCloseTo(w.length(), 1.4);
    expect(J[`hand_${c.side}`].y - J[`foot_${c.side}`].y).toBeCloseTo(w.y, 1.4);
  });
  it('6: leaving the blend (a wipeout, the ride\'s end) fades: k 1 is the old pose, 0 the new, between in between', () => {
    const { rest, ctx } = ctxFor('female', 'regular');
    const from = blendOnBoard(lib, rest, { ...ctx, dials: none }, { ...base, tuck: 1 }, 0, FLAT, null);
    const to = solvePose(rest, poseTargets('bail', { spec: ctx.spec, layout: ctx.layout, rest, stance: 'regular', dials: none, phaseT: 0, who: 'female', glasses: false }), FLAT, null);
    const at = (k: number) => fadeSolved(from, to, k);
    for (const b of BONES) {
      expect(at(1).joint[b].distanceTo(from.joint[b]), b).toBeLessThan(1e-6);
      expect(at(0).joint[b].distanceTo(to.joint[b]), b).toBeLessThan(1e-6);
      expect(Math.abs(at(1).local[b].dot(from.local[b])), b).toBeCloseTo(1, 6);
    }
    const mid = at(0.5).pelvisWorld, want = from.pelvisWorld.clone().lerp(to.pelvisWorld, 0.5);
    expect(mid.distanceTo(want)).toBeLessThan(1e-6);
  });
  it('minor: every bone of the pump clip closes its loop on the sphere (none left on the raw, jolting curve)', () => {
    const c = lib.clips.pumpCycle, open = Object.entries(c.rot).filter(([, q]) => !loopCloses(q, c.frames, 10)).map(([b]) => b);
    expect(open).toEqual([]);
    expect(() => smoothLoop({ ...c, frames: 81 })).toThrow();
  });
});
