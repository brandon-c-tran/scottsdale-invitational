/* The commissioner's TV sheet as data: what the TV shows now, what he can
   put on it, the steps of the scene playing, and the TVs in the room.
   Pure: App and the sheet read it; tests pin it.

   "Scene" (state.showControl) stays the data contract's word; the guest
   facing name is the TV. Without a scene the TV runs itself: the finale's
   table, the live event's board, else the standings. */
import { pokerLive } from "../../../shared/core.js";
import { SHOW_SCENE_DEFINITIONS } from "../../../shared/show.js";
import { liveEventOf } from "../../ui/phase.js";
import { liveTvs } from "./tvHealth.js";

/* each step a scene walks through, named for what the room sees */
export const TV_STEP_NAMES = Object.freeze({
  title:"Title", room:"Roster", ready:"Ready", winner:"Winner", standings:"Standings", board:"Board",
  champion:"Champion", class:"Class photo",
});

/* the newest posted result, for the Winner tile */
export function latestResult(state, events = []) {
  let latest = null;
  for (const [eventId, result] of Object.entries(state.results || {})) {
    const event = events.find(item => item.id === eventId);
    if (event && !event.finale && result?.slots?.[0]?.length && (!latest || Number(result.ts) > Number(latest.result.ts)))
      latest = { event, result };
  }
  return latest;
}

/* what the TV shows with no scene on it */
export function tvAmbient(state, events = [], operationEvent = null) {
  if (state.frozen) return { kind:"champion", label:"Champion", event:null };
  const finale = events.find(ev => ev.finale);
  if (finale && pokerLive(state)) return { kind:"live", label:finale.name, event:finale };
  const live = liveEventOf(state, events, operationEvent);
  if (live) return { kind:"live", label:live.name, event:live };
  return { kind:"standings", label:"Standings", event:null };
}

/* the scene playing, as the sheet's card reads it */
export function tvNowCard(scene, ambient) {
  if (!scene) return { playing:false, kind:ambient.kind, label:ambient.label, event:ambient.event, steps:[], stale:null };
  const definition = scene.definition;
  if (!definition) return { playing:true, kind:"unknown", label:"Unknown scene", event:null, steps:[], stale:scene.staleReason };
  const steps = definition.steps.length > 1 ? definition.steps.map((key, i) => ({ key, name:TV_STEP_NAMES[key] || key,
    state:i < scene.stepIndex ? "done" : i === scene.stepIndex ? "live" : "next" })) : [];
  return { playing:true, kind:scene.active.kind, label:definition.label, event:scene.event || null, steps,
    stale:scene.staleReason || null, step:scene.stepIndex, stepCount:scene.stepCount };
}

/* the menu row's value: "Opening 2 of 2", "Winner: Beer Pong", "Standings" */
export function tvNowLabel(scene, ambient) {
  if (!scene) return ambient.label;
  const definition = scene.definition;
  if (!definition) return "Unknown scene";
  if (scene.event) return `${definition.label}: ${scene.event.name}`;
  return definition.steps.length > 1 ? `${definition.label} ${scene.stepIndex + 1} of ${scene.stepCount}` : definition.label;
}

/* the scenes the commissioner can put on: Opening, the current event's
   intro, the latest result's winner, Standings, Champion once crowned */
export function tvSceneTiles(state, events = [], operationEvent = null) {
  const latest = latestResult(state, events);
  return [
    { kind:"opening", label:SHOW_SCENE_DEFINITIONS.opening.label },
    operationEvent && !operationEvent.finale && { kind:"event-intro", eventId:operationEvent.id,
      label:SHOW_SCENE_DEFINITIONS["event-intro"].label, event:operationEvent },
    latest && { kind:"winner", eventId:latest.event.id, label:SHOW_SCENE_DEFINITIONS.winner.label, event:latest.event },
    { kind:"standings", label:SHOW_SCENE_DEFINITIONS.standings.label },
    state.frozen && { kind:"champion", label:SHOW_SCENE_DEFINITIONS.champion.label },
  ].filter(Boolean);
}

/* the scene the server ended before its last step (stale, or ended by the
   commissioner) can be put back on; one that finished or was skipped not */
export function tvRetry(state) {
  const last = state.showControl?.history?.[0];
  if (!last || last.outcome !== "cancelled" || state.showControl?.active) return null;
  const definition = SHOW_SCENE_DEFINITIONS[last.kind];
  return definition ? { id:last.id, label:definition.label } : null;
}

/* the primary verb while a scene plays, matching the director pill */
export function tvAdvanceLabel(scene) {
  if (!scene?.definition) return "Next";
  if (scene.stepIndex >= scene.stepCount - 1) return "Finish";
  const kind = scene.active?.kind;
  if (kind === "winner" && scene.stepIndex === 0) return "Show standings";
  if (kind === "champion" && scene.stepIndex === 0) return "Class photo";
  return "Next";
}

/* the TVs in the room: null when the server has not said (an older build,
   or before the first presence frame) */
export function tvRoom({ tvs, receivedAt = 0, live = false, now = Date.now() } = {}) {
  const on = liveTvs(tvs, receivedAt, now);
  if (!on) return null;
  return {
    tvs:on.map((tv, i) => ({ key:`tv-${i}`, sound:tv.sound === "blocked" ? "off" : tv.sound === "on" ? "on" : null })),
    missing:on.length === 0,
    live,
  };
}
