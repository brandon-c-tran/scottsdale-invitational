/* Karaoke on the phone, as fixtures (docs/KARAOKE.md): games built straight
   from the contract for the fit audit (dev/fit/scenarios.js) and the phone's
   tests (tests/karaoke-phone.test.mjs), while the server's karaoke writes
   live on their own branch. The base is real (qaAdvance to Karaoke, Lock and
   start through the real reducers, no karaoke capability, so no game); the
   game itself is written by hand the way the writes would write it, through
   shared/karaoke.js's own helpers (cleanKaraokeTrack, karaokeSnapshot,
   karaokeGameId, karaokeSchedule, karaokeRanking, karaokeLegendary), every
   instant relative to `now`. No cover art and no real video: nothing here
   ever loads Spotify or YouTube media.

   karaokePhoneStage(stage, { now }) -> state, seen by KARAOKE_FIT_VIEWER:
     ahead        the event open for bets, no game yet, the viewer without a song
     pick         the pick window, the viewer's song picked ahead, six locked in
     pick-none    the same, the viewer without a song
     pick-broken  the same, the viewer's video failed the window's check
     pick-locked  the same, the viewer locked in
     up           the viewer's walk-up (three have sung)
     singing      the viewer's song playing
     up-watch     the next singer's walk-up, the viewer's turn closed
     legendary    the viewer's turn just closed Legendary, the next singer up after the rain
     vote         the next singer's song playing, the viewer not voted yet
     voted        the same, the viewer's Epic in
     closing      that song over, its vote still open, the viewer not voted
     closed       that vote past its close, the write still owed
     reveal       every singer done, the reveal mid-way (eight rows turned)
   Pure apart from the reducers it calls; deterministic. */
import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, resolveCurrentContest } from "../../shared/core.js";
import {
  KARAOKE_LEGENDARY_MS, KARAOKE_ORDER_HOLD_MS, KARAOKE_PICK_MS, KARAOKE_SONG_LEAD_MS, KARAOKE_UP_MS, KARAOKE_VOTE_GRACE_MS,
  cleanKaraokeTrack, karaokeGameId, karaokeLegendary, karaokeRanking, karaokeSchedule, karaokeSeed, karaokeSnapshot,
} from "../../shared/karaoke.js";
import { applyAction } from "../../worker/actions.js";

export const KARAOKE_FIT_VIEWER = "Richard";
const EVENT = "karaoke";
/* the running order the window's end drew (written by hand, so the viewer
   sings fourth), and the one present player who had no song and sat out */
export const KARAOKE_FIT_ORDER = Object.freeze(["Evan", "Khoa", "Sahil", "Richard", "Henry", "Adi", "Brandon", "Chinh",
  "Jeremy", "Chiang", "Eyob", "Allan"]);
export const KARAOKE_FIT_OUT = Object.freeze(["Ben"]);
const VIEWER_AT = KARAOKE_FIT_ORDER.indexOf(KARAOKE_FIT_VIEWER);

/* each singer's song: title, artists, the karaoke upload's length in s.
   The viewer's carries a release suffix (the phone drops it) and a long
   name; Henry's a long title and a long artist. */
const SONGS = Object.freeze({
  Evan:["Mr. Brightside", ["The Killers"], 228],
  Khoa:["Wonderwall", ["Oasis"], 262],
  Sahil:["Livin' on a Prayer", ["Bon Jovi"], 251],
  Richard:["Bohemian Rhapsody - Remastered 2011", ["Queen"], 296],
  Henry:["Don't Stop Me Now ... Or Ever, the Extended Singalong", ["Earth, Wind & Fire", "The Chicago Horns"], 245],
  Adi:["Toxic", ["Britney Spears"], 199],
  Brandon:["Sweet Caroline", ["Neil Diamond"], 203],
  Chinh:["I Want It That Way", ["Backstreet Boys"], 213],
  Jeremy:["Africa", ["Toto"], 272],
  Chiang:["Hey Ya!", ["OutKast"], 236],
  Eyob:["Mamma Mia", ["ABBA"], 212],
  Allan:["All Star", ["Smash Mouth"], 201],
});
/* how the room rates each singer (a vote lands around it) */
const QUALITY = Object.freeze({ Evan:4, Khoa:3, Sahil:5, Richard:4, Henry:4, Adi:2, Brandon:5, Chinh:3, Jeremy:4, Chiang:1,
  Eyob:5, Allan:3 });

const pad = (value, n, fill) => String(value).padEnd(n, fill).slice(0, n);
export function karaokeFitTrack(player, { now = Date.now() } = {}) {
  const [name, artists, seconds] = SONGS[player];
  const k = KARAOKE_FIT_ORDER.indexOf(player) + 1;
  const trackId = pad(`fitKaraoke${k}${player}`, 22, "x").replace(/[^A-Za-z0-9]/g, "x");
  const video = id => ({ id, title:`${artists[0]} - ${name} (Karaoke Version)`, channel:"Stingray Karaoke", seconds });
  return cleanKaraokeTrack({ provider:"spotify", trackId, uri:`spotify:track:${trackId}`, name, artists, durationMs:seconds * 1000 + 600,
    imageUrl:null, explicit:false, video:video(pad(`fitkv${k}a`, 11, "0")),
    alts:[{ ...video(pad(`fitkv${k}b`, 11, "0")), channel:"Sing King Stand-in" }], at:now - 86400000, checkedAt:now - 86400000 }, { now });
}

let serial = 0;
const gm = () => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:"Brandon", deviceId:"fit-karaoke",
  actionId:`karaoke-${++serial}`, showControl:false });
function run(state, type, payload) {
  const result = applyAction(state, type, payload, gm());
  if (!result.ok) throw new Error(`${type}: ${result.error}`);
}
/* Karaoke announced and open for bets; `start`: locked and started too */
function base({ start = true } = {}) {
  const state = structuredClone(EMPTY_STATE);
  run(state, "qaAdvance", { target:`event:${EVENT}:open`, seed:7, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true });
  if (start) {
    const ev = allEventsOf(state).find(item => item.id === EVENT);
    const contest = resolveCurrentContest(state, ev);
    run(state, "lockAndStart", { evId:EVENT, contestId:contest.id, contestRevision:contest.revision, startWeekend:true });
  }
  return state;
}
/* every singer's song on their profile (the one who sat out has none) */
function withSongs(state, now, { viewer = true } = {}) {
  for (const player of KARAOKE_FIT_ORDER) {
    if (player === KARAOKE_FIT_VIEWER && !viewer) continue;
    state.profiles[player] = { ...(state.profiles[player] || {}), karaokeTrack:karaokeFitTrack(player, { now }) };
  }
  return state;
}
const newGame = startedAt => ({
  id:karaokeGameId(EVENT, startedAt), eventId:EVENT, startedAt, phase:"pick", pickUntil:startedAt + KARAOKE_PICK_MS, moreTime:0,
  ready:{}, broken:{}, order:[], out:[], songs:{}, index:-1, turns:{}, votes:{}, revealAt:null, ranking:null, empty:false,
  finishedAt:null, ops:{},
});
/* a vote around the singer's quality, one tier either way by the voter */
const tierFor = (singer, voter) => Math.max(1, Math.min(6, QUALITY[singer] + (karaokeSeed(`${singer}:${voter}`) % 3) - 1));
/* the room's votes on a turn: everyone present but the singer, a voter in
   five sitting it out (`skip`), each at its own moment of the song */
function votesOn(game, singer, turn, { skip = true, legendary = false, without = [] } = {}) {
  const voters = [...KARAOKE_FIT_ORDER, ...KARAOKE_FIT_OUT].filter(player => player !== singer && !without.includes(player));
  const votes = {};
  voters.forEach((voter, k) => {
    if (skip && karaokeSeed(`${singer}~${voter}`) % 5 === 0) return;
    const tier = legendary && k % 3 !== 2 ? 6 : tierFor(singer, voter);
    votes[voter] = { tier, at:turn.songAt + 20000 + k * 7000 };
  });
  return votes;
}
/* a turn from its walk-up, its song started by its own write */
function turnAt(game, singer, upAt) {
  const songAt = upAt + KARAOKE_UP_MS + KARAOKE_SONG_LEAD_MS;
  return { upAt, ...karaokeSchedule(game.songs[singer], songAt), video:0, playedAt:songAt + 900, failed:null, cut:false,
    skipped:false, later:false, closedAt:null, legendary:false };
}
/* The window's end and the first `count` singers sung through their
   closed votes, the last closing at `end` (the next singer is up then, or
   after the rain on a Legendary close): the order drawn, every song copied
   into the game, the window before the first walk-up. `legendary`: the
   viewer's vote closes Legendary. */
function playThrough(game, count, end, { legendary = false } = {}) {
  const spans = KARAOKE_FIT_ORDER.slice(0, count).map(singer =>
    KARAOKE_UP_MS + KARAOKE_SONG_LEAD_MS + Math.min(SONGS[singer][2] * 1000, 300000) + 6000);
  let at = end - spans.reduce((sum, span) => sum + span, 0);
  game.pickUntil = at - KARAOKE_ORDER_HOLD_MS;
  game.startedAt = game.pickUntil - KARAOKE_PICK_MS;
  game.id = karaokeGameId(EVENT, game.startedAt);
  game.phase = "turns";
  game.order = [...KARAOKE_FIT_ORDER];
  game.out = [...KARAOKE_FIT_OUT];
  KARAOKE_FIT_ORDER.forEach((player, k) => { game.ready[player] = game.startedAt + 4000 + k * 5300; });
  KARAOKE_FIT_ORDER.slice(0, count).forEach((singer, k) => {
    const turn = turnAt(game, singer, at);
    game.votes[singer] = votesOn(game, singer, turn, { legendary:legendary && singer === KARAOKE_FIT_VIEWER });
    turn.closedAt = turn.endAt + 6000;
    turn.legendary = karaokeLegendary(game.votes[singer]);
    game.turns[singer] = turn;
    at += spans[k];
  });
}

export function karaokePhoneStage(stage = "pick", { now = Date.now() } = {}) {
  if (stage === "ahead") {
    const state = withSongs(base({ start:false }), now, { viewer:false });
    state.updatedAt = now;
    return state;
  }
  const state = base();
  state.updatedAt = now;
  const pick = stage.startsWith("pick");
  withSongs(state, now, { viewer:stage !== "pick-none" });
  const game = newGame(now - 36000);
  state.karaoke = game;
  for (const player of KARAOKE_FIT_ORDER) game.songs[player] = karaokeSnapshot(state.profiles[player].karaokeTrack);

  if (pick) {
    game.songs = {};
    /* six of the room locked in, a few seconds apart */
    ["Evan", "Sahil", "Brandon", "Adi", "Jeremy", "Eyob"].forEach((player, k) => { game.ready[player] = game.startedAt + 3000 + k * 4100; });
    if (stage === "pick-broken") game.broken[KARAOKE_FIT_VIEWER] = 150;
    if (stage === "pick-locked") game.ready[KARAOKE_FIT_VIEWER] = now - 2000;
    return state;
  }

  /* the turns: the viewer's own (up, singing), everyone through the
     viewer's (the next singer's moments), or everyone (the reveal) */
  const sung = ["up", "singing"].includes(stage) ? VIEWER_AT : stage === "reveal" ? KARAOKE_FIT_ORDER.length : VIEWER_AT + 1;
  const singer = KARAOKE_FIT_ORDER[sung] || null;

  if (stage === "reveal") {
    const end = now - 12500;
    playThrough(game, sung, end);
    game.index = KARAOKE_FIT_ORDER.length - 1;
    game.phase = "reveal";
    game.ranking = karaokeRanking(game);
    game.revealAt = end;
    return state;
  }

  /* the current turn's song: playing for a while (singing, vote), over 7 s
     ago with its vote open (closing), past its vote's close (closed) */
  const length = Math.min(SONGS[singer][2] * 1000, 300000);
  const songAt = stage === "singing" ? now - 52000 : stage === "vote" || stage === "voted" ? now - 45000
    : stage === "closing" ? now - 7000 - length : stage === "closed" ? now - KARAOKE_VOTE_GRACE_MS - 400 - length : null;
  /* its walk-up: now for the viewer's and the next singer's, after the
     rain for a Legendary close */
  const upAt = songAt !== null ? songAt - KARAOKE_UP_MS - KARAOKE_SONG_LEAD_MS
    : stage === "legendary" ? now - 1000 + KARAOKE_LEGENDARY_MS : stage === "up" ? now - 5000 : now - 6000;
  /* the turn before closes as the walk-up starts (Legendary: before the rain) */
  playThrough(game, sung, stage === "legendary" ? now - 1000 : upAt, { legendary:stage === "legendary" });
  game.index = sung;
  const turn = turnAt(game, singer, upAt);
  if (songAt === null) Object.assign(turn, { songAt:null, endAt:null, closeAt:null, playedAt:null });
  game.turns[singer] = turn;
  if (songAt !== null) {
    game.votes[singer] = votesOn(game, singer, turn, { without:[KARAOKE_FIT_VIEWER] });
    /* the song's votes so far: only those cast by now */
    for (const [voter, vote] of Object.entries(game.votes[singer])) if (vote.at > now) delete game.votes[singer][voter];
  }
  if (stage === "voted") game.votes[singer][KARAOKE_FIT_VIEWER] = { tier:5, at:now - 20000 };
  return state;
}
