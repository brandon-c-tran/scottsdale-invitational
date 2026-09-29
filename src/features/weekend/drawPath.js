/* D10 "Your path after the draw": when the synced reveal lands on your
   card, one line draws where the draw sends you. Pure and derived from the
   saved draw; nothing here is stored.

   A bracket: your first match, then each match its winner feeds, to the
   final. A stop shows its opponent when the bracket already knows it (their
   photo chips), else the match that decides it ("Semifinal 2 winner"), with
   that match's teams as the candidates when both are seated.
   Heats or pools: your group, its rivals and who goes through, then the
   final. Anyone not in the draw (spectators, crew) gets null. */
import { bracketMatchName, resolveSlot } from "../../../shared/core.js";

const decided = value => value !== null && value !== undefined;
const teamPlayers = (draw, index) => [...(draw?.teams?.[index]?.players || [])];

/* where the winner of match (r, m) plays next */
function feedsInto(bracket, r, m) {
  const rounds = bracket.rounds || [];
  for (let next = r + 1; next < rounds.length; next++)
    for (let index = 0; index < rounds[next].length; index++) {
      const match = rounds[next][index];
      for (const side of ["a", "b"]) {
        const slot = match[side];
        if (slot?.w && slot.w[0] === r && slot.w[1] === m) return { r:next, m:index, side };
      }
    }
  return null;
}

function opponentStop(bracket, draw, slot) {
  const seated = resolveSlot(bracket, slot);
  if (decided(seated)) return { opponents:teamPlayers(draw, seated), from:null, candidates:[] };
  if (!slot?.w) return { opponents:null, from:null, candidates:[] };
  const [r, m] = slot.w;
  const feeder = bracket.rounds?.[r]?.[m];
  const a = feeder ? resolveSlot(bracket, feeder.a) : null, b = feeder ? resolveSlot(bracket, feeder.b) : null;
  return { opponents:null, from:bracketMatchName(bracket, r, m),
    candidates:decided(a) && decided(b) ? [teamPlayers(draw, a), teamPlayers(draw, b)] : [] };
}

export function bracketDrawPath(state, evId, me) {
  const bracket = state?.brackets?.[evId], draw = state?.draws?.[evId];
  if (!bracket?.rounds?.length || !draw?.teams || !me) return null;
  const team = draw.teams.findIndex(item => (item?.players || []).includes(me));
  if (team < 0) return null;
  /* the first match the team is seated in */
  let at = null;
  bracket.rounds.forEach((matches, r) => matches.forEach((match, m) => {
    if (at) return;
    if (resolveSlot(bracket, match.a) === team) at = { r, m, side:"a" };
    else if (resolveSlot(bracket, match.b) === team) at = { r, m, side:"b" };
  }));
  if (!at) return null;
  const steps = [];
  for (let guard = 0; at && guard < 8; guard++) {
    const match = bracket.rounds[at.r][at.m];
    /* later rounds are reached through the slot this team's win fills */
    const mine = at.side;
    const final = at.r === bracket.rounds.length - 1;
    const stop = opponentStop(bracket, draw, match[mine === "a" ? "b" : "a"]);
    const won = decided(match.winner) && match.winner === team;
    const lost = decided(match.winner) && match.winner !== team;
    steps.push({ id:`${at.r}:${at.m}`, label:bracketMatchName(bracket, at.r, at.m), final,
      ...stop, won, lost });
    if (lost) break;
    at = feedsInto(bracket, at.r, at.m);
  }
  return { kind:"bracket", evId, team, steps };
}

export function stageDrawPath(state, evId, me) {
  const stage = state?.stages?.[evId];
  if (!stage?.groups?.length || !me) return null;
  const team = stage.entrantType === "team";
  const draw = state?.draws?.[evId];
  const playersOf = key => team ? teamPlayers(draw, key) : [key];
  const group = stage.groups.find(item => (item.entrants || []).some(key => playersOf(key).includes(me)));
  if (!group) return null;
  const own = (group.entrants || []).find(key => playersOf(key).includes(me));
  const rivals = (group.entrants || []).filter(key => key !== own).map(playersOf);
  const advance = Math.max(1, Number(stage.advance) || 1);
  const noun = stage.kind === "pools" ? "pool" : "heat";
  const through = (group.through || []);
  const out = through.length >= advance && !through.includes(own);
  const steps = [
    { id:`group:${group.name}`, label:group.name, final:false, opponents:rivals.flat(), from:null, candidates:[],
      note:advance === 1 ? "Winner goes through" : `Top ${advance} go through`,
      won:through.includes(own), lost:out },
  ];
  if (!out) steps.push({ id:"final", label:"Final", final:true, opponents:null,
    from:`${stage.groups.length} ${noun} winner${stage.groups.length === 1 ? "" : "s"}`,
    candidates:[], won:false, lost:false });
  return { kind:"stage", evId, steps };
}

/* The path for the reveal on screen: a stage reveal reads its heats or
   pools; a draw reveal its bracket, or the pools it was drawn for. A plain
   two-team draw (or a draw with no structure behind it) has no path. */
export function drawPath(state, reveal, me) {
  if (!reveal?.evId || !me) return null;
  const { evId } = reveal;
  const stage = state?.stages?.[evId], draw = state?.draws?.[evId];
  if (stage && reveal.id === stage.id) return stageDrawPath(state, evId, me);
  if (!draw || reveal.id !== draw.id) return null;
  if (state.brackets?.[evId]) return bracketDrawPath(state, evId, me);
  if (stage && (!stage.drawId || stage.drawId === draw.id)) return stageDrawPath(state, evId, me);
  return null;
}

/* one sentence for screen readers and tests: "Semifinal 1 vs Khoa & Ben,
   then Final vs Semifinal 2 winner" */
export function drawPathText(path, nameOf = player => player) {
  if (!path?.steps?.length) return "";
  return path.steps.map(step => {
    const who = step.opponents?.length ? ` vs ${step.opponents.map(nameOf).join(" & ")}`
      : step.from ? ` vs ${step.from}${path.kind === "bracket" ? " winner" : ""}` : "";
    return `${step.label}${who}${step.note ? ` (${step.note})` : ""}`;
  }).join(", then ");
}
