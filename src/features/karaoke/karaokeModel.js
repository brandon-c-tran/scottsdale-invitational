/* Karaoke on a phone, as data (docs/KARAOKE.md is the contract; every
   number here comes from shared/karaoke.js, never re-derived). Pure: the
   view reads the frame this viewer was sent (projectKaraoke) and `now` is
   the server clock.

   A song shows only for a turn up to the current one, or your own, never
   because the frame happens to carry it (the commissioner's frame
   included). Nobody's vote but your own is ever read. */
import { allEventsOf, disp, isAbsent, isActivePlayer, presentPlayers, resolveEventLifecycle } from "../../../shared/core.js";
import {
  KARAOKE_LEGENDARY_MS, KARAOKE_MORE_TIME_MAX, KARAOKE_TIERS, KARAOKE_UP_MS, hasKaraokeSong, karaokeAutoBeat,
  karaokeGame, karaokeInstants, karaokeLive, karaokeNextSinger, karaokeRevealAt, karaokeScoreText, karaokeSinger,
  karaokeSongWay, karaokeStage, karaokeTierOf, karaokeTrackOf, karaokeTurn, karaokeTurnWay, karaokeVoteOpen, karaokeVoters,
  karaokeVotesOn, KARAOKE_RESTART_CONFIRM, karaokeSkipConfirm,
} from "../../../shared/karaoke.js";

export const ordinal = n => {
  const k = n % 100;
  return `${n}${k >= 11 && k <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
};
export const tierOf = value => KARAOKE_TIERS[Number(value) - 1] || null;
/* a tier's paint: its insert and the ink lettered on it (Legendary's
   gold takes the dark ink) */
export const tierPaint = tier => !tier ? null : {
  color:`var(--tier-${tier.value})`,
  ink:tier.value === KARAOKE_TIERS.length ? `var(--tier-${tier.value}-ink)` : "var(--tier-ink)",
};
/* a window's time left as the phone letters it: 1:42, then 18 under a minute */
export function clockText(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : String(seconds);
}

/* your own vote on a singer: the frame's `mine`, or (a frame that was not
   projected) your own entry in the votes; never anyone else's */
export function myVoteOf(game, singer, me) {
  if (!game || !singer || !me) return null;
  const mine = Number(game.mine?.[singer]);
  if (mine >= 1) return mine;
  const raw = Number(game.votes?.[singer]?.[me]?.tier);
  return raw >= 1 ? raw : null;
}

/* the turns whose songs are public: none in the pick window, every turn up
   to the current one while singing, all of them from the reveal on */
const shownThrough = game => game.phase === "pick" ? -1
  : game.phase === "turns" ? (Number.isInteger(game.index) ? game.index : -1)
    : (game.order || []).length - 1;
/* a player's song as this viewer may see it: your own always (in the pick
   window, the song your profile holds), anyone else's once they are up */
export function karaokeSongFor(state, game, player, me) {
  if (!game || !player) return null;
  if (player === me) return game.phase === "pick" ? karaokeTrackOf(state, me) : game.songs?.[me] || null;
  const at = (game.order || []).indexOf(player);
  return at >= 0 && at <= shownThrough(game) ? game.songs?.[player] || null : null;
}

/* Everything one phone needs at `now`, or null without a game. */
export function karaokeView(state, me = null, now = Date.now()) {
  const game = state?.karaoke;
  if (!game?.id) return null;
  const finished = !karaokeLive(state) || !!game.empty;
  const present = presentPlayers(state);
  const active = !!me && isActivePlayer(me, state);
  const here = active && present.includes(me);
  const order = Array.isArray(game.order) ? game.order : [];
  const index = Number.isInteger(game.index) ? game.index : -1;
  const songOf = player => karaokeSongFor(state, game, player, me);
  const view = { game, me, phase:game.phase, finished, here, active, present, order, index, songOf,
    n:index + 1, total:order.length };

  /* the pick window */
  const pickUntil = Number(game.pickUntil) || 0;
  const pickFrom = Number(game.startedAt) || pickUntil;
  const room = present.map(player => ({ player, ready:!!game.ready?.[player], mine:player === me }));
  Object.assign(view, {
    pickFrom, pickUntil, pickLeft:pickUntil - now, room,
    readyCount:room.filter(lane => lane.ready).length, roomCount:room.length,
    myReady:!!me && !!game.ready?.[me], broken:!!me && game.broken?.[me] !== undefined && game.broken?.[me] !== null,
    mySong:songOf(me),
  });
  /* how your own song will play: its video, or the lit card */
  view.myWay = view.mySong ? karaokeSongWay(view.mySong) : null;

  /* the turn on stage */
  const singer = karaokeSinger(game);
  const turn = karaokeTurn(game, singer);
  const stage = karaokeStage(turn, now);
  const voters = singer ? karaokeVoters(state, singer) : [];
  const votes = singer ? karaokeVotesOn(game, singer) : {};
  const upAt = Number(turn?.upAt) || 0;
  const started = Number.isFinite(turn?.songAt);
  const endAt = Number(turn?.endAt) || 0;
  const votedAt = me ? Number(votes[me]?.at) || 0 : 0;
  Object.assign(view, {
    singer, turn, stage, singerSong:songOf(singer), upAt, walkUntil:upAt + KARAOKE_UP_MS,
    songAt:started ? turn.songAt : null, endAt, closeAt:Number(turn?.closeAt) || 0,
    voters, voterRoom:voters.map(player => ({ player, voted:!!votes[player], mine:player === me })),
    votedCount:voters.filter(player => votes[player]).length,
    amVoter:here && !!singer && singer !== me && voters.includes(me),
    myVote:myVoteOf(game, singer, me),
    /* when your vote on this turn was first cast (a change keeps it) */
    votedBeforeEnd:votedAt > 0 && votedAt < endAt,
    /* the vote reads closed at its close; the server still takes a tap
       already in the air for a moment after (KARAOKE_VOTE_LATE_MS) */
    voteOpen:!!turn && karaokeVoteOpen(turn, now) && now < Number(turn.closeAt),
    nextSinger:karaokeNextSinger(state, game),
  });
  /* how the turn on now plays: its video (the words on it), or the lit card */
  view.way = turn ? karaokeTurnWay(game, singer, turn) : null;

  /* your own turn, closed Legendary: the stamp holds while the TV rains it */
  const myTurn = me ? game.turns?.[me] || null : null;
  const legendaryAt = myTurn?.legendary && myTurn.closedAt && !myTurn.skipped ? Number(myTurn.closedAt) : 0;
  view.legendaryAt = legendaryAt;
  view.legendary = !finished && legendaryAt > 0 && singer !== me && now >= legendaryAt && now < legendaryAt + KARAOKE_LEGENDARY_MS;
  view.myIndex = me ? order.indexOf(me) : -1;

  /* the reveal: each row on screen from its instant on the TV, never before */
  const revealed = game.phase === "reveal" || game.phase === "done";
  view.revealAt = Number(game.revealAt) || 0;
  view.rows = revealed ? (game.ranking || []).map(row => {
    const at = karaokeRevealAt(game, row.player);
    const tier = karaokeTierOf(row.score);
    return { ...row, at, shown:game.phase === "done" || (at !== null && now >= at), mine:row.player === me,
      tier, scoreText:karaokeScoreText(row.score), song:songOf(row.player) };
  }) : [];
  view.myRow = view.rows.find(row => row.mine) || null;
  return view;
}

/* What the sheet shows: pick, pick-locked, pick-watch (not playing), up
   (the singer's walk-up), up-watch (everyone else's walk-up, and the song
   for anyone without a vote), singing (the singer's song and its vote),
   vote, vote-closing (the song is over, the vote still open), vote-closed,
   legendary (the singer's own), reveal, done; null: nothing to show. */
export function karaokeScreen(view) {
  if (!view || view.finished) return null;
  if (view.legendary) return "legendary";
  if (view.phase === "pick") return !view.here ? "pick-watch" : view.myReady ? "pick-locked" : "pick";
  if (view.phase === "turns") {
    if (!view.singer || !view.turn) return null;
    if (view.singer === view.me) return view.stage === "up" ? "up" : "singing";
    if (view.stage === "up" || !view.amVoter) return "up-watch";
    if (view.stage === "singing") return "vote";
    if (view.stage === "voting") return view.voteOpen ? "vote-closing" : "vote-closed";
    return "vote-closed";
  }
  if (view.phase === "reveal") return "reveal";
  if (view.phase === "done") return "done";
  return null;
}

/* When this phone opens by itself (null: it does not; an open sheet still
   follows the game). Present players only: the pick window; the singer's
   own turn (one key from the walk-up to the vote's close); a voter's vote
   from the song's start, and once more from its end for whoever had not
   voted by then (a vote cast after the end keeps that key, so voting never
   closes the sheet); the singer's Legendary; the reveal (the game's end
   folded into it). The vote never opens for its singer, and nothing opens
   for the absent. */
export function karaokeOpenKey(view, now) {
  if (!view || view.finished || !view.here) return null;
  const { game } = view;
  if (view.legendary) return `legendary:${game.id}:${view.myIndex}:${view.me}`;
  if (view.phase === "pick") return `pick:${game.id}`;
  if (view.phase === "turns") {
    if (!view.singer || !view.turn) return null;
    if (view.singer === view.me) return `turn:${game.id}:${view.index}:${view.me}`;
    if (!view.amVoter || view.songAt === null || now < view.songAt || view.turn.closedAt || view.turn.skipped) return null;
    const tag = `${game.id}:${view.index}:${view.singer}`;
    return now >= view.endAt && !view.votedBeforeEnd ? `vote-end:${tag}` : `vote:${tag}`;
  }
  if (view.phase === "reveal" || view.phase === "done") return `reveal:${game.id}`;
  return null;
}

/* the next instant this phone's screens change by themselves */
export const nextKaraokeInstant = (game, now) => karaokeInstants(game).find(at => at > now) || 0;

/* ── the singer's own "You’re up" takeover (features/moments) ── */
/* while it is your walk-up: one key per turn, gone once your song starts
   or Later moves you */
export function singerUpKey(state, me) {
  const game = state?.karaoke;
  if (!me || !game?.id || game.phase !== "turns" || !karaokeLive(state)) return null;
  const turn = karaokeTurn(game, karaokeSinger(game));
  if (karaokeSinger(game) !== me || !turn || turn.closedAt || turn.skipped || Number.isFinite(turn.songAt)) return null;
  return `karaoke:${game.id}:${game.index}:${me}`;
}
/* what the takeover shows: your song, from the walk-up's start (after a
   Legendary rain it waits for it) */
export function singerUpMoment(state, me) {
  const key = singerUpKey(state, me);
  if (!key) return null;
  const game = state.karaoke, turn = karaokeTurn(game, me);
  return { key, player:me, anchor:Number(turn.upAt) || 0, song:karaokeSongFor(state, game, me, me) };
}

/* ── Home ── */
/* the karaoke event still to come, for a guest who has no song yet (the
   setup list is gone once the weekend is live); `karaoke`: the capability */
export function karaokeSongAhead(state, me, { karaoke = false } = {}) {
  if (!karaoke || !state?.live || state.frozen || !me || !isActivePlayer(me, state) || hasKaraokeSong(state, me)) return null;
  const ev = allEventsOf(state).find(item => item.game === "karaoke" && !state.results?.[item.id] && !state.shelved?.[item.id]);
  if (!ev || karaokeGame(state, ev.id)) return null;
  return ["result-entry", "complete", "shelved"].includes(resolveEventLifecycle(state, ev).phase) ? null : ev;
}

/* Home's row while a game runs: what it wants of you, or where the room is */
export function karaokeHomeLine(state, view) {
  if (!view || view.finished) return null;
  if (view.phase === "pick") {
    if (!view.here) return { strong:`${view.readyCount} of ${view.roomCount} locked in` };
    return view.myReady ? { strong:"Locked in" } : { strong:"Pick your song", until:view.pickUntil };
  }
  if (view.phase === "turns") {
    if (!view.singer || !view.turn) return null;
    if (view.singer === view.me) return { strong:view.stage === "up" ? "You’re up" : "Singing" };
    const name = disp(state, view.singer);
    if (view.stage === "up") return { strong:`Up next: ${name}` };
    const tier = view.amVoter ? tierOf(view.myVote) : null;
    return { strong:name, em:tier ? tier.name : view.amVoter && view.voteOpen ? "Vote" : "", tier };
  }
  if (view.phase === "reveal" || view.phase === "done") return { strong:"Results" };
  return null;
}

/* Home's headline while a game runs (homeModel deriveYouStrip), read from
   the frame alone: null with no game; an empty word when the game runs but
   asks nothing of you (the generic "You’re up" must not speak for a whole
   room). The vote counts as open from the song's write: Home is not woken
   on the song's first second, and the sheet it opens waits for it. */
export function karaokeYou(state, me) {
  const game = state?.karaoke;
  if (!game?.id || !karaokeLive(state) || game.empty) return null;
  if (!me || !isActivePlayer(me, state) || isAbsent(state, me)) return { word:"" };
  if (game.phase === "pick") return game.ready?.[me] ? { word:"Locked in", tone:"info" }
    : { word:"Pick your song", tone:"you", flash:true };
  if (game.phase === "turns") {
    const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
    if (!singer || !turn) return { word:"" };
    const started = Number.isFinite(turn.songAt);
    if (singer === me) return started ? { word:"Singing", tone:"live" } : { word:"You’re up", tone:"live", up:true, flash:true };
    const open = started && !turn.closedAt && !turn.skipped;
    if (open && !myVoteOf(game, singer, me)) return { word:"Vote", line:disp(state, singer), tone:"live", flash:true };
    if (started && karaokeNextSinger(state, game) === me) return { word:"Up next", tone:"info" };
    return { word:"" };
  }
  if (game.phase === "reveal") return { word:"Results", tone:"info" };
  return { word:"" };
}

/* ── the commissioner's tray in the sheet's header (the sheet covers his
   pill): the pill's beat first, then its tray, the same writes with the
   same labels (shared/karaoke.js karaokeBeat on the pill) ── */
const BEAT_LABEL = Object.freeze({ karaokeEndPick:"Start singing", karaokeStartSong:"Start song", karaokeNext:"Close vote",
  karaokeFinish:"Post result" });
export function karaokeTray(state, view, now) {
  if (!view || view.finished) return [];
  const { game } = view;
  const items = [];
  const beat = karaokeAutoBeat(state);
  if (beat && BEAT_LABEL[beat.type] && !(beat.type === "karaokeFinish" && !(game.ranking || []).some(row => row.count > 0)))
    items.push({ id:"beat", label:BEAT_LABEL[beat.type], type:beat.type, payload:beat.payload });
  const restart = { id:"restart", label:"Restart", type:"karaokeRestart", payload:{ gameId:game.id, confirm:true }, edge:true,
    confirm:KARAOKE_RESTART_CONFIRM };
  if (view.phase === "pick") {
    if ((Number(game.moreTime) || 0) < KARAOKE_MORE_TIME_MAX)
      items.push({ id:"more", label:"More time", type:"karaokeMoreTime", payload:{ gameId:game.id } });
    items.push(restart);
    return items;
  }
  if (view.phase !== "turns" || !view.singer || !view.turn || view.turn.closedAt) return items;
  const turn = view.turn, at = { gameId:game.id, index:view.index };
  const started = Number.isFinite(turn.songAt);
  const nextVideo = game.songs?.[view.singer]?.alts?.[Number(turn.video) || 0]
    ? { id:"video", label:"Next video", type:"karaokeNextVideo", payload:at } : null;
  if (!started) {
    if (!turn.later && view.order.length > view.index + 1) items.push({ id:"later", label:"Later", type:"karaokeLater", payload:at });
    if (nextVideo) items.push(nextVideo);
  } else if (now < Number(turn.endAt)) {
    if (!turn.cut) items.push({ id:"end", label:"End song", type:"karaokeEndSong", payload:at });
    if (nextVideo) items.push(nextVideo);
  }
  items.push({ id:"skip", label:`Skip ${disp(state, view.singer)}`, type:"karaokeSkip", payload:at, edge:true,
    confirm:karaokeSkipConfirm(disp(state, view.singer)) });
  /* a restart throws away every vote: offered only until someone has sung */
  if (!view.order.some(player => game.turns?.[player]?.closedAt && !game.turns[player].skipped)) items.push(restart);
  return items;
}
