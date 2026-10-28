# Float, the Groove version: the contract

Oct 27. Brandon's second playtest rejected the 3D direction ("uncanny", "you
can't see yourself when you're behind") and asked for a reroll in the style of
**Rhythm Heaven Groove**. This file is the contract for that version. It
replaces `PROTOCOL.md`'s gameplay, screen and art sections; everything
PROTOCOL.md says about rooms, the Cup's shape, the drink rule, looks, the
Field Day bridge, persistence and pages still holds unless this file says
otherwise. The 3D river (the screen in `float/client/screen/world/`, the 3D
art, the paddling physics in `sim.js`) is PARKED on branch `float/proto` as a
fallback; nothing here deletes it.

## The game in one paragraph

Everyone's critter floats down the river together in one flotilla, always all
on screen, seen from the side. Each round is a short song with a host critter
on the riverbank calling cues ("Hey!") and everyone answering on the beat with
one tap on their phone. Every tap is judged and the TV shows each player's
result over their critter, Cake Wait style: **"+0.03 Late"**, **"-0.01
Nice!"**. Your score moves your critter ahead or behind in the flotilla. In the
middle of every song the music drops into an 8-bar drink break: everyone
finishes their drink before the beat comes back. After each song the lowest
scores are out (13, 9, 6, 3) and the last three play the final song for the
podium.

## The look (Rhythm Heaven Groove; Brandon's screenshots)

- Characters: **white, round, deadpan** critters (a soft white body like the
  game's blob people) with **thin, slightly wobbly black outlines**, **dot
  eyes**, a small frown or "o" mouth as the default face. Species read from
  the silhouette only (ears, horns, beak, shell, plume) drawn in the same
  line, with at most one soft species tint.
- Identity colour goes on the **tube and the hat only** (Cake Wait's
  bright-hair trick): every rider is the same white critter, and the colour
  says who.
- Backgrounds: soft **pastel gradients** (mint, peach, lilac) with a
  **checkered floor/water that fades** into the distance, simple flat shapes
  (mesas, saguaros, a big sun), lots of empty space.
- One or two loud accents per scene (the game's rainbow hoop: a ring, a flag).
- Judgement type: **big chunky pixel lettering** with a dark outline:
  numbers in salmon, "Nice!" in yellow, "Perfect" in white on gold, "Miss" in
  grey.
- Motion: everything bounces on the beat; squash and stretch; deadpan
  reactions (the flub when you miss is the comedy).
- Built from generated sprites and backgrounds (see the pipeline below) placed
  and animated in 2D (DOM/CSS or canvas), no WebGL: cheap on any TV and phone.

## The art pipeline (image generation)

Brandon's OpenAI key (Windows user environment `OPENAI_API_KEY`; read it into
a child process's environment, never print it, never commit it) drives the
image models (`gpt-image-2.5-sunburst` first, then `gpt-image-2`). The
approved concept frames are in `float/look/`: `lineup.png` (the 13 critters:
THE reference for every character), `flotilla-a.png` and `flotilla-b.png`
(the river scene, the popups), `lastcall.png` (the bar). `scripts/float-imagegen.mjs`
calls the API. Prompts describe the style in plain words and never name
another game. Assets are generated, then processed with `sharp` into
`public/float/groove/` as WebP with a manifest.

- **Critters**: one sprite per critter per pose, transparent, each critter
  generated from `lineup.png` as its reference (the images API's edit/reference
  input) so the 13 stay one family. Poses: `idle` (arms on the tube),
  `stroke` (a paddle splash), `nice` (pleased), `miss` (splashed in the face,
  an "o" mouth), `chug` (drinking from a cup), `cheer` (arms up), `out` (sad).
- **The tube carries the rider's colour**, so it is coloured at run time:
  each sprite is split offline into the critter and a tube mask with its
  shading (a chroma-key or a separately generated tube), and the screen fills
  the mask with the rider's colour. Same for the phone's portrait.
- **Backgrounds**: one per song (four river legs: Put-in, the Narrows,
  Whirlpool Bend, the Drop), the lobby, the bar (Last Call) and the podium, in
  layers where parallax helps (sky, far mesas, the bank, the water band).
- **The host**: a critter on the bank in a straw hat with a megaphone, poses
  `idle`, `call` (megaphone up), `cheer`.
- **Manifest** `public/float/groove/manifest.json`: every sprite's file, size,
  its anchor points (the waterline, the head top for a hat, the face centre),
  and per-critter offsets, so the screen and phone place everything from data.
- **Type**: a pixel font (OFL, e.g. Silkscreen or Pixelify Sans) in `/fonts`
  for the judgement popups, with a dark outline.
- Customization for the weekend: the critter and the rider's colour. Hats,
  shades and floatie designs only if time remains.

## Songs and charts (`float/shared/chart.js`)

All songs are 120 bpm (`BEAT_MS` 500 from `beat.js`), 4/4, bar = 2 s.

A song is a list of sections, each a number of bars:
`intro` (2 bars: title, count-in) -> `practice` (4 bars: tap on every beat;
judged and shown, never scored; it teaches and calibrates) -> `play` (8 bars)
-> `drink` (8 bars) -> `play` (8 bars) -> `outro` (2 bars). 32 bars = 64 s.

A cue is `{ id, beat, call }`: the beat (from the song's start) the player
taps on, and the beat the host calls it (the call-and-response lead, usually
2 beats before). The host animates and sounds the call; the player answers.

Wednesday (must): every song uses taps only; the four rounds are four
patterns of the same mechanic:

| Round | Song | Leg | Pattern |
|---|---|---|---|
| 1 | Paddle Party | Put-in | taps on beats 1 and 3, a "Hey!" answered on 4 every other bar |
| 2 | Rock Hop | The Narrows | "ba-dum" (beats 1, 2) answered with a hop on 3; later off-beat "and" hops |
| 3 | Whirlpool | Whirlpool Bend | rolling triplet-feel calls, answers that land on 2 and 4 |
| 4 | The Drop | The Drop (final) | a remix of all three, ending on one big tap on the last beat (the waterfall) |

Thursday (if the tap game is fun): hold and release cues.

## Judging (the phone judges; the room keeps score)

- The phone stamps a tap on the server clock (touch event time, as
  `controller/rhythm.js serverStamp` does), subtracts its **calibration
  offset**, finds the nearest cue whose window is open, and computes
  `d = t - cueTime` in ms.
- Windows (|d|): **Perfect <= 50**, **Nice! <= 100**, **OK <= 160**, else
  **Early** (d < 0) / **Late** (d > 0) up to 300 (counts as a miss with its
  sign); beyond 300 the tap matches no cue and is ignored.
- One judgement per cue per player (the first tap in its window). A cue with
  no tap by `cueTime + 300` is a **Miss**.
- Points: Perfect 100, Nice 70, OK 40, Early/Late/Miss 0. A round's score is
  its percent: points / (100 x cues).
- `{t:"hit", c, d}` phone to room (cue id, calibrated offset). The room
  re-judges with the same function (`judgeHit` in `chart.js`), ignores
  duplicates, and broadcasts `{t:"ev", e:"hit", i, c, q, d}` to everyone;
  misses are the room's own (`q:"miss"`, no `d`).
- **Calibration** (phone only, silent): during each song's `practice`, taps
  within 350 ms of a beat collect raw offsets; the median (clamped to +-250
  ms) becomes the phone's offset for every later tap, refined each song. A
  player tapping to a TV whose sound runs 150 ms late is judged on the beat.

## The popup (the spine of the design)

Over each critter on the TV, the latest judgement for 700 ms, one at a time
per player (a new one replaces the old): the signed offset in seconds to two
decimals ("+0.03", "-0.01") above the word (Perfect / Nice! / OK / Early /
Late / Miss). A miss pops "Miss" in grey and the critter flubs (a splash in
the face, a wobble). During `practice` popups show (it teaches) but nothing
scores. The phone shows the same for its own taps, instantly and big.

## The drink break

8 bars in the middle of every song. The music drops into the lounge groove,
every critter on the TV chugs, phones show "Drink!" and a big Done. When the
beat comes back, a rider who has not tapped Done keeps chugging on the TV and
their cues count as misses until they do. Riders who don't drink (or a room
with drinking off) are done at once. No "Drinking" label anywhere: the
chugging critter is the signal.

## Rounds, elimination, positions

- After each song (not the final): the lowest round percents are out
  (13 -> 9 -> 6 -> 3; `cupSchedule` as before), ties broken by the Cup total.
- The final song's percent orders the podium.
- On the TV every rider is always visible: the flotilla is 2 or 3 staggered
  rows; a rider's x drifts ahead or behind by their score relative to the
  field (clamped to the screen). Eliminated riders move to the bank as the
  crowd.

## What the room sends (beyond PROTOCOL.md)

- `room`: `song` (id), `songAt` (server time of the song's beat 0), `chart`
  (the song's cues and sections, so screens and phones need no lookup),
  `scores` (per entrant: this round's percent and points, the Cup total),
  `cut`, `lastRound`, `out` as before.
- `ev hit` as above; `ev done` when a rider taps Done in a drink break.
- `me`: own `score`, `percent`, `place`, `of`, `cut`, and `q`/`d` of the last
  judged cue.
- No `snap` rows (nothing moves by physics); the TV animates from the clock
  and the scores.

## Floaties

In a rhythm game the floatie is a look, not a stat: the eight floaties stay
as tube designs in the Locker; their stats are not used.

## Last Call (after song 1 is fun; Brandon asked for Cake Wait by name)

Between rounds, during the cut: the bartender slides a drink down the bar on a
rhythm; every rider grabs on the beat with one tap; the TV shows every offset
big, Cake Wait style; the worst grab drinks. Reuses everything above.

## Wednesday night target (in cut order: the last line goes first)

1. Song 1 complete: chart, music with clear calls, TV scene, phone, popups,
   calibration, the drink break, scoring, elimination to the next round.
2. The Cup through all four rounds (songs 2 to 4 as tap patterns).
3. Last Call.
4. Hold and release cues.

## Process

Builders commit every 30 minutes with a two-line progress note in the
message, so a dropped session costs a resume, not a rebuild.
