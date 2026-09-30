"""Prints what the build relies on in this Blender + MPFB (npm run build:surfers -- --probe)."""
import inspect
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import mpfb_bridge  # noqa: E402

out_path = sys.argv[sys.argv.index("--") + 1]
lines = [f"blender {bpy.app.version_string}", f"mpfb module {mpfb_bridge.module().__name__}", f"mpfb {mpfb_bridge.version()}"]
hs, ts = mpfb_bridge._services()
lines.append("create_human" + str(inspect.signature(hs.create_human)))
lines.append("add_builtin_rig" + str(inspect.signature(hs.add_builtin_rig)))
lines.append("macro keys " + str(sorted(ts.get_default_macro_info_dict())))
bpy.ops.wm.read_homefile(use_empty=True)
body = mpfb_bridge.create_human({"gender": 0.0})
rig = mpfb_bridge.add_game_rig(body)
lines.append("vertex groups " + str(sorted(g.name for g in body.vertex_groups)))
lines.append("bones " + str([(b.name, b.parent.name if b.parent else None) for b in rig.data.bones]))
lines.append(f"body scale {tuple(body.scale)} rig scale {tuple(rig.scale)} parent {body.parent.name if body.parent else None}")
lines.append(f"shape keys {len(body.data.shape_keys.key_blocks) if body.data.shape_keys else 0}")
lines.append("modifiers " + str([(m.name, m.type) for m in body.modifiers]))
open(out_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
