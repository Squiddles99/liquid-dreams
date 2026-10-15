/**
 * The breaking look's build-time switches (breaking-look close, Fable's ruling 1: "a task that cannot meet its frame bar ships
 * its lever (L1-L5) and not its look, and says so"). A look switched off is left out of the shader graph (no cost, today's
 * picture); switched on it is the built look, Andrew's pick pending on its A/B sheet. Measured numbers: the close handover
 * (docs/superpowers/handover/2026-10-15-breaking-look-close.md).
 */
/** Item 1, the white-water wall's look (the wall rule, the sheet's billows, the silhouette lift). L1 (the baked billows) stays on.
 * Off: GPU +0.53 ms (timestamps) / +0.59 ms (wall clock) summed over the three views vs base, gate A. */
export const WALL_LOOK = false;
/** Item 2, the barrel inside (lip chop 0.6, the tube's streaks, the tube's reflected light, the wide backlight). Off: the
 * gate measured it only with item 7 (+0.79 ms wall clock with 7, +0.2 ms over task 1: within noise, not met with it). */
export const BARREL_INSIDE = false;
/** Item 5a, the crest strip (offshore feathering as one draw). Off: built, but at 20 kn it reads as a thin line along the
 * crest, not a plume (its fibre threshold leaves most of it clear; look/spray-ab.jpg), so the tuning is Andrew's pick first. */
export const CREST_STRIP = false;
