import { computeStandings, disp, resolveDuel, resolveWager, resultAwards, teamLabel } from "../../../shared/core.js";

/* Everything here is derived from the broadcast state and the device's own
   memory of the last state it showed. No field is sent to the server. */

const abs = value => Math.abs(value).toLocaleString("en-US");
export const signed = value => `${value > 0 ? "+" : value < 0 ? "-" : ""}${abs(value)}`;
const ord = n => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
const eventName = (events, id) => events.find(event => event.id === id)?.name || "An event";
const resultKey = result => `${Number(result?.revision || 1)}:${result?.correctedAt || result?.ts || 0}`;

/* A settled duel from one side: won, lost or tied, with its chip effect. */
function duelOutcome(duel, me) {
  if (!duel?.id || !me || !duel.to || (duel.from !== me && duel.to !== me)) return null;
  const result = resolveDuel(duel);
  if (!result.settled) return null;
  const stake = Number(duel.stake) || 0;
  const status = result.push ? "push" : result.winner === me ? "won" : "lost";
  return { status, delta:status === "won" ? stake : status === "lost" ? -stake : 0,
    other:duel.from === me ? duel.to : duel.from };
}

/* The row you see on the board, split by the source of every chip. */
export function guestLedger(state, me, events, standings = computeStandings(state)) {
  const row = standings.find(item => item.player === me);
  if (!row) return null;
  const awards = {}, places = {}, results = {};
  for (const [evId, result] of Object.entries(state.results || {})) {
    if (!result) continue;
    results[evId] = resultKey(result);
    const event = events.find(item => item.id === evId);
    /* the same award split the board uses: a split 3rd and crew pay included */
    const mine = event && !result.stacks ? resultAwards(state, event, result).find(award => award.player === me) : null;
    if (mine) {
      awards[evId] = mine.pts;
      places[evId] = mine.place === "crew" ? "crew" : mine.place + 1;
    }
  }
  const wagers = {};
  for (const wager of state.wagers || []) {
    if (wager.player !== me) continue;
    const resolved = resolveWager(state, wager, events);
    wagers[wager.id] = { status:resolved.status, delta:resolved.delta || 0, stake:wager.stake, eventId:wager.eventId };
  }
  const rulings = {};
  for (const item of state.adjustments || [])
    if (item?.player === me && item.id) rulings[item.id] = { delta:item.delta, reason:item.reason || "" };
  const duels = {};
  for (const duel of state.duels || []) {
    const outcome = duelOutcome(duel, me);
    if (outcome) duels[duel.id] = outcome;
  }
  const tied = standings.every(item => item.pts === standings[0]?.pts);
  return { me, pts:row.pts, rank:row.rank, awards, places, results, wagers, rulings, duels,
    contests:playedContests(state, me),
    leaders:tied ? [] : standings.filter(item => item.rank === 1).map(item => item.player) };
}

/* Every decided contest this player played in: posted event results, decided
   bracket matchups, and heats or pools with a winner. Keys only. */
const bracketSide = (br, slot) => {
  if (!slot) return null;
  if (slot.t !== undefined) return slot.t;
  const source = br.rounds?.[slot.w?.[0]]?.[slot.w?.[1]];
  return source?.winner ?? null;
};
export function playedContests(state, me) {
  const keys = [];
  if (!me) return keys;
  for (const [evId, result] of Object.entries(state.results || {}))
    if ((result?.slots || []).some(slot => (slot || []).includes(me))) keys.push(`result:${evId}`);
  for (const [evId, br] of Object.entries(state.brackets || {})) {
    const team = (state.draws?.[evId]?.teams || []).findIndex(item => item.players?.includes(me));
    if (team < 0) continue;
    (br?.rounds || []).forEach((round, r) => (round || []).forEach((match, m) => {
      if (match?.winner === null || match?.winner === undefined) return;
      if (bracketSide(br, match.a) === team || bracketSide(br, match.b) === team) keys.push(`match:${evId}:${r}:${m}`);
    }));
  }
  for (const [evId, stages] of Object.entries(state.stages || {})) {
    const mine = stages?.entrantType === "team"
      ? (state.draws?.[evId]?.teams || []).findIndex(item => item.players?.includes(me)) : me;
    (stages?.groups || []).forEach((group, index) => {
      if (group?.winner === null || group?.winner === undefined) return;
      if ((group.entrants || []).includes(mine)) keys.push(`group:${evId}:${index}`);
    });
  }
  return keys;
}

/* One vibration per broadcast, at most: taking the lead outranks a contest
   settling for you. A correction is never felt. */
export function updateHaptic(prev, next, { state, skipDuel = null } = {}) {
  if (!prev || !next || prev.me !== next.me || !state) return null;
  const changed = [...new Set([...Object.keys(prev.results || {}), ...Object.keys(next.results || {})])]
    .filter(evId => prev.results?.[evId] !== next.results?.[evId]);
  if (changed.some(evId => prev.results?.[evId] !== undefined
    || (state.eventOps?.[evId]?.corrections || []).length)) return null;
  const me = next.me;
  const before = prev.leaders || [], after = next.leaders || [];
  if (!state.frozen && after.includes(me) && (!before.includes(me) || after.length < before.length)) return "lead";
  const decided = new Set(prev.contests || []);
  if ((next.contests || []).some(key => !decided.has(key))) return "settle";
  for (const [id, now] of Object.entries(next.wagers || {})) {
    const was = prev.wagers?.[id];
    if (was?.status === "pending" && (now.status === "won" || now.status === "lost")) return "settle";
  }
  for (const id of Object.keys(next.duels || {}))
    if (!prev.duels?.[id] && id !== skipDuel) return "settle";
  return null;
}

/* A result is fresh when it appears for the first time with no correction
   history. Only a fresh result celebrates. */
export function freshResults(previous = {}, state) {
  return Object.entries(state.results || {}).filter(([evId, result]) => result && !previous[evId]
    && !(state.eventOps?.[evId]?.corrections || []).length).map(([evId]) => evId);
}
export const resultMarkers = state => Object.fromEntries(Object.entries(state.results || {})
  .filter(([, result]) => result).map(([evId, result]) => [evId, resultKey(result)]));

/* One line per update for this device's player. Several sources in one
   broadcast join into the same line instead of replacing each other. */
export function summarizeUpdate(prev, next, { state, events, skipDuel = null }) {
  if (!prev || !next || prev.me !== next.me) return null;
  const me = next.me;
  const changedResults = [...new Set([...Object.keys(prev.results), ...Object.keys(next.results)])]
    .filter(evId => prev.results[evId] !== next.results[evId]);
  const corrected = changedResults.filter(evId => prev.results[evId] !== undefined
    || (state.eventOps?.[evId]?.corrections || []).length);
  const fresh = changedResults.filter(evId => !corrected.includes(evId) && next.results[evId]);

  let settledNet = 0, settledCount = 0, voided = 0, voidedCount = 0, reopenedNet = 0;
  const reopenedEvents = new Set();
  for (const [id, now] of Object.entries(next.wagers)) {
    const before = prev.wagers[id];
    if (!before || before.status === now.status) continue;
    if (before.status === "pending" && (now.status === "won" || now.status === "lost")) {
      settledNet += now.delta; settledCount++;
    } else if (now.status === "void" && before.status !== "void") {
      voided += now.stake; voidedCount++;
      if (before.status !== "pending") { reopenedNet -= before.delta; reopenedEvents.add(now.eventId); }
    } else if (before.status === "won" || before.status === "lost") {
      reopenedNet += now.delta - before.delta; reopenedEvents.add(now.eventId);
    }
  }
  const voidPart = voidedCount ? `${voidedCount === 1 ? "Bet" : "Bets"} voided · ${abs(voided)} returned` : null;
  const newRulings = Object.entries(next.rulings).filter(([id]) => !prev.rulings[id]).map(([, item]) => item);
  const total = next.pts - prev.pts;

  const correctionEvents = [...corrected, ...reopenedEvents].filter((id, index, all) => all.indexOf(id) === index);
  const mineCorrected = correctionEvents.some(evId => (prev.awards[evId] || 0) !== (next.awards[evId] || 0))
    || reopenedEvents.size > 0 || voidedCount > 0;
  if (correctionEvents.length && mineCorrected) {
    const parts = [`Correction · ${eventName(events, correctionEvents[0])}`];
    if (total) parts.push(signed(total));
    if (voidPart) parts.push(voidPart);
    return { msg:parts.join(" · "), tone:total > 0 ? "gold" : undefined, chip:me };
  }
  /* someone else's correction is not news on this phone, not even a new leader */
  if (correctionEvents.length) return null;

  const parts = [];
  for (const evId of fresh) {
    const award = next.awards[evId] || 0;
    if (award > 0) parts.push(next.places[evId] === "crew" ? `Crew in ${eventName(events, evId)} ${signed(award)}`
      : `${ord(next.places[evId])} in ${eventName(events, evId)} ${signed(award)}`);
  }
  if (settledCount) parts.push(`${settledCount === 1 ? "bet" : "bets"} ${signed(settledNet)}`);
  if (voidPart) parts.push(voidPart);
  for (const ruling of newRulings)
    parts.push(`Ruling ${signed(ruling.delta)}${ruling.reason ? ` · ${ruling.reason}` : ""}`);
  /* a settled duel joins the same line; the Quick Draw layer already shows
     the duel it is playing */
  for (const [id, duel] of Object.entries(next.duels || {})) {
    if (prev.duels?.[id] || id === skipDuel) continue;
    parts.push(`Quick Draw vs ${disp(state, duel.other)} ${duel.status === "push" ? "tied" : signed(duel.delta)}`);
  }
  const leadKey = list => [...list].sort().join("+");
  const leadChanged = !state.frozen && next.leaders.length > 0 && leadKey(prev.leaders) !== leadKey(next.leaders);
  const iLead = next.leaders.includes(me);
  if (leadChanged && iLead) parts.push(next.leaders.length > 1 ? "you share the lead" : "you lead");
  if (parts.length) {
    const first = parts[0];
    parts[0] = first.charAt(0).toUpperCase() + first.slice(1);
    return { msg:parts.join(" · "), tone:total > 0 || (leadChanged && iLead) ? "gold" : undefined, chip:me };
  }
  if (leadChanged && prev.leaders.length) {
    const leaders = next.leaders.map(player => disp(state, player));
    return { msg:leaders.length > 1 ? `${leaders.join(" and ")} share the lead` : `${leaders[0]} takes the lead`,
      tone:"gold", chip:next.leaders[0] };
  }
  return null;
}

/* ── "Since you looked": the device remembers the last board it showed ── */
export const SINCE_KEY = "si-since-v1";
export const SINCE_ABSENCE = 2 * 60 * 1000;

export function sinceSnapshot(state, me, events, standings, version, now = Date.now()) {
  const row = standings.find(item => item.player === me);
  if (!row) return null;
  const settled = (state.wagers || []).filter(wager => wager.player === me
    && resolveWager(state, wager, events).status !== "pending").map(wager => wager.id);
  const results = Object.fromEntries(Object.entries(state.results || {})
    .filter(([, result]) => result?.slots?.[0]?.length).map(([evId, result]) => [evId, resultKey(result)]));
  const duels = (state.duels || []).filter(duel => duelOutcome(duel, me)).map(duel => duel.id);
  const rulings = (state.adjustments || []).filter(item => item?.player === me && item.id).map(item => item.id);
  return { at:now, me, pts:row.pts, rank:row.rank, v:version || 0, settled, results, duels, rulings };
}

const clock = at => new Date(at).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });

function winnersText(state, evId, players) {
  const team = state.draws?.[evId]?.teams?.find(item => item.players.length === players.length
    && item.players.every(player => players.includes(player)));
  return team ? teamLabel(state, team) : players.map(player => disp(state, player)).join(" & ");
}

/* What changed while this device looked away, and where to read it: a result
   opens that event, settled bets open the settled list, anything else opens
   the standings. The line is one line: the change it opens, then a count of
   the rest ("Since 8:00 PM · Volleyball: Adi won · 2 more"); `detail` spells
   everything out for the accessible name. `results` lists every event the
   line reports. */
export function sinceSummary(saved, state, me, events, standings, now = Date.now()) {
  if (!saved || saved.me !== me || now - Number(saved.at || 0) < SINCE_ABSENCE) return null;
  const row = standings.find(item => item.player === me);
  if (!row) return null;
  const parts = [];
  let route = null, lead = null, extraResults = 0;
  const changed = Object.entries(state.results || {})
    .filter(([evId, result]) => result?.slots?.[0]?.length && saved.results?.[evId] !== resultKey(result))
    .sort(([, a], [, b]) => (b.correctedAt || b.ts || 0) - (a.correctedAt || a.ts || 0));
  if (changed.length) {
    const [evId, result] = changed[0];
    const text = saved.results?.[evId] !== undefined ? `Correction · ${eventName(events, evId)}`
      : `${eventName(events, evId)}: ${winnersText(state, evId, result.slots[0])} won`;
    parts.push(changed.length > 1 ? `${changed.length} results · ${text}` : text);
    lead = text;
    extraResults = changed.length - 1;
    route = { type:"event", evId };
  }
  const seen = new Set(saved.settled || []);
  let net = 0, count = 0;
  for (const wager of state.wagers || []) {
    if (wager.player !== me || seen.has(wager.id)) continue;
    const resolved = resolveWager(state, wager, events);
    if (resolved.status === "won" || resolved.status === "lost") { net += resolved.delta; count++; }
  }
  if (count) {
    parts.push(`your ${count === 1 ? "bet" : "bets"} ${signed(net)}`);
    if (!route) { route = { type:"settled" }; lead = parts[parts.length - 1]; }
  }
  const seenDuels = new Set(saved.duels || []);
  let duelNet = 0, duelCount = 0;
  for (const duel of state.duels || []) {
    const outcome = seenDuels.has(duel.id) ? null : duelOutcome(duel, me);
    if (outcome) { duelNet += outcome.delta; duelCount++; }
  }
  if (duelCount) parts.push(`${duelCount === 1 ? "duel" : `${duelCount} duels`} ${duelNet ? signed(duelNet) : duelCount === 1 ? "tied" : "net 0"}`);
  const seenRulings = new Set(saved.rulings || []);
  const rulings = (state.adjustments || []).filter(item => item?.player === me && item.id && !seenRulings.has(item.id));
  if (rulings.length) parts.push(`${rulings.length === 1 ? "ruling" : `${rulings.length} rulings`} ${
    signed(rulings.reduce((sum, item) => sum + (Number(item.delta) || 0), 0))}`);
  const moved = Number(saved.rank) - row.rank;
  if (saved.rank && moved) {
    parts.push(`${moved > 0 ? "up" : "down"} ${Math.abs(moved)} ${Math.abs(moved) === 1 ? "place" : "places"}, now ${ord(row.rank)}`);
    /* the standings open on your place, so that leads when nothing else routes */
    if (!route) lead = parts[parts.length - 1];
  }
  if (!parts.length && saved.pts !== undefined && row.pts !== saved.pts) parts.push(`${signed(row.pts - saved.pts)} chips`);
  if (!parts.length) return null;
  lead = lead || parts[0];
  const since = `Since ${clock(saved.at)}`;
  const more = parts.length - 1 + extraResults;
  return { text:[since, lead, more ? `${more} more` : null].filter(Boolean).join(" · "),
    detail:[since, ...parts].join(" · "), route:route || { type:"standings" },
    results:changed.map(([evId]) => evId) };
}

export const sinceLine = (...args) => sinceSummary(...args)?.text || null;

/* The device's memory across absences. A cold start reads it once. Going to
   the background writes it. Coming back only raises a flag: the line is
   built from the first FRESH state after that (a new broadcast on a live
   socket), and until then the stale board on screen never rewrites the
   memory. `read`/`write` are this device's storage. */
export function sinceTracker({ read, write, clock = () => Date.now() }) {
  let loaded = null, returning = null;
  const save = live => {
    const saved = sinceSnapshot(live.state, live.me, live.events, live.standings, live.version, clock());
    if (saved) write(saved);
  };
  return {
    /* a state is on screen; returns the since summary when it should show */
    observe(live) {
      if (!live.me) return null;
      let summary = null;
      if (loaded !== live.me) {
        loaded = live.me;
        returning = null;
        summary = sinceSummary(read(), live.state, live.me, live.events, live.standings, clock());
      } else if (returning) {
        if (live.hidden || live.connected === false || live.state === returning) return null;
        returning = null;
        summary = sinceSummary(read(), live.state, live.me, live.events, live.standings, clock());
      }
      if (!live.hidden && live.connected !== false) save(live);
      return summary;
    },
    hidden(live) {
      if (!live.me || loaded !== live.me) return;
      returning = null;
      save(live);
    },
    visible(live) {
      if (!live.me || loaded !== live.me) return;
      returning = live.state;
    },
    get waiting() { return !!returning; },
  };
}
