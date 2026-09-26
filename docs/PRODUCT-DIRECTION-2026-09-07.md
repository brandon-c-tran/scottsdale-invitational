# Field Day: changes that would make the weekend work differently

September 7, 2026 · Product proposals, not implemented changes

The biggest opportunity is to **move routine coordination from Brandon and his best men into the game flow**. A player should know their next job in a glance. Someone at the station should be able to finish a match without finding a commissioner. Hosts should be able to prepare the next event without disturbing the current one. The room should understand and enjoy each result as it happens.

The audit's bugs expose where that coordination currently lives in people's heads. Fixing those bugs matters, but a lower error count alone would leave much of the manual work intact.

The scope is mobile players and commissioners, plus TV. The revised [audit](PRODUCT-E2E-2026-09-07.md) contains 22 findings. The proposals below extend beyond it; their benefits are hypotheses to validate in a rehearsal, not measured improvements already achieved.

## 1. A shared run sheet for the three commissioners

**New capability:** one live event plus a separate preparing lane, with named ownership and a visible handoff.

Today the next-action control helps run the current game. It does not tell the other commissioners who is preparing the next game, whether that work is complete, or what is safe to change without affecting the room. The preparation/TV conflicts are symptoms of that missing distinction.

The next version should let one commissioner run the live event while another selects the next lineup, assigns crew and prepares a draw or captain setup. Preparing something should not announce it. A prepared game has an obvious Ready state; one promotion brings its announcement, current contest and player assignments into view together. A live draft remains a deliberate group activity; privately selecting its captain order does not need to interrupt an unrelated game.

For example, while Brandon plays 8-Ball, one best man handles the live event and another prepares Beer Pong. All three can see who is doing what. There is no need to ask whether teams were selected or reopen a setup form to find out.

This adds ownership, preparation and handoff. It should not become a large project-management dashboard. Keep one official live betting contest initially. Ownership communicates responsibility; it must not lock another commissioner out when help is needed.

**Success:** less verbal checking and fewer repeated setup actions; a shorter gap between the last result and the next game being ready. Measure those in rehearsal rather than guessing a percentage improvement.

## 2. Make the assigned crew able to run the event

**New capability:** narrowly delegated event authority.

An Event host or Scorekeeper badge currently describes a job without enabling much of it. Give one named, trusted person permission to record results for that event. Their Home entry opens the current matchup or heat with its actual result targets. The server accepts one official result, settles its bets and advances the next contest. Where the rules fully determine the final event award from the final matchup, that handoff should not require entering the same winner again in another form.

For example, Evan is 8-Ball scorekeeper. He taps the winning team at the table. The next matchup becomes current, its betting opens, the next players see their assignment and the room display follows. Brandon is free to participate rather than relay the result into the app.

I recommend **delegating once to a trusted recorder**, instead of asking every player to submit and approve every result. A general approval queue still requires commissioners to attend every finish. With 13 friends, a named recorder plus a visible history and commissioner takeover is a better initial fit. A commissioner remains the recorder for events without an assigned official. Multi-qualifier heats must still capture both the winner and other qualifiers explicitly.

This is a deliberate change to the current permission model, not a relabeling of an existing button. The authority is scoped to the assigned event; it is not full commissioner access. Record who posted, what contest they saw and which revision they changed. Corrections after the next betting market opens need a safe, understandable path before delegated scoring ships.

**Success:** routine matches finish and advance without commissioner intervention; errors are caught and corrected without ambiguous payouts. Pilot this with a bracket and a two-qualifier heat event before applying it everywhere.

## 3. Make Home my place in the live game

**New experience:** a complete participation lifecycle, shared across the existing destinations.

The same event needs different emphasis depending on who opens it:

| My state | What my phone should make obvious | Primary interaction |
| --- | --- | --- |
| Playing now | Partner, opponent, current game, concise play instruction | Optional self/team chip placement before lock; current play context afterward |
| Waiting to play | My partner and next match, alongside what is currently happening | Watch/bet on the current contest; inspect my assignment |
| Captain | Whose pick it is, available players and our forming team | Pick directly when it is my turn |
| Assigned recorder | The exact active matchup or heat and required outcomes | Record on the actual bracket/heat rows |
| Qualified / eliminated | My status and whether another contest remains for me | Prepare for the next round or move naturally into spectating |
| Spectating / crew | Who is up and my operational job if assigned | Place/retract chips or do the assigned task |
| Finished | What happened to my chips and where I stand now | Read the result and return to the current game |

During someone else's 8-Ball play-in, Brandon should still know that Chinh is his partner and semifinal 2 is next. When that match becomes current, the same context updates. He should not have to reconstruct the assignment by visiting the bracket, Home and Bets separately.

Home keeps its identity and the full 13-player leaderboard. Events supplies the schedule and full competition context. Bets becomes a useful view of that same current contest and the player's positions. They must not each maintain their own interpretation of what is live. Rules and player cards remain attached to the context that opened them.

The structural change is the full personal state model and uninterrupted event flow. Adding a single missing partner label is only a small piece of it. Readiness can be useful later, but do not make every contest depend on thirteen people tapping Ready. An optional captain signal or recorder start can be evaluated after the base flow works.

**Success:** a competitor, waiting player and crew member can each identify their next job within ten seconds, without leaving Home or asking a host.

## 4. Turn each result into a room moment and a personal receipt

**New experience:** one official result connects the shared celebration, personal consequence and durable record.

The animations are already valuable. Connect them to the rest of the experience:

- TV briefly reveals the winner, then shows the relevant standings movement.
- Each phone shows its own actual award, settled bets and new total. The spectator who won 100 and the player who earned the event award get different useful receipts from the same result.
- Events retains an expandable recap with the outcome, bracket/heat context and player changes, so missing a transient animation does not mean missing the explanation.
- At the end, those records can form a factual weekend recap: event wins, wager results, duels and a person's path to their final stack. A later keepsake can build on this without asking people to maintain a separate feed.

For example, a volleyball win gives the room a team moment. The winning players see their award; a successful bettor sees the bet payout; everyone sees where they now stand. The app has already done the bookkeeping, so the experience should make that bookkeeping understandable and satisfying.

Keep receipts brief and nonblocking. Let the room display hold useful current-game or standings information between actual moments. TV remains optional: no game should wait for a screen someone has not connected. Use factual highlights and Brandon's voice; automated banter or generated roasts would add the wrong kind of personality. Photos should wait for an easy, real capture workflow.

**Success:** people can explain their last chip change, find an outcome they missed and feel the shared finish without a commissioner narrating several screens.

## 5. Give poker a complete physical-table workflow

**New experience:** a coordinated finale with distinct handout, play, count, review and champion states.

Poker is currently spread across a clock, personal counts and a result sheet. A single personal count unintentionally changes everyone's mode. Treat the finale as a complete workflow instead:

| Phase | Player phone | Commissioner view | TV |
| --- | --- | --- | --- |
| Hand out stacks | Exact earned starting stack and denominations | Distribution progress and minimum-stack grants | Starting stacks and handout context |
| Play | Blinds, own starting reference, bust action | Table state and live controls | Clock, who is in/out, clearly labeled starting balances |
| Collect final counts | My counter and acknowledged submission | Who is missing; hosts can divide remaining players | Collection progress |
| Reconcile | Saved count and corrections if needed | Saved/proposed values, missing counts and discrepancy | Counting/review status |
| Post and crown | Official final stack and result | One final posting and championship handoff | The actual champion and final chips |

The hosts can split count review rather than verbally asking each other which players are done. Personal counting during play does not start final collection. Large discrepancies require a deliberate decision. Cards remain physical; there is no reason to build an online poker engine.

**Success:** a rehearsal reaches the champion with every role agreeing about the phase, who still owes a count and which totals are official.

## What the connected experience looks like

This is a proposed future sequence, not a description of the current implementation:

| Moment | Commissioner team | Player | TV |
| --- | --- | --- | --- |
| Current event is underway | One host runs it; another prepares the next event | Sees current action plus their own assignment | Holds current contest |
| A match finishes | Assigned recorder posts once; hosts intervene only when needed | Gets the result and personal chip change | Brief winner / standings moment |
| Next matchup opens | Existing event flow advances | Next competitors see they are up; others get the chip board | Same current matchup and betting state |
| Event finishes | Rule-defined outcomes complete the event; prepared next event is ready to promote | Event recap is saved; current context updates after promotion | Event finish, then next announcement |
| Finale begins | Hosts distribute and later reconcile together | Gets the action for the actual poker phase | Reflects that same phase |

## Recommendation and boundaries

Build proposals **1–3 as one complete game flow**: prepare an event, announce it, place chips, play, let the assigned recorder post, and advance the next contest with correct personal context. That is the main step change. It can remove work across the entire slate instead of improving one sheet.

Add proposal 4 to the same result pipeline so the operational simplification also feels more fun. Treat proposal 5 as the next complete workflow. The broad recap/keepsake can follow once event receipts are useful; it is not a prerequisite for the weekend running well.

The engineering follows these product decisions: explicit preparing/live event state, event-scoped permissions, one result/progression contract, personal and public views, and a poker phase model. Keep the existing single authoritative server and derived chip settlement. Existing profiles, answers, claims, wagers and completed check-in must survive the change.

Avoid expanding to multiple simultaneous betting markets, a general chat/feed, mandatory approval chains or timer-only automatic starts at this stage. Those would add coordination problems before the main one is solved. Keep the dark theme, direct chips, player cards, full leaderboard and useful motion; give them one connected job.

Sources: [full audit](PRODUCT-E2E-2026-09-07.md), [commissioner](audit-commissioner-concurrency-2026-09-07.md), [player](audit-player-2026-09-07.md), [TV](audit-tv-2026-09-07.md). The interactive report presents these proposals before the smaller findings.
