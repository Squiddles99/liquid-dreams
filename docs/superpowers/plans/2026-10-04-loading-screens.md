# Loading screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every black screen (Electron start-up, Paddle out, Back to the dune) with Andrew's branded logo cover. The game warms up behind it, then it dissolves into the live scene.

**Architecture:** The cover is plain HTML/CSS inlined in `index.html` (`#ld-cover`), so it paints before the game's code
loads. Electron shows its window only on `ready-to-show`, over a sand background. A DOM class (`LoadingScreen`) adopts
that element. It drives a progress bar from five boot stages (pure maths in `loadingProgress.ts`), and dissolves once a
smooth-frames gate opens (pure, `smoothFrames.ts`). Paddle out and Back to the dune reuse the same element through
`cover()` / `release()`.

**Tech Stack:** TypeScript 7, Vite 8, three.js 0.186 (WebGPU), vitest 5 (`environment: 'node'`), in-browser selftests (`?selftest=<filter>`), Electron 44, Python + Pillow (art sizing).

**Spec:** `docs/superpowers/specs/2026-10-04-loading-screens-design.md`

## Global Constraints

- Colours: sand `#e8dbc4` (stand-in until Andrew matches it in Canva; one CSS custom property `--ld-sand`, and the same value in `electron/main.js`), teal `#3f959b`, orange `#f7931e`.
- Stages, in order, with their lines: `gpu` "Waking the GPU…", `world` "Swell rolling in…", `reef` "Laying the reef…", `heath` "Growing the heath…", `crew` "Waking the crew…".
- Smooth-frames gate: 10 frames in a row under 33 ms; one slow frame resets it; it opens anyway 4 s after the work is done.
- Dissolve: opacity 1 → 0 over 1200 ms, `cubic-bezier(0.33, 1, 0.68, 1)`, logo scales 1 → 1.03. With calm menus: 300 ms, no scale.
- Transitions: the UI leaves (180 ms), the cover fades in over 400 ms; minimum 1500 ms on screen once fully in (600 ms with calm menus); no bar; the line pulses in opacity 0.55 ↔ 1 over 1.6 s. Lines: "Paddling out…", "Walking back up the dune…".
- Start-up has no minimum time on screen.
- Bar: creeps within a stage on an ease-out curve reaching ~90% of the stage's span at its expected duration, never passing its end; catches up to a finished stage within 250 ms; never moves backwards.
- No new npm dependencies (zero budget; follow `electron/makeIcons.py`'s Pillow pattern for art).
- Only originals live in `art/loading/`; sized copies are written to `public/loading/` and committed.
- Writing style for comments and commit messages: match the repo (plain sentences, Andrew credited for his rulings).

## Review Focus

1. **A key pressed while the cover is up** (Enter, Space or a pad's A during boot) must not act on the front end underneath. The player would expect nothing to happen until the dune shows. Task 6 tests this.
2. **Start-up without the front end** (a moment link `#m=…`, `?frontend=off`, `?selftest=…`) must not wait forever for a crew that never appears. Moment links dissolve after `heath`; selftests remove the cover at once. Task 6 tests this.
3. **A load that fails** (no WebGPU, `createRenderer` throws, the App constructor or `prewarm` throws) must show the error overlay, not a frozen bar. Task 6 tests this.
4. **The set wave must not run on without the player while Paddle out is covered.** The 1.5 s hold plus the gate could eat seconds of the wave. The sim is paused under the cover and resumes as it dissolves. Task 7 checks this on the live dev page (`paddleHold.js`).
5. **Paddle out pressed again (or Esc) during a transition** must not stack covers or run two transitions at once. `cover()` while a cover is up is refused and returns `false`. Task 5 tests this.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/loadingArt.py` (new) | Sizes `art/loading/` originals into `public/loading/` |
| `public/loading/*` (new, generated) | `photo-1920.webp`, `photo-full.webp`, `logo-emblem.svg`, `logo-wordmark.svg` |
| `index.html` | The cover's markup, its inline CSS, preloads, and a tiny inline script that reveals the art once decoded |
| `src/style.css` | Page background sand instead of black |
| `electron/main.js` | `show: false`, sand `backgroundColor`, show on `ready-to-show`; the probe's black-frame captures, hitches after dissolves, scripted Paddle out / Back |
| `src/app/loadingProgress.ts` (+ `.test.ts`) (new) | Pure: the stage table, the bar's target, the bar follower |
| `src/app/smoothFrames.ts` (+ `.test.ts`) (new) | Pure: the smooth-frames gate and the minimum hold |
| `src/app/loadingScreen.ts` (new) | The `LoadingScreen` class: adopts `#ld-cover`, runs the bar, the dissolve and transitions |
| `src/app/loading.selftest.ts` (new) | Browser checks of `LoadingScreen` against a cloned cover |
| `src/dev/selfTests.ts` | Import the new selftest |
| `src/main.ts` | Adopts the cover, marks `gpu`/`world`/`reef`, failure paths, selftest path, the `?probe` hooks |
| `src/app/App.ts` | Holds the `LoadingScreen`; marks `heath`/`crew`; feeds frame times; arms sound on dissolve; Paddle out and Back to the dune through the cover |
| `src/frontend/frontEndPage.ts` | The `fe-veil` is removed; `inputHeld` drops actions while covered |
| `src/frontend/frontEnd.selftest.ts` | The veil check becomes an `inputHeld` check |
| `src/frontend/entry.ts` | `PADDLE_OUT_MS` gets the new timings |

---

### Task 1: Loading art, sized

**Files:**
- Create: `tools/loadingArt.py`
- Create (generated): `public/loading/photo-1920.webp`, `public/loading/photo-full.webp`, `public/loading/logo-emblem.svg`, `public/loading/logo-wordmark.svg`
- Commit: `art/loading/photo-wide.png`, `art/loading/logo-emblem.svg`, `art/loading/logo-wordmark.svg`

**Interfaces:**
- Produces: the four URLs `/loading/photo-1920.webp`, `/loading/photo-full.webp`, `/loading/logo-emblem.svg`, `/loading/logo-wordmark.svg` (Task 4 references them).

- [ ] **Step 1: Ask Andrew whether `art/loading/photo-wide.png` is his final, largest export**

He said on 2026-10-04 that he would re-export it at Canva's largest size. If he hasn't yet, carry on: the script is rerun when it lands (Step 4).

- [ ] **Step 2: Write the script**

```python
"""Sizes the loading screen's art (art/loading/, Andrew's originals) into public/loading/, which the page loads.

  public/loading/photo-1920.webp   the surf photo at 1920 px wide (1080p and smaller screens)
  public/loading/photo-full.webp   the photo at its own width, capped at 3840 px (1440p and 4K)
  public/loading/logo-*.svg        the emblem and the wordmark, copied as they are

Run with: python tools/loadingArt.py   (rerun whenever art/loading/ changes; the outputs are committed)
"""
import os
import shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "loading")
OUT = os.path.join(ROOT, "public", "loading")
os.makedirs(OUT, exist_ok=True)

photo = Image.open(os.path.join(SRC, "photo-wide.png")).convert("RGB")
w, h = photo.size


def save(width, name):
    img = photo if width == w else photo.resize((width, round(h * width / w)), Image.LANCZOS)
    img.save(os.path.join(OUT, name), "WEBP", quality=88, method=6)
    print(f"{name}: {img.size[0]} x {img.size[1]}, {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")


save(min(1920, w), "photo-1920.webp")
save(min(3840, w), "photo-full.webp")
for name in ("logo-emblem.svg", "logo-wordmark.svg"):
    shutil.copyfile(os.path.join(SRC, name), os.path.join(OUT, name))
    print(f"{name}: copied, {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")
```

- [ ] **Step 3: Run it**

Run: `python tools/loadingArt.py`
Expected: four lines. `photo-1920.webp: 1920 x 1080`; `photo-full.webp` at the source width (3360 x 1890 today); both SVGs copied (emblem about 1000 KB, wordmark about 36 KB).

- [ ] **Step 4: Update the art README's sizing line if needed, then commit**

```bash
git add tools/loadingArt.py public/loading art/loading/photo-wide.png art/loading/logo-emblem.svg art/loading/logo-wordmark.svg
git commit -m "feat(loading): Andrew's loading art (the surf photo, the grasstree emblem, the wordmark) and the script that sizes it for the page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Andrew's larger photo arrives later, rerun `python tools/loadingArt.py` and commit the three changed files.

---

### Task 2: The bar's maths (`loadingProgress.ts`)

**Files:**
- Create: `src/app/loadingProgress.ts`
- Test: `src/app/loadingProgress.test.ts`

**Interfaces:**
- Produces:
  - `type StageId = 'gpu' | 'world' | 'reef' | 'heath' | 'crew'`
  - `interface Stage { id: StageId; line: string; weight: number; expectedMs: number }`
  - `const STAGES: readonly Stage[]` (in order; the weights sum to 1)
  - `function creep(elapsedMs: number, expectedMs: number): number` (0 → <0.95; ≈0.90 at `expectedMs`)
  - `class BootProgress { constructor(startMs: number); done(id: StageId, nowMs: number): void; isDone(id: StageId): boolean; get allDone(): boolean; get current(): Stage | null; target(nowMs: number): number }`
  - `class BarFollower { shown: number; step(target: number, dtMs: number): number }` (never backwards; within 0.01 of a fixed target after 250 ms)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { BarFollower, BootProgress, STAGES, creep } from './loadingProgress';

describe('STAGES', () => {
  it('runs gpu, world, reef, heath, crew, with weights summing to 1', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['gpu', 'world', 'reef', 'heath', 'crew']);
    expect(STAGES.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 9);
    expect(STAGES.map((s) => s.line)).toEqual(['Waking the GPU…', 'Swell rolling in…', 'Laying the reef…', 'Growing the heath…', 'Waking the crew…']);
  });
});

describe('creep', () => {
  it('starts at 0, reaches about 90% at the expected duration, never reaches the end', () => {
    expect(creep(0, 1000)).toBe(0);
    expect(creep(1000, 1000)).toBeGreaterThan(0.88);
    expect(creep(1000, 1000)).toBeLessThan(0.92);
    expect(creep(1e9, 1000)).toBeLessThan(0.951);
  });
});

describe('BootProgress', () => {
  it('creeps within the current stage but never passes its mark before it ends', () => {
    const p = new BootProgress(0), gpu = STAGES[0].weight;
    expect(p.target(0)).toBe(0);
    expect(p.target(STAGES[0].expectedMs)).toBeGreaterThan(0.85 * gpu);
    expect(p.target(1e9)).toBeLessThan(gpu);
  });
  it('jumps to the mark when a stage ends, and the next stage creeps from there', () => {
    const p = new BootProgress(0), gpu = STAGES[0].weight;
    p.done('gpu', 300);
    expect(p.target(300)).toBeCloseTo(gpu, 9);
    expect(p.current?.id).toBe('world');
    expect(p.target(800)).toBeGreaterThan(gpu);
  });
  it('adds up stages that finish out of order (the land and the crew load alongside)', () => {
    const p = new BootProgress(0);
    p.done('heath', 100);
    const heath = STAGES.find((s) => s.id === 'heath')!.weight;
    expect(p.target(100)).toBeGreaterThanOrEqual(heath);
    expect(p.current?.id).toBe('gpu');
    for (const s of STAGES) p.done(s.id, 200);
    expect(p.allDone).toBe(true);
    expect(p.current).toBeNull();
    expect(p.target(200)).toBeCloseTo(1, 9);
  });
  it('never goes down as time passes and stages end', () => {
    const p = new BootProgress(0);
    let last = 0;
    for (let t = 0; t < 12000; t += 16) {
      if (t === 400) p.done('gpu', t);
      if (t === 2000) p.done('world', t);
      if (t === 2500) p.done('heath', t);
      if (t === 5000) p.done('reef', t);
      if (t === 9000) p.done('crew', t);
      const v = p.target(t);
      expect(v).toBeGreaterThanOrEqual(last - 1e-12);
      last = v;
    }
  });
  it('ignores a stage reported done twice', () => {
    const p = new BootProgress(0);
    p.done('gpu', 100);
    p.done('gpu', 900);
    expect(p.target(100)).toBeCloseTo(STAGES[0].weight, 9);
  });
});

describe('BarFollower', () => {
  it('catches up to a jump within 250 ms', () => {
    const f = new BarFollower();
    for (let t = 0; t < 250; t += 16) f.step(0.6, 16);
    expect(f.shown).toBeGreaterThan(0.59);
  });
  it('never moves backwards', () => {
    const f = new BarFollower();
    f.step(0.5, 1000);
    f.step(0.2, 16);
    expect(f.shown).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/loadingProgress.test.ts`
Expected: FAIL, "Failed to resolve import './loadingProgress'".

- [ ] **Step 3: Write the implementation**

```ts
// The start-up loading bar (loading screens spec §1.2): five stages, each a share of the bar by how long it takes.

export type StageId = 'gpu' | 'world' | 'reef' | 'heath' | 'crew';

export interface Stage {
  id: StageId;
  line: string;
  /** Its share of the bar (the shares sum to 1). */
  weight: number;
  /** How long it usually takes on Andrew's RTX 4060 (ms): the creep's pace. */
  expectedMs: number;
}

/** In order. Weights and times are first guesses until Task 8 measures them. */
export const STAGES: readonly Stage[] = [
  { id: 'gpu', line: 'Waking the GPU…', weight: 0.1, expectedMs: 400 },
  { id: 'world', line: 'Swell rolling in…', weight: 0.2, expectedMs: 1500 },
  { id: 'reef', line: 'Laying the reef…', weight: 0.35, expectedMs: 3000 },
  { id: 'heath', line: 'Growing the heath…', weight: 0.25, expectedMs: 2500 },
  { id: 'crew', line: 'Waking the crew…', weight: 0.1, expectedMs: 800 },
];

/** How far through its span a stage's bar has crept (0 → 0.95, about 0.9 at the expected duration). */
export function creep(elapsedMs: number, expectedMs: number): number {
  return 0.95 * (1 - Math.exp((-3 * Math.max(0, elapsedMs)) / expectedMs));
}

/** Which stages are done; the bar's target is their shares, plus the creep of the first one not yet done. */
export class BootProgress {
  private readonly finished = new Set<StageId>();
  private currentSince: number;

  constructor(startMs: number) {
    this.currentSince = startMs;
  }

  done(id: StageId, nowMs: number): void {
    if (this.finished.has(id)) return;
    const before = this.current;
    this.finished.add(id);
    if (this.current !== before) this.currentSince = nowMs;
  }

  isDone(id: StageId): boolean {
    return this.finished.has(id);
  }

  get allDone(): boolean {
    return this.finished.size === STAGES.length;
  }

  /** The first stage not yet done (its line is the one shown), or null when all are. */
  get current(): Stage | null {
    return STAGES.find((s) => !this.finished.has(s.id)) ?? null;
  }

  target(nowMs: number): number {
    let t = 0;
    for (const s of STAGES) if (this.finished.has(s.id)) t += s.weight;
    const c = this.current;
    if (c) t += c.weight * creep(nowMs - this.currentSince, c.expectedMs);
    return Math.min(1, t);
  }
}

/** What the bar shows: it eases toward the target (within 1% in 250 ms) and never goes back. */
export class BarFollower {
  shown = 0;

  step(target: number, dtMs: number): number {
    if (target > this.shown) this.shown = target - (target - this.shown) * Math.exp(-Math.max(0, dtMs) / 50);
    return this.shown;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/loadingProgress.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/loadingProgress.ts src/app/loadingProgress.test.ts
git commit -m "feat(loading): the start-up bar's maths: five stages by weight, a creep that never passes a stage's mark, a follower that catches up in 250 ms and never goes back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The smooth-frames gate and the minimum hold (`smoothFrames.ts`)

**Files:**
- Create: `src/app/smoothFrames.ts`
- Test: `src/app/smoothFrames.test.ts`

**Interfaces:**
- Produces:
  - `const SMOOTH = { frames: 10, underMs: 33, giveUpMs: 4000 } as const`
  - `class SmoothFramesGate { constructor(startMs: number); frame(dtMs: number, nowMs: number): boolean; get open(): boolean }`. `startMs` is when the work behind the cover finished. Frames fed before that are not counted, because the gate is created only then.
  - `function holdMet(coverInAtMs: number | null, nowMs: number, minHoldMs: number): boolean` (`null` means not fully in yet, so `false`; `minHoldMs` of 0 means always `true` once in)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { SMOOTH, SmoothFramesGate, holdMet } from './smoothFrames';

describe('SmoothFramesGate', () => {
  it('opens after 10 frames in a row under 33 ms', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 9; i++) expect(g.frame(16, i * 16)).toBe(false);
    expect(g.frame(16, 160)).toBe(true);
    expect(g.open).toBe(true);
  });
  it('one slow frame starts the count again', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 9; i++) g.frame(16, i * 16);
    expect(g.frame(80, 224)).toBe(false);
    for (let i = 1; i <= 9; i++) expect(g.frame(16, 224 + i * 16)).toBe(false);
    expect(g.frame(16, 400)).toBe(true);
  });
  it('a frame of exactly 33 ms is slow', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 20; i++) g.frame(SMOOTH.underMs, i * 33);
    expect(g.open).toBe(false);
  });
  it('opens anyway 4 s after the work is done (a slow machine still gets in)', () => {
    const g = new SmoothFramesGate(1000);
    expect(g.frame(200, 4999)).toBe(false);
    expect(g.frame(200, 5000)).toBe(true);
  });
  it('stays open once open', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 10; i++) g.frame(16, i * 16);
    expect(g.frame(500, 700)).toBe(true);
  });
});

describe('holdMet', () => {
  it('waits 1.5 s from when the cover is fully in (transitions)', () => {
    expect(holdMet(null, 9999, 1500)).toBe(false);
    expect(holdMet(1000, 2499, 1500)).toBe(false);
    expect(holdMet(1000, 2500, 1500)).toBe(true);
  });
  it('0.6 s with calm menus, none at start-up', () => {
    expect(holdMet(0, 600, 600)).toBe(true);
    expect(holdMet(0, 0, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/smoothFrames.test.ts`
Expected: FAIL, "Failed to resolve import './smoothFrames'".

- [ ] **Step 3: Write the implementation**

```ts
// When the cover may dissolve (loading screens spec §2, §4): the world drawing smoothly behind it, and long enough on screen.

export const SMOOTH = { frames: 10, underMs: 33, giveUpMs: 4000 } as const;

/** Opens after SMOOTH.frames frames in a row under SMOOTH.underMs, or SMOOTH.giveUpMs after the work is done. */
export class SmoothFramesGate {
  private run = 0;
  private isOpen = false;

  /** `startMs`: when the work behind the cover finished. Make the gate then: only frames after it count. */
  constructor(private readonly startMs: number) {}

  frame(dtMs: number, nowMs: number): boolean {
    if (this.isOpen) return true;
    this.run = dtMs < SMOOTH.underMs ? this.run + 1 : 0;
    if (this.run >= SMOOTH.frames || nowMs - this.startMs >= SMOOTH.giveUpMs) this.isOpen = true;
    return this.isOpen;
  }

  get open(): boolean {
    return this.isOpen;
  }
}

/** Whether the cover has been fully in for `minHoldMs` (null: not fully in yet). */
export function holdMet(coverInAtMs: number | null, nowMs: number, minHoldMs: number): boolean {
  return coverInAtMs !== null && nowMs - coverInAtMs >= minHoldMs;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/smoothFrames.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/smoothFrames.ts src/app/smoothFrames.test.ts
git commit -m "feat(loading): the smooth-frames gate (10 frames under 33 ms, or 4 s) and the minimum hold

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The cover in the page, and Electron showing it first

**Files:**
- Modify: `index.html` (whole file, shown below)
- Modify: `src/style.css:1` (the `html, body` background)
- Modify: `electron/main.js` (`createWindow`)

**Interfaces:**
- Consumes: the `/loading/*` URLs from Task 1.
- Produces: the element ids and classes `LoadingScreen` relies on (Task 5):
  - `#ld-cover`, with `data-mode` set to `boot` | `cover` and `data-logo` set to `hero` | `corner`
  - the classes `.is-ready` (art decoded), `.is-in` (opaque), `.is-out` (dissolving, then hidden), `.is-calm`
  - `.ld-cover-bg`, `.ld-logo`, `.ld-bar-fill` (its width is set as a percentage), `.ld-line`
  - `document.documentElement.dataset.ldLoading`, which goes `boot` → `dissolving` → `done`, and `covering` during transitions (the probe reads it, Task 9)

- [ ] **Step 1: Write the cover into `index.html`**

```html
<!doctype html>
<html lang="en" data-ld-loading="boot">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Liquid Dreams</title>
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="preload" as="image" href="/loading/logo-emblem.svg" />
    <link rel="preload" as="image" href="/loading/photo-1920.webp" imagesrcset="/loading/photo-1920.webp 1920w, /loading/photo-full.webp 3840w" imagesizes="100vw" />
    <style>
      /* The loading cover (loading screens spec §1.1): inline so it paints before the game's code loads. */
      :root { --ld-sand: #e8dbc4; --ld-teal: #3f959b; --ld-orange: #f7931e; }
      html, body { background: var(--ld-sand); }
      .ld-cover { position: fixed; inset: 0; z-index: 20; background: var(--ld-sand); overflow: hidden; pointer-events: none;
        opacity: 1; transition: opacity 400ms ease-out; }
      .ld-cover:not(.is-in) { opacity: 0; }
      .ld-cover.is-out { opacity: 0; transition: opacity 1200ms cubic-bezier(0.33, 1, 0.68, 1); }
      .ld-cover.is-out.is-calm { transition-duration: 300ms; }
      .ld-cover[hidden] { display: none; }
      .ld-cover-bg { position: absolute; left: 0; right: 0; top: 0; height: 55vh; opacity: 0; transition: opacity 300ms ease-out; }
      .ld-cover-bg img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 62%; display: block; }
      .ld-logo { position: absolute; left: 50%; top: 55vh; transform: translate(-50%, -50%) scale(1); transform-origin: 50% 40%;
        display: flex; flex-direction: column; align-items: center; opacity: 0; transition: opacity 300ms ease-out, transform 1200ms cubic-bezier(0.33, 1, 0.68, 1); }
      .ld-cover.is-out:not(.is-calm) .ld-logo { transform: translate(-50%, -50%) scale(1.03); }
      .ld-emblem { width: min(40vh, 48vw); height: auto; display: block; }
      .ld-wordmark { width: min(34vh, 41vw); height: auto; display: block; margin-top: 1.5vh; }
      .ld-cover.is-ready .ld-cover-bg, .ld-cover.is-ready .ld-logo { opacity: 1; }
      .ld-cover[data-logo="corner"] .ld-logo { left: auto; right: 3vw; top: auto; bottom: 3vh; transform: none; }
      .ld-cover[data-logo="corner"] .ld-emblem { width: 9vh; }
      .ld-cover[data-logo="corner"] .ld-wordmark { width: 8vh; }
      .ld-progress { position: absolute; left: 50%; bottom: 5.5vh; transform: translateX(-50%); width: min(37vh, 60vw);
        display: flex; flex-direction: column; align-items: center; gap: 1.3vh; }
      .ld-bar { width: 100%; height: max(3px, 0.37vh); border-radius: 2px; background: rgba(63, 149, 155, 0.18); overflow: hidden; }
      .ld-bar-fill { height: 100%; width: 0%; background: var(--ld-teal); }
      .ld-line { color: var(--ld-teal); font: 500 max(14px, 2vh) 'Barlow', system-ui, sans-serif; letter-spacing: 0.02em; white-space: nowrap; }
      .ld-cover[data-mode="cover"] .ld-bar { display: none; }
      .ld-cover[data-mode="cover"] .ld-line { animation: ld-pulse 1.6s ease-in-out infinite alternate; }
      .ld-cover.is-calm .ld-line { animation: none; }
      @keyframes ld-pulse { from { opacity: 1; } to { opacity: 0.55; } }
    </style>
  </head>
  <body>
    <div id="ld-cover" class="ld-cover is-in" data-mode="boot" data-logo="hero" aria-label="Loading Liquid Dreams" role="status">
      <div class="ld-cover-bg">
        <img src="/loading/photo-1920.webp" srcset="/loading/photo-1920.webp 1920w, /loading/photo-full.webp 3840w" sizes="100vw" alt="" />
      </div>
      <div class="ld-logo">
        <img class="ld-emblem" src="/loading/logo-emblem.svg" alt="" />
        <img class="ld-wordmark" src="/loading/logo-wordmark.svg" alt="Liquid Dreams" />
      </div>
      <div class="ld-progress">
        <div class="ld-bar"><div class="ld-bar-fill"></div></div>
        <div class="ld-line">Waking the GPU…</div>
      </div>
    </div>
    <script>
      // Show the art only once it's decoded, so the sand never shows a half-drawn logo (it fades in over 300 ms).
      (function () {
        var cover = document.getElementById('ld-cover');
        var imgs = Array.prototype.slice.call(cover.querySelectorAll('img'));
        Promise.all(imgs.map(function (i) { return i.decode().catch(function () {}); })).then(function () { cover.classList.add('is-ready'); });
      })();
    </script>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: The page's own background is sand**

In `src/style.css` line 1, change `background: #000;` to `background: var(--ld-sand, #e8dbc4);`.

- [ ] **Step 3: Electron waits for the first paint, over sand**

In `electron/main.js`, add the constant beside `ICON`:

```js
/** The loading cover's sand (index.html --ld-sand): the window's colour before the page paints. */
const SAND = '#e8dbc4';
```

In `createWindow`, change `backgroundColor: '#000000'` to `backgroundColor: SAND, show: false`. Straight after the `new BrowserWindow(...)` call, add:

```js
  // Shown on the page's first paint (the loading cover), never as an empty black window.
  win.once('ready-to-show', () => win.show());
```

- [ ] **Step 4: Check the build, then look at it**

Run: `npm run typecheck`
Expected: no errors.

Start the dev server with `preview_start` (the `.claude/launch.json` dev entry on port 5173). Then set `globalThis.__ldHoldCover = true` in the console *before* a reload, so you can study the cover. (It's honoured in Task 6; until then the cover simply stays up, because nothing removes it yet.) Check with `resize_window` at 1920×1080, 1920×1200, 2560×1080 and 1440×1080:
- The photo band fills the width; the surfer and the barrel are in view (adjust `object-position`'s y if not).
- The emblem is centred on the band's lower edge, with the wordmark below it on sand. Nothing is clipped, and the bar and line sit below the wordmark without touching it.
- Take a 1920×1080 screenshot for the record.

If an aspect clips, tune only the `vh`/`vw` numbers in the inline CSS and look again.

- [ ] **Step 5: Commit**

```bash
git add index.html src/style.css electron/main.js
git commit -m "feat(loading): the logo cover is in the page itself, so it paints before the game's code loads; Electron shows its window on that first paint, over sand, never black

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `LoadingScreen`, the cover's driver

**Files:**
- Create: `src/app/loadingScreen.ts`
- Create: `src/app/loading.selftest.ts`
- Modify: `src/dev/selfTests.ts` (add `import '../app/loading.selftest';` beside the other `../app/` or `../frontend/` imports)

**Interfaces:**
- Consumes: `BootProgress`, `BarFollower`, `STAGES`, `StageId` (Task 2); `SmoothFramesGate`, `holdMet` (Task 3); the DOM contract from Task 4.
- Produces:

```ts
export interface CoverOptions {
  line: string;
  minHoldMs: number;
  calm: boolean;
  /** Called once when the dissolve starts. */
  onDissolve?: () => void;
  logo?: 'hero' | 'corner';
}
export class LoadingScreen {
  /** Adopts index.html's #ld-cover in boot mode (null if the page has none). */
  static adopt(doc: Document, now?: () => number): LoadingScreen | null;
  /** Boot: a stage ended. */
  stageDone(id: StageId): void;
  /** Boot: called once when the dissolve starts (sound, input). Calm menus. */
  onBootDissolve(cb: () => void): void;
  setCalm(calm: boolean): void;
  /** Every drawn frame (App.frame): feeds the gate. */
  frameDrawn(dtMs: number): void;
  /** Transitions: fades the cover in; resolves true once it is opaque, false if a cover is already up (refused). */
  cover(opts: CoverOptions): Promise<boolean>;
  /** Transitions: the work behind the cover is done; dissolve once the gate and the hold allow. */
  release(): void;
  /** Whether the cover blocks the player (in or fading in, and not yet halfway out). */
  get blocking(): boolean;
  /** Takes the cover away at once (errors, selftests). */
  remove(): void;
  /** One step of the cover's clock (its own animation loop runs it; public for the selftests). */
  tick(dtMs: number): void;
}
```

- [ ] **Step 1: Write the failing selftest**

`src/app/loading.selftest.ts`:

```ts
// src/app/loading.selftest.ts: the loading cover's DOM behaviour (loading screens spec §1–§4), run with ?selftest=loading.
import { registerSelfTest } from '../dev/selfTest';
import { STAGES } from './loadingProgress';
import { LoadingScreen } from './loadingScreen';

/** A copy of index.html's cover in its own document fragment, and a fake clock driving it. */
function fixture(): { doc: Document; el: HTMLElement; t: { now: number }; screen: LoadingScreen } {
  const doc = document.implementation.createHTMLDocument('cover');
  const live = document.getElementById('ld-cover');
  const el = (live ? live.cloneNode(true) : Object.assign(doc.createElement('div'), { id: 'ld-cover' })) as HTMLElement;
  if (!live) el.innerHTML = '<div class="ld-cover-bg"></div><div class="ld-logo"></div><div class="ld-progress"><div class="ld-bar"><div class="ld-bar-fill"></div></div><div class="ld-line"></div></div>';
  el.hidden = false;
  el.className = 'ld-cover is-in';
  el.dataset.mode = 'boot';
  doc.body.appendChild(el);
  const t = { now: 0 };
  return { doc, el: doc.getElementById('ld-cover')!, t, screen: LoadingScreen.adopt(doc, () => t.now)! };
}

const smooth = (s: LoadingScreen, t: { now: number }, n: number): void => {
  for (let i = 0; i < n; i++) { t.now += 16; s.frameDrawn(16); }
};

registerSelfTest({
  name: 'loading: the boot cover shows each stage line, and dissolves only after every stage and 10 smooth frames',
  async run() {
    const { el, t, screen } = fixture();
    const lines: string[] = [];
    let dissolved = 0;
    screen.onBootDissolve(() => dissolved++);
    const line = (): string => el.querySelector('.ld-line')!.textContent ?? '';
    for (const s of STAGES) {
      lines.push(line());
      t.now += 100;
      screen.stageDone(s.id);
      smooth(screen, t, 12);
      if (s.id !== 'crew' && dissolved) return { pass: false, detail: `dissolved after ${s.id}` };
    }
    const bad: string[] = [];
    if (lines.join('|') !== STAGES.map((s) => s.line).join('|')) bad.push(`lines ${lines.join('|')}`);
    if (dissolved !== 1) bad.push(`dissolve callbacks ${dissolved}`);
    if (!el.classList.contains('is-out')) bad.push('no is-out');
    if (document.documentElement.dataset.ldLoading !== 'dissolving') bad.push(`state ${document.documentElement.dataset.ldLoading}`);
    return { pass: bad.length === 0, detail: bad.join('; ') || 'five lines in order, one dissolve after the crew' };
  },
});

registerSelfTest({
  name: 'loading: the bar fills as stages end and never goes back',
  async run() {
    const { el, t, screen } = fixture();
    const fill = (): number => parseFloat((el.querySelector('.ld-bar-fill') as HTMLElement).style.width || '0');
    const seen: number[] = [];
    for (const s of STAGES) {
      for (let i = 0; i < 20; i++) { t.now += 16; screen.tick(16); seen.push(fill()); }
      screen.stageDone(s.id);
    }
    for (let i = 0; i < 30; i++) { t.now += 16; screen.tick(16); seen.push(fill()); }
    const back = seen.findIndex((v, i) => i > 0 && v < seen[i - 1] - 1e-6);
    return { pass: back < 0 && seen[seen.length - 1] > 99, detail: `end ${seen[seen.length - 1].toFixed(1)}%, first step back at ${back}` };
  },
});

registerSelfTest({
  name: 'loading: a transition cover refuses a second cover, holds 1.5 s, and blocks input until halfway out',
  async run() {
    const { el, t, screen } = fixture();
    for (const s of STAGES) screen.stageDone(s.id);
    smooth(screen, t, 12);
    t.now += 1300;
    screen.tick(16);
    const bad: string[] = [];
    let dissolved = 0;
    const first = screen.cover({ line: 'Paddling out…', minHoldMs: 1500, calm: false, onDissolve: () => dissolved++ });
    const second = await screen.cover({ line: 'Walking back up the dune…', minHoldMs: 1500, calm: false });
    if (second !== false) bad.push('a second cover was accepted');
    t.now += 400;
    screen.tick(16);
    if ((await first) !== true) bad.push('the first cover did not come in');
    if (el.dataset.mode !== 'cover') bad.push(`mode ${el.dataset.mode}`);
    if (!screen.blocking) bad.push('not blocking while in');
    screen.release();
    smooth(screen, t, 12);
    if (dissolved) bad.push('dissolved before the 1.5 s hold');
    t.now += 1500;
    screen.frameDrawn(16);
    if (dissolved !== 1) bad.push(`dissolves ${dissolved}`);
    if (!screen.blocking) bad.push('stopped blocking as soon as the dissolve began');
    t.now += 650;
    screen.tick(16);
    if (screen.blocking) bad.push('still blocking past halfway');
    return { pass: bad.length === 0, detail: bad.join('; ') || 'refused, held, released halfway' };
  },
});

registerSelfTest({
  name: 'loading: remove() takes the cover away at once (errors, selftests)',
  async run() {
    const { el, screen } = fixture();
    screen.remove();
    return { pass: el.hidden && !screen.blocking, detail: `hidden ${el.hidden}, blocking ${screen.blocking}` };
  },
});
```

- [ ] **Step 2: Register it, then run it to verify it fails**

Add `import '../app/loading.selftest';` to `src/dev/selfTests.ts`.
Run: `npm run typecheck`
Expected: FAIL, "Cannot find module './loadingScreen'".

- [ ] **Step 3: Write `src/app/loadingScreen.ts`**

```ts
// The loading cover (loading screens spec): adopts index.html's #ld-cover, runs the start-up bar and its dissolve, and
// covers Paddle out and Back to the dune. The cover is the same element throughout: hidden between uses, never rebuilt.
import { BarFollower, BootProgress, type StageId } from './loadingProgress';
import { SmoothFramesGate, holdMet } from './smoothFrames';

export interface CoverOptions {
  line: string;
  minHoldMs: number;
  calm: boolean;
  /** Called once when the dissolve starts. */
  onDissolve?: () => void;
  logo?: 'hero' | 'corner';
}

const COVER_IN_MS = 400;
const DISSOLVE_MS = 1200;
const DISSOLVE_CALM_MS = 300;

type Phase = 'boot' | 'coming-in' | 'in' | 'out' | 'gone';

export class LoadingScreen {
  private phase: Phase = 'boot';
  private calm = false;
  private readonly progress: BootProgress;
  private readonly bar = new BarFollower();
  private gate: SmoothFramesGate | null = null;
  private coverInAt: number | null;
  private minHoldMs = 0;
  private outAt = 0;
  private onDissolve: (() => void) | null = null;
  private comingIn: ((ok: boolean) => void) | null = null;
  private comingInAt = 0;
  private released = false;
  private raf = 0;
  private lastTick: number;

  static adopt(doc: Document, now: () => number = () => performance.now()): LoadingScreen | null {
    const el = doc.getElementById('ld-cover');
    return el ? new LoadingScreen(doc, el, now) : null;
  }

  private constructor(private readonly doc: Document, private readonly el: HTMLElement, private readonly now: () => number) {
    const t = now();
    this.progress = new BootProgress(t);
    this.coverInAt = t;
    this.lastTick = t;
    this.showLine(this.progress.current?.line ?? '');
    this.setState('boot');
    this.loop();
  }

  stageDone(id: StageId): void {
    if (this.phase !== 'boot') return;
    this.progress.done(id, this.now());
    this.showLine(this.progress.current?.line ?? '');
    if (this.progress.allDone) this.gate ??= new SmoothFramesGate(this.now());
  }

  onBootDissolve(cb: () => void): void {
    this.onDissolve = cb;
  }

  setCalm(calm: boolean): void {
    this.calm = calm;
    this.el.classList.toggle('is-calm', calm);
  }

  frameDrawn(dtMs: number): void {
    if (this.gate) this.gate.frame(dtMs, this.now());
    this.tick(0);
  }

  cover(opts: CoverOptions): Promise<boolean> {
    if (this.phase !== 'gone') return Promise.resolve(false);
    this.setCalm(opts.calm);
    this.el.dataset.mode = 'cover';
    this.el.dataset.logo = opts.logo ?? 'hero';
    this.showLine(opts.line);
    this.el.classList.remove('is-out', 'is-in');
    this.el.hidden = false;
    this.minHoldMs = opts.minHoldMs;
    this.onDissolve = opts.onDissolve ?? null;
    this.gate = null;
    this.released = false;
    this.coverInAt = null;
    this.phase = 'coming-in';
    this.comingInAt = this.now();
    this.setState('covering');
    // Next frame, so the browser sees opacity 0 before it transitions to 1.
    requestAnimationFrame(() => this.el.classList.add('is-in'));
    this.loop();
    return new Promise((resolve) => { this.comingIn = resolve; });
  }

  release(): void {
    if (this.phase !== 'coming-in' && this.phase !== 'in') return;
    this.released = true;
    if (this.phase === 'in') this.gate ??= new SmoothFramesGate(this.now());
  }

  get blocking(): boolean {
    if (this.phase === 'gone') return false;
    if (this.phase === 'out') return this.now() - this.outAt < (this.calm ? DISSOLVE_CALM_MS : DISSOLVE_MS) / 2;
    return true;
  }

  remove(): void {
    cancelAnimationFrame(this.raf);
    this.comingIn?.(false);
    this.comingIn = null;
    this.el.hidden = true;
    this.el.classList.remove('is-in', 'is-out');
    this.phase = 'gone';
    this.setState('done');
  }

  /** One step of the cover's clock (its own animation loop, and every drawn frame). Public for the selftests. */
  tick(_dtMs: number): void {
    const now = this.now(), dt = now - this.lastTick;
    this.lastTick = now;
    if (this.phase === 'boot') {
      const shown = this.bar.step(this.progress.target(now), dt);
      (this.el.querySelector('.ld-bar-fill') as HTMLElement).style.width = `${(shown * 100).toFixed(2)}%`;
    }
    if (this.phase === 'coming-in' && now - this.comingInAt >= COVER_IN_MS) {
      this.phase = 'in';
      this.coverInAt = now;
      if (this.released) this.gate ??= new SmoothFramesGate(now);
      this.comingIn?.(true);
      this.comingIn = null;
    }
    const ready = this.phase === 'boot' || this.phase === 'in';
    if (ready && this.gate?.open && holdMet(this.coverInAt, now, this.phase === 'boot' ? 0 : this.minHoldMs)) this.dissolve(now);
    if (this.phase === 'out' && now - this.outAt >= (this.calm ? DISSOLVE_CALM_MS : DISSOLVE_MS) + 50) {
      this.el.hidden = true;
      this.el.classList.remove('is-in', 'is-out');
      this.phase = 'gone';
      this.setState('done');
    }
  }

  private dissolve(now: number): void {
    this.phase = 'out';
    this.outAt = now;
    this.el.classList.add('is-out');
    this.setState('dissolving');
    const cb = this.onDissolve;
    this.onDissolve = null;
    cb?.();
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    const step = (): void => {
      this.tick(0);
      if (this.phase !== 'gone') this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private showLine(text: string): void {
    (this.el.querySelector('.ld-line') as HTMLElement).textContent = text;
  }

  private setState(s: 'boot' | 'covering' | 'dissolving' | 'done'): void {
    this.doc.documentElement.dataset.ldLoading = s;
    if (this.doc !== document) document.documentElement.dataset.ldLoading = s;
  }
}
```

Note: the selftest drives a fake clock, and the real `requestAnimationFrame` loop calls `tick` too. That is harmless, because `tick` reads only the injected `now()`.

- [ ] **Step 4: Run the selftest to verify it passes**

Run: `npm run typecheck` (expected: no errors). Then open `http://localhost:5173/?selftest=loading` in the preview and read the console with `read_console_messages`, pattern `[selftest]`.
Expected: `[selftest] SUMMARY 4/4 passed`.

Then run the existing unit suite to be sure nothing else moved: `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/loadingScreen.ts src/app/loading.selftest.ts src/dev/selfTests.ts
git commit -m "feat(loading): LoadingScreen drives the cover: the start-up bar and lines, the dissolve once the frames run smooth, and transition covers that hold 1.5 s and refuse a second cover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Start-up through the cover (stages, sound, input, the veil, failures)

**Files:**
- Modify: `src/main.ts` (the whole `main()`, shown below)
- Modify: `src/app/App.ts`: add the `loading` field and `attachLoading`; the stage checks in `frame` (around line 1790); `start()` (around line 671); `openFrontEnd` (around line 1015)
- Modify: `src/frontend/frontEndPage.ts`: remove the veil (lines 59, 102–105, 127, 138, 162–170); add `inputHeld`
- Modify: `src/frontend/frontEnd.selftest.ts:424-446` (the veil check becomes an `inputHeld` check)

**Interfaces:**
- Consumes: `LoadingScreen` (Task 5).
- Produces:
  - `App.attachLoading(loading: LoadingScreen | null, frontEnd: boolean): void`
  - `App.loading: LoadingScreen | null` (public readonly getter)
  - `FrontEnd.inputHeld: boolean`

- [ ] **Step 1: Write the failing front-end selftest (replacing the veil check)**

In `src/frontend/frontEnd.selftest.ts`, replace the whole `registerSelfTest({ name: 'frontend: a veil covers the front end …' … });` block with:

```ts
registerSelfTest({
  name: 'frontend: while the loading cover holds the input, a key press does nothing to the menu underneath',
  async run() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    try {
      fe.open();
      await frames(fe, 10);
      const before = fe.state?.beat;
      fe.inputHeld = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
      await frames(fe, 10);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter' }));
      await frames(fe, 4);
      const held = fe.state?.beat;
      const veil = host.querySelector('.fe-veil');
      return { pass: before === held && !veil, detail: `beat ${before} → ${held} while held; veil ${veil ? 'still there' : 'gone'}` };
    } finally {
      fe.close();
      host.remove();
    }
  },
});
```

Run: `npm run typecheck`
Expected: FAIL, "Property 'inputHeld' does not exist on type 'FrontEnd'".

- [ ] **Step 2: Remove the veil and add `inputHeld` in `frontEndPage.ts`**

- Delete the field `private veil: HTMLElement | null = null;`.
- Delete the four veil lines in `open()` (`this.veil = document.createElement('div');` through `this.root.appendChild(this.veil);`).
- In `update`, delete `this.liftVeil();`.
- In `close`, delete `this.veil = null;`.
- Delete the whole `liftVeil()` method and its doc comment.
- Add a public field below `private readonly`-style fields at the top of the class:

```ts
  /** While the loading cover is up, key presses are read and dropped, so nothing changes under it (loading screens §2). */
  inputHeld = false;
```

- In `update`, change `const now = performance.now(), { actions, device } = this.input.poll(now);` to:

```ts
    const now = performance.now(), polled = this.input.poll(now);
    const { device } = polled, actions = this.inputHeld ? [] : polled.actions;
```

- In `src/frontend/frontEndCore.ts:26`, change the `crewReady` doc comment to: `/** Whether the crew's bodies have loaded (absent: always); the loading cover waits for it. */`

- [ ] **Step 3: The App holds the cover and marks `heath` and `crew`**

In `src/app/App.ts`, add the import `import type { LoadingScreen } from './loadingScreen';` and these fields near the other private fields:

```ts
  private loadingScreen: LoadingScreen | null = null;
  /** Start-up (loading screens §1.2): the land built, the kit (or its failure), the ground layers (or theirs). */
  private readonly heathParts = { land: false, kit: false, layers: false };
  private frontEndAtBoot = false;
  private bootReported = false;
```

Mark each part where it already settles:
- In the `loadGroundLayers(...)` call: `.catch(...)` becomes `.then(() => { this.heathParts.layers = true; }, (e) => { this.heathParts.layers = true; console.warn('The ground layers failed to load; the patch keeps its plain look.', e); });`. Check `loadGroundLayers` returns a Promise; it already has `.catch`.
- In the `loadKit().then(` success branch, change `void this.prewarmKit();` to `void this.prewarmKit().finally(() => { this.heathParts.kit = true; });`. In its failure branch, add `this.heathParts.kit = true;` before the `console.warn`.
- In `this.land.load().then(() => this.onLandBuilt(), (e) => { … })`: on success `() => { this.onLandBuilt(); this.heathParts.land = true; }`; on failure add `this.heathParts.land = true;` as the first line.

Add the public API:

```ts
  get loading(): LoadingScreen | null {
    return this.loadingScreen;
  }

  /**
   * The loading cover (loading screens spec). `frontEnd`: whether this start opens the front end (otherwise, a moment
   * link or ?frontend=off, nothing waits for the crew). Sound is armed and the front end's input let go as it dissolves.
   */
  attachLoading(loading: LoadingScreen | null, frontEnd: boolean): void {
    this.loadingScreen = loading;
    this.frontEndAtBoot = frontEnd;
    if (!loading) return;
    loading.setCalm(this.calmMenus());
    loading.onBootDissolve(() => this.sound.arm());
  }

  private calmMenus(): boolean {
    try {
      return sanitizeFrontSettings(JSON.parse(localStorage.getItem(FRONT_SETTINGS_KEY) ?? 'null')).calmMenus;
    } catch {
      return false;
    }
  }

  /** Each frame at start-up: the heath and the crew stages, as they land. */
  private reportLoading(dtMs: number): void {
    const l = this.loadingScreen;
    if (!l) return;
    const h = this.heathParts;
    if (!this.bootReported && h.land && h.kit && h.layers) {
      l.stageDone('heath');
      if (!this.frontEndAtBoot || (this.frontEndHost().standSpot() && this.gang.settled)) {
        l.stageDone('crew');
        this.bootReported = true;
      }
    }
    l.frameDrawn(dtMs);
    if (this.frontEnd) this.frontEnd.inputHeld = l.blocking;
  }
```

Add `import { FRONT_SETTINGS_KEY, sanitizeFrontSettings } from '../frontend/frontSettings';` (merge it into an existing import from that module if there is one).

Notes:
- `crew` waits for the heath too, so the cover never lifts on a bare dune.
- `stageDone` ignores repeats, and anything after the boot phase.
- `inputHeld` follows `blocking` every frame, so a transition cover holds the front end's input as well.

In `start()`: delete `this.sound.arm();`, and add `if (!this.loadingScreen) this.sound.arm();` in its place. The cover arms it on dissolve instead (§3: nothing audible, and no "Click or press a key for sound" hint, over the cover).

In `frame`, directly after `this.lastMs = now;`, add `this.reportLoading(realDt * 1000);`.

- [ ] **Step 4: `main.ts` adopts the cover and reports the first three stages**

Replace `main()` in `src/main.ts` with:

```ts
async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  // The cover index.html painted first (loading screens spec): it reports each stage, then dissolves into the dune.
  const loading = LoadingScreen.adopt(document);
  const fail = (title: string, message: string): void => {
    loading?.remove();
    showOverlay(title, `${message}\n\n${WEBGPU_HELP}`);
  };

  const support = await checkWebGpuSupport(navigator as unknown as Parameters<typeof checkWebGpuSupport>[0]);
  if (!support.ok) return fail('WebGPU is not available', support.reason);

  let renderer;
  try {
    renderer = await createRenderer(container);
  } catch (e) {
    return fail('WebGPU could not start', e instanceof Error ? e.message : String(e));
  }
  loading?.stageDone('gpu');

  const query = new URLSearchParams(location.search);
  if (query.has('selftest')) {
    loading?.remove();
    const { runSelfTests, renderSelfTestReport } = await import('./dev/selfTests');
    renderSelfTestReport(await runSelfTests(renderer, query.get('selftest') ?? ''));
    return;
  }

  const problem = momentHashProblem(location.hash);
  if (problem) console.warn(`Moment link ignored (${problem}); opening the saved or default moment.`);
  const frontEnd = frontEndWanted(location.search, location.hash);
  let app: App;
  try {
    // No link: the App opens the saved settings' moment (or the default one).
    app = new App(renderer, container, momentFromHash(location.hash));
    app.attachLoading((globalThis as { __ldHoldCover?: boolean }).__ldHoldCover ? null : loading, frontEnd);
    loading?.stageDone('world');
    // Build what the first break would otherwise build mid-game, before the first frame.
    await app.prewarm();
    loading?.stageDone('reef');
  } catch (e) {
    fail('Liquid Dreams could not start', e instanceof Error ? e.message : String(e));
    throw e;
  }
  app.start();
  if (frontEnd) app.openFrontEnd();
  // The Electron probe (?probe): a Paddle out and a Back to the dune it can trigger (loading screens §7).
  if (query.has('probe')) (window as unknown as { ldProbe: unknown }).ldProbe = { paddleOut: () => app.probePaddleOut(), backToDune: () => app.backToDune() };
  // Dev builds only: scripted gallery captures (window.liquidDreams.captureFrame()) and the crest trace's timing
  // readout (window.liquidDreams.traceMs, ms per frame, a moving average).
  if (import.meta.env.DEV) {
    (window as unknown as { liquidDreams?: App }).liquidDreams = app;
    const { frontEndCheck } = await import('./dev/frontEndCheck');
    (app as unknown as { frontEndCheck: () => ReturnType<typeof frontEndCheck> }).frontEndCheck = () => frontEndCheck(app);
  }
  // Dev builds only: the species sheet (dune-up-close gate 1), each frame posted to the local snapshot receiver.
  if (import.meta.env.DEV && query.get('sheet') === 'species') {
    const { captureSpeciesSheet } = await import('./dev/speciesSheet');
    const post = (name: string, frame: Blob) => fetch(`http://127.0.0.1:5199/?name=${name}`, { method: 'POST', body: frame }).then(() => undefined);
    const names = await captureSpeciesSheet(app, post, query.get('kinds')?.split(','));
    document.title = `sheet done: ${names.length}`;
  }
}
```

Add `import { LoadingScreen } from './app/loadingScreen';`.

Notes:
- `__ldHoldCover` (from Task 4's look-check) makes the App ignore the cover, so it stays up for study.
- With the species sheet (`?sheet=`), `frontEndWanted` is false, so the cover dissolves after the heath as with a moment link. That's fine for captures, because they wait for their own frames.

Add to `App` (near `backToDune`):

```ts
  /** The Electron probe's Paddle out (?probe): START on the select screen, as a player would. */
  probePaddleOut(): void {
    this.frontEnd?.act('start');
  }
```

- [ ] **Step 5: Check it all**

Run: `npm run typecheck && npm test`
Expected: no type errors; all unit tests pass.

In the preview (`http://localhost:5173/`):
1. **A normal start.** Reload; `read_console_messages` shows no errors. `javascript_tool`: `document.documentElement.dataset.ldLoading` reads `done` once the dune shows. The "Click or press a key for sound" hint appears only after the dissolve.
2. **A key during boot (Review Focus 1).** Reload and immediately press Enter several times (`computer` key). Once the dune shows, the front end is still on its first beat (`window.liquidDreams.frontEnd.state.beat === 'conditions'`).
3. **No front end (Review Focus 2).** Open `http://localhost:5173/?frontend=off`. The cover dissolves (state `done`) within a few seconds of the heath; it never sits waiting.
4. **Selftests.** Open `http://localhost:5173/?selftest=frontend`, then `?selftest=loading`. Both report `SUMMARY n/n passed`, and the cover is gone from the report page.
5. **Failure (Review Focus 3).** Temporarily add `throw new Error('probe')` as the first line of `App.prewarm`, reload, and see the error overlay titled "Liquid Dreams could not start", with the cover gone. Remove the line.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/app/App.ts src/frontend/frontEndPage.ts src/frontend/frontEndCore.ts src/frontend/frontEnd.selftest.ts
git commit -m "feat(loading): start-up runs through the cover: five stages on the bar, the dune's veil gone (one cover, not two), sound armed and the menu's keys let go only as it dissolves, and a failed start shows its error instead of a frozen bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Paddle out and Back to the dune through the cover

**Files:**
- Modify: `src/frontend/entry.ts:9-10`
- Modify: `src/app/App.ts` (`backToDune` and `paddleOut`, around lines 1041–1083; `frontEndHost` line 972; `closePauseMenu` line 1038)

**Interfaces:**
- Consumes: `LoadingScreen.cover` / `release` (Task 5); `App.calmMenus()`, `App.probePaddleOut()` and the `loadingScreen` field (Task 6).
- Produces: `PADDLE_OUT_MS = { uiOut: 180, minHold: 1500, minHoldCalm: 600 }`.

- [ ] **Step 1: Write the failing check for the paused sim (Review Focus 4)**

No selftest builds a whole `App` (only `src/main.ts` does), so this check runs against the live dev page through the
dev hook `window.liquidDreams` (dev builds only). Save it as `<scratchpad>/paddleHold.js` and run it with
`javascript_tool` on `http://localhost:5173/` once the dune is showing:

```js
(async () => {
  const app = window.liquidDreams, sim = () => app.clock.simTime, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = () => document.documentElement.dataset.ldLoading;
  const states = [];
  app.probePaddleOut();
  await wait(900);                         // UI out (180) + cover in (400) + a little
  states.push(state());
  const t0 = sim();
  await wait(500);
  const heldStill = Math.abs(sim() - t0) < 1e-6;
  while (state() !== 'dissolving' && state() !== 'done') await wait(20);
  const t1 = sim();
  await wait(300);
  const runsAfter = sim() > t1;
  return { states, heldStill, runsAfter, pass: states[0] === 'covering' && heldStill && runsAfter };
})()
```

Run it before Step 3. Expected: `pass: false`. Today there is no cover (`states[0]` is `done`), and the sim runs on through the black fade.

- [ ] **Step 2: New timings**

`src/frontend/entry.ts`:

```ts
/** Paddle out and Back to the dune (loading screens §4): the UI leaves, the cover comes in, holds at least this long, dissolves. */
export const PADDLE_OUT_MS = { uiOut: 180, minHold: 1500, minHoldCalm: 600 } as const;
```

- [ ] **Step 3: Rewrite `backToDune` and `paddleOut` in `src/app/App.ts`**

Replace both methods with:

```ts
  /**
   * Covers a transition (loading screens §4): the cover comes in, `work` runs under it with the sim held still, and it
   * dissolves once the frames run smooth and it has held long enough; the sim then runs (or stays paused) as `work`
   * left it. Without a cover (none adopted), the work just runs. A second transition while one is covered is refused.
   */
  private async underCover(line: string, delayMs: number, work: () => void): Promise<void> {
    const cover = this.loadingScreen;
    if (!cover) {
      work();
      return;
    }
    await new Promise((r) => window.setTimeout(r, delayMs));
    const calm = this.calmMenus();
    let resume = false;
    let dissolved!: () => void;
    const started = new Promise<void>((r) => { dissolved = r; });
    const ok = await cover.cover({
      line, calm, minHoldMs: calm ? PADDLE_OUT_MS.minHoldCalm : PADDLE_OUT_MS.minHold,
      onDissolve: () => { this.setPaused(resume); dissolved(); },
    });
    if (!ok) return;
    work();
    resume = this.clock.paused;
    this.setPaused(true);
    cover.release();
    await started;
  }

  /** Back to the dune (Andrew, Gate B): under the cover, the ride stops and the front end opens on the crew again. */
  backToDune(): Promise<void> {
    return this.underCover('Walking back up the dune…', 0, () => {
      this.setPaused(false);
      this.chaseAfterPaddle = false;
      this.stopRide(false);
      this.openFrontEnd();
    });
  }

  /** Paddle out (spec §3): the UI leaves; under the cover, the session is set and the rider put on a set wave. */
  paddleOut(choice: SessionChoice): Promise<void> {
    return this.underCover('Paddling out…', PADDLE_OUT_MS.uiOut, () => {
      const lineup = DEFAULT_SURFER_PARAMS;
      Object.assign(this.surferParams, {
        enabled: true, onLand: false, preset: choice.rider, board: choice.board, outfit: choice.outfit, stance: choice.stance, pose: 'sit', gang: false,
        x: lineup.x, z: lineup.z, headingDeg: lineup.headingDeg, heightNudgeM: 0, expression: 'none',
      });
      normalizeSurferParams(this.surferParams);
      this.surferStand.group.visible = true;
      this.stageFrontEnd(null, null);
      this.input.suspended = false;
      this.rig.setPose(this.startupMoment().camera, this.conditions.tideM);
      // Straight onto a set wave (first ride): the ride's camera takes over from here.
      this.startRide();
      this.panel.refresh();
      this.scheduleSave();
    });
  }
```

Update the two callers that expect `void`:
- in `frontEndHost()`, `paddleOut: (choice) => this.paddleOut(choice),` becomes `paddleOut: (choice) => void this.paddleOut(choice),`
- in `closePauseMenu`, `} else this.backToDune();` becomes `} else void this.backToDune();`

(`FrontEndHost.paddleOut` stays typed `void`. `main.ts`'s `ldProbe.backToDune` returns the promise, which is fine.)

- [ ] **Step 4: Run and look**

Run: `npm run typecheck && npm test`
Expected: no errors; all pass.

Reload `http://localhost:5173/`, wait for the dune, and run `<scratchpad>/paddleHold.js` again with `javascript_tool`.
Expected: `{ states: ['covering'], heldStill: true, runsAfter: true, pass: true }`.

Then play it:
- Walk the select screen to Paddle out. The cover fades in (no black), shows "Paddling out…" pulsing, holds about 1.5 s, and dissolves onto the rider in the water with the set wave still coming.
- Press Esc, then Back to the dune. You get the cover with "Walking back up the dune…", then the crew, and the world is moving (not left paused).
- **Review Focus 5:** in the console, call `liquidDreams.probePaddleOut(); liquidDreams.backToDune();` back to back. Only one cover appears (the second is refused), the console stays clean, and the state returns to `done`.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/entry.ts src/app/App.ts
git commit -m "feat(loading): Paddle out and Back to the dune go through the cover instead of black: the ride warms up underneath with the sim held still, at least 1.5 s on screen, then the dissolve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Measure the stages and set their weights

**Files:**
- Modify: `src/app/loadingScreen.ts` (log the stage times once)
- Modify: `src/app/loadingProgress.ts` (the `STAGES` weights and `expectedMs`)

**Interfaces:**
- Consumes: everything above. Produces: measured `STAGES`.

- [ ] **Step 1: Log each stage's end once**

In `LoadingScreen.stageDone`, after `this.progress.done(...)`, add:

```ts
    console.info(`[loading] ${id} done at ${(this.now() - this.bootAt).toFixed(0)} ms`);
```

Add the field `private readonly bootAt: number;`, set to `t` in the constructor.

- [ ] **Step 2: Measure on the RTX in the built Electron app**

Run `npm run build`, then `npx electron . --probe=<scratchpad>/probe-weights`. The probe logs the renderer's console with timestamps. Do this three times. Andrew's memory notes say the Electron app serves `dist/`, so the build must be fresh. Read the five `[loading] … done at` lines from each run.

- [ ] **Step 3: Set the table**

For each stage, set `expectedMs` to the median gap between its end and the previous stage's end. That's its own duration, with overlapping stages measured from the previous end in order. Set `weight` to its share of the total median time, rounded to 0.01, with the last weight adjusted so they sum to exactly 1. Rerun `npx vitest run src/app/loadingProgress.test.ts`. It must still pass, because the tests check the sum, not the values.

- [ ] **Step 4: Commit**

```bash
git add src/app/loadingScreen.ts src/app/loadingProgress.ts
git commit -m "feat(loading): the bar's stage weights measured on the RTX 4060 (median of three starts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Electron probe proves there's no black and no hitch

**Files:**
- Modify: `electron/main.js`

**Interfaces:**
- Consumes: `document.documentElement.dataset.ldLoading` (Task 4/5), `window.ldProbe` (Task 6).
- Produces: `probe.json` gains `blackCheck: { captures, black, firstBlackAtS }` and `afterDissolve: [{ which, hitches: [{ atS, ms }] }]`.

- [ ] **Step 1: The black detector, with a self-check**

Add near the top of `electron/main.js`:

```js
/** Whether a capture is mostly black: over half its sampled pixels with luminance under 0.04 (loading screens §7). */
function mostlyBlack(image) {
  const { width, height } = image.getSize();
  const px = image.toBitmap(); // BGRA
  let dark = 0, n = 0;
  for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
    const i = (y * width + x) * 4;
    const lum = (0.0722 * px[i] + 0.7152 * px[i + 1] + 0.2126 * px[i + 2]) / 255;
    if (lum < 0.04) dark++;
    n++;
  }
  return n > 0 && dark / n > 0.5;
}
```

At the start of `probe()`, check that the detector itself works before trusting it:

```js
  const solid = (b, g, r) => nativeImage.createFromBitmap(Buffer.from(new Array(64 * 64).fill([b, g, r, 255]).flat()), { width: 64, height: 64 });
  if (!mostlyBlack(solid(0, 0, 0)) || mostlyBlack(solid(0xc4, 0xdb, 0xe8))) throw new Error('mostlyBlack is wrong');
```

Add `nativeImage` to the `electron` import.

- [ ] **Step 2: Capture from show to the end of the dissolve**

In `createWindow`, when `probeDir` is set:
- Start capturing on `ready-to-show`, before `win.show()` runs.
- Load `APP_URL + '?probe'` instead of `APP_URL`, which turns on `window.ldProbe`.
- Put the captures in a module-level `blackCheck` object:

```js
const blackCheck = { captures: 0, black: 0, firstBlackAtS: null };
async function watchForBlack(win, t0) {
  for (;;) {
    const state = await win.webContents.executeJavaScript('document.documentElement.dataset.ldLoading').catch(() => 'boot');
    const img = await win.webContents.capturePage();
    blackCheck.captures++;
    if (!img.isEmpty() && mostlyBlack(img)) { blackCheck.black++; blackCheck.firstBlackAtS ??= (Date.now() - t0) / 1000; }
    if (state === 'done') return;
    await new Promise((r) => setTimeout(r, 100));
  }
}
```

In `createWindow`: `win.once('ready-to-show', () => { if (probeDir) blackWatch = watchForBlack(win, Date.now()); win.show(); });`. Declare `let blackWatch = Promise.resolve();` at module level. Then in `probe()`, `await blackWatch;` before the timeline.

- [ ] **Step 3: Hitches after each dissolve, including a scripted Paddle out and Back**

In `probe()`, after `await blackWatch`, add:

```js
  // 3 s of frames after a dissolve: every frame over 50 ms (loading screens §7: the target is none).
  const hitchesFor = () => win.webContents.executeJavaScript(`new Promise((done) => {
    const out = []; let last = performance.now(); const end = last + 3000;
    const tick = (now) => { if (now - last > 50) out.push({ atS: Math.round(now / 100) / 10, ms: Math.round(now - last) }); last = now;
      now < end ? requestAnimationFrame(tick) : done(out); };
    requestAnimationFrame(tick);
  })`);
  const waitState = (s) => win.webContents.executeJavaScript(`new Promise((done) => { const t = setInterval(() => {
    if (document.documentElement.dataset.ldLoading === '${s}') { clearInterval(t); done(); } }, 20); })`);
  const afterDissolve = [{ which: 'start-up', hitches: await hitchesFor() }];
  await win.webContents.executeJavaScript('window.ldProbe.paddleOut()');
  await waitState('dissolving');
  afterDissolve.push({ which: 'paddle out', hitches: await hitchesFor() });
  await win.webContents.executeJavaScript('window.ldProbe.backToDune()');
  await waitState('dissolving');
  afterDissolve.push({ which: 'back to the dune', hitches: await hitchesFor() });
```

Add `blackCheck, afterDissolve` to the `result` object.

The start-up `hitchesFor` starts once the state is `done`, about 1.2 s after the dissolve began. That means it covers the end of the dissolve plus the 1.8 s after it. That's acceptable, because the dissolve's first half is checked by the transitions. Note it in the result: `afterDissolveNote: 'start-up window starts when the dissolve ends'`.

- [ ] **Step 4: Run it**

Run: `npm run build`, then `npx electron . --probe=<scratchpad>/probe-loading`.
Expected in `probe.json`:
- `blackCheck.black: 0`, with `captures` of 30 or more.
- Each `afterDissolve` entry has `hitches: []`.

If there are hitches, report them with their times to Andrew; don't paper over them. A hitch right after Paddle out's dissolve most likely means a pipeline the cover didn't warm. The fix is to render that thing under the cover (as `prewarm` does) — but agree that with Andrew first, because it's beyond this plan.

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "test(probe): the Electron probe checks the loading cover: a capture every 100 ms from the window's show to the end of the dissolve fails on any mostly-black frame, and the 3 s after start-up, Paddle out and Back to the dune are checked for hitches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Andrew's eye at 1080p

**Files:** none (captures only, in the scratchpad)

- [ ] **Step 1: Capture real frames in Electron at 1920×1080**

Use the probe's window, or `npx electron .` with the window at 1920×1080. Capture `win.webContents.capturePage()` at these moments:
1. the splash mid-boot, with the bar about halfway;
2. the start-up dissolve at about 50%;
3. the Paddle out cover, with "Paddling out…" showing;
4. the first frame after Paddle out's dissolve.

A small temporary hook in the probe works: call `capturePage` at those `ldLoading` states and at the timings above. Save the PNGs.

- [ ] **Step 2: Show Andrew, then wait for his verdict**

Send the four PNGs (`SendUserFile`), together with the probe's `blackCheck` and `afterDissolve` results. Ask him two things:
- Does it look and feel like a shipped game?
- Is the sand right, or will he re-export it from Canva? If he changes it, the `--ld-sand` value in `index.html` and `SAND` in `electron/main.js` change together.

Don't merge until he says so. The memory note on overnight delegation applies: merge only on his word for this phase.
