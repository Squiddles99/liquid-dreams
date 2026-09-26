/**
 * Hold-to-look drag state: a left-button press starts it, a release (or losing it to blur or an
 * unrelated pointer-lock change) ends it. Movement accumulates while held, whether or not the
 * pointer lock request that the press kicked off ever succeeds (Chrome's re-lock cooldown, for
 * one, rejects it but the look must not die). Pure and DOM-free so it can be driven by tests directly.
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

  /** Ends the drag unconditionally: a window blur, or a pointerlockchange that lost the lock mid-drag (Esc). */
  end(): void {
    this.active = false;
  }

  /** The accumulated movement since the last consume, reset to zero. */
  consume(): { dx: number; dy: number } {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }
}
