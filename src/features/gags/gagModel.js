/* Gags (Oct 8): the bowling alley's cartoon screens, for the room. Short,
   full-canvas and silly in the drawing and the sound, and always on the
   same outcomes:
     turkey    a player's 3rd (or later) straight win
     strike    an upset: the side the stored odds named underdog won
     gutter    one bettor lost GUTTER_MIN or more on the decided contest
     vultures  an event result leaves a new player alone in last place
   One gag per write, in that order. The lettering is a fact and a name;
   the joke is in the drawing.

   Derived from state on every TV and never stored, keyed to the write's
   own server time, so every TV in the house plays a gag together and a
   reload agrees. A contest decided mid-event plays right after its advance
   moment (decidedAt + TV_ADVANCE_MS); a posted result (a free-for-all's,
   or the final whose winner tap posted it in the same write) plays over
   the tail of its podium (posted + RESULT_GAG_AT_MS). When that write's
   win song walks out first, the gag plays once the walkout has left
   (moments/walkout.js walkoutSpan, the window the TV's walkout plays in).
   The next contest's face-off waits for a contest's gag (gagHoldMs,
   faceOff.js). Only the newest write plays, and only until the next
   lifecycle write. Never with Gags off (state.gagsOff), on a frozen board,
   at the poker table, or under any other walkout. The QA console's test
   (state.gagTest) plays its kind with a stand-in cast (shared/gags.js).

   Pure: nothing here reads a clock beyond the `now` it is handed, or
   writes state. */

import {
  START, ROSTER, rosterOf, allEventsOf, contestStackOf, disp, resolveSlot, resolveWager, stageEntrantView,
  stageFinalists, teamLabel, wagerMatchesContest,
} from "../../../shared/core.js";
import { GAG_KINDS, GAG_TEST_AMOUNT } from "../../../shared/gags.js";
import { contestOfEntry } from "../wagers/betStacks.js";
import { floodColor } from "../identity/chipInk.js";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import { eventRow } from "../profile/seasonStats.js";
import { chipWrites } from "../results/weekendFacts.js";
import { WALKOUT_CLEAR_MS, walkoutForWrite, walkoutSpan } from "../moments/walkout.js";
import { RESULT_SORT_DELAY_MS, RESULT_STANDINGS_AT_MS, TV_ADVANCE_MS, lastLifecycleWrite } from "../tv/tvModel.js";

export { GAG_KINDS };
export const TURKEY_MIN = 3;
export const GUTTER_MIN = 500;

/* ms from a gag's start: each kind's beats, read by the drawing (as CSS
   custom properties) and the room's sound (roomSound.js gagCues) alike.
   About four seconds each: lean in, the move, the stamp, a beat to read
   it, lift off. */
export const GAG_TIMING = Object.freeze({
  /* struts in, fans its tail of chips (a gobble), three X marks stamp a
     beat apart, the count and the name, a second gobble, lifts off */
  turkey:Object.freeze({ strut:120, strutMs:1100, fan:1250, gobble:1300, x:Object.freeze([1600, 1900, 2200]),
    count:2450, name:2650, gobble2:2900, out:3650, total:4100 }),
  /* the lane, the winner rolls in as the ball, the crash, UPSET, the name */
  strike:Object.freeze({ roll:300, rollMs:1050, hit:1350, word:1700, name:1950, out:3650, total:4100 }),
  /* the bettor rolls, wobbles, drops into the gutter and rolls past ten
     standing pins (they shiver) and off the end; the amount and the name;
     the trombone */
  gutter:Object.freeze({ roll:250, wobble:900, drop:1450, pass:2380, off:2950, amount:1550, name:1750, sad:2000, out:3450,
    total:3900 }),
  /* the wind, the vultures circle the chip on the floor, the place and the
     name, a squawk as they leave */
  vultures:Object.freeze({ birds:150, squawk:950, place:1300, name:1500, away:2900, squawk2:2950, out:3550, total:4000 }),
});
export const GAG_MS = Object.freeze(Object.fromEntries(GAG_KINDS.map(kind => [kind, GAG_TIMING[kind].total])));
/* over a posted result: once 1st has stood on its podium a while (its
   beat is 2.4 s in), and lifted before the towers re-sort */
export const RESULT_GAG_AT_MS = 4400;
export const RESULT_GAG_END_MS = RESULT_STANDINGS_AT_MS + RESULT_SORT_DELAY_MS;
/* a QA test plays this long after its write reaches the TVs */
export const GAG_TEST_LEAD_MS = 300;
/* a final and the result it posted are one write */
const SAME_WRITE_MS = 2000;

const known = value => value !== null && value !== undefined;
const postedAt = res => Number(res?.confirmedAt || res?.ts) || 0;
const rosterRank = player => { const i = ROSTER.indexOf(player); return i < 0 ? 999 : i; };
const sameSet = (a = [], b = []) => a.length === b.length && a.every(item => b.includes(item));
export const ordinal = n => {
  const v = Math.max(0, Math.floor(Number(n) || 0)), tens = v % 100;
  return `${v}${tens >= 11 && tens <= 13 ? "th" : v % 10 === 1 ? "st" : v % 10 === 2 ? "nd" : v % 10 === 3 ? "rd" : "th"}`;
};

/* Gags play on a live board only: never once it is crowned, and never
   while the poker table holds the room (dealt or live). With the switch
   off nothing is derived; a QA test still plays. */
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

/* Every write that can carry a gag, oldest first: each recorded contest,
   and each posted result. A final whose winner tap posted its event's
   result rides that result's write (its `entry`). Shelved events and the
   poker finale never count. */
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
   step names who it brought to TURKEY_MIN or more, the longest run first,
   then roster order. */
export function winStreaks(state, events = allEventsOf(state)) {
  const streak = {};
  return gagWrites(state, events).map(write => {
    const results = writeResults(state, write);
    const reached = [];
    for (const [player, value] of results) {
      streak[player] = value === "W" ? (streak[player] || 0) + 1 : 0;
      if (value === "W" && streak[player] >= TURKEY_MIN) reached.push({ player, count:streak[player] });
    }
    reached.sort((a, b) => b.count - a.count || rosterRank(a.player) - rosterRank(b.player));
    return { write, results, reached };
  });
}

/* ── one gag per write ── */

/* the side a write's win went to, as the room names it: a recorded
   contest's winner, or a result's 1st (a drawn team by its name) */
function winnerSide(state, write) {
  if (write.entry) return entrySides(state, write.ev.id, write.entry)?.win || null;
  const first = write.res?.slots?.[0] || [];
  const team = (state.draws?.[write.ev.id]?.teams || []).find(item => sameSet(item?.players || [], first));
  return first.length ? { players:[...first], name:team ? teamLabel(state, team) : teamLabel(state, { players:first }) } : null;
}

/* up to three more turkeys follow the lead; the rest are counted. A whole
   side on the same run letters its side's name ("Adi & Chiang"); anyone
   else, the lead's own. */
export const TURKEY_FOLLOWERS = 3;
function turkeyOf(state, write, reached) {
  if (!reached?.length) return null;
  const [lead, ...rest] = reached;
  const side = reached.length > 1 ? winnerSide(state, write) : null;
  const together = !!side && reached.every(item => item.count === lead.count)
    && sameSet(side.players, reached.map(item => item.player));
  return { kind:"turkey", players:[lead.player, ...rest.slice(0, TURKEY_FOLLOWERS).map(item => item.player)],
    more:Math.max(0, rest.length - TURKEY_FOLLOWERS), count:lead.count,
    name:together ? side.name : disp(state, lead.player) };
}

/* an upset: the stored odds named the winner the underdog */
function strikeOf(state, write) {
  const op = state.eventOps?.[write.ev.id] || {};
  if (write.entry) {
    const odds = op.odds?.[write.entry.id];
    if (!odds || !known(odds.underdog) || odds.underdog !== write.entry.winner) return null;
    const sides = entrySides(state, write.ev.id, write.entry);
    if (!sides) return null;
    const beaten = sides.lose[0] || null;
    return { kind:"strike", players:sides.win.players, name:sides.win.name,
      beaten:beaten?.players || [], beatenName:beaten?.name || null };
  }
  if (write.type !== "result" || write.contests) return null;
  /* a two-sided game played as one result (the full court) keeps its odds
     under its free-for-all contest */
  const draw = state.draws?.[write.ev.id];
  if (draw?.teams?.length !== 2) return null;
  const odds = op.odds?.[`ffa:${write.ev.id}:${draw.id}`];
  if (!odds || !known(odds.underdog)) return null;
  const dog = draw.teams[odds.underdog], other = draw.teams[odds.underdog === 0 ? 1 : 0];
  if (!dog?.players?.length || !sameSet(dog.players, write.res.slots[0] || [])) return null;
  return { kind:"strike", players:[...dog.players], name:teamLabel(state, dog),
    beaten:[...(other?.players || [])], beatenName:other ? teamLabel(state, other) : null };
}

/* the biggest single loss on the decided contest (or a free-for-all's
   result), net of what that bettor won on it */
function gutterOf(state, events, write) {
  const contest = write.entry ? contestOfEntry(write.ev.id, write.entry) : null;
  const counts = contest ? wager => wagerMatchesContest(wager, contest)
    : write.type === "result" && !write.contests ? wager => wager.eventId === write.ev.id && wager.kind === "outright" : null;
  if (!counts) return null;
  const net = new Map();
  for (const wager of state.wagers || []) {
    if (!counts(wager)) continue;
    const r = resolveWager(state, wager, events);
    if (r.status !== "won" && r.status !== "lost") continue;
    net.set(wager.player, (net.get(wager.player) || 0) + r.delta);
  }
  let worst = null;
  for (const [player, delta] of net)
    if (delta < 0 && (!worst || delta < worst.delta || (delta === worst.delta && rosterRank(player) < rosterRank(worst.player))))
      worst = { player, delta };
  if (!worst || -worst.delta < GUTTER_MIN) return null;
  return { kind:"gutter", players:[worst.player], amount:-worst.delta, name:disp(state, worst.player) };
}

/* the one player alone at the bottom of a board, or null */
export function aloneLast(pts = {}) {
  const players = Object.keys(pts);
  if (!players.length) return null;
  const low = Math.min(...players.map(player => pts[player]));
  const at = players.filter(player => pts[player] === low);
  return at.length === 1 ? at[0] : null;
}
/* An event result that leaves a different player alone in last place than
   before it. The boards before and after are summed from the chip changes
   grouped by write (weekendFacts chipWrites), so every TV and a reload
   read the same "before". */
function vulturesOf(state, events, write) {
  if (write.type !== "result") return null;
  const roster = rosterOf(state);
  const writes = chipWrites(state, events);
  const index = writes.findIndex(item => item.anchor === `result:${write.ev.id}`);
  if (index < 0) return null;
  const pts = Object.fromEntries(roster.map(player => [player, START]));
  const apply = item => item.changes.forEach(change => { if (pts[change.player] !== undefined) pts[change.player] += change.delta; });
  writes.slice(0, index).forEach(apply);
  const before = aloneLast(pts);
  apply(writes[index]);
  const after = aloneLast(pts);
  if (!after || after === before) return null;
  return { kind:"vultures", players:[after], place:ordinal(roster.length), name:disp(state, after) };
}

/* the one gag a write carries, the rarest first */
export function gagForWrite(state, events, write, reached = []) {
  if (!write) return null;
  return turkeyOf(state, write, reached) || strikeOf(state, write) || gutterOf(state, events, write)
    || vulturesOf(state, events, write);
}

/* When a write's gag starts: after a contest's advance moment, or over the
   tail of a result's podium. `walkout` is the win song that write started
   (walkoutForWrite): one that began before then has the room first, and
   the gag plays WALKOUT_CLEAR_MS after it leaves. A song that began after
   (a slow speaker) finds the gag on the TV, and the gag gives way to it
   (walkoutHolds), never to play again. */
export function gagStartOf(write, walkout = null) {
  const start = write.type === "result" ? write.at + RESULT_GAG_AT_MS : write.at + TV_ADVANCE_MS;
  return walkout && walkout.startedAt < start ? Math.max(start, walkout.end + WALKOUT_CLEAR_MS) : start;
}

/* the players a write's win went to, whose win song it can start */
export const winnersOf = (state, write) => winnerSide(state, write)?.players || [];

/* A walkout on the TV (walkoutSpan) that overlaps a gag's window holds the
   room: the gag is skipped, never queued. */
export const walkoutHolds = (span, gag) => !!span && !!gag && span.anchor < gag.end && span.end > gag.start;

const windowed = (gag, start) => ({ ...gag, start, ms:GAG_MS[gag.kind], end:start + GAG_MS[gag.kind] });

/* a write's gag with its window: after its own win song when that walked
   out first, else where gagStartOf puts it */
function gagView(state, events, write, reached) {
  const gag = gagForWrite(state, events, write, reached);
  if (!gag) return null;
  const own = walkoutForWrite(state, events, { at:write.at, players:winnersOf(state, write) });
  return windowed({ ...gag, id:`${write.key}:${gag.kind}`, write:write.key, evId:write.ev.id, at:write.at }, gagStartOf(write, own));
}

/* The gag the newest write owes the room, with its window, or null. A
   later lifecycle write (the next contest locked, the next event
   announced) owns the TV, so the gag is gone with it. */
export function latestGag(state, events = allEventsOf(state)) {
  if (!gagsOn(state)) return null;
  const steps = winStreaks(state, events);
  const last = steps[steps.length - 1];
  if (!last) return null;
  const { write, reached } = last;
  if (lastLifecycleWrite(state) > write.at + SAME_WRITE_MS) return null;
  const view = gagView(state, events, write, reached);
  return walkoutHolds(walkoutSpan(state, events), view) ? null : view;
}

/* The QA console's test (qaGag): its kind with the stand-in cast, from just
   after its write. It plays with Gags off (it was asked for), never on a
   frozen board or at the poker table, and never under a walkout. */
export function testGag(state, events = allEventsOf(state)) {
  const test = state?.gagTest;
  if (!test || !GAG_KINDS.includes(test.kind) || !gagsAllowed(state)) return null;
  const at = Number(test.at) || 0;
  const players = (Array.isArray(test.players) ? test.players : []).filter(player => typeof player === "string" && player);
  if (!at || !players.length) return null;
  const base = { id:`test:${at}:${test.kind}`, write:`test:${at}`, test:true, at, kind:test.kind };
  const name = disp(state, players[0]);
  const gag = test.kind === "turkey" ? { ...base, players:[players[0]], more:0, count:TURKEY_MIN, name }
    : test.kind === "strike" ? { ...base, players:[players[0]], name, beaten:players.slice(1, 2),
      beatenName:players[1] ? disp(state, players[1]) : null }
      : test.kind === "gutter" ? { ...base, players:[players[0]], amount:Number(test.amount) || GAG_TEST_AMOUNT, name }
        : { ...base, players:[players[0]], place:ordinal(rosterOf(state).length), name };
  const view = windowed(gag, at + GAG_TEST_LEAD_MS);
  return walkoutHolds(walkoutSpan(state, events), view) ? null : view;
}

/* everything the TV may play, by window: the test, then the newest write's */
export function gagPlan(state, events = allEventsOf(state)) {
  return [testGag(state, events), latestGag(state, events)].filter(Boolean);
}
/* the planned gag whose window holds `now`, or null */
export function gagAt(plan, now) {
  const t = Number(now);
  return (plan || []).find(gag => t >= gag.start && t < gag.end) || null;
}
/* the next instant a planned gag starts or ends after `now` (the TV wakes
   for it), or null */
export function nextGagEdge(plan, now) {
  const t = Number(now);
  const edges = (plan || []).flatMap(gag => [gag.start, gag.end]).filter(edge => edge > t);
  return edges.length ? Math.min(...edges) : null;
}

/* The frame's chase and the lettering's lamp. A win is its winner's own
   moment, so the turkey and the strike light in the winner's flood color
   (the Lit Flood rule) and run quick; a gutter ball and the vultures are
   losses, in the clay, at the rest pace. */
/* the loss's lamp: a fill and a light (the frame's bulbs, the glow behind
   the lettering), never the color of text */
const LOSS_LAMP = "var(--clay)";
export function gagLamp(state, gag) {
  if (!gag) return null;
  if (gag.kind === "turkey" || gag.kind === "strike")
    return { color:floodColor(resolvePlayerIdentity(state?.profiles, gag.players?.[0]).color), pace:"run" };
  return { color:LOSS_LAMP, pace:"rest" };
}

/* How long past its advance moment the gag owed by `ev`'s newest decision
   holds the room: until its window ends, after the win song that decision
   started when that walks out first (gagView), else 0. The next contest's
   face-off (faceOffStart), a new leader's card and its S15 wait this long.
   Read from the state each time, so the walkout's own write, a second or
   two after the decision's, moves them with the gag. A gag a late song
   took the room from still holds its own window. */
export function gagHoldMs(state, ev, events = allEventsOf(state)) {
  const last = ev ? state?.eventOps?.[ev.id]?.lastContest : null;
  if (!last?.decidedAt || !gagsOn(state)) return 0;
  const step = winStreaks(state, events).find(item => item.write.type === "contest"
    && item.write.ev.id === ev.id && item.write.entry?.id === last.id);
  const view = step ? gagView(state, events, step.write, step.reached) : null;
  return view ? Math.max(0, view.end - (step.write.at + TV_ADVANCE_MS)) : 0;
}
