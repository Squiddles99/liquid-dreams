import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { PlantMeshes, raggedKeepNode } from './PlantMeshes';
import type { Plant } from './plants';

registerSelfTest({
  name: 'heath: the ragged edge keeps a camera-facing surface whole and cuts most of an edge-on one',
  async run(renderer) {
    // (noise, facing) pairs: noise 0…1 in 21 steps, at facing 1 and 0.05.
    const pts: [number, number][] = [];
    for (const f of [1, 0.05]) for (let i = 0; i <= 20; i++) pts.push([i / 20, f]);
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([a, b]) => [a, b, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly(), output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const e = input.element(instanceIndex);
      output.element(instanceIndex).assign(vec4(select(raggedKeepNode(e.x, e.y), float(1.0), float(0.0)), 0.0, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const kept = (f: number) => pts.filter((p, i) => p[1] === f && out[i * 4] === 1).length;
    const facingKept = kept(1), edgeKept = kept(0.05);
    return { pass: facingKept === 21 && edgeKept <= 5, detail: `facing: kept ${facingKept}/21; edge-on: kept ${edgeKept}/21` };
  },
});

registerSelfTest({
  name: 'heath: a plant 175 m away draws at its own base, shrunk (not pulled toward the world origin)',
  async run(renderer) {
    const meshes = new PlantMeshes(new Sky(DEFAULT_ATMOSPHERE));
    // A big plant 175 m from the camera (shrink 0.5), the camera well away from the world origin.
    const plant: Plant = { x: 275, z: 40, kind: 'daisy', shape: 0, width: 12, height: 8, yTrue: 30, yCoarse: 30, yaw: 0, cosYaw: 1, sinYaw: 0, seed: 0.3, tint: [0.2, 0.2, 0.2] };
    const cam = new THREE.PerspectiveCamera(20, 1, 1, 1000);
    cam.position.set(100, 32, 40);
    cam.lookAt(275, 32, 40);
    cam.updateMatrixWorld();
    meshes.addCell(1, [plant], () => 30, () => 0);
    meshes.flush();
    const scene = new THREE.Scene();
    for (const m of meshes.meshes) scene.add(m);
    const target = new THREE.RenderTarget(64, 64);
    const clear = new THREE.Color(), alpha = renderer.getClearAlpha();
    renderer.getClearColor(clear);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64);
    target.dispose();
    let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (px[(y * 64 + x) * 4 + 3] > 0) { n++; sx += x; sy += y; }
    // Where the base's middle should land: straight ahead (the centre column), a little below the middle row.
    const base = new THREE.Vector3(275, 30 + 2, 40).project(cam);
    const want = [(base.x * 0.5 + 0.5) * 64, (base.y * 0.5 + 0.5) * 64];
    const got = n ? [sx / n, sy / n] : [NaN, NaN];
    const off = Math.hypot(got[0] - want[0], got[1] - want[1]);
    return { pass: n > 10 && off < 6, detail: `${n} px, centre (${got.map((v) => v.toFixed(1)).join(', ')}) vs the base's (${want.map((v) => v.toFixed(1)).join(', ')}): ${off.toFixed(1)} px off` };
  },
});
