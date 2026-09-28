import type { Burst } from '../bombie/bombieModel';
import type { CameraMode } from '../dev/momentLink';
import type { SurfState } from '../surf/surfModel';
import { type HitEvent, type HitTick, HitTracker, type Point3, airCutoffHz } from './hits';
import { Follower, ROAR_ATTACK_S, ROAR_RELEASE_S, bombieRumble, lapping, roarSource, scrubLevel, swashSound, washLevel, washPosition, windSound } from './levels';

/** One frame of the game, as the sound needs it (Phase 5 spec §3.2). */
export interface SoundInput {
  simTime: number;
  /** A real clock (s): the gusts, and hits in flight. */
  realTime: number;
  paused: boolean;
  hidden: boolean;
  camera: Point3 & { mode: CameraMode };
  underwater: boolean;
  windSpeedMs: number;
  tideM: number;
  /** The spray ticks since the last frame (ticksToHear), with their impact emitters. */
  ticks: readonly HitTick[];
  bursts: readonly Burst[];
  bombieSize: number;
  surf: SurfState | null;
  /** The land's waterline x at the camera's z, or null before the land loads. */
  waterlineX: number | null;
  /** The water's height under the camera, or null before the probe reads. */
  waterY: number | null;
  plantDensity: number;
  nearRocks: boolean;
}

export interface Placed extends Point3 {
  level: number;
  cutoffHz: number;
}

/** What every voice should be doing this frame (the engine renders it). */
export interface SoundFrame {
  hits: HitEvent[];
  roar: Placed & { brightness: number };
  wash: Placed;
  rumble: Placed;
  wind: { level: number; brightness: number };
  scrub: number;
  lapping: { level: number; rate: number };
  swash: { level: number; drawBack: number; pebbles: number };
  underwater: boolean;
  effectsOn: boolean;
}

export class SoundModel {
  private readonly hits = new HitTracker();
  private readonly roar = new Follower();
  private readonly roarBright = new Follower();
  /** The latest tick's roar target: held on the frames between the 20 Hz ticks. */
  private roarTarget = 0;
  private roarAt: Point3 = { x: 0, y: 0.5, z: 0 };
  private prev: { simTime: number; waterY: number | null; rate: number; swash: number } | null = null;

  step(i: SoundInput): SoundFrame {
    const cam = i.camera;
    const dt = this.prev ? i.simTime - this.prev.simTime : 0;
    const placed = (p: Point3, level: number): Placed => ({ x: p.x, y: p.y, z: p.z, level, cutoffHz: airCutoffHz(Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z)) });

    if (i.ticks.length > 0) {
      const src = roarSource(i.ticks[i.ticks.length - 1].impact);
      this.roarTarget = src?.level ?? 0;
      if (src) this.roarAt = src.at;
    }
    const roar = this.roar.step(this.roarTarget, dt, ROAR_ATTACK_S, ROAR_RELEASE_S);
    const bright = this.roarBright.step(this.roarTarget > 0 ? 1 : 0, dt, 0.1, 2.5);

    const p = this.prev;
    const rate = p && dt > 0 && i.waterY !== null && p.waterY !== null ? (i.waterY - p.waterY) / dt : (p?.rate ?? 0);
    const wind = windSound(i.windSpeedMs, i.realTime);
    const sw = swashSound({ mode: cam.mode, camX: cam.x, camZ: cam.z, waterlineX: i.waterlineX, tideM: i.tideM, surf: i.surf, t: i.simTime, nearRocks: i.nearRocks, prevRaw: p?.swash ?? null });
    const rumble = bombieRumble(i.bursts, i.bombieSize);
    const wash = i.surf && i.waterlineX !== null ? placed(washPosition(cam.z, i.waterlineX, i.tideM), washLevel(cam.z, i.simTime, i.surf)) : placed(cam, 0);

    const frame: SoundFrame = {
      hits: this.hits.hear({ ticks: i.ticks, bursts: i.bursts, bombieSize: i.bombieSize, camera: cam, simTime: i.simTime, realTime: i.realTime, tideM: i.tideM }),
      roar: { ...placed(this.roarAt, roar), brightness: bright },
      wash,
      rumble: placed(rumble.at, rumble.level),
      wind,
      scrub: scrubLevel(cam.mode, wind.level, i.plantDensity),
      lapping: lapping(cam.mode, i.underwater, cam.y, i.waterY, rate),
      swash: { level: sw.level, drawBack: sw.drawBack, pebbles: sw.pebbles },
      underwater: i.underwater,
      effectsOn: !i.paused && !i.hidden,
    };
    this.prev = { simTime: i.simTime, waterY: i.waterY, rate, swash: sw.raw };
    return frame;
  }
}
