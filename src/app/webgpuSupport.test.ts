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
