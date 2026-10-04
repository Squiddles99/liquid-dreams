// The start-up loading bar (loading screens spec §1.2): five stages, each a share of the bar by how long it takes.

export type StageId = 'gpu' | 'world' | 'reef' | 'heath' | 'crew';

export interface Stage {
  id: StageId;
  line: string;
  /** Its share of the bar (the shares sum to 1). */
  weight: number;
  /** How long it usually takes on Andrew's RTX 4060 (ms): the creep's pace. */
  expectedMs: number;
}

/** In order. Weights and times are first guesses until they are measured. */
export const STAGES: readonly Stage[] = [
  { id: 'gpu', line: 'Waking the GPU…', weight: 0.1, expectedMs: 400 },
  { id: 'world', line: 'Swell rolling in…', weight: 0.2, expectedMs: 1500 },
  { id: 'reef', line: 'Laying the reef…', weight: 0.35, expectedMs: 3000 },
  { id: 'heath', line: 'Growing the heath…', weight: 0.25, expectedMs: 2500 },
  { id: 'crew', line: 'Waking the crew…', weight: 0.1, expectedMs: 800 },
];

/** How far through its span a stage's bar has crept (0 → 0.95, about 0.9 at the expected duration). */
export function creep(elapsedMs: number, expectedMs: number): number {
  return 0.95 * (1 - Math.exp((-3 * Math.max(0, elapsedMs)) / expectedMs));
}

/** Which stages are done; the bar's target is their shares, plus the creep of the first one not yet done. */
export class BootProgress {
  private readonly finished = new Set<StageId>();
  private currentSince: number;

  constructor(startMs: number) {
    this.currentSince = startMs;
  }

  done(id: StageId, nowMs: number): void {
    if (this.finished.has(id)) return;
    const before = this.current;
    this.finished.add(id);
    if (this.current !== before) this.currentSince = nowMs;
  }

  isDone(id: StageId): boolean {
    return this.finished.has(id);
  }

  get allDone(): boolean {
    return this.finished.size === STAGES.length;
  }

  /** The first stage not yet done (its line is the one shown), or null when all are. */
  get current(): Stage | null {
    return STAGES.find((s) => !this.finished.has(s.id)) ?? null;
  }

  target(nowMs: number): number {
    let t = 0;
    for (const s of STAGES) if (this.finished.has(s.id)) t += s.weight;
    const c = this.current;
    if (c) t += c.weight * creep(nowMs - this.currentSince, c.expectedMs);
    return Math.min(1, t);
  }
}

/** What the bar shows: it eases toward the target (within 1% in 250 ms) and never goes back. */
export class BarFollower {
  shown = 0;

  step(target: number, dtMs: number): number {
    if (target > this.shown) this.shown = target - (target - this.shown) * Math.exp(-Math.max(0, dtMs) / 50);
    return this.shown;
  }
}
