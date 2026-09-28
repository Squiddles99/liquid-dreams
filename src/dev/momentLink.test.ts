import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { MAX_LINK_SIM_TIME_S, type Moment, decodeMoment, encodeMoment, momentFromHash, momentHashProblem } from './momentLink';
import { DEFAULT_SET_PARAMS, nextSetArrivalS, wavesNear } from '../swell/sets';
import { findReferenceMoment } from './referenceMoments';

const sample: Moment = {
  conditions: { ...cloneConditions(DEFAULT_CONDITIONS), timeOfDay: 16.8333, seed: 99 },
  camera: { mode: 'free', position: [12.5, 40, -3.25], yawDeg: 301, pitchDeg: -12.5 },
  simTime: 123.456,
  paused: true,
};

describe('encode/decode', () => {
  it('round-trips losslessly', () => {
    const hash = encodeMoment(sample);
    expect(hash.startsWith('#m=')).toBe(true);
    expect(decodeMoment(hash)).toEqual(sample);
  });
  it('round-trips a walk pose', () => {
    const walk: Moment = { ...sample, camera: { mode: 'walk', position: [210, 4, -40], yawDeg: 0, pitchDeg: -4 } };
    expect(decodeMoment(encodeMoment(walk))).toEqual(walk);
  });
  it('uses URL-safe characters only', () => {
    expect(encodeMoment(sample).slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('rejects garbage', () => {
    expect(decodeMoment('#m=%%%not-base64')).toBeNull();
    expect(decodeMoment('#m=')).toBeNull();
    expect(decodeMoment('')).toBeNull();
    expect(decodeMoment('#something-else')).toBeNull();
  });
  it('rejects other versions', () => {
    const b64 = btoa(JSON.stringify({ ...sample, v: 2 })).replace(/=+$/, '');
    expect(decodeMoment(`#m=${b64}`)).toBeNull();
  });
  it('rejects invalid camera data', () => {
    const bad = btoa(JSON.stringify({ v: 1, ...sample, camera: { mode: 'drone', position: [0, 0], yawDeg: 'x', pitchDeg: 0 } })).replace(/=+$/, '');
    expect(decodeMoment(`#m=${bad}`)).toBeNull();
  });
  it('sanitises hand-edited conditions instead of rejecting', () => {
    const edited = btoa(JSON.stringify({ v: 1, ...sample, conditions: { swell: { sizeFt: 99 } } })).replace(/=+$/, '');
    const m = decodeMoment(`#m=${edited}`);
    expect(m?.conditions.swell.sizeFt).toBe(12);
    expect(m?.conditions.date).toBe(DEFAULT_CONDITIONS.date);
  });
  it('clamps an absurd simTime instead of accepting it verbatim (unbounded, it can freeze the tab)', () => {
    const huge = btoa(JSON.stringify({ v: 1, ...sample, simTime: 1e19 })).replace(/=+$/, '');
    const m = decodeMoment(`#m=${huge}`);
    expect(m?.simTime).toBe(MAX_LINK_SIM_TIME_S);
    // And the clamped time itself is still safe to hand to the set timeline.
    expect(nextSetArrivalS(m!.simTime, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)).not.toBeNull();
    expect(wavesNear(m!.simTime, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)).toEqual(expect.any(Array));
  });
});

describe('momentFromHash', () => {
  it('resolves #ref=<name>', () => {
    expect(momentFromHash('#ref=golden-hour')).toEqual(findReferenceMoment('golden-hour'));
  });
  it('returns null for unknown references', () => {
    expect(momentFromHash('#ref=unknown')).toBeNull();
  });
  it('decodes #m= links', () => {
    expect(momentFromHash(encodeMoment(sample))).toEqual(sample);
  });
  it('returns null for empty hashes', () => {
    expect(momentFromHash('')).toBeNull();
  });
  it('returns null on malformed #ref= escapes', () => {
    expect(momentFromHash('#ref=%')).toBeNull();
    expect(momentFromHash('#ref=%E0%A4%A')).toBeNull();
  });
});

describe('momentHashProblem (why a non-empty hash opened nothing)', () => {
  it('is null for empty hashes and for hashes that resolve', () => {
    for (const h of ['', '#', '#ref=golden-hour', encodeMoment(sample)]) expect(momentHashProblem(h)).toBeNull();
  });
  it('names an unknown reference moment', () => {
    expect(momentHashProblem('#ref=nope')).toMatch(/unknown reference moment "nope"/);
    expect(momentHashProblem('#ref=%')).toMatch(/reference/);
  });
  it('explains why a #m= link was rejected', () => {
    expect(momentHashProblem('#m=%%%not-base64')).toMatch(/not valid/);
    expect(momentHashProblem('#m=')).toMatch(/empty/);
    expect(momentHashProblem(`#m=${btoa(JSON.stringify({ ...sample, v: 2 })).replace(/=+$/, '')}`)).toMatch(/version 2/);
    const badCamera = btoa(JSON.stringify({ v: 1, ...sample, camera: { mode: 'drone' } })).replace(/=+$/, '');
    expect(momentHashProblem(`#m=${badCamera}`)).toMatch(/camera/);
  });
  it('flags hashes that are neither #m= nor #ref=', () => {
    expect(momentHashProblem('#something-else')).toMatch(/#m=.*#ref=/);
  });
});
