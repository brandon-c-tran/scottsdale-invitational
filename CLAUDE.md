# Field Day (Scottsdale · 2026)

Companion app for a 13-player bachelor party game weekend (Oct 16-18, 2026).
One leaderboard, live wagers, GM-run draws/brackets/heats, TV mode. Built to be
glanced at for ten seconds, not stared at. "Field Day" is the enduring event
identity; "Scottsdale · 2026" is this edition (future: Tahoe · 2027, etc).

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
3. **Everyone starts with 100 points; PT=20 is the chip quantum.** Every value
   in the economy (awards, stakes, duel antes, rulings) is a multiple of PT and
   one rendered BankChip = PT = one physical chip. Standings = 100 + event
   awards + wager net + rulings, computed fresh from state every time. No
   stored balances.
4. **Payouts:** outright winner pays 2:1 (`OUTRIGHT_MULT`); matchups, heat/pool
   advancement, and stage finals pay even. Awards pay 40/80/120/160 by session
   (`AWARDS` keys ARE the legal event values) so winning games outweighs betting.
   The at-risk cap SCALES: `maxRisk(pts)` = a quarter of your points floored to
   20s, never under 60 (`MAX_RISK`). Stake <= balance minus at-risk, stakes move
   in 20s. Betting UX is video roulette: a fixed rack (20/60/100 chips, App.jsx
   `RACK_DENOMS`) selects the tap stake; tapping any pick or open bracket side
   drops that chip, value stamped on its face, your ✕ pulls the last one back.
   TV mode is the constant status: the live scene carries an UP NOW banner and
   gold outline for `nextOpenMatch(br)` (the next seated, undecided matchup,
   also in the ticker and phone live strip), value chips ride the TV bracket
   and board cells, and bracket draw reveals announce first-round matchups.
5. **GM auth:** pin (in `shared/core.js`, GM_PIN) unlocks once and mints a
   server-held token; GM actions require it.
6. Identity is a device claim (`claim` action), not auth. Fine for 13 friends.
   Onboarding doubles as the invite, sent months out: install, check in, the
   announcement, then a logistics step that reads `state.logistics` (venue +
   host travel, GM-written once via `saveLogistics`) and writes shirt size and
   `flightIn`/`flightOut` to the profile. The GM travel board lives in the
   locker room; resets preserve profiles, seeds, AND logistics.
7. **The poker finale settles on stacks.** At the buy-in points ADD A ZERO:
   `pokerChips(pts)` = pts x CHIP_X(10), dealt in real denominations
   25/100/500/1000 (`pokerDenoms`, blind pack of eight 25s), blinds 25/50 to
   600/1200. Counts are entered in chips (multiples of CHIP_MIN=25) and
   `pokerResult` counts BECOME the standings verbatim (chip leader = champion,
   elimination order breaks 0-count ties). `pokerSetup` stakes anyone under 60
   up to 60 (a "Table stakes" ruling) so nobody rails the finale, and requires
   a clean book so dealt stacks always match the board (`pokerCancel` reverts
   the Table stakes grants). The whole economy freezes while cards are live
   (`pokerLive`) and the book stays CLOSED once counts post (`stacksPosted`):
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
