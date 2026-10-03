// src/frontend/riderCopy.ts
import type { BoardKind } from '../board/boardSpec';
import { PRESETS, type PresetName, type Stance, boardsFor } from '../surfer/presets';
import { type RowId, type SessionSetup, swellBand } from './sessionSetup';

export type SizeBand = 'small' | 'fun' | 'solid' | 'big';
export type Situation = 'glassy' | 'offshore' | 'onshore' | 'small' | 'solid' | 'big' | 'wet' | 'golden' | 'default';

/** Each rider's descriptors and lines (spec §4.2.1, §8): a first draft, tuned at the gate. */
export interface RiderCopy {
  style: string;
  loves: string;
  /** Said on the pick in Choose your rider. */
  pickLine: string;
  /** Why they took a board, by the swell's band: {size} and {board} filled in ({Size}/{Board} capitalised). */
  boardLines: Record<SizeBand, string[]>;
  /** Said over the water in Conditions when a change makes this situation. */
  situationLines: Record<Situation, string[]>;
  /** Said BY this rider when a mate picks an outfit out of season ({name}: the mate's nickname, short). */
  teaseLines: string[];
}

/** The roster, left to right (spec §4.2). */
export const RIDER_ORDER: readonly PresetName[] = ['male', 'female', 'grommet'];

export const BOARD_WORDS: Record<BoardKind, string> = { thruster: 'thruster', stepUp: 'step-up', bodyboard: 'bodyboard' };
const RIDES: Record<BoardKind, string> = { thruster: 'Shortboard', stepUp: 'step-up', bodyboard: 'bodyboard' };

export const RIDER_COPY: Record<PresetName, RiderCopy> = {
  female: {
    style: 'Smooth lines. Reads the sets.',
    loves: 'Clean, long walls',
    pickLine: 'Reckon it\'s pumping out there!',
    boardLines: {
      small: ['{Size} and peeling. {Board}\'ll do.', 'Little {size}, but it\'s clean. {Board}.', 'Not much in it. {Board} and some patience.'],
      fun: ['Clean {size}. {Board}, easy.', '{Size}? {Board}. Done.', 'Perfect {board} waves.'],
      solid: ['{Size} and hollow, I\'m taking the {board}.', 'Bit of size. {Board} for the drop.', '{Size}. The {board}\'s been waiting for this.'],
      big: ['{Size}. {Board}, and a big breath.', 'It\'s big. {Board} or nothing.', '{Size} sets. I want the {board} under me.'],
    },
    situationLines: {
      glassy: ['Look at it. Glass.', 'Not a breath of wind.'],
      offshore: ['Offshore! Look at the spray off the back.', 'Holding them up nicely.'],
      onshore: ['Bit bumpy, but there\'s waves.', 'Sea breeze is in. Still fun.'],
      small: ['Small, but peeling.', 'Longboard weather, almost.'],
      solid: ['Now we\'re talking.', 'That\'s a proper set.'],
      big: ['Okay. That\'s big.', 'Wow. Look at the size of that.'],
      wet: ['We\'re getting wet anyway.', 'Rain on the water. Love it.'],
      golden: ['Best light of the day.', 'Golden. Let\'s go.'],
      default: ['Reckon it\'s on.', 'Looks good from up here.'],
    },
    teaseLines: ['Bit brave, {name}.', 'You\'ll freeze, {name}.'],
  },
  male: {
    style: 'Goes hard. Gets barrelled or gets smashed.',
    loves: 'Heavy, hollow days',
    pickLine: 'Let\'s get pitted.',
    boardLines: {
      small: ['{Size}. {Board}, and I\'ll find a little tube.', 'Tiny. {Board}, mate.', 'Meh. {Board} it is.'],
      fun: ['{Size} and offshore. {Board}. Mate.', '{Board}. Going vertical.', 'Fun {size}. Taking the {board}.'],
      solid: ['{Size} and sucking. {Board}.', 'Step it up. {Board}.', '{Size}. Grab the {board}, she\'s heavy.'],
      big: ['{Size}! {Board}, let\'s go.', 'Big and mean. {Board}.', 'I\'ve been dreaming of {size}. {Board}.'],
    },
    situationLines: {
      glassy: ['Glassy. Mate.', 'Like a mirror out there.'],
      offshore: ['Four foot and offshore. Mate.', 'Offshore. It\'s on.'],
      onshore: ['Onshore. Still going out.', 'Choppy. Who cares.'],
      small: ['Bit small, eh.', 'Bodyboard day, Grom.'],
      solid: ['Solid! That\'s what I\'m talking about.', 'It\'s pumping.'],
      big: ['Big. Yeah. Big.', 'That one\'s got my name on it.'],
      wet: ['Rain? Already wet, aren\'t we.', 'Bit of drizzle never hurt.'],
      golden: ['Dawny. Love it.', 'Sunset session. Yew.'],
      default: ['Let\'s get pitted.', 'Stop looking, start paddling.'],
    },
    teaseLines: ['Bit brave, {name}.', 'Hope you packed a towel, {name}.'],
  },
  grommet: {
    style: 'Fearless. Drop-knee on everything.',
    loves: 'Anything that breaks',
    pickLine: 'I\'m getting the first one!',
    boardLines: {
      small: ['{Size}! {Board}, I\'m going!', 'Small is fun on a {board}.', '{Board}! First one\'s mine!'],
      fun: ['{Size}! Perfect for the {board}!', '{Board}, drop-knee, every wave!', 'Clean {size}! {Board}!'],
      solid: ['{Size}... {board}, I\'m not scared.', 'Big for me. Still the {board}.', 'Woah, {size}. {Board}, let\'s go!'],
      big: ['{Size}?! {Board}... yeah, okay!', 'It\'s massive! {Board}!', '{Board}. Hold my glasses.'],
    },
    situationLines: {
      glassy: ['It\'s so smooth!', 'Glassy! Glassy!'],
      offshore: ['Offshore! Spray!', 'Look at the spray!'],
      onshore: ['Still waves!', 'Bumpy ones are fun too.'],
      small: ['Perfect for me!', 'I can get heaps!'],
      solid: ['Woah, that\'s big!', 'Did you see that one?!'],
      big: ['Uh... that\'s huge.', 'I\'m still going!'],
      wet: ['Rain\'s fun!', 'We\'re getting wet anyway!'],
      golden: ['It\'s so pretty!', 'Sunset waves!'],
      default: ['Hurry up!', 'Can we go now?'],
    },
    teaseLines: ['Brrr, {name}!', 'You\'re gonna freeze, {name}!'],
  },
};

/** Natural (regular: left foot forward) or Goofy (Andrew's words, Gate B). */
export const stanceLabel = (stance: Stance): string => (stance === 'regular' ? 'Natural' : 'Goofy');

export function ridesLabel(name: PresetName): string {
  const words = boardsFor(PRESETS[name]).map((k) => RIDES[k]);
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(', ');
}

export function crewNote(name: PresetName): string {
  const mates = RIDER_ORDER.filter((n) => n !== name).map((n) => PRESETS[n].nickname);
  return `The crew always paddles out together: ${mates[0]} and ${mates[1]} surf beside you.`;
}

export function sizeBandOf(ft: number): SizeBand {
  return ft < 3 ? 'small' : ft < 5 ? 'fun' : ft < 8 ? 'solid' : 'big';
}

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** "four foot", "three and a half foot". */
export function sizeWords(ft: number): string {
  const whole = Math.floor(ft), half = ft - whole >= 0.5;
  return `${NUMBERS[whole]}${half ? ' and a half' : ''} foot`;
}

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function fillLine(t: string, vars: { size?: string; board?: string; name?: string }): string {
  return t
    .replaceAll('{Size}', cap(vars.size ?? '')).replaceAll('{size}', vars.size ?? '')
    .replaceAll('{Board}', cap(vars.board ?? '')).replaceAll('{board}', vars.board ?? '')
    .replaceAll('{name}', vars.name ?? '');
}

/** A line from a list by seed (a small integer hash, so neighbouring seeds pick differently). */
export function chooseLine(list: readonly string[], seed: number): string {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return list[((h ^ (h >>> 16)) >>> 0) % list.length];
}

/** What a change to `row` makes the conditions feel like. */
export function situationOf(s: SessionSetup, row: RowId): Situation {
  if (row === 'wind' || row === 'preset') {
    if (s.wind === 0) return 'glassy';
    if (s.wind >= 4) return 'onshore';
    if (row === 'wind') return 'offshore';
  }
  if (row === 'swell' || row === 'period' || row === 'preset') {
    const b = swellBand(s.swellFt);
    if (b <= 1) return 'small';
    if (b >= 5) return 'big';
    if (b >= 3) return 'solid';
  }
  if (row === 'sky' && ['drizzle', 'showers', 'rain', 'storm'].includes(s.sky)) return 'wet';
  if (row === 'time' && (s.timeStop === 0 || s.timeStop === 6)) return 'golden';
  return 'default';
}
