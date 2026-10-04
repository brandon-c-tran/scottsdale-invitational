# Player journey audit — September 7, 2026

Scope: the current working tree's player experience, including first check-in,
returning guests, player cards, events/rules, wagers, captains drafts, duels,
poker, Weekend, and connection/accessibility behavior. This is a read-only
product audit. No product files, remote services, saved guest answers, or
tournament state were changed. Sample actions ran only against cloned state
in memory. Commissioner and TV audits are separate.

The coordinating root task subsequently supplied browser observations. Those
are attributed explicitly below; this auditor did not operate the browser.

**Verified** below means reproduced with the actual production component or
action in an isolated Node render/handler check. It does not mean browser,
screen-reader, or physical-device verification. **Code-inferred** means the
interaction follows from inspected routes/CSS but was not reproduced in a
browser. Line references describe the audited working tree and may move.

P1 blocks a primary player task or presents an unacknowledged operation as
complete. P2 materially impairs the task, recovery, or access to it.

## Findings

### PA-01 · P1 · A guest checking in after play starts can get stuck at Card

**Verified.** With `state.live = true`, a valid display name, and no saved chip
color, step 4 renders “Chips are locked for the weekend” and a disabled
Continue that requires choosing a chip color. There is no available color
choice. This affects a guest who did not finish identity setup before the
first event; it is not an issue for a returning guest whose color is saved.

Evidence:

- `src/features/check-in/Onboarding.jsx:105` requires a saved color to continue.
- `src/features/profile/ProfileEditor.jsx:95` locks the entire picker when
  `state.live` and returns only the saved design summary.
- `worker/actions.js:350` rejects a guest changing their color after play starts.
- The isolated step-4 render used an otherwise valid name and confirmed both
  the locked summary and disabled continuation.
- **Root browser confirmation:** after Long Putt started, first-time guest
  Khoa saw both “Chips are locked for the weekend” and “Choose a chip color to
  continue”, with Continue disabled and no color chooser. Before play, Brandon
  and Evan each completed all six steps; a claimed color correctly became
  unavailable to the other guest.

Repair criterion: provide a deliberate late check-in path that can finish
with a valid default identity, or permit a safe first claim while keeping
established identities locked. Do not reset the weekend or anybody's chip.

### PA-02 · P1 · Quick Draw presents an unsaved run as finished

**Verified.** The tap handler sets the local run and `done` phase before calling
`onSubmit`. It never awaits or checks the acknowledgement. A rejected/offline
submission therefore still shows “Your draw” and “Waiting on [opponent]”, with
no retry for the captured reaction. Closing and reopening can offer a new run
because the authoritative duel still has no saved run for that player.

Evidence:

- `src/App.jsx:3538`–`3550`: armed/go handlers store the local result and invoke
  `onSubmit` without observing its promise.
- `src/App.jsx:773`: `playDuelRun` returns the normal acknowledged action.
- `src/App.jsx:1667`: the generic rejection toast is at z-index 150; the opaque
  Quick Draw screen at `3554` is at 300. That toast cannot supply visible
  recovery while the game screen is open.
- An isolated actual-component run returned `{ok:false,error:"Offline"}`;
  its server sample retained empty `runs`, while the component showed the
  completed reaction/waiting state and no save, error, or retry control.
- **Root browser confirmation:** Brandon and Evan each tapped after leaving
  the Draw cue open for over 38 seconds. The game displayed 38,031 / 38,136 ms,
  “Waiting on [opponent]” and “It settles when they play”, while the real server
  rejected both attempts with “Bad time”. Neither run was accepted. Recovery
  required closing and reopening the game. This was an actual invalid-time
  rejection, separate from the isolated offline reproduction above.

Repair criterion: capture the reaction once, show pending, and distinguish a
saved run from a failed submission. Retry must submit that same captured
reaction, not allow another attempt at a better time. Coordinate this with
server idempotency and a broadcast arriving before a delayed acknowledgement.

### PA-04 · P2 · Another player's count removes my poker bust action

**Verified.** During the first live poker level, the guest can see Count and
I busted. After a different player submits any chip count, `countPhase`
becomes true for everyone and the guest is switched to the counter. The
I busted action is no longer rendered, although the table is still playing
and `pokerBust` remains a valid server action. After saving a count, the row
offers Recount but still no bust action.

Evidence:

- `src/App.jsx:1940`: `countPhase` includes `counted.length > 0`.
- `src/App.jsx:1964`–`1999`: counted/counting branches replace the active seat
  controls rather than supplement them.
- `worker/actions.js:1551` and `1573`: busting and counting remain separately
  valid during live play.
- Actual `pokerSetup`/`pokerStart` followed by Evan's `pokerCount` changed
  Jeremy's actual PokerCard from I busted to count entry.

Repair criterion: retain relevant seat actions during counting, or make the
end-of-table counting phase an explicit shared state. A single player
checking a stack should not silently change every other player's workflow.

### PA-05 · P2 · Home loses my assignment when someone else's contest is current

**Verified.** The home model correctly derives a later team's partner and
next match, but the rendered event focus takes the current-contest branch
whenever a matchup/heat/final exists. That branch shows current participants
and only a “You're playing” marker for those in it. A player waiting for their
own match must open the full event to recover their partner/opponent/status.
The same branch can hide eliminated/through status between contests.

Evidence:

- `src/features/home/GuestHome.jsx:58` chooses current contestants instead of
  the `Assignment` renderer at `20`.
- `src/features/home/homeModel.js:58` derives the player's actual assignment.
- An actual six-team draw produced a non-current player with a known partner
  and next-match assignment; the Home focus rendered neither the own-partner
  nor next-match cue.

Repair criterion: preserve current room activity and the player's own next
task as distinct facts in the same event focus. Reuse the existing assignment
model; do not create a competing event or matchup resolver or a second hero.

### PA-06 · P2 · A settled duel has no durable player review route

**Code-inferred.** A player who closes Quick Draw before the opponent plays,
or returns after settlement, can see a changed balance and aggregate duel
record, but has no visible route back to that duel's reaction times and result.
Home filters settled duels away; the global toast depends on observing an
open → settled transition; the player card only reports aggregate wins,
losses, and net chips. Bets history covers wagers, not duel records.

Evidence: `src/features/home/HomeDuels.jsx:101`, `src/App.jsx:631`–`650`,
`src/features/profile/PlayerSheet.jsx:77`–`80`, and the pending/settled ledgers
in `src/features/wagers/Wagers.jsx:300`–`333`.

Repair criterion: provide a compact durable route to recent personal duel
results, including ties/voids. Keep the open-duel actions concise and retain
the full leaderboard; this need not become another permanent Home panel.
Browser acceptance should include leaving before settlement and returning
after the opponent has played.

### PA-07 · P2 · Some required or live player controls still fall below the 44px target

**Code-inferred from explicit CSS/inline sizes; measure on devices.** Private
ratings require many repeated choices but use 38px-high buttons, reduced to
34px below 359px. At a 320px viewport the five-column layout leaves roughly
36px per option. Poker Count/Recount/Wrong, back in use small text with 4px
vertical padding and no minimum target height. These exceptions remain even
though newer player cards, draft actions, chip controls, and travel fields
use larger targets.

Evidence: `src/features/check-in/arrival.css:73`–`81` and `118`–`119`;
`src/App.jsx:1970`, `1980`, and `1999`. Walkout selection also overrides the
shared button minimum to 38px at `src/App.jsx:4009` and Remove song to 40px
at `4049`.

Repair criterion: retain the existing labels and choice semantics while
giving the actual interactive boxes at least 44px. For ratings, change the
small-screen row layout instead of shrinking five choices into the same width.

## Journey coverage and what already works

| Player task | Observed behavior and remaining limit |
| --- | --- |
| First visit and check-in | Install entry, roster claim, tournament explanation, trip details, card, and private ratings form one six-step flow. Forms wait for the first snapshot, hydrate saved answers, and guard acknowledged saves. Failed photos keep their draft and can retry. PA-01 is the live late-arrival exception. |
| Return to the app | Local completion bypasses check-in; the device reclaims its player on reconnect. A cold start already has an Opening Field Day overlay until the first snapshot. A suspected fake-board loading issue was ruled out. Actual first-live broadcasts and fresh reconnect to an open event pass the App regression. |
| Identity and player cards | Home retains all 13 rows; own-row, standings, event participants/winners, wager identities, and drafts open public cards independently from actions. Cards use saved identity colors and exclude travel/private-rating fields from their displayed content. The header avatar intentionally opens the editor; list identities open public cards. |
| Events and rules | Events preserve session order and lifecycle status. Event rules open over the event, and closing restores it. Game sheets retain objectives, steps, variants, win conditions, and house rules. Draw replay reads saved assignments and returns from cards to the completed draw. PA-05 concerns Home's summary rather than missing event data. |
| Bet as competitor/spectator | Both views use the same current contest and server references. A competitor can optionally back self/team; spectators can back current sides. FFA is unrestricted. Opponents remain visible with a reason. No automatic wagers. |
| Stack, retract, and read outcome | Denominations add directly to a side; the player's stack retracts its newest chip. Locked/capped states retain context. Pending actions and rejected retractions retain the authoritative stack. Legacy outright/advancement contracts remain distinct; settled wager history is durable. |
| Draft as captain/spectator | Captain setup makes order visible. The live draft has turn, snake queue, named teams, pool, last pick and crew. Only the current captain/commissioner can pick. Others can open cards. Exact references, pending guards, stale rejection, undo revision and close-only-on-success are covered by actual-component tests. |
| Challenge and play a duel | Challenge/ante eligibility accounts for both balances, other wagers, reserved antes, the pair limit and daily limit. Sending and declining have guarded acknowledgements. New challenges disappear during poker/freeze. PA-02/06 concern the older game and post-game path. |
| Play and finish poker | Home changes to blinds/timer, own buy-in, bust/count actions and the full starting-stack board; old betting/duel prompts disappear. ChipCounter preserves counts across failed saves and supports numeric denomination entry. Final chip posting changes Home to final standings. PA-04/07 concern live seat controls. |
| Find address/edit flights/profile | Weekend remembers Trip/Rules/Games. Trip presents the address, maps route, check-in times and own saved flights; Add/Edit opens Travel. Profile section changes keep unsaved fields; one save waits for profile/photo operations. |
| Offline/reconnect | Existing snapshots remain available with Reconnecting status. Transport rejects offline writes, limits unanswered requests to six seconds, retries selected actions with the same action ID, and restores a fresh version baseline on socket open. Photo upload has a 20-second deadline. Real suspended-device, lost-ack, and multi-client reconciliation still need a browser/transport rehearsal. |
| Touch controls and reduced motion | Shared sheets guard pending saves. Player cards have separate native button targets. Draws can skip/replay and reveal immediately with reduced motion. PA-07 identifies the remaining inspected small-target exceptions. |

## Consolidation opportunities

1. Use one acknowledged-operation pattern across player submissions. Check-in,
   profile, draft and ChipCounter already distinguish saved/failed/pending;
   Quick Draw should inherit that behavior without inheriting a generic form
   layout. Preserve captured values during retry.
2. Keep the shared current contest as the room's authority, and use the
   existing home assignment model for the player's next task. Current contest,
   personal assignment and bet eligibility answer different questions; do not
   let one replace the others.
3. Give points that move asynchronously a durable explanation route. Wagers
   already have one; duel outcomes are the gap. Reuse public-card/history
   navigation rather than adding more one-off overlays or Home boxes.
4. Bring the remaining older player controls under the same touch-target
   and acknowledgement conventions as the extracted features. This is
   a behavior pass, not another copy or visual redesign.

## Validation and follow-through

118 existing tests passed across check-in, photo upload, identity/player flow,
Home model/duels, wagers, draft UI, draw reveal, shared controls, mounted App
announcements, and chip counting. Additional isolated actual-component checks
reproduced PA-01, PA-02, PA-04 and PA-05. No remote or stored game data was used.

Prioritize late entry and Quick Draw's submission/recovery path, then the
poker phase and Home assignment gaps. Browser follow-through should include
a late first-time guest during play, a disconnected Quick Draw submission,
one premature poker count, a waiting/eliminated
player's Home, returning after a duel settles, and 320px rating/poker targets.
Test cross-device acknowledgement loss and background/resume explicitly;
passing isolated component tests does not establish those transport outcomes.

There was no staging or production mutation, deployment, or browser operation
in this audit. Fixes are proposed, not implemented by this audit.
