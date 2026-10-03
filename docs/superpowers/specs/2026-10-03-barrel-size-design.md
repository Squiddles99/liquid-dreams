# The barrel's size: the tube sized from the face it was thrown from

Approved with Andrew in chat, 2026-10-03, section by section. The first of three barrel sub-projects (Andrew's order):
1. the tube's size (this spec);
2. the lip and tube look (colour, light, foam zones);
3. whitewater up close.

## 1. Why

- **The target.** Andrew's side-on markup of a 12 ft wave (2026-09-30), confirmed on 2026-10-03 as an **ordinary 12 ft**
  wave (mid tide, in a set):
  - the tube is about 8 m wide and 10 m tall, its back wall about 4 m ahead of the crest;
  - the lip top is about 7.5 m above still water;
  - the lip tip lands about 13 m ahead of the crest, at about −1.5 m;
  - the lip is about 1.5 m thick.
- **Ideal is bigger.** An ideal 12 ft wave (the best tide, after a lull, offshore) should be bigger still: the
  truck-sized barrel, thrown further.
- **Today's tube is about half that size.** Measured side-on at the peak when the lip lands, on main 7a3f33e, for all
  three 12 ft cases (ψ 0.071–0.079):
  - the lip top is about 4.2 m above still water;
  - the face, crest to trough, is about 7.8 m;
  - the lip lands about 6.5 m ahead, in the trough at about −3.6 m;
  - the tube is about 6–7 m wide × 6 m tall, carved back into the face;
  - the lip is about 1 m thick.
- **The cause.** The tube is sized from the wave at the station where the lip is now. The station is the cross-section
  through the crest that the ribbon draws, and its sizing comes from `profileFrame`: `input.H` is the station's
  `localHeight`, and H_I is solved on the station's own frame sheet. By the time the lip lands (about 1.4 s after onset)
  the station is 15–20 m inshore, over the shallowing reef top, where the face has decayed to 7–9 m.
- **The face it was thrown from.** Along the peak's ray, for the biggest 12 ft set wave at mid tide, the sheet's face
  (crest minus the lowest water ahead):

  | Where | Face |
  |---|---|
  | Over 15–16 m of water | about 7.5 m |
  | At onset on the ledge edge | 8.2 m |
  | At the peak | **12.6 m** (crest +6.8 m, trough −5.8 m) |
  | 15–20 m inshore, where the lip lands | 7–9 m |

  The face grows while the lip is in the air (the trough drains, the crest pitches up), then decays.
- **The maths gives the target.** The jet's size is set as it is thrown. Pick & Feddersen's fits, fed the tallest face
  since the throw (≈12 m) at ψ ≈ 0.075, give a tube of about 50 m², the size of Andrew's 8 × 10 m tube. No fudge factor
  is needed.

## 2. What changes (agreed)

- **The tube's size comes from the tallest face since the throw.** For each section of the wave, the tube's size uses
  the tallest face that section reached between its onset and now (bounded by how long its lip is in the air). That sets
  the tube's width and height and the lip's thickness. The barrel's shape still comes from ψ (Pick & Feddersen); only
  the height fed into it changes, from the station's face now to the tallest face since the throw.
- **The landing still reads the real water** under the landing point, so the lip lands where the water actually is.
- **Expected:**
  - ordinary 12 ft at about Andrew's orange;
  - ideal 12 ft bigger and thrown further (larger throw face, heavier ψ after a lull);
  - 8 ft in proportion, smaller.
- **Not changing:** where it breaks, the peel, the closeout, the reef, the flow and the kelp, and the foam colouring
  (sub-project 2).

## 3. Where it lives (agreed, after measuring both candidates)

The face can't come from a formula: at the peak the sheet's drain and crest pitch make it 2.7× the record's local
height. It must be read from the real sheet (`sumWaves`).

### 3.1 Measured, 2026-10-03

- **(a) Baked with the reef field: chosen.**
  - Today's field bake is 4.8 s.
  - One face reading (the crest plus 8 points ahead) costs 0.086 ms.
  - The node-levels broken within LIP_THROW_S + 1.5 s number 208k on the 1 m grid (+17.8 s) and 52k on a 2 m grid
    (+4.5 s).
  - So the bake goes from 4.8 s to about 9.3 s, only when conditions change (tide, size, direction, period), in the
    worker, while the old field keeps playing.
  - Nothing per frame.
- **(b) Per frame, along each station's history: rejected.**
  - 111–152 throwing stations at a 12 ft set.
  - Uncached: 25–65 ms a frame. Cached at 2 m probes: about 5–7 ms a frame of main-thread time, against today's
    1–3 ms trace.

### 3.2 The bake

- **When it runs:** after the onset record (`computeReefField`, in the field worker), a second pass.
- **What it reads:** for each 2 m node and each onset level k whose section is broken there with
  tb ≤ LIP_THROW_S + 1.5 s, the face for a wave of level k's height, with its crest at the node. The face is the sheet's
  crest there minus the lowest water within 2.5 H ahead along the ray. It's read from the full sheet (`sumWaves` with
  breaking, on the finished record).
- **How it's carried:** the tallest face is carried along the ray in arrival order (the record's own semi-Lagrangian
  march), while the section's lip is in the air. It's stored as one more value per node and level: the throw face, in
  metres, or ×H. It lives on the CPU field only.
- **Where nothing breaks,** the value is absent: the station's own face is used.

### 3.3 At run time

- **Tracing:** `traceStations` reads the throw face for each station (its place, its wave's onset level) into a new
  `Station` field. It's packed into the station row the ribbon uploads, and the GPU frame pass reads it.
- **Sizing:** `profileFrame` sizes the tube from the larger of the throw face and the station's own H_I. Every length
  of the tube, and the lip over its top, scales with it, as H_I does today.
- **The landing:** it still solves where the point meets the station's water (impactHeight's rule from 7a3f33e: a
  point under the water at the sizing height keeps it). Still over the water at 2× it, profileFrame drops the tube onto
  the water (plan ruling 3, unchanged).
- **The GPU:** `lipProfileNodes` mirrors the change term by term.

## 4. Testing, and the gate

### 4.1 CPU tests

- **The throw face:**
  - at the peak at 12 ft it matches the sheet's 12.6 m face there (within 5%);
  - it is never less than the station's own face;
  - it is absent where the section hasn't broken.
- **The tube, ordinary 12 ft** (mid tide, in a set), when the lip lands at the peak's station:
  - 7–9 m wide and 8–11 m tall, both measured as the largest horizontal and vertical chords of the air enclosed by the
    lip and the face;
  - lip top 6.5–8.5 m above still water;
  - the tip lands 11–15 m ahead of the crest;
  - the lip is 1.2–1.8 m thick, measured at the top of the tube, normal to the lip.
- **Ideal against ordinary:** the ideal 12 ft tube's enclosed area is at least 10% larger than ordinary's. The 8 ft tube
  is smaller than ordinary 12 ft's.
- **Nothing else moves:**
  - the reef report's criteria (where it breaks, the peel from the peak, the closeout, the small days);
  - lipProfile's no-jump landing test (7a3f33e) and its "never crosses itself" test;
  - the whole suite.
- **The rebuild time,** measured and reported, against about 9.3 s.

### 4.2 GPU

- The ribbon self-tests (GPU profile against lipProfile), with the throw face in the station rows.
- A self-test that a station's throw face changes the GPU tube: a larger value gives a larger tube.

### 4.3 Andrew's gate, before merge

- Side-on drawings, before and after, for ideal 12 ft, ordinary 12 ft and 8 ft, with his orange target.
- In-game shoulder views, before and after.
- The rebuild time.

It ships on its own branch (`barrel-size`) and merges to main only on Andrew's word.

## 5. Out of scope

- **Sub-project 2:** the lip's colour, light and see-through, the clean tube inside, the foam zones, and the dark
  "blades" (the lip's foam streak pattern, found on 2026-10-03 to be shading, not geometry).
- **Sub-project 3:** whitewater up close (the sharp white pyramids when the camera is inside the explosion).
- **The sheet:** its own shape (the water surface) is unchanged; only the ribbon's tube and lip are resized.

## Amendment, 2026-10-03 (Andrew: "ok go with A")

Measured after the hollow face (Andrew's red line) merged into this branch, sections 2–4 changed:

- **No new bake.** The onset record already carries the height each section stood at as it threw its lip (its `lipH`,
  the tallest within LIP_THROW_S of onset), within 1% of the tallest station height since the throw at 4–12 ft. The
  crest above still water is 0.675 × the height throughout the throw, so the crest the lip was thrown from is
  K × lipH / H. Stations carry lipH (packed last in the station row's third vec4); the bake and its +4.5 s are dropped.
- **The tube hangs from the throw crest** (K raised by crestLift) and is sized × the throw height (impactHeight's scan).
  Hanging it from the sunk crest alone reached only 6.1 × 5.3 m.
- **The lip is 0.42 of Pick & Feddersen's jet area** (LIP_JET_SHARE): their whole jet as one band made a 2.8 m lip at an
  ordinary 12 ft wave against Andrew's 1.5 m, and its thickness came out of the tube.
- **The lip's back has no step:** it eases from the throw crest down to the wave's back over the back segment; after the
  landing the pile fills under the root first.
- **The hollow face's floor is the trough's** (never sags below the lowest of the landing, the face's foot and the wave's
  foot), and the face's join no longer steps out toward the trough (FACE_CONCAVE_STEPS, made for the old Hermite face,
  moved the foot 4 m between waves 0.25 ft apart once a bigger tube landed past it).
- **Result, ordinary 12 ft at the landing:** tube 8.9 × 8.3 m (was 5.4 × 4.6), tip 11.7 m ahead, lip 1.54 m. The orange's
  10 m height and 7.5 m lip top wait on the water at the peak (option B: crest +5.5 / trough −5.9 m against about
  +7.5 / −4 m).
- **Ideal against ordinary (ruling):** the tube is sized until its point meets the water, so at one wave height over the
  same water a heavier ψ reaches it at about the same size: ideal throws ≥ 0.5 m further (12.8 against 11.7 m) and is
  no smaller, rather than ≥ 10% larger. A bigger ideal tube is option B's.
- **Tests:** barrelSize.test.ts (ordinary 12 ft: 7–9 m wide, ≥ 6.5 m tall, tip 11–15 m, lip 1.2–1.8 m; ideal vs
  ordinary; 8 ft < 0.6 × ordinary; no jump between waves 0.25 ft apart), hollowFace.test.ts (the lip's back, the floor).
