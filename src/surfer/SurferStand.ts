import * as THREE from 'three/webgpu';
import { float, normalWorld, vec3 } from 'three/tsl';
import { BoardMesh } from '../board/BoardMesh';
import { deckYAt, halfWidthAt, layoutFor, uAt } from '../board/boardSpec';
import type { CameraPose } from '../dev/momentLink';
import type { HeightProbe } from '../ocean/HeightProbe';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import { HeaveFilter, balanceAt } from './balance';
import { CUFF_SIDES, LEASH_POINTS, LEASH_SIDES, cuffPositions, leashCuff, leashCurve, leashStart, tubeIndices, tubePositions } from './leash';
import { carriedBoard, feetOnGround } from './carry';
import { SOLE_M, STAND_PROBE_FIRST, boardFrameFrom, chaseCamera, groundFrame, probePoints, stableLookAt } from './placement';
import { isCarryPose } from './poseNames';
import { poseTargets } from './poses';
import { PRESETS, type PresetName, boardFor, boardLookFor } from './presets';
import { POSE_PHASE, POSE_ZONE, type RideState } from './rideState';
import { applyFaceParams, idleContextFor, restingFace, sunFacing, withExpression } from './faceControl';
import { type BoardFrame, type SolvedPose, boardQuaternion, solvePose } from './solvePose';
import { clipDuration, loadRiderClips, type RiderClips } from './clips';
import { sampleClip } from './clipPlayer';
import { clipPose } from './clipPose';
import { blendOnBoard } from './poseBlend';
import { EXIT_FADE_S, type Follow, fadeSolved, newFollow, sampleFromSolved, smootherStep, stepFollow } from './poseFollow';
import { loadPoseLib, type PoseLib } from './poseLib';
import { chooseMotion, clipTime } from './motion';
import type { FingerBone } from './rig';
import { Surfer } from './Surfer';
import { type SurferParams, balanceApplies, carrySideOf, landedAt, playPhase } from './surferParams';
import { KeyedLoader } from './surferLoader';
import { OUTFIT_LABELS, outfitFor, wearsClothes, wearsSwimFins } from './wardrobe';

type N = any;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/** The stand (spec §6): the chosen surfer on the chosen board, on the water at a chosen spot, in the chosen pose. */
export class SurferStand {
  readonly group = new THREE.Group();
  readonly status = { outfit: '', motion: '' };
  /** Each rider's baked motion clips (clip slice spec §4.2), fetched once; { clips: null } when not built. */
  private readonly clipLoader = new KeyedLoader<PresetName, { clips: RiderClips | null }>(
    (name) => loadRiderClips(`${import.meta.env.BASE_URL}surfer/clips/${name}.clips.json`).then((clips) => ({ clips })),
    (name, e) => console.warn(`The ${name} motion clips failed to load; the stand uses the code poses.`, e),
  );
  /** The approved ride poses (ride pose blend, part C), one file for every standing rider; null when not there. */
  private readonly poseLoader = new KeyedLoader<'all', PoseLib | null>(
    () => loadPoseLib(`${import.meta.env.BASE_URL}surfer/poses/poses.json`),
    (_k, e) => console.warn('The ride poses file failed to load; riding uses the trim clip or the code poses.', e),
  );
  /** The body following the ride's dials at a body's pace (poseFollow) while the blend runs; null otherwise. */
  private follow: Follow | null = null;
  /** The last pose shown, the board it stood on, the rider and the update it was shown in: the blend fades in from it
   * (the drop's cut, the first ride's pop) only when it was the update just before, on the same rider. */
  private lastShown: { pose: SolvedPose; frame: BoardFrame; preset: PresetName; tick: number } | null = null;
  /** Leaving the blend (a wipeout, the ride's end): the blend's last pose, faded out of over EXIT_FADE_S. */
  private exitFade: { pose: SolvedPose; t: number } | null = null;
  private tick = 0;
  private askedPreset: PresetName | null = null;
  private readonly board: BoardMesh;
  private readonly leash: THREE.Mesh;
  private readonly leashPos = new Float32Array((LEASH_POINTS + 1) * LEASH_SIDES * 3);
  /** The cuff the leash is strapped to, round the wrist or the ankle (Andrew). */
  private readonly cuff: THREE.Mesh;
  private readonly cuffPos = new Float32Array(2 * CUFF_SIDES * 3);
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
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(this.cuffPos, 3));
    cg.setIndex(new THREE.BufferAttribute(tubeIndices(2, CUFF_SIDES), 1));
    this.cuff = new THREE.Mesh(cg, m);
    this.cuff.frustumCulled = false;
    this.group.add(this.cuff);
    this.sky = sky;
    this.loader = new KeyedLoader((name) => Surfer.load(PRESETS[name], sky, sunVisibility), (name, e) => console.warn(`The ${name} surfer failed to load; the stand shows the board only.`, e));
    this.group.visible = false;
  }

  /**
   * `ground` (walking spec §4): the land's height at (x, z), or null while it loads; on land the stand stands there (the
   * board on the sand, or carried under the arm) and doesn't probe the water. `rideFrame`: the board where the riding
   * physics put it, in place of the probed water.
   */
  update(asked: SurferParams, simTime: number, dateISO: string, seed: number, probe: HeightProbe, tideM: number, ground?: (x: number, z: number) => number | null, rideFrame?: BoardFrame): void {
    this.group.visible = asked.enabled;
    this.tick++;
    if (!asked.enabled) return;
    const groundY = asked.onLand ? ground?.(asked.x, asked.z) ?? null : null;
    const p = landedAt(asked, groundY, tideM);
    const preset = PRESETS[p.preset], spec = boardFor(preset, p.board), layout = layoutFor(spec, preset.heightM);
    this.board.setBoard(spec, boardLookFor(preset, p.board));
    const halfLen = spec.lengthM / 2, halfWidth = spec.maxWidthM / 2;
    const outfit = outfitFor(preset, p.outfit, dateISO), carrying = p.onLand && isCarryPose(p.pose);
    let frame: BoardFrame;
    if (p.onLand) {
      // The feet on the sand, lifted by the thongs' soles when walking; other poses ride a board lying on the sand.
      frame = groundFrame(p, groundY, tideM, carrying && wearsClothes(outfit) ? SOLE_M : 0);
    } else if (rideFrame) {
      // Riding (first-ride spec §5): the physics puts the board on the wave.
      frame = rideFrame;
    } else {
      probePoints(p, halfLen, halfWidth).forEach(([x, z], i) => probe.setProbe(STAND_PROBE_FIRST + i, x, z));
      frame = boardFrameFrom(p, halfLen, halfWidth, [0, 1, 2, 3].map((i) => probe.heightAt(STAND_PROBE_FIRST + i)), tideM);
    }
    this.frame = frame;
    this.heave = this.heaveFilter.update(frame.position.y, simTime);
    const Qb = boardQuaternion(frame);
    this.board.mesh.position.copy(frame.position);
    this.board.mesh.quaternion.copy(Qb);

    this.askedPreset = p.preset;
    const s = this.loader.get(p.preset);
    if (s !== this.surfer) {
      if (this.surfer) this.group.remove(this.surfer.group);
      this.surfer = s;
      if (s) this.group.add(s.group);
    }
    this.leash.visible = s !== null && !carrying;
    this.cuff.visible = this.leash.visible;
    if (!s) {
      this.board.setContacts([]);
      return;
    }
    s.setOutfit(outfit);
    s.setSwimFins(wearsSwimFins(p.board, p.onLand));
    s.setOnLand(p.onLand);
    this.status.outfit = OUTFIT_LABELS[outfit];

    const bal = balanceApplies(p) ? balanceAt(seed, simTime, p.balanceAmount, this.heave) : null;
    const dials = { compression: p.compression + (bal?.compression ?? 0), lean: p.lean, twist: p.twist, reach: p.reach };
    const phaseT = p.play ? playPhase(p.pose, simTime, p.phaseT, p.preset) : p.phaseT;
    const t = poseTargets(p.pose, { spec, layout, rest: s.rest, stance: p.stance, dials, phaseT, carrySide: carrySideOf(p), who: p.preset, glasses: wearsClothes(outfit) });
    // Standing on the sand, each foot on the ground under it (a level frame on a slope buried one).
    if (carrying && ground) feetOnGround(t.feet, frame, ground, wearsClothes(outfit) ? SOLE_M : 0);
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
    const face = withExpression(applyFaceParams(p.idle ? s.idle.tick(dt, ctx) : restingFace(), p), p.preset, p.expression);
    s.setFace(face);
    if (face.headYawDeg !== 0 || face.headPitchDeg !== 0) {
      const v = lookAt.clone().sub(head).applyAxisAngle(UP, face.headYawDeg * DEG);
      const side = v.clone().cross(UP);
      if (side.lengthSq() > 1e-9) v.applyAxisAngle(side.normalize(), face.headPitchDeg * DEG);
      lookAt.copy(head).add(v);
    }
    const state: RideState = {
      board: frame, speedMs: p.speedMs, railAngleRad: p.lean * 35 * DEG, compression: dials.compression,
      zone: POSE_ZONE[p.pose], phase: POSE_PHASE[p.pose], phaseT,
      lookAt,
    };
    // The carrying hand grips its board's rail (dune select Gate A), or lies open on a bodyboard, its rail out of reach;
    // every other hand is relaxed. Set before the pose: a shaped hand's finger bones stay at rest under its morph.
    const holding = carrying && t.carry ? t.carry.side : null, shape = p.board === 'bodyboard' ? 'flat' : 'grip';
    s.setHands(holding === 'l' ? shape : 'relaxed', holding === 'r' ? shape : 'relaxed');
    // Code or clip (clip slice spec §4.2). The code targets above still give the look and the carry.
    const choice = chooseMotion(p.motion, p.pose, this.clipLoader.get(p.preset), p.stance);
    this.status.motion = choice.status;
    let solved: SolvedPose, fingers: Partial<Record<FingerBone, THREE.Quaternion>> | undefined;
    // Riding a standing board (part C): the approved poses, blended by the ride's dials, placed by the clip path with
    // the contact hand pulled to its spot. No poses file: the trim clip or the code poses, as before.
    // Fetched from the first moment on the water on a standing board, so it's there before the first ride.
    if (!p.onLand && p.board !== 'bodyboard') this.poseLoader.get('all');
    const lib = p.drive && p.pose === 'trim' && p.board !== 'bodyboard' ? this.poseLoader.get('all') : null;
    if (p.drive && p.pose === 'trim' && p.board !== 'bodyboard' && !lib && this.poseLoader.settled('all')) this.status.motion = 'blend: no poses file';
    const shownJustNow = this.lastShown && this.lastShown.tick === this.tick - 1 && this.lastShown.preset === p.preset ? this.lastShown : null;
    const blending = !!(lib && p.drive);
    // Leaving the blend: fade out of its last pose (Andrew 2026-10-15: no snap, final review).
    if (!blending && this.follow) this.exitFade = shownJustNow ? { pose: shownJustNow.pose, t: 0 } : null;
    if (!blending) this.follow = null;
    else this.exitFade = null;
    if (lib && p.drive) {
      // The body follows the dials at a body's pace, fading in from whatever showed just before (Andrew 2026-10-15: no
      // snap); with nothing to fade from, it starts where the ride is.
      if (!this.follow) {
        this.follow = shownJustNow ? newFollow() : newFollow({ d: p.drive, dials, stance: p.stance });
        if (shownJustNow) this.follow.from = sampleFromSolved(shownJustNow.pose, shownJustNow.frame, p.stance, s.rest.restQ);
      }
      const out = stepFollow(this.follow, p.drive, dials, p.stance, dt);
      const cp = blendOnBoard(lib, s.rest, { spec, layout, stance: p.stance, dials: out.dials, balance: bal }, p.drive, simTime, state.board, state.lookAt, out);
      solved = cp;
      fingers = cp.fingers;
      this.status.motion = 'blend';
    } else if (choice.use === 'clip' && choice.clip && choice.rc) {
      const sample = sampleClip(choice.clip, choice.rc.fps, clipTime(p.play, simTime, p.phaseT, clipDuration(choice.rc, choice.clip)));
      // The clip moves the body; the arms take the surfer pose's hands, balance drift included (Andrew, Gate C).
      const c = clipPose(s.rest, sample, { spec, layout, stance: p.stance, dials, balance: bal, hands: t.hands }, state.board, state.lookAt);
      solved = c;
      fingers = c.fingers;
    } else {
      solved = solvePose(s.rest, t, state.board, state.lookAt);
    }
    if (this.exitFade) {
      solved = fadeSolved(this.exitFade.pose, solved, 1 - smootherStep(this.exitFade.t / EXIT_FADE_S));
      this.exitFade.t += dt;
      if (this.exitFade.t >= EXIT_FADE_S) this.exitFade = null;
    }
    s.applyPose(solved, fingers);
    this.lastShown = { pose: solved, frame, preset: p.preset, tick: this.tick };
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
    // Strapped on with a cuff (Andrew: a bodyboarder's at the wrist), the leash leaving its side toward the plug.
    const cuff = leashCuff(p.board, p.stance, solved.joint, preset.heightM);
    cuffPositions(cuff, this.cuffPos);
    (this.cuff.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.cuff.geometry.computeVertexNormals(); // lit as a band round the limb (24 vertices)
    const plugWorld = new THREE.Vector3(...layout.leashPlug).applyQuaternion(Qb).add(frame.position);
    const end = leashStart(cuff, plugWorld);
    const deck = (x: number, z: number): number | null => (Math.abs(x) <= halfLen && Math.abs(z) <= halfWidthAt(spec, uAt(spec, x)) ? deckYAt(spec, x, z) : null);
    const pts = leashCurve(toBoard(end), new THREE.Vector3(...layout.leashPlug), layout.leashLengthM, deck)
      .map((q) => q.applyQuaternion(Qb).add(frame.position));
    tubePositions(pts, 0.0035, LEASH_SIDES, this.leashPos);
    (this.leash.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Whether the rider it was last asked for has finished loading (or failed: the stand shows the board alone). */
  get settled(): boolean {
    return this.askedPreset !== null && this.loader.settled(this.askedPreset);
  }

  /** The rider on the stand, once loaded. */
  get rider(): Surfer | null {
    return this.surfer;
  }

  chasePose(headingDeg: number): CameraPose | null {
    return this.frame ? chaseCamera(this.frame, headingDeg) : null;
  }

}
