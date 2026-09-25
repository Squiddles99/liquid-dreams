import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { type Moment, decodeMoment, encodeMoment, momentFromHash } from './momentLink';
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
});
