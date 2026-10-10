# The Library (hub build 2): evidence

Branch `library`. Spec: `docs/superpowers/specs/2026-10-10-library-design.md`. Plan: `docs/superpowers/plans/2026-10-10-library.md`. Every ruling: [execution-ledger.md](execution-ledger.md).

## What was built
A Codex-style Library tab beside the surf map. LB/RB (Q/E on the keyboard) flips the hub between the chart and the Library; the live chart stays behind, dimmed, and the camera never moves. On the left are six categories (Coastal plants 12, Seaweed & seagrass 10, Sea life 15, Birds 14, Reptiles 8, Marsupials 7), with entries A–Z. In the middle is a 3-column grid of 4:3 tiles that scrolls to keep the focus in sight. On the right is the focused entry's picture and card. A opens the painting full screen with its card; left/right page through the category; B closes. B on the Library goes to the title, and the hub opens on the map next time. All 66 entries are open. Every fact on screen comes from `art/loading/cards.json`. The mouse works too (hover or click a category or tile; click a tab).

## Gates (2026-10-10, last run on c51ae49 + docs)
- `npx vitest run src/frontend src/breaks`: **278/278** (32 files).
- `npx tsc --noEmit`: clean. `npm run build`: ok.
- In-game self-tests, `--filter=frontend`: **30/33**. The 3 reds are the known, pre-existing ones: Conditions arrows (swell clip), gear "rows 2/6/2", outfit "ticked 4, want 2". All 8 "every beat at W×H" cases (1920×1080, 1280×800, 2560×1080, 1024×768, at text 100% and 200%) now include the Library, the longest card (Australian salmon) and that card open. They are clean. The new Library navigation test is clean.

## Captures (1920×1080, `npx electron tools/captureLibrary.mjs --mode=…`)
- `chart-bare.png`: the bare chart, the mock's backdrop.
- `mock-grid / mock-noongar / mock-open / mock-text200 / mock-open200.png`: the 1080p mock Andrew approved (Task 1).
- `tiles-sheet.png`: all 66 tiles (Task 2).
- `lib-cat0…5.png`: each category on its first tile.
- `lib-balga.png`, `lib-balga-open.png` (+ `-text200`): an entry with a Noongar line, in the pane and opened.
- `lib-longest.png`, `lib-longest-open.png` (+ `-text200`): the longest card (fact + Noongar), the worst case for fitting.
- `lib-scrolled.png` / `lib-scrolled-mid.png`: Sea life scrolled to its last row and to a middle row (edge fades).

## Open items for Andrew
- **Merge `library` to main**: your call. Nothing is merged.
- **Tile crops:** five were moved (osprey, bronze whaler, Port Jackson shark, rock lobster, tiger shark). Any other is a one-number change in `art/loading/framing.json` → `"tiles"`, then `python tools/loadingArt.py`.
- **The dim** (`.fe-map-dim`, 0.72) turns the chart's land olive-grey. One number if you want it lighter.
- **Deviations from the spec**, made at planning: D1 (the open card copies the cover card's look in its own design-px CSS, plus the cover's shade and text-shadows), D2 (no grid scroll in the core state), D3 (LB/RB glyphs by the tabs).
- **Two view fixes found in testing** (ledger, Task 6): the last row scrolls fully in, and a tile takes the focus only on real mouse movement, so a resting cursor no longer steals it.
