"""Every call into MPFB lives here, so an MPFB version change is fixed in one file (plan Task 7)."""
import importlib
import os

_CANDIDATES = ("bl_ext.blender_org.mpfb", "bl_ext.user_default.mpfb", "mpfb")


def module():
    """MPFB, enabled (registered) in this Blender: in --background its register() hasn't run until we ask."""
    import addon_utils
    for name in _CANDIDATES:
        try:
            mod = importlib.import_module(name)
        except ImportError:
            continue
        if getattr(mod, "MPFB_CONTEXTUAL_INFORMATION", None) is None:
            addon_utils.enable(name, default_set=True)
            mod = importlib.import_module(name)
        if getattr(mod, "MPFB_CONTEXTUAL_INFORMATION", None) is None:
            raise SystemExit(f"MPFB ({name}) is installed but would not register in this Blender.")
        return mod
    raise SystemExit("MPFB is not installed in Blender. See tools/surfer/README.md.")


def _services():
    base = module().__name__
    hs = importlib.import_module(base + ".services.humanservice").HumanService
    ts = importlib.import_module(base + ".services.targetservice").TargetService
    return hs, ts


def version():
    root = os.path.dirname(module().__file__)
    manifest = os.path.join(root, "blender_manifest.toml")
    if os.path.exists(manifest):
        for line in open(manifest, encoding="utf-8"):
            if line.strip().startswith("version"):
                return line.split("=", 1)[1].strip().strip('"')
    info = getattr(module(), "bl_info", {})
    return ".".join(str(v) for v in info.get("version", ("unknown",)))


def create_human(macro):
    HumanService, TargetService = _services()
    details = TargetService.get_default_macro_info_dict()
    for key, value in macro.items():
        if key not in details:
            raise SystemExit(f"MPFB has no macro detail '{key}'; it has {sorted(details)}")
        details[key] = value
    return HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True,
                                     feet_on_ground=True, scale=0.1, macro_detail_dict=details)


def apply_targets(basemesh, targets):
    """Load MPFB's detail targets (face shape) as weighted shape keys; build.py bakes them in with the macros."""
    _, TargetService = _services()
    for name, weight in targets.items():
        path = TargetService.target_full_path(name)
        if not path:
            raise SystemExit(f"MPFB has no target '{name}' (see its data/targets folder)")
        TargetService.load_target(basemesh, path, weight=weight, name=name)


def add_game_rig(basemesh):
    HumanService, _ = _services()
    return HumanService.add_builtin_rig(basemesh, "game_engine", import_weights=True)
