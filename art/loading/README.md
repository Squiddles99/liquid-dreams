# Loading screen art

Full-size originals that Andrew owns. These ship with the game: `tools/loadingArt.py` makes the sized copies the game
loads (into `public/loading/`), so only originals go here.

| File | What |
|---|---|
| `slides/*.png` | the loading pictures, full-bleed behind the coin; the cover picks one at random each time (aim for 3840 px wide or more) |
| `logo-emblem.svg` | the grasstree emblem alone, transparent background; the script bakes it into the spinning coin's face |
| `photo-wide.png` | the first loading photo (surf shot, AI-generated, composed in Canva); kept, no longer shown |
| `logo-wordmark.svg` | "Liquid Dreams" alone, transparent background; kept, no longer shown |

To add a picture: drop it in `slides/`, run `python tools/loadingArt.py`, and paste the `data-slides` line it prints
onto `#ld-cover` in `index.html`.

`plants/`: plant photos Andrew took himself (his own, so they may ship). Plant photos from the web go in
`reference/dune/flora/` instead (git-ignored, never shipped), with a `sources.txt` listing where each came from.
