/* A player's weekend, derived from state every time and never stored: the
   events they played and where they finished, their bets, Quick Draw, and
   their head-to-head record against everyone else. The player card back
   reads it; the end-of-weekend card can read the same numbers.

   Everything settles through the shared derivations (resultAwards,
   resolveWager, resolveDuel, resolveSlot), so a corrected result, a voided
   ticket, or a shelved event changes these stats the same way it changes
   the board. */
import {
  START, ROSTER, ROUND_NAMES, allEventsOf, computeStandings, contestEntryLabel, eventInPlay,
  isAway, mvpAwards, bountyAwards, resolveDuel, resolveSlot, resolveWager, resultAwards, stageEntrantView, stageFinalists,
} from "../../../shared/core.js";

const decided = value => value !== null && value !== undefined;
export const placeLabel = place => ["1st", "2nd", "3rd"][place] || `${place + 1}th`;

/* the short round a team went out in: "Play-in", "SF", "Final" */
const ROUND_SHORT = { Semifinals:"SF", Semifinal:"SF", Quarterfinals:"QF", Quarterfinal:"QF" };
function roundShort(teamCount, round) {
  const name = ROUND_NAMES[teamCount]?.[round];
  return name ? ROUND_SHORT[name] || name : `Round ${round + 1}`;
}

const teamIndexOf = (draw, player) => Array.isArray(draw?.teams)
  ? draw.teams.findIndex(team => team?.players?.includes(player)) : -1;

/* A stage entrant's players, or none when a team stage lost its draw. */
function stagePlayers(state, st, key, evId = st.eventId) {
  if (st.entrantType === "team") {
    const draw = state.draws?.[evId];
    if (!draw || (st.drawId && draw.id !== st.drawId)) return [];
  }
  return stageEntrantView(state, { ...st, eventId:evId }, key).players || [];
}

/* The winner of a heat or pool. Older stages recorded only the qualifying
   list; with one qualifier that list is the winner. */
function groupWinner(st, group) {
  if (decided(group?.winner)) return group.winner;
  const through = group?.through || [];
  return st.advance === 1 && through.length === 1 ? through[0] : null;
}

/* Where a bracket team stands: out in a round, or still alive and in which. */
function bracketStanding(state, ev, teamIdx) {
  const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  if (!br?.rounds || !draw?.teams) return null;
  let next = null;
  for (let r = 0; r < br.rounds.length; r++) {
    for (const match of br.rounds[r]) {
      const sides = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
      if (!sides.includes(teamIdx)) continue;
      if (decided(match.winner) && match.winner !== teamIdx)
        return { out:true, label:roundShort(draw.teams.length, r) };
      if (!decided(match.winner) && next === null) next = r;
    }
  }
  return { out:false, label:next === null ? "" : roundShort(draw.teams.length, next) };
}

function stageStanding(state, st, player, evId) {
  const keyOf = key => stagePlayers(state, st, key, evId).includes(player);
  const group = (st.groups || []).find(g => (g.entrants || []).some(keyOf));
  if (!group) return null;
  const through = group.through || [];
  const winner = groupWinner(st, group);
  const qualified = through.some(keyOf) || (decided(winner) && keyOf(winner));
  const groupDone = through.length >= st.advance || decided(winner);
  if (groupDone && !qualified) return { out:true, label:"Heat" };
  if (!groupDone) return { out:false, label:group.name || "Heat" };
  if (decided(st.finalWinner) && !keyOf(st.finalWinner)) return { out:true, label:"Final" };
  return { out:false, label:"Final" };
}

/* One row per event the player played, is playing, or crewed: place label
   and award once the result posts, the round they went out in, or Playing. */
export function eventRow(state, ev, player) {
  if (!ev || ev.finale || state.shelved?.[ev.id]) return null;
  const res = state.results?.[ev.id];
  if (!res && !eventInPlay(state, ev)) return null;
  const draw = state.draws?.[ev.id], st = state.stages?.[ev.id];
  const teamIdx = teamIndexOf(draw, player);
  const crew = [...(draw?.roles || []), ...(st?.roles || [])].some(role => role?.player === player);
  const played = teamIdx >= 0 ? true
    : st?.entrantType === "solo" ? (st.groups || []).some(g => (g.entrants || []).includes(player))
      : draw?.teams ? false
        : !crew && !isAway(state, player);
  const base = { id:ev.id, name:ev.name, session:ev.session, value:ev.value || 0 };
  if (res) {
    const award = resultAwards(state, ev, res).find(item => item.player === player);
    if (award && award.place === "crew") return { ...base, status:"crew", place:"Crew", award:award.pts };
    if (award) return { ...base, status:"placed", rank:award.place, place:placeLabel(award.place), award:award.pts };
    if (crew) return { ...base, status:"crew", place:"Crew", award:0 };
    if (!played) return null;
    const exit = teamIdx >= 0 && state.brackets?.[ev.id] ? bracketStanding(state, ev, teamIdx)
      : st ? stageStanding(state, st, player, ev.id) : null;
    return { ...base, status:"out", place:exit?.label || "–", award:0 };
  }
  if (crew) return { ...base, status:"crew", place:"Crew", award:null };
  if (!played) return null;
  const standing = teamIdx >= 0 && state.brackets?.[ev.id] ? bracketStanding(state, ev, teamIdx)
    : st ? stageStanding(state, st, player, ev.id) : null;
  if (standing?.out) return { ...base, status:"out", place:standing.label, award:null };
  return { ...base, status:"playing", place:standing?.label || "–", award:null };
}

/* the players a ticket backed, whatever its vintage */
export function wagerPickPlayers(state, wager) {
  if (Array.isArray(wager?.pickPlayers) && wager.pickPlayers.length) return wager.pickPlayers;
  if (wager?.kind === "outright") return wager.pick ? [wager.pick] : [];
  if (wager?.kind === "match") return state.draws?.[wager.eventId]?.teams?.[wager.teamIdx]?.players || [];
  if (wager?.kind === "stage" || wager?.kind === "heat") {
    const st = state.stages?.[wager.eventId];
    return st ? stagePlayers(state, st, wager.pickKey, wager.eventId) : [];
  }
  return [];
}

/* a player's tickets: record, net, what is riding now, and the best win */
export function betRecord(state, player, events = allEventsOf(state)) {
  const out = { won:0, lost:0, net:0, pending:0, atRisk:0, best:null };
  (state.wagers || []).forEach(wager => {
    if (wager.player !== player) return;
    const result = resolveWager(state, wager, events);
    if (result.status === "pending") { out.pending += 1; out.atRisk += Number(wager.stake) || 0; return; }
    if (result.status !== "won" && result.status !== "lost") return;
    out[result.status] += 1;
    out.net += result.delta;
    if (result.status === "won" && (!out.best || result.delta > out.best.delta)) {
      const ev = events.find(item => item.id === wager.eventId);
      out.best = { eventId:wager.eventId, name:ev?.name || wager.evName || "", delta:result.delta,
        stake:Number(wager.stake) || 0, pick:wagerPickPlayers(state, wager) };
    }
  });
  return out;
}

/* settled Quick Draws; pushes return both antes and count as neither */
export function duelTally(state, player, other = null) {
  const out = { won:0, lost:0, push:0, net:0 };
  (state.duels || []).forEach(duel => {
    if (duel.from !== player && duel.to !== player) return;
    if (other && duel.from !== other && duel.to !== other) return;
    const result = resolveDuel(duel);
    if (!result.settled) return;
    if (result.push) { out.push += 1; return; }
    const stake = Number(duel.stake) || 0;
    if (result.winner === player) { out.won += 1; out.net += stake; }
    else { out.lost += 1; out.net -= stake; }
  });
  return out;
}

/* Every decided contest two players met in on opposite sides: bracket
   matches, heats (the winner beat each other entrant), stage finals, and
   two-sided matchups. Partners on one team never meet. Newest last. */
export function eventMeetings(state, a, b, events = allEventsOf(state)) {
  if (!a || !b || a === b) return [];
  const out = [];
  const meet = (ev, label, sides, winnerSide) => {
    const sideA = sides.findIndex(players => players.includes(a));
    const sideB = sides.findIndex(players => players.includes(b));
    if (sideA < 0 || sideB < 0 || sideA === sideB) return;
    /* a heat or final with more than two sides only ranks its winner */
    if (sides.length > 2 && winnerSide !== sideA && winnerSide !== sideB) return;
    out.push({ eventId:ev.id, event:ev.name, label, won:winnerSide === sideA });
  };
  events.forEach(ev => {
    if (!ev || ev.finale || state.shelved?.[ev.id]) return;
    const draw = state.draws?.[ev.id], br = state.brackets?.[ev.id], st = state.stages?.[ev.id];
    if (br?.rounds && draw?.teams) {
      br.rounds.forEach((round, r) => round.forEach((match, m) => {
        if (!decided(match.winner)) return;
        const keys = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
        if (keys.some(key => !draw.teams[key])) return;
        meet(ev, contestEntryLabel(state, ev, { kind:"match", match:[r, m] }),
          keys.map(key => draw.teams[key].players || []), keys.indexOf(match.winner));
      }));
      return;
    }
    if (st?.groups) {
      st.groups.forEach(group => {
        const winner = groupWinner(st, group);
        if (!decided(winner)) return;
        const keys = group.entrants || [];
        meet(ev, group.name || "Heat", keys.map(key => stagePlayers(state, st, key, ev.id)), keys.indexOf(winner));
      });
      const finalists = stageFinalists(st);
      if (finalists && decided(st.finalWinner))
        meet(ev, "Final", finalists.map(key => stagePlayers(state, st, key, ev.id)), finalists.indexOf(st.finalWinner));
      return;
    }
    const res = state.results?.[ev.id];
    if (draw?.teams?.length === 2 && res?.slots?.[0]?.length) {
      const sides = draw.teams.map(team => team.players || []);
      const winnerSide = sides.findIndex(players => res.slots[0].some(player => players.includes(player)));
      if (winnerSide >= 0) meet(ev, ev.name, sides, winnerSide);
    }
  });
  return out;
}

/* a viewer's settled tickets on another player, for that player's card */
export function betsOn(state, viewer, player, events = allEventsOf(state)) {
  const out = { won:0, lost:0, net:0 };
  (state.wagers || []).forEach(wager => {
    if (wager.player !== viewer || !wagerPickPlayers(state, wager).includes(player)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    out[result.status] += 1;
    out.net += result.delta;
  });
  return out;
}

/* `a`'s record against `b`: every event meeting plus their Quick Draws */
export function headToHead(state, a, b, events = allEventsOf(state)) {
  const meetings = eventMeetings(state, a, b, events);
  const duels = duelTally(state, a, b);
  const won = meetings.filter(meeting => meeting.won).length + duels.won;
  const lost = meetings.filter(meeting => !meeting.won).length + duels.lost;
  return { player:a, other:b, meetings, duels, won, lost, count:won + lost + duels.push };
}

/* the players `player` has met most, closest records first among equals */
export function rivalries(state, player, { events = allEventsOf(state), limit = 3 } = {}) {
  return ROSTER.filter(other => other !== player)
    .map(other => headToHead(state, player, other, events))
    .filter(record => record.won + record.lost > 0)
    .sort((x, y) => (y.won + y.lost) - (x.won + x.lost)
      || Math.abs(x.won - x.lost) - Math.abs(y.won - y.lost)
      || ROSTER.indexOf(x.other) - ROSTER.indexOf(y.other))
    .slice(0, limit);
}

/* The whole card back for one player. `viewer` adds their record against
   this player (someone else's card) or their top rivalries (their own). */
export function seasonStats(state, player, { events = allEventsOf(state), standings, viewer = null } = {}) {
  const rows = events.map(ev => eventRow(state, ev, player)).filter(Boolean);
  const bets = betRecord(state, player, events);
  const duels = duelTally(state, player);
  const table = state.live ? standings || computeStandings(state) : null;
  const row = table?.find(item => item.player === player) || null;
  const moved = !!table?.some(item => item.pts !== START);
  const own = !!viewer && viewer === player;
  const versus = viewer && !own ? headToHead(state, viewer, player, events) : null;
  const mvps = mvpAwards(state).filter(item => item.player === player).length;
  /* v3.1: leader bounties collected */
  const bounty = bountyAwards(state, events).filter(item => item.player === player);
  return {
    player,
    events:rows,
    wins:rows.filter(item => item.status === "placed" && item.rank === 0).length,
    mvps,
    bounties:{ count:bounty.length, pts:bounty.reduce((sum, item) => sum + item.pts, 0) },
    bets,
    duels,
    rank:moved ? row?.rank ?? null : null,
    pts:row ? row.pts : null,
    versus:versus && versus.count > 0 ? { ...versus, bets:betsOn(state, viewer, player, events) } : null,
    rivals:own ? rivalries(state, player, { events }) : [],
    active:rows.length > 0 || bets.won + bets.lost + bets.pending > 0
      || duels.won + duels.lost + duels.push > 0 || mvps > 0 || bounty.length > 0 || moved,
  };
}

/* "2-1" with a push tail only when there is one */
export const recordText = ({ won = 0, lost = 0, push = 0 }) => `${won}-${lost}${push ? `-${push}` : ""}`;
