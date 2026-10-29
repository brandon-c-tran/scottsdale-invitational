# Karaoke: the contract

Oct 12, 2026. Brandon's brief: a karaoke game in the shape of Hypixel's
Build Battle ("Master Builders"): people pick songs ahead of time, separate
from their win song; when the event starts there is time to pick; the room
votes on every performance. Friday night, a real event (400), whole songs,
scores hidden until the end. Every decision Brandon did not make himself is
marked **(call)** so he can overturn it after review.

This file is the contract. `shared/karaoke.js` is its pure model (written
first; read it, do not re-derive it), `worker/karaoke.js` the reducers,
`features/tv/TVKaraoke.jsx` the TV, `features/karaoke/` the phones. Change
this file first, then the code.

## The night, in order

1. **Before the weekend.** Each guest picks a karaoke song in their profile
   (Profile > Karaoke): search Spotify exactly as for the win song, then the
   server finds up to three embeddable YouTube karaoke uploads for it (their
   words are on the video); one search per chosen track, cached. The guest
   previews one on the phone (with sound) and taps Use. A pasted YouTube
   link works too. The song is private: its owner and the commissioner
   only.
2. **Announce.** Karaoke is an ordinary free-for-all event: the intro plays,
   the free-for-all market opens ("Winner pays 2:1"), bets go on.
3. **Lock and start** opens the **pick window** in the same write when the
   karaoke capability is on: `KARAOKE_PICK_MS` (2 min) **(call)**. Every
   present player's phone opens "Pick your song": Keep (a picked-ahead song)
   or Change (the same picker inside the sheet; its previews play muted,
   lyrics on screen, so the room does not hear your song) **(call)**. Keep,
   or using a song in the window, locks you in. The TV shows the room's
   chips lighting as each locks in (never what they picked) over a
   countdown. The server checks every saved video right away (one batched
   YouTube call); a song whose video is gone tells its owner "Pick another
   song". The window ends at its time, or `KARAOKE_ALL_IN_MS` after everyone
   present has locked in, or on the commissioner's "Start singing". "More
   time" adds 60 s, three times at most **(call)**.
4. **The order.** At the window's end the server draws the running order
   from the present players with a song (seeded by the game id), and copies
   each song into the game (editing a profile later never changes a running
   game). A present player with no song sits out: they earn nothing, can
   still vote, and open tickets backing them are returned **(call)**. The
   TV deals the order as a queue (`KARAOKE_ORDER_HOLD_MS`, 6 s).
5. **Each singer.** "Up next" (`KARAOKE_UP_MS`, 20 s): the singer's photo
   chip, name, the song's title and artist stamped in (the song is public
   from here), the queue; the singer's phone says "You're up". Then the
   song starts by its own write (`karaokeStartSong`, so "Pause autopilot"
   holds a singer at Up next) `KARAOKE_SONG_LEAD_MS` after it lands, and the
   video plays on the TV for its length, capped at `KARAOKE_MAX_SONG_MS`
   (5 min) **(call)**. A late or
   reloaded TV seeks to where the room is. An absent singer (Away) is
   skipped when their turn comes.
6. **The vote.** From the song's start until the vote closes, every present
   player but the singer may vote with Build Battle's six tiers: Super Ass,
   Ass, OK, Good, Amazing, Legendary. A vote can change until it closes; the
   same tier again changes nothing. Each voter's phone opens the vote when
   the song starts (Build Battle votes while you watch), and once more when
   the song ends if they have not voted; Home's row opens it any time. The
   vote closes `KARAOKE_VOTE_GRACE_MS` (20 s) after the song ends, or
   `KARAOKE_ALL_IN_MS` after the song has ended and every voter has voted,
   or on "Close vote". The TV shows who has voted (chips lighting, never
   the tier). Nobody, the commissioner included, ever sees anyone's vote.
7. **Legendary rain.** When a closed vote is at least a quarter Legendary
   (two votes at least), the TV rains "LEGENDARY" over that singer for
   `KARAOKE_LEGENDARY_MS` before the next singer is up, as Build Battle
   does.
8. **The reveal.** After the last singer the TV reveals the order from last
   to first (`karaokeRevealSchedule`): each singer's chip, name, song, score
   and the tier it is nearest, 3rd, 2nd and 1st each a longer beat. A phone
   shows each row at the TV's instant, never before.
9. **The result** posts through the ordinary path (`beginResultEntry` +
   `saveResult`): Friday's 400 / 200 / 100, the market settles, the winner's
   WIN song plays (not their karaoke song), the moments (bits) follow.

## Scoring (shared/karaoke.js)

- A vote stores its tier (1 to 6). It counts Hypixel's points for these
  names: Super Ass 1, Ass 2, OK 7, Good 10, Amazing 14, Legendary 18 (their
  current values; Hypixel added "Meh" in Nov 2024 and we keep the six the
  room remembers) **(call)**.
- A singer's score is the mean of their points after dropping one highest
  and one lowest vote once they have `KARAOKE_TRIM_AT` (6) or more votes
  **(call; tactical low-voting is Build Battle's top complaint)**. Fewer: the
  plain mean. A missing vote simply does not count (Hypixel since Nov 2024
  fills a missing vote with the average, which ranks the same).
- Ranking is strict (one player per place): score (exact, sum/count
  cross-multiplied), then more Legendary votes, then Amazing, and down, then
  more votes, then the earlier singer in the running order. `saveResult`
  refuses a shared 1st on a free-for-all, so a place is never shared.
- A singer nobody voted on has no score and ranks after everyone who has
  one. Nobody voted on anyone: `karaokeFinish` refuses ("Nobody voted") and
  the event is entered by hand like any free-for-all.
- Shown with one decimal ("15.6") beside the tier it is nearest ("Amazing"),
  in that tier's color.

## State

```
profiles[p].karaokeTrack = {           // configuration: owner + commissioner only
  provider, trackId, uri, url, name, artists, durationMs, imageUrl, explicit, isrc?,
                                        // the Spotify half, validateSpotifyTrack (no startMs)
  video: { id, title, channel, seconds },   // the chosen YouTube upload (60 to 900 s)
  alts:  [{ id, title, channel, seconds }], // up to two more, for "Next video"
  at, checkedAt,
  lyrics, lyricsOffset                  // Oct 15 to 28 only (lyrics are off): kept, never read
}
// an upload's kind (instrumental, karaoke, other) is read from its title
// (karaokeVideoKind, the song's own name ignored), never stored

state.karaoke = {                       // progress: a reset clears it; absent until Lock and start
  id, eventId, startedAt,               // id = karaokeGameId(eventId, startedAt)
  phase: "pick" | "turns" | "reveal" | "done",
  pickUntil, moreTime,
  ready:  { [player]: at },             // locked in during the window
  broken: { [player]: code },           // the window's video check failed their song, or
                                        // "words": an instrumental with no karaoke upload found
  order:  [player], out: [player],      // drawn at the window's end; who sat out
  songs:  { [player]: snapshot },       // karaokeSnapshot at the window's end
  index,                                // the current turn
  turns:  { [player]: { upAt, songAt, endAt, closeAt, video, playedAt, failed,
                        cut, skipped, later, closedAt, legendary } },
  votes:  { [singer]: { [voter]: { tier, at } } },   // SERVER ONLY, never projected
  revealAt, ranking: [{ player, place, score, sum, count, votes }],
  empty,                                // nobody had a song: entered by hand
  finishedAt, ops,                      // ops: server-only retry ledger
  bad:    { [player]: { [videoId]: code } }  // SERVER ONLY: the window's video check
  upgrade:{ [player]: { trackId, video | null } }  // SERVER ONLY: a karaoke upload found for a
                                        // song whose every upload is an instrumental (null: none)
  lyrics                                // an Oct 15 to 28 game's lines: kept, never read or sent
}
```

`ops`, `bad`, `lyrics` and `upgrade` never leave the Worker:
projectKaraoke builds every frame field by field. `ops` keeps the last few retried action keys per scope
(`gm` for the commissioner's and the autopilot's beats, `v:<voter>` for
each voter).

`turn.songAt` is null until `karaokeStartSong`. `turn.video` is 0 for the
chosen upload, 1 or 2 for an alternate. `turn.playedAt` is when a TV really
saw the song start (it shifts endAt and closeAt). `turn.failed` is a YouTube
error code when no alternate is left (the TV then shows the lit practice
card for the song's length; votes go on). Per-voter votes are deleted when
the result posts; the ranking stays (a cleared result re-posts from it).

## Writes (`worker/karaoke.js`, spread into ACTIONS)

Guest (device claim, active and present unless noted):
- `karaokeSong { track | null }`: the owner's profile song through
  `cleanKaraokeTrack`; null clears. The phone's own `lyrics` and
  `lyricsOffset` are dropped; the same track keeps the ones it has, so an
  Oct 15 to 28 song saved again is still a no-op. An identical song
  (`sameKaraokeTrack`) is a no-op. During a pick window it also locks the
  owner in (one write), unless the song is broken (below).
  Allowed while the poker table is dealt (POKER_TABLE_ALLOWED_ACTIONS).
  Never needs presence (a guest picks from home weeks ahead).
- `karaokeReady { gameId }`: Keep. Needs a song; only in the pick window.
- `karaokeVote { gameId, singer, tier }`: only the current singer, only
  while `karaokeVoteOpen`, never your own, never absent. Same tier: no-op.

Commissioner (and the autopilot with `{ auto:true, actionId:key }`; an
auto write that is early, held or no longer current is `ok({ unchanged,
stale })`, as the board's autoStale):
- `karaokeStart { evId }`: run by Lock and start in the same write when
  `ctx.karaoke`; checks everything before it mutates; never throws.
- `karaokeMoreTime { gameId }`, `karaokeEndPick { gameId }`.
- `karaokeStartSong { gameId, index }`: songAt = now + SONG_LEAD.
- `karaokeEndSong { gameId, index }`: endAt = now (cut), closeAt follows.
- `karaokeNextVideo { gameId, index }`: the next alternate, songAt = now +
  SONG_LEAD (votes so far stay). Before the song has started it only
  switches the upload (no songAt is written; the walk-up's clock runs on).
- `karaokeLater { gameId, index }`: the up singer moves to the end of the
  order, once, before their song starts.
- `karaokeSkip { gameId, index }`: the current singer sits out (no score,
  their votes discarded), the next is up.
- `karaokeNext { gameId, index }`: closes this vote (closedAt, legendary),
  puts the next present singer up (upAt = now, plus KARAOKE_LEGENDARY_MS
  after a Legendary vote), skipping anyone absent; after the last, the
  reveal (ranking computed, revealAt = now, plus KARAOKE_LEGENDARY_MS when
  the last vote was Legendary: the rain plays before the reveal).
- `karaokeFinish { gameId }`: posts the ranking's slots through
  `run('beginResultEntry')` + `run('saveResult')` as triviaFinish does,
  then phase done and the votes deleted.
- `karaokeRestart { gameId, confirm:true }`: a fresh pick window, every
  vote discarded (REWIND: frameGate treats it as a rewind).
System writes (the Durable Object, from a TV's report or a check, auto ctx):
- `karaokeTvPlaying { gameId, index, video, playingAt }`: the first report
  for that turn and video: when `playingAt - songAt` is over
  KARAOKE_LATE_MIN_MS, endAt and closeAt move by it (at most
  KARAOKE_LATE_MAX_MS); stamps playedAt. Only ever moves the end later.
- `karaokeTvError { gameId, index, video, code }`: switches to the next
  alternate (as karaokeNextVideo); with none left, stamps `failed`.
- `karaokePreflight { gameId, bad:{ [player]: { [videoId]: code } } }`:
  from the window's video check, keyed by video id (only ids of that
  player's saved song count), kept in the server-only `bad` map; a song
  whose main video failed but has a working alternate gets that alternate
  promoted in the game's copy at the order draw; with none,
  `broken[player]` (their sheet asks for another song, and they are no
  longer locked in). A check for a window that has closed is a no-op.
- `karaokeLyrics { gameId, songs:{ [player]: { trackId, upgrade } } }` (the
  name is older than its job): from the Durable Object's fill (see "Lyrics,
  off"). `upgrade` (a karaoke upload, or null; an instrumental counts as
  null) in `upgrade[player]`; `lines` are ignored; an entry whose trackId is
  no longer that player's song is dropped; nothing new is a no-op. In the
  pick window a song left with no words (`karaokeNoWords`) is
  `broken[player] = "words"` (Pick another song, the lock-in undone; a new
  song or a later find clears it). From the order draw, every song not yet
  started (and not moved to another upload) is arranged anew
  (karaokeArrange).
- `karaokeNudge { player, trackId, offsetMs }` (commissioner): dormant since
  Oct 28; no screen sends it.
QA (commissioner + qa capability): `karaokeSimSongs` (every present player
without a song gets a practice song in the GAME only, never a profile),
`karaokeSimVotes` (every present voter without a vote votes a tier seeded
from the game id, voter and singer). QA's `playKaraoke` plays a game to its
result in one run (practice songs, `run.wait`, `run.back`), deterministic.
Practice songs (`KARAOKE_PRACTICE_SONGS`) have no video: the TV plays the
lit card for KARAOKE_PRACTICE_MS (30 s).

Sim players (shared/qaSim.js `planKaraoke`, the "Sim players" switch): in
the window a simulated player with a profile song keeps it
(`karaokeReady`), one without takes a practice song through
`karaokeSimSong { gameId, k }` (a simulated player's context and the qa
capability only, never a phone; the game only, never a profile; locks
them in). Over each song every simulated voter votes on a human clock,
mostly during the song, some in the grace, a few changing their mind once,
their tiers centred on the singer's seeded knack.

`playerRecord` (Not coming guard): in the game's order, ready or votes.
A profile song alone is never a record.

## The clock (`karaokeAutoBeat`, read through autopilot's autoBeat)

- pick: `karaokeEndPick` at pickUntil, or KARAOKE_ALL_IN_MS after the last
  present player locks in.
- turns: `karaokeStartSong` at upAt + KARAOKE_UP_MS; then `karaokeNext` at
  closeAt, or KARAOKE_ALL_IN_MS after max(endAt, the last vote) once every
  voter has voted (vote times ride in the projection, so the pill's drain
  agrees with the server).
- reveal: `karaokeFinish` at revealAt + span + KARAOKE_REVEAL_HOLD_MS.
  Nobody voted on anyone: no finish beat (the autopilot stops; the
  commissioner enters the result by hand).

## The pill (`karaokeBeat` in shared/karaoke.js, chained in show.js lifecycleBeat)

One `karaoke-step` beat whose write and payload equal karaokeAutoBeat's
(same key order, so the drain shows): "Start singing" (note "N of M
locked in"), "Start song" (note "{Name} up"), "Close vote" (note "N of M
voted"), "Post result". Tray: "More time", "Later", "End song", "Next
video", "Skip {Name}", "Restart". A `karaoke-start` beat ("Start karaoke")
when the event is under way without a game and the director's `karaoke`
option is on (the capability, threaded like showControl). Empty or nobody
voted: no karaoke beat, the ordinary Enter result shows.

## What each screen gets (`projectKaraoke(state, viewer)`)

Everyone, the commissioner and the TV included: phase, times, order, out,
index, turns, ready, who voted on each turn and when (`voted`, never the
tier), the songs of every turn up to the current one, and the ranking once
the reveal starts. A player also gets their own song and votes (`mine`)
and their own `broken` flag, and `ways: { [viewer]: "video" | "card" }`.
`lyrics` is always `{}` (older clients read it). The commissioner sees songs no sooner than
anyone (he sings too); his Karaoke desk reads the profiles, titles hidden
until he taps Show. Nobody gets anyone else's vote. `karaoke` is in
PER_VIEWER_KEYS; `karaokeTrack` is in PRIVATE_PROFILE_FIELDS.

## YouTube

- `GET /api/karaoke/videos?trackId&name&artist&durationMs` (device claim or
  GM token, rate limited, cached in `private:karaoke:<trackId>` for at most
  30 days per YouTube's storage rule, with `v:3`) answers `{ ok, videos }`:
  one search.list (q "{artist} {name} karaoke", type video,
  videoEmbeddable, videoSyndicated, regionCode US, maxResults 15) and one
  videos.list (snippet, contentDetails, status). Keep: embeddable, public
  or unlisted, processed, not age restricted, not blocked in the US, not
  live, 60 to 900 s, "karaoke" in the title, never an instrumental by
  `karaokeVideoKind` (the song's own name ignored), never a "- Topic"
  channel. Rank: known embeddable karaoke channels first (Stingray Karaoke,
  Zoom Karaoke, CC Karaoke, Musisi Karaoke, KaraokeOnVEVO, Sunfly, Atomic,
  then KaraFun and Party Tyme), then title words (karaoke, instrumental,
  lyrics; minus cover, live, lesson, reaction), then length near the
  song's. Up to three `{ id, title, channel, seconds }`. Sing King refuses
  embedding: never offer it. A kept lookup (any `v`) answers with its
  uploads that are not instrumentals; one kept Oct 15 to 28 with nothing
  else is asked again. A quota answer reads "YouTube's daily limit is used
  up. Paste a YouTube link." (search.list is its own bucket of 100 calls a
  day since June 2026.)
- `GET /api/karaoke/video?id` (same auth): one videos.list for a pasted
  link, the same checks.
- The window's check: after karaokeStart persists, the DO makes one
  batched videos.list for every present player's saved videos and writes
  `karaokePreflight` (never blocking or failing the start).
- Players: one YT.Player on the TV, never overlaid (YouTube's rules forbid
  anything in front of an embedded player), at least 480x270, removed at
  ENDED or endAt; phones preview in YouTube's own visible player. Never a
  no-referrer policy (error 153). One shared IFrame API loader
  (`src/lib/youtube.js`).

## Lyrics, off (Oct 28)

Brandon's call: "the youtube videos are more than enough and work better,
i find the native lyric ones to just straight up not play". From Oct 15 a
song could play over a YouTube INSTRUMENTAL with our own LRCLIB synced
lyrics on the TV and the singer's phone; that way is off. Every song plays
a karaoke upload with its words on it (`karaokeWay`: "video", or "card"
with no upload).

- Nothing searches for an instrumental and LRCLIB is never asked. No lyric
  stage on the TV (the video plays in its full box), no teleprompter or
  lyric line on a phone, no "Lyrics" / "Video lyrics" lamp, no nudge on
  the desk.
- A song saved Oct 15 to 28 may have an instrumental as its chosen upload
  (`karaokeVideoKind` reads it from the title). At the order draw
  (`karaokeArrange`) it steps behind the first of its alternates with words
  on it. With none (`karaokeNeedsWords`), the Durable Object's fill after
  every persisted write (`queueKaraokeLyrics`, its old name; the list is
  `karaokeLyricsWanted`) looks up a karaoke upload (a kept lookup, else one
  search) and writes it as `upgrade[player]` (`karaokeLyrics`, auto
  context), which then leads, the instrumental kept as its alternate. A
  search that finds none asks its owner for another song in the pick
  window (`broken` "words"). A failed lookup is asked again a minute later
  on a later write; it never holds up or fails a write. The profile is
  never rewritten.
- Older data stays and is never read: a profile song's `lyrics` and
  `lyricsOffset`, a game's `lyrics`, `private:lyrics:*` keys and an
  instrumental `upgrade` (ignored by `karaokeArrange`). Frames carry
  `lyrics:{}`.
- Dormant, unmounted: `shared/karaokeLyrics.js`, `worker/lyrics.js`,
  `features/karaoke/Lyrics.jsx` and `lyrics.css`, the TV's
  `KARAOKE_LYRIC_*` layout and the `karaokeNudge` reducer.

## The TV report

TV sockets add `tvVideo: { key, state, code, at }` to presence (inside
tvSoundPayload's body), `key` = `${gameId}:${index}:${video}`, `state` one
of ready, playing, blocked, error. The Worker validates it like `tvSound`,
keeps it in socket meta, adds it to the commissioner's `tvs`, and turns
the first "playing" (with `at` = when the video's time 0 played) and the
first "error" per key into `karaokeTvPlaying` / `karaokeTvError`. The pill
shows "Video blocked on the TV" with Next video.

## The screens

- TV (`features/tv/TVKaraoke.jsx` on the pure `karaokeTv.js`): pick (the
  room's chips lighting over the ring), order (dealt as a queue), up (chip,
  name, song stamped in, on deck, the ring to the song), singing (the video
  in its own 1536x864 box, `KARAOKE_VIDEO_BOX`, nothing ever drawn over it;
  the singer's strip and the room's vote lamps under it; a practice song or
  a failed upload is the lit card in the box's place), voting (who has
  voted, never how), Legendary rain, reveal (13 rows, last place first).
  The player (`karaokePlayer.js`, one YT.Player a game, never in a fixed
  still) cues at up, plays at songAt on the server clock, seeks a late TV
  to where the room is, stops at ENDED or endAt, reports ready, playing,
  error and blocked ("Click to play" in the strip), and mutes with the TV's
  Sound switch. TVMode takes the room for the game (`karaokeOnTv`), makes
  the song a takeover (`karaokeSongOn`) and never reloads for a new build
  from the first singer to the result (`karaokeTvBusy`). Room sounds:
  `karaokeSound.js` through roomSound.
- Phone (`features/karaoke/`, the pure `karaokeModel.js`): `KaraokeSheet`
  opens itself once per moment (pick with Keep and Change, the picker's
  previews muted; You're up; Singing; the vote's six tiers, single flight
  through `voteFlight.js`; closing; closed; your Legendary; the reveal,
  each row held to the TV's instant). Home: the You strip speaks what the
  game asks of you (`karaokeYou`); `KaraokeHome inCard` is the Now card's
  row for the rest (your tier, the room's place, a spectator's way in, a
  song to pick before the game). The singer's takeover (`singerUp.js`) and
  the pocket alert ("sing", worker/pushAlerts.js) say You're up next.
- The commissioner: the pill's karaoke step and tray, the sheet's own tray
  while it is open, and Commissioner > Games > Karaoke (`KaraokeDesk`, in
  the slate's order, only with the capability).

## Capability

`capabilities.karaoke` = `audioCatalog && songSnippets` (Spotify search and
the YouTube key). It rides in the frame head, reaches reducers as
`ctx.karaoke` (all three DO ctx sites) and the director as an option.
Without it the profile section, Home rows and desk hide, Lock and start
opens nothing, and Karaoke is entered like any free-for-all.

## Ads and the TV

Embedded karaoke uploads may carry ads the app cannot skip. Sign the TV's
kiosk Chrome profile into YouTube Premium (cookies allowed). Without it,
the TV's "playing" report moves the song's end by the ad's length.

## Not doing

Pitch scoring, a phone microphone, duets, running scores, a song's tier
counts, anyone's vote, ranking ties, our own lyrics (off since Oct 28, see
"Lyrics, off").
