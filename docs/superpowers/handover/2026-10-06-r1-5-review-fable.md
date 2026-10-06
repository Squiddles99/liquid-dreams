# Fable: R1.5 reviewed (2026-10-06, night)

Read after `2026-10-06-r1-5-opus.md` and `2026-10-06-r1-5-fable.md`. Branch `r1-the-ride` 7d5051c, pushed, not merged.

## Checks from `2026-10-06-r1-review-fable.md`

1. **rideOnSections:** 3 of 4 green, reproduced here (6 ft intermediate, 6 ft expert, 12 ft intermediate ≥ 10 s to a
   kickout; 6 ft beginner 3.0 s). The miss is class (i) exactly as the plan's Task 1 Step 6 names it: carried to ~0.9 c,
   still over the back. Not more carry: the beginner is caught 0.82 s early, high on a 0.43 face, and matched to the
   crest she rides its top. ridePhysics 26/26.
2. **Live frames:** at every size she is on the face about +1 s into the ride and in the tube by +2 s, moving along the
   line (`live6/3-tube-2.2`, `live7/3-tube-2.6`, `live8/3-tube-2.6`, `live8/4-tube-1.2`). The bot's −3.0 frames at 6 and
   8 ft are the best take-off images so far (in the pocket; crouched at the foot of the wall). The caught/pop-up frame
   is still all water at every size: camera, not physics (the sight-line lift is not enough; the camera sits ~6 m off and
   ~4 m up at the catch). The drop reads as a drop in third person, barely in height (0.15–0.5 m fall after pop-up):
   note for R3 (`FLOAT_*` heave vs the planing switch), not an R1.5 fix.
3. **Carry equilibrium:** 8.0–9.3 m/s 0.3 s after the catch at c 9–10 (0.85 c + gravity). Within the expected band.
4. **Scope:** R1.5's own commits (5a374c3..HEAD) touch only `src/ride/ridePhysics.ts`, its test, `tools/captureRide.mjs`
   and docs. The breaker/ocean/seabed files in the branch diff all come from the main merge (6d14a35). `CREST_CARRY` /
   `CARRY_TAU_S` defined once, never retuned.
5. **Suite:** Opus reports only rideOnSections ×3 leaving the failing list and nothing new, with ~20 load timeouts that
   pass alone. The `.superpowers/sdd/.../t*-fails.txt` lists are not on disk here, so I could not diff them myself;
   taken on Opus's report.

## Verdict

Merge-ready as a pair: **R1 + R1.5 together**, Andrew's call. One known miss (6 ft beginner) and three open items go
to R2, none of them a reason to hold the branch:

- **6 ft beginner** (and the reviewer's two-way-carry finding, which is the same problem seen from the physics): the
  carry pulls every velocity component toward dir × 0.85 c, so it brakes the drop above 0.85 c and strips the
  along-the-line speed set in the pop-up (~93 % in 0.4 s). A beginner caught early is matched to the crest and cannot
  outrun it down the face. Ruling for R2: (a) first measure her position in the wave's frame (height above the local
  trough, distance ahead of the crest line) at catch / pop-up / +1 s for 6/7/8 ft × 3 Experience levels, Opus's
  probe in `rideOnSections`' loop; (b) then make the carry one-way along `dir` (`dv = vc − v·dir; if (dv > 0) v +=
  dir·dv·k`, drag target unchanged) and gate it on being in front of the crest. Spec said "relaxes"; the spec was
  short, not Opus. Both changes are R2 scope, tried once each, with the 4-case ride test as the gate.
- **Instant pop-up wipes out ~1 s later** at 6 and 8 ft in the bot, while popping 0.2–0.3 s later rides 12–15 s. Two
  runs, cause not instrumented (foam vs slope > `WIPEOUT_SLOPE`). Review Focus 5 said forgiveness, not punishment:
  one trace in R2 before anyone calls it intended.
- **The caught/pop-up camera** shows only water. Camera work, R3 or whenever the take-off camera is next touched.
- 7 and 8 ft live both bail at the same sim time (+8.19 s): look once in R2; it smells like a section, not a rider.

## Budget

This review: two handovers, the carry diff, 8 frames, one ride-test run (~4 min on a loaded machine). No code changed.
