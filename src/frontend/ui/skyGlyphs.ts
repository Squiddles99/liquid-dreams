// src/frontend/ui/skyGlyphs.ts: our own sky glyphs in the brand line weight (2.5 px, cream, no fill), 40 × 40.
import type { WeatherPresetName } from '../../weather/weather';

const g = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#f7ecd2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const SUN = '<circle cx="20" cy="20" r="6.5"/><path d="M20 5v4M20 31v4M5 20h4M31 20h4M9.4 9.4l2.8 2.8M27.8 27.8l2.8 2.8M9.4 30.6l2.8-2.8M27.8 12.2l2.8-2.8"/>';
const CLOUD = '<path d="M11 28h18a6 6 0 0 0 0-12 8 8 0 0 0-15.5 2A5 5 0 0 0 11 28z"/>';

/** One glyph per sky, keyed by WEATHER_PRESET_NAMES (the type check and the view's test enforce every key). */
export const SKY_GLYPHS: Record<WeatherPresetName, string> = {
  clear: g(SUN),
  fair: g('<circle cx="14" cy="14" r="5"/><path d="M14 4.5v2.5M4.5 14H7M7.3 7.3l1.8 1.8"/><path d="M20 30h12a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.5A3.5 3.5 0 0 0 20 30z"/>'),
  scattered: g('<circle cx="13" cy="13" r="5"/><path d="M13 4v2.5M4 13h2.5"/>' + CLOUD),
  broken: g(CLOUD + '<path d="M8 20a6 6 0 0 1 10-6"/>'),
  'high cloud': g('<circle cx="14" cy="15" r="5"/><path d="M14 5v2.5M4 15h2.5M7 8l1.8 1.8"/><path d="M14 30h16M18 25h14"/>'),
  overcast: g('<path d="M6 25h28M8 19h24M10 31h20"/>'),
  grey: g(CLOUD + '<path d="M8 33h24"/>'),
  drizzle: g(CLOUD + '<path d="M15 33v1.5M21 33v1.5M27 33v1.5"/>'),
  showers: g(CLOUD + '<path d="M15 32l-1.5 4M21 32l-1.5 4M27 32l-1.5 4"/>'),
  rain: g(CLOUD + '<path d="M13 31l-2 6M19 31l-2 6M25 31l-2 6M31 31l-2 6"/>'),
  storm: g(CLOUD + '<path d="M21 29l-3 5h5l-3 5"/>'),
  'sea mist': g('<path d="M6 14h22M10 20h24M6 26h22M12 32h18"/>'),
};
