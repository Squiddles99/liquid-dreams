# Select screens: ChatGPT prompt pack

For Andrew, 2026-10-07. Every image the select screens still need, in the order I'd make them. Each prompt is ready to
paste. The **house rules** block goes at the end of every prompt, so the images match each other and the game can use
them without cleanup.

## How the game uses these images

- **Backgrounds come from the game.** The sky and sea are live. The ground is already done (`conditions`, `bank`).
  So every image below is **one thing on flat magenta**: one person, or one board.
- **The game supplies the light.** Paint everything in soft, even, shadowless light. The game tints it for morning,
  overcast, sunset and night.
- **The game supplies the size.** I scale each person by their real height (Shazza 1.65 m, T-Bone 1.78 m,
  Grommet 1.52 m) and each board by its real length. All you need is "fills the height" framing, the same in every image.
- **The workflow:** generate in ChatGPT, upscale in Canva (keep the magenta, don't remove the background), then drop
  the file into `docs/select-ui-refs/<folder>/`. I do the cut-out.
- **Animated versions:** the same image as a ~4–5 s seamless loop. For people this means breathing and weight shifts;
  for boards it isn't needed. Masks are only needed for plants. For people I use the cut-out as the mask.

## House rules (paste at the end of every prompt)

> Background: one flat, uniform magenta (#FF00FF) with no gradient, no floor, no shadow on the background, and no
> magenta light spilling onto the subject. Crisp clean edges.
> Lighting: soft, even, overcast daylight. No direct sun, no cast shadows, no hard highlights, neutral colour, only gentle
> soft shading in creases.
> Style: photoreal, the same look as the attached reference images. Same faces, hair and build as the references.
> No text, no logos, no brand names, no watermark, no frame, no UI.
> 16:9 landscape, as high a resolution as possible.

## References to attach every time

1. `loading-screen.png`: the faces.
2. `conditions-gang-no-bg-hi-res.png`: the crew's builds, hair and walking clothes as they now are (the crew from
   behind on Conditions). This is the look to keep.

## The crew (keep these exact details)

| | Build | Hair and face | Walking clothes ("civvies") | Surf outfits (Gear screen) |
|---|---|---|---|---|
| **T-Bone** (Tom) | 1.78 m, lean, athletic, mid-20s | sun-bleached brown wavy hair to the collar, light stubble, tanned | charcoal tee, teal boardies, navy cap, black thongs, big black roll-top backpack | boardies · springsuit · short-arm steamer |
| **Shazza** (Sharon) | 1.65 m, slim, early 20s | dirty-blonde double braids, tanned, light freckles | sage-green tee, denim cut-offs, red bikini straps, pink thongs, canvas backpack with a striped towel roll | bikini · rash vest + bikini bottoms · short-arm steamer |
| **Grommet** (Bradley) | 13 years old, 1.52 m, skinny | carrot-ginger curls, fair freckled skin, green-hazel eyes, glasses with the civvies | mustard-yellow tee, navy boardies, khaki bucket hat, blue thongs, navy backpack with fins and a blue towel | rash vest + boardies · springsuit · short-arm steamer |

Colours for the surf outfits: pick one set and keep it in every image. Suggestions:
- **T-Bone:** teal boardies; black springsuit with grey panels; black steamer.
- **Shazza:** red bikini, the same red as the straps; white rash vest; black steamer with teal panels.
- **Grommet:** yellow rash vest; black springsuit; black steamer with blue panels.

---

## A. Choose your rider: 3 images (civvies, no board, facing us)

The Rider screen shows one rider at a time, left of centre, with the menu panel on the right. They've just walked up
from the car, and their boards are leaning out of shot.

**A1 · T-Bone** (attach both references)
> Full-body photo of T-Bone, a lean athletic surfer in his mid-20s with sun-bleached brown wavy hair to the collar, light
> stubble and a tan. He wears a charcoal tee, teal boardies, a navy cap and black thongs, with a big black roll-top
> backpack on both shoulders. He stands relaxed, facing the camera, turned slightly to his left (three-quarter view),
> weight on one leg, thumbs hooked in the backpack straps, with an easy half-smile, looking just past the camera. Camera at
> chest height, a natural 50 mm lens with no wide-angle stretch. He fills the frame's height: the top of the cap 4 % below
> the top edge, the soles 3 % above the bottom edge, centred. No surfboard. [house rules]

**A2 · Shazza:** as A1, with:
> Shazza, a slim woman in her early 20s with dirty-blonde double braids, a tan and light freckles; a sage-green tee, denim
> cut-offs, red bikini straps showing at the neck, pink thongs, a canvas backpack with a striped towel roll strapped
> under it. One hand on a strap, the other relaxed; a confident grin.

**A3 · Grommet:** as A1, with:
> Grommet, a skinny 13-year-old boy with carrot-ginger curls, fair freckled skin and green-hazel eyes behind glasses; a
> mustard-yellow tee, navy boardies, a khaki bucket hat, blue thongs, a navy backpack with black swim fins and a blue
> towel strapped on. Standing a bit restless, one foot turned in, a big excited grin.

**Animated (optional, nice to have):** each of A1–A3 as a 4–5 s seamless loop on the same magenta:
> Animate this exact image as a seamless 5-second loop. The person stays in place: gentle breathing, a small weight
> shift from one leg to the other, a blink, hair moving slightly in a light breeze. The camera is perfectly still. The
> background stays flat magenta. The last frame flows back into the first.

## B. Grab your gear: outfits, 9 images

**Make these from A1–A3 with image-to-image**, so the person, pose and framing stay identical and only the clothes
change. The game cross-fades between them as you scroll the outfits.

> Edit this exact image. Keep the same person, face, hair, body, pose, framing and camera exactly as they are. Change only
> the clothes: [OUTFIT]. Remove the backpack, cap or hat, and the thongs; barefoot. Hair slightly damp. [house rules]

| # | Rider | [OUTFIT] |
|---|---|---|
| B1 | T-Bone | teal boardies, shirtless |
| B2 | T-Bone | a black springsuit (short arms, short legs) with grey side panels |
| B3 | T-Bone | a black short-arm steamer (full legs, short sleeves) |
| B4 | Shazza | a red bikini |
| B5 | Shazza | a white long-sleeved rash vest over red bikini bottoms |
| B6 | Shazza | a black short-arm steamer with teal side panels |
| B7 | Grommet | a yellow long-sleeved rash vest over navy boardies (no glasses) |
| B8 | Grommet | a black springsuit (no glasses) |
| B9 | Grommet | a black short-arm steamer with blue side panels (no glasses) |

## C. Grab your gear: boards (one image per board)

See `board-list.md` for which boards. One image each, all with the same framing, so the game can scale each by its
real length:

> Product photo of a single [BOARD DESCRIPTION], standing upright, nose at the top, deck facing the camera, perfectly
> straight-on (no tilt, no perspective), the whole board visible: the board fills 92 % of the frame's height, centred.
> [DECK DETAILS: colour, a simple pin line, wax on the deck, leash plug, fins visible at the edges if any]. Slightly used,
> real-world look. [house rules] — portrait 9:16 instead of 16:9 for this one.

Keep the colours distinct, so a player can tell the boards apart at a glance (suggestions are in the board list).

## D. The Conditions crew: done

The crew from behind (`conditions-gang-*`) are in. No more images are needed for Conditions.

## E. Loading pictures: flora (whenever you like)

These are 16:9, full-bleed, real photographic look, **with their own natural background** (not magenta; the loading
screen is a full picture). Leave the lower-left third uncluttered for the spinning coin and the fact text.

> A close-up nature photograph of [PLANT] growing wild on the coastal limestone heath near Margaret River, Western
> Australia, in soft morning light, shallow depth of field, the coast softly out of focus behind it. The lower-left
> third of the frame is calm and uncluttered (soft background only). 16:9, as high a resolution as possible. No text,
> no logos, no watermark.

Candidate plants of that coast:
- grass tree / balga (*Xanthorrhoea preissii*)
- peppermint tree (*Agonis flexuosa*)
- parrot bush (*Banksia sessilis*)
- coastal daisy-bush (*Olearia axillaris*)
- thick-leaved fan-flower (*Scaevola crassifolia*)
- cockies' tongues (*Templetonia retusa*)
- rice flower (*Pimelea ferruginea*)
- coast spyridium (*Spyridium globulosum*)

I'll write each plant's fact from a checked source when its picture lands, never from memory. Where a Noongar name
or use exists and is interesting, the card carries it too, as a second line (Andrew, 2026-10-08), from a checked source.
The first card's mockup: `docs/select-ui-refs/_mockups/loading-balga.html` (the balga, grass tree).
