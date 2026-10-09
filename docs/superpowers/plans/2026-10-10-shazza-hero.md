# Shazza hero build — plan

Spec: `docs/superpowers/specs/2026-10-10-shazza-hero-design.md`. Branch `shazza-hero`. Executed inline (overnight
ruling: the work is one Blender pipeline judged by eye; subagents would each need the whole context).
Ledger: `docs/superpowers/plans/2026-10-10-shazza-hero-ledger.md` (commit after every task; flaky-connection rule).

Blender: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, MPFB 2.0.17. Fit solver: `py -3.11` with
numpy + scipy (installed 2026-10-10). Probes live in the scratchpad, never in `src/`.

| # | Task | Done when |
|---|---|---|
| 1 | Scaffold `tools/hero/` (`build.py`, `common.py`), `npm run build:hero`, git-ignore `build/` | an empty build runs and writes `build/hero/female/` |
| 2 | Reference marks: crops + grids of the painting, marks in `tools/hero/ref/female.json`, overlay check image | overlay shows every mark on its feature |
| 3 | Model marks: front clay render, the same marks picked → vertex indices in `tools/hero/ref/model_marks.json` | overlay on the render shows every mark on its feature |
| 4 | Fit: export target deltas (`fit_export.py`), solve (`fit_solve.py`, scipy lsq), apply + RBF residual (`fit_apply.py`); Gate 1a pack | face error < 3 % IOD; pack in the gates folder |
| 5 | Hero mesh: subdivide, keep UVs, game decimation from the same bake | tri counts within spec; UV tile intact |
| 6 | Skin: procedural skin nodes, bake 4K/2K maps, Cycles look-dev scene matching the painting's light | front render beside painting |
| 7 | Eyes (cornea, iris, tear line, occlusion) and mouth | face close render |
| 8 | Hair curves: part, front sections, two plaits, elastics, flyaways; Principled Hair | 3/4 and back renders |
| 9 | Bikini (cups, bindings, halter, band, back tie, tie-side bottoms, strings) + thongs, cloth settle | outside check passes |
| 10 | Gate 1b pack: front, 3/4, side, back, face close beside the painting | pack committed |
| 11 | Rig: twist bones, toes, braid + string chains, correctives with drivers; game variant `.glb` export | weights ≤ 4 in game variant; glb loads in three.js (node check) |
| 12 | Gate 1c: five surf poses rendered, checked | pack committed |
| 13 | Handover notes (`docs/superpowers/handover/2026-10-10-shazza-hero-*.md`) + memory | files committed |

Gates 1a and 1b go to Andrew for sign-off; tonight I continue past them on my own judgement and record why in the
ledger, so his morning notes can send any step back.
