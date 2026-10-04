// src/frontend/controlsArt.ts: the Controls page's drawings (Andrew 2026-10-04): a drawn pad and drawn keys, each
// control the ride uses lit and called out, from the player's bindings. Our own artwork (spec §5.5): a generic pad shape
// with the face letters or shapes, no platform logos. Both drawings share one 1500 × 640 design-px canvas; the callouts'
// text is HTML laid over it (Large text scales it), so the art only carries the leader lines.
import { ACTION_LABELS, ARROW_FOR, type Bindings, type KeyAction, PAD_ACTIONS, buttonLabel, keyLabel } from '../ride/bindings';
import { PS_SHAPE } from './glyphs';

export const ART_W = 1500;
export const ART_H = 640;

/** A callout: the action, a small line under it (the control's name, or the other key; '' for none), at (x, y) design px. */
export interface Callout {
  text: string;
  sub: string;
  x: number;
  y: number;
  /** Which edge of the text sits at x. */
  align: 'left' | 'right' | 'center';
}

export interface ControlsArt {
  svg: string;
  callouts: Callout[];
}

export type PadFamily = 'xbox' | 'playstation';

const CREAM = '#f7ecd2', INK = '#10171a', BODY_HI = '#2a3940', BODY_LO = '#141b1f', SUN = '#ef7d2e', SUN_HI = '#ffa14f';
const DIM = 0.32;
const FONT = `font-family="Barlow Semi Condensed" font-weight="700"`;

type Pt = [number, number];
/** One cubic segment: two controls and the end. */
type Seg = [Pt, Pt, Pt];

/** A leader: a dot on the control, then the line out to the callout (elbows at each point). */
function leader(points: Pt[]): string {
  const [x0, y0] = points[0];
  return `<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${CREAM}" stroke-opacity="0.75" stroke-width="2" stroke-linejoin="round"/>`
    + `<circle cx="${x0}" cy="${y0}" r="6" fill="${SUN_HI}" stroke="${INK}" stroke-width="2"/>`;
}

/** The pad's outline: the left half as segments from the top centre down to the bottom centre, mirrored for the right. */
const PAD_HALF: { start: Pt; segs: Seg[] } = {
  start: [0, 150],
  segs: [
    [[-90, 147], [-200, 136], [-264, 158]],
    [[-332, 180], [-374, 242], [-390, 322]],
    [[-406, 402], [-402, 502], [-378, 562]],
    [[-358, 608], [-292, 622], [-258, 582]],
    [[-232, 550], [-212, 502], [-180, 464]],
    [[-150, 430], [-100, 420], [-60, 420]],
  ],
};

function padOutline(cx: number): string {
  const at = (p: Pt, mirror = false): string => `${cx + (mirror ? -p[0] : p[0])},${p[1]}`;
  const { start, segs } = PAD_HALF;
  let d = `M${at(start)}`;
  for (const [c1, c2, e] of segs) d += ` C${at(c1)} ${at(c2)} ${at(e)}`;
  d += ` L${at(segs[segs.length - 1][2], true)}`;
  for (let i = segs.length - 1; i >= 0; i--) {
    const [c1, c2] = segs[i];
    const prev = i > 0 ? segs[i - 1][2] : start;
    d += ` C${at(c2, true)} ${at(c1, true)} ${at(prev, true)}`;
  }
  return `${d} Z`;
}

const CX = 750;
const X = (x: number): number => CX + x;
/** Where each bindable button's callout goes: its leader (from the control out) and the callout's anchor. */
const BUTTON_SLOTS: Record<number, { leader: Pt[]; at: Pt; align: 'left' | 'right' }> = {
  0: { leader: [[X(218), 332], [X(250), 400], [1182, 400]], at: [1198, 400], align: 'left' },
  1: { leader: [[X(278), 262], [1182, 262]], at: [1198, 262], align: 'left' },
  2: { leader: [[X(148), 288], [X(148), 474], [1182, 474]], at: [1198, 474], align: 'left' },
  3: { leader: [[X(226), 210], [X(250), 194], [1182, 194]], at: [1198, 194], align: 'left' },
  4: { leader: [[X(-262), 148], [X(-330), 128], [318, 128]], at: [302, 128], align: 'right' },
  5: { leader: [[X(262), 148], [X(330), 128], [1182, 128]], at: [1198, 128], align: 'left' },
  6: { leader: [[X(-232), 104], [X(-300), 60], [318, 60]], at: [302, 60], align: 'right' },
  7: { leader: [[X(232), 104], [X(300), 60], [1182, 60]], at: [1198, 60], align: 'left' },
};

/**
 * The pad (Xbox layout: offset sticks, the face diamond), the ride's controls lit: the left stick turns and carves, the
 * right stick looks around and the menu button pauses (always); the four bound buttons (paddle, crouch, pop up, next wave) are wherever the player put
 * them. On a PlayStation pad the face buttons carry its shapes and the callouts its names.
 */
export function controllerArt(b: Bindings, family: PadFamily = 'xbox'): ControlsArt {
  const actionOf = new Map(PAD_ACTIONS.map((a) => [b.pad[a], a] as const));
  const on = (i: number): boolean => actionOf.has(i);
  const lit = (o: boolean): string => (o ? '' : ` opacity="${DIM}"`);
  const trigger = (s: 1 | -1, o: boolean): string =>
    `<path d="M${X(s * -292)},150 C${X(s * -296)},112 ${X(s * -268)},84 ${X(s * -226)},82 L${X(s * -180)},86 C${X(s * -160)},92 ${X(s * -156)},116 ${X(s * -164)},140 Z"`
    + ` fill="${o ? SUN : BODY_LO}" fill-opacity="${o ? 0.28 : 1}" stroke="${o ? SUN_HI : CREAM}" stroke-width="3"${lit(o)}/>`;
  const bumper = (s: 1 | -1, o: boolean): string =>
    `<path d="M${X(s * -148)},143 C${X(s * -206)},132 ${X(s * -266)},136 ${X(s * -318)},166" fill="none" stroke="${o ? SUN_HI : CREAM}" stroke-width="16" stroke-linecap="round"${lit(o)}/>`;
  const stick = (x: number, y: number, o: boolean): string =>
    `<circle cx="${X(x)}" cy="${y}" r="58" fill="${BODY_LO}" stroke="${CREAM}" stroke-opacity="0.35" stroke-width="2"/>`
    + `<g${lit(o)}><circle cx="${X(x)}" cy="${y}" r="40" fill="${o ? '#3a2a20' : BODY_HI}" stroke="${o ? SUN_HI : CREAM}" stroke-width="3"/>`
    + `<circle cx="${X(x)}" cy="${y}" r="27" fill="none" stroke="${o ? SUN_HI : CREAM}" stroke-opacity="0.45" stroke-width="2"/></g>`;
  const XBOX_FACE: [string, string][] = [['A', '#3fae49'], ['B', '#d8433b'], ['X', '#3a7fd5'], ['Y', '#e8b52a']];
  const PS_FACE = [PS_SHAPE.cross, PS_SHAPE.circle, PS_SHAPE.square, PS_SHAPE.triangle];
  const face = (x: number, y: number, i: number): string => {
    const inner = family === 'playstation'
      ? `<g transform="translate(${X(x) - 20},${y - 20})">${PS_FACE[i]}</g>`
      : `<text x="${X(x)}" y="${y + 9}" text-anchor="middle" ${FONT} font-size="26" fill="${XBOX_FACE[i][1]}">${XBOX_FACE[i][0]}</text>`;
    return `<g${lit(on(i))}><circle cx="${X(x)}" cy="${y}" r="26" fill="${INK}" stroke="${on(i) ? SUN_HI : CREAM}" stroke-width="3"/>${inner}</g>`;
  };
  const dpad = (x: number, y: number): string =>
    `<g${lit(false)} fill="${BODY_HI}" stroke="${CREAM}" stroke-width="3"><path d="M${X(x - 15)},${y - 46} h30 v31 h31 v30 h-31 v31 h-30 v-31 h-31 v-30 h31 Z" stroke-linejoin="round"/></g>`;
  const small = (x: number, y: number, inner: string, o: boolean): string =>
    `<g${lit(o)}><circle cx="${X(x)}" cy="${y}" r="15" fill="${INK}" stroke="${o ? SUN_HI : CREAM}" stroke-width="3"/>${inner}</g>`;
  const menuLines = [-5, 0, 5].map((d) => `<path d="M${X(55)},${262 + d} h14" stroke="${CREAM}" stroke-width="2.5" stroke-linecap="round"/>`).join('');
  const viewSquares = `<rect x="${X(-69)}" y="255" width="9" height="9" fill="none" stroke="${CREAM}" stroke-width="2"/><rect x="${X(-64)}" y="260" width="9" height="9" fill="none" stroke="${CREAM}" stroke-width="2"/>`;

  const bound = [...actionOf.keys()].filter((i) => BUTTON_SLOTS[i]).sort((p, q) => p - q);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ART_W}" height="${ART_H}" viewBox="0 0 ${ART_W} ${ART_H}" aria-hidden="true">`
    + `<defs><linearGradient id="ld-pad-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BODY_HI}"/><stop offset="1" stop-color="${BODY_LO}"/></linearGradient></defs>`
    + trigger(1, on(6)) + trigger(-1, on(7))
    + `<path d="${padOutline(CX)}" fill="url(#ld-pad-body)" stroke="${CREAM}" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="M${X(-250)},176 C${X(-120)},158 ${X(120)},158 ${X(250)},176" fill="none" stroke="${CREAM}" stroke-opacity="0.12" stroke-width="2"/>`
    + bumper(1, on(4)) + bumper(-1, on(5))
    + stick(-200, 262, true) + stick(118, 372, true) + dpad(-118, 372)
    + face(200, 314, 0) + face(252, 262, 1) + face(148, 262, 2) + face(200, 210, 3)
    + small(-62, 262, viewSquares, false) + small(62, 262, menuLines, true)
    + `<circle cx="${X(0)}" cy="196" r="24" fill="${INK}" stroke="${CREAM}" stroke-width="3" opacity="${DIM}"/>`
    // Leaders: the sticks and the menu button (always), then each bound button.
    + leader([[X(-200), 262], [318, 262]])
    + leader([[X(118), 430], [X(118), 548], [1182, 548]])
    + leader([[X(62), 247], [X(62), 96]])
    + bound.map((i) => leader(BUTTON_SLOTS[i].leader)).join('')
    + `</svg>`;
  const callouts: Callout[] = [
    { text: 'Turn · carve', sub: 'Left stick', x: 302, y: 262, align: 'right' },
    { text: 'Look around', sub: 'Right stick', x: 1198, y: 548, align: 'left' },
    { text: 'Pause', sub: family === 'playstation' ? 'Options' : 'Menu', x: X(62), y: 56, align: 'center' },
    ...bound.map((i): Callout => {
      const slot = BUTTON_SLOTS[i];
      return { text: ACTION_LABELS[actionOf.get(i)!], sub: buttonLabel(i, family), x: slot.at[0], y: slot.at[1], align: slot.align };
    }),
  ];
  return { svg, callouts };
}

const KEY = 100, GAP = 12, U = KEY + GAP;

function keyCap(x: number, y: number, w: number, inner: string, on: boolean): string {
  return `<g${on ? '' : ` opacity="${DIM}"`}>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${KEY}" rx="3" fill="${on ? '#2e2420' : BODY_LO}" stroke="${on ? SUN_HI : CREAM}" stroke-width="${on ? 3 : 2}"/>`
    + `<rect x="${x + 3}" y="${y + KEY - 14}" width="${w - 6}" height="11" rx="2" fill="${on ? SUN : CREAM}" opacity="0.22"/>`
    + `<g transform="translate(${x + w / 2},${y + KEY / 2 - 4})">${inner}</g></g>`;
}
/** A cap's name, smaller the longer it is (the caps keep their size, so the layout holds whatever is bound). */
const capText = (ch: string): string => {
  const size = ch.length <= 2 ? 40 : ch.length <= 4 ? 30 : ch.length <= 6 ? 24 : 19;
  return `<text x="0" y="${size * 0.36}" text-anchor="middle" ${FONT} font-size="${size}" fill="${CREAM}">${ch.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
};
/** A mouse, its left button lit (hold it and drag to look around). */
const mouse = (x: number, y: number): string =>
  `<rect x="${x}" y="${y}" width="68" height="108" rx="34" fill="${BODY_LO}" stroke="${CREAM}" stroke-width="3"/>`
  + `<path d="M${x + 34},${y + 2} L${x + 34},${y + 44} L${x + 2},${y + 44} L${x + 2},${y + 34} A32,32 0 0 1 ${x + 34},${y + 2} Z" fill="${SUN}" fill-opacity="0.35" stroke="${SUN_HI}" stroke-width="3" stroke-linejoin="round"/>`
  + `<path d="M${x + 2},${y + 44} H${x + 66}" stroke="${CREAM}" stroke-opacity="0.5" stroke-width="2"/>`;
const arrow = (deg: number): string => `<path d="M0,-15 L14,9 L-14,9 Z" fill="${CREAM}" transform="rotate(${deg})"/>`;

/**
 * The keys, laid out as W A S D are on a keyboard whatever they're bound to: paddle above, turn left and right either
 * side of crouch, next wave up and to the right, pop up below (the space bar when it's Space), Esc top left; the arrow
 * keys, which always work like the first four; the mouse, which looks around.
 */
export function keyboardArt(b: Bindings): ControlsArt {
  const k = (a: KeyAction): string => keyLabel(b.keys[a]);
  const row1 = 150, row2 = row1 + U, space = row2 + U + 92;
  const q = 330, w = q + U, e = w + U, r = e + U, a = q, s = w, d = e;
  const ax = 1060, arrowsTop = row2 - 10;
  const popupW = b.keys.popup === 'Space' ? 4 * U - GAP : KEY;
  // Q and E either side of W only when it's still W and R: then the cluster reads as the keyboard it is.
  const realRow = b.keys.paddle === 'KeyW' && b.keys.next === 'KeyR';
  const alt = (act: KeyAction): string => `${k(act)} or ${keyLabel(ARROW_FOR[act]!)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ART_W}" height="${ART_H}" viewBox="0 0 ${ART_W} ${ART_H}" aria-hidden="true">`
    + keyCap(110, 20, KEY, capText('Esc'), true)
    + (realRow ? keyCap(q, row1, KEY, capText('Q'), false) + keyCap(e, row1, KEY, capText('E'), false) : '')
    + keyCap(w, row1, KEY, capText(k('paddle')), true) + keyCap(r, row1, KEY, capText(k('next')), true)
    + keyCap(a, row2, KEY, capText(k('left')), true) + keyCap(s, row2, KEY, capText(k('crouch')), true) + keyCap(d, row2, KEY, capText(k('right')), true)
    + keyCap(q, space, popupW, capText(k('popup')), true)
    + keyCap(ax + U, arrowsTop, KEY, arrow(0), true)
    + keyCap(ax, arrowsTop + U, KEY, arrow(-90), true) + keyCap(ax + U, arrowsTop + U, KEY, arrow(180), true) + keyCap(ax + 2 * U, arrowsTop + U, KEY, arrow(90), true)
    + mouse(1196, 500)
    // Leaders: paddle up to its callout, next wave out to the right; the arrow keys' bracket.
    + leader([[w + KEY / 2, row1], [w + KEY / 2, 70], [w + KEY / 2 + 30, 70]])
    + leader([[r + KEY, row1 + KEY / 2], [r + KEY + 40, row1 + KEY / 2]])
    + `<path d="M${ax},${arrowsTop - 34} v-14 h${3 * U - GAP} v14" fill="none" stroke="${CREAM}" stroke-opacity="0.75" stroke-width="2"/>`
    + `</svg>`;
  const callouts: Callout[] = [
    { text: 'Pause', sub: '', x: 236, y: 70, align: 'left' },
    { text: ACTION_LABELS.paddle, sub: alt('paddle'), x: w + KEY / 2 + 42, y: 70, align: 'left' },
    { text: ACTION_LABELS.next, sub: '', x: r + KEY + 54, y: row1 + KEY / 2, align: 'left' },
    { text: ACTION_LABELS.left, sub: alt('left'), x: a - 24, y: row2 + KEY / 2, align: 'right' },
    { text: ACTION_LABELS.right, sub: alt('right'), x: d + KEY + 24, y: row2 + KEY / 2, align: 'left' },
    { text: ACTION_LABELS.crouch, sub: alt('crouch'), x: s + KEY / 2, y: row2 + KEY + 42, align: 'center' },
    { text: ACTION_LABELS.popup, sub: '', x: q + popupW + 24, y: space + KEY / 2, align: 'left' },
    { text: 'Look around', sub: 'Left-click drag', x: 1290, y: 552, align: 'left' },
    { text: 'Arrow keys work too', sub: `Same as ${k('paddle')} ${k('left')} ${k('crouch')} ${k('right')}`, x: ax + 1.5 * U - GAP / 2, y: arrowsTop - 92, align: 'center' },
  ];
  return { svg, callouts };
}
