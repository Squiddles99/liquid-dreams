// Builds the heath kit (spec 2026-10-02-dune-up-close-design.md §3.1). Run from the repo root:
//   npm run build:heath                 the kit and its atlas → public/heath/, previews → tools/heath/previews/
//   npm run build:heath -- --only daisy one kind (the others kept from the last build)
//   npm run build:heath -- --ground     the ground layers only (numpy, no Blender)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runnerImport } from 'vite';

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

const tools = resolve('tools/heath'), out = resolve('public/heath'), previews = join(tools, 'previews');
mkdirSync(out, { recursive: true });
mkdirSync(previews, { recursive: true });

function py(script: string, args: string[]): void {
  const r = spawnSync(process.env.PYTHON ?? 'python', [join(tools, script), ...args], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${script} failed (${r.status ?? r.signal}); it needs Python 3 with numpy and Pillow (set PYTHON to it).`);
    process.exit(1);
  }
}

if (process.argv.includes('--ground')) {
  py('ground_layers.py', [out]);
} else {
  // Today's hulls are the crowns' envelopes (spec §4.2 step 1): exported so Blender grows each variant inside its own.
  const { module: plants } = await runnerImport<typeof import('../../src/heath/plants')>('/src/heath/plants.ts');
  const hulls: Record<string, { positions: number[]; indices: number[] }> = {};
  for (const kind of plants.PLANT_KINDS) {
    for (let v = 0; v < plants.PLANT_SHAPES; v++) {
      const g = plants.plantShapeGeometry(kind, v, 0);
      hulls[`${kind}_${v}`] = { positions: [...g.positions], indices: [...g.indices] };
    }
  }
  const hullFile = join(previews, 'hulls.json');
  writeFileSync(hullFile, JSON.stringify({ specs: plants.PLANT_SPECS, hulls }));
  const onlyAt = process.argv.indexOf('--only');
  const args = [hullFile, out, previews, ...(onlyAt > 0 ? ['--only', process.argv[onlyAt + 1]] : [])];
  // --factory-startup: the kit needs no extension (the surfers need MPFB; this doesn't).
  const r = spawnSync(findBlender(), ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(tools, 'build.py'), '--', ...args], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Blender failed (${r.status ?? r.signal}) building the heath kit.`);
    process.exit(1);
  }
}
