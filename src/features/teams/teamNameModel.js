/* Team names on the phone, as data (shared/teamNames.js holds the rules and
   the suggestions). Pure. */
import { teamLabel } from "../../../shared/core.js";
import { cleanTeamName, teamNameKey, teamNameProblem, teamNamesLocked, teamNameSuggestions, TEAM_NAME_MAX } from "../../../shared/teamNames.js";

export { TEAM_NAME_MAX };

/* One team's naming, for its members (or the commissioner, `gm`). Null when
   there is nothing to name or the names have locked for a guest. */
export function teamNaming(state, ev, index, { gm = false, round = 0 } = {}) {
  const draw = ev ? state?.draws?.[ev.id] : null;
  const team = draw?.teams?.[index];
  if (!team || (team.players?.length || 0) < 2) return null;
  const locked = teamNamesLocked(state, ev.id);
  if (locked && !gm) return null;
  return {
    evId:ev.id, drawId:draw.id, team:index, players:[...team.players],
    name:team.name || null, label:teamLabel(state, team), named:team.named || null,
    pair:team.players.length === 2, locked,
    suggestions:teamNameSuggestions(state, ev, draw, index, round),
  };
}

/* your own team in an event, while its name is still open */
export function myTeamNaming(state, ev, me, options = {}) {
  if (!me || !ev) return null;
  const index = state?.draws?.[ev.id]?.teams?.findIndex(team => team.players.includes(me)) ?? -1;
  return index < 0 ? null : teamNaming(state, ev, index, options);
}

/* every event where you can still name your team (Home lists them) */
export function namingEvents(state, events = [], me) {
  if (!me || state?.frozen) return [];
  return events.filter(ev => !ev.finale && !!myTeamNaming(state, ev, me));
}

/* a written name checked the way the server checks it: an error, or the clean name */
export function checkTeamName(state, naming, raw) {
  const problem = teamNameProblem(raw);
  if (problem) return { error:problem };
  const name = cleanTeamName(raw);
  if (name === null) return naming?.pair ? { name:null } : { error:"Name required" };
  const others = (state?.draws?.[naming?.evId]?.teams || []).filter((team, index) => index !== naming?.team && team?.name);
  if (others.some(team => teamNameKey(team.name) === teamNameKey(name))) return { error:"Another team has that name" };
  return { name };
}
