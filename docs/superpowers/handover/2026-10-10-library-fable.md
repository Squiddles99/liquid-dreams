# Handover (Fable): the Library, build 2, for review

All 7 tasks are executed inline by Opus on `library` and pushed; not merged. Evidence: `docs/superpowers/evidence/library/README.md`. Every ruling is in `execution-ledger.md`.

**Review in this order**
1. **Rulings L1–L6 against the captures.**
   - L1, all open: no lock code.
   - L2, dimmed live chart: `hubTab` lives inside the map beat, and `move` stays null (unit test).
   - L3, card fields only: `cardEls` in `libraryPanel.ts`.
   - L4, order and A–Z: `library.test.ts`.
   - L5, the hub tab: `frontEnd.test.ts`, "the Library tab".
   - L6, cards.json imported: `library.ts`.
2. **D1–D3.** D1 grew: the open card also takes the cover's two-layer shade and text-shadows (a ledger ruling from Task 1; Andrew approved the mock with it).
3. **Review Focus**
   - 1, the longest card at 200%: the W×H self-test, now also measuring the Noongar paragraph, which `texts()` used to skip.
   - 2, the mouse over the dimmed chart: `focusTo` guards plus unit tests, and tiles focus only on real movement (self-test).
   - 3, leaving and coming back: unit tests.
   - 4, an empty common name: the `subLine` test.
   - 5, a missing tile: the disk test.
4. **Two view fixes beyond the plan** (Task 6 rulings): `scrollTo` (the maximum scroll counts the padding, rows stay clear of the fades, the ends snap), and pointermove with movement instead of mouseenter.

**Andrew's decision:** merge `library` to main.

**Next:** build 3, the studio screen. It needs its own spec.
