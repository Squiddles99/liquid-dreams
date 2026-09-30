import { buildLand } from './landBuild';
import { decodeLandFile } from './landData';
import { type BeachProfile, LandHeight } from './landHeight';

// This file runs in a dedicated worker, but the project's DOM lib types `self` as Window: cast once here.
const worker = self as unknown as Worker;

worker.onmessage = (e: MessageEvent<{ bytes: Uint8Array; profile: BeachProfile }>) => {
  const b = buildLand(new LandHeight(decodeLandFile(e.data.bytes), e.data.profile));
  const m = b.mesh;
  worker.postMessage(b, [m.positions, m.normals, m.cover, m.detail, m.zones, m.indices, b.march].map((a) => a.buffer as ArrayBuffer));
};
