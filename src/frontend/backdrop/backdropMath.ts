// The lookout backdrop's numbers (lookout backdrop spec §2, §4, §5): pure, so the tests pin them.

/** Andrew's ground paintings are 16:9. */
export const PLATE_ASPECT = 16 / 9;

const DEG = Math.PI / 180;
const MS_TO_KN = 1.943844;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => x * x * (3 - 2 * x);

/**
 * Screen uv → painting uv for a cover fit anchored at the painting's bottom-right (u right, v down from the top, on
 * both). A wider screen fits the width and crops the top; a narrower one fits the height and crops the left.
 */
export function coverUV(u: number, v: number, screenAspect: number): [number, number] {
  if (screenAspect >= PLATE_ASPECT) {
    const s = PLATE_ASPECT / screenAspect; // the share of the painting's height on screen
    return [u, 1 - s + v * s];
  }
  const s = screenAspect / PLATE_ASPECT; // the share of its width on screen
  return [1 - s + u * s, v];
}

export interface WindDrive {
  /** Playback speed of the shrubs' motion (1 = as Andrew's animation). */
  rate: number;
  /** −1…1: the tips' lean across the screen (+ = toward screen right). */
  lean: number;
  /** −1…1: + the wind blows into the screen (away from the camera), − toward it. */
  squash: number;
  /** 0…1: how strong the gusts rolling across the bank are. */
  gust: number;
}

/** Spec §4's table: calm < 3 kn barely trembles, ~8 kn plays as animated, ≥ 20 kn up to 1.8× with full lean. */
export function windDrive(speedMs: number, fromDeg: number, cameraYawDeg: number): WindDrive {
  const kn = Math.max(0, speedMs) * MS_TO_KN;
  const rate = kn <= 3 ? 0.15 : kn <= 8 ? 0.15 + ((kn - 3) / 5) * 0.85 : Math.min(1.8, 1 + ((kn - 8) / 12) * 0.8);
  const strength = kn <= 3 ? 0 : kn <= 8 ? 0.3 * ((kn - 3) / 5) : Math.min(1, 0.3 + (0.7 * (kn - 8)) / 12);
  const gust = clamp01((kn - 3) / 17);
  // World: bearing b points along (sin b, −cos b); the camera's forward is (sin yaw, −cos yaw), its right (cos yaw, sin yaw).
  const to = (fromDeg + 180) * DEG, yaw = cameraYawDeg * DEG;
  const wx = Math.sin(to), wz = -Math.cos(to);
  const side = wx * Math.cos(yaw) + wz * Math.sin(yaw);
  const away = wx * Math.sin(yaw) - wz * Math.cos(yaw);
  // `+ 0` turns a calm day's −0 into 0.
  return { rate, lean: side * strength + 0, squash: away * strength + 0, gust };
}

export interface FadeState {
  beat: string;
  move: { from: string; to: string; t: number } | null;
}

/** How much of each painted ground shows: the heath crest on Conditions, the bank on Choose your rider and Grab your gear. */
export interface PlateShow {
  conditions: number;
  select: number;
}

const groundOf = (beat: string): PlateShow | null =>
  beat === 'map' || beat === 'conditions' ? { conditions: 1, select: 0 } : beat === 'rider' || beat === 'gear' ? { conditions: 0, select: 1 } : null;

/**
 * Which painted ground shows (painted riders spec): every screen has its painting, under one camera, so a move between
 * Conditions and the rider screens cross-fades the two grounds over the move (no camera flight). 0 for both when the menu
 * is closed. `null` while paddling out: the ground that was showing stays, under the paddle-out cover.
 */
export function backdropShow(s: FadeState | null): PlateShow | null {
  if (!s) return { conditions: 0, select: 0 };
  if (s.beat === 'out') return null;
  const to = groundOf(s.beat)!;
  if (!s.move) return to;
  const from = groundOf(s.move.from) ?? to, k = smooth(clamp01(s.move.t));
  return { conditions: from.conditions + (to.conditions - from.conditions) * k, select: from.select + (to.select - from.select) * k };
}

/** One frame of exponential easing toward `target` with time constant `tauS` (frame-rate independent, never overshoots). */
export function easeToward(current: number, target: number, dtS: number, tauS: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dtS) / tauS));
}

/** Where a painted layer sits on the ground painting: its top-left and its size, in the ground's uv (both are 16:9). */
export interface LayerRect {
  x: number;
  y: number;
  scale: number;
}

/** Ground uv → the layer's own uv. */
export function layerUV(u: number, v: number, r: LayerRect): [number, number] {
  return [(u - r.x) / r.scale, (v - r.y) / r.scale];
}

export const insideLayer = (u: number, v: number): boolean => u >= 0 && u <= 1 && v >= 0 && v <= 1;

/**
 * The crew on Conditions (Andrew's conditions-gang painting, sized like his conditions-select-screen mockup): 48 % of the
 * ground's size, so they stand ~46 % of the screen tall; the trio's centre (48.3 % across their own picture) at 60 %
 * across, and their feet (97.1 % down it) on the track at 92 % down, leaving the break and the sets above them.
 */
export const CREW_RECT: LayerRect = { x: 0.6 - 0.48 * 0.483, y: 0.92 - 0.48 * 0.971, scale: 0.48 };

/** tools/riderArt.py's riders.json, per rider: the crop's box and the figure's head, soles and centre, in the originals' px. */
export interface RiderArt {
  size: [number, number];
  box: [number, number, number, number];
  headY: number;
  solesY: number;
  centreX: number;
  outfits: string[];
}

/** A painted rider's place on the screen: top-left and size, in screen uv (v down). */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the rider stands (Andrew's choose-rider and grab-your-gear mockups): soles on the track 95 % down the screen, the
 * figure's centre 36 % across (clear of the panel on the right, and of the bank's big rock at 28 %, Andrew 2026-10-08), and T-Bone (1.78 m) 80 % of the screen tall; the others
 * by their real heights, so Grommet is a head shorter. In screen space, not the ground's: the 4:3 cover crop cuts the
 * ground's left, and the rider must stay in the frame and clear of the panel at every aspect.
 */
export const RIDER_STAND = { solesV: 0.95, centreU: 0.36, tallM: 1.78, tallH: 0.8 } as const;

/**
 * How far the widest painted rider reaches left of the figure's centre at 16:9, in screen width: T-Bone with his pack
 * (riders.json: 569 px of the 3150 px figure, at 80 % of the screen tall), plus a hair. Text beside the rider ends here.
 */
export const RIDER_HALF_W = 0.085;

export function riderRect(art: RiderArt, heightM: number, screenAspect: number): ScreenRect {
  const figPx = art.solesY - art.headY, perPx = (RIDER_STAND.tallH * heightM) / RIDER_STAND.tallM / figPx;
  const [bx0, by0, bx1, by1] = art.box;
  const h = (by1 - by0) * perPx, w = ((bx1 - bx0) * perPx) / screenAspect;
  return { x: RIDER_STAND.centreU - ((art.centreX - bx0) * perPx) / screenAspect, y: RIDER_STAND.solesV - (art.solesY - by0) * perPx, w, h };
}
