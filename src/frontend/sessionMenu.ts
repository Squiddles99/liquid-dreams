// src/frontend/sessionMenu.ts: the menu while surfing (Esc or a pad's START): keep surfing, the controls, or back to the
// dune to choose again.
import type { FrontAction } from './frontEnd';

export type MenuPick = 'resume' | 'dune';

export const MENU_ITEMS: readonly { id: MenuPick | 'controls'; label: string }[] = [
  { id: 'resume', label: 'Keep surfing' },
  { id: 'controls', label: 'Controls' },
  { id: 'dune', label: 'Back to the dune' },
];

export interface MenuState {
  focus: number;
}

/**
 * One action on the rows: up and down move the focus (round), A takes it (Controls opens its page, as View or C do from
 * any row), B or START keeps surfing.
 */
export function stepMenu(s: MenuState, a: FrontAction): { state: MenuState; pick: MenuPick | null; moved: boolean; controls: boolean } {
  const n = MENU_ITEMS.length, none = { state: s, pick: null, moved: false, controls: false };
  if (a === 'up' || a === 'down') return { ...none, state: { focus: (s.focus + (a === 'down' ? 1 : -1) + n) % n }, moved: true };
  if (a === 'controls') return { ...none, controls: true };
  if (a === 'confirm') {
    const id = MENU_ITEMS[s.focus].id;
    return id === 'controls' ? { ...none, controls: true } : { ...none, pick: id };
  }
  if (a === 'back' || a === 'start') return { ...none, pick: 'resume' };
  return none;
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
