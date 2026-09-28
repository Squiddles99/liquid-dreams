import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_OCEAN_SIM } from '../ocean/OceanSimulation';
import { DEFAULT_DEBUG_OVERLAYS } from '../ocean/OceanSurface';
import { DEFAULT_SPECTRUM_PARAMS } from '../ocean/spectrum';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { DEFAULT_SHALLOW_SWELL } from '../ocean/waterSurface';
import { DEFAULT_PICTURE } from '../render/PicturePipeline';
import { DEFAULT_REEF_PARAMS } from '../seabed/wombReef';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { DEFAULT_SET_PARAMS } from '../swell/sets';
import { DEFAULT_FOAM_PARAMS } from '../whitewater/foamStep';
import { DEFAULT_IMPACT_PARAMS, DEFAULT_SPRAY_PARAMS } from '../whitewater/sprayEmitters';
import { DEFAULT_LAND_PARAMS } from '../land/landParams';
import {
  BREAKING_MODEL, CustomProfile, DEV_SETTINGS_KEY, type DevSettings, type SettingsStorage, assignParams, carryOverPick, clearDevSettings, cloneDevSettings,
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
    overlays: DEFAULT_DEBUG_OVERLAYS,
    breaking: DEFAULT_BREAK_PARAMS,
    foam: DEFAULT_FOAM_PARAMS,
    spray: DEFAULT_SPRAY_PARAMS,
    impact: DEFAULT_IMPACT_PARAMS,
    land: DEFAULT_LAND_PARAMS,
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
  s.overlays.ribbonTint = true;
  s.overlays.foamMap = true;
  s.breaking.enabled = false;
  s.breaking.stageSpan = 2.2;
  s.breaking.ribbonOnset = 0.62;
  s.foam.clearTimeS = 14;
  s.foam.driftMps = 0.9;
  s.spray.amount = 1.7;
  s.spray.lifeS = 3.1;
  s.impact.amount = 2.2;
  s.land.sandBrightness = 1.3;
  s.land.shadow = false;
  s.overlays.coverMap = true;
  s.overlays.sunlightMap = true;
  s.overlays.sprayTint = true;
  return s;
}

/** A store holding `value` as saved by this build (breakingModel stamped on objects), or by an older one (model null). */
const store = (value: unknown, model: number | null = BREAKING_MODEL): FakeStorage => {
  const s = new FakeStorage();
  const stamped = model !== null && typeof value === 'object' && value !== null && !Array.isArray(value) ? { breakingModel: model, ...value } : value;
  s.setItem(DEV_SETTINGS_KEY, JSON.stringify(stamped));
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

  it('overlays.ribbonTint persists and defaults to false', () => {
    expect(DEFAULT_DEBUG_OVERLAYS.ribbonTint).toBe(false);
    expect(defaults().overlays.ribbonTint).toBe(false);
    const s = new FakeStorage();
    const saved = defaults();
    saved.overlays.ribbonTint = true;
    saveDevSettings(s, saved);
    expect(loadDevSettings(s, defaults())?.overlays.ribbonTint).toBe(true);
    // A profile stored before the toggle existed loads with it off and keeps its other overlays.
    const raw = JSON.parse(JSON.stringify(defaults()));
    delete raw.overlays.ribbonTint;
    raw.overlays.crestLines = true;
    const got = loadDevSettings(store(raw), defaults());
    expect(got?.overlays.ribbonTint).toBe(false);
    expect(got?.overlays.crestLines).toBe(true);
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

  it('loads a Phase 1 profile with the default break params', () => {
    const phase1 = JSON.parse(JSON.stringify(tweaked())) as Record<string, unknown>;
    delete phase1.breaking;
    const loaded = loadDevSettings(store(phase1), defaults())!;
    expect(loaded.breaking).toEqual(DEFAULT_BREAK_PARAMS);
    expect(loaded.sets.meanIntervalS).toBe(300); // the rest of the stored look still loads
  });
  it('loads an overnight profile (breaking model 1): its breaking falls back to the defaults, removed fields gone', () => {
    // Andrew's stored overnight Phase 2 settings: every field BreakParams had then, none of the new ones.
    const overnight = {
      enabled: true, gamma: 0.83, delta: 1.0, hFloorM: 0.3, stageSpan: 1.0, thetaMaxDeg: 120, pivotDrop: 0.65, pivotAhead: 0.65, lipZone: 0.4,
      lipBackReach: 0.6, troughDrain: 0.35, beta: 0.4, faceWidth: 0.5, backWidth: 2, drainEnd: 0.25, steepEnd: 0.3, curlStart: 0.15, curlEnd: 0.8,
      collapseStart: 0.75,
    };
    const stored = { ...(JSON.parse(JSON.stringify(tweaked())) as Record<string, unknown>), breaking: overnight };
    const loaded = loadDevSettings(store(stored, null), defaults())!;
    expect(loaded.breaking).toEqual(DEFAULT_BREAK_PARAMS);
    for (const removed of ['thetaMaxDeg', 'pivotDrop', 'pivotAhead', 'lipZone', 'lipBackReach', 'backWidth', 'steepEnd', 'curlStart', 'curlEnd']) {
      expect(removed in loaded.breaking, removed).toBe(false);
    }
  });
  it('drops a stored breaking saved under another breaking model (its numbers meant something else) and keeps the rest', () => {
    const loaded = loadDevSettings(store(JSON.parse(JSON.stringify(tweaked())), null), defaults())!;
    expect(loaded.breaking).toEqual(DEFAULT_BREAK_PARAMS);
    expect(loaded.sets.meanIntervalS).toBe(300);
    expect(loadDevSettings(store(JSON.parse(JSON.stringify(tweaked())), 1), defaults())!.breaking).toEqual(DEFAULT_BREAK_PARAMS);
    // A save from this build stamps the model, so its breaking loads.
    const s = new FakeStorage();
    saveDevSettings(s, tweaked());
    expect(loadDevSettings(s, defaults())!.breaking).toEqual(tweaked().breaking);
  });
  it('repairs a bad break value from the default and keeps the others', () => {
    const s = tweaked() as unknown as Record<string, Record<string, unknown>>;
    s.breaking.gamma = 'lots';
    const loaded = loadDevSettings(store(s), defaults())!;
    expect(loaded.breaking.gamma).toBe(DEFAULT_BREAK_PARAMS.gamma);
    expect(loaded.breaking.stageSpan).toBe(2.2);
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
  // "current": the live conditions/camera on screen. "stored": Andrew's own profile, distinct from current so a
  // test can tell which basis a pick actually used.
  const current = { date: '2026-01-02', timeOfDay: 14, swell: { sizeFt: 7, periodS: 18, directionDeg: 250 }, wind: { speedMs: 9, directionDeg: 190 }, tideM: -0.8, seed: 5 };
  const here: CameraPose = { mode: 'free', position: [12, 40, -8], yawDeg: 45, pitchDeg: -25 };
  const storedConditions = { date: '2026-02-03', timeOfDay: 9, swell: { sizeFt: 8.2, periodS: 16, directionDeg: 230 }, wind: { speedMs: 4, directionDeg: 180 }, tideM: 0.2, seed: 11 };
  const storedCamera: CameraPose = { mode: 'lineup', position: [-25, 0.8, 45], yawDeg: 270, pitchDeg: -2 };
  const stored = { conditions: storedConditions, camera: storedCamera };
  const picked = (): Moment => findReferenceMoment('golden-hour')!; // a 'time' moment
  const pickedView = (): Moment => findReferenceMoment('reef-overhead')!; // a 'view' moment
  const pickedSet = (): Moment => findReferenceMoment('set-arriving')!; // a 'set' moment

  it('carry over: date and time from the pick, swell, wind, tide and seed from the current conditions', () => {
    const m = carryOverPick(current, here, picked());
    expect(m.conditions).toEqual({ ...current, date: picked().conditions.date, timeOfDay: picked().conditions.timeOfDay });
    expect(m.conditions.swell).not.toBe(current.swell);
    expect(m.simTime).toBe(picked().simTime);
    expect(m.paused).toBe(picked().paused);
  });

  it('custom + time, no visit: carries over as today, from the current conditions and camera, and is not a visit', () => {
    const { moment, visit } = pickMoment('custom', 'time', false, current, stored, here, picked());
    expect(visit).toBe(false);
    expect(moment.camera).toEqual(here);
    expect(moment.camera).not.toBe(here);
    expect(moment.conditions).toEqual(carryOverPick(current, here, picked()).conditions);
  });

  it("custom + time, after a visit: restores the stored conditions and camera, with the moment's date and time, and ends the visit", () => {
    const { moment, visit } = pickMoment('custom', 'time', true, current, stored, here, picked());
    expect(visit).toBe(false);
    expect(moment.camera).toEqual(storedCamera);
    expect(moment.camera).not.toBe(storedCamera);
    expect(moment.conditions).toEqual({ ...storedConditions, date: picked().conditions.date, timeOfDay: picked().conditions.timeOfDay });
  });

  it("custom + view: carries over conditions but switches to the moment's own camera, and counts as a visit", () => {
    const { moment, visit } = pickMoment('custom', 'view', false, current, stored, here, pickedView());
    expect(visit).toBe(true);
    expect(moment.camera).toEqual(pickedView().camera);
    expect(moment.camera).not.toBe(pickedView().camera);
    expect(moment.conditions).toEqual(carryOverPick(current, here, pickedView()).conditions);
  });

  it('custom + set: applies the full moment, conditions and camera included, and counts as a visit', () => {
    const { moment, visit } = pickMoment('custom', 'set', false, current, stored, here, pickedSet());
    expect(visit).toBe(true);
    expect(moment).toEqual(pickedSet());
    expect(moment.conditions).not.toBe(pickedSet().conditions);
    expect(moment.camera).not.toBe(pickedSet().camera);
  });

  it('default mode applies the picked moment in full regardless of kind or an active visit, and is never a visit', () => {
    for (const kind of ['time', 'view', 'set'] as const) {
      for (const visiting of [false, true]) {
        const { moment, visit } = pickMoment('default', kind, visiting, current, stored, here, picked());
        expect(visit).toBe(false);
        expect(moment).toEqual(picked());
      }
    }
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

describe('a view or set pick is a visit', () => {
  const profileWithStored = (): CustomProfile => new CustomProfile(cloneDevSettings({ ...defaults(), conditions: findReferenceMoment('sunset')!.conditions, camera: findReferenceMoment('sunset')!.camera }));

  it('a set pick leaves the stored profile, and the reference name, intact across a save', () => {
    const profile = profileWithStored(); // reference: DEFAULT_MOMENT_NAME
    const referenceBefore = profile.profile.reference;
    const picked = findReferenceMoment('set-arriving')!;
    const { moment, visit } = pickMoment('custom', 'set', profile.visiting, profile.profile.conditions, profile.profile, profile.profile.camera, picked);
    expect(visit).toBe(true);
    profile.visitLink();
    // The app now shows the set moment's own (very different) conditions and camera, and the list shows its name;
    // a save must not adopt any of that into the stored profile.
    const saved = profile.capture({ ...profile.profile, conditions: moment.conditions, camera: moment.camera, reference: 'set-arriving' });
    expect(saved.conditions).toEqual(profile.profile.conditions);
    expect(saved.camera).toEqual(profile.profile.camera);
    expect(saved.reference).toBe(referenceBefore);
  });

  it('a view pick keeps the stored camera and reference name across a save', () => {
    const profile = profileWithStored();
    const storedCameraBefore = profile.profile.camera;
    const referenceBefore = profile.profile.reference;
    const picked = findReferenceMoment('reef-overhead')!;
    const { moment, visit } = pickMoment('custom', 'view', profile.visiting, profile.profile.conditions, profile.profile, profile.profile.camera, picked);
    expect(visit).toBe(true);
    expect(moment.camera).toEqual(picked.camera); // the view is shown...
    profile.visitLink();
    const saved = profile.capture({ ...profile.profile, conditions: moment.conditions, camera: moment.camera, reference: 'reef-overhead' });
    expect(saved.camera).toEqual(storedCameraBefore); // ...but the save keeps Andrew's own camera...
    expect(saved.reference).toBe(referenceBefore); // ...and the reference list still shows what he actually picked.
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

  it('mergeProfile keeps the stored conditions, camera and reference name for a link, and takes everything otherwise', () => {
    const stored = tweaked(); // reference: 'golden-hour'
    const snap = linkSnapshot(); // reference: DEFAULT_MOMENT_NAME, from defaults()
    expect(mergeProfile(snap, stored, true)).toEqual({ ...snap, conditions: stored.conditions, camera: stored.camera, reference: stored.reference });
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

  it('a time pick after a visit restores the stored profile (not the visited state) and ends the visit', () => {
    const p = new CustomProfile(tweaked());
    p.visitLink();
    const snap = linkSnapshot(); // still showing the sunset link's moment live
    const { moment, visit } = pickMoment('custom', 'time', p.visiting, snap.conditions, p.profile, snap.camera, findReferenceMoment('first-sun')!);
    expect(visit).toBe(false);
    p.own(); // the time pick ends the visit
    expect(moment.conditions).toEqual({ ...tweaked().conditions, date: findReferenceMoment('first-sun')!.conditions.date, timeOfDay: findReferenceMoment('first-sun')!.conditions.timeOfDay });
    expect(moment.camera).toEqual(tweaked().camera);
    const afterPick = { ...snap, conditions: moment.conditions, camera: moment.camera };
    expect(p.capture(afterPick)).toEqual(afterPick);
  });

  it('without a visit, capture takes the whole snapshot', () => {
    const p = new CustomProfile(tweaked());
    expect(p.visiting).toBe(false);
    expect(p.capture(linkSnapshot())).toEqual(linkSnapshot());
  });
});

describe('Phase 4a land settings', () => {
  it('settings stored before Phase 4a (no land) load the land defaults', () => {
    const old = JSON.parse(JSON.stringify(defaults())) as Record<string, unknown>;
    delete old.land;
    expect(loadDevSettings(store(old), defaults())!.land).toEqual(DEFAULT_LAND_PARAMS);
  });
});
