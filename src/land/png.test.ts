import { describe, expect, it } from 'vitest';
import { decodePng, terrariumHeight } from './png';

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out; // CRC left zero: the decoder doesn't check it
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A test encoder: row y uses filters[y % filters.length] (the forward filters, from the unfiltered neighbours). */
async function encodePng(w: number, h: number, channels: 3 | 4, px: Uint8Array, filters: number[], depth = 8): Promise<Uint8Array> {
  const stride = w * channels, raw = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const f = filters[y % filters.length];
    raw[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const v = px[y * stride + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      raw[y * (stride + 1) + 1 + x] = (v - pred) & 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w); iv.setUint32(4, h);
  ihdr[8] = depth; ihdr[9] = channels === 3 ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const pixels = (n: number, seed: number): Uint8Array => {
  const a = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; a[i] = s >>> 24; }
  return a;
};

describe('decodePng', () => {
  it('decodes 8-bit RGB through every filter type', async () => {
    const px = pixels(7 * 5 * 3, 1);
    const png = await encodePng(7, 5, 3, px, [0, 1, 2, 3, 4]);
    const d = await decodePng(png);
    expect([d.width, d.height]).toEqual([7, 5]);
    for (let i = 0; i < 35; i++) {
      expect([d.rgba[i * 4], d.rgba[i * 4 + 1], d.rgba[i * 4 + 2], d.rgba[i * 4 + 3]]).toEqual([px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255]);
    }
  });
  it('decodes 8-bit RGBA', async () => {
    const px = pixels(4 * 3 * 4, 2);
    const d = await decodePng(await encodePng(4, 3, 4, px, [4, 3, 1]));
    expect(Array.from(d.rgba)).toEqual(Array.from(px));
  });
  it('rejects what the tiles never use (16-bit) and non-PNGs', async () => {
    await expect(decodePng(await encodePng(2, 2, 3, pixels(12, 3), [0], 16))).rejects.toThrow(/unsupported/);
    await expect(decodePng(new Uint8Array(16))).rejects.toThrow(/not a PNG/);
  });
});

describe('terrariumHeight', () => {
  it('is R·256 + G + B/256 − 32768', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(127, 255, 128)).toBe(-0.5);
    expect(terrariumHeight(128, 100, 64)).toBe(100.25);
  });
});
