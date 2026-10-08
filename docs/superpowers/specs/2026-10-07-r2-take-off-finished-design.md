# R2, the take-off finished and the wave she keeps (2026-10-07)

Follows R1 + R1.5 (merged to main 118b878). Written by Fable for Opus; Andrew reads first. One segment, four small
changes and the evidence for each, so the take-off is done at every Experience level and the ride lasts as long as
the wave does. "One body" (one curl per wave on one clock) and "feel" are not in here; see Out of R2.

## Why

R1.5 made the drop at 6 ft intermediate and expert and at 12 ft: the ride test went from 1–3 s to 10–14 s, and the
live keyed runs at 6, 7 and 8 ft ride 12–15 s at 9–14 m/s. Four things are left, all measured in the R1.5 handovers:

1. **6 ft beginner still goes over the back** (3.0 s). The softer catch (slope 0.28, assist 8) catches her 0.82 s before
   the crest arrives, high on a still-gentle face; the carry then holds her at ≈ 0.9 c, matched to the crest, so she rides
   its top until the lip passes under her. More forgiveness gave a worse result.
2. **The carry is two-way.** It relaxes every component of her velocity toward dir × 0.85 c, so above 0.85 c it brakes
   her (gravity on a 0.7 face gets only ~0.7 m/s past it) and it strips the along-the-line speed she sets during the
   pop-up (~93 % in 0.4 s). Opus's final review flagged it; it is the same fact as item 1 seen from the physics: matched
   to the crest, she cannot outrun it down the face.
3. **Her wave lets go of her.** In both the 7 and 8 ft live runs she bails at exactly sim +8.19 s (12 s into the ride,
   deep in the tube at 13.6 m/s). The log shows why: one row earlier the nearest live ribbon station of her wave jumps
   from 0 m to 32 m away (another wave, H 3.8/4.5, tb null), her height jumps from −1.2 m to +1.0 m, and the next step
   is `wipeout`. Every station of her wave vanished in one frame; she landed on the sheet under the barrel and its
   slope or foam threw her. The ride test's "kickouts" at 10–14 s are most likely the same event seen on the CPU
   (stations gone → on the sheet → slow → stall).
4. **Popping up the frame she is caught wipes her out ~1 s later** (the bot at 6 and 8 ft), while popping 0.2–0.3 s
   later rides 12–15 s. Both wipeouts have `foam` 0 and happen within 0.1–0.4 s of the crest's arrival at the spot: the
   slope rule (`WIPEOUT_SLOPE` 2.5) fired on the sheet, which a drawn section (capped at `MAX_SECTION_SLOPE` 2) cannot
   do. Review Focus 5 said the instant pop-up must be forgiven, not punished.

## Constraints

- R1's reef and onset are kept: nothing under `src/seabed`, nothing to `breaking.ts`'s parameters, `flowFromEta`,
  `sets.ts`. `crestTrace.ts` may change for §3 only, and only the rule that ends a wave's trace.
- No new blend, fade, σ or `min()` between the sheet and the profile (the root-cause plan's "what not to do again").
- The ride after pop-up keeps `PLANE_DRAG`, `RAIL_KEEP`, the stall rule, `POPUP_S`, `ridePose.ts`, the camera.
- Dials are tried once. Every change has an acceptance test named below; if it does not pass at the first value, the
  trace goes in the commit message and the handover, and the dial stays where it is.
- Measure before changing: §1's probe runs first and its table goes in the handover whatever §2 does.
- `npx tsc --noEmit` clean at every commit; probes in `tools/_*.mjs` or env-gated vitest files, never `src/_scratch`.

## 1. Where she is, in the wave's frame (the probe)

**Design.** An env-gated vitest probe (`src/ride/takeoffProbe.test.ts`, skipped unless `PROBE_RIDE_FT` is set, like
`crestProbe.test.ts`) runs `rideOnSections`' loop at 6, 7 and 8 ft × beginner / intermediate / expert and prints, at
the catch, the pop-up, +1 s and +3 s of riding, and every second after: `t − arrive`, phase, speed, c, the slope under
her, **ahead** (metres in front of the nearest live station of her wave along its normal; positive is shoreward of the
crest line), **up** (her height above still water in units of that station's H), the number of live stations her wave
has, and the distance to the nearest one. It ends with the event and time that ended the ride.

**Target.** Nine rows of a table in the handover. It answers three questions at once: where the beginner is when the
carry starts (§2's gate, if needed), how deep the drop is (R3's camera question), and when her wave's stations vanish
(§3's diagnosis: the station count going to 0 one row before the kickout).

## 2. The carry is one-way

**Design.** In `stepRide`, the relaxation becomes one-way along the wave's travel:
`dv = CREST_CARRY × c − (v · dir); if (dv > 0) v += dir × dv × k` with the same `k = 1 − exp(−dt / CARRY_TAU_S)`. The
water pushes her up to its speed; it never pulls her back to it, and it leaves the components across its travel to the
drag. The drag target while carried is unchanged (the crest's water at 0.85 c), `carrying()` is unchanged, the constants
are unchanged. Expected effect: gravity on a 0.5 face (4 m/s²) now takes her from 0.85 c through c in ~0.4 s, so she
moves down the face relative to the crest instead of drifting up to it at 0.15 c; and the line she sets during the
pop-up survives it.

**Target.** `ridePhysics.test.ts`: the six R1.5 cases still pass; plus "already faster than 0.85 c along the travel, she
is not slowed by the carry" and "the along-the-line speed set during the pop-up is kept through it". `rideOnSections`
4/4 (6 ft beginner ≥ 5 s, no wipeout) with no other change. If the beginner still misses, §2b.

**2b (only if the beginner still misses).** A start gate on the carry from §1's table: the carry begins only once she is
on the face proper, `up ≤ UP_GATE` (fraction of H above still water) **or** `ahead ≥ AHEAD_GATE_M`, whichever the table
shows separates the beginner's early catch from the intermediate's. One value each, read from the table, tried once.
Before the gate she is caught (the hint fires, Space works) but not yet carried. This needs `ahead`/`up` in `WaterAt`
from `withSections` (two optional fields set only where a section applies; the sheet-only water leaves them undefined
and the gate passes). If 2b is also short, leave the beginner case failing with its trace; it is then a spot/lead
question for R3, not a carry question.

## 3. The wave she keeps

**Design.** Diagnose, then fix the one rule. Her wave's stations vanish in one frame at sim +8.1 s after the peak
while the wave is 1.4 s past onset and she is in its tube. Three candidate rules in `traceStations`, in the order to
check: (a) `traceWave` returns `[]` because the crest's seed (`project(field, w, t, ctx, 0, 0, …)`) is no longer on the
grid (`inGrid`) or past `CREST_TOLERANCE_S`: the whole wave drops at once; (b) the `MAX_STATIONS` (2048) retry/cut with
the camera inside the tube (spacing at its minimum around the camera) cutting the last wave in drawing order;
(c) `alive()` (`curlWeight > ALIVE_RHO`) dropping every station together through a collapse read. The §1 probe's
station count (CPU, camera at her) tells (a)/(c) from (b): if the count goes to 0 in the probe too, it is (a) or (c);
if only live, (b).

The fix is to the rule found, not around it: for (a), seed the crest from a point that follows the wave (its position
at t, as `project` is given), or keep tracing from the last good seed, so a wave is traced for as long as any of it is
on the reef; for (b), the cut must never drop a wave the ride stands on (trace her wave first, or exempt it from the
cut); for (c), `alive` must not drop a station the ride stands on while its section still has a lip. No new fade.

**Target.** `rideOnSections` at 6 and 12 ft intermediate ride to a *real* end: either ≥ 15 s or an event with the
water's `foam` > 0 or `onSection` true at the last step (the wave collapsed on her, not vanished under her). A new
case in `crestTrace.test.ts` pins it: the biggest wave's live station count is > 0 at every 0.5 s from its onset at
the take-off spot until its collapse there (`tb` ≥ settleSpan) or until the crest leaves the reef. Live: the 7 and 8 ft
keyed runs no longer bail at +8.19 with the nearest station jumping; they ride until the tube closes or the bot's
window ends.

## 4. The instant pop-up is forgiven

**Design.** Diagnose first: the bot's wipeouts at 6 and 8 ft are foam 0 within 0.4 s of the crest's arrival, so it is
`steep > WIPEOUT_SLOPE` on the **sheet** (a section's slope is capped at 2). Instrument the capture bot's loop (and the
ride test's) to print, at a `wipeout`, `foam`, `steep`, `onSection`, and the nearest station's `tb`, `until`, `wait` and
`A`. Expected: `onSection` false, `until` a few tenths of a second or `wait` > 0, the sheet's lean standing past 2.5
in the last moments before the section draws (R1 §2's onset is on the face, and the sheet leans hard there).

Then the one fix that follows: the slope rule must read the surface she is drawn on. Where the section is not yet
drawn but the sheet stands steeper than `MAX_SECTION_SLOPE` **and** the point is within the ribbon's reach of a
station that is about to break (`until` ≤ the sheet's wall lead, or `wait` > 0), the ride's slope is capped at
`MAX_SECTION_SLOPE` exactly as a section's would be: this is `withSections` extending the same cap it already applies,
to the moment before the section exists, not a new blend. If the trace shows something else (foam after all, or a
bail rule), stop and write it up.

**Target.** The capture bot at 6 and 8 ft (pop-up on the catch frame) rides ≥ 6 s with no wipeout; a `ridePhysics` or
`sectionWater` case pins "a steep sheet about to break under the ribbon's reach does not throw the rider".

## 5. Evidence

On Andrew's PC against the dev server on 5173, after §2–§4:

1. Bot rides at 6 and 8 ft (`tools/captureRide.mjs`, frames −6, −4, −3, −2, −1, 0, 1, 3, 6): no wipeout in the first 6 s.
2. Live keyed runs: 6, 7, 8 ft intermediate **and 6 ft beginner** (`tools/_takeoffLive.mjs` gains `--experience=`), each
   riding until the tube closes or the window ends, never ending with the station jump of §3.
3. The §1 table (nine rows) and the suite summary + tsc.

## Out of R2

The caught/pop-up frame that shows only water (camera; the take-off camera's next touch). Whether the drop *looks*
deep enough (R3: `FLOAT_*` heave vs the planing switch at pop-up, and the camera). One curl per wave on one clock, the
ribbon zipped to the sheet, the lip's streaked look (the old "R2 one body", now a segment of its own after this one).
Board weight, damping, pose snaps (feel). The R1 deferred minors (spread cap's hard switch, the unreachable oval, the
north-only shoulder camera, no 4 ft take-off test).

## Handover

As R1 §8: `docs/superpowers/handover/<date>-r2-opus.md` and `-r2-fable.md`. Branch `r2-take-off` from main; push; do not
merge without Andrew's say-so.
