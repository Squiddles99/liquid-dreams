import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Quaternion } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { parseAmc, parseAsf } from './asfAmc';
import { type RiderClips, riderClipsProblems } from './clips';
import { cmuClip } from './cmuClip';
import { BONES, type BoneName, type SurferManifest, restFromManifest } from './rig';

/**
 * The clip bake (clip slice Task 8), run by `npm run build:clips` (tools/surfer/bakeClips.mjs sets BAKE_CLIPS=1): every
 * clip in tools/surfer/clips.json onto each standing rider → public/surfer/clips/<rider>.clips.json (git-ignored; spec
 * §3.2). The sources live outside git: anim-source/, or LD_ANIM_SOURCE.
 */
describe.runIf(process.env.BAKE_CLIPS === '1')('bake the motion clips', () => {
  it('writes each rider’s clips', () => {
    const spec = JSON.parse(readFileSync('tools/surfer/clips.json', 'utf8'));
    const source = process.env.LD_ANIM_SOURCE ?? 'anim-source';
    mkdirSync('public/surfer/clips', { recursive: true });
    for (const rider of ['female', 'male']) {
      const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${rider}.manifest.json`, 'utf8'));
      const rest = restFromManifest(man, Object.fromEntries(BONES.map((b) => [b, new Quaternion()])) as Record<BoneName, Quaternion>);
      const out: RiderClips = { rider, fps: spec.fps, clips: {} };
      for (const c of spec.clips) {
        if (c.source !== 'cmu') throw new Error(`${c.name}: source ${c.source} isn't baked here (FBX sources go through tools/surfer/clips.py)`);
        const asf = parseAsf(readFileSync(join(source, c.asf), 'utf8')), frames = parseAmc(readFileSync(join(source, c.amc), 'utf8'));
        out.clips[c.name] = cmuClip(asf, frames, rest, { fps: c.sourceFps, outFps: spec.fps, start: c.start ?? undefined, end: c.end ?? undefined, loop: c.loop, noseSide: c.noseSide });
        console.log(`baked ${c.name} onto ${rider}: ${out.clips[c.name].frames} frames, nose ${out.clips[c.name].noseSide}`);
      }
      expect(riderClipsProblems(out)).toEqual([]);
      writeFileSync(`public/surfer/clips/${rider}.clips.json`, JSON.stringify(out));
    }
  });
});
