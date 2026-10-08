import { describe, expect, it } from 'vitest';
import { passMarker, slices } from './traceSlices';

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
  it('reads a trace of a million events (a 58 MB riding trace overflowed Math.min(...spread))', () => {
    const events = Array.from({ length: 1_000_000 }, (_, i) => ({ ph: 'X', name: 'tick', pid: 1, tid: 1, ts: 5_000 + i, dur: 1 }));
    events.push({ ph: 'X', name: 'Long', pid: 1, tid: 1, ts: 2_000_000, dur: 40_000 });
    expect(slices(events, 30)).toEqual([{ startMs: 1995, durMs: 40, process: 'pid 1', thread: 'tid 1', name: 'Long', cat: '' }]);
  });
  it('finds the pass marker: performance.now() at the mark, in trace ms', () => {
    const out = passMarker([
      { ph: 'X', name: 'a', pid: 1, tid: 1, ts: 1_000_000, dur: 1 },
      { ph: 'R', name: 'ldStall:68400.5', cat: 'blink.user_timing', pid: 2, tid: 2, ts: 1_250_000 },
    ]);
    expect(out).toEqual({ nowMs: 68400.5, traceMs: 250 });
    expect(passMarker([{ ph: 'X', name: 'a', pid: 1, tid: 1, ts: 0, dur: 1 }])).toBeNull();
  });
});
