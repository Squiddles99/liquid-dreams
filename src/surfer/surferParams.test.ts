import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFER_PARAMS, PADDLE_CYCLE_S, POPUP_S, SURFER_PARAM_RANGES, carrySideOf, normalizeSurferParams, playPhase, sanitizeSurferParams } from './surferParams';

describe('surfer params', () => {
  it('start off, on the female surfer sitting on the thruster in the lineup', () => {
    expect(DEFAULT_SURFER_PARAMS).toMatchObject({ enabled: false, preset: 'female', board: 'thruster', pose: 'sit', outfit: 'season', x: -25, z: 45 });
  });
  it('repair a pose that doesn’t exist on the board, and an outfit from the other preset (Review Focus 3)', () => {
    const p = { ...DEFAULT_SURFER_PARAMS, board: 'thruster' as const, pose: 'dropKnee' as const, preset: 'male' as const, outfit: 'bikini' as const };
    normalizeSurferParams(p);
    expect(p.pose).toBe('sit');
    expect(p.outfit).toBe('season');
  });
  it('clamp numbers, wrap the heading, and replace junk (Review Focus 3)', () => {
    const p = sanitizeSurferParams({ enabled: 'yes', preset: 'ghost', compression: 9, lean: Number.NaN, headingDeg: -90, x: 'far', balance: 0, play: 'no', extra: 1 });
    expect(p.enabled).toBe(false);
    expect(p.preset).toBe('female');
    expect(p.compression).toBe(SURFER_PARAM_RANGES.compression.max);
    expect(p.lean).toBe(0);
    expect(p.headingDeg).toBe(270);
    expect(p.x).toBe(DEFAULT_SURFER_PARAMS.x);
    expect(p.balance).toBe(true);
    expect(p.play).toBe(true);
    expect('extra' in p).toBe(false);
  });
  it('turn anything that isn’t an object into the defaults', () => {
    expect(sanitizeSurferParams(null)).toEqual(DEFAULT_SURFER_PARAMS);
    expect(sanitizeSurferParams([1, 2])).toEqual(DEFAULT_SURFER_PARAMS);
  });
});

describe('play (Andrew, gate 2: the bodyboarder needs to kick his fins to move)', () => {
  it('cycles the paddle stroke (and its kicks) with the clock', () => {
    expect(playPhase('paddle', 0, 0.3)).toBeCloseTo(0, 9);
    expect(playPhase('paddle', PADDLE_CYCLE_S / 4, 0.3)).toBeCloseTo(0.25, 9);
    expect(playPhase('paddle', 3 * PADDLE_CYCLE_S + PADDLE_CYCLE_S / 2, 0.3)).toBeCloseTo(0.5, 9);
  });
  it('plays the pop-up through, holds it standing, then goes again', () => {
    expect(playPhase('popup', 0, 0.3)).toBeCloseTo(0, 9);
    expect(playPhase('popup', POPUP_S / 2, 0.3)).toBeCloseTo(0.5, 9);
    expect(playPhase('popup', POPUP_S + 0.5, 0.3)).toBe(1);
  });
  it('leaves a still pose on the phase slider', () => {
    expect(playPhase('trim', 12.3, 0.3)).toBe(0.3);
  });
});

describe('the face (closeup spec §5.2)', () => {
  it('starts with idle life on, the manual face off and its dials at rest', () => {
    expect(DEFAULT_SURFER_PARAMS).toMatchObject({ idle: true, faceManual: false, faceBlink: 0, faceSmile: 0, faceJaw: 0, faceBrows: 0, faceSquint: 0, gazeYawDeg: 0, gazePitchDeg: 0 });
  });
  it('opens old links (no face keys) with the defaults, and repairs junk', () => {
    const old = sanitizeSurferParams({ preset: 'male', pose: 'sit' });
    expect([old.idle, old.faceManual, old.faceSmile]).toEqual([true, false, 0]);
    const junk = sanitizeSurferParams({ idle: 0, faceManual: 'yes', faceSmile: 7, faceBlink: Number.NaN, gazeYawDeg: -40 });
    expect(junk.idle).toBe(true);
    expect(junk.faceManual).toBe(false);
    expect(junk.faceSmile).toBe(1);
    expect(junk.faceBlink).toBe(0);
    expect(junk.gazeYawDeg).toBe(SURFER_PARAM_RANGES.gazeYawDeg.min);
    expect(sanitizeSurferParams({ idle: false }).idle).toBe(false);
  });
});

describe('Grommet in settings and links (grommet Review Focus 1)', () => {
  it('repairs Grommet on a surfboard to his bodyboard and a pose that exists on it', () => {
    const p = sanitizeSurferParams({ preset: 'grommet', board: 'thruster', pose: 'bottomTurn' });
    expect([p.preset, p.board, p.pose]).toEqual(['grommet', 'bodyboard', 'sit']);
  });
  it('keeps a valid bodyboard pose for him', () => {
    expect(sanitizeSurferParams({ preset: 'grommet', board: 'bodyboard', pose: 'dropKnee' }).pose).toBe('dropKnee');
  });
  it('reads onLand as a boolean, off by default and for junk', () => {
    expect(DEFAULT_SURFER_PARAMS.onLand).toBe(false);
    expect(sanitizeSurferParams({ onLand: true }).onLand).toBe(true);
    expect(sanitizeSurferParams({ onLand: 'yes' }).onLand).toBe(false);
  });
});

describe('on land (walking spec §4; Review Focus 1)', () => {
  it('carries the board only on land, on any board', () => {
    expect(sanitizeSurferParams({ pose: 'carry', onLand: false }).pose).toBe('sit');
    expect(sanitizeSurferParams({ pose: 'carry', onLand: true }).pose).toBe('carry');
    expect(sanitizeSurferParams({ preset: 'grommet', board: 'bodyboard', pose: 'carry', onLand: true }).pose).toBe('carry');
  });
  it('wears the walking clothes only on land', () => {
    expect(sanitizeSurferParams({ outfit: 'walking', onLand: false }).outfit).toBe('season');
    expect(sanitizeSurferParams({ outfit: 'walking', onLand: true }).outfit).toBe('walking');
  });
  it('takes the carry side from the rider unless the panel picks one; old links and junk get auto', () => {
    expect(sanitizeSurferParams({}).carrySide).toBe('auto');
    expect(sanitizeSurferParams({ carrySide: 'up' }).carrySide).toBe('auto');
    const side = (preset: 'female' | 'male' | 'grommet', carrySide: 'auto' | 'l' | 'r' = 'auto'): string => carrySideOf(sanitizeSurferParams({ preset, carrySide }));
    expect([side('female'), side('male'), side('grommet')]).toEqual(['l', 'r', 'l']);
    expect(side('male', 'l')).toBe('l');
  });
});
