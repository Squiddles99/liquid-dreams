/**
 * The gang mockup's card (walking spec §6): the in-game frame with the crew's names painted over it, surf-wax style,
 * hand-painted and sun-faded. Faces: Knewave (SIL OFL) for the nicknames and Caveat Brush (SIL OFL) for the real names,
 * from Google Fonts, so the same look can carry into the select screen (step 4). Dev only: the capture script uses it.
 */

export interface NameAnchor {
  /** Above the head, on screen (px). */
  x: number;
  y: number;
  nickname: string;
  realName: string;
}
export interface PlacedName {
  /** The nickname's centre (px). */
  x: number;
  y: number;
  angleDeg: number;
  nickSize: number;
  realSize: number;
  box: { x0: number; y0: number; x1: number; y1: number };
}

/** The nickname's and the real name's sizes, as fractions of the frame's height. */
export const NICK_SIZE = 0.075;
export const REAL_SIZE = 0.033;
const MARGIN = 0.04;
/** Text widths per character, as fractions of the size (Knewave is wide; Caveat Brush narrow). */
const NICK_W = 0.66, REAL_W = 0.42;
const GAP = 0.012;

/**
 * Where each name goes: centred above its head (the box's bottom at the anchor), kept inside the frame's 4% margin,
 * pushed apart sideways so no two overlap; each nickname tilted a little, alternately, like signs painted by hand.
 */
export function nameLayout(anchors: readonly NameAnchor[], w: number, h: number): PlacedName[] {
  const nick = NICK_SIZE * h, real = REAL_SIZE * h, gap = GAP * w;
  const out = anchors.map((a, i) => {
    const bw = Math.max(a.nickname.length * NICK_W * nick, a.realName.length * REAL_W * real), bh = nick + 1.15 * real;
    return { a, i, bw, bh, cx: a.x, top: a.y - bh };
  });
  const clampX = (b: (typeof out)[number]): void => {
    b.cx = Math.min(w * (1 - MARGIN) - b.bw / 2, Math.max(w * MARGIN + b.bw / 2, b.cx));
  };
  const sorted = [...out].sort((p, q) => p.cx - q.cx);
  for (let it = 0; it < 50; it++) {
    let moved = false;
    sorted.forEach(clampX);
    for (let k = 1; k < sorted.length; k++) {
      const p = sorted[k - 1], q = sorted[k], need = (p.bw + q.bw) / 2 + gap - (q.cx - p.cx);
      if (need > 1e-6) {
        p.cx -= need / 2;
        q.cx += need / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out.map((b) => {
    clampX(b);
    const top = Math.max(h * MARGIN, b.top);
    return {
      x: b.cx,
      y: top + nick / 2,
      angleDeg: b.i % 2 === 0 ? -3 : 2.5,
      nickSize: nick,
      realSize: real,
      box: { x0: b.cx - b.bw / 2, y0: top, x1: b.cx + b.bw / 2, y1: top + b.bh },
    };
  });
}

const CREAM = '#f6e9c9', TEAL = '#1d6b74', SUNSET = '#e9782d', INK = '#2a2622';

let fonts: Promise<void> | null = null;
/** Knewave and Caveat Brush from Google Fonts (both SIL OFL), loaded once. */
export function loadGangFonts(): Promise<void> {
  fonts ??= (async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Knewave&family=Caveat+Brush&display=block';
    document.head.appendChild(link);
    await new Promise((r) => link.addEventListener('load', r, { once: true }));
    await Promise.all([document.fonts.load('80px Knewave'), document.fonts.load('40px "Caveat Brush"')]);
  })();
  return fonts;
}

/** One name painted on its own canvas: the nickname with a teal drop and a sunset edge, worn by a speckle knock-out
 * (sun-faded surf-wax paint), the real name small in brush underneath. */
function paintName(n: PlacedName, a: NameAnchor, seed: number): HTMLCanvasElement {
  const pad = n.nickSize * 0.6;
  const c = document.createElement('canvas');
  c.width = Math.ceil(n.box.x1 - n.box.x0 + 2 * pad);
  c.height = Math.ceil(n.box.y1 - n.box.y0 + 2 * pad);
  const g = c.getContext('2d')!;
  const cx = c.width / 2, ny = pad + n.nickSize * 0.5;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${n.nickSize}px Knewave`;
  g.lineJoin = 'round';
  const off = n.nickSize * 0.06;
  g.fillStyle = TEAL;
  g.fillText(a.nickname, cx + off, ny + off);
  g.strokeStyle = SUNSET;
  g.lineWidth = n.nickSize * 0.07;
  g.strokeText(a.nickname, cx, ny);
  g.fillStyle = CREAM;
  g.fillText(a.nickname, cx, ny);
  // Worn paint: small irregular flecks knocked out of the lettering (a seeded hash, so a re-capture matches).
  g.globalCompositeOperation = 'destination-out';
  let s = seed * 9301 + 49297;
  const rand = (): number => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < (c.width * c.height) / 260; k++) {
    g.globalAlpha = 0.35 + 0.65 * rand();
    g.beginPath();
    g.ellipse(rand() * c.width, rand() * c.height, 0.6 + 2.2 * rand(), 0.4 + 1.2 * rand(), rand() * Math.PI, 0, 2 * Math.PI);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.font = `${n.realSize}px "Caveat Brush"`;
  g.fillStyle = INK;
  const ry = ny + n.nickSize * 0.62 + n.realSize * 0.55;
  g.fillText(a.realName, cx + n.realSize * 0.05, ry + n.realSize * 0.05);
  g.fillStyle = CREAM;
  g.fillText(a.realName, cx, ry);
  return c;
}

/** The card: the frame, then each name painted over it, tilted. */
export async function drawGangCard(frame: CanvasImageSource, w: number, h: number, anchors: readonly NameAnchor[]): Promise<HTMLCanvasElement> {
  await loadGangFonts();
  const card = document.createElement('canvas');
  card.width = w;
  card.height = h;
  const g = card.getContext('2d')!;
  g.drawImage(frame, 0, 0, w, h);
  nameLayout(anchors, w, h).forEach((n, i) => {
    const name = paintName(n, anchors[i], i + 1);
    g.save();
    g.translate((n.box.x0 + n.box.x1) / 2, (n.box.y0 + n.box.y1) / 2);
    g.rotate((n.angleDeg * Math.PI) / 180);
    g.drawImage(name, -name.width / 2, -name.height / 2);
    g.restore();
  });
  return card;
}
