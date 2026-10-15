/**
 * A PNG tEXt chunk writer and reader (womb-realism Task 3b): the report-moment hotkey writes the moment link into the frame
 * itself (key MOMENT_PNG_KEY), so the PNG alone replays the report when a browser drops the second download.
 * tools/_momentFromPng.mjs prints the link from a saved PNG.
 */

export const MOMENT_PNG_KEY = 'liquid-dreams-moment';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (ch) => {
  const c = ch.charCodeAt(0);
  if (c > 255) throw new Error(`pngText: '${ch}' is not Latin-1 (tEXt holds Latin-1 only)`);
  return c;
});

function isPng(png: Uint8Array): boolean {
  return png.length >= 33 && SIGNATURE.every((b, i) => png[i] === b);
}

/** `png` with a tEXt chunk `key`=`text` inserted after IHDR (the first chunk). Text is Latin-1 (a moment link is ASCII). */
export function insertPngText(png: Uint8Array, key: string, text: string): Uint8Array<ArrayBuffer> {
  if (!isPng(png)) throw new Error('pngText: not a PNG');
  const ihdrEnd = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8);
  const k = latin1(key), t = latin1(text), data = new Uint8Array(k.length + 1 + t.length);
  data.set(k, 0); data.set(t, k.length + 1);
  const chunk = new Uint8Array(12 + data.length), view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(latin1('tEXt'), 4); chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

/** The text of the first tEXt chunk keyed `key` in `png`, or null (no such chunk, or not a PNG). */
export function readPngText(png: Uint8Array, key: string): string | null {
  if (!isPng(png)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let o = 8; o + 12 <= png.length;) {
    const len = view.getUint32(o), type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (type === 'tEXt') {
      const data = png.subarray(o + 8, o + 8 + len), z = data.indexOf(0);
      if (z >= 0 && String.fromCharCode(...data.subarray(0, z)) === key) {
        let s = '';
        for (const b of data.subarray(z + 1)) s += String.fromCharCode(b);
        return s;
      }
    }
    if (type === 'IEND') break;
    o += 12 + len;
  }
  return null;
}
