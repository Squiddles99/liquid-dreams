# The Library (surf map hub, build 2 of 3): design

Andrew, 2026-10-10. Build 1's spec (`2026-10-09-surf-map-hub-design.md`) fixes the Library's place (§1: Surf map ◄─ LB/RB ─►
Library) and its layout (ruling 10: the Codex layout, mockup B,
`docs/superpowers/mockups/library-codex/library-layout.html`). This spec fixes everything else. Handover:
`docs/superpowers/handover/2026-10-10-library-build.md`.

## Goal

A collection screen for the 66 animals and plants of the loading slides and their fact cards, browsed with a controller
(mouse too), that feels like a shipped game's codex (Horizon's notebook, Forza's collections), never like a web page.

## Rulings (Andrew, 2026-10-10)

| # | Question | Ruling |
|---|---|---|
| L1 | Locked entries? | All 66 open from day one. No lock state is built now; career mode can add one later. |
| L2 | Backdrop | The live surf chart stays behind, dimmed. LB/RB swaps panels only; the camera never moves. |
| L3 | Entry pane | Card fields only: picture, kicker, name, common · Latin, fact, Noongar. Mockup B's "at a glance" (size, range, status) is dropped: those facts aren't sourced. No Capes pin. |
| L4 | Order | Categories in mockup B's order; entries A–Z by `name` inside each. |
| L5 | Tab model | A hub tab inside the map beat (`hubTab`), not a new beat, because beats move the camera. |
| L6 | Data | The Library imports `art/loading/cards.json` directly (not `#ld-cards` from index.html). |

## 1. Categories

| Order | Label | Key prefix | Count |
|---|---|---|---|
| 1 | COASTAL PLANTS | `flora-` | 12 |
| 2 | SEAWEED & SEAGRASS | `sea-flora-` | 10 |
| 3 | SEA LIFE | `sea-fauna-` | 15 |
| 4 | BIRDS | `birds-` | 14 |
| 5 | REPTILES | `reptiles-` | 8 |
| 6 | MARSUPIALS | `marsupials-` | 7 |

Each category row shows its label and count. The entry's own `kicker` (e.g. "Introduced bird · Cape to Cape", "Once
lived here · Cape to Cape") shows in the entry pane unchanged.

## 2. State and flow (`src/frontend/frontEnd.ts`)

- `FrontState` gains:
  - `hubTab: 'map' | 'library'`, starting at `'map'`;
  - `library: { zone: 'cats' | 'grid'; cat: number; entry: number; open: boolean; scroll: number }`, where `entry`
    indexes into the focused category and `scroll` is the grid's first visible row.
- Neither is saved: the hub always opens on the map, with the Library at category 0, entry 0.
- On the map beat, `tabMinus`/`tabPlus` toggle `hubTab` (two tabs, so both directions flip it) and emit
  `{ kind: 'tab', to }`. The `{ kind: 'locked', what: 'library' }` event goes; `'realtime'` stays.
- `stepMap` hands every action to a new `stepLibrary` when `hubTab === 'library'`. LB/RB on other beats is unchanged
  (the rider beat still switches riders).
- `stepLibrary`:
  - **Categories zone:** up/down changes `cat` (clamped, no wrap) and resets `entry` and `scroll` to 0. Right or A goes
    to the grid zone.
  - **Grid zone:** the D-pad/stick moves over the tiles in reading order across a fixed column count (§4). Left on the
    first column goes to the categories zone. Up on the top row and down on the bottom row clamp. `scroll` follows
    focus in whole rows. A sets `open`.
  - **Open:** A or B closes it. Left/right steps to the previous/next entry in the category, clamped, so the player can
    page through paintings.
  - **Back (B, not open):** the same as Back on the map, so the title screen.
- Mouse: hovering a tile or category focuses it; a click acts as A. The wheel scrolls the grid in whole rows, as on the
  details page.

## 3. Data (`src/frontend/library.ts`, pure)

- Imports `cards.json`. Exports `LIBRARY: readonly { id; label; entries: readonly { key; card: SlideCard }[] }[]`,
  built by prefix (§1), with `sea-flora-` tested before `flora-` and `sea-fauna-` before anything else.
- Entries are sorted A–Z by `name` (locale compare).
- Throws at build time when a key matches no category.
- Images come from a `libraryImage(key, size: 'tile' | 'full')` helper beside `slideImage` in
  `src/app/loadingSlides.ts`.

## 4. View (`src/frontend/ui/libraryPanel.ts`)

- The Codex layout from mockup B, at the safe area (`--fe-safe-x/y`):
  - **left:** the six categories;
  - **centre:** the tile grid, 3 columns, with each tile's picture and name under it;
  - **right:** the entry pane for the focused tile.
  - The column count is fixed at 3 for every resolution and text scale. Tiles grow and shrink.
- **The entry pane:** the picture on top (4:3, the `-1920` image), then:
  - the kicker (Barlow Semi Condensed, caps);
  - the name (Knewave);
  - the common name · the *Latin* name (Caveat Brush). The common name is left out when it's empty.
  - the fact (Barlow);
  - "**Noongar** …" when the card has `noongar`, written as the loading cover writes it.
- **The open view:** the painting fills the screen (the `-full` image), with the card in the loading cover's style
  over it. It reuses the cover's card markup and CSS, not a copy.
- **Chart behind:** `.fe-root.is-library` dims the chart and the map panel fades out. The legend keeps its backing.
- **Tabs:** SURF MAP · LIBRARY in `surfMapPanel.ts` lose `is-locked`. The live tab is `is-on`, and the Library panel
  shows the same tab strip so the switch reads as one place. Clicking a tab switches it.
- **Grid scroll:** the grid scrolls in whole rows, with edge fades and the scroll limit reported to the core as
  `ui/breakDetails.ts` does (`setDetailsMax`). The Library's own `setLibraryRows`.
- **The rules every panel keeps:**
  - focus via `.is-focus`;
  - text at least 18 px and scaled by `--fe-text`;
  - motion with `--fe-ease-*`, none under `.is-calm`;
  - the chart palette (`#0b2a31`, `#3f6f72`, `#f6ecd6`, `--fe-sun`);
  - no web form controls, glass cards or emoji.
- **Legend (`legendFor`):**
  - Library: A Open · LB/RB Tab · B Back.
  - Open view: ◄► Next · B Close.
  - The map's legend gains LB/RB Library.

## 5. Tile images (`tools/loadingArt.py`, `art/loading/framing.json`)

- `loadingArt.py` also writes `public/loading/<name>-tile.webp`: a 4:3 crop, 480 px wide, quality 85. These are for
  slides only, not boot art.
- **Where the crop sits:** `framing.json` gains a `"tiles"` object, keyed by picture name. It uses the same 0..1 rule as
  the 16:9 cut, with a default of 0.5. Pictures that are wider than 4:3 are cut from the sides by the same rule.
- Each crop is checked by eye in the contact sheet (§7). The tool is rerun after any change; tiles are never cropped by
  hand.

## 6. Testing

- **Unit tests (`npx vitest run src/frontend`):**
  - `library.ts`: six categories with the §1 counts, totalling 66; A–Z order; every key has a tile and a full image on
    disk.
  - `stepLibrary`: tab toggle both ways; zone moves; column wrap rules; clamps; scroll follows focus; open/close;
    paging while open; Back to the title; LB/RB on the rider beat untouched.
- **In-game self-test (`src/frontend/frontEnd.selftest.ts`):** the Library and its open view join "every beat at W×H,
  text 100/200%" (safe area, 18 px floor, overlap) and its overlap list.
- **Known reds stay known:** the two gear-panel tests and the Conditions-arrows test.
- **Gates:** `npx tsc --noEmit` and `npm run build` must pass, because Andrew's launcher builds `dist/`.

## 7. Evidence and order of work

1. **Mock first (AAA bar).** A 1080p mock of the Library over a real chart frame, with real cards and pictures: grid
   focus, a Noongar entry and the open view. Andrew approves it before any UI code. No state or view code before this
   step is approved.
2. Tile crops, with a contact sheet of all 66 tiles for Andrew's eye.
3. Core (data + state), then view, then self-tests.
4. **1080p captures** via a `tools/captureHub.mjs` variant:
   - each category;
   - a Noongar entry;
   - the open view;
   - text at 200%.
5. Executed by Opus on branch `library`, evidence in `docs/superpowers/evidence/library/`, reviewed by Fable. Merged
   only when Andrew says so.

## Out of scope

- Locks or discovery.
- "At a glance" facts.
- Capes location pins.
- Search.
- Sound beyond the front end's existing UI sounds.
- Build 3 (studio screen).
