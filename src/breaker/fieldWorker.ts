import { computeReefField, type ReefFieldRequest } from './reefField';

type Message = ReefFieldRequest & { id: number };

// This file runs in a dedicated worker, but the project's DOM lib types `self` as Window: cast once here.
const worker = self as unknown as Worker;

worker.onmessage = (e: MessageEvent<Message>) => {
  const { id, ...req } = e.data;
  const field = computeReefField(req);
  const transfer = [field.tau, field.amp, field.hmin, field.hminBreak, field.k, field.dirX, field.dirZ, field.depth, field.onset, field.onsetAmp,
    field.far.tau, field.far.dTauDx, field.far.amp, field.far.hmin, field.far.k, field.far.depth].map((a) => a.buffer as ArrayBuffer);
  worker.postMessage({ id, field }, transfer);
};
