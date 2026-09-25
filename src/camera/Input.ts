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
  private mouseDx = 0;
  private mouseDy = 0;
  private wheel = 0;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mousemove', this.onMouseMove);
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
    const d = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return d;
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
    document.removeEventListener('mousemove', this.onMouseMove);
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
  };

  private onMouseDown = (): void => {
    if (document.pointerLockElement !== this.element) {
      // Chrome makes you wait a moment before re-locking after Escape, and rejects the request in the
      // meantime (and in other cases, e.g. this element's document not being the active top-level one);
      // swallow that so it doesn't surface as an unhandled rejection.
      const lock = this.element.requestPointerLock() as Promise<void> | undefined;
      lock?.catch(() => {});
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.element) return;
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    this.wheel += e.deltaY;
  };
}
