// src/frontend/titleMenu.ts: the title's main menu (surf-map hub spec §2). Pure.
import type { FrontAction } from './frontEnd';

export type TitleItem = 'surf' | 'online' | 'settings' | 'quit';
export const TITLE_LABELS: Readonly<Record<TitleItem, string>> = { surf: 'Surf', online: 'Online', settings: 'Settings', quit: 'Quit' };

/** Quit only where a window can be closed (the desktop build). */
export function titleItems(electron: boolean): TitleItem[] {
  return electron ? ['surf', 'online', 'settings', 'quit'] : ['surf', 'online', 'settings'];
}

export function stepTitle(s: { focus: number }, a: FrontAction, items: readonly TitleItem[]): { state: { focus: number }; pick: 'surf' | 'settings' | 'quit' | null; toast: string | null; moved: boolean } {
  const n = items.length, none = { state: s, pick: null, toast: null, moved: false };
  if (a === 'up' || a === 'down') return { ...none, state: { focus: (s.focus + (a === 'down' ? 1 : -1) + n) % n }, moved: true };
  if (a === 'start') return { ...none, pick: 'surf' };
  if (a === 'confirm') {
    const it = items[s.focus];
    return it === 'online' ? { ...none, toast: 'Online play is coming soon.' } : { ...none, pick: it };
  }
  return none;
}
