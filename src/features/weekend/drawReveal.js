import { INTRO_MS, INTRO_REDUCED_MS } from "../intro/introTiming.js";
import { bracketMatchName, coalescePendingReveals, disp, ROUND_NAMES, resolveSlot, stageEntrantView, teamLabel } from "../../../shared/core.js";

/* A draw reveal only matters while its event is still ahead. Events that
   started, posted, or were shelved retire their ceremony silently; an
   unannounced event's draw plays only if it is current, on deck, or fresh.
   Anything else stays pending (not seen) so its announcement can still play
   it. Replay draw on the event sheet is unaffected. */
export const REVEAL_FRESH_MS = 2 * 60 * 1000;
const revealTime = (state, evId, item) => Number(item.ts) || Number(state.eventOps?.[evId]?.drawRevealedAt)
  || parseInt(String(item.id).replace(/^\D+/, ""), 10) || 0;
export function filterRevealCandidates(state, { seen = [], now = Date.now(), current = null } = {}) {
  const seenIds = new Set(seen), retire = [], draws = {}, stages = {};
  const sort = (map, out) => Object.entries(map || {}).forEach(([evId, item]) => {
    if (!item?.id || seenIds.has(item.id)) return;
    if (state.results?.[evId] || state.shelved?.[evId] || state.eventOps?.[evId]?.startedAt) {
      retire.push(item.id);
      return;
    }
    if (evId === state.onDeck || evId === current || now - revealTime(state, evId, item) <= REVEAL_FRESH_MS)
      out[evId] = item;
  });
  sort(state.draws, draws);
  sort(state.stages, stages);
  return { draws, stages, retire };
}

/* A draw prepared for a later event is held on every screen until that
   event is announced, so nobody sees teams before they know the game. An
   event that is on deck, has had a market, has started, or has a result
   has been announced. */
export function revealReady(state, evId) {
  const op = state.eventOps?.[evId] || {};
  return state.onDeck === evId || !!state.results?.[evId]
    || !!(op.bettingOpenedAt || op.bettingLockedAt || op.startedAt || op.contest || op.resultEntryAt);
}

/* The ceremony a device owes next: only announced draws and stages, with
   older unseen ones retired so a reconnect plays just the latest. Held
   draws are neither played nor marked seen. */
export function pendingReveal(state, events, seen, preferredEvId = null) {
  const ready = map => Object.fromEntries(Object.entries(map || {}).filter(([evId]) => revealReady(state, evId)));
  const { staleIds, latest } = coalescePendingReveals(ready(state.draws), ready(state.stages), seen, preferredEvId);
  return { staleIds, next:latest ? buildEventReveal(state, events.find(event => event.id === latest.evId), latest.kind) : null };
}

// Presentation only. Replaying reads the saved assignment; it never runs a draw.
export function buildEventReveal(state, ev, kind) {
  if (!ev) return null;
  const draw = state.draws?.[ev.id], stage = state.stages?.[ev.id];
  const source = kind || coalescePendingReveals(
    draw ? { [ev.id]:draw } : {}, stage ? { [ev.id]:stage } : {}, [], ev.id,
  ).latest?.kind;
  if (source === "stage" && stage) return {
    id:stage.id, evId:ev.id, title:stage.kind === "heats" ? "The heats" : "The pools", subtitle:ev.name,
    groups:stage.groups.map(group => ({ title:group.name, lines:group.entrants.map(key => {
      const entrant = stageEntrantView(state, stage, key);
      return { avatars:[...entrant.players], text:entrant.name };
    }) })), versus:null, crew:stage.roles || (stage.drawId && draw?.id === stage.drawId ? draw.roles : null) || [],
  };
  if (source !== "draw" || !draw) return null;
  const bracket = state.brackets?.[ev.id];
  let groups = null;
  if (draw.teams.length !== 2 && bracket) {
    const names = ROUND_NAMES[bracket.size] || [], seated = new Set();
    const line = index => ({ avatars:[...draw.teams[index].players], text:teamLabel(state, draw.teams[index]) });
    groups = [];
    bracket.rounds[0].forEach((match, index) => {
      const a = resolveSlot(bracket, match.a), b = resolveSlot(bracket, match.b);
      if (a === null || b === null) return;
      seated.add(a); seated.add(b);
      /* numbered matches read singular: "Semifinal 1", like the contest labels */
      groups.push({ title:bracketMatchName(bracket, 0, index),
        vs:true, lines:[line(a), line(b)] });
    });
    const byes = draw.teams.map((_, index) => index).filter(index => !seated.has(index));
    /* `bye`: each team that skips round one is drawn as its own tile */
    if (byes.length) groups.push({ title:names[1] ? `Straight to the ${names[1].toLowerCase()}` : "Bye",
      bye:true, lines:byes.map(line) });
  } else if (draw.teams.length !== 2) {
    groups = draw.teams.map(team => ({ title:teamLabel(state, team),
      lines:team.players.map(player => ({ avatars:[player], text:disp(state, player) })) }));
  }
  return { id:draw.id, evId:ev.id, title:"The draw", subtitle:ev.name, groups,
    versus:draw.teams.length === 2 ? draw.teams : null, crew:draw.roles || [] };
}

export function drawRevealGroups(state, reveal) {
  return reveal.versus ? reveal.versus.map((team, index) => ({
    title:team.name || `Team ${index + 1}`,
    lines:[{ avatars:team.players, text:team.players.map(player => disp(state, player)).join(" & ") }],
  })) : reveal.groups || [];
}

/* ── one timeline for the room ──
   The write that announces an event stamps eventOps[ev].announcedAt with the
   server's time; the draw carries its own time (draw.ts / drawRevealedAt).
   Every phone and the TV read those stamps against serverNow(), so the intro
   hands over and each card turns at the same instant on every screen, and a
   screen that opens late joins at the current step. States from before the
   stamp keep the old per-device clock. DRAW_INTRO_MS is the game intro's
   own length (intro/introTiming.js INTRO_MS), as is the TV's event-intro
   overlay (TV_INTRO_OVERLAY_MS), so a directed intro and the phones hand
   over together too. */
export const DRAW_INTRO_MS = INTRO_MS;
export const DRAW_INTRO_REDUCED_MS = INTRO_REDUCED_MS;
export const DRAW_FIRST_STEP_MS = 480;
/* Each card holds the room about two seconds (Backglass takeover grammar):
   the card turns, its first faces deal in, and the last partner of each
   pair or team lands after a held beat (DRAW_PARTNER_BEAT_MS), so the room
   says the name before it shows. A big field compresses toward
   DRAW_SEQUENCE_CAP_MS, never under DRAW_STEP_MIN_MS a card. Phones and the
   TV read these same numbers. */
export const DRAW_STEP_MS = 2000;
export const DRAW_STEP_MIN_MS = 1300;
export const DRAW_SEQUENCE_CAP_MS = 16000;
export const DRAW_PARTNER_BEAT_MS = 900;
export const drawStepGap = total => total <= 1 ? DRAW_STEP_MS
  : Math.max(DRAW_STEP_MIN_MS, Math.min(DRAW_STEP_MS, DRAW_SEQUENCE_CAP_MS / (total - 1)));
/* ms after the reveal starts that step `index` (0-based) turns */
export const drawStepDelay = (index, total) => DRAW_FIRST_STEP_MS + index * drawStepGap(total);
/* the held beat inside a card: the last face of a line of two or more lands
   this long after its card turns (0 for everyone else) */
export const partnerDelay = (faceIndex, faces) => faces > 1 && faceIndex === faces - 1 ? DRAW_PARTNER_BEAT_MS : 0;
/* which face of each line of a draw card holds that beat (-1 for none).
   A matchup card (`vs`) holds each side's own last partner, so both pairs
   or teams land alike; a card that is one team or heat listed one player a
   line holds its last face; byes hold nothing. The phone sheet, the TV and
   the room's sound all read this, never a card-wide count of their own. */
export function partnerFaces(group) {
  const lines = group?.lines || [];
  const count = line => (line.avatars || []).length;
  if (group?.bye) return lines.map(() => -1);
  if (group?.vs) return lines.map(line => partnerDelay(count(line) - 1, count(line)) ? count(line) - 1 : -1);
  const faces = lines.reduce((n, line) => n + Math.max(1, count(line)), 0);
  return lines.map((line, j) => faces > 1 && j === lines.length - 1 && count(line) ? count(line) - 1 : -1);
}
/* how many steps are showing `elapsed` ms after the reveal started */
export function drawStepAt(elapsed, total) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const t = Number(elapsed);
  if (!count || !Number.isFinite(t)) return 0;
  let shown = 0;
  while (shown < count && drawStepDelay(shown, count) <= t) shown++;
  return shown;
}
export const drawSequenceMs = total => total > 0 ? drawStepDelay(total - 1, total) : 0;

const saved = (state, reveal) => {
  const draw = state?.draws?.[reveal?.evId], stage = state?.stages?.[reveal?.evId];
  return draw?.id === reveal?.id ? draw : stage?.id === reveal?.id ? stage : null;
};
/* The server anchors for one event's ceremony, or null for a state from
   before the stamp (the device then times itself).
     introAt   the announcement write
     handoffAt the intro steps aside for the draw
     revealAt  the draw's first step starts counting (a draw made after the
               intro was over starts at its own write) */
export function revealTimeline(state, evId, { reveal = null, reducedMotion = false } = {}) {
  const announcedAt = Number(state?.eventOps?.[evId]?.announcedAt) || 0;
  if (!announcedAt) return null;
  const handoffAt = announcedAt + (reducedMotion ? DRAW_INTRO_REDUCED_MS : DRAW_INTRO_MS);
  const item = reveal ? saved(state, reveal) : null;
  const drewAt = item ? revealTime(state, evId, item) : 0;
  return { introAt:announcedAt, handoffAt, revealAt:Math.max(handoffAt, drewAt || 0) };
}
/* How long the intro still owns the screen before a queued draw takes over.
   Anchored: until the shared handoff (never longer than one intro, in case
   the clock estimate is still settling). Legacy: from this device's own
   intro start. */
export function introRemainingMs(state, evId, { now, localStart = 0, localNow = Date.now(), reducedMotion = false } = {}) {
  const hold = reducedMotion ? DRAW_INTRO_REDUCED_MS : DRAW_INTRO_MS;
  const line = revealTimeline(state, evId, { reducedMotion });
  if (line && Number.isFinite(now)) return Math.min(hold, Math.max(0, line.handoffAt - now));
  return Math.max(0, hold - (localNow - localStart));
}

// A bounded reveal clock shared by the component and its deterministic tests.
// Cancelled callbacks are inert even if the browser had already queued them.
// With `startAt` (a server time) and `now` (the server clock) it joins the
// room's timeline: steps already due show at once, the rest turn when the
// room turns them. Without them the reveal starts now on this device.
export function startDrawPlayback({ total, reducedMotion = false, onStep, schedule = setTimeout, cancel = clearTimeout,
  startAt = null, now = null }) {
  let active = true;
  const timers = [];
  const stop = () => { active = false; timers.forEach(cancel); };
  const skip = () => { stop(); onStep(total); };
  const anchored = Number.isFinite(startAt) && typeof now === "function";
  const elapsed = anchored ? now() - startAt : 0;
  const joined = reducedMotion || total === 0 ? total : drawStepAt(elapsed, total);
  if (joined >= total) onStep(total);
  else {
    onStep(joined);
    for (let index = joined; index < total; index++) {
      const delay = Math.max(0, drawStepDelay(index, total) - elapsed);
      timers.push(schedule(() => { if (active) onStep(index + 1); }, delay));
    }
  }
  return { stop, skip, joined };
}
