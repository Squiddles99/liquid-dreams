// When the cover may dissolve (loading screens spec §2, §4): the world drawing smoothly behind it, and long enough on screen.

export const SMOOTH = { frames: 10, underMs: 33, giveUpMs: 4000 } as const;
/** While pipeline builds are pending the give-up waits, up to this long (ms) after the work is done (one-curl Task 0: the
 * boot cover dissolved on the give-up with the ocean's build pending, and the select screen showed without the water). */
export const BOOT_BUILD_CAP_MS = 15_000;

/**
 * Opens after SMOOTH.frames frames in a row under SMOOTH.underMs, or SMOOTH.giveUpMs of unblocked time after the work is
 * done (time spent `blocked`, builds pending, doesn't count), or BOOT_BUILD_CAP_MS after it whatever the state.
 */
export class SmoothFramesGate {
  private run = 0;
  private isOpen = false;
  private blockedMs = 0;
  private lastMs: number;

  /** `startMs`: when the work behind the cover finished. Make the gate then: only frames after it count. */
  constructor(private readonly startMs: number) {
    this.lastMs = startMs;
  }

  /** `blocked`: drawn with builds pending (the frame is missing them): never smooth, and the give-up clock waits. */
  frame(dtMs: number, nowMs: number, blocked = false): boolean {
    if (this.isOpen) return true;
    if (blocked) this.blockedMs += Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;
    this.run = !blocked && dtMs < SMOOTH.underMs ? this.run + 1 : 0;
    const since = nowMs - this.startMs;
    if (this.run >= SMOOTH.frames || since - this.blockedMs >= SMOOTH.giveUpMs || since >= BOOT_BUILD_CAP_MS) this.isOpen = true;
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
