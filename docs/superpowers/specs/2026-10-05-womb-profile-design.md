# The Womb's profile: one shape rule, drawn from Andrew's sketch

Date: 2026-10-05. Branch `claude/eager-darwin-d5a369-8bsax4`, from main 0863113. Brainstormed with Andrew on 2026-10-05,
section by section. Drawings: `2026-10-05-womb-profile-mockup/` (`profiles.html`, made by `profiles.py`).

## Why

Andrew, 2026-10-05: the break is not true to the Womb. The benchmark is Virtual Surfing (2021, Steam 993340): smooth,
glassy, round tubes and a thick lip. Today only the take-off barrels. Down the line the wave is a high, semi-crumbling
curl in the top corner. The lip also "tears out" of the face. The curl's samples blend in from homes that are fractions
of uFoot (`lipProfile.sampleHome`, about 0.6 uF for the ceiling and tip). uFoot sits past the finished tube's landing
(14–18 m on a big tube), so the young lip grows out of the face about 5 m below the crest. Andrew is tired of signing off
sketches that never reach the game, or that hold only at the one slice they were checked against.

The cause is structural: the breaking shape is the sea sheet plus layers of corrections (sharpening, drain, pile, fitted
overturns, the ribbon's homes on the sheet). This design replaces that with one parametric shape rule. It is drawn from
Andrew's side-on sketch, and the drawings and the game share the same code.

## Conventions

- **Side-on drawings use viewpoint A** (Andrew, 2026-10-05): behind the rider, looking down the line of the left. Beach on
  the right, open sea on the left, lip throwing left to right. The Womb's left peels right to left when you face the
  beach from the water. Plan views are drawn facing the beach from the sea.
- Shapes are drawn at equal horizontal and vertical scale.

## Success

- The cross-section at every crest station, at every stage, is the approved profile family (§1) for that station's
  numbers. That holds along the whole left, at several swell sizes and tides, on the CPU and the GPU (§5).
- The lip leaves from the crest itself. There is no tear out of the face.
- The left barrels through a first section of about 7 s of ride on a heavy day (Andrew). It then backs off in a gap the surfer can
  kick out through, and walls up into a second section with its own, thicker character. On huge swells the second
  section mostly closes out. The right closes out.
- A wrong swell direction or a wrong tide makes the Womb less hollow.
- The drawn sea (GPU), the CPU water the ride stands on, the foam, the spray, the sound and the tube light all agree on
  the shape and the timing.
- Andrew signs off each build step by eye (§7).

## Design

### 1. The profile family (the shape rule)

One function, `womb/profile.ts` (name to be settled in the plan): `(phase, hollow) → a smooth curve in units of H`. The
curve runs from flat sea well behind the crest, up the back, over the crest, round the lip's outside to its tip, back
along the lip's underside (the tube's ceiling), down the barrel wall to the floor, through the trough, and out to flat
sea in front.

- **Keyframes.** The stages Andrew approved are stored as point sets (14 points today, in units of H):
  - 0, unbroken swell
  - 0.25, standing up
  - 0.5, lip pitching
  - 0.75, throwing
  - 1, round barrel

  A sixth stage is added (§1.1). The points are joined by one centripetal Catmull–Rom curve, so it is smooth with no
  corners. Between keyframes the points move with a smoothstep in phase.
- **Shape at the target.** The back rises gently from sea level to a crest well above it, so a paddler going over it
  goes downhill. A thick lip is thrown far forward into a round barrel. The barrel floor, and the water in front, sit
  below sea level. The lip pitches from the crest at every stage.
- **Hollowness** (0–1) scales the lip's throw about the crest (×0.55–1) and the draw-down below sea level (×0.45–1). It
  lifts the throw's landing as it drops.
- **Height** scales the whole curve. The shape is the same at 4 ft and 12 ft.
- The curve never crosses itself. That is checked over the whole (phase, hollow) square (§5).

#### 1.1 Collapse (stage 6)

After the round barrel, the lip lands and the tube behind the surfer caves in. It becomes a rolling wall of white water
heading for the beach, then settles back to sea. Andrew (2026-10-05): the time this takes depends on the wave's power.
A small wave collapses quickly. A big, thick, long-period wave holds its tube shape longer. The collapse is a keyframe
sequence like the others. Its duration comes from H and the swell period (§2). The foam, spray and white water that
exist today are laid over it unchanged. Tuning them waits until shape and timing are right (Andrew).

### 2. The numbers per station

Each crest station (`crestTrace`, kept) gets four numbers. These are the only inputs to §1.

| Number | From |
|---|---|
| height H | the station's local height, as today (`setWaveModel.localHeight`) |
| phase | the onset record, kept (`reefField.computeOnsetRecord`, with the peel stretch): time since this point's onset, scaled through the stages |
| hollowness | new, baked into the reef field: how sharply the bed steps up from deep water to breaking depth under the breaking point, seaward over about one breaking-wave length. A sharp step gives a high value; a gentle slope gives a low one. It falls with the wrong swell direction or tide because the step is measured along that swell's rays at that tide |
| collapse time | H and the swell period: bigger and longer-period waves hold the tube longer |

Stations along the crest change smoothly, so neighbouring slices never jump. The numbers are filtered along the crest as
the reef field's breaking depth already is.

### 3. The reef

Allowed by Andrew (2026-10-05). Stop pushing back on reef changes. Only the depth shape of the ledges changes. Colour,
kelp, sand pockets and the reef's look stay.

- **The left, first section.** The north ledge (`wombReef.NORTH_LEDGE` and the shelf) is reshaped into a sharp step
  along its whole length, not only at the take-off corner. That keeps hollowness high. Its angle to the arriving swell
  is set for a peel the rider can make. The peel-stretch spec measured makeable peels at about 5–9 m/s against the
  rider's 10–11 m/s, so about 7 s of ride is about 35–65 m of ledge. The peel-stretch dial is kept. The reshaped ledge
  may let it come down toward 1; that is decided in tuning.
- **Character.** The left is not uniformly hollow (Andrew). It has a gap: the ledge backs off into slightly deeper
  water, so the wave softens and the surfer can kick out. After the gap, a second section walls up with a heavier,
  thicker character. On huge swells the bigger wave breaks further out over more of that ledge at once, so it mostly
  closes out. That follows from the reef's shape, not a special rule.
- **The right.** The south ledge is turned close to square-on to the swell, so it breaks at once and closes out.
- **Conditions.** Swell direction and tide change hollowness through §2. The best days are the right swell on the right
  tide.

### 4. Into the game

**Kept** (about 86% of `src`):
- sets and timing (`SetWaves`)
- the reef field and its onset and peel bake (`breaker/reefField.ts`), which gains the hollowness array
- `crestTrace` stations
- the `BreakingRibbon` GPU mesh pipeline: stations, frame, vertex and normal passes, footprint
- the water shading and the tube light
- emitters, foam, spray, sound, the surfer and the ride
- everything outside the breaker

**Replaced** (about 5.7k lines). These are removed outright, with their tests, not switched off:
- the shape rules in `lipProfile` and `lipProfileNodes`
- `breaking` and `breakingNodes` sharpening, drain and pile
- the breaking parts of `setWaveModel`
- the overturn fits (`overturn`, `overturnNodes`)

New tests replace the retired ones (§5).

**One surface.** Within each station's slice, the §1 curve is the whole surface from flat water behind to flat water in
front. The open-sea sheet, exactly as now, takes over only where both are flat. The footprint marks where the sheet
steps aside, as today. Nothing joins near the lip or the tube. The CPU water that the ride stands on evaluates the same
rule as the GPU, so the surfer rides the shape that is drawn.

### 5. Proof that the sketch reaches the game

- **One source.** The approved drawings are generated by the game's own §1 code, not by a separate script. The current
  `profiles.py` is the sketch that §1 ports. Each approved set is saved with its sign-off date.
- **Everywhere, every stage.** A vitest check compares the station cross-sections against the saved approved set:
  - at every station along the left (first section, gap, second section)
  - at every stage, from swell to collapse
  - at several swell sizes and tides
  - with no self-crossing anywhere in (phase, hollow)

  A drift past a small tolerance fails and blocks the merge.
- **On the GPU.** A ribbon self-test on Andrew's PC checks the GPU's cross-sections against the same shapes. The cloud
  has no GPU.
- **In the game.** A debug view draws the approved outline over the live wave at a picked point.

### 6. Performance (later work, recorded here)

The water and wave take about 8.5 ms of GPU per frame on Andrew's RTX 40-series laptop GPU. The new rule should cost
less than the layered construction. That is measured on his PC, not assumed. Quality settings are separate, later work
(Andrew, 2026-10-05). The rule is built so they can slot in.

- **Minimum:** 60 fps at 1080p on Low with an RTX 3060 / RX 6600 class card (agreed).
- **Upper tiers:** Andrew's laptop is not the ceiling. Ultra is for bigger rigs.
- **What tiers cut:** kelp, weather, foam and spray detail, reflections, and the breaking mesh's density and fine-detail
  distance. They never change the wave's shape. Low draws the approved barrel with fewer points.

### 7. Build order

Each step ends with pictures for Andrew before the next starts.

1. The §1 rule in TypeScript, with the drawings regenerated from it. No game change.
2. The reef reshaped (§3): a top-down map plus side-on slices along the first section, gap and second section.
3. The new shape in the game (§2, §4): captures on Andrew's PC.
4. The old code removed, then timing and collapse tuned against what Andrew sees.

## Open (for the plan)

- The exact hollowness measure and its range on today's reef against the reshaped one.
- The mapping from time since onset to phase: how long each stage lasts, scaled by H and the period.
- The collapse keyframes. They will be drawn for Andrew before step 3.
- Profile samples per station. Today there are 160 in 7 segments. The new curve needs no segments, only a sample count.
