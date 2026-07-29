/* Directed presentation is shared coordination state, not tournament truth.
   Scene records contain stable references and a step. Every player, result,
   and standings view is resolved from current authoritative state. */

import { computeStandings } from "./core.js";

const SHOW_HISTORY_LIMIT = 20;
const SHOW_TERMINAL_OUTCOMES = Object.freeze(["completed", "skipped", "cancelled"]);

const SHOW_SCENE_DEFINITIONS = Object.freeze({
  opening: Object.freeze({
    label:"Opening",
    intensity:"major",
    steps:Object.freeze(["title", "room"]),
  }),
  "event-intro": Object.freeze({
    label:"Event intro",
    intensity:"normal",
    requiresEvent:true,
    steps:Object.freeze(["title", "ready"]),
  }),
  winner: Object.freeze({
    label:"Winner",
    intensity:"major",
    requiresEvent:true,
    requiresResult:true,
    steps:Object.freeze(["winner", "standings"]),
  }),
  standings: Object.freeze({
    label:"Standings",
    intensity:"routine",
    steps:Object.freeze(["board"]),
  }),
  champion: Object.freeze({
    label:"Champion",
    intensity:"major",
    requiresFrozen:true,
    steps:Object.freeze(["champion"]),
  }),
});

const emptyShowControl = () => ({ active:null, history:[] });
const showDefinition = kind =>
  Object.hasOwn(SHOW_SCENE_DEFINITIONS, kind) ? SHOW_SCENE_DEFINITIONS[kind] : null;

function validateShowSceneRequest(state, request, events = []) {
  if (!request || typeof request !== "object" || Array.isArray(request))
    return { ok:false, error:"Choose a show scene" };
  const kind = typeof request.kind === "string" ? request.kind : "";
  const definition = showDefinition(kind);
  if (!definition) return { ok:false, error:"Unknown show scene" };

  let eventId = null;
  let event = null;
  if (definition.requiresEvent) {
    eventId = typeof request.eventId === "string" ? request.eventId : "";
    event = events.find(item => item.id === eventId) || null;
    if (!event) return { ok:false, error:"Choose a current event" };
    if (state.shelved?.[eventId]) return { ok:false, error:"That event is shelved" };
  }
  if (definition.requiresResult) {
    const result = state.results?.[eventId];
    if (!result?.slots?.[0]?.length)
      return { ok:false, error:"Post the official result first" };
  }
  if (definition.requiresFrozen) {
    if (!state.frozen) return { ok:false, error:"Crown the champion first" };
    if (!computeStandings(state).some(row => row.rank === 1))
      return { ok:false, error:"No champion is available" };
  }

  return {
    ok:true,
    request:{ kind, eventId },
    definition,
    event,
  };
}

function createShowScene(request, {
  id,
  now,
  retryOf = null,
} = {}) {
  const timestamp = Number(now) || Date.now();
  return {
    id,
    kind:request.kind,
    eventId:request.eventId || null,
    step:0,
    startedAt:timestamp,
    updatedAt:timestamp,
    retryOf:retryOf || null,
    commands:[],
  };
}

function finishShowScene(control, outcome, now = Date.now()) {
  if (!control?.active || !SHOW_TERMINAL_OUTCOMES.includes(outcome)) return null;
  const active = control.active;
  const entry = {
    id:active.id,
    kind:active.kind,
    eventId:active.eventId || null,
    startedAt:active.startedAt,
    endedAt:Number(now) || Date.now(),
    outcome,
    retryOf:active.retryOf || null,
    commands:Array.isArray(active.commands) ? active.commands.slice(-8) : [],
  };
  control.active = null;
  control.history = [entry, ...(Array.isArray(control.history) ? control.history : [])]
    .slice(0, SHOW_HISTORY_LIMIT);
  return entry;
}

function resolveShowScene(state, events = []) {
  const active = state.showControl?.active;
  if (!active || typeof active !== "object") return null;
  const definition = showDefinition(active.kind);
  if (!definition) {
    return {
      active,
      definition:null,
      stepKey:null,
      stepIndex:0,
      stepCount:0,
      event:null,
      result:null,
      players:[],
      standings:computeStandings(state),
      staleReason:"This scene is not supported by this version",
    };
  }

  const event = active.eventId
    ? events.find(item => item.id === active.eventId) || null
    : null;
  const result = event ? state.results?.[event.id] || null : null;
  const standings = computeStandings(state);
  const stepIndex = Math.max(0, Math.min(
    definition.steps.length - 1,
    Math.floor(Number(active.step) || 0),
  ));
  let staleReason = null;
  if (definition.requiresEvent && !event) staleReason = "The event is no longer available";
  else if (definition.requiresResult && !result?.slots?.[0]?.length)
    staleReason = "The official result is no longer available";
  else if (definition.requiresFrozen && !state.frozen)
    staleReason = "The championship is no longer final";

  let players = [];
  if (active.kind === "winner") players = [...(result?.slots?.[0] || [])];
  else if (active.kind === "standings")
    players = standings.slice(0, 3).map(row => row.player);
  else if (active.kind === "champion")
    players = standings.filter(row => row.rank === 1).map(row => row.player);

  return {
    active,
    definition,
    stepKey:definition.steps[stepIndex],
    stepIndex,
    stepCount:definition.steps.length,
    event,
    result,
    players,
    standings,
    staleReason,
  };
}

export {
  SHOW_HISTORY_LIMIT,
  SHOW_TERMINAL_OUTCOMES,
  SHOW_SCENE_DEFINITIONS,
  emptyShowControl,
  showDefinition,
  validateShowSceneRequest,
  createShowScene,
  finishShowScene,
  resolveShowScene,
};
