# Board quiver: a starting list

For Andrew, 2026-10-07. A first pass at a wider choice of boards, each with a real trade-off, so picking the right one
for the day matters. Nothing here is built yet; it's for you to cut, rename and reshape.

## Where the game is today

- **Three boards:**
  - T-Bone and Shazza each have a **thruster** (6'0"/5'10") and a **step-up** (6'8"/6'4").
  - Grommet has a **bodyboard** (38").
- **The Gear screen badges each board IDEAL or GOOD** for the swell, from a simple size-and-period rule
  (`src/frontend/boardPick.ts`).
- **As far as I can see, the ride doesn't use the board's size yet.** Board choice is mostly a look and a badge. Making
  boards *ride* differently is its own gameplay project (a handling model per board). The attributes below are what
  that model would read.

## The attributes (what each one would do in the game)

| Attribute | Comes from | What the player feels |
|---|---|---|
| **Paddle** | volume (length × width × thickness) | how early and easily you catch a wave, and how fast you get back out |
| **Speed** | length, flat rocker, wide tail | speed down the line and through flat sections |
| **Turn** | short length, more rocker, wide/square tail | how sharply and quickly it turns |
| **Hold** | narrow pin tail, length, rail | grip in steep, hollow, big waves, and late drops that don't spin out |
| **Forgiveness** | volume, width, soft rails | how much a bad pop-up or wobbly turn is forgiven |
| **Best swell** | — | the size range where it gets the IDEAL badge |

Scores out of 10. Swell in feet, wave face. Sizes are T-Bone's (Shazza's would be an inch or two shorter and narrower).

## The list

| # | Board | Size (example) | Paddle | Speed | Turn | Hold | Forgive | Best swell | Its personality | Deck colour idea |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Soft-top (foamie)** | 8'0" × 22" × 3¼" | 10 | 4 | 3 | 2 | 10 | 1–3 ft | catches everything, impossible to fall off, useless once it's steep. The learner's board, and a laugh on tiny days | pale blue foam, white stripe |
| 2 | **Longboard** | 9'2" × 22½" × 2¾" | 10 | 7 | 2 | 3 | 8 | 1–4 ft | glides, trims, can walk the nose; slow to turn and hopeless in the barrel | cream with a wood-grain stringer |
| 3 | **Mid-length (egg)** | 7'0" × 21" × 2⅞" | 8 | 7 | 5 | 4 | 8 | 2–5 ft | the easy cruiser: long smooth lines, early entry | sage green, rounded pin |
| 4 | **Fish (twin keel)** | 5'6" × 21" × 2½" | 7 | 9 | 7 | 3 | 6 | 1–4 ft | flies through weak sections, skatey; spins out on steep faces | white with a red fade, swallow tail |
| 5 | **Groveller (hybrid)** | 5'8" × 20" × 2⅝" | 7 | 7 | 8 | 4 | 6 | 2–4 ft | the small-day shortboard: lots of foam, snappy | yellow rails |
| 6 | **Thruster (shortboard)** *(exists)* | 6'0" × 19¼" × 2⁷⁄₁₆" | 4 | 7 | 10 | 6 | 3 | 3–6 ft | the all-rounder for good waves: the sharpest turns, demands a good pop-up | white, blue pin line |
| 7 | **Step-up** *(exists)* | 6'8" × 19½" × 2⅝" | 5 | 8 | 7 | 8 | 4 | 5–8 ft | a thruster stretched for bigger days: more paddle, more hold, still turns | white, orange pin line |
| 8 | **Semi-gun** | 7'2" × 19¼" × 2¾" | 6 | 9 | 5 | 9 | 4 | 8–12 ft | the Womb's big barrel days: early entry, late drops, holds a line deep in the tube | white, black rails |
| 9 | **Gun** | 8'0" × 19½" × 3" | 7 | 10 | 3 | 10 | 3 | 12 ft + | only for the biggest swells: gets you in before it breaks, holds anything, turns like a bus | pale yellow, red pin tail |
| 10 | **Bodyboard** *(exists, Grommet)* | 38" × 20" × 2½" | 6 | 6 | 8 | 7 | 9 | 1–8 ft | prone and fins: drops into anything, slots into the barrel, can't stand up | yellow and blue |

## Who'd carry what (a suggestion)

- **T-Bone:** thruster, step-up, semi-gun, fish. He's the one who charges the big days.
- **Shazza:** thruster, step-up, mid-length, longboard. The smooth stylist.
- **Grommet:** bodyboard, soft-top. He's 13; the foamie is for when he wants to try standing.

With 4 boards each, the Gear screen's board tab stays a short list. Boards outside a rider's quiver could unlock later
(a reason to keep coming back).

## How the badge would change

Today's rule is size-and-period only. With these attributes the fit could become:
- **IDEAL** inside the board's best swell;
- **GOOD** one or two feet either side;
- **TOUGH** beyond that (e.g. a fish on a 10 ft day, a gun on 2 ft).

Plus a one-line reason in the rider's voice ("Too gutless for the fish, mate").

## Images

One per board, deck view, same framing for all: prompt C in `select-screens-prompt-pack.md`. Size consistency is
handled by the game: it scales each picture by the board's real length.
