import type { Bathymetry } from '../seabed/bathymetry';
import type { CoastParams } from '../seabed/coastFeatures';
import { buildCoastMap } from '../seabed/coastMap';
import { type CoastField, computeCoastField } from './coastField';
import { computeReefField, type ReefFieldRequest } from './reefField';

/** The request as posted: the coast map is built here from its dials (lineup truth spec §3b), not sent. The probes' onset sink
 * (`onsetDebug`) is not part of the game's request: typed out here, so the game's bake never fills it. */
export type GameFieldRequest = Omit<ReefFieldRequest, 'onsetDebug'> & { onsetDebug?: never };
/** One truth (shelf-polish spec §6): the coast map always seeds the game's field; the flat-bed far field is the tests' alone. */
export type FieldMessage = GameFieldRequest & { id: number; coastParams: CoastParams };

// This file runs in a dedicated worker, but the project's DOM lib types `self` as Window: cast once here.
const worker = self as unknown as Worker;

/** A cheap fingerprint of the reef bed (every 97th cell), so a reef rebuild invalidates the cached coast. */
function bedPrint(b: Bathymetry): string {
  let h = 0;
  for (let i = 0; i < b.bed.length; i += 97) h = (h * 31 + Math.round(b.bed[i] * 1000)) | 0;
  return `${b.grid.nx}x${b.grid.nz}:${h}`;
}

let mapCache: { key: string; bed: Bathymetry } | null = null;
let fieldCache: { key: string; field: CoastField } | null = null;

worker.onmessage = (e: MessageEvent<FieldMessage>) => {
  const { id, coastParams, ...req } = e.data;
  const mapKey = `${JSON.stringify(coastParams)}|${bedPrint(req.bed)}`;
  let t = performance.now();
  if (mapCache?.key !== mapKey) { mapCache = { key: mapKey, bed: buildCoastMap(req.bed, coastParams) }; fieldCache = null; }
  const mapMs = performance.now() - t;
  const fieldKey = `${mapKey}|${req.periodS}|${req.fromDeg}|${req.tideM}|${req.refractFloorM ?? 0}`;
  t = performance.now();
  // The reef field shifts the coast's clock onto its own (computeReefField), so each reply gets its own copy.
  if (fieldCache?.key !== fieldKey) fieldCache = { key: fieldKey, field: computeCoastField({ bed: mapCache.bed, periodS: req.periodS, fromDeg: req.fromDeg, tideM: req.tideM, refractFloorM: req.refractFloorM }) };
  const coastMs = performance.now() - t;
  const coastField: CoastField = cloneCoast(fieldCache.field);
  t = performance.now();
  const field = computeReefField({ ...req, coastField });
  const reefMs = performance.now() - t;
  const arrays = [field.tau, field.amp, field.hmin, field.hminBreak, field.hminSlurp, field.hminLean, field.k, field.dirX, field.dirZ, field.depth, field.onset,
    field.far.tau, field.far.dTauDx, field.far.amp, field.far.hmin, field.far.k, field.far.depth];
  if (field.coast) { const c = field.coast; arrays.push(c.tau, c.dirX, c.dirZ, c.k, c.amp, c.hmin, c.hminBreak, c.depth); }
  worker.postMessage({ id, field, timing: { mapMs, coastMs, reefMs } }, arrays.map((a) => a.buffer as ArrayBuffer));
};

/** A copy whose arrays can be transferred (and whose clock can be shifted) without touching the cached one. */
function cloneCoast(c: CoastField): CoastField {
  const f = c.far;
  return {
    ...c, tau: c.tau.slice(), dirX: c.dirX.slice(), dirZ: c.dirZ.slice(), k: c.k.slice(), amp: c.amp.slice(), hmin: c.hmin.slice(), hminBreak: c.hminBreak.slice(), depth: c.depth.slice(),
    far: { ...f, tau: f.tau.slice(), dTauDx: f.dTauDx.slice(), amp: f.amp.slice(), hmin: f.hmin.slice(), k: f.k.slice(), depth: f.depth.slice() },
  };
}
