import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_OCEAN_SIM } from '../ocean/OceanSimulation';
import { DEFAULT_SPECTRUM_PARAMS } from '../ocean/spectrum';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { DEFAULT_SHALLOW_SWELL } from '../ocean/waterSurface';
import { DEFAULT_PICTURE } from '../render/PicturePipeline';
import { DEFAULT_REEF_PARAMS } from '../seabed/wombReef';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { DEFAULT_SET_PARAMS } from '../swell/sets';
import {
  CustomProfile, DEV_SETTINGS_KEY, type DevSettings, type SettingsStorage, assignParams, carryOverPick, clearDevSettings, cloneDevSettings,
  loadDevSettings, mergeProfile, pickMoment, referenceNameFromHash, saveDevSettings,
} from './devSettings';
import type { CameraPose, Moment } from './momentLink';
import { DEFAULT_MOMENT_NAME, findReferenceMoment } from './referenceMoments';

class FakeStorage implements SettingsStorage {
  readonly items = new Map<string, string>();
  getItem(k: string): string | null {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.items.set(k, v);
  }
  removeItem(k: string): void {
    this.items.delete(k);
  }
}

const throwing: SettingsStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('quota'); },
  removeItem: () => { throw new Error('blocked'); },
};

const DEFAULT_CAMERA: CameraPose = { mode: 'lineup', position: [-25, 0.8, 45], yawDeg: 270, pitchDeg: -2 };

function defaults(): DevSettings {
  return cloneDevSettings({
    mode: 'custom',
    conditions: cloneConditions(DEFAULT_CONDITIONS),
    camera: DEFAULT_CAMERA,
    reference: DEFAULT_MOMENT_NAME,
    spectrum: DEFAULT_SPECTRUM_PARAMS,
    sim: DEFAULT_OCEAN_SIM,
    water: DEFAULT_WATER_OPTICS,
    atmosphere: DEFAULT_ATMOSPHERE,
    picture: DEFAULT_PICTURE,
    maxFps: 60,
    sets: DEFAULT_SET_PARAMS,
    reef: DEFAULT_REEF_PARAMS,
    shallow: DEFAULT_SHALLOW_SWELL,
    overlays: { depthContours: false, crestLines: false },
  });
}

/** Every field moved off its default, so a round trip proves each one is stored and read back. */
function tweaked(): DevSettings {
  const s = defaults();
  s.mode = 'default';
  s.reference = 'golden-hour';
  s.conditions = { date: '2026-04-20', timeOfDay: 16.5, swell: { sizeFt: 6, periodS: 17, directionDeg: 240 }, wind: { speedMs: 7, directionDeg: 200 }, tideM: 0.6, seed: 77 };
  s.camera = { mode: 'free', position: [10, 30, -5], yawDeg: 123, pitchDeg: -30 };
  s.spectrum.windSpread = 9;
  s.spectrum.backgroundSwellFactor = 0.3;
  s.sim.choppiness = 1.4;
  s.water.bodyScale = 2.5;
  s.water.absorptionPerM = [0.4, 0.06, 0.03];
  s.atmosphere.hazeFactor = 3.5;
  s.atmosphere.nightFloor = 1e-6;
  s.picture.agx = true;
  s.picture.evOffset = -1.2;
  s.maxFps = 120;
  s.sets.meanIntervalS = 300;
  s.sets.minWaves = 2;
  s.reef.ledgeDepthM = 7.5;
  s.shallow.fadeToM = 18;
  s.overlays.crestLines = true;
  return s;
}

const store = (value: unknown): FakeStorage => {
  const s = new FakeStorage();
  s.setItem(DEV_SETTINGS_KEY, JSON.stringify(value));
  return s;
};

describe('dev settings persistence', () => {
  it('round-trips every field exactly', () => {
    const s = new FakeStorage();
    const saved = tweaked();
    saveDevSettings(s, saved);
    expect(s.items.has(DEV_SETTINGS_KEY)).toBe(true);
    expect(loadDevSettings(s, defaults())).toEqual(saved);
  });

  it('returns null for an empty store', () => {
    expect(loadDevSettings(new FakeStorage(), defaults())).toBeNull();
  });

  it('returns null for corrupt JSON or a wrong top-level type', () => {
    const s = new FakeStorage();
    s.setItem(DEV_SETTINGS_KEY, '{not json');
    expect(loadDevSettings(s, defaults())).toBeNull();
    for (const v of [null, 42, 'text', [1, 2, 3], true]) expect(loadDevSettings(store(v), defaults())).toBeNull();
  });

  it('never throws when storage throws', () => {
    expect(loadDevSettings(throwing, defaults())).toBeNull();
    expect(() => saveDevSettings(throwing, defaults())).not.toThrow();
    expect(() => clearDevSettings(throwing)).not.toThrow();
  });

  it('clears the key', () => {
    const s = new FakeStorage();
    saveDevSettings(s, tweaked());
    clearDevSettings(s);
    expect(loadDevSettings(s, defaults())).toBeNull();
  });

  it('falls back to the default for a wrong-typed field and keeps the others', () => {
    const t = tweaked();
    const raw = JSON.parse(JSON.stringify(t));
    raw.sim.choppiness = '1.4';
    raw.picture.agx = 1;
    raw.water.absorptionPerM = [0.4, 'x', 0.03];
    raw.maxFps = 'fast';
    raw.reef = 'deep';
    const got = loadDevSettings(store(raw), defaults())!;
    expect(got.sim.choppiness).toBe(DEFAULT_OCEAN_SIM.choppiness);
    expect(got.sim.foamGain).toBe(t.sim.foamGain);
    expect(got.picture.agx).toBe(DEFAULT_PICTURE.agx);
    expect(got.picture.evOffset).toBe(-1.2);
    expect(got.water.absorptionPerM).toEqual(DEFAULT_WATER_OPTICS.absorptionPerM);
    expect(got.water.bodyScale).toBe(2.5);
    expect(got.maxFps).toBe(60);
    expect(got.reef).toEqual(DEFAULT_REEF_PARAMS);
    expect(got.sets.meanIntervalS).toBe(300);
    expect(got.conditions).toEqual(t.conditions);
  });

  it('ignores unknown keys', () => {
    const raw = { ...JSON.parse(JSON.stringify(tweaked())), extra: 1, sim: { ...tweaked().sim, bogus: 5 } };
    const got = loadDevSettings(store(raw), defaults())!;
    expect(got).not.toHaveProperty('extra');
    expect(got.sim).not.toHaveProperty('bogus');
    expect(got).toEqual(tweaked());
  });

  it('fills missing keys from the defaults', () => {
    const got = loadDevSettings(store({ maxFps: 30 }), defaults())!;
    expect(got).toEqual({ ...defaults(), maxFps: 30 });
  });

  it('sanitizes out-of-range conditions', () => {
    const raw = JSON.parse(JSON.stringify(tweaked()));
    raw.conditions.tideM = 9;
    raw.conditions.swell.directionDeg = 370;
    raw.conditions.date = 'yesterday';
    const got = loadDevSettings(store(raw), defaults())!;
    expect(got.conditions.tideM).toBe(1.5);
    expect(got.conditions.swell.directionDeg).toBe(10);
    expect(got.conditions.date).toBe(DEFAULT_CONDITIONS.date);
  });

  it('falls back to the default camera when it is missing or invalid', () => {
    const raw = JSON.parse(JSON.stringify(tweaked()));
    delete raw.camera;
    expect(loadDevSettings(store(raw), defaults())!.camera).toEqual(DEFAULT_CAMERA);
    for (const camera of [{ mode: 'orbit', position: [0, 0, 0], yawDeg: 0, pitchDeg: 0 }, { mode: 'free', position: [0, 0], yawDeg: 0, pitchDeg: 0 }, 'lineup', null]) {
      expect(loadDevSettings(store({ ...raw, camera }), defaults())!.camera).toEqual(DEFAULT_CAMERA);
    }
  });

  it('round-trips the mode and falls back to custom for an invalid one', () => {
    const s = new FakeStorage();
    saveDevSettings(s, { ...defaults(), mode: 'default' });
    expect(loadDevSettings(s, defaults())!.mode).toBe('default');
    const raw = JSON.parse(JSON.stringify(tweaked()));
    for (const mode of ['stock', 3, null]) expect(loadDevSettings(store({ ...raw, mode }), defaults())!.mode).toBe('custom');
  });

  it('round-trips the last picked or linked reference name', () => {
    const s = new FakeStorage();
    saveDevSettings(s, tweaked());
    expect(loadDevSettings(s, defaults())!.reference).toBe('golden-hour');
  });

  it('falls back to the default moment name for an unknown reference', () => {
    const raw = JSON.parse(JSON.stringify(tweaked()));
    for (const reference of ['not-a-moment', '', 42, null, undefined]) {
      expect(loadDevSettings(store({ ...raw, reference }), defaults())!.reference).toBe(DEFAULT_MOMENT_NAME);
    }
  });
});

describe('assignParams', () => {
  it('copies values in place, keeping the object and array identities the panel binds', () => {
    const target = { ...DEFAULT_WATER_OPTICS, absorptionPerM: [...DEFAULT_WATER_OPTICS.absorptionPerM] as [number, number, number] };
    const arr = target.absorptionPerM;
    const source = { ...target, bodyScale: 3, absorptionPerM: [1, 2, 3] as [number, number, number] };
    assignParams(target, source);
    expect(target.bodyScale).toBe(3);
    expect(target.absorptionPerM).toBe(arr);
    expect(arr).toEqual([1, 2, 3]);
    source.absorptionPerM[0] = 9;
    expect(arr[0]).toBe(1);
  });
});

describe('reference picks', () => {
  const current = { date: '2026-01-02', timeOfDay: 14, swell: { sizeFt: 7, periodS: 18, directionDeg: 250 }, wind: { speedMs: 9, directionDeg: 190 }, tideM: -0.8, seed: 5 };
  const here: CameraPose = { mode: 'free', position: [12, 40, -8], yawDeg: 45, pitchDeg: -25 };
  const picked = (): Moment => findReferenceMoment('golden-hour')!;

  it('carry over: date and time from the pick, swell, wind, tide and seed from the current conditions', () => {
    const m = carryOverPick(current, here, picked());
    expect(m.conditions).toEqual({ ...current, date: picked().conditions.date, timeOfDay: picked().conditions.timeOfDay });
    expect(m.conditions.swell).not.toBe(current.swell);
    expect(m.simTime).toBe(picked().simTime);
    expect(m.paused).toBe(picked().paused);
  });

  it('custom mode keeps the current camera pose unchanged', () => {
    const m = pickMoment('custom', current, here, picked());
    expect(m.camera).toEqual(here);
    expect(m.camera).not.toBe(here);
    expect(m.conditions).toEqual(carryOverPick(current, here, picked()).conditions);
  });

  it("default mode applies the picked moment in full, camera included", () => {
    expect(pickMoment('default', current, here, picked())).toEqual(picked());
    expect(pickMoment('default', current, here, picked()).camera).toEqual(picked().camera);
  });

  it('reads the reference name from a #ref= hash', () => {
    expect(referenceNameFromHash('#ref=sunset')).toBe('sunset');
    expect(referenceNameFromHash('#ref=golden-hour')).toBe('golden-hour');
    expect(referenceNameFromHash('#ref=nowhere')).toBeNull();
    expect(referenceNameFromHash('#ref=%E0%A4%A')).toBeNull();
    expect(referenceNameFromHash('#m=abc')).toBeNull();
    expect(referenceNameFromHash('')).toBeNull();
  });
});

describe('a link is a visit, not an edit', () => {
  /** What the app shows after opening the sunset link over a stored custom profile, with one look edit on top. */
  const linkSnapshot = (): DevSettings => {
    const s = defaults();
    s.conditions = findReferenceMoment('sunset')!.conditions;
    s.camera = findReferenceMoment('sunset')!.camera;
    s.atmosphere.hazeFactor = 5;
    return s;
  };

  it('mergeProfile keeps the stored conditions and camera for a link, and takes everything otherwise', () => {
    const stored = tweaked();
    const snap = linkSnapshot();
    expect(mergeProfile(snap, stored, true)).toEqual({ ...snap, conditions: stored.conditions, camera: stored.camera });
    expect(mergeProfile(snap, stored, false)).toEqual(snap);
    expect(mergeProfile(snap, stored, true).conditions).not.toBe(stored.conditions);
  });

  it('a hash visit leaves the stored conditions and camera intact while look edits still save', () => {
    const stored = tweaked();
    const p = new CustomProfile(cloneDevSettings(stored));
    p.visitLink();
    const saved = p.capture(linkSnapshot());
    expect(saved.conditions).toEqual(stored.conditions);
    expect(saved.camera).toEqual(stored.camera);
    expect(saved.atmosphere.hazeFactor).toBe(5);
    // Still a visit on the next save (pagehide), and a later look edit saves too.
    const again = linkSnapshot();
    again.picture.evOffset = 2;
    expect(p.capture(again)).toMatchObject({ conditions: stored.conditions, camera: stored.camera, picture: { evOffset: 2 } });
  });

  it('a condition edit after the visit saves the new conditions', () => {
    const p = new CustomProfile(tweaked());
    p.visitLink();
    p.capture(linkSnapshot());
    p.own(); // the user edited a condition
    const edited = linkSnapshot();
    edited.conditions.swell.sizeFt = 9;
    expect(p.capture(edited)).toEqual(edited);
    expect(p.profile.conditions.swell.sizeFt).toBe(9);
  });

  it('a pick after the visit saves normally', () => {
    const p = new CustomProfile(tweaked());
    p.visitLink();
    p.own(); // picked a reference
    const snap = linkSnapshot();
    const m = pickMoment('custom', snap.conditions, snap.camera, findReferenceMoment('first-sun')!);
    const afterPick = { ...snap, conditions: m.conditions, camera: m.camera };
    expect(p.capture(afterPick)).toEqual(afterPick);
  });

  it('without a visit, capture takes the whole snapshot', () => {
    const p = new CustomProfile(tweaked());
    expect(p.visiting).toBe(false);
    expect(p.capture(linkSnapshot())).toEqual(linkSnapshot());
  });
});
