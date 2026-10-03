/* X2 "Your chips moved" and M19 "celebrate only the people who won".
   Pure: everything here is derived from two broadcast states and the
   device's own player. Nothing is stored or sent.

   chipSnapshot   this player's chips split by source, from derived standings
   resultMoment   the per-viewer change between two snapshots: a receipt
                  (fresh frame), a quiet correction line, or nothing
   mergeMoments   several moments that land while one is showing join into it
   freshContestWins  contests this player's side won in the step (the shower) */

import { PT, START, allEventsOf, computeStandings, contestStackOf, disp, mvpAwards, resolveDuel, resolveWager,
  resultAwards, stageEntrantView, teamLabel, wagerMult } from "../../../shared/core.js";
import { freshFactFor } from "./weekendFacts.js";

const fmt = n => Math.abs(Math.round(Number(n) || 0)).toLocaleString("en-US");
export const ordinal = n => {
  const v = Number(n) || 0, tens = v % 100;
  if (tens >= 11 && tens <= 13) return `${v}th`;
  return `${v}${v % 10 === 1 ? "st" : v % 10 === 2 ? "nd" : v % 10 === 3 ? "rd" : "th"}`;
};
/* "+400" / "−500": the same signed chips the motion layer floats */
export const signedAmount = n => {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(v)}`;
};
const resultKey = result => `${Number(result?.revision || 1)}:${result?.correctedAt || result?.ts || 0}`;

/* The name of whatever a wager backed: a player, a pair, or a team. */
export function wagerPickName(state, wager) {
  const players = Array.isArray(wager?.pickPlayers) ? wager.pickPlayers.filter(Boolean) : [];
  if (wager?.pickTeam || players.length > 1) return teamLabel(state, { players });
  if (players.length === 1) return disp(state, players[0]);
  if (wager?.pick) return disp(state, wager.pick);
  const stages = state?.stages?.[wager?.eventId];
  if (stages && wager?.pickKey !== undefined) return stageEntrantView(state, stages, wager.pickKey).name;
  return "your pick";
}

function duelOutcome(duel, me) {
  if (!duel?.id || !me || !duel.to || (duel.from !== me && duel.to !== me)) return null;
  const result = resolveDuel(duel);
  if (!result.settled) return null;
  const stake = Number(duel.stake) || 0;
  const status = result.push ? "push" : result.winner === me ? "won" : "lost";
  return { status, delta:status === "won" ? stake : status === "lost" ? -stake : 0,
    other:duel.from === me ? duel.to : duel.from };
}

/* This player's row, split by the source of every chip. */
export function chipSnapshot(state, me, events = allEventsOf(state), standings = computeStandings(state)) {
  const row = me ? standings.find(item => item.player === me) : null;
  if (!row) return null;
  const awards = {}, results = {};
  let stacks = null;
  for (const [evId, result] of Object.entries(state.results || {})) {
    if (!result) continue;
    results[evId] = resultKey(result);
    if (result.stacks) { stacks = { evId, pts:Number(result.stacks[me]) || 0 }; continue; }
    const event = events.find(item => item.id === evId);
    const mine = event ? resultAwards(state, event, result).find(award => award.player === me) : null;
    if (mine) awards[evId] = { pts:mine.pts, place:mine.place };
  }
  const wagers = {};
  for (const wager of state.wagers || []) {
    if (wager?.player !== me) continue;
    const resolved = resolveWager(state, wager, events);
    wagers[wager.id] = { status:resolved.status, delta:resolved.delta || 0, stake:Number(wager.stake) || 0,
      eventId:wager.eventId };
  }
  const duels = {};
  for (const duel of state.duels || []) {
    const outcome = duelOutcome(duel, me);
    if (outcome) duels[duel.id] = outcome;
  }
  const rulings = {};
  for (const item of state.adjustments || [])
    if (item?.player === me && item.id && !item.removedAt) rulings[item.id] = { delta:Number(item.delta) || 0, reason:item.reason || "" };
  const mvps = {};
  for (const mvp of mvpAwards(state)) if (mvp.player === me) mvps[mvp.eventId] = { pts:mvp.pts };
  return { me, pts:row.pts, rank:row.rank, awards, results, stacks, wagers, duels, rulings, mvps };
}

/* Contests decided between two states whose winning side includes `me`:
   a bracket match, a heat or pool, or a stage final. A posted event result
   with `me` in first place counts too. */
export function freshContestWins(prevState, state, me) {
  if (!prevState || !state || !me) return [];
  const wins = [];
  const teamOf = (draw, index) => draw?.teams?.[index]?.players || [];
  for (const [evId, br] of Object.entries(state.brackets || {})) {
    const draw = state.draws?.[evId];
    (br?.rounds || []).forEach((round, r) => (round || []).forEach((match, m) => {
      const was = prevState.brackets?.[evId]?.rounds?.[r]?.[m]?.winner;
      if (match?.winner === null || match?.winner === undefined || (was !== null && was !== undefined)) return;
      if (teamOf(draw, match.winner).includes(me)) wins.push({ evId, key:`match:${r}:${m}` });
    }));
  }
  for (const [evId, stages] of Object.entries(state.stages || {})) {
    const before = prevState.stages?.[evId];
    if (before && before.id !== stages?.id) continue;
    const holds = key => stageEntrantView(state, stages, key).players.includes(me);
    (stages?.groups || []).forEach((group, index) => {
      const was = before?.groups?.[index]?.winner;
      if (group?.winner === null || group?.winner === undefined || (was !== null && was !== undefined)) return;
      if (holds(group.winner)) wins.push({ evId, key:`group:${index}` });
    });
    const wasFinal = before?.finalWinner;
    if (stages?.finalWinner !== null && stages?.finalWinner !== undefined && (wasFinal === null || wasFinal === undefined)
        && holds(stages.finalWinner)) wins.push({ evId, key:"final" });
  }
  for (const [evId, result] of Object.entries(state.results || {})) {
    if (!result || prevState.results?.[evId] || result.stacks) continue;
    if ((result.slots?.[0] || []).includes(me) && !wins.some(win => win.evId === evId)) wins.push({ evId, key:"result" });
  }
  return wins;
}

/* The contest a step just decided in one event, newest first: the label
   the commissioner recorded ("Semifinal 1", "Final", "Heat 2") and who won. */
function decidedContest(prevState, state, evId) {
  const before = new Set(contestStackOf(prevState || {}, evId).map(entry => `${entry.id}:${entry.decidedAt}`));
  const fresh = contestStackOf(state, evId).filter(entry => !before.has(`${entry.id}:${entry.decidedAt}`));
  const entry = fresh.sort((a, b) => (Number(b.decidedAt) || 0) - (Number(a.decidedAt) || 0))[0];
  if (!entry) return null;
  const draw = state.draws?.[evId];
  let winner = null;
  if (entry.kind === "match") winner = draw?.teams?.[entry.winner] ? teamLabel(state, draw.teams[entry.winner]) : null;
  else if (state.stages?.[evId]) winner = stageEntrantView(state, state.stages[evId], entry.winner).name;
  return { label:entry.short || null, winner };
}

function winnersName(state, evId, players) {
  const team = state.draws?.[evId]?.teams?.find(item => item.players?.length === players.length
    && item.players.every(player => players.includes(player)));
  return team ? teamLabel(state, team) : players.map(player => disp(state, player)).join(" & ");
}

/* What the step changed for this player, or null when it said nothing
   about their chips.
     { kind:"receipt", lines, from, to, rankFrom, rankTo, title, subtitle,
       chip, eventIds, celebrate, animate }
     { kind:"notice", text, delta }   a quiet line: a correction or a returned bet
   `frame` is the fresh-change gate's classification of the step. Only a
   fresh frame makes a receipt; a correction makes the quiet line; a
   catch-up (reconnect, return, first load) makes nothing, because the since
   line reports an absence. */
export function resultMoment({ prev, next, prevState, state, events = allEventsOf(state), frame = null,
  skipDuel = null, now = Date.now() }) {
  if (!prev || !next || prev.me !== next.me || !state) return null;
  const me = next.me;
  const changedResults = [...new Set([...Object.keys(prev.results), ...Object.keys(next.results)])]
    .filter(evId => prev.results[evId] !== next.results[evId]);
  const rewound = changedResults.some(evId => prev.results[evId] !== undefined
    || (state.eventOps?.[evId]?.corrections || []).length);
  const wagerRewound = Object.entries(next.wagers).some(([id, now]) => {
    const was = prev.wagers[id];
    return was && was.status !== "pending" && was.status !== now.status;
  });
  /* a settled bet that went back to pending or flipped outcome was moved by
     a corrected contest, not voided: only a bet that became void is one */
  const settledMoved = Object.entries(next.wagers).some(([id, now]) => {
    const was = prev.wagers[id];
    return was && was.status !== "pending" && was.status !== now.status && now.status !== "void";
  });
  const rulingRemoved = Object.keys(prev.rulings).some(id => !next.rulings[id]);
  const correction = !!frame?.correction || rewound || wagerRewound || rulingRemoved;
  const delta = next.pts - prev.pts;
  let voided = 0;
  for (const [id, now] of Object.entries(next.wagers)) {
    const was = prev.wagers[id];
    if (was && was.status === "pending" && now.status === "void") voided += now.stake;
  }

  if (correction) {
    const cause = rulingRemoved && !rewound && !wagerRewound ? "Ruling removed"
      : !rewound && !settledMoved && (wagerRewound || voided) ? "Bet voided" : "Result corrected";
    if (delta) return { kind:"notice", delta, text:`${cause}: ${signedAmount(delta)}` };
    if (voided) return { kind:"notice", delta:0, text:`Bet voided: ${fmt(voided)} returned` };
    return null;
  }
  if (!frame?.fresh) return null;

  const lines = [];
  for (const [evId, award] of Object.entries(next.awards)) {
    if (prev.awards[evId] || !award.pts) continue;
    lines.push({ id:`award:${evId}`, kind:"award", eventId:evId, delta:award.pts, won:award.place === 0,
      label:award.place === "crew" ? "Crew" : `${ordinal(award.place + 1)} place`, detail:"Event award" });
  }
  for (const [evId, mvp] of Object.entries(next.mvps || {})) {
    if (prev.mvps?.[evId] || !mvp.pts) continue;
    lines.push({ id:`mvp:${evId}`, kind:"mvp", eventId:evId, delta:mvp.pts, won:true, label:"Team MVP",
      detail:"Voted by your team" });
  }
  if (next.stacks && !prev.stacks)
    lines.push({ id:`stack:${next.stacks.evId}`, kind:"stack", eventId:next.stacks.evId, delta,
      label:"Final count", detail:null, won:false });
  /* same-pick legacy records settle as one line, as the ledger shows them */
  const bets = new Map();
  for (const [id, now] of Object.entries(next.wagers)) {
    const was = prev.wagers[id];
    if (was?.status !== "pending" || (now.status !== "won" && now.status !== "lost")) continue;
    const wager = (state.wagers || []).find(item => item.id === id);
    const pick = wagerPickName(state, wager);
    const mult = wagerMult(wager);
    const key = `${now.eventId}|${pick}|${now.status}|${mult}`;
    const line = bets.get(key) || { id:`bet:${id}`, kind:"bet", eventId:now.eventId, delta:0, stake:0,
      won:now.status === "won", label:`Bet on ${pick}`, mult };
    line.delta += now.delta; line.stake += now.stake;
    bets.set(key, line);
  }
  for (const line of bets.values()) lines.push({ ...line, detail:`${fmt(line.stake)} at ${line.mult}:1` });
  for (const [id, duel] of Object.entries(next.duels)) {
    if (prev.duels[id] || id === skipDuel || !duel.delta) continue;
    lines.push({ id:`duel:${id}`, kind:"duel", delta:duel.delta, won:false,
      label:`Quick Draw vs ${disp(state, duel.other)}`, detail:duel.status === "won" ? "Won" : "Lost" });
  }
  for (const [id, ruling] of Object.entries(next.rulings)) {
    if (prev.rulings[id] || !ruling.delta) continue;
    lines.push({ id:`ruling:${id}`, kind:"ruling", delta:ruling.delta, won:false,
      label:"Ruling", detail:ruling.reason || "Commissioner" });
  }
  /* a bet returned without a correction (a swap, a player marked away) is
     news on the bettor's phone, and only there */
  if (!lines.length) return voided ? { kind:"notice", delta:0, text:`Bet voided: ${fmt(voided)} returned` } : null;

  const eventIds = [...new Set(lines.map(line => line.eventId).filter(Boolean))];
  const head = momentHeading({ lines, eventIds, prevState, state, events });
  /* D4: the fact this step made true about you, as one line; a fact is
     garnish, so it can never cost the receipt */
  let fact = null;
  try { fact = freshFactFor(prevState, state, me, events); } catch { fact = null; }
  return {
    kind:"receipt", id:`r${now}`, lines, from:prev.pts, to:next.pts, rankFrom:prev.rank, rankTo:next.rank,
    ...head, eventIds, me, fact:fact ? fact.own : null,
    celebrate:lines.some(line => line.won && line.delta > 0),
    animate:true,
  };
}

/* The card's heading: the event and who won it, or what kind of change. */
function momentHeading({ lines, eventIds, prevState, state, events }) {
  const onlyKind = kind => lines.every(line => line.kind === kind);
  const others = lines.some(line => !line.eventId);
  if (eventIds.length === 1 && !others) {
    const evId = eventIds[0];
    const event = events.find(item => item.id === evId);
    const result = state.results?.[evId];
    const decided = decidedContest(prevState, state, evId);
    const posted = result && !prevState?.results?.[evId];
    let subtitle = null, chip = null;
    if (posted && result.slots?.[0]?.length && !result.stacks) {
      subtitle = [`${winnersName(state, evId, result.slots[0])} won`, decided?.label].filter(Boolean).join(" ");
      chip = result.slots[0][0];
    } else if (decided?.winner) {
      subtitle = [`${decided.winner} won`, decided.label].filter(Boolean).join(" ");
      const draw = state.draws?.[evId];
      chip = draw?.teams?.find(team => teamLabel(state, team) === decided.winner)?.players?.[0] || null;
    }
    return { title:event?.name || "Result", subtitle, chip };
  }
  if (onlyKind("duel")) return { title:"Quick Draw", subtitle:null, chip:null };
  if (onlyKind("ruling")) return { title:"Ruling", subtitle:null, chip:null };
  return { title:"Your chips", subtitle:eventIds.length > 1 ? `${eventIds.length} events` : null, chip:null };
}

/* A moment that lands while another is still on screen joins it: the card
   keeps where the chips started and where the rank started, and takes the
   newest total. */
export function mergeMoments(current, incoming, { state, prevState, events } = {}) {
  if (!current || current.kind !== "receipt") return incoming;
  if (!incoming || incoming.kind !== "receipt") return current;
  const seen = new Set(current.lines.map(line => line.id));
  const lines = [...current.lines, ...incoming.lines.filter(line => !seen.has(line.id))];
  const eventIds = [...new Set(lines.map(line => line.eventId).filter(Boolean))];
  const head = eventIds.length === 1 && current.eventIds.length === 1 && current.eventIds[0] === eventIds[0]
    && lines.every(line => line.eventId)
    ? { title:incoming.title, subtitle:incoming.subtitle || current.subtitle, chip:incoming.chip || current.chip }
    : state ? momentHeading({ lines, eventIds, prevState, state, events: events || allEventsOf(state) })
      : { title:"Your chips", subtitle:null, chip:null };
  return { ...current, lines, eventIds, ...head, to:incoming.to, rankTo:incoming.rankTo,
    fact:incoming.fact || current.fact || null,
    celebrate:current.celebrate || incoming.celebrate, version:(current.version || 0) + 1 };
}

/* The rank line under the total: "▲ 9 places" / "▼ 1 place", or nothing. */
export function rankMove(from, to) {
  const moved = (Number(from) || 0) - (Number(to) || 0);
  if (!from || !to || !moved) return null;
  const n = Math.abs(moved);
  return { up:moved > 0, text:`${moved > 0 ? "▲" : "▼"} ${n} ${n === 1 ? "place" : "places"}` };
}

/* Where the receipt docks. On Home it sits under the header so the
   leaderboard it just moved stays in view (the leaderboard is never covered
   on Home); everywhere else it rises from the bottom, above the Bets rack
   when one is showing, so a sheet's header and the next contest's sides
   stay clear. */
export function receiptDock({ tab, modal = null } = {}) {
  return tab === "board" && !modal ? "top" : "bottom";
}
/* The docked card's offset from measured chrome: under the header's bottom
   edge, or above the rack's top edge. Null keeps the stylesheet default. */
export const RECEIPT_GAP = 8;
export function receiptDockStyle({ dock, headerBottom = null, rackTop = null, viewportHeight = null } = {}) {
  if (dock === "top" && Number.isFinite(headerBottom) && headerBottom > 0)
    return { top:`${Math.round(headerBottom + RECEIPT_GAP)}px` };
  if (dock === "bottom" && Number.isFinite(rackTop) && Number.isFinite(viewportHeight)
      && rackTop > 0 && rackTop < viewportHeight)
    return { bottom:`${Math.round(viewportHeight - rackTop + RECEIPT_GAP)}px` };
  return null;
}

/* the receipt holds this long after its lines land, then leaves */
export const RECEIPT_HOLD_MS = 6500;
/* chips a won line sends into the total: one per 100 won, at most three */
export const flightChips = delta => Math.max(0, Math.min(3, Math.floor((Number(delta) || 0) / PT)));
export { START };
