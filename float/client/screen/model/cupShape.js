/* The Cup's shape as the screen needs it (float/GROOVE.md "Rounds,
   elimination, positions"): how many play each song and how many of them go
   through. The room says it (`cut`, the next round's field, null in the
   last round); a room that does not falls back to this stand-in of the
   engine's schedule (13, 9, 6, 3). */

import { cutSchedule } from "../../../shared/cup.js";

export const PHASES = Object.freeze(["lobby", "intro", "song", "cut", "podium", "feedback"]);

/* the field for every round: the engine's own (float/shared/cup.js; 13:
   13, 10, 7, 5, 3 over the five rounds) */
export { cutSchedule };

const indexOf = item => (typeof item === "number" ? item : Number.isFinite(item?.i) ? item.i : null);
export const indexList = list => (Array.isArray(list) ? list.map(indexOf).filter(i => i !== null) : []);

/* places that go through this round: the room's own `through` when it sends
   one, else the next round's field; the final (or a field of 3 or fewer) places everyone */
export function throughFor(room) {
  /* the room says it: `cut` is the next round's field (null in the last round) */
  if (room && "cut" in room) {
    const field = indexList(room.field).length;
    return Number.isFinite(room.cut) ? Math.min(room.cut, field || room.cut) : field;
  }
  if (Number.isFinite(room?.through)) return room.through;
  const field = indexList(room?.field).length;
  const total = (room?.entrants || []).length;
  const schedule = cutSchedule(total);
  const round = room?.round | 0;
  const rounds = Number.isFinite(room?.rounds) ? room.rounds : schedule.length;
  if (round >= rounds - 1 || field <= 3) return field;
  const next = schedule[round + 1];
  return Number.isFinite(next) ? Math.min(field, next) : field;
}
