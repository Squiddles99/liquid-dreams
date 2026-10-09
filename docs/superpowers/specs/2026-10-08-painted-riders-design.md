# Painted riders on Choose your rider and Grab your gear — design

Andrew, 2026-10-08: he made each rider in their civvies and in every surf outfit (ChatGPT, image-to-image from one
picture per rider, upscaled and cut out in Canva; `docs/select-ui-refs/<rider>/`). He asked: "I want the first screen
when the character select screen happens, to be the character dressed in their civvies. If everything looks good to
you, please start creating the screens of them in their various attires." This follows the lookout backdrop spec
(2026-10-06), whose §5 promised this step. The rulings below are mine, made while building. They are listed for his
review.

## What the player sees

- **Choose your rider:** the bank (the sand track under the heath bank, reserved for these screens) over the live sea,
  with the focused rider standing on the track in their walking clothes, facing us. Moving the focus between riders
  cross-fades one painting into the next.
- **Grab your gear, Outfit tab:** the rider in the outfit the focus is on. Scrolling the list tries each one on, and
  because every outfit was made from the same picture, only the clothes change.
- **Grab your gear, Board and Stance tabs:** the rider in the ticked outfit (or the season's), as before. No board is
  shown yet; the board paintings come later (prompt pack C).

## Rulings

1. **One camera for every screen.** Conditions, Rider and Gear all use the lookout shot. Moving between Conditions and
   Rider cross-fades the two painted grounds over the move. The camera no longer flies between 3D portrait poses.
2. **The 3D crew are hidden on every select screen.** They still load and stage, because the loading cover waits for
   them, but they never show. The paintings replace them.
3. **Where the rider stands** (`RIDER_STAND` in `backdropMath.ts`): soles 95 % down the screen and the figure's centre
   36 % across, clear of the panel and of the bank's big rock (Andrew 2026-10-08: they all stood on it at 30 %), matching his choose-rider mockups. T-Bone (1.78 m) is 80 % of the screen tall; the
   others are scaled by their real heights, so Shazza (1.65 m) and Grommet (1.52 m) stand shorter. This is placed in
   screen space, not on the ground's uv: the 4:3 cover crop cuts the ground's left, and the rider must stay in frame.
4. **Lit like the ground.** The rider takes the same sky-and-sun light as the paintings around them, so they grey under
   cloud and warm at dusk.
5. **A breath.** The rider is a still picture. A slow, 0.3 % swell up from the soles every 4.6 s keeps them from
   looking frozen. The idle loops in prompt pack A ("animated, optional") can replace this later.
6. **The cross-fade:** 0.35 s. The new picture comes in over the first half, then the old one goes out, so outfits
   (which line up) swap without the ground showing through.
7. **Every painted outfit is offered.** The Outfit tab lists them in this order:

   | Rider | Outfits |
   |---|---|
   | T-Bone | boardies · boardies + rash vest · springsuit · short-arm steamer · steamer |
   | Shazza | bikini · one-piece · rash vest + shorts · springsuit · short-arm steamer · steamer |
   | Grommet | boardies + rash vest · boardies · springsuit · short-arm steamer · steamer |

   Each season's outfit is one of these, so the "for <month>" marker still works.
8. **Two new outfit kinds, steamer and one-piece.** In the water, the 3D body has no long-sleeve or one-piece mask
   yet, so it shows the nearest look: a steamer rides as the short-arm steamer, and the one-piece as the bikini.
   Shazza's `rashieAndBottoms` is relabelled "rash vest + shorts" to match the painting.

## The art pipeline

`tools/riderArt.py` processes Andrew's originals in `art/riders/<preset>/<outfit>.png` (copied from his folders and
renamed to the game's names) and writes the results into `public/riders/`:
- each outfit is cropped to one box per rider (the union of that rider's outfits, so cross-fades don't jump), at
  900 px and 1800 px tall;
- `riders.json` holds each rider's box, head, soles and centre.

The edges are defringed: every partly see-through pixel takes the colour of the nearest solid one. This removes the
pink halo that Canva's remover left in Shazza's civvies braids.

## Open for Andrew

- The placement and size by eye (one place: `RIDER_STAND`).
- Grommet's curls have a few olive-tinted spots at the edge in the surf outfits. They are painted in, not part of
  the cut, so a re-render would fix them if they bother you at full screen.
- The wetsuits carry a small wave logo on the chest. The house rules said no logos, but it reads as the game's own
  mark. Keep or re-render?
- In the water, the 3D colours don't yet match the paintings (Shazza's blue neoprene, Grommet's lime rash vest).
- The pick moment on Choose your rider (the step forward and wave) is gone with the 3D crew. An idle loop or a short
  "pick" image could bring it back.
- The board paintings (prompt pack C) and the board tab's picture.
