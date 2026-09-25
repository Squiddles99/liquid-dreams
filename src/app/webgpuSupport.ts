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
