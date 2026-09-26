import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import type { Conditions } from '../conditions/types';
import type { CameraPose, Moment } from './momentLink';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';

export interface ReferenceMoment {
  name: string;
  description: string;
  moment: Moment;
}

/** In the deep water just south-west of the peak, where Andrew waits for sets (outside the right's closeout). */
export const DEFAULT_LINEUP_POSITION: [number, number, number] = [-25, 0.8, 45];
export const DEFAULT_MOMENT_NAME = 'morning-offshore';
const REFERENCE_SIM_TIME = 30;

const lineup = (yawDeg: number, pitchDeg: number): CameraPose => ({
  mode: 'lineup', position: [...DEFAULT_LINEUP_POSITION], yawDeg, pitchDeg,
});

/** Drone-like free camera inshore of the peak, looking out to sea over it (Andrew's reference shot). */
const droneOverPeak = (): CameraPose => ({ mode: 'free', position: [45, 14, -25], yawDeg: 225, pitchDeg: -14 });

type ConditionsPatch = Partial<Omit<Conditions, 'swell' | 'wind'>> & {
  swell?: Partial<Conditions['swell']>;
  wind?: Partial<Conditions['wind']>;
};

const conditions = (patch: ConditionsPatch): Conditions => {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  return { ...c, ...patch, swell: { ...c.swell, ...patch.swell }, wind: { ...c.wind, ...patch.wind } };
};

const ref = (name: string, description: string, c: Conditions, camera: CameraPose): ReferenceMoment => ({
  name, description, moment: { conditions: c, camera, simTime: REFERENCE_SIM_TIME, paused: true },
});

const doctor = { speedMs: 6, directionDeg: 225 };

/** The reference set: slot 1's set with the default conditions (the first full set of a session). */
const REF_SET = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
const REF_BIGGEST = REF_SET.reduce((a, b) => (b.heightM > a.heightM ? b : a));
const setMoment = (name: string, description: string, c: Conditions, camera: CameraPose, simTime: number): ReferenceMoment => ({
  name, description, moment: { conditions: c, camera, simTime, paused: true },
});

export const REFERENCE_MOMENTS: ReferenceMoment[] = [
  ref('pre-dawn', '06:30 facing the land (east). Twilight glow where the sun will rise, dark sea, no sun artefacts.', conditions({ timeOfDay: 6.5 }), lineup(90, 4)),
  ref('first-sun', '07:35 facing out to sea (west), sun just up behind you over the land. First light on the swell lines.', conditions({ timeOfDay: 7 + 35 / 60 }), lineup(270, 3)),
  ref('morning-offshore', '08:15 facing west (default). Low sun behind the camera, clear deep-blue water, groomed surface.', conditions({}), lineup(270, -2)),
  ref('late-morning', '10:30 facing west. Higher sun, water clarity, colour holding up before the Doctor.', conditions({ timeOfDay: 10.5 }), lineup(270, -3)),
  ref('noon-deep-blue', '12:30 looking down at ~45°. Body colour and clarity, small glitter.', conditions({ timeOfDay: 12.5 }), lineup(270, -45)),
  ref('autumn-glass', '2026-04-20 09:30 facing west, no wind. Mirror-smooth swell lines, crisp sky reflection.', conditions({ date: '2026-04-20', timeOfDay: 9.5, wind: { speedMs: 0 } }), lineup(270, -3)),
  ref('golden-hour', '16:50 facing the sun, Doctor in. Glitter path, crest transmission, choppier surface, horizon haze.', conditions({ timeOfDay: 16 + 50 / 60, wind: doctor }), lineup(301, 2)),
  ref('sunset', '17:25 facing the sun. Sky colour, exposure, horizon.', conditions({ timeOfDay: 17 + 25 / 60, wind: doctor }), lineup(297, 1)),
  ref('overview', 'Free camera 40 m up at noon. No tiling, LOD transitions, horizon curvature.', conditions({ timeOfDay: 12.5 }), { mode: 'free', position: [60, 40, 0], yawDeg: 270, pitchDeg: -20 }),
  setMoment('set-arriving', "08:15 facing south-west: the set's first wave lifting on its approach to the reef, 20 s out.",
    conditions({}), lineup(225, 1), REF_SET[0].arrivalS - 20),
  setMoment('set-on-the-reef', "08:15 from a drone inshore of the peak, looking out to sea as the set's biggest wave stands up on the ledge.",
    conditions({}), droneOverPeak(), REF_BIGGEST.arrivalS - 2),
  setMoment('low-tide-set', 'The same wave at −0.5 m tide: shallower water, standing up harder and earlier.',
    conditions({ tideM: -0.5 }), droneOverPeak(), REF_BIGGEST.arrivalS - 2),
  setMoment('high-tide-set', 'The same wave at +0.5 m tide: deeper water, softer.',
    conditions({ tideM: 0.5 }), droneOverPeak(), REF_BIGGEST.arrivalS - 2),
  ref('looking-down', '10:30 floating over the shelf, looking down: dark limestone and weed, a sand pocket, through clear water.',
    conditions({ timeOfDay: 10.5 }), { mode: 'lineup', position: [12, 0.8, -28], yawDeg: 200, pitchDeg: -60 }),
  ref('reef-overhead', 'Free camera 60 m above the reef at noon: the wedge, the shelf and the sand pockets from above.',
    conditions({ timeOfDay: 12.5 }), { mode: 'free', position: [0, 60, 40], yawDeg: 0, pitchDeg: -70 }),
];

const cloneMoment = (m: Moment): Moment => ({
  conditions: cloneConditions(m.conditions),
  camera: { ...m.camera, position: [...m.camera.position] },
  simTime: m.simTime,
  paused: m.paused,
});

export function findReferenceMoment(name: string): Moment | null {
  const r = REFERENCE_MOMENTS.find((x) => x.name === name);
  return r ? cloneMoment(r.moment) : null;
}

/** What the app shows with no hash: the default morning session, running. */
export function defaultMoment(): Moment {
  const m = findReferenceMoment(DEFAULT_MOMENT_NAME)!;
  return { ...m, simTime: 0, paused: false };
}
