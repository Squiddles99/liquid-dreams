# Peel stretch: the Womb's left breaks along the line slowly enough to ride

Date: 2026-10-04. Branch `peel-stretch` (worktree `../ld-peel`), from main 6b06caf.

## Why

Andrew, 2026-10-04: "the wave is simply breaking too fast for the surfer to ride. We've got to slow the speed it breaks
from right to left (looking at the beach)."

Measured on the ride's wave (`tools/_peelProbe.mjs`: the crest stations' onset times, t − tb, along the line):

| Conditions | First section | Then, along the left |
|---|---|---|
| 5.5 ft / 14 s / tide −0.25 | 27 m in ~1 s (~25 m/s) | 12–18 m/s for ~150 m |
| 4 ft / 15 s / tide 0 | 24 m in ~1 s (~22 m/s) | 10–18 m/s for ~90 m |

The rider makes ~10–11 m/s along the line, so the curl always wins. With the crest at ~7.5–9 m/s that is a peel angle
near 28° (Hutt, Black & Mead 2001: experts only). Makeable waves peel at 45–60°, roughly 5–9 m/s.

The peel is physical: each point breaks where its crest reaches breaking depth, so the speed follows the angle between
the arriving crests and the shelf's breaking-depth line. Andrew chose (over reshaping the reef or capping the speed) to
**stretch the breaking timeline**: a game rule, as the drain bonus and the random dial are, that keeps the reef, the
shape of the breaking line, its sections and the closing-out rights, all happening more slowly.

## Success

- The left at 5.5 ft / 14 s peels at ~7–10 m/s with the default dial (×1.7); the first section's ~25 m/s becomes ~15.
- The rights still close out (still far faster than anyone rides).
- Where a section starts on its own (the peak, the inside section, a section thrown by a swell-direction change), its
  first break stays where the physics puts it; only its spread along the line slows.
- Ahead of the curl the wave stands as a steep wall, with no lip or foam, until its turn; then it throws as it does today.
- The drawn sea (GPU), the CPU water (ride physics), the lip ribbon, the foam, the spray, the sound and the tube cover
  all agree on when each point breaks.
- Andrew signs off before/after pictures by eye before the dial is tuned or anything merges.

## Design

### 1. The delay, in the reef bake (`reefField.computeOnsetRecord`)

Today the march, in arrival order, records per node and per breaking level k the time since the section on its ray
reached level k (`tb`), carried along the ray. A node where its ray first breaks (the record's "broken in between"
branch, or a boundary node breaking at itself) is an **onset node**, with onset time T = τ − tb.

New, in the same march: each level k also carries a **delay** D_k (s), the extra time the peel stretch adds before that
ray's section breaks.

- At an onset node i: look at the level-k onset nodes already marched within `PEEL_NEIGHBOUR_CELLS` (2 cells, 2 m on the
  app's 1 m field grid) with T_j < T_i: the line upstream of i.
  D_i = max over them of (D_j + (peel − 1)·(T_i − T_j)), or 0 if there are none (a section starting on its own).
  On a straight peel every term agrees: D = (peel − 1)·(T − T_start).
- Off an onset node, D is carried along the ray with tb (bilinear back RUN_BACK_CELLS, as tb is).
- An unbroken node holds D = 0.

The march keeps two clocks per level: the physical tb, and the stretched tbS = tb − D, which is negative while the
section waits its turn. While tbS < 0 the section counts as unbroken for what the record measures at the throw: the
throw's height and ψ₀ keep taking the node's own values, as an unbroken level does. The LIP_THROW_S window opens at
tbS = 0, so the lip is measured where it actually throws, further inshore over shallower reef.

The running maximum `run` is unchanged (physical: the ratio the ray reached).

**Storage.** The record stores tbS in each level's time slot (it may be negative) and D_k in a new block at
`ONSET_DELAY_OFFSET` = 1 + 3·ONSET_LEVELS, so ONSET_RECORD_LENGTH becomes 1 + 4·ONSET_LEVELS (49). On the GPU, D goes in
the ψ₀ texture's two spare channels: texel k becomes (ψ_k, ψ_{k+1}, D_k, D_{k+1}). No new binding.

**The dial.** `peel` (≥ 1; 1 = physics as today; default 1.7) joins `ReefFieldRequest`, so changing it re-bakes the
field as the tide does. BreakParams gains `peel`, normalised and saved like the other break params, with a slider in the
dev panel's Break section.

### 2. Reading it (`breaking.onsetTime` and `breakingNodes.onsetTimeNode`)

The time since onset becomes the stretched one: from level k toward level k + 1 as today, with the level times tbS. Where
level k + 1 is above the running maximum (the wave breaks between level k and the running maximum: `toRun`), today's
target 0 ("breaking here now") becomes −D_k ("its turn comes in D_k seconds"). A negative result means **held**: broken
by the reef, waiting its turn. A new `onsetDelay` (and its node) reads the section's D the same way (level k toward
k + 1, or D_k where toRun).

### 3. The wall holds (`breaking.lifecycle` and `breakingNodes.lifecycleNode`)

Today a crest the record calls unbroken still breaks on the spot once its live ratio reaches 1 (`tb ?? (r ≥ 1 ? 0 :
null)`). A held crest (tb < 0) instead takes the unbroken branch with its ratio capped at 1: the steepening, the stage,
the drain and the collapse curves all read min(r, 1). It stands as the wave does at the moment it pitches, a steep wall
with no lip, no pile, no collapse.

At tb = 0 the lip throws as today, but the live ratio has gone on rising while it waited, and switching to it at once would
jump the shape (a square step). So for a delayed section the ratio's excess over 1 fades in over the landing time:
r_eff = min(r, 1 + (r − 1)·smoothstep(0, τ_land, tb)), weighted in by smoothstep(0, 0.2 s, D) so that an undelayed
section (D = 0, and every section at peel 1) reads r exactly as today. lifecycle takes D as a new argument. CPU and GPU
get the same rule.

### 4. The rest follow

- `crestTrace.timeSinceOnset` gives a station's tb as null while it is negative (Station.tb: "null before breaking").
  The ribbon, the spray emitters, the sound and the tube cover then treat a held section as unbroken without changes.
- `setWaveModel.crestAt` passes the negative tb on to lifecycle (the held wall).
- `peakStation.fixture.ts` and `reefReport.ts` read onsetTime as today (with peel 1 nothing changes for them).

## Testing

- Unit (CPU): on a synthetic field with a straight oblique shelf, the onset front's speed along the line drops by the
  dial (×1.7 → 1/1.7 of the physical speed, within 10%); a lone section's first break is unchanged; peel = 1 reproduces
  today's record exactly; D is constant along a ray past onset.
- Unit: onsetTime gives negative times while held, toRun reads −D; lifecycle of a held crest equals its unbroken values
  at r = 1, whatever r is, and ramps without a jump through tb = 0; with D = 0 lifecycle is today's exactly.
- GPU mirror: the existing record/lifecycle self-tests extended to the delay channel and the held rule (CPU vs GPU
  agreement, as the ribbon and breaker self-tests do now).
- In the app: `tools/_peelProbe.mjs` at 5.5 ft / 14 s and 4 ft / 15 s (the left at ~7–10 m/s, the rights still closing out);
  a ride bot (left-going styles stay ahead of the curl).
- **Andrew's gate, by eye:** before/after at 5.5 ft, the break along the line over time seen from above and frames from
  the ride camera. The dial is tuned, and the branch merged, only after his sign-off.
- Performance: the bake's extra cost (one neighbour search per onset node per level) measured; the GPU cost is one more
  channel read per crest, expected unmeasurable.

## Out of scope

- Reshaping the reef, and the dip in front of the face at the takeoff spot (separate wave-shape work).
- The ride physics (a rider climbing up through the lip isn't punished yet).
- The takeoff/camera work on branch `takeoff-feel` (merges separately).
