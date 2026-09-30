import { describe, expect, it } from 'vitest';
import { readBakedLand } from './bakedLand.testutil';
import { type LandBuild, offThreadBuilder } from './landBuild';
import { DEFAULT_LAND_PARAMS, beachProfileFor } from './landParams';

/** A stand-in Worker: answers each request with `answer`, or fails. */
function fakeWorker(answer: ((req: { bytes: Uint8Array }) => LandBuild) | 'fail') {
  const w = {
    onmessage: null as ((e: { data: LandBuild }) => void) | null,
    onerror: null as ((e: { message: string }) => void) | null,
    terminated: false,
    postMessage(req: { bytes: Uint8Array }) {
      setTimeout(() => (answer === 'fail' ? w.onerror?.({ message: 'boom' }) : w.onmessage?.({ data: answer(req) })));
    },
    terminate() { w.terminated = true; },
  };
  return w;
}

describe('building the land off the main thread', () => {
  const profile = beachProfileFor(DEFAULT_LAND_PARAMS);

  it("hands the worker the file and the beach profile, and returns the worker's build, then lets the worker go", async () => {
    const built = { mesh: { positions: new Float32Array(3) }, march: new Float32Array(1) } as unknown as LandBuild;
    let asked: unknown = null;
    const w = fakeWorker((req) => { asked = req; return built; });
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await offThreadBuilder(() => w as unknown as Worker)(bytes, profile)).toBe(built);
    expect(asked).toEqual({ bytes, profile });
    expect(w.terminated).toBe(true);
  });

  it('builds on the main thread instead when the worker fails', async () => {
    const w = fakeWorker('fail');
    const b = await offThreadBuilder(() => w as unknown as Worker)(readBakedLand(), profile);
    expect(b.mesh.triangles).toBeGreaterThan(0);
    expect(b.march.length).toBeGreaterThan(0);
    expect(w.terminated).toBe(true);
  }, 30_000);

  it('builds on the main thread instead when there are no workers (node, the self-tests)', async () => {
    const b = await offThreadBuilder(() => { throw new Error('no Worker'); })(readBakedLand(), profile);
    expect(b.mesh.triangles).toBeGreaterThan(0);
  }, 30_000);

});

