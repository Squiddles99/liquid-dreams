import { describe, expect, it } from 'vitest';
import { parseCards, parseSlides, pickSlide, slideImage } from './loadingSlides';

describe('loading slides', () => {
  it('reads the list from the cover attribute, ignoring blanks', () => {
    expect(parseSlides(' crew-wave  grasstree ')).toEqual(['crew-wave', 'grasstree']);
    expect(parseSlides('')).toEqual([]);
    expect(parseSlides(undefined)).toEqual([]);
  });

  it('picks by the random number across the whole list', () => {
    const list = ['a', 'b', 'c'];
    expect(pickSlide(list, 0)).toBe('a');
    expect(pickSlide(list, 0.5)).toBe('b');
    expect(pickSlide(list, 0.999)).toBe('c');
  });

  it('never shows the same picture twice in a row when there is another', () => {
    const list = ['a', 'b', 'c'];
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) expect(pickSlide(list, r, 'b')).not.toBe('b');
    expect(new Set([0, 0.5, 0.999].map((r) => pickSlide(list, r, 'b')))).toEqual(new Set(['a', 'c']));
  });

  it('keeps the only picture when there is just one, and has nothing to pick from an empty list', () => {
    expect(pickSlide(['a'], 0.7, 'a')).toBe('a');
    expect(pickSlide([], 0.7)).toBeNull();
  });

  it('names the 1080p and 4K copies the art script makes', () => {
    expect(slideImage('crew-wave')).toEqual({
      src: '/loading/crew-wave-1920.webp',
      srcset: '/loading/crew-wave-1920.webp 1920w, /loading/crew-wave-full.webp 3840w',
    });
  });
});

describe('the slides\' fact cards', () => {
  it('reads the cards, and none from missing or broken JSON', () => {
    expect(parseCards('{"flora-balga":{"kicker":"k","name":"Balga","common":"c","latin":"l","fact":"f"}}')['flora-balga'].name).toBe('Balga');
    expect(parseCards(null)).toEqual({});
    expect(parseCards('{oops')).toEqual({});
    expect(parseCards('[1]')).toEqual({});
  });
});
