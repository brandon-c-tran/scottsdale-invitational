/* X5 "The last card": one player's weekend, derived from state. Pure and
   never stored. The chip history replays the same derivations the standings
   use (resultAwards, resolveWager, resolveDuel, rulings, the poker count) in
   the order they happened, so its last point is always the board's number. */

import { EDITION, ROSTER, SESSIONS, START, allEventsOf, computeStandings, contestStackOf, disp,
  postCountRuling, postCountRulingApplies, resolveDuel, resolveWager, resultAwards } from "../../../shared/core.js";
import { wagerPickName } from "./resultMoment.js";

const SESSION_ORDER = SESSIONS.map(session => session.id);
export const SESSION_TICKS = Object.freeze({ fri:"FRI", sam:"SAT AM", sap:"SAT PM", san:"SAT NIGHT", fin:"POKER" });
/* changes this close together came from one write and draw as one step */
const SAME_STEP_MS = 1500;

const stacksResultOf = state => {
  for (const [evId, result] of Object.entries(state?.results || {})) if (result?.stacks) return { evId, result };
  return null;
};

/* When a wager's contest was decided: its recorded contest, else the event
   result, else when it was placed. */
function wagerSettledAt(state, wager) {
  const stack = contestStackOf(state, wager.eventId);
  let entry = null;
  if (wager.kind === "match") entry = stack.find(item => item.kind === "match"
    && item.match?.[0] === wager.match?.[0] && item.match?.[1] === wager.match?.[1]);
  else if (wager.kind === "heat" || (wager.kind === "stage" && !wager.final))
    entry = stack.find(item => item.kind === "heat" && item.group === wager.group);
  else if (wager.final) entry = stack.find(item => item.kind !== "match" && item.kind !== "heat");
  return Number(entry?.decidedAt) || Number(state.results?.[wager.eventId]?.ts)
    || Math.max(0, ...(wager.chips || []).map(chip => Number(chip?.ts) || 0), Number(wager.ts) || 0);
}

const duelSettledAt = duel => Math.max(Number(duel.ts) || 0,
  ...Object.values(duel.runs || {}).map(run => Number(run?.ts) || 0));

/* Every chip change for one player, oldest first:
   { at, delta, kind, eventId?, session? , ... } */
export function chipChanges(state, player, events = allEventsOf(state)) {
  const changes = [];
  const eventOf = id => events.find(event => event.id === id);
  for (const [evId, result] of Object.entries(state.results || {})) {
    if (!result || result.stacks) continue;
    const event = eventOf(evId);
    if (!event) continue;
    for (const award of resultAwards(state, event, result))
      if (award.player === player && award.pts) changes.push({ at:Number(result.ts) || 0, delta:award.pts, kind:"award",
        eventId:evId, place:award.place });
  }
  for (const wager of state.wagers || []) {
    if (wager?.player !== player) continue;
    const resolved = resolveWager(state, wager, events);
    if (resolved.status !== "won" && resolved.status !== "lost") continue;
    changes.push({ at:wagerSettledAt(state, wager), delta:resolved.delta, kind:"bet", eventId:wager.eventId,
      status:resolved.status, wager });
  }
  for (const duel of state.duels || []) {
    if (!duel || (duel.from !== player && duel.to !== player)) continue;
    const result = resolveDuel(duel);
    if (!result.settled || result.push) continue;
    const stake = Number(duel.stake) || 0;
    changes.push({ at:duelSettledAt(duel), delta:result.winner === player ? stake : -stake, kind:"duel",
      status:result.winner === player ? "won" : "lost", other:duel.from === player ? duel.to : duel.from });
  }
  for (const ruling of state.adjustments || []) {
    if (ruling?.player !== player || ruling.removedAt || postCountRuling(ruling)) continue;
    changes.push({ at:Number(ruling.ts) || 0, delta:Number(ruling.delta) || 0, kind:"ruling" });
  }
  const order = { award:0, bet:1, duel:2, ruling:3 };
  return changes.map((change, index) => ({ ...change, index }))
    .sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind] || a.index - b.index)
    .map(({ index, ...change }) => change);
}

/* The session a moment belongs to: its own event's, else the session of the
   latest result posted before it, else Friday. */
function sessionResolver(state, events) {
  const posted = Object.entries(state.results || {})
    .map(([evId, result]) => ({ at:Number(result?.ts) || 0, session:events.find(event => event.id === evId)?.session }))
    .filter(item => item.session).sort((a, b) => a.at - b.at);
  return (change) => {
    const own = change.eventId ? events.find(event => event.id === change.eventId)?.session : null;
    if (own) return own;
    let session = SESSION_ORDER[0];
    for (const item of posted) if (item.at <= change.at) session = item.session;
    return session;
  };
}

/* The weekend as a step series: the 1,000 everyone starts with, one step
   per write that moved this player's chips, the poker count, and any ruling
   made on that count. The last step's pts equals the standings. */
export function chipHistory(state, player, events = allEventsOf(state)) {
  const sessionOf = sessionResolver(state, events);
  const steps = [{ at:0, pts:START, session:SESSION_ORDER[0], kinds:[], start:true }];
  let pts = START;
  for (const change of chipChanges(state, player, events)) {
    pts += change.delta;
    const last = steps[steps.length - 1];
    const session = sessionOf(change);
    if (!last.start && change.at - last.at <= SAME_STEP_MS && (last.eventId || null) === (change.eventId || null)) {
      last.pts = pts; last.delta += change.delta; last.kinds.push(change.kind);
      continue;
    }
    steps.push({ at:change.at, pts, delta:change.delta, session, eventId:change.eventId || null, kinds:[change.kind] });
  }
  const poker = stacksResultOf(state);
  if (poker) {
    const counted = Number(poker.result.stacks?.[player]) || 0;
    steps.push({ at:Number(poker.result.ts) || 0, pts:counted, delta:counted - pts, session:"fin",
      eventId:poker.evId, kinds:["stack"] });
    pts = counted;
    for (const ruling of state.adjustments || []) {
      if (ruling?.player !== player || ruling.removedAt || !postCountRulingApplies(ruling, poker.result)) continue;
      pts += Number(ruling.delta) || 0;
      steps.push({ at:Number(ruling.ts) || 0, pts, delta:Number(ruling.delta) || 0, session:"fin", eventId:null, kinds:["ruling"] });
    }
  }
  return steps;
}

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
const signed = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;

/* "Saturday 11:40 PM" in the phone's own time zone */
export function momentLabel(at) {
  if (!Number.isFinite(at) || at <= 0) return null;
  const date = new Date(at);
  return `${date.toLocaleDateString("en-US", { weekday:"long" })} ${date.toLocaleTimeString("en-US",
    { hour:"numeric", minute:"2-digit" })}`;
}

/* Everything the card shows, for one player. Lines that have nothing to say
   are left out, so a quiet weekend is a short card, not a table of zeros. */
export function lastCardModel(state, player, { events = allEventsOf(state), standings = computeStandings(state) } = {}) {
  const row = standings.find(item => item.player === player);
  if (!row) return null;
  const history = chipHistory(state, player, events);
  const changes = chipChanges(state, player, events);
  const eventName = id => events.find(event => event.id === id)?.name || "Event";
  const shelved = id => !!state.shelved?.[id];
  const wins = Object.entries(state.results || {})
    .filter(([evId, result]) => !shelved(evId) && (result?.slots?.[0] || []).includes(player))
    .sort(([, a], [, b]) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
    .map(([evId]) => eventName(evId));

  /* one bet per pick: legacy separate records join the way the ledger shows them */
  const betMap = new Map();
  for (const change of changes.filter(item => item.kind === "bet")) {
    const pick = wagerPickName(state, change.wager);
    const key = `${change.eventId}|${pick}|${change.status}`;
    const entry = betMap.get(key) || { pick, eventId:change.eventId, event:eventName(change.eventId), status:change.status, delta:0 };
    entry.delta += change.delta;
    betMap.set(key, entry);
  }
  const bets = [...betMap.values()];
  const betRecord = bets.length ? { won:bets.filter(bet => bet.status === "won").length,
    lost:bets.filter(bet => bet.status === "lost").length, net:bets.reduce((sum, bet) => sum + bet.delta, 0) } : null;
  const bestBet = bets.filter(bet => bet.status === "won").sort((a, b) => b.delta - a.delta)[0] || null;

  const duels = changes.filter(item => item.kind === "duel");
  const quickDraw = duels.length ? { won:duels.filter(duel => duel.status === "won").length,
    lost:duels.filter(duel => duel.status === "lost").length, net:duels.reduce((sum, duel) => sum + duel.delta, 0) } : null;

  /* the high point, unless it is simply where the weekend ended */
  let high = null;
  for (const step of history) if (step.pts > START && (!high || step.pts > high.pts)) high = step;
  if (high && high === history[history.length - 1]) high = null;

  const leaders = standings.filter(item => item.rank === 1);
  const tied = standings.filter(item => item.rank === row.rank).length > 1;
  const posted = Object.keys(state.results || {}).filter(id => state.results[id] && !shelved(id)).length;
  const profile = state.profiles?.[player] || {};
  const num = profile.num ?? (ROSTER.indexOf(player) >= 0 ? ROSTER.indexOf(player) + 1 : null);

  const facts = [];
  if (wins.length) facts.push({ id:"wins", label:wins.length === 1 ? "Event win" : "Event wins",
    value:wins.length <= 2 ? wins.join(", ") : String(wins.length) });
  if (bestBet) facts.push({ id:"best", label:`Best bet · ${bestBet.pick}, ${bestBet.event}`, value:signed(bestBet.delta) });
  else if (betRecord) facts.push({ id:"bets", label:"Bets", value:`${betRecord.won}–${betRecord.lost} · ${signed(betRecord.net)}` });
  if (quickDraw) facts.push({ id:"qd", label:"Quick Draw", value:`${quickDraw.won}–${quickDraw.lost} · ${signed(quickDraw.net)}` });
  if (high) {
    const when = momentLabel(high.at);
    facts.push({ id:"high", label:when ? `High · ${when}` : "High", value:fmt(high.pts) });
  }

  return {
    player, name:disp(state, player), num:num == null ? null : Number(num),
    rank:row.rank, tied, place:`${tied ? "T" : ""}${ordinalUpper(row.rank)}`, pts:row.pts,
    champion:!!state.frozen && row.rank === 1,
    leaders:leaders.map(item => ({ player:item.player, name:disp(state, item.player), pts:item.pts })),
    wins, bestBet, bets:betRecord, quickDraw, high:high ? { pts:high.pts, at:high.at } : null,
    history, facts,
    edition:`Field Day / ${EDITION.name} ${EDITION.year}`.toUpperCase(),
    dates:EDITION.short.toUpperCase(),
    footer:`${ROSTER.length} PLAYERS · ${posted} EVENTS`,
  };
}
const ordinalUpper = n => {
  const v = Number(n) || 0, tens = v % 100;
  const suffix = tens >= 11 && tens <= 13 ? "TH" : v % 10 === 1 ? "ST" : v % 10 === 2 ? "ND" : v % 10 === 3 ? "RD" : "TH";
  return `${v}${suffix}`;
};

/* The crown this device is showing: who, and on which count. Null until
   the board is frozen with a champion. */
export function crownKey(state, standings = computeStandings(state)) {
  if (!state?.frozen) return null;
  const leaders = standings.filter(row => row.rank === 1).map(row => row.player).sort();
  if (!leaders.length) return null;
  const poker = stacksResultOf(state);
  return `${leaders.join("+")}:${poker ? `${Number(poker.result.revision || 1)}:${Number(poker.result.ts) || 0}` : "board"}`;
}

/* The chart, in whatever units the caller draws in (SVG on the phone,
   canvas pixels in the saved image). A step line: each write holds its
   level until the next. Session ticks sit under the first step of each
   session and are dropped when they would crowd the one before. */
export function chartModel(history, { width = 330, height = 128, top = 20, bottom = 20, left = 4, right = 10,
  minTickGap = 52 } = {}) {
  const steps = history?.length ? history : [{ pts:START, session:SESSION_ORDER[0] }];
  const series = steps.length === 1 ? [steps[0], steps[0]] : steps;
  const peakValue = Math.max(START, ...series.map(step => step.pts));
  const max = Math.max(START * 1.5, Math.ceil(peakValue * 1.08 / 500) * 500);
  const n = series.length;
  const x = i => left + i * (width - left - right) / (n - 1);
  const y = value => top + (1 - Math.max(0, value) / max) * (height - top - bottom);
  const points = series.map((step, i) => ({ x:x(i), y:y(step.pts), pts:step.pts }));
  let d = `M${r1(points[0].x)} ${r1(points[0].y)}`;
  for (let i = 1; i < n; i++) d += ` H${r1(points[i].x)} V${r1(points[i].y)}`;
  let peak = null;
  points.forEach((point, i) => { if (point.pts > START && (!peak || point.pts > peak.pts)) peak = { ...point, index:i }; });
  const last = { ...points[n - 1], index:n - 1 };
  if (peak && peak.index === last.index) peak = null;
  /* the peak's number sits above it; the last number sits left of its dot,
     on the side the line did not come from */
  if (peak) peak.label = { x:Math.min(Math.max(peak.x, left + 16), width - right - 16), y:peak.y - 9, anchor:"middle" };
  const cameFrom = points[n - 2]?.y ?? last.y;
  last.label = { x:last.x - 8, y:cameFrom < last.y ? last.y + 16 : last.y - 8, anchor:"end" };
  const ticks = [];
  series.forEach((step, i) => {
    if (i > 0 && step.session === series[i - 1].session) return;
    const tick = { x:x(i), label:SESSION_TICKS[step.session] || "", anchor:"start" };
    if (!tick.label) return;
    if (ticks.length && tick.x - ticks[ticks.length - 1].x < minTickGap) return;
    ticks.push(tick);
  });
  /* a tick at the right edge reads leftward so it stays on the card, and
     gives way if that would run it into the one before */
  const labelWidth = tick => tick.label.length * 5.4;
  const edge = ticks[ticks.length - 1];
  if (edge && edge.x + labelWidth(edge) > width) {
    edge.anchor = "middle";
    const before = ticks[ticks.length - 2];
    if (before && edge.x - labelWidth(edge) / 2 < before.x + labelWidth(before) + 4) ticks.splice(ticks.length - 2, 1);
  }
  return { width, height, max, d, points, baseY:y(START), peak, last, ticks, axisY:height - bottom };
}
const r1 = n => Math.round(n * 10) / 10;
