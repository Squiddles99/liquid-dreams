import * as THREE from 'three/webgpu';
import { float, normalWorld, vec3 } from 'three/tsl';
import { BoardMesh } from '../board/BoardMesh';
import { deckYAt, halfWidthAt, layoutFor, uAt } from '../board/boardSpec';
import type { CameraPose } from '../dev/momentLink';
import type { HeightProbe } from '../ocean/HeightProbe';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import { HeaveFilter, balanceAt } from './balance';
import { LEASH_POINTS, LEASH_SIDES, leashCurve, tubeIndices, tubePositions } from './leash';
import { carriedBoard } from './carry';
import { SOLE_M, STAND_PROBE_FIRST, boardFrameFrom, chaseCamera, groundFrame, probePoints, stableLookAt } from './placement';
import { poseTargets } from './poses';
import { PRESETS, type PresetName, boardFor, boardLookFor } from './presets';
import { POSE_PHASE, POSE_ZONE, type RideState } from './rideState';
import { applyFaceParams, idleContextFor, restingFace, sunFacing } from './faceControl';
import { type BoardFrame, boardQuaternion, solvePose } from './solvePose';
import { Surfer } from './Surfer';
import { type SurferParams, carrySideOf, playPhase } from './surferParams';
import { KeyedLoader } from './surferLoader';
import { OUTFIT_LABELS, outfitFor, wearsClothes, wearsSwimFins } from './wardrobe';

type N = any;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/** The stand (spec §6): the chosen surfer on the chosen board, on the water at a chosen spot, in the chosen pose. */
export class SurferStand {
  readonly group = new THREE.Group();
  readonly status = { outfit: '' };
  private readonly board: BoardMesh;
  private readonly leash: THREE.Mesh;
  private readonly leashPos = new Float32Array((LEASH_POINTS + 1) * LEASH_SIDES * 3);
  private readonly loader: KeyedLoader<PresetName, Surfer>;
  private surfer: Surfer | null = null;
  private frame: BoardFrame | null = null;
  /** The board's vertical acceleration for the balance layer's knees; 0 while paused or after a jump. */
  private readonly heaveFilter = new HeaveFilter();
  private lastSim: number | null = null;
  private readonly sky: Sky;
  private heave = 0;

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    this.board = new BoardMesh(sky, sunVisibility);
    this.group.add(this.board.mesh);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.leashPos, 3));
    g.setIndex(new THREE.BufferAttribute(tubeIndices(LEASH_POINTS + 1, LEASH_SIDES), 1));
    const m = new THREE.MeshBasicNodeMaterial();
    m.side = THREE.DoubleSide;
    m.colorNode = litColor(sky, { albedo: vec3(0.03, 0.03, 0.035), normal: normalWorld, specular: float(0.04), shininess: float(30) }, sunVisibility);
    this.leash = new THREE.Mesh(g, m);
    this.leash.frustumCulled = false;
    this.group.add(this.leash);
    this.sky = sky;
    this.loader = new KeyedLoader((name) => Surfer.load(PRESETS[name], sky, sunVisibility), (name, e) => console.warn(`The ${name} surfer failed to load; the stand shows the board only.`, e));
    this.group.visible = false;
  }

  /**
   * `ground` (walking spec §4): the land's height at (x, z), or null while it loads; on land the stand stands there (the
   * board on the sand, or carried under the arm) and doesn't probe the water.
   */
  update(p: SurferParams, simTime: number, dateISO: string, seed: number, probe: HeightProbe, tideM: number, ground?: (x: number, z: number) => number | null): void {
    this.group.visible = p.enabled;
    if (!p.enabled) return;
    const preset = PRESETS[p.preset], spec = boardFor(preset, p.board), layout = layoutFor(spec, preset.heightM);
    this.board.setBoard(spec, boardLookFor(preset, p.board));
    const halfLen = spec.lengthM / 2, halfWidth = spec.maxWidthM / 2;
    const outfit = outfitFor(preset, p.outfit, dateISO), carrying = p.onLand && p.pose === 'carry';
    let frame: BoardFrame;
    if (p.onLand) {
      // The feet on the sand, lifted by the thongs' soles when walking; other poses ride a board lying on the sand.
      frame = groundFrame(p, ground?.(p.x, p.z) ?? null, tideM, carrying && wearsClothes(outfit) ? SOLE_M : 0);
    } else {
      probePoints(p, halfLen, halfWidth).forEach(([x, z], i) => probe.setProbe(STAND_PROBE_FIRST + i, x, z));
      frame = boardFrameFrom(p, halfLen, halfWidth, [0, 1, 2, 3].map((i) => probe.heightAt(STAND_PROBE_FIRST + i)), tideM);
    }
    this.frame = frame;
    this.heave = this.heaveFilter.update(frame.position.y, simTime);
    const Qb = boardQuaternion(frame);
    this.board.mesh.position.copy(frame.position);
    this.board.mesh.quaternion.copy(Qb);

    const s = this.loader.get(p.preset);
    if (s !== this.surfer) {
      if (this.surfer) this.group.remove(this.surfer.group);
      this.surfer = s;
      if (s) this.group.add(s.group);
    }
    this.leash.visible = s !== null && !carrying;
    if (!s) {
      this.board.setContacts([]);
      return;
    }
    s.setOutfit(outfit);
    s.setSwimFins(wearsSwimFins(p.board, p.onLand));
    s.setOnLand(p.onLand);
    this.status.outfit = OUTFIT_LABELS[outfit];

    const bal = p.balance ? balanceAt(seed, simTime, p.balanceAmount, this.heave) : null;
    const dials = { compression: p.compression + (bal?.compression ?? 0), lean: p.lean, twist: p.twist, reach: p.reach };
    const phaseT = p.play ? playPhase(p.pose, simTime, p.phaseT) : p.phaseT;
    const t = poseTargets(p.pose, { spec, layout, rest: s.rest, stance: p.stance, dials, phaseT, carrySide: carrySideOf(p) });
    if (bal) {
      const lead = p.stance === 'regular' ? 'l' : 'r', trail = lead === 'l' ? 'r' : 'l';
      t.hands[lead].pos.add(bal.lead);
      t.hands[trail].pos.add(bal.trail);
    }
    // Idle life (closeup spec §5.2): ticked by the sim's clock (a paused capture holds the face still), turning the
    // head's look by its idle offsets about the head (last frame's), squinting as the sun meets the eyes.
    const dt = this.lastSim === null ? 0 : Math.min(0.1, Math.max(0, simTime - this.lastSim));
    this.lastSim = simTime;
    const lookAt = stableLookAt(frame, t.look);
    const head = s.boneWorldPosition('head', new THREE.Vector3());
    const facing = lookAt.clone().sub(head).normalize();
    const ctx = idleContextFor(p.pose, p.onLand, sunFacing(facing, this.sky.sunDirection.value));
    const face = applyFaceParams(p.idle ? s.idle.tick(dt, ctx) : restingFace(), p);
    s.setFace(face);
    if (face.headYawDeg !== 0 || face.headPitchDeg !== 0) {
      const v = lookAt.clone().sub(head).applyAxisAngle(UP, face.headYawDeg * DEG);
      const side = v.clone().cross(UP);
      if (side.lengthSq() > 1e-9) v.applyAxisAngle(side.normalize(), face.headPitchDeg * DEG);
      lookAt.copy(head).add(v);
    }
    const state: RideState = {
      board: frame, speedMs: 0, railAngleRad: p.lean * 35 * DEG, compression: dials.compression,
      zone: POSE_ZONE[p.pose], phase: POSE_PHASE[p.pose], phaseT,
      lookAt,
    };
    const solved = solvePose(s.rest, t, state.board, state.lookAt);
    s.applyPose(solved);
    if (carrying && t.carry) {
      // The board under the arm (walking spec §4): placed from the solved hand, not the feet; no deck contacts, no leash.
      const held = carriedBoard(t.carry, frame, solved);
      this.board.mesh.position.copy(held.position);
      this.board.mesh.quaternion.copy(boardQuaternion(held));
      this.board.setContacts([]);
      return;
    }
    const toBoardFrame = Qb.clone().invert();
    const contact = (b: keyof typeof solved.joint, r: number): { x: number; y: number; z: number; r: number } => {
      const q = solved.joint[b].clone().sub(frame.position).applyQuaternion(toBoardFrame);
      return { x: q.x, y: q.y, z: q.z, r };
    };
    this.board.setContacts([contact('foot_l', 0.09), contact('foot_r', 0.09), contact('pelvis', 0.16), contact('spine_03', 0.16), contact('hand_l', 0.05), contact('hand_r', 0.05)]);

    // The leash: board frame for the drape, back to world for the tube.
    const inv = Qb.clone().invert();
    const toBoard = (v: THREE.Vector3): THREE.Vector3 => v.clone().sub(frame.position).applyQuaternion(inv);
    const trail = p.stance === 'regular' ? 'r' : 'l';
    const end = p.board === 'bodyboard' ? solved.joint.upperarm_r.clone().lerp(solved.joint.forearm_r, 0.5) : solved.joint[`foot_${trail}`];
    const deck = (x: number, z: number): number | null => (Math.abs(x) <= halfLen && Math.abs(z) <= halfWidthAt(spec, uAt(spec, x)) ? deckYAt(spec, x, z) : null);
    const pts = leashCurve(toBoard(end), new THREE.Vector3(...layout.leashPlug), layout.leashLengthM, deck)
      .map((q) => q.applyQuaternion(Qb).add(frame.position));
    tubePositions(pts, 0.0035, LEASH_SIDES, this.leashPos);
    (this.leash.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  chasePose(headingDeg: number): CameraPose | null {
    return this.frame ? chaseCamera(this.frame, headingDeg) : null;
  }

}
