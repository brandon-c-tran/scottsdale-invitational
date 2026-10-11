/* The highlight reel (Oct 10): the TV's downtime replays the weekend's
   moments, one bit a turn in a real gap (the same gap as the photos and
   the records, photoModel tvPhotoGap), newest first. Derived from the
   record every time (gagModel momentLog), so a correction that takes a
   moment away takes its replay with it, and never stored. Silent: a
   replay is downtime, not the room's moment.

   The turn is picked on the server clock, so every TV in the house shows
   the same replay: the first highlights turn of the gap replays the newest
   moment, the next the one before it, and round again. Pure. */

import { allEventsOf } from "../../../shared/core.js";
import { TV_AMBIENT_TURN_MS, TV_RESULT_MOMENT_MS, lastLifecycleWrite, latestResultOf } from "../tv/tvModel.js";
import { gagsOn, momentLog } from "./gagModel.js";

export const HIGHLIGHT_CARD = "highlights";

/* every moment the weekend has played, newest first, each with its event */
export function highlightReel(state, events = allEventsOf(state)) {
  if (!gagsOn(state)) return [];
  return momentLog(state, events).filter(step => step.moment).map(({ write, moment }) => ({
    id:`${write.key}:${moment.trigger}`, write:write.key, at:write.at, evId:write.ev.id, evName:write.ev.name,
    session:write.ev.session || null, ...moment,
  })).reverse();
}

/* When the gap the reel plays in began, from the state alone: once the
   newest moment's write, the last lifecycle write and the latest result's
   moment on the TV were all over. Its first highlights turn replays the
   newest moment. */
export function highlightSince(state, events = allEventsOf(state), reel = null) {
  const latest = latestResultOf(state, events);
  const posted = Number(latest?.res?.confirmedAt || latest?.res?.ts) || 0;
  return Math.max(Number(reel?.[0]?.at) || 0, lastLifecycleWrite(state), posted ? posted + TV_RESULT_MOMENT_MS : 0);
}

/* The ambient cards with the reel's turn in them: one, after the gap's
   own cards and the records turn. */
export const withHighlightTurns = (cards, count) => count ? [...cards, HIGHLIGHT_CARD] : cards;

/* how many highlights turns the rotation `ambient` holds in turns [0, n) */
function turnsBefore(slots, length, n) {
  const whole = Math.floor(n / length) * slots.length;
  const rest = n % length;
  return whole + slots.filter(slot => slot < rest).length;
}

/* The replay this turn shows, or null when the turn is not a highlights
   turn: counted from the turn `since` falls in (highlightSince; default
   the newest moment's write), so the first highlights turn after it
   replays the newest. { entry, turnAt, k }. */
export function highlightAt(reel, ambient, now, period = TV_AMBIENT_TURN_MS, since = reel?.[0]?.at) {
  if (!reel?.length || !ambient?.length) return null;
  const slots = [];
  ambient.forEach((card, index) => { if (card === HIGHLIGHT_CARD) slots.push(index); });
  if (!slots.length) return null;
  const turn = Math.floor(Math.max(0, Number(now) || 0) / period);
  if (!slots.includes(turn % ambient.length)) return null;
  const from = Math.min(turn, Math.floor(Math.max(0, Number(since) || 0) / period));
  const k = Math.max(0, turnsBefore(slots, ambient.length, turn + 1) - turnsBefore(slots, ambient.length, from) - 1);
  return { entry:reel[k % reel.length], turnAt:turn * period, k };
}
