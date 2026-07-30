# Field Day M2 implementation plan

**Milestone:** M2, Spectacle and Social Layer  
**Baseline commit:** `c630b3f`  
**Current slice:** local Matchup Stakes product surface and Postgame Props vertical slice
**Date:** July 29, 2026
**Remote operations authorized:** none

## 1. Repository audit findings

### 1.1 Baseline validation

Before M2 changes on July 28, 2026:

- branch: `m2/spectacle-foundations`
- worktree: clean
- `npm run check`: passed
- `npm test`: 25 passed
- `npm run build`: passed
- `npm run build:staging`: passed with the expected local missing-secret warning
- no remote environment or production data was accessed

### 1.2 Architecture

```text
React phone / TV
  -> action messages and full-state WebSocket frames
Cloudflare Worker
  -> routes every tournament request to one Durable Object
Tournament Durable Object "main"
  -> validates, persists, updates memory, broadcasts
shared/core.js
  -> shared gameplay, lifecycle, settlement, standings
```

The current coordination model is the right M2 foundation. One weekend is one
coordination atom. Directed presentation should be another bounded fact in the
same object, not a separate state service or client leader.

### 1.3 State and lifecycle

- state schema is `v:7`
- hydration backfills missing top-level keys and preserves unknown keys
- `eventOps` stores only lifecycle distinctions not derivable from existing
  gameplay facts
- `resolveEventLifecycle()` and `resolveWeekendOperation()` are shared by
  Worker and app
- normal actions use one storage write for state and transport version
- the Worker updates in-memory state only after persistence
- reconnect sends the full state, version, environment, and capabilities

M2 implication: add a small `showControl` record in `v:8`. It references event
and result facts but does not restate or mutate them.

### 1.4 Current presentation

TV has:

- ambient scene rotation every 12 seconds
- board, join, next, latest, betting, live bracket/stage, draft, poker, and
  champion presentation
- a ticker built from official results, wagers, duels, rulings, crew, and
  lifecycle
- reduced-motion handling
- a local ambient scene index

Phone and TV also have client-side `EventIntro` and `Reveal` overlays. Reveal
coalescing already prevents returning clients from replaying a backlog.

M2 implication:

- keep ambient rotation local because it is non-operational
- persist directed scene selection and step because the GM relies on them
- suppress legacy overlays while a directed scene owns TV attention
- reuse `Avatar`, `AvatarStack`, `GameMark`, `VersusDraw`, `ChampionCard`, and
  current standings presentation before extracting new component files

### 1.5 Interaction system

Existing primitives:

- `Btn` with `primary`, `flame`, `ghost`, `dark`, and `danger`
- `Sheet`
- `Tag`
- `PlayerChip`
- local style constants and semantic CSS variables in `Shell`

Inventory:

- 96 `Btn` uses in `src/App.jsx`
- 80 direct `<button>` elements in `src/App.jsx`
- 5 direct `<button>` elements in `PhotoCropper.jsx`

Direct buttons include intentional selection and spatial controls, but also
repeat icon, confirmation, menu, compact, and floating-action styles. `Btn`
kind names describe appearance more often than hierarchy. Loading and duplicate
tap behavior are usually handled by each caller.

M2 implication: do not migrate every button in the Show Control slice. Use the
existing primitive for the first surface, then introduce semantic action
primitives in the next slice with a written migration inventory.

### 1.6 Profiles and media

- player IDs are stable shipped names
- profiles store display name, number, size, travel answers, color, skin, and
  a `photoV` cache-buster
- photos are separate Durable Object entries capped at 120 KB
- photo writes persist the body before publishing the profile reference

M2 implication: walkout metadata is an additive optional profile field. It must
be validated in `saveProfile` or a dedicated action. Provider images remain
remote metadata; preview audio is not stored.

### 1.7 GM controls

- commissioner unlock uses a server-only `GM_PIN`
- `gmNext` maps the shared weekend operation to one action
- secondary and destructive tools live in the commissioner sheet
- QA is capability-gated and uses real actions
- reset creates an internal backup and preserves people plus event
  configuration

M2 implication: Show Control belongs in the commissioner sheet but may not
replace `gmNext`. The event lifecycle remains primary. Show controls get their
own sheet and clear status.

### 1.8 Betting, results, and honors context

- results are revisioned and correction-audited
- settlement is derived
- brackets and stages already expose meaningful match completion points
- duplicate wager delivery is bounded and idempotent
- the book accepts outright, bracket-match, and stage wagers under one on-deck
  event
- each bettor is paid independently at fixed 2:1 or even-money deltas

The fixed payout is house-backed. A 100-chip loss removes 100 from aggregate
player supply while a 100-chip even-money win adds 100 and a 100-chip outright
win adds 200. This conflicts with the M2 invariant that betting only
redistributes chips. Existing duels are zero-sum. Poker converts the current
board exactly apart from its explicit, reversible minimum-stack grants.

Historical wagers cannot be safely pooled after the fact because no
counterparty or locked pool terms exist. They remain readable under the M1
resolver. The safe migration is a capability cutover: verify that no legacy
wager is pending, stop offering new legacy placement, and then expose the new
contest-market UI. Never rewrite historical balances.

M2 implication: honors, winner scenes, and contest settlement reference result
revision or bracket coordinates. They never store a winner as a second fact. A
cleared or corrected result is resolved from current official state.

### 1.9 Configuration and deployment

- runtime environments are explicit
- local and staging repeat their Durable Object bindings
- production deployment is manual through a GitHub environment
- generic deploy refuses to choose a target
- runtime capabilities currently cover QA, progress reset, restore, and
  snapshot export

M2 implication: add one capability per unfinished system. Local may enable the
slice. Staging and production default off until approved. No external feature
flag service is needed for this one-weekend product.

### 1.10 Tests

- focused Node tests cover state, actions, snapshots, capabilities, and
  publication ordering
- deterministic rehearsal executes every event and poker
- WebSocket E2E covers two clients and reconnect
- no component test framework, type-check, lint, or formatter is configured

M2 implication: pure scene and action tests go into a focused M2 file. Existing
checks and builds remain the regression gate. Directed-scene reconnect should
be added to the E2E once the local first slice is stable.

## 2. External feasibility findings

### 2.1 Spotify technical split

The technically appropriate split is:

```text
guest phone
  -> Field Day server catalog endpoint
Worker catalog adapter
  -> Spotify Client Credentials token
  -> track search and bounded metadata response

GM browser
  -> Field Day OAuth start/callback
Worker playback adapter
  -> Authorization Code tokens
  -> Spotify Connect player endpoints

Show Control
  -> provider-neutral audio cue intent
Audio coordinator
  -> best-effort playback adapter
```

Technical constraints from current official docs:

- app-level catalog access can use Client Credentials
- user playback needs Authorization Code and scoped GM consent
- playback and Web Playback require Premium
- playback device IDs are not guaranteed stable
- `position_ms` is available for start playback
- command order across player endpoints is not guaranteed
- preview URLs are deprecated, nullable, and unsuitable as a dependency
- development mode currently allows five authenticated users and requires the
  owner to have Premium

### 2.2 Spotify policy and test boundary

The current Spotify Developer Policy prohibits creating a game with the
Spotify Platform and prohibits synchronizing sound recordings with visual
media. Player reference pages also prohibit non-interactive broadcasting.

Because Field Day is a game and the proposed Audio Director can coordinate
music with TV scenes, production remains blocked pending written policy
clarification or a different provider.

The product owner confirmed isolated testing permission on July 28, 2026.
The staging implementation therefore allows:

- server-side catalog search
- validated public profile walkout metadata
- one commissioner Authorization Code session
- explicit GM device selection, play, resume, and pause
- silent and open-in-Spotify fallback

Still not enabled:

- automatic scene-triggered playback
- production credentials or production OAuth
- public launch claims
- treating a successful command as part of scene completion

## 3. Proposed architecture

### 3.1 Boundaries

```text
Tournament truth
  shared/core.js + worker/actions.js
      |
      | stable references
      v
Show Control
  shared/show.js
  state.showControl
  show actions in worker/actions.js
      |
      +--> TV directed scene
      |
      +--> future mobile prompt
      |
      +--> future provider-neutral audio intent

Spotify or another provider
  separate catalog and playback adapters
  never part of tournament or scene success
```

### 3.2 Why Show Control is in tournament state

Directed presentation is coordinated room state:

- the GM needs a single current scene
- the TV must recover after refresh
- another GM device must be able to continue
- start/advance/skip order must be strict

Those are exactly the guarantees the existing Durable Object provides. A
separate object, client leader, or database would reintroduce ordering and
recovery problems.

### 3.3 Why ambient TV state stays local

The current ambient scene index does not affect operation. Persisting it would
create a state write every 12 seconds and make every phone receive meaningless
broadcasts. Only an explicit directed scene and its step become durable.

### 3.4 Shared presentation model

Create `shared/show.js` for presentation definitions and pure resolution.
`shared/core.js` remains gameplay truth and does not import presentation code.
The one-way dependency is:

```text
shared/show.js -> shared/core.js
```

Responsibilities:

- versioned scene definitions
- required context and intensity
- ordered step names
- request validation
- pure active-scene resolution against current state
- bounded history helpers

The first definitions:

- `opening`
- `event-intro`
- `winner`
- `standings`
- `champion`

Matchup, betting, poker, award, and ceremony sequence definitions follow after
the primitive is rehearsed.

### 3.5 State shape

```js
showControl: {
  active: {
    id: "show-...",
    kind: "event-intro",
    eventId: "8ball",
    step: 0,
    startedAt: 0,
    updatedAt: 0,
    retryOf: null
  } | null,
  history: [
    {
      id: "show-...",
      kind: "event-intro",
      eventId: "8ball",
      startedAt: 0,
      endedAt: 0,
      outcome: "completed"
    }
  ]
}
```

No title, winner, team, standings, image, audio response, or provider token is
copied into this record. The current official state is resolved on every
render.

History is limited to 20 terminal records.

### 3.6 Actions

First-slice actions:

- `startShowScene`
- `advanceShowScene`
- `endShowScene` with `skipped` or `cancelled`
- `retryShowScene`

All require:

- commissioner authentication
- `showControl` server capability
- a valid current scene or history reference
- valid event/result/frozen context for the requested definition

These presentation-only actions are allowed while poker is set up or live. They
do not alter points, lifecycle, poker, results, wagers, or duels.

### 3.7 TV override

`TVMode` resolves the active directed scene when the capability is enabled.
Render priority becomes:

1. directed Show Control scene
2. champion
3. poker
4. draft or live event
5. ambient rotation

Legacy `EventIntro` and `Reveal` overlays are suppressed while a directed scene
is active so two presentation systems cannot occupy the TV at once.

The first scene component uses existing visual components. Extraction into a
new presentation-components module is intentionally deferred until at least two
surfaces share the API.

### 3.8 Feature flags

Current independent flags:

| Environment | Show Control | Matchup Stakes | Honors | Audio catalog | Audio playback |
|---|---:|---:|---:|---:|---:|
| local | `true` | `true` | `true` | `true` when configured | `true` when configured |
| staging | `true` | `true` | `true` | `true` when configured | `true` when configured |
| production | `false` | `false` | `false` | `false` | `false` |

The Worker advertises `capabilities.showControl`. The server action also checks
the capability. Hiding the client control is not the security boundary.

The corresponding server capabilities are:

- `M2_AUDIO_CATALOG_ENABLED`
- `M2_AUDIO_PLAYBACK_ENABLED`
- `M2_MATCHUP_STAKES_ENABLED`
- `M2_HONORS_ENABLED`

Honors is enabled in isolated staging for review of prompt frequency and the six
theme names. Production remains disabled.

Do not use one broad `M2_ENABLED` flag. It would make rollback and rehearsal
needlessly coupled.

Matchup Stakes is enabled in isolated staging now that the role-aware UI and GM
recovery surface are complete. Production remains disabled, and any persistent
environment must have no pending legacy wager before the capability is enabled.

### 3.9 Matchup Stakes domain

The shared primitive is a `contestMarket`, not separate ante, prediction, and
betting engines:

```js
contestMarkets[id] = {
  id,
  kind:"bracket-match",
  eventId,
  drawId,
  round,
  match,
  sides:[{ key, players }],
  predictions:{ [player]:sideKey },
  backing:{ [player]:{ sideKey, stake, chips } },
  ante:{ stake, responses, activation },
  pool:{ activation },
  openedAt,
  lockedAt,
  voidedAt,
}
```

The first adapter canonicalizes a fully seated bracket match. `sides` is a
contest snapshot used to detect a stale or edited bracket reference; the
current bracket winner remains authoritative. A later heat/final adapter may
produce the same bounded side/outcome shape.

`predictions` contains no financial value. `backing` records player-funded
100-chip units. `ante.responses` is limited to competitors. Locking stores only
whether the pool and ante activated plus their participant terms. It does not
store a winner or payout.

`resolveContestMarket(state, market)` derives:

1. whether the contest reference is current
2. whether an official winner exists
3. backing and ante activation/refund status
4. one `deltaByPlayer` map whose sum is zero

Losing backing is distributed among winning backers in whole 100-chip units
using proportional largest remainder with a deterministic player tie-break.
An ante activates only for two equal-sized sides with unanimous acceptance at
one equal per-player stake. All other cases refund with zero deltas.

`computeStandings()` applies resolved contest-market deltas once as a pure
function. Result correction therefore replaces, rather than appends, a payout.
`atRisk()` includes open backing and accepted ante exposure. Poker setup rejects
unresolved funded exposure but ignores free picks and locked inactive terms.

All participation and GM commands are Durable Object actions gated by
`capabilities.matchupStakes`. Financial commands use a bounded `marketOps`
request ledger. Official bracket actions still lock an existing market when
the capability is disabled so rollback cannot strand committed chips.

## 4. Dependency ordering

```text
M2 documents and Spotify policy decision record
  -> show scene definitions
    -> additive show state and capability
      -> server scene actions
        -> GM Show Control sheet
          -> TV directed-scene override
            -> local reconnect and recovery tests
              -> interaction primitives
                -> broadcast component extraction
                  -> honors
                    -> policy-approved audio interfaces and mock
                      -> approved provider adapter
```

Audio does not block Show Control, broadcast, interaction, or honors.

## 5. Files and systems likely to change

### First slice

- `docs/M2-prd.md`
- `docs/M2-implementation-plan.md`
- `shared/core.js`
- `shared/show.js` new
- `worker/actions.js`
- `worker/state.js`
- `worker/snapshot.js`
- `worker/tournament.js`
- `src/lib/client.js`
- `src/App.jsx`
- `wrangler.jsonc`
- `package.json`
- `tests/m1-foundations.test.mjs`
- `tests/m2-foundations.test.mjs` new

### Later interaction slice

- `src/App.jsx`
- possibly `src/components/actions.jsx` after the API is proven
- `src/PhotoCropper.jsx`
- component-level tests if a lightweight DOM test setup is approved

### Postgame Props slice

- `shared/honors.js` new
- `shared/core.js`
- `worker/actions.js`
- `worker/state.js`
- `worker/snapshot.js`
- `worker/tournament.js`
- `src/lib/client.js`
- `src/App.jsx`
- `wrangler.jsonc`
- `package.json`
- `tests/m2-honors.test.mjs` new

### Policy-approved audio slice

- provider-neutral `worker/audio/` modules
- explicit OAuth and catalog routes in `worker/tournament.js` or a separate
  route handler
- client search and GM status helpers
- required-secret declarations only after credentials are approved
- no provider code in `shared/core.js`

### Matchup Stakes foundation

- `docs/M2-prd.md`
- `docs/M2-implementation-plan.md`
- `shared/markets.js` new
- `shared/core.js`
- `worker/actions.js`
- `worker/state.js`
- `worker/snapshot.js`
- `worker/tournament.js`
- `src/lib/client.js`
- `wrangler.jsonc`
- `package.json`
- `tests/m2-matchup-stakes.test.mjs` new

## 6. Data migration and compatibility

### 6.1 State schema

- increment `EMPTY_STATE.v` from 7 to 8
- add `showControl:{active:null,history:[]}`
- hydration backfills the field
- no existing key is rewritten
- legacy v5, v6, and v7 snapshots remain accepted
- snapshot validation adds v8

### 6.2 Reset

`showControl` is tournament-progress state and is not added to
`RESET_PROGRESS_PRESERVED_KEYS`. Game-progress reset returns it to an empty
record while preserving profiles, claims, photos, ratings, travel, and event
configuration.

### 6.3 Rollback

Older code will retain an unknown `showControl` field during hydration and
normal action writes because actions clone the current object. If code rollback
is needed, the disabled capability prevents old clients from depending on it.

### 6.4 Future profile track

An absent `walkoutTrack` remains valid. A later server validator will accept a
compact allowlist and drop no unrelated profile field. No bulk profile rewrite
is planned.

### 6.5 Matchup Stakes schema and cutover

- increment `EMPTY_STATE.v` from 8 to 9
- add empty `contestMarkets` and `marketOps` maps
- accept v5-v8 snapshots and hydrate them additively
- retain `wagers`, `wagerOps`, and their historical resolver unchanged
- do not auto-convert a pending wager into a pool without counterparties
- require a no-pending-legacy-wager check before enabling the new client in a
  persistent environment
- enable the staging capability for the product-surface review and
  production-shaped rehearsal while keeping production off

### 6.6 Postgame Props schema

- increment `EMPTY_STATE.v` from 9 to 10
- add empty `honorMoments`, `honors`, and `honorOps`
- accept v5-v9 snapshots and hydrate them additively
- store source references and participant snapshots, never a copied winner
- keep invalidated records for audit while excluding them from aggregation
- bound moments, records, and replay operations
- clear the social gameplay layer with game-progress reset while preserving
  profiles and travel data
- enable the staging capability for product review while keeping production off

## 7. Interaction migration plan

The Show Control slice uses current `Btn` so it stays coherent with the shipped
app. The next slice introduces a semantic API:

```jsx
<ActionButton variant="primary" pending={saving}>Save</ActionButton>
<ActionButton variant="secondary">Back</ActionButton>
<ActionButton variant="tertiary">Skip</ActionButton>
<ActionButton variant="destructive">Clear result</ActionButton>
<IconButton label="Close">...</IconButton>
```

Migration order:

1. Show Control and GM primary action
2. result post, overwrite, and clear confirmations
3. commissioner menu
4. profile and onboarding saves
5. wager and duel command actions
6. sheet close and header icon buttons

Do not migrate:

- bracket cells
- player/chip/rating selectors
- poker counters
- tab navigation

until their selection or spatial semantics have their own primitive.

## 8. External integration risks

### Spotify

- current policy may prohibit the intended product
- development mode depends on the app owner's Premium status
- preview URLs are deprecated and nullable
- player endpoints require Premium and user scopes
- device IDs may disappear or change
- command order is not guaranteed
- rate and quota limits can return 429
- provider metadata and visual attribution have policy requirements
- public or commercial use has additional restrictions

### Network and device

- the venue may have intermittent Wi-Fi
- the speaker may not appear as a controllable Spotify device
- autoplay may be blocked for browser-hosted playback
- TV and GM phone may reconnect at different times

Architecture response: presentation first, audio best effort, manual fallback,
bounded state, and no provider dependency in official actions.

## 9. Testing strategy

### 9.1 First-slice focused tests

- scene definitions have valid unique kinds and steps
- scene validation requires event, result, or frozen state as appropriate
- only an enabled GM can start a scene
- second start is rejected while active
- advance changes one durable step
- final advance completes and writes bounded history
- skip and cancel return to ambient state
- retry uses a new ID and retains the source reference
- current official result is resolved rather than copied
- pre-M2 state hydrates to v8 with empty Show Control
- v5 through v8 snapshots validate
- progress reset clears Show Control
- scene actions remain available during poker and do not mutate poker
- capability is false by default for unknown environments

### 9.2 Build checks

- `npm run check`
- `npm test`
- `npm run build`
- `npm run build:staging`

Production build may contain dormant code but no enabled control, mock data,
client secret, access token, refresh token, or provider endpoint.

### 9.3 E2E follow-up

Add after the first pure/action slice:

1. unlock local GM
2. start a directed event scene
3. connect an unclaimed TV client
4. assert same active scene and step
5. advance from GM
6. reconnect TV and assert new step
7. skip and assert ambient return

The existing production-host rejection remains unchanged.

### 9.4 Matchup Stakes focused tests

- a matchup proceeds with no market or participation
- unanimous equal ante activates and settles zero-sum
- decline leaves the ante inactive and does not block the bracket
- a free prediction changes no balance or exposure
- optional backing is retry-safe and counts toward exposure
- a funded pool transfers exactly its losing chips with no residual
- one-sided backing refunds at lock
- void and invalid contest references refund
- a duplicate result action cannot append a second payment
- winner correction reverses and reapplies the pure settlement
- role resolution exposes ante only to competitors and backing only to
  spectators
- v5-v8 production-shaped state hydrates with empty additive maps
- poker setup receives the conserved total after funded markets settle
- production capability remains false unless explicitly configured
- invariant tests assert the sum of contest-market deltas is zero

### 9.5 Postgame Props focused tests

- capability and commissioner open checks fail closed
- event and completed-matchup sources validate against official facts
- self-recognition, unknown themes, and irrelevant participants are rejected
- one giver record per moment is retry-safe and editable while open
- close blocks late submissions; reopen preserves the record
- void and cleared/corrected sources remain auditable but do not aggregate
- standings are identical before and after every honor operation
- aggregation favors unique givers, events, and themes
- v9 state hydrates additively to v10
- production capability remains false by default

## 10. Rollback and degraded mode

### Disable

Set the environment capability false in an approved configuration deployment.
Server actions reject and clients ignore the directed-scene override. Stored
state remains intact for diagnosis.

### Code rollback

Deploy the prior Worker version. The additive `showControl` key is ignored and
retained. No data reversal is required.

### Stuck scene

- GM chooses Skip or Cancel.
- A second unlocked GM device can do the same after reconnect.
- If M2 is disabled, TV falls through to ambient state.
- No result or lifecycle repair is required.

### Audio failure

- mark provider status unavailable
- do not alter active scene
- do not retry indefinitely
- let GM continue or use manual playback

## 11. Implementation slices

### Slice 1: Show Control foundation

- documents
- `v:8` additive state
- pure scene registry and resolver
- runtime capability
- GM-only scene actions
- bounded history and recovery
- Show Control sheet
- directed TV override
- focused tests

### Slice 2: interaction hierarchy

- semantic action primitives
- pending and duplicate-tap behavior
- focus and touch states
- migrate representative GM and confirmation surfaces
- document remaining one-off controls

### Slice 3: broadcast vocabulary

- extract shared player, team, matchup, event, result, and standings cards
- matchup and betting scene definitions
- countdown derived from timestamp
- poker and champion scene polish
- reconnect E2E

### Slice 4: Postgame Honors

Implemented locally and enabled in isolated staging for review:

- honor moment and honor record state
- eligibility and duplicate-safe actions
- compact mobile prompt
- private GM aggregation preview
- no public raw ranking
- event and matchup sources
- TV open state without response totals

Exit still requires holistic staging review of prompt frequency, labels, and
GM recovery.

### Slice 5: audio interfaces and validation

Implemented with the staging test authorization:

- provider-neutral catalog and playback contracts
- walkout metadata validator
- profile search and selection
- private integration storage excluded from snapshots
- degraded setup state when credentials are absent

### Slice 6: staging Spotify adapter

Implemented for isolated staging testing:

- server-side catalog tokens
- GM Authorization Code session
- device selection and recovery
- explicit play, resume, and pause
- Audio Director access from Commissioner and Show Control

Operator steps still required:

- create or identify the authorized Spotify application
- register the exact staging redirect URI
- configure staging Worker secrets
- complete the one-time GM authorization
- rehearse playback on the intended Spotify Connect device

### Slice 7: ceremonies and recap

- short ceremony sequences
- honors-to-awards derivation
- approved live votes
- memorable-moment capture
- photo-supported recap

### Slice 8: Matchup Stakes domain foundation

- document the economy audit and cutover rule
- add schema v9 maps and the shared bracket-match adapter
- implement role resolution, exact pooled distribution, ante activation,
  exposure, and derived correction behavior
- add capability-gated Durable Object actions and bounded command replay
- integrate official bracket result, draw invalidation, and poker preparation
- keep local and isolated staging on while production remains off

Exit: domain and server actions prove exact chip conservation without exposing
an unfinished guest surface.

### Slice 9: Matchup Stakes product surface

Implemented and enabled in isolated staging; the staging rehearsal remains:

- replace the legacy book when the capability is enabled
- add the GM's open, lock, void, and recovery controls in matchup flow
- add competitor ante and spectator pick/back interactions
- show projected, changeable pool returns in plain language
- add aggregate crowd split and activated-pot context to TV and Show Control
- rehearse legacy cutover and rollback on a production-shaped staging snapshot

Exit: staging completes no-wager, thin-pool, funded-pool, cancellation,
correction, reconnect, and poker handoff rehearsals.

## 12. Decisions requiring product input

1. Production Spotify policy path and fallback provider.
2. Honor theme names and eligible moment frequency.
3. Whether honor notes may appear in ceremonies.
4. Final list of major, normal, and routine scenes.
5. Whether an event intro should be started manually or offered adjacent to the
   lifecycle action.
6. Whether legacy automatic event intro remains after directed event intro is
   enabled. The recommended transition is to keep it until directed scenes are
   rehearsed, then remove duplicate presentation.
7. Whether full-screen TV player cards may use existing profile photos.
8. Whether opening and champion ceremonies have fixed steps or configurable
   presets.

## 13. Explicit approval checkpoints

Stop before:

- any staging or production deployment
- any change to remote Worker variables, secrets, bindings, or routes
- enabling an M2 capability outside local
- creating a Spotify developer application
- configuring a Spotify redirect URI
- setting a Spotify client secret or OAuth token
- making a live Spotify API or playback request
- accessing production data or snapshots
- resetting any persistent environment
- pushing a branch if a workflow could target production

Local code, pure fixtures, local workerd state, source checks, builds, and local
E2E remain allowed.

## 14. First-slice task breakdown

1. Add `shared/show.js` with definitions, validation, resolution, and history.
2. Add `showControl` to `EMPTY_STATE` and increment to v8.
3. Accept v8 snapshots while retaining v5 through v7.
4. Add the runtime capability and local-only configuration.
5. Add GM scene actions and allow them during poker.
6. Add Show Control helpers and sheet in the app.
7. Add the directed TV scene component and override priority.
8. Suppress automatic intro/reveal overlays while a directed scene is active.
9. Add focused M2 tests and update legacy hydration assertions.
10. Run the full local validation set.

## 15. Expected commit sequence

If commits are created:

1. `docs: define the M2 spectacle layer`
2. `feat: add recoverable show control`
3. `test: cover M2 show foundations`

Do not push or deploy in this pass.
