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
