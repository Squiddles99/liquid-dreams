// src/frontend/riderView.ts
import { PRESETS, type PresetName } from '../surfer/presets';
import type { FrontState } from './frontEnd';
import { RIDER_COPY, RIDER_ORDER, crewNote, ridesLabel, stanceLabel } from './riderCopy';

export interface RiderView {
  tabs: { rider: PresetName; label: string; focused: boolean }[];
  nickname: string;
  realName: string;
  rows: { label: string; value: string }[];
  line: string;
  note: string;
}

export function riderView(s: FrontState): RiderView {
  const r = s.rider, c = RIDER_COPY[r];
  return {
    tabs: RIDER_ORDER.map((n) => ({ rider: n, label: PRESETS[n].nickname.toUpperCase(), focused: n === r })),
    nickname: PRESETS[r].nickname,
    realName: PRESETS[r].realName,
    rows: [{ label: 'Stance', value: stanceLabel(r) }, { label: 'Rides', value: ridesLabel(r) }, { label: 'Style', value: c.style }, { label: 'Loves', value: c.loves }],
    line: c.pickLine,
    note: crewNote(r),
  };
}
