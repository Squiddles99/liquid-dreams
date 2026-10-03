// One-click start for the Electron app ("Liquid Dreams.bat", or the desktop shortcut): rebuilds the game when anything
// it's built from is newer than the last build, then opens it in Electron and gets out of the way.
//
//   node electron/launch.mjs              build if stale, open the game
//   node electron/launch.mjs --shortcut   (re)make the desktop shortcut, with the logo as its icon
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BUILT = join(ROOT, 'dist', 'index.html');
/** What the build reads: a change to any of these means the build is stale. */
const SOURCES = ['src', 'public', 'music', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'];

/** The newest modification time (ms) under a file or folder; 0 if it isn't there. */
function newest(path) {
  if (!existsSync(path)) return 0;
  const s = statSync(path);
  if (!s.isDirectory()) return s.mtimeMs;
  let t = s.mtimeMs;
  for (const name of readdirSync(path)) t = Math.max(t, newest(join(path, name)));
  return t;
}

function makeShortcut() {
  const icon = join(ROOT, 'electron', 'icon.ico');
  const target = join(ROOT, 'Liquid Dreams.bat');
  const ps = [
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath("Desktop") + "\\Liquid Dreams.lnk")',
    `$s.TargetPath = "${target}"`,
    `$s.WorkingDirectory = "${ROOT}"`,
    '$s.WindowStyle = 7', // minimised: the build's console stays out of the way
    existsSync(icon) ? `$s.IconLocation = "${icon},0"` : '',
    '$s.Description = "Liquid Dreams"',
    '$s.Save()',
  ].filter(Boolean).join('; ');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  console.log(r.status === 0 ? 'Desktop shortcut "Liquid Dreams" made.' : 'Making the shortcut failed.');
  process.exit(r.status ?? 1);
}

if (process.argv.includes('--shortcut')) makeShortcut();

const built = existsSync(BUILT) ? statSync(BUILT).mtimeMs : 0;
const changed = Math.max(...SOURCES.map((p) => newest(join(ROOT, p))));
if (changed > built) {
  console.log(built ? 'The game has changed since the last build: building it (about a minute)...' : 'Building the game (about a minute)...');
  const r = spawnSync('npm run build', { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('\nThe build failed (see above), so the game would be out of date. Not starting it.');
    process.exit(1);
  }
} else console.log('The build is up to date.');

// Electron's own path, as its package exports it to Node.
const electron = createRequire(import.meta.url)('electron');
spawn(electron, ['.'], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
console.log('Starting Liquid Dreams.');
