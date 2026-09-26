/* Directed presentation is shared coordination state, not tournament truth.
   Scene records contain stable references and a step. Every player, result,
   and standings view is resolved from current authoritative state. */

import { computeStandings, resolveWeekendOperation, resolveCurrentContest, validateEventParticipants, ROSTER } from "./core.js";

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
  revision = null,
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
    /* winner scenes remember which result revision they played for, so a
       correction marks the scene stale and the replay beat can tell a
       ceremony that already ran from one the corrected result still owes. */
    revision:revision ?? null,
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
    revision:active.revision ?? null,
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
  else if (definition.requiresEvent && state.shelved?.[event.id])
    staleReason = "The event was shelved";
  else if (definition.requiresResult && !result?.slots?.[0]?.length)
    staleReason = "The official result is no longer available";
  else if (definition.requiresResult && active.revision != null
      && Number(result.revision || 1) !== Number(active.revision))
    staleReason = "The result was corrected";
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

/* ── the director ──
   One resolver decides the single next beat: advance the scene on the TV,
   clear a stale one, replay a ceremony a corrected result still owes, or
   run the next official step. Lifecycle beats are upgraded to their
   composite forms (announce, announce-draw, lock-start) whether or not
   Show Control is on; scene beats exist only when it is. The TV keeps
   reading resolveWeekendOperation, so director copy never leaks to the
   room. */
const REPLAY_WINDOW_MS = 15 * 60 * 1000;
const ADVANCE_LABELS = { winner:{ winner:"Show standings" } };
const directorBeat = (type, label, extra = {}) =>
  ({ type, label, enabled:true, blockers:[], ...extra });

function resolveDirector(state, events = [], { showControl = false, now = Date.now() } = {}) {
  const operation = resolveWeekendOperation(state, events);
  const control = state.showControl;
  const history = Array.isArray(control?.history) ? control.history : [];

  if (showControl) {
    const scene = resolveShowScene(state, events);
    if (scene) {
      if (scene.staleReason)
        return { ...operation, scene, nextAction:
          directorBeat("clear-scene", "Clear the scene", { sceneId:scene.active.id }) };
      if (scene.stepIndex < scene.stepCount - 1)
        return { ...operation, scene, nextAction:
          directorBeat("advance-scene",
            ADVANCE_LABELS[scene.active.kind]?.[scene.stepKey] || "Continue",
            { sceneId:scene.active.id }) };
      /* A scene on its last step never holds Continue: the next official
         composite retires it, so the chain cannot dead-end on ceremony. */
    }

    if (!control?.active) {
      const latest = Object.entries(state.results || {})
        .map(([eventId, result]) => ({ eventId, result }))
        .filter(item => item.result?.slots?.[0]?.length)
        .sort((a, b) => Number(b.result.ts) - Number(a.result.ts))[0] || null;
      if (latest && now - Number(latest.result.ts) < REPLAY_WINDOW_MS) {
        const event = events.find(item => item.id === latest.eventId);
        const played = history.some(entry => entry.kind === "winner"
          && entry.eventId === latest.eventId
          && Number(entry.revision ?? 0) === Number(latest.result.revision || 1));
        if (event && !played && !state.shelved?.[latest.eventId])
          return { ...operation, scene:null, nextAction:
            directorBeat("replay-winner-scene", `Play the ${event.name} winner scene`,
              { eventId:latest.eventId }) };
      }

      if (state.frozen && !history.some(entry => entry.kind === "champion"))
        return { ...operation, scene:null, nextAction:
          directorBeat("start-champion-scene", "Show the champion") };

    }
  }

  const action = operation.nextAction;
  const ev = operation.event;
  if (!action || !ev) return { ...operation, scene:null };
  const contest = resolveCurrentContest(state, ev);
  if (action.type === "open-betting")
    return { ...operation, scene:null, nextAction:
      { ...action, type:"announce", label:`Announce ${ev.name}` } };
  if (action.type === "prepare-draw" && validateEventParticipants(ev, ROSTER, ROSTER).ok)
    return { ...operation, scene:null, nextAction:
      { ...action, type:"announce-draw", label:`Announce and draw ${ev.name}` } };
  if (action.type === "lock-betting")
    return { ...operation, scene:null, nextAction:
      { ...action, type:"lock-start", label:`Lock bets and start ${contest?.label || ev.name}` } };
  if (action.type === "start-event")
    return { ...operation, scene:null, nextAction:
      { ...action, type:"lock-start", label:`Start ${contest?.label || ev.name}` } };
  return { ...operation, scene:null };
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
  resolveDirector,
};
