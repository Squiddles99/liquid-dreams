# The Lookout Backdrop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Conditions screen shows Andrew's painted ground over the live game sea and sky. The ground is lit by the game's sun and sky light, and its shrubs sway in the game's wind.

**Architecture:**
- A Python tool cuts and sizes the art, builds a sway map from Andrew's mask, and measures the shrubs' motion from his animation as a small optical-flow atlas.
- In the game, `PicturePipeline` gets an optional *scene overlay*: a TSL function applied to the scene's HDR radiance before exposure. The new `LookoutBackdrop` provides one that samples the painting (cover-cropped), warps it by the flow and the wind lean, and relights it with `Sky.skyIrradiance` / `Sky.sunIlluminance`.
- A pure module holds every number that tests pin: the cover crop, the wind drive, the fade between screens, and the camera pose.

**Tech Stack:** TypeScript, three.js WebGPU + TSL (`three/webgpu`, `three/tsl`), vitest, Python 3 + Pillow + numpy (tools), Electron (capture tool).

**Spec:** `docs/superpowers/specs/2026-10-06-lookout-backdrop-design.md`

## Global Constraints

- Work only in the worktree `C:\Dev\andrew-dev-personal-projects\ld-select-ui` on branch `select-screen-ui`. Never touch the main checkout (`liquid-dreaming`): another agent works there on `r1-the-ride`.
- Dev server for this worktree: `npx vite --port 5180 --strictPort` (5173 belongs to the main checkout). Don't use `preview_start`: it reads the main checkout's launch config.
- Don't put scratch files in `src/`: the launcher's `tsc` build breaks on them. Probes live in the scratchpad.
- The full `npx vitest run` currently has **44 pre-existing failures in `src/breaker/` and `src/whitewater/`** (on main e896680). They are not ours. A task passes when its own tests pass and no *other* file fails.
- Paintings are shadowless and lit by the game. Never bake a tint into the art.
- Camera pose (spec §2): eye 1.5 m seaward of the stand spot toward `WOMB_LINEUP`, 1.55 m above the stand spot's ground; yaw = bearing to the lineup + 30°; pitch −8.5°; FOV 60°.
- Wind table (spec §4): calm < 3 kn → playback 0.15×, no lean, no gusts; ≈ 8 kn → 1×, slight lean, gentle gusts; ≥ 20 kn → up to 1.8×, full lean, strong gusts.
- The cover crop is anchored at the bottom-right. Never stretch the painting.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Not-yet-loaded art:** the first frames, before the textures arrive, must show the plain live scene, not black or garbage. Pinned in Task 5 (`ready` uniform; live check of the first frame).
2. **Leaving the menu:** once the player paddles out, the backdrop must be fully gone in the surf. A stale `fade` would paint dune over the sea. Pinned in Task 3 (`backdropFade(null) === 0`) and Task 5 (wiring takes `null` when the front end is closed).
3. **Ultrawide and 4:3 windows:** the painting must cover the screen without stretching and without the bottom-left bush ending in a hard edge. Pinned in Task 3 (`coverUV` at 21:9, 16:9, 4:3) and Task 6 (captures at 2560×1080).
4. **Dead calm and gale winds,** and winds from every direction: no NaN, no runaway lean. Pinned in Task 3 (`windDrive` at 0 kn, 60 kn, and directions all round).
5. **Night and storm light:** the ground must darken with the scene, not glow. Pinned in Task 6 (a night capture: mean ground luminance below the dusk capture's).

---

## File Structure

| File | Responsibility |
|---|---|
| `art/lookout/ground.webp` | Andrew's upscaled ground, lossless (from `docs/select-ui-refs/environment-no-background-upscaled.png`) |
| `art/lookout/ground-mask.png` | his black-and-white shrub mask |
| `art/lookout/shrubs-anim.webp` | his ChatGPT shrub animation |
| `art/lookout/README.md` | what each original is, and how to rerun the tool |
| `tools/plateArt.py` | key/despill, sizes, sway map, flow atlas → `public/lookout/` |
| `tools/test_plateArt.py` | unittest for the key and the flow packing |
| `public/lookout/*` | generated: `ground-1920.webp`, `ground-3840.webp`, `sway.png`, `shrub-flow.png`, `shrub-flow.json` |
| `src/frontend/backdrop/backdropMath.ts` | pure numbers: `coverUV`, `windDrive`, `backdropFade`, `PLATE_ASPECT` |
| `src/frontend/backdrop/backdropMath.test.ts` | their tests |
| `src/frontend/backdrop/backdropLight.ts` | `LookoutLight` params and defaults (the by-eye tuning) |
| `src/frontend/backdrop/LookoutBackdrop.ts` | textures, uniforms, the TSL overlay, per-frame `update` |
| `src/frontend/beatCamera.ts` | add `lookoutShot` + `LOOKOUT`; remove `conditionsShot` |
| `src/frontend/beatCamera.test.ts` | replace the two `conditionsShot` tests |
| `src/frontend/frontEndCore.ts` | the Conditions/out beats use `lookoutShot` |
| `src/render/PicturePipeline.ts` | optional `SceneOverlay` constructor argument |
| `src/app/App.ts` | build the backdrop, pass its overlay, update it every frame |
| `src/dev/DevPanel.ts` | a "Lookout" folder: `sunShare`, `exposure` |
| `tools/captureLookout.mjs` | Electron capture matrix (conditions × winds × sizes) with motion numbers |

---

### Task 1: The art tool: cut-out, sizes and sway map

**Files:**
- Create: `art/lookout/ground.webp`, `art/lookout/ground-mask.png`, `art/lookout/shrubs-anim.webp`, `art/lookout/README.md`
- Create: `tools/plateArt.py`, `tools/test_plateArt.py`
- Generated: `public/lookout/ground-1920.webp`, `public/lookout/ground-3840.webp`, `public/lookout/sway.png`

**Interfaces:**
- Produces (Python): `key(rgb: np.ndarray[h,w,3] uint8) -> np.ndarray[h,w,4] float32 0..1`; `cut(img: Image) -> Image RGBA`; `sway_map(mask: Image, plate: Image, size=(960, 540)) -> Image L`.
- Produces (files): the plate at 1920 and 3840 px wide (RGBA WebP, transparent where the live scene shows), and `sway.png` (960×540, 8-bit grey: 0 = still, 255 = shrub tips).

- [ ] **Step 1: Bring the originals in**

```bash
cd /c/Dev/andrew-dev-personal-projects/ld-select-ui
mkdir -p art/lookout
python -c "from PIL import Image; Image.open('docs/select-ui-refs/environment-no-background-upscaled.png').save('art/lookout/ground.webp', 'WEBP', lossless=True, method=6)"
python -c "from PIL import Image; Image.open('docs/select-ui-refs/black-and-white-mask').convert('L').save('art/lookout/ground-mask.png')"
cp docs/select-ui-refs/animated-shrubs art/lookout/shrubs-anim.webp
ls -la art/lookout
```

Expected: `ground.webp` is 6000×3375 RGBA (lossless, smaller than the 32 MB PNG), `ground-mask.png` is 1672×941, and `shrubs-anim.webp` is an 80-frame animation.

- [ ] **Step 2: Write the failing tests**

`tools/test_plateArt.py`:

```python
"""Run: python -m unittest tools/test_plateArt.py"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import plateArt  # noqa: E402


def synthetic():
    """Flat magenta with a sand block and a leafy green disc, edges blended into the magenta like a real render."""
    h, w = 120, 160
    img = np.zeros((h, w, 3), np.float32)
    img[:] = (255, 0, 255)
    yy, xx = np.mgrid[0:h, 0:w]
    sand = (yy > 80).astype(np.float32)
    leaf = np.clip(20 - np.hypot(xx - 80, yy - 60), 0, 1)  # 1 inside, a 1 px blended rim
    for cover, colour in ((sand, (200, 170, 130)), (leaf, (70, 120, 50))):
        img = img * (1 - cover[..., None]) + np.array(colour, np.float32) * cover[..., None]
    return img.astype(np.uint8)


class KeyTest(unittest.TestCase):
    def test_background_is_transparent(self):
        out = plateArt.key(synthetic())
        self.assertLess(out[:10, :10, 3].max(), 0.01)

    def test_no_magenta_left_on_any_visible_pixel(self):
        out = plateArt.key(synthetic())
        rgb, a = out[..., :3] * 255, out[..., 3]
        score = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
        self.assertEqual(int(((score > 40) & (a > 0.05)).sum()), 0)

    def test_sand_and_leaves_keep_their_colour(self):
        out = plateArt.key(synthetic())
        np.testing.assert_allclose(out[100, 20, :3] * 255, (200, 170, 130), atol=1)
        np.testing.assert_allclose(out[60, 80, :3] * 255, (70, 120, 50), atol=1)
        self.assertGreater(out[100, 20, 3], 0.99)


class FlowPackTest(unittest.TestCase):
    def test_pack_round_trips_to_a_sixteenth_of_a_pixel(self):
        rng = np.random.default_rng(1)
        flow = rng.uniform(-7.9, 7.9, (80, 135, 240, 2)).astype(np.float32)
        atlas = plateArt.pack_flow(flow)
        self.assertEqual(atlas.size, (2400, 1080))
        back = plateArt.unpack_flow(atlas)
        self.assertLess(float(np.abs(back - flow).max()), 1 / 32 + 1e-6)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run them to verify they fail**

Run: `python -m unittest tools/test_plateArt.py`
Expected: an ERROR with `ModuleNotFoundError: No module named 'plateArt'`.

- [ ] **Step 4: Write the tool (cut, sizes, sway map, flow packing)**

`tools/plateArt.py`:

```python
"""Cuts and sizes the lookout backdrop's art (art/lookout/, Andrew's originals) into public/lookout/, which the game loads
(lookout backdrop spec §6).

  public/lookout/ground-1920.webp   the ground, transparent where the live sky and sea show (1080p and smaller)
  public/lookout/ground-3840.webp   the same at 3840 px (1440p and 4K)
  public/lookout/sway.png           how far each pixel may sway, 960×540: 0 still ground, 255 shrub tips
  public/lookout/shrub-flow.png     the shrubs' motion measured from shrubs-anim.webp: 80 frames of 240×135 in a 10×8 atlas,
                                    R = dx, G = dy in 1920-px pixels, stored as 128 + 16·d (±7.9 px, 1/16 px steps)
  public/lookout/shrub-flow.json    { frames, loopS, grid: [240, 135], tiles: [10, 8] }

A ground original may be magenta (#FF00FF, as ChatGPT draws it) or already cut (Canva's background remover): the key
only runs where there is no alpha.

Run with: python tools/plateArt.py           (rerun whenever art/lookout/ changes; the outputs are committed)
          python tools/plateArt.py --no-flow (skips the slow motion pass, ~3 min)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "lookout")
OUT = os.path.join(ROOT, "public", "lookout")

FLOW_GRID = (240, 135)   # one motion sample per 8 px of a 1920×1080 frame
FLOW_TILES = (10, 8)     # 80 frames in the atlas
FLOW_BLOCK = 16          # matched patch size (px)
FLOW_REACH = 5           # search ±5 px
FLOW_STEP = 16.0         # stored as 128 + 16·d


def key(rgb):
    """Magenta key and despill (tested 2026-10-06): magenta-ness = min(R, B) − G; ≥ 170 is background, ≤ 60 is kept."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g
    alpha = 1 - np.clip((m - 60) / 110, 0, 1)
    spill = np.clip(m, 0, None)
    a[..., 0] -= spill
    a[..., 2] -= spill
    return np.dstack([np.clip(a, 0, 255) / 255, alpha]).astype(np.float32)


def cut(img):
    """The ground as RGBA: kept as cut when the original already has transparency, keyed when it is magenta."""
    if img.mode in ("RGBA", "LA") and np.asarray(img.getchannel("A")).min() < 255:
        return img.convert("RGBA")
    return Image.fromarray((key(np.asarray(img.convert("RGB"))) * 255).round().astype(np.uint8), "RGBA")


def sway_map(mask, plate, size=(960, 540)):
    """Andrew's mask, plus plant-coloured pixels it missed, weighted from base (still) to tip (moves most)."""
    w, h = size
    m = np.asarray(mask.convert("L").resize(size, Image.LANCZOS)).astype(np.float32) / 255
    p = np.asarray(plate.resize(size, Image.LANCZOS)).astype(np.float32) / 255
    plant = ((p[..., 1] > p[..., 0] * 0.92) & (p[..., 3] > 0.5)).astype(np.float32)
    m = np.maximum(m, plant * 0.8)
    height = np.zeros_like(m)
    run = np.zeros(w, np.float32)
    for y in range(h - 1, -1, -1):  # how far up its plant each pixel sits, from the plant's foot
        run = np.where(m[y] > 0.5, run + 1, 0)
        height[y] = run
    root = np.clip(height / (45 * h / 941), 0, 1) ** 1.2
    out = Image.fromarray((m * root * 255).astype(np.uint8))
    return out.filter(ImageFilter.BoxBlur(2)).filter(ImageFilter.GaussianBlur(1))


def pack_flow(flow):
    """(frames, gh, gw, 2) px → one RGB atlas image, FLOW_TILES across × down."""
    n, gh, gw, _ = flow.shape
    tx, ty = FLOW_TILES
    atlas = np.full((gh * ty, gw * tx, 3), 128, np.uint8)
    q = np.clip(np.round(128 + flow * FLOW_STEP), 0, 255).astype(np.uint8)
    for f in range(n):
        x0, y0 = (f % tx) * gw, (f // tx) * gh
        atlas[y0:y0 + gh, x0:x0 + gw, :2] = q[f]
    return Image.fromarray(atlas, "RGB")


def unpack_flow(atlas, frames=80, grid=FLOW_GRID):
    gw, gh = grid
    a = np.asarray(atlas).astype(np.float32)
    tx = FLOW_TILES[0]
    return np.stack([(a[(f // tx) * gh:(f // tx + 1) * gh, (f % tx) * gw:(f % tx + 1) * gw, :2] - 128) / FLOW_STEP
                     for f in range(frames)])


def save_sizes(plate):
    for width in (1920, 3840):
        img = plate.resize((width, round(plate.size[1] * width / plate.size[0])), Image.LANCZOS)
        path = os.path.join(OUT, f"ground-{width}.webp")
        img.save(path, "WEBP", quality=90, alpha_quality=100, method=6)
        print(f"ground-{width}.webp: {img.size[0]} x {img.size[1]}, {os.path.getsize(path) // 1024} KB")


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    plate = cut(Image.open(os.path.join(SRC, "ground.webp")))
    save_sizes(plate)
    sway = sway_map(Image.open(os.path.join(SRC, "ground-mask.png")), plate)
    sway.save(os.path.join(OUT, "sway.png"), optimize=True)
    print(f"sway.png: {sway.size[0]} x {sway.size[1]}")
    if "--no-flow" not in argv:
        write_flow(plate, sway)


def write_flow(plate, sway):
    raise NotImplementedError("Task 2")


if __name__ == "__main__":
    main(sys.argv[1:])
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m unittest tools/test_plateArt.py`
Expected: `Ran 4 tests ... OK`.

- [ ] **Step 6: Run the tool and look at the outputs**

Run: `python tools/plateArt.py --no-flow`
Expected: `ground-1920.webp: 1920 x 1080`, `ground-3840.webp: 3840 x 2160` and `sway.png: 960 x 540` are printed.

Then open `public/lookout/sway.png`:
- Shrub tops should be bright, bases dark, and the sand and rocks black.
- The dark shrubs at the right edge and the grass tufts on the sand should now be faintly lit.

- [ ] **Step 7: Write the art README and commit**

`art/lookout/README.md`:

```markdown
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
```

```bash
git add art/lookout tools/plateArt.py tools/test_plateArt.py public/lookout
git commit -m "feat(lookout): the art tool cuts and sizes Andrew's ground and builds its sway map (lookout spec §6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The shrubs' motion, measured, plus Andrew's side-by-side gate

**Files:**
- Modify: `tools/plateArt.py` (replace `write_flow`)
- Generated: `public/lookout/shrub-flow.png`, `public/lookout/shrub-flow.json`
- Scratch only (not committed): `<scratchpad>/flow-compare.html`

**Interfaces:**
- Consumes: `pack_flow`, `unpack_flow`, `FLOW_*` from Task 1.
- Produces: `shrub-flow.png` (2400×1080 RGB) and `shrub-flow.json` `{ "frames": 80, "loopS": <float>, "grid": [240, 135], "tiles": [10, 8] }`. Each value is the **sample offset** `s` in 1920-px pixels: frame *i* looks like the still sampled at `x + s_i(x)`.

- [ ] **Step 1: Replace `write_flow` with block matching against frame 0**

```python
def frames_luma(path):
    anim = Image.open(path)
    lum, durs = [], []
    for fr in ImageSequence.Iterator(anim):
        durs.append(fr.info.get("duration", 50) or 50)
        lum.append(np.asarray(fr.convert("RGB").resize((1920, 1080), Image.LANCZOS).convert("L")).astype(np.float32))
    return lum, sum(durs) / 1000.0


def box_at_grid(img):
    """Sum over FLOW_BLOCK × FLOW_BLOCK patches centred on the 8 px grid (integral image)."""
    gw, gh = FLOW_GRID
    k = FLOW_BLOCK // 2
    p = np.pad(img, ((k + 1, k), (k + 1, k)))
    c = p.cumsum(0).cumsum(1)
    ys = np.arange(gh) * 8 + 4 + k + 1
    xs = np.arange(gw) * 8 + 4 + k + 1
    y0, y1, x0, x1 = ys - k, ys + k, xs - k, xs + k
    return c[np.ix_(y1, x1)] - c[np.ix_(y0, x1)] - c[np.ix_(y1, x0)] + c[np.ix_(y0, x0)]


def shifted(img, sx, sy):
    """out(x, y) = img(x + sx, y + sy), edges clamped."""
    h, w = img.shape
    ys = np.clip(np.arange(h) + sy, 0, h - 1)
    xs = np.clip(np.arange(w) + sx, 0, w - 1)
    return img[np.ix_(ys, xs)]


def match(ref, cur):
    """For each grid patch of `cur`, the offset s (px) with cur(x) ≈ ref(x + s), to a sub-pixel by a parabola fit."""
    r = FLOW_REACH
    costs = np.stack([np.stack([box_at_grid((cur - shifted(ref, sx, sy)) ** 2) for sx in range(-r, r + 1)])
                      for sy in range(-r, r + 1)])  # (sy, sx, gh, gw)
    gh, gw = costs.shape[2:]
    flat = costs.reshape(-1, gh, gw)
    best = flat.argmin(0)
    by, bx = np.divmod(best, 2 * r + 1)
    out = np.zeros((gh, gw, 2), np.float32)
    jj, ii = np.mgrid[0:gh, 0:gw]
    for axis, b in ((0, bx), (1, by)):
        lo = np.clip(b - 1, 0, 2 * r)
        hi = np.clip(b + 1, 0, 2 * r)
        if axis == 0:
            c0, c1, c2 = costs[by, lo, jj, ii], costs[by, b, jj, ii], costs[by, hi, jj, ii]
        else:
            c0, c1, c2 = costs[lo, bx, jj, ii], costs[b, bx, jj, ii], costs[hi, bx, jj, ii]
        den = c0 - 2 * c1 + c2
        frac = np.where((den > 1e-6) & (lo != b) & (hi != b), 0.5 * (c0 - c2) / np.maximum(den, 1e-6), 0)
        out[..., axis] = b - r + np.clip(frac, -0.5, 0.5)
    return out


def write_flow(plate, sway):
    lum, loop_s = frames_luma(os.path.join(SRC, "shrubs-anim.webp"))
    # The animation must be the same picture as the still: check frame 0 against the plate before measuring anything.
    still = np.asarray(plate.resize((1920, 1080), Image.LANCZOS).convert("L")).astype(np.float32)
    offset = match(still, lum[0])
    lag = np.median(offset[sway_grid(sway) > 0.3], axis=0)
    print(f"animation vs still: median offset {lag[0]:+.2f}, {lag[1]:+.2f} px")
    if np.abs(lag).max() > 1.0:
        raise SystemExit("the animation is not aligned with the ground painting (> 1 px): regenerate it from the same image")
    moving = sway_grid(sway)
    flows = []
    for i, cur in enumerate(lum):
        f = match(lum[0], cur) if i else np.zeros((FLOW_GRID[1], FLOW_GRID[0], 2), np.float32)
        f = np.stack([np.asarray(Image.fromarray(f[..., c]).filter(ImageFilter.MedianFilter(3))) for c in range(2)], -1)
        f *= (moving > 0.05)[..., None]  # the ground never moves
        flows.append(np.clip(f, -7.9, 7.9))
        print(f"\rflow: frame {i + 1}/{len(lum)}", end="")
    print()
    flow = np.stack(flows)
    pack_flow(flow).save(os.path.join(OUT, "shrub-flow.png"), optimize=True)
    meta = {"frames": len(lum), "loopS": round(loop_s, 3), "grid": list(FLOW_GRID), "tiles": list(FLOW_TILES)}
    with open(os.path.join(OUT, "shrub-flow.json"), "w") as f:
        json.dump(meta, f)
    print(f"shrub-flow.png: {len(lum)} frames, loop {loop_s:.2f} s, max |d| {np.abs(flow).max():.2f} px")


def sway_grid(sway):
    return np.asarray(sway.resize(FLOW_GRID, Image.BILINEAR)).astype(np.float32) / 255
```

- [ ] **Step 2: Run the full tool**

Run: `python tools/plateArt.py`
Expected:
- `animation vs still: median offset` within ±1 px. If it stops with "not aligned", report to Andrew: the animation must be regenerated from the same image.
- `shrub-flow.png: 80 frames, loop 3.9x s, max |d|` between 1 and 7.9 px.

- [ ] **Step 3: Unit tests still pass**

Run: `python -m unittest tools/test_plateArt.py`
Expected: OK (4 tests).

- [ ] **Step 4: Build the side-by-side comparison for Andrew (scratchpad, not committed)**

Write `<scratchpad>/flow-compare.html` with two WebGL2 canvases side by side, one for each method.
- The scaffold is the working preview `<scratchpad>/sway/sway-preview.html`. **Embed every image as a data URI with `@@NAME@@` placeholders, filled once each.** Replacing a bare word like `SEA` can corrupt the base64 of another image; that bug blanked the first preview.
- **Left canvas:** `animated-shrubs` played as is, keyed (`key()` per frame, pre-baked to an animated RGBA WebP with Pillow), over `sea.jpg`.
- **Right canvas:** `ground-1920.webp` warped by `shrub-flow.png`. Use the same shader as Task 5's flow sampling (copy `flowAt` from Step 3 of Task 5) at playback rate 1, with no lean, over the same `sea.jpg`.

Check it in Playwright: no console errors, and both sides move. Then send it to Andrew (SendUserFile) and ask:

> Left: ChatGPT's animation. Right: the game's version (its motion on the sharp still). Do they feel the same, or does the right look worse?

- [ ] **Step 5: GATE: Andrew's ruling**

- **"Right is fine" (expected):** commit and continue.
- **"Right looks worse":** stop. Record the ruling in the spec's §4 Fallback, then replace Task 5's flow sampling with playback of the keyed frames as a texture array, wind driving only speed. Write those steps before continuing.

```bash
git add tools/plateArt.py public/lookout/shrub-flow.png public/lookout/shrub-flow.json
git commit -m "feat(lookout): measure the shrubs' motion from Andrew's animation as a small flow atlas (lookout spec §4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The backdrop's numbers (pure)

**Files:**
- Create: `src/frontend/backdrop/backdropMath.ts`
- Test: `src/frontend/backdrop/backdropMath.test.ts`

**Interfaces:**
- Produces:
  - `PLATE_ASPECT = 16 / 9`
  - `coverUV(u: number, v: number, screenAspect: number): [number, number]`: `u` runs right and `v` down from the top, on both screen and plate.
  - `interface WindDrive { rate: number; lean: number; squash: number; gust: number }`
  - `windDrive(speedMs: number, fromDeg: number, cameraYawDeg: number): WindDrive`. `lean` is −1…1 (+ leans the tips toward screen right). `squash` is −1…1 (+ means the wind blows into the screen, away from the camera). `gust` is 0…1, the gusts' strength.
  - `interface FadeState { beat: string; move: { from: string; to: string; t: number } | null }`
  - `backdropFade(s: FadeState | null): number`, from 0 to 1.

- [ ] **Step 1: Write the failing tests**

```ts
// src/frontend/backdrop/backdropMath.test.ts
import { describe, expect, it } from 'vitest';
import { PLATE_ASPECT, backdropFade, coverUV, windDrive } from './backdropMath';

const KN = 1 / 1.943844; // m/s per knot

describe('coverUV: the painting covers the screen, anchored bottom-right, never stretched (spec §2)', () => {
  it('is the identity at 16:9', () => {
    expect(coverUV(0.25, 0.75, PLATE_ASPECT)).toEqual([0.25, 0.75]);
  });
  it('crops the top on a wider screen and keeps the full width (21:9)', () => {
    const a = 21 / 9, [u0, v0] = coverUV(0, 0, a), [u1, v1] = coverUV(1, 1, a);
    expect([u0, u1]).toEqual([0, 1]);
    expect(v1).toBeCloseTo(1, 9);
    expect(v0).toBeCloseTo(1 - PLATE_ASPECT / a, 9);
  });
  it('crops the left on a narrower screen and keeps the full height (4:3)', () => {
    const a = 4 / 3, [u0, v0] = coverUV(0, 0, a), [u1, v1] = coverUV(1, 1, a);
    expect([v0, v1]).toEqual([0, 1]);
    expect(u1).toBeCloseTo(1, 9);
    expect(u0).toBeCloseTo(1 - a / PLATE_ASPECT, 9);
  });
  it('keeps the pixels square at any aspect (equal plate distance per screen step on both axes)', () => {
    for (const a of [4 / 3, 16 / 10, PLATE_ASPECT, 21 / 9, 32 / 9]) {
      const [ua] = coverUV(0, 0, a), [ub] = coverUV(1, 0, a), [, va] = coverUV(0, 0, a), [, vb] = coverUV(0, 1, a);
      expect(((ub - ua) / (vb - va)) * PLATE_ASPECT).toBeCloseTo(a, 9);
    }
  });
});

describe('windDrive: the game wind drives the shrubs (spec §4 table)', () => {
  const yaw = 303.9; // the lookout camera, looking north-west
  it('calm: barely a tremble, no lean, no gusts', () => {
    const d = windDrive(1 * KN, 90, yaw);
    expect(d.rate).toBeCloseTo(0.15, 6);
    expect(d.lean).toBe(0);
    expect(d.gust).toBe(0);
  });
  it('dead calm (0 kn) is finite', () => {
    const d = windDrive(0, 0, yaw);
    expect(Object.values(d).every(Number.isFinite)).toBe(true);
  });
  it('a light breeze plays as animated, with a slight lean and gentle gusts', () => {
    const d = windDrive(8 * KN, 90, yaw);
    expect(d.rate).toBeCloseTo(1, 6);
    expect(Math.abs(d.lean)).toBeGreaterThan(0.05);
    expect(Math.abs(d.lean)).toBeLessThanOrEqual(0.3);
    expect(d.gust).toBeGreaterThan(0.2);
    expect(d.gust).toBeLessThan(0.5);
  });
  it('strong wind: up to 1.8×, full strength, and never more in a gale', () => {
    expect(windDrive(20 * KN, 90, yaw).rate).toBeCloseTo(1.8, 6);
    const gale = windDrive(60 * KN, 90, yaw);
    expect(gale.rate).toBeCloseTo(1.8, 6);
    expect(gale.gust).toBe(1);
    expect(Math.hypot(gale.lean, gale.squash)).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('an offshore (from the east) leans the tips left, toward the sea; an onshore (from the west) leans them right', () => {
    expect(windDrive(15 * KN, 90, yaw).lean).toBeLessThan(0);
    expect(windDrive(15 * KN, 270, yaw).lean).toBeGreaterThan(0);
  });
  it('a wind from straight behind the camera only squashes (blows into the screen); from straight ahead the other way', () => {
    const behind = windDrive(20 * KN, (yaw + 180) % 360, yaw), ahead = windDrive(20 * KN, yaw, yaw);
    expect(behind.lean).toBeCloseTo(0, 9);
    expect(behind.squash).toBeCloseTo(1, 9);
    expect(ahead.squash).toBeCloseTo(-1, 9);
  });
  it('a wind from the screen\'s right leans the tips left, at every camera yaw', () => {
    for (const y of [0, 45, 133, 270, 303.9]) expect(windDrive(20 * KN, (y + 90) % 360, y).lean).toBeCloseTo(-1, 9);
  });
});

describe('backdropFade: the painting shows on Conditions only, and never in the surf (spec §5)', () => {
  it('is 0 when the menu is closed', () => expect(backdropFade(null)).toBe(0));
  it('is 1 on Conditions and while paddling out under the cover, 0 on Rider and Gear', () => {
    expect(backdropFade({ beat: 'conditions', move: null })).toBe(1);
    expect(backdropFade({ beat: 'out', move: null })).toBe(1);
    expect(backdropFade({ beat: 'rider', move: null })).toBe(0);
    expect(backdropFade({ beat: 'gear', move: null })).toBe(0);
  });
  it('fades out over the first half of the move to Rider, and back in over the second half of the move back', () => {
    const out = (t: number) => backdropFade({ beat: 'rider', move: { from: 'conditions', to: 'rider', t } });
    const back = (t: number) => backdropFade({ beat: 'conditions', move: { from: 'rider', to: 'conditions', t } });
    expect(out(0)).toBe(1);
    expect(out(0.5)).toBe(0);
    expect(out(0.25)).toBeGreaterThan(0);
    expect(out(0.25)).toBeLessThan(1);
    expect(back(0.5)).toBe(0);
    expect(back(1)).toBe(1);
  });
  it('stays 0 on a move between Rider and Gear', () => {
    expect(backdropFade({ beat: 'gear', move: { from: 'rider', to: 'gear', t: 0.5 } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/frontend/backdrop/backdropMath.test.ts`
Expected: FAIL, `Failed to resolve import "./backdropMath"`.

- [ ] **Step 3: Implement**

```ts
// src/frontend/backdrop/backdropMath.ts
// The lookout backdrop's numbers (lookout backdrop spec §2, §4, §5): pure, so the tests pin them.

/** Andrew's ground painting is 16:9. */
export const PLATE_ASPECT = 16 / 9;

const DEG = Math.PI / 180;
const MS_TO_KN = 1.943844;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => x * x * (3 - 2 * x);

/**
 * Screen uv → painting uv for a cover fit anchored at the painting's bottom-right (u right, v down from the top, on
 * both). A wider screen fits the width and crops the top; a narrower one fits the height and crops the left.
 */
export function coverUV(u: number, v: number, screenAspect: number): [number, number] {
  if (screenAspect >= PLATE_ASPECT) {
    const s = PLATE_ASPECT / screenAspect; // the share of the painting's height on screen
    return [u, 1 - s + v * s];
  }
  const s = screenAspect / PLATE_ASPECT; // the share of its width on screen
  return [1 - s + u * s, v];
}

export interface WindDrive {
  /** Playback speed of the shrubs' motion (1 = as Andrew's animation). */
  rate: number;
  /** −1…1: the tips' lean across the screen (+ = toward screen right). */
  lean: number;
  /** −1…1: + the wind blows into the screen (away from the camera), − toward it. */
  squash: number;
  /** 0…1: how strong the gusts rolling across the bank are. */
  gust: number;
}

/** Spec §4's table: calm < 3 kn barely trembles, ~8 kn plays as animated, ≥ 20 kn up to 1.8× with full lean. */
export function windDrive(speedMs: number, fromDeg: number, cameraYawDeg: number): WindDrive {
  const kn = Math.max(0, speedMs) * MS_TO_KN;
  const rate = kn <= 3 ? 0.15 : kn <= 8 ? 0.15 + ((kn - 3) / 5) * 0.85 : Math.min(1.8, 1 + ((kn - 8) / 12) * 0.8);
  const strength = kn <= 3 ? 0 : kn <= 8 ? 0.3 * ((kn - 3) / 5) : Math.min(1, 0.3 + (0.7 * (kn - 8)) / 12);
  const gust = clamp01((kn - 3) / 17);
  // World: bearing b points along (sin b, −cos b); the camera's forward is (sin yaw, −cos yaw), its right (cos yaw, sin yaw).
  const to = (fromDeg + 180) * DEG, yaw = cameraYawDeg * DEG;
  const wx = Math.sin(to), wz = -Math.cos(to);
  const side = wx * Math.cos(yaw) + wz * Math.sin(yaw);
  const away = wx * Math.sin(yaw) - wz * Math.cos(yaw);
  return { rate, lean: side * strength, squash: away * strength, gust };
}

export interface FadeState {
  beat: string;
  move: { from: string; to: string; t: number } | null;
}

const shows = (beat: string): number => (beat === 'conditions' || beat === 'out' ? 1 : 0);

/** 1 where the painting shows (Conditions; under the paddle-out cover), 0 elsewhere and whenever the menu is closed. */
export function backdropFade(s: FadeState | null): number {
  if (!s) return 0;
  if (!s.move) return shows(s.beat);
  const a = shows(s.move.from), b = shows(s.move.to), t = s.move.t;
  if (a > b) return 1 - smooth(clamp01(t / 0.5));
  if (b > a) return smooth(clamp01((t - 0.5) / 0.5));
  return a;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/frontend/backdrop/backdropMath.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/backdrop/backdropMath.ts src/frontend/backdrop/backdropMath.test.ts
git commit -m "feat(lookout): the cover crop, the wind's drive on the shrubs and the fade between screens (lookout spec §2, §4, §5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The camera turns to the break

**Files:**
- Modify: `src/frontend/beatCamera.ts` (add `LOOKOUT` and `lookoutShot`, remove `conditionsShot` and the `SHOT.cond` entry)
- Modify: `src/frontend/frontEndCore.ts:7` and `:132`
- Test: `src/frontend/beatCamera.test.ts` (replace the two `conditionsShot` tests, at about lines 38–45 and 61–70)

**Interfaces:**
- Produces: `LOOKOUT = { aheadM: 1.5, eyeM: 1.55, yawPastLineupDeg: 30, pitchDeg: -8.5 }` and `lookoutShot(stand: LandSpot, ground: (x: number, z: number) => number, lineup?: { x: number; z: number }): CameraPose`.

- [ ] **Step 1: Replace the two Conditions-shot tests**

In `beatCamera.test.ts`:
- In the import line, replace `conditionsShot` with `LOOKOUT, lookoutShot`.
- In the test `stands the crew facing the sea for Conditions…`, delete its last three lines (from `const pose = conditionsShot` through the second `expect(xs…`). Keep the order and heading assertions.
- Replace the whole test `frames Conditions from behind and above…` with:

```ts
  it('looks out from the lookout toward the break (lookout spec §2): 1.5 m seaward, at eye height, 30° past the lineup, 8.5° down', () => {
    const pose = lookoutShot(stand, ground);
    const toLineup = Math.atan2(-25 - stand.x, -(45 - stand.z)) / (Math.PI / 180);
    expect(Math.hypot(pose.position[0] - stand.x, pose.position[2] - stand.z)).toBeCloseTo(LOOKOUT.aheadM, 6);
    expect(pose.position[1]).toBeCloseTo(ground(stand.x, stand.z) + LOOKOUT.eyeM, 6);
    expect((((pose.yawDeg - toLineup) % 360) + 360) % 360).toBeCloseTo(30, 6);
    expect(pose.pitchDeg).toBe(-8.5);
  });
  it('keeps the 3D crew out of the Conditions frame: they stand behind the lookout camera', () => {
    const pose = lookoutShot(stand, ground);
    for (const c of crewFor('conditions', stand)) expect(box(pose, c).inFront, c.preset).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/frontend/beatCamera.test.ts`
Expected: FAIL, `lookoutShot is not a function` (or no export named `LOOKOUT`).

- [ ] **Step 3: Implement it in `beatCamera.ts`**

Delete `cond: { backM: 3.8, upM: 2.3, yawNudgeDeg: -9 },` from `SHOT`, and replace the whole `conditionsShot` function (with its doc comment) with:

```ts
/** The lookout (lookout backdrop spec §2): Andrew's turn toward the break, so the sets show above the painted bush line. */
export const LOOKOUT = { aheadM: 1.5, eyeM: 1.55, yawPastLineupDeg: 30, pitchDeg: -8.5 } as const;

/** Conditions: the eye 1.5 m seaward of the stand spot, 1.55 m above its ground, turned 30° past the lineup, 8.5° down. */
export function lookoutShot(stand: LandSpot, ground: (x: number, z: number) => number, lineup: { x: number; z: number } = WOMB_LINEUP): CameraPose {
  const dx = lineup.x - stand.x, dz = lineup.z - stand.z, n = Math.hypot(dx, dz) || 1;
  const ux = dx / n, uz = dz / n;
  const x = stand.x + ux * LOOKOUT.aheadM, z = stand.z + uz * LOOKOUT.aheadM;
  const y = ground(stand.x, stand.z) + LOOKOUT.eyeM;
  const yawDeg = ((Math.atan2(ux, -uz) / DEG + LOOKOUT.yawPastLineupDeg) % 360 + 360) % 360;
  return { mode: 'free', position: [x, y, z], yawDeg, pitchDeg: LOOKOUT.pitchDeg };
}
```

If `aim` or `WOMB_LINEUP` become unused after the deletion, the build will say so: remove only what `tsc` reports as unused.

In `frontEndCore.ts`, change the import to `import { crewFor, easePose, gearShot, lookoutShot, riderShot } from './beatCamera';` and line 132 to:

```ts
    if (s.beat === 'conditions' || s.beat === 'out') return lookoutShot(stand, ground);
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/frontend && npx tsc --noEmit`
Expected: every `src/frontend` test passes, including `frontEndCore.test.ts`, and `tsc` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/beatCamera.ts src/frontend/beatCamera.test.ts src/frontend/frontEndCore.ts
git commit -m "feat(lookout): Conditions looks out from the lookout, turned 30° to the break and 8.5° down (lookout spec §2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The painting in the picture: overlay, light, sway, wiring

**Files:**
- Create: `src/frontend/backdrop/backdropLight.ts`, `src/frontend/backdrop/LookoutBackdrop.ts`
- Modify: `src/render/PicturePipeline.ts` (constructor and the `exposed` line)
- Modify: `src/app/App.ts` (field, construction near line 495, `frame()` near line 1951, DevPanel model and handlers near 497–510)
- Modify: `src/dev/DevPanel.ts` (model type, handler type, a "Lookout" folder after "Picture")

**Interfaces:**
- Consumes: `coverUV` logic, `windDrive`, `backdropFade`, `PLATE_ASPECT` (Task 3); `public/lookout/*` (Tasks 1–2); `Sky.skyIrradiance`, `Sky.sunIlluminance` (TSL nodes, `src/sky/Sky.ts`).
- Produces:
  - `export type SceneOverlay = (sceneRgb: any) => any` in `PicturePipeline.ts`, as a new last constructor argument `overlay?: SceneOverlay`.
  - `class LookoutBackdrop { constructor(base: string, wide: boolean); readonly light: LookoutLight; overlay(sky: Sky): SceneOverlay; update(dtS: number, i: BackdropInput): void }`
  - `interface BackdropInput { fade: number; aspect: number; windMs: number; windFromDeg: number; cameraYawDeg: number }`

- [ ] **Step 1: The light params**

```ts
// src/frontend/backdrop/backdropLight.ts
// The painted ground's light (lookout backdrop spec §3): Andrew sets these by eye in the dev panel's Lookout folder.

export interface LookoutLight {
  /** How much of the sun's light the flat-lit painting takes (it has no normals: one number for the whole ground). */
  sunShare: number;
  /** Overall trim on the painting's brightness after the game's light. */
  exposure: number;
}

/** Starting values; Task 6 calibrates them so a clear mid-morning shows the painting as painted. */
export const DEFAULT_LOOKOUT_LIGHT: LookoutLight = { sunShare: 0.5, exposure: 1 };
```

- [ ] **Step 2: The overlay hook in `PicturePipeline`**

Add before the class:

```ts
/** A layer composited over the scene's HDR radiance before exposure (the lookout backdrop): scene rgb node → rgb node. */
export type SceneOverlay = (sceneRgb: N) => N;
```

Change the constructor signature to:

```ts
  constructor(private readonly renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, params: PictureParams = DEFAULT_PICTURE, overlay?: SceneOverlay) {
```

And replace the `exposed` line with:

```ts
    const sceneRgb: N = overlay ? overlay(throughLens.rgb) : throughLens.rgb;
    const exposed = min(sceneRgb.mul(this.exposure).mul(this.whiteBalance), vec3(HDR_MAX));
```

- [ ] **Step 3: `LookoutBackdrop`**

```ts
// src/frontend/backdrop/LookoutBackdrop.ts
// The select screens' painted ground over the live sea (lookout backdrop spec): Andrew's painting, cover-cropped, warped
// by his animation's measured motion and the game's wind, relit by the game's sun and sky every frame.
import * as THREE from 'three/webgpu';
import { PI, clamp, float, floor, mix, mod, screenUV, sin, texture, uniform, vec2, vec3 } from 'three/tsl';
import type { SceneOverlay } from '../../render/PicturePipeline';
import type { Sky } from '../../sky/Sky';
import { PLATE_ASPECT, windDrive } from './backdropMath';
import { DEFAULT_LOOKOUT_LIGHT, type LookoutLight } from './backdropLight';

type N = any;

export interface BackdropInput {
  fade: number;
  aspect: number;
  windMs: number;
  windFromDeg: number;
  cameraYawDeg: number;
}

const FRAMES = 80, TILES = [10, 8] as const, GRID = [240, 135] as const;
/** The lean and squash at full strength, in 1920-px pixels at the tips (the preview's feel at 25 kn). */
const LEAN_PX = 5, SQUASH_PX = 1.5;

export class LookoutBackdrop {
  readonly light: LookoutLight = { ...DEFAULT_LOOKOUT_LIGHT };
  private readonly u = {
    ready: uniform(0), fade: uniform(0), aspect: uniform(PLATE_ASPECT),
    phase: uniform(0), mix2: uniform(0), lean: uniform(0), squash: uniform(0), gust: uniform(0), gustClock: uniform(0),
    sunShare: uniform(DEFAULT_LOOKOUT_LIGHT.sunShare), exposure: uniform(DEFAULT_LOOKOUT_LIGHT.exposure),
  };
  private readonly plate: THREE.Texture;
  private readonly sway: THREE.Texture;
  private readonly flow: THREE.Texture;
  private loopS = 3.95;
  private clock = 0;
  private gustT = 0;

  /** `base` is the site root (import.meta.env.BASE_URL); `wide` loads the 3840 px painting. */
  constructor(base: string, wide: boolean) {
    const loader = new THREE.TextureLoader();
    const load = (name: string, srgb: boolean): Promise<THREE.Texture> => loader.loadAsync(`${base}lookout/${name}`).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.flipY = false;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    });
    // Empty until loaded: `ready` keeps the painting off, so the first frames are the plain live scene.
    this.plate = new THREE.Texture();
    this.sway = new THREE.Texture();
    this.flow = new THREE.Texture();
    void Promise.all([
      load(wide ? 'ground-3840.webp' : 'ground-1920.webp', true),
      load('sway.png', false),
      load('shrub-flow.png', false),
      fetch(`${base}lookout/shrub-flow.json`).then((r) => r.json() as Promise<{ loopS: number }>),
    ]).then(([plate, sway, flow, meta]) => {
      for (const [dst, src] of [[this.plate, plate], [this.sway, sway], [this.flow, flow]] as const) {
        dst.image = src.image;
        dst.colorSpace = src.colorSpace;
        dst.flipY = false;
        dst.generateMipmaps = false;
        dst.minFilter = THREE.LinearFilter;
        dst.wrapS = dst.wrapT = THREE.ClampToEdgeWrapping;
        dst.needsUpdate = true;
      }
      this.loopS = meta.loopS;
      this.u.ready.value = 1;
    }).catch((e) => console.warn('[lookout] art failed to load; Conditions shows the plain scene', e));
  }

  /** The TSL layer for PicturePipeline: the painting over the scene's light, relit by the sky. */
  overlay(sky: Sky): SceneOverlay {
    const u = this.u, size = vec2(1920, 1080);
    // Cover crop anchored bottom-right (backdropMath.coverUV, mirrored here).
    const coverUVNode = (): N => {
      const wide = u.aspect.greaterThanEqual(PLATE_ASPECT);
      const sh = float(PLATE_ASPECT).div(u.aspect), sw = u.aspect.div(PLATE_ASPECT);
      const wideUV = vec2(screenUV.x, float(1).sub(sh).add(screenUV.y.mul(sh)));
      const tallUV = vec2(float(1).sub(sw).add(screenUV.x.mul(sw)), screenUV.y);
      return mix(tallUV, wideUV, wide.select(float(1), float(0)));
    };
    // The measured motion at frame f (atlas tile), in 1920-px pixels.
    const flowAt = (uv: N, f: N): N => {
      const tx = mod(f, TILES[0]), ty = floor(f.div(TILES[0]));
      const inTile = clamp(uv, vec2(0.5 / GRID[0], 0.5 / GRID[1]), vec2(1 - 0.5 / GRID[0], 1 - 0.5 / GRID[1]));
      const at = vec2(tx.add(inTile.x).div(TILES[0]), ty.add(inTile.y).div(TILES[1]));
      return texture(this.flow, at).rg.mul(255).sub(128).div(16);
    };
    const motion = (uv: N, phase: N): N => {
      const f0 = floor(phase), f1 = mod(f0.add(1), FRAMES), k = phase.sub(f0);
      return mix(flowAt(uv, f0), flowAt(uv, f1), k);
    };
    return (scene: N): N => {
      const uv: N = coverUVNode();
      const sway = texture(this.sway, uv).r;
      // Two readings half a loop apart, blended slowly, so the 4 s cycle doesn't show.
      const flowPx = mix(motion(uv, u.phase), motion(uv, mod(u.phase.add(FRAMES / 2), FRAMES)), u.mix2);
      const gustWave = sin(uv.x.mul(5).sub(u.gustClock)).mul(0.5).add(0.5);
      const push = float(0.35).add(gustWave.mul(gustWave).mul(u.gust).mul(0.65));
      const leanPx = vec2(u.lean.mul(LEAN_PX), u.squash.mul(SQUASH_PX)).mul(push).mul(sway);
      const sampleUV = uv.add(flowPx.sub(leanPx).div(size));
      const plate = texture(this.plate, sampleUV);
      const light = sky.skyIrradiance.mul(0.75).add(sky.sunIlluminance.mul(u.sunShare)).div(PI).mul(u.exposure);
      const lit = plate.rgb.mul(light);
      return mix(scene, lit, plate.a.mul(u.fade).mul(u.ready));
    };
  }

  update(dtS: number, i: BackdropInput): void {
    const d = windDrive(i.windMs, i.windFromDeg, i.cameraYawDeg);
    this.gustT += dtS * (0.5 + 0.6 * d.gust);
    const gustNow = 0.5 + 0.5 * Math.sin(this.gustT * 0.9 + Math.sin(this.gustT * 0.23) * 2);
    this.clock += dtS * d.rate * (0.85 + 0.3 * gustNow * d.gust);
    this.u.phase.value = ((this.clock / this.loopS) * FRAMES) % FRAMES;
    this.u.mix2.value = 0.25 * (1 + Math.sin(this.clock * 0.37));
    this.u.lean.value = d.lean;
    this.u.squash.value = d.squash;
    this.u.gust.value = d.gust;
    this.u.gustClock.value = this.gustT;
    this.u.fade.value = i.fade;
    this.u.aspect.value = i.aspect;
    this.u.sunShare.value = this.light.sunShare;
    this.u.exposure.value = this.light.exposure;
  }
}
```

Notes for the implementer:
- **`select` and `greaterThanEqual`:** if TSL in this three version rejects `wide.select(...)` on a uniform comparison, use `step(float(PLATE_ASPECT), u.aspect)` as the mix weight. It's the same thing.
- **The empty-`Texture` placeholder:** three's WebGPU backend binds a default texture until `needsUpdate` with an image, and `ready = 0` hides the result. If WebGPU validation complains about the placeholders, construct them from a 1×1 `DataTexture` instead.

- [ ] **Step 4: Wire it into `App`**

In `App.ts`:
- Add the import: `import { LookoutBackdrop } from '../frontend/backdrop/LookoutBackdrop';` and `import { backdropFade } from '../frontend/backdrop/backdropMath';`.
- Add the field next to `picture`: `readonly lookout: LookoutBackdrop;`.
- Just before `this.picture = new PicturePipeline(...)` (around line 495):

```ts
    this.lookout = new LookoutBackdrop(import.meta.env.BASE_URL, Math.max(window.innerWidth, window.innerHeight) * devicePixelRatio > 2200);
    this.picture = new PicturePipeline(renderer, this.scene, this.camera, this.pictureParams, this.lookout.overlay(this.sky));
```

(Replace the existing `this.picture = …` line. Don't add a second one.)

- In `frame()`, right after `this.frontEnd?.update(realDt);`:

```ts
    const fwd = this.camera.getWorldDirection(this.lookoutFwd);
    this.lookout.update(realDt, {
      fade: backdropFade(this.frontEnd?.isOpen ? this.frontEnd.state : null),
      aspect: this.camera.aspect,
      windMs: this.conditions.wind.speedMs,
      windFromDeg: this.conditions.wind.directionDeg,
      cameraYawDeg: ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360,
    });
```

- Add the scratch vector field: `private readonly lookoutFwd = new THREE.Vector3();`.

- [ ] **Step 5: The dev panel's Lookout folder**

In `DevPanel.ts`:
- Add `lookout: LookoutLight` to `DevPanelModel`, and `onLookout(): void;` to `DevPanelHandlers`, next to `onPicture`.
- After the Picture folder:

```ts
    const lookout = this.pane.addFolder({ title: 'Lookout', expanded: false });
    lookout.addBinding(m.lookout, 'sunShare', { label: 'sun share', min: 0, max: 2, step: 0.01 }).on('change', h.onLookout);
    lookout.addBinding(m.lookout, 'exposure', { min: 0.1, max: 4, step: 0.01 }).on('change', h.onLookout);
```

- Import `type LookoutLight` from `'../frontend/backdrop/backdropLight'`.

In `App.ts`'s `new DevPanel({...}, {...})`:
- Add `lookout: this.lookout.light` to the model.
- Add `onLookout: () => {}` to the handlers. The values are read every frame in `update`, so nothing else is needed.
- `App.ts` line ~1663 builds a second model object. If `tsc` reports the missing `lookout` there, add `lookout: this.lookout.light` there too.

- [ ] **Step 6: Typecheck and unit tests**

Run: `npx tsc --noEmit && npx vitest run src/frontend src/render src/app`
Expected: no type errors, and these folders' tests pass.

- [ ] **Step 7: Live check on the dev server (5180)**

Start `npx vite --port 5180 --strictPort` in the background (from the worktree). Then use Playwright, or the capture tool from Task 6 once it exists:
1. Load `http://localhost:5180/` at 1920×1080 and wait until `document.documentElement.dataset.ldLoading === 'done'`. The front end opens on Conditions.
2. Screenshot. The painted ground fills the lower right, with live sea and sky behind and the break left of centre.
   - **Orientation check:** if the painting is upside down, flip `screenUV.y` in `coverUVNode` (`float(1).sub(screenUV.y)`), or set the textures' `flipY = true`. Fix whichever is wrong, then recheck.
3. There are no console errors (`read_console_messages`, or the page's `console` events).
4. Press Enter (or `liquidDreams.frontEndGoTo('rider')`). The painting fades during the move and the 3D crew show on Rider. Press Esc: it fades back in on Conditions.
5. Run `liquidDreams.paddleOut`, or press `P`, and check that the surf view shows no painting.

- [ ] **Step 8: Commit**

```bash
git add src/frontend/backdrop src/render/PicturePipeline.ts src/app/App.ts src/dev/DevPanel.ts
git commit -m "feat(lookout): the painted ground in the picture over the live sea, relit by the sky, swaying in the game's wind (lookout spec §1, §3, §4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Capture matrix, light calibration, and Andrew's eye

**Files:**
- Create: `tools/captureLookout.mjs`
- Modify: `src/frontend/backdrop/backdropLight.ts` (the calibrated defaults)

**Interfaces:**
- Consumes: `window.liquidDreams` (dev builds): `frontEndGoTo('conditions')`, `frontEndHost().applyConditions(c)`, `frontEndHost().baseConditions()`, `captureFrame()`, and `lookout.light`.
- Produces: PNGs `<out>-<case>.png` plus a printed table: ground motion (mean |Δ| of two frames 0.5 s apart on the sand) and shrub motion (the same on the shrubs) for each case.

- [ ] **Step 1: The capture tool**

```js
// tools/captureLookout.mjs
// Dev tool (lookout backdrop spec, Testing): npx electron tools/captureLookout.mjs --base=http://localhost:5180/ --out=<prefix> [--size=1920x1080]
// Opens the game on Conditions; for each case sets the weather, time and wind, waits, saves a captureFrame() PNG, takes a
// second frame 0.5 s later, and prints how much the sand and the shrubs changed (the sand must not move).
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5180/'), out = arg('out'), [W, H] = arg('size', '1920x1080').split('x').map(Number);
mkdirSync(dirname(out), { recursive: true });
// Andrew's own game window holds the default profile: use a scratch one, or the shader cache fails.
app.setPath('userData', join(tmpdir(), 'ld-capture-lookout'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W_ = (low, conv, base, mid, high, rain, storm, vis, fogTop, aloftDeg, aloftMs) =>
  ({ lowCover: low, convection: conv, lowBaseM: base, midCover: mid, highCover: high, rain, storm, visibilityKm: vis, fogTopM: fogTop, windAloftDeg: aloftDeg, windAloftMs: aloftMs });
const SKY = { clear: W_(0, 0.4, 1000, 0, 0, 0, 0, 60, 1500, 270, 10), grey: W_(1, 0.15, 450, 0.5, 0.2, 0, 0, 20, 1500, 280, 12), storm: W_(0.95, 1, 500, 0, 0.4, 1, 1, 8, 1500, 300, 22) };
const KN = 1 / 1.943844;
const CASES = [
  ['clear-morning-light-offshore', 9.5, 'clear', 8, 90],
  ['clear-morning-calm', 9.5, 'clear', 1, 90],
  ['grey-light-offshore', 11, 'grey', 8, 90],
  ['late-arvo-strong-onshore', 16.8, 'clear', 22, 270],
  ['storm-strong-onshore', 13, 'storm', 28, 270],
  ['night-calm', 21.5, 'clear', 1, 90],
];
const grab = (win) => win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`).then((s) => Buffer.from(s, 'base64'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  for (let i = 0; i < 240; i++) { if (await win.webContents.executeJavaScript(`document.documentElement.dataset.ldLoading === 'done'`)) break; await sleep(1000); }
  await win.webContents.executeJavaScript(`window.liquidDreams.frontEndGoTo('conditions')`);
  for (const [name, tod, sky, kn, from] of CASES) {
    await win.webContents.executeJavaScript(`(() => { const h = window.liquidDreams.frontEndHost(), c = h.baseConditions();
      h.applyConditions({ ...c, timeOfDay: ${tod}, weather: ${JSON.stringify(SKY[sky])}, wind: { speedMs: ${kn * KN}, directionDeg: ${from} } }); })()`);
    await sleep(5000);
    const a = await grab(win); await sleep(500); const b = await grab(win);
    writeFileSync(`${out}-${name}.png`, a);
    writeFileSync(`${out}-${name}-b.png`, b);
    console.log('saved', name);
  }
  app.quit();
});
```

The motion numbers come from a short Python pass over each pair, run right after. Region boxes are in 1920×1080 frame pixels and get scaled for other sizes:

```bash
python -c "
import sys, glob; from PIL import Image; import numpy as np
for a in sorted(glob.glob(sys.argv[1] + '-*.png')):
    if a.endswith('-b.png'): continue
    A = np.asarray(Image.open(a).convert('L')).astype(int); B = np.asarray(Image.open(a[:-4] + '-b.png').convert('L')).astype(int)
    h, w = A.shape; sx, sy = w / 1920, h / 1080
    box = lambda x0, y0, x1, y1: (slice(int(y0 * sy), int(y1 * sy)), slice(int(x0 * sx), int(x1 * sx)))
    sand, shrubs = box(900, 820, 1500, 1000), box(1500, 180, 1900, 420)
    print(f'{a}: sand {np.abs(A[sand] - B[sand]).mean():.2f}  shrubs {np.abs(A[shrubs] - B[shrubs]).mean():.2f}  ground mean {A[sand].mean():.1f}')
" <out-prefix>
```

- [ ] **Step 2: Run the matrix at 1080p, at 4K and ultrawide**

Run, with the 5180 dev server up:

```bash
npx electron tools/captureLookout.mjs --base=http://localhost:5180/ --out=<scratchpad>/lookout/1080
npx electron tools/captureLookout.mjs --base=http://localhost:5180/ --out=<scratchpad>/lookout/2160 --size=3840x2160
npx electron tools/captureLookout.mjs --base=http://localhost:5180/ --out=<scratchpad>/lookout/uw --size=2560x1080
```

Then run the Python pass on each prefix. Expected:
- `sand` < 0.5 in every case (the ground holds still).
- `shrubs` > 1 for every non-calm case.
- `clear-morning-calm` shrubs < half of `clear-morning-light-offshore`.
- `night-calm` ground mean < `late-arvo-strong-onshore` ground mean (Review Focus 5).

Also look at each PNG:
- the break is visible left of centre;
- no fringe on the bush edges;
- at 2560×1080 the bottom-left bush isn't cut by a hard edge (Review Focus 3).

- [ ] **Step 3: Calibrate the light**

In `clear-morning-light-offshore` at 1080p, compare the displayed sand with the painting as painted. The painted sand's mean luma is about 150 on `public/lookout/ground-1920.webp` inside the same box (measure it with the same Python box). Change `DEFAULT_LOOKOUT_LIGHT.exposure` until the captured sand mean is within ±10 of the painted mean:
- Rerun only that case: temporarily edit `CASES` locally to that one row, and don't commit the edit.
- Keep `sunShare` at 0.5 unless the late-afternoon capture looks flat. In that case raise it to 0.7 and recalibrate the exposure.

Record the final numbers in `backdropLight.ts`'s doc comment, e.g. "calibrated 2026-10-xx: clear 9:30 sand mean 151 vs painted 150".

- [ ] **Step 4: Andrew's eye (GATE)**

Send Andrew the six 1080p captures and the ultrawide clear-morning one (SendUserFile). Tell him the dev panel's **Lookout** folder (press H) has `sun share` and `exposure`. Ask:

> Does the ground sit in each weather, and do the shrubs feel alive without being busy?

Apply his numbers to `DEFAULT_LOOKOUT_LIGHT`. If he wants more or less movement, scale `LEAN_PX` and `SQUASH_PX` in `LookoutBackdrop.ts`, or the `rate` table in `backdropMath.ts` (update its test's numbers to match).

- [ ] **Step 5: Final checks and commit**

Run: `npx tsc --noEmit && npx vitest run && python -m unittest tools/test_plateArt.py`
Expected:
- No type errors.
- vitest: only the 44 known `src/breaker` and `src/whitewater` failures; every other file passes.
- Python: OK.

```bash
git add tools/captureLookout.mjs src/frontend/backdrop/backdropLight.ts src/frontend/backdrop/LookoutBackdrop.ts src/frontend/backdrop/backdropMath.ts src/frontend/backdrop/backdropMath.test.ts
git commit -m "feat(lookout): capture matrix and the ground's light calibrated by eye (lookout spec, Testing)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
