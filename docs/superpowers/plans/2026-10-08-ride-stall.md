# The ride stall: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find where the one ~500 ms riding frame (and the 3.5–4 s paddling frame) goes, with an instrument that
sees the GPU process, then remove it without touching the ride's water: no riding frame over twice the median.

**Architecture:** Fable has already read the existing CPU profiles (spec §2): the stall is a main-thread *idle* gap,
not JavaScript, so the next instrument is GPU-side. Task 1 commits the idle-run scanner that found it. Task 2 adds a
per-frame log in the page, GPUDevice creation hooks and Electron content tracing to the profiler, with a trace reader.
Task 3 runs it and writes the stall table, then **stops for Fable's ruling (Gate A)**. Task 4 is the fix, chosen from
the spec's menu (§5) by that ruling and written as an addendum to this plan. Task 5 is handovers.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, vitest (`src/**/*.test.ts`, node), Electron 44 tools under
`tools/` (Node 24: a `tools/_*.mjs` may import a pure `src/**.ts` module with its `.ts` extension; Node strips the
types). `electron.contentTracing` for the trace.

**Spec:** `docs/superpowers/specs/2026-10-08-ride-stall-design.md` (read it first; §2 is the evidence so far, §5
the decision rules).

**Written by:** Fable (orchestrator), 2026-10-08, for Opus (executor). Branch `ride-stall` from `main` (95e0ecd).
Push after every task; do not merge without Andrew's say-so.

## Global Constraints

- Nothing under `src/ride`, `src/breaker`, `src/seabed` changes. `src/ride/rideStations.probe.test.ts` with
  `PROBE_RIDE_STATIONS=1` reads `lazy (R9)` 0.00 cm, 972 / 982 sums per frame before and after Task 4.
- Only focused profiler runs count (line 1 of the report says `focused true` at cam, riding and the end). Same-session
  A/B only. If 5173 serves another session's app, profile on 5174 via a temporary `.claude/launch.json` entry and
  `--base=http://localhost:5174/`, reverted before the commit.
- Reports and tables go under `docs/superpowers/evidence/ride-stall/`; `.cpuprofile` and `.trace.json` files go
  under `.superpowers/sdd/2026-10-08-ride-stall/` (git-ignored) with `--out=` pointing there, the `report.txt` copied
  into evidence.
- `npx tsc --noEmit` clean and `npx vitest run src/dev` green at every commit. Probes in `tools/_*.mjs` or env-gated
  tests, never `src/_scratch`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After every task: commit, one ledger line in `.superpowers/sdd/2026-10-08-ride-stall/progress.md`, push (retry a
  failed push at the next task and say so).

## Review Focus

1. **The frame log must not change the frame it measures**: with the log off, `App.frame` does no extra work and
   `perf.update()` runs only when it did before (dev UI visible or `gpuSampling`). Task 2's test pins the ring and
   the off state; a cam-mode run with and without `--stall` within 0.3 ms median is the live check (Task 3 step 1).
2. **A trace with no GPU-process slices is a finding, not a pass**: Task 3 reports "no slice ≥ 30 ms in the GPU
   process over the stall frame" explicitly and reruns once with the extra categories (spec §5, last row).
3. **The paddling frame's verdict is read from the cover's code, then checked live**: Task 3 step 5 cites the lines
   of `loadingScreen.ts` that gate the dissolve and measures one real paddle-out (front end on) with the frame log.
4. **Ticks per frame are counted from the planners' returns**, not inferred: `advance()` of the foam, spray, impact
   and kelp already return the ticks run; the log records those numbers.
5. **Task 4's spread replay ends in the same state as the one-frame replay**: if H1 is chosen, a test runs
   `FoamSchedule.planTicks` with a cap across consecutive frames and asserts the union of ticks equals the uncapped
   plan's and that `clear` is true only on the first.

## How to run the profiler

```bash
npx electron tools/_rideProfile.mjs --ft=6 --sim-t=300 --stall --trace --out=.superpowers/sdd/2026-10-08-ride-stall/t3-6ft-
```

(`--stall` and `--trace` are Task 2's flags.) Dev server on 5173 (`npm run dev`). Reference from main (r10b, focused,
sim-t 300): 6 ft riding median 32.6–35.6 ms, max ~500 ms; 12 ft median 58.2–58.6 ms, max ~520 ms.

---

### Task 1: the idle-run scanner (Fable's finding, as a tool)

**Files:**
- Create: `src/dev/cpuprofileIdle.ts` (pure: idle runs and sample gaps from a `.cpuprofile` object)
- Create: `src/dev/cpuprofileIdle.test.ts`
- Create: `tools/_stallScan.mjs` (prints the runs for the files given)
- Create: `docs/superpowers/evidence/ride-stall/stall-scan.txt`

**Interfaces:**
- Produces: `idleRuns(profile: CpuProfile, minMs: number): IdleRun[]` with
  `interface IdleRun { startMs: number; durationMs: number; firstIndex: number; lastIndex: number; before: string[]; after: string[] }`
  (`before`/`after`: the 6-deep stack, leaf first, of the sample before the run and the first non-idle after), and
  `gaps(profile: CpuProfile, top: number): { atMs: number; ms: number; stack: string[] }[]` (the biggest single
  `timeDeltas`). `CpuProfile` is the Chrome DevTools profile shape: `{ nodes: { id, callFrame: { functionName, url, lineNumber }, children?: number[] }[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number }`.

- [ ] **Step 1: Write the failing test** (`src/dev/cpuprofileIdle.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { type CpuProfile, gaps, idleRuns } from './cpuprofileIdle';

// Three nodes: root(1) → idle(2), root(1) → frame(3). Samples at 200 µs: 5 of frame, 3000 of idle (600 ms), 5 of frame.
function profile(): CpuProfile {
  const n = (id: number, functionName: string, children: number[] = []) => ({ id, callFrame: { functionName, url: 'http://x/src/app/App.ts?t=1', lineNumber: 9 }, children });
  const samples = [...Array(5).fill(3), ...Array(3000).fill(2), ...Array(5).fill(3)];
  return { nodes: [n(1, '(root)', [2, 3]), n(2, '(idle)'), n(3, 'frame')], samples, timeDeltas: samples.map(() => 200), startTime: 0, endTime: samples.length * 200 };
}

describe('idleRuns', () => {
  it('finds the 600 ms idle run with the stacks either side', () => {
    const runs = idleRuns(profile(), 200);
    expect(runs).toHaveLength(1);
    expect(runs[0].durationMs).toBeCloseTo(600, 0);
    expect(runs[0].startMs).toBeCloseTo(1, 0);
    expect(runs[0].firstIndex).toBe(5);
    expect(runs[0].lastIndex).toBe(3004);
    expect(runs[0].before[0]).toBe('frame src/app/App.ts:10');
    expect(runs[0].after[0]).toBe('frame src/app/App.ts:10');
  });
  it('ignores runs under the threshold', () => {
    expect(idleRuns(profile(), 700)).toHaveLength(0);
  });
});

describe('gaps', () => {
  it('returns the biggest single sample gaps, largest first', () => {
    const p = profile();
    p.timeDeltas[2] = 125_000;
    const g = gaps(p, 2);
    expect(g[0].ms).toBeCloseTo(125, 0);
    expect(g[0].stack[0]).toBe('frame src/app/App.ts:10');
    expect(g[1].ms).toBeCloseTo(0.2, 1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/dev/cpuprofileIdle.test.ts`
Expected: FAIL, cannot find module `./cpuprofileIdle`.

- [ ] **Step 3: Implement** (`src/dev/cpuprofileIdle.ts`)

```ts
/** The Chrome DevTools .cpuprofile shape (the fields the scanner reads). */
export interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

export interface IdleRun {
  /** ms from the profile's start to the run's first sample. */
  startMs: number;
  durationMs: number;
  firstIndex: number;
  lastIndex: number;
  /** The sample before the run and the first non-idle sample after it: 6 frames, leaf first, "name file:line". */
  before: string[];
  after: string[];
}

const shortUrl = (u: string): string => u.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '').replace('node_modules/.vite/deps/', 'nm/');

function indexes(p: CpuProfile) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const stackOf = (id: number, depth = 6): string[] => {
    const s: string[] = [];
    for (let x: number | undefined = id; x !== undefined && s.length < depth; x = parent.get(x)) {
      const n = byId.get(x)!;
      s.push(`${n.callFrame.functionName || '(anon)'} ${shortUrl(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`);
    }
    return s;
  };
  const idle = new Set(p.nodes.filter((n) => n.callFrame.functionName === '(idle)').map((n) => n.id));
  // t[i]: ms from the start to sample i (timeDeltas are µs, each the gap before its sample).
  const t: number[] = [];
  let acc = 0;
  for (let i = 0; i < p.samples.length; i++) { acc += p.timeDeltas[i] / 1000; t.push(acc); }
  return { stackOf, idle, t };
}

/** Contiguous runs of (idle) samples lasting at least minMs: where the main thread waited for the next frame. */
export function idleRuns(p: CpuProfile, minMs: number): IdleRun[] {
  const { stackOf, idle, t } = indexes(p);
  const out: IdleRun[] = [];
  let start = 0;
  for (let i = 1; i <= p.samples.length; i++) {
    const same = i < p.samples.length && idle.has(p.samples[i]) === idle.has(p.samples[start]);
    if (same) continue;
    if (idle.has(p.samples[start])) {
      const durationMs = t[i - 1] - t[start] + p.timeDeltas[start] / 1000;
      if (durationMs >= minMs) {
        let after = i;
        while (after < p.samples.length && idle.has(p.samples[after])) after++;
        out.push({ startMs: t[start] - p.timeDeltas[start] / 1000, durationMs, firstIndex: start, lastIndex: i - 1,
          before: start > 0 ? stackOf(p.samples[start - 1]) : [], after: after < p.samples.length ? stackOf(p.samples[after]) : [] });
      }
    }
    start = i;
  }
  return out;
}

/** The biggest single gaps between samples (a blocked sampler), largest first, with the stack of the sample after. */
export function gaps(p: CpuProfile, top: number): { atMs: number; ms: number; stack: string[] }[] {
  const { stackOf, t } = indexes(p);
  return p.timeDeltas.map((d, i) => ({ atMs: t[i], ms: d / 1000, stack: stackOf(p.samples[i]) })).sort((a, b) => b.ms - a.ms).slice(0, top);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run src/dev/cpuprofileIdle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: The tool** (`tools/_stallScan.mjs`)

```js
// Where the main thread waited: idle runs >= --min (default 200) ms and the biggest sample gaps, per .cpuprofile.
// node tools/_stallScan.mjs [--min=200] <file>...   (ride-stall Task 1; the finding is in the spec's §2)
import { readFileSync } from 'node:fs';
import { gaps, idleRuns } from '../src/dev/cpuprofileIdle.ts';
const min = Number(process.argv.find((a) => a.startsWith('--min='))?.slice(6) ?? 200);
for (const file of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const p = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`\n######## ${file.split(/[\\/]/).pop()}  ${p.samples.length} samples over ${((p.endTime - p.startTime) / 1000).toFixed(0)} ms`);
  console.log(`-- idle runs >= ${min} ms`);
  for (const r of idleRuns(p, min)) {
    console.log(`${r.durationMs.toFixed(0).padStart(5)} ms @ +${r.startMs.toFixed(0)} ms  [${r.firstIndex}..${r.lastIndex}]`);
    console.log(`   before: ${r.before.join(' < ') || '(start)'}`);
    console.log(`   after : ${r.after.join(' < ') || '(end)'}`);
  }
  console.log('-- biggest single sample gaps');
  for (const g of gaps(p, 3)) console.log(`${g.ms.toFixed(1).padStart(7)} ms @ +${g.atMs.toFixed(0)} ms  ${g.stack.join(' < ')}`);
}
```

Run it on the eight r10b profiles and save the output:

```bash
node tools/_stallScan.mjs .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-6ft-ride.cpuprofile .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-6ft-b-ride.cpuprofile .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-12ft-ride.cpuprofile .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-12ft-b-ride.cpuprofile .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-6ft-paddle.cpuprofile .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-12ft-paddle.cpuprofile .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-6ft-cam.cpuprofile .superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-6ft-b-cam.cpuprofile > docs/superpowers/evidence/ride-stall/stall-scan.txt
```

Expected: the riding files show the runs in spec §2's table (6ft: 440 @ +1576; 12ft-b: 442, 397, 393, 371 …); the
paddle files one run of 2800–3600 ms; the cam files none but the start-up. If a number differs from the spec by more
than rounding, say so in the ledger (same files, so it should not).

- [ ] **Step 6: Commit**

```bash
git add src/dev/cpuprofileIdle.ts src/dev/cpuprofileIdle.test.ts tools/_stallScan.mjs docs/superpowers/evidence/ride-stall/stall-scan.txt
git commit -m "tools(ride-stall): idle-run scanner for .cpuprofile files; the riding stall is a 440-460 ms main-thread idle gap, not JS (Task 1)"
```

---

### Task 2: the GPU-side instrument (frame log, creation hooks, content trace)

**Files:**
- Create: `src/dev/frameLog.ts`, `src/dev/frameLog.test.ts`
- Create: `src/dev/traceSlices.ts`, `src/dev/traceSlices.test.ts`
- Create: `tools/_traceStall.mjs`
- Modify: `src/app/App.ts` (the frame loop's tail at `private frame` ~L1999–2168; `stepFoam` ~L868, `stepKelp` ~L878,
  `stepSpray` ~L945–951 and `impact.advance` there; `updateRibbon` where `this.ribbonKey = key` ~L1028; the
  `perf.update()` guard at the very end of `frame`)
- Modify: `tools/_rideProfile.mjs` (flags `--stall`, `--trace`)

**Interfaces:**
- Produces: `class FrameLog` with `on: boolean`, `record(f: FrameRecord): void`, `drain(): FrameRecord[]`, ring of
  `FRAME_LOG_CAP = 4096`; `interface FrameRecord { t: number; dt: number; sim: number; gpu: number; foam: number; spray: number; impact: number; kelp: number; under: 0 | 1; ribbon: 0 | 1; pending: number }`.
  `App` exposes it as `readonly frameLog = new FrameLog()` (dev readout through `window.liquidDreams.frameLog`).
- Produces: `slices(trace: TraceJson, minMs: number): Slice[]` with
  `interface Slice { startMs: number; durMs: number; process: string; thread: string; name: string; cat: string }`
  (`startMs` relative to the trace's earliest event), sorted by `startMs`. `TraceJson` is
  `{ traceEvents: TraceEvent[] } | TraceEvent[]` where `TraceEvent = { ph: string; name: string; cat?: string; ts: number; dur?: number; pid: number; tid: number; args?: Record<string, unknown> }`.
- Produces in the profiler: with `--stall`, the page's frame log on for all three passes and
  `<prefix>frames-{cam,paddle,ride}.json` (the records) plus `<prefix>creates-{cam,paddle,ride}.json`; with
  `--trace`, `<prefix>ride.trace.json` for the riding pass (and `<prefix>paddle.trace.json` for the paddling pass).

- [ ] **Step 1: Failing tests for the ring and the slices**

`src/dev/frameLog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FRAME_LOG_CAP, FrameLog, type FrameRecord } from './frameLog';

const rec = (t: number): FrameRecord => ({ t, dt: 16, sim: t / 1000, gpu: 3, foam: 0, spray: 0, impact: 0, kelp: 0, under: 0, ribbon: 0, pending: 0 });

describe('FrameLog', () => {
  it('records nothing while off', () => {
    const l = new FrameLog();
    l.record(rec(1));
    expect(l.drain()).toEqual([]);
  });
  it('keeps the last FRAME_LOG_CAP records in order and drains them', () => {
    const l = new FrameLog();
    l.on = true;
    for (let i = 0; i < FRAME_LOG_CAP + 10; i++) l.record(rec(i));
    const out = l.drain();
    expect(out).toHaveLength(FRAME_LOG_CAP);
    expect(out[0].t).toBe(10);
    expect(out[out.length - 1].t).toBe(FRAME_LOG_CAP + 9);
    expect(l.drain()).toEqual([]);
  });
});
```

`src/dev/traceSlices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { slices } from './traceSlices';

describe('slices', () => {
  it('names processes and threads from the metadata and keeps slices over the threshold in time order', () => {
    const trace = { traceEvents: [
      { ph: 'M', name: 'process_name', pid: 7, tid: 0, ts: 0, args: { name: 'GPU Process' } },
      { ph: 'M', name: 'thread_name', pid: 7, tid: 3, ts: 0, args: { name: 'CrGpuMain' } },
      { ph: 'X', name: 'short', cat: 'gpu', pid: 7, tid: 3, ts: 1_000_000, dur: 5_000 },
      { ph: 'X', name: 'CreateRenderPipeline', cat: 'disabled-by-default-gpu.dawn', pid: 7, tid: 3, ts: 1_400_000, dur: 420_000 },
      { ph: 'X', name: 'Compositor', cat: 'cc', pid: 2, tid: 9, ts: 1_200_000, dur: 40_000 },
    ] };
    const out = slices(trace, 30);
    expect(out.map((s) => s.name)).toEqual(['Compositor', 'CreateRenderPipeline']);
    expect(out[1]).toMatchObject({ startMs: 400, durMs: 420, process: 'GPU Process', thread: 'CrGpuMain', cat: 'disabled-by-default-gpu.dawn' });
    expect(out[0].process).toBe('pid 2');
    expect(out[0].thread).toBe('tid 9');
  });
  it('accepts a bare event array and B/E pairs', () => {
    const out = slices([
      { ph: 'B', name: 'Swap', pid: 1, tid: 1, ts: 0 },
      { ph: 'E', name: 'Swap', pid: 1, tid: 1, ts: 50_000 },
    ], 30);
    expect(out).toEqual([{ startMs: 0, durMs: 50, process: 'pid 1', thread: 'tid 1', name: 'Swap', cat: '' }]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/dev/frameLog.test.ts src/dev/traceSlices.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/dev/frameLog.ts`**

```ts
/** One frame of the stall log (ride-stall spec §4): wall time, frame gap, sim time, the last resolved GPU ms, the
 * ticks each particle system ran, the underwater flag, whether the ribbon rebuilt, pipelines still building. */
export interface FrameRecord {
  t: number;
  dt: number;
  sim: number;
  gpu: number;
  foam: number;
  spray: number;
  impact: number;
  kelp: number;
  under: 0 | 1;
  ribbon: 0 | 1;
  pending: number;
}

export const FRAME_LOG_CAP = 4096;

/** A ring of the last FRAME_LOG_CAP frames, written by App.frame while `on` (the profiler switches it on). */
export class FrameLog {
  on = false;
  private ring: FrameRecord[] = [];

  record(f: FrameRecord): void {
    if (!this.on) return;
    this.ring.push(f);
    if (this.ring.length > FRAME_LOG_CAP) this.ring.splice(0, this.ring.length - FRAME_LOG_CAP);
  }

  /** The records so far, oldest first; the ring is emptied. */
  drain(): FrameRecord[] {
    const out = this.ring;
    this.ring = [];
    return out;
  }
}
```

- [ ] **Step 4: Implement `src/dev/traceSlices.ts`**

```ts
/** A Chrome trace event (the fields the reader uses). */
export interface TraceEvent {
  ph: string;
  name: string;
  cat?: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}
export type TraceJson = { traceEvents: TraceEvent[] } | TraceEvent[];

export interface Slice {
  /** ms from the trace's earliest event. */
  startMs: number;
  durMs: number;
  process: string;
  thread: string;
  name: string;
  cat: string;
}

/** Complete ('X') and begin/end ('B'/'E') events lasting at least minMs, named by process and thread, in time order. */
export function slices(trace: TraceJson, minMs: number): Slice[] {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const processes = new Map<number, string>(), threads = new Map<string, string>();
  for (const e of events) {
    if (e.ph !== 'M') continue;
    const name = String(e.args?.name ?? '');
    if (e.name === 'process_name') processes.set(e.pid, name);
    if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, name);
  }
  const t0 = Math.min(...events.filter((e) => e.ph !== 'M').map((e) => e.ts));
  const out: Slice[] = [];
  const push = (e: TraceEvent, durUs: number) => {
    if (durUs / 1000 < minMs) return;
    out.push({ startMs: (e.ts - t0) / 1000, durMs: durUs / 1000, process: processes.get(e.pid) ?? `pid ${e.pid}`,
      thread: threads.get(`${e.pid}:${e.tid}`) ?? `tid ${e.tid}`, name: e.name, cat: e.cat ?? '' });
  };
  const open = new Map<string, TraceEvent[]>();
  for (const e of events) {
    if (e.ph === 'X') push(e, e.dur ?? 0);
    else if (e.ph === 'B') { const k = `${e.pid}:${e.tid}`; (open.get(k) ?? open.set(k, []).get(k)!).push(e); }
    else if (e.ph === 'E') { const b = open.get(`${e.pid}:${e.tid}`)?.pop(); if (b) push(b, e.ts - b.ts); }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/dev/frameLog.test.ts src/dev/traceSlices.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire the log into `App`** (`src/app/App.ts`)

Add the field and the per-frame scratch next to `gpuSampling` (~L431):

```ts
  /** Dev readout (window.liquidDreams.frameLog): the stall log, on only while the profiler asks (ride-stall spec §4). */
  readonly frameLog = new FrameLog();
  /** This frame's ticks per particle system and whether the ribbon rebuilt, for the frame log. */
  private readonly frameTicks = { foam: 0, spray: 0, impact: 0, kelp: 0, ribbon: 0 as 0 | 1 };
```

with `import { FrameLog } from '../dev/frameLog';`. Record the planners' returns where `advance()` is called:

- in `stepFoam`: `const steps = this.foamField.advance(...)` → add `this.frameTicks.foam = steps;` right after.
- in `stepKelp`: likewise `this.frameTicks.kelp = steps;`.
- in `stepSpray` (~L945–951): the spray's `advance` return → `this.frameTicks.spray = …;` and the impact's
  `this.impact.advance(...)` return → `this.frameTicks.impact = …;` (assign the returned numbers; both already return
  the ticks run).
- in `updateRibbon`, right after `this.ribbonKey = key;` (~L1028): `this.frameTicks.ribbon = 1;`.

At the very end of `frame` (the `perf.update()` guard):

```ts
    // GPU timestamp readback only matters while the stats are on screen (or the stall log wants the GPU ms).
    if (this.devUiVisible || this.gpuSampling || this.frameLog.on) this.perf.update();
    if (this.frameLog.on) {
      const gpu = (window as unknown as { __ldGpuMs?: number[] }).__ldGpuMs?.at(-1) ?? 0;
      this.frameLog.record({ t: now, dt: realDt * 1000, sim: this.clock.simTime, gpu, foam: this.frameTicks.foam, spray: this.frameTicks.spray,
        impact: this.frameTicks.impact, kelp: this.frameTicks.kelp, under: this.underwater ? 1 : 0, ribbon: this.frameTicks.ribbon, pending: this.asyncPipelines.pending });
    }
    this.frameTicks.foam = this.frameTicks.spray = this.frameTicks.impact = this.frameTicks.kelp = 0;
    this.frameTicks.ribbon = 0;
```

`perf.update` (`src/dev/perf.ts` L73–88) pushes to `window.__ldGpuMs` whenever it is called and the resolved ms is
> 0, so the guard above is all the wiring the GPU ms needs. Note `realDt` is `clampFrameDt`'s clamped value: the log
needs the raw gap, so take `const prevMs = this.lastMs;` at the top of `frame` (before `this.lastMs = now`) and record
`dt: now - prevMs`. The raw gap is what the stall is.

Run: `npx tsc --noEmit` → clean. `npx vitest run src/dev` → green.

- [ ] **Step 7: The profiler's flags** (`tools/_rideProfile.mjs`)

Add after the `simT` line:

```js
const stall = process.argv.includes('--stall'), trace = process.argv.includes('--trace');
```

and `import { app, BrowserWindow, contentTracing } from 'electron';`. After the frame-time recorder is installed,
install the creation hooks and switch the log on (once; the log is drained per pass):

```js
  if (stall) await win.webContents.executeJavaScript(`(() => {
    const P = GPUDevice.prototype; window.__creates = [];
    for (const m of ['createRenderPipeline', 'createComputePipeline', 'createShaderModule', 'createBuffer', 'createTexture']) {
      const o = P[m];
      P[m] = function (d) { const size = typeof d?.size === 'number' ? d.size : JSON.stringify(d?.size ?? ''); window.__creates.push([performance.now(), m, d?.label ?? '', size]); return o.call(this, d); };
    }
    window.liquidDreams.frameLog.on = true; window.liquidDreams.frameLog.drain(); window.__creates.length = 0;
  })()`);
```

Add two helpers: one empties the log and the creations at a pass's start (so a pass's first record is within a frame
of its trace's start, which `_traceStall.mjs` relies on to align the two clocks), one saves them at its end:

```js
  const stallBegin = async () => { if (stall) await win.webContents.executeJavaScript('window.liquidDreams.frameLog.drain(); window.__creates.length = 0'); };
  const saveStall = async (label) => {
    if (!stall) return;
    const frames = await win.webContents.executeJavaScript('window.liquidDreams.frameLog.drain()');
    const creates = await win.webContents.executeJavaScript('window.__creates.splice(0)');
    writeFileSync(`${out}frames-${label}.json`, JSON.stringify(frames));
    writeFileSync(`${out}creates-${label}.json`, JSON.stringify(creates));
  };
```

Call `await saveStall('cam')` after the cam pass's `frames('cam mode')`, `await saveStall('paddle')` after the
paddling pass's, `await saveStall('ride')` after the riding pass's. For the trace, around the paddling pass and the
riding pass (each its own recording; `contentTracing` records one at a time):

```js
  const traceStart = async () => { if (trace) await contentTracing.startRecording({ included_categories: ['toplevel', 'gpu', 'viz', 'cc', 'disabled-by-default-gpu.dawn'], excluded_categories: ['*'] }); };
  const traceStop = async (label) => { if (trace) await contentTracing.stopRecording(`${out}${label}.trace.json`); };
```

`await stallBegin(); await traceStart();` just before each pass's `Profiler.start` (the cam pass too, without a
trace), `await traceStop('paddle')` / `await traceStop('ride')` right after its `Profiler.stop`. Add one line to the report header after `times`: `stall log ${stall ? 'on' : 'off'},
trace ${trace ? 'on' : 'off'}` so a report says what ran.

- [ ] **Step 8: The trace reader** (`tools/_traceStall.mjs`)

```js
// Slices >= --min (default 30) ms in a Chrome trace, by process and thread, in time order; with --frames=<frames json>
// the riding frames with dt >= --stall (default 200) ms are printed first, with the slices overlapping each one.
// node tools/_traceStall.mjs <trace.json> [--frames=<frames-ride.json>] [--creates=<creates-ride.json>] [--min=30] [--stall=200]
import { readFileSync } from 'node:fs';
import { slices } from '../src/dev/traceSlices.ts';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const min = Number(arg('min', 30)), stallMs = Number(arg('stall', 200));
const trace = JSON.parse(readFileSync(file, 'utf8'));
const all = slices(trace, min);
const events = Array.isArray(trace) ? trace : trace.traceEvents;
const t0 = Math.min(...events.filter((e) => e.ph !== 'M').map((e) => e.ts)) / 1000;
const fmt = (s) => `${s.startMs.toFixed(0).padStart(7)} ms  ${s.durMs.toFixed(0).padStart(5)} ms  ${s.process} / ${s.thread}  ${s.name}  [${s.cat}]`;
const framesFile = arg('frames', null), createsFile = arg('creates', null);
if (framesFile) {
  const frames = JSON.parse(readFileSync(framesFile, 'utf8'));
  const creates = createsFile ? JSON.parse(readFileSync(createsFile, 'utf8')) : [];
  // Trace ts and performance.now() share no origin: align the first frame's t to the trace's first slice window by
  // the profiler's own clock offset, printed so the reader can judge it (the trace starts ~0-50 ms before the pass).
  const offset = frames[0].t - t0;
  console.log(`== frames with dt >= ${stallMs} ms (trace offset ${offset.toFixed(0)} ms assumed: frame t - offset = trace ms)`);
  for (const f of frames) {
    if (f.dt < stallMs) continue;
    const end = f.t - offset, start = end - f.dt;
    console.log(`\nframe at sim ${f.sim.toFixed(2)} s: dt ${f.dt.toFixed(0)} ms, gpu ${f.gpu.toFixed(1)} ms, ticks foam ${f.foam} spray ${f.spray} impact ${f.impact} kelp ${f.kelp}, under ${f.under}, ribbon ${f.ribbon}, pending ${f.pending}`);
    const c = creates.filter((x) => x[0] >= f.t - f.dt && x[0] <= f.t);
    console.log(`   creations in the frame: ${c.length}${c.length ? ' ' + c.map((x) => `${x[1]}(${x[2] || x[3]})`).join(', ') : ''}`);
    for (const s of all) if (s.startMs < end && s.startMs + s.durMs > start) console.log('   ' + fmt(s));
  }
}
console.log(`\n== all slices >= ${min} ms (${all.length})`);
for (const s of all) console.log(fmt(s));
```

Sanity-run it on a trace once Task 3 produces one; here, run `node tools/_traceStall.mjs --help` is not needed: run
`npx tsc --noEmit` (tools are outside `include`, so this checks only that `src/dev` compiles) and the unit tests.

- [ ] **Step 9: Smoke the profiler once at 6 ft with `--stall --trace`**

```bash
npx electron tools/_rideProfile.mjs --ft=6 --sim-t=300 --stall --trace --out=.superpowers/sdd/2026-10-08-ride-stall/smoke-6ft-
```

Expected: the report prints as before with the new header line; `smoke-6ft-frames-ride.json` has ~100–130 records
with `dt`, `sim`, `gpu` (non-zero after the first frames), tick counts (foam 0–2 per frame, spray 0–2), and
`smoke-6ft-ride.trace.json` is non-empty (tens of MB is normal). `node tools/_traceStall.mjs smoke-6ft-ride.trace.json
--frames=smoke-6ft-frames-ride.json --creates=smoke-6ft-creates-ride.json` prints at least one frame with dt ≥ 200 and
the slices over it. If `contentTracing` yields no `disabled-by-default-gpu.dawn` events, note it; the `gpu` and
`toplevel` ones still attribute the GPU process's time.

- [ ] **Step 10: Commit**

```bash
git add src/dev/frameLog.ts src/dev/frameLog.test.ts src/dev/traceSlices.ts src/dev/traceSlices.test.ts tools/_traceStall.mjs tools/_rideProfile.mjs src/app/App.ts
git commit -m "tools(ride-stall): per-frame stall log, GPUDevice creation hooks and Electron content tracing in the ride profiler; trace reader (Task 2)"
```

---

### Task 3: the stall table (then STOP for Gate A)

**Files:**
- Create: `docs/superpowers/evidence/ride-stall/stall-table.md`
- Create: `docs/superpowers/evidence/ride-stall/t3-{6ft,6ft-b,12ft,12ft-b}-report.txt` (copies of the reports)
- Create: `docs/superpowers/evidence/ride-stall/t3-paddle-out.txt` (step 5)

- [ ] **Step 1: The log's cost.** Two cam-only comparisons in one session: run the profiler at 6 ft twice without
  `--stall` and twice with (no `--trace`), read the four `cam mode` lines. Expected: medians within 0.3 ms. Record the
  four lines at the top of `stall-table.md`. If the log costs more, find why before going on (it must be one object
  push per frame).

- [ ] **Step 2: Four focused runs with `--stall --trace`**, 6 ft, 6 ft b, 12 ft, 12 ft b, same session, each with
  `--out=.superpowers/sdd/2026-10-08-ride-stall/t3-<size>-`. Check line 1 of each report says focused at all three
  points; rerun one that was not. Copy each `report.txt` to `docs/superpowers/evidence/ride-stall/t3-<size>-report.txt`.

- [ ] **Step 3: Read each riding pass.** For each run:

```bash
node tools/_traceStall.mjs .superpowers/sdd/2026-10-08-ride-stall/t3-6ft-ride.trace.json --frames=.superpowers/sdd/2026-10-08-ride-stall/t3-6ft-frames-ride.json --creates=.superpowers/sdd/2026-10-08-ride-stall/t3-6ft-creates-ride.json > docs/superpowers/evidence/ride-stall/t3-6ft-trace.txt
node tools/_stallScan.mjs .superpowers/sdd/2026-10-08-ride-stall/t3-6ft-ride.cpuprofile >> docs/superpowers/evidence/ride-stall/t3-6ft-trace.txt
```

(and the same for the other three). Then write `stall-table.md`: one row per riding frame with dt ≥ 200 ms across the
four runs, columns `run | sim s | dt ms | gpu ms (this frame, next frame) | foam/spray/impact/kelp ticks | creations
(count, names) | under | ribbon | pending | trace slices ≥ 30 ms overlapping (process/thread, name, ms)`; below it the
same for the paddling passes (frames ≥ 1000 ms). Add two lines of reading per row: which of spec §5's rows it matches,
and why. If no slice overlaps a stall in any run, rerun one 12 ft pass with the categories
`'disabled-by-default-devtools.timeline'` and `'disabled-by-default-gpu.service'` added to the profiler's list
(temporary edit, reverted) and add its reading.

- [ ] **Step 4: The riding medians**, for the gate's baseline: the four `riding` lines, verbatim, under the table.

- [ ] **Step 5: The paddling frame in the real path.** Read `src/app/loadingScreen.ts` (`frameDrawn` ~L76,
  `release` ~L117, the dissolve condition ~L162 with `holdMet` and `gate.open`) and `App.underCover` (~L1207) and
  write in `t3-paddle-out.txt` whether the cover can dissolve before the replay frame has drawn: cite the lines. Then
  check it live: the profiler's bot cannot drive the front end's menus, so use the page itself in Chrome on the dev
  server (`npm run dev`, `http://localhost:5173/`; not the Electron launcher, which serves a stale `dist/`), with the
  window focused. In the console run `liquidDreams.frameLog.on = true`, go through the front door to "Go surfing",
  wait until on the board, then `copy(JSON.stringify(liquidDreams.frameLog.drain().filter(f => f.dt > 500)))` and
  paste the frames into the file. Alongside, the moment the cover dissolved: add a one-line `console.info` with
  `performance.now()` in `loadingScreen.ts`'s `dissolve` for the check (reverted before the commit) and copy it.
  Verdict line: "hidden by the cover (the replay frame drew N ms before the dissolve)" or "visible: N ms after".

- [ ] **Step 6: Commit, ledger, push, and STOP.**

```bash
git add docs/superpowers/evidence/ride-stall/
git commit -m "evidence(ride-stall): stall table from four focused runs with the frame log, creation hooks and content traces; the paddle-out cover's verdict (Task 3)"
git push -u origin ride-stall
```

Paste `stall-table.md` and `t3-paddle-out.txt` to Fable. **Do not start Task 4.** Fable rules the cause (spec §5) and
writes Task 4 as an addendum below.

---

### Task 4: the fix (addendum by Fable after Gate A)

Written once the stall table is read. It will be one of the spec's §5 rows, in this plan's step style, with its test
first. The gate it must meet (spec §3): two focused runs per size, `riding max ≤ 2 × riding median` in all four,
median within ±10 % of Task 3's, and `PROBE_RIDE_STATIONS=1 npx vitest run src/ride/rideStations.probe.test.ts`
reading `lazy (R9)` 0.00 cm, 972 / 982 sums. The three recipes, so the addendum is a choice, not a design:

- **H1 (a GPU burst): a per-frame tick cap in `FoamSchedule.planTicks`** (`src/whitewater/foamStep.ts` L86–94),
  `planTicks(simTime, replayTicks, maxPerFrame = Infinity)`: on a replay, `clear` is true and the plan holds the first
  `maxPerFrame` ticks; `this.last` is set to the last tick *planned*, not `k`, so the next frame continues from there
  (the second branch, `ticksFrom(last + 1, k)`, carries the remainder; a frame that still exceeds `maxPerFrame` takes
  the next slice). The test (Review Focus 5): for `k = 1000`, `replayTicks = 240`, `maxPerFrame = 30`, the plans of
  frames at the same simTime (then advancing one tick per frame) have `clear` true only on the first and the union of
  their ticks equals `ticksFrom(761, 1000)` plus the advanced ticks, with no tick twice. The cap value is chosen from
  the table (GPU ms per tick), so a replay's frames stay under ~16 ms of GPU; under the paddle-out cover the cover's
  steady-frame gate waits for it. The foam's `prepare(tₖ)` already points the source at each tick's time, so a spread
  draws the same map at the end. The same cap goes to the spray's, impact's and kelp's `planTicks` calls.
- **H2 (a GPU-process build): a prewarm at ride start**, in `App.startRide` before `catchSetWave`, through
  `withOnlyShown(this.scene, [mesh], () => this.asyncPipelines.build(() => this.picture.render(target)))` for the mesh
  the table names (the pattern of `App.prewarm` L711–740, a throwaway `captureTarget`-sized target), awaited under the
  paddle-out cover (`paddleOut` is already async and under `underCover`). If the table names a *compute* pipeline,
  `renderer.compileComputeAsync(pass)` for it there. If it names an allocation (`createBuffer`/`createTexture` with a
  large size), size it once at construction (a capacity, like the spray pool) instead of per use.
- **H3 (presentation): no game change.** A same-session A/B of the profiler with `win.setAlwaysOnTop(false)` and
  `grab()` kept; report both to Andrew with the trace slices. If the stall moves with the flag, the profiler is the
  cause and the player never sees it; say so and close the segment at Task 5.

---

### Task 5: handovers

**Files:**
- Create: `docs/superpowers/handover/2026-10-08-ride-stall-opus.md`
- Create: `docs/superpowers/handover/2026-10-08-ride-stall-fable.md`

- [ ] **Step 1: `…-ride-stall-opus.md`**: the branch and its commits; the suite summary (`npx vitest run`, the
  baseline count and any new reds with file names); the stall table (copied, not linked); the paddle-out verdict; the
  Task 4 before/after riding lines (all four runs each side) and the probe's two lines; gotchas met (ports, focus,
  trace size, categories that yielded nothing); deferred minors.
- [ ] **Step 2: `…-ride-stall-fable.md`**: the cause as ruled and the evidence row that decided it; what changed and
  what did not (the ride's water untouched: the probe's lines); what is left (the carried follow-ups from the spec §7,
  plus anything Task 3 saw that is not the stall, e.g. the sound system's 264 ms `AudioContext` gesture frame in the
  paddling profile of r10b-6ft); the next segment's first step per memory `ride-framerate` (wave form step 4).
- [ ] **Step 3: Commit and push**

```bash
git add docs/superpowers/handover/2026-10-08-ride-stall-opus.md docs/superpowers/handover/2026-10-08-ride-stall-fable.md
git commit -m "docs(ride-stall): handovers (Task 5)"
git push
```
