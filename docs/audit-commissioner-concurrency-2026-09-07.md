# Commissioner concurrency audit · September 7, 2026

## Result

The current-contest and draft paths handled competing commissioner actions correctly in this audit. Three commissioners, one claimed player, and one unclaimed TV connection converged on the same authoritative state. No lost update or divergent broadcast was observed in the tested races.

The important gaps are stale official-result edits, stale poker table/count commands, inconsistent frozen-board guards, and private ratings included in the public snapshot. These are reproduced behaviors, not hypothetical code concerns. No product fixes were made during this audit.

**27 scenarios ran in memory and against actual WebSockets:** 21 verified expected behaviors and 6 reproduced finding cases, with no audit assertion failures. The 6 cases represent 5 distinct issues because result overwrite and clear share one missing revision check. Separately, both tests in the existing deterministic weekend rehearsal passed.

## Scope and evidence

- Actual Worker/Durable Object runtime: `ws://127.0.0.1:5183/ws`, `APP_ENV=local`, Wrangler 4.112.0. Dedicated persistence: `.commissioner-audit-2026-09-07/state`.
- Three separate authenticated commissioner sockets, each with a different device and player claim; a fourth socket claimed the spectator/player; a fifth TV socket never claimed a player or unlocked commissioner mode.
- Simultaneous races use `Promise.all` to dispatch commands from different WebSocket connections before awaiting acknowledgements. Dependent stale-editor reproductions deliberately wait for the intervening commissioner's commit.
- After each action or race, every connection, including unclaimed TV, was checked for the same version and deeply equal state.
- In-memory checks call the production `applyAction` on a clone and publish the clone only after successful, non-no-op acknowledgements. They model server arrival order; actual simultaneous delivery is evidenced by the separate WebSocket run.
- Normal localhost 5173, the separate UI audit on 5187, staging, and production were not reset or changed by this work. Only the dedicated 5183 runtime was reset between scenarios. All supplied profile/rating values were synthetic audit data.

Reproducible artifacts:

- [Audit runner](../scripts/audit-commissioner-concurrency.mjs)
- [Dedicated local server](../scripts/commissioner-audit-server.mjs)
- [Actual WebSocket acknowledgements and scenario traces](audit-commissioner-concurrency-2026-09-07-ws.json)
- [In-memory acknowledgements and scenario traces](audit-commissioner-concurrency-2026-09-07-memory.json)
- [All-event deterministic rehearsal](../tests/m1-weekend-rehearsal.test.mjs)

Run the dedicated server with `node scripts/commissioner-audit-server.mjs`. Run the audit with `node scripts/audit-commissioner-concurrency.mjs` and then `node scripts/audit-commissioner-concurrency.mjs --ws`. The WebSocket runner has a fixed 5183 loopback endpoint and requires a local environment with reset capability. It intentionally resets that disposable instance between cases. Do not repoint it at any shared environment.

The audit runner asserts the observed behavior of known gaps so the trace is reproducible; its successful exit means the audit ran as specified, **not** that the product has no findings. If a gap is fixed, update its assertion to the desired rejection behavior.

## Verified findings

### P1 · A correction or clear is not bound to the official result the commissioner reviewed

**Cases:** C10, C11. **Verified:** production action logic and actual WebSockets. **Code:** `worker/actions.js:772` (`saveResult`), `worker/actions.js:846` (`clearResult`).

Reproduction:

1. Announce Long Putt, lock/start it, open result entry, and post Sahil as the winner. The official result is revision 1.
2. Commissioner B or C prepares a correction/clear from that result.
3. Commissioner A corrects the winner to Khoa, using the required confirmation and reason. This commits revision 2.
4. For C10, B submits `saveResult` with `slots:[["Chinh"]]`, `confirmOverwrite:true`, and a correction reason from the original review. For C11, C submits `clearResult` with `confirmClear:true` and a reason from the original review.

**Expected:** reject an edit reviewed against revision 1 after revision 2 has committed, while retaining the local draft for review. An identical retry of a committed edit should remain a no-op.

**Actual:** both commands return `ok:true`. C10 replaces Khoa with Chinh and creates revision 3. C11 removes the newer revision 2 result entirely. The history records what was overwritten, but the second commissioner never has to review that intervening result. Derived event awards and wager outcomes can change accordingly.

**Cause:** confirmation and reason express intent to change a result, but the payload has no expected result revision. `saveResult` checks identical slots, then accepts any confirmed non-identical overwrite. `clearResult` accepts any confirmed clear of whichever result is currently present.

**Design implication:** the result editor needs the same target-and-revision contract already used for contests and drafts. Keep the pending edit, show the new official result beside it, and require a fresh review when another commissioner commits. A global single-commissioner lock is unnecessary for the paths that already reject stale references correctly.

### P1 · A stale poker cancellation can delete a replacement table

**Case:** C16. **Verified:** production action logic and actual WebSockets. **Code:** `worker/actions.js:1488` (`pokerSetup`), `worker/actions.js:1620` (`pokerCancel`).

Reproduction:

1. Set up and start poker table A. Commissioner A opens a cancellation flow for that table.
2. Another commissioner cancels table A.
3. Set up and start replacement table B. Enter Sahil's count as 2,200.
4. Submit A's old `pokerCancel` command, whose payload is `{}`.

**Expected:** reject a cancellation targeting retired table A; table B and its counts remain intact.

**Actual:** the command returns `ok:true`, sets `state.poker` to `null`, and loses table B's entered count. Cancellation reverses the current table's minimum-stack grants as well. The event id is always `poker`; the cancellation has no distinct table reference to check.

**Design implication:** each setup needs a stable table/session identity. Start, cancel, bust, count, and post should reference the session on the screen. Confirmation must name the table being affected, and a retired session's delayed command must not target its replacement. Same-session retries should converge without a new destructive action.

### P2 · A stale chip-count editor silently replaces another commissioner's count

**Case:** C15. **Verified:** production action logic and actual WebSockets. **Code:** `worker/actions.js:1573` (`pokerCount`).

Reproduction:

1. With poker running, save Sahil's count as 1,200.
2. Commissioner C opens that player's count editor.
3. Commissioner B saves a corrected count of 2,200.
4. C submits the still-open editor as 1,300.

**Expected:** tell C that the saved count changed and require review of 2,200 before replacing it. Counts for different players should continue saving independently.

**Actual:** all saves return `ok:true`; the final count is 1,300. `pokerCount` only recognizes an identical value as a no-op. It has no expected count/revision check. C14 separately confirmed that three commissioners counting three different players concurrently preserved all three submissions.

**Design implication:** use a per-player count revision within the poker session. Preserve local edits when a new broadcast arrives, and make the current saved count and proposed replacement visible together. The existing one-device pending guard does not address another commissioner's write.

### P2 · A frozen board can still be changed by late result edits

**Case:** C12. **Verified:** production action logic and actual WebSockets. **Code:** the same `saveResult` and `clearResult` handlers above.

Reproduction:

1. Post Long Putt's result and call `setFrozen({f:true})`.
2. A second commissioner submits a confirmed correction with a reason.
3. A third submits a confirmed clear with a reason.

**Expected:** if “frozen” protects confirmed standings, these writes require explicitly reopening the board. At minimum, the freeze policy must be consistent and visible to a commissioner with an old editor open.

**Actual:** both writes succeed while `state.frozen` remains true. The correction changed the leader to Khoa, and the clear removed the result. Current-contest correction and drafting already reject frozen-state changes, so the policies differ by entry point.

**Design implication:** decide and enforce one frozen-board correction policy. This audit proves server acceptance, not that every current navigation route offers a correction button while frozen. A previously open editor or direct stale command is enough to reach the handlers.

### P1 · An unclaimed TV connection receives private ratings in the full snapshot

**Case:** C27. **Verified:** actual unclaimed WebSocket received the data after a player's save. Cross-confirms the separate TV audit; do not count it twice in the combined report. **Code:** `worker/tournament.js:605` (`hello`), `worker/tournament.js:707` (`broadcastState`).

Reproduction:

1. Connect the TV socket and send only `hello`, with a fresh device id. Do not claim a player or unlock commissioner mode.
2. The claimed audit guest saves `ratings:{pool:3,golf:2}`.
3. Inspect the TV socket's next state frame.

**Expected:** publicly readable state contains what the TV needs to display, while private ratings stay server-side or are exposed only to an authorized audience.

**Actual:** `state.seeds[player]` contains both exact ratings. A synthetic flight response saved afterward also arrived in `state.profiles[player]`, including its flight number and booked status. Whether flight responses should be group-visible is a product policy decision; the established “private ratings” promise is enough to make the ratings exposure a confirmed issue.

**Design implication:** separate persisted authority state from the guest/TV snapshot. Keep complete data inside the authority, and project public display data by audience. Hiding fields in React components does not prevent disclosure over the connection.

## What held up under competing actions

| Cases | Scenario | Observed result |
| --- | --- | --- |
| C01–C02 | Three same-event or different-event announcements | One current market; competing stale/different targets rejected. |
| C03 | Three lock/start requests from the same snapshot | One write; two acknowledged no-ops. |
| C04 | Wager racing lock/start | Ticket accepted only if it arrived before the lock; late ticket rejected. |
| C05 | Conflicting winners for the same current matchup | One result and one advance; other commands rejected; original action retry did not advance twice. |
| C06 | Competing previous-contest undo | Exactly one restoration; restored contest remained locked/in progress. |
| C07 | Three draft picks, then three undos | One pick and one undo; stale pre-undo reference remained invalid even when pick index returned to zero. |
| C08 | Three finalizations of one completed draft | One saved draw and one broadcast version; player lists and team identity preserved. |
| C09 | Conflicting first official results | One revision-1 result; competing posts required explicit correction. |
| C13 | Three poker setup/start commands | One table setup and one clock start. |
| C14 | Three different players' chip counts | All three saved values retained. |
| C17 | Three final poker posts | One official result revision; later player count rejected. |
| C18 | Duel play racing decline, then commissioner void | Only play or decline succeeded; later play after void rejected. |
| C19 | Two duel antes plus a wager competing for one player's cap | Only one 300-chip commitment accepted under the 500-chip cap. |
| C20, C25 | Guest/unclaimed TV invokes commissioner actions | 28 distinct commissioner actions rejected for each role; the smaller initial matrix also passed. |
| C26 | Unclaimed TV writes another player's profile, ratings, duel | All four rejected; player data unchanged. |

## End-to-end game-family coverage

The network cases below use the same three commissioners and player/TV connections as the races. Every step was acknowledged and every role converged on the same state. They exercise complete representative families, **not** a browser click-through of every named game.

| Case/evidence | Complete flow covered |
| --- | --- |
| C21, real WebSockets | 3v3 Basketball: four-team bracket, all three current matchups, manual 100-chip ticket before each lock, each winner, each even-money settlement, full-team official result. |
| C22, real WebSockets | Ping Pong: three heats with two qualifiers each, independent heat winner, six-person final, four settled winner tickets, official result. |
| C23, real WebSockets | Spikeball: two team pools and the final, three settled winner tickets, complete two-player winning team. |
| C24, real WebSockets | Long Putt FFA and unrestricted self-bet at 2:1; both Quick Draw runs and derived duel settlement; six-person Volleyball team winner and team outright ticket; poker setup from earned standings; player self-count, commissioner busts, final post, champion freeze. |
| Existing deterministic rehearsal, 2/2 tests passed | Every configured built-in event through official results, including six-team and four-team brackets, solo heats, team pools, direct team events, solo FFA, poker setup/post/reversal; exact poker distributions for 12/13/14 seats. |

C24 specifically verified that the audit player earned a 1,900-chip starting stack through prior game and duel outcomes and sat at poker with exactly 1,900. After the final counts, all roles saw the same champion and stack, and cancellation after the posted poker result was rejected.

The all-event rehearsal intentionally uses deterministic outcomes and sometimes custom heat configuration. It is authoritative-domain coverage, not proof of every built-in presentation or every phone interaction. The root audit owns actual browser checks for commissioner navigation, captain picking, player betting, late join, TV scenes, and poker entry.

## Product conclusions and limits

The existing current-contest/draft model is a sound basis for three commissioners operating together. Keep the current target, committed outcome, and next action visible in a shared event workspace. Extend the same identity/revision/acknowledgement rules to result corrections and poker. Do not solve cross-device stale edits by adding more per-button spinners or requiring everyone to nominate a single permanent operator.

The tested WebSocket races did not demonstrate a transport serialization or lost-broadcast bug. The audit does not prove behavior under every possible scheduling interleaving, storage failure, packet-loss pattern, or reconnect. No production load test, real-account privacy probe, or real tournament reset was performed. The public-data finding uses synthetic values and an actual unauthenticated local socket. UI reachability explanations above are code-informed design implications unless explicitly marked as browser-observed by another audit.

No production source was changed. Added files are the audit scripts, this report, and its machine-readable evidence. The dedicated local runtime is disposable and can be stopped after review; its storage is separate from all existing app data.
