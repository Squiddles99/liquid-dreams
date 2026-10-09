// One curl per breaking line, on one clock (spec 2026-10-08-one-curl-one-clock §3a): computed once in the reef bake, so the
// ribbon's stations, the CPU sheet and the GPU sheet all read the same onset times.

/** The peel stretch's neighbours (reefField.peelLines): a level's onset nodes this many cells apart are one section. */
export const PEEL_NEIGHBOUR_CELLS = 3;
/**
 * A level's onset nodes this many cells apart are one breaking line for the curl (and its steps along the line). Wider than
 * the peel stretch's: on the real field at 6 ft the north ledge's onset band has gaps of up to ~6 m (at 3 cells it split
 * into four lines, each curling on its own), and a reef head that juts seaward breaks a pocket off the band by its jut.
 */
export const CURL_LINK_CELLS = 10;
/** A neighbour is upwind of a node (the curl reaches the node through it) when the line's distance from the first break
 * grows by at least this share of the step between them: the other side of the peak, and neighbours beside the node across
 * the band of onset nodes, are not. */
const UPWIND_SHARE = 0.5;

/**
 * Each onset node's breaking line (−1 off the onset nodes): the connected groups of a level's onset nodes (`T` finite),
 * linked within CURL_LINK_CELLS. Unlike the peel stretch's sections (peelLines), a pocket that broke early down the
 * line is part of the line the curl runs along: the curl holds it.
 */
export function breakingLines(T: ArrayLike<number>, nx: number, nz: number): Int32Array {
  const n = nx * nz, parent = new Int32Array(n).fill(-1);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (let i = 0; i < n; i++) if (Number.isFinite(T[i])) parent[i] = i;
  const R = CURL_LINK_CELLS;
  for (let i = 0; i < n; i++) {
    if (parent[i] < 0) continue;
    const col = i % nx, row = (i - col) / nx;
    // Each pair once: the neighbours after i in scan order.
    for (let dr = 0; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      if (dr === 0 && dc <= 0) continue;
      const c = col + dc, r = row + dr;
      if (c < 0 || c >= nx || r >= nz) continue;
      const j = r * nx + c;
      if (parent[j] < 0) continue;
      const a = find(i), b = find(j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const out = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (parent[i] >= 0) out[i] = find(i);
  return out;
}

/**
 * The curl's time at every onset node (NaN where `T` is): from each line's first break (its smallest T) outward, in order of
 * the distance s along the line (shortest paths over the line's own nodes, CURL_LINK_CELLS apart),
 *
 *   T′(i) = max(T(i), max_j T′(j), min_j (T′(j) + d(i, j) / curlMaxMs)),   capped at T(i) + maxHoldS,
 *
 * j over i's upwind neighbours (already reached, s(i) − s(j) ≥ ½ d(i, j)). The middle term is the curl never retreating (a
 * pocket that would break early waits for it), the last its top speed (it reaches a node no sooner than from its nearest
 * upwind neighbour at curlMaxMs); the first break keeps T₀. The cap is the peel stretch's (a held wall never runs on into the
 * shallows): where the reef would hold a section longer, the curl steps back there. A line already non-decreasing in s, at
 * an unbounded speed, comes out unchanged.
 */
export function curlTimes(T: ArrayLike<number>, lineOf: Int32Array, nx: number, nz: number, cellM: number, curlMaxMs: number, maxHoldS: number): Float32Array {
  const n = nx * nz, out = new Float32Array(n).fill(Number.NaN);
  const s = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  const first = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const l = lineOf[i];
    if (l < 0 || !Number.isFinite(T[i])) continue;
    const f = first.get(l);
    if (f === undefined || T[i] < T[f]) first.set(l, i);
  }
  const R = CURL_LINK_CELLS, slow = Number.isFinite(curlMaxMs) && curlMaxMs > 0 ? 1 / curlMaxMs : 0;
  const heap = new MinHeap();
  for (const [line, src] of first) {
    s[src] = 0;
    heap.push(0, src);
    while (heap.size > 0) {
      const [si, i] = heap.pop();
      if (done[i] || si > s[i]) continue;
      done[i] = 1;
      const col = i % nx, row = (i - col) / nx;
      let latest = -Infinity, soonest = Infinity, any = false;
      for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
        if (dr === 0 && dc === 0) continue;
        const c = col + dc, r = row + dr;
        if (c < 0 || r < 0 || c >= nx || r >= nz) continue;
        const j = r * nx + c;
        if (lineOf[j] !== line) continue;
        const d = Math.hypot(dc, dr) * cellM;
        if (done[j]) {
          if (j !== i && si - s[j] >= UPWIND_SHARE * d) {
            any = true;
            latest = Math.max(latest, out[j]);
            soonest = Math.min(soonest, out[j] + d * slow);
          }
        } else if (si + d < s[j]) {
          s[j] = si + d;
          heap.push(s[j], j);
        }
      }
      const t = T[i];
      out[i] = any ? Math.min(Math.max(t, latest, soonest), t + maxHoldS) : t;
    }
  }
  return out;
}

/** A binary min-heap of (key, node). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, v: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(k); vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p]; vals[i] = vals[p]; i = p;
    }
    keys[i] = k; vals[i] = v;
  }
  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0], vals[0]];
    const k = keys.pop()!, v = vals.pop()!;
    if (keys.length > 0) {
      let i = 0;
      for (;;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i, mk = k;
        if (a < keys.length && keys[a] < mk) { m = a; mk = keys[a]; }
        if (b < keys.length && keys[b] < mk) { m = b; mk = keys[b]; }
        if (m === i) break;
        keys[i] = keys[m]; vals[i] = vals[m]; i = m;
      }
      keys[i] = k; vals[i] = v;
    }
    return top;
  }
}
