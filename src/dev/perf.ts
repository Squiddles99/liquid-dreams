import * as THREE from 'three/webgpu';
import Stats from 'stats-gl';

export interface AdapterSummary {
  vendor: string;
  architecture: string;
  description: string;
}

export const INTEGRATED_GPU_HELP =
  'Running on integrated graphics. For full performance: Windows Settings → System → Display → Graphics → add your browser → Options → High performance, then restart the browser.';

export function summariseAdapter(info: unknown): AdapterSummary {
  const o = (typeof info === 'object' && info !== null ? info : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return { vendor: s(o.vendor), architecture: s(o.architecture), description: s(o.description) };
}

export function describeAdapter(a: AdapterSummary): string {
  return a.description || [a.vendor, a.architecture].filter(Boolean).join(' ') || 'unknown GPU';
}

export function isLikelyIntegratedGpu(a: AdapterSummary): boolean {
  const text = `${a.vendor} ${a.architecture} ${a.description}`.toLowerCase();
  return /intel/.test(text) && !/\barc\b|alchemist|battlemage/.test(text);
}

const PAUSED_BADGE_TEXT = 'Paused — P to resume';

/** How many frames' GPU times window.__ldGpuMs keeps. */
export const GPU_SAMPLES = 600;

/** stats-gl (FPS / CPU / GPU ms) + adapter name + paused badge + integrated-GPU warning + transient messages. */
export class PerfOverlay {
  private readonly stats: Stats;
  private readonly label = document.createElement('div');
  private readonly pausedBadge = document.createElement('div');
  private readonly toast = document.createElement('div');
  private banner: HTMLElement | null = null;
  private toastTimer: number | undefined;
  private visible = true;
  private paused = false;

  constructor(private readonly renderer: THREE.WebGPURenderer) {
    this.stats = new Stats({ trackGPU: true, trackCPT: true });
    // init() is async (it awaits renderer.init()); a failure only costs the GPU graph, so log it rather than reject unhandled.
    this.stats.init(renderer).catch((e: unknown) => console.warn('stats-gl init failed', e));
    document.body.append(this.stats.dom);

    const adapter = summariseAdapter((renderer.backend as { device?: { adapterInfo?: unknown } }).device?.adapterInfo);
    Object.assign(this.label.style, { position: 'fixed', left: '8px', top: '56px', color: '#cfe3f2', font: '11px monospace', zIndex: '9' });
    this.label.textContent = describeAdapter(adapter);
    document.body.append(this.label);

    // Reference moments open paused; without a cue a frozen sea reads as a hang.
    Object.assign(this.pausedBadge.style, { position: 'fixed', left: '8px', top: '74px', padding: '2px 6px', borderRadius: '4px',
      background: 'rgba(4,18,32,0.7)', color: '#e8f1f8', font: '11px system-ui', zIndex: '9', display: 'none' });
    this.pausedBadge.textContent = PAUSED_BADGE_TEXT;
    document.body.append(this.pausedBadge);

    Object.assign(this.toast.style, { position: 'fixed', left: '50%', top: '16px', transform: 'translateX(-50%)', padding: '6px 12px',
      background: 'rgba(4,18,32,0.85)', color: '#e8f1f8', borderRadius: '6px', font: '13px system-ui', zIndex: '9', display: 'none' });
    document.body.append(this.toast);

    if (isLikelyIntegratedGpu(adapter)) {
      this.banner = document.createElement('div');
      this.banner.className = 'banner';
      this.banner.textContent = INTEGRATED_GPU_HELP;
      document.body.append(this.banner);
    }
  }

  update(): void {
    // stats-gl reads renderer.info.{render,compute}.timestamp, which three only fills when asked to resolve its
    // timestamp queries (the pool coalesces overlapping requests, so once per frame is safe).
    void this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER);
    void this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.COMPUTE);
    this.stats.update();
    // The frame's GPU time (render + compute, ms, as stats-gl graphs it), kept for reading by script: the panel is a
    // canvas. window.__ldGpuMs holds the last GPU_SAMPLES frames (the barrel-from-maths plan's performance budget).
    const info = this.renderer.info as unknown as { render: { timestamp?: number }; compute: { timestamp?: number } };
    const ms = (info.render.timestamp ?? 0) + (info.compute.timestamp ?? 0);
    if (ms > 0) {
      const w = window as unknown as { __ldGpuMs?: number[] };
      (w.__ldGpuMs ??= []).push(ms);
      if (w.__ldGpuMs.length > GPU_SAMPLES) w.__ldGpuMs.shift();
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    const display = visible ? '' : 'none';
    this.stats.dom.style.display = display;
    this.label.style.display = display;
    if (this.banner) this.banner.style.display = display;
    this.syncPausedBadge();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.syncPausedBadge();
  }

  private syncPausedBadge(): void {
    this.pausedBadge.style.display = this.visible && this.paused ? '' : 'none';
  }

  flash(message: string): void {
    this.toast.textContent = message;
    this.toast.style.display = '';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast.style.display = 'none'; }, 2000);
  }
}
