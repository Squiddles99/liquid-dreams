import type * as THREE from 'three/webgpu';
import { exposureCloudStops } from './fog';

type Rgb = readonly [number, number, number];

const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Luminance of the light on a level surface: the sun at its elevation, through the cloud (transmittance), plus the sky. */
export function meterLuminance(sun: Rgb, sunY: number, sunTransmittance: number, skyIrradiance: Rgb): number {
  return luminance(sun) * Math.max(sunY, 0) * sunTransmittance + luminance(skyIrradiance);
}

/** One step of an eye adapting: toward the target at `ratePerS` stops a second, never past it. */
export function easeStops(current: number, target: number, dtS: number, ratePerS: number): number {
  const step = ratePerS * dtS;
  return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
}

/** How often the meter reads the sky light back from the GPU. */
const READ_INTERVAL_S = 0.25;
/** How fast the exposure follows the cloud (stops per second): a passing cloud shadow eases in, like an eye. */
const ADAPT_STOPS_PER_S = 1;

/**
 * The exposure's cloud term (spec 2026-09-30 §4.6): every READ_INTERVAL_S it reads back the sky light (clear and
 * cloudy irradiance, the sun) and the sun's transmittance through the cloud, and opens up two-thirds of the way from
 * the clear light to the cloudy light, easing there at ADAPT_STOPS_PER_S.
 */
export class CloudMeter {
  /** The stops the exposure opens up by now, and the sun's last-read transmittance (for the sun-in-view stop-down). */
  stops = 0;
  sunVisible = 1;
  private target = 0;
  private sinceRead = READ_INTERVAL_S;
  private pending = false;
  /** Bumped by snapNext: a read issued before it is stale and ignored. */
  private generation = 0;
  private snap = false;

  constructor(private readonly skyLight: THREE.StorageBufferAttribute, private readonly cloudSun: THREE.StorageBufferAttribute) {}

  update(renderer: THREE.WebGPURenderer, dtS: number, sunY: number, hasClouds: boolean): void {
    if (!hasClouds) {
      this.target = 0;
      this.sunVisible = 1;
      if (this.snap) { this.stops = 0; this.snap = false; }
    } else {
      this.sinceRead += dtS;
      if (this.sinceRead >= READ_INTERVAL_S && !this.pending) {
        this.sinceRead = 0;
        this.pending = true;
        const generation = this.generation;
        void Promise.all([renderer.getArrayBufferAsync(this.skyLight), renderer.getArrayBufferAsync(this.cloudSun)]).then(([a, b]) => {
          if (generation !== this.generation) return;
          const f = new Float32Array(a), s = new Float32Array(b);
          const cloudy: Rgb = [f[0], f[1], f[2]], sun: Rgb = [f[4], f[5], f[6]], clear: Rgb = [f[8], f[9], f[10]];
          this.sunVisible = s[0];
          this.target = exposureCloudStops(meterLuminance(sun, sunY, 1, clear), meterLuminance(sun, sunY, s[0], cloudy));
          if (this.snap) { this.stops = this.target; this.snap = false; }
        }).finally(() => { if (generation === this.generation) this.pending = false; });
      }
    }
    this.stops = easeStops(this.stops, this.target, dtS, ADAPT_STOPS_PER_S);
  }

  /**
   * A moment was applied: read at once and jump to what the new sky meters, with no adaptation to watch, so a capture
   * or link never depends on the sky before it (final review I4). Reads already in flight are dropped.
   */
  snapNext(): void {
    this.generation++;
    this.pending = false;
    this.snap = true;
    this.sinceRead = READ_INTERVAL_S;
  }
}
