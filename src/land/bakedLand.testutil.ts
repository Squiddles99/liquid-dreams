/**
 * Test-only: the committed land file, read from disk. vitest runs in Node, but the app's tsconfig carries no Node types,
 * so Node's fs is reached through process.getBuiltinModule (Node 22+).
 */
export function readBakedLand(): Uint8Array {
  const proc = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
  const fs = proc.getBuiltinModule('node:fs') as { readFileSync(p: URL): Uint8Array };
  return new Uint8Array(fs.readFileSync(new URL('../../public/terrain/womb-land.bin', import.meta.url)));
}
