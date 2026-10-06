import { resolveEventLifecycle, resultAwards } from "../../../shared/core.js";

/* A session whose every event is complete folds into one row while anything
   is still left to play, so the event in play and what follows sit near the
   top of Events. Once nothing is left (nextId is null) every session stays
   open. `list` is the session's events without shelved ones. */
export function sessionFold(state, list, nextId) {
  if (!nextId || !list.length) return null;
  if (!list.every(event => resolveEventLifecycle(state, event).phase === "complete")) return null;
  const winners = [...new Set(list.flatMap(event => state.results?.[event.id]?.slots?.[0] || []))];
  return { played:list.length, winners };
}

/* This visit's explicit open/closed choices, by session id. sessionStorage so a
   session opened to look up a winner folds again on the next launch. */
export const FOLD_KEY = "si-events-open";
export function readFolds() {
  try {
    const value = JSON.parse(sessionStorage.getItem(FOLD_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function writeFolds(value) {
  try { sessionStorage.setItem(FOLD_KEY, JSON.stringify(value)); } catch {}
}

const LIVE_PHASES = new Set(["betting-open", "betting-locked", "in-progress", "result-entry"]);

/* The words a guest reads for where an event stands: what is happening in
   the room, never the commissioner's preparation steps (Setup, Draw pending,
   Result entry). The commissioner's views keep the lifecycle's own labels. */
const GUEST_PHASE_WORDS = {
  scheduled:"Next", setup:"Next", "betting-open":"Betting open", "betting-locked":"Playing",
  "in-progress":"Playing", "result-entry":"Awaiting result", complete:"Done", shelved:"Skipped",
};
export function guestPhaseLabel(state, event, phase = resolveEventLifecycle(state, event).phase) {
  const solo = event?.teamCfg?.size === 1;
  if (phase === "draw-pending") return state?.drafts?.[event?.id] ? "Drafting" : solo ? "Bracket soon" : "Teams soon";
  if (phase === "draw-revealed") return solo ? "Bracket set" : "Teams set";
  return GUEST_PHASE_WORDS[phase] || "";
}

/* One Events row, read from state: its lamp (steady live, flashing pending,
   unlit done, struck shelved, none while it waits its turn), the status word
   that sits beside a lit or flashing lamp (the guest's word; the lifecycle's
   own label for the commissioner, `gm`), and YOUR part in it: the players
   you share a side with (you first), a crew role, or the place you took.
   `winners` is the result's first place. Pure. */
export function eventRowModel(state, event, me, nextId, { gm = false } = {}) {
  const lifecycle = resolveEventLifecycle(state, event);
  const res = state.results?.[event.id];
  const shelved = !!state.shelved?.[event.id];
  const live = !shelved && !res && (LIVE_PHASES.has(lifecycle.phase) || state.onDeck === event.id);
  const pending = !shelved && !res && !live && event.id === nextId;
  const lamp = shelved ? "void" : res ? "done" : live ? "live" : pending ? "pending" : null;
  const status = !(live || pending) ? "" : gm ? lifecycle.label : guestPhaseLabel(state, event, lifecycle.phase);
  const mine = { players:[], role:null, place:null };
  if (me && !shelved) {
    if (res) {
      const award = resultAwards(state, event, res).find(item => item.player === me);
      if (award) mine.place = award.place;
    } else if (!state.away?.[me] && !event.finale) {
      const draw = state.draws?.[event.id], stage = state.stages?.[event.id], draft = state.drafts?.[event.id];
      const role = (draw?.roles || draft?.roles || stage?.roles || []).find(item => item.player === me);
      const team = draw?.teams?.find(item => item.players.includes(me));
      if (role) { mine.role = role.role; mine.players = [me]; }
      else if (team) mine.players = [me, ...team.players.filter(player => player !== me)];
      else if (stage?.entrantType === "solo" && stage.groups.some(group => group.entrants.includes(me))) mine.players = [me];
    }
  }
  return { lamp, status, phase:lifecycle.phase, mine, winners:res?.slots?.[0] || [] };
}
