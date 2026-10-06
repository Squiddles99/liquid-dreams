# Lookout backdrop art

Andrew's originals for the select screens' painted grounds (lookout backdrop spec). `tools/plateArt.py` makes what the
game loads into `public/lookout/`, so only originals go here. All are his ChatGPT renders, upscaled in Canva.

One folder per painting:

| Folder | Shown on |
|---|---|
| `conditions/` | the Conditions screen: a low heath crest, the whole top two-thirds left for the live sky and sea |
| `conditions-crew/` | the crew from behind, standing on the Conditions ground (people: they move head to toe, no wind lean) |
| `bank/` | kept for the Rider and Gear screens (next spec): the sand track under a heath bank rising to the right |

Each folder holds:

| File | What |
|---|---|
| `ground.webp` | the ground, cut out (Canva), soft light, no shadows; lossless; 6000 px |
| `ground-mask.png` | the same frame in black and white: shrubs white, everything else black (sets where the ground sways; ignored for `-crew` folders, which use their cut-out) |
| `shrubs-anim.webp` | the shrubs (or the crew) moving, a ~4–5 s loop on magenta (the motion is measured, not shown; longer loops are sampled to 80 frames) |

Rerun after any change: `python tools/plateArt.py [plate ...]` (add `--no-flow` to skip the slow motion pass).
New grounds may be on flat magenta (#FF00FF) or already cut: the tool keys only what isn't transparent.
