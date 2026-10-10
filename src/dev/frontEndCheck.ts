// src/dev/frontEndCheck.ts: the checks that need the live scene behind the UI (spec §15; the plan's ruling).
import type { App } from '../app/App';

/** Relative luminance (WCAG) of an sRGB colour, 0–255 channels. */
const lum = (r: number, g: number, b: number): number => {
  const f = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** In the shown beat: its wrapper's target opacity (a hidden window never finishes the fades). */
const shown = (e: Element): boolean => (e.closest('.fe-root > [style*="opacity"]') as HTMLElement | null)?.style.opacity !== '0';

/**
 * For each beat:
 * - contrast: each text box against the brightest 5% of the scene behind it (the scene captured with the UI hidden,
 *   the scrims' gradient composited);
 * - faces: nothing between the camera and the focused rider's head (a ray to the head bone).
 */
export async function frontEndCheck(app: App): Promise<{ contrast: { beat: string; text: string; ratio: number; need: number }[]; faces: { beat: string; rider: string; covered: string | null }[]; pass: boolean }> {
  const contrast: { beat: string; text: string; ratio: number; need: number }[] = [], faces: { beat: string; rider: string; covered: string | null }[] = [];
  for (const beat of ['map', 'conditions', 'rider', 'gear'] as const) {
    await app.frontEndGoTo(beat);
    const root = document.querySelector('.fe-root') as HTMLElement;
    root.style.visibility = 'hidden';
    const frame = await app.captureFrame();
    root.style.visibility = '';
    if (!frame) throw new Error('frontEndCheck: captureFrame returned nothing');
    const img = await createImageBitmap(frame), canvas = new OffscreenCanvas(img.width, img.height), cx = canvas.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    const sx = img.width / window.innerWidth, sy = img.height / window.innerHeight;
    for (const el of root.querySelectorAll('.fe-value, .fe-label, .fe-line, .fe-title, .fe-legend span')) {
      if (!el.textContent?.trim() || el.closest('.is-focus') || !shown(el)) continue;
      const r = el.getBoundingClientRect(), d = cx.getImageData(r.left * sx, r.top * sy, Math.max(1, r.width * sx), Math.max(1, r.height * sy)).data;
      const ls: number[] = [];
      // The scrim behind the text: read its painted alpha at the box's centre from the scrim element's gradient.
      const scrim = scrimAlphaAt(root, r.left + r.width / 2, r.top + r.height / 2);
      for (let i = 0; i < d.length; i += 4) ls.push(lum(d[i] * (1 - scrim) + 16 * scrim, d[i + 1] * (1 - scrim) + 23 * scrim, d[i + 2] * (1 - scrim) + 26 * scrim));
      ls.sort((a, b) => b - a);
      const bright = ls[Math.floor(ls.length * 0.05)] ?? 0, c = getComputedStyle(el).color.match(/\d+/g)!.map(Number);
      const large = parseFloat(getComputedStyle(el).fontSize) >= 24 * (root.getBoundingClientRect().width / root.offsetWidth);
      contrast.push({ beat, text: el.textContent.slice(0, 24), ratio: ratio(lum(c[0], c[1], c[2]), bright), need: large ? 3 : 4.5 });
    }
    const hit = app.frontEndFaceRay();
    faces.push({ beat, rider: hit.rider, covered: hit.covered });
  }
  return { contrast, faces, pass: contrast.every((c) => c.ratio >= c.need) && faces.every((f) => f.covered === null) };
}

/** The darkness of the left, right and bottom scrims at a window point (their linear 0.82 → 0 gradients over 48%). */
function scrimAlphaAt(root: HTMLElement, x: number, y: number): number {
  let a = 0;
  for (const el of root.querySelectorAll('.fe-scrim-left, .fe-scrim-right, .fe-scrim-bottom')) {
    const r = el.getBoundingClientRect();
    if (!shown(el) || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const t = el.classList.contains('fe-scrim-left') ? (x - r.left) / r.width : el.classList.contains('fe-scrim-right') ? (r.right - x) / r.width : (r.bottom - y) / r.height;
    const peak = el.classList.contains('fe-scrim-bottom') ? 0.7 : 0.82;
    a = 1 - (1 - a) * (1 - peak * (1 - t));
  }
  // The slide panel's plate: at least 0.9 dark right of its raked edge (110 design px at the top, 0 at the bottom).
  for (const el of root.querySelectorAll('.fe-plate')) {
    const r = el.getBoundingClientRect(), k = r.width / 900;
    if (!shown(el) || y < r.top || y > r.bottom || x > r.right || x < r.left + 110 * k * (1 - (y - r.top) / r.height)) continue;
    a = 1 - (1 - a) * (1 - 0.9);
  }
  return a;
}
