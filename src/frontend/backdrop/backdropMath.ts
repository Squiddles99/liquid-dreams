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

const shows = (beat: string): number => (beat === 'conditions' || beat === 'out' ? 1 : 0);

/** 1 where the painting shows (Conditions; under the paddle-out cover), 0 elsewhere and whenever the menu is closed. */
export function backdropFade(s: FadeState | null): number {
  if (!s) return 0;
  if (!s.move) return shows(s.beat);
  const a = shows(s.move.from), b = shows(s.move.to), t = s.move.t;
  if (a > b) return 1 - smooth(clamp01(t / 0.5));
  if (b > a) return smooth(clamp01((t - 0.5) / 0.5));
  return a;
}

/** One frame of exponential easing toward `target` with time constant `tauS` (frame-rate independent, never overshoots). */
export function easeToward(current: number, target: number, dtS: number, tauS: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dtS) / tauS));
}
