// src/frontend/staging.ts
import type { BoardKind } from '../board/boardSpec';
import type { SelectExpression } from '../surfer/faceControl';
import { type LandSpot, headingAxes } from '../surfer/placement';
import type { PoseName } from '../surfer/poseNames';
import type { PresetName } from '../surfer/presets';
import type { OutfitChoice } from '../surfer/wardrobe';
import { crewFor } from './beatCamera';
import { type FrontState, boardOf } from './frontEnd';

export interface RiderStaging {
  visible: boolean;
  x: number;
  z: number;
  headingDeg: number;
  heightNudgeM: number;
  pose: PoseName;
  expression: SelectExpression;
  reach: number;
  board: BoardKind;
  outfit: OutfitChoice | 'walking';
}
export type GangStaging = Record<PresetName, RiderStaging>;

/** The crew's turn to face the camera (spec §13: a stepping turn, not a spin). */
export const TURN_S = 0.8;
/** The pick: half a pace forward with a grin and the wave, before the beat moves on (spec §4.2). */
export const PICK_S = 0.7;

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A turn in two steps (half the angle each, eased), dipping 1.5 cm in each step. A half turn goes the same way each time. */
export function stepTurn(fromDeg: number, toDeg: number, t: number): { headingDeg: number; bobM: number } {
  const c = Math.min(1, Math.max(0, t));
  if (c === 0) return { headingDeg: fromDeg, bobM: 0 };
  const d = ((toDeg - fromDeg + 540) % 360) - 180 || 180;
  const stepT = c < 0.5 ? c / 0.5 : (c - 0.5) / 0.5, done = c < 0.5 ? 0 : 0.5;
  const headingDeg = (((fromDeg + d * (done + 0.5 * ease(stepT))) % 360) + 360) % 360;
  return { headingDeg, bobM: -0.015 * Math.sin(stepT * Math.PI) };
}

const RIDERS: PresetName[] = ['male', 'female', 'grommet'];

/**
 * The crew for a front-end state. Conditions: all three facing the sea in walking clothes. Choose your rider: turned
 * (`turnT` through the turn) and spread, the focused rider grinning. The pick (`pickT`): half a pace forward, stoked,
 * waving. Grab your gear: only the chosen rider, holding the ticked board in the ticked surf outfit, whatever the focus
 * is on (Andrew 2026-10-04: she stays in what's ticked until something else is).
 */
export function stagingFor(s: FrontState, stand: LandSpot, opts: { turnT: number; pickT: number }): GangStaging {
  const toConditions = s.beat === 'conditions';
  const cond = crewFor('conditions', stand), select = crewFor(s.beat === 'gear' ? 'gear' : 'rider', stand);
  const gearSettled = s.beat === 'gear' && !s.move;
  const out = {} as GangStaging;
  for (const n of RIDERS) {
    const c = cond.find((p) => p.preset === n)!, r = select.find((p) => p.preset === n)!;
    const k = toConditions ? 0 : Math.min(1, Math.max(0, opts.turnT));
    const turn = toConditions ? { headingDeg: c.headingDeg, bobM: 0 } : stepTurn(c.headingDeg, r.headingDeg, k);
    let x = c.x + (r.x - c.x) * k, z = c.z + (r.z - c.z) * k;
    const focused = n === s.rider;
    let expression: SelectExpression = toConditions || !focused ? 'easy' : 'grin', reach = 0;
    if (focused && opts.pickT > 0 && opts.pickT < 1) {
      const { fwd } = headingAxes(r.headingDeg), stepK = Math.min(1, opts.pickT * 2);
      x += fwd[0] * 0.35 * stepK;
      z += fwd[1] * 0.35 * stepK;
      expression = 'stoked';
      reach = Math.sin(opts.pickT * Math.PI);
    }
    const board = boardOf(s, n);
    const outfit: OutfitChoice | 'walking' = gearSettled && focused ? (s.outfits[n] ?? 'season') : 'walking';
    // In Grab your gear only the chosen rider stays (hidden at the cut: once the move from Choose your rider lands).
    const visible = s.beat !== 'gear' || focused || (s.move !== null && s.move.from === 'rider');
    out[n] = { visible: gearSettled ? focused : visible, x, z, headingDeg: turn.headingDeg, heightNudgeM: turn.bobM, pose: 'selectStand', expression, reach, board, outfit };
  }
  return out;
}
