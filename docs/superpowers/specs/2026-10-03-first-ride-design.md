# First ride (riding physics v0) — design

Andrew, 2026-10-03: "What I really want is to be able to try surfing a wave… even a crude first try." Scope agreed in
chat ("go"). Roadmap: surfer-protagonist sub-project 2 (riding physics), crude first cut. One gate: Andrew rides it.

## What it is

Press **G** (or the Surfer panel's *Go surfing*) and you are on your board in the lineup at the Womb with a set on the
way. Paddle into a wave, pop up, ride it, wipe out. A chase camera follows you.

## Out of scope (v0)

Real barrels (the lip is drawn by the ribbon, which the physics doesn't know: you ride through it), duck-diving, tricks,
scoring, the crew riding, AAA HUD (hints use the dev flash line for now).

## Pieces

1. **The water under the board** (`src/ride/water.ts`). The set waves' surface on the CPU: `sumWaves` with the render's
   break options (breaking and the whitewater pile included), its Lagrangian displacement inverted by fixed-point steps
   like `HeightProbe`, plus the tide. Returns height, slope, foam and the water's flow (`flowFromEta`). The FFT chop is
   not in it (the board may sit a few cm off the drawn chop; fine for v0).
2. **Board physics** (`src/ride/ridePhysics.ts`, pure, tested). The board is a point on the surface with a heading:
   - gravity along the surface: −g∇η/(1+|∇η|²);
   - drag relative to the water: light along the board (linear + quadratic, planing), strong across it (rail and fins
     grip: the board goes where it points);
   - phases `paddle → caught → popup → ride → bail | kickout`;
   - paddle: thrust along the heading to ~1.6 m/s, A/D turn;
   - catching (assisted): paddling while the face lifts the tail (downhill slope along the heading) pushes the board up
     toward the wave's speed; once moving with it, Space pops up;
   - ride: A/D carve (turn rate grows with speed), S crouch, W stand tall;
   - wipe out in the whitewater (foam), on a near-vertical face (over the falls), or by not popping up before the wave
     passes; the ride ends (kickout) when the board stalls behind the crest;
   - bail lasts 2 s, then you are back paddling where you are;
   - the wave carries you (the arcade part): standing on its front face, the board grips against water moving with the
     wave at 0.9 × its speed, so a rider angled along the face stays on it; over the back, nothing.
6. **The set**: G calls a set and starts you on its biggest wave, 10 s before it reaches the peak, at (−10, 3) facing
   the swell's travel; R moves on to the set's next wave.
3. **Controls** (`src/ride/rideInput.ts`): keyboard (W/S/A/D or arrows, Space, R, G) and a standard gamepad (left stick,
   A pop up, right trigger paddle / stand tall, left trigger crouch, B next wave).
4. **Chase camera** (`src/ride/rideCamera.ts`): behind and above the board along its travel, smoothed; the free camera
   stays put while riding (WASD drive the board, not the camera).
5. **Posing** (`src/ride/ridePose.ts`): the ride state picks the surfer's pose and dials (sit, paddle, popup, drop then
   trim with lean from the carve, bail) and the board frame (surface normal, rolled onto its rail in a carve). The stand
   takes that frame instead of probing.

## Tuning found (2026-10-03, bot rides on the default conditions)

Lefts run 14–16 s at ~36 km/h to the inside; rights close out in 2–4 s (the Womb: the left runs, the right closes out).
`tools/captureRide.mjs` rides wave 1 with a bot and saves frames.

## Done when

Andrew can press G, catch a set wave at the Womb, stand up, carve along it and wipe out or kick out — crude, but a ride.
