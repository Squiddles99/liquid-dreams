// src/breaks/breakData.ts: a surf break's file (surf-map hub spec §5–6): where it is, its best conditions, the panel's
// summary and the details page's seven sections, the sources behind them (never shown) and the claims the game must back.
// A paragraph or summary line tied to a claim shows only if that claim's game check passed (src/breaks/<id>.claims.json).

export type Tide = 'low' | 'mid' | 'high';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type SectionId = 'wave' | 'when' | 'who' | 'hazards' | 'access' | 'story' | 'inGame';
export const SECTION_ORDER: readonly SectionId[] = ['wave', 'when', 'who', 'hazards', 'access', 'story', 'inGame'];

export interface Para { text: string; claim?: string }
export interface BreakBest { swellFromDeg: [number, number]; sizeFt: [number, number]; windFromDeg: [number, number]; tide: Tide[]; level: Level }
export interface BreakSection { id: SectionId; heading: string; paragraphs: Para[] }
export interface BreakClaim { id: string; text: string; check: string }
export interface BreakFile {
  id: string; name: string; kicker: string; subtitle: string; lonLat: [number, number]; hero: string;
  best: BreakBest;
  /** The claim each best-conditions row stands on (the row hides if it failed). */
  bestClaims: { swell: string; wind: string; tide: string };
  summary: Para[];
  details: BreakSection[];
  sources: Record<SectionId, string[]>;
  claims: BreakClaim[];
}
export type ClaimResults = Record<string, { pass: boolean; detail: string }>;
export interface BreakView extends Omit<BreakFile, 'summary' | 'details'> {
  summary: Para[]; details: BreakSection[]; dropped: string[]; bestShown: { swell: boolean; wind: boolean; tide: boolean };
}

const fail = (id: string, why: string): never => { throw new Error(`break file: ${id}: ${why}`); };
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export function parseBreak(raw: unknown): BreakFile {
  if (!raw || typeof raw !== 'object') throw new Error('break file: not an object');
  const b = raw as BreakFile, id = isStr(b.id) ? b.id : fail('?', 'missing id');
  for (const k of ['name', 'kicker', 'subtitle', 'hero'] as const) if (!isStr(b[k])) fail(id, `missing ${k}`);
  if (!isPair(b.lonLat)) fail(id, 'lonLat must be [lon, lat]');
  const best = b.best;
  if (!best || !isPair(best.swellFromDeg) || !isPair(best.sizeFt) || !isPair(best.windFromDeg) || !Array.isArray(best.tide) || best.tide.length === 0) fail(id, 'best is incomplete');
  if (!best.tide.every((t) => t === 'low' || t === 'mid' || t === 'high')) fail(id, 'best.tide must be low/mid/high');
  if (!['beginner', 'intermediate', 'advanced'].includes(best.level)) fail(id, 'best.level is wrong');
  if (!Array.isArray(b.claims)) fail(id, 'claims must be a list');
  const claimIds = new Set(b.claims.map((c) => (isStr(c.id) && isStr(c.text) && isStr(c.check) ? c.id : fail(id, 'a claim needs id, text and check'))));
  const known = (c: string | undefined, where: string): void => { if (c !== undefined && !claimIds.has(c)) fail(id, `${where} cites unknown claim "${c}"`); };
  if (!b.bestClaims) fail(id, 'missing bestClaims');
  for (const k of ['swell', 'wind', 'tide'] as const) known(b.bestClaims[k], `bestClaims.${k}`);
  if (!Array.isArray(b.summary) || b.summary.length === 0) fail(id, 'summary is empty');
  b.summary.forEach((p, i) => { if (!isStr(p.text)) fail(id, `summary ${i} has no text`); known(p.claim, `summary ${i}`); });
  if (!Array.isArray(b.details) || b.details.map((s) => s.id).join() !== SECTION_ORDER.join()) fail(id, `details must have the 7 sections in order: ${SECTION_ORDER.join(', ')}`);
  for (const s of b.details) {
    if (!isStr(s.heading) || !Array.isArray(s.paragraphs) || s.paragraphs.length === 0) fail(id, `section ${s.id} needs a heading and paragraphs`);
    s.paragraphs.forEach((p, i) => { if (!isStr(p.text)) fail(id, `${s.id} paragraph ${i} has no text`); known(p.claim, `${s.id} paragraph ${i}`); });
  }
  for (const s of SECTION_ORDER) if (!Array.isArray(b.sources?.[s]) || b.sources[s].length < 2) fail(id, `${s} needs at least 2 sources`);
  return b;
}

/** What the panel and the details page may show: claims without a passing result are dropped, with their text. */
export function viewOf(b: BreakFile, results: ClaimResults): BreakView {
  const ok = (c?: string): boolean => c === undefined || results[c]?.pass === true;
  const dropped = b.claims.map((c) => c.id).filter((c) => !ok(c));
  const details = b.details.map((s) => ({ ...s, paragraphs: s.paragraphs.filter((p) => ok(p.claim)) })).filter((s) => s.paragraphs.length > 0);
  return {
    ...b, summary: b.summary.filter((p) => ok(p.claim)), details, dropped,
    bestShown: { swell: ok(b.bestClaims.swell), wind: ok(b.bestClaims.wind), tide: ok(b.bestClaims.tide) },
  };
}
