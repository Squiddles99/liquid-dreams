// Which painted rider shows on Choose your rider and Grab your gear (painted riders spec): pure, so the tests pin it.
import type { Outfit, PresetName } from '../../surfer/presets';
import { PRESETS } from '../../surfer/presets';
import { outfitFor } from '../../surfer/wardrobe';
import { type FrontState, gearRows } from '../frontEnd';
import { dateForMonth } from '../sessionSetup';

export interface Portrait {
  rider: PresetName;
  outfit: Outfit;
}

/** The picture's name in public/riders/ (tools/riderArt.py): the preset and the outfit. */
export const portraitKey = (p: Portrait): string => `${p.rider}-${p.outfit}`;

/**
 * Choose your rider: the focused rider in their walking clothes, just up from the car (Andrew 2026-10-08). Grab your gear:
 * on the outfit tab, the outfit the focus is on, so scrolling the list tries each one on; on the board and stance tabs,
 * the ticked outfit (as the 3D crew did: she stays in what's ticked until something else is). Elsewhere null: the last
 * portrait stays for the cross-fade out.
 */
export function portraitOf(s: FrontState, today: Date): Portrait | null {
  const r = s.rider;
  if (s.beat === 'rider') return { rider: r, outfit: 'walking' };
  if (s.beat !== 'gear') return null;
  if (s.gearTab === 'outfit') {
    const o = gearRows(s)[s.gearFocus];
    if (o) return { rider: r, outfit: outfitFor(PRESETS[r], o as Outfit, dateForMonth(s.setup.month, today)) };
  }
  return { rider: r, outfit: outfitFor(PRESETS[r], s.outfits[r] ?? 'season', dateForMonth(s.setup.month, today)) };
}
