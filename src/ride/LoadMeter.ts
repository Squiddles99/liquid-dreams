/**
 * The keyboard load meter (ride-speed spec §5; Andrew 2026-10-14 chose the minimalist mock, docs/art/ui/load-meter-mock.png):
 * a thin bar beside the HUD pill, filled by the load in the rider's feet (0.5–2 g), a hairline at 1 g, a glow at each
 * load peak (the moment to extend) and a small ▲/▼ with the last pump's gain. A pad feels this as rumble instead.
 */
export type MeterSetting = 'auto' | 'on' | 'off';

export const meterShown = (setting: MeterSetting, padConnected: boolean): boolean => setting === 'on' || (setting === 'auto' && !padConnected);

const LO = 0.5, HI = 2;
/** The bar's fill for a load (g), 0 … 1. */
export const meterFill = (load: number): number => Math.min(1, Math.max(0, (load - LO) / (HI - LO)));

/** The tick's words for a pump cycle's energy (J/kg) at the rider's speed: the speed it made (Δv ≈ ΔE / v); null under
 * TICK_MIN_MS, too small to tell. */
export const TICK_MIN_MS = 0.05;
export function tickText(pumpGain: number, speed: number): string | null {
  const ms = pumpGain / Math.max(1, speed);
  if (!(Math.abs(ms) >= TICK_MIN_MS)) return null;
  return `${ms >= 0 ? '▲ +' : '▼ −'}${Math.abs(ms).toFixed(1)}`;
}

const PEAK_ON = 1.2, PEAK_OFF = 1.1, GLOW_S = 0.25, TICK_S = 0.6, FILL_TAU_S = 0.05;

export class LoadMeter {
  private readonly root = document.createElement('div');
  private readonly fill = document.createElement('div');
  private readonly tick = document.createElement('div');
  private shown = 0;
  private glowT = 0;
  private tickT = 0;
  private peaked = false;
  private lastGain = 0;

  constructor(parent: HTMLElement) {
    // Beside the pill: the parent is the HUD (position: fixed), so the bar stands just left of it, its foot on the pill's.
    Object.assign(this.root.style, {
      position: 'absolute', right: 'calc(100% + 10px)', bottom: '0', width: '6px', height: '120px', borderRadius: '3px',
      background: 'rgba(0,0,0,0.35)', pointerEvents: 'none', display: 'none',
    });
    Object.assign(this.fill.style, {
      position: 'absolute', left: '0', bottom: '0', width: '6px', height: '0%', borderRadius: '3px', background: '#e8f1f8',
      transition: 'box-shadow 0.25s, background 0.25s',
    });
    const hairline = document.createElement('div');
    Object.assign(hairline.style, {
      position: 'absolute', left: '-4px', width: '14px', height: '1px', bottom: `${meterFill(1) * 100}%`, background: 'rgba(255,255,255,0.8)',
    });
    Object.assign(this.tick.style, {
      position: 'absolute', left: '10px', top: '-4px', font: '600 11px system-ui, sans-serif', whiteSpace: 'nowrap',
      textShadow: '0 1px 2px #000', opacity: '0', transition: 'opacity 0.2s',
    });
    this.root.append(this.fill, hairline, this.tick);
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  /** `pumpGain`: the last pump cycle's energy (J/kg); shown as the speed it made at `speed` (Δv ≈ ΔE / v). */
  update(load: number, pumpGain: number, speed: number, dt: number): void {
    this.shown += (meterFill(load) - this.shown) * (1 - Math.exp(-dt / FILL_TAU_S));
    this.fill.style.height = `${(this.shown * 100).toFixed(1)}%`;
    if (!this.peaked && load > PEAK_ON) {
      this.peaked = true;
      this.glowT = GLOW_S;
    } else if (this.peaked && load < PEAK_OFF) this.peaked = false;
    this.glowT = Math.max(0, this.glowT - dt);
    const glowing = this.glowT > 0;
    this.fill.style.background = glowing ? '#cdf0ff' : '#e8f1f8';
    this.fill.style.boxShadow = glowing ? '0 0 10px 2px rgba(150,225,255,0.85)' : 'none';
    if (pumpGain !== this.lastGain) {
      this.lastGain = pumpGain;
      const words = tickText(pumpGain, speed);
      if (words) {
        this.tick.textContent = words;
        this.tick.style.color = pumpGain >= 0 ? '#e8f1f8' : '#ffc4ba';
        this.tickT = TICK_S;
      }
    }
    this.tickT = Math.max(0, this.tickT - dt);
    this.tick.style.opacity = this.tickT > 0 ? '1' : '0';
  }
}
