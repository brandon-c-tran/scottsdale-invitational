/* Gags (Oct 8; the bits since Oct 10): the room's comic moments. A write
   that carries one plays a bit (bits/registry.js) on the TV, and on the
   phones of the players it is about, at the same server instant. Five
   triggers, at most one per write, the first that holds:
     upset    the stored odds named the winner the underdog    versus
     streak   a player's 3rd (or later) straight win            win
     leader   a posted result leaves a new player alone in 1st  win
     bigloss  one bettor lost BIG_LOSS_MIN or more on the write loss
     last     a posted result leaves a new player alone in last loss
   The shape picks the pool; pickBit picks the bit, seeded by the write's
   key so every screen picks the same one, never one its shape played on
   the gag writes before it (momentLog replays them in order) while
   another remains. The lettering is a name and a fact; the joke is in the
   bit.

   Derived from state on every screen and never stored, keyed to the
   write's own server time, so every TV and phone plays a moment together
   and a reload agrees. A contest decided mid-event plays right after its
   advance moment (decidedAt + TV_ADVANCE_MS); a posted result (a
   free-for-all's, or the final whose winner tap posted it in the same
   write) plays over its podium once 1st has stood, lifting off as the
   towers re-sort (resultGagAt). The bit plays AT the moment (Oct 14):
   the write's win song comes in on a beat of it (shared/bitMusic.js, the
   Worker times it from this same model) or, for a songless bit, after it.
   A music bit holds its wind-up while the song is on its way (gagSong:
   the Worker's cue, then the walkout that carries the bit), which moves
   its second clock (`origin`) and its window's end. A loss whose write
   finds a win song still playing may cut it (needle scratch: the song log
   in showControl.audio.songs says which moments had one). The next
   contest's face-off waits for a contest's bit (gagHoldMs, faceOff.js).
   Only the newest write plays, and only until the next lifecycle write.
   Never with Gags off (state.gagsOff), on a frozen board, at the poker
   table, or under another win song's walkout. The QA console's test
   (state.gagTest) plays its bit on the TVs with a stand-in cast
   (shared/gags.js).

   Pure: nothing here reads a clock beyond the `now` it is handed, or
   writes state. The Worker imports it (worker/tournament.js), so its
   imports stay free of React and the DOM (tests/gags.test.mjs scans). */

import {
  START, ROSTER, rosterOf, allEventsOf, contestStackOf, contestUpset, disp, priceText, resolveSlot, stageEntrantView, stageFinalists, teamLabel,
} from "../../../shared/core.js";
import { GAG_SHAPES, GAG_TEST_AMOUNT } from "../../../shared/gags.js";
import { TEAM_MAX, bitById, isTeamBit, pickBit, poolKey, poolOf } from "./bits/registry.js";
import { floodColor } from "../identity/chipInk.js";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import { eventRow } from "../profile/seasonStats.js";
import { chipWrites } from "../results/weekendFacts.js";
import { walkoutSpan } from "../moments/walkoutModel.js";
import { songCueOf, songLogOf, songPlayingAt, walkoutOf } from "../../../shared/audio.js";
import { bitOrigin } from "../../../shared/bitMusic.js";
import { RESULT_PODIUM_BEATS_MS, RESULT_SORT_DELAY_MS, RESULT_STANDINGS_AT_MS, TV_ADVANCE_MS, lastLifecycleWrite }
  from "../tv/tvModel.js";

export { GAG_SHAPES };
/* the triggers, the first that holds wins a write, and the shape each plays */
export const GAG_TRIGGERS = Object.freeze(["upset", "streak", "leader", "bigloss", "last"]);
export const TRIGGER_SHAPE = Object.freeze({ upset:"versus", streak:"win", leader:"win", bigloss:"loss", last:"loss" });
export const STREAK_MIN = 3;
export const BIG_LOSS_MIN = 1000;
/* the facts lettered under the name (the streak's count and the loss's
   amount are the moment's own) */
export const UPSET_FACT = "Upset";
export const LEADER_FACT = "In the lead";
/* Over a posted result: once 1st has stood on its podium (its beat is
   2.4 s in) a second, and lifted off as the towers re-sort, so a bit up
   to five seconds long ends on the sort and a longer one starts with 1st
   standing (its lift-off then runs into the sort's first beat). */
export const RESULT_GAG_AT_MS = RESULT_PODIUM_BEATS_MS[RESULT_PODIUM_BEATS_MS.length - 1] + 1000;
export const RESULT_GAG_END_MS = RESULT_STANDINGS_AT_MS + RESULT_SORT_DELAY_MS;
export const resultGagAt = ms => Math.max(RESULT_GAG_AT_MS, RESULT_GAG_END_MS - (Number(ms) || 0));
/* a QA test plays this long after its write reaches the TVs */
export const GAG_TEST_LEAD_MS = 300;
/* a final and the result it posted are one write */
const SAME_WRITE_MS = 2000;
/* a loss may cut a win song only when one plays from its write on for at
   least this long (it outlasts the bit's way to its cut) */
export const SCRATCH_RUNWAY_MS = 4000;

const known = value => value !== null && value !== undefined;
const postedAt = res => Number(res?.confirmedAt || res?.ts) || 0;
const rosterRank = player => { const i = ROSTER.indexOf(player); return i < 0 ? 999 : i; };
const sameSet = (a = [], b = []) => a.length === b.length && a.every(item => b.includes(item));
const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
export const ordinal = n => {
  const v = Math.max(0, Math.floor(Number(n) || 0)), tens = v % 100;
  return `${v}${tens >= 11 && tens <= 13 ? "th" : v % 10 === 1 ? "st" : v % 10 === 2 ? "nd" : v % 10 === 3 ? "rd" : "th"}`;
};
export const streakFact = count => `${count} in a row`;
export const lossFact = amount => `-${fmt(amount)}`;

/* Moments play on a live board only: never once it is crowned, and never
   while the poker table holds the room (dealt or live). With the switch
   off nothing plays; a QA test still does. */
export const gagsAllowed = state => !!state && !state.frozen && !(state.poker && !state.results?.[state.poker.id]);
export const gagsOn = state => gagsAllowed(state) && !state.gagsOff;

/* ── the record ── */

/* a recorded contest as sides: the winner's players and name, each side it
   beat, and the qualifiers a heat let through beside its winner (they
   neither won nor lost). Null when the draw or the stages moved on. */
export function entrySides(state, evId, entry) {
  if (!entry || !known(entry.winner)) return null;
  const draw = state.draws?.[evId];
  if (entry.kind === "match") {
    const br = state.brackets?.[evId];
    const match = br?.rounds?.[entry.match?.[0]]?.[entry.match?.[1]];
    if (!draw?.teams || !match || (entry.drawId && draw.id !== entry.drawId)) return null;
    const team = key => draw.teams[key];
    if (!team(entry.winner)?.players?.length) return null;
    const beaten = [resolveSlot(br, match.a), resolveSlot(br, match.b)]
      .filter(key => known(key) && key !== entry.winner && team(key)?.players?.length);
    return { win:{ key:entry.winner, players:[...team(entry.winner).players], name:teamLabel(state, team(entry.winner)) },
      lose:beaten.map(key => ({ key, players:[...team(key).players], name:teamLabel(state, team(key)) })), even:[] };
  }
  const st = state.stages?.[evId];
  if (!st || (entry.stagesId && st.id !== entry.stagesId)) return null;
  if (st.entrantType === "team" && (!draw || (st.drawId && draw.id !== st.drawId))) return null;
  const side = key => {
    try {
      const view = stageEntrantView(state, { ...st, eventId:evId }, key);
      return { key, players:[...(view?.players || [])], name:view?.name || "" };
    } catch { return { key, players:[], name:"" }; }
  };
  let beaten = [], even = [];
  if (entry.kind === "heat") {
    const group = st.groups?.[entry.group];
    if (!group) return null;
    const through = group.through || [];
    beaten = (group.entrants || []).filter(key => key !== entry.winner && !through.includes(key));
    even = through.filter(key => key !== entry.winner);
  } else beaten = (stageFinalists(st) || []).filter(key => key !== entry.winner);
  const win = side(entry.winner);
  if (!win.players.length) return null;
  return { win, lose:beaten.map(side).filter(item => item.players.length), even:even.map(side) };
}

/* Every write that can carry a moment, oldest first: each recorded
   contest, and each posted result. A final whose winner tap posted its
   event's result rides that result's write (its `entry`). Shelved events
   and the poker finale never count. */
export function gagWrites(state, events = allEventsOf(state)) {
  const writes = [];
  events.forEach((ev, order) => {
    if (!ev || ev.finale || state.shelved?.[ev.id]) return;
    const res = state.results?.[ev.id];
    const posted = res && !res.stacks && (res.slots?.[0] || []).length ? postedAt(res) : 0;
    const stack = contestStackOf(state, ev.id);
    const top = stack[stack.length - 1] || null;
    const rides = !!posted && !!top && (known(top.postedRevision)
      || Math.abs(posted - (Number(top.decidedAt) || 0)) <= SAME_WRITE_MS);
    stack.forEach((entry, index) => {
      const at = Number(entry?.decidedAt) || 0;
      if (!at || (rides && entry === top)) return;
      writes.push({ key:`contest:${ev.id}:${entry.id}`, type:"contest", ev, entry, at, order, index });
    });
    if (posted) writes.push({ key:`result:${ev.id}`, type:"result", ev, res, at:posted, order, index:stack.length,
      entry:rides ? top : null, contests:stack.length > 0 });
  });
  return writes.sort((a, b) => a.at - b.at || a.order - b.order || a.index - b.index);
}

/* What one write did to each player: W to the winning side, L to each side
   it beat. A free-for-all's result (an event with no recorded contests)
   gives W to 1st and L to everyone else who played it; an event played as
   contests counts through them, never twice through its result. */
export function writeResults(state, write) {
  const out = new Map();
  const roster = new Set(rosterOf(state));
  const mark = (players, value) => (players || []).forEach(player => { if (roster.has(player)) out.set(player, value); });
  if (write.entry) {
    const sides = entrySides(state, write.ev.id, write.entry);
    if (sides) { sides.lose.forEach(side => mark(side.players, "L")); mark(sides.win.players, "W"); }
    return out;
  }
  if (write.type !== "result" || write.contests) return out;
  const first = write.res.slots[0] || [];
  for (const player of rosterOf(state)) {
    if (first.includes(player)) { out.set(player, "W"); continue; }
    const row = eventRow(state, write.ev, player);
    if (row && (row.status === "placed" || row.status === "out")) out.set(player, "L");
  }
  return out;
}

/* The weekend's writes with each player's run of straight wins: every
   step names who it brought to STREAK_MIN or more, the longest run first,
   then roster order. */
export function winStreaks(state, events = allEventsOf(state)) {
  const streak = {};
  return gagWrites(state, events).map(write => {
    const results = writeResults(state, write);
    const reached = [];
    for (const [player, value] of results) {
      streak[player] = value === "W" ? (streak[player] || 0) + 1 : 0;
      if (value === "W" && streak[player] >= STREAK_MIN) reached.push({ player, count:streak[player] });
    }
    reached.sort((a, b) => b.count - a.count || rosterRank(a.player) - rosterRank(b.player));
    return { write, results, reached };
  });
}

/* the one player alone at the top, or the bottom, of a board; or null */
function alone(pts = {}, pick) {
  const players = Object.keys(pts);
  if (!players.length) return null;
  const edge = pick(...players.map(player => pts[player]));
  const at = players.filter(player => pts[player] === edge);
  return at.length === 1 ? at[0] : null;
}
export const aloneFirst = pts => alone(pts, Math.max);
export const aloneLast = pts => alone(pts, Math.min);

/* The chip changes of every write (weekendFacts chipWrites, keyed by the
   same `contest:` and `result:` keys as gagWrites) and who was alone at
   the top and the bottom of the board just before and just after each, so
   every screen and a reload read the same "before"; a later ruling never
   moves an earlier write's. */
function boardHistory(state, events) {
  const pts = Object.fromEntries(rosterOf(state).map(player => [player, START]));
  const changes = new Map(), boards = new Map();
  for (const write of chipWrites(state, events)) {
    const before = { first:aloneFirst(pts), last:aloneLast(pts) };
    write.changes.forEach(change => { if (pts[change.player] !== undefined) pts[change.player] += change.delta; });
    boards.set(write.anchor, { before, after:{ first:aloneFirst(pts), last:aloneLast(pts) } });
    changes.set(write.anchor, write.changes);
  }
  return { changes, boards };
}
/* the chip writes a moment write is made of: a result with the final it rode */
const anchorsOf = write => write.type === "result"
  ? [`result:${write.ev.id}`, ...(write.entry ? [`contest:${write.ev.id}:${write.entry.id}`] : [])] : [write.key];

/* ── the triggers ── */

/* the side a write's win went to, as the room names it: a recorded
   contest's winner, or a result's 1st (a drawn team by its name) */
function winnerSide(state, write) {
  if (write.entry) return entrySides(state, write.ev.id, write.entry)?.win || null;
  const first = write.res?.slots?.[0] || [];
  const team = (state.draws?.[write.ev.id]?.teams || []).find(item => sameSet(item?.players || [], first));
  return first.length ? { players:[...first], name:team ? teamLabel(state, team) : teamLabel(state, { players:first }) } : null;
}

/* An upset: the winner's side was priced UPSET_PRICE or longer when betting
   locked (a contest opened before pools: its stored odds named the winner
   the underdog). A two-sided game played as one result (the full court)
   prices it under its free-for-all contest. Returns the winning and beaten
   team indexes for that, {} for a recorded contest. */
export function upsetPick(state, write) {
  if (write.entry) {
    const { upset, price } = contestUpset(state, write.ev.id, write.entry.id, write.entry.winner);
    return upset ? { price } : null;
  }
  if (write.type !== "result" || write.contests) return null;
  const draw = state.draws?.[write.ev.id];
  if (draw?.teams?.length !== 2) return null;
  const win = draw.teams.findIndex(team => team?.players?.length && sameSet(team.players, write.res?.slots?.[0] || []));
  if (win < 0) return null;
  const { upset, price } = contestUpset(state, write.ev.id, `ffa:${write.ev.id}:${draw.id}`, win);
  return upset ? { win, lose:1 - win, price } : null;
}
/* the upset lettered with what it paid ("4.2×"), else the word */
const upsetFact = pick => pick?.price ? priceText(pick.price) : UPSET_FACT;
function upsetOf(state, write) {
  const pick = upsetPick(state, write);
  if (!pick) return null;
  if (write.entry) {
    const sides = entrySides(state, write.ev.id, write.entry);
    if (!sides) return null;
    const beaten = sides.lose[0] || null;
    return { trigger:"upset", players:sides.win.players, name:sides.win.name, fact:upsetFact(pick),
      beaten:beaten?.players || [], beatenName:beaten?.name || null };
  }
  const draw = state.draws[write.ev.id];
  const dog = draw.teams[pick.win], other = draw.teams[pick.lose];
  return { trigger:"upset", players:[...dog.players], name:teamLabel(state, dog), fact:upsetFact(pick),
    beaten:[...(other?.players || [])], beatenName:other ? teamLabel(state, other) : null };
}

/* a run of straight wins: everyone the write brought there, the longest
   first. A whole side on the same run letters its side's name ("Adi &
   Chiang"); anyone else, the lead's own. */
function streakOf(state, write, reached) {
  if (!reached?.length) return null;
  const [lead] = reached;
  const side = reached.length > 1 ? winnerSide(state, write) : null;
  const together = !!side && reached.every(item => item.count === lead.count)
    && sameSet(side.players, reached.map(item => item.player));
  return { trigger:"streak", players:reached.map(item => item.player), beaten:[], count:lead.count,
    name:together ? side.name : disp(state, lead.player), fact:streakFact(lead.count) };
}

/* a posted result that leaves a different player alone at the top (or
   the bottom) of the board than before it */
function boardEdge(state, write, history, edge) {
  if (write.type !== "result") return null;
  const board = history.boards.get(`result:${write.ev.id}`);
  const player = board?.after?.[edge];
  return player && player !== board.before[edge] ? player : null;
}
function leaderOf(state, write, history) {
  const player = boardEdge(state, write, history, "first");
  return player ? { trigger:"leader", players:[player], beaten:[], name:disp(state, player), fact:LEADER_FACT } : null;
}
function lastOf(state, write, history) {
  const player = boardEdge(state, write, history, "last");
  const place = ordinal(rosterOf(state).length);
  return player ? { trigger:"last", players:[player], beaten:[], place, name:disp(state, player), fact:place } : null;
}

/* the biggest single loss on the write's bets (a decided contest, or a
   result with the final it rode), net of what that bettor won on it */
function bigLossOf(state, write, history) {
  const net = new Map();
  for (const anchor of anchorsOf(write))
    for (const change of history.changes.get(anchor) || [])
      if (change.kind === "bet") net.set(change.player, (net.get(change.player) || 0) + (Number(change.delta) || 0));
  let worst = null;
  for (const [player, delta] of net)
    if (delta < 0 && (!worst || delta < worst.delta || (delta === worst.delta && rosterRank(player) < rosterRank(worst.player))))
      worst = { player, delta };
  if (!worst || -worst.delta < BIG_LOSS_MIN) return null;
  return { trigger:"bigloss", players:[worst.player], beaten:[], amount:-worst.delta, name:disp(state, worst.player),
    fact:lossFact(-worst.delta) };
}

/* the one moment a write carries, the first trigger that holds */
function triggerOf(state, step, history) {
  const { write, reached } = step;
  return upsetOf(state, write) || streakOf(state, write, reached) || leaderOf(state, write, history)
    || bigLossOf(state, write, history) || lastOf(state, write, history);
}

/* The bits a shape played before, as pickBit takes them: this round of
   the pool so far, and at a round's start the newest alone, so a round
   plays every bit once and no bit plays twice running. */
export function recentFor(history = [], poolSize = 1) {
  const n = Math.max(1, Number(poolSize) || 1);
  const k = history.length % n;
  return k ? history.slice(-k) : history.slice(-1);
}

/* The weekend's moment writes, oldest first: every write (winStreaks),
   each with its moment or null, the bit picked for each in order. A
   moment whose larger side has 3 or more plays a team bit (the registry's
   poolOf), and each pool (a shape's solo bits, its team bits) keeps its
   own rotation. */
export function momentLog(state, events = allEventsOf(state)) {
  const steps = winStreaks(state, events);
  if (!steps.length) return [];
  const history = boardHistory(state, events);
  const songs = songLogOf(state);
  const played = {};
  return steps.map(step => {
    const found = triggerOf(state, step, history);
    if (!found) return { ...step, moment:null };
    const shape = TRIGGER_SHAPE[found.trigger];
    const sides = { a:found.players || [], b:shape === "versus" ? found.beaten || [] : [] };
    const key = poolKey(shape, sides);
    const ran = played[key] || (played[key] = []);
    /* a loss written while a win song plays may cut it (needle scratch) */
    const when = { songPlaying:shape === "loss" && songPlayingAt(songs, step.write.at, SCRATCH_RUNWAY_MS) };
    const bit = pickBit(shape, step.write.key, recentFor(ran, poolOf(shape, sides).length), sides, when);
    if (!bit) return { ...step, moment:null };
    ran.push(bit.id);
    return { ...step, moment:{ ...found, shape, bit:bit.id, ms:bit.span } };
  });
}

/* ── when ── */

/* When a write's moment starts: after a contest's advance moment, or over
   its result's podium (resultGagAt, by the bit's length). The bit plays
   at the moment; the write's win song meets it on its beat (Oct 14). */
export function gagStartOf(write, ms = 0) {
  return write.type === "result" ? write.at + resultGagAt(ms) : write.at + TV_ADVANCE_MS;
}

/* The win song on a moment's beat (shared/bitMusic.js), from the record:
     none     no song is coming on it (no Spotify, a songless bit, a miss)
     pending  the Worker means to play it (showControl.audio.cue) and the
              speaker has not taken it yet: a music bit holds its wind-up
     set      the walkout that plays it carries the moment (walkout.bit)
              and when the room hears it (audibleAt) */
export function gagSong(state, gagId) {
  if (!gagId) return { status:"none" };
  const walkout = walkoutOf(state);
  if (walkout?.bit === gagId && Number.isFinite(Number(walkout.audibleAt))) return { status:"set", audibleAt:Number(walkout.audibleAt) };
  const cue = songCueOf(state);
  return cue?.gag === gagId ? { status:"pending", at:cue.at } : { status:"none" };
}

/* the players a write's win went to, whose win song it can start */
export const winnersOf = (state, write) => winnerSide(state, write)?.players || [];

/* A walkout on the TV (walkoutSpan) that overlaps a moment's window holds
   the room: the moment is skipped, never queued. */
export const walkoutHolds = (span, gag) => !!span && !!gag && span.anchor < gag.end && span.end > gag.start;

/* a moment's window: from its start until its bit has run its span on its
   second clock (a music bit held for its song ends that much later, one
   whose song came early that much sooner) */
function windowed(gag, start, song = { status:"none" }) {
  const origin = bitOrigin(bitById(gag.bit), start, song);
  return { ...gag, start, origin, song, end:origin + gag.ms };
}

/* a logged moment with its window, where gagStartOf puts it, and the win
   song on its beat */
function gagView(state, events, step) {
  const { write, moment } = step;
  if (!moment) return null;
  const id = `${write.key}:${moment.trigger}`;
  return windowed({ ...moment, id, write:write.key, evId:write.ev.id, at:write.at, winners:winnersOf(state, write) },
    gagStartOf(write, moment.ms), gagSong(state, id));
}

/* The moment the newest write owes the room, with its window, or null. A
   later lifecycle write (the next contest locked, the next event
   announced) owns the TV, so the moment is gone with it. */
export function latestGag(state, events = allEventsOf(state)) {
  if (!gagsOn(state)) return null;
  const log = momentLog(state, events);
  const last = log[log.length - 1];
  if (!last?.moment) return null;
  if (lastLifecycleWrite(state) > last.write.at + SAME_WRITE_MS) return null;
  const view = gagView(state, events, last);
  return walkoutHolds(walkoutSpan(state, events), view) ? null : view;
}

/* the fact a QA test letters, by its shape */
const TEST_FACT = Object.freeze({ versus:UPSET_FACT, win:streakFact(STREAK_MIN), loss:lossFact(GAG_TEST_AMOUNT) });

/* The QA console's test (qaGag): its bit (a named one, or one of its
   shape's picked by its write) with the stand-in cast, from just after its
   write. It plays with Gags off (it was asked for), never on a frozen
   board or at the poker table, never under a walkout, and only on the
   TVs (its audience is nobody's phone). */
export function testGag(state, events = allEventsOf(state)) {
  const test = state?.gagTest;
  if (!test || !GAG_SHAPES.includes(test.shape) || !gagsAllowed(state)) return null;
  const at = Number(test.at) || 0;
  const players = (Array.isArray(test.players) ? test.players : []).filter(player => typeof player === "string" && player);
  if (!at || !players.length) return null;
  const named = test.bit ? bitById(test.bit) : null;
  if (test.bit && named?.shape !== test.shape) return null;
  const beaten = (Array.isArray(test.beaten) ? test.beaten : []).filter(player => typeof player === "string" && player);
  const bit = named || pickBit(test.shape, `test:${at}`, [], { a:players, b:test.shape === "versus" ? beaten : [] });
  if (!bit) return null;
  /* a team bit plays its whole team (the board's, qaGag); a solo bit its lead */
  const team = isTeamBit(bit);
  const side = team ? players.slice(0, TEAM_MAX) : players.slice(0, 1);
  const view = windowed({ id:`test:${at}:${bit.id}`, write:`test:${at}`, test:true, at, trigger:null, shape:test.shape,
    bit:bit.id, ms:bit.span, players:side,
    beaten:test.shape !== "versus" ? [] : team ? beaten.slice(0, TEAM_MAX) : beaten.slice(0, 1),
    name:team ? teamLabel(state, { players:side }) : disp(state, players[0]), fact:TEST_FACT[test.shape] }, at + GAG_TEST_LEAD_MS);
  return walkoutHolds(walkoutSpan(state, events), view) ? null : view;
}

/* everything the TV may play, by window: the test, then the newest write's */
export function gagPlan(state, events = allEventsOf(state)) {
  return [testGag(state, events), latestGag(state, events)].filter(Boolean);
}
/* the planned moment whose window holds `now`, or null */
export function gagAt(plan, now) {
  const t = Number(now);
  return (plan || []).find(gag => t >= gag.start && t < gag.end) || null;
}
/* the next instant a planned moment starts or ends after `now` (the TV
   wakes for it), or null */
export function nextGagEdge(plan, now) {
  const t = Number(now);
  const edges = (plan || []).flatMap(gag => [gag.start, gag.end]).filter(edge => edge > t);
  return edges.length ? Math.min(...edges) : null;
}

/* ── who sees it ── */

/* the bit's cast by its roles: a versus's winners (a) and the side they
   beat (b); anyone else's players (a) */
export const gagCast = gag => ({ a:[...(gag?.players || [])], b:gag?.shape === "versus" ? [...(gag?.beaten || [])] : [] });
/* The players a moment is about, whose phones play it with the TV: both
   sides of an upset, a win's winners, a loss's loser. A QA test is the
   TVs' alone. */
export function gagAudience(gag) {
  if (!gag || gag.test) return [];
  return gag.shape === "versus" ? [...new Set([...(gag.players || []), ...(gag.beaten || [])])] : [...(gag.players || [])];
}
/* the moment the newest write owes `player`'s own phone, or null */
export function gagForPlayer(state, events, player) {
  if (!player) return null;
  const gag = latestGag(state, events);
  return gag && gagAudience(gag).includes(player) ? gag : null;
}

/* The frame's chase and the lettering's lamp. A win is its winner's own
   moment, so a versus and a win light in the winner's flood color (the Lit
   Flood rule) and run quick; a loss is in the clay, at the rest pace. */
/* the loss's lamp: a fill and a light (the frame's bulbs, the glow behind
   the lettering), never the color of text */
const LOSS_LAMP = "var(--clay)";
export function gagLamp(state, gag) {
  if (!gag) return null;
  if (gag.shape === "loss") return { color:LOSS_LAMP, pace:"rest" };
  return { color:floodColor(resolvePlayerIdentity(state?.profiles, gag.players?.[0]).color), pace:"run" };
}

/* How long past its advance moment the bit owed by `ev`'s newest decision
   holds the room: until its window ends, after the win song that decision
   started when that walks out first (gagView), else 0. The next contest's
   face-off (faceOffStart), a new leader's card and its S15 wait this long.
   Read from the state each time, so the walkout's own write, a second or
   two after the decision's, moves them with the bit. A bit a late song
   took the room from still holds its own window. */
export function gagHoldMs(state, ev, events = allEventsOf(state)) {
  const last = ev ? state?.eventOps?.[ev.id]?.lastContest : null;
  if (!last?.decidedAt || !gagsOn(state)) return 0;
  const step = momentLog(state, events).find(item => item.write.type === "contest"
    && item.write.ev.id === ev.id && item.write.entry?.id === last.id);
  const view = step ? gagView(state, events, step) : null;
  return view ? Math.max(0, view.end - (step.write.at + TV_ADVANCE_MS)) : 0;
}
