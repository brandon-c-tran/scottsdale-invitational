# Field Day Milestone 2 PRD

**Product:** Field Day, Scottsdale 2026  
**Milestone:** M2, Spectacle and Social Layer  
**Status:** Defined; Show Control and Audio Director implemented; Matchup Stakes and Postgame Props implemented locally behind independent flags
**Baseline:** M1 is live at `fielddayseries.com` and holds real guest data  
**Last updated:** July 29, 2026

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

P0 has six workstreams:

1. a coherent interaction hierarchy
2. recoverable Show Control
3. a policy-compliant Audio Director
4. a more intentional TV broadcast surface
5. quick, positive Postgame Honors
6. zero-sum Matchup Stakes and Predictions

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
- contest-bound competitor antes, free crowd predictions, and optional
  player-funded backing

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
11. **Betting only redistributes.** A betting operation transfers chips between
    players or refunds them; it never creates a house liability or chip sink.
12. **The contest comes first.** Stakes attach to a concrete matchup, heat,
    round, or final and never block physical play.

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
11. A player may watch, make a free pick, back that pick, or decline wagering
    without friction.
12. Every activated betting settlement conserves aggregate player chips.

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
- routine fixed-odds or house-backed winner markets
- broad eventual-winner books opened before their concrete field is known
- requiring an ante, prediction, or funded pool before a contest can start

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

### 8.6 P0: Matchup Stakes and Predictions

The shipped M0/M1 book opens one event-level market at a time and supports
outright, bracket-match, and stage picks. Settlement is correctly derived from
official results, retry-safe chip placement is logged in `wagerOps`, and open
exposure is protected before poker. Its payout model is not compatible with
this M2 direction: each losing wager subtracts chips from one player while each
winning wager adds a fixed return without a player-funded counterparty.
Consequently ordinary wagers can change aggregate chip supply.

M2 introduces one shared **contest market** primitive. The first supported
contest reference is a fully seated bracket matchup. Later adapters may point
the same primitive at a named heat, stage final, or bounded free-for-all field.
The official draw, bracket, stage, and result remain the only competition
truth; a market only records participation and locked financial terms.

Each eligible matchup has three deliberately separate layers:

1. **Competitor ante.** Participants may opt into the same per-player stake on
   themselves. It activates only when every participant on both equal-sized
   sides accepts and can cover it. A decline is private participation state,
   is not presented as a callout, and never delays play.
2. **Free prediction.** A non-participant may pick a side without committing
   chips. The pick may change while the contest market is open.
3. **Chip backing.** A non-participant may add chips behind their current pick.
   Backing forms a player-funded pool only when at least two outcomes receive
   chips before lock.

The economy invariant is:

> For every contest market, the sum of all player settlement deltas is exactly
> zero.

Winning backers keep their committed chips and divide the losing pool
proportionally. Distribution uses whole 100-chip units and a deterministic
largest-remainder rule, so no fractional or residual house balance exists.
Losing backing is transferred in full. An activated equal-team ante transfers
each losing participant's stake to the winning side. If the funded pool is
one-sided, the winning outcome has no backer, the ante lacks unanimous consent,
the reference becomes invalid, or the contest is voided, every committed chip
is refunded.

Locking snapshots participation terms but not the winner. Settlement remains a
pure derivation from the current official matchup result. Correcting a winner
therefore reverses the former deltas and applies the corrected deltas exactly
once. Clearing a result returns the market to pending; canceling or invalidating
the contest returns zero deltas. Low participation never blocks the matchup.

Mobile is role-aware:

- a competitor sees the ante choice as their own custom chip and its neutral
  activation status
- a spectator taps one side for a free pick, then optionally taps one of their
  own customized chip denominations to back it
- someone who declines or ignores the module sees no repeated pressure
- the GM never creates a market manually; the official bracket opens the next
  concrete matchup automatically
- the GM sees one primary `Start matchup` action that represents physical play
  beginning and locks picks, while void/refund remains a tucked-away recovery
  control

TV may show the concrete matchup, aggregate crowd split, total activated pot,
and the custom chips physically riding each side without adding names or an
expandable bettor ledger. It never shows who declined an ante or a harsh
prediction leaderboard. Show Control may reference this aggregate context, but
neither TV nor audio participates in settlement.

Cold start is free-pick first. A matchup with zero chips remains a useful crowd
prediction and proceeds normally. Props are deferred until an opposing-outcome,
player-funded version can use this same primitive without crowding the primary
matchup flow.

Legacy wagers are not rewritten. Historical settled wagers already contribute
to real balances, and reinterpretation would mutate production truth. The new
capability therefore ships independently and fails closed. Before enabling it
in a persistent environment, the GM must close or void every legacy pending
wager; once enabled, the client must stop offering new legacy house-backed
wagers. Historical entries remain readable for audit and standings continuity.

### 8.7 P1

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

### 10.6 Raise the stakes on a matchup

1. The official bracket automatically opens picks when its next fully seated,
   undecided matchup becomes concrete.
2. Each competitor may accept the same per-player ante or quietly decline.
3. Spectators tap a side for a free pick and may then place their own custom
   100-, 200-, 500-, or 1,000-chip denominations on it.
4. The GM taps `Start matchup` when physical play begins, which locks terms.
   Posting the winner still locks atomically if the GM skipped that tap.
5. Inactive ante and one-sided backing are refunded without blocking play.
6. The official bracket winner derives one exact zero-sum settlement.
7. If the GM corrects the winner, the former derivation disappears and the
   corrected settlement replaces it.
8. Bracket advancement automatically prepares the next concrete matchup.

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

### 11.7 Contest markets

- only the Durable Object may create, lock, void, or mutate contest-market
  participation
- every command that can change chip exposure requires a request ID and a
  bounded replay ledger
- market references are canonicalized from the current draw and bracket
- participants cannot back a side in their own matchup
- non-participants cannot respond to the competitor ante
- predictions are chip-free and remain distinct from backing records
- backing and accepted antes count toward the existing affordability and
  maximum-at-risk rules
- lock freezes backing and ante participation without writing a winner
- result entry may atomically lock an otherwise-open market
- settlement is derived, idempotent, and conserves chips exactly
- invalid, canceled, one-sided, or unactivated terms return zero deltas
- unresolved funded exposure blocks poker setup; free predictions and refunded
  inactive terms do not
- disabling the capability prevents new participation but does not prevent an
  already-locked market from deriving safely from an official result

## 12. Presentation principles

- One focal point per scene.
- Use the existing chip, player photo, number, event mark, and phase palette.
- Custom chip color, pattern, and denomination are the primary backing control,
  not decoration around a generic action button.
- Chip piles have a fixed footprint with an overflow count so participation
  never stretches a matchup card or bracket cell.
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
  v: 10,
  showControl: {
    active: null,
    history: []
  },
  contestMarkets: {},
  marketOps: {},
  honorMoments: {},
  honors: [],
  honorOps: {}
}
```

The Show Control slice added `showControl`. Matchup Stakes added the two market
maps. The local Postgame Props slice adds `honorMoments`, `honors`, and the
bounded `honorOps` replay ledger. Hydration remains additive from v5-v9.

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
- legacy `wagers` and their historical fixed-payout resolver remain readable
  and are never rewritten into invented pools
- new market deltas remain a separate standings component
- poker receives the conserved player total after funded market exposure
  settles or refunds; its existing minimum-stack grant remains an explicit
  broader-game adjustment, not betting revenue or loss

## 19. Operational requirements

- every M2 system has an explicit runtime capability
- local enables only the slice currently under development
- staging enablement follows code review and local rehearsal
- production stays disabled until a staging show rehearsal and product approval
- audio remains a separate capability from Show Control
- honors remain a separate capability from both
- Matchup Stakes remains an independent capability and is enabled only in local
  and isolated staging during review
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
- proceed with no contest participation
- putting a bracket event on deck creates exactly one next-match market
- starting physical play locks the existing market without a separate open step
- posting a bracket winner prepares the next concrete matchup automatically
- accept, decline, lock, settle, void, and retry matchup participation
- record and change a free prediction without moving chips
- add and retract pooled backing with affordability protection
- assert one-sided pools and inactive antes return every chip
- assert correction reverses and reapplies the derived zero-sum settlement
- assert aggregate balances are unchanged by every betting settlement
- assert unresolved funded exposure, but not free picks, blocks poker setup

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

Implemented behind `M2_HONORS_ENABLED` and enabled in isolated staging for
review:

- honor moment, record, and bounded replay-ledger model
- event and completed-bracket-match eligibility
- compact mobile prompt with skip and in-window edit
- GM open, reopen, close, void, and private breadth summary
- TV open-state treatment without response totals
- deterministic correction invalidation and focused tests

Staging rehearsal, final theme-name approval, and ceremony consumption remain.

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
| historical fixed-payout wagers changed aggregate supply | never reinterpret settled history; retire new legacy placement only at an explicit capability cutover |
| thin or one-sided matchup participation | keep free picks; refund backing at lock; never delay the contest |
| corrected bracket result changes a payout | derive deltas from the current winner rather than recording a payment |
| team or multi-outcome rounding leaks chips | equal-side ante activation and deterministic whole-chip pooled distribution |

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
- unmatched house-backed props
- broad eventual-winner markets
- multi-outcome ante before an actual slate requires it
- public individual wagering history or prediction leaderboard

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

- [x] only eligible positive themes are accepted
- [x] self-honors and duplicate submissions are rejected
- [x] submission is one short, skippable flow
- [x] honors never affect points
- [x] raw popularity counts are absent from guest and TV presentation
- [x] corrections and ineligible source moments are handled deterministically
- [x] private aggregation rewards breadth
- [ ] final theme names and frequency are approved in staging
- [ ] approved ceremony scenes consume derived honor inputs

### Matchup Stakes and Predictions

- [x] the current wallet and payout model is audited and its supply-changing
  behavior is documented
- [x] one contest-market domain model separates ante, free pick, and backing
- [x] settlement math is player-funded, whole-chip, deterministic, and zero-sum
- [x] legacy production-shaped state hydrates without reinterpretation
- [x] role-aware mobile controls replace the legacy book when enabled
- [ ] automatic opening, GM start, void, and recovery controls are rehearsed
  on staging
- [x] TV shows aggregate sentiment and activated stakes without private detail
- [ ] heat, final, and bounded multi-outcome adapters reuse the shared primitive
- [ ] the rollout gate verifies no legacy wager remains pending

### Reliability and launch

- current M0 and M1 state remains readable
- all M1 focused and weekend-rehearsal tests pass
- local and staging builds contain no credentials
- unfinished M2 controls stay hidden outside enabled environments
- staging recovery rehearsal is documented
- production enablement and deployment remain explicit approval points
