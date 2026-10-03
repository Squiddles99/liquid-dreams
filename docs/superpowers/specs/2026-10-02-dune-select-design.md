# The dune select screen: conditions, rider and gear (front-door step 4)

Status: draft for Andrew's review, 2026-10-02; brought up to date 2026-10-03 (the dune up close, faces and hair built).

## 1. Context and scope

This is step 4 of the front-door roadmap (grommet spec §1):

0. the surfer on the stand;
1. Grommet;
2. close-up detail and idle life;
3. walking clothes;
4. **the dune select-and-setup screen**;
5. the intro cinematic;
6. on foot and paddling out;
7. the two NPC mates.

Steps 0–3 are merged (main 2bf6424), and so are this spec's face and hair work (§13.1–13.2, main 0f00cbc) and the dune up
close (main 0c1eabe).

The crew (Shazza, T-Bone, Grommet) stand in the junction clearing on the Cape to Cape above the Womb (dune-up-close
spec §4.1) in their walking clothes, carrying their
boards (walking spec §6, the gang lineup). This screen is where the player:
- sets the session's conditions;
- picks which of the three they ride as;
- takes the board their rider picks (or swaps it);
- picks what they surf in;
- then paddles out.

**Andrew's bar (binding):** the UI "absolutely MUST NOT feel like ai-slop. It must feel like a AAA title video game".
It follows the settled craft of shipped games. §5 is the style guide that turns that into rules with numbers, from a
research pass over shipped titles and platform guidelines (sources in Appendix A).

**Built first, as its own sub-project: "the dune up close".** Andrew judged the dune's ground and heath too crude at the
2–5 m this screen holds the camera, and steps 5 and 6 will too. Its spec covers:
- close-up coastal heath with real leaves and branches;
- grasses and sedges;
- sand, soil and limestone;
- footprints, and fallen twigs and leaves (no rubbish: the place is pristine).

It is built and merged (main 0c1eabe). Both of this step's gates (§15) are judged over it. What it means here:
- **The stand spot** is `TrackNetwork.standSpot()`: 1.2 m seaward of the junction, in the junction clearing. After gate 2
  of the dune up close the junction sits on the flattest ground near the lineup that sees the break: the clearing's grade
  is 0.14 (about 1 m of fall across its 7 m), and the crew's ground 0.09. Each rider stands on the ground under them.
- **The ground** is pale grey sand with litter; the clearing and the tracks are packed sand.
- **The approved mockup's backgrounds** were shot over the old dune. They fix the layout and type, not the look of the
  ground; the gates use fresh frames.

**Out of scope:**
- **The intro cinematic and "press START" (step 5).** This screen opens straight at beat 1. A dev entry stands in for the
  intro.
- **Walking to the water, paddling out, and the NPC mates (steps 6, 7).** "Paddle out" lands in today's game: the
  chosen rider on the stand in the water.
- **Voice acting.** Lines are on-screen text with a sound. The VO hook is named in §12.
- **The music track.** There's a hook only. The soundtrack is Steam hurdle #1, a separate track.
- **Multiplayer.**

## 2. Andrew's decisions

- **The flow (his order):**
  1. **Conditions:** the camera is behind the three, looking out at the break.
  2. **Choose your rider:** the crew turn round to face the camera; one rider at a time is framed close on the left half,
     and a panel slides in from the right over the other two.
  3. **Grab your gear:** only the chosen rider is in shot.

  His reason: going from one person to three and back to one felt wrong. The camera moves between the beats (his pick of
  option C over a fixed shot or a settings panel).
- **The titles:** "Conditions", "Choose your rider", "Grab your gear".
- **All three always surf.** The pick is who you ride as. The other two paddle out with you (as NPCs from step 7). The
  rider panel says so.
- **Setup reads like a surf report:** a word first, the real number small beside it ("Fun 3–4 ft · 4 ft · 15 s").
- **The board:** the rider picks the board for the conditions and says why; the player can swap to another board in the
  rider's quiver. Grommet has only his bodyboard.
- **The costume:** each rider's own surf outfits, defaulting to the month's (wardrobe spec), and the player can change it.
  Looks only, no effect on surfing.
- **No focus ring in "Choose your rider":** the camera pushing in on the rider is the focus.
- **A map of the break in Conditions,** so the player sees how the wind and swell meet the Womb. It is our own drawing,
  from the game's terrain and reef data (§7). Placement: top-right, 30% smaller than the first mockup, further into the
  corner.
- **T-Bone's stance:** it looked "very awkward" and "not natural or cool" in the mockup frames. All three get natural,
  cool select stances (§13).
- **Shazza's face** "looks messed up" in the mockup's close frames: the faces and the dry hair must hold up at this screen's distances (§13.1).
- **The mockup he approved** is `2026-10-02-dune-select-mockup/mockup.html` ("AAA pass 2b"), with its 1080p
  backgrounds. Its beat order predates his reorder: its Beat 2 (Conditions) is now beat 1.

## 3. The flow

```
[game start, after prewarm] → CONDITIONS → CHOOSE YOUR RIDER → GRAB YOUR GEAR → PADDLE OUT → today's game
                                  ↑ B           ↑ B                  ↑ B
                                  └──────────────┴────────────────────┘
```

- **A or Enter** confirms a beat and moves on.
- **B or Esc** steps back one beat. Back from Conditions does nothing, because the intro (step 5) isn't built; it'll go to
  the intro's skip prompt later.
- **START** on any beat jumps to Paddle out with every remaining choice at its default:
  - the rider: the last one picked, or Shazza the first time;
  - the board: the rider's pick;
  - the outfit: the month's.
- **Focus is remembered per beat,** and every choice is remembered across sessions (local settings).
- **Entry:**
  - A normal start opens the front end after `prewarm()`.
  - A moment link (`#moment=`), `?selftest`, or `?frontend=off` skips it and opens the game as today, so captures and the
    dev workflow don't change.
  - The dev panel gets a "Front end" button that opens it at any time.
- **Paddle out:**
  - The UI leaves (180 ms), then the screen fades to black (600 ms).
  - The App applies the chosen conditions, rider, board and outfit, and puts the rider on the stand in the water (the
    surfer stand, `onLand: false`, at its default lineup spot).
  - It fades back in (600 ms).
  - The gang lineup is hidden.

## 4. The three beats

All three hold one live 3D scene: the gang lineup in the junction clearing (`GangLineup`, `landSpots().standSpot`). The camera
and riders move; the scene never cuts or reloads. Layout values are at 1920×1080, from the approved mockup, and scale with
the window (§5.1).

### 4.1 Conditions

**Shot:**
- The three face the sea (heading toward the break).
- The camera is 3.8 m behind and 2.3 m above their centre, looking at the lineup about 200 m out.
- The crew sit centre-right, and the swell lines and reef read across the water.

**Left: the value rows.** A directional scrim from the left edge (no card). The title "Conditions" in Knewave. Then
these rows:
1. Preset (with a small gap below it);
2. Month;
3. Time;
4. Sky;
5. Wind;
6. Swell;
7. From (the swell direction);
8. Tide.

Each row is a label, a word value, and a small number (§6).

**The focused row:**
- a cream plate with an orange edge bar;
- scaled to 1.04;
- dark ink text;
- the ◀ ▶ arrows show only on the focused row.

Left and right change the value at once, with no edit mode.

**Top-right: the map (§7).**

**A rider's line in brush script** (Caveat Brush, with their name small above) appears over the water when a value
changes. It's chosen from lines for the new conditions; for example, T-Bone: "Four foot and offshore. Mate." The speaker
rotates between the three.

**The legend:** [Y] Roll the dice · [X] Swell details · [A] Done · [B] Back.
- **X** opens the advanced swell rows (period) under Swell, and closes them again.
- **LT / RT** fine-scrub the focused value where it has a finer scale: time in 15-minute steps, swell in ½ ft steps.

### 4.2 Choose your rider

**Transition from Conditions:**
- The three turn to face the land (a 0.8 s turn on the spot).
- The camera swings round in front of the focused rider.

**Shot:**
- The focused rider stands in the left third (the body's centre at x ≈ 33% of the frame), feet near the bottom of the
  safe area, the head about 25% from the top.
- The camera is 2.35 m away at 0.95 m height, slightly low (heroic), with a yaw of 15–20° off the rider's facing.

**Right: the slide panel:**
- 900 px wide, from the right edge, with a raked leading edge (110 px rake) and a 6 px orange cut line along it;
- near-opaque (≥ 90%), hiding the other two riders.

**Its contents, top to bottom:**
- the roster tabs, `[LB] T-BONE · SHAZZA · GROMMET [RB]`, with the focused one cream and underlined orange;
- the name lockup: the nickname in Knewave at 128 px, the real name in Caveat Brush below;
- the descriptor rows: Stance, Rides, Style, Loves (§4.2.1);
- the rider's line;
- a small closing note: "The crew always paddles out together: T-Bone and Grommet surf beside you."

**Moving focus:** LB/RB, ◀ ▶ or the d-pad move focus.
- The camera moves to the next rider (0.6 s ease-in-out).
- The panel's text cross-fades.
- The panel itself stays.

**The legend:** [A] Ride as Shazza · [B] Back. The confirm label carries the name.

**Confirm:** the rider steps forward half a pace with a big grin and the wave (the carry pose's reach dial). Their line
shows, then the beat moves on once the grin lands (about 0.7 s).

#### 4.2.1 The descriptors (copy, tunable at the gate)

| | Shazza (Sharon) | T-Bone (Tom) | Grommet (Bradley) |
|---|---|---|---|
| Stance | Regular | Goofy | Regular |
| Rides | Shortboard, step-up, bodyboard | Shortboard, step-up, bodyboard | Bodyboard |
| Style | Smooth lines. Reads the sets. | Goes hard. Gets barrelled or gets smashed. | Fearless. Drop-knee on everything. |
| Loves | Clean, long walls | Heavy, hollow days | Anything that breaks |
| Line | "Reckon it's pumping out there!" | "Let's get pitted." | "I'm getting the first one!" |

The stance and rides come from `PRESETS` (default stance, `boardsFor`). The copy lives in one table (`riderCopy.ts`).

### 4.3 Grab your gear

**Shot:**
- Only the chosen rider is in shot; the other two are hidden at the cut.
- A close 3/4 at 2.1 m, camera 1.35 m high, 30° off the rider's facing.
- The rider sits in the left half, the board's deck visible.

**Right: the gear panel.** A right-edge scrim, then the tabs `[LB] BOARD · OUTFIT [RB]`.

**The Board tab:**
- One row per board in the rider's quiver: the name, the length, the fit badge (IDEAL / GOOD / OK, §8), and on the
  rider's pick, "Shazza's pick" in orange.
- Below: the Paddle / Hold / Turn bars (5 skewed segments each).
- A specs line: `[RS] 5'10" × 18¾" × 2 5⁄16" · squash tail · thruster`. RS or R toggles the bars and the specs.
- Focus moves the rider's carried board to that board live, so you see it under their arm.

**The Outfit tab:**
- One row per outfit (§9).
- While this tab is open, the rider is shown in the focused surf outfit, with no walking clothes, hat or pack.
- Leaving the tab puts the walking clothes back on.
- A one-line note: "Looks only, no effect on your surfing."

**The rider's line** over the sky, left of the panel, says why they picked the board: "Clean four foot. Thruster,
easy." (§8).

**The legend:** [A] Choose · [B] Back · [START] Paddle out. The START entry is in sun orange.

## 5. Style guide (the AAA rules)

These are binding for every player-facing screen, from Appendix A's research. The dev panel (tweakpane) is exempt.

### 5.1 Canvas and safe area

- **Design size:** 1920×1080, uniformly scaled to the window by its height. On wider windows the extra width is margin;
  the layout anchors to the safe area's edges.
- **Safe area:**
  - **PC (browser and Steam desktop):** 3% (58 px × 32 px at 1080p).
  - **TV / Big Picture / Steam Deck mode:** 5% (96 × 54). Xbox requires ≥ 90% coverage.
  - **Settings:** a safe-area slider (2–10%) overrides both.
  - **What it covers:** every UI element, legend, title and map inside it.

### 5.2 Type

**Three faces, each with one job:**
- **Knewave** (OFL): titles, the name lockups, the map's break name.
- **Caveat Brush** (OFL): only words a rider says, and the real names.
- **Barlow Semi Condensed** (OFL; Barlow for long sentences): everything else.

**Sizes at 1080p** (glyph body height, checked by self-test):

| Use | Size (CSS px) | Weight | Notes |
|---|---|---|---|
| Titles | 76 | Knewave | |
| Name lockup | 128 | Knewave | |
| Values | 32–36 | SemiBold 600 | |
| Labels | 21 | Medium 500 | Caps, 0.14 em tracking, 72% opacity |
| Small numbers | 23 | Regular 400 | Tabular figures |
| Legend | 26 | SemiBold 600 | |
| Rider lines | 38–46 | Caveat Brush | |

- **No player-facing text below 18 px at 1080p.**
- **Text size setting:** 100–200%, which re-lays out the panels; it doesn't just zoom.
- **Case and alignment:**
  - sentence case for values and lines;
  - all caps only for labels of one or two words;
  - text left-aligned;
  - nothing centred except the name over a column.
- **Tabular figures:** self-hosted Barlow with `tnum` checked. If it lacks `tnum`, numbers sit in fixed-width slots.
- **Room for translation:** value slots fit 18 characters at 100% and fall back to the condensed width, never an ellipsis.

### 5.3 Colour and contrast

- **Brand palette:**
  - sun orange `#ef7d2e` (focus, confirm, the pick);
  - teal `#1d6b74` (the Knewave drop, the IDEAL badge);
  - cream `#f7ecd2` (text, the focus plate);
  - ink `#10171a`.
- **Scrims are directional gradients anchored to an edge.** No floating cards, glass blur or purple/blue gradients.
  - left scrim: 0 → 82% ink over 48% of the width;
  - right scrim: the mirror;
  - bottom scrim behind the legend.
- **Contrast:** text ≥ 4.5:1, large text ≥ 3:1, measured against the brightest patch behind it in the rendered frame
  (self-test, §15).
- **Opaque backplates** setting, for accessibility.

### 5.4 Focus and navigation

- **One focused element at a time,** shown four ways at once:
  - the cream plate with the orange bar;
  - a scale of 1.04;
  - full-opacity text (unfocused labels sit at 72%);
  - the focus tick (§12).
- **Never colour alone.** Hover moves focus. There are no hover-only reveals.
- **Wrapping:**
  - lists wrap top ↔ bottom;
  - cyclic values wrap: month, swell direction within its window, time stops;
  - non-cyclic values stop at their ends with a 3 px nudge and a dull tick.
- **Everything is reachable with a d-pad or arrow keys alone.** There are no dead ends: B always backs out.

### 5.5 The legend (button prompts)

- **Position:** bottom-right inside the safe area, in the same order on every beat: Y, X, A, B, START. Absent actions are
  left out, not greyed.
- **Glyphs** follow the last device that sent input (§10):
  - **Xbox:** A green, B red, X blue, Y yellow, on a dark disc with a cream ring.
  - **PlayStation:** Cross, Circle, Square, Triangle. Cross always confirms.
  - **Keyboard and mouse:** key caps (Enter, Esc, R, F, Q/E, Space).
- **The switch is instant,** with no animation.
- **Glyph artwork is drawn by us as SVG.** No platform trademarks beyond the face-button letters and shapes; Steam's own
  input glyphs can replace ours when the Steam build ships.

### 5.6 Motion

| What | Duration | Easing / detail |
|---|---|---|
| Focus move | 120 ms | ease-out (cubic); scale to 1.04 with ≤ 2% overshoot |
| Unfocus | 90 ms | |
| Value change | 140 ms | the old value slides 10 px out in the press direction, the new one slides in; that side's arrow nudges 4 px |
| Panel enter | 280 ms | ease-out; rows staggered 35 ms, at most 6 staggered |
| Panel exit | 180 ms | ease-in, all rows together |
| Camera between beats | 1.6 s | ease-in-out; the UI leaves first and the next beat's UI starts at 70% of the move |
| Rider focus move | 0.6 s | |

- A or B during a camera move skips to its end. Inputs are buffered.
- **Roll the dice:** each row ticks through 3–4 values over 240 ms, staggered 40 ms. The sky and sea follow after the
  last row lands.
- **Calm menus** (setting): camera moves become 200 ms cross-fades, and staggers, slides and nudges turn off.

### 5.7 Never

- frosted-glass cards;
- emoji or stock icon sets (weather, wind and tide glyphs are our own SVGs in the brand line weight);
- purple or neon gradients;
- Inter, Space Grotesk or Geist;
- everything centred;
- paragraphs of explanation;
- web form controls (dropdowns, radio buttons, checkboxes, sliders, browser focus rings);
- inconsistent spacing (an 8 px grid: rows 72–84, gutters 24, panel insets 48);
- more than one corner radius (0–3 px);
- keyboard glyphs while a pad is in hand;
- text baked into images;
- slow exits or bounce everywhere.

## 6. The conditions model

`sessionSetup.ts` converts between a `SessionSetup` (one choice per row) and `Conditions`. It's pure and fully tested.
Values written to `Conditions` stay inside `CONDITION_RANGES`.

### 6.1 Month

- **Values:** January … December, wrapping.
- **The small text** is the season (Summer Dec–Mar, Autumn Apr–May, Winter Jun–Sep, Spring Oct–Nov) plus a hint where it
  matters: "big swell season" for Jun–Aug, "sea breeze season" for Dec–Feb.
- **The date:** the 15th of the month in the next occurrence of that month (`Conditions.date`).

### 6.2 Time

- **Named stops:**
  - First light (sunrise + 15 min);
  - Morning (8:00);
  - Mid-morning (10:30);
  - Midday (12:30);
  - Arvo (15:00);
  - Late arvo (16:30);
  - Sunset (sunset − 20 min).
- **Sunrise and sunset** come from `sunPosition` for the date at the Womb.
- **The small text** is the clock time.
- **LT / RT** scrub in 15-minute steps between First light and Sunset.
- **Never night.**

### 6.3 Sky

The weather presets the game has:
- Clear;
- Fair;
- Scattered;
- Broken;
- High cloud;
- Overcast;
- Grey;
- Drizzle;
- Showers;
- Rain;
- Storm;
- Sea mist.

**Labels** are sentence case ("Few clouds" for scattered). Each gets its own glyph. **The small text** is the cloud cover.

### 6.4 Wind

The coast faces west, so offshore is easterly. Speeds below are in knots; `Conditions` stores m/s.

| Word | From | Speed (kn) | Note |
|---|---|---|---|
| Glassy | — | 1 | direction irrelevant |
| Light offshore | E | 6 | |
| Strong offshore | E | 18 | |
| Cross-offshore | SE | 10 | |
| Cross-shore | S | 12 | the summer sea breeze's start |
| Onshore | SW | 15 | the sea breeze |
| Blown out | W | 22 | |

**The small text:** "6 kn E".

### 6.5 Swell size and period

| Word | Size (ft) | Default period (s) |
|---|---|---|
| Flat-ish | 1–2 (1.5) | 9 |
| Small | 2–3 (2.5) | 11 |
| Fun | 3–4 (3.5) | 13 |
| Solid | 5–6 (5.5) | 14 |
| Pumping | 6–8 (7) | 15 |
| Big | 8–10 (9) | 16 |
| Huge | 10–12 (12) | 17 |

- **LT / RT** fine-tune in ½ ft steps inside the band. The word follows the size.
- **X opens Period** as an extra row under Swell: 8–20 s in 1 s steps. The words are Wind swell (< 10), Mid (10–13) and
  Groundswell (≥ 14).
- **The small text:** "4 ft · 15 s".

### 6.6 Swell direction ("From")

The break's sane window: SSW 202°, SW 225°, WSW 247°, W 270° and WNW 292°. It wraps within the window. **The small text:**
"SW 225°".

### 6.7 Tide

- **Values:** Low (−0.5 m), Low, pushing (−0.25 m, rising), Mid (0, rising), High (+0.5 m), Mid, dropping (0, falling),
  Low, dropping (−0.25 m, falling).
- The south-west coast is micro-tidal, about a metre of range.
- **The row's mini tide curve** puts a dot on the stop.
- **The small text:** "0.0 m".
- Rising and falling are display-only until the game models tidal flow.

### 6.8 Presets

| Preset | Month | Time | Sky | Wind | Swell | From | Tide |
|---|---|---|---|---|---|---|---|
| Dawn glass | Apr | First light | Clear | Glassy | Fun | SW | Mid |
| Winter offshore | Jul | Mid-morning | Clear | Light offshore | Solid | SW | Low, pushing |
| Big winter swell | Jul | Midday | Scattered | Light offshore | Big | WSW | Mid |
| Fun arvo | Mar | Arvo | Fair | Cross-offshore | Fun | SW | High |
| Summer sea breeze | Jan | Late arvo | Fair | Onshore | Small | SW | Mid, dropping |
| Moody and grey | Aug | Morning | Grey | Light offshore | Pumping | W | Mid |

- Editing any row shows "Custom" as the preset. Choosing a preset sets every row.
- **The first-ever default** is "Winter offshore".

### 6.9 Roll the dice (Random)

- **Seeded:** the result is a pure function of the seed, so a roll can be shared.
- **Draws:** the month uniformly, then month-weighted climatology:
  - Jun–Sep: swell Solid–Huge, mostly offshore mornings.
  - Dec–Mar: Small–Fun, onshore arvos 40% of the time.
  - Shoulder months: in between.
  - Time: one of the stops.
- **Never:**
  - night;
  - Storm, Rain or Sea mist;
  - Blown out;
  - Huge at Low tide (it breaks outside over the flat);
  - Flat-ish with Onshore.
- **Test:** 10 000 seeds produce no excluded combination, and every allowed value appears.

### 6.10 Applying to the world

- Edits apply to the App's `Conditions` 200 ms after the last change.
- A heavy rebuild (set waves, the swell spectrum) happens at most once per 200 ms, never per key repeat.
- The sky and sea change live behind the UI.

## 7. The map of the break

**Placement and frame:**
- Top-right inside the safe area;
- 448 × 336 px;
- an ink-dark sea;
- a 5 px sun-orange top rule;
- hard corners.

**The main view**, north up, at about 4.6 m per pixel, centred on the reef:
- **The reef:** its 3 m (dashed), 6 m and 9 m depth contours.
- **The land:** sand tone with the beach line in cream, and the dune's 20 m contour.
- **The peak:** an orange dot with "The Womb" in Knewave.
- **The lookout:** a cream dot labelled LOOKOUT, where the crew stand.
- **A 250 m scale bar and a north arrow.**

**The swell:**
- three orange crest lines square to the swell direction, the nearest brightest;
- an arrow along the direction of travel;
- the label "SW · 4 FT · 15 S";
- the crests' spacing scales with the period and their weight with the size.

**The wind:**
- arrows across the coast in the wind's direction, labelled "E · OFFSHORE";
- Glassy shows no arrows, only the word "GLASSY".

**The inset:**
- a 78 px strip on the right with the regional coastline and the break boxed in orange;
- labels running vertically (GRACETOWN, MARGARET R.).
- **This step:** the strip comes from the game's terrain ring (30 km, Gracetown to the Margaret River mouth).
- **In the build:** it extends to Naturaliste–Leeuwin from SRTM tiles at zoom 9–10, from the same Tilezen/Mapzen
  terrarium source as `womb-land.bin` (public-domain SRTM; attribution already in `public/terrain/CREDITS.md`). That bake
  downloads tiles once, so Andrew is asked before it runs. If declined, the 30 km strip ships.

**Where the shapes come from:** baked at build time by `tools/bakeBreakMap.ts`:
- the land from `womb-land.bin`;
- the reef from `buildBathymetry(DEFAULT_REEF_PARAMS)`;
- traced into simplified SVG paths with marching squares and Douglas–Peucker;
- written to `public/ui/breakMap.json`.

No third-party map imagery is traced; Google's terms forbid derived maps in a product.

**Live:** the swell and wind layers re-render on each change (transform only), with the 140 ms value-change motion.

**Text in the map:** at least 18 px on screen.

## 8. The board pick

`boardPick.ts` is pure and tested. For each board in the rider's quiver, a fit for the conditions:

| Board | IDEAL | GOOD | OK |
|---|---|---|---|
| Thruster | 2–6 ft | 6–8 ft, or 1.5–2 ft | otherwise |
| Step-up | 6–12 ft | 5–6 ft | otherwise |
| Bodyboard | 1.5–6 ft, or any size with period ≥ 14 s and size ≤ 8 ft (hollow) | otherwise | — |

- **The rider's pick:** the IDEAL board.
- **Ties:** the rider's own taste breaks them (Shazza and T-Bone take the thruster before the bodyboard). Grommet always
  takes his bodyboard.
- **The reason line** is the rider's voice with the size word filled in: "Clean four foot. Thruster, easy." / "Solid and
  hollow, I'm taking the step-up." Each rider has three or four lines per band, chosen by seed.

**The bars:** 5 segments each, from the board's real numbers, normalised over the three presets' quivers:
- **Paddle:** volume.
- **Hold:** length × the rail line.
- **Turn:** the inverse of length.
- A bodyboard scores on its own scale: Paddle by area, Hold by the rails' bite, Turn high.

**The specs line:** `5'10" × 18¾" × 2 5⁄16" · squash tail · thruster`, from `BoardDims` and `BoardSpec`.

## 9. The outfit

- **The rows:** each rider's three surf outfits (`PRESETS[...].outfits`):
  - Shazza: Bikini, Rash vest and bottoms, Short-arm steamer.
  - T-Bone: Boardies, Springsuit, Short-arm steamer.
  - Grommet: Rash vest and boardies, Springsuit, Short-arm steamer.
- **The default:** the month's outfit (`outfitFor(p, 'season', date)`), marked "for July". There's no block: a bikini in
  July is allowed. The rider's line teases ("Bit brave, Shaz.") from a mate.
- **Remembered** per rider.
- **The preview:** the Outfit tab shows the rider in that outfit, dry, on land. `wearsSwimFins` stays false on land.

## 10. Input and glyphs

**`uiInput.ts` maps every device to the same actions:**
- up, down, left, right;
- confirm, back;
- random (Y), details (X), fine− (LT), fine+ (RT);
- tab− (LB), tab+ (RB);
- toggle (RS);
- start.

| Action | Pad | Keyboard | Mouse |
|---|---|---|---|
| Move | d-pad, left stick (0.5 threshold) | arrows, WASD | — |
| Confirm | A | Enter, Space | click |
| Back | B | Esc, Backspace | — |
| Random | Y | R | — |
| Details | X | F | — |
| Fine− / Fine+ | LT / RT | — | — |
| Tab− / Tab+ | LB / RB | Q / E | — |
| Toggle | RS | Tab | — |
| Start | START | P | — |

- **Repeat on hold:** 250 ms delay, then every 80 ms.
- **The mouse:** hover focuses, click confirms; clicking ◀ ▶ changes the value; the wheel over a focused row changes it.
- **Gamepads** come from the Gamepad API, polled each frame.
- **The device family** for glyphs comes from the pad's `id` (Sony / DualShock / DualSense → PlayStation; otherwise
  Xbox). The last device that sent input chooses the glyph set.
- **Keys typed into the dev panel's fields are ignored** (`shouldIgnoreKeyTarget`).
- **The existing camera keys and dev hotkeys are suspended** while the front end is open.

## 11. Settings

A small Settings overlay on Back + START. It uses the same widgets and is stored with the dev settings mechanism's
storage, but in a player-facing key. It holds:
- Text size (100–200%);
- Calm menus;
- Opaque backplates;
- Safe area (2–10%, defaulting to 3% PC or 5% TV);
- Display mode (PC / TV);
- Glyphs (Auto / Xbox / PlayStation / Keyboard).

## 12. Sound

**UI sounds are synthesised in WebAudio** (licence-clean, no samples). They run on a new UI bus beside the existing groups
in `AudioEngine`, mixed under the master volume.

| Sound | Length | Character |
|---|---|---|
| Focus tick | 40 ms | a soft wooden click, about −12 dB under confirm, ±1 semitone random pitch |
| Value tick | 40 ms | pitch rises with the value (+1 semitone per step up) |
| End of range | — | a dull thud |
| Confirm | 250 ms | a warm board-knock (low resonant body plus a short bright tap) with a wax-scrape tail (filtered noise) |
| Back | 150 ms | lower, falling |
| Camera swing | the move's length | a soft wind and swell whoosh |
| Rider pick | — | the confirm sound, ducked under the rider's line (VO hook: `voice(lineId)` plays a file if one exists; none ship in this step) |

- **Haptics:** one 40 ms light pulse on confirm (`vibrationActuator` where supported). Nothing on focus moves.
- **The music hook:** the front end asks `SoundSystem` for the "front end" track slot. With no file, it plays nothing.

## 13. The riders on the select screen

- **New land pose, `selectStand`:** one per rider, replacing the carry pose for this screen. Natural, relaxed and cool:
  - weight on one leg, the other knee soft (contrapposto), hips and shoulders counter-tilted 4–8°;
  - the board tucked close under the carry arm (the carry's armpit and forearm contacts kept, the board closer to the
    body);
  - the free arm relaxed, the hand loose at the thigh or resting on the board's rail.
- **Each rider's character in the stance:**
  - **T-Bone:** loose and confident. Weight back on the rear leg, chin up, the free hand hooked in the boardies' pocket
    line. This fixes his awkward stance (Andrew).
  - **Shazza:** relaxed and poised, hip out, looking at the sets.
  - **Grommet:** bouncy, up on his toes, the bodyboard hugged.
- **An idle loop on each stance,** 4–8 s, with small secondary motion and the existing breathing and blinking:
  - T-Bone rolls a shoulder;
  - Shazza tucks her hair behind her ear;
  - Grommet bounces on his toes and pushes his glasses up.
- **The camera beats:**
  - **Conditions:** they face the sea.
  - **Choose your rider:** they turn to the camera in 0.8 s, a stepping turn, not a spin.
  - **Grab your gear:** the chosen rider only.
### 13.1 Faces and hair at select-screen distance

**Status (2026-10-03):** built and merged with the face-hair work (main 0f00cbc): the two-pass hair, the staggered lock
turns, the hairline, the curtain locks, the top lip, the strand atlas and Shazza's braids (§13.2). The skin's wrap and
cavity terms were already in from step 2. **Still to build in this step:** the authored select expressions (`grin`,
`stoked`, `easy`) and the face sheets at Gate A. The rest of this section is kept as the record.

Andrew: "Shazza's face looks messed up" (the mockup's beat-3 frame). Diagnosed at 0.6 m on the dune in daylight:
- **The forced grin:** the captures drove the raw manual dials (smile 0.85 + brows 0.5 + jaw 0.12). The smile unit pulls
  the mouth sideways and puffs the cheeks, a lopsided smirk. These camera distances were never gated with that mix.
- **The dry hair's hairline:** a hard-edged shell over the forehead with streaky painted strands, reading as a helmet.
  The step-2 close-up gate judged the wet hair in the water; the dry hair on land (step 3) was judged only at full-body
  distance.
- **The skin:** flat in full daylight; it reads plastic at 2 m. The lips are over-full and over-glossy at this light.

**Andrew's second look** (a front close-up, 2026-10-02): "Her top lip is a bit too big and her hair isn't rendering
correctly." Root causes, found by reading the build and the shader, not guessed:

1. **The hair has no antialiasing to resolve its dithered alpha.**
   - The renderer runs with `antialias: false` and no TAA.
   - `hairMaterial` alpha-tests the cards (0.5) and fades their roots, tips and the dry strand lanes with a screen-space
     hash (interleaved gradient noise).
   - That technique relies on TAA or MSAA to average the dots. Without it the dots show raw, and the gaps let the bright
     sky through. Against a sea background (the step-2 gate) it passed; against the sky it reads as streaky stipple.
   - The cards on the head's shaded side are lit only by the blue sky ambient (`lit` ≈ 0). Seen through the gaps, they
     make dark blue-grey sheets around the head.
2. **A straight cut across the side hair at brow height.** In `hair.py`'s `_wave`, every lock switches from hugging the
   scalp to falling straight down at one height (`eye_z − 0.02`). All the locks crease on the same horizontal line.
   Below it, the falling cards beside the cheeks hang nearly edge-on to a front camera and thin to slivers. The Blender
   sheet `female-walking-face.png` shows the same edge, so it's in the geometry, not the shader.
3. **The top lip:** the face targets add `mouth-cupidsbow-incr 0.5` with nothing reducing the upper lip, and the gloss
   (0.45) catches the sun on its full curve.

**The fix (this step):**
- **Hair rendering: two passes** (the standard forward-renderer hair technique without TAA):
  - **Pass 1:** the opaque core. Alpha ≥ 0.9, alpha-tested, depth-writing, no dither.
  - **Pass 2:** the soft edges. Alpha below 0.9 (the root fades, tips, strand-lane gaps and card edges) alpha-blended
    over pass 1, depth-tested, not depth-writing, the cards drawn back to front by their distance from the camera
    (sorted per frame by card centre; at most a few hundred cards per rider).
  - The screen-space dither goes.
  - **The alternative, measured before choosing:** MSAA with alpha-to-coverage on the surfer pass. It's weighed on cost,
    since the scene pass renders to targets.
  - **The shaded side gets the hair's own bounce:** an ambient tinted by the hair albedo and the baked AO, not only the
    sky's blue, so the shade side reads as dark blond, never grey-blue.
- **Hair geometry:**
  - Each lock gets its own transition height (seeded, ±3 cm around the ears), so no line is shared.
  - The turn from scalp to fall blends over about 5 cm instead of switching in one step.
  - The cards in the fall beside the face are twisted to face forward and out (their normal blended toward the face's
    forward direction by up to 60°), so they read as hair from the front instead of thinning to slivers.
  - **The hairline:** short fine fringe and baby-hair cards along it, fading into the painted scalp, so the shell's edge
    is never seen.
- **Hair shading:** per-card root-to-tip colour and the two strand highlights are kept. The painted streaks are softened
  so the strands read through the lighting, not a texture.
- **The top lip (starting values, tuned at the gate):**
  - `mouth-upperlip-volume-decr` 0.35;
  - `mouth-upperlip-height-decr` 0.15;
  - `mouth-cupidsbow-incr` 0.5 → 0.35;
  - Shazza's `lipGloss` 0.45 → 0.25 in direct sun.
  - She is then rebuilt (`npm run build:surfers -- --only female`), and checked beside her gate-2 face so she stays as
    pretty.
- **Authored select expressions** per rider, replacing raw dial mixes:
  - `grin` (a natural, symmetric open smile, eyes engaged: a slight squint and cheek raise);
  - `stoked` (the pick);
  - `easy` (the idle's resting look).
  Each is a tuned blend of MPFB expression units with left/right symmetry enforced, checked front and 3/4 at 0.6 m and
  2 m.
- **Skin in daylight:**
  - a soft wrap (subsurface-like) term;
  - cavity and AO darkening at the nostrils, lip line, eyelids and hairline.
- **These apply to all three riders** wherever they show dry hair (T-Bone's and Grommet's under their hats too).
- **A self-test:** at 0.6 m against the sky, the hair's silhouette band has no pixel brighter than the hair's lit
  albedo by more than the highlight allows (catches sky showing through as stipple).
- **The gate:** Gate A adds a face sheet per rider (front and 3/4 at 0.6 m and at the beat-3 distance, the three select
  expressions, in morning and midday light), beside the step-2 approved close-ups. Andrew's step-2 brief still holds:
  "Make sure you make the female pretty".

### 13.2 Hair v2: a baked strand atlas, and Shazza's braids

Andrew, 2026-10-02, after the §13.1 fixes ("significantly improved"): asked for a shortcut to good hair, then chose the
free route (Blender's curve hair and our own baked atlas, over the paid Hair Tool or MakeHuman's CC0 hair). With it:
"Can we make Shazza's hair with low pig tail braids either side please?" Reference photo:
`reference/surfer/shazza-braids-ref.webp` (git-ignored, never published).

**The strand atlas:**
- `tools/surfer/hair_atlas.py` grows real strands as Blender curves on flat tiles and renders them orthographically into
  one 2048² RGBA texture, `public/surfer/hairAtlas.png`. It is ours, made by the build.
- **Channels:** R coverage (alpha); G root → tip (0 at the root); B a random per strand (its shade); A depth (strands in
  front 1, behind 0, for self-shadowing).
- **16 tiles** (256 × 1024 px each, padded 8 px for mipmaps), each a lock of 40–90 strands, about 1 cm wide and the
  card's length:
  - straight;
  - straight dense (a lock's core);
  - loose wave;
  - fine flyaways;
  - frayed tips;
  - fringe and baby hairs (short);
  - braid strand (a twisted, plaited bundle's surface);
  - tails (below a hair tie);
  - two to three variants of each.
- Strand thickness is about 70 µm, with tapered tips and random gaps.

**The cards:**
- They keep today's shapes, but each card picks a tile by its role (core, outer, flyaway, fringe, braid, tail) and maps
  its UVs into it: u across the tile, v root → tip.
- A card's tile index and role are written to COLOR_0.a (the free channel).

**The shader (`hairMaterial`):**
- Coverage is the atlas alpha × the root fade, still in two passes (§13.1). Alpha mips are sharpened by `fwidth`, so
  distant hair doesn't thin out.
- Albedo comes from root → tip along the strand plus the per-strand random, replacing the noise lanes.
- Depth darkens the strands behind.
- The two highlights keep their strand tangent from the UVs.
- The atlas is loaded once and shared by all riders.

**Shazza's braids** (dry, and wet in the water: she surfs in the braids she walks down in, Ruling 2026-10-02):
- **Part and front:** a centre part. The hair is combed down and back over the ears to each braid's start, and the
  loose face-framing pieces (the curtain locks of §13.1) fall from the front hairline beside her cheeks to the jaw.
- **The braids:**
  - Two low braids, one each side, starting behind and below the ear at about jaw height.
  - They hang forward over the front of the shoulders onto the upper chest, about 25 cm.
  - Each is three interwoven strands (the classic 3-strand plait: each strand's lateral offset a sine at 120° phases,
    its depth twice that frequency, so each crosses over the middle in turn).
  - Each strand is a tube of six cards, so the braid has volume from every side, with flyaways.
- **The ends:** a small elastic (a torus, 6 mm, material `hairTie`), then a 4 cm loose tail fanning out.
- **Wet:** the same braids, darker and tighter. The front pieces are slicked back behind the ears.
- **Skinning:** the braids follow the head, then the neck, then spine_03 and the clavicle on their side. The build
  pushes them clear of the body, the tee, the bikini straps and the pack straps.
- **Checks in the manifest:**
  - both braids exist;
  - their ends at the upper chest, below the clavicle and above the bust;
  - no braid or tail vertex inside the body (the outside check);
  - the elastics present.

**All three riders** get the atlas on their dry and wet hair (T-Bone's short and capped, Grommet's curls and bucket),
and are rebuilt.

**The gate:** close-up sheets at 0.6 m and 2 m, front, 3/4 and back, dry and wet, for each rider. Shazza's braids go
beside the reference photo.

- **"Be careful everything renders"** (Andrew's standing rule): every limb is visible and nothing passes through a body or
  a board. This is checked by the pose sweep tests, extended to `selectStand` and its idles.

## 14. Architecture and files

**New, in `src/frontend/`:**

| File | Role |
|---|---|
| `frontEnd.ts` | the state machine: beats, focus per beat, Back, START, the transition queue; pure, tested |
| `sessionSetup.ts` | `SessionSetup` ↔ `Conditions`, the tables, presets, Random; pure, tested |
| `boardPick.ts` | fits, the pick, reason lines, bars, the specs line; pure, tested |
| `riderCopy.ts` | descriptors and lines; tested for completeness |
| `uiInput.ts` | devices → actions, repeat, device family; the pure part tested |
| `glyphs.ts` | glyph SVGs per family and action |
| `beatCamera.ts` | each beat's shot from the rider spots and the ground; moves and easing; pure, tested |
| `FrontEnd.ts` | owns the DOM root, the components, the camera moves and the rider staging; the App calls `open()`, `update(dt)`, `close()` |
| `ui/valueRow.ts`, `ui/tabs.ts`, `ui/legend.ts`, `ui/slidePanel.ts`, `ui/boardList.ts`, `ui/breakMap.ts`, `ui/riderLine.ts` | the components |
| `ui/frontEnd.css` | tokens and styles (the §5 numbers as CSS custom properties) |
| `uiSounds.ts` | the synthesised UI sounds on the UI bus |
| `frontEnd.selftest.ts` | the GPU and DOM self-tests (§15) |

**Fonts:** `public/fonts/` (Knewave, Caveat Brush, Barlow Semi Condensed and Barlow; woff2 plus OFL.txt each).

**The map:** `tools/bakeBreakMap.ts` writes `public/ui/breakMap.json`.

**Changed:**
- **`App.ts`:**
  - opens the front end after prewarm unless skipped (§3);
  - `applySession(choice)` for Paddle out;
  - the gang lineup is staged by the front end.
- **`GangLineup.ts`:** per-rider visibility, heading and pose overrides (the turn, `selectStand`, the step forward).
- **Rider poses:**
  - `poses.ts` and `poseNames.ts` gain `selectStand` and the idle channel;
  - `rideState.ts` and `faceControl.ts` get the entries.
- **Rider clothes:** `Surfer.ts` / `SurferStand.ts` can show a surf outfit dry on land for the Outfit preview.
- **`SoundSystem.ts` / `AudioEngine.ts`:** the UI bus and the music slot.
- **`DevPanel.ts`:** a "Front end" button.
- **Faces (§13.1):** `faceControl.ts` gets the authored select expressions. (The hair, the hairline, the lip and the skin
  terms are already built.)
- **`main.ts`:** the `?frontend=off` skip.

## 15. Testing and gates

**Unit tests (vitest):**
- **`frontEnd`:** every beat reachable; Back from each; START from each fills the defaults; focus remembered.
- **`sessionSetup`:**
  - the round trip of every value;
  - every value inside `CONDITION_RANGES`;
  - the time stops inside daylight for all 12 months;
  - presets valid;
  - "Custom" on edit;
  - Random over 10 000 seeds.
- **`boardPick`:**
  - the fit table at band edges;
  - Grommet always his bodyboard;
  - one pick per rider per condition;
  - the bars normalised to 1–5;
  - the specs line formatting (fractions).
- **`uiInput`:** the repeat timing, the stick threshold, device-family detection from real pad ids, the last device
  winning.
- **`beatCamera`:**
  - each shot's projected rider bounding box lands in its region (Choose your rider: the centre x in 28–38%, the head in
    15–35% from the top);
  - the camera stays above the ground, and its ground point is inside the clearing or a track corridor (`tracks`); the
    Conditions shot's camera (3.8 m behind the riders) stands in the clearing or over the Cape to Cape.
- **`riderCopy`:** every rider has every field and at least three lines per board band.

**In-browser self-tests (`?selftest=frontend`, real DOM and GPU, at 1920×1080 and 1280×800):**
- No visible text below 18 px (computed from the layout boxes' font metrics).
- Every UI element is inside the safe area.
- **D-pad reachability:** every focusable is reached by arrow presses alone, and B leaves every beat.
- **Contrast:** for each text box, the brightest 5% of rendered pixels behind it (scene read back with the UI hidden) is
  ≥ 4.5:1 against the text colour (3:1 for large text).
- **The faces:** in each beat's shot, nothing (heath, board, another rider) covers the focused rider's face, checked by
  raycasting from the camera to the head.
- **Glyph swap:** a synthetic pad press switches every legend glyph to the pad set.

**Pose sweeps:** `selectStand` and its idles for all three riders, with the existing contact and penetration checks.

**Gate A, stances and shots:**
- 1080p captures of each beat for each rider over the dune-up-close environment;
- T-Bone's stance beside the old one;
- the face sheets (§13.1);
- the idles as short clips.

Andrew signs off before the UI is wired to the shots.

**Gate B, the screen:** Andrew drives the whole flow in the browser with a controller and a keyboard. Fixes from his
notes, then the merge with his OK.

## 16. Licences (Steam: CC0 or project-made, or OFL fonts shipped with their licence)

- **Fonts:** Knewave (Tyler Finck), Caveat Brush (Impallari Type), Barlow (Jeremy Tribby), all SIL OFL 1.1. Self-hosted
  with `OFL.txt` beside each, and listed in `public/surfer/LICENSES.md`'s successor `public/LICENSES.md`.
- **The map:** the game's own terrain (SRTM public domain via Tilezen/Mapzen, as credited) and our reef model. Drawn by
  us.
- **UI sounds:** synthesised. **Glyphs:** drawn by us.

## 17. Assumptions to confirm at review

1. The first-ever preset is "Winter offshore" and the first-ever rider focus is Shazza.
2. The tide range uses the real coast's ~1 m (Low −0.5 m to High +0.5 m), not the dev panel's ±1.5 m.
3. The descriptor copy and lines in §4.2.1 and §8 are a first draft for the gate.
4. Settings open on Back + START. A Settings entry in the legend is the alternative.

## Appendix A: research sources (2026-10-02)

- XAG 101 (text), 102 (contrast), 112 (navigation), 117 (motion)
- Steamworks: Steam Deck compatibility; Steam Input best practices
- SMPTE / title-safe areas
- **Studied titles:**
  - Microsoft Flight Simulator 2020/2024 (conditions panel over the world; presets plus custom; HTML UI via Coherent)
  - F1 22 (named time and weather stops; Random)
  - Gran Turismo 7 (time stops)
  - EA PGA Tour (conditions in words)
  - Tekken 8 (select idles with character)
  - Street Fighter 6 (per-character name lockups; the confirm pose plus a line)
  - Tony Hawk's Pro Skater 1+2 (rider plus stats panel)
  - Forza Horizon 5 (fit badge and stat bars; the right stick toggles stats and specs)
  - Riders Republic (gear and outfit tabs on bumpers)
  - Mario Kart World (outfits as a sub-choice, a warning)
  - Barton Lynch Pro Surfing (legible conditions UI)
- **Fonts:** Barlow (github.com/jpt/barlow), OFL

The research brief, with its links, is in the session's ledger. The rules above are the binding extract.
