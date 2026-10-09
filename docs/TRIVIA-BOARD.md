# Trivia board (Oct 8, 2026)

Trivia as the room's game show: a Jeopardy-shaped board on the TV, every
phone a buzzer. A second Trivia format beside the current one ("rounds",
everyone answers every question). The commissioner picks the format on the
Trivia desk; the same set list feeds both, each round becoming one column.

Why: the rounds format keeps every head down in a phone. The board puts the
content on the TV (the board, the clue, who buzzed, the struck answers, the
Final's reveal) and turns each phone into a controller: buzzer, picker,
answer pad, wager wheel. Everyone already knows how Jeopardy works, so it
needs no rules text.

The pure model is `shared/triviaBoard.js` (read its header first: the flow,
the state shape, every constant). `shared/trivia.js` hands a board game to
it in `triviaAutoBeat`, `triviaBeat` and `projectTrivia`, and `triviaLive`
answers "a Trivia game of either format holds the room". This document is
the contract between the server work and the UI work.

## Format and configuration

- `state.triviaFormat`: `"rounds"` (default, also when missing) or
  `"board"`. Configuration: kept by a progress reset
  (`RESET_PROGRESS_PRESERVED_KEYS`), public, set by the GM action
  `triviaSetFormat { format }` (refused while a game runs: "Restart the game
  before changing the format"). `triviaFormatOf(state)` reads it.
- The custom Final: at most one set-list entry
  `{ id, source:"final", category, questions:[question] }` in
  `state.triviaRounds` (one choice or picture question, cleaned with
  `cleanTriviaQuestion`; `category` up to 32 characters, default "Final").
  It lives in the set list so it is commissioner-only like every other
  answer. GM action `triviaSaveFinal { final }` (`final` null removes it).
  The rounds format ignores this entry (`roundQuestions` returns nothing for
  it and the rounds game skips it). Without a custom Final the board deals a
  bank Final (below).

## Bank changes (worker/triviaBank.js, Worker only)

- Give every choice and tune question a `level` 1 (easiest) to 5 (hardest):
  the board deals each column easiest first (`dealBoard`). Spread each
  category so its first five picks span the levels.
- A Final pool: about ten hard, unambiguous multiple-choice questions, each
  with its own category label (`{ id, format:"choice", category, text,
  options, answer:0 }`), not listed as a round category on the desk.

## Server: actions (worker/triviaBoard.js, registered with the trivia actions)

All follow the existing trivia conventions: `gmOnly`, `autoStale` for
autopilot writes (an auto beat that is no longer the game's next beat, or
not yet due, is `ok({ unchanged:true, stale:true })`), retries acknowledged
once (device + action id), errors that say what to do.

- `triviaStart { evId }` (existing): when `triviaFormatOf(state)` is board,
  build the board: `roundQuestions` for each set-list round except the
  final entry, `dealBoard(rounds, { gameId })`, the Final (the custom one,
  else a random bank Final), `control` a random present player, phase
  `pick`, `pickAt` now. Refuse with "Add rounds in the Trivia desk first"
  when the board has no cells. `questions:[]` always.
- `boardPick { clueId, auto? }`: the player with control, or the GM / auto.
  Phase pick, the clue unplayed. A Daily Double goes to `dd-wager`
  (log `{ by, auto, pickedAt, buzzes:{}, attempts:[] }`); any other clue to
  `clue` with `clueClock(clue, now)` in its log. `current` = the clue,
  `played` gains it. The auto pick must match `autoPickClue`.
- `boardBuzz { clueId, ms }`: any present player (a present roster player
  not in `players` joins on their first buzz, like triviaPick). Phase clue,
  the current clue, `now >= armAt - BUZZ_EARLY_MS`, `now <= buzzCloseAt(log)`
  (computed before adding this buzz), once per player per clue (a second
  buzz is an acknowledged no-op). Stores `{ ms:clampBuzzMs(ms), at:now }`.
  Errors: "Buzzers are not open yet", "Buzzers closed".
- `boardCloseBuzz { clueId }`: GM / auto, phase clue, after `armAt`.
  `closedAt` now, `order = buzzOrder(log)`. Nobody: phase reveal with
  `revealedAt` now and `winner:null`. Otherwise phase answer, `turn:0`,
  `turnAt = now + BUZZ_SHOW_MS`, `attempts:[]`.
- `boardAnswer { clueId, choice }`: only `turnPlayer(log)` in phase answer,
  or the picker in dd-clue. `now >= turnAt - 300` and `now <= turnUntil +
  ANSWER_GRACE_MS`. A struck option is refused ("That one is out"). The tap
  is final. Right: attempt recorded, `winner`, `control` to them,
  `revealedAt` now, phase reveal. Wrong: recorded; if
  `turn + 1 < attemptsAllowed(game)` the next turn starts at
  `now + ANSWER_GAP_MS`, else phase reveal with `winner:null` (control
  stays).
- `boardTimeout { clueId, turn }`: GM / auto. The current turn ran out:
  an attempt `{ player, choice:null, at, right:false, timeout:true }`, then
  exactly as a wrong answer. A different `turn` than the current one is a
  stale no-op.
- `boardNext { clueId }`: GM / auto, phase reveal. Cells left: phase pick,
  `current:null`, `pickAt` now. None left: with a Final, phase final-wager
  (`finalAt.introAt` now, `wagerUntil = now + FINAL_INTRO_MS +
  FINAL_WAGER_MS`); without one, phase final-board (`boardAt` now).
- `boardWager { wager }`: dd-wager: only the picker, before `boardDdClue`,
  once, `validWager(wager, DD_MIN, ddMax(score, boardTopValue(game)))`,
  stores `wager`, `wagerAt`. final-wager: each player in
  `finalEligible`, once, `validWager(wager, 0, finalMax(preFinal))`,
  stores `finalWagers[player] = { wager, at }`.
- `boardDdClue { clueId }`: GM / auto, phase dd-wager. No wager yet:
  `ddDefault(score, top)`. `shownAt` now, `order:[picker]`, `turn:0`,
  `turnAt = now + readMs(clue)`, phase dd-clue.
- `boardFinalClue {}`: GM / auto, phase final-wager. `clueAt` now,
  `answerUntil = now + FINAL_ANSWER_MS`, phase final-clue (missing wagers
  are 0).
- `boardFinalPick { choice, lock? }`: any present player, phase final-clue,
  until `answerUntil + FINAL_GRACE_MS`; set and change until locked; `lock`
  stamps `locked` and `lockedAt` and stays.
- `boardFinalReveal {}`: GM / auto, phase final-clue: `revealAt` now, phase
  final-reveal.
- `boardFinalBoard {}`: GM / auto, phase final-reveal: `boardAt` now, phase
  final-board.
- `triviaFinish { evId }` (existing): a board game posts from phase
  final-board with `boardResultSlots(boardStandings(game))` through
  beginResultEntry + saveResult, then `finishedAt`.
- `triviaRestart` (existing): clears a board game too.
- `boardSim {}` (QA capability + GM, like `triviaSimAnswers`): makes the
  moves the room is waiting on for every simulated player, never the
  actor's own: pick for control (if not the actor), buzzes from about half
  the active players with reactions 180 to 900 ms (only once armed), the
  current turn's answer (about 55% right) when it is not the actor's turn,
  the Daily Double's wager and answer, Final wagers and picks for everyone
  but the actor. Through the real reducers. The QA console shows "Sim board"
  while a board game runs.

Also on the server: `worker/tournament.js` trivia photo and clip endpoints
treat a board clue as shown once it is picked (and the Final once its clue
phase starts); `worker/actions.js` places that read `state.trivia` (the
"is playing Trivia" check, lockAndStart's auto start) handle a board game;
`worker/qa.js` plays a board game to its result for jumps and Finish event
(with no actor, the sim plays everyone) and offers `boardSim`;
`src/features/director/directorPill.js` maps `board-step` beats to
`{ write:beat.write, payload:beat.payload }`; `runOfShow.js` lists a board
game's beats plainly (Start trivia, the board, the Final, Post result).

## UI

The TV (`src/features/tv/TVTrivia.jsx` hands a board game to a new
`TVBoard.jsx`; TVMode's Trivia checks move to `triviaLive`):
- pick: the board fills the canvas: the column names across the top, the
  values as lit amber numerals in glass cells, played cells dark; the
  picker's photo chip lit with a short "picks" lamp; a score rail of every
  player's photo chip and score along the foot (in place of the ticker).
- clue: the picked cell flies up to fill the screen (BOARD_ZOOM_MS), the
  clue reads in large type (picture: the photo; tune: an animated speaker
  while `tuneClip` plays from `armAt` for BOARD_CLIP_MS on the server clock,
  stopping when the buzzers close), category and value above. At `armAt`
  the frame lamps chase (the buzzers are live); each buzz lights that
  player's chip. At close: the buzz order lands, fastest first, each with
  its reaction in seconds ("0.214").
- answer: the answerer's photo chip large with their name, the four
  options, a draining clock; a wrong answer strikes its option and the next
  in order steps up; a right one stamps green and the value flies to their
  chip on the rail.
- dd-wager / dd-clue: a full takeover "Daily Double" sting (silly is
  welcome in the drawing and the sound, never in copy), then the picker's
  wager on reels, then the clue for the picker alone.
- final: the category stands; chips light as wagers lock (amounts
  hidden); the clue with a long drain and an original synthesized thinking
  loop; then the reveal from the lowest score up on `finalRevealSchedule`
  (each player: their pick, struck or stamped, their wager, the total
  rolling); then the final podium (the result scene takes over once it
  posts).

The phone (`TriviaPlay.jsx` hands a board game to a new board view; the
clue text stays on the TV so heads come up):
- pick, with control: the board as a grid of tappable cells (values only,
  column names above); without: the mini board read-only and the picker.
- clue: category and value, one giant buzzer. Before `armAt` it is unlit
  and a tap locks it for BUZZ_LOCKOUT_MS with a shake. At `armAt` (from the
  server clock, `serverNow()`), it lights; the reaction is timed from the
  frame that painted it (requestAnimationFrame after the lamp, as
  QuickDraw.jsx times its flash) and sent as `boardBuzz { clueId, ms }`
  immediately, with `tapTick()` in the tap. After close: your place in the
  buzz order and your time.
- answer: your turn: the four options (struck ones dead) and a draining
  clock; one tap answers. Not your turn: who is answering and the options
  as they strike.
- reveal: the right answer, and your points change counting.
- dd: the picker gets a wager wheel (`Wheel.jsx`, 100s, DD_MIN to ddMax)
  and Lock in; then the options. Others watch.
- final: eligible players wager on the wheel (0 to finalMax) and lock in;
  then everyone answers the Final (the text is on the phone too, as Final
  Jeopardy's is on the screen in front of each player), change until Lock
  in; then the reveal follows the TV.
- The Trivia desk: a Rounds | Board switch at the top; in Board, the set
  list drawn as the board it will deal (columns, cells, values; rounds past
  six and questions a buzzer cannot answer dimmed) and the Final card (the
  bank's, or write your own).
- Sounds (synthesized, soundKit.js recipes through roomSound.js on the TV
  and the owner's bus on the phone): the buzz-in lamp, a buzz landing, the
  buzz order stamping, right and wrong, the Daily Double sting, a thinking
  loop, each Final turn.

## Rollback safety

A board game keeps `questions:[]`, so the code before this ignores it on
every screen; the custom Final sits in `triviaRounds` and would play as a
one-question round there. Rolling back mid-game: Reset game progress (or
start Trivia again) clears it.

## Changes during build (server, Oct 8)

Every exported name in `shared/triviaBoard.js` keeps its meaning; two
behaviors changed there, the rest are decisions where this contract was
silent.

`shared/triviaBoard.js`:
- `boardBeat`'s Pick now carries `{ clueId, auto:true }`, the autopilot's
  own payload, so the pill's `sameWrite` draws the autopilot's wait on it
  and a tap makes exactly that write (a stale one is refused "That clue
  isn't next").
- `boardStandings` `played` now means the player did something
  themselves: buzzed, answered (a turn that ran out is not an answer),
  picked a cell by their own tap, locked a Daily Double wager, or answered
  the shown Final. Before, a Daily Double the autopilot picked for an idle
  picker (default wager, the turn ran out) counted as playing, so a room
  where nobody touched anything posted that picker as the sole winner on a
  negative score. Now that game reaches the final scores and Post result is
  refused "Nobody played" (the rounds format's "Nobody answered"); the
  autopilot asks once and stops, and the commissioner restarts or enters
  the result by hand.

The writes (`worker/triviaBoard.js`, registered through `worker/trivia.js`):
- Control passes when its holder is not here: a pick, and `boardNext` into
  a pick, hand the board to the best score still here (the order players
  joined breaks a tie; `pickerOf`). A Daily Double picked with nobody here
  plays as an ordinary clue (`dd` cleared).
- `log.by` is whoever held the board; `log.auto` is true when the pick was
  not that player's own tap (the autopilot, the pill, or the commissioner
  picking a cell for them).
- `boardNext` also sets `current:null` when the board moves to the Final.
- A held autopilot makes an auto write stale at the reducer too (the alarm
  already never fires while held).
- Retries: picks, answers, wagers and Final answers remember device plus
  action id in `ops` (per clue, `pick`, `final`); a retry is acknowledged
  and never undoes a newer write. A second buzz, a repeated wager or a
  repeated lock is acknowledged by state alone.
- Errors (no em dashes): "The board is closed", "The pick is in", "Not
  your pick", "That clue isn't on the board", "That one is played", "That
  clue isn't next", "Buzzers are not open yet", "Buzzers closed", "Not your
  turn", "Not your turn yet", "Pick an answer", "That one is out", "Time is
  up", "That turn is over", "Not your Daily Double", "Only scores above
  zero wager", "You already wagered", "Wager in 100s, up to 1,200",
  "Wagers are closed", "The Final is not up yet", "The Final is closed",
  "You locked in", "Pick an answer first", "Show the final scores first",
  "Nobody played", and boardSim's "Nothing to play right now" and "No board
  game is running". Player checks follow triviaPick: "Check in first",
  "You are marked away", "Tap I'm here first", "You are not playing".

The set list (`worker/trivia.js`, `shared/trivia.js`):
- `triviaRoundCount` is 0 for the `source:"final"` entry (new
  `triviaFinalEntry(rounds)` finds it), so `triviaQuestionTotal` and
  `triviaConfigured` count rounds only: a set list holding only a Final has
  nothing to start (no Start beat; triviaStart refuses "Add rounds in the
  Trivia desk first"). The desk's round list should leave the entry out
  (TriviaDesk.jsx draws every set-list entry today).
- `triviaSaveFinal` accepts `final.questions:[q]` or `final.question`,
  keeps the entry's id and its question's id when the desk sends none,
  clips the category to 32 characters ("Final" when blank) and refuses
  "The Final is one question", "The Final is multiple choice or a picture",
  any `cleanTriviaQuestion` error, and while a game runs "Restart the game
  before changing the Final". Where the entry sits in the set list means
  nothing.
- `triviaSaveRound` refuses an id that names the Final entry; the 12-round
  cap counts rounds only; `triviaMoveRound` steps over the Final entry.
- `triviaSetFormat` refuses anything else with "Pick Rounds or Board".

Elsewhere:
- `worker/actions.js` needed no change: the "is playing Trivia" record reads
  `players` (a board game has them), and Lock and start's automatic start
  calls triviaStart, which deals the board.
- QA (`worker/qa.js` playBoard): at each step the simulated room makes its
  moves (`boardSim`, with no actor everyone), then the autopilot's next beat
  is taken as a commissioner write when its time comes. The board waits on
  its own clock, so inside it the run's clock steps ahead (`run.wait`) and
  comes back (`run.back`) before triviaFinish: the result and everything
  after keep the run's one-millisecond pace; only the finished game's own
  log times sit ahead. A board with nothing a buzzer can answer falls back
  to the ordinary result entry.
- The bank: 20 new questions so each category's first five (the desk's
  default picks) span levels 1 to 5, those five moved to the front (each
  category's first question unchanged); 12 Finals in `TRIVIA_FINALS`, never
  a desk category. `GET /api/trivia/bank` keeps its shape; each choice and
  tune question in it now carries `level` (the desk may draw it).
- The run of show plans a board game as "Start trivia" (only for an event
  already under way without its game), "The board", "The Final" (its
  category), "Post result".
