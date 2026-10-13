# Field Day (Scottsdale · 2026)

Companion app for a 13-player bachelor party game weekend (Oct 30 to Nov 1, 2026).
One leaderboard, live wagers, GM-run draws/brackets/heats, TV mode. Built to be
glanced at for ten seconds, not stared at. "Field Day" is the enduring event
identity; "Scottsdale · 2026" is this edition (future: Tahoe · 2027, etc). The
weekend's dates live once in `EDITION` in core, never spelled out in a view.

## Architecture

- **Cloudflare Worker + one Durable Object** (`worker/tournament.js`). The DO named
  `main` is the single authority. Clients connect over WebSocket (`/ws`), send
  actions, and render whatever state the server broadcasts. Clients NEVER write
  state directly. This is the whole reliability story: one single-threaded writer,
  strict action ordering, no last-write-wins.
- **`shared/core.js`** is the single source of truth for game logic (settlement,
  standings, draws, brackets, stages, and event lifecycle). Imported by BOTH the DO and the React app.
  Never fork this logic. If client and server disagree, the server is right.
- **`worker/actions.js`**: every mutation, validated server-side (GM auth, wager
  caps/balance, stale draw/stage references). Add new mutations here, never as
  client-side state writes.
- **`src/App.jsx`**: application composition and the remaining feature UI during
  the systems refactor. `src/ui/` owns the shared theme, controls, shell, and
  static stylesheet. `src/lib/client.js` is the transport: reconnecting WS,
  promise-based `dispatch`, device identity.
- **`src/features/identity/`** owns the explicit profile provider and reusable
  avatar/chip renderers. Every phone, TV, or preview tree must render inside
  `PlayerIdentityProvider`; there is no mutable global profile registry.
- **Guest modules:** `features/check-in/` owns the lazy-loaded invitation,
  install gate, drafts, and acknowledged progression; `features/profile/` owns
  the editor, live player card, and profile/photo save orchestration;
  `features/travel/` owns shared trip presentation and entry. Feature modules
  must not import from App. Shared semantic tokens are in
  `src/ui/experience.css`; all guest pages use the one dark palette, whose
  surfaces follow the weekend's session (TH1 below). `.fd-night` keeps TV and
  live surfaces on that same palette. `features/home/`,
  `features/weekend/`, `features/standings/`, and `features/wagers/` own the
  returning home, events/weekend reference, live board, and wagering UI.
  `features/draft/` owns captain setup, the live snake draft, and its Home entry;
  `shared/core.js` supplies its turn and mutation references through `draftTurn`.
  `features/duels/` owns Quick Draw, the duel card, the commissioner duel
  list, and viewer-relative duel state. `features/tv/` owns TV mode
  (`TVMode.jsx`, pure `tvModel.js`, `serverClock.js`, its own intro and draw
  reveal in `TVCeremony.jsx`, cards in `TVCards.jsx`), drawn on a fixed
  1920x1080 letterboxed canvas with 24px minimum text; it reloads for a new
  build only in an idle gap. TV standings are `ChipTowers.jsx`, a cel-shaded 3D
  table of each player's chip (one per 100); `three` is imported only there and
  only through `TowersBoard.jsx`'s dynamic import, so phones never download it,
  and no WebGL, a failed load, a lost context or a slow TV falls back to the flat
  board for the session. `DesertBand` is the paper-cut backdrop by session phase
  (`--desert-*` tokens mixed from existing ones) with a star per winner from
  Saturday night; `weekend/Trophy.jsx` is the weekend's cup (Oct 4: a dimensional SVG,
  polished gold bowl with the champion engraved on a silver plate, on a
  stepped black base with one tier per session and one silver plaque per
  event, its game mark engraved, the winner added as it posts). The TV
  crown lights each tower on its own CROWN_TIMING beat (13th up to 2nd),
  unlit until then, so the countdown reveals instead of repeating.
  `features/director/` owns the commissioner pill
  model and the finale sheets. The player card tilts (`useRisoTilt`, never an
  iOS motion prompt), the identity chip is a spinnable `ChipCoin`, and
  `src/lib/haptics.js` vibrates on Android only (never on the TV, with reduced
  motion, or when the device-local Haptics toggle is off) and ticks on iPhone
  through `tapTick()`.
  `ui/AppChrome.jsx` owns the persistent header/navigation; `ui/GameMark.jsx`
  owns the shared game illustrations. `src/lib/client.js` treats the socket as
  live only after a fresh state lands on it, replaces a socket whose ping goes
  unanswered or that stays silent after the app returns to the foreground,
  and reports a timed-out write as uncertain until the next state settles it.
  Every frame carries a build id: the TV reloads between ceremonies and phones
  offer Update ready. App loads TV mode and the commissioner-only modules
  (QA, Where and When and Awards desks, finale sheets) on first use through
  `src/lib/lazyPart.js`, so phones never download them. The TV holds a
  Screen Wake Lock (`src/lib/wakeLock.js`, shared with Table view), keeps a
  device-local "Sound early by" (0 to 400 ms, `si-tv-early`, beside Exit TV)
  that schedules the room bus sooner for a TV or soundbar that delays audio,
  and reports its sound ("on" or "blocked") on hello, ping and presence;
  only commissioner frames carry the `tvs` presence summary (never state or
  snapshots) and the director column shows "TV sound off" or "No TV
  connected" (`features/director/tvHealth.js`). Player chip ink is computed:
  whichever of --ink0 and --bone contrasts more (`identity/chipInk.js`).
- **Game intros** (Oct 3, `src/features/intro/`): every announcement plays
  the game's own intro on every phone (the head of the live
  `EventAnnouncement` sheet) and the TV (`IntroOverlay`), one composition at
  two scales: the glass dark, the backlight catching, the session's
  painting (`GlassArt depth`) and the game's set pushing in on plates, the
  game's one move landing on `INTRO_TIMING.hit` where its name stamps in the
  Inline cut, light across the glass, the session lamp's chase, the podium
  on the TV floor. `introTiming.js` is the one clock: `INTRO_MS` (4200) is
  `DRAW_INTRO_MS` and `TV_INTRO_OVERLAY_MS`, every screen plays from
  `eventOps.announcedAt` (late screens join mid-scene), and with a draw
  behind it the set dims and the TV docks the name where the draw letters
  it. One scene per slate game in `IntroScenes.jsx` `SCENES` (keyed by
  `introScene(ev)`, basketball by variant); anything else drops its GameMark
  (then the FD chip). S2 is the game's own sound on the same beats
  (`INTRO_FOLEY`, the chord alone under reduced motion), on the room bus on
  the TV and the owner's bus on a phone that follows live. Reduced motion
  shows the last frame (`is-still`, `--fa`). `/dev/intro-preview.html`
  rehearses every game on a phone and the TV side by side.
- **Pocket alerts (Web Push, A10):** `worker/pushAlerts.js` picks, from the
  board before and after each persisted write, "You're playing" (your
  contest became current; not a wide free-for-all), "Your pick" and
  "{Name} challenged you", only for the player concerned and never the
  actor, deduped per player+reason+contest, skipped while that player's
  socket says the app is on screen (hello/ping/presence carry `visible`).
  `worker/push.js` sends them after the broadcast (RFC 8291 aes128gcm +
  RFC 8292 VAPID on WebCrypto), never blocking or failing a write, and drops
  subscriptions the push service calls gone. `public/sw.js` has only push and
  notificationclick handlers: no fetch handler, no cache. The ask is its own
  control (`features/alerts/`: the Alerts row beside Haptics and one
  dismissible Home card for an installed app that never answered), never
  part of check-in. Off unless `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
  secrets and the `VAPID_SUBJECT` var are set (`capabilities.push`).
- **Your path (D10):** "To the TV" (D9, the commissioner's call to every
  phone) was removed Sept 29 as noise; a stored `showControl.call` is inert.
  A synced draw reveal that turned your card ends on your path
  (`weekend/drawPath.js`, `DrawPath.jsx`) in a sticky footer above Place chips:
  bracket stops to the final with opponents' photo chips, or your heat/pool
  and the final; spectators, crew and replays see nothing new.
- **Commissioner menu (Oct 3):** `director/menuModel.js` sections in the
  order a hand reaches: Now (crown, lock bets, take back, locker room,
  unfreeze; only what applies), The show (TV: `director/TvSheet.jsx`
  on the pure `tvSheetModel.js`, what is on the TV now with its steps as
  lamps, the TVs and their sound, scenes as tiles, the kiosk shortcut;
  Speaker: `features/speaker/`, always its own row when the audio
  capability is on, valued with the chosen speaker; Settings (Oct 13,
  `settingsMenu`): every switch in one sheet, each the same write as its
  own home: Autopilot, Gags, Play win songs automatically, Check-in,
  Jerseys ordered, QA strip), Games (Where and When, Karaoke with the karaoke
  capability in the slate's order, Trivia, Awards; a desk is one entry in `GAME_DESKS`),
  People, Setup (devices, export, QA opens the console, Reset game
  progress, its one entry), Exit alone. The QA console runs Watch it play
  (Sim players), Step, Jump to (one event picker with Open / Mid / Done,
  one milestone picker with Go), Bets and duels, Test a moment (moment,
  bit or Random, Play), Checkpoints (with the strip's switch), Lens,
  Reset. **Ready check**
  (Oct 8, pure `director/readyCheck.js`, lazy `ReadyCheck.jsx`) is the one
  sheet of what the weekend still needs, read only from the commissioner's
  frame (guests' answers counted over `rosterOf`, Trivia, Where and When,
  Awards, the TVs, speaker, alerts, autopilot; a fact the frame lacks drops
  its row), each row a lamp (cyan ready, amber part done, unlit not
  started, struck off) that opens its desk; it sits in Now until the
  weekend is live, then first in Setup, valued "N to do" or "Ready".
- **Motion foundation** (`src/lib/motion.js`, tokens in `src/ui/motion.css`):
  every animated surface uses it. `MOTION`/`EASE` are the named timings
  (count 750, delta 1100, row 560, stamp 320, flight 340, settle hold 2400,
  beat 2000) mirrored as `--motion-*`/`--ease-*`. Only fresh changes animate:
  the transport classifies each frame in `src/lib/frameGate.js` (broadcast on a
  settled socket, not the first state after a connect, not the catch-up after
  returning to the foreground, not hidden, not a correction or rewind) and
  `useFreshChange(value, key)` returns `{ fresh, animate, changeId, from, to }`;
  `useCountUp(value, { key, step })` steps a number in PT (or 25s) and returns
  a `delta` for the `.fd-motion-delta` float. `useReducedMotion()` gates JS
  motion; reduced motion shows end states. `fly(from, to, opts)` flies a clone
  (or a React element) through the one fixed layer to an element, rect, or
  named target and always resolves (false when skipped); register targets
  with `useFlightTarget(name)` (`tab:home`, `tab:events`, `tab:bets`,
  `tab:weekend`, `header:profile` exist). `MotionRoot` is mounted once in
  App. **Heartbeat:** `.fd-beat`, `.fd-beat-dot`, `.fd-beat-fill` share one
  2s beat phased to the server clock (`src/lib/serverClock.js`, fed by the
  `serverNow` stamp on every state frame and pong; the TV imports the same
  clock); `<html data-fd-link>` stops and hollows dots when the socket is
  down and pops them once on return. Sheets rise over a fading scrim and a
  non-interactive copy falls after unmount (`src/ui/sheetMotion.js`).
  `src/lib/haptics.js` `tapTick()` is the iOS 18 switch tick: call it
  synchronously in the user's own tap (chip place/retract, rack, draft pick,
  duel send/accept, winner tap), never for remote events or Quick Draw's
  reaction; the device Haptics toggle is its only gate.
  `/dev/motion-preview.html` rehearses all of it without a socket.
- **Sound** (Sept 29, `src/lib/sound.js`, kit in `src/lib/soundKit.js`):
  26 synthesized sounds (no files) in one key, one lazy AudioContext, and
  `playSound(id, { bus, at, pan, key })` is the only way anything sounds; no
  other module touches Web Audio (`tests/sound-engine.test.mjs` scans).
  Buses: `room` plays only on the TV, `you` (the owner's own taps and
  moments) and `gm` (the director pill's acknowledgement, S25/S26) only on a
  phone. Sound rides motion: only a fresh frame sounds a remote moment
  (`freshFrameNow`), server-anchored cues (`cueAt`) land on `serverNow()`
  minus `outputLatency` and drop when 300 ms late, so a load, reload,
  reconnect, catch-up or correction is silent; reduced motion plays a
  sequence's one summary sound. Hush: ducked to 25% while
  `state.showControl.audio.walkout` is set and `serverNow() < until` (the
  Worker writes it; the client only reads it), and silent from Quick Draw's
  armed until the reaction is captured. Phones use a "playback" audio
  session that plays through the silent switch (the Sound switch is the
  off switch) and unlock inside taps; losses never sound on a phone and no counter ticks. The
  TV's beats are one hook (`features/tv/roomSound.js`), the phone's remote
  moments another (`features/home/phoneSound.js`); the room reverb follows
  `weekendPhase`. The profile's Sound switch (`si-sound`) sits under Haptics;
  a TV whose context is suspended shows "Click for sound", and the
  commissioner's TV sheet copies the Chrome kiosk shortcut that keeps TV
  sound across reloads. `/dev/sound-preview.html?selftest` renders every recipe.
- **Results on your phone** (`src/features/results/`): a fresh broadcast that
  moves YOUR chips docks one receipt above the tab bar (`ChipReceipt`, from
  the pure `resultMoment` diff of `chipSnapshot`s: place and award, each bet
  settling, duels, rulings, won chips flying into a counting total; swipe or
  tap away, it leaves on its own, later moments merge in). It replaced the
  result toast. A correction or returned bet is one quiet toast line
  ("Result corrected: −400"); a catch-up says nothing (the since line owns
  absences). Only your own win (event, match, bet) showers YOUR identity
  chips (`ChipShower`); phones never play confetti, the TV keeps its burst
  for results (its crown is the M18 scene, not confetti).
  The crown (`useCrownMoment`, `crownKey`) plays once per phone: the champion
  moment (D1: every phone floods with the champion's color on the TV's own
  `CROWN_TIMING` beat, anchored by `crownAnchor` in `results/crownTiming.js`;
  a tie floods nobody, a phone reached after the flood opens its card), then this
  phone's last card (`lastCardModel`, `chipHistory` replays the weekend and
  always ends on the board's number); a phone that missed it opens straight
  to the card, and Home's "Your last card" reopens it. Save card draws a
  1080x1350 PNG (`cardImage.js`) and hands it to `navigator.share`, else
  shows it to press and hold. `/dev/results-preview.html` rehearses all of it.
- **The living board** (Sept 28, all on the motion foundation): Home is the
  Table (one compact contest card, then 13 ~47px rows each with a flat bar of
  that player's chips in their color, your pending bets as gold outlined
  units; `features/standings/boardModel.js`); a fresh standings change counts
  in 100s, slides rows, rolls ranks and warms a new leader. "You're playing"
  stamps when your match becomes current. `contestWinLines`
  (`features/standings/winImpact.js`) is the one pure "Win: Sahil to 1st" line
  per side on Bets and the TV (only a win that posts a result has one); Home
  says yours once, "Win and you're 2nd", with your win song as a chip of its
  title beside it (`WinLine`). **One Now card** (Oct 12): Home's contest card
  is the only game surface on Home. Whatever else is happening for you is a
  row of it (`ui/NowRow.jsx`): an in-app game in progress (`GeoHome` /
  `TriviaHome` and `KaraokeHome` with `inCard`, App's `gameContent`), a
  draft waiting on someone else (`DraftNowRow`), another event's team name
  (`TeamNameNow`) and another event's open market. The card's own team keeps
  its pencil on its name (`useTeamNameNow`). Team names open once by
  themselves after the draw, and only after no sheet, game screen or takeover
  has held the screen for 2 s. Under the card: duels, the awards ballot,
  Alerts and Install (each only while it asks), the leaderboard, Latest
  result, Coming up.
  Bets: a placed chip flies from the rack and hovers until the ack
  (`fly(..., { hold })`), a failure flies it home; a fresh decision holds the
  decided board `MOTION.settleHold` (WON stamp, losing stacks to the bank,
  your winnings into the Home tab), a tap skips, then the next contest deals
  in. `FitStacks` keeps any number of bettors off a side's total on the TV.
  Draft picks fly into their seat (phone FlightLayer, TV in-canvas);
  `features/tv/TVDraft.jsx` fills the TV with seat silhouettes and a chip wall.
  The towers sound as they move (`towerSounds`): a clack per chip as it
  lands on its tower, panned, through the room chip density rule, "to the
  bank" as lost chips lift, the step as towers re-sort; the ambient board
  only on a fresh frame, the result scene on its own step.
  Poker stacks build chip by chip on a fresh deal, blinds roll, a bust tips
  flat (`features/tv/TVPoker.jsx`, `src/lib/motionKit.js`). TV bracket advance
  and the crown live in `features/tv/tvMotion.js`, `TVBracket.jsx`,
  `TVChampion.jsx`, anchored on server times. The order in the room is
  face-off, then bets, then lock: when a two-sided contest freshly opens for
  betting, every TV plays a face-off (D2, `tv/faceOff.js`: photo chips,
  head-to-head only when they have met, X8 lines) on the server clock after
  the draw reveal or the previous contest's decided moment, then settles
  into the betting board. Nothing plays at lock but its sound. The
  champion scene's optional second step, and the frozen TV's ambient turn,
  is the class photo (D3, `results/classPhoto.js`); the commissioner's "Save
  poster" draws the same composition (`results/posterImage.js`). The player card back is the
  season sheet and head-to-head (`features/profile/seasonStats.js`, pure,
  derived; Rematch only opens the duel send flow).
- **The weekend, kept (D7) and Table view (D8):** once the board is frozen,
  Weekend's first section is the edition (`EDITION.label`, `results/Keepsake.jsx`
  on the pure `results/keepsake.js`): the champion, all 13 last cards (tap
  opens one to save), the lead's path (`leadPath` replays every
  `chipHistory` on one timeline), one plate per event with its final order
  and its bracket, D6's awards when revealed ones exist in state
  (`keptAwards`), and a `photos` slot. Derived from the frozen state, no
  clock or live contest, so it outlives the weekend. The commissioner's
  "Save all cards" shares 13 PNGs in one sheet, else one per tap, else
  press and hold. During live poker a seated player still in gets "Table
  view" on the table card (`poker/TableView.jsx`, pure `poker/tableView.js`):
  level and blinds as large as the width allows, the clock, the dealt
  stack; ticks land on the server second so the level turns (M17 roll) on
  the stored boundary with the TV; Screen Wake Lock where the browser has
  it, re-asked on return, released on Exit or when the table ends.
- **Awards night (D6, Sept 29):** the reusable prompt/response feature from
  `docs/REFOUNDATION.md`, used for Saturday-night superlatives. HONORS ONLY:
  nothing in `shared/prompts.js` (model, projection) or `worker/prompts.js`
  (reducers `promptSave`, `promptPublish`, `promptClose`, `promptReopen`,
  `promptRespond`, `promptReveal`, `promptRevealEnd`, `promptDiscard`) reads
  or writes chips, wagers, markets, results or standings, and they run on a
  frozen board or a dealt table. `state.prompts = { ballots, responses }` is
  guest input (a progress reset and QA keep it; snapshots carry it). Frames
  carry `projectPrompts` only: drafts are the GM's, answers never leave, a
  player gets their own back, everyone gets the turnout ("N of 13 voted"),
  and an award's totals appear only once the TV reveals it; the first
  revealed award deletes every per-voter answer. HTTP: GM token under
  `/api/admin/prompts`, device claim under `/api/prompts`, the same reducers
  as the socket actions. Guests vote from one Home row that opens in place
  (`features/awards/AwardsHome.jsx`, photo chips, never yourself unless the
  award allows it); the commissioner writes, publishes, closes and reveals
  from Commissioner > Awards (`AwardsDesk.jsx`) or the director pill
  ("Reveal awards", "Next award", Skip), which offers the reveal only while
  nothing is being played or bet on. The TV (`TVAwards.jsx`, `awardsModel.js`)
  lays anonymous sun chips on the nominees round by round, then stamps the
  winner (a tie stamps each), on the server clock from `reveal.at` with S10
  and S14 through `roomSound.js`; phones hold that winner until the stamp.

- **Team MVP** was cut on Oct 4 at Brandon's call (the song came too late
  to feel natural). A stored `state.mvp` is ignored: it pays nothing, never
  leaves the Worker (`SERVER_ONLY_STATE_KEYS`), and a stored "Most MVPs"
  award (`source`) takes no votes and counts nothing.
- **Comebacks (v3.1, Oct 3)**: two rules in `shared/core.js`, each fixed
  at a named moment so a correction moves it with the record and later
  standings never do. **Leader bounty** was cut on Oct 4 at Brandon's call
  (hard to understand); a stored `eventOps[ev].bounties` is ignored and
  never sent. **Underdog odds** (`UNDERDOG_GAP` 1,000, `UNDERDOG_MULT` 2):
  `oddsFor` takes a two-sided contest's gap as |average chips per player
  of side A - side B| x the smaller side's size (a 1v1 needs a 1,000-chip
  gap, a pair 1,000 combined, the 7 v 6 compares at six players) when its
  market first opens (`openContest`), stored in
  `eventOps[ev].odds[contestId]` (`underdog` side key or null) and kept if
  that contest opens again (a correction's replay); every new ticket stores
  `mult` = `contestMult(contest, side)`, and `wagerMult` reads any ticket's
  `mult` (legacy outright 2, other legacy 1), so settlement stays derived.
  `resolveCurrentContest` attaches `odds` (only with an underdog).
  **Byes to the bottom**: `seedBracket(state, draw)` (every
  draw and finalized draft) gives `bracketByeSlots` (slots whose first
  match is after round one, so 5's three and 6's two) to the lowest teams
  by average chips, lowest into the earliest slot, ties by a hash of the
  drawn teams, the rest in draw order; a level board keeps the draw order.
  The bracket stores `seeds[slot]` and `byes`. Surfaces (`features/comebacks/`:
  `contestTerms`, `SideTerms`): each side's "Winner pays 2:1"/"1:1" when a
  contest carries odds (bets board, Home matchup, TV board, face-off); the
  pill's lock beat names the underdog; a bye enters its bracket advanced
  with an info lamp. Weekend > Rules draws them as the "Comebacks" set
  (words await Brandon's review).
- **Before the draw (v3.1)**: the director pill never runs a draw of
  people directly. A team draw, heats or a captains draft (and the Random
  draw / Captains draft alternatives) open `features/director/CrewCheck.jsx`
  (`run.open:"crewCheck"`, `run.then` the beat's own write or the draft
  sheet): every player as a photo chip, the suggested crew lit (cyan, the
  role tag under it cycles), a Crew/Away brush (Away writes `setAway` at
  once and the suggestion follows the room until the crew is touched), the
  shape, one confirm. `crewCheckRun` puts the confirmed players and crew on
  `announceAndDraw` (or the draft's pool). The server contract is unchanged;
  "Change crew" is gone. A draw that already exists (pools of drawn teams)
  stays one tap.
  **Sit out** (Oct 4, Brandon): a third brush takes players out of this
  event's pool only (tired, resting): `sitOut` rides on `announceAndDraw`,
  `runDraw`, `runStages` (cfg) and `startDraft`, checked by core
  `eventPool` (at least `MIN_PLAYING` 10 play; a room of 10 sits nobody
  out). The shape fits whoever is left (`teamFit` on the pool), crew is
  still the overflow it cannot seat and still earns the 3rd-place award; a
  sit-out earns nothing (Brandon chose this, so sitting out a 1,600 game is
  never a free 400). The draw, stage or draft records them as `out`.
  Crew is the commissioner's call too: the shape fits whoever is playing
  (`validateEventParticipants` fits `teamFit` to the players, down to the
  shape ten make), and the crew check adds the odd one out to the crew by
  rotation (`auto`), never someone set back to Playing while anyone else
  can go. 5v5 takes refs and sit-outs (at least 10 play).
- **Where and When** (Oct 1, `shared/geo.js`, `worker/geo.js`,
  `src/features/geo/`, `features/tv/TVGeo.jsx`): Brandon's photos, played
  live. He authors up to 25 rounds in Commissioner > Where and When
  (`GeoDesk`): a photo (resized on the phone, uploaded to `POST
  /api/geo/photo`, EXIF stripped on the server, stored as
  `moment:geo:<id>` so snapshots, restores and resets skip it like the
  photo desk), an answer pin (map tap or an OpenStreetMap place search),
  the place's name, the date and hour (`"YYYY-MM-DDTHH"`, the photo's own
  wall clock, so no time zone enters), an optional caption.
  `state.geoRounds` is configuration (kept by a progress reset);
  `state.geo` is the game (cleared). Once the event is locked and started
  the director pill runs it (`geoBeat`): Start game (the author, whoever
  starts it, does not play), Reveal, Next photo, Post result. Each photo
  is 60 s on the phones' full-screen game (`GeoPlaySheet`, opens itself
  once per photo and per reveal, Home's row reopens it): Photo (tap to
  fill), Where (a full-bleed map: tap to drop the pin, drag to move it,
  or search a place, `PlaceSearch.jsx` over Photon, free, which flies
  there and drops the pin), When (four ticker wheels, `Wheel.jsx` /
  `WhenPicker.jsx`, shared with the desk: month, day, year, hour; each
  owns its touches so it moves only up and down, follows the finger with
  momentum, clicks the `detent` sound part per value and vibrates on
  Android; iPhone's haptic tick fires only on touch and release, a web
  limit), then Lock in. The draft saves itself (`geoGuess` partial: a pin
  alone or a date alone counts for that part; a part never touched is not
  sent) 450 ms after each change and once more in the last 1.5 s, so
  running out of time keeps whatever was set; Lock in adds `done`, which
  stays, and is what the TV's chips and the pill count ("N locked in · M
  still guessing"). The clock is a draining bar under the header and a
  ring; the last 10 s turn both red, warm the header and put the seconds
  on the button; the last 5 count down across the screen; at zero the
  phone says Time's up while the server's 3 s grace takes the last save. The reveal runs
  on the map: the guesses drop, lines draw to the answer, the answer
  lands, the camera opens, and the phone's scores count up. Scoring is GeoGuessr's shape in
  miles: 5,000 × e^(−mi/155) for where, 5,000 × e^(−hours/2,880) for when.
  Post result (`geoFinish`) runs beginResultEntry and saveResult with the
  final order (a single 1st; ties break on where points, then the faster
  guesses), so payouts, bets and the win song follow as for any result.
  Frames carry `projectGeo`: the commissioner everything; anyone else only
  the photos shown so far, an answer once revealed, their own guesses, who
  has locked in, and everyone's guesses on revealed rounds; a photo is
  served to anyone only once its round is shown. The map is MapLibre GL
  over OpenFreeMap's free "Liberty" vector style (no key: OpenStreetMap's
  landmarks, parks, water, roads and street names with icons, the closest
  free match to Google Maps, whose data needs a paid key; its own chunk,
  preloaded once a game runs); a device without WebGL falls back to
  Leaflet over OpenStreetMap raster tiles.
  CARTO's free basemaps now need an API key, so they are not used.
- **Trivia** (Oct 3, individual since Oct 4; `shared/trivia.js`, `worker/trivia.js`,
  `worker/triviaBank.js`, `src/features/trivia/`, `features/tv/TVTrivia.jsx`):
  a solo free-for-all (`kind:"solo"`, no draw, no draft; Brandon
  chose individual play for the phone format). `state.trivia.players` is
  `presentPlayers` at the start (a present roster player not in it joins on
  their first pick); each player answers alone, may change the pick until
  they lock it, and a lock stays.
  Four formats: multiple choice, closest number (a digit wheel a digit,
  `Wheel.jsx` from Where and When, at least four wheels so the size never
  gives the answer away), name that tune (the TV plays the first 10 s of the
  song's 30-second Deezer clip from the question's `startsAt` on the server
  clock through `previewAudioElement()`, `trivia/tuneClip.js`; phones stay
  silent) and picture (the photo on the TV and the phone).
  `state.triviaRounds` is the set list (configuration, kept by a progress
  reset): `{ source:"bank", category, picks }` or `{ source:"custom", name,
  questions }`. The BANK lives only in the Worker (`worker/triviaBank.js`,
  11 categories: eight of fact questions and three name-that-tune rounds;
  `tests/trivia.test.mjs` scans that nothing under `src/` or `shared/`
  imports it or contains a bank question) and reaches the desk over `GET
  /api/trivia/bank` with the commissioner token. `triviaStart` (run by Lock
  and start in the same write, see Autopilot) copies the set list's
  questions (answers included, bank options dealt in a fresh order) into
  `state.trivia` (progress, cleared by a reset), so editing the set list
  never changes a running game; the desk is locked while one runs, Restart
  (confirm) clears the answers. The first question opens with a 5 s lead
  (`TRIVIA_FIRST_LEAD_MS`), later ones 2.5 s, then 20 s (30 s for closest
  number) on the clock, plus a 3 s server grace for the last save. Scoring is
  in trivia points, not chips: right = 500 + up to 500 for speed (linear on
  the time left when the player locked, to the nearest 10; an answer never
  locked counts at the deadline with no bonus); closest number = 1,000
  nearest, 500 next nearest (ties share the place), exact +250. Players rank
  by total, a tie by the faster sum of scoring lock times. The pill
  (`triviaBeat`, each beat a skip-ahead of the autopilot): Reveal (note "N
  of M locked in"), Next question, Scores at each round's end, Next round,
  Final scores, Post result (`triviaFinish` runs beginResultEntry +
  saveResult with a single 1st, then the next two ranks), so payouts, bets
  (the wide 2:1 market) and the win song follow as for any result.
  `triviaPick` retries are kept per player and question (`ops`, never
  projected). Frames carry `projectTrivia`: the commissioner everything
  unless he is a player in the running game, when he plays it blind like
  anyone; everyone else gets the questions shown so far (never a tune's
  recording), an answer once revealed, their own live pick, every other
  player's locked/set only, and every pick once revealed. HTTP: `POST
  /api/trivia/photo` (EXIF stripped, `moment:trivia:<id>`, outside state like
  the geo photos), `GET /api/trivia/photo/<id>` (anyone once shown), `GET
  /api/trivia/clip/<qid>` (anyone once shown) and `?title&artist&isrc` (the
  desk's "Clip / No clip"). The phone (`TriviaPlay.jsx`) opens itself for
  every player once per question, reveal and scores; spectators (away, a
  commissioner not playing) open it from Home's row. The reveal is one
  scroll: your points and place first (the speed bonus its own amber fill),
  the right answer stamped green, a count and faces on every answer, then the
  top of the board with your row. The TV holds the room from the first
  question to the result: the question lit magenta while live, the clock
  ring and the room's photo chips lighting as each player locks (never
  what), the reveal with counts and faces, the scores between rounds, a
  final podium the result scene takes over from. Room sounds
  (`roomSound.js`): the sting as a question goes up, a slap per lock panned
  by the player, ticks over the last five seconds and a knock at zero
  (`useTriviaClock`), the stamp and riffle on the reveal. QA jumps play a
  configured game for real (`playTrivia` in `worker/qa.js`);
  `triviaSimAnswers` (QA capability) answers for every unlocked player.
  `/dev/trivia-preview.html` rehearses every moment on a player's phone, a
  spectator's, the TV and the desk (`&desk=bank|round|choice|tune`).
- **Trivia board** (Oct 8, `shared/triviaBoard.js`, `worker/triviaBoard.js`;
  the contract is `docs/TRIVIA-BOARD.md`): the second Trivia format,
  Jeopardy's shape, the TV the board and every phone a buzzer.
  `state.triviaFormat` ("rounds" by default, or "board"; configuration,
  public, kept by a reset) is set on the desk (`triviaSetFormat`, refused
  while a game runs). The same set list deals a column a round (six at
  most), five clues each, easiest first by the bank's `level`, one hidden
  Daily Double worth 600 or more, then a Final: the desk's own
  (`triviaSaveFinal`, the set list's one `source:"final"` entry, which the
  rounds format skips and no count includes), else one of the bank's
  `TRIVIA_FINALS`. Whoever holds the board picks (`boardPick`; after 15 s
  the autopilot), the buzzers arm on the server clock and order by each
  phone's own reaction, not arrival (`boardBuzz`, settled 700 ms after the
  first), the fastest answers on their phone (`boardAnswer`), right takes
  the value and the board; wrong or out of time costs the value, strikes
  the option and reopens the buzzers (Oct 12, the rebound: a new race armed
  `REBOUND_LEAD_MS` on, exactly as the first, for everyone who has not
  answered the clue, earlier races kept in `log.races`, its fastest
  answering, three answers a clue at most); the Daily Double is the
  picker's alone (`boardWager`, `boardDdClue`); everyone plays the Final
  (Oct 12: 0 up to the score or 1,000, whichever is more), answers unseen,
  and it turns lowest score first. Points are
  trivia points; the result posts through `triviaFinish` like the rounds
  game. Every clock beat is an ordinary commissioner write the autopilot
  makes (`boardAutoBeat`, through `triviaAutoBeat`) and the pill offers as
  a `board-step`. A board game keeps `questions:[]`, so older code ignores
  it; `triviaLive` answers for both formats. A clue's photo or clip is
  served once picked, the Final's once its clue reads. QA plays it to its
  result (`boardSim`; the console's "Sim board").
- **Trivia board, the screens** (Oct 9): TVTrivia, TriviaPlaySheet and
  TriviaHome hand a board game to `features/tv/TVBoard.jsx` and
  `features/trivia/BoardPlay.jsx`, both reading the pure
  `trivia/boardModel.js` (`boardView`, `boardScreen`, `tvBoardScene`), and
  waking on the board's own instants (`boardInstants`), never the TV's 1 s
  tick. TV: the board fills the stage, a rail of every player's chip, name
  and score reel stands in the ticker's place, a picked cell flies up into
  its clue, the frame chases magenta while the buzzers are live
  (`useBoardChrome`), the Daily Double is a takeover sting, the Final turns
  each player on `finalRevealSchedule`. Phone: the pick grid, the arcade
  buzzer (`Buzzer`: dark until `armAt`, an early tap locks out
  `BUZZ_LOCKOUT_MS`, the reaction timed from the painted frame by
  `buzzReaction`, a late light timed from the arm), the options docked in
  reach on your turn, the wager wheels, the Final's own text. Sounds are
  `BOARD_PARTS` in the kit, cued by `tv/boardSound.js` (state steps through
  roomSound's fresh gate, clock cues on their instants). The desk's
  Rounds | Board switch, the board it will deal (`deskBoard`) and the Final
  card live in `BoardDesk.jsx` and `TriviaDesk.jsx`. Rehearse at
  `/dev/trivia-preview.html` (board steps run live with the real writes);
  fit views `tv-board-*`, `board-*` and `desk-board` (`dev/fit/boardFixtures.js`:
  `boardStage` from the contract, `boardPlayed` through the real writes).
- **Autopilot** (Oct 4, `shared/autopilot.js`): what a clock already decides
  runs itself. `autoBeat(state, { showControl })` is the one source of the
  next write the server owes, `{ at, from, type, payload, key }`: the winner
  scene's podium advances to the standings after `AUTO_WINNER_HOLD_MS` (9 s)
  and completes `AUTO_STANDINGS_HOLD_MS` (18 s) later (`sceneAutoBeat` in
  shared/show.js; Show Control only); Where and When reveals each photo at
  its deadline plus grace, or `AUTO_ALL_IN_MS` after the last player locks
  in, holds `GEO_REVEAL_HOLD_MS` (14 s), puts up the next photo and posts the
  result after the last (`geoAutoBeat`); Trivia the same per question with
  scores between rounds (`triviaAutoBeat`: reveal hold 9 s, 11 s for closest
  number, board 12 s, final 15 s). Lock and start opens the in-app game in
  the same write when it has content, so the commissioner taps Announce,
  then Lock and start, and the game plays to its posted result. The Durable
  Object's alarm (`runAutopilot`) applies a due beat through the ordinary
  reducer with a commissioner context `{ auto:true, actionId:key }`, so a
  beat already taken is a no-op; a refused beat stops until the board moves,
  a failed save retries in 5 s, and every write re-arms the alarm. The pill
  keeps each beat as a skip-ahead and draws the wait as a magenta lamp
  draining along its foot (`AutoDrain`); "Pause autopilot" in its tray
  (`setAutopilot { hold }`, `state.autopilot`) stops everything on its own
  until "Resume autopilot", and the pill then offers every beat by hand
  (including "Show standings"). Champion and opening scenes stay manual.
- **Sim players** (Oct 12, pure `shared/qaSim.js`, QA sheet Step part):
  a server-side simulated room for watching games play. `qaSimPlayers { on,
  includeMe, night }` (commissioner + qa capability, production takes
  `qaGate`'s confirmation, off needs none) stores `state.qaSim = { on, me,
  includeMe, night, seed, at }`; a progress reset clears it, QA jumps and
  restores keep it, checkpoints never carry it. Every present roster player
  but the commissioner's own (`me`, unless Include me) acts through the
  ordinary player writes with a synthetic context (`simContext`:
  `deviceId:"sim:<player>"`, `actionId` = the move's key, `sim:true`).
  `SIM_PLANNERS` is the per-game table (trivia rounds, board, geo, bets,
  karaoke, draft, night): each plans `{ at, type, payload,
  player, key }` from a seeded hash of (seed, game, question/contest,
  player, field), never Math.random, and reads the state so a made move is
  never planned again. `simDue`/`simNext` feed the Durable Object's alarm
  beside the autopilot (`runAutopilot`, `SIM_WRITES_PER_ALARM` a run, the
  earliest first); a refused or unchanged move is kept in memory
  (`simSpent`) and never looped; sim writes send no pocket alerts. **Run
  the night** (`night`) also takes the director's lifecycle beats on a
  human clock (`planNight`, `SIM_NIGHT`: announce 30 to 45 s after the last
  result, lock after a betting window, a played contest's winner after 45
  to 90 s, an off-app free-for-all's finish, a captains draft with default
  captains, confirmed once picked), `gm:true` moves under a commissioner
  context; in-app games play on the autopilot; it stops before poker.
  `tests/qa-sim.test.mjs` plays each game to its posted result.
- **Not coming** (Oct 4, `state.out`, `setOut { player, out }`): up to three
  invited players may drop out at the last second. `rosterOf(state)` is the
  weekend's roster (ROSTER minus Not coming) and `presentPlayers` builds on
  it, so standings, check-in claims, draws, contest sides, QA, awards turnout
  and nominees ("N of 10 voted"), the TV towers and roster wall, the travel
  board and keepsake counts all follow it; `isActivePlayer(id, state)` makes
  a Not coming player's device a guest. Refused once the weekend has any
  record of the player (`playerRecord`: a result, draw, draft, heat, bet,
  duel, ruling, poker seat, Where and When guess or Trivia seat; then Away is
  the tool) and below 8 players (`MIN_ROSTER`, Beerio's heats). Taking it
  back restores them exactly; claims, profiles and answers are never
  touched. Kept by a progress reset. Commissioner > People and trip > Who is
  coming (`features/roster/RosterSheet.jsx`): every invited player with a
  Here / Away / Not coming switch and a lamp. A poker table stores its seats
  whenever the roster is short, and the last-seat guard counts only seats.
  QA plays the whole weekend to the crown with three out and one away
  (`tests/roster-autopilot.test.mjs`).
- **Quick Draw showdown** (Oct 4, `src/features/duels/showdown.js`,
  `features/tv/TVShowdown.jsx`): a duel is a live showdown, not a private
  test. "Duel {name}" on a player card picks the stake from the Bets rack;
  after accept both phones show the stance and one Ready (`duelReady`,
  duelists only, idempotent); the second Ready stamps `armedAt` and a
  random `fireAt` 2 to 5 s out (`crypto.getRandomValues`, so QA's seeded
  stream is untouched), and both phones flash DRAW at `fireAt` on the
  server clock, each timing its own painted flash (foul and capture rules
  unchanged; an untapped flash records 5,000 ms). No Ready within 2 minutes,
  or opening 1.5 s after the flash, falls back to drawing alone. In a gap
  the TV plays the showdown anchored on `armedAt` (with an event live, the
  ticker carries the result). The economy is unchanged (antes, cap, lapse,
  daily limit, redaction until settled, `resolveDuel`).
- **Gags** (Oct 8; the bits since Oct 10, `src/features/gags/`: pure
  `gagModel.js`, `highlights.js`, `phoneBit.js`; `TVGags.jsx`,
  `TVHighlight.jsx`, `PhoneBit.jsx`; `shared/gags.js`): the room's comic
  moments, each a bit (below) on the TV and on the phones it is about. At
  most one per write, the first trigger that holds: an upset (the stored
  `odds` named an `underdog` and it won; shape versus, the winners `a`,
  the side they beat `b`, "Upset"), a streak (a player's third straight
  win, again at 4, 5..., on a pure W/L timeline: contests by `decidedAt`,
  W to the winning side, L to the beaten, a heat's non-qualifiers L; an
  event without contests counts its posted result, 1st W and everyone
  else who played L; never an event twice, a shelved event or the poker
  finale; win, "3 in a row", a whole side on one run letters its name), a
  new leader (a posted result leaves a different player alone at the top,
  from `chipWrites` before and after it; win, "In the lead"), a big losing
  bet (one bettor's net loss on the write's bets is `BIG_LOSS_MIN`, 1,000,
  or more; loss, "-1,000"), a new last place (a posted result leaves a
  different player alone at the bottom; loss, "13th"). `momentLog` replays
  every write in order and picks each moment's bit with `pickBit(shape,
  write key, recentFor(...))`: the same bit on every screen, a shape plays
  round its pool before a bit comes back, never one twice running. A
  contest's bit plays from `decidedAt + TV_ADVANCE_MS` and pushes the next
  face-off, a new leader's card and S15 by its length (`gagHoldMs`); a
  result's plays over its podium from `postedAt + resultGagAt(ms)` (1st
  has stood a second; it lifts off as the towers re-sort, and one too long
  for that holds the sort, picture and sound, until it lifts:
  `resultMomentPhase` `holdSort`). A bit's length on screen is its
  registry `span`: its last frame held until the name and fact have stood
  `READ_MS` (1.8 s), on the TV window, the phone overlay and the stage's
  lift-off alike (`--bit-span`; the scene's own motion keeps `ms`). The win song
  that write started walks out first: the bit plays 300 ms after the
  walkout leaves (`walkoutForWrite`, `walkoutSpan`), and the next face-off
  waits for any walkout on screen, then the bit (`afterWalkout`,
  `useLiveStart`). Only the newest write plays and a later lifecycle write
  ends it; never on a frozen board, at the live poker table, under another
  walkout or another takeover (decided as the window opens: skipped, never
  queued); a winner scene at any step lets it play. The TV: a full-canvas
  takeover through `BitLayer` on the session's painting, the name and fact
  lettered on its sky, the frame chasing in the winner's flood (a loss,
  the clay), the bit's own foley (`gagCues`) on the room bus from a fresh
  frame only (`useGagSound`), reduced motion its `still` and one summary
  sound. The phones (`usePhoneBit`, `gagAudience`: both sides of an upset,
  a win's winners, a loss's loser): latched only from a fresh frame (a
  phone that opens after the write sees nothing), on the TV's instant, its
  start following the state until it plays, then held to its end; full
  screen on the dark glass, the 16:9 stage across the phone and the name
  and fact stamped under it (the stage letters nothing, `letters` false),
  a tap puts it away; sound on the `you` bus, centred; the drawing loads
  on first use (`lazyPart`). It holds the stage (`holdStage`) from the
  fresh frame to its end, so that write's `ChipReceipt` docks after the
  bit. The highlight reel: in a real gap (`tvPhotoGap`) one "highlights"
  turn after the records (`withHighlightTurns`) replays the weekend's
  moments newest first, one a turn on the server clock (`highlightAt` from
  `highlightSince`, so a gap's first replays the newest): the bit in a
  window of glass with a cyan Replay lamp and its event, played from the
  turn and held on its punchline, on its own session's painting, silent.
  The TV sheet's Gags switch (`setGags`, top-level `state.gagsOff`, kept by
  a progress reset) turns off the moments, the phones' and the reel. The QA
  console's Gags part lists every moment bit by shape, Random first
  (`qaGag { bit }` or `{ shape }`, commissioner and the qa capability, no
  confirmation or backup), writing `state.gagTest` with a cast from the
  board (a versus is last place beating the leader, a win the leader, a
  loss last place), played on the TVs only 300 ms after its write even
  with Gags off, cleared by a reset. `/dev/gags-preview.html` lands each
  trigger's write live on the real TV (`?trigger=`, `&song=1` the walkout
  first, `&bit=<id>` a QA test of that bit); fit views `tv-gag-*`,
  `tv-highlight*` and the phone's `bit-*` (the write lands on a fresh
  frame).
- **Bits** (Oct 10, `src/features/gags/`, approved by Brandon and played
  as the Gags above since Oct 11): the gags' replacement. Straight-faced
  physical comedy whose cast is the players' own photo chips. The rig
  (`cast/CastChip.jsx`, pure `castGeometry.js` and `gloveArt.js`): the chip
  on its edge with a coin's thickness, two floating white gloves in eight
  poses (rest, ready, open, fist, grip, point, flat, thumb; `hands` takes a
  pose or `[[pose, ms], ...]`, `hold` a prop in a hand, behind the fingers),
  optional shoes, a shadow that walks with it, every layer a node of no size
  hung off the feet (`.cast-move`, `.cast-hop`, `.cast-body`, `.cast-chip-in`,
  `.cast-hand-in`, `.cast-held-fx`...), so a bit squashes, tilts, gestures
  and throws by class; `CastSide` stands up to four and letters "+N" past
  the outer glove at the chips' middle (`.cast-more`, a node a bit can move
  with the side). No eyes over a photo. Props (`props/Props.jsx`): revolver,
  muzzle flash, puff, dust, tumbleweed, anvil, floor shadow, dizzy stars,
  sweat drop, sunglasses, speed lines, emanata, whirl, chip stack,
  roadrunner; one ink keyline (`CAST.line`) and flat `--bit-*` inks mixed
  from the painting's. `bits/registry.js` is the pure contract: each bit's
  shape (versus, win, loss, idle), style (action, slapstick, desert), `ms`
  (3 to 5.5 s for a moment), named `beats` (CSS reads `var(--b-<name>)`,
  cues land on them), `still` (reduced motion's frame, after the lettering
  lands), `summary`, `letter` (`at`, `over`, and `place`: top-left,
  top-right or top, wherever that bit's action is not), `camera`, `cast`
  roles and `cues`; `pickBit(shape, seed, recent)` picks the same bit on
  every screen and never repeats one while another remains. `bits/scenes.jsx`
  maps ids to scenes. Every motion is `--ba:<animation>; animation:var(--ba)`
  from `calc(var(--tl) + ...)`, filled so each element rests on its end
  state; a frozen bit (`is-frozen`) holds any instant through shell.css's
  reduced-motion rule (`tests/bits.test.mjs` scans the convention). A
  one-shot stepped switch (a pose layer, a prop shown or hidden) jumps at
  its START (`step-start`, `steps(n, start)`): Chrome can leave a finished
  animation a hair under progress 1, and an end jump then rests on its
  FIRST value, so live TVs drew stacked gloves and doubled props that no
  frozen frame showed (Oct 12; `tests/stepped-fill.test.mjs` scans src).
  **The camera** (pure `bits/camera.js`): every bit is shot, never staged
  wide. Its registry `camera: { zoom, x, fit, moves, shakes, washes }`:
  `x` is a world x or an anchor its scene names (`Scene.anchors(cast)`:
  quickdraw's `a`, `b`, `mid`, `minX`, `maxX`), `fit` caps the zoom so
  `minX` to `maxX` fits the TV's safe sides (a versus as tight as both sides
  allow, wider for a bigger cast) and scales every move with it, `moves`
  are `{ at, ms, zoom?, x?, ease? }` on the bit's clock (a punch-in at the
  hit, a whip, a pull-back for the hold), `shakes` kick the shot and a
  `washes` instant gets one white frame just before it. A solo medium shot
  is zoom 1.8 (a 432 px chip); every framing is clamped so the painting
  covers the canvas. `BitStage.jsx` turns the track into one keyframes
  animation on `.bit-world`, which zooms the session's painting, a pool of
  floor light and the scene together about the floor (world y 930 held at
  screen y 990); the lettering stays in screen space: the name (at most
  110 px, `bitNameSize`) and the moment's fact ("-1,000") stamp at the
  hit or the hold in the letter's place inside the TV's title-safe edges,
  and the stage cues its foley on the room bus from its start
  (`tv/bitSound.js`; the kit's `BIT_PARTS`, open past a win song). The
  exemplars: quickdraw (an upset: the BANG is a white frame, a flash bigger
  than the shooter held three frames, a big shake, then the tiny gun's kick
  skids A back a step), anvil (a loss: pancaked, peeled up, it turns to the
  room for a beat before it limps off) and roadrunner (a loss: a long skid,
  a leaning beep beep, the shadow left behind winding up before it runs).
  The solo pool (19): versus quickdraw, springglove, butte; win explosionwalk,
  toohype, sunset, statue; loss anvil, roadrunner, dontlookback, quicksand,
  dynamite, vulture; idle nap, armwrestle, saguaro, pushups, sweep, map.
  **Team bits** (Oct 12, Brandon's set): most of the slate is pairs and
  teams, and the bits above clump a side where only the front chip acts,
  so six more lay out any side of 3 to 7 (`TEAM_MIN`, `TEAM_MAX`; roles
  carry `min:3`), spaced so every glove is its own chip's and every chip
  takes part: versus dominoes, tugofwar, slowmowalk; win pyramid,
  teamphoto, victorylap (`lineLayout` in castGeometry.js stands a line).
  `pickBit(shape, seed, recent, sides)` picks from `poolOf(shape, sides)`:
  the team bits when the moment's LARGER side has 3 or more (`teamSized`:
  a 3 v 3, a 7 v 6, an odd 2 v 3), the solo bits otherwise (and always for
  a loss, which is one player); the same seed picks the same solo bit as
  before. `momentLog` keeps each pool's own rotation (`poolKey`, e.g.
  "versus:team"). `shared/gags.js` `GAG_TEAM_BITS` mirrors the registry
  (tests hold it); a QA test of a team bit (`qaGag { bit }`) casts a team
  from the board (`gagTestCast(..., { team })`: a versus the bottom of the
  board beating the top, 6 v 7 for thirteen; a win the top three) and
  plays every one of them; Random stays one a side. Reel casts `3v3`,
  `6v7`, `7v6`, win `3`, `5`, `7`; fit views `tv-gag-<bit>-3v3|7v6`, win
  `-3|-7`, `tv-gag-test-dominoes`. `node scripts/bit-live.mjs <id> <ms...>`
  plays a bit LIVE on the gags rehearsal (its new `&in=<ms>`: the bit
  starting that long after load) and sets each instant beside the same
  instant frozen, since frozen frames once hid a live-only bug.
  Idle vignettes are the TV's downtime: 6 to 10 s (`IDLE_MS`), cast from
  the room (the players present, a vignette takes one or two), `letter:null`
  (no name, no fact, the painting at full light), `still` the punchline.
  Attract mode (Oct 11, pure `tv/attractModel.js`, `tv/TVAttract.jsx`)
  plays them in TVMode: one turn a gap rotation, after the records; the
  turn's server start picks the vignette (never the same twice running, the
  arm wrestle only with two present) and its cast from `presentPlayers`; it
  plays once from that start over the board, which keeps the rest of the
  turn, its foley ducked and only on a TV that saw it start.
  A name two styles both invented carries its style (`IdleSaguaro`,
  `--bit-idle-cactus`, `--bit-slap-soot`, `--bit-desert-rock`, `bitSqueakSoft`).
  `/dev/bits-reel.html` plays them all; `node scripts/build-bits-reel.mjs`
  bundles it into one page for review and `node scripts/bit-frames.mjs <id>
  <ms...>` renders frames (`--contact` a sheet, `--cast 2v2|4v6` a bigger
  side, `--soundcheck` the foley offline).
- **Arrivals** (Oct 4, `state.arrivals`, `setArrived`, `setArrivalsOpen`):
  Friday starts with people still on the road, so games may run before all
  13 are in. Once the door opens (the first check-in, or the commissioner),
  a roster player who has not checked in is on the way (`isOnTheWay`); the
  shared `isAbsent` (Away or on the way) keeps them out of new draws,
  free-for-all sides, Trivia / Where and When and poker seats, exactly like
  Away, while they can still bet and duel. Check-in is open per
  `canCheckIn` (the door open, or from `EDITION.arriveFrom`, Friday
  midnight Arizona, with the door never touched and the weekend not live),
  so production guests never see it early; a closed door stays closed and
  counts everyone here; a late arrival joins an open free-for-all market as
  a side (its revision moves). **A scan proves presence** (redesigned Oct
  4): the Durable Object keeps a private random code
  (`private:arrive:code`, 8 chars, `isArriveCode`), made when a TV first
  needs it while check-in is open, sent ONLY to TV sockets (`arrive` on the
  state frame head, on a TV's pong, and an `{type:"arrive"}` message when
  the app's TV mode switches on or the code changes; `client.js`
  `arriveCode`), never in state, snapshots or other frames. A guest's
  `setArrived` must carry the current code (`ctx.arriveCode`; "Scan the
  code on the TV"); the commissioner needs none. Closing the door drops it
  (a new one on reopening); Who is coming's "New code" (`arriveRotate`, GM
  token) replaces it. The QR is `${origin}/?arrive=<code>`.
  **The lobby** (`arrivalsModel.js` `arrivalsBoard` stage "lobby": check-in
  open and no event announced, `lobbyOver`): the TV (`TVArrivals.jsx`
  `TVLobby`) is the painting, a glass pane with the code lit bone and the
  "9 of 13" drum, and 13 seats as a horseshoe (`lobbySeats`, roster order),
  chips dropping in on the arrival's server instant, Landed lamps from the
  projection's `landed`, the lit mark once all are in; no ticker or
  horizon. The guest's Home shows "Scan the TV" (`ArrivalHome.jsx`
  `ScanPane`, chip over a seat). **After the lobby** (stage "corner": a
  game announced, someone on the way) the TV shows `TVArriveCorner`, a
  bottom-right plate with the code over the unlit faces still out (the
  horizon/towers board and ticker narrow for it; it leaves with any
  takeover), and that guest's Home a compact `ScanRow`. **Scanning:**
  iPhone's Camera opens a QR link in Safari, not the installed PWA, so the
  app has its own scanner (`Scanner.jsx`, lazy via `lazyPart`, rear camera
  through getUserMedia, jsQR loaded only inside it, decode-to-dispatch in
  the pure `scanSession.js`: one write at a time, other QRs ignored, a
  refused code not resent), ending with the chip seated and "Here"; a
  blocked camera says "Camera blocked" with Try again (the commissioner can
  mark you). A claimed browser that opens the link checks in on load and
  strips the parameter (`useArriveLink`, `arriveLinkStep`); an unclaimed
  one does nothing. Who is coming keeps Here / Away / Not coming, adds
  "On the way" and Mark here under anyone not in, and one small Check-in
  control (Open / Close / New code).
- **Standings towers** (Oct 4, `features/tv/towersModel.js` `towerLayout`):
  every tower keeps a fixed slot across the full width (one per row, never
  13 hard-coded), so names and counts never collide at any chip count; chip
  width comes from the slot and a tall leader thins the chips (still one per
  100; the first ten keep 4px each). A zero or negative stack is an empty
  base. Phone bars switch notch grain (100, 500, 1,000, 5,000) so a 15,000
  board still reads (`boardModel.js` `chipNotch`).
- **Result entry** (Oct 4, `features/results/ResultEntry.jsx`,
  `PlacePicker.jsx`, pure `placePickerModel.js`): a podium of the paid
  places over the present field as photo tiles; one tap seats a player in
  the lit place (flies in), tap again to take back, tap a place to aim it, a
  dashed + on a filled place adds a tie; team events switch Teams/Players.
- **Team names** (Oct 3, `shared/teamNames.js`, `worker/teamNames.js`,
  `src/features/teams/`): suggestions are made from the team itself (a
  first-name alliteration or blend, "Brankhoa", jersey numbers, "Seven
  Twenty-Three", chip color families, "Gold Rush", team size, the game's
  puns, the desert; the old mascots are one flavor), seeded by the draw
  id's random part + team index, so every screen and a seeded rehearsal
  agree; three a round, the shuffle reads the next three, each at most 20
  characters and screened (`safeName`). A draw or confirmed draft stores
  the first suggestion as a team of 3+'s `name`; pairs stay "A & B" until
  named. `nameTeam { evId, drawId, team, name }`: any member (device claim)
  until the event's first contest locks or starts (`teamNamesLocked`), the
  commissioner always; stale draw ids, duplicates (case-insensitive),
  blanks, over 24 characters and words over 15 letters are refused; a pair
  may clear back to its names; retries replay from server-only
  `eventOps.nameCommands`. The team records `named { by, gm, at }`. Names
  are labels only (wagers, brackets, results key on team index and
  players). Home and the event sheet show your team's "Name your team" card
  (`TeamNameCard`, suggestions as chips, the current one lit, Write your
  own), the Commissioner section `TeamNameDesk`; a fresh rename re-letters
  in place (`RenameText`: TV side names, bracket cells, stage groups, the
  phone bets board) and the TV plays one `stamp` at `named.at`
  (`roomSound.js`). Fit audit views: `tv-names-*`, `name-team*`,
  `names-long*`, `gm-names`.
- **Photo desk** (D11, `worker/moments.js`, `src/features/photos/`): guests
  add weekend photos from Weekend > Photos (camera roll or camera). The phone
  resizes to 1600px JPEG 0.8 plus a 480px thumbnail (a canvas writes no
  EXIF); `POST /api/moments` (multipart, `X-Field-Day-Device`, claimed
  players only, 20 s deadline) re-reads the JPEG's real size and strips
  APP1/APP13/comments. Each photo is two DO values (`moment:full:<id>`,
  `moment:thumb:<id>`) plus `moment:index`; caps 200 photos, 150 MB, 40 per
  player, 12 a minute. Not tournament state and not portable (a snapshot's
  8 MB body and every backup would outgrow it): restore, reset and QA rewinds
  never touch it, and `npm run moments:export` keeps it (runbook). Frames
  carry only `state.moments` records `{ id, by, at, takenAt, w, h }`, hidden
  ones for the commissioner only; no device id, no version bump (the broadcast
  names `lastAction:"moments"`). Authors delete their own; the commissioner
  hides, shows or deletes any. `PhotoGrid` (read-only, tap to view) is the
  reusable grid. The TV adds "photos" turns to the ambient rotation only in a
  gap (`tvPhotoGap`: never loading, final, a scene, a result, poker, a draft,
  a live event, an intro, a reveal or a face-off), newest 30, one per 6 s on
  the server clock, each opaque layer fading in over the last.
- **Rivalries and records** (Oct 10, pure `features/tv/recordsModel.js`
  `recordCards`, `TVRecords.jsx`): the gap's downtime, one record a card
  for the room to argue about, derived from the record every time and never
  stored (a correction, an undone contest or a void moves them like the
  board); no data, no card. Head to head: players who met in 2+ decided
  contests by the player card's own record (`eventMeetings` and settled
  Quick Draws), teammates with the very same record standing as one side
  (three at most); the closest, the most lopsided, the most played. Biggest
  swing: the biggest the ticker ever named (`biggestSwing`) or a Quick
  Draw's ante, 500+ either way, never a ruling, and on its turn the ticker's
  own steps aside. Longest streak (gags' `winStreaks`, 3+), most upsets (the
  stored `odds`, 2+), best and worst bettor (settled net, 500+), Quick
  Draw's fastest settled reaction and most wins (2+); a record more than
  three share is none. One "records" turn after the gap's own cards
  (`withRecordTurns`, only in `tvPhotoGap`), each showing the next card on
  the server clock (`recordTurn`): one glass panel standing on the floor
  (y 880), a lilac label of 1 to 3 words, photo chips with every name under
  its chip at one size, the record as one big numeral (chips amber, a loss
  clay, counts bone; "3 to 1" between two sides, the side behind lilac),
  rising in on the turn's own instant. Fit views `tv-records-*`.
- **Karaoke songs** (Oct 12, docs/KARAOKE.md "YouTube"; `worker/karaokeVideos.js`,
  `features/karaoke/KaraokeSongPicker.jsx` on the pure `songPick.js`): a
  guest searches Spotify (the win song's `SongSearch`), picks, and `GET
  /api/karaoke/videos` (device claim or GM token, 10 lookups a device a
  minute) runs ONE search.list ("{first artist} {song name} karaoke",
  release suffix and featured artists dropped by `songTitle`/
  `karaokeSongName`) and ONE videos.list; `chooseKaraoke` keeps uploads an
  embedded player can play in the US (embeddable, public or unlisted,
  processed, not age restricted, not blocked in the US, not live, 60 to 900
  s) that say karaoke, never a "- Topic" channel or Sing King, and ranks
  the song's own name, then `KARAOKE_CHANNELS` (Stingray first), then title
  words, then the length nearest Spotify's, one per channel first: up to
  three, kept in `private:karaoke:<trackId>` 30 days (YouTube's storage
  rule; a miss a day; a failure never). The win song's
  `private:youtube:<trackId>` refreshes after 30 days too. A quota answer
  reads "YouTube's daily limit is used up. Paste a YouTube link."
  (`youtubeFailure`; search.list is its own 100-call bucket). `GET
  /api/karaoke/video?id` checks a pasted link (play checks only); `GET
  /api/admin/karaoke/check` (GM) reads every roster song's video and
  alternates in one call and stores nothing. After a write opens a pick
  window, the DO reads every present player's videos in one call and
  writes `karaokePreflight { gameId, bad, videos }` as an auto write, never
  holding up the start. The picker: thumbnails (`karaokeThumb`, 128x72)
  open YouTube's own player one at a time (`previewPlayer` `onClipStart`
  is a set; whatever starts stops the rest), Use writes `karaokeSong` with
  the other candidates as `alts`, a pasted link joins the candidates,
  `muted` (the pick window) keeps covers still and previews silent.
  Profile > Karaoke (`capabilities.karaoke`, audioCatalog and songSnippets)
  has no Save: Use is the save. Home's list adds "Pick a karaoke song".
  Fit views `karaoke-song*` (stand-in thumbnails ride a `thumb` field the
  server never sends).
- **Karaoke** (Oct 13, the contract is `docs/KARAOKE.md`; pure model
  `shared/karaoke.js`, reducers `worker/karaoke.js`, the TV
  `features/tv/TVKaraoke.jsx` on `karaokeTv.js`, the phones
  `features/karaoke/` on `karaokeModel.js`): Friday's free-for-all in
  Hypixel Build Battle's shape, only with `capabilities.karaoke`. Lock and
  start opens a 2-minute pick window in the same write (`karaokeStart`):
  Keep or Change on every phone (the picker muted), the TV lighting chips
  as each locks in, the DO's one batched video check (`karaokePreflight`,
  server-only `bad` by video id). The window's end draws the running order
  from the game id (no song: sits out, backers returned); each singer is Up
  next 20 s, then `karaokeStartSong` plays the YouTube upload on the TV in
  its own box with nothing drawn over it (`karaokePlayer.js`: cue at up,
  play at songAt on the server clock, late TVs seek, stop at ENDED or
  endAt, reports ready/playing/error/blocked as presence `tvVideo`, which
  the DO turns into `karaokeTvPlaying` / `karaokeTvError`; muted by the
  TV's Sound switch; never a player in a fixed still). Every present
  player but the singer votes six tiers on the phone (single flight), the
  vote closes 20 s after the song (or once all are in); a quarter
  Legendary rains on the TV, delaying the next singer or the reveal; the
  reveal runs last to first on the server clock and phones hold each row
  to the TV's instant; `karaokeFinish` posts through beginResultEntry +
  saveResult. Votes never leave the Worker (frames carry who voted and
  when) and are deleted when the result posts. Every clock beat is an
  autopilot write (`karaokeAutoBeat`) the pill offers as `karaoke-step`
  with a tray (More time, Later, End song, Next video, Skip, Restart).
  Home: the You strip speaks what the game asks (`karaokeYou`), the Now
  card's `KaraokeHome inCard` row the rest. QA: `playKaraoke`, Sim songs,
  Sim votes; Sim players' `planKaraoke` keeps or takes practice songs
  (`karaokeSimSong`, sims only, never a profile) and votes on a human
  clock. Practice songs have no video: the TV plays a lit card for 30 s.
  Fit views `tv-karaoke-*`, `karaoke-*`, `gm-karaoke-desk`, `gm-qa-karaoke-*`.

## Current redesign direction

**October 2 "Backglass" redesign supersedes every visual rule below.**
Brandon said (Oct 1) the earlier design rules were written by agent
sessions, not by him, and opened the whole look. The visual system is now
DESIGN.md (sidecar `.impeccable/design.json`), the direction contract is
`.impeccable/surfaces/src-app-jsx.md`, and product truth is PRODUCT.md.
Field Day is a lit pinball backglass: blue-black glass in every session
(the session shows only in the painted art and the `--phase` lamp; TH1's
surface ramp is gone), bone ink, three lamps with fixed jobs (magenta live,
amber chips, cyan info), filament yellow reserved for "you", player colors
as painted inserts, Shrikhand for moments and names, Big Shoulders Display
for reels and labels, the system face for body, score reels for chip
counts, lamp states (steady/flashing/unlit/struck), one painting per phone
viewport (`GlassArt`), takeovers for every peak. Glows, floods, confetti-like
chip rain and phone sound at peaks are now allowed. Where the paragraphs
below describe colors, fonts, the phase ramp or "no gradients, no glows",
they are history; their product, flow and engineering rules still hold.
Copy voice (terse, no em dashes, "Winner pays 1:1") is unchanged.

The Backglass pass (with the look-independent foundations: phone sound
through the silent switch, audio node cleanup, duck under win songs, TV wake
lock and "Sound early by", TV sound health on the pill, lazy TV/QA/desk
chunks, computed chip ink) went to STAGING first as `cdec5dff` (Oct 2).
Wave 2 (Brandon's staging feedback: less busy, color by role, one type
family: Big Shoulders Display 900 plus the Inline cut for hero lettering
only, Shrikhand removed; hero-only drum reels; no stranger's numbers;
commissioner dock; new TV ticker and calm towers; touch tilt, glass
reflection, parallax painting, coin chips; the per-team draw partner beat (replaced Oct 3: a team now turns as one card, `drawBeats`);
in-app TV mode counted as a TV) went to staging as `d87c5798`. Wave 3 (new
mark "the chip, lit" and icon set; `npm run audit:fit` fit audit, 179 views
clean; 23.5 s crown; champion card and big-bracket stage; PayoutLadder
podium; no rules prose or "400 · 200 · 100" lines; Weekend as "the program"
with drawn GameSteps (`src/features/rules/`, words in `rulesWords.js`, owner
review at /dev/rules-review.html, approved Oct 3 with one edit; Gauntlet, Flip Cup and general basketball removed); state-driven event
sheet with a separate Commissioner section; text sweep (/dev/copy-review.html);
one menu system (`src/ui/Menu.jsx`, `director/menuModel.js`) with Skip in
the pill's ⋯ tray; QA strip and `qaBets`; team walkouts; the star strip as
one slot per event; Trivia as one four-team game; "Final" labels) is on
STAGING as version `ed47191a-ee72-4918-aec8-8b5b7044edc0` (commit `9044030`): 836 tests, the
fit audit and the 139-check local e2e pass. On Oct 3 the commissioner menu
restructure (TV, Speaker) and the new game intros merged on top (commit
`cc16c63`, 866 tests): staging `89b88989-0e47-487d-9b2f-7cf28b8e806a`, then
PRODUCTION `2f961de0-b233-4f9c-8c25-7c3a77a4636f`, deployed by Brandon without a
snapshot at his call (branch and tags pushed to origin). Then in-app Trivia
merged and the TV next-event card fix landed (commit `b6aec4c`, 880 tests):
staging `e06dd248-3361-49b9-a6cd-2acc89603f09`, PRODUCTION
`a61d5030-56cf-42fb-8b96-05906f1bee41` (Oct 3). Then **v3** (tag `v3`, commit
`02d2187`: personalized team names, the lit podium and beauty pass, the
cup, the one-card draw reveal, score reels; staging `da7153b2`) and **v3.1**
(tag `v3.1`, commit `32c1727`: leader bounty, underdog odds, byes to the
bottom, the crew check before draws; 938 tests, the 290-view fit audit and
the local e2e pass; staging `4cb9f47b-e003-4115-823c-dddca6e087fe`) went to
PRODUCTION as `0f480665-2271-4e9e-a61b-f91f89ddc4ac` (Oct 3, `APP_VERSION`
"v3"). Then **v4** (tag `v4`, commit `ec06c1a`, Oct 5; 1002 tests and the
364-view fit audit: autopilot, solo Trivia, Not coming and flexible crew,
arrivals lobby with the TV's QR, the live Quick Draw showdown, the bounty
and team MVP cut, and the critique passes) went to staging as
`29f2207c-7ef4-4486-9fb6-8159211ce41b` and PRODUCTION as
`6ee2caa4-51f4-42c4-b98e-1b3f41ba0166` (`APP_VERSION` "v4"; the ⋯ fix `327be6f` followed as `76b16cc3-1753-4bf3-a996-ce573873dcee`, then the Where and When desk reading photo GPS and time, `fa34231`, as `bc0ce2f2-5596-465e-9aaf-b0a23a9bc416`), deployed at
Brandon's call without a snapshot; production's state (13 profiles, no game
progress) loaded clean. Roll production back one release with `npx wrangler
rollback 0f480665-2271-4e9e-a61b-f91f89ddc4ac`, two with `npx wrangler
rollback a61d5030-56cf-42fb-8b96-05906f1bee41`, or to the Sept 30 code with
its secrets with `npx wrangler rollback a958acac-3f26-4b34-848c-d0351d318522`. Local dev
note: a stale `vite dev`/workerd left running holds `.wrangler/state` and
makes every new dev server fail on its first `/ws` or `/api`; stop old ones.
A second local server beside it needs its own port, inspector port and
`--persist-to`, `CLOUDFLARE_CF_FETCH_ENABLED=false`, and `GM_PIN` in its
environment (`wrangler dev` on a built config reads no `.dev.vars`).
**Oct 9 overnight build** (branch `night/oct8`, 41 commits on `988fd6d`, not
merged into `m2/spectacle-foundations`, not on production): the Trivia
board, the Gags and the Ready check, 1101 tests, the 437-view fit audit and
the local e2e (141 of 142: the one miss is a stale "exactly 12" assertion
older than the build) pass. STAGING only, as
`a0e4800c-4fd5-4661-9731-a89df7b0c8ac`, awaiting Brandon's review; roll
staging back with `npx wrangler rollback 66da6088-aebb-4ad2-a5c2-0e81b6403fef
--env staging`.
**Oct 11 moments build** (branch `oct10/moments`, on `night/oct8`; not on
production, not pushed): the 19 bits wired to the five moments on the TV
and the phones they are about, the highlight reel, attract mode and the
records cards; 1162 tests, the 465-view fit audit and the local e2e (141 of
142, the same stale assertion) pass. STAGING only, as
`16c4a36f-504e-4dd1-8394-b34a7d17b1a2` (build `6d5ca12`), awaiting
Brandon's review; roll staging back to the Oct 9 build with `npx wrangler
rollback a0e4800c-4fd5-4661-9731-a89df7b0c8ac --env staging`. A local e2e
server on the production build needs `--var APP_ENV:local` and a short
`--persist-to` (a long Windows path fails the Durable Object's storage).

**September 5 correction (history for the visuals).** Brandon rejected the light
redesign and the rewritten voice. It made the app harder to use and broke
intentional cohesion. This supersedes the September 4 light paper/burgundy
direction. In the subsequent Home brief, Brandon explicitly allowed a new
dark palette: green charcoal, warm bone, muted yellow, and restrained lilac.
Keep the dark theme. **No string in the app is protected wording** (Sept 27):
older lines are not Brandon's by default and change like any other copy. No
corny lines, jokes, asides, slogans, a fictional host note, casino idioms, or
reassuring filler, and no text that explains what a control, layout, number,
or feature already makes obvious. Keep labels, numbers, rules a player cannot
see on screen, confirms that name what will change, and errors that say what
to do.

Treat this as a UX and system problem: make the app's functionality easy to
find, keep related actions together, and preserve context between views.
The September 7 product review is scoped to mobile players and commissioners,
plus the shared TV. Do not prioritize keyboard-only audit findings for this
weekend. Retain touch-target, legibility, motion and recovery requirements.
Delight must support intuitive use. Betting should feel like video roulette
or poker: choose a denomination, place chips directly on the board, and take
the last chip back from the same stack. Selecting a player's name or avatar
opens that person's player card consistently; a wager's chip target performs
the wager action.

The identity color selection colors the entire player card, front and back,
with readable ink derived from that color. Keep the profile/check-in preview
and public card on the same saved identity color, including photo frames and
card ornament; it is not only a chip or thin accent rail.

**TH1, the living weekend (Sept 28):** the surface ramp shifts by session.
`weekendPhase(state, events, { liveEvent, operationEvent })` in `src/ui/phase.js`
is the one pure source: Friday until `state.live`, the finale once dealt or
frozen, else the event in play, the last posted result, the event being
prepared. `usePhaseTheme` (App) puts it on the root as `data-phase`, and the
TV's DesertBand sky reads the same function, so phones and the TV never
disagree. `:root` in experience.css is Friday (bg #0e191c, blue-slate);
`:root[data-phase=sam|sap|san|fin]` swap only bg/paper/paper2 (the night ramp
aliases them), muted/muted2, chrome, scrim, shadows and `--phase` (sand,
adobe, oxblood, near-black). Bone, gold, accents, `--ink0`, chip colors and
player cards never change. A change while open eases 1.5s via the
`fd-phase-shift` class, never on first load, instantly under reduced motion.
`theme-color` follows `--bg` except on staging, which keeps #101A33. A 3px
`--phase` line tops the header. Text in the clay family uses `--clay-text`
(`--clay` is fill and line only); `--disabled` and every body-text token hold
4.5:1 on every surface in every phase (`tests/living-theme.test.mjs`).

The original per-game SVG moments belong in the phone announcement and TV
spotlight. An atomic announcement/draw must play the short intro first, then
the saved draw; both effects must not mount their ceremonies in one render.
Returning from a player card shows the completed draw without replaying it.

**September 7 announcement crash:** the render-time announcement gate once
read `simRef` before its declaration. Keep refs above every synchronous render
read; callback-only tests cannot cover that transition. The actual-App
regression renders both sides of the first announcement with retained refs.
Keep the app-level recovery boundary in `main.jsx`; it may reload the client
but must never clear claims, profiles, or tournament state.

The current route structure has four stable main areas: Home, Events, Bets,
and Weekend. Home keeps the same identity throughout the weekend. Its current
event, real personal assignment, direct rules/betting actions, chip position,
and actionable duels take precedence over reference material. The leaderboard
is always visible on Home with all 13 players, chip balances, and the current
player's row distinguished. Never collapse it into a roster accordion or
require a sheet to see the standings. Home and the full standings sheet use
the same `Leaderboard` component; only the commissioner board exposes Adjust.
Before play, show the first event and all 13 neutral rows labelled Starting
chips at 1,000. During poker, keep the actual table controls first;
after results, show final chips and the confirmed champion when frozen.
The weekend starts implicitly when the host opens the first game's betting
or starts play. Team/heat/draft preparation alone does not start it. Never add
a separate Start/Open weekend step, including in the director's next action.
The first game-opening write carries a one-tap confirm on that same tap
("{Event} starts the weekend.", server flag `startWeekend`), and
`returnToLockerRoom` undoes a mistaken start only while nothing has been
played or bet.
House, flights, and check-in details belong in Weekend, not a Home hero.
Weekend contains Trip,
Rules, and Games, and remembers its selected section. Profile, public player
cards, and event details open as sheets; host controls remain separate from
guest navigation. See `docs/UX-REPAIR.md` for route and acceptance criteria.

**App-wide efficiency pass:** remove repeated content and unnecessary framing
before reducing useful information or type size. Desktop modals fit their
content; compact sheet headers carry the title and relevant actions once.
Avoid repeating that title inside the body or adding another padded card
around an already complete section. Keep scrolling, focus, return context,
pending-write guards, and at least 44px active controls.

Event and draw announcement sheets keep compact operational content and the
announcement/reveal sequence. Efficiency must not remove the anticipation,
player-color motion, or acknowledgement feedback that makes a result legible.
A bracket is drawn as a bracket: rounds are columns, each match sits between
the matches that feed it, connector lines carry winners forward, and the live
match is outlined (`bracketLayout`, features/weekend/CompetitionBracket.jsx).
`makeBracket` runs 2 to 16 entrants: 2 to 6 keep their stored hand-drawn
shapes, 7 to 16 seed into the next power of two with byes to the top seeds.
1v1 Basketball is a bracket of everyone present (teams of one, `teamFit`
shrinks it for Away). The v2 slate (Sept 29): Long Putt, Beer Die Doubles,
Where and When, Karaoke (Fri; Karaoke since Oct 12); 5v5, Pickleball Doubles, 1v1 (Sat AM); Volleyball as 4 teams of 3,
Trivia (solo, in the app), 8-Ball, Beer Pong (Sat PM/night); Rage Cage, Beerio
Kart; poker. Trivia is played in the app when it has a set list, and Where
and When when it has photos (else each is entered like any result). 5v5 is everyone-plays (`participation:{type:"all"}`): the draw
or the captains' snake splits whoever is present 7 v 6, with no crew. Tests
that need a dropped shape (pairs pools, solo heats of three, an even
two-team game) add it through `tests/support/legacy-events.mjs`. Past eight the TV draws the bracket from both ends toward
a middle final (`mirroredLayout`) so it fits under the contest. While
a bracket game is live, Home shows your path as one line ("Semifinal ✓ → Final
vs winner of Semifinal 2 · Full bracket ↗", `bracketPath`), Bets shows the
compact read-only bracket (`BracketPeek`, one target) under the board, the TV
shows it with pair names, and its Events row has its own Bracket entry; all
open the full bracket sheet. Home keeps the leaderboard heading on the first
phone screen during events: no page title, a one-line Latest result that hides
while the "Since you looked" line shows, and your own waiting duel offer
collapsed. "Since you looked" is built from the first fresh state after the
phone returns and opens what it reports. "Update ready" is a header chip.
Commissioner winner selection uses the actual bracket matchup or heat rows,
with separate player-avatar targets for cards. Do not build a second copy of
the teams just to choose a winner. Bets keeps one compact chip rack and a
readable ledger, preserving direct chip placement, retraction, and feedback.
Home consolidates the separate own-score summary into the always-visible
leaderboard, with exposure and one standings-details route beside it. Events
uses compact progress and session rows with shared lifecycle status. Weekend
opens directly into its selected content; Trip is address-first with saved
flights, Rules avoids nested framing, and game instructions use a single
game-name sheet title. Preserve every objective, step, variant, win condition,
and house rule. Live profile editing offers the card preview on demand and
shows the current locked chip instead of a grid of disabled choices. Public
cards keep their identity and stats; Quick Draw instructions expand beside
the ante controls. The unlocked check-in editor, full venue introduction,
saved flight answers, and acknowledgement flow remain intact.

**Draw and draft follow-up:** keep the short event entrance before an automatic
team reveal. Reveal the actual matchup, team, or heat groups in sequence,
with covered identities unavailable to keyboard focus until shown. Skip
animation and Replay draw remain explicit controls; reduced motion shows the
complete draw immediately. Replaying presentation never redraws teams or
changes gameplay. Winner celebrations, TV draft cues, chip feedback, and Home
rank-change arrows remain part of the experience.

Team games of three or more a side (the 3v3s and the everyone-plays 5v5,
`draftsByDefault` in shared/show.js) open with "Captains draft" as the
director's beat; "Random draw" (`announceAndDraw`) is an alternative in the pill's ⋯ tray (Oct 2: the pill shows exactly one primary action; alternatives and Skip, styled quiet and last, live in the tray; menus share `src/ui/Menu.jsx` and `director/menuModel.js`).
Pairs keep the one-tap random draw with Captains draft as the extra.
Captain setup makes pick order visible and supports manual, Balanced (live
`playerStrength`, never private self-ratings), and random selection. The live draft shows whose pick it is, upcoming snake
order, available players, named teams, the last pick, and crew. A captain can
pick only on their turn; the commissioner can pick for them, undo, confirm
completed teams, or explicitly discard a draft. Other guests follow the draft
and open player cards. Picking and viewing a card have separate targets.
Home and the event sheet open the draft directly, including the captain's
Your pick notification. Brief pick/turn motion follows saved state.

Draft writes carry `draftId`, `pickIndex`, and `draftRevision` from `draftTurn`.
The server validates them and serializes picks; undo increases the revision
even when it returns to an earlier pick index. Preserve legacy unversioned
drafts and acknowledged retries. A shared pending guard blocks duplicate and
conflicting draft actions. Failures keep the draft open for retry; confirming
or discarding closes only after success. Confirmation preserves captain/team
membership and crew, prepares the draw/bracket, and remains preparation;
opening betting or starting play is still what starts the weekend.

The broader systems refactor in `docs/REFOUNDATION.md` remains in scope.
Staging and production already exist; production holds real guest data.
Preserve the tournament/data contract, claims, answers, completion markers,
pending-write guards, and acknowledgement-based check-in. A redesign never
resets guests or requires completed setup again.

**Returning guests first:** Brandon has already shared the current production
app with the full group and most have completed check-in. Focus subsequent
design work on an existing guest returning after an update. Keep FTUX usable
for stragglers, but do not expand it unnecessarily or reset it for a redesign.
Preserve device/claim/completion markers and all existing guest answers.
Brandon may later add questions, activity votes, or restaurant polls. The one
reusable prompt/response feature (`shared/prompts.js`, endpoints under
`/api/prompts` and `/api/admin/prompts`) is separate from onboarding; its
first use is the awards ballot (D6). Its plan is in `docs/REFOUNDATION.md`.

## Core invariants (do not break)

1. **Derived settlement.** Wager outcomes are computed from official results via
   `resolveWager`, never stored. Correcting a result or advancing a bracket
   automatically corrects payouts. Stale drawId/stagesId references void bets.
2. **Server-authoritative.** All validation lives in `worker/actions.js`. The
   client may pre-check for UX but the server decision is final.
3. **Everyone starts with 1,000; PT=100 is the chip quantum.** The board is
   denominated in TOURNAMENT CHIPS from check-in, so the poker finale needs no
   conversion and the app never asks anyone to do arithmetic: the number you
   carried all weekend is the stack you are dealt. Every value in the economy
   (awards, stakes, duel antes, rulings) is a multiple of PT and one rendered
   BankChip = PT = one physical 100 chip. Standings = 1,000 + event awards +
   wager net + rulings, computed fresh from state
   every time. No stored balances.
4. **Current-contest betting:** a free-for-all with more than two sides pays
   2:1 (`OUTRIGHT_MULT`); the current matchup, heat/pool winner, or stage-final
   winner pays 1:1. Any contest with exactly two sides, including a
   two-team game like Volleyball, Flip Cup or 5v5, is a matchup paying 1:1,
   except its underdog's side when the sides opened 1,000 or more apart
   (|average chips per player of A - of B| x the smaller side's size): that
   side pays 2:1 (v3.1, Comebacks
   above). Competitors may back only their own side. Payout copy is always
   "Winner pays 1:1" or "Winner pays 2:1", never "even", said per side when a
   contest carries odds. Every bettor holds one side
   per contest. Every new ticket stores its `mult`; legacy tickets without
   one keep 2:1 (outright) or 1:1 (everything else). The board exposes only that one current contest,
   never every unresolved bracket matchup or an event-wide outright market
   for an event being played as matches or stages. A competitor may optionally
   back themself or their own team in that contest; spectators may back any
   of its sides. Free-for-all choices remain unrestricted. There is no
   automatic wager or required self-bet. Legacy outright and advancement
   tickets keep their original settlement and payout contracts; they are not
   converted to new winner bets. Awards are a ladder by session (Sept 29,
   v2 slate): 1st takes 400/800/1200/1600, 2nd half, 3rd a quarter
   (`AWARDS` keys ARE the legal event values), paid to every player in the
   place. An event may carry its own `pays` (5v5 winners only [800,0,0];
   Rage Cage [1600,1600,400]); `awardTable(ev)` is the one lookup, never
   `AWARDS[ev.value]`. Both of a bracket's semifinal losers take the full
   3rd-place award, and crew (a draw's roles) take it too; `resultAwards` is
   the one derivation every surface reads. The at-risk cap is `maxRisk(pts)` = pts/2 floored to 100s, never
   capped under 500 (`MAX_RISK`), and it bounds duel antes too (accepted duels
   plus your own waiting offer, `duelReserve`) or a duel would be a way around it. Stake <= balance minus at-risk, stakes move in 100s. Betting UX
   is video roulette: a fixed rack (100/200/500/1000, features/wagers/Wagers.jsx `RACK_DENOMS`)
   selects the tap stake and carries the only economy readout, a meter that
   DRAWS the cap instead of narrating it: the bar is your whole stack, the
   notch is `maxRisk`, the gold is your bet exposure, an outlined segment is
   duel antes, anything past the notch after a correction is drawn in the loss
   color, and the gap between them is what is left to bet. When the cap binds,
   + reads "Max N". It stays up when you are maxed out, since that is when
   it explains the most. One fixed readout above the bar says what is left
   ("2,000 to bet") and what is down ("300 in bets"); nothing floats over the bar.
   Tapping + on an eligible side of the current contest adds that chip, with
   its value stamped on its face. Tapping your stack retrieves its last chip.
   Side cards never change size with the bets (Sept 29): every card on a
   board is one fixed height, names one line with ellipsis, the role and
   total in a header row that is always there, the + well pinned top-left,
   every stack's amount on a value line under it, one 10-chip cap everywhere
   with a tower top past it (1,000 / 1,200 / 2,500 read apart). A matchup's
   felt holds two lines of stacks; a board of 3+ sides holds one line (the
   well and two stacks). Past the slots, the smallest fold into one "+N"
   stack; your own stack never folds. On the TV all sides of a board share
   one chip size and the wide board's rows are a fixed height.
   Player identity targets open player cards independently of chip actions.
   TV mode is the constant status: the live scene carries an UP NOW banner and
   gold outline for `nextOpenMatch(br)` (the next seated, undecided matchup,
   also in the ticker and phone live strip), value chips ride the TV bracket
   and board cells, and bracket draw reveals announce first-round matchups.
   A team or heats event is ONE GM tap (`announceAndDraw`), confirmed from a
   crew line prefilled with whoever has sat out least: draw, bracket seed, and
   betting open land in one server write and one broadcast, so every phone
   plays the intro then hands over to the reveal by itself. The announcing
   write stamps `eventOps[ev].announcedAt` (server time; cleared by
   `resetContestSetup` and `clearDraw`), and every phone and the TV time the
   intro, handoff and each card's turn from it on the shared server clock, so
   the room turns cards together and a late screen joins mid-sequence; your
   own card rings in your color. Old states without it time themselves. Drawing before the announcement put matchups on screen
   before anyone knew the game, and a manual close made the GM tap twice. A
   plain `runDraw` for a later event is held, unseen, on every screen until
   that event is announced (`revealReady`).
   The GM pill reads `resolveDirector` (shared/show.js): every beat of the
   weekend is one server action that moves the tournament and points the TV
   in the same write (`announceEvent`, `lockAndStart`, winner scenes inside
   `saveResult`/`pokerResult` via `tryStartScene`, which runs AFTER the
   official write and can only silently skip, never fail it). Scene beats
   exist only when Show Control is on; the chain is identical without them.
   Winner scenes stamp the result revision they played for, so corrections
   mark the scene stale and the director owes a replay at the new revision.
   Win songs (Sept 29, `worker/winSong.js`; stored as
   `profiles[p].walkoutTrack`, shown to guests as "Win song"): after a write
   persists, a recorded contest winner or a posted free-for-all result plays
   the winner's song on the chosen speaker for 30 s (a duo, or a team
   between bracket rounds, plays one member's, drawn by the win's key), the
   crown plays the champion's whole song, and
   a tie plays nothing. The TV's `NowPlaying` card (features/tv/) shows the
   photo chip, name and song. The profile's Win
   song picker (`features/music/`) searches Spotify as you type; a song's
   cover plays its 30-second clip ON THE PHONE (Spotify gives no preview
   audio, so `/api/spotify/preview` finds Deezer's clip by the saved ISRC,
   else title and artist, `worker/previews.js`); the one media element and
   its iOS "playback" session live in `src/lib/sound.js`. The start point is
   a 30-second window dragged on the song's timeline. "Preview 1:05 to 1:35"
   plays exactly that window on the phone in YouTube's own visible player
   (`SnippetPreview.jsx`): `/api/spotify/snippet` finds the song's album
   upload once (`worker/youtube.js`, length within 3 s of Spotify's,
   "- Topic" uploads first, kept in `private:youtube:<trackId>`) and is on
   only with the `YOUTUBE_API_KEY` secret (`capabilities.songSnippets`). The Worker starts it after the
   broadcast, never holding up or failing the write; the walkout record is
   marked `auto` and its alarm pauses the speaker at the clip's end if that
   song still plays; Undo, a correction, a cleared result or unfreezing stops
   it. QA jumps and resets are silent. Brandon accepted the Spotify Developer
   Policy risk of automatic playback (Sept 29). Speaker's "Play win
   songs automatically" switch (`private:spotify:auto`) turns it off. A win
   song starts at silence and fades up to the speaker's own level over 1.5 s
   (six volume calls), fades out over the 3 s before its clip ends (the alarm
   fires then), pauses, and puts the level back (`private:spotify:fade`); a
   Stop or a take-back fades in 1 s; a speaker that refuses volume just
   plays and stops. The room's level is remembered for good
   (`private:spotify:level`, `roomLevel`): a speaker read below 10% is never
   taken as the level, so a restore the speaker refused cannot leave every
   later song at silence (default 70). The TV's NowPlaying card, a compact
   strip top right under the masthead (the towers' tallest stand at the
   left, so it never covers the standings), shows the song's cover with the
   winner's photo chip on its corner, the name, song
   and artist, and a sun bar that runs out with the clip on the server
   clock. In your own 1v1 or free-for-all, Home says "Win and {song} plays"
   (or "Pick a win song", `yourSongLine`); pairs and teams get no line. A
   song that should have played and did not (Spotify unplugged, speaker asleep, refused) writes
   `showControl.audio.miss { player, reason }` and the cue rack shows
   "{Name}'s song didn't play: {reason}" with one-tap Retry
   (`/api/spotify/retry`, the same clip); the next song that plays clears it.
   QA's Sim contest and Finish event play the win's song (jumps stay silent). Every speaker step runs in one queue (`songQueue`), so a
   fade never runs over the next song. The GM has no play chips: the rack
   beside the pill is only Stop while a song plays (manual play stays in
   Speaker), and the chosen speaker persists in
   `private:spotify:device`.
5. **GM auth:** the server-only `env.GM_PIN` Worker secret unlocks once per
   device and mints that device's token (`private:gm:tokens`); GM actions
   require it. Exit GM revokes the device's token, the locker room lists
   commissioner devices with Revoke, and a revoked socket loses the
   commissioner view at once. The earlier shared token stays valid as a legacy
   entry until revoked. The PIN must never enter a
   shared module, client bundle, checked-in vars, or documentation.
6. Identity is a device claim (`claim` action), not auth. Fine for 13 friends.
   Onboarding doubles as the invite, sent months out. `firstOnboardStep()` is
   the ONLY place that decides where it opens, because the install gate (step
   -1) is skipped for standalone and desktop and every entry point (first run,
   GM rerun, local replay) has to agree, or the gate quietly vanishes for
   everyone re-onboarded. After that is one six-step check-in, with one progress
   system and no automatic tab tour: claim a roster spot; get the tournament
   introduction; see `TravelMap` (real lon/lat over a dotted lower-48);
   submit logistics; build the player card; submit private ratings. Detailed
   payouts, wagers, duels and game rules live in Weekend's Rules and Games sections instead of a
   second onboarding chapter. Finishing ratings lands directly on the board.
   Mount the form after the first server snapshot and preserve saved answers.
   A returning guest with no local check-in marker whose claim (or hello)
   already has a saved name, color and ratings lands on Home; replays and
   epoch reruns are never skipped. Once live, flights are optional for a
   straggler and an uncolored guest may make one color claim.
   Claim, details, profile/photo, and ratings steps advance only after explicit
   success acknowledgements. Pending writes freeze edits and navigation;
   failures retain drafts for retry. Profile photos use their existing HTTP
   endpoint and have a 20-second abort deadline. Color/pattern claims keep
   their existing immediate server actions and share the submission guard.
   Logistics reads `state.logistics` via `VenueCard` (`HouseArt` + the
   address + a maps link, and the check-in window INSIDE the same card so those
   times can only be read as the house's; then one travel card pairing the PHX
   row with Brandon's own arrival and departure, since both answer the same
   question. His flight codes stay out: only the times matter to anyone else.
   No listing name and no amenity list, people already know. The real booking ships as `LOGISTICS`
   in core and every read and write runs `cleanLogistics`: a sheet stamped with
   an older `LOGISTICS.v` was written against a booking we no longer have and
   is replaced whole, and at the current edition blanks fall back to what
   shipped and retired keys are dropped, so a GM edit is never clobbered but a
   stale one can never outlive the real address either. Bump `v` when the
   booking actually changes) and writing one T-shirt size + flights. That one
   apparel size is also used for the jersey. Everyone lands Friday and
   leaves Sunday and the flight code already implies the airport, so a leg is
   only `{air,num,time}` (24h off the native picker), validated by `cleanLeg`
   on BOTH sides. `FlightPass` prints a saved leg as a boarding pass;
   `FlightEntry` collects one as three captioned boxes, because pass chrome on
   an empty form reads as already filled in. Legacy free text survives as
   `{note}` and the DO normalises stored legs on load. The explicit yes/no is
   persisted as `flightsBooked`, so "not booked yet" is distinct from no answer.
   Everything the GUEST owes (the Booked-your-flights question, both legs, shirt size) sits inside one
   bordered "Information I need" panel, so the switch from being told things to
   giving things is visible. Then come the player card and private ratings;
   there is no second mechanics carousel or tab-by-tab tour. `rerunOnboarding`
   re-opens the chip race by
   clearing every claimed color/skin, but never once `state.live`. The GM
   travel board lives in the locker room; game-progress resets preserve
   profiles, seeds, logistics, the onboarding epoch, and configured event
   additions/edits/order (zeroing the epoch would kill every rerun). Claims
   and photos are separate Durable Object keys and are not touched.
   Once the invite is out those profiles are real answers Brandon orders
   shirts and plans pickups from, so the QA driver (`simCheckIn`) skips any
   player with a single field set and only fills wholly empty slots. Filling
   one blank with a plausible fake is worse than leaving it blank: nothing
   downstream can tell them apart. `rerunOnboarding` is the one action that
   DOES discard guest input (every chip claim), which is its job, so the
   SERVER refuses it while anyone is checked in unless `force` is passed, and
   hands back `signedUp` so the GM is told exactly who it costs before the
   second tap.
7. **Duels are a weekend thing.** `sendDuel` is refused until `state.live`:
   everyone sits on exactly 1,000 until Friday, which is what the invite
   promises, and the pre-weekend locker room shows no points for a result to
   land on. Play is unrestricted once live. A challenge is an offer: only
   the challenger's ante is held until the recipient (or, for an open
   challenge, the first taker) accepts, which checks their cap then. Runs
   happen only after acceptance. Decline stays available until the recipient
   draws; the sender can withdraw before acceptance. Unanswered offers lapse
   after `DUEL_LAPSE_MS` (10 minutes), derived from the record. Until a duel
   settles, each viewer's frame carries only their own run time
   (`redactDuelsForViewer`).
8. **The poker finale settles on stacks.** There is NO buy-in conversion: the
   board is already in chips, so a stack of 2,900 sits down with 2,900 in front
   of it, dealt in real denominations 25/100/500/1000 (`pokerDenoms`, blind
   pack of eight 25s), blinds 25/50 to 600/1200. Counts are entered in chips
   (multiples of CHIP_MIN=25) and `pokerResult` counts BECOME the standings
   verbatim (chip leader = champion, elimination order breaks 0-count ties).
   `pokerSetup` tops anyone under 600 up to 600 (a "Minimum stack" ruling; a
   negative balance deals as 0) so nobody sits out the finale, requires every
   wager settled or voided first, and voids unplayed duels in the same write,
   so dealt stacks always match the board (`pokerCancel` reverts the Minimum
   stack grants, and is refused once cards are live). Away players are not
   seated; their board total carries as their stack. The deal lays a working
   layer of small chips first and reports tray totals (`pokerInventory`). A
   counted 0 is a bust, a count above the dealt total is refused, and the last
   seat cannot bust. Post-count rulings carry the `pokerRevision` they correct.
   The blind clock stores each level's start and an optional pause. The whole economy freezes while cards are live
   (`pokerLive`) and betting stays CLOSED once counts post (`stacksPosted`):
   no wagers, duels, or on-deck after the finale settles; rulings then move
   in 25s (chip units). Derived and reversible: `clearResult` re-arms the
   table. `POKER_CONFIG` is the explicit contract: 600 minimum, exact 100-chip
   starting stacks, 25-chip final counts, no cap, no silent rounding. Once
   `pokerSetup` deals the board, every non-poker tournament mutation is blocked
   until `pokerCancel`; minimum grants carry table-specific IDs so cancellation
   reverses exactly that table. Setup, start, identical counts, final posting,
   and cancel are retry-safe no-ops.

9. **The event lifecycle is shared and server-guarded.** `eventOps` is the
   metadata map introduced in `v:6` for facts the old domain objects cannot
   express: betting lock, event start, result-entry open, completion, and
   correction history. `resolveEventLifecycle()` and
   `resolveWeekendOperation()` drive both GM and TV. State schema `v:9` adds
   explicit current-contest identity, revision, phase, and correction metadata.
   `resolveCurrentContest()` is the shared authority for the guest board,
   commissioner panel, permitted bets, and server validation. Do not infer a
   separate current match in a view. The sequence is open betting, lock and
   start, record this contest's winner, then atomically open the next contest.
   A heat records its winner separately from its complete qualifying list;
   two-through requires the winner plus one other qualifier. A bracket final's
   winner tap, or a stage final's recorded 1st/2nd/3rd order, posts the event
   result in the same write through `saveResult`; its 10-second Undo reopens
   the final. FFA goes from play to its normal event result entry. New writes carry `contestId` and
   `contestRevision`; reject stale targets and acknowledge identical retries
   without moving twice. Old in-progress events remain readable and preserve
   their draws, tickets, results, and original contracts. Results are revisioned;
   overwrites and clears require a reason, and identical retries are no-ops.
   Commissioners can mark a player Away (`state.away`): they leave draws,
   contest sides, heats and poker seats; chips and profile stay. Short rooms use
   `teamFit`. Only one event is in play at a time: announcing another is
   refused, and the operation ranks the poker table, then the open market, then
   events being played, then a running draft, then slate order. "Play Match N
   next" reorders an empty open market, "Swap in" replaces a player before
   their contest starts without changing the draw id, Skip shelves an unplayed
   event, and once stacks post the only operation is crowning the champion.
   `rerunOnboarding` is refused while live, and `setLive(false)` once any
   event has started. Marking a player Away returns chips on their side of an
   open free-for-all; Swap in returns the incoming player's chips on the other
   side; away players cannot send or accept duels and are not dealt into
   poker (their board total carries, and the champion is the chip leader
   among seats). `takeBackAnnouncement` un-announces an event nothing has
   started in, returning its chips. The event intro is one scene step;
   crowning (`crownChampion`) freezes the board and plays the champion scene
   in the same write; a corrected result owes one "Replay winner" beat with
   Skip. The director pill carries a short verb with its subject on the note
   line, records a live match's winner from its two side buttons, and puts the
   default crew in the note (`features/director/`). Crew earn the 3rd-place
   award.
10. **The wager ledger is duplicate-safe.** State schema `v:7` adds
   `wagerOps`, keyed by device plus action id. The client may retry place and
   retract once using the same action id; the server acknowledges that retry
   without applying it twice. A new tap has a new action id and aggregates
   into the bettor's open record for the same pick. `chips` retains each
   intentional stake so retract removes only the most recent chip. Older
   separate-record wagers remain readable and settle through the same derived
   resolver. The ledger lives under its own storage key and never reaches a
   client; rulings (`adjust`, `removeAdjustment`) share it for retries. Bets on
   a shelved event count as void. When a correction, undo, void or ruling
   leaves a player over min(cap, balance), their newest pending chips and duel
   antes are voided in the same write and recorded on the correction entry.
   One frozen-board guard covers every chip-moving commissioner action; voiding
   a settled bet or duel needs a reason; an event's value cannot change after
   its result; a draw cannot be redrawn or cleared while open bets reference it.
11. **Production rehearsal tools are explicit capabilities.** QA and
   game-progress reset render only when their server capabilities are enabled
   and commissioner mode is unlocked. Reset requires the exact confirmation
   payload and creates one rotating internal pre-reset backup before the clean
   state is published. Production import, restore, and internal-backup recovery
   remain hard disabled. QA quick bets (`qaBets`: everyone / favorite / spread / clear, real wager reducers in one write, commissioner + qa capability, `qaGate` confirmation in production, retry-safe, no backup) sit beside the jumps. QA fast-forward (`qaAdvance`, worker/qa.js, targets in
   shared/qa.js: `locker`, `event:<id>:open|mid|done`, `session:<id>`,
   `poker:set|live|counted`, `crowned`, `step`, `finish`) reaches a point in ONE
   write by running the real reducers on the working copy with synthetic
   player contexts; seeded, no scenes, no Spotify, never fills a touched
   profile and fills none in production. QA checkpoints live in private
   `private:qa:*` keys (never in snapshots, backups or frames); `qaRestore`
   replaces only the game-progress keys a reset clears. Both need the qa
   capability plus a commissioner token, a rewind or restore also needs
   progressReset, both make the rotating pre-reset backup, production always
   needs the reset confirmation (anywhere, discarding results or bets does),
   and live poker cards need `confirmPokerLive`. The console is
   `src/features/qa/`; the slow live driver stays as "Play it live".
12. **Show Control is recoverable presentation state, not tournament truth.**
   (On screen it is the commissioner's "TV" sheet and the audio desk is
   "Speaker"; `showControl`, `audioDirector` and `spotify*` stay the code
   and data names.)
   State schema `v:8` introduced `showControl`. Its active scene and step are
   persisted by the Durable Object, so every TV reconstructs after refresh or
   reconnect. Scenes reference current official events, results, and standings
   instead of copying them. Commissioner commands are capability-gated and
   duplicate-safe; skip, cancel, retry, and a safe ambient fallback are always
   available.
13. **Provider credentials are private infrastructure state.** Spotify client
   credentials are Worker secrets. Application tokens stay in Worker memory;
   GM access and refresh tokens use `private:spotify:*` Durable Object keys.
   Web Push subscriptions (`private:push:subs`, by device id) and the sent
   ledger (`private:push:sent`) are private keys too; the VAPID private key
   is a Worker secret.
   Private keys, GM tokens, and internal backups are excluded from portable
   snapshots. Clients never receive raw state: every socket gets a
   `publicState` projection (worker/publicState.js). Ratings go to the GM and
   their owner, sizes and flights to the GM and their owner, device ids and
   replay keys to nobody; the TV route and unclaimed devices get the public
   view. A socket is bound to the device id of its hello. Tournament state may contain only validated public walkout-track
   metadata, and Show Control never depends on playback success.
14. **Recorded-contest correction is explicit and guarded.**
   Recorded contests stack in `eventOps[ev].contestStack`; `correctContest`
   corrects any of them ("Fix Play-in 1"), rewinding every contest recorded
   after it, and `contestCorrections()` / `contestUndoAvailability()` supply
   eligibility plus a preview computed by running the correction on a copy.
   Rewound and next-market chips and any duel voided for exposure are named in
   the confirm ("Returns Evan 200. Voids Jeremy vs Ben duel."). The winner tap
   offers a 10-second Undo (`UNDO_WINDOW_MS`, the pill; WON stamps on the winner as the write lands). Post-count poker rulings apply only to the count
   revision they were made against. Correction is unavailable after the
   event result posts, while frozen, during the finale, or while another
   event's betting market is open. Restore the previous contest for winner
   entry with betting still locked and a fresh revision. Derived settlement
   reverses the old winner's effects; never erase the next market's wagers
   without naming them, or reopen the corrected contest for fresh bets.

## Commands

- `npm run dev` - vite dev server with the Worker + DO running locally (workerd)
- `npm run build` - production build
- `npm run build:staging` - staging-mode build without deployment
- `npm run deploy` - refuses; the operator must name a target
- `npm run deploy:staging` - creates/updates the isolated staging Worker; approval required
- `npm run deploy:production` - updates the existing live Worker; approval and snapshot required
- `npm run tail` - live production logs; approval required
- `npm run test` - state, action, snapshot, compatibility, and real component
  handler checks, including current-contest sequencing, wagers, and correction
- `npm run test:e2e` - full game loop over two local WebSocket clients (dev
  server must be running; production URLs are rejected; resets local state)
- `npm run snapshot:validate -- <file>` - offline, read-only snapshot validation
- QA console (commissioner, QA mode): "Jump to" any event's Open/Mid/Done, a
  session's end, the poker stages or Crowned in one write (crowned from empty
  runs in well under 100 ms); "Sim contest" and "Finish event" step the
  current event; checkpoints save and restore game progress.
- `/dev/contest-preview.html` - local development rehearsal using actual
  Wagers, ContestPanel, player cards, and `applyAction` against sample state in
  memory. Includes FFA, a six-team bracket, two-through heats plus final, and
  an existing mid-event scenario; switch guest/commissioner/player and simulate
  failed acknowledgements. No WebSocket, persistent storage, or remote data.

The September 29-30 pass (win songs with fades and the Win song picker with
on-phone clips and exact-snippet preview, team MVP, the v2 slate and payout
ladder, the fixed-shape bets board, one-tap two-team results, the constellation
redraw, folded Events sessions, the removal of To the TV) is deployed to
staging as version `6dba00cb-262e-484c-96ab-b81c93f5c208` (tag
`staging-6dba00cb`): 745 tests pass. On Sept 30 the same code (commit
`8612ad5`, the local e2e passing) went to PRODUCTION as version
`1c796397-98d5-46da-b2eb-747cb56011db` (tag `production-1c796397`), after a
validated production snapshot (sha256 `60d0ca2e…`, kept outside the repo)
was rehearsed against it in memory: 13 profiles, 40 claims, 12 of 13
checked in, 8 photos, no game progress. Production's audio flags, Spotify,
YouTube and VAPID secrets were then turned on (version
`a958acac-3f26-4b34-848c-d0351d318522`). Roll back with `npx wrangler
rollback eb1e908c-0c6d-4154-9c33-a21ee19ce1ed` (the August code). The
previous staging build is tag `staging-7fc924d6` (the September 28 Living Field
Day pass on the September 27 second pass: 714 tests and the 139-check local
e2e, build `dfc4776`, adding awards night, the kept weekend, Table view, your
path after the draw and the photo desk); before it, `staging-dd7d02c5` and
`staging-7c2c9f15`. The first
production deploy after it migrates `wagerOps` to its own storage key on the
next write: take a snapshot first. See `docs/UX-REPAIR.md` for
the browser checks and separate historical records. The isolated actual-sheet
preview is `/dev/efficiency-preview.html` (`?scenario=` any id, including
`crowd-match|ffa|team|heat` where every guest bets); `/dev/tv-preview.html`
renders the real TV mode over the same fixtures at 1920x1080, and
`/dev/phone-frame.html?src=...` holds a page in a true 390px viewport for
headless screenshots (Chrome's window will not go below ~500px); rebuild its transport-stubbed
component bundle with `node scripts/build-efficiency-preview.mjs` after UI
edits. This preview never connects to the tournament and is not deployed.

## Copy and design taste (Brandon's rules)

- Terse, direct copy. No corny names, no exclamation-mark energy, NEVER em dashes.
  No reassuring filler lines (Brandon hates "Yours all weekend once the board
  goes live" and everything like it): copy states a fact or gets deleted.
- HOW BRANDON EDITS COPY, learned from every pass so far. Apply these before
  he has to ask again:
  - Say the mechanic, not a description of it. "Whatever you have Saturday
    night is the stack you start the finale with" beats "your number is the
    stack you sit down with".
  - Cut anything self-evident. He deleted "nothing resets between days",
    "Everyone starts gray", and "so play the whole weekend for points" because
    a reader already knows. Watch for the shape: a clause starting "so ..."
    that only restates the point of the sentence before it.
  - Never restate a mechanic with a worked example. "Your points are the stack
    you are dealt" does not need "No conversion: 2,900 on the board is 2,900 in
    front of you" after it. Say it once.
  - Cut reassurance and atmosphere tails: "The board tracks it", "The room
    keeps time", "Nobody sees this".
  - One idea per line. When a sentence carries a rule AND a rationale, keep
    the rule and drop the rationale.
  - No jokes or asides, dry or otherwise. If the UI already shows it, don't
    write it: no "Tap + to add", no captions restating a heading, no confirm
    body that repeats its button. Payouts read "Winner pays 1:1".
  - A first-run flow gets one progress system and one finish line. Put deeper
    mechanics in Weekend's Rules section instead of making a completed check-in continue.
  - Ask questions outright with equal answers instead of hiding the alternative
    in a link ("Booked your flights? Yes / Not yet").
  - Headings carry the message, bodies carry the detail ("Thank you for flying
    in for this", then the cities).
- NO borrowed casino/sports idiom. Brandon cut "half your stack can ride" as
  corny, and the same pass removed "cashed", "the book", "shuffle up and deal",
  "table stakes", "the whiteboard", "points are on the table", "sealed scouting
  report". Label things with numbers or with what they are. The real NAMES of
  real things stay (blinds, bust, stack, chips, draw, heats, on deck): those
  are what the objects are called, not flavor.
- Every chip skin is an EDGE treatment and the middle is drawn last, so no
  design can eat it. A chip that stands for a person carries their saved
  profile photo there (a portrait medallion, 24px and up), else their number;
  the skin rack previews the photo, or the number being typed. A chip that
  stands for a value (a bet denomination, a stack's total, a poker level)
  keeps its number, and the player card keeps the jersey number beside the
  big photo.
- Where a number came from is drawn, not narrated: standings rows carry
  `StatPills` (cup for wins, chip for the book, bolt for duels, plus your live
  exposure), and only nonzero pills render so a fresh board is names and
  numbers. Chip identity is 30 colors, first come first serve, times 12 edge
  skins; half of those are deliberately loud (saw, flame, star, bolt, wave,
  crown) but all stay flat, one ink, and clear of the number in the middle.
- Field Day look (superseded Oct 2 by DESIGN.md's Backglass; kept as history):
  sun-faded rec-tournament at night, championship seriousness.
  FULL DARK: near-black surfaces tinted by session (bg/paper/paper2, the night
  ramp aliases them; TH1), --ink is
  the primary TEXT color (bone), --ink0 is the absolute brown-black reserved
  for marks, poker chips, and anything sitting on sun. Barlow Condensed
  display for scores/ranks/event names, Inter for everything functional, no
  serif (fonts load in index.html, never via CSS import). Semantic tokens in
  `src/ui/experience.css` (:root and its data-phase blocks) are the only color source: no raw hex outside :root and
  PLAYER_COLORS, tints via the --*-tint tokens, shadows via --shadow-1/2/3
  (deep, tinted per session, never pure black), radii 6/10/14/16/99. Phase
  line (--phase): pool (Fri), sun (Sat AM), terracotta (Sat PM), coral clay
  (Sat night), sun (Finale).
  Flat scorecard components, chip identity for players (30 claimable colors
  plus 6 edge-tick skins, first come first serve, gray until claimed, locked
  once the weekend goes live except one first claim by a still-gray straggler), subtle grain (screen blend). The mark is the FD chip: a sun-gold betting chip with bone
  edge inserts and a lit glass window with the desert sun setting (Oct 2, `src/ui/fdMark.js`); scripts/icons.mjs regenerates the
  PWA icons from the same geometry. The staging PWA keeps that mark but uses
  an electric-blue palette and an explicit STG badge, with its own manifest
  and Apple touch icon. No emojis as final artwork, no gradients, no glows,
  no luxury conventions.
- Real names in all commissioner controls. Fun is for reveals, not for admin.
- The app should reduce mental load during the weekend, not add process.

## What the guests give you

Onboarding collects exactly what a per-player box needs: display name, player
number, one T-shirt size (also used for the jersey), chip color and skin, photo,
flight-booking status, and both flight legs. `sheetText` turns all of it into tab-separated text behind "Copy sheet"
on the GM travel board, because ordering happens in a spreadsheet or a
supplier form, not on a phone. Blanks stay blank there on purpose.

Since Sept 30 (`shared/guestSetup.js`) the profile also has a Jersey section
and three trip answers, asked of returning guests rather than added to
check-in. The jersey (`features/jersey/`) draws the back as it will print:
`backName` (12 letters, uppercase, public; until set it is the display name
made legal, `jerseyName`), the number and the size on the collar tag.
"Confirm jersey" (`saveProfile` with `confirmJersey`) pins the back name and
stores the confirmed triple as `jerseyOk`, so changing any of the three reads
as unconfirmed with nothing to clear. The commissioner's "Jerseys ordered"
switch on the travel board (`lockJerseys`, `state.jerseysLocked`, kept by a
progress reset) refuses guests' changes to name, number and size. Trip adds
Venmo (`venmo`, no @), "Drinking this weekend?" (`drinking`; four games are
drinking games, and a drink menu would just be a Costco list) and optional
food or drink needs (`needs`); all three and `jerseyOk` are private like size
and flights. Before the weekend Home lists what a guest still owes
(`setupTodo`: chip color, photo, jersey, booked-but-missing flights, Venmo
and drinks, a win song when the picker is on), each row opening its profile
section; the sheet and the travel board carry every new field.

## The domain

`fielddayseries.com` is served by the Worker as a Cloudflare custom domain
(`routes` in `wrangler.jsonc`), and is the default `SITE_URL` that
`vite.config.js` stamps into the OG/Twitter tags. Deploying REQUIRES the zone
to be active on the same Cloudflare account: wrangler adds the DNS record, it
cannot add the zone. `SITE_URL=https://... npm run build` still overrides for
a preview.

## Sending the invite

`index.html` carries the OG/Twitter card and `public/share.png` is generated by
`scripts/icons.mjs` from the same chip geometry, so a pasted link never arrives
as a bare URL. The absolute URL comes from `SITE_URL`, which defaults to the live domain.

## Adding an event later

Add a `BUILTIN_EVENTS` entry in `shared/core.js` (id, session, value, kind,
sport, `game`, teamCfg if teams), or use the GM add-event flow for one-offs
(its "Looks like" picker borrows a known game's mark, intro and how-to; an
in-app game's, Karaoke's, is never offered: `GAME_MARK_IDS`). Give the
`game` id a `GAMES` howto (core) and its drawn steps (`features/rules/`:
`STEP_SETS`, `rulesWords.js`, `RulePictures.jsx`), a `MARKS` icon
(`ui/GameMark.jsx`) and an intro: its `INTRO_SCENES` key
(`intro/introTiming.js`), its `SCENES` diorama (`IntroScenes.jsx`) and its
`INTRO_FOLEY` (`lib/soundKit.js`); the tests require all of them for a
built-in. Every surface (schedule, strips, sheets, betting band, event intro,
TV) reads those registries; anything missing falls back to the GameMark,
then the FD chip. A built-in added after a Reorder was saved has no place in
the stored `eventOrder` and sorts last: give it one on hydration as
`worker/state.js` `placeKaraoke` does. The cup lays each session's plaques
in rows of three at most (`weekend/trophy.js` `cupRows`).

## Backlog

- [ ] Brandon's feature notes (pending, ask him)
- [x] PWA manifest + icons + add-to-home-screen flow (install gate opens onboarding)
- [x] E2E test: tests/e2e.mjs, full loop over WebSocket
- [x] Awards voting Saturday night: D6 ballots, TV reveal (honors only)
- [ ] Sudden-death pressure putt flow for championship ties
- [ ] Odds tuning option: payout scaling by field size
- [ ] Photo optimization (resize server-side, R2 if state grows)
- [x] Web Push pocket alerts: You're playing, Your pick, challenges (installed PWAs, iOS 16.4+)
- [ ] Service worker offline shell (installed PWA currently needs network to boot)
