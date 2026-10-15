/**
 * The breaking look's build-time switches (breaking-look close, Fable's ruling 1: "a task that cannot meet its frame bar ships
 * its lever (L1-L5) and not its look, and says so"). A look switched off is left out of the shader graph (no cost, today's
 * picture); switched on it is the built look, Andrew's pick pending on its A/B sheet. Measured numbers: the close handover
 * (docs/superpowers/handover/2026-10-15-breaking-look-close.md).
 */
/** Item 1, the white-water wall's look (the wall rule, the sheet's billows, the silhouette lift). L1 (the baked billows) stays on.
 * Gate A vs base: +0.53 ms. ON since the close frames on 829c498 vs main (close/frames.md): with item 2 on, riding 0.45x /
 * 0.30x main, cam -0.1 ms, GPU -1.70 ms summed and under main on all three views (Fable's ruling; Andrew's pick on the sheet). */
export const WALL_LOOK = true;
/** Item 2, the barrel inside (lip chop 0.6, the tube's streaks, the tube's reflected light, the wide backlight). Off: the
 * gate measured it only with item 7. ON since the close frames on 829c498 (see WALL_LOOK): no measurable cost vs main. */
export const BARREL_INSIDE = true;
/** Item 5a, the crest strip (offshore feathering as one draw). Off: built, but at 20 kn it reads as a thin line along the
 * crest, not a plume (its fibre threshold leaves most of it clear; look/spray-ab.jpg), so the tuning is Andrew's pick first. */
export const CREST_STRIP = false;
