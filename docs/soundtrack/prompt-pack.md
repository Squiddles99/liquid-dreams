# Liquid Dreams soundtrack: prompt pack

This is a brief for generating an original soundtrack with an AI music model (Suno, Udio, Stable Audio, ElevenLabs Music and the like). The goal is the *feel* of an early-70s Australian surf film: warm, sun-faded and a bit stoned. It must not copy any real record.

## Ground rules

- **Never name** *Morning of the Earth*, its artists (G. Wayne Thomas, Tamam Shud, Brian Cadd, Terry Hannagan and others), Albert Falzon, or any real song. Describe the sound instead.
- **Use a paid plan that grants commercial rights.** Screenshot the terms page on the day you generate, and save it in `docs/soundtrack/terms/`.
- **Write your own lyrics.** Human-written lyrics are yours, and they give the vocal tracks a clearer ownership story. Drafts are below. Change them freely.
- **Generate 4–6 takes per prompt**, then keep the best one. Use "extend" to reach the target length, not one long generation.
- **Log every keeper** in the provenance table at the bottom. Steam's AI disclosure is easier to answer honestly when the record already exists.

## The shared style (paste at the front of every prompt)

> 1970s Australian surf film soundtrack, analog tape warmth, acoustic 12-string and nylon guitars, loose live drums with brushes, round warm bass, hazy spring reverb, a little tape wobble, recorded in a wooden room, sun-bleached, unhurried, hopeful, slightly psychedelic, no modern production, no EDM, no trap hats, no autotune

For vocal tracks, add:

> soft male or female lead vocal, close-miked, double-tracked harmonies on the chorus, earnest, not polished

Keep the album coherent by using the same model version for every track, and the same vocalist persona if the tool supports one.

## The tracks

Each track maps to a moment the game already has. The music player plays `music/<album>/` in file-name number order, so the numbers below double as the running order.

### 1. Womb — title and first light (vocal)
**Moment:** the game opening, or dawn in the lineup.
**Prompt:** *shared style* + `slow build from solo fingerpicked 12-string, vocal enters at 0:40, full band by the second chorus, key of D major, 84 bpm, morning, reverent`
**Length:** 3:30–4:30

Draft lyrics:
```
[Verse]
Limestone wakes before the sun
cold water breathing on the ledge
we paddle out when the night is done
and wait out there on the edge

[Chorus]
Hold me in the womb of the sea
where the light comes curling in
hold me till the set comes to me
and the morning lets me in

[Verse]
Sand in the pockets, salt on the skin
heath still asleep on the hill
the swell lines up, the tide slides in
and everything else goes still

[Chorus]

[Outro]
(humming, guitars ring out)
```

### 2. Glass — dawn session, no wind (instrumental)
**Moment:** a glassy morning, waiting in the lineup.
**Prompt:** *shared style* + `instrumental, dreamy nylon guitar melody over a fingerpicked pattern, soft vibraphone, gentle hand percussion, 72 bpm, very spacious, lots of air between notes`
**Length:** 4:00+ (it loops under the ocean, so longer is better)

### 3. Lull — between sets (instrumental)
**Moment:** a long lull while you sit and watch the horizon.
**Prompt:** *shared style* + `instrumental, meditative drone jam, tanpura-like drone, slide guitar phrases, sparse congas, 66 bpm, patient, floating, no big changes`
**Length:** 5:00+

### 4. Set Wave — a set arrives (instrumental, energetic)
**Moment:** a set on the horizon, paddling for the drop.
**Prompt:** *shared style* + `instrumental, driving acoustic strum, fuzzy electric lead guitar, tambourine and full kit, rising energy, 112 bpm, joyful urgency, key of E`
**Length:** 3:00–3:30

### 5. Offshore — clean morning on the reef (vocal)
**Moment:** mid-morning, offshore wind, spray off the lip.
**Prompt:** *shared style* + *vocal add-on* + `mid-tempo folk-rock, harmonica fills, organ pad, 96 bpm, carefree, road-trip feeling`
**Length:** 3:00–4:00
**Lyric theme:** the drive down the coast road through the karri to Ellensbrook. Ask me to draft it.

### 6. Heathland — walking the dunes and scrub (instrumental)
**Moment:** walk mode on the beach and up into the heath.
**Prompt:** *shared style* + `instrumental, pastoral acoustic duet, flute or recorder melody, light shaker, birdsong-like guitar harmonics, 90 bpm, sunny afternoon stroll`
**Length:** 3:30+

### 7. Onshore Blues — wind's come up (instrumental)
**Moment:** afternoon onshore wind, messy surf, closeouts on the right.
**Prompt:** *shared style* + `instrumental, loose bluesy jam in A minor, slide guitar, walking bass, lazy shuffle drums, 80 bpm, shrugging, good-humoured`
**Length:** 4:00+

### 8. Bombie — big day out the back (instrumental, heavy)
**Moment:** 6 ft+ and the Bombie booming 450 m out.
**Prompt:** *shared style* + `instrumental, heavy psychedelic rock, fuzz bass, big tom rolls, wah guitar, slow and huge, 70 bpm, ominous but thrilling, long jam`
**Length:** 5:00+

### 9. Storm Front — weather rolling in (instrumental)
**Moment:** darkening sky, rain on the water.
**Prompt:** *shared style* + `instrumental, minor-key fingerpicking, cello or bowed bass, distant thunder-like timpani, tape-delay guitar swells, 76 bpm, brooding, beautiful`
**Length:** 4:00+

### 10. Last Light — sunset session (vocal)
**Moment:** golden hour, last waves, paddling in.
**Prompt:** *shared style* + *vocal add-on* + `slow ballad, piano and 12-string, string pad, 70 bpm, grateful, bittersweet, big final chorus that fades`
**Length:** 4:00–5:00
**Lyric theme:** one more wave, then in. Ask me to draft it.

### 11. Campfire — night on the beach (instrumental)
**Moment:** night, stars, swash on the sand.
**Prompt:** *shared style* + `instrumental, lone acoustic guitar and soft hummed harmony, campfire recording, crickets-like ambience, 64 bpm, intimate, sleepy`
**Length:** 3:00+

## Workflow

1. **This week:** generate tracks **1** and **2** in two different tools, with the same prompts. Listen next to the game running and pick the tool that nails the feel.
2. Generate the rest in the chosen tool. Keep one to three candidates per track.
3. Drop the keepers into `music/liquid-dreams-ost/` as `1. Womb.mp3`, `2. Glass.mp3` and so on. The player picks the folder up automatically.
4. Play a few sessions with it. Anything that pulls you out of the ocean gets regenerated.

## Provenance log

| # | Title | Tool + model version | Plan / licence | Date | Prompt (as used) | Lyrics by | Kept file |
|---|-------|----------------------|----------------|------|------------------|-----------|-----------|
| 1 | Womb | | | | | Andrew / Claude | |
| 2 | Glass | | | | | — | |
