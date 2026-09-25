# Phase 0 "First Light" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You float at The Womb's lineup in open Indian Ocean water on a winter morning, with a physically based sky and sun, a GPU FFT ocean, lineup and free cameras, and developer tools. This is the foundation that Phases 1–5 build on.

**Architecture:** A single `Conditions` object (date, time, swell, wind, tide, seed) drives everything. Pure TypeScript modules (`conditions/`, `astro/`, the spectrum maths, camera maths, moment links) are unit-tested with Vitest. GPU work uses Three.js `WebGPURenderer` with TSL compute: atmosphere lookup tables (Hillaire 2020) and a three-cascade FFT ocean (Tessendorf) whose displacement and derivative textures feed a custom water material. A small GPU readback floats the lineup camera on the real water surface. GPU code is verified by in-browser self-tests (`?selftest`) and by named reference moments (`#ref=<name>`) screenshotted in Claude's browser pane.

**Tech Stack:** TypeScript 7.0.2, Vite 8.3.1, Vitest 5.0.2, three 0.186.1 (`three/webgpu`, `three/tsl`, `three/addons`), Tweakpane 4.0.5, stats-gl 4.2.3, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-25-liquid-dreams-first-light-design.md`

## Global Constraints

- Versions are pinned exactly (`--save-exact`): three `0.186.1`, @types/three `0.186.0`, vite `8.3.1`, typescript `7.0.2`, vitest `5.0.2`, tweakpane `4.0.5`, @tweakpane/core `2.0.5`, stats-gl `4.2.3`, @webgpu/types `0.1.74`. If `typescript@7.0.2` cannot type-check the project, fall back to the newest `6.x`; don't unpin anything else.
- WebGPU only. There is no WebGL fallback: if three.js falls back to WebGL, show the "needs WebGPU" overlay.
- Units: metres, seconds; angles in **degrees** at interfaces (Conditions, moment links, camera poses) and radians internally.
- World axes: **+X = east, +Y = up, +Z = south** (north is −Z). Origin = the Womb's peak (−33.8972366, 114.9832508); y = 0 = mean sea level.
- Directions in `Conditions` are the direction swell or wind **comes from**, in degrees true. Camera yaw is a compass bearing (0 = looking north, 90 = looking east).
- Time: `Conditions.date` + `timeOfDay` are local **AWST (UTC+8, no DST)**.
- Surfer feet are the canonical swell unit; Phase 0 uses `Hs = 0.4 m × sizeFt` (one function, `surferFeetToHs`).
- Defaults: date `2026-07-15`, time `08:15` (8.25 h), swell 4 ft / 15 s / from 225°, wind 3 m/s from 80°, tide 0, seed 2002.
- Performance: 60 fps at native resolution on the RTX 4060 Laptop GPU, with GPU time ≤ ~8 ms per frame.
- `reference/` is git-ignored and must never be committed.
- Every random process is seeded from `Conditions.seed`: the same conditions, seed and sim time give the same ocean.
- TSL files use a local `type N = any;` alias for node parameters (TSL graphs are dynamically typed). Anywhere else, if `@types/three` rejects a valid three.js call, cast only that expression and add a `// three typings gap` comment.
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Extreme but valid conditions** (12 ft at 25 s with 30 m/s wind, set from the panel or a link) must not produce NaN or infinite values in the ocean. Pinned by the `extreme conditions stay finite` test in Task 4.
2. **Night and midnight times** (sun far below the horizon, `timeOfDay` 0 or 23.999) must not produce NaN in the sky or a runaway exposure. Pinned by the `sun at -60°` self-test in Task 7 and the `deep night` exposure test in Task 9.
3. **Minimised or zero-size windows** must not create 0×0 render targets. Pinned by the `viewportSize` tests in Task 1.
4. **Hand-edited, stale or unknown moment links** (`#m=` garbage, a future version, `#ref=unknown`) must fall back to defaults. Pinned by the `momentFromHash` tests in Task 5.
5. **Typing in the dev panel** (for example "c" in the date field) must not toggle the camera or trigger hotkeys. Pinned by the `shouldIgnoreKeyTarget` tests in Task 6.

---

## File Structure

```
liquid-dreaming/
  package.json, tsconfig.json, vite.config.ts, index.html, README.md
  .claude/launch.json                 dev-server entry for Claude's browser pane
  src/
    main.ts                           bootstrap: WebGPU check → self-tests (?selftest) or App
    style.css
    app/
      App.ts                          wires modules; frame loop
      clock.ts (+test)                sim clock, frame-dt clamp, viewport size guard
      overlay.ts                      full-screen messages
      webgpuSupport.ts (+test)        capability check
    conditions/
      types.ts, defaults.ts           Conditions type, defaults, Womb location
      sanitize.ts (+test)             clamp/validate untrusted input
      rng.ts (+test)                  seeded RNG, gaussian, seed derivation
      directions.ts (+test)           compass bearings → world XZ vectors
      time.ts (+test)                 AWST → UTC
      units.ts (+test)                surfer feet → Hs
    astro/
      sunPosition.ts (+test)          NOAA solar position; world sun direction
      sunForConditions.ts (+test)     Conditions → sun az/el/direction
    sky/
      atmosphereParams.ts (+test)     physical constants, tunables, sea-level extinction
      lutMapping.ts (+test)           pure LUT parameterisations (mirrored in TSL)
      atmosphereNodes.ts              TSL: uniforms, medium, phase functions, mappings
      AtmosphereLuts.ts               TSL compute: transmittance, multi-scattering, sky-view, sky light
      Sky.ts                          facade: update(sun), radiance(dir), aerial perspective
      SkyDome.ts                      sky sphere + sun disk
      sky.selftest.ts                 GPU self-tests
    ocean/
      spectrum.ts (+test)             dispersion, JONSWAP, spreading, cascades, h0 generation
      fft.ts                          TSL shared-memory Stockham inverse FFT
      fft.selftest.ts
      OceanSimulation.ts              evolve → FFT → assemble displacement/derivative/foam
      ocean.selftest.ts
      polarGrid.ts (+test)            camera-centred ocean mesh
      cascadeFades.ts (+test)         per-cascade distance fades (TS + TSL)
      waterOptics.ts (+test)          pure water optics (albedo, transmission, slope variance)
      waterShading.ts                 TSL water shading
      OceanSurface.ts                 mesh + material
      HeightProbe.ts                  GPU height sampling + async readback
      probe.selftest.ts
    camera/
      look.ts, movement.ts, floatSpring.ts, lineup.ts (+tests)
      Input.ts (+test for key-target filter)
      CameraRig.ts                    lineup/free modes, three camera
    render/
      createRenderer.ts
      exposure.ts (+test)
      PicturePipeline.ts              HDR → exposure → bloom → AgX → grade → sRGB
    dev/
      momentLink.ts (+test)           encode/decode moment links, #ref= / #m=
      referenceMoments.ts (+test)     named moments from the spec
      selfTest.ts                     self-test registry + report
      selfTests.ts                    imports all *.selftest.ts
      perf.ts (+test)                 adapter summary, integrated-GPU detection, stats overlay
      DevPanel.ts                     Tweakpane bindings
      hotkeys.ts                      L / P / K / H
```

---

### Task 1: Project scaffold, WebGPU bootstrap, clock

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `README.md`, `.claude/launch.json`, `src/style.css`, `src/main.ts`
- Create: `src/app/webgpuSupport.ts`, `src/app/webgpuSupport.test.ts`, `src/app/clock.ts`, `src/app/clock.test.ts`, `src/app/overlay.ts`, `src/app/App.ts`, `src/render/createRenderer.ts`

**Interfaces:**
- Produces: `checkWebGpuSupport(nav) → Promise<WebGpuSupport>`, `WEBGPU_HELP`; `SimClock { simTime; paused; tick(realDtS): number; setTime(t) }`, `clampFrameDt(dtS)`, `viewportSize(w, h) → { width, height }`; `showOverlay(title, message, actions?)`, `hideOverlay()`; `createRenderer(container) → Promise<THREE.WebGPURenderer>`; `App` (constructor `(renderer, container)`, `start()`).

- [ ] **Step 1: Initialise npm and install pinned dependencies**

```bash
npm init -y
npm install --save-exact three@0.186.1 tweakpane@4.0.5 stats-gl@4.2.3
npm install --save-exact --save-dev @types/three@0.186.0 @tweakpane/core@2.0.5 @webgpu/types@0.1.74 typescript@7.0.2 vite@8.3.1 vitest@5.0.2
```

Then edit `package.json` so that its top-level fields read (keep the generated dependency blocks):

```json
{
  "name": "liquid-dreams",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Add config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "@webgpu/types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
```

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "liquid-dreams", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Liquid Dreams</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:

```css
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; font-family: system-ui, sans-serif; }
#app { width: 100vw; height: 100vh; }
#app canvas { display: block; }
.overlay {
  position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 24px; background: rgba(4, 18, 32, 0.92); color: #e8f1f8; text-align: center; z-index: 10;
}
.overlay h1 { margin: 0; font-size: 22px; font-weight: 600; }
.overlay p { margin: 0; max-width: 640px; line-height: 1.5; white-space: pre-line; }
.overlay button { padding: 8px 16px; border-radius: 6px; border: 1px solid #7fb3d5; background: transparent; color: inherit; cursor: pointer; }
.banner { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); padding: 8px 14px; border-radius: 6px;
  background: rgba(120, 60, 0, 0.9); color: #fff; font-size: 13px; z-index: 9; max-width: 80vw; }
```

`README.md`:

````markdown
# Liquid Dreams

A surfing game built for the love of it. The first (and only) break is **The Womb**, Ellensbrook, WA.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
```

- `#ref=<name>` loads a named reference moment (see `src/dev/referenceMoments.ts`).
- `?selftest` runs the GPU self-tests instead of the app.
- Needs a WebGPU browser (current Chrome or Edge). On hybrid-GPU laptops, set the browser to "High performance" in Windows Graphics settings.

Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.
````

- [ ] **Step 3: Write failing tests for WebGPU support and the clock**

`src/app/webgpuSupport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkWebGpuSupport } from './webgpuSupport';

describe('checkWebGpuSupport', () => {
  it('reports missing navigator.gpu', async () => {
    const r = await checkWebGpuSupport({});
    expect(r.ok).toBe(false);
  });
  it('reports a null adapter', async () => {
    const r = await checkWebGpuSupport({ gpu: { requestAdapter: async () => null } });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('no GPU adapter') });
  });
  it('reports a thrown adapter request', async () => {
    const r = await checkWebGpuSupport({ gpu: { requestAdapter: async () => { throw new Error('boom'); } } });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('boom') });
  });
  it('accepts a real adapter and asks for high performance', async () => {
    let asked: unknown;
    const r = await checkWebGpuSupport({ gpu: { requestAdapter: async (o) => { asked = o; return {}; } } });
    expect(r).toEqual({ ok: true });
    expect(asked).toEqual({ powerPreference: 'high-performance' });
  });
});
```

`src/app/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_FRAME_DT_S, SimClock, clampFrameDt, viewportSize } from './clock';

describe('SimClock', () => {
  it('advances by real dt', () => {
    const c = new SimClock();
    expect(c.tick(0.016)).toBeCloseTo(0.016);
    expect(c.simTime).toBeCloseTo(0.016);
  });
  it('clamps huge dt (tab was in background)', () => {
    const c = new SimClock();
    expect(c.tick(12)).toBe(MAX_FRAME_DT_S);
  });
  it('ignores negative dt', () => {
    const c = new SimClock();
    expect(c.tick(-1)).toBe(0);
    expect(c.simTime).toBe(0);
  });
  it('does not advance while paused', () => {
    const c = new SimClock();
    c.paused = true;
    expect(c.tick(0.02)).toBe(0);
    expect(c.simTime).toBe(0);
  });
  it('setTime clamps to >= 0', () => {
    const c = new SimClock();
    c.setTime(-5);
    expect(c.simTime).toBe(0);
    c.setTime(42.5);
    expect(c.simTime).toBe(42.5);
  });
});

describe('clampFrameDt', () => {
  it('clamps to [0, MAX]', () => {
    expect(clampFrameDt(-1)).toBe(0);
    expect(clampFrameDt(0.01)).toBe(0.01);
    expect(clampFrameDt(3)).toBe(MAX_FRAME_DT_S);
    expect(clampFrameDt(Number.NaN)).toBe(0);
  });
});

describe('viewportSize', () => {
  it('never returns a zero dimension (minimised window)', () => {
    expect(viewportSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(viewportSize(1920, 0)).toEqual({ width: 1920, height: 1 });
  });
  it('floors fractional sizes', () => {
    expect(viewportSize(800.7, 600.2)).toEqual({ width: 800, height: 600 });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/app`
Expected: FAIL. The imports `./webgpuSupport` and `./clock` cannot be resolved.

- [ ] **Step 5: Implement support check, clock and overlay**

`src/app/webgpuSupport.ts`:

```ts
export type WebGpuSupport = { ok: true } | { ok: false; reason: string };

interface GpuLike {
  requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<unknown>;
}

export const WEBGPU_HELP =
  'Liquid Dreams needs WebGPU. Please use a current version of Chrome or Edge on a machine with a WebGPU-capable GPU.';

export async function checkWebGpuSupport(nav: { gpu?: GpuLike }): Promise<WebGpuSupport> {
  if (!nav.gpu) return { ok: false, reason: 'This browser does not support WebGPU.' };
  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { ok: false, reason: 'WebGPU is available but no GPU adapter could be found.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `WebGPU adapter request failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
```

`src/app/clock.ts`:

```ts
export const MAX_FRAME_DT_S = 0.1;

export function clampFrameDt(dtS: number): number {
  if (!Number.isFinite(dtS) || dtS <= 0) return 0;
  return Math.min(dtS, MAX_FRAME_DT_S);
}

/** Never return a zero dimension: WebGPU cannot create 0×0 render targets (e.g. minimised window). */
export function viewportSize(width: number, height: number): { width: number; height: number } {
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
}

/** Simulation time. Real time keeps flowing for cameras; sim time stops when paused. */
export class SimClock {
  simTime = 0;
  paused = false;

  tick(realDtS: number): number {
    const dt = clampFrameDt(realDtS);
    if (this.paused) return 0;
    this.simTime += dt;
    return dt;
  }

  setTime(t: number): void {
    this.simTime = Math.max(0, t);
  }
}
```

`src/app/overlay.ts`:

```ts
export interface OverlayAction {
  label: string;
  onClick: () => void;
}

export function showOverlay(title: string, message: string, actions: OverlayAction[] = []): HTMLElement {
  hideOverlay();
  const el = document.createElement('div');
  el.id = 'overlay';
  el.className = 'overlay';
  const h = document.createElement('h1');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  el.append(h, p);
  for (const action of actions) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', action.onClick);
    el.append(b);
  }
  document.body.append(el);
  return el;
}

export function hideOverlay(): void {
  document.getElementById('overlay')?.remove();
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app`
Expected: PASS (all 12 tests).

- [ ] **Step 7: Renderer, App shell and bootstrap**

`src/render/createRenderer.ts`:

```ts
import * as THREE from 'three/webgpu';
import { viewportSize } from '../app/clock';

export async function createRenderer(container: HTMLElement): Promise<THREE.WebGPURenderer> {
  const options = {
    antialias: false,
    powerPreference: 'high-performance',
    trackTimestamp: true,
    reversedDepthBuffer: true,
  };
  // three typings gap: backend options (powerPreference, trackTimestamp, reversedDepthBuffer) are not all typed.
  const renderer = new THREE.WebGPURenderer(options as ConstructorParameters<typeof THREE.WebGPURenderer>[0]);
  renderer.setPixelRatio(window.devicePixelRatio);
  const size = viewportSize(container.clientWidth, container.clientHeight);
  renderer.setSize(size.width, size.height);
  container.append(renderer.domElement);
  await renderer.init();
  if ((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend !== true) {
    throw new Error('three.js fell back to WebGL; WebGPU is required.');
  }
  return renderer;
}
```

`src/app/App.ts`:

```ts
import * as THREE from 'three/webgpu';
import { SimClock, clampFrameDt, viewportSize } from './clock';

export class App {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly clock = new SimClock();
  private lastMs = performance.now();

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
  ) {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60000);
    this.scene.background = new THREE.Color(0x0b2a4a);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  private onResize = (): void => {
    const { width, height } = viewportSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private frame = (): void => {
    const now = performance.now();
    const realDt = clampFrameDt((now - this.lastMs) / 1000);
    this.lastMs = now;
    this.clock.tick(realDt);
    this.renderer.render(this.scene, this.camera);
  };
}
```

`src/main.ts`:

```ts
import './style.css';
import { App } from './app/App';
import { showOverlay } from './app/overlay';
import { WEBGPU_HELP, checkWebGpuSupport } from './app/webgpuSupport';
import { createRenderer } from './render/createRenderer';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');

  const support = await checkWebGpuSupport(navigator as unknown as Parameters<typeof checkWebGpuSupport>[0]);
  if (!support.ok) {
    showOverlay('WebGPU is not available', `${support.reason}\n\n${WEBGPU_HELP}`);
    return;
  }

  let renderer;
  try {
    renderer = await createRenderer(container);
  } catch (e) {
    showOverlay('WebGPU could not start', `${e instanceof Error ? e.message : String(e)}\n\n${WEBGPU_HELP}`);
    return;
  }

  new App(renderer, container).start();
}

void main();
```

- [ ] **Step 8: Type-check and view it**

Run: `npm run typecheck`
Expected: exits 0 with no errors. If `typescript@7.0.2` fails on tooling (not on our code), install the newest `typescript@6` with `--save-exact` and re-run.

Start the dev server with the browser pane's `preview_start` (name `liquid-dreams`) and take a screenshot.
Expected: a full-window deep-blue (`#0b2a4a`) canvas and no console errors (`read_console_messages` with `onlyErrors: true` is empty). If the browser pane reports that WebGPU is unavailable, the "WebGPU is not available" overlay must be visible instead. Record this in the task report, and use the Playwright browser (`mcp__plugin_playwright_playwright__*`) for visual checks in later tasks.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html README.md .claude/launch.json src
git commit -m "feat: scaffold Vite + three WebGPU app with clock and WebGPU check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Conditions: types, defaults, sanitising, RNG, directions, time, units

**Files:**
- Create: `src/conditions/types.ts`, `src/conditions/defaults.ts`, `src/conditions/sanitize.ts`, `src/conditions/rng.ts`, `src/conditions/directions.ts`, `src/conditions/time.ts`, `src/conditions/units.ts`
- Test: `src/conditions/sanitize.test.ts`, `src/conditions/rng.test.ts`, `src/conditions/directions.test.ts`, `src/conditions/time.test.ts`, `src/conditions/units.test.ts`

**Interfaces:**
- Produces:
  - `interface Conditions { date: string; timeOfDay: number; swell: { sizeFt; periodS; directionDeg }; wind: { speedMs; directionDeg }; tideM: number; seed: number }`
  - `DEFAULT_CONDITIONS: Conditions`, `WOMB_LOCATION: { latDeg; lonDeg }`, `AWST_UTC_OFFSET_HOURS = 8`, `cloneConditions(c)`
  - `sanitizeConditions(input: unknown): Conditions`, `wrapDegrees(d)`
  - `interface Rng { next(): number; gaussian(): number }`, `createRng(seed): Rng`, `deriveSeed(seed, salt): number`
  - `type Vec2XZ = { x: number; z: number }`, `bearingToWorldXZ(bearingDeg): Vec2XZ`, `travelDirectionXZ(fromDeg): Vec2XZ`
  - `awstToUtc(date, hours): Date`
  - `SURFER_FT_TO_HS_M = 0.4`, `surferFeetToHs(sizeFt): number`

- [ ] **Step 1: Write failing tests**

`src/conditions/sanitize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from './defaults';
import { sanitizeConditions, wrapDegrees } from './sanitize';

describe('sanitizeConditions', () => {
  it('returns defaults for non-objects', () => {
    expect(sanitizeConditions(undefined)).toEqual(DEFAULT_CONDITIONS);
    expect(sanitizeConditions(null)).toEqual(DEFAULT_CONDITIONS);
    expect(sanitizeConditions('nope')).toEqual(DEFAULT_CONDITIONS);
  });
  it('keeps valid values', () => {
    const c = {
      date: '2026-04-20', timeOfDay: 9.5,
      swell: { sizeFt: 5, periodS: 17, directionDeg: 230 },
      wind: { speedMs: 0, directionDeg: 90 }, tideM: 0.4, seed: 7,
    };
    expect(sanitizeConditions(c)).toEqual(c);
  });
  it('clamps out-of-range numbers', () => {
    const c = sanitizeConditions({ swell: { sizeFt: 50, periodS: 1 }, wind: { speedMs: -3 }, tideM: 9, timeOfDay: 30 });
    expect(c.swell.sizeFt).toBe(12);
    expect(c.swell.periodS).toBe(4);
    expect(c.wind.speedMs).toBe(0);
    expect(c.tideM).toBe(1.5);
    expect(c.timeOfDay).toBe(23.999);
  });
  it('replaces NaN / non-numbers with defaults', () => {
    const c = sanitizeConditions({ timeOfDay: Number.NaN, swell: { sizeFt: 'big' } });
    expect(c.timeOfDay).toBe(DEFAULT_CONDITIONS.timeOfDay);
    expect(c.swell.sizeFt).toBe(DEFAULT_CONDITIONS.swell.sizeFt);
  });
  it('wraps directions into [0, 360)', () => {
    const c = sanitizeConditions({ swell: { directionDeg: 370 }, wind: { directionDeg: -90 } });
    expect(c.swell.directionDeg).toBe(10);
    expect(c.wind.directionDeg).toBe(270);
    expect(wrapDegrees(360)).toBe(0);
  });
  it('rejects impossible dates', () => {
    expect(sanitizeConditions({ date: '2026-02-30' }).date).toBe(DEFAULT_CONDITIONS.date);
    expect(sanitizeConditions({ date: 'hello' }).date).toBe(DEFAULT_CONDITIONS.date);
  });
  it('rejects non-uint32 seeds', () => {
    expect(sanitizeConditions({ seed: 1.5 }).seed).toBe(DEFAULT_CONDITIONS.seed);
    expect(sanitizeConditions({ seed: 2 ** 32 }).seed).toBe(DEFAULT_CONDITIONS.seed);
    expect(sanitizeConditions({ seed: -1 }).seed).toBe(DEFAULT_CONDITIONS.seed);
  });
  it('does not share nested objects with DEFAULT_CONDITIONS', () => {
    const c = sanitizeConditions({});
    c.swell.sizeFt = 9;
    expect(DEFAULT_CONDITIONS.swell.sizeFt).toBe(4);
  });
});
```

`src/conditions/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from './rng';

describe('createRng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(2002), b = createRng(2002);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('next() is in [0, 1)', () => {
    const r = createRng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('gaussian() has mean ~0 and variance ~1', () => {
    const r = createRng(5);
    const n = 20000;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) { const g = r.gaussian(); sum += g; sumSq += g * g; }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sumSq / n - mean * mean - 1)).toBeLessThan(0.05);
  });
});

describe('deriveSeed', () => {
  it('is deterministic and salt-sensitive', () => {
    expect(deriveSeed(2002, 0)).toBe(deriveSeed(2002, 0));
    expect(deriveSeed(2002, 0)).not.toBe(deriveSeed(2002, 1));
    expect(deriveSeed(2002, 1)).toBeGreaterThanOrEqual(0);
    expect(deriveSeed(2002, 1)).toBeLessThanOrEqual(0xffffffff);
  });
});
```

`src/conditions/directions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bearingToWorldXZ, travelDirectionXZ } from './directions';

const close = (a: { x: number; z: number }, x: number, z: number) => {
  expect(a.x).toBeCloseTo(x, 6);
  expect(a.z).toBeCloseTo(z, 6);
};

describe('bearingToWorldXZ (+X east, +Z south)', () => {
  it('north is -Z', () => close(bearingToWorldXZ(0), 0, -1));
  it('east is +X', () => close(bearingToWorldXZ(90), 1, 0));
  it('south is +Z', () => close(bearingToWorldXZ(180), 0, 1));
  it('west is -X', () => close(bearingToWorldXZ(270), -1, 0));
});

describe('travelDirectionXZ', () => {
  it('SW swell (from 225) travels toward the NE', () => close(travelDirectionXZ(225), Math.SQRT1_2, -Math.SQRT1_2));
  it('easterly wind (from 80) blows out to sea (westward)', () => {
    expect(travelDirectionXZ(80).x).toBeLessThan(-0.9);
  });
});
```

`src/conditions/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { awstToUtc } from './time';

describe('awstToUtc', () => {
  it('08:15 AWST is 00:15 UTC the same day', () => {
    expect(awstToUtc('2026-07-15', 8.25).toISOString()).toBe('2026-07-15T00:15:00.000Z');
  });
  it('06:00 AWST is 22:00 UTC the previous day', () => {
    expect(awstToUtc('2026-07-15', 6).toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });
  it('09:30 AWST in April', () => {
    expect(awstToUtc('2026-04-20', 9.5).toISOString()).toBe('2026-04-20T01:30:00.000Z');
  });
});
```

`src/conditions/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { surferFeetToHs } from './units';

describe('surferFeetToHs', () => {
  it('uses the provisional 0.4 m per surfer foot', () => {
    expect(surferFeetToHs(4)).toBeCloseTo(1.6);
    expect(surferFeetToHs(0)).toBe(0);
  });
  it('never returns negative heights', () => {
    expect(surferFeetToHs(-2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/conditions`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/conditions/types.ts`:

```ts
export interface SwellConditions {
  /** Surfer feet, measured from the back of the wave (canonical unit). */
  sizeFt: number;
  /** Peak period, seconds. */
  periodS: number;
  /** Direction the swell comes FROM, degrees true. */
  directionDeg: number;
}

export interface WindConditions {
  speedMs: number;
  /** Direction the wind comes FROM, degrees true. */
  directionDeg: number;
}

export interface Conditions {
  /** Local AWST date, 'YYYY-MM-DD'. */
  date: string;
  /** Local AWST hours, [0, 24). */
  timeOfDay: number;
  swell: SwellConditions;
  wind: WindConditions;
  /** Metres relative to mean sea level (used from Phase 1). */
  tideM: number;
  /** uint32 seed for every random process. */
  seed: number;
}
```

`src/conditions/defaults.ts`:

```ts
import type { Conditions } from './types';

export const WOMB_LOCATION = { latDeg: -33.8972366, lonDeg: 114.9832508 } as const;
export const AWST_UTC_OFFSET_HOURS = 8;

/** A winter morning session: sun low behind the dunes, light easterly offshore. */
export const DEFAULT_CONDITIONS: Readonly<Conditions> = Object.freeze({
  date: '2026-07-15',
  timeOfDay: 8.25,
  swell: Object.freeze({ sizeFt: 4, periodS: 15, directionDeg: 225 }),
  wind: Object.freeze({ speedMs: 3, directionDeg: 80 }),
  tideM: 0,
  seed: 2002,
}) as Readonly<Conditions>;

export function cloneConditions(c: Readonly<Conditions>): Conditions {
  return { ...c, swell: { ...c.swell }, wind: { ...c.wind } };
}
```

`src/conditions/sanitize.ts`:

```ts
import { DEFAULT_CONDITIONS } from './defaults';
import type { Conditions } from './types';

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

export function wrapDegrees(d: number): number {
  return ((d % 360) + 360) % 360;
}

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Turn untrusted input (moment links, panel edits) into valid Conditions. Never throws. */
export function sanitizeConditions(input: unknown): Conditions {
  const d = DEFAULT_CONDITIONS;
  const o = obj(input);
  const swell = obj(o.swell);
  const wind = obj(o.wind);
  const seed = o.seed;
  return {
    date: isValidDate(o.date) ? o.date : d.date,
    timeOfDay: clamp(num(o.timeOfDay, d.timeOfDay), 0, 23.999),
    swell: {
      sizeFt: clamp(num(swell.sizeFt, d.swell.sizeFt), 0, 12),
      periodS: clamp(num(swell.periodS, d.swell.periodS), 4, 25),
      directionDeg: wrapDegrees(num(swell.directionDeg, d.swell.directionDeg)),
    },
    wind: {
      speedMs: clamp(num(wind.speedMs, d.wind.speedMs), 0, 30),
      directionDeg: wrapDegrees(num(wind.directionDeg, d.wind.directionDeg)),
    },
    tideM: clamp(num(o.tideM, d.tideM), -1.5, 1.5),
    seed: typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : d.seed,
  };
}
```

`src/conditions/rng.ts`:

```ts
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (mean 0, variance 1). */
  gaussian(): number;
}

/** mulberry32 + Box–Muller. Small, fast, deterministic. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  let spare: number | null = null;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gaussian = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return { next, gaussian };
}

/** Independent, reproducible sub-stream seeds (e.g. one per ocean cascade). */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
```

`src/conditions/directions.ts`:

```ts
export type Vec2XZ = { x: number; z: number };

const DEG = Math.PI / 180;

/** Unit vector in world XZ pointing along a compass bearing (+X east, +Z south). */
export function bearingToWorldXZ(bearingDeg: number): Vec2XZ {
  const r = bearingDeg * DEG;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/** Swell/wind given as "coming from" travels the opposite way. */
export function travelDirectionXZ(fromDeg: number): Vec2XZ {
  return bearingToWorldXZ(fromDeg + 180);
}
```

`src/conditions/time.ts`:

```ts
import { AWST_UTC_OFFSET_HOURS } from './defaults';

/** Local AWST date + fractional hours → UTC instant. */
export function awstToUtc(date: string, hours: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (hours - AWST_UTC_OFFSET_HOURS) * 3_600_000);
}
```

`src/conditions/units.ts`:

```ts
/** Provisional: recalibrated in Phase 2 against the breaking wave's face height. */
export const SURFER_FT_TO_HS_M = 0.4;

export function surferFeetToHs(sizeFt: number): number {
  return Math.max(0, sizeFt) * SURFER_FT_TO_HS_M;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/conditions && npm run typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/conditions
git commit -m "feat: add Conditions model with sanitising, seeded RNG, directions and time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Solar position

**Files:**
- Create: `src/astro/sunPosition.ts`, `src/astro/sunForConditions.ts`
- Test: `src/astro/sunPosition.test.ts`, `src/astro/sunForConditions.test.ts`

**Interfaces:**
- Consumes: `awstToUtc`, `WOMB_LOCATION`, `Conditions`.
- Produces: `sunPosition(latDeg, lonDeg, utc: Date) → { azimuthDeg, elevationDeg }` (geometric, no refraction; azimuth clockwise from north); `sunDirectionWorld(azimuthDeg, elevationDeg) → [x, y, z]`; `sunForConditions(c) → { azimuthDeg, elevationDeg, direction: [x, y, z] }`.

Reference values were generated with the `astral` Python library for the Womb's coordinates. Sunrise and sunset are the instants when geometric elevation is −0.833°.

- [ ] **Step 1: Write failing tests**

`src/astro/sunPosition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WOMB_LOCATION } from '../conditions/defaults';
import { sunDirectionWorld, sunPosition } from './sunPosition';

const at = (iso: string) => sunPosition(WOMB_LOCATION.latDeg, WOMB_LOCATION.lonDeg, new Date(iso));
const azDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('sunPosition at The Womb', () => {
  it('default morning session: 2026-07-15 08:15 AWST', () => {
    const s = at('2026-07-15T00:15:00Z');
    expect(s.elevationDeg).toBeCloseTo(8.542, 1);
    expect(azDiff(s.azimuthDeg, 56.742)).toBeLessThan(0.1);
  });
  it('autumn glass-off: 2026-04-20 09:30 AWST', () => {
    const s = at('2026-04-20T01:30:00Z');
    expect(s.elevationDeg).toBeCloseTo(29.411, 1);
    expect(azDiff(s.azimuthDeg, 49.17)).toBeLessThan(0.1);
  });
  it('golden hour: 2026-07-15 16:50 AWST', () => {
    const s = at('2026-07-15T08:50:00Z');
    expect(s.elevationDeg).toBeCloseTo(6.316, 1);
    expect(azDiff(s.azimuthDeg, 301.23)).toBeLessThan(0.1);
  });
  it('winter solar noon is due north at 34.58°', () => {
    const s = at('2026-07-15T04:26:01Z');
    expect(s.elevationDeg).toBeCloseTo(34.581, 1);
    expect(azDiff(s.azimuthDeg, 0)).toBeLessThan(0.5);
  });
  it('summer solstice noon elevation 79.54°', () => {
    expect(at('2026-12-21T04:17:53Z').elevationDeg).toBeCloseTo(79.539, 1);
  });
  it('sunset and sunrise sit at -0.833° geometric elevation', () => {
    expect(at('2026-07-15T09:28:56.760Z').elevationDeg).toBeCloseTo(-0.833, 1);
    expect(at('2026-04-20T22:47:09.974Z').elevationDeg).toBeCloseTo(-0.833, 1);
  });
});

describe('sunDirectionWorld', () => {
  it('az 90, el 0 → +X (east)', () => {
    const [x, y, z] = sunDirectionWorld(90, 0);
    expect(x).toBeCloseTo(1); expect(y).toBeCloseTo(0); expect(z).toBeCloseTo(0);
  });
  it('az 0, el 45 → up and north (-Z)', () => {
    const [x, y, z] = sunDirectionWorld(0, 45);
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(Math.SQRT1_2); expect(z).toBeCloseTo(-Math.SQRT1_2);
  });
  it('is unit length', () => {
    const [x, y, z] = sunDirectionWorld(123, 17);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
  });
});
```

`src/astro/sunForConditions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { sunForConditions } from './sunForConditions';

describe('sunForConditions', () => {
  it('default conditions give the 08:15 July sun, low in the NE', () => {
    const s = sunForConditions(DEFAULT_CONDITIONS);
    expect(s.elevationDeg).toBeCloseTo(8.542, 1);
    expect(s.azimuthDeg).toBeCloseTo(56.742, 1);
    expect(s.direction[0]).toBeGreaterThan(0); // east
    expect(s.direction[2]).toBeLessThan(0);    // north
  });
  it('midnight puts the sun well below the horizon', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.timeOfDay = 0;
    expect(sunForConditions(c).elevationDeg).toBeLessThan(-30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/astro`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement (NOAA solar position algorithm)**

`src/astro/sunPosition.ts`:

```ts
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface SunAngles {
  /** Clockwise from true north, [0, 360). */
  azimuthDeg: number;
  /** Geometric elevation (no atmospheric refraction). */
  elevationDeg: number;
}

/** NOAA solar position algorithm (Meeus-based), accurate to ~0.01° for 1900–2100. */
export function sunPosition(latDeg: number, lonDeg: number, utc: Date): SunAngles {
  const jd = utc.getTime() / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525;

  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * DEG) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG));

  const y = Math.tan((eps / 2) * DEG) ** 2;
  const eqTimeMin =
    4 * RAD *
    (y * Math.sin(2 * l0 * DEG) -
      2 * e * Math.sin(m * DEG) +
      4 * e * y * Math.sin(m * DEG) * Math.cos(2 * l0 * DEG) -
      0.5 * y * y * Math.sin(4 * l0 * DEG) -
      1.25 * e * e * Math.sin(2 * m * DEG));

  const minutesUtc = utc.getUTCHours() * 60 + utc.getUTCMinutes() + utc.getUTCSeconds() / 60 + utc.getUTCMilliseconds() / 60000;
  const trueSolarTime = (((minutesUtc + eqTimeMin + 4 * lonDeg) % 1440) + 1440) % 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const lat = latDeg * DEG;
  const ha = hourAngle * DEG;
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)));
  const elevationDeg = 90 - Math.acos(cosZenith) * RAD;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) * RAD + 180;
  return { azimuthDeg: ((az % 360) + 360) % 360, elevationDeg };
}

/** World-space unit vector toward the sun (+X east, +Y up, +Z south). */
export function sunDirectionWorld(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
```

`src/astro/sunForConditions.ts`:

```ts
import { WOMB_LOCATION } from '../conditions/defaults';
import { awstToUtc } from '../conditions/time';
import type { Conditions } from '../conditions/types';
import { sunDirectionWorld, sunPosition } from './sunPosition';

export interface SunState {
  azimuthDeg: number;
  elevationDeg: number;
  direction: [number, number, number];
}

export function sunForConditions(c: Pick<Conditions, 'date' | 'timeOfDay'>): SunState {
  const { azimuthDeg, elevationDeg } = sunPosition(WOMB_LOCATION.latDeg, WOMB_LOCATION.lonDeg, awstToUtc(c.date, c.timeOfDay));
  return { azimuthDeg, elevationDeg, direction: sunDirectionWorld(azimuthDeg, elevationDeg) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/astro && npm run typecheck`
Expected: PASS (11 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/astro
git commit -m "feat: add NOAA solar position for The Womb

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ocean spectrum maths

**Files:**
- Create: `src/ocean/spectrum.ts`
- Test: `src/ocean/spectrum.test.ts`

**Interfaces:**
- Consumes: `Conditions`, `surferFeetToHs`, `travelDirectionXZ`, `createRng`, `deriveSeed`, `Vec2XZ`.
- Produces:
  - `GRAVITY = 9.81`, `FFT_SIZE = 256`, `CASCADE_SIZES_M = [3000, 250, 35]`
  - `interface CascadeBand { sizeM; kMin; kMax }`, `cascadeBands(sizes?, n?) → CascadeBand[]`
  - `omegaForK(k)`, `jonswapShape(omega, omegaP, gamma)`, `alphaForHs(hs, omegaP, gamma)`, `spreading(cosDelta, s)`, `spreadingNormalisation(s)`
  - `interface OceanSpectrumParams { windFetchM; windSpread; swellSpread; windGamma; swellGamma }`, `DEFAULT_SPECTRUM_PARAMS`
  - `interface SpectrumComponent { hs; omegaP; gamma; alpha; travel: Vec2XZ; spread }`
  - `windSeaComponent(speedMs, fromDeg, p)`, `swellComponent(sizeFt, periodS, fromDeg, p)`, `buildSpectrumComponents(c, p)`
  - `directionalSpectrumK(kx, kz, comps)`, `expectedCascadeVariance(band, comps, n)`, `cascadeSlopeVariance(band, comps, n)`
  - `buildInitialSpectrum(band, comps, rng, n) → Float32Array` (RGBA per texel: `h0(k).re, h0(k).im, conj(h0(-k)).re, conj(h0(-k)).im`; row = z index m, column = x index; `k = 2π(index − n/2)/size`)
  - `interface OceanSpectra { h0: Float32Array[]; slopeVariance: number[]; hsTotal: number; components: SpectrumComponent[] }`, `buildOceanSpectra(c, p?, bands?, n?) → OceanSpectra`

Why three cascades of 3000 / 250 / 35 m: the 15 s groundswell has a wavelength of about 350 m, so the largest patch must span many wavelengths to resolve its peak and direction. (The spec's 600 m was too small. The spec is updated alongside this plan.) The cascades split wavenumber space into contiguous bands so that no energy is counted twice. Each spectrum component is renormalised so that the discrete grids reproduce its requested Hs exactly, because a narrow swell peak is only coarsely sampled by any grid.

- [ ] **Step 1: Write failing tests**

`src/ocean/spectrum.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { createRng } from '../conditions/rng';
import {
  CASCADE_SIZES_M, DEFAULT_SPECTRUM_PARAMS, FFT_SIZE, GRAVITY,
  alphaForHs, buildInitialSpectrum, buildOceanSpectra, buildSpectrumComponents, cascadeBands,
  jonswapShape, omegaForK, spreading, windSeaComponent,
} from './spectrum';

describe('dispersion and JONSWAP', () => {
  it('deep-water dispersion ω = sqrt(g k)', () => {
    expect(omegaForK((2 * Math.PI) / 100)).toBeCloseTo(Math.sqrt(GRAVITY * 0.0628319), 5);
  });
  it('JONSWAP peaks at ωp', () => {
    const wp = (2 * Math.PI) / 15;
    let best = 0, bestW = 0;
    for (let w = 0.2; w < 2; w += 0.0005) { const s = jonswapShape(w, wp, 3.3); if (s > best) { best = s; bestW = w; } }
    expect(Math.abs(bestW - wp) / wp).toBeLessThan(0.02);
  });
  it('alphaForHs reproduces Hs through m0', () => {
    const wp = (2 * Math.PI) / 12, hs = 1.3, a = alphaForHs(hs, wp, 3.3);
    let m0 = 0;
    const dw = 0.0005;
    for (let w = 0.05; w < 12; w += dw) m0 += a * jonswapShape(w, wp, 3.3) * dw;
    expect(4 * Math.sqrt(m0)).toBeCloseTo(hs, 2);
  });
  it('alphaForHs(0) is 0', () => expect(alphaForHs(0, 1, 3.3)).toBe(0));
});

describe('directional spreading', () => {
  it.each([6, 40])('integrates to 1 over the circle (s=%i)', (s) => {
    let sum = 0;
    const n = 4096;
    for (let i = 0; i < n; i++) sum += spreading(Math.cos(-Math.PI + ((i + 0.5) * 2 * Math.PI) / n), s) * ((2 * Math.PI) / n);
    expect(sum).toBeCloseTo(1, 3);
  });
  it('is zero straight against the travel direction', () => expect(spreading(-1, 6)).toBe(0));
});

describe('components', () => {
  it('zero wind gives a silent, finite wind sea', () => {
    const w = windSeaComponent(0, 80, DEFAULT_SPECTRUM_PARAMS);
    expect(w.alpha).toBe(0);
    expect(w.hs).toBe(0);
    expect(Number.isFinite(w.omegaP)).toBe(true);
  });
  it('3 m/s over 5 km of fetch gives roughly 10 cm of chop', () => {
    const w = windSeaComponent(3, 80, DEFAULT_SPECTRUM_PARAMS);
    expect(w.hs).toBeGreaterThan(0.08);
    expect(w.hs).toBeLessThan(0.14);
  });
});

describe('cascade bands', () => {
  const bands = cascadeBands();
  it('are contiguous and start at 0', () => {
    expect(bands[0].kMin).toBe(0);
    for (let i = 1; i < bands.length; i++) expect(bands[i].kMin).toBeCloseTo(bands[i - 1].kMax, 10);
  });
  it('never exceed their own grid Nyquist', () => {
    for (const b of bands) expect(b.kMax).toBeLessThanOrEqual((Math.PI * FFT_SIZE) / b.sizeM + 1e-9);
  });
  it('use the planned sizes', () => expect(bands.map((b) => b.sizeM)).toEqual([...CASCADE_SIZES_M]));
});

describe('buildOceanSpectra', () => {
  it('reproduces the combined Hs of swell and wind sea', () => {
    const s = buildOceanSpectra(DEFAULT_CONDITIONS);
    const comps = buildSpectrumComponents(DEFAULT_CONDITIONS, DEFAULT_SPECTRUM_PARAMS);
    const target = Math.sqrt(comps.reduce((a, c) => a + c.hs * c.hs, 0));
    expect(s.hsTotal).toBeCloseTo(target, 2);
    expect(target).toBeGreaterThan(1.6);
  });
  it('autumn glass-off (zero wind) is finite and swell-only', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.wind.speedMs = 0;
    const s = buildOceanSpectra(c);
    expect(s.hsTotal).toBeCloseTo(1.6, 2);
    for (const a of s.h0) for (const v of a) expect(Number.isFinite(v)).toBe(true);
  });
  it('flat calm gives all-zero spectra', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.wind.speedMs = 0;
    c.swell.sizeFt = 0;
    const s = buildOceanSpectra(c);
    expect(s.hsTotal).toBe(0);
    for (const a of s.h0) expect(a.every((v) => v === 0)).toBe(true);
  });
  it('extreme conditions stay finite', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell = { sizeFt: 12, periodS: 25, directionDeg: 200 };
    c.wind = { speedMs: 30, directionDeg: 225 };
    const s = buildOceanSpectra(c);
    expect(Number.isFinite(s.hsTotal)).toBe(true);
    for (const a of s.h0) for (const v of a) expect(Number.isFinite(v)).toBe(true);
    for (const v of s.slopeVariance) expect(Number.isFinite(v)).toBe(true);
  });
  it('is deterministic per seed', () => {
    const a = buildOceanSpectra(DEFAULT_CONDITIONS);
    const b = buildOceanSpectra(DEFAULT_CONDITIONS);
    expect(a.h0[1]).toEqual(b.h0[1]);
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.seed = 7;
    expect(buildOceanSpectra(c).h0[1]).not.toEqual(a.h0[1]);
  });
  it('swell energy travels toward the NE (+X, -Z) in cascade 0', () => {
    const s = buildOceanSpectra(DEFAULT_CONDITIONS);
    const a = s.h0[0], n = FFT_SIZE;
    let best = -1, bestIdx = 0;
    for (let i = 0; i < n * n; i++) { const e = a[i * 4] ** 2 + a[i * 4 + 1] ** 2; if (e > best) { best = e; bestIdx = i; } }
    const x = (bestIdx % n) - n / 2, m = Math.floor(bestIdx / n) - n / 2;
    expect(x).toBeGreaterThan(0);
    expect(m).toBeLessThan(0);
  });
  it('slope variance is positive for a live sea and zero for calm', () => {
    expect(buildOceanSpectra(DEFAULT_CONDITIONS).slopeVariance.every((v) => v > 0)).toBe(true);
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.wind.speedMs = 0; c.swell.sizeFt = 0;
    expect(buildOceanSpectra(c).slopeVariance.every((v) => v === 0)).toBe(true);
  });
});

describe('buildInitialSpectrum', () => {
  it('stores conj(h0(-k)) alongside h0(k) (Hermitian pairing)', () => {
    const bands = cascadeBands();
    const comps = buildSpectrumComponents(DEFAULT_CONDITIONS, DEFAULT_SPECTRUM_PARAMS);
    const n = FFT_SIZE, a = buildInitialSpectrum(bands[1], comps, createRng(3), n);
    for (const [x, m] of [[140, 100], [10, 250], [129, 128]]) {
      const i = m * n + x, j = ((n - m) % n) * n + ((n - x) % n);
      expect(a[i * 4 + 2]).toBe(a[j * 4]);
      expect(a[i * 4 + 3]).toBe(-a[j * 4 + 1]);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ocean/spectrum.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/ocean/spectrum.ts`:

```ts
import { travelDirectionXZ, type Vec2XZ } from '../conditions/directions';
import { createRng, deriveSeed, type Rng } from '../conditions/rng';
import type { Conditions } from '../conditions/types';
import { surferFeetToHs } from '../conditions/units';

export const GRAVITY = 9.81;
export const FFT_SIZE = 256;
/** Patch sizes (m): long swell / mid waves / fine chop. */
export const CASCADE_SIZES_M = [3000, 250, 35] as const;

export interface CascadeBand {
  sizeM: number;
  kMin: number;
  kMax: number;
}

/** Contiguous wavenumber bands: cascade i owns [kMin, kMax). Boundaries sit 4 fundamentals into the next cascade. */
export function cascadeBands(sizes: readonly number[] = CASCADE_SIZES_M, n = FFT_SIZE): CascadeBand[] {
  return sizes.map((sizeM, i) => ({
    sizeM,
    kMin: i === 0 ? 0 : (8 * Math.PI) / sizeM,
    kMax: i === sizes.length - 1 ? (Math.PI * n) / sizeM : (8 * Math.PI) / sizes[i + 1],
  }));
}

export const omegaForK = (k: number): number => Math.sqrt(GRAVITY * k);

/** JONSWAP frequency spectrum with alpha = 1 (scale with alphaForHs). */
export function jonswapShape(omega: number, omegaP: number, gamma: number): number {
  if (omega <= 0 || omegaP <= 0) return 0;
  const sigma = omega <= omegaP ? 0.07 : 0.09;
  const r = Math.exp(-((omega - omegaP) ** 2) / (2 * sigma * sigma * omegaP * omegaP));
  return ((GRAVITY * GRAVITY) / omega ** 5) * Math.exp(-1.25 * (omegaP / omega) ** 4) * gamma ** r;
}

export function alphaForHs(hs: number, omegaP: number, gamma: number): number {
  if (hs <= 0) return 0;
  const lo = 0.3 * omegaP, hi = 8 * omegaP, steps = 4000, dw = (hi - lo) / steps;
  let m0 = 0;
  for (let i = 0; i < steps; i++) m0 += jonswapShape(lo + (i + 0.5) * dw, omegaP, gamma) * dw;
  return (hs / 4) ** 2 / m0;
}

const spreadingNormCache = new Map<number, number>();
/** 1 / ∫ cos^{2s}(θ/2) dθ over [-π, π]. */
export function spreadingNormalisation(s: number): number {
  const cached = spreadingNormCache.get(s);
  if (cached !== undefined) return cached;
  const steps = 2048;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const theta = -Math.PI + ((i + 0.5) * 2 * Math.PI) / steps;
    sum += Math.cos(theta / 2) ** (2 * s) * ((2 * Math.PI) / steps);
  }
  const norm = 1 / sum;
  spreadingNormCache.set(s, norm);
  return norm;
}

/** cos-2s directional spreading, expressed via cosΔ: cos^{2s}(Δ/2) = ((1+cosΔ)/2)^s. */
export function spreading(cosDelta: number, s: number): number {
  const c = Math.max(0, (1 + cosDelta) / 2);
  return spreadingNormalisation(s) * c ** s;
}

export interface OceanSpectrumParams {
  windFetchM: number;
  windSpread: number;
  swellSpread: number;
  windGamma: number;
  swellGamma: number;
}

export const DEFAULT_SPECTRUM_PARAMS: OceanSpectrumParams = {
  windFetchM: 5000,
  windSpread: 6,
  swellSpread: 40,
  windGamma: 3.3,
  swellGamma: 7,
};

export interface SpectrumComponent {
  hs: number;
  omegaP: number;
  gamma: number;
  alpha: number;
  travel: Vec2XZ;
  spread: number;
}

/** Fetch-limited JONSWAP wind sea, capped at a fully developed sea. */
export function windSeaComponent(speedMs: number, fromDeg: number, p: OceanSpectrumParams): SpectrumComponent {
  const travel = travelDirectionXZ(fromDeg);
  if (speedMs < 0.05) return { hs: 0, omegaP: 1, gamma: p.windGamma, alpha: 0, travel, spread: p.windSpread };
  const u = speedMs, f = p.windFetchM;
  const hs = Math.min(0.0016 * Math.sqrt((GRAVITY * f) / (u * u)) * ((u * u) / GRAVITY), (0.21 * u * u) / GRAVITY);
  const omegaP = Math.max(22 * Math.cbrt((GRAVITY * GRAVITY) / (u * f)), (0.855 * GRAVITY) / u);
  return { hs, omegaP, gamma: p.windGamma, alpha: alphaForHs(hs, omegaP, p.windGamma), travel, spread: p.windSpread };
}

export function swellComponent(sizeFt: number, periodS: number, fromDeg: number, p: OceanSpectrumParams): SpectrumComponent {
  const hs = surferFeetToHs(sizeFt);
  const omegaP = (2 * Math.PI) / periodS;
  return { hs, omegaP, gamma: p.swellGamma, alpha: alphaForHs(hs, omegaP, p.swellGamma), travel: travelDirectionXZ(fromDeg), spread: p.swellSpread };
}

export function buildSpectrumComponents(c: Conditions, p: OceanSpectrumParams): SpectrumComponent[] {
  return [windSeaComponent(c.wind.speedMs, c.wind.directionDeg, p), swellComponent(c.swell.sizeFt, c.swell.periodS, c.swell.directionDeg, p)];
}

/** Wavenumber-space energy density E(kx, kz) in m⁴, so that ∫∫E dkx dkz = m0. */
export function directionalSpectrumK(kx: number, kz: number, comps: readonly SpectrumComponent[]): number {
  const k = Math.hypot(kx, kz);
  if (k < 1e-6) return 0;
  const omega = omegaForK(k);
  const dOmegaDk = GRAVITY / (2 * omega);
  let e = 0;
  for (const c of comps) {
    if (c.alpha === 0) continue;
    const cosDelta = (kx * c.travel.x + kz * c.travel.z) / k;
    e += c.alpha * jonswapShape(omega, c.omegaP, c.gamma) * spreading(cosDelta, c.spread);
  }
  return (e * dOmegaDk) / k;
}

function forEachBandCell(band: CascadeBand, n: number, fn: (kx: number, kz: number, k: number, dk: number) => void): void {
  const dk = (2 * Math.PI) / band.sizeM;
  for (let m = 0; m < n; m++) {
    for (let x = 0; x < n; x++) {
      const kx = (x - n / 2) * dk, kz = (m - n / 2) * dk, k = Math.hypot(kx, kz);
      if (k === 0 || k < band.kMin || k >= band.kMax) continue;
      fn(kx, kz, k, dk);
    }
  }
}

/** Expected surface-height variance contributed by this cascade (Σ E Δk²). */
export function expectedCascadeVariance(band: CascadeBand, comps: readonly SpectrumComponent[], n = FFT_SIZE): number {
  let v = 0;
  forEachBandCell(band, n, (kx, kz, _k, dk) => { v += directionalSpectrumK(kx, kz, comps) * dk * dk; });
  return v;
}

/** Expected slope variance (Σ k² E Δk²): feeds sun-glitter roughness when a cascade is faded out. */
export function cascadeSlopeVariance(band: CascadeBand, comps: readonly SpectrumComponent[], n = FFT_SIZE): number {
  let v = 0;
  forEachBandCell(band, n, (kx, kz, k, dk) => { v += k * k * directionalSpectrumK(kx, kz, comps) * dk * dk; });
  return v;
}

/**
 * Random initial spectrum h0 for one cascade. h0 = (g1 + i g2)·sqrt(E Δk²)/2 so that the
 * evolved field h = h0 e^{iωt} + conj(h0(-k)) e^{-iωt} has variance Σ E Δk².
 * Gaussians are drawn for every cell so the stream does not depend on the band limits.
 */
export function buildInitialSpectrum(band: CascadeBand, comps: readonly SpectrumComponent[], rng: Rng, n = FFT_SIZE): Float32Array {
  const re = new Float32Array(n * n), im = new Float32Array(n * n);
  const dk = (2 * Math.PI) / band.sizeM;
  for (let m = 0; m < n; m++) {
    for (let x = 0; x < n; x++) {
      const g1 = rng.gaussian(), g2 = rng.gaussian();
      const kx = (x - n / 2) * dk, kz = (m - n / 2) * dk, k = Math.hypot(kx, kz);
      if (k === 0 || k < band.kMin || k >= band.kMax) continue;
      const amp = Math.sqrt(directionalSpectrumK(kx, kz, comps) * dk * dk) / 2;
      re[m * n + x] = g1 * amp;
      im[m * n + x] = g2 * amp;
    }
  }
  const out = new Float32Array(n * n * 4);
  for (let m = 0; m < n; m++) {
    for (let x = 0; x < n; x++) {
      const i = m * n + x, j = ((n - m) % n) * n + ((n - x) % n);
      out[i * 4] = re[i];
      out[i * 4 + 1] = im[i];
      out[i * 4 + 2] = re[j];
      out[i * 4 + 3] = -im[j];
    }
  }
  return out;
}

export interface OceanSpectra {
  h0: Float32Array[];
  slopeVariance: number[];
  hsTotal: number;
  components: SpectrumComponent[];
}

export function buildOceanSpectra(
  c: Conditions,
  p: OceanSpectrumParams = DEFAULT_SPECTRUM_PARAMS,
  bands: CascadeBand[] = cascadeBands(),
  n = FFT_SIZE,
): OceanSpectra {
  const normalised = buildSpectrumComponents(c, p).map((comp) => {
    if (comp.alpha === 0) return comp;
    const discrete = bands.reduce((s, b) => s + expectedCascadeVariance(b, [comp], n), 0);
    return discrete > 0 ? { ...comp, alpha: (comp.alpha * (comp.hs / 4) ** 2) / discrete } : { ...comp, alpha: 0 };
  });
  const h0 = bands.map((b, i) => buildInitialSpectrum(b, normalised, createRng(deriveSeed(c.seed, i)), n));
  const slopeVariance = bands.map((b) => cascadeSlopeVariance(b, normalised, n));
  const variance = bands.reduce((s, b) => s + expectedCascadeVariance(b, normalised, n), 0);
  return { h0, slopeVariance, hsTotal: 4 * Math.sqrt(variance), components: normalised };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ocean/spectrum.test.ts && npm run typecheck`
Expected: PASS (all spectrum tests). If `swell energy travels toward the NE` fails, re-check the sign of `travelDirectionXZ`. Don't adjust the test.

- [ ] **Step 5: Commit**

```bash
git add src/ocean/spectrum.ts src/ocean/spectrum.test.ts
git commit -m "feat: add ocean spectrum (JONSWAP swell + wind sea, cascades, h0)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Moment links and reference moments

**Files:**
- Create: `src/dev/momentLink.ts`, `src/dev/referenceMoments.ts`
- Test: `src/dev/momentLink.test.ts`, `src/dev/referenceMoments.test.ts`

**Interfaces:**
- Consumes: `Conditions`, `sanitizeConditions`, `DEFAULT_CONDITIONS`, `cloneConditions`, `wrapDegrees`.
- Produces:
  - `type CameraMode = 'lineup' | 'free'`
  - `interface CameraPose { mode: CameraMode; position: [number, number, number]; yawDeg: number; pitchDeg: number }`
  - `interface Moment { conditions: Conditions; camera: CameraPose; simTime: number; paused: boolean }`
  - `MOMENT_VERSION = 1`, `encodeMoment(m) → '#m=…'`, `decodeMoment(hash) → Moment | null`, `momentFromHash(hash) → Moment | null` (handles `#m=` and `#ref=`)
  - `interface ReferenceMoment { name; description; moment }`, `REFERENCE_MOMENTS: ReferenceMoment[]`, `DEFAULT_MOMENT_NAME = 'morning-offshore'`, `findReferenceMoment(name) → Moment | null`, `defaultMoment() → Moment`, `DEFAULT_LINEUP_POSITION = [-15, 0.8, 0]`

Reference moments are **paused** at a fixed sim time, so screenshots of the same moment are identical from run to run.

- [ ] **Step 1: Write failing tests**

`src/dev/momentLink.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { type Moment, decodeMoment, encodeMoment, momentFromHash } from './momentLink';
import { findReferenceMoment } from './referenceMoments';

const sample: Moment = {
  conditions: { ...cloneConditions(DEFAULT_CONDITIONS), timeOfDay: 16.8333, seed: 99 },
  camera: { mode: 'free', position: [12.5, 40, -3.25], yawDeg: 301, pitchDeg: -12.5 },
  simTime: 123.456,
  paused: true,
};

describe('encode/decode', () => {
  it('round-trips losslessly', () => {
    const hash = encodeMoment(sample);
    expect(hash.startsWith('#m=')).toBe(true);
    expect(decodeMoment(hash)).toEqual(sample);
  });
  it('uses URL-safe characters only', () => {
    expect(encodeMoment(sample).slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('rejects garbage', () => {
    expect(decodeMoment('#m=%%%not-base64')).toBeNull();
    expect(decodeMoment('#m=')).toBeNull();
    expect(decodeMoment('')).toBeNull();
    expect(decodeMoment('#something-else')).toBeNull();
  });
  it('rejects other versions', () => {
    const b64 = btoa(JSON.stringify({ ...sample, v: 2 })).replace(/=+$/, '');
    expect(decodeMoment(`#m=${b64}`)).toBeNull();
  });
  it('rejects invalid camera data', () => {
    const bad = btoa(JSON.stringify({ v: 1, ...sample, camera: { mode: 'drone', position: [0, 0], yawDeg: 'x', pitchDeg: 0 } })).replace(/=+$/, '');
    expect(decodeMoment(`#m=${bad}`)).toBeNull();
  });
  it('sanitises hand-edited conditions instead of rejecting', () => {
    const edited = btoa(JSON.stringify({ v: 1, ...sample, conditions: { swell: { sizeFt: 99 } } })).replace(/=+$/, '');
    const m = decodeMoment(`#m=${edited}`);
    expect(m?.conditions.swell.sizeFt).toBe(12);
    expect(m?.conditions.date).toBe(DEFAULT_CONDITIONS.date);
  });
});

describe('momentFromHash', () => {
  it('resolves #ref=<name>', () => {
    expect(momentFromHash('#ref=golden-hour')).toEqual(findReferenceMoment('golden-hour'));
  });
  it('returns null for unknown references', () => {
    expect(momentFromHash('#ref=unknown')).toBeNull();
  });
  it('decodes #m= links', () => {
    expect(momentFromHash(encodeMoment(sample))).toEqual(sample);
  });
  it('returns null for empty hashes', () => {
    expect(momentFromHash('')).toBeNull();
  });
});
```

`src/dev/referenceMoments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { decodeMoment, encodeMoment } from './momentLink';
import { DEFAULT_MOMENT_NAME, REFERENCE_MOMENTS, defaultMoment, findReferenceMoment } from './referenceMoments';

describe('reference moments', () => {
  it('have unique names', () => {
    const names = REFERENCE_MOMENTS.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('include every moment named in the spec', () => {
    expect(REFERENCE_MOMENTS.map((r) => r.name)).toEqual([
      'pre-dawn', 'first-sun', 'morning-offshore', 'late-morning', 'noon-deep-blue',
      'autumn-glass', 'golden-hour', 'sunset', 'overview',
    ]);
  });
  it('round-trip through moment links', () => {
    for (const r of REFERENCE_MOMENTS) expect(decodeMoment(encodeMoment(r.moment))).toEqual(r.moment);
  });
  it('are paused for reproducible screenshots', () => {
    for (const r of REFERENCE_MOMENTS) expect(r.moment.paused).toBe(true);
  });
  it('default moment uses the default conditions', () => {
    expect(DEFAULT_MOMENT_NAME).toBe('morning-offshore');
    expect(defaultMoment().conditions).toEqual(DEFAULT_CONDITIONS);
    expect(defaultMoment().paused).toBe(false);
  });
  it('autumn-glass has no wind', () => {
    expect(findReferenceMoment('autumn-glass')?.conditions.wind.speedMs).toBe(0);
  });
  it('findReferenceMoment returns independent copies', () => {
    const a = findReferenceMoment('sunset');
    a!.conditions.swell.sizeFt = 11;
    expect(findReferenceMoment('sunset')!.conditions.swell.sizeFt).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dev`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/dev/momentLink.ts`:

```ts
import { sanitizeConditions, wrapDegrees } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import { findReferenceMoment } from './referenceMoments';

export type CameraMode = 'lineup' | 'free';

export interface CameraPose {
  mode: CameraMode;
  position: [number, number, number];
  /** Compass bearing the camera looks along (0 = north, 90 = east). */
  yawDeg: number;
  pitchDeg: number;
}

export interface Moment {
  conditions: Conditions;
  camera: CameraPose;
  simTime: number;
  paused: boolean;
}

export const MOMENT_VERSION = 1;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseCamera(v: unknown): CameraPose | null {
  if (typeof v !== 'object' || v === null) return null;
  const c = v as Record<string, unknown>;
  if (c.mode !== 'lineup' && c.mode !== 'free') return null;
  if (!Array.isArray(c.position) || c.position.length !== 3 || !c.position.every(finite)) return null;
  if (!finite(c.yawDeg) || !finite(c.pitchDeg)) return null;
  return {
    mode: c.mode,
    position: [c.position[0], c.position[1], c.position[2]],
    yawDeg: wrapDegrees(c.yawDeg),
    pitchDeg: Math.max(-89, Math.min(89, c.pitchDeg)),
  };
}

export function encodeMoment(m: Moment): string {
  return `#m=${toBase64Url(JSON.stringify({ v: MOMENT_VERSION, ...m }))}`;
}

export function decodeMoment(hash: string): Moment | null {
  if (!hash.startsWith('#m=') || hash.length <= 3) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(hash.slice(3)));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== MOMENT_VERSION) return null;
  const camera = parseCamera(o.camera);
  if (!camera) return null;
  return {
    conditions: sanitizeConditions(o.conditions),
    camera,
    simTime: finite(o.simTime) && o.simTime >= 0 ? o.simTime : 0,
    paused: o.paused === true,
  };
}

/** `#m=<link>` or `#ref=<reference-moment-name>`; anything else → null. */
export function momentFromHash(hash: string): Moment | null {
  if (hash.startsWith('#ref=')) return findReferenceMoment(decodeURIComponent(hash.slice(5)));
  return decodeMoment(hash);
}
```

`src/dev/referenceMoments.ts`:

```ts
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import type { Conditions } from '../conditions/types';
import type { CameraPose, Moment } from './momentLink';

export interface ReferenceMoment {
  name: string;
  description: string;
  moment: Moment;
}

/** Just seaward (west) of the peak, where you'd sit waiting for sets. */
export const DEFAULT_LINEUP_POSITION: [number, number, number] = [-15, 0.8, 0];
export const DEFAULT_MOMENT_NAME = 'morning-offshore';
const REFERENCE_SIM_TIME = 30;

const lineup = (yawDeg: number, pitchDeg: number): CameraPose => ({
  mode: 'lineup', position: [...DEFAULT_LINEUP_POSITION], yawDeg, pitchDeg,
});

type ConditionsPatch = Partial<Omit<Conditions, 'swell' | 'wind'>> & {
  swell?: Partial<Conditions['swell']>;
  wind?: Partial<Conditions['wind']>;
};

const conditions = (patch: ConditionsPatch): Conditions => {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  return { ...c, ...patch, swell: { ...c.swell, ...patch.swell }, wind: { ...c.wind, ...patch.wind } };
};

const ref = (name: string, description: string, c: Conditions, camera: CameraPose): ReferenceMoment => ({
  name, description, moment: { conditions: c, camera, simTime: REFERENCE_SIM_TIME, paused: true },
});

const doctor = { speedMs: 6, directionDeg: 225 };

export const REFERENCE_MOMENTS: ReferenceMoment[] = [
  ref('pre-dawn', '06:30. Twilight gradient, dark sea, no sun artefacts.', conditions({ timeOfDay: 6.5 }), lineup(90, 4)),
  ref('first-sun', '07:35 facing east. Sunrise colour over the land, first light on the swell.', conditions({ timeOfDay: 7 + 35 / 60 }), lineup(70, 3)),
  ref('morning-offshore', '08:15 facing west (default). Low sun behind the camera, clear deep-blue water, groomed surface.', conditions({}), lineup(270, -2)),
  ref('late-morning', '10:30 facing west. Higher sun, water clarity, colour holding up before the Doctor.', conditions({ timeOfDay: 10.5 }), lineup(270, -3)),
  ref('noon-deep-blue', '12:30 looking down at ~45°. Body colour and clarity, small glitter.', conditions({ timeOfDay: 12.5 }), lineup(270, -45)),
  ref('autumn-glass', '2026-04-20 09:30, no wind. Mirror-smooth swell lines, crisp sky reflection, tight sun highlight.', conditions({ date: '2026-04-20', timeOfDay: 9.5, wind: { speedMs: 0 } }), lineup(270, -3)),
  ref('golden-hour', '16:50 facing the sun, Doctor in. Glitter path, crest transmission, choppier surface, horizon haze.', conditions({ timeOfDay: 16 + 50 / 60, wind: doctor }), lineup(301, 2)),
  ref('sunset', '17:25 facing the sun. Sky colour, exposure, horizon.', conditions({ timeOfDay: 17 + 25 / 60, wind: doctor }), lineup(297, 1)),
  ref('overview', 'Free camera 40 m up at noon. No tiling, LOD transitions, horizon curvature.', conditions({ timeOfDay: 12.5 }), { mode: 'free', position: [60, 40, 0], yawDeg: 270, pitchDeg: -20 }),
];

const cloneMoment = (m: Moment): Moment => ({
  conditions: cloneConditions(m.conditions),
  camera: { ...m.camera, position: [...m.camera.position] },
  simTime: m.simTime,
  paused: m.paused,
});

export function findReferenceMoment(name: string): Moment | null {
  const r = REFERENCE_MOMENTS.find((x) => x.name === name);
  return r ? cloneMoment(r.moment) : null;
}

/** What the app shows with no hash: the default morning session, running. */
export function defaultMoment(): Moment {
  const m = findReferenceMoment(DEFAULT_MOMENT_NAME)!;
  return { ...m, simTime: 0, paused: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/dev && npm run typecheck`
Expected: PASS. Note that `momentLink.ts` and `referenceMoments.ts` import each other; this is safe because neither uses the other's values at module-evaluation time.

- [ ] **Step 5: Commit**

```bash
git add src/dev
git commit -m "feat: add moment links and the spec's reference moments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cameras and input (lineup + free fly), moment restore

**Files:**
- Create: `src/camera/look.ts`, `src/camera/movement.ts`, `src/camera/floatSpring.ts`, `src/camera/lineup.ts`, `src/camera/Input.ts`, `src/camera/CameraRig.ts`
- Test: `src/camera/look.test.ts`, `src/camera/movement.test.ts`, `src/camera/floatSpring.test.ts`, `src/camera/lineup.test.ts`, `src/camera/Input.test.ts`
- Modify: `src/app/App.ts` (full replacement below), `src/main.ts` (pass the initial moment)

**Interfaces:**
- Consumes: `wrapDegrees`, `CameraPose`, `CameraMode`, `Moment`, `momentFromHash`, `defaultMoment`, `DEFAULT_LINEUP_POSITION`, `cloneConditions`, `SimClock`, `clampFrameDt`, `viewportSize`.
- Produces:
  - `interface Look { yawDeg; pitchDeg }`, `applyMouseLook(look, dx, dy, degPerPixel?) → Look`, `lookDirection(look) → [x, y, z]`, `MAX_PITCH_DEG = 89`
  - `interface MoveKeys { forward; back; left; right; up; down; fast; rise }`, `NO_KEYS`, `planarMoveXZ(yawDeg, keys, distance) → { x, z }`, `interface FreeState { position; look; baseSpeedMs }`, `stepFree(state, keys, dt) → FreeState`, `adjustSpeed(baseSpeedMs, wheelDelta) → number`
  - `interface SpringState { value; velocity }`, `stepCriticalSpring(s, target, omega, dt) → SpringState`
  - `LINEUP = { eyeHeightM: 0.8, riseHeightM: 2, driftSpeedMs: 0.5, springOmega: 4 }`, `interface LineupState { x; z; look; height: SpringState }`, `initialLineupState(x, z, look, waterHeight?)`, `stepLineup(s, keys, waterHeight, dt)`
  - `shouldIgnoreKeyTarget(target) → boolean`; `class Input { isDown(code); consumePressed(code); consumeMouse(); consumeWheel(); moveKeys(); dispose() }`
  - `class CameraRig { camera; mode; probeXZ; setPose(pose, waterHeight?); getPose(); update(dt, input, waterHeight) }`
  - `App` constructor becomes `(renderer, container, initial: Moment)`; adds `conditions`, `rig`, `input`, `applyMoment(m)`, `currentMoment()`, protected `waterHeightAtCamera()`.

- [ ] **Step 1: Write failing tests**

`src/camera/look.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_PITCH_DEG, applyMouseLook, lookDirection } from './look';

describe('applyMouseLook', () => {
  it('moving the mouse right turns right (clockwise)', () => {
    expect(applyMouseLook({ yawDeg: 0, pitchDeg: 0 }, 100, 0, 0.1).yawDeg).toBeCloseTo(10);
  });
  it('wraps yaw into [0, 360)', () => {
    expect(applyMouseLook({ yawDeg: 355, pitchDeg: 0 }, 100, 0, 0.1).yawDeg).toBeCloseTo(5);
    expect(applyMouseLook({ yawDeg: 5, pitchDeg: 0 }, -100, 0, 0.1).yawDeg).toBeCloseTo(355);
  });
  it('moving the mouse up looks up, clamped', () => {
    expect(applyMouseLook({ yawDeg: 0, pitchDeg: 0 }, 0, -100, 0.1).pitchDeg).toBeCloseTo(10);
    expect(applyMouseLook({ yawDeg: 0, pitchDeg: 80 }, 0, -1000, 0.1).pitchDeg).toBe(MAX_PITCH_DEG);
  });
});

describe('lookDirection', () => {
  it('yaw 270 (west), level → -X', () => {
    const [x, y, z] = lookDirection({ yawDeg: 270, pitchDeg: 0 });
    expect(x).toBeCloseTo(-1); expect(y).toBeCloseTo(0); expect(z).toBeCloseTo(0);
  });
  it('pitch -90 looks straight down', () => {
    expect(lookDirection({ yawDeg: 0, pitchDeg: -90 })[1]).toBeCloseTo(-1);
  });
});
```

`src/camera/movement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_KEYS, adjustSpeed, planarMoveXZ, stepFree } from './movement';

describe('planarMoveXZ', () => {
  it('forward while facing east moves +X', () => {
    const m = planarMoveXZ(90, { ...NO_KEYS, forward: true }, 2);
    expect(m.x).toBeCloseTo(2); expect(m.z).toBeCloseTo(0);
  });
  it('right while facing north moves east (+X)', () => {
    expect(planarMoveXZ(0, { ...NO_KEYS, right: true }, 1).x).toBeCloseTo(1);
  });
  it('diagonals are not faster', () => {
    const m = planarMoveXZ(0, { ...NO_KEYS, forward: true, right: true }, 1);
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1);
  });
  it('no keys, no movement', () => {
    expect(planarMoveXZ(10, NO_KEYS, 5)).toEqual({ x: 0, z: 0 });
  });
});

describe('stepFree', () => {
  const s = { position: [0, 10, 0] as [number, number, number], look: { yawDeg: 90, pitchDeg: 0 }, baseSpeedMs: 10 };
  it('flies along the look direction', () => {
    expect(stepFree(s, { ...NO_KEYS, forward: true }, 1).position[0]).toBeCloseTo(10);
  });
  it('E goes up, Q goes down, Shift is 5x', () => {
    expect(stepFree(s, { ...NO_KEYS, up: true }, 1).position[1]).toBeCloseTo(20);
    expect(stepFree(s, { ...NO_KEYS, down: true, fast: true }, 1).position[1]).toBeCloseTo(-40);
  });
});

describe('adjustSpeed', () => {
  it('wheel down slows, wheel up speeds, clamped', () => {
    expect(adjustSpeed(10, 100)).toBeLessThan(10);
    expect(adjustSpeed(10, -100)).toBeGreaterThan(10);
    expect(adjustSpeed(0.5, 100)).toBe(0.5);
    expect(adjustSpeed(500, -100)).toBe(500);
    expect(adjustSpeed(10, 0)).toBe(10);
  });
});
```

`src/camera/floatSpring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stepCriticalSpring } from './floatSpring';

describe('stepCriticalSpring', () => {
  it('converges to the target', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) s = stepCriticalSpring(s, 1, 4, 1 / 60);
    expect(s.value).toBeCloseTo(1, 4);
  });
  it('does not overshoot from rest', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) {
      s = stepCriticalSpring(s, 1, 4, 1 / 60);
      expect(s.value).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('is stable for the largest frame step', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 100; i++) s = stepCriticalSpring(s, 1, 4, 0.1);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(s.value).toBeCloseTo(1, 3);
  });
});
```

`src/camera/lineup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_KEYS } from './movement';
import { LINEUP, initialLineupState, stepLineup } from './lineup';

describe('lineup camera', () => {
  it('starts at eye height above the water', () => {
    expect(initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0.5).height.value).toBeCloseTo(0.5 + LINEUP.eyeHeightM);
  });
  it('rides up and down with the water', () => {
    let s = initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0);
    for (let i = 0; i < 240; i++) s = stepLineup(s, NO_KEYS, 1.2, 1 / 60);
    expect(s.height.value).toBeCloseTo(1.2 + LINEUP.eyeHeightM, 2);
  });
  it('holding Space rises for a better view', () => {
    let s = initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0);
    for (let i = 0; i < 240; i++) s = stepLineup(s, { ...NO_KEYS, rise: true }, 0, 1 / 60);
    expect(s.height.value).toBeCloseTo(LINEUP.eyeHeightM + LINEUP.riseHeightM, 2);
  });
  it('drifts slowly at paddling pace', () => {
    let s = initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0);
    s = stepLineup(s, { ...NO_KEYS, forward: true }, 0, 1);
    expect(s.x).toBeCloseTo(-LINEUP.driftSpeedMs);
    expect(s.z).toBeCloseTo(0);
  });
});
```

`src/camera/Input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldIgnoreKeyTarget } from './Input';

describe('shouldIgnoreKeyTarget', () => {
  it('ignores typing in form fields (dev panel)', () => {
    expect(shouldIgnoreKeyTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreKeyTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreKeyTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreKeyTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });
  it('accepts keys on the canvas / body', () => {
    expect(shouldIgnoreKeyTarget({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
    expect(shouldIgnoreKeyTarget(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/camera`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the pure camera modules**

`src/camera/look.ts`:

```ts
import { wrapDegrees } from '../conditions/sanitize';

export interface Look {
  /** Compass bearing (0 = north, 90 = east). */
  yawDeg: number;
  pitchDeg: number;
}

export const MAX_PITCH_DEG = 89;
export const DEFAULT_DEG_PER_PIXEL = 0.12;
const DEG = Math.PI / 180;

export function applyMouseLook(look: Look, dx: number, dy: number, degPerPixel = DEFAULT_DEG_PER_PIXEL): Look {
  return {
    yawDeg: wrapDegrees(look.yawDeg + dx * degPerPixel),
    pitchDeg: Math.max(-MAX_PITCH_DEG, Math.min(MAX_PITCH_DEG, look.pitchDeg - dy * degPerPixel)),
  };
}

export function lookDirection(look: Look): [number, number, number] {
  const yaw = look.yawDeg * DEG, pitch = look.pitchDeg * DEG;
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}
```

`src/camera/movement.ts`:

```ts
import { type Look, lookDirection } from './look';

export interface MoveKeys {
  forward: boolean; back: boolean; left: boolean; right: boolean;
  up: boolean; down: boolean; fast: boolean; rise: boolean;
}

export const NO_KEYS: MoveKeys = Object.freeze({
  forward: false, back: false, left: false, right: false, up: false, down: false, fast: false, rise: false,
});

export const FAST_MULTIPLIER = 5;
const DEG = Math.PI / 180;

/** Horizontal movement relative to the yaw; diagonals normalised. */
export function planarMoveXZ(yawDeg: number, keys: MoveKeys, distance: number): { x: number; z: number } {
  const yaw = yawDeg * DEG;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = Math.sin(yaw);
  let x = 0, z = 0;
  if (keys.forward) { x += fx; z += fz; }
  if (keys.back) { x -= fx; z -= fz; }
  if (keys.right) { x += rx; z += rz; }
  if (keys.left) { x -= rx; z -= rz; }
  const len = Math.hypot(x, z);
  return len === 0 ? { x: 0, z: 0 } : { x: (x / len) * distance, z: (z / len) * distance };
}

export interface FreeState {
  position: [number, number, number];
  look: Look;
  baseSpeedMs: number;
}

export function stepFree(s: FreeState, keys: MoveKeys, dt: number): FreeState {
  const speed = s.baseSpeedMs * (keys.fast ? FAST_MULTIPLIER : 1) * dt;
  const f = lookDirection(s.look);
  const yaw = s.look.yawDeg * DEG;
  const r = [Math.cos(yaw), 0, Math.sin(yaw)];
  const v = [0, 0, 0];
  const add = (d: number[], sign: number) => { v[0] += d[0] * sign; v[1] += d[1] * sign; v[2] += d[2] * sign; };
  if (keys.forward) add(f, 1);
  if (keys.back) add(f, -1);
  if (keys.right) add(r, 1);
  if (keys.left) add(r, -1);
  if (keys.up) v[1] += 1;
  if (keys.down) v[1] -= 1;
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return s;
  const k = speed / len;
  return { ...s, position: [s.position[0] + v[0] * k, s.position[1] + v[1] * k, s.position[2] + v[2] * k] };
}

/** Mouse wheel scales fly speed by 15% per notch, within [0.5, 500] m/s. */
export function adjustSpeed(baseSpeedMs: number, wheelDelta: number): number {
  if (wheelDelta === 0) return baseSpeedMs;
  return Math.min(500, Math.max(0.5, baseSpeedMs * (wheelDelta > 0 ? 1 / 1.15 : 1.15)));
}
```

`src/camera/floatSpring.ts`:

```ts
export interface SpringState {
  value: number;
  velocity: number;
}

/** Exact critically damped spring step: stable for any dt, never overshoots from rest. */
export function stepCriticalSpring(s: SpringState, target: number, omega: number, dt: number): SpringState {
  const x0 = s.value - target;
  const v0 = s.velocity;
  const e = Math.exp(-omega * dt);
  return {
    value: target + (x0 + (v0 + omega * x0) * dt) * e,
    velocity: (v0 - omega * (v0 + omega * x0) * dt) * e,
  };
}
```

`src/camera/lineup.ts`:

```ts
import { type SpringState, stepCriticalSpring } from './floatSpring';
import type { Look } from './look';
import { type MoveKeys, planarMoveXZ } from './movement';

export const LINEUP = { eyeHeightM: 0.8, riseHeightM: 2, driftSpeedMs: 0.5, springOmega: 4 } as const;

export interface LineupState {
  x: number;
  z: number;
  look: Look;
  /** Eye height (world Y), riding the water through a spring, like sitting on a board. */
  height: SpringState;
}

export function initialLineupState(x: number, z: number, look: Look, waterHeight = 0): LineupState {
  return { x, z, look, height: { value: waterHeight + LINEUP.eyeHeightM, velocity: 0 } };
}

export function stepLineup(s: LineupState, keys: MoveKeys, waterHeight: number, dt: number): LineupState {
  const move = planarMoveXZ(s.look.yawDeg, keys, LINEUP.driftSpeedMs * dt);
  const target = waterHeight + LINEUP.eyeHeightM + (keys.rise ? LINEUP.riseHeightM : 0);
  return { ...s, x: s.x + move.x, z: s.z + move.z, height: stepCriticalSpring(s.height, target, LINEUP.springOmega, dt) };
}
```

- [ ] **Step 4: Implement Input**

`src/camera/Input.ts`:

```ts
import type { MoveKeys } from './movement';

/** Keys typed into form fields (the dev panel) must not drive the camera or hotkeys. */
export function shouldIgnoreKeyTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const t = target as { tagName?: string; isContentEditable?: boolean };
  return t.isContentEditable === true || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheel = 0;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('wheel', this.onWheel, { passive: true });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per physical key press. */
  consumePressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  consumeMouse(): { dx: number; dy: number } {
    const d = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  moveKeys(): MoveKeys {
    const d = (...codes: string[]) => codes.some((c) => this.down.has(c));
    return {
      forward: d('KeyW', 'ArrowUp'), back: d('KeyS', 'ArrowDown'),
      left: d('KeyA', 'ArrowLeft'), right: d('KeyD', 'ArrowRight'),
      up: d('KeyE'), down: d('KeyQ'), fast: d('ShiftLeft', 'ShiftRight'), rise: d('Space'),
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('wheel', this.onWheel);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (shouldIgnoreKeyTarget(e.target)) return;
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
  };

  private onMouseDown = (): void => {
    if (document.pointerLockElement !== this.element) void this.element.requestPointerLock();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.element) return;
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    this.wheel += e.deltaY;
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/camera`
Expected: PASS.

- [ ] **Step 6: CameraRig, App and main**

`src/camera/CameraRig.ts`:

```ts
import * as THREE from 'three/webgpu';
import type { CameraMode, CameraPose } from '../dev/momentLink';
import { DEFAULT_LINEUP_POSITION } from '../dev/referenceMoments';
import type { Input } from './Input';
import { type LineupState, initialLineupState, stepLineup } from './lineup';
import { applyMouseLook, lookDirection } from './look';
import { type FreeState, adjustSpeed, stepFree } from './movement';

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60000);
  mode: CameraMode = 'lineup';
  private lineup: LineupState;
  private free: FreeState;

  constructor() {
    this.lineup = initialLineupState(DEFAULT_LINEUP_POSITION[0], DEFAULT_LINEUP_POSITION[2], { yawDeg: 270, pitchDeg: -2 });
    this.free = { position: [0, 10, 0], look: { yawDeg: 270, pitchDeg: -10 }, baseSpeedMs: 10 };
    this.apply();
  }

  /** Where the lineup camera needs to know the water height. */
  get probeXZ(): { x: number; z: number } {
    return { x: this.lineup.x, z: this.lineup.z };
  }

  setPose(p: CameraPose, waterHeight = 0): void {
    this.mode = p.mode;
    const look = { yawDeg: p.yawDeg, pitchDeg: p.pitchDeg };
    if (p.mode === 'lineup') this.lineup = initialLineupState(p.position[0], p.position[2], look, waterHeight);
    else this.free = { ...this.free, position: [...p.position], look };
    this.apply();
  }

  getPose(): CameraPose {
    if (this.mode === 'lineup') {
      const l = this.lineup;
      return { mode: 'lineup', position: [l.x, l.height.value, l.z], yawDeg: l.look.yawDeg, pitchDeg: l.look.pitchDeg };
    }
    return { mode: 'free', position: [...this.free.position], yawDeg: this.free.look.yawDeg, pitchDeg: this.free.look.pitchDeg };
  }

  update(dt: number, input: Input, waterHeight: number): void {
    if (input.consumePressed('KeyC')) this.toggleMode(waterHeight);
    const { dx, dy } = input.consumeMouse();
    const wheel = input.consumeWheel();
    const keys = input.moveKeys();
    if (this.mode === 'lineup') {
      this.lineup = stepLineup({ ...this.lineup, look: applyMouseLook(this.lineup.look, dx, dy) }, keys, waterHeight, dt);
    } else {
      const look = applyMouseLook(this.free.look, dx, dy);
      this.free = stepFree({ ...this.free, look, baseSpeedMs: adjustSpeed(this.free.baseSpeedMs, wheel) }, keys, dt);
    }
    this.apply();
  }

  private toggleMode(waterHeight: number): void {
    if (this.mode === 'lineup') {
      const p = this.getPose();
      this.free = { ...this.free, position: p.position, look: { ...this.lineup.look } };
      this.mode = 'free';
    } else {
      this.lineup = initialLineupState(this.free.position[0], this.free.position[2], { ...this.free.look }, waterHeight);
      this.mode = 'lineup';
    }
  }

  private apply(): void {
    const pose = this.getPose();
    const [x, y, z] = pose.position;
    const d = lookDirection({ yawDeg: pose.yawDeg, pitchDeg: pose.pitchDeg });
    this.camera.position.set(x, y, z);
    this.camera.lookAt(x + d[0], y + d[1], z + d[2]);
  }
}
```

`src/app/App.ts` (full replacement):

```ts
import * as THREE from 'three/webgpu';
import { CameraRig } from '../camera/CameraRig';
import { Input } from '../camera/Input';
import { cloneConditions } from '../conditions/defaults';
import type { Conditions } from '../conditions/types';
import { type Moment, momentFromHash } from '../dev/momentLink';
import { SimClock, clampFrameDt, viewportSize } from './clock';

export class App {
  readonly scene = new THREE.Scene();
  readonly clock = new SimClock();
  readonly rig = new CameraRig();
  readonly input: Input;
  conditions: Conditions;
  private lastMs = performance.now();
  /** Temporary visual reference until the ocean exists (removed in Task 12). */
  private readonly devGrid = new THREE.GridHelper(200, 40, 0x88aacc, 0x335577);

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
    initial: Moment,
  ) {
    this.input = new Input(renderer.domElement);
    this.scene.background = new THREE.Color(0x0b2a4a);
    this.scene.add(this.devGrid);
    this.conditions = cloneConditions(initial.conditions);
    this.applyMoment(initial);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('hashchange', this.onHashChange);
    this.onResize();
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  applyMoment(m: Moment): void {
    this.conditions = cloneConditions(m.conditions);
    this.clock.setTime(m.simTime);
    this.clock.paused = m.paused;
    this.rig.setPose(m.camera, this.waterHeightAtCamera());
  }

  currentMoment(): Moment {
    return { conditions: cloneConditions(this.conditions), camera: this.rig.getPose(), simTime: this.clock.simTime, paused: this.clock.paused };
  }

  /** Replaced by the GPU height probe in Task 14. */
  protected waterHeightAtCamera(): number {
    return 0;
  }

  private onHashChange = (): void => {
    const m = momentFromHash(location.hash);
    if (m) this.applyMoment(m);
  };

  private onResize = (): void => {
    const { width, height } = viewportSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private frame = (): void => {
    const now = performance.now();
    const realDt = clampFrameDt((now - this.lastMs) / 1000);
    this.lastMs = now;
    this.clock.tick(realDt);
    this.rig.update(realDt, this.input, this.waterHeightAtCamera());
    this.renderer.render(this.scene, this.camera);
  };
}
```

In `src/main.ts`, add the imports and replace the final line:

```ts
import { momentFromHash } from './dev/momentLink';
import { defaultMoment } from './dev/referenceMoments';
// ...
  new App(renderer, container, momentFromHash(location.hash) ?? defaultMoment()).start();
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck`
Expected: all tests PASS; typecheck clean.

In the browser pane, open `http://localhost:5173/`, click the canvas (pointer lock), and check that:
- the grid sits just below eye level, and the mouse looks around;
- WASD drifts slowly and holding Space rises;
- `C` switches to free fly (WASD/QE/Shift, wheel changes speed) and `C` again returns to the lineup;
- opening `http://localhost:5173/#ref=overview` shows the grid from 40 m up looking west.

Take a screenshot of `#ref=overview`. The console must have no errors.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: add lineup and free cameras, input, and moment restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Atmosphere lookup tables + GPU self-test harness

**Files:**
- Create: `src/sky/atmosphereParams.ts`, `src/sky/lutMapping.ts`, `src/sky/atmosphereNodes.ts`, `src/sky/AtmosphereLuts.ts`, `src/sky/sky.selftest.ts`, `src/dev/selfTest.ts`, `src/dev/selfTests.ts`
- Test: `src/sky/atmosphereParams.test.ts`, `src/sky/lutMapping.test.ts`
- Modify: `src/main.ts` (`?selftest` branch)

**Interfaces:**
- Produces:
  - `type Rgb = [number, number, number]`; `interface AtmosphereParams { groundRadiusKm; topRadiusKm; rayleighScatteringPerKm: Rgb; rayleighScaleHeightKm; mieScatteringPerKm; mieExtinctionPerKm; mieScaleHeightKm; mieG; ozoneAbsorptionPerKm: Rgb; ozoneCenterKm; ozoneHalfWidthKm; hazeFactor; groundAlbedo; sunIlluminance; nightFloor }`, `DEFAULT_ATMOSPHERE`, `ozoneDensity(hKm, p)`, `extinctionPerKm(hKm, p) → Rgb`
  - `TRANSMITTANCE_LUT`, `MULTI_SCATTERING_LUT`, `SKY_VIEW_LUT` sizes; `transmittanceUvToRMu(u, v, radii)`, `transmittanceRMuToUv(r, mu, radii)`, `skyViewUvToAngles(u, v)`, `skyViewAnglesToUv(elevation, azimuth)`
  - TSL: `createAtmosphereUniforms(p)`, `type AtmosphereUniforms`, `updateAtmosphereUniforms(u, p)`, `raySphere(ro, rd, radius)`, `medium(u)`, `rayleighPhase(cosT)`, `miePhase(cosT, g)`, `transmittanceUvFromRMu(u, r, mu)`, `rMuFromTransmittanceUv(u, uv)`, `skyViewUvFromAngles(elevation, azimuth)`, `anglesFromSkyViewUv(uv)`, `multiScatteringUv(u, r, muS)`
  - `class AtmosphereLuts { transmittance; multiScattering; skyView: StorageTexture; skyLightAttr: StorageBufferAttribute; skyLightRead; sunElevation; cameraHeightKm; renderStatic(r); renderDynamic(r); transmittanceAt(r, mu); multiScatteringAt(r, muS) }`. The `skyLight` layout is `[0]` = sky irradiance on a horizontal surface and `[1]` = sun illuminance at the surface (RGB in `.xyz`).
  - Self-test harness: `interface SelfTest { name; run(renderer) → Promise<{ pass; detail }> }`, `registerSelfTest(t)`, `runSelfTests(renderer) → Promise<SelfTestResult[]>`, `renderSelfTestReport(results)`.

This is Hillaire's sky model ("A Scalable and Production Ready Sky and Atmosphere Rendering Technique", 2020). Distances inside the atmosphere code are in **kilometres**. The sky-view table is parameterised by elevation and by azimuth measured from the sun, with extra resolution near the horizon.

- [ ] **Step 1: Write failing tests for the pure parts**

`src/sky/atmosphereParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE, extinctionPerKm, ozoneDensity } from './atmosphereParams';

describe('atmosphere params', () => {
  it('sea-level extinction = Rayleigh + hazy Mie (no ozone at the ground)', () => {
    const [r, g, b] = extinctionPerKm(0, DEFAULT_ATMOSPHERE);
    expect(b).toBeCloseTo(0.0331 + 0.00444 * 2, 6);
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
  });
  it('haze factor scales only the aerosol term', () => {
    const clear = extinctionPerKm(0, { ...DEFAULT_ATMOSPHERE, hazeFactor: 1 });
    expect(clear[2]).toBeCloseTo(0.0331 + 0.00444, 6);
  });
  it('ozone peaks at 25 km and vanishes at the ground and above 40 km', () => {
    expect(ozoneDensity(25, DEFAULT_ATMOSPHERE)).toBe(1);
    expect(ozoneDensity(0, DEFAULT_ATMOSPHERE)).toBe(0);
    expect(ozoneDensity(41, DEFAULT_ATMOSPHERE)).toBe(0);
  });
});
```

`src/sky/lutMapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from './atmosphereParams';
import { skyViewAnglesToUv, skyViewUvToAngles, transmittanceRMuToUv, transmittanceUvToRMu } from './lutMapping';

const radii = { groundRadiusKm: DEFAULT_ATMOSPHERE.groundRadiusKm, topRadiusKm: DEFAULT_ATMOSPHERE.topRadiusKm };

describe('transmittance LUT mapping', () => {
  it('round-trips (r, mu) above the horizon', () => {
    for (const r of [6360.01, 6365, 6400, 6459]) {
      const horizonMu = -Math.sqrt(Math.max(0, 1 - (radii.groundRadiusKm / r) ** 2));
      for (let i = 1; i < 20; i++) {
        const mu = horizonMu + ((1 - horizonMu) * i) / 20;
        const { u, v } = transmittanceRMuToUv(r, mu, radii);
        expect(u).toBeGreaterThanOrEqual(-1e-9);
        expect(u).toBeLessThanOrEqual(1 + 1e-9);
        const back = transmittanceUvToRMu(u, v, radii);
        expect(back.r).toBeCloseTo(r, 3);
        expect(back.mu).toBeCloseTo(mu, 3);
      }
    }
  });
  it('u = 0 looks straight up; v = 0 is the ground', () => {
    expect(transmittanceUvToRMu(0, 0.5, radii).mu).toBeCloseTo(1, 6);
    expect(transmittanceUvToRMu(0.5, 0, radii).r).toBeCloseTo(radii.groundRadiusKm, 6);
  });
});

describe('sky-view LUT mapping', () => {
  it('round-trips angles', () => {
    for (const el of [-1.2, -0.3, -0.01, 0, 0.01, 0.4, 1.5]) {
      for (const az of [0, 1, 3, 6]) {
        const { u, v } = skyViewAnglesToUv(el, az);
        const back = skyViewUvToAngles(u, v);
        expect(back.elevation).toBeCloseTo(el, 6);
        expect(back.azimuth).toBeCloseTo(az, 6);
      }
    }
  });
  it('puts the horizon at v = 0.5 and gives it extra resolution', () => {
    expect(skyViewAnglesToUv(0, 0).v).toBe(0.5);
    expect(skyViewAnglesToUv((1 * Math.PI) / 180, 0).v - 0.5).toBeGreaterThan(0.05);
  });
  it('wraps azimuth', () => {
    expect(skyViewAnglesToUv(0.2, -0.5).u).toBeCloseTo(1 - 0.5 / (2 * Math.PI), 6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sky`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the pure modules**

`src/sky/atmosphereParams.ts`:

```ts
export type Rgb = [number, number, number];

export interface AtmosphereParams {
  groundRadiusKm: number;
  topRadiusKm: number;
  rayleighScatteringPerKm: Rgb;
  rayleighScaleHeightKm: number;
  mieScatteringPerKm: number;
  mieExtinctionPerKm: number;
  mieScaleHeightKm: number;
  mieG: number;
  ozoneAbsorptionPerKm: Rgb;
  ozoneCenterKm: number;
  ozoneHalfWidthKm: number;
  /** Multiplies aerosol (Mie) density: coastal sea haze. */
  hazeFactor: number;
  groundAlbedo: number;
  /** Sun illuminance at the top of the atmosphere, in scene units (exposure handles absolute scale). */
  sunIlluminance: number;
  /** Faint night-sky radiance as a fraction of sun illuminance, so night isn't pure black. */
  nightFloor: number;
}

/** Earth-like values from Hillaire 2020, with Mie raised for the Capes' sea haze. */
export const DEFAULT_ATMOSPHERE: AtmosphereParams = {
  groundRadiusKm: 6360,
  topRadiusKm: 6460,
  rayleighScatteringPerKm: [5.802e-3, 13.558e-3, 33.1e-3],
  rayleighScaleHeightKm: 8,
  mieScatteringPerKm: 3.996e-3,
  mieExtinctionPerKm: 4.44e-3,
  mieScaleHeightKm: 1.2,
  mieG: 0.8,
  ozoneAbsorptionPerKm: [0.65e-3, 1.881e-3, 0.085e-3],
  ozoneCenterKm: 25,
  ozoneHalfWidthKm: 15,
  hazeFactor: 2,
  groundAlbedo: 0.1,
  sunIlluminance: 20,
  nightFloor: 0.0004,
};

export function ozoneDensity(hKm: number, p: AtmosphereParams): number {
  return Math.max(0, 1 - Math.abs(hKm - p.ozoneCenterKm) / p.ozoneHalfWidthKm);
}

export function extinctionPerKm(hKm: number, p: AtmosphereParams): Rgb {
  const rayleigh = Math.exp(-hKm / p.rayleighScaleHeightKm);
  const mie = Math.exp(-hKm / p.mieScaleHeightKm) * p.mieExtinctionPerKm * p.hazeFactor;
  const ozone = ozoneDensity(hKm, p);
  return [0, 1, 2].map((i) => p.rayleighScatteringPerKm[i] * rayleigh + mie + p.ozoneAbsorptionPerKm[i] * ozone) as Rgb;
}
```

`src/sky/lutMapping.ts`:

```ts
export const TRANSMITTANCE_LUT = { width: 256, height: 64 } as const;
export const MULTI_SCATTERING_LUT = { width: 32, height: 32 } as const;
export const SKY_VIEW_LUT = { width: 192, height: 108 } as const;

export interface AtmosphereRadii {
  groundRadiusKm: number;
  topRadiusKm: number;
}

const horizonDistance = (a: AtmosphereRadii) => Math.sqrt(a.topRadiusKm ** 2 - a.groundRadiusKm ** 2);

/** Bruneton/Hillaire transmittance parameterisation. Covers every ray that does not hit the ground. */
export function transmittanceUvToRMu(u: number, v: number, a: AtmosphereRadii): { r: number; mu: number } {
  const H = horizonDistance(a);
  const rho = H * v;
  const r = Math.sqrt(rho * rho + a.groundRadiusKm ** 2);
  const dMin = a.topRadiusKm - r;
  const dMax = rho + H;
  const d = dMin + u * (dMax - dMin);
  const mu = d < 1e-6 ? 1 : (H * H - rho * rho - d * d) / (2 * r * d);
  return { r, mu: Math.max(-1, Math.min(1, mu)) };
}

export function transmittanceRMuToUv(r: number, mu: number, a: AtmosphereRadii): { u: number; v: number } {
  const H = horizonDistance(a);
  const rho = Math.sqrt(Math.max(0, r * r - a.groundRadiusKm ** 2));
  const disc = r * r * (mu * mu - 1) + a.topRadiusKm ** 2;
  const d = Math.max(0, -r * mu + Math.sqrt(Math.max(0, disc)));
  const dMin = a.topRadiusKm - r;
  const dMax = rho + H;
  return { u: (d - dMin) / (dMax - dMin), v: rho / H };
}

/** u = azimuth from the sun / 2π; v concentrates texels near the horizon (v = 0.5). */
export function skyViewAnglesToUv(elevation: number, azimuth: number): { u: number; v: number } {
  const turns = azimuth / (2 * Math.PI);
  const s = Math.sign(elevation) * Math.sqrt(Math.abs(elevation) / (Math.PI / 2));
  return { u: turns - Math.floor(turns), v: 0.5 + 0.5 * s };
}

export function skyViewUvToAngles(u: number, v: number): { elevation: number; azimuth: number } {
  const s = 2 * v - 1;
  return { elevation: Math.sign(s) * s * s * (Math.PI / 2), azimuth: u * 2 * Math.PI };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sky`
Expected: PASS.

- [ ] **Step 5: TSL atmosphere building blocks**

`src/sky/atmosphereNodes.ts`:

```ts
import * as THREE from 'three/webgpu';
import { PI, abs, clamp, dot, exp, float, fract, max, pow, select, sign, sqrt, uniform, vec2 } from 'three/tsl';
import type { AtmosphereParams } from './atmosphereParams';

// TSL graphs are dynamically typed; N keeps signatures readable without fighting @types/three generics.
type N = any;

export function createAtmosphereUniforms(p: AtmosphereParams) {
  return {
    groundRadius: uniform(p.groundRadiusKm),
    topRadius: uniform(p.topRadiusKm),
    rayleighScattering: uniform(new THREE.Vector3(...p.rayleighScatteringPerKm)),
    rayleighScaleHeight: uniform(p.rayleighScaleHeightKm),
    mieScattering: uniform(p.mieScatteringPerKm * p.hazeFactor),
    mieExtinction: uniform(p.mieExtinctionPerKm * p.hazeFactor),
    mieScaleHeight: uniform(p.mieScaleHeightKm),
    mieG: uniform(p.mieG),
    ozoneAbsorption: uniform(new THREE.Vector3(...p.ozoneAbsorptionPerKm)),
    ozoneCenter: uniform(p.ozoneCenterKm),
    ozoneHalfWidth: uniform(p.ozoneHalfWidthKm),
    groundAlbedo: uniform(p.groundAlbedo),
    sunIlluminance: uniform(p.sunIlluminance),
    nightFloor: uniform(p.nightFloor),
  };
}

export type AtmosphereUniforms = ReturnType<typeof createAtmosphereUniforms>;

export function updateAtmosphereUniforms(u: AtmosphereUniforms, p: AtmosphereParams): void {
  u.groundRadius.value = p.groundRadiusKm;
  u.topRadius.value = p.topRadiusKm;
  u.rayleighScattering.value.set(...p.rayleighScatteringPerKm);
  u.rayleighScaleHeight.value = p.rayleighScaleHeightKm;
  u.mieScattering.value = p.mieScatteringPerKm * p.hazeFactor;
  u.mieExtinction.value = p.mieExtinctionPerKm * p.hazeFactor;
  u.mieScaleHeight.value = p.mieScaleHeightKm;
  u.mieG.value = p.mieG;
  u.ozoneAbsorption.value.set(...p.ozoneAbsorptionPerKm);
  u.ozoneCenter.value = p.ozoneCenterKm;
  u.ozoneHalfWidth.value = p.ozoneHalfWidthKm;
  u.groundAlbedo.value = p.groundAlbedo;
  u.sunIlluminance.value = p.sunIlluminance;
  u.nightFloor.value = p.nightFloor;
}

/** Nearest positive distance along rd from ro to a sphere centred at the origin; -1 if missed. */
export function raySphere(ro: N, rd: N, radius: N): N {
  const b = dot(ro, rd);
  const c = dot(ro, ro).sub(radius.mul(radius));
  const disc = b.mul(b).sub(c);
  const s = sqrt(max(disc, 0.0));
  const t0 = b.negate().sub(s);
  const t1 = b.negate().add(s);
  const t = select(t0.greaterThan(0.0), t0, t1);
  return select(disc.lessThan(0.0).or(t1.lessThan(0.0)), float(-1.0), t);
}

/** Scattering/extinction per km at altitude h (km). Rayleigh is RGB, Mie is grey. */
export function medium(u: AtmosphereUniforms) {
  const rayleighDensity = (h: N) => exp(h.negate().div(u.rayleighScaleHeight));
  const mieDensity = (h: N) => exp(h.negate().div(u.mieScaleHeight));
  const ozoneDensity = (h: N) => max(0.0, float(1.0).sub(abs(h.sub(u.ozoneCenter)).div(u.ozoneHalfWidth)));
  return {
    rayleigh: (h: N): N => u.rayleighScattering.mul(rayleighDensity(h)),
    mie: (h: N): N => u.mieScattering.mul(mieDensity(h)),
    extinction: (h: N): N =>
      u.rayleighScattering.mul(rayleighDensity(h)).add(u.mieExtinction.mul(mieDensity(h))).add(u.ozoneAbsorption.mul(ozoneDensity(h))),
  };
}

export const rayleighPhase = (cosT: N): N => float(3.0).div(PI.mul(16.0)).mul(cosT.mul(cosT).add(1.0));

/** Cornette–Shanks phase function. */
export function miePhase(cosT: N, g: N): N {
  const g2 = g.mul(g);
  const num = float(1.0).sub(g2).mul(cosT.mul(cosT).add(1.0)).mul(3.0);
  const den = PI.mul(8.0).mul(g2.add(2.0)).mul(pow(g2.add(1.0).sub(g.mul(cosT).mul(2.0)), 1.5));
  return num.div(den);
}

export function transmittanceUvFromRMu(u: AtmosphereUniforms, r: N, mu: N): N {
  const H = sqrt(u.topRadius.mul(u.topRadius).sub(u.groundRadius.mul(u.groundRadius)));
  const rho = sqrt(max(r.mul(r).sub(u.groundRadius.mul(u.groundRadius)), 0.0));
  const disc = r.mul(r).mul(mu.mul(mu).sub(1.0)).add(u.topRadius.mul(u.topRadius));
  const d = max(0.0, r.negate().mul(mu).add(sqrt(max(disc, 0.0))));
  const dMin = u.topRadius.sub(r);
  const dMax = rho.add(H);
  return vec2(d.sub(dMin).div(dMax.sub(dMin)), rho.div(H));
}

/** Returns vec2(r, mu). */
export function rMuFromTransmittanceUv(u: AtmosphereUniforms, uv: N): N {
  const H = sqrt(u.topRadius.mul(u.topRadius).sub(u.groundRadius.mul(u.groundRadius)));
  const rho = H.mul(uv.y);
  const r = sqrt(rho.mul(rho).add(u.groundRadius.mul(u.groundRadius)));
  const dMin = u.topRadius.sub(r);
  const dMax = rho.add(H);
  const d = dMin.add(uv.x.mul(dMax.sub(dMin)));
  const mu = select(d.lessThan(1e-6), float(1.0), H.mul(H).sub(rho.mul(rho)).sub(d.mul(d)).div(r.mul(d).mul(2.0)));
  return vec2(r, clamp(mu, -1.0, 1.0));
}

export function skyViewUvFromAngles(elevation: N, azimuth: N): N {
  const s = sign(elevation).mul(sqrt(abs(elevation).div(PI.mul(0.5))));
  return vec2(fract(azimuth.div(PI.mul(2.0))), s.mul(0.5).add(0.5));
}

/** Returns vec2(elevation, azimuth). */
export function anglesFromSkyViewUv(uv: N): N {
  const s = uv.y.mul(2.0).sub(1.0);
  return vec2(sign(s).mul(s).mul(s).mul(PI.mul(0.5)), uv.x.mul(PI.mul(2.0)));
}

export function multiScatteringUv(u: AtmosphereUniforms, r: N, muS: N): N {
  return vec2(muS.mul(0.5).add(0.5), clamp(r.sub(u.groundRadius).div(u.topRadius.sub(u.groundRadius)), 0.0, 1.0));
}
```

- [ ] **Step 6: LUT compute passes**

`src/sky/AtmosphereLuts.ts`:

```ts
import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, PI, cos, dot, exp, float, instanceIndex, length, max, min, normalize, saturate, select, sin,
  smoothstep, sqrt, storage, texture, textureStore, uint, uniform, uvec2, vec2, vec3, vec4,
} from 'three/tsl';
import {
  type AtmosphereUniforms, anglesFromSkyViewUv, medium, miePhase, multiScatteringUv, raySphere, rayleighPhase,
  rMuFromTransmittanceUv, skyViewUvFromAngles, transmittanceUvFromRMu,
} from './atmosphereNodes';
import { MULTI_SCATTERING_LUT, SKY_VIEW_LUT, TRANSMITTANCE_LUT } from './lutMapping';

type N = any;

const TRANSMITTANCE_STEPS = 40;
const MS_DIRECTIONS_SQRT = 8;
const MS_STEPS = 20;
const SKY_VIEW_STEPS = 32;
const IRRADIANCE_ELEVATION_SAMPLES = 16;
const IRRADIANCE_AZIMUTH_SAMPLES = 32;

function lutTexture(width: number, height: number, wrapS: THREE.Wrapping = THREE.ClampToEdgeWrapping): THREE.StorageTexture {
  const t = new THREE.StorageTexture(width, height);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = wrapS;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

export class AtmosphereLuts {
  readonly transmittance = lutTexture(TRANSMITTANCE_LUT.width, TRANSMITTANCE_LUT.height);
  readonly multiScattering = lutTexture(MULTI_SCATTERING_LUT.width, MULTI_SCATTERING_LUT.height);
  readonly skyView = lutTexture(SKY_VIEW_LUT.width, SKY_VIEW_LUT.height, THREE.RepeatWrapping);
  /** [0] = sky irradiance on a horizontal surface, [1] = sun illuminance at the surface. RGB in .xyz. */
  readonly skyLightAttr = new THREE.StorageBufferAttribute(new Float32Array(8), 4);
  readonly skyLightRead = storage(this.skyLightAttr, 'vec4', 2).toReadOnly();
  /** Sun elevation in radians. The sky-view LUT is built in a frame where the sun has azimuth 0. */
  readonly sunElevation = uniform(0.3);
  readonly cameraHeightKm = uniform(0.002);
  private readonly staticPasses: THREE.ComputeNode[];
  private readonly dynamicPasses: THREE.ComputeNode[];

  constructor(private readonly u: AtmosphereUniforms) {
    this.staticPasses = [this.buildTransmittancePass(), this.buildMultiScatteringPass()];
    this.dynamicPasses = [this.buildSkyViewPass(), this.buildSkyLightPass()];
  }

  renderStatic(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.staticPasses);
  }

  renderDynamic(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.dynamicPasses);
  }

  transmittanceAt(r: N, mu: N): N {
    return texture(this.transmittance, transmittanceUvFromRMu(this.u, r, mu)).level(0).rgb;
  }

  multiScatteringAt(r: N, muS: N): N {
    return texture(this.multiScattering, multiScatteringUv(this.u, r, muS)).level(0).rgb;
  }

  private buildTransmittancePass(): THREE.ComputeNode {
    const { width, height } = TRANSMITTANCE_LUT;
    const u = this.u;
    const med = medium(u);
    return Fn(() => {
      const x = instanceIndex.mod(uint(width));
      const y = instanceIndex.div(uint(width));
      const uv = vec2(float(x).add(0.5).div(width), float(y).add(0.5).div(height));
      const rMu = rMuFromTransmittanceUv(u, uv);
      const ro = vec3(0.0, rMu.x, 0.0);
      const rd = vec3(sqrt(max(float(1.0).sub(rMu.y.mul(rMu.y)), 0.0)), rMu.y, 0.0);
      const dt = max(raySphere(ro, rd, u.topRadius), 0.0).div(TRANSMITTANCE_STEPS);
      const depth = vec3(0.0).toVar();
      Loop({ start: 0, end: TRANSMITTANCE_STEPS, name: 'i' }, ({ i }: N) => {
        const h = length(ro.add(rd.mul(float(i).add(0.5).mul(dt)))).sub(u.groundRadius);
        depth.addAssign(med.extinction(h).mul(dt));
      });
      textureStore(this.transmittance, uvec2(x, y), vec4(exp(depth.negate()), 1.0));
    })().compute(width * height) as THREE.ComputeNode;
  }

  private buildMultiScatteringPass(): THREE.ComputeNode {
    const { width, height } = MULTI_SCATTERING_LUT;
    const u = this.u;
    const med = medium(u);
    const dirCount = MS_DIRECTIONS_SQRT * MS_DIRECTIONS_SQRT;
    return Fn(() => {
      const x = instanceIndex.mod(uint(width));
      const y = instanceIndex.div(uint(width));
      const uv = vec2(float(x).add(0.5).div(width), float(y).add(0.5).div(height));
      const muS = uv.x.mul(2.0).sub(1.0);
      const r = u.groundRadius.add(uv.y.mul(u.topRadius.sub(u.groundRadius)));
      const ro = vec3(0.0, r, 0.0);
      const sunDir = vec3(0.0, muS, sqrt(max(float(1.0).sub(muS.mul(muS)), 0.0)));
      const lumTotal = vec3(0.0).toVar();
      const fmsTotal = vec3(0.0).toVar();
      Loop({ start: 0, end: MS_DIRECTIONS_SQRT, name: 'i' }, { start: 0, end: MS_DIRECTIONS_SQRT, name: 'j' }, ({ i, j }: N) => {
        const cosTheta = float(1.0).sub(float(i).add(0.5).mul(2.0 / MS_DIRECTIONS_SQRT));
        const sinTheta = sqrt(max(float(1.0).sub(cosTheta.mul(cosTheta)), 0.0));
        const phi = float(j).add(0.5).mul((2.0 * Math.PI) / MS_DIRECTIONS_SQRT);
        const rd = vec3(sinTheta.mul(cos(phi)), cosTheta, sinTheta.mul(sin(phi)));
        const tGround = raySphere(ro, rd, u.groundRadius);
        const hitsGround = tGround.greaterThan(0.0);
        const tMax = select(hitsGround, tGround, max(raySphere(ro, rd, u.topRadius), 0.0));
        const dt = tMax.div(MS_STEPS);
        const throughput = vec3(1.0).toVar();
        const lum = vec3(0.0).toVar();
        const fms = vec3(0.0).toVar();
        Loop({ start: 0, end: MS_STEPS, name: 's' }, ({ s }: N) => {
          const p = ro.add(rd.mul(float(s).add(0.5).mul(dt)));
          const pr = length(p);
          const h = pr.sub(u.groundRadius);
          const muSun = dot(p.div(pr), sunDir);
          const shadow = select(raySphere(p, sunDir, u.groundRadius).greaterThan(0.0), float(0.0), float(1.0));
          const scattering = med.rayleigh(h).add(med.mie(h));
          const extinction = max(med.extinction(h), vec3(1e-6));
          const sampleT = exp(extinction.negate().mul(dt));
          const sIso = scattering.mul(this.transmittanceAt(pr, muSun)).mul(shadow).mul(1.0 / (4.0 * Math.PI));
          lum.addAssign(throughput.mul(sIso.sub(sIso.mul(sampleT)).div(extinction)));
          fms.addAssign(throughput.mul(scattering.sub(scattering.mul(sampleT)).div(extinction)));
          throughput.mulAssign(sampleT);
        });
        If(hitsGround, () => {
          const pg = ro.add(rd.mul(tGround));
          const n = normalize(pg);
          const sunAtGround = this.transmittanceAt(length(pg), dot(n, sunDir));
          lum.addAssign(throughput.mul(sunAtGround).mul(saturate(dot(n, sunDir))).mul(u.groundAlbedo).div(PI));
        });
        lumTotal.addAssign(lum);
        fmsTotal.addAssign(fms);
      });
      const l2 = lumTotal.div(dirCount);
      const fmsAvg = min(fmsTotal.div(dirCount), vec3(0.99));
      textureStore(this.multiScattering, uvec2(x, y), vec4(l2.div(vec3(1.0).sub(fmsAvg)), 1.0));
    })().compute(width * height) as THREE.ComputeNode;
  }

  private buildSkyViewPass(): THREE.ComputeNode {
    const { width, height } = SKY_VIEW_LUT;
    const u = this.u;
    const med = medium(u);
    return Fn(() => {
      const x = instanceIndex.mod(uint(width));
      const y = instanceIndex.div(uint(width));
      const uv = vec2(float(x).add(0.5).div(width), float(y).add(0.5).div(height));
      const angles = anglesFromSkyViewUv(uv);
      const rd = vec3(cos(angles.x).mul(cos(angles.y)), sin(angles.x), cos(angles.x).mul(sin(angles.y)));
      const sunDir = vec3(cos(this.sunElevation), sin(this.sunElevation), 0.0);
      const ro = vec3(0.0, u.groundRadius.add(this.cameraHeightKm), 0.0);
      const tGround = raySphere(ro, rd, u.groundRadius);
      const tMax = select(tGround.greaterThan(0.0), tGround, max(raySphere(ro, rd, u.topRadius), 0.0));
      const dt = tMax.div(SKY_VIEW_STEPS);
      const cosT = dot(rd, sunDir);
      const phR = rayleighPhase(cosT);
      const phM = miePhase(cosT, u.mieG);
      const throughput = vec3(1.0).toVar();
      const lum = vec3(0.0).toVar();
      Loop({ start: 0, end: SKY_VIEW_STEPS, name: 's' }, ({ s }: N) => {
        const p = ro.add(rd.mul(float(s).add(0.5).mul(dt)));
        const pr = length(p);
        const h = pr.sub(u.groundRadius);
        const muSun = dot(p.div(pr), sunDir);
        const shadow = select(raySphere(p, sunDir, u.groundRadius).greaterThan(0.0), float(0.0), float(1.0));
        const rayleigh = med.rayleigh(h);
        const mie = med.mie(h);
        const extinction = max(med.extinction(h), vec3(1e-6));
        const sampleT = exp(extinction.negate().mul(dt));
        const single = rayleigh.mul(phR).add(mie.mul(phM)).mul(this.transmittanceAt(pr, muSun)).mul(shadow);
        const multi = rayleigh.add(mie).mul(this.multiScatteringAt(pr, muSun));
        const S = single.add(multi);
        lum.addAssign(throughput.mul(S.sub(S.mul(sampleT)).div(extinction)));
        throughput.mulAssign(sampleT);
      });
      textureStore(this.skyView, uvec2(x, y), vec4(lum.mul(u.sunIlluminance), 1.0));
    })().compute(width * height) as THREE.ComputeNode;
  }

  private buildSkyLightPass(): THREE.ComputeNode {
    const u = this.u;
    const skyLight = storage(this.skyLightAttr, 'vec4', 2);
    const dEl = Math.PI / 2 / IRRADIANCE_ELEVATION_SAMPLES;
    const dAz = (2 * Math.PI) / IRRADIANCE_AZIMUTH_SAMPLES;
    return Fn(() => {
      const irradiance = vec3(0.0).toVar();
      Loop({ start: 0, end: IRRADIANCE_ELEVATION_SAMPLES, name: 'i' }, { start: 0, end: IRRADIANCE_AZIMUTH_SAMPLES, name: 'j' }, ({ i, j }: N) => {
        const e = float(i).add(0.5).mul(dEl);
        const a = float(j).add(0.5).mul(dAz);
        const radiance = texture(this.skyView, skyViewUvFromAngles(e, a)).level(0).rgb;
        irradiance.addAssign(radiance.mul(sin(e)).mul(cos(e)).mul(dEl * dAz));
      });
      irradiance.addAssign(vec3(u.nightFloor.mul(u.sunIlluminance).mul(PI)));
      const muSun = sin(this.sunElevation);
      const visible = smoothstep(-0.0093, 0.0093, muSun); // sun disk crossing the horizon (±0.53°)
      const sun = this.transmittanceAt(u.groundRadius.add(this.cameraHeightKm), muSun).mul(u.sunIlluminance).mul(visible);
      skyLight.element(0).assign(vec4(irradiance, 1.0));
      skyLight.element(1).assign(vec4(sun, 1.0));
    })().compute(1, [1]) as THREE.ComputeNode;
  }
}
```

- [ ] **Step 7: Self-test harness and sky self-tests**

`src/dev/selfTest.ts`:

```ts
import type * as THREE from 'three/webgpu';
import { showOverlay } from '../app/overlay';

export interface SelfTestResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface SelfTest {
  name: string;
  run(renderer: THREE.WebGPURenderer): Promise<{ pass: boolean; detail: string }>;
}

const tests: SelfTest[] = [];

export function registerSelfTest(t: SelfTest): void {
  tests.push(t);
}

export async function runSelfTests(renderer: THREE.WebGPURenderer): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  for (const t of tests) {
    let r: SelfTestResult;
    try {
      r = { name: t.name, ...(await t.run(renderer)) };
    } catch (e) {
      r = { name: t.name, pass: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` };
    }
    console.log(`[selftest] ${r.pass ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`);
    results.push(r);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`[selftest] SUMMARY ${passed}/${results.length} passed`);
  return results;
}

export function renderSelfTestReport(results: SelfTestResult[]): void {
  const passed = results.filter((r) => r.pass).length;
  showOverlay(
    `GPU self-tests: ${passed}/${results.length} passed`,
    results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${r.detail}`).join('\n'),
  );
}

export const fmt = (v: ArrayLike<number>, n = 3): string => `[${Array.from(v).map((x) => x.toFixed(4)).slice(0, n).join(', ')}]`;
```

`src/sky/sky.selftest.ts`:

```ts
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
```

`src/dev/selfTests.ts`:

```ts
// Every *.selftest.ts module registers itself on import. Later tasks add imports here.
import '../sky/sky.selftest';

export { renderSelfTestReport, runSelfTests } from './selfTest';
```

In `src/main.ts`, after the renderer is created and before `new App(...)`, add:

```ts
  if (new URLSearchParams(location.search).has('selftest')) {
    const { runSelfTests, renderSelfTestReport } = await import('./dev/selfTests');
    renderSelfTestReport(await runSelfTests(renderer));
    return;
  }
```

- [ ] **Step 8: Run self-tests in the browser**

Run: `npm test && npm run typecheck`
Expected: PASS; typecheck clean.

Open `http://localhost:5173/?selftest` in the browser pane and read the console (`read_console_messages`, pattern `[selftest]`).
Expected: `[selftest] SUMMARY 3/3 passed`. For typical values, sun at 30° should be about `[~15, ~13, ~9]` (reddened, below 20) and sky irradiance should be blue-dominant. If WGSL compilation fails, the console shows the generated shader and error. Fix the TSL, don't the tests.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat: add Hillaire atmosphere LUTs with GPU self-tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sky dome, sun disk, aerial perspective, sky in the app

**Files:**
- Create: `src/sky/Sky.ts`, `src/sky/SkyDome.ts`
- Modify: `src/app/App.ts`

**Interfaces:**
- Consumes: `AtmosphereLuts`, `createAtmosphereUniforms`, `updateAtmosphereUniforms`, `skyViewUvFromAngles`, `DEFAULT_ATMOSPHERE`, `extinctionPerKm`, `sunForConditions`.
- Produces: `class Sky { uniforms; luts; sunDirection (uniform vec3); sunAzimuthAngle; seaLevelExtinction; aerialScale; dome; get sunIlluminance(); get skyIrradiance(); setParams(p); update(renderer, sunDir: THREE.Vector3, cameraHeightM); radiance(dir); applyAerialPerspective(color, distanceM, rayDir); followCamera(pos) }`, `SUN_ANGULAR_RADIUS_RAD = 0.00465`, `createSkyDome(sky)`.

Aerial perspective uses a sea-level approximation rather than a 3D lookup table. Everything we render sits within about 20 m of sea level, so the light's path through the air to it is horizontal with nearly constant air density. Transmittance is `exp(−σₜ(0)·d)`, and in-scattered light is the sky radiance just above the horizon along that ray, times `(1 − T)`. Reflections sample the sky-view LUT directly, so no environment cubemap is needed.

- [ ] **Step 1: Implement Sky and SkyDome**

`src/sky/Sky.ts`:

```ts
import * as THREE from 'three/webgpu';
import { asin, atan, clamp, exp, max, normalize, texture, uniform, vec3 } from 'three/tsl';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, extinctionPerKm } from './atmosphereParams';
import { type AtmosphereUniforms, createAtmosphereUniforms, skyViewUvFromAngles, updateAtmosphereUniforms } from './atmosphereNodes';
import { AtmosphereLuts } from './AtmosphereLuts';
import { createSkyDome } from './SkyDome';

type N = any;

export const SUN_ANGULAR_RADIUS_RAD = 0.00465;
const MIN_SUN_CHANGE_RAD = (0.25 * Math.PI) / 180;

export class Sky {
  readonly uniforms: AtmosphereUniforms;
  readonly luts: AtmosphereLuts;
  readonly sunDirection = uniform(new THREE.Vector3(0, 1, 0));
  /** atan2(sun.z, sun.x) in world XZ: rotates world azimuths into the sky-view LUT frame. */
  readonly sunAzimuthAngle = uniform(0);
  /** Sea-level extinction per km (RGB), for aerial perspective. */
  readonly seaLevelExtinction = uniform(new THREE.Vector3());
  readonly aerialScale = uniform(1);
  readonly dome: THREE.Mesh;
  private params: AtmosphereParams;
  private readonly lastSun = new THREE.Vector3(0, -2, 0);
  private staticDirty = true;
  private dynamicDirty = true;

  constructor(params: AtmosphereParams = DEFAULT_ATMOSPHERE) {
    this.params = { ...params };
    this.uniforms = createAtmosphereUniforms(this.params);
    this.luts = new AtmosphereLuts(this.uniforms);
    this.seaLevelExtinction.value.set(...extinctionPerKm(0, this.params));
    this.dome = createSkyDome(this);
  }

  /** Sun illuminance reaching the surface (RGB node). */
  get sunIlluminance(): N {
    return this.luts.skyLightRead.element(1).xyz;
  }

  /** Sky irradiance on a horizontal surface (RGB node). */
  get skyIrradiance(): N {
    return this.luts.skyLightRead.element(0).xyz;
  }

  setParams(p: AtmosphereParams): void {
    this.params = { ...p };
    updateAtmosphereUniforms(this.uniforms, this.params);
    this.seaLevelExtinction.value.set(...extinctionPerKm(0, this.params));
    this.staticDirty = true;
  }

  update(renderer: THREE.WebGPURenderer, sunDir: THREE.Vector3, cameraHeightM: number): void {
    this.luts.cameraHeightKm.value = Math.max(cameraHeightM, 1) / 1000;
    if (this.lastSun.angleTo(sunDir) > MIN_SUN_CHANGE_RAD) this.dynamicDirty = true;
    if (this.staticDirty) {
      this.luts.renderStatic(renderer);
      this.staticDirty = false;
      this.dynamicDirty = true;
    }
    if (this.dynamicDirty) {
      this.sunDirection.value.copy(sunDir);
      this.luts.sunElevation.value = Math.asin(Math.max(-1, Math.min(1, sunDir.y)));
      this.sunAzimuthAngle.value = Math.atan2(sunDir.z, sunDir.x);
      this.luts.renderDynamic(renderer);
      this.lastSun.copy(sunDir);
      this.dynamicDirty = false;
    }
  }

  /** Sky radiance along a world-space direction (node). */
  radiance(dir: N): N {
    const elevation = asin(clamp(dir.y, -1.0, 1.0));
    const azimuth = atan(dir.z, dir.x).sub(this.sunAzimuthAngle);
    return texture(this.luts.skyView, skyViewUvFromAngles(elevation, azimuth)).rgb
      .add(this.uniforms.nightFloor.mul(this.uniforms.sunIlluminance));
  }

  /** Near-sea-level aerial perspective along a ray from the camera. */
  applyAerialPerspective(color: N, distanceM: N, rayDir: N): N {
    const transmittance = exp(this.seaLevelExtinction.mul(distanceM.mul(0.001).mul(this.aerialScale)).negate());
    const horizonDir = normalize(vec3(rayDir.x, max(rayDir.y, 0.02), rayDir.z));
    return color.mul(transmittance).add(this.radiance(horizonDir).mul(vec3(1.0).sub(transmittance)));
  }

  followCamera(position: THREE.Vector3): void {
    this.dome.position.copy(position);
  }
}
```

`src/sky/SkyDome.ts`:

```ts
import * as THREE from 'three/webgpu';
import { PI, acos, cameraPosition, clamp, dot, float, min, normalize, positionWorld, smoothstep, sqrt, vec3 } from 'three/tsl';
import { SUN_ANGULAR_RADIUS_RAD, type Sky } from './Sky';

export function createSkyDome(sky: Sky): THREE.Mesh {
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const dir = normalize(positionWorld.sub(cameraPosition));
  const angle = acos(clamp(dot(dir, sky.sunDirection), -1.0, 1.0));
  const r = float(SUN_ANGULAR_RADIUS_RAD);
  const x = clamp(angle.div(r), 0.0, 1.0);
  const limbDarkening = float(1.0).sub(float(0.6).mul(float(1.0).sub(sqrt(float(1.0).sub(x.mul(x))))));
  const disk = float(1.0).sub(smoothstep(r.mul(0.92), r.mul(1.08), angle));
  // Clamp keeps the disk below half-float range so bloom never sees infinities.
  const sunRadiance = min(sky.sunIlluminance.div(PI.mul(r).mul(r)).mul(limbDarkening), vec3(30000.0));
  material.colorNode = sky.radiance(dir).add(sunRadiance.mul(disk));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  mesh.scale.setScalar(40000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
```

- [ ] **Step 2: Add the sky to the App**

In `src/app/App.ts`:
- import `Sky` from `../sky/Sky` and `sunForConditions` from `../astro/sunForConditions`;
- add the fields `readonly sky = new Sky();` and `private readonly sunDir = new THREE.Vector3();`;
- in the constructor, replace `this.scene.background = new THREE.Color(0x0b2a4a);` with the lines below. (The tone-mapping lines are temporary; Task 9 replaces them with the picture pipeline.)

```ts
    this.scene.add(this.sky.dome);
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 0.35;
```

In `frame`, between `this.rig.update(...)` and the render call, add:

```ts
    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.sky.update(this.renderer, this.sunDir, this.camera.position.y);
    this.sky.followCamera(this.camera.position);
```

- [ ] **Step 3: Verify visually**

Run: `npm run typecheck && npm test`
Expected: clean; PASS.

In the browser pane, screenshot each of these reference moments:
- `#ref=pre-dawn`: deep blue-violet gradient, brighter toward the east horizon, no sun disk.
- `#ref=first-sun`: warm, bright band on the eastern horizon with the sun disk just up.
- `#ref=morning-offshore`: clear blue sky facing west, lighter near the horizon (sea haze).
- `#ref=sunset`: orange and red around the sun disk, blue higher up.

The console must be free of errors. Compare against `reference/light/lefthanders-sunset.webp` for the palette (not the clouds). Record the four screenshots in the task report.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat: render physically based sky, sun disk and aerial perspective

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Picture pipeline: exposure, bloom, AgX, grade

**Files:**
- Create: `src/render/exposure.ts`, `src/render/PicturePipeline.ts`
- Test: `src/render/exposure.test.ts`
- Modify: `src/app/App.ts`

**Interfaces:**
- Produces: `exposureStopsForSun(elevationDeg)`, `computeExposure(elevationDeg, baseExposure, evOffset, auto) → number`; `interface PictureParams { autoExposure; baseExposure; evOffset; bloomStrength; bloomRadius; bloomThreshold; lift; gamma; gain; saturation }`, `DEFAULT_PICTURE`, `class PicturePipeline { constructor(renderer, scene, camera, params?); params; setParams(p); setSunElevation(elDeg); render() }`.

- [ ] **Step 1: Write the failing test**

`src/render/exposure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeExposure, exposureStopsForSun } from './exposure';

describe('exposure', () => {
  it('daylight uses the base exposure', () => {
    expect(computeExposure(45, 0.35, 0, true)).toBeCloseTo(0.35);
  });
  it('opens up as the sun sets, never decreasing', () => {
    let prev = 0;
    for (let el = 60; el >= -30; el -= 1) {
      const s = exposureStopsForSun(el);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
  it('deep night is capped at +6 stops (no runaway)', () => {
    expect(exposureStopsForSun(-90)).toBe(6);
    expect(computeExposure(-90, 0.35, 0, true)).toBeCloseTo(0.35 * 64);
  });
  it('EV offset doubles per stop; manual mode ignores the sun', () => {
    expect(computeExposure(45, 0.35, 1, true)).toBeCloseTo(0.7);
    expect(computeExposure(-20, 0.35, 0, false)).toBeCloseTo(0.35);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement exposure**

`src/render/exposure.ts`:

```ts
export const DAY_ELEVATION_DEG = 20;
export const NIGHT_ELEVATION_DEG = -10;
export const NIGHT_EXTRA_STOPS = 6;

/** Extra stops of exposure as the sun drops from day to night (a simple, predictable auto-exposure). */
export function exposureStopsForSun(elevationDeg: number): number {
  const t = (DAY_ELEVATION_DEG - elevationDeg) / (DAY_ELEVATION_DEG - NIGHT_ELEVATION_DEG);
  return Math.min(1, Math.max(0, t)) * NIGHT_EXTRA_STOPS;
}

export function computeExposure(elevationDeg: number, baseExposure: number, evOffset: number, auto: boolean): number {
  return baseExposure * 2 ** ((auto ? exposureStopsForSun(elevationDeg) : 0) + evOffset);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/render`
Expected: PASS.

- [ ] **Step 5: Implement the pipeline**

`src/render/PicturePipeline.ts`:

```ts
import * as THREE from 'three/webgpu';
import { agxToneMapping, dot, float, max, mix, pass, pow, renderOutput, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { computeExposure } from './exposure';

export interface PictureParams {
  autoExposure: boolean;
  baseExposure: number;
  evOffset: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  lift: number;
  gamma: number;
  gain: number;
  saturation: number;
}

export const DEFAULT_PICTURE: PictureParams = {
  autoExposure: true,
  baseExposure: 0.35,
  evOffset: 0,
  bloomStrength: 0.12,
  bloomRadius: 0.35,
  bloomThreshold: 1.0,
  lift: 0,
  gamma: 1,
  gain: 1,
  saturation: 1.05,
};

/** HDR scene → exposure → bloom → AgX → lift/gamma/gain/saturation → sRGB. */
export class PicturePipeline {
  params: PictureParams;
  private readonly pipeline: THREE.RenderPipeline;
  private readonly exposure = uniform(1);
  private readonly lift = uniform(0);
  private readonly gamma = uniform(1);
  private readonly gain = uniform(1);
  private readonly saturation = uniform(1);
  // three typings gap: BloomNode's uniform members are not typed.
  private readonly bloomNode: any;
  private sunElevationDeg = 45;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, params: PictureParams = DEFAULT_PICTURE) {
    this.params = { ...params };
    const scenePass = pass(scene, camera);
    const exposed = scenePass.getTextureNode('output').rgb.mul(this.exposure);
    this.bloomNode = bloom(vec4(exposed, 1.0), params.bloomStrength, params.bloomRadius, params.bloomThreshold);
    const mapped = agxToneMapping(exposed.add(this.bloomNode.rgb), float(1.0));
    const lifted = mapped.add(this.lift.mul(vec3(1.0).sub(mapped))).mul(this.gain);
    const gammaed = pow(max(lifted, vec3(0.0)), vec3(float(1.0).div(this.gamma)));
    const luma = dot(gammaed, vec3(0.2126, 0.7152, 0.0722));
    const graded = mix(vec3(luma), gammaed, this.saturation);
    this.pipeline = new THREE.RenderPipeline(renderer, renderOutput(vec4(graded, 1.0), THREE.NoToneMapping, THREE.SRGBColorSpace));
    this.pipeline.outputColorTransform = false;
    this.setParams(this.params);
  }

  setParams(p: PictureParams): void {
    this.params = { ...p };
    this.bloomNode.strength.value = p.bloomStrength;
    this.bloomNode.radius.value = p.bloomRadius;
    this.bloomNode.threshold.value = p.bloomThreshold;
    this.lift.value = p.lift;
    this.gamma.value = Math.max(0.1, p.gamma);
    this.gain.value = p.gain;
    this.saturation.value = p.saturation;
    this.updateExposure();
  }

  setSunElevation(elevationDeg: number): void {
    this.sunElevationDeg = elevationDeg;
    this.updateExposure();
  }

  render(): void {
    this.pipeline.render();
  }

  private updateExposure(): void {
    this.exposure.value = computeExposure(this.sunElevationDeg, this.params.baseExposure, this.params.evOffset, this.params.autoExposure);
  }
}
```

- [ ] **Step 6: Use the pipeline in the App**

In `src/app/App.ts`:
- import `PicturePipeline` from `../render/PicturePipeline`;
- add the field `readonly picture: PicturePipeline;`;
- in the constructor, **delete** the two temporary lines `this.renderer.toneMapping = …` and `this.renderer.toneMappingExposure = …`, and add `this.picture = new PicturePipeline(renderer, this.scene, this.camera);` after `this.scene.add(this.sky.dome);`;
- in `frame`, after `this.sky.followCamera(...)`, add `this.picture.setSunElevation(sun.elevationDeg);`, and replace `this.renderer.render(this.scene, this.camera);` with `this.picture.render();`.

- [ ] **Step 7: Verify visually**

Run: `npm run typecheck && npm test`
Expected: clean; PASS.

Screenshot `#ref=first-sun`, `#ref=morning-offshore` and `#ref=sunset` again.
Expected: similar colours to Task 8 but better balanced. The sun disk has a soft bloom halo, and twilight (`#ref=pre-dawn`) is visibly brighter than in Task 8 but still reads as night. No banding artefacts, and no console errors.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: add HDR picture pipeline with auto exposure, bloom, AgX and grade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: GPU inverse FFT

**Files:**
- Create: `src/ocean/fft.ts`, `src/ocean/fft.selftest.ts`
- Modify: `src/dev/selfTests.ts`

**Interfaces:**
- Consumes: `FFT_SIZE`, `registerSelfTest`.
- Produces: `type FftDirection = 'rows' | 'columns'`, `createInverseFftPass(bufferA, bufferB, cascades, direction, n?) → THREE.ComputeNode`.
  - `bufferA` and `bufferB` are `storage(attr, 'vec4', cascades·n·n)` nodes.
  - Element `(cascade·n + row)·n + column` holds two independent complex values (`xy`, `zw`).
  - The transform is in place, unnormalised, with a positive exponent: `out[x] = Σₖ in[k]·e^{+2πi·kx/n}`.

Design: this is a shared-memory Stockham radix-2 FFT. One workgroup of `n/2` threads transforms one line of one cascade for both buffers. Each of the log₂(n) stages reads two values into registers, synchronises (barrier), writes two values, and synchronises again. Workgroup memory is 2 × 256 × 16 B = 8 KB, within WebGPU's 16 KB default. Because the output comes out in natural order, no bit-reversal pass is needed.

- [ ] **Step 1: Write the GPU self-tests**

`src/ocean/fft.selftest.ts`:

```ts
import * as THREE from 'three/webgpu';
import { storage } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { createInverseFftPass } from './fft';
import { FFT_SIZE } from './spectrum';

const n = FFT_SIZE;
const cascades = 3;
const at = (c: number, x: number, z: number) => ((c * n + z) * n + x) * 4;

async function runIfft(renderer: THREE.WebGPURenderer, fill: (a: Float32Array, b: Float32Array) => void) {
  const count = cascades * n * n;
  const aAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
  const bAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
  fill(aAttr.array as Float32Array, bAttr.array as Float32Array);
  const a = storage(aAttr, 'vec4', count);
  const b = storage(bAttr, 'vec4', count);
  renderer.compute([createInverseFftPass(a, b, cascades, 'rows'), createInverseFftPass(a, b, cascades, 'columns')]);
  return {
    a: new Float32Array(await renderer.getArrayBufferAsync(aAttr)),
    b: new Float32Array(await renderer.getArrayBufferAsync(bAttr)),
  };
}

const SAMPLES: Array<[number, number]> = [[0, 0], [1, 0], [37, 5], [128, 200], [255, 255]];

registerSelfTest({
  name: 'fft: DC impulse gives a constant field',
  async run(renderer) {
    const { a } = await runIfft(renderer, (A) => { A[at(0, 0, 0)] = 1; });
    let err = 0;
    for (const [x, z] of SAMPLES) err = Math.max(err, Math.abs(a[at(0, x, z)] - 1), Math.abs(a[at(0, x, z) + 1]));
    return { pass: err < 1e-3, detail: `max error ${err.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'fft: one x-frequency in cascade 1 gives e^{2πix/n}; other cascades untouched',
  async run(renderer) {
    const { a } = await runIfft(renderer, (A) => { A[at(1, 1, 0)] = 1; });
    let err = 0;
    for (const [x, z] of SAMPLES) {
      const ang = (2 * Math.PI * x) / n;
      err = Math.max(err, Math.abs(a[at(1, x, z)] - Math.cos(ang)), Math.abs(a[at(1, x, z) + 1] - Math.sin(ang)));
      err = Math.max(err, Math.abs(a[at(0, x, z)]), Math.abs(a[at(2, x, z)]));
    }
    return { pass: err < 1e-3, detail: `max error ${err.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'fft: packed zw channel of buffer B along z',
  async run(renderer) {
    const { b } = await runIfft(renderer, (_A, B) => { B[at(2, 0, 3) + 3] = 1; }); // value i at kz index 3
    let err = 0;
    for (const [x, z] of SAMPLES) {
      const ang = (2 * Math.PI * 3 * z) / n; // i·e^{iθ} = (-sin θ, cos θ)
      err = Math.max(err, Math.abs(b[at(2, x, z) + 2] + Math.sin(ang)), Math.abs(b[at(2, x, z) + 3] - Math.cos(ang)));
    }
    return { pass: err < 1e-3, detail: `max error ${err.toExponential(2)}` };
  },
});
```

Add to `src/dev/selfTests.ts` (below the sky import):

```ts
import '../ocean/fft.selftest';
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run typecheck`
Expected: FAIL, `Cannot find module './fft'`.

- [ ] **Step 3: Implement the FFT**

`src/ocean/fft.ts`:

```ts
import type * as THREE from 'three/webgpu';
import { Fn, Loop, PI, cos, float, localId, sin, uint, vec2, vec4, workgroupArray, workgroupBarrier, workgroupId } from 'three/tsl';
import { FFT_SIZE } from './spectrum';

type N = any;

const cmul = (a: N, b: N): N => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));
/** Multiply both complex numbers packed in a vec4 (xy, zw) by w. */
const cmul2 = (v: N, w: N): N => vec4(cmul(v.xy, w), cmul(v.zw, w));

export type FftDirection = 'rows' | 'columns';

/**
 * In-place inverse FFT (no 1/n) along every row or column of `cascades` stacked n×n grids,
 * for two vec4 buffers at once (each vec4 = two complex values). One workgroup per line.
 */
export function createInverseFftPass(bufferA: N, bufferB: N, cascades: number, direction: FftDirection, n = FFT_SIZE): THREE.ComputeNode {
  const half = n / 2;
  const stages = Math.log2(n);
  return Fn(() => {
    const sharedA = workgroupArray('vec4', n);
    const sharedB = workgroupArray('vec4', n);
    const line = workgroupId.x;
    const base = line.div(uint(n)).mul(uint(n * n));
    const lineInCascade = line.mod(uint(n));
    const t = localId.x;
    const indexOf = (i: N): N =>
      direction === 'rows' ? base.add(lineInCascade.mul(uint(n))).add(i) : base.add(i.mul(uint(n))).add(lineInCascade);
    const tHalf = t.add(uint(half));
    const i0 = indexOf(t);
    const i1 = indexOf(tHalf);

    sharedA.element(t).assign(bufferA.element(i0));
    sharedA.element(tHalf).assign(bufferA.element(i1));
    sharedB.element(t).assign(bufferB.element(i0));
    sharedB.element(tHalf).assign(bufferB.element(i1));
    workgroupBarrier();

    Loop({ start: 0, end: stages, name: 'stage' }, ({ stage }: N) => {
      const ns = uint(1).shiftLeft(uint(stage));
      const k = t.mod(ns);
      const angle = float(k).mul(PI).div(float(ns)); // +2πk/(2·ns): inverse transform
      const twiddle = vec2(cos(angle), sin(angle));
      const a0 = sharedA.element(t).toVar();
      const a1 = cmul2(sharedA.element(tHalf), twiddle).toVar();
      const b0 = sharedB.element(t).toVar();
      const b1 = cmul2(sharedB.element(tHalf), twiddle).toVar();
      workgroupBarrier();
      const dst = t.div(ns).mul(ns.mul(uint(2))).add(k);
      sharedA.element(dst).assign(a0.add(a1));
      sharedA.element(dst.add(ns)).assign(a0.sub(a1));
      sharedB.element(dst).assign(b0.add(b1));
      sharedB.element(dst.add(ns)).assign(b0.sub(b1));
      workgroupBarrier();
    });

    bufferA.element(i0).assign(sharedA.element(t));
    bufferA.element(i1).assign(sharedA.element(tHalf));
    bufferB.element(i0).assign(sharedB.element(t));
    bufferB.element(i1).assign(sharedB.element(tHalf));
  })().compute(cascades * n * half, [half]) as THREE.ComputeNode;
}
```

- [ ] **Step 4: Run the self-tests**

Run: `npm run typecheck`, then open `http://localhost:5173/?selftest` and read the `[selftest]` console lines.
Expected: `[selftest] SUMMARY 6/6 passed` (3 sky + 3 FFT). If the FFT tests fail with a mirrored pattern (e^{−2πix/n}), the twiddle sign is wrong. If they fail with scrambled values, check that `dst` uses `ns·2` and that both barriers are present.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: add shared-memory Stockham inverse FFT with GPU self-tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Ocean simulation (evolve → FFT → displacement/derivatives/foam)

**Files:**
- Create: `src/ocean/OceanSimulation.ts`, `src/ocean/ocean.selftest.ts`
- Modify: `src/dev/selfTests.ts`

**Interfaces:**
- Consumes: `buildOceanSpectra`, `DEFAULT_SPECTRUM_PARAMS`, `OceanSpectrumParams`, `CASCADE_SIZES_M`, `FFT_SIZE`, `GRAVITY`, `createInverseFftPass`, `Conditions`.
- Produces: `interface OceanSimParams { choppiness; foamThreshold; foamGain; foamDecayS }`, `DEFAULT_OCEAN_SIM`, and `class OceanSimulation` with:
  - `n` and `sizes` (the cascade sizes);
  - `displacement: StorageTexture[]` (xyz = displacement in m with choppiness applied; w = foam in [0, 1]);
  - `derivatives: StorageTexture[]` (x = ∂η/∂x, y = ∂η/∂z, z = λ∂Dx/∂x, w = λ∂Dz/∂z);
  - `fftAAttr`, `fftBAttr` (exposed for self-tests), `slopeVariance: number[]`, `hsTotal: number`;
  - `setParams(p)`, `setConditions(c, spectrumParams?)` and `update(renderer, timeS, dtS)`.

Texel `(x, m)` of cascade `c` covers world position `(x, m)·size/n`. Sample with `uv = worldXZ / size` and repeat wrapping.

Field conventions: this is Tessendorf with horizontal displacement **D = i·k̂·h**, so points bunch together at crests (Gerstner-like). The Jacobian `J = (1+λJxx)(1+λJzz) − (λJxz)²` drops below 1 where the surface compresses, and whitecap foam is injected where `J < foamThreshold`. Before transforming, pairs of real fields are packed into complex numbers as `X + iY`: A = (Dx + iDy, Dz + iSx) and B = (Sz + iJxx, Jzz + iJxz). Because the spectrum is centred, every output value is multiplied by the sign `(−1)^(x+m)`.

- [ ] **Step 1: Write the GPU self-tests**

`src/ocean/ocean.selftest.ts`:

```ts
import type * as THREE from 'three/webgpu';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { OceanSimulation } from './OceanSimulation';

async function readA(renderer: THREE.WebGPURenderer, sim: OceanSimulation): Promise<Float32Array> {
  return new Float32Array(await renderer.getArrayBufferAsync(sim.fftAAttr));
}

registerSelfTest({
  name: 'ocean: realised Hs matches the spectrum (±35%)',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.setConditions(DEFAULT_CONDITIONS);
    sim.update(renderer, 20, 1 / 60);
    const a = await readA(renderer, sim);
    const n = sim.n;
    let variance = 0;
    for (let c = 0; c < sim.sizes.length; c++) {
      let sum = 0, sumSq = 0;
      for (let m = 0; m < n; m++) for (let x = 0; x < n; x++) {
        const sign = (x + m) % 2 === 0 ? 1 : -1;
        const h = a[((c * n + m) * n + x) * 4 + 1] * sign;
        sum += h; sumSq += h * h;
      }
      const mean = sum / (n * n);
      variance += sumSq / (n * n) - mean * mean;
    }
    const hs = 4 * Math.sqrt(variance);
    return { pass: Math.abs(hs - sim.hsTotal) / sim.hsTotal < 0.35, detail: `realised Hs ${hs.toFixed(3)} m vs spectrum ${sim.hsTotal.toFixed(3)} m` };
  },
});

registerSelfTest({
  name: 'ocean: glass-off (zero wind) and extremes stay finite',
  async run(renderer) {
    const glass = cloneConditions(DEFAULT_CONDITIONS);
    glass.wind.speedMs = 0;
    const extreme = cloneConditions(DEFAULT_CONDITIONS);
    extreme.swell = { sizeFt: 12, periodS: 25, directionDeg: 200 };
    extreme.wind = { speedMs: 30, directionDeg: 225 };
    for (const c of [glass, extreme]) {
      const sim = new OceanSimulation();
      sim.setConditions(c);
      sim.update(renderer, 7.5, 1 / 60);
      const a = await readA(renderer, sim);
      if (!a.every(Number.isFinite)) return { pass: false, detail: `non-finite values for ${JSON.stringify(c.wind)}` };
    }
    return { pass: true, detail: 'all values finite' };
  },
});

registerSelfTest({
  name: 'ocean: same seed and time, same sea',
  async run(renderer) {
    const run = async () => {
      const sim = new OceanSimulation();
      sim.setConditions(DEFAULT_CONDITIONS);
      sim.update(renderer, 12.5, 1 / 60);
      return readA(renderer, sim);
    };
    const [a, b] = [await run(), await run()];
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    return { pass: diff === 0, detail: `max difference ${diff}` };
  },
});
```

Add to `src/dev/selfTests.ts`:

```ts
import '../ocean/ocean.selftest';
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run typecheck`
Expected: FAIL, `Cannot find module './OceanSimulation'`.

- [ ] **Step 3: Implement**

`src/ocean/OceanSimulation.ts`:

```ts
import * as THREE from 'three/webgpu';
import {
  Fn, cos, exp, float, instanceIndex, int, max, saturate, select, sin, sqrt, storage, textureStore, uint, uniform,
  uniformArray, uvec2, vec2, vec4,
} from 'three/tsl';
import type { Conditions } from '../conditions/types';
import { createInverseFftPass } from './fft';
import { CASCADE_SIZES_M, DEFAULT_SPECTRUM_PARAMS, FFT_SIZE, GRAVITY, type OceanSpectrumParams, buildOceanSpectra } from './spectrum';

type N = any;

export interface OceanSimParams {
  /** λ: horizontal displacement strength (0 = rounded sine-like, 1 = sharp crests). */
  choppiness: number;
  /** Foam is injected where the Jacobian drops below this. */
  foamThreshold: number;
  foamGain: number;
  /** e-folding time for foam to dissolve. */
  foamDecayS: number;
}

export const DEFAULT_OCEAN_SIM: OceanSimParams = { choppiness: 1.0, foamThreshold: 0.35, foamGain: 1.5, foamDecayS: 3.0 };

function fieldTexture(n: number): THREE.StorageTexture {
  const t = new THREE.StorageTexture(n, n);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  return t;
}

export class OceanSimulation {
  readonly n = FFT_SIZE;
  readonly sizes: readonly number[] = CASCADE_SIZES_M;
  /** xyz = displacement (m, choppiness applied), w = foam [0, 1]. */
  readonly displacement: THREE.StorageTexture[];
  /** x = ∂η/∂x, y = ∂η/∂z, z = λ∂Dx/∂x, w = λ∂Dz/∂z. */
  readonly derivatives: THREE.StorageTexture[];
  readonly fftAAttr: THREE.StorageBufferAttribute;
  readonly fftBAttr: THREE.StorageBufferAttribute;
  slopeVariance: number[] = CASCADE_SIZES_M.map(() => 0);
  hsTotal = 0;
  readonly time = uniform(0);
  readonly dt = uniform(0);
  readonly choppiness = uniform(DEFAULT_OCEAN_SIM.choppiness);
  readonly foamThreshold = uniform(DEFAULT_OCEAN_SIM.foamThreshold);
  readonly foamGain = uniform(DEFAULT_OCEAN_SIM.foamGain);
  readonly foamDecay = uniform(DEFAULT_OCEAN_SIM.foamDecayS);
  private readonly h0Attr: THREE.StorageBufferAttribute;
  private readonly foamAttr: THREE.StorageBufferAttribute;
  private readonly passes: THREE.ComputeNode[];

  constructor(params: OceanSimParams = DEFAULT_OCEAN_SIM) {
    const n = this.n;
    const count = this.sizes.length * n * n;
    this.h0Attr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
    this.fftAAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
    this.fftBAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
    this.foamAttr = new THREE.StorageBufferAttribute(new Float32Array(count), 1);
    this.displacement = this.sizes.map(() => fieldTexture(n));
    this.derivatives = this.sizes.map(() => fieldTexture(n));

    const h0 = storage(this.h0Attr, 'vec4', count).toReadOnly();
    const a = storage(this.fftAAttr, 'vec4', count);
    const b = storage(this.fftBAttr, 'vec4', count);
    const foam = storage(this.foamAttr, 'float', count);
    this.passes = [
      this.buildEvolvePass(h0, a, b),
      createInverseFftPass(a, b, this.sizes.length, 'rows', n),
      createInverseFftPass(a, b, this.sizes.length, 'columns', n),
      ...this.sizes.map((_, c) => this.buildAssemblePass(c, a, b, foam)),
    ];
    this.setParams(params);
  }

  setParams(p: OceanSimParams): void {
    this.choppiness.value = p.choppiness;
    this.foamThreshold.value = p.foamThreshold;
    this.foamGain.value = p.foamGain;
    this.foamDecay.value = Math.max(0.05, p.foamDecayS);
  }

  /** Rebuild the initial spectrum on the CPU (~tens of ms); call when conditions or spectrum params change. */
  setConditions(c: Conditions, spectrum: OceanSpectrumParams = DEFAULT_SPECTRUM_PARAMS): void {
    const s = buildOceanSpectra(c, spectrum);
    const array = this.h0Attr.array as Float32Array;
    s.h0.forEach((h, i) => array.set(h, i * this.n * this.n * 4));
    this.h0Attr.needsUpdate = true;
    this.slopeVariance = s.slopeVariance;
    this.hsTotal = s.hsTotal;
  }

  update(renderer: THREE.WebGPURenderer, timeS: number, dtS: number): void {
    this.time.value = timeS;
    this.dt.value = dtS;
    renderer.compute(this.passes);
  }

  private buildEvolvePass(h0: N, a: N, b: N): THREE.ComputeNode {
    const n = this.n;
    const sizes = uniformArray([...this.sizes], 'float');
    return Fn(() => {
      const idx = instanceIndex;
      const cascade = idx.div(uint(n * n));
      const local = idx.mod(uint(n * n));
      const dk = float(2 * Math.PI).div(sizes.element(cascade));
      const kx = float(int(local.mod(uint(n))).sub(n / 2)).mul(dk);
      const kz = float(int(local.div(uint(n))).sub(n / 2)).mul(dk);
      const k = sqrt(kx.mul(kx).add(kz.mul(kz)));
      const phase = sqrt(k.mul(GRAVITY)).mul(this.time);
      const c = cos(phase);
      const s = sin(phase);
      const s0 = h0.element(idx);
      // h = h0·e^{iωt} + conj(h0(-k))·e^{-iωt}
      const h = vec2(
        s0.x.mul(c).sub(s0.y.mul(s)).add(s0.z.mul(c)).add(s0.w.mul(s)),
        s0.x.mul(s).add(s0.y.mul(c)).sub(s0.z.mul(s)).add(s0.w.mul(c)),
      );
      const ih = vec2(h.y.negate(), h.x);
      const invK = float(1.0).div(max(k, 1e-6));
      const kxn = kx.mul(invK);
      const kzn = kz.mul(invK);
      const dx = ih.mul(kxn);
      const dz = ih.mul(kzn);
      const sx = ih.mul(kx);
      const sz = ih.mul(kz);
      const jxx = h.mul(kx.mul(kxn)).negate();
      const jzz = h.mul(kz.mul(kzn)).negate();
      const jxz = h.mul(kx.mul(kzn)).negate();
      const pack = (X: N, Y: N): N => vec2(X.x.sub(Y.y), X.y.add(Y.x)); // X + iY
      const live = k.greaterThan(1e-6);
      a.element(idx).assign(select(live, vec4(pack(dx, h), pack(dz, sx)), vec4(0.0)));
      b.element(idx).assign(select(live, vec4(pack(sz, jxx), pack(jzz, jxz)), vec4(0.0)));
    })().compute(this.sizes.length * n * n) as THREE.ComputeNode;
  }

  private buildAssemblePass(cascade: number, a: N, b: N, foam: N): THREE.ComputeNode {
    const n = this.n;
    return Fn(() => {
      const local = instanceIndex;
      const idx = local.add(uint(cascade * n * n));
      const x = local.mod(uint(n));
      const m = local.div(uint(n));
      const sign = select(x.add(m).mod(uint(2)).equal(uint(0)), float(1.0), float(-1.0));
      const fa = a.element(idx).mul(sign);
      const fb = b.element(idx).mul(sign);
      const lam = this.choppiness;
      const jxx = fb.y.mul(lam);
      const jzz = fb.z.mul(lam);
      const jxz = fb.w.mul(lam);
      const jacobian = float(1.0).add(jxx).mul(float(1.0).add(jzz)).sub(jxz.mul(jxz));
      const inject = saturate(this.foamThreshold.sub(jacobian).mul(this.foamGain));
      const next = max(foam.element(idx).mul(exp(this.dt.negate().div(this.foamDecay))), inject);
      foam.element(idx).assign(next);
      textureStore(this.displacement[cascade], uvec2(x, m), vec4(fa.x.mul(lam), fa.y, fa.z.mul(lam), next));
      textureStore(this.derivatives[cascade], uvec2(x, m), vec4(fa.w, fb.x, jxx, jzz));
    })().compute(n * n) as THREE.ComputeNode;
  }
}
```

- [ ] **Step 4: Run the self-tests**

Run: `npm run typecheck`, then open `http://localhost:5173/?selftest`.
Expected: `[selftest] SUMMARY 9/9 passed`. The realised Hs should be within 35% of about 1.60 m.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: add three-cascade FFT ocean simulation with foam

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Ocean mesh maths: polar grid, cascade fades, water optics

**Files:**
- Create: `src/ocean/polarGrid.ts`, `src/ocean/cascadeFades.ts`, `src/ocean/waterOptics.ts`
- Test: `src/ocean/polarGrid.test.ts`, `src/ocean/cascadeFades.test.ts`, `src/ocean/waterOptics.test.ts`

**Interfaces:**
- Consumes: `CASCADE_SIZES_M`, `Rgb`.
- Produces:
  - `interface PolarGridOptions { segments; innerRadiusM; outerRadiusM }`, `DEFAULT_POLAR_GRID = { segments: 384, innerRadiusM: 0.25, outerRadiusM: 20000 }`, `interface PolarGrid { positions: Float32Array; indices: Uint32Array; ringRadii: number[] }`, `buildPolarGrid(o?)`
  - `type FadeRange = readonly [number, number]`, `interface CascadeFade { geometry: FadeRange; normals: FadeRange }`, `CASCADE_FADES`, `fadeWeight(distance, range) → [0, 1]`, `fadeWeightNode(distanceNode, range)`
  - `interface WaterOpticsParams { absorptionPerM: Rgb; backscatterPerM: Rgb; bodyScale; transmissionThicknessM; transmissionIntensity; baseRoughness; foamAlbedo }`, `DEFAULT_WATER_OPTICS`, `waterAlbedo(p) → Rgb`, `transmissionColour(p) → Rgb`, `unresolvedSlopeVariance(distance, slopeVariance, fades?) → number`

The polar grid is centred on the camera. Its ring spacing grows geometrically with the angular spacing, so the triangles cover a roughly constant area on screen from 25 cm out to 20 km. It has about 267k vertices. Fades hand each cascade's detail from the geometry to the normals and then to roughness as distance grows, which avoids aliasing without mipmaps.

- [ ] **Step 1: Write failing tests**

`src/ocean/polarGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPolarGrid } from './polarGrid';

describe('buildPolarGrid', () => {
  const opts = { segments: 64, innerRadiusM: 0.5, outerRadiusM: 1000 };
  const g = buildPolarGrid(opts);
  it('has a centre vertex plus one vertex per segment per ring', () => {
    expect(g.positions.length / 3).toBe(1 + g.ringRadii.length * opts.segments);
  });
  it('rings grow strictly and reach the outer radius', () => {
    for (let i = 1; i < g.ringRadii.length; i++) expect(g.ringRadii[i]).toBeGreaterThan(g.ringRadii[i - 1]);
    expect(g.ringRadii.at(-1)!).toBeGreaterThanOrEqual(opts.outerRadiusM);
    expect(g.ringRadii[0]).toBe(opts.innerRadiusM);
  });
  it('has the expected triangle count and valid indices', () => {
    expect(g.indices.length / 3).toBe(opts.segments + (g.ringRadii.length - 1) * opts.segments * 2);
    const vertexCount = g.positions.length / 3;
    expect(Math.max(...g.indices)).toBeLessThan(vertexCount);
  });
  it('every triangle faces up (+Y)', () => {
    const p = g.positions, idx = g.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
      const e1x = p[b] - p[a], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2z = p[c + 2] - p[a + 2];
      expect(e1z * e2x - e1x * e2z).toBeGreaterThan(0); // y of e1 × e2
    }
  });
  it('the default grid stays within a sane vertex budget', () => {
    const d = buildPolarGrid();
    expect(d.positions.length / 3).toBeLessThan(300_000);
  });
});
```

`src/ocean/cascadeFades.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CASCADE_SIZES_M } from './spectrum';
import { CASCADE_FADES, fadeWeight } from './cascadeFades';

describe('fadeWeight', () => {
  it('is 1 before the range, 0 after, 0.5 in the middle', () => {
    expect(fadeWeight(10, [20, 60])).toBe(1);
    expect(fadeWeight(60, [20, 60])).toBe(0);
    expect(fadeWeight(100, [20, 60])).toBe(0);
    expect(fadeWeight(40, [20, 60])).toBeCloseTo(0.5);
  });
  it('never increases with distance', () => {
    let prev = 1;
    for (let d = 0; d < 100; d += 0.5) { const w = fadeWeight(d, [20, 60]); expect(w).toBeLessThanOrEqual(prev); prev = w; }
  });
});

describe('CASCADE_FADES', () => {
  it('has one entry per cascade', () => expect(CASCADE_FADES.length).toBe(CASCADE_SIZES_M.length));
  it('finer cascades fade sooner, and normals outlast geometry', () => {
    for (let c = 1; c < CASCADE_FADES.length; c++) expect(CASCADE_FADES[c].geometry[1]).toBeLessThan(CASCADE_FADES[c - 1].geometry[1]);
    for (const f of CASCADE_FADES) expect(f.normals[1]).toBeGreaterThanOrEqual(f.geometry[1]);
  });
});
```

`src/ocean/waterOptics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CASCADE_FADES } from './cascadeFades';
import { DEFAULT_WATER_OPTICS, transmissionColour, unresolvedSlopeVariance, waterAlbedo } from './waterOptics';

describe('water optics', () => {
  it('deep clear water scatters blue', () => {
    const [r, g, b] = waterAlbedo(DEFAULT_WATER_OPTICS);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(b).toBeLessThan(1);
    expect(r).toBeGreaterThan(0);
  });
  it('light through 2 m of water turns turquoise', () => {
    const [r, g, b] = transmissionColour(DEFAULT_WATER_OPTICS);
    expect(r).toBeLessThan(0.5);
    expect(g).toBeGreaterThan(0.8);
    expect(b).toBeGreaterThan(0.9);
  });
  it('unresolved slope variance is 0 up close and the full sum far away', () => {
    const sv = [0.001, 0.01, 0.02];
    expect(unresolvedSlopeVariance(0, sv, CASCADE_FADES)).toBe(0);
    expect(unresolvedSlopeVariance(1e6, sv, CASCADE_FADES)).toBeCloseTo(0.031);
    expect(unresolvedSlopeVariance(1000, sv, CASCADE_FADES)).toBeGreaterThan(unresolvedSlopeVariance(100, sv, CASCADE_FADES));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ocean`
Expected: FAIL (new modules not found); the spectrum tests still pass.

- [ ] **Step 3: Implement**

`src/ocean/polarGrid.ts`:

```ts
export interface PolarGridOptions {
  segments: number;
  innerRadiusM: number;
  outerRadiusM: number;
}

export const DEFAULT_POLAR_GRID: PolarGridOptions = { segments: 384, innerRadiusM: 0.25, outerRadiusM: 20000 };

export interface PolarGrid {
  positions: Float32Array;
  indices: Uint32Array;
  ringRadii: number[];
}

/** Camera-centred disc: centre fan + rings whose spacing matches the angular spacing (square-ish cells). */
export function buildPolarGrid(o: PolarGridOptions = DEFAULT_POLAR_GRID): PolarGrid {
  const growth = 1 + (2 * Math.PI) / o.segments;
  const ringRadii: number[] = [];
  for (let r = o.innerRadiusM; ; r *= growth) {
    ringRadii.push(r);
    if (r >= o.outerRadiusM) break;
  }
  const seg = o.segments;
  const positions = new Float32Array((1 + ringRadii.length * seg) * 3);
  ringRadii.forEach((r, i) => {
    for (let j = 0; j < seg; j++) {
      const a = (2 * Math.PI * j) / seg;
      const v = (1 + i * seg + j) * 3;
      positions[v] = r * Math.cos(a);
      positions[v + 2] = r * Math.sin(a);
    }
  });
  const indices = new Uint32Array((seg + (ringRadii.length - 1) * seg * 2) * 3);
  let k = 0;
  for (let j = 0; j < seg; j++) {
    indices[k++] = 0;
    indices[k++] = 1 + ((j + 1) % seg);
    indices[k++] = 1 + j;
  }
  for (let i = 0; i < ringRadii.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j;
      const b = 1 + i * seg + ((j + 1) % seg);
      const c = 1 + (i + 1) * seg + j;
      const d = 1 + (i + 1) * seg + ((j + 1) % seg);
      indices[k++] = a; indices[k++] = b; indices[k++] = c;
      indices[k++] = b; indices[k++] = d; indices[k++] = c;
    }
  }
  return { positions, indices, ringRadii };
}
```

`src/ocean/cascadeFades.ts`:

```ts
import { float, smoothstep } from 'three/tsl';

type N = any;

export type FadeRange = readonly [number, number];

export interface CascadeFade {
  /** Distance (m) over which the cascade's vertex displacement fades out. */
  geometry: FadeRange;
  /** Distance (m) over which its normals fade out (after which it only adds roughness). */
  normals: FadeRange;
}

/** One per cascade: 3000 m, 250 m, 35 m patches. */
export const CASCADE_FADES: readonly CascadeFade[] = [
  { geometry: [8000, 15000], normals: [12000, 20000] },
  { geometry: [300, 1500], normals: [2000, 8000] },
  { geometry: [20, 60], normals: [150, 600] },
];

/** 1 − smoothstep(start, end, d), matching the TSL version exactly. */
export function fadeWeight(distance: number, [start, end]: FadeRange): number {
  if (distance <= start) return 1;
  if (distance >= end) return 0;
  const t = (distance - start) / (end - start);
  return 1 - t * t * (3 - 2 * t);
}

export function fadeWeightNode(distance: N, [start, end]: FadeRange): N {
  return float(1.0).sub(smoothstep(start, end, distance));
}
```

`src/ocean/waterOptics.ts`:

```ts
import type { Rgb } from '../sky/atmosphereParams';
import { CASCADE_FADES, type CascadeFade, fadeWeight } from './cascadeFades';

export interface WaterOpticsParams {
  /** Pure-water absorption (1/m), RGB. */
  absorptionPerM: Rgb;
  /** Backscattering (1/m) of very clear oceanic water, RGB. */
  backscatterPerM: Rgb;
  bodyScale: number;
  /** Path length through a crest for the transmission tint. */
  transmissionThicknessM: number;
  transmissionIntensity: number;
  baseRoughness: number;
  foamAlbedo: number;
}

export const DEFAULT_WATER_OPTICS: WaterOpticsParams = {
  absorptionPerM: [0.45, 0.07, 0.02],
  backscatterPerM: [0.0004, 0.001, 0.0024],
  bodyScale: 1,
  transmissionThicknessM: 2,
  transmissionIntensity: 0.6,
  baseRoughness: 0.02,
  foamAlbedo: 0.85,
};

/** Single-scattering albedo of the deep water column: bb / (a + bb). */
export function waterAlbedo(p: WaterOpticsParams): Rgb {
  return [0, 1, 2].map((i) => p.backscatterPerM[i] / (p.absorptionPerM[i] + p.backscatterPerM[i])) as Rgb;
}

/** Colour of sunlight after passing through a crest: exp(−a·thickness). */
export function transmissionColour(p: WaterOpticsParams): Rgb {
  return [0, 1, 2].map((i) => Math.exp(-p.absorptionPerM[i] * p.transmissionThicknessM)) as Rgb;
}

/** Slope variance of cascades whose normals have faded at this distance (widens the sun glitter instead). */
export function unresolvedSlopeVariance(distance: number, slopeVariance: readonly number[], fades: readonly CascadeFade[] = CASCADE_FADES): number {
  return slopeVariance.reduce((sum, v, c) => sum + (1 - fadeWeight(distance, fades[c].normals)) * v, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ocean && npm run typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/ocean
git commit -m "feat: add polar ocean grid, cascade fades and water optics maths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ocean surface in the scene (geometry + first shading)

**Files:**
- Create: `src/ocean/waterShading.ts`, `src/ocean/OceanSurface.ts`
- Modify: `src/app/App.ts`

**Interfaces:**
- Consumes: `OceanSimulation`, `Sky`, `buildPolarGrid`, `CASCADE_FADES`, `fadeWeightNode`, `WaterOpticsParams`, `waterAlbedo`, `transmissionColour`, `DEFAULT_WATER_OPTICS`.
- Produces:
  - `interface WaterSurfaceInputs { normal; viewDir; distance; foam; crestHeight; unresolvedSlopeVariance; hsTotal }` (all nodes; `viewDir` points from the surface to the camera)
  - `createWaterOpticsUniforms(p)`, `type WaterOpticsUniforms`, `updateWaterOpticsUniforms(u, p)`, `shadeWater(inputs, sky, u) → colour node`
  - `EARTH_RADIUS_M = 6_371_000`, `class OceanSurface { mesh; cameraXZ; constructor(sim, sky, optics); update(cameraPosition, sim) }`

- [ ] **Step 1: First-pass water shading (Fresnel reflection + deep-water body colour)**

`src/ocean/waterShading.ts`:

```ts
import * as THREE from 'three/webgpu';
import { PI, dot, float, max, mix, normalize, pow, reflect, uniform, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { type WaterOpticsParams, transmissionColour, waterAlbedo } from './waterOptics';

type N = any;

export interface WaterSurfaceInputs {
  normal: N;
  /** Unit vector from the surface point toward the camera. */
  viewDir: N;
  distance: N;
  foam: N;
  /** Vertical displacement above mean sea level (m). */
  crestHeight: N;
  unresolvedSlopeVariance: N;
  hsTotal: N;
}

export function createWaterOpticsUniforms(p: WaterOpticsParams) {
  return {
    albedo: uniform(new THREE.Vector3(...waterAlbedo(p))),
    transmission: uniform(new THREE.Vector3(...transmissionColour(p))),
    bodyScale: uniform(p.bodyScale),
    transmissionIntensity: uniform(p.transmissionIntensity),
    baseRoughness: uniform(p.baseRoughness),
    foamAlbedo: uniform(p.foamAlbedo),
  };
}

export type WaterOpticsUniforms = ReturnType<typeof createWaterOpticsUniforms>;

export function updateWaterOpticsUniforms(u: WaterOpticsUniforms, p: WaterOpticsParams): void {
  u.albedo.value.set(...waterAlbedo(p));
  u.transmission.value.set(...transmissionColour(p));
  u.bodyScale.value = p.bodyScale;
  u.transmissionIntensity.value = p.transmissionIntensity;
  u.baseRoughness.value = p.baseRoughness;
  u.foamAlbedo.value = p.foamAlbedo;
}

export const schlickWater = (cosTheta: N): N => float(0.02).add(float(0.98).mul(pow(float(1.0).sub(cosTheta), 5.0)));

/** First pass: sky reflection + deep-water body colour + aerial perspective. Task 14 replaces this with the full model. */
export function shadeWater(i: WaterSurfaceInputs, sky: Sky, u: WaterOpticsUniforms): N {
  const fresnel = schlickWater(max(dot(i.normal, i.viewDir), 1e-3));
  const r = reflect(i.viewDir.negate(), i.normal);
  const reflection = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z)));
  const body = u.albedo.mul(sky.skyIrradiance.add(sky.sunIlluminance.mul(max(sky.sunDirection.y, 0.0)))).div(PI).mul(u.bodyScale);
  return sky.applyAerialPerspective(mix(body, reflection, fresnel), i.distance, i.viewDir.negate());
}
```

- [ ] **Step 2: The ocean surface mesh and material**

`src/ocean/OceanSurface.ts`:

```ts
import * as THREE from 'three/webgpu';
import { cameraPosition, float, length, max, normalize, positionLocal, positionWorld, texture, uniform, varying, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';
import { buildPolarGrid } from './polarGrid';
import { type WaterOpticsUniforms, shadeWater } from './waterShading';

type N = any;

export const EARTH_RADIUS_M = 6_371_000;

export class OceanSurface {
  readonly mesh: THREE.Mesh;
  /** The grid is centred here each frame; waves are sampled in world space so they never slide. */
  readonly cameraXZ = uniform(new THREE.Vector2());
  private readonly slopeVariance: ReturnType<typeof uniform<number>>[];
  private readonly hsTotal = uniform(0);

  constructor(sim: OceanSimulation, sky: Sky, optics: WaterOpticsUniforms) {
    this.slopeVariance = sim.sizes.map(() => uniform(0));
    const grid = buildPolarGrid();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));

    const material = new THREE.MeshBasicNodeMaterial();

    // Vertex: world-anchored sampling, distance-faded cascades, Earth curvature.
    const baseXZ = positionLocal.xz.add(this.cameraXZ);
    const radial = length(positionLocal.xz);
    let displacement: N = vec3(0.0);
    sim.sizes.forEach((size, c) => {
      const d = texture(sim.displacement[c], baseXZ.div(size)).level(0).xyz;
      displacement = displacement.add(d.mul(fadeWeightNode(radial, CASCADE_FADES[c].geometry)));
    });
    const curvatureDrop = radial.mul(radial).div(2 * EARTH_RADIUS_M);
    material.positionNode = vec3(baseXZ.x.add(displacement.x), displacement.y.sub(curvatureDrop), baseXZ.y.add(displacement.z));
    const vBaseXZ = varying(baseXZ);
    const vHeight = varying(displacement.y);

    // Fragment: normals and foam from the derivative/displacement textures at the undisplaced position.
    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    let sx: N = float(0.0), sz: N = float(0.0), jxx: N = float(0.0), jzz: N = float(0.0);
    let foam: N = float(0.0), lostSlopeVariance: N = float(0.0);
    sim.sizes.forEach((size, c) => {
      const w = fadeWeightNode(distance, CASCADE_FADES[c].normals);
      const d = texture(sim.derivatives[c], vBaseXZ.div(size));
      sx = sx.add(d.x.mul(w));
      sz = sz.add(d.y.mul(w));
      jxx = jxx.add(d.z.mul(w));
      jzz = jzz.add(d.w.mul(w));
      foam = max(foam, texture(sim.displacement[c], vBaseXZ.div(size)).w.mul(w));
      lostSlopeVariance = lostSlopeVariance.add(float(1.0).sub(w).mul(this.slopeVariance[c]));
    });
    const normal = normalize(vec3(
      sx.negate().div(max(float(1.0).add(jxx), 0.1)),
      1.0,
      sz.negate().div(max(float(1.0).add(jzz), 0.1)),
    ));

    material.colorNode = shadeWater(
      { normal, viewDir, distance, foam, crestHeight: vHeight, unresolvedSlopeVariance: lostSlopeVariance, hsTotal: this.hsTotal },
      sky,
      optics,
    );

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(cameraPos: THREE.Vector3, sim: OceanSimulation): void {
    this.cameraXZ.value.set(cameraPos.x, cameraPos.z);
    sim.slopeVariance.forEach((v, c) => { this.slopeVariance[c].value = v; });
    this.hsTotal.value = sim.hsTotal;
  }
}
```

If `ReturnType<typeof uniform<number>>` is rejected by the TypeScript version in use, declare the field as `private readonly slopeVariance: Array<{ value: number }>;`, since only `.value` is used.

- [ ] **Step 3: Put the ocean in the App**

In `src/app/App.ts`:
- **delete** the `devGrid` field and `this.scene.add(this.devGrid);`;
- import `OceanSimulation`, `OceanSurface`, `createWaterOpticsUniforms` and `DEFAULT_WATER_OPTICS`;
- add the fields:

```ts
  readonly ocean = new OceanSimulation();
  readonly waterOptics = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
  readonly oceanSurface: OceanSurface;
```

- in the constructor, after `this.scene.add(this.sky.dome);`, add:

```ts
    this.oceanSurface = new OceanSurface(this.ocean, this.sky, this.waterOptics);
    this.scene.add(this.oceanSurface.mesh);
```

- in `applyMoment`, after assigning conditions, add `this.ocean.setConditions(this.conditions);`;
- in `frame`, capture the sim step with `const simDt = this.clock.tick(realDt);` (replacing the bare `this.clock.tick(realDt);`), and after `this.sky.followCamera(...)` add:

```ts
    this.ocean.update(this.renderer, this.clock.simTime, simDt);
    this.oceanSurface.update(this.camera.position, this.ocean);
```

Note that `applyMoment` runs inside the constructor, so the `ocean` field initialiser must appear above the constructor (as field initialisers do). The lineup camera still assumes flat water until Task 15, so it may dip under crests. Use the free camera (`C`) for inspection.

- [ ] **Step 4: Verify visually**

Run: `npm run typecheck && npm test`
Expected: clean; PASS.

Screenshot `#ref=morning-offshore`, `#ref=overview` and `#ref=golden-hour`. Expected:
- Long, orderly SW swell lines with small chop on top. Deep blue body colour, with the sky reflection brighter toward the horizon.
- The horizon sits cleanly in the haze.
- In `overview`, no visible tiling repeats or rings or seams where the fades happen, and the horizon line is slightly below eye level because of Earth curvature.
- Press `C` and fly low over the crests: displacement looks continuous, with no cracks.
- Record FPS by eye from the browser (a formal readout comes in Task 16).

Also run `?selftest`: `[selftest] SUMMARY 9/9 passed`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: render the FFT ocean on a camera-centred polar grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Full water shading: sun glitter, crest transmission, foam

**Files:**
- Modify: `src/ocean/waterShading.ts` (replace `shadeWater`)

**Interfaces:**
- Consumes: `WaterSurfaceInputs`, `WaterOpticsUniforms`, `Sky.sunDirection`, `Sky.sunIlluminance`, `Sky.skyIrradiance`, `Sky.radiance`, `Sky.applyAerialPerspective`.
- Produces: `shadeWater(inputs, sky, u)` with the same signature, now including GGX sun glitter (roughness widened by unresolved slope variance), deep-water upwelling, crest light transmission (turquoise when the sun is behind a raised crest), and lit foam.

- [ ] **Step 1: Replace `shadeWater`**

In `src/ocean/waterShading.ts`, update the tsl import to:

```ts
import { PI, dot, float, max, min, mix, normalize, pow, reflect, saturate, step, uniform, vec3 } from 'three/tsl';
```

and replace the `shadeWater` function with:

```ts
/**
 * Water = Fresnel-weighted sky reflection + GGX sun glitter + light from the water column
 * (deep upwelling + crest transmission), mixed with lit foam, then aerial perspective.
 */
export function shadeWater(i: WaterSurfaceInputs, sky: Sky, u: WaterOpticsUniforms): N {
  const n = i.normal;
  const v = i.viewDir;
  const l = sky.sunDirection;
  const nDotV = max(dot(n, v), 1e-3);
  const nDotL = dot(n, l);
  const fresnel = schlickWater(nDotV);

  const r = reflect(v.negate(), n);
  const reflection = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z)));

  // GGX sun glitter. Slopes too small to resolve at this distance widen the lobe (α² ≈ 2σ²).
  const h = normalize(l.add(v));
  const nDotH = max(dot(n, h), 0.0);
  const alpha2 = u.baseRoughness.mul(u.baseRoughness).add(i.unresolvedSlopeVariance.mul(2.0));
  const denom = nDotH.mul(nDotH).mul(alpha2.sub(1.0)).add(1.0);
  const ggx = alpha2.div(PI.mul(denom).mul(denom));
  const specular = min(
    sky.sunIlluminance.mul(ggx).mul(schlickWater(max(dot(v, h), 0.0))).div(nDotV.mul(4.0)).mul(step(0.0, nDotL)),
    vec3(30000.0),
  );

  // Light scattered back up out of the deep, clear water column.
  const upwelling = u.albedo.mul(sky.skyIrradiance.add(sky.sunIlluminance.mul(max(l.y, 0.0)))).div(PI).mul(u.bodyScale);

  // Crest transmission: sun behind a raised crest shines through thin water toward the viewer.
  const crest = saturate(i.crestHeight.div(max(i.hsTotal.mul(0.5), 0.05)));
  const backlight = pow(saturate(dot(v.negate(), l)), 4.0);
  const transmitted = u.transmission.mul(sky.sunIlluminance).mul(backlight).mul(crest).mul(u.transmissionIntensity).div(PI);

  const water = upwelling.add(transmitted).mul(float(1.0).sub(fresnel)).add(reflection.mul(fresnel)).add(specular);
  const foamLight = sky.skyIrradiance.add(sky.sunIlluminance.mul(saturate(nDotL))).mul(u.foamAlbedo).div(PI);
  const colour = mix(water, foamLight, saturate(i.foam));
  return sky.applyAerialPerspective(colour, i.distance, v.negate());
}
```

- [ ] **Step 2: Verify visually against the reference moments**

Run: `npm run typecheck && npm test`
Expected: clean; PASS.

Screenshot these reference moments and compare them with the photos in `reference/`:
- `#ref=golden-hour`: a bright, glittering sun path toward the horizon that broadens with distance; crests between you and the sun glow blue-green; the choppier surface catches small whitecaps.
- `#ref=autumn-glass`: a smooth, mirror-like surface; the sky reflection is crisp; swell lines read as gentle corduroy; no whitecaps.
- `#ref=morning-offshore`: sun behind you, so deep clear blue water with no glitter path. Compare the colour with `reference/wave/womb-early-morning-water-level-backlit-spray.png` (open water only).
- `#ref=noon-deep-blue`: looking down, deep saturated blue with small, sharp sun glints.
- `#ref=sunset` and `#ref=pre-dawn`: no NaN or black pixels, and no fireflies.

Record all screenshots in the task report.

- [ ] **Step 3: Commit**

```bash
git add src/ocean/waterShading.ts
git commit -m "feat: add sun glitter, crest transmission and foam to water shading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Height probe: the lineup camera floats on the real water

**Files:**
- Create: `src/ocean/HeightProbe.ts`, `src/ocean/probe.selftest.ts`
- Modify: `src/app/App.ts`, `src/dev/selfTests.ts`

**Interfaces:**
- Consumes: `OceanSimulation.displacement`, `OceanSimulation.sizes`, `CameraRig.probeXZ`.
- Produces: `MAX_PROBES = 16`, `class HeightProbe { outputAttr; constructor(sim); setProbe(index, x, z); update(renderer); heightAt(index) → number | null; readNow(renderer) → Promise<Float32Array> }`.

The displacement is Lagrangian: the texel at `x₀` ends up at `x₀ + D(x₀)`. To find the height at a world point `p`, the probe solves `x₀ = p − D_xz(x₀)` by fixed-point iteration (4 iterations), then reads `D_y(x₀)`. The readback is asynchronous. `heightAt` holds the last good value while a readback is in flight, and returns `null` only before the first result arrives.

- [ ] **Step 1: Write the GPU self-tests**

`src/ocean/probe.selftest.ts`:

```ts
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { HeightProbe } from './HeightProbe';
import { OceanSimulation } from './OceanSimulation';

registerSelfTest({
  name: 'probe: flat calm reads zero everywhere',
  async run(renderer) {
    const calm = cloneConditions(DEFAULT_CONDITIONS);
    calm.swell.sizeFt = 0;
    calm.wind.speedMs = 0;
    const sim = new OceanSimulation();
    sim.setConditions(calm);
    sim.update(renderer, 5, 1 / 60);
    const probe = new HeightProbe(sim);
    [[0, 0], [-15, 0], [123.4, -987.6]].forEach(([x, z], i) => probe.setProbe(i, x, z));
    const out = await probe.readNow(renderer);
    const worst = Math.max(Math.abs(out[0]), Math.abs(out[4]), Math.abs(out[8]));
    return { pass: worst < 1e-4, detail: `max |h| ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'probe: live sea is finite, bounded and moving',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.setConditions(DEFAULT_CONDITIONS);
    const probe = new HeightProbe(sim);
    for (let i = 0; i < 8; i++) probe.setProbe(i, -15 + i * 7, i * 3);
    sim.update(renderer, 10, 1 / 60);
    const a = await probe.readNow(renderer);
    sim.update(renderer, 13, 1 / 60);
    const b = await probe.readNow(renderer);
    const heightsA = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => a[i * 4]);
    const heightsB = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => b[i * 4]);
    const finite = [...heightsA, ...heightsB].every(Number.isFinite);
    const bounded = [...heightsA, ...heightsB].every((h) => Math.abs(h) < 2 * sim.hsTotal);
    const moving = heightsA.some((h, i) => Math.abs(h - heightsB[i]) > 0.01);
    return { pass: finite && bounded && moving, detail: `t=10 ${heightsA.map((h) => h.toFixed(2)).join(',')}; t=13 ${heightsB.map((h) => h.toFixed(2)).join(',')}` };
  },
});
```

Add to `src/dev/selfTests.ts`:

```ts
import '../ocean/probe.selftest';
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run typecheck`
Expected: FAIL, `Cannot find module './HeightProbe'`.

- [ ] **Step 3: Implement**

`src/ocean/HeightProbe.ts`:

```ts
import * as THREE from 'three/webgpu';
import { Fn, Loop, instanceIndex, storage, texture, vec3, vec4 } from 'three/tsl';
import type { OceanSimulation } from './OceanSimulation';

type N = any;

export const MAX_PROBES = 16;
const FIXED_POINT_ITERATIONS = 4;

/** Samples the ocean's height at up to 16 world XZ points on the GPU and reads them back asynchronously. */
export class HeightProbe {
  readonly outputAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_PROBES * 4), 4);
  private readonly inputAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_PROBES * 4), 4);
  private readonly pass: THREE.ComputeNode;
  private latest: Float32Array | null = null;
  private pending = false;

  constructor(sim: OceanSimulation) {
    const input = storage(this.inputAttr, 'vec4', MAX_PROBES).toReadOnly();
    const output = storage(this.outputAttr, 'vec4', MAX_PROBES);
    const displacementAt = (xz: N): N =>
      sim.sizes.reduce((acc: N, size, c) => acc.add(texture(sim.displacement[c], xz.div(size)).level(0).xyz), vec3(0.0));
    this.pass = Fn(() => {
      const target = input.element(instanceIndex).xy;
      const origin = target.toVar();
      Loop({ start: 0, end: FIXED_POINT_ITERATIONS, name: 'it' }, () => {
        origin.assign(target.sub(displacementAt(origin).xz));
      });
      output.element(instanceIndex).assign(vec4(displacementAt(origin).y, 0.0, 0.0, 1.0));
    })().compute(MAX_PROBES) as THREE.ComputeNode;
  }

  setProbe(index: number, x: number, z: number): void {
    const a = this.inputAttr.array as Float32Array;
    a[index * 4] = x;
    a[index * 4 + 1] = z;
    this.inputAttr.needsUpdate = true;
  }

  /** Dispatch the probe pass and start a readback if none is in flight. Call after the ocean update. */
  update(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.pass);
    if (this.pending) return;
    this.pending = true;
    renderer
      .getArrayBufferAsync(this.outputAttr)
      .then((buffer) => { this.latest = new Float32Array(buffer); })
      .catch((e) => console.warn('HeightProbe readback failed; holding last value', e))
      .finally(() => { this.pending = false; });
  }

  heightAt(index: number): number | null {
    return this.latest ? this.latest[index * 4] : null;
  }

  /** Synchronous-style read for self-tests. */
  async readNow(renderer: THREE.WebGPURenderer): Promise<Float32Array> {
    renderer.compute(this.pass);
    return new Float32Array(await renderer.getArrayBufferAsync(this.outputAttr));
  }
}
```

- [ ] **Step 4: Float the lineup camera**

In `src/app/App.ts`:
- import `HeightProbe` from `../ocean/HeightProbe`;
- add the field `readonly probe = new HeightProbe(this.ocean);` **directly below** the `ocean` field (field initialisers run in order);
- replace the body of `waterHeightAtCamera()` with `return this.probe.heightAt(0) ?? 0;` and update its comment to `/** Latest GPU-sampled water height under the lineup camera (holds while a readback is in flight). */`;
- in `frame`, directly after `this.ocean.update(...)`, add:

```ts
    const probeXZ = this.rig.probeXZ;
    this.probe.setProbe(0, probeXZ.x, probeXZ.z);
    this.probe.update(this.renderer);
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: clean; PASS.

Open `?selftest`: `[selftest] SUMMARY 11/11 passed`.

Open the default moment (no hash) and watch for about 30 s. The camera rises and falls smoothly with the swell (roughly ±1 m at 4 ft), with no jitter or stepping, and never dips under the surface in calm moments. Hold Space to rise and release to settle back. Switch to free fly (`C`) and back: the lineup camera re-seats on the water.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: float the lineup camera on GPU-sampled water height

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Developer tools: panel, performance readout, hotkeys, moment links, device loss

**Files:**
- Create: `src/dev/perf.ts`, `src/dev/DevPanel.ts`, `src/dev/hotkeys.ts`
- Test: `src/dev/perf.test.ts`, `src/dev/hotkeys.test.ts`, `src/conditions/assign.test.ts`, `src/ocean/spectrumKey.test.ts`
- Modify: `src/conditions/defaults.ts` (add `assignConditions`), `src/ocean/spectrum.ts` (add `spectrumInputsKey`), `src/app/App.ts` (final version below)

**Interfaces:**
- Produces:
  - `assignConditions(target, source)`: copies values **in place**, preserving the `target`, `target.swell` and `target.wind` object identities, which the Tweakpane bindings rely on.
  - `spectrumInputsKey(c, p) → string`: changes only when a change requires a spectrum rebuild (swell, wind, seed, spectrum params), and not when only the time of day changes.
  - `interface AdapterSummary { vendor; architecture; description }`, `summariseAdapter(info)`, `describeAdapter(s)`, `isLikelyIntegratedGpu(s)`, `INTEGRATED_GPU_HELP`, `class PerfOverlay { constructor(renderer); update(); setVisible(v); flash(message) }`
  - `HOTKEYS`, `interface HotkeyHandlers { copyLink; togglePause; screenshot; toggleDevUi }`, `handleHotkeys(input, handlers)`, `screenshotFilename(c)`, `captureScreenshot(canvas, filename)`
  - `interface DevPanelModel`, `interface DevPanelHandlers`, `class DevPanel { refresh(); setVisible(v) }`

- [ ] **Step 1: Write failing tests**

`src/conditions/assign.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, assignConditions, cloneConditions } from './defaults';

describe('assignConditions', () => {
  it('copies values while preserving object identities', () => {
    const target = cloneConditions(DEFAULT_CONDITIONS);
    const swell = target.swell, wind = target.wind;
    const source = { ...cloneConditions(DEFAULT_CONDITIONS), timeOfDay: 17, swell: { sizeFt: 6, periodS: 18, directionDeg: 230 }, wind: { speedMs: 0, directionDeg: 90 } };
    assignConditions(target, source);
    expect(target).toEqual(source);
    expect(target.swell).toBe(swell);
    expect(target.wind).toBe(wind);
    expect(target.swell).not.toBe(source.swell);
  });
});
```

`src/ocean/spectrumKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_SPECTRUM_PARAMS, spectrumInputsKey } from './spectrum';

describe('spectrumInputsKey', () => {
  const base = spectrumInputsKey(DEFAULT_CONDITIONS, DEFAULT_SPECTRUM_PARAMS);
  it('ignores time of day, date and tide', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.timeOfDay = 17; c.date = '2026-04-20'; c.tideM = 1;
    expect(spectrumInputsKey(c, DEFAULT_SPECTRUM_PARAMS)).toBe(base);
  });
  it('changes with swell, wind, seed and spectrum params', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 5;
    expect(spectrumInputsKey(c, DEFAULT_SPECTRUM_PARAMS)).not.toBe(base);
    const d = cloneConditions(DEFAULT_CONDITIONS);
    d.seed = 1;
    expect(spectrumInputsKey(d, DEFAULT_SPECTRUM_PARAMS)).not.toBe(base);
    expect(spectrumInputsKey(DEFAULT_CONDITIONS, { ...DEFAULT_SPECTRUM_PARAMS, swellSpread: 20 })).not.toBe(base);
  });
});
```

`src/dev/perf.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeAdapter, isLikelyIntegratedGpu, summariseAdapter } from './perf';

describe('adapter summary', () => {
  it('reads GPUAdapterInfo-like objects defensively', () => {
    expect(summariseAdapter({ vendor: 'nvidia', architecture: 'ada', description: 'NVIDIA GeForce RTX 4060 Laptop GPU' }))
      .toEqual({ vendor: 'nvidia', architecture: 'ada', description: 'NVIDIA GeForce RTX 4060 Laptop GPU' });
    expect(summariseAdapter(undefined)).toEqual({ vendor: '', architecture: '', description: '' });
    expect(summariseAdapter({ vendor: 42 })).toEqual({ vendor: '', architecture: '', description: '' });
  });
  it('flags Intel integrated graphics but not NVIDIA or Intel Arc', () => {
    expect(isLikelyIntegratedGpu({ vendor: 'intel', architecture: 'gen-12lp', description: 'Intel(R) UHD Graphics' })).toBe(true);
    expect(isLikelyIntegratedGpu({ vendor: 'nvidia', architecture: 'ada', description: '' })).toBe(false);
    expect(isLikelyIntegratedGpu({ vendor: 'intel', architecture: 'alchemist', description: 'Intel(R) Arc(TM) A770' })).toBe(false);
    expect(isLikelyIntegratedGpu({ vendor: '', architecture: '', description: '' })).toBe(false);
  });
  it('describes unknown adapters', () => {
    expect(describeAdapter({ vendor: '', architecture: '', description: '' })).toBe('unknown GPU');
    expect(describeAdapter({ vendor: 'nvidia', architecture: 'ada', description: '' })).toBe('nvidia ada');
  });
});
```

`src/dev/hotkeys.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { handleHotkeys, screenshotFilename } from './hotkeys';

describe('handleHotkeys', () => {
  it('fires each action once per press', () => {
    const pressed = new Set(['KeyP', 'KeyL']);
    const input = { consumePressed: (code: string) => pressed.delete(code) };
    const h = { copyLink: vi.fn(), togglePause: vi.fn(), screenshot: vi.fn(), toggleDevUi: vi.fn() };
    handleHotkeys(input, h);
    handleHotkeys(input, h);
    expect(h.togglePause).toHaveBeenCalledTimes(1);
    expect(h.copyLink).toHaveBeenCalledTimes(1);
    expect(h.screenshot).not.toHaveBeenCalled();
    expect(h.toggleDevUi).not.toHaveBeenCalled();
  });
});

describe('screenshotFilename', () => {
  it('names files by date and local time', () => {
    expect(screenshotFilename({ date: '2026-07-15', timeOfDay: 8.25 })).toBe('liquid-dreams-2026-07-15-0815.png');
    expect(screenshotFilename({ date: '2026-07-15', timeOfDay: 16 + 50 / 60 })).toBe('liquid-dreams-2026-07-15-1650.png');
    expect(screenshotFilename({ date: '2026-04-20', timeOfDay: 23.999 })).toBe('liquid-dreams-2026-04-20-0000.png');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dev src/conditions src/ocean`
Expected: FAIL for the new tests only.

- [ ] **Step 3: Implement the pure helpers**

Append to `src/conditions/defaults.ts`:

```ts
/** Copy values in place, keeping target/target.swell/target.wind identities (UI bindings hold them). */
export function assignConditions(target: Conditions, source: Readonly<Conditions>): void {
  target.date = source.date;
  target.timeOfDay = source.timeOfDay;
  target.tideM = source.tideM;
  target.seed = source.seed;
  Object.assign(target.swell, source.swell);
  Object.assign(target.wind, source.wind);
}
```

Append to `src/ocean/spectrum.ts`:

```ts
/** Changes only when the initial spectrum must be rebuilt (not for time of day, date or tide). */
export function spectrumInputsKey(c: Conditions, p: OceanSpectrumParams): string {
  return JSON.stringify([c.swell.sizeFt, c.swell.periodS, c.swell.directionDeg, c.wind.speedMs, c.wind.directionDeg, c.seed, p]);
}
```

`src/dev/hotkeys.ts`:

```ts
import type { Conditions } from '../conditions/types';

export const HOTKEYS = { copyLink: 'KeyL', togglePause: 'KeyP', screenshot: 'KeyK', toggleDevUi: 'KeyH' } as const;

export interface HotkeyHandlers {
  copyLink(): void;
  togglePause(): void;
  screenshot(): void;
  toggleDevUi(): void;
}

export function handleHotkeys(input: { consumePressed(code: string): boolean }, h: HotkeyHandlers): void {
  for (const [action, code] of Object.entries(HOTKEYS) as Array<[keyof HotkeyHandlers, string]>) {
    if (input.consumePressed(code)) h[action]();
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function screenshotFilename(c: Pick<Conditions, 'date' | 'timeOfDay'>): string {
  const total = Math.round(c.timeOfDay * 60);
  return `liquid-dreams-${c.date}-${pad(Math.floor(total / 60) % 24)}${pad(total % 60)}.png`;
}

/** Call immediately after rendering, in the same task, so the WebGPU canvas still holds the frame. */
export function captureScreenshot(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}
```

`src/dev/perf.ts`:

```ts
import type * as THREE from 'three/webgpu';
import Stats from 'stats-gl';

export interface AdapterSummary {
  vendor: string;
  architecture: string;
  description: string;
}

export const INTEGRATED_GPU_HELP =
  'Running on integrated graphics. For full performance: Windows Settings → System → Display → Graphics → add your browser → Options → High performance, then restart the browser.';

export function summariseAdapter(info: unknown): AdapterSummary {
  const o = (typeof info === 'object' && info !== null ? info : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return { vendor: s(o.vendor), architecture: s(o.architecture), description: s(o.description) };
}

export function describeAdapter(a: AdapterSummary): string {
  return a.description || [a.vendor, a.architecture].filter(Boolean).join(' ') || 'unknown GPU';
}

export function isLikelyIntegratedGpu(a: AdapterSummary): boolean {
  const text = `${a.vendor} ${a.architecture} ${a.description}`.toLowerCase();
  return /intel/.test(text) && !/\barc\b|alchemist|battlemage/.test(text);
}

/** stats-gl (FPS / CPU / GPU ms) + adapter name + integrated-GPU warning + transient messages. */
export class PerfOverlay {
  private readonly stats: Stats;
  private readonly label = document.createElement('div');
  private readonly toast = document.createElement('div');
  private banner: HTMLElement | null = null;
  private toastTimer: number | undefined;

  constructor(renderer: THREE.WebGPURenderer) {
    this.stats = new Stats({ trackGPU: true, trackCPT: true });
    void this.stats.init(renderer);
    document.body.append(this.stats.dom);

    const adapter = summariseAdapter((renderer.backend as { device?: { adapterInfo?: unknown } }).device?.adapterInfo);
    Object.assign(this.label.style, { position: 'fixed', left: '8px', top: '56px', color: '#cfe3f2', font: '11px monospace', zIndex: '9' });
    this.label.textContent = describeAdapter(adapter);
    document.body.append(this.label);

    Object.assign(this.toast.style, { position: 'fixed', left: '50%', top: '16px', transform: 'translateX(-50%)', padding: '6px 12px',
      background: 'rgba(4,18,32,0.85)', color: '#e8f1f8', borderRadius: '6px', font: '13px system-ui', zIndex: '9', display: 'none' });
    document.body.append(this.toast);

    if (isLikelyIntegratedGpu(adapter)) {
      this.banner = document.createElement('div');
      this.banner.className = 'banner';
      this.banner.textContent = INTEGRATED_GPU_HELP;
      document.body.append(this.banner);
    }
  }

  update(): void {
    this.stats.update();
  }

  setVisible(visible: boolean): void {
    const display = visible ? '' : 'none';
    this.stats.dom.style.display = display;
    this.label.style.display = display;
  }

  flash(message: string): void {
    this.toast.textContent = message;
    this.toast.style.display = '';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast.style.display = 'none'; }, 2000);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: all PASS; clean.

- [ ] **Step 5: The dev panel**

`src/dev/DevPanel.ts`:

```ts
import { type ListBladeApi, Pane } from 'tweakpane';
import type { Conditions } from '../conditions/types';
import type { OceanSimParams } from '../ocean/OceanSimulation';
import type { OceanSpectrumParams } from '../ocean/spectrum';
import type { WaterOpticsParams } from '../ocean/waterOptics';
import type { PictureParams } from '../render/PicturePipeline';
import type { AtmosphereParams } from '../sky/atmosphereParams';
import { DEFAULT_MOMENT_NAME, REFERENCE_MOMENTS } from './referenceMoments';

export interface DevPanelModel {
  conditions: Conditions;
  spectrum: OceanSpectrumParams;
  sim: OceanSimParams;
  water: WaterOpticsParams;
  atmosphere: AtmosphereParams;
  picture: PictureParams;
}

export interface DevPanelHandlers {
  onConditions(): void;
  onSpectrum(): void;
  onSim(): void;
  onWater(): void;
  onAtmosphere(): void;
  onPicture(): void;
  onReferenceMoment(name: string): void;
  onCopyLink(): void;
  onScreenshot(): void;
  onTogglePause(): void;
}

export class DevPanel {
  private readonly pane = new Pane({ title: 'Liquid Dreams', expanded: true });

  constructor(m: DevPanelModel, h: DevPanelHandlers) {
    const moment = this.pane.addFolder({ title: 'Moment' });
    const ref = moment.addBlade({
      view: 'list', label: 'reference',
      options: REFERENCE_MOMENTS.map((r) => ({ text: r.name, value: r.name })),
      value: DEFAULT_MOMENT_NAME,
    }) as ListBladeApi<string>;
    ref.on('change', (e) => h.onReferenceMoment(e.value));
    moment.addBinding(m.conditions, 'date').on('change', h.onConditions);
    moment.addBinding(m.conditions, 'timeOfDay', { label: 'time (h)', min: 0, max: 23.999, step: 0.01 }).on('change', h.onConditions);
    moment.addBinding(m.conditions, 'seed', { min: 0, step: 1 }).on('change', h.onConditions);
    moment.addButton({ title: 'Copy moment link (L)' }).on('click', h.onCopyLink);
    moment.addButton({ title: 'Pause / resume (P)' }).on('click', h.onTogglePause);
    moment.addButton({ title: 'Screenshot (K)' }).on('click', h.onScreenshot);

    const swell = this.pane.addFolder({ title: 'Swell' });
    swell.addBinding(m.conditions.swell, 'sizeFt', { label: 'size (surfer ft)', min: 0, max: 12, step: 0.1 }).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'periodS', { label: 'period (s)', min: 4, max: 25, step: 0.5 }).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'directionDeg', { label: 'from (°)', min: 150, max: 300, step: 1 }).on('change', h.onConditions);

    const wind = this.pane.addFolder({ title: 'Wind' });
    wind.addBinding(m.conditions.wind, 'speedMs', { label: 'speed (m/s)', min: 0, max: 20, step: 0.1 }).on('change', h.onConditions);
    wind.addBinding(m.conditions.wind, 'directionDeg', { label: 'from (°)', min: 0, max: 359, step: 1 }).on('change', h.onConditions);

    const ocean = this.pane.addFolder({ title: 'Ocean', expanded: false });
    ocean.addBinding(m.spectrum, 'windFetchM', { label: 'fetch (m)', min: 500, max: 50000, step: 100 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'windSpread', { min: 1, max: 20, step: 0.5 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'swellSpread', { min: 5, max: 100, step: 1 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'windGamma', { min: 1, max: 7, step: 0.1 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'swellGamma', { min: 1, max: 10, step: 0.1 }).on('change', h.onSpectrum);
    ocean.addBinding(m.sim, 'choppiness', { min: 0, max: 2, step: 0.01 }).on('change', h.onSim);
    ocean.addBinding(m.sim, 'foamThreshold', { min: -0.5, max: 1, step: 0.01 }).on('change', h.onSim);
    ocean.addBinding(m.sim, 'foamGain', { min: 0, max: 5, step: 0.05 }).on('change', h.onSim);
    ocean.addBinding(m.sim, 'foamDecayS', { min: 0.2, max: 10, step: 0.1 }).on('change', h.onSim);

    const water = this.pane.addFolder({ title: 'Water', expanded: false });
    water.addBinding(m.water, 'bodyScale', { min: 0, max: 4, step: 0.01 }).on('change', h.onWater);
    water.addBinding(m.water, 'transmissionThicknessM', { min: 0.2, max: 6, step: 0.1 }).on('change', h.onWater);
    water.addBinding(m.water, 'transmissionIntensity', { min: 0, max: 3, step: 0.01 }).on('change', h.onWater);
    water.addBinding(m.water, 'baseRoughness', { min: 0.005, max: 0.2, step: 0.001 }).on('change', h.onWater);
    water.addBinding(m.water, 'foamAlbedo', { min: 0, max: 1, step: 0.01 }).on('change', h.onWater);

    const sky = this.pane.addFolder({ title: 'Sky', expanded: false });
    sky.addBinding(m.atmosphere, 'hazeFactor', { min: 0, max: 8, step: 0.05 }).on('change', h.onAtmosphere);
    sky.addBinding(m.atmosphere, 'sunIlluminance', { min: 1, max: 100, step: 0.5 }).on('change', h.onAtmosphere);
    sky.addBinding(m.atmosphere, 'nightFloor', { min: 0, max: 0.005, step: 0.0001 }).on('change', h.onAtmosphere);
    sky.addBinding(m.atmosphere, 'groundAlbedo', { min: 0, max: 1, step: 0.01 }).on('change', h.onAtmosphere);

    const picture = this.pane.addFolder({ title: 'Picture', expanded: false });
    picture.addBinding(m.picture, 'autoExposure').on('change', h.onPicture);
    picture.addBinding(m.picture, 'baseExposure', { min: 0.01, max: 5, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'evOffset', { label: 'EV offset', min: -5, max: 5, step: 0.1 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'bloomStrength', { min: 0, max: 1, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'bloomRadius', { min: 0, max: 1, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'bloomThreshold', { min: 0, max: 5, step: 0.05 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'lift', { min: -0.2, max: 0.2, step: 0.005 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'gamma', { min: 0.5, max: 2, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'gain', { min: 0.5, max: 2, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'saturation', { min: 0, max: 2, step: 0.01 }).on('change', h.onPicture);
  }

  refresh(): void {
    this.pane.refresh();
  }

  setVisible(visible: boolean): void {
    this.pane.hidden = !visible;
  }
}
```

If `ListBladeApi` isn't exported by `tweakpane@4.0.5`, cast to `{ on(event: 'change', cb: (e: { value: string }) => void): void }` instead.

- [ ] **Step 6: Final App wiring**

Replace `src/app/App.ts` entirely. This is the complete Phase 0 App, and it supersedes the incremental edits from Tasks 6–15:

```ts
import * as THREE from 'three/webgpu';
import { sunForConditions } from '../astro/sunForConditions';
import { CameraRig } from '../camera/CameraRig';
import { Input } from '../camera/Input';
import { DEFAULT_CONDITIONS, assignConditions, cloneConditions } from '../conditions/defaults';
import { sanitizeConditions } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import { DevPanel } from '../dev/DevPanel';
import { captureScreenshot, handleHotkeys, screenshotFilename } from '../dev/hotkeys';
import { type Moment, encodeMoment, momentFromHash } from '../dev/momentLink';
import { PerfOverlay } from '../dev/perf';
import { HeightProbe } from '../ocean/HeightProbe';
import { DEFAULT_OCEAN_SIM, type OceanSimParams, OceanSimulation } from '../ocean/OceanSimulation';
import { OceanSurface } from '../ocean/OceanSurface';
import { DEFAULT_SPECTRUM_PARAMS, type OceanSpectrumParams, spectrumInputsKey } from '../ocean/spectrum';
import { DEFAULT_WATER_OPTICS, type WaterOpticsParams } from '../ocean/waterOptics';
import { createWaterOpticsUniforms, updateWaterOpticsUniforms } from '../ocean/waterShading';
import { DEFAULT_PICTURE, type PictureParams, PicturePipeline } from '../render/PicturePipeline';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, type Rgb } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { SimClock, clampFrameDt, viewportSize } from './clock';
import { showOverlay } from './overlay';

const SPECTRUM_REBUILD_DEBOUNCE_MS = 150;

export class App {
  readonly scene = new THREE.Scene();
  readonly clock = new SimClock();
  readonly rig = new CameraRig();
  readonly input: Input;
  /** Stable objects: the dev panel binds to them, so values are copied in, never swapped. */
  readonly conditions: Conditions = cloneConditions(DEFAULT_CONDITIONS);
  readonly spectrumParams: OceanSpectrumParams = { ...DEFAULT_SPECTRUM_PARAMS };
  readonly simParams: OceanSimParams = { ...DEFAULT_OCEAN_SIM };
  readonly waterParams: WaterOpticsParams = {
    ...DEFAULT_WATER_OPTICS,
    absorptionPerM: [...DEFAULT_WATER_OPTICS.absorptionPerM] as Rgb,
    backscatterPerM: [...DEFAULT_WATER_OPTICS.backscatterPerM] as Rgb,
  };
  readonly atmosphereParams: AtmosphereParams = { ...DEFAULT_ATMOSPHERE };
  readonly pictureParams: PictureParams = { ...DEFAULT_PICTURE };
  readonly sky = new Sky(this.atmosphereParams);
  readonly ocean = new OceanSimulation(this.simParams);
  readonly probe = new HeightProbe(this.ocean);
  readonly waterOptics = createWaterOpticsUniforms(this.waterParams);
  readonly oceanSurface: OceanSurface;
  readonly picture: PicturePipeline;
  private readonly perf: PerfOverlay;
  private readonly panel: DevPanel;
  private readonly sunDir = new THREE.Vector3();
  private lastMs = performance.now();
  private spectrumKey = '';
  private spectrumTimer: number | undefined;
  private screenshotRequested = false;
  private devUiVisible = true;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
    initial: Moment,
  ) {
    this.input = new Input(renderer.domElement);
    this.scene.add(this.sky.dome);
    this.oceanSurface = new OceanSurface(this.ocean, this.sky, this.waterOptics);
    this.scene.add(this.oceanSurface.mesh);
    this.picture = new PicturePipeline(renderer, this.scene, this.camera, this.pictureParams);
    this.perf = new PerfOverlay(renderer);
    this.panel = new DevPanel(
      { conditions: this.conditions, spectrum: this.spectrumParams, sim: this.simParams, water: this.waterParams, atmosphere: this.atmosphereParams, picture: this.pictureParams },
      {
        onConditions: () => this.onConditionsEdited(),
        onSpectrum: () => this.scheduleSpectrumRebuild(),
        onSim: () => this.ocean.setParams(this.simParams),
        onWater: () => updateWaterOpticsUniforms(this.waterOptics, this.waterParams),
        onAtmosphere: () => this.sky.setParams(this.atmosphereParams),
        onPicture: () => this.picture.setParams(this.pictureParams),
        onReferenceMoment: (name) => { location.hash = `#ref=${encodeURIComponent(name)}`; },
        onCopyLink: () => void this.copyLink(),
        onScreenshot: () => { this.screenshotRequested = true; },
        onTogglePause: () => { this.clock.paused = !this.clock.paused; },
      },
    );
    // three typings gap: onDeviceLost is assignable but not typed.
    (renderer as unknown as { onDeviceLost: (info: { message?: string }) => void }).onDeviceLost = (info) => this.onDeviceLost(info);
    this.applyMoment(initial);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('hashchange', this.onHashChange);
    this.onResize();
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  applyMoment(m: Moment): void {
    assignConditions(this.conditions, m.conditions);
    this.clock.setTime(m.simTime);
    this.clock.paused = m.paused;
    this.rig.setPose(m.camera, this.waterHeightAtCamera());
    this.rebuildSpectrumIfNeeded(true);
    this.panel.refresh();
  }

  currentMoment(): Moment {
    return { conditions: cloneConditions(this.conditions), camera: this.rig.getPose(), simTime: this.clock.simTime, paused: this.clock.paused };
  }

  /** Latest GPU-sampled water height under the lineup camera (holds while a readback is in flight). */
  protected waterHeightAtCamera(): number {
    return this.probe.heightAt(0) ?? 0;
  }

  private onConditionsEdited(): void {
    const clean = sanitizeConditions(this.conditions);
    if (JSON.stringify(clean) !== JSON.stringify(this.conditions)) {
      assignConditions(this.conditions, clean);
      this.panel.refresh();
    }
    this.scheduleSpectrumRebuild();
  }

  private scheduleSpectrumRebuild(): void {
    clearTimeout(this.spectrumTimer);
    this.spectrumTimer = window.setTimeout(() => this.rebuildSpectrumIfNeeded(false), SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  private rebuildSpectrumIfNeeded(force: boolean): void {
    const key = spectrumInputsKey(this.conditions, this.spectrumParams);
    if (!force && key === this.spectrumKey) return;
    this.spectrumKey = key;
    this.ocean.setConditions(this.conditions, this.spectrumParams);
  }

  private async copyLink(): Promise<void> {
    history.replaceState(null, '', encodeMoment(this.currentMoment()));
    try {
      await navigator.clipboard.writeText(location.href);
      this.perf.flash('Moment link copied');
    } catch {
      this.perf.flash('Moment link is in the address bar (clipboard unavailable)');
    }
  }

  private toggleDevUi(): void {
    this.devUiVisible = !this.devUiVisible;
    this.panel.setVisible(this.devUiVisible);
    this.perf.setVisible(this.devUiVisible);
  }

  private onDeviceLost(info: { message?: string }): void {
    const hash = encodeMoment(this.currentMoment());
    showOverlay('The GPU connection was lost', info?.message || 'The graphics device stopped responding.', [
      { label: 'Reload this moment', onClick: () => { location.hash = hash; location.reload(); } },
    ]);
  }

  private onHashChange = (): void => {
    const m = momentFromHash(location.hash);
    if (m) this.applyMoment(m);
  };

  private onResize = (): void => {
    const { width, height } = viewportSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private frame = (): void => {
    const now = performance.now();
    const realDt = clampFrameDt((now - this.lastMs) / 1000);
    this.lastMs = now;
    const simDt = this.clock.tick(realDt);

    handleHotkeys(this.input, {
      copyLink: () => void this.copyLink(),
      togglePause: () => { this.clock.paused = !this.clock.paused; },
      screenshot: () => { this.screenshotRequested = true; },
      toggleDevUi: () => this.toggleDevUi(),
    });
    this.rig.update(realDt, this.input, this.waterHeightAtCamera());

    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.sky.update(this.renderer, this.sunDir, this.camera.position.y);
    this.sky.followCamera(this.camera.position);

    this.ocean.update(this.renderer, this.clock.simTime, simDt);
    const probeXZ = this.rig.probeXZ;
    this.probe.setProbe(0, probeXZ.x, probeXZ.z);
    this.probe.update(this.renderer);
    this.oceanSurface.update(this.camera.position, this.ocean);

    this.picture.setSunElevation(sun.elevationDeg);
    this.picture.render();
    if (this.screenshotRequested) {
      this.screenshotRequested = false;
      captureScreenshot(this.renderer.domElement, screenshotFilename(this.conditions));
    }
    this.perf.update();
  };
}
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck`
Expected: all PASS; clean.

In the browser pane, check that:
1. The stats panel (FPS/CPU/GPU) and the adapter name are visible top-left. On the RTX laptop the adapter should read NVIDIA. If it reads Intel, the orange banner appears; screenshot it, report it and continue.
2. Dragging `time (h)` from 5 to 19 animates the sky and water smoothly **without hitches**, because time changes don't rebuild the spectrum.
3. Setting swell size to 6 ft rebuilds the sea after about 150 ms, with larger swell.
4. Typing a `c` into the date field does not toggle the camera, and an invalid date reverts on blur.
5. `P` pauses the water while the camera still moves; `L` shows "Moment link copied", and opening the copied URL in a new tab restores the exact view; `K` downloads `liquid-dreams-YYYY-MM-DD-HHMM.png`; `H` hides and shows the dev UI.
6. The reference dropdown jumps between moments.

`?selftest` still reports 11/11.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: add dev panel, perf readout, hotkeys, moment links and device-loss recovery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Phase 0 acceptance: performance, reference gallery, Andrew's review

**Files:**
- Modify (only if measurements require it): `src/ocean/polarGrid.ts` (`DEFAULT_POLAR_GRID.segments`), `src/render/createRenderer.ts` (pixel ratio cap), and default constants in `src/render/PicturePipeline.ts`, `src/ocean/waterOptics.ts` and `src/sky/atmosphereParams.ts` (tuning from Andrew's feedback)
- Modify: `README.md` (reference-moment list), `docs/superpowers/specs/2026-09-25-liquid-dreams-first-light-design.md` (status line)

This task has no new code design. It measures the result, shows it to Andrew and tunes it together.

- [ ] **Step 1: Full automated check**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS, typecheck clean, and `vite build` completes (warnings about chunk size are acceptable).
Open `?selftest`: `[selftest] SUMMARY 11/11 passed`.

- [ ] **Step 2: Measure performance**

Open the default moment at the browser's native resolution. Wait 10 s, then read the stats-gl GPU and FPS values for each of `#ref=morning-offshore`, `#ref=golden-hour` and `#ref=overview`. Record them in the task report together with the adapter name and the canvas size (`renderer.domElement.width`×`height`).

Budget: 60 fps and GPU ≤ 8 ms. If it's over budget, apply these levers in order and re-measure after each, stopping as soon as the budget is met:
1. In `createRenderer.ts`, cap the pixel ratio: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));`
2. In `polarGrid.ts`, reduce `DEFAULT_POLAR_GRID.segments` from 384 to 256, then re-run `npx vitest run src/ocean/polarGrid.test.ts`.

Commit any lever that was applied:

```bash
git add src
git commit -m "perf: meet the Phase 0 GPU budget (<describe lever and measured ms>)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Reference gallery**

Screenshot all nine reference moments in order (`pre-dawn`, `first-sun`, `morning-offshore`, `late-morning`, `noon-deep-blue`, `autumn-glass`, `golden-hour`, `sunset`, `overview`), with the dev UI hidden (`H`). Check each against its description in `src/dev/referenceMoments.ts`, and list anything that looks wrong (NaN or black pixels, fireflies, tiling, seams, banding, an implausible colour).

- [ ] **Step 4: Andrew's review. STOP here and hand over.**

Present the gallery and the performance numbers to Andrew. Ask Andrew to open `http://localhost:5173/` in their own Chrome or Edge and sit in the lineup for a few minutes, comparing it with their memory and the photos in `reference/`. Collect Andrew's notes (for example "water too dark", "haze too strong", "glitter too sharp").

For each note, change the matching default constant (see the Files list), show the before and after screenshots of the affected moment, and commit each round:

```bash
git add src
git commit -m "tune: <what changed> after Andrew's review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Phase 0 is done when Andrew says the reference moments look right, the performance budget is met and all checks pass.

- [ ] **Step 5: Close out Phase 0**

In `README.md`, add a "Reference moments" section listing the nine `#ref=` names with their one-line descriptions from `referenceMoments.ts`. In the spec, change `**Status:** Draft for review` to `**Status:** Phase 0 complete (<date>)`.

```bash
git add README.md docs
git commit -m "docs: mark Phase 0 First Light complete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
