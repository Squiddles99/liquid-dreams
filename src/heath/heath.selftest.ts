import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { coverage } from '../board/board.selftest';
import { loadKit } from './kit';
import { KitMeshes } from './KitMeshes';
import { SCATTER_VARIANTS, type ScatterItem, type ScatterKind } from './nearScatter';
import { ScatterMeshes } from './ScatterMeshes';
import { PlantMeshes, raggedKeepNode } from './PlantMeshes';
import { PLANT_KINDS, PLANT_SHAPES } from './plants';
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

registerSelfTest({
  name: 'heath: every kit variant draws pixels at L0 (5 m) and L1 (25 m)',
  async run(renderer) {
    const kit = await loadKit();
    const meshes = new KitMeshes(kit, new Sky(DEFAULT_ATMOSPHERE));
    meshes.forceBand.value = 1;
    const group = new THREE.Group();
    for (const m of meshes.meshes) group.add(m);
    const under: string[] = [];
    let least = Infinity;
    for (const kind of PLANT_KINDS) {
      for (let v = 0; v < PLANT_SHAPES; v++) {
        for (const [d, fov] of [[5, 30], [25, 6]] as const) {
          const plant: Plant = { x: 0, z: -d, kind, shape: v, width: 1.5, height: kind === 'pigface' ? 0.3 : 1, yTrue: 0, yCoarse: 0, yaw: 0, cosYaw: 1, sinYaw: 0, seed: 0.37, tint: [0.15, 0.18, 0.1] };
          const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 100);
          cam.position.set(0, kind === 'pigface' ? 1.2 : 0.6, 0);
          cam.lookAt(0, kind === 'pigface' ? 0.1 : 0.45, -d);
          cam.updateMatrixWorld();
          meshes.update([plant], cam, { cx: 0, cz: 0, on: true });
          // Outside the animation loop the node frame only advances in compileAsync, and three uploads instance-matrix
          // edits once a frame: without it every view after the first drew the first's stale matrices.
          await renderer.compileAsync(group, cam);
          const px = await coverage(renderer, group, cam);
          least = Math.min(least, px);
          if (px <= 20) under.push(`${kind} ${v} at ${d} m: ${px} px`);
        }
      }
    }
    return { pass: under.length === 0, detail: under.length ? under.join('; ') : `${PLANT_KINDS.length * PLANT_SHAPES * 2} views, the least ${least} px` };
  },
});

registerSelfTest({
  name: 'heath: every tuft and ground item draws pixels (tufts at 4 m and 16 m, items at 1.5 m, shells at 0.6 m)',
  async run(renderer) {
    const kit = await loadKit();
    const s = new ScatterMeshes(kit, new Sky(DEFAULT_ATMOSPHERE));
    s.forceBand.value = 1;
    const group = new THREE.Group();
    for (const m of s.meshes) group.add(m);
    const under: string[] = [];
    let least = Infinity, views = 0;
    for (const kind of Object.keys(SCATTER_VARIANTS) as ScatterKind[]) {
      const tuft = kind.startsWith('tuft_');
      for (let v = 0; v < SCATTER_VARIANTS[kind]; v++) {
        // Shells are 1–4 cm: seen from 0.6 m; the other items from 1.5 m.
        for (const [d, fov] of tuft ? ([[4, 20], [16, 6]] as const) : kind === 'item_shell' ? ([[0.6, 12]] as const) : ([[1.5, 12]] as const)) {
          const it: ScatterItem = { kind, variant: v, x: 0, z: -d, y: 0, yaw: 0.5, tiltX: 0, tiltZ: 0, scale: 1, seed: 0.37 };
          const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 100);
          cam.position.set(0, tuft ? 0.5 : 0.6, 0);
          cam.lookAt(0, tuft ? 0.3 : 0.02, -d);
          cam.updateMatrixWorld();
          s.update([it], cam);
          await renderer.compileAsync(group, cam);
          const px = await coverage(renderer, group, cam);
          least = Math.min(least, px);
          views++;
          if (px <= 8) under.push(`${kind} ${v} at ${d} m: ${px} px`);
        }
      }
    }
    return { pass: under.length === 0, detail: under.length ? under.join('; ') : `${views} views, the least ${least} px` };
  },
});
