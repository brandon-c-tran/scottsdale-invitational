/* Karaoke in the room's voice (TV only, the room bus; docs/KARAOKE.md).
   Two kinds of cue, both on the server clock:

     state  a fresh frame's step (roomSound.js roomCues calls karaokeCues):
            the pick window opening (sting), each player locking in (S18,
            panned to their chip), the running order dealt (S3 a card,
            panned to its place in the queue), a singer up next (upNow as
            the lamp lights, stamp as the song stamps in), a vote landing
            once the song is over (S18, panned to the voter; a vote during
            the song is silent), a vote closed before its clock (S8), a
            Legendary vote (the kit's legendary chime, KARAOKE_PARTS), and
            the reveal (orderStamp a row from last place up, podium for the
            top three), never under the Legendary rain. A load, a reconnect
            or a correction sounds nothing (roomStep's fresh gate). Never
            S14: the posted result rings it.
     clock  the vote's last five seconds (typeTick) and its close (S8),
            laid once the song is over while the vote stands
            (useKaraokeRoomClock) and cancelled when it moves on; a TV that
            joins late hears only what is still ahead.

   Nothing sounds while a song plays: the video is the room's sound.
   Reduced motion plays one sound a step (the sting, one card, the stamp,
   1st's place). Pure apart from the hook. */
import { useEffect } from "react";
import { presentPlayers } from "../../../shared/core.js";
import { KARAOKE_LEGENDARY_MS, karaokeRevealSchedule, karaokeSinger, karaokeTurn, karaokeVoters, karaokeVotesOn } from "../../../shared/karaoke.js";
import { cueAt } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { KARAOKE_DEAL, KARAOKE_ROW_BEATS, KARAOKE_UP_BEATS, karaokeDealAt, karaokeDealSlots, karaokePan, karaokeRevealPan } from "./karaokeTv.js";

/* a close this far ahead of its clock is early (the room all voted, or
   the commissioner closed it): the clock's own S8 never rang */
const EARLY_CLOSE_MS = 500;
/* the sting lands after the lock's knock in the same write */
const PICK_STING_MS = 300;
const panOf = (list, player) => list.length > 1 && list.includes(player)
  ? karaokePan((list.indexOf(player) + 0.5) / list.length) : 0;

/* the game, reduced to what can sound */
export function karaokeRoomSnapshot(state) {
  const game = state?.karaoke;
  if (!game?.id || game.phase === "done" || state.results?.[game.eventId]) return null;
  const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
  const closed = {};
  let rainUntil = 0;
  for (const [player, item] of Object.entries(game.turns || {})) {
    if (!item?.closedAt) continue;
    closed[player] = { at:Number(item.closedAt), closeAt:Number(item.closeAt) || 0, legendary:!!item.legendary, skipped:!!item.skipped };
    if (item.legendary) rainUntil = Math.max(rainUntil, Number(item.closedAt) + KARAOKE_LEGENDARY_MS);
  }
  return {
    id:game.id, phase:game.phase, startedAt:Number(game.startedAt) || 0,
    room:presentPlayers(state), ready:Object.keys(game.ready || {}).filter(player => game.ready[player]).sort(),
    order:[...(game.order || [])], dealAt:karaokeDealAt(game),
    singer, up:turn && singer ? `${game.index}:${singer}:${Number(turn.upAt) || 0}` : null, upAt:Number(turn?.upAt) || 0,
    songAt:Number(turn?.songAt) || 0, endAt:Number(turn?.endAt) || 0,
    voters:singer ? karaokeVoters(state, singer) : [], voted:singer ? Object.keys(karaokeVotesOn(game, singer)).sort() : [],
    closed, rainUntil, revealAt:Number(game.revealAt) || 0,
    places:Array.isArray(game.ranking) ? game.ranking.map(row => ({ player:row.player, place:row.place })) : [],
  };
}

/* the cues one fresh step of the game owes the room */
export function karaokeCues(prev, next, { now = serverNow(), reduced = false } = {}) {
  const k = next?.karaoke, was = prev?.karaoke;
  if (!k) return [];
  const cues = [];
  const key = `karaoke:${k.id}`;
  const same = was?.id === k.id;
  /* the pick window opens on every phone */
  if (!same && k.phase === "pick") cues.push({ id:"sting", at:(k.startedAt || now) + PICK_STING_MS, key:`${key}:pick` });
  if (!same) return cues;
  /* a player locks in: a slap from their chip in the room */
  if (k.phase === "pick" && was.phase === "pick") {
    const before = new Set(was.ready);
    k.ready.filter(player => !before.has(player)).forEach((player, i) =>
      cues.push({ id:"S18", at:now + i * 90, pan:panOf(k.room, player), key:`${key}:ready:${player}` }));
  }
  /* the window closes: the order deals, a card a step */
  if (k.phase === "turns" && was.phase === "pick" && k.order.length && Number.isFinite(k.dealAt)) {
    const slots = karaokeDealSlots(k.order.length);
    if (reduced) cues.push({ id:"S3", at:k.dealAt + KARAOKE_DEAL.lead, key:`${key}:order` });
    else k.order.forEach((_, i) => cues.push({ id:"S3", at:k.dealAt + KARAOKE_DEAL.lead + i * KARAOKE_DEAL.step,
      pan:karaokePan(slots[i]?.x ?? 0.5), key:`${key}:order:${i}` }));
  }
  /* a singer up next: the lamp, then their song stamps in */
  if (k.phase === "turns" && k.up && k.up !== was.up) {
    if (!reduced) cues.push({ id:"upNow", at:k.upAt + KARAOKE_UP_BEATS.chip, key:`${key}:up:${k.up}` });
    cues.push({ id:"stamp", at:k.upAt + (reduced ? 0 : KARAOKE_UP_BEATS.song), key:`${key}:song:${k.up}` });
  }
  /* a vote lands once the song is over (never during it), panned to the voter */
  if (k.phase === "turns" && k.up === was.up && k.songAt && k.endAt && now >= k.endAt) {
    const before = new Set(was.voted);
    k.voted.filter(player => !before.has(player)).forEach((player, i) =>
      cues.push({ id:"S18", at:now + i * 90, pan:panOf(k.voters, player), key:`${key}:vote:${k.up}:${player}` }));
  }
  /* a vote closes: Legendary rains, or it closed before its clock */
  for (const [player, close] of Object.entries(k.closed)) {
    if (was.closed[player] || close.skipped) continue;
    if (close.legendary) cues.push({ id:"legendary", at:close.at, key:`${key}:legendary:${player}` });
    else if (close.closeAt && close.at < close.closeAt - EARLY_CLOSE_MS) cues.push({ id:"S8", at:close.at, key:`${key}:closed:${player}` });
  }
  /* the reveal: a row from last place up, the top three on the podium's
     stamp; a row that turns under the Legendary rain is silent */
  if (k.phase === "reveal" && was.phase !== "reveal" && k.revealAt && k.places.length) {
    const steps = karaokeRevealSchedule(k.places).steps;
    const quiet = at => at < (Number(k.rainUntil) || 0);
    const first = steps[steps.length - 1];
    if (reduced) {
      if (first && !quiet(k.revealAt + first.at)) cues.push({ id:"podium", at:k.revealAt + first.at, opts:{ place:1 }, key:`${key}:reveal` });
    } else steps.forEach(step => {
      const at = k.revealAt + step.at + KARAOKE_ROW_BEATS.stamp;
      if (quiet(at)) return;
      cues.push(step.place <= 3
        ? { id:"podium", at, opts:{ place:step.place }, key:`${key}:place:${step.place}` }
        : { id:"orderStamp", at, pan:karaokeRevealPan(step.place, k.places.length), opts:{ place:step.place }, key:`${key}:place:${step.place}` });
    });
  }
  return cues;
}

/* What the vote's clock owes the room from `now`: a tick each of the last
   five seconds and S8 as it closes, only once the song is over. */
export function karaokeClockCues(game, now) {
  const turn = karaokeTurn(game);
  if (game?.phase !== "turns" || !turn || turn.closedAt || turn.skipped || !Number.isFinite(turn.songAt)) return [];
  const closeAt = Number(turn.closeAt), endAt = Number(turn.endAt);
  if (!Number.isFinite(closeAt) || !Number.isFinite(endAt) || now < endAt) return [];
  const cues = [];
  const add = (id, at) => { if (at >= endAt && at > now - 200) cues.push({ id, at }); };
  for (let s = 5; s >= 1; s--) add("typeTick", closeAt - s * 1000);
  add("S8", closeAt);
  return cues;
}

/* TVKaraoke's clock cues: laid once the vote stands on this TV, cancelled
   when it moves on. The handle, not a key, keeps each one single (a key
   outlives a cancel). */
export function useKaraokeRoomClock(game, now, { fixed = false } = {}) {
  const turn = karaokeTurn(game);
  const stand = !fixed && game?.phase === "turns" && turn && !turn.closedAt && !turn.skipped && Number.isFinite(turn.songAt)
    && now >= Number(turn.endAt) ? `${game.id}:${game.index}:${turn.endAt}:${turn.closeAt}` : null;
  useEffect(() => {
    if (!stand) return undefined;
    const handles = karaokeClockCues(game, serverNow()).map(cue => cueAt(cue.id, cue.at, { pan:0 }));
    return () => handles.forEach(handle => handle?.cancel?.());
  }, [stand]); // eslint-disable-line react-hooks/exhaustive-deps
}
