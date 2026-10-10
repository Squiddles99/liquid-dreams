# The Library (build 2): execution ledger

Plan: docs/superpowers/plans/2026-10-10-library.md · Spec: docs/superpowers/specs/2026-10-10-library-design.md · Branch `library`.

## Deviations from the spec (Fable, at planning)
- **D1, the open view's card:** copies the loading cover card's *look* in its own `fe-lib-*` classes, in design px; it does not reuse the cover's vh-sized `.ld-*` CSS (it would fail the 18 px floor).
- **D2, no grid scroll in the core state:** no `setLibraryRows`. The view scrolls to keep the focused tile in sight; the wheel moves the focus a row.
- **D3, LB/RB glyphs:** beside the tab strip (mockup B, gear panel), not in the legend.

## Task 1: the 1080p mock (2026-10-10)
- Captures: `chart-bare.png` (backdrop), `mock-grid.png`, `mock-noongar.png`, `mock-open.png`, `mock-text200.png`, `mock-open200.png`.
- The longest card (fact + Noongar) is **Australian salmon** (sea-fauna). At text 200% it fits whole in the entry pane (big-text hides the picture) and in the open view; its last line sits above the legend. No overflow levers were needed.
- Ruling: the capture tool loads `library-1080.html?s=<state>#<state>`. A hash-only `loadURL` is a same-document navigation, so the mock never re-ran and every shot was the grid. Cost if wrong: none (tool only).
- Ruling: the mock-only legend gets `white-space: pre`, and the mock sets `is-more` on the grid when it overflows, as the real view will. Cost if wrong: none (mock only).
- Ruling: the open view's shade and text are taken from the cover card (D1's intent). The plan's shade, one bottom-left ellipse, left the Balga card unreadable over bright sand. It is now the cover's two-layer shade (radial at 0% 78% + bottom linear). Under `is-big-text`, a left-side linear shade covers the full height. The kicker, name (sun stroke + teal drop), sub and fact get the cover's text-shadows. Cost if wrong: a few CSS lines in `library.css` if Andrew prefers the lighter look.
- Note for Andrew: the 0.72 dim turns the chart's land a muddy olive-grey. One number (`.fe-map-dim` alpha) if he wants it lighter or tinted.
- Gate: **APPROVED by Andrew 2026-10-10** ("approved, carry on with task 3"). The dim stays at 0.72 (no change asked).

## Task 2: tile crops (2026-10-10)
- `python tools/loadingArt.py`: 66 × `<name>-tile.webp: 480 x 360`; `index.html` and the existing -1920/-full pictures unchanged.
- `tiles-sheet.png` (11×6). Checked by eye, with each wide original (16:9 and 3:2 sources) shown beside its 0.5 crop box. 4:3 sources have no lever.
- framing.json `tiles` values:
  - `birds-osprey` 0.95: the right wingtip was cut.
  - `sea-fauna-bronze-whaler` 0.95: the tail was cut.
  - `sea-fauna-port-jackson` 0.8: the nose was cut.
  - `sea-fauna-rock-lobster` 0.75: the body was crammed off the right edge.
  - `sea-fauna-tiger-shark` 0.9: the nose was cut.
- Left at 0.5: the albatross and sea-eagle wingtips touch the top edge, but their sources are 4:3, so no crop can move. Heath monitor: its tail curls past the right edge, but the head is the subject and is kept.
