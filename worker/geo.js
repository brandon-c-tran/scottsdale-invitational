/* Where and When's writes (shared/geo.js is the model). The commissioner
   authors rounds before the weekend and runs the game during the event:
   start, reveal each photo, next, then finish, which posts the event's
   result through the ordinary result write. Players only guess.

   Built by actions.js with its own helpers, so a finish runs the same
   beginResultEntry and saveResult every other result does. */
import { ROSTER, allEventsOf, isActivePlayer, isAway, resolveEventLifecycle } from "../shared/core.js";
import {
  GEO_CAPTION_MAX, GEO_GRACE_MS, GEO_MAX_ROUNDS, GEO_PLACE_MAX, GEO_ROUND_MS, cleanPoint, cleanWhen,
  geoCurrentId, geoLastRound, geoPhotoId, geoPlayers, geoResultSlots, geoRoundId, geoStandings,
} from "../shared/geo.js";

const clip = (value, max) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export const GEO_ACTION_TYPES = Object.freeze([
  "geoSaveRound", "geoDeleteRound", "geoMoveRound", "geoStart", "geoGuess", "geoReveal", "geoNext", "geoFinish",
  "geoRestart",
]);

export function geoPlayersOf(state) {
  return geoPlayers(state, ROSTER, { isActivePlayer, isAway });
}

export function geoActions({ ok, err, gmOnly, run }) {
  const gameEvent = (state, evId) => {
    const ev = allEventsOf(state).find(item => item.id === evId);
    return ev?.game === "where" ? ev : null;
  };
  const started = state => !!state.geo?.order;
  return {
    /* add or replace one round; a round already shown cannot change */
    geoSaveRound(state, { id, photo, lat, lng, place, when, caption }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!geoRoundId(id)) return err("Bad round");
      const rounds = Array.isArray(state.geoRounds) ? state.geoRounds : [];
      const existing = rounds.find(round => round.id === id);
      if (started(state) && state.geo.order.slice(0, state.geo.index + 1).includes(id))
        return err("That photo has been played");
      if (!existing && rounds.length >= GEO_MAX_ROUNDS) return err(`Up to ${GEO_MAX_ROUNDS} photos`);
      if (!photo || !geoPhotoId(photo.id) || !(Number(photo.w) > 0) || !(Number(photo.h) > 0)) return err("Add the photo");
      const point = cleanPoint(lat, lng);
      if (!point) return err("Drop the answer pin");
      const wall = cleanWhen(when);
      if (!wall) return err("Set the date and hour");
      const name = clip(place, GEO_PLACE_MAX);
      if (!name) return err("Name the place");
      const round = { id, photo:{ id:photo.id, w:Math.round(photo.w), h:Math.round(photo.h) }, ...point, place:name,
        when:wall, ...(clip(caption, GEO_CAPTION_MAX) ? { caption:clip(caption, GEO_CAPTION_MAX) } : {}) };
      if (existing && JSON.stringify(existing) === JSON.stringify(round)) return ok({ unchanged:true });
      state.geoRounds = existing ? rounds.map(item => item.id === id ? round : item) : [...rounds, round];
      return ok({ round:round.id });
    },
    geoDeleteRound(state, { id }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const rounds = Array.isArray(state.geoRounds) ? state.geoRounds : [];
      if (!rounds.some(round => round.id === id)) return ok({ unchanged:true });
      if (started(state)) return err("Restart the game before removing photos");
      state.geoRounds = rounds.filter(round => round.id !== id);
      return ok();
    },
    geoMoveRound(state, { id, by }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (started(state)) return err("The game has started");
      const rounds = [...(state.geoRounds || [])];
      const from = rounds.findIndex(round => round.id === id);
      const to = from + (by === -1 ? -1 : 1);
      if (from < 0 || to < 0 || to >= rounds.length) return ok({ unchanged:true });
      [rounds[from], rounds[to]] = [rounds[to], rounds[from]];
      state.geoRounds = rounds;
      return ok();
    },
    /* the first photo goes up, once the event is under way */
    geoStart(state, { evId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const ev = gameEvent(state, evId);
      if (!ev) return err("No such game");
      if (state.geo?.eventId === evId && started(state)) return ok({ unchanged:true });
      if (state.results?.[evId]) return err("The result is already posted");
      if (resolveEventLifecycle(state, ev).phase !== "in-progress") return err(`Lock and start ${ev.name} first`);
      const rounds = state.geoRounds || [];
      if (!rounds.length) return err("Add photos in the Where and When desk first");
      const now = Date.now();
      state.geo = { eventId:evId, order:rounds.map(round => round.id), index:0, phase:"guess", startedAt:now,
        closesAt:now + GEO_ROUND_MS, author:ctx.player || null, guesses:{} };
      return ok();
    },
    /* A player's pin and time for the current photo. The phone saves the
       draft as it changes, so whatever is set when time runs out is the
       guess: a pin alone, a date and hour alone, or both. `done` is Lock
       in, and stays once given. Changeable until the reveal. */
    geoGuess(state, { roundId, lat, lng, when, done }, ctx) {
      const geo = state.geo;
      if (!started(state) || geo.phase !== "guess" || geoCurrentId(geo) !== roundId) return err("That photo is closed");
      if (!ctx.player) return err("Check in first");
      if (!geoPlayersOf(state).includes(ctx.player)) return err("You are not playing this one");
      if (Date.now() > Number(geo.closesAt) + GEO_GRACE_MS) return err("Time is up");
      const hasPoint = lat !== null && lat !== undefined && lng !== null && lng !== undefined;
      const point = hasPoint ? cleanPoint(lat, lng) : null;
      if (hasPoint && !point) return err("Drop your pin");
      const hasWhen = when !== null && when !== undefined && when !== "";
      const wall = hasWhen ? cleanWhen(when) : null;
      if (hasWhen && !wall) return err("Pick the date and hour");
      if (!point && !wall) return err("Drop your pin or set the date");
      const prior = geo.guesses?.[roundId]?.[ctx.player];
      const next = { ...(point || {}), ...(wall ? { when:wall } : {}), ...(done === true || prior?.done ? { done:true } : {}) };
      if (prior && prior.lat === next.lat && prior.lng === next.lng && prior.when === next.when && !!prior.done === !!next.done)
        return ok({ unchanged:true });
      geo.guesses = { ...(geo.guesses || {}), [roundId]:{ ...(geo.guesses?.[roundId] || {}),
        [ctx.player]:{ ...next, at:Date.now() } } };
      return ok();
    },
    geoReveal(state, { roundId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const geo = state.geo;
      if (!started(state) || geoCurrentId(geo) !== roundId) return err("That photo is not up");
      if (geo.phase !== "guess") return ok({ unchanged:true });
      geo.phase = "reveal";
      geo.revealedAt = Date.now();
      return ok();
    },
    geoNext(state, { roundId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const geo = state.geo;
      if (!started(state)) return err("The game has not started");
      /* a retried tap after the room moved on */
      if (geoCurrentId(geo) !== roundId) return ok({ unchanged:true });
      if (geo.phase === "guess") return err("Reveal this photo first");
      if (geoLastRound(geo)) { geo.phase = "done"; return ok(); }
      const now = Date.now();
      geo.index += 1;
      geo.phase = "guess";
      geo.startedAt = now;
      geo.closesAt = now + GEO_ROUND_MS;
      delete geo.revealedAt;
      return ok();
    },
    /* the final standings post the event's result: 1st, 2nd and 3rd */
    geoFinish(state, { evId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const ev = gameEvent(state, evId);
      if (!ev || state.geo?.eventId !== evId) return err("No game to finish");
      const geo = state.geo;
      if (!(geo.phase === "done" || (geo.phase === "reveal" && geoLastRound(geo)))) return err("Reveal the last photo first");
      const slots = geoResultSlots(geoStandings(geo, state.geoRounds, geoPlayersOf(state)));
      if (!slots) return err("Nobody guessed");
      if (resolveEventLifecycle(state, ev).phase === "in-progress") {
        const entered = run("beginResultEntry", state, { evId }, ctx);
        if (!entered.ok) return entered;
      }
      const posted = run("saveResult", state, { evId, slots }, ctx);
      if (!posted.ok) return posted;
      geo.phase = "done";
      geo.finishedAt = Date.now();
      return ok({ slots, ...(posted.extra || {}) });
    },
    /* start over: every guess goes, the photos stay */
    geoRestart(state, { evId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!started(state) || state.geo.eventId !== evId) return ok({ unchanged:true });
      if (state.results?.[evId]) return err("Clear the result first");
      state.geo = null;
      return ok();
    },
  };
}
