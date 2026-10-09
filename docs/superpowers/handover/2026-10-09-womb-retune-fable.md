# Womb retune: handover for Fable (stub, Opus 5.5, 2026-10-09)

## Task 1 ruling wanted (blocks Tasks 2-6): what does "the dial at the coast seed" fix — height only, or height and direction?

Plan Task 1.3 as written (implemented, tested, NOT committed: `coastFarField.ts` `ampRefDepthM`/`refDepthM`/`fluxRef`,
`coastField.ts` `seedDepth`, test in `coastField.test.ts`): the energy flux reference moves to the coast seed (29.7 m at
mid tide, x −1500, z 0) while Snell's p stays set in FAR_X0's 15 m, so angles are unchanged. Measured (first datum rows,
low tide, peak (0,0)):

| from | band | amp before | amp after (as written) |
|---|---|---|---|
| 202 | Pumping | 0.667 | 0.271 |
| 225 | Pumping | 0.725 | 0.515 |
| 247 | Pumping | 1.265 | 1.352 |

Amp goes DOWN at 225°, not up ×1.10. Why (`.superpowers/sdd/2026-10-09-womb-retune/seed-angle-check.mjs`, linear theory):
with p fixed in 15 m, the same swell in 29.7 m water is far more oblique (225°: 45° → 72° off the shore normal; 202°: past
grazing — that swell cannot exist at the seed), so cg·cosθ there is small and every amp measured against it shrinks. The
×1.10 estimate is pure shoaling for a square-on wave.

| option | what the dial means | amp at 15 m vs today (T 15) | arrival |
|---|---|---|---|
| A (as written) | height in the seed's water, direction in 15 m | 225: ×0.74, 202: ×0.40, 247: ×1.07 | unchanged |
| B | height by shoaling only (cg ratio, cosθ kept from 15 m) | ~×1.0 all | unchanged |
| C | height AND direction in the seed's water (a buoy) | 225: ×1.01, 202: ×0.80, 247: ×1.09 | 225° reaches 15 m at 32° off normal (today 45°): ~13° more square-on at the peak; breaks gate §6.1 and §1's fixed −22.9° |

Opus's lean: C is the only one that is a buoy's reading and energy-consistent (Andrew: "true to the scientific data"),
but it rotates the arrival the spec calls fixed, so it is your call (and possibly Andrew's). A makes 202° nearly flat.
