import { describe, expect, it } from 'vitest';
import { TrackNetwork, routeTracks } from '../land/tracks';
import { testLand } from '../land/testLand';
import { SCATTER_CELL_M, type ScatterContext, type ScatterItem, cellScatter } from './nearScatter';

const route = testLand();
const net = new TrackNetwork(routeTracks(route, [-300, 300]));
/** The test land with its tracks; crowns over a checkerboard of 3 m squares; limestone in a band 60–66 m inland. */
function context(density = 1): ScatterContext {
  return {
    land: { heightAt: (x, z) => route.baseHeightAt(x, z) - net.sinkAt(x, z), waterlineAt: (z) => route.waterlineAt(z), profile: route.profile, trackNetwork: net },
    plants: (x, z) => {
      const under = !net.onTrack(x, z) && (Math.floor(x / 3) + Math.floor(z / 3)) % 2 === 0 && x - 190 > 60;
      return { underCrown: under, crownKind: under ? 'daisy' : null };
    },
    surfaceAt: (x, z) => route.baseHeightAt(x, z) - net.sinkAt(x, z),
    density,
    rockNear: (x) => x - 190 > 60 && x - 190 < 66,
  };
}
/** The cells over the beach path and the clearing, and a stretch of heath beside the Cape to Cape. */
function cells(): [number, number][] {
  const out = new Map<string, [number, number]>();
  const add = (x: number, z: number): void => {
    const ci = Math.floor(x / SCATTER_CELL_M), cj = Math.floor(z / SCATTER_CELL_M);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) out.set(`${ci + a},${cj + b}`, [ci + a, cj + b]);
  };
  for (const [x, z] of net.data.pieces[1].points.filter((_, i) => i % 3 === 0)) add(x, z);
  for (const [x, z] of net.data.pieces[0].points.filter((_, i) => i % 3 === 0 && i > 500 && i < 560)) add(x, z);
  return [...out.values()];
}
const all = (ctx: ScatterContext): ScatterItem[] => cells().flatMap(([ci, cj]) => cellScatter(ci, cj, ctx));

describe('cellScatter (dune-up-close §4.4)', () => {
  const ctx = context();
  const items = all(ctx);
  it('lays a fair amount of each kind somewhere', () => {
    for (const k of ['tuft_clubrush', 'tuft_swordsedge', 'tuft_tussock', 'item_twig', 'item_stone', 'item_leaves_daisy', 'item_shell']) {
      expect(items.some((i) => i.kind === k), k).toBe(true);
    }
  });
  it('grows tussock-grass only on sand by the beach, and lays shells only within 60 m of the water', () => {
    const toe = route.profile.wetWidthM + route.profile.dryWidthM + route.profile.toeWidthM;
    for (const it of items.filter((i) => i.kind === 'tuft_tussock')) expect(it.x - 190).toBeLessThanOrEqual(toe + 2);
    for (const it of items.filter((i) => i.kind === 'item_shell')) expect(it.x - 190).toBeLessThanOrEqual(60);
  });
  it('grows no tuft on the beach below its back (none in the swash, even by the boulders there)', () => {
    const dryEnd = route.profile.wetWidthM + route.profile.dryWidthM;
    const wetRocks: ScatterContext = { ...context(), rockNear: (x) => x - route.waterlineAt(0) < 12 || (x - 190 > 60 && x - 190 < 66) };
    const tufts = all(wetRocks).filter((i) => i.kind.startsWith('tuft_'));
    expect(tufts.length).toBeGreaterThan(0);
    for (const it of tufts) expect(it.x - route.waterlineAt(it.z), it.kind).toBeGreaterThanOrEqual(dryEnd - 4);
  });
  it('grows sword-sedge only by limestone', () => {
    for (const it of items.filter((i) => i.kind === 'tuft_swordsedge')) expect(ctx.rockNear(it.x, it.z)).toBe(true);
  });
  it('keeps track centres all but bare (one item per 10 m at most) and grows no tufts on a track', () => {
    const onCentre = items.filter((i) => net.nearest(i.x, i.z).d < 0.2 && !net.inClearing(i.x, i.z));
    const length = net.data.pieces[1].points.length;
    expect(onCentre.length).toBeLessThanOrEqual(Math.ceil(length / 10) + 2);
    for (const it of items.filter((i) => i.kind.startsWith('tuft_'))) expect(net.onTrack(it.x, it.z)).toBe(false);
  });
  it('sits each item on the ground, sunk 1–2 cm', () => {
    for (const it of items.slice(0, 400)) {
      const g = ctx.surfaceAt(it.x, it.z);
      expect(g - it.y).toBeGreaterThanOrEqual(0.01 - 1e-6);
      expect(g - it.y).toBeLessThanOrEqual(0.02 + 1e-6);
    }
  });
  it('lays the same items for a cell whatever else is asked', () => {
    const [ci, cj] = cells()[40];
    expect(cellScatter(ci, cj, ctx)).toEqual(cellScatter(ci, cj, context()));
  });
  it('with plant density 0 keeps the stones and twigs and grows no tufts (Review Focus 2)', () => {
    const none = all(context(0));
    expect(none.some((i) => i.kind.startsWith('tuft_'))).toBe(false);
    expect(none.some((i) => i.kind === 'item_stone')).toBe(true);
  });
});
