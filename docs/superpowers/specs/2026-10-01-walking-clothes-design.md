# Walking Clothes and Backpacks: Design

**Date:** 2026-10-01 · **Branch:** `walking-clothes` (worktree `ld-surfer`, from main 0fa7f8e) · **Status:** design
agreed with Andrew in chat; this spec awaits his review.

## 1. What this is

This is step 3 of the front-door roadmap (grommet spec §1). The crew walks from the Ellensbrook carpark in clothes over
their swimwear, with backpacks on and boards under their arms. After the select screen fades, they're in their surf gear
at the water's edge, and their clothes and packs lie in a pile on the sand.

This step builds what they wear and carry, a standing pose for carrying their boards on land, the pile, and a mockup of
the gang together on the dune. Walking motion is step 6, and the intro cinematic is step 5.

## 2. What Andrew decided

- **When:** they walk in clothes and change on the sand. The walk to the water (step 6) starts in surf gear, with the
  pile left behind.
- **One outfit each, all year** (no seasonal sets):
  - **Shazza:** an oversized faded tee knotted at the hip, denim cutoff shorts and thongs. Her bikini straps show at the
    neck.
  - **T-Bone:** a plain tee, his boardies, a trucker cap and thongs.
  - **Grommet:** a big tee (too big for him), his boardies, a bucket hat squashing the mop, thongs, and his glasses on.
- **Continuity (Andrew):** T-Bone and Grommet walk in the exact boardies (mesh and colours) they surf in. If the player
  then picks a boardies outfit, it looks as if they just took their shirt off or put a rashie on.
- **Packs, one each to suit them:**
  - **Shazza:** a canvas rucksack with a rolled towel strapped on.
  - **T-Bone:** a worn surf backpack with a wetsuit hanging off a strap.
  - **Grommet:** his school backpack, stuffed, with fins clipped to it.
- **Hair under hats (Andrew):**
  - T-Bone's cap squashes his hair: no hair through the crown, the back and sides showing below the band.
  - Grommet's bucket hat presses his curls down, with curls spilling out below the brim.
- **Scope:** the outfits, the packs, a carry pose, the glasses swap, the beach pile, and a mockup image of the three
  together on the dune cliff above the Womb, facing the camera, with their names on it in a surfy hand.
- **Approach:** option 1, garment shells generated from each body in the Blender pipeline, as the boardies are already
  made.

**Assumptions (mine; Andrew can overturn):**
- Shazza's cutoffs sit over her bikini bottoms.
- In winter the walking outfit is the same, and the surf gear underneath is the season's (a steamer).
- Grommet's glasses go into his school bag for the surf, and show in the pile.

## 3. The garments and packs (Blender build)

Everything is generated in `tools/surfer/` (a new `clothes.py` and `packs.py`) from each body. It is skinned to the
23-bone skeleton and exported in the rider's glb as new meshes with their own materials. Nothing is painted on the body.

- **Tee (all three):**
  - **The shell:** copied from the body's torso, shoulders and upper arms, and pushed out 1.5–3 cm. Below the chest it
    hangs straight down instead of following the waist in, and it ends at the hip.
  - **Sleeves:** end at mid-upper-arm with a hem lip.
  - **Neck:** a round collar opening.
  - **Per rider:**
    - Shazza's tee is knotted at her left hip: the hem is gathered toward one point, with a small knot lump. Her
      bikini halter shows at her neck as two thin strap strips.
    - T-Bone's is a plain fit.
    - Grommet's is two sizes too big: longer (past the top of his boardies), wider at the body and sleeves.
- **Shorts:**
  - **Shazza:** denim cutoffs, a shell over the hips and upper thighs, with frayed hems (an alpha fray in the shader).
  - **T-Bone and Grommet:** the existing boardies mesh, unchanged.
- **Hats:**
  - **T-Bone's trucker cap:** a crown dome and a curved peak, sitting on his head.
  - **Grommet's bucket hat:** a soft crown and a sloping brim.
  - **Hair under them:** a new hair style per rider, `capped` (T-Bone: his tousled cards held inside the crown, showing
    below the band at the back and sides) and `bucket` (Grommet: curls pressed under the crown, springing out below the
    brim). It is a third hair mesh, `hairHat`, shown only with the walking outfit.
- **Thongs:** a sole under each foot with a Y strap, skinned to the foot.
- **Packs:**
  - **Shape:** rounded boxes skinned to `spine_03`, with straps over the shoulders.
  - **Details:** Shazza's rolled towel under the flap; T-Bone's wetsuit draped through one strap (neoprene, with a
    sleeve hanging); Grommet's fat school bag with fins clipped to its side.
- **Shading:**
  - cloth with fold creases from noise and pose-independent wrinkles at the elbows, waist and knees;
  - a fabric weave visible up close;
  - faded denim on the cutoffs;
  - canvas on the packs;
  - the step-2 occlusion bake for the under-layers.
- **Colours per rider** (in `presets.ts`):
  - Shazza: a washed sage tee, mid-blue denim.
  - T-Bone: a faded charcoal tee, a navy and white cap.
  - Grommet: a sun-faded yellow tee (his bodyboard's), a khaki bucket hat, a navy school bag.

  All of them are tuned at the gate.

## 4. On land: the carry pose, the stand and the glasses

- **The `walking` outfit:** a new choice alongside the surf outfits. In it:
  - the tees, shorts, hats, hair under the hat, packs and thongs are shown;
  - the body's masks show the swimwear underneath (Shazza's bikini, the boys' boardies, the neck straps);
  - the glasses are on, and the skin and hair are dry.

  Outside `walking`, all of these are hidden, so in the water the glasses are never on.
- **Standing on land:** the stand gains an on-land placement.
  - The feet are placed on the ground from the land's height at a chosen spot and heading, and the water isn't probed.
  - Named spots in the dev panel: `dune crest` (above the Womb, found by sampling the land when building the mockup)
    and `beach` (the dry sand in front of the Womb).
- **The `carry` pose (on land only):** standing relaxed, weight on one leg, head up and looking ahead.
  - **Shazza and T-Bone:** the board under one arm, held by its rail at the board's middle, nose forward and a little
    down, deck against the hip and forearm, the hand under the far rail.
  - **Grommet:** his bodyboard tucked flat under one arm.
  - **The free arm:** hangs, or holds a pack strap.
  - **The board follows the arm**, not the feet: on land, the board is placed from the carrying arm's frame (the reverse
    of the water, where the body is placed on the board).
  - **The carrying side:** per rider, chosen in the panel (left or right).
- **Idle life:** on land, the pose is still, so the head looks around and the eyes, blinks, breathing and mood carry on.
- **Step 6 requirement (Andrew):** once they walk and turn, a carried board must never pass through a nearby rider.
  Board-to-board and board-to-rider clearance is designed in step 6. In this step's mockup it is avoided by placement:
  the outer two carry on their outside arms.

## 5. The beach pile

- **What it is:** a static prop on the dry sand above the tide line:
  - the three tees, dropped and half-folded, and Shazza's cutoffs;
  - the cap and the bucket hat;
  - the three packs, slumped open;
  - two towels and three pairs of thongs;
  - Grommet's glasses resting on his school bag.
- **How it's built:** in Blender as one small `public/surfer/beachPile.glb` (with a manifest), using cloth and AO
  shading, the riders' colours, and placeable from the dev panel. Step 6 places it where they change.

## 6. The gang mockup

- **The scene:** a real in-game render of the three in the `carry` pose on the dune crest above the Womb, side by side
  and facing the camera:
  - Grommet in the middle, a head shorter;
  - Shazza on his left and T-Bone on his right;
  - the boards on their outer arms.
- **Camera and light:** the camera is at chest height and a little below them, so the Womb's lineup and the horizon sit
  behind them. The light is late morning, from the side.
- **The names:** set over the render in a surfy hand with real character (creative licence: Andrew):
  - big nicknames ("SHAZZA", "T-BONE", "GROMMET"), with the real names small underneath ("Sharon", "Tom", "Bradley");
  - set over or under each rider;
  - a hand-painted, sun-faded, surf-wax feel.

  The faces are open-licence (SIL OFL or Apache) Google Fonts only, so the same look can carry into the select screen
  (step 4).
- **Variants:** the idle faces as they come, and all three smiling.
- **Output:** `tools/surfer/previews/gang-mockup-*.png` (git-ignored), sent to Andrew.

## 7. Testing

- **Build checks (vitest on the glbs and manifests):**
  - every garment, hat, pack and thong mesh exists for each rider, with its material;
  - each is skinned only to its bones: the tee to the torso and arms; the shorts to the pelvis and thighs; the hats and
    the hair under the hat to the head; the packs to `spine_03` (and the clavicles for the straps); the thongs to the
    feet;
  - a build-time ray check that no tee or shorts vertex lies inside the body, written to the manifest;
  - the hats sit above the scalp, and no hat-hair vertex rises through a hat's crown.
- **Pure tests:**
  - `walking` is in each rider's outfit list;
  - old links and settings without it still open;
  - the land placement puts the ankles on the land height;
  - the `carry` pose keeps the carrying hand on the rail (within 2 cm) and the board clear of the hip and legs (no part
    of the board inside the body's capsules);
  - the glasses show only in `walking`.
- **GPU self-tests:**
  - in `walking`, the tee covers the torso;
  - in surf gear, the tee is gone and the swimwear shows;
  - the cap hides the crown's hair.
- **Sweeps:** "everything renders" for `carry`, for all three: every limb visible, nothing buried in the board.
- **Gate (Andrew):** turntables of each rider in walking clothes, close-ups of the hats with the hair, the pile, and the
  gang mockup. Nothing merges without his sign-off.

## 8. Out of scope

- Walking and turning, and the board clearance that comes with them (step 6).
- The intro cinematic (step 5).
- The select screen itself (step 4), though the mockup's lettering is meant to inform it.
- Changing on the sand as an animation: they simply appear in surf gear after the fade.
- Wind in the clothes, and cloth physics.
