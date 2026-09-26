import { LatestOnly } from './LatestOnly';
import type { ReefField, ReefFieldRequest } from './reefField';

/** Solves the reef wave field off the main thread; only the newest request's answer is delivered. */
export class ReefFieldClient {
  onField: ((f: ReefField) => void) | null = null;
  private readonly worker = new Worker(new URL('./fieldWorker.ts', import.meta.url), { type: 'module' });
  private readonly latest = new LatestOnly();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id: number; field: ReefField }>) => {
      if (this.latest.accept(e.data.id)) this.onField?.(e.data.field);
    };
    this.worker.onerror = (e) => console.warn('Reef field worker failed; keeping the previous field', e.message);
  }

  request(req: ReefFieldRequest): void {
    this.worker.postMessage({ id: this.latest.next(), ...req });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
