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
