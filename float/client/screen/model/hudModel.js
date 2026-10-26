/* What the HUD shows, derived from the room and the racers' rows. Pure. */
import { FLAG } from "../../../shared/protocol.js";
import { indexList, throughFor } from "./cupShape.js";

export const has = (f, bit) => (f & bit) !== 0;

/* place words for the podium and arrivals */
export const ordinal = n => {
  const k = n % 100;
  if (k >= 11 && k <= 13) return `${n}th`;
  return `${n}${({ 1:"st", 2:"nd", 3:"rd" })[n % 10] || "th"}`;
};

/* a result row is a place once its time is in (the room lists everyone, in order) */
export const isPlaced = row => Number.isInteger(row?.i) && (row.time === undefined || Number.isFinite(row.time));

/* the race order: placed riders by place, then those waiting at the takeout
   for their drink (by arrival), then everyone on the water by progress */
export function raceOrder({ field = [], rows, results = [], arrivals = [] }) {
  const placed = new Map();
  for (const row of results) if (isPlaced(row)) placed.set(row.i, row.place ?? placed.size + 1);
  const list = field.map(i => {
    const row = rows?.get?.(i);
    const f = row?.f ?? 0;
    const state = placed.has(i) ? "placed" : has(f, FLAG.ARRIVED) ? "waiting" : "racing";
    return { i, p:row?.p ?? 0, f, x:row?.x, y:row?.y, state, place:placed.get(i) ?? null, arrived:arrivals.indexOf(i) };
  });
  const tier = r => (r.state === "placed" ? 0 : r.state === "waiting" ? 1 : 2);
  list.sort((a, b) => tier(a) - tier(b)
    || (a.state === "placed" ? a.place - b.place : 0)
    || (a.state === "waiting" ? (a.arrived < 0 ? 99 : a.arrived) - (b.arrived < 0 ? 99 : b.arrived) : 0)
    || b.p - a.p);
  return list.map((r, k) => ({ ...r, rank:k + 1 }));
}

/* the leg that a room message is about */
export function legOf(geo, room) {
  const legs = geo?.legs || [];
  const k = Math.max(0, Math.min(legs.length - 1, room?.leg | 0));
  return legs[k] || null;
}

export const legLength = leg => (leg ? Math.max(1, (leg.finish ?? leg.s1) - (leg.grid ?? leg.s0)) : 1);

/* the Cup's standings: the room's own list, else the field then the outs (last out first) */
export function cupStandings(room) {
  const listed = indexList(room?.standings);
  if (listed.length) return listed;
  const out = indexList(room?.out);
  const field = indexList(room?.field).filter(i => !out.includes(i));
  return [...field, ...out.slice().reverse()];
}

/* who this cut sends home: the round's own record when the room keeps one
   (`history`), else the outs that raced this round */
export function cutOf(room, raceField) {
  const last = Array.isArray(room?.history) && room.history.length ? room.history[room.history.length - 1] : null;
  if (last && (last.round === room.round || room?.phase === "cut")) {
    const field = indexList(last.field);
    const cut = indexList(last.out);
    const order = indexList(last.results);
    const ranked = [...order.filter(i => field.includes(i)), ...field.filter(i => !order.includes(i))];
    return { cut, through:ranked.filter(i => !cut.includes(i)), order:ranked, results:last.results || [] };
  }
  const out = indexList(room?.out);
  const field = raceField?.length ? raceField : indexList(room?.field);
  const cut = out.filter(i => field.includes(i));
  const through = field.filter(i => !cut.includes(i));
  return { cut, through, order:[...through, ...cut], results:room?.results || [] };
}

export function titleFor(room, geo) {
  const leg = legOf(geo, room);
  const round = (room?.round | 0) + 1;
  const rounds = room?.rounds | 0;
  const field = indexList(room?.field).length;
  const through = throughFor(room);
  const final = (rounds > 0 && round >= rounds) || ("cut" in (room || {}) && room.cut === null && room.phase !== "lobby");
  return { round, rounds, final, leg, legName:leg?.name || "", field, through,
    label:final ? "Final" : `Round ${round}`,
    goes:final || through >= field ? (field <= 3 ? `${field} race for the podium` : `${field} riders`) : `${through} of ${field} go through` };
}
