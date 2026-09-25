import type * as THREE from 'three/webgpu';
import { fmt, registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from './atmosphereParams';
import { createAtmosphereUniforms } from './atmosphereNodes';
import { AtmosphereLuts } from './AtmosphereLuts';

const DEG = Math.PI / 180;

async function skyLightAt(renderer: THREE.WebGPURenderer, luts: AtmosphereLuts, elevationDeg: number) {
  luts.sunElevation.value = elevationDeg * DEG;
  luts.renderDynamic(renderer);
  const f = new Float32Array(await renderer.getArrayBufferAsync(luts.skyLightAttr));
  return { sky: f.slice(0, 3), sun: f.slice(4, 7) };
}

function makeLuts(renderer: THREE.WebGPURenderer): AtmosphereLuts {
  const luts = new AtmosphereLuts(createAtmosphereUniforms(DEFAULT_ATMOSPHERE));
  luts.renderStatic(renderer);
  return luts;
}

registerSelfTest({
  name: 'sky: sun at 30° is reddened, sky is blue',
  async run(renderer) {
    const { sky, sun } = await skyLightAt(renderer, makeLuts(renderer), 30);
    const pass = sun[0] > sun[2] && sun[2] > 0 && sun[0] < DEFAULT_ATMOSPHERE.sunIlluminance && sky[2] > sky[0] && sky[0] > 0;
    return { pass, detail: `sun=${fmt(sun)} sky=${fmt(sky)}` };
  },
});

registerSelfTest({
  name: 'sky: sun at -60° is finite and dark',
  async run(renderer) {
    const luts = makeLuts(renderer);
    const noon = await skyLightAt(renderer, luts, 60);
    const night = await skyLightAt(renderer, luts, -60);
    const finite = [...night.sky, ...night.sun].every(Number.isFinite);
    const pass = finite && night.sun.every((v) => v <= 1e-6) && night.sky[2] < noon.sky[2] * 0.01;
    return { pass, detail: `night sun=${fmt(night.sun)} sky=${fmt(night.sky)} noon sky=${fmt(noon.sky)}` };
  },
});

registerSelfTest({
  name: 'sky: higher sun gives more sky light',
  async run(renderer) {
    const luts = makeLuts(renderer);
    const low = await skyLightAt(renderer, luts, 2);
    const high = await skyLightAt(renderer, luts, 60);
    return { pass: high.sky[1] > low.sky[1] && high.sun[1] > low.sun[1], detail: `2°=${fmt(low.sky)} 60°=${fmt(high.sky)}` };
  },
});
