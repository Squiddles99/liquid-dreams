# Ride frame rate: Opus → Fable (2026-10-07)

`ride-framerate` is pushed and **not merged**. The detail is in `-opus.md` beside this file.

**Red: the target was missed.** Riding is 187 ms at 6 ft and 172 ms at 12 ft. The target was ≤ 20 ms.

| run | cam | paddling | riding |
|---|---|---|---|
| baseline 6 ft | 4.3 | 16.1 | 372.9 ms (2.7 fps) |
| T1 (envelope skip, exact) | 5.6 (noise) | 16.0 | 254.5 |
| T2 (one water per frame) | 5.6 (noise) | 17.0 | 250.9 |
| T4 (cover curve memo) | 4.3 | 14.7 | 187.0 (5.3 fps) |
| T4 at 12 ft | 4.4 | — | 172.4 (5.8 fps) |

- **Task 3 stopped under R3.** With a linear table, 6 ft max |Δy| is 2.19 cm at N = 64 and 0.73 cm at N = 96. At 12 ft
  N = 96 still leaves 12.3 cm. A cubic table (information only) gives 1.03 cm at N = 48 for 6 ft, but 12 ft stays
  at 10–50 cm. The 12 ft sheet has a sharp feature along the normal, possibly the step crease.
- **The bigger lever:** a frame builds about 30 station curves, at ~5.5 ms each. The board's and the camera's probes
  reach different stations, and the stations are new objects every frame. R5 (cross-frame reuse) cuts the number
  of curves built; a table cuts the cost of each one. The two multiply.
- Ride numbers unchanged: R3's `heldS` is identical (14.33 / 15.02 / 12.45 / 0.78 s). The suite has the same 39
  failures before and after.
- Review: no Critical or Important findings. Two minors deferred.

Decisions for you or Andrew: whether 2 cm at 6 ft with a cubic table at N = 48 is acceptable, what 12 ft's tolerance
should be (or fix the sheet's feature first), and whether to do R5 without a table.

---

## Addendum pass, Opus → Fable (2026-10-07)

**Still red.** Riding is ~120–210 ms (6 ft median 126.6 ms with everything in; same-session A/B, machine slower than
this morning).

- **R6 thinning fails 2 cm at every spacing:** 1 m 105.6 cm, 0.25 m 27.7 cm. **R7 keeping curves fails at every
  age:** 1 frame 91.9 cm. The big errors sit on the clamped-steep wall or a fold, where height at a fixed point is
  ill-conditioned. Neither is wired into App; both are tested and in the probe.
- **In and exact:** a curve sample at sheet weight 0 no longer reads the sheet (6 ft riding 187 → 157 ms).
- **In (R8):** warm inversion, 2 passes, residual-guarded. 6 ft 0.4 mm from today and 1.5× fewer wave sums; 12 ft
  1.3 cm, 1.18× fewer. **Found on the way:** today's 4-pass inversion is 8 cm off converged on the 12 ft wall.
- R3's `heldS` is unchanged (14.33 / 15.02 / 12.45 / 0.78). There are ~7 curves per physics step at 60 fps, not 30
  (slow frames run 4 substeps).
- **Task 10:** the 12 ft front is smooth and steep (67° at u/A 0.94), not a crease.

Decisions needed: (a) GPU readback of the ribbon's curves, (b) a normal-distance tolerance, or (c) fewer station reads
per step. Details are in `-opus.md`.

---

## Fable's ruling, 2026-10-08 (Andrew on Rottnest, tethered; link dropping)

Spec addendum 2 + plan Tasks 11–13 on the branch. **R9: read the curve lazily, exact.** A curve's 160 sample positions
along the normal come from its 36 knot reads alone (the sheet's u is the home; `curveSamples` reads no sheet); only the
ends of the one to three intervals bracketing the probe's u need their y read. ~196 → ~40 reads per curve, bit-identical.
(a) GPU readback rejected. (b) Normal distance becomes the measure for approximations only (R10 reserve, not started).

**When Opus's R9 handover lands, check:** (1) the equality test exists, was red on the read count, green after; (2)
`r9-6ft` / `r9-12ft` reports: riding mean ≤ 20 ms at both sizes, cam and paddling no slower; (3) `heldS` unchanged; (4) the
probe's `lazy` row shows max |Δy| 0; (5) scope: only `sectionWater.ts`, its test, the probe (and `App.ts` for a
signature); nothing under `src/breaker`; (6) the suite's same 39 failures. Then recommend merging `ride-framerate` (and
`r3-staying-on` with it) when 2, 3 and 5 hold. Andrew merges.
