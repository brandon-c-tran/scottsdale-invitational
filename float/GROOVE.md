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
- **Backgrounds**: one per song (open water for Paddle Party, rocks for Rock
  Hop, a whirlpool for Spin Cycle, the falls for The Drop), the lobby, the bar (Last Call) and the podium, in
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

A cue is `{ id, beat, kind, call, scored }` (`float/shared/chart.js` is the
source; `chartOf(songId)` builds the whole chart as plain JSON): `id` its
index (ascending by beat), `beat` the beat from the song's beat 0 the player
taps on (fractional for an "and"), `kind` (`paddle`, `hey`, `hop`, `spin`,
`drop`), `call` the beat the host calls it (`beat - lead`; null for a paddle,
whose call is the pulse), `scored` false in practice. The chart also carries
`sections` (`{kind, bar, bars, from, to}`) and `modes` (one per bar: `intro`,
`paddle`, `rock`, `spin`, `drop`, `drink`, `outro`; what the riders do, a bar
ahead where a bar has no taps, so the scene changes before the taps).

**Answer the host.** Every call is the answer's own rhythm, a fixed lead
earlier: one call note per cue, and the player taps the same rhythm after
it. The host animates and sounds each call; the player answers.

Wednesday (must): every song uses taps only; the four rounds are four
patterns of the same mechanic:

| Round | Name | Pattern (chart.js `PLANS`) |
|---|---|---|
| 1 | Paddle Party | paddle on 1 and 3 every bar (the pulse is the call); the host's "Ready" answered with "Hey!" two beats later, on 4; doubles ("Hey! Hey!" on 4 and its "and") in the second half |
| 2 | Rock Hop | each bar is the host's half (beats 1, 2) then yours (3, 4): the host's "ba" notes echoed by hops two beats later; one, two or three hops, "and" hops later |
| 3 | Spin Cycle | the host spins on 1 and 3, you echo one beat later on 2 and 4 (the backbeat); doubles on the "and" later |
| 4 | The Drop | the final: a bar of each pattern in turn, switching faster after the drink, a bar of paddling on every beat, then the music cuts, the host counts three beats, and one tap on the drop (bar 30, over the falls) |

Cue counts: Paddle Party 46 scored (10 practice), Rock Hop 30 (6), Spin Cycle
39 (8), The Drop 46 (9). The last cue of songs 1 to 3 is in bar 30 (the
outro's big finish).

Names say what you do (Brandon, Oct 27: no river jargon; "Put-in", "The
Narrows" and "Whirlpool Bend" are gone everywhere a player sees them). The
scenery still changes per round: open water, rocks, a whirlpool, the falls.

Thursday (if the tap game is fun): hold and release cues.

## Judging (the phone judges; the room keeps score)

- The phone stamps a tap on the server clock (the touch event's own time,
  `controller/rhythm.js serverStamp`), and `matchTap(chart, songAt, t,
  { offset, taken })` finds the nearest cue not yet judged within 300 ms,
  judged with the room's current `offset`: `{ cue, d, r }` (`r` raw: the
  tap's server time minus the cue's; `d = r - offset`).
- Windows (|d|, `WINDOW`): **Perfect <= 50**, **Nice! <= 100**, **OK <=
  160**, else **Early** (d < 0) / **Late** (d > 0) up to 300 (0 points, with
  its sign); beyond 300 the tap matches no cue and is ignored.
- One judgement per cue per player (the first tap matched to it). A cue with
  no hit by `cueTime + offset + MISS_AFTER_MS` (550) is the room's **Miss**.
- Points: Perfect 100, Nice 70, OK 40, Early/Late/Miss 0. A round's score is
  its percent: points / (100 x scored cues) (`scoreOf`; `live` is the share
  of the cues played so far, for the flotilla).
- `{t:"hit", c, r}` phone to room: the cue id and the RAW offset. The room
  judges it with its own offset (`judgeHit`), ignores a second hit on a cue,
  and broadcasts `{t:"ev", e:"hit", i, c, q, d}`; misses are the room's own
  (`q:"miss"`, no `d`).
- **Calibration is the room's, one offset for everyone** (changed Oct 27 from
  per phone: a per-player offset would judge a consistently late player
  Perfect and remove the skill; all guests are on iPhones, so the delay that
  matters is the TV's sound, and the room shares it). The room collects the
  raw `r` of PEOPLE's hits on practice cues (never bots' or stand-ins');
  `calibrate` (median of those within 350 ms, clamped to +-250, at least 4)
  is the offset, recomputed as practice runs (sent in `room.offset` at most
  once a beat, so practice popups settle within a bar) and fixed from the
  first play bar for the rest of the song. A song whose practice has fewer
  than 4 samples keeps the last song's offset (0 at first). In solo QA the
  one person's practice is the room's.

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

- **Phases**: `lobby -> intro -> [song -> cut] x rounds -> podium ->
  feedback -> lobby`. `song` replaces `grid`, `countdown` and `race`: its
  `startAt` is when the round card goes up, `songAt = startAt +
  SONG_LEAD_MS` (3 s) is beat 0, `endsAt = songAt + SONG_MS + SONG_TAIL_MS`.
  Nothing in Field Day reads Float's phase names (its surfaces read the
  Tournament's event lifecycle), so the rename breaks only Float's own
  screen and controller.
- `room` adds: `song` (id), `songAt`, `chart` (the whole `chartOf(song)`,
  sent with `welcome` and when the song changes; otherwise `chartId`),
  `offset` (the room's calibration, ms), `scores` (`[{ i, pts, pct, live,
  n, cup, done }]` for the field: this song so far, `cup` the sum of the
  rider's earlier songs' percents, `done` whether they have tapped Done in
  this song's drink break), sent at phase changes and every 4 s in a song
  (the TV moves riders between them from `ev hit`). `cut`, `lastRound`,
  `out`, `standings`, `podium` as before.
- `ev hit {i, c, q, d}` as above; `ev done {i}` when a rider taps Done.
- `me` (each controller, after each of its hits and at phase changes): `i`,
  `pts`, `pct`, `place` (in this song so far), `of`, `cut` (places that go
  through, null in the final), `done`, and the last judged `c`, `q`, `d`.
- No `snap` rows (nothing moves by physics); the TV animates from the clock,
  `ev hit` and `scores`.
- Client to server: `hit {c, r}`; `drink` (already in PROTOCOL.md) is Done;
  `hello`, `ping`, `look`, `ready`, `host`, `feedback` as before; `stroke`,
  `hands` and `balloon` are gone.
- Bots hit every cue at its time with a raw offset drawn from their skill
  (a good bot within about 30 ms, a weak one about 90 ms and an occasional
  miss), and tap Done 4 to 14 s into the break. A person whose phone has been
  gone 5 s is played by a stand-in bot (skill 0.55) until it is back, as in
  the 3D Cup (`botShare` in the stats); stand-ins never calibrate.
- The room saves the Cup at phase changes and its judgements every 2 s in a
  song (`allowUnconfirmed`); a restarted room picks the song up by the clock
  (`songAt` is in the save), so nothing restarts.

## The art manifest and the 2D art module

`public/float/groove/manifest.json` (served at `/float/groove/manifest.json`;
paths inside are relative to `/float/groove/`):

```
{
  "v": 1,
  "poses": ["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"],
  "box": [512, 512],
  "critters": {
    "<critter id>": {
      "anchor": { "water": [x, y], "head": [x, y], "face": [x, y], "hand": [x, y] },
      "poses": { "<pose>": { "src": "critters/<id>/<pose>.webp", "tube": "critters/<id>/<pose>-tube.webp" } },
      "portrait": { "src": "...", "tube": "...", "w": 1024, "h": 1024, "anchor": { ... } }
    }
  },
  "host": { "box": [w, h], "anchor": { ... }, "poses": { "idle": { "src": "..." }, "call": { ... }, "cheer": { ... } } },
  "scenes": { "<scene>": { "w": 1920, "h": 1080, "water": 0.7, "layers": [ { "src": "...", "depth": 0.2, "loop": true } ] } },
  "props": { "<prop>": { "src": "...", "w": 0, "h": 0, "anchor": [x, y], "tint": false } },
  "font": { "family": "Float Pixel", "src": "/fonts/<file>.woff2" }
}
```

- Every critter pose sprite is the same box (512 x 512), the critter sitting
  in its tube, the waterline at the same `anchor.water` for every pose of a
  critter, so a pose swaps without a jump. Anchors are box pixels.
- **The tube is coloured at run time**: in `src` the tube is a neutral light
  grey carrying its own shading; `tube` is its mask (white, alpha = tube).
  The rider's colour fills the mask multiplied over the shading.
- `poses`: `idle` (paws on the tube), `stroke` (a paddle splash), `hey` (one
  arm up, mouth open, shouting), `nice` (pleased), `miss` (splashed in the
  face, an "o" mouth), `chug` (drinking from a cup), `cheer` (both arms up),
  `out` (sad, deflated).
- Scenes: `open`, `rocks`, `whirlpool`, `falls` (the four songs), `lobby`,
  `bar` (Last Call), `podium`; layered back to front, `depth` 0 (fixed sky) to
  1 (the water's edge, scrolls fastest), `water` the waterline as a share of
  the height. Props at least: `splash`, `ripple`, `rock`, `whirl`, `cup`,
  `crown` (the groom's), and the host's signs `sign-paddle`, `sign-rock`,
  `sign-spin` (The Drop holds one up a bar before each switch).
- **Until the real sprites land**, the art builder ships the manifest within
  the first hour with placeholder sprites cut from `float/look/lineup.png`
  (every pose the one crop, a crude tube mask) and flat placeholder scenes,
  so the screen and phone integrate against real paths from the start; the
  real art replaces files, never the schema.

The module (`float/client/art/groove/`, re-exported by
`float/client/art/index.js`, which no longer imports three.js on this branch;
the 3D files stay in the folder for the parked fallback):

- `loadGrooveArt()` -> Promise of the manifest (fetched once).
- `riderSprites({ critter, color, groom })` -> Promise of `{ [pose]: url }`
  (object URLs of the painted sprites, every pose, cached per critter, colour
  and groom; the groom's carry the crown at `anchor.head`).
- `riderPortrait(entrant, { size })` -> Promise of a PNG data URL (Field
  Day's contract: `src/features/float/floatParts.js` requires it).
- `sceneOf(id)`, `propOf(id)`, `hostSprites()` read the manifest.
- The pixel font is declared once in `float/client/art/groove/groove.css`
  (`@font-face`, family "Float Pixel", OFL licence file beside the font).

`/float/art` shows every critter in every pose in a few colours, the host,
the scenes and the props: the page Brandon reviews the art on.

As built (groove/art, Oct 27; 44 images on `gpt-image-2.5-sunburst`, sources
kept in `float/look/groove`):
- Each critter: a 1024 portrait from its lineup cell, then one 4x2 sheet of
  the eight poses from that portrait (one generation keeps one character).
  The ring was generated flat magenta, keyed to grey shading plus a mask
  thinned at highlights, so every colour keeps a white shine.
- `anchor.water` is the ring's centre at 70% of its height, box point (256,
  440) for every pose of every critter; nothing is drawn below the ring (the
  lower third is underwater); every idle ring is 250 px wide in the box.
  Poses carry their own `anchor` (the crown sits on the head in every pose).
  The `ripple` prop goes centred at `anchor.water`, about 1.35 x the ring.
- `host.box` is [512, 560] (anchors ground, head, face, horn: the
  megaphone's bell; per-pose anchors). A top-level `bartender`, shaped like
  `host`: box [512, 512], poses idle, slide, cheer, waist up, `ground` the
  counter line, `hand` the arm's tip. `scenes.bar.counter` is the counter as
  a share of the height; `props.podium.steps` the tops of the 1st, 2nd, 3rd
  blocks. Props beyond the list: splash-big, podium, drink, confetti-1..4 and
  sparkle (white, tinted at run time).
- Scenes draw in manifest order: sky (depth 0), land (0.3, loops), water (1,
  loops); the water is opaque below `water`.
- `riderSprites({ critter, color, groom, size })` paints at 128, 256 or 512
  (`spriteSize(drawn, dpr)`), so the TV's riders use a quarter of the memory;
  `sceneOf`, `propOf`, `hostSprites`, `bartenderSprites` are synchronous and
  null until `loadGrooveArt()` resolves. `<Popup q d size life />`: `size`
  the number's height, `life` fades it at POPUP_MS; key each judgement.
- The font is Pixelify Sans as "Float Pixel"
  (`public/fonts/pixelify-sans-latin.woff2`, OFL beside it).

## Sound (the Groove)

- Everything sounds through `src/lib/sound.js` (`playSound` / `cueAt`): the
  room bus on the TV, the you bus on the phone. The phone never plays music.
- **One scoped addition to `src/lib/sound.js`, the sound builder's alone:
  the clip path.** Decoded audio files (host voice lines now, generated songs
  later) play through the same `playSound(id, { bus, at, pan, key })` at a
  server-anchored time like any synthesized recipe: a way to register clips
  by id and URL (fetched and decoded once, on first need), and kit recipes
  that play a clip with gain and rate. Web Audio stays inside sound.js
  (`tests/sound-engine.test.mjs`).
- **The beds**: one synthesized song per round in Float's block of the kit
  (`bedBar`), 120 bpm, bar by bar from `songAt` on the server clock, in the
  style above (bouncy funk and J-pop: slap bass, brass stabs, handclaps,
  glockenspiel, a little chiptune). Sections: the intro counts in, practice
  is the groove thin, play is full, the drink break drops into the lounge
  (drums out, keys and a walking bass, "Drink!" at its start, the count back
  in its last bar), play B is fuller, the outro hits the last cue and rings
  out. The Drop's music cuts for its countdown. A lobby loop, the cut's
  drumroll and sting per rider out, the podium fanfare.
- **The host's voice**: lines generated once with OpenAI text-to-speech
  (`gpt-4o-mini-tts`, a cheerful cartoon host), trimmed and pitched up with
  ffmpeg, committed as small MP3s under `public/float/groove/voice/`. The key
  is Brandon's `OPENAI_API_KEY` (Windows user environment), read into the
  child process only, never printed, never committed. For a release, the
  credits say the voice is AI-generated (OpenAI's usage policy).
- **The cues**: the host's call note at each cue's `call` beat (`Ready` for a
  hey, `ba` notes for hops, a whirl for spins, the drop's countdown), the
  answer sound on the cue's beat played by the band for everyone (a paddle
  splash, a crowd "Hey!", a hop's boing, a spin's whoosh, the drop's big
  splash), and a quiet flub for each judged miss, panned to the critter.
- **The phone**: your own tap at once (crisp on Perfect and Nice, a muffled
  slap on Early or Late), Done, Through and Out.
- Generated songs (ElevenLabs, if Brandon adds `ELEVENLABS_API_KEY`) arrive
  as clips aligned to the same bars; swapping a song's bed is data.
- As built (groove/sound b38b315): Paddle Party in F, Rock Hop in A, Spin
  Cycle in E minor (disco), The Drop in D, all on the bar grid. The host is
  `gpt-4o-mini-tts` voice coral, trimmed, pitched up, normalized; 29 clips in
  `public/float/groove/voice/` with a manifest (`aiGenerated: true`;
  alternates fable, sage, verse kept in the review renders). **The voices
  are AI-generated: a release's credits say so.** `src/lib/sound.js` adds the
  clip path (`registerClips`, `preloadClips`, `clipReady`, `clipIds`) and
  `playSound(..., { ahead })` (default 0): the TV lays each bar's band,
  calls and answers on the audio clock about 2 s ahead in one go, so a
  stalled main thread can't drop or smear a bar; a bar laid more than about
  1.8 s late is dropped (a silent beat means a stall); a TV joining mid-song
  hears from its next bar line. A clip that fails to load plays its
  synthesized stand-in. `float/client/sound/index.js` exports the beats the
  picture lands on: `TITLE_BEATS` (ms from `songAt`), `CUT_BEATS` and
  `PODIUM_BEATS` (ms from the phase's `startAt`), `LAST_CALL_BEATS` (beats
  from the bar's `songAt`: bell -4, call -2, each grab's reveal +2, who
  drinks 28, "Drink!" 29); the verdict shows at max(`worst`'s arrival, beat
  28). Renders and the timing check: `node scripts/float-sound-render.mjs`;
  the voice: `node scripts/float-voice.mjs`; the dev page
  `/dev/groove-sound.html`.

## The screen (TV) and the phone

- `FloatScreen` (default export, same props as before) draws on a fixed
  1920 x 1080 canvas, letterboxed, DOM and CSS (no WebGL), 24 px minimum
  text. A rider's action (stroke, hey, hop, spin) plays when their judged hit
  arrives (Cake Wait: you see who is off); the idle bob is on the clock. The
  host acts out every call on its beat. Mock mode (`?mock=1`) plays a whole
  Cup locally with 13 bots through `chart.js`, so the screen is built and
  reviewed without a server. `?debug=1` keeps the readout.
- `FloatController` (default export, same props): in a song the whole screen
  is the pad (touchstart; the event's own time through `serverStamp`;
  `matchTap` with `room.offset`; `hit {c, r}`); your critter on the beat, the
  host's call as a bubble on its beat (a loud room still sees it), your
  popup big and at once, "Practice" in practice. The drink break: "Drink!" and
  a big Done (`drink`); the pad takes no taps until Done. Cut: your percent
  and place, Through or Out. **Screen Wake Lock** (`src/lib/wakeLock.js`) from
  the lobby to the podium: the drink break plus the cut is 30 s and more
  without a touch, past iPhone's auto-lock. The Locker shows 2D portraits.

## Ownership (the Groove builders)

| Builder | Branch (worktree) | Owns |
|---|---|---|
| Engine | `groove/engine` (`fd-groove-engine`) | `float/shared/*` except `chart.js`, `looks.js`, `floaties.js`; `float/worker/*`; `tests/float-engine*.test.mjs`; `scripts/float-sim.mjs` |
| Art | `groove/art` (`fd-groove-art`) | `float/client/art/*`, `public/float/groove/**` except `voice/`, the pixel font in `public/fonts/`, `float/look/*`, `scripts/float-imagegen.mjs` and new `scripts/float-art-*.mjs`, `tests/float-art*.test.mjs` |
| Sound | `groove/sound` (`fd-groove-sound`) | `float/client/sound/*`, Float's block at the end of `src/lib/soundKit.js`, the clip path in `src/lib/sound.js`, `public/float/groove/voice/**`, `tests/float-sound*.test.mjs` |
| Screen | `groove/screen` (`fd-groove-screen`) | `float/client/screen/*`, `tests/float-screen*.test.mjs` |
| Phone | `groove/phone` (`fd-groove-phone`) | `float/client/controller/*`, `float/client/net.js`, `float/client/join/*`, `float/client/locker/*`, `tests/float-controller*.test.mjs`, `tests/float-net.test.mjs` |
| Integration | `float/groove` | `src/features/float/*` and the rest of Field Day, `float/client/main.jsx`, `FloatPages.jsx`, the html pages |

`chart.js`, `protocol.js`'s message lists and this file change only by
agreement (the integrator). A builder who needs a change there says so in its
report and codes against the contract as written meanwhile.

## As built: the engine (Oct 27, groove/engine 26c6ffc)

- `float/shared/groove.js` is the pure song (judging, misses, bot and
  stand-in taps, Done, calibration, scores, ranking); `cup.js` the Cup
  (phases, the cut, standings, `meOf`); `Cup.tick(cup, now, { driven })` the
  one driver for the room, the bench and the tests. Every random draw is a
  hash of seed, round, rider and cue (nothing to save). `FloatRoom`'s
  constructor is unchanged; a mock must call `tick()` in `song` too (any
  rate; 100 ms is the room's). `options.ids` makes a Cup repeatable (stable
  screenshots).
- `room`: `song` in intro, song and cut; `songAt` in song and cut (null in
  intro); `chartId` whenever there is a song; `chart` in full once per socket
  per song (the first room after hello, and when the song changes, the intro
  included); `offset`; `scores` at every phase change, every 4 s in a song
  and when the offset moves; `results` (the live ranking in a song, the final
  one in the cut). Gone: `swapUntil`, `resume`, `len`, `leg`,
  `course`/`courseId`, `entrants[].drank`, `snap`, `replay`.
- `me` adds `round`, `lastRound`, `live`, `n`, and `through`/`out` in the
  cut (`out:true` for riders already out); sent after misses too.
  `me.done` means "no Done owed": true from the start for a rider who
  doesn't drink.
- **Privacy:** a rider who skips the drink in a drinking room shows as done
  on the screens at a bot's moment (4 to 14 s in, with `ev done`), so the TV
  never says who skips; scoring is the same (the break has no cues). With
  drinking off everyone is done from the start and no events are sent.
- Calibration recomputes half a beat into each practice beat; the last
  (beat 23.5) fixes the song's offset. Limits: `hit` 16 a second a socket;
  `cheer` one per 300 ms a rider, only from riders out, in song, cut and
  podium. A phone can't take over a bot's entrant by its public device id.
- Bridge body: `rounds[].leg` is `song`; `results[]` `{who, pid, bot, place,
  pct, pts, perfects, misses, cup, out}`; `stats.rounds[]` adds `offset`,
  `samples` and per rider `{pct, pts, perfects, nice, ok, early, late,
  misses, hits, botShare, doneMs}`. `evId`, `cupId`, `order` unchanged; the
  Tournament stores the rest unread.
- `node scripts/float-sim.mjs` (13 bots; `--phones 4 --lag 120 --late 1
  --dry 1 --fieldday` adds protocol phones; `--cups 50` the skill spread).
  Sharp bots score about 97 to 100%, sloppy ones 73 to 85%. Timing: intro 8
  s, cut 20 s, last cut 7 s (`CUP_TIMING`).

## Special critters (Oct 27)

Winnie, Brandon's own cavapoo, is a 14th critter only the groom can pick
(`looks.js` `SPECIAL_CRITTERS`, `crittersFor({ groom })`; `cleanLook` gives
him to nobody else; never a default, never a bot). Drawn like the 13: the
round deadpan body in his apricot curls (his one soft tint), floppy ears,
dot eyes, a black button nose, and his light-blue bandanna (from Brandon's
own pixel Winnie). References: the photo and pixel art on brandonctran.com,
kept outside the repo. No school, team or brand marks on him.

For the product this is the proof of concept of a paid feature: your own
pet as a playable critter, picked only by its owner. Characters from other
companies' games stay out: their studios own them, and selling or shipping
a copy isn't parody.

## Floaties

In a rhythm game the floatie is a look, not a stat: the eight floaties stay
as tube designs in the Locker; their stats are not used.

## Last Call: the countdown (Oct 28, after playtest 1)

Brandon, playtest 1: the three grabs were "interesting", but "I don't know
what Last Call means without a lead-in", and he wants Cake Wait's game: "it
goes 10, 9, 8, then gets tricky and has funny slapstick cutscenes and you
have to count down the rest in your head and try to get it on 0, and the
timer sometimes slows down, and then counts verbally and then just ticks".
The grabs are gone.

Between songs, after each cut but the last, phase `lastcall` at the bar:
everyone in the Cup (the field and the riders out). The bar closes at zero.
The bartender counts down from 10, a second a count, the numbers big on the
bar's clock and said out loud; partway the count goes dark (a slapstick bit)
and everyone counts the rest in their head and taps once, on zero. The
farthest from zero drinks (every rider tied on it). Never scored in the Cup.

- The chart: `chartOf(lastCallId(k))` for the Last Call after round k:
  `lastcall-lights`, `lastcall-slow`, `lastcall-ticks` (harder each time).
  One cue, kind `zero`, at the countdown's zero, window 3 s
  (`LAST_CALL.WINDOW`; no tap counts 3000 ms, `MISS_MS`). `chart.countdown`
  (ms from `songAt`): `{ trick, first, introMs, steps:[{ n, at, show, say,
  tick }], hideAt, zeroAt, revealAt, verdictAt }` (`countdownOf`).
  - **lights** (the first): 10 to 4 shown and said, a second each; at 3 the
    bartender pulls the light cord: dark; zero 10 s after 10.
  - **slow**: 10 to 7 at a second, then every count from 6 stretches to
    1.4 s (still shown and said, so the room hears it slow down); dark at 3
    at the slower pace; zero 12.4 s after 10.
  - **ticks**: 10 to 7 said; 6 to 4 shown with ticks only (the voice stops);
    dark at 3 (foam spills over the clock).
- **The first Last Call says what it is**: a 7 s intro (`INTRO_FIRST_MS`):
  the title "Last Call" and one line, said by the bartender: "The bar closes
  at zero. Tap on zero. Farthest off drinks." Later ones: a 3 s title.
- The TV: the bar scene, the clock or chalkboard over the bar with the
  number, the bartender saying it (mouth on each `say`), the cutscene at
  `hideAt` (a different gag a trick: the light cord, the wind-up clock
  slowing, the foam), every rider at the bar; nothing tells the count once
  it is dark. At `revealAt` every rider's offset at once, big, Cake Wait
  style ("+0.01 Nice!", "+0.73 Late", "-1.20 Early"), sorted or in place;
  at `verdictAt` the farthest off drinks (their critter chugs, the name
  big) and the closest gets a small "Closest" lamp.
- The phone: never shows the count. "Tap on zero" and one big pad; the tap
  is `hit {c:0, r}` (`matchTap` with the room's offset); then "Locked" and
  wait; at `revealAt` your offset; at `verdictAt` "You drink" or "Safe".
- The sound: the bartender's numbers ("ten" ... "four"), a tick, the
  slapstick foley at `hideAt`, silence after, a bell at zero only once
  revealed (never before `revealAt`), the verdict sting at `verdictAt`.
- The engine: everything as built for the grabs holds (excused stand-ins,
  the record, the bridge's `stats.rounds[].lastCall`), with the one cue.
  Bots count in their heads: a sharp bot within about 150 ms, a sloppy one
  800 ms or more, sometimes a second off. Only with drinking on.

## After a song (Oct 28: "turn it up a notch")

Brandon: "we can turn it up a notch to be more creative in what happens
after each round". The cut becomes a show, about 15 s, in order:

1. **Grades**, Rhythm Heaven's three (`gradeOf(pct)`: Superb 90+, OK 65+,
   Try again): a stamp over every rider at once, each with its jingle; the
   phone shows yours big with the judge's line (`feedbackOf(chart, hits)`:
   "Great Heys. Paddles a little late.").
2. **Awards** (`awardsOf(chart, riders)`: Most Perfects, Longest streak,
   Always early, Always late, Most splashes; up to three, one a rider): a
   card each with the critter, a beat apart.
3. **The cut**, with suspense: the cut line, then the riders out revealed
   one by one from the bottom on the drumroll's stings; each leaves with a
   slapstick exit themed to the song: Paddle Party a pelican scoops them
   off; Rock Hop they bonk a rock, see stars and sink in bubbles; Spin Cycle
   the whirlpool flushes them round and down. They land on the bank as the
   crowd.
- The room sends what it needs: `room.results[]` adds `grade`, `room.awards`
  (the cut's, from `awardsOf`), `me.feedback` (`{ grade, line }`), computed
  by the engine from its judgements with the chart's helpers.

## Practice, narrated (Oct 28)

Brandon: "practice needs to be a bit more pronounced with some instructions
on what exactly to do, narrated at the top like Rhythm Heaven does it."

- `chart.lines` is the practice's text box: `{ beat, text }`, shown from
  that beat (a beat before the bar it explains) until the next line or the
  end of practice (`lineAt(chart, beat)`). Paddle Party: "Paddle on 1 and
  3", "When I say Ready, you say Hey!", "Watch", "Your turn". Rock Hop: "Hop
  two beats after me", "Your turn", "Two this time", "Your turn". Spin
  Cycle: "Spin one beat after me", "Your turn", "On the backbeat". The
  Drop: "All three, in turn", "Hop", "Spin".
- **Demo cues**: a practice cue with `demo:true` is the host showing it:
  the host calls it and the band plays the answer, the riders act it out
  together on the TV (the "Watch"), nobody taps it, nothing matches, judges
  or misses it (`matchTap` and `judgeHit` skip it; `playedCues(chart)` is
  what the room judges and misses; `demoCues(chart)` the host's).
- The TV draws the line in a text box at the top center (white rounded box,
  dark text, big; Rhythm Heaven's), the phone at its top. The host says each
  line (a voice clip per line; the sound builder's).

## Looks, the Groove (Oct 28)

Brandon: "can we add some character customization? hats, glasses, etc, and
maybe some identifier as an extra option that uses the profile picture,
maybe the profile pic on a shirt that's the color of the selected person's
color".

- `look.hat` (HATS: cowboy, bucket, visor, captain, party, flowers; crown
  the groom's), `look.shades` (SHADES: aviators, hearts, stars, goggles),
  `look.shirt` (SHIRTS: none, photo: a tee in the rider's colour with their
  profile photo printed on the chest; drawn as none without a photo).
  `cleanLook` keeps all three; Field Day's profile saves them through the
  same `floatLook`.
- The art draws them per pose (head, eyes and chest anchors); the module's
  `riderSprites`, `RiderSprite` and `riderPortrait` take `hat`, `shades`,
  `shirt`, `photo`; the Locker offers them (Field Day's profile and the
  standalone join), with the photo tee only when there is a photo.

## The screen's right side (Oct 28)

Brandon: "there's weird stuff to the right of the screen on TV mode, what is
the rainbow thing that keeps popping up". The scene accents are gone, and
while the Cup has Field Day's TV canvas nothing of Field Day's draws over it.

## Drinking (Oct 28: open)

Brandon: "I don't really like the random drink in the middle. Is there
anything that could be more dynamic or funny in the room?" Options are with
him; the mid-song drink break stays until he picks.

## Wednesday night target (in cut order: the last line goes first)

1. Song 1 complete: chart, music with clear calls, TV scene, phone, popups,
   calibration, the drink break, scoring, elimination to the next round.
2. The Cup through all four rounds (songs 2 to 4 as tap patterns).
3. Last Call.
4. Hold and release cues.

## Process

Builders commit every 30 minutes with a two-line progress note in the
message, so a dropped session costs a resume, not a rebuild.
