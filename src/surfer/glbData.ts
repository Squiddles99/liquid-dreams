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

/** Any accessor's values as floats (normalised integers scaled to 0–1), e.g. a COLOR_0 stored as unsigned shorts. */
export function glbValues(path: string, gltf: any, accessorIndex: number): Float32Array {
  const acc = gltf.accessors[accessorIndex];
  if (acc.componentType === 5126) return glbFloats(path, gltf, accessorIndex);
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const jsonLen = v.getUint32(12, true), binStart = 20 + jsonLen + 8;
  const view = gltf.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type as 'SCALAR'];
  const size = { 5121: 1, 5123: 2 }[acc.componentType as 5121];
  const max = size === 1 ? 255 : 65535, stride = view.byteStride ?? comps * size;
  const start = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++) for (let c = 0; c < comps; c++) {
    const at = start + i * stride + c * size;
    out[i * comps + c] = (size === 1 ? v.getUint8(at) : v.getUint16(at, true)) / (acc.normalized ? max : 1);
  }
  return out;
}

/** The JSON chunk of a .glb (the binary glTF container: 12-byte header, then a JSON chunk). */
export function glbJson(path: string): any {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  if (v.getUint32(16, true) !== 0x4e4f534a) throw new Error(`${path}: the first chunk is not JSON`);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + v.getUint32(12, true))));
}
