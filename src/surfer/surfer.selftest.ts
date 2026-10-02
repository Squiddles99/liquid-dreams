import * as THREE from 'three/webgpu';
import { coverage } from '../board/board.selftest';
import { layoutFor } from '../board/boardSpec';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { poseTargets } from './poses';
import { PRESETS, boardFor, boardsFor } from './presets';
import { BONES } from './rig';
import { solvePose } from './solvePose';
import { Surfer } from './Surfer';

for (const name of ['female', 'male', 'grommet'] as const) {
  registerSelfTest({
    name: `surfer (${name}): loads, matches its manifest, poses the ankles onto their targets on its first board, and renders`,
    async run(renderer) {
      const s = await Surfer.load(PRESETS[name], new Sky(DEFAULT_ATMOSPHERE));
      const v = new THREE.Vector3();
      let restErr = 0;
      for (const b of BONES) restErr = Math.max(restErr, s.boneWorldPosition(b, v).distanceTo(s.rest.joint[b]));
      // The preset's first board and a pose that exists on it: trim on a surfboard, prone on Grommet's bodyboard.
      const kind = boardsFor(PRESETS[name])[0];
      const spec = boardFor(PRESETS[name], kind);
      const frame = { position: new THREE.Vector3(0, 0, 0), forward: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) };
      const t = poseTargets(kind === 'bodyboard' ? 'prone' : 'trim', { spec, layout: layoutFor(spec, s.rest.heightM), rest: s.rest, stance: 'regular', dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, phaseT: 0 });
      const solved = solvePose(s.rest, t, frame, new THREE.Vector3(10, 1, 0));
      s.setOutfit('shortArmSteamer');
      s.applyPose(solved);
      s.group.updateMatrixWorld(true);
      let footErr = 0;
      for (const side of ['l', 'r'] as const) footErr = Math.max(footErr, s.boneWorldPosition(`foot_${side}`, v).distanceTo(solved.joint[`foot_${side}`]));
      const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
      // At the body: standing, from the side; prone on the bodyboard, from above (a side view of a lying body is a sliver).
      if (kind === 'bodyboard') cam.position.set(0, 3, 1);
      else cam.position.set(0, 1.5, 4);
      cam.lookAt(0, kind === 'bodyboard' ? 0.3 : 1, 0);
      const px = await coverage(renderer, s.group, cam);
      // "Renders": the smallest rider, Shazza crouched in trim, covers about 200 of the 64² pixels (her body 197, her hair
      // 3), so the mark is half that; without her body she covers 26. At 200 it failed on 2 px of braid (cards to tubes).
      return {
        pass: restErr < 0.001 && footErr < 0.01 && px > 100,
        detail: `${kind}: rest joints vs manifest ${(restErr * 1000).toFixed(2)} mm, posed ankles ${(footErr * 100).toFixed(2)} cm, ${px} px`,
      };
    },
  });
}
