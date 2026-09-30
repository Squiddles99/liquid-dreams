import * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { BoardMesh } from './BoardMesh';
import { DEFAULT_BOARD_LOOKS } from './boardLook';
import { makeBoard } from './boardSpec';

/** Pixels drawn (alpha > 0) when `object` is rendered alone into a 64×64 target from `camera`. */
export async function coverage(renderer: THREE.WebGPURenderer, object: THREE.Object3D, camera: THREE.Camera): Promise<number> {
  const scene = new THREE.Scene();
  scene.add(object);
  const target = new THREE.RenderTarget(64, 64);
  const clear = new THREE.Color();
  renderer.getClearColor(clear);
  const alpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64);
  target.dispose();
  let drawn = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) drawn++;
  return drawn;
}

registerSelfTest({
  name: 'board: each board renders (thruster, step-up, bodyboard)',
  async run(renderer) {
    const board = new BoardMesh(new Sky(DEFAULT_ATMOSPHERE));
    const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
    cam.position.set(0, 1.4, 2.6);
    cam.lookAt(0, 0, 0);
    const dims = { thruster: { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 }, stepUp: { lengthIn: 80, widthIn: 19.5, thicknessIn: 2.625 }, bodyboard: { lengthIn: 42, widthIn: 21.5, thicknessIn: 2.625 } } as const;
    const out: string[] = [];
    let ok = true;
    for (const kind of ['thruster', 'stepUp', 'bodyboard'] as const) {
      board.setBoard(makeBoard(kind, dims[kind]), DEFAULT_BOARD_LOOKS[kind]);
      const n = await coverage(renderer, board.mesh, cam);
      out.push(`${kind} ${n} px`);
      ok &&= n > 150;
    }
    return { pass: ok, detail: out.join(', ') };
  },
});
