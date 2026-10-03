/**
 * The drawn sea's height over the ride's water (Andrew, 2026-10-03: "I'm under the beach"): the CPU water is the set
 * waves only, but the sea the game draws adds the FFT ocean's long swell, a metre or more in a big swell. The height probe
 * reads the drawn sea a frame or two late; each reading is matched to the CPU water at the same point and time it was
 * asked for, and the difference, eased, lifts the ride's water onto the drawn one.
 */
export const OFFSET_TAU_S = 0.3;
/** Requests kept for matching (a readback lands a few frames after its request). */
const KEEP = 16;

export class SurfaceOffset {
  value = 0;
  private seen = false;
  private readonly log = new Map<number, number>();

  reset(): void {
    this.value = 0;
    this.seen = false;
    this.log.clear();
  }

  /** Probe request `seq` went out at a point where the ride's water was `cpuY`. */
  sent(seq: number, cpuY: number): void {
    this.log.set(seq, cpuY);
    for (const k of this.log.keys()) if (k < seq - KEEP) this.log.delete(k);
  }

  /** The held reading came from request `seq` and read `drawnY` (null: nothing yet). The first match lands at once. */
  read(seq: number, drawnY: number | null, dt: number): void {
    const cpuY = this.log.get(seq);
    if (drawnY === null || cpuY === undefined || !Number.isFinite(drawnY)) return;
    const target = drawnY - cpuY;
    if (!this.seen) {
      this.value = target;
      this.seen = true;
    } else this.value += (target - this.value) * (1 - Math.exp(-Math.max(0, dt) / OFFSET_TAU_S));
  }
}
