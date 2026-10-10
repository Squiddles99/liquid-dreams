# Handover (Opus): the Library, build 2

**State:** branch `library`, all 7 plan tasks done and pushed. Not merged: Andrew decides. Ledger: `docs/superpowers/evidence/library/execution-ledger.md`. Evidence: `docs/superpowers/evidence/library/README.md`.

**Run things**
- Dev server: the preview tool's `liquid-dreams` config (`.claude/launch.json`, port 5173). Never Bash.
- Captures: `npx electron tools/captureLibrary.mjs --base=http://localhost:5173/ --mode=chart|mock|game`. They write to `docs/superpowers/evidence/library/`.
- Self-tests: copy `tools/_selftest.mjs` to the scratchpad. Add `webPreferences: { backgroundThrottling: false }` and the `disable-renderer-backgrounding`, `disable-background-timer-throttling`, `disable-backgrounding-occluded-windows` and `disable-features=CalculateNativeWinOcclusion` switches. Then run `npx electron <copy> --base=http://localhost:5173/ --filter=frontend --max-s=840`. Keep the mouse off its window: the Library's hover test is robust now, but other front-end tests may not be.
- Gates: `npx vitest run src/frontend src/breaks`, `npx tsc --noEmit`, `npm run build`.

**Known reds (don't chase):**
- Full vitest: about 60 in breaker/seabed/heath/land/surfer/whitewater.
- In-game: gear "rows 2/6/2", outfit "ticked 4, want 2", the Conditions arrows swell clip.

**Where things are:**
- `src/frontend/library.ts`: data.
- `frontEnd.ts`: `hubTab`, `library`, `stepLibrary`, `focusTo` lib targets.
- `ui/libraryPanel.ts`: the view.
- `ui/surfMapPanel.ts`: the tabs, glyphs, dim.
- `ui/frontEnd.css`: the tail block. `docs/superpowers/mockups/library-codex/library.css` is its source of truth, so keep the two in step.
- `tools/loadingArt.py` + `art/loading/framing.json` `"tiles"`: the tiles.
- `tools/tileSheet.py`: the contact sheet.

**Left:** only Andrew's review and the merge. Adding a card: add it to `cards.json` and its picture to `art/loading/slides/`, then rerun `python tools/loadingArt.py`. The disk test in `library.test.ts` fails if a tile is missing.
