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
   capped under 500 (`MAX_RISK`). Stake <= balance minus at-risk, stakes move in 100s. Betting UX
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
5. **GM auth:** pin (in `shared/core.js`, GM_PIN) unlocks once and mints a
   server-held token; GM actions require it.
6. Identity is a device claim (`claim` action), not auth. Fine for 13 friends.
   Onboarding doubles as the invite, sent months out: install, check in, the
   announcement (sessions show "N events · V each", never a block total), the
   travel map (`TravelMap`, real lon/lat over a dotted lower-48), then
   logistics reading `state.logistics` via `VenueCard` (`HouseArt` + the
   address + a maps link, check-in/checkout, host flights; no listing name and
   no amenity list, people already know. The real booking ships as `LOGISTICS`
   in core and every read and write runs `cleanLogistics`: a sheet stamped with
   an older `LOGISTICS.v` was written against a booking we no longer have and
   is replaced whole, and at the current edition blanks fall back to what
   shipped and retired keys are dropped, so a GM edit is never clobbered but a
   stale one can never outlive the real address either. Bump `v` when the
   booking actually changes) and writing shirt size + flights. Everyone lands Friday and
   leaves Sunday and the flight code already implies the airport, so a leg is
   only `{air,num,time}` (24h off the native picker), validated by `cleanLeg`
   on BOTH sides. One component reads AND writes a leg: `FlightPass` puts the
   inputs exactly where the values print, so there is no form-then-preview
   (`LegField` only adds the label and Clear). Legacy free text survives as
   `{note}` and the DO normalises stored legs on load. Then profile, seeds, and three closing cards that land
   one story: your number IS your poker stack (literally, not converted), and
   the champion takes home a real trophy (`TrophyHero`, flat blades revolved on the Y axis, plate
   engraved on both faces). `rerunOnboarding` re-opens the chip race by
   clearing every claimed color/skin, but never once `state.live`. The GM
   travel board lives in the locker room; resets preserve profiles, seeds,
   logistics, AND the onboarding epoch (zeroing it would kill every rerun).
7. **The poker finale settles on stacks.** There is NO buy-in conversion: the
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
- `npm run deploy` - build + `wrangler deploy` (needs `wrangler login` once)
- `npm run tail` - live production logs
- `npm run test:e2e` - full game loop over two WebSocket clients (dev server must
  be running; `WS_BASE=wss://.../ws` targets prod; resets the board when done)

## Copy and design taste (Brandon's rules)

- Terse, direct copy. No corny names, no exclamation-mark energy, NEVER em dashes.
  No reassuring filler lines (Brandon hates "Yours all weekend once the board
  goes live" and everything like it): copy states a fact or gets deleted.
- NO borrowed casino/sports idiom. Brandon cut "half your stack can ride" as
  corny, and the same pass removed "cashed", "the book", "shuffle up and deal",
  "table stakes", "the whiteboard", "points are on the table", "sealed scouting
  report". Label things with numbers or with what they are. The real NAMES of
  real things stay (blinds, bust, stack, chips, draw, heats, on deck): those
  are what the objects are called, not flavor.
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
  PWA icons from the same geometry, no fonts needed. No emojis as final
  artwork, no gradients, no glows, no luxury conventions.
- Real names in all commissioner controls. Fun is for reveals, not for admin.
- The app should reduce mental load during the weekend, not add process.

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
