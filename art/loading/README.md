# Loading screen art

Full-size originals that Andrew owns. These ship with the game: `tools/loadingArt.py` makes the sized copies the game
loads (into `public/loading/`), so only originals go here.

| File | What |
|---|---|
| `slides/*.png` | the loading pictures, full-bleed behind the coin; the cover picks one at random each time (aim for 3840 px wide or more) |
| `logo-emblem.svg` | the grasstree emblem alone, transparent background; the script bakes it into the spinning coin's face |
| `photo-wide.png` | the first loading photo (surf shot, AI-generated, composed in Canva); kept, no longer shown |
| `logo-wordmark.svg` | "Liquid Dreams" alone, transparent background; kept, no longer shown |

To add a picture: drop it in `slides/`, give it a card in `cards.json` (optional), and run `python tools/loadingArt.py`:
it writes the slide list and the cards into `index.html` itself. Open `/?slide=<name>` to see one picture and its card.

`cards.json`: each picture's fact card, keyed by its file name: `kicker`, `name` (big), `common` (another everyday name,
or empty), `latin`, `fact`, and `noongar` (only when a checked source gives one; it follows a bold "Noongar"). Every
fact comes from a source, never memory (sources for the flora: Florabase, Wikipedia, Derbal Nara, DBCA LANDSCOPE,
Whiteman Park, WSWA; checked 2026-10-08). The Derbal Nara Noongar names are from the Perth area, not Wadandi country.

`flora-daviesia-not-local.png`: kept out of the slides. *Daviesia alternifolia* grows inland (Stirling Range to Cheyne
Beach), not on the Cape to Cape coast; a local *Daviesia* (*D. cordata*, *D. horrida*, *D. decurrens*) would replace it.

`plants/`: plant photos Andrew took himself (his own, so they may ship). Plant photos from the web go in
`reference/dune/flora/` instead (git-ignored, never shipped), with a `sources.txt` listing where each came from.
