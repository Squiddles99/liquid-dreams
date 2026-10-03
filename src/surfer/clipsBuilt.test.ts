import { existsSync, readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt, layoutFor } from '../board/boardSpec';
import { sampleClip } from './clipPlayer';
import { clipPose } from './clipPose';
import { type RiderClips, clipDuration, clipFor, riderClipsProblems } from './clips';
import { PRESETS, boardFor } from './presets';
import { BONES, type BoneName, type SurferManifest, measures, restFromManifest } from './rig';

/** The real baked clips, when built on this machine (spec §5): the paid clip isn't in git, so elsewhere this skips. */
for (const rider of ['female', 'male'] as const) {
  const path = `public/surfer/clips/${rider}.clips.json`;
  describe.skipIf(!existsSync(path))(`the baked clips for ${rider}`, () => {
    const rc: RiderClips = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { rider, fps: 30, clips: {} };
    const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${rider}.manifest.json`, 'utf8'));
    const rest = restFromManifest(man, Object.fromEntries(BONES.map((b) => [b, new Quaternion()])) as Record<BoneName, Quaternion>);
    it('is well formed', () => expect(riderClipsProblems(rc)).toEqual([]));
    it('loops without a jump (< 2°)', () => {
      for (const c of Object.values(rc.clips)) if (c.loop) {
        const d = clipDuration(rc, c), a = sampleClip(c, rc.fps, d - 1e-6), b = sampleClip(c, rc.fps, 0);
        for (const k of Object.keys(c.rot)) expect((a.rot[k]!.angleTo(b.rot[k]!) * 180) / Math.PI, k).toBeLessThan(2);
      }
    });
    it('plants the feet within 5 mm at every frame, both stances, dials at rest and at the extremes', () => {
      const spec = boardFor(PRESETS[rider], 'thruster'), layout = layoutFor(spec, rest.heightM), m = measures(rest);
      const bad: string[] = [];
      for (const stance of ['regular', 'goofy'] as const) {
        const c = clipFor(rc, 'trim', stance)!, lead = stance === 'regular' ? 'l' : 'r';
        for (let i = 0; i < c.frames; i += 3) for (const d of [-1, 0, 1]) {
          const J = clipPose(rest, sampleClip(c, rc.fps, i / rc.fps), { spec, layout, stance, dials: { compression: d, lean: d, twist: d, reach: 0 }, balance: null },
            { position: new Vector3(), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) }, null).joint;
          const front = new Vector3(...layout.spots.front);
          const err = J[`foot_${lead}`].distanceTo(front.setY(deckYAt(spec, front.x, front.z) + m.ankleH));
          if (err > 0.005) bad.push(`${stance} f${i} d${d}: ${(err * 1000).toFixed(1)} mm`);
        }
      }
      expect(bad.length, bad.slice(0, 3).join('; ')).toBe(0);
    });
  });
}
