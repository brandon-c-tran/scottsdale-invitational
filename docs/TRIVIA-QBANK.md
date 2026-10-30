# Trivia question bank: Brandon's board (Oct 29, 2026)

Brandon's brief (Oct 29): a Jeopardy board for ~13 players, seven
categories, five clues each at $100 to $500 (35 clues), picked by him from a
much larger bank (aim 250 to 350 candidates) with real prepared media, a
host-only review and selection desk, and a recommended board already
picked. This file is the contract between the builders. It extends
`docs/TRIVIA-BOARD.md` (the board game as built: buzz, one answerer, four
options, the rebound, Daily Double, Final); read that first. Established
gameplay and scoring stay as they are unless this file says otherwise.

## The seven categories (ids are stable)

| id | Board name | Clue forms |
|---|---|---|
| `nba` | Who He Play For? | image (neutral headshot) + name; reveal the team |
| `kim` | Kim & Winnie | text (some with a photo later, never invented) |
| `lore` | Brandon Lore | text |
| `aux` | Pass the Aux | audio (an excerpt of the original recording) |
| `web` | Internet Archaeology | image (screenshot crop, full reveal), audio, video, text finish-the-phrase |
| `sound` | You Know This Sound | audio |
| `sil` | Silhouette Showdown | image (silhouette) with the original as the reveal |

## Board changes (the engine builder)

- Seven columns: `BOARD_COLUMNS_MAX` 7, the TV and phone board laid out for 7.
- Values: a board game carries its own `values`; Brandon's board plays
  **100, 200, 300, 400, 500** (`QBANK_VALUES`). Scoring is unchanged: right
  +value, wrong or out of time -value. The Daily Double and the Final stay as
  built; their limits read the game's top value (500), so the Final's wager
  cap is max(score, 500) and the Daily Double's floor stays DD_MIN.
- Clue flow is unchanged: the clue (and its media) shows on the TV, the
  buzzers arm, the fastest answers on four options on their phone. A media
  clue is "media first": `armAt` waits for the media to be ready on the TV
  (the TV reports ready, or a cap of 2.5 s), audio/video play on the TV only
  (phones stay silent; the existing tune path already does this), and the
  rebound replays the clip from its start as the tune does.
- New clue formats beside `choice`, `picture`, `tune`: one general **media**
  shape on any choice clue: `media:{ kind:"image"|"audio"|"video", src,
  w?, h?, start?, duration?, poster? }` and `revealMedia:{ kind:"image",
  src, w?, h? }` (silhouette -> original, crop -> full screenshot, headshot ->
  team-branded reveal). `start`/`duration` in seconds into the file; the TV
  plays exactly that window, the host preview the same window.
- The host (commissioner) may replay or pause a clue's audio/video from the
  pill tray during `clue` and `answer` (a GM write `boardMediaCue { clueId,
  action:"replay"|"pause" }` stamped on the server clock; the TV follows).
  Leaving a clue (reveal, next pick) stops its media.
- A player's payload never carries `answer`, `revealMedia`, sources or tags
  before the reveal (extend `projectTrivia`); `media.src` only once the clue
  is picked (as a photo is served today). Option order is the clue's stored
  order (shuffled once when the board is dealt, stable option ids), the same
  on the TV and every phone.

## The bank (server only)

Files: `worker/triviaQBank/<category>.json`, one array of records each,
plus `worker/triviaQBank/recommended.json` (the 7 x 5 recommended board).
`aux` is a reserved file name on Windows (git cannot add `aux.json`), so
Pass the Aux's file is `worker/triviaQBank/aux-bank.json`.
Never imported under `src/` or `shared/` (the existing bank's rule and its
test extend to this folder). Served to the commissioner only over
`GET /api/trivia/qbank` (GM token), records plus each one's merged edits and
marks.

A record:

```
{
  id: "nba-brooks-dillon",            stable, lowercase, [a-z0-9-], <= 48
  category: "nba",                    one of the seven ids
  tier: 1..5,                         suggested value = tier x 100
  format: "choice" | "image" | "audio" | "video",
  prompt: "Who does he play for?",    <= 140 characters, says the answer type
  subject?: "Dillon Brooks",          the shown name / subject, if any
  options: [ { id:"a", text }, { id:"b", text }, { id:"c", text }, { id:"d", text } ],
  answer: "a",                        the option id
  reveal: "Phoenix Suns. Traded from Houston in ...",   the explanation
  media?: { kind, src:"/tq/<hash>.<ext>", w, h, start, duration, mime },
  revealMedia?: { kind:"image", src, w, h },
  variantOf?: "aux-bubblin",          a clip variant of another record (not a distinct question)
  sources: [ { url, note, checkedAt:"2026-10-29" } ],
  verified: { by:"web"|"provided"|"suggested", at:"2026-10-29", cutoff?:"2026-10-29" },
  status: "ready" | "confirm" | "asset" | "rejected",
  personal?: "provided" | "needs-brandon",   personal categories only
  surprise?: true,                    a possible wedding surprise: Brandon reviews
  tags: { topics:["league","nostalgia"], likely:["Evan","Eyob"], possible:["Sahil"],
          reach:"broad"|"shared"|"deep" },
  notes?: "host notes"
}
```

Rules every record meets (`npm test` checks them all):
- Exactly four options, distinct (case-insensitive), each <= 50 characters,
  one `answer` among them; no "all/none of the above"; the four the same
  kind of answer. The correct option is not consistently the longest.
- `ready` means: the answer is verified (a dated source, or "provided" by
  Brandon), and every `media`/`revealMedia` file exists in `public/tq/`.
  Anything unverified is `confirm`; a missing or unusable asset is `asset`.
  Never mark a placeholder `ready`.
- Personal records use only the facts Brandon provided (his brief of Oct 29,
  kept in `worker/triviaQBank/facts.json` with provenance). Ideas whose
  answer he has not given (how he and Kim met, the first date, proposal
  details that were only plans, the Dallas-to-Bay-Area sister) are records
  with `personal:"needs-brandon"`, `status:"confirm"`, and their prompt
  written; they never count as playable.
- Media filenames are neutral: `/tq/<12 hex of sha1(source + salt)>.<ext>`,
  never the answer. Reveal assets likewise.
- Audio: authentic recordings only, trimmed to the clue (6 to 10 s for a
  song, the whole sound for an effect), loudness-normalized (about -16
  LUFS, peaks under -1 dBTP), mp3 128 to 192 kbps. Images: webp, a 1600 px
  long edge at most. No AI-generated stand-ins for real screenshots or
  characters.

Sources and preparation are reproducible: each content builder keeps
`scripts/tq/<category>.mjs` (or .py) and `scripts/tq/<category>.sources.json`
(source URL, retrieval date, crop/trim, transforms) so `node scripts/tq/<category>.mjs`
rebuilds its assets from the raw downloads kept outside the repo in
`C:/dev/scottsdale/tq-raw/<category>/`.

## Selection and edits (state, configuration)

- `state.triviaPlan = { columns:[ { category, name, slots:[ qid|null x5 ] } x7 ],
  updatedAt }`: the board Brandon picked. Configuration (kept by a progress
  reset), GM-only (never projected to anyone else). Starts as the
  recommended board.
- `state.triviaBankEdits = { [qid]: patch }` (prompt, options, answer,
  reveal, tier, media window, notes, status) and `state.triviaBankMarks =
  { [qid]: "fav"|"short"|"reject" }`: configuration, GM-only.
- GM writes: `qbankAssign { col, slot, qid|null }`, `qbankEdit { qid, patch }`
  (cleaned like a bank record), `qbankMark { qid, mark|null }`,
  `qbankPlanReset {}` (back to the recommended board), `qbankImport { plan,
  edits, marks }` (validated whole). Export is a download of the same JSON.
- Starting Trivia in board format with a full plan (`triviaPlan` all 35 set,
  every one `ready` or forced) deals that plan exactly: column order, the
  slot's value, the record merged with its edits, options shuffled once with
  a seeded order. The existing set-list path stays for any other game.

## The desk (host only)

Commissioner > Games > Trivia > **Question bank**: the 7 x 5 board on top
(each slot its record's short label, status lamp, a warning dot), the bank
below it filtered by category, tier, status, mark and search (subject,
game, artist, player, guest group), each record a card with its media
preview (image, playable audio/video at its exact window), the four options
with the answer marked, the reveal, the sources and verification, and
Edit / Favorite / Shortlist / Reject / **Put in slot**. Comparing a slot's
alternatives is one tap (the bank filtered to that category and tier).
Warnings on the board: empty slot, not ready, the same answer or subject
twice, the same media file twice, duplicate options, too many clues aimed at
one small group (the same `likely` set on 4+ slots), an asset flagged as
revealing its answer. Sources and technical metadata stay in this desk only.

## Builders (Oct 29 night)

| Builder | Branch (worktree) | Owns |
|---|---|---|
| Engine | `tq/engine` (`fd-tq-engine`) | `shared/triviaBoard.js`, `worker/triviaBoard.js`, `shared/trivia.js` projections, `worker/trivia.js` routes for media, the qbank state writes and `GET /api/trivia/qbank`, TV/phone board rendering (`src/features/tv/TVBoard.jsx`, `src/features/trivia/BoardPlay.jsx`, `boardModel.js`), tests for them |
| Desk | `tq/desk` (`fd-tq-desk`) | the Question bank desk under `src/features/trivia/` (new files), its menu entry, `dev/` preview, fit views, its tests |
| Content A | `tq/a` (`fd-tq-a`) | `nba`, `kim`, `lore` records, `facts.json`, NBA headshots |
| Content B | `tq/b` (`fd-tq-b`) | `aux`, `sound` records and audio |
| Content C | `tq/c` (`fd-tq-c`) | `web`, `sil` records, screenshots, silhouettes, clips |

Content builders write only their own `worker/triviaQBank/<category>.json`,
`public/tq/` files they made, and `scripts/tq/<category>.*`. The integrator
writes `recommended.json` from their picks and the validator test
`tests/trivia-qbank.test.mjs` is the engine builder's.

## Engine as built (Oct 29, `tq/engine`)

Where the contract was silent, these are the calls; every name below is code.

- **Record rules** (`shared/triviaQBank.js cleanQBankRecord`, run on every
  file by `tests/trivia-qbank.test.mjs`): `format` and `media.kind` agree
  (`choice` has no media; a photo makes it `image`); `media.src` is
  `/tq/<12 hex>.<ext>` with ext webp|jpg|png (image), mp3|m4a (audio),
  mp4|webm (video); image and video need `w`/`h`; audio and video need
  `duration` 0 to 30 s (`start` defaults to 0); `poster` only on video;
  `revealMedia` is an image. `ready` needs a source with `checkedAt` or
  `verified.by:"provided"`, a non-empty `reveal`, and every file present in
  `public/tq/`. `personal` only in `kim`/`lore`; `needs-brandon` stays
  `confirm` (or `rejected`) and never plays, even forced. Optional
  `flags:["reveals-answer"]` marks an asset the builder knows gives it
  away. Unknown fields are refused. Option ids: 1 to 8 lowercase
  letters/digits.
- **Files**: `aux` is `aux-bank.json` (Windows). `_fixtures.json` (and its
  media in `public/tq/`) is TEST data from `scripts/tq/fixtures.mjs`; the
  Worker never loads it. `recommended.json` is the plan's shape or `null`.
- **The plan**: `state.triviaPlan` loads as the recommended board marked
  `from:"recommended"` and keeps following it on every load until the
  commissioner changes anything. Forcing is per clue: `qbankAssign { col,
  slot, qid, force:true }` (stored as `plan.forced[qid]`). `qbankAssign` of a
  clue already on the board moves it. `qbankEdit` patches land on the edit
  already kept, field by field (options by id, the clip's `start` and
  `duration` only); a field set back to the bank's value drops out; `patch:
  null` reverts. The commissioner setting `status:"ready"` stamps
  `verified:{ by:"provided", at:today }` (and `personal:"provided"`).
- **Which game deals**: board format, and any slot set: the plan deals,
  refused until all 35 are filled and ready/forced ("Fill all 35 slots in
  the Question bank first", "N clues aren't ready"); an empty plan plays the
  set list as before. `triviaConfigured` (and so Lock and start's automatic
  start, the Start beat, the Ready check row) counts the plan. The format
  must be Board: the desk should offer the switch beside the bank.
- **A dealt bank clue**: `{ format:"choice", text, subject?, options:[text],
  optionIds:[id], answer:index, reveal?, media?, revealMedia?, source:qid,
  category }`, options in an order seeded by game id + qid. The game has
  `values:[100..500]`; the Daily Double hides on 300+; its and the Final's
  most read the top value (500).
- **Media first**: a media clue picks with `armAt` at its reading time plus
  `MEDIA_READY_CAP_MS` (2.5 s) and `log.mediaWait`; the first
  `boardMediaReady { clueId }` from a TV socket (or the commissioner) moves
  the arm to `MEDIA_ARM_LEAD_MS` (0.5 s) after it, never before the reading
  time, only on the first race before any buzz. A clip clue keeps the
  buzzers open for its length plus 2 s.
- **Host cues**: `boardMediaCue { clueId, action:"replay"|"pause" }`, the
  pill's tray "Replay clip" / "Pause clip" while a clip clue is up. A replay
  starts 0.4 s on (and, before any buzz, keeps the buzzers open to its end).
  `clipStart(game)` is the one answer to "when does the clip play".
- **Screens**: `src/features/trivia/boardMedia.js` (the plan, the audio
  through the app's one media element, the video in the clue's own
  `<video>`, the ready report). The TV letters the subject under an image,
  a bar runs with a clip, the reveal swaps in `revealMedia` with the
  `reveal` note. Phones show an image small (and the reveal's), never a
  clip, and the grid uses each category's `short` name. Rehearse at
  `/dev/trivia-preview.html` ("Bank:" steps); fit views `tv-bank-*` and
  `bank-*` (`dev/fit/qbankFixtures.js bankStage`).
- **The desk's read** `GET /api/trivia/qbank` (GM token): `{ ok,
  categories:[{ id, name, short }], values, records:[record merged with its
  edit, mark, edited, original? ], plan, recommended, edits, marks,
  status:{ total, filled, empty, missing, unready, full }, warnings:[{ col,
  slot, qid, kind, text }] }`. The commissioner's frames also carry
  `triviaPlan`, `triviaBankEdits` and `triviaBankMarks`; no other frame does.
