/* Attract mode (Oct 11): the TV's downtime plays an idle vignette (the
   bits' shape "idle": nap, armwrestle, saguaro, pushups, sweep, map) on its
   own ambient turn, cast from the players in the room. Pure: which turn is
   an attract turn, which vignette it plays and who is in it, all from the
   turn's start on the server clock, so every TV in the house plays the same
   vignette with the same chips on the same frame.

     the turn    one per gap rotation, right after the records turn (else
                 before the closing photos turn, else last), only while
                 someone is present; the caller adds it only in a real gap
                 (tvPhotoGap, the rule photos and records use)
     the room    rosterOf minus Away and on the way (presentPlayers): never
                 a Not coming, Away or on-the-way chip
     the pick    round after round, each round the whole idle pool in an
                 order picked by the registry's pickBit, never the same
                 vignette twice in a row (a round's first is never the last
                 round's last); a vignette that needs more chips than the
                 room has gives way to one that fits, never the one before
                 or after it
     the cast    the room in an order seeded by the turn's start, the first
                 one or two (the vignette's cast.a.max)
     the clock   the vignette starts on its turn's first instant and plays
                 once (its own 6 to 10 s); the board takes the rest of the
                 turn. A TV hands its layer the start ATTRACT_EARLY_MS ahead,
                 so its one-second tick never lands it late.

   A rotation that changes length (a card joins or leaves the gap) counts
   its attract turns afresh, as the records turns do: the no-repeat rule
   holds within one rotation. */

import { presentPlayers } from "../../../shared/core.js";
import { bitsOf, pickBit, seedHash } from "../gags/bits/registry.js";
import { TV_AMBIENT_TURN_MS } from "./tvModel.js";

export const ATTRACT = "attract";
/* how far ahead of its start a TV mounts the vignette (its clock ticks once a second) */
export const ATTRACT_EARLY_MS = 1500;
/* a TV that drew the vignette more than this after its start joined late: silent */
export const ATTRACT_JOIN_MS = 400;

const IDLE = bitsOf("idle");
/* the chips a vignette takes from the room */
export const attractNeeds = bit => Math.max(1, Number(bit?.cast?.a?.max) || 1);
const fits = (bit, size) => !!bit && attractNeeds(bit) <= size;

/* the room: who is here right now, in roster order */
export const attractRoom = state => state ? presentPlayers(state) : [];

/* The rotation with its attract turn: after the records turn when there is
   one, else before the photos turn that closes it, else last. None when
   nobody is in the room. */
export function withAttractTurns(cards, roomSize) {
  if (!roomSize || !IDLE.length) return cards;
  const out = [...cards];
  const records = out.lastIndexOf("records");
  const at = records >= 0 ? records + 1 : out[out.length - 1] === "photos" ? out.length - 1 : out.length;
  out.splice(at, 0, ATTRACT);
  return out;
}

/* which attract turn an absolute turn number is (the k-th since the start
   of the server clock), or null when that turn is another card's */
export function attractSlot(ambient, turn) {
  const list = ambient || [];
  const slots = [];
  list.forEach((card, index) => { if (card === ATTRACT) slots.push(index); });
  if (!slots.length || !Number.isFinite(turn) || turn < 0) return null;
  const at = slots.indexOf(turn % list.length);
  return at < 0 ? null : Math.floor(turn / list.length) * slots.length + at;
}
export const attractTurn = (ambient, now, period = TV_AMBIENT_TURN_MS) =>
  attractSlot(ambient, Math.floor(Math.max(0, Number(now) || 0) / period));

/* round r: the whole pool, each place picked from what the round has not played */
function roundOrder(round) {
  const order = [];
  for (let i = 0; i < IDLE.length; i++) order.push(pickBit("idle", `attract:${round}:${i}`, order).id);
  return order;
}
/* the k-th vignette of the whole pool, never the (k-1)-th again */
export function idleAt(k) {
  const n = IDLE.length;
  if (!n || !Number.isFinite(k) || k < 0) return null;
  if (n <= 2) return IDLE[k % n];
  const round = Math.floor(k / n), place = k % n;
  const order = roundOrder(round);
  /* a round never opens on the vignette the last one closed on (its last
     place is never moved, so the check needs no earlier round) */
  if (round > 0 && place <= 1 && order[0] === roundOrder(round - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return IDLE.find(bit => bit.id === order[place]);
}

/* The vignette the k-th attract turn plays for a room of `size`: the pool's
   own, or, when that one needs more chips than the room has, one that fits,
   never the vignette before it or after it. */
export function attractVignette(k, size, depth = 0) {
  if (!size || !Number.isFinite(k) || k < 0) return null;
  const own = idleAt(k);
  if (fits(own, size)) return own;
  const before = k > 0 && depth < IDLE.length * 2 ? attractVignette(k - 1, size, depth + 1) : null;
  const after = idleAt(k + 1);
  const ok = IDLE.filter(bit => fits(bit, size));
  const pool = [ok.filter(bit => bit.id !== before?.id && !(fits(after, size) && bit.id === after.id)),
    ok.filter(bit => bit.id !== before?.id), ok].find(list => list.length);
  return pool ? pool[seedHash(`attract:fit:${k}`) % pool.length] : null;
}

/* who plays: the room in an order seeded by the turn's start, the first
   the vignette takes */
export function attractCast(bit, room, start) {
  const list = [...new Set(room || [])];
  const order = list.map((player, i) => ({ player, i, h:seedHash(`attract:cast:${Math.round(Number(start) || 0)}:${player}`) }))
    .sort((a, b) => a.h - b.h || a.i - b.i).map(item => item.player);
  return order.slice(0, attractNeeds(bit));
}

/* The vignette on (or about to be on) the TV at `now`: the attract turn
   under way until its vignette ends, or the next turn's from `early` ms
   before it starts. { key, k, id, bit, cast, start, end } or null. */
export function attractAt({ ambient, now, room = [], early = 0, period = TV_AMBIENT_TURN_MS } = {}) {
  const t = Math.max(0, Number(now) || 0);
  const turn = Math.floor(t / period);
  for (const at of [turn, turn + 1]) {
    const start = at * period;
    if (at > turn && t + Math.max(0, Number(early) || 0) < start) break;
    const k = attractSlot(ambient, at);
    if (k === null) continue;
    const bit = attractVignette(k, (room || []).length);
    if (!bit || t >= start + bit.ms) continue;
    return { key:`attract:${start}`, k, id:bit.id, bit, cast:{ a:attractCast(bit, room, start) }, start, end:start + bit.ms };
  }
  return null;
}

/* a TV that drew the vignette within ATTRACT_JOIN_MS of its start saw it
   begin and plays its foley; a late or reloaded TV joins silent */
export const attractHeard = joinedMs => typeof joinedMs === "number" && Number.isFinite(joinedMs) && joinedMs >= 0
  && joinedMs <= ATTRACT_JOIN_MS;
