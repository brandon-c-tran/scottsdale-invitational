/* Karaoke (docs/KARAOKE.md): everyone picks a song ahead of time, Lock and
   start opens a pick window on every phone, the server draws the running
   order, each singer's song plays on the TV while the room votes in Build
   Battle's six tiers, and after the reveal the ranking posts as an
   ordinary free-for-all result. The night runs itself on the server clock
   (karaokeAutoBeat) and the pill can take any beat early. Nobody ever sees
   anyone's vote, and a song is public only once its singer is up. */
import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, ROSTER, allEventsOf, awardTable, computeStandings, presentPlayers,
  resolveCurrentContest, resolveWager,
} from "../shared/core.js";
import {
  KARAOKE_ALL_IN_MS, KARAOKE_LATE_MAX_MS, KARAOKE_LATE_MIN_MS, KARAOKE_LEGENDARY_MS, KARAOKE_MORE_TIME_MAX,
  KARAOKE_MORE_TIME_MS, KARAOKE_ORDER_HOLD_MS, KARAOKE_PICK_MS, KARAOKE_PRACTICE_MS, KARAOKE_REVEAL_HOLD_MS,
  KARAOKE_SONG_LEAD_MS, KARAOKE_UP_MS, KARAOKE_VOTE_GRACE_MS, KARAOKE_VOTE_LATE_MS,
  karaokeAutoBeat, karaokeBeat, karaokeGameId, karaokeOrder, karaokeRanking, karaokeResultSlots, karaokeRevealSchedule,
  karaokeSinger, karaokeTurn, karaokeVoters,
} from "../shared/karaoke.js";
import { KARAOKE_ACTION_TYPES } from "../worker/karaoke.js";
import { ACTIONS } from "../worker/actions.js";
import { publicState, sharedProjection } from "../worker/publicState.js";
import { buildSnapshot, validateSnapshot } from "../worker/snapshot.js";
import { hydrateStoredState } from "../worker/state.js";
import { resolveDirector } from "../shared/show.js";
import { autoBeat } from "../shared/autopilot.js";
import { REWIND_ACTIONS } from "../src/lib/frameGate.js";
import { directorPill } from "../src/features/director/directorPill.js";
import { projectBeats } from "../src/features/director/runOfShow.js";
import { Tournament } from "../worker/tournament.js";
import { applyAction } from "./support/confirmed-start.mjs";

let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local", karaoke:true };
const gm = (extra = {}) => ({ ...GM, player:null, deviceId:"gm", actionId:`g${++serial}`, ...extra });
const auto = key => ({ isGm:true, auto:true, player:null, deviceId:"autopilot", actionId:key, environment:"local", karaoke:true });
const as = (player, actionId = `p${++serial}`, deviceId = `d-${player}`) => ({ isGm:false, player, deviceId, actionId });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  return result.error;
};
/* Date.now pinned to `ms` for one call */
const at = (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
};
const atAsync = async (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
};
const karaokeEv = state => allEventsOf(state).find(ev => ev.id === "karaoke");

/* A song as the phone saves it: the Spotify half and its karaoke uploads */
const vid = (n, k = 0) => `kv${String(n).padStart(2, "0")}${k}aaaaaa`;
const track = (n, { seconds = 180, alts = 0 } = {}) => {
  const trackId = `kt${String(n).padStart(20, "0")}`;
  const video = k => ({ id:vid(n, k), title:`Song ${n} (Karaoke Version)`, channel:"Sing Along Karaoke", seconds });
  return { provider:"spotify", trackId, uri:`spotify:track:${trackId}`, name:`Song ${n}`, artists:[`Artist ${n}`],
    durationMs:seconds * 1000, imageUrl:null, explicit:false, video:video(0),
    alts:Array.from({ length:alts }, (_, k) => video(k + 1)) };
};
const songOf = player => track(ROSTER.indexOf(player) + 1);
/* eleven of thirteen saved a song ahead; Ben and Jeremy have none */
const SINGERS = ROSTER.slice(0, 11);
const [, , , , , , , , , , , BEN, JEREMY] = ROSTER;

const lockStart = (state, ctx = gm()) => {
  const contest = resolveCurrentContest(state, karaokeEv(state));
  return act(state, "lockAndStart", { evId:"karaoke", contestId:contest.id, contestRevision:contest.revision }, ctx);
};
const bet = (state, player, pick, stake = 100) => {
  const contest = resolveCurrentContest(state, karaokeEv(state));
  return act(state, "placeWager", { wager:{ kind:"outright", eventId:"karaoke", evName:"Karaoke", stake,
    contestId:contest.id, contestRevision:contest.revision, pick } }, as(player));
};
/* The room on Friday night: songs saved ahead, Karaoke announced, bets
   down, then Lock and start (with the capability: the pick window opens
   in the same write) at `start`. */
function announced({ songs = SINGERS, alts = {} } = {}) {
  const state = structuredClone(EMPTY_STATE);
  songs.forEach(player => act(state, "karaokeSong", { track:track(ROSTER.indexOf(player) + 1, { alts:alts[player] || 0 }) }, as(player)));
  act(state, "announceEvent", { evId:"karaoke" });
  return state;
}
function room({ songs = SINGERS, alts = {}, away = [], bets = [], karaoke = true, start = Date.now() } = {}) {
  const state = announced({ songs, alts });
  bets.forEach(([player, pick, stake]) => bet(state, player, pick, stake));
  away.forEach(player => act(state, "setAway", { player, away:true }));
  at(start, () => lockStart(state, gm({ karaoke })));
  return state;
}
const ref = state => ({ gameId:state.karaoke.id, index:state.karaoke.index });
const endPick = (state, when = state.karaoke.pickUntil) => at(when, () => act(state, "karaokeEndPick", { gameId:state.karaoke.id }));
const startSong = state => {
  const turn = karaokeTurn(state.karaoke);
  at(turn.upAt + KARAOKE_UP_MS, () => act(state, "karaokeStartSong", ref(state)));
  return karaokeTurn(state.karaoke);
};
const vote = (state, voter, tier, when, extra = {}) => at(when, () => applyAction(state, "karaokeVote",
  { gameId:state.karaoke.id, singer:karaokeSinger(state.karaoke), tier }, { ...as(voter), ...extra }));
/* the autopilot's next beat, taken when it is due */
const take = state => {
  const beat = karaokeAutoBeat(state);
  assert.ok(beat, "a beat is owed");
  return { beat, result:at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key))) };
};
/* Every turn from here: the song starts at its walk-up's end, each voter
   here votes `tierOf(voter, singer)` (0: no vote) a second in, and the vote
   closes when the autopilot would close it. */
function playTurns(state, tierOf = () => 4) {
  for (let guard = 0; guard < 40 && state.karaoke.phase === "turns"; guard++) {
    const singer = karaokeSinger(state.karaoke);
    const turn = startSong(state);
    karaokeVoters(state, singer).forEach((voter, k) => {
      const tier = tierOf(voter, singer);
      if (tier) assert.equal(vote(state, voter, tier, turn.songAt + 1000 + k).ok, true);
    });
    take(state);
  }
}

test("Karaoke is Friday's solo free-for-all at 400: every player a side, a wide field that pays 2:1", () => {
  const ev = karaokeEv(structuredClone(EMPTY_STATE));
  assert.deepEqual([ev.session, ev.value, ev.kind, ev.game, ev.participation.type], ["fri", 400, "solo", "karaoke", "all"]);
  assert.deepEqual(awardTable(ev), [400, 200, 100]);
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"karaoke" });
  const contest = resolveCurrentContest(state, karaokeEv(state));
  assert.equal(contest.kind, "ffa");
  assert.equal(contest.sides.length, presentPlayers(state).length);
  for (const type of KARAOKE_ACTION_TYPES) assert.ok(Object.hasOwn(ACTIONS, type), type);
});

test("Lock and start opens the pick window only with the capability; without it Karaoke is entered like any free-for-all", () => {
  const start = Date.now();
  const state = room({ start });
  const game = state.karaoke;
  assert.deepEqual([game.eventId, game.phase, game.startedAt, game.pickUntil, game.id],
    ["karaoke", "pick", start, start + KARAOKE_PICK_MS, karaokeGameId("karaoke", start)]);
  assert.equal(state.eventOps.karaoke.startedAt, start, "the same write locked betting and started the event");

  const plain = room({ karaoke:false });
  assert.equal(plain.karaoke, null);
  act(plain, "beginResultEntry", { evId:"karaoke" });
  act(plain, "saveResult", { evId:"karaoke", slots:[[ROSTER[1]], [ROSTER[2]], [ROSTER[3]]] });
  assert.ok(plain.results.karaoke);
  assert.equal(karaokeAutoBeat(plain), null);

  /* karaokeStart checks everything before its one write */
  const early = structuredClone(EMPTY_STATE);
  act(early, "announceEvent", { evId:"karaoke" });
  assert.equal(refuse(early, "karaokeStart", { evId:"karaoke" }), "Lock and start Karaoke first");
  assert.equal(refuse(early, "karaokeStart", { evId:"putt" }), "That game isn't on the schedule");
  assert.equal(refuse(early, "karaokeStart", { evId:"karaoke" }, gm({ karaoke:false })), "Karaoke is not set up");
  assert.equal(refuse(early, "karaokeStart", { evId:"karaoke" }, as(ROSTER[1])), "Commissioner only");
  assert.equal(early.karaoke, null);
  /* the pill's Start karaoke, for an event under way without its game */
  const started = room({ karaoke:false });
  assert.equal(started.karaoke, null);
  act(started, "karaokeStart", { evId:"karaoke" });
  assert.equal(started.karaoke.phase, "pick");
  assert.equal(act(started, "karaokeStart", { evId:"karaoke" }).extra.unchanged, true);
});

test("songs: a guest saves, changes and clears their own; the same song again changes nothing; junk is refused; presence is never needed", () => {
  const state = structuredClone(EMPTY_STATE);
  const evan = ROSTER[1];
  act(state, "setAway", { player:evan, away:true });
  const saved = at(1000, () => act(state, "karaokeSong", { track:track(2, { alts:3 }) }, as(evan)));
  assert.equal(saved.extra?.ready, undefined, "no window, nothing to lock in");
  const kept = state.profiles[evan].karaokeTrack;
  assert.equal(kept.video.id, vid(2));
  assert.equal(kept.alts.length, 2, "two alternates at most");
  assert.equal(kept.at, 1000);
  assert.equal(kept.startMs, undefined, "a karaoke song has no start point");
  assert.equal(at(5000, () => act(state, "karaokeSong", { track:track(2, { alts:3 }) }, as(evan))).extra.unchanged, true);
  assert.equal(state.profiles[evan].karaokeTrack.at, 1000, "a retried save keeps its time");
  act(state, "karaokeSong", { track:track(9) }, as(evan));
  assert.equal(state.profiles[evan].karaokeTrack.video.id, vid(9));
  act(state, "karaokeSong", { track:null }, as(evan));
  assert.equal(state.profiles[evan].karaokeTrack, undefined);
  assert.equal(act(state, "karaokeSong", { track:null }, as(evan)).extra.unchanged, true);
  const bad = "That song didn't come through whole. Pick it again";
  assert.equal(refuse(state, "karaokeSong", { track:{ ...track(3), video:null } }, as(evan)), bad, "a song the TV cannot play");
  assert.equal(refuse(state, "karaokeSong", { track:{ ...track(3), video:{ ...track(3).video, seconds:30 } } }, as(evan)), bad);
  assert.equal(refuse(state, "karaokeSong", { track:{ ...track(3), trackId:"nope" } }, as(evan)), bad);
  assert.equal(refuse(state, "karaokeSong", { track:"Mr. Brightside" }, as(evan)), bad);
  assert.equal(refuse(state, "karaokeSong", {}, as(evan)), "Pick a song");
  assert.equal(refuse(state, "karaokeSong", { track:track(3) }, { isGm:true, player:null }), "Check in first");
  act(state, "setOut", { player:ROSTER[12], out:true });
  assert.equal(refuse(state, "karaokeSong", { track:track(3) }, as(ROSTER[12])), "That player isn't on this weekend's roster");
});

test("a karaoke song is a profile answer: the owner may change it while the poker table is dealt", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target:"poker:set", seed:7 }, gm({ karaoke:false }));
  assert.ok(state.poker);
  assert.match(refuse(state, "announceEvent", { evId:"karaoke" }), /poker table/);
  act(state, "karaokeSong", { track:track(4) }, as(ROSTER[3]));
  assert.equal(state.profiles[ROSTER[3]].karaokeTrack.video.id, vid(4));
});

test("the pick window: Keep or a song saved here locks you in; away cannot; More time three times; picks close with the window", () => {
  const start = Date.now();
  const state = room({ start, away:[ROSTER[10]] });
  const { id } = state.karaoke;
  const evan = ROSTER[1];
  assert.equal(refuse(state, "karaokeReady", { gameId:"knope" }, as(evan)), "Song picks are closed");
  at(start + 1000, () => act(state, "karaokeReady", { gameId:id }, as(evan)));
  assert.equal(state.karaoke.ready[evan], start + 1000);
  assert.equal(act(state, "karaokeReady", { gameId:id }, as(evan)).extra.unchanged, true);
  assert.equal(refuse(state, "karaokeReady", { gameId:id }, as(BEN)), "Pick a song first");
  /* a song saved in the window locks its owner in, in the same write */
  const saved = at(start + 2000, () => act(state, "karaokeSong", { track:songOf(BEN) }, as(BEN)));
  assert.equal(saved.extra.ready, true);
  assert.equal(state.karaoke.ready[BEN], start + 2000);
  /* Keep on a song saved ahead (the same song again) */
  assert.equal(at(start + 2500, () => act(state, "karaokeSong", { track:songOf(ROSTER[2]) }, as(ROSTER[2]))).extra.ready, true);
  /* away: the song saves, nobody is locked in */
  assert.equal(refuse(state, "karaokeReady", { gameId:id }, as(ROSTER[10])), "You are marked away");
  act(state, "karaokeSong", { track:track(40) }, as(ROSTER[10]));
  assert.equal(state.karaoke.ready[ROSTER[10]], undefined);
  /* clearing your song undoes your lock-in */
  act(state, "karaokeSong", { track:null }, as(BEN));
  assert.equal(state.karaoke.ready[BEN], undefined);
  /* More time: a minute, three times at most, the commissioner's */
  assert.equal(refuse(state, "karaokeMoreTime", { gameId:id }, as(evan)), "Commissioner only");
  for (let k = 1; k <= KARAOKE_MORE_TIME_MAX; k++) {
    at(start + 3000, () => act(state, "karaokeMoreTime", { gameId:id }));
    assert.equal(state.karaoke.pickUntil, start + KARAOKE_PICK_MS + k * KARAOKE_MORE_TIME_MS);
  }
  assert.equal(refuse(state, "karaokeMoreTime", { gameId:id }), "No more time");
  endPick(state);
  assert.equal(refuse(state, "karaokeReady", { gameId:id }, as(ROSTER[3])), "Song picks are closed");
});

test("the order: drawn from everyone here with a song by the game id; the songs are copied; whoever has none sits out and their backers' chips come back", () => {
  const start = Date.now();
  const state = room({ start, bets:[[ROSTER[0], JEREMY, 200], [ROSTER[2], ROSTER[3], 100], [ROSTER[4], BEN, 100]] });
  const game = state.karaoke;
  const endedAt = start + 30_000;
  const done = endPick(state, endedAt);
  const singers = SINGERS.filter(player => presentPlayers(state).includes(player));
  assert.deepEqual(game.order, karaokeOrder(singers, game.id), "the same id draws the same order");
  assert.deepEqual([...game.order].sort(), [...singers].sort());
  assert.deepEqual(game.out.sort(), [BEN, JEREMY].sort());
  assert.equal(game.phase, "turns");
  assert.equal(game.index, 0);
  assert.equal(karaokeTurn(game).upAt, endedAt + KARAOKE_ORDER_HOLD_MS, "the first singer is up once the TV deals the order");
  /* backers of a sit-out get their chips back, named in the ack, as an Away mark returns them */
  const events = allEventsOf(state);
  const backed = state.wagers.filter(wager => [BEN, JEREMY].includes(wager.pick));
  assert.equal(backed.length, 2);
  for (const wager of backed) {
    assert.equal(wager.status, "void");
    assert.match(wager.voidReason, / sat out$/);
    assert.equal(resolveWager(state, wager, events).status, "void");
  }
  assert.deepEqual([...done.extra.voidIds].sort(), backed.map(wager => wager.id).sort());
  assert.deepEqual(done.extra.refunds.map(item => [item.player, item.stake]).sort(), [[ROSTER[0], 200], [ROSTER[4], 100]].sort());
  assert.equal(resolveWager(state, state.wagers.find(wager => wager.pick === ROSTER[3]), events).status, "pending",
    "a bet on a singer rides on");
  /* a song changed after the draw never changes the game */
  const first = game.order[0];
  act(state, "karaokeSong", { track:track(77) }, as(first));
  assert.equal(game.songs[first].video.id, vid(ROSTER.indexOf(first) + 1));
  assert.equal(game.songs[first].trackId, songOf(first).trackId);
});

test("nobody with a song: the game is empty and the ordinary result entry stays", () => {
  const state = room({ songs:[] });
  const events = allEventsOf(state);
  const done = endPick(state);
  assert.equal(done.extra.empty, true);
  assert.deepEqual([state.karaoke.phase, state.karaoke.empty], ["done", true]);
  assert.equal(karaokeAutoBeat(state), null);
  assert.equal(karaokeBeat(state, karaokeEv(state), { karaoke:true }), null);
  const pill = directorPill(state, events, resolveDirector(state, events, { karaoke:true }));
  assert.ok(!pill.type.startsWith("karaoke"), pill.type);
  assert.equal(refuse(state, "karaokeFinish", { gameId:state.karaoke.id }), "Nobody sang");
  act(state, "beginResultEntry", { evId:"karaoke" });
  act(state, "saveResult", { evId:"karaoke", slots:[[ROSTER[0]], [], []] });
  assert.ok(state.results.karaoke);
});

test("votes: the current singer only, while the vote is open, never your own or while away; a change replaces and keeps its time; a retry counts once", () => {
  const state = room({ away:[ROSTER[10]] });
  endPick(state);
  const game = state.karaoke;
  const singer = karaokeSinger(game);
  const [a, b] = karaokeVoters(state, singer);
  const up = karaokeTurn(game);
  assert.equal(vote(state, a, 4, up.upAt + 1000).error, "The song has not started");
  const turn = startSong(state);
  assert.equal(turn.songAt, up.upAt + KARAOKE_UP_MS + KARAOKE_SONG_LEAD_MS);
  assert.equal(vote(state, a, 4, turn.songAt - 1).error, "The song has not started");
  assert.equal(vote(state, singer, 6, turn.songAt).error, "You can't vote for yourself");
  assert.equal(vote(state, ROSTER[10], 6, turn.songAt).error, "You are marked away");
  assert.equal(vote(state, a, 7, turn.songAt).error, "Pick a tier");
  assert.equal(vote(state, a, 0, turn.songAt).error, "Pick a tier");
  assert.equal(at(turn.songAt, () => applyAction(state, "karaokeVote", { gameId:game.id, singer:game.order[1], tier:3 }, as(a))).error,
    "The vote is closed", "only the singer up now");
  assert.equal(at(turn.songAt, () => applyAction(state, "karaokeVote", { gameId:"kstale", singer, tier:3 }, as(a))).error,
    "The vote is closed");
  assert.equal(at(turn.songAt, () => applyAction(state, "karaokeVote", { gameId:game.id, singer, tier:3, index:1 }, as(a))).error,
    "The vote is closed");
  const cast = as(a, "tap-1");
  assert.equal(vote(state, a, 3, turn.songAt + 2000, cast).ok, true);
  assert.deepEqual(game.votes[singer][a], { tier:3, at:turn.songAt + 2000 });
  assert.equal(vote(state, a, 3, turn.songAt + 3000).extra?.unchanged, true, "the same tier changes nothing");
  assert.equal(vote(state, a, 5, turn.songAt + 4000).ok, true);
  assert.deepEqual(game.votes[singer][a], { tier:5, at:turn.songAt + 2000 }, "a change keeps when it was cast");
  /* the first tap's retry after the change: acknowledged, never undoes it */
  assert.equal(vote(state, a, 3, turn.songAt + 5000, cast).extra?.unchanged, true);
  assert.equal(game.votes[singer][a].tier, 5);
  /* open until the close (and its short tail for a vote already in flight) */
  assert.equal(vote(state, b, 2, turn.closeAt + KARAOKE_VOTE_LATE_MS - 1).ok, true);
  assert.equal(vote(state, b, 6, turn.closeAt + KARAOKE_VOTE_LATE_MS).error, "The vote is closed");
  take(state);
  assert.equal(at(turn.closeAt, () => applyAction(state, "karaokeVote", { gameId:game.id, singer, tier:1 }, as(a))).error,
    "The vote is closed", "a closed vote stays closed");
  assert.equal(game.turns[singer].closedAt, turn.closeAt);
});

test("the commissioner's beats name the game and the turn: a stale tap is refused, a retried one is a no-op", () => {
  const state = room({ alts:{ [ROSTER[0]]:2 } });
  endPick(state);
  const game = state.karaoke;
  const first = karaokeTurn(game);
  const now = first.upAt + 1000;
  assert.equal(at(now, () => refuse(state, "karaokeStartSong", { ...ref(state), index:1 })), "Karaoke moved on");
  assert.equal(at(now, () => refuse(state, "karaokeStartSong", { ...ref(state), gameId:"kold" })), "Karaoke moved on");
  assert.equal(at(now, () => refuse(state, "karaokeStartSong", ref(state), as(ROSTER[1]))), "Commissioner only");
  assert.equal(at(now, () => refuse(state, "karaokeEndSong", ref(state))), "Start the song first");
  assert.equal(at(now, () => refuse(state, "karaokeNext", ref(state))), "Start the song first");
  const tap = gm({ actionId:"start-1" });
  at(now, () => act(state, "karaokeStartSong", ref(state), tap));
  const songAt = now + KARAOKE_SONG_LEAD_MS;
  assert.equal(karaokeTurn(game).songAt, songAt, "the commissioner may take the beat early");
  assert.equal(at(now + 50, () => act(state, "karaokeStartSong", ref(state), tap)).extra.unchanged, true);
  /* End song: the song stops now, the vote stays open its grace */
  at(songAt + 30_000, () => act(state, "karaokeEndSong", ref(state)));
  assert.deepEqual([karaokeTurn(game).endAt, karaokeTurn(game).closeAt, karaokeTurn(game).cut],
    [songAt + 30_000, songAt + 30_000 + KARAOKE_VOTE_GRACE_MS, true]);
  assert.equal(at(songAt + 40_000, () => act(state, "karaokeEndSong", ref(state))).extra.unchanged, true);
  take(state);
  /* the second singer: Later, once, before the song */
  const second = karaokeSinger(game), third = game.order[2];
  at(karaokeTurn(game).upAt + 100, () => act(state, "karaokeLater", ref(state)));
  assert.equal(game.order.at(-1), second);
  assert.equal(karaokeSinger(game), third, "the next singer is up now");
  assert.equal(karaokeTurn(game).upAt, karaokeTurn(game, second).upAt + 100);
  /* Skip: no score, their votes discarded, the next is up */
  const skipped = karaokeSinger(game);
  const turn = startSong(state);
  assert.equal(vote(state, game.order[0], 6, turn.songAt + 10).ok, true);
  at(turn.songAt + 20, () => act(state, "karaokeSkip", ref(state)));
  assert.equal(game.turns[skipped].skipped, true);
  assert.equal(game.votes[skipped], undefined);
  assert.equal(game.index, 2);
  /* the singer who went Later comes up last and cannot go again */
  while (game.index < game.order.length - 1) {
    startSong(state);
    take(state);
  }
  assert.equal(karaokeSinger(game), second);
  assert.equal(karaokeTurn(game).later, true);
  assert.equal(at(karaokeTurn(game).upAt, () => refuse(state, "karaokeLater", ref(state))), `${second} already moved to the end`);
  startSong(state);
  take(state);
  assert.equal(game.phase, "reveal");
  assert.ok(!karaokeRanking(game).some(row => row.player === skipped), "a skipped singer is not ranked");
});

test("Next video: before the song it shows the other upload; once started it plays it from the top; none left is refused", () => {
  const state = room({ songs:[ROSTER[0], ROSTER[1]], alts:{ [ROSTER[0]]:2, [ROSTER[1]]:2 } });
  endPick(state);
  const game = state.karaoke;
  const up = karaokeTurn(game);
  at(up.upAt, () => act(state, "karaokeNextVideo", ref(state)));
  assert.deepEqual([karaokeTurn(game).video, karaokeTurn(game).songAt], [1, null], "the walk-up waits");
  const turn = startSong(state);
  const songMs = 180_000;
  assert.equal(turn.endAt - turn.songAt, songMs);
  assert.equal(vote(state, karaokeVoters(state, karaokeSinger(game))[0], 4, turn.songAt + 5).ok, true);
  const later = turn.songAt + 60_000;
  at(later, () => act(state, "karaokeNextVideo", ref(state)));
  const again = karaokeTurn(game);
  assert.deepEqual([again.video, again.songAt, again.endAt, again.closeAt],
    [2, later + KARAOKE_SONG_LEAD_MS, later + KARAOKE_SONG_LEAD_MS + songMs, later + KARAOKE_SONG_LEAD_MS + songMs + KARAOKE_VOTE_GRACE_MS]);
  assert.equal(Object.keys(game.votes[karaokeSinger(game)]).length, 1, "the votes so far stay");
  assert.equal(at(later + 2000, () => refuse(state, "karaokeNextVideo", ref(state))), "No other video");
});

test("the autopilot runs the night: each beat's time and key; early, held or already taken, an auto write changes nothing", () => {
  const start = Date.now();
  const state = room({ start });
  const game = state.karaoke;
  const base = `karaoke:${game.id}`;
  let beat = autoBeat(state);
  assert.deepEqual(beat, { at:start + KARAOKE_PICK_MS, from:start, type:"karaokeEndPick", payload:{ gameId:game.id }, key:`${base}:pick` });
  assert.deepEqual(beat, karaokeAutoBeat(state), "karaoke's beat is the autopilot's");
  assert.equal(at(beat.at - 1000, () => act(state, beat.type, beat.payload, auto(beat.key))).extra.stale, true, "an early alarm");
  assert.equal(game.phase, "pick");
  /* everyone here locked in: the window ends a breath after the last */
  const here = presentPlayers(state);
  here.forEach((player, k) => at(start + 1000 + k, () => SINGERS.includes(player)
    ? act(state, "karaokeReady", { gameId:game.id }, as(player))
    : act(state, "karaokeSong", { track:songOf(player) }, as(player))));
  const last = start + 1000 + here.length - 1;
  assert.equal(karaokeAutoBeat(state).at, last + KARAOKE_ALL_IN_MS);
  /* held: nothing runs on its own */
  act(state, "setAutopilot", { hold:true });
  assert.equal(autoBeat(state), null);
  beat = karaokeAutoBeat(state);
  assert.equal(at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key))).extra.stale, true, "held");
  act(state, "setAutopilot", { hold:false });
  take(state);
  assert.equal(game.order.length, here.length, "everyone sings");
  /* the walk-up, then the song by its own write */
  beat = karaokeAutoBeat(state);
  const singer = karaokeSinger(game);
  assert.deepEqual([beat.type, beat.payload, beat.at, beat.key],
    ["karaokeStartSong", { gameId:game.id, index:0 }, karaokeTurn(game).upAt + KARAOKE_UP_MS, `${base}:start:0:${singer}`]);
  /* the commissioner takes it early from the pill: the autopilot's beat is then stale */
  at(beat.at - 5000, () => act(state, beat.type, beat.payload));
  assert.equal(at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key))).extra.stale, true);
  const turn = karaokeTurn(game);
  beat = karaokeAutoBeat(state);
  assert.deepEqual([beat.type, beat.at, beat.key], ["karaokeNext", turn.closeAt, `${base}:next:0:${singer}`]);
  /* everyone voted: the vote closes a breath after the song ends, not at its close */
  karaokeVoters(state, singer).forEach((voter, k) => vote(state, voter, k < 4 ? 6 : 4, turn.songAt + 1000 + k));
  beat = karaokeAutoBeat(state);
  assert.equal(beat.at, turn.endAt + KARAOKE_ALL_IN_MS);
  take(state);
  /* four Legendary in twelve: it rains before the next singer is up */
  assert.equal(game.turns[singer].legendary, true);
  assert.equal(karaokeTurn(game).upAt, turn.endAt + KARAOKE_ALL_IN_MS + KARAOKE_LEGENDARY_MS);
  playTurns(state, (voter, who) => ROSTER.indexOf(who) % 6 + 1);
  assert.equal(game.phase, "reveal");
  beat = autoBeat(state);
  assert.deepEqual([beat.type, beat.payload, beat.key], ["karaokeFinish", { gameId:game.id }, `${base}:finish`]);
  assert.equal(beat.at, game.revealAt + karaokeRevealSchedule(game.ranking).span + KARAOKE_REVEAL_HOLD_MS);
  take(state);
  assert.ok(state.results.karaoke, "the result posted itself");
  assert.equal(autoBeat(state), null, "nothing more is owed");
});

test("the reveal and the result: one per place through the ordinary result write; the votes go, the ranking stays and posts again after a clear", () => {
  const state = room({ bets:[[ROSTER[11], ROSTER[1], 100], [ROSTER[12], ROSTER[2], 100]] });
  endPick(state);
  /* Evan's song brings the house down, then Eyob's */
  const tierOf = (voter, singer) => singer === ROSTER[1] ? 6 : singer === ROSTER[2] ? 5 : (ROSTER.indexOf(voter) + ROSTER.indexOf(singer)) % 4 + 1;
  playTurns(state, tierOf);
  const game = state.karaoke;
  assert.equal(game.phase, "reveal");
  assert.deepEqual(game.ranking, karaokeRanking(game));
  assert.deepEqual(game.ranking.slice(0, 2).map(row => row.player), [ROSTER[1], ROSTER[2]]);
  assert.equal(game.ranking[0].score, 18);
  assert.deepEqual(game.ranking.map(row => row.place), game.ranking.map((_, k) => k + 1), "one player a place");
  const slots = karaokeResultSlots(game.ranking);
  const finish = take(state).result;
  assert.deepEqual(finish.extra.slots, slots);
  assert.deepEqual(state.results.karaoke.slots, slots);
  assert.deepEqual(slots.map(slot => slot.length), [1, 1, 1]);
  const rows = Object.fromEntries(computeStandings(state).map(row => [row.player, row]));
  assert.deepEqual(slots.map(([player]) => rows[player].awardPts), [400, 200, 100]);
  const events = allEventsOf(state);
  assert.equal(resolveWager(state, state.wagers.find(wager => wager.pick === ROSTER[1]), events).status, "won");
  assert.equal(resolveWager(state, state.wagers.find(wager => wager.pick === ROSTER[2]), events).status, "lost");
  assert.deepEqual([game.phase, game.votes], ["done", {}], "per-voter votes are deleted once the result posts");
  assert.ok(game.finishedAt);
  assert.equal(Object.keys(game.ops).some(scope => scope.startsWith("v:")), false);
  assert.equal(act(state, "karaokeFinish", { gameId:game.id }).extra.unchanged, true, "posted is posted");
  /* a cleared result posts again from the ranking it kept */
  act(state, "clearResult", { evId:"karaoke", confirmClear:true, correctionReason:"Recount" });
  assert.equal(state.results.karaoke, undefined);
  assert.equal(karaokeAutoBeat(state), null, "a cleared result never posts itself again");
  act(state, "karaokeFinish", { gameId:game.id });
  assert.deepEqual(state.results.karaoke.slots, slots);
});

test("nobody voted: no slots, nothing posts by itself, and the pill hands back the ordinary result entry", () => {
  const state = room({ songs:SINGERS.slice(0, 3) });
  endPick(state);
  playTurns(state, () => 0);
  const game = state.karaoke;
  assert.equal(game.phase, "reveal");
  assert.equal(game.ranking.length, 3);
  assert.ok(game.ranking.every(row => row.score === null && row.count === 0));
  assert.deepEqual(karaokeResultSlots(game.ranking), []);
  assert.equal(karaokeAutoBeat(state), null);
  assert.equal(refuse(state, "karaokeFinish", { gameId:game.id }), "Nobody voted");
  const events = allEventsOf(state);
  const pill = directorPill(state, events, resolveDirector(state, events, { karaoke:true }));
  assert.ok(!pill.type.startsWith("karaoke"), pill.type);
  act(state, "beginResultEntry", { evId:"karaoke" });
  act(state, "saveResult", { evId:"karaoke", slots:[[SINGERS[0]], [], []] });
});

test("ranking: a tie on the score goes to more Legendary, then the earlier singer; a singer nobody voted on ranks last", () => {
  const game = { order:["A", "B", "C", "D"], turns:{ A:{ closedAt:1 }, B:{ closedAt:1 }, C:{ closedAt:1 }, D:{ closedAt:1 } },
    votes:{
      A:{ x:{ tier:4 }, y:{ tier:4 } },
      B:{ x:{ tier:6 }, y:{ tier:2 } },
      C:{ x:{ tier:4 }, y:{ tier:4 } },
    } };
  /* A and C both 10.0 on two Goods; B 10.0 on Legendary + Ass: more Legendary first */
  assert.deepEqual(karaokeRanking(game).map(row => row.player), ["B", "A", "C", "D"]);
  assert.deepEqual(karaokeResultSlots(karaokeRanking(game)), [["B"], ["A"], ["C"]]);
});

test("an absent singer is skipped when their turn comes; the next singer here is up", () => {
  const state = room();
  endPick(state);
  const game = state.karaoke;
  const away = game.order[1], next = game.order[2];
  act(state, "setAway", { player:away, away:true });
  startSong(state);
  take(state);
  assert.equal(game.turns[away].skipped, true);
  assert.equal(karaokeSinger(game), next);
  assert.equal(game.index, 2);
  /* away while up: the song's start skips them instead */
  act(state, "setAway", { player:next, away:true });
  const up = karaokeTurn(game);
  const skipped = at(up.upAt + KARAOKE_UP_MS, () => act(state, "karaokeStartSong", ref(state)));
  assert.equal(skipped.extra.skipped, next);
  assert.equal(game.index, 3);
});

test("the pill: one karaoke step on the autopilot's own write, so its drain shows; the tray's moves where they apply; Start karaoke with the capability", () => {
  const start = Date.now();
  const state = room({ start, alts:{ [ROSTER[0]]:1, [ROSTER[1]]:1, [ROSTER[2]]:1, [ROSTER[3]]:1, [ROSTER[4]]:1,
    [ROSTER[5]]:1, [ROSTER[6]]:1, [ROSTER[7]]:1, [ROSTER[8]]:1, [ROSTER[9]]:1, [ROSTER[10]]:1 } });
  const events = allEventsOf(state);
  const pillOf = (frame = state) => directorPill(frame, allEventsOf(frame),
    resolveDirector(frame, allEventsOf(frame), { karaoke:true, now:Date.now() }));
  at(start + 1000, () => act(state, "karaokeReady", { gameId:state.karaoke.id }, as(ROSTER[1])));
  let pill = pillOf();
  assert.deepEqual([pill.type, pill.label, pill.run], ["karaoke-step", "Start singing",
    { write:"karaokeEndPick", payload:{ gameId:state.karaoke.id } }]);
  assert.equal(pill.lines[1], `1 of ${presentPlayers(state).length} locked in`);
  const due = autoBeat(state);
  assert.deepEqual(pill.auto, { at:due.at, from:due.from, key:due.key }, "the pill draws the autopilot's wait");
  assert.deepEqual(pill.extras.map(extra => extra.label), ["More time", "Restart", "Pause autopilot"]);
  endPick(state);
  const game = state.karaoke;
  const name = karaokeSinger(game);
  pill = pillOf();
  assert.deepEqual([pill.label, pill.lines, pill.run], ["Start song", [`Singer 1 of ${game.order.length}`, `${name} up`],
    { write:"karaokeStartSong", payload:{ gameId:game.id, index:0 } }]);
  assert.deepEqual(pill.extras.map(extra => extra.label), ["Later", "Next video", `Skip ${name}`, "Restart", "Pause autopilot"]);
  assert.deepEqual(Object.fromEntries(pill.extras.map(extra => [extra.label, extra.run.confirm || null])), {
    Later:null, "Next video":null, [`Skip ${name}`]:`${name} is skipped. Their song scores nothing.`,
    Restart:"Karaoke starts over. Every lock-in and vote is lost.", "Pause autopilot":null,
  }, "a move that throws work away names it before it is sent");
  assert.equal(pill.run.confirm, undefined);
  assert.ok(pill.auto);
  const turn = at(karaokeTurn(game).upAt + KARAOKE_UP_MS, () => {
    act(state, "karaokeStartSong", ref(state));
    return karaokeTurn(game);
  });
  vote(state, karaokeVoters(state, name)[0], 4, turn.songAt + 10);
  pill = at(turn.songAt + 20, () => pillOf());
  assert.deepEqual([pill.label, pill.lines[1], pill.run.write], ["Close vote", `1 of ${karaokeVoters(state, name).length} voted`, "karaokeNext"]);
  assert.deepEqual(pill.extras.map(extra => extra.label), ["End song", "Next video", `Skip ${name}`, "Restart", "Pause autopilot"]);
  /* the commissioner's own frame (votes as times only) draws the same wait */
  const frame = publicState(state, { isGm:true, player:ROSTER[0] });
  const fromFrame = at(turn.songAt + 20, () => pillOf(frame));
  assert.deepEqual(fromFrame.run, pill.run);
  assert.deepEqual(fromFrame.auto, pill.auto);
  /* once someone has sung, Restart leaves the tray */
  karaokeVoters(state, name).forEach((voter, k) => vote(state, voter, 3, turn.songAt + 100 + k));
  take(state);
  assert.ok(!at(karaokeTurn(game).upAt, () => pillOf()).extras.some(extra => extra.label === "Restart"));
  /* the run of show: each singer's start and close, then the result */
  assert.deepEqual(at(karaokeTurn(game).upAt, () => projectBeats(state, events, null, { karaoke:true, limit:3 }))
    .map(beat => [beat.label, beat.subject]),
  [["Start song", `Singer 2 of ${game.order.length}`], ["Close vote", `Singer 2 of ${game.order.length}`],
    ["Start song", `Singer 3 of ${game.order.length}`]]);

  /* an event under way without its game: Start karaoke, only with the capability */
  const plain = room({ karaoke:false });
  const plainEvents = allEventsOf(plain);
  const off = resolveDirector(plain, plainEvents).nextAction;
  assert.ok(!off.type.startsWith("karaoke"), off.type);
  const on = directorPill(plain, plainEvents, resolveDirector(plain, plainEvents, { karaoke:true }));
  assert.deepEqual([on.type, on.label, on.run], ["karaoke-start", "Start karaoke", { write:"karaokeStart", payload:{ evId:"karaoke" } }]);
  assert.deepEqual(projectBeats(plain, plainEvents, null, { karaoke:true, limit:2 }).map(beat => beat.label), ["Start karaoke", "Start singing"]);
  /* before Lock and start, the run of show plans the pick window next */
  const open = structuredClone(EMPTY_STATE);
  SINGERS.forEach(player => act(open, "karaokeSong", { track:songOf(player) }, as(player)));
  act(open, "announceEvent", { evId:"karaoke" });
  const openEvents = allEventsOf(open);
  assert.deepEqual(projectBeats(open, openEvents, null, { karaoke:true, limit:3 }).map(beat => [beat.label, beat.subject]),
    [["Lock and start", "Karaoke"], ["Start singing", "Karaoke"], ["Start song", `Singer 1 of ${SINGERS.length}`]]);
  assert.deepEqual(projectBeats(open, openEvents, null, { limit:2 }).map(beat => beat.label).slice(1), ["Enter result"],
    "without the capability Karaoke is entered by hand");
});

test("what each screen gets: songs only up to the current singer, the commissioner no sooner than anyone, who voted but never how", () => {
  const state = room();
  const brandon = ROSTER[0];
  /* the profile song: its owner and the commissioner only */
  const guest = publicState(state, { player:ROSTER[1] });
  assert.ok(guest.profiles[ROSTER[1]].karaokeTrack, "your own song");
  assert.equal(guest.profiles[ROSTER[2]].karaokeTrack, undefined, "never anyone else's");
  assert.equal(publicState(state, {}).profiles[ROSTER[2]].karaokeTrack, undefined, "nor the TV's");
  assert.ok(publicState(state, { isGm:true, player:brandon }).profiles[ROSTER[2]].karaokeTrack, "the commissioner's desk");
  assert.equal("karaoke" in sharedProjection(state), false, "the game is never in the shared half of a frame");
  /* the window: nobody's song yet; who locked in, never what */
  at(state.karaoke.startedAt + 10, () => act(state, "karaokeReady", { gameId:state.karaoke.id }, as(ROSTER[1])));
  const pick = publicState(state, {}).karaoke;
  assert.deepEqual(pick.songs, {});
  assert.deepEqual(Object.keys(pick.ready), [ROSTER[1]]);
  endPick(state);
  const game = state.karaoke;
  /* two singers sing (everyone votes OK), the third is mid-song with three votes in */
  for (let k = 0; k < 2; k++) {
    const turn = startSong(state);
    karaokeVoters(state, karaokeSinger(game)).forEach((voter, j) => vote(state, voter, 3, turn.songAt + j));
    take(state);
  }
  const singer = karaokeSinger(game);
  const turn = startSong(state);
  const voters = karaokeVoters(state, singer);
  const [voter, other] = voters.filter(player => player !== brandon);
  const third = voters.includes(brandon) ? brandon : voters.find(player => player !== voter && player !== other);
  vote(state, voter, 6, turn.songAt + 10);
  vote(state, other, 1, turn.songAt + 20);
  vote(state, third, 2, turn.songAt + 30);
  const viewers = { voter:[{ player:voter }, voter], singer:[{ player:singer }, singer],
    gm:[{ isGm:true, player:brandon }, brandon], brandon:[{ player:brandon }, brandon], tv:[{}, null] };
  const shown = game.order.slice(0, game.index + 1);
  const frames = {};
  for (const [who, [viewer, me]] of Object.entries(viewers)) {
    const k = frames[who] = publicState(state, viewer).karaoke;
    assert.ok(Object.keys(k.songs).every(player => shown.includes(player) || player === me), `${who}: no song before its singer is up`);
    assert.ok(shown.every(player => k.songs[player]), `${who}: every song up to now`);
    assert.equal(k.votes, undefined, `${who}: never the votes`);
    assert.equal(k.ops, undefined);
    assert.equal(k.bad, undefined);
    assert.equal(JSON.stringify(k).includes("\"tier\""), false, `${who}: no tier anywhere`);
    assert.deepEqual(k.voted[singer], { [voter]:turn.songAt + 10, [other]:turn.songAt + 20, [third]:turn.songAt + 30 },
      `${who}: who voted and when`);
    assert.equal(k.ranking, null, `${who}: no ranking before the reveal`);
  }
  assert.deepEqual(frames.voter.mine, { ...Object.fromEntries(game.order.slice(0, 2).filter(player => player !== voter)
    .map(player => [player, 3])), [singer]:6 }, "your own votes, yours only");
  assert.deepEqual(frames.tv.mine, {});
  assert.deepEqual(frames.gm, frames.brandon, "the commissioner sees what Brandon the player sees");
  /* the reveal: the ranking, for everyone at once */
  playTurns(state, () => 4);
  assert.equal(game.phase, "reveal");
  assert.deepEqual(publicState(state, {}).karaoke.ranking, game.ranking);
});

test("the window's video check: a working alternate is promoted at the draw; a song with none asks its owner for another; a new song clears it", () => {
  const start = Date.now();
  const evan = ROSTER[1], khoa = ROSTER[4], sahil = ROSTER[3];
  const state = room({ start, alts:{ [evan]:2, [khoa]:1 } });
  const game = state.karaoke;
  at(start + 100, () => act(state, "karaokeReady", { gameId:game.id }, as(khoa)));
  const sys = gm({ auto:true });
  assert.equal(refuse(state, "karaokePreflight", { gameId:game.id, bad:{} }, gm()), "Commissioner only", "a system write");
  assert.equal(refuse(state, "karaokePreflight", { gameId:game.id, bad:{} }, as(evan)), "Commissioner only");
  assert.equal(act(state, "karaokePreflight", { gameId:"kold", bad:{ [evan]:{ [vid(2, 0)]:150 } } }, sys).extra.stale, true);
  act(state, "karaokePreflight", { gameId:game.id, bad:{
    [evan]:{ [vid(2, 0)]:150 },
    [khoa]:{ [vid(5, 0)]:100, [vid(5, 1)]:101 },
    [sahil]:2,
    Nobody:{ [vid(1)]:2 },
  } }, sys);
  assert.deepEqual(game.broken, { [khoa]:100, [sahil]:2 }, "every video gone: asked for another");
  assert.equal(game.ready[khoa], undefined, "their lock-in is undone");
  assert.equal(refuse(state, "karaokeReady", { gameId:game.id }, as(khoa)), "Pick another song");
  assert.equal(act(state, "karaokePreflight", { gameId:game.id, bad:{ [sahil]:2 } }, sys).extra.unchanged, true);
  /* only the owner hears about it */
  assert.deepEqual(publicState(state, { player:khoa }).karaoke.broken, { [khoa]:100 });
  assert.deepEqual(publicState(state, { player:evan }).karaoke.broken, {});
  assert.deepEqual(publicState(state, { isGm:true, player:ROSTER[0] }).karaoke.broken, {});
  /* a new song clears it and locks in */
  const saved = at(start + 200, () => act(state, "karaokeSong", { track:track(55) }, as(khoa)));
  assert.equal(saved.extra.ready, true);
  assert.equal(game.broken[khoa], undefined);
  endPick(state);
  /* Evan's first working upload is promoted; Sahil kept his broken song and his turn fails as it comes up */
  assert.deepEqual(game.broken, {}, "the window's question ends with the window");
  assert.deepEqual(publicState(state, { player:sahil }).karaoke.broken, {});
  assert.deepEqual([game.songs[evan].video.id, game.songs[evan].alts.map(alt => alt.id)], [vid(2, 1), [vid(2, 2)]]);
  assert.equal(game.songs[khoa].video.id, vid(55));
  for (let guard = 0; guard < 20 && karaokeSinger(game) !== sahil; guard++) { startSong(state); take(state); }
  assert.equal(karaokeTurn(game).failed, 2);
  assert.equal(act(state, "karaokePreflight", { gameId:game.id, bad:{ [evan]:2 } }, sys).extra.stale, true,
    "after the draw the check is too late");
});

test("the TV's report: the first playing moves a late song's end (never earlier, capped); the first error moves on to the next upload, then fails", () => {
  const state = room({ songs:[ROSTER[0], ROSTER[1], ROSTER[2]], alts:{ [ROSTER[0]]:1, [ROSTER[1]]:1, [ROSTER[2]]:1 } });
  endPick(state);
  const game = state.karaoke;
  const sys = key => ({ ...auto(key), deviceId:"tv" });
  const play = (payload, when) => at(when, () => act(state, "karaokeTvPlaying", { ...ref(state), video:0, ...payload }, sys("p")));
  assert.equal(refuse(state, "karaokeTvPlaying", { ...ref(state), video:0, playingAt:1 }, gm()), "Commissioner only");
  let turn = startSong(state);
  /* on time (under the floor): stamped, nothing moves */
  play({ playingAt:turn.songAt + KARAOKE_LATE_MIN_MS }, turn.songAt + 3000);
  assert.deepEqual([karaokeTurn(game).playedAt, karaokeTurn(game).endAt], [turn.songAt + KARAOKE_LATE_MIN_MS, turn.endAt]);
  assert.equal(play({ playingAt:turn.songAt + 9000 }, turn.songAt + 9000).extra.unchanged, true, "the first report counts");
  assert.equal(play({ playingAt:turn.songAt, video:1 }, turn.songAt + 9000).extra.stale, true, "another video's report");
  assert.equal(play({ playingAt:turn.songAt, index:4 }, turn.songAt + 9000).extra.stale, true, "another turn's report");
  take(state);
  /* an ad: the song's end and the vote's close move by the delay */
  turn = startSong(state);
  const late = 45_000;
  play({ playingAt:turn.songAt + late }, turn.songAt + late + 200);
  assert.deepEqual([karaokeTurn(game).endAt, karaokeTurn(game).closeAt], [turn.endAt + late, turn.closeAt + late]);
  take(state);
  /* far too late: capped; a report from the future is read as now */
  turn = startSong(state);
  play({ playingAt:turn.songAt + 10 * 60_000 }, turn.songAt + 3 * 60_000);
  assert.deepEqual([karaokeTurn(game).playedAt, karaokeTurn(game).endAt], [turn.songAt + 3 * 60_000, turn.endAt + KARAOKE_LATE_MAX_MS]);
  /* errors: the next upload from the top, then the lit card */
  const error = (video, code, when) => at(when, () => act(state, "karaokeTvError", { ...ref(state), video, code }, sys("e")));
  assert.equal(error(0, 150, turn.songAt + 5000).extra.video, 1);
  const moved = karaokeTurn(game);
  assert.deepEqual([moved.video, moved.songAt, moved.playedAt], [1, turn.songAt + 5000 + KARAOKE_SONG_LEAD_MS, null]);
  assert.equal(error(0, 150, turn.songAt + 6000).extra.stale, true, "the old video's report");
  assert.equal(at(turn.songAt + 6000, () => refuse(state, "karaokeTvError", { ...ref(state), video:1, code:1000 }, sys("x"))),
    "Unknown video error");
  assert.equal(error(1, 101, turn.songAt + 7000).extra.failed, 101);
  assert.equal(karaokeTurn(game).failed, 101);
  assert.equal(error(1, 101, turn.songAt + 8000).extra.unchanged, true);
  /* a failed song plays its lit card for its length; the vote goes on */
  assert.equal(vote(state, karaokeVoters(state, karaokeSinger(game))[0], 4, moved.songAt + 100).ok, true);
});

function memoryContext() {
  const entries = new Map(), sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([key]) => key.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
  };
  return { entries, sockets, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil() {} } };
}
const socketIn = memory => {
  let attachment = null;
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  return ws;
};
const GM_TOKEN = "gm-token-for-karaoke";
const device = n => `device-karaoke-4000-8000-${String(n).padStart(12, "0")}`;

test("the Durable Object: a TV's video report reaches the commissioner as presence and its first playing or error becomes the game's write, once", async () => {
  const built = room({ songs:[ROSTER[0], ROSTER[1]], alts:{ [ROSTER[0]]:1, [ROSTER[1]]:1 } });
  endPick(built);
  const turn = startSong(built);
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { APP_ENV:"local" });
  await tournament.hydrateFromStorage();
  tournament.gmToken = GM_TOKEN;
  tournament.state = built;
  const say = (ws, deviceId, message, gm = false) => tournament.webSocketMessage(ws,
    JSON.stringify({ actionId:`a${++serial}`, ...message, deviceId, ...(gm ? { gmToken:GM_TOKEN } : {}) }));
  const host = socketIn(memory), guest = socketIn(memory), tv = socketIn(memory);
  const { id:gameId, index } = built.karaoke;
  const key = `${gameId}:${index}:0`;
  await atAsync(turn.songAt - 500, async () => {
    await say(host, device(1), { type:"hello", payload:{ view:"app", visible:true } }, true);
    await say(guest, device(2), { type:"hello", payload:{ view:"app", visible:true } });
    await say(tv, device(3), { type:"hello", payload:{ view:"tv", visible:true, tvVideo:{ key, state:"ready" } } });
  });
  let tvs = host.frames.findLast(frame => frame.type === "tvs").tvs;
  assert.deepEqual(tvs[0].video, { key, state:"ready", code:null, at:null });
  const version = tournament.version;
  /* playing, twelve seconds late: one write, broadcast to every screen */
  const playingAt = turn.songAt + 12_000;
  await atAsync(playingAt + 300, () => say(tv, device(3), { type:"ping", payload:{ view:"tv", visible:true,
    tvVideo:{ key, state:"playing", at:playingAt } } }));
  assert.equal(tournament.version, version + 1);
  const moved = karaokeTurn(tournament.state.karaoke);
  assert.deepEqual([moved.playedAt, moved.endAt], [playingAt, turn.endAt + 12_000]);
  assert.equal(tv.frames.findLast(frame => frame.type === "state").lastAction, "karaokeTvPlaying");
  assert.equal(karaokeTurn(tv.frames.findLast(frame => frame.type === "state").state.karaoke).playedAt, playingAt);
  tvs = host.frames.findLast(frame => frame.type === "tvs").tvs;
  assert.equal(tvs[0].video.state, "playing");
  /* every ping repeats the report: nothing more is written */
  for (let k = 0; k < 3; k++)
    await atAsync(playingAt + 5000 + k, () => say(tv, device(3), { type:"ping", payload:{ view:"tv", visible:true,
      tvVideo:{ key, state:"playing", at:playingAt + 9999 } } }));
  assert.equal(tournament.version, version + 1);
  /* junk is ignored, and a phone cannot pose as a TV */
  for (const junk of [{ key:"bad key!", state:"error", code:150 }, { key, state:"exploded" }, { key, state:"error", code:5000 },
    { key, state:"playing", at:"soon" }, "error", null])
    await atAsync(playingAt + 6000, () => say(tv, device(3), { type:"presence", payload:{ view:"tv", visible:true, tvVideo:junk } }));
  await atAsync(playingAt + 6000, () => say(guest, device(2), { type:"presence", payload:{ view:"app", visible:true,
    tvVideo:{ key, state:"error", code:150 } } }));
  assert.equal(tournament.version, version + 1);
  assert.equal(host.frames.findLast(frame => frame.type === "tvs").tvs.length, 1);
  /* an error: the next upload, once */
  for (let k = 0; k < 2; k++)
    await atAsync(playingAt + 7000, () => say(tv, device(3), { type:"presence", payload:{ view:"tv", visible:true,
      tvVideo:{ key, state:"error", code:150 } } }));
  assert.equal(tournament.version, version + 2);
  assert.equal(karaokeTurn(tournament.state.karaoke).video, 1);
  assert.equal(host.frames.findLast(frame => frame.type === "tvs").tvs[0].video.code, 150);
  /* bounded: the remembered reports never grow past their cap */
  for (let k = 0; k < 80; k++)
    await atAsync(playingAt + 8000, () => say(tv, device(3), { type:"presence", payload:{ view:"tv", visible:true,
      tvVideo:{ key:`kold${k}:0:0`, state:"error", code:2 } } }));
  assert.ok(tournament.tvVideoSeen.size <= 64);
  assert.equal(tournament.version, version + 2, "a report on another game changes nothing");
  /* presence only: never in state, never stored */
  assert.equal(JSON.stringify(tournament.state).includes("tvVideo"), false);
  assert.equal([...memory.entries.values()].some(value => JSON.stringify(value ?? null).includes("tvVideo")), false);
  assert.equal(JSON.stringify(tournament.state.karaoke).includes("\"state\":\"playing\""), false);
});

test("the Durable Object: Lock and start opens the window only with the capability, and the alarm runs karaoke's beats", async () => {
  const lock = async capability => {
    const memory = memoryContext();
    const tournament = new Tournament(memory.context, { APP_ENV:"local" });
    await tournament.hydrateFromStorage();
    tournament.gmToken = GM_TOKEN;
    tournament.state = announced();
    const capabilities = tournament.capabilities;
    Object.defineProperty(tournament, "capabilities", { get:() => ({ ...capabilities, karaoke:capability }) });
    const host = socketIn(memory);
    const say = message => tournament.webSocketMessage(host, JSON.stringify({ actionId:`a${++serial}`, deviceId:device(9),
      gmToken:GM_TOKEN, ...message }));
    await say({ type:"hello", payload:{ view:"app", visible:true } });
    const contest = resolveCurrentContest(tournament.state, karaokeEv(tournament.state));
    await say({ type:"lockAndStart", payload:{ evId:"karaoke", contestId:contest.id, contestRevision:contest.revision } });
    return { tournament, host };
  };
  const off = await lock(false);
  assert.equal(off.tournament.state.eventOps.karaoke.startedAt > 0, true);
  assert.equal(off.tournament.state.karaoke, null);
  const { tournament, host } = await lock(true);
  const game = tournament.state.karaoke;
  assert.equal(game.phase, "pick");
  await atAsync(game.pickUntil - 1000, () => tournament.alarm());
  assert.equal(tournament.state.karaoke.phase, "pick", "not yet");
  await atAsync(game.pickUntil, () => tournament.alarm());
  assert.equal(tournament.state.karaoke.phase, "turns");
  assert.equal(host.frames.findLast(frame => frame.type === "state").lastAction, "karaokeEndPick");
  const up = karaokeTurn(tournament.state.karaoke);
  await atAsync(up.upAt + KARAOKE_UP_MS, () => tournament.alarm());
  assert.equal(karaokeTurn(tournament.state.karaoke).songAt, up.upAt + KARAOKE_UP_MS + KARAOKE_SONG_LEAD_MS, "the song starts itself");
});

test("restart: a fresh pick window under a new id, every vote and lock-in gone; refused once posted; a rewind for the frame gate", () => {
  const state = room();
  const old = state.karaoke;
  at(old.startedAt + 100, () => act(state, "karaokeReady", { gameId:old.id }, as(ROSTER[1])));
  endPick(state);
  const turn = startSong(state);
  vote(state, karaokeVoters(state, karaokeSinger(state.karaoke))[0], 5, turn.songAt + 1);
  assert.equal(at(turn.songAt + 10, () => refuse(state, "karaokeRestart", { gameId:old.id })), "Confirm the restart");
  at(old.startedAt, () => act(state, "karaokeRestart", { gameId:old.id, confirm:true }));
  const fresh = state.karaoke;
  assert.notEqual(fresh.id, old.id, "a new id, even in the same millisecond");
  assert.deepEqual([fresh.phase, fresh.ready, fresh.votes, fresh.order, fresh.pickUntil],
    ["pick", {}, {}, [], old.startedAt + KARAOKE_PICK_MS]);
  assert.equal(refuse(state, "karaokeEndPick", { gameId:old.id }), "Karaoke moved on", "the old game's beats are stale");
  assert.ok(REWIND_ACTIONS.has("karaokeRestart"), "its frame never animates");
  endPick(state);
  playTurns(state, () => 4);
  take(state);
  assert.equal(refuse(state, "karaokeRestart", { gameId:state.karaoke.id, confirm:true }), "Clear the result first");
});

test("QA plays karaoke to its result in one write, the same way for a seed, and never touches a profile; its sims are QA's alone", () => {
  const T = Date.now();
  const played = () => {
    const state = structuredClone(EMPTY_STATE);
    act(state, "karaokeSong", { track:songOf(ROSTER[2]) }, as(ROSTER[2]));
    const profiles = structuredClone(state.profiles);
    at(T, () => act(state, "qaAdvance", { target:"event:karaoke:done", seed:7 }));
    return { state, profiles };
  };
  const { state, profiles } = played();
  const game = state.karaoke;
  assert.equal(game.phase, "done");
  assert.ok(state.results.karaoke);
  assert.deepEqual(state.results.karaoke.slots, karaokeResultSlots(game.ranking), "posted from the ranking");
  assert.equal(game.order.length, presentPlayers(state).length, "everyone sang (practice songs for the rest)");
  assert.equal(game.songs[ROSTER[2]].trackId, songOf(ROSTER[2]).trackId, "a saved song is sung");
  assert.equal(game.songs[ROSTER[3]].practice, true);
  assert.equal(karaokeTurn(game, game.order[0]).endAt - karaokeTurn(game, game.order[0]).songAt,
    game.order[0] === ROSTER[2] ? 180_000 : KARAOKE_PRACTICE_MS);
  for (const player of ROSTER) {
    assert.deepEqual(state.profiles[player]?.karaokeTrack, profiles[player]?.karaokeTrack, `${player}'s song untouched`);
    assert.equal(game.ranking.find(row => row.player === player)?.count > 0, true, `${player} got votes`);
  }
  assert.ok(state.results.karaoke.ts < karaokeTurn(game, game.order.at(-1)).closedAt, "the clock came back before the result");
  const again = played().state;
  assert.deepEqual(again.karaoke.order, game.order);
  assert.deepEqual(again.karaoke.ranking, game.ranking);
  assert.deepEqual(again.results.karaoke.slots, state.results.karaoke.slots);
  /* mid: the pick window, open */
  const mid = structuredClone(EMPTY_STATE);
  act(mid, "qaAdvance", { target:"event:karaoke:mid", seed:7 });
  assert.equal(mid.karaoke.phase, "pick");
  assert.equal(refuse(mid, "karaokeSimSongs", { gameId:mid.karaoke.id }, gm({ qa:false })), "QA is unavailable");
  assert.equal(refuse(mid, "karaokeSimSongs", { gameId:mid.karaoke.id }, as(ROSTER[1])), "Commissioner only");
  const sim = act(mid, "karaokeSimSongs", { gameId:mid.karaoke.id });
  assert.equal(sim.extra.songs, presentPlayers(mid).length);
  assert.equal(refuse(mid, "karaokeSimSongs", { gameId:mid.karaoke.id }), "Everyone is locked in");
  assert.ok(ROSTER.every(player => !mid.profiles[player]?.karaokeTrack), "practice songs live in the game only");
  assert.deepEqual(publicState(mid, { player:ROSTER[1] }).karaoke.songs, { [ROSTER[1]]:mid.karaoke.songs[ROSTER[1]] },
    "a practice song is its owner's until they are up");
  endPick(mid);
  const turn = startSong(mid);
  assert.equal(at(turn.songAt - 1, () => refuse(mid, "karaokeSimVotes", ref(mid))), "The vote is closed");
  assert.equal(refuse(mid, "karaokeSimVotes", ref(mid), gm({ qa:false })), "QA is unavailable");
  const votes = at(turn.songAt, () => act(mid, "karaokeSimVotes", ref(mid)));
  assert.equal(votes.extra.voted, karaokeVoters(mid, karaokeSinger(mid.karaoke)).length);
  assert.equal(at(turn.songAt, () => refuse(mid, "karaokeSimVotes", ref(mid))), "Everyone has voted");
});

test("QA's Finish event plays a karaoke game from wherever it stands", () => {
  const state = room({ songs:SINGERS.slice(0, 5) });
  endPick(state);
  const turn = startSong(state);
  vote(state, karaokeVoters(state, karaokeSinger(state.karaoke))[0], 6, turn.songAt + 10);
  act(state, "qaAdvance", { target:"finish", seed:7 });
  assert.equal(state.karaoke.phase, "done");
  assert.equal(state.karaoke.order.length, 5, "the songs drawn stay; nobody else joins mid-game");
  assert.deepEqual(state.results.karaoke.slots, karaokeResultSlots(state.karaoke.ranking));
});

test("QA crowned from empty plays karaoke on the way and stays fast", () => {
  const state = structuredClone(EMPTY_STATE);
  const started = performance.now();
  act(state, "qaAdvance", { target:"crowned", seed:7 });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 3000, `crowned took ${elapsed} ms`);
  assert.ok(state.frozen);
  assert.equal(state.karaoke.phase, "done");
  assert.deepEqual(state.results.karaoke.slots, karaokeResultSlots(state.karaoke.ranking));
});

test("Not coming: a song alone is no record; being in the game's order, locked in or voting is", () => {
  /* Jeremy saved his song ahead (a song saved in the window would lock him in) */
  const lone = ROSTER[12];
  const state = room({ songs:[ROSTER[1], ROSTER[2], lone] });
  act(state, "setOut", { player:lone, out:true });
  act(state, "setOut", { player:lone, out:false });
  at(state.karaoke.startedAt + 1, () => act(state, "karaokeReady", { gameId:state.karaoke.id }, as(lone)));
  assert.match(refuse(state, "setOut", { player:lone, out:true }), /is playing Karaoke/);
});

test("a progress reset clears the game and keeps everyone's song; a snapshot carries both", () => {
  const state = room();
  endPick(state);
  const entries = new Map([["state", state], ["version", 7], ["claims", {}]]);
  const snapshot = buildSnapshot(entries, { environment:"local", applicationVersion:"test" });
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(checked.entries.get("state").karaoke.id, state.karaoke.id);
  /* a stored game loads as it was; a state stored before karaoke loads with none */
  assert.deepEqual(hydrateStoredState(structuredClone(state)).karaoke, state.karaoke);
  const { karaoke:_, ...older } = structuredClone(state);
  assert.equal(hydrateStoredState(older).karaoke, null);
  act(state, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(state.karaoke, null);
  for (const player of SINGERS) assert.equal(state.profiles[player].karaokeTrack.video.id, songOf(player).video.id);
});
