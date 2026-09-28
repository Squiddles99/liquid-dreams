# Phase 4c-1: On the Beach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand on the Womb's beach. A walking camera; a fine 64 m ground patch at 25 cm that follows you; procedural 3D limestone rocks where 4a's cover says rock, with grounding shadows on the patch.

**Architecture:** Pure CPU modules in `src/beach/`, each tested:
- the walking step;
- the patch's grids and tracking;
- the rocks' shapes, placement and tops;
- the grounding-shadow raster.

The GPU side:
- `GroundPatch` (a grid mesh displaced from a 1 m height texture plus procedural detail);
- `Rocks` (eight instanced meshes);
- the land material, generalised so its cover can come from textures, with a discard square for the coarse mesh.

The camera rig gains a `walk` mode fed by a `Ground` interface from the App.

**Tech Stack:** TypeScript (tsgo 7), three.js 0.186.1 WebGPU + TSL, vitest 5, the in-browser GPU self-tests.

**Spec:** `docs/superpowers/specs/2026-09-28-on-the-beach-design.md` (approved by Andrew 2026-09-28)

## Global Constraints

- **Walking:**
  - eye 1.7 m; speed 1.4 m/s, Shift ×3; spring ω = 10;
  - wading limit: still water ≤ 1.2 m over the ground; refused steps slide along the axis that stays legal;
  - `C` cycles lineup → free → walk → lineup; free → walk only if the ground below is standable (else lineup).
- **The patch:**
  - 64 m, 0.25 m cells (257 × 257), snapped to 4 m, refreshed after an 8 m move;
  - height grid 65 × 65 at 1 m (`heightAt`); cover grids from `coverAt`;
  - skirt 0.5 m; detail fades within 4 m of the edge;
  - visible in walk mode or when the camera is within 3 m of the ground;
  - the coarse land discards inside the square less 0.5 m.
- **Rocks:**
  - eight shapes (icosphere subdivision 3, ridged displacement, pitting, flat bottom 20%, vertical squash 0.55–0.8);
  - 4 m cells within 260 m, 2 candidates per cell, kept with probability rock weight × `rock density`;
  - the kinds:
    - toe (toe band): 1–3 m, rust to ochre;
    - face: 0.5–1.5 m, grey by `rockGrey`;
    - shore (weed > 0.5): 0.6–1.8 m, weed-green;
  - sink 15–30% of height; full within 150 m, shrinking to 0 by 250 m;
  - top = an ellipsoid cap.
- **Shadows:**
  - 256 × 256 at 0.25 m over the patch square; refresh on recentre or a 0.5° sun move;
  - contact ring within 1.3 R;
  - sun shadow length min(h / tan(elevation), 12 m); none with the sun below 1°;
  - patch sun × (1 − shadow), sky × (1 − 0.5·ring).
- **Limits:** ≤ 8 storage buffers, ≤ 16 sampled textures, ≤ 12 uniform buffers per stage.
- **Cost:**
  - patch ≤ 0.5 ms GPU; rocks ≤ 0.5 ms GPU;
  - patch refresh ≤ 3 ms CPU; rock cells ≤ 1 ms CPU per moving frame.
- **Repo rules:**
  - `reference/` is never committed;
  - stage files by path;
  - never commit `.superpowers/`;
  - every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - branch `phase-4c1-on-the-beach`; push; **do not merge** without Andrew.

## Review Focus

1. **The land not loaded yet (or failed):** `C` skips walk mode, the patch and the rocks stay hidden, and nothing throws. Pinned in Task 1 (no ground → the cycle skips walk) and Task 5 (the App guards).
2. **Walking off the land's extent or the data's edge** (15 km along the coast, or far inland): the ground height stays finite and walking continues or stops cleanly. Pinned in Task 1 (a ground returning a finite value at the edge; NaN guarded).
3. **Tide changes while standing in the swash:** the wading limit follows the tide, and if the water rises past 1.2 m you're not trapped (you can still walk to shallower ground). Pinned in Task 1 (a step toward shallower water is always allowed).
4. **Moment links and reference picks into walk mode before the land loads:** the pose falls back to free at that position, and becomes walk once the land is ready. Pinned in Task 1 (setPose walk without ground → free).
5. **Rock density 0 or 2, and edits while walking:** the rock cache rebuilds and the ground height follows the new rocks, with no stale rock to stand on. Pinned in Task 2 (density scaling) and Task 5 (clear on edit).

---

## File structure

| File | Responsibility |
|---|---|
| `src/beach/walk.ts` (+test) | `WALK`, `Ground`, `WalkState`, `canStand`, `initialWalkState`, `stepWalk`. |
| `src/camera/CameraRig.ts`, `src/dev/momentLink.ts` (+tests) | The walk mode. |
| `src/beach/rocks.ts` (+test) | Rock shapes, cell placement, the rock cache, rock tops, the distance scale. |
| `src/beach/rockShadows.ts` (+test) | The grounding-shadow raster. |
| `src/beach/groundPatch.ts` (+test) | Patch constants, the tracker, the CPU grids, visibility. |
| `src/land/landShading.ts` | Cover from textures; the discard square; patch shadows and detail. |
| `src/beach/GroundPatch.ts` | The patch mesh, textures and material. |
| `src/beach/Rocks.ts` | The instanced meshes and the rock material. |
| `src/beach/beach.selftest.ts` | GPU self-tests. |
| `src/app/App.ts`, `src/land/landParams.ts`, `src/dev/DevPanel.ts`, `src/dev/referenceMoments.ts` | Wiring, rock density, the moment. |

---

### Task 1: Walking (the step, the rig, links)

**Files:**
- Create: `src/beach/walk.ts`, `src/beach/walk.test.ts`
- Modify: `src/camera/CameraRig.ts`, `src/camera/CameraRig.test.ts`, `src/dev/momentLink.ts`, `src/dev/momentLink.test.ts`

**Interfaces:**
- Produces:
  - `WALK = { eyeHeightM: 1.7, speedMs: 1.4, runMultiplier: 3, springOmega: 10, wadeLimitM: 1.2 }`;
  - `interface Ground { groundAt(x: number, z: number): number; waterLevel(): number }`;
  - `WalkState { x; z; look; height: SpringState }`;
  - `canStand(g, x, z)`, `initialWalkState(x, z, look, g)`, `stepWalk(s, keys, g, dt)`;
  - `CameraMode` gains `'walk'`;
  - `CameraRig.setGround(g: Ground | null)`, `CameraRig.groundAt(x, z): number` (NaN without ground), `CameraRig.cycleMode(waterHeight)`.

- [ ] **Step 1: Write the failing tests.**

`src/beach/walk.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_KEYS } from '../camera/movement';
import { type Ground, WALK, canStand, initialWalkState, stepWalk } from './walk';

/** A beach rising 0.1 m per m east of x = 0 (the waterline), with a 1 m rock at (10, 0); still water at level 0. */
const beach = (level = 0): Ground => ({
  groundAt: (x, z) => Math.max(0.1 * x, Math.hypot(x - 10, z) < 1 ? 1 + 0.1 * x : -Infinity),
  waterLevel: () => level,
});
const look = { yawDeg: 90, pitchDeg: 0 }; // facing east (+x)
const settle = (s: ReturnType<typeof initialWalkState>, g: Ground, keys = NO_KEYS, n = 200) => {
  for (let i = 0; i < n; i++) s = stepWalk(s, keys, g, 1 / 60);
  return s;
};

describe('walking', () => {
  it('stands 1.7 m above the ground and follows it', () => {
    const g = beach();
    const s = settle(initialWalkState(5, 3, look, g), g);
    expect(s.height.value).toBeCloseTo(0.5 + WALK.eyeHeightM, 2);
  });
  it('walks at 1.4 m/s, three times that running', () => {
    const g = beach();
    const walk = settle(initialWalkState(2, 3, look, g), g, { ...NO_KEYS, forward: true }, 60);
    expect(walk.x - 2).toBeCloseTo(1.4, 1);
    const run = settle(initialWalkState(2, 3, look, g), g, { ...NO_KEYS, forward: true, fast: true }, 60);
    expect(run.x - 2).toBeCloseTo(4.2, 1);
  });
  it('steps up onto a rock', () => {
    const g = beach();
    const s = settle(initialWalkState(10, 0, look, g), g);
    expect(s.height.value).toBeCloseTo(2 + WALK.eyeHeightM, 2);
  });
  it('refuses water deeper than 1.2 m and slides along the edge', () => {
    const g = beach();
    expect(canStand(g, -11, 0)).toBe(true); // 1.1 m deep
    expect(canStand(g, -13, 0)).toBe(false); // 1.3 m deep
    const facingSea = { yawDeg: 225, pitchDeg: 0 }; // south-west: toward deep water and along the beach
    const s = settle(initialWalkState(-11.9, 0, facingSea, g), g, { ...NO_KEYS, forward: true }, 60);
    expect(s.x).toBeGreaterThanOrEqual(-12.0001);
    expect(s.z).toBeGreaterThan(0.5); // it slid along +z (south)
  });
  it('a rising tide never traps you: a step toward shallower ground is always allowed', () => {
    const g = beach(1.5); // the tide rose: you're now 2.6 m deep at x = −11
    const s = settle(initialWalkState(-11, 0, look, g), g, { ...NO_KEYS, forward: true }, 60);
    expect(s.x).toBeGreaterThan(-11);
  });
  it('a non-finite ground reads as unstandable, never NaN in the state', () => {
    const g: Ground = { groundAt: () => Number.NaN, waterLevel: () => 0 };
    expect(canStand(g, 0, 0)).toBe(false);
    const s = settle(initialWalkState(0, 0, look, beach()), g, { ...NO_KEYS, forward: true }, 10);
    expect(Number.isFinite(s.x) && Number.isFinite(s.height.value)).toBe(true);
  });
});
```

Append to `src/camera/CameraRig.test.ts` (add imports: `Ground` from `../beach/walk`, and `NO_KEYS` if missing; the file has an `Input` stub or constructs states directly. If `update()` needs an `Input`, drive the mode switch through `setPose` and the public `cycleMode(water)` introduced below):

```ts
describe('the walk mode', () => {
  const ground: Ground = { groundAt: (x) => 0.1 * x, waterLevel: () => 0 };
  it('cycles lineup → free → walk → lineup, skipping walk without ground or over deep water', () => {
    const rig = new CameraRig();
    rig.setPose({ mode: 'free', position: [20, 10, 0], yawDeg: 90, pitchDeg: 0 });
    rig.cycleMode(0);
    expect(rig.mode).toBe('lineup'); // no ground yet
    rig.setGround(ground);
    rig.setPose({ mode: 'free', position: [20, 10, 0], yawDeg: 90, pitchDeg: 0 });
    rig.cycleMode(0);
    expect(rig.mode).toBe('walk');
    expect(rig.getPose().position[1]).toBeCloseTo(2 + 1.7, 1);
    rig.cycleMode(0);
    expect(rig.mode).toBe('lineup');
    rig.setPose({ mode: 'free', position: [-50, 10, 0], yawDeg: 90, pitchDeg: 0 }); // 5 m deep below
    rig.cycleMode(0);
    expect(rig.mode).toBe('lineup');
  });
  it('a walk pose without ground falls back to free at that position', () => {
    const rig = new CameraRig();
    rig.setPose({ mode: 'walk', position: [20, 3.7, 0], yawDeg: 90, pitchDeg: 0 });
    expect(rig.mode).toBe('free');
    expect(rig.getPose().position).toEqual([20, 3.7, 0]);
  });
});
```

Append to `src/dev/momentLink.test.ts`: a walk pose round-trips through `encodeMoment`/`decodeMoment`, and `parseCameraPose` accepts `mode: 'walk'`.

- [ ] **Step 2: Run them.** Expected: FAIL (the module, `cycleMode`, `setGround` and `'walk'` don't exist).

- [ ] **Step 3: Implement.**

`src/beach/walk.ts`:

```ts
import { type SpringState, stepCriticalSpring } from '../camera/floatSpring';
import type { Look } from '../camera/look';
import { type MoveKeys, planarMoveXZ } from '../camera/movement';

/** Standing on the beach (spec 2026-09-28-on-the-beach-design.md §3.1). */
export const WALK = { eyeHeightM: 1.7, speedMs: 1.4, runMultiplier: 3, springOmega: 10, wadeLimitM: 1.2 } as const;

/** Where you can stand: the ground's height (the land, the seabed, the rock tops) and the still water's level. */
export interface Ground {
  groundAt(x: number, z: number): number;
  waterLevel(): number;
}

export interface WalkState {
  x: number;
  z: number;
  look: Look;
  height: SpringState;
}

const depthAt = (g: Ground, x: number, z: number): number => g.waterLevel() - g.groundAt(x, z);

/** Standable: finite ground, still water over it at most the wading limit. */
export function canStand(g: Ground, x: number, z: number): boolean {
  const d = depthAt(g, x, z);
  return Number.isFinite(d) && d <= WALK.wadeLimitM;
}

export function initialWalkState(x: number, z: number, look: Look, g: Ground): WalkState {
  const ground = g.groundAt(x, z);
  return { x, z, look, height: { value: (Number.isFinite(ground) ? ground : 0) + WALK.eyeHeightM, velocity: 0 } };
}

/**
 * One frame of walking: move at WALK.speedMs (× runMultiplier with the fast key) where the step stays standable, else
 * slide along whichever axis does; a step to shallower water is always allowed (a rising tide never traps you). The eye
 * follows the ground through a critical spring.
 */
export function stepWalk(s: WalkState, keys: MoveKeys, g: Ground, dt: number): WalkState {
  const m = planarMoveXZ(s.look.yawDeg, keys, WALK.speedMs * (keys.fast ? WALK.runMultiplier : 1) * dt);
  const here = depthAt(g, s.x, s.z);
  const ok = (x: number, z: number): boolean => {
    const d = depthAt(g, x, z);
    return Number.isFinite(d) && (d <= WALK.wadeLimitM || (Number.isFinite(here) && d < here));
  };
  let x = s.x, z = s.z;
  if (ok(s.x + m.x, s.z + m.z)) { x += m.x; z += m.z; }
  else if (ok(s.x + m.x, s.z)) x += m.x;
  else if (ok(s.x, s.z + m.z)) z += m.z;
  const ground = g.groundAt(x, z);
  const target = (Number.isFinite(ground) ? ground : s.height.value - WALK.eyeHeightM) + WALK.eyeHeightM;
  return { ...s, x, z, height: stepCriticalSpring(s.height, target, WALK.springOmega, dt) };
}
```

`momentLink.ts`: `export type CameraMode = 'lineup' | 'free' | 'walk';` and `parseCameraPose` accepts `'walk'`.

`CameraRig.ts`:
- `private walk: WalkState | null = null; private ground: Ground | null = null;`
- `setGround(g: Ground | null): void { this.ground = g; if (!g && this.mode === 'walk') { /* leave walk: to free at the current pose */ const p = this.getPose(); this.free = { ...this.free, position: p.position, look: { yawDeg: p.yawDeg, pitchDeg: p.pitchDeg } }; this.mode = 'free'; } }`
- `groundAt(x: number, z: number): number { return this.ground ? this.ground.groundAt(x, z) : Number.NaN; }`
- `probeXZ`: walk returns the walk's x, z.
- `setPose` for `'walk'`:

```ts
    else if (p.mode === 'walk') {
      if (this.ground) { this.walk = initialWalkState(p.position[0], p.position[2], look, this.ground); this.mode = 'walk'; }
      else { this.free = { ...this.free, position: [...p.position], look }; this.mode = 'free'; }
    }
```

  (Restructure the method so the mode is set per branch.)
- `getPose` for walk: `{ mode: 'walk', position: [w.x, w.height.value, w.z], yawDeg, pitchDeg }`.
- `update`: when `this.mode === 'walk' && this.walk && this.ground`, run `this.walk = stepWalk({ ...this.walk, look: applyMouseLook(this.walk.look, dx, dy) }, keys, this.ground, dt)`.
- Replace `toggleMode` with a public `cycleMode(waterHeight: number)`, called by `update` on `KeyC`:

```ts
  cycleMode(waterHeight: number): void {
    const p = this.getPose();
    const look = { yawDeg: p.yawDeg, pitchDeg: p.pitchDeg };
    if (this.mode === 'lineup') {
      this.free = { ...this.free, position: p.position, look };
      this.mode = 'free';
    } else if (this.mode === 'free' && this.ground && canStand(this.ground, p.position[0], p.position[2])) {
      this.walk = initialWalkState(p.position[0], p.position[2], look, this.ground);
      this.mode = 'walk';
    } else {
      this.lineup = initialLineupState(p.position[0], p.position[2], look, waterHeight);
      this.mode = 'lineup';
    }
    this.apply();
  }
```

- [ ] **Step 4: Run** `npx vitest run src/beach src/camera src/dev/momentLink.test.ts` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(beach): the walking camera`.

---

### Task 2: Rocks and their shadows (CPU)

**Files:**
- Create: `src/beach/rocks.ts`, `src/beach/rocks.test.ts`, `src/beach/rockShadows.ts`, `src/beach/rockShadows.test.ts`

**Interfaces:**
- Consumes: `LandHeight` (`heightAt`, `waterlineAt`, `profile`), `coverAt` (and its `toeBand`, `weed`, `rockGrey`, `rock` fields).
- Produces:
  - from `rocks.ts`:
    - the constants `ROCK_SHAPES` = 8, `ROCK_CELL_M` = 4, `ROCK_RADIUS_M` = 260, `ROCK_FULL_M` = 150, `ROCK_GONE_M` = 250;
    - `type RockKind = 'toe' | 'face' | 'shore'`;
    - `interface Rock { x; z; y; kind; shape; radius; height; yaw; tiltX; tiltZ; tint: [number, number, number]; topTint: [number, number, number] }`, where y is the base, already sunk (the ground less 15–30% of the height), and height the full height from that base to the top (0.55–0.8 × the width);
    - `ROCK_BAND_M = [-20, 100]`: only cells whose points lie within this range of d (m inland of the waterline) make rocks (spec §3.3: "only the rock bands … produce rocks");
    - `rockShapeGeometry(shape: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array }`, a unit rock (|p| ≈ 1, flattened bottom at y = −0.6);
    - `cellRocks(ci, cj, land, density): Rock[]`;
    - `class RockField { constructor(land, density); near(camX, camZ): Rock[]; topAt(x, z): number (−Infinity where no rock); setDensity(d) }`;
    - `rockScale(distance): number`.
  - from `rockShadows.ts`: `SHADOW_N` = 256, `SHADOW_CELL_M` = 0.25, and `buildRockShadows(rocks, cornerX, cornerZ, sun: readonly [number, number, number]): Float32Array` (2 per texel: sun shadow, contact ring; row-major, texel (i, j) centred at corner + (i + 0.5, j + 0.5)·0.25).

- [ ] **Step 1: Write the failing tests.**

`src/beach/rocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readBakedLand } from '../land/bakedLand.testutil';
import { decodeLandFile } from '../land/landData';
import { LandHeight } from '../land/landHeight';
import { ROCK_GONE_M, ROCK_FULL_M, RockField, cellRocks, rockScale, rockShapeGeometry } from './rocks';

const land = new LandHeight(decodeLandFile(readBakedLand()));

describe('rock shapes', () => {
  it('are closed, roughly unit-sized, flattened underneath, and differ by shape', () => {
    const a = rockShapeGeometry(0), b = rockShapeGeometry(1);
    expect(a.indices.length).toBe(1280 * 3);
    let minY = Infinity, maxR = 0;
    for (let i = 0; i < a.positions.length; i += 3) {
      minY = Math.min(minY, a.positions[i + 1]);
      maxR = Math.max(maxR, Math.hypot(a.positions[i], a.positions[i + 1], a.positions[i + 2]));
    }
    expect(minY).toBeCloseTo(-0.6, 6);
    expect(maxR).toBeLessThan(1.5);
    expect(Array.from(a.positions.slice(0, 30))).not.toEqual(Array.from(b.positions.slice(0, 30)));
  });
});

describe('rock placement', () => {
  it('is deterministic per cell and independent of the camera', () => {
    expect(cellRocks(52, -10, land, 1)).toEqual(cellRocks(52, -10, land, 1));
    const f1 = new RockField(land, 1), f2 = new RockField(land, 1);
    const a = f1.near(210, -40).filter((r) => Math.hypot(r.x - 210, r.z + 40) < 50);
    f2.near(400, 200);
    const b = f2.near(210, -40).filter((r) => Math.hypot(r.x - 210, r.z + 40) < 50);
    expect(a).toEqual(b);
  });
  it('puts rocks where the cover says rock, of the right kind, and none on the open beach or in the heath', () => {
    const rocks = new RockField(land, 1).near(210, -40);
    expect(rocks.length).toBeGreaterThan(50);
    for (const r of rocks) {
      const d = r.x - land.waterlineAt(r.z);
      if (r.kind === 'toe') { expect(d).toBeGreaterThan(36); expect(d).toBeLessThan(60); }
      if (r.kind === 'shore') expect(d).toBeLessThan(10);
      expect(d < 12 || d > 36).toBe(true); // not on the dry beach between the wet band and the toe
      expect(d).toBeGreaterThanOrEqual(-20);
      expect(d).toBeLessThanOrEqual(100); // only the rock bands, not the heath beyond the dune face
    }
    expect(rocks.some((r) => r.kind === 'toe')).toBe(true);
  });
  it('rock density scales the count (0 → none)', () => {
    const n = (d: number) => new RockField(land, d).near(210, -40).length;
    expect(n(0)).toBe(0);
    expect(n(2)).toBeGreaterThan(n(1) * 1.4);
  });
  it('a rock\'s top is highest at its centre and meets the ground at its edge', () => {
    const f = new RockField(land, 1);
    const r = f.near(210, -40).find((q) => q.kind === 'toe')!;
    expect(f.topAt(r.x, r.z)).toBeCloseTo(r.y + r.height, 3);
    expect(f.topAt(r.x + r.radius * 0.999, r.z)).toBeLessThan(r.y + r.height * 0.1);
    expect(f.topAt(r.x + r.radius * 1.5 + 5, r.z + 50)).toBe(-Infinity);
  });
  it('rocks shrink between 150 and 250 m', () => {
    expect(rockScale(ROCK_FULL_M)).toBe(1);
    expect(rockScale(ROCK_GONE_M)).toBe(0);
    expect(rockScale(200)).toBeGreaterThan(0);
    expect(rockScale(200)).toBeLessThan(1);
  });
});
```

`src/beach/rockShadows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Rock } from './rocks';
import { SHADOW_CELL_M, SHADOW_N, buildRockShadows } from './rockShadows';

const rock: Rock = { x: 32, z: 32, y: 0, kind: 'toe', shape: 0, radius: 1.5, height: 1.2, yaw: 0, tiltX: 0, tiltZ: 0, tint: [0.3, 0.2, 0.13], topTint: [0.3, 0.2, 0.13] };
const at = (m: Float32Array, x: number, z: number, ch: 0 | 1) => {
  const i = Math.floor(x / SHADOW_CELL_M), j = Math.floor(z / SHADOW_CELL_M);
  return m[(j * SHADOW_N + i) * 2 + ch];
};
// The sun low in the east (+x), 10° up: shadows fall west (−x).
const e = (10 * Math.PI) / 180;
const sunEast: [number, number, number] = [Math.cos(e), Math.sin(e), 0];

describe('grounding shadows', () => {
  const m = buildRockShadows([rock], 0, 0, sunEast);
  it('shade the ground behind a rock, away from the sun, not in front', () => {
    expect(at(m, 32 - 3, 32, 0)).toBeGreaterThan(0.5);
    expect(at(m, 32 + 3, 32, 0)).toBe(0);
  });
  it('are capped at 12 m long', () => {
    const e3 = (3 * Math.PI) / 180; // 1.2 m / tan 3° = 22.9 m uncapped
    const low = buildRockShadows([rock], 0, 0, [Math.cos(e3), Math.sin(e3), 0]);
    expect(at(low, 32 - 7, 32, 0)).toBeGreaterThan(0.5);
    expect(at(low, 32 - 13.5, 32, 0)).toBe(0);
  });
  it('darken a contact ring, strongest at the base', () => {
    expect(at(m, 32 + rock.radius * 0.9, 32, 1)).toBeGreaterThan(at(m, 32 + rock.radius * 1.25, 32, 1));
    expect(at(m, 32 + rock.radius * 2, 32, 1)).toBe(0);
  });
  it('none with the sun below 1°', () => {
    const night = buildRockShadows([rock], 0, 0, [1, -0.1, 0]);
    expect(Math.max(...Array.from(night).filter((_, i) => i % 2 === 0))).toBe(0);
  });
});
```

- [ ] **Step 2: Run them.** Expected: FAIL (missing modules).

- [ ] **Step 3: Implement** `src/beach/rocks.ts`:

```ts
import { smoothstep } from '../math/smoothstep';
import { coverAt } from '../land/landCover';
import type { LandHeight } from '../land/landHeight';

/** The limestone rocks (spec 2026-09-28-on-the-beach-design.md §3.3). */
export const ROCK_SHAPES = 8;
export const ROCK_CELL_M = 4;
export const ROCK_RADIUS_M = 260;
export const ROCK_FULL_M = 150;
export const ROCK_GONE_M = 250;
export const ROCK_BAND_M = [-20, 100] as const;
const CANDIDATES = 2;

export type RockKind = 'toe' | 'face' | 'shore';

export interface Rock {
  x: number;
  z: number;
  /** The base's height (the ground, less the sinking). */
  y: number;
  kind: RockKind;
  shape: number;
  /** Footprint radius, and the full height from the (sunk) base to the top (m). */
  radius: number;
  height: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  /** The body's colour, and the top's (the shore rocks' weed; the same as the body for the others). */
  tint: [number, number, number];
  topTint: [number, number, number];
}

function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise in [−1, 1]. */
function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t: number) => t * t * (3 - 2 * t);
  const ux = s(fx), uy = s(fy), uz = s(fz);
  const v = (a: number, b: number, c: number) => hash(ix + a + seed * 131, iy + b + seed * 71, iz + c);
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
  const x00 = lerp(v(0, 0, 0), v(1, 0, 0), ux), x10 = lerp(v(0, 1, 0), v(1, 1, 0), ux);
  const x01 = lerp(v(0, 0, 1), v(1, 0, 1), ux), x11 = lerp(v(0, 1, 1), v(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz) * 2 - 1;
}

/** A unit limestone boulder: an icosphere (subdivision 3), ridged and pitted, its bottom flattened at y = −0.6. */
export function rockShapeGeometry(shape: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < 3; s++) {
    const mid = new Map<string, number>();
    const m = (a: number, b: number): number => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let i = mid.get(k);
      if (i === undefined) {
        const p = verts[a].map((v, q) => (v + verts[b][q]) / 2), l = Math.hypot(p[0], p[1], p[2]);
        i = verts.push(p.map((v) => v / l)) - 1;
        mid.set(k, i);
      }
      return i;
    };
    faces = faces.flatMap(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
  }
  verts = verts.map(([x, y, z]) => {
    const ridged = 1 - Math.abs(noise3(x * 1.7, y * 1.7, z * 1.7, shape));
    const r = 1 + 0.22 * (ridged - 0.5) + 0.12 * noise3(x * 4, y * 4, z * 4, shape + 17) - 0.05 * Math.max(0, noise3(x * 9, y * 9, z * 9, shape + 29));
    return [x * r, Math.max(-0.6, y * r), z * r];
  });
  const positions = Float32Array.from(verts.flat());
  const indices = Uint32Array.from(faces.flat());
  const normals = new Float32Array(positions.length);
  for (let f = 0; f < indices.length; f += 3) {
    const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]];
    const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (const v of [a, b, c]) { normals[v * 3] += nx; normals[v * 3 + 1] += ny; normals[v * 3 + 2] += nz; }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l;
  }
  return { positions, normals, indices };
}

const RUST: [number, number, number] = [0.3, 0.2, 0.13];
const OCHRE: [number, number, number] = [0.38, 0.27, 0.15];
const GREY: [number, number, number] = [0.42, 0.4, 0.36];
const WEED: [number, number, number] = [0.1, 0.13, 0.05];
const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The rocks of cell (ci, cj) (4 m cells), from its own hash: the same rocks whatever the camera. */
export function cellRocks(ci: number, cj: number, land: LandHeight, density: number): Rock[] {
  const out: Rock[] = [];
  for (let k = 0; k < CANDIDATES; k++) {
    const r = (q: number) => hash(ci, cj, k * 16 + q);
    const x = (ci + r(0)) * ROCK_CELL_M, z = (cj + r(1)) * ROCK_CELL_M;
    const d = x - land.waterlineAt(z);
    if (d < ROCK_BAND_M[0] || d > ROCK_BAND_M[1]) continue;
    const h = land.heightAt(x, z);
    const slope = 1 - 1 / Math.hypot(1, (land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2, (land.heightAt(x, z + 1) - land.heightAt(x, z - 1)) / 2);
    const c = coverAt(d, slope, x, z, h, land.profile);
    if (r(2) >= c.rock * density) continue;
    const kind: RockKind = c.weed > 0.5 ? 'shore' : c.toeBand > 0.5 ? 'toe' : 'face';
    const [dMin, dMax] = kind === 'toe' ? [1, 3] : kind === 'shore' ? [0.6, 1.8] : [0.5, 1.5];
    const radius = (dMin + (dMax - dMin) * r(3)) / 2;
    const height = radius * 2 * (0.55 + 0.25 * r(4));
    const base = kind === 'toe' ? mix3(RUST, OCHRE, r(5)) : kind === 'shore' ? RUST : mix3(RUST, GREY, Math.max(c.rockGrey, 0.6 + 0.4 * r(5)));
    const vary = 0.8 + 0.2 * r(11);
    const tint = mix3(base, [0, 0, 0], 1 - vary);
    const topTint = kind === 'shore' ? mix3(WEED, RUST, 0.25 * r(5)) : tint;
    const sink = height * (0.15 + 0.15 * r(6));
    out.push({
      x, z, y: h - sink, kind, shape: Math.floor(r(7) * 8) % 8, radius, height,
      yaw: r(8) * Math.PI * 2, tiltX: (r(9) - 0.5) * 0.25, tiltZ: (r(10) - 0.5) * 0.25, tint, topTint,
    });
  }
  return out;
}

export function rockScale(distance: number): number {
  return 1 - smoothstep(ROCK_FULL_M, ROCK_GONE_M, distance);
}

/** The rocks around the camera, cells cached; and the rock tops for standing on. */
export class RockField {
  private readonly cells = new Map<string, Rock[]>();
  private readonly land: LandHeight;
  private density: number;

  constructor(land: LandHeight, density: number) {
    this.land = land;
    this.density = density;
  }

  setDensity(d: number): void {
    if (d !== this.density) { this.density = d; this.cells.clear(); }
  }

  private cell(ci: number, cj: number): Rock[] {
    const key = `${ci},${cj}`;
    let c = this.cells.get(key);
    if (!c) { c = cellRocks(ci, cj, this.land, this.density); this.cells.set(key, c); }
    return c;
  }

  near(camX: number, camZ: number): Rock[] {
    const out: Rock[] = [];
    const n = Math.ceil(ROCK_RADIUS_M / ROCK_CELL_M), ci0 = Math.floor(camX / ROCK_CELL_M), cj0 = Math.floor(camZ / ROCK_CELL_M);
    for (let dj = -n; dj <= n; dj++) {
      for (let di = -n; di <= n; di++) {
        const ci = ci0 + di, cj = cj0 + dj;
        const cx = (ci + 0.5) * ROCK_CELL_M, cz = (cj + 0.5) * ROCK_CELL_M;
        if (Math.hypot(cx - camX, cz - camZ) > ROCK_RADIUS_M) continue;
        // Cells well outside the rock bands are skipped before any height lookup (cellRocks checks each point exactly).
        const d = cx - this.land.waterlineAt(cz);
        if (d < ROCK_BAND_M[0] - ROCK_CELL_M || d > ROCK_BAND_M[1] + ROCK_CELL_M) continue;
        for (const r of this.cell(ci, cj)) out.push(r);
      }
    }
    return out;
  }

  /** The highest rock top at (x, z) (an ellipsoid cap over the footprint), −Infinity where no rock covers it. */
  topAt(x: number, z: number): number {
    let top = -Infinity;
    const ci0 = Math.floor(x / ROCK_CELL_M), cj0 = Math.floor(z / ROCK_CELL_M);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      for (const r of this.cell(ci0 + di, cj0 + dj)) {
        const q = Math.hypot(x - r.x, z - r.z) / r.radius;
        if (q < 1) top = Math.max(top, r.y + r.height * Math.sqrt(1 - q * q));
      }
    }
    return top;
  }
}
```

Performance note: `near()` scans about 13,000 cells in a 260 m radius, but only the band cells (about 30 per 4 m of coast, ~4,000 in all) reach `cellRocks`, each costing about six `heightAt` calls on first visit. Ledger the first-call time; later calls hit the cache. The 4a outcrops on the steep heath beyond 100 m stay painted (4c-2 brings the heath up close).

`src/beach/rockShadows.ts`:

```ts
import { smoothstep } from '../math/smoothstep';
import type { Rock } from './rocks';

/** The grounding shadows on the fine patch (spec §3.4): 256 × 256 at 0.25 m; per texel (sun shadow, contact ring). */
export const SHADOW_N = 256;
export const SHADOW_CELL_M = 0.25;
const MAX_LEN_M = 12;
const MIN_SUN_SIN = Math.sin((1 * Math.PI) / 180);

export function buildRockShadows(rocks: readonly Rock[], cornerX: number, cornerZ: number, sun: readonly [number, number, number]): Float32Array {
  const out = new Float32Array(SHADOW_N * SHADOW_N * 2);
  const horiz = Math.hypot(sun[0], sun[2]);
  const castSun = sun[1] > MIN_SUN_SIN && horiz > 1e-4;
  const dx = castSun ? -sun[0] / horiz : 0, dz = castSun ? -sun[2] / horiz : 0;
  const tanEl = castSun ? sun[1] / horiz : 1;
  for (const r of rocks) {
    const len = castSun ? Math.min(MAX_LEN_M, r.height / tanEl) : 0;
    const ex = r.x + dx * len, ez = r.z + dz * len;
    const pad = r.radius * 1.4;
    const i0 = Math.max(0, Math.floor((Math.min(r.x, ex) - pad - cornerX) / SHADOW_CELL_M));
    const i1 = Math.min(SHADOW_N - 1, Math.ceil((Math.max(r.x, ex) + pad - cornerX) / SHADOW_CELL_M));
    const j0 = Math.max(0, Math.floor((Math.min(r.z, ez) - pad - cornerZ) / SHADOW_CELL_M));
    const j1 = Math.min(SHADOW_N - 1, Math.ceil((Math.max(r.z, ez) + pad - cornerZ) / SHADOW_CELL_M));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = cornerX + (i + 0.5) * SHADOW_CELL_M - r.x, pz = cornerZ + (j + 0.5) * SHADOW_CELL_M - r.z;
        const k = (j * SHADOW_N + i) * 2;
        const dist = Math.hypot(px, pz);
        out[k + 1] = Math.max(out[k + 1], 0.8 * (1 - smoothstep(r.radius * 0.8, r.radius * 1.3, dist)));
        if (len > 0) {
          const t = Math.min(len, Math.max(0, px * dx + pz * dz));
          const qx = px - dx * t, qz = pz - dz * t;
          const w = r.radius * (1 - (0.5 * t) / len);
          const s = (1 - smoothstep(w * 0.7, w * 1.1, Math.hypot(qx, qz))) * (1 - smoothstep(0.7 * len, len, t));
          // Only behind the rock's sunward face: the part of the capsule on the sun side of the centre is the rock itself.
          if (px * dx + pz * dz > -r.radius * 0.2) out[k] = Math.max(out[k], s);
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run** `npx vitest run src/beach` and `npx tsc --noEmit`. Expected: PASS.
  - If the placement test's band bounds disagree with 4a's cover (the toe band's d range, for instance), rule against `coverAt`'s actual bands: the test must match the cover, not the reverse. Ledger it.
  - Ledger the first `near()` time.
- [ ] **Step 5: Commit** `feat(beach): limestone rocks and their grounding shadows (CPU)`.

---

### Task 3: The ground patch (CPU)

**Files:**
- Create: `src/beach/groundPatch.ts`, `src/beach/groundPatch.test.ts`

**Interfaces:**
- Consumes: `LandHeight`, `coverAt`.
- Produces:
  - the constants `PATCH_SIZE_M` = 64, `PATCH_CELL_M` = 0.25, `PATCH_VERTS` = 257, `PATCH_SNAP_M` = 4, `PATCH_REFRESH_M` = 8, `PATCH_GRID_N` = 65, `PATCH_SKIRT_M` = 0.5, `PATCH_FADE_M` = 4, `PATCH_NEAR_M` = 3, `PATCH_HOLE_INSET_M` = 0.5;
  - `patchCentre(x, z): [number, number]`;
  - `class PatchTracker { centre: [number, number] | null; update(x, z): boolean }`;
  - `interface PatchGrids { cornerX; cornerZ; heights: Float32Array; cover: Float32Array; detail: Float32Array; zones: Float32Array }` (the last three with 4 per sample);
  - `buildPatchGrids(land, centre): PatchGrids`;
  - `patchVisible(mode, camY, groundY): boolean`.

- [ ] **Step 1: Write the failing test** (`src/beach/groundPatch.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { coverAt } from '../land/landCover';
import { readBakedLand } from '../land/bakedLand.testutil';
import { decodeLandFile } from '../land/landData';
import { LandHeight } from '../land/landHeight';
import { PATCH_GRID_N, PatchTracker, buildPatchGrids, patchCentre, patchVisible } from './groundPatch';

const land = new LandHeight(decodeLandFile(readBakedLand()));

describe('the ground patch', () => {
  it('snaps to 4 m and recentres only after an 8 m move', () => {
    expect(patchCentre(210.7, -41.9)).toEqual([212, -40]);
    const t = new PatchTracker();
    expect(t.update(210, -40)).toBe(true);
    expect(t.centre).toEqual([212, -40]);
    expect(t.update(219, -40)).toBe(false); // 7 m from the centre
    expect(t.update(221, -40)).toBe(true); // 9 m
    expect(t.centre).toEqual([220, -40]);
  });
  it('its height grid is the land\'s height at 1 m, and its cover grid the land\'s cover', () => {
    const g = buildPatchGrids(land, [212, -40]);
    expect(g.cornerX).toBe(180); expect(g.cornerZ).toBe(-72);
    for (const [i, j] of [[0, 0], [32, 32], [64, 10], [5, 60]]) {
      const x = g.cornerX + i, z = g.cornerZ + j, k = j * PATCH_GRID_N + i;
      expect(g.heights[k]).toBeCloseTo(land.heightAt(x, z), 3); // stored as f32
      const slope = 1 - 1 / Math.hypot(1, (land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2, (land.heightAt(x, z + 1) - land.heightAt(x, z - 1)) / 2);
      const c = coverAt(x - land.waterlineAt(z), slope, x, z, g.heights[k], land.profile);
      expect(g.cover[k * 4 + 3]).toBeCloseTo(c.heath, 5);
      expect(g.detail[k * 4 + 2]).toBeCloseTo(c.weed, 5);
      expect(g.zones[k * 4]).toBeCloseTo(c.toeBand, 5);
    }
  });
  it('shows in walk mode, or when the camera is within 3 m of the ground', () => {
    expect(patchVisible('walk', 100, 0)).toBe(true);
    expect(patchVisible('free', 2.5, 0)).toBe(true);
    expect(patchVisible('free', 30, 0)).toBe(false);
    expect(patchVisible('lineup', 1, Number.NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement** `src/beach/groundPatch.ts`:

```ts
import type { CameraMode } from '../dev/momentLink';
import { coverAt } from '../land/landCover';
import type { LandHeight } from '../land/landHeight';

/** The fine ground at your feet (spec 2026-09-28-on-the-beach-design.md §3.2). */
export const PATCH_SIZE_M = 64;
export const PATCH_CELL_M = 0.25;
export const PATCH_VERTS = 257;
export const PATCH_SNAP_M = 4;
export const PATCH_REFRESH_M = 8;
export const PATCH_GRID_N = 65;
export const PATCH_SKIRT_M = 0.5;
export const PATCH_FADE_M = 4;
export const PATCH_NEAR_M = 3;
export const PATCH_HOLE_INSET_M = 0.5;

export function patchCentre(x: number, z: number): [number, number] {
  return [Math.round(x / PATCH_SNAP_M) * PATCH_SNAP_M, Math.round(z / PATCH_SNAP_M) * PATCH_SNAP_M];
}

export class PatchTracker {
  centre: [number, number] | null = null;
  /** True when the patch must be rebuilt: the first time, or once the camera is PATCH_REFRESH_M from the centre. */
  update(x: number, z: number): boolean {
    if (this.centre && Math.hypot(x - this.centre[0], z - this.centre[1]) < PATCH_REFRESH_M) return false;
    this.centre = patchCentre(x, z);
    return true;
  }
}

export interface PatchGrids {
  cornerX: number;
  cornerZ: number;
  /** Composed land height at 1 m, PATCH_GRID_N² row-major (row = z). */
  heights: Float32Array;
  /** wet, sand, rock, heath per sample. */
  cover: Float32Array;
  /** skyView, rockGrey, weed, 0 per sample. */
  detail: Float32Array;
  /** toeBand, duneBand, clumpRock, bushes per sample. */
  zones: Float32Array;
}

export function buildPatchGrids(land: LandHeight, centre: [number, number]): PatchGrids {
  const n = PATCH_GRID_N, cornerX = centre[0] - PATCH_SIZE_M / 2, cornerZ = centre[1] - PATCH_SIZE_M / 2;
  const heights = new Float32Array(n * n), cover = new Float32Array(n * n * 4), detail = new Float32Array(n * n * 4), zones = new Float32Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = cornerX + i, z = cornerZ + j, k = j * n + i;
      const h = land.heightAt(x, z);
      heights[k] = h;
      const slope = 1 - 1 / Math.hypot(1, (land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2, (land.heightAt(x, z + 1) - land.heightAt(x, z - 1)) / 2);
      const c = coverAt(x - land.waterlineAt(z), slope, x, z, h, land.profile);
      cover.set([c.wet, c.sand, c.rock, c.heath], k * 4);
      detail.set([land.skyViewAt(x, z), c.rockGrey, c.weed, 0], k * 4);
      zones.set([c.toeBand, c.duneBand, c.clumpRock, c.bushes], k * 4);
    }
  }
  return { cornerX, cornerZ, heights, cover, detail, zones };
}

export function patchVisible(mode: CameraMode, camY: number, groundY: number): boolean {
  if (mode === 'walk') return true;
  return Number.isFinite(groundY) && camY - groundY < PATCH_NEAR_M;
}
```

- [ ] **Step 4: Run** it and `npx tsc --noEmit`. Expected: PASS. Ledger `buildPatchGrids`' time (target ≤ 3 ms with the shadows; heights and cover are about 20k `heightAt` calls).
- [ ] **Step 5: Commit** `feat(beach): the ground patch's grids and tracking (CPU)`.

---

### Task 4: The GPU side (land material, patch, rocks)

**Files:**
- Modify: `src/land/landShading.ts`, `src/breaker/BreakingRibbon.limits.test.ts`
- Create: `src/beach/GroundPatch.ts`, `src/beach/Rocks.ts`, `src/beach/beach.selftest.ts`; `src/dev/selfTests.ts` gains the import

**Interfaces:**
- Consumes: Tasks 2 and 3; `createLandLookUniforms`/`LandLookUniforms`; the sunlight map's `visibilityNode`; the wet height.
- Produces:
  - `createLandMaterial(sky, u, opts)`, where `opts` gains:
    - `inputs?: { normal?: N; cover?: N; detail?: N; zones?: N; position?: N }`;
    - `hole?: { centre: UniformNode<vec2>; half: UniformNode<float>; on: UniformNode<float> }`;
    - `patch?: { shadow: (xz: N) => N /* vec2: sun, ring */; ripple: boolean }`;
  - `patchHoleMaskNode(xz, hole): N` (true where the coarse land draws);
  - `class GroundPatch` with `constructor(sky, look, opts: { sunVisibility?: (xz: N) => N; wetHeight?: (xz: N) => N } = {})`, `mesh`, `setGrids(g: PatchGrids)`, `setShadows(s: Float32Array)`, `setVisible(on)`, and `hole` (the uniforms the coarse land reads);
  - `class Rocks` with `constructor(sky, sunVisibility?: (xz: N) => N)`, `meshes: THREE.InstancedMesh[]`, `update(rocks: Rock[], camX, camZ)`.

- [ ] **Step 1: The limits test first.** In the limits test's `describe`:

```ts
  it('the ground patch, the rocks and the land with its hole stay within the limits', () => {
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    const patch = new GroundPatch(sky, createLandLookUniforms(), {});
    const rocks = new Rocks(sky);
    const land = new Land(sky);
    land.setHole(patch.hole);
    for (const w of [renderWgsl(patch.mesh), renderWgsl(rocks.meshes[0] as unknown as THREE.Mesh), renderWgsl(land.mesh)]) {
      for (const stage of [w.vertex, w.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
        expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
      }
    }
  });
```

(Imports: `GroundPatch`, `Rocks`, `createLandLookUniforms`, `Land`. If `renderWgsl` of an empty land geometry fails, give that mesh a small `PlaneGeometry` with `cover`, `detail` and `zones` attributes, as in 4a.) Run it. Expected: FAIL (missing modules).

- [ ] **Step 2: Generalise the land material** (`landShading.ts`):
  - Every `attribute('normal' | 'cover' | 'detail' | 'zones')` becomes `opts.inputs?.X ?? attribute(...)`.
  - When `opts.hole` is set: `m.maskNode = patchHoleMaskNode(positionWorld.xz, opts.hole)`, where

```ts
export function patchHoleMaskNode(xz: N, h: { centre: N; half: N; on: N }): N {
  const d = xz.sub(h.centre).abs();
  const inside = d.x.lessThan(h.half.sub(PATCH_HOLE_INSET_M)).and(d.y.lessThan(h.half.sub(PATCH_HOLE_INSET_M)));
  return inside.and(h.on.greaterThan(0.5)).not();
}
```

  - When `opts.patch` is set: the sun term is multiplied by `(1 − shadow.x)` and the sky term by `(1 − 0.5·shadow.y)` (`shadow = opts.patch.shadow(p.xz)`).
  - Also:
    - the dry-sand colour gains fine grit: `mx_noise_float(vec3(p.x.mul(60), p.z.mul(60), 3.3)).mul(0.04)`;
    - shell flecks: `smoothstep(0.93, 0.97, mx_noise…(×25))` brightening dry sand by 25%;
    - with `ripple: true`, the shading normal gains the ripple slope: `ripple(x, z) = sin(2π·(x + 0.6·noise(x/3, z/3))/0.12)`, whose derivative ∂/∂x times 0.015 × dry-sand share tilts n about z.
    
    Keep all three inside the `fade` (near-camera) factor.
- [ ] **Step 3: `GroundPatch.ts`:**
  - **The geometry:** a PATCH_VERTS² grid in local metres [−32, 32]², plus a skirt ring duplicating the edge vertices with an attribute `skirt` of 1.
  - **Three DataTextures** (65 × 65, RGBA float, NearestFilter): cover, detail, zones; a height DataTexture (65 × 65, Red float, NearestFilter); a shadow DataTexture (256 × 256, RG float, LinearFilter). Uniforms: `centre` (vec2, the patch centre) and `on`.
  - **The height node:** a manual bilinear over the height texture (textureLoad, the same pattern as `SunlightMap`'s march heights), at world xz = local + centre.
  - **Plan ruling (the ripples):** the spec's 12 cm ripples can't be displaced on a 25 cm vertex grid (they'd alias). So the ripples live in the fragment's normal (Step 2's `ripple`, 12 cm apart, 1.5 cm high, crests along the beach, flattened by the wet share), and the vertices carry the larger lumps below. If the ripples read flat in captures, the fallback is a 0.0625 m inner patch of 16 m; ledger it and don't build it unprompted.
  - **The vertex detail**, faded to 0 within 4 m of the edge:
    - dry sand: `0.03 · (mx_noise(x/1.3, z/1.3) − mx_noise(x/0.6, z/0.6)·0.5)`;
    - rock/heath ground: `0.04 · mx_noise(x/0.7, z/0.7)`.
    
    The vertex's y = height + detail − skirt·0.5.
  - **The inputs:**
    - cover, detail and zones from the textures via manual bilinear, like the heights (four `textureLoad`s each: 16 loads per fragment in total, fine);
    - the normal from the height's central differences at 1 m (bilinear), plus the vertex detail's contribution ignored;
    - the fragment's ripple normal adds the detail.
  - **The material:** `createLandMaterial(sky, look, { sunVisibility, wetHeight, inputs, patch: { shadow: (xz) => texture(shadowTex, uv).rg, ripple: true } })`, then `material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1;`.
  - **`hole`:** `{ centre, half: uniform(32), on }`, shared with the coarse land. `setVisible` sets `on` and `mesh.visible`.
  - **`setGrids`** writes the four textures (`needsUpdate`) and `centre`; **`setShadows`** writes the shadow texture.
- [ ] **Step 4: `Rocks.ts`:**
  - **The meshes:** eight `THREE.InstancedMesh(geometry, material, 800)`, each geometry from `rockShapeGeometry(i)`, with `InstancedBufferAttribute`s `rockTint` and `rockTopTint` (vec3, capacity 800).
  - **The material** (`MeshBasicNodeMaterial`, shared):

```ts
    // The top's colour (the shore rocks' weed) over the upper half, the body's beneath (spec §3.3).
    const tint = mix(attribute('rockTint', 'vec3'), attribute('rockTopTint', 'vec3'), smoothstep(0.1, 0.6, positionLocal.y));
    const n = normalize(normalWorld);
    const local = positionLocal;
    const pits = mx_noise_float(local.mul(9.0)).mul(0.5).add(0.5);
    const grain = mx_noise_float(positionWorld.mul(3.0)).mul(0.15).add(0.9);
    const albedo = tint.mul(grain).mul(mix(float(0.7), float(1.0), smoothstep(0.35, 0.6, pits)));
    const baseOcc = smoothstep(-0.6, 0.2, local.y).mul(0.6).add(0.4);
    const l = sky.sunDirection;
    const sunE = sky.sunIlluminance.mul(sunVisibility ? sunVisibility(positionWorld.xz) : float(1.0)).mul(max(dot(n, l), 0.0)).mul(step(0.0, l.y));
    const skyE = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5)).mul(baseOcc);
    const toCam = cameraPosition.sub(positionWorld), dist = length(toCam);
    m.colorNode = sky.applyAerialPerspective(albedo.mul(sunE.add(skyE)).div(PI), dist, toCam.div(max(dist, 1e-3)).negate());
```

  - **`update(rocks, camX, camZ)`:** for each rock, s = `rockScale(distance)`. Skip it if s = 0, or if its shape's mesh is full (800); else write shape `rock.shape`'s next instance:
    - **scale:** (radius·s, scaleY, radius·s) with scaleY = height·s / 1.7 (the unit rock spans y ∈ [−0.6, about 1.1]);
    - **rotation:** yaw about y, then tiltX and tiltZ;
    - **translation:** (x, rock.y + 0.6·scaleY, z), so the flat bottom sits at `rock.y`;
    - the two tints.
    
    Set each mesh's `count`, and `instanceMatrix.needsUpdate` and both tints' `needsUpdate`. Ledger the instance total at `on-the-beach` (the spec expects 1,000–1,500).
  - **The rig's rock tops:** the ellipsoid cap in `rocks.ts` approximates the mesh. Ledger any mismatch you see in the browser.
- [ ] **Step 5: The GPU self-test** (`beach.selftest.ts`):
  - (a) The patch's height node without detail, at sample points, equals the CPU bilinear of the grid, ±1 mm.
  - (b) `patchHoleMaskNode` is false inside the square less 0.5 m and true outside, in a compute pass. Output `select(mask, 1.0, 0.0)`.
  - Register it in `selfTests.ts`.
- [ ] **Step 6: Run** the limits test, the full suite, `npx tsc --noEmit`, and `/?selftest` (50/50). Commit `feat(beach): the ground patch and the rocks on the GPU`.

---

### Task 5: The beach in the App

**Files:**
- Modify: `src/app/App.ts`, `src/land/Land.ts` (`setHole`), `src/land/landParams.ts` (+test), `src/dev/DevPanel.ts` (+test), `src/dev/referenceMoments.ts` (+test)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `Land.setHole(hole)` (rebuilds the material with it);
  - `LandParams.rockDensity` (0–2, default 1);
  - the moment `on-the-beach`.

- [ ] **Step 1: The tests.**
  - `landParams.test.ts`: `rockDensity` is clamped to 0–2 and defaults to 1.
  - `DevPanel.test.ts`: `LAND_BINDINGS.rockDensity` has those bounds. The existing test compares every numeric field.
  - `referenceMoments.test.ts`:
    - `'on-the-beach'` is added to the list;
    - it's `'view'`-kind (add it to the view-kind list if the kinds test needs it);
    - its camera mode is `'walk'`.
  - Run them. Expected: FAIL.
- [ ] **Step 2: Implement.**
  - `landParams.ts`: `rockDensity: 1` in the defaults and `rockDensity: { min: 0, max: 2 }` in the ranges.
  - `DevPanel.ts`: `LAND_BINDINGS.rockDensity: { label: 'rock density', ...LAND_PARAM_RANGES.rockDensity, step: 0.05 }`.
  - `referenceMoments.ts`:

```ts
  ref('on-the-beach', '10:30 standing on the dry sand in front of the Womb, looking north along the beach: the rock clumps at the dune toe, the swash.',
    conditions({ timeOfDay: 10.5 }), { mode: 'walk', position: [210, 4, -40], yawDeg: 0, pitchDeg: -4 }, 'view'),
```

  - `Land.ts`: a `hole` field passed through `rebuildMaterial`, plus `setHole(h)`.
  - `App.ts`:
    - fields: `readonly patch = new GroundPatch(this.sky, …)`, where the land's look uniforms are needed. Expose `Land.look` (make it `readonly look`) and build the patch in the constructor after the land:

```ts
    this.patch = new GroundPatch(this.sky, this.land.look, {
      sunVisibility: (xz) => this.land.sunlight.visibilityNode(xz),
      wetHeight: (xz) => this.seabed.tide.add(this.surf.wetLevelNode(xz.y)),
    });
    this.land.setHole(this.patch.hole);
    this.rocks = new Rocks(this.sky, (xz) => this.land.sunlight.visibilityNode(xz));
    this.scene.add(this.patch.mesh);
    for (const m of this.rocks.meshes) this.scene.add(m);
```

    - fields `private rockField: RockField | null = null; private readonly patchTracker = new PatchTracker(); private shadowSun: [number, number, number] = [0, -1, 0];`;
    - in `onLandBuilt()`:

```ts
    if (this.land.height) {
      const lh = this.land.height;
      this.rockField = new RockField(lh, this.landParams.rockDensity);
      const rf = this.rockField;
      this.rig.setGround({
        groundAt: (x, z) => {
          const d = SHORE_X + this.seabed.shiftAt(z) - x;
          const base = d > 0 ? bedHeightAt(this.seabed.bathymetry, x, z, (zz) => this.seabed.shiftAt(zz)) : lh.heightAt(x, z);
          return Math.max(base, rf.topAt(x, z));
        },
        waterLevel: () => this.conditions.tideM,
      });
      this.patchTracker.centre = null;
    }
```

    - `onLand` additionally calls `this.rockField?.setDensity(this.landParams.rockDensity); this.patchTracker.centre = null;`;
    - in `frame()`, after `this.land.update(...)` (so `this.sunDir` is this frame's):

```ts
    if (this.rockField && this.land.height) {
      const cam = this.camera.position;
      const rocksNear = this.rockField.near(cam.x, cam.z);
      this.rocks.update(rocksNear, cam.x, cam.z);
      const ground = this.rig.groundAt(cam.x, cam.z);
      const show = patchVisible(this.rig.mode, cam.y, ground) && !this.underwater;
      this.patch.setVisible(show);
      if (show) {
        const moved = this.patchTracker.update(cam.x, cam.z);
        const sunMoved = Math.acos(Math.min(1, this.sunDir.x * this.shadowSun[0] + this.sunDir.y * this.shadowSun[1] + this.sunDir.z * this.shadowSun[2])) > (0.5 * Math.PI) / 180;
        if (moved) this.patch.setGrids(buildPatchGrids(this.land.height, this.patchTracker.centre!));
        if (moved || sunMoved) {
          const g = this.patchTracker.centre!;
          this.patch.setShadows(buildRockShadows(rocksNear.filter((r) => Math.abs(r.x - g[0]) < 42 && Math.abs(r.z - g[1]) < 42), g[0] - 32, g[1] - 32, [this.sunDir.x, this.sunDir.y, this.sunDir.z]));
          this.shadowSun = [this.sunDir.x, this.sunDir.y, this.sunDir.z];
        }
      }
    }
```

    (`CameraRig.groundAt` is Task 1's: NaN without ground, so the patch stays hidden.)

    Rocks near the camera are recomputed per frame from the cache. That's cheap after the first visit; if not, cache the list and refresh only when the camera moves 4 m, and ledger it.
- [ ] **Step 3: Run** the full suite and `npx tsc --noEmit`. Expected: green.
- [ ] **Step 4: In the browser (pane visible):**
  - `on-the-beach`: standing on the sand, 1.7 m eye height; the rock clumps at the toe with shadows; the patch's ripples and grit; no seams where the patch meets the coarse land.
  - Walk up to a toe rock and step onto it. Wade into the swash until the 1.2 m limit.
  - `C` cycles the three modes.
  - The lineup view is unchanged.
  - No console errors. Screenshots for the ledger.
- [ ] **Step 5: Commit** `feat(beach): walking on the beach: the patch, the rocks, rock density, the on-the-beach moment`.

---

### Task 6: Measure, gallery, docs

- [ ] **Step 1: Measure** (pane visible):
  - the patch and the rocks' GPU (fenced frames with each hidden vs shown) at `on-the-beach`;
  - the patch refresh's CPU (grids + shadows);
  - `RockField.near` on a moving frame and on first entry.
  
  Ledger all of them against the Global Constraints.
- [ ] **Step 2: Gallery** (`docs/superpowers/gallery/phase-4/on-the-beach/`, via the shot server):
  - `01-on-the-beach.png`;
  - `02-up-the-dune-face.png`: walk mode at the toe, pitch +15;
  - `03-shore-rocks-in-the-swash.png`;
  - `04-morning-rock-shadows.png`: 08:45;
  - `05-lineup-unchanged.png`;
  - `00-sheet.png`.
- [ ] **Step 3: Docs.** The gallery README, and the spec's Status and as-built notes.
- [ ] **Step 4:** Full suite, typecheck, `/?selftest`. Commit `docs(beach): gallery, measured cost, as-built notes` and push. **Do not merge.**
