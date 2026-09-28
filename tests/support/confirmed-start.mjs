/* The first game-opening write now has to confirm that it starts the weekend
   (payload.startWeekend). Suites written before that rule exercise the game
   itself, not the confirmation, so they dispatch through this wrapper, which
   confirms exactly as the commissioner's second tap does. The confirmation
   itself is covered in fix-commissioner-2. */
import { applyAction as apply } from "../../worker/actions.js";

const OPENING = new Set(["announceEvent", "announceAndDraw", "setOnDeck", "startEvent", "lockAndStart", "pokerStart"]);

export const confirmStart = (type, payload) => OPENING.has(type)
  && (payload === undefined || payload && typeof payload === "object" && !("startWeekend" in payload))
  ? { ...(payload || {}), startWeekend:true } : payload;

export const applyAction = (state, type, payload, ctx) => apply(state, type, confirmStart(type, payload), ctx);
