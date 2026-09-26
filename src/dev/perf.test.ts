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
