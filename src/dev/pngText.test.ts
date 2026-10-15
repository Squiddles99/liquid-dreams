import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MOMENT_PNG_KEY, insertPngText, readPngText } from './pngText';

/** A 1x1 PNG (IHDR, IDAT, IEND), as a canvas would encode it. */
const ONE_PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

describe('pngText (womb-realism Task 3b): the moment link inside the report PNG', () => {
  it('writes a tEXt chunk and reads it back; the rest of the file is untouched', () => {
    const link = 'http://localhost:5173/#m=eyJ2IjoxfQ';
    const out = insertPngText(ONE_PIXEL, MOMENT_PNG_KEY, link);
    expect(readPngText(out, MOMENT_PNG_KEY)).toBe(link);
    expect(out.length).toBe(ONE_PIXEL.length + 12 + MOMENT_PNG_KEY.length + 1 + link.length);
    // IHDR first, then the text, then the original IDAT + IEND byte for byte.
    expect(String.fromCharCode(...out.subarray(12, 16))).toBe('IHDR');
    expect(String.fromCharCode(...out.subarray(37, 41))).toBe('tEXt');
    expect(Array.from(out.subarray(out.length - (ONE_PIXEL.length - 33)))).toEqual(Array.from(ONE_PIXEL.subarray(33)));
  });
  it('the chunk CRC is the PNG standard’s (zlib’s crc32 over type + data)', () => {
    const out = insertPngText(ONE_PIXEL, 'k', 'v'), view = new DataView(out.buffer);
    const len = view.getUint32(33);
    expect(view.getUint32(33 + 8 + len)).toBe(crc32(out.subarray(37, 41 + len)));
  });
  it('no chunk, a different key, or not a PNG: null', () => {
    expect(readPngText(ONE_PIXEL, MOMENT_PNG_KEY)).toBeNull();
    expect(readPngText(insertPngText(ONE_PIXEL, 'other', 'x'), MOMENT_PNG_KEY)).toBeNull();
    expect(readPngText(new Uint8Array([1, 2, 3]), MOMENT_PNG_KEY)).toBeNull();
    expect(() => insertPngText(new Uint8Array(40), MOMENT_PNG_KEY, 'x')).toThrow();
  });
});
