import { describe, expect, it } from 'vitest';
import { readBakedLand } from './bakedLand.testutil';
import { type LandBuild, buildLand, offThreadBuilder } from './landBuild';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { routeTracks } from './tracks';
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


describe('the tracks come with the build (dune-up-close §4.1)', () => {
  it('routes them on the real land within 500 ms, and they survive the worker boundary (Review Focus 1)', () => {
    const lh = new LandHeight(decodeLandFile(readBakedLand()), beachProfileFor(DEFAULT_LAND_PARAMS));
    const t0 = performance.now();
    const t = routeTracks(lh, lh.fineZRange());
    const ms = performance.now() - t0;
    console.log(`routeTracks on the baked land: ${ms.toFixed(0)} ms, Cape to Cape ${t.pieces[0].points.length} points, junction (${t.junction.x.toFixed(1)}, ${t.junction.z.toFixed(1)})`);
    expect(ms).toBeLessThan(500);
    const b = buildLand(lh);
    expect(b.tracks.pieces.map((p) => p.name)).toEqual(['capeToCape', 'beachPath']);
    expect(structuredClone(b.tracks)).toEqual(b.tracks);
  }, 30_000);
});
