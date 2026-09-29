/* D4 "Firsts and streaks": the weekend's facts, derived from the whole
   recorded history every time and never stored, so a reload says the same
   thing and a corrected result can take a fact away.

   A fact belongs to the write that made it true: an event result (with the
   final contest that posted it), a recorded contest, a duel, or a ruling.
   Each carries at most one fact; when several are true at once the rarest
   wins:
     streak  a player won 3+ events in a row among the events they played
             (crew duty and events they sat out do not break it)
     first   the first player to reach 2,000, 3,000, ... chips
     wins    a player's second or later event win
     (first  again: the leader who already held the last thousand passing
             the next one ranks under a win)
     bet     a new weekend high for one bet's payout, at least BET_FACT_MIN
   Each fact: { id, kind, at, anchor, players, text, own, tag }. `text` is
   for the room (the TV ticker); `own` is the line on that player's own
   receipt. */

import { ROSTER, START, allEventsOf, disp, teamLabel } from "../../../shared/core.js";
import { chipChanges, wagerSettlement } from "./lastCard.js";
import { wagerPickName } from "./resultMoment.js";
import { eventRow } from "../profile/seasonStats.js";

export const MILESTONE_STEP = 1000;
export const FIRST_MILESTONE = 2000;
export const STREAK_MIN = 3;
export const BET_FACT_MIN = 500;
const PRIORITY = { streak:4, first:3, wins:2, bet:1 };
const rank = fact => fact.kind === "first" && fact.repeat ? 1.5 : PRIORITY[fact.kind];
export const FACT_TAGS = Object.freeze({ streak:"Streak", first:"First", wins:"Milestone", bet:"Record" });

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
export const ordinalWord = n => {
  if (ORDINALS[n]) return ORDINALS[n];
  const tens = n % 100;
  return `${n}${tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
};
const capital = text => text.charAt(0).toUpperCase() + text.slice(1);

/* who a fact names: one or two names, a whole team by its label, or a count */
function subjectOf(state, evId, players) {
  const names = players.map(player => disp(state, player));
  if (names.length <= 2) return names.join(" and ");
  const team = state.draws?.[evId]?.teams?.find(item => item.players?.length === players.length
    && item.players.every(player => players.includes(player)));
  if (team) return teamLabel(state, team);
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names.length} players`;
}

const rosterOrder = player => { const i = ROSTER.indexOf(player); return i < 0 ? 999 : i; };
const byRoster = (a, b) => rosterOrder(a) - rosterOrder(b);

/* when a result was first posted: a correction keeps its place in the weekend */
const postedAt = result => Number(result?.confirmedAt || result?.ts) || 0;

/* The write a chip change came from. A final contest that posted its
   event's result is the same write as the result. */
function anchorOf(state, change) {
  if (change.kind === "award") return `result:${change.eventId}`;
  if (change.kind === "duel") return `duel:${change.id || change.at}`;
  if (change.kind === "ruling") return `ruling:${change.id || change.at}`;
  const { entry } = wagerSettlement(state, change.wager || {});
  if (entry && (entry.postedRevision === undefined || entry.postedRevision === null))
    return `contest:${change.eventId}:${entry.id}`;
  return state.results?.[change.eventId] ? `result:${change.eventId}` : `bet:${change.wager?.id || change.at}`;
}

/* the event results that count, oldest first */
function postedResults(state, events) {
  const order = new Map(events.map((event, index) => [event.id, index]));
  return Object.entries(state.results || {})
    .map(([evId, result]) => ({ evId, result, ev:events.find(event => event.id === evId) }))
    .filter(({ evId, result, ev }) => ev && !ev.finale && result && !result.stacks && !state.shelved?.[evId]
      && (result.slots?.[0] || []).length)
    .sort((a, b) => postedAt(a.result) - postedAt(b.result) || order.get(a.evId) - order.get(b.evId));
}

/* win counts and streaks, one candidate each per result */
function winFacts(state, events) {
  const wins = {}, streaks = {};
  const out = [];
  for (const { evId, result, ev } of postedResults(state, events)) {
    const winners = [...new Set(result.slots[0])].filter(player => ROSTER.includes(player));
    const played = new Set(winners);
    for (const player of ROSTER) {
      const row = eventRow(state, ev, player);
      if (row && (row.status === "placed" || row.status === "out")) played.add(player);
    }
    for (const player of played) streaks[player] = winners.includes(player) ? (streaks[player] || 0) + 1 : 0;
    for (const player of winners) wins[player] = (wins[player] || 0) + 1;
    const base = { at:postedAt(result), anchor:`result:${evId}` };
    const topStreak = Math.max(0, ...winners.map(player => streaks[player] || 0));
    if (topStreak >= STREAK_MIN) {
      const players = winners.filter(player => streaks[player] === topStreak).sort(byRoster);
      const ord = ordinalWord(topStreak);
      out.push({ ...base, id:`streak:${players.join("+")}:${topStreak}:${evId}`, kind:"streak", players, weight:topStreak,
        text:players.length === 1 ? `${disp(state, players[0])}'s ${ord} straight win`
          : `${capital(ord)} straight win for ${subjectOf(state, evId, players)}`,
        own:`Your ${ord} straight win` });
    }
    const topWins = Math.max(0, ...winners.map(player => wins[player] || 0));
    if (topWins >= 2) {
      const players = winners.filter(player => wins[player] === topWins).sort(byRoster);
      const ord = ordinalWord(topWins);
      out.push({ ...base, id:`wins:${players.join("+")}:${topWins}:${evId}`, kind:"wins", players, weight:topWins,
        text:players.length === 1 ? `${disp(state, players[0])}'s ${ord} win`
          : `${capital(ord)} win for ${subjectOf(state, evId, players)}`,
        own:`Your ${ord} win` });
    }
  }
  return out;
}

/* every chip change on the board grouped by the write it came from,
   oldest write first */
function chipWrites(state, events) {
  const writes = new Map();
  const kindOrder = { award:0, bet:1, duel:2, ruling:3 };
  for (const player of ROSTER) {
    for (const change of chipChanges(state, player, events)) {
      const anchor = anchorOf(state, change);
      const result = anchor.startsWith("result:") ? state.results?.[change.eventId] : null;
      /* a corrected result keeps the moment it was first posted */
      const at = result ? postedAt(result) : change.at;
      const write = writes.get(anchor) || { anchor, at, changes:[] };
      write.at = Math.min(write.at, at);
      write.changes.push({ ...change, at, player });
      writes.set(anchor, write);
    }
  }
  const list = [...writes.values()].sort((a, b) => a.at - b.at || (a.anchor < b.anchor ? -1 : a.anchor > b.anchor ? 1 : 0));
  list.forEach(write => write.changes.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || byRoster(a.player, b.player)));
  return list;
}

/* the first player to each thousand, from 2,000 */
function firstFacts(state, writes) {
  const pts = Object.fromEntries(ROSTER.map(player => [player, START]));
  let next = FIRST_MILESTONE, holders = [];
  const out = [];
  for (const write of writes) {
    for (const change of write.changes) pts[change.player] += change.delta;
    const top = Math.max(...Object.values(pts));
    if (top < next) continue;
    let reached = next;
    while (top >= reached + MILESTONE_STEP) reached += MILESTONE_STEP;
    next = reached + MILESTONE_STEP;
    const players = ROSTER.filter(player => pts[player] >= reached);
    const repeat = players.every(player => holders.includes(player));
    holders = players;
    const evId = write.changes.find(change => players.includes(change.player) && change.eventId)?.eventId || null;
    out.push({ id:`first:${reached}`, kind:"first", at:write.at, anchor:write.anchor, players, weight:reached, repeat,
      text:`First to ${fmt(reached)}: ${subjectOf(state, evId, players)}`, own:`First to ${fmt(reached)}` });
  }
  return out;
}

/* a new high for what one bet paid; a pick's chips settle as one bet */
function betFacts(state, writes) {
  let high = 0;
  const out = [];
  for (const write of writes) {
    const bets = new Map();
    for (const change of write.changes) {
      if (change.kind !== "bet" || change.status !== "won") continue;
      const pick = wagerPickName(state, change.wager);
      const key = `${change.player}|${change.eventId}|${pick}`;
      const bet = bets.get(key) || { player:change.player, pick, delta:0, ids:[] };
      bet.delta += change.delta;
      bet.ids.push(change.wager?.id || "");
      bets.set(key, bet);
    }
    const best = [...bets.values()].sort((a, b) => b.delta - a.delta || byRoster(a.player, b.player))[0];
    if (!best || best.delta <= high) continue;
    high = best.delta;
    if (best.delta < BET_FACT_MIN) continue;
    out.push({ id:`bet:${best.ids.sort()[0]}`, kind:"bet", at:write.at, anchor:write.anchor, players:[best.player],
      weight:best.delta, text:`Biggest bet paid: ${disp(state, best.player)}, +${fmt(best.delta)} on ${best.pick}`,
      own:"Biggest bet paid yet" });
  }
  return out;
}

/* Every fact of the weekend so far, oldest first. */
export function weekendFacts(state, events = allEventsOf(state)) {
  if (!state?.results) return [];
  const writes = chipWrites(state, events);
  const byAnchor = new Map();
  for (const fact of [...winFacts(state, events), ...firstFacts(state, writes), ...betFacts(state, writes)]) {
    const list = byAnchor.get(fact.anchor) || [];
    list.push(fact);
    byAnchor.set(fact.anchor, list);
  }
  /* one fact per write: the rarest, then the biggest */
  return [...byAnchor.values()].map(list => {
    const best = [...list].sort((a, b) => rank(b) - rank(a) || b.weight - a.weight
      || byRoster(a.players[0], b.players[0]))[0];
    const { weight, repeat, ...fact } = best;
    return { ...fact, at:Math.min(...list.map(item => item.at)), tag:FACT_TAGS[fact.kind] };
  }).sort((a, b) => a.at - b.at || (a.anchor < b.anchor ? -1 : a.anchor > b.anchor ? 1 : 0));
}

/* The fact this step made true about `me`, for their receipt: new in
   `state`, absent from `prevState`, naming them. Newest wins. */
export function freshFactFor(prevState, state, me, events = allEventsOf(state)) {
  if (!prevState || !state || !me) return null;
  const before = new Set(weekendFacts(prevState, allEventsOf(prevState)).map(fact => fact.id));
  const mine = weekendFacts(state, events).filter(fact => !before.has(fact.id) && fact.players.includes(me));
  return mine.length ? mine[mine.length - 1] : null;
}
