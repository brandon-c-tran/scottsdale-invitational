/* What the phone shows, from what the room says (float/PROTOCOL.md "The
   Cup", "Server to client"). Pure: the controller and the tests read the
   same answers.

   The room (float/worker/room.js) sends more than the contract's table
   names; this reads those fields first and falls back to the contract:
   - the swap window: `room.swapUntil`, else `swapEndsAt`, else 15 s from
     the cut's `startAt`
   - how many go through: `room.cut`, else the `me` frame's `cut`
   - final places: `room.final` (indexes in order), else `standings`
     (indexes or { i, place }), else the podium, else reverse elimination
   - an out rider's drink: a `drinkAt` on their result in the round that put
     them out (`results`, or `history` once the next round has begun), their
     own `drink` event, or a beach drink this phone remembers (beachDrank)
   - the balloon clock: `me.ball` when sent, else 12 s from the rider's last
     `balloon` event
   - the racers' order on the beach: `me.order` when sent, else the live
     `results` (place order) during a race, else the round's `field` */
import { FLAG } from "../../shared/protocol.js";

export { FLAG };
export const BALLOON_MS = 12000;
export const IMMUNE_MS = 6000;
export const SWAP_MS = 15000;
export const COUNTDOWN_MS = 3000;

/* screens the phone draws sideways, for a rider in the field */
export const SIDEWAYS = Object.freeze(new Set(["intro", "grid", "countdown", "race", "cut"]));

export const has = (flags, bit) => (Number(flags) & bit) === bit;
const num = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const indexOf = value => Number.isInteger(value) ? value : value && typeof value === "object" && Number.isInteger(Number(value.i)) ? Number(value.i) : null;
export const indexes = items => (Array.isArray(items) ? items : []).map(indexOf).filter(i => i !== null);
const list = value => Array.isArray(value) ? value : [];

export function ordinal(n) {
  const v = Math.abs(Math.trunc(Number(n)));
  if (!Number.isFinite(v) || v < 1) return "";
  const tens = v % 100, ones = v % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${v}${suffix}`;
}

/* this phone's entrant: its device in the room's entrants (PROTOCOL "As
   built": indexes shift in the lobby, and a Field Day claim moves the
   entrant to the newest device). Only before the first room message does
   the welcome's index stand in. */
export function findMe({ room, device, welcome = null } = {}) {
  if (Array.isArray(room?.entrants)) return device ? room.entrants.findIndex(e => e && e.device === device) : -1;
  const said = num(welcome?.entrant);
  return Number.isInteger(said) && said >= 0 ? said : -1;
}

/* the Cup is over: the final has been raced (its cut, the podium, the card) */
export const cupDone = room => indexes(room?.final).length > 0 || indexes(room?.podium).length > 0;

/* the screen for this phone, and whether it is drawn sideways */
export function screenOf({ room, idx }) {
  const phase = room?.phase;
  if (!room || !phase) return { screen:"connecting", sideways:false };
  const out = indexes(room.out).includes(idx);
  const field = indexes(room.field);
  const racing = idx >= 0 && !out && (field.includes(idx) || !field.length);
  const side = screen => ({ screen, sideways:SIDEWAYS.has(screen) });
  switch (phase) {
    case "lobby": return side("lobby");
    case "intro": return idx >= 0 && !out ? side("intro") : side("watch");
    case "grid": case "countdown": case "race":
      return out ? side("beach") : racing ? side(phase) : side("watch");
    case "cut": case "results":
      if (out) return side(outThisRound(room, idx) ? "outcut" : "beach");
      return racing ? side("cut") : side("watch");
    case "podium": return side("podium");
    case "feedback": return side("feedback");
    default: return side("watch");
  }
}

/* cut out by the round just raced (its results hold them) */
export function outThisRound(room, idx) {
  if (!indexes(room?.out).includes(idx)) return false;
  return list(room?.results).some(r => indexOf(r) === idx);
}

export function resultOf(room, idx) {
  return list(room?.results).find(r => indexOf(r) === idx) || null;
}

/* the round a rider went out in, from the room's history */
export function outRoundOf(room, idx) {
  for (const item of list(room?.history)) if (indexes(item?.out).includes(idx)) return num(item.round);
  return null;
}

/* through or out right now, against the cut line; null when nobody goes out */
export function cutStatus(me, roomCut = null) {
  const place = num(me?.place), of = num(me?.of), cut = num(me?.cut) ?? num(roomCut);
  if (!(place >= 1) || !(cut >= 1) || !(of >= 1) || cut >= of) return null;
  if (place <= cut) return { through:true, by:cut - place + 1, label:"Through" };
  return { through:false, by:place - cut, label:`Out by ${place - cut}` };
}

/* the race HUD from `me` */
export function raceView(me, roomCut = null) {
  const f = Number(me?.f) | 0;
  const len = num(me?.len), prog = num(me?.prog);
  return {
    place:num(me?.place), of:num(me?.of),
    progress:len > 0 && prog !== null ? Math.max(0, Math.min(1, prog / len)) : 0,
    left:len > 0 && prog !== null ? Math.max(0, Math.round(len - prog)) : null,
    stamina:num(me?.stam) === null ? 1 : Math.max(0, Math.min(1, num(me.stam))),
    swim:has(f, FLAG.SWIM), arrived:has(f, FLAG.ARRIVED), drank:has(f, FLAG.DRANK),
    handsOff:has(f, FLAG.HANDS_OFF), bump:has(f, FLAG.BUMP), splashed:has(f, FLAG.SPLASHED),
    cut:cutStatus(me, roomCut),
  };
}

/* does this rider owe a drink this round (the room's and the rider's switch) */
export function drinksOn(room, idx) {
  if (room?.drinking === false) return false;
  const entrant = list(room?.entrants)[idx];
  return entrant?.drinks !== false;
}

/* The race's gun during a countdown: the first of startAt and endsAt more
   than half a second ahead of the room message, else endsAt, else three
   seconds on. During the race, its startAt. */
export function gunAt(room) {
  if (!room) return null;
  const s = num(room.s) ?? 0, startAt = num(room.startAt), endsAt = num(room.endsAt);
  if (room.phase === "race") return startAt ?? s;
  if (room.phase !== "countdown") return null;
  const ahead = [startAt, endsAt].filter(at => at !== null && at > s + 500);
  if (ahead.length) return Math.min(...ahead);
  return endsAt ?? (startAt ?? s) + COUNTDOWN_MS;
}

/* 3, 2, 1, then 0 ("Go") from the gun until the race begins; null without a gun */
export function countFor(gun, now) {
  if (!Number.isFinite(gun) || !Number.isFinite(now)) return null;
  const left = gun - now;
  return left > 0 ? Math.min(3, Math.ceil(left / 1000)) : 0;
}

/* The drink button: null (nothing owed), "locked" (before the gun: the room
   takes a drink only once the race is on), "idle", "sent" (waiting for the
   room), "done". */
export function drinkState({ owes, drank, sent, live }) {
  if (!owes) return null;
  if (drank) return "done";
  if (!live) return "locked";
  return sent ? "sent" : "idle";
}

/* when the cut's floatie swap closes, or null when there is none */
export function swapEndsAt(room) {
  if (!room || (room.phase !== "cut" && room.phase !== "results")) return null;
  if ("swapUntil" in room) return num(room.swapUntil);
  const said = num(room.swapEndsAt);
  if (said !== null) return said;
  if (cupDone(room)) return null;
  const s = num(room.s), startAt = num(room.startAt), endsAt = num(room.endsAt);
  if (startAt !== null && (s === null || startAt <= s + 1000)) return startAt + SWAP_MS;
  if (endsAt !== null) return endsAt - 5000;
  return s !== null ? s + SWAP_MS : null;
}

/* what the swap picker reads: open while the window is, the time left */
export function swapView(room, now) {
  const ends = swapEndsAt(room);
  const left = ends === null || !Number.isFinite(now) ? 0 : Math.max(0, ends - now);
  return { open:left > 0, left, ends };
}

export function legName(course, leg) {
  const legs = list(course?.legs);
  return legs[leg]?.name || legs.find(l => Number(l?.i) === leg)?.name || "";
}

/* how many race this round, how many go through, and whether it is the final */
export function roundShape(room) {
  const field = indexes(room?.field);
  const of = field.length || list(room?.entrants).length;
  const round = num(room?.round) ?? 0, rounds = num(room?.rounds) ?? 0;
  const final = rounds > 0 && round >= rounds - 1;
  const cut = num(room?.cut);
  return { round, rounds, of, final, through:final || cut === null || cut >= of ? null : cut };
}

/* the grid slot this rider starts from (the field's order) */
export function gridSlot(room, idx) {
  const at = indexes(room?.field).indexOf(idx);
  return at >= 0 ? at + 1 : null;
}

/* This rider's place in the Cup once it is over (or so far). */
export function finalPlace(room, idx) {
  if (!room || idx < 0) return null;
  const final = indexes(room.final);
  if (final.includes(idx)) return final.indexOf(idx) + 1;
  const standings = list(room.standings);
  for (let k = 0; k < standings.length; k++) {
    const entry = standings[k];
    if (entry === idx) return k + 1;
    if (entry && typeof entry === "object" && indexOf(entry) === idx) return num(entry.place) ?? k + 1;
  }
  const podium = indexes(room.podium);
  if (podium.includes(idx)) return podium.indexOf(idx) + 1;
  const out = indexes(room.out);
  const at = out.indexOf(idx);
  if (at >= 0) return Math.max(podium.length, 3) + (out.length - at);
  return null;
}

/* An out rider has finished the drink of the round that put them out: a
   drinkAt on that round's result (this round's results, or the history once
   the next round began), a drink in that round or since (DRANK on their
   `me`, their own `drink` event, or one sent: drinkRounds), or one this
   phone remembers across a reload (beachDrank).
   memory: { drinkRounds, outRound, beachDrank }. */
export function beachDrank({ room, idx, memory = {} }) {
  if (!drinksOn(room, idx)) return true;
  if (memory.beachDrank) return true;
  if (num(resultOf(room, idx)?.drinkAt) !== null && outThisRound(room, idx)) return true;
  const outRound = outRoundOf(room, idx) ?? num(memory.outRound) ?? num(room?.round) ?? 0;
  const past = list(room?.history).find(item => num(item?.round) === outRound);
  if (past && num(list(past.results).find(r => indexOf(r) === idx)?.drinkAt) !== null) return true;
  return (memory.drinkRounds || []).some(r => r >= outRound);
}

/* The racers an out rider can throw at, in race order: `me.order` when the
   room sends it, else the live results (place order) during a race, else
   the field. A racer in at the takeout cannot be hit. */
export function beachTargets({ room, me = null, idx, memory = {}, now }) {
  const out = indexes(room?.out);
  const field = indexes(room?.field);
  const racing = room?.phase === "race";
  const live = racing ? indexes(room?.results).filter(i => field.includes(i)) : [];
  const order = indexes(me?.order).length ? indexes(me.order)
    : live.length ? [...live, ...field.filter(i => !live.includes(i))] : field;
  const round = num(room?.round) ?? 0;
  const placed = new Set(racing ? list(room?.results).filter(r => num(r?.time) !== null).map(indexOf) : []);
  return order.filter(i => i !== idx && !out.includes(i)).map(i => {
    const hit = num(memory.splashes?.[i]);
    const arrived = placed.has(i) || (racing && memory.arrived?.[i] === round);
    const immuneLeft = !arrived && hit !== null && Number.isFinite(now) ? Math.max(0, IMMUNE_MS - (now - hit)) : 0;
    return { i, arrived, immune:immuneLeft > 0, immuneLeft };
  });
}

/* The beach, for a rider who is out: owes a drink, or throws balloons.
   memory: { drinkRounds, outRound, lastThrowAt, splashes:{ [j]: s },
   arrived:{ [i]: round }, beachDrank } from the controller's events;
   now: server ms. */
export function beachState({ room, me = null, idx, memory = {}, now }) {
  const drank = beachDrank({ room, idx, memory });
  const readyAt = num(me?.ball) ?? (Number.isFinite(memory.lastThrowAt) ? memory.lastThrowAt + BALLOON_MS : null);
  const racing = room?.phase === "race";
  const ready = drank && racing && (readyAt === null || now >= readyAt);
  const targets = beachTargets({ room, me, idx, memory, now });
  return { needsDrink:!drank, ready, readyAt, racing, targets,
    cooldown:readyAt !== null && now < readyAt ? Math.max(0, Math.min(1, (readyAt - now) / BALLOON_MS)) : 0 };
}

/* a drink in this round, remembered */
export const withDrink = (memory, round) => {
  const rounds = memory.drinkRounds || [];
  const r = num(round) ?? 0;
  return rounds.includes(r) ? memory : { ...memory, drinkRounds:[...rounds, r] };
};

/* The memory the beach and the drink button read, folded from an `ev`
   during `round`: this rider's drinks and throws, who has arrived, and
   every splash (a racer hit is safe for IMMUNE_MS). */
export function foldEvent(memory, ev, idx, round) {
  if (!ev || ev.t !== "ev") return memory;
  const s = num(ev.s), i = num(ev.i), j = num(ev.j);
  const r = num(round) ?? 0;
  if (ev.e === "drink" && i === idx) return withDrink(memory, round);
  if (ev.e === "balloon" && i === idx) return { ...memory, lastThrowAt:s, thrown:{ j, s } };
  if (ev.e === "splash") {
    const next = j !== null ? { ...memory, splashes:{ ...(memory.splashes || {}), [j]:s } } : { ...memory };
    if (i === idx) next.landed = { j, s };
    return next;
  }
  if (ev.e === "arrive" && i !== null) return { ...memory, arrived:{ ...(memory.arrived || {}), [i]:r } };
  if (ev.e === "out" && i === idx && memory.outRound == null) return { ...memory, outRound:r };
  return memory;
}
