import * as THREE from 'three/webgpu';

/**
 * The dune up close's GPU budget (dune-up-close spec §5), measured in the running game: at the select screen's beat
 * cameras in the clearing and at three points down the beach path, 1080p, each part's cost is the median frame with
 * everything drawn less the median with that part hidden. Run from the console:
 *
 *   const { measureDuneBudget } = await import('/src/dev/duneBudget.ts'); await measureDuneBudget(window.liquidDreams)
 *
 * (A self-test can't: it needs the land, the tracks and every part, as the game has them.)
 */

/** §5's caps (ms of GPU), by part. */
export const DUNE_BUDGET_MS = { plants: 1.0, patch: 0.5, scatter: 0.4, footprints: 0.1, total: 2.0 } as const;

type Part = keyof typeof DUNE_BUDGET_MS;

/** What the harness needs of App (window.liquidDreams in dev). */
export interface BudgetApp {
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  conditions: { timeOfDay: number; tideM: number };
  rig: { setPose(p: { mode: 'free'; position: [number, number, number]; yawDeg: number; pitchDeg: number }, tideM: number): void };
  land: { height: { heightAt(x: number, z: number): number; trackNetwork: { standSpot(): { x: number; z: number; headingDeg: number }; data: { pieces: { points: [number, number][] }[] } } } | null };
  plants: { meshes: THREE.Mesh[] };
  kitMeshes: { meshes: THREE.Mesh[] } | null;
  scatter: { meshes: THREE.Mesh[] } | null;
  patch: { mesh: THREE.Mesh };
  footprints: { mesh: THREE.Mesh };
  plantQueue: { length: number };
  renderInto(target: THREE.RenderTarget): void;
}

interface Pose {
  name: string;
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
}

/** The rig's yaw (0 looks toward −z, 90 toward +x) and pitch from `from` to `to`. */
function aim(from: [number, number, number], to: [number, number, number]): { yawDeg: number; pitchDeg: number } {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yawDeg: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360, pitchDeg: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI };
}

/** The select screen's three beats at the stand spot, and three points down the beach path, each looking down it. */
export function budgetPoses(app: BudgetApp): Pose[] {
  const lh = app.land.height!;
  const s = lh.trackNetwork.standSpot();
  const g = (x: number, z: number) => lh.heightAt(x, z);
  const h = (s.headingDeg * Math.PI) / 180;
  // The riders face the heading; the lineup is behind them, seaward.
  const fx = Math.sin(h), fz = -Math.cos(h);
  const at = (d: number, offDeg: number, up: number): [number, number, number] => {
    const a = h + (offDeg * Math.PI) / 180;
    const x = s.x + Math.sin(a) * d, z = s.z - Math.cos(a) * d;
    return [x, g(x, z) + up, z];
  };
  const centre: [number, number, number] = [s.x, g(s.x, s.z), s.z];
  const conditions: [number, number, number] = [s.x + fx * 3.8, g(s.x + fx * 3.8, s.z + fz * 3.8) + 2.3, s.z + fz * 3.8];
  const lineup: [number, number, number] = [s.x - fx * 200, 0, s.z - fz * 200];
  const rider = at(2.35, 18, 0.95), board = at(2.1, 30, 1.35);
  const chest: [number, number, number] = [centre[0], centre[1] + 1.2, centre[2]];
  const knees: [number, number, number] = [centre[0], centre[1] + 0.6, centre[2]];
  const poses: Pose[] = [
    { name: 'conditions', position: conditions, ...aim(conditions, lineup) },
    { name: 'rider', position: rider, ...aim(rider, chest) },
    { name: 'board', position: board, ...aim(board, knees) },
  ];
  // Down the beach path (piece 1): the gully, the foredune and the beach, at eye height, looking along it.
  const path = lh.trackNetwork.data.pieces[1]?.points ?? [];
  for (const [name, f] of [['gully', 0.45], ['foredune', 0.75], ['beach', 0.97]] as const) {
    if (path.length < 8) break;
    const i = Math.min(path.length - 7, Math.floor(path.length * f)), a = path[i], b = path[i + 6];
    const eye: [number, number, number] = [a[0], g(a[0], a[1]) + 1.6, a[1]];
    poses.push({ name, position: eye, ...aim(eye, [b[0], g(b[0], b[1]) + 0.8, b[1]]) });
  }
  return poses;
}

function median(v: number[]): number {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * `n` frames rendered back to back into `target` (the GPU kept busy, so its clocks stay up), then each frame's GPU time
 * (ms): the sum of its own passes, by the frame number three tags them with (its resolve alone returns whichever frame
 * it resolved last). Batches stay under the query pool's 2,048 slots (about 28 a frame).
 */
async function batchMs(app: BudgetApp, target: THREE.RenderTarget, n: number): Promise<number[]> {
  const info = app.renderer.info as unknown as { frame: number };
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    app.renderInto(target);
    ids.push(info.frame);
  }
  await app.renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER);
  const pool = (app.renderer.backend as unknown as { timestampQueryPool: { render: { timestamps: Map<string, number> } } }).timestampQueryPool.render;
  const byFrame = new Map<number, number>();
  for (const [k, v] of pool.timestamps) {
    const f = Number(k.slice(k.lastIndexOf(':f') + 2));
    byFrame.set(f, (byFrame.get(f) ?? 0) + v);
  }
  return ids.map((id) => byFrame.get(id) ?? NaN);
}

/** The materials of `meshes` (hidden by their materials: App re-shows the meshes each frame, never their materials). */
function materialsOf(meshes: THREE.Mesh[]): THREE.Material[] {
  const mats = new Set<THREE.Material>();
  for (const m of meshes) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
  return [...mats];
}

export interface BudgetRow {
  pose: string;
  frameMs: number;
  parts: Record<Exclude<Part, 'total'>, number>;
  total: number;
  extra: string;
}

/** Frames per batch (rounds × BATCH frames per configuration are timed). */
const BATCH = 8;

/** Measures every pose at 1080p, `frames` rounds of BATCH frames per configuration after `warm` rounds; returns the rows and a one-line-per-pose report (each part against its cap). */
export async function measureDuneBudget(app: BudgetApp, frames = 8, warm = 2, detail = false): Promise<{ rows: BudgetRow[]; report: string; pass: boolean }> {
  const r = app.renderer, cam = app.camera;
  const size = r.getSize(new THREE.Vector2()), ratio = r.getPixelRatio(), aspect = cam.aspect;
  r.setPixelRatio(1);
  r.setSize(1920, 1080, false);
  cam.aspect = 1920 / 1080;
  cam.updateProjectionMatrix();
  const target = new THREE.RenderTarget(1920, 1080, { type: THREE.UnsignedByteType, depthBuffer: false });
  const rows: BudgetRow[] = [];
  // The game's own loop paused while timing (its frames would share the GPU and the timestamp pool).
  const loop = (app as unknown as { frame: () => void }).frame;
  r.setAnimationLoop(null);
  try {
    for (const pose of budgetPoses(app)) {
      app.rig.setPose({ mode: 'free', position: pose.position, yawDeg: pose.yawDeg, pitchDeg: pose.pitchDeg }, app.conditions.tideM);
      // Let the plants lay around the new spot before timing.
      for (let i = 0; i < 80 && (i < 8 || app.plantQueue.length > 0); i++) app.renderInto(target);
      const parts: Record<Exclude<Part, 'total'>, THREE.Mesh[]> = {
        plants: [...app.plants.meshes, ...(app.kitMeshes?.meshes ?? [])],
        patch: [app.patch.mesh],
        scatter: app.scatter?.meshes ?? [],
        footprints: [app.footprints.mesh],
      };
      // Optional detail: the plants by level (L0, L1, the hulls), in `extra`.
      const split: Record<string, THREE.Mesh[]> = detail
        ? { L0: (app.kitMeshes?.meshes ?? []).filter((m) => m.name.endsWith('_L0')), L1: (app.kitMeshes?.meshes ?? []).filter((m) => m.name.endsWith('_L1')), hulls: app.plants.meshes }
        : {};
      // Round robin, a batch of each configuration in turn (everything, then each part hidden), so the GPU's clocks
      // drift alike for all; the first `warm` rounds unmeasured.
      const configs: (THREE.Material[] | null)[] = [null, ...Object.values(parts).map(materialsOf), ...Object.values(split).map(materialsOf)];
      const times = configs.map(() => [] as number[]);
      for (let round = 0; round < warm + frames; round++) {
        for (const [c, mats] of configs.entries()) {
          for (const m of mats ?? []) m.visible = false;
          try {
            const ms = await batchMs(app, target, BATCH);
            if (round >= warm) times[c].push(...ms);
          } finally {
            for (const m of mats ?? []) m.visible = true;
          }
        }
      }
      const full = median(times[0]);
      const cost = {} as Record<Exclude<Part, 'total'>, number>;
      (Object.keys(parts) as Exclude<Part, 'total'>[]).forEach((name, i) => (cost[name] = Math.max(0, full - median(times[i + 1]))));
      const extra = Object.keys(split).map((name, i) => `${name} ${Math.max(0, full - median(times[i + 5])).toFixed(2)}`).join(', ');
      rows.push({ pose: pose.name, frameMs: full, parts: cost, total: cost.plants + cost.patch + cost.scatter + cost.footprints, extra });
    }
  } finally {
    r.setAnimationLoop(loop);
    target.dispose();
    r.setPixelRatio(ratio);
    r.setSize(size.x, size.y, false);
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
  const over = (v: number, cap: number) => (v > cap ? '!' : '');
  let pass = true;
  const report = rows
    .map((row) => {
      const p = row.parts;
      for (const k of ['plants', 'patch', 'scatter', 'footprints'] as const) if (p[k] > DUNE_BUDGET_MS[k]) pass = false;
      if (row.total > DUNE_BUDGET_MS.total) pass = false;
      return `${row.pose}: frame ${row.frameMs.toFixed(2)} ms; plants ${p.plants.toFixed(2)}${over(p.plants, 1)}, patch ${p.patch.toFixed(2)}${over(p.patch, 0.5)}, scatter ${p.scatter.toFixed(2)}${over(p.scatter, 0.4)}, footprints ${p.footprints.toFixed(2)}${over(p.footprints, 0.1)}; total ${row.total.toFixed(2)}${over(row.total, 2)}${row.extra ? ` (${row.extra})` : ''}`;
    })
    .join('\n');
  return { rows, report, pass };
}
