// src/frontend/glyphs.ts
import type { Device } from './uiInput';

export type LegendAction = 'random' | 'details' | 'confirm' | 'back' | 'start';
type GlyphAction = LegendAction | 'tabMinus' | 'tabPlus' | 'toggle' | 'fineMinus' | 'finePlus';

const CREAM = '#f7ecd2', DISC = '#1a2226';
const svg = (w: number, body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40" viewBox="0 0 ${w} 40" aria-hidden="true">${body}</svg>`;
/** A face button: a dark disc with a cream ring, the letter or shape in its colour. */
const disc = (inner: string): string => svg(40, `<circle cx="20" cy="20" r="18" fill="${DISC}" stroke="${CREAM}" stroke-width="2"/>${inner}`);
const letter = (ch: string, colour: string): string => `<text x="20" y="27.5" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="700" font-size="21" fill="${colour}">${ch}</text>`;
/** A shoulder, trigger or stick: a cream-outlined pill or a stick ring. */
const pill = (ch: string, w = 56): string => svg(w, `<rect x="1" y="6" width="${w - 2}" height="28" rx="3" fill="${DISC}" stroke="${CREAM}" stroke-width="2"/>${`<text x="${w / 2}" y="26.5" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="700" font-size="18" fill="${CREAM}">${ch}</text>`}`);
/** A key cap, as wide as its label. */
const cap = (ch: string): string => {
  const w = Math.max(40, 18 + ch.length * 12);
  return svg(w, `<rect x="1" y="2" width="${w - 2}" height="36" rx="3" fill="${DISC}" stroke="${CREAM}" stroke-width="2"/><rect x="1" y="32" width="${w - 2}" height="6" rx="2" fill="${CREAM}" opacity="0.25"/><text x="${w / 2}" y="26" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="700" font-size="18" fill="${CREAM}">${ch}</text>`);
};
const PS_SHAPE: Record<'cross' | 'circle' | 'square' | 'triangle', string> = {
  cross: `<g data-shape="cross" stroke="#7fb0e8" stroke-width="3" stroke-linecap="round"><path d="M13 13 L27 27 M27 13 L13 27"/></g>`,
  circle: `<g data-shape="circle"><circle cx="20" cy="20" r="8" fill="none" stroke="#e86b6b" stroke-width="3"/></g>`,
  square: `<g data-shape="square"><rect x="12.5" y="12.5" width="15" height="15" fill="none" stroke="#d68fc8" stroke-width="3"/></g>`,
  triangle: `<g data-shape="triangle"><path d="M20 11 L29 27 L11 27 Z" fill="none" stroke="#5fc9a8" stroke-width="3" stroke-linejoin="round"/></g>`,
};

const XBOX: Record<GlyphAction, { svg: string; label: string }> = {
  confirm: { svg: disc(letter('A', '#3fae49')), label: 'A' },
  back: { svg: disc(letter('B', '#d8433b')), label: 'B' },
  details: { svg: disc(letter('X', '#3a7fd5')), label: 'X' },
  random: { svg: disc(letter('Y', '#e8b52a')), label: 'Y' },
  start: { svg: pill('START', 76), label: 'START' },
  tabMinus: { svg: pill('LB'), label: 'LB' }, tabPlus: { svg: pill('RB'), label: 'RB' },
  fineMinus: { svg: pill('LT'), label: 'LT' }, finePlus: { svg: pill('RT'), label: 'RT' },
  toggle: { svg: pill('RS'), label: 'RS' },
};
const PLAYSTATION: Record<GlyphAction, { svg: string; label: string }> = {
  confirm: { svg: disc(PS_SHAPE.cross), label: 'Cross' },
  back: { svg: disc(PS_SHAPE.circle), label: 'Circle' },
  details: { svg: disc(PS_SHAPE.square), label: 'Square' },
  random: { svg: disc(PS_SHAPE.triangle), label: 'Triangle' },
  start: { svg: pill('OPTIONS', 92), label: 'Options' },
  tabMinus: { svg: pill('L1'), label: 'L1' }, tabPlus: { svg: pill('R1'), label: 'R1' },
  fineMinus: { svg: pill('L2'), label: 'L2' }, finePlus: { svg: pill('R2'), label: 'R2' },
  toggle: { svg: pill('R3'), label: 'R3' },
};
const KEYS: Record<GlyphAction, string> = { confirm: 'Enter', back: 'Esc', random: 'R', details: 'F', start: 'P', tabMinus: 'Q', tabPlus: 'E', toggle: 'Tab', fineMinus: '−', finePlus: '+' };

/** Our own glyph for an action on a device (spec §5.5: no platform artwork beyond the face letters and shapes). */
export function glyphFor(device: Device, action: GlyphAction): { svg: string; label: string } {
  if (device === 'xbox') return XBOX[action];
  if (device === 'playstation') return PLAYSTATION[action];
  return { svg: cap(KEYS[action]), label: KEYS[action] };
}
