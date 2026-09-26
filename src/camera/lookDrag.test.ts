import { describe, expect, it } from 'vitest';
import { LookDrag } from './lookDrag';

describe('LookDrag', () => {
  it('a left press starts the drag and movement accumulates', () => {
    const d = new LookDrag();
    expect(d.press(0)).toBe(true);
    expect(d.dragging).toBe(true);
    d.move(5, -2);
    d.move(3, 1);
    expect(d.consume()).toEqual({ dx: 8, dy: -1 });
  });

  it('release stops the drag and asks the caller to unlock, once', () => {
    const d = new LookDrag();
    d.press(0);
    expect(d.release(0)).toBe(true);
    expect(d.dragging).toBe(false);
    expect(d.release(0)).toBe(false); // already released: nothing left to unlock for
    d.move(9, 9);
    expect(d.consume()).toEqual({ dx: 0, dy: 0 });
  });

  it('a rejected or still-pending pointer lock does not stop movement from accumulating while held', () => {
    const d = new LookDrag();
    d.press(0);
    // No lock is simulated at all here: the drag itself doesn't know about pointer lock, so a
    // failed or slow request can't stop it from tracking the held button's movement.
    d.move(4, 4);
    expect(d.consume()).toEqual({ dx: 4, dy: 4 });
  });

  it('blur ends the drag', () => {
    const d = new LookDrag();
    d.press(0);
    d.move(1, 1);
    d.end();
    expect(d.dragging).toBe(false);
    d.move(100, 100);
    expect(d.consume()).toEqual({ dx: 1, dy: 1 });
  });

  it('a right or middle button press does nothing', () => {
    const d = new LookDrag();
    expect(d.press(1)).toBe(false);
    expect(d.press(2)).toBe(false);
    expect(d.dragging).toBe(false);
    d.move(5, 5);
    expect(d.consume()).toEqual({ dx: 0, dy: 0 });
  });

  it('consume resets the accumulator', () => {
    const d = new LookDrag();
    d.press(0);
    d.move(2, 3);
    d.consume();
    expect(d.consume()).toEqual({ dx: 0, dy: 0 });
  });
});
