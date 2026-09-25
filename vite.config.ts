import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  // Pre-bundle both three entry points so a lazily imported `three/tsl` (e.g. the ?selftest path)
  // never triggers a late dependency discovery, a duplicate three instance and a page reload.
  optimizeDeps: { include: ['three/webgpu', 'three/tsl'] },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
