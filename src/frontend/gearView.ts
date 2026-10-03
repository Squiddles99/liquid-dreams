// src/frontend/gearView.ts
import type { BoardKind } from '../board/boardSpec';
import { sideOf } from '../surfer/poses';
import { type Outfit, PRESETS, type Stance } from '../surfer/presets';
import { OUTFIT_LABELS, outfitFor } from '../surfer/wardrobe';
import { BOARD_NAMES, boardBars, fitOf, lengthLabel, pickBoard, reasonLine, specsLine } from './boardPick';
import { type FrontState, type GearTab, boardOf, gearRows, stanceOf } from './frontEnd';
import { RIDER_COPY, chooseLine, fillLine, stanceLabel } from './riderCopy';
import { MONTHS, dateForMonth } from './sessionSetup';

export interface GearView {
  tab: GearTab;
  rows: { id: string; name: string; detail: string; badge: 'IDEAL' | 'GOOD' | 'OK' | null; pick: string | null; season: string | null; focused: boolean; chosen: boolean }[];
  bars: { paddle: number; hold: number; turn: number } | null;
  specs: string | null;
  note: string | null;
  line: { speaker: string; text: string };
}

/** What the crew call each other, short (the tease lines' {name}). */
const SHORT_NAME: Record<'female' | 'male' | 'grommet', string> = { female: 'Shaz', male: 'T-Bone', grommet: 'Grom' };

export function gearView(s: FrontState, today: Date, seed: number): GearView {
  const r = s.rider, p = PRESETS[r], name = p.nickname, { swellFt, periodS } = s.setup;
  const pick = pickBoard(r, swellFt, periodS);
  if (s.gearTab === 'board') {
    const kinds = gearRows(s) as BoardKind[], focused = kinds[s.gearFocus] ?? pick;
    return {
      tab: 'board',
      rows: kinds.map((k, i) => ({
        id: k, name: BOARD_NAMES[k], detail: lengthLabel(p.quiver[k]!.lengthIn), badge: fitOf(k, swellFt, periodS),
        pick: k === pick ? `${name}'s pick` : null, season: null, focused: i === s.gearFocus, chosen: k === boardOf(s, r),
      })),
      // RS / R toggles the bars and the specs line (spec §4.3).
      bars: s.showSpecs ? null : boardBars(r, focused),
      specs: s.showSpecs ? specsLine(r, focused) : null,
      note: null,
      line: { speaker: name, text: reasonLine(r, pick, swellFt, seed) },
    };
  }
  if (s.gearTab === 'stance') {
    const own = p.defaultStance, chosen = stanceOf(s, r), stances = gearRows(s) as Stance[];
    // Grommet drops a knee: his stance is which foot he plants.
    const foot = (st: Stance): string => `${st === 'regular' ? 'left' : 'right'} foot forward`;
    const detail = (st: Stance): string => (r === 'grommet' ? `Drop-knee, ${foot(st)}` : foot(st)[0].toUpperCase() + foot(st).slice(1));
    return {
      tab: 'stance',
      rows: stances.map((st, i) => ({
        id: st, name: stanceLabel(st), detail: detail(st), badge: null, pick: st === own ? `${name}'s stance` : null, season: null, focused: i === s.gearFocus, chosen: st === chosen,
      })),
      bars: null,
      specs: null,
      // The break is a left: which way each stance faces on it (the poses' own rule).
      note: `The Womb's a left: Natural rides it ${sideOf('regular')}, Goofy ${sideOf('goofy')}.`,
      line: { speaker: name, text: reasonLine(r, pick, swellFt, seed) },
    };
  }
  const date = dateForMonth(s.setup.month, today), season = outfitFor(p, 'season', date), chosen = outfitFor(p, s.outfits[r] ?? 'season', date);
  const outfits = gearRows(s) as Outfit[], focused = outfits[s.gearFocus];
  const mate = r === 'male' ? 'female' : 'male';
  // A bikini or boardies in the WA winter (June–August; months are 0-based) gets a mate's tease (spec §9).
  const tease = focused !== season && (focused === 'bikini' || focused === 'boardies') && s.setup.month >= 5 && s.setup.month <= 7;
  return {
    tab: 'outfit',
    rows: outfits.map((o, i) => ({
      // Title case, like the boards (the wardrobe's labels are lower case for running text).
      id: o, name: OUTFIT_LABELS[o][0].toUpperCase() + OUTFIT_LABELS[o].slice(1), detail: '', badge: null, pick: null, season: o === season ? `for ${MONTHS[s.setup.month]}` : null,
      focused: i === s.gearFocus, chosen: o === chosen,
    })),
    bars: null,
    specs: null,
    note: 'Looks only, no effect on your surfing.',
    line: tease ? { speaker: PRESETS[mate].nickname, text: fillLine(chooseLine(RIDER_COPY[mate].teaseLines, seed), { name: SHORT_NAME[r] }) } : { speaker: name, text: reasonLine(r, pick, swellFt, seed) },
  };
}
