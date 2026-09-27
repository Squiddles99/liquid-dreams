# Liquid Dreams Phase 3c ("The impact explosion") Design

**Date:** 2026-09-28 (overnight, from 2026-09-27)
**Authors:** Claude, under Andrew's delegation
**Status:** Written, ruled and implemented overnight by Claude under Andrew's delegation ("complete 3b then merge and move to 3c") on `phase-3c-impact-explosion` (plan `docs/superpowers/plans/2026-09-28-impact-explosion.md`). Every decision marked **Ruling** is Claude's, for Andrew to review. **Not merged.**
**Builds on:**
- Phase 3b, offshore spray (`2026-09-27-offshore-spray-design.md`): the particle pool, fixed slots per tick, the replay, the look;
- the breaking ribbon (the lip profile's landing time τ_land);
- Phase 3a (the tick schedule).

---

## 1. What this is

The vision spec's Phase 3 list: *"Lip impact, whitewater explosion, spit, offshore spray off the crest, lingering and dissolving foam."* 3a built the foam and 3b the offshore spray. This build is the **impact explosion**: where the lip lands, the wave turns inside out and throws a burst of white water up and forward. The burst rises about as high as the wave, then falls back into the bore within a second or two. In the reference photos it is the white wall the barrel's foam mixes into, and Andrew's description calls it the "thunder-clap lip impact".

**Ruling I0, scope:** the explosion only. Spit (the blast out of the tube as it closes) is a separate build, 3d. This matches the 3b split, where one effect was built per phase and each reuses the particle system.

## 2. What Andrew should see

A wave throws. As its lip lands, a white explosion bursts up from the landing line along the whole breaking section. It is dense and bright, rising a metre or more on a 4 ft wave, more on a bigger one. It is carried forward with the throw, falls back under gravity within about 1.5 s, and blows a little seaward with an offshore wind. It happens whether or not there is wind: a glassy day still explodes, it just doesn't smoke back. The same moment always shows the same explosion.

## 3. Design

### 3.1 One particle system, two kinds (refactor of 3b)

**Ruling I1:** the 3b pool, schedule, birth and step passes and material become generic over a **particle kind**:

```ts
interface ParticleKind {
  dragTauS: number;      // wind drag time constant
  gravityMs2: number;    // downward acceleration (mist 1.2; spray droplets 7)
  sizeM: [number, number];  // size at birth and at death
  opacity: number;       // per-puff opacity at strength 1
  isotropic: number;     // the phase function's isotropic share (dense water scatters more evenly)
}
```

- `SPRAY_KIND` is exactly 3b's values: 0.45 s, 1.2 m/s², 0.3 → 2 m, 0.08, 0.3. The spray is unchanged, and this is tested.
- `IMPACT_KIND` is 1.1 s, 7 m/s², 0.5 → 2.5 m, 0.2, 0.6.
- `SprayParticles` becomes `ParticleSystem(sky, kind)`; the CPU reference `stepPool` takes the kind.
- Each system has its own pool (32,000), schedule and replay. The spray and the explosion each keep 3b's exact replay-equals-live property.

### 3.2 Impact emitters (CPU, shared trace)

**Ruling I2:** the spray and the explosion share one crest trace and one profile frame per station per tick. `breakEmitters(input)` returns `{ spray, impact }`, so the explosion adds almost no CPU. The calm-wind early exit now skips only the spray part; the trace runs whenever breaking is on and a wave is in flight.

A station is an **impact emitter** while its lip is landing:
- `tb` is finite;
- τ_land ≤ tb < τ_land + `IMPACT_WINDOW_S` (0.35 s);
- ρ > 0.1.

The emitter's data:
- **position:** the landing point, the lip tip at τ_land (`K.u + vj·τ_land`, `K.y − ½·g·τ_land²`), plus the tide;
- **throw:** `vj` along n;
- **height:** the station's H;
- **strength:** `min(1, H / 2 m) · rho · impactAmount` (bigger waves explode harder).

**Births:** `floor(strength · IMPACT_RATE · spacing · Δ + hashed fraction)` per emitter, at most 320 per tick, in the same fixed slots per tick as 3b. Each birth:
- scatters half a spacing along the crest and 0–0.4 m up;
- gets a velocity of 0.6·vj along n, plus an upward kick of U(0.5, 1)·√(2·g_I·max(H, 0.5)) with g_I = 7 (it rises to about 0.25–1 H), plus ±1.5 m/s random per axis;
- lives U(0.8, 1.6) s;
- has an opacity strength of min(1, rho), the lip only, as ruled in 3b's final review.

The hashes are salted differently from the spray's, so the two effects never share draws.

`IMPACT_RATE` = 40 per metre per second (**Ruling I3**, a denser burst than the mist).

**As built (tuned in captures):** at the values above the burst topped out at crest height (about 2 m on the reference wave) and hid against the wave's white face; switching it on and off looked the same. The kick is now U(0.6, 1.2)·√(2·7·1.5·max(H, 0.5)), aiming 1.5 H above the landing. `IMPACT_KIND` is 0.8 → 3.5 m at opacity 0.32. It now rises to about 4 m and shows above the lip.

### 3.3 The look

The same material as the spray (single scattering, per-puff lighting, a 3–10 m near-camera fade), with the kind's size, opacity and phase: 60% isotropic, 40% HG at g = 0.75. The effect is dense white, still glowing when backlit.

### 3.4 App, sliders and debug

- **The frame:** a second system, `impact`, is stepped each frame after the spray, with the same birthsAt pattern, sharing the tick's emitters. It is hidden underwater, has its exposure set, and replays on every jump and field trigger (`invalidateParticles`).
- **Slider** (an Impact folder, persisted with the look): `impact amount`, 0–3, default 1, with its own debounced replay.
- **Overlay:** `spray tint` also tints the explosion.

### 3.5 Cost

The targets are the spray's:
- per tick: ≤ 1.5 ms CPU and ≤ 0.3 ms GPU per system;
- drawing: ≤ 1 ms per system;
- a replay: ≤ 150 ms (both systems together) at the default conditions.

It is measured the same way. The 3b slider-maximum overrun (12 ft) remains Andrew's decision and is not addressed here.

**As built (measured, pane visible, RTX 4060 Laptop):**
- drawing: 0.3 ms;
- the explosion's replay alone: 42 ticks in 57 ms (about 1.2 ms of CPU per tick);
- shared with the spray in a real replay, both together take about 75 ms.

All targets are met.

**Ruling I4:** no foam deposition. The foam map already rises at the landing through Phase 2's landing foam (the ribbon's curl foam and the sheet's collapse foam), which is where the explosion lands. Depositing particle foam is deferred.

## 4. Files

- **New:** `src/whitewater/particleKinds.ts` (the kinds), `src/whitewater/impact.selftest.ts` (or additions to `spray.selftest.ts`).
- **Changed:**
  - `sprayEmitters.ts`: `breakEmitters`, the impact emitters and births;
  - `sprayStep.ts`: the kind;
  - `SprayParticles.ts`: renamed to a generic `ParticleSystem`, with the file kept;
  - `sprayLook.ts`: the isotropic share becomes a parameter;
  - `App.ts`, `DevPanel.ts`, `devSettings.ts`, the limits test.

## 5. Testing

**CPU:**
- the spray kind reproduces 3b exactly;
- impact emitters exist only in the landing window, with none before landing and none after the window;
- an explosion rises higher for a bigger wave;
- impact happens with no wind;
- births are capped and deterministic;
- the impact kind's step falls under gravity;
- a replay equals live play.

**GPU self-tests:** the impact system's GPU step matches the CPU reference over a replay; a replay equals live play.

**Gallery:**
- the explosion at landing from the lineup and side-on;
- glassy (still explodes);
- the costs.

## 6. Success criteria

- A white burst rises where each lip lands and falls back within about 1.5 s, bigger for bigger waves.
- It happens on glassy days too.
- The spray is unchanged.
- The same moment gives the same picture.
- The costs meet §3.5.

## 7. Not in this build

- Spit (3d).
- Foam deposition by particles.
- The 12 ft cost overrun.
