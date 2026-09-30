# Liquid Dreams

A surfing game built for the love of it. The first (and only) break is **The Womb**, Ellensbrook, WA, in the browser with WebGPU.

## What's in it

- **The ocean:** a real-time swell and wind sea, with the sky, sun and atmosphere for any date and time of day at Ellensbrook.
- **The Womb:** its limestone reef with the ledge, shelf and sand pockets.
  - **Sets and lulls:** sets arrive every 10–20 minutes.
  - **Breaking:** the left barrels off the peak and the right closes out along the south ledge.
  - **White water:** the thrown lip, foam, offshore spray and the explosion where the lip lands.
- **Underwater:** duck under to see the reef through the water.
- **The view back:** the land from the Ellensbrook terrain, the surf across the shore platform, and the swash on the sand.
- **On foot:** walk the beach among the dune-toe rocks and up into the heath, with its shrubs, pigface and rice-flower.
- **Ellensbrook Bombie:** about 450 m south-west, it goes off on its own waves on big days (6 ft and up). It's atmospheric background, not surfable.
- **The surfers:** Shazza and T-Bone, late teens, built from MakeHuman's licence-free bodies, with a thruster, a step-up and a bodyboard. They dress for the season (boardies and bikinis in summer, springsuits and a rash vest either side, steamers in winter) and hold every key pose, backside and frontside. For now they're posed on the water with the dev panel's Surfer folder; riding comes next.
- **Grommet:** Bradley, 13, the crew's bodyboarder: a wild ginger mop, big round glasses (on land only), buck teeth, freckles and pimples. He rides only his bodyboard.
- **Sound:**
  - lip impacts heard a beat after you see them, the white water's roar, and the shore break;
  - the Bombie's boom, wind in the scrub, lapping and swash;
  - the *Morning Of The Earth* soundtrack quietly underneath (see Music).

## Just want to play? (Windows)

1. Get the folder onto your computer. Either use **GitHub Desktop** (File → Clone repository → `Squiddles99/liquid-dreams`), which lets the game update itself; or, on the GitHub page, click **Code → Download ZIP** and unzip it.
   - GitHub Desktop users: to update, click **Fetch origin**, then **Pull origin**, before starting the game. (The launcher's own auto-update only works when Git for Windows is installed.)
2. Double-click **`Start Liquid Dreams`** in the folder.
   - The first time, it installs Node.js if needed (Windows asks for permission: click Yes, then double-click Start again) and downloads the game's building blocks (a minute or two).
   - Your browser opens the game. Use **Chrome or Edge**. On a laptop with two graphics chips, set the browser to "High performance" in Windows Settings → System → Display → Graphics.
3. Click once in the game to start the sound.
4. Keep the black window open while you play; close it to stop.

## Getting around

`C` cycles the camera: **lineup → free → walk → lineup**.

- **Lineup:** floating in the water at the Womb, riding the swell.
  - `W` `A` `S` `D` or the arrow keys paddle (slowly);
  - hold `Space` to sit up higher and see over the swell.
- **Free:** a flying camera.
  - `W` `A` `S` `D` or the arrows move, `E` goes up and `Q` down, and `Shift` is faster;
  - the mouse wheel sets the speed.
- **Walk:** on foot on the beach, the dunes and the heath.
  - `W` `A` `S` `D` or the arrows walk, and `Shift` runs;
  - switching from free to walk drops you onto the ground below, or back to the lineup if the water there is too deep to stand in.
- **Mouse look:** hold the left mouse button and drag; release to free the cursor.

## Controls

- `P` pauses and resumes (reference moments open paused; a "Paused — P to resume" badge shows under the stats).
- `N` calls a set.
- `M` mutes and unmutes the sound. The sound starts on your first click or key press.
- `L` copies a moment link (the time, conditions and camera).
- `K` saves a screenshot.
- `H` hides the dev UI.

### The dev panel

Settings are remembered between visits.

- **Moment:**
  - the settings switch: **custom** keeps your own tweaks; **default** shows reference moments exactly as designed;
  - the reference moment list, date, time of day, tide and seed;
  - buttons for the link, pause, screenshot and Reset settings.
- **Swell and Wind:** size (surfer feet), period and direction. Wind speed is in km/h, and directions show compass points (e.g. `225° SW`), the direction they come from.
- **Sets:** "next set", the wave at the peak, and "face at the peak". The face readout is crest to drained trough, in metres and feet, and says whether it's breaking; use it to calibrate the surfer-feet dial. Also the Call a set button and the set timing.
- **Break:** the breaking toggle, the breaker index γ, the drain δ, the stage span Δ, the bore height β and the trough drain, plus the breaking ribbon's controls:
  - throw strength (×c): how fast the lip launches off the crest, as a multiple of the wave's own speed;
  - lip thickness (×H): how thick the pitching lip is, as a fraction of wave height;
  - collapse time (×τ land): how long the thrown lip takes to collapse once it lands, in landing-time units;
  - ribbon onset r: the breaking ratio at which the ribbon (the thrown sheet) starts fading in.
- **Foam, Spray and Impact:** how much white water, offshore spray and landing explosion there is, and how long each lasts.
- **Land:** the sand and heath colours, the beach width, the rock band, and the rock and bush density.
- **Surf:** the shore platform's surf amount, and on/off.
- **Bombie:** on/off, its size, and the swell at which it starts breaking (6 ft by default).
- **Sound:**
  - the volumes: master, waves, ambience, near water and music;
  - mute;
  - the track playing, with music play/pause and next track.
- **Surfer:** show the surfer, then pick who (Shazza (Sharon), T-Bone (Tom) or Grommet (Bradley)), regular or goofy, the board, the outfit (or the season's) and the pose.
  - The board list shows only what that rider can ride: Grommet rides only his bodyboard, and a surfboard in an old link or setting switches to it.
  - **On land** puts Grommet's glasses on and dries everyone's skin and hair (his curls loosen); off, they're wet from the water.
  - The "wearing" readout says what the season picked.
  - Heading turns the board, and the dials offset the pose: phase, compression, lean, twist and reach.
  - Play runs the paddle stroke (and the bodyboard's kick) and the pop-up from the clock; turn it off to scrub the phase by hand.
  - The balance layer adds the knees' give to the swell's heave, and its amount.
  - x and z, the height nudge and the pitch nudge place the board.
  - Buttons: **Place ahead of camera** (on the water 6 m in front of you, facing the way you look) and **Chase view** (the camera behind and above the surfer).
  - Rebuilding the bodies from MakeHuman (Blender with MPFB): see `tools/surfer/README.md`.
- **Reef, Ocean, Water, Sky, Picture:** the reef's depths, the sea and its optics, the atmosphere, and exposure and grading. The Reef folder has overlays for depth contours, crest lines and the ribbon tint.
- **Frame rate:** capped at 60 fps. Picture → "max fps" changes it; 0 means the display's rate.

## Reference moments

Pick one from the dev panel's Moment folder, or open `http://localhost:5173/#ref=<name>`. All are at The Womb on 15 July 2026 (winter, 4 ft SW groundswell, light easterly offshore) unless noted.

| Name | What it shows |
| --- | --- |
| `pre-dawn` | 06:30 facing the land (east). Twilight glow where the sun will rise, dark sea. |
| `first-sun` | 07:35 facing out to sea (west), the sun just up behind you over the land. First light on the swell lines. |
| `in-the-shade` | 07:45 facing the land: the lineup still in the ridge's shade, a glow along the skyline where the sun will break. |
| `sunbreak` | 08:05 facing the sun (ENE): the sun clearing the ridge, the light arriving across the water. |
| `morning-offshore` | 08:15 facing west (the default). Low sun behind you, clear deep-blue water, groomed surface. |
| `late-morning` | 10:30 facing west. Higher sun, colour holding up before the Doctor. |
| `noon-deep-blue` | 12:30 looking down at about 45°. The water's colour and clarity, small glitter. |
| `autumn-glass` | 20 April 2026, 09:30 facing west, no wind. Mirror-smooth swell lines. |
| `golden-hour` | 16:50 facing the sun, the Doctor in. Glitter path, choppier surface, horizon haze. |
| `sunset` | 17:25 facing the sun. Sky colour, exposure, horizon. |
| `overview` | A free camera 40 m up at noon. |
| `looking-down` | 10:30 floating over the shelf, looking down at the limestone, weed and a sand pocket. |
| `reef-overhead` | A free camera 60 m above the reef at noon: the wedge, the shelf and the sand pockets. |
| `set-arriving` | 08:15 facing south-west: the set's first wave lifting on its approach, 20 s out. |
| `set-on-the-reef` | 08:15 from a drone inshore of the peak as the set's biggest wave stands up on the ledge. |
| `low-tide-set` | The same wave at −0.5 m tide: standing up harder and earlier. |
| `high-tide-set` | The same wave at +0.5 m tide: deeper water, softer. |
| `barrel-peeling` | 5 ft, from the shoulder, looking back at the lip throwing over the tube. |
| `closeout-right` | From a drone over the shelf as the biggest wave's right closes out along the south ledge. |
| `the-drain` | Low in the channel north of the peak as the ledge drains in front of the biggest wave. |
| `behind-the-wave` | 4.65 ft, from behind the wave line: the back of the breaking wave. |
| `lip-close-up` | 5 ft, from the unbroken shoulder about 15 m down the line from the throwing lip. |
| `surf-from-the-lineup` | From the top of a swell at the lineup, facing the beach as the set's white water crosses the platform to the sand. |
| `on-the-beach` | 10:30 standing on the dry sand, looking north along the beach: the rocks at the dune toe, the swash. |
| `up-the-dune` | 08:45 standing at the toe, looking up the first dune rise into the backlit heath. |
| `bombie-from-the-lineup` | 8 ft, from the lineup facing south-west: a Bombie burst 450 m out, its spray blowing back out to sea. |
| `bombie-close` | 10 ft, from 30 m up and 120 m inshore of the Bombie: the burst over the reef, the white water rolling in. |
| `surfer-lineup-sit` | 08:15 at the lineup: Shazza sitting on her thruster, nose out to the swell. |
| `surfer-pocket-pigdog` | 5 ft, from the channel: T-Bone regular on the step-up, pig-dogging backside in the pocket under the lip. |
| `surfer-pocket-frontside` | 5 ft, from the channel: Shazza goofy on the thruster, frontside in the pocket. |

The moments come in three kinds, which matter in custom mode:
- **Time of day** (`pre-dawn` to `sunset`): keep your own swell, tide and camera.
- **View** (`overview`, `looking-down`, `reef-overhead`, `on-the-beach`, `up-the-dune`): switch to the moment's camera.
- **Set** (the rest): apply in full, since a set only lands on cue with its own conditions.

View and set picks are visits: your saved swell, tide and camera stay untouched, and the next time-of-day pick puts you back on them. Set moments land on cue with the default Sets settings; a tuned mean interval or jitter of your own can throw the timing off.

## Music

The game plays the audio files under `music/` quietly under the ocean: one folder per album, tracks in the order of the number at the start of each file name (`1. …`, `2. …`, `10. …`). The Sound folder has the volumes, play/pause and next track; `M` mutes everything.

`music/morning-of-the-earth/` is Andrew's personal copy of the *Morning Of The Earth* soundtrack, committed for his own use. 
## Developers

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run typecheck
```

- **URL options:**
  - `#ref=<name>` opens a reference moment (`src/dev/referenceMoments.ts`); `#m=…` is a copied moment link.
  - `?selftest` runs the GPU and audio self-tests instead of the game.
  - `?fresh` starts from the defaults without loading or saving settings.
- **WebGPU:** it needs a WebGPU browser (current Chrome or Edge). On hybrid-GPU laptops, set the browser to "High performance" in Windows Graphics settings and fully quit the browser (including background processes) before relaunching. The stats overlay names the GPU in use. Keep both GPU drivers current.
- **Design docs:**
  - specs: `docs/superpowers/specs/`;
  - plans: `docs/superpowers/plans/`;
  - each phase's captures, measured costs and tuning points: `docs/superpowers/gallery/`.
