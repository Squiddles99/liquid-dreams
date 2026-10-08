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
