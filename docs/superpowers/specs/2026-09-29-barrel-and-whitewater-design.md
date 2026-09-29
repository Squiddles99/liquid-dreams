# Liquid Dreams: the barrel and the whitewater pile — Design

**Date:** 2026-09-29
**Authors:** Andrew (the brief, every answer below), Claude (the design)
**Status:** Written after a brainstorm with Andrew; awaiting his review before the implementation plan.
**Builds on:**
- the breaking ribbon (`2026-09-27-breaking-ribbon-design.md`): the lip's cross-section (`lipProfile.ts`, mirrored in
  `lipProfileNodes.ts`);
- the one-clock fix (merged 2026-09-29, `13a7719`): the onset record in the reef field, `breaking.lifecycle`, the time
  since onset `tb` shared by the sheet and the ribbon;
- the sheet's shading (`waterShading.ts`) and set foam (`setFoamPattern`), the foam field (3a), the impact explosion (3c).

---

## 1. What this is

Two changes to how The Womb breaks, matched to Andrew's reference photo (a Teahupo'o-like barrel seen side on, from the
channel just in front of it):

1. **The barrel's shape and look.** A thick lip thrown well out over a round tube, the face under it hollowed and drawn
   down below sea level, the lip glowing translucent turquoise.
2. **The whitewater pile.** After the lip lands, the broken wave stays a tall pile of churning whitewater, at least as
   high as the lip was (higher after heavy breaks), rising where the lip lands (in front of the falls), then shrinking
   slowly as it rolls toward shore.

Andrew's answers during the brainstorm, which the design keeps to:

- The whitewater is **a tall foam pile**: the water surface itself stays a lumpy mound, a real surface a surfer can be
  hit by or ride in front of later. The explosion and mist (3c) stay as they are, on top of it.
- It **halves in height about 50 m (≈ 7 s) in**, and is a low, foamy bore by the inside and the lagoon.
- **Sometimes the pile is higher than the lip was.**
- Seen side on, **the pile happens slightly in front of the falls**: it rises where the lip lands, not at the crest it
  was thrown from.
- **Shape and look** both, this round.
- **Approach 1:** reshape within the existing system (the ribbon, the sheet, the onset record). No separate whitewater
  mesh, no particle pile.

Proportions are matched to the photo, not its size (the photo is a much bigger wave than the 4 ft default).

## 2. What Andrew should see

Side on, from the channel: the wave stands up and draws the water in front of it down below sea level; the lip throws
out thick and far, the tube inside as wide as it is tall, the lip glowing turquoise where it thins toward its edge.
Where it lands, on the flat water in front of the falls, the white water piles up to the lip's height or above it,
churning and lumpy, and rolls toward shore, shrinking slowly: half as tall about 50 m in, a low bore by the inside.

## 3. Design

H is the crest's local wave height (`setWaveModel.localHeight`, as the ribbon's stations carry it). Every target below
is measured at the peak, on the biggest wave of the reference set (default conditions), and each is a test (§5).

### 3.1 The barrel's shape (the lip's cross-section)

Measured on the ribbon's profile at the moment the lip lands (`tb = τ_land`):

| | Now | Target |
|---|---|---|
| Lip thickness at its root | 0.12·H (`lipThickness`) | ≈ 0.25·H |
| Lip thickness at its tip | 25% of the root (`TIP_THICKNESS_RATIO`) | ≈ 40% of the root |
| Where the lip lands, ahead of the crest | ≈ 1·H (just past the face's foot) | 1.1–1.3·H |
| The tube inside: width ÷ height | low and flat | 0.9–1.2 |
| The back wall, behind the crest | 0.1·H (`WALL_BACK_H`) | ≈ 0.25·H, curving concave up into the lip |
| The trough in front, below still water | ≈ 0.35·H (`troughDrain`) | ≥ 0.5·H |

- The tube's width runs from the back wall to where the lip lands; its height from the tube's floor (the foot of the
  face) to the underside of the lip at its highest.
- The throw's speed stays physical (`throwStrength` × crest speed, floored so the lip lands clear of the face); it already
  matches a round tube. What moves is where the face's foot is and where the lip lands (`FOOT_WIDTHS`,
  `LAND_CLEARANCE_M`, the landing's clearance ahead of the foot), and the wall's recess and curve (`WALL_BACK_H`,
  `WALL_HEIGHT`, the face and wall Hermite tangents).
- The deeper trough is the existing drain (`troughDrain`), deepened: it also deepens the draw-up before the break (the
  "suck").
- The lip keeps its current rules otherwise: its thickness never exceeds `MAX_THICKNESS_OF_RADIUS` of the arc's radius
  of curvature (so the underside never folds), the profile never crosses itself (`crossings` = 0), the edges are the
  sheet's.
- The Break sliders that set these (lip thickness, trough drain, and any newly exposed constant) get new defaults.
  `lipProfileNodes.ts` mirrors every change term by term.

### 3.2 The whitewater pile

After the lip lands, the broken section no longer settles to the low bore (`boreScale` toward β·hmin over the settle
span). It becomes a whitewater pile.

**Height.** The pile's top, above still water, at distance d (m) the section has travelled since it broke:

  pile(d) = floor + (lip × surge(t) − floor) × 0.5^(d / 50 m)

- **lip:** how high the crest stood above still water when the lip was thrown (the crest's height at onset:
  `etaCrest` for the crest's own height, `Hc`).
- **surge(t):** the impact pushing the pile above the lip. 1 + S·rise(t)·fall(t): rises over ≈ 0.5 s after the landing,
  eases back to 1 over the next ≈ 1.5 s. S scales with how hard the section broke, from how far past breaking its crest
  went (the onset record's `rMax`): 0 for a shoulder that only just broke, up to 0.3 for the heaviest breaks (the peak,
  ρ ≈ 3.4). So some sections stand taller than their lip, others don't.
- **floor:** the depth-limited bore (today's β × the breaking depth), so by the inside it is a low, foamy bore. Where the
  floor is at or above the lip (a small wave breaking in deep water), the pile is today's bore, no taller.
- **d:** the time since onset × the local crest speed, from the same clock the ribbon uses.
- **Never grows back.** Where the reef deepens after the break, the pile holds its height; it never rises again (the
  "regrowth" seen on the reef top). The pile's height is a function of the section's clock and its strongest break, not
  of the depth under the crest now, except through the floor, which only lowers it.
- **Partial breaks** build a partial pile: the pile blends from the unbroken wave by the section's breaking extent
  (`breakingStage(rMax)`), as the collapse does now.

**Where.** Seen side on, the pile rises where the lip lands, in front of the falls. As the curl collapses, the pile's top
moves forward from the crest to the lip's landing spot (≈ 1.1–1.3·H ahead, §3.1), then travels on with the wave. The
pile's cross-section: a steep, turbulent front (the face sharpening stays on after the break) and a back that slopes away
over a few wave heights.

**The clock.** The halving needs the clock past 7 s (50 m); the onset record reaches 4.9 s. Its eight lags become
uneven, fine early and coarse late: ≈ 0, 0.4, 0.8, 1.2, 2, 3.5, 7, 13 s. The throw and the collapse keep sub-second
timing; the pile's slow decay reads the coarse lags. No extra textures (still two RGBA per field node). Past the last
lag, the pile sits at its 13 s height (≈ 0.28 of the way from floor to lip, 90 m in).

**The ribbon.** The curl still collapses onto the sheet as now (`settleSpan`, the hand-back), but onto a tall pile, not a
sunken bore: the barrel turns into the whitewater instead of dropping into it. Its landing foam hands on to the pile's
foam.

**Foam.** The whole pile is covered in foam (weight 1 from the landing on), thinning as the pile shrinks toward the
floor. The foam field (3a) keeps receiving the sheet's foam as its source, so foam lingers behind the pile as now.

### 3.3 The look

**The lip.** Light through it by its thickness: bright turquoise where it is thin (the curling edge and the tip),
deepening to blue-green toward the thick root (absorption through the water's thickness, Beer–Lambert, with the water's
own absorption colour). Today the glow is keyed to thin lips and the sun behind them (`lip = 1 − smoothstep(0.05, 0.6,
thickness)`, `backlight`), so a thicker lip would go dark: the opposite of the photo. Skylight comes through from the
side as well as from beneath, so the lip glows seen from the lineup and down the line, not only from inside the tube. No
seabed colour through the lip (as now).

**The whitewater pile.** Fully foam-covered and bright, with a lumpy, churning top: rolling bumps up to about a fifth of
the pile's height, carried with the water (the foam frame) and changing over time, tilting the shading so hollows sit in
soft shadow and tops catch the light. This is what stops it reading as a smooth peach "sausage". The churn is render
detail, like the FFT chop: the height the game reads (the probe, collisions later) is the smooth pile, so it does not
jitter. In morning light the foam still takes the sun's warmth (real foam at 8 am is warm), with bright tops and
shadowed hollows.

**Sliders** (dev panel): the lip's transmission colour and strength; the churn's size and speed; the pile's half
distance (50 m) and surge (0.3).

### 3.4 Cost

- The pile's height is a handful of terms in the sheet's per-wave breaking (CPU model and its TSL mirror), with no new
  field samples: it reads the onset record already sampled for the clock.
- The churn is a noise lookup per vertex (and its normal) inside the pile only.
- The lip's transmission is a few terms in the ribbon's shading.
- The onset record's uneven lags cost nothing extra to build (the same hops, different lengths).
- Measured on the RTX at the default moment and at `barrel-peeling`, against Phase 5's numbers (§5).

## 4. Files

- `src/breaker/lipProfile.ts`, `lipProfileNodes.ts`: the profile's proportions (§3.1).
- `src/breaker/breaking.ts`: the pile's height (`lifecycle` and the bore → the pile), the new constants and params;
  `breakingNodes.ts` mirrors it.
- `src/breaker/setWaveModel.ts`, `SetWaves.ts`: the pile's placement (forward to the landing spot) and height in the
  sheet.
- `src/breaker/reefField.ts`: the uneven lags; `breaking.onsetTime` reads them.
- `src/ocean/waterShading.ts`, `src/breaker/BreakingRibbon.ts`: the lip's transmission.
- `src/ocean/OceanSurface.ts` (and `setFoamPattern`): the pile's foam and churn.
- `src/dev/DevPanel.ts`: sliders.
- Tests beside each; GPU self-tests in `breaker.selftest.ts`, `ribbon.selftest.ts`.

## 5. Testing

- **The barrel's proportions** (CPU, `lipProfile.test.ts`): every row of §3.1's table at landing, at the peak; the
  profile still never crosses itself and its edges are still the sheet's, across the existing parameter sweeps.
- **The pile** (CPU, `breakingField.test.ts`, along the nine ledge rays of the one-clock tests):
  - at landing its top is at least the lip's height; on the heaviest breaks it rises above it (surge), and on a
    shoulder that only just broke it does not;
  - its top sits at the landing spot, 1.1–1.3·H ahead of where the crest threw, as the curl collapses;
  - it is about half as high above the floor 50 m in (± 10 m);
  - it never grows as it rolls in;
  - the one-clock tests still pass (the highest water moves with the wave; a section never un-breaks).
- **The clock:** `onsetTime` with uneven lags (unit tests), the record's monotonicity (as now).
- **GPU:** the self-tests for the sheet, the probe, the ribbon's profile and normals, extended to the new terms; all pass.
- **Look:** gallery shots side by side with Andrew's photo: side on from the channel, down the line, from the lineup;
  the whitewater pile at +2, +4 and +7 s.
- **Cost:** frame time at the default moment and `barrel-peeling`, before and after.

## 6. Success criteria

- Side on, the barrel reads like the photo: thick lip, thrown far, round tube, face below sea level, lip glowing
  turquoise.
- After the break, a tall churning whitewater pile at the lip's height or above it, rising where the lip lands, halving
  over about 50 m, a low bore by the inside. It never stands back up.
- No new seams, trenches or second crests (the one-clock tests).
- Andrew's review.

## 7. Not in this build

- Barrel vs crumble (a plunging or spilling break chosen by how sharply the depth changes).
- The paddle-in suck as a water velocity (the drain moves water, not only the surface).
- A separate whitewater mesh with overhanging foam (approach 2; possible later if the churn still reads too smooth).
- Larger explosion or mist (3c stays as it is).
