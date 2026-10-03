import type { App } from '../app/App';
import { KitMeshes } from '../heath/KitMeshes';
import { loadKit } from '../heath/kit';
import { PLANT_ALBEDO, PLANT_KINDS, PLANT_SPECS, type Plant } from '../heath/plants';
import { landSpots } from '../surfer/placement';

/**
 * The species sheet (dune-up-close spec §6.1, gate 1): each kind's variant 0 alone on the open dry sand by the beach spot
 * (no heath there to clutter it), at its mean size, from 2.5 m and 0.8 m, at 08:30 and 12:30; each frame posted to the
 * local snapshot receiver as `sheet-<kind>-<hour>-<distance>`. Dev builds only (`?sheet=species`).
 */
export async function captureSpeciesSheet(app: App, post: (name: string, frame: Blob) => Promise<void>, only?: readonly string[]): Promise<string[]> {
  for (let i = 0; i < 300 && !app.land.height; i++) await new Promise((r) => setTimeout(r, 1000));
  const lh = app.land.height!;
  const kit = await loadKit();
  const meshes = new KitMeshes(kit, app.sky);
  meshes.forceBand.value = 1;
  for (const m of meshes.meshes) app.scene.add(m);
  const spot = landSpots(lh, lh.profile).beach;
  const x = spot.x + 3, z = spot.z + 6;
  const names: string[] = [];
  try {
    for (const kind of PLANT_KINDS.filter((k) => !only || only.includes(k))) {
      const s = PLANT_SPECS[kind];
      const width = (s.widthM[0] + s.widthM[1]) / 2, height = (s.heightM[0] + s.heightM[1]) / 2;
      const y = lh.heightAt(x, z);
      const plant: Plant = {
        x, z, kind, shape: 0, width, height, yTrue: y - 0.05 * height, yCoarse: y - 0.05 * height,
        yaw: 0.6, cosYaw: Math.cos(0.6), sinYaw: Math.sin(0.6), seed: 0.4, tint: PLANT_ALBEDO[kind],
      };
      for (const hour of [8.5, 12.5]) {
        app.conditions.timeOfDay = hour;
        for (const [dist, label] of [[2.5, 'far'], [0.8, 'close']] as const) {
          // From the south-west, a little above the plant's top, looking at its middle.
          const d = Math.max(dist, width * 0.5 + 0.4);
          const cx = x - d * 0.6, cz = z - d * 0.8, cy = y + Math.max(1.2, height + 0.3);
          const ty = y + height * 0.5;
          const yaw = (Math.atan2(x - cx, -(z - cz)) * 180) / Math.PI;
          const pitch = (Math.atan2(ty - cy, Math.hypot(x - cx, z - cz)) * 180) / Math.PI;
          app.rig.setPose({ mode: 'free', position: [cx, cy, cz], yawDeg: (yaw + 360) % 360, pitchDeg: pitch }, app.conditions.tideM);
          for (let f = 0; f < 4; f++) {
            meshes.update([plant], app.camera, { cx: 0, cz: 0, on: false });
            await app.captureFrame();
          }
          const name = `sheet-${kind}-${hour}-${label}`;
          const frame = await app.captureFrame();
          if (frame) await post(name, frame);
          names.push(name);
        }
      }
    }
  } finally {
    for (const m of meshes.meshes) app.scene.remove(m);
  }
  return names;
}
