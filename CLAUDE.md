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
3. **Everyone starts with 5 points.** Standings = 5 + event awards + wager net
   + rulings, computed fresh from state every time. No stored balances.
4. **Payouts:** outright winner pays 2:1 (`OUTRIGHT_MULT`); matchups, heat/pool
   advancement, and stage finals pay even. Cap: max 3 at risk, stake <= balance
   minus at-risk, stakes 1-3.
5. **GM auth:** pin (in `shared/core.js`, GM_PIN) unlocks once and mints a
   server-held token; GM actions require it.
6. Identity is a device claim (`claim` action), not auth. Fine for 13 friends.

## Commands

- `npm run dev` - vite dev server with the Worker + DO running locally (workerd)
- `npm run build` - production build
- `npm run deploy` - build + `wrangler deploy` (needs `wrangler login` once)
- `npm run tail` - live production logs
- `npm run test:e2e` - full game loop over two WebSocket clients (dev server must
  be running; `WS_BASE=wss://.../ws` targets prod; resets the board when done)

## Copy and design taste (Brandon's rules)

- Terse, direct copy. No corny names, no exclamation-mark energy, NEVER em dashes.
- Field Day look: sun-faded rec-tournament, treated with championship seriousness.
  Barlow Condensed display for scores/ranks/event names, Archivo for everything
  functional, no serif (fonts load in index.html, never via CSS import). Light
  bone paper content framed by warm-night CHROME (header, tab bar, sheet title
  bands, toasts); night also carries reveals, champion, and TV. Semantic tokens
  in `Shell` (:root) are the only color source: no raw hex outside :root and
  PLAYER_COLORS, tints via the --*-tint tokens, shadows via --shadow-1/2/3
  (warm ink, never black), radii 6/10/14/16/99. Phase palette: pool (Fri), sun
  (Sat AM), terracotta (Sat PM), clay (Sat night), night (Finale). Flat
  scorecard components, 13 curated flat player colors, subtle grain only. The
  mark is the FD crest (sun roundel, italic FD); scripts/icons.mjs regenerates
  the PWA icons from it. No emojis as final artwork, no gradients, no glows,
  no luxury conventions.
- Real names in all commissioner controls. Fun is for reveals, not for admin.
- The app should reduce mental load during the weekend, not add process.

## Backlog

- [ ] Brandon's feature notes (pending, ask him)
- [x] PWA manifest + icons + add-to-home-screen flow (install gate opens onboarding)
- [x] E2E test: tests/e2e.mjs, full loop over WebSocket
- [ ] Awards voting Saturday night (Fraud of the Weekend, etc.)
- [ ] Sudden-death pressure putt flow for championship ties
- [ ] Odds tuning option: payout scaling by field size
- [ ] Photo optimization (resize server-side, R2 if state grows)
- [ ] Web Push for betting-open and results (installed PWAs, iOS 16.4+)
