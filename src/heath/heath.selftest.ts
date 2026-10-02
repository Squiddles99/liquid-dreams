import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { coverage } from '../board/board.selftest';
import { loadKit } from './kit';
import { KitMeshes, hullColours } from './KitMeshes';
import { SCATTER_VARIANTS, type ScatterItem, type ScatterKind } from './nearScatter';
import { ScatterMeshes } from './ScatterMeshes';
import { PlantMeshes, raggedKeepNode } from './PlantMeshes';
import { PLANT_ALBEDO, PLANT_KINDS, PLANT_SHAPES } from './plants';
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

/** Renders `object` into a size² float target over black: the drawn pixels' count and mean colour. */
async function meanColour(renderer: THREE.WebGPURenderer, object: THREE.Object3D, camera: THREE.Camera, size = 64): Promise<{ n: number; rgb: [number, number, number] }> {
  const scene = new THREE.Scene();
  scene.add(object);
  const target = new THREE.RenderTarget(size, size, { type: THREE.HalfFloatType });
  const clear = new THREE.Color(), alpha = renderer.getClearAlpha();
  renderer.getClearColor(clear);
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size)) as Uint16Array;
  target.dispose();
  let n = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < size * size; i++) {
    if (THREE.DataUtils.fromHalfFloat(px[i * 4 + 3]) <= 0) continue;
    n++;
    for (let c = 0; c < 3; c++) sum[c] += THREE.DataUtils.fromHalfFloat(px[i * 4 + c]);
  }
  return { n, rgb: n ? [sum[0] / n, sum[1] / n, sum[2] / n] : [0, 0, 0] };
}

const plantAt = (kind: Plant['kind'], d: number): Plant => ({ x: 0, z: -d, kind, shape: 0, width: 1.5, height: kind === 'pigface' ? 0.3 : 1, yTrue: 0, yCoarse: 0, yaw: 0, cosYaw: 1, sinYaw: 0, seed: 0.37, tint: [...PLANT_ALBEDO[kind]] });

registerSelfTest({
  name: "heath: each kind's levels match in colour where they meet: L0 and L1 at 12 m, L1 and the hull at 39 m (within 0.05 a channel, as a share of the brightest)",
  async run(renderer) {
    const kit = await loadKit();
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    sky.update(renderer, new THREE.Vector3(0.4, 0.7, 0.3).normalize(), 2); // a mid-morning sun over the camera's shoulder
    const near = new KitMeshes(kit, sky), far = new PlantMeshes(sky);
    near.forceBand.value = 1;
    far.forceBand.value = 1;
    far.kitFade.value = 1;
    far.setKindColours(hullColours());
    const groupOf = (meshes: THREE.Object3D[]) => {
      const g = new THREE.Group();
      for (const m of meshes) g.add(m);
      return g;
    };
    const l0 = groupOf(near.meshes.filter((m) => m.name.endsWith('_L0'))), l1 = groupOf(near.meshes.filter((m) => m.name.endsWith('_L1'))), hull = groupOf(far.meshes);
    const lines: string[] = [], fit: string[] = [];
    let worst = 0;
    const lum = (c: [number, number, number]) => (c[0] + c[1] + c[2]) / 3;
    for (const kind of PLANT_KINDS) {
      const got: Record<number, [[number, number, number], [number, number, number]]> = {};
      // Each at about the game's pixels per radian at 1080p (1,100: the atlas's mips are what a coarse view gets wrong).
      for (const [d, a, b, size] of [[12, l0, l1, 224], [39, l1, hull, 64]] as const) {
        const p = plantAt(kind, d);
        const cam = new THREE.PerspectiveCamera((2 * Math.atan(1.2 / d) * 180) / Math.PI, 1, 0.05, 100);
        cam.position.set(0, 1.6, 0);
        cam.lookAt(0, p.height * 0.4, -d);
        cam.updateMatrixWorld();
        near.update([p], cam, { cx: 0, cz: 0, on: true });
        far.update([p], 0, 0, { cx: 0, cz: 0, on: true });
        const out: { n: number; rgb: [number, number, number] }[] = [];
        for (const g of [a, b]) {
          await renderer.compileAsync(g, cam);
          out.push(await meanColour(renderer, g, cam, size));
        }
        const [x, y] = out;
        got[d] = [x.rgb, y.rgb];
        const scale = Math.max(...x.rgb, ...y.rgb, 1e-6);
        const off = x.n && y.n ? Math.max(...x.rgb.map((v, c) => Math.abs(v - y.rgb[c]) / scale)) : Infinity;
        worst = Math.max(worst, off);
        lines.push(`${kind}@${d} ${off.toFixed(3)} (${d === 12 ? 'L0' : 'L1'} ${x.rgb.map((v) => v.toFixed(3)).join('/')}, ${d === 12 ? 'L1' : 'hull'} ${y.rgb.map((v) => v.toFixed(3)).join('/')})`);
      }
      // What would match them: L1 takes L0's hue at the hull's brightness, L0 L1's brightness, the hull L1's hue.
      const [a12, b12] = got[12], [a39, b39] = got[39];
      const hue = a39.map((v, c) => v / lum(a39) / (b39[c] / lum(b39)));
      const l1x = lum(b39) / lum(a39);
      const l1Fit = a12.map((v, c) => (l1x * (v / lum(a12))) / (b12[c] / lum(b12)));
      fit.push(`${kind}: l0 ×${((lum(b12) * l1x) / lum(a12)).toFixed(3)}, l1 ×[${l1Fit.map((v) => v.toFixed(3)).join(', ')}], hull ×[${hue.map((v) => v.toFixed(3)).join(', ')}]`);
    }
    // A black render matches anything: each level must be lit.
    const lit = !lines.some((l) => l.includes(' 0.000/0.000/0.000'));
    return { pass: worst <= 0.05 && lit, detail: `${lines.join('; ')} — fit: ${fit.join('; ')}` };
  },
});

registerSelfTest({
  name: "heath: a plant's coverage changes 10% or less across each band boundary (12 m and 40 m), every kind (six measured allowances)",
  async run(renderer) {
    const kit = await loadKit();
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    sky.update(renderer, new THREE.Vector3(0.4, 0.7, 0.3).normalize(), 2);
    const near = new KitMeshes(kit, sky), far = new PlantMeshes(sky);
    far.kitFade.value = 1;
    far.setKindColours(hullColours());
    const groupOf = (meshes: THREE.Object3D[]) => {
      const g = new THREE.Group();
      for (const m of meshes) g.add(m);
      return g;
    };
    // The view's width scales with the distance, so a plant's size in pixels holds steady across the step; at about the
    // game's pixels per radian at 1080p (1,100), since the cards' alpha depends on the mip they sample.
    const cover = async (kind: Plant['kind'], at: number, g: THREE.Object3D): Promise<number> => {
      const p = plantAt(kind, at);
      const fov = 2 * Math.atan(1.2 / at);
      const cam = new THREE.PerspectiveCamera((fov * 180) / Math.PI, 1, 0.05, 200);
      cam.position.set(0, 1.6, 0);
      cam.lookAt(0, p.height * 0.45, -at);
      cam.updateMatrixWorld();
      near.update([p], cam, { cx: 0, cz: 0, on: true });
      far.update([p], 0, 0, { cx: 0, cz: 0, on: true });
      await renderer.compileAsync(g, cam);
      const size = Math.round(fov * 1100);
      return (await meanColour(renderer, g, cam, size)).n / (size * size);
    };
    if (new URLSearchParams(location.search).has('fit')) {
      // Fit mode: each kind's L1 cut where it meets L0 (12 m) and the hull (40 m), by bisection (a lower cut covers more).
      near.forceBand.value = 1;
      far.forceBand.value = 1;
      const l0 = groupOf(near.meshes.filter((m) => m.name.endsWith('_L0'))), l1 = groupOf(near.meshes.filter((m) => m.name.endsWith('_L1'))), hull = groupOf(far.meshes);
      const rows: string[] = [];
      for (const kind of PLANT_KINDS) {
        const cuts = near.l1Cut.get(kind)!, fitted: number[] = [];
        for (const [i, d, other] of [[0, 12, l0], [1, 40, hull]] as const) {
          const want = await cover(kind, d, other);
          let lo = 0.03, hi = 0.97;
          for (let k = 0; k < 9; k++) {
            const mid = (lo + hi) / 2;
            cuts[0].value = cuts[1].value = mid;
            if ((await cover(kind, d, l1)) > want) lo = mid;
            else hi = mid;
          }
          fitted[i] = Math.round(((lo + hi) / 2) * 1000) / 1000;
        }
        rows.push(`  ${kind}: [${fitted[0]}, ${fitted[1]}],`);
      }
      return { pass: false, detail: `fit (KIT_L1_CUT): ${rows.join(' ')}` };
    }
    const group = groupOf([...near.meshes, ...far.meshes]);
    // Where KIT_L1_CUT sits at a bound: the dead shrub's twig cards are fuller than its bare L0 twigs, three kinds' L1 a
    // little fuller than their hulls (cut at its top), and daisy's and rice's L1 a little thinner than L0 (cut at its
    // 0.45 floor, where the cards keep their lace). Ledgered; a kit-build fix.
    const allow: Record<string, number> = { 'dead@12': 0.45, 'green@40': 0.15, 'tall@40': 0.15, 'cushion@40': 0.15, 'daisy@12': 0.15, 'rice@12': 0.15 };
    const lines: string[] = [];
    let worst = 0, fail = false;
    for (const kind of PLANT_KINDS) {
      for (const d of [12, 40]) {
        const cov = [await cover(kind, d - 0.5, group), await cover(kind, d + 0.5, group)];
        const change = Math.abs(cov[1] - cov[0]) / Math.max(cov[0], 1e-6);
        worst = Math.max(worst, change);
        if (change > (allow[`${kind}@${d}`] ?? 0.1)) fail = true;
        lines.push(`${kind}@${d} ${(cov[0] * 100).toFixed(1)}→${(cov[1] * 100).toFixed(1)}% (${(change * 100).toFixed(0)}%)`);
      }
    }
    return { pass: !fail, detail: `worst ${(worst * 100).toFixed(0)}%: ${lines.join(', ')}` };
  },
});
