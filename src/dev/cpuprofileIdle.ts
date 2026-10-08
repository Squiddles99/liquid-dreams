/** The Chrome DevTools .cpuprofile shape (the fields the scanner reads). */
export interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

export interface IdleRun {
  /** ms from the profile's start to the run's first sample. */
  startMs: number;
  durationMs: number;
  firstIndex: number;
  lastIndex: number;
  /** The sample before the run and the first non-idle sample after it: 6 frames, leaf first, "name file:line". */
  before: string[];
  after: string[];
}

const shortUrl = (u: string): string => u.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '').replace('node_modules/.vite/deps/', 'nm/');

function indexes(p: CpuProfile) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const stackOf = (id: number, depth = 6): string[] => {
    const s: string[] = [];
    for (let x: number | undefined = id; x !== undefined && s.length < depth; x = parent.get(x)) {
      const n = byId.get(x)!;
      s.push(`${n.callFrame.functionName || '(anon)'} ${shortUrl(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`);
    }
    return s;
  };
  const idle = new Set(p.nodes.filter((n) => n.callFrame.functionName === '(idle)').map((n) => n.id));
  // t[i]: ms from the start to sample i (timeDeltas are µs, each the gap before its sample).
  const t: number[] = [];
  let acc = 0;
  for (let i = 0; i < p.samples.length; i++) { acc += p.timeDeltas[i] / 1000; t.push(acc); }
  return { stackOf, idle, t };
}

/** Contiguous runs of (idle) samples lasting at least minMs: where the main thread waited for the next frame. */
export function idleRuns(p: CpuProfile, minMs: number): IdleRun[] {
  const { stackOf, idle, t } = indexes(p);
  const out: IdleRun[] = [];
  let start = 0;
  for (let i = 1; i <= p.samples.length; i++) {
    const same = i < p.samples.length && idle.has(p.samples[i]) === idle.has(p.samples[start]);
    if (same) continue;
    if (idle.has(p.samples[start])) {
      const durationMs = t[i - 1] - t[start] + p.timeDeltas[start] / 1000;
      if (durationMs >= minMs) {
        let after = i;
        while (after < p.samples.length && idle.has(p.samples[after])) after++;
        out.push({ startMs: t[start] - p.timeDeltas[start] / 1000, durationMs, firstIndex: start, lastIndex: i - 1,
          before: start > 0 ? stackOf(p.samples[start - 1]) : [], after: after < p.samples.length ? stackOf(p.samples[after]) : [] });
      }
    }
    start = i;
  }
  return out;
}

/** The biggest single gaps between samples (a blocked sampler), largest first, with the stack of the sample after. */
export function gaps(p: CpuProfile, top: number): { atMs: number; ms: number; stack: string[] }[] {
  const { stackOf, t } = indexes(p);
  return p.timeDeltas.map((d, i) => ({ atMs: t[i], ms: d / 1000, stack: stackOf(p.samples[i]) })).sort((a, b) => b.ms - a.ms).slice(0, top);
}
