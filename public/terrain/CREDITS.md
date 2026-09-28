# Terrain data

`womb-land.bin` is baked by `tools/bakeTerrain.ts` from the **AWS Terrain Tiles** open dataset
(Tilezen / Mapzen, `s3://elevation-tiles-prod`, terrarium encoding), zoom 15 and zoom 12 tiles around the Womb
(-33.895216, 114.983359), downloaded 2026-09-28.

The tiles combine several public elevation sources; for this area the data is **SRTM** (NASA / USGS, public domain).
Attribution requested by Tilezen: "Terrain tiles: Mapzen, and the sources listed at
https://github.com/tilezen/joerd/blob/master/docs/attribution.md".

The raw tiles are not in this repository.
