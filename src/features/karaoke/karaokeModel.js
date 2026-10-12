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
  karaokeGame, karaokeInstants, karaokeLive, karaokeRevealAt, karaokeScoreText, karaokeSinger, karaokeStage, karaokeTierOf,
  karaokeTrackOf, karaokeTurn, karaokeVoteOpen, karaokeVoters, karaokeVotesOn,
} from "../../../shared/karaoke.js";

export const ordinal = n => {
  const k = n % 100;
  return `${n}${k >= 11 && k <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
};
export const tierOf = value => KARAOKE_TIERS[Number(value) - 1] || null;

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

/* the next singer still to come after the current turn (an absent singer
   is skipped when their turn comes) */
export function nextSingerOf(state, game) {
  if (game?.phase !== "turns") return null;
  const index = Number.isInteger(game.index) ? game.index : -1;
  return (game.order || []).find((player, k) => k > index && isActivePlayer(player, state) && !isAbsent(state, player)) || null;
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
  const view = { game, me, phase:game.phase, finished, here, active, present, order, index, songOf };

  /* the pick window */
  const pickUntil = Number(game.pickUntil) || 0;
  const pickFrom = Number(game.startedAt) || pickUntil;
  const room = present.map(player => ({ player, ready:!!game.ready?.[player], mine:player === me }));
  Object.assign(view, {
    pickFrom, pickUntil, pickLeft:pickUntil - now, room,
    readyCount:room.filter(lane => lane.ready).length, roomCount:room.length,
    myReady:!!me && !!game.ready?.[me], broken:!!me && !!game.broken?.[me], mySong:songOf(me),
  });

  /* the turn on stage */
  const singer = karaokeSinger(game);
  const turn = karaokeTurn(game, singer);
  const stage = karaokeStage(turn, now);
  const voters = singer ? karaokeVoters(state, singer) : [];
  const votes = singer ? karaokeVotesOn(game, singer) : {};
  const upAt = Number(turn?.upAt) || 0;
  const started = Number.isFinite(turn?.songAt);
  Object.assign(view, {
    singer, turn, stage, singerSong:songOf(singer), upAt, upUntil:started ? turn.songAt : upAt + KARAOKE_UP_MS,
    songAt:started ? turn.songAt : null, endAt:Number(turn?.endAt) || 0, closeAt:Number(turn?.closeAt) || 0,
    voters, voterRoom:voters.map(player => ({ player, voted:!!votes[player], mine:player === me })),
    votedCount:voters.filter(player => votes[player]).length,
    amVoter:here && !!singer && singer !== me && voters.includes(me),
    myVote:myVoteOf(game, singer, me),
    /* the vote reads closed at its close; the server still takes a tap
       already in the air for a moment after (KARAOKE_VOTE_LATE_MS) */
    voteOpen:!!turn && karaokeVoteOpen(turn, now) && now < Number(turn.closeAt),
    nextSinger:nextSingerOf(state, game),
  });

  /* your own turn, closed Legendary: the stamp holds while the TV rains it */
  const myTurn = me ? game.turns?.[me] || null : null;
  const legendaryAt = myTurn?.legendary && myTurn.closedAt ? Number(myTurn.closedAt) : 0;
  view.legendaryAt = legendaryAt;
  view.legendary = !finished && legendaryAt > 0 && singer !== me && now >= legendaryAt && now < legendaryAt + KARAOKE_LEGENDARY_MS;
  view.myIndex = me ? order.indexOf(me) : -1;

  /* the reveal: each row on screen from its instant on the TV, never before */
  const revealed = game.phase === "reveal" || game.phase === "done";
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
   from the song's start, and once more at its end if they have not voted;
   the singer's Legendary; the reveal (the game's end folded into it). The
   vote never opens for its singer, and nothing opens for the absent. */
export function karaokeOpenKey(view, now) {
  if (!view || view.finished || !view.here) return null;
  const { game } = view;
  if (view.legendary) return `legendary:${game.id}:${view.myIndex}:${view.me}`;
  if (view.phase === "pick") return `pick:${game.id}:${game.startedAt}`;
  if (view.phase === "turns") {
    if (!view.singer || !view.turn) return null;
    if (view.singer === view.me) return `turn:${game.id}:${view.index}:${view.me}`;
    if (!view.amVoter || view.songAt === null || now < view.songAt) return null;
    const tag = `${game.id}:${view.index}:${view.singer}`;
    return now >= view.endAt && !view.myVote ? `vote-end:${tag}` : `vote:${tag}`;
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
   Legendary rain it waits for it); `walkUp` is how long the walk-up runs */
export function singerUpMoment(state, me) {
  const key = singerUpKey(state, me);
  if (!key) return null;
  const game = state.karaoke, turn = karaokeTurn(game, me);
  const anchor = Number(turn.upAt) || 0;
  return { key, player:me, anchor, walkUp:KARAOKE_UP_MS, song:karaokeSongFor(state, game, me, me) };
}

/* ── Home: the row under the board and the headline's words ── */
/* the karaoke event still to come, for a guest who has no song yet (the
   setup list is gone once the weekend is live) */
export function karaokeSongAhead(state, me, { karaoke = false } = {}) {
  if (!karaoke || !state?.live || state.frozen || !me || !isActivePlayer(me, state) || hasKaraokeSong(state, me)) return null;
  const ev = allEventsOf(state).find(item => item.game === "karaoke" && !state.results?.[item.id] && !state.shelved?.[item.id]);
  if (!ev || karaokeGame(state, ev.id)) return null;
  const phase = resolveEventLifecycle(state, ev).phase;
  return ["in-progress", "result-entry", "complete", "shelved"].includes(phase) ? null : ev;
}

/* Home's headline while a game runs (homeModel deriveYouStrip): null with
   no game; an empty word when the game runs but asks nothing of you (the
   generic "You’re up" must not speak for a whole room). */
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
    const mine = myVoteOf(game, singer, me);
    if (open && !mine) return { word:"Vote", line:disp(state, singer), tone:"live", flash:true };
    if (started && nextSingerOf(state, game) === me) return { word:"Up next", tone:"info" };
    if (open && mine) return { word:"Vote", line:tierOf(mine)?.name || "", tone:"you" };
    return { word:"" };
  }
  if (game.phase === "reveal") return { word:"Results", tone:"info" };
  return { word:"" };
}

/* ── the commissioner's tray in the sheet's header (the sheet covers his
   pill): the pill's beat first, then its tray, the same writes ── */
const BEAT_LABEL = Object.freeze({ karaokeEndPick:"Start singing", karaokeStartSong:"Start song", karaokeNext:"Close vote",
  karaokeFinish:"Post result" });
export function karaokeTray(state, view, now) {
  if (!view || view.finished) return [];
  const { game } = view;
  const items = [];
  const beat = karaokeAutoBeat(state);
  if (beat && BEAT_LABEL[beat.type]) items.push({ id:"beat", label:BEAT_LABEL[beat.type], type:beat.type, payload:beat.payload });
  const at = { gameId:game.id, index:view.index };
  if (view.phase === "pick" && (Number(game.moreTime) || 0) < KARAOKE_MORE_TIME_MAX)
    items.push({ id:"more", label:"More time", type:"karaokeMoreTime", payload:{ gameId:game.id } });
  if (view.phase === "turns" && view.turn && !view.turn.closedAt) {
    const stage = karaokeStage(view.turn, now);
    if (stage === "up" && !view.turn.later) items.push({ id:"later", label:"Later", type:"karaokeLater", payload:at });
    if (stage === "singing") {
      items.push({ id:"end", label:"End song", type:"karaokeEndSong", payload:at });
      const alts = (view.singerSong?.alts || []).length;
      if (alts > (Number(view.turn.video) || 0)) items.push({ id:"video", label:"Next video", type:"karaokeNextVideo", payload:at });
    }
    items.push({ id:"skip", label:`Skip ${disp(state, view.singer)}`, type:"karaokeSkip", payload:at });
  }
  items.push({ id:"restart", label:"Restart", type:"karaokeRestart", payload:{ gameId:game.id, confirm:true }, confirm:true });
  return items;
}
