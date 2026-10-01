import { Vector3 } from 'three/webgpu';
import { type BoardLayout, type BoardSpec, type SpotName, deckYAt, halfWidthAt, uAt } from '../board/boardSpec';
import { type CarryBoard, HAND_REACH, LIMB_RADIUS } from './carry';
import type { PoseName } from './poseNames';
import type { Stance } from './presets';
import { type Limb, type RiderMeasures, type SkeletonRest, measures } from './rig';
import type { BoardFrame } from './solvePose';

/** Offsets around each pose's own values; 0 everywhere shows the pose as designed (spec §3.5). */
export interface PoseDials {
  compression: number;
  lean: number;
  twist: number;
  reach: number;
}
export type Side = 'frontside' | 'backside';
/** The Womb is a left: in the board frame the wave face is on the left rail (-z) as the board runs down the line. */
export const WAVE_SIDE = new Vector3(0, 0, -1);

export interface FootTarget {
  ankle: Vector3;
  /** The ball of the foot. */
  toe: Vector3;
  /** Where the knee points. */
  pole: Vector3;
  /** Where the top of the foot faces (board up when standing). */
  instep: Vector3;
}
export interface HandTarget {
  /** 'board': board-frame metres. 'chest': character-frame metres from spine_03, turned with the chest. */
  frame: 'board' | 'chest';
  pos: Vector3;
  /** Where the elbow points (same frame). */
  pole: Vector3;
}
export interface PoseTargets {
  pelvis: Vector3;
  /** The pelvis's +Y (toward the head) and +Z (the way the hips face), board frame. */
  pelvisUp: Vector3;
  pelvisForward: Vector3;
  /** Radians relative to the pelvis: bend forward, twist toward the character's left, side-bend. */
  chest: { bend: number; twist: number; side: number };
  feet: Record<Limb, FootTarget>;
  hands: Record<Limb, HandTarget>;
  /** Where the eyes go, as a board-frame direction. */
  look: Vector3;
  /** The carry (walking spec §4): the board under the arm, placed from the solved hand. */
  carry?: CarryBoard;
}
export interface PoseContext {
  spec: BoardSpec;
  layout: BoardLayout;
  rest: SkeletonRest;
  stance: Stance;
  dials: PoseDials;
  phaseT: number;
  /** The carry's arm (walking spec §4); the right when unset. */
  carrySide?: Limb;
}

const DEG = Math.PI / 180;
const LEAN_MAX = 35 * DEG;
const TWIST_DIAL = 0.6;
const V = (x = 0, y = 0, z = 0): Vector3 => new Vector3(x, y, z);
const X = (): Vector3 => V(1, 0, 0);
const Y = (): Vector3 => V(0, 1, 0);
const add = (...vs: Vector3[]): Vector3 => vs.reduce((a, b) => a.add(b), V());
const sc = (v: Vector3, k: number): Vector3 => v.clone().multiplyScalar(k);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);

interface Rider {
  m: RiderMeasures;
  /** The way the rider's chest faces when standing (the right rail for regular). */
  f: Vector3;
  w: Vector3;
  side: Side;
  /** The nose-side arm and leg (the left for regular). */
  lead: Limb;
  trail: Limb;
  /** +1 when a twist toward the nose is toward the character's left (regular). */
  twistSign: number;
}

export const sideOf = (stance: Stance): Side => (V(0, 0, stance === 'regular' ? 1 : -1).dot(WAVE_SIDE) > 0 ? 'frontside' : 'backside');

function rider(ctx: PoseContext): Rider {
  const regular = ctx.stance === 'regular';
  return { m: measures(ctx.rest), f: V(0, 0, regular ? 1 : -1), w: WAVE_SIDE.clone(), side: sideOf(ctx.stance), lead: regular ? 'l' : 'r', trail: regular ? 'r' : 'l', twistSign: regular ? 1 : -1 };
}

const spot = (ctx: PoseContext, name: SpotName): Vector3 => V(...ctx.layout.spots[name]);
const deckAt = (ctx: PoseContext, x: number, z = 0): number => deckYAt(ctx.spec, clamp(x, -ctx.spec.lengthM / 2, ctx.spec.lengthM / 2), z);
const halfWidthAtX = (ctx: PoseContext, x: number): number => halfWidthAt(ctx.spec, uAt(ctx.spec, x));

function footOnDeck(r: Rider, at: Vector3, openDeg: number, pole: Vector3): FootTarget {
  const dir = add(sc(r.f, Math.cos(openDeg * DEG)), sc(X(), Math.sin(openDeg * DEG))).normalize();
  return { ankle: add(at, sc(Y(), r.m.ankleH)), toe: add(at, sc(dir, r.m.footLenH), sc(Y(), r.m.toeH)), pole: pole.clone().normalize(), instep: Y() };
}

const chestHand = (arm: Limb, out: number, up: number, fwd: number): HandTarget => {
  const k = arm === 'l' ? 1 : -1;
  return { frame: 'chest', pos: V(k * out, up, fwd), pole: V(k * 0.3, -1, -0.6) };
};
const boardHand = (pos: Vector3, pole: Vector3): HandTarget => ({ frame: 'board', pos, pole });
const byArm = (r: Rider, lead: HandTarget, trail: HandTarget): Record<Limb, HandTarget> => (r.lead === 'l' ? { l: lead, r: trail } : { l: trail, r: lead });
const byLeg = (r: Rider, lead: FootTarget, trail: FootTarget): Record<Limb, FootTarget> => (r.lead === 'l' ? { l: lead, r: trail } : { l: trail, r: lead });

type Body = Omit<PoseTargets, 'hands' | 'look'>;

/** The knee's pole, lifted so the knee comes out level with the hip-ankle midpoint (less `drop`) when the leg leans:
 * the IK bends the knee along the pole's part square to the hip-ankle line, and for a leg leaning over the rail a level
 * pole's square part points down, kneeling the rider on the deck (gate 2). */
function levelPole(p: Vector3, hip: Vector3, ankle: Vector3, drop = 0, fallback?: Vector3): Vector3 {
  const a = hip.clone().sub(ankle).normalize();
  const level = (d: Vector3): Vector3 => {
    const n = d.clone().normalize(), lift = (a.y * n.dot(a) - n.y) / Math.max(0.2, 1 - a.y * a.y);
    return add(n, sc(Y(), lift - drop)).normalize();
  };
  const want = level(p);
  if (!fallback) return want;
  // When the wanted direction runs along the leg (a crouched back leg whose hip is well ahead of its ankle), it no
  // longer says which way the knee goes: blend to the fallback (the toes).
  const square = want.clone().sub(sc(a, want.dot(a))).length(), w = clamp01((square - 0.25) / 0.35);
  return add(sc(level(fallback), 1 - w), sc(want, w)).normalize();
}

interface StandOpts {
  compression: number;
  /** -1 … 1: toward the heels … toward the toes. */
  lean: number;
  bend: number;
  twistToNose: number;
  /** How far below level the back knee drops (the pig-dog's, toward the deck). */
  backDrop?: number;
  /** Lower than full compression (the pig-dog's bum nearly on the back heel), as a fraction of the leg's height. */
  depth?: number;
  pelvisShift?: number;
  backSpot?: Vector3;
  backPole?: Vector3;
}

/** Both feet on their spots, the front knee toward the toes and the nose, the back knee turned in toward the front foot
 * (pointed at the toes, a crouch pushed it out over the rail and down to the deck), hips opened 20° toward the nose. The lean tilts the
 * hips and chest fully but carries the pelvis only 45% of the way over the rail: flat-footed on a flat board the hips
 * can't hang out over the water (gate 2: that knelt the back knee on the deck); the rest of a turn's lean is the board
 * on its rail. */
function standing(ctx: PoseContext, r: Rider, o: StandOpts): Body {
  const d = ctx.dials;
  const compression = clamp01(o.compression + d.compression);
  const lean = clamp(o.lean + d.lean, -1, 1) * LEAN_MAX;
  const front = spot(ctx, 'front'), back = o.backSpot ?? spot(ctx, 'back');
  const up = add(sc(Y(), Math.cos(lean)), sc(r.f, Math.sin(lean))).normalize();
  const spread = Math.max(0, front.distanceTo(back) / 2 - r.m.hipHalf);
  const vert = Math.sqrt(Math.max(r.m.legLen ** 2 - spread ** 2, (0.5 * r.m.legLen) ** 2));
  const h = r.m.ankleH + vert * (0.97 - 0.42 * compression - (o.depth ?? 0)) + r.m.hipDrop;
  const pelvis = add(sc(front, 0.5), sc(back, 0.5), sc(X(), o.pelvisShift ?? 0), sc(Y(), h * Math.cos(lean)), sc(r.f, 0.45 * h * Math.sin(lean)));
  const forward = add(sc(r.f, Math.cos(0.35)), sc(X(), Math.sin(0.35))).normalize();
  const knee = add(r.f, sc(X(), 0.35)), backKnee = add(sc(r.f, 0.6), sc(X(), 0.8));
  return {
    pelvis, pelvisUp: up, pelvisForward: forward,
    chest: { bend: o.bend, twist: r.twistSign * (o.twistToNose + d.twist * TWIST_DIAL), side: 0 },
    feet: byLeg(r, footOnDeck(r, front, 30, knee), footOnDeck(r, back, 8, levelPole(o.backPole ?? backKnee, pelvis, add(back, sc(Y(), r.m.ankleH)), o.backDrop, o.backPole ? undefined : r.f))),
  };
}

const reachK = (ctx: PoseContext): number => 1 + 0.35 * clamp(ctx.dials.reach, -1, 1);

function drop(ctx: PoseContext, r: Rider): PoseTargets {
  const k = reachK(ctx);
  return {
    ...standing(ctx, r, { compression: 0.55, lean: 0, bend: 0.45, twistToNose: 0.35, pelvisShift: 0.05 }),
    hands: byArm(r, chestHand(r.lead, 0.42 * k, -0.05, 0.3), chestHand(r.trail, 0.38 * k, -0.2, -0.05)),
    look: add(X(), sc(Y(), -0.4), sc(r.w, 0.3)),
  };
}

function bottomTurn(ctx: PoseContext, r: Rider): PoseTargets {
  const k = reachK(ctx), toWave = r.side === 'frontside' ? 1 : -1;
  return {
    ...standing(ctx, r, { compression: 0.75, lean: 0.7 * toWave, bend: 0.5, twistToNose: 0.5, pelvisShift: -0.03 }),
    hands: byArm(r, chestHand(r.lead, 0.55 * k, 0.05, 0.3), chestHand(r.trail, 0.5 * k, -0.3, -0.1)),
    look: add(X(), sc(r.w, 0.6), sc(Y(), 0.2)),
  };
}

function trim(ctx: PoseContext, r: Rider): PoseTargets {
  const k = reachK(ctx);
  return {
    ...standing(ctx, r, { compression: 0.55, lean: 0, bend: 0.3, twistToNose: 0.25 }),
    hands: byArm(r, chestHand(r.lead, 0.4 * k, 0, 0.4), chestHand(r.trail, 0.38 * k, -0.3, -0.15)),
    look: add(X(), sc(r.w, 0.15)),
  };
}

function barrel(ctx: PoseContext, r: Rider): PoseTargets {
  const k = reachK(ctx), back = spot(ctx, 'back');
  const trailInFace = (up: number): HandTarget => boardHand(add(back, sc(r.w, 0.45), sc(Y(), up), sc(X(), -0.1)), add(sc(Y(), 0.4), sc(X(), -1)));
  if (r.side === 'frontside') {
    return {
      ...standing(ctx, r, { compression: 0.95, lean: 0.25, bend: 0.6, twistToNose: 0.3 }),
      hands: byArm(r, chestHand(r.lead, 0.42 * k, -0.05, 0.4), trailInFace(0.35)),
      look: add(X(), sc(Y(), 0.05)),
    };
  }
  // The pig-dog: the back knee dropped toward the nose, the leading hand on the outside rail.
  const front = spot(ctx, 'front'), gx = front.x + 0.28, outside = r.f.z * (halfWidthAtX(ctx, gx) - 0.02);
  return {
    ...standing(ctx, r, { compression: 1, depth: 0.1, lean: 0, bend: 0.85, twistToNose: -0.1, backPole: add(X(), sc(r.f, 0.25)), backDrop: 0.5 }),
    hands: byArm(r, boardHand(V(gx, deckAt(ctx, gx, outside) + 0.01, outside), add(Y(), sc(r.f, 0.5))), trailInFace(0.75)),
    look: add(X(), sc(Y(), 0.3), sc(r.w, 0.1)),
  };
}

function kickout(ctx: PoseContext, r: Rider): PoseTargets {
  const tx = -ctx.spec.lengthM / 2 + 0.12;
  return {
    ...standing(ctx, r, { compression: 0.35, lean: 0, bend: -0.15, twistToNose: 0.2, pelvisShift: -0.12, backSpot: V(tx, deckAt(ctx, tx), 0) }),
    hands: byArm(r, chestHand(r.lead, 0.3, 0.45, 0.35), chestHand(r.trail, 0.35, -0.1, -0.2)),
    look: add(sc(X(), 0.5), r.w, sc(Y(), 0.3)),
  };
}

function standBail(ctx: PoseContext, r: Rider): PoseTargets {
  const b = standing(ctx, r, { compression: 0.5, lean: 0, bend: 0.9, twistToNose: 0 });
  const back = spot(ctx, 'back');
  const lifted = add(back, sc(Y(), 0.35), sc(r.w, -0.2));
  const trailFoot: FootTarget = { ankle: add(lifted, sc(Y(), r.m.ankleH)), toe: add(lifted, sc(r.f, r.m.footLenH), sc(Y(), r.m.toeH)), pole: add(r.f, sc(X(), 0.35)).normalize(), instep: Y() };
  return {
    ...b,
    pelvis: add(b.pelvis, sc(r.w, 0.35), sc(Y(), 0.15)),
    pelvisUp: add(Y(), sc(r.w, 0.85)).normalize(),
    pelvisForward: r.w.clone(),
    feet: byLeg(r, b.feet[r.lead], trailFoot),
    hands: { l: chestHand('l', 0.15, 0.45, 0.45), r: chestHand('r', 0.15, 0.45, 0.45) },
    look: add(r.w, sc(Y(), -0.3)),
  };
}

/** Straddling the board, facing the nose, feet in the water either side. */
function sit(ctx: PoseContext): PoseTargets {
  const L = ctx.spec.lengthM, px = -L / 2 + 0.38 * L, deck = deckAt(ctx, px), W = halfWidthAtX(ctx, px);
  const m = measures(ctx.rest);
  // Facing the nose (+x) with +Y up puts the character's left on the left rail (-z).
  const foot = (k: number): FootTarget => {
    const ankle = V(px + 0.12, deck - 0.38, k * (W + 0.14));
    return { ankle, toe: add(ankle, V(0.9 * m.footLenH, -0.05, 0)), pole: V(1, 0, 0.5 * k).normalize(), instep: V(0.3, 1, 0).normalize() };
  };
  return {
    pelvis: V(px, deck + 0.09 + m.hipDrop, 0), pelvisUp: Y(), pelvisForward: X(),
    chest: { bend: 0.12 + 0.2 * ctx.dials.compression, twist: ctx.dials.twist * TWIST_DIAL, side: 0 },
    feet: { l: foot(-1), r: foot(1) },
    hands: { l: boardHand(V(px + 0.25, deck + 0.02, -0.14), V(-0.5, 0, -1)), r: boardHand(V(px + 0.25, deck + 0.02, 0.14), V(-0.5, 0, 1)) },
    look: add(X(), sc(Y(), 0.05)),
  };
}

/** Lying along the board, head to the nose: the character's +Y is +x, its front faces down, its left is the left rail.
 * `finsUp` (0…1, per leg) bends the knee and lifts the shin behind, up to 80° (a bodyboarder riding: fins in the air). */
function proneBody(ctx: PoseContext, r: Rider, chestX: number, bend: number, legsDown: number, finsUp: Record<Limb, number> = { l: 0, r: 0 }): Body {
  const pelvisX = chestX - r.m.torso;
  const pelvis = V(pelvisX, deckAt(ctx, pelvisX) + 0.1, 0);
  const legDir = V(-1, -legsDown, 0).normalize();
  // In the water (a bodyboarder's legs) the knees can bend; lying along a surfboard they stay near straight, or they
  // would sag through the deck.
  const reach = legsDown > 0.2 ? 0.96 : 0.995;
  const foot = (k: number, up: number): FootTarget => {
    const hip = add(pelvis, sc(X(), -r.m.hipDrop), V(0, 0, k * r.m.hipHalf));
    if (up <= 0) {
      const ankle = add(hip, sc(legDir, reach * r.m.legLen));
      return { ankle, toe: add(ankle, V(-r.m.footLenH, -0.03, 0)), pole: V(0, -1, 0), instep: V(0, -1, 0) };
    }
    // The thigh trails level off the hips; the shin lifts behind it, the foot pointed on along the shin.
    const a = up * 80 * DEG, shin = V(-Math.cos(a), Math.sin(a), 0), knee = add(hip, sc(X(), -r.m.thighLen * 0.995));
    const ankle = add(knee, sc(shin, r.m.shinLen * 0.995));
    return { ankle, toe: add(ankle, sc(shin, r.m.footLenH)), pole: V(0, -1, 0), instep: V(-Math.sin(a), -Math.cos(a), 0) };
  };
  return { pelvis, pelvisUp: X(), pelvisForward: V(0, -1, 0), chest: { bend, twist: 0, side: 0 }, feet: { l: foot(-1, finsUp.l), r: foot(1, finsUp.r) } };
}

/** One leg's flutter kick at phase `phi` (radians): k = -1 the left leg, +1 the right. */
function kickFoot(r: Rider, pelvis: Vector3, k: number, phi: number): FootTarget {
  const hip = add(pelvis, sc(X(), -r.m.hipDrop), V(0, 0, k * r.m.hipHalf));
  const thigh = 0.3 + 0.18 * Math.sin(phi), bend = 0.2 + 0.25 * (0.5 + 0.5 * Math.cos(phi)), shin = thigh - bend;
  const knee = add(hip, sc(V(-Math.cos(thigh), -Math.sin(thigh), 0), r.m.thighLen * 0.995));
  const along = V(-Math.cos(shin), -Math.sin(shin), 0), ankle = add(knee, sc(along, r.m.shinLen * 0.995));
  return { ankle, toe: add(ankle, sc(along, r.m.footLenH)), pole: V(0, -1, 0), instep: V(Math.sin(shin), -Math.cos(shin), 0) };
}

function paddle(ctx: PoseContext, r: Rider): PoseTargets {
  const L = ctx.spec.lengthM, bb = ctx.spec.kind === 'bodyboard';
  const chestX = bb ? ctx.layout.spots.chest[0] : L / 2 - 0.3 * L;
  const b = proneBody(ctx, r, chestX, -0.45, bb ? 0.35 : -0.03);
  const arm = (a: Limb): HandTarget => {
    const k = a === 'l' ? -1 : 1, phi = 2 * Math.PI * (ctx.phaseT + (a === 'r' ? 0.5 : 0));
    const x = chestX + 0.15 + 0.38 * Math.cos(phi);
    return boardHand(V(x, deckAt(ctx, x) + 0.06 - 0.3 * Math.sin(phi), k * (halfWidthAtX(ctx, x) + 0.08)), V(0, 1, 0.8 * k));
  };
  // The bodyboarder's flutter kick (gate 2, Andrew: "needs to kick his fins to move"), two a stroke, legs alternating:
  // each thigh swings from the hip, the knee bends on the way up and straightens through the down-kick, the foot pointed
  // so the fin carries on from the shin.
  if (bb) for (const [a, k, ph] of [['l', -1, 0], ['r', 1, Math.PI]] as const) b.feet[a] = kickFoot(r, b.pelvis, k, 4 * Math.PI * ctx.phaseT + ph);
  return { ...b, hands: { l: arm('l'), r: arm('r') }, look: add(X(), sc(Y(), 0.15)) };
}

/** A chest-frame hand estimated in the board frame from the pelvis (ignoring the chest's bend), for blending. */
function chestToBoard(b: Body, r: Rider, h: HandTarget): HandTarget {
  if (h.frame === 'board') return h;
  const up = b.pelvisUp.clone().normalize();
  const fwd = b.pelvisForward.clone().sub(sc(up, b.pelvisForward.dot(up))).normalize();
  const left = up.clone().cross(fwd);
  const map = (v: Vector3): Vector3 => add(sc(left, v.x), sc(up, v.y), sc(fwd, v.z));
  return boardHand(add(b.pelvis, sc(up, r.m.torso), map(h.pos)), map(h.pole));
}

const lerpV = (a: Vector3, b: Vector3, t: number): Vector3 => a.clone().lerp(b, t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function blendTargets(a: PoseTargets, b: PoseTargets, t: number): PoseTargets {
  const hand = (x: HandTarget, y: HandTarget): HandTarget => (x.frame === y.frame ? { frame: x.frame, pos: lerpV(x.pos, y.pos, t), pole: lerpV(x.pole, y.pole, t) } : t < 0.5 ? x : y);
  const foot = (x: FootTarget, y: FootTarget): FootTarget => ({ ankle: lerpV(x.ankle, y.ankle, t), toe: lerpV(x.toe, y.toe, t), pole: lerpV(x.pole, y.pole, t), instep: lerpV(x.instep, y.instep, t).normalize() });
  return {
    pelvis: lerpV(a.pelvis, b.pelvis, t), pelvisUp: lerpV(a.pelvisUp, b.pelvisUp, t).normalize(), pelvisForward: lerpV(a.pelvisForward, b.pelvisForward, t).normalize(),
    chest: { bend: lerp(a.chest.bend, b.chest.bend, t), twist: lerp(a.chest.twist, b.chest.twist, t), side: lerp(a.chest.side, b.chest.side, t) },
    feet: { l: foot(a.feet.l, b.feet.l), r: foot(a.feet.r, b.feet.r) },
    hands: { l: hand(a.hands.l, b.hands.l), r: hand(a.hands.r, b.hands.r) },
    look: lerpV(a.look, b.look, t),
  };
}

/** Keyframes spread evenly over phaseT 0…1, eased between neighbours. */
function blendKeys(keys: PoseTargets[], phaseT: number): PoseTargets {
  const x = clamp01(phaseT) * (keys.length - 1), i = Math.min(Math.floor(x), keys.length - 2), u = x - i;
  return blendTargets(keys[i], keys[i + 1], u * u * (3 - 2 * u));
}

/** Three beats (spec §3.5): hands under the chest and press → feet swing through → standing low. */
function popup(ctx: PoseContext, r: Rider): PoseTargets {
  const L = ctx.spec.lengthM, chestX = L / 2 - 0.3 * L;
  const handsUnder = (): Record<Limb, HandTarget> => ({
    l: boardHand(V(chestX - 0.02, deckAt(ctx, chestX) + 0.01, -0.16), V(-1, 1, -1)),
    r: boardHand(V(chestX - 0.02, deckAt(ctx, chestX) + 0.01, 0.16), V(-1, 1, 1)),
  });
  const prone = proneBody(ctx, r, chestX, -0.25, -0.03);
  const k0: PoseTargets = { ...prone, hands: handsUnder(), look: add(X(), sc(Y(), 0.15)) };
  // The press-up lifts the hips too, so the knees clear the deck as the feet swing through.
  const k1: PoseTargets = { ...k0, pelvis: add(prone.pelvis, sc(Y(), 0.2)), chest: { bend: -1, twist: 0, side: 0 } };
  const stand = standing(ctx, r, { compression: 0.8, lean: 0, bend: 0.45, twistToNose: 0.35, pelvisShift: 0.05 });
  const k3: PoseTargets = { ...stand, hands: byArm(r, chestToBoard(stand, r, chestHand(r.lead, 0.42, -0.05, 0.3)), chestToBoard(stand, r, chestHand(r.trail, 0.38, -0.2, -0.05))), look: add(X(), sc(Y(), -0.4), sc(r.w, 0.3)) };
  const back = spot(ctx, 'back'), front = spot(ctx, 'front');
  const knee = add(r.f, sc(X(), 0.35));
  const swing = add(sc(back, 0.5), sc(front, 0.5), sc(Y(), 0.25));
  const k2: PoseTargets = {
    pelvis: add(sc(back, 0.5), sc(front, 0.5), sc(Y(), 0.42 + r.m.hipDrop)),
    pelvisUp: add(X(), Y()).normalize(), pelvisForward: add(V(0, -1, 0), r.f).normalize(),
    chest: { bend: 0.9, twist: 0, side: 0 },
    // The swinging leg's knee drives up toward the chest (pole up), not down at the deck.
    feet: byLeg(r, { ankle: add(swing, sc(Y(), r.m.ankleH)), toe: add(swing, sc(r.f, r.m.footLenH), sc(Y(), r.m.toeH)), pole: add(Y(), r.f).normalize(), instep: Y() }, footOnDeck(r, back, 8, knee)),
    hands: handsUnder(),
    look: k3.look.clone(),
  };
  return blendKeys([k0, k1, k2, k3], ctx.phaseT);
}

/** Bodyboard, prone: the inside (wave-side, left) hand on the rail, the other on the nose's corner. */
function prone(ctx: PoseContext, r: Rider, pit: boolean): PoseTargets {
  const L = ctx.spec.lengthM, chestX = ctx.layout.spots.chest[0];
  const b = proneBody(ctx, r, chestX, pit ? -0.4 : -0.45, 0.3, pit ? { l: 0, r: 0.6 } : { l: 0.7, r: 0.8 });
  if (pit) b.pelvisForward = add(V(0, -1, 0), sc(r.w, 0.35)).normalize();
  const rx = chestX + (pit ? 0.1 : 0.2), nx = L / 2 - 0.04;
  return {
    ...b,
    hands: {
      // Elbows out to the side and down toward the rails (gate 2: pointed up, the elbow pinched and the forearm hung).
      l: boardHand(V(rx, deckAt(ctx, rx) + 0.02, -(halfWidthAtX(ctx, rx) - 0.02)), V(-0.4, -0.5, -1)),
      r: boardHand(V(nx, deckAt(ctx, nx) + 0.02, halfWidthAtX(ctx, nx) - 0.06), V(-0.4, -0.5, 1)),
    },
    look: pit ? add(X(), sc(Y(), 0.08)) : add(X(), sc(Y(), 0.1), sc(r.w, 0.2)),
  };
}

function dropKnee(ctx: PoseContext, r: Rider): PoseTargets {
  const d = ctx.dials, L = ctx.spec.lengthM;
  const fs = spot(ctx, 'dkFoot'), ks = spot(ctx, 'dkKnee');
  // Kneeling, leaning toward the toes is the chest bending forward: the hips stay level over the knee.
  const comp = clamp01(0.5 + d.compression), lean = clamp(d.lean, -1, 1) * LEAN_MAX;
  // Built from the knee out (gate 2: the knee went through the board): the kneecap rests on its spot and the back hip
  // sits over the knee, leaning toward the front foot.
  const knee = add(ks, sc(Y(), 0.085));
  // The shin lies level along the deck and off the tail (tilted up, the finned foot floated high behind the board).
  const ankle = add(knee, sc(V(-1, 0, 0), r.m.shinLen));
  const toFront = V(fs.x - ks.x, 0, fs.z - ks.z).normalize();
  // The lean tilts the upper body only; the back hip stays over the knee, or it drags the knee off its spot.
  // Exactly a thigh from the knee (so the IK puts the knee back on its spot); compression leans the hips toward the front foot.
  const backHip = add(knee, sc(add(sc(Y(), 0.85), sc(toFront, 0.3 + 0.35 * comp)).normalize(), r.m.thighLen * 0.998));
  const pelvis = add(backHip, sc(toFront, r.m.hipHalf), sc(Y(), r.m.hipDrop));
  const backLeg: FootTarget = { ankle, toe: add(ankle, V(-r.m.footLenH, -0.02, 0)), pole: knee.clone().sub(add(sc(backHip, 0.5), sc(ankle, 0.5))).normalize(), instep: V(0, -1, 0) };
  const k = reachK(ctx), hx = L / 2 - 0.08, rail = r.f.z * (halfWidthAtX(ctx, hx) - 0.05);
  return {
    pelvis, pelvisUp: Y(), pelvisForward: add(sc(r.f, Math.cos(0.35)), sc(X(), Math.sin(0.35))).normalize(),
    chest: { bend: 0.5 + lean, twist: r.twistSign * (0.3 + d.twist * TWIST_DIAL), side: 0 },
    feet: byLeg(r, footOnDeck(r, fs, 20, add(r.f, sc(X(), 0.5))), backLeg),
    hands: byArm(r, boardHand(V(hx, deckAt(ctx, hx, rail) + 0.02, rail), add(Y(), sc(r.f, 0.5))), chestHand(r.trail, 0.5 * k, 0, -0.15)),
    look: add(X(), sc(r.w, 0.2)),
  };
}

function bodyboardBail(ctx: PoseContext, r: Rider): PoseTargets {
  const L = ctx.spec.lengthM, hx = ctx.layout.spots.hips[0], nx = L / 2 - 0.05;
  // Rolled off beside the board on the wave side, low in the water, pushing it away by the near rail (gate 2: the old
  // bail put the upper body under the board).
  void hx;
  void nx;
  const side = r.w.z; // -1: the left rail
  const railZ = side * halfWidthAtX(ctx, 0);
  const pelvis = V(-0.2, deckAt(ctx, 0) - 0.18, railZ + side * 0.38);
  const legDir = V(-0.5, -0.85, side * 0.15).normalize();
  const foot = (k: number): FootTarget => {
    const a = add(pelvis, sc(legDir, 0.9 * r.m.legLen), V(0.12 * k, 0, 0));
    return { ankle: a, toe: add(a, sc(legDir, r.m.footLenH)), pole: V(0, -1, 0), instep: V(0, -1, 0) };
  };
  const onRail = (x: number): HandTarget => boardHand(V(x, deckAt(ctx, x, railZ - side * 0.03) + 0.025, railZ - side * 0.03), V(0, -1, side));
  return {
    pelvis, pelvisUp: add(X(), sc(Y(), 0.6), sc(r.w, -0.3)).normalize(), pelvisForward: V(0, 0, -side),
    chest: { bend: 0.3, twist: 0, side: 0 },
    feet: { l: foot(1), r: foot(-1) },
    hands: { l: onRail(0.12), r: onRail(-0.12) },
    look: add(sc(r.w, -1), sc(Y(), -0.2)),
  };
}

/** The carried board's nose, below level (Andrew's reference photo, 2026-10-01: level to a touch up; tuned at the gate). */
const CARRY_NOSE_DOWN = 0;
/** How far below the shoulder joint the top rail sits, in the armpit (a fraction of height). */
const CARRY_ARMPIT = 0.065;
/** The deck's clearance from the thigh at the lower rail, and how far inside the shoulder joint the top rail tucks (m). */
const CARRY_HIP_CLEAR = 0.025, CARRY_TUCK = 0.055;

/**
 * On land (walking spec §4), in the ground frame (+x the heading): standing relaxed, weight on the leg away from the
 * board, the board on its rail under the carrying arm with the deck to the hip, the upper arm out over the top rail (it
 * tucks under the armpit), the forearm down the board's bottom face and the fingers round the lower rail (Andrew: the
 * forearm on the outside); the free arm hangs. The stand anchors the board to the solved hand.
 */
function carry(ctx: PoseContext, r: Rider): PoseTargets {
  const side: Limb = ctx.carrySide ?? 'r', free: Limb = side === 'l' ? 'r' : 'l', k = side === 'l' ? -1 : 1;
  const rest = ctx.rest, H = rest.heightM, m = r.m, spec = ctx.spec;
  const foot = (s: Limb, fwd: number, out: number): FootTarget => {
    const sz = s === 'l' ? -1 : 1, at = V(fwd, 0, sz * (m.hipHalf + out));
    const dir = V(Math.cos(0.15), 0, sz * Math.sin(0.15));
    return { ankle: add(at, sc(Y(), m.ankleH)), toe: add(at, sc(dir, m.footLenH), sc(Y(), m.toeH)), pole: V(1, 0, sz * 0.15).normalize(), instep: Y() };
  };
  const feet = { [side]: foot(side, 0.06, 0.03), [free]: foot(free, 0, 0) } as Record<Limb, FootTarget>;
  const pelvis = V(0.01, m.ankleH + 0.992 * m.legLen + m.hipDrop, -k * 0.025);

  // The board on its rail (Andrew's reference photo): the top rail tucked into the armpit under the upper arm, the deck
  // leaning in at the top and clear of the hip at the bottom; the wrist on the bottom face a hand's reach above the lower
  // rail (the fingers round it), or as low up the face as the arm reaches (the bodyboard: wider than his reach).
  const t = spec.thicknessM, halfW = spec.maxWidthM / 2;
  const sh = rest.joint[`upperarm_${side}`], latS = Math.abs(sh.x), yS = sh.y;
  const topY = yS - CARRY_ARMPIT * H, topLat = latS - CARRY_TUCK;
  const botLat = m.hipHalf + LIMB_RADIUS.thigh * H + CARRY_HIP_CLEAR + t / 2;
  const drop = Math.sqrt(Math.max(1e-6, (2 * halfW) ** 2 - (botLat - topLat) ** 2));
  const botY = topY - drop;
  // Along the board's width, lower rail → top rail; the deck's normal square to it, toward the body.
  const w = V(0, topY - botY, k * (topLat - botLat)).normalize();
  const n = V(0, -w.z, w.y);
  if (n.z * k > 0) n.negate();
  const lowerRail = V(0.02, botY, k * botLat);
  const onFace = (along: number): Vector3 => add(lowerRail, sc(w, along), sc(n, -(t / 2 + LIMB_RADIUS.forearm * H)));
  const shoulder = V(0, yS, k * latS), reachMax = 0.97 * (m.upperArmLen + m.forearmLen);
  let along = 0.8 * HAND_REACH * H;
  while (along < 2 * halfW && onFace(along).distanceTo(shoulder) > reachMax) along += 0.005;
  const wrist = onFace(along);
  // The board's origin is the middle of its bottom face, its up (the deck's normal) toward the body.
  const mid = add(sc(lowerRail, 0.5), sc(V(0.02, topY, k * topLat), 0.5));
  const board: BoardFrame = {
    position: add(mid, sc(n, -t / 2)),
    forward: V(Math.cos(CARRY_NOSE_DOWN), -Math.sin(CARRY_NOSE_DOWN), 0),
    up: n,
  };
  const fsh = rest.joint[`upperarm_${free}`], reach = m.upperArmLen + m.forearmLen;
  const hands = {
    [side]: boardHand(wrist, V(0, 0.3, k)),
    [free]: boardHand(V(0.03, fsh.y - 0.96 * reach, -k * (Math.abs(fsh.x) + 0.06)), V(-1, 0, -k * 0.2)),
  } as Record<Limb, HandTarget>;
  return {
    pelvis, pelvisUp: Y(), pelvisForward: X(), chest: { bend: 0.04, twist: 0, side: 0 },
    feet, hands, look: add(X(), sc(Y(), -0.03)), carry: { side, board, hand: wrist.clone() }, // its own copy: moving the hand target mustn't move the anchor
  };
}

/** The pose's targets in the board frame (spec §3.5). */
export function poseTargets(pose: PoseName, ctx: PoseContext): PoseTargets {
  const r = rider(ctx), bb = ctx.spec.kind === 'bodyboard';
  switch (pose) {
    case 'sit': return sit(ctx);
    case 'paddle': return paddle(ctx, r);
    case 'popup': return popup(ctx, r);
    case 'drop': return drop(ctx, r);
    case 'bottomTurn': return bottomTurn(ctx, r);
    case 'trim': return trim(ctx, r);
    case 'barrel': return barrel(ctx, r);
    case 'kickout': return kickout(ctx, r);
    case 'bail': return bb ? bodyboardBail(ctx, r) : standBail(ctx, r);
    case 'prone': return prone(ctx, r, false);
    case 'proneBarrel': return prone(ctx, r, true);
    case 'dropKnee': return dropKnee(ctx, r);
    case 'carry': return carry(ctx, r);
  }
}
