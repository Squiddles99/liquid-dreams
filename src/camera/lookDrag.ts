/**
 * Hold-to-look drag state: a left-button press starts it, a release (or losing it to blur or an
 * unrelated pointer-lock change) ends it. Movement accumulates while held, whether or not the
 * pointer lock request that the press kicked off ever succeeds (Chrome's re-lock cooldown, for
 * one, rejects it but the look must not die). onLockChange() also covers the reverse race: a release
 * that lands before that request's promise settles must not leave the lock stuck on with no drag to
 * end it. Pure and DOM-free so it can be driven by tests directly.
 */
export class LookDrag {
  private active = false;
  private dx = 0;
  private dy = 0;

  get dragging(): boolean {
    return this.active;
  }

  /** A mousedown on the canvas. Starts the drag for the left button only; returns whether it did. */
  press(button: number): boolean {
    if (button !== 0) return false;
    this.active = true;
    return true;
  }

  /** A mouseup anywhere. Ends the drag for the left button only; returns whether it was ended (the caller unlocks). */
  release(button: number): boolean {
    if (button !== 0 || !this.active) return false;
    this.active = false;
    return true;
  }

  /** Accumulates mouse movement while the drag is active; a no-op otherwise. */
  move(dx: number, dy: number): void {
    if (!this.active) return;
    this.dx += dx;
    this.dy += dy;
  }

  /** Ends the drag unconditionally: a window blur. */
  end(): void {
    this.active = false;
  }

  /**
   * A pointerlockchange fired for this element; `locked` is whether it now holds the lock. The caller passes
   * this straight through to `document.exitPointerLock()` on `'unlock'`; `'end'` and `'none'` need no DOM action
   * (the drag's own state is already updated by the time this returns).
   * - Lost the lock while still dragging (Esc mid-drag): ends the drag, same as a release.
   * - Gained the lock after the drag already ended (a release that beat requestPointerLock()'s promise
   *   settling, e.g. a quick click): the lock must be let go immediately, or the cursor stays stuck locked
   *   with no drag to end it.
   * - Otherwise: nothing to do.
   */
  onLockChange(locked: boolean): 'unlock' | 'end' | 'none' {
    if (locked && !this.active) return 'unlock';
    if (!locked && this.active) {
      this.active = false;
      return 'end';
    }
    return 'none';
  }

  /** The accumulated movement since the last consume, reset to zero. */
  consume(): { dx: number; dy: number } {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }
}
