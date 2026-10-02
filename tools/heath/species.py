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
    "tall": {"stems": 3, "attractors": 500, "iterations": 40, "step": 0.08, "kill": 0.09, "reach": 0.4, "twig_r": 0.0015, "max_r": 0.05, "dead_share": 0.3, "tropism": 0.4},
    "pigface": {"stems": 6, "attractors": 300, "iterations": 30, "step": 0.09, "kill": 0.1, "reach": 0.5, "twig_r": 0.004, "max_r": 0.008, "dead_share": 0.0, "flat": True, "tropism": 0.0},
    "rice": {"stems": 4, "attractors": 200, "iterations": 22, "step": 0.11, "kill": 0.12, "reach": 0.45, "twig_r": 0.0012, "max_r": 0.012, "dead_share": 0.1},
    "dead": {"stems": 4, "attractors": 260, "iterations": 26, "step": 0.1, "kill": 0.11, "reach": 0.45, "twig_r": 0.002, "max_r": 0.025, "all_dead": True},
}
