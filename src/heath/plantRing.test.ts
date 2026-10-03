import { describe, expect, it } from 'vitest';
import { CellQueue, PlantRing, WorkQueue, layBudgetMs } from './plantRing';

describe('PlantRing', () => {
  it('adds every cell within the radius on the first move and nothing on a repeat', () => {
    const r = new PlantRing(20);
    const first = r.move(0, 0);
    expect(first.every((c) => c.add)).toBe(true);
    expect(first.length).toBeGreaterThan(70);
    expect(r.move(0, 0)).toEqual([]);
  });
  it('after each move adds the cells that entered and drops those that left: a walk ends where a fresh ring starts', () => {
    const a = new PlantRing(40, 37), held = new Set<number>();
    let x = 0, z = 0;
    for (let s = 0; s <= 200; s += 1.7) {
      x = s;
      z = 0.3 * s;
      for (const c of a.move(x, z)) {
        if (c.add) held.add(c.key);
        else held.delete(c.key);
      }
    }
    const fresh = new Set(new PlantRing(40, 37).move(x, z).map((c) => c.key));
    expect([...held].sort((p, q) => p - q)).toEqual([...fresh].sort((p, q) => p - q));
  });
  it("keeps the inner disc out (the near and mid bands are the kit's, not the hulls')", () => {
    const keys = new PlantRing(60, 40).move(0, 0);
    for (const c of keys) expect(Math.hypot((c.ci + 0.5) * 4, (c.cj + 0.5) * 4)).toBeGreaterThanOrEqual(40 - 4 * Math.SQRT2 - 1e-9);
  });
});

describe('WorkQueue', () => {
  it('stops when the budget is spent but always runs one', () => {
    const q = new WorkQueue<number>();
    q.push(1, 2, 3, 4);
    let t = 0;
    const ran: number[] = [];
    const left = q.drain((n) => { ran.push(n); t += 1; }, 1.5, () => t);
    expect(ran).toEqual([1, 2]);
    expect(left).toBe(2);
  });
  it("after a 500 m jump, lays every cell within 12 m in the first frame and the rest within 50 (under a second), under the game's budget (Review Focus 5)", () => {
    const r = new PlantRing(200, 0), q = new CellQueue();
    r.move(0, 0);
    q.push(...r.move(500, 0));
    const near = new PlantRing(12 + 4 * Math.SQRT2).move(500, 0).map((c) => c.key);
    let frames = 0, t = 0;
    const laid = new Set<number>();
    // ~30 µs to make and lay a new cell's plants, a few µs to drop one (measured in the game, ledger Task 7).
    while (q.length && frames < 80) {
      q.drain((c) => { t += c.add ? 0.03 : 0.003; if (c.add) laid.add(c.key); }, layBudgetMs(q.length), () => t);
      frames++;
      if (frames === 1) for (const k of near) expect(laid.has(k)).toBe(true);
    }
    expect(near.length).toBeGreaterThan(20);
    expect(frames).toBeLessThanOrEqual(50);
  });
});

describe('CellQueue', () => {
  it("holds one change per cell (the latest wins) and keeps the first push's place in line", () => {
    const q = new CellQueue();
    q.push({ key: 1, ci: 0, cj: 0, add: true }, { key: 2, ci: 1, cj: 0, add: true });
    for (let i = 0; i < 1000; i++) q.push({ key: 1, ci: 0, cj: 0, add: i % 2 === 0 });
    expect(q.length).toBe(2);
    const ran: [number, boolean][] = [];
    q.drain((c) => { ran.push([c.key, c.add]); }, 100, () => 0);
    expect(ran).toEqual([[1, false], [2, true]]);
  });
});
