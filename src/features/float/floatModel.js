/* What a phone and the commissioner's desk read of Float (shared/float.js
   is the bridge). Pure. */
import { rosterOf } from "../../../shared/core.js";
import { floatCup, floatLive, floatOn, floatRider, hasFloatLook } from "../../../shared/float.js";

/* After the room posts its result the controller stays up this long, for
   the podium and the feedback card, unless the rider closes it first */
export const FLOAT_LINGER_MS = 120 * 1000;

/* A rider's view of the Cup: null for anyone not riding it (away, not here
   when it started, a commissioner who is not playing). `on`: racing and
   taken by the room, so the controller opens by itself. */
export function floatPhoneView(state, me) {
  const cup = floatCup(state);
  if (!cup || !me || !(cup.players || []).includes(me)) return null;
  return { cupId:cup.cupId, room:cup.room, live:floatLive(state), on:floatOn(state), failed:!!cup.error,
    finishedAt:Number(cup.finishedAt) || null, rider:floatRider(state, me) };
}

/* whether an open controller stays: while the Cup races, then for its linger */
export const floatSheetHolds = (view, now) => !!view
  && (view.live || (!!view.finishedAt && now - view.finishedAt < FLOAT_LINGER_MS));

/* the desk's line on the Cup now */
export function floatDeskStatus(state) {
  const cup = floatCup(state);
  if (!cup) return { lamp:"missing", text:"Not started" };
  if (cup.error) return { lamp:"partial", text:`Didn't start: ${cup.error.text}`, cup };
  if (cup.finishedAt || state.results?.[cup.evId]) return { lamp:"ready", text:"Finished", cup };
  return { lamp:"live", text:`Playing, ${cup.players.length} rider${cup.players.length === 1 ? "" : "s"}${cup.solo ? " and the bots" : ""}`, cup };
}

/* how many of everyone coming have picked their look */
export const floatLooksPicked = state => rosterOf(state).filter(player => hasFloatLook(state.profiles?.[player])).length;

/* the feedback's summary: cards, average fun, how many would play again */
export function floatFeedbackSummary(cards = []) {
  const list = Array.isArray(cards) ? cards : [];
  const rated = list.filter(card => Number.isInteger(card?.fun));
  const asked = list.filter(card => typeof card?.again === "boolean");
  return {
    count:list.length,
    fun:rated.length ? Math.round(rated.reduce((sum, card) => sum + card.fun, 0) / rated.length * 10) / 10 : null,
    again:asked.filter(card => card.again).length,
    asked:asked.length,
  };
}
