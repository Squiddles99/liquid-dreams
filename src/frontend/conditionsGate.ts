// src/frontend/conditionsGate.ts
/**
 * When a Conditions edit reaches the world (spec §6.10): 200 ms after the last change, and never two applies within
 * 200 ms. A held key repeating every 80 ms therefore applies once, after it's released.
 */
export class ConditionsGate {
  private lastEditMs = -Infinity;
  private lastApplyMs = -Infinity;
  private pending = false;

  constructor(private readonly quietMs = 200, private readonly gapMs = 200) {}

  edit(nowMs: number): void {
    this.lastEditMs = nowMs;
    this.pending = true;
  }

  /** An end-of-range bump: the key is still held, so an edit that's waiting keeps waiting; alone it applies nothing. */
  hold(nowMs: number): void {
    if (this.pending) this.lastEditMs = nowMs;
  }

  due(nowMs: number): boolean {
    if (!this.pending || nowMs - this.lastEditMs < this.quietMs || nowMs - this.lastApplyMs < this.gapMs) return false;
    this.pending = false;
    this.lastApplyMs = nowMs;
    return true;
  }
}
