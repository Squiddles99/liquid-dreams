# Boot by hand (plan Task 12 Step 7), 2026-10-10

Playwright Chromium, 1600×900, dev server on 5180.

1. **The title paints within about 1 s.** First paint 276 ms, first contentful paint 932 ms. The title (chart close-up,
   emblem, wordmark, Surf · Online (coming soon) · Settings) was up by the first check at 4.4 s, while the loading
   cover was still in `boot` underneath.
2. **Enter pressed at once, before the App existed** (5.8 s; `window.liquidDreams` not yet defined):
   - The title hid and the loading cover showed under it.
   - When loading reached `done`: one front-end root and one `.fe-map`, beat `map`, no move in progress.
   - Sound running (`sound.started` true), no "Click or press a key for sound" hint.
3. **On the map, Esc brings the title back** (beat stays `map` under it). Enter hides the title and the map stays on
   `map`, with no move: the same press didn't also act as Surf here.
4. **On Conditions, Esc goes back to the map.** Esc was pressed as a real key. A synthetic `dispatchEvent` from the
   console didn't register in this run.

Also covered by self-tests:
- `frontend: one Enter on the title leaves it for the map and does not also press Surf here; Esc on the map brings it
  back clean`
- `frontend: title menu: Surf hides it and calls onSurf once; Online toasts; no Quit in the browser`
