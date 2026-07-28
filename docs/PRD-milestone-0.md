# Field Day — Milestone 0 PRD (retrospective)

**Product:** Field Day · Scottsdale 2026
**Edition:** October 30 to November 1, 2026 (13 players, Scottsdale AZ)
**Status:** Shipped. Deployed to `https://fielddayseries.com`, invite distributed,
real onboarding data landing now.
**Document type:** Retrospective PRD. Written after the build, to freeze what M0
actually is so M1 and M2 can be scoped against a known baseline.
**Author of record:** Brandon Tran (product, design, copy)
**Last updated:** July 2026 (commit `dddc602`)

---

## 0. TL;DR

Field Day is a companion app for a 13-person bachelor party run as a real
tournament: 17 scored games across a Friday-to-Sunday weekend, one leaderboard,
a live betting market, phone-to-phone duels, and a poker finale where your
accumulated points are literally the chips you're dealt.

M0 shipped the entire loop end to end — invite, check-in, identity, schedule,
draws, brackets, group stages, snake drafts, wagering, duels, poker finale,
TV mode, and a full commissioner console — on a Cloudflare Worker with a single
Durable Object as the sole writer. It is ~9,500 lines across 8 source files and
45 server actions. Nothing is stubbed; nothing is mocked.

The one thing M0 deliberately did **not** solve is being run in anger with 13
real people on flaky venue wifi. That is what M1 and M2 are for.

---

## 1. Context and problem

A 13-person bachelor party weekend with a scored competition has a predictable
failure mode: the scorekeeping becomes a second job. Someone maintains a group
chat, someone else maintains a note, the bets are honor-system and half of them
are forgotten by Saturday night, and nobody can tell you the standings without a
two-minute reconstruction.

The specific problems M0 set out to kill:

| Problem | M0 answer |
|---|---|
| Nobody agrees on the score | One server-authoritative board, computed fresh from events |
| Side bets get lost or disputed | Wagers are recorded and settle themselves off official results |
| Correcting a result breaks all the math | Settlement is **derived**, never stored — fix the result, payouts fix themselves |
| Logistics chased over text for weeks | Check-in collects shirt size and both flight legs, exportable as a sheet |
| The GM spends the weekend on their phone | GM flow is one "next thing" button; a team event is a single tap |
| Nothing to look at in the house | TV mode: a cycling broadcast channel on any screen with a browser |
| Points feel abstract by Sunday | The poker finale converts the whole weekend into a physical stack, 1:1 |

Secondary goal, and the reason the invite shipped in July for an October party:
the app **is** the invite. Onboarding is how people find out what the weekend is.

---

## 2. Goals and non-goals

### M0 goals (all met)

1. **One number everyone trusts.** A single leaderboard that is never wrong and
   never needs manual reconciliation.
2. **Zero arithmetic asked of a guest.** No conversions, no "your 145 points
   become 2,900 chips." The board is denominated in tournament chips from
   check-in.
3. **Ten-second glances.** Every screen answers a question in one look. This is
   a phone you check between games, not an app you sit inside.
4. **The invite doubles as onboarding.** Send a link months out; the recipient
   learns the format, claims an identity, and hands over logistics in ~2 minutes.
5. **The GM runs the weekend from one button.** Announce, draw, open betting,
   post result, advance — no admin form-filling mid-party.
6. **Correctable without consequence.** Any result can be re-entered and the
   entire economy re-settles, because nothing downstream is stored.
7. **Physical continuity.** The finale is played with real cards and real chips;
   the app runs the table, not the game.

### M0 non-goals (deliberate)

- **Accounts, passwords, or real auth.** Identity is a device claim. 13 friends.
- **Multi-tournament / multi-tenant.** One Durable Object named `main`.
- **Offline play.** The app needs a network to boot (see §14 risks).
- **Real money.** Points are points. There is no cash-out anywhere in the model.
- **Native apps.** PWA only.
- **Push notifications.** In-app toasts only.
- **Automated result capture.** Humans post results; the app does the math.
- **Historical editions.** No archive, no season view. `EDITION` exists so a
  future Tahoe · 2027 can reuse the code, but M0 stores one weekend.

---

## 3. Users and roles

### 3.1 Guest (12 of 13)
Claims a roster spot from a phone. Completes check-in. Then, all weekend: reads
the board, places wagers when betting is open, sends and plays duels, watches
draws and reveals, and counts their own chips at the finale.

**Auth model:** none. A `deviceId` (UUID in localStorage) is mapped to a roster
name by the `claim` action, server-side. Losing the device loses the claim; the
GM can re-point it. This is a correct tradeoff for 13 people who are in the same
house.

### 3.2 GM / Commissioner (Brandon)
Unlocks with a 4-digit PIN, which mints a server-held token stored per device.
Runs the schedule, executes draws, posts results, advances brackets, voids bets,
issues rulings, drives the poker finale, and freezes the board to crown a
champion.

**Design rule:** commissioner surfaces use real names and plain labels. Fun is
for reveals, not admin.

### 3.3 TV (an unattended screen)
`/tv` renders a full-bleed broadcast view with no controls, meant for a laptop
plugged into the house TV. It cycles scenes on a timer and carries a ticker. It
is a read-only client of the same WebSocket state.

---

## 4. Architecture

```
                     ┌──────────────────────────────┐
   phone (PWA) ──ws──┤                              │
   phone (PWA) ──ws──┤   Durable Object "main"      │
   phone (PWA) ──ws──┤   - single-threaded writer   │
   TV (/tv)    ──ws──┤   - applyAction() validates  │
                     │   - persists, then broadcasts│
                     └──────────┬───────────────────┘
                                │ imports
                     ┌──────────▼───────────────────┐
                     │  shared/core.js              │
                     │  (also imported by the app)  │
                     └──────────────────────────────┘
```

### 4.1 The reliability story

One Durable Object instance, single-threaded, is the only writer. Every action
is applied and persisted in strict order. There is no last-write-wins anywhere
in the system, because there is never a second writer.

**Clients never send state. They send actions.** The DO validates each action
against current state using the same engine the client renders with, applies it,
persists it, and broadcasts the full new state to every connected socket.

State and version are written in a single `storage.put({state, version})` so they
can never disagree on disk.

WebSocket hibernation keeps idle connections free. On any reconnect the client
sends `hello` and immediately receives full authoritative state — there is no
delta protocol and no resync logic to get wrong.

### 4.2 Files

| File | LOC | Role |
|---|---|---|
| `src/App.jsx` | 6,895 | The entire UI. Deliberately one file. |
| `src/PhotoCropper.jsx` | 553 | Circular avatar crop (pan/zoom, canvas export) |
| `src/lib/client.js` | 113 | Transport: reconnecting WS, promise-based `dispatch`, device identity |
| `shared/core.js` | 633 | Game logic. Imported by BOTH the DO and the app. |
| `worker/actions.js` | 743 | All 45 mutations, validated server-side |
| `worker/tournament.js` | 145 | The Durable Object: hydration, WS, photos, GM token |
| `worker/index.js` | 12 | Route `/ws` and `/api/photo/*` into the DO |
| `tests/e2e.mjs` | 374 | Full game loop over two live WebSocket clients |
| **Total** | **~9,470** | |

`shared/core.js` being imported by both sides is the single most important
structural decision in the codebase. Settlement, standings, bracket resolution,
and stage resolution are computed by the *same function* on the client (for
instant optimistic rendering) and on the server (for the authoritative answer).
Divergence is impossible by construction. If they ever disagree, the server is
right and the client is stale.

### 4.3 Transport contract

Client → server messages: `hello`, `ping`, `gmUnlock`, `claim`, and any of the 45
action types. Every message carries `actionId`, `deviceId`, and (if held)
`gmToken`.

Server → client: `state` (full snapshot + version + `lastAction`), `ack`
(per-`actionId`, `{ok}` or `{ok:false, error, extra}`), `pong`.

`dispatch(type, payload)` returns a promise resolving to the ack, so any UI
control can await the server's verdict and show the real rejection reason.

### 4.4 Photos

Photos are the one non-JSON payload. They POST to `/api/photo/:player` as a data
URL (≤120 KB, `image/*` only), are stored under a separate storage key so they
never bloat the broadcast frame, and the profile only carries a `photoV`
cache-buster. GETs are served with `immutable` caching. Ownership is enforced:
only the claiming device or the GM can write a given player's photo.

---

## 5. Data model

### 5.1 `EMPTY_STATE` (v5)

```js
{
  v: 5,
  live: false,            // the weekend has started
  results: {},            // evId -> { slots:[[1st],[2nd],[3rd]], ts, stacks?, outs? }
  wagers: [],             // newest first
  adjustments: [],        // GM rulings: { player, delta, reason, ts }
  seeds: {},              // player -> { sportId: 0..4 }  (private self-ratings)
  draws: {},              // evId -> { id, teams:[{name, players:[]}], ts }
  brackets: {},           // evId -> { rounds:[[{a,b,winner}]] }
  stages: {},             // evId -> { id, kind, groups, advance, finalWinner, ... }
  drafts: {},             // evId -> live snake draft state
  duels: [],
  poker: null,            // { id, total, startedAt, levels, levelOffset, outs, counts }
  profiles: {},           // player -> { display, num, size, color, skin, photoV,
                          //             flightsBooked, flightIn, flightOut }
  customEvents: [],
  shelved: {},            // evId -> true (skipped this weekend)
  onDeck: null,           // the ONE event betting is open on
  frozen: false,          // board locked, champion crowned
  onboardEpoch: 0,        // bumping this re-opens check-in for everyone
  eventEdits: {},         // GM patches over BUILTIN_EVENTS
  eventOrder: [],
  logistics: { ...LOGISTICS },
  updatedAt: 0,
}
```

**Nothing derived is stored.** No balances, no wager outcomes, no ranks, no
winners of anything that can be recomputed. Standings are recomputed from raw
state on every render, on both sides.

### 5.2 Migration strategy

Three layers, all executed at DO hydration in `blockConcurrencyWhile`:

1. **Key backfill.** Any top-level key present in `EMPTY_STATE` but missing from
   stored state is filled with a fresh clone. State written before a field
   existed picks it up without touching a single GM-authored value.
2. **Shape normalisation.** Flight legs stored as legacy free text are run
   through `cleanLeg` and either normalised to `{air,num,time}` or dropped.
3. **Versioned config replacement.** `LOGISTICS` carries a `v`. `cleanLogistics`
   replaces a sheet wholesale when its stamp is older than the shipping config
   (that sheet was written against a booking we no longer have), and at the
   current version it lets GM edits win over defaults while dropping retired
   keys. This exists because the first version of the address logic made a stale
   "address drops soon" placeholder immortal — a stored blank could outrank the
   real address forever. Bump `v` when the booking actually changes.

There is no migration code path outside hydration. There are no numbered
migrations to run.

---

## 6. Action catalogue

All 45 server actions, grouped. Every one validates server-side; the client may
pre-check for UX but the server decision is final.

**Identity and profile (4)**
`saveProfile` · `pickChip` · `saveSeeds` · (`claim` and `gmUnlock` are handled in
the DO directly, before `applyAction`)

**Wagering (3)**
`placeWager` · `retractWager` · `voidWager` *(GM)*

**Duels (4)**
`sendDuel` · `playDuel` · `declineDuel` · `voidDuel` *(GM)*

**Results and schedule (9)**
`saveResult` · `clearResult` · `setOnDeck` · `shelve` · `addEvent` ·
`removeEvent` · `editEvent` · `reorderEvents` · `restoreEvent` — all GM

**Draws and brackets (3)**
`runDraw` · `clearDraw` · `pickBracketWinner` — all GM

**Group stages (4)**
`runStages` · `clearStages` · `toggleThrough` · `setFinalWinner` — all GM

**Snake draft (5)**
`startDraft` · `pickDraftPlayer` · `undoDraftPick` · `finalizeDraft` ·
`cancelDraft` — all GM

**Poker finale (8)**
`pokerSetup` · `pokerStart` · `pokerLevel` · `pokerBust` · `pokerUnbust` ·
`pokerCount` · `pokerResult` · `pokerCancel`

**Board control (5)**
`adjust` · `setFrozen` · `rerunOnboarding` · `setLive` · `resetTournament` — all GM

**Logistics (1)**
`saveLogistics` *(GM)*

Only `placeWager`, `retractWager`, `sendDuel`, `playDuel`, `declineDuel`,
`saveProfile`, `pickChip`, `saveSeeds`, `pokerBust`, and `pokerCount` read
`ctx.player` (guest identity). Everything else is `gmOnly`.

---

## 7. Feature specification

### 7.1 Onboarding / the invite

**Framing:** the invite is the app. A link goes out months ahead; opening it
starts a guided check-in that ends on the live board.

**Entry point decision** lives in exactly one function, `firstOnboardStep()`:

```js
const firstOnboardStep = () => (isStandalone() || !isMobile() ? 0 : -1);
```

This is the only place that decides where onboarding opens. It has to be, because
three entry points must agree — first run, GM-triggered rerun, and local replay —
or the install gate silently vanishes for everyone who was re-onboarded. (It did,
once. That bug is the reason this function exists.)

**Steps:**

| Step | Screen | What it does |
|---|---|---|
| −1 | **Install gate** | "Take Field Day with you." Add-to-home-screen instructions. Skipped for standalone and desktop, because the installed app gets fresh storage — anything set up in the browser first would be lost. Escape hatch: "Skip, stay in the browser." |
| 0 | **Claim your spot** | 13-name grid, first-come-first-serve. `claim` binds this device to a roster name. |
| 1 | **The format** | "The bachelor party is a tournament." One paragraph plus `OnboardingMechanics` cards: points, betting, duels, trophy, finale. |
| 2 | **The roster / travel map** | "Thank you for flying in for this!" `TravelMap` renders real lon/lat over a dotted lower-48. |
| 3 | **Getting there** | `VenueCard` (house art + address + maps link + the check-in window inside the same card so those times can only read as the house's) and Brandon's own flights paired with the PHX row. Then a bordered **"Information I need"** panel: flights-booked yes/no, both legs, T-shirt size. The border is the point — it makes the switch from being told things to giving things visible. |
| 4 | **Your card** | Display name, jersey number, photo (with crop), chip color and edge skin. |
| 5 | **Rate yourself** | 13 private self-ratings (8 sports, 5 drinking games), 5-point scale, "Mark all Average" escape hatch. Used only to balance team draws. Finishing lands directly on the board. |

**Design decisions worth preserving:**

- **One progress system, one finish line.** `InviteProgress` runs 1..6 and ends.
  There is no second mechanics chapter and no tab-by-tab tour after check-in.
  Deeper mechanics live in the Rules tab, which is always there.
- **Questions are asked outright with equal answers.** "Booked your flights?
  Yes / Not yet" — not a primary button plus a link. The explicit `false` is
  persisted as `flightsBooked`, so "not booked yet" is a distinct, actionable
  state from "no answer."
- **Flight legs are structured.** Everyone lands Friday and leaves Sunday and the
  flight code implies the airport, so a leg is only `{air, num, time}` (24h off
  the native picker), validated by `cleanLeg` on both sides. `FlightEntry`
  collects one as three captioned boxes; `FlightPass` prints a saved one as a
  boarding pass. Pass chrome on an empty form reads as already-filled-in, so the
  two are separate components.
- **One apparel size.** The T-shirt size is also the jersey size. The separate
  jersey field was added and then removed — it asked a guest to answer the same
  question twice.
- **Check-in asks flights fresh on a replay.** Saved legs are kept so choosing
  "Yes" reveals them, but the yes/no is never pre-answered on the guest's behalf.

**Rerun semantics.** `rerunOnboarding` bumps `onboardEpoch` and clears every
claimed chip color and skin (re-opening the chip race), but is refused entirely
once `state.live`. Because it is the one action that discards real guest input,
the **server** refuses it while anyone is checked in unless `force` is passed,
and returns `signedUp` so the GM is told exactly who it costs before the second
tap.

### 7.2 Identity: the chip

Every player is a physical betting chip. Identity is:

- **A color** — 32 claimable, first come first serve, gray until claimed
- **An edge skin** — 12 treatments: `ticks, plain, dash, quad, dots, ring, saw,
  flame, star, bolt, wave, crown`. Half are deliberately loud, all stay flat and
  one-ink.
- **A jersey number** — stamped in the center
- **A photo** — optional, circular crop

**The load-bearing rule:** every skin is an *edge* treatment, and the number is
drawn **last**, over a halo of the chip's own color (`paintOrder="stroke"`). No
design can eat the jersey number. The crown skin violated this once and was moved
to the top edge.

Colors lock once the weekend goes live. The skin rack previews the number
*being typed*, not the saved one.

This chip is the app's whole visual grammar: it is the avatar, the bet marker on
the bracket, the stack on the board, and the mark on the TV.

### 7.3 Logistics

`state.logistics` ships as `LOGISTICS` in core (address, venue note, `PHX` /
Phoenix Sky Harbor, check-in and check-out windows, Brandon's own inbound and
outbound legs) and is GM-editable via `saveLogistics`.

Guest-side reads render through `VenueCard`. GM-side, the **travel board** lives
in the locker room and shows, per player: flight status, both legs, shirt size,
and chip identity. Behind it, `sheetText(state)` produces tab-separated text
behind a **Copy sheet** button, because ordering shirts happens in a spreadsheet
or a supplier form, not on a phone. Blanks stay blank there on purpose.

### 7.4 The event system

**Slate:** 18 events — 17 scored plus the poker finale.

| # | Event | Session | Value | Format |
|---|---|---|---|---|
| 1 | Putting | Fri Night | 400 | solo |
| 2 | 8-Ball | Fri Night | 400 | pairs, 6 teams, bracket |
| 3 | Beer Pong | Fri Night | 400 | pairs, 6 teams, bracket |
| 4 | Die | Fri Night | 400 | pairs, 6 teams, bracket |
| 5 | Basketball | Sat AM | 800 | team, 4×3, bracket |
| 6 | Spikeball | Sat AM | 800 | pairs, 6 teams (pools) |
| 7 | Ping Pong | Sat AM | 800 | solo (heats) |
| 8 | Foosball | Sat AM | 800 | pairs, 6 teams, bracket |
| 9 | Volleyball | Sat PM | 1200 | team, 2×6 |
| 10 | Nine holes | Sat PM | 1200 | solo |
| 11 | 1v1 Basketball | Sat PM | 1200 | solo |
| 12 | Pickleball | Sat PM | 1200 | pairs, 6 teams, bracket |
| 13 | Flip Cup | Sat Night | 1600 | team, 2×6 |
| 14 | Beerio Kart | Sat Night | 1600 | solo |
| 15 | 5v5 Basketball | Sat Night | 1600 | team, 2×5 |
| 16 | Rage Cage | Sat Night | 1600 | solo |
| 17 | The Gauntlet | Sat Night | 1600 | solo |
| 18 | **Championship Poker** | The Finale | — | finale |

Session values escalate 400 → 800 → 1200 → 1600 so the weekend has a shape and
Saturday night actually matters.

**Four formats, all server-driven:**

1. **Straight result.** GM posts 1st/2nd/3rd. Solo events.
2. **Draw + bracket.** `runDraw` builds balanced teams from the private seed
   ratings (`playerStrength` → `strengthMap` → `refineTeams`, a recursive
   refinement pass), `makeBracket` seeds them, and `pickBracketWinner` advances.
   Bracket structure is resolved lazily by `resolveSlot`, so a team's identity in
   round 2 is derived from round 1 rather than copied.
3. **Group stages.** `runStages` splits entrants into pools or heats with an
   `advance` count. `toggleThrough` marks who got out of a group;
   `setFinalWinner` decides the final among `stageFinalists`.
4. **Snake draft.** `startDraft` names captains, `pickDraftPlayer` runs the snake
   order (`snakeTeam`), `undoDraftPick` backs one out, `finalizeDraft` writes the
   draw. Has a live turn-nudge and its own TV scene.

**Adding an event later** is one `BUILTIN_EVENTS` entry (or the GM add-event
flow, whose "Looks like" picker borrows a known game's mark, hero, and how-to).
Optionally register a `GAMES` howto, a `MARKS` icon, and a `GAME_HEROES`
animation. Every surface — schedule, strips, sheets, betting band, event intro,
TV — reads those registries and falls back to the GameMark, then the FD chip.
Nothing else to wire. This registry pattern is why the slate went from 14 to 18
events without touching the UI.

**One-tap event opening.** For a team event, the GM taps **"Announce and draw
{event}"** once: on-deck goes out, the draw follows, and the phone plays the
intro animation then hands over to the reveal by itself after `INTRO_HOLD`
(4.2s). Drawing before the announcement put matchups on screen before anyone
knew the game; a manual close made the GM tap twice.

### 7.5 The economy

**The central idea:** the board is denominated in **tournament chips** from
check-in, so the poker finale needs no conversion and the app never asks anyone
to do arithmetic. The number you carried all weekend is the stack you are dealt.

| Constant | Value | Meaning |
|---|---|---|
| `PT` | 100 | The chip quantum. One rendered `BankChip` = PT = one physical 100 chip. |
| `START` | 1,000 | Everyone starts here |
| `MAX_RISK` | 500 | Floor on the at-risk cap |
| `maxRisk(pts)` | `max(500, floor(pts/2/100)*100)` | Half your points, floored to 100s, never under 500 |
| `OUTRIGHT_MULT` | 2 | Outright winner pays 2:1 |
| `DUEL_STAKE` | 100 | Default duel ante |
| `BUYIN_FLOOR` | 600 | Minimum stack topped up at the finale |
| `CHIP_MIN` | 25 | Poker chip unit |

**Awards** pay by session, and the `AWARDS` keys **are** the legal event values:

```
400  -> [400,   0,   0]
800  -> [800, 400,   0]
1200 -> [1200, 800, 400]
1600 -> [1600, 800, 400]
```

Winning games outweighs betting, on purpose. A perfect bettor cannot out-earn a
player who wins events.

**Standings** = `1000 + event awards + wager net + duel net + rulings`, computed
fresh from state every time by `computeStandings`. No stored balances anywhere.
Rows carry `pts, wins, betNet, duelNet, awardPts, rank`, with ties sharing a rank.

**Where a number came from is drawn, not narrated.** Standings rows carry
`StatPills` — a cup for wins, a chip for wagers, a bolt for duels, plus live
exposure — and only nonzero pills render, so a fresh board is just names and
numbers.

### 7.6 Wagering

**Market rules:**
- Betting is open on exactly one event at a time: `state.onDeck`. Setting a new
  event on deck closes the previous market.
- Three wager kinds: `outright` (2:1), `match` (a specific bracket matchup, even
  money), and `stage` (group advancement or a stage final, even money).
- **You cannot bet against your own team.** In a 2-team draw you may only back
  your own side; in a bracket you may not back the side facing you; in a team
  stage you may not back against a group you're in.
- Stakes move in 100s. Stake ≤ balance − exposure − open duel antes.
- Total exposure ≤ `maxRisk(pts)`. Duel antes count against the same cap, or a
  duel would be a way around it.
- Retract your own chip any time the market is still open. GM can void anything.

**Settlement is derived.** `resolveWager(state, w, events)` returns
`{status, delta}` from current state every time it's called. Consequences:

- Correcting a posted result automatically corrects every payout that referenced
  it. There is no "recalculate" step and no reconciliation bug possible.
- Advancing a bracket settles the matchup bets that were riding on it, live.
- **Stale references void the bet.** A wager stores the `drawId` / `stagesId` it
  was placed against. Re-run the draw and every bet on the old teams voids
  cleanly rather than silently re-pointing at different people.

**The betting UX is video roulette,** not a form:

- A fixed rack — 100 / 200 / 500 / 1000 — selects the tap stake.
- The rack carries the **only** economy readout: a meter that *draws* the cap
  instead of narrating it. The bar is your whole stack, the notch is `maxRisk`,
  the gold is your current exposure, and the gap between them is what's left to
  bet. It stays up when you're maxed out, because that's when it explains the
  most. It is labelled with numbers, never a phrase.
- Tapping any pick or open bracket side drops that chip, value stamped on its
  face. Your ✕ pulls the last one back.
- Settled bets consolidate: `mergeWagerLines` collapses one bettor's multiple
  chips on the same pick into a single `SettledRow`, because when thirteen people
  bet, one card per chip is unreadable.

### 7.7 Duels

A duel is a head-to-head phone challenge, settled automatically. Currently one
game: **Quick Draw** — "The screen flashes after a random wait. Tap it. Fastest
tap wins, tapping early is a foul."

```js
{ id, game:"quickdraw", from, to, stake, status:"open"|"declined"|"void",
  runs: { [player]: { ms, foul, ts } }, ts }
```

**The winner is never stored.** `resolveDuel(duel)` derives `{settled, winner,
loser, push}` from the two runs: non-foul beats foul, else lower `ms` wins, exact
tie pushes with no transfer. Points flow through `computeStandings` the same way
wagers do.

**Rules:**
- Refused until `state.live`. Everyone sits on exactly 1,000 until Friday, which
  is what the invite promises, and the pre-weekend locker room shows no points
  for a result to land on. Play is unrestricted once live.
- The challenger names the ante. Both sides put up the same amount, so it is
  bounded by whichever of the two can cover less: antes move in 100s, minimum
  100, and must clear `maxRisk(pts)` *and* spendable points (points − wager
  exposure − other live antes) **for both players**. Same cap as wagers, for the
  same reason.
- One open duel per pair; three challenges sent per player per day, max.
- Frozen while the poker finale is live (an in-flight duel settling mid-poker
  would move points under the table).
- GM can void any duel at any time.

### 7.8 The poker finale

**The mechanic:** there is no buy-in conversion. The board is already in chips,
so a stack of 2,900 sits down with 2,900 in front of it.

**Flow:**

1. **`pokerSetup`** — requires every wager and duel settled or voided first, so
   dealt stacks always match the board. Snapshots `total` (the sum of all
   points). Tops anyone under `BUYIN_FLOOR` (600) up to 600 as a
   **"Minimum stack" ruling**, so nobody sits out the finale.
2. **Buy-in sheet** — per player, the exact denomination breakdown via
   `pokerDenoms`: real denominations 25 / 100 / 500 / 1000, with a blind pack of
   eight 25s. Exact because the whole economy is PT-quantized.
3. **`pokerStart`** — blinds run 25/50 up to 600/1200 on a level clock.
   `pokerClock` is a pure function of `(poker, now)`; clients tick a 1s interval.
   No server timers exist.
4. **Live** — `pokerBust` / `pokerUnbust` track elimination order.
   `pokerLevel` nudges the blind level. Players can bust themselves.
5. **`pokerCount`** — counts entered in chips, multiples of `CHIP_MIN` (25).
   Players count their own stack in parallel. A sum mismatch against `total` is
   **allowed** — physical miscounts happen — and shown, never blocked.
6. **`pokerResult`** — the counts **become the standings verbatim**. Chip leader
   is the champion. Elimination order (embedded in the result, so settlement is
   self-contained) breaks ties among busted players: later bust ranks higher.

**Freeze semantics.** The whole economy freezes while cards are live
(`pokerLive`): no wagers, no duels, no `playDuel`, no rulings, no on-deck.
Betting stays **closed** once counts post (`stacksPosted`). Rulings after the
count move in 25s (chip units) and apply on top of the stacks.

**Derived and reversible.** `pokerCancel` reverts the Minimum-stack grants;
`clearResult` re-arms the table and the pre-poker standings return exactly.

### 7.9 TV mode

`/tv` is a full-bleed broadcast client. It cycles scenes on a timer:

| Scene | When |
|---|---|
| `board` | always (the standings rail) |
| `join` | while anyone hasn't checked in — shows a QR to the app |
| `next` | when there's an unplayed event after the current one |
| `latest` | after any result — winner, award, and its impact on the board |
| `book` | when there are open wagers — the live betting board |
| `live` | a seated bracket or stage in progress |
| `draft` | while a snake draft is running |
| `poker` / `buyin` | the finale: buy-in grid, then blinds + countdown + outs |
| `champion` | once frozen |

**TV is the constant status.** The live scene carries an **UP NOW** banner and a
gold outline for `nextOpenMatch(br)` — the next seated, undecided matchup, which
also appears in the ticker and the phone's live strip. Value chips ride the TV
bracket cells and board rows. Bracket draw reveals announce first-round matchups.

### 7.10 GM console

**Unlock:** a 4-digit PIN (`GM_PIN` in core) mints a server-held `gmToken`, saved
per device. Ten wrong tries lock the door for a minute.

**The primary control is one button.** `gmNext` computes the single next action
and labels it: "Announce and draw Foosball", "Open betting", "Post the result",
"Set up the poker table", "Enter final counts", "Crown the champion". The GM's
weekend is mostly tapping that.

**Everything else** lives behind sheets: event editing and reordering, shelving,
custom events, draw and bracket controls, stage controls, draft controls,
the travel board, logistics editing, rulings (`adjust`, with a reason), voiding
wagers and duels, `setLive`, `setFrozen`, and the two destructive actions.

**Destructive-action safety:**
- `resetTournament` clears results, wagers, duels, draws, brackets, stages,
  drafts, and poker — but **preserves** profiles, seeds, logistics, and
  `onboardEpoch` (zeroing the epoch would kill every future rerun). This is the
  safe QA reset.
- `rerunOnboarding` is the only action that discards guest input, and is guarded
  as described in §7.1.

### 7.11 QA harness

A client-side sim driver, GM-only, that drives **real server actions over the
real socket**. No mocks, no server test mode, no special state.

**Checkpoints** — `simRank(state)` derives where the board currently is (0 fresh
→ 7 frozen), and six presets jump to a known state:

| Checkpoint | Rank | Guarantees |
|---|---|---|
| Locker room | 0 | 13 full profiles, unique chips claimed, not live |
| Betting open | 2 | live, first event formatted and on deck, real wagers down |
| Mid-Saturday | 3 | Fri + Sat AM played (incl. heats and pools), duels settled |
| Table set | 4 | everything played, book clean, poker set up |
| Poker live | 5 | clock running, busts in, counts started |
| Champion crowned | 7 | stacks are the standings, board frozen |

`jumpTo` resets first only when the current rank is *past* the target; at or
below, every step is idempotent, so presets double as "continue from here" and
re-tapping after Stop resumes.

**The safety rule that matters now that real data is arriving:** `simCheckIn`
skips any player with a single field set and only fills wholly empty slots.
Filling one blank with a plausible fake is worse than leaving it blank — nothing
downstream can tell a fake shirt size from a real one, and Brandon orders from
that sheet.

**`tests/e2e.mjs`** drives the full loop over two live WebSocket clients against
a running server: check-in, draws, bracket walk, wagers with rejection cases,
duels (including the pre-live refusal and ante bounds), poker setup gate,
finale, and a reset at the end. `WS_BASE=wss://.../ws` targets production.

### 7.12 PWA

- `manifest.webmanifest`: standalone, portrait, night background, a `/tv`
  shortcut.
- Icons generated by `scripts/icons.mjs` from the same chip geometry as the app
  mark — no font dependency, regenerable.
- Install gate at onboarding step −1 (see §7.1).
- `index.html` carries the full OG/Twitter card; `public/share.png` (1200×630) is
  generated from the same geometry, so a pasted link never arrives as a bare URL.
  The absolute URL is stamped at build time from `SITE_URL`.

### 7.13 Design system and copy doctrine

**Look:** sun-faded rec-tournament at night, championship seriousness. Full dark
— warm near-black surfaces on a night ramp. `--ink` is the primary text color
(bone); `--ink0` is the absolute brown-black reserved for marks, poker chips, and
anything sitting on sun. Barlow Condensed for display (scores, ranks, event
names), Inter for everything functional, no serif. Fonts load in `index.html`,
never via CSS import.

**Token discipline:** semantic tokens in `Shell` (`:root`) are the only color
source. No raw hex outside `:root` and `PLAYER_COLORS`. Tints via `--*-tint`,
shadows via `--shadow-1/2/3` (deep warm, never pure black), radii 6/10/14/16/99.

**Phase palette:** pool (Fri) → sun (Sat AM) → terracotta (Sat PM) → clay
(Sat night) → night (Finale).

**The mark** is the FD chip: a sun-gold betting chip with bone edge ticks and a
geometric sun at center. No emojis as final artwork, no gradients, no glows, no
luxury conventions.

**Copy rules** (these are Brandon's, learned across many passes, and they are the
most-violated part of the codebase — they belong in any M1 review checklist):

- Terse and direct. No corny names, no exclamation-mark energy, **never** em
  dashes.
- Say the mechanic, not a description of it.
- Cut anything self-evident. Watch for the shape: a clause starting "so ..." that
  only restates the sentence before it.
- Never restate a mechanic with a worked example. Say it once.
- Cut reassurance and atmosphere tails ("The board tracks it", "The room keeps
  time", "Nobody sees this").
- One idea per line. A rule plus its rationale keeps the rule, unless the
  rationale is the joke.
- A dry aside is welcome where a rule sounds arbitrary. Dry, never zany.
- Ask questions outright with equal answers.
- Headings carry the message, bodies carry the detail.
- **No borrowed casino/sports idiom.** "half your stack can ride", "cashed", "the
  book", "shuffle up and deal", "table stakes" were all cut. The real *names* of
  real things stay (blinds, bust, stack, chips, draw, heats, on deck) — those are
  what the objects are called, not flavor.

---

## 8. Core invariants

These are the contracts. Breaking any of them is a correctness bug, not a
regression in taste.

1. **Derived settlement.** Wager and duel outcomes are computed from official
   results via `resolveWager` / `resolveDuel`, never stored. Correcting a result
   or advancing a bracket automatically corrects payouts. Stale `drawId` /
   `stagesId` references void bets.
2. **Server-authoritative.** All validation lives in `worker/actions.js`. The
   client may pre-check for UX; the server decision is final.
3. **Everyone starts with 1,000; PT=100 is the chip quantum.** Every value in the
   economy is a multiple of PT, and one rendered `BankChip` = PT = one physical
   100 chip. Standings computed fresh, always. No stored balances.
4. **Payouts:** outright 2:1; matchups, advancement, and stage finals even money.
   Awards pay 400/800/1200/1600 by session. At-risk cap is `maxRisk(pts)` and it
   bounds duel antes too.
5. **GM auth:** PIN unlocks once and mints a server-held token; GM actions
   require it.
6. **Identity is a device claim, not auth.** `firstOnboardStep()` is the only
   place that decides where onboarding opens.
7. **Duels are a weekend thing.** `sendDuel` is refused until `state.live`.
8. **The poker finale settles on stacks.** Counts become standings verbatim.
   The economy freezes while cards are live; betting stays closed once counts
   post. Derived and reversible.

---

## 9. Deployment and operations

**Hosting:** Cloudflare Workers. `fielddayseries.com` is bound as a custom domain
via `routes` in `wrangler.jsonc`. Deploying requires the zone to be active on the
same Cloudflare account — wrangler adds the DNS record, it cannot add the zone.

**Commands:**

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server with the Worker + DO running locally in workerd |
| `npm run build` | Production build (stamps `SITE_URL` into OG tags) |
| `npm run deploy` | build + `wrangler deploy` |
| `npm run tail` | Live production logs |
| `npm run test:e2e` | Full loop over two WebSocket clients; resets the board when done |

**Current production state:** deployed, custom domain live, invite distributed,
guests checking in. The board is not `live` (that flips Friday Oct 30). The DO
holds real profile data — resets from here must be `resetTournament`, never
`rerunOnboarding`.

---

## 10. What M0 deliberately did not build

Listed so M1 scoping starts from a known set rather than rediscovering them:

- **Web Push.** Betting-open and result alerts. Installed PWAs on iOS 16.4+ can
  do this; M0 ships in-app toasts only, which means a phone in a pocket misses
  everything.
- **Service worker / offline shell.** The installed PWA currently needs network
  to boot at all.
- **Awards voting.** Fraud of the Weekend and similar, Saturday night.
- **Sudden-death pressure putt** for championship ties.
- **Odds tuning by field size.** Payouts are flat regardless of how many teams
  are in a draw; a 2-team outright at 2:1 is a very different bet from a 6-team
  outright at 2:1.
- **Photo optimization.** Photos are base64 data URLs capped at 120 KB, stored in
  DO storage. Server-side resize and R2 if state grows.
- **Dietary / drink preferences** in check-in.
- **Any archive or multi-edition view.**

---

## 11. Known risks and open defects

Ranked by what would actually hurt.

### 11.1 `GM_PIN` ships in the client bundle — **open, highest priority**

`GM_PIN = "1016"` lives in `shared/core.js`, which is imported by the React app
and therefore ships in the JavaScript bundle. Any guest who opens devtools can
read it and unlock commissioner mode: void wagers, post results, issue rulings,
freeze the board.

The pin is only compared server-side in the DO, so the fix is small: read it from
`env.GM_PIN` (a Worker secret) in `worker/tournament.js` and remove the constant
from the shared module. The client never needs the value — it posts a pin and
gets a token back.

**This should be fixed before the weekend, and arguably before more guests
onboard**, since the invite is already out.

### 11.2 Cold-start race in the e2e test — low severity, pre-existing

The first `npm run test:e2e` run immediately after `npm run dev` fails on "both
windows received initial state on hello"; subsequent runs pass. Pre-existing on
master. It's a test-harness timing issue, not a product bug, but it makes the
test unreliable as a pre-deploy gate until fixed.

### 11.3 Venue network

The entire product is a live WebSocket app with no offline shell. If house wifi
drops, thirteen phones show a stale board and no one can place a bet. The
reconnecting client handles brief drops cleanly (full state on `hello`), but a
sustained outage during Saturday night is a real product failure. This is the
strongest argument for the service worker item.

### 11.4 Single point of failure by design

One Durable Object, no backup, no export. If the DO's storage is lost, the
weekend is lost. A read-only state export (even just "Copy state JSON" behind the
GM console) is cheap insurance.

### 11.5 Copy nit

The format screen and the PWA manifest description both say "sixteen events."
The slate is 17 scored events plus the finale.

### 11.6 Honor-system duel timing

`playDuel` bounds `ms` server-side but cannot verify the client's clock. Fine for
13 friends; worth noting it exists.

---

## 12. Metrics worth watching right now

Onboarding is live, so these are observable today from `state.profiles` and the
GM travel board:

| Metric | Why it matters | Where |
|---|---|---|
| Claimed spots / 13 | The top of the funnel. Anyone unclaimed hasn't opened the link. | roster grid |
| Check-ins completed / claimed | Drop-off inside the 6 steps | profiles with `seeds` set |
| `flightsBooked === false` count | Direct action item — who needs a nudge | travel board |
| Flight legs filled / 13 | Airport pickup planning | travel board |
| Shirt sizes filled / 13 | Blocks the merch order | Copy sheet |
| Chip colors claimed | Fun signal; also tells you if the chip step is a wall | profiles |
| Install rate | How many hit step −1 vs. entered at step 0 | not currently instrumented |

**The gap:** there is no analytics of any kind. Everything above is read by
eyeballing the GM travel board. For M1, even a single derived "check-in status"
panel with these six counts would replace manual auditing — and it's ~40 lines,
since all the data is already in state.

---

## 13. Candidate scope for M1 and M2

Not committed. This is the menu, sorted by what the deployed state now argues
for.

### M1 — "It survives the house" (do before October)

**P0 — correctness and reliability**
1. **Move `GM_PIN` to a Worker secret.** (§11.1)
2. **Service worker offline shell.** The app boots and shows last-known state
   without network; actions queue or fail loudly. Directly de-risks §11.3.
3. **State export.** One GM button that copies full state JSON. Insurance
   against §11.4.
4. **Fix the e2e cold-start race** so the test is a usable pre-deploy gate.

**P1 — the thing that makes betting actually happen**
5. **Web Push for betting-open and results.** M0's toasts only reach a phone
   that is unlocked and looking at the app. A betting market that nobody knows
   opened isn't a market. This is the highest-leverage *product* item in the
   backlog.

**P2 — onboarding completion**
6. **Check-in status panel** for the GM: the six counts from §12, plus a
   per-player "what's missing."
7. **Optional check-in additions:** dietary/allergy and drink preference. Cheap
   to add now; useless to add in October.

### M2 — "It's a better weekend" (nice-to-have, October)

8. **Awards voting** — Saturday night, one ballot, results as a TV scene.
9. **Odds tuning by field size** — scale the outright multiplier by the number
   of entrants so a 6-team outright pays more than a 2-team one. This is the
   single biggest *balance* gap in the current economy.
10. **Sudden-death pressure putt** for championship ties.
11. **Photo optimization** — server-side resize, R2 if state grows past
    comfortable broadcast size.
12. **Second duel game.** `DUEL_GAMES` is already a registry with exactly one
    entry; the UI, settlement, and standings paths are all game-agnostic.
13. **Copy pass on the Rules tab** against the §7.13 doctrine, since it's the
    surface that accumulates explanation.

### Explicitly parked

- Multi-edition / archive. `EDITION` exists so Tahoe · 2027 is a config change,
  but there is no reason to build a season view for one weekend.
- Real auth. 13 friends in a house.
- Native apps.

---

## 14. Appendix: the decisions that would be expensive to revisit

If M1 or M2 wants to change any of these, budget accordingly.

| Decision | Why it's load-bearing |
|---|---|
| Single DO, full-state broadcast | Every sync bug in the product is prevented by this, not handled by it. A delta protocol would reintroduce a whole bug class. |
| `shared/core.js` imported by both sides | Client/server divergence is structurally impossible. Forking this logic is the fastest way to break the app. |
| Nothing derived is stored | Every "correct the result and everything fixes itself" behavior falls out of this. Caching a balance anywhere would end it. |
| PT quantization end to end | The finale's exact denomination breakdown only works because every value in the economy is a multiple of 100 (and 25 at the table). |
| `firstOnboardStep()` as the only entry decision | Three call sites must agree or the install gate silently vanishes. It already did once. |
| `LOGISTICS.v` + `cleanLogistics` | The only thing preventing a stale stored blank from outliving the real address. |
| The chip as the whole visual grammar | Avatar, bet marker, stack, TV mark, app icon, and share card are all the same object. |
| One file for the UI | Deliberate for now. It is 6,895 lines and is the most likely thing to want splitting in M1 — but splitting it is a real refactor, not a cleanup. |
