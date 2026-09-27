# Liquid Dreams Phase 3b ("Offshore spray") Design

**Date:** 2026-09-27
**Authors:** Claude, with Andrew Justice
**Status:** Approved by Andrew 2026-09-27. Implemented on `phase-3b-offshore-spray` (plan `docs/superpowers/plans/2026-09-27-offshore-spray.md`) overnight under his delegation; awaiting his review.
**Builds on:**
- the vision spec (`2026-09-25-liquid-dreams-first-light-design.md`): Phase 3 and the `whitewater/` module;
- the breaking ribbon (`2026-09-27-breaking-ribbon-design.md`): the crest trace and the lip profile;
- Phase 3a (`2026-09-27-foam-field-design.md`): fixed 20 Hz sim-time ticks, replay on jumps, and deterministic moments.

Their world conventions, CPU-reference/GPU-mirror testing, the 8-storage-buffer baseline and the GPU budget all still apply.

---

## 1. What Andrew asked for

Phase 3b is the whitewater particles: offshore spray, the lip impact explosion and spit. Andrew put **offshore spray** first, and it is the whole of this build. The explosion and spit follow, reusing this particle system.

Andrew's answers:
- **Offshore spray comes only off the throwing lip.** It streams back off the lip along the breaking section. Nothing comes off the unbroken shoulder, the face before it throws, or the whitewater.
- **Particles** (approach A), not veil sheets or a volume.
- **Assumptions confirmed:**
  - spray needs an offshore wind, grows with its speed, is absent on a glassy day, and is blown up and back over the wave;
  - an onshore wind gives little or none;
  - backlit by the morning sun it glows gold; with the sun behind the viewer it is faint white;
  - a veil lasts a second or two, trails back a wave height or two, thins into the air and leaves no foam.

## 2. What Andrew should see

On a morning offshore, looking from the lineup toward the sun, each breaking wave throws a veil of mist up and back off its lip along the whole breaking section. The veil glows gold, streams seaward on the wind and thins out within a couple of seconds. Side-on and from behind the wave it has depth: a sheet of streaky mist above and behind the crest. With the sun behind you it is a faint white haze. On a glassy morning, or once an onshore wind is in, the lip throws no veil. The same moment always shows the same veil.

## 3. Design

### 3.1 Emitters (new `src/whitewater/sprayEmitters.ts`, CPU)

Emitters are worked out on each spray tick at tₖ = k·Δ in sim time, with Δ = 0.05 s. The ticks use Phase 3a's `FoamSchedule` logic (ticks in (previous, current]; none while paused; a replay after a jump).

- **The trace:** the crest trace (`traceStations`) runs at tₖ with the frame's wave context and break params. For each live station, the CPU lip profile (`profileFrame`) gives:
  - the lip tip (`R`, in the station plane: u along the crest normal, y up);
  - the throw speed (`vj`);
  - the throw progress `prog`;
  - the weight;
  - `rho`.
- **Which stations emit:** a station emits only while its lip is mid-throw:
  - it has a time since onset (`tb` not null and finite);
  - 0 < `prog` < 1, meaning thrown and not yet landed;
  - `weight · rho` > 0.1, meaning the constructed lip is actually drawn.
- **Emitter spacing:** emitters are placed about every 1.5 m of crest arc. That means the stations nearest each 1.5 m step of `arc`, per wave.
  - **As built:** the stations of a camera-independent trace at a fixed spacing (plan S1), set to **3 m** (§3.5 lever 1, after measuring). Births scatter half a spacing either side along the crest. The lip profile's base sums only the station's own wave; the set-wave envelopes are tight enough that the others contribute nothing at its crest.
- **Emitter data:**
  - **world position:** the station xz plus n·R.u, and height R.y plus the tide;
  - **lip velocity:** vj along n (the throw direction);
  - **strength:** `weight · rho · windFactor · sprayAmount`.
- **The wind factor:** let `windTo` be the unit vector the wind blows toward (its from-direction + 180°, in world xz), and n the crest normal (the wave's travel). Then:
  - offshore speed `w_off = windSpeed · max(0, −dot(windTo, n))`;
  - `windFactor = smoothstep(1, 6, w_off)` (m/s).

  So there is none when glassy or onshore, and full spray from 6 m/s of offshore.
- **Births:** each emitter gets `n = floor(strength · SPRAY_RATE · 1.5 m · Δ + carry)` particles. `SPRAY_RATE` (particles per metre of lip per second at strength 1) is a constant set in the plan so that the pool is never exhausted. `carry` is a deterministic per-emitter fraction from a hash of (tick, wave id, arc step), so fractional rates still emit on average.
- **Pool slots:** births take pool slots in order from a running head, modulo the pool size, in a fixed order (wave, then arc). Which slot is born when depends only on the tick sequence, never on frame rate.
  - **As built (plan S2):** tick k's births take slots `(k mod 100)·320 + i`, in a pool of 32,000 (not 32,768). So a replay reproduces live play slot for slot, and at most 320 puffs are born per tick. The random draws are computed on the CPU with a PCG hash and uploaded with each birth (plan S4).
- **The seed:** every random choice (scatter, kick, lifetime) is a hash of (tick index, slot), so the CPU reference and the GPU agree.

### 3.2 Particles (new `src/whitewater/SprayParticles.ts`, GPU; CPU reference `sprayStep.ts`)

- **Pool:** 32,768 particles in storage buffers: position + age (vec4), and velocity + life (vec4).
  - Each tick, CPU → GPU: the births list (slot, emitter position, lip velocity, strength) goes up in a small upload buffer, capped per tick. The plan sets the cap and keeps the total within the pool at the maximum rate and life.
  - The passes are **birth** (writes the born slots) and **step** (advances every live particle).
- **Birth:**
  - **position:** the tip, plus scatter of ±0.4 m along the crest and 0–0.3 m up;
  - **velocity:** 0.5 × the lip velocity, plus an upward kick of 2–4 m/s, plus ±1 m/s of random;
  - **life:** `sprayLife` × U(0.6, 1.2);
  - **age:** 0.
- **Step (per tick, Δ = 0.05 s):**
  1. `v += (windVel − v) · min(1, Δ/τ)`, with τ = 0.45 s. `windVel` is the wind vector at `windSpeed`, horizontal.
  2. `v.y −= 1.2 · Δ`: mist settles slowly.
  3. `p += v·Δ`.
  4. `age += Δ`.
  5. A particle with age ≥ life is dead: it's skipped in the step and drawn with zero size.
- **Between ticks:** the vertex stage draws each particle at `p + v·(t − tₖ)`, so motion is smooth at any frame rate while the state steps only on ticks.
- **Dev sliders** (a new Spray folder, persisted with the look):
  - `spray amount`: 0–3, default 1;
  - `spray life (s)`: 0.8–4, default 2.
- **Debug overlay:** `spray tint` colours particles by age fraction, from green at birth to red at death.

### 3.3 The look (`SprayParticles` material)

- **Shape:** one camera-facing quad per particle, stretched along its screen-space velocity (up to 3:1), so the veil reads as streaks.
  - **Size:** 0.3 m at birth, growing to 2 m at death (linear in the age fraction).
  - **Alpha:** it fades in over the first 0.1 s and out over the last 40% of life.
  - **The sprite:** a soft radial falloff broken by one octave of noise that rides with the particle (seeded per slot), so neighbouring puffs don't repeat.
- **Light (single scattering):** radiance = `albedo · (sunIlluminance · HG(cos θ, g) + skyIrradiance / 4π)`, where:
  - HG is the Henyey–Greenstein phase function with g = 0.75;
  - θ is the angle between the view ray and the sun direction;
  - the albedo is 1 (water droplets).

  So the veil is gold and bright when backlit and faint white when front-lit. The sky's aerial perspective is applied by distance. The sun and sky terms come from the same `Sky` the water uses, and the exposure is the picture pipeline's.
  - **As built (`sprayLook.ts`):**
    - The phase function is 0.7·HG(g = 0.75) + 0.3·isotropic, which stands in for multiple scattering. Pure HG left side-lit and front-lit mist as dark grey smoke against the sky.
    - The sky term is `skyIrradiance/π`.
    - The lighting is computed per puff in the vertex stage.
    - Puffs fade out 3–10 m from the camera. Close up, a puff was metres across and its quad cut the water in straight edges.
- **Opacity:** per particle, `SPRAY_OPACITY` × alpha, a constant set in the plan (low, about 0.06–0.12), times the particle's emitter strength.
- **Blending:** premultiplied alpha, depth test on (hidden behind the wave), depth write off, unsorted. The opacity is low enough that order doesn't show. It is drawn after the opaque scene, in the same scene pass as the water.
- **Underwater:** hidden, with the ribbon (App's underwater switch).
- **Risk:** a hard line where a puff crosses the water surface. If captures show it, puffs fade as they near the surface (the probe's tide plus the sheet's height at the particle, per vertex). That fix is not built unless needed.

### 3.4 Jumps and determinism

- **When it replays:** on the same triggers as the foam map (App's `foamField.invalidate` sites and the schedule's safety net). The pool is cleared, and every tick in (t − (1.2·sprayLife + 0.5 s), t] is replayed. At the default life that's 2.9 s, or 58 ticks.
- **Why it's exact:** a particle's state depends only on its birth tick and the ticks since. There is no blending between particles. So a replay gives exactly the pool live play reached at the same tₖ, and the same moment always shows the same veil.
- **The trace per tick:** each tick (live or replay) runs the crest trace at its own tₖ. It is independent of the ribbon's per-frame trace, which stays as it is.

### 3.5 Cost

- **Targets:**
  - per tick: ≤ 1.5 ms of CPU (the trace plus profile frames, only on breaking stations);
  - per tick: ≤ 0.3 ms of GPU (the birth and step passes);
  - drawing: ≤ 1 ms of GPU at 1236 × 1351 on a frame full of spray;
  - a replay: ≤ 150 ms.
- **Measuring:** in a visible pane, with the Phase 3a method (wall time fenced by `onSubmittedWorkDone` around a replay, a tick and a frame).
- **If a target is missed,** the numbers go to Andrew before any lever is chosen. The levers are:
  - emitter spacing of 3 m;
  - a smaller pool;
  - a smaller maximum sprite size;
  - replay at 10 Hz.
- **Bindings:** the passes and the material stay within 8 storage buffers per stage. The limits test is extended to cover them.
- **As built (measured, pane visible, RTX 4060 Laptop):**
  - a replay: 87 ms (58 ticks);
  - per tick: 1.38 ms CPU and 0.13 ms GPU;
  - drawing a close full veil: about 0 ms.
  
  All targets are met. At the spec's 1.5 m spacing, and with lighting per pixel, it was 181 ms, 2.96 ms and 5.2 ms. Lever 1 (3 m emitters) was used, plus two changes that don't alter the picture.

## 4. Files

- **New:**
  - `src/whitewater/sprayEmitters.ts`: the wind factor, emitter selection, births and slots (tests in `sprayEmitters.test.ts`);
  - `src/whitewater/sprayStep.ts`: the CPU particle reference (birth, step, replay; tests in `sprayStep.test.ts`);
  - `src/whitewater/SprayParticles.ts`: the GPU pool, passes, material and schedule;
  - `src/whitewater/spray.selftest.ts`.
- **Changed:**
  - `src/app/App.ts`: ticks, the per-tick trace, replay triggers and underwater hiding;
  - `src/dev/DevPanel.ts` and `devSettings.ts`: the Spray folder, persistence and the overlay;
  - `src/dev/selfTests.ts`;
  - `src/breaker/BreakingRibbon.limits.test.ts`.

## 5. Testing

**CPU (vitest):**
- the wind factor: 0 when glassy (< 1 m/s) and for any onshore wind; 1 at ≥ 6 m/s straight offshore; scaled by the cosine off-axis;
- emitters only at stations mid-throw; none on the shoulder, before onset, after landing, or where `weight·rho` ≤ 0.1;
- emitter spacing of about 1.5 m of arc;
- birth counts and slot assignment are fixed per tick and wrap the pool;
- the step: drag toward the wind, settling, death at life;
- a replay equals live stepping exactly.

**GPU self-tests:**
- the GPU birth and step match the CPU reference over a replay;
- the GPU pool after a replay matches live stepping;
- the pass and material bindings are within limits (limits test).

**Gallery:**
- the backlit veil from the lineup on `morning-offshore` (a set moment);
- the same wave side-on and from behind (`behind-the-wave`);
- an onshore wind and a glassy day with no spray;
- the `spray tint` overlay;
- the measured costs.

## 6. Success criteria

- Spray comes only off throwing lips, blown back by the offshore wind, and thins out within a couple of seconds.
- It glows gold backlit by the morning sun and is faint white front-lit.
- A glassy or onshore day shows none.
- The same moment always shows the same veil.
- The measured costs meet §3.5, or Andrew has the numbers and has agreed to a lever.

## 7. Not in this build

- The lip impact explosion and spit (the next 3b builds, on this system).
- Spray that drops foam into the map.
- Mist off the whitewater, and feathering crests before breaking (Andrew: spray comes only off the throwing lip).
- Sound (Phase 5).
