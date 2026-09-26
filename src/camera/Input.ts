import { LookDrag } from './lookDrag';
import type { MoveKeys } from './movement';

/** Keys typed into form fields (the dev panel) must not drive the camera or hotkeys. */
export function shouldIgnoreKeyTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const t = target as { tagName?: string; isContentEditable?: boolean };
  return t.isContentEditable === true || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Hold-to-look: press-drag-release, independent of whether the pointer lock it requested ever lands. */
  private readonly lookDrag = new LookDrag();
  private wheel = 0;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    // Press is scoped to the canvas so the dev panel stays clickable; release and the lock's own
    // change event are on the document so a drag still ends when the mouse is over the panel or off-window.
    element.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    element.addEventListener('wheel', this.onWheel, { passive: true });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per physical key press. */
  consumePressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  consumeMouse(): { dx: number; dy: number } {
    return this.lookDrag.consume();
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  moveKeys(): MoveKeys {
    const d = (...codes: string[]) => codes.some((c) => this.down.has(c));
    return {
      forward: d('KeyW', 'ArrowUp'), back: d('KeyS', 'ArrowDown'),
      left: d('KeyA', 'ArrowLeft'), right: d('KeyD', 'ArrowRight'),
      up: d('KeyE'), down: d('KeyQ'), fast: d('ShiftLeft', 'ShiftRight'), rise: d('Space'),
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.element.removeEventListener('wheel', this.onWheel);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (shouldIgnoreKeyTarget(e.target)) return;
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
    this.pressed.clear();
    this.lookDrag.end();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.lookDrag.press(e.button)) return;
    if (document.pointerLockElement !== this.element) {
      // Chrome makes you wait a moment before re-locking after Escape, and rejects the request in the
      // meantime (and in other cases, e.g. this element's document not being the active top-level one);
      // swallow that so it doesn't surface as an unhandled rejection. The look keeps working regardless
      // (see LookDrag), so a rejected or slow lock is never visible as a dead drag.
      const lock = this.element.requestPointerLock() as Promise<void> | undefined;
      lock?.catch(() => {});
    }
  };

  /** Left-button-up anywhere ends the drag and frees the cursor immediately: no Esc needed. */
  private onMouseUp = (e: MouseEvent): void => {
    if (!this.lookDrag.release(e.button)) return;
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  };

  /**
   * Esc (or anything else) taking the lock away mid-drag ends the drag, same as releasing the button. Also
   * covers the reverse race (see LookDrag): a release that beat requestPointerLock()'s promise settling would
   * otherwise leave the lock granted with no drag active, stuck until Esc.
   */
  private onPointerLockChange = (): void => {
    if (this.lookDrag.onLockChange(document.pointerLockElement === this.element) === 'unlock') document.exitPointerLock();
  };

  private onMouseMove = (e: MouseEvent): void => {
    // Accumulates while the drag is held whether or not the pointer lock landed (see LookDrag).
    this.lookDrag.move(e.movementX, e.movementY);
  };

  private onWheel = (e: WheelEvent): void => {
    this.wheel += e.deltaY;
  };
}
