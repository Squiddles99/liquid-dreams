import { describe, expect, it, vi } from 'vitest';
import { handleHotkeys, screenshotFilename } from './hotkeys';

describe('handleHotkeys', () => {
  it('fires each action once per press', () => {
    const pressed = new Set(['KeyP', 'KeyL']);
    const input = { consumePressed: (code: string) => pressed.delete(code) };
    const h = { copyLink: vi.fn(), togglePause: vi.fn(), screenshot: vi.fn(), toggleDevUi: vi.fn(), callSet: vi.fn(), toggleMute: vi.fn() };
    handleHotkeys(input, h);
    handleHotkeys(input, h);
    expect(h.togglePause).toHaveBeenCalledTimes(1);
    expect(h.copyLink).toHaveBeenCalledTimes(1);
    expect(h.screenshot).not.toHaveBeenCalled();
    expect(h.toggleDevUi).not.toHaveBeenCalled();
    expect(h.callSet).not.toHaveBeenCalled();
  });
  it('N calls a set', () => {
    const pressed = new Set(['KeyN']);
    const input = { consumePressed: (code: string) => pressed.delete(code) };
    const h = { copyLink: vi.fn(), togglePause: vi.fn(), screenshot: vi.fn(), toggleDevUi: vi.fn(), callSet: vi.fn(), toggleMute: vi.fn() };
    handleHotkeys(input, h);
    expect(h.callSet).toHaveBeenCalledTimes(1);
    expect(h.togglePause).not.toHaveBeenCalled();
  });
  it('M toggles the mute', () => {
    const pressed = new Set(['KeyM']);
    const input = { consumePressed: (code: string) => pressed.delete(code) };
    const h = { copyLink: vi.fn(), togglePause: vi.fn(), screenshot: vi.fn(), toggleDevUi: vi.fn(), callSet: vi.fn(), toggleMute: vi.fn() };
    handleHotkeys(input, h);
    expect(h.toggleMute).toHaveBeenCalledTimes(1);
    expect(h.togglePause).not.toHaveBeenCalled();
  });
});

describe('screenshotFilename', () => {
  it('names files by date and local time', () => {
    expect(screenshotFilename({ date: '2026-07-15', timeOfDay: 8.25 })).toBe('liquid-dreams-2026-07-15-0815.png');
    expect(screenshotFilename({ date: '2026-07-15', timeOfDay: 16 + 50 / 60 })).toBe('liquid-dreams-2026-07-15-1650.png');
    expect(screenshotFilename({ date: '2026-04-20', timeOfDay: 23.999 })).toBe('liquid-dreams-2026-04-20-0000.png');
  });
});
