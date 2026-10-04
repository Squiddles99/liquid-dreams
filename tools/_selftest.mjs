// Scratch: runs the in-app GPU self-tests (?selftest=<filter>) in Electron on the RTX and prints the report.
// npx electron tools/_selftest.mjs [--base=http://localhost:5189/] [--filter=breaker]
import { app, BrowserWindow } from 'electron';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5189/', filter = arg('filter') ?? 'breaker';
app.commandLine.appendSwitch('force_high_performance_gpu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: true });
  await win.loadURL(`${base}?frontend=off&selftest=${encodeURIComponent(filter)}`);
  for (let i = 0; i < 600; i++) {
    const text = await win.webContents.executeJavaScript('document.body.innerText');
    if (/GPU self-tests: \d+\/\d+ passed/.test(text)) { console.log(text.slice(text.indexOf('GPU self-tests'))); break; }
    await sleep(1000);
  }
  app.quit();
});
