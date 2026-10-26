/* Float's writes (shared/float.js is the model, float/PROTOCOL.md the
   contract). Lock and start opens the Cup in the same write (floatStart,
   only with the float capability: the FLOAT binding); the Tournament then
   posts it to the room, server to server. The room runs the race and posts
   the result back to the Tournament once, which applies it here
   (floatFinish) through the ordinary result writes, so payouts, bets, the
   winner scene and the win song follow as for any result. A rider's look
   is their profile's (floatLook).

   Built by actions.js with its own helpers, like Trivia's. floatFinish and
   floatCupFailed are the Tournament's own (ctx.internal "float"): no socket
   or HTTP request from a phone ever carries that context. */
import { ALL_PLAYERS, allEventsOf, awardTable, isActivePlayer, resolveEventLifecycle } from "../shared/core.js";
import {
  FLOAT_START_LEAD_MS, cleanFloatLook, floatCup, floatPlayersAt, floatRoom, floatSlots, isFloatEvent,
} from "../shared/float.js";
import { cleanFreeText } from "../shared/freeText.js";

export const FLOAT_ACTION_TYPES = Object.freeze(["floatStart", "floatLook", "floatFinish", "floatCupFailed"]);
/* the Tournament's own context for the room's writes */
export const FLOAT_INTERNAL = "float";
const internal = ctx => ctx?.internal === FLOAT_INTERNAL && ctx?.isGm === true;
/* what the commissioner reads when the room never took a Cup */
const ERROR_MAX = 80;

export function floatActions({ ok, err, gmOnly, run }) {
  const gameEvent = (state, evId) => {
    const ev = allEventsOf(state).find(item => item.id === evId);
    return isFloatEvent(ev) ? ev : null;
  };
  return {
    /* The Cup: everyone here rides (QA's solo, the commissioner's own
       player and the room's bots). Lock and start makes this write; the
       pill offers it again when the room never took the Cup (a new cupId:
       the room starts fresh, and the old one's result is stale). */
    floatStart(state, { evId, restart = false } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!ctx.float) return err("Float is unavailable");
      const ev = gameEvent(state, evId);
      if (!ev) return err("That game isn't on the schedule");
      if (state.results?.[evId]) return err("The result is already posted");
      if (state.shelved?.[evId]) return err("That event is shelved");
      const cup = floatCup(state);
      if (cup?.evId === evId && !cup.finishedAt && !cup.error && restart !== true) return ok({ unchanged:true, cupId:cup.cupId });
      if (!["in-progress", "result-entry"].includes(resolveEventLifecycle(state, ev).phase))
        return err(`Lock and start ${ev.name} first`);
      /* QA's solo game (worker/qa.js, never a client's payload) */
      const solo = Array.isArray(ctx.qaSolo) ? [...ctx.qaSolo] : null;
      const players = floatPlayersAt(state, solo);
      if (!players.length) return err("Nobody is here to ride");
      const now = Date.now();
      const cupId = `cup${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      state.float = { evId, room:floatRoom(evId), cupId, startedAt:now, startAt:now + FLOAT_START_LEAD_MS, players,
        ...(solo ? { solo:true } : {}) };
      return ok({ cupId });
    },

    /* a rider's look (critter, floatie, hat, shades, pose), made legal for
       them: the crown only for the groom. Their own, or the commissioner's. */
    floatLook(state, { player, look } = {}, ctx) {
      const who = player ?? ctx.player;
      if (!ALL_PLAYERS.includes(who)) return err("That player isn't on the roster");
      if (!isActivePlayer(who) && !ctx.isGm) return err("That player isn't on this weekend's roster");
      if (who !== ctx.player && !ctx.isGm) return err("Not your profile");
      if (!look || typeof look !== "object" || Array.isArray(look)) return err("Pick a look");
      const clean = cleanFloatLook(look, who);
      const profile = state.profiles[who] || {};
      if (profile.float && JSON.stringify(cleanFloatLook(profile.float, who)) === JSON.stringify(clean))
        return ok({ unchanged:true, look:clean });
      state.profiles[who] = { ...profile, float:clean };
      return ok({ look:clean });
    },

    /* The room's result (POST /internal/float/result), once a cup: 1st to
       3rd from `order`, real players only, through beginResultEntry and
       saveResult. A result already entered by hand stands (the cup is
       marked done, nothing posts); a cup that is not the board's is stale. */
    floatFinish(state, { evId, cupId, order } = {}, ctx) {
      if (!internal(ctx)) return err("Commissioner only");
      const cup = floatCup(state);
      if (!cup || cup.cupId !== cupId || cup.evId !== evId) return err("That cup is over");
      if (cup.finishedAt) return ok({ unchanged:true, posted:!!cup.posted });
      const ev = gameEvent(state, evId);
      if (!ev) return err("That game isn't on the schedule");
      if (state.shelved?.[evId]) return err("That event is shelved");
      const now = Date.now();
      if (state.results?.[evId]) {
        state.float = { ...cup, finishedAt:now, posted:false };
        return ok({ posted:false });
      }
      const slots = floatSlots(order, state, awardTable(ev).filter(pts => pts > 0).length || 3);
      if (!slots.length) return err("No rider on the roster finished");
      if (resolveEventLifecycle(state, ev).phase === "in-progress") {
        const entered = run("beginResultEntry", state, { evId }, ctx);
        if (!entered.ok) return entered;
      }
      const posted = run("saveResult", state, { evId, slots }, ctx);
      if (!posted.ok) return posted;
      state.float = { ...state.float, finishedAt:now, posted:true, order:slots.map(slot => slot[0]) };
      return ok({ posted:true, slots, ...(posted.extra || {}) });
    },

    /* the room never took the Cup: the pill says so and offers Start Float again */
    floatCupFailed(state, { cupId, error } = {}, ctx) {
      if (!internal(ctx)) return err("Commissioner only");
      const cup = floatCup(state);
      if (!cup || cup.cupId !== cupId || cup.finishedAt) return ok({ unchanged:true });
      const text = cleanFreeText(String(error || ""), ERROR_MAX) || "The room did not answer";
      if (cup.error?.text === text) return ok({ unchanged:true });
      state.float = { ...cup, error:{ at:Date.now(), text } };
      return ok();
    },
  };
}
