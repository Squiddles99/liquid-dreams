import { LatestOnly } from './LatestOnly';
import type { CoastParams } from '../seabed/coastFeatures';
import type { ReefField } from './reefField';
import type { GameFieldRequest } from './fieldWorker';

/** Solves the reef wave field off the main thread; only the newest request's answer is delivered. */
export class ReefFieldClient {
  onField: ((f: ReefField) => void) | null = null;
  private readonly worker = new Worker(new URL('./fieldWorker.ts', import.meta.url), { type: 'module' });
  private readonly latest = new LatestOnly();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id: number; field: ReefField; timing?: { mapMs: number; coastMs: number; reefMs: number } }>) => {
      const t = e.data.timing;
      // The build's cost, per solve (lineup truth Task 2): the coast map and eikonal are cached while the swell and tide hold.
      if (t) console.info(`[field] coast map ${t.mapMs.toFixed(0)} ms, coast eikonal ${t.coastMs.toFixed(0)} ms, reef ${t.reefMs.toFixed(0)} ms`);
      if (this.latest.accept(e.data.id)) this.onField?.(e.data.field);
    };
    this.worker.onerror = (e) => console.warn('Reef field worker failed; keeping the previous field', e.message);
  }

  /** `coastParams`: the worker builds the coast map from them and seeds the field from the coast (lineup truth spec §3c). */
  request(req: GameFieldRequest & { coastParams: CoastParams }): void {
    this.worker.postMessage({ id: this.latest.next(), ...req });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
