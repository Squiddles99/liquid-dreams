// Capture windows that never interrupt the person at the desk: shown without focus, off every monitor, out of the
// taskbar. Chromium keeps painting it (occlusion tracking and background throttling are switched off), so
// capturePage and rAF behave as in a fronted window. Set LD_SHOW_WINDOW=1 to see the window again.
import { BrowserWindow, app, screen } from 'electron';

// Importing this module (before app.whenReady) sets the switches that keep an unseen window rendering at full rate.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

/** A BrowserWindow like `new BrowserWindow(opts)`, but parked out of sight unless LD_SHOW_WINDOW=1. */
export function quietWindow(opts = {}) {
  if (process.env.LD_SHOW_WINDOW === '1') return new BrowserWindow({ ...opts, show: true });
  const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x));
  const win = new BrowserWindow({
    ...opts, show: false, skipTaskbar: true, x: left - (opts.width ?? 800) - 400, y: 0,
    webPreferences: { backgroundThrottling: false, ...(opts.webPreferences ?? {}) },
  });
  win.showInactive();
  return win;
}
