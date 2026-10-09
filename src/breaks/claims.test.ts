// src/breaks/claims.test.ts
import { describe, expect, it } from 'vitest';
import claims from './womb.claims.json';
import raw from './womb.json';

describe('the Womb claims file', () => {
  it('has a result for every claim in womb.json (rerun npm run claims after editing claims)', () => {
    const ids = (raw as { claims: { id: string }[] }).claims.map((c) => c.id).sort();
    expect(Object.keys(claims).sort()).toEqual(ids);
  });
  it('never marks a check-less claim as passed', () => {
    for (const c of (raw as { claims: { id: string; check: string }[] }).claims)
      if (c.check === 'none') expect((claims as Record<string, { pass: boolean }>)[c.id].pass).toBe(false);
  });
});
