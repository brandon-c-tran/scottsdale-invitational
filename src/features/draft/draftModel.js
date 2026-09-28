/* The draft board as both the phone sheet and the TV draw it: every team's
   seats in snake order (filled or waiting for a numbered pick), the turn, the
   picks still to come, and what the latest pick was. Pure; the rules come
   from draftTurn/snakeTeam in core. */

import { draftTurn, snakeTeam } from "../../../shared/core.js";

/* Seats for each team after its captain: one per pick the snake gives that
   team, numbered from 1, filled in the order the team picked. */
export function draftSeats(draft) {
  const turn = draftTurn(draft);
  if (!turn) return [];
  const T = draft.teams.length;
  const schedule = Array.from({ length:T }, () => []);
  for (let k = 0; k < turn.totalPicks; k++) schedule[snakeTeam(k, T)].push(k + 1);
  return draft.teams.map((team, index) => {
    const players = Array.isArray(team.players) ? team.players : [];
    const captain = team.captain || players[0] || null;
    const seated = players.filter(player => player !== captain);
    const count = Math.max(schedule[index].length, seated.length);
    return {
      index, captain,
      slots:Array.from({ length:count }, (_, slot) => ({ pick:schedule[index][slot] || null, player:seated[slot] || null })),
    };
  });
}

/* The board: the turn, seats, the next `upcoming` picks (the current one
   first), and the latest pick with its number. */
export function draftBoard(draft, { upcoming = 6 } = {}) {
  const turn = draftTurn(draft);
  if (!turn) return null;
  const T = draft.teams.length;
  const next = Array.from({ length:Math.min(turn.remaining, upcoming) }, (_, offset) => {
    const pick = turn.pickIndex + offset, team = snakeTeam(pick, T);
    return { pick:pick + 1, team, captain:draft.teams[team].captain, turnsBack:offset > 0 && team === snakeTeam(pick - 1, T) };
  });
  const lastPick = draft.picks.at(-1);
  return {
    turn, teams:draftSeats(draft), upcoming:next, pool:[...draft.pool],
    last:lastPick ? { player:lastPick.player, team:lastPick.team, pick:draft.picks.length,
      captain:draft.teams[lastPick.team]?.captain || null } : null,
  };
}

/* The pick a fresh change of the pick count lands: only one more pick on
   the same draft. An undo, a new draft, or a jump of several picks (a
   catch-up) lands nothing. Pure. */
export function landedPick(draft, change) {
  if (!draft || !change?.fresh) return null;
  const { from, to } = change;
  if (!Number.isInteger(from) || to !== from + 1 || draft.picks.length !== to) return null;
  const pick = draft.picks[to - 1];
  return pick ? { player:pick.player, team:pick.team, pick:to } : null;
}
