# One curl, one clock (wave form step 4): handover for Fable

**From:** Opus 5.5 (executor), 2026-10-08. Branch `one-curl` from main 8863430, pushed, **not merged**. Spec
`specs/2026-10-08-one-curl-one-clock-design.md`, plan `plans/2026-10-08-one-curl-one-clock.md`, ledger
`.superpowers/sdd/2026-10-08-one-curl/progress.md` (git-ignored; every ruling is also below). Details: `-opus.md`.

**The segment is STOPPED for your ruling** (plan Review Focus 5): the 6 ft expert's `heldS` moved by more than 0.5 s. It
moved the good way (0.78 s → 14.37 s: R3's known red now rides the whole wave), and the cause is the unwarped ledge (Task 3),
not the curl. No code changed after that finding; the captures and these notes are evidence for the ruling.

## What changed, and why

1. **Task 0, the boot picture's water.** Verdict: *a pending build*, `MeshBasicNodeMaterial (output)`, pending when the
   boot cover dissolved on the 4 s give-up and landing 1.15 s later (the sea missing from the picture meanwhile). The boot
   gate's give-up now waits while builds are pending (`SmoothFramesGate.frame(dt, now, blocked)`, cap 15 s); transitions
   unchanged. Three fresh boots: the water present in the first frame after the dissolve in all three. **Gate missed:** the
   cover is 3.0–3.7 s longer, not ≤ 2 s: that build lands ~7 s after the crew on this machine. Kept (the sea-less picture
   was the bug). Follow-up if the 3 s matters: label that material and prewarm it earlier.
2. **Task 1, `until` carries the hold.** `fillUntil`: a broken node's until is `max(0, −tb)`, so along each ray it falls to
   0 at the section's turn. Stations: `wait`, `holdDownTheLine`, `standing` gone; on the record the unbroken phase is the
   clock alone (`STOOD_PHASE · wallWeight(until)`). **Spec correction:** `breaking.onsetUntil` and the GPU's
   `onsetTimeNode` read 0 for *any* broken section, held included, so the record change alone never reached the stations
   or the GPU's held sections. Stations take `until = −tb` while held (equal to the record's channel); shaders untouched,
   so the GPU still stands a held section at r = 1 as before (the spec's "the GPU wall stands up before a held section's
   turn" does not happen). The record's carry upstream does reach all three readers' *unbroken* branch.
3. **Task 2, the curl in the bake.** `curlClock.ts` + `computeOnsetRecord` (second march always). Three rulings changed the
   design's letter:
   - **Lines are connected components, linked within `CURL_LINK_CELLS` = 10**, not `peelLines`' sections (which keep a
     pocket that formed ≥ 1.5 s before the line met it as its own section: exactly the second section §1 forbids), and not
     3 cells (the real north ledge's onset band has gaps up to ~6 m: at 3 it split into 4 lines, each curling alone).
   - **The formula keeps monotonicity:** `T′ = max(T, max_U T′(j), min_U (T′(j) + d/v))`, U = upwind neighbours
     (`s(i) − s(j) ≥ ½ d`), s by Dijkstra. The spec's `max(T, min_j(T′j + d/v))` is not monotone with a neighbourhood
     wider than one cell (its own pocket test fails).
   - A higher level's curl never precedes the level below's on a ray (`afterLower`); holds under 1 ms are float32 noise.
4. **Task 3, the ledge unwarped.** The face, ledge and shelf ramp read the ledge at the unwarped point; 3 m seaward of the
   north ledge the depth now holds within 0.3 m over 100 m (was 4.1–10.2 m). **And `curlMaxMs` 20 → 40** (ruling, below).

## Numbers to rule on

- **`curlMaxMs`: I set 40 (the clamp's top).** Each level's line starts at the south ledge's far end (z ≈ +245, T ≈ −17 s
  at 6 ft) and the front sweeps up the right at ~20 m/s; at 20 the floor's holds piled up through the peak and the 6 ft first
  leg broke 1.4 s late (8 ft 0.7 s): Review Focus 2 fails. At 40 and at ∞ the first leg is the bake's own at all sizes.
  At 12 the first leg starts 5.6 s late at 6 ft. So **on this reef the speed floor can't be a noise filter**: any value
  that binds anywhere on the line binds at the peak. If you want the floor, it needs a different origin (curls from the
  peak, not from the line's first break), which is a design change.
- **Cap share (Review Focus 4): 0.0 %** of first-leg onset nodes at the cap at 6, 8, 12 ft for 40, 20 and 12 m/s. Whole field
  at 40: the cap is hit only at the south ledge's far end (≤ 0.1 % of level-5 nodes). Holds at 40 (raw bake, 6 ft level):
  north 0 % (max 0.07 s), south 0–150 m 42 % (max 2.75 s, but the right's first 90 m is unchanged: physical = curl), far
  south ≥ 150 m 82 %. `t3-reef.txt`.
- **What the curl does on this reef at 6–12 ft: almost nothing where the ride is.** The raw bake's onset is already monotone
  along the north ledge (the Task 2 field test and the Task 4 traced-line guard are green on main's bake too: they guard,
  they didn't catch). The synthetic jut test is what bites. Its work is at the far south end.
- **The peak's onset (Review Focus 2):** curl vs no curl (both unwarped) within 0.002 s at 6/8/12 ft. **Against main** the
  peak breaks 0.141 / 0.018 / 0.056 s later: the unwarped ledge's doing (6 and 12 ft over the 0.05 bar).
- **The unwarped ledge's other effects (new reds, all persist with the curl off):** r1Reef first-leg peel 11.4 / 11.3 m/s
  at 6 / 8 ft (R1's bar 9–11; main 10.1 / 10.0); peakFace 6 ft "breaking" (stage 0.00 vs main's 0.01: on the edge either
  way); breakingField seams 0.48 m (bar 0.15) at (2, −5.5), a 0.575 m spike (bar 0.5) at (48, −90) at 12 ft, a 3 m terrace
  (bar < 3); crestTrace |ξ| 2.67 ms (bar 2); reefField running max −0.2 % along one ray. And the **6 ft expert rides**.
- **Smoothing σ (Task 4, `t4-smoothing.txt`):** the curl's width (phase 1 → 0.45, 6 ft, peak + 3 s): onset σ 8 / station
  σ 4: 13 m; 8 / 2: 7 m; 4 / 4: 13 m; 4 / 2: 10 m.
- **A along the first leg at 5 %: red** (10 m 7.9 %, 25 m 4.8 %, 40 m 6.5 %); not loosened. It was red at 8 % on main too.

## The ride (`t5-ride.txt`)

`src/ride` 92/92 green. `heldS` vs main: 12 ft int −0.02, 6 ft beginner −0.13, 6 ft int 0.00, **6 ft expert +13.59 s**.
Probe `lazy (R9)` 0.00 cm. `_rideProfile --ft=6 --sim-t=300`: caught 396.69, riding pass 397.62–402.46 s, median 29 ms;
arrival 0.6 s earlier than main's (the take-off spot moved with the reef).

## Captures

`liquid-dreams-captures/one-curl-2026-10-08/t5/`, listed in `docs/superpowers/evidence/one-curl/t5-captures.md` with what
each shows. Andrew's lineup link isn't recorded anywhere I could find (memory has only "~1393.3 s, dune sets on"), so the
lineup pair is that time with R1's down-the-line camera, not his.

## Left (spec §6 and new)

Peel speed and δ; the smoothing σ (measured); the ribbon zipped to the sheet and the lip's streaks; lineup truth; blocky
patches; R4. New: the speed floor's origin (above); the GPU's held sections on the clock (§3b didn't reach them); the boot's
late `MeshBasicNodeMaterial`; the eight unwarp reds; a ruling on whether the expert's rescue is wanted or a symptom.
