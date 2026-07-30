import {
  ROSTER,
  allEventsOf,
  resolveSlot,
} from "./core.js";

const HONOR_NOTE_MAX = 120;
const HONOR_THEMES = Object.freeze([
  { id:"clutch", label:"Clutch", detail:"Delivered when it mattered" },
  { id:"teammate", label:"Teammate", detail:"Made the people around them better" },
  { id:"good-sport", label:"Good sport", detail:"Competitive in the right way" },
  { id:"energy", label:"Energy", detail:"Lifted the whole room" },
  { id:"smart-play", label:"Smart play", detail:"Saw the move before everyone else" },
  { id:"chaos", label:"Chaos", detail:"Made it unforgettable" },
]);
const HONOR_THEME_IDS = new Set(HONOR_THEMES.map(theme => theme.id));

const uniquePlayers = values => [...new Set(values.filter(player => ROSTER.includes(player)))];
const samePlayers = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length
  && [...left].sort().every((player, index) => player === [...right].sort()[index]);

function eventHonorPlayers(state, eventId) {
  const event = allEventsOf(state).find(item => item.id === eventId);
  if (!event) return [];
  const draw = state.draws?.[eventId];
  if (draw) {
    return uniquePlayers([
      ...(draw.teams || []).flatMap(team => team.players || []),
      ...(draw.roles || []).map(item => item?.player),
    ]);
  }
  const stages = state.stages?.[eventId];
  if (stages) {
    const entrants = (stages.groups || []).flatMap(group => group.entrants || []);
    if (stages.entrantType === "team") {
      return uniquePlayers(entrants.flatMap(teamIndex =>
        state.draws?.[eventId]?.teams?.[Number(teamIndex)]?.players || []));
    }
    return uniquePlayers(entrants);
  }
  if (event.kind === "solo") return [...ROSTER];
  return uniquePlayers((state.results?.[eventId]?.slots || []).flat());
}

function bracketHonorContext(state, moment) {
  const draw = state.draws?.[moment.eventId];
  if (!draw || draw.id !== moment.drawId)
    return { valid:false, reason:"The matchup draw changed" };
  const bracket = state.brackets?.[moment.eventId];
  const match = bracket?.rounds?.[Number(moment.round)]?.[Number(moment.match)];
  if (!match) return { valid:false, reason:"The matchup no longer exists" };
  if (match.winner === null || match.winner === undefined)
    return { valid:false, reason:"The matchup is not complete" };
  const teamIndexes = [
    resolveSlot(bracket, match.a),
    resolveSlot(bracket, match.b),
  ];
  if (teamIndexes.some(index => index === null || !draw.teams?.[index]))
    return { valid:false, reason:"The matchup participants changed" };
  const participants = uniquePlayers(teamIndexes.flatMap(index => draw.teams[index].players || []));
  if (!samePlayers(participants, moment.participants || []))
    return { valid:false, reason:"The matchup participants changed" };
  return { valid:true, participants, draw, bracket, match };
}

function honorMomentContext(state, moment) {
  if (!moment) return { valid:false, reason:"No such props moment" };
  const event = allEventsOf(state).find(item => item.id === moment.eventId);
  if (!event) return { valid:false, reason:"The event no longer exists" };
  if (moment.kind === "event") {
    if (!state.results?.[moment.eventId])
      return { valid:false, reason:"The event result is no longer posted" };
    const participants = eventHonorPlayers(state, moment.eventId);
    if (!participants.length)
      return { valid:false, reason:"No eligible participants" };
    if (!samePlayers(participants, moment.participants || []))
      return { valid:false, reason:"The event participants changed" };
    return { valid:true, event, participants };
  }
  if (moment.kind === "bracket-match") {
    const context = bracketHonorContext(state, moment);
    return context.valid ? { ...context, event } : context;
  }
  return { valid:false, reason:"Unsupported props moment" };
}

function createHonorMoment(state, source, {
  id = crypto.randomUUID(),
  now = Date.now(),
} = {}) {
  const eventId = String(source?.eventId || "");
  const event = allEventsOf(state).find(item => item.id === eventId);
  if (!event) return { ok:false, error:"No such event" };
  if (source?.kind === "event") {
    if (!state.results?.[eventId]) return { ok:false, error:"Post the event result first" };
    const participants = eventHonorPlayers(state, eventId);
    if (participants.length < 2) return { ok:false, error:"Not enough eligible participants" };
    return {
      ok:true,
      moment:{
        id,
        kind:"event",
        eventId,
        participants,
        openedAt:now,
        closedAt:null,
        voidedAt:null,
      },
    };
  }
  if (source?.kind === "bracket-match") {
    const draw = state.draws?.[eventId];
    const bracket = state.brackets?.[eventId];
    const round = Number(source.round);
    const matchIndex = Number(source.match);
    const match = bracket?.rounds?.[round]?.[matchIndex];
    if (!draw || !match) return { ok:false, error:"No such matchup" };
    if (match.winner === null || match.winner === undefined)
      return { ok:false, error:"Complete the matchup first" };
    const teamIndexes = [resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)];
    if (teamIndexes.some(index => index === null || !draw.teams?.[index]))
      return { ok:false, error:"The matchup participants changed" };
    const participants = uniquePlayers(teamIndexes.flatMap(index => draw.teams[index].players || []));
    return {
      ok:true,
      moment:{
        id,
        kind:"bracket-match",
        eventId,
        drawId:draw.id,
        round,
        match:matchIndex,
        participants,
        openedAt:now,
        closedAt:null,
        voidedAt:null,
      },
    };
  }
  return { ok:false, error:"Choose an event or matchup" };
}

function activeHonorMoment(state) {
  return Object.values(state.honorMoments || {})
    .filter(moment => !moment.closedAt && !moment.voidedAt)
    .sort((left, right) => Number(right.openedAt || 0) - Number(left.openedAt || 0))[0] || null;
}

function honorMomentLabel(state, moment) {
  const event = allEventsOf(state).find(item => item.id === moment?.eventId);
  if (!moment) return "Props";
  if (moment.kind === "event") return event?.name || "Completed event";
  const roundNames = ["Quarterfinal", "Semifinal", "Final"];
  return `${event?.name || "Matchup"} · ${roundNames[Number(moment.round)] || "Matchup"}`;
}

function cleanHonorNote(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, HONOR_NOTE_MAX);
}

function honorAggregation(state) {
  const validMoments = new Map(Object.values(state.honorMoments || {})
    .filter(moment => !moment.voidedAt && honorMomentContext(state, moment).valid)
    .map(moment => [moment.id, moment]));
  const byRecipient = new Map();
  for (const honor of state.honors || []) {
    const moment = validMoments.get(honor.momentId);
    if (!moment || !HONOR_THEME_IDS.has(honor.theme)) continue;
    const row = byRecipient.get(honor.recipient) || {
      player:honor.recipient,
      givers:new Set(),
      moments:new Set(),
      events:new Set(),
      themes:new Set(),
      themeCounts:{},
      notes:[],
    };
    row.givers.add(honor.giver);
    row.moments.add(honor.momentId);
    row.events.add(moment.eventId);
    row.themes.add(honor.theme);
    row.themeCounts[honor.theme] = (row.themeCounts[honor.theme] || 0) + 1;
    if (honor.note) row.notes.push({
      note:honor.note,
      giver:honor.giver,
      momentId:honor.momentId,
      at:honor.updatedAt || honor.createdAt,
    });
    byRecipient.set(honor.recipient, row);
  }
  return [...byRecipient.values()].map(row => ({
    player:row.player,
    uniqueGivers:row.givers.size,
    uniqueMoments:row.moments.size,
    uniqueEvents:row.events.size,
    uniqueThemes:row.themes.size,
    total:Object.values(row.themeCounts).reduce((sum, count) => sum + count, 0),
    themeCounts:row.themeCounts,
    notes:row.notes.sort((left, right) => Number(right.at || 0) - Number(left.at || 0)),
    breadth:row.givers.size + row.events.size + row.themes.size,
  })).sort((left, right) =>
    right.breadth - left.breadth
    || right.uniqueGivers - left.uniqueGivers
    || left.player.localeCompare(right.player));
}

export {
  HONOR_NOTE_MAX,
  HONOR_THEMES,
  HONOR_THEME_IDS,
  activeHonorMoment,
  cleanHonorNote,
  createHonorMoment,
  eventHonorPlayers,
  honorAggregation,
  honorMomentContext,
  honorMomentLabel,
};
