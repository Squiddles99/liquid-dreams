# R1.5, the crest carries her: a take-off you can make (2026-10-06)

Follows R1 (`2026-10-06-r1-the-ride-design.md`) on branch `r1-the-ride`. One change to the physics, then the evidence R1
asked for and never got: a catchable, makeable take-off at 6, 7 and 8 ft on intermediate.

## Why

R1 landed the wave: the break starts on the ledge's face at every size and tide, the first section peels 9.5–10.9 m/s,
the rim at the foot is gone. The take-off still fails: the slope catch fires, but she is moving 2–5 m/s when a crest
running 9 m/s stands a 3–4 m face under her, and the face passes in 0.3–0.4 s. The bot rides 1.1–2.8 s at every
Experience level and every assist value; the frames show her standing on the back of the wave.

The cause is in the water model, not the numbers. The ride's water velocity (`ride/water.ts` → `breaker/flow.ts`
`flowFromEta`) is linear wave theory: surface flow = η × ω / (k h), capped at √(g (h + η)). At the take-off spot (η 2.7 m,
h 8.3 m, c 8.9 m/s) that is about 2.9 m/s, a third of the crest's speed. A crest about to break carries its water at
nearly c (that is the breaking criterion). A real late drop works because the surfer at the crest is *in* that water:
it carries her at c, and gravity then takes her down a face that, in the wave's frame, stands still. Gravity alone on a
0.7 face gives 4.6 m/s² and needs more than a second to take her from 3 to 9 m/s; the face is gone in a third of that.

## Constraints

- R1's wave is kept exactly: no change under `src/breaker`, `src/seabed`, `src/ocean`, or to `flowFromEta` (the flow
  feeds the kelp, the reef flow and the ride's drag; the ride's drag is tuned against water that does not move with the
  wave, see `ridePhysics.ts` "Against the water itself, not the wave").
- The ride after pop-up is untouched: `PLANE_DRAG`, `RAIL_KEEP`, the stall and wipeout rules, the camera.
- The Experience setting keeps its meaning: the assist and the catch slope are the forgiveness; the carry is the same for
  everyone, because it is the wave, not the player.
- `npx tsc --noEmit` clean at every commit; no scratch under `src/`; GPU self-tests not needed (nothing touches the
  record textures or the section).
- Targets are acceptance, not dials: if the ride test does not reach 5 s with the carry at its first value, stop and
  write the trace into the handover.

## 1. The crest carries her

**Design.** In `ridePhysics.stepRide`, while she is caught by the slope and still prone (phase `paddle` with `caught`),
and through the pop-up (phase `popup`), as long as the face under her is at least the catch slope and lifting her
(`liftAt` > 0), her velocity relaxes toward the crest's water: `CREST_CARRY × c` along the wave's travel direction
(`dir`), with a time constant `CARRY_TAU_S`. First values: `CREST_CARRY` 0.85, `CARRY_TAU_S` 0.15 s. While carried, the
water she is in *is* the crest's: the prone drag is taken against that carried water (not the still water the ride is
otherwise tuned against), and the relaxation is applied after the drag, before the speed cap. Against still water the
prone drag (0.6 v + 0.3 v²) would hold her near 0.7 c. It stops the moment she is standing (`ride`), on the back
(lift 0) or on a face shallower than the catch slope. The speed-rule catch (soft days) does not carry: a wave that
never stands up has no crest water running at c.

Why these numbers: c at the spot is 8.9 m/s (6 ft) to 10.8 (12 ft); at the onset in 3.8 m of water the crest has slowed
to about 6.1 m/s. 0.85 c at the spot is 7.6 m/s, enough to stay ahead of the crest as it slows into the break; a 0.15 s
relaxation reaches 0.86 of the way in 0.3 s, which is how long the face is under her. Both are exported constants with
the reasoning beside them.

**Target.** `rideOnSections.test.ts` green at 6 ft beginner / intermediate / expert and 12 ft intermediate (caught, pop-up,
ridden ≥ 5 s, no wipeout). `ridePhysics.test.ts` pins: a still prone board on a 0.5 face reaches ≥ 0.75 × CREST_CARRY × c
within 0.5 s of the catch; a board the expert tuning does not catch (0.3 face) is not carried; a speed-rule catch on a
0.2 face is not carried.

## 2. Evidence (the R1 §7 list, re-run)

After the carry, on Andrew's PC against the dev server on 5173:

1. Bot rides at 6 and 8 ft (`tools/captureRide.mjs`, frames at −6, −4, −3, −2, −1, 0, 1, 3, 6 s): the log shows paddle
   → popup → ride before the peak, riding speed 7–14 m/s, no wipeout in the first 6 s; the frames at caught, pop-up, +1
   and +3 show her on the face with the wall in frame.
2. Live keyed runs at 6, 7 and 8 ft, intermediate (`tools/_takeoffLive.mjs`): caught, pop-up 0.4 s later, riding the
   first section for ≥ 5 s. The "caught" frame must show her (the R1 review's camera lift has never been seen live).
3. The suite summary and tsc.

## 3. Also in this segment

- Merge local `main` (6d14a35, the async-pipeline prewarm) into the branch first. The branch is 13 commits ahead and one
  behind; a merge now is trivial, later it is not.
- `tools/captureRide.mjs` passes the intermediate tuning to `stepRide` (today it calls it without one, which is the same
  value by default; make it explicit so a tuning change cannot silently change the capture).

## Out of R1.5

Everything in R1's deferred minors (the spread cap's hard switch, the unreachable oval, no 4 ft take-off test, the pop-up
blend bleeding into the first second of the ride, the north-only shoulder camera). R2 (one body, zip the ribbon to the
sheet, the rim residual, "one curl one clock") and R3 (feel) are unchanged.

## Handover

As R1 §8: `docs/superpowers/handover/<date>-r1-5-opus.md` and `-r1-5-fable.md`. Push the branch; do not merge without
Andrew's say-so.
