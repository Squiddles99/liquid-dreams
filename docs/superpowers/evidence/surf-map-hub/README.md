# Title and surf map hub (build 1 of 3): evidence

Branch `surf-map-hub`. Spec: `docs/superpowers/specs/2026-10-09-surf-map-hub-design.md`. Plan:
`docs/superpowers/plans/2026-10-09-surf-map-hub.md`. Not merged: Andrew decides.

## Captures (1920×1080, `npx electron tools/captureHub.mjs`)

| File | What it shows |
|---|---|
| `hub-title.png` | The title: chart close-up between Gracetown and the river mouth, emblem and wordmark, Surf · Online (coming soon) · Settings · Quit (Quit only in Electron) |
| `hub-map-forecast.png` | The map on today's game forecast (Off today: swell from the W, tide too low) |
| `hub-map-custom-glassy.png` | Custom, 7 ft @ 15 s WSW, glassy, mid tide: **On** ("WSW swell and glassy"), no wind arrows |
| `hub-map-custom-offshore.png` | Same swell, light offshore E: **On** ("WSW swell and an offshore E wind"), arrows blow west |
| `hub-map-custom-onshore.png` | Same swell, onshore SW: **Fair** ("Wind onshore from the SW") |
| `hub-map-custom-off.png` | 2.5 ft, onshore: **Off** ("Swell too small · Wind onshore from the SW") |
| `hub-details.png` | The details page: hero capture, name, verdict; the seven sections |
| `hub-details-scrolled.png` | The same, two steps down (the text fades at the edges it runs past) |

Other evidence in this folder:
- `womb-research.md`: 26 sources, per section, with the contested and single-source points.
- `claims-report.md`: the Womb's claims against the game.
- `boot-check.md`: the boot by hand (title paint time, a press before the App exists, Esc and Enter round trips).

## The Womb's claims (`npm run claims` → `src/breaks/womb.claims.json`)

**Pass:**
- left: 7 ft WSW mid, 28/28 broken, peel 15.8 m/s
- barrels: hollow 1.00
- best swell: SW–WSW breaks at 225° and 247°
- best wind: the game's offshore is 90°, inside NE–E
- best tide: mid and high break for Solid, Pumping and Big

**Off screen (no game check yet):**
- short and punchy
- meets a section the other way
- best size (3–5 ft start, best over head height)

**For Andrew** (details in `claims-report.md`):
1. The swell range was narrowed from SSW–WSW to **SW–WSW**. 202° doesn't break well in the game, and the two source
   groups only agree on SW–WSW.
2. The best-wind check now leaves out **Cross-offshore** (SE). The spec's check says "the game's offshore direction",
   and the sources say NE–E.

## Planning rulings (from the plan's header)

1. The details page scrolls with up/down, the arrow keys and the wheel (not the right stick).
2. The coastline credit sits on the map. In the build it's UI text in the left column, because a 4:3 window crops the
   chart's edges. It's also in `public/LICENSES.md`.
3. "Today's forecast" is a daily roll seeded by the date in AWST, then `offeredSetup`.
4. Claims with no game check are written as failed, "no game check yet", so they stay off screen.
5. The Library tab is on the map but locked: LB/RB shows "Library: coming soon".

The executor's own rulings are in the session's final message and the commit messages.

## Known reds (not from this branch)

- **Two front-end self-tests on the gear panel were red before this branch** (checked with the old `frontEndPage.ts`
  copied back):
  - "rows 2/6/2";
  - "outfit: ticked 4, want 2".
- **The full `npx vitest run` has about 60 reds** in breaker, seabed, heath, land, surfer and whitewater. None of those
  files imports anything this branch adds.
- **`tools/_selftest.mjs` can stall** when its window is occluded, because background throttling is on. A copy with
  throttling off ran the same tests clean.

## Left for later builds

- **Build 2, the Library (Codex layout, mockup B):** the 66 flora and fauna slides with their cards, behind the map's
  Library tab (LB/RB). Its own spec.
- **Build 3, the studio screen** before the title (needs the art). Its own spec.
- **Real-time conditions:** Andrew's weather API behind the locked switch. `conditionsNow('realtime')` throws until
  then, and the switch only toasts.
- **Game checks for "short", "other way" and "best size"**, so those paragraphs can show.
- **More breaks:** each one is a `src/breaks/<id>.json` plus a claims run. The map pins every file in
  `src/breaks/index.ts`.
