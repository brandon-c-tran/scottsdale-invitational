/* Karaoke's writes (docs/KARAOKE.md is the contract, shared/karaoke.js the
   model). A guest saves a karaoke song on their profile (karaokeSong, any
   time, presence not needed), keeps it in the pick window (karaokeReady)
   and votes on each singer from their phone (karaokeVote). Everything a
   clock decides (the window's end, each song's start, each vote's close,
   the result) is a commissioner write the autopilot makes on the game's own
   clock (karaokeAutoBeat) with a context marked `auto`, and the pill offers
   as a skip-ahead (karaokeBeat); More time, Later, End song, Next video,
   Skip and Restart are the commissioner's alone. The Durable Object turns a
   TV's video report into karaokeTvPlaying or karaokeTvError, and the
   window's video check into karaokePreflight (system writes: an auto
   commissioner context only).

   Every commissioner beat names its game and, during the turns, the turn:
   a beat on a game or turn the room has left is refused, a retried tap (the
   same device and action id, `ops`, server only) is a no-op, and an
   autopilot write that is early, held or no longer the game's next beat is
   acknowledged and changes nothing. Votes are server only: a frame carries
   who voted and when (projectKaraoke), never the tier.

   Two server-only keys beside the contract's: `ops` (the retry ledger:
   `gm` for the commissioner's and the autopilot's beats, `v:<voter>` for
   each voter's votes) and `bad` (the window's video check, { [player]:
   { [videoId]: code } }, which promotes a working alternate at the order
   draw). projectKaraoke builds every frame field by field, so neither ever
   leaves the Worker.

   Built by actions.js with its own helpers, so a finish runs the same
   beginResultEntry and saveResult every other result does. Nothing here
   reads Math.random: the order is drawn from the game id and QA's votes
   from karaokeSeed, so a QA rehearsal repeats and QA's seeded stream for
   the rest of the weekend is untouched. */
import {
  allEventsOf, disp, isAbsent, isActivePlayer, isAway, presentPlayers, refundTotals, resolveCurrentContest,
  resolveEventLifecycle, resolveWager, rosterOf, voidWagerRecords, wagerMatchesContest,
} from "../shared/core.js";
import { autopilotHeld } from "../shared/show.js";
import {
  KARAOKE_ALTS_MAX, KARAOKE_LATE_MAX_MS, KARAOKE_LATE_MIN_MS, KARAOKE_LEGENDARY_MS, KARAOKE_MORE_TIME_MAX,
  KARAOKE_MORE_TIME_MS, KARAOKE_ORDER_HOLD_MS, KARAOKE_PICK_MS, KARAOKE_PRACTICE_SONGS, KARAOKE_SONG_LEAD_MS,
  KARAOKE_TIERS, KARAOKE_VOTE_GRACE_MS,
  cleanKaraokeTrack, cleanKaraokeVideo, isKaraokeTier, isYouTubeId, karaokeArrange, karaokeAutoBeat, karaokeGameId,
  karaokeLegendary, karaokeLive, karaokeOrder, karaokeRanking, karaokeResultSlots, karaokeSchedule, karaokeSeed, karaokeSinger,
  karaokeSnapshot, karaokeStage, karaokeTrackOf, karaokeTurn, karaokeVideoKind, karaokeVoteOpen, karaokeVoters,
  sameKaraokeTrack,
} from "../shared/karaoke.js";
import { cleanLyrics, cleanLyricsOffset } from "../shared/karaokeLyrics.js";

export const KARAOKE_ACTION_TYPES = Object.freeze([
  "karaokeSong", "karaokeReady", "karaokeVote",
  "karaokeStart", "karaokeMoreTime", "karaokeEndPick", "karaokeStartSong", "karaokeEndSong", "karaokeNextVideo",
  "karaokeLater", "karaokeSkip", "karaokeNext", "karaokeFinish", "karaokeRestart",
  "karaokeTvPlaying", "karaokeTvError", "karaokePreflight", "karaokeLyrics", "karaokeNudge",
  "karaokeSimSongs", "karaokeSimVotes", "karaokeSimSong",
]);

/* retried writes the ledger remembers, per scope (the commissioner's
   beats, each voter's votes) */
const OPS_KEPT = 16;
/* an autopilot beat may land this early on the alarm's clock */
const AUTO_EARLY_MS = 250;
const MOVED = "Karaoke moved on";
const BAD_SONG = "That song didn't come through whole. Pick it again";
/* QA's room: each voter's tier from karaokeSeed, the middle tiers most,
   and each singer lifted or lowered a tier so the night has a winner */
const SIM_TIERS = Object.freeze([1, 2, 3, 3, 4, 4, 4, 5, 5, 6]);

const opKeyOf = ctx => ctx?.deviceId && typeof ctx.actionId === "string" && ctx.actionId ? `${ctx.deviceId}:${ctx.actionId}` : null;
const seen = (game, scope, key) => !!key && Array.isArray(game?.ops?.[scope]) && game.ops[scope].includes(key);
const remember = (game, scope, key) => {
  if (!key) return;
  game.ops = { ...(game.ops || {}), [scope]:[...(game.ops?.[scope] || []), key].slice(-OPS_KEPT) };
};
const has = value => value !== null && value !== undefined;
const isCode = value => Number.isInteger(value) && value >= 0 && value <= 999;

/* a song's videos, the chosen upload first */
const videosOf = song => [song?.video, ...(song?.alts || [])].filter(Boolean);
/* The window's video check said every video of this song is gone: the
   error code of its first, or null while any still plays. */
function brokenCode(song, bad) {
  const videos = videosOf(song);
  if (!videos.length || !bad) return null;
  return videos.every(video => has(bad[video.id])) ? bad[videos[0].id] : null;
}
/* At the order draw a game copy keeps only the videos that passed the
   check, the first working one promoted to the chosen upload. A song with
   none working is kept as it was: its turn fails as it comes up (the TV's
   lit card for the song's length, the vote goes on). */
function promote(song, bad) {
  if (!song?.video || !bad) return song;
  const working = videosOf(song).filter(video => !has(bad[video.id]));
  if (!working.length) return song;
  return { ...song, video:working[0], alts:working.slice(1) };
}

/* a fresh pick window; the id is karaokeGameId(evId, startedAt) */
const newGame = (evId, startedAt, now) => ({
  id:karaokeGameId(evId, startedAt), eventId:evId, startedAt, phase:"pick", pickUntil:now + KARAOKE_PICK_MS, moreTime:0,
  ready:{}, broken:{}, order:[], out:[], songs:{}, index:-1, turns:{}, votes:{}, revealAt:null, ranking:null,
  empty:false, finishedAt:null, ops:{},
});
/* a turn as its singer comes up (a singer who went Later keeps that) */
const freshTurn = (prior, upAt, failed = null) => ({ upAt, songAt:null, endAt:null, closeAt:null, video:0, playedAt:null,
  failed, cut:false, skipped:false, later:!!prior?.later, closedAt:null, legendary:false });
const dropVotes = (game, singer) => {
  if (!game.votes?.[singer]) return;
  game.votes = { ...game.votes };
  delete game.votes[singer];
};

/* The next singer from `from` is up at `at`; anyone absent when their turn
   comes is skipped. Nobody left: the reveal, ranked now, from `at` (a
   Legendary close rains before it). A song whose every video failed the
   window's check fails as it comes up. */
function upNext(state, game, from, at, now) {
  for (let i = from; i < game.order.length; i++) {
    const singer = game.order[i];
    const prior = game.turns?.[singer] || null;
    if (isAbsent(state, singer)) {
      game.turns = { ...game.turns, [singer]:{ ...freshTurn(prior, prior?.upAt ?? null), skipped:true, closedAt:now } };
      dropVotes(game, singer);
      continue;
    }
    const video = game.songs?.[singer]?.video;
    game.index = i;
    game.turns = { ...game.turns, [singer]:freshTurn(prior, at, video ? game.bad?.[singer]?.[video.id] ?? null : null) };
    return singer;
  }
  game.index = Math.max(0, game.order.length - 1);
  game.ranking = karaokeRanking(game);
  game.revealAt = at;
  game.phase = "reveal";
  return null;
}

/* the singer is done without a score: their votes go, the next is up */
function skipTurn(state, game, singer, turn, now) {
  game.turns = { ...game.turns, [singer]:{ ...turn, skipped:true, closedAt:now } };
  dropVotes(game, singer);
  upNext(state, game, game.index + 1, now, now);
}

/* A present player with no song sits out: open tickets backing them on the
   event's free-for-all go back, the same way and with the same record an
   Away mark returns them (worker/actions.js setAway: voidWagerRecords with
   the reason, the ack's voidIds and refunds). */
function returnSitOuts(state, ev, out, now) {
  if (!out.length) return [];
  const contest = resolveCurrentContest(state, ev);
  if (contest?.kind !== "ffa" || contest.drawId) return [];
  const events = allEventsOf(state);
  const returned = [];
  for (const player of out) {
    const ids = (state.wagers || []).filter(wager => wagerMatchesContest(wager, contest) && wager.kind === "outright"
      && !wager.pickTeam && wager.pick === player && resolveWager(state, wager, events).status === "pending")
      .map(wager => wager.id);
    if (ids.length) returned.push(...voidWagerRecords(state, ids, `${disp(state, player)} sat out`, now));
  }
  return returned;
}

/* The window's video check as sent: { [player]: { [videoId]: code } }, or
   a player's one code for every video of their saved song. Junk is
   dropped, never the rest. */
function checkedVideos(state, player, value) {
  if (isCode(value))
    return Object.fromEntries(videosOf(karaokeTrackOf(state, player)).map(video => [video.id, value]));
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 1 + KARAOKE_ALTS_MAX)
    .filter(([id, code]) => isYouTubeId(id) && isCode(code)));
}

export function karaokeActions({ ok, err, gmOnly, run }) {
  const gameEvent = (state, evId) => {
    const ev = allEventsOf(state).find(item => item.id === evId);
    return ev?.game === "karaoke" ? ev : null;
  };
  /* the pick window: a game in it, its result not posted */
  const pickWindow = state => state.karaoke?.id && state.karaoke.phase === "pick" && karaokeLive(state) ? state.karaoke : null;
  /* a song for the order: the profile's, else a QA practice song in the game */
  const hasSong = (state, game, player) => !!karaokeTrackOf(state, player)?.video || !!game?.songs?.[player];
  const absentError = (state, player) => err(isAway(state, player) ? "You are marked away" : "Scan the TV first");
  /* An autopilot write runs only while it is still the game's next beat,
     its time has come and the autopilot is not held; anything else (a beat
     the commissioner already took, an early alarm) is acknowledged and
     changes nothing. */
  const autoStale = (state, type, payload, ctx) => {
    if (!ctx?.auto) return null;
    const beat = autopilotHeld(state) ? null : karaokeAutoBeat(state);
    const same = !!beat && beat.type === type
      && Object.entries(beat.payload || {}).every(([key, value]) => payload?.[key] === value);
    return same && beat.at <= Date.now() + AUTO_EARLY_MS ? null : ok({ unchanged:true, stale:true });
  };
  /* A commissioner beat (or the autopilot's) on the game it names, in one
     of `phases`, and on the current turn when `turn`: { game, key } to go
     on, or { result } to answer with. */
  const beatFor = (state, type, payload, ctx, phases, { turn = false, posted = null } = {}) => {
    const g = gmOnly(ctx); if (g) return { result:g };
    const stale = autoStale(state, type, payload, ctx); if (stale) return { result:stale };
    const game = state.karaoke;
    const key = opKeyOf(ctx);
    if (seen(game, "gm", key)) return { result:ok({ unchanged:true }) };
    if (!game?.id || game.id !== payload?.gameId || !phases.includes(game.phase)
        || (turn && payload?.index !== game.index)) return { result:err(MOVED) };
    if (state.results?.[game.eventId]) return { result:posted || err("The result is already posted") };
    return { game, key };
  };
  /* the current singer and their turn, or a refusal */
  const current = game => {
    const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
    return turn && !turn.closedAt ? { singer, turn } : { result:err(MOVED) };
  };
  /* the Durable Object's own writes: a TV's video report and the window's video check */
  const systemOnly = ctx => ctx?.isGm && ctx?.auto ? null : err("Commissioner only");
  /* a TV's report on the turn and video it played, or nothing (a no-op) */
  const reported = (state, { gameId, index, video }) => {
    const game = state.karaoke;
    if (!game?.id || game.id !== gameId || game.phase !== "turns" || index !== game.index || !karaokeLive(state)) return null;
    const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
    return turn && !turn.closedAt && (Number(turn.video) || 0) === video ? { game, singer, turn } : null;
  };

  const actions = {
    /* ── guests ── */
    /* The owner's profile song, through cleanKaraokeTrack; null clears it.
       The same song again changes nothing. In a pick window a song saved by
       a player here locks them in, in this same write, and saving a new
       song clears a failed video check. Presence is never needed: a guest
       picks from home weeks ahead. */
    karaokeSong(state, { track } = {}, ctx) {
      const player = ctx?.player;
      if (!player) return err("Check in first");
      if (!isActivePlayer(player, state)) return err("That player isn't on this weekend's roster");
      if (track === undefined) return err("Pick a song");
      const now = Date.now();
      let next = null;
      if (track !== null) {
        if (!track || typeof track !== "object" || Array.isArray(track)) return err(BAD_SONG);
        const checkedAt = Number(track.checkedAt);
        /* whether the song has synced lyrics is the server's to say (the
           Durable Object reads its own LRCLIB answer into ctx.karaokeLyrics),
           and the nudge the commissioner's: neither is taken from a phone */
        const { lyrics:claimed, lyricsOffset:nudged, ...asked } = track;
        next = cleanKaraokeTrack({ ...asked, at:now, checkedAt:checkedAt > 0 ? Math.min(checkedAt, now) : null }, { now });
        if (!next) return err(BAD_SONG);
      }
      const saved = karaokeTrackOf(state, player);
      if (next) {
        const known = ctx?.karaokeLyrics?.[next.trackId];
        if (typeof known === "boolean") next.lyrics = known;
        else if (saved?.trackId === next.trackId && typeof saved.lyrics === "boolean") next.lyrics = saved.lyrics;
        if (saved?.trackId === next.trackId && cleanLyricsOffset(saved.lyricsOffset)) next.lyricsOffset = cleanLyricsOffset(saved.lyricsOffset);
      }
      const same = next ? sameKaraokeTrack(saved, next) : !saved;
      const game = pickWindow(state);
      const broken = game && next ? brokenCode(next, game.bad?.[player]) : null;
      const lockIn = !!game && !!next && broken === null && !isAbsent(state, player) && !game.ready?.[player];
      const unready = !!game && !!game.ready?.[player] && (!next || broken !== null);
      const brokenMoves = !!game && (game.broken?.[player] ?? null) !== broken;
      if (same && !lockIn && !unready && !brokenMoves) return ok({ unchanged:true });
      if (!same) {
        const profile = { ...(state.profiles?.[player] || {}) };
        if (next) profile.karaokeTrack = next; else delete profile.karaokeTrack;
        state.profiles = { ...(state.profiles || {}), [player]:profile };
      }
      if (game) {
        game.broken = { ...(game.broken || {}) };
        if (broken !== null) game.broken[player] = broken; else delete game.broken[player];
        game.ready = { ...(game.ready || {}) };
        if (lockIn) game.ready[player] = now;
        if (unready) delete game.ready[player];
      }
      return ok(lockIn ? { ready:true } : undefined);
    },
    /* Keep: the song you have, locked in for the window */
    karaokeReady(state, { gameId } = {}, ctx) {
      const player = ctx?.player;
      if (!player) return err("Check in first");
      const game = pickWindow(state);
      if (!game || game.id !== gameId) return err("Song picks are closed");
      if (!isActivePlayer(player, state)) return err("That player isn't on this weekend's roster");
      if (isAbsent(state, player)) return absentError(state, player);
      if (game.ready?.[player]) return ok({ unchanged:true });
      if (!hasSong(state, game, player)) return err("Pick a song first");
      if (has(game.broken?.[player])) return err("Pick another song");
      game.ready = { ...(game.ready || {}), [player]:Date.now() };
      return ok();
    },
    /* A vote on the singer up now, by anyone here but them, while the vote
       is open. The same tier again changes nothing; another tier replaces
       it and keeps when it was first cast (a change never shows). A retried
       vote (the same device and action id) is acknowledged once. */
    karaokeVote(state, { gameId, singer, tier, index } = {}, ctx) {
      const voter = ctx?.player;
      if (!voter) return err("Check in first");
      const game = state.karaoke;
      const key = opKeyOf(ctx);
      if (seen(game, `v:${voter}`, key)) return ok({ unchanged:true });
      if (!game?.id || game.id !== gameId || game.phase !== "turns" || !karaokeLive(state)
          || (index !== undefined && index !== game.index) || !singer || singer !== karaokeSinger(game))
        return err("The vote is closed");
      if (singer === voter) return err("You can't vote for yourself");
      if (!isActivePlayer(voter, state)) return err("That player isn't on this weekend's roster");
      if (isAbsent(state, voter)) return absentError(state, voter);
      const value = Number(tier);
      if (!isKaraokeTier(value)) return err("Pick a tier");
      const turn = karaokeTurn(game, singer);
      const now = Date.now();
      if (!karaokeVoteOpen(turn, now))
        return err(karaokeStage(turn, now) === "up" ? "The song has not started" : "The vote is closed");
      const prior = game.votes?.[singer]?.[voter] || null;
      if (prior && Number(prior.tier) === value) return ok({ unchanged:true });
      game.votes = { ...(game.votes || {}), [singer]:{ ...(game.votes?.[singer] || {}),
        [voter]:{ tier:value, at:prior ? Number(prior.at) || now : now } } };
      remember(game, `v:${voter}`, key);
      return ok();
    },

    /* ── the commissioner and the autopilot ── */
    /* The pick window opens, run by Lock and start in the same write when
       the capability is on (ctx.karaoke), or by the pill's Start karaoke.
       Every check comes before the one write it makes. */
    karaokeStart(state, { evId } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "karaokeStart", { evId }, ctx); if (stale) return stale;
      if (!ctx.karaoke) return err("Karaoke is not set up");
      const ev = gameEvent(state, evId);
      if (!ev) return err("That game isn't on the schedule");
      if (state.karaoke?.id && state.karaoke.eventId === evId) return ok({ unchanged:true });
      if (state.results?.[evId]) return err("The result is already posted");
      if (karaokeLive(state)) return err("Finish the other karaoke game first");
      if (resolveEventLifecycle(state, ev).phase !== "in-progress") return err(`Lock and start ${ev.name} first`);
      if (!presentPlayers(state).length) return err("Nobody is here to sing");
      const now = Date.now();
      state.karaoke = newGame(evId, now, now);
      return ok({ game:state.karaoke.id });
    },
    /* a minute more to pick, three times at most */
    karaokeMoreTime(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeMoreTime", payload, ctx, ["pick"]); if (checked.result) return checked.result;
      const { game, key } = checked;
      if ((Number(game.moreTime) || 0) >= KARAOKE_MORE_TIME_MAX) return err("No more time");
      game.pickUntil = Math.max(Number(game.pickUntil) || 0, Date.now()) + KARAOKE_MORE_TIME_MS;
      game.moreTime = (Number(game.moreTime) || 0) + 1;
      remember(game, "gm", key);
      return ok({ pickUntil:game.pickUntil, moreTime:game.moreTime });
    },
    /* The window ends: the running order is drawn from everyone here with
       a song (seeded by the game id), each song is copied into the game
       (the window's video check promoting a working alternate), whoever has
       no song sits out with their backers' chips returned, and the first
       singer is up once the TV has dealt the order. Nobody with a song: the
       game is empty and the result is entered by hand. */
    karaokeEndPick(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeEndPick", payload, ctx, ["pick"]); if (checked.result) return checked.result;
      const { game, key } = checked;
      /* a sit-out's returned tickets move chips: never on a frozen board */
      if (state.frozen) return err("The board is frozen");
      const ev = gameEvent(state, game.eventId);
      if (!ev) return err("That game isn't on the schedule");
      const now = Date.now();
      const present = presentPlayers(state);
      const songs = {};
      for (const player of present) {
        const track = karaokeTrackOf(state, player);
        const song = track?.video ? promote(karaokeSnapshot(track), game.bad?.[player]) : game.songs?.[player] || null;
        /* an instrumental leads when the song has our lyrics, a karaoke upload when it has none */
        if (song) songs[player] = karaokeArrange(song, game.lyrics?.[song.trackId], game.upgrade?.[player]);
      }
      const singers = present.filter(player => songs[player]);
      const out = present.filter(player => !songs[player]);
      /* `broken` asked for another song during the window; from here a dead
         video is its turn's `failed` */
      Object.assign(game, { songs, order:karaokeOrder(singers, game.id), out, turns:{}, votes:{}, index:-1, broken:{} });
      remember(game, "gm", key);
      if (!singers.length) {
        Object.assign(game, { phase:"done", empty:true });
        return ok({ empty:true });
      }
      game.phase = "turns";
      upNext(state, game, 0, now + KARAOKE_ORDER_HOLD_MS, now);
      const returned = returnSitOuts(state, ev, out, now);
      return ok({ order:[...game.order], out:[...out], voidIds:returned.map(item => item.id), refunds:refundTotals(returned) });
    },
    /* the singer's song starts, a beat after this write lands on every TV
       (an absent singer is skipped instead) */
    karaokeStartSong(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeStartSong", payload, ctx, ["turns"], { turn:true }); if (checked.result) return checked.result;
      const { game, key } = checked;
      const { singer, turn, result } = current(game); if (result) return result;
      if (Number.isFinite(turn.songAt)) return ok({ unchanged:true });
      const now = Date.now();
      remember(game, "gm", key);
      if (isAbsent(state, singer)) {
        skipTurn(state, game, singer, turn, now);
        return ok({ skipped:singer });
      }
      game.turns = { ...game.turns, [singer]:{ ...turn, ...karaokeSchedule(game.songs?.[singer], now + KARAOKE_SONG_LEAD_MS, turn) } };
      return ok();
    },
    /* the song stops now; the vote stays open its grace */
    karaokeEndSong(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeEndSong", payload, ctx, ["turns"], { turn:true }); if (checked.result) return checked.result;
      const { game, key } = checked;
      const { singer, turn, result } = current(game); if (result) return result;
      if (!Number.isFinite(turn.songAt)) return err("Start the song first");
      const endAt = Math.max(Date.now(), turn.songAt);
      if (endAt >= Number(turn.endAt)) return ok({ unchanged:true });
      game.turns = { ...game.turns, [singer]:{ ...turn, endAt, cut:true, closeAt:endAt + KARAOKE_VOTE_GRACE_MS } };
      remember(game, "gm", key);
      return ok();
    },
    /* The song's next upload. Once the song has started it plays from the
       top a beat after this write (the votes so far stay); before, the
       walk-up simply shows the other upload. */
    karaokeNextVideo(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeNextVideo", payload, ctx, ["turns"], { turn:true }); if (checked.result) return checked.result;
      const { game, key } = checked;
      const { singer, turn, result } = current(game); if (result) return result;
      const song = game.songs?.[singer];
      const video = (Number(turn.video) || 0) + 1;
      if (!song?.alts?.[video - 1]) return err("No other video");
      const now = Date.now();
      const started = Number.isFinite(turn.songAt);
      if (started && now >= Number(turn.endAt)) return err("The song is over");
      game.turns = { ...game.turns, [singer]:started
        ? { ...turn, video, playedAt:null, failed:null, cut:false, ...karaokeSchedule(song, now + KARAOKE_SONG_LEAD_MS, { video }) }
        : { ...turn, video, failed:null } };
      remember(game, "gm", key);
      return ok({ video });
    },
    /* the singer up goes to the end of the order, once, before their song */
    karaokeLater(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeLater", payload, ctx, ["turns"], { turn:true }); if (checked.result) return checked.result;
      const { game, key } = checked;
      const { singer, turn, result } = current(game); if (result) return result;
      const name = disp(state, singer);
      if (Number.isFinite(turn.songAt)) return err("The song has started");
      if (turn.later) return err(`${name} already moved to the end`);
      if (game.order.length <= game.index + 1) return err(`Nobody is after ${name}`);
      const now = Date.now();
      game.order = [...game.order.slice(0, game.index), ...game.order.slice(game.index + 1), singer];
      game.turns = { ...game.turns, [singer]:{ ...turn, later:true } };
      remember(game, "gm", key);
      upNext(state, game, game.index, now, now);
      return ok({ up:karaokeSinger(game) });
    },
    /* the singer up sits this one out: no score, their votes discarded */
    karaokeSkip(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeSkip", payload, ctx, ["turns"], { turn:true }); if (checked.result) return checked.result;
      const { game, key } = checked;
      const { singer, turn, result } = current(game); if (result) return result;
      remember(game, "gm", key);
      skipTurn(state, game, singer, turn, Date.now());
      return ok({ skipped:singer });
    },
    /* The vote closes (a quarter Legendary rains on the TV first), and the
       next singer here is up; after the last, the reveal. */
    karaokeNext(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeNext", payload, ctx, ["turns"], { turn:true }); if (checked.result) return checked.result;
      const { game, key } = checked;
      const { singer, turn, result } = current(game); if (result) return result;
      if (!Number.isFinite(turn.songAt)) return err("Start the song first");
      const now = Date.now();
      const legendary = karaokeLegendary(game.votes?.[singer]);
      game.turns = { ...game.turns, [singer]:{ ...turn, closedAt:now, legendary } };
      remember(game, "gm", key);
      upNext(state, game, game.index + 1, now + (legendary ? KARAOKE_LEGENDARY_MS : 0), now);
      return ok({ legendary, ...(game.phase === "reveal" ? { reveal:true } : {}) });
    },
    /* The ranking posts the event's result through the ordinary result
       write (one player a place), so payouts, bets and the win song follow;
       then every per-voter vote is deleted. A result cleared later posts
       again from the stored ranking. */
    karaokeFinish(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeFinish", payload, ctx, ["reveal", "done"], { posted:ok({ unchanged:true }) });
      if (checked.result) return checked.result;
      const { game, key } = checked;
      const ev = gameEvent(state, game.eventId);
      if (!ev) return err("That game isn't on the schedule");
      if (game.empty) return err("Nobody sang");
      const slots = karaokeResultSlots(game.ranking);
      if (!slots.length) return err("Nobody voted");
      if (resolveEventLifecycle(state, ev).phase === "in-progress") {
        const entered = run("beginResultEntry", state, { evId:ev.id }, ctx);
        if (!entered.ok) return entered;
      }
      const posted = run("saveResult", state, { evId:ev.id, slots }, ctx);
      if (!posted.ok) return posted;
      game.phase = "done";
      game.finishedAt = Date.now();
      game.votes = {};
      game.ops = Object.fromEntries(Object.entries(game.ops || {}).filter(([scope]) => !scope.startsWith("v:")));
      remember(game, "gm", key);
      return ok({ slots, ...(posted.extra || {}) });
    },
    /* A fresh pick window under a new id: every vote and lock-in goes (the
       video check's findings stay). Refused once the result is posted. */
    karaokeRestart(state, payload = {}, ctx) {
      const checked = beatFor(state, "karaokeRestart", payload, ctx, ["pick", "turns", "reveal", "done"],
        { posted:err("Clear the result first") });
      if (checked.result) return checked.result;
      const { game, key } = checked;
      if (payload.confirm !== true) return err("Confirm the restart", { needsConfirm:true });
      const now = Date.now();
      /* the same millisecond as the game it replaces still gets a new id */
      let startedAt = now;
      while (karaokeGameId(game.eventId, startedAt) === game.id) startedAt += 1;
      const next = newGame(game.eventId, startedAt, now);
      if (game.bad) {
        next.bad = game.bad;
        for (const player of presentPlayers(state)) {
          const code = brokenCode(karaokeTrackOf(state, player), game.bad[player]);
          if (code !== null) next.broken[player] = code;
        }
      }
      next.ops = { gm:[...(game.ops?.gm || [])] };
      remember(next, "gm", key);
      state.karaoke = next;
      return ok({ game:next.id });
    },

    /* ── the Durable Object's own writes (an auto commissioner context) ── */
    /* A TV saw the song start: its first report for the turn and video
       stamps playedAt, and a late start (an ad, a slow load) moves the
       song's end and the vote's close by the delay, never earlier, at most
       KARAOKE_LATE_MAX_MS. */
    karaokeTvPlaying(state, { gameId, index, video, playingAt } = {}, ctx) {
      const g = systemOnly(ctx); if (g) return g;
      const found = reported(state, { gameId, index, video });
      if (!found) return ok({ unchanged:true, stale:true });
      const { game, singer, turn } = found;
      if (!Number.isFinite(turn.songAt) || turn.cut || has(turn.failed) || Number.isFinite(turn.playedAt)) return ok({ unchanged:true });
      const at = Number(playingAt);
      if (playingAt === null || playingAt === undefined || !Number.isFinite(at)) return err("When did it play?");
      const playedAt = Math.min(Math.max(at, turn.songAt), Math.max(Date.now(), turn.songAt));
      const late = playedAt - turn.songAt;
      const shift = late > KARAOKE_LATE_MIN_MS ? Math.min(late, KARAOKE_LATE_MAX_MS) : 0;
      game.turns = { ...game.turns, [singer]:{ ...turn, playedAt,
        ...(shift ? { endAt:Number(turn.endAt) + shift, closeAt:Number(turn.closeAt) + shift } : {}) } };
      return ok({ shift });
    },
    /* A TV could not play the video: the next alternate (from the top, as
       Next video does, once the song has started); none left, the turn
       fails with the code and the TV shows the lit card for the song's
       length while the vote goes on. */
    karaokeTvError(state, { gameId, index, video, code } = {}, ctx) {
      const g = systemOnly(ctx); if (g) return g;
      const found = reported(state, { gameId, index, video });
      if (!found) return ok({ unchanged:true, stale:true });
      const { game, singer, turn } = found;
      const now = Date.now();
      const started = Number.isFinite(turn.songAt);
      if (has(turn.failed) || (started && now >= Number(turn.endAt))) return ok({ unchanged:true });
      const failure = Number(code);
      if (!isCode(failure)) return err("Unknown video error");
      const song = game.songs?.[singer];
      const next = (Number(turn.video) || 0) + 1;
      if (song?.alts?.[next - 1]) {
        game.turns = { ...game.turns, [singer]:started
          ? { ...turn, video:next, playedAt:null, cut:false, ...karaokeSchedule(song, now + KARAOKE_SONG_LEAD_MS, { video:next }) }
          : { ...turn, video:next } };
        return ok({ video:next });
      }
      game.turns = { ...game.turns, [singer]:{ ...turn, failed:failure } };
      return ok({ failed:failure });
    },
    /* The window's video check: { [player]: { [videoId]: code } } for the
       videos that failed (or a player's one code for all of theirs). A song
       left with no working video asks its owner for another (`broken`,
       which also undoes their lock-in); one with a working alternate gets
       it promoted at the order draw. */
    karaokePreflight(state, { gameId, bad } = {}, ctx) {
      const g = systemOnly(ctx); if (g) return g;
      const game = pickWindow(state);
      if (!game || game.id !== gameId) return ok({ unchanged:true, stale:true });
      if (!bad || typeof bad !== "object" || Array.isArray(bad)) return err("Nothing was checked");
      const found = { ...(game.bad || {}) };
      let changed = false;
      for (const [player, value] of Object.entries(bad)) {
        if (!isActivePlayer(player, state)) continue;
        const entry = { ...(found[player] || {}) };
        for (const [id, failure] of Object.entries(checkedVideos(state, player, value))) {
          if (entry[id] === failure) continue;
          entry[id] = failure;
          changed = true;
        }
        if (Object.keys(entry).length) found[player] = entry;
      }
      if (!changed) return ok({ unchanged:true });
      game.bad = found;
      game.broken = { ...(game.broken || {}) };
      game.ready = { ...(game.ready || {}) };
      for (const player of Object.keys(found)) {
        const code = brokenCode(karaokeTrackOf(state, player), found[player]);
        if (code === null) { delete game.broken[player]; continue; }
        game.broken[player] = code;
        delete game.ready[player];
      }
      return ok({ broken:Object.keys(game.broken) });
    },

    /* The game's lyrics, from the Durable Object (worker/tournament.js
       fillKaraokeLyrics): { [player]: { trackId, lines?, upgrade? } } for
       the songs karaokeLyricsWanted named. `lines` are LRCLIB's synced
       lyrics (null or false: none found), kept by track id; `upgrade` an
       instrumental found for a song saved before they were offered (null:
       none). An entry for a song its player has since changed is dropped.
       From the order draw, every song not yet started is arranged anew
       (karaokeArrange): an instrumental first with lyrics, a karaoke upload
       first without. Server only: frames carry the current singer's lines
       alone (projectKaraoke). */
    karaokeLyrics(state, { gameId, songs } = {}, ctx) {
      const g = systemOnly(ctx); if (g) return g;
      const game = state.karaoke;
      if (!game?.id || game.id !== gameId || !["pick", "turns"].includes(game.phase) || !karaokeLive(state))
        return ok({ unchanged:true, stale:true });
      if (!songs || typeof songs !== "object" || Array.isArray(songs)) return err("Nothing was looked up");
      const lyrics = { ...(game.lyrics || {}) }, upgrade = { ...(game.upgrade || {}) };
      let changed = false;
      for (const [player, entry] of Object.entries(songs).slice(0, 40)) {
        if (!isActivePlayer(player, state) || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const song = game.phase === "pick" ? karaokeTrackOf(state, player) : game.songs?.[player];
        if (!song?.trackId || song.trackId !== entry.trackId) continue;
        if (Object.hasOwn(entry, "lines")) {
          const lines = Array.isArray(entry.lines) ? cleanLyrics(entry.lines) || false : false;
          if (JSON.stringify(lyrics[song.trackId]) !== JSON.stringify(lines)) { lyrics[song.trackId] = lines; changed = true; }
        }
        if (Object.hasOwn(entry, "upgrade")) {
          const video = entry.upgrade ? cleanKaraokeVideo(entry.upgrade) : null;
          const next = { trackId:song.trackId, video:video && karaokeVideoKind(video, song.name) === "instrumental" ? video : null };
          if (JSON.stringify(upgrade[player]) !== JSON.stringify(next)) { upgrade[player] = next; changed = true; }
        }
      }
      if (!changed) return ok({ unchanged:true });
      game.lyrics = lyrics;
      game.upgrade = upgrade;
      if (game.phase === "turns") {
        for (const player of game.order || []) {
          const turn = game.turns?.[player], song = game.songs?.[player];
          /* a started, closed or skipped song stays as it is, and so does one
             the commissioner or a TV already moved to another upload */
          if (!song || turn?.closedAt || turn?.skipped || Number.isFinite(turn?.songAt) || (Number(turn?.video) || 0) !== 0) continue;
          const arranged = karaokeArrange(song, lyrics[song.trackId], upgrade[player]);
          if (arranged !== song) game.songs = { ...game.songs, [player]:arranged };
        }
      }
      return ok();
    },
    /* The commissioner's nudge on a song's lyrics (the Karaoke desk's
       Lyrics earlier / later): `offsetMs` the song's whole offset, a
       multiple of LYRICS_NUDGE_STEP_MS within LYRICS_NUDGE_MAX_MS, positive
       showing the words earlier. Written on the player's profile song
       (configuration, kept by a reset) and on the game's copy, so the TV
       and the phones follow it at once. The same offset again changes
       nothing; `trackId` names the song, so a song changed since is not
       nudged. */
    karaokeNudge(state, { player, trackId, offsetMs } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!isActivePlayer(player, state)) return err("That player isn't on this weekend's roster");
      const ms = Number(offsetMs);
      if (!Number.isFinite(ms)) return err("Pick a nudge");
      const offset = cleanLyricsOffset(ms);
      const profile = karaokeTrackOf(state, player);
      const copy = state.karaoke?.id ? state.karaoke.songs?.[player] : null;
      const mine = song => !!song && typeof trackId === "string" && song.trackId === trackId;
      if (!mine(profile) && !mine(copy)) return err("That song changed. Look again");
      const nudged = song => {
        const next = { ...song };
        if (offset) next.lyricsOffset = offset; else delete next.lyricsOffset;
        return next;
      };
      const moves = [mine(profile) && cleanLyricsOffset(profile.lyricsOffset) !== offset,
        mine(copy) && cleanLyricsOffset(copy.lyricsOffset) !== offset];
      if (!moves.some(Boolean)) return ok({ unchanged:true, offset });
      if (moves[0]) state.profiles = { ...state.profiles, [player]:{ ...state.profiles[player], karaokeTrack:nudged(profile) } };
      if (moves[1]) state.karaoke.songs = { ...state.karaoke.songs, [player]:nudged(copy) };
      return ok({ offset });
    },

    /* ── QA (commissioner and the qa capability) ── */
    /* Everyone here with no song gets a practice song in the game only
       (never a profile), and everyone here with a song locks in. */
    karaokeSimSongs(state, { gameId } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!ctx.qa) return err("QA is unavailable");
      const game = pickWindow(state);
      if (!game || (gameId !== undefined && game.id !== gameId)) return err("Song picks are closed");
      const roster = rosterOf(state);
      const now = Date.now();
      let songs = 0, ready = 0;
      for (const player of presentPlayers(state)) {
        if (!hasSong(state, game, player)) {
          const practice = KARAOKE_PRACTICE_SONGS[Math.max(0, roster.indexOf(player)) % KARAOKE_PRACTICE_SONGS.length];
          game.songs = { ...(game.songs || {}), [player]:karaokeSnapshot(practice) };
          songs += 1;
        }
        if (!game.ready?.[player] && !has(game.broken?.[player])) {
          game.ready = { ...(game.ready || {}), [player]:now };
          ready += 1;
        }
      }
      return songs || ready ? ok({ songs, ready }) : err("Everyone is locked in");
    },
    /* Everyone here who has not voted on the singer votes, through the real
       vote write: a tier seeded from the game, the voter and the singer. */
    karaokeSimVotes(state, { gameId, index } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!ctx.qa) return err("QA is unavailable");
      const game = state.karaoke;
      if (!game?.id || game.phase !== "turns" || !karaokeLive(state) || (gameId !== undefined && game.id !== gameId)
          || (index !== undefined && index !== game.index)) return err("The vote is closed");
      const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
      if (!karaokeVoteOpen(turn, Date.now())) return err("The vote is closed");
      const lift = karaokeSeed(`${game.id}${singer}`) % 3 - 1;
      let voted = 0;
      for (const voter of karaokeVoters(state, singer)) {
        if (game.votes?.[singer]?.[voter]) continue;
        const tier = Math.min(KARAOKE_TIERS.length, Math.max(1,
          SIM_TIERS[karaokeSeed(game.id + voter + singer) % SIM_TIERS.length] + lift));
        if (actions.karaokeVote(state, { gameId:game.id, singer, tier }, { isGm:false, player:voter, deviceId:null, actionId:null }).ok)
          voted += 1;
      }
      return voted ? ok({ voted }) : err("Everyone has voted");
    },
    /* A simulated player's own pick in the window (shared/qaSim.js, "Sim
       players" only, never a phone): a practice song in the game only
       (never a profile), `k` choosing which, and locked in. */
    karaokeSimSong(state, { gameId, k } = {}, ctx) {
      if (!ctx?.sim || !ctx.qa || ctx.isGm) return err("QA is unavailable");
      const player = ctx.player;
      if (!player || !isActivePlayer(player, state)) return err("Check in first");
      const game = pickWindow(state);
      if (!game || game.id !== gameId) return err("Song picks are closed");
      if (isAbsent(state, player)) return absentError(state, player);
      const practice = KARAOKE_PRACTICE_SONGS[Math.abs(Math.floor(Number(k) || 0)) % KARAOKE_PRACTICE_SONGS.length];
      if (game.ready?.[player] && game.songs?.[player]?.trackId === practice.trackId) return ok({ unchanged:true });
      game.songs = { ...(game.songs || {}), [player]:karaokeSnapshot(practice) };
      game.ready = { ...(game.ready || {}), [player]:Date.now() };
      if (game.broken?.[player] !== undefined) {
        game.broken = { ...game.broken };
        delete game.broken[player];
      }
      return ok({ ready:true });
    },
  };
  return actions;
}
