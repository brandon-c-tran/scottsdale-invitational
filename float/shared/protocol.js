/* Float's wire format (float/PROTOCOL.md). Pure: shared by the room, the
   screen, the controller and the tests. */

export const ROLES = Object.freeze(["screen", "controller"]);
export const PHASES = Object.freeze(["lobby", "countdown", "race", "results"]);
export const ROOM_ID = /^[a-z0-9-]{1,32}$/;

/* the snapshot row's flags */
export const FLAG = Object.freeze({
  SWIM:1,
  HANDS_OFF:2,
  ARRIVED:4,
  DRANK:8,
  STROKE_L:16,
  STROKE_R:32,
  BUMP:64,
  SPLASHED:128,
});

const round = (value, places) => {
  const k = 10 ** places;
  return Math.round(value * k) / k;
};

/* one entrant's row: [i, x, y, a, f, p] */
export const packRow = (i, { x, y, a, f, p }) => [i, round(x, 2), round(y, 2), round(a, 3), f | 0, round(p, 1)];
export const unpackRow = row => ({ i:row[0], x:row[1], y:row[2], a:row[3], f:row[4], p:row[5] });

export const cleanName = value => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
export const cleanColor = value => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value).toLowerCase() : null;
