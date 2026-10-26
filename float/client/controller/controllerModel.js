/* What the phone shows, from what the room says (float/PROTOCOL.md "The
   Cup", "Server to client"). Pure: the controller and the tests read the
   same answers.

   Where the contract leaves a shape open, this reads it tolerantly and
   names the reading here:
   - the swap window: `room.swapEndsAt` when the room sends it, else 15 s
     from the cut's `startAt`, else 5 s before its `endsAt`
   - an out rider's drink: DRANK on a `me` (if the room keeps sending `me`
     to the beach), their own `drink` event, a `drinkAt` on their last result
   - the balloon clock: `me.ball` (server ms when the next balloon is ready)
     when sent, else 12 s from the rider's last `balloon` event
   - the racers' order on the beach: `me.order` when sent, else the round's
     `field` (the grid, last round's order)
   - final places: `standings` (indexes or { i, place }), else the podium,
     else reverse elimination order */
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
export const indexes = list => (Array.isArray(list) ? list : []).map(indexOf).filter(i => i !== null);

export function ordinal(n) {
  const v = Math.abs(Math.trunc(Number(n)));
  if (!Number.isFinite(v) || v < 1) return "";
  const tens = v % 100, ones = v % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${v}${suffix}`;
}

/* this phone's entrant: its device in the room, its Field Day player, what
   the room told it at welcome, its own `me` */
export function findMe({ room, device, pid = null, welcome = null, me = null } = {}) {
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  let i = device ? entrants.findIndex(e => e && e.device === device) : -1;
  if (i >= 0) return i;
  if (pid) { i = entrants.findIndex(e => e && e.pid === pid); if (i >= 0) return i; }
  const said = num(welcome?.entrant);
  if (Number.isInteger(said) && said >= 0) return said;
  const own = num(me?.i);
  return Number.isInteger(own) && own >= 0 ? own : -1;
}

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
      return idx >= 0 ? side("cut") : side("watch");
    case "podium": return side("podium");
    case "feedback": return side("feedback");
    default: return side("watch");
  }
}

/* cut out by the round just raced (its results hold them) */
export function outThisRound(room, idx) {
  if (!indexes(room?.out).includes(idx)) return false;
  return (Array.isArray(room?.results) ? room.results : []).some(r => indexOf(r) === idx);
}

export function resultOf(room, idx) {
  return (Array.isArray(room?.results) ? room.results : []).find(r => indexOf(r) === idx) || null;
}

/* through or out right now, against the cut line; null when nobody goes out */
export function cutStatus(me) {
  const place = num(me?.place), of = num(me?.of), cut = num(me?.cut);
  if (!(place >= 1) || !(cut >= 1) || !(of >= 1) || cut >= of) return null;
  if (place <= cut) return { through:true, by:cut - place + 1, label:"Through" };
  return { through:false, by:place - cut, label:`Out by ${place - cut}` };
}

/* the race HUD from `me` */
export function raceView(me) {
  const f = Number(me?.f) | 0;
  const len = num(me?.len), prog = num(me?.prog);
  return {
    place:num(me?.place), of:num(me?.of),
    progress:len > 0 && prog !== null ? Math.max(0, Math.min(1, prog / len)) : 0,
    left:len > 0 && prog !== null ? Math.max(0, Math.round(len - prog)) : null,
    stamina:num(me?.stam) === null ? 1 : Math.max(0, Math.min(1, num(me.stam))),
    swim:has(f, FLAG.SWIM), arrived:has(f, FLAG.ARRIVED), drank:has(f, FLAG.DRANK),
    handsOff:has(f, FLAG.HANDS_OFF), bump:has(f, FLAG.BUMP), splashed:has(f, FLAG.SPLASHED),
    cut:cutStatus(me),
  };
}

/* does this rider owe a drink this round (the room's and the rider's switch) */
export function drinksOn(room, idx) {
  if (room?.drinking === false) return false;
  const entrant = Array.isArray(room?.entrants) ? room.entrants[idx] : null;
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

/* when the cut's floatie swap closes */
export function swapEndsAt(room) {
  if (!room) return null;
  const said = num(room.swapEndsAt);
  if (said !== null) return said;
  const s = num(room.s), startAt = num(room.startAt), endsAt = num(room.endsAt);
  if (startAt !== null && (s === null || startAt <= s + 1000)) return startAt + SWAP_MS;
  if (endsAt !== null) return endsAt - 5000;
  return s !== null ? s + SWAP_MS : null;
}

export function legName(course, leg) {
  const legs = Array.isArray(course?.legs) ? course.legs : [];
  return legs[leg]?.name || legs.find(l => Number(l?.i) === leg)?.name || "";
}

/* how many race this round and how many go through */
export function roundShape(room) {
  const field = indexes(room?.field);
  const of = field.length || (Array.isArray(room?.entrants) ? room.entrants.length : 0);
  const round = num(room?.round) ?? 0, rounds = num(room?.rounds) ?? 0;
  const final = rounds > 0 && round >= rounds - 1;
  return { round, rounds, of, final };
}

/* the grid slot this rider starts from (the field's order) */
export function gridSlot(room, idx) {
  const at = indexes(room?.field).indexOf(idx);
  return at >= 0 ? at + 1 : null;
}

/* This rider's place in the Cup once it is over. */
export function finalPlace(room, idx) {
  if (!room || idx < 0) return null;
  const standings = Array.isArray(room.standings) ? room.standings : null;
  if (standings) {
    for (let k = 0; k < standings.length; k++) {
      const entry = standings[k];
      if (entry === idx) return k + 1;
      if (entry && typeof entry === "object" && indexOf(entry) === idx) return num(entry.place) ?? k + 1;
    }
  }
  const podium = indexes(room.podium);
  if (podium.includes(idx)) return podium.indexOf(idx) + 1;
  const out = indexes(room.out);
  const at = out.indexOf(idx);
  if (at >= 0) return Math.max(podium.length, 3) + (out.length - at);
  return null;
}

/* An out rider has finished the drink of the round that put them out: DRANK
   on their last `me`, a drinkAt on that round's result, or a drink (theirs,
   seen or sent) in that round or since. memory: { drinkRounds, outRound }. */
export function beachDrank({ room, me = null, idx, memory = {} }) {
  if (!drinksOn(room, idx)) return true;
  if (has(me?.f, FLAG.DRANK)) return true;
  if (num(resultOf(room, idx)?.drinkAt) !== null) return true;
  const outRound = num(memory.outRound) ?? num(room?.round) ?? 0;
  return (memory.drinkRounds || []).some(r => r >= outRound);
}

/* The beach, for a rider who is out: owes a drink, or throws balloons.
   memory: { drinkRounds, outRound, lastThrowAt, splashes:{ [j]: s } } from
   the controller's events; now: server ms. */
export function beachState({ room, me = null, idx, memory = {}, now }) {
  const drank = beachDrank({ room, me, idx, memory });
  const readyAt = num(me?.ball) ?? (Number.isFinite(memory.lastThrowAt) ? memory.lastThrowAt + BALLOON_MS : null);
  const racing = room?.phase === "race";
  const ready = drank && racing && (readyAt === null || now >= readyAt);
  const order = indexes(me?.order).length ? indexes(me.order) : indexes(room?.field);
  const out = indexes(room?.out);
  const targets = order.filter(i => i !== idx && !out.includes(i)).map(i => {
    const hit = num(memory.splashes?.[i]);
    return { i, immune:hit !== null && now - hit < IMMUNE_MS };
  });
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
   during `round`: this rider's drinks and throws, and every splash (a racer
   hit is safe for IMMUNE_MS). */
export function foldEvent(memory, ev, idx, round) {
  if (!ev || ev.t !== "ev") return memory;
  const s = num(ev.s), i = num(ev.i), j = num(ev.j);
  if (ev.e === "drink" && i === idx) return withDrink(memory, round);
  if (ev.e === "balloon" && i === idx) return { ...memory, lastThrowAt:s };
  if (ev.e === "splash" && j !== null) return { ...memory, splashes:{ ...(memory.splashes || {}), [j]:s } };
  if (ev.e === "out" && i === idx && memory.outRound == null) return { ...memory, outRound:num(round) ?? 0 };
  return memory;
}
