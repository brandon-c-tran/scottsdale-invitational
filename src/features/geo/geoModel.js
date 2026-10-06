/* Where and When on a phone or the TV, as data, from the frame that viewer
   was sent (shared/geo.js projectGeo). Pure; `now` is the server clock. */
import { rosterOf, isActivePlayer, isAbsent } from "../../../shared/core.js";
import { geoCurrentId, geoPlayers, geoStandings, scoreGuess } from "../../../shared/geo.js";

export const geoPhotoSrc = round => round?.photo?.id ? `/api/geo/photo/${encodeURIComponent(round.photo.id)}` : null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const hourLabel = h => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
/* "Jul 4, 2019, 9 PM" */
export function whenLabel(when) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(when || "");
  if (!match) return "";
  const [, y, m, d, h] = match.map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}, ${hourLabel(h)}`;
}
export function milesLabel(miles) {
  if (miles === null || miles === undefined) return "";
  if (miles < 1) return "Under a mile";
  return `${Math.round(miles).toLocaleString("en-US")} mi`;
}
/* how far off a time was, in the largest unit that reads */
export function offLabel(hours) {
  if (hours === null || hours === undefined) return "";
  if (hours < 1) return "Right hour";
  const unit = (n, word) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"} off`;
  if (hours < 48) return unit(Math.round(hours), "hour");
  const days = hours / 24;
  if (days < 60) return unit(Math.round(days), "day");
  if (days < 730) return unit(Math.round(days / 30.44), "month");
  return unit(Math.round(days / 365.25), "year");
}

/* the current round, what this viewer may do in it, and once revealed how
   everyone did; null when no game is running */
export function geoView(state, me = null, now = Date.now()) {
  const geo = state?.geo;
  if (!geo?.order?.length) return null;
  const rounds = state.geoRounds || [];
  const id = geoCurrentId(geo);
  const round = rounds.find(item => item.id === id) || null;
  const players = geoPlayers(state, rosterOf(state), { isActivePlayer:id => isActivePlayer(id, state), isAway:isAbsent });
  const total = Number(geo.total) || geo.order.length;
  const guesses = geo.guesses?.[id] || {};
  const lockedIn = Array.isArray(geo.lockedIn) ? geo.lockedIn
    : Object.entries(guesses).filter(([, guess]) => guess?.done).map(([name]) => name);
  const drafting = Array.isArray(geo.drafting) ? geo.drafting
    : Object.entries(guesses).filter(([, guess]) => !guess?.done).map(([name]) => name);
  const guessed = geo.guessed ?? lockedIn.length;
  const revealed = (geo.phase === "reveal" || geo.phase === "done") && round && Number.isFinite(round.lat);
  const results = revealed ? Object.entries(guesses)
    .map(([player, guess]) => ({ player, guess, ...scoreGuess(round, guess) }))
    .sort((a, b) => b.total - a.total) : [];
  const standings = geoStandings(geo, rounds, players);
  return {
    phase:geo.phase, index:geo.index, n:geo.index + 1, total, roundId:id, round,
    closesAt:Number(geo.closesAt) || 0, secondsLeft:Math.max(0, Math.ceil(((Number(geo.closesAt) || 0) - now) / 1000)),
    players, guessed, lockedIn, drafting, playing:!!me && players.includes(me), mine:me ? guesses[me] || null : null,
    revealed:!!revealed, results, mineScored:me ? results.find(row => row.player === me) || null : null,
    standings, last:geo.index >= total - 1, done:geo.phase === "done",
    /* the game is over once its result posts: nothing of it stays open on a
       phone (the sheet, Home's row); the state itself is kept for the record */
    finished:geo.phase === "done" && !!(geo.eventId && state.results?.[geo.eventId]),
  };
}
