/* "Before the draw": the intentional check the director pill makes before
   any draw of people (a team draw, heats, a captains draft). Who is here,
   who is crew; then the beat's own write runs with exactly that crew. Pure,
   shared by the sheet and the tests. */
import {
  ROSTER, OVERFLOW_ROLES, isAway, overflowRoleMeta, participationForEvent, presentPlayers, shapeLabel,
  suggestParticipants, validateEventParticipants,
} from "../../../shared/core.js";

/* the roles an event's crew can take, in the order a tap cycles them */
export function crewRoles(ev) {
  const policy = participationForEvent(ev || {});
  return policy.overflowRoles?.length ? [...policy.overflowRoles] : [...OVERFLOW_ROLES];
}

/* the director's suggestion: whoever has sat out least */
export const suggestedCrew = (state, ev) =>
  (suggestParticipants(state, ev)?.roles || []).map(item => ({ player:item.player, role:item.role }));

/* The check as it stands: everyone on the roster in one of three states,
   and whether the room fits the event. */
export function crewCheckModel(state, ev, crew = []) {
  const present = presentPlayers(state);
  const kept = crew.filter(item => present.includes(item.player));
  const crewIds = kept.map(item => item.player);
  const playing = present.filter(player => !crewIds.includes(player));
  const heats = !ev?.teamCfg;
  const fit = heats
    ? (playing.length >= (ev?.stageCfg?.nGroups || 2) * 2 ? { ok:true } : { ok:false, error:"Heats need at least 2 players each" })
    : validateEventParticipants(ev, playing, present);
  const roster = ROSTER.map(player => {
    const role = kept.find(item => item.player === player)?.role || null;
    return { player, state:isAway(state, player) ? "away" : role ? "crew" : "playing",
      role, roleLabel:role ? overflowRoleMeta(role).short : null };
  });
  return { roster, present, playing, crew:kept, fit,
    shape:!heats && fit.ok && fit.fit ? shapeLabel(fit.fit) : null };
}

/* one tap on a player with the crew brush: playing <-> crew */
export function toggleCrew(ev, crew, player) {
  if (crew.some(item => item.player === player)) return crew.filter(item => item.player !== player);
  const roles = crewRoles(ev);
  return [...crew, { player, role:roles[crew.length % roles.length] }];
}
/* the role tag under a crew chip cycles the event's roles */
export function cycleRole(ev, crew, player) {
  const roles = crewRoles(ev);
  return crew.map(item => item.player === player
    ? { ...item, role:roles[(roles.indexOf(item.role) + 1) % roles.length] } : item);
}

/* The beat's own action with the confirmed room: the write carries the
   players and crew, a draft opens with them as its pool. */
export function crewCheckRun(then, playing, crew) {
  const roles = crew.map(item => ({ player:item.player, role:item.role }));
  if (then?.write) return { ...then, payload:{ ...then.payload, players:[...playing], roles } };
  return { ...then, pool:[...playing], roles };
}
