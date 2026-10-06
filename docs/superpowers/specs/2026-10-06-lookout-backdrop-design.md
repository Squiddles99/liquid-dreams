# The lookout backdrop: painted ground over the live sea — design

Andrew, 2026-10-06: the select screens should reach the polish of his AI-painted mockups (`docs/select-ui-refs/`), but
the swell must stay live so the player sees the real wave size and weather before paddling out. Brainstormed in chat on
branch `select-screen-ui`. The rulings below are his, from that conversation. This spec covers the backdrop only. The
painted riders and boards that stand in it are the next spec.

## What it is

On the select screens the player looks out from the lookout. The ground they stand on (sand, rocks, coastal heath) is
Andrew's painting. Everything beyond it (sky, sea, the break, the sets rolling in) is the game, drawn live from the
chosen conditions. The painting is lit by the game's own sun and sky, so it sits in the same morning, overcast,
late-afternoon or storm as the sea behind it. Its shrubs sway in the game's actual wind.

## Rulings (Andrew, 2026-10-06)

- **Painted, not 3D.** The 3D crew and dune can't reach the mockups' polish in reasonable time. Paint the people and
  the place, and keep the sea live.
- **Shadowless paintings, tinted by the game.** Every painting is made in soft, even, overcast-style light with no cast
  shadows. The game adds the weather's light on top.
- **Layers, not whole scenes.** The ground is one painting, made once, so it is identical on every screen. Riders and
  boards are separate paintings laid over it (next spec).
- **Magenta, not green.** Paintings are generated on flat magenta (#FF00FF), because a green screen behind green bushes
  cuts badly, then upscaled in Canva. The game's tool cuts them out.
- **Turn the camera to the break.** Andrew's idea: swing the game camera toward the lineup and tilt it down, so the
  break shows above the bush line. The painting stays as it is.
- **Shrubs: the combination.** ChatGPT's 4-second animation (`animated-shrubs`) provides the leaf-level movement.
  The game's wind controls it: its speed, a lean in the wind's real direction, and gusts.

## 1. The layers

From back to front, in one frame:

1. **The live game:** sky, clouds, sea, reef, beach, as now. The game's own 3D land, heath and crew still draw, but the
   painting covers them. The 3D crew are hidden on the screens that show the backdrop.
2. **The ground painting:** composited into the game's picture (`PicturePipeline`) over the scene's light, before
   the exposure, bloom and tone mapping. It gets the same exposure and colour handling as the sea, and `captureFrame`
   includes it.
3. **Later (next spec):** the painted rider, their board, and a strip of foreground bush over their feet.
4. **The menus:** the DOM panels, as now.

## 2. The camera

One fixed pose for the backdrop, measured in the composite test (2026-10-06):

- The eye stands 1.5 m seaward of the stand spot, 1.55 m above its ground.
- Yaw: the bearing to `WOMB_LINEUP` plus 30°, which puts the lineup about a fifth of the way in from the left.
- Pitch: −8.5°, which puts the horizon about 37% down the frame. Field of view: the game's usual 60°.
- The painting has no horizon of its own, so the camera is free to tilt. The pose is in one place (`beatCamera.ts`),
  so it can be tuned by eye.
- At 21:9 or 4:3 the painting is cropped to fill the screen (cover), anchored at its bottom-right: a wider screen
  loses a little of the bank's top, a narrower one a little of the sea on the left. The painting is never stretched,
  and its bottom-left bush never ends in a hard edge.

## 3. The light

The painting is treated as a flat-lit surface and relit by the game's light every frame:

- **colour = painting × (sky light + sun light × the painting's share of sun)**, using the sky's existing
  `skyIrradiance` and `sunIlluminance` (the same light the 3D heath gets).
- The sun's share is a single tunable number, not a per-pixel direction, because the painting has no normals. Its
  starting value is the share that makes a clear mid-morning match the painting as painted. The ground then darkens and
  warms on its own toward dusk, greys under cloud, and goes dark at night.
- Fog and haze: the painting is only metres from the camera, so it gets none.
- Rain: the game's rain falls over the sea and sky. Over the painted ground it doesn't show, because the painting is
  composited after the scene is drawn. A later pass can add rain streaks on top if it's missed.
- The tunable number and an overall exposure trim live in `src/frontend/backdrop/backdropLight.ts`, with a dev
  slider. Andrew sets them by eye in four test conditions: clear morning, grey, late afternoon, and storm.

## 4. The shrubs and the wind

The motion comes from ChatGPT's animation. The sharp still painting is what's shown.

- **Motion, not pixels.** A tool measures how every 8 px patch of the animation moves from frame to frame (its optical
  flow): 80 frames at a 240 × 135 grid, a few MB. The game warps the sharp still painting by that motion. So the
  shrubs are sharp at 4K, and the ground, which doesn't move in the animation, stays exactly still.
- **The wind drives it** (from the conditions' wind speed and direction, as the menu shows them):

  | Wind | Playback speed | Lean | Gusts |
  |---|---|---|---|
  | Calm (< 3 kn) | 0.15× (barely a tremble) | none | none |
  | Light (≈ 8 kn) | 1× (as animated) | slight | gentle |
  | Strong (≥ 20 kn) | up to 1.8× | full | strong, rolling across the bank |

- **Lean in the real direction.** The wind's direction is projected onto the screen. Its sideways part leans the
  shrub tips left or right; its toward-or-away part (an offshore blows from behind the camera, out to sea) gives a
  slight squash. The amount of lean comes from Andrew's mask (`black-and-white-mask`), weighted so tips move and bases
  stay planted, as in the preview.
- **No visible loop.** The 4-second cycle is blended with itself half a cycle apart, and the gusts run on their own
  slower clock, so the repeat isn't noticeable while a player sits on the menu.
- **Fallback.** If the measured motion looks worse than the animation itself (step 1 of the plan checks this side by
  side), the game plays the animation's frames instead, cut out the same way, at 1080p, and drives only their speed
  from the wind.

## 5. Where it shows

- **Now:** on the Conditions screen, replacing today's 3D view of the crew. Until the painted crew arrive (next spec),
  the screen shows the backdrop without them.
- **Rider and Gear screens:** they keep today's 3D crew until their painted riders exist (next spec), then switch to the
  backdrop with the painted rider.
- **Moves between screens:** once every screen uses the backdrop, there is one camera, and the screens cross-fade
  their panels and riders instead of flying the camera. Until then, leaving Conditions for Rider fades the painting out
  during today's camera move (and back in on the way back), so the 3D crew never appear half-covered.

## 6. The art pipeline

A new tool, `tools/plateArt.py`, does what the loading-art script does for the loading pictures. From Andrew's
originals in `art/lookout/`, it writes what the game loads into `public/lookout/`:

- **Cut-out:** the magenta key and despill that were tested on 2026-10-06. Clean against bright and dark skies, with
  no fringe.
- **Sizes:** a 1920 and a 3840 version of the ground. The cut is done on Canva's upscale, never on a re-upscaled cut.
- **Sway map:** Andrew's mask plus plant-coloured pixels it missed (the dark shrubs at the right edge, the grass tufts),
  weighted from base to tip, softened.
- **Motion:** the optical flow from `animated-shrubs`, as one small data file.
- **Inputs to be supplied** (`art/lookout/`): `ground.png` (Canva's upscale of the magenta original, 3840 px or wider),
  `ground-mask.png`, and `shrubs-anim.webp`. Today's files in `docs/select-ui-refs/` are the 1672 px test versions; the
  tool runs on them too.

## Out of scope

- The painted riders, outfits, boards and the conditions-screen group: the next spec, with the ChatGPT prompt pack.
- More boards with handling trade-offs: its own gameplay project.
- Any change to how the sea, sky or waves are drawn.
- The prewarm freeze on the loading screen (its own task, already spun off).

## Testing

- **Unit (vitest):** wind to playback speed, lean and gusts; the screen projection of the wind direction; the cover
  crop at 16:9, 21:9 and 4:3; the light formula's behaviour (a brighter sun means a brighter ground, and night goes
  dark).
- **The tool:** a fixture test that the key leaves no magenta-dominant pixel on any visible edge.
- **Live, in Playwright on the branch's dev server (5180):** the Conditions screen at 1080p and 4K in four conditions
  (clear morning, grey, late afternoon, storm) and three winds (calm, light offshore, strong onshore). The ground must
  hold still between frames and the shrubs must move, measured the way the 2026-10-06 preview was checked.
- **Andrew by eye:** the light number and exposure trim; whether the shrubs feel alive without being busy.

## Open for Andrew

- Supply the upscaled `ground.png` (Canva, from the magenta original). Everything else above already exists.
- If ChatGPT can make the shrub loop 8–10 s at the same quality, the longer loop is better. Not required.
