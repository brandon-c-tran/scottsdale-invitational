# Float: the contract

Float is a party game: everyone rides a floatie down a desert river, paddling
with two thumbs on their phone, while one shared screen (a TV or a laptop)
draws the race in 3D. Rounds knock riders out until three race the final.
Every round, every rider finishes a drink before they are out of the water.

It is built to become its own product ("Beerio Kart without a Switch": open a
page on any screen, scan with phones, play, on any Wi-Fi), so it lives in its
own folder and page. Field Day hosts it for the Oct 30 weekend, where it takes
Beerio Kart's slot; later it moves out as a copy, not a rewrite.

This file is the contract between the parts. Change it before you change the
code that depends on it, and keep the ownership map at the bottom honest.

## Why the design is this shape

- **Inputs travel through the cloud.** Rentals and hotels often block phones
  from reaching the screen directly, so every stroke goes phone, server,
  screen: about a fifth of a second. Water is slow and floaty, so that delay
  does not show. Nothing in Float may need frame-perfect input.
- **Two thumbs to paddle.** One hand on a drink means one paddle, and one
  paddle spins you. Drinking costs control, not just time, and the river's
  calm stretches are where everyone drinks.
- **The server owns the race.** One FloatRoom per room runs the simulation;
  screens draw it and phones steer it. A screen reload never loses a race.

## Layout

```
float.html               the page every Float path serves (vite input "float")
float/
  PROTOCOL.md            this file
  shared/                pure: no DOM, no Workers APIs (Worker, browser, node)
    looks.js             critter, hat, shades, pose ids (cosmetic)
    floaties.js          floatie ids, names, stats (gameplay)
    course.js            the river: four legs, data + sampling helpers
    tuning.js            every physics and timing constant
    sim.js               the race: createRace, applyInput, stepRace, rows
    bots.js              computer paddlers
    cup.js               the Cup: phases, rounds, cuts, the drink rule, balloons
    protocol.js          message names, snapshot packing, flags
  worker/
    room.js              the FloatRoom Durable Object (one per room)
  client/
    main.jsx             float.html's entry
    FloatPages.jsx       path -> page
    net.js               the browser's room connection
    screen/              the shared screen (3D)
    controller/          the phone controller
    join/                the standalone join (name, look) for /float/play
    locker/              LockerPicker: the look picker, used by join/ and Field Day
    art/                 critters, floaties, accessories, the rider (three.js)
    sound/               the screen's and phone's sound (Field Day's engine)
```

Field Day touches Float only through: `worker/index.js` (routes), the
`FLOAT` binding in `wrangler.jsonc` (class `FloatRoom`, migration `v2`), the
`/internal/*` calls below, and Field Day's own UI importing `float/client`
components (the Locker, the screen, the controller) inside its app.

## Pages

| Path | Who | What |
|---|---|---|
| `/float` | a TV or laptop | the screen. Without `?room=`, makes a new room and shows its code and QR |
| `/float?room=<id>` | a TV or laptop | the screen for that room |
| `/float/play?room=<id>` | a phone | join (standalone) then the controller |
| `/float/art` | any | the art showcase: every critter, floatie and accessory |

`room`: `[a-z0-9-]{1,32}`. A standalone room code is 4 letters (no vowels,
so no words). Field Day's room is `fd-<eventId>`.

## The Cup

```
lobby -> intro -> [ grid -> countdown -> race -> cut ] x rounds -> podium -> feedback -> lobby
```

- **Legs.** The river is one continuous course in four legs, raced in order,
  each harder than the last:
  1. **Put-in**: wide, gentle, teaches paddling. A calm pool to drink in.
  2. **The Narrows**: canyon walls close in, rocks mid-river, fast water.
  3. **Whirlpool Bend**: a whirlpool on the inside of a bend, then a split
     (fast and rocky left, calm and longer right).
  4. **The Drop**: rapids, the waterfall (hit it straight or flip), then calm
     water to the takeout bar.
  A strong paddler takes 60 to 80 s a leg.
- **Rounds.** One leg per round. The field is cut after each round until three
  race the final. For 13 riders: 13, 9, 6, 3. `cup.js cutSchedule(n)` gives the
  field for every n: monotonic, never below 3, the final always 3 when n >= 3.
  With 1 to 3 riders there are no cuts; they race every leg and the last leg's
  order is the result.
- **Places in a round** go in order of `max(arriveAt, drinkAt)` (the drink
  rule). A round ends as soon as enough riders have finished to fill the next
  round; everyone else is out at once. A cap ends any round 30 s after its
  first finisher; riders still on the water are placed by distance.
- **Final places.** 1st to 3rd from the final. 4th and down in reverse order of
  elimination (the last cut out is 4th), ties broken by that round's distance.
- **Between rounds (`cut`, about 20 s).** The screen shows who is out and the
  next leg. Survivors may swap floaties (15 s window). Every rider gets a fresh
  drink for the next round. The next grid is the last round's order, winner
  on pole.
- **The drink rule.** Each round, each rider finishes a drink before they are
  out of the water. `drink` may be sent any time after that round's gun. A
  rider who arrives without it waits at the takeout and places when they
  drink. Riders with `drinks:false`, and every rider when the room's
  `drinking` is off, drink automatically on arrival.
- **Out.** An eliminated rider finishes their drink on the beach, then gets
  water balloons: one every 12 s, thrown at a racer they pick. It lands 1.2 s
  later at the racer: a spin and a splash, never a flip. A racer is hit at most
  once every 6 s.
- **Podium.** The three finalists in order, each playing their pose. Then
  every phone gets the feedback card.

## Floaties

`shared/floaties.js` is the list: 8 floaties, four stats (Speed, Turn, Weight,
Grip; 1 to 5; 12 points each) and one twist each. `tuning.js` maps stats to
physics. A rider picks one before the Cup and may swap between rounds.

## Looks

`shared/looks.js`: critter (13), hat (8, the crown for the groom only), shades
(5), pose (4). Cosmetic only. `cleanLook` makes any look legal. A rider's look
is `{ critter, floatie, hat, shades, pose }` (the floatie is in the look but
counts as gameplay).

A rider's identity is drawn on the critter, not as it: the chip medallion on
a gold chain (their photo, else their number, on a disc in their color with
their edge skin), their color on the swimsuit and floatie trim, their number on
the floatie's side.

## The room

`GET /float/ws?room=<id>` upgrades to a WebSocket on
`env.FLOAT.idFromName(id)`. The room persists the Cup at every phase change
and the race every second; a restarted room resumes a race from its last save
with a 3 s countdown.

### Clock
Every server message carries `s`, the server's `Date.now()`. Clients keep an
offset from `ping`/`pong` (median of the last 5) and draw at
`serverNow() - INTERP_MS` (`tuning.js`, 100 ms).

### Client to server (JSON text frames)

| Message | From | Meaning |
|---|---|---|
| `{t:"hello", role, device, rider?}` | any | `role`: `"screen"` or `"controller"`. `device`: stable random id (localStorage `float-device`). Controllers send `rider` (below). |
| `{t:"ping", c, rtt?}` | any | every 2 s; `rtt` the last round trip in ms |
| `{t:"look", look}` | controller | change look (lobby, or floatie only during `cut`) |
| `{t:"ready", on}` | controller | in the lobby: ready or not |
| `{t:"stroke", side, p}` | controller | a stroke: `side` `"L"` or `"R"`, power 0..1 |
| `{t:"hands", n}` | controller | thumbs on the paddles now: 0, 1 or 2 |
| `{t:"drink"}` | controller | "Finished my drink" for this round |
| `{t:"balloon", at}` | controller | an eliminated rider throws at entrant index `at` |
| `{t:"feedback", answers}` | controller | the end card (below) |
| `{t:"host", cmd, ...}` | screen | standalone hosting: `cmd` `"start"` (`{bots, drinking}`), `"lobby"`, `"kick"` (`{device}`) |

`rider`: `{ name, color, look, drinks?, pid?, photo?, number?, skin?, groom? }`.
`name` 1 to 16 chars, `color` `#rrggbb`. `pid` is the Field Day player id when
the phone joins from Field Day; the room then matches the phone to that
reserved entrant.

### Server to client

| Message | To | Meaning |
|---|---|---|
| `{t:"welcome", s, you:{device, role, entrant?}}` | the new socket | |
| `{t:"pong", s, c}` | the sender | |
| `{t:"room", s, ...}` | everyone, on every change | the Cup (below) |
| `{t:"snap", s, k}` | screens, 20 Hz in a race | one packed row per racer |
| `{t:"me", s, i, place, of, prog, len, stam, f, cut}` | each controller, 10 Hz in a race | own racer: index, place, field size, metres done, leg length, stamina 0..1, flags, places that go through |
| `{t:"ev", s, e, i, j?, x?, y?}` | everyone | `e`: `"flip"`, `"bump"`, `"arrive"`, `"drink"`, `"out"`, `"balloon"` (`i` threw at `j`), `"splash"` (`j` hit) |
| `{t:"debug", s, rtt}` | screens, every 2 s | `{[device]: ms}` |

`room` carries: `phase`, `mode` (`"party"` or `"fieldday"`), `code`,
`drinking`, `round` (0-based), `rounds`, `leg` (index), `field` (entrant
indexes racing this round), `out` (indexes, in elimination order), `startAt`,
`endsAt`, `entrants` (`[{device, name, color, look, bot, connected, ready,
pid?, photo?, number?, skin?, groom?, drinks}]`), `course` (sent in full on
welcome and when it changes; otherwise `courseId`), `results` (this round:
`[{i, place, time, drinkAt}]`), `standings` (the Cup so far), `podium`.

### The snapshot row
`[i, x, y, a, f, p]`: entrant index, metres (2 decimals), heading radians (3
decimals; 0 is +x, counter-clockwise), flags, progress along the leg in metres
(1 decimal).

| Bit | `FLAG.` | Meaning |
|---|---|---|
| 1 | `SWIM` | flipped: in the water, swimming back |
| 2 | `HANDS_OFF` | fewer than two thumbs down (drinking, as far as we know) |
| 4 | `ARRIVED` | crossed the takeout |
| 8 | `DRANK` | finished this round's drink |
| 16 | `STROKE_L` | a left stroke in the last 250 ms |
| 32 | `STROKE_R` | a right stroke in the last 250 ms |
| 64 | `BUMP` | hit something in the last 250 ms |
| 128 | `SPLASHED` | hit by a balloon in the last 600 ms |

## The course data

```
{
  id: "salt",
  line: [[x, y, w], ...],   // the whole river's centreline every ~4 m, width w
  flow: [[s, v], ...],      // current (m/s) by distance s along the line
  elev: [[s, z], ...],      // water surface height (m); the Drop falls here
  rocks: [[x, y, r], ...],
  islands: [[x, y, r], ...], // optional: land in the river (the split), drawn as banks
  zones: [{ k, s0, s1 }],   // "pool" | "riffle" | "narrows" | "eddy" | "whirlpool" | "split" | "drop" | "bar"
  legs: [{ id, name, s0, s1, grid, finish }]   // grid/finish: distances
}
```
x east, y north, metres, top-down. The 3D screen maps `(x, y, z)` to three.js
`(x, z, -y)`. The screen builds the whole river once.

## Components

Field Day embeds Float inside its own app (TV mode, a phone sheet), so the
screen and the controller are components first and pages second:

- `screen/FloatScreen.jsx`: `<FloatScreen room={id} />` draws a room full
  size in its parent (it opens its own connection). `screen/ScreenApp.jsx` is
  the `/float` page around it (room code, QR, hosting).
- `controller/FloatController.jsx`: `<FloatController room={id} rider={rider} onExit />`
  is the phone's whole game for a room. `controller/ControllerApp.jsx` is the
  `/float/play` page around it (the standalone join first).
- `locker/LockerPicker.jsx`: `<LockerPicker look onChange groom />`.

## The phone held sideways

Paddling is two thumbs on a phone held sideways. Many iPhones have rotation
lock on, so the controller must work either way: in a landscape viewport it
lays out natively; in a portrait viewport it draws itself rotated a quarter
turn (CSS) so it reads correctly when the phone is held sideways, with one
tap to turn it the other way. Never ask the player to unlock rotation.

## The groom

`groom:true` on an entrant unlocks the crown. Field Day sets it for the one
player named in its config (`FLOAT_GROOM` in Field Day's shared code).

## Art

`client/art/index.js` (see the stub): `buildFloatie`, `buildCritter`,
`buildRider(entrant)`, `riderPortrait(entrant, {size})`. three.js objects in
metres, y up, the rider facing -z. A rider: `{ root, critter, floatie,
update(dt), dispose() }`; a critter: `setStroke("L"|"R")`, `setState({ swim,
handsOff, sad, celebrate })`, `setPose(id)`. Style: glossy vinyl toys,
rounded and chunky, big eyes, bright, readable at TV distance.

## Sound

`client/sound/index.js` (see the stub): `useFloatScreenSound(net)`,
`useFloatControllerSound(net, { me })`, `unlockFloatSound()`. Everything goes
through Field Day's engine (`src/lib/sound.js`): `room` bus on the screen,
`you` bus on the phone.

## Net

`client/net.js`: `connectFloat({ room, role, hello })` returns
`{ send(msg), on(type, fn) -> off, close(), serverNow(), rtt(), status(), onStatus(fn) }`.
Reconnects with backoff and re-sends `hello`. `status()`: `"connecting"`,
`"open"`, `"closed"`.

## Field Day

- **Starting.** When Field Day starts the Float event (its Lock and start), the
  Tournament posts the Cup to the room, server to server:
  `POST /internal/cup` on `env.FLOAT.idFromName("fd-<evId>")`, body
  `{ evId, cupId, mode:"fieldday", drinking:true, startAt, bots, entrants:[rider + pid] }`.
  `bots` fills the field with computer riders up to that many entrants (QA's
  Play solo sends 13 with one real entrant; the real event sends 0).
  The room reserves an entrant per player; a phone that says `pid` takes its
  entrant. Anyone not connected when a round starts is paddled by a bot (shown
  as such).
- **Finishing.** The room posts back once, idempotent by `cupId`:
  `POST /internal/float/result` on the Tournament, body
  `{ evId, cupId, order:[pid, ...] (1st to last), rounds:[...], stats:{...} }`.
  `order` carries real players only, in their relative order (a bot ahead of
  them never takes a place in Field Day's result).
  The Tournament posts it as the event's result (1st, 2nd, 3rd), so payouts,
  bets and the win song follow as for any result.
- **Feedback.** `POST /internal/float/feedback` `{ cupId, pid, answers }`.
- `/internal/*` is reachable only from inside the Worker: the public router
  forwards only `/ws`, `/api/*` and `/float/*`.
- The Tournament's state carries `float: { evId, room, cupId }` so TVs and
  phones know which room to open.

## Feedback

After the podium every phone gets three questions: "How fun was that?" (1 to
5), "Would you play this with other friends?" (Yes / No), "What would make it
better?" (optional, 200 chars). Answers are kept by the room and, in Field
Day, sent to the Tournament.

## Stats

The room keeps per round: each rider's time, flips, bumps given and taken,
balloons thrown and landed, drink time (arrive to drink), strokes, swaps, and
round-trip samples per phone. They ride the result to Field Day and stay in
room storage.

## As built: the engine (Oct 25)

What the engine does beyond or differently from the sections above. Where
they disagree, this wins.

- **Phases** in `protocol.js` are the eight above. `room.startAt` is the gun
  in `countdown` and `race` (a resumed countdown's `startAt` is when the race
  goes again). The last `cut` (after the final) lasts 7 s.
- **`room` extras:** `cupId`, `swapUntil`, `resume`, `cut` (the next round's
  field size, null in the last round; `me.cut` is the same), `len` (this
  leg's length), `lastRound` (true in the last round), `final` (the Cup's
  final order, entrant indexes 1st to last, null until the final ends),
  `startPlanned` (a Field Day Cup's start while it waits in the lobby, else
  null), `history`, `botDriven` on each entrant, and `drank` on each out
  entrant (their beach drink, so a phone that reloads on the beach knows).
- **A rider's drinking answer is private.** `entrants[].drinks` goes only in
  the copy of `room` sent to that entrant's own phone, never to screens or
  other phones. A drink that counts on arrival (`drinks:false`, or the room's
  `drinking` off) raises no `drink` event; the DRANK flag lights as for anyone.
- **`me`** also carries `order` (entrant indexes by current place). A rider
  out on the beach gets `me` during a race too: `{ i, out:true, order, of,
  cut, ball, f }`, where `ball` is the server time their next balloon is
  ready (null until their beach drink) and `f` has DRANK once they drank.
- **`hands`** counts from `grid` and `countdown` on (strokes only once the
  race is on), so thumbs are right at the gun.
- **The result posts when the podium ends** (or when a finished Cup is left
  for the lobby early), once, so the Tournament's winner scene never cuts off
  the room's podium.
- **Host `start` `bots`** is how many bots to ADD. `/internal/cup` `bots` is
  the total to FILL TO.
- **Away riders:** a phone silent for 5 s (or closed) is paddled by a bot,
  who also drinks and throws for them; control returns on its next message.
  `botDriven` marks it.
- **`TIMING.HARD_CAP_MS` (180 s)** ends any round, so a phone that never taps
  "Finished my drink" cannot hold the room.
- **`snap.s`** is the tick's time (exact interpolation), not the send time.
- **`ev` extras:** `flip` has `why` (`"drop"` or `"riffle"`); `bump` has no
  `j` when the hit was a rock or bank; a missed balloon splashes with no `j`;
  a beach `drink` is sent too.
- **`replay`** (screens only): `{t:"replay", s, leg, at, i, k:[[s, rows], ...]}`,
  10 s around the first flip at The Drop's lip (else the first rider over),
  sent when that race ends and to screens joining during the `cut`.
- **Course:** zones carry extra fields (riffle `power`; eddy `side`, `back`;
  whirlpool `x`, `y`, `r`, `core`, `spin`, `rot`, `pull`, `still`; split
  `fast`, `calm`; bar `side`). `course.js` exports helpers for screens:
  `frameAt`, `nearestS`, `flowAt`, `isInside`, `islandSpan`, `gridSlots`,
  `beachSlot`, `barOf`, `legAt`, `legLength`, `elevAt`, `flowSpeed`, `zonesAt`,
  and `COURSE` itself.
- **Entrant indexes** are frozen from `intro` to the end of a Cup, but can
  shift in the lobby (a kick, bots leaving). Phones find themselves by
  `device` in `room.entrants`; `welcome.you.entrant` is only the index at hello.
- **Joining mid-Cup** watches and joins the next lobby. A `pid` claim moves the
  entrant to the newest device. Host commands are refused while a Field Day
  Cup is reserved or running; after it, a party rerun in the `fd-` room is
  allowed and its result is not posted.
- **Feedback** answers: up to 8 flat keys; the controller sends
  `{ fun:1..5, again:true|false, better:"..." }`.
- **`/internal/cup` reply:** `{ ok, cupId, room, startAt, entrants }`, or
  `{ ok, cupId, room, phase, already:true }` for a repeat.
- **Result body:** `{ evId, cupId, order, rounds:[{ round, leg, field, out,
  results:[{ who, pid, bot, place, time, drinkAt, arriveAt }] }],
  stats:{ rounds:[{ round, leg, riders, balloons, rtt }], botShare } }`.
  Each rider's round stats carry `botShare` (0 to 1: how much of that race a
  bot paddled for them), and `stats.botShare` is the same over the Cup, by
  player; data only.
- **Tuning** exports `INTERP_MS` (100) and `BAR_MS` (2000). `protocol.js`
  exports `PALETTE` (bot colours) and the room-code letters `CODE_LETTERS`,
  `CODE_LENGTH`, `STANDALONE_CODE` (re-exported by `cup.js` and the join).

## As built: the art (Oct 25)

- **The screen must set** `scene.environment = floatEnvironment(renderer, "night")`
  (and may add `floatLights("night")`): the vinyl's clear coat needs
  something to reflect, or it reads as clay.
- `buildRider(entrant, { detail:"race" | "hero" })`: race detail for the pack
  (~8k triangles dressed, ~10 draw calls), hero for close-ups, the podium and
  portraits. `rider.setState/setStroke/setPose` forward to the critter; the
  floatie follows by itself (tilts with strokes, capsizes while its rider
  swims, dips when a backflip lands). `rider.ready` resolves when the chip's
  photo is drawn.
- **Sizes:** a floatie's origin is the water line under its centre; ring
  floaties are about 1.45 m across; a seated rider stands about 1 m above the
  water.
- **Extras:** floatie `seatInfo`, `setState({ flipped })`, `kick({ lean, dip })`;
  critter `setSeat`, `anchors { head, chest, handL, handR }`, `onCatch(side)`
  (a hand entering the water, for splashes), `ready`; exports `buildMedallion`,
  `artStats`, `setFloatArtQuality("low" | "high")` (low turns off the clear
  coat everywhere, for slow GPUs), `disposeFloatArt`, `disposePortraits`.
- `riderPortrait` shares one offscreen renderer, caches by look, colour, skin,
  number and photo, falls back to a flat disc without WebGL, and returns null
  in node.

## Ownership (who edits what)

| Part | Owns |
|---|---|
| Engine | `float/shared/*` (except looks.js, floaties.js ids/stats), `float/worker/*`, `tests/float-engine*.test.mjs`, `scripts/float-*.mjs` |
| Screen | `float/client/screen/*` |
| Controller | `float/client/controller/*`, `float/client/net.js`, `float/client/join/*`, `float/client/locker/*` |
| Art | `float/client/art/*` |
| Sound | `float/client/sound/*`, and one delimited block appended at the very end of `src/lib/soundKit.js` (Float's recipes) |
| Field Day | everything under `src/`, `shared/`, `worker/` except `worker/index.js`'s Float routes; in `src/lib/soundKit.js` only the one `INTRO_FOLEY` entry for the new event |

`float/client/main.jsx`, `FloatPages.jsx`, `float.html`, `looks.js`,
`floaties.js` and this file change only by agreement.
