# The Dune Select Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build front-door step 4: the three camera beats on the dune above the Womb (Conditions, Choose your rider, Grab your gear), where the player sets the session, picks who they ride as, takes a board and an outfit, and paddles out.

**Architecture:** Everything with logic is a pure module in `src/frontend/`, unit-tested in vitest:
- the conditions model (`sessionSetup.ts`);
- the board pick (`boardPick.ts`);
- the copy (`riderCopy.ts`);
- the state machine (`frontEnd.ts`);
- input (`uiInput.ts`);
- the camera shots and crew staging (`beatCamera.ts`, `staging.ts`);
- settings and remembered choices (`frontSettings.ts`);
- the map geometry (`mapGeom.ts`).

The DOM layer (`src/frontend/ui/`) is thin and checked by in-browser self-tests. The riders get a new land pose (`selectStand`) with per-rider idles, and authored expressions. `GangLineup` takes per-rider staging. `FrontEnd.ts` wires the state machine, input, staging, camera moves and sounds to a small `FrontEndHost` interface that `App` implements.

**Tech Stack:** TypeScript 7, three.js r186 (WebGPU, TSL), Vite 8, vitest 5 (node environment, no DOM library), WebAudio, the Gamepad API, Node 24 tools.

**Spec:** `docs/superpowers/specs/2026-10-02-dune-select-design.md` (approved 2026-10-03 with its four assumptions). Mockup: `docs/superpowers/specs/2026-10-03-dune-select-mockup/mockup.html`.

## Global Constraints

- **Andrew's bar (binding):** the UI "absolutely MUST NOT feel like ai-slop. It must feel like a AAA title video game". §5's rules are binding for every player-facing screen; the dev panel is exempt.
- **Canvas:** design size 1920×1080. Safe area: PC 3% (58 × 32 px at 1080p), TV 5% (96 × 54), a Settings slider 2–10% overriding both. Every UI element, legend, title and the map stays inside it.
- **Faces:** Knewave (titles, name lockups, the map's break name), Caveat Brush (only what a rider says, and the real names), Barlow Semi Condensed (everything else; Barlow for long sentences). All are SIL OFL 1.1, self-hosted with `OFL.txt` beside each.
- **Type sizes at 1080p:**

  | Use | Size and weight |
  |---|---|
  | Titles | 76 px |
  | Name lockup | 128 px |
  | Values | 32–36 px, 600 |
  | Labels | 21 px, 500, caps, 0.14 em tracking, 72% opacity |
  | Small numbers | 23 px, 400, tabular |
  | Legend | 26 px, 600 |
  | Rider lines | 38–46 px |

  No player-facing text below 18 px at 1080p. Text size 100–200% re-lays out (it doesn't zoom).
- **Colour:** sun orange `#ef7d2e`, teal `#1d6b74`, cream `#f7ecd2`, ink `#10171a`. Scrims are directional gradients anchored to an edge (0 → 82% ink over 48% of the width). Text contrast ≥ 4.5:1, large text ≥ 3:1, against the brightest patch behind it.
- **Never:**
  - frosted glass;
  - emoji or stock icon sets;
  - purple or neon gradients;
  - Inter, Space Grotesk or Geist;
  - everything centred;
  - paragraphs of explanation;
  - web form controls or browser focus rings;
  - spacing off the 8 px grid (rows 72–84, gutters 24, panel insets 48);
  - more than one corner radius (0–3 px);
  - keyboard glyphs while a pad is in hand;
  - text baked into images;
  - slow exits or bounce everywhere.
- **Motion:**

  | What | Duration and easing |
  |---|---|
  | Focus | 120 ms, ease-out cubic, scale 1.04 with ≤ 2% overshoot |
  | Unfocus | 90 ms |
  | Value change | 140 ms, 10 px slide, arrow nudge 4 px |
  | Panel enter | 280 ms, rows staggered 35 ms, at most 6 |
  | Panel exit | 180 ms, ease-in |
  | Camera between beats | 1.6 s, ease-in-out; the UI leaves first, the next UI starts at 70% |
  | Rider focus | 0.6 s |

  A or B during a move skips to its end, and inputs are buffered. Calm menus: 200 ms cross-fades, with no staggers, slides or nudges.
- **Input:** the §10 table. Repeat on hold: 250 ms delay, then every 80 ms. Stick threshold 0.5. The last device that sent input chooses the glyphs. Settings open on Back + START (B + START; Esc + P on the keyboard).
- **Conditions:** values written stay inside `CONDITION_RANGES`. The tide spans the real coast's −0.5 to +0.5 m. Never night. Edits apply 200 ms after the last change, with a heavy rebuild at most once per 200 ms.
- **First-ever defaults:** the "Winter offshore" preset; Shazza focused.
- **Copy:** the descriptors and lines are a first draft for the gate.
- **Assets:** CC0, project-made, or OFL fonts shipped with their licence.
  - UI sounds are synthesised.
  - Glyphs and sky icons are drawn by us as SVG.
  - The map comes from our own terrain and reef data. Never trace Google or any third-party map imagery.
- **Repo rules:**
  - Never commit `reference/`, and never commit `.claude/launch.json` in the main checkout.
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Source files use CRLF line endings.
  - Use no new npm dependencies.
- **"Be careful everything renders"** (Andrew's standing rule): every limb is visible, and nothing passes through a body or a board, in every pose and idle.
- **Entry:** a moment link (`#m=`, `#ref=`), `?selftest`, `?sheet` or `?frontend=off` skips the front end and opens the game as today.

## Rulings made in this plan (where the spec is silent)

- **The crew spread on the turn.** In Choose your rider the three stand 1.7 m apart, in roster order left to right on screen (T-Bone, Shazza, Grommet). At the spec's distance (2.35 m) and framing (the rider at 33% of the width, a 60° vertical field of view), a neighbour 1.05 m away always shows at the left edge. At 1.7 m it falls outside the frame, and the one on the right falls behind the panel. Task 8 pins this with a projection test.
- **The crew's order.** Both beats' cameras look seaward, so the order on screen is the same in each. Conditions therefore stands them T-Bone, Shazza, Grommet from behind, not the walking lineup's Shazza, Grommet, T-Bone. Turning round, the outer two only side-step 0.65 m outward, and nobody walks through the others.
- **Narrow windows.** The UI scales by min(width/1920, height/1080), so the whole design fits on a 4:3 window. The spec only describes wider windows.
- **Where the scene checks run.** Contrast and face-occlusion need the live scene behind the UI. They run as an in-game dev check (`src/dev/frontEndCheck.ts`, from the console or the dev panel), like the GPU budget harness. Layout, reachability and glyph checks are `?selftest=frontend`.
- **Authored expressions** are tuned blends of the rig's existing face channels (`FACE_CHANNELS`). The MPFB expression units feed those channels through the morph targets already built.
- **Tide doesn't wrap.** It isn't in §5.4's list of cyclic values, so it stops at its ends.

## Review Focus

The five input classes or failure modes the spec implies but no task's own tests exercise. Each has a test in its owning task.

1. **Window shapes other than 16:9** (2560×1080 ultrawide, 1024×768, 1280×720): nothing outside the safe area, nothing overlapping, nothing clipped. Tests: Task 14 (`layoutFor`) and Task 24 (the DOM self-test at those sizes).
2. **A pad disconnecting while a direction is held, and keyboard and pad alternating:** no stuck repeat, and the glyphs follow the last device. Test: Task 7.
3. **The front end opened before the land, its tracks or the riders have loaded:** it holds a still frame, never throws, then stages as soon as they're ready. Tests: Task 8 (`stagingReady`) and Task 21 (`FrontEndCore.update` with no land).
4. **A held key repeating on Swell for seconds:** the world's conditions apply at most once per 200 ms, never once per repeat. Test: Task 21 (`ConditionsGate`).
5. **Corrupt, old or out-of-range saved choices or settings** in localStorage, and a storage that throws: sanitised to the defaults, never a crash or an out-of-range value. Test: Task 5.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/frontend/sessionSetup.ts` | the conditions rows' tables, `SessionSetup` ↔ `Conditions`, display strings, presets, editing rules, Random | 1, 2 |
| `src/frontend/riderCopy.ts` | descriptors, the riders' lines, size words | 3 |
| `src/frontend/boardPick.ts` | fits, the pick, reason lines, bars, the specs line | 4 |
| `src/frontend/frontSettings.ts` | settings and remembered choices: types, defaults, sanitising, storage | 5 |
| `src/frontend/frontEnd.ts` | the state machine: beats, focus, Back, START, moves, buffered input | 6 |
| `src/frontend/uiInput.ts` | devices → actions, repeat, chords, device family; `UiInput` (DOM listeners, pad polling) | 7 |
| `src/frontend/beatCamera.ts` | crew places per beat, each beat's camera shot, easing between shots | 8 |
| `src/surfer/poses.ts`, `poseNames.ts`, `rideState.ts`, `faceControl.ts`, `surferParams.ts`, `SurferStand.ts` | the `selectStand` pose, its idles, authored expressions | 9–11 |
| `src/frontend/staging.ts`, `src/surfer/GangLineup.ts` | per-rider staging (visible, place, heading, pose, expression, board, outfit), the stepping turn | 12 |
| `public/fonts/`, `src/frontend/ui/frontEnd.css`, `src/frontend/ui/layout.ts` | fonts, the §5 tokens, the canvas scaler and safe area | 14 |
| `src/frontend/glyphs.ts`, `src/frontend/ui/legend.ts`, `src/frontend/ui/riderLine.ts` | glyph SVGs, the legend, the rider's line | 15 |
| `src/frontend/conditionsView.ts`, `src/frontend/ui/skyGlyphs.ts`, `src/frontend/ui/valueRow.ts`, `src/frontend/ui/conditionsPanel.ts` | the Conditions rows | 16 |
| `src/frontend/mapGeom.ts`, `tools/bakeBreakMap.ts`, `public/ui/breakMap.json`, `src/frontend/ui/breakMap.ts` | the map of the break | 17 |
| `src/frontend/riderView.ts`, `src/frontend/ui/slidePanel.ts` | Choose your rider's panel | 18 |
| `src/frontend/gearView.ts`, `src/frontend/ui/gearPanel.ts` | Grab your gear's panel | 19 |
| `src/frontend/uiSounds.ts`, `src/sound/AudioEngine.ts`, `src/sound/SoundSystem.ts` | UI sounds, the UI bus, haptics, the music slot | 20 |
| `src/frontend/conditionsGate.ts`, `src/frontend/frontEndCore.ts`, `src/frontend/FrontEnd.ts` | the orchestration: the gate, the DOM-free core (tested in node), the page layer | 21 |
| `src/frontend/entry.ts`, `src/main.ts`, `src/app/App.ts`, `src/dev/DevPanel.ts` | the entry, the host, Paddle out, the dev button | 22 |
| `src/frontend/settingsView.ts`, `src/frontend/ui/settingsPanel.ts` | the Settings overlay | 23 |
| `src/frontend/frontEnd.selftest.ts` | the DOM and audio self-tests (`?selftest=frontend`): created in 14, a case per component in 15–20, the whole-screen checks in 24 | 14–20, 24 |
| `src/dev/frontEndCheck.ts` | the in-game contrast and face check | 24 |

Run every vitest command from the worktree root (`C:/Dev/andrew-dev-personal-projects/ld-surfer`). The dev server for in-browser checks is the `ld-step2` launch config (port 5177).

---

### Task 1: The conditions model: tables, conversion, display and presets

**Files:**
- Create: `src/frontend/sessionSetup.ts`
- Test: `src/frontend/sessionSetup.test.ts`

**Interfaces:**
- Consumes: `Conditions` (`src/conditions/types.ts`); `sanitizeConditions`, `CONDITION_RANGES` (`src/conditions/sanitize.ts`); `WEATHER_PRESETS`, `WeatherPresetName` (`src/weather/weather.ts`); `sunForConditions` (`src/astro/sunForConditions.ts`).
- Produces:
  - `RowId = 'preset' | 'month' | 'time' | 'sky' | 'wind' | 'swell' | 'period' | 'from' | 'tide'`
  - `interface SessionSetup { month: number; timeStop: number; timeFineMin: number; sky: WeatherPresetName; wind: number; swellFt: number; periodS: number; fromDeg: number; tide: number }`
  - `MONTHS`, `TIME_STOPS`, `SKY_ROWS`, `WIND_ROWS`, `SWELL_BANDS`, `FROM_WINDOW`, `TIDE_STOPS`, `SESSION_PRESETS`, `FIRST_PRESET`
  - `sunTimes(dateISO): { sunriseH: number; sunsetH: number }`
  - `dateForMonth(month, today: Date): string`
  - `timeOfDayFor(s, dateISO): number`
  - `swellBand(ft): number`
  - `toConditions(s, base: Readonly<Conditions>, today: Date): Conditions`
  - `rowDisplay(s, row, today): { value: string; small: string }`
  - `presetOfSetup(s): string | null`
  - `presetById(id): { id; label; setup } | undefined`
  - `cloudCover(sky): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/sessionSetup.test.ts
import { describe, expect, it } from 'vitest';
import { sunForConditions } from '../astro/sunForConditions';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { CONDITION_RANGES } from '../conditions/sanitize';
import { WEATHER_PRESETS } from '../weather/weather';
import {
  FIRST_PRESET, FROM_WINDOW, SESSION_PRESETS, SKY_ROWS, SWELL_BANDS, TIDE_STOPS, TIME_STOPS, WIND_ROWS,
  type SessionSetup, dateForMonth, presetById, presetOfSetup, rowDisplay, sunTimes, swellBand, timeOfDayFor, toConditions,
} from './sessionSetup';

const TODAY = new Date('2026-10-03T10:00:00+08:00');
const winter = presetById(FIRST_PRESET)!.setup;

describe('the conditions model (dune select spec §6)', () => {
  it('starts on Winter offshore', () => {
    expect(FIRST_PRESET).toBe('winterOffshore');
    expect(presetById(FIRST_PRESET)!.label).toBe('Winter offshore');
  });
  it('puts a month on the 15th of its next occurrence', () => {
    expect(dateForMonth(9, TODAY)).toBe('2026-10-15');
    expect(dateForMonth(11, TODAY)).toBe('2026-12-15');
    expect(dateForMonth(6, TODAY)).toBe('2027-07-15');
  });
  it('finds sunrise and sunset at the Womb (AWST, no daylight saving)', () => {
    const jul = sunTimes('2027-07-15'), jan = sunTimes('2027-01-15');
    expect(jul.sunriseH).toBeGreaterThan(7.0); expect(jul.sunriseH).toBeLessThan(7.6);
    expect(jul.sunsetH).toBeGreaterThan(17.2); expect(jul.sunsetH).toBeLessThan(17.8);
    expect(jan.sunriseH).toBeGreaterThan(5.0); expect(jan.sunriseH).toBeLessThan(5.6);
    expect(jan.sunsetH).toBeGreaterThan(19.2); expect(jan.sunsetH).toBeLessThan(19.8);
  });
  it('keeps every time stop in daylight, every month', () => {
    for (let month = 0; month < 12; month++) {
      const date = dateForMonth(month, TODAY);
      for (let stop = 0; stop < TIME_STOPS.length; stop++) {
        const h = timeOfDayFor({ ...winter, month, timeStop: stop, timeFineMin: 0 }, date);
        expect(sunForConditions({ date, timeOfDay: h }).elevationDeg, `${month} ${TIME_STOPS[stop].label}`).toBeGreaterThan(0);
      }
    }
  });
  it('turns Winter offshore into the world\'s conditions', () => {
    const c = toConditions(winter, DEFAULT_CONDITIONS, TODAY);
    expect(c.date).toBe('2027-07-15');
    expect(c.timeOfDay).toBeCloseTo(10.5, 6);
    expect(c.weather).toEqual(WEATHER_PRESETS.clear);
    expect(c.wind.speedMs).toBeCloseTo(6 * 0.514444, 4);
    expect(c.wind.directionDeg).toBe(90);
    expect(c.swell).toEqual({ sizeFt: 5.5, periodS: 14, directionDeg: 225 });
    expect(c.tideM).toBe(-0.25);
    expect(c.seed).toBe(DEFAULT_CONDITIONS.seed);
  });
  it('keeps glassy\'s wind direction from the base conditions', () => {
    const c = toConditions({ ...winter, wind: 0 }, DEFAULT_CONDITIONS, TODAY);
    expect(c.wind.directionDeg).toBe(DEFAULT_CONDITIONS.wind.directionDeg);
    expect(c.wind.speedMs).toBeCloseTo(0.514444, 4);
  });
  it('writes every value of every row inside CONDITION_RANGES, the tide within ±0.5 m', () => {
    const vary: Partial<SessionSetup>[] = [
      ...Array.from({ length: 12 }, (_, month) => ({ month })),
      ...TIME_STOPS.map((_, timeStop) => ({ timeStop })),
      ...SKY_ROWS.map((r) => ({ sky: r.id })),
      ...WIND_ROWS.map((_, wind) => ({ wind })),
      ...SWELL_BANDS.map((b) => ({ swellFt: b.ft, periodS: b.periodS })),
      ...[8, 14, 20].map((periodS) => ({ periodS })),
      ...FROM_WINDOW.map((fromDeg) => ({ fromDeg })),
      ...TIDE_STOPS.map((_, tide) => ({ tide })),
    ];
    for (const v of vary) {
      const c = toConditions({ ...winter, ...v }, DEFAULT_CONDITIONS, TODAY);
      expect(c.swell.sizeFt).toBeGreaterThanOrEqual(CONDITION_RANGES.swellSizeFt.min);
      expect(c.swell.sizeFt).toBeLessThanOrEqual(CONDITION_RANGES.swellSizeFt.max);
      expect(c.swell.periodS).toBeGreaterThanOrEqual(CONDITION_RANGES.swellPeriodS.min);
      expect(c.swell.periodS).toBeLessThanOrEqual(CONDITION_RANGES.swellPeriodS.max);
      expect(c.wind.speedMs).toBeLessThanOrEqual(CONDITION_RANGES.windSpeedMs.max);
      expect(Math.abs(c.tideM)).toBeLessThanOrEqual(0.5);
      expect(c.timeOfDay).toBeGreaterThan(0);
      expect(c.timeOfDay).toBeLessThan(24);
    }
  });
  it('round-trips every row: each value it holds is the one the world gets', () => {
    for (const [tide, stop] of TIDE_STOPS.entries()) expect(toConditions({ ...winter, tide }, DEFAULT_CONDITIONS, TODAY).tideM).toBe(stop.m);
    for (const fromDeg of FROM_WINDOW) expect(toConditions({ ...winter, fromDeg }, DEFAULT_CONDITIONS, TODAY).swell.directionDeg).toBe(fromDeg);
    for (const r of SKY_ROWS) expect(toConditions({ ...winter, sky: r.id }, DEFAULT_CONDITIONS, TODAY).weather).toEqual(WEATHER_PRESETS[r.id]);
    for (const ft of [1, 1.5, 4, 7.5, 12]) expect(toConditions({ ...winter, swellFt: ft }, DEFAULT_CONDITIONS, TODAY).swell.sizeFt).toBe(ft);
  });
  it('names the swell band a size falls in', () => {
    expect(SWELL_BANDS[swellBand(1)].label).toBe('Flat-ish');
    expect(SWELL_BANDS[swellBand(2)].label).toBe('Small');
    expect(SWELL_BANDS[swellBand(3.5)].label).toBe('Fun');
    expect(SWELL_BANDS[swellBand(4.5)].label).toBe('Fun');
    expect(SWELL_BANDS[swellBand(5)].label).toBe('Solid');
    expect(SWELL_BANDS[swellBand(12)].label).toBe('Huge');
  });
  it('reads like a surf report: a word, then the number small', () => {
    expect(rowDisplay(winter, 'preset', TODAY)).toEqual({ value: 'Winter offshore', small: '' });
    expect(rowDisplay(winter, 'month', TODAY)).toEqual({ value: 'July', small: 'Winter · big swell season' });
    expect(rowDisplay({ ...winter, month: 0 }, 'month', TODAY)).toEqual({ value: 'January', small: 'Summer · sea breeze season' });
    expect(rowDisplay({ ...winter, month: 8 }, 'month', TODAY)).toEqual({ value: 'September', small: 'Winter' });
    expect(rowDisplay(winter, 'time', TODAY)).toEqual({ value: 'Mid-morning', small: '10:30 am' });
    expect(rowDisplay(winter, 'sky', TODAY)).toEqual({ value: 'Clear', small: '0% cloud' });
    expect(rowDisplay(winter, 'wind', TODAY)).toEqual({ value: 'Light offshore', small: '6 kn E' });
    expect(rowDisplay({ ...winter, wind: 0 }, 'wind', TODAY)).toEqual({ value: 'Glassy', small: '1 kn' });
    expect(rowDisplay(winter, 'swell', TODAY)).toEqual({ value: 'Solid 5–6 ft', small: '5½ ft · 14 s' });
    expect(rowDisplay(winter, 'period', TODAY)).toEqual({ value: 'Groundswell', small: '14 s' });
    expect(rowDisplay({ ...winter, periodS: 9 }, 'period', TODAY)).toEqual({ value: 'Wind swell', small: '9 s' });
    expect(rowDisplay(winter, 'from', TODAY)).toEqual({ value: 'South-west', small: 'SW 225°' });
    expect(rowDisplay(winter, 'tide', TODAY)).toEqual({ value: 'Low, pushing', small: '−0.3 m' });
    expect(rowDisplay({ ...winter, tide: 2 }, 'tide', TODAY)).toEqual({ value: 'Mid', small: '0.0 m' });
  });
  it('labels scattered cloud "Few clouds", with its cover as a percentage', () => {
    expect(rowDisplay({ ...winter, sky: 'scattered' }, 'sky', TODAY).value).toBe('Few clouds');
    expect(rowDisplay({ ...winter, sky: 'overcast' }, 'sky', TODAY).small).toMatch(/^\d+% cloud$/);
  });
  it('has the six presets of §6.8, each recognised as itself', () => {
    expect(SESSION_PRESETS.map((p) => p.label)).toEqual(['Dawn glass', 'Winter offshore', 'Big winter swell', 'Fun arvo', 'Summer sea breeze', 'Moody and grey']);
    for (const p of SESSION_PRESETS) expect(presetOfSetup(p.setup)).toBe(p.id);
    expect(presetOfSetup({ ...winter, tide: 3 })).toBeNull();
    expect(rowDisplay({ ...winter, tide: 3 }, 'preset', TODAY).value).toBe('Custom');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/sessionSetup.test.ts`
Expected: FAIL. The module `./sessionSetup` doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/sessionSetup.ts
import { sunForConditions } from '../astro/sunForConditions';
import type { Conditions } from '../conditions/types';
import { sanitizeConditions } from '../conditions/sanitize';
import { WEATHER_PRESETS, type WeatherPresetName } from '../weather/weather';

/** One row of Conditions (dune select spec §4.1, §6); 'period' shows under Swell when the details are open. */
export type RowId = 'preset' | 'month' | 'time' | 'sky' | 'wind' | 'swell' | 'period' | 'from' | 'tide';

/** The player's choice, one value per row (spec §6). Indices are into the tables below. */
export interface SessionSetup {
  /** 0 = January. */
  month: number;
  /** Index into TIME_STOPS, and minutes either side of it (LT/RT scrub in 15-minute steps). */
  timeStop: number;
  timeFineMin: number;
  sky: WeatherPresetName;
  /** Index into WIND_ROWS. */
  wind: number;
  /** Surfer feet, in ½ ft steps, 1–12. */
  swellFt: number;
  /** Seconds, 8–20. */
  periodS: number;
  /** One of FROM_WINDOW. */
  fromDeg: number;
  /** Index into TIDE_STOPS. */
  tide: number;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** The named times (spec §6.2). First light and Sunset are found from the sun; the rest are clock hours. */
export const TIME_STOPS: readonly { id: string; label: string; hours: number | 'firstLight' | 'sunset' }[] = [
  { id: 'firstLight', label: 'First light', hours: 'firstLight' },
  { id: 'morning', label: 'Morning', hours: 8 },
  { id: 'midMorning', label: 'Mid-morning', hours: 10.5 },
  { id: 'midday', label: 'Midday', hours: 12.5 },
  { id: 'arvo', label: 'Arvo', hours: 15 },
  { id: 'lateArvo', label: 'Late arvo', hours: 16.5 },
  { id: 'sunset', label: 'Sunset', hours: 'sunset' },
];

/** The game's weather presets in the row's order, labelled in sentence case (spec §6.3). */
export const SKY_ROWS: readonly { id: WeatherPresetName; label: string }[] = [
  { id: 'clear', label: 'Clear' }, { id: 'fair', label: 'Fair' }, { id: 'scattered', label: 'Few clouds' },
  { id: 'broken', label: 'Broken cloud' }, { id: 'high cloud', label: 'High cloud' }, { id: 'overcast', label: 'Overcast' },
  { id: 'grey', label: 'Grey' }, { id: 'drizzle', label: 'Drizzle' }, { id: 'showers', label: 'Showers' },
  { id: 'rain', label: 'Rain' }, { id: 'storm', label: 'Storm' }, { id: 'sea mist', label: 'Sea mist' },
];

/** The coast faces west, so offshore is easterly (spec §6.4). `fromDeg` null: glassy, the direction irrelevant. */
export const WIND_ROWS: readonly { label: string; fromDeg: number | null; compass: string; kn: number }[] = [
  { label: 'Glassy', fromDeg: null, compass: '', kn: 1 },
  { label: 'Light offshore', fromDeg: 90, compass: 'E', kn: 6 },
  { label: 'Strong offshore', fromDeg: 90, compass: 'E', kn: 18 },
  { label: 'Cross-offshore', fromDeg: 135, compass: 'SE', kn: 10 },
  { label: 'Cross-shore', fromDeg: 180, compass: 'S', kn: 12 },
  { label: 'Onshore', fromDeg: 225, compass: 'SW', kn: 15 },
  { label: 'Blown out', fromDeg: 270, compass: 'W', kn: 22 },
];

/** The swell's words (spec §6.5): a size belongs to the last band whose minimum it reaches. */
export const SWELL_BANDS: readonly { label: string; minFt: number; maxFt: number; ft: number; periodS: number }[] = [
  { label: 'Flat-ish', minFt: 1, maxFt: 2, ft: 1.5, periodS: 9 },
  { label: 'Small', minFt: 2, maxFt: 3, ft: 2.5, periodS: 11 },
  { label: 'Fun', minFt: 3, maxFt: 4, ft: 3.5, periodS: 13 },
  { label: 'Solid', minFt: 5, maxFt: 6, ft: 5.5, periodS: 14 },
  { label: 'Pumping', minFt: 6, maxFt: 8, ft: 7, periodS: 15 },
  { label: 'Big', minFt: 8, maxFt: 10, ft: 9, periodS: 16 },
  { label: 'Huge', minFt: 10, maxFt: 12, ft: 12, periodS: 17 },
];

/** The break's sane swell window (spec §6.6). */
export const FROM_WINDOW = [202, 225, 247, 270, 292] as const;
const FROM_NAMES: Record<number, { label: string; compass: string }> = {
  202: { label: 'South-south-west', compass: 'SSW' }, 225: { label: 'South-west', compass: 'SW' },
  247: { label: 'West-south-west', compass: 'WSW' }, 270: { label: 'West', compass: 'W' }, 292: { label: 'West-north-west', compass: 'WNW' },
};

/** The tide stops (spec §6.7; the real coast's ~1 m range). Rising and falling are display-only. */
export const TIDE_STOPS: readonly { label: string; m: number; trend: 'rising' | 'falling' | 'slack' }[] = [
  { label: 'Low', m: -0.5, trend: 'slack' },
  { label: 'Low, pushing', m: -0.25, trend: 'rising' },
  { label: 'Mid', m: 0, trend: 'rising' },
  { label: 'High', m: 0.5, trend: 'slack' },
  { label: 'Mid, dropping', m: 0, trend: 'falling' },
  { label: 'Low, dropping', m: -0.25, trend: 'falling' },
];

const KN_TO_MS = 0.514444;

const setup = (month: number, timeStop: number, sky: WeatherPresetName, wind: number, band: number, fromDeg: number, tide: number): SessionSetup => ({
  month, timeStop, timeFineMin: 0, sky, wind, swellFt: SWELL_BANDS[band].ft, periodS: SWELL_BANDS[band].periodS, fromDeg, tide,
});

/** The presets (spec §6.8). */
export const SESSION_PRESETS: readonly { id: string; label: string; setup: SessionSetup }[] = [
  { id: 'dawnGlass', label: 'Dawn glass', setup: setup(3, 0, 'clear', 0, 2, 225, 2) },
  { id: 'winterOffshore', label: 'Winter offshore', setup: setup(6, 2, 'clear', 1, 3, 225, 1) },
  { id: 'bigWinterSwell', label: 'Big winter swell', setup: setup(6, 3, 'scattered', 1, 5, 247, 2) },
  { id: 'funArvo', label: 'Fun arvo', setup: setup(2, 4, 'fair', 3, 2, 225, 3) },
  { id: 'summerSeaBreeze', label: 'Summer sea breeze', setup: setup(0, 5, 'fair', 5, 1, 225, 4) },
  { id: 'moodyGrey', label: 'Moody and grey', setup: setup(7, 1, 'grey', 1, 4, 270, 2) },
];

export const FIRST_PRESET = 'winterOffshore';

export const presetById = (id: string): (typeof SESSION_PRESETS)[number] | undefined => SESSION_PRESETS.find((p) => p.id === id);

const sameSetup = (a: SessionSetup, b: SessionSetup): boolean =>
  a.month === b.month && a.timeStop === b.timeStop && a.timeFineMin === b.timeFineMin && a.sky === b.sky && a.wind === b.wind &&
  a.swellFt === b.swellFt && a.periodS === b.periodS && a.fromDeg === b.fromDeg && a.tide === b.tide;

/** The preset a setup is, or null ("Custom"). */
export function presetOfSetup(s: SessionSetup): string | null {
  return SESSION_PRESETS.find((p) => sameSetup(p.setup, s))?.id ?? null;
}

/** The 15th of the month's next occurrence (this month counts), AWST. */
export function dateForMonth(month: number, today: Date): string {
  const awst = new Date(today.getTime() + 8 * 3600e3);
  const y = awst.getUTCFullYear(), m = awst.getUTCMonth();
  const year = month >= m ? y : y + 1;
  return `${year}-${String(month + 1).padStart(2, '0')}-15`;
}

/** Sunrise and sunset (AWST hours, the sun's centre on the horizon) at the Womb, by bisection on its elevation. */
export function sunTimes(dateISO: string): { sunriseH: number; sunsetH: number } {
  const el = (h: number): number => sunForConditions({ date: dateISO, timeOfDay: h }).elevationDeg;
  const cross = (lo: number, hi: number): number => {
    const rising = el(hi) > el(lo);
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if ((el(mid) > 0) === rising) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  return { sunriseH: cross(3, 12), sunsetH: cross(12, 22) };
}

/** The setup's time of day (AWST hours) on its date: the stop plus the fine offset, kept between First light and Sunset. */
export function timeOfDayFor(s: SessionSetup, dateISO: string): number {
  const { sunriseH, sunsetH } = sunTimes(dateISO);
  const first = sunriseH + 0.25, last = sunsetH - 1 / 3;
  const stop = TIME_STOPS[s.timeStop].hours;
  const base = stop === 'firstLight' ? first : stop === 'sunset' ? last : stop;
  return Math.min(last, Math.max(first, base + s.timeFineMin / 60));
}

export function swellBand(ft: number): number {
  let i = 0;
  for (let k = 0; k < SWELL_BANDS.length; k++) if (ft >= SWELL_BANDS[k].minFt) i = k;
  return i;
}

/** The world's conditions for a setup, everything else (the seed) from `base`. Always inside CONDITION_RANGES. */
export function toConditions(s: SessionSetup, base: Readonly<Conditions>, today: Date): Conditions {
  const date = dateForMonth(s.month, today), wind = WIND_ROWS[s.wind];
  return sanitizeConditions({
    date,
    timeOfDay: timeOfDayFor(s, date),
    swell: { sizeFt: s.swellFt, periodS: s.periodS, directionDeg: s.fromDeg },
    wind: { speedMs: wind.kn * KN_TO_MS, directionDeg: wind.fromDeg ?? base.wind.directionDeg },
    tideM: TIDE_STOPS[s.tide].m,
    seed: base.seed,
    weather: { ...WEATHER_PRESETS[s.sky] },
  });
}

/** The sky's cloud cover, 0–1: the layers' covers combined. */
export function cloudCover(sky: WeatherPresetName): number {
  const w = WEATHER_PRESETS[sky];
  return 1 - (1 - w.lowCover) * (1 - w.midCover) * (1 - w.highCover);
}

const SEASONS = ['Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Winter', 'Winter', 'Winter', 'Winter', 'Spring', 'Spring', 'Summer'];
const HINTS: Record<number, string> = { 5: 'big swell season', 6: 'big swell season', 7: 'big swell season', 11: 'sea breeze season', 0: 'sea breeze season', 1: 'sea breeze season' };

/** "5½", "4": feet in halves. */
const feet = (ft: number): string => (Number.isInteger(ft) ? `${ft}` : `${Math.floor(ft)}½`);
const clock = (h: number): string => {
  const mins = Math.round(h * 60), hh = Math.floor(mins / 60) % 24, mm = mins % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};
const metres = (m: number): string => `${m < 0 ? '−' : ''}${Math.abs(m).toFixed(1)} m`;

/** A row's word and its small number (spec §6). */
export function rowDisplay(s: SessionSetup, row: RowId, today: Date): { value: string; small: string } {
  switch (row) {
    case 'preset': {
      const id = presetOfSetup(s);
      return { value: id ? presetById(id)!.label : 'Custom', small: '' };
    }
    case 'month': {
      const hint = HINTS[s.month];
      return { value: MONTHS[s.month], small: hint ? `${SEASONS[s.month]} · ${hint}` : SEASONS[s.month] };
    }
    case 'time': {
      const date = dateForMonth(s.month, today);
      return { value: TIME_STOPS[s.timeStop].label, small: clock(timeOfDayFor(s, date)) };
    }
    case 'sky':
      return { value: SKY_ROWS.find((r) => r.id === s.sky)!.label, small: `${Math.round(cloudCover(s.sky) * 100)}% cloud` };
    case 'wind': {
      const w = WIND_ROWS[s.wind];
      return { value: w.label, small: w.compass ? `${w.kn} kn ${w.compass}` : `${w.kn} kn` };
    }
    case 'swell': {
      const b = SWELL_BANDS[swellBand(s.swellFt)];
      return { value: `${b.label} ${b.minFt}–${b.maxFt} ft`, small: `${feet(s.swellFt)} ft · ${s.periodS} s` };
    }
    case 'period':
      return { value: s.periodS < 10 ? 'Wind swell' : s.periodS < 14 ? 'Mid' : 'Groundswell', small: `${s.periodS} s` };
    case 'from': {
      const f = FROM_NAMES[s.fromDeg];
      return { value: f.label, small: `${f.compass} ${s.fromDeg}°` };
    }
    case 'tide': {
      const t = TIDE_STOPS[s.tide];
      return { value: t.label, small: metres(t.m) };
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/frontend/sessionSetup.test.ts`
Expected: PASS (13 tests). If the sun-time ranges miss by a few minutes, check `sunForConditions` against a published Margaret River almanac (July sunrise about 7:17 am, sunset about 5:33 pm). Fix the test's bounds only if the almanac agrees with the code.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/sessionSetup.ts src/frontend/sessionSetup.test.ts
git commit -m "feat(frontend): the conditions model: tables, conversion to the world's conditions, surf-report display, presets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Editing the rows, and Roll the dice

**Files:**
- Modify: `src/frontend/sessionSetup.ts` (append)
- Test: `src/frontend/sessionRoll.test.ts`

**Interfaces:**
- Consumes: Task 1's tables, `sunTimes`, `dateForMonth`, `timeOfDayFor`, `swellBand`, `presetById`.
- Produces:
  - `type Dir = -1 | 1`
  - `interface EditResult { setup: SessionSetup; changed: boolean; atEnd: boolean }`
  - `stepRow(s, row: Exclude<RowId, 'preset'>, dir, today): EditResult`
  - `fineRow(s, row, dir, today): EditResult`
  - `stepPreset(currentId: string | null, dir): string`
  - `rollSetup(seed: number): SessionSetup`
  - `excludedBy(s): string | null`
  - `ROLL_SKIES`, `ROLL_WINDS`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/sessionRoll.test.ts
import { describe, expect, it } from 'vitest';
import {
  FIRST_PRESET, FROM_WINDOW, ROLL_SKIES, ROLL_WINDS, SESSION_PRESETS, SWELL_BANDS, TIDE_STOPS, TIME_STOPS,
  dateForMonth, excludedBy, fineRow, presetById, rollSetup, stepPreset, stepRow, sunTimes, swellBand, timeOfDayFor,
} from './sessionSetup';

const TODAY = new Date('2026-10-03T10:00:00+08:00');
const winter = presetById(FIRST_PRESET)!.setup;

describe('editing the rows (dune select spec §5.4, §6)', () => {
  it('wraps the month', () => {
    expect(stepRow({ ...winter, month: 11 }, 'month', 1, TODAY).setup.month).toBe(0);
    expect(stepRow({ ...winter, month: 0 }, 'month', -1, TODAY).setup.month).toBe(11);
  });
  it('wraps the time stops, clearing the fine offset', () => {
    const r = stepRow({ ...winter, timeStop: TIME_STOPS.length - 1, timeFineMin: 30 }, 'time', 1, TODAY);
    expect(r.setup.timeStop).toBe(0);
    expect(r.setup.timeFineMin).toBe(0);
  });
  it('wraps the swell direction within its window', () => {
    expect(stepRow({ ...winter, fromDeg: 292 }, 'from', 1, TODAY).setup.fromDeg).toBe(202);
    expect(stepRow({ ...winter, fromDeg: 202 }, 'from', -1, TODAY).setup.fromDeg).toBe(292);
  });
  it('stops the sky, wind, swell, period and tide at their ends with a nudge', () => {
    expect(stepRow({ ...winter, wind: 0 }, 'wind', -1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, tide: TIDE_STOPS.length - 1 }, 'tide', 1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, sky: 'clear' }, 'sky', -1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, periodS: 20 }, 'period', 1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, swellFt: 12, periodS: 17 }, 'swell', 1, TODAY)).toMatchObject({ changed: false, atEnd: true });
  });
  it('steps the swell a band at a time, taking the band\'s size and period', () => {
    const r = stepRow(winter, 'swell', 1, TODAY).setup;
    expect(SWELL_BANDS[swellBand(r.swellFt)].label).toBe('Pumping');
    expect(r.swellFt).toBe(7);
    expect(r.periodS).toBe(15);
  });
  it('fine-tunes the swell in half feet, the word following the size, the period kept', () => {
    const r = fineRow({ ...winter, swellFt: 4.5, periodS: 15 }, 'swell', 1, TODAY).setup;
    expect(r.swellFt).toBe(5);
    expect(SWELL_BANDS[swellBand(r.swellFt)].label).toBe('Solid');
    expect(r.periodS).toBe(15);
    expect(fineRow({ ...winter, swellFt: 1 }, 'swell', -1, TODAY)).toMatchObject({ changed: false, atEnd: true });
  });
  it('fine-scrubs the time in 15 minutes, re-naming it by the nearest stop, never into the dark', () => {
    let s = { ...winter, timeStop: 2, timeFineMin: 0 };
    for (let k = 0; k < 6; k++) s = fineRow(s, 'time', 1, TODAY).setup;
    const date = dateForMonth(s.month, TODAY);
    expect(timeOfDayFor(s, date)).toBeCloseTo(12, 6);
    expect(TIME_STOPS[s.timeStop].label).toBe('Midday');
    let late = { ...winter, timeStop: TIME_STOPS.length - 1, timeFineMin: 0 };
    const r = fineRow(late, 'time', 1, TODAY);
    expect(r.atEnd).toBe(true);
    late = r.setup;
    expect(timeOfDayFor(late, date)).toBeLessThanOrEqual(sunTimes(date).sunsetH - 1 / 3 + 1e-9);
  });
  it('has no fine scale on the other rows', () => {
    expect(fineRow(winter, 'month', 1, TODAY).changed).toBe(false);
  });
  it('cycles the presets', () => {
    const ids = SESSION_PRESETS.map((p) => p.id);
    expect(stepPreset(ids[ids.length - 1], 1)).toBe(ids[0]);
    expect(stepPreset(null, 1)).toBe(ids[0]);
    expect(stepPreset(null, -1)).toBe(ids[ids.length - 1]);
  });
});

describe('Roll the dice (spec §6.9)', () => {
  it('is a pure function of the seed', () => {
    expect(rollSetup(1234)).toEqual(rollSetup(1234));
    expect(rollSetup(1234)).not.toEqual(rollSetup(1235));
  });
  it('over 10 000 seeds never rolls an excluded combination, and rolls every allowed value', () => {
    const seen = { month: new Set<number>(), time: new Set<number>(), sky: new Set<string>(), wind: new Set<number>(), band: new Set<number>(), from: new Set<number>(), tide: new Set<number>() };
    for (let seed = 1; seed <= 10000; seed++) {
      const s = rollSetup(seed);
      expect(excludedBy(s), `seed ${seed}`).toBeNull();
      seen.month.add(s.month); seen.time.add(s.timeStop); seen.sky.add(s.sky); seen.wind.add(s.wind);
      seen.band.add(swellBand(s.swellFt)); seen.from.add(s.fromDeg); seen.tide.add(s.tide);
    }
    expect(seen.month.size).toBe(12);
    expect(seen.time.size).toBe(TIME_STOPS.length);
    expect([...seen.sky].sort()).toEqual([...ROLL_SKIES].sort());
    expect([...seen.wind].sort()).toEqual([...ROLL_WINDS].sort());
    expect(seen.band.size).toBe(SWELL_BANDS.length);
    expect(seen.from.size).toBe(FROM_WINDOW.length);
    expect(seen.tide.size).toBe(TIDE_STOPS.length);
  });
  it('names each exclusion', () => {
    expect(excludedBy({ ...winter, sky: 'storm' })).toBe('storm, rain or sea mist');
    expect(excludedBy({ ...winter, wind: 6 })).toBe('blown out');
    expect(excludedBy({ ...winter, swellFt: 12, tide: 0 })).toBe('huge at low tide');
    expect(excludedBy({ ...winter, swellFt: 1.5, wind: 5 })).toBe('flat-ish and onshore');
    expect(excludedBy(winter)).toBeNull();
  });
  it('rolls big winters and small summers', () => {
    let winterBig = 0, winterN = 0, summerSmall = 0, summerN = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const s = rollSetup(seed);
      if (s.month >= 5 && s.month <= 8) { winterN++; if (s.swellFt >= 5) winterBig++; }
      if (s.month === 11 || s.month <= 2) { summerN++; if (s.swellFt <= 4) summerSmall++; }
    }
    expect(winterBig / winterN).toBeGreaterThan(0.9);
    expect(summerSmall / summerN).toBeGreaterThan(0.9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/sessionRoll.test.ts`
Expected: FAIL. `stepRow` and the other new exports aren't exported yet.

- [ ] **Step 3: Write the implementation** (append to `src/frontend/sessionSetup.ts`)

```ts
export type Dir = -1 | 1;

/** An edit's outcome: the new setup, whether it changed, and whether the press hit a non-cyclic end (the nudge). */
export interface EditResult {
  setup: SessionSetup;
  changed: boolean;
  atEnd: boolean;
}

const wrap = (i: number, n: number): number => ((i % n) + n) % n;
const same = (setup: SessionSetup): EditResult => ({ setup, changed: false, atEnd: false });
const end = (setup: SessionSetup): EditResult => ({ setup, changed: false, atEnd: true });
const to = (setup: SessionSetup): EditResult => ({ setup, changed: true, atEnd: false });
/** A non-cyclic step through `n` values. */
const clampStep = (s: SessionSetup, i: number, n: number, dir: Dir, put: (j: number) => SessionSetup): EditResult => {
  const j = i + dir;
  return j < 0 || j >= n ? end(s) : to(put(j));
};

/** Left/right on a row (spec §5.4: month, time stops and the swell direction wrap; the rest stop at their ends). */
export function stepRow(s: SessionSetup, row: Exclude<RowId, 'preset'>, dir: Dir, _today: Date): EditResult {
  switch (row) {
    case 'month':
      return to({ ...s, month: wrap(s.month + dir, 12) });
    case 'time':
      return to({ ...s, timeStop: wrap(s.timeStop + dir, TIME_STOPS.length), timeFineMin: 0 });
    case 'sky': {
      const i = SKY_ROWS.findIndex((r) => r.id === s.sky);
      return clampStep(s, i, SKY_ROWS.length, dir, (j) => ({ ...s, sky: SKY_ROWS[j].id }));
    }
    case 'wind':
      return clampStep(s, s.wind, WIND_ROWS.length, dir, (j) => ({ ...s, wind: j }));
    case 'swell':
      return clampStep(s, swellBand(s.swellFt), SWELL_BANDS.length, dir, (j) => ({ ...s, swellFt: SWELL_BANDS[j].ft, periodS: SWELL_BANDS[j].periodS }));
    case 'period':
      return clampStep(s, s.periodS - 8, 13, dir, (j) => ({ ...s, periodS: 8 + j }));
    case 'from': {
      const i = FROM_WINDOW.indexOf(s.fromDeg as (typeof FROM_WINDOW)[number]);
      return to({ ...s, fromDeg: FROM_WINDOW[wrap(i + dir, FROM_WINDOW.length)] });
    }
    case 'tide':
      return clampStep(s, s.tide, TIDE_STOPS.length, dir, (j) => ({ ...s, tide: j }));
  }
}

/** LT/RT where a row has a finer scale (spec §4.1): time in 15-minute steps, swell in ½ ft steps. */
export function fineRow(s: SessionSetup, row: Exclude<RowId, 'preset'>, dir: Dir, today: Date): EditResult {
  if (row === 'swell') {
    const ft = s.swellFt + dir * 0.5;
    return ft < 1 || ft > 12 ? end(s) : to({ ...s, swellFt: ft });
  }
  if (row !== 'time') return same(s);
  const date = dateForMonth(s.month, today), { sunriseH, sunsetH } = sunTimes(date);
  const first = sunriseH + 0.25, last = sunsetH - 1 / 3, now = timeOfDayFor(s, date);
  const want = now + (dir * 15) / 60;
  if (want < first - 1e-9 || want > last + 1e-9) return end(s);
  // Re-anchor on the nearest stop, so the word follows the clock.
  const stopH = (i: number): number => timeOfDayFor({ ...s, timeStop: i, timeFineMin: 0 }, date);
  let best = 0;
  for (let i = 1; i < TIME_STOPS.length; i++) if (Math.abs(stopH(i) - want) < Math.abs(stopH(best) - want)) best = i;
  return to({ ...s, timeStop: best, timeFineMin: Math.round((want - stopH(best)) * 60) });
}

/** The next preset (cycling); from Custom, the first or the last. */
export function stepPreset(currentId: string | null, dir: Dir): string {
  const ids = SESSION_PRESETS.map((p) => p.id), i = currentId ? ids.indexOf(currentId) : -1;
  if (i < 0) return dir > 0 ? ids[0] : ids[ids.length - 1];
  return ids[wrap(i + dir, ids.length)];
}

/** The skies and winds Random may roll (spec §6.9: never storm, rain or sea mist; never blown out). */
export const ROLL_SKIES: readonly WeatherPresetName[] = ['clear', 'fair', 'scattered', 'broken', 'high cloud', 'overcast', 'grey', 'drizzle', 'showers'];
export const ROLL_WINDS: readonly number[] = [0, 1, 2, 3, 4, 5];

/** Why a setup can't be rolled, or null. */
export function excludedBy(s: SessionSetup): string | null {
  if (s.sky === 'storm' || s.sky === 'rain' || s.sky === 'sea mist') return 'storm, rain or sea mist';
  if (s.wind === 6) return 'blown out';
  if (swellBand(s.swellFt) === 6 && TIDE_STOPS[s.tide].label.startsWith('Low')) return 'huge at low tide';
  if (swellBand(s.swellFt) === 0 && s.wind === 5) return 'flat-ish and onshore';
  return null;
}

/** mulberry32: a small seeded generator, so a roll can be shared by its seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const weighted = (r: () => number, weights: readonly number[]): number => {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
  return weights.length - 1;
};

/** Roll the dice (spec §6.9): the month uniformly, then month-weighted climatology, never an excluded combination. */
export function rollSetup(seed: number): SessionSetup {
  const r = rng(seed), month = Math.floor(r() * 12);
  const season = month >= 5 && month <= 8 ? 'winter' : month === 11 || month <= 2 ? 'summer' : 'shoulder';
  // Swell bands: Flat-ish, Small, Fun, Solid, Pumping, Big, Huge.
  const band = weighted(r, season === 'winter' ? [0, 0, 0, 0.35, 0.3, 0.25, 0.1] : season === 'summer' ? [0.12, 0.48, 0.4, 0, 0, 0, 0] : [0, 0.2, 0.35, 0.3, 0.15, 0, 0]);
  // Time stops: First light, Morning, Mid-morning, Midday, Arvo, Late arvo, Sunset.
  const timeStop = weighted(r, season === 'winter' ? [0.2, 0.3, 0.25, 0.1, 0.08, 0.05, 0.02] : season === 'summer' ? [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.1] : [1, 1, 1, 1, 1, 1, 1]);
  const arvo = timeStop >= 4;
  // Winds: Glassy, Light offshore, Strong offshore, Cross-offshore, Cross-shore, Onshore (never Blown out).
  let wind = weighted(r,
    season === 'winter' ? [0.15, 0.4, 0.15, 0.15, 0.1, 0.05]
      : season === 'summer' ? (arvo ? [0, 0.1, 0, 0.2, 0.3, 0.4] : [0.3, 0.35, 0, 0.2, 0.1, 0.05])
        : [0.2, 0.3, 0.1, 0.2, 0.1, 0.1]);
  const sky = ROLL_SKIES[weighted(r, season === 'winter' ? [2, 2, 2, 1.5, 1, 1, 1, 0.6, 0.6] : [3, 3, 2, 1, 1, 0.6, 0.4, 0.3, 0.3])];
  const fromDeg = FROM_WINDOW[weighted(r, season === 'winter' ? [1, 2, 2, 1.5, 0.8] : [1.5, 2, 1, 0.8, 0.5])];
  let tide = Math.floor(r() * TIDE_STOPS.length);
  if (band === 6 && TIDE_STOPS[tide].label.startsWith('Low')) tide = 2; // huge breaks outside over the flat at low tide
  if (band === 0 && wind === 5) wind = 1;
  return { month, timeStop, timeFineMin: 0, sky, wind, swellFt: SWELL_BANDS[band].ft, periodS: SWELL_BANDS[band].periodS, fromDeg, tide };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend/sessionRoll.test.ts src/frontend/sessionSetup.test.ts`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/sessionSetup.ts src/frontend/sessionRoll.test.ts
git commit -m "feat(frontend): editing the conditions rows (wrap, ends, fine steps) and a seeded Roll the dice that never rolls silly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The riders' copy

**Files:**
- Create: `src/frontend/riderCopy.ts`
- Test: `src/frontend/riderCopy.test.ts`

**Interfaces:**
- Consumes: `PRESETS`, `PresetName`, `boardsFor` (`src/surfer/presets.ts`); `BoardKind`; Task 1's `SessionSetup`, `RowId`, `swellBand`.
- Produces:
  - `type SizeBand = 'small' | 'fun' | 'solid' | 'big'`
  - `type Situation = 'glassy' | 'offshore' | 'onshore' | 'small' | 'solid' | 'big' | 'wet' | 'golden' | 'default'`
  - `interface RiderCopy { style: string; loves: string; pickLine: string; boardLines: Record<SizeBand, string[]>; situationLines: Record<Situation, string[]>; teaseLines: string[] }`
  - `RIDER_COPY`, `RIDER_ORDER`, `BOARD_WORDS`
  - `stanceLabel(name): string`, `ridesLabel(name): string`, `crewNote(name): string`
  - `sizeBandOf(ft): SizeBand`, `sizeWords(ft): string`
  - `fillLine(t, vars): string`, `chooseLine(list, seed): string`
  - `situationOf(s, row): Situation`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/riderCopy.test.ts
import { describe, expect, it } from 'vitest';
import { FIRST_PRESET, presetById } from './sessionSetup';
import {
  RIDER_COPY, RIDER_ORDER, chooseLine, crewNote, fillLine, ridesLabel, sizeBandOf, sizeWords, situationOf, stanceLabel,
  type SizeBand, type Situation,
} from './riderCopy';

const BANDS: SizeBand[] = ['small', 'fun', 'solid', 'big'];
const SITUATIONS: Situation[] = ['glassy', 'offshore', 'onshore', 'small', 'solid', 'big', 'wet', 'golden', 'default'];

describe('the riders\' copy (dune select spec §4.2.1, §8)', () => {
  it('lists the roster T-Bone, Shazza, Grommet', () => expect(RIDER_ORDER).toEqual(['male', 'female', 'grommet']));
  it('takes the stance and the boards from the presets', () => {
    expect(stanceLabel('female')).toBe('Regular');
    expect(stanceLabel('male')).toBe('Goofy');
    expect(ridesLabel('female')).toBe('Shortboard, step-up, bodyboard');
    expect(ridesLabel('grommet')).toBe('Bodyboard');
  });
  it('has every field for every rider, three or more lines a band naming the board, two or more a situation', () => {
    for (const name of RIDER_ORDER) {
      const c = RIDER_COPY[name];
      for (const f of [c.style, c.loves, c.pickLine]) expect(f.length).toBeGreaterThan(3);
      for (const band of BANDS) {
        expect(c.boardLines[band].length, `${name} ${band}`).toBeGreaterThanOrEqual(3);
        for (const l of c.boardLines[band]) expect(l, `${name} ${band}: ${l}`).toMatch(/\{board\}|\{Board\}/);
      }
      for (const sit of SITUATIONS) expect(c.situationLines[sit].length, `${name} ${sit}`).toBeGreaterThanOrEqual(2);
      expect(c.teaseLines.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('says sizes the way a surfer does', () => {
    expect(sizeWords(4)).toBe('four foot');
    expect(sizeWords(3.5)).toBe('three and a half foot');
    expect(sizeWords(12)).toBe('twelve foot');
    expect(sizeWords(1)).toBe('one foot');
  });
  it('bands sizes for the lines', () => {
    expect(sizeBandOf(2.5)).toBe('small');
    expect(sizeBandOf(4)).toBe('fun');
    expect(sizeBandOf(5.5)).toBe('solid');
    expect(sizeBandOf(9)).toBe('big');
  });
  it('fills a line, capitalising {Board} and {Size}', () => {
    expect(fillLine('Clean {size}. {Board}, easy.', { size: 'four foot', board: 'thruster' })).toBe('Clean four foot. Thruster, easy.');
    expect(fillLine('{Size} and hollow.', { size: 'six foot' })).toBe('Six foot and hollow.');
    expect(fillLine('Bit brave, {name}.', { name: 'Shaz' })).toBe('Bit brave, Shaz.');
  });
  it('chooses a line by seed, the same every time', () => {
    const list = ['a', 'b', 'c'];
    expect(chooseLine(list, 7)).toBe(chooseLine(list, 7));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => chooseLine(list, s))).size).toBeGreaterThan(1);
  });
  it('finds the situation a change makes', () => {
    const w = presetById(FIRST_PRESET)!.setup;
    expect(situationOf(w, 'wind')).toBe('offshore');
    expect(situationOf({ ...w, wind: 0 }, 'wind')).toBe('glassy');
    expect(situationOf({ ...w, wind: 5 }, 'wind')).toBe('onshore');
    expect(situationOf({ ...w, swellFt: 2.5 }, 'swell')).toBe('small');
    expect(situationOf({ ...w, swellFt: 9 }, 'swell')).toBe('big');
    expect(situationOf({ ...w, sky: 'showers' }, 'sky')).toBe('wet');
    expect(situationOf({ ...w, timeStop: 0 }, 'time')).toBe('golden');
    expect(situationOf(w, 'month')).toBe('default');
  });
  it('notes the crew paddles out together', () => {
    expect(crewNote('female')).toBe('The crew always paddles out together: T-Bone and Grommet surf beside you.');
    expect(crewNote('grommet')).toBe('The crew always paddles out together: T-Bone and Shazza surf beside you.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/riderCopy.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/riderCopy.ts
import type { BoardKind } from '../board/boardSpec';
import { PRESETS, type PresetName, boardsFor } from '../surfer/presets';
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

export const stanceLabel = (name: PresetName): string => (PRESETS[name].defaultStance === 'regular' ? 'Regular' : 'Goofy');

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
  return list[(h ^ (h >>> 16)) % list.length];
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/frontend/riderCopy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/riderCopy.ts src/frontend/riderCopy.test.ts
git commit -m "feat(frontend): the riders' copy: descriptors, pick lines, board reasons by band, lines for the conditions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The board pick

**Files:**
- Create: `src/frontend/boardPick.ts`
- Test: `src/frontend/boardPick.test.ts`

**Interfaces:**
- Consumes: `PRESETS`, `boardsFor`, `boardFor`, `PresetName` (`presets.ts`); `BoardKind`, `BoardDims` (`boardSpec.ts`); `buildBoard`, `meshVolume` (`src/board/boardGeometry.ts`); Task 3's `RIDER_COPY`, `BOARD_WORDS`, `sizeBandOf`, `sizeWords`, `fillLine`, `chooseLine`.
- Produces:
  - `type Fit = 'IDEAL' | 'GOOD' | 'OK'`
  - `fitOf(kind, sizeFt, periodS): Fit`
  - `pickBoard(name, sizeFt, periodS): BoardKind`
  - `reasonLine(name, kind, sizeFt, seed): string`
  - `interface Bars { paddle: number; hold: number; turn: number }`
  - `boardBars(name, kind): Bars`
  - `specsLine(name, kind): string`
  - `lengthLabel(inches): string`, `inchFraction(v): string`
  - `BOARD_NAMES: Record<BoardKind, string>`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/boardPick.test.ts
import { describe, expect, it } from 'vitest';
import { PRESETS, type PresetName, boardsFor } from '../surfer/presets';
import { type Fit, boardBars, fitOf, inchFraction, lengthLabel, pickBoard, reasonLine, specsLine } from './boardPick';

const RANK: Record<Fit, number> = { IDEAL: 0, GOOD: 1, OK: 2 };
const NAMES: PresetName[] = ['female', 'male', 'grommet'];

describe('the board pick (dune select spec §8)', () => {
  it('fits boards at the band edges', () => {
    expect(fitOf('thruster', 2, 12)).toBe('IDEAL');
    expect(fitOf('thruster', 6, 12)).toBe('IDEAL');
    expect(fitOf('thruster', 6.5, 12)).toBe('GOOD');
    expect(fitOf('thruster', 1.5, 12)).toBe('GOOD');
    expect(fitOf('thruster', 1, 12)).toBe('OK');
    expect(fitOf('thruster', 9, 12)).toBe('OK');
    expect(fitOf('stepUp', 6, 12)).toBe('IDEAL');
    expect(fitOf('stepUp', 5, 12)).toBe('GOOD');
    expect(fitOf('stepUp', 4, 12)).toBe('OK');
    expect(fitOf('bodyboard', 1.5, 9)).toBe('IDEAL');
    expect(fitOf('bodyboard', 7, 14)).toBe('IDEAL');
    expect(fitOf('bodyboard', 7, 12)).toBe('GOOD');
    expect(fitOf('bodyboard', 9, 16)).toBe('GOOD');
  });
  it('always gives Grommet his bodyboard', () => {
    for (let ft = 1; ft <= 12; ft += 0.5) expect(pickBoard('grommet', ft, 14)).toBe('bodyboard');
  });
  it('picks one board a rider owns and fits best, for every condition', () => {
    for (const name of NAMES) for (let ft = 1; ft <= 12; ft += 0.5) for (let p = 8; p <= 20; p++) {
      const pick = pickBoard(name, ft, p), quiver = boardsFor(PRESETS[name]);
      expect(quiver).toContain(pick);
      for (const k of quiver) expect(RANK[fitOf(pick, ft, p)]).toBeLessThanOrEqual(RANK[fitOf(k, ft, p)]);
    }
  });
  it('breaks ties by taste: the thruster before the bodyboard', () => {
    expect(pickBoard('female', 4, 15)).toBe('thruster');
    expect(pickBoard('male', 4, 15)).toBe('thruster');
    expect(pickBoard('female', 7, 15)).toBe('stepUp');
  });
  it('says why, naming the board and the size', () => {
    const line = reasonLine('female', 'thruster', 4, 3);
    expect(line).toMatch(/thruster/i);
    expect(reasonLine('female', 'thruster', 4, 3)).toBe(line);
  });
  it('rates Paddle, Hold and Turn from 1 to 5', () => {
    for (const name of NAMES) for (const kind of boardsFor(PRESETS[name])) {
      const b = boardBars(name, kind);
      for (const v of [b.paddle, b.hold, b.turn]) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(5); }
    }
    for (const name of ['female', 'male'] as const) {
      expect(boardBars(name, 'thruster').turn).toBeGreaterThan(boardBars(name, 'stepUp').turn);
      expect(boardBars(name, 'stepUp').paddle).toBeGreaterThanOrEqual(boardBars(name, 'thruster').paddle);
      expect(boardBars(name, 'stepUp').hold).toBeGreaterThan(boardBars(name, 'thruster').hold);
    }
    expect(boardBars('grommet', 'bodyboard').turn).toBe(5);
  });
  it('formats lengths and fractions of an inch', () => {
    expect(lengthLabel(70)).toBe('5\'10"');
    expect(lengthLabel(76)).toBe('6\'4"');
    expect(inchFraction(18.75)).toBe('18¾');
    expect(inchFraction(2.3125)).toBe('2 5⁄16');
    expect(inchFraction(19)).toBe('19');
    expect(inchFraction(2.625)).toBe('2⅝');
    expect(inchFraction(2.5)).toBe('2½');
  });
  it('writes the specs line', () => {
    expect(specsLine('female', 'thruster')).toBe('5\'10" × 18¾" × 2 5⁄16" · squash tail · thruster');
    expect(specsLine('female', 'stepUp')).toBe('6\'4" × 19" × 2½" · round pin tail · thruster');
    expect(specsLine('grommet', 'bodyboard')).toBe('38" × 20" × 2½" · crescent tail');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/boardPick.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/boardPick.ts
import { buildBoard, meshVolume } from '../board/boardGeometry';
import type { BoardKind } from '../board/boardSpec';
import { PRESETS, type PresetName, boardFor, boardsFor } from '../surfer/presets';
import { BOARD_WORDS, RIDER_COPY, chooseLine, fillLine, sizeBandOf, sizeWords } from './riderCopy';

export type Fit = 'IDEAL' | 'GOOD' | 'OK';
export const BOARD_NAMES: Record<BoardKind, string> = { thruster: 'Thruster', stepUp: 'Step-up', bodyboard: 'Bodyboard' };
const RANK: Record<Fit, number> = { IDEAL: 0, GOOD: 1, OK: 2 };

/** A board's fit for the conditions (spec §8's table). */
export function fitOf(kind: BoardKind, sizeFt: number, periodS: number): Fit {
  if (kind === 'thruster') return sizeFt >= 2 && sizeFt <= 6 ? 'IDEAL' : (sizeFt > 6 && sizeFt <= 8) || (sizeFt >= 1.5 && sizeFt < 2) ? 'GOOD' : 'OK';
  if (kind === 'stepUp') return sizeFt >= 6 && sizeFt <= 12 ? 'IDEAL' : sizeFt >= 5 && sizeFt < 6 ? 'GOOD' : 'OK';
  return (sizeFt >= 1.5 && sizeFt <= 6) || (periodS >= 14 && sizeFt <= 8) ? 'IDEAL' : 'GOOD';
}

/** Each rider's taste, breaking ties (spec §8: Shazza and T-Bone take the thruster before the bodyboard). */
const TASTE: Record<PresetName, BoardKind[]> = {
  female: ['thruster', 'stepUp', 'bodyboard'],
  male: ['stepUp', 'thruster', 'bodyboard'],
  grommet: ['bodyboard'],
};

/** The rider's pick: the best fit in their quiver, ties to their taste. */
export function pickBoard(name: PresetName, sizeFt: number, periodS: number): BoardKind {
  const quiver = boardsFor(PRESETS[name]);
  return TASTE[name].filter((k) => quiver.includes(k)).reduce((best, k) => (RANK[fitOf(k, sizeFt, periodS)] < RANK[fitOf(best, sizeFt, periodS)] ? k : best));
}

export function reasonLine(name: PresetName, kind: BoardKind, sizeFt: number, seed: number): string {
  return fillLine(chooseLine(RIDER_COPY[name].boardLines[sizeBandOf(sizeFt)], seed), { size: sizeWords(sizeFt), board: BOARD_WORDS[kind] });
}

export interface Bars {
  paddle: number;
  hold: number;
  turn: number;
}

/** How much a tail holds a line, by shape (a pin tail holds better than a squash). */
const TAIL_HOLD = { squash: 1, roundPin: 1.15, crescent: 1 } as const;

const volumes = new Map<string, number>();
function volumeL(name: PresetName, kind: BoardKind): number {
  const key = `${name}:${kind}`;
  let v = volumes.get(key);
  if (v === undefined) {
    const m = buildBoard(boardFor(PRESETS[name], kind));
    v = meshVolume(m.positions, m.indices) * 1000;
    volumes.set(key, v);
  }
  return v;
}

/** 1–5 over a range padded by 30% each side (so the smallest board isn't scored nothing). */
function score(v: number, lo: number, hi: number): number {
  const pad = (hi - lo) * 0.3 || 1, a = lo - pad, b = hi + pad;
  return Math.min(5, Math.max(1, Math.round(1 + (4 * (v - a)) / (b - a))));
}

const surfboards = (): [PresetName, BoardKind][] =>
  (['female', 'male', 'grommet'] as const).flatMap((n) => boardsFor(PRESETS[n]).filter((k) => k !== 'bodyboard').map((k) => [n, k] as [PresetName, BoardKind]));
const bodyboards = (): PresetName[] => (['female', 'male', 'grommet'] as const).filter((n) => boardsFor(PRESETS[n]).includes('bodyboard'));

/** Paddle, Hold and Turn (spec §8), normalised over the three riders' quivers; a bodyboard on its own scale. */
export function boardBars(name: PresetName, kind: BoardKind): Bars {
  if (kind === 'bodyboard') {
    const area = (n: PresetName): number => { const s = boardFor(PRESETS[n], 'bodyboard'); return s.lengthM * s.maxWidthM; };
    const all = bodyboards().map(area);
    return { paddle: score(area(name), Math.min(...all), Math.max(...all)), hold: 3, turn: 5 };
  }
  const hold = (n: PresetName, k: BoardKind): number => { const s = boardFor(PRESETS[n], k); return s.lengthM * TAIL_HOLD[s.tail]; };
  const turn = (n: PresetName, k: BoardKind): number => 1 / boardFor(PRESETS[n], k).lengthM;
  const boards = surfboards();
  const range = (f: (n: PresetName, k: BoardKind) => number): [number, number] => { const v = boards.map(([n, k]) => f(n, k)); return [Math.min(...v), Math.max(...v)]; };
  return {
    paddle: score(volumeL(name, kind), ...range(volumeL)),
    hold: score(hold(name, kind), ...range(hold)),
    turn: score(turn(name, kind), ...range(turn)),
  };
}

export function lengthLabel(inches: number): string {
  const r = Math.round(inches);
  return `${Math.floor(r / 12)}'${r % 12}"`;
}

const VULGAR: Record<number, string> = { 2: '⅛', 4: '¼', 6: '⅜', 8: '½', 10: '⅝', 12: '¾', 14: '⅞' };

/** Inches to the nearest sixteenth: "18¾", "2 5⁄16", "19". */
export function inchFraction(v: number): string {
  const sixteenths = Math.round(v * 16), whole = Math.floor(sixteenths / 16), rest = sixteenths % 16;
  if (rest === 0) return `${whole}`;
  if (VULGAR[rest]) return `${whole}${VULGAR[rest]}`;
  return `${whole} ${rest}⁄16`;
}

const TAIL_WORDS = { squash: 'squash tail', roundPin: 'round pin tail', crescent: 'crescent tail' } as const;

/** `5'10" × 18¾" × 2 5⁄16" · squash tail · thruster` (spec §4.3). */
export function specsLine(name: PresetName, kind: BoardKind): string {
  const d = PRESETS[name].quiver[kind]!, s = boardFor(PRESETS[name], kind);
  const len = kind === 'bodyboard' ? `${inchFraction(d.lengthIn)}"` : lengthLabel(d.lengthIn);
  const parts = [`${len} × ${inchFraction(d.widthIn)}" × ${inchFraction(d.thicknessIn)}"`, TAIL_WORDS[s.tail]];
  if (s.fins.length === 3) parts.push('thruster');
  return parts.join(' · ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/frontend/boardPick.test.ts`
Expected: PASS. If `buildBoard`'s returned arrays aren't named `positions` and `indices`, read `MeshArrays` in `src/board/boardGeometry.ts` and use its field names. The volume test in `boardGeometry.test.ts` shows the call.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/boardPick.ts src/frontend/boardPick.test.ts
git commit -m "feat(frontend): the board pick: fits by size and period, the rider's pick and reason, Paddle/Hold/Turn bars, the specs line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settings and remembered choices

**Files:**
- Create: `src/frontend/frontSettings.ts`
- Test: `src/frontend/frontSettings.test.ts`

**Interfaces:**
- Consumes: `SettingsStorage` (`src/dev/devSettings.ts`); Task 1's `SessionSetup`, tables, `presetById`, `FIRST_PRESET`; `PresetName`, `BoardKind`, `OutfitChoice`, `PRESETS`, `boardsFor`.
- Produces:
  - `interface FrontSettings { textScale: number; calmMenus: boolean; opaqueBackplates: boolean; safeArea: number | null; displayMode: 'pc' | 'tv'; glyphs: 'auto' | 'xbox' | 'playstation' | 'keyboard' }`
  - `DEFAULT_FRONT_SETTINGS`, `FRONT_SETTINGS_KEY`, `FRONT_CHOICES_KEY`
  - `sanitizeFrontSettings(raw): FrontSettings`
  - `safeAreaFraction(s): number`
  - `interface SavedChoices { setup: SessionSetup; rider: PresetName; boards: Partial<Record<PresetName, BoardKind>>; outfits: Partial<Record<PresetName, OutfitChoice>> }`
  - `DEFAULT_CHOICES`, `sanitizeSetup(raw): SessionSetup`, `sanitizeChoices(raw): SavedChoices`
  - `loadJson(storage, key): unknown`, `saveJson(storage, key, value): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/frontSettings.test.ts
import { describe, expect, it } from 'vitest';
import { FIRST_PRESET, presetById } from './sessionSetup';
import {
  DEFAULT_CHOICES, DEFAULT_FRONT_SETTINGS, FRONT_CHOICES_KEY, loadJson, safeAreaFraction, sanitizeChoices, sanitizeFrontSettings, sanitizeSetup, saveJson,
} from './frontSettings';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };

describe('settings and remembered choices (dune select spec §3, §11; Review Focus 5)', () => {
  it('defaults to Winter offshore and Shazza', () => {
    expect(DEFAULT_CHOICES.setup).toEqual(presetById(FIRST_PRESET)!.setup);
    expect(DEFAULT_CHOICES.rider).toBe('female');
  });
  it('defaults the settings', () => {
    expect(DEFAULT_FRONT_SETTINGS).toEqual({ textScale: 1, calmMenus: false, opaqueBackplates: false, safeArea: null, displayMode: 'pc', glyphs: 'auto' });
  });
  it('takes the safe area from the display mode unless overridden', () => {
    expect(safeAreaFraction(DEFAULT_FRONT_SETTINGS)).toBe(0.03);
    expect(safeAreaFraction({ ...DEFAULT_FRONT_SETTINGS, displayMode: 'tv' })).toBe(0.05);
    expect(safeAreaFraction({ ...DEFAULT_FRONT_SETTINGS, safeArea: 0.08 })).toBe(0.08);
  });
  it('sanitises garbage, wrong types and out-of-range values to the defaults, value by value', () => {
    for (const raw of [null, undefined, 42, 'x', [], { textScale: 'big' }]) expect(sanitizeFrontSettings(raw)).toEqual(DEFAULT_FRONT_SETTINGS);
    expect(sanitizeFrontSettings({ textScale: 9, safeArea: 0.5, displayMode: 'phone', glyphs: 'nintendo', calmMenus: 1 }))
      .toEqual({ ...DEFAULT_FRONT_SETTINGS, textScale: 2, safeArea: 0.1 });
    expect(sanitizeFrontSettings({ textScale: 1.5, calmMenus: true, displayMode: 'tv' })).toEqual({ ...DEFAULT_FRONT_SETTINGS, textScale: 1.5, calmMenus: true, displayMode: 'tv' });
  });
  it('sanitises a setup row by row', () => {
    const w = presetById(FIRST_PRESET)!.setup;
    expect(sanitizeSetup({ ...w, month: 14, sky: 'tornado', swellFt: 30, periodS: 3.3, fromDeg: 180, tide: -1, wind: 2.5, timeStop: 9, timeFineMin: 1e6 }))
      .toEqual({ ...w, month: w.month, sky: w.sky, swellFt: 12, periodS: 8, fromDeg: w.fromDeg, tide: w.tide, wind: w.wind, timeStop: w.timeStop, timeFineMin: 0 });
    expect(sanitizeSetup({ ...w, swellFt: 4.3 }).swellFt).toBe(4.5);
  });
  it('drops boards a rider doesn\'t own and outfits that aren\'t theirs', () => {
    const c = sanitizeChoices({ setup: {}, rider: 'grommet', boards: { grommet: 'thruster', female: 'stepUp' }, outfits: { female: 'boardies', male: 'season' } });
    expect(c.rider).toBe('grommet');
    expect(c.boards).toEqual({ female: 'stepUp' });
    expect(c.outfits).toEqual({ male: 'season' });
    expect(c.setup).toEqual(DEFAULT_CHOICES.setup);
    expect(sanitizeChoices('{broken').rider).toBe('female');
  });
  it('saves and loads through storage, and survives one that throws', () => {
    const s = memory();
    saveJson(s, FRONT_CHOICES_KEY, { rider: 'male' });
    expect(sanitizeChoices(loadJson(s, FRONT_CHOICES_KEY)).rider).toBe('male');
    s.setItem(FRONT_CHOICES_KEY, '{not json');
    expect(loadJson(s, FRONT_CHOICES_KEY)).toBeNull();
    expect(() => saveJson(throwing, FRONT_CHOICES_KEY, {})).not.toThrow();
    expect(loadJson(throwing, FRONT_CHOICES_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/frontSettings.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/frontSettings.ts
import type { BoardKind } from '../board/boardSpec';
import type { SettingsStorage } from '../dev/devSettings';
import { PRESETS, type PresetName, boardsFor } from '../surfer/presets';
import { type OutfitChoice, presetOutfits } from '../surfer/wardrobe';
import { WEATHER_PRESET_NAMES } from '../weather/weather';
import { FIRST_PRESET, FROM_WINDOW, type SessionSetup, TIDE_STOPS, TIME_STOPS, WIND_ROWS, presetById } from './sessionSetup';

/** The player's front-end settings (spec §11), in a player-facing key beside the dev settings. */
export interface FrontSettings {
  /** 1–2 (100–200%). */
  textScale: number;
  calmMenus: boolean;
  opaqueBackplates: boolean;
  /** 0.02–0.10, or null for the display mode's (PC 3%, TV 5%). */
  safeArea: number | null;
  displayMode: 'pc' | 'tv';
  glyphs: 'auto' | 'xbox' | 'playstation' | 'keyboard';
}

export const DEFAULT_FRONT_SETTINGS: Readonly<FrontSettings> = { textScale: 1, calmMenus: false, opaqueBackplates: false, safeArea: null, displayMode: 'pc', glyphs: 'auto' };
export const FRONT_SETTINGS_KEY = 'liquid-dreams.front-settings.v1';
export const FRONT_CHOICES_KEY = 'liquid-dreams.front-choices.v1';

export const safeAreaFraction = (s: FrontSettings): number => s.safeArea ?? (s.displayMode === 'tv' ? 0.05 : 0.03);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const int = (v: unknown, lo: number, hi: number, fallback: number): number => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : fallback);

export function sanitizeFrontSettings(raw: unknown): FrontSettings {
  const d = DEFAULT_FRONT_SETTINGS;
  if (!isObj(raw)) return { ...d };
  return {
    textScale: num(raw.textScale, 1, 2, d.textScale),
    calmMenus: bool(raw.calmMenus, d.calmMenus),
    opaqueBackplates: bool(raw.opaqueBackplates, d.opaqueBackplates),
    safeArea: raw.safeArea === null || raw.safeArea === undefined ? null : num(raw.safeArea, 0.02, 0.1, 0.03),
    displayMode: oneOf(raw.displayMode, ['pc', 'tv'] as const, d.displayMode),
    glyphs: oneOf(raw.glyphs, ['auto', 'xbox', 'playstation', 'keyboard'] as const, d.glyphs),
  };
}

/** What the front end remembers across sessions (spec §3). */
export interface SavedChoices {
  setup: SessionSetup;
  rider: PresetName;
  /** A board the player swapped to, per rider (absent: the rider's pick). */
  boards: Partial<Record<PresetName, BoardKind>>;
  outfits: Partial<Record<PresetName, OutfitChoice>>;
}

export const DEFAULT_CHOICES: Readonly<SavedChoices> = { setup: presetById(FIRST_PRESET)!.setup, rider: 'female', boards: {}, outfits: {} };

export function sanitizeSetup(raw: unknown): SessionSetup {
  const d = DEFAULT_CHOICES.setup;
  if (!isObj(raw)) return { ...d };
  const ft = typeof raw.swellFt === 'number' && Number.isFinite(raw.swellFt) ? Math.min(12, Math.max(1, Math.round(raw.swellFt * 2) / 2)) : d.swellFt;
  const periodS = typeof raw.periodS === 'number' && Number.isFinite(raw.periodS) ? Math.min(20, Math.max(8, Math.round(raw.periodS))) : d.periodS;
  const fine = typeof raw.timeFineMin === 'number' && Number.isFinite(raw.timeFineMin) && Math.abs(raw.timeFineMin) <= 600 ? Math.round(raw.timeFineMin / 15) * 15 : 0;
  return {
    month: int(raw.month, 0, 11, d.month),
    timeStop: int(raw.timeStop, 0, TIME_STOPS.length - 1, d.timeStop),
    timeFineMin: fine,
    sky: oneOf(raw.sky, WEATHER_PRESET_NAMES, d.sky),
    wind: int(raw.wind, 0, WIND_ROWS.length - 1, d.wind),
    swellFt: ft,
    periodS,
    fromDeg: oneOf(raw.fromDeg, FROM_WINDOW as readonly number[], d.fromDeg),
    tide: int(raw.tide, 0, TIDE_STOPS.length - 1, d.tide),
  };
}

const RIDERS: readonly PresetName[] = ['female', 'male', 'grommet'];

export function sanitizeChoices(raw: unknown): SavedChoices {
  if (!isObj(raw)) return { ...DEFAULT_CHOICES, boards: {}, outfits: {} };
  const boards: Partial<Record<PresetName, BoardKind>> = {}, outfits: Partial<Record<PresetName, OutfitChoice>> = {};
  for (const n of RIDERS) {
    const b = isObj(raw.boards) ? raw.boards[n] : undefined;
    if (boardsFor(PRESETS[n]).includes(b as BoardKind)) boards[n] = b as BoardKind;
    const o = isObj(raw.outfits) ? raw.outfits[n] : undefined;
    const allowed: OutfitChoice[] = ['season', ...presetOutfits(PRESETS[n]).filter((x) => x !== 'walking')];
    if (allowed.includes(o as OutfitChoice)) outfits[n] = o as OutfitChoice;
  }
  return { setup: sanitizeSetup(raw.setup), rider: oneOf(raw.rider, RIDERS, DEFAULT_CHOICES.rider), boards, outfits };
}

/** JSON from storage, or null (missing, unreadable, or a storage that throws). */
export function loadJson(storage: SettingsStorage, key: string): unknown {
  try {
    const s = storage.getItem(key);
    return s === null ? null : JSON.parse(s);
  } catch {
    return null;
  }
}

export function saveJson(storage: SettingsStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage: the choices just aren't remembered.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/frontend/frontSettings.test.ts`
Expected: PASS. If `SettingsStorage` isn't exported from `devSettings.ts`, export it (it's an interface there).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/frontSettings.ts src/frontend/frontSettings.test.ts src/dev/devSettings.ts
git commit -m "feat(frontend): settings and remembered choices, sanitised value by value, through a storage that may throw

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The state machine

**Files:**
- Create: `src/frontend/frontEnd.ts`
- Test: `src/frontend/frontEnd.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5 (`stepRow`, `fineRow`, `stepPreset`, `presetById`, `presetOfSetup`, `rollSetup`, `RIDER_ORDER`, `pickBoard`, `SavedChoices`); `boardsFor`, `PRESETS`, `presetOutfits`.
- Produces:
  - `type Beat = 'conditions' | 'rider' | 'gear' | 'out'`
  - `type FrontAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'random' | 'details' | 'fineMinus' | 'finePlus' | 'tabMinus' | 'tabPlus' | 'toggle' | 'start' | 'settings'`
  - `interface FrontState { beat: Beat; setup: SessionSetup; presetId: string | null; rowFocus: RowId; detailsOpen: boolean; rider: PresetName; gearTab: 'board' | 'outfit'; gearFocus: number; boards: Partial<Record<PresetName, BoardKind>>; outfits: Partial<Record<PresetName, OutfitChoice>>; showSpecs: boolean; move: { from: Beat; to: Beat; t: number; durS: number } | null; buffer: FrontAction[] }`
  - `type FrontEvent` (the union below)
  - `interface SessionChoice { setup: SessionSetup; rider: PresetName; board: BoardKind; outfit: OutfitChoice }`
  - `conditionRows(s): RowId[]`, `gearRows(s): (BoardKind | OutfitChoice)[]`
  - `initialFront(saved): FrontState`
  - `step(s, a, ctx: { seed: number; today: Date; calm: boolean }): { state: FrontState; events: FrontEvent[] }`
  - `tick(s, dtS, ctx): { state: FrontState; events: FrontEvent[] }`
  - `choiceOf(s): SessionChoice`, `savedOf(s): SavedChoices`, `boardOf(s, rider): BoardKind`
  - `BEAT_MOVE_S = 1.6`, `CALM_MOVE_S = 0.2`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/frontEnd.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHOICES } from './frontSettings';
import { BEAT_MOVE_S, type FrontAction, type FrontState, choiceOf, conditionRows, initialFront, savedOf, step, tick } from './frontEnd';
import { presetById } from './sessionSetup';

const CTX = { seed: 99, today: new Date('2026-10-03T10:00:00+08:00'), calm: false };
const run = (s: FrontState, ...actions: FrontAction[]): FrontState => actions.reduce((acc, a) => step(acc, a, CTX).state, s);
const settle = (s: FrontState): FrontState => tick(s, 10, CTX).state;
const fresh = (): FrontState => initialFront(DEFAULT_CHOICES);

describe('the front end\'s state machine (dune select spec §3, §4)', () => {
  it('opens on Conditions, Winter offshore, Shazza in focus', () => {
    const s = fresh();
    expect(s.beat).toBe('conditions');
    expect(s.presetId).toBe('winterOffshore');
    expect(s.rider).toBe('female');
    expect(s.rowFocus).toBe('preset');
  });
  it('moves down the rows, wrapping, and changes a value at once with left and right', () => {
    let s = run(fresh(), 'up');
    expect(s.rowFocus).toBe('tide');
    s = run(fresh(), 'down', 'right');
    expect(s.rowFocus).toBe('month');
    expect(s.setup.month).toBe(7);
    expect(s.presetId).toBeNull();
  });
  it('steps through presets on the Preset row, setting every row', () => {
    const s = run(fresh(), 'right');
    expect(s.presetId).toBe('bigWinterSwell');
    expect(s.setup).toEqual(presetById('bigWinterSwell')!.setup);
  });
  it('emits a value event, or an end nudge at a stop', () => {
    const tide = run(fresh(), 'up');
    expect(step(tide, 'left', CTX).events).toContainEqual({ kind: 'value', row: 'tide', dir: -1 });
    const low = run(tide, 'left');
    expect(step(low, 'left', CTX).events).toContainEqual({ kind: 'end', row: 'tide' });
  });
  it('opens and closes the Period row under Swell with X', () => {
    let s = run(fresh(), 'details');
    expect(conditionRows(s)).toEqual(['preset', 'month', 'time', 'sky', 'wind', 'swell', 'period', 'from', 'tide']);
    s = run(s, 'up', 'up', 'up');
    expect(s.rowFocus).toBe('period');
    s = run(s, 'details');
    expect(s.rowFocus).toBe('swell');
  });
  it('rolls the dice by seed', () => {
    const r = step(fresh(), 'random', CTX);
    expect(r.events).toContainEqual({ kind: 'roll', seed: CTX.seed });
    expect(r.state.setup).not.toEqual(fresh().setup);
  });
  it('goes Conditions → rider → gear on A, with a camera move each time, and back on B', () => {
    let r = step(fresh(), 'confirm', CTX);
    expect(r.events).toContainEqual({ kind: 'move', from: 'conditions', to: 'rider' });
    expect(r.state.move?.durS).toBe(BEAT_MOVE_S);
    let s = settle(r.state);
    expect(s.beat).toBe('rider');
    r = step(s, 'confirm', CTX);
    expect(r.events).toContainEqual({ kind: 'pick', rider: 'female' });
    s = settle(r.state);
    expect(s.beat).toBe('gear');
    s = settle(run(s, 'back'));
    expect(s.beat).toBe('rider');
    s = settle(run(s, 'back'));
    expect(s.beat).toBe('conditions');
    expect(step(s, 'back', CTX).events).toEqual([]);
  });
  it('moves the rider focus with LB/RB or left/right, wrapping through T-Bone, Shazza, Grommet', () => {
    let s = settle(run(fresh(), 'confirm'));
    s = run(s, 'right');
    expect(s.rider).toBe('grommet');
    s = run(s, 'tabPlus');
    expect(s.rider).toBe('male');
    expect(step(s, 'left', CTX).events).toContainEqual({ kind: 'riderFocus', rider: 'grommet' });
  });
  it('remembers each beat\'s focus', () => {
    let s = run(fresh(), 'down', 'down');
    s = settle(run(s, 'confirm'));
    s = run(s, 'right');
    s = settle(run(s, 'back'));
    expect(s.rowFocus).toBe('time');
    s = settle(run(s, 'confirm'));
    expect(s.rider).toBe('grommet');
  });
  it('lists the rider\'s boards in Grab your gear, takes a swap on A, and tabs to Outfit', () => {
    let s = settle(run(settle(run(fresh(), 'confirm')), 'confirm'));
    expect(s.gearTab).toBe('board');
    s = run(s, 'down', 'confirm');
    expect(s.boards.female).toBe('stepUp');
    s = run(s, 'tabPlus');
    expect(s.gearTab).toBe('outfit');
    s = run(s, 'down', 'confirm');
    expect(s.outfits.female).toBe('rashieAndBottoms');
    s = run(s, 'toggle');
    expect(s.showSpecs).toBe(true);
  });
  it('paddles out from any beat on START with every remaining choice at its default', () => {
    for (const path of [[], ['confirm'], ['confirm', 'confirm']] as FrontAction[][]) {
      let s = fresh();
      for (const a of path) s = settle(run(s, a));
      const r = step(s, 'start', CTX);
      const out = r.events.find((e) => e.kind === 'paddleOut');
      expect(out, path.join(',')).toBeDefined();
      expect(choiceOf(r.state)).toEqual({ setup: presetById('winterOffshore')!.setup, rider: 'female', board: 'thruster', outfit: 'season' });
      expect(r.state.beat).toBe('out');
    }
  });
  it('skips a camera move to its end on A or B, and buffers other input until it lands', () => {
    let s = step(fresh(), 'confirm', CTX).state;
    s = step(s, 'right', CTX).state;
    expect(s.rider).toBe('female');
    const r = step(s, 'confirm', CTX);
    expect(r.state.move).toBeNull();
    expect(r.state.beat).toBe('rider');
    expect(r.state.rider).toBe('grommet');
  });
  it('makes calm moves short', () => {
    const r = step(fresh(), 'confirm', { ...CTX, calm: true });
    expect(r.state.move?.durS).toBe(0.2);
  });
  it('forwards the settings chord', () => {
    expect(step(fresh(), 'settings', CTX).events).toEqual([{ kind: 'settings' }]);
  });
  it('saves what it should remember', () => {
    const s = run(fresh(), 'down', 'right');
    expect(savedOf(s)).toEqual({ setup: s.setup, rider: 'female', boards: {}, outfits: {} });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/frontEnd.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/frontEnd.ts
import type { BoardKind } from '../board/boardSpec';
import { PRESETS, type PresetName, boardsFor } from '../surfer/presets';
import { type OutfitChoice, presetOutfits } from '../surfer/wardrobe';
import { pickBoard } from './boardPick';
import type { SavedChoices } from './frontSettings';
import { RIDER_ORDER } from './riderCopy';
import { type Dir, type RowId, type SessionSetup, fineRow, presetById, presetOfSetup, rollSetup, stepPreset, stepRow } from './sessionSetup';

export type Beat = 'conditions' | 'rider' | 'gear' | 'out';
export type FrontAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'random' | 'details' | 'fineMinus' | 'finePlus' | 'tabMinus' | 'tabPlus' | 'toggle' | 'start' | 'settings';

export const BEAT_MOVE_S = 1.6;
export const CALM_MOVE_S = 0.2;

export interface FrontState {
  beat: Beat;
  setup: SessionSetup;
  presetId: string | null;
  rowFocus: RowId;
  detailsOpen: boolean;
  rider: PresetName;
  gearTab: 'board' | 'outfit';
  gearFocus: number;
  boards: Partial<Record<PresetName, BoardKind>>;
  outfits: Partial<Record<PresetName, OutfitChoice>>;
  showSpecs: boolean;
  /** A camera move between beats in progress (the beat is already the destination). */
  move: { from: Beat; to: Beat; t: number; durS: number } | null;
  /** Input during a move, applied when it lands (spec §5.6). */
  buffer: FrontAction[];
}

export type FrontEvent =
  | { kind: 'focus' }
  | { kind: 'value'; row: RowId; dir: Dir }
  | { kind: 'end'; row: RowId }
  | { kind: 'roll'; seed: number }
  | { kind: 'details'; open: boolean }
  | { kind: 'move'; from: Beat; to: Beat }
  | { kind: 'landed'; beat: Beat }
  | { kind: 'riderFocus'; rider: PresetName }
  | { kind: 'pick'; rider: PresetName }
  | { kind: 'gear'; tab: 'board' | 'outfit'; focus: number }
  | { kind: 'chosen' }
  | { kind: 'paddleOut'; choice: SessionChoice }
  | { kind: 'back' }
  | { kind: 'settings' };

export interface SessionChoice {
  setup: SessionSetup;
  rider: PresetName;
  board: BoardKind;
  outfit: OutfitChoice;
}

const BASE_ROWS: RowId[] = ['preset', 'month', 'time', 'sky', 'wind', 'swell', 'from', 'tide'];

export function conditionRows(s: FrontState): RowId[] {
  if (!s.detailsOpen) return BASE_ROWS;
  const i = BASE_ROWS.indexOf('swell');
  return [...BASE_ROWS.slice(0, i + 1), 'period', ...BASE_ROWS.slice(i + 1)];
}

const outfitRows = (rider: PresetName): OutfitChoice[] => presetOutfits(PRESETS[rider]).filter((o) => o !== 'walking');

/** The rows of Grab your gear's tab: the rider's boards, or their three surf outfits. */
export function gearRows(s: FrontState): (BoardKind | OutfitChoice)[] {
  return s.gearTab === 'board' ? boardsFor(PRESETS[s.rider]) : outfitRows(s.rider);
}

export function initialFront(saved: SavedChoices): FrontState {
  return {
    beat: 'conditions', setup: saved.setup, presetId: presetOfSetup(saved.setup), rowFocus: 'preset', detailsOpen: false,
    rider: saved.rider, gearTab: 'board', gearFocus: 0, boards: { ...saved.boards }, outfits: { ...saved.outfits },
    showSpecs: false, move: null, buffer: [],
  };
}

export const boardOf = (s: FrontState, rider: PresetName): BoardKind => s.boards[rider] ?? pickBoard(rider, s.setup.swellFt, s.setup.periodS);

export const choiceOf = (s: FrontState): SessionChoice => ({ setup: s.setup, rider: s.rider, board: boardOf(s, s.rider), outfit: s.outfits[s.rider] ?? 'season' });

export const savedOf = (s: FrontState): SavedChoices => ({ setup: s.setup, rider: s.rider, boards: { ...s.boards }, outfits: { ...s.outfits } });

type Ctx = { seed: number; today: Date; calm: boolean };
type Out = { state: FrontState; events: FrontEvent[] };

const wrap = (i: number, n: number): number => ((i % n) + n) % n;

function moveTo(s: FrontState, to: Beat, ctx: Ctx, extra: FrontEvent[] = []): Out {
  return { state: { ...s, beat: to, move: { from: s.beat, to, t: 0, durS: ctx.calm ? CALM_MOVE_S : BEAT_MOVE_S } }, events: [...extra, { kind: 'move', from: s.beat, to }] };
}

/** On the gear beat, the focus starts on the rider's board (or outfit). */
function gearFocusFor(s: FrontState): number {
  if (s.gearTab === 'board') return Math.max(0, boardsFor(PRESETS[s.rider]).indexOf(boardOf(s, s.rider)));
  const want = s.outfits[s.rider] ?? 'season', rows = outfitRows(s.rider);
  return Math.max(0, rows.indexOf(want));
}

function stepConditions(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  const rows = conditionRows(s), i = rows.indexOf(s.rowFocus);
  switch (a) {
    case 'up': case 'down':
      return { state: { ...s, rowFocus: rows[wrap(i + (a === 'down' ? 1 : -1), rows.length)] }, events: [{ kind: 'focus' }] };
    case 'left': case 'right': case 'fineMinus': case 'finePlus': {
      const dir: Dir = a === 'left' || a === 'fineMinus' ? -1 : 1;
      if (s.rowFocus === 'preset') {
        if (a === 'fineMinus' || a === 'finePlus') return { state: s, events: [] };
        const id = stepPreset(s.presetId, dir);
        return { state: { ...s, presetId: id, setup: presetById(id)!.setup }, events: [{ kind: 'value', row: 'preset', dir }] };
      }
      const r = a === 'left' || a === 'right' ? stepRow(s.setup, s.rowFocus, dir, ctx.today) : fineRow(s.setup, s.rowFocus, dir, ctx.today);
      if (!r.changed) return { state: s, events: r.atEnd ? [{ kind: 'end', row: s.rowFocus }] : [] };
      return { state: { ...s, setup: r.setup, presetId: presetOfSetup(r.setup) }, events: [{ kind: 'value', row: s.rowFocus, dir }] };
    }
    case 'random': {
      const setup = rollSetup(ctx.seed);
      return { state: { ...s, setup, presetId: presetOfSetup(setup) }, events: [{ kind: 'roll', seed: ctx.seed }] };
    }
    case 'details': {
      const open = !s.detailsOpen;
      return { state: { ...s, detailsOpen: open, rowFocus: !open && s.rowFocus === 'period' ? 'swell' : s.rowFocus }, events: [{ kind: 'details', open }] };
    }
    case 'confirm':
      return moveTo(s, 'rider', ctx);
    default:
      return { state: s, events: [] };
  }
}

function stepRider(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  switch (a) {
    case 'left': case 'right': case 'tabMinus': case 'tabPlus': {
      const dir = a === 'left' || a === 'tabMinus' ? -1 : 1, i = RIDER_ORDER.indexOf(s.rider);
      const rider = RIDER_ORDER[wrap(i + dir, RIDER_ORDER.length)];
      return { state: { ...s, rider }, events: [{ kind: 'riderFocus', rider }] };
    }
    case 'confirm': {
      const t = { ...s, gearTab: 'board' as const };
      return moveTo({ ...t, gearFocus: gearFocusFor(t) }, 'gear', ctx, [{ kind: 'pick', rider: s.rider }]);
    }
    case 'back':
      return moveTo(s, 'conditions', ctx, [{ kind: 'back' }]);
    default:
      return { state: s, events: [] };
  }
}

function stepGear(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  const rows = gearRows(s);
  switch (a) {
    case 'up': case 'down': {
      const gearFocus = wrap(s.gearFocus + (a === 'down' ? 1 : -1), rows.length);
      return { state: { ...s, gearFocus }, events: [{ kind: 'gear', tab: s.gearTab, focus: gearFocus }] };
    }
    case 'tabMinus': case 'tabPlus': {
      const t = { ...s, gearTab: s.gearTab === 'board' ? ('outfit' as const) : ('board' as const) };
      const gearFocus = gearFocusFor(t);
      return { state: { ...t, gearFocus }, events: [{ kind: 'gear', tab: t.gearTab, focus: gearFocus }] };
    }
    case 'confirm': {
      const v = rows[s.gearFocus];
      const state = s.gearTab === 'board' ? { ...s, boards: { ...s.boards, [s.rider]: v as BoardKind } } : { ...s, outfits: { ...s.outfits, [s.rider]: v as OutfitChoice } };
      return { state, events: [{ kind: 'chosen' }] };
    }
    case 'toggle':
      return { state: { ...s, showSpecs: !s.showSpecs }, events: [] };
    case 'back':
      return moveTo(s, 'rider', ctx, [{ kind: 'back' }]);
    default:
      return { state: s, events: [] };
  }
}

/** One action (spec §3, §4): A on, B back, START out from anywhere; a move skips on A or B and buffers the rest. */
export function step(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  if (s.beat === 'out') return { state: s, events: [] };
  if (a === 'settings') return { state: s, events: [{ kind: 'settings' }] };
  if (a === 'start') {
    const state = { ...s, beat: 'out' as const, move: null, buffer: [] };
    return { state, events: [{ kind: 'paddleOut', choice: choiceOf(state) }] };
  }
  if (s.move) {
    if (a === 'confirm' || a === 'back') return land(s, ctx);
    return { state: { ...s, buffer: [...s.buffer, a] }, events: [] };
  }
  if (s.beat === 'conditions') return stepConditions(s, a, ctx);
  if (s.beat === 'rider') return stepRider(s, a, ctx);
  return stepGear(s, a, ctx);
}

/** Ends the move, then applies what was buffered during it. */
function land(s: FrontState, ctx: Ctx): Out {
  let state: FrontState = { ...s, move: null, buffer: [] };
  const events: FrontEvent[] = [{ kind: 'landed', beat: state.beat }];
  for (const a of s.buffer) {
    const r = step(state, a, ctx);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Advances a camera move; lands it at its end. */
export function tick(s: FrontState, dtS: number, ctx: Ctx): Out {
  if (!s.move) return { state: s, events: [] };
  const t = s.move.t + dtS / s.move.durS;
  if (t >= 1) return land(s, ctx);
  return { state: { ...s, move: { ...s.move, t } }, events: [] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/frontend/frontEnd.test.ts`
Expected: PASS. In the "skips a camera move" test, the buffered `right` lands after `confirm` skips the move, which is why the rider ends as Grommet.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/frontEnd.ts src/frontend/frontEnd.test.ts
git commit -m "feat(frontend): the select screen's state machine: beats, focus per beat, Back, START from anywhere, skippable moves, buffered input

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Input: devices to actions

**Files:**
- Create: `src/frontend/uiInput.ts`
- Test: `src/frontend/uiInput.test.ts`

**Interfaces:**
- Consumes: Task 6's `FrontAction`; `shouldIgnoreKeyTarget` (`src/camera/Input.ts`).
- Produces:
  - `type Device = 'keyboard' | 'xbox' | 'playstation'`
  - `KEY_ACTIONS: Record<string, FrontAction>`
  - `deviceFamily(padId): 'xbox' | 'playstation'`
  - `interface PadSnapshot { id: string; buttons: boolean[]; axes: number[] }`
  - `padHeld(p): Set<FrontAction>` (the raw held set, including `back` and `start`)
  - `REPEATING`
  - `class Repeater { constructor(delayMs = 250, everyMs = 80); update(held: ReadonlySet<FrontAction>, nowMs: number): FrontAction[] }` (presses on the edge, repeats for directions and fine steps, the settings chord)
  - `class UiInput { constructor(target?: Window); poll(nowMs): { actions: FrontAction[]; device: Device }; dispose() }`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/uiInput.test.ts
import { describe, expect, it } from 'vitest';
import { KEY_ACTIONS, type PadSnapshot, Repeater, deviceFamily, padHeld } from './uiInput';

const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0], id = 'Xbox Wireless Controller (STANDARD GAMEPAD)'): PadSnapshot =>
  ({ id, buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i)), axes });

describe('input (dune select spec §10; Review Focus 2)', () => {
  it('maps the keyboard', () => {
    expect(KEY_ACTIONS.ArrowUp).toBe('up'); expect(KEY_ACTIONS.KeyW).toBe('up');
    expect(KEY_ACTIONS.Enter).toBe('confirm'); expect(KEY_ACTIONS.Space).toBe('confirm');
    expect(KEY_ACTIONS.Escape).toBe('back'); expect(KEY_ACTIONS.Backspace).toBe('back');
    expect(KEY_ACTIONS.KeyR).toBe('random'); expect(KEY_ACTIONS.KeyF).toBe('details');
    expect(KEY_ACTIONS.KeyQ).toBe('tabMinus'); expect(KEY_ACTIONS.KeyE).toBe('tabPlus');
    expect(KEY_ACTIONS.Tab).toBe('toggle'); expect(KEY_ACTIONS.KeyP).toBe('start');
  });
  it('tells PlayStation pads from the rest by their id', () => {
    expect(deviceFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(deviceFamily('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(deviceFamily('Sony Interactive Entertainment DUALSHOCK 4')).toBe('playstation');
    expect(deviceFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(deviceFamily('8BitDo Pro 2')).toBe('xbox');
  });
  it('reads the standard pad mapping, the stick past 0.5', () => {
    expect([...padHeld(pad([0]))]).toEqual(['confirm']);
    expect([...padHeld(pad([1, 2, 3]))].sort()).toEqual(['back', 'details', 'random']);
    expect([...padHeld(pad([4, 5, 6, 7, 9, 11]))].sort()).toEqual(['fineMinus', 'finePlus', 'start', 'tabMinus', 'tabPlus', 'toggle']);
    expect([...padHeld(pad([12, 13, 14, 15]))].sort()).toEqual(['down', 'left', 'right', 'up']);
    expect([...padHeld(pad([], [0.49, 0, 0, 0]))]).toEqual([]);
    expect([...padHeld(pad([], [0.51, 0, 0, 0]))]).toEqual(['right']);
    expect([...padHeld(pad([], [0, -0.8, 0, 0]))]).toEqual(['up']);
  });
  it('presses on the edge, repeats directions after 250 ms then every 80 ms, never repeats a confirm', () => {
    const r = new Repeater();
    const right = new Set(['right'] as const), confirm = new Set(['confirm'] as const), none = new Set<never>();
    expect(r.update(right, 0)).toEqual(['right']);
    expect(r.update(right, 249)).toEqual([]);
    expect(r.update(right, 250)).toEqual(['right']);
    expect(r.update(right, 329)).toEqual([]);
    expect(r.update(right, 330)).toEqual(['right']);
    expect(r.update(none, 400)).toEqual([]);
    expect(r.update(confirm, 500)).toEqual(['confirm']);
    expect(r.update(confirm, 2000)).toEqual([]);
  });
  it('stops repeating when the device goes away mid-hold (a pad unplugged)', () => {
    const r = new Repeater();
    r.update(new Set(['down'] as const), 0);
    expect(r.update(new Set(), 300)).toEqual([]);
    expect(r.update(new Set(), 1000)).toEqual([]);
  });
  it('turns Back + START into Settings, not Paddle out', () => {
    const r = new Repeater();
    expect(r.update(new Set(['back'] as const), 0)).toEqual(['back']);
    expect(r.update(new Set(['back', 'start'] as const), 50)).toEqual(['settings']);
    const r2 = new Repeater();
    expect(r2.update(new Set(['back', 'start'] as const), 0)).toEqual(['settings']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/uiInput.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/uiInput.ts
import { shouldIgnoreKeyTarget } from '../camera/Input';
import type { FrontAction } from './frontEnd';

export type Device = 'keyboard' | 'xbox' | 'playstation';

/** Keys (KeyboardEvent.code) → actions (spec §10). */
export const KEY_ACTIONS: Record<string, FrontAction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm', Escape: 'back', Backspace: 'back',
  KeyR: 'random', KeyF: 'details', KeyQ: 'tabMinus', KeyE: 'tabPlus', Tab: 'toggle', KeyP: 'start',
};

export function deviceFamily(padId: string): 'xbox' | 'playstation' {
  return /054c|sony|dualshock|dualsense|playstation/i.test(padId) ? 'playstation' : 'xbox';
}

export interface PadSnapshot {
  id: string;
  buttons: boolean[];
  axes: number[];
}

/** The W3C standard mapping's buttons → actions. */
const PAD_BUTTONS: [number, FrontAction][] = [
  [0, 'confirm'], [1, 'back'], [2, 'details'], [3, 'random'], [4, 'tabMinus'], [5, 'tabPlus'], [6, 'fineMinus'], [7, 'finePlus'],
  [9, 'start'], [11, 'toggle'], [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'],
];
const STICK = 0.5;

export function padHeld(p: PadSnapshot): Set<FrontAction> {
  const held = new Set<FrontAction>();
  for (const [i, a] of PAD_BUTTONS) if (p.buttons[i]) held.add(a);
  const [x = 0, y = 0] = p.axes;
  if (x > STICK) held.add('right');
  if (x < -STICK) held.add('left');
  if (y > STICK) held.add('down');
  if (y < -STICK) held.add('up');
  return held;
}

/** Actions that repeat while held (spec §10). */
export const REPEATING: ReadonlySet<FrontAction> = new Set(['up', 'down', 'left', 'right', 'fineMinus', 'finePlus']);

/** One device's presses: on the edge, then repeats for directions and fine steps; Back + START is Settings. */
export class Repeater {
  private readonly since = new Map<FrontAction, { at: number; next: number }>();

  constructor(private readonly delayMs = 250, private readonly everyMs = 80) {}

  update(held: ReadonlySet<FrontAction>, nowMs: number): FrontAction[] {
    const out: FrontAction[] = [];
    for (const a of [...this.since.keys()]) if (!held.has(a)) this.since.delete(a);
    const chord = held.has('back') && held.has('start');
    let chordNew = false;
    for (const a of held) {
      const s = this.since.get(a);
      if (!s) {
        this.since.set(a, { at: nowMs, next: nowMs + this.delayMs });
        if (chord && (a === 'back' || a === 'start')) chordNew = true;
        else out.push(a);
      } else if (REPEATING.has(a) && nowMs >= s.next) {
        out.push(a);
        s.next += this.everyMs;
        if (s.next <= nowMs) s.next = nowMs + this.everyMs;
      }
    }
    if (chordNew) out.push('settings');
    return out;
  }
}

/** The DOM side: keys from the window (not while typing in the dev panel), pads polled each frame. */
export class UiInput {
  private readonly keys = new Set<FrontAction>();
  private readonly keyRepeater = new Repeater();
  private readonly padRepeaters = new Map<number, Repeater>();
  private device: Device = 'keyboard';
  private keyQueued = false;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown, true);
    target.addEventListener('keyup', this.onKeyUp, true);
    target.addEventListener('blur', this.onBlur);
  }

  /** The actions since the last poll and the device that sent the latest. */
  poll(nowMs: number): { actions: FrontAction[]; device: Device } {
    const actions: FrontAction[] = [];
    const keyActions = this.keyRepeater.update(this.keys, nowMs);
    if (keyActions.length || this.keyQueued) this.device = 'keyboard';
    this.keyQueued = false;
    actions.push(...keyActions);
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const live = new Set<number>();
    for (const g of pads) {
      if (!g || !g.connected) continue;
      live.add(g.index);
      let r = this.padRepeaters.get(g.index);
      if (!r) this.padRepeaters.set(g.index, (r = new Repeater()));
      const snap: PadSnapshot = { id: g.id, buttons: g.buttons.map((b) => b.pressed), axes: [...g.axes] };
      const got = r.update(padHeld(snap), nowMs);
      if (got.length) {
        this.device = deviceFamily(g.id);
        actions.push(...got);
      }
    }
    for (const i of [...this.padRepeaters.keys()]) if (!live.has(i)) this.padRepeaters.delete(i); // unplugged: its held keys go with it
    return { actions, device: this.device };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown, true);
    this.target.removeEventListener('keyup', this.onKeyUp, true);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (shouldIgnoreKeyTarget(e.target)) return;
    const a = KEY_ACTIONS[e.code];
    if (!a) return;
    e.preventDefault(); // Tab, Space and Backspace mustn't move the page or the browser's focus
    this.keys.add(a);
    this.keyQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const a = KEY_ACTIONS[e.code];
    if (a) this.keys.delete(a);
  };

  private onBlur = (): void => this.keys.clear();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/frontend/uiInput.test.ts`
Expected: PASS. vitest runs in node: the test imports only the pure parts, and `UiInput` touches `window` only when constructed.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/uiInput.ts src/frontend/uiInput.test.ts
git commit -m "feat(frontend): input: keys and pads to the same actions, repeat on hold, Back+START for Settings, the last device chooses the glyphs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The beats' camera shots and the crew's places

**Files:**
- Create: `src/frontend/beatCamera.ts`
- Test: `src/frontend/beatCamera.test.ts`

**Interfaces:**
- Consumes: `CameraPose` (`src/dev/momentLink.ts`); `LandSpot`, `headingAxes` (`src/surfer/placement.ts`); `GANG_SPACING_M` (`src/surfer/gang.ts`); `PRESETS`, `PresetName`; `WOMB_LINEUP`, `TrackNetwork`, `routeTracks` (`src/land/tracks.ts`, tests only); `testLand` (tests only); Task 6's `Beat`; Task 3's `RIDER_ORDER`.
- Produces:
  - `interface CrewPlace { preset: PresetName; x: number; z: number; headingDeg: number }`
  - `SELECT_SPACING_M = 1.7`, `CAMERA_FOV_DEG = 60`
  - `SHOT = { cond: { backM: 3.8, upM: 2.3, yawNudgeDeg: -9 }, rider: { distM: 2.35, heightM: 0.95, offDeg: 18, atX: 0.33 }, gear: { distM: 2.1, heightM: 1.35, offDeg: 30, atX: 0.3 } }`
  - `crewFor(beat: 'conditions' | 'rider' | 'gear', stand: LandSpot): CrewPlace[]`
  - `conditionsShot(stand, ground, lineup?): CameraPose`
  - `riderShot(place, ground): CameraPose`, `gearShot(place, ground): CameraPose`
  - `easePose(a, b, t): CameraPose`
  - `poseCamera(pose, aspect): THREE.PerspectiveCamera` (shared with the self-tests)
  - `stagingReady(land: { trackNetwork: unknown } | null): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/beatCamera.test.ts
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { testLand } from '../land/testLand';
import { TrackNetwork, routeTracks } from '../land/tracks';
import { PRESETS } from '../surfer/presets';
import { type CrewPlace, SELECT_SPACING_M, conditionsShot, crewFor, easePose, gearShot, poseCamera, riderShot, stagingReady } from './beatCamera';
import type { CameraPose } from '../dev/momentLink';

const land = testLand();
const net = new TrackNetwork(routeTracks(land, [-300, 300]));
const ground = (x: number, z: number): number => land.baseHeightAt(x, z) - net.sinkAt(x, z);
const stand = net.standSpot();
const W = 1920, H = 1080;

/** A rider's on-screen box (px): a 0.5 m-wide column from their ground to their height. */
function box(pose: CameraPose, p: CrewPlace): { minX: number; maxX: number; minY: number; maxY: number; inFront: boolean } {
  const cam = poseCamera(pose, W / H), g = ground(p.x, p.z), h = PRESETS[p.preset].heightM;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, inFront = true;
  for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) for (const y of [g, g + h]) {
    const v = new Vector3(p.x + dx, y, p.z + dz);
    if (v.clone().applyMatrix4(cam.matrixWorldInverse).z > 0) inFront = false;
    v.project(cam);
    const sx = ((v.x + 1) / 2) * W, sy = ((1 - v.y) / 2) * H;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  return { minX, maxX, minY, maxY, inFront };
}
/** The slide panel's raked leading edge (900 px wide, 110 px rake): x at screen height y. */
const panelEdge = (y: number): number => W - 900 + 110 * (1 - y / H);

describe('the beats\' shots (dune select spec §4; ruling: the crew spread on the turn)', () => {
  it('waits for the land\'s tracks before staging (Review Focus 3)', () => {
    expect(stagingReady(null)).toBe(false);
    expect(stagingReady({ trackNetwork: null })).toBe(false);
    expect(stagingReady({ trackNetwork: net })).toBe(true);
  });
  it('stands the crew facing the sea for Conditions, T-Bone · Shazza · Grommet left to right from behind', () => {
    const crew = crewFor('conditions', stand);
    expect(crew.map((c) => c.preset)).toEqual(['male', 'female', 'grommet']);
    for (const c of crew) expect(c.headingDeg).toBe((stand.headingDeg + 180) % 360);
    const pose = conditionsShot(stand, ground), xs = crew.map((c) => box(pose, c));
    expect(xs[0].maxX).toBeLessThan(xs[1].maxX);
    expect(xs[1].maxX).toBeLessThan(xs[2].maxX);
  });
  it('turns them round without crossing: the outer two side-step outward, nobody walks through the others', () => {
    const before = crewFor('conditions', stand), after = crewFor('rider', stand);
    for (const b of before) {
      const a = after.find((c) => c.preset === b.preset)!;
      expect(Math.hypot(a.x - b.x, a.z - b.z), b.preset).toBeLessThanOrEqual(0.7);
    }
  });
  it('re-forms them facing inland, 1.7 m apart, T-Bone · Shazza · Grommet left to right from the camera', () => {
    const crew = crewFor('rider', stand);
    expect(crew.map((c) => c.preset)).toEqual(['male', 'female', 'grommet']);
    expect(Math.hypot(crew[0].x - crew[1].x, crew[0].z - crew[1].z)).toBeCloseTo(SELECT_SPACING_M, 6);
    const pose = riderShot(crew[1], ground);
    const xs = crew.map((c) => box(pose, c));
    expect(xs[0].maxX).toBeLessThan(xs[1].minX + 1e-6);
  });
  it('frames Conditions from behind and above, the crew centre-right, the camera over the clearing or a track', () => {
    const pose = conditionsShot(stand, ground);
    const crew = crewFor('conditions', stand).map((c) => box(pose, c));
    const mid = (crew[0].minX + crew[2].maxX) / 2;
    expect(mid / W).toBeGreaterThan(0.45);
    expect(mid / W).toBeLessThan(0.75);
    // Over the clearing, a corridor or their worn edge (3.8 m inland of the stand spot is just past the clearing's 2.5 m half-width).
    expect(net.worn(pose.position[0], pose.position[2])).toBeGreaterThan(0);
    expect(pose.position[1]).toBeGreaterThan(ground(pose.position[0], pose.position[2]) + 0.4);
  });
  for (const focus of ['male', 'female', 'grommet'] as const) {
    it(`frames ${focus} in Choose your rider: the left third, the head high, the other two outside the frame or behind the panel`, () => {
      const crew = crewFor('rider', stand), me = crew.find((c) => c.preset === focus)!;
      const pose = riderShot(me, ground), b = box(pose, me);
      const cx = (b.minX + b.maxX) / 2;
      expect(cx / W).toBeGreaterThan(0.28);
      expect(cx / W).toBeLessThan(0.38);
      expect(b.minY / H).toBeGreaterThan(0.15);
      expect(b.minY / H).toBeLessThan(0.35);
      for (const o of crew.filter((c) => c.preset !== focus)) {
        const ob = box(pose, o);
        const hidden = !ob.inFront || ob.maxX < 0 || ob.minX > W || ob.minX > panelEdge(Math.max(0, ob.minY));
        expect(hidden, `${o.preset} visible at x ${ob.minX.toFixed(0)}–${ob.maxX.toFixed(0)}`).toBe(true);
      }
      expect(pose.position[1]).toBeGreaterThan(ground(pose.position[0], pose.position[2]) + 0.3);
    });
  }
  it('frames the chosen rider alone in Grab your gear, in the left half', () => {
    const me = crewFor('gear', stand).find((c) => c.preset === 'female')!;
    const b = box(gearShot(me, ground), me);
    const cx = (b.minX + b.maxX) / 2;
    expect(cx / W).toBeGreaterThan(0.2);
    expect(cx / W).toBeLessThan(0.42);
  });
  it('eases between shots, the yaw the short way round', () => {
    const a: CameraPose = { mode: 'free', position: [0, 1, 0], yawDeg: 350, pitchDeg: 0 };
    const b: CameraPose = { mode: 'free', position: [10, 3, 0], yawDeg: 10, pitchDeg: -10 };
    expect(easePose(a, b, 0)).toEqual(a);
    expect(easePose(a, b, 1)).toEqual({ ...b, yawDeg: 10 });
    const mid = easePose(a, b, 0.5);
    expect(mid.position[0]).toBeCloseTo(5, 6);
    expect(Math.min(mid.yawDeg, 360 - mid.yawDeg)).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/beatCamera.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/beatCamera.ts
import * as THREE from 'three/webgpu';
import type { CameraPose } from '../dev/momentLink';
import { WOMB_LINEUP } from '../land/tracks';
import { GANG_SPACING_M } from '../surfer/gang';
import { type LandSpot, headingAxes } from '../surfer/placement';
import type { PresetName } from '../surfer/presets';
import { RIDER_ORDER } from './riderCopy';

export interface CrewPlace {
  preset: PresetName;
  x: number;
  z: number;
  headingDeg: number;
}

/** In Choose your rider the crew stand this far apart (ruling: at 1.05 m a neighbour shows at the frame's left edge). */
export const SELECT_SPACING_M = 1.7;
export const CAMERA_FOV_DEG = 60;

export const SHOT = {
  cond: { backM: 3.8, upM: 2.3, yawNudgeDeg: -9 },
  rider: { distM: 2.35, heightM: 0.95, offDeg: 18, atX: 0.33 },
  gear: { distM: 2.1, heightM: 1.35, offDeg: 30, atX: 0.3 },
} as const;

const DEG = Math.PI / 180;

export const stagingReady = (land: { trackNetwork: unknown } | null): boolean => !!land && !!land.trackNetwork;

/**
 * The crew's places by beat. Both beats' cameras look seaward, so the crew's order on screen is the same in each:
 * T-Bone, Shazza, Grommet left to right (the roster's order). Conditions: facing the sea, side by side. Choose your
 * rider and Grab your gear: turned to face inland and spread 1.7 m apart, the outer two side-stepping outward.
 */
export function crewFor(beat: 'conditions' | 'rider' | 'gear', stand: LandSpot): CrewPlace[] {
  if (beat === 'conditions') {
    const heading = (stand.headingDeg + 180) % 360, { right } = headingAxes(heading);
    const at = (k: number) => ({ x: stand.x + right[0] * k * GANG_SPACING_M, z: stand.z + right[1] * k * GANG_SPACING_M });
    // From behind, the screen's left is the crew's left (−right).
    return [
      { preset: 'male', ...at(-1), headingDeg: heading },
      { preset: 'female', ...at(0), headingDeg: heading },
      { preset: 'grommet', ...at(1), headingDeg: heading },
    ];
  }
  // Facing inland, the camera in front of them: their right is the screen's left.
  const heading = stand.headingDeg, { right } = headingAxes(heading);
  return RIDER_ORDER.map((preset, i) => {
    const k = 1 - i; // T-Bone +1 (screen left), Shazza 0, Grommet −1
    return { preset, x: stand.x + right[0] * k * SELECT_SPACING_M, z: stand.z + right[1] * k * SELECT_SPACING_M, headingDeg: heading };
  });
}

const aim = (from: readonly number[], to: readonly number[]): { yawDeg: number; pitchDeg: number } => {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yawDeg: ((Math.atan2(dx, -dz) / DEG) % 360 + 360) % 360, pitchDeg: Math.atan2(dy, Math.hypot(dx, dz)) / DEG };
};

/** The yaw past a subject that puts it at `atX` of the frame's width (60° vertical field, 16:9). */
const offsetFor = (atX: number): number => Math.atan((0.5 - atX) * 2 * Math.tan((CAMERA_FOV_DEG / 2) * DEG) * (16 / 9)) / DEG;

/** Conditions: 3.8 m behind and 2.3 m above the crew's centre, looking at the lineup, the crew centre-right. */
export function conditionsShot(stand: LandSpot, ground: (x: number, z: number) => number, lineup: { x: number; z: number } = WOMB_LINEUP): CameraPose {
  const { fwd } = headingAxes(stand.headingDeg); // the stand spot faces inland: behind the crew (facing the sea) is along it
  const x = stand.x + fwd[0] * SHOT.cond.backM, z = stand.z + fwd[1] * SHOT.cond.backM;
  const y = Math.max(ground(stand.x, stand.z) + SHOT.cond.upM, ground(x, z) + 0.6);
  const a = aim([x, y, z], [lineup.x, 0, lineup.z]);
  return { mode: 'free', position: [x, y, z], yawDeg: (a.yawDeg + SHOT.cond.yawNudgeDeg + 360) % 360, pitchDeg: a.pitchDeg - 2 };
}

function portrait(place: CrewPlace, ground: (x: number, z: number) => number, s: { distM: number; heightM: number; offDeg: number; atX: number }, chestM: number): CameraPose {
  const h = (place.headingDeg + s.offDeg) * DEG;
  const x = place.x + Math.sin(h) * s.distM, z = place.z - Math.cos(h) * s.distM;
  const g = ground(place.x, place.z), y = Math.max(g + s.heightM, ground(x, z) + 0.4);
  const a = aim([x, y, z], [place.x, g + chestM, place.z]);
  return { mode: 'free', position: [x, y, z], yawDeg: (a.yawDeg + offsetFor(s.atX) + 360) % 360, pitchDeg: a.pitchDeg };
}

/** Choose your rider: 2.35 m away at 0.95 m, 18° off their facing, the rider in the left third (spec §4.2). */
export const riderShot = (place: CrewPlace, ground: (x: number, z: number) => number): CameraPose => portrait(place, ground, SHOT.rider, 1.0);

/** Grab your gear: a close 3/4 at 2.1 m, 1.35 m high, 30° off their facing, in the left half (spec §4.3). */
export const gearShot = (place: CrewPlace, ground: (x: number, z: number) => number): CameraPose => portrait(place, ground, SHOT.gear, 0.95);

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Between two shots, eased in and out, the yaw the short way round. */
export function easePose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  if (t <= 0) return a;
  const k = ease(Math.min(1, t));
  const dy = ((b.yawDeg - a.yawDeg + 540) % 360) - 180;
  const lerp = (p: number, q: number): number => p + (q - p) * k;
  return {
    mode: b.mode,
    position: [lerp(a.position[0], b.position[0]), lerp(a.position[1], b.position[1]), lerp(a.position[2], b.position[2])],
    yawDeg: (((a.yawDeg + dy * k) % 360) + 360) % 360,
    pitchDeg: lerp(a.pitchDeg, b.pitchDeg),
  };
}

/** A camera at a pose (CameraRig's convention: yaw 0 looks along −z, 90 along +x; pitch up positive). */
export function poseCamera(pose: CameraPose, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, aspect, 0.05, 2000);
  const [x, y, z] = pose.position, yaw = pose.yawDeg * DEG, pitch = pose.pitchDeg * DEG;
  cam.position.set(x, y, z);
  cam.lookAt(x + Math.sin(yaw) * Math.cos(pitch), y + Math.sin(pitch), z - Math.cos(yaw) * Math.cos(pitch));
  cam.updateMatrixWorld();
  return cam;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/frontend/beatCamera.test.ts`
Expected: PASS. If a neighbour shows in a rider shot, try `offDeg: -18` (the camera on the other side of the rider's facing) before touching the spacing. If neither clears, raise `SELECT_SPACING_M` in 0.1 m steps and ledger the value as a ruling. Check `CameraRig.ts` uses the same yaw convention as `poseCamera`; the dune-up-close budget harness's `aim()` used it.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/beatCamera.ts src/frontend/beatCamera.test.ts
git commit -m "feat(frontend): the beats' camera shots and the crew's places (re-formed 1.7 m apart on the turn so the panel hides the other two)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: The `selectStand` pose: three stances with character

**Files:**
- Create: `src/surfer/poseTestKit.ts` (test-only helpers moved out of `carry.test.ts`)
- Modify: `src/surfer/carry.test.ts` (import the kit instead of its local helpers)
- Modify: `src/surfer/poseNames.ts`, `src/surfer/poses.ts`, `src/surfer/rideState.ts`, `src/surfer/faceControl.ts`, `src/surfer/SurferStand.ts`
- Test: `src/surfer/selectStand.test.ts`

**Interfaces:**
- Consumes: `carry(ctx, r)` and its helpers in `poses.ts`; `boardBoxes`, `distanceToBoxes`, `carriedBoard`, `LIMB_RADIUS`, `PACK_PARTS` (`carry.ts`); `solvePose`, `boardQuaternion` (`solvePose.ts`); `flexDeg` (`ik.ts`); `glbJson`, `glbFloats` (`glbData.ts`).
- Produces:
  - `PoseName` gains `'selectStand'`, and `LAND_POSES = ['carry', 'selectStand']`
  - `PoseContext.who?: PresetName`
  - `isCarryPose(pose: PoseName): boolean` (exported from `poseNames.ts`)
  - the stand passes `who: p.preset` and treats `selectStand` as a carry
  - `poseTestKit.ts`: `NAMES`, `DIALS`, `builtRest(name)`, `standCases()`, `GROUND`, `Qg`, `toW(v)`, `solveStand(pose, c, phaseT?, lookYawDeg?, reach?)`, `depthIn(p, boxes)`, `packPoints(name, parts?)`

- [ ] **Step 1: Move the carry test's helpers into a shared test kit**

Create `src/surfer/poseTestKit.ts`. Move `DIALS`, `NAMES`, `builtRest`, `cases` (renamed `standCases`), the tilted `ground` frame (renamed `GROUND`), `Qg`, `toW`, `depthIn` and `packPoints` out of `carry.test.ts` unchanged, and add one generalised solver:

```ts
// src/surfer/poseTestKit.ts (test-only: imported by *.test.ts files, never by the game)
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { layoutFor } from '../board/boardSpec';
import { type Box, PACK_PARTS, carriedBoard } from './carry';
import { glbFloats, glbJson } from './glbData';
import { groundFrame } from './placement';
import type { PoseName } from './poseNames';
import { poseTargets } from './poses';
import { PRESETS, type PresetName, boardFor, boardsFor } from './presets';
import { BONES, type BoneName, type Limb, type SkeletonRest, type SurferManifest, referenceSkeleton, restFromManifest } from './rig';
import { boardQuaternion, solvePose } from './solvePose';

export const DIALS = { compression: 0, lean: 0, twist: 0, reach: 0 };
export const NAMES: PresetName[] = ['female', 'male', 'grommet'];

export function builtRest(name: PresetName): SkeletonRest {
  const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
  return restFromManifest(man, Object.fromEntries(BONES.map((b) => [b, new Quaternion()])) as Record<BoneName, Quaternion>);
}

export type StandCase = { tag: string; name: PresetName; rest: SkeletonRest; kind: ReturnType<typeof boardsFor>[number]; side: Limb };

/** Every rider × skeleton (reference, built) × board × side. */
export function standCases(): StandCase[] {
  const out: StandCase[] = [];
  for (const name of NAMES) for (const [skel, rest] of [['ref', referenceSkeleton(PRESETS[name].heightM)], ['built', builtRest(name)]] as const)
    for (const kind of boardsFor(PRESETS[name])) for (const side of ['l', 'r'] as Limb[]) out.push({ tag: `${name} ${skel} ${kind} ${side}`, name, rest, kind, side });
  return out;
}

/** A tilted-heading ground frame (the carry's Review Focus 5). */
export const GROUND = groundFrame({ x: 5, z: -2, headingDeg: 137, heightNudgeM: 0, pitchNudgeDeg: 0 }, 3, 0, 0);
export const Qg = boardQuaternion(GROUND);
export const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qg).add(GROUND.position);

/** A land pose solved for one case: the targets, the solve, and the carried board. */
export function solveStand(pose: PoseName, c: StandCase, phaseT = 0, lookYawDeg = 0, reach = 0) {
  const spec = boardFor(PRESETS[c.name], c.kind);
  const t = poseTargets(pose, { spec, layout: layoutFor(spec, c.rest.heightM), rest: c.rest, stance: 'regular', dials: { ...DIALS, reach }, phaseT, carrySide: c.side, who: c.name });
  const look = t.look.clone().applyAxisAngle(new Vector3(0, 1, 0), (lookYawDeg * Math.PI) / 180).applyQuaternion(Qg);
  const head = toW(c.rest.joint.head);
  const s = solvePose(c.rest, t, GROUND, head.add(look.multiplyScalar(10)));
  return { spec, t, s, board: carriedBoard(t.carry!, GROUND, s) };
}

/** How deep a point is inside the board (0 outside). */
export function depthIn(p: Vector3, boxes: readonly Box[]): number {
  let deepest = 0;
  for (const b of boxes) {
    const d = p.clone().sub(b.centre);
    let inside = Infinity;
    for (let k = 0; k < 3; k++) inside = Math.min(inside, b.half[k] - Math.abs(d.dot(b.axes[k])));
    deepest = Math.max(deepest, inside);
  }
  return deepest;
}

/** A rider's pack and what's on it, rest pose (glTF axes), from the built glb. */
export function packPoints(name: PresetName, parts: readonly string[] = PACK_PARTS): number[][] {
  const path = `public/surfer/${name}.glb`, gltf = glbJson(path), out: number[][] = [];
  for (const m of gltf.meshes) for (const p of m.primitives) {
    if (!parts.includes(gltf.materials[p.material].name)) continue;
    const f = glbFloats(path, gltf, p.attributes.POSITION);
    for (let i = 0; i < f.length; i += 3) out.push([f[i], f[i + 1], f[i + 2]]);
  }
  return out;
}
```

In `carry.test.ts`:
- delete the moved definitions;
- import them from `./poseTestKit`;
- replace `cases()` with `standCases()`, and `ground` with `GROUND`;
- make `solveCarry(c, look)` call `solveStand('carry', c, 0, look)`.

The `who` field in `solveStand` won't type-check until Step 4. Vitest strips types, so the carry tests still run.

- [ ] **Step 2: Write the failing test**

```ts
// src/surfer/selectStand.test.ts
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { LIMB_RADIUS, PACK_PARTS, boardBoxes, distanceToBoxes } from './carry';
import { flexDeg } from './ik';
import { LAND_POSES, isCarryPose, posesOn } from './poseNames';
import { builtRest, depthIn, packPoints, solveStand, standCases, toW } from './poseTestKit';
import { PRESETS, boardsFor } from './presets';
import type { BoneName, Limb } from './rig';

describe('selectStand (dune select spec §13): natural, cool, every rider, board and side, at rest', () => {
  it('is a land pose that carries the board', () => {
    expect(LAND_POSES).toContain('selectStand');
    expect(posesOn('thruster', true)).toContain('selectStand');
    expect(posesOn('thruster', false)).not.toContain('selectStand');
    expect(isCarryPose('selectStand')).toBe(true);
    expect(isCarryPose('carry')).toBe(true);
    expect(isCarryPose('trim')).toBe(false);
  });
  for (const c of standCases()) {
    it(c.tag, () => {
      const { spec, t, s, board } = solveStand('selectStand', c, 0);
      const H = c.rest.heightM, side = c.side, free: Limb = side === 'l' ? 'r' : 'l';
      expect(s.joint[`hand_${side}`].distanceTo(toW(t.carry!.hand)), 'hand to the board').toBeLessThan(0.02);
      const boxes = boardBoxes(board, spec), pressed = 0.005 / H;
      const seg = (a: BoneName, b: BoneName): number => distanceToBoxes(s.joint[a], s.joint[b], boxes);
      const clear: [BoneName, BoneName, number][] = [
        ['pelvis', 'spine_03', LIMB_RADIUS.torso - pressed], ['thigh_l', 'shin_l', LIMB_RADIUS.thigh], ['thigh_r', 'shin_r', LIMB_RADIUS.thigh],
        ['shin_l', 'foot_l', LIMB_RADIUS.shin], ['shin_r', 'foot_r', LIMB_RADIUS.shin],
        [`upperarm_${side}`, `forearm_${side}`, LIMB_RADIUS.upperarm - pressed], [`forearm_${side}`, `hand_${side}`, LIMB_RADIUS.forearm - pressed],
        [`upperarm_${free}`, `forearm_${free}`, LIMB_RADIUS.upperarm],
      ];
      // Grommet's free hand rests on his bodyboard's nose (the hug): the hand may touch it; everyone else's stays clear.
      if (c.name !== 'grommet') clear.push([`forearm_${free}`, `hand_${free}`, LIMB_RADIUS.forearm]);
      for (const [a, b, r] of clear) expect(seg(a, b), `${a}–${b} clear of the board`).toBeGreaterThanOrEqual(r * H);
      // Contrapposto: the hips counter-tilted 4–8°.
      const tilt = (Math.asin(Math.min(1, Math.hypot(t.pelvisUp.x, t.pelvisUp.z) / t.pelvisUp.length())) * 180) / Math.PI;
      expect(tilt).toBeGreaterThanOrEqual(4);
      expect(tilt).toBeLessThanOrEqual(8);
      // The standing knee near straight, the free one soft, the ankles where they're put.
      for (const l of ['l', 'r'] as const) {
        expect(flexDeg(s.joint[`thigh_${l}`], s.joint[`shin_${l}`], s.joint[`foot_${l}`]), `knee ${l}`).toBeLessThanOrEqual(30);
        expect(s.joint[`foot_${l}`].distanceTo(toW(t.feet[l].ankle)), `ankle ${l}`).toBeLessThan(0.012);
      }
      // The free hand clear of the head and its own thigh (everything renders).
      expect(s.joint[`hand_${free}`].distanceTo(s.joint.head), 'free hand off the head').toBeGreaterThan(0.09);
      const a = s.joint[`thigh_${free}`], b = s.joint[`shin_${free}`], ab = b.clone().sub(a), p = s.joint[`hand_${free}`];
      const k = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
      expect(p.distanceTo(a.clone().add(ab.multiplyScalar(k))), 'free hand off the thigh').toBeGreaterThan((LIMB_RADIUS.thigh + 0.4 * LIMB_RADIUS.forearm) * H);
    });
  }
  it('gives each rider their own stance', () => {
    const pick = (name: string, kind: string, side: string) => standCases().find((c) => c.name === name && c.kind === kind && c.side === side)!;
    const t = solveStand('selectStand', pick('male', 'thruster', 'r')).t;
    const z = solveStand('selectStand', pick('female', 'thruster', 'r')).t;
    const g = solveStand('selectStand', pick('grommet', 'bodyboard', 'l')).t;
    expect(t.look.y).toBeGreaterThan(z.look.y);                         // T-Bone's chin up
    expect(t.pelvis.x).toBeLessThan(z.pelvis.x);                        // his weight back
    expect(g.feet.l.ankle.y).toBeGreaterThan(z.feet.l.ankle.y + 0.015); // Grommet up on his toes
  });
  it('keeps the tucked board clear of the rider\'s own pack', () => {
    for (const name of ['female', 'male', 'grommet'] as const) for (const kind of boardsFor(PRESETS[name])) for (const side of ['l', 'r'] as Limb[]) {
      const rest = builtRest(name);
      const { s, board, spec } = solveStand('selectStand', { tag: '', name, rest, kind, side });
      const boxes = boardBoxes(board, spec), R = s.world.spine_03, at = rest.joint.spine_03;
      const bag = packPoints(name, PACK_PARTS.filter((m) => m !== 'packTrim'));
      const deepest = Math.max(0, ...bag.map((q) => depthIn(new Vector3(...q).sub(at).applyQuaternion(R).add(s.joint.spine_03), boxes)));
      expect(deepest, `${name} ${kind} ${side}`).toBeLessThan(0.005);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/surfer/selectStand.test.ts src/surfer/carry.test.ts`
Expected: FAIL in `selectStand.test.ts` (`isCarryPose` and `'selectStand'` don't exist). `carry.test.ts` still PASSES through the kit.

- [ ] **Step 4: Write the implementation**

`src/surfer/poseNames.ts`: add `'selectStand'` to the `PoseName` union, set `LAND_POSES = ['carry', 'selectStand'] as const`, and add:

```ts
/** Land poses with the board under the arm (the stand anchors the board to the solved hand). */
export const isCarryPose = (pose: PoseName): boolean => pose === 'carry' || pose === 'selectStand';
```

`src/surfer/rideState.ts`: `POSE_PHASE.selectStand = 'sit'`, `POSE_ZONE.selectStand = 'flats'`. `src/surfer/faceControl.ts`: `EXERTION.selectStand = 0`.

`src/surfer/poses.ts` (add `import type { PresetName } from './presets';`):

```ts
// PoseContext gains:
  /** Which rider (the select stance's character, dune select spec §13). */
  who?: PresetName;

// carry gains a tuck: the board this much closer to the body (selectStand: "tucked close under the carry arm").
function carry(ctx: PoseContext, r: Rider, tuck = 0): PoseTargets {
  // … unchanged, except this line:
  const botLat = m.hipHalf + LIMB_RADIUS.thigh * H + CARRY_HIP_CLEAR + t / 2 - tuck;
  // … unchanged
}

/** How close selectStand tucks the board (m): tuned against the thigh and pack clearances. */
const SELECT_TUCK = 0.012;

/**
 * The select screen's stance (dune select spec §13): the carry's contacts kept, the board tucked closer, weight on one
 * leg with the other knee soft (contrapposto), hips and shoulders counter-tilted. Each rider has their own character:
 * T-Bone loose and confident (weight back, chin up, the free hand hooked at the boardies' pocket); Shazza relaxed and
 * poised (the hip out, the free hand loose at the thigh); Grommet bouncy (up on his toes, the free hand on the
 * bodyboard's nose, hugging it). Tuned at Gate A.
 */
function selectStand(ctx: PoseContext, r: Rider): PoseTargets {
  const t = carry({ ...ctx, dials: { ...ctx.dials, reach: 0 } }, r, SELECT_TUCK);
  const side = t.carry!.side, free: Limb = side === 'l' ? 'r' : 'l', k = side === 'l' ? -1 : 1;
  const who = ctx.who ?? 'female', m = r.m, rest = ctx.rest;
  const hipY = rest.joint[`thigh_${free}`].y;
  // Weight over the carrying side's leg; the free hip drops 6°, the shoulders lean the other way.
  t.pelvis.add(V(0, -0.012, k * 0.03));
  const tilt = 6 * DEG;
  t.pelvisUp = V(0, Math.cos(tilt), -k * Math.sin(tilt));
  t.chest = { ...t.chest, side: k * 0.06 };
  // The free leg's knee soft: the foot a little ahead and out, the heel just off the sand.
  const fr = t.feet[free];
  fr.ankle.add(V(0.07, 0.012, -k * 0.03));
  fr.toe.add(V(0.07, 0, -k * 0.03));
  let hand = boardHand(V(0.02, hipY - 0.24, -k * (m.hipHalf + 0.075)), V(-1, 0, -k * 0.2).normalize());
  if (who === 'male') {
    t.pelvis.x -= 0.025;
    t.look = add(X(), sc(Y(), 0.06));
    hand = boardHand(V(0.06, hipY - 0.05, -k * (m.hipHalf + 0.07)), V(-1, 0, -k * 0.6).normalize());
  } else if (who === 'female') {
    t.pelvis.z += k * 0.015;
  } else {
    for (const l of ['l', 'r'] as const) t.feet[l].ankle.y += 0.022;
    t.pelvis.y += 0.02;
    const b = t.carry!.board;
    const nose = b.position.clone().add(sc(b.forward.clone().normalize(), ctx.spec.lengthM / 2 - 0.06)).add(sc(b.up.clone().normalize(), ctx.spec.thicknessM));
    hand = boardHand(nose, V(-0.5, 0, -k).normalize());
  }
  t.hands[free] = hand;
  return t;
}

// poseTargets' switch:
    case 'selectStand': return selectStand(ctx, r);
```

`src/surfer/SurferStand.ts`:
- `carrying = p.onLand && isCarryPose(p.pose)`;
- pass `who: p.preset` in the `poseTargets` call.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/surfer/selectStand.test.ts src/surfer/carry.test.ts src/surfer/solvePose.test.ts`
Expected: PASS.
- If a thigh or pack clearance fails, lower `SELECT_TUCK` in 0.004 m steps (0 is the carry's own clearance) and ledger the value.
- If Grommet's hug puts his forearm through his torso, move the nose target 0.05 m forward, or fall back to the loose hand and ledger it. He must render.
- If the tilt reads outside 4–8°, the `pelvisUp` construction is off; check its length is 1.

- [ ] **Step 6: Commit**

```bash
git add src/surfer/poseTestKit.ts src/surfer/carry.test.ts src/surfer/selectStand.test.ts src/surfer/poseNames.ts src/surfer/poses.ts src/surfer/rideState.ts src/surfer/faceControl.ts src/surfer/SurferStand.ts
git commit -m "feat(surfer): selectStand, the select screen's stance: contrapposto, the board tucked close, T-Bone loose, Shazza poised, Grommet bouncy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The stances' idle loops

**Files:**
- Modify: `src/surfer/poses.ts` (`selectStand` reads `phaseT`), `src/surfer/surferParams.ts` (`playPhase` takes the preset), `src/surfer/SurferStand.ts` (passes it)
- Test: `src/surfer/selectStand.test.ts` (append)

**Interfaces:**
- Consumes: Task 9's `selectStand`, `solveStand`.
- Produces:
  - `SELECT_IDLE_S: Record<PresetName, number> = { female: 7, male: 6, grommet: 4 }` (exported from `poses.ts`)
  - `playPhase(pose, simTime, sliderT, preset?: PresetName): number` (selectStand cycles at its rider's length)
  - `PoseContext.glasses?: boolean` (default true; the stand passes `wearsClothes(outfit)`, since glasses come with the walking clothes)

- [ ] **Step 1: Write the failing test** (append to `src/surfer/selectStand.test.ts`; merge the new imports into the file's import block)

```ts
import { layoutFor } from '../board/boardSpec';
import { DIALS } from './poseTestKit';
import { SELECT_IDLE_S, poseTargets } from './poses';
import { playPhase } from './surferParams';

describe('the select stances\' idles (spec §13: 4–8 s loops with small secondary motion)', () => {
  const pick = (name: string, kind: string, side: string) => standCases().find((c) => c.name === name && c.kind === kind && c.side === side)!;
  it('cycles each rider\'s loop at its own length', () => {
    expect(SELECT_IDLE_S).toEqual({ female: 7, male: 6, grommet: 4 });
    expect(playPhase('selectStand', 3.5, 0, 'female')).toBeCloseTo(0.5, 9);
    expect(playPhase('selectStand', 6, 0, 'male')).toBeCloseTo(0, 9);
    expect(playPhase('selectStand', 1, 0, 'grommet')).toBeCloseTo(0.25, 9);
  });
  it('lifts Shazza\'s hand to tuck her hair behind her ear mid-loop, and back', () => {
    const c = pick('female', 'thruster', 'r'); // carrying right: her free hand is the left
    const rest0 = solveStand('selectStand', c, 0).s, tuck = solveStand('selectStand', c, 0.46).s;
    expect(tuck.joint.hand_l.y).toBeGreaterThan(rest0.joint.hand_l.y + 0.4);
    expect(tuck.joint.hand_l.distanceTo(tuck.joint.head)).toBeLessThan(0.2);
    expect(solveStand('selectStand', c, 0.99).s.joint.hand_l.distanceTo(rest0.joint.hand_l)).toBeLessThan(0.03);
  });
  it('bounces Grommet on his toes and has him push his glasses up', () => {
    const c = pick('grommet', 'bodyboard', 'l'); // carrying left: his free hand is the right
    const ys = [0, 0.125, 0.25, 0.375].map((p) => solveStand('selectStand', c, p).t.pelvis.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.008);
    const push = solveStand('selectStand', c, 0.69).s;
    expect(push.joint.hand_r.distanceTo(push.joint.head)).toBeLessThan(0.22);
  });
  it('leaves Grommet\'s hand down when he isn\'t wearing his glasses (a surf outfit on the Outfit tab)', () => {
    const c = pick('grommet', 'bodyboard', 'l');
    const spec = solveStand('selectStand', c, 0.69);
    const t = poseTargets('selectStand', { spec: spec.spec, layout: layoutFor(spec.spec, c.rest.heightM), rest: c.rest, stance: 'regular', dials: DIALS, phaseT: 0.69, carrySide: c.side, who: c.name, glasses: false });
    expect(t.hands.r.pos.y).toBeLessThan(spec.t.hands.r.pos.y - 0.2);
  });
  it('rolls T-Bone\'s shoulder', () => {
    const c = pick('male', 'thruster', 'r');
    expect(Math.abs(solveStand('selectStand', c, 0.3).t.chest.twist - solveStand('selectStand', c, 0).t.chest.twist)).toBeGreaterThan(0.04);
  });
  it('renders through the whole loop: every case, every 5% of it, limbs clear of the board, the hand off the head', () => {
    for (const c of standCases()) for (let ph = 0; ph < 1; ph += 0.05) {
      const { s, board, spec, t } = solveStand('selectStand', c, ph);
      const H = c.rest.heightM, free: Limb = c.side === 'l' ? 'r' : 'l', boxes = boardBoxes(board, spec), at = `${c.tag} @${ph.toFixed(2)}`;
      expect(s.joint[`hand_${c.side}`].distanceTo(toW(t.carry!.hand)), `${at} hand`).toBeLessThan(0.02);
      expect(distanceToBoxes(s.joint[`upperarm_${free}`], s.joint[`forearm_${free}`], boxes), `${at} free arm`).toBeGreaterThanOrEqual(LIMB_RADIUS.upperarm * H);
      expect(s.joint[`hand_${free}`].distanceTo(s.joint.head), `${at} hand off the head`).toBeGreaterThan(0.09);
      expect(distanceToBoxes(s.joint.pelvis, s.joint.spine_03, boxes), `${at} torso`).toBeGreaterThanOrEqual((LIMB_RADIUS.torso - 0.005 / H) * H);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/surfer/selectStand.test.ts`
Expected: FAIL. `SELECT_IDLE_S` isn't exported, and the stance doesn't move with `phaseT`.

- [ ] **Step 3: Write the implementation**

In `src/surfer/poses.ts`:

```ts
/** Each rider's select idle loop (s), dune select spec §13. */
export const SELECT_IDLE_S: Record<PresetName, number> = { female: 7, male: 6, grommet: 4 };

/** 0 outside (a, b), easing up to 1 at their middle and back down: a gesture inside the loop. */
const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI) ** 2);
```

In `selectStand`, after the character block and before `t.hands[free] = hand`, add the idles:

```ts
  const ph = ((ctx.phaseT % 1) + 1) % 1, headY = rest.joint.head.y;
  if (who === 'male') {
    // T-Bone rolls a shoulder.
    const roll = bump(ph, 0.15, 0.45);
    t.chest = { ...t.chest, twist: t.chest.twist + 0.07 * roll, bend: t.chest.bend + 0.03 * roll };
  } else if (who === 'female') {
    // Shazza tucks her hair behind her ear: the hand up beside the head (outside it), the elbow out.
    const tuck = bump(ph, 0.3, 0.62);
    if (tuck > 0) hand = boardHand(hand.pos.clone().lerp(V(0, headY + 0.015, -k * 0.13), tuck), hand.pole.clone().lerp(V(0, -0.2, -k), tuck).normalize());
  } else {
    // Grommet bounces on his toes and pushes his glasses up.
    const bounce = (0.012 * (1 - Math.cos(ph * 4 * Math.PI))) / 2;
    for (const l of ['l', 'r'] as const) t.feet[l].ankle.y += bounce;
    t.pelvis.y += bounce;
    // Only when he's wearing them: glasses come with the walking clothes (wardrobe landLook), not the Outfit tab's surf outfits.
    const push = ctx.glasses === false ? 0 : bump(ph, 0.6, 0.78);
    if (push > 0) hand = boardHand(hand.pos.clone().lerp(V(0.13, headY + 0.03, 0), push), hand.pole.clone().lerp(V(0, -1, -k * 0.3), push).normalize());
  }
```

In `src/surfer/surferParams.ts` (import `SELECT_IDLE_S` from `./poses` and `PresetName` from `./presets`):

```ts
export function playPhase(pose: PoseName, simTime: number, sliderT: number, preset?: PresetName): number {
  if (pose === 'paddle') return (((simTime / PADDLE_CYCLE_S) % 1) + 1) % 1;
  if (pose === 'popup') return Math.min(1, ((((simTime % POPUP_LOOP_S) + POPUP_LOOP_S) % POPUP_LOOP_S) / POPUP_S));
  if (pose === 'selectStand' && preset) return (((simTime / SELECT_IDLE_S[preset]) % 1) + 1) % 1;
  return sliderT;
}
```

If importing `poses.ts` from `surferParams.ts` makes a cycle that breaks a test, move `SELECT_IDLE_S` into `poseNames.ts` (no imports there) and import it in both.

In `src/surfer/poses.ts`, `PoseContext` gains `glasses?: boolean` ("he has his glasses on: the walking clothes"). In `SurferStand.update`:
- `const phaseT = p.play ? playPhase(p.pose, simTime, p.phaseT, p.preset) : p.phaseT;`;
- pass `glasses: wearsClothes(outfit)` in the `poseTargets` call.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/surfer`
Expected: PASS for the whole surfer suite (nothing else changes). If the loop sweep finds a hand inside the head at some phase, move that gesture's target out by 0.02 m.

- [ ] **Step 5: Commit**

```bash
git add src/surfer/poses.ts src/surfer/surferParams.ts src/surfer/SurferStand.ts src/surfer/selectStand.test.ts
git commit -m "feat(surfer): the select stances' idles: T-Bone rolls a shoulder, Shazza tucks her hair, Grommet bounces and pushes his glasses up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Authored select expressions

**Files:**
- Modify: `src/surfer/faceControl.ts`, `src/surfer/surferParams.ts` (the `expression` field, its default, sanitising), `src/surfer/SurferStand.ts` (applies it)
- Test: `src/surfer/expressions.test.ts`

**Interfaces:**
- Consumes: `FaceState`, `FaceChannel` (`idleLife.ts`); `applyFaceParams`, `restingFace`.
- Produces:
  - `type SelectExpression = 'none' | 'grin' | 'stoked' | 'easy'`
  - `SELECT_EXPRESSIONS: Record<PresetName, Record<Exclude<SelectExpression, 'none'>, Partial<Record<FaceChannel, number>>>>`
  - `withExpression(face, preset, e): FaceState`
  - `SurferParams.expression: SelectExpression` (default `'none'`)

- [ ] **Step 1: Write the failing test**

```ts
// src/surfer/expressions.test.ts
import { describe, expect, it } from 'vitest';
import { SELECT_EXPRESSIONS, restingFace, withExpression } from './faceControl';
import { DEFAULT_SURFER_PARAMS, sanitizeSurferParams } from './surferParams';

const NAMES = ['female', 'male', 'grommet'] as const;

describe('the select expressions (dune select spec §13.1: authored, symmetric, never raw dial mixes)', () => {
  it('has grin, stoked and easy for every rider, inside 0–1, stoked the biggest smile and easy the smallest', () => {
    for (const n of NAMES) {
      const e = SELECT_EXPRESSIONS[n];
      for (const k of ['grin', 'stoked', 'easy'] as const) for (const v of Object.values(e[k])) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      expect(e.stoked.smile!).toBeGreaterThan(e.grin.smile!);
      expect(e.grin.smile!).toBeGreaterThan(e.easy.smile!);
      expect(e.grin.squint!).toBeGreaterThan(0); // the eyes engaged
    }
  });
  it('keeps the face symmetric: an expression never sets one eye apart from the other', () => {
    for (const n of NAMES) for (const k of ['grin', 'stoked', 'easy'] as const) {
      const f = withExpression({ ...restingFace(), blinkL: 0.3, blinkR: 0.3 }, n, k);
      expect(f.blinkL).toBe(f.blinkR);
      expect('blinkL' in SELECT_EXPRESSIONS[n][k] || 'blinkR' in SELECT_EXPRESSIONS[n][k]).toBe(false);
    }
  });
  it('leaves the face alone on none, and keeps idle life\'s breathing and gaze under an expression', () => {
    const idle = { ...restingFace(), breathe: 0.4, gazeYawDeg: 3 };
    expect(withExpression(idle, 'female', 'none')).toEqual(idle);
    const g = withExpression(idle, 'female', 'grin');
    expect(g.breathe).toBe(0.4);
    expect(g.gazeYawDeg).toBe(3);
  });
  it('is a surfer param, sanitised', () => {
    expect(DEFAULT_SURFER_PARAMS.expression).toBe('none');
    expect(sanitizeSurferParams({ ...DEFAULT_SURFER_PARAMS, expression: 'grin' }).expression).toBe('grin');
    expect(sanitizeSurferParams({ ...DEFAULT_SURFER_PARAMS, expression: 'smirk' }).expression).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/surfer/expressions.test.ts`
Expected: FAIL. `SELECT_EXPRESSIONS` doesn't exist.

- [ ] **Step 3: Write the implementation**

In `src/surfer/faceControl.ts`:

```ts
export type SelectExpression = 'none' | 'grin' | 'stoked' | 'easy';

/**
 * The select screen's faces (dune select spec §13.1), authored per rider from the rig's face channels (no left/right
 * channel is ever set apart). grin: a natural, symmetric open smile, eyes engaged (squint and cheek); stoked: the
 * pick; easy: the idle's resting look. Shazza's smile is held lower (her smile unit pulls the mouth wide). Tuned at
 * Gate A's face sheets.
 */
export const SELECT_EXPRESSIONS: Record<PresetName, Record<Exclude<SelectExpression, 'none'>, Partial<Record<FaceChannel, number>>>> = {
  female: { grin: { smile: 0.42, jawOpen: 0.1, squint: 0.22, browsUp: 0.08 }, stoked: { smile: 0.62, jawOpen: 0.22, squint: 0.3, browsUp: 0.3 }, easy: { smile: 0.18, jawOpen: 0.02, squint: 0.06 } },
  male: { grin: { smile: 0.55, jawOpen: 0.12, squint: 0.25, browsUp: 0.1 }, stoked: { smile: 0.8, jawOpen: 0.25, squint: 0.3, browsUp: 0.35 }, easy: { smile: 0.22, jawOpen: 0.02, squint: 0.08 } },
  grommet: { grin: { smile: 0.6, jawOpen: 0.16, squint: 0.25, browsUp: 0.15 }, stoked: { smile: 0.85, jawOpen: 0.3, squint: 0.32, browsUp: 0.4 }, easy: { smile: 0.3, jawOpen: 0.04, squint: 0.08 } },
};

/** The face with a select expression laid over idle life's (breathing, blinks and gaze stay). */
export function withExpression(face: FaceState, preset: PresetName, e: SelectExpression): FaceState {
  return e === 'none' ? face : { ...face, ...SELECT_EXPRESSIONS[preset][e] };
}
```

In `src/surfer/surferParams.ts`:
- add `expression: SelectExpression` to `SurferParams`;
- set `expression: 'none'` in `DEFAULT_SURFER_PARAMS`;
- in `sanitizeSurferParams`: `expression: oneOf(raw.expression, ['none', 'grin', 'stoked', 'easy'] as const, 'none')`.

In `src/surfer/SurferStand.ts`:

```ts
    const face = withExpression(applyFaceParams(p.idle ? s.idle.tick(dt, ctx) : restingFace(), p), p.preset, p.expression);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/surfer src/dev`
Expected: PASS. `devSettings` round-trips the surfer params, and the new field rides along.

- [ ] **Step 5: Commit**

```bash
git add src/surfer/faceControl.ts src/surfer/surferParams.ts src/surfer/SurferStand.ts src/surfer/expressions.test.ts
git commit -m "feat(surfer): authored select expressions (grin, stoked, easy) per rider, symmetric, over idle life

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Staging the crew: per-rider overrides and the stepping turn

**Files:**
- Create: `src/frontend/staging.ts`
- Modify: `src/surfer/GangLineup.ts` (`stage()`), `src/app/App.ts` (`stageFrontEnd()`: a public hook for the capture scripts and Task 21)
- Test: `src/frontend/staging.test.ts`

**Interfaces:**
- Consumes: Task 8's `crewFor`; Task 6's `FrontState`, `boardOf`, `gearRows`; Task 11's `SelectExpression`; `PoseName`, `OutfitChoice`, `BoardKind`, `PresetName`, `headingAxes`.
- Produces:
  - `interface RiderStaging { visible: boolean; x: number; z: number; headingDeg: number; heightNudgeM: number; pose: PoseName; expression: SelectExpression; reach: number; board: BoardKind; outfit: OutfitChoice | 'walking' }`
  - `type GangStaging = Record<PresetName, RiderStaging>`
  - `TURN_S = 0.8`, `PICK_S = 0.7`
  - `stepTurn(fromDeg, toDeg, t): { headingDeg: number; bobM: number }`
  - `stagingFor(s: FrontState, stand: LandSpot, opts: { turnT: number; pickT: number }): GangStaging`
  - `GangLineup.stage(s: GangStaging | null): void`
  - `App.stageFrontEnd(staging: GangStaging | null, pose: CameraPose | null): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/staging.test.ts
import { describe, expect, it } from 'vitest';
import { crewFor } from './beatCamera';
import { DEFAULT_CHOICES } from './frontSettings';
import { type FrontState, initialFront } from './frontEnd';
import { stagingFor, stepTurn } from './staging';

const stand = { x: 300, z: 50, headingDeg: 90 };
const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), ...patch });
const NONE = { turnT: 1, pickT: 0 };
const angle = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe('staging the crew (dune select spec §4, §13)', () => {
  it('turns in two steps, not a spin, with a little dip each step', () => {
    expect(stepTurn(270, 90, 0)).toEqual({ headingDeg: 270, bobM: 0 });
    expect(angle(stepTurn(270, 90, 1).headingDeg, 90)).toBeLessThan(1e-9);
    expect(angle(stepTurn(270, 90, 0.5).headingDeg, 270)).toBeCloseTo(90, 6); // halfway round after the first step
    expect(stepTurn(270, 90, 0.25).bobM).toBeLessThan(0);
    expect(stepTurn(270, 90, 0.5).bobM).toBeCloseTo(0, 9);
  });
  it('shows all three facing the sea in walking clothes in Conditions, in their select stances', () => {
    const g = stagingFor(front(), stand, NONE);
    for (const n of ['female', 'male', 'grommet'] as const) {
      expect(g[n].visible).toBe(true);
      expect(g[n].headingDeg).toBe(270);
      expect(g[n].pose).toBe('selectStand');
      expect(g[n].outfit).toBe('walking');
    }
    expect(g.male.x).toBe(crewFor('conditions', stand).find((p) => p.preset === 'male')!.x);
  });
  it('faces them inland, spread, the focused rider grinning and the others easy, in Choose your rider', () => {
    const g = stagingFor(front({ beat: 'rider', rider: 'male' }), stand, NONE);
    expect(g.male.expression).toBe('grin');
    expect(g.female.expression).toBe('easy');
    expect(g.grommet.headingDeg).toBe(90);
  });
  it('steps the picked rider forward half a pace, stoked and waving, on the pick', () => {
    const s = front({ beat: 'gear', rider: 'female', move: { from: 'rider', to: 'gear', t: 0.1, durS: 1.6 } });
    const g = stagingFor(s, stand, { turnT: 1, pickT: 0.5 });
    expect(g.female.expression).toBe('stoked');
    expect(g.female.reach).toBeGreaterThan(0.5);
    const place = crewFor('rider', stand).find((p) => p.preset === 'female')!;
    expect(Math.hypot(g.female.x - place.x, g.female.z - place.z)).toBeGreaterThan(0.15);
  });
  it('shows only the chosen rider in Grab your gear, holding the focused board, in the focused outfit on the Outfit tab', () => {
    let g = stagingFor(front({ beat: 'gear', rider: 'female', gearTab: 'board', gearFocus: 1 }), stand, NONE);
    expect(g.female.visible).toBe(true);
    expect(g.male.visible).toBe(false);
    expect(g.grommet.visible).toBe(false);
    expect(g.female.board).toBe('stepUp');
    expect(g.female.outfit).toBe('walking');
    g = stagingFor(front({ beat: 'gear', rider: 'female', gearTab: 'outfit', gearFocus: 2 }), stand, NONE);
    expect(g.female.outfit).toBe('shortArmSteamer');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/staging.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/staging.ts
import type { BoardKind } from '../board/boardSpec';
import type { SelectExpression } from '../surfer/faceControl';
import { type LandSpot, headingAxes } from '../surfer/placement';
import type { PoseName } from '../surfer/poseNames';
import type { PresetName } from '../surfer/presets';
import type { OutfitChoice } from '../surfer/wardrobe';
import { crewFor } from './beatCamera';
import { type FrontState, boardOf, gearRows } from './frontEnd';

export interface RiderStaging {
  visible: boolean;
  x: number;
  z: number;
  headingDeg: number;
  heightNudgeM: number;
  pose: PoseName;
  expression: SelectExpression;
  reach: number;
  board: BoardKind;
  outfit: OutfitChoice | 'walking';
}
export type GangStaging = Record<PresetName, RiderStaging>;

/** The crew's turn to face the camera (spec §13: a stepping turn, not a spin). */
export const TURN_S = 0.8;
/** The pick: half a pace forward with a grin and the wave, before the beat moves on (spec §4.2). */
export const PICK_S = 0.7;

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A turn in two steps (half the angle each, eased), dipping 1.5 cm in each step. A half turn goes the same way each time. */
export function stepTurn(fromDeg: number, toDeg: number, t: number): { headingDeg: number; bobM: number } {
  const c = Math.min(1, Math.max(0, t));
  if (c === 0) return { headingDeg: fromDeg, bobM: 0 };
  const d = ((toDeg - fromDeg + 540) % 360) - 180 || 180;
  const stepT = c < 0.5 ? c / 0.5 : (c - 0.5) / 0.5, done = c < 0.5 ? 0 : 0.5;
  const headingDeg = (((fromDeg + d * (done + 0.5 * ease(stepT))) % 360) + 360) % 360;
  return { headingDeg, bobM: -0.015 * Math.sin(stepT * Math.PI) };
}

const RIDERS: PresetName[] = ['male', 'female', 'grommet'];

/**
 * The crew for a front-end state. Conditions: all three facing the sea in walking clothes. Choose your rider: turned
 * (`turnT` through the turn) and spread, the focused rider grinning. The pick (`pickT`): half a pace forward, stoked,
 * waving. Grab your gear: only the chosen rider, holding the focused board, in the focused surf outfit on the Outfit
 * tab (walking clothes otherwise).
 */
export function stagingFor(s: FrontState, stand: LandSpot, opts: { turnT: number; pickT: number }): GangStaging {
  const toConditions = s.beat === 'conditions';
  const cond = crewFor('conditions', stand), select = crewFor(s.beat === 'gear' ? 'gear' : 'rider', stand);
  const gearSettled = s.beat === 'gear' && !s.move;
  const out = {} as GangStaging;
  for (const n of RIDERS) {
    const c = cond.find((p) => p.preset === n)!, r = select.find((p) => p.preset === n)!;
    const k = toConditions ? 0 : Math.min(1, Math.max(0, opts.turnT));
    const turn = toConditions ? { headingDeg: c.headingDeg, bobM: 0 } : stepTurn(c.headingDeg, r.headingDeg, k);
    let x = c.x + (r.x - c.x) * k, z = c.z + (r.z - c.z) * k;
    const focused = n === s.rider;
    let expression: SelectExpression = toConditions || !focused ? 'easy' : 'grin', reach = 0;
    if (focused && opts.pickT > 0 && opts.pickT < 1) {
      const { fwd } = headingAxes(r.headingDeg), stepK = Math.min(1, opts.pickT * 2);
      x += fwd[0] * 0.35 * stepK;
      z += fwd[1] * 0.35 * stepK;
      expression = 'stoked';
      reach = Math.sin(opts.pickT * Math.PI);
    }
    const rows = gearSettled && focused ? gearRows(s) : [];
    const board = rows.length && s.gearTab === 'board' ? (rows[s.gearFocus] as BoardKind) : boardOf(s, n);
    const outfit = rows.length && s.gearTab === 'outfit' ? (rows[s.gearFocus] as OutfitChoice) : 'walking';
    // In Grab your gear only the chosen rider stays (hidden at the cut: once the move from Choose your rider lands).
    const visible = s.beat !== 'gear' || focused || (s.move !== null && s.move.from === 'rider');
    out[n] = { visible: gearSettled ? focused : visible, x, z, headingDeg: turn.headingDeg, heightNudgeM: turn.bobM, pose: 'selectStand', expression, reach, board, outfit };
  }
  return out;
}
```

In `src/surfer/GangLineup.ts`:

```ts
  private staging: GangStaging | null = null;

  /** The front end's staging (dune select spec §4); null for the plain lineup. */
  stage(s: GangStaging | null): void {
    this.staging = s;
  }

  // update(): when staged, each stand takes its rider's staging instead of the lineup's places.
  update(p: SurferParams, simTime: number, dateISO: string, seed: number, probe: HeightProbe, tideM: number, ground?: (x: number, z: number) => number | null): void {
    const st = this.staging;
    this.group.visible = p.gang || st !== null;
    if (!this.group.visible) return;
    this.places = st
      ? (['female', 'grommet', 'male'] as const).map((n) => ({ preset: n, x: st[n].x, z: st[n].z, headingDeg: st[n].headingDeg, carrySide: PRESETS[n].walking.carrySide }))
      : gangPlaces({ x: p.x, z: p.z, headingDeg: p.headingDeg });
    this.places.forEach((g, i) => {
      const preset = PRESETS[g.preset], r = st?.[g.preset];
      this.stands[i].update({
        ...p, enabled: r ? r.visible : true, preset: g.preset, stance: preset.defaultStance, board: r?.board ?? boardsFor(preset)[0],
        x: g.x, z: g.z, headingDeg: g.headingDeg, onLand: true, outfit: r?.outfit ?? 'walking', pose: r?.pose ?? 'carry', carrySide: g.carrySide,
        expression: r?.expression ?? 'none', reach: r?.reach ?? 0, heightNudgeM: r?.heightNudgeM ?? 0, play: true,
      }, simTime, dateISO, seed, probe, tideM, ground);
    });
  }
```

`GangLineup.spots` already returns `this.places`, so the heath's clearings follow the staged places. Each staged stand is keyed by its preset, so a stand never switches rider mid-staging, and the loader keeps all three loaded.

In `src/app/App.ts` (public, used by the capture scripts now and by Task 21's host):

```ts
  /** Stages the crew and holds the camera (the front end; null releases them). */
  stageFrontEnd(staging: GangStaging | null, pose: CameraPose | null): void {
    this.gang.stage(staging);
    if (pose) this.rig.setPose(pose, this.conditions.tideM);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend src/surfer && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Look at it in the game**

With the `ld-step2` dev server running (port 5177), run in the page console:

```js
const { stagingFor } = await import('/src/frontend/staging.ts');
const { initialFront } = await import('/src/frontend/frontEnd.ts');
const { DEFAULT_CHOICES } = await import('/src/frontend/frontSettings.ts');
const { conditionsShot } = await import('/src/frontend/beatCamera.ts');
const { landSpots } = await import('/src/surfer/placement.ts');
const app = window.liquidDreams, lh = app.land.height, stand = landSpots(lh, lh.profile).standSpot;
app.stageFrontEnd(stagingFor(initialFront(DEFAULT_CHOICES), stand, { turnT: 1, pickT: 0 }), conditionsShot(stand, (x, z) => lh.heightAt(x, z)));
```

Expected: the three facing the sea in their select stances, T-Bone left, Shazza centre, Grommet right, the camera behind them. `read_console_messages` shows no errors.

Then stage Grab your gear on the Outfit tab (`{ ...initialFront(DEFAULT_CHOICES), beat: 'gear', gearTab: 'outfit', gearFocus: 0 }` with `gearShot`).
Expected: Shazza dry, in the bikini, barefoot on the sand, with no hat, glasses or pack. The wardrobe's existing land rules give this (`landLook`: dry on land, glasses and hat only with the walking clothes), so §9's preview needs no new clothing code. If the pack still shows, it's tied to the carry rather than the outfit: hide it with the walking clothes and ledger it.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/staging.ts src/frontend/staging.test.ts src/surfer/GangLineup.ts src/app/App.ts
git commit -m "feat(frontend): staging the crew per beat: the stepping turn, the spread, the pick's step forward, the gear beat's rider alone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Gate A: stances, shots and faces (STOP for Andrew)

**Files:**
- Create: `tools/surfer/previews/select-gateA/` (git-ignored: the frames)
- No source changes unless the gate asks for them.

**Interfaces:**
- Consumes: Tasks 8–12 through `window.liquidDreams`, `stageFrontEnd`, `captureFrame()`; the scratchpad snapshot receiver (`snapsink.py`, port 5199).

- [ ] **Step 1: Capture the beats.** At 1920×1080 (the renderer resized for the capture, then restored, as in the dune-up-close gallery), capture:
- Conditions;
- Choose your rider focused on each of the three;
- Grab your gear for each of the three;
- each at 08:30 and 12:30.

Use the staging and shots from Tasks 8 and 12, with the moment set to the Winter offshore conditions. Name the frames `beat-<beat>-<rider>-<time>.png`.

- [ ] **Step 2: Capture T-Bone's stance beside the old one.** Stage the same spot and camera with `pose: 'carry'`, then with `'selectStand'`. Save `tbone-before.png` and `tbone-after.png`.

- [ ] **Step 3: Capture the face sheets.** For each rider:
- front and 3/4;
- at 0.6 m and at the gear beat's 2.1 m;
- in `grin`, `stoked` and `easy`;
- in 08:30 and 12:30 light.

Lay each sheet out with PIL beside the rider's approved step-2 close-up (`tools/surfer/previews/closeup-*`). Save `faces-<rider>.png`.

- [ ] **Step 4: Capture the idles as clips.** For each rider, 12 frames a second over one loop at the Choose your rider shot. Save them as an animated WebP (PIL: `save(path, save_all=True, append_images=frames[1:], duration=83, loop=0)`), `idle-<rider>.webp`.

- [ ] **Step 5: Show Andrew and STOP.** Send a handful with SendUserFile:
- Conditions;
- T-Bone before and after;
- one face sheet;
- one idle clip.

Point him to the folder. Ask whether the stances read natural and cool, T-Bone isn't awkward any more, the faces hold up, and the shots frame right. Ledger his verdict. Changes he asks for become new tasks before Task 14. The UI isn't wired to the shots until he signs off (spec §15).

---
### Task 14: Fonts, the §5 tokens, and the canvas scaler

**Files:**
- Create: `public/fonts/` (woff2 files and an `OFL.txt` per family), `public/LICENSES.md`
- Create: `src/frontend/ui/frontEnd.css`, `src/frontend/ui/layout.ts`
- Create: `src/frontend/frontEnd.selftest.ts` (grown by Tasks 15–19, finished in Task 24); modify `src/dev/selftests.ts` (import it)
- Test: `src/frontend/layout.test.ts`

**Interfaces:**
- Consumes: Task 5's `FrontSettings`, `safeAreaFraction`; `registerSelfTest` (`src/dev/selfTest.ts`).
- Produces:
  - `DESIGN_W = 1920`, `DESIGN_H = 1080`
  - `interface UiLayout { scale: number; designW: number; designH: number; safeX: number; safeY: number }` (design px)
  - `layoutFor(windowW, windowH, safeFraction): UiLayout`
  - `insideSafe(box: { x: number; y: number; w: number; h: number }, l: UiLayout): boolean`
  - `mountFrontEndRoot(parent: HTMLElement): HTMLElement` (the `.fe-root` element, with the stylesheet imported)
  - `applyLayout(root: HTMLElement, l: UiLayout, settings: FrontSettings): void` (the size, transform and CSS variables)
  - CSS custom properties: `--fe-sun`, `--fe-teal`, `--fe-cream`, `--fe-ink`, `--fe-safe-x`, `--fe-safe-y`, `--fe-text` (the text scale)
  - Class names used by Tasks 15–23: `.fe-root`, `.fe-scrim-left`, `.fe-scrim-right`, `.fe-scrim-bottom`, `.fe-title`, `.fe-row`, `.is-focus`, `.fe-label`, `.fe-value`, `.fe-small`, `.fe-arrow`, `.fe-legend`, `.fe-line`, `.fe-line-name`, `.fe-tabs`, `.fe-tab`, `.fe-panel`, `.is-opaque`, `.is-calm`

- [ ] **Step 1: Get the fonts (needs Andrew's permission: it downloads files)**

Andrew approves the font download at the plan handoff. If he hasn't, ask him before running this step. Name each file, the source (Google Fonts' CSS API and `github.com/google/fonts`) and the total size (under 400 KB).

1. Fetch each family's CSS from `https://fonts.googleapis.com/css2?family=Knewave&family=Caveat+Brush&family=Barlow+Semi+Condensed:wght@400;500;600;700&family=Barlow:wght@400;500&display=swap`, with a desktop Chrome `User-Agent` so it serves woff2.
2. Save the `latin` subset's woff2 for each face as:
   - `public/fonts/knewave-400.woff2`
   - `public/fonts/caveat-brush-400.woff2`
   - `public/fonts/barlow-semi-condensed-{400,500,600,700}.woff2`
   - `public/fonts/barlow-{400,500}.woff2`
3. Save each family's `OFL.txt` from `https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/OFL.txt` (`knewave`, `caveatbrush`, `barlowsemicondensed`, `barlow`) as `public/fonts/OFL-<family>.txt`.

Write `public/LICENSES.md`: one section per family with the author (Knewave: Tyler Finck; Caveat Brush: Impallari Type; Barlow and Barlow Semi Condensed: Jeremy Tribby), "SIL Open Font License 1.1", and the path of its OFL file. Add the surfer and heath asset lines from `public/surfer/LICENSES.md` by reference ("see public/surfer/LICENSES.md"). Don't move that file.

- [ ] **Step 2: Write the failing test**

```ts
// src/frontend/layout.test.ts
import { describe, expect, it } from 'vitest';
import { DESIGN_H, DESIGN_W, insideSafe, layoutFor } from './ui/layout';

describe('the canvas scaler (spec §5.1; Review Focus 1: window shapes)', () => {
  it('is the design itself at 1920×1080, with the PC safe area 58 × 32', () => {
    const l = layoutFor(1920, 1080, 0.03);
    expect(l).toMatchObject({ scale: 1, designW: DESIGN_W, designH: DESIGN_H });
    expect(l.safeX).toBeCloseTo(57.6, 6);
    expect(l.safeY).toBeCloseTo(32.4, 6);
  });
  it('scales by height on a wider window, the extra width becoming margin the layout anchors past', () => {
    const l = layoutFor(2560, 1080, 0.03);
    expect(l.scale).toBe(1);
    expect(l.designW).toBe(2560);
    expect(l.designH).toBe(1080);
    expect(l.safeX).toBeCloseTo(76.8, 6);
  });
  it('fits the whole design on a narrow 4:3 window (the plan\'s ruling), taller instead of cropped', () => {
    const l = layoutFor(1024, 768, 0.03);
    expect(l.scale).toBeCloseTo(1024 / 1920, 9);
    expect(l.designW).toBeCloseTo(1920, 6);
    expect(l.designH).toBeCloseTo(768 / (1024 / 1920), 6);
  });
  it('keeps 1280×720 and 1280×800 at the design width', () => {
    expect(layoutFor(1280, 720, 0.05).designW).toBeCloseTo(1920, 6);
    expect(layoutFor(1280, 800, 0.05).designH).toBeCloseTo(1200, 6);
  });
  it('says whether a box is inside the safe area', () => {
    const l = layoutFor(1920, 1080, 0.05);
    expect(insideSafe({ x: 96, y: 54, w: 100, h: 100 }, l)).toBe(true);
    expect(insideSafe({ x: 90, y: 54, w: 100, h: 100 }, l)).toBe(false);
    expect(insideSafe({ x: 1700, y: 900, w: 124, h: 126 }, l)).toBe(true);
    expect(insideSafe({ x: 1700, y: 900, w: 125, h: 126 }, l)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/frontend/layout.test.ts`
Expected: FAIL. `./ui/layout` doesn't exist.

- [ ] **Step 4: Write the implementation**

```ts
// src/frontend/ui/layout.ts
import type { FrontSettings } from '../frontSettings';
import { safeAreaFraction } from '../frontSettings';

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

/** The UI's canvas in design pixels: everything is laid out at 1080p and scaled to the window (spec §5.1). */
export interface UiLayout {
  scale: number;
  designW: number;
  designH: number;
  /** The safe-area insets (design px). */
  safeX: number;
  safeY: number;
}

/**
 * Scales by min(width/1920, height/1080): on a wider window the extra width is margin (the layout anchors to the safe
 * area's edges), and on a narrow one the whole 1920-wide design still fits, with room to spare below (the plan's
 * ruling: the spec only describes wider windows).
 */
export function layoutFor(windowW: number, windowH: number, safeFraction: number): UiLayout {
  const scale = Math.min(windowW / DESIGN_W, windowH / DESIGN_H);
  const designW = windowW / scale, designH = windowH / scale;
  return { scale, designW, designH, safeX: designW * safeFraction, safeY: designH * safeFraction };
}

export function insideSafe(b: { x: number; y: number; w: number; h: number }, l: UiLayout): boolean {
  const eps = 1e-6;
  return b.x >= l.safeX - eps && b.y >= l.safeY - eps && b.x + b.w <= l.designW - l.safeX + eps && b.y + b.h <= l.designH - l.safeY + eps;
}

/** The front end's root, full-window over the canvas. The stylesheet comes with it. */
export function mountFrontEndRoot(parent: HTMLElement): HTMLElement {
  const root = document.createElement('div');
  root.className = 'fe-root';
  parent.appendChild(root);
  return root;
}

export function applyLayout(root: HTMLElement, l: UiLayout, s: FrontSettings): void {
  Object.assign(root.style, { width: `${l.designW}px`, height: `${l.designH}px`, transform: `scale(${l.scale})` });
  root.style.setProperty('--fe-safe-x', `${l.safeX}px`);
  root.style.setProperty('--fe-safe-y', `${l.safeY}px`);
  root.style.setProperty('--fe-text', String(s.textScale));
  root.classList.toggle('is-opaque', s.opaqueBackplates);
  root.classList.toggle('is-calm', s.calmMenus);
}

export { safeAreaFraction };
```

Import the stylesheet at the top of `layout.ts` with `import './frontEnd.css';`. Vite bundles it; vitest ignores CSS imports by default (`css: false`). If vitest errors on it, move the import into `FrontEnd.ts` (Task 21) and ledger that.

```css
/* src/frontend/ui/frontEnd.css: the §5 tokens. Every size is design px at 1080p; the root is scaled to the window. */
@font-face { font-family: 'Knewave'; src: url('/fonts/knewave-400.woff2') format('woff2'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Caveat Brush'; src: url('/fonts/caveat-brush-400.woff2') format('woff2'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Barlow Semi Condensed'; src: url('/fonts/barlow-semi-condensed-400.woff2') format('woff2'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Barlow Semi Condensed'; src: url('/fonts/barlow-semi-condensed-500.woff2') format('woff2'); font-weight: 500; font-display: block; }
@font-face { font-family: 'Barlow Semi Condensed'; src: url('/fonts/barlow-semi-condensed-600.woff2') format('woff2'); font-weight: 600; font-display: block; }
@font-face { font-family: 'Barlow Semi Condensed'; src: url('/fonts/barlow-semi-condensed-700.woff2') format('woff2'); font-weight: 700; font-display: block; }
@font-face { font-family: 'Barlow'; src: url('/fonts/barlow-400.woff2') format('woff2'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Barlow'; src: url('/fonts/barlow-500.woff2') format('woff2'); font-weight: 500; font-display: block; }

.fe-root {
  --fe-sun: #ef7d2e; --fe-teal: #1d6b74; --fe-cream: #f7ecd2; --fe-ink: #10171a;
  --fe-text: 1; --fe-safe-x: 58px; --fe-safe-y: 32px;
  --fe-radius: 2px; --fe-row-h: 76px; --fe-gutter: 24px; --fe-inset: 48px;
  --fe-ease-out: cubic-bezier(0.33, 1, 0.68, 1); --fe-ease-in: cubic-bezier(0.32, 0, 0.67, 0); --fe-ease-io: cubic-bezier(0.65, 0, 0.35, 1);
  position: fixed; left: 0; top: 0; transform-origin: 0 0; z-index: 5; pointer-events: none;
  color: var(--fe-cream); font-family: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif; font-weight: 500;
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; user-select: none; outline: none;
}
.fe-root * { box-sizing: border-box; outline: none; }
.fe-root [data-hit] { pointer-events: auto; cursor: default; }

.fe-scrim-left { position: absolute; inset: 0 auto 0 0; width: 48%; background: linear-gradient(90deg, rgba(16, 23, 26, 0.82), rgba(16, 23, 26, 0)); }
.fe-scrim-right { position: absolute; inset: 0 0 0 auto; width: 48%; background: linear-gradient(270deg, rgba(16, 23, 26, 0.82), rgba(16, 23, 26, 0)); }
.fe-scrim-bottom { position: absolute; inset: auto 0 0 0; height: 220px; background: linear-gradient(0deg, rgba(16, 23, 26, 0.7), rgba(16, 23, 26, 0)); }
.fe-root.is-opaque .fe-scrim-left, .fe-root.is-opaque .fe-scrim-right { background: rgba(16, 23, 26, 0.94); }

.fe-title { font: 400 calc(76px * var(--fe-text)) / 1 'Knewave', sans-serif; color: var(--fe-cream); text-shadow: 5px 5px 0 var(--fe-teal); margin: 0 0 32px; }
.fe-row { position: relative; display: grid; grid-template-columns: 168px 1fr auto; align-items: center; column-gap: var(--fe-gutter);
  min-height: calc(var(--fe-row-h) * var(--fe-text)); padding: 0 24px; border-radius: var(--fe-radius);
  transition: transform 90ms var(--fe-ease-out), background-color 90ms linear; transform-origin: 0 50%; }
.fe-row.is-focus { background: var(--fe-cream); color: var(--fe-ink); transform: scale(1.04);
  transition: transform 120ms cubic-bezier(0.34, 1.12, 0.64, 1), background-color 120ms linear; box-shadow: inset 8px 0 0 var(--fe-sun); }
.fe-label { font: 500 calc(21px * var(--fe-text)) / 1 'Barlow Semi Condensed', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.72; }
.fe-row.is-focus .fe-label { opacity: 1; }
.fe-value { font: 600 calc(34px * var(--fe-text)) / 1.1 'Barlow Semi Condensed', sans-serif; white-space: nowrap; min-width: 18ch; display: flex; align-items: baseline; gap: 14px; overflow: hidden; }
.fe-small { font: 400 calc(23px * var(--fe-text)) / 1 'Barlow Semi Condensed', sans-serif; font-variant-numeric: tabular-nums; opacity: 0.8; }
.fe-arrow { width: 22px; height: 28px; visibility: hidden; transition: transform 140ms var(--fe-ease-out); }
.fe-row.is-focus .fe-arrow { visibility: visible; }
.fe-legend { position: absolute; right: var(--fe-safe-x); bottom: var(--fe-safe-y); display: flex; gap: 36px; align-items: center;
  font: 600 calc(26px * var(--fe-text)) / 1 'Barlow Semi Condensed', sans-serif; }
.fe-legend .fe-start { color: var(--fe-sun); }
.fe-line { font: 400 calc(44px * var(--fe-text)) / 1.1 'Caveat Brush', cursive; color: var(--fe-cream); text-shadow: 0 2px 14px rgba(16, 23, 26, 0.85); }
.fe-line-name { display: block; font: 600 calc(21px * var(--fe-text)) / 1 'Barlow Semi Condensed', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.72; margin-bottom: 6px; }
.fe-tabs { display: flex; gap: 28px; align-items: center; font: 600 calc(28px * var(--fe-text)) / 1 'Barlow Semi Condensed', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
.fe-tab { opacity: 0.6; padding-bottom: 8px; border-bottom: 4px solid transparent; }
.fe-tab.is-focus { opacity: 1; border-bottom-color: var(--fe-sun); }
.fe-root.is-calm .fe-row, .fe-root.is-calm .fe-arrow { transition: none; }
```

The exact rows, gaps and colours above are the approved mockup's (`docs/superpowers/specs/2026-10-03-dune-select-mockup/mockup.html`). Where this CSS and the mockup disagree, the mockup wins: copy its values and ledger it.

Create the self-test file with its first case, and import it in `src/dev/selftests.ts` (`import '../frontend/frontEnd.selftest';`):

```ts
// src/frontend/frontEnd.selftest.ts: the front end's DOM checks (spec §15), run with ?selftest=frontend.
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_FRONT_SETTINGS } from './frontSettings';
import { applyLayout, layoutFor, mountFrontEndRoot } from './ui/layout';

/** A front-end root laid out for a window size, for the duration of one check. */
export async function withRoot<T>(w: number, h: number, f: (root: HTMLElement, l: ReturnType<typeof layoutFor>) => Promise<T> | T): Promise<T> {
  const root = mountFrontEndRoot(document.body), l = layoutFor(w, h, 0.03);
  applyLayout(root, l, DEFAULT_FRONT_SETTINGS);
  try {
    await document.fonts.ready;
    return await f(root, l);
  } finally {
    root.remove();
  }
}

/** A box in design px (relative to the root, unscaled). */
export function designBox(el: Element, root: HTMLElement, scale: number): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect(), o = root.getBoundingClientRect();
  return { x: (r.left - o.left) / scale, y: (r.top - o.top) / scale, w: r.width / scale, h: r.height / scale };
}

registerSelfTest({
  name: 'frontend: the fonts load and Barlow has tabular figures',
  async run() {
    return withRoot(1920, 1080, (root) => {
      const probe = (text: string): number => {
        const s = document.createElement('span');
        s.className = 'fe-small';
        s.textContent = text;
        root.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      const faces = ['400 34px "Knewave"', '400 44px "Caveat Brush"', '600 34px "Barlow Semi Condensed"', '400 23px "Barlow"'];
      const missing = faces.filter((f) => !document.fonts.check(f));
      const ones = probe('1111'), zeros = probe('0000');
      const pass = missing.length === 0 && Math.abs(ones - zeros) < 0.5;
      return { pass, detail: `missing: ${missing.join(', ') || 'none'}; 1111 ${ones.toFixed(1)} px vs 0000 ${zeros.toFixed(1)} px` };
    });
  },
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/frontend/layout.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

Then with the `ld-step2` dev server running, open `http://localhost:5177/?selftest=frontend` in the browser pane and read the page text.
Expected: "frontend: the fonts load…" passes. If `1111` and `0000` differ, the woff2 lacks `tnum`. Then set `.fe-small` and `.fe-value` numbers in fixed-width slots (`display: inline-block; width: 0.62em; text-align: center` per digit, done by the row in Task 16) and ledger it.

- [ ] **Step 6: Commit**

```bash
git add public/fonts public/LICENSES.md src/frontend/ui/frontEnd.css src/frontend/ui/layout.ts src/frontend/layout.test.ts src/frontend/frontEnd.selftest.ts src/dev/selftests.ts
git commit -m "feat(frontend): the fonts (OFL, self-hosted with their licences), the §5 tokens, and the canvas scaler with the safe area

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Glyphs, the legend and the rider's line

**Files:**
- Create: `src/frontend/glyphs.ts`, `src/frontend/ui/legend.ts`, `src/frontend/ui/riderLine.ts`
- Modify: `src/frontend/frontEnd.selftest.ts` (append)
- Test: `src/frontend/glyphs.test.ts`

**Interfaces:**
- Consumes: Task 6's `FrontState`, `FrontAction`; Task 7's `Device`; `PRESETS`.
- Produces:
  - `type LegendAction = 'random' | 'details' | 'confirm' | 'back' | 'start'`
  - `glyphFor(device: Device, action: LegendAction | 'tabMinus' | 'tabPlus' | 'toggle' | 'fineMinus' | 'finePlus'): { svg: string; label: string }`
  - `interface LegendEntry { action: LegendAction; text: string; accent?: boolean }`
  - `legendFor(s: FrontState): LegendEntry[]` (pure, in `legend.ts`)
  - `class Legend { readonly el: HTMLElement; set(entries: LegendEntry[], device: Device): void }`
  - `class RiderLine { readonly el: HTMLElement; show(name: string, text: string, nowMs: number): void; update(nowMs: number): void; hide(): void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/glyphs.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHOICES } from './frontSettings';
import { type FrontState, initialFront } from './frontEnd';
import { glyphFor } from './glyphs';
import { legendFor } from './ui/legend';

const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), ...patch });
const ACTIONS = ['random', 'details', 'confirm', 'back', 'start', 'tabMinus', 'tabPlus', 'toggle', 'fineMinus', 'finePlus'] as const;

describe('glyphs (spec §5.5, §10)', () => {
  it('has our own SVG for every device and action, with no text baked into an image', () => {
    for (const d of ['xbox', 'playstation', 'keyboard'] as const) for (const a of ACTIONS) {
      const g = glyphFor(d, a);
      expect(g.svg.startsWith('<svg'), `${d} ${a}`).toBe(true);
      expect(g.svg).not.toMatch(/<image|href=/);
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
  it('confirms with A on Xbox, Cross on PlayStation, Enter on the keyboard', () => {
    expect(glyphFor('xbox', 'confirm').label).toBe('A');
    expect(glyphFor('playstation', 'confirm').label).toBe('Cross');
    expect(glyphFor('keyboard', 'confirm').label).toBe('Enter');
    expect(glyphFor('keyboard', 'back').label).toBe('Esc');
    expect(glyphFor('keyboard', 'random').label).toBe('R');
    expect(glyphFor('keyboard', 'start').label).toBe('P');
    expect(glyphFor('playstation', 'random').label).toBe('Triangle');
  });
  it('colours the Xbox face buttons (A green, B red, X blue, Y yellow) and keeps the PlayStation shapes', () => {
    expect(glyphFor('xbox', 'confirm').svg).toContain('#3fae49');
    expect(glyphFor('xbox', 'back').svg).toContain('#d8433b');
    expect(glyphFor('xbox', 'details').svg).toContain('#3a7fd5');
    expect(glyphFor('xbox', 'random').svg).toContain('#e8b52a');
    expect(glyphFor('playstation', 'confirm').svg).toContain('data-shape="cross"');
  });
});

describe('the legend (spec §4, §5.5): Y, X, A, B, START, absent actions left out', () => {
  it('Conditions: Roll the dice, Swell details, Done, Back', () => {
    expect(legendFor(front()).map((e) => [e.action, e.text])).toEqual([['random', 'Roll the dice'], ['details', 'Swell details'], ['confirm', 'Done'], ['back', 'Back']]);
  });
  it('Choose your rider: the confirm carries the name', () => {
    expect(legendFor(front({ beat: 'rider', rider: 'male' })).map((e) => e.text)).toEqual(['Ride as T-Bone', 'Back']);
  });
  it('Grab your gear: Choose, Back, and Paddle out in sun orange', () => {
    const l = legendFor(front({ beat: 'gear' }));
    expect(l.map((e) => e.text)).toEqual(['Choose', 'Back', 'Paddle out']);
    expect(l[2]).toMatchObject({ action: 'start', accent: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/glyphs.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/glyphs.ts
import type { Device } from './uiInput';

export type LegendAction = 'random' | 'details' | 'confirm' | 'back' | 'start';
type GlyphAction = LegendAction | 'tabMinus' | 'tabPlus' | 'toggle' | 'fineMinus' | 'finePlus';

const CREAM = '#f7ecd2', DISC = '#1a2226';
const svg = (w: number, body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40" viewBox="0 0 ${w} 40" aria-hidden="true">${body}</svg>`;
/** A face button: a dark disc with a cream ring, the letter or shape in its colour. */
const disc = (inner: string): string => svg(40, `<circle cx="20" cy="20" r="18" fill="${DISC}" stroke="${CREAM}" stroke-width="2"/>${inner}`);
const letter = (ch: string, colour: string): string => `<text x="20" y="27.5" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="700" font-size="21" fill="${colour}">${ch}</text>`;
/** A shoulder, trigger or stick: a cream-outlined pill or a stick ring. */
const pill = (ch: string, w = 56): string => svg(w, `<rect x="1" y="6" width="${w - 2}" height="28" rx="3" fill="${DISC}" stroke="${CREAM}" stroke-width="2"/>${`<text x="${w / 2}" y="26.5" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="700" font-size="18" fill="${CREAM}">${ch}</text>`}`);
/** A key cap, as wide as its label. */
const cap = (ch: string): string => {
  const w = Math.max(40, 18 + ch.length * 12);
  return svg(w, `<rect x="1" y="2" width="${w - 2}" height="36" rx="3" fill="${DISC}" stroke="${CREAM}" stroke-width="2"/><rect x="1" y="32" width="${w - 2}" height="6" rx="2" fill="${CREAM}" opacity="0.25"/><text x="${w / 2}" y="26" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="700" font-size="18" fill="${CREAM}">${ch}</text>`);
};
const PS_SHAPE: Record<'cross' | 'circle' | 'square' | 'triangle', string> = {
  cross: `<g data-shape="cross" stroke="#7fb0e8" stroke-width="3" stroke-linecap="round"><path d="M13 13 L27 27 M27 13 L13 27"/></g>`,
  circle: `<g data-shape="circle"><circle cx="20" cy="20" r="8" fill="none" stroke="#e86b6b" stroke-width="3"/></g>`,
  square: `<g data-shape="square"><rect x="12.5" y="12.5" width="15" height="15" fill="none" stroke="#d68fc8" stroke-width="3"/></g>`,
  triangle: `<g data-shape="triangle"><path d="M20 11 L29 27 L11 27 Z" fill="none" stroke="#5fc9a8" stroke-width="3" stroke-linejoin="round"/></g>`,
};

const XBOX: Record<GlyphAction, { svg: string; label: string }> = {
  confirm: { svg: disc(letter('A', '#3fae49')), label: 'A' },
  back: { svg: disc(letter('B', '#d8433b')), label: 'B' },
  details: { svg: disc(letter('X', '#3a7fd5')), label: 'X' },
  random: { svg: disc(letter('Y', '#e8b52a')), label: 'Y' },
  start: { svg: pill('START', 76), label: 'START' },
  tabMinus: { svg: pill('LB'), label: 'LB' }, tabPlus: { svg: pill('RB'), label: 'RB' },
  fineMinus: { svg: pill('LT'), label: 'LT' }, finePlus: { svg: pill('RT'), label: 'RT' },
  toggle: { svg: pill('RS'), label: 'RS' },
};
const PLAYSTATION: Record<GlyphAction, { svg: string; label: string }> = {
  confirm: { svg: disc(PS_SHAPE.cross), label: 'Cross' },
  back: { svg: disc(PS_SHAPE.circle), label: 'Circle' },
  details: { svg: disc(PS_SHAPE.square), label: 'Square' },
  random: { svg: disc(PS_SHAPE.triangle), label: 'Triangle' },
  start: { svg: pill('OPTIONS', 92), label: 'Options' },
  tabMinus: { svg: pill('L1'), label: 'L1' }, tabPlus: { svg: pill('R1'), label: 'R1' },
  fineMinus: { svg: pill('L2'), label: 'L2' }, finePlus: { svg: pill('R2'), label: 'R2' },
  toggle: { svg: pill('R3'), label: 'R3' },
};
const KEYS: Record<GlyphAction, string> = { confirm: 'Enter', back: 'Esc', random: 'R', details: 'F', start: 'P', tabMinus: 'Q', tabPlus: 'E', toggle: 'Tab', fineMinus: '−', finePlus: '+' };

/** Our own glyph for an action on a device (spec §5.5: no platform artwork beyond the face letters and shapes). */
export function glyphFor(device: Device, action: GlyphAction): { svg: string; label: string } {
  if (device === 'xbox') return XBOX[action];
  if (device === 'playstation') return PLAYSTATION[action];
  return { svg: cap(KEYS[action]), label: KEYS[action] };
}
```

The keyboard has no fine-scrub keys in §10's table. The `−`/`+` caps are for the Settings overlay only; the Conditions legend never shows fine scrub.

```ts
// src/frontend/ui/legend.ts
import { PRESETS } from '../../surfer/presets';
import type { FrontState } from '../frontEnd';
import { type LegendAction, glyphFor } from '../glyphs';
import type { Device } from '../uiInput';

export interface LegendEntry { action: LegendAction; text: string; accent?: boolean }
const ORDER: LegendAction[] = ['random', 'details', 'confirm', 'back', 'start'];

/** What each beat offers, in the fixed order Y, X, A, B, START (spec §5.5). */
export function legendFor(s: FrontState): LegendEntry[] {
  const e: LegendEntry[] = [];
  if (s.beat === 'conditions') e.push({ action: 'random', text: 'Roll the dice' }, { action: 'details', text: 'Swell details' }, { action: 'confirm', text: 'Done' }, { action: 'back', text: 'Back' });
  else if (s.beat === 'rider') e.push({ action: 'confirm', text: `Ride as ${PRESETS[s.rider].nickname}` }, { action: 'back', text: 'Back' });
  else if (s.beat === 'gear') e.push({ action: 'confirm', text: 'Choose' }, { action: 'back', text: 'Back' }, { action: 'start', text: 'Paddle out', accent: true });
  return e.sort((a, b) => ORDER.indexOf(a.action) - ORDER.indexOf(b.action));
}

/** The legend, bottom-right inside the safe area. The glyphs switch at once when the device does (no animation). */
export class Legend {
  readonly el = document.createElement('div');
  private key = '';

  constructor(private readonly onClick: (a: LegendAction) => void) {
    this.el.className = 'fe-legend';
  }

  set(entries: LegendEntry[], device: Device): void {
    const key = device + JSON.stringify(entries);
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren(...entries.map((e) => {
      const item = document.createElement('span');
      item.dataset.hit = e.action;
      item.className = e.accent ? 'fe-start' : '';
      Object.assign(item.style, { display: 'inline-flex', alignItems: 'center', gap: '12px' });
      const g = document.createElement('span');
      g.innerHTML = glyphFor(device, e.action).svg;
      g.dataset.glyph = glyphFor(device, e.action).label;
      const t = document.createElement('span');
      t.textContent = e.text;
      item.append(g, t);
      item.addEventListener('click', () => this.onClick(e.action));
      return item;
    }));
  }
}
```

```ts
// src/frontend/ui/riderLine.ts
/** What a rider says, in brush script with their name small above (spec §4.1). Fades in 140 ms, holds, fades out 180 ms. */
export class RiderLine {
  readonly el = document.createElement('div');
  private readonly name = document.createElement('span');
  private readonly text = document.createElement('span');
  private untilMs = 0;
  static readonly HOLD_MS = 3200;

  constructor() {
    this.el.className = 'fe-line';
    this.name.className = 'fe-line-name';
    this.el.append(this.name, this.text);
    Object.assign(this.el.style, { position: 'absolute', opacity: '0', transition: 'opacity 140ms linear', maxWidth: '760px' });
  }

  show(name: string, text: string, nowMs: number): void {
    this.name.textContent = name;
    this.text.textContent = text;
    this.el.style.transition = 'opacity 140ms linear';
    this.el.style.opacity = '1';
    this.untilMs = nowMs + RiderLine.HOLD_MS;
  }

  update(nowMs: number): void {
    if (this.untilMs && nowMs > this.untilMs) this.hide();
  }

  hide(): void {
    this.untilMs = 0;
    this.el.style.transition = 'opacity 180ms linear';
    this.el.style.opacity = '0';
  }
}
```

Each beat's panel places the line (`left`/`top`): over the water in Conditions (left 760, top 520), over the sky left of the panel in Grab your gear (left 120, top 200), and inside the slide panel in Choose your rider (static, not this class's fade). These are the mockup's positions.

Append a DOM check to `src/frontend/frontEnd.selftest.ts`:

```ts
import { Legend, legendFor } from './ui/legend';
import { initialFront } from './frontEnd';
import { DEFAULT_CHOICES } from './frontSettings';

registerSelfTest({
  name: 'frontend: the legend sits bottom-right inside the safe area and swaps glyphs at once',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const legend = new Legend(() => {});
      root.appendChild(legend.el);
      const s = { ...initialFront(DEFAULT_CHOICES), beat: 'gear' as const };
      legend.set(legendFor(s), 'keyboard');
      const b = designBox(legend.el, root, l.scale);
      const keys = [...legend.el.querySelectorAll('[data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      legend.set(legendFor(s), 'xbox');
      const pads = [...legend.el.querySelectorAll('[data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      const inside = b.x + b.w <= l.designW - l.safeX + 0.5 && b.y + b.h <= l.designH - l.safeY + 0.5 && b.x + b.w > l.designW - l.safeX - 2;
      return { pass: inside && keys === 'Enter,Esc,P' && pads === 'A,B,START', detail: `box ${JSON.stringify(b)}; keys ${keys}; pad ${pads}` };
    });
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend/glyphs.test.ts && npx tsc --noEmit`, then `?selftest=frontend` in the browser pane.
Expected: PASS, and both front-end self-tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/glyphs.ts src/frontend/glyphs.test.ts src/frontend/ui/legend.ts src/frontend/ui/riderLine.ts src/frontend/frontEnd.selftest.ts
git commit -m "feat(frontend): our own glyphs per device, the legend in its fixed order, and the rider's line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: The Conditions panel

**Files:**
- Create: `src/frontend/ui/skyGlyphs.ts`, `src/frontend/ui/valueRow.ts`, `src/frontend/ui/conditionsPanel.ts`, `src/frontend/conditionsView.ts`
- Modify: `src/frontend/frontEnd.ts` (append `focusTo`), `src/frontend/frontEnd.selftest.ts` (append)
- Test: `src/frontend/conditionsView.test.ts`

**Interfaces:**
- Consumes: Task 1's `rowDisplay`, `SKY_ROWS`, `TIDE_STOPS`, `sunTimes`, `dateForMonth`; Task 2's `rollSetup`; Task 6's `FrontState`, `conditionRows`, `FrontEvent`; Task 3's `situationOf`, `chooseLine`, `fillLine`, `RIDER_COPY`, `RIDER_ORDER`, `sizeWords`; `WeatherPresetName`.
- Produces:
  - `interface RowView { row: RowId; label: string; value: string; small: string; focused: boolean; gapAfter: boolean }`
  - `conditionsView(s: FrontState, today: Date): RowView[]`
  - `rollFrames(seed: number, row: RowId, today: Date): string[]` (3–4 values ending on the rolled one)
  - `lineFor(s: FrontState, row: RowId, seed: number): { speaker: PresetName; text: string }` (the speaker rotates)
  - `tideCurve(tideStop: number): string` (an SVG path, 0–1 over the day)
  - `focusTo(s, target: { row: RowId } | { rider: PresetName } | { gear: number }): { state: FrontState; events: FrontEvent[] }`
  - `SKY_GLYPHS: Record<WeatherPresetName, string>`
  - `class ValueRow { readonly el; set(v: Omit<RowView, 'row'>): void; slide(dir: -1 | 1, calm: boolean): void; nudge(dir: -1 | 1, calm: boolean, px?: number): void; flash(value: string): void }`
  - `class ConditionsPanel { readonly el; constructor(onPointer: (p: PointerIntent) => void); render(s, today, calm): void; event(e: FrontEvent, s, today, nowMs, calm): void; update(nowMs): void }`
  - `type PointerIntent = { kind: 'focus'; row: RowId } | { kind: 'action'; action: FrontAction }`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/conditionsView.test.ts
import { describe, expect, it } from 'vitest';
import { conditionsView, lineFor, rollFrames, tideCurve } from './conditionsView';
import { type FrontState, focusTo, initialFront } from './frontEnd';
import { DEFAULT_CHOICES } from './frontSettings';
import { rollSetup, rowDisplay } from './sessionSetup';

const today = new Date('2026-07-10T09:00:00+08:00');
const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), ...patch });

describe('the Conditions rows (spec §4.1)', () => {
  it('lists Preset, Month, Time, Sky, Wind, Swell, From, Tide, a gap under Preset, the focus on one row', () => {
    const v = conditionsView(front(), today);
    expect(v.map((r) => r.label)).toEqual(['Preset', 'Month', 'Time', 'Sky', 'Wind', 'Swell', 'From', 'Tide']);
    expect(v[0].gapAfter).toBe(true);
    expect(v.filter((r) => r.focused).length).toBe(1);
  });
  it('opens Period under Swell with the details', () => {
    expect(conditionsView(front({ detailsOpen: true }), today).map((r) => r.row)).toContain('period');
  });
  it('shows what rowDisplay says, word first and the number small', () => {
    const s = front(), v = conditionsView(s, today).find((r) => r.row === 'swell')!;
    expect(v).toMatchObject(rowDisplay(s.setup, 'swell', today));
  });
});

describe('the roll, the rider\'s lines and the tide curve', () => {
  it('ticks each row through 3–4 values and lands on the rolled one', () => {
    for (const row of ['sky', 'wind', 'swell', 'tide'] as const) {
      const f = rollFrames(42, row, today);
      expect(f.length).toBeGreaterThanOrEqual(3);
      expect(f.length).toBeLessThanOrEqual(4);
      expect(f[f.length - 1]).toBe(rowDisplay(rollSetup(42), row, today).value);
    }
  });
  it('rotates the speaker and never says an empty line', () => {
    const speakers = new Set([0, 1, 2, 3, 4, 5].map((k) => lineFor(front(), 'swell', k).speaker));
    expect(speakers.size).toBe(3);
    for (let k = 0; k < 30; k++) expect(lineFor(front(), 'wind', k).text.length).toBeGreaterThan(3);
  });
  it('draws the tide over the day as a path inside its box', () => {
    const d = tideCurve(2);
    expect(d.startsWith('M')).toBe(true);
    for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(120); }
  });
});

describe('focusTo (the mouse: hover moves focus, spec §5.4)', () => {
  it('focuses a row, a rider or a gear row, with a focus tick only when it moves', () => {
    const s = front();
    expect(focusTo(s, { row: 'tide' }).state.rowFocus).toBe('tide');
    expect(focusTo(s, { row: 'tide' }).events).toEqual([{ kind: 'focus' }]);
    expect(focusTo(s, { row: s.rowFocus }).events).toEqual([]);
    expect(focusTo(front({ beat: 'rider' }), { rider: 'grommet' }).events).toContainEqual({ kind: 'riderFocus', rider: 'grommet' });
    expect(focusTo(front({ beat: 'gear' }), { gear: 1 }).state.gearFocus).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/conditionsView.test.ts`
Expected: FAIL. `conditionsView` and `focusTo` don't exist.

- [ ] **Step 3: Write the implementation**

Append to `src/frontend/frontEnd.ts`:

```ts
/** Focus straight onto a row, rider or gear row (the mouse's hover). A focus tick only when it moves. */
export function focusTo(s: FrontState, target: { row: RowId } | { rider: PresetName } | { gear: number }): { state: FrontState; events: FrontEvent[] } {
  if ('row' in target) return target.row === s.rowFocus ? { state: s, events: [] } : { state: { ...s, rowFocus: target.row }, events: [{ kind: 'focus' }] };
  if ('rider' in target) return target.rider === s.rider ? { state: s, events: [] } : { state: { ...s, rider: target.rider }, events: [{ kind: 'focus' }, { kind: 'riderFocus', rider: target.rider }] };
  return target.gear === s.gearFocus ? { state: s, events: [] } : { state: { ...s, gearFocus: target.gear }, events: [{ kind: 'focus' }, { kind: 'gear', tab: s.gearTab, focus: target.gear }] };
}
```

```ts
// src/frontend/conditionsView.ts
import type { PresetName } from '../surfer/presets';
import { type FrontState, conditionRows } from './frontEnd';
import { RIDER_COPY, RIDER_ORDER, chooseLine, fillLine, situationOf, sizeWords } from './riderCopy';
import { type RowId, TIDE_STOPS, rollSetup, rowDisplay } from './sessionSetup';

export interface RowView { row: RowId; label: string; value: string; small: string; focused: boolean; gapAfter: boolean }

const LABELS: Record<RowId, string> = { preset: 'Preset', month: 'Month', time: 'Time', sky: 'Sky', wind: 'Wind', swell: 'Swell', period: 'Period', from: 'From', tide: 'Tide' };

export function conditionsView(s: FrontState, today: Date): RowView[] {
  return conditionRows(s).map((row) => ({ row, label: LABELS[row], ...rowDisplay(s.setup, row, today), focused: row === s.rowFocus, gapAfter: row === 'preset' }));
}

/** The values a row ticks through on Roll the dice (240 ms, spec §5.6): two or three neighbours' rolls, then its own. */
export function rollFrames(seed: number, row: RowId, today: Date): string[] {
  const n = 3 + (seed % 2), out: string[] = [];
  for (let k = n - 1; k >= 1; k--) out.push(rowDisplay(rollSetup(seed + 7919 * k), row, today).value);
  out.push(rowDisplay(rollSetup(seed), row, today).value);
  return out;
}

/** A rider's line for the new conditions; the speaker rotates through the crew (spec §4.1). */
export function lineFor(s: FrontState, row: RowId, seed: number): { speaker: PresetName; text: string } {
  const speaker = RIDER_ORDER[((seed % 3) + 3) % 3];
  const lines = RIDER_COPY[speaker].situationLines[situationOf(s.setup, row)];
  return { speaker, text: fillLine(chooseLine(lines, seed), { size: sizeWords(s.setup.swellFt) }) };
}

/** The day's tide as a little curve (120 × 40 box): a semidiurnal-looking wave lifted to the chosen stop's height. */
export function tideCurve(tideStop: number): string {
  const lift = TIDE_STOPS[tideStop].m * 16, pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = i * 5, y = 20 - lift - 10 * Math.cos((i / 24) * 4 * Math.PI);
    pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${Math.min(40, Math.max(0, y)).toFixed(1)}`);
  }
  return pts.join(' ');
}
```

```ts
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
```

Add this assertion to `conditionsView.test.ts`:

```ts
import { WEATHER_PRESET_NAMES } from '../weather/weather';
import { SKY_GLYPHS } from './ui/skyGlyphs';
it('has a sky glyph for every sky', () => { for (const n of WEATHER_PRESET_NAMES) expect(SKY_GLYPHS[n]).toMatch(/^<svg/); });
```

```ts
// src/frontend/ui/valueRow.ts
import type { RowView } from '../conditionsView';

const ARROW = (d: -1 | 1): string => `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28" aria-hidden="true"><path d="${d < 0 ? 'M17 3 L5 14 L17 25' : 'M5 3 L17 14 L5 25'}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>`;

/** A label, a word value with its small number, and the ◀ ▶ arrows (shown on the focused row only). */
export class ValueRow {
  readonly el = document.createElement('div');
  private readonly label = document.createElement('span');
  private readonly value = document.createElement('span');
  private readonly word = document.createElement('span');
  private readonly small = document.createElement('span');
  readonly left = document.createElement('span');
  readonly right = document.createElement('span');
  private last = '';

  constructor(readonly row: string, glyph = '') {
    this.el.className = 'fe-row';
    this.el.dataset.hit = row;
    this.label.className = 'fe-label';
    this.value.className = 'fe-value';
    this.small.className = 'fe-small';
    this.left.className = this.right.className = 'fe-arrow';
    this.left.innerHTML = ARROW(-1);
    this.right.innerHTML = ARROW(1);
    this.left.dataset.hit = `${row}:left`;
    this.right.dataset.hit = `${row}:right`;
    const arrows = document.createElement('span');
    Object.assign(arrows.style, { display: 'flex', gap: '10px' });
    arrows.append(this.left, this.right);
    if (glyph) {
      const icon = document.createElement('span');
      icon.innerHTML = glyph;
      this.value.append(icon);
    }
    this.value.append(this.word, this.small);
    this.el.append(this.label, this.value, arrows);
  }

  set(v: Omit<RowView, 'row'>): void {
    this.label.textContent = v.label;
    this.word.textContent = v.value;
    this.small.textContent = v.small;
    this.el.classList.toggle('is-focus', v.focused);
    this.el.style.marginBottom = v.gapAfter ? '24px' : '0';
    this.last = v.value;
  }

  /** The value change (140 ms): the old word slides 10 px out in the press direction, the new one in. */
  slide(dir: -1 | 1, calm: boolean): void {
    if (calm) return;
    this.word.animate([{ transform: `translateX(${-10 * dir}px)`, opacity: 0.2 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 140, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
    this.nudge(dir, calm);
  }

  /** That side's arrow nudges 4 px (an end of range nudges 3 px with the dull tick). */
  nudge(dir: -1 | 1, calm: boolean, px = 4): void {
    if (calm) return;
    (dir < 0 ? this.left : this.right).animate([{ transform: 'translateX(0)' }, { transform: `translateX(${px * dir}px)` }, { transform: 'translateX(0)' }], { duration: 140, easing: 'ease-out' });
  }

  get shown(): string {
    return this.last;
  }

  /** Roll the dice: show an in-between value without the slide. */
  flash(value: string): void {
    this.word.textContent = value;
  }
}
```

```ts
// src/frontend/ui/conditionsPanel.ts
import type { FrontAction, FrontEvent, FrontState } from '../frontEnd';
import { conditionsView, rollFrames, tideCurve } from '../conditionsView';
import type { RowId } from '../sessionSetup';
import { SKY_GLYPHS } from './skyGlyphs';
import { ValueRow } from './valueRow';

export type PointerIntent = { kind: 'focus'; row: RowId } | { kind: 'action'; action: FrontAction };

/** Conditions' left column over its scrim: the title, the rows, and the tide's little curve on the Tide row. */
export class ConditionsPanel {
  readonly el = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly rows = new Map<RowId, ValueRow>();
  private readonly tide = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private rolling: { startMs: number; seed: number; today: Date } | null = null;

  constructor(private readonly onPointer: (p: PointerIntent) => void) {
    const scrim = document.createElement('div');
    scrim.className = 'fe-scrim-left';
    const col = document.createElement('div');
    Object.assign(col.style, { position: 'absolute', left: 'var(--fe-safe-x)', top: 'calc(var(--fe-safe-y) + 40px)', width: '760px' });
    const title = document.createElement('h1');
    title.className = 'fe-title';
    title.textContent = 'Conditions';
    col.append(title, this.list);
    this.tide.setAttribute('width', '120');
    this.tide.setAttribute('height', '40');
    this.tide.setAttribute('viewBox', '0 0 120 40');
    this.el.append(scrim, col);
    this.el.addEventListener('pointerover', (e) => {
      const row = (e.target as HTMLElement).closest('.fe-row') as HTMLElement | null;
      if (row?.dataset.hit) this.onPointer({ kind: 'focus', row: row.dataset.hit as RowId });
    });
    this.el.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null;
      if (hit?.dataset.hit?.endsWith(':left')) this.onPointer({ kind: 'action', action: 'left' });
      else if (hit?.dataset.hit?.endsWith(':right')) this.onPointer({ kind: 'action', action: 'right' });
    });
    this.el.addEventListener('wheel', (e) => {
      if ((e.target as HTMLElement).closest('.fe-row.is-focus')) this.onPointer({ kind: 'action', action: e.deltaY > 0 ? 'left' : 'right' });
    }, { passive: true });
  }

  render(s: FrontState, today: Date): void {
    const view = conditionsView(s, today);
    const ids = view.map((v) => v.row).join();
    if ([...this.rows.keys()].join() !== ids) {
      this.rows.clear();
      this.list.replaceChildren(...view.map((v) => {
        const r = new ValueRow(v.row, v.row === 'sky' ? SKY_GLYPHS[s.setup.sky] : '');
        this.rows.set(v.row, r);
        return r.el;
      }));
    }
    for (const v of view) if (!this.rolling) this.rows.get(v.row)!.set(v);
    const tideRow = this.rows.get('tide');
    if (tideRow) {
      this.tide.innerHTML = `<path d="${tideCurve(s.setup.tide)}" fill="none" stroke="#f7ecd2" stroke-width="2.5" opacity="0.8"/>`;
      tideRow.el.querySelector('.fe-value')!.appendChild(this.tide);
    }
    const skyIcon = this.rows.get('sky')?.el.querySelector('.fe-value > span:first-child');
    if (skyIcon) skyIcon.innerHTML = SKY_GLYPHS[s.setup.sky];
  }

  event(e: FrontEvent, calm: boolean, nowMs: number, today: Date): void {
    if (e.kind === 'value') this.rows.get(e.row)?.slide(e.dir, calm);
    if (e.kind === 'end') this.rows.get(e.row)?.nudge(1, calm, 3);
    if (e.kind === 'roll' && !calm) this.rolling = { startMs: nowMs, seed: e.seed, today };
  }

  /** Roll the dice: each row ticks through its frames over 240 ms, staggered 40 ms (spec §5.6). Returns true when done. */
  update(nowMs: number): boolean {
    const r = this.rolling;
    if (!r) return true;
    let done = true, i = 0;
    for (const [row, vr] of this.rows) {
      const t = nowMs - r.startMs - 40 * i++;
      const frames = rollFrames(r.seed, row, r.today);
      if (t < 240) done = false;
      if (t >= 0) vr.flash(frames[Math.min(frames.length - 1, Math.floor((t / 240) * frames.length))]);
    }
    if (done) this.rolling = null;
    return done;
  }
}
```

Append a DOM check to `frontEnd.selftest.ts`:

```ts
import { ConditionsPanel } from './ui/conditionsPanel';

registerSelfTest({
  name: 'frontend: the Conditions rows are inside the safe area, 18 px or more, and one row is focused',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const p = new ConditionsPanel(() => {});
      root.appendChild(p.el);
      p.render(initialFront(DEFAULT_CHOICES), new Date('2026-07-10T09:00:00+08:00'));
      const rows = [...p.el.querySelectorAll('.fe-row')];
      const outside = rows.filter((r) => { const b = designBox(r, root, l.scale); return b.x < l.safeX - 0.5 || b.y < l.safeY - 0.5 || b.y + b.h > l.designH - l.safeY + 0.5; });
      const tiny = [...p.el.querySelectorAll('.fe-label, .fe-value, .fe-small, .fe-title')].filter((t) => parseFloat(getComputedStyle(t).fontSize) < 18);
      const focused = p.el.querySelectorAll('.fe-row.is-focus').length;
      return { pass: rows.length === 8 && outside.length === 0 && tiny.length === 0 && focused === 1, detail: `${rows.length} rows, ${outside.length} outside, ${tiny.length} under 18 px, ${focused} focused` };
    });
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend && npx tsc --noEmit`, then `?selftest=frontend`.
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/conditionsView.ts src/frontend/conditionsView.test.ts src/frontend/frontEnd.ts src/frontend/ui/skyGlyphs.ts src/frontend/ui/valueRow.ts src/frontend/ui/conditionsPanel.ts src/frontend/frontEnd.selftest.ts
git commit -m "feat(frontend): the Conditions panel: the rows with our sky glyphs, the value slide, the roll, the tide curve and the mouse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The map of the break

**Files:**
- Create: `src/frontend/mapGeom.ts`, `tools/bakeBreakMap.ts`, `public/ui/breakMap.json` (baked), `src/frontend/ui/breakMap.ts`
- Modify: `package.json` (a `bake:map` script), `src/frontend/frontEnd.selftest.ts` (append)
- Test: `src/frontend/mapGeom.test.ts`

**Interfaces:**
- Consumes: `decodeLandFile`, `LandFile`, `GridSpec` (`src/land/landData.ts`); `buildBathymetry` (`src/seabed/bathymetry.ts`); `DEFAULT_REEF_PARAMS` (`src/seabed/wombReef.ts`); `WOMB_LINEUP` (`src/land/tracks.ts`); `travelDirectionXZ` (as App uses it); Task 1's `SessionSetup`, `WIND_ROWS`; `LandSpot`.
- Produces:
  - `bilinear(grid: GridSpec, values: Float32Array, x: number, z: number): number | null`
  - `contours(values: Float32Array, nx: number, nz: number, level: number): [number, number][][]` (marching squares, in cell units; rings closed when the field is padded)
  - `simplify(pts: [number, number][], tol: number): [number, number][]` (Douglas–Peucker)
  - `toPath(lines: [number, number][][], closed: boolean): string`
  - `MAP = { w: 448, h: 336, insetW: 78, mPerPx: 4.6 }`, `mapCentre(): { x: number; z: number }`, `worldToMap(x, z): [number, number]`
  - `swellCrests(fromDeg, periodS, sizeFt): { lines: [number, number][][]; widths: number[]; opacities: number[]; arrow: [number, number][] }`
  - `windArrows(dirDeg, speedMs): { arrows: [number, number][][]; glassy: boolean }`
  - `windDirOf(s: SessionSetup): number`, `windSpeedOf(s: SessionSetup): number`
  - `swellLabel(s: SessionSetup): string` ("SW · 4 FT · 15 S"), `windLabel(s: SessionSetup): string` ("E · OFFSHORE" or "GLASSY")
  - `interface BreakMapData { reef: { d3: string; d6: string; d9: string }; land: string; beach: string; dune20: string; peak: [number, number]; inset: { coast: string; box: [number, number, number, number]; north: string; south: string } }`
  - `class BreakMap { readonly el; load(url?): Promise<void>; setLookout(spot: LandSpot): void; setConditions(s: SessionSetup, calm: boolean): void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/mapGeom.test.ts
import { describe, expect, it } from 'vitest';
import { MAP, bilinear, contours, simplify, swellCrests, swellLabel, toPath, windArrows, windLabel, worldToMap, mapCentre } from './mapGeom';
import { presetById, FIRST_PRESET } from './sessionSetup';

describe('the map geometry (spec §7)', () => {
  it('samples a grid bilinearly, null outside it', () => {
    const grid = { x0: 0, z0: 0, cellM: 10, nx: 2, nz: 2 }, v = new Float32Array([0, 10, 20, 30]);
    expect(bilinear(grid, v, 5, 5)).toBeCloseTo(15, 6);
    expect(bilinear(grid, v, -1, 5)).toBeNull();
  });
  it('traces a padded circle field into one closed ring at the right radius', () => {
    const n = 41, v = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = 15 - Math.hypot(i - 20, j - 20);
    const rings = contours(v, n, n, 5);
    expect(rings.length).toBe(1);
    const r = rings[0];
    expect(r[0]).toEqual(r[r.length - 1]);
    for (const [x, y] of r) expect(Math.hypot(x - 20, y - 20)).toBeCloseTo(10, 0);
  });
  it('simplifies a straight run to its ends and keeps a corner', () => {
    expect(simplify([[0, 0], [1, 0.01], [2, 0], [3, 0.01], [4, 0]], 0.1)).toEqual([[0, 0], [4, 0]]);
    expect(simplify([[0, 0], [2, 0], [2, 2]], 0.1)).toEqual([[0, 0], [2, 0], [2, 2]]);
  });
  it('writes SVG paths', () => {
    expect(toPath([[[0, 0], [1, 2]]], false)).toBe('M0 0L1 2');
    expect(toPath([[[0, 0], [1, 2], [0, 0]]], true)).toBe('M0 0L1 2Z');
  });
  it('maps the world north-up: east right, north (−z) up, the reef in the main view', () => {
    const c = mapCentre(), [cx, cy] = worldToMap(c.x, c.z);
    expect(cx).toBeCloseTo((MAP.w - MAP.insetW) / 2, 6);
    expect(cy).toBeCloseTo(MAP.h / 2, 6);
    expect(worldToMap(c.x + 46, c.z)[0]).toBeCloseTo(cx + 10, 6);
    expect(worldToMap(c.x, c.z - 46)[1]).toBeCloseTo(cy - 10, 6);
  });
  it('draws three swell crests square to the direction, spaced by the period, heavier with size', () => {
    const a = swellCrests(225, 10, 3), b = swellCrests(225, 16, 3), big = swellCrests(225, 10, 8);
    expect(a.lines.length).toBe(3);
    const dir = (l: [number, number][]) => Math.atan2(l[1][1] - l[0][1], l[1][0] - l[0][0]);
    const travel = Math.atan2(a.arrow[1][1] - a.arrow[0][1], a.arrow[1][0] - a.arrow[0][0]);
    expect(Math.abs(Math.cos(dir(a.lines[0]) - travel))).toBeLessThan(1e-6);
    const gap = (c: typeof a) => Math.hypot(c.lines[1][0][0] - c.lines[0][0][0], c.lines[1][0][1] - c.lines[0][0][1]);
    expect(gap(b)).toBeGreaterThan(gap(a));
    expect(big.widths[0]).toBeGreaterThan(a.widths[0]);
    expect(a.opacities[0]).toBeGreaterThan(a.opacities[2]);
  });
  it('shows no wind arrows when glassy, and labels swell and wind like a surf report', () => {
    expect(windArrows(90, 0).glassy).toBe(true);
    expect(windArrows(90, 6).arrows.length).toBeGreaterThan(2);
    const s = presetById(FIRST_PRESET)!.setup;
    expect(swellLabel(s)).toMatch(/^[NESW]{1,3} · \d+(½)? FT · \d+ S$/);
    expect(windLabel(s)).toBe('E · LIGHT OFFSHORE');
    expect(windLabel({ ...s, wind: 0 })).toBe('GLASSY');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/mapGeom.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/mapGeom.ts: the map of the break's geometry (spec §7). Pure: shared by the bake and the live layers.
import type { GridSpec } from '../land/landData';
import { WOMB_LINEUP } from '../land/tracks';
import { type SessionSetup, WIND_ROWS } from './sessionSetup';

export const MAP = { w: 448, h: 336, insetW: 78, mPerPx: 4.6 } as const;

/** The main view's centre: the reef, nudged inland so the beach and the dune show (tuned at Gate B). */
export const mapCentre = (): { x: number; z: number } => ({ x: WOMB_LINEUP.x + 260, z: WOMB_LINEUP.z });

/** World (x east, z south) → the main view's pixels, north up. */
export function worldToMap(x: number, z: number): [number, number] {
  const c = mapCentre();
  return [(MAP.w - MAP.insetW) / 2 + (x - c.x) / MAP.mPerPx, MAP.h / 2 + (z - c.z) / MAP.mPerPx];
}

export function bilinear(g: GridSpec, v: Float32Array, x: number, z: number): number | null {
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) return null;
  const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
  const a = v[j * g.nx + i], b = v[j * g.nx + i + 1], c = v[(j + 1) * g.nx + i], d = v[(j + 1) * g.nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Marching squares at `level`, joined into polylines (cell units). Pad the field below `level` for closed rings. */
export function contours(v: Float32Array, nx: number, nz: number, level: number): [number, number][][] {
  const key = (p: [number, number]): string => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const at = (i: number, j: number): number => v[j * nx + i] - level;
  const lerp = (i0: number, j0: number, i1: number, j1: number): [number, number] => {
    const a = at(i0, j0), b = at(i1, j1), t = a / (a - b);
    return [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t];
  };
  const segs: [[number, number], [number, number]][] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = (at(i, j) > 0 ? 8 : 0) | (at(i + 1, j) > 0 ? 4 : 0) | (at(i + 1, j + 1) > 0 ? 2 : 0) | (at(i, j + 1) > 0 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const top = (): [number, number] => lerp(i, j, i + 1, j), right = (): [number, number] => lerp(i + 1, j, i + 1, j + 1);
    const bottom = (): [number, number] => lerp(i, j + 1, i + 1, j + 1), left = (): [number, number] => lerp(i, j, i, j + 1);
    const centre = at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1) > 0;
    const T: Record<number, [() => [number, number], () => [number, number]][]> = {
      1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 6: [[top, bottom]], 7: [[left, top]],
      8: [[left, top]], 9: [[top, bottom]], 11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
      5: centre ? [[left, top], [bottom, right]] : [[left, bottom], [top, right]],
      10: centre ? [[left, bottom], [top, right]] : [[left, top], [bottom, right]],
    };
    for (const [a, b] of T[c]) segs.push([a(), b()]);
  }
  // Join segments end to end.
  const byEnd = new Map<string, number[]>();
  segs.forEach((s, k) => { for (const p of s) { const kk = key(p); byEnd.set(kk, [...(byEnd.get(kk) ?? []), k]); } });
  const used = new Uint8Array(segs.length), lines: [number, number][][] = [];
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const line: [number, number][] = [segs[k][0], segs[k][1]];
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? line[line.length - 1] : line[0];
        const next = (byEnd.get(key(end)) ?? []).find((m) => !used[m]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = segs[next], p = key(a) === key(end) ? b : a;
        if (forward) line.push(p); else line.unshift(p);
      }
    }
    lines.push(line);
  }
  return lines;
}

export function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len === 1 && dx === 0 && dy === 0 ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

const n = (v: number): string => String(Math.round(v * 10) / 10);
export function toPath(lines: [number, number][][], closed: boolean): string {
  return lines.map((l) => {
    const pts = closed && l.length > 2 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1] ? l.slice(0, -1) : l;
    return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + (closed ? 'Z' : '');
  }).join('');
}

/** A compass direction "from" (deg, 0 = from the north) → its travel unit vector on the map (y down = south). */
const travel = (fromDeg: number): [number, number] => {
  const r = (fromDeg * Math.PI) / 180;
  return [-Math.sin(r), Math.cos(r)];
};

/** Three crests square to the swell, the nearest the brightest, spaced with the period and weighted with the size. */
export function swellCrests(fromDeg: number, periodS: number, sizeFt: number): { lines: [number, number][][]; widths: number[]; opacities: number[]; arrow: [number, number][] } {
  const [tx, ty] = travel(fromDeg), [px, py] = [-ty, tx], [cx, cy] = worldToMap(WOMB_LINEUP.x, WOMB_LINEUP.z);
  const gap = 6 + 1.6 * periodS, half = 70, lines: [number, number][][] = [], widths: number[] = [], opacities: number[] = [];
  for (let k = 0; k < 3; k++) {
    const back = 18 + gap * k, ox = cx - tx * back, oy = cy - ty * back;
    lines.push([[ox - px * half, oy - py * half], [ox + px * half, oy + py * half]]);
    widths.push(2 + 0.45 * Math.min(12, sizeFt));
    opacities.push(1 - 0.3 * k);
  }
  const a0: [number, number] = [cx - tx * (18 + gap * 2.6), cy - ty * (18 + gap * 2.6)];
  return { lines, widths, opacities, arrow: [a0, [cx - tx * 6, cy - ty * 6]] };
}

/** Arrows across the coast in the wind's direction; none when glassy (spec §7). */
export function windArrows(dirDeg: number, speedMs: number): { arrows: [number, number][][]; glassy: boolean } {
  if (speedMs < 1) return { arrows: [], glassy: true };
  const [tx, ty] = travel(dirDeg), len = 26, arrows: [number, number][][] = [];
  for (const [gx, gy] of [[260, 70], [300, 150], [260, 230], [210, 300]] as const) arrows.push([[gx - (tx * len) / 2, gy - (ty * len) / 2], [gx + (tx * len) / 2, gy + (ty * len) / 2]]);
  return { arrows, glassy: false };
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
const feet = (ft: number): string => `${Math.floor(ft)}${ft % 1 >= 0.5 ? '½' : ''}`;

export const swellLabel = (s: SessionSetup): string => `${compass(s.fromDeg)} · ${feet(s.swellFt)} FT · ${Math.round(s.periodS)} S`;

/** The wind row's direction (deg, from; glassy has none) and speed (m/s): Task 1's WIND_ROWS. */
export const windDirOf = (s: SessionSetup): number => WIND_ROWS[s.wind].fromDeg ?? 0;
export const windSpeedOf = (s: SessionSetup): number => (WIND_ROWS[s.wind].fromDeg === null ? 0 : WIND_ROWS[s.wind].kn * 0.514444);

/** "E · LIGHT OFFSHORE", or "GLASSY": the wind row's compass and label in caps. */
export function windLabel(s: SessionSetup): string {
  const w = WIND_ROWS[s.wind];
  return w.fromDeg === null ? 'GLASSY' : `${w.compass} · ${w.label.toUpperCase()}`;
}
```

```ts
// tools/bakeBreakMap.ts: bakes the map of the break (spec §7) from our own land and reef. Run from the repo root:
//   npm run bake:map   → public/ui/breakMap.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const { module: geom } = await runnerImport<typeof import('../src/frontend/mapGeom')>('/src/frontend/mapGeom.ts');
const { module: landData } = await runnerImport<typeof import('../src/land/landData')>('/src/land/landData.ts');
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: reef } = await runnerImport<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');

const land = landData.decodeLandFile(new Uint8Array(readFileSync('public/terrain/womb-land.bin')));
const bed = bathy.buildBathymetry(reef.DEFAULT_REEF_PARAMS);
const { MAP, worldToMap, mapCentre } = geom;
const STEP_PX = 2, PAD = 2; // sample every 2 map px (9.2 m), padded so every contour closes
const mainW = MAP.w - MAP.insetW, nx = Math.ceil(mainW / STEP_PX) + 1 + 2 * PAD, nz = Math.ceil(MAP.h / STEP_PX) + 1 + 2 * PAD;
const c = mapCentre();
const worldOf = (i: number, j: number): [number, number] => [c.x + ((i - PAD) * STEP_PX - mainW / 2) * MAP.mPerPx, c.z + ((j - PAD) * STEP_PX - MAP.h / 2) * MAP.mPerPx];
const pxOf = ([i, j]: [number, number]): [number, number] => [(i - PAD) * STEP_PX, (j - PAD) * STEP_PX];

function field(sample: (x: number, z: number) => number | null, padValue: number): Float32Array {
  const v = new Float32Array(nx * nz).fill(padValue);
  for (let j = PAD; j < nz - PAD; j++) for (let i = PAD; i < nx - PAD; i++) {
    const [x, z] = worldOf(i, j);
    v[j * nx + i] = sample(x, z) ?? padValue;
  }
  return v;
}
const landH = (x: number, z: number) => geom.bilinear(land.fine, land.fineHeights, x, z) ?? geom.bilinear(land.ring, land.ringHeights, x, z);
const seabed = (x: number, z: number) => geom.bilinear(bed.grid, bed.bed, x, z);
const path = (v: Float32Array, level: number, closed: boolean, tol = 0.6) =>
  geom.toPath(geom.contours(v, nx, nz, level).map((l) => geom.simplify(l.map(pxOf), tol)).filter((l) => l.length > 2), closed);

const landField = field(landH, -1000), deep = field((x, z) => { const b = seabed(x, z); return b === null ? null : -b; }, -1000);
const [px, py] = worldToMap(-25, 45);

// The inset: the whole ring's coastline (0 m) squeezed into the 78 px strip, the main view boxed in orange.
const R = land.ring, rnx = R.nx + 2, rnz = R.nz + 2, ringField = new Float32Array(rnx * rnz).fill(-1000);
for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) ringField[(j + 1) * rnx + i + 1] = land.ringHeights[j * R.nx + i];
const sx = (MAP.insetW - 12) / (R.nx * R.cellM), sy = (MAP.h - 40) / (R.nz * R.cellM), s = Math.min(sx, sy);
const inset = (wx: number, wz: number): [number, number] => [mainW + 6 + (wx - R.x0) * s, 20 + (wz - R.z0) * s];
const coast = geom.toPath(geom.contours(ringField, rnx, rnz, 0).map((l) => geom.simplify(l.map(([i, j]) => inset(R.x0 + (i - 1) * R.cellM, R.z0 + (j - 1) * R.cellM)), 0.4)).filter((l) => l.length > 2), false);
const [bx0, by0] = inset(c.x - (mainW / 2) * MAP.mPerPx, c.z - (MAP.h / 2) * MAP.mPerPx), [bx1, by1] = inset(c.x + (mainW / 2) * MAP.mPerPx, c.z + (MAP.h / 2) * MAP.mPerPx);

const data = {
  reef: { d3: path(deep, 3, true), d6: path(deep, 6, true), d9: path(deep, 9, true) },
  land: path(landField, 0, true), beach: path(landField, 0, false), dune20: path(landField, 20, false, 0.8),
  peak: [Math.round(px * 10) / 10, Math.round(py * 10) / 10],
  inset: { coast, box: [bx0, by0, bx1 - bx0, by1 - by0].map((v) => Math.round(v * 10) / 10), north: 'GRACETOWN', south: 'MARGARET R.' },
};
mkdirSync('public/ui', { recursive: true });
writeFileSync('public/ui/breakMap.json', JSON.stringify(data));
console.log(`breakMap.json: ${(JSON.stringify(data).length / 1024).toFixed(1)} KB`);
```

Add `"bake:map": "node tools/bakeBreakMap.ts"` to `package.json`'s scripts. The inset is this step's 30 km strip (spec §7). The Naturaliste–Leeuwin extension needs a tile download and is out of scope until Andrew approves it.

```ts
// src/frontend/ui/breakMap.ts
import type { LandSpot } from '../../surfer/placement';
import { MAP, swellCrests, swellLabel, windArrows, windDirOf, windLabel, windSpeedOf, worldToMap, type BreakMapData } from '../mapGeom';
import type { SessionSetup } from '../sessionSetup';

const NS = 'http://www.w3.org/2000/svg';
const line = (pts: [number, number][]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/** The map of the break, top-right inside the safe area (spec §7): the baked shapes, plus live swell and wind layers. */
export class BreakMap {
  readonly el = document.createElement('div');
  private readonly svg = document.createElementNS(NS, 'svg');
  private readonly swell = document.createElementNS(NS, 'g');
  private readonly wind = document.createElementNS(NS, 'g');
  private readonly lookout = document.createElementNS(NS, 'g');
  private readonly labels = { swell: document.createElement('div'), wind: document.createElement('div') };

  constructor() {
    Object.assign(this.el.style, { position: 'absolute', right: 'var(--fe-safe-x)', top: 'var(--fe-safe-y)', width: `${MAP.w}px`, height: `${MAP.h}px`, background: '#0d1a20', borderTop: '5px solid var(--fe-sun)' });
    this.svg.setAttribute('width', String(MAP.w));
    this.svg.setAttribute('height', String(MAP.h));
    this.svg.setAttribute('viewBox', `0 0 ${MAP.w} ${MAP.h}`);
    const lab = (el: HTMLElement, top: number): void => {
      Object.assign(el.style, { position: 'absolute', left: '14px', top: `${top}px`, font: '600 18px "Barlow Semi Condensed", sans-serif', letterSpacing: '0.12em', color: 'var(--fe-cream)' });
      this.el.appendChild(el);
    };
    this.el.appendChild(this.svg);
    lab(this.labels.swell, MAP.h - 56);
    lab(this.labels.wind, MAP.h - 30);
  }

  async load(url = '/ui/breakMap.json'): Promise<void> {
    const d: BreakMapData = await (await fetch(url)).json();
    const mainW = MAP.w - MAP.insetW;
    this.svg.innerHTML = `
      <defs>
        <clipPath id="fe-map-main"><rect width="${mainW}" height="${MAP.h}"/></clipPath>
        <marker id="fe-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ef7d2e"/></marker>
        <marker id="fe-arrow-c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#f7ecd2"/></marker>
      </defs>
      <g clip-path="url(#fe-map-main)">
        <path d="${d.land}" fill="#c9b48a" fill-rule="evenodd" opacity="0.9"/>
        <path d="${d.dune20}" fill="none" stroke="#8a7650" stroke-width="1.2"/>
        <path d="${d.beach}" fill="none" stroke="#f7ecd2" stroke-width="2"/>
        <path d="${d.reef.d3}" fill="none" stroke="#5fa3a8" stroke-width="1.2" stroke-dasharray="4 3"/>
        <path d="${d.reef.d6}" fill="none" stroke="#3f858b" stroke-width="1.2"/>
        <path d="${d.reef.d9}" fill="none" stroke="#2c6a70" stroke-width="1.2"/>
      </g>
      <circle cx="${d.peak[0]}" cy="${d.peak[1]}" r="6" fill="#ef7d2e"/>
      <text x="${d.peak[0] + 12}" y="${d.peak[1] - 8}" font-family="Knewave" font-size="22" fill="#f7ecd2">The Womb</text>
      <g transform="translate(${mainW - 70} 26)"><path d="M0 0h50" stroke="#f7ecd2" stroke-width="2.5"/><text x="25" y="22" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="600" font-size="18" fill="#f7ecd2">250 M</text></g>
      <g transform="translate(26 30)"><path d="M0 12 L7 -10 L14 12 L7 6 Z" fill="#f7ecd2"/><text x="7" y="32" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="600" font-size="18" fill="#f7ecd2">N</text></g>
      <rect x="${mainW}" width="${MAP.insetW}" height="${MAP.h}" fill="#0a1418"/>
      <path d="${d.inset.coast}" fill="none" stroke="#c9b48a" stroke-width="1.5"/>
      <rect x="${d.inset.box[0]}" y="${d.inset.box[1]}" width="${d.inset.box[2]}" height="${d.inset.box[3]}" fill="none" stroke="#ef7d2e" stroke-width="2"/>
      <text transform="translate(${MAP.w - 12} 18) rotate(90)" font-family="Barlow Semi Condensed" font-weight="600" font-size="18" letter-spacing="2" fill="#f7ecd2">${d.inset.north}</text>
      <text transform="translate(${MAP.w - 12} ${MAP.h - 130}) rotate(90)" font-family="Barlow Semi Condensed" font-weight="600" font-size="18" letter-spacing="2" fill="#f7ecd2">${d.inset.south}</text>`;
    this.svg.append(this.wind, this.swell, this.lookout);
  }

  setLookout(spot: LandSpot): void {
    const [x, y] = worldToMap(spot.x, spot.z);
    this.lookout.innerHTML = `<circle cx="${x}" cy="${y}" r="5" fill="#f7ecd2"/><text x="${x + 10}" y="${y + 6}" font-family="Barlow Semi Condensed" font-weight="600" font-size="18" letter-spacing="2" fill="#f7ecd2">LOOKOUT</text>`;
  }

  /** The live layers: re-drawn on each change, with the 140 ms value-change fade. */
  setConditions(s: SessionSetup, calm: boolean): void {
    const c = swellCrests(s.fromDeg, s.periodS, s.swellFt);
    this.swell.innerHTML = c.lines.map((l, k) => `<path d="${line(l)}" stroke="#ef7d2e" stroke-width="${c.widths[k].toFixed(1)}" opacity="${c.opacities[k]}" stroke-linecap="round"/>`).join('')
      + `<path d="${line(c.arrow)}" stroke="#ef7d2e" stroke-width="2.5" marker-end="url(#fe-arrow)"/>`;
    this.labels.swell.textContent = swellLabel(s);
    this.labels.wind.textContent = windLabel(s);
    const w = windArrows(windDirOf(s), windSpeedOf(s));
    this.wind.innerHTML = w.arrows.map((a) => `<path d="${line(a)}" stroke="#f7ecd2" stroke-width="2" opacity="0.85" marker-end="url(#fe-arrow-c)"/>`).join('');
    if (!calm) for (const g of [this.swell, this.wind]) g.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
  }
}
```


Append a self-test case to `frontEnd.selftest.ts`:

```ts
import { BreakMap } from './ui/breakMap';
import { presetById, FIRST_PRESET } from './sessionSetup';

registerSelfTest({
  name: 'frontend: the map loads, sits top-right inside the safe area, and its text is 18 px or more',
  async run() {
    return withRoot(1920, 1080, async (root, l) => {
      const m = new BreakMap();
      root.appendChild(m.el);
      await m.load();
      m.setConditions(presetById(FIRST_PRESET)!.setup, true);
      const b = designBox(m.el, root, l.scale);
      const tiny = [...m.el.querySelectorAll('text')].filter((t) => parseFloat(t.getAttribute('font-size') ?? '0') < 18);
      const inside = Math.abs(b.x + b.w - (l.designW - l.safeX)) < 1 && Math.abs(b.y - l.safeY) < 1;
      const reef = (m.el.querySelector('path[stroke-dasharray]')?.getAttribute('d') ?? '').length;
      return { pass: inside && tiny.length === 0 && reef > 20, detail: `box ${JSON.stringify(b)}, ${tiny.length} small labels, 3 m contour ${reef} chars` };
    });
  },
});
```

- [ ] **Step 4: Run the tests and the bake**

Run: `npx vitest run src/frontend/mapGeom.test.ts && npm run bake:map && npx tsc --noEmit`
Expected: PASS. The bake prints `breakMap.json: <size> KB`; under 60 KB. If it's larger, raise the simplify tolerances.

Then run `?selftest=frontend` and look at the map: crop it from a self-test screenshot, or open the dev console and render a `BreakMap` into `document.body`. The reef's contours ring the peak, the land is to the right (east), and the beach line is cream.
- If the reef contours are empty, the bathymetry grid sits outside the view: print `bed.grid` and move `mapCentre`.
- If the land fills the sea, the sign of the padded field is inverted: pad with +1000 and ledger it.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/mapGeom.ts src/frontend/mapGeom.test.ts tools/bakeBreakMap.ts public/ui/breakMap.json src/frontend/ui/breakMap.ts src/frontend/frontEnd.selftest.ts package.json
git commit -m "feat(frontend): the map of the break: reef contours, land and beach baked from our own data, live swell and wind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Choose your rider's slide panel

**Files:**
- Create: `src/frontend/riderView.ts`, `src/frontend/ui/slidePanel.ts`
- Modify: `src/frontend/frontEnd.selftest.ts` (append)
- Test: `src/frontend/riderView.test.ts`

**Interfaces:**
- Consumes: Task 3's `RIDER_COPY`, `RIDER_ORDER`, `stanceLabel`, `ridesLabel`, `crewNote`; Task 6's `FrontState`; `PRESETS` (`nickname`, `realName`); Task 16's `PointerIntent` pattern.
- Produces:
  - `interface RiderView { tabs: { rider: PresetName; label: string; focused: boolean }[]; nickname: string; realName: string; rows: { label: string; value: string }[]; line: string; note: string }`
  - `riderView(s: FrontState): RiderView`
  - `class SlidePanel { readonly el; constructor(onPointer: (p: { kind: 'rider'; rider: PresetName } | { kind: 'action'; action: FrontAction }) => void); render(s, calm: boolean): void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/riderView.test.ts
import { describe, expect, it } from 'vitest';
import { type FrontState, initialFront } from './frontEnd';
import { DEFAULT_CHOICES } from './frontSettings';
import { riderView } from './riderView';

const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), beat: 'rider', ...patch });

describe('Choose your rider\'s panel (spec §4.2)', () => {
  it('has the roster tabs in order, the focused one marked', () => {
    const v = riderView(front({ rider: 'female' }));
    expect(v.tabs.map((t) => t.label)).toEqual(['T-BONE', 'SHAZZA', 'GROMMET']);
    expect(v.tabs.filter((t) => t.focused).map((t) => t.rider)).toEqual(['female']);
  });
  it('locks up the nickname with the real name, then Stance, Rides, Style, Loves', () => {
    const v = riderView(front({ rider: 'grommet' }));
    expect(v.nickname).toBe('Grommet');
    expect(v.realName).toBe('Bradley');
    expect(v.rows.map((r) => r.label)).toEqual(['Stance', 'Rides', 'Style', 'Loves']);
    expect(v.rows[1].value).toBe('Bodyboard');
  });
  it('closes with the rider\'s line and the crew note', () => {
    const v = riderView(front({ rider: 'male' }));
    expect(v.line).toBe('Let\'s get pitted.');
    expect(v.note).toMatch(/paddles out together/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/riderView.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/riderView.ts
import { PRESETS, type PresetName } from '../surfer/presets';
import type { FrontState } from './frontEnd';
import { RIDER_COPY, RIDER_ORDER, crewNote, ridesLabel, stanceLabel } from './riderCopy';

export interface RiderView {
  tabs: { rider: PresetName; label: string; focused: boolean }[];
  nickname: string;
  realName: string;
  rows: { label: string; value: string }[];
  line: string;
  note: string;
}

export function riderView(s: FrontState): RiderView {
  const r = s.rider, c = RIDER_COPY[r];
  return {
    tabs: RIDER_ORDER.map((n) => ({ rider: n, label: PRESETS[n].nickname.toUpperCase(), focused: n === r })),
    nickname: PRESETS[r].nickname,
    realName: PRESETS[r].realName,
    rows: [{ label: 'Stance', value: stanceLabel(r) }, { label: 'Rides', value: ridesLabel(r) }, { label: 'Style', value: c.style }, { label: 'Loves', value: c.loves }],
    line: c.pickLine,
    note: crewNote(r),
  };
}
```

```ts
// src/frontend/ui/slidePanel.ts
import type { PresetName } from '../../surfer/presets';
import type { FrontAction, FrontState } from '../frontEnd';
import { glyphFor } from '../glyphs';
import { riderView } from '../riderView';
import type { Device } from '../uiInput';

type Intent = { kind: 'rider'; rider: PresetName } | { kind: 'action'; action: FrontAction };

/**
 * The panel from the right edge (spec §4.2): 900 px wide, a 110 px rake on its leading edge with a 6 px orange cut line,
 * near-opaque so the other two riders stay hidden behind it. Focus moves cross-fade its text; the panel itself stays.
 */
export class SlidePanel {
  readonly el = document.createElement('div');
  private readonly body = document.createElement('div');
  private shown: PresetName | null = null;
  private device: Device = 'keyboard';

  constructor(private readonly onPointer: (p: Intent) => void) {
    Object.assign(this.el.style, { position: 'absolute', right: '0', top: '0', bottom: '0', width: '900px' });
    const plate = document.createElement('div');
    Object.assign(plate.style, { position: 'absolute', inset: '0', background: 'rgba(16, 23, 26, 0.93)', clipPath: 'polygon(110px 0, 100% 0, 100% 100%, 0 100%)' });
    const cut = document.createElement('div');
    Object.assign(cut.style, { position: 'absolute', inset: '0', background: 'var(--fe-sun)', clipPath: 'polygon(110px 0, 116px 0, 6px 100%, 0 100%)' });
    Object.assign(this.body.style, { position: 'absolute', left: '170px', right: 'var(--fe-safe-x)', top: 'calc(var(--fe-safe-y) + 40px)', display: 'flex', flexDirection: 'column', gap: '24px' });
    this.el.append(plate, cut, this.body);
    this.el.addEventListener('pointerover', (e) => {
      const tab = (e.target as HTMLElement).closest('[data-rider]') as HTMLElement | null;
      if (tab) this.onPointer({ kind: 'rider', rider: tab.dataset.rider as PresetName });
    });
    this.el.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null;
      if (hit?.dataset.hit === 'tabMinus' || hit?.dataset.hit === 'tabPlus') this.onPointer({ kind: 'action', action: hit.dataset.hit });
      else if (hit?.dataset.rider) this.onPointer({ kind: 'action', action: 'confirm' });
    });
  }

  setDevice(d: Device): void {
    if (d !== this.device) { this.device = d; this.shown = null; }
  }

  render(s: FrontState, calm: boolean): void {
    if (this.shown === s.rider) return;
    const fade = this.shown !== null && !calm;
    this.shown = s.rider;
    const v = riderView(s);
    const tabs = document.createElement('div');
    tabs.className = 'fe-tabs';
    const tabGlyph = (a: 'tabMinus' | 'tabPlus'): HTMLElement => {
      const g = document.createElement('span');
      g.dataset.hit = a;
      g.innerHTML = glyphFor(this.device, a).svg;
      return g;
    };
    tabs.append(tabGlyph('tabMinus'), ...v.tabs.map((t) => {
      const el = document.createElement('span');
      el.className = `fe-tab${t.focused ? ' is-focus' : ''}`;
      el.dataset.rider = t.rider;
      el.dataset.hit = 'rider';
      el.textContent = t.label;
      return el;
    }), tabGlyph('tabPlus'));
    const lock = document.createElement('div');
    lock.innerHTML = `<div style="font: 400 calc(128px * var(--fe-text))/0.95 Knewave, sans-serif; text-shadow: 6px 6px 0 var(--fe-teal)"></div><div class="fe-line" style="font-size: calc(46px * var(--fe-text)); margin-top: 4px"></div>`;
    (lock.children[0] as HTMLElement).textContent = v.nickname;
    (lock.children[1] as HTMLElement).textContent = v.realName;
    const rows = document.createElement('div');
    Object.assign(rows.style, { display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: '18px', columnGap: '24px', alignItems: 'baseline' });
    for (const r of v.rows) {
      const l = document.createElement('span'), val = document.createElement('span');
      l.className = 'fe-label';
      l.textContent = r.label;
      val.style.font = '600 calc(32px * var(--fe-text))/1.25 "Barlow Semi Condensed", sans-serif';
      val.textContent = r.value;
      rows.append(l, val);
    }
    const line = document.createElement('div');
    line.className = 'fe-line';
    line.textContent = `“${v.line}”`;
    const note = document.createElement('div');
    Object.assign(note.style, { font: '500 calc(22px * var(--fe-text))/1.35 Barlow, sans-serif', opacity: '0.72', maxWidth: '560px' });
    note.textContent = v.note;
    const content = [tabs, lock, rows, line, note];
    if (fade) this.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
    this.body.replaceChildren(...content);
  }
}
```

Append to `frontEnd.selftest.ts`:

```ts
import { SlidePanel } from './ui/slidePanel';

registerSelfTest({
  name: 'frontend: the slide panel is 900 px from the right edge, its text inside the safe area and 18 px or more',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const p = new SlidePanel(() => {});
      root.appendChild(p.el);
      p.render({ ...initialFront(DEFAULT_CHOICES), beat: 'rider' }, true);
      const b = designBox(p.el, root, l.scale);
      const texts = [...p.el.querySelectorAll('span, div')].filter((e) => e.childElementCount === 0 && e.textContent);
      const tiny = texts.filter((t) => parseFloat(getComputedStyle(t).fontSize) < 18);
      const outside = texts.filter((t) => { const r = designBox(t, root, l.scale); return r.x + r.w > l.designW - l.safeX + 0.5 || r.y + r.h > l.designH - l.safeY + 0.5; });
      return { pass: Math.abs(b.w - 900) < 1 && Math.abs(b.x + b.w - l.designW) < 1 && tiny.length === 0 && outside.length === 0, detail: `box ${JSON.stringify(b)}, ${tiny.length} small, ${outside.length} outside` };
    });
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend && npx tsc --noEmit`, then `?selftest=frontend`.
Expected: PASS everywhere. If the Style line wraps past the bottom of the safe area at 200% text size (checked in Task 24), the rows' `rowGap` drops to 12 px at text scales above 1.5; Task 24's self-test catches it.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/riderView.ts src/frontend/riderView.test.ts src/frontend/ui/slidePanel.ts src/frontend/frontEnd.selftest.ts
git commit -m "feat(frontend): Choose your rider's slide panel: the roster tabs, the name lockup, the descriptors, the line and the crew note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Grab your gear's panel

**Files:**
- Create: `src/frontend/gearView.ts`, `src/frontend/ui/gearPanel.ts`
- Modify: `src/frontend/frontEnd.selftest.ts` (append)
- Test: `src/frontend/gearView.test.ts`

**Interfaces:**
- Consumes: Task 4's `fitOf`, `pickBoard`, `reasonLine`, `boardBars`, `specsLine`, `lengthLabel`, `BOARD_NAMES`; Task 6's `FrontState`, `gearRows`, `boardOf`; Task 1's `dateForMonth`, `MONTHS` (0-based months); `outfitFor`, `OUTFIT_LABELS` (`src/surfer/wardrobe.ts`); `PRESETS` (`quiver[kind].lengthIn`), `Outfit`; Task 3's `RIDER_COPY`, `chooseLine`.
- Produces:
  - `interface GearView { tab: 'board' | 'outfit'; rows: { id: string; name: string; detail: string; badge: 'IDEAL' | 'GOOD' | 'OK' | null; pick: string | null; season: string | null; focused: boolean; chosen: boolean }[]; bars: { paddle: number; hold: number; turn: number } | null; specs: string | null; note: string | null; line: { speaker: string; text: string } }`
  - `gearView(s: FrontState, today: Date, seed: number): GearView`
  - `class GearPanel { readonly el; constructor(onPointer: (p: { kind: 'gear'; index: number } | { kind: 'action'; action: FrontAction }) => void); render(v: GearView, device: Device, calm: boolean): void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/gearView.test.ts
import { describe, expect, it } from 'vitest';
import { type FrontState, initialFront } from './frontEnd';
import { DEFAULT_CHOICES } from './frontSettings';
import { gearView } from './gearView';
import { FIRST_PRESET, presetById } from './sessionSetup';

const today = new Date('2026-07-10T09:00:00+08:00');
const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), beat: 'gear', ...patch });

describe('Grab your gear\'s panel (spec §4.3, §8, §9)', () => {
  it('lists the quiver with lengths, fit badges, and the rider\'s pick marked', () => {
    const v = gearView(front({ rider: 'female' }), today, 1);
    expect(v.tab).toBe('board');
    expect(v.rows.map((r) => r.name)).toEqual(['Thruster', 'Step-up', 'Bodyboard']);
    expect(v.rows.every((r) => r.badge !== null)).toBe(true);
    expect(v.rows.filter((r) => r.pick).map((r) => r.pick)).toEqual(["Shazza's pick"]);
    expect(v.rows[0].detail).toMatch(/^\d'\d+"$/);
    expect(v.bars).not.toBeNull();
    expect(v.specs).toMatch(/ × .* · .* tail · /);
  });
  it('gives Grommet only his bodyboard, his pick', () => {
    const v = gearView(front({ rider: 'grommet' }), today, 1);
    expect(v.rows.map((r) => r.name)).toEqual(['Bodyboard']);
    expect(v.rows[0].pick).toBe("Grommet's pick");
  });
  it('lists the outfits on the Outfit tab, the month\'s marked "for July", with the looks-only note and no bars', () => {
    const v = gearView(front({ rider: 'female', gearTab: 'outfit' }), today, 1);
    expect(v.rows.length).toBe(3);
    expect(v.rows.filter((r) => r.season).map((r) => r.season)).toEqual(['for July']);
    expect(v.note).toBe('Looks only, no effect on your surfing.');
    expect(v.bars).toBeNull();
  });
  it('says why the rider picked the board, in their voice', () => {
    const s = front({ rider: 'female', setup: presetById(FIRST_PRESET)!.setup });
    const v = gearView(s, today, 3);
    expect(v.line.speaker).toBe('Shazza');
    expect(v.line.text.length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/gearView.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/gearView.ts
import type { BoardKind } from '../board/boardSpec';
import { type Outfit, PRESETS } from '../surfer/presets';
import { OUTFIT_LABELS, outfitFor } from '../surfer/wardrobe';
import { BOARD_NAMES, boardBars, fitOf, lengthLabel, pickBoard, reasonLine, specsLine } from './boardPick';
import { type FrontState, boardOf, gearRows } from './frontEnd';
import { RIDER_COPY, chooseLine } from './riderCopy';
import { MONTHS, dateForMonth } from './sessionSetup';

export interface GearView {
  tab: 'board' | 'outfit';
  rows: { id: string; name: string; detail: string; badge: 'IDEAL' | 'GOOD' | 'OK' | null; pick: string | null; season: string | null; focused: boolean; chosen: boolean }[];
  bars: { paddle: number; hold: number; turn: number } | null;
  specs: string | null;
  note: string | null;
  line: { speaker: string; text: string };
}

export function gearView(s: FrontState, today: Date, seed: number): GearView {
  const r = s.rider, p = PRESETS[r], name = p.nickname, { swellFt, periodS } = s.setup;
  const pick = pickBoard(r, swellFt, periodS);
  if (s.gearTab === 'board') {
    const kinds = gearRows(s) as BoardKind[], focused = kinds[s.gearFocus] ?? pick;
    return {
      tab: 'board',
      rows: kinds.map((k, i) => ({
        id: k, name: BOARD_NAMES[k], detail: lengthLabel(p.quiver[k]!.lengthIn), badge: fitOf(k, swellFt, periodS),
        pick: k === pick ? `${name}'s pick` : null, season: null, focused: i === s.gearFocus, chosen: k === boardOf(s, r),
      })),
      bars: boardBars(r, focused),
      specs: specsLine(r, focused),
      note: null,
      line: { speaker: name, text: reasonLine(r, pick, swellFt, seed) },
    };
  }
  const date = dateForMonth(s.setup.month, today), season = outfitFor(p, 'season', date), chosen = outfitFor(p, s.outfits[r] ?? 'season', date);
  const outfits = gearRows(s) as Outfit[], focused = outfits[s.gearFocus];
  const mate = r === 'male' ? 'female' : 'male';
  // A bikini or boardies in the WA winter (June–August; months are 0-based) gets a mate's tease (spec §9).
  const tease = focused !== season && (focused === 'bikini' || focused === 'boardies') && s.setup.month >= 5 && s.setup.month <= 7;
  return {
    tab: 'outfit',
    rows: outfits.map((o, i) => ({
      id: o, name: OUTFIT_LABELS[o], detail: '', badge: null, pick: null, season: o === season ? `for ${MONTHS[s.setup.month]}` : null,
      focused: i === s.gearFocus, chosen: o === chosen,
    })),
    bars: null,
    specs: null,
    note: 'Looks only, no effect on your surfing.',
    line: tease ? { speaker: PRESETS[mate].nickname, text: chooseLine(RIDER_COPY[mate].teaseLines, seed) } : { speaker: name, text: reasonLine(r, pick, swellFt, seed) },
  };
}
```

```ts
// src/frontend/ui/gearPanel.ts
import type { FrontAction } from '../frontEnd';
import type { GearView } from '../gearView';
import { glyphFor } from '../glyphs';
import type { Device } from '../uiInput';

type Intent = { kind: 'gear'; index: number } | { kind: 'action'; action: FrontAction };
const BADGE_BG: Record<'IDEAL' | 'GOOD' | 'OK', string> = { IDEAL: 'var(--fe-teal)', GOOD: 'rgba(247, 236, 210, 0.22)', OK: 'rgba(247, 236, 210, 0.1)' };

/** Grab your gear's right panel over its scrim: the tabs, the rows, the bars, the specs line (spec §4.3). */
export class GearPanel {
  readonly el = document.createElement('div');
  private readonly col = document.createElement('div');
  private key = '';

  constructor(private readonly onPointer: (p: Intent) => void) {
    const scrim = document.createElement('div');
    scrim.className = 'fe-scrim-right';
    Object.assign(this.col.style, { position: 'absolute', right: 'var(--fe-safe-x)', top: 'calc(var(--fe-safe-y) + 40px)', width: '760px', display: 'flex', flexDirection: 'column', gap: '20px' });
    this.el.append(scrim, this.col);
    this.el.addEventListener('pointerover', (e) => {
      const row = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
      if (row) this.onPointer({ kind: 'gear', index: Number(row.dataset.index) });
    });
    this.el.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null;
      if (!hit) return;
      if (hit.dataset.index !== undefined) this.onPointer({ kind: 'action', action: 'confirm' });
      else this.onPointer({ kind: 'action', action: hit.dataset.hit as FrontAction });
    });
  }

  render(v: GearView, device: Device, calm: boolean): void {
    const key = device + JSON.stringify(v);
    if (key === this.key) return;
    this.key = key;
    const tabs = document.createElement('div');
    tabs.className = 'fe-tabs';
    const glyph = (a: 'tabMinus' | 'tabPlus' | 'toggle'): HTMLElement => {
      const g = document.createElement('span');
      g.dataset.hit = a;
      g.innerHTML = glyphFor(device, a).svg;
      return g;
    };
    const tab = (label: string, on: boolean): HTMLElement => {
      const t = document.createElement('span');
      t.className = `fe-tab${on ? ' is-focus' : ''}`;
      t.textContent = label;
      return t;
    };
    tabs.append(glyph('tabMinus'), tab('Board', v.tab === 'board'), tab('Outfit', v.tab === 'outfit'), glyph('tabPlus'));
    const rows = v.rows.map((r, i) => {
      const el = document.createElement('div');
      el.className = `fe-row${r.focused ? ' is-focus' : ''}`;
      el.dataset.index = String(i);
      el.dataset.hit = 'row';
      el.style.gridTemplateColumns = '1fr auto auto';
      const name = document.createElement('span');
      name.className = 'fe-value';
      name.textContent = r.name;
      if (r.detail) {
        const d = document.createElement('span');
        d.className = 'fe-small';
        d.textContent = r.detail;
        name.appendChild(d);
      }
      const mark = document.createElement('span');
      mark.style.font = '600 calc(22px * var(--fe-text))/1 "Barlow Semi Condensed", sans-serif';
      mark.style.color = r.focused ? 'var(--fe-ink)' : 'var(--fe-sun)';
      mark.textContent = r.pick ?? r.season ?? '';
      const badge = document.createElement('span');
      if (r.badge) {
        badge.textContent = r.badge;
        Object.assign(badge.style, { font: '700 calc(19px * var(--fe-text))/1 "Barlow Semi Condensed", sans-serif', letterSpacing: '0.12em', padding: '6px 10px', borderRadius: 'var(--fe-radius)', background: BADGE_BG[r.badge], color: 'var(--fe-cream)' });
      }
      el.append(name, mark, badge);
      return el;
    });
    const extra: HTMLElement[] = [];
    if (v.bars) {
      const bars = document.createElement('div');
      Object.assign(bars.style, { display: 'grid', gridTemplateColumns: '120px auto', rowGap: '12px', columnGap: '24px', alignItems: 'center', marginTop: '12px' });
      for (const [label, n] of [['Paddle', v.bars.paddle], ['Hold', v.bars.hold], ['Turn', v.bars.turn]] as const) {
        const l = document.createElement('span');
        l.className = 'fe-label';
        l.textContent = label;
        const segs = document.createElement('span');
        segs.style.display = 'flex';
        segs.style.gap = '6px';
        for (let k = 1; k <= 5; k++) {
          const sgm = document.createElement('span');
          Object.assign(sgm.style, { width: '44px', height: '14px', transform: 'skewX(-18deg)', background: k <= n ? 'var(--fe-sun)' : 'rgba(247, 236, 210, 0.18)' });
          segs.appendChild(sgm);
        }
        bars.append(l, segs);
      }
      extra.push(bars);
    }
    if (v.specs) {
      const sp = document.createElement('div');
      Object.assign(sp.style, { display: 'flex', gap: '12px', alignItems: 'center' });
      const t = document.createElement('span');
      t.className = 'fe-small';
      t.textContent = v.specs;
      sp.append(glyph('toggle'), t);
      extra.push(sp);
    }
    if (v.note) {
      const n = document.createElement('div');
      Object.assign(n.style, { font: '500 calc(22px * var(--fe-text))/1.35 Barlow, sans-serif', opacity: '0.72' });
      n.textContent = v.note;
      extra.push(n);
    }
    this.col.replaceChildren(tabs, ...rows, ...extra);
    if (!calm) rows.slice(0, 6).forEach((r, i) => r.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 280, delay: 35 * i, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', fill: 'backwards' }));
  }
}
```

The bars and specs toggle (RS / Tab, `showSpecs` in the state): the bars show when `showSpecs` is false and the specs line when it's true. Pass `showSpecs` through `GearView` (`bars: s.showSpecs ? null : boardBars(...)`, `specs: s.showSpecs ? specsLine(...) : null`), and assert both states in `gearView.test.ts`:

```ts
it('toggles between the bars and the specs line', () => {
  expect(gearView(front({ rider: 'female', showSpecs: false }), today, 1)).toMatchObject({ specs: null });
  expect(gearView(front({ rider: 'female', showSpecs: true }), today, 1)).toMatchObject({ bars: null });
});
```

Then change the first test's `expect(v.specs)` to run on a `showSpecs: true` state.

Append to `frontEnd.selftest.ts`:

```ts
import { GearPanel } from './ui/gearPanel';
import { gearView } from './gearView';

registerSelfTest({
  name: 'frontend: the gear panel\'s rows and bars are inside the safe area and 18 px or more',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const p = new GearPanel(() => {});
      root.appendChild(p.el);
      p.render(gearView({ ...initialFront(DEFAULT_CHOICES), beat: 'gear' }, new Date('2026-07-10T09:00:00+08:00'), 1), 'xbox', true);
      const texts = [...p.el.querySelectorAll('span, div')].filter((e) => e.childElementCount === 0 && e.textContent);
      const tiny = texts.filter((t) => parseFloat(getComputedStyle(t).fontSize) < 18);
      const outside = texts.filter((t) => { const r = designBox(t, root, l.scale); return r.x + r.w > l.designW - l.safeX + 0.5 || r.y + r.h > l.designH - l.safeY + 0.5; });
      return { pass: tiny.length === 0 && outside.length === 0 && p.el.querySelectorAll('[data-index]').length === 3, detail: `${tiny.length} small, ${outside.length} outside` };
    });
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend && npx tsc --noEmit`, then `?selftest=frontend`.
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/gearView.ts src/frontend/gearView.test.ts src/frontend/ui/gearPanel.ts src/frontend/frontEnd.selftest.ts
git commit -m "feat(frontend): Grab your gear's panel: the quiver with fit badges and the pick, the bars or the specs, the outfits with the month's

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 20: UI sounds, the UI bus, haptics and the music slot

**Files:**
- Create: `src/frontend/uiSounds.ts`
- Modify: `src/sound/AudioEngine.ts` (the `ui` group), `src/sound/SoundSystem.ts` (`uiOut()`, `setFrontEndMusic()`), `src/sound/musicFiles.ts` (the `FRONT_END_TRACK` slot), `src/frontend/frontEnd.selftest.ts` (append)
- Test: `src/frontend/uiSounds.test.ts`, `src/sound/SoundSystem.test.ts` (append)

**Interfaces:**
- Consumes: `AudioEngine`, `SoundSystem`, `MusicPlayer.pause()/play()`; Task 6's `FrontEvent`.
- Produces:
  - `type UiSound = 'focus' | 'value' | 'end' | 'confirm' | 'back' | 'swing' | 'pick'`
  - `UI_SOUND_MS: Record<UiSound, number>` (focus 40, value 40, end 90, confirm 250, back 150, swing 1600, pick 250)
  - `valuePitchHz(step: number): number` (+1 semitone per step up from 660 Hz)
  - `focusDetune(r: number): number` (±100 cents from a 0–1 random)
  - `soundFor(e: FrontEvent): UiSound | null`
  - `class UiSounds { constructor(ctx: BaseAudioContext, out: AudioNode, rng?: () => number); play(s: UiSound, opts?: { step?: number; durS?: number; at?: number }): void; voice(lineId: string): boolean }`
  - `VOICE_FILES: Readonly<Record<string, string>>` (empty this step: the VO hook plays nothing)
  - `hapticPulse(): void` (40 ms light pulse on the last pad that sent input, where supported)
  - `AudioEngine.groups.ui` (into master, beside music; not muffled, not faded on pause)
  - `SoundSystem.uiOut(): { ctx: BaseAudioContext; out: AudioNode } | null` (null until the audio runs)
  - `SoundSystem.setFrontEndMusic(on: boolean): void`
  - `FRONT_END_TRACK: string | null` (null this step: nothing plays)

- [ ] **Step 1: Write the failing tests**

```ts
// src/frontend/uiSounds.test.ts
import { describe, expect, it } from 'vitest';
import { UI_SOUND_MS, VOICE_FILES, focusDetune, soundFor, valuePitchHz } from './uiSounds';

describe('the UI sounds (spec §12)', () => {
  it('has the spec\'s lengths', () => {
    expect(UI_SOUND_MS).toMatchObject({ focus: 40, value: 40, confirm: 250, back: 150 });
  });
  it('rises a semitone per value step and wobbles the focus tick by at most one', () => {
    expect(valuePitchHz(0)).toBeCloseTo(660, 6);
    expect(valuePitchHz(12)).toBeCloseTo(1320, 6);
    expect(valuePitchHz(1) / valuePitchHz(0)).toBeCloseTo(2 ** (1 / 12), 9);
    expect(focusDetune(0)).toBe(-100);
    expect(focusDetune(1)).toBe(100);
  });
  it('has the VO hook, and no recorded lines ship this step', () => {
    expect(VOICE_FILES).toEqual({});
  });
  it('maps the state machine\'s events to sounds', () => {
    expect(soundFor({ kind: 'focus' })).toBe('focus');
    expect(soundFor({ kind: 'value', row: 'swell', dir: 1 })).toBe('value');
    expect(soundFor({ kind: 'end', row: 'tide' })).toBe('end');
    expect(soundFor({ kind: 'move', from: 'conditions', to: 'rider' })).toBe('swing');
    expect(soundFor({ kind: 'pick', rider: 'female' })).toBe('pick');
    expect(soundFor({ kind: 'back' })).toBe('back');
    expect(soundFor({ kind: 'chosen' })).toBe('confirm');
    expect(soundFor({ kind: 'landed', beat: 'rider' })).toBeNull();
  });
});
```

Append to `src/sound/SoundSystem.test.ts`:

```ts
describe('the front end\'s music slot (spec §12)', () => {
  it('pauses the playlist while the front end is open (no front-end track ships), and plays it again after', () => {
    const { ctx, audio } = fakeAudio();
    const tracks = [{ album: 'a', number: 1, title: 'One', url: 'u1' }];
    const s = new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, tracks, audio);
    s.gesture();
    ctx.allow();
    s.update(scene, listener, 0.016);
    s.setFrontEndMusic(true);
    expect(s.status.track).not.toBe('click for sound');
    expect((s as unknown as { frontEndMusic: boolean }).frontEndMusic).toBe(true);
    s.setFrontEndMusic(false);
    expect((s as unknown as { frontEndMusic: boolean }).frontEndMusic).toBe(false);
  });
  it('has no UI output until the audio runs', () => {
    expect(new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, []).uiOut()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/frontend/uiSounds.test.ts src/sound/SoundSystem.test.ts`
Expected: FAIL. `uiSounds` doesn't exist and `setFrontEndMusic` isn't defined.

- [ ] **Step 3: Write the implementation**

`src/sound/AudioEngine.ts`:
- `SoundGroup` gains `'ui'`;
- in the constructor, `ui: group(this.master)` joins the groups;
- update the header comment: "the UI → master (never muffled or paused: the front end and pause menus speak over everything)".

`apply`'s volume settings don't touch `ui`. Its level is fixed at 1 under the master. `SoundSystem`'s `SoundAudio['engine']` return type gains `groups: { music: AudioNode; ui: AudioNode }`; add `ui: {} as AudioNode` to the test's `fakeAudio`.

`src/sound/musicFiles.ts`:

```ts
/** The front end's track slot (dune select spec §12). None ships this step: the front end is quiet but for the sea. */
export const FRONT_END_TRACK: string | null = null;
```

`src/sound/SoundSystem.ts`:

```ts
  private frontEndMusic = false;
  private resumeMusic = false;

  /** The UI bus, once the audio is running (dune select spec §12). */
  uiOut(): { ctx: BaseAudioContext; out: AudioNode } | null {
    return this.running && this.ctx && this.engine ? { ctx: this.ctx as unknown as BaseAudioContext, out: this.engine.groups.ui } : null;
  }

  /** The front end's music slot: its own track if one ships (none this step), the playlist paused meanwhile. */
  setFrontEndMusic(on: boolean): void {
    if (on === this.frontEndMusic) return;
    this.frontEndMusic = on;
    if (!this.music) return;
    if (on) {
      this.resumeMusic = this.music.status !== 'no music' && (this.music as unknown as { wantPlaying: boolean }).wantPlaying;
      this.music.pause();
    } else if (this.resumeMusic) this.music.play();
  }
```

Expose `wantPlaying` on `MusicPlayer` as a public getter (`get playing(): boolean { return this.wantPlaying; }`) and use `this.music.playing` instead of the cast. If audio starts while the front end is open, the `start` path checks `frontEndMusic` and skips `this.music?.play()`.

```ts
// src/frontend/uiSounds.ts: the front end's sounds, synthesised in WebAudio (spec §12: licence-clean, no samples).
import type { FrontEvent } from './frontEnd';

export type UiSound = 'focus' | 'value' | 'end' | 'confirm' | 'back' | 'swing' | 'pick';
export const UI_SOUND_MS: Record<UiSound, number> = { focus: 40, value: 40, end: 90, confirm: 250, back: 150, swing: 1600, pick: 250 };

export const valuePitchHz = (step: number): number => 660 * 2 ** (step / 12);
export const focusDetune = (r: number): number => Math.round((r * 2 - 1) * 100);

export function soundFor(e: FrontEvent): UiSound | null {
  switch (e.kind) {
    case 'focus': case 'riderFocus': return 'focus';
    case 'value': case 'roll': case 'details': return 'value';
    case 'end': return 'end';
    case 'move': return 'swing';
    case 'pick': return 'pick';
    case 'back': return 'back';
    case 'chosen': case 'paddleOut': return 'confirm';
    default: return null;
  }
}

/** −12 dB under the confirm (spec §12). */
const FOCUS_GAIN = 10 ** (-12 / 20);

/** The riders' recorded lines by id (spec §12's VO hook). None ship this step. */
export const VOICE_FILES: Readonly<Record<string, string>> = {};

export class UiSounds {
  private readonly noise: AudioBuffer;
  private valueStep = 0;

  constructor(private readonly ctx: BaseAudioContext, private readonly out: AudioNode, private readonly rng: () => number = Math.random) {
    this.noise = new AudioBuffer({ length: ctx.sampleRate, sampleRate: ctx.sampleRate, numberOfChannels: 1 });
    const d = this.noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
  }

  /** Plays a rider's recorded line if one exists (none ship this step); true when it played. */
  voice(lineId: string): boolean {
    const url = VOICE_FILES[lineId];
    if (!url) return false;
    const el = new Audio(url);
    void el.play().catch(() => {});
    return true;
  }

  play(s: UiSound, opts: { step?: number; durS?: number; at?: number } = {}): void {
    const t = opts.at ?? this.ctx.currentTime;
    if (s === 'focus') this.click(t, 1800, focusDetune(this.rng()), FOCUS_GAIN * 0.5, 0.04);
    else if (s === 'value') this.click(t, valuePitchHz(opts.step ?? (this.valueStep = (this.valueStep + 1) % 12)), 0, FOCUS_GAIN * 0.6, 0.04);
    else if (s === 'end') this.thud(t);
    else if (s === 'confirm' || s === 'pick') this.knock(t, s === 'pick' ? 0.6 : 1);
    else if (s === 'back') this.fall(t);
    else this.whoosh(t, opts.durS ?? 1.6);
  }

  /** A soft wooden click: a short sine blip through a resonant band-pass. */
  private click(t: number, hz: number, cents: number, gain: number, len: number): void {
    const o = new OscillatorNode(this.ctx, { type: 'triangle', frequency: hz, detune: cents });
    const bp = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: hz, Q: 6 });
    const g = new GainNode(this.ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(bp).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.01);
  }

  /** End of range: a dull, low thud. */
  private thud(t: number): void {
    const o = new OscillatorNode(this.ctx, { type: 'sine', frequency: 140 });
    const g = new GainNode(this.ctx, { gain: 0 });
    o.frequency.exponentialRampToValueAtTime(80, t + 0.09);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  /** Confirm: a warm board-knock (a low resonant body and a short bright tap) with a wax-scrape tail. */
  private knock(t: number, level: number): void {
    const body = new OscillatorNode(this.ctx, { type: 'sine', frequency: 190 });
    const bg = new GainNode(this.ctx, { gain: 0 });
    body.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.5 * level, t + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    body.connect(bg).connect(this.out);
    body.start(t);
    body.stop(t + 0.22);
    this.click(t, 2400, 0, 0.25 * level, 0.03);
    const n = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    const hp = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 3200, Q: 0.8 });
    const ng = new GainNode(this.ctx, { gain: 0 });
    ng.gain.setValueAtTime(0, t + 0.05);
    ng.gain.linearRampToValueAtTime(0.06 * level, t + 0.09);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(hp).connect(ng).connect(this.out);
    n.start(t + 0.05);
    n.stop(t + 0.26);
  }

  /** Back: lower, falling. */
  private fall(t: number): void {
    const o = new OscillatorNode(this.ctx, { type: 'triangle', frequency: 520 });
    const g = new GainNode(this.ctx, { gain: 0 });
    o.frequency.exponentialRampToValueAtTime(260, t + 0.15);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.16);
  }

  /** The camera swing: a soft wind-and-swell whoosh over the move. */
  private whoosh(t: number, dur: number): void {
    const n = new AudioBufferSourceNode(this.ctx, { buffer: this.noise, loop: true });
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 400, Q: 0.7 });
    const g = new GainNode(this.ctx, { gain: 0 });
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(lp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + dur + 0.02);
  }
}

/** One 40 ms light pulse on confirm (spec §12), on every connected pad that supports it. Nothing on focus moves. */
export function hapticPulse(): void {
  for (const p of navigator.getGamepads?.() ?? []) {
    const a = (p as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    void a?.playEffect?.('dual-rumble', { duration: 40, weakMagnitude: 0.35, strongMagnitude: 0 }).catch(() => {});
  }
}
```

Append a self-test to `frontEnd.selftest.ts`. It renders each sound in an `OfflineAudioContext` and checks it's audible, about as long as the spec says, and the focus tick sits about 12 dB under the confirm:

```ts
import { UI_SOUND_MS, UiSounds, type UiSound } from './uiSounds';

registerSelfTest({
  name: 'frontend: the UI sounds render, their lengths match, the focus tick sits about 12 dB under the confirm',
  async run() {
    const rms = async (s: UiSound): Promise<{ rms: number; lenMs: number }> => {
      const ctx = new OfflineAudioContext(1, 48000 * 2, 48000);
      new UiSounds(ctx, ctx.destination, () => 0.5).play(s, { durS: 1.6 });
      const d = (await ctx.startRendering()).getChannelData(0);
      let sum = 0, last = 0;
      for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; if (Math.abs(d[i]) > 1e-4) last = i; }
      return { rms: Math.sqrt(sum / Math.max(1, last)), lenMs: (last / 48000) * 1000 };
    };
    const out: string[] = [];
    let pass = true;
    for (const s of ['focus', 'value', 'end', 'confirm', 'back', 'swing'] as const) {
      const r = await rms(s);
      const ok = r.rms > 1e-3 && r.lenMs <= UI_SOUND_MS[s] * 1.15 + 15;
      pass &&= ok;
      out.push(`${s} ${r.lenMs.toFixed(0)} ms rms ${r.rms.toFixed(4)}${ok ? '' : ' ✗'}`);
    }
    const f = await rms('focus'), c = await rms('confirm'), db = 20 * Math.log10(f.rms / c.rms);
    pass &&= db < -8 && db > -18;
    return { pass, detail: `${out.join('; ')}; focus vs confirm ${db.toFixed(1)} dB` };
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend/uiSounds.test.ts src/sound && npx tsc --noEmit`, then `?selftest=frontend`.
Expected: PASS everywhere. If the focus-vs-confirm level misses its window, change `FOCUS_GAIN`'s multiplier, not the spec's −12 dB, and ledger the value.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/uiSounds.ts src/frontend/uiSounds.test.ts src/sound/AudioEngine.ts src/sound/SoundSystem.ts src/sound/SoundSystem.test.ts src/sound/musicFiles.ts src/sound/musicPlayer.ts src/frontend/frontEnd.selftest.ts
git commit -m "feat(sound): the front end's synthesised UI sounds on a UI bus, the confirm haptic, and the front end's music slot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: The orchestration: the conditions gate and the front end's core

**Files:**
- Create: `src/frontend/conditionsGate.ts`, `src/frontend/frontEndCore.ts`, `src/frontend/FrontEnd.ts`
- Test: `src/frontend/conditionsGate.test.ts`, `src/frontend/frontEndCore.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–20. Specifically:
  - `step`, `tick`, `focusTo`, `choiceOf`, `savedOf`, `BEAT_MOVE_S`, `CALM_MOVE_S`;
  - `toConditions`;
  - `crewFor`, `conditionsShot`, `riderShot`, `gearShot`, `easePose`, `stagingReady`;
  - `stagingFor`, `TURN_S`, `PICK_S`;
  - `lineFor`, `gearView`;
  - `soundFor`;
  - `loadJson`, `saveJson`, `sanitizeChoices`, `sanitizeFrontSettings`, `FRONT_CHOICES_KEY`, `FRONT_SETTINGS_KEY`;
  - the UI components;
  - `UiInput`.
- Produces:
  - `class ConditionsGate { constructor(quietMs = 200, gapMs = 200); edit(nowMs: number): void; due(nowMs: number): boolean }`
  - ```ts
    interface FrontEndHost {
      standSpot(): LandSpot | null;
      groundAt(x: number, z: number): number | null;
      baseConditions(): Readonly<Conditions>;
      applyConditions(c: Conditions): void;
      stage(staging: GangStaging | null, pose: CameraPose | null): void;
      paddleOut(choice: SessionChoice): void;
    }
    ```
  - `interface CoreCue { events: FrontEvent[]; sounds: UiSound[]; line: { speaker: PresetName; text: string } | null; haptic: boolean; settings: boolean; landed: Beat | null }`
  - `class FrontEndCore { constructor(host, saved: SavedChoices, opts: { today: Date; seed: number; calm: boolean; storage: SettingsStorage | null }); readonly state: FrontState; act(a: FrontAction, nowMs): CoreCue; pointer(target, nowMs): CoreCue; update(dtS, nowMs): CoreCue; setCalm(on: boolean): void }`
  - `class FrontEnd { constructor(host: FrontEndHost, parent: HTMLElement, sound: { uiOut(): { ctx: BaseAudioContext; out: AudioNode } | null; setFrontEndMusic(on: boolean): void }, storage: SettingsStorage | null); readonly isOpen: boolean; open(): void; update(dtS: number): void; close(): void; resize(w: number, h: number): void }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/frontend/conditionsGate.test.ts
import { describe, expect, it } from 'vitest';
import { ConditionsGate } from './conditionsGate';

describe('the conditions gate (spec §6.10; Review Focus 4: a held key repeating)', () => {
  it('applies 200 ms after the last change, once', () => {
    const g = new ConditionsGate();
    g.edit(0);
    expect(g.due(150)).toBe(false);
    expect(g.due(200)).toBe(true);
    expect(g.due(400)).toBe(false);
  });
  it('never applies once per repeat: a key held 3 s at 80 ms repeats applies once, after the release', () => {
    const g = new ConditionsGate();
    let applies = 0;
    for (let t = 0; t <= 3000; t += 16) {
      if (t % 80 === 0) g.edit(t);
      if (g.due(t)) applies++;
    }
    expect(applies).toBe(0);
    for (let t = 3016; t <= 3400; t += 16) if (g.due(t)) applies++;
    expect(applies).toBe(1);
  });
  it('keeps two applies at least 200 ms apart', () => {
    const g = new ConditionsGate();
    const at: number[] = [];
    for (const e of [0, 250, 460, 900]) {
      g.edit(e);
      for (let t = e; t < e + 400; t += 10) if (g.due(t)) { at.push(t); break; }
    }
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(200);
  });
});
```

```ts
// src/frontend/frontEndCore.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { DEFAULT_CHOICES } from './frontSettings';
import { type FrontEndHost, FrontEndCore } from './frontEndCore';

function fakeHost(landReady = true) {
  const calls = { applied: 0, staged: 0, stagedNull: 0, paddled: [] as unknown[] };
  let ready = landReady;
  const host: FrontEndHost = {
    standSpot: () => (ready ? { x: 300, z: 50, headingDeg: 90 } : null),
    groundAt: (x) => (ready ? 20 + 0.01 * x : null),
    baseConditions: () => DEFAULT_CONDITIONS,
    applyConditions: () => { calls.applied++; },
    stage: (s) => { calls.staged++; if (!s) calls.stagedNull++; },
    paddleOut: (c) => { calls.paddled.push(c); },
  };
  return { host, calls, makeReady: () => { ready = true; } };
}
const opts = { today: new Date('2026-07-10T09:00:00+08:00'), seed: 1, calm: false, storage: null };

describe('the front end\'s core (spec §3, §6.10)', () => {
  it('holds a still frame, never throws, while the land and tracks aren\'t ready, then stages (Review Focus 3)', () => {
    const { host, calls, makeReady } = fakeHost(false);
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    expect(() => { for (let t = 0; t < 1000; t += 16) core.update(0.016, t); }).not.toThrow();
    expect(calls.staged - calls.stagedNull).toBe(0);
    makeReady();
    core.update(0.016, 1016);
    expect(calls.staged - calls.stagedNull).toBeGreaterThan(0);
  });
  it('applies the world\'s conditions once for a held Swell, after the release (Review Focus 4)', () => {
    const { host, calls } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    for (let k = 0; k < 5; k++) core.act('down', 0);
    const before = calls.applied;
    for (let t = 0; t <= 2000; t += 16) {
      if (t % 80 === 0) core.act('right', t);
      core.update(0.016, t);
    }
    expect(calls.applied - before).toBe(0);
    for (let t = 2016; t <= 2400; t += 16) core.update(0.016, t);
    expect(calls.applied - before).toBe(1);
  });
  it('paddles out on START with every remaining choice at its default', () => {
    const { host, calls } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    core.act('start', 0);
    for (let t = 0; t < 3000; t += 16) core.update(0.016, t);
    expect(calls.paddled.length).toBe(1);
    expect(calls.paddled[0]).toMatchObject({ rider: 'female' });
  });
  it('cues a focus tick, a value tick, the swing on a move, a line on a value change, and the haptic on confirm', () => {
    const { host } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    expect(core.act('down', 0).sounds).toContain('focus');
    const v = core.act('right', 10);
    expect(v.sounds).toContain('value');
    expect(v.line?.text.length).toBeGreaterThan(3);
    const c = core.act('confirm', 20);
    expect(c.sounds).toContain('swing');
    expect(c.haptic).toBe(true);
  });
  it('remembers the choices on paddle out', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    const { host } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, { ...opts, storage });
    core.act('start', 0);
    for (let t = 0; t < 3000; t += 16) core.update(0.016, t);
    expect(store.get('liquid-dreams.front-choices.v1')).toContain('"rider":"female"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/frontend/conditionsGate.test.ts src/frontend/frontEndCore.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/conditionsGate.ts
/**
 * When a Conditions edit reaches the world (spec §6.10): 200 ms after the last change, and never two applies within
 * 200 ms. A held key repeating every 80 ms therefore applies once, after it's released.
 */
export class ConditionsGate {
  private lastEditMs = -Infinity;
  private lastApplyMs = -Infinity;
  private pending = false;

  constructor(private readonly quietMs = 200, private readonly gapMs = 200) {}

  edit(nowMs: number): void {
    this.lastEditMs = nowMs;
    this.pending = true;
  }

  due(nowMs: number): boolean {
    if (!this.pending || nowMs - this.lastEditMs < this.quietMs || nowMs - this.lastApplyMs < this.gapMs) return false;
    this.pending = false;
    this.lastApplyMs = nowMs;
    return true;
  }
}
```

```ts
// src/frontend/frontEndCore.ts: the front end without the DOM: the state machine, the world, the crew and the camera.
import type { Conditions } from '../conditions/types';
import type { SettingsStorage } from '../dev/devSettings';
import type { CameraPose } from '../dev/momentLink';
import type { LandSpot } from '../surfer/placement';
import type { PresetName } from '../surfer/presets';
import { conditionsShot, crewFor, easePose, gearShot, riderShot } from './beatCamera';
import { ConditionsGate } from './conditionsGate';
import { lineFor } from './conditionsView';
import { type Beat, type FrontAction, type FrontEvent, type FrontState, type SessionChoice, focusTo, initialFront, savedOf, step, tick } from './frontEnd';
import { FRONT_CHOICES_KEY, type SavedChoices, saveJson } from './frontSettings';
import { gearView } from './gearView';
import { toConditions } from './sessionSetup';
import { type GangStaging, PICK_S, TURN_S, stagingFor } from './staging';
import { type UiSound, soundFor } from './uiSounds';

export interface FrontEndHost {
  /** The stand spot; null until the land and its tracks have loaded. */
  standSpot(): LandSpot | null;
  groundAt(x: number, z: number): number | null;
  baseConditions(): Readonly<Conditions>;
  /** The heavy apply: the App's conditions edited (the spectrum, set waves, the sky). */
  applyConditions(c: Conditions): void;
  stage(staging: GangStaging | null, pose: CameraPose | null): void;
  paddleOut(choice: SessionChoice): void;
}

export interface CoreCue {
  /** Everything the state machine said this call (the page layer animates from them). */
  events: FrontEvent[];
  sounds: UiSound[];
  line: { speaker: PresetName; text: string } | null;
  haptic: boolean;
  settings: boolean;
  landed: Beat | null;
}

const empty = (): CoreCue => ({ events: [], sounds: [], line: null, haptic: false, settings: false, landed: null });

export class FrontEndCore {
  private s: FrontState;
  private readonly gate = new ConditionsGate();
  private turnT = 1;
  private pickT = 0;
  private lineSeed = 0;
  private moveFrom: CameraPose | null = null;
  private calm: boolean;

  constructor(private readonly host: FrontEndHost, saved: SavedChoices, private readonly opts: { today: Date; seed: number; calm: boolean; storage: SettingsStorage | null }) {
    this.s = initialFront(saved);
    this.calm = opts.calm;
    this.lineSeed = opts.seed;
  }

  get state(): FrontState {
    return this.s;
  }

  setCalm(on: boolean): void {
    this.calm = on;
  }

  act(a: FrontAction, nowMs: number): CoreCue {
    const before = this.s;
    const r = step(this.s, a, { seed: this.opts.seed + Math.floor(nowMs), today: this.opts.today, calm: this.calm });
    this.s = r.state;
    return this.react(r.events, before, nowMs);
  }

  pointer(target: Parameters<typeof focusTo>[1], nowMs: number): CoreCue {
    const before = this.s, r = focusTo(this.s, target);
    this.s = r.state;
    return this.react(r.events, before, nowMs);
  }

  update(dtS: number, nowMs: number): CoreCue {
    const before = this.s, r = tick(this.s, dtS, { seed: this.opts.seed, today: this.opts.today, calm: this.calm });
    this.s = r.state;
    const cue = this.react(r.events, before, nowMs);
    if (this.gate.due(nowMs)) this.host.applyConditions(toConditions(this.s.setup, this.host.baseConditions(), this.opts.today));
    this.turnT = Math.min(1, this.turnT + dtS / (this.calm ? 0.2 : TURN_S));
    if (this.pickT > 0) this.pickT = this.pickT + dtS / PICK_S >= 1 ? 0 : this.pickT + dtS / PICK_S;
    this.stage();
    return cue;
  }

  private react(events: FrontEvent[], before: FrontState, nowMs: number): CoreCue {
    const cue = empty();
    cue.events = events;
    for (const e of events) {
      const snd = soundFor(e);
      if (snd) cue.sounds.push(snd);
      if (e.kind === 'value' || e.kind === 'roll') {
        this.gate.edit(nowMs);
        cue.line = lineFor(this.s, e.kind === 'value' ? e.row : 'swell', this.lineSeed++);
      }
      if (e.kind === 'move') {
        this.moveFrom = this.shot(before);
        if (e.from === 'conditions' && e.to === 'rider') this.turnT = 0;
        cue.haptic ||= e.to !== 'conditions';
      }
      if (e.kind === 'pick') { this.pickT = 1e-3; cue.haptic = true; }
      if (e.kind === 'chosen') cue.haptic = true;
      if (e.kind === 'landed') {
        cue.landed = e.beat;
        this.moveFrom = null;
        if (e.beat === 'gear') { const v = gearView(this.s, this.opts.today, this.lineSeed++); cue.line = { speaker: this.s.rider, text: v.line.text }; }
      }
      if (e.kind === 'settings') cue.settings = true;
      if (e.kind === 'paddleOut') {
        if (this.opts.storage) saveJson(this.opts.storage, FRONT_CHOICES_KEY, savedOf(this.s));
        this.host.applyConditions(toConditions(this.s.setup, this.host.baseConditions(), this.opts.today));
        this.host.paddleOut(e.choice);
      }
    }
    return cue;
  }

  /** The camera for a state's beat, or null before the land is ready. */
  private shot(s: FrontState): CameraPose | null {
    const stand = this.host.standSpot();
    if (!stand) return null;
    const ground = (x: number, z: number): number => this.host.groundAt(x, z) ?? 0;
    if (s.beat === 'conditions' || s.beat === 'out') return conditionsShot(stand, ground);
    const place = crewFor(s.beat === 'gear' ? 'gear' : 'rider', stand).find((p) => p.preset === s.rider)!;
    return s.beat === 'gear' ? gearShot(place, ground) : riderShot(place, ground);
  }

  private stage(): void {
    const stand = this.host.standSpot();
    if (!stand || this.s.beat === 'out') return;
    let pose = this.shot(this.s);
    if (this.s.move && this.moveFrom && pose) pose = easePose(this.moveFrom, pose, this.s.move.t);
    this.host.stage(stagingFor(this.s, stand, { turnT: this.turnT, pickT: this.pickT }), pose);
  }
}
```

The `landed` line for Grab your gear names the speaker by `PresetName` (the DOM layer turns it into the nickname). `gearView`'s `speaker` is the display name, so take only its text here.

```ts
// src/frontend/FrontEnd.ts: the front end in the page: the DOM, input, sounds and the core.
import type { SettingsStorage } from '../dev/devSettings';
import { PRESETS } from '../surfer/presets';
import { type CoreCue, type FrontEndHost, FrontEndCore } from './frontEndCore';
import { DEFAULT_FRONT_SETTINGS, FRONT_CHOICES_KEY, FRONT_SETTINGS_KEY, type FrontSettings, loadJson, safeAreaFraction, sanitizeChoices, sanitizeFrontSettings } from './frontSettings';
import { gearView } from './gearView';
import { BreakMap } from './ui/breakMap';
import { ConditionsPanel } from './ui/conditionsPanel';
import { GearPanel } from './ui/gearPanel';
import { applyLayout, layoutFor, mountFrontEndRoot } from './ui/layout';
import { Legend, legendFor } from './ui/legend';
import { RiderLine } from './ui/riderLine';
import { SlidePanel } from './ui/slidePanel';
import { type Device, UiInput } from './uiInput';
import { UiSounds, hapticPulse } from './uiSounds';

type SoundHooks = { uiOut(): { ctx: BaseAudioContext; out: AudioNode } | null; setFrontEndMusic(on: boolean): void };

export class FrontEnd {
  private root: HTMLElement | null = null;
  private core: FrontEndCore | null = null;
  private input: UiInput | null = null;
  private sounds: UiSounds | null = null;
  private settings: FrontSettings = DEFAULT_FRONT_SETTINGS;
  private device: Device = 'keyboard';
  private beatEls: Record<'conditions' | 'rider' | 'gear', HTMLElement> | null = null;
  private parts: { cond: ConditionsPanel; map: BreakMap; slide: SlidePanel; gear: GearPanel; legend: Legend; line: RiderLine; bottom: HTMLElement } | null = null;
  private shownBeat: string | null = null;
  private size = { w: window.innerWidth, h: window.innerHeight };
  private readonly today = new Date();

  constructor(private readonly host: FrontEndHost, private readonly parent: HTMLElement, private readonly sound: SoundHooks, private readonly storage: SettingsStorage | null) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(): void {
    if (this.root) return;
    this.settings = sanitizeFrontSettings(this.storage ? loadJson(this.storage, FRONT_SETTINGS_KEY) : null);
    const saved = sanitizeChoices(this.storage ? loadJson(this.storage, FRONT_CHOICES_KEY) : null);
    this.core = new FrontEndCore(this.host, saved, { today: this.today, seed: Date.now() % 100000, calm: this.settings.calmMenus, storage: this.storage });
    this.root = mountFrontEndRoot(this.parent);
    const act = (a: Parameters<FrontEndCore['act']>[0]): void => this.cue(this.core!.act(a, performance.now()));
    const cond = new ConditionsPanel((p) => (p.kind === 'focus' ? this.cue(this.core!.pointer({ row: p.row }, performance.now())) : act(p.action)));
    const slide = new SlidePanel((p) => (p.kind === 'rider' ? this.cue(this.core!.pointer({ rider: p.rider }, performance.now())) : act(p.action)));
    const gear = new GearPanel((p) => (p.kind === 'gear' ? this.cue(this.core!.pointer({ gear: p.index }, performance.now())) : act(p.action)));
    const map = new BreakMap(), legend = new Legend((a) => act(a)), line = new RiderLine(), bottom = document.createElement('div');
    bottom.className = 'fe-scrim-bottom';
    void map.load().then(() => { const s = this.host.standSpot(); if (s) map.setLookout(s); map.setConditions(this.core!.state.setup, true); });
    const wrap = (...els: HTMLElement[]): HTMLElement => { const d = document.createElement('div'); d.append(...els); return d; };
    this.beatEls = { conditions: wrap(cond.el, map.el), rider: wrap(slide.el), gear: wrap(gear.el) };
    this.root.append(bottom, this.beatEls.conditions, this.beatEls.rider, this.beatEls.gear, line.el, legend.el);
    this.parts = { cond, map, slide, gear, legend, line, bottom };
    this.input = new UiInput(window);
    this.sound.setFrontEndMusic(true);
    this.resize(this.size.w, this.size.h);
  }

  resize(w: number, h: number): void {
    this.size = { w, h };
    if (this.root) applyLayout(this.root, layoutFor(w, h, safeAreaFraction(this.settings)), this.settings);
  }

  update(dtS: number): void {
    if (!this.root || !this.core || !this.parts || !this.input) return;
    const now = performance.now(), { actions, device } = this.input.poll(now);
    if (actions.length) this.device = this.settings.glyphs === 'auto' ? device : this.settings.glyphs;
    for (const a of actions) this.cue(this.core.act(a, now));
    this.cue(this.core.update(dtS, now));
    this.render(now);
    if (this.core.state.beat === 'out') this.close();
  }

  close(): void {
    this.input?.dispose();
    this.root?.remove();
    this.host.stage(null, null);
    this.sound.setFrontEndMusic(false);
    this.root = this.core = this.input = this.parts = this.beatEls = null;
    this.shownBeat = null;
  }

  private cue(c: CoreCue): void {
    if (!this.sounds) { const o = this.sound.uiOut(); if (o) this.sounds = new UiSounds(o.ctx, o.out); }
    for (const s of c.sounds) this.sounds?.play(s, { durS: this.settings.calmMenus ? 0.2 : 1.6 });
    if (c.haptic) hapticPulse();
    if (c.line && this.parts) this.parts.line.show(PRESETS[c.line.speaker].nickname, c.line.text, performance.now());
    if (this.parts && this.core) {
      const calm = this.settings.calmMenus;
      for (const e of c.events) {
        this.parts.cond.event(e, calm, performance.now(), this.today);
        if (e.kind === 'value' || e.kind === 'roll') this.parts.map.setConditions(this.core.state.setup, calm);
      }
    }
    if (c.settings) this.openSettings();
  }

  /** Task 23 fills this in. */
  private openSettings(): void {}

  private render(now: number): void {
    const s = this.core!.state, p = this.parts!, calm = this.settings.calmMenus;
    const visibleBeat = s.move ? (s.move.t >= 0.7 ? s.move.to : s.move.t < 0.18 ? s.move.from : null) : s.beat;
    if (visibleBeat !== this.shownBeat) {
      for (const [k, el] of Object.entries(this.beatEls!)) {
        const on = k === visibleBeat;
        el.style.transition = on ? `opacity ${calm ? 200 : 280}ms cubic-bezier(0.33, 1, 0.68, 1)` : `opacity ${calm ? 200 : 180}ms cubic-bezier(0.32, 0, 0.67, 0)`;
        el.style.opacity = on ? '1' : '0';
        el.style.pointerEvents = on ? '' : 'none';
      }
      this.shownBeat = visibleBeat;
    }
    p.cond.render(s, this.today);
    p.cond.update(now);
    p.slide.setDevice(this.device);
    p.slide.render(s, calm);
    if (s.beat === 'gear') p.gear.render(gearView(s, this.today, 1), this.device, calm);
    p.legend.set(legendFor(s), this.device);
    p.line.update(now);
    const pos = s.beat === 'gear' ? { left: '120px', top: '200px' } : { left: '760px', top: '520px' };
    Object.assign(p.line.el.style, pos);
  }
}
```

`cue()` forwards each event to the Conditions panel (the slide, the end nudge, the roll) and redraws the map's live layers only on `value` and `roll` events, never per frame. The UI timing in `render` follows §5.6:
  - the old beat's UI leaves in the first 18% of the move (≈ 280 ms of 1.6 s, its 180 ms exit inside it);
  - the new beat's UI starts entering at 70%.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/frontend && npx tsc --noEmit`
Expected: PASS and no type errors. `FrontEnd.ts` isn't exercised in node; Task 22 wires it and Task 24 drives it.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/conditionsGate.ts src/frontend/conditionsGate.test.ts src/frontend/frontEndCore.ts src/frontend/frontEndCore.test.ts src/frontend/FrontEnd.ts
git commit -m "feat(frontend): the orchestration: the conditions gate, the core (state, world, crew, camera, cues), and the page layer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: The entry, the App as host, and Paddle out

**Files:**
- Create: `src/frontend/entry.ts`
- Modify: `src/main.ts`, `src/app/App.ts`, `src/camera/Input.ts` (a `suspended` flag), `src/dev/DevPanel.ts` (the "Front end" button)
- Test: `src/frontend/entry.test.ts`, `src/camera/Input.test.ts` (append, or create if absent)

**Interfaces:**
- Consumes: Task 21's `FrontEnd`, `FrontEndHost`; Task 6's `SessionChoice`; Task 1's `toConditions`; `landSpots`; App's `onConditionsEdited`, `stageFrontEnd`, `surferParams`, `gang`, `sound`; `browserStorage()` or the dev-settings storage accessor in `src/dev/devSettings.ts`.
- Produces:
  - `frontEndWanted(search: string, hash: string): boolean`
  - `PADDLE_OUT_MS = { uiOut: 180, fadeOut: 600, fadeIn: 600 }`
  - `Input.suspended: boolean` (while true: no keys, mouse or wheel reach the camera, and `consumePressed` returns false)
  - `App.applyConditionsEdit(): void` (public: the old private `onConditionsEdited`)
  - `App.openFrontEnd(): void`, `App.frontEndHost(): FrontEndHost`
  - `App.paddleOut(choice: SessionChoice): void`
  - `DevPanelHandlers.onFrontEnd(): void`

- [ ] **Step 1: Write the failing tests**

```ts
// src/frontend/entry.test.ts
import { describe, expect, it } from 'vitest';
import { frontEndWanted } from './entry';

describe('when the front end opens (spec §3)', () => {
  it('opens on a normal start', () => expect(frontEndWanted('', '')).toBe(true));
  it('skips for a moment link, a reference link, a self-test, the species sheet, or ?frontend=off', () => {
    expect(frontEndWanted('', '#m=abc')).toBe(false);
    expect(frontEndWanted('', '#moment=abc')).toBe(false);
    expect(frontEndWanted('', '#ref=womb')).toBe(false);
    expect(frontEndWanted('?selftest', '')).toBe(false);
    expect(frontEndWanted('?selftest=frontend', '')).toBe(false);
    expect(frontEndWanted('?sheet=species', '')).toBe(false);
    expect(frontEndWanted('?frontend=off', '')).toBe(false);
  });
  it('still opens with unrelated query parameters', () => expect(frontEndWanted('?gpu=high', '#')).toBe(true));
});
```

For `Input.suspended`, append (or create `src/camera/Input.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input while the front end is open (spec §10)', () => {
  it('drops keys and their presses while suspended, and takes them again after', () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const fakeTarget = { addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ??= []).push(f); }, removeEventListener: () => {} };
    Object.assign(globalThis, { window: fakeTarget, document: fakeTarget });
    const input = new Input(fakeTarget as unknown as HTMLElement);
    const key = (type: string, code: string) => listeners[type].forEach((f) => f({ code, target: null, preventDefault() {} }));
    input.suspended = true;
    key('keydown', 'KeyW');
    expect(input.isDown('KeyW')).toBe(false);
    expect(input.consumePressed('KeyW')).toBe(false);
    key('keyup', 'KeyW');
    input.suspended = false;
    key('keydown', 'KeyW');
    expect(input.isDown('KeyW')).toBe(true);
  });
});
```

If `Input.test.ts` already exists with its own DOM fake, reuse that fake and drop the `Object.assign(globalThis, …)` line.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/frontend/entry.test.ts src/camera/Input.test.ts`
Expected: FAIL. `entry` doesn't exist and `suspended` does nothing.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/entry.ts
/** A normal start opens the front end; links, self-tests, sheets and ?frontend=off open the game as today (spec §3). */
export function frontEndWanted(search: string, hash: string): boolean {
  const q = new URLSearchParams(search);
  if (q.has('selftest') || q.has('sheet') || q.get('frontend') === 'off') return false;
  return !/^#(m|moment|ref)=/.test(hash);
}

/** Paddle out (spec §3): the UI leaves, the screen fades to black, the session is set up, it fades back in. */
export const PADDLE_OUT_MS = { uiOut: 180, fadeOut: 600, fadeIn: 600 } as const;
```

`src/camera/Input.ts`:
- add `suspended = false;`.
- In `onKeyDown`, `onMouseDown`, `onWheel` and `onMouseMove`, return early when `this.suspended`. Release events (`keyup`, `mouseup`, `blur`) always run, so nothing sticks.
- When `suspended` turns true, clear `down` and `pressed`. Use a setter with a private `#suspended` field.

`src/app/App.ts`:
- **Rename** `private onConditionsEdited()` to the public `applyConditionsEdit()`, and update its two callers.
- **Add** `private frontEnd: FrontEnd | null = null`.
- **The host:**

```ts
  /** The front end's view of the App (dune select spec §14). */
  frontEndHost(): FrontEndHost {
    return {
      standSpot: () => {
        const lh = this.land.height;
        return lh?.trackNetwork ? landSpots(lh, lh.profile).standSpot : null;
      },
      groundAt: this.groundAt,
      baseConditions: () => this.conditions,
      applyConditions: (c) => {
        assignConditions(this.conditions, c);
        this.applyConditionsEdit();
        this.panel.refresh();
      },
      stage: (staging, pose) => this.stageFrontEnd(staging, pose),
      paddleOut: (choice) => this.paddleOut(choice),
    };
  }

  /** Opens the front end (a normal start after prewarm, or the dev panel's button). */
  openFrontEnd(): void {
    if (this.frontEnd?.isOpen) return;
    this.frontEnd ??= new FrontEnd(this.frontEndHost(), this.container, this.sound, browserStorage);
    this.input.suspended = true;
    this.surferStand.group.visible = false;
    this.frontEnd.open();
  }

  /** Paddle out (spec §3): fade to black, set the session, put the rider on the stand in the water, fade back in. */
  paddleOut(choice: SessionChoice): void {
    const fade = document.createElement('div');
    Object.assign(fade.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', zIndex: '6', pointerEvents: 'none', transition: `opacity ${PADDLE_OUT_MS.fadeOut}ms ease-in` });
    this.container.appendChild(fade);
    window.setTimeout(() => { fade.style.opacity = '1'; }, PADDLE_OUT_MS.uiOut);
    window.setTimeout(() => {
      const lineup = DEFAULT_SURFER_PARAMS;
      Object.assign(this.surferParams, {
        enabled: true, onLand: false, preset: choice.rider, board: choice.board, outfit: choice.outfit, pose: 'sit', gang: false,
        x: lineup.x, z: lineup.z, headingDeg: lineup.headingDeg, heightNudgeM: 0, expression: 'none',
      });
      normalizeSurferParams(this.surferParams);
      this.surferStand.group.visible = true;
      this.stageFrontEnd(null, null);
      this.input.suspended = false;
      this.rig.setPose(this.startupMoment().camera, this.conditions.tideM);
      this.panel.refresh();
      this.scheduleSave();
      fade.style.transition = `opacity ${PADDLE_OUT_MS.fadeIn}ms ease-out`;
      fade.style.opacity = '0';
      window.setTimeout(() => fade.remove(), PADDLE_OUT_MS.fadeIn + 50);
    }, PADDLE_OUT_MS.uiOut + PADDLE_OUT_MS.fadeOut);
  }
```

- **The frame loop:**
  - call `this.frontEnd?.update(realDt)` near the top of `frame()`, after the clock tick;
  - skip `handleHotkeys` while `this.frontEnd?.isOpen`. Keep `rig.update`; its input is suspended, so the staged pose holds.
- **Resize:** in `onResize`, call `this.frontEnd?.resize(window.innerWidth, window.innerHeight)`.
- **The names used above:**
  - `DEFAULT_SURFER_PARAMS` (x −25, z 45, heading 225: the lineup spot);
  - `this.startupMoment().camera` (a `Moment`'s `CameraPose`);
  - `this.surferStand.group`;
  - App's module-level `browserStorage` (lazily reaches `localStorage`; Task 5's `loadJson`/`saveJson` catch a throwing storage).

`src/main.ts`: after `await app.prewarm(); app.start();`:

```ts
  if (frontEndWanted(location.search, location.hash)) app.openFrontEnd();
```

`src/dev/DevPanel.ts`: add `onFrontEnd(): void` to `DevPanelHandlers`, and a button in the land folder beside "stand spot": `land.addButton({ title: 'Front end (the select screen)' }).on('click', () => h.onFrontEnd());`. In App's handlers: `onFrontEnd: () => this.openFrontEnd()`.

- [ ] **Step 4: Run the tests, then drive it**

Run: `npx vitest run && npx tsc --noEmit` (with `--maxWorkers=3` if timing tests flake under load, as before).
Expected: PASS and no type errors.

Then `preview_start` `ld-step2`, open `http://localhost:5177/`, and wait for the first frame.
Expected:
- the Conditions beat over the crew;
- the console has no errors (`read_console_messages`).

Press Enter twice, P, then wait 2 s.
Expected: the fade, then the rider in the water.

Open `http://localhost:5177/?frontend=off`.
Expected: today's game, no front end.

Take a screenshot of the Conditions beat for the ledger.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/entry.ts src/frontend/entry.test.ts src/main.ts src/app/App.ts src/camera/Input.ts src/camera/Input.test.ts src/dev/DevPanel.ts
git commit -m "feat(frontend): the front end opens after prewarm (skipped for links, self-tests and ?frontend=off), the App as its host, Paddle out, the dev button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: The Settings overlay

**Files:**
- Create: `src/frontend/settingsView.ts`, `src/frontend/ui/settingsPanel.ts`
- Modify: `src/frontend/FrontEnd.ts` (`openSettings`, routing actions while it's open, applying settings live)
- Test: `src/frontend/settingsView.test.ts`

**Interfaces:**
- Consumes: Task 5's `FrontSettings`, `sanitizeFrontSettings`, `saveJson`, `FRONT_SETTINGS_KEY`; Task 16's `ValueRow`, `RowView`.
- Produces:
  - `type SettingRow = 'textScale' | 'calmMenus' | 'opaqueBackplates' | 'safeArea' | 'displayMode' | 'glyphs'`
  - `SETTING_ROWS: SettingRow[]`
  - `settingsView(s: FrontSettings, focus: SettingRow): { row: SettingRow; label: string; value: string; small: string; focused: boolean }[]`
  - `stepSetting(s: FrontSettings, row: SettingRow, dir: -1 | 1): { settings: FrontSettings; atEnd: boolean }`
  - `class SettingsPanel { readonly el; render(s: FrontSettings, focus: SettingRow): void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/settingsView.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_FRONT_SETTINGS, sanitizeFrontSettings } from './frontSettings';
import { SETTING_ROWS, settingsView, stepSetting } from './settingsView';

describe('the Settings overlay (spec §11)', () => {
  it('has Text size, Calm menus, Opaque backplates, Safe area, Display mode, Glyphs', () => {
    expect(settingsView(DEFAULT_FRONT_SETTINGS, 'textScale').map((r) => r.label)).toEqual(['Text size', 'Calm menus', 'Opaque backplates', 'Safe area', 'Display mode', 'Glyphs']);
    expect(SETTING_ROWS.length).toBe(6);
  });
  it('steps text size 100–200% in 10% steps and stops at the ends', () => {
    let s = DEFAULT_FRONT_SETTINGS;
    expect(stepSetting(s, 'textScale', -1).atEnd).toBe(true);
    for (let k = 0; k < 10; k++) s = stepSetting(s, 'textScale', 1).settings;
    expect(s.textScale).toBeCloseTo(2, 9);
    expect(stepSetting(s, 'textScale', 1).atEnd).toBe(true);
  });
  it('steps the safe area 2–10%, starting from the display mode\'s default, and shows Auto until set', () => {
    expect(settingsView(DEFAULT_FRONT_SETTINGS, 'safeArea').find((r) => r.row === 'safeArea')!.value).toBe('Auto');
    const s = stepSetting(DEFAULT_FRONT_SETTINGS, 'safeArea', 1).settings;
    expect(s.safeArea).toBeCloseTo(0.04, 9);
    expect(stepSetting({ ...s, safeArea: 0.1 }, 'safeArea', 1).atEnd).toBe(true);
  });
  it('flips the switches and cycles display mode and glyphs, every result a valid setting', () => {
    let s = DEFAULT_FRONT_SETTINGS;
    for (const row of SETTING_ROWS) for (const dir of [1, -1, 1] as const) {
      s = stepSetting(s, row, dir).settings;
      expect(sanitizeFrontSettings(s)).toEqual(s);
    }
    expect(stepSetting(DEFAULT_FRONT_SETTINGS, 'calmMenus', 1).settings.calmMenus).toBe(!DEFAULT_FRONT_SETTINGS.calmMenus);
    expect(stepSetting(DEFAULT_FRONT_SETTINGS, 'glyphs', 1).settings.glyphs).toBe('xbox');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/frontend/settingsView.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/frontend/settingsView.ts
import { type FrontSettings, safeAreaFraction } from './frontSettings';

export type SettingRow = 'textScale' | 'calmMenus' | 'opaqueBackplates' | 'safeArea' | 'displayMode' | 'glyphs';
export const SETTING_ROWS: SettingRow[] = ['textScale', 'calmMenus', 'opaqueBackplates', 'safeArea', 'displayMode', 'glyphs'];
const LABELS: Record<SettingRow, string> = { textScale: 'Text size', calmMenus: 'Calm menus', opaqueBackplates: 'Opaque backplates', safeArea: 'Safe area', displayMode: 'Display mode', glyphs: 'Glyphs' };
const GLYPHS: FrontSettings['glyphs'][] = ['auto', 'xbox', 'playstation', 'keyboard'];
const GLYPH_WORDS: Record<FrontSettings['glyphs'], string> = { auto: 'Auto', xbox: 'Xbox', playstation: 'PlayStation', keyboard: 'Keyboard' };
const round = (v: number): number => Math.round(v * 100) / 100;

export function settingsView(s: FrontSettings, focus: SettingRow): { row: SettingRow; label: string; value: string; small: string; focused: boolean }[] {
  const value: Record<SettingRow, [string, string]> = {
    textScale: [`${Math.round(s.textScale * 100)}%`, ''],
    calmMenus: [s.calmMenus ? 'On' : 'Off', s.calmMenus ? 'no slides or swings' : ''],
    opaqueBackplates: [s.opaqueBackplates ? 'On' : 'Off', ''],
    safeArea: [s.safeArea === null ? 'Auto' : `${Math.round(s.safeArea * 100)}%`, `${Math.round(safeAreaFraction(s) * 100)}% in use`],
    displayMode: [s.displayMode === 'pc' ? 'PC' : 'TV', s.displayMode === 'pc' ? 'desk distance' : 'couch distance'],
    glyphs: [GLYPH_WORDS[s.glyphs], s.glyphs === 'auto' ? 'follows your last device' : ''],
  };
  return SETTING_ROWS.map((row) => ({ row, label: LABELS[row], value: value[row][0], small: value[row][1], focused: row === focus }));
}

export function stepSetting(s: FrontSettings, row: SettingRow, dir: -1 | 1): { settings: FrontSettings; atEnd: boolean } {
  switch (row) {
    case 'textScale': {
      const v = round(s.textScale + 0.1 * dir);
      return v < 1 || v > 2 ? { settings: s, atEnd: true } : { settings: { ...s, textScale: v }, atEnd: false };
    }
    case 'safeArea': {
      const v = round(safeAreaFraction(s) + 0.01 * dir);
      return v < 0.02 || v > 0.1 ? { settings: s, atEnd: true } : { settings: { ...s, safeArea: v }, atEnd: false };
    }
    case 'calmMenus': return { settings: { ...s, calmMenus: !s.calmMenus }, atEnd: false };
    case 'opaqueBackplates': return { settings: { ...s, opaqueBackplates: !s.opaqueBackplates }, atEnd: false };
    case 'displayMode': return { settings: { ...s, displayMode: s.displayMode === 'pc' ? 'tv' : 'pc' }, atEnd: false };
    case 'glyphs': return { settings: { ...s, glyphs: GLYPHS[(GLYPHS.indexOf(s.glyphs) + dir + GLYPHS.length) % GLYPHS.length] }, atEnd: false };
  }
}
```

```ts
// src/frontend/ui/settingsPanel.ts
import type { FrontSettings } from '../frontSettings';
import { type SettingRow, settingsView } from '../settingsView';
import { ValueRow } from './valueRow';

/** Settings over a full scrim, the same rows as Conditions (spec §11). */
export class SettingsPanel {
  readonly el = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly rows = new Map<SettingRow, ValueRow>();

  constructor() {
    Object.assign(this.el.style, { position: 'absolute', inset: '0', background: 'rgba(16, 23, 26, 0.88)' });
    const col = document.createElement('div');
    Object.assign(col.style, { position: 'absolute', left: 'var(--fe-safe-x)', top: 'calc(var(--fe-safe-y) + 40px)', width: '820px' });
    const title = document.createElement('h1');
    title.className = 'fe-title';
    title.textContent = 'Settings';
    col.append(title, this.list);
    this.el.appendChild(col);
  }

  render(s: FrontSettings, focus: SettingRow): void {
    for (const v of settingsView(s, focus)) {
      let r = this.rows.get(v.row);
      if (!r) { r = new ValueRow(v.row); this.rows.set(v.row, r); this.list.appendChild(r.el); }
      r.set({ label: v.label, value: v.value, small: v.small, focused: v.focused, gapAfter: false });
    }
  }

  slide(row: SettingRow, dir: -1 | 1, calm: boolean): void {
    this.rows.get(row)?.slide(dir, calm);
  }
}
```

In `FrontEnd.ts`:
- **Opening:** `openSettings()` mounts a `SettingsPanel` over everything (appended last to the root) and sets `this.settingsFocus = 'textScale'`.
- **While open,** `update()` routes the polled actions to it instead of the core:
  - up and down move the focus (wrapping, with the focus tick);
  - left and right call `stepSetting` (a value tick, or the end thud and a 3 px nudge at an end);
  - B, or the Back + START chord, closes it.
- **Each change:**
  - saves (`saveJson(storage, FRONT_SETTINGS_KEY, settings)`);
  - re-applies the layout (`this.resize(...)`) and `core.setCalm(settings.calmMenus)`;
  - forces the slide panel and the legend to re-render, for the glyph override and the text size.

- [ ] **Step 4: Run the tests, then drive it**

Run: `npx vitest run src/frontend && npx tsc --noEmit`
Expected: PASS and no type errors.

In the browser pane at `http://localhost:5177/`, press Esc + P together. Then press → (Text size 110%) and ↓ ↓ ↓ → (Safe area 4%), then Esc.
Expected:
- the overlay opens;
- the text grows and re-lays out (it doesn't zoom);
- the legend moves in;
- Esc returns to the beat.

Reload the page.
Expected: the settings are still applied.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/settingsView.ts src/frontend/settingsView.test.ts src/frontend/ui/settingsPanel.ts src/frontend/FrontEnd.ts
git commit -m "feat(frontend): the Settings overlay on Back + START: text size, calm menus, opaque backplates, safe area, display mode, glyphs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: The self-tests at every window shape, and the in-game scene check

**Files:**
- Modify: `src/frontend/frontEnd.selftest.ts` (append the whole-screen checks)
- Create: `src/dev/frontEndCheck.ts`
- Modify: `src/app/App.ts` (exposes `frontEndCheck()` on dev builds), `src/dev/DevPanel.ts` (a "Front-end check" button)

**Interfaces:**
- Consumes: everything above; `captureFrame()` (App); `poseCamera` (Task 8); `THREE.Raycaster`.
- Produces:
  - self-tests: `frontend: <beat> at <w>×<h>` for each beat × {1920×1080, 1280×800, 2560×1080, 1024×768}, at text sizes 100% and 200%
  - `frontend: every focusable is reached by arrows alone, and B leaves every beat`
  - `frontend: a pad press swaps every legend glyph`
  - `frontEndCheck(app): Promise<{ contrast: { beat: string; text: string; ratio: number; need: number }[]; faces: { beat: string; rider: string; covered: string | null }[]; pass: boolean }>`

- [ ] **Step 1: Write the failing self-tests**

Append to `src/frontend/frontEnd.selftest.ts`. A fake host lets the real `FrontEnd` run in the page without the game:

```ts
import { FrontEnd } from './FrontEnd';
import type { FrontEndHost } from './frontEndCore';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';

const SIZES: [number, number][] = [[1920, 1080], [1280, 800], [2560, 1080], [1024, 768]];
const fakeHost = (): FrontEndHost => ({
  standSpot: () => ({ x: 305, z: 49.8, headingDeg: 90 }), groundAt: () => 20, baseConditions: () => DEFAULT_CONDITIONS,
  applyConditions: () => {}, stage: () => {}, paddleOut: () => {},
});
const memory = (): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
};
const noSound = { uiOut: () => null, setFrontEndMusic: () => {} };
const press = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code })); window.dispatchEvent(new KeyboardEvent('keyup', { code })); };
const frames = async (fe: FrontEnd, n: number): Promise<void> => { for (let i = 0; i < n; i++) { fe.update(1 / 60); await new Promise((r) => requestAnimationFrame(r)); } };

/** Every visible text box in the root: its design box and font size. */
function texts(root: HTMLElement, scale: number) {
  return [...root.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && e.textContent?.trim() && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e.closest('[style*="opacity"]') ?? e).opacity) > 0.5)
    .map((e) => ({ e, b: designBox(e, root, scale), px: parseFloat(getComputedStyle(e).fontSize) }));
}
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

for (const [w, h] of SIZES) for (const text of [1, 2]) {
  registerSelfTest({
    name: `frontend: every beat at ${w}×${h}, text ${text * 100}%: inside the safe area, nothing under 18 px, nothing overlapping`,
    async run() {
      const store = memory();
      store.setItem('liquid-dreams.front-settings.v1', JSON.stringify({ textScale: text }));
      const host = document.createElement('div');
      Object.assign(host.style, { position: 'fixed', left: '0', top: '0', width: `${w}px`, height: `${h}px`, overflow: 'hidden' });
      document.body.appendChild(host);
      const fe = new FrontEnd(fakeHost(), host, noSound, store);
      const problems: string[] = [];
      try {
        fe.open();
        fe.resize(w, h);
        await document.fonts.ready;
        for (const beat of ['conditions', 'rider', 'gear']) {
          await frames(fe, 120);
          const root = host.querySelector('.fe-root') as HTMLElement, scale = Math.min(w / 1920, h / 1080), l = { designW: w / scale, designH: h / scale, safe: 0.03 };
          const t = texts(root, scale);
          for (const { e, b, px } of t) {
            if (px < 18) problems.push(`${beat}: "${e.textContent!.slice(0, 20)}" ${px.toFixed(0)} px`);
            if (b.x < l.designW * l.safe - 0.5 || b.y < l.designH * l.safe - 0.5 || b.x + b.w > l.designW * (1 - l.safe) + 0.5 || b.y + b.h > l.designH * (1 - l.safe) + 0.5) problems.push(`${beat}: "${e.textContent!.slice(0, 20)}" outside`);
          }
          const blocks = ['.fe-legend', '.fe-title', '.fe-tabs'].flatMap((q) => [...root.querySelectorAll(q)]).filter((e) => Number(getComputedStyle(e.parentElement!).opacity) > 0.5).map((e) => designBox(e, root, scale));
          for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) if (overlaps(blocks[i], blocks[j])) problems.push(`${beat}: blocks ${i} and ${j} overlap`);
          press('Enter');
        }
      } finally {
        fe.close();
        host.remove();
      }
      return { pass: problems.length === 0, detail: problems.slice(0, 6).join('; ') || 'clean' };
    },
  });
}

registerSelfTest({
  name: 'frontend: every focusable is reached by arrows alone, and B leaves every beat',
  async run() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    const seen = new Set<string>(), problems: string[] = [];
    try {
      fe.open();
      await frames(fe, 30);
      const focused = (): string => (host.querySelector('.is-focus') as HTMLElement | null)?.dataset.hit ?? (host.querySelector('.fe-tab.is-focus') as HTMLElement | null)?.dataset.rider ?? '?';
      for (let k = 0; k < 12; k++) { seen.add(`c:${focused()}`); press('ArrowDown'); await frames(fe, 3); }
      if ([...seen].filter((s) => s.startsWith('c:')).length < 8) problems.push(`conditions reached ${[...seen].join(',')}`);
      press('Enter');
      await frames(fe, 120);
      for (let k = 0; k < 4; k++) { seen.add(`r:${focused()}`); press('ArrowRight'); await frames(fe, 40); }
      if ([...seen].filter((s) => s.startsWith('r:')).length < 3) problems.push('not every rider reached');
      press('Enter');
      await frames(fe, 160);
      for (let k = 0; k < 4; k++) { seen.add(`g:${focused()}`); press('ArrowDown'); await frames(fe, 3); }
      press('KeyE');
      await frames(fe, 10);
      for (let k = 0; k < 4; k++) { seen.add(`o:${focused()}`); press('ArrowDown'); await frames(fe, 3); }
      for (const beat of ['gear', 'rider']) { press('Escape'); await frames(fe, 120); if (!host.querySelector('.fe-root')) problems.push(`B from ${beat} closed the front end`); }
    } finally {
      fe.close();
      host.remove();
    }
    return { pass: problems.length === 0, detail: problems.join('; ') || `reached ${seen.size} focus states` };
  },
});

registerSelfTest({
  name: 'frontend: a pad press swaps every legend glyph to the pad set',
  async run() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    const real = navigator.getGamepads.bind(navigator);
    let pad: Gamepad | null = null;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    try {
      fe.open();
      press('ArrowDown');
      await frames(fe, 5);
      const keys = [...host.querySelectorAll('.fe-legend [data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 13, touched: false, value: i === 13 ? 1 : 0 }));
      pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
      await frames(fe, 5);
      const pads = [...host.querySelectorAll('.fe-legend [data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      return { pass: keys === 'R,F,Enter,Esc' && pads === 'Y,X,A,B', detail: `keys ${keys} → pad ${pads}` };
    } finally {
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: real });
      fe.close();
      host.remove();
    }
  },
});
```

Button 13 is the d-pad's down on the standard mapping, so the pad press moves focus.

```ts
// src/dev/frontEndCheck.ts: the checks that need the live scene behind the UI (spec §15; the plan's ruling).
import * as THREE from 'three/webgpu';
import type { App } from '../app/App';

/** Relative luminance (WCAG) of an sRGB colour, 0–255 channels. */
const lum = (r: number, g: number, b: number): number => {
  const f = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * For each beat:
 * - contrast: each text box against the brightest 5% of the scene behind it (the scene captured with the UI hidden,
 *   the scrims' gradient composited);
 * - faces: nothing between the camera and the focused rider's head (a ray to the head bone).
 */
export async function frontEndCheck(app: App): Promise<{ contrast: { beat: string; text: string; ratio: number; need: number }[]; faces: { beat: string; rider: string; covered: string | null }[]; pass: boolean }> {
  const contrast: { beat: string; text: string; ratio: number; need: number }[] = [], faces: { beat: string; rider: string; covered: string | null }[] = [];
  for (const beat of ['conditions', 'rider', 'gear'] as const) {
    await app.frontEndGoTo(beat);
    const root = document.querySelector('.fe-root') as HTMLElement;
    root.style.visibility = 'hidden';
    const frame = await app.captureFrame();
    root.style.visibility = '';
    const img = await createImageBitmap(frame), canvas = new OffscreenCanvas(img.width, img.height), cx = canvas.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    const sx = img.width / window.innerWidth, sy = img.height / window.innerHeight;
    for (const el of root.querySelectorAll('.fe-value, .fe-label, .fe-line, .fe-title, .fe-legend span')) {
      if (!el.textContent?.trim() || el.closest('.is-focus')) continue;
      const r = el.getBoundingClientRect(), d = cx.getImageData(r.left * sx, r.top * sy, Math.max(1, r.width * sx), Math.max(1, r.height * sy)).data;
      const ls: number[] = [];
      // The scrim behind the text: read its painted alpha at the box's centre from the scrim element's gradient.
      const scrim = scrimAlphaAt(root, r.left + r.width / 2, r.top + r.height / 2);
      for (let i = 0; i < d.length; i += 4) ls.push(lum(d[i] * (1 - scrim) + 16 * scrim, d[i + 1] * (1 - scrim) + 23 * scrim, d[i + 2] * (1 - scrim) + 26 * scrim));
      ls.sort((a, b) => b - a);
      const bright = ls[Math.floor(ls.length * 0.05)] ?? 0, c = getComputedStyle(el).color.match(/\d+/g)!.map(Number);
      const large = parseFloat(getComputedStyle(el).fontSize) >= 24 * (root.getBoundingClientRect().width / root.offsetWidth);
      contrast.push({ beat, text: el.textContent.slice(0, 24), ratio: ratio(lum(c[0], c[1], c[2]), bright), need: large ? 3 : 4.5 });
    }
    const hit = app.frontEndFaceRay();
    faces.push({ beat, rider: hit.rider, covered: hit.covered });
  }
  return { contrast, faces, pass: contrast.every((c) => c.ratio >= c.need) && faces.every((f) => f.covered === null) };
}

/** The darkness of the left, right and bottom scrims at a window point (their linear 0.82 → 0 gradients over 48%). */
function scrimAlphaAt(root: HTMLElement, x: number, y: number): number {
  let a = 0;
  for (const el of root.querySelectorAll('.fe-scrim-left, .fe-scrim-right, .fe-scrim-bottom')) {
    const r = el.getBoundingClientRect();
    if (Number(getComputedStyle(el.parentElement!).opacity) < 0.5 || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const t = el.classList.contains('fe-scrim-left') ? (x - r.left) / r.width : el.classList.contains('fe-scrim-right') ? (r.right - x) / r.width : (r.bottom - y) / r.height;
    const peak = el.classList.contains('fe-scrim-bottom') ? 0.7 : 0.82;
    a = 1 - (1 - a) * (1 - peak * (1 - t));
  }
  return a;
}
```

App support (dev builds):
- **`frontEndGoTo(beat)`** opens the front end if needed and drives it to the beat with key actions. It resolves once the move lands (polls `this.frontEnd.state.beat` and `move === null`).
- **`frontEndFaceRay()`** casts a `THREE.Raycaster` from the camera to the focused rider's head:
  - the head comes from `SurferStand`'s skeleton: the stand's `headWorld()`, or add it, returning the head bone's world position;
  - the ray runs against the heath's instanced meshes, the land mesh, the other two riders' groups and the rider's own board;
  - it returns the first hit closer than the head (by its object's name), or `null`.
- **Exposure:** `FrontEnd` exposes `get state()` for `frontEndGoTo`. `window.liquidDreams.frontEndCheck = () => frontEndCheck(app)` is in `main.ts`'s dev block. The dev panel gets a "Front-end check" button that logs the result table with `console.table`.

- [ ] **Step 2: Run them to see what fails**

Run `?selftest=frontend` in the browser pane (dev server running).
Expected:
- the whole-screen checks report their problems;
- the reachability and glyph checks pass if Tasks 15–23 were right.

Typical first-run failures and their fixes:
- **The slide panel's lockup overlaps the tabs at 200% text:** shrink the name lockup to `min(128px × text, 150px)`.
- **The legend overflows the safe area on 1024×768:** none should, since the layout is the full design scaled. If it does, check `applyLayout` used `designW`.
- **The Conditions column runs past the bottom at 200% text with details open:** the row height takes `--fe-text`; reduce the title's bottom margin and the gap under Preset at text scales above 1.5 (a `.fe-root[style*="--fe-text: 2"]` rule won't match; set a `data-text-large` attribute in `applyLayout` and key the CSS on it).

Fix each one in its component and re-run until clean. Ledger each fix.

Then in the game (`http://localhost:5177/`), run `await window.liquidDreams.frontEndCheck()` in the console (or press the dev panel's button).
Expected: `pass: true`.
- If a contrast ratio misses, darken that scrim's peak in 0.04 steps, up to 0.9.
- If a face is covered, the heath plant or the rider named in `covered` is the culprit: move the shot (Task 8's `SHOT` numbers within the spec's ranges) or the crew spread, and ledger it.

- [ ] **Step 3: Run the whole suite**

Run: `npx vitest run --maxWorkers=3 && npx tsc --noEmit`, and `?selftest` (all self-tests, so the other systems' checks still pass with the front end in the bundle).
Expected: all pass. A timing test that fails only under load and passes alone (`shoreReef.test.ts`, as on main) is recorded in the ledger with both runs' output.

- [ ] **Step 4: Commit**

```bash
git add src/frontend src/dev/frontEndCheck.ts src/app/App.ts src/dev/DevPanel.ts src/main.ts
git commit -m "test(frontend): the self-tests at four window shapes and two text sizes, arrow reachability, the glyph swap; the in-game contrast and face check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 25: Gate B: Andrew drives it (STOP), then the final review and the merge on his OK

**Files:** none, unless Andrew's notes ask for changes.

- [ ] **Step 1: Capture the screens for Andrew.** At 1920×1080 in the game, capture:
  - each beat;
  - the Settings overlay;
  - Grab your gear on the Outfit tab;
  - a mid-move frame (the camera swinging).

  Save them to `tools/surfer/previews/select-gateB/`. Lay them beside the approved mockup's screens (`docs/superpowers/specs/2026-10-03-dune-select-mockup/screen1..3.jpg`) with PIL. Send three with SendUserFile.

- [ ] **Step 2: Ask Andrew to drive it, and STOP.** He drives the flow in the browser at `http://localhost:5177/`, with a controller and with a keyboard. List what to try:
  - Roll the dice;
  - Swell details;
  - LT/RT fine scrub;
  - Back from each beat;
  - START from Conditions;
  - Settings on Back + START;
  - unplugging the pad mid-hold.

  Wait for his notes.

- [ ] **Step 3: Fix from his notes.** Each note is a TDD fix (a failing test or self-test first where it's testable, a capture where it's visual), committed separately. Re-send the captures that changed.

- [ ] **Step 4: The final review.** Follow superpowers:executing-plans' Final Review:
  - the whole-branch review package;
  - the most capable reviewer, with the spec, this plan, its Review Focus list verbatim, and the ledger's rulings;
  - one fix pass for Critical and Important findings.

- [ ] **Step 5: Merge only on Andrew's OK.**
  - With his OK, merge `select-screen` into main. Run the whole suite on the merged result.
  - Push only if he said so.
  - Remove the worktree after removing its node_modules junction first (the junction rule).
  - Update the `crew-and-front-door` memory with the merge commit.
