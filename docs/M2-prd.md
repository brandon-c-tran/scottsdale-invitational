# Field Day Milestone 2 PRD

**Product:** Field Day, Scottsdale 2026  
**Milestone:** M2, Spectacle and Social Layer  
**Status:** Defined; first foundation slice in progress  
**Baseline:** M1 is live at `fielddayseries.com` and holds real guest data  
**Last updated:** July 28, 2026

## 1. Executive summary

M0 proved the complete tournament. M1 made it safe and dependable to operate.
M2 makes the same weekend feel like one coordinated live show across the games,
phones, TV, player identities, social recognition, and the room's music.

The core principle is:

> Mobile collects quick input. TV directs shared attention. Audio creates
> emotion. The physical weekend remains the main event.

M2 is not a broad redesign or a second tournament engine. It adds a restrained
presentation and participation layer to the existing single-authority Durable
Object. Competition facts still come from results, draws, brackets, stages,
wagers, and the M1 lifecycle. Presentation references those facts and may
temporarily direct attention to one structured scene.

P0 has five workstreams:

1. a coherent interaction hierarchy
2. recoverable Show Control
3. a policy-compliant Audio Director
4. a more intentional TV broadcast surface
5. quick, positive Postgame Honors

The first implementation slice is Show Control foundations. It introduces a
feature-gated, server-authoritative scene record, bounded history, GM controls,
and a TV override that survives refresh and reconnect. It deliberately has no
Spotify dependency.

## 2. Problem statement

Field Day already knows what is happening, but its presentation is split across
several independent behaviors:

- TV rotates through useful information on a fixed timer.
- event introductions and team reveals are client-side overlays
- the GM lifecycle controls game state but not a coordinated room moment
- many action styles communicate hierarchy inconsistently
- player photos and chips create identity, but that identity is not yet used in
  a complete broadcast grammar
- the guide names end-of-weekend awards, but there is no positive recognition
  input or aggregation model
- music is entirely outside the application

The result is a capable live dashboard, not yet a produced event. M2 must create
shared moments without making the GM a full-time producer or asking guests to
stay on their phones.

The failure mode to avoid is a brittle layer of animations and API calls that
can stall the tournament. A scene, music provider, TV, or guest phone may fail.
The official result, lifecycle, standings, betting settlement, and next GM
action must remain correct.

## 3. Relationship to M0 and M1

### 3.1 M0 capabilities retained

- the invite and six-step check-in
- device claims and stable Scottsdale player IDs
- player chips, numbers, display names, and photos
- 17 scored events plus the poker finale
- draws, brackets, stages, drafts, wagering, duels, and derived standings
- event, result, and champion reveals
- TV mode and a commissioner console
- one Worker and one Durable Object named `main`

### 3.2 M1 contracts retained

- the Durable Object is the only writer
- every mutation is validated in `worker/actions.js`
- full authoritative state is broadcast after persistence
- `shared/core.js` remains the source of gameplay truth
- result and wager consequences remain derived
- `eventOps` and the shared lifecycle determine operational state
- current production-shaped state hydrates additively
- production capabilities fail closed
- game-progress reset preserves people and event configuration
- production deploy, data access, reset, and secret changes remain explicit
  approval points

### 3.3 M2 additions

- a durable presentation scene layered over tournament facts
- one GM surface for starting, advancing, skipping, retrying, canceling, and
  recovering live scenes
- TV presentation components that consume structured tournament data
- a consistent action hierarchy across high-value guest and GM flows
- optional walkout-song metadata associated with a player profile
- server-mediated music catalog and explicit GM playback adapters under the
  isolated test authorization confirmed July 28, 2026
- positive, event-scoped honors with bounded guest input
- derived ceremony, award, and recap outputs

### 3.4 Existing foundations M2 can extend

| Existing capability | M2 use |
|---|---|
| `resolveEventLifecycle()` and `resolveWeekendOperation()` | choose valid scene context without duplicating game state |
| full-state WebSocket reconnect | reconstruct the active TV scene after refresh |
| `coalescePendingReveals()` | prevent a returning client from replaying old ceremonies |
| `EventIntro`, `Reveal`, `VersusDraw`, `ChampionCard`, `Avatar`, `GameMark` | initial broadcast presentation vocabulary |
| `profiles`, stable IDs, and separate photo storage | walkouts, player cards, honors, recap |
| runtime `capabilities` | hide incomplete M2 systems in staging and production |
| `resetTournament` | clear transient show and honor progress while preserving profiles |
| local QA driver and deterministic rehearsal | exercise scenes without production data |

## 4. Product principles

1. **The room wins.** A successful interaction ends with people looking up.
2. **Competition facts stay authoritative.** Presentation references game state;
   it does not replace it.
3. **Major moments earn ceremony.** Routine operations remain fast.
4. **The GM gets one clear control surface.** Production is a sequence, not a
   collection of hidden animation buttons.
5. **Audio is optional infrastructure.** Tournament and TV operation never wait
   for Spotify.
6. **Recoverability beats perfect timing.** Every scene can be advanced,
   skipped, canceled, or reconstructed.
7. **Positive social recognition only.** Honors broaden what the weekend values
   without creating a popularity contest.
8. **Structured data before manual copy.** Winner, matchup, team, and standings
   screens derive from official facts.
9. **Fast phone input.** A normal guest action takes one or two taps.
10. **Preserve Field Day's voice.** Terse, direct, no borrowed broadcast or
    casino slogans, no exclamation-mark energy.

## 5. Goals

1. The GM can deliberately direct the TV to a meaningful scene and recover from
   interruption without changing tournament truth.
2. TV refresh or WebSocket reconnect reconstructs the same active scene.
3. Presentation remains useful with audio disconnected.
4. High-value actions communicate a consistent primary, secondary, tertiary,
   compact, selected, and destructive hierarchy.
5. Guests can eventually choose a walkout track without authenticating a
   Spotify account.
6. Only one GM-authorized playback identity can control the room.
7. Music search, playback control, and provider credentials remain separated.
8. Eligible postgame moments can collect one quick positive honor per guest.
9. Honors create breadth-based recognition without a raw public vote count.
10. M2 can be disabled without rolling back M1 code or rewriting state.

## 6. Non-goals

M2 does not include:

- a social feed, chat, direct messaging, or comment threads
- a general event-production or slide-composition platform
- a Spotify replacement, general music browser, or collaborative DJ product
- direct speaker control for guests
- Spotify login for every guest
- synchronized audio as a dependency of any official transition
- negative honors, downvotes, or a public popularity leaderboard
- a video editor, automatic highlight reel, or unlimited media gallery
- a new account or role-based permission system
- arbitrary brackets, multi-tenant tournaments, or multi-edition archives
- a broad UI rewrite or a new frontend framework
- changing existing Scottsdale player IDs
- storing derived scores, ranks, winners, or payouts

## 7. Intended experience

### 7.1 Player experience

- A phone asks for a quick choice, then gets out of the way.
- A walkout song can be selected from the existing profile in a short search
  flow. A Spotify link remains available when preview is unavailable.
- A postgame honor is one recipient, one theme, and an optional short note.
- Prompts are selective. Missing an honor or music request never blocks play.
- TV, not the phone, carries the reveal.
- Player identity remains the chip, photo, number, and display name already
  learned during check-in.

### 7.2 GM experience

- The normal event lifecycle remains the primary operating flow.
- Show Control identifies the current scene, its step, and what happens next.
- The GM can start an appropriate scene from official context.
- Advance, skip, cancel, and retry are explicit.
- Audio status is visible but never mixed into the success condition for a
  tournament action.
- Dangerous actions remain visually separate from presentation controls.
- A lost TV or Spotify session can be recovered without reconstructing results.

### 7.3 Room experience

- The TV temporarily stops ambient rotation for an intentional scene.
- Player, team, matchup, winner, standings, poker, award, and champion
  presentation use one visual grammar.
- The most important current fact remains readable from across the room.
- Audio may heighten a moment, but silence still leaves a complete scene.
- Routine state changes do not trigger a ceremony.

## 8. Scope

### 8.1 P0: interaction and visual-system consistency

The repository currently has a useful `Btn` component with five kinds, a
`Sheet`, `PlayerChip`, and many purpose-built controls. It also has 80 direct
`<button>` instances in `src/App.jsx`, 5 in `PhotoCropper.jsx`, and 96 `Btn`
uses. Many raw controls are intentional, such as bracket cells and chip racks.
Others duplicate action hierarchy in slightly different styles.

P0 requirements:

- define semantic action roles: primary, secondary, tertiary, compact,
  destructive, and icon
- keep selection controls distinct from command controls
- standardize minimum 44px touch targets for normal phone actions
- define loading, disabled, pressed, selected, success, error, and confirmation
  behavior
- prevent a destructive style from also serving as a routine secondary action
- give async actions one pending state and prevent duplicate taps
- standardize sheet action placement and close behavior
- migrate representative high-value surfaces first:
  - GM next action
  - commissioner menu
  - Show Control
  - result confirmation and correction
  - profile save
- document intentional one-off controls and the remaining migration inventory
- retain semantic tokens and the current Field Day visual identity

### 8.2 P0: Show Control

Show Control is a presentation coordination layer, not another lifecycle.

The first scene families are:

- opening
- event introduction
- team, bracket, or matchup reveal
- betting open and betting locked
- match start
- winner
- standings
- poker
- award
- champion

Each scene declares:

- kind
- intensity: `major`, `normal`, or `routine`
- official context reference, such as event, result, bracket match, or player
- ordered presentation steps
- optional audio cue intent, not provider playback state
- start time and current step
- terminal outcome: completed, skipped, or canceled

Requirements:

- only an unlocked GM can mutate show state
- unfinished capability remains hidden unless the server enables it
- only one scene is active at a time
- starting a second scene requires ending or explicitly replacing the first
- active scenes persist and broadcast through the existing Durable Object
- TV prioritizes an active scene over ambient rotation
- phones may receive a concise prompt, but P0 does not require a full-screen
  overlay on every phone
- advancing the final step completes the scene and returns TV to ambient state
- skip immediately returns TV to useful ambient state
- cancel records operator intent and returns to ambient state
- retry creates a new scene from a bounded prior record
- scene history is bounded and excludes private payloads
- a scene may reference an official transition, but tournament mutations must
  remain atomic and server-validated when that coupling is introduced
- no scene completion depends on audio success

### 8.3 P0: Field Day Audio Director

Product intent:

- ambient playback during normal weekend operation
- one GM-authorized playback session
- player walkout tracks with configurable `startMs`
- event introduction, winner, award, and champion cue intents
- a clear return to ambient playback
- approved guest requests below live show cues in priority
- now-playing context where it adds value

Capability split for the isolated test implementation:

1. **Catalog adapter:** server-side track search using application credentials.
   Guests never receive the client secret or application access token.
2. **Profile metadata:** store only a compact track reference, display metadata,
   Spotify URL, duration, and requested start position.
3. **Playback adapter:** one GM authorization-code session with only the scopes
   needed to read and modify playback.
4. **Coordinator:** converts a Show Control audio intent into a best-effort
   provider command and records provider status separately from scene status.
5. **Fallback:** show metadata and an open-in-Spotify link, or let the GM play
   the cue manually.

Audio queue priority:

1. active live-show cue
2. explicit GM selection
3. GM-approved guest request
4. ambient context

This is a policy model, not a promise that Spotify guarantees command order.
Spotify states that order is not guaranteed when player endpoints are used
together. Field Day must serialize its own intent and tolerate provider lag.

### 8.4 P0: Broadcast Presentation

TV mode evolves from an ambient status channel into two modes:

- **ambient broadcast:** the current M1 rotation, improved over time
- **directed scene:** a Show Control override with explicit GM progression

Structured formats:

- player card
- team card
- matchup
- bracket reveal
- event introduction
- betting open and locked
- countdown
- winner
- standings movement
- poker buy-in, clock, and result
- award
- champion

Requirements:

- derive content from public tournament facts
- never expose ratings, claims, travel, credentials, snapshot metadata, or
  private notes
- retain a readable current event and recovery state
- treat player photos as public presentation assets only where already expected
- use selective motion and respect reduced-motion preferences
- keep important text legible at living-room distance
- do not require album art or Spotify playback to render a complete scene

### 8.5 P0: Postgame Honors

Eligible scope:

- a completed event
- a meaningful completed bracket matchup
- a finale or ceremony checkpoint selected by the GM

An honor record contains:

- stable record ID
- source moment reference
- giver player ID
- recipient player ID
- one configured theme
- optional short note
- timestamp

Initial theme direction:

- Clutch
- Teammate
- Good sport
- Energy
- Smart play
- Chaos

Names remain product-editable before launch. "Chaos" must be presented as
positive entertainment, not criticism.

Rules:

- no self-honors
- giver and recipient must be confirmed participants relevant to the moment
- one submission per giver per moment
- duplicate delivery is idempotent
- a submission may be changed during a short open window
- notes are optional, length-bounded, and never required for aggregation
- the GM opens and closes an honor moment
- no raw public count or ranked popularity table
- breadth across unique givers, events, and themes matters in derived awards
- honors never change tournament standings
- no event result or next action waits for honor completion

### 8.6 P1

P1 is defined now but begins only after the P0 operating loop is rehearsed:

- structured ceremony mode joining several show scenes
- one-tap memorable-moment capture
- honor-derived awards
- a small number of live-voted awards
- richer derived storylines, streaks, rivalries, and upset context
- weekend recap presentation
- subtle haptics and synchronized non-audio room prompts
- richer request approval and queue behavior
- separate victory-song configuration
- photo-supported recap and award moments

## 9. Success criteria

- M1 tests and full local weekend rehearsal remain green.
- Pre-M2 state hydrates without data loss.
- An active scene survives Worker hibernation, phone reconnect, and TV refresh.
- A GM can start, advance, complete, skip, cancel, and retry a scene.
- TV returns to a useful ambient state after every terminal outcome.
- Disabling the M2 capability hides controls and ignores unfinished scene
  presentation without deleting state.
- A scene renders with no music provider configured.
- Spotify secrets and refresh tokens never appear in a state frame or browser
  bundle.
- Guest catalog search does not require guest Spotify authorization.
- Audio provider failure never rejects an official tournament mutation.
- An honor cannot target its giver or be duplicated for one moment.
- No honors surface exposes a raw popularity ranking.
- Representative migrated actions meet touch, focus, disabled, pending, and
  destructive-state requirements.
- A complete staging rehearsal proves scene recovery before any production
  enablement.

## 10. Core user journeys

### 10.1 Event introduction

1. The M1 lifecycle identifies the current event.
2. The GM opens Show Control and starts Event intro.
3. The Durable Object persists the scene and broadcasts it.
4. TV stops ambient rotation and presents the event.
5. Audio Director attempts the cue if available.
6. The GM advances when the room is ready.
7. The scene completes and TV returns to live event context.
8. Betting or event lifecycle proceeds through its existing action.

### 10.2 Recover a scene

1. TV refreshes or loses its socket during a reveal.
2. The reconnecting client receives the full state.
3. TV resolves the active scene and current step from that state.
4. The GM can continue, skip, or cancel from the same record.
5. Audio may remain unavailable without changing the recovery path.

### 10.3 Player walkout song

1. A player edits the existing profile.
2. The player searches by track or artist.
3. The server returns a small attributed result list.
4. The player chooses a result and optionally selects a start position.
5. The profile stores compact metadata, not credentials or an audio file.
6. A walkout scene references that metadata.
7. If provider playback is unavailable, TV still presents the player and the GM
   may open the Spotify link manually.

### 10.4 Postgame honor

1. The GM completes an eligible result and optionally opens honors.
2. Phones show one compact prompt.
3. A player selects one recipient and one theme, with an optional note.
4. The server validates identity, scope, and duplicate rules.
5. The prompt closes after submission or skip.
6. TV may show that honors are open, but never live vote totals.
7. Later awards derive from breadth and context.

### 10.5 Audio outage

1. A scene starts while Spotify or Wi-Fi is unavailable.
2. TV presents immediately.
3. Audio status reports unavailable to the GM.
4. The GM continues silently or uses Spotify manually.
5. The event lifecycle and scene controls remain available.

## 11. Functional requirements

### 11.1 Interaction primitives

- use semantic roles rather than color names as public APIs
- support button and link semantics without nested interactive elements
- expose `aria-busy`, `aria-pressed`, labels, and focus visibility where relevant
- ignore repeat activation while an async action is pending
- maintain 44px minimum target size except clearly compact desktop/TV controls
- keep icon-only actions labeled
- show confirmation consequences before destructive actions
- keep server rejection copy visible and actionable

### 11.2 Show state

- additive top-level state with current active scene and bounded history
- stable scene and command IDs
- scene context uses stable IDs and coordinates, never copied result truth
- step count comes from a versioned scene definition
- unknown future scene kinds fail closed in old clients
- no unbounded timeline, logs, or provider responses in broadcast state
- reset game progress clears active and historical show state
- snapshot export includes show state as part of normal state

### 11.3 Show actions

- `start`: validate capability, GM, kind, and source context
- `advance`: move one step or complete
- `skip`: terminal, recoverable ambient return
- `cancel`: terminal, records operator choice
- `retry`: start a new ID from an eligible bounded history record
- retries or duplicate delivery do not create two active scenes
- official lifecycle transitions remain separate until an explicitly atomic
  combined action is designed and tested

### 11.4 Audio metadata

Profile track metadata may contain:

```js
{
  provider: "spotify",
  trackId: "stable-provider-id",
  uri: "spotify:track:...",
  url: "https://open.spotify.com/track/...",
  name: "Track",
  artists: ["Artist"],
  durationMs: 210000,
  imageUrl: "provider-image-url",
  startMs: 42000
}
```

Rules:

- all fields are validated and length-bounded server-side
- `startMs` is clamped below track duration
- preview URLs are not stored as a required capability
- album art remains unmodified and linked back to Spotify when used
- an absent track is valid for every profile
- old profiles remain readable

### 11.5 Audio authorization and playback

- application client secret stays in Worker secrets
- client-credentials access tokens stay server-side
- GM refresh token is encrypted or stored as a Worker secret or separately
  protected server record, never tournament broadcast state
- OAuth uses Authorization Code on a secure backend
- local redirect uses `127.0.0.1`, not `localhost`
- playback requires explicit GM authorization and minimum scopes
- devices are refreshed rather than treated as permanently stable IDs
- provider requests have timeouts and bounded retry
- rate limit and quota errors degrade visibly
- no provider response body containing credentials is logged

### 11.6 Honors

- server-authoritative open honor moment
- event or matchup eligibility validated from official facts
- one record per giver and moment
- bounded note and bounded total history
- corrections to a source result do not silently reassign honors
- clearing a source result marks its honor moment ineligible for aggregation
  until corrected; it does not erase the audit record
- award aggregation is pure and separately testable

## 12. Presentation principles

- One focal point per scene.
- Use the existing chip, player photo, number, event mark, and phase palette.
- Preserve full-dark TV chrome and living-room contrast.
- Keep routine scene motion under a few seconds.
- Major scenes may use multiple steps; normal and routine scenes should not.
- Avoid auto-advancing an operationally meaningful scene.
- Use fixed-duration ambient rotation only when no directed scene is active.
- Do not make the ticker compete with a major reveal.
- Copy states the fact: event, matchup, winner, rank movement, or next action.
- No raw hex outside the existing semantic token sources and player colors.
- No gradients, glows, emoji artwork, or luxury-event conventions.

## 13. Audio principles and Spotify feasibility

Research was checked against current official Spotify material on July 28,
2026.

Technically:

- [Client Credentials](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow)
  supports server-to-server access to non-user endpoints and is the intended
  candidate for catalog search.
- [Search for Item](https://developer.spotify.com/documentation/web-api/reference/search)
  requires OAuth and can return track metadata.
- [Authorization Code](https://developer.spotify.com/documentation/web-api/concepts/authorization)
  is Spotify's recommended flow for a long-running backend that can hold a
  client secret and refresh token.
- playback control needs `user-read-playback-state` and
  `user-modify-playback-state`; Web Playback also needs `streaming`.
- [Start or Resume Playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
  supports `position_ms`, requires Premium, and does not guarantee ordering
  with other player commands.
- [available devices](https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices)
  may omit devices and does not guarantee a device ID remains stable.
- [track preview URLs](https://developer.spotify.com/documentation/web-api/reference/get-track)
  are nullable and deprecated. They cannot be the core preview experience.
- current [development-mode quota rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
  require the app owner to have Premium and allow up to five authenticated
  users. Field Day's one GM account fits the user count, while guests should
  use app-level catalog search rather than authenticate.

Policy remains a production approval gate:

- Spotify's current [Developer Policy](https://developer.spotify.com/policy)
  says developers must not create a game using the Spotify Platform.
- The same policy says sound recordings must not be synchronized with visual
  media.
- Player API reference pages also prohibit non-interactive broadcasting.

Field Day is a game and Show Control can coordinate TV and music. The product
owner confirmed permission for isolated Spotify testing on July 28, 2026, so
staging may provide server-side catalog search, profile walkout metadata, and
explicit GM playback controls. This does not establish public-launch approval.
Automatic scene-triggered playback remains disabled; production enablement
still requires written Spotify clarification or a different provider strategy.

## 14. Degraded-mode behavior

| Failure | Required behavior |
|---|---|
| Spotify not configured | show setup guidance; Show Control and TV work |
| catalog search unavailable | retain saved track; offer retry or open Spotify |
| no preview | show metadata and open-in-Spotify link |
| GM token expired | mark audio disconnected; do not end the scene |
| no active Spotify device | ask GM to select or activate one; continue silently |
| playback command timeout | show best-effort failure; do not retry indefinitely |
| TV disconnect | active scene remains persisted; refresh reconstructs it |
| GM phone disconnect | TV holds the scene; another unlocked GM device can recover |
| scene kind unknown to client | render a safe Field Day holding state |
| source result corrected | resolve current official data or mark scene context stale |
| honors unavailable | continue to the next event without prompt |
| photos unavailable | fall back to chip and initials |
| reduced motion | use immediate or simple fade transitions |

## 15. Privacy and security

- Spotify client secret, application tokens, GM access token, and refresh token
  are server-only.
- No OAuth credential enters `shared/`, a state frame, snapshot, client log, or
  checked-in configuration.
- Spotify scopes use least privilege.
- OAuth callback validates state and exact redirect URI.
- Guest search is rate-limited and returns only bounded public metadata.
- Stored provider metadata is removable from a profile.
- Honor notes are visible only on explicitly approved surfaces.
- TV never receives or renders travel details, private ratings, claims, tokens,
  or snapshot data.
- Existing public avatar behavior remains the boundary for photos.
- New external calls use timeouts, no credential-bearing logs, and sanitized
  error responses.
- Production secrets or external apps are not created during local foundation
  work.

## 16. Realtime and synchronization

- The Durable Object remains the single coordination atom.
- Show actions follow the existing persist-first, broadcast-second path.
- The full scene record travels in the normal state frame.
- No client is the scene clock authority.
- A future countdown stores a start timestamp and duration; clients derive the
  display just as the poker clock does.
- The current scene step is durable. CSS animation progress is not.
- Ambient TV scene index may remain local because it has no operational
  meaning.
- Directed scene selection and step may not remain client-local.
- Show history is bounded to protect full-state frame size.
- Provider playback state is status, not tournament truth.
- Mobile prompts use scene or honor IDs for idempotent dismissal and submission.

## 17. Accessibility

- All interactive controls remain keyboard reachable.
- Focus is visible on the new action primitives.
- icon-only controls have accessible names
- sheets preserve dialog semantics and gain focus management in the
  interaction-system slice
- status changes use restrained `aria-live` announcements
- color is not the only indicator for destructive, selected, or error states
- TV type remains legible at distance and does not rely on ticker motion alone
- reduced-motion preference removes auto-animated ceremony transitions
- audio cues always have a visual equivalent
- haptics are optional and never the only signal
- honor themes use plain text labels, not icons alone

## 18. Data-model implications

Planned additive state:

```js
{
  v: 8,
  showControl: {
    active: null,
    history: []
  },
  honorMoments: {},
  honors: []
}
```

The first slice adds only `showControl`. Honors fields are added in the honors
slice, not preemptively.

Planned profile extension:

```js
profiles[player].walkoutTrack = { ...validatedProviderMetadata }
```

Compatibility:

- all new top-level fields are backfilled during hydration
- absent profile music metadata means no selection
- scene records store references, not copied results or standings
- older snapshots remain accepted and hydrate forward
- new snapshots identify the new state schema
- code rollback must ignore unknown additive keys
- no player ID or Durable Object migration is required

## 19. Operational requirements

- every M2 system has an explicit runtime capability
- local enables only the slice currently under development
- staging enablement follows code review and local rehearsal
- production stays disabled until a staging show rehearsal and product approval
- audio remains a separate capability from Show Control
- honors remain a separate capability from both
- active scene and provider status are visible to the GM
- scene recovery is possible from a second unlocked device
- staging deployment and staging-only secret setup require explicit approval;
  production data and configuration remain out of scope
- the exact staging-accepted commit is the production candidate
- feature disable is the first rollback; code rollback remains available

## 20. QA and rehearsal strategy

### 20.1 Pure tests

- scene definition and request validation
- required event/result context
- scene step progression
- terminal outcomes and bounded history
- retry with a new scene ID
- view resolution from current official state
- legacy state hydration
- profile track metadata validation
- honor eligibility, no self-honor, and duplicate handling
- breadth-based aggregation

### 20.2 Action tests

- GM and capability gates
- only one active scene
- advance, complete, skip, cancel, and retry
- scene actions during poker without tournament mutation
- game-progress reset clears transient show state
- no audio provider is consulted by scene actions
- duplicate command delivery is safe

### 20.3 Integration tests

- two clients receive the same scene and step
- unclaimed TV reconnect reconstructs the scene
- failed persistence does not publish a scene
- disabled capability hides controls and TV override
- provider timeout does not reject scene or lifecycle state
- honor prompt and submission remain idempotent across reconnect

### 20.4 Staging rehearsal

1. Restore the approved production-shaped snapshot through the M1 runbook.
2. Enable only reviewed M2 capabilities.
3. Run opening, event intro, winner, standings, poker, and champion scenes.
4. Refresh TV during each scene family.
5. disconnect the audio adapter and repeat
6. skip, cancel, and retry from a second GM device
7. complete the full weekend lifecycle without presentation
8. disable M2 and verify the M1 operating loop remains intact
9. record no personal or provider credential data in the rehearsal report

## 21. Rollout approach

### Phase A: local foundations

- land PRD and implementation plan
- add server-authoritative Show Control state and actions
- add TV directed-scene presentation
- add GM start/advance/skip/cancel/retry controls
- add runtime capability defaulted off outside local
- pass source checks, focused tests, and builds

### Phase B: interaction and broadcast vocabulary

- define semantic action primitives
- migrate representative GM and confirmation flows
- extract player, team, matchup, and result presentation components
- expand scene definitions without coupling audio

### Phase C: honors

- add honor moment and record model
- add compact mobile prompt
- add derived private GM summary and ceremony inputs

### Phase D: audio feasibility prototype

- obtain Spotify policy clarification
- if approved, add server-side interfaces and local mock
- add catalog adapter before playback adapter
- rehearse one GM OAuth session and device recovery only in approved staging
- retain manual deep-link fallback

### Phase E: production candidate

- complete staging rehearsal
- confirm final scene list, honor labels, and policy path
- enable only accepted capabilities
- deploy the exact accepted commit through the manual production workflow

## 22. Risks and mitigations

| Risk | Mitigation |
|---|---|
| presentation becomes second game state | store references and derive content from official facts |
| GM workload increases | one show surface, contextual presets, routine moments stay ambient |
| TV gets stuck | persistent step plus skip/cancel and safe unknown-scene fallback |
| scene history bloats broadcasts | bounded records with no copied media/provider responses |
| Spotify policy blocks the flagship | written clarification gate; manual playback and provider-neutral design |
| Spotify command order or device state drifts | serialize intent, refresh devices, show status, tolerate silence |
| external credentials leak | Worker secrets, separate token storage, no state-frame credentials |
| honors become popularity contest | positive-only, no raw leaderboard, breadth-based derived outputs |
| honor prompts become homework | GM-opened eligible moments, one tap, skip always available |
| visual inconsistency grows | semantic action inventory and representative migration |
| M2 harms M1 reliability | independent capabilities, additive schema, full M1 regression suite |

## 23. Decisions requiring product input

1. **Production Spotify policy path:** seek written Spotify approval, retain
   explicit manual GM playback only, or choose a non-Spotify audio-cue source.
2. **Opening ceremony:** define whether it is one title scene or a short sequence.
3. **Routine scene threshold:** decide which lifecycle changes should never
   interrupt ambient TV.
4. **Honor labels:** approve the six working themes and whether "Chaos" fits.
5. **Honor eligibility:** every completed event, selected events, or GM-opened
   moments only. GM-opened is recommended.
6. **Honor note visibility:** GM and recipient only, ceremony use after approval,
   or no notes.
7. **Walkout start control:** fixed quick choices, 5-second scrubber, or GM-only.
8. **TV photo use:** confirm that existing public avatars may become full player
   cards.
9. **Audio source when silent:** keep current ambient playback untouched or ask
   the GM to resume a configured playlist.

## 24. Explicitly deferred

- production Spotify credentials or OAuth
- public music request queue
- automatic ambient interruption and restoration
- album-art-led TV scenes
- full ceremony composer
- live award voting
- honor-derived award names and weighting
- automatic rivalry or upset narration
- weekend recap editor
- video upload or editing
- large photo gallery or R2 migration
- push notifications for show prompts
- cross-edition honor or music history

## 25. Acceptance criteria by workstream

### Interaction system

- semantic action roles are documented and implemented
- representative high-value surfaces use them
- disabled, pending, selected, error, and destructive states are consistent
- touch and keyboard behavior pass review
- intentional specialized controls remain specialized

### Show Control

- capability fails closed
- active scene and current step are durable
- only GM actions mutate scene state
- official game state is never copied or changed by presentation-only actions
- start, advance, complete, skip, cancel, and retry work
- TV refresh reconstructs the scene
- unknown or stale context degrades safely
- history is bounded

### Audio Director

- product and policy path is approved before provider integration
- catalog and playback authorization are separated
- guests do not authenticate
- one GM account controls playback
- secrets remain server-side
- nullable/deprecated previews are not required
- no audio failure blocks a scene or tournament action
- manual fallback is always available

### Broadcast Presentation

- directed scenes override ambient TV without deleting ambient state
- player, team, event, result, standings, poker, award, and champion data come
  from official structures
- private information never renders
- reduced motion and silent mode remain complete
- TV returns to useful status after every terminal scene outcome

### Postgame Honors

- only eligible positive themes are accepted
- self-honors and duplicate submissions are rejected
- submission is one short flow
- honors never affect points
- raw popularity counts are not public
- corrections and ineligible source moments are handled deterministically
- aggregation rewards breadth

### Reliability and launch

- current M0 and M1 state remains readable
- all M1 focused and weekend-rehearsal tests pass
- local and staging builds contain no credentials
- unfinished M2 controls stay hidden outside enabled environments
- staging recovery rehearsal is documented
- production enablement and deployment remain explicit approval points
