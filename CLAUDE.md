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
  `src/ui/experience.css`; all guest pages use the green-charcoal dark palette.
  `.fd-night` keeps TV and live surfaces on that same palette. `features/home/`,
  `features/weekend/`, `features/standings/`, and `features/wagers/` own the
  returning home, events/weekend reference, live board, and wagering UI.
  `features/draft/` owns captain setup, the live snake draft, and its Home entry;
  `shared/core.js` supplies its turn and mutation references through `draftTurn`.
  `features/duels/` owns Quick Draw, the duel card, the commissioner duel
  list, and viewer-relative duel state. `features/tv/` owns TV mode
  (`TVMode.jsx`, pure `tvModel.js`, `serverClock.js`), drawn on a fixed
  1920x1080 letterboxed canvas with 24px minimum text.
  `ui/AppChrome.jsx` owns the persistent header/navigation; `ui/GameMark.jsx`
  owns the shared game illustrations. `src/lib/client.js` treats the socket as
  live only after a fresh state lands on it, replaces a socket whose ping goes
  unanswered or that stays silent after the app returns to the foreground,
  and reports a timed-out write as uncertain until the next state settles it.
  Every frame carries a build id: the TV reloads between ceremonies and phones
  offer Update ready.

## Current redesign direction

**September 5 correction is authoritative.** Brandon rejected the light
redesign and the rewritten voice. It made the app harder to use and broke
intentional cohesion. This supersedes the September 4 light paper/burgundy
direction. In the subsequent Home brief, Brandon explicitly allowed a new
dark palette: green charcoal, warm bone, muted yellow, and restrained lilac.
Keep the dark theme and recover Brandon's existing wording from the
pre-redesign source. Do not add slogans, a fictional host note, casino idioms,
or reassuring filler. Change copy only to explain an actual changed interaction
or keep a rule accurate.

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
match is outlined (`bracketLayout`, features/weekend/CompetitionBracket.jsx). While
a bracket game is live, a compact read-only bracket (`BracketPeek`, one target)
sits under the current matchup on Home and under the board on Bets, and its
Events row has its own Bracket entry; all open the full bracket sheet.
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
Brandon may later add questions, activity votes, or restaurant polls. Plan one
reusable prompt/response feature with endpoint-based host authoring if useful,
separate from onboarding. Its details are recorded in `docs/REFOUNDATION.md`;
no specific question, poll, or new endpoint has been implemented yet.

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
4. **Current-contest betting:** a free-for-all with more than two sides pays
   2:1 (`OUTRIGHT_MULT`); the current matchup, heat/pool winner, or stage-final
   winner pays even (1:1). Any contest with exactly two sides, including a
   two-team game like Volleyball, Flip Cup or 5v5, is a matchup: even money,
   and competitors may back only their own side. Every bettor holds one side
   per contest. New outright tickets store their `mult`. The board exposes only that one current contest,
   never every unresolved bracket matchup or an event-wide outright market
   for an event being played as matches or stages. A competitor may optionally
   back themself or their own team in that contest; spectators may back any
   of its sides. Free-for-all choices remain unrestricted. There is no
   automatic wager or required self-bet. Legacy outright and advancement
   tickets keep their original settlement and payout contracts; they are not
   converted to new winner bets. Awards pay 400/800/1200/1600 by
   session (`AWARDS` keys ARE the legal event values). Crew (a draw's roles)
   earn the event's 3rd-place award, and a bracket's two semifinal losers split
   3rd, each share floored to 100s; `resultAwards` is the one derivation every
   surface reads. The at-risk cap is `maxRisk(pts)` = pts/2 floored to 100s, never
   capped under 500 (`MAX_RISK`), and it bounds duel antes too (accepted duels
   plus your own waiting offer, `duelReserve`) or a duel would be a way around it. Stake <= balance minus at-risk, stakes move in 100s. Betting UX
   is video roulette: a fixed rack (100/200/500/1000, features/wagers/Wagers.jsx `RACK_DENOMS`)
   selects the tap stake and carries the only economy readout, a meter that
   DRAWS the cap instead of narrating it: the bar is your whole stack, the
   notch is `maxRisk`, the gold is your bet exposure, an outlined segment is
   duel antes, anything past the notch after a correction is drawn in the loss
   color, and the gap between them is what is left to bet. When the cap binds,
   + reads "Max N". It stays up when you are maxed out, since that is when
   it explains the most, and it is labelled with numbers, never a phrase.
   Tapping + on an eligible side of the current contest adds that chip, with
   its value stamped on its face. Tapping your stack retrieves its last chip.
   Player identity targets open player cards independently of chip actions.
   TV mode is the constant status: the live scene carries an UP NOW banner and
   gold outline for `nextOpenMatch(br)` (the next seated, undecided matchup,
   also in the ticker and phone live strip), value chips ride the TV bracket
   and board cells, and bracket draw reveals announce first-round matchups.
   A team or heats event is ONE GM tap (`announceAndDraw`), confirmed from a
   crew line prefilled with whoever has sat out least: draw, bracket seed, and
   betting open land in one server write and one broadcast, so every phone
   plays the intro then hands over to the reveal by itself after
   `INTRO_HOLD`. Drawing before the announcement put matchups on screen
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
   Walkout audio is a cue chip beside the pill, played only by an explicit
   GM tap, never fired from a scene or action (Spotify policy). Cues are also
   offered for the current contest's players after lock-and-start and for the
   seated players at the poker start; the chosen speaker persists in
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
   two-through requires the winner plus one other qualifier. Finish every
   match or heat and the final before posting the event result. FFA goes from
   play to its normal event result entry. New writes carry `contestId` and
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
   event has started.
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
   remain hard disabled.
12. **Show Control is recoverable presentation state, not tournament truth.**
   State schema `v:8` introduced `showControl`. Its active scene and step are
   persisted by the Durable Object, so every TV reconstructs after refresh or
   reconnect. Scenes reference current official events, results, and standings
   instead of copying them. Commissioner commands are capability-gated and
   duplicate-safe; skip, cancel, retry, and a safe ambient fallback are always
   available.
13. **Provider credentials are private infrastructure state.** Spotify client
   credentials are Worker secrets. Application tokens stay in Worker memory;
   GM access and refresh tokens use `private:spotify:*` Durable Object keys.
   Private keys, GM tokens, and internal backups are excluded from portable
   snapshots. Clients never receive raw state: every socket gets a
   `publicState` projection (worker/publicState.js). Ratings go to the GM and
   their owner, sizes and flights to the GM and their owner, device ids and
   replay keys to nobody; the TV route and unclaimed devices get the public
   view. A socket is bound to the device id of its hello. Tournament state may contain only validated public walkout-track
   metadata, and Show Control never depends on playback success.
14. **Previous-contest correction is explicit and guarded.**
   `contestUndoAvailability()` supplies the eligibility and explanation;
   `undoLastContest` validates the previous contest id and current revision.
   Correction is allowed while the next contest is open, locked or in
   progress but undecided; that contest's pending chips are voided in the same
   write and named in the confirm ("Returns Evan 200"). The winner tap offers
   a 5-second Undo. It is unavailable after the
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
- `/dev/contest-preview.html` - local development rehearsal using actual
  Wagers, ContestPanel, player cards, and `applyAction` against sample state in
  memory. Includes FFA, a six-team bracket, two-through heats plus final, and
  an existing mid-event scenario; switch guest/commissioner/player and simulate
  failed acknowledgements. No WebSocket, persistent storage, or remote data.

The September 26 fix pass (every finding from the Sept 26 audit plus the
Sept 7 FD list) passes 316 tests and the 138-check local e2e. It is deployed to
staging as version `69ef6834-4e5d-485d-9276-977255e545c1` (build `b089c73`); the
previous staging build is tag `staging-7c2c9f15`. The first
production deploy after it migrates `wagerOps` to its own storage key on the
next write: take a snapshot first. See `docs/UX-REPAIR.md` for
the browser checks and separate historical records. The isolated actual-sheet
preview is `/dev/efficiency-preview.html`; rebuild its transport-stubbed
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
    the rule and drop the rationale, unless the rationale is the joke.
  - A dry aside is welcome where a rule sounds arbitrary ("to limit the damage
    of one bad decision, only half your points can be at risk"). Dry, never
    zany.
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
  `src/ui/experience.css` (:root) are the only color source: no raw hex outside :root and
  PLAYER_COLORS, tints via the --*-tint tokens, shadows via --shadow-1/2/3
  (deep warm, never pure black), radii 6/10/14/16/99. Phase palette: pool
  (Fri), sun (Sat AM), terracotta (Sat PM), clay (Sat night), night (Finale).
  Flat scorecard components, chip identity for players (30 claimable colors
  plus 6 edge-tick skins, first come first serve, gray until claimed, locked
  once the weekend goes live except one first claim by a still-gray straggler), subtle grain (screen blend). The mark is the FD chip: a sun-gold betting chip with bone
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
