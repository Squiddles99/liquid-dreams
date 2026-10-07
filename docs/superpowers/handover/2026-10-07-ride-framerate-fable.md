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
