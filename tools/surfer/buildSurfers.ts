// Builds the surfers (spec 2026-09-30-surfer-on-the-stand-design.md §3.1). Run from the repo root:
//   npm run build:surfers              both surfers → public/surfer/, previews → tools/surfer/previews/
//   npm run build:surfers -- --probe   what this Blender + MPFB offers → tools/surfer/api-probe.txt
//   npm run build:surfers -- --only male
//   npm run build:surfers -- --pile      the beach pile only, from the built riders
//   npm run build:clips              the motion clips → public/surfer/clips/ (clip slice spec §3.3)
//   npm run build:surfers -- --atlas     the hair strand atlas only (public/surfer/hairAtlas.*; dune select spec §13.2)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const version = (d: string): number => {
  const [a, b] = d.replace('Blender ', '').split('.').map(Number);
  return a * 1000 + b;
};

function findBlender(): string {
  const env = process.env.BLENDER_PATH;
  if (env) {
    if (existsSync(env)) return env;
    throw new Error(`BLENDER_PATH is ${env}, which doesn't exist.`);
  }
  const root = 'C:/Program Files/Blender Foundation';
  if (existsSync(root)) {
    for (const d of readdirSync(root).filter((x) => /^Blender \d+\.\d+$/.test(x)).sort((a, b) => version(b) - version(a))) {
      const exe = join(root, d, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('Blender was not found. Install it (tools/surfer/README.md) or set BLENDER_PATH to blender.exe.');
}

function run(blender: string, script: string, args: string[]): void {
  // No --factory-startup: the user preferences are what enable the MPFB extension.
  const r = spawnSync(blender, ['--background', '--python-exit-code', '1', '--python', script, '--', ...args], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Blender failed (${r.status ?? r.signal}) running ${script}.`);
    process.exit(1);
  }
}

const tools = resolve('tools/surfer');

/** The hair strand atlas: plain Python (numpy, Pillow), no Blender. The riders' cards map into its tile table. */
function bakeAtlas(): void {
  const r = spawnSync(process.env.PYTHON ?? 'python', [join(tools, 'hair_atlas.py'), resolve('public/surfer')], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`The hair atlas bake failed (${r.status ?? r.signal}). It needs Python 3 with numpy and Pillow (set PYTHON to it).`);
    process.exit(1);
  }
}

const blender = findBlender();
if (process.argv.includes('--clips')) {
  // The licensed source clips live outside git (spec §3.2): anim-source/ here, or LD_ANIM_SOURCE (a worktree points at main's).
  const source = process.env.LD_ANIM_SOURCE ?? resolve('anim-source');
  mkdirSync(resolve('public/surfer/clips'), { recursive: true });
  mkdirSync(join(tools, 'previews', 'clips'), { recursive: true });
  run(blender, join(tools, 'clips.py'), [join(tools, 'clips.json'), source, resolve('public/surfer'), join(tools, 'previews', 'clips')]);
  process.exit(0);
}

if (process.argv.includes('--atlas')) {
  bakeAtlas();
} else if (process.argv.includes('--probe')) {
  run(blender, join(tools, 'probe_api.py'), [join(tools, 'api-probe.txt')]);
} else {
  const onlyAt = process.argv.indexOf('--only');
  const names = onlyAt > 0 ? [process.argv[onlyAt + 1]] : ['female', 'male', 'grommet'];
  mkdirSync(resolve('public/surfer'), { recursive: true });
  mkdirSync(join(tools, 'previews'), { recursive: true });
  const pileOnly = process.argv.includes('--pile');
  if (!pileOnly) bakeAtlas(); // first: hair.py maps the cards into its tiles
  if (!pileOnly) for (const name of names) run(blender, join(tools, 'build.py'), [join(tools, 'presets', `${name}.json`), resolve('public/surfer'), join(tools, 'previews')]);
  // The beach pile (walking spec §5) is made from the three riders' glbs: after a full build, or alone with --pile.
  if (pileOnly || onlyAt < 0) run(blender, join(tools, 'pile.py'), [resolve('public/surfer'), resolve('public/surfer/beachPile.glb'), join(tools, 'previews')]);
}
