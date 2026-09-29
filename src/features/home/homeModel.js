import {
  PT, ROUND_NAMES, ROSTER, allEventsOf, bracketMatchName, atRisk, bracketChampion, bracketMatchOpen, bracketOrder, computeStandings,
  duelReserve, maxRisk, overflowRoleMeta, participationForEvent,
  resolveEventLifecycle, resolveCurrentContest, resolveSlot, resolveWeekendOperation,
  stageEntrantView, stageFinalists, stacksPosted, teamLabel, wagerBoardEvent,
} from "../../../shared/core.js";

const RUNNING = new Set(["in-progress", "result-entry"]);
const isFinale = event => !!event?.finale && event.game === "poker";
const unique = players => [...new Set(players)];
const unresolved = match => match.winner === null || match.winner === undefined;

function bracketAssignment(bracket, draw, teamIndex) {
  const matches = bracket.rounds.flatMap((round, r) => round.map((match, m) => ({
    ...match, r, m, a:resolveSlot(bracket, match.a), b:resolveSlot(bracket, match.b),
  })));
  const current = matches.find(match => unresolved(match) && match.a !== null && match.b !== null);
  const next = matches.find(match => unresolved(match) && [match.a, match.b].includes(teamIndex));
  const lost = matches.some(match => !unresolved(match)
    && [match.a, match.b].includes(teamIndex) && match.winner !== teamIndex);
  if (!next) return {
    match:null, opponents:[],
    status:lost ? "out" : bracketChampion(bracket) === teamIndex ? "won" : "waiting",
  };
  const opponentIndex = next.a === teamIndex ? next.b : next.a;
  const awaitingOpponent = opponentIndex === null;
  const isCurrent = !!current && current.r === next.r && current.m === next.m;
  /* The undecided side names the match whose winner fills it. */
  const rawOpponent = bracket.rounds[next.r][next.m][next.a === teamIndex ? "b" : "a"];
  const feeder = awaitingOpponent && rawOpponent?.w
    ? bracketMatchName(bracket, rawOpponent.w[0], rawOpponent.w[1]) : null;
  return {
    match:{ r:next.r, m:next.m, a:next.a, b:next.b,
      roundName:(ROUND_NAMES[bracket.size] || [])[next.r] || "Match",
      isCurrent, awaitingOpponent, ...(feeder ? { feeder } : {}) },
    opponents:awaitingOpponent ? [] : [...(draw.teams[opponentIndex]?.players || [])],
    status:isCurrent ? "up-now" : awaitingOpponent ? "waiting" : "next",
  };
}

function groupAssignment(state, event, stage, me, teamIndex) {
  const draw = state.draws?.[event.id];
  if (stage.entrantType === "team" && (!draw || stage.drawId !== draw.id)) return null;
  const key = stage.entrantType === "team" ? teamIndex : me;
  const index = stage.groups.findIndex(group => group.entrants.includes(key));
  if (index < 0) return null;
  const group = stage.groups[index];
  const finalists = stageFinalists(stage);
  const inFinal = finalists?.includes(key);
  const keys = inFinal ? finalists : group.entrants;
  const players = unique(keys.flatMap(entrant => stageEntrantView(state, stage, entrant).players));
  const through = (group.through || []).includes(key);
  const finalDecided = stage.finalWinner !== null && stage.finalWinner !== undefined;
  const status = finalDecided ? stage.finalWinner === key ? "won" : "out"
    : inFinal ? "final"
      : through ? "through"
        : (group.through || []).length >= stage.advance ? "out" : "playing";
  return { group:{ index:inFinal ? null : index, name:inFinal ? "Final" : group.name,
    players, through }, status };
}

function playerAssignment(state, event, me) {
  const empty = { kind:"spectator", label:"", players:[], partners:[], opponents:[],
    match:null, role:null, group:null, status:null };
  if (!me || !ROSTER.includes(me)) return empty;
  const draw = state.draws?.[event.id];
  const draft = state.drafts?.[event.id];
  const stage = state.stages?.[event.id];
  const role = (draw?.roles || draft?.roles || stage?.roles || []).find(item => item.player === me);
  if (role) return { ...empty, kind:"crew", label:overflowRoleMeta(role.role).label,
    role:role.role, players:[me] };

  const policy = participationForEvent(event);
  if (event.teamCfg || policy.type === "strict-teams") {
    const teamIndex = draw?.teams?.findIndex(team => team.players.includes(me)) ?? -1;
    if (teamIndex < 0) return { ...empty, kind:"pending",
      label:draft && !draw ? "Draft in progress" : draw ? "Assignment pending"
        : event.teamCfg?.size === 1 ? "Bracket not drawn" : "Teams not drawn" };
    const team = draw.teams[teamIndex];
    const partners = team.players.filter(player => player !== me);
    const assignment = { ...empty, kind:"team", label:partners.length === 1 ? "Your partner" : "Your team",
      players:[...team.players], partners, teamIndex, teamName:team.name || null };
    if (state.brackets?.[event.id])
      Object.assign(assignment, bracketAssignment(state.brackets[event.id], draw, teamIndex));
    else if (stage) Object.assign(assignment, groupAssignment(state, event, stage, me, teamIndex));
    else if (draw.teams.length === 2)
      assignment.opponents = [...draw.teams[teamIndex === 0 ? 1 : 0].players];
    return assignment;
  }

  if (stage) {
    const group = groupAssignment(state, event, stage, me, -1);
    if (!group) return { ...empty, kind:"pending", label:"Assignment pending" };
    return { ...empty, kind:"solo", label:"Individual event", players:[me], ...group };
  }
  return { ...empty, kind:"solo", label:"Individual event", players:[me] };
}

function currentEvent(state, event, me, before = false) {
  if (!event) return null;
  const lifecycle = resolveEventLifecycle(state, event);
  const contest = resolveCurrentContest(state, event);
  const awaitingResult = lifecycle.phase === "result-entry"
    || (!!(state.brackets?.[event.id] || state.stages?.[event.id])
      && lifecycle.nextAction?.type === "enter-result");
  const status = before ? "First event" : awaitingResult ? "Awaiting result"
    : ["setup", "draw-pending", "draw-revealed", "scheduled"].includes(lifecycle.phase)
      ? "Next event" : lifecycle.label;
  const assignment = playerAssignment(state, event, me);
  if (before || lifecycle.phase !== "in-progress") {
    if (assignment.match) assignment.match.isCurrent = false;
    if (assignment.status === "up-now") assignment.status = "next";
    if (assignment.status === "playing") assignment.status = "assigned";
  }
  if (contest && assignment.group && assignment.group.index !== null
      && contest.group !== assignment.group.index && assignment.status === "playing") assignment.status = "next";
  return { event, lifecycle, contest, status, awaitingResult, assignment };
}

/** Presentation derived entirely from the current server snapshot.
 * `standing.available` means additional chips this player can currently bet;
 * betting.open describes the market, canPlace also checks identity/balance.
 * No field is persisted, and none is permission to bypass server validation.
 */
export function deriveHomeModel({ state, me, events = allEventsOf(state), standings = computeStandings(state) }) {
  const open = events.filter(event => !state.results?.[event.id] && !state.shelved?.[event.id]);
  const countsPosted = stacksPosted(state);
  const tableOpen = !!(state.poker && !state.results?.[state.poker.id]);
  const mode = state.frozen || countsPosted ? "complete" : tableOpen ? "finale" : state.live ? "live" : "before";
  const finalEvent = events.find(event => event.id === state.poker?.id)
    || events.find(event => isFinale(event) && state.results?.[event.id]?.stacks)
    || null;
  const finalPhase = countsPosted ? "complete" : finalEvent
    ? resolveEventLifecycle(state, finalEvent).phase === "result-entry" ? "result-entry"
      : state.poker?.startedAt ? "live" : "setup" : null;
  const finale = finalEvent && (tableOpen || countsPosted) ? { event:finalEvent, phase:finalPhase,
    out:!!state.poker?.outs?.some(item => item.player === me) } : null;

  let current = null;
  if (mode === "before") current = currentEvent(state, open[0], me, true);
  else if (mode === "finale") current = currentEvent(state, finalEvent, me);
  else if (mode === "live") {
    const running = open.filter(event => RUNNING.has(resolveEventLifecycle(state, event).phase));
    const locked = open.filter(event => resolveEventLifecycle(state, event).phase === "betting-locked");
    const active = running.length ? resolveWeekendOperation(state, running).event
      : open.find(event => event.id === state.onDeck)
        || (locked.length ? resolveWeekendOperation(state, locked).event : open[0]);
    current = currentEvent(state, active, me);
  }

  const ownRow = standings.find(row => row.player === me);
  const risk = ownRow ? atRisk(state, me, events) : 0;
  // Accepted duels, plus your own ante on a challenge still waiting for an answer.
  const duelAntes = ownRow ? duelReserve(state, me) : 0;
  const available = ownRow && mode === "live" ? Math.max(0, Math.floor(Math.min(
    maxRisk(ownRow.pts) - risk - duelAntes, ownRow.pts - risk - duelAntes,
  ) / PT) * PT) : 0;
  const standing = ownRow && mode !== "before"
    ? { ...ownRow, atRisk:risk, duelAntes, exposure:risk + duelAntes, available } : null;

  const boardEvent = mode === "live"
    ? wagerBoardEvent(state, events.filter(event => !isFinale(event) && !state.shelved?.[event.id])) : null;
  const marketOpen = !!boardEvent && state.onDeck === boardEvent.id
    && resolveCurrentContest(state, boardEvent)?.phase === "betting-open"
    && (!boardEvent.teamCfg || !!state.draws?.[boardEvent.id]);
  const betting = boardEvent ? { event:boardEvent, open:marketOpen,
    canPlace:marketOpen && !!ownRow && ROSTER.includes(me) && available >= PT,
    label:marketOpen ? "Place chips" : "View bets" } : null;
  const upcoming = mode === "finale" || mode === "complete" ? []
    : open.filter(event => event.id !== current?.event.id
      && !RUNNING.has(resolveEventLifecycle(state, event).phase));

  return { mode, current, betting, upcoming, standing, finale };
}

/* One line for a bracket game on Home. A player in it reads their own path
   ("Play-in ✓ → Semifinal vs Khoa & Brandon"); a spectator or an eliminated
   team reads the match after the one on screen ("Semifinal 2 next"). */
export function bracketPath(state, event, me) {
  const bracket = state.brackets?.[event?.id], draw = state.draws?.[event?.id];
  if (!bracket || !draw || state.results?.[event.id]) return null;
  const names = ROUND_NAMES[bracket.size] || [];
  const round = r => (names[r] || "Match").replace(/s$/, "");
  const matchName = (r, m) => bracketMatchName(bracket, r, m);
  const contest = resolveCurrentContest(state, event);
  const current = contest?.kind === "match" ? contest.match : null;
  const isCurrent = (r, m) => !!current && current[0] === r && current[1] === m;
  const team = draw.teams.findIndex(item => item.players.includes(me));
  if (team >= 0) {
    const steps = [];
    let next = null, lost = false;
    bracket.rounds.forEach((matches, r) => matches.forEach((match, m) => {
      const a = resolveSlot(bracket, match.a), b = resolveSlot(bracket, match.b);
      if (a !== team && b !== team) return;
      if (!unresolved(match)) { if (match.winner === team) steps.push(`${round(r)} ✓`); else lost = true; }
      else if (!next) next = { r, m, opponent:a === team ? b : a, slot:match[a === team ? "b" : "a"] };
    }));
    if (!lost) {
      if (next && isCurrent(next.r, next.m)) steps.push(`${round(next.r)} now`);
      else if (next) {
        const opponent = next.opponent !== null && next.opponent !== undefined
          ? teamLabel(state, draw.teams[next.opponent])
          : next.slot?.w ? `winner of ${matchName(next.slot.w[0], next.slot.w[1])}` : null;
        steps.push(opponent ? `${round(next.r)} vs ${opponent}` : round(next.r));
      }
      /* one line however deep the bracket: only the latest round won stays */
      const won = steps.filter(step => step.endsWith("✓")).length;
      if (steps.length) return { mine:true, text:steps.slice(Math.max(0, won - 1)).join(" → ") };
    }
  }
  const open = bracketOrder(bracket).filter(([r, m]) => unresolved(bracket.rounds[r][m]) && !isCurrent(r, m));
  const pick = open.find(([r, m]) => bracketMatchOpen(bracket, r, m)) || open[0];
  return pick ? { mine:false, text:`${matchName(pick[0], pick[1])} next` } : null;
}
