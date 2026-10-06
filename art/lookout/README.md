# Lookout backdrop art

Andrew's originals for the select screens' painted ground (lookout backdrop spec). `tools/plateArt.py` makes what the
game loads into `public/lookout/`, so only originals go here. All are his ChatGPT renders, upscaled in Canva.

| File | What |
|---|---|
| `ground.webp` | the lookout's ground, cut out (Canva), soft overcast light, no shadows; lossless; 6000 px |
| `ground-mask.png` | the same frame in black and white: shrubs white, everything else black (sets where the ground sways) |
| `shrubs-anim.webp` | the shrubs moving in a light breeze, 80 frames, ~4 s loop, on magenta (the motion is measured, not shown) |

Rerun after any change: `python tools/plateArt.py` (add `--no-flow` to skip the ~3 min motion pass).
New grounds may be on flat magenta (#FF00FF) or already cut: the tool keys only what isn't transparent.
