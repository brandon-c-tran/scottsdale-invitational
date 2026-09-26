# Product audit synthesis — September 7, 2026

Keep the current navigation and visual identity. The evidence calls for a
short queue of blocked-task repairs, followed by shared event, result and role
contracts. Poker's transition from playing to collecting counts needs a
deliberate workflow redesign. Another broad visual or copy rewrite would not
address the verified failures.

Sources: [player audit](audit-player-2026-09-07.md),
[commissioner audit](audit-commissioner-concurrency-2026-09-07.md), and
[TV audit](audit-tv-2026-09-07.md). Finding IDs below refer to those reports.
These are recommendations; this synthesis changed no product code or data.

Home / Events / Bets / Weekend remain the four guest areas, with Trip / Rules /
Games inside Weekend. Preserve the visible 13-player leaderboard, direct chip
placement/retraction, separate player-card targets, saved identities and
answers. Preserve Brandon's wording and the useful event entrance, draw/replay,
pick motion and winner celebrations. Reduced motion must retain access to
the same information.

## 1. Finish check-in at any point in the weekend

**Patch. Evidence: PA-01, PA-07.** A late guest is required to choose a color
that the live picker and server will no longer let them choose. Root confirmed
this in the browser; ordinary pre-weekend check-in and color claims worked.

**Acceptance:** an uncolored late guest can finish with a valid default
identity or a deliberately supported first claim. Established colors stay
locked, completed guests bypass setup, and saved answers survive failed
submissions. Required rating choices have actual 44px targets at 320px,
without changing their labels or values. Repair the entry condition and
remaining small controls; retain the existing six-step flow.

## 2. Complete the Quick Draw attempt and its recovery path

**Patch the attempt lifecycle; add a compact result route. Evidence: PA-02/06.**
Challenge/decline already wait for acknowledgement, but the timed game marks
an unsaved run done, and its error toast is behind the game.
Settled-duel review is missing from inspected routes;
confirm its final placement through browser review.

**Acceptance:** capture one reaction, show pending, and offer visible retry
of that same reaction on failure. A lost acknowledgement never grants another
attempt at a better time. Reaction taps obey the early-tap and single-run
rules. A returning player can inspect
saved times and the result, including ties/voids. Keep the suspense and flash,
and use an existing personal history/card route rather than another Home box.

## 3. Extend safe concurrency to official results and poker

**Consolidate the action contract. Evidence: C10/11/12/15/16.** Existing contest
and draft references already handle three commissioners correctly. Older
result correction/clear and poker commands can overwrite newer work or delete
a replacement table. Different-player count edits safely coexist.

**Acceptance:** result correction/clear carry the reviewed result revision;
poker commands carry a table-instance identity; count edits identify the
saved count they reviewed. Stale edits keep their local draft and show the
new committed value for review. Same-action retries remain harmless, and
different-player count edits remain parallel. Apply one explicit frozen-board
correction policy. Show the last committed outcome and next operation in the
shared event workspace. The evidence supports safe concurrent operators,
not a global one-commissioner lock or a new admin dashboard.

## 4. Consolidate the live contest workspace and personal assignment

**Consolidate the read model and existing event destination. Evidence: PA-05,
TV-01, TV-10.** Home derives my next assignment but replaces it with current
contestants. TV separately scans preparations and can displace actual play.
The shared operation resolver also gives a newer preparation precedence in
one ordering, so removing only TV's scans is insufficient.

**Acceptance:** one corrected shared selection supplies current event,
contest, lifecycle and next action. Preparing/shelving another event in either
order never makes that preparation look live. Home and TV name the same first
event before play. The event workspace retains room activity plus my own
partner/next-match, elimination or qualification status, with rules and the
actual bracket/heat context. Host actions and guest bets reference that same
contest. Role labels use existing metadata across phone and TV.

This is the existing event destination reached from Home, Events and Bets,
not a fifth navigation item. Bets remains the direct chip board, with a clear
context link and return path. Reuse the actual matchup rows and player-card
targets; avoid duplicate winner forms or another Home hero.

## 5. Give poker a coherent playing, counting and posted-result flow

**Scoped workflow redesign, reusing the existing counter. Evidence: PA-04,
TV-05, C14–C17.** A personal count currently changes every phone's workflow,
hides other players' bust controls, and is mostly invisible on TV. TV labels
old balances as standings and can show “+0 each” for a poker winner.

**Acceptance:** personal counting does not silently remove valid live seat
actions. Shared count collection has an explicit meaning visible to players,
commissioners and TV. Show received/missing counts and discrepancy; the host
reviews and posts once. Original balances say starting chips, and busted
players are marked in those rows. Posted results show official final stacks
and the same champion everywhere. Share a result presentation model that
distinguishes event awards from poker stacks. Retain physical cards, earned
buy-ins, denominations, settlement and ChipCounter's acknowledged retry.
Use the session/count safeguards in workstream 3.

## 6. Make TV a public, complete and recoverable view

**Consolidate the role data boundary and TV presentation. Evidence: TV-02–09,
C27.** Unclaimed TV receives full ratings/profile answers. TV lacks loading
and freshness cues, drops five players in directed standings, blocks on stale
scenes and loses ambient information under reduced motion.

**Acceptance:** public snapshots contain the identity, competition, standings
and presentation data needed to watch, without private ratings. Define access
for the player and commissioner, and the intended audience for logistics fields;
keep private answers off unclaimed displays. Test actual received payloads.
`saveSeeds` writes `state.seeds[player]` (`worker/actions.js:387`), while hello
and broadcast send `state:this.state` (`worker/tournament.js:612`, `707`).
The local unclaimed WebSocket reproduction confirms exposure; hidden JSX
does not protect that payload.

TV consumes workstream 4's activity selection and workstream 5's result
presentation. It distinguishes loading and disconnected last-known data,
falls back to useful content when optional scenes are stale, and keeps all
13 players accessible. Reduced motion retains scene access without animated
movement. Use the existing contrasting ink on yellow and a labelled 44px
Exit TV control. Preserve the large reveal and intentional host-triggered
audio. No new settlement calculation belongs in TV.

## Order and proof

Start the P1 entry/attempt repairs, stale-edit safeguards and public snapshot
boundary first. Correct shared activity precedence before simplifying TV
selection. Agree poker phase meanings before revising its screens.

Rehearse a player, spectator, three commissioners and TV against the same
saved state: late entry, rejected/lost acknowledgements, stale result forms,
replacement poker sessions, both preparation orders and return after
settlement. Compare public payloads, current contest and results across roles.
Then verify touch targets, reduced-motion access and 320px/TV layouts. Passing
existing tests is the baseline; add regressions for each repaired behavior.
Preserve the reports' distinction between actual browser,
component, network and code-inferred evidence when reporting completion.
