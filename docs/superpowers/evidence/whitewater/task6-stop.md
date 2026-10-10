# Task 6 STOP: the spray under wind (evidence)

Moment for every row: 10 ft 15 s, tide 0, seed 2002, 09:30; the biggest wave of the first set after 300 s reaches the tip
at 401.17 s; frames at 403.67 and 404.67 s (2.5 and 3.5 s after). Cameras: M-beach (the stand's lookout) and M-tube (free,
3 m up, 100 m down the line). Branch at 4722540 (port 5174); every capture through `captureMoments.mjs` (exact foam replay).

| file | what |
|---|---|
| `wind-glassy.png` … `wind-blown-out.png` | the seven WIND_ROWS (Glassy 1 kn; Light offshore 6 kn E; Strong offshore 18 kn E; Cross-offshore 10 kn SE; Cross-shore 12 kn S; Onshore 15 kn SW; Blown out 22 kn W): tube above, beach below, two moments |
| `feather-wide.png` | photo 3's moment: 8 ft, strong offshore, the lookout, 399.17 / 400.17 / 402.17 s (the biggest wave reaches the tip at 401.17) |
| `ab-task6-tube.png` | strong offshore, tube cam, main (top) vs branch (bottom), 403.67 / 404.67 |

Costs (idle machine, same session, interleaved):

| | main | branch | bar |
|---|---|---|---|
| `_rideProfile --ft=7 --sim-t=300 --wind=18,90` cam median (3 pairs) | 5.3 / 5.3 / 5.3 ms | 5.3 / 5.3 / 5.3 ms | ≤ +1 ms (Task 3: 5.3) |
| riding median (3 pairs) | 25.4 / 26.0 / 28.1 → 26.0 ms | 26.2 / 26.2 / 25.6 → 26.2 ms | ≤ 1.10 × (1.01 ×) |
| `_rideCost --ft=7 --spray --wind=18,90` breakEmitters per 20 Hz tick, median | 2.22 / 2.26 ms | 2.49 / 2.57 ms | feathering ≤ +2 ms (+0.3) |

My read, for the reviewer: the plume shows as a modest pale smudge above the lip (well short of photo 1's plume taller
than the wave); feathering is faint from the lookout; the onshore forward veil is a few puffs at the lip; the broken
section in the tube view reads as a flat white block with dark vertical creases (F3's solid boil) — the dials (plume
0–3, spray amount) are the first levers.
