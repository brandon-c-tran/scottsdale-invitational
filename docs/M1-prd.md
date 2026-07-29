# Field Day Milestone 1 PRD

**Product:** Field Day, Scottsdale 2026  
**Milestone:** M1, Weekend Engine  
**Status:** Code complete; production-data and operator launch gates remain
**Baseline:** M0 is shipped at `fielddayseries.com` and holds real guest data  
**Last updated:** July 28, 2026

Implementation status on July 28, 2026:

- D0 snapshot, validation, local restore, and recovery foundations are complete.
  D0 acceptance still requires an approved real production export.
- D1 environment separation is implemented and staging has been deployed and
  operator-verified. A production-derived staging restore is still required.
- D2 roster configuration, status filtering, strict participation, and
  12/13/14-player coverage are complete.
- The shared lifecycle resolver, guarded event transitions, GM/TV next action,
  and audited result correction are implemented locally and await staging
  rehearsal.
- Duplicate-safe wager placement/retraction, intentional chip aggregation, and
  correction-sensitive payout coverage are implemented and await the full
  staging weekend rehearsal.
- Poker distribution, dealt-board locking, retry-safe finale posting, exact
  recovery, deterministic all-event rehearsal, and phone/TV reconnect coverage
  are implemented locally.

## 1. Executive summary

M0 proved the complete Field Day loop: invite, device claim, profiles, travel
details, balanced draws, brackets, stages, betting, duels, scoring, poker, TV,
and GM controls. It is now a shipped system with real personal data, not a
prototype.

M1 makes that system safe to change and dependable enough to run the full
weekend. Work is sequenced as:

1. D0: production state safety
2. D1: local, staging, and production separation
3. D2: roster flexibility
4. Core Weekend Engine work

This sequence is mandatory. Event lifecycle, scoring, betting, poker, TV, and
GM refinements must build on exportable state, isolated test environments, and
a roster model that does not silently create invalid teams.

The current single-authority Durable Object and shared game engine remain the
architecture. M1 adds safety and explicit operating rules around them. It does
not introduce a new framework, a multi-tenant platform, or a general-purpose
tournament builder.

## 2. M1 problem statement

The app can execute the weekend, but it cannot yet be changed or rehearsed with
the safety expected of a live system:

- The one Durable Object contains the only durable copy of identity claims,
  profiles, travel details, ratings, results, bets, poker state, and photos.
  There is no complete portable snapshot or rehearsed restore.
- `wrangler.jsonc` defines only the live Worker and custom domain. There is no
  isolated staging target, and the GitHub workflow deploys the production
  configuration from `master` and `claude/**`.
- The roster is one static array of names. Those names are also persistent IDs.
  Player status is not modeled.
- Strict team formats are only prose. `drawTeams()` uses every selected player
  and can produce oversized teams. The current UI explicitly says extras will
  "double up," contradicting the documented pairs and fixed team sizes.
- QA controls ship in the production client. The E2E suite accepts a production
  WebSocket URL and resets the target at the end.
- Event lifecycle is inferred from `onDeck`, draws, stages, results, poker, and
  `frozen`, rather than represented and validated as one clear operating flow.
- M0 has strong derived settlement, but lacks a complete audit and correction
  model for every operational transition.

M1 must make iteration safe, make final attendance a configuration concern, and
make the GM's next action and recovery options obvious.

## 3. Relationship to the shipped M0 baseline

M0 behavior is the compatibility contract.

### Already present and retained

- One Worker and one Durable Object instance named `main`
- Server-authoritative actions with full-state WebSocket broadcasts
- Shared rules in `shared/core.js`
- Persisted raw facts with derived standings, wagers, and duel outcomes
- Device claims and stable profile associations
- Photos stored outside the broadcast state under `photo:<player-id>`
- Balanced draws, 4-team and 6-team brackets, stages, and drafts
- One on-deck betting market
- Poker stacks as final standings
- TV and GM surfaces
- Local full-weekend E2E coverage

### Refined in M1

- Persistence becomes portable and recoverable.
- Deployment targets become explicit and isolated.
- The roster gains stable configuration records and status.
- Event participation becomes validated rather than inferred.
- Event progression becomes a guarded lifecycle with one next action.
- Existing scoring, betting, poker, TV, and GM behavior gains idempotency,
  auditability, correction paths, and rehearsal coverage.

### New in M1

- Versioned snapshots covering every relevant Durable Object storage entry
- Non-production-only snapshot restore with a pre-restore backup
- A staging environment definition and visible environment identity
- Roster statuses: `confirmed`, `pending`, and `out`
- Participation compatibility rules and overflow assignments
- A formal event lifecycle and full-weekend deterministic simulations

Existing M0 serialized state must remain readable without an irreversible
migration. Existing names remain player IDs for Scottsdale 2026.

## 4. Goals

1. A GM can create a complete authenticated snapshot without exposing private
   data through an unauthenticated route.
2. A representative snapshot can be validated and restored into local or
   isolated staging state before any production restore is considered.
3. Local, staging, and production have unmistakable identities and isolated
   Durable Object namespaces.
4. Production exposes QA and the narrow game-progress reset only as explicit
   commissioner capabilities; it exposes no import or restore controls.
5. Attendance changes are made through one roster configuration.
6. Deactivating a player excludes them without deleting their stored data.
7. Strict pairs remain pairs at 12, 13, and 14 active-player configurations.
8. Every event declares who participates, how teams are formed, and what
   happens to overflow players.
9. The GM sees current state, blockers, one next action, and safe recovery.
10. Guests never calculate standings, betting payouts, or poker conversion.
11. The full weekend is reproducible in an isolated environment.

## 5. Non-goals

M1 does not include:

- public self-serve event creation
- multi-tenant SaaS architecture
- arbitrary templates for unknown customers
- sophisticated role-based permissions
- public registration
- payment processing or real-money gambling
- full in-app roster administration
- changing existing Scottsdale player IDs
- general bracket support for every entrant count
- advanced fairness optimization
- native mobile applications
- Spotify or walkout-song features
- voting and superlatives
- extensive photo galleries
- awards ceremony production
- multi-edition archives or a reusable Field Day Series platform

The current custom-event editor remains an M0 convenience, not a public event
builder.

## 6. Product principles

1. **Protect the shipped baseline.** Real profiles and travel data outrank
   development convenience.
2. **The server decides.** Client checks improve UX; server validation is the
   contract.
3. **Facts are stored, consequences are derived.** Results remain the source
   for standings and settlement.
4. **One obvious next action.** The GM should not reconstruct workflow from
   several screens.
5. **No hidden arithmetic.** Guests see outcomes, balances, exposure, and
   starting stacks already calculated.
6. **Exclude, never erase.** Attendance changes preserve claims, profiles,
   photos, ratings, and history.
7. **Invalid formats stop early.** A strict pair event never becomes teams of
   three.
8. **Recovery is a product feature.** Export, validate, restore, correction,
   and rollback are designed and rehearsed.
9. **Production is deliberately explicit.** QA and the narrow game-progress
   reset are commissioner-only capabilities for an approved dry run. Import,
   restore, profile reset, and chip-claim release stay outside that path.
10. **Keep the coordination model.** One event weekend is one coordination
    atom, so the single `main` Durable Object remains appropriate.

## 7. User roles

### Guest

Claims one confirmed roster slot, completes a profile, participates in events,
places social-currency wagers, runs duels, follows the board, and submits a
poker count. Identity remains a device claim in M1.

### GM

Unlocks commissioner mode, checks attendance, assigns overflow roles, performs
draws, advances events, confirms results, corrects mistakes, exports snapshots,
and runs the finale. Snapshot export is a GM function. Snapshot restore is not a
normal production GM function.

### Official or overflow participant

A confirmed player not competing in a specific event may be assigned:

- referee
- scorekeeper
- photographer
- on deck
- sit-out

This is event participation, not a new account permission system.

### TV

Read-only presentation client. It shows public tournament information only and
never profiles, private ratings, claims, travel details, or snapshot controls.

### Developer or operator

Runs local and staging validation, validates snapshots, conducts restore
rehearsals, and promotes code/configuration. Production data access remains an
explicit, approved action.

## 8. Success criteria

- Current 13-player M0 state hydrates without data loss.
- A 14th configured confirmed player adds one unclaimed slot and leaves all
  existing claims and profiles unchanged.
- Marking a player `out` removes them from claims, standings, draws, results,
  and poker operations without removing stored data.
- Unit coverage exercises 12, 13, and 14 active players.
- Every strict format rejects the wrong entrant count before a draw.
- Snapshot output includes `state`, `version`, `claims`, all relevant additional
  keys, and every photo referenced by profile state.
- Snapshot validation rejects malformed, duplicate-key, incompatible, secret,
  incomplete-photo, and wrong-schema inputs.
- Restore is unavailable in production and creates a pre-restore backup in
  local or staging.
- Staging has an explicitly declared Durable Object binding and cannot inherit
  the production binding by omission.
- Non-production UI has a persistent environment marker.
- Production QA and game-progress reset require explicit server capabilities
  and commissioner unlock. Snapshot import and restore remain absent.
- Build, source checks, focused tests, and local E2E pass.
- A staging full-weekend rehearsal completes without touching production.

## 9. M1 dependency sequence

```text
D0 state export + validation
  -> D0 local restore rehearsal
    -> D1 isolated staging definition
      -> D1 production-derived staging validation
        -> D2 roster and participation model
          -> lifecycle
            -> scoring and betting
              -> poker, TV, GM rehearsal
```

Later work may be designed in parallel but must not be rolled out ahead of its
dependencies.

## 10. Functional requirements

### D0: production state safety

- GM-authenticated, read-only portable snapshot export
- enumeration of relevant Durable Object KV entries, not only `state`
- inclusion of separately stored photos
- snapshot metadata: timestamp, commit/application version, state schema,
  snapshot schema, environment, and a non-secret object label
- secret and internal-backup exclusion rules
- offline validation command
- import available only in `local` or `staging`
- mandatory pre-restore snapshot
- exact rejection messages for malformed or incompatible input
- recovery runbook

### D1: environment separation

- explicit `APP_ENV` values for local, staging, and production
- named staging Worker configuration with its own DO binding
- no staging custom-domain route unless separately approved
- visible local/staging banner on phone and TV
- environment-aware client payloads
- production runtime exposes QA/reset only when explicitly enabled and always
  hides import/restore controls
- deployment commands name their target
- production deployment requires an explicit production script
- CI does not deploy arbitrary branches to the production route

### D2: roster flexibility

- one canonical roster configuration
- stable IDs separate from labels even when both currently have the same value
- statuses `confirmed`, `pending`, `out`
- active roster derived from status
- claims and tournament operations accept confirmed players only
- stored data for inactive players remains untouched
- pure participation compatibility helpers
- overflow roles stored with a draw or event operation where applicable
- QA notes and loops derive from active roster
- 12, 13, and 14 player tests

### Weekend Engine

- explicit lifecycle derived from existing facts first, persisted only where
  derivation is insufficient
- one next-action resolver shared by GM and TV
- transition validation on the server
- result confirmation and safe correction
- consistent scoring and settlement
- betting gates linked to lifecycle
- configured poker advantage
- presentation scenes linked to lifecycle
- deterministic weekend rehearsal

## 11. Operational requirements

- Every production-affecting command must name `production`.
- Export is read-only and may not increment tournament version or broadcast.
- Restore produces an audit result containing backup key, source snapshot hash,
  restored entry count, and timestamp.
- Local and staging may be reset only after target identity is shown.
- Production game-progress reset is an explicit commissioner capability and
  requires confirmation plus a validated pre-run snapshot. Onboarding rerun is
  a separate destructive action because it releases chip claims.
- Logs must not contain profile payloads, flights, photos, GM tokens, or
  snapshot bodies.
- A launch operator must be able to answer: current environment, last snapshot,
  current event state, next action, and recovery path.

## 12. Data-safety requirements

- Never commit `.dev.vars`, snapshots, exports, restore backups, or personal
  data.
- Snapshot paths and common extensions are ignored by Git.
- Portable snapshots exclude `gmToken`; a restored environment creates or uses
  its own GM credential.
- Snapshot export enumerates storage with `storage.list()` because M0 stores
  `state`, `version`, `claims`, `gmToken`, and `photo:<id>` separately.
- A profile with `photoV` requires a matching portable photo entry.
- Snapshot validation is pure and runs before any storage write.
- Restore rejects production at both route and Durable Object layers.
- Restore never changes the source snapshot.
- Restore stores a pre-restore backup before deleting or replacing any portable
  key.
- Existing state key backfill and logistics normalization remain intact.
- No irreversible player-ID migration is part of M1.

## 13. Environment strategy

### Local

- Runs in workerd with local-only Durable Object storage.
- `APP_ENV=local`.
- QA and restore rehearsal are available after GM unlock.
- The banner must say `LOCAL`.
- Production routes and remote bindings are absent.

### Staging

- Named Wrangler environment.
- Worker name and Durable Object namespace are isolated from the top-level live
  Worker.
- `APP_ENV=staging`.
- Uses `workers.dev` until a staging domain is approved.
- QA and restore rehearsal are available after GM unlock.
- A production-derived snapshot may be imported only after local validation.

### Production

- The existing top-level Worker identity and custom domain remain unchanged.
- `APP_ENV=production`.
- Snapshot export is an operator CLI action authenticated by the server-only
  `SNAPSHOT_ADMIN_TOKEN`; it is not shown in the production client.
- QA and game-progress reset are explicitly enabled commissioner capabilities
  for the approved dry run.
- Import and restore controls are absent.
- Code/configuration is promoted to production; staging runtime state is not.

Wrangler environment bindings are non-inheritable. Every named environment must
declare `TOURNAMENT` explicitly. This is the configuration guard against a
missing or accidental cross-environment binding.

## 14. Roster-flexibility requirements

The canonical record is:

```js
{ id: "Brandon", name: "Brandon", status: "confirmed" }
```

For Scottsdale 2026, `id` retains the legacy name value. A later slug/UUID
migration requires a separate compatibility map and is not approved in M1.

Rules:

- `confirmed` participates in claims and tournament operations.
- `pending` is visible to operators as a possible attendee but cannot claim or
  enter a draw.
- `out` is excluded from operations.
- A status change never deletes `profiles[id]`, `seeds[id]`, `claims`,
  `photo:<id>`, historical results, wagers, or adjustments.
- A claim pointing to a non-confirmed player is retained in storage but not
  treated as an active identity.
- Adding a record creates only an unclaimed confirmed opportunity.
- Active totals, standings, poker waits, QA loops, and player pickers derive
  from the active roster.
- Edition prose may still say "thirteen" where it describes the shipped invite,
  but operational counts and QA assertions may not.

## 15. Tournament-engine requirements

Each event declares participation independently from presentation copy.

Supported participation categories:

- `all`: every confirmed player participates
- `strict-teams`: exact team count and exact team size
- `approximate-teams`: target count with bounded size variance
- `fixed`: exact entrant count
- `selection`: GM selects within stated minimum and maximum

Configuration also declares:

- whether sit-outs are allowed
- allowed overflow roles
- whether officials are required
- bracket or stage requirement
- supported bracket size

The first M1 slate uses existing 4-team and 6-team brackets only. Unsupported
counts are rejected. M1 does not generate arbitrary brackets.

## 16. Event participation and overflow-role model

Strict team events calculate capacity as `teams * size`.

- Fewer selected players: reject as short.
- More selected players: reject as over capacity.
- Enough confirmed players but not exact participation: require the GM to
  select competitors and assign the rest.
- No player may be both a competitor and overflow.
- Every confirmed non-competitor receives one allowed role.
- Default role may be `sit-out` in QA/rehearsal only. Live GM operation must
  make the selection visible before draw confirmation.

Draw state may add:

```js
roles: [{ player: "Jeremy", role: "scorekeeper" }]
```

Old draws without `roles` remain valid.

## 17. Guided match-operation requirements

Canonical lifecycle:

1. `scheduled`
2. `setup`
3. `draw-pending`
4. `draw-revealed`
5. `betting-open`
6. `betting-locked`
7. `in-progress`
8. `result-entry`
9. `complete`

`result-confirmed` and `scoring-applied` are atomic transition facts rather
than separately visible phases in the current architecture. Saving the
official result writes one revision, and every standings and wager surface
derives the resulting score in that same authoritative update. `shelved` is a
terminal operational phase for an event removed from the active slate.

The implementation should derive states from current M0 fields where reliable:
draws/stages, `onDeck`, bracket progress, results, and poker state. A small
persisted status is allowed only for distinctions the existing facts cannot
represent.

Requirements:

- one primary GM action
- blocker list when the primary action cannot run
- server rejection of invalid transitions
- confirmation before overwriting results or clearing draws/stages
- safe return to a previous valid state
- phone and TV show the same status
- refresh/reconnect reconstructs the same lifecycle

## 18. Scoring and standings requirements

`computeStandings()` remains the source of truth.

- Award tables remain configuration-driven through `AWARDS`.
- Results reference stable player IDs.
- Posting the same result twice must not double-score.
- Replacing a result requires confirmation and records correction metadata.
- Clearing a result must reverse awards and derived settlement.
- All surfaces render the same standings function.
- Each score contribution remains traceable to result, wager, duel, poker
  count, or ruling.
- Recalculation is deterministic and requires no manual repair action.

## 19. Betting requirements

Betting remains social tournament currency.

- One event market at a time.
- Market state follows event lifecycle.
- Stakes must be affordable, within exposure, correctly quantized, and against
  a valid current target.
- Late, stale, self-opposed, or malformed wagers are rejected server-side.
- Repeated taps on the same pick must have a clear meaning. If multiple chips
  remain allowed, the UI consolidates them immediately rather than only after
  settlement.
- Settlement and payout remain derived.
- Stale draw/stage references void safely.
- Guests see the final payout, not a formula they must calculate.
- Ledger tests cover retry/idempotency and correction.

## 20. Poker-finale requirements

The shipped M0 model is the default: current tournament chips become the
starting stack 1:1, with a 600 minimum. M1 must formally validate it rather than
introduce an unnecessary conversion.

- Performance produces a meaningful advantage.
- Every confirmed player retains a playable minimum.
- Minimum, denominations, rounding, caps, and ties are configured.
- Open wagers and duels block table setup.
- Dealt total is snapshotted.
- Counts accept 25-chip increments.
- Missing counts block posting; sum mismatch is visible but not hidden.
- Posting counts is idempotent.
- Clearing result and canceling setup restore the pre-poker board.
- Simulations report stack distribution and minimum-stack frequency for 12,
  13, and 14 players.

## 21. TV and presentation requirements

- TV reads the same lifecycle and next-action model.
- Scenes cover setup/draw, betting, in-progress match, result, standings, and
  poker.
- Current matchup and officials are visible where useful.
- No claim map, private ratings, travel data, snapshot metadata, or photos
  beyond public player avatars are exposed.
- Environment banner is visible outside production.
- Reconnect receives full authoritative state and reconstructs the scene.
- Scene rotation must not hide an urgent current action.

## 22. GM-console requirements

- Current event and lifecycle state at the top
- One primary action
- Blockers shown beside the action
- Attendance and participation compatibility before draw
- Overflow role assignments
- Normal operation separated from correction and dangerous tools
- Confirmation for redraw, result overwrite, restore, reset, and onboarding
  rerun
- Operator-authenticated snapshot export in production, outside the client
- Snapshot import and QA only in non-production
- Recovery controls describe consequence and recovery point

## 23. QA and testing strategy

### Pure tests

- snapshot build/validation
- legacy state hydration
- roster derivation and statuses
- 12/13/14 participation compatibility
- strict team sizing
- bracket compatibility
- scoring and settlement
- lifecycle transition resolver

### Action tests

- claims only for confirmed players
- deactivation preserves data
- additive 14th player
- draw rejection and overflow roles
- idempotent results, bets, payouts, and poker posting
- restore environment guard

### Integration tests

- two-client WebSocket sync
- reconnect and version behavior
- photo inclusion in snapshot
- local restore rehearsal
- full weekend

### Staging rehearsal

- import a validated representative snapshot
- reset tournament-only state
- run every event in final order
- exercise correction paths
- finish poker
- refresh phone and TV throughout
- export the resulting staging state

Remote or production E2E is prohibited by default.

## 24. Migration and compatibility strategy

- Keep the existing `Tournament` Durable Object class and `v1`
  `new_sqlite_classes` declaration.
- Do not convert the existing class lifecycle configuration from `migrations`
  to `exports` in this slice.
- Keep KV API storage on the existing SQLite-backed namespace.
- Continue hydrating missing `EMPTY_STATE` keys.
- Roster configuration changes do not rewrite stored maps.
- Existing name keys remain valid IDs.
- Old draws without overflow roles remain readable.
- Snapshot schema version is independent from state schema version.
- Reject newer incompatible snapshots rather than guessing.

Cloudflare's SQLite-backed Durable Objects provide point-in-time recovery for
the whole embedded database, including KV data. It is a secondary recovery
option, not the portable backup. It is not available in local development and
must never be the first restore rehearsal.

## 25. Rollout plan

### Phase A: local foundation

- land documents
- land snapshot helpers and local restore
- land environment guards
- land roster and participation helpers
- pass focused tests, build, and local E2E

### Phase B: staging approval

- review exact resource and deployment commands
- create staging Worker/namespace only after approval
- configure staging secret independently
- deploy staging
- import representative or approved production-derived snapshot
- complete restore and weekend rehearsal

### Phase C: production readiness

- generate a real production snapshot only after explicit approval
- verify file locally without editing it
- review production diff and dry-run target
- remove auto-production deployment from broad branch patterns
- deploy only after approval
- immediately verify claims, profiles, photos, and read-only export

## 26. Launch checklist

- [ ] Production snapshot generated and validated
- [ ] Snapshot stored outside the repository
- [x] Local restore rehearsal passed
- [x] Staging namespace confirmed isolated
- [ ] Staging restore rehearsal passed
- [x] 12/13/14 roster tests passed
- [ ] Final attendance status configured
- [x] Every event participation model approved (July 28, 2026); strict formats
      retain exact capacities and assign any active-roster overflow to Event
      Crew, including an additive fourteenth player
- [x] Every strict event reports exact capacity
- [ ] Full weekend staging rehearsal passed
- [x] Result correction and rollback rehearsed locally
- [x] Betting ledger checked
- [x] Poker totals checked for 12/13/14 seats
- [x] Phone reconnect checked locally
- [x] TV reconnect checked locally
- [x] Production QA and narrow game-progress reset are explicit capabilities;
      restore/import remain absent
- [x] Production target shown before deploy
- [x] Rollback version and data recovery steps available
- [ ] GM has offline copy of the runbook

## 27. Risks and mitigations

| Risk | Current evidence | Mitigation |
|---|---|---|
| Loss of the only state copy | One DO, no export | D0 portable snapshots and rehearsed restore |
| Accidental production mutation | Top-level live config, remote E2E supported | target guards, staging, remote E2E block |
| Branch deploy overwrites live | workflow deploys `claude/**` with live config | production-only protected workflow |
| GM secret disclosure | Resolved: unlock reads required per-environment `env.GM_PIN` | keep values only in Worker secrets and ignored local dev vars |
| Invalid teams | `drawTeams()` accepts all selected players | strict participation validation |
| Player-ID breakage | names are map keys everywhere | retain legacy IDs and add labels/status only |
| Snapshot leaks PII | profiles, travel, and photos are included | GM auth, no public link, ignore files, operator handling |
| Partial restore | no import transaction or backup | validate first, pre-backup, isolated restore |
| QA damages real answers | simulator runs real actions | commissioner gate, production marker, validated snapshot, narrow confirmed reset |
| Lifecycle ambiguity | state inferred across several fields | shared resolver and transition tests |
| Network outage | no offline shell | later M1 reliability slice; printed GM recovery sheet |

## 28. Explicitly deferred M2 items

- awards voting and superlatives
- pressure-putt spectacle
- walkout songs and Spotify
- advanced photo gallery or media pipeline
- reusable event-template platform
- multi-edition archive and season standings
- generalized fairness optimizer
- public registration and accounts
- payment support
- native applications
- broad roster administration UI

## 29. Acceptance criteria by workstream

### D0

- Authenticated export lists every portable key and referenced photo.
- Export does not mutate version or state.
- Metadata identifies snapshot, app, state schema, environment, and object.
- Validation rejects malformed and incompatible input.
- Local restore creates a pre-restore backup and round-trips representative
  state.
- Production restore returns a hard denial.
- Runbook commands are exact and tested locally.

### D1

- `wrangler.jsonc` declares local/staging behavior and explicit DO bindings.
- Staging cannot inherit production bindings or route.
- Environment identity reaches client and TV.
- QA and game-progress reset fail closed unless explicitly enabled; production
  import and restore remain hard disabled.
- CI no longer deploys feature branches to the production route.
- Staging creation/deploy remains an approval stop.

### D2

- One roster config yields active IDs.
- All legacy Scottsdale IDs remain unchanged.
- Pending/out players cannot claim or enter tournament operations.
- Data for inactive players survives.
- Adding player 14 does not alter the 13 existing records.
- Strict formats reject short and oversized inputs.
- 12/13/14 tests pass.
- Overflow roles are validated and stored without changing old draws.

### Lifecycle and guided operation

- Every event resolves to one lifecycle state.
- Invalid transitions are rejected server-side.
- GM sees one action or a blocker.
- Correction paths restore a valid state.
- Phone and TV agree after refresh.

### Scoring

- One result produces one award application.
- Repost/retry does not duplicate points.
- Correction and clear recalculate standings and settlements.
- Contribution audit matches total on every surface.

### Betting

- Invalid, stale, late, self-opposed, duplicate-retry, and unaffordable wagers
  are covered.
- Payouts require no guest arithmetic.
- Ledger remains zero-reconciliation after result correction.

### Poker

- 12/13/14 simulations produce legal chip stacks.
- Minimum, denomination, rounding, and ties are deterministic.
- Table setup and result posting are idempotent.
- Cancel/clear returns the prior board.

### TV

- Each operational state has an appropriate scene.
- Current event and next action survive reconnect.
- Private data and operator controls never render.

### GM console

- Current state, next action, blockers, and recovery are visible together.
- Dangerous controls are separated and confirmed.
- Production supports operator CLI export plus explicitly enabled
  commissioner QA and game-progress reset; it renders no import or restore
  controls.

### Reliability and launch

- Pure, action, integration, and E2E suites pass.
- A complete isolated staging rehearsal is documented.
- Production snapshot and deployment remain explicit approval points.
