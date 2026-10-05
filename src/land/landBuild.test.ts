import { describe, expect, it } from 'vitest';
import { readBakedLand } from './bakedLand.testutil';
import { type LandBuild, buildLand, offThreadBuilder } from './landBuild';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { TrackNetwork, clearingGrade, routeTracks } from './tracks';
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
    // The budget is for the game's worker on a core of its own; vitest's other test processes, running alongside, slow
    // the wall clock several times over (the routing alone takes ~130 ms). The best of three takes the least of that.
    let ms = Infinity, t = routeTracks(lh, lh.fineZRange());
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      t = routeTracks(lh, lh.fineZRange());
      ms = Math.min(ms, performance.now() - t0);
    }
    console.log(`routeTracks on the baked land: best of three ${ms.toFixed(0)} ms, Cape to Cape ${t.pieces[0].points.length} points, junction (${t.junction.x.toFixed(1)}, ${t.junction.z.toFixed(1)})`);
    expect(ms).toBeLessThan(500);
    const b = buildLand(lh);
    expect(b.tracks.pieces.map((p) => p.name)).toEqual(['capeToCape', 'beachPath']);
    expect(structuredClone(b.tracks)).toEqual(b.tracks);
  }, 30_000);
  it('stands the crew on near-level ground and walks them down to the beach at 0.35 or less over any 2 m (§7.2)', () => {
    const lh = new LandHeight(decodeLandFile(readBakedLand()), beachProfileFor(DEFAULT_LAND_PARAMS));
    const t = routeTracks(lh, lh.fineZRange()), j = t.junction, s = new TrackNetwork(t).standSpot();
    expect(clearingGrade(lh, j.x, j.z, j.along)).toBeLessThan(0.2);
    // The stand spot's own ground, its small relief included (keyed to world x: it re-rolled when the land moved in with the
    // reef, 2026-10-05, from 0.2 to 0.25): under 0.3, 17°, well off the 25° bank Andrew saw the crew on.
    expect(Math.hypot(lh.baseHeightAt(s.x + 0.5, s.z) - lh.baseHeightAt(s.x - 0.5, s.z), lh.baseHeightAt(s.x, s.z + 0.5) - lh.baseHeightAt(s.x, s.z - 0.5))).toBeLessThan(0.3);
    // Over 2 m walked along the path (across a switchback's hairpin the straight line is a shortcut nobody walks).
    const bp = t.pieces[1].points, over: string[] = [];
    for (let i = 0; i < bp.length; i++) {
      let d = 0;
      for (let k = i + 1; k < bp.length; k++) {
        d += Math.hypot(bp[k][0] - bp[k - 1][0], bp[k][1] - bp[k - 1][1]);
        if (d < 2) continue;
        const g = Math.abs(lh.baseHeightAt(bp[k][0], bp[k][1]) - lh.baseHeightAt(bp[i][0], bp[i][1])) / d;
        if (g > 0.35) over.push(`(${bp[i][0].toFixed(1)}, ${bp[i][1].toFixed(1)}) ${g.toFixed(2)}`);
        break;
      }
    }
    expect(over).toEqual([]);
  }, 30_000);
});
