# The Surfer on the Stand: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both teenage surfers, their seasonal wardrobe, the three boards and every key pose (goofy and regular) standing
on a frozen Womb wave, lit by the real sky, posed from the dev panel.

**Architecture:**
- **Boards:** generated in TypeScript from shaper numbers.
- **Bodies:** built offline by Python scripts that drive Blender and MPFB (MakeHuman, CC0) in the background. They
  export committed `.glb` files and a bone manifest.
- **Poses:** pure TypeScript. A key pose gives board-frame targets; `solvePose` turns them into joint rotations (pelvis
  placement, spine share-out, two-bone IK, head look).
- **The stand:** `SurferStand` places the board on the water with four height probes, solves the pose, and applies it
  to the skinned mesh.

**Tech stack:** TypeScript, three 0.186.1 (`three/webgpu`, `three/tsl`, `three/addons` GLTFLoader), vitest, tweakpane,
Node 24 (runs `tools/*.ts` directly), Blender (current LTS) with the MPFB extension, Python in Blender.

**Spec:** `docs/superpowers/specs/2026-09-30-surfer-on-the-stand-design.md`

**Reference sources:** `docs/superpowers/plans/2026-09-30-surfer-on-the-stand/src/…` holds six modules written and
verified while planning:
- `boardSpec.ts` and `boardGeometry.ts`: all six boards give closed meshes, the stand-up boards' volumes land within
  0.93 L of their targets, and the boards are symmetric to 0.02 mm.
- `rig.ts`, `ik.ts`, `poses.ts` and `solvePose.ts`: a sweep of 155,520 solves (every pose × stance × body × board × dial
  extreme × phase × four board tilts up to 70°) put every ankle on its target (0.00 cm), bent no knee or elbow past 150°
  and no spine bone past 23°, and produced no NaN.

Steps that say "copy the reference source" mean copy it verbatim. Its imports are already in the repo's style.

## Global Constraints

- **Frames:**
  - Board frame: +x toward the nose, +y the deck's normal, +z the right rail (forward × up). The origin is on the stringer
    at mid-length, and y = 0 is the bottom at the wide point.
  - Character rest frame: +Y up, +Z the way the character faces, +X the character's left, feet on y = 0. glTF axes
    (x, y, z) = Blender (x, z, −y).
  - World: north = −z, east = +x (`lookDirection` in `src/camera/look.ts`).
- **The Womb is a left:** the wave face is on the board's left rail (`WAVE_SIDE = (0, 0, −1)`). Regular is backside,
  goofy frontside.
- **The skeleton contract:** exactly the 23 bones of `BONES` in `src/surfer/rig.ts`, with `PARENT` as given.
- **Wardrobe (Andrew's table, spec §4.3):**

  | Months | Male | Female |
  |---|---|---|
  | Dec–Mar | boardies | bikini |
  | Apr–Jun, Oct–Nov | springsuit | bikini bottoms + vest |
  | Jul–Sep | short-arm steamer | short-arm steamer |

  December is summer.
- **Board sizes (spec §5.1):**

  | Board | Female | Male |
  |---|---|---|
  | Thruster | 70 × 18.75 × 2.3125 in | 72 × 19.25 × 2.4375 in |
  | Step-up | 76 × 19 × 2.5 in | 80 × 19.5 × 2.625 in |
  | Bodyboard | 40 × 21 × 2.625 in | 42 × 21.5 × 2.625 in |

  Volumes are computed from the mesh; the tests check them against 26/29/30/34 L ± 1.5.
- **Budget:** body ≤ 24,000 triangles and ≤ 4 material slots. Each surfer ≤ 40,000 triangles in all. Surfer plus board ≤
  0.5 ms of GPU time at the chase camera's distance.
- **Licences:** every asset is CC0 (MakeHuman / MPFB output) or made by this project. `public/surfer/LICENSES.md` records
  each one.
- **Private material:** Andrew's reference photos go in `reference/surfer/`, which is git-ignored and never committed or
  published.
- **Tooling:**
  - `npm run dev` and `npm test` never need Blender; only `npm run build:surfers` does.
  - The `.glb` files are committed.
  - No new npm dependencies.
- **Commits:** one per task, on branch `surfer-on-the-stand` in the worktree `C:/Dev/andrew-dev-personal-projects/ld-surfer`.
  Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push until Andrew says so.
- **Stop gates:** Task 9 (the bodies) and Task 12 (the poses) wait for Andrew's sign-off by eye.

## Rulings made while planning (Andrew's to overturn)

1. **Hair strands are drawn by the shader** from each card's UVs, instead of a texture baked in Blender (spec §4.2).
   There are no texture files at all, so the licence is just as clean, and the look can be tuned live.
2. **Moment links keep `MOMENT_VERSION` 1** and gain an optional `surfer` field. Spec §6 asked for a version bump, but
   the parser rejects any other version, which would break every saved link. An older `#m=` link still opens with the
   surfer off, as the spec wants.
3. **The bikini top is a bandeau** around the chest: it reads right at the chase camera's distance and needs no straps.
4. **Placement:** spec §6's "lineup" and "on the wave" choices become one position (x, z, heading) plus a "Place ahead
   of camera" button, which covers both.
5. **Default stances:** the female preset defaults to regular and the male to goofy, so both sides of the Womb show out
   of the box. Either can be switched.
6. **The dials are offsets** around each pose's own values (−1 … 1, default 0), so every pose looks as designed with the
   sliders centred.
7. **The stand's reference moments** are added in Task 13, from placements found at gate 2.
8. **The wet-hair highlight** uses the shared Blinn–Phong sun highlight, not an anisotropic one (spec §4.4 allowed a
   simplified version).

## Review Focus

1. **The body files fail to load** (a 404, a stale build, the launcher offline). The app keeps running, the board still
   shows, one console warning appears, and the load isn't retried every frame. Pinned in Task 11
   (`surferLoader.test.ts`).
2. **The probe heights aren't ready** (the first frames after enabling the surfer, or after a moment jump invalidates
   the probe). The board sits at the tide's level and nothing becomes NaN. Pinned in Task 11 (`placement.test.ts`).
3. **Stored settings or links from another build, or hand-edited** (a pose that doesn't exist on the chosen board, an
   outfit from the other preset, strings where numbers go). They are repaired to valid values, never thrown on. Pinned in
   Task 3 (`surferParams.test.ts`) and Task 11 (`momentLink.test.ts`).
4. **Switching preset while a body is loading.** The stand shows only the preset asked for, never the stale one. Pinned
   in Task 11 (`surferLoader.test.ts`).
5. **A steep board** (pitched 70° on a face, rolled 60°). Feet stay planted and nothing becomes NaN. Pinned in Task 5
   (`solvePose.test.ts`).

---

### Task 1: Boards in numbers

**Files:**
- Create: `src/board/boardSpec.ts` (copy the reference source)
- Create: `src/board/boardGeometry.ts` (copy the reference source)
- Test: `src/board/boardGeometry.test.ts`

**Interfaces:**
- Produces:
  - `IN_M`
  - types `BoardKind`, `TailShape`, `FinSpec`, `BoardSpec`, `BoardDims`, `SpotName`, `Vec3Tuple`, `BoardLayout`
  - functions:
    - `makeBoard(kind, dims): BoardSpec`
    - `pchip(xs, ys, x)`
    - `uAt(spec, x)`
    - `halfWidthAt(spec, u)`
    - `rockerAt(spec, u)`
    - `thicknessAt(spec, u)`
    - `deckYAt(spec, x, z)`
    - `bottomYAt(spec, x, z)`
    - `layoutFor(spec, riderHeightM): BoardLayout`
  - From `boardGeometry.ts`:
    - `MeshArrays`, `PART`
    - `buildBoard(spec): MeshArrays`
    - `extrudePolygon(builder, pts, halfThick, part, place)`, `finOutline(baseM, depthM)`
    - `newBuilder()`, `finish(builder)`, type `Builder`
    - `vertexNormals`, `meshVolume(positions, indices)`, `openEdges(indices)`

- [ ] **Step 1: Write the failing test**

```ts
// src/board/boardGeometry.test.ts
import { describe, expect, it } from 'vitest';
import { type BoardDims, type BoardKind, bottomYAt, deckYAt, halfWidthAt, layoutFor, makeBoard, uAt } from './boardSpec';
import { PART, buildBoard, meshVolume, openEdges } from './boardGeometry';

const QUIVER: [string, BoardKind, BoardDims, number | null][] = [
  ['female thruster', 'thruster', { lengthIn: 70, widthIn: 18.75, thicknessIn: 2.3125 }, 26],
  ['male thruster', 'thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 }, 29],
  ['female step-up', 'stepUp', { lengthIn: 76, widthIn: 19, thicknessIn: 2.5 }, 30],
  ['male step-up', 'stepUp', { lengthIn: 80, widthIn: 19.5, thicknessIn: 2.625 }, 34],
  ['female bodyboard', 'bodyboard', { lengthIn: 40, widthIn: 21, thicknessIn: 2.625 }, null],
  ['male bodyboard', 'bodyboard', { lengthIn: 42, widthIn: 21.5, thicknessIn: 2.625 }, null],
];

describe.each(QUIVER)('%s', (_label, kind, dims, litres) => {
  const spec = makeBoard(kind, dims);
  const m = buildBoard(spec);
  const P = m.positions, n = P.length / 3;

  it('is closed and consistently wound (every edge shared by exactly two triangles)', () => {
    expect(openEdges(m.indices)).toBe(0);
  });

  it.runIf(litres !== null)(`holds ${litres} L ± 1.5 (spec §5.1), computed from the shape`, () => {
    expect(Math.abs(meshVolume(P, m.indices) * 1000 - litres!)).toBeLessThan(1.5);
  });

  it('is its shaper numbers: length and width within 5 mm', () => {
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < n; i++) if (m.part[i] !== PART.fin) { xs.push(P[i * 3]); zs.push(P[i * 3 + 2]); }
    expect(Math.abs(Math.max(...xs) - Math.min(...xs) - spec.lengthM)).toBeLessThan(0.005);
    expect(Math.abs(Math.max(...zs) - Math.min(...zs) - spec.maxWidthM)).toBeLessThan(0.005);
  });

  it('is left/right symmetric (every vertex has a mirror within 0.1 mm)', () => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let j = 0; j < n; j++) best = Math.min(best, Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] + P[j * 3 + 2]));
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('puts every spot and the leash plug on the deck, inside the outline', () => {
    const lay = layoutFor(spec, 1.7);
    for (const [x, y, z] of [...Object.values(lay.spots), lay.leashPlug]) {
      expect(Math.abs(x)).toBeLessThan(spec.lengthM / 2);
      expect(Math.abs(z)).toBeLessThan(halfWidthAt(spec, uAt(spec, x)));
      expect(y).toBeCloseTo(deckYAt(spec, x, z), 9);
      expect(y - bottomYAt(spec, x, z)).toBeGreaterThan(0.01);
    }
  });

  it('hangs its fins under the bottom, never through the deck', () => {
    let lowest = Infinity;
    for (let i = 0; i < n; i++) {
      if (m.part[i] !== PART.fin) continue;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      expect(y).toBeLessThan(deckYAt(spec, x, z));
      lowest = Math.min(lowest, y);
    }
    if (spec.fins.length) expect(lowest).toBeLessThan(bottomYAt(spec, -spec.lengthM / 2 + spec.fins[0].fromTailM, 0) - 0.1);
    else expect(lowest).toBe(Infinity);
  });
});

describe('stance', () => {
  it('puts the front foot 0.31 × the rider’s height ahead of the back foot, over the fins', () => {
    const spec = makeBoard('thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 });
    const lay = layoutFor(spec, 1.78);
    expect(lay.spots.front[0] - lay.spots.back[0]).toBeCloseTo(0.31 * 1.78, 9);
    expect(lay.spots.back[0]).toBeCloseTo(-spec.lengthM / 2 + 0.3, 9);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/board/boardGeometry.test.ts`
Expected: FAIL, "Failed to resolve import ./boardSpec".

- [ ] **Step 3: Copy the two reference sources**

Copy `docs/superpowers/plans/2026-09-30-surfer-on-the-stand/src/board/boardSpec.ts` → `src/board/boardSpec.ts` and
`…/src/board/boardGeometry.ts` → `src/board/boardGeometry.ts`, verbatim.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/board/boardGeometry.test.ts && npm run typecheck`
Expected: PASS (the two bodyboard volume tests skip: bodyboards are sold by length), and typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/board/boardSpec.ts src/board/boardGeometry.ts src/board/boardGeometry.test.ts
git commit -m "feat(board): the boards as shaper numbers: outline, rocker, foil, rails and fins, closed and to real volumes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The board on screen

**Files:**
- Create: `src/render/litSurface.ts`, `src/board/boardLook.ts`, `src/board/BoardMesh.ts`, `src/board/board.selftest.ts`
- Modify: `src/dev/selfTests.ts` (register the self-test)

**Interfaces:**
- Consumes: `buildBoard`, `PART`, `MeshArrays` (Task 1); `Sky` (`sunDirection`, `sunIlluminance`, `skyIrradiance`,
  `applyAerialPerspective`).
- Produces:
  - `litColor(sky, look: SurfaceLook, sunVisibility?) → node`
  - `interface SurfaceLook { albedo; normal; specular; shininess; wrap? }` (TSL nodes)
  - `type RGB = [number, number, number]`
  - `interface BoardLook { glass: RGB; deck: RGB; bottom: RGB; rail: RGB; railBand: number; padLengthM: number; shininess: number }`
  - `DEFAULT_BOARD_LOOKS: Record<BoardKind, BoardLook>`
  - `toGeometry(a: MeshArrays): THREE.BufferGeometry`
  - `class BoardMesh { mesh; setBoard(spec, look) }`

- [ ] **Step 1: Write `src/render/litSurface.ts`**

```ts
import { PI, cameraPosition, dot, float, length, max, normalize, positionWorld, pow, step } from 'three/tsl';
import type { Sky } from '../sky/Sky';

type N = any;

/** A lit, wet or glossy surface under the real sky (the rocks' lighting plus a sun highlight and a sky sheen). */
export interface SurfaceLook {
  albedo: N;
  normal: N;
  /** Reflectance at normal incidence (0.02–0.05 for skin, water films, resin and neoprene). */
  specular: N;
  /** Blinn–Phong exponent: higher is tighter and wetter. */
  shininess: N;
  /** Wrap lighting for soft, skin-like terminators (0 = none). */
  wrap?: N;
}

/** Light bounced up off the sea onto undersides (the sea's albedo). */
const SEA_BOUNCE = 0.06;

export function litColor(sky: Sky, look: SurfaceLook, sunVisibility?: (xz: N) => N): N {
  const n = normalize(look.normal);
  const l = sky.sunDirection;
  const up = step(0.0, l.y);
  const vis = sunVisibility ? sunVisibility(positionWorld.xz) : float(1.0);
  const wrap = look.wrap ?? float(0.0);
  const diffuse = max(dot(n, l).add(wrap).div(wrap.add(1.0)), 0.0);
  const sunE = sky.sunIlluminance.mul(vis).mul(diffuse).mul(up);
  const skyE = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5));
  const bounce = sky.sunIlluminance.mul(max(l.y, 0.0)).add(sky.skyIrradiance).mul(SEA_BOUNCE).mul(float(0.5).sub(n.y.mul(0.5)));
  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  const v = toCam.div(max(dist, 1e-3));
  const h = normalize(l.add(v));
  const fresnel = look.specular.add(float(1.0).sub(look.specular).mul(pow(float(1.0).sub(max(dot(n, v), 0.0)), 5.0)));
  const norm = look.shininess.add(2.0).div(8.0 * Math.PI);
  const sunSpec = sky.sunIlluminance.mul(vis).mul(up).mul(fresnel).mul(norm).mul(pow(max(dot(n, h), 0.0), look.shininess)).mul(max(dot(n, l), 0.0));
  const skySheen = sky.skyIrradiance.div(PI).mul(fresnel).mul(0.5);
  const color = look.albedo.mul(sunE.add(skyE).add(bounce)).div(PI).add(sunSpec).add(skySheen);
  return sky.applyAerialPerspective(color, dist, v.negate());
}
```

- [ ] **Step 2: Write `src/board/boardLook.ts`**

```ts
import type { BoardKind } from './boardSpec';

export type RGB = [number, number, number];

/** Linear-RGB albedos and finish (spec §4.5). */
export interface BoardLook {
  glass: RGB;
  deck: RGB;
  bottom: RGB;
  rail: RGB;
  /** 0–1: how strongly the rail colour bands the deck's edge (the step-up's tint). */
  railBand: number;
  /** The tail pad's length from the tail (m); 0 = none. */
  padLengthM: number;
  shininess: number;
}

const OLD_GLASS: RGB = [0.72, 0.68, 0.55];

export const DEFAULT_BOARD_LOOKS: Record<BoardKind, BoardLook> = {
  thruster: { glass: OLD_GLASS, deck: OLD_GLASS, bottom: OLD_GLASS, rail: OLD_GLASS, railBand: 0, padLengthM: 0.3, shininess: 90 },
  stepUp: { glass: OLD_GLASS, deck: OLD_GLASS, bottom: OLD_GLASS, rail: [0.1, 0.25, 0.32], railBand: 1, padLengthM: 0.3, shininess: 90 },
  bodyboard: { glass: [0.8, 0.82, 0.85], deck: [0.05, 0.22, 0.42], bottom: [0.8, 0.82, 0.85], rail: [0.04, 0.17, 0.33], railBand: 0, padLengthM: 0, shininess: 70 },
};
```

- [ ] **Step 3: Write `src/board/BoardMesh.ts`**

```ts
import * as THREE from 'three/webgpu';
import { abs, attribute, float, mix, mx_noise_float, normalWorld, positionWorld, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import { type MeshArrays, PART, buildBoard } from './boardGeometry';
import type { BoardLook } from './boardLook';
import type { BoardSpec } from './boardSpec';

type N = any;

export function toGeometry(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  g.setAttribute('boardUV', new THREE.BufferAttribute(a.boardUV, 2));
  g.setAttribute('part', new THREE.BufferAttribute(a.part, 1));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** One board (spec §4.5): glassed foam with wax haze and a tail pad, a tinted rail band, or a bodyboard's foam and slick. */
export class BoardMesh {
  readonly mesh: THREE.Mesh;
  private readonly u = {
    deck: uniform(new THREE.Color()), bottom: uniform(new THREE.Color()), rail: uniform(new THREE.Color()),
    railBand: uniform(0), padU: uniform(0), shininess: uniform(90),
  };
  private key = '';

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    const m = new THREE.MeshBasicNodeMaterial();
    const part: N = attribute('part', 'float');
    const buv: N = attribute('boardUV', 'vec2');
    const isDeck = step(PART.deck - 0.5, part).mul(float(1).sub(step(PART.deck + 0.5, part)));
    const isRail = step(PART.rail - 0.5, part).mul(float(1).sub(step(PART.rail + 0.5, part)));
    const isFin = step(PART.fin - 0.5, part);
    const haze = mx_noise_float(positionWorld.mul(14.0)).mul(0.5).add(0.5);
    let albedo: N = mix(this.u.bottom, this.u.deck, isDeck);
    albedo = mix(albedo, this.u.rail, isRail);
    albedo = mix(albedo, albedo.mul(0.9).add(0.05), isDeck.mul(haze).mul(0.6)); // wax
    albedo = mix(albedo, this.u.rail, isDeck.mul(smoothstep(0.8, 0.9, abs(buv.y))).mul(this.u.railBand));
    const pad = isDeck.mul(step(buv.x, this.u.padU)).mul(step(abs(buv.y), 0.8));
    albedo = mix(albedo, vec3(0.035, 0.035, 0.04), pad);
    albedo = mix(albedo, vec3(0.1, 0.1, 0.11), isFin);
    const shininess = mix(this.u.shininess, float(8.0), pad);
    m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular: float(0.04), shininess }, sunVisibility);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    this.mesh.frustumCulled = false;
  }

  /** Rebuilds the shape only when the spec changed; the look is uniforms. */
  setBoard(spec: BoardSpec, look: BoardLook): void {
    const key = JSON.stringify(spec);
    if (key !== this.key) {
      this.key = key;
      this.mesh.geometry.dispose();
      this.mesh.geometry = toGeometry(buildBoard(spec));
    }
    this.u.deck.value.setRGB(...look.deck);
    this.u.bottom.value.setRGB(...look.bottom);
    this.u.rail.value.setRGB(...look.rail);
    this.u.railBand.value = look.railBand;
    this.u.padU.value = look.padLengthM / spec.lengthM;
    this.u.shininess.value = look.shininess;
  }
}
```

- [ ] **Step 4: Write the self-test `src/board/board.selftest.ts`**

```ts
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
```

- [ ] **Step 5: Register it**

In `src/dev/selfTests.ts`, add `import '../board/board.selftest';` after `import '../bombie/bombie.selftest';`.

- [ ] **Step 6: Typecheck and run the self-test in the browser**

Run: `npm run typecheck`. Expected: clean.
Then start the dev server with preview_start (add a `.claude/launch.json` entry for this worktree if there is none, port
5173) and open `http://localhost:5173/?selftest=board`.
Expected: the overlay reads `GPU self-tests: 1/1 passed`, with each board over 150 px.

- [ ] **Step 7: Commit**

```bash
git add src/render/litSurface.ts src/board/boardLook.ts src/board/BoardMesh.ts src/board/board.selftest.ts src/dev/selfTests.ts
git commit -m "feat(board): the boards on screen, lit by the sky: glass, wax, tail pad, rail band, bodyboard slick

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Surfer settings: presets, wardrobe, params

**Files:**
- Create: `src/surfer/poseNames.ts`, `src/surfer/presets.ts`, `src/surfer/outfitMasks.json`, `src/surfer/wardrobe.ts`,
  `src/surfer/surferParams.ts`
- Test: `src/surfer/presets.test.ts`, `src/surfer/wardrobe.test.ts`, `src/surfer/surferParams.test.ts`

**Interfaces:**
- Consumes: `makeBoard`, `BoardKind`, `BoardDims`, `BoardSpec` (Task 1); `BoardLook`, `DEFAULT_BOARD_LOOKS`, `RGB`
  (Task 2).
- Produces:
  - From `poseNames.ts`: `type PoseName`, `STAND_POSES`, `BODYBOARD_POSES`, `ALL_POSES`, `posesFor(kind)`.
  - From `presets.ts`:
    - types `PresetName = 'female' | 'male'`, `Stance = 'regular' | 'goofy'`,
      `Outfit = 'boardies' | 'bikini' | 'springsuit' | 'vestAndBottoms' | 'shortArmSteamer'`
    - `interface SurferPreset`, `PRESETS`
    - `boardFor(preset, kind): BoardSpec`, `boardLookFor(preset, kind): BoardLook`
  - From `wardrobe.ts`:
    - `type Season`, `type OutfitChoice = 'season' | Outfit`, `interface OutfitMasks`
    - `seasonOf(dateISO)`, `presetOutfits(preset)`, `outfitFor(preset, choice, dateISO)`, `outfitMasks(outfit)`
    - `OUTFIT_LABELS`
  - From `surferParams.ts`: `interface SurferParams`, `DEFAULT_SURFER_PARAMS`, `SURFER_PARAM_RANGES`,
    `normalizeSurferParams(p)`, `sanitizeSurferParams(raw: unknown): SurferParams`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/surfer/wardrobe.test.ts
import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { OUTFIT_LABELS, outfitFor, outfitMasks, presetOutfits, seasonOf } from './wardrobe';

describe('wardrobe (Andrew’s months, spec §4.3)', () => {
  it.each([
    ['2026-12-01', 'summer'], ['2026-01-15', 'summer'], ['2026-03-31', 'summer'],
    ['2026-04-01', 'shoulder'], ['2026-06-30', 'shoulder'],
    ['2026-07-01', 'winter'], ['2026-09-30', 'winter'],
    ['2026-10-01', 'shoulder'], ['2026-11-30', 'shoulder'],
  ])('%s is %s', (date, season) => expect(seasonOf(date)).toBe(season));

  it('dresses each surfer for the season', () => {
    expect(['2026-02-01', '2026-05-01', '2026-08-01', '2026-10-15'].map((d) => outfitFor(PRESETS.male, 'season', d)))
      .toEqual(['boardies', 'springsuit', 'shortArmSteamer', 'springsuit']);
    expect(['2026-02-01', '2026-05-01', '2026-08-01', '2026-10-15'].map((d) => outfitFor(PRESETS.female, 'season', d)))
      .toEqual(['bikini', 'vestAndBottoms', 'shortArmSteamer', 'vestAndBottoms']);
  });

  it('lets the override win, but only with one of that surfer’s own outfits', () => {
    expect(outfitFor(PRESETS.male, 'shortArmSteamer', '2026-02-01')).toBe('shortArmSteamer');
    expect(outfitFor(PRESETS.male, 'bikini', '2026-02-01')).toBe('boardies');
    expect(presetOutfits(PRESETS.female).sort()).toEqual(['bikini', 'shortArmSteamer', 'vestAndBottoms']);
  });

  it('falls back to winter for a date it can’t read', () => expect(seasonOf('nonsense')).toBe('winter'));

  it('covers the right body regions for each outfit', () => {
    expect(outfitMasks('bikini')).toEqual({ spring: 0, steamer: 0, vest: 0, bottoms: 1, top: 1, boardies: 0 });
    expect(outfitMasks('vestAndBottoms')).toEqual({ spring: 0, steamer: 0, vest: 1, bottoms: 1, top: 0, boardies: 0 });
    expect(outfitMasks('boardies').boardies).toBe(1);
    for (const o of Object.keys(OUTFIT_LABELS) as (keyof typeof OUTFIT_LABELS)[]) expect(Object.values(outfitMasks(o)).some((v) => v === 1)).toBe(true);
  });
});
```

```ts
// src/surfer/presets.test.ts
import { describe, expect, it } from 'vitest';
import { makeBoard } from '../board/boardSpec';
import { PRESETS, boardFor, boardLookFor } from './presets';

describe('presets (spec §4.1, §5.1)', () => {
  it('are two late-teen surfers of the planned heights, one regular and one goofy by default', () => {
    expect([PRESETS.female.heightM, PRESETS.male.heightM]).toEqual([1.65, 1.78]);
    expect(new Set([PRESETS.female.defaultStance, PRESETS.male.defaultStance])).toEqual(new Set(['regular', 'goofy']));
  });
  it('carry the planned quivers', () => {
    expect(boardFor(PRESETS.male, 'thruster')).toEqual(makeBoard('thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 }));
    expect(boardFor(PRESETS.female, 'stepUp').lengthM).toBeCloseTo(76 * 0.0254, 9);
    expect(boardFor(PRESETS.female, 'bodyboard').lengthM).toBeCloseTo(40 * 0.0254, 9);
  });
  it('merge a preset’s board colours over the defaults', () => {
    expect(boardLookFor(PRESETS.female, 'bodyboard').deck).toEqual(PRESETS.female.boardLooks.bodyboard!.deck);
    expect(boardLookFor(PRESETS.female, 'thruster').padLengthM).toBe(0.3);
  });
});
```

```ts
// src/surfer/surferParams.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFER_PARAMS, SURFER_PARAM_RANGES, normalizeSurferParams, sanitizeSurferParams } from './surferParams';

describe('surfer params', () => {
  it('start off, on the female surfer sitting on the thruster in the lineup', () => {
    expect(DEFAULT_SURFER_PARAMS).toMatchObject({ enabled: false, preset: 'female', board: 'thruster', pose: 'sit', outfit: 'season', x: -25, z: 45 });
  });
  it('repair a pose that doesn’t exist on the board, and an outfit from the other preset (Review Focus 3)', () => {
    const p = { ...DEFAULT_SURFER_PARAMS, board: 'thruster' as const, pose: 'dropKnee' as const, preset: 'male' as const, outfit: 'bikini' as const };
    normalizeSurferParams(p);
    expect(p.pose).toBe('sit');
    expect(p.outfit).toBe('season');
  });
  it('clamp numbers, wrap the heading, and replace junk (Review Focus 3)', () => {
    const p = sanitizeSurferParams({ enabled: 'yes', preset: 'ghost', compression: 9, lean: Number.NaN, headingDeg: -90, x: 'far', balance: 0, extra: 1 });
    expect(p.enabled).toBe(false);
    expect(p.preset).toBe('female');
    expect(p.compression).toBe(SURFER_PARAM_RANGES.compression.max);
    expect(p.lean).toBe(0);
    expect(p.headingDeg).toBe(270);
    expect(p.x).toBe(DEFAULT_SURFER_PARAMS.x);
    expect(p.balance).toBe(true);
    expect('extra' in p).toBe(false);
  });
  it('turn anything that isn’t an object into the defaults', () => {
    expect(sanitizeSurferParams(null)).toEqual(DEFAULT_SURFER_PARAMS);
    expect(sanitizeSurferParams([1, 2])).toEqual(DEFAULT_SURFER_PARAMS);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/surfer`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Write `src/surfer/poseNames.ts`**

```ts
import type { BoardKind } from '../board/boardSpec';

export type PoseName = 'sit' | 'paddle' | 'popup' | 'drop' | 'bottomTurn' | 'trim' | 'barrel' | 'kickout' | 'bail' | 'prone' | 'proneBarrel' | 'dropKnee';

/** Key poses (spec §3.5): the stand-up boards', then the bodyboard's. */
export const STAND_POSES: readonly PoseName[] = ['sit', 'paddle', 'popup', 'drop', 'bottomTurn', 'trim', 'barrel', 'kickout', 'bail'];
export const BODYBOARD_POSES: readonly PoseName[] = ['sit', 'paddle', 'prone', 'proneBarrel', 'dropKnee', 'bail'];
export const ALL_POSES: readonly PoseName[] = [...new Set([...STAND_POSES, ...BODYBOARD_POSES])];

export const posesFor = (kind: BoardKind): readonly PoseName[] => (kind === 'bodyboard' ? BODYBOARD_POSES : STAND_POSES);
```

- [ ] **Step 4: Write `src/surfer/presets.ts`**

```ts
import { type BoardLook, DEFAULT_BOARD_LOOKS, type RGB } from '../board/boardLook';
import { type BoardDims, type BoardKind, type BoardSpec, makeBoard } from '../board/boardSpec';

export type PresetName = 'female' | 'male';
export type Stance = 'regular' | 'goofy';
export type Outfit = 'boardies' | 'bikini' | 'springsuit' | 'vestAndBottoms' | 'shortArmSteamer';

/** One of the two surfers (spec §1, §4): the build numbers live in tools/surfer/presets/<name>.json. */
export interface SurferPreset {
  name: PresetName;
  label: string;
  heightM: number;
  weightKg: number;
  defaultStance: Stance;
  /** Relative to the site's base URL (public/). */
  glbUrl: string;
  manifestUrl: string;
  outfits: { summer: Outfit; shoulder: Outfit; winter: Outfit };
  quiver: Record<BoardKind, BoardDims>;
  /** Linear-RGB albedos. */
  skin: RGB;
  /** 0–1: how much darker the sun has made the skin. */
  tan: number;
  hairRoot: RGB;
  hairTip: RGB;
  fabric: RGB;
  neopreneAccent: RGB;
  boardies: RGB;
  boardLooks: Partial<Record<BoardKind, Partial<BoardLook>>>;
}

export const PRESETS: Record<PresetName, SurferPreset> = {
  female: {
    name: 'female', label: 'Female', heightM: 1.65, weightKg: 55, defaultStance: 'regular',
    glbUrl: 'surfer/female.glb', manifestUrl: 'surfer/female.manifest.json',
    outfits: { summer: 'bikini', shoulder: 'vestAndBottoms', winter: 'shortArmSteamer' },
    quiver: {
      thruster: { lengthIn: 70, widthIn: 18.75, thicknessIn: 2.3125 },
      stepUp: { lengthIn: 76, widthIn: 19, thicknessIn: 2.5 },
      bodyboard: { lengthIn: 40, widthIn: 21, thicknessIn: 2.625 },
    },
    skin: [0.52, 0.34, 0.24], tan: 0.35, hairRoot: [0.16, 0.1, 0.05], hairTip: [0.62, 0.5, 0.32],
    fabric: [0.55, 0.12, 0.1], neopreneAccent: [0.1, 0.35, 0.45], boardies: [0.1, 0.2, 0.4],
    boardLooks: { bodyboard: { deck: [0.05, 0.25, 0.45], rail: [0.04, 0.19, 0.35] } },
  },
  male: {
    name: 'male', label: 'Male', heightM: 1.78, weightKg: 68, defaultStance: 'goofy',
    glbUrl: 'surfer/male.glb', manifestUrl: 'surfer/male.manifest.json',
    outfits: { summer: 'boardies', shoulder: 'springsuit', winter: 'shortArmSteamer' },
    quiver: {
      thruster: { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 },
      stepUp: { lengthIn: 80, widthIn: 19.5, thicknessIn: 2.625 },
      bodyboard: { lengthIn: 42, widthIn: 21.5, thicknessIn: 2.625 },
    },
    skin: [0.46, 0.3, 0.2], tan: 0.45, hairRoot: [0.12, 0.08, 0.04], hairTip: [0.55, 0.43, 0.27],
    fabric: [0.1, 0.1, 0.12], neopreneAccent: [0.45, 0.2, 0.05], boardies: [0.08, 0.28, 0.3],
    boardLooks: { bodyboard: { deck: [0.35, 0.05, 0.05], rail: [0.25, 0.04, 0.04] } },
  },
};

export const boardFor = (p: SurferPreset, kind: BoardKind): BoardSpec => makeBoard(kind, p.quiver[kind]);
export const boardLookFor = (p: SurferPreset, kind: BoardKind): BoardLook => ({ ...DEFAULT_BOARD_LOOKS[kind], ...p.boardLooks[kind] });
```

- [ ] **Step 5: Write `src/surfer/outfitMasks.json`**

This is the one table of which baked body masks each outfit shows. `tools/surfer/wardrobe.py` reads the same file.

```json
{
  "boardies": { "spring": 0, "steamer": 0, "vest": 0, "bottoms": 0, "top": 0, "boardies": 1 },
  "bikini": { "spring": 0, "steamer": 0, "vest": 0, "bottoms": 1, "top": 1, "boardies": 0 },
  "springsuit": { "spring": 1, "steamer": 0, "vest": 0, "bottoms": 0, "top": 0, "boardies": 0 },
  "vestAndBottoms": { "spring": 0, "steamer": 0, "vest": 1, "bottoms": 1, "top": 0, "boardies": 0 },
  "shortArmSteamer": { "spring": 0, "steamer": 1, "vest": 0, "bottoms": 0, "top": 0, "boardies": 0 }
}
```

- [ ] **Step 6: Write `src/surfer/wardrobe.ts`**

```ts
import MASKS from './outfitMasks.json';
import type { Outfit, SurferPreset } from './presets';

export type Season = 'summer' | 'shoulder' | 'winter';
export type OutfitChoice = 'season' | Outfit;

/** Andrew’s months (spec §4.3), January first: Dec–Mar summer, Apr–Jun and Oct–Nov shoulder, Jul–Sep winter. */
const SEASON_BY_MONTH: readonly Season[] = ['summer', 'summer', 'summer', 'shoulder', 'shoulder', 'shoulder', 'winter', 'winter', 'winter', 'shoulder', 'shoulder', 'summer'];

export function seasonOf(dateISO: string): Season {
  const m = Number(dateISO.slice(5, 7));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? SEASON_BY_MONTH[m - 1] : 'winter';
}

export const presetOutfits = (p: SurferPreset): Outfit[] => [...new Set(Object.values(p.outfits))];

export function outfitFor(p: SurferPreset, choice: OutfitChoice, dateISO: string): Outfit {
  return choice !== 'season' && presetOutfits(p).includes(choice) ? choice : p.outfits[seasonOf(dateISO)];
}

export const OUTFIT_LABELS: Record<Outfit, string> = {
  boardies: 'boardies', bikini: 'bikini', springsuit: 'springsuit', vestAndBottoms: 'bikini bottoms + vest', shortArmSteamer: 'short-arm steamer',
};

/** 0/1 weights of the baked body masks (spec §4.3; tools/surfer/wardrobe.py bakes them into uv1–uv3). */
export interface OutfitMasks {
  spring: number;
  steamer: number;
  vest: number;
  bottoms: number;
  top: number;
  boardies: number;
}

export const outfitMasks = (o: Outfit): OutfitMasks => ({ ...(MASKS as Record<Outfit, OutfitMasks>)[o] });
```

- [ ] **Step 7: Write `src/surfer/surferParams.ts`**

```ts
import type { BoardKind } from '../board/boardSpec';
import { type PoseName, posesFor } from './poseNames';
import { PRESETS, type PresetName, type Stance } from './presets';
import { type OutfitChoice, presetOutfits } from './wardrobe';

/** The Surfer folder (spec §6), persisted with the look and carried by moment links. */
export interface SurferParams {
  enabled: boolean;
  preset: PresetName;
  stance: Stance;
  board: BoardKind;
  outfit: OutfitChoice;
  pose: PoseName;
  /** 0–1 through a cycle or the pop-up's beats. */
  phaseT: number;
  /** The four dials, as offsets around the pose's own values (spec §3.5). */
  compression: number;
  lean: number;
  twist: number;
  reach: number;
  balance: boolean;
  balanceAmount: number;
  /** Where the board sits (world metres) and which way its nose points (compass degrees). */
  x: number;
  z: number;
  headingDeg: number;
  heightNudgeM: number;
  pitchNudgeDeg: number;
}

/** In the lineup where Andrew waits (DEFAULT_LINEUP_POSITION), nose out to sea toward the south-west swell. */
export const DEFAULT_SURFER_PARAMS: Readonly<SurferParams> = {
  enabled: false, preset: 'female', stance: 'regular', board: 'thruster', outfit: 'season', pose: 'sit', phaseT: 0,
  compression: 0, lean: 0, twist: 0, reach: 0, balance: true, balanceAmount: 1,
  x: -25, z: 45, headingDeg: 225, heightNudgeM: 0, pitchNudgeDeg: 0,
};

export const SURFER_PARAM_RANGES = {
  phaseT: { min: 0, max: 1 },
  compression: { min: -1, max: 1 },
  lean: { min: -1, max: 1 },
  twist: { min: -1, max: 1 },
  reach: { min: -1, max: 1 },
  balanceAmount: { min: 0, max: 2 },
  x: { min: -400, max: 400 },
  z: { min: -400, max: 400 },
  heightNudgeM: { min: -3, max: 3 },
  pitchNudgeDeg: { min: -45, max: 45 },
} as const;

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

export function normalizeSurferParams(p: SurferParams): void {
  const d = DEFAULT_SURFER_PARAMS;
  p.enabled = p.enabled === true;
  p.balance = p.balance !== false;
  p.preset = oneOf(p.preset, ['female', 'male'] as const, d.preset);
  p.stance = oneOf(p.stance, ['regular', 'goofy'] as const, d.stance);
  p.board = oneOf(p.board, ['thruster', 'stepUp', 'bodyboard'] as const, d.board);
  p.pose = oneOf(p.pose, posesFor(p.board), 'sit');
  p.outfit = oneOf(p.outfit, ['season', ...presetOutfits(PRESETS[p.preset])] as const, 'season');
  for (const k of Object.keys(SURFER_PARAM_RANGES) as (keyof typeof SURFER_PARAM_RANGES)[]) {
    const r = SURFER_PARAM_RANGES[k], v = p[k];
    p[k] = typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : d[k];
  }
  p.headingDeg = typeof p.headingDeg === 'number' && Number.isFinite(p.headingDeg) ? ((p.headingDeg % 360) + 360) % 360 : d.headingDeg;
}

/** Surfer params from untrusted input (links, stored settings): known keys only, then normalised. */
export function sanitizeSurferParams(raw: unknown): SurferParams {
  const p = { ...DEFAULT_SURFER_PARAMS } as SurferParams;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const src = raw as Record<string, unknown>;
    for (const k of Object.keys(p) as (keyof SurferParams)[]) if (k in src) (p as unknown as Record<string, unknown>)[k] = src[k];
  }
  normalizeSurferParams(p);
  return p;
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run src/surfer && npm run typecheck`
Expected: PASS; typecheck clean (`resolveJsonModule` is already on).

- [ ] **Step 9: Commit**

```bash
git add src/surfer/poseNames.ts src/surfer/presets.ts src/surfer/outfitMasks.json src/surfer/wardrobe.ts src/surfer/surferParams.ts src/surfer/*.test.ts
git commit -m "feat(surfer): the two presets, Andrew's wardrobe months, and the Surfer folder's params

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The skeleton contract and IK

**Files:**
- Create: `src/surfer/rig.ts`, `src/surfer/ik.ts` (copy the reference sources)
- Test: `src/surfer/ik.test.ts`, `src/surfer/rig.test.ts`

**Interfaces:**
- Produces:
  - From `rig.ts`:
    - `BONES`, `type BoneName`, `type Limb = 'l' | 'r'`, `PARENT`, `LIMITS`
    - `interface SkeletonRest { heightM; joint; restQ }`
    - `referenceSkeleton(heightM)`
    - `interface RiderMeasures`, `measures(rest)`
  - From `ik.ts`:
    - `minReach(l1, l2, maxFlexDeg)`, `anyPerpendicular(v)`, `basisQ(primary, secondary)`
    - `aimRotation(d0, s0, d, s)`
    - `twoBoneIK(root, target, l1, l2, pole, maxFlexDeg): { mid, end, reached }`
    - `flexDeg(root, mid, end)`

- [ ] **Step 1: Write the failing tests**

```ts
// src/surfer/ik.test.ts
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { aimRotation, flexDeg, minReach, twoBoneIK } from './ik';

const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

describe('two-bone IK', () => {
  it('reaches a target within reach exactly, keeps both lengths, and bends toward the pole', () => {
    const root = v(0, 1, 0), target = v(0.1, 0.3, 0.2), pole = v(0, 0, 1);
    const r = twoBoneIK(root, target, 0.45, 0.42, pole, 150);
    expect(r.reached).toBe(true);
    expect(r.end.distanceTo(target)).toBeLessThan(1e-9);
    expect(r.mid.distanceTo(root)).toBeCloseTo(0.45, 9);
    expect(r.mid.distanceTo(r.end)).toBeCloseTo(0.42, 9);
    const along = target.clone().sub(root).normalize();
    const off = r.mid.clone().sub(root).sub(along.multiplyScalar(r.mid.clone().sub(root).dot(along)));
    expect(off.dot(pole)).toBeGreaterThan(0);
  });
  it('clamps an out-of-reach target onto the line toward it without flipping', () => {
    const r = twoBoneIK(v(0, 0, 0), v(0, -5, 0), 0.45, 0.42, v(0, 0, 1), 150);
    expect(r.reached).toBe(false);
    expect(r.end.x).toBeCloseTo(0, 9);
    expect(r.end.length()).toBeLessThanOrEqual(0.87);
    expect(r.mid.z).toBeGreaterThanOrEqual(0);
  });
  it('never folds past the flex limit, and survives a pole along the limb', () => {
    const r = twoBoneIK(v(0, 0, 0), v(0, -0.01, 0), 0.45, 0.42, v(0, -1, 0), 150);
    expect(flexDeg(v(0, 0, 0), r.mid, r.end)).toBeLessThanOrEqual(150 + 1e-6);
    expect([r.mid.x, r.mid.y, r.mid.z].every(Number.isFinite)).toBe(true);
    expect(r.end.length()).toBeCloseTo(minReach(0.45, 0.42, 150), 6);
  });
});

describe('aimRotation', () => {
  it('turns the rest direction onto the new one and the rest secondary toward the new secondary', () => {
    const q = aimRotation(v(0, -1, 0), v(0, 0, 1), v(1, 0, 0), v(0, 1, 0));
    expect(v(0, -1, 0).applyQuaternion(q).distanceTo(v(1, 0, 0))).toBeLessThan(1e-9);
    expect(v(0, 0, 1).applyQuaternion(q).distanceTo(v(0, 1, 0))).toBeLessThan(1e-9);
  });
});
```

```ts
// src/surfer/rig.test.ts
import { describe, expect, it } from 'vitest';
import { BONES, PARENT, measures, referenceSkeleton } from './rig';

describe('the skeleton contract (spec §3.3)', () => {
  it('has 23 bones, each parent listed before its children', () => {
    expect(BONES.length).toBe(23);
    BONES.forEach((b, i) => {
      const p = PARENT[b];
      if (p) expect(BONES.indexOf(p)).toBeLessThan(i);
    });
  });
  it('scales the reference skeleton to the rider: legs about 0.49 H, stance joints where expected', () => {
    const m = measures(referenceSkeleton(1.78));
    expect(m.legLen / 1.78).toBeGreaterThan(0.47);
    expect(m.legLen / 1.78).toBeLessThan(0.51);
    expect(m.hipDrop).toBeGreaterThan(0);
    expect(m.ankleH).toBeCloseTo(0.039 * 1.78, 9);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/surfer/ik.test.ts src/surfer/rig.test.ts`. Expected: FAIL, unresolved imports.

- [ ] **Step 3: Copy the reference sources**

Copy `…/src/surfer/rig.ts` → `src/surfer/rig.ts` and `…/src/surfer/ik.ts` → `src/surfer/ik.ts`, verbatim.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/surfer && npm run typecheck`. Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/surfer/rig.ts src/surfer/ik.ts src/surfer/ik.test.ts src/surfer/rig.test.ts
git commit -m "feat(surfer): the skeleton contract, a reference skeleton, and two-bone IK

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The key poses and the solver

**Files:**
- Create: `src/surfer/poses.ts`, `src/surfer/solvePose.ts` (copy the reference sources), `src/surfer/rideState.ts`
- Test: `src/surfer/solvePose.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3 and 4.
- Produces:
  - From `poses.ts`:
    - types `PoseDials`, `Side`, `FootTarget`, `HandTarget`, `PoseTargets`, `PoseContext`
    - `WAVE_SIDE`, `sideOf(stance)`
    - `poseTargets(pose, ctx): PoseTargets`
  - From `solvePose.ts`:
    - `interface BoardFrame { position; forward; up }`
    - `interface SolvedPose { pelvisWorld; joint; world; local }`
    - `boardQuaternion(frame)`
    - `solvePose(rest, targets, frame, lookAt | null): SolvedPose`
  - From `rideState.ts`: `type Zone`, `type Phase`, `interface RideState`, `POSE_PHASE`, `POSE_ZONE`.

- [ ] **Step 1: Write the failing test**

```ts
// src/surfer/solvePose.test.ts
import { Euler, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { type BoardKind, layoutFor, makeBoard } from '../board/boardSpec';
import { flexDeg } from './ik';
import { posesFor } from './poseNames';
import { type PoseDials, poseTargets, sideOf } from './poses';
import { PRESETS, type Stance } from './presets';
import { BONES, LIMITS, PARENT, type SkeletonRest, referenceSkeleton } from './rig';
import { POSE_PHASE, POSE_ZONE } from './rideState';
import { type BoardFrame, boardQuaternion, solvePose } from './solvePose';

const frame = (e: Euler, p = new Vector3(3, 1, -2)): BoardFrame => {
  const q = new Quaternion().setFromEuler(e);
  return { position: p, forward: new Vector3(1, 0, 0).applyQuaternion(q), up: new Vector3(0, 1, 0).applyQuaternion(q) };
};
/** Flat; tilted every way; pitched 70° nose-up; rolled 60° (Review Focus 5). */
const FRAMES = [frame(new Euler(0, 0, 0), new Vector3()), frame(new Euler(0.3, 1.1, -0.5)), frame(new Euler(0, 0, 1.22)), frame(new Euler(1.05, 0.4, 0))];
const LEVELS = [-1, 0, 1];
const PHASES = [0, 0.25, 0.5, 0.75, 1];
const RESTS = [referenceSkeleton(PRESETS.female.heightM), referenceSkeleton(PRESETS.male.heightM)];
const KINDS: BoardKind[] = ['thruster', 'stepUp', 'bodyboard'];

describe.each(KINDS)('every %s pose, both stances, both bodies, every dial extreme, every tilt', (kind) => {
  for (const pose of posesFor(kind)) {
    it(pose, () => {
      let ankle = 0, knee = 0, elbow = 0, spine = 0, head = 0, poleSide = Infinity, bad = 0;
      for (const rest of RESTS) {
        const spec = makeBoard(kind, PRESETS[rest.heightM < 1.7 ? 'female' : 'male'].quiver[kind]);
        const layout = layoutFor(spec, rest.heightM);
        for (const stance of ['regular', 'goofy'] as Stance[])
          for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) for (const r of LEVELS)
            for (const phaseT of PHASES)
              for (const fr of FRAMES) {
                const dials: PoseDials = { compression: c, lean: l, twist: tw, reach: r };
                const t = poseTargets(pose, { spec, layout, rest, stance, dials, phaseT });
                const Qb = boardQuaternion(fr);
                const s = solvePose(rest, t, fr, fr.position.clone().add(t.look.clone().applyQuaternion(Qb).multiplyScalar(10)));
                for (const side of ['l', 'r'] as const) {
                  const target = t.feet[side].ankle.clone().applyQuaternion(Qb).add(fr.position);
                  ankle = Math.max(ankle, s.joint[`foot_${side}`].distanceTo(target));
                  const H = s.joint[`thigh_${side}`], K = s.joint[`shin_${side}`], A = s.joint[`foot_${side}`];
                  knee = Math.max(knee, flexDeg(H, K, A));
                  elbow = Math.max(elbow, flexDeg(s.joint[`upperarm_${side}`], s.joint[`forearm_${side}`], s.joint[`hand_${side}`]));
                  const along = A.clone().sub(H).normalize(), off = K.clone().sub(H);
                  off.sub(along.clone().multiplyScalar(off.dot(along)));
                  const pole = t.feet[side].pole.clone().applyQuaternion(Qb);
                  if (flexDeg(H, K, A) > 5) poleSide = Math.min(poleSide, off.dot(pole.sub(along.multiplyScalar(pole.dot(along)))));
                }
                for (const b of ['spine_01', 'spine_02', 'spine_03'] as const) spine = Math.max(spine, (2 * Math.acos(Math.min(1, Math.abs(s.local[b].w))) * 180) / Math.PI);
                const headFwd = new Vector3(0, 0, 1).applyQuaternion(s.world.head).applyQuaternion(s.world.spine_03.clone().invert());
                head = Math.max(head, Math.abs((Math.atan2(headFwd.x, headFwd.z) * 180) / Math.PI));
                for (const b of BONES) if (![s.local[b].x, s.local[b].y, s.local[b].z, s.local[b].w].every(Number.isFinite)) bad++;
              }
      }
      expect(bad, 'non-finite rotations').toBe(0);
      expect(ankle, 'worst ankle miss (m)').toBeLessThan(0.01);
      expect(knee, 'worst knee flex (°)').toBeLessThanOrEqual(LIMITS.kneeMaxDeg + 0.5);
      expect(elbow, 'worst elbow flex (°)').toBeLessThanOrEqual(LIMITS.elbowMaxDeg + 0.5);
      expect(spine, 'worst spine bone (°)').toBeLessThanOrEqual(LIMITS.spineBoneMaxDeg + 0.5);
      expect(head, 'worst head yaw (°)').toBeLessThanOrEqual(LIMITS.headYawMaxDeg + 0.5);
      expect(poleSide, 'a knee bent away from its pole').toBeGreaterThan(-1e-9);
    });
  }
});

describe('stance', () => {
  const rest = referenceSkeleton(1.78), spec = makeBoard('thruster', PRESETS.male.quiver.thruster), layout = layoutFor(spec, 1.78);
  const dials = { compression: 0, lean: 0, twist: 0, reach: 0 };
  it('puts the left foot forward for regular and the right for goofy', () => {
    const reg = poseTargets('trim', { spec, layout, rest, stance: 'regular', dials, phaseT: 0 });
    const goofy = poseTargets('trim', { spec, layout, rest, stance: 'goofy', dials, phaseT: 0 });
    expect(reg.feet.l.ankle.x).toBeGreaterThan(reg.feet.r.ankle.x);
    expect(goofy.feet.r.ankle.x).toBeGreaterThan(goofy.feet.l.ankle.x);
  });
  it('rides the Womb backside regular and frontside goofy', () => {
    expect(sideOf('regular')).toBe('backside');
    expect(sideOf('goofy')).toBe('frontside');
  });
});

describe('the rotations drive a real hierarchy (what Surfer.applyPose relies on)', () => {
  it('rebuilds every joint from the local rotations, even when the rest bones are rotated', () => {
    const ref = referenceSkeleton(1.65);
    const q = (i: number): Quaternion => new Quaternion().setFromEuler(new Euler(0.3 * i, -0.2 * i, 0.1 * i));
    const rest: SkeletonRest = { ...ref, restQ: Object.fromEntries(BONES.map((b, i) => [b, q(i)])) as SkeletonRest['restQ'] };
    const spec = makeBoard('stepUp', PRESETS.female.quiver.stepUp);
    const t = poseTargets('barrel', { spec, layout: layoutFor(spec, 1.65), rest, stance: 'regular', dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, phaseT: 0 });
    const s = solvePose(rest, t, FRAMES[1], null);
    // Three stores each bone's rest offset in its parent's rest frame: restQ[p]⁻¹ · (joint − parentJoint).
    const world: Record<string, Quaternion> = {}, pos: Record<string, Vector3> = {};
    for (const b of BONES) {
      const p = PARENT[b];
      if (!p) { world[b] = s.local[b].clone(); pos[b] = rest.joint[b].clone(); continue; }
      world[b] = world[p].clone().multiply(s.local[b]);
      const localOffset = rest.joint[b].clone().sub(rest.joint[p]).applyQuaternion(rest.restQ[p].clone().invert());
      pos[b] = b === 'pelvis' ? s.pelvisWorld.clone() : pos[p].clone().add(localOffset.applyQuaternion(world[p]));
    }
    for (const b of BONES) expect(pos[b].distanceTo(s.joint[b]), b).toBeLessThan(1e-6);
  });
});

describe('ride state', () => {
  it('gives every pose a phase and a zone', () => {
    for (const k of KINDS) for (const p of posesFor(k)) expect([POSE_PHASE[p], POSE_ZONE[p]].every(Boolean)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/surfer/solvePose.test.ts`. Expected: FAIL, unresolved imports.

- [ ] **Step 3: Copy the reference sources**

Copy `…/src/surfer/poses.ts` → `src/surfer/poses.ts` and `…/src/surfer/solvePose.ts` → `src/surfer/solvePose.ts`,
verbatim.

- [ ] **Step 4: Write `src/surfer/rideState.ts`**

```ts
import type { Vector3 } from 'three/webgpu';
import type { PoseName } from './poseNames';
import type { BoardFrame } from './solvePose';

export type Zone = 'flats' | 'face' | 'pocket' | 'tube' | 'lip' | 'whitewater';
export type Phase = 'sit' | 'paddle' | 'popup' | 'ride' | 'kickout' | 'bail';

/**
 * The seam between riding physics and posing (spec §3.4). On the stand the dev panel fills it; in sub-project 2 the
 * physics will, and the surfer code will not change.
 */
export interface RideState {
  board: BoardFrame;
  speedMs: number;
  /** + into the wave face. */
  railAngleRad: number;
  compression: number;
  zone: Zone;
  phase: Phase;
  phaseT: number;
  lookAt: Vector3;
}

export const POSE_PHASE: Record<PoseName, Phase> = {
  sit: 'sit', paddle: 'paddle', popup: 'popup', drop: 'ride', bottomTurn: 'ride', trim: 'ride', barrel: 'ride',
  kickout: 'kickout', bail: 'bail', prone: 'ride', proneBarrel: 'ride', dropKnee: 'ride',
};

export const POSE_ZONE: Record<PoseName, Zone> = {
  sit: 'flats', paddle: 'flats', popup: 'face', drop: 'face', bottomTurn: 'face', trim: 'face', barrel: 'tube',
  kickout: 'face', bail: 'whitewater', prone: 'face', proneBarrel: 'tube', dropKnee: 'face',
};
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/surfer && npm run typecheck`. Expected: PASS (the sweep takes a few seconds); typecheck clean.
If a sweep row fails, fix that pose's constants in `poses.ts`, never the tolerance.

- [ ] **Step 6: Commit**

```bash
git add src/surfer/poses.ts src/surfer/solvePose.ts src/surfer/rideState.ts src/surfer/solvePose.test.ts
git commit -m "feat(surfer): the key poses as targets and the solver: planted feet, shared spine, IK limbs, head look

Every pose × stance × body × board × dial extreme × tilt (to 70°): ankles on target, knees and elbows within 150°.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The balance layer and the leash

**Files:**
- Create: `src/surfer/balance.ts`, `src/surfer/leash.ts`
- Test: `src/surfer/balance.test.ts`, `src/surfer/leash.test.ts`

**Interfaces:**
- Consumes: `createRng`, `deriveSeed` (`src/conditions/rng.ts`).
- Produces:
  - `interface Balance { lead: Vector3; trail: Vector3; compression: number }`
  - `balanceAt(seed, t, amount, heaveAccel): Balance`
  - `leashCurve(from, to, lengthM, deckY: (x, z) => number | null, n = 16): Vector3[]`
  - `LEASH_POINTS = 16`, `LEASH_SIDES = 6`
  - `tubePositions(points, radius, sides, out: Float32Array)`, `tubeIndices(nPoints, sides): Uint32Array`

- [ ] **Step 1: Write the failing tests**

```ts
// src/surfer/balance.test.ts
import { describe, expect, it } from 'vitest';
import { balanceAt } from './balance';

describe('the balance layer (spec §3.6)', () => {
  it('is deterministic for a seed and a time', () => expect(balanceAt(7, 12.5, 1, 0)).toEqual(balanceAt(7, 12.5, 1, 0)));
  it('is still with amount 0, and small otherwise (≤ 3 cm per axis at amount 1)', () => {
    const z = balanceAt(7, 3, 0, 0);
    expect(z.lead.length() + z.trail.length()).toBe(0);
    for (let t = 0; t < 20; t += 0.37) {
      const b = balanceAt(7, t, 1, 0);
      for (const v of [b.lead, b.trail]) for (const c of [v.x, v.y, v.z]) expect(Math.abs(c)).toBeLessThanOrEqual(0.03 + 1e-12);
    }
  });
  it('absorbs heave in the knees, within ±0.15 of compression', () => {
    expect(balanceAt(7, 0, 1, 3).compression).toBeCloseTo(0.06, 9);
    expect(balanceAt(7, 0, 1, 100).compression).toBe(0.15);
    expect(balanceAt(7, 0, 1, -100).compression).toBe(-0.15);
  });
});
```

```ts
// src/surfer/leash.test.ts
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt, halfWidthAt, layoutFor, makeBoard, uAt } from '../board/boardSpec';
import { leashCurve, tubeIndices, tubePositions } from './leash';

describe('the leash', () => {
  const spec = makeBoard('thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 });
  const lay = layoutFor(spec, 1.78);
  const deck = (x: number, z: number): number | null => (Math.abs(x) <= spec.lengthM / 2 && Math.abs(z) <= halfWidthAt(spec, uAt(spec, x)) ? deckYAt(spec, x, z) : null);

  it('runs from the ankle to the plug and never passes through the deck', () => {
    for (const ankle of [new Vector3(lay.spots.back[0], lay.spots.back[1] + 0.07, 0.05), new Vector3(-1.4, -0.3, 0.3), new Vector3(0.2, 0.5, -0.4)]) {
      const pts = leashCurve(ankle, new Vector3(...lay.leashPlug), lay.leashLengthM, deck);
      expect(pts.length).toBe(17);
      expect(pts[0].distanceTo(ankle)).toBeLessThan(0.013);
      for (const p of pts) {
        const d = deck(p.x, p.z);
        if (d !== null) expect(p.y).toBeGreaterThanOrEqual(d);
      }
    }
  });
  it('sags with slack and pulls straight when taut', () => {
    const a = new Vector3(0, 1, 0), b = new Vector3(1, 1, 0), none = (): null => null;
    expect(Math.min(...leashCurve(a, b, 3, none).map((p) => p.y))).toBeLessThan(0.9);
    expect(Math.min(...leashCurve(a, b, 1, none).map((p) => p.y))).toBeCloseTo(1, 9);
  });
  it('builds a tube of the right size around the curve', () => {
    const pts = [new Vector3(0, 0, 0), new Vector3(0.5, 0, 0), new Vector3(1, 0.2, 0)];
    const out = new Float32Array(pts.length * 6 * 3);
    tubePositions(pts, 0.004, 6, out);
    for (let i = 0; i < pts.length; i++) for (let k = 0; k < 6; k++) {
      const o = (i * 6 + k) * 3;
      expect(Math.hypot(out[o] - pts[i].x, out[o + 1] - pts[i].y, out[o + 2] - pts[i].z)).toBeCloseTo(0.004, 6);
    }
    expect(tubeIndices(3, 6).length).toBe(2 * 6 * 2 * 3);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/surfer/balance.test.ts src/surfer/leash.test.ts`. Expected: FAIL, unresolved imports.

- [ ] **Step 3: Write `src/surfer/balance.ts`**

```ts
import { Vector3 } from 'three/webgpu';
import { createRng, deriveSeed } from '../conditions/rng';

/** Offsets (m, chest frame) for the lead and trail hands, and a compression offset from the board's heave. */
export interface Balance {
  lead: Vector3;
  trail: Vector3;
  compression: number;
}

const AMP_M = 0.03;
const HEAVE_GAIN = 0.02;
const HEAVE_MAX = 0.15;

/**
 * The balance layer (spec §3.6): slow seeded drifts of a few centimetres at 0.3–0.8 Hz, and the knees soaking up the
 * board's heave. Deterministic in (seed, t), so a moment link reproduces it.
 */
export function balanceAt(seed: number, t: number, amount: number, heaveAccel: number): Balance {
  const a = Math.min(2, Math.max(0, amount));
  const rng = createRng(deriveSeed(seed, 0x5eed));
  const axis = (): number => {
    const f1 = 0.3 + 0.5 * rng.next(), f2 = 0.3 + 0.5 * rng.next(), p1 = 2 * Math.PI * rng.next(), p2 = 2 * Math.PI * rng.next();
    return AMP_M * a * (0.6 * Math.sin(2 * Math.PI * f1 * t + p1) + 0.4 * Math.sin(2 * Math.PI * f2 * t + p2));
  };
  const lead = new Vector3(axis(), axis(), axis()), trail = new Vector3(axis(), axis(), axis());
  return { lead, trail, compression: Math.min(HEAVE_MAX, Math.max(-HEAVE_MAX, heaveAccel * HEAVE_GAIN * a)) };
}
```

(Each axis is `AMP_M × a × (0.6 sin + 0.4 sin)`, so ≤ 3 cm at `a = 1`.)

- [ ] **Step 4: Write `src/surfer/leash.ts`**

```ts
import { Vector3 } from 'three/webgpu';

export const LEASH_POINTS = 16;
export const LEASH_SIDES = 6;
const LIFT_M = 0.012;
const MAX_SAG_M = 0.4;

/**
 * The leash from the ankle (or arm) to the plug, board frame (spec §3.2): a quadratic sag with the slack, lifted onto
 * the deck wherever it crosses the board, so it never passes through it.
 */
export function leashCurve(from: Vector3, to: Vector3, lengthM: number, deckY: (x: number, z: number) => number | null, n = LEASH_POINTS): Vector3[] {
  const slack = Math.max(0, lengthM - from.distanceTo(to));
  const sag = Math.min(0.5 * slack, MAX_SAG_M);
  const ctrl = from.clone().add(to).multiplyScalar(0.5);
  ctrl.y -= 2 * sag;
  const pts: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const p = new Vector3(a * from.x + b * ctrl.x + c * to.x, a * from.y + b * ctrl.y + c * to.y, a * from.z + b * ctrl.z + c * to.z);
    const d = deckY(p.x, p.z);
    if (d !== null && p.y < d + LIFT_M) p.y = d + LIFT_M;
    pts.push(p);
  }
  return pts;
}

/** A tube of `sides` around the points, written into `out` ((points × sides) × 3). */
export function tubePositions(points: readonly Vector3[], radius: number, sides: number, out: Float32Array): void {
  const t = new Vector3(), n = new Vector3(), b = new Vector3();
  for (let i = 0; i < points.length; i++) {
    t.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    n.set(0, 1, 0).cross(t);
    if (n.lengthSq() < 1e-8) n.set(1, 0, 0).cross(t);
    n.normalize();
    b.crossVectors(t, n);
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides, o = (i * sides + k) * 3;
      out[o] = points[i].x + radius * (Math.cos(a) * n.x + Math.sin(a) * b.x);
      out[o + 1] = points[i].y + radius * (Math.cos(a) * n.y + Math.sin(a) * b.y);
      out[o + 2] = points[i].z + radius * (Math.cos(a) * n.z + Math.sin(a) * b.z);
    }
  }
}

export function tubeIndices(nPoints: number, sides: number): Uint32Array {
  const idx: number[] = [];
  for (let i = 0; i < nPoints - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k, b = i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
  }
  return new Uint32Array(idx);
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/surfer && npm run typecheck`. Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/surfer/balance.ts src/surfer/leash.ts src/surfer/balance.test.ts src/surfer/leash.test.ts
git commit -m "feat(surfer): the balance layer (seeded drifts, knees soak heave) and the leash that never cuts the deck

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Blender: the bodies

This task needs Andrew for Step 1 (Blender isn't installed yet). Tasks 1–6 don't need Blender, so he can install it
while they run.

**Files:**
- Create:
  - `tools/surfer/README.md`, `tools/surfer/presets/female.json`, `tools/surfer/presets/male.json`
  - `tools/surfer/mpfb_bridge.py`, `tools/surfer/probe_api.py`, `tools/surfer/rig_trim.py`, `tools/surfer/export.py`,
    `tools/surfer/previews.py`, `tools/surfer/build.py`
  - `tools/surfer/buildSurfers.ts`
  - `public/surfer/female.glb`, `public/surfer/male.glb` and their `.manifest.json` files (build output, committed)
- Modify: `package.json` (script), `.gitignore`, `src/surfer/rig.ts` (manifest types and checks)
- Test: `src/surfer/manifest.test.ts`

**Interfaces:**
- Consumes: `BONES`, `PARENT`, `SkeletonRest` (Task 4); `PRESETS` (Task 3).
- Produces:
  - In `rig.ts`: `interface ManifestBone`, `interface SurferManifest`, `manifestProblems(m): string[]`,
    `restFromManifest(m, restQ): SkeletonRest`.
  - Files: `public/surfer/<name>.glb` (the armature named by `BONES`, a skinned `body` mesh, material slot `body`),
    `public/surfer/<name>.manifest.json`, and `tools/surfer/previews/<name>-clay.png` (8-view sheet, git-ignored).

- [ ] **Step 1: Andrew installs Blender and MPFB** (human step; I send him these instructions)
  1. Download the current Blender LTS installer from https://www.blender.org/download/lts/ and install it with the
     default options (`C:\Program Files\Blender Foundation\Blender <version>\`).
  2. Open Blender → Edit → Preferences → Get Extensions → search "MPFB" → Install. Close Blender. (MPFB is MakeHuman's
     Blender extension. Its code is GPL; the characters it makes are CC0.)
  3. Tell me when that's done. I record the versions in `tools/surfer/README.md`.

- [ ] **Step 2: Write the manifest test (it fails until the build runs)**

```ts
// src/surfer/manifest.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { BONES, type SurferManifest, manifestProblems } from './rig';

/** The JSON chunk of a .glb (the binary glTF container: 12-byte header, then a JSON chunk). */
export function glbJson(path: string): any {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${path}: the first chunk is not JSON`);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

for (const name of ['female', 'male'] as const) {
  describe(`the ${name} surfer build`, () => {
    const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
    const gltf = glbJson(`public/surfer/${name}.glb`);
    it('keeps the skeleton contract (names, parents, lengths, legs down)', () => expect(manifestProblems(man)).toEqual([]));
    it('is the preset’s height (±1 cm)', () => expect(Math.abs(man.heightM - PRESETS[name].heightM)).toBeLessThan(0.01));
    it('skins to exactly the contract bones', () => {
      expect(gltf.skins.length).toBe(1);
      expect(gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name).sort()).toEqual([...BONES].sort());
    });
    it('keeps the body within budget (≤ 24k triangles, ≤ 4 materials; ≤ 40k in all)', () => {
      const body = man.meshes.find((m) => m.materials.includes('body'))!;
      expect(body.triangles).toBeLessThanOrEqual(24000);
      expect(body.materials.length).toBeLessThanOrEqual(4);
      expect(man.meshes.reduce((s, m) => s + m.triangles, 0)).toBeLessThanOrEqual(40000);
    });
  });
}
```

- [ ] **Step 3: Add the manifest types and checks to `src/surfer/rig.ts`** (append)

```ts
export interface ManifestBone {
  name: string;
  parent: string | null;
  /** glTF axes, metres. */
  head: [number, number, number];
  tail: [number, number, number];
}

/** Written by tools/surfer/export.py beside each .glb (spec §3.1). */
export interface SurferManifest {
  name: string;
  heightM: number;
  bones: ManifestBone[];
  meshes: { name: string; triangles: number; materials: string[] }[];
  blender: string;
  mpfb: string;
}

/** Everything wrong with a manifest's skeleton against the contract (empty = fine). */
export function manifestProblems(m: SurferManifest): string[] {
  const out: string[] = [];
  const byName = new Map(m.bones.map((b) => [b.name, b]));
  const names = [...byName.keys()].sort(), want = [...BONES].sort();
  if (JSON.stringify(names) !== JSON.stringify(want)) out.push(`bones ${JSON.stringify(names)} ≠ contract ${JSON.stringify(want)}`);
  for (const b of BONES) {
    const mb = byName.get(b);
    if (!mb) continue;
    if (mb.parent !== PARENT[b]) out.push(`${b}: parent ${mb.parent} ≠ ${PARENT[b]}`);
    if (Math.hypot(mb.tail[0] - mb.head[0], mb.tail[1] - mb.head[1], mb.tail[2] - mb.head[2]) < 0.01) out.push(`${b}: shorter than 1 cm`);
  }
  for (const s of ['l', 'r'] as const) {
    for (const leg of [`thigh_${s}`, `shin_${s}`] as const) {
      const mb = byName.get(leg);
      if (mb && mb.tail[1] >= mb.head[1]) out.push(`${leg}: doesn't point down`);
    }
    const foot = byName.get(`foot_${s}`);
    if (foot && foot.head[1] > 0.12 * m.heightM) out.push(`foot_${s}: ankle too high (${foot.head[1].toFixed(3)} m)`);
  }
  const head = byName.get('head');
  if (head && head.head[1] < 0.8 * m.heightM) out.push(`head: too low (${head.head[1].toFixed(3)} m)`);
  return out;
}

/** The rest skeleton of a loaded body: joints from its manifest, rest rotations from its bones. */
export function restFromManifest(m: SurferManifest, restQ: Record<BoneName, Quaternion>): SkeletonRest {
  const joint = {} as Record<BoneName, Vector3>;
  for (const b of m.bones) if ((BONES as readonly string[]).includes(b.name)) joint[b.name as BoneName] = new Vector3(...b.head);
  return { heightM: m.heightM, joint, restQ };
}
```

- [ ] **Step 4: Write the build inputs**

`tools/surfer/presets/female.json`:

```json
{
  "name": "female",
  "heightM": 1.65,
  "bodyTriangles": 21000,
  "macro": { "gender": 0.0, "age": 0.34375, "muscle": 0.6, "weight": 0.42, "proportions": 0.8, "height": 0.35, "cupsize": 0.45, "firmness": 0.55 },
  "hair": { "style": "ponytail", "seed": 11 },
  "boardies": false,
  "outfits": ["bikini", "vestAndBottoms", "shortArmSteamer"],
  "preview": { "skin": [0.52, 0.34, 0.24], "hair": [0.35, 0.26, 0.14], "fabric": [0.55, 0.12, 0.1], "boardies": [0.1, 0.2, 0.4] }
}
```

`tools/surfer/presets/male.json`:

```json
{
  "name": "male",
  "heightM": 1.78,
  "bodyTriangles": 21000,
  "macro": { "gender": 1.0, "age": 0.34375, "muscle": 0.65, "weight": 0.42, "proportions": 0.8, "height": 0.5 },
  "hair": { "style": "short", "seed": 7 },
  "boardies": true,
  "outfits": ["boardies", "springsuit", "shortArmSteamer"],
  "preview": { "skin": [0.46, 0.3, 0.2], "hair": [0.3, 0.22, 0.12], "fabric": [0.1, 0.1, 0.12], "boardies": [0.08, 0.28, 0.3] }
}
```

(MakeHuman's age dial: 0.1875 is 11 years and 0.5 is 25, so 18 years is 0.34375. Height is set exactly by scaling
afterwards, so the height macro only shapes the proportions.)

- [ ] **Step 5: Write `tools/surfer/mpfb_bridge.py`**

```python
"""Every call into MPFB lives here, so an MPFB version change is fixed in one file (plan Task 7)."""
import importlib
import os

_CANDIDATES = ("bl_ext.blender_org.mpfb", "bl_ext.user_default.mpfb", "mpfb")


def module():
    for name in _CANDIDATES:
        try:
            return importlib.import_module(name)
        except ImportError:
            continue
    raise SystemExit("MPFB is not installed or not enabled in Blender. See tools/surfer/README.md.")


def _services():
    base = module().__name__
    hs = importlib.import_module(base + ".services.humanservice").HumanService
    ts = importlib.import_module(base + ".services.targetservice").TargetService
    return hs, ts


def version():
    root = os.path.dirname(module().__file__)
    manifest = os.path.join(root, "blender_manifest.toml")
    if os.path.exists(manifest):
        for line in open(manifest, encoding="utf-8"):
            if line.strip().startswith("version"):
                return line.split("=", 1)[1].strip().strip('"')
    info = getattr(module(), "bl_info", {})
    return ".".join(str(v) for v in info.get("version", ("unknown",)))


def create_human(macro):
    HumanService, TargetService = _services()
    details = TargetService.get_default_macro_info_dict()
    for key, value in macro.items():
        if key not in details:
            raise SystemExit(f"MPFB has no macro detail '{key}'; it has {sorted(details)}")
        details[key] = value
    return HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True,
                                     feet_on_ground=True, scale=0.1, macro_detail_dict=details)


def add_game_rig(basemesh):
    HumanService, _ = _services()
    return HumanService.add_builtin_rig(basemesh, "game_engine", import_weights=True)
```

- [ ] **Step 6: Write `tools/surfer/probe_api.py`, which checks MPFB before the build relies on it**

```python
"""Prints what the build relies on in this Blender + MPFB (npm run build:surfers -- --probe)."""
import inspect
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import mpfb_bridge  # noqa: E402

out_path = sys.argv[sys.argv.index("--") + 1]
lines = [f"blender {bpy.app.version_string}", f"mpfb module {mpfb_bridge.module().__name__}", f"mpfb {mpfb_bridge.version()}"]
hs, ts = mpfb_bridge._services()
lines.append("create_human" + str(inspect.signature(hs.create_human)))
lines.append("add_builtin_rig" + str(inspect.signature(hs.add_builtin_rig)))
lines.append("macro keys " + str(sorted(ts.get_default_macro_info_dict())))
bpy.ops.wm.read_homefile(use_empty=True)
body = mpfb_bridge.create_human({"gender": 0.0})
rig = mpfb_bridge.add_game_rig(body)
lines.append("vertex groups " + str(sorted(g.name for g in body.vertex_groups)))
lines.append("bones " + str([(b.name, b.parent.name if b.parent else None) for b in rig.data.bones]))
lines.append(f"body scale {tuple(body.scale)} rig scale {tuple(rig.scale)} parent {body.parent.name if body.parent else None}")
lines.append(f"shape keys {len(body.data.shape_keys.key_blocks) if body.data.shape_keys else 0}")
lines.append("modifiers " + str([(m.name, m.type) for m in body.modifiers]))
open(out_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
```

- [ ] **Step 7: Write the runner `tools/surfer/buildSurfers.ts` and the npm script**

```ts
// Builds the surfers (spec 2026-09-30-surfer-on-the-stand-design.md §3.1). Run from the repo root:
//   npm run build:surfers              both surfers → public/surfer/, previews → tools/surfer/previews/
//   npm run build:surfers -- --probe   what this Blender + MPFB offers → tools/surfer/api-probe.txt
//   npm run build:surfers -- --only male
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const version = (d: string): number => {
  const [a, b] = d.replace('Blender ', '').split('.').map(Number);
  return a * 1000 + b;
};

function findBlender(): string {
  const env = process.env.BLENDER_PATH;
  if (env) {
    if (existsSync(env)) return env;
    throw new Error(`BLENDER_PATH is ${env}, which doesn't exist.`);
  }
  const root = 'C:/Program Files/Blender Foundation';
  if (existsSync(root)) {
    for (const d of readdirSync(root).filter((x) => /^Blender \d+\.\d+$/.test(x)).sort((a, b) => version(b) - version(a))) {
      const exe = join(root, d, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('Blender was not found. Install it (tools/surfer/README.md) or set BLENDER_PATH to blender.exe.');
}

function run(blender: string, script: string, args: string[]): void {
  // No --factory-startup: the user preferences are what enable the MPFB extension.
  const r = spawnSync(blender, ['--background', '--python-exit-code', '1', '--python', script, '--', ...args], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Blender failed (${r.status ?? r.signal}) running ${script}.`);
    process.exit(1);
  }
}

const tools = resolve('tools/surfer');
const blender = findBlender();
if (process.argv.includes('--probe')) {
  run(blender, join(tools, 'probe_api.py'), [join(tools, 'api-probe.txt')]);
} else {
  const onlyAt = process.argv.indexOf('--only');
  const names = onlyAt > 0 ? [process.argv[onlyAt + 1]] : ['female', 'male'];
  mkdirSync(resolve('public/surfer'), { recursive: true });
  mkdirSync(join(tools, 'previews'), { recursive: true });
  for (const name of names) run(blender, join(tools, 'build.py'), [join(tools, 'presets', `${name}.json`), resolve('public/surfer'), join(tools, 'previews')]);
}
```

In `package.json` `scripts`, add `"build:surfers": "node tools/surfer/buildSurfers.ts"`. In `.gitignore`, add
`tools/surfer/previews/` and `tools/surfer/__pycache__/` under "# Local tooling".

- [ ] **Step 8: Run the probe and read it**

Run: `npm run build:surfers -- --probe`
Expected: `tools/surfer/api-probe.txt` lists the `create_human` and `add_builtin_rig` signatures, the macro keys
(including those in the presets), the vertex groups (including `body`, `helper-l-eye` and `helper-r-eye`), and the
game-engine rig's bones.

Check the bones against `BONE_MAP` in Step 9. If a name differs, correct `BONE_MAP`'s source names; the contract names
don't change. If the macro keys or signatures differ, correct `mpfb_bridge.py` only. Commit `api-probe.txt` with the
task: it records what the build was made against.

- [ ] **Step 9: Write `tools/surfer/rig_trim.py`**

```python
"""Bake the MPFB human into one plain skinned mesh on the 23-bone contract skeleton (spec §3.3)."""
import bmesh
import bpy
from mathutils import Vector

# MPFB game-engine bone → contract bone (src/surfer/rig.ts). Checked against tools/surfer/api-probe.txt.
BONE_MAP = {
    "root": "root", "pelvis": "pelvis", "spine_01": "spine_01", "spine_02": "spine_02", "spine_03": "spine_03",
    "neck_01": "neck", "head": "head",
    "clavicle_l": "clavicle_l", "upperarm_l": "upperarm_l", "lowerarm_l": "forearm_l", "hand_l": "hand_l",
    "clavicle_r": "clavicle_r", "upperarm_r": "upperarm_r", "lowerarm_r": "forearm_r", "hand_r": "hand_r",
    "thigh_l": "thigh_l", "calf_l": "shin_l", "foot_l": "foot_l", "ball_l": "toe_l",
    "thigh_r": "thigh_r", "calf_r": "shin_r", "foot_r": "foot_r", "ball_r": "toe_r",
}
# The contract's parents (src/surfer/rig.ts PARENT), by contract name.
PARENT = {
    "pelvis": "root", "spine_01": "pelvis", "spine_02": "spine_01", "spine_03": "spine_02", "neck": "spine_03", "head": "neck",
    "clavicle_l": "spine_03", "upperarm_l": "clavicle_l", "forearm_l": "upperarm_l", "hand_l": "forearm_l",
    "clavicle_r": "spine_03", "upperarm_r": "clavicle_r", "forearm_r": "upperarm_r", "hand_r": "forearm_r",
    "thigh_l": "pelvis", "shin_l": "thigh_l", "foot_l": "shin_l", "toe_l": "foot_l",
    "thigh_r": "pelvis", "shin_r": "thigh_r", "foot_r": "shin_r", "toe_r": "foot_r",
}


def activate(obj):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake_shape(body):
    """Apply MPFB's target shape keys and any non-armature modifiers, leaving plain geometry."""
    activate(body)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(body.modifiers):
        if m.type != "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=m.name)


def apply_transforms(rig, meshes):
    """Unparent, apply every transform (MPFB may scale objects), and parent back: all at identity afterwards."""
    for o in [rig, *meshes]:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    for o in [rig, *meshes]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for m in meshes:
        m.parent = rig


def group_centroid(body, name):
    g = body.vertex_groups.get(name)
    if g is None:
        return None
    pts = [v.co for v in body.data.vertices if any(e.group == g.index and e.weight > 0.5 for e in v.groups)]
    return sum(pts, Vector()) / len(pts) if pts else None


def delete_helpers(body):
    """Keep only the 'body' vertex group's vertices. Returns the eye centres, read from the eye helpers first."""
    names = [g.name for g in body.vertex_groups]
    if "body" not in names:
        raise SystemExit(f"the basemesh has no 'body' vertex group; it has {names}")
    eyes = {side: group_centroid(body, f"helper-{side}-eye") for side in ("l", "r")}
    gi = body.vertex_groups["body"].index
    keep = {v.index for v in body.data.vertices if any(e.group == gi and e.weight > 0.5 for e in v.groups)}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    return eyes


def scale_to_height(body, rig, height_m, points):
    """Scale the mesh, the bones and the landmark points so the body is exactly height_m tall, feet on z = 0."""
    zs = [v.co.z for v in body.data.vertices]
    f = height_m / (max(zs) - min(zs))
    for v in body.data.vertices:
        v.co *= f
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in rig.data.edit_bones:
        eb.head *= f
        eb.tail *= f
    bpy.ops.object.mode_set(mode="OBJECT")
    for k, p in points.items():
        if p is not None:
            points[k] = p * f


def trim(rig, body):
    """Merge the weights of every dropped bone into its nearest kept ancestor, delete it, then rename to the contract."""
    have = {b.name for b in rig.data.bones}
    missing = [s for s in BONE_MAP if s not in have and s != "root"]
    if missing:
        raise SystemExit(f"the game_engine rig lacks {missing}; it has {sorted(have)}")
    keep = set(BONE_MAP)
    for bone in rig.data.bones:
        if bone.name in keep:
            continue
        anc = bone.parent
        while anc is not None and anc.name not in keep:
            anc = anc.parent
        src = body.vertex_groups.get(bone.name)
        if src is None:
            continue
        if anc is None:
            raise SystemExit(f"bone {bone.name} has no kept ancestor to take its weights")
        dst = body.vertex_groups.get(anc.name) or body.vertex_groups.new(name=anc.name)
        for v in body.data.vertices:
            for e in v.groups:
                if e.group == src.index and e.weight > 0:
                    dst.add([v.index], e.weight, "ADD")
        body.vertex_groups.remove(src)
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    for b in list(eb):
        if b.name not in keep:
            eb.remove(b)
    if "root" not in eb:
        root = eb.new("root")
        root.head, root.tail = Vector((0, 0, 0)), Vector((0, 0.1, 0))
    source_of = {dst: src for src, dst in BONE_MAP.items()}
    for dst, parent in PARENT.items():
        eb[source_of[dst]].use_connect = False
        eb[source_of[dst]].parent = eb[source_of[parent]]
    bpy.ops.object.mode_set(mode="OBJECT")
    for src, dst in BONE_MAP.items():
        if src != dst:
            rig.data.bones[src].name = dst  # Blender renames the matching vertex groups too
    for g in list(body.vertex_groups):
        if g.name not in PARENT and g.name != "root":
            body.vertex_groups.remove(g)
    for pb in rig.pose.bones:
        pb.matrix_basis.identity()


def decimate(body, triangles):
    now = sum(len(p.vertices) - 2 for p in body.data.polygons)
    if now <= triangles:
        return
    activate(body)
    mod = body.modifiers.new("decimate", "DECIMATE")
    mod.ratio = triangles / now
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def limit_weights(obj):
    activate(obj)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)


def single_material(obj, name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat
```

- [ ] **Step 10: Write `tools/surfer/export.py`**

```python
"""The .glb and its manifest (spec §3.1)."""
import json

import bpy


def glb(rig, meshes, path):
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_skins=True, export_animations=False, export_morph=False,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT")


def manifest(rig, meshes, preset, path, mpfb_version):
    def gl(v):  # Blender (x, y, z) → glTF (x, z, -y)
        return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
    data = {
        "name": preset["name"],
        "heightM": preset["heightM"],
        "bones": [{"name": b.name, "parent": b.parent.name if b.parent else None, "head": gl(b.head_local), "tail": gl(b.tail_local)} for b in rig.data.bones],
        "meshes": [{"name": m.name, "triangles": sum(len(p.vertices) - 2 for p in m.data.polygons), "materials": [s.material.name for s in m.material_slots if s.material]} for m in meshes],
        "blender": bpy.app.version_string,
        "mpfb": mpfb_version,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
```

- [ ] **Step 11: Write `tools/surfer/previews.py` (the clay sheet now; Task 8 adds the outfits)**

```python
"""Turntable sheets for judging the bodies by eye (spec §7, gate 1): 8 views, 45° apart, in a 4 × 2 grid."""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

VIEW_W, VIEW_H = 384, 640


def _engine(scene):
    for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = e
            return
        except TypeError:
            continue


def _setup():
    scene = bpy.context.scene
    _engine(scene)
    scene.render.resolution_x, scene.render.resolution_y = VIEW_W, VIEW_H
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new("preview")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    bg.inputs[1].default_value = 0.8
    if "preview_sun" not in bpy.data.objects:
        sun = bpy.data.objects.new("preview_sun", bpy.data.lights.new("preview_sun", "SUN"))
        sun.data.energy = 3.5
        sun.rotation_euler = (math.radians(50), 0, math.radians(30))
        scene.collection.objects.link(sun)
    cam = bpy.data.objects.get("preview_cam")
    if cam is None:
        cam = bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
        cam.data.lens = 70
        scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def clay(obj):
    for slot in obj.material_slots:
        bsdf = slot.material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.6, 0.6, 0.6, 1)


def sheet(name, height, out_dir, label):
    scene, cam = _setup()
    dist, target = height * 2.9, Vector((0, 0, height * 0.52))
    grid = np.zeros((VIEW_H * 2, VIEW_W * 4, 4), dtype=np.float32)
    tmp = os.path.join(out_dir, "_view.png")
    for i in range(8):
        a = math.radians(45 * i)
        cam.location = Vector((dist * math.sin(a), -dist * math.cos(a), height * 0.55))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(tmp, check_existing=False)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(VIEW_H, VIEW_W, 4)
        bpy.data.images.remove(img)
        row, col = divmod(i, 4)
        y0 = (1 - row) * VIEW_H  # image rows run bottom-up: the first four views go on the top row
        grid[y0:y0 + VIEW_H, col * VIEW_W:(col + 1) * VIEW_W] = px
    out = bpy.data.images.new(f"{name}-{label}", VIEW_W * 4, VIEW_H * 2, alpha=True)
    out.pixels.foreach_set(grid.ravel())
    out.filepath_raw = os.path.join(out_dir, f"{name}-{label}.png")
    out.file_format = "PNG"
    out.save()
    os.remove(tmp)
```

- [ ] **Step 12: Write `tools/surfer/build.py`**

```python
"""Builds one surfer: blender --background --python build.py -- <preset.json> <out dir> <preview dir> (spec §3.1)."""
import json
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import export  # noqa: E402
import mpfb_bridge  # noqa: E402
import previews  # noqa: E402
import rig_trim  # noqa: E402

preset_path, out_dir, preview_dir = sys.argv[sys.argv.index("--") + 1:][:3]
preset = json.load(open(preset_path, encoding="utf-8"))
name = preset["name"]

bpy.ops.wm.read_homefile(use_empty=True)
body = mpfb_bridge.create_human(preset["macro"])
rig = mpfb_bridge.add_game_rig(body)
body.name, rig.name = f"{name}_body", f"{name}_armature"
rig_trim.bake_shape(body)
rig_trim.apply_transforms(rig, [body])
landmarks = rig_trim.delete_helpers(body)
rig_trim.scale_to_height(body, rig, preset["heightM"], landmarks)
rig_trim.trim(rig, body)
rig_trim.decimate(body, preset["bodyTriangles"])
rig_trim.limit_weights(body)
rig_trim.single_material(body, "body")
parts = [body]

export.glb(rig, parts, os.path.join(out_dir, f"{name}.glb"))
export.manifest(rig, parts, preset, os.path.join(out_dir, f"{name}.manifest.json"), mpfb_bridge.version())
previews.clay(body)
previews.sheet(name, preset["heightM"], preview_dir, "clay")
print(f"built {name}: {sum(len(p.vertices) - 2 for p in body.data.polygons)} body triangles")
```

- [ ] **Step 13: Build and run the tests**

Run: `npm run build:surfers`
Expected: two `built …` lines, and `public/surfer/{female,male}.glb` and `.manifest.json` written. Then run
`npx vitest run src/surfer/manifest.test.ts && npm run typecheck`. Expected: PASS.

Open `tools/surfer/previews/female-clay.png` and `male-clay.png` myself: a teenage build, feet on the ground, arms in an
A-pose, no stray helper geometry. This is a sanity check before Task 8; Andrew's sign-off comes at gate 1.

- [ ] **Step 14: Write `tools/surfer/README.md`**

Cover:
- what the build does (§3.1);
- the install steps from Step 1, with the Blender and MPFB versions read from `api-probe.txt`;
- `npm run build:surfers` and its flags, plus `BLENDER_PATH`;
- that `npm run dev` and `npm test` never need Blender;
- that `BONE_MAP` and `mpfb_bridge.py` are the only places to touch when MPFB changes.

- [ ] **Step 15: Commit**

```bash
git add tools/surfer package.json .gitignore src/surfer/rig.ts src/surfer/manifest.test.ts public/surfer
git commit -m "feat(surfer): the scripted Blender + MPFB build: two CC0 bodies on the contract skeleton, with manifests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Blender: the wardrobe masks, boardies, hair and eyes

**Files:**
- Create: `tools/surfer/bodymap.py`, `tools/surfer/wardrobe.py`, `tools/surfer/hair.py`, `public/surfer/LICENSES.md`
- Modify: `tools/surfer/build.py`, `tools/surfer/previews.py`, `src/surfer/manifest.test.ts`
- Rebuild: `public/surfer/*`

**Interfaces:**
- Consumes: `src/surfer/outfitMasks.json` (Task 3), `rig_trim.single_material` (Task 7).
- Produces (the `.glb` content that Task 10 relies on):
  - The `body` mesh carries `TEXCOORD_1` = (springsuit, short-arm steamer), `TEXCOORD_2` = (vest, bikini bottoms) and
    `TEXCOORD_3` = (bikini top, under the boardies). Each mask is 0 or 1 per vertex; three loads them as `uv1`, `uv2`,
    `uv3`.
  - A `hair` mesh: cards with `TEXCOORD_0` = (across 0–1, along 0 root → 1 tip), skinned to `head`.
  - An `eyes` mesh.
  - For the male preset, a `boardies` mesh.
  - Material names `body`, `hair`, `eyes`, `boardies`.
  - Turntable sheets `tools/surfer/previews/<name>-<outfit>.png`.

- [ ] **Step 1: Extend the manifest test** (append inside the `describe` in `src/surfer/manifest.test.ts`)

```ts
    it('carries the wardrobe masks on the body (TEXCOORD_1–3), and hair and eyes', () => {
      const matName = (i: number): string => gltf.materials[i].name;
      const body = gltf.meshes.find((m: any) => m.primitives.some((p: any) => matName(p.material) === 'body'));
      for (const p of body.primitives) for (const a of ['TEXCOORD_1', 'TEXCOORD_2', 'TEXCOORD_3']) expect(p.attributes[a], a).toBeDefined();
      const all = gltf.meshes.flatMap((m: any) => m.primitives.map((p: any) => matName(p.material)));
      for (const m of ['hair', 'eyes']) expect(all).toContain(m);
      expect(all.includes('boardies')).toBe(name === 'male');
    });
```

Run `npx vitest run src/surfer/manifest.test.ts`. Expected: FAIL on the new test.

- [ ] **Step 2: Write `tools/surfer/bodymap.py`**

```python
"""Where each vertex sits on the skeleton: its strongest bone (contract name without _l/_r) and how far along it."""
from mathutils import Vector


def bone_coords(body, rig):
    names = {g.index: g.name for g in body.vertex_groups}
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
    out = []
    for v in body.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        name = names.get(best.group, "root") if best else "root"
        head, tail = segs.get(name, (Vector(), Vector((0, 0, 1))))
        axis = tail - head
        t = max(0.0, min(1.0, (v.co - head).dot(axis) / max(axis.length_squared, 1e-9)))
        out.append((name[:-2] if name.endswith(("_l", "_r")) else name, t))
    return out


def landmarks(body, rig, height, eyes, coords):
    head = rig.data.bones["head"]
    centre = head.head_local + (head.tail_local - head.head_local) * 0.45
    eye_z = sum(p.z for p in eyes.values() if p is not None) / max(1, sum(p is not None for p in eyes.values()))
    if eye_z == 0:
        eye_z = head.head_local.z + 0.075 * height / 1.7
    top = [v.co for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and v.co.z > eye_z]
    radius = sum((c - centre).length for c in top) / max(1, len(top))
    return {"height": height, "head_centre": centre, "head_radius": radius, "eye_z": eye_z, "eyes": eyes}
```

- [ ] **Step 3: Write `tools/surfer/wardrobe.py`**

```python
"""The wardrobe (spec §4.3): masks baked into UV maps, and the boardies as the one loose garment."""
import json
import os

import bmesh
import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTFITS = json.load(open(os.path.join(REPO, "src", "surfer", "outfitMasks.json"), encoding="utf-8"))
TORSO = {"pelvis", "spine_01", "spine_02", "spine_03", "clavicle"}


def short_arm_steamer(b, t, co, H):
    if b in TORSO or b == "thigh":
        return 1
    if b == "neck":
        return 1 if t < 0.35 else 0
    if b == "upperarm":
        return 1 if t < 0.55 else 0
    if b == "shin":
        return 1 if t < 0.93 else 0
    return 0


def springsuit(b, t, co, H):
    if b == "shin":
        return 0
    if b == "thigh":
        return 1 if t < 0.45 else 0
    return short_arm_steamer(b, t, co, H)


def vest(b, t, co, H):
    if b in ("spine_01", "spine_02", "spine_03", "clavicle"):
        return 1
    if b == "neck":
        return 1 if t < 0.2 else 0
    if b == "pelvis":
        return 1 if co.z > 0.56 * H else 0
    return 0


def bikini_bottoms(b, t, co, H):
    if b == "pelvis":
        return 1 if co.z < 0.535 * H else 0
    if b == "thigh":
        return 1 if t < 0.06 else 0
    return 0


def bikini_top(b, t, co, H):
    """A bandeau around the chest (ruling: reads as a bikini top at the chase camera's distance)."""
    return 1 if b in ("spine_02", "spine_03", "clavicle") and 0.69 * H < co.z < 0.755 * H else 0


def under_boardies(b, t, co, H):
    if b in ("pelvis", "spine_01"):
        return 1 if co.z < 0.585 * H else 0
    if b == "thigh":
        return 1 if t < 0.62 else 0
    return 0


RULES = [springsuit, short_arm_steamer, vest, bikini_bottoms, bikini_top, under_boardies]


def paint_masks(body, coords, H):
    vals = [[rule(b, t, v.co, H) for rule in RULES] for v, (b, t) in zip(body.data.vertices, coords)]
    for layer, (i, j) in (("mask_a", (0, 1)), ("mask_b", (2, 3)), ("mask_c", (4, 5))):
        uv = body.data.uv_layers.new(name=layer)
        for loop in body.data.loops:
            m = vals[loop.vertex_index]
            uv.data[loop.index].uv = (m[i], m[j])


def boardies(body, rig, coords, H, name):
    """A copy of the body's region under the boardies, pushed out 1.2 cm and flared at the hems; same weights."""
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = f"{name}_boardies"
    bpy.context.scene.collection.objects.link(dup)
    inside = {i for i, (b, t) in enumerate(coords) if under_boardies(b, t, body.data.vertices[i].co, H)}
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in inside for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        b, t = coords[v.index] if v.index < len(coords) else ("pelvis", 0)
        flare = 0.035 * max(0.0, min(1.0, (t - 0.35) / 0.27)) if b == "thigh" else 0
        v.co += v.normal * (0.012 + flare)
    bm.to_mesh(dup.data)
    bm.free()
    for layer in [l.name for l in dup.data.uv_layers][1:]:
        dup.data.uv_layers.remove(dup.data.uv_layers[layer])
    dup.parent = rig
    return dup
```

Note: `bmesh.ops.delete` renumbers the vertices, but `coords` is indexed by the *original* vertex numbers. Read `b` and
`t` from a custom integer layer set before deleting:
- after `bm.verts.ensure_lookup_table()`, add `idx = bm.verts.layers.int.new("orig")`, then
  `for v in bm.verts: v[idx] = v.index`;
- in the displacement loop, use `coords[v[idx]]`.

- [ ] **Step 4: Write `tools/surfer/hair.py`**

```python
"""Hair cards (spec §4.2) grown from the scalp in Python, and simple eyes. The strands are drawn by the game's shader."""
import random

import bmesh
import bpy
from mathutils import Vector

DOWN = Vector((0, 0, -1))


def _unit(rng):
    return Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()


def _hug(p, centre, r_min):
    q = p - centre
    return centre + q.normalized() * r_min if q.length < r_min else p


def _is_scalp(co, centre, eye_z):
    # The face is toward -Y in Blender: the scalp is above the brow, or behind the head's centre down to the nape.
    return co.z > eye_z + 0.025 or (co.y > centre.y + 0.015 and co.z > eye_z - 0.05)


def _short(root, n, centre, rng):
    length = rng.uniform(0.045, 0.085)
    target = (n * 0.55 + DOWN * 0.3 + _unit(rng) * 0.35).normalized()
    r_min, d, pts = (root - centre).length + 0.004, n.copy(), [root + n * 0.002]
    for _ in range(5):
        d = (d * 0.55 + target * 0.45).normalized()
        pts.append(_hug(pts[-1] + d * (length / 5), centre, r_min))
    return pts


def _to_tie(root, n, centre, tie):
    r_min, pts = (root - centre).length + 0.005, [root + n * 0.002]
    for _ in range(12):
        to = tie - pts[-1]
        if to.length < 0.012:
            break
        d = (to.normalized() * 0.8 + n * 0.2).normalized()
        pts.append(_hug(pts[-1] + d * min(0.03, to.length), centre, r_min))
    if len(pts) < 3:
        pts.append(tie.copy())
    return pts


def _pony(tie, rng):
    d = (Vector((0, 0.35, -1)) + _unit(rng) * 0.15).normalized()
    length, pts = rng.uniform(0.22, 0.32), [tie.copy()]
    for _ in range(6):
        d = (d + Vector((0, 0, -0.15))).normalized()
        pts.append(pts[-1] + d * (length / 6))
    return pts


def _cards_object(cards, centre, rig, name):
    verts, faces, uvs = [], [], []
    for pts, width in cards:
        k, base = len(pts) - 1, len(verts)
        for i, p in enumerate(pts):
            tangent = (pts[min(i + 1, k)] - pts[max(i - 1, 0)]).normalized()
            side = tangent.cross((p - centre).normalized())
            side = side.normalized() if side.length > 1e-6 else tangent.orthogonal().normalized()
            half = width * 0.5 * (1 - 0.5 * i / k)
            verts += [p - side * half, p + side * half]
            uvs += [(0.0, i / k), (1.0, i / k)]
        for i in range(k):
            a = base + 2 * i
            faces.append((a, a + 2, a + 3, a + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(verts)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj


def build(body, rig, style, L, coords, name):
    rng = random.Random(style["seed"])
    centre, eye_z = L["head_centre"], L["eye_z"]
    scalp = [v for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and _is_scalp(v.co, centre, eye_z)]
    if len(scalp) < 50:
        raise SystemExit(f"only {len(scalp)} scalp vertices found; check the head landmarks")

    def pick():
        v = rng.choice(scalp)
        return v.co + _unit(rng) * 0.003, v.normal.copy()

    cards = []
    if style["style"] == "short":
        for _ in range(700):
            root, n = pick()
            cards.append((_short(root, n, centre, rng), 0.012))
    elif style["style"] == "ponytail":
        tie = centre + Vector((0, L["head_radius"] * 0.95, -0.01))
        for _ in range(850):
            root, n = pick()
            cards.append((_to_tie(root, n, centre, tie), 0.018))
        for _ in range(40):
            cards.append((_pony(tie, rng), 0.02))
    else:
        raise SystemExit(f"unknown hair style {style['style']}")
    return _cards_object(cards, centre, rig, f"{name}_hair")


def eyes(rig, L, name):
    bm = bmesh.new()
    for side, fallback in (("l", 1), ("r", -1)):
        c = L["eyes"].get(side) or (L["head_centre"] + Vector((0.032 * fallback, -0.085, L["eye_z"] - L["head_centre"].z)))
        geom = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.0115)
        bmesh.ops.translate(bm, verts=geom["verts"], vec=c)
    me = bpy.data.meshes.new(f"{name}_eyes")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"{name}_eyes", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(me.vertices)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj
```

- [ ] **Step 5: Wire them into `tools/surfer/build.py`**

After `rig_trim.single_material(body, "body")`, replace `parts = [body]` with:

```python
import bodymap  # noqa: E402
import hair  # noqa: E402
import wardrobe  # noqa: E402

coords = bodymap.bone_coords(body, rig)
L = bodymap.landmarks(body, rig, preset["heightM"], landmarks, coords)
wardrobe.paint_masks(body, coords, preset["heightM"])
hair_obj = hair.build(body, rig, preset["hair"], L, coords, name)
eye_obj = hair.eyes(rig, L, name)
rig_trim.single_material(hair_obj, "hair")
rig_trim.single_material(eye_obj, "eyes")
parts = [body, hair_obj, eye_obj]
if preset["boardies"]:
    shorts = wardrobe.boardies(body, rig, coords, preset["heightM"], name)
    rig_trim.single_material(shorts, "boardies")
    parts.append(shorts)
```

Move the three module imports to the top with the others. Replace the preview lines at the end with:

```python
previews.clay(body)
previews.sheet(name, preset["heightM"], preview_dir, "clay")
for outfit in preset["outfits"]:
    previews.dress(parts, preset, outfit)
    previews.sheet(name, preset["heightM"], preview_dir, outfit)
```

- [ ] **Step 6: Add the outfit preview material to `tools/surfer/previews.py`** (append)

```python
import json  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTFITS = json.load(open(os.path.join(REPO, "src", "surfer", "outfitMasks.json"), encoding="utf-8"))
WEIGHTS = ("spring", "steamer", "vest", "bottoms", "top", "boardies")


def _sock(node, identifier, outputs=False):
    return next(s for s in (node.outputs if outputs else node.inputs) if s.identifier == identifier)


def _body_material(mat, preset):
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])

    def sep(layer):
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = layer
        s = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uvn.outputs[0], s.inputs[0])
        return s

    a, b, c = sep("mask_a"), sep("mask_b"), sep("mask_c")
    w = {}
    for key in WEIGHTS:
        v = nt.nodes.new("ShaderNodeValue")
        v.name = f"w_{key}"
        w[key] = v.outputs[0]

    def math(op, x, y):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        for sock, val in ((n.inputs[0], x), (n.inputs[1], y)):
            if isinstance(val, float):
                sock.default_value = val
            else:
                nt.links.new(val, sock)
        return n.outputs[0]

    def mix(fac, col_a, col_b):
        n = nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        nt.links.new(fac, _sock(n, "Factor_Float"))
        for ident, col in (("A_Color", col_a), ("B_Color", col_b)):
            if isinstance(col, tuple):
                _sock(n, ident).default_value = (*col, 1)
            else:
                nt.links.new(col, _sock(n, ident))
        return _sock(n, "Result_Color", outputs=True)

    neo = math("MAXIMUM", math("MAXIMUM", math("MULTIPLY", w["spring"], a.outputs[0]), math("MULTIPLY", w["steamer"], a.outputs[1])), math("MULTIPLY", w["vest"], b.outputs[0]))
    fabric = math("MAXIMUM", math("MULTIPLY", w["bottoms"], b.outputs[1]), math("MULTIPLY", w["top"], c.outputs[0]))
    under = math("MULTIPLY", w["boardies"], c.outputs[1])
    col = mix(math("GREATER_THAN", fabric, 0.5), tuple(preset["preview"]["skin"]), tuple(preset["preview"]["fabric"]))
    col = mix(math("GREATER_THAN", under, 0.5), col, tuple(preset["preview"]["boardies"]))
    col = mix(math("GREATER_THAN", neo, 0.5), col, (0.02, 0.02, 0.025))
    nt.links.new(col, bsdf.inputs["Base Color"])


def dress(parts, preset, outfit):
    body = parts[0]
    mat = body.material_slots[0].material
    if "w_spring" not in mat.node_tree.nodes:
        _body_material(mat, preset)
    for key in WEIGHTS:
        mat.node_tree.nodes[f"w_{key}"].outputs[0].default_value = float(OUTFITS[outfit][key])
    for p in parts[1:]:
        if p.name.endswith("_boardies"):
            p.hide_render = outfit != "boardies"
            p.material_slots[0].material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*preset["preview"]["boardies"], 1)
        elif p.name.endswith("_hair"):
            p.material_slots[0].material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*preset["preview"]["hair"], 1)
```

- [ ] **Step 7: Rebuild and test**

Run: `npm run build:surfers && npx vitest run src/surfer/manifest.test.ts && npm test && npm run typecheck`. Expected:
all PASS.

If `TEXCOORD_1–3` are missing, this Blender's glTF exporter drops UV maps no material uses. The preview material in
Step 6 uses all three through UV Map nodes, so in that case check that `export.glb` runs *after* `previews.dress` has
built the material at least once. That means moving the `export.*` calls below the outfit loop in `build.py`.

Look at every sheet in `tools/surfer/previews/` myself. Fix anything plainly broken before gate 1:
- a mask edge that cuts across the body wrongly;
- hair floating off the scalp;
- boardies poking through;
- eyes outside the sockets.

- [ ] **Step 8: Write `public/surfer/LICENSES.md`**

```markdown
# Surfer assets: sources and licences

| Asset | Source | Licence |
|---|---|---|
| Body meshes and skin weights (`female.glb`, `male.glb`) | Generated with MPFB <version from api-probe.txt> (MakeHuman) in Blender <version>, then reshaped and re-rigged by `tools/surfer/` | CC0 1.0: MakeHuman's base mesh, targets and exported characters are CC0 (https://static.makehumancommunity.org/about/license.html; closed-source use: https://static.makehumancommunity.org/mpfb/faq/use_in_closed_source.html) |
| Hair cards, eyes, boardies, wardrobe masks | Generated by `tools/surfer/hair.py` and `wardrobe.py` (this project) | This project's own |
| Hair strands, skin, neoprene and fabric shading | Procedural shaders in `src/surfer/surferShading.ts` (this project); no texture files | This project's own |
| Boards and swim fins | Generated by `src/board/` (this project) | This project's own |

MPFB's source code is GPL. It is a build tool only and is not shipped; the GPL does not reach the characters it exports.
```

- [ ] **Step 9: Commit**

```bash
git add tools/surfer public/surfer src/surfer/manifest.test.ts
git commit -m "feat(surfer): wardrobe masks, boardies, hair cards and eyes in the build; licences recorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: GATE 1: Andrew signs off the bodies

- [ ] **Step 1:** Send Andrew every sheet in `tools/surfer/previews/` (SendUserFile, one message). The sheets are:
  - `female-clay`, `female-bikini`, `female-vestAndBottoms`, `female-shortArmSteamer`;
  - `male-clay`, `male-boardies`, `male-springsuit`, `male-shortArmSteamer`.

  Ask him for:
  - build, proportions and age: do they read as late teens who paddle?
  - hair;
  - the cut of each outfit.
- [ ] **Step 2: STOP.** Wait for his reply. Make each change he asks for in the preset JSON or the build scripts,
  rebuild, re-run `npm test`, and send the changed sheets. Repeat until he signs off.
- [ ] **Step 3:** Commit any changes: `fix(surfer): the bodies after Andrew's gate-1 review`, with the attribution
  line. Record the sign-off in the commit message.

---

### Task 10: The surfer in the game

**Files:**
- Create: `src/board/swimFinGeometry.ts`, `src/surfer/surferShading.ts`, `src/surfer/Surfer.ts`,
  `src/surfer/surfer.selftest.ts`
- Modify: `src/dev/selfTests.ts`
- Test: `src/board/swimFinGeometry.test.ts`

**Interfaces:**
- Consumes:
  - `extrudePolygon`, `newBuilder`, `finish`, `PART` (Task 1); `toGeometry` (Task 2); `litColor` (Task 2)
  - `PRESETS`, `SurferPreset`, `Outfit` (Task 3); `outfitMasks` (Task 3)
  - `BONES`, `BoneName`, `restFromManifest`, `SurferManifest`, `SkeletonRest`, `measures` (Tasks 4, 7)
  - `SolvedPose` (Task 5)
- Produces:
  - `buildSwimFin(): MeshArrays`
  - `class Surfer`:
    - `static load(preset, sky, sunVisibility?): Promise<Surfer>`
    - `group: THREE.Group`, `rest: SkeletonRest`, `preset: SurferPreset`
    - `setOutfit(o: Outfit)`, `setSwimFins(on)`, `applyPose(p: SolvedPose)`
    - `boneWorldPosition(b, out): Vector3`

- [ ] **Step 1: Write the failing swim-fin test**

```ts
// src/board/swimFinGeometry.test.ts
import { describe, expect, it } from 'vitest';
import { meshVolume, openEdges } from './boardGeometry';
import { buildSwimFin } from './swimFinGeometry';

describe('swim fin', () => {
  const f = buildSwimFin();
  it('is closed, flat (thickness along y) and about 48 cm long, heel to tip', () => {
    expect(openEdges(f.indices)).toBe(0);
    expect(meshVolume(f.positions, f.indices)).toBeGreaterThan(0);
    const ys: number[] = [], zs: number[] = [];
    for (let i = 0; i < f.positions.length; i += 3) { ys.push(f.positions[i + 1]); zs.push(f.positions[i + 2]); }
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.024, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.48, 6);
  });
});
```

Run `npx vitest run src/board/swimFinGeometry.test.ts`. Expected: FAIL.

- [ ] **Step 2: Write `src/board/swimFinGeometry.ts`**

```ts
import { type MeshArrays, PART, extrudePolygon, finish, newBuilder } from './boardGeometry';

/**
 * A bodyboarder's swim fin (spec §4.3), in the character's rest frame at the ankle: a foot pocket from the heel
 * (6 cm behind the ankle) to the toes, and a blade 22 cm past them; thickness along y, pointing +z.
 */
export function buildSwimFin(): MeshArrays {
  const b = newBuilder();
  const outline: [number, number][] = [[-0.05, -0.06], [0.05, -0.06], [0.055, 0.2], [0.095, 0.42], [-0.095, 0.42], [-0.055, 0.2]];
  // Polygon in (x, forward); a +90° turn about x lays it flat: (x, y, z) → (x, -z, y).
  extrudePolygon(b, outline, 0.012, PART.fin, (x, y, z) => [x, -z, y]);
  return finish(b);
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Write `src/surfer/surferShading.ts`**

```ts
import * as THREE from 'three/webgpu';
import { abs, attribute, float, max, mix, mx_noise_float, normalWorld, pow, smoothstep, step, uniform, uv, vec3 } from 'three/tsl';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import type { SurferPreset } from './presets';
import type { OutfitMasks } from './wardrobe';

type N = any;
const rgb = (c: [number, number, number]): N => vec3(...c);

export type OutfitUniforms = { [K in keyof OutfitMasks]: THREE.UniformNode<'float', number> };
export const outfitUniforms = (): OutfitUniforms => ({ spring: uniform(0), steamer: uniform(0), vest: uniform(0), bottoms: uniform(0), top: uniform(0), boardies: uniform(0) });

/** Skin, with the outfit's baked masks painting neoprene, fabric and the boardies' shadow over it (spec §4.3–4.4). */
export function bodyMaterial(sky: Sky, p: SurferPreset, w: OutfitUniforms, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const mA: N = attribute('uv1', 'vec2'), mB: N = attribute('uv2', 'vec2'), mC: N = attribute('uv3', 'vec2');
  const neo = max(max(w.spring.mul(mA.x), w.steamer.mul(mA.y)), w.vest.mul(mB.x));
  const fabric = max(w.bottoms.mul(mB.y), w.top.mul(mC.x));
  const inNeo = step(0.5, neo), inFabric = step(0.5, fabric), inUnder = step(0.5, w.boardies.mul(mC.y));
  const hem = inNeo.mul(float(1).sub(step(0.72, neo)));
  const skin = rgb(p.skin).mul(1 - 0.3 * p.tan);
  let albedo: N = mix(skin, rgb(p.fabric), inFabric);
  albedo = mix(albedo, rgb(p.boardies), inUnder);
  albedo = mix(albedo, vec3(0.025, 0.025, 0.03), inNeo);
  albedo = mix(albedo, rgb(p.neopreneAccent), hem);
  const specular = mix(mix(float(0.028), float(0.03), inFabric), float(0.04), inNeo);
  const shininess = mix(mix(float(60), float(25), inFabric), float(18), inNeo);
  const wrap = mix(float(0.3), float(0.05), max(inNeo, inFabric));
  m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular, shininess, wrap }, sv);
  return m;
}

/** Wet hair on cards (spec §4.2): strands drawn from the card's UVs, bleached toward the tips, alpha-tested. */
export function hairMaterial(sky: Sky, p: SurferPreset, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const u: N = uv();
  const strands = mx_noise_float(vec3(u.x.mul(40.0), u.y.mul(2.5), 1.7)).mul(0.5).add(0.5);
  const middle = float(1).sub(abs(u.x.mul(2).sub(1)));
  const tip = smoothstep(0.55, 1.0, u.y);
  m.opacityNode = strands.mul(0.6).add(middle.mul(0.7)).sub(tip.mul(0.6));
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  const albedo = mix(rgb(p.hairRoot), rgb(p.hairTip), pow(u.y, 1.5)).mul(strands.mul(0.3).add(0.7)).mul(0.6); // wet: darker
  m.colorNode = litColor(sky, { albedo, normal: normalWorld, specular: float(0.035), shininess: float(90), wrap: float(0.2) }, sv);
  return m;
}

export function eyesMaterial(sky: Sky, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = litColor(sky, { albedo: vec3(0.03, 0.022, 0.018), normal: normalWorld, specular: float(0.04), shininess: float(200) }, sv);
  return m;
}

export function fabricMaterial(sky: Sky, color: [number, number, number], sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.DoubleSide;
  m.colorNode = litColor(sky, { albedo: rgb(color), normal: normalWorld, specular: float(0.03), shininess: float(20), wrap: float(0.1) }, sv);
  return m;
}
```

- [ ] **Step 4: Write `src/surfer/Surfer.ts`**

```ts
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toGeometry } from '../board/BoardMesh';
import { buildSwimFin } from '../board/swimFinGeometry';
import type { Sky } from '../sky/Sky';
import type { Outfit, SurferPreset } from './presets';
import { BONES, type BoneName, type SkeletonRest, type SurferManifest, restFromManifest } from './rig';
import type { SolvedPose } from './solvePose';
import { type OutfitUniforms, bodyMaterial, eyesMaterial, fabricMaterial, hairMaterial, outfitUniforms } from './surferShading';
import { outfitMasks } from './wardrobe';

type N = any;

/** One loaded surfer (spec §3.2): the skinned body, its materials, and the pose applied to its bones. */
export class Surfer {
  readonly group = new THREE.Group();
  readonly rest: SkeletonRest;
  private readonly bones = {} as Record<BoneName, THREE.Bone>;
  private readonly outfit: OutfitUniforms = outfitUniforms();
  private readonly fins: THREE.Mesh[] = [];
  private boardies: THREE.Object3D | null = null;

  static async load(preset: SurferPreset, sky: Sky, sunVisibility?: (xz: N) => N): Promise<Surfer> {
    const base = import.meta.env.BASE_URL;
    const [gltf, manifest] = await Promise.all([
      new GLTFLoader().loadAsync(base + preset.glbUrl),
      fetch(base + preset.manifestUrl).then((r) => {
        if (!r.ok) throw new Error(`${preset.manifestUrl}: HTTP ${r.status}`);
        return r.json() as Promise<SurferManifest>;
      }),
    ]);
    return new Surfer(gltf.scene, manifest, preset, sky, sunVisibility);
  }

  private constructor(scene: THREE.Object3D, manifest: SurferManifest, readonly preset: SurferPreset, sky: Sky, sv?: (xz: N) => N) {
    this.group.add(scene);
    this.group.updateMatrixWorld(true);
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && (BONES as readonly string[]).includes(o.name)) this.bones[o.name as BoneName] = o as THREE.Bone;
    });
    const missing = BONES.filter((b) => !this.bones[b]);
    if (missing.length) throw new Error(`${preset.glbUrl} lacks bones ${missing.join(', ')}`);
    const restQ = {} as Record<BoneName, THREE.Quaternion>;
    for (const b of BONES) restQ[b] = this.bones[b].getWorldQuaternion(new THREE.Quaternion());
    this.rest = restFromManifest(manifest, restQ);
    const materials: Record<string, () => THREE.Material> = {
      body: () => bodyMaterial(sky, preset, this.outfit, sv),
      hair: () => hairMaterial(sky, preset, sv),
      eyes: () => eyesMaterial(sky, sv),
      boardies: () => fabricMaterial(sky, preset.boardies, sv),
    };
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material).name;
      const make = materials[name];
      if (!make) throw new Error(`${preset.glbUrl}: unexpected material "${name}"`);
      mesh.material = make();
      mesh.frustumCulled = false;
      if (name === 'boardies') this.boardies = mesh;
    });
    // Swim fins ride the feet: placed in the rest pose at the sole, then held in each foot bone's frame.
    const finGeo = toGeometry(buildSwimFin());
    const finMat = fabricMaterial(sky, [0.03, 0.03, 0.035], sv);
    for (const s of ['l', 'r'] as const) {
      const foot = this.bones[`foot_${s}`];
      const ankle = this.rest.joint[`foot_${s}`];
      const fin = new THREE.Mesh(finGeo, finMat);
      const world = new THREE.Matrix4().makeTranslation(ankle.x, 0.012, ankle.z);
      fin.matrix.copy(foot.matrixWorld.clone().invert().multiply(world));
      fin.matrixAutoUpdate = false;
      fin.visible = false;
      fin.frustumCulled = false;
      foot.add(fin);
      this.fins.push(fin);
    }
  }

  setOutfit(o: Outfit): void {
    const m = outfitMasks(o);
    for (const k of Object.keys(m) as (keyof typeof m)[]) this.outfit[k].value = m[k];
    if (this.boardies) this.boardies.visible = o === 'boardies';
  }

  setSwimFins(on: boolean): void {
    for (const f of this.fins) f.visible = on;
  }

  /** The solver's rotations onto the bones; the pelvis also moves (its parent, root, stays at rest at the origin). */
  applyPose(p: SolvedPose): void {
    for (const b of BONES) if (b !== 'root') this.bones[b].quaternion.copy(p.local[b]);
    this.bones.pelvis.position.copy(p.pelvisWorld.clone().sub(p.joint.root).applyQuaternion(p.world.root.clone().invert()));
  }

  boneWorldPosition(b: BoneName, out: THREE.Vector3): THREE.Vector3 {
    return this.bones[b].getWorldPosition(out);
  }
}
```

(`restQ` from `getWorldQuaternion` is the bone's rest orientation. The group sits at the world origin, and the solver
works in world space, so the solver's `world` rotations are the bones' world rotations.)

- [ ] **Step 5: Write `src/surfer/surfer.selftest.ts`**

```ts
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
```

Add `import '../surfer/surfer.selftest';` to `src/dev/selfTests.ts`.

- [ ] **Step 6: Typecheck, test, and run the self-tests**

Run: `npm run typecheck && npm test`. Expected: clean, all PASS.
Open `http://localhost:5173/?selftest=surfer`. Expected: 2/2 passed. Rest joints must be under 1 mm (the manifest and
the .glb agree) and the posed feet under 1 cm (the local-rotation conversion is right on real bones).

- [ ] **Step 7: Commit**

```bash
git add src/board/swimFinGeometry.ts src/board/swimFinGeometry.test.ts src/surfer/surferShading.ts src/surfer/Surfer.ts src/surfer/surfer.selftest.ts src/dev/selfTests.ts
git commit -m "feat(surfer): the surfer in the game: skinned body, wardrobe masks, wet skin and hair, swim fins, posed bones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The stand

**Files:**
- Create: `src/surfer/surferLoader.ts`, `src/surfer/placement.ts`, `src/surfer/SurferStand.ts`
- Modify: `src/dev/devSettings.ts`, `src/dev/DevPanel.ts`, `src/dev/momentLink.ts`, `src/app/App.ts`
- Test: `src/surfer/surferLoader.test.ts`, `src/surfer/placement.test.ts`; add to `src/dev/momentLink.test.ts` and
  `src/dev/DevPanel.test.ts`

**Interfaces:**
- Consumes: everything above, plus `HeightProbe` (`setProbe(i, x, z)`, `heightAt(i)`; slots 1–4 are free),
  `CameraPose`, and `lookDirection` conventions.
- Produces:
  - `class KeyedLoader<K, T>`: `constructor(load, onError)`, `get(key): T | null`
  - From `placement.ts`: `STAND_PROBE_FIRST = 1`, `SINK_M = 0.03`, `headingAxes(deg)`, `probePoints(p, halfLen, halfWidth)`,
    `boardFrameFrom(p, halfLen, halfWidth, heights, fallbackY): BoardFrame`, `chaseCamera(frame, headingDeg): CameraPose`,
    `placeAhead(camera: CameraPose)`
  - `class SurferStand`: `group`, `status: { outfit: string }`, `update(p, simTime, dateISO, seed, probe, tideM)`,
    `chasePose(headingDeg): CameraPose | null`
  - `Moment.surfer?: SurferParams`

- [ ] **Step 1: Write the failing tests**

```ts
// src/surfer/surferLoader.test.ts
import { describe, expect, it, vi } from 'vitest';
import { KeyedLoader } from './surferLoader';

const deferred = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

describe('KeyedLoader', () => {
  it('shows only the preset asked for, never a stale one (Review Focus 4)', async () => {
    const f = deferred<string>(), m = deferred<string>();
    const loader = new KeyedLoader<string, string>((k) => (k === 'female' ? f.promise : m.promise), () => {});
    expect(loader.get('female')).toBeNull();
    expect(loader.get('male')).toBeNull();
    f.resolve('F');
    await f.promise;
    expect(loader.get('male')).toBeNull();
    m.resolve('M');
    await m.promise;
    expect(loader.get('male')).toBe('M');
    expect(loader.get('female')).toBe('F');
  });
  it('loads each key once, and after a failure warns once and never retries (Review Focus 1)', async () => {
    const load = vi.fn(() => Promise.reject(new Error('404')));
    const onError = vi.fn();
    const loader = new KeyedLoader<string, string>(load, onError);
    for (let i = 0; i < 5; i++) expect(loader.get('male')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 5; i++) expect(loader.get('male')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
```

```ts
// src/surfer/placement.test.ts
import { describe, expect, it } from 'vitest';
import { SINK_M, boardFrameFrom, chaseCamera, placeAhead, probePoints } from './placement';

const P = { x: 10, z: -5, headingDeg: 90, heightNudgeM: 0, pitchNudgeDeg: 0 };

describe('the stand’s placement', () => {
  it('points the nose along the compass heading (90° = east = +x) and sits on flat water', () => {
    const f = boardFrameFrom(P, 0.9, 0.25, [0.4, 0.4, 0.4, 0.4], 0);
    expect(f.forward.x).toBeCloseTo(1, 9);
    expect(f.up.y).toBeCloseTo(1, 9);
    expect(f.position.y).toBeCloseTo(0.4 - SINK_M, 9);
  });
  it('pitches with the water under nose and tail, and tilts away from the higher rail', () => {
    const f = boardFrameFrom({ ...P, headingDeg: 0 }, 0.9, 0.25, [0.6, 0.2, 0.5, 0.3], 0);
    expect(f.forward.y).toBeGreaterThan(0);
    expect(f.up.x).toBeLessThan(0); // heading north, the right rail is east (+x) and higher
  });
  it('sits on the tide, finite, until the probe has read back (Review Focus 2)', () => {
    const f = boardFrameFrom(P, 0.9, 0.25, [null, null, null, null], 0.7);
    expect(f.position.y).toBeCloseTo(0.7 - SINK_M, 9);
    expect([f.forward, f.up, f.position].flatMap((v) => [v.x, v.y, v.z]).every(Number.isFinite)).toBe(true);
  });
  it('probes the nose, tail and both rails', () => {
    const pts = probePoints({ ...P, headingDeg: 0 }, 1, 0.25);
    expect(pts[0][1]).toBeLessThan(-5); // nose to the north (−z)
    expect(pts[2][0]).toBeGreaterThan(10); // right rail to the east
  });
  it('puts the chase camera behind and above, looking along the heading', () => {
    const cam = chaseCamera(boardFrameFrom(P, 0.9, 0.25, [0, 0, 0, 0], 0), 90);
    expect(cam.mode).toBe('free');
    expect(cam.position[0]).toBeLessThan(10);
    expect(cam.position[1]).toBeGreaterThan(1);
    expect(cam.yawDeg).toBe(90);
  });
  it('places the board 6 m ahead of the camera, nose along its view', () => {
    expect(placeAhead({ mode: 'free', position: [0, 3, 0], yawDeg: 90, pitchDeg: -10 })).toEqual({ x: 6, z: 0, headingDeg: 90 });
  });
});
```

Add to `src/dev/momentLink.test.ts`:

```ts
import { DEFAULT_SURFER_PARAMS } from '../surfer/surferParams';

describe('the surfer in a moment link', () => {
  const base = decodeMoment(encodeMoment({ conditions: DEFAULT_CONDITIONS, camera: { mode: 'free', position: [1, 2, 3], yawDeg: 90, pitchDeg: 0 }, simTime: 5, paused: true }))!;
  it('round-trips the surfer settings', () => {
    const surfer = { ...DEFAULT_SURFER_PARAMS, enabled: true, preset: 'male' as const, pose: 'barrel' as const, x: 12 };
    expect(decodeMoment(encodeMoment({ ...base, surfer }))!.surfer).toEqual(surfer);
  });
  it('leaves an older link without one (the app then turns the surfer off)', () => expect(base.surfer).toBeUndefined());
  it('repairs a hand-edited surfer instead of rejecting the link (Review Focus 3)', () => {
    const raw = { v: 1, ...base, surfer: { enabled: true, pose: 'dropKnee', board: 'thruster', x: 'far' } };
    const hash = `#m=${btoa(JSON.stringify(raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    const m = decodeMoment(hash)!;
    expect(m.surfer!.pose).toBe('sit');
    expect(m.surfer!.x).toBe(DEFAULT_SURFER_PARAMS.x);
  });
});
```

(Reuse the imports the file already has for `decodeMoment`, `encodeMoment` and `DEFAULT_CONDITIONS`; add any that are
missing.)

Add to `src/dev/DevPanel.test.ts`:

```ts
import { SURFER_PARAM_RANGES } from '../surfer/surferParams';
import { SURFER_BINDINGS } from './DevPanel';

describe('Surfer folder bindings', () => {
  it('match normalizeSurferParams’s ranges exactly', () => {
    for (const k of Object.keys(SURFER_PARAM_RANGES) as (keyof typeof SURFER_PARAM_RANGES)[]) {
      expect(SURFER_BINDINGS[k].min).toBe(SURFER_PARAM_RANGES[k].min);
      expect(SURFER_BINDINGS[k].max).toBe(SURFER_PARAM_RANGES[k].max);
    }
  });
});
```

(Merge the new names into the file's existing import lines rather than adding duplicate `import` statements.)

Run `npx vitest run src/surfer src/dev`. Expected: FAIL on the new tests.

- [ ] **Step 2: Write `src/surfer/surferLoader.ts`**

```ts
/**
 * Loads by key, once each. `get` is polled every frame: it returns the value once that key has loaded, null while it
 * loads, and null for good after a failure (reported once to onError, never retried). A slow earlier key can't show
 * in place of a newer one, because the caller asks by the key it wants now.
 */
export class KeyedLoader<K, T> {
  private readonly done = new Map<K, T>();
  private readonly loading = new Set<K>();
  private readonly failed = new Set<K>();

  constructor(private readonly load: (key: K) => Promise<T>, private readonly onError: (key: K, e: unknown) => void) {}

  get(key: K): T | null {
    const hit = this.done.get(key);
    if (hit !== undefined) return hit;
    if (this.loading.has(key) || this.failed.has(key)) return null;
    this.loading.add(key);
    this.load(key).then(
      (v) => { this.done.set(key, v); this.loading.delete(key); },
      (e) => { this.failed.add(key); this.loading.delete(key); this.onError(key, e); },
    );
    return null;
  }
}
```

- [ ] **Step 3: Write `src/surfer/placement.ts`**

```ts
import { Vector3 } from 'three/webgpu';
import type { CameraPose } from '../dev/momentLink';
import type { BoardFrame } from './solvePose';

/** HeightProbe slots the stand uses: 1–4 (slot 0 is the camera's). */
export const STAND_PROBE_FIRST = 1;
/** How far a board with a rider sits into the water. */
export const SINK_M = 0.03;
const DEG = Math.PI / 180;
const CHASE_BACK_M = 4.5, CHASE_UP_M = 1.8;

export interface Placement {
  x: number;
  z: number;
  headingDeg: number;
  heightNudgeM: number;
  pitchNudgeDeg: number;
}

/** Compass heading → the nose's and the right rail's horizontal directions (north = −z, east = +x). */
export function headingAxes(deg: number): { fwd: [number, number]; right: [number, number] } {
  const h = deg * DEG;
  return { fwd: [Math.sin(h), -Math.cos(h)], right: [Math.cos(h), Math.sin(h)] };
}

/** Where to read the water: nose, tail (80% of the way out), right rail, left rail. */
export function probePoints(p: Placement, halfLen: number, halfWidth: number): [number, number][] {
  const { fwd, right } = headingAxes(p.headingDeg), l = 0.8 * halfLen;
  return [
    [p.x + fwd[0] * l, p.z + fwd[1] * l], [p.x - fwd[0] * l, p.z - fwd[1] * l],
    [p.x + right[0] * halfWidth, p.z + right[1] * halfWidth], [p.x - right[0] * halfWidth, p.z - right[1] * halfWidth],
  ];
}

/** The board on the water (spec §6): pitched by nose vs tail, rolled by the rails; the tide until the probe reads. */
export function boardFrameFrom(p: Placement, halfLen: number, halfWidth: number, heights: readonly (number | null)[], fallbackY: number): BoardFrame {
  const h = [0, 1, 2, 3].map((i) => heights[i] ?? fallbackY);
  const pitch = Math.atan2(h[0] - h[1], 1.6 * halfLen) + p.pitchNudgeDeg * DEG;
  const roll = Math.atan2(h[2] - h[3], 2 * halfWidth);
  const { fwd, right } = headingAxes(p.headingDeg);
  const forward = new Vector3(fwd[0] * Math.cos(pitch), Math.sin(pitch), fwd[1] * Math.cos(pitch));
  const right3 = new Vector3(right[0] * Math.cos(roll), Math.sin(roll), right[1] * Math.cos(roll));
  const up = new Vector3().crossVectors(right3, forward).normalize();
  const y = (h[0] + h[1] + h[2] + h[3]) / 4 - SINK_M + p.heightNudgeM;
  return { position: new Vector3(p.x, y, p.z), forward, up };
}

/** A rough chase view (spec §6): behind and above the board, looking along its heading at the rider's chest. */
export function chaseCamera(frame: BoardFrame, headingDeg: number): CameraPose {
  const { fwd } = headingAxes(headingDeg);
  const pos: [number, number, number] = [frame.position.x - fwd[0] * CHASE_BACK_M, frame.position.y + CHASE_UP_M, frame.position.z - fwd[1] * CHASE_BACK_M];
  return { mode: 'free', position: pos, yawDeg: headingDeg, pitchDeg: -Math.atan2(CHASE_UP_M - 1.0, CHASE_BACK_M) / DEG };
}

export function placeAhead(c: CameraPose): { x: number; z: number; headingDeg: number } {
  const { fwd } = headingAxes(c.yawDeg);
  return { x: Math.round((c.position[0] + fwd[0] * 6) * 1e6) / 1e6, z: Math.round((c.position[2] + fwd[1] * 6) * 1e6) / 1e6, headingDeg: c.yawDeg };
}
```

- [ ] **Step 4: Write `src/surfer/SurferStand.ts`**

```ts
import * as THREE from 'three/webgpu';
import { float, normalWorld, vec3 } from 'three/tsl';
import { BoardMesh } from '../board/BoardMesh';
import { deckYAt, halfWidthAt, layoutFor, uAt } from '../board/boardSpec';
import type { CameraPose } from '../dev/momentLink';
import type { HeightProbe } from '../ocean/HeightProbe';
import { litColor } from '../render/litSurface';
import type { Sky } from '../sky/Sky';
import { balanceAt } from './balance';
import { LEASH_POINTS, LEASH_SIDES, leashCurve, tubeIndices, tubePositions } from './leash';
import { STAND_PROBE_FIRST, boardFrameFrom, chaseCamera, probePoints } from './placement';
import { poseTargets } from './poses';
import { PRESETS, type PresetName, boardFor, boardLookFor } from './presets';
import { POSE_PHASE, POSE_ZONE, type RideState } from './rideState';
import { type BoardFrame, boardQuaternion, solvePose } from './solvePose';
import { Surfer } from './Surfer';
import type { SurferParams } from './surferParams';
import { KeyedLoader } from './surferLoader';
import { OUTFIT_LABELS, outfitFor } from './wardrobe';

type N = any;
const DEG = Math.PI / 180;

/** The stand (spec §6): the chosen surfer on the chosen board, on the water at a chosen spot, in the chosen pose. */
export class SurferStand {
  readonly group = new THREE.Group();
  readonly status = { outfit: '' };
  private readonly board: BoardMesh;
  private readonly leash: THREE.Mesh;
  private readonly leashPos = new Float32Array((LEASH_POINTS + 1) * LEASH_SIDES * 3);
  private readonly loader: KeyedLoader<PresetName, Surfer>;
  private surfer: Surfer | null = null;
  private frame: BoardFrame | null = null;
  private heights: number[] = [];
  private lastT = Number.NaN;
  private heave = 0;

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    this.board = new BoardMesh(sky, sunVisibility);
    this.group.add(this.board.mesh);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.leashPos, 3));
    g.setIndex(new THREE.BufferAttribute(tubeIndices(LEASH_POINTS + 1, LEASH_SIDES), 1));
    const m = new THREE.MeshBasicNodeMaterial();
    m.side = THREE.DoubleSide;
    m.colorNode = litColor(sky, { albedo: vec3(0.03, 0.03, 0.035), normal: normalWorld, specular: float(0.04), shininess: float(30) }, sunVisibility);
    this.leash = new THREE.Mesh(g, m);
    this.leash.frustumCulled = false;
    this.group.add(this.leash);
    this.loader = new KeyedLoader((name) => Surfer.load(PRESETS[name], sky, sunVisibility), (name, e) => console.warn(`The ${name} surfer failed to load; the stand shows the board only.`, e));
    this.group.visible = false;
  }

  update(p: SurferParams, simTime: number, dateISO: string, seed: number, probe: HeightProbe, tideM: number): void {
    this.group.visible = p.enabled;
    if (!p.enabled) return;
    const preset = PRESETS[p.preset], spec = boardFor(preset, p.board), layout = layoutFor(spec, preset.heightM);
    this.board.setBoard(spec, boardLookFor(preset, p.board));
    const halfLen = spec.lengthM / 2, halfWidth = spec.maxWidthM / 2;
    probePoints(p, halfLen, halfWidth).forEach(([x, z], i) => probe.setProbe(STAND_PROBE_FIRST + i, x, z));
    const frame = boardFrameFrom(p, halfLen, halfWidth, [0, 1, 2, 3].map((i) => probe.heightAt(STAND_PROBE_FIRST + i)), tideM);
    this.frame = frame;
    this.trackHeave(frame.position.y, simTime);
    const Qb = boardQuaternion(frame);
    this.board.mesh.position.copy(frame.position);
    this.board.mesh.quaternion.copy(Qb);

    const s = this.loader.get(p.preset);
    if (s !== this.surfer) {
      if (this.surfer) this.group.remove(this.surfer.group);
      this.surfer = s;
      if (s) this.group.add(s.group);
    }
    this.leash.visible = s !== null;
    if (!s) return;
    const outfit = outfitFor(preset, p.outfit, dateISO);
    s.setOutfit(outfit);
    s.setSwimFins(p.board === 'bodyboard');
    this.status.outfit = OUTFIT_LABELS[outfit];

    const bal = p.balance ? balanceAt(seed, simTime, p.balanceAmount, this.heave) : null;
    const dials = { compression: p.compression + (bal?.compression ?? 0), lean: p.lean, twist: p.twist, reach: p.reach };
    const t = poseTargets(p.pose, { spec, layout, rest: s.rest, stance: p.stance, dials, phaseT: p.phaseT });
    if (bal) {
      const lead = p.stance === 'regular' ? 'l' : 'r', trail = lead === 'l' ? 'r' : 'l';
      t.hands[lead].pos.add(bal.lead);
      t.hands[trail].pos.add(bal.trail);
    }
    const state: RideState = {
      board: frame, speedMs: 0, railAngleRad: p.lean * 35 * DEG, compression: dials.compression,
      zone: POSE_ZONE[p.pose], phase: POSE_PHASE[p.pose], phaseT: p.phaseT,
      lookAt: frame.position.clone().add(t.look.clone().normalize().multiplyScalar(10).applyQuaternion(Qb)),
    };
    const solved = solvePose(s.rest, t, state.board, state.lookAt);
    s.applyPose(solved);

    // The leash: board frame for the drape, back to world for the tube.
    const inv = Qb.clone().invert();
    const toBoard = (v: THREE.Vector3): THREE.Vector3 => v.clone().sub(frame.position).applyQuaternion(inv);
    const trail = p.stance === 'regular' ? 'r' : 'l';
    const end = p.board === 'bodyboard' ? solved.joint.upperarm_r.clone().lerp(solved.joint.forearm_r, 0.5) : solved.joint[`foot_${trail}`];
    const deck = (x: number, z: number): number | null => (Math.abs(x) <= halfLen && Math.abs(z) <= halfWidthAt(spec, uAt(spec, x)) ? deckYAt(spec, x, z) : null);
    const pts = leashCurve(toBoard(end), new THREE.Vector3(...layout.leashPlug), layout.leashLengthM, deck)
      .map((q) => q.applyQuaternion(Qb).add(frame.position));
    tubePositions(pts, 0.0035, LEASH_SIDES, this.leashPos);
    (this.leash.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  chasePose(headingDeg: number): CameraPose | null {
    return this.frame ? chaseCamera(this.frame, headingDeg) : null;
  }

  /** The board's vertical acceleration (smoothed) for the balance layer's knees; 0 while paused or after a jump. */
  private trackHeave(y: number, t: number): void {
    const dt = t - this.lastT;
    this.lastT = t;
    if (!(dt > 1e-4 && dt < 0.5)) {
      this.heights = [y];
      this.heave = 0;
      return;
    }
    this.heights = [...this.heights.slice(-2), y];
    if (this.heights.length === 3) {
      const [a, b, c] = this.heights;
      this.heave += 0.2 * ((c - 2 * b + a) / (dt * dt) - this.heave);
    }
  }
}
```

- [ ] **Step 4b: The surfer's contact shadow on the board (spec §6)**

In `src/board/BoardMesh.ts`:
- add `exp`, `dot` and `positionLocal` to the `three/tsl` import;
- add the field
  `private readonly contacts = Array.from({ length: 6 }, () => uniform(new THREE.Vector4(0, -10, 0, 0.001)));`;
- in the constructor, just before `const shininess = …`, add:

```ts
    // Contact shadow: the deck darkens under the feet, hands and body (board-frame points, radius in w), fading as the
    // point rises off the deck.
    const local: N = positionLocal;
    let shade: N = float(1);
    for (const c of this.contacts) {
      const d = local.xz.sub(c.xz);
      const near = exp(dot(d, d).div(c.w.mul(c.w)).negate());
      const low = float(1).sub(smoothstep(0.0, 0.3, c.y.sub(local.y)));
      shade = shade.mul(float(1).sub(near.mul(low).mul(0.55)));
    }
    albedo = albedo.mul(mix(float(1), shade, isDeck));
```

and add the method:

```ts
  /** Up to six board-frame points (x, y, z) with radii (m) that shade the deck beneath them; the rest are cleared. */
  setContacts(points: readonly { x: number; y: number; z: number; r: number }[]): void {
    this.contacts.forEach((u, i) => {
      const p = points[i];
      u.value.set(p ? p.x : 0, p ? p.y : -10, p ? p.z : 0, p ? p.r : 0.001);
    });
  }
```

In `SurferStand.update`, right after `s.applyPose(solved);`, add:

```ts
    const contact = (b: keyof typeof solved.joint, r: number) => {
      const q = solved.joint[b].clone().sub(frame.position).applyQuaternion(Qb.clone().invert());
      return { x: q.x, y: q.y, z: q.z, r };
    };
    this.board.setContacts([contact('foot_l', 0.09), contact('foot_r', 0.09), contact('pelvis', 0.16), contact('spine_03', 0.16), contact('hand_l', 0.05), contact('hand_r', 0.05)]);
```

After `if (!s) return;`'s check, clear them when no surfer shows: change `if (!s) return;` to
`if (!s) { this.board.setContacts([]); return; }`.

- [ ] **Step 5: Persist the params, and carry them in moment links**
  1. In `src/dev/devSettings.ts`:
     - import `type SurferParams` from `'../surfer/surferParams'`;
     - add `surfer: SurferParams;` to `DevLookParams`;
     - add `'surfer'` to the end of `LOOK_KEYS`.
  2. In `src/dev/momentLink.ts`:
     - import `{ type SurferParams, sanitizeSurferParams }` from `'../surfer/surferParams'`;
     - add `surfer?: SurferParams;` to `Moment`, with a comment: an optional field, so `MOMENT_VERSION` stays 1 and
       every older link still opens (the spec's §6 asked for a version bump, but the parser rejects any other version,
       which would break every saved link: ruling);
     - in `parseMomentLink`'s returned object, add
       `...(o.surfer !== undefined ? { surfer: sanitizeSurferParams(o.surfer) } : {}),`.

- [ ] **Step 6: The Surfer folder in `src/dev/DevPanel.ts`**
  1. Imports: `import { SURFER_PARAM_RANGES, type SurferParams } from '../surfer/surferParams';` and
     `import { ALL_POSES } from '../surfer/poseNames';`.
  2. `DevPanelModel`: add `surfer: SurferParams;` and `surferStatus: { outfit: string };`.
  3. `DevPanelHandlers`: add `onSurfer(): void;`, `onSurferPlaceAhead(): void;` and `onSurferChase(): void;`.
  4. Next to `BOMBIE_BINDINGS`, add:

```ts
/** Surfer folder sliders (spec §6), ranges exactly normalizeSurferParams's (DevPanel.test.ts). */
export const SURFER_BINDINGS = {
  phaseT: { label: 'phase', ...SURFER_PARAM_RANGES.phaseT, step: 0.01 },
  compression: { label: 'compression', ...SURFER_PARAM_RANGES.compression, step: 0.01 },
  lean: { label: 'lean (heels … toes)', ...SURFER_PARAM_RANGES.lean, step: 0.01 },
  twist: { label: 'twist', ...SURFER_PARAM_RANGES.twist, step: 0.01 },
  reach: { label: 'reach', ...SURFER_PARAM_RANGES.reach, step: 0.01 },
  balanceAmount: { label: 'balance amount', ...SURFER_PARAM_RANGES.balanceAmount, step: 0.05 },
  x: { label: 'x (m)', ...SURFER_PARAM_RANGES.x, step: 0.1 },
  z: { label: 'z (m)', ...SURFER_PARAM_RANGES.z, step: 0.1 },
  heightNudgeM: { label: 'height nudge (m)', ...SURFER_PARAM_RANGES.heightNudgeM, step: 0.01 },
  pitchNudgeDeg: { label: 'pitch nudge (°)', ...SURFER_PARAM_RANGES.pitchNudgeDeg, step: 0.5 },
} as const;
const SURFER_OPTIONS = {
  preset: { female: 'female', male: 'male' },
  stance: { regular: 'regular', goofy: 'goofy' },
  board: { thruster: 'thruster', 'step-up': 'stepUp', bodyboard: 'bodyboard' },
  outfit: { season: 'season', boardies: 'boardies', bikini: 'bikini', springsuit: 'springsuit', 'bikini bottoms + vest': 'vestAndBottoms', 'short-arm steamer': 'shortArmSteamer' },
  pose: Object.fromEntries(ALL_POSES.map((p) => [p, p])),
};
```

  5. After the Bombie folder, add:

```ts
    const surferFolder = this.pane.addFolder({ title: 'Surfer', expanded: false });
    surferFolder.addBinding(m.surfer, 'enabled', { label: 'surfer' }).on('change', h.onSurfer);
    for (const key of ['preset', 'stance', 'board', 'outfit', 'pose'] as const) {
      surferFolder.addBinding(m.surfer, key, { label: key, options: SURFER_OPTIONS[key] }).on('change', h.onSurfer);
    }
    readouts.add(surferFolder.addBinding(m.surferStatus, 'outfit', { label: 'wearing', readonly: true, interval: 500 }));
    surferFolder.addBinding(m.surfer, 'headingDeg', { label: 'heading', min: 0, max: 360, format: withCompass }).on('change', h.onSurfer);
    for (const [key, opts] of Object.entries(SURFER_BINDINGS) as [keyof typeof SURFER_BINDINGS, (typeof SURFER_BINDINGS)[keyof typeof SURFER_BINDINGS]][]) {
      surferFolder.addBinding(m.surfer, key, opts).on('change', h.onSurfer);
    }
    surferFolder.addBinding(m.surfer, 'balance', { label: 'balance layer' }).on('change', h.onSurfer);
    surferFolder.addButton({ title: 'Place ahead of camera' }).on('click', h.onSurferPlaceAhead);
    surferFolder.addButton({ title: 'Chase view' }).on('click', h.onSurferChase);
```

- [ ] **Step 7: Wire it into `src/app/App.ts`**
  1. **Imports:**
     - `import { SurferStand } from '../surfer/SurferStand';`
     - `import { DEFAULT_SURFER_PARAMS, type SurferParams, normalizeSurferParams } from '../surfer/surferParams';`
     - `import { placeAhead } from '../surfer/placement';`
  2. **Fields**, beside `bombieParams`:
     - `readonly surferParams: SurferParams = { ...DEFAULT_SURFER_PARAMS };`
     - `readonly surferStand: SurferStand;`
  3. **Constructor:** after `this.rocks = new Rocks(…)`, add
     `this.surferStand = new SurferStand(this.sky, (xz) => this.sunlight.visibilityNode(xz));` and
     `this.scene.add(this.surferStand.group);`.
  4. **Panel model:** add `surfer: this.surferParams, surferStatus: this.surferStand.status`.
  5. **Handlers:**

```ts
        onSurfer: () => {
          normalizeSurferParams(this.surferParams);
          this.panel.refresh();
        },
        onSurferPlaceAhead: () => {
          Object.assign(this.surferParams, placeAhead(this.rig.getPose()));
          this.panel.refresh();
          this.scheduleSave();
        },
        onSurferChase: () => {
          const pose = this.surferStand.chasePose(this.surferParams.headingDeg);
          if (pose) this.rig.setPose(pose);
        },
```

  6. **`lookParams()`:** add `surfer: this.surferParams`.
  7. **Applying the look:** where the look is applied, next to `assignParams(this.bombieParams, look.bombie);`, add
     `assignParams(this.surferParams, look.surfer);`. Next to `normalizeBombieParams(this.bombieParams);` in the same
     method, add `normalizeSurferParams(this.surferParams);`.
  8. **`currentMoment()`:** add `...(this.surferParams.enabled ? { surfer: { ...this.surferParams } } : {})` to the
     returned object.
  9. **`applyMoment(m)`:** before `this.panel.refresh();`, add
     `if (m.surfer) { assignParams(this.surferParams, m.surfer); normalizeSurferParams(this.surferParams); }`.
  10. **`visitLink(m)`:** before `this.applyMoment(m);`, add
      `if (!m.surfer && location.hash.startsWith('#m=')) this.surferParams.enabled = false;` (spec §6: an older link
      opens with the surfer off).
  11. **`frame()`:** just before `const probeXZ = this.rig.probeXZ;`, add
      `this.surferStand.update(this.surferParams, this.clock.simTime, this.conditions.date, this.conditions.seed, this.probe, this.conditions.tideM);`.

- [ ] **Step 8: Run all the tests**

Run: `npm test && npm run typecheck`. Expected: all PASS; clean.

- [ ] **Step 9: See it in the browser and measure it**
  1. Start the dev server. Open the Surfer folder and turn the surfer on. Check:
     - Expected: the female surfer sits on the thruster in the lineup (`sit`), on the water, riding the swell.
     - Press `P` and step through the poses, the boards, both presets and both stances. Expected: no console errors,
       feet on the deck, a soft contact shadow under them, the leash from the back ankle to the tail.
     - Call a set (`N`). When a wave stands up, pause, click "Place ahead of camera", nudge into the pocket, then click
       "Chase view".
  2. Screenshot the lineup and the pocket.
  3. **Performance:** from the chase view, read the GPU ms in the perf overlay with the surfer on and off (same moment,
     paused), three readings each. Record the difference. Expected: ≤ 0.5 ms. If it's more, report it to Andrew with
     the numbers rather than hiding it; the likely costs are the hair's alpha test and the body's shading.

- [ ] **Step 10: Commit**

```bash
git add src/surfer/surferLoader.ts src/surfer/placement.ts src/surfer/SurferStand.ts src/surfer/*.test.ts src/dev src/app/App.ts
git commit -m "feat(surfer): the stand: the Surfer folder places, dresses and poses the surfer on the water; links carry it

GPU cost at the chase distance: <measured> ms.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: GATE 2: the poses by eye

- [ ] **Step 1:** Ask Andrew for his reference shots (spec §7): a backside pig-dog at a slab, a frontside pit, a
  drop-knee, a pop-up, and sitting in the lineup (plus any others he wants). They go in `reference/surfer/`
  (git-ignored).
- [ ] **Step 2:** For each board, both stances and every pose, take a stand screenshot from the chase view, and one
  side-on. Save them to `reference/surfer/gate2/` (private) and send them to Andrew with his references alongside.
- [ ] **Step 3: STOP.** Wait for his notes. Tune the pose constants in `src/surfer/poses.ts` (never the tests'
  tolerances), re-run `npx vitest run src/surfer`, re-screenshot, and send again. Repeat until he signs off.
- [ ] **Step 4:** Commit the tuning: `tune(surfer): the key poses after Andrew's gate-2 review`, with the attribution
  line.

---

### Task 13: Reference moments, docs, and the final check

**Files:**
- Modify: `src/dev/referenceMoments.ts`, `README.md`,
  `docs/superpowers/specs/2026-09-30-surfer-on-the-stand-design.md` (status line)

- [ ] **Step 1: Add the stand's reference moments**

Add three `set`-kind reference moments, each carrying a `surfer`, from the placements found at gate 2:
- `surfer-lineup-sit`
- `surfer-pocket-pigdog` (regular, step-up)
- `surfer-pocket-frontside` (goofy, thruster)

Use the same pattern as the Bombie ones: sim times found in the browser, with a comment saying so. Extend the existing
`referenceMoments.test.ts` pattern so every reference moment's `surfer`, where present, equals
`sanitizeSurferParams(itself)`.

- [ ] **Step 2: Update `README.md`**

Add:
- a line under "What's in it": the surfers and boards, on the stand for now;
- a **Surfer** entry in "The dev panel", listing the folder's controls and the two buttons;
- a sentence pointing to `tools/surfer/README.md` for rebuilding the bodies.

- [ ] **Step 3: Update the spec's status**

Update the spec's status line: "Built 2026-MM-DD; gates 1 and 2 signed off by Andrew."

- [ ] **Step 4: Run the full check**

Run: `npm test && npm run typecheck && npm run build`. Expected: all PASS, and the build succeeds.
Then open `?selftest=` (all). Expected: every self-test passes.

- [ ] **Step 5: Commit**

```bash
git add src/dev/referenceMoments.ts src/dev/referenceMoments.test.ts README.md docs/superpowers/specs/2026-09-30-surfer-on-the-stand-design.md
git commit -m "docs(surfer): reference moments on the stand, README, spec status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6:** Invoke superpowers:finishing-a-development-branch. Merge or push only as Andrew says.
