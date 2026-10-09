// src/breaks/breakData.test.ts
import { describe, expect, it } from 'vitest';
import { type BreakFile, SECTION_ORDER, parseBreak, viewOf } from './breakData';

const good = (): BreakFile => ({
  id: 'test', name: 'Test Break', kicker: 'REEF BREAK · NEAR TESTVILLE', subtitle: 'A test left', lonLat: [115, -33.9], hero: 'breaks/test-hero.webp',
  best: { swellFromDeg: [225, 270], sizeFt: [4, 10], windFromDeg: [45, 135], tide: ['mid'], level: 'advanced' },
  bestClaims: { swell: 'best-swell', wind: 'best-wind', tide: 'best-tide' },
  summary: [{ text: 'A heavy left.', claim: 'left' }, { text: 'It barrels.', claim: 'barrels' }, { text: 'Mind the reef.' }],
  details: SECTION_ORDER.map((id) => ({ id, heading: id.toUpperCase(), paragraphs: [{ text: `${id} text.` }] })),
  sources: Object.fromEntries(SECTION_ORDER.map((id) => [id, ['https://example.org/a', 'https://example.org/b']])) as BreakFile['sources'],
  claims: [
    { id: 'left', text: 'A left', check: 'peel-left' }, { id: 'barrels', text: 'Barrels', check: 'barrel' },
    { id: 'best-swell', text: 'Best swell W–SW', check: 'best-swell' }, { id: 'best-wind', text: 'Best wind E', check: 'best-wind' },
    { id: 'best-tide', text: 'Best tide mid', check: 'best-tide' },
  ],
});

describe('parseBreak', () => {
  it('accepts a good file', () => { expect(parseBreak(good()).id).toBe('test'); });
  it('rejects a file missing a section', () => {
    const b = good(); b.details = b.details.slice(1);
    expect(() => parseBreak(b)).toThrow(/break file: test: details must have the 7 sections/);
  });
  it('rejects a paragraph citing an unknown claim', () => {
    const b = good(); b.details[0].paragraphs.push({ text: 'x', claim: 'nope' });
    expect(() => parseBreak(b)).toThrow(/unknown claim "nope"/);
  });
  it('rejects a section with fewer than two sources', () => {
    const b = good(); b.sources.wave = ['https://example.org/a'];
    expect(() => parseBreak(b)).toThrow(/wave needs at least 2 sources/);
  });
  it('rejects nonsense', () => { expect(() => parseBreak(null)).toThrow(/break file/); });
});

describe('viewOf', () => {
  const pass = { pass: true, detail: '' }, fail = { pass: false, detail: 'no game check yet' };
  it('keeps everything when every claim passed', () => {
    const v = viewOf(good(), { left: pass, barrels: pass, 'best-swell': pass, 'best-wind': pass, 'best-tide': pass });
    expect(v.summary).toHaveLength(3); expect(v.dropped).toEqual([]); expect(v.bestShown).toEqual({ swell: true, wind: true, tide: true });
  });
  it('drops paragraphs and summary lines whose claim failed or has no result, and says which', () => {
    const v = viewOf(good(), { left: pass, 'best-swell': pass, 'best-wind': fail });
    expect(v.summary.map((p) => p.text)).toEqual(['A heavy left.', 'Mind the reef.']);
    expect(v.dropped.sort()).toEqual(['barrels', 'best-tide', 'best-wind']);
    expect(v.bestShown).toEqual({ swell: true, wind: false, tide: false });
  });
  it('hides a section all of whose paragraphs were dropped (Review Focus 5)', () => {
    const b = good(); b.details[0].paragraphs = [{ text: 'only claim', claim: 'barrels' }];
    const v = viewOf(b, { barrels: fail });
    expect(v.details.map((s) => s.id)).not.toContain('wave');
    expect(v.details.every((s) => s.paragraphs.length > 0)).toBe(true);
  });
});
