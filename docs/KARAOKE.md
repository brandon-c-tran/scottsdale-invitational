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
   server finds up to three embeddable YouTube uploads for it: its
   INSTRUMENTAL first when LRCLIB has the song's synced lyrics (our own words
   on the TV and the singer's phone, "Lyrics"), karaoke uploads as the
   second tier (their words are on the video, "Video lyrics"); one search
   per chosen track, cached. Each upload says which way it plays. The guest
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
   (5 min) **(call)**. Over an instrumental with synced lyrics the TV keeps
   the player compact in a corner and fills the rest with our lyric stage,
   and the singer's phone is a teleprompter (see "Lyrics"). A late or
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
  lyrics,                               // true/false: LRCLIB had synced lyrics when it was saved
                                        // (the server's kept answer, never the phone's); absent:
                                        // unknown (every song saved before Oct 15)
  lyricsOffset                          // the commissioner's nudge, ms, ±250 steps, ±10 s;
                                        // positive shows the words earlier; absent: 0
}
// an upload's kind (instrumental, karaoke, other) is read from its title
// (karaokeVideoKind, the song's own name ignored), never stored

state.karaoke = {                       // progress: a reset clears it; absent until Lock and start
  id, eventId, startedAt,               // id = karaokeGameId(eventId, startedAt)
  phase: "pick" | "turns" | "reveal" | "done",
  pickUntil, moreTime,
  ready:  { [player]: at },             // locked in during the window
  broken: { [player]: code },           // the window's video check failed their song
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
  lyrics: { [trackId]: [{ t, text, words? }] | false },  // SERVER ONLY: each song's synced lyrics
                                        // (false: none); frames carry the current singer's only
  upgrade:{ [player]: { trackId, video | null } }  // SERVER ONLY: an instrumental found for a
                                        // song saved before instrumentals were offered
}
```

`ops`, `bad`, `lyrics` (whole) and `upgrade` never leave the Worker:
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
  `cleanKaraokeTrack`; null clears. Its `lyrics` is the Durable Object's
  kept LRCLIB answer for the track (`ctx.karaokeLyrics`, read from
  `private:lyrics:<trackId>` before the write, never a lookup), else the
  saved song's when it is the same track; the phone's own `lyrics` and
  `lyricsOffset` are dropped; the same track keeps its nudge. An identical song (`sameKaraokeTrack`)
  is a no-op. During a pick window it also locks the owner in (one write).
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
- `karaokeLyrics { gameId, songs:{ [player]: { trackId, lines?, upgrade? } } }`:
  from the Durable Object's lyric fill (below). `lines` (cleanLyrics; null
  or junk is `false`) kept in `lyrics[trackId]`, `upgrade` (an
  instrumental upload, or null) in `upgrade[player]`; an entry whose
  trackId is no longer that player's song is dropped; nothing new is a
  no-op. From the order draw, every song not yet started (and not moved to
  another upload) is arranged anew (karaokeArrange).
Commissioner (configuration, allowed while the poker table is dealt):
- `karaokeNudge { player, trackId, offsetMs }`: the song's whole offset
  (cleanLyricsOffset), written on the profile song and on the game's copy
  (so the room follows it at once); a song changed since is refused ("That
  song changed. Look again"); the same offset is a no-op.
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
and their own `broken` flag, and `ways: { [viewer]: "lyrics" | "video" }`,
how their own song will play (the window's lamp). `lyrics` carries the
current singer's lines alone (`{ [trackId]: lines | false }`), from the
moment they are up: as public as the song itself (every screen, the
singer's own phone included), never earlier and never a song still to
come. The commissioner sees songs no sooner than
anyone (he sings too); his Karaoke desk reads the profiles, titles hidden
until he taps Show. Nobody gets anyone else's vote. `karaoke` is in
PER_VIEWER_KEYS; `karaokeTrack` is in PRIVATE_PROFILE_FIELDS.

## YouTube

- `GET /api/karaoke/videos?trackId&name&artist&durationMs` (device claim or
  GM token, rate limited, cached in `private:karaoke:<trackId>` for at most
  30 days per YouTube's storage rule, with `v:2`; a lookup kept before Oct
  15 is asked again) answers `{ ok, videos, lyrics }`. Since Oct 15
  (`findBackingVideos`): LRCLIB is asked beside ONE search.list (q "{artist}
  {name} instrumental") and ONE videos.list. An instrumental is kept when
  its title says so (instrumental, backing track, no vocals, minus one;
  never karaoke or lyrics), it names the song, its length is within
  `INSTRUMENTAL_MATCH_MS` (2.5 s) of Spotify's (the same recording, so
  LRCLIB's times line up), nothing in it changes the arrangement (piano,
  acoustic, cover, remix, live, slowed...), never a "- Topic" channel, and
  the play checks below; ranked by length (whole seconds), then title words
  (official, original, studio up; backing vocals, extended down), then the
  artist's own channel, one a channel first **(call)**. The same results'
  karaoke uploads (the rules below) are the second tier. A second search
  (q "{artist} {name} karaoke", only ids not already read) runs only when
  the first found no karaoke upload and there is no instrumental with
  synced lyrics. The choices (`chooseBacking`): with lyrics, up to two
  instrumentals then a karaoke upload as the fallback; without, karaoke
  uploads alone. A lookup whose LRCLIB call failed is answered but never
  kept. The karaoke tier, as before Oct 15: one search.list (q "{artist}
  {name} karaoke", type video, videoEmbeddable, videoSyndicated, regionCode
  US, maxResults 15) and one videos.list (snippet, contentDetails, status).
  Keep: embeddable, public or unlisted, processed, not age restricted, not
  blocked in the US, not live, 60 to 900 s, "karaoke" in the title, never a
  "- Topic" channel. Rank: known embeddable karaoke channels first (Stingray
  Karaoke, Zoom Karaoke, CC Karaoke, Musisi Karaoke, KaraokeOnVEVO, Sunfly,
  Atomic, then KaraFun and Party Tyme), then title words (karaoke,
  instrumental, lyrics; minus cover, live, lesson, reaction), then length
  near the song's. Up to three `{ id, title, channel, seconds }`. Sing King
  refuses embedding: never offer it. A quota answer reads "YouTube's daily
  limit is used up. Paste a YouTube link." (search.list is its own bucket
  of 100 calls a day since June 2026.)
- `GET /api/karaoke/video?id` (same auth): one videos.list for a pasted
  link, the same checks.
- The window's check: after karaokeStart persists, the DO makes one
  batched videos.list for every present player's saved videos and writes
  `karaokePreflight` (never blocking or failing the start).
- `GET /api/admin/karaoke/check` also answers each song's `way`: its
  lyrics (LRCLIB) and, for a song saved before Oct 15, the instrumental the
  window would put first (a kept lookup, else one search), four at a time.
- Players: one YT.Player on the TV, never overlaid (YouTube's rules forbid
  anything in front of an embedded player), at least 480x270, removed at
  ENDED or endAt; phones preview in YouTube's own visible player. Never a
  no-referrer policy (error 153). One shared IFrame API loader
  (`src/lib/youtube.js`).

## Lyrics (Oct 15)

Brandon's call: native karaoke, "like Songsterr's premium YouTube backing".
A song plays one of three ways (`karaokeWay`): **lyrics** (an instrumental
upload, our synced words on the TV and the singer's phone), **video** (a
karaoke upload with its words on it, or any upload without synced lyrics:
the behavior before Oct 15), **card** (no upload: a practice song, a
failed one).

- LRCLIB (`worker/lyrics.js`): free, no key. One `GET
  https://lrclib.net/api/search?track_name&artist_name` a song (the name
  without its release suffix or featured artists), with our User-Agent
  (`FieldDay/1.0 (https://fielddayseries.com)`, LRCLIB's one request). The
  record kept: synced lyrics, not instrumental, its length within
  `LYRICS_MATCH_MS` (3 s) of Spotify's, the song's own name first, nearest
  length. Parsed (`shared/karaokeLyrics.js parseLrc`: every stamp a line,
  `[offset:]` applied, enhanced `<mm:ss.xx>` word stamps kept as `words`)
  and cleaned (`cleanLyrics`: sorted whole ms, 400 lines, 160 characters,
  no break first or twice). Kept in `private:lyrics:<trackId>` 30 days, a
  miss a day, a failure never.
- When: the picker's lookup asks it; `karaokeSong` reads the kept answer
  into the profile's `lyrics`; after every persisted write (the socket's and
  the autopilot's) the DO's lyric fill (`queueKaraokeLyrics`) looks up what
  `karaokeLyricsWanted` says the game still owes (the window: every present
  player's profile song; from the order draw: every song whose turn has not
  closed), one song after another, and for a song saved before Oct 15
  (`lyrics` unknown, no instrumental among its uploads) whose lyrics were
  found, its instrumental (the kept lookup, else one search); then ONE
  `karaokeLyrics` write (autopilot context). It never holds up or fails a
  write; a song whose lookup failed is asked again a minute later, on a
  later write.
- The order (`karaokeArrange`, at the order draw and on a later lyrics
  write for any song not yet started): with lyrics, a song saved before Oct
  15 plays an instrumental first (one among its uploads, else the
  upgrade's, its own uploads as the alternates) **(call)**; a guest who
  chose a karaoke upload over an offered instrumental keeps it. Without
  lyrics, an instrumental steps behind the song's karaoke upload. The
  profile is never rewritten. A failing instrumental goes to its alternates
  as any upload does (Next video, the TV's error): a karaoke alternate then
  plays its own words.
- The clock: the TV reads its player (`getCurrentTime()` every frame,
  `karaokePlayer.js time()`), the server clock until it plays; a phone reads
  the server clock from when a TV saw the song start (`playedAt`, else
  `songAt`; `lyricClockMs`). Both add the song's `lyricsOffset`.
  `lyricCue(lines, ms)`: the line being sung, the next (a break is never the
  next), how far through its sweep, each word's share of it. A line with
  word stamps lights by them; without, it sweeps at about 80 ms a character
  (1.2 s at least, never past the next line) **(call)**; a sung line stays
  lit until the next (the last goes 4 s after it is sung).
- The nudge (`karaokeNudge`): Commissioner > Games > Karaoke marks the
  singer on now ("Singing", the live lamp) and, when their song is sung
  with our lyrics, Earlier and Later a quarter second a tap with the offset
  between ("0.5 s earlier"); a song nudged before says by how much.
- The TV (`TVKaraoke.jsx LyricStage`): the player compact in the top right
  corner (`KARAOKE_LYRIC_VIDEO_BOX`, 480x270 at 1376,54: YouTube's minimum
  is 200x200, and nothing is drawn over it), the singer's plate beside it
  (chip, name, song, artist, the song draining), the lyric stage on glass
  under them (`KARAOKE_LYRIC_STAGE`): the line being sung in Big Shoulders
  900 at up to 132 px, two lines at most (`karaokeLyricSize`), each word
  filling bone left to right as it is sung; the next line dim at 60 px; a
  break, three bulbs. The strip is the room's votes alone.
- The phones (`features/karaoke/Lyrics.jsx`, the same component): the
  singer's Singing screen is a teleprompter (the line to sing large, the
  next under it); a voter's vote has the line being sung, small, above the
  tiers.
- The pick window's sheet, the picker (each upload and the saved song) and
  the desk say which way a song plays (`KaraokeWay`): "Lyrics" (the info
  lamp lit) or "Video lyrics" (unlit).
- Verified offline only: YouTube's and LRCLIB's answers are stood in by the
  tests and the fit audit (`dev/fit/karaokeLyricsFixture.js`, lines written
  for the audit, never a real song's words).

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
  a failed upload is the lit card in the box's place; sung with our
  lyrics, the compact player and the lyric stage, see "Lyrics"), voting (who has
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
counts, anyone's vote, ranking ties, our lyrics over a karaoke upload (it
has its own), plain (untimed) lyrics.
