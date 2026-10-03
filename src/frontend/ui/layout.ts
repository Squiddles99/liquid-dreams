import './frontEnd.css';
import type { FrontSettings } from '../frontSettings';
import { safeAreaFraction } from '../frontSettings';

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

/** The UI's canvas in design pixels: everything is laid out at 1080p and scaled to the window (spec §5.1). */
export interface UiLayout {
  scale: number;
  designW: number;
  designH: number;
  /** The safe-area insets (design px). */
  safeX: number;
  safeY: number;
}

/**
 * Scales by min(width/1920, height/1080): on a wider window the extra width is margin (the layout anchors to the safe
 * area's edges), and on a narrow one the whole 1920-wide design still fits, with room to spare below (the plan's
 * ruling: the spec only describes wider windows).
 */
export function layoutFor(windowW: number, windowH: number, safeFraction: number): UiLayout {
  const scale = Math.min(windowW / DESIGN_W, windowH / DESIGN_H);
  const designW = windowW / scale, designH = windowH / scale;
  return { scale, designW, designH, safeX: designW * safeFraction, safeY: designH * safeFraction };
}

export function insideSafe(b: { x: number; y: number; w: number; h: number }, l: UiLayout): boolean {
  const eps = 1e-6;
  return b.x >= l.safeX - eps && b.y >= l.safeY - eps && b.x + b.w <= l.designW - l.safeX + eps && b.y + b.h <= l.designH - l.safeY + eps;
}

/** The front end's root, full-window over the canvas. The stylesheet comes with it. */
export function mountFrontEndRoot(parent: HTMLElement): HTMLElement {
  const root = document.createElement('div');
  root.className = 'fe-root';
  parent.appendChild(root);
  return root;
}

export function applyLayout(root: HTMLElement, l: UiLayout, s: FrontSettings): void {
  Object.assign(root.style, { width: `${l.designW}px`, height: `${l.designH}px`, transform: `scale(${l.scale})` });
  root.style.setProperty('--fe-safe-x', `${l.safeX}px`);
  root.style.setProperty('--fe-safe-y', `${l.safeY}px`);
  root.style.setProperty('--fe-text', String(s.textScale));
  root.classList.toggle('is-opaque', s.opaqueBackplates);
  root.classList.toggle('is-calm', s.calmMenus);
}

export { safeAreaFraction };
