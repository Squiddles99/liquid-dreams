# Handover: the Library (surf map hub, build 2 of 3)

For a fresh session. Andrew, 2026-10-10: "give me a handover to get another task building the library pages."

## Where things stand

- **Build 1 (title + surf map + break panel/details) is merged to main and pushed** (merge 2c01fcc, then 34346e1).
  Evidence: `docs/superpowers/evidence/surf-map-hub/README.md` and `execution-ledger.md` (every ruling).
- **The Library has no spec yet.** Build 1's spec (`docs/superpowers/specs/2026-10-09-surf-map-hub-design.md`) only
  fixes its place and layout:
  - §1 flow: Surf map ◄─ LB/RB ─► Library.
  - Ruling 10: **the Codex layout (mockup B)**: categories down the left, a tile grid, the entry on the right.
  - Andrew picked Codex after first saying "journal".
- **Start with superpowers:brainstorming**, then a spec, then a plan.
  - Andrew's process (memory `orchestrator-mode`): Fable designs and reviews, Opus executes; his budget is tight.
  - Mock at 1080p over real frames before building (memory `aaa-ui-bar`).

## What the Library shows

**The 66 loading slides and their fact cards.** Andrew owns the art.

| Category | Count | Card key prefix |
|---|---|---|
| Sea life | 15 | `sea-fauna-` |
| Birds | 14 | `birds-` |
| Flora | 12 | `flora-` |
| Seaweeds | 10 | `sea-flora-` |
| Reptiles | 8 | `reptiles-` |
| Marsupials | 7 | `marsupials-` |

- **Cards:** `art/loading/cards.json`, keyed by picture name, with fields `kicker`, `name`, `common`, `latin`, `fact`
  and `noongar`. `noongar` is set only where a checked source gives one; the screen shows it after a bold "Noongar".
- **Sources per category:** `art/loading/README.md`. Facts come from sources, never memory.
- **Licensing:** the Wadandi seascape names (NESP 2022) are CC BY-NC-ND and ask that Custodians be contacted first. They
  are *not* used. Keep it that way (memory `flora-loading-cards`).
- **Images:** `public/loading/<name>-1920.webp` and `-full.webp`, made by `tools/loadingArt.py` from
  `art/loading/slides/`.
  - `art/loading/framing.json` says where each 4:3 picture is cut to 16:9. Tiles will want their own crop; extend that
    file, don't hand-crop.
- **Existing code to reuse:** `src/app/loadingSlides.ts` (`SlideCard`, `slideImage`) and the card styling on the
  loading cover. index.html carries the cards in `#ld-cards`, written by `loadingArt.py`. The Library could read the
  same data, or import `cards.json` directly. Decide that in the spec.
- **Mockup B**, copied into the repo for this handover: `docs/superpowers/mockups/library-codex/library-layout.html`,
  with the images it uses. Open it in a browser.

## Where it plugs in (build 1's code)

- **`src/frontend/frontEnd.ts` `stepMap`:** `tabMinus`/`tabPlus` on the map return
  `{ kind: 'locked', what: 'library' }`, which shows a "Library: coming soon" toast. Replace that with a real tab
  switch. Likely a `FrontState.hubTab: 'map' | 'library'`, or a `'library'` beat; the spec decides. Back from the
  Library should match Back from the map (the title).
- **`src/frontend/ui/surfMapPanel.ts`:** the tabs SURF MAP · LIBRARY (`.fe-map-tab.is-locked`). Clicking LIBRARY
  toasts today.
- **`src/frontend/frontEndPage.ts`:** beats are wrappers in `beatEls`. The map's wrapper holds the `SurfMapPanel` and
  the `BreakDetails` overlay. `render()` cross-fades the visible beat, and `.fe-root.is-map` gives the legend its
  backing over the chart.
- **`src/frontend/ui/legend.ts` `legendFor`:** each beat's prompts. Add the Library's.
- **Patterns to copy:**
  - `ui/breakDetails.ts`: a scrolled reading page. Up/down steps, the scroll limit reported back to the core
    (`setDetailsMax`), the wheel in whole steps, edge fades.
  - `ui/surfMapPanel.ts`: the chart palette.
  - `.fe-row.is-focus`: the focus rule.

## Rules the build must keep

- **AAA UI bar** (memory `aaa-ui-bar`):
  - safe areas via `--fe-safe-x/y`;
  - controller focus on everything;
  - glyph legend;
  - motion eased with `--fe-ease-*` (and `.is-calm` turns it off);
  - no web form controls, glass cards, emoji or centred walls of text.
- **Text:** at least 18 px and scaled by `--fe-text`. The self-test "every beat at W×H, text 100/200%" in
  `src/frontend/frontEnd.selftest.ts` checks the safe area, the 18 px floor and overlap at 4 sizes. Add the Library to
  its beat loop and its overlap list.
- **Fonts:** Knewave for names, Caveat Brush for subtitles, Barlow Semi Condensed for labels, Barlow for body.
- **Chart palette** (panel `#0b2a31`, line `#3f6f72`, cream `#f6ecd6`, accent `--fe-sun`) unless the spec picks
  otherwise.
- **No spend** (memory `zero-budget`).
- **Facts** only from the cards (already sourced).

## Testing and running (things that bit build 1)

- Unit tests: `npx vitest run src/frontend src/breaks`; typecheck `npx tsc --noEmit`; build `npm run build` (Andrew's
  launcher builds `dist/`, so a broken build breaks his shortcut).
- **Known reds:** the full `npx vitest run` has about 60 reds in breaker, seabed, heath, land, surfer and whitewater.
  These were there before build 1. Gate on the front-end folders.
- **In-game self-tests:** `npx electron tools/_selftest.mjs --base=http://localhost:<port>/ --filter=frontend`.
  - It **stalls if its window is throttled or occluded**. Copy it with `backgroundThrottling: false` and the
    `disable-backgrounding-occluded-windows` / `CalculateNativeWinOcclusion` switches (as `tools/captureHub.mjs` has).
  - **Known reds on main** (not from build 1):
    - two gear-panel tests: "rows 2/6/2" and "outfit: ticked 4, want 2";
    - the Conditions-arrows test: its swell value "… · Womb faces ~6 ft" is clipped since the Womb retune.
- **Shared test helpers:** the self-tests share `fakeHost`, `frames`, `press`, `memory` and `noSound`, exported from
  `src/frontend/frontEnd.selftest.ts`. The front end opens on the map now.
- **1080p captures:** model them on `tools/captureHub.mjs`. It sizes the window `1920/dpr × 1080/dpr` at zoom `1/dpr`,
  because Windows is scaled 1.32 here.
- **Title-screen interplay:**
  - The title owns its own `UiInput` and `SettingsController`.
  - `FrontEnd.resume()` (on the title's Surf) drops the pending press and reloads settings.
  - `App.frontEndGoTo(beat)` hides the title for dev drivers.
- Never put scratch files in `src/` (memory `no-scratch-in-src`). Work on a branch or worktree and push it. Merge only
  when Andrew says so.

## Open questions for the brainstorm

1. Tab model: a `'library'` beat in the state machine, or a hub tab inside the map beat? (LB/RB on the map today; on
   the rider beat LB/RB already switch riders, so keep it map-only.)
2. Does the Library show over the chart (dimmed), or on its own backdrop?
3. The entry pane: the full picture plus the card, and maybe a "where on the Capes" pin on a mini chart? Only if
   sourced.
4. Locked or undiscovered entries (career mode later), or all 66 open from day one?
5. Order inside a category: alphabetical, or the cards' order?
