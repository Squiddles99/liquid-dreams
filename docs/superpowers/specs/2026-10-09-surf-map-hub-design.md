# The title and the surf map hub — design

Andrew, 2026-10-09: "I'm going to focus on all waves featured, to be set between Cape Leeuwin and Cape Naturaliste."
The boot order he wants: studio screen, title screen, the crew-surfing loading cover, then a menu where the player
chooses where to surf, on a map of the Capes. A Library tab beside the map shows the 66 flora and fauna pictures. He
asked to be guided on the art direction. This spec covers the **first of three builds**: the title, the surf map, the
break panel and details, and the conditions source. The Library (build 2) and the studio screen (build 3) get their
own specs.

## Rulings made with Andrew (brainstorm, 2026-10-09)

1. **The map's job:** where the breaks are *and* how they're working today. Today's swell and wind are drawn on the
   chart, and each break says whether it's on.
2. **Only built breaks are on the map.** At launch that's one pin, the Womb. Towns, capes and bays give the coast its
   context.
3. **Style: our own surf chart** (mockup A of three). It's an Admiralty chart redrawn in the game's colours:
   - paper land with a fine hatch;
   - a deep-teal sea with depth bands and a few soundings;
   - a compass rose;
   - swell lines that roll in from the swell's real direction;
   - wind arrows over the land;
   - the loading cards' fonts: Knewave for names, Caveat Brush for capes and subtitles, Barlow Semi Condensed for labels.
4. **The break panel and the details page.** Clicking a break opens a summary panel, and Details opens a full page.
   The page has seven sections:
   - the wave;
   - when it works;
   - who it's for;
   - hazards;
   - getting there;
   - name and story;
   - in the game.

   Sources are kept in our data, not shown on screen.
5. **Facts come from online sources, never from Andrew's description, and the game must back them up.** Every claim
   about how a wave breaks has a matching check against the game (§6).
6. **The title holds the main menu.** The first button press both picks the mode and starts the sound (browsers and
   Electron hold audio until a gesture). The menu items:
   - **Surf.**
   - **Online:** shown, locked, "Coming soon".
   - **Settings.**
   - **Quit:** desktop build only.

   The title's background is the surf chart, zoomed in.
7. **Career mode** stays possible but isn't designed now.
8. **Conditions have three sources:**
   - **Game forecast:** today's roll, available now.
   - **Real-time:** Andrew's planned weather API; shown, locked, "Coming soon".
   - **Custom:** the existing Conditions screen.

   Everything reads conditions through one source switch, so the live feed plugs in later without touching the map, the
   panel or the rules.
9. **The details page's picture is an in-game capture** of the break in its best conditions.
10. **The Library uses the Codex layout** (mockup B): categories down the left, a tile grid, the entry on the right.
    It's built second, with its own spec.

Mockups: `.superpowers/brainstorm/53402-1791557166/content/` (`map-style.html` and `library-layout.html`, not committed).
Generator: the session scratchpad `mapmock.py`, using the OpenStreetMap coastline.

## 1. The flow

```
Studio screen (build 3; skipped until the art exists)
  ─► Title: chart close-up + logo; Surf · Online (soon) · Settings · Quit
        the first press starts the music; the game loads behind the title from the moment it shows
  ─► Loading cover (the crew surfing), only while loading is still running
  ─► Surf map ◄─ LB/RB ─► Library (build 2; until then the tab shows "Coming soon")
        A on a break: Surf here
  ─► Conditions ► Rider ► Gear ► paddle out   (unchanged)
```

- **Back from the surf map** returns to the title. Back from Conditions returns to the surf map.
- **Settings** on the title opens the existing settings panel.
- **The Local / Online switch on the hub is gone.** A small **Local** tag sits top-right instead, so that once Online
  exists the mode always shows.

## 2. The title

- **Background:** the baked chart (§4) at about 3× the map's zoom, centred between Gracetown and the Margaret River
  mouth. It drifts slowly (about 20 px a minute). Today's swell lines roll across it.
- **Logo:** the grasstree emblem and the "Liquid Dreams" wordmark, upper left inside the safe area. Both come from
  `art/loading/logo-*.svg`.
- **Menu:** a vertical list down the left in Barlow Semi Condensed:
  - The focused item has the orange rule.
  - The locked item is greyed with a "Coming soon" tag, and pressing it gives a short toast, not a dead click.
  - Navigation works with the controller, the keyboard and the mouse, using the existing `uiInput` and `uiSounds`.
- **Weight:** the title must paint fast. It's a small module with only the baked chart, the two SVGs and the fonts, and
  no 3D. The game's boot (the scene, the bakes, the shader builds) starts behind it as soon as it's up. When the player
  presses Surf:
  - if loading is still running, the loading cover takes over, as now;
  - otherwise the game goes straight to the surf map.
- **Sound:** the press that leaves the title also starts the menu music (`setFrontEndMusic`). The title itself is silent
  until then.

## 3. The surf map

- **The chart:**
  - fills the screen;
  - is framed from Cape Naturaliste to Cape Leeuwin as in mockup A (the coast about 40% across, the panel on the land
    to the right);
  - uses the same drawing at 1080p, 1440p and 4K (SVG, scaled to the safe area).
- **Labels:**
  - Capes: Cape Naturaliste and Cape Leeuwin.
  - Bays: Geographe Bay, plus the Indian Ocean label.
  - Towns: Yallingup, Dunsborough, Busselton, Gracetown, Margaret River, Hamelin Bay and Augusta.
- **Swell:**
  - The swell lines come from the source's swell direction, spaced by its period and stroked by its size.
  - They're drawn on the sea and stop at the coast.
  - They move at a steady, calm rate and don't follow the real wave speed.
  - This reuses the logic of `mapGeom.swellCrests`, rescaled for the chart.
- **Wind:** wind arrows drift over the land, in the direction and at the strength of the source's wind
  (`mapGeom.windArrows`' logic). Glassy conditions show no arrows and say "glassy".
- **The conditions strip** sits top-left under the tabs. It shows the source's name, then swell, wind and tide, for
  example: "GAME FORECAST · Swell 6 ft @ 14 s WSW · Wind 8 km/h E, offshore · Tide 0.6 m rising".
- **Pins:**
  - One pin per built break, from its data file (§5).
  - The focused pin pulses. A dotted leader runs from the pin to the panel.
  - The stick or D-pad moves focus between pins in screen order, and the mouse can hover and click.
  - With one break, the Womb is focused when the screen opens.
- **The break panel** sits on the right inside the safe area and shows:
  - the kicker, for example "REEF BREAK · NEAR GRACETOWN";
  - the name in Knewave and the subtitle in Caveat Brush;
  - the **On / Fair / Off today** line with its reason;
  - best swell, best wind, best tide and level;
  - a three-line summary;
  - "Details".
- **On / Fair / Off** is a pure function of the source's conditions and the break's best conditions:
  - all of swell direction, swell size, wind and tide in range means **On**;
  - one out of range means **Fair**;
  - more than one means **Off**.

  The reason line names what's in or out, for example "WSW swell and an offshore easterly" or "Wind onshore from the
  west".
- **The prompt bar** sits bottom-right on its own backing: A Surf here · Y Details · B Back. LB/RB switch tabs.
- **Surf here** saves the chosen break into the session and opens Conditions:
  - With **Game forecast**, Conditions opens on today's roll, as now.
  - With **Custom**, Conditions opens on the player's last custom setup.
  - With **Real-time** (later), Conditions will likely be skipped. That ruling waits for that build.

## 4. The chart art

- **A new bake, `tools/bakeCapesChart.ts`**, writes `public/ui/capesChart.json`, the way `bakeBreakMap.ts` writes the
  Womb's map:
  - It reads the coastline once from public data and simplifies it to about 0.7 px at 1080p.
  - It writes the land, the coast line, the islands, three depth bands (offset rings of the coast), and the label and pin
    anchors as SVG paths in the chart's own pixels.
  - It keeps the raw coastline under `reference/` (git-ignored) with a `sources.txt`.
- **Coastline source:**
  - Geoscience Australia's coastline (CC BY 4.0) is preferred.
  - OpenStreetMap (ODbL) is the fallback; it's what the mockup used.
  - Either way, the credit goes in the game's credits (Settings › Credits).
- **Depth:**
  - The bands are drawn offsets, not survey data; they're decoration.
  - The soundings are a handful of plausible figures set by hand. They're decoration too, and none sits on a break.
- **Lat/lon to chart:** an equirectangular projection at 33.9° S, the same as the mockup. One function `capesToChart(lon,
  lat)` is shared by the bake, the pins and the labels.

## 5. Break data

- **One file per break:** `src/breaks/<id>.json`, plus a typed loader. The Womb is `womb.json`. Each file holds:
  - `id`, `name`, `kicker`, `subtitle`;
  - `lonLat`: the Womb is at 114.982° E, 33.895° S, the spot Andrew used;
  - `best`: `swellFromDeg [min, max]`, `sizeFt [min, max]`, `windFromDeg [min, max]`, `tide` (a list of
    `low`/`mid`/`high`), `level`;
  - `summary`: three lines;
  - `details`: the seven sections, each a short heading and one or two paragraphs written for players (easy to read,
    entertaining);
  - `sources`: URLs per section, internal only;
  - `claims`: the checkable claims (§6), each with the self-test that backs it.
- **The Womb's facts are researched for this build** from at least two independent sources per claim. Sources so far
  (2026-10-09 search):
  - Wikipedia's *Surfing locations in the Capes region*;
  - margaretriver.com's locals' guide;
  - Surf-Forecast;
  - mondo.surf.

  What they say:
  - short, punchy **left-hand barrels** over reef near Gracetown, reached from Ellensbrook Road;
  - a bodyboarders' favourite;
  - it can meet a section breaking the other way;
  - best with a **WSW groundswell** and an **E wind**;
  - "a habit of breaking bones".

  Where sources disagree (for example the reef type, or the level, which one source rates intermediate), the page says
  the cautious thing or leaves the point out.
- **Name and story:** includes a Noongar place name only from an openly published source (no permission-bound
  material).

## 6. Claims the game must back

Every claim in "The wave" and "When it works" maps to a self-test. The self-test run writes each claim's result to
`public/breaks/<id>.claims.json`, which is committed. The loader shows only claims marked passed; any other claim is
dropped from the panel and the page, and logged. The Womb's first set:

| Claim | Check |
|---|---|
| A left | the peel runs left from the peak in the ride's frame (existing peel probes) |
| Barrels | at the best size, the curl closes into a tube over the ledge (one-curl tube metric) |
| Short and punchy | the ride from take-off to the end section lasts no longer than the length a source gives (if no source gives a length, the page says "short" only where the game's ride is under the median of our other test rides, or leaves it out) |
| Can meet a section the other way | the right-hand side breaks all at once on the sets that close |
| Best swell WSW | the game's best-shaped sets come from inside `swellFromDeg` |
| Best wind E, offshore | the game's offshore direction at the Womb is inside `windFromDeg` |
| Best tide | the bake's breaking floor holds across the listed tides |

If a check fails, either the wave is retuned to match the research or the claim is reworded. Which one is Andrew's
call. The wave work is mid-flight on other branches (Womb retune, lineup truth), so a failing check is reported, not
"fixed" here.

## 7. The conditions source

- A **`ConditionsSource`** type: `'forecast' | 'realtime' | 'custom'`, plus one function, `conditionsNow(source)`, that
  returns `{ swellFt, periodS, swellFromDeg, windMs, windFromDeg, tideM, tideTrend, sky }`:
  - `forecast` reads today's roll, the session setup the Conditions screen opens with today;
  - `custom` reads the player's saved custom setup;
  - `realtime` is unavailable for now: the switch shows it locked, and the function throws if called.
- **The switch** is a small segmented control under the conditions strip: Game forecast · Real-time (soon) · Custom.
  Changing it redraws the swell, the wind and every On / Fair / Off.
- It's saved with the front-end settings (`frontSettings`).

## 8. Details page

- It opens over the dimmed chart. Back closes it.
- **Left column:**
  - the hero capture (16:9, an in-game shot of the Womb in its best conditions, from `tools/captureRide.mjs` or a new
    `captureBreak.mjs`; saved to `public/breaks/womb-hero.webp`);
  - the name;
  - the On / Fair / Off line.
- **Right column:** the seven sections. It scrolls with the right stick, the mouse wheel or the arrow keys.
- The body is Barlow at the panel's size, the section headings use the panel's label style, and there are no walls of
  text: one or two short paragraphs per section.

## 9. Testing

- **Pure units with tests:**
  - `capesToChart`;
  - the On / Fair / Off rule (every boundary);
  - `conditionsNow` for forecast and custom;
  - the break-file loader (bad files rejected; claims with red tests dropped);
  - title menu navigation;
  - pin focus order.
- **Self-test:** the claim checks in §6, run with the existing self-test runner.
- **Captures at 1080p of:**
  - the title;
  - the map (glassy, offshore and onshore);
  - the panel (On, Fair and Off);
  - the details page.

  Each is compared with the mockups before Andrew sees them, under the AAA UI bar: safe areas, controller focus,
  glyphs, motion, and no web-style controls.
- **Boot:** a cold start reaches the surf map with no stall. The loading cover still dissolves only once the builds are
  done.

## Out of scope

- The Library tab (build 2).
- The studio screen (build 3).
- Online play.
- Real-time conditions (locked placeholder only).
- Career mode.
- Any other break.
- Retuning the Womb's wave (claims that fail are reported).
