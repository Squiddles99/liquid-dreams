import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { SHORE_X } from '../seabed/coastProfile';
import type { Conditions } from '../conditions/types';
import { WEATHER_PRESETS } from '../weather/weather';
import type { CameraPose, Moment } from './momentLink';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_SURFER_PARAMS, type SurferParams, sanitizeSurferParams } from '../surfer/surferParams';

/**
 * How a custom-mode pick carries a moment over (see `pickMoment` in devSettings.ts):
 * 'time': date and time of day only, current camera kept. 'view': also switches to the moment's camera.
 * 'set': the full moment, since a set's timeline only lands on cue with its own conditions.
 */
export type MomentKind = 'time' | 'view' | 'set';

export interface ReferenceMoment {
  name: string;
  description: string;
  kind: MomentKind;
  moment: Moment;
}

/** In the deep water just south-west of the peak, where Andrew waits for sets (outside the right's closeout). */
export const DEFAULT_LINEUP_POSITION: [number, number, number] = [-25, 0.8, 45];
export const DEFAULT_MOMENT_NAME = 'morning-offshore';
const REFERENCE_SIM_TIME = 30;

const lineup = (yawDeg: number, pitchDeg: number, position: [number, number, number] = DEFAULT_LINEUP_POSITION): CameraPose => ({
  mode: 'lineup', position: [...position], yawDeg, pitchDeg,
});

/** Drone-like free camera inshore of the peak, looking out to sea over it (Andrew's reference shot). */
const droneOverPeak = (): CameraPose => ({ mode: 'free', position: [45, 14, -25], yawDeg: 225, pitchDeg: -14 });

type ConditionsPatch = Partial<Omit<Conditions, 'swell' | 'wind' | 'weather'>> & {
  swell?: Partial<Conditions['swell']>;
  wind?: Partial<Conditions['wind']>;
};

/** The moments were tuned under a clear sky and keep it (their baselines), except the default morning (fair). */
const conditions = (patch: ConditionsPatch, weather = WEATHER_PRESETS.clear): Conditions => {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  return { ...c, ...patch, swell: { ...c.swell, ...patch.swell }, wind: { ...c.wind, ...patch.wind }, weather: { ...weather } };
};

const ref = (name: string, description: string, c: Conditions, camera: CameraPose, kind: MomentKind = 'time'): ReferenceMoment => ({
  name, description, kind, moment: { conditions: c, camera, simTime: REFERENCE_SIM_TIME, paused: true },
});

const doctor = { speedMs: 6, directionDeg: 225 };

/** The reference set: slot 1's set with the default conditions (the first full set of a session). */
const REF_SET = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
const REF_BIGGEST = REF_SET.reduce((a, b) => (b.heightM > a.heightM ? b : a));
const setMoment = (name: string, description: string, c: Conditions, camera: CameraPose, simTime: number): ReferenceMoment => ({
  name, description, kind: 'set', moment: { conditions: c, camera, simTime, paused: true },
});

/** The stand's surfer, on and still (the phase from the slider, not the clock). */
const stand = (patch: Partial<SurferParams>): SurferParams => sanitizeSurferParams({ ...DEFAULT_SURFER_PARAMS, enabled: true, play: false, ...patch });
const withSurfer = (r: ReferenceMoment, surfer: SurferParams): ReferenceMoment => ({ ...r, moment: { ...r.moment, surfer } });

/** In the pocket of the reference set's biggest wave at 5 ft, 2 s past its arrival (barrel-peeling's wave), placed by eye
 * in the browser at gate 2: on the flat of the tube's base under the lip, heading down the line (WNW). */
const POCKET = { x: 13.6, z: -27.9, headingDeg: 290 };
const pocketCamera = (): CameraPose => ({ mode: 'free', position: [16.5, 2.2, -38.5], yawDeg: 197, pitchDeg: -10 });

/** Sim times just after a Bombie break at these moments' own conditions (set-kind: they need them; found in the browser, ledgered). */
const BOMBIE_LINEUP_SIM_S = 192.5;
const BOMBIE_CLOSE_SIM_S = 131.5;

export const REFERENCE_MOMENTS: ReferenceMoment[] = [
  ref('pre-dawn', '06:30 facing the land (east). Twilight glow where the sun will rise, dark sea, no sun artefacts.', conditions({ timeOfDay: 6.5 }), lineup(90, 4)),
  ref('first-sun', '07:35 facing out to sea (west), sun just up behind you over the land. First light on the swell lines.', conditions({ timeOfDay: 7 + 35 / 60 }), lineup(270, 3)),
  ref('morning-offshore', '08:15 facing west (default). Low sun behind the camera, clear deep-blue water, groomed surface.', conditions({}, DEFAULT_CONDITIONS.weather), lineup(270, -2)),
  ref('late-morning', '10:30 facing west. Higher sun, water clarity, colour holding up before the Doctor.', conditions({ timeOfDay: 10.5 }), lineup(270, -3)),
  ref('noon-deep-blue', '12:30 looking down at ~45°. Body colour and clarity, small glitter.', conditions({ timeOfDay: 12.5 }), lineup(270, -45)),
  ref('autumn-glass', '2026-04-20 09:30 facing west, no wind. Mirror-smooth swell lines, crisp sky reflection.', conditions({ date: '2026-04-20', timeOfDay: 9.5, wind: { speedMs: 0 } }), lineup(270, -3)),
  ref('golden-hour', '16:50 facing the sun, Doctor in. Glitter path, choppier surface, horizon haze (turquoise shows only in a breaking lip, not on unbroken crests).', conditions({ timeOfDay: 16 + 50 / 60, wind: doctor }), lineup(301, 2)),
  ref('sunset', '17:25 facing the sun. Sky colour, exposure, horizon.', conditions({ timeOfDay: 17 + 25 / 60, wind: doctor }), lineup(297, 1)),
  ref('overview', 'Free camera 40 m up at noon. No tiling, LOD transitions, horizon curvature.', conditions({ timeOfDay: 12.5 }), { mode: 'free', position: [60, 40, 0], yawDeg: 270, pitchDeg: -20 }, 'view'),
  setMoment('set-arriving', "08:15 facing south-west: the set's first wave lifting on its approach to the reef, 20 s out.",
    conditions({}), lineup(225, 1), REF_SET[0].arrivalS - 20),
  setMoment('set-on-the-reef', "08:15 from a drone inshore of the peak, looking out to sea as the set's biggest wave stands up on the ledge.",
    conditions({}), droneOverPeak(), REF_BIGGEST.arrivalS - 2),
  setMoment('low-tide-set', 'The same wave at −0.5 m tide: shallower water, standing up harder and earlier.',
    conditions({ tideM: -0.5 }), droneOverPeak(), REF_BIGGEST.arrivalS - 2),
  setMoment('high-tide-set', 'The same wave at +0.5 m tide: deeper water, softer.',
    conditions({ tideM: 0.5 }), droneOverPeak(), REF_BIGGEST.arrivalS - 2),
  ref('looking-down', '10:30 floating over the shelf, looking down: dark limestone and weed, a sand pocket, through clear water.',
    conditions({ timeOfDay: 10.5 }), { mode: 'lineup', position: [12, 0.8, -28], yawDeg: 200, pitchDeg: -60 }, 'view'),
  ref('reef-overhead', 'Free camera 60 m above the reef at noon: the wedge, the shelf and the sand pockets from above.',
    conditions({ timeOfDay: 12.5 }), { mode: 'free', position: [0, 60, 40], yawDeg: 0, pitchDeg: -70 }, 'view'),
  setMoment('barrel-peeling', "08:15, 5 ft: from the shoulder, low over the shelf north-east of the peak, looking back at the lip throwing over the tube.",
    // 15 m further down the shoulder than it first stood: the break fading in along the crest over wave heights (not metres)
    // carries each section further along the shoulder, and from [12, 3.5, -32] the camera sat beside the lip.
    conditions({ swell: { sizeFt: 5 } }), { mode: 'free', position: [18, 3.5, -46], yawDeg: 200, pitchDeg: -6 }, REF_BIGGEST.arrivalS + 2),
  setMoment('closeout-right', "08:15 from a drone over the shelf, looking south-west at the south ledge as the biggest wave's right closes out along it.",
    conditions({}), { mode: 'free', position: [60, 12, 0], yawDeg: 231, pitchDeg: -12 }, REF_BIGGEST.arrivalS + 0.5),
  setMoment('the-drain', "08:15, low in the water in the channel north of the peak, looking at the biggest wave's face as the ledge drains in front of it.",
    conditions({}), lineup(173, 2, [-5, 0.8, -40]), REF_BIGGEST.arrivalS),
  // Andrew's saved view (link: swell 4.652168605638587 ft, wind 6.086943253226902 m/s from 57.39114512567937°,
  // simTime 4163.5516). The wave he was 7.2 s past there is the first (smallest) of a six-wave set in a later slot,
  // not that set's biggest — so it has no equivalent in the reference set. Rebased onto REF_BIGGEST + 7.2 s instead
  // (values rounded to match the panel's own precision).
  setMoment('behind-the-wave',
    "08:15, 4.65 ft, from behind the wave line (Andrew's view): the back of the breaking wave, the sheet in the trough behind it. " +
    "(Andrew's own wave wasn't the reference set's biggest, so this reuses REF_BIGGEST + 7.2 s in its place.)",
    conditions({ swell: { sizeFt: 4.65 }, wind: { speedMs: 6.09, directionDeg: 57 } }),
    { mode: 'free', position: [12, 3.5, -32], yawDeg: 73.5, pitchDeg: -13 }, REF_BIGGEST.arrivalS + 7.2),
  // Placed by eye on the unbroken shoulder, a little ahead of the face, down the line from the lip mid-throw. The break
  // now reaches further along the shoulder (it fades in along the crest over wave heights), so the first placement,
  // [9.5, 2.9, -26], ended up behind the section; closer than ~12 m the camera ends up inside the face.
  setMoment('lip-close-up', "08:15, 5 ft: from the unbroken shoulder, about 15 m down the line from the lip as it throws over the tube.",
    conditions({ swell: { sizeFt: 5 } }),
    { mode: 'free', position: [16, 2.9, -41], yawDeg: 196, pitchDeg: -3 }, REF_BIGGEST.arrivalS + 1.0),
    ref('in-the-shade', "07:45 facing the land (east): the lineup still in the ridge's shade, a glow along the skyline where the sun will break.",
      conditions({ timeOfDay: 7.75 }), lineup(90, 4)),
    // 08:11 since the reef moved in (2026-10-05): the ridge stands 96 m nearer, and the sun clears it at 08:10.
    ref('sunbreak', '08:11 facing the sun (ENE): the sun clearing the ridge, the light arriving across the water.',
      conditions({ timeOfDay: 8 + 11 / 60 }), lineup(58, 4)),
  // 5 m up: from the lineup's own eye height (0.8 m) the surf zone 80–120 m away is a sliver the swell hides; a surfer
  // sees the shore break from the tops of swells (Phase 4b gallery ruling).
  setMoment('surf-from-the-lineup', "08:15 from the top of a swell at the lineup, facing the beach as the reference set's bores reach the shore: white water across the platform, the swash on the sand.",
    conditions({}), { mode: 'free', position: [-25, 5, 45], yawDeg: 90, pitchDeg: -1 }, REF_BIGGEST.arrivalS + 12),
  // Walk mode takes its height from the ground (the y here is informational); before the land loads it is a free pose.
  ref('on-the-beach', '10:30 standing on the dry sand in front of the Womb, looking north along the beach: the rock clumps at the dune toe, the swash.',
    conditions({ timeOfDay: 10.5 }), { mode: 'walk', position: [SHORE_X + 20, 4, -40], yawDeg: 0, pitchDeg: -4 }, 'view'),
  ref('up-the-dune', '08:45 standing at the toe, looking east up the first dune rise into the backlit heath: shrub clumps, glowing rims, the dune still shading the lower slope.',
    conditions({ timeOfDay: 8.75 }), { mode: 'walk', position: [SHORE_X + 44, 4, -38], yawDeg: 90, pitchDeg: 8 }, 'view'),
  setMoment('bombie-from-the-lineup', "08:15, 8 ft, from the Womb's lineup facing south-west: a Bombie burst 450 m out, spray blowing back out to sea on the offshore.",
    conditions({ swell: { sizeFt: 8 } }), lineup(223, 1), BOMBIE_LINEUP_SIM_S),
  setMoment('bombie-close', '10 ft, from 30 m up and 120 m inshore of the Bombie: the burst over the reef, the white water rolling toward shore.',
    conditions({ swell: { sizeFt: 10 } }), { mode: 'free', position: [-180, 30, 330], yawDeg: 270, pitchDeg: -10 }, BOMBIE_CLOSE_SIM_S),
  // The stand's moments (surfer on the stand, sub-project 1): the rider placed by eye in the browser at gate 2.
  withSurfer(setMoment('surfer-lineup-sit', "08:15 at the Womb's lineup: Shazza sitting on her thruster 4.5 m away, nose out to the south-west swell.",
    conditions({}), lineup(258, -5), REFERENCE_SIM_TIME),
  stand({ preset: 'female', board: 'thruster', pose: 'sit', x: -29.4, z: 45.8, headingDeg: 225 })),
  withSurfer(setMoment('surfer-pocket-pigdog', '08:15, 5 ft, from the channel: T-Bone regular on the step-up, pig-dogging backside in the pocket under the lip.',
    conditions({ swell: { sizeFt: 5 } }), pocketCamera(), REF_BIGGEST.arrivalS + 2),
  stand({ preset: 'male', stance: 'regular', board: 'stepUp', pose: 'barrel', ...POCKET })),
  withSurfer(setMoment('surfer-pocket-frontside', '08:15, 5 ft, from the channel: Shazza goofy on the thruster, frontside in the pocket, facing the wave.',
    conditions({ swell: { sizeFt: 5 } }), pocketCamera(), REF_BIGGEST.arrivalS + 2),
  stand({ preset: 'female', stance: 'goofy', board: 'thruster', pose: 'barrel', ...POCKET })),
];

const cloneMoment = (m: Moment): Moment => ({
  conditions: cloneConditions(m.conditions),
  camera: { ...m.camera, position: [...m.camera.position] },
  simTime: m.simTime,
  paused: m.paused,
  ...(m.surfer ? { surfer: { ...m.surfer } } : {}),
});

export function findReferenceMoment(name: string): Moment | null {
  const r = REFERENCE_MOMENTS.find((x) => x.name === name);
  return r ? cloneMoment(r.moment) : null;
}

/** The named moment's kind, or 'time' (the default moment's own kind) for an unrecognised name. */
export function referenceKind(name: string): MomentKind {
  return REFERENCE_MOMENTS.find((x) => x.name === name)?.kind ?? 'time';
}

/** What the app shows with no hash: the default morning session, running. */
export function defaultMoment(): Moment {
  const m = findReferenceMoment(DEFAULT_MOMENT_NAME)!;
  return { ...m, simTime: 0, paused: false };
}
