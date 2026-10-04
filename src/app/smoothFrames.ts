// When the cover may dissolve (loading screens spec §2, §4): the world drawing smoothly behind it, and long enough on screen.

export const SMOOTH = { frames: 10, underMs: 33, giveUpMs: 4000 } as const;

/** Opens after SMOOTH.frames frames in a row under SMOOTH.underMs, or SMOOTH.giveUpMs after the work is done. */
export class SmoothFramesGate {
  private run = 0;
  private isOpen = false;

  /** `startMs`: when the work behind the cover finished. Make the gate then: only frames after it count. */
  constructor(private readonly startMs: number) {}

  frame(dtMs: number, nowMs: number): boolean {
    if (this.isOpen) return true;
    this.run = dtMs < SMOOTH.underMs ? this.run + 1 : 0;
    if (this.run >= SMOOTH.frames || nowMs - this.startMs >= SMOOTH.giveUpMs) this.isOpen = true;
    return this.isOpen;
  }

  get open(): boolean {
    return this.isOpen;
  }
}

/** Whether the cover has been fully in for `minHoldMs` (null: not fully in yet). */
export function holdMet(coverInAtMs: number | null, nowMs: number, minHoldMs: number): boolean {
  return coverInAtMs !== null && nowMs - coverInAtMs >= minHoldMs;
}
