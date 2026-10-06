/* "Before the draw": the intentional check the director pill makes before
   any draw of people (a team draw, heats, a captains draft). Who is here,
   who is crew; then the beat's own write runs with exactly that crew. Pure,
   shared by the sheet and the tests. */
import {
  rosterOf, OVERFLOW_ROLES, MIN_PLAYING, isAway, isOnTheWay, overflowRoleMeta, participationForEvent, presentPlayers, shapeLabel,
  suggestParticipants, validateEventParticipants, teamFit, crewRotation,
} from "../../../shared/core.js";

/* the roles an event's crew can take, in the order a tap cycles them */
export function crewRoles(ev) {
  const policy = participationForEvent(ev || {});
  return policy.overflowRoles?.length ? [...policy.overflowRoles] : [...OVERFLOW_ROLES];
}

/* the director's suggestion: whoever has sat out least, among whoever is
   not sitting this one out */
export const suggestedCrew = (state, ev, sitOut = []) =>
  (suggestParticipants(state, ev, { sitOut })?.roles || []).map(item => ({ player:item.player, role:item.role }));

/* The check as it stands: everyone on the roster in one of four states
   (playing, crew, sitting out, away), and whether the room fits the event.
   Sitting out is this event only and earns nothing; the shape fits whoever
   is left, and at least MIN_PLAYING stay in. */
/* `crew` holds the commissioner's own crew picks; whoever the shape still
   cannot seat (the odd one out of pairs, the 13th of 4 x 3) joins the crew
   by rotation, marked `auto`, never someone set to Playing (`keep`) while
   anyone else can go. */
export function crewCheckModel(state, ev, crew = [], sitOut = [], keep = []) {
  const present = presentPlayers(state);
  const out = sitOut.filter(player => present.includes(player));
  const pool = present.filter(player => !out.includes(player));
  const manual = crew.filter(item => !item.auto && pool.includes(item.player));
  const base = pool.filter(player => !manual.some(item => item.player === player));
  const strict = participationForEvent(ev || {}).type === "strict-teams" && !!ev?.teamCfg;
  const fitBase = strict ? teamFit(ev, base.length) : null;
  const extra = fitBase ? Math.max(0, base.length - fitBase.teams * fitBase.size) : 0;
  const order = crewRotation(state, ev, base);
  const picks = [...order.filter(player => !keep.includes(player)), ...order.filter(player => keep.includes(player))]
    .slice(0, extra);
  const roles = crewRoles(ev);
  const auto = picks.map((player, index) => ({ player, role:roles[(manual.length + index) % roles.length], auto:true }));
  const kept = [...manual, ...auto];
  const crewIds = kept.map(item => item.player);
  const playing = pool.filter(player => !crewIds.includes(player));
  const heats = !ev?.teamCfg;
  const floor = Math.min(MIN_PLAYING, present.length);
  const fit = out.length && pool.length < MIN_PLAYING ? { ok:false, error:`${MIN_PLAYING} need to play` }
    : heats
    ? (playing.length < floor ? { ok:false, error:`${floor} need to play` }
      : playing.length >= (ev?.stageCfg?.nGroups || 2) * 2 ? { ok:true } : { ok:false, error:"Heats need at least 2 players each" })
    : validateEventParticipants(ev, playing, pool);
  const roster = rosterOf(state).map(player => {
    const seat = kept.find(item => item.player === player);
    const role = seat?.role || null;
    /* `auto`: crew because the shape could not seat them (drawn on the chip) */
    /* on the way (arrivals): not here yet, so not in this draw until they arrive */
    return { player, state:isAway(state, player) ? "away" : isOnTheWay(state, player) ? "road"
      : out.includes(player) ? "out" : role ? "crew" : "playing",
      role, roleLabel:role ? overflowRoleMeta(role).short : null, auto:!!seat?.auto };
  });
  return { roster, present, pool, playing, crew:kept, sitOut:out, fit,
    /* sitting out is offered only while the room can spare someone */
    canSitOut:present.length > MIN_PLAYING,
    shape:!heats && fit.ok && fit.fit ? shapeLabel(fit.fit) : null };
}

/* a player in or out of the sit-outs */
export const toggleSitOut = (sitOut, player) =>
  sitOut.includes(player) ? sitOut.filter(item => item !== player) : [...sitOut, player];

/* a player on or off the crew */
export function toggleCrew(ev, crew, player) {
  if (crew.some(item => item.player === player)) return crew.filter(item => item.player !== player);
  const roles = crewRoles(ev);
  return [...crew, { player, role:roles[crew.length % roles.length] }];
}
/* a face's own choice "Crew" (role null: the next role in turn) or one of
   its roles: a player already on the crew keeps their seat and takes the
   role; anyone else joins it */
export function setCrewRole(ev, crew, player, role = null) {
  const roles = crewRoles(ev);
  const pick = roles.includes(role) ? role : null;
  if (crew.some(item => item.player === player))
    return pick ? crew.map(item => item.player === player ? { ...item, role:pick } : item) : crew;
  return [...crew, { player, role:pick || roles[crew.length % roles.length] }];
}

/* The choices a face offers, in the order they are drawn: playing, crew,
   sitting out (only while the room can spare someone, or already out),
   away; a face still on the way offers Here (a write, now) and away. One
   tap on a face opens them in place. */
export function seatChoices(model, entry) {
  /* on the way: the one thing to do is mark them here (or away) */
  if (entry?.state === "road") return ["here", "away"];
  return ["playing", "crew", ...(model.canSitOut || entry?.state === "out" ? ["out"] : []), "away"];
}

/* the role tag under a crew chip cycles the event's roles */
export function cycleRole(ev, crew, player) {
  const roles = crewRoles(ev);
  return crew.map(item => item.player === player
    ? { ...item, role:roles[(roles.indexOf(item.role) + 1) % roles.length] } : item);
}

/* The beat's own action with the confirmed room: the write carries the
   players and crew, a draft opens with them as its pool. */
export function crewCheckRun(then, playing, crew, sitOut = []) {
  const roles = crew.map(item => ({ player:item.player, role:item.role }));
  const out = sitOut.length ? { sitOut:[...sitOut] } : {};
  if (then?.write) return { ...then, payload:{ ...then.payload, players:[...playing], roles, ...out } };
  return { ...then, pool:[...playing], roles, ...out };
}
