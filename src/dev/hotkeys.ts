import type { Conditions } from '../conditions/types';

export const HOTKEYS = { copyLink: 'KeyL', togglePause: 'KeyP', screenshot: 'KeyK', toggleDevUi: 'KeyH', callSet: 'KeyN', toggleMute: 'KeyM', reportMoment: 'Ctrl+Shift+KeyM' } as const;

export interface HotkeyHandlers {
  copyLink(): void;
  togglePause(): void;
  screenshot(): void;
  toggleDevUi(): void;
  callSet(): void;
  toggleMute(): void;
  /** Ctrl+Shift+M: saves the frame and its moment link together (womb-realism Task 0). */
  reportMoment(): void;
}

export function handleHotkeys(input: { consumePressed(code: string): boolean }, h: HotkeyHandlers): void {
  for (const [action, code] of Object.entries(HOTKEYS) as Array<[keyof HotkeyHandlers, string]>) {
    if (input.consumePressed(code)) h[action]();
  }
}

/** The report-moment pair's names: the picture and its link share the unix second they were taken. */
export function reportMomentFilenames(nowMs: number): { png: string; txt: string } {
  const s = Math.floor(nowMs / 1000);
  return { png: `ld-moment-${s}.png`, txt: `ld-moment-${s}.txt` };
}

/** Saves a blob as a download (the browser's downloads folder). */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function screenshotFilename(c: Pick<Conditions, 'date' | 'timeOfDay'>): string {
  const total = Math.round(c.timeOfDay * 60);
  return `liquid-dreams-${c.date}-${pad(Math.floor(total / 60) % 24)}${pad(total % 60)}.png`;
}

/** Call immediately after rendering, in the same task, so the WebGPU canvas still holds the frame. */
export function captureScreenshot(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}
