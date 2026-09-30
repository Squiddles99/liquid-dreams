import * as THREE from 'three/webgpu';
import { coverage } from '../board/board.selftest';
import { layoutFor } from '../board/boardSpec';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { poseTargets } from './poses';
import { PRESETS, boardFor } from './presets';
import { BONES } from './rig';
import { solvePose } from './solvePose';
import { Surfer } from './Surfer';

for (const name of ['female', 'male'] as const) {
  registerSelfTest({
    name: `surfer (${name}): loads, matches its manifest, poses feet onto the board, and renders`,
    async run(renderer) {
      const s = await Surfer.load(PRESETS[name], new Sky(DEFAULT_ATMOSPHERE));
      const v = new THREE.Vector3();
      let restErr = 0;
      for (const b of BONES) restErr = Math.max(restErr, s.boneWorldPosition(b, v).distanceTo(s.rest.joint[b]));
      const spec = boardFor(PRESETS[name], 'thruster');
      const frame = { position: new THREE.Vector3(0, 0, 0), forward: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) };
      const t = poseTargets('trim', { spec, layout: layoutFor(spec, s.rest.heightM), rest: s.rest, stance: 'regular', dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, phaseT: 0 });
      const solved = solvePose(s.rest, t, frame, new THREE.Vector3(10, 1, 0));
      s.setOutfit('shortArmSteamer');
      s.applyPose(solved);
      s.group.updateMatrixWorld(true);
      let footErr = 0;
      for (const side of ['l', 'r'] as const) footErr = Math.max(footErr, s.boneWorldPosition(`foot_${side}`, v).distanceTo(solved.joint[`foot_${side}`]));
      const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
      cam.position.set(0, 1.5, 4);
      cam.lookAt(0, 1, 0);
      const px = await coverage(renderer, s.group, cam);
      return {
        pass: restErr < 0.001 && footErr < 0.01 && px > 200,
        detail: `rest joints vs manifest ${(restErr * 1000).toFixed(2)} mm, posed feet ${(footErr * 100).toFixed(2)} cm, ${px} px`,
      };
    },
  });
}
