import * as THREE from 'three/webgpu';
import { Fn, cos, float, fract, instanceIndex, select, sin, sqrt, storage, texture, texture3D, uint, vec2, vec3 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { Sky } from '../sky/Sky';
import { cloudDensity, lowLayer } from './cloudModel';
import { Clouds } from './Clouds';
import { CloudTextures, SHAPE_SIZE, WEATHER_SIZE } from './CloudTextures';
import { WEATHER_PRESETS, type WeatherConditions } from './weather';

type N = any;

/** Read `count` values from a compute pass that writes value(i) (a float node) for each i. */
async function readFloats(renderer: THREE.WebGPURenderer, count: number, value: (i: N) => N): Promise<Float32Array> {
  const attr = new THREE.StorageBufferAttribute(new Float32Array(count), 1);
  const out = storage(attr, 'float', count);
  renderer.compute(Fn(() => { out.element(instanceIndex).assign(value(instanceIndex)); })().compute(count) as THREE.ComputeNode);
  return new Float32Array(await renderer.getArrayBufferAsync(attr));
}

let shared: CloudTextures | null = null;
function textures(renderer: THREE.WebGPURenderer): CloudTextures {
  if (!shared) shared = new CloudTextures();
  shared.build(renderer);
  return shared;
}

const mean = (a: ArrayLike<number>): number => Array.from(a).reduce((s, v) => s + v, 0) / a.length;
const std = (a: ArrayLike<number>): number => { const m = mean(a); return Math.sqrt(mean(Array.from(a, (v) => (v - m) ** 2))); };

registerSelfTest({
  name: 'clouds: the shape noise varies (mean and spread)',
  async run(renderer) {
    const t = textures(renderer);
    // 16³ points through the volume, off the texel grid.
    const v = await readFloats(renderer, 4096, (i: N) => {
      const c = vec3(float(i.mod(uint(16))), float(i.div(uint(16)).mod(uint(16))), float(i.div(uint(256)))).add(0.37).div(16.0);
      return texture3D(t.shape, c, float(0)).x;
    });
    const m = mean(v), s = std(v);
    return { pass: m > 0.1 && m < 0.9 && s > 0.1 && v.every(Number.isFinite), detail: `mean ${m.toFixed(3)} std ${s.toFixed(3)} min ${Math.min(...v).toFixed(3)} max ${Math.max(...v).toFixed(3)}` };
  },
});

registerSelfTest({
  name: 'clouds: the shape noise tiles (no step across its seam)',
  async run(renderer) {
    const t = textures(renderer);
    const n = SHAPE_SIZE;
    // Differences between x-neighbours at texel centres: across the seam (x = n−1 → 0) and inside (x = n/2−1 → n/2).
    const diffs = (x0: number) => readFloats(renderer, n * n, (i: N) => {
      const y = float(i.mod(uint(n))).add(0.5).div(n), z = float(i.div(uint(n))).add(0.5).div(n);
      const a = texture3D(t.shape, vec3((x0 + 0.5) / n, y, z), float(0)).x;
      const b = texture3D(t.shape, vec3(((x0 + 1) % n + 0.5) / n, y, z), float(0)).x;
      return a.sub(b).abs();
    });
    const seam = mean(await diffs(n - 1)), inside = mean(await diffs(n / 2 - 1));
    return { pass: seam < inside * 1.5 + 0.01, detail: `mean |Δ| across the seam ${seam.toFixed(4)}, inside ${inside.toFixed(4)}` };
  },
});

registerSelfTest({
  name: 'clouds: a new seed moves the weather map',
  async run(renderer) {
    const t = textures(renderer);
    const sample = () => readFloats(renderer, 1024, (i: N) => {
      const uv = vec2(float(i.mod(uint(32))), float(i.div(uint(32)))).add(0.5).div(32.0);
      return texture(t.weather, uv).level(float(0)).x;
    });
    t.setSeed(1); t.build(renderer);
    const a = await sample();
    t.setSeed(2); t.build(renderer);
    const b = await sample();
    const moved = mean(Array.from(a, (v, i) => Math.abs(v - b[i])));
    const spread = std(a);
    const sorted = Array.from(b).sort((x, y) => x - y);
    const q = [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => sorted[Math.floor(p * (sorted.length - 1))].toFixed(2)).join(' ');
    return { pass: moved > 0.05 && spread > 0.1, detail: `mean |Δ| between seeds ${moved.toFixed(3)}, coverage spread ${spread.toFixed(3)}, deciles 10/25/50/75/90: ${q} (${WEATHER_SIZE}² map)` };
  },
});

// ---- The sky map (plan Task 4) ----

const DEG = Math.PI / 180;
/** The default morning's sun (08:15, 15 Jul): ~8.5° up, east-north-east. */
const MORNING_SUN = new THREE.Vector3(0.827, 0.149, -0.542).normalize();

interface SkyRig { sky: Sky; clouds: Clouds }
let rig: SkyRig | null = null;
async function skyRig(renderer: THREE.WebGPURenderer, w: Readonly<WeatherConditions>, sun = MORNING_SUN): Promise<SkyRig> {
  if (!rig) { const sky = new Sky(); rig = { sky, clouds: new Clouds(sky) }; }
  rig.sky.update(renderer, sun, 2);
  rig.clouds.setWeather(w, 2002);
  rig.clouds.invalidate();
  rig.clouds.update(renderer, sun, new THREE.Vector3(-25, 2, 45), 30);
  rig.sky.update(renderer, sun, 2);
  return rig;
}

/** Directions spread over the upper hemisphere (elevation 0.5°–89°, all azimuths). */
const dirNode = (i: N, count: number): N => {
  const f = float(i).add(0.5).div(count);
  const el = f.mul(88.5 * DEG).add(0.5 * DEG), az = float(i).mul(2.399963); // golden-angle azimuths
  return vec3(cos(el).mul(cos(az)), sin(el), cos(el).mul(sin(az)));
};

registerSelfTest({
  name: 'clouds: a clear sky is exactly the atmosphere (map empty, radiance unchanged)',
  async run(renderer) {
    const { sky } = await skyRig(renderer, WEATHER_PRESETS.clear);
    const n = 64;
    const both = await readFloats(renderer, n * 2, (i: N) => {
      const d = dirNode(i.mod(uint(n)), n);
      const v: N = select(i.lessThan(uint(n)), sky.radiance(d, true), sky.radiance(d)).sub(sky.atmosphereRadiance(d)).abs();
      return v.x.add(v.y).add(v.z).div(sky.atmosphereRadiance(d).x.add(1e-6));
    });
    const worst = Math.max(...both);
    return { pass: worst <= 1e-4, detail: `worst relative difference ${worst.toExponential(2)} over ${n} directions, sharp and small maps` };
  },
});

registerSelfTest({
  name: 'clouds: overcast hides the zenith and is grey, not black or blown',
  async run(renderer) {
    const clearZenith = await (async () => {
      const { sky } = await skyRig(renderer, WEATHER_PRESETS.clear);
      return readFloats(renderer, 3, (i: N) => sky.radiance(vec3(0, 1, 0), true).element(i));
    })();
    const { sky } = await skyRig(renderer, WEATHER_PRESETS.overcast);
    const zenith = await readFloats(renderer, 4, (i: N) => {
      const c = texture(sky.skyMap, vec2(0.5, 0.995)).level(float(0));
      return select(i.lessThan(uint(3)), sky.radiance(vec3(0, 1, 0), true).element(i), float(1.0).sub(c.a));
    });
    const lum = (v: ArrayLike<number>): number => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const ratio = lum(zenith) / lum(clearZenith);
    const T = zenith[3];
    // At a low sun a clear zenith is a dim deep blue, and an overcast zenith 1–2.5× brighter (CIE overcast: Lz ≈ 0.41·E_h).
    return { pass: T < 0.05 && ratio > 0.2 && ratio < 3, detail: `zenith A ${T.toFixed(3)}, luminance ${ratio.toFixed(2)}× the clear zenith` };
  },
});

registerSelfTest({
  name: 'clouds: scattered covers a fair part of the sky, not all of it',
  async run(renderer) {
    const { sky } = await skyRig(renderer, WEATHER_PRESETS.scattered);
    const n = 4096;
    // Above 15° (below it, the far cloud stacks up and fades): how much of the sky the cloud hides.
    const a = await readFloats(renderer, n, (i: N) => {
      const f = float(i).add(0.5).div(n);
      const el = f.mul(74 * DEG).add(15 * DEG), az = float(i).mul(2.399963);
      const uv = vec2(fract(az.div(2 * Math.PI)), sqrt(el.div(Math.PI / 2)));
      return texture(sky.skyMap, uv).level(float(0)).w;
    });
    const covered = a.filter((v) => v > 0.5).length / n;
    return { pass: covered > 0.1 && covered < 0.55, detail: `${(covered * 100).toFixed(0)}% of the sky above 15° is cloud (A > 0.5)` };
  },
});

registerSelfTest({
  name: 'clouds: the sky map is finite for any sun (night, dawn, day)',
  async run(renderer) {
    const bad: string[] = [];
    for (const elDeg of [-20, 2, 30, 80]) {
      const el = elDeg * DEG;
      const sun = new THREE.Vector3(Math.cos(el), Math.sin(el), 0.3).normalize();
      const { sky } = await skyRig(renderer, WEATHER_PRESETS.showers, sun);
      const n = 2048;
      const v = await readFloats(renderer, n, (i: N) => {
        const c = texture(sky.skyMap, vec2(fract(float(i).mul(0.618034)), float(i).add(0.5).div(n))).level(float(0));
        return c.x.add(c.y).add(c.z).add(c.w);
      });
      if (!v.every(Number.isFinite)) bad.push(`${elDeg}°`);
    }
    return { pass: bad.length === 0, detail: bad.length ? `non-finite at sun ${bad.join(', ')}` : 'finite at sun −20°, 2°, 30°, 80°' };
  },
});

registerSelfTest({
  name: 'clouds: the GPU density is the CPU reference (noise held flat)',
  async run(renderer) {
    const { clouds } = await skyRig(renderer, WEATHER_PRESETS.scattered);
    const u = clouds.u;
    u.flatNoise.value = 1; u.flatCoverage.value = 0.9; u.flatShape.value = 0.3; u.flatDetail.value = 0.2;
    const heights = [950, 1100, 1400, 1800, 2300];
    const gpu = await readFloats(renderer, heights.length, (i: N) => {
      let h: N = float(heights[0]);
      for (let k = 1; k < heights.length; k++) h = select(i.equal(uint(k)), float(heights[k]), h);
      return clouds.field.low(vec2(120, -340), h, true);
    });
    u.flatNoise.value = 0;
    const w = WEATHER_PRESETS.scattered, layer = lowLayer(w);
    const cpu = heights.map((h) => cloudDensity((h - layer.baseM) / (layer.topM - layer.baseM), w.convection, 0.9, 0.3, 0.2, w.lowCover));
    const worst = Math.max(...cpu.map((c, i) => Math.abs(c - gpu[i])));
    return { pass: worst < 1e-3 && cpu.some((c) => c > 0.05), detail: `cpu ${cpu.map((c) => c.toFixed(3)).join(' ')} gpu ${Array.from(gpu, (c) => c.toFixed(3)).join(' ')}` };
  },
});
