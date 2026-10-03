// src/frontend/sessionMenu.ts: the menu while surfing (Esc or a pad's START): keep surfing, or back to the dune to choose again.
import type { FrontAction } from './frontEnd';

export type MenuPick = 'resume' | 'dune';

export const MENU_ITEMS: readonly { id: MenuPick; label: string }[] = [
  { id: 'resume', label: 'Keep surfing' },
  { id: 'dune', label: 'Back to the dune' },
];

export interface MenuState {
  focus: number;
}

/** One action: up and down move the focus (round), A takes it, B or START keeps surfing. */
export function stepMenu(s: MenuState, a: FrontAction): { state: MenuState; pick: MenuPick | null; moved: boolean } {
  const n = MENU_ITEMS.length;
  if (a === 'up' || a === 'down') return { state: { focus: (s.focus + (a === 'down' ? 1 : -1) + n) % n }, pick: null, moved: true };
  if (a === 'confirm') return { state: s, pick: MENU_ITEMS[s.focus].id, moved: false };
  if (a === 'back' || a === 'start') return { state: s, pick: 'resume', moved: false };
  return { state: s, pick: null, moved: false };
}

/**
 * A pad's START, on the press (W3C standard mapping, button 9). Polled every frame, menu or not, so a START still held
 * from paddling out (or seen held the first time) is never taken for a press.
 */
export class PadStartWatch {
  private readonly held = new Map<number, boolean>();

  poll(pads: readonly ({ index: number; buttons: readonly boolean[] } | null)[]): boolean {
    let pressed = false;
    const live = new Set<number>();
    for (const p of pads) {
      if (!p) continue;
      live.add(p.index);
      const down = !!p.buttons[9], was = this.held.get(p.index);
      if (down && was === false) pressed = true;
      this.held.set(p.index, down);
    }
    for (const i of [...this.held.keys()]) if (!live.has(i)) this.held.delete(i);
    return pressed;
  }
}
