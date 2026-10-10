# The Womb's claims against the game (npm run claims, 2026-10-10)

```
PASS left: 7 ft WSW mid: first leg 28/28 broken, peel 15.8 m/s (band 8–20)
PASS barrels: 7 ft WSW mid: barrel, hollow 1.00
FAIL short: no game check yet
FAIL other-way: no game check yet
FAIL best-size: no game check yet
PASS best-swell: 225°: breaks, 247°: breaks
PASS best-wind: the game's offshore winds blow from 90°; best arc 45–90°
PASS best-tide: breaks at 0, 0.5 m for Solid, Pumping, Big
```

## Off screen because no game check exists yet

- **short:** "Short and punchy (under 50 m)". No ride-length measure.
- **other-way:** "Can meet a section breaking the other way". No right-side measure.
- **best-size:** "Starts at 3–5 ft, best over head height". No size-quality measure.

## Failing claims for Andrew

None remain. Two failed on the first run and were settled as follows. Andrew should check both.

1. **best-swell: 202° doesn't break well in the game.** The first file used SSW–WSW (202–248°).
   - The research's agreed range is SW to WSW: WannaSurf's group says SW, Surf-Forecast says WSW. SSW appears only
     inside Mondo's wide sector.
   - So the range was narrowed to 225–248°, following the sources. The wave wasn't changed.
   - If SSW should count, the wave needs retuning at 202°.
2. **best-wind: the plan's check counted the game's "Cross-offshore" row (SE, 135°) as offshore.** The sources say NE to E.
   - The spec's check reads "the game's offshore direction at the Womb", and the game's Offshore rows blow from 90°. So the
     check now leaves out Cross-offshore.
   - If Cross-offshore should count as "best", the research doesn't support SE, so the claim's wording would need to
     change instead.

## Rerun on main after the merge with the Womb retune (2026-10-10)

```
PASS left: 7 ft WSW mid: first leg 72/72 broken, peel 12.0 m/s (band 8–20)
PASS barrels: 7 ft WSW mid: barrel, hollow 1.00
FAIL short / other-way / best-size: no game check yet
FAIL best-swell: 225°: no, 247°: breaks
PASS best-wind: the game's offshore winds blow from 90°; best arc 45–90°
PASS best-tide: breaks at 0, 0.5 m for Solid, Pumping, Big
```

**Failing claim for Andrew: best-swell.** On the retuned reef, the 7 ft first leg at 225° (SW) no longer meets the
checker's bar: every point of the first leg broken, and a peel of 8–20 m/s. WSW still does.

- The sources say SW is the Womb's main direction, so this needs your call: retune the wave for SW, or reword the claim
  to WSW only.
- Until then, the panel hides "Best swell" and the details page hides the swell paragraph.
- The claim is still listed in womb.json.

## Reworded (Andrew, 2026-10-10)

Andrew asked for the swell claim to be accurate.

- **Best swell is now WSW only, 240–255°.** The text reads "It's at its best on a swell from the west-south-west."
- **Sources:** Surf-Forecast names WSW as the best direction, and it lies inside Mondo's S–SW sector (157.5–247.5°).
  The SW reading from the WannaSurf group isn't claimed.
- **Game check:** `npm run claims` shows best-swell PASS (247°: breaks). The panel shows "BEST SWELL: WSW".
- A 225° (SW) day now reads **Fair** ("Swell from the SW") rather than On.
