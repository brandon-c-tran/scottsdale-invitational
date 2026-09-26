# Field Day UX repair

September 5, 2026. Brandon's correction takes precedence over the earlier
light redesign: retain the dark theme, recover his voice, and make the whole
feature set easier to use. This is an acceptance reference for the local
repair. Validation and subsequent deployment records are below.

| Task | Route | Acceptance |
| --- | --- | --- |
| Return before the weekend | Home | First event and authored rules, upcoming events, and an always-visible 13-player leaderboard. Neutral rows show 1,000 Starting chips before play. No roster accordion, repeated check-in, or permanent house/travel block. |
| Follow live competition | Home | Current play and actual personal assignment first; direct rules and betting route, actionable duels, latest result, and all 13 ranked chip balances visible. The leaderboard replaces the separate own-score block and has one standings-details link. Home and the full standings sheet share the same leaderboard, including own-row treatment, rank-change feedback, and player-card targets. |
| Find an event or its rules | Events → event sheet | Keep session order, status, payouts, teams/brackets, and How to play together; return to the source view. |
| Watch or revisit the draw | Event announcement → draw; event sheet → replay | Keep the short event entrance and reveal actual groups in sequence. Skip and replay are explicit; reduced motion reveals immediately. Replay changes presentation only. Player cards become available as their groups appear. |
| Make or follow draft picks | Home / event sheet → captains draft | Visible captain and snake order, named available players and teams, latest pick, and crew. Current captain or commissioner picks directly; everyone can open cards separately. Commissioner undo, confirmation, and discard wait for acknowledgement. |
| Place and retract a wager | Bets | Select a chip denomination, tap + on an eligible current-contest side to add it, and tap your stack to retrieve the last chip. FFA winner pays 2:1; matchup, heat/pool winner, and stage final pay 1:1. Show pending, rejected, locked, and capped states at the action; preserve the ledger and retry guards. |
| Bet while competing | Bets | In a matchup, heat, or final, a competitor may optionally back themself or their own team. A spectator may back any current side. No automatic or required bet; FFA choices remain unrestricted. |
| Run the next contest | Commissioner → event sheet | One shared current contest: open betting, lock and start, select the winner on the actual bracket matchup or heat rows, then open the next contest atomically. Player avatars open cards separately. Only the current matchup/heat/final is bettable. A two-through heat requires its winner plus one additional qualifier. Finish the competition before posting its event result. |
| Correct the previous winner | Commissioner → event sheet | Restore the previous contest for winner entry with betting locked and a fresh revision. Block correction if next-contest chips remain or the next contest is locked/playing, and show the reason. Never silently discard wagers. |
| View someone | Player name/avatar → player card | The same public player card opens from the roster, standings, betting identities, and event participants/winners. Keep private ratings and travel answers out of public cards. |
| Find the address or update flights | Weekend → Trip | The house owns its check-in times. Own saved flights and Add/Edit flights are directly available. |
| Edit personal details | Profile → Card / Travel / Walkout | Flights links open Travel directly. Section changes preserve unsaved fields; one Save waits for the existing acknowledged profile/photo operation. |
| Understand tournament mechanics | Weekend → Rules | Restore the authored rules and voice, correcting only wording that conflicts with current mechanics. |
| Learn a game | Weekend → Games → game sheet | The game name appears once as the sheet title. Every objective, step, win condition, and house rule is retained and immediately readable; applicable variants are selectable. |
| Switch tasks and return | Home · Events · Bets · Weekend | Stable main navigation, remembered Weekend section, and preserved return context. Host operation has its own entry. |
| Finish check-in | Existing six-step flow | Preserve drafts and saved answers; advance after explicit acknowledgements. Pending writes guard navigation and duplicate taps. Completed guests bypass check-in. |

The later Home brief explicitly permits a new dark palette. The design uses
green-charcoal semantic surfaces, bone text, muted yellow and restrained lilac,
Barlow
Condensed display/score type, and Inter controls. Feedback and motion should
make an interaction clearer. Delete invented slogans, generic host letters,
borrowed casino idioms, and reassurance that states no useful fact.

Existing player IDs, device claims, photos, apparel/travel answers, ratings,
chip selections, logistics, event configuration, official results, settlement,
storage keys, and onboarding completion semantics remain compatibility
requirements. Do not reset data, force check-in, or change the deployed origin
or PWA identity to announce a redesign.

`resolveCurrentContest()` and the action validator share contest identity,
revision, phase, and eligible sides. Guest and commissioner surfaces must use
that authority. Mutations carry explicit contest references; stale writes
fail, and repeated acknowledgements cannot advance twice. Prepared or
unresolved matches elsewhere in the bracket are context, not open markets.
Legacy outright and advancement tickets retain their original settlement
contracts and payouts. An existing mid-event snapshot is not converted into
a different kind of wager by the new interface.

## Announcement crash fix: September 7, 2026

The staging browser captured `ReferenceError: Cannot access 'pn' before
initialization` in client `index-BNutL4Ta.js` when announcing Long Putt. The
render-time announcement guard read `simRef` above its later declaration;
initial load short-circuited that read, so isolated component checks missed it.
Moved the ref above its first use. The root now has a recovery boundary with
a Reload button, which reloads the client without clearing saved state.

Five new regressions render the actual App before and after real announcement
actions for guests and commissioner, plus reconnecting to an open event.
Restoring the old declaration order in an in-memory build makes all four
transition tests fail with the original error; the fixed source passes.
All 217 tests, syntax checks, staging build and deployment dry run passed.

Deployed as `7c2c9f15-340c-493b-a98f-c4d523b11636`, client
`/assets/index-Db_4K9wj.js`. Reloaded the crashed staging tab and verified the
new client, restored Home/leaderboard, and the existing Long Putt betting
window. No new browser error appeared; earlier crash logs remain historical.
No gameplay/profile actions, resets, or production changes were used.

## Draw and captains draft follow-up

Brandon's latest correction preserves delight as well as efficient layouts.
The compact announcement keeps its short game entrance before handing over
to the draw. The original game-specific moments (putt, pong shot, cup flip,
and the other existing SVG animations) are used again on phones and TV.
Atomic announce-and-draw actions reserve the intro first, including when a
prepared draw is already open; finishing a fast rehearsal no longer suppresses
later announcements. Covered groups reveal in sequence with player-color motion;
their hidden player controls cannot receive focus. Skip animation reveals
everything, Replay draw restarts presentation, and reduced motion shows the
complete draw immediately. A replay from event details does not redraw teams
or mutate gameplay. Winner celebrations, chip feedback and TV draft cues
remain, and Home again shows the shared leaderboard's rank-change feedback.

The draft now has a visible setup and live flow: choose captains in pick order,
start the draft, pick through the snake order, then confirm completed teams.
Manual, seeded/standings, and random captain selection share the same ordered
preview. The live view identifies the current and upcoming captains, available
players, named team seats, latest pick and crew. Home, event details and the
captain's notification open this view directly. Player-card targets are
separate from pick actions; spectators can follow without drafting.

Only the current captain or commissioner can pick. Commissioner undo returns
the player and turn; completed teams require confirmation, and cancellation
requires an explicit discard action. Picks, undo, confirmation and discard
carry the draft ID, pick index and revision. Stale actions cannot take a later
turn, retries preserve their acknowledgement contract, and undo creates a new
revision. A shared pending guard blocks duplicate or conflicting writes.
Failures retain the visible draft for retry; confirmation and discard close
only after success. Final teams retain captains and crew, and draft preparation
does not start the weekend. Existing unversioned drafts remain compatible.

Passed all 212 tests, syntax and whitespace checks, the staging build and dry
run. The 32 new domain, rendered-control and reveal-playback cases include
full snake progression, separate cards, permission checks, stale picks, undo,
failed acknowledgements, skipped animation and reduced motion.

Browser rehearsal used actual components and actions over sample state in
memory: captain selection, a captain's own pick followed by a locked next
turn, commissioner picks/undo, player cards, failed-save recovery, confirmation
into the reveal, skip/replay and the restored putt animation. Reviewed 390px,
320px, and the four-captain desktop layout; no horizontal overflow. The local
fixture has no tournament connection. The legacy remote E2E script was not run.

Published to staging as `54319135-a2a8-4fc2-b51d-b3fd10127f1c`, client
`/assets/index-BNutL4Ta.js`. Verified the published client, all 13 Home standings,
existing-event draw replay, skip, player card, and Back to the completed draw.
No browser errors or warnings appeared. Staging verification was read-only;
no game/profile submissions, resets or production operations were performed.
The existing bundle warning remains (about 563 kB minified). Records below
describe earlier passes.

## Implicit weekend start follow-up

Opening the first game's betting or starting play starts the weekend in the
same acknowledged action. Preparing teams, heats, a captains draft, or the
poker table stays preparation. Removed the separate weekend toggle and the
director's automatic opening step; manual Show Control scenes remain optional.
Legacy clients retain their existing action contract. A successful repeated
launch can repair an old inactive weekend once, without repeating game changes;
missing events and stale contest references cannot trigger that repair.

Passed all 180 tests, syntax checks, the staging build, and deployment dry run.
The 18 new cases cover launch paths, preparation, rejection, retry, director
sequencing, and manual chips on the actual wagering component before play.
The in-memory weekend rehearsal now begins through its first event. The
remote E2E script was syntax-checked only; its older wager flow still needs
contest-reference migration before execution.

Published to staging as `a8a9588a-6899-4057-b474-a46e773e4f9f`, client
`/assets/index-BJNSttrO.js`. Verified the staging target, loaded client,
authoritative Home/leaderboard, and absence of browser warnings or errors.
Live verification was read-only; no game or profile submissions, resets, or
production operations were used. The existing main-bundle warning remains.

## Identity color follow-up

The selected identity color now fills both sides of the player card. Text,
ornament, borders and photo framing use contrasting ink chosen for that color;
the same component serves check-in/profile previews and public cards. The
unclaimed color remains gray. Checked all 32 selectable colors plus gray
(minimum text contrast 4.51:1), 27 existing identity/player-flow tests, the
staging build, and the actual local front/back and deployed public card.
Published to staging as `63653eb8-be84-4133-a0fa-7ed9323cef3f`, client
`/assets/index-DtMf1n-k.js`. No saved identities were changed during checks.

## Current app-wide efficiency pass

Reduce repetition and empty framing while preserving useful information,
readable type, and 44px active controls. The changes are structural:

| Surface | Current behavior |
| --- | --- |
| Shared sheets | Desktop dialogs fit their content. Compact headers hold the title and relevant actions once; bodies avoid repeated titles, nested padding, and unnecessary cards. Scroll, focus, return paths, and pending-save guards remain shared behavior. |
| Event and draw announcement | Operational details and controls stay under one event title; the later draw follow-up restores the short entrance and sequential reveal. Winner selection happens on the real bracket matchup or heat rows, with separate player-card targets. No duplicated team chooser. |
| Bets | The fixed chip rack and ledgers are more compact. Direct placement/retraction, printed chip values, eligibility, limits, pending/error feedback, and settled history remain available. |
| Home | All 13 leaderboard rows stay visible. Own chips and rank appear in that list rather than a second score block; exposure and one details route stay with the leaderboard. Current participants precede the event actions. |
| Events and Weekend | Compact progress replaces the large statistics strip. Session rows use actual lifecycle status. Weekend removes redundant subsection headings and nested flight/award boxes; Trip starts with the address and saved flights, while game sheets retain all instructions under one title. |
| Profile and Travel | Live editing offers the card preview on demand and the current locked chip instead of disabled design grids. Public cards keep their identity and stats; Quick Draw instructions expand inline and ante values appear on the chips once. Responsive flight fields keep saved answers and edit routes. Unlocked check-in retains its card/chip choices and full venue introduction. |

### Efficiency validation and staging

This pass passed 162 automated tests, syntax checks, the staging build, and a
deployment dry run. Direct bracket/heat winners, pending and failed saves,
qualifiers, full-team FFA winners, chip counts, and known-winner result entry
have regression coverage. Result entry carries a completed competition's
winner forward; remaining prize places stay editable. Poker count rows are
direct controls with numeric denomination entry and acknowledged saves.

Browser rehearsal used actual components and authoritative actions over
isolated in-memory state: bracket lock/winner/next matchup, separate player
cards, heat winner plus qualifier and next heat, chip placement/retraction,
compact announcements, completed-result posting, count editing and failed
count retention. Reviewed 320px and 390px layouts and the desktop bracket.
Home, Events, Weekend and actual local profile/travel screens were reviewed;
narrow flight fields wrap instead of clipping airline codes and times.
No horizontal overflow was found in the reviewed narrow layouts. Unsaved
local profile drafts were discarded.

Deployed to `scottsdale-invitational-staging` at
`https://scottsdale-invitational-staging.btran-backdrop.workers.dev/`, version
`98cb2071-82db-4898-b8ba-99f690c5ddff`. Verified the live client
`/assets/index-N7OnskPw.js`, the restored live tournament state, full Home
leaderboard, and the single competition bracket in the event sheet. Live
browser verification was read-only and reported no errors or warnings.
Production and guest/game data were not changed. The build retains the
existing main-chunk warning (about 540 kB minified).

## Earlier contest repair: validation and staging

That contest repair passed 138 automated tests, including 11 core contest
sequencing tests, 11 real contest-panel tests, and 17 wager UI tests. The
component tests exercise actual guest chip placement, stacking, retraction,
participant/spectator eligibility, commissioner lock/winner actions, every
match of a six-team bracket, and three two-through heats plus the final.
They also verify required qualifiers, acknowledgement guards, failed-write
retry, exact correction references, and correction blocked by next-contest
chips until those chips are removed.

`/dev/contest-preview.html` is the local end-to-end rehearsal entry. It uses
the real Wagers, ContestPanel, player cards, and `applyAction` with sample
state in memory. Scenarios cover Long Putt FFA, a full six-team 8-Ball bracket,
two-through Ping Pong heats and final, and an old event already in progress.
Switch commissioner/guest and player, inspect the draw and action log, and
simulate failed acknowledgements to retry the same visible action. No
WebSocket, storage, or remote service is connected.

Browser rehearsal checked actual FFA chip placement/retraction, participant
and spectator matchup boards, opponent cards, lock/start/winner handoff,
safe correction, and the current-heat board at 390px and 320px. The narrow
boards had no horizontal page overflow. Full tournament and multi-qualifier
heat/final flows also pass the real-component/action tests.

Published to the existing staging environment on September 5, 2026, continuing
the staging workflow. Version `8de8317f-f36e-434d-ae7b-3887db8b574f`, client
`/assets/index-6ZAPE5b2.js`, at
https://scottsdale-invitational-staging.btran-backdrop.workers.dev/.
Verified the staging target, empty production routes, isolated Tournament
binding, published script, all 13 Home leaderboard rows, current-match betting,
direct full-bracket navigation, and no browser errors. Syntax checks, 138 tests,
staging build and dry-run passed; the production build also passed before the
last navigation-only adjustment. The existing bundle-size warning remains
(about 535 kB minified). No production deployment, reset, import, or remote
gameplay/profile submission occurred. The remote authenticated host workflow
was not used during verification. The following deployment is historical.

## Earlier staging deployment: September 5, 2026

Deployed the earlier reviewed Home redesign with explicit user authorization to
`scottsdale-invitational-staging` at
https://scottsdale-invitational-staging.btran-backdrop.workers.dev.

- Worker version: `8adf26d6-2e23-4b15-abe7-4a3991893284`.
- Published client: `/assets/index-hhD1V0KP.js`.
- Verified `APP_ENV=staging`, empty custom routes, isolated Tournament binding,
  staging shell, and absence of development fixtures from published assets.
- Browser loaded the authoritative staging snapshot and the new green-charcoal
  Home. Direct game rules and all 13 standings rows opened successfully; the
  browser reported no JavaScript errors.
- No game actions, profile edits, resets, imports, or production operations
  were performed during the deployment check.

## Earlier Home redesign validation

The Home follow-up passes all 110 automated tests, syntax checks, and both
production and staging builds. The home model uses shared lifecycle and
settlement helpers; it neither persists state nor invents live progress from
a prepared draw. Before/live/poker/final modes, personal teams and roles,
betting capacity, private-data boundaries, navigation, and failed-action
retries have dedicated coverage.

Browser checks used the real Home, cards, rules, standings, Wagers, and
HomeDuels at 390px and 320px. Checked direct rules, player cards, nested
Standings → player → Back, betting entry, limits, crew, result entry, final
standings, and failed-decline retry. No horizontal page overflow appeared at
320px. The actual local app also passed rules, standings/card return, and
Home → Trip navigation checks. The existing PokerCard remains the Home
finale content; its live host workflow was not re-run in the browser.

`/dev/home-preview.html` provides Before, Betting open, Playing, Crew,
Awaiting result, At limit, and Final scenarios. It runs on sample state in
memory with actual components and the existing action validator. Its Play
button opens a labeled demonstration sheet rather than simulating a reaction
time. It has no WebSocket or persistence and is absent from built assets.

The builds retained the main-bundle warning (about 525 kB minified) and missing
local `GM_PIN` warning. This validation preceded the separately recorded
authorized staging deployment above; validation itself changed no guest data.

## Earlier repair validation

All 84 automated tests, syntax checks, production build, staging build, and
tracked whitespace checks pass. The generated staging target is
`scottsdale-invitational-staging`, with `APP_ENV=staging` and no production
routes. Neither environment was deployed.

Browser checks covered Home, Events, Weekend, player cards, profile sections,
and nested game instructions. Home, Events, Rules, game sheets, and the wager
board were checked at 320px without horizontal page overflow; the principal
phone interactions were also checked at 390px. Closing nested sheets restores
focus and page scrolling; flight drafts survive profile section changes.

The development-only page `/dev/ux-preview.html` uses the real Wagers,
PlayerSheet, and action validator with sample state in memory. Browser checks
confirmed chip stacking/retraction, separate player-card targets, cap recovery,
locked chips, failed-action feedback, and retry. It opens with `npm run dev`
and is excluded from production assets. No preview action uses a WebSocket or
writes guest data.

Builds retain the existing main-bundle size warning (about 512 kB minified)
and report the missing local `GM_PIN`. A full authenticated host rehearsal
was not run in this pass. Domain/action rehearsals and component fixtures
cover the related contracts. No remote data was accessed or changed, and
browser edits to existing local profile fields were discarded without saving.
