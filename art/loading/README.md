# Loading screen art

Full-size originals that Andrew owns. These ship with the game: `tools/loadingArt.py` makes the sized copies the game
loads (into `public/loading/`), so only originals go here.

| File | What |
|---|---|
| `boot/crew-wave.png` | the start-up picture: the crew surfing (Andrew's redraw, 2026-10-08), shown only while the game first loads into the menus (aim for 3840 px wide or more) |
| `slides/*.png` | the later covers' pictures (paddling out, back to the dune), full-bleed behind the coin; each cover picks one at random |
| `logo-emblem.svg` | the grasstree emblem alone, transparent background; the script bakes it into the spinning coin's face |
| `photo-wide.png` | the first loading photo (surf shot, AI-generated, composed in Canva); kept, no longer shown |
| `logo-wordmark.svg` | "Liquid Dreams" alone, transparent background; kept, no longer shown |

To add a picture: drop it in `slides/`, give it a card in `cards.json` (optional), and run `python tools/loadingArt.py`:
it writes the slide list and the cards into `index.html` itself. Open `/?slide=<name>` to see one picture and its card.

`cards.json`: each picture's fact card, keyed by its file name: `kicker`, `name` (big), `common` (another everyday name,
or empty), `latin`, `fact`, and `noongar` (only when a checked source gives one; it follows a bold "Noongar"). Every
fact comes from a source, never memory (sources for the flora: Florabase, Wikipedia, Derbal Nara, DBCA LANDSCOPE,
Whiteman Park, WSWA; checked 2026-10-08). The Derbal Nara Noongar names are from the Perth area, not Wadandi country.

`sea-fauna-*` and `sea-flora-*` (Andrew, 2026-10-09): sea life and seaweeds. Sources, checked 2026-10-09: DBCA (Ngari Capes Marine Park visitor guide, leafy seadragon), WA Museum, DPIRD, Fishes of Australia, Australian Museum, Australian Antarctic Division, SharkSmart WA, CALM LANDSCOPE, Florabase, AlgaeBase/AANI, GeoCatch, UWA. Names fixed against them: the coast's Asparagopsis is *A. armata* (harpoon weed; *A. taxiformis* is northern), *Scytothalia dorycarpa* is western crayweed ("strapweed" is *Posidonia*), sea lettuce is left at *Ulva* (its species here is unsettled). Noongar: *ngari* (salmon) is from DBCA's park guide, the Wadandi word the park is named for; *mamang* (whale) from Derbal Nara (Perth) and Wirlomin (south coast); *kwilena* (dolphin) from DPIRD's six seasons sheet; *bamba* (stingray) from Derbal Nara; *manyil* (seal) from *Kep Barna* (Fremantle Press). More Wadandi names (*Mammung*, *Kwillan*, *Kaanging* abalone, *Ngaralaang* herring) are in *The Cultural Seascape of Wadandi Boodja* (NESP 2022), which is CC BY-NC-ND and asks that Custodians be contacted first: ask the Undalup Association before using them in a paid game.

`birds-*` (Andrew, 2026-10-09). Sources, checked 2026-10-09: BirdLife WA's Augusta–Margaret River bird list (every bird but the tropicbird is on it), BirdLife's Capes beach-nesting birds plan (2025), DCCEEW's tropicbird advice (2023: no longer breeds on Sugarloaf Rock), Wikipedia. The kookaburra is introduced (from 1883), so its kicker says so. Noongar names are from Abbott (2009), *Aboriginal names of bird species in south-west Western Australia* (DBCA, Conservation Science WA 7), which respells colonial-era records; where Bates or others recorded a name at the Vasse or Busselton, the card says so. Most of the birds are 4:3, so `framing.json` says where each is cut to 16:9 (keeping wingtips in).

`reptiles-*` (Andrew, 2026-10-09). Checked 2026-10-09 against Atlas of Living Australia records for the Capes, DBCA's LANDSCOPE article on the Cape to Cape Track, Perth Zoo, Whiteman Park, HikeWest, AROD, the Reptile Database, Wikipedia. Noongar: *yoorn* (bobtail, Whiteman Park, Perth), *wakal* (carpet python, the Tuart woodlands conservation advice), and "dugite" itself, from the Noongar word (Wikipedia). `not-local/`: five reptiles with no Capes records, kept out of the slides: western blue-tongue (*Tiliqua occipitalis*), southern shovel-nosed snake, south-western spiny-tailed gecko (nearest Mandurah), western heath dragon (*Ctenophorus adelaidensis*, Kalbarri to Perth) and the central netted dragon (*C. nuchalis*, desert). Local ones that could replace them: southern heath monitor (*Varanus rosenbergi*), bardick (*Echiopsis curta*).

`flora-daviesia-not-local.png`: kept out of the slides. *Daviesia alternifolia* grows inland (Stirling Range to Cheyne
Beach), not on the Cape to Cape coast; a local *Daviesia* (*D. cordata*, *D. horrida*, *D. decurrens*) would replace it.

`plants/`: plant photos Andrew took himself (his own, so they may ship). Plant photos from the web go in
`reference/dune/flora/` instead (git-ignored, never shipped), with a `sources.txt` listing where each came from.
