# Field Day: experience and systems refactor

**Working brief:** September 4, 2026; corrected September 5, 2026  
**Scope:** a complete experience/design-system redesign and a systematic architecture refactor.  
**Status:** the September 4 guest redesign was deployed to existing staging and then rejected by Brandon. The September 5 repair and subsequent Home redesign are now deployed to staging with his explicit authorization. Browser smoke checks passed; final acceptance remains with Brandon. The current deployment record is in `docs/UX-REPAIR.md`; historical records below describe earlier revisions. Production is unchanged by this repair.

## Authoritative correction: September 5

Brandon likes the dark theme and wants it retained. The light redesign lost
intentional cohesion, replaced his copy with an unwanted voice, and made the
app harder to use. His direction is a system solve with emphasis on UX. This
correction supersedes the light paper/burgundy art direction recorded below.

- Restore the original terse, direct copy from the pre-redesign source.
  Preserve Brandon's tone; do not invent host messages, slogans, or filler.
  Keep current rules accurate when the old wording describes superseded behavior.
- Make betting feel like video roulette or poker. A selected denomination
  goes directly onto a pick; taking a chip back happens on that same stack.
  Keep the rack, exposure, board state, and acknowledged action together.
- A player's name or avatar consistently opens that person's player card.
  Place and retract targets remain distinct from player identity targets.
- Organize the full feature set around guest tasks. Keep four stable main
  areas: Home, Events, Bets, and Weekend. Home remains Home when live, with
  full standings one tap away in a sheet. Weekend contains Trip,
  Rules, and Games with the selected section preserved between visits.
  Player, profile, and event sheets retain a path back to their source.
- Maximize delight within intuitive behavior and usability. Expressive details
  must not obscure the next action, add navigation, or relabel familiar features.
- Preserve existing guest answers, claims, photos, chip choices, completion
  markers, tournament state, and the check-in reliability fixes. No reset or
  repeat onboarding accompanies this repair.

The route and acceptance criteria are recorded in [UX-REPAIR.md](UX-REPAIR.md).

The subsequent Home brief shifts the page from trip planning to use during
the weekend: current activity, actual teammates/opponents, direct rules and
betting, own chips, and active challenges. House information moves to Trip.
Brandon explicitly authorized exploring new dark colors. The local palette
now uses green charcoal, warm bone, muted yellow, and restrained lilac;
saved player colors and authored rules remain intact.
They are requirements for review, not a claim that final verification or a
deployment has completed. The architecture work and data-preservation
requirements below continue to apply.

## North star

Make this the most delightful app this group of friends has used. It should feel unmistakably made by Brandon for his guests: thoughtful, personal, tasteful, playful, and cool. Guests should feel the care through anticipation, ease, and memorable shared moments.

The physical weekend is the main experience. Phones make participation effortless, the TV brings people together, and commissioner controls let the host enjoy the party.

## Returning guests are the primary audience

Brandon has already sent the current production version to everyone. Most guests
have completed check-in; a few stragglers still need it. The main redesign use
case is an existing guest opening the app again after changes have shipped.
This supersedes the earlier emphasis on the invitation as the next design focus.

Keep first-time check-in usable and maintain its reliability fixes, but spend
the next design effort on returning guests: recognize them, preserve their
answers, surface the latest useful trip information, and make new requests
clear without repeating setup. Judge the redesign from an already-checked-in
production-shaped guest record, as well as from an empty local browser.

A design deployment is not an onboarding reset. Keep the existing device ID,
player claim, production origin/PWA identity, `si-me`, `si-onboard-v5`,
`si-seen-v5`, and onboarding-epoch semantics. Never
increment `onboardEpoch`, rotate completion keys, or invoke `rerunOnboarding`
to announce a redesign or collect another answer. Existing guests should land
directly in the current experience; first-time guests retain their check-in path.
Recovery on a new phone or cleared browser should reuse existing server answers
after the guest identifies themselves, rather than imply their answers vanished.

Current-code audit: completed devices already bypass the invitation and land
in the pre-weekend roster or live board. Missing legacy epoch markers adopt the
current epoch without replaying. Completion remains device-local; cleared
storage/new-device recovery is an existing gap to address explicitly. The
server's `hello.you` identity is not yet consumed by the client. Shared loading
copy now says "Opening Field Day" so returning guests are not addressed as new
invitees.

### Later questions, votes, and polls

Brandon may soon need to ask additional questions: preferences for the last day,
restaurant votes, or other trip decisions. The examples are exploratory; no
particular question or poll content is decided yet. Host authoring can be an
authenticated endpoint or script, without a question-builder screen.

The intended shape is a small reusable guest-request feature, separate from
onboarding and the tournament/show controllers:

- Publish a question with a stable ID, answer revision, response type, options
  if relevant, audience, and optional closing time. Start with single-choice,
  multiple-choice, and short text only when the actual questions need them.
- Show a compact interstitial at a calm entry point for an eligible guest who
  has not answered that revision. Offer Later for ordinary preference polls,
  and retain a visible place to return to outstanding questions. Do not insert
  a prompt during a wager, save, draw reveal, or other active interaction.
- Persist answers against the existing player identity, not only the phone's
  local storage. Make resubmission safe, acknowledge saves, and allow revisions
  until the question closes. Reloading should not ask for an answer already saved.
- Keep answered, deferred, and expired states distinct. Re-asking requires a
  deliberate new answer revision; a copy edit or deployment should not nag the
  whole group again. Avoid stacking several blocking dialogs on entry.
- Let the host close a poll and read responses or tallies. Decide results
  visibility per question; never assume free-text replies are public.

Possible endpoint contract, to settle during implementation: authenticated host
publish/close/results operations under `/api/admin/prompts`, and guest pending
questions/response operations under `/api/prompts`. Use the existing GM token
and server-side device claim checks. Keep responses out of the public tournament
broadcast when they are host-only; both transport and storage belong behind
the existing single authoritative Durable Object. Any new persisted records
must participate in snapshot validation, backup/restore, and reset preservation.

Implemented Sept 29 for the first concrete request, Saturday-night awards (D6):
`shared/prompts.js` (model and per-viewer projection), `worker/prompts.js`
(reducers shared by the socket actions and the HTTP endpoints), `state.prompts`
(ballots plus per-voter answers, preserved by a progress reset, carried by
snapshots, never in a frame), `GET/POST /api/admin/prompts`,
`POST /api/admin/prompts/:id/(publish|close|reopen|reveal|end)`,
`DELETE /api/admin/prompts/:id`, `GET /api/admin/prompts/:id/results` with the
existing GM token, and `GET /api/prompts`, `POST /api/prompts/:id/responses`
by device claim. Only single-choice questions whose options are players exist
so far; results visibility is "totals once revealed", and the first revealed
award deletes the per-voter answers. No production migration: an old state
hydrates an empty `prompts`.

This brief expands the earlier M2 restriction against a broad redesign. Earlier PRDs remain records of existing behavior and unfinished work; they do not limit the new design scope. Existing production data and tournament correctness remain compatibility requirements.

## Confirmed starting point

- The user confirms existing staging and production environments and real production data.
- The current production app has already been shared with the full group; most guests are returning users with completed check-in.
- Checked-in targets are `scottsdale-invitational` for production at `fielddayseries.com`, `scottsdale-invitational-staging`, and isolated local development. Their deployed revisions and current data have not been inspected in this review.
- Production has real guest answers. Preserve player IDs, claims, profiles, photos, apparel sizes, travel answers, ratings, chip selections, logistics, event configuration, and all official competition records.
- The baseline is branch `m2/spectacle-foundations`, commit `f400755` on August 6. M1 is code complete; M2 is partly implemented. Its production flags are off in checked-in configuration, which does not prove current deployed configuration.
- The previous honors and expanded betting experiment was reverted. Any return to that feature set is a deliberate product decision.

## Taste: signals, not a visual template

Brandon named Kith, KidSuper, ADER ERROR, Proper Hotels, Sofitel, Auberge, Commodore Perry Estate, Tecovas, Miura, and Titleist. He explicitly does not want the app to necessarily look like those references.

The proposed synthesis is:

- **Editorial confidence:** strong typography, considered composition, an identity that holds up on a jersey, chip, invitation, and screen.
- **Personal expression:** original illustration, a surprising proportion or color pairing, and a few details specific to this group. Humor should come from the people and weekend.
- **Thoughtful hospitality:** arrival and trip information when useful, saved answers respected, a clear next action, and no need to repeatedly ask the host what to do.
- **Precision and tactility:** crisp numerals, carefully paced movement, chips with convincing placement and retrieval, exact feedback on every action.
- **Texas warmth:** a subtle personal thread through materials, typography, and tone. Specific motifs need to earn their place in the art direction.

The September 5 correction constrains the art direction: retain the warm dark
palette, Barlow Condensed competition/display type, Inter functional type,
and the existing chip identity. Revisit hierarchy and interaction where they
improve use, with legibility outdoors and across the room. The earlier open
permission to replace the palette and voice is superseded.

## Product simplification before feature expansion

Organize around what a guest needs when they return: current trip details and new requests before the weekend, playing now, progress, and the finale. Keep invitation and arrival available for stragglers. Audit every existing surface against those needs.

Keep routine navigation compact. Separate host operation from guest participation. Make full rules, bracket history, corrections, and diagnostics available at the appropriate depth. Extra features must justify the attention they demand. Do not turn unfinished M2 ideas into an automatic backlog for the redesign.

Signature moments to design as connected flows:

1. Returning guests immediately recognize their own weekend, see what matters now, and can answer a new request without repeating check-in. New guests still finish with a personal player identity.
2. A chip moves from the rack onto a pick and settles only when acknowledged.
3. A shared draw gives the TV a reveal and each phone a practical landing: partner, opponent, next action.
4. A result produces a clear winner moment, settled chips, and understandable rank movement.
5. The finale closes the competition and leaves a personal record of the weekend. New recap/keepsake features need explicit scope and source-data definitions.

## Architecture

Keep the React/Worker/Durable Object foundation and the single writer for this tournament. Refactor responsibilities and dependencies before changing persistence or the network protocol.

| Layer | Responsibility | Intended direction |
| --- | --- | --- |
| UI foundations | Tokens, typography, spacing, controls, sheets, motion, responsive shell | `src/ui/`; shared across phone, TV, and commissioner views |
| Identity | Player appearance and profile presentation | Explicit provider/props; replace the mutable `CHIP_PROFILES` singleton |
| Guest features | Arrival, profile, travel, events, standings, wagers, poker | Cohesive feature modules and reusable competition views |
| Host operation | Next action, corrections, configuration, QA | Dedicated commissioner and rehearsal controllers; preserve capability checks |
| Show | Scene sequencing, reveal history, TV, optional audio | One explicit presentation controller, independent of official results |
| Client application | Session, navigation, dispatch, pending/rejected/reconnecting state | Thin composition root plus focused hooks/controllers |
| Domain | Economy, participants, brackets, poker, event lifecycle | Cohesive modules behind the existing `shared/core.js` export facade |
| Server actions | Authentication context, validation, domain mutation | Feature handlers behind `applyAction`; keep global poker guards centralized |
| Infrastructure | WebSockets, persistence, photos, integrations, snapshots | Separate route/service responsibilities; keep persistence/publication centralized |

Phone and TV may share competition primitives but must not import from the application root. Extract intertwined reveal/simulation effects together before altering their behavior. Split handler dependencies explicitly; handlers must not import the action registry that imports them.

The first pass preserves persisted schema, storage keys, object namespace/class/name, environment targets, action types and payloads, IDs, settlement rules, claims, and snapshot compatibility. Any later change to these requires an explicit compatibility strategy and rehearsal. Retain additive hydration.

## Validation and rollout

Work locally against fixtures first. Run the existing domain, action, snapshot, and weekend-rehearsal tests; build both production and staging targets without deploying. Add behavioral tests where controllers or contracts change. Check real rendered guest, host, and TV flows because the current test suite does not cover the complete UI.

Before release, verify the actual deployed revisions and environment identities, obtain and validate an authorized backup, and rehearse against production-shaped data in an approved isolated environment. Follow `production-data-runbook.md` for personal-data handling. A staging deployment, production export/import, or production release is a separate concrete operational action; this brief does not execute one.

A previous Worker version alone may not reverse a future schema change. Any migration must define both compatible code rollback and data recovery. Initial refactor slices should avoid that requirement by preserving the data contract.

## Sequence and acceptance

- [x] Establish current local baseline and record the user's production/staging and experience requirements.
- [x] Extract shared UI tokens, controls, shell, and static stylesheet with the existing appearance and behavior preserved.
- [x] Implement the first expressive invitation and player identity direction for local review.
- [ ] Extend and judge the design across live events, standings, and TV together.
- [x] Replace hidden player identity state and extract shared avatars and chips.
- [x] Extract check-in, profile editing, and travel presentation into guest feature modules.
- [ ] Prioritize the returning guest home with saved identity, current plans, and a place for new requests; avoid further FTUX expansion.
- [x] Add reusable questions/polls with endpoint-based host authoring when a concrete question is ready (D6 awards, Sept 29).
- [ ] Separate guest features, host operation, show sequencing, and QA from the application root.
- [ ] Split domain and server responsibilities behind compatible facades where that materially improves clarity.
- [ ] Implement the chosen design and motion system across the connected guest journeys.
- [ ] Rehearse pending actions, duplicate taps, reconnects, corrected results, and failed audio as carefully as the happy path.
- [ ] Complete staging acceptance, authorized production backup, and a reviewed release with a recovery path.

Judge success by whether guests know what to do without coaching, feel recognized, enjoy the shared moments, and spend their attention on each other. Fewer confusing states and fewer host interventions matter alongside the quality of the visuals.

## First extraction validation

`npm run check`, all 43 automated tests, both production and staging builds, and
`git diff --check` pass. The 18 moved theme/control declarations match the
baseline source after normalizing line endings. The local invitation and TV
shell were checked in the browser with no console errors. Full commissioner
and guest journey testing remains part of later slices. No remote data was
read and no environment was deployed. The existing main-bundle size warning
remains; module extraction by itself does not implement lazy loading.

## Historical guest redesign, superseded September 5

The first art-direction slice used warm paper, burgundy, citron, and a rust
accent, with Archivo Black for invitation headlines. These primitives live in
`src/ui/experience.css`. The invitation reads as a personal note from Brandon;
the editable player card carries the guest's name, number, photo, and actual
chip design and turns over on tap. The card also appears in the pre-weekend
roster and profile editor. This is a working direction for review, not a claim
that the event, commissioner, and TV redesigns are finished.

The application root is now about 6,750 lines, down from 8,298. Identity uses an
explicit React provider instead of a render-mutated singleton. Profile, travel,
and check-in own their UI and local drafts without importing App. Check-in is a
separate lazy-loaded JS/CSS chunk. Domain code, server actions, environment
configuration, storage layout, and persisted schemas are unchanged.

The six check-in stages remain, now with Back navigation and a single saved
draft per guest. The first snapshot initializes existing answers once; later
broadcasts do not overwrite typing. Claim, travel, profile/photo, and ratings
advance only after acknowledgements. A profile photo must finish saving before
the editor closes, has a 20-second abort deadline, and can be retried without
discarding the crop. Chip selection and profile save share a pending guard.
The ratings shortcut fills only unanswered sports, preserving prior choices.
Card motion respects reduced-motion settings; the map also hides its SVG
traveling chips under reduced motion.

Validation: all **62 tests** pass, including 19 added identity, acknowledgement,
duplicate-submission, upload-timeout, and retry tests. `npm run check`, production
build, staging build, and whitespace checks pass. Identity extraction was also
compared against the original in 5,379 rendered cases. Local browser checks
covered invitation/travel, card editing and flipping, saved photo after cropping
an app-icon fixture, profile sheet, roster, and TV. Narrow 320px and 390px layouts
had no horizontal overflow; desktop was inspected. No browser console errors
were observed. Full live-event/commissioner acceptance is still pending.

No remote data was read or written and neither environment was deployed. Local
QA changed local guest fixtures only. The main JS bundle is about 503 kB
minified plus the optional 9.9 kB check-in chunk; Vite's 500 kB warning remains.
Builds also report that this local shell does not provide `GM_PIN`; a new GM
unlock was not part of this verification.

## Staging deployment record

Authorized by Brandon's explicit request to deploy to staging on September 4,
2026 (Pacific; September 5 UTC).

- Target: `scottsdale-invitational-staging`.
- URL: https://scottsdale-invitational-staging.btran-backdrop.workers.dev
- Deployed Cloudflare version: `2776147a-6d9c-4bac-bf1c-d0f46c9a5e80`.
- Previous staging version: `e4a40926-d26a-40cb-adf5-96915d920d9c`.
- Source: current uncommitted workspace on `m2/spectacle-foundations` over
  `f400755`, including the guest redesign/refactor and neutral returning-user
  loading copy. The future questions/polls feature remains planned only.
- Checks: `npm run check`, all 62 tests, staging build, and Wrangler dry-run.
  Verified generated target/name, `APP_ENV=staging`, empty routes, and the
  staging-local `Tournament` binding immediately before publishing. Existing
  required secret names were verified; no secret values were read or changed.
- Published client entry: `/assets/index-RSgDpMuU.js`. Browser verified this
  entry, the staging title/manifest, the STAGING banner, successful initial
  server snapshot, and no console errors.
- No production deployment/access, data reset, snapshot import, migration,
  onboarding-epoch change, or guest-answer submission was performed.

The source `APP_VERSION` label remains `m2-audio-director-1`; use the Cloudflare
version above to identify this exact deployment. The existing bundle-size
warning remains. Broader staging acceptance of live-event/commissioner flows
is still outstanding; this record covers publication and startup smoke checks.

## Reference context

The taste synthesis above is a design interpretation, not an instruction to copy the references. Background: [KidSuper's origin](https://kidsuper.com/pages/about), [ADER ERROR's creative approach](https://adererror.com/en/introduce), [Commodore Perry Estate](https://auberge.com/commodore-perry/), and [Miura's process](https://miuragolf.com/pages/the-miura-way).

Infrastructure review references: [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Durable Object environments](https://developers.cloudflare.com/durable-objects/reference/environments/), and [Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/).

## Historical guest experience pass (September 4, 2026)

This is the record of the light redesign rejected on September 5. Its visual
and copy direction is superseded by the correction at the top of this brief.
Its extractions, data compatibility, and acknowledgement guards remain useful.

Brandon rejected the first staging release because the invitation/player card
had changed while the main guest app still used the old design. This pass
replaces the primary guest layouts together rather than treating check-in as
representative of the full app.

- Returning home: personal greeting, the house and host note, saved travel/size
  details, the next event, and the group. The large player pass belongs in the
  profile flow instead of dominating the home screen.
- Shared system: warm paper, burgundy ink, citron features; Archivo headlines,
  Inter controls, condensed competition numbers. One semantic palette in
  `src/ui/experience.css`; `.fd-night` scopes TV and immersive live surfaces.
  Shared header, icon navigation, buttons, sheets, and game marks carry the
  design into details and controls. PWA colors match without changing app IDs,
  origins, scopes, icons, or installed entry points.
- Feature boundaries: `features/home/`, `features/weekend/`,
  `features/standings/`, and `features/wagers/` now own the primary pages.
  Schedule retains ordering, extras, shelved events, crew, and host actions.
  Standings retain authoritative ranks, points, exposure, deltas, poker and
  championship states. Wagers retain the original action contracts and ledger
  compatibility. No game logic was moved out of the shared authority.
- The field guide and event sheets were redesigned. All game instructions now
  render immediately; the old staggered rule reveal is removed.
- Questions/polls remain planned. No new questionnaire, reset, or forced
  check-in was introduced.

Validation: all 67 automated tests pass, including five new actual-component
wager tests for pick payloads, bracket/stage progress, exposure/balance/lock
restrictions, one-chip retraction, and merged legacy IDs. Independent fixture
review also covered standings ties, champions, poker OUT, and all game rules.
`npm run check`, staging build, dry-run, and `git diff --check` passed. The
existing client-size warning remains (about 504 kB minified / 151 kB gzip).

Browser review covered the returning home, Events, Bets, field guide, profile,
event sheet and game rules at phone sizes including 320px and 390px. No
horizontal page overflow was found in the inspected primary pages/profile.
The local saved commissioner token was rejected by the server, so a real local
live-game mutation was not performed. Live gameplay was validated with the
component fixtures and domain tests; full authenticated host acceptance is
still outstanding. An optional standalone browser-fixture page could not be
opened by the browser client; its temporary serving directory was removed.

### Updated staging deployment

- Worker: `scottsdale-invitational-staging`.
- Version: `26b6412e-c2c9-4500-8b93-ed87869aaaab`.
- Replaces: `2776147a-6d9c-4bac-bf1c-d0f46c9a5e80`.
- URL: https://scottsdale-invitational-staging.btran-backdrop.workers.dev
- Client: `/assets/index-CxaX8UXC.js`.
- Verified generated staging name, environment, target, empty production
  routes, and local Tournament binding before deployment. Publication
  succeeded; browser confirmed the new client, staging banner/title, warm
  theme color, hydrated UI, and no console warnings/errors.
- Existing remote state, secrets, guest answers and onboarding markers were
  preserved. No production access/deploy, migration, snapshot restore, or
  remote guest/host submission was performed.
