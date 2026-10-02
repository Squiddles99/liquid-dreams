"""The heath atlas's fixed layout (dune-up-close spec §4.2): 2048² in 128 px cells, 16 × 16, so a mesh can take its UVs
when it is built and the atlas is drawn into the same rectangles afterwards. UVs are glTF's: v down from the top.

- row 0: bark, dead bark (whole cells);
- rows 1–3: leaf sprays, 4 per kind (L0's leaves: rendered sprays of real leaf meshes);
- rows 4–12: L1's leaf-cluster cards, 4 per kind × variant;
- rows 13–14: tuft cards (the near scatter), 4 per tuft species; then misc_<k>, the scatter's colour tiles (dry
  leaves, shell, stone, the tufts' colour strips);
- row 15: canopy silhouettes, 64 px, four to a cell.
"""

SIZE, CELL = 2048, 128
N = SIZE // CELL
KINDS = ["daisy", "green", "tall", "pigface", "rice", "dead", "hibbertia", "cushion", "templetonia", "spinach"]
TUFTS = ["tuft_clubrush", "tuft_swordsedge", "tuft_tussock"]


def _cell(i, j, sub=1, k=0):
    """Cell (i, j) (column, row), or its k-th of sub × sub parts: (u0, v0, u1, v1) with a half-texel inset."""
    w = CELL // sub
    x0, y0 = i * CELL + (k % sub) * w, j * CELL + (k // sub) * w
    e = 0.5
    return ((x0 + e) / SIZE, (y0 + e) / SIZE, (x0 + w - e) / SIZE, (y0 + w - e) / SIZE)


def tile(name):
    if name == "bark":
        return _cell(0, 0)
    if name == "deadBark":
        return _cell(1, 0)
    if name.startswith("spray_"):  # spray_<kind>_<k>
        _, kind, k = name.split("_")
        idx = KINDS.index(kind) * 4 + int(k)
        return _cell(idx % N, 1 + idx // N)
    if name.startswith("card_"):  # card_<kind>_<v>_<k>
        _, kind, v, k = name.split("_")
        idx = (KINDS.index(kind) * 4 + int(v)) * 4 + int(k)
        return _cell(idx % N, 4 + idx // N)
    if name.startswith("tuftcard_"):  # tuftcard_<tuft>_<v>  (tuft without its "tuft_" prefix)
        _, tuft, v = name.split("_")
        idx = TUFTS.index("tuft_" + tuft) * 4 + int(v)
        return _cell(idx % N, 13 + idx // N)
    if name.startswith("misc_"):  # misc_<k>: the scatter's colour tiles, after the tuft cards in rows 13–14
        idx = len(TUFTS) * 4 + int(name.split("_")[1])
        return _cell(idx % N, 13 + idx // N)
    if name.startswith("canopy_"):  # canopy_<kind>_<v>
        _, kind, v = name.split("_")
        idx = KINDS.index(kind) * 4 + int(v)
        return _cell(idx // 4 % N, 15, sub=2, k=idx % 4)
    raise KeyError(name)


def pixel_rect(name):
    """The tile's pixel rectangle (x0, y0, w, h) in the atlas image (y down)."""
    u0, v0, u1, v1 = tile(name)
    x0, y0 = round(u0 * SIZE - 0.5), round(v0 * SIZE - 0.5)
    return x0, y0, round(u1 * SIZE + 0.5) - x0, round(v1 * SIZE + 0.5) - y0


def map_uv(name, u, v):
    """(u, v) in 0–1 within the tile → atlas UV (glTF, v down). Blender's UV v is up, so build code passes 1 − v here
    and gets back a value to store as (u, 1 − result) in Blender."""
    u0, v0, u1, v1 = tile(name)
    return u0 + (u1 - u0) * u, v0 + (v1 - v0) * v
