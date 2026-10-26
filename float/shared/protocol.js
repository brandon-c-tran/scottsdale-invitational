/* Float's wire format (float/PROTOCOL.md). Pure: shared by the room, the
   screen, the controller and the tests. */
import { cleanLook } from "./looks.js";
import { FLOATIE_IDS } from "./floaties.js";

export const ROLES = Object.freeze(["screen", "controller"]);
/* the Cup: lobby -> intro -> [grid -> countdown -> race -> cut] x rounds -> podium -> feedback -> lobby */
export const PHASES = Object.freeze(["lobby", "intro", "grid", "countdown", "race", "cut", "podium", "feedback"]);
export const MODES = Object.freeze(["party", "fieldday"]);
export const ROOM_ID = /^[a-z0-9-]{1,32}$/;

/* client to server */
export const CLIENT = Object.freeze(["hello", "ping", "look", "ready", "stroke", "hands", "drink", "balloon", "feedback", "host"]);
/* server to client */
export const SERVER = Object.freeze(["welcome", "pong", "room", "snap", "me", "ev", "debug"]);
/* an `ev`'s `e` */
export const EVENTS = Object.freeze(["flip", "bump", "arrive", "drink", "out", "balloon", "splash"]);
/* a screen's `host` command */
export const HOST_CMDS = Object.freeze(["start", "lobby", "kick"]);

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
export const hasFlag = (f, flag) => ((f | 0) & flag) === flag;

const round = (value, places) => {
  const k = 10 ** places;
  return Math.round(value * k) / k;
};

/* one entrant's row: [i, x, y, a, f, p] */
export const packRow = (i, { x, y, a, f, p }) => [i, round(x, 2), round(y, 2), round(a, 3), f | 0, round(p, 1)];
export const unpackRow = row => ({ i:row[0], x:row[1], y:row[2], a:row[3], f:row[4], p:row[5] });

export const cleanName = value => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
export const cleanColor = value => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value).toLowerCase() : null;
/* a device id: the phone's or screen's stable random id */
export const cleanDevice = value => {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(text) ? text : null;
};
/* a Field Day player id */
export const cleanPid = value => {
  const text = String(value ?? "").trim();
  return text && text.length <= 40 && !/[\u0000-\u001f]/.test(text) ? text : null;
};

/* a rider as the room keeps it: { name, color, look, drinks, pid?, photo?,
   number?, skin?, groom? }. Unknown or bad fields fall away; a missing color
   is null (the room gives one). */
export function cleanRider(rider, { seed = "" } = {}) {
  const groom = rider?.groom === true;
  const out = {
    name:cleanName(rider?.name) || "Rider",
    color:cleanColor(rider?.color),
    look:cleanLook(rider?.look, { groom, floatieIds:FLOATIE_IDS, seed }),
    drinks:rider?.drinks !== false,
  };
  const pid = cleanPid(rider?.pid);
  if (pid) out.pid = pid;
  /* the photo is opaque (Field Day's is a relative /api/photo/... path) */
  if (typeof rider?.photo === "string" && rider.photo.length > 0 && rider.photo.length <= 400) out.photo = rider.photo;
  const number = Number(rider?.number);
  if (rider?.number !== undefined && rider?.number !== null && Number.isInteger(number) && number >= 0 && number <= 999) out.number = number;
  if (typeof rider?.skin === "string" && /^[a-z0-9-]{1,24}$/i.test(rider.skin)) out.skin = rider.skin;
  if (groom) out.groom = true;
  return out;
}

/* the feedback card's answers: a small flat object of short values. The room
   keeps whatever keys the card uses (PROTOCOL.md "Feedback": fun 1..5, again
   yes/no, better up to 200 characters). */
export function cleanAnswers(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const out = {};
  for (const [key, value] of Object.entries(answers).slice(0, 8)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(key)) continue;
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.max(-1000, Math.min(1000, value));
    else if (typeof value === "string") out[key] = value.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}

/* an angle in (-PI, PI] */
export const wrapAngle = angle => {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  else if (a > Math.PI) a -= 2 * Math.PI;
  return a;
};
