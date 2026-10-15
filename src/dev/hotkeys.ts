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

type LdSave = (filename: string, bytes: Uint8Array) => Promise<string>;

/**
 * Saves a blob. In the Electron app (preload.cjs gives window.ldSave) it is written straight to Pictures\Liquid Dreams and
 * the full path is returned; in the browser it is a download (the downloads folder) and the result is the filename.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<string> {
  const ldSave = (window as unknown as { ldSave?: LdSave }).ldSave;
  if (ldSave) {
    try {
      return await ldSave(filename, new Uint8Array(await blob.arrayBuffer()));
    } catch (err) {
      console.warn(`ldSave failed for ${filename}, falling back to a download`, err);
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return filename;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function screenshotFilename(c: Pick<Conditions, 'date' | 'timeOfDay'>): string {
  const total = Math.round(c.timeOfDay * 60);
  return `liquid-dreams-${c.date}-${pad(Math.floor(total / 60) % 24)}${pad(total % 60)}.png`;
}

/** Call immediately after rendering, in the same task, so the WebGPU canvas still holds the frame. */
export function captureScreenshot(canvas: HTMLCanvasElement, filename: string, onSaved?: (where: string) => void): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    void downloadBlob(blob, filename).then((where) => onSaved?.(where));
  }, 'image/png');
}
