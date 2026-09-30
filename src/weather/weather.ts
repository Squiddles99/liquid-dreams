/**
 * The weather: one more condition beside swell, wind, tide and time (spec 2026-09-30 §3). Presets are named points in
 * it; the panel's sliders move freely between them. The surface wind stays in `Conditions.wind`: a preset never sets it.
 */
export interface WeatherConditions {
  /** How much of the sky the low cloud covers: 0 clear, 1 overcast. */
  lowCover: number;
  /** How tall the low cloud grows: flat stratocumulus (0), cumulus (~0.4), congestus (~0.7), cumulonimbus (1). */
  convection: number;
  /** The low cloud's base (m): low and ragged in a front, about 1 km in fair weather. */
  lowBaseM: number;
  /** Altostratus / altocumulus sheet, 3.5–4.2 km. */
  midCover: number;
  /** Cirrus / cirrostratus, about 9 km. */
  highCover: number;
  /**
   * Rain rate under the rain cells: 0 none, 0.2 drizzle, 0.5 steady rain, 1 downpour (falling rain: phase W2). The
   * cells pass through: the grey sky above them is often dry at the lineup, and most rain falls once the clouds have
   * crossed the coast, over the land (Andrew, 2026-09-30).
   */
  rain: number;
  /** Lightning and thunder under the tallest cells (phase W2). */
  storm: number;
  /**
   * The air's visibility (km) between showers: haze, mist, fog; 60 adds nothing to the clear atmosphere's own haze.
   * Falling rain lowers it further only where it falls (W2).
   */
  visibilityKm: number;
  /** How deep that haze is (m): ~60 for sea mist lying on the water, ~1500 for rain haze. */
  fogTopM: number;
  /** The steering wind that moves the clouds: the direction it comes FROM (degrees true) and its speed. */
  windAloftDeg: number;
  windAloftMs: number;
}

export const WEATHER_PRESET_NAMES = [
  'clear', 'fair', 'scattered', 'broken', 'high cloud', 'overcast', 'grey', 'drizzle', 'showers', 'rain', 'storm', 'sea mist',
] as const;
export type WeatherPresetName = (typeof WEATHER_PRESET_NAMES)[number];

export const WEATHER_RANGES: Readonly<Record<keyof WeatherConditions, { min: number; max: number }>> = {
  lowCover: { min: 0, max: 1 },
  convection: { min: 0, max: 1 },
  lowBaseM: { min: 200, max: 2000 },
  midCover: { min: 0, max: 1 },
  highCover: { min: 0, max: 1 },
  rain: { min: 0, max: 1 },
  storm: { min: 0, max: 1 },
  visibilityKm: { min: 0.2, max: 60 },
  fogTopM: { min: 20, max: 3000 },
  windAloftDeg: { min: 0, max: 360 },
  windAloftMs: { min: 0, max: 40 },
};

type W = WeatherConditions;
const w = (lowCover: number, convection: number, lowBaseM: number, midCover: number, highCover: number, rain: number,
  storm: number, visibilityKm: number, fogTopM: number, windAloftDeg: number, windAloftMs: number): Readonly<W> =>
  Object.freeze({ lowCover, convection, lowBaseM, midCover, highCover, rain, storm, visibilityKm, fogTopM, windAloftDeg, windAloftMs });

/**
 * The Capes' skies (spec §2), in spectrum order. The winter westerlies aloft carry the clouds in from the sea (from
 * ~270°); ahead of a front the steering wind backs north-west and strengthens.
 */
export const WEATHER_PRESETS: Readonly<Record<WeatherPresetName, Readonly<W>>> = Object.freeze({
  //                   low   conv  base  mid   high  rain  storm vis   fogTop aloft°  m/s
  'clear': w(0, 0.4, 1000, 0, 0, 0, 0, 60, 1500, 270, 10),
  'fair': w(0.22, 0.25, 900, 0, 0.05, 0, 0, 60, 1500, 270, 8),
  'scattered': w(0.35, 0.4, 900, 0, 0.1, 0, 0, 50, 1500, 270, 10),
  'broken': w(0.65, 0.2, 800, 0.1, 0.1, 0, 0, 40, 1500, 280, 12),
  'high cloud': w(0.05, 0.3, 1200, 0.12, 0.6, 0, 0, 40, 1500, 300, 20),
  'overcast': w(0.95, 0.1, 700, 0.4, 0.3, 0, 0, 25, 1500, 280, 12),
  // The low grey deck with no rain: very common at the Capes (Andrew). The rain presets rain, mostly over the land.
  'grey': w(1, 0.15, 450, 0.5, 0.2, 0, 0, 20, 1500, 280, 12),
  // The rain skies' visibility is the dry air between showers; the rain itself will lower it where it falls (W2).
  'drizzle': w(1, 0.05, 400, 0.6, 0.3, 0.2, 0, 12, 1200, 270, 12),
  'showers': w(0.45, 0.85, 800, 0.1, 0.2, 0.6, 0.1, 40, 1500, 250, 15),
  'rain': w(1, 0.3, 350, 0.9, 0.5, 0.5, 0, 10, 1500, 320, 18),
  // The towers punch through the mid levels and their anvils shade them: no sunlit mid sheet showing through the gaps.
  'storm': w(0.95, 1, 500, 0, 0.4, 1, 1, 8, 1500, 300, 22),
  'sea mist': w(0, 0.3, 1000, 0, 0.15, 0, 0, 0.8, 60, 270, 5),
});

const clamp = (v: number, r: { min: number; max: number }): number => Math.min(r.max, Math.max(r.min, v));
const wrap = (d: number): number => ((d % 360) + 360) % 360;

/** Turn untrusted input (links, stored profiles, panel edits) into valid weather; fields missing or junk come from `fallback`. */
export function sanitizeWeather(input: unknown, fallback: Readonly<W>): W {
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = { ...fallback };
  for (const k of Object.keys(WEATHER_RANGES) as (keyof W)[]) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = k === 'windAloftDeg' ? wrap(v) : clamp(v, WEATHER_RANGES[k]);
  }
  return out;
}

/** The preset `w` is exactly, or null (the panel shows "custom"). */
export function presetOf(weather: Readonly<W>): WeatherPresetName | null {
  const keys = Object.keys(WEATHER_RANGES) as (keyof W)[];
  return WEATHER_PRESET_NAMES.find((n) => keys.every((k) => WEATHER_PRESETS[n][k] === weather[k])) ?? null;
}
