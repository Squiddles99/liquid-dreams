import { readFileSync } from 'node:fs';

/** A float accessor's values from a .glb's binary chunk (tests only). */
export function glbFloats(path: string, gltf: any, accessorIndex: number): Float32Array {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const jsonLen = v.getUint32(12, true), binStart = 20 + jsonLen + 8;
  const acc = gltf.accessors[accessorIndex], view = gltf.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type as 'SCALAR'];
  const start = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return new Float32Array(b.buffer.slice(b.byteOffset + start, b.byteOffset + start + acc.count * comps * 4));
}
