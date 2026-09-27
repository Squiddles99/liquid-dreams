import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, vec3, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { CRITICAL_ANGLE_RAD, alongPath, fresnelFromInside, waterColourAtDepth } from './underwaterOptics';
import { alongPathNode, fresnelFromInsideNode, waterColourAtDepthNode } from './underwaterNodes';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { Sky } from '../sky/Sky';
import { createWaterOpticsUniforms } from './waterShading';
import { DEFAULT_WATER_OPTICS } from './waterOptics';
import { reefInFrontNode, waterVolumeColourNode } from './WaterVolume';
import { sunForConditions } from '../astro/sunForConditions';

registerSelfTest({
  name: 'underwater: GPU Fresnel from inside, water colour and path blend match the CPU (sweep across the window rim)',
  async run(renderer) {
    // Incidence angles from straight up to beyond the rim, densest around it.
    const angles: number[] = [];
    for (let a = 0; a <= 80; a += 2) angles.push((a * Math.PI) / 180);
    for (let k = -8; k <= 8; k++) angles.push(CRITICAL_ANGLE_RAD + k * 1e-3);
    const n = angles.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(angles.flatMap((a, i) => [Math.cos(a), i * 0.7, i * 3.1, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 3 * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n * 3);
    const up = vec3(0.001, 0.01, 0.02), ext = vec3(0.45, 0.07, 0.02), end = vec3(1.0, 2.0, 3.0);
    const pass = Fn(() => {
      const p = input.element(instanceIndex);
      output.element(instanceIndex.mul(3)).assign(vec4(fresnelFromInsideNode(p.x), 0.0, 0.0, 0.0));
      output.element(instanceIndex.mul(3).add(1)).assign(vec4(waterColourAtDepthNode(up, ext, p.y), 0.0));
      output.element(instanceIndex.mul(3).add(2)).assign(vec4(alongPathNode(end, up, ext, p.z), 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worstR = 0, worstC = 0, finite = true;
    angles.forEach((a, i) => {
      const g = out.slice(i * 12, i * 12 + 12);
      if (!g.every(Number.isFinite)) finite = false;
      worstR = Math.max(worstR, Math.abs(g[0] - fresnelFromInside(Math.cos(a))));
      const c = waterColourAtDepth([0.001, 0.01, 0.02], [0.45, 0.07, 0.02], i * 0.7);
      const pth = alongPath([1, 2, 3], [0.001, 0.01, 0.02], [0.45, 0.07, 0.02], i * 3.1);
      for (let k = 0; k < 3; k++) worstC = Math.max(worstC, Math.abs(g[4 + k] - c[k]) / Math.max(c[k], 1e-6), Math.abs(g[8 + k] - pth[k]));
    });
    return { pass: finite && worstR < 2e-3 && worstC < 2e-3, detail: `${n} angles (0–80°, ±8 mrad about the rim); all finite ${finite}; worst |ΔR| ${worstR.toExponential(2)}; worst colour/path error ${worstC.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'underwater: the water volume is finite everywhere and shows the reef below a diver',
  async run(renderer) {
    const sky = new Sky();
    const sun = sunForConditions(DEFAULT_CONDITIONS);
    sky.update(renderer, new THREE.Vector3(...sun.direction), 1);
    const seabed = new Seabed(buildBathymetry());
    const u = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
    const cases: { o: [number, number, number]; d: [number, number, number]; tag: string }[] = [
      { o: [0, -3, 0], d: [0, -1, 0], tag: 'down at the reef' },
      { o: [0, -3, 0], d: [0.7071, -0.7071, 0], tag: '45° down' },
      { o: [0, -3, 0], d: [1, 0, 0], tag: 'along' },
      { o: [0, -3, 0], d: [0, 1, 0], tag: 'up' },
      { o: [0, -40, 0], d: [0, -1, 0], tag: 'inside the reef' },
      { o: [0, -3, -900], d: [0, -1, 0], tag: 'deep water' },
      // The mirror's reflected ray starts at the surface point, which on a crest is above the still water.
      { o: [0, 0.8, 0], d: [0.3, -0.954, 0], tag: 'from a crest, down' },
      { o: [0, 0.8, 0], d: [0, 1, 0], tag: 'from a crest, up (water)' },
    ];
    const n = cases.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap((c) => [...c.o, 0, ...c.d, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n * 2).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const o = input.element(instanceIndex.mul(2)).xyz, d = input.element(instanceIndex.mul(2).add(1)).xyz;
      output.element(instanceIndex).assign(vec4(waterVolumeColourNode(o, d, seabed, sky, u), 1.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const rows = cases.map((c, i) => ({ tag: c.tag, rgb: [out[i * 4], out[i * 4 + 1], out[i * 4 + 2]] }));
    const finite = rows.every((r) => r.rgb.every((v) => Number.isFinite(v) && v >= 0));
    const differs = rows[0].rgb.some((v, k) => Math.abs(v - rows[3].rgb[k]) > 1e-4 * Math.max(rows[3].rgb[k], 1e-3));
    // From a crest the reef below still shows (it read as flat water when the march's reach was capped by a negative distance to the still surface).
    const fromCrest = rows[6].rgb[1] > 2 * rows[7].rgb[1];
    return { pass: finite && differs && fromCrest, detail: rows.map((r) => `${r.tag} ${r.rgb.map((v) => v.toExponential(2)).join(',')}`).join('; ') };
  },
});

registerSelfTest({
  name: 'underwater: a reef wall at or above eye level shows (level and rising rays), and hides the surface behind it',
  async run(renderer) {
    const sky = new Sky();
    const sun = sunForConditions(DEFAULT_CONDITIONS);
    sky.update(renderer, new THREE.Vector3(...sun.direction), 1);
    const seabed = new Seabed(buildBathymetry());
    const u = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
    // 9 m deep over the 13 m shelf, 20 m west of the ledge, which rises to about 6 m deep: level and rising rays east meet
    // the wall; straight up meets only water (the reference). The last row asks whether the reef hides a surface point
    // 30 m away along a ray rising 8° east (sentinel colour 100 in, the reef's colour out when it does).
    const eye: [number, number, number] = [-20, -9, 0];
    const dirs: [number, number, number][] = [[1, 0, 0], [0.99, 0.14, 0], [0, 1, 0], [0.99, 0.14, 0]];
    const n = dirs.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(dirs.flatMap((d) => [...d, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const o = vec3(...eye);
    const pass = Fn(() => {
      const d = input.element(instanceIndex).xyz;
      const volume = waterVolumeColourNode(o, d, seabed, sky, u);
      const hidden = reefInFrontNode(o, d, float(30.0), vec3(100.0), seabed, sky, u);
      const chosen: any = select(instanceIndex.equal(3), hidden, volume); // three typings gap: select() is typed narrower than its result
      output.element(instanceIndex).assign(vec4(chosen, 1.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const rgb = (i: number): number[] => [out[i * 4], out[i * 4 + 1], out[i * 4 + 2]];
    const water = rgb(2);
    const differs = (c: number[]): boolean => c.some((v, k) => Math.abs(v - water[k]) > 0.05 * Math.max(water[k], 1e-3));
    const finite = [0, 1, 2, 3].every((i) => rgb(i).every((v) => Number.isFinite(v) && v >= 0));
    const level = differs(rgb(0)), rising = differs(rgb(1)), hides = rgb(3).every((v) => v < 50);
    return {
      pass: finite && level && rising && hides,
      detail: `level ${rgb(0).map((v) => v.toExponential(2))} (wall ${level}); rising ${rgb(1).map((v) => v.toExponential(2))} (wall ${rising}); up (water) ${water.map((v) => v.toExponential(2))}; surface behind the reef ${rgb(3).map((v) => v.toExponential(2))} (hidden ${hides})`,
    };
  },
});
