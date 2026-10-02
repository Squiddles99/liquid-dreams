import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, vec3, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { CRITICAL_ANGLE_RAD, alongPath, fresnelFromInside, throughWater, waterColourAtDepth } from './underwaterOptics';
import { alongPathNode, fresnelFromInsideNode, throughWaterNode, waterColourAtDepthNode } from './underwaterNodes';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { Sky } from '../sky/Sky';
import { createWaterOpticsUniforms } from './waterShading';
import { DEFAULT_WATER_OPTICS } from './waterOptics';
import { belowBedNode, reefInFrontNode, seenThroughWaterNode, waterVolumeColourNode } from './WaterVolume';
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

registerSelfTest({
  name: 'underwater: GPU throughWater matches the CPU (the path blend, faded into the water as the reef is)',
  async run(renderer) {
    const ss = [0, 5, 20, 56, 60, 68, 75, 79.9, 80, 120, 180, 250];
    const n = ss.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(ss.flatMap((v) => [v, 0, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const up = vec3(0.001, 0.01, 0.02), ext = vec3(0.45, 0.07, 0.02), end = vec3(5.0, 4.0, 3.0);
    const pass = Fn(() => {
      output.element(instanceIndex).assign(vec4(throughWaterNode(end, up, ext, input.element(instanceIndex).x), 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    ss.forEach((v, i) => {
      const c = throughWater([5, 4, 3], [0.001, 0.01, 0.02], [0.45, 0.07, 0.02], v);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(out[i * 4 + k] - c[k]) / Math.max(c[k], 1e-3));
    });
    return { pass: worst < 2e-3, detail: `${n} distances 0–250 m; worst relative error ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'underwater: a sunlit rock 180 m off shows as the water (not a bright dot), one 10 m off shows; buried points are below the bed',
  async run(renderer) {
    const sky = new Sky();
    const sun = sunForConditions(DEFAULT_CONDITIONS);
    sky.update(renderer, new THREE.Vector3(...sun.direction), 1);
    const seabed = new Seabed(buildBathymetry());
    const u = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
    // Andrew's 2026-10-02 moment: the eye 3.6 m down at (13.1, 9.0) looking east to the shore, ~180 m off.
    const eye = vec3(13.09, -3.56, 9.0);
    // [x, y-or-offset, z, kind]: kind 0 = a sunlit rock point at that position; 1 = a point `offset` above the bed at (x, z).
    const cases: [number, number, number, number][] = [
      [193.09, -0.4, 9.0, 0], [23.09, -2.0, 9.0, 0],
      [190.0, -0.3, 9.0, 1], [190.0, 0.3, 9.0, 1], [205.0, -0.2, 9.0, 1], [205.0, 0.2, 9.0, 1], [0.0, -0.5, 0.0, 1], [0.0, 0.5, 0.0, 1],
    ];
    const n = cases.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flat()), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const sunlit = vec3(5.0, 4.0, 3.0);
    const pass = Fn(() => {
      const c = input.element(instanceIndex);
      const atBed = vec3(c.x, seabed.bedHeightNode(c.xz).add(c.y), c.z);
      const seen = seenThroughWaterNode(eye, vec3(c.x, c.y, c.z), sunlit, seabed, sky, u);
      const buried = select(belowBedNode(atBed, seabed), float(1.0), float(0.0));
      const row: any = select(c.w.lessThan(0.5), vec4(seen, 1.0), vec4(buried, 0.0, 0.0, 1.0)); // three typings gap: select() is typed narrower than its result
      output.element(instanceIndex).assign(row);
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    // The water's own colour at the eye (straight up: no reef), what the volume shows beyond the reach.
    const wAttr = new THREE.StorageBufferAttribute(new Float32Array(4), 4);
    const wOut = storage(wAttr, 'vec4', 1);
    renderer.compute(Fn(() => { wOut.element(0).assign(vec4(waterVolumeColourNode(eye, vec3(0.0, 1.0, 0.0), seabed, sky, u), 1.0)); })().compute(1) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const water = Array.from(new Float32Array(await renderer.getArrayBufferAsync(wAttr)).slice(0, 3));
    const rgb = (i: number): number[] => [out[i * 4], out[i * 4 + 1], out[i * 4 + 2]];
    const close = (c: number[]): boolean => c.every((v, k) => Math.abs(v - water[k]) <= 1e-3 * Math.max(water[k], 1e-4));
    const finite = out.every(Number.isFinite);
    const far = close(rgb(0)), near = !close(rgb(1));
    const buried = [2, 4, 6].every((i) => out[i * 4] === 1), clear = [3, 5, 7].every((i) => out[i * 4] === 0);
    return {
      pass: finite && far && near && buried && clear,
      detail: `water ${water.map((v) => v.toExponential(2))}; rock 180 m ${rgb(0).map((v) => v.toExponential(2))} (= water ${far}); 10 m ${rgb(1).map((v) => v.toExponential(2))} (shows ${near}); below the bed ${buried}, above it ${clear}`,
    };
  },
});
