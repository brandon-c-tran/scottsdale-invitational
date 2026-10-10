/* Rivalries and records (Oct 10): the weekend's own records for the TV's
   downtime, one card a turn, so the room argues about them. Derived from
   the record every time and never stored, so a correction, an undone
   contest, a voided bet or a shelved event changes them the way it changes
   the board. A card exists only with real data behind it: no data, no card,
   never a "No rivalries yet".

     h2h      players who met in MIN_MEETINGS or more decided contests, by
              the player card's own head-to-head (seasonStats eventMeetings:
              bracket matches, heats, stage finals and two-sided games, a
              pair or a team counting for each member; and settled Quick
              Draws). Teammates with the very same record against the same
              opponents stand as one side. The closest first, then the most
              lopsided, then the most played.
     swing    the biggest chip change one write made for one player (an
              event's result, a decided contest's bets, a duel), up or down;
              rulings are the commissioner's, never a swing.
     streak   the longest run of straight wins (gags' winStreaks), STREAK_MIN
              or more.
     upsets   the most wins as the side the stored odds named underdog.
     bettor   the best net from settled bets, and the worst.
     fastest  the fastest Quick Draw reaction in a settled duel.
     duels    the most Quick Draw wins.
   A record shared by more than MAX_SHARED players is no record.

   Pure: no clock beyond the `now` it is handed, no writes. */

import { allEventsOf, resolveDuel, resolveWager, rosterOf } from "../../../shared/core.js";
import { eventMeetings } from "../profile/seasonStats.js";
import { entrySides, gagWrites, winStreaks } from "../gags/gagModel.js";
import { chipWrites } from "../results/weekendFacts.js";
import { TV_AMBIENT_TURN_MS } from "./tvModel.js";

export const MIN_MEETINGS = 2;
export const H2H_MAX = 3;
/* a side merged from teammates stands at most this many */
export const H2H_SIDE_MAX = 4;
export const SWING_MIN = 500;
export const STREAK_MIN = 3;
export const UPSETS_MIN = 2;
export const BETTOR_MIN = 500;
export const DUEL_WINS_MIN = 2;
export const MAX_SHARED = 3;
/* a flash never tapped records Quick Draw's cap (QuickDraw.jsx QD_MAX_MS):
   a time, but no reaction */
export const UNTAPPED_MS = 5000;

/* each card's one label: one to three words, the lilac label on the glass */
export const RECORD_LABELS = Object.freeze({ h2h:"Head to head", swing:"Biggest swing", streak:"Longest streak",
  upsets:"Most upsets", bettor:"Best bettor", worst:"Worst bettor", fastest:"Fastest draw", duels:"Most duel wins" });
export const recordLabel = card => !card ? "" : card.kind === "bettor" && card.worst ? RECORD_LABELS.worst
  : RECORD_LABELS[card.kind] || "";

const known = value => value !== null && value !== undefined;
const byOrder = order => (a, b) => order.indexOf(a) - order.indexOf(b);

/* ── head to head ── */

/* Every pair's record, keyed both ways ("a|b" from a's side): the wins and
   losses the player card reads (headToHead: event meetings plus settled
   Quick Draws, pushes counted as neither), and a signature of exactly
   which contests they met in and who won each. */
function pairRecords(state, events, roster) {
  const duels = (state.duels || []).map(duel => ({ duel, result:resolveDuel(duel) }))
    .filter(item => item.result.settled && !item.result.push);
  const records = new Map();
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i], b = roster[j];
      const marks = eventMeetings(state, a, b, events).map(meeting => ({ key:`${meeting.eventId}|${meeting.label}`, won:!!meeting.won }));
      for (const { duel, result } of duels) {
        if (!((duel.from === a && duel.to === b) || (duel.from === b && duel.to === a))) continue;
        marks.push({ key:`duel|${duel.id}`, won:result.winner === a });
      }
      if (!marks.length) continue;
      const won = marks.filter(mark => mark.won).length, lost = marks.length - won;
      const sig = flip => marks.map(mark => `${mark.key}|${mark.won !== flip ? "W" : "L"}`).sort().join("/");
      records.set(`${a}|${b}`, { won, lost, sig:sig(false) });
      records.set(`${b}|${a}`, { won:lost, lost:won, sig:sig(true) });
    }
  }
  return records;
}

/* Rivalries as sides: a pair that met MIN_MEETINGS or more, widened by every
   teammate with the very same record against every opponent on the other
   side (so two pairs who met twice are one card, never four). Each block is
   complete: every player on one side has that record against every player
   on the other, and every pair stands in one block only. The side with
   more wins stands first. */
export function rivalryBlocks(state, events = allEventsOf(state)) {
  const roster = rosterOf(state);
  const records = pairRecords(state, events, roster);
  const sigOf = (x, y) => records.get(`${x}|${y}`)?.sig ?? null;
  const covered = new Set();
  const blocks = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i], b = roster[j];
      const record = records.get(`${a}|${b}`);
      if (!record || record.won + record.lost < MIN_MEETINGS || covered.has(`${a}|${b}`)) continue;
      const sig = record.sig;
      const joins = (x, y) => sigOf(x, y) === sig && !covered.has(`${x}|${y}`);
      let left = [a], right = [b];
      for (let pass = 0; pass < 2; pass++) {
        for (const x of roster) if (!left.includes(x) && !right.includes(x) && right.every(y => joins(x, y))) left.push(x);
        for (const y of roster) if (!left.includes(y) && !right.includes(y) && left.every(x => joins(x, y))) right.push(y);
      }
      left.forEach(x => right.forEach(y => { covered.add(`${x}|${y}`); covered.add(`${y}|${x}`); }));
      /* a side too big to stand on one card keeps the pair that found it */
      if (left.length > H2H_SIDE_MAX || right.length > H2H_SIDE_MAX) { left = [a]; right = [b]; }
      left.sort(byOrder(roster));
      right.sort(byOrder(roster));
      const sides = [{ players:left, wins:record.won }, { players:right, wins:record.lost }];
      if (record.lost > record.won) sides.reverse();
      blocks.push({ sides, meetings:record.won + record.lost, margin:Math.abs(record.won - record.lost),
        order:Math.min(roster.indexOf(a), roster.indexOf(b)) * roster.length + Math.max(roster.indexOf(a), roster.indexOf(b)) });
    }
  }
  return blocks;
}

const h2hCard = block => ({
  id:`h2h:${block.sides.map(side => side.players.join("+")).join(":")}`,
  kind:"h2h",
  players:block.sides.flatMap(side => side.players),
  sides:block.sides.map(side => ({ players:[...side.players], wins:side.wins })),
  meetings:block.meetings,
});

/* the closest rivalry (dead even beats a one-win lead, more meetings beat
   fewer), then the most lopsided (two or more apart), then the most played */
export function headToHeadCards(state, events = allEventsOf(state)) {
  const blocks = rivalryBlocks(state, events);
  if (!blocks.length) return [];
  const pick = [];
  const take = (list, ok = () => true) => {
    const next = list.find(block => !pick.includes(block) && ok(block));
    if (next && pick.length < H2H_MAX) pick.push(next);
  };
  take([...blocks].sort((x, y) => x.margin - y.margin || y.meetings - x.meetings || x.order - y.order));
  take([...blocks].sort((x, y) => y.margin - x.margin || y.meetings - x.meetings || x.order - y.order), block => block.margin >= 2);
  take([...blocks].sort((x, y) => y.meetings - x.meetings || x.margin - y.margin || x.order - y.order));
  return pick.map(h2hCard);
}

/* ── the biggest swing ── */

/* what a write was: the event it settled (a result, a decided contest's
   bets), or a Quick Draw and who it was against */
function causeOf(write, player, events) {
  const change = write.changes.find(item => item.player === player) || write.changes[0];
  if (write.anchor.startsWith("duel:")) return { kind:"duel", against:change?.other ? [change.other] : [] };
  const ev = events.find(item => item.id === change?.eventId);
  return ev ? { kind:"event", evId:ev.id, name:ev.name, game:ev.game || null, variant:ev.variant || null } : null;
}

export function swingCard(state, events = allEventsOf(state)) {
  const roster = rosterOf(state);
  let best = null;
  for (const write of chipWrites(state, events)) {
    if (write.anchor.startsWith("ruling:")) continue;
    const net = new Map();
    for (const change of write.changes) {
      if (change.kind === "ruling" || !roster.includes(change.player)) continue;
      net.set(change.player, (net.get(change.player) || 0) + change.delta);
    }
    /* the bigger change, a gain over a loss of the same size, else the first
       to set it: writes run oldest first, a write's players in roster order */
    for (const player of roster) {
      const amount = net.get(player) || 0;
      if (!amount) continue;
      if (!best || Math.abs(amount) > Math.abs(best.amount) || (Math.abs(amount) === Math.abs(best.amount) && amount > best.amount))
        best = { player, amount, write };
    }
  }
  if (!best || Math.abs(best.amount) < SWING_MIN) return null;
  return { id:`swing:${best.player}:${best.write.anchor}`, kind:"swing", players:[best.player], amount:best.amount,
    cause:causeOf(best.write, best.player, events) };
}

/* ── runs and upsets ── */

/* a win on a card: the event's mark */
const winOf = write => ({ key:write.key, evId:write.ev.id, name:write.ev.name, game:write.ev.game || null,
  variant:write.ev.variant || null });

/* a record of counted wins: the most, shared by MAX_SHARED at most; the
   wins drawn only when every holder's are the same writes */
function countedRecord(kind, tally, roster, min) {
  const top = Math.max(0, ...Object.values(tally).map(list => list.length));
  if (top < min) return null;
  const players = roster.filter(player => tally[player]?.length === top);
  if (!players.length || players.length > MAX_SHARED) return null;
  const keys = players.map(player => tally[player].map(write => write.key).join("|"));
  const wins = keys.every(key => key === keys[0]) ? tally[players[0]].map(winOf) : null;
  return { id:`${kind}:${players.join("+")}:${top}`, kind, players, count:top, wins };
}

/* The longest run of straight wins anyone has had so far (gags' own
   timeline: a recorded contest is a win for its side and a loss for the side
   it beat, a free-for-all's result a win for 1st and a loss for the field) */
export function streakCard(state, events = allEventsOf(state)) {
  const roster = rosterOf(state);
  const run = {}, best = {};
  for (const step of winStreaks(state, events)) {
    for (const [player, value] of step.results) {
      if (value !== "W") { run[player] = []; continue; }
      run[player] = [...(run[player] || []), step.write];
      if (!best[player] || run[player].length > best[player].length) best[player] = run[player];
    }
  }
  return countedRecord("streak", best, roster, STREAK_MIN);
}

/* the players a write's win went to when the stored odds named them the
   underdog (the gags' strike: a recorded contest's odds, or a two-sided
   game played as one result) */
export function upsetWinners(state, write) {
  const op = state.eventOps?.[write.ev.id] || {};
  if (write.entry) {
    const odds = op.odds?.[write.entry.id];
    if (!odds || !known(odds.underdog) || odds.underdog !== write.entry.winner) return null;
    return entrySides(state, write.ev.id, write.entry)?.win.players || null;
  }
  if (write.type !== "result" || write.contests) return null;
  const draw = state.draws?.[write.ev.id];
  if (draw?.teams?.length !== 2) return null;
  const odds = op.odds?.[`ffa:${write.ev.id}:${draw.id}`];
  if (!odds || !known(odds.underdog)) return null;
  const dog = draw.teams[odds.underdog]?.players || [];
  const first = write.res?.slots?.[0] || [];
  return dog.length && dog.length === first.length && dog.every(player => first.includes(player)) ? [...dog] : null;
}

export function upsetsCard(state, events = allEventsOf(state)) {
  const roster = rosterOf(state);
  const tally = {};
  for (const write of gagWrites(state, events)) {
    for (const player of upsetWinners(state, write) || []) {
      if (roster.includes(player)) tally[player] = [...(tally[player] || []), write];
    }
  }
  return countedRecord("upsets", tally, roster, UPSETS_MIN);
}

/* ── bets ── */

/* the best net from settled bets (BETTOR_MIN or more), and the worst */
export function bettorCards(state, events = allEventsOf(state)) {
  const roster = rosterOf(state);
  const net = new Map();
  for (const wager of state.wagers || []) {
    if (!roster.includes(wager?.player)) continue;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") continue;
    net.set(wager.player, (net.get(wager.player) || 0) + result.delta);
  }
  const rows = roster.filter(player => net.has(player)).map(player => ({ player, amount:net.get(player) }));
  const best = [...rows].sort((a, b) => b.amount - a.amount)[0];
  const worst = [...rows].sort((a, b) => a.amount - b.amount)[0];
  const cards = [];
  if (best && best.amount >= BETTOR_MIN)
    cards.push({ id:`bettor:${best.player}`, kind:"bettor", players:[best.player], amount:best.amount, worst:false });
  if (worst && worst.amount <= -BETTOR_MIN)
    cards.push({ id:`bettor-worst:${worst.player}`, kind:"bettor", players:[worst.player], amount:worst.amount, worst:true });
  return cards;
}

/* ── Quick Draw ── */

/* settled duels only: an unsettled duel's runs are private until both have
   drawn (redactDuelsForViewer), and a void one never happened */
const settledDuels = state => (state.duels || []).map(duel => ({ duel, result:resolveDuel(duel) }))
  .filter(item => item.result.settled);

export function fastestCard(state) {
  const roster = rosterOf(state);
  let best = null;
  for (const { duel } of settledDuels(state)) {
    for (const player of [duel.from, duel.to]) {
      const run = duel.runs?.[player];
      const ms = Number(run?.ms);
      if (!run || run.foul || !roster.includes(player) || !Number.isFinite(ms) || ms <= 0 || ms >= UNTAPPED_MS) continue;
      const at = Number(run.ts) || 0;
      if (!best || ms < best.ms || (ms === best.ms && (at < best.at || (at === best.at
        && roster.indexOf(player) < roster.indexOf(best.player)))))
        best = { player, ms, at, duel:duel.id };
    }
  }
  return best ? { id:`fastest:${best.player}:${best.duel}`, kind:"fastest", players:[best.player], ms:Math.round(best.ms) } : null;
}

export function duelsCard(state) {
  const roster = rosterOf(state);
  const tally = {};
  for (const { result } of settledDuels(state)) {
    if (result.push || !roster.includes(result.winner)) continue;
    tally[result.winner] = (tally[result.winner] || 0) + 1;
  }
  const top = Math.max(0, ...Object.values(tally));
  if (top < DUEL_WINS_MIN) return null;
  const players = roster.filter(player => tally[player] === top);
  return players.length > MAX_SHARED ? null
    : { id:`duels:${players.join("+")}:${top}`, kind:"duels", players, count:top };
}

/* ── the cards ── */

/* Every record card the weekend has earned, in the order the room sees
   them: the kinds interleaved, so a run of turns is never one kind. */
export function recordCards(state, events = null) {
  if (!state) return [];
  if (!events) events = allEventsOf(state);
  const h2h = headToHeadCards(state, events);
  const [best, worst] = (() => {
    const cards = bettorCards(state, events);
    return [cards.find(card => !card.worst) || null, cards.find(card => card.worst) || null];
  })();
  return [h2h[0], swingCard(state, events), streakCard(state, events), best, h2h[1], upsetsCard(state, events),
    fastestCard(state), duelsCard(state), worst, h2h[2]].filter(Boolean);
}

/* ── the turns ──
   The records take one ambient turn in a real gap, after the gap's own
   cards (the board, what is next, the latest result, the cup, which keep
   their places) and before the photos: the result, its plate, then the
   records it may have changed. */
export function withRecordTurns(cards, count) {
  return count ? [...cards, "records"] : cards;
}

/* Which records turn this is, counted on the server clock from the start
   of time (the k-th records turn ever), or null when this turn is not one.
   Every TV on the same clock counts the same, and each records turn shows
   the card after the last one's. */
export function recordTurn(ambient, now, period = TV_AMBIENT_TURN_MS) {
  const slots = [];
  (ambient || []).forEach((card, index) => { if (card === "records") slots.push(index); });
  if (!slots.length) return null;
  const turn = Math.floor(Math.max(0, Number(now) || 0) / period);
  const at = slots.indexOf(turn % ambient.length);
  return at < 0 ? null : Math.floor(turn / ambient.length) * slots.length + at;
}
export function recordAt(cards, ambient, now, period = TV_AMBIENT_TURN_MS) {
  const k = recordTurn(ambient, now, period);
  return k === null || !cards?.length ? null : cards[k % cards.length];
}

/* ── the lettering ── */

/* a name lettered as written in the show weight, on one line in its
   column: about half an em a letter, as large as `max`, never under `min` */
export const RECORD_ADVANCE = 0.5;
export const recordNameSize = (name, width, { max = 96, min = 32 } = {}) =>
  Math.max(min, Math.min(max, Math.floor(width / (Math.max(3, String(name || "").length) * RECORD_ADVANCE))));

/* The people on a card: one chip large, a few smaller, each with its name
   under it in its own column (`width` is the room for all of them) */
export function holderLayout(count, width, { chip = 300, gap = 28 } = {}) {
  const n = Math.max(1, count);
  const col = Math.floor((width - (n - 1) * gap) / n);
  const face = n === 1 ? chip : Math.min(Math.round(chip * (n === 2 ? 0.7 : n === 3 ? 0.56 : 0.46)), col);
  return { col, face, max:n === 1 ? 96 : n === 2 ? 64 : 52 };
}

/* the marks under a count: one per win, as large as `max`, in one row */
export const markSize = (count, width, { max = 88, min = 40, gap = 16 } = {}) =>
  Math.max(min, Math.min(max, Math.floor((width - (Math.max(1, count) - 1) * gap) / Math.max(1, count))));
