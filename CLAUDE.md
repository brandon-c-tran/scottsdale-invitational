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
  standings, draws, brackets, stages). Imported by BOTH the DO and the React app.
  Never fork this logic. If client and server disagree, the server is right.
- **`worker/actions.js`**: every mutation, validated server-side (GM auth, wager
  caps/balance, stale draw/stage references). Add new mutations here, never as
  client-side state writes.
- **`src/App.jsx`**: the entire UI (deliberately one file for now). `src/lib/client.js`
  is the transport: reconnecting WS, promise-based `dispatch`, device identity.

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
   wager net + rulings, computed fresh from state every time. No stored
   balances.
4. **Payouts:** outright winner pays 2:1 (`OUTRIGHT_MULT`); matchups, heat/pool
   advancement, and stage finals pay even. Awards pay 400/800/1200/1600 by
   session (`AWARDS` keys ARE the legal event values) so winning games outweighs
   betting. The at-risk cap is `maxRisk(pts)` = pts/2 floored to 100s, never
   capped under 500 (`MAX_RISK`), and it bounds duel antes too or a duel would
   be a way around it. Stake <= balance minus at-risk, stakes move in 100s. Betting UX
   is video roulette: a fixed rack (100/200/500/1000, App.jsx `RACK_DENOMS`)
   selects the tap stake and carries the only economy readout, a meter that
   DRAWS the cap instead of narrating it: the bar is your whole stack, the
   notch is `maxRisk`, the gold is your exposure, and the gap between them is
   what is left to bet. It stays up when you are maxed out, since that is when
   it explains the most, and it is labelled with numbers, never a phrase.
   Tapping any pick or open bracket side drops
   that chip, value stamped on its face, your ✕ pulls the last one back.
   TV mode is the constant status: the live scene carries an UP NOW banner and
   gold outline for `nextOpenMatch(br)` (the next seated, undecided matchup,
   also in the ticker and phone live strip), value chips ride the TV bracket
   and board cells, and bracket draw reveals announce first-round matchups.
   A team event is ONE GM tap ("Announce and draw"): on deck goes out, the
   draw follows, and the phone plays the intro then hands over to the reveal
   by itself after `INTRO_HOLD`. Drawing before the announcement put matchups
   on screen before anyone knew the game, and a manual close made the GM tap
   twice.
5. **GM auth:** pin (in `shared/core.js`, GM_PIN) unlocks once and mints a
   server-held token; GM actions require it.
6. Identity is a device claim (`claim` action), not auth. Fine for 13 friends.
   Onboarding doubles as the invite, sent months out. `firstOnboardStep()` is
   the ONLY place that decides where it opens, because the install gate (step
   -1) is skipped for standalone and desktop and every entry point (first run,
   GM rerun, local replay) has to agree, or the gate quietly vanishes for
   everyone re-onboarded. After that is one five-step check-in, with one progress
   system and no automatic tab tour: claim a roster spot; get the tournament
   reveal and `TravelMap` (real lon/lat over a dotted lower-48) on one screen;
   submit logistics; build the player card; submit private ratings. Detailed
   payouts, wagers, duels and game rules live in the Rules tab instead of a
   second onboarding chapter. Finishing ratings lands directly on the board.
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
   travel board lives in the locker room; resets preserve profiles, seeds,
   logistics, AND the onboarding epoch (zeroing it would kill every rerun).
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
   land on. Play is unrestricted once live.
8. **The poker finale settles on stacks.** There is NO buy-in conversion: the
   board is already in chips, so a stack of 2,900 sits down with 2,900 in front
   of it, dealt in real denominations 25/100/500/1000 (`pokerDenoms`, blind
   pack of eight 25s), blinds 25/50 to 600/1200. Counts are entered in chips
   (multiples of CHIP_MIN=25) and `pokerResult` counts BECOME the standings
   verbatim (chip leader = champion, elimination order breaks 0-count ties).
   `pokerSetup` tops anyone under 600 up to 600 (a "Minimum stack" ruling) so
   nobody sits out the finale, and requires every wager and duel settled or
   voided first so dealt stacks always match the board (`pokerCancel` reverts
   the Minimum stack grants). The whole economy freezes while cards are live
   (`pokerLive`) and betting stays CLOSED once counts post (`stacksPosted`):
   no wagers, duels, or on-deck after the finale settles; rulings then move
   in 25s (chip units). Derived and reversible: `clearResult` re-arms the
   table.

## Commands

- `npm run dev` - vite dev server with the Worker + DO running locally (workerd)
- `npm run build` - production build
- `npm run build:staging` - staging-mode build without deployment
- `npm run deploy` - refuses; the operator must name a target
- `npm run deploy:staging` - creates/updates the isolated staging Worker; approval required
- `npm run deploy:production` - updates the existing live Worker; approval and snapshot required
- `npm run tail` - live production logs; approval required
- `npm run test` - M1 snapshot, roster, participation, and compatibility checks
- `npm run test:e2e` - full game loop over two local WebSocket clients (dev
  server must be running; production URLs are rejected; resets local state)
- `npm run snapshot:validate -- <file>` - offline, read-only snapshot validation

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
    the rule and drop the rationale, unless the rationale is the joke.
  - A dry aside is welcome where a rule sounds arbitrary ("to limit the damage
    of one bad decision, only half your points can be at risk"). Dry, never
    zany.
  - A first-run flow gets one progress system and one finish line. Put deeper
    mechanics in the Rules tab instead of making a completed check-in continue.
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
- Every chip skin is an EDGE treatment and the stamp in the middle is drawn
  last, over a halo of the chip's own colour, so no design can eat the jersey
  number. The skin rack previews the number being typed, not the saved one.
- Where a number came from is drawn, not narrated: standings rows carry
  `StatPills` (cup for wins, chip for the book, bolt for duels, plus your live
  exposure), and only nonzero pills render so a fresh board is names and
  numbers. Chip identity is 30 colors, first come first serve, times 12 edge
  skins; half of those are deliberately loud (saw, flame, star, bolt, wave,
  crown) but all stay flat, one ink, and clear of the number in the middle.
- Field Day look: sun-faded rec-tournament at night, championship seriousness.
  FULL DARK: warm near-black surfaces (bg/paper/paper2 night ramp), --ink is
  the primary TEXT color (bone), --ink0 is the absolute brown-black reserved
  for marks, poker chips, and anything sitting on sun. Barlow Condensed
  display for scores/ranks/event names, Inter for everything functional, no
  serif (fonts load in index.html, never via CSS import). Semantic tokens in
  `Shell` (:root) are the only color source: no raw hex outside :root and
  PLAYER_COLORS, tints via the --*-tint tokens, shadows via --shadow-1/2/3
  (deep warm, never pure black), radii 6/10/14/16/99. Phase palette: pool
  (Fri), sun (Sat AM), terracotta (Sat PM), clay (Sat night), night (Finale).
  Flat scorecard components, chip identity for players (30 claimable colors
  plus 6 edge-tick skins, first come first serve, gray until claimed, locked
  once the weekend goes live), subtle grain (screen blend). The mark is the FD chip: a sun-gold betting chip with bone
  edge ticks and a geometric sun at center; scripts/icons.mjs regenerates the
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
(its "Looks like" picker borrows a known game's mark, hero, and how-to).
Optionally give the `game` id a `GAMES` howto (core), a `MARKS` icon and a
`GAME_HEROES` animation (App.jsx). Every surface (schedule, strips, sheets,
betting band, event intro, TV) reads those registries; anything missing falls
back to the GameMark, then the FD chip. Nothing else to wire.

## Backlog

- [ ] Brandon's feature notes (pending, ask him)
- [x] PWA manifest + icons + add-to-home-screen flow (install gate opens onboarding)
- [x] E2E test: tests/e2e.mjs, full loop over WebSocket
- [ ] Awards voting Saturday night (Fraud of the Weekend, etc.)
- [ ] Sudden-death pressure putt flow for championship ties
- [ ] Odds tuning option: payout scaling by field size
- [ ] Photo optimization (resize server-side, R2 if state grows)
- [ ] Web Push for betting-open and results (installed PWAs, iOS 16.4+)
- [ ] Service worker offline shell (installed PWA currently needs network to boot)
