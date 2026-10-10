# South side: Opus handover (2026-10-11)

Branch `south-side` (worktree `../ld-south-side`, node_modules a junction to main's: `cmd /c rmdir` it before any
`git worktree remove`), from main 41e1ea9, pushed, **not merged**. Spec `specs/2026-10-11-south-side-design.md`. Evidence
`docs/superpowers/evidence/south-side/` (index: its `README.md`). Rulings, carried items and the "for Andrew" list:
`2026-10-11-south-side-fable.md`. **Stopped** at the spec's STOP: the right peels (satelliteReef's right-closeout pin red
for every offered band).

## Commits (41e1ea9..south-side)

| commit | task | what |
|---|---|---|
| 3e4401e | 0 | baseline: suite reds (38), claims, bed lines, the right's rides, before captures |
| 8f904f0 | 1 | `RIGHT_SHAPE` = the spec's trace (verbatim), doc comments; typecheck green; full suite + diff |
| (Task 2) | 2 | bed lines after, the right's rides after + first-40 m spread, captures after, `bake:map` rebake, timeout re-run, these handovers |

## Tools added (probes, kept)

- `tools/_southEdge.ts`: `bedHeightAt` along z 200 and x −120 (the old square's walls), across the traced edge at x −100,
  −40, 20 (z 0 → 80, 5 m), and along the edge's normal at those three x (±30 m). The trace's world points are hard-coded
  in it (the spec's table), so it reads the same lines before and after.
- `tools/_southRight.ts`: the right's `reefReport` stretches on the game's field (`coastReefField`) at 6/8/10/12 ft
  (14/15/16/17 s), tides −0.5/0/+0.5, 225°: r0, r1, r0+r1 and the first 40 m of `SOUTH_LEDGE` as its own polyline
  (first-to-last break time).
- Moments for `tools/captureMoments.mjs` in `evidence/south-side/moments.txt` (`TOP`, `ANDREW`, `EDGE`, base64 with
  `v: 1`): `npx electron tools/captureMoments.mjs --base=http://localhost:5176/ --out=<prefix> --times=30 --m=$TOP
  --settle=4000`, dev server `npx vite --port 5176 --strictPort` in the worktree.

## Gotchas

- The spec's top-down camera (−60, 140, 60) yaw 180 looks **south** (yaw 180 = +z): after the change it frames only basin.
  `EDGE` (−40, 140, 100) yaw 0 pitch −60 looks north over the new edge.
- `npm run claims` rewrites `src/breaks/womb.claims.json` with line-ending-only changes (git shows M, empty diff):
  `git checkout` it unless the content changed.
- `bake:map` reads the reef (the contours): `public/ui/breakMap.json` 12.2 KB → 8.6 KB. It produces no offered pairs; the
  offered pairs are pinned by `smallSwell.test.ts` (two rows red, see the Fable file).
- `crestTrace.test.ts:130` walks only `SOUTH_LEDGE[0] → [1]` for 40 m: with a 14 m stub it extrapolates into the basin.
- Machine load: a coordinator hold for another session: paused heavy runs at 02:48 (after the Task 1 suite), told to
  wait to 03:20, resumed 03:11 when the hold was lifted early. The Task 1 suite ran while my two after-captures ran and while the other session loaded the machine: its 5 s
  timeouts are load, see README §timeouts.
- Baseline is 41e1ea9, not the spec's 9ab4bbb (41e1ea9 adds only the spec).

## Evidence index

`docs/superpowers/evidence/south-side/README.md`.
