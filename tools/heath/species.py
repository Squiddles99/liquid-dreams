"""Each kind's build (dune-up-close spec §4.2). Sizes in metres; the build converts them to the unit plant."""

SPECIES = {
    "daisy": {"name": "coastal daisy bush (Olearia axillaris)"},
    "green": {"name": "cushion fanflower (Scaevola crassifolia)"},
    "tall": {"name": "coast tea-tree (Leptospermum laevigatum)"},
    "pigface": {"name": "pigface (Carpobrotus virescens)"},
    "rice": {"name": "pink rice flower (Pimelea ferruginea)"},
    "dead": {"name": "a dead shrub's grey skeleton"},
}
VARIANTS = 4

# Branches (§4.2 step 1–2): the space colonisation's settings in the unit plant (step, kill and reach are fractions of
# the footprint radius); twig_r in metres. Starting values, tuned at gate 1.
BRANCH = {
    "daisy": {"stems": 5, "attractors": 500, "iterations": 35, "step": 0.08, "kill": 0.09, "reach": 0.45, "twig_r": 0.0015, "max_r": 0.03, "dead_share": 0.2},
    "green": {"stems": 4, "attractors": 400, "iterations": 32, "step": 0.09, "kill": 0.1, "reach": 0.45, "twig_r": 0.002, "max_r": 0.025, "dead_share": 0.1},
    "tall": {"stems": 3, "attractors": 420, "iterations": 40, "step": 0.08, "kill": 0.09, "reach": 0.4, "twig_r": 0.0015, "max_r": 0.05, "dead_share": 0.3, "tropism": 0.4},
    "pigface": {"stems": 9, "attractors": 450, "iterations": 40, "step": 0.09, "kill": 0.1, "reach": 0.6, "twig_r": 0.004, "max_r": 0.008, "dead_share": 0.0, "flat": True, "tropism": 0.0},
    "rice": {"stems": 4, "attractors": 200, "iterations": 22, "step": 0.11, "kill": 0.12, "reach": 0.45, "twig_r": 0.0012, "max_r": 0.012, "dead_share": 0.1},
    "dead": {"stems": 4, "attractors": 260, "iterations": 26, "step": 0.1, "kill": 0.11, "reach": 0.45, "twig_r": 0.002, "max_r": 0.025, "all_dead": True},
}

# Leaves (§4.2 step 3), in metres. The leafy kinds carry sprays: cards (2 triangles) each showing a rendered spray of
# the kind's real leaf meshes (atlas.py renders them from SPRAY_LEAF); pigface carries solid fleshy fingers. Andrew's
# flora photos (reference/dune/flora/) set the shapes and colours (linear).
LEAF = {
    "daisy": {"form": "spray", "length": 0.1, "width": 0.06, "leaf_nodes": 7, "leaves_per_node": 2, "leaf_angle": 0.45, "max_leaves": 4000, "colour": (0.2, 0.225, 0.17)},
    "green": {"form": "spray", "length": 0.11, "width": 0.09, "leaf_nodes": 5, "leaves_per_node": 2, "leaf_angle": 0.7, "max_leaves": 4000, "colour": (0.07, 0.17, 0.03)},
    "tall": {"form": "spray", "length": 0.16, "width": 0.125, "leaf_nodes": 10, "leaves_per_node": 3, "leaf_angle": 0.6, "max_leaves": 4000, "colour": (0.1, 0.12, 0.07)},
    "pigface": {"form": "finger", "length": 0.07, "width": 0.013, "leaf_nodes": 40, "leaves_per_node": 3, "leaf_angle": 1.0, "max_leaves": 4000, "colour": (0.14, 0.24, 0.05), "opposite": True},
    "rice": {"form": "spray", "length": 0.065, "width": 0.065, "leaf_nodes": 5, "leaves_per_node": 2, "leaf_angle": 0.6, "max_leaves": 4000, "colour": (0.12, 0.16, 0.07), "opposite": True},
}
# L0's triangle cap per kind (spec §4.2): the sprays fill what the wood and the flowers leave.
L0_CAP = {"daisy": 8000, "green": 8000, "tall": 8000, "pigface": 6000, "rice": 3000, "dead": 2000}

# The leaves inside each kind's spray (atlas.py): shape, length and width (m), leaves per spray.
SPRAY_LEAF = {
    "daisy": {"shape": "needle", "length": 0.022, "width": 0.0045, "count": 46},
    "green": {"shape": "blade", "length": 0.035, "width": 0.015, "count": 18},
    "tall": {"shape": "oval", "length": 0.022, "width": 0.011, "count": 30},
    "rice": {"shape": "tiny", "length": 0.011, "width": 0.0045, "count": 40},
}
# Flowers: petals per flower (a star), its radius (m), how many, and the colour (linear).
FLOWER = {
    "rice": {"petals": 16, "radius": 0.012, "count": 25, "colour": (0.62, 0.42, 0.48)},
    "pigface": {"petals": 24, "radius": 0.025, "count": 6, "colour": (0.55, 0.12, 0.6)},
}

# L1's cluster cards (atlas.py): the sprays' leaves, and pigface's fingers drawn as fleshy blades from above.
CARD_LEAF = {
    **SPRAY_LEAF,
    "daisy": {"shape": "needle", "length": 0.024, "width": 0.007, "count": 46},  # thicker for the card: needles alias away
    "pigface": {"shape": "blade", "length": 0.06, "width": 0.014, "count": 12},
    "dead": {"shape": "needle", "length": 0.07, "width": 0.01, "count": 22},  # grey twigs, bold enough to survive the mips
}
CARD_COLOUR = {"dead": (0.3, 0.29, 0.27)}
