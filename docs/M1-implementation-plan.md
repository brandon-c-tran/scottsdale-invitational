# Field Day M1 implementation plan

**Scope of this plan:** define the complete Weekend Engine and implement only
the safe local foundations for D0, D1, and D2 in the first pass.

## Implementation progress

Completed in the foundations pass:

- portable snapshots, validation, local/staging restore safeguards, and
  automatic pre-restore backups
- explicit local, staging, and production capabilities and deploy target
  guards
- isolated staging deployment, as confirmed by the operator
- roster status/configuration, strict event participation, overflow roles, and
  12/13/14-player coverage

Completed locally in Weekend Engine slices 1 through 3:

- additive state schema `v:7`: `eventOps` lifecycle metadata introduced in
  `v:6`, plus bounded wager request metadata in `wagerOps`
- a shared lifecycle and canonical weekend-operation resolver used by GM and TV
- server guards for market lock, event start, bracket/stage progress, result
  entry, result posting, and draw mutation
- idempotent result retries, monotonic result revisions, confirmed overwrite
  and clear flows, and bounded correction history
- idempotent wager placement and retraction keyed by device/action, one
  persisted open wager per bettor/pick, and one-chip-at-a-time retraction
- server-canonical stale target validation and correction-sensitive derived
  payout coverage
- configured poker minimum, quantum, uncapped 1:1 conversion, exact physical
  denominations, and deterministic tie behavior
- idempotent table setup/start/count/result/cancel actions, a board-wide lock
  after chips are dealt, and exact minimum-grant reversal
- storage-first Durable Object publication, lifecycle-aware QA, deterministic
  all-event rehearsal, and two-client phone/TV reconnect coverage
- current runtime-supported Workers compatibility date (`2026-07-21`) plus
  `nodejs_compat`, validated locally and in the staging build

Code-complete M1 still has these explicit operator acceptance gates:

- approved real production snapshot export and offline validation
- approved production-derived snapshot restore rehearsal in staging
- approved destructive full-weekend staging rehearsal and resulting snapshot
- final attendance/event-model approval and an offline GM copy of the runbook

## 1. Repository audit findings

### Baseline validation

On July 28, 2026, before M1 code changes:

- `npm run build`: passed
- `npm run test:e2e` against `ws://localhost:5173/ws`: passed all checks
- Git worktree: clean
- Wrangler installed: 4.112.0

There is no configured lint, formatter, type-check, or unit-test script. Source
is JavaScript, not TypeScript.

### Current architecture

```text
React PWA / TV
  -> WebSocket actions and full-state broadcasts
Cloudflare Worker
  -> Durable Object namespace TOURNAMENT
Durable Object instance "main"
  -> state, version, claims, GM token, photos
shared/core.js
  -> imported by both app and Worker
```

The single Durable Object is a valid coordination atom for one live weekend.
M1 should not shard it or introduce a second state authority.

### Storage inventory

`wrangler.jsonc` declares `Tournament` in `new_sqlite_classes`, so the namespace
is SQLite-backed. The implementation uses the asynchronous Durable Object KV
API, which SQLite-backed objects support through the embedded `__cf_kv` table.

Known persisted keys:

| Key | Content | Portable |
|---|---|---|
| `state` | full M0 state, schema `v:5` | yes |
| `version` | broadcast version | yes |
| `claims` | device ID to player ID | yes, sensitive |
| `gmToken` | commissioner bearer token | no |
| `photo:<player-id>` | base64 data URL | yes, sensitive |

Future keys must not be missed. Export must enumerate storage rather than
maintain only this table as an allowlist. Internal restore backups and auth
secrets are explicitly non-portable.

SQLite-backed Durable Objects have a point-in-time recovery API covering SQL and
KV contents. It is a useful secondary recovery path, but local development does
not retain the recovery log. The portable snapshot remains required.

### State and compatibility

- `EMPTY_STATE.v` is 5.
- Hydration backfills missing top-level state keys.
- Hydration normalizes legacy flight strings.
- `cleanLogistics()` handles versioned booking compatibility.
- State, version, and claims are separate storage keys.
- State and version are written together after normal actions.
- Existing names are used as persistent player IDs across profiles, claims,
  seeds, draws, results, bets, duels, poker, and adjustments.

### Identity and privacy

- Identity is a device claim, not authentication.
- The GM PIN is in `shared/core.js`, so it is shipped in the browser bundle and
  documented in `README.md`.
- GM unlock mints one stored token.
- Profiles include private travel and rating data.
- Photos are separately stored and served from a public GET URL when the player
  ID is known. Upload is owner/GM restricted.

Moving the PIN to a Worker secret is required before the weekend but is not
safe to finish locally without coordinating production secrets. Code support
can be prepared; secret creation is an approval stop.

### Roster

- `ROSTER` is one 13-name array in `shared/core.js`.
- The same static array drives onboarding, claims, standings, poker, results,
  QA, pickers, and tests.
- The E2E suite duplicates the array.
- There is no status or stable ID/label separation.
- Deactivation is impossible without removing the name from source, which would
  also remove it from standings and validation.

### Events, draws, and brackets

- The slate has 17 scored events plus poker.
- Team configuration uses `teamCfg:{teams,size,bracket?}`.
- Only 4-team and 6-team brackets are implemented.
- `drawTeams()` sets the number of groups to the configured team count and
  distributes every selected player across them.
- `runDraw()` validates only that at least two known players were supplied.
- The GM primary action supplies all 13 players to every team draw.
- The event sheet says extras "will double up."

This contradicts the M0 documentation for pairs, 3v3, 5v5, and other strict
formats. It is the highest-priority D2 behavior correction.

### Scoring, betting, and poker

- Standings are derived from results, bets, duels, adjustments, and poker
  stacks.
- Wager and duel outcomes are derived.
- Stale draw/stage references void bets.
- `saveResult` replaces an existing result without an overwrite-specific
  confirmation or audit record.
- Multiple chips on one pick are allowed and only consolidated on settled
  presentation.
- Poker has strong setup gates, minimum-stack adjustments, count validation,
  and reversible result behavior.
- Idempotency is not explicitly modeled across retries.

### TV and GM

- TV is read-only and shares the same broadcast.
- `gmNext` is computed in `App.jsx`, not shared or server validated as a
  lifecycle transition.
- QA simulations use real actions.
- QA controls are an explicit server capability and are available to an
  unlocked GM in production for the approved dry run.
- `resetTournament` is a game-progress reset. It requires an explicit
  capability and confirmation, writes a rotating internal backup, and
  preserves profiles, seeds, logistics, onboarding epoch, event additions,
  event edits, event order, claims, and photos.
- `rerunOnboarding` can release real chip claims after a forced confirmation.

### Tests and deployment

- The only automated suite is `tests/e2e.mjs`.
- It uses a running WebSocket server and mutates state.
- `WS_BASE` can point it at production; the suite resets the target at the end.
- `.github/workflows/deploy.yml` deploys the top-level live configuration on
  pushes to `master` and `claude/**`.
- `wrangler.jsonc` has one top-level live target and custom domain.
- No staging environment exists.
- `compatibility_date` is `2025-05-01`.
- The build emits a Wrangler log-path warning in the sandbox but succeeds.

## 2. Documentation and code mismatches

| Documentation claim | Actual code | M1 treatment |
|---|---|---|
| Pairs are 6 teams of 2 | 13 selected players become uneven groups | reject invalid count and require overflow choice |
| 3v3 is 4 teams of 3 | extras can join teams | enforce exact capacity |
| 5v5 is two teams of 5 | any selected count is split over two | enforce exact capacity |
| State/version are atomic | normal action write is atomic, but claims and photos are separate | snapshot all relevant keys |
| QA is safe around real data | profile filler is cautious and production QA is explicitly enabled for the dry run | commissioner gate, production marker, narrow confirmed reset, snapshot gate |
| M0 has 45 actions | code has the documented action registry plus claim/unlock special handling | retain structure |
| "sixteen events" in UI/manifest | slate has 17 scored events plus finale | correct edition copy separately |
| PIN is server auth | PIN constant ships to client | move to secret in an approved slice |
| One production deployment flow | feature branches deploy the same live target | protect workflow |

## 3. Proposed dependency graph

```text
snapshot schema
  -> storage enumeration
  -> authenticated export
  -> offline validator
  -> non-production restore + pre-backup
     -> environment identity
     -> staging binding definition
     -> production control gating
        -> roster configuration
        -> active-player helpers
        -> participation validation
        -> overflow roles
           -> lifecycle resolver
           -> scoring/idempotency
           -> betting refinement
           -> poker simulations
           -> TV/GM operating flow
```

## 4. Scope classification

### Required now

- M1 PRD, implementation plan, and production-data runbook
- portable snapshot schema, enumeration, validation, and authenticated export
- non-production restore path with pre-backup
- snapshot Git ignore rules
- explicit environment identity
- staging/local Wrangler foundations with explicit DO bindings
- production QA/import server and UI gates
- remote E2E production guard
- roster config and active roster helpers
- strict participation validator
- 12/13/14 tests
- current build and local E2E compatibility

### Required before the event

- approved staging resource creation
- staging secret configuration
- production PIN moved to a secret
- real production export
- production-derived staging restore rehearsal
- explicit lifecycle and next-action resolver
- result overwrite audit/idempotency
- betting retry/idempotency tests
- poker distribution simulation
- full staging weekend rehearsal
- production workflow protection
- venue network recovery procedure

### Useful but deferrable

- offline shell
- check-in completion dashboard
- richer overflow role presentation on TV
- automated snapshot retention outside the app
- more detailed contribution ledger UI

### Speculative and out of scope

- arbitrary brackets
- general event builder
- accounts and role-based access
- R2 photo migration
- multi-edition platform
- awards/voting spectacle

## 5. First-pass implementation design

### D0: snapshot format

Add `worker/snapshot.js` as a pure module used by the Durable Object and Node
tests.

Snapshot shape:

```json
{
  "format": "field-day-snapshot",
  "snapshotVersion": 1,
  "metadata": {
    "exportedAt": "2026-07-28T00:00:00.000Z",
    "applicationVersion": "commit-or-build-id",
    "stateSchemaVersion": 5,
    "environment": "production",
    "object": "tournament/main"
  },
  "entries": [
    { "key": "state", "value": {} },
    { "key": "version", "value": 1 },
    { "key": "claims", "value": {} },
    { "key": "photo:Brandon", "value": "data:image/..." }
  ]
}
```

Rules:

- enumerate `ctx.storage.list()`
- omit `gmToken`
- omit `m1:pre-restore:*`
- require `state`, `version`, and `claims`
- require referenced photos
- reject duplicate or unsafe keys
- calculate a SHA-256 hash for operator confirmation where supported
- do not persist or broadcast during export

### D0: routes

Add:

- `GET /api/admin/snapshot`
- `POST /api/admin/snapshot/validate`
- `POST /api/admin/restore`
- `POST /api/admin/restore-backup`

All routes require a bearer token. Local/staging use the current GM token.
Production export/validation require a separate `SNAPSHOT_ADMIN_TOKEN` Worker
secret because the existing commissioner PIN is visible in client code.
Restore must reject `APP_ENV=production` regardless of token.

The route passes through the existing `main` object, so it can enumerate private
storage. Snapshot bodies are never logged.

Restore sequence:

1. authenticate
2. reject production
3. parse with a bounded request size
4. validate with no writes
5. enumerate current portable entries
6. create and store `m1:pre-restore:<timestamp>`
7. replace portable entries transactionally where supported
8. rehydrate in-memory state, version, and claims
9. advance the transport version above both current and imported values
10. broadcast restored state
11. return backup key, hash, version, and counts

The backup is internal and excluded from portable exports to prevent recursive
snapshot growth. A local/staging-only recovery command validates a named
backup and creates another pre-recovery backup before applying it.

### D1: configuration

Keep the top-level Worker as production to preserve the existing Worker name,
namespace, and custom domain.

Add top-level:

```jsonc
"vars": { "APP_ENV": "production", "APP_VERSION": "dev" }
```

Add named local/staging environments with:

- their own `APP_ENV`
- explicit `TOURNAMENT` bindings
- `workers_dev: true`
- no production route

The named staging environment creates infrastructure only when explicitly
deployed. This first pass changes configuration but does not run deployment.

The Worker includes environment identity in state frames. The client displays a
fixed local/staging badge. Production renders none.

QA initializes off on each device and renders only when the server advertises
the explicit capability. Production enables it for the approved dry run and
shows a production marker throughout the QA console. Restore has both CLI and
server gates; no restore control is rendered in the production application.

### D1: scripts and workflow

Add scripts that name targets:

- `dev`
- `build`
- `build:staging`
- `deploy:staging`
- `deploy:production`
- `snapshot:validate`

Do not run deploy scripts in this pass.

Change remote E2E behavior so a non-local `WS_BASE` is rejected unless a
specific non-production override and host allowlist are provided. Production
hostnames are always rejected.

The deployment workflow should be changed in a separate reviewed unit so only a
protected production trigger can invoke `deploy:production`. No workflow is
run from this workspace.

### D2: roster model

Replace the literal export with:

```js
const ROSTER_CONFIG = [
  { id: "Brandon", name: "Brandon", status: "confirmed" },
  ...
];
```

Export:

- `ROSTER_CONFIG`
- `ALL_PLAYERS`
- `ROSTER` as confirmed IDs for compatibility
- `rosterPlayers(config, statuses)`
- `isActivePlayer(id)`

No stored key is rewritten.

### D2: participation validation

Add pure helpers:

- `eventCapacity(event)`
- `validateEventParticipants(event, selected, activeRoster)`
- `defaultQaParticipants(event, activeRoster)`
- `normalizeOverflowRoles(...)`

Update each built-in event with a participation policy. For existing strict
team events, the policy derives from `teamCfg` and forbids size drift.

Update `runDraw`, `startDraft`, stages, results, claims, poker, and standings to
use confirmed players.

Update the event sheet:

- replace "extra will double up" with a blocker
- disable the draw until capacity is exact
- show how many playing slots and overflow assignments are required
- store default `sit-out` roles for excluded players in the first pass

Update `gmNext`:

- draw immediately only when all confirmed players exactly fit
- otherwise open the event participation sheet

QA may select deterministic participants to keep simulations repeatable.

## 6. Files likely to change

### Documentation

- `docs/M1-prd.md`
- `docs/M1-implementation-plan.md`
- `docs/production-data-runbook.md`
- `README.md`
- `CLAUDE.md`

### D0

- `worker/snapshot.js` (new)
- `worker/tournament.js`
- `worker/index.js`
- `src/lib/client.js`
- `src/App.jsx`
- `.gitignore`
- `scripts/snapshot.mjs` (new)
- `tests/m1-foundations.test.mjs` (new)

### D1

- `wrangler.jsonc`
- `vite.config.js`
- `package.json`
- `.github/workflows/deploy.yml`
- `tests/e2e.mjs`

### D2

- `shared/core.js`
- `worker/actions.js`
- `worker/tournament.js`
- `src/App.jsx`
- `tests/m1-foundations.test.mjs`
- `tests/e2e.mjs`

## 7. Data migrations

No irreversible data migration is planned.

Logical compatibility changes:

- Roster config wraps existing IDs without rewriting maps.
- Inactive data remains in existing maps.
- Old draws without `roles` remain valid.
- Snapshot format is external to `EMPTY_STATE`.
- State schema `v:6` added `eventOps`; `v:7` adds only `wagerOps`. Hydration
  backfills both maps without rewriting any existing domain value.
- Snapshot validation accepts state schemas `v:5`, `v:6`, and `v:7`; restored
  older state hydrates to `v:7`.

The DO class remains SQLite-backed and uses the existing `v1` namespace
migration. Changing `migrations` to the newer `exports` lifecycle mechanism is
not required and would add risk without user value in this slice.

## 8. Compatibility strategy

- Preserve top-level production Worker identity and route.
- Preserve DO class name and object name `main`.
- Preserve every existing player ID.
- Preserve every `v:5`/`v:6` field and hydrate additively into
  `EMPTY_STATE.v:7`.
- Preserve old action payloads where possible.
- Treat absent environment in an old frame as production-safe: no QA/import.
- Treat absent draw roles as an empty list.
- Continue rendering archived/inactive IDs when referenced by historical data,
  while excluding them from current operations.
- Never infer a new ID from a display name.

## 9. Test strategy

### Focused Node tests

- snapshot round-trip with state, claims, unknown portable key, and photos
- malformed root, wrong schema, duplicate key, missing state, missing photo,
  secret key, and oversized input rejection
- M0 state hydration/backfill
- 13 confirmed roster unchanged
- hypothetical 14th player additive
- one player out produces 12 active without deleting profile fixtures
- strict pairs: 12 accepted, 13/14 all-selected rejected
- strict 3v3, 5v5, and 6-player teams enforce capacity
- default QA participant selection produces exact teams
- only 4/6 bracket configurations pass
- lifecycle progression and server transition rejection
- result retry, correction confirmation, correction audit, clear, and
  monotonic repost revision
- canonical next-event selection when multiple events have prepared state
- duplicate-safe wager placement/retraction, intentional chip aggregation,
  stale-target rejection before cap messaging, and correction-sensitive
  zero-reconciliation
- configured exact poker distribution for 12/13/14 seats, idempotent finale
  actions, dealt-board locking, tie behavior, and exact cancel/clear reversal
- deterministic all-17-event-through-poker action rehearsal
- phone and unclaimed TV reconnect to the same authoritative state/version
- Durable Object state becomes visible in memory only after its atomic storage
  write succeeds

### Existing E2E

- retain the two-client full game loop
- derive roster from shared config
- keep 12-player 8-Ball draw
- assert strict oversized draw rejection
- assert inactive claim rejection through focused action test
- assert snapshot export includes a test photo
- assert local restore round-trip if exposed through the local server
- keep cleanup local

### Validation commands

- `npm run test`
- `npm run check`
- `npm run build`
- `npm run test:e2e`
- `npx wrangler deploy --dry-run` only if it does not require production access

There is no type-check until the project adopts TypeScript. Do not add
TypeScript only to satisfy a checklist.

## 10. Deployment implications

- No deployment in the first pass.
- Adding `env.staging` does not create a Worker or namespace until deployment.
- First staging deploy creates or binds isolated staging resources and requires
  approval.
- The top-level live Worker remains production.
- Changing the production PIN requires setting a production secret before code
  depending on it is deployed.
- A production export handles real PII and requires explicit approval.
- A production restore is not part of normal rollout.

## 11. Rollback strategy

### Code

- Roll back to the prior Cloudflare Worker version.
- Keep the DO class name, namespace, and state shape compatible so code rollback
  can read state written by M1.

### Data

- Prefer correcting results through derived-state behavior.
- For a bad non-production import, restore the automatically created
  `m1:pre-restore:*` snapshot.
- For production data incidents, use the last validated portable snapshot or
  Cloudflare PITR only after reviewing the exact recovery point.
- PITR restore is in-place and must require approval.

### Roster

- Revert configuration status.
- Because data is not deleted, re-confirming a player restores operational
  inclusion.

## 12. Small, reviewable task breakdown

### Unit 1: documentation

- PRD
- implementation plan
- runbook

### Unit 2: snapshot core

- pure schema/build/validation module
- snapshot tests
- ignore rules

### Unit 3: authenticated export

- DO storage enumeration
- HTTP route
- client download
- no-mutation test

### Unit 4: safe local restore

- production hard gate
- pre-restore backup
- local restore
- malformed and compatibility tests

### Unit 5: environment foundations

- Wrangler environments
- state-frame environment
- UI indicator
- production QA/import gates
- target scripts

### Unit 6: deployment safety

- remote E2E guard
- workflow trigger/target review
- dry-run checks

### Unit 7: roster config

- stable config records
- confirmed roster helper
- claim/standings/poker integration
- compatibility fixtures

### Unit 8: participation compatibility

- event policies
- strict validator
- overflow role data
- UI blockers
- 12/13/14 tests

### Unit 9: regression validation

- focused test suite
- build
- local E2E
- documentation command verification

## 13. Expected commit sequence

Commits are optional in this environment. If created, use:

1. `docs: define the M1 weekend engine`
2. `feat: add portable tournament snapshots`
3. `feat: gate restore to isolated environments`
4. `chore: define local staging and production targets`
5. `feat: derive operations from roster configuration`
6. `fix: enforce strict event participation`
7. `test: cover M1 safety foundations`

Do not push any commit. The current workflow can deploy some pushed branches.

## 14. Risks requiring a user decision

1. **Staging resource creation:** Worker name, public `workers.dev` URL, account,
   and secret values require approval.
2. **Production PIN:** choose secret management and rotation timing.
3. **Roster ID policy after Scottsdale:** retain display-name IDs forever or
   introduce a later compatibility map.
4. **Live overflow roles:** decide whether every non-player must be explicitly
   assigned or whether `sit-out` may be defaulted.
5. **Final event slate:** approve capacities and official requirements before
   lifecycle work.
6. **Snapshot retention:** decide operator location, encryption, and retention.
7. **CI deployment:** decide protected manual production deploy versus
   master-only automatic production deploy.
8. **Network fallback:** decide whether offline shell is required before the
   event or whether an operational paper backup is sufficient.

## 15. Explicit approval stop points

Stop before:

- `wrangler deploy` for any environment
- creating a staging Worker, namespace, route, or domain
- setting or reading Cloudflare secrets
- running `wrangler whoami` if it accesses an authenticated production account
- calling the real production export route
- reading a real production snapshot
- importing a production-derived snapshot into staging
- invoking Durable Object PITR
- modifying the production binding or DO class lifecycle
- resetting any remote environment
- pushing a branch while the deployment workflow can target production

Local code, local workerd storage, pure fixtures, builds, dry parsing, and local
E2E are not approval stops.

## 16. Weekend Engine sequencing after foundations

### Slice 1: lifecycle and guarded results

Implemented locally:

1. derive lifecycle from current M0 facts plus minimal `eventOps` timestamps
2. return current phase, blockers, and one next action
3. share the resolver across GM and TV
4. guard lifecycle mutations on the server
5. add result revision and correction metadata
6. cover lifecycle transitions, result idempotency, and the updated E2E flow

### Slice 2: betting ledger reliability

Implemented locally:

1. wager place/retract actions use the transport action id plus device id as a
   bounded durable idempotency key
2. the client retries those actions once with the same id; exact retries are
   no-ops and conflicting id reuse is rejected
3. intentional repeat taps aggregate into one persisted bettor/pick record,
   with individual `chips` retained so one retract removes one tap
4. server-canonical target validation rejects stale draws, matches, and stages
   before affordability messaging
5. unit and two-client E2E coverage exercise duplicate delivery, aggregation,
   caps, stale targets, retraction, settlement, and result correction

### Slice 3: poker distribution and weekend rehearsal

Implemented locally:

1. configure and simulate exact physical chip distribution for 12, 13, and 14
   seats, including minimum frequency, 25-chip counts, no silent rounding, no
   cap, and deterministic ties
2. make setup, start, repeated counts, final posting, and cancel retry-safe
3. lock the tournament board as soon as the table is dealt; correction requires
   canceling the table first
4. tag minimum-stack grants to the current table so cancel reverses exactly
   those grants
5. run a seeded local rehearsal through every shipped event and poker, then
   prove clear/cancel restores the pre-poker board
6. verify phone and unclaimed TV reconnects receive the same full state/version

### Remaining launch operations

These are not code changes and retain their original approval stops:

1. export and validate a real production snapshot
2. restore the approved production-derived snapshot into staging
3. reset and run the destructive full-weekend staging rehearsal
4. approve final attendance and every event participation model
5. store an offline copy of the GM runbook
