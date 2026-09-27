# Liquid Dreams Phase 3a ("The foam field") Design

**Date:** 2026-09-27
**Authors:** Claude, with Andrew Justice
**Status:** Design approved section by section by Andrew (2026-09-27); written spec awaiting his review.
**Builds on:**
- the vision spec (`2026-09-25-liquid-dreams-first-light-design.md`): Phase 3, the `whitewater/` module, deterministic moments;
- Phase 2 (`2026-09-27-the-break-design.md`) and the breaking ribbon (`2026-09-27-breaking-ribbon-design.md` §8, D4);
- the underwater view (`2026-09-27-underwater-view-design.md`).

Their world conventions, "one source of truth", CPU-reference/GPU-mirror testing, the 8-storage-buffer baseline and the GPU budget all still apply.

---

## 1. What Andrew asked for

Phase 3 (whitewater) is split in two, and Andrew chose to build the foam first:
- **3a, the foam field** (this spec): foam that persists and drifts with the water.
- **3b, whitewater particles** (later): the lip impact explosion, spit and offshore spray. They are driven by breaker events and put their foam into this field.

Andrew's answers about the Womb:
- **Foam is gone quickly.** A break leaves mostly dense whitewater that clears within about 10 s, with little lace left behind.
- **Leftover foam matters only within a set.** Set waves arrive 12–16 s apart, so most waves arrive on clean water. Only a close pair (a step) breaks into the previous wave's foam. This replaces his earlier note that the foam on a wave is "mostly what the previous waves left" (breaking-ribbon spec §8, `phase-0-followups.md`).

## 2. What Andrew should see

- A wave breaks, and the white bore it leaves stays on the water after the wave has passed. The bore then thins into shrinking patches and is completely gone about 10 s later.
- Foam rides up and down, back and forth, with the swell and chop passing under it, and creeps slowly shoreward.
- In a close pair, the second wave breaks into and rolls through the first wave's leftovers. Most set waves arrive on clean water.
- The same moment always shows the same foam, whether opened from a link or played into.
- Everything else is unchanged: the open-ocean whitecaps, the water outside the break, and the look of the water itself.

## 3. Design

### 3.1 The foam map (new `src/whitewater/`)

- **Extent:** a fixed world-space box over the break, at 1 m per texel. The draft box runs roughly from x = −200 to the beach (x ≈ 190) and from z = −300 (north) to z = +200. The plan's first task checks it against the reef field: every cell where the biggest wave the sliders allow can break must lie inside the box with at least a 20 m margin, and the box grows if needed. The box is a constant, not a slider.
- **Storage:** two `rgba16float` textures, ping-ponged. The format is both storage-writable and filterable in core WebGPU. Only `.r` (the foam density, 0–1) is used; the other channels are free for 3b. The map is attached to the water rather than the ground: it is indexed by the sheet's **undisplaced** (base) xz, exactly as the FFT foam is sampled.
- **One step** at sim time tₖ, for each texel at base point x:
  1. **Drift:** `F_adv = bilinear(F_prev, x − u·Δ)`, with Δ = 0.05 s. Here u = `foamDrift` × the local wave direction (the reef field's ray direction). The bilinear sample also softens the map slightly, so foam spreads a little as it ages.
  2. **Clear:** `F_adv − Δ / clearTime`.
  3. **Inject:** `F = clamp(max(F_adv − Δ/clearTime, S(x, tₖ)), 0, 1)`, where S is Phase 2's breaking foam weight at x and tₖ (`SetWaves.breakSampleNode(xz).foam`, mirrored on the CPU by `foamWeight` via `waveAtCrest`).
- **Why it moves with the water:** the sheet draws each base point displaced by the swell and chop, so the map inherits all of that back-and-forth motion for free. Only the net shoreward drift is simulated.
- **Clearing is linear:** foam falls from 1 to exactly 0 over `clearTime` after the source stops. A texel with no source for `clearTime` is exactly 0 (the result is clamped). §3.3 relies on this.
- **Fixed ticks:** steps run at tₖ = k·Δ in sim time (20 Hz), never per frame. Each frame runs the steps whose tₖ falls in (previous sim time, current sim time]. Paused, nothing runs. The sim clock caps dt at 0.1 s, so live play runs 1–2 steps a frame. If sim time moves backwards, or forward by more than 1 s, without a jump trigger (§3.3), the map replays as it would after a jump. This is a safety net.
- **Dev sliders** (new Foam folder, persisted with the look settings):
  - `clear time (s)`: 2–30, default 10.
  - `foam drift (m/s)`: 0–2, default 0.4.
- **Unchanged:** the FFT whitecaps (`OceanSimulation` foam) are untouched.

### 3.2 How it's drawn

- **Who reads the map:**
  - the sheet from above (`OceanSurface.aboveMaterial`);
  - the sheet from below (`belowMaterial`);
  - the ribbon, at its home, which is the base point on the sheet the ribbon's sample belongs to.
  They all sample the map at the same base xz. So the lip and the sheet agree at the hand-back, and from below the foam still blocks Snell's window. Each takes `foam = max(FFT foam, map foam)`. The ribbon also keeps its own curl foam, as `max(map foam at home, curlFoam·ρ)`.
- **Outside the box:** Phase 2's per-vertex breaking foam is used as today. A 10 m band inside the box's edge blends the two, so there is no seam.
- **The pattern:** `setFoamPattern` keeps its two noise octaves, coverage curve and brightness range. The change is its coordinates: the moving crest frame (`foamFrame`) becomes the water-anchored base xz, with the existing time term for slow churning. Dense foam reads solid white with soft brightness variation, and thinning foam breaks into shrinking patches. The foam colour and `foamAlbedo` are unchanged.
- **The visible change (Andrew's eye is the test):** the bore's front now moves across water-fixed foam that boils as it forms, where today the pattern slides with the crest. If that reads worse, the fallback is the crest frame on the active bore only, blending to base xz as the foam is left behind.
- **Debug:** a `foam map` overlay tints the box and shows its density.

### 3.3 Jumps and determinism

**When the map replays:**
- a moment jump (`applyMoment`);
- "call a set";
- new conditions;
- the reef field arriving (`onField`);
- a change to either foam slider (so a paused moment shows it);
- the safety net in §3.1.

**What a replay does:** it clears the map, then runs every step for tₖ in (t − clearTime − 2 s, t], in a single frame. At the default setting that is 240 steps.

**Why replay and live play agree:** by §3.1, any texel's value depends only on sources within the last `clearTime`. So a replay gives the same map as live play that reached the same tₖ, up to floating-point differences.

**Constraints on moments:** a moment captured while paused needs no extra waiting beyond the replay frame. Moments stay seeded and O(1). No history is stored anywhere except the map itself.

### 3.4 Cost

- **Per frame:** 1–2 steps. Each step evaluates the breaking foam once per texel, about 200k evaluations, which is similar to the sheet's vertex stage.
- **Per replay:** 240 steps.
- **Targets:** at most 0.5 ms GPU per frame, and at most 200 ms for the replay hitch.
- **Measuring:** the pane's GPU timestamps are unusable. Instead the plan times a replay (CPU wall time around the dispatches plus a readback fence) and divides by the step count to get the per-step cost.
- **If a target is missed,** these levers apply in order:
  1. skip the crest solve for waves that cannot break at the texel (their height is below the texel's breaking height);
  2. evaluate S on a 2 m grid and sample it bilinearly;
  3. replay at 10 Hz (this gives up exact replay/live agreement).
  The measured numbers go to Andrew whichever lever is used.
- **Bindings:** the sheet's fragment stage samples about 13 of its 16 textures today, so the map makes 14. `BreakingRibbon.limits.test.ts` is extended to count sampled textures and storage buffers on the sheet's two materials. The step pass binds one storage buffer (the waves) plus textures.

## 4. Files

- **New:**
  - `src/whitewater/foamStep.ts`: the CPU reference, with the step on a small grid, ticks and replay (tests in `foamStep.test.ts`);
  - `src/whitewater/FoamField.ts`: the GPU map, step pass, ping-pong, tick bookkeeping, replay and the sample node;
  - `src/whitewater/foamField.selftest.ts`.
- **Changed:**
  - `src/ocean/OceanSurface.ts`: map sample in both materials, pattern coordinates, box blend;
  - `src/breaker/BreakingRibbon.ts`: map foam at the home;
  - `src/app/App.ts`: stepping and replay triggers;
  - `src/dev/DevPanel.ts` and `devSettings.ts`: the Foam folder and persistence;
  - the debug overlay;
  - `src/dev/selfTests.ts`;
  - `src/breaker/BreakingRibbon.limits.test.ts`.

## 5. Testing

**CPU reference (vitest)** for `foamStep`:
- a texel takes the larger of its foam and the source;
- after the source stops, foam reaches exactly 0 at `clearTime` and not before;
- a blob drifts at `foamDrift` along the wave direction;
- a paused clock runs no steps;
- a frame's steps are exactly the tₖ in (previous, current];
- a replay equals live stepping to the same tₖ;
- a backwards jump, or one of more than 1 s, triggers a replay.

**GPU self-tests:**
- the GPU step matches the CPU reference on a small grid;
- the map's source S matches Phase 2's CPU `foamWeight` at sample points;
- a GPU replay matches GPU live stepping to the same tₖ.

**Bindings:** the extended limits test.

**Gallery captures:**
- foam lingering after the first wave of a set;
- a close pair breaking into leftovers;
- a sequence at 0, 3, 6 and 10 s after a bore passes, showing it clear;
- measured per-frame and replay costs.

## 6. Success criteria

- Foam appears where Phase 2 puts it today, stays after the bore passes, and is gone by `clearTime`.
- A close pair breaks into the first wave's leftovers, and a normally spaced set wave arrives on clean water.
- The same moment always shows the same picture.
- Nothing changes outside the box, and the FFT whitecaps are untouched.
- The measured cost meets §3.4, or Andrew has the numbers and has agreed to the lever used.

## 7. Not in 3a

- The impact explosion, spit, offshore spray and any particles (3b).
- Lace and marbling.
- Foam on the open ocean beyond the box (the whitecaps are unchanged).
- Sound (Phase 5).
