// The clip bake (clip slice Task 8): `npm run build:clips`. Our TypeScript imports have no extensions, which Node can't
// run directly, so the bake is a vitest file switched on by BAKE_CLIPS=1. Set LD_ANIM_SOURCE to read sources elsewhere.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['vitest', 'run', 'src/surfer/cmuBake.test.ts', '--silent=false'], { stdio: 'inherit', shell: true, env: { ...process.env, BAKE_CLIPS: '1' } });
process.exit(r.status ?? 1);
