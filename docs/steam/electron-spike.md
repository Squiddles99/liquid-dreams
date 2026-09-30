# Electron spike: findings (2026-09-30)

**Question:** can Liquid Dreams ship as a desktop app, running WebGPU on the RTX without the player changing Windows graphics settings? And where does the game assume it lives in a browser tab?

**Answer:** yes. Electron 44 (Chromium 152) runs the built game unchanged. One command-line switch puts it on the RTX. Nothing in the game code needed to change.

## How to run it

```
npm run electron             # build, then open the game in its own window (F11 fullscreen, F12 devtools)
npm run electron:dev         # open the running Vite dev server instead (npm run dev first)
npx electron . --probe=<dir> # unattended check: ~75 s, writes probe.json + probe.png to <dir>, then quits
npx electron . --no-force-gpu --probe=<dir>   # the same, without asking for the RTX
```

`electron/main.js` serves `dist/` over a private `app://game/` scheme. That scheme counts as a secure context, so WebGPU is allowed, localStorage keeps a stable origin, and the music's `<audio>` element gets range requests.

## Results (the RTX 4060 laptop)

| | GPU | Steady frame rate |
|---|---|---|
| `force_high_performance_gpu` (default) | NVIDIA RTX 4060, Lovelace | ~240 fps (the display's cap) |
| `--no-force-gpu` | Intel UHD, Gen-12LP | ~13 fps |

- In a browser tab the game can't choose the GPU itself. Chromium logs that `requestAdapter`'s `powerPreference` "is currently ignored … on Windows" (crbug.com/369219127). That's why the README tells players to change Windows graphics settings. The wrapper removes that step.
- The frame rate drops when other apps are using the RTX (one run reached only ~47 fps while Chrome and Claude were rendering on it).

## What works unchanged

- **Settings persist between launches:** localStorage on `app://game`, kept in Electron's user-data folder.
- **The music streams:** `206` range responses from the app's own server.
- **L copies the moment link to the clipboard.**
- **K saves a screenshot.** Electron would normally ask where to save each one, so `main.js` saves them to `Pictures\Liquid Dreams\` instead.

## To fix before a Steam build (not now)

1. **The *Morning of the Earth* MP3s get bundled.** `import.meta.glob('/music/**')` copies every album under `music/` into `dist/` (107 MB). A Steam build must include only the game's own soundtrack.
2. **Moment links point at `app://game/#m=…`,** which nothing outside the app can open. Either share only the `#m=` code, or register a `liquiddreams://` link.
3. **Player-facing mode:** the dev panel and stats show by default (H hides them).
4. **"Click or press a key for sound"** isn't needed in the wrapper, because the window allows autoplay.
5. ~~**The first break freezes the game.**~~ Fixed on main (9fedd0d): the ribbon and the Bombie's white water are now built while loading. The ~6 s of shader stutter right after load remains.
6. **Security:** add a Content-Security-Policy (Electron warns about it in development).
7. **Packaging:** installer or zip (electron-builder or Electron Forge), Steamworks (steamworks.js), Steam Cloud for the settings file.
8. **Not tested yet:** mouse-look pointer lock, and sound actually audible (only checked as served), in the Electron window.
