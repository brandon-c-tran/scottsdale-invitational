/* Arrivals (Oct 4), as every screen reads them. Friday starts with people
   still on the road: once the door is open (shared/core.js arrivalsOpen) a
   roster player who has not checked in is on the way. Checking in is a
   scan of the TV's code (the server keeps it private and sends it only to
   TV sockets), so a check-in proves the phone is in the room.

   Two stages. The lobby: from check-in opening until the first game is
   announced, the TV is the room filling up (the code at the center, the
   seats around it) and a guest not yet in gets one Scan the TV pane at the
   top of Home. The corner: once a game is announced and someone is still
   on the way, a small plate with the code in the TV's corner and a
   compact Scan the TV row on that guest's Home. Pure: the TV, Home, the
   roster sheet and the travel board all read these. */
import { EDITION, arrivalsOpen, canCheckIn, hasArrived, isArriveCode, rosterOf } from "../../../shared/core.js";

/* the chip's fall into its seat, from the arrival's own server instant */
export const ARRIVAL_DROP_MS = 1100;
/* the scanner's landed state (the chip seated, "Here" stamped) before it closes */
export const ARRIVAL_LANDED_MS = 1700;

/* Friday at the house: midnight Arizona (UTC-7 all year) */
const FRIDAY = Date.parse(EDITION.arriveFrom);

/* a saved arrival leg's time ("14:35", 24h, Friday, the house's wall clock)
   as a server instant; null when there is none */
export function landedAt(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || "").trim());
  return match ? FRIDAY + (Number(match[1]) * 60 + Number(match[2])) * 60000 : null;
}

/* the arrival leg's time where this screen has it (the commissioner and
   the owner); everyone else reads the projection's landed flags */
export const etaOf = (state, player) => state?.profiles?.[player]?.flightIn?.time ?? null;
const landedFlag = (state, player) => Array.isArray(state?.arrivals?.landed) && state.arrivals.landed.includes(player);

/* The lobby ends when the weekend's first game is announced: any event
   announced (or taken further: betting, a result, the finale) ends it, and
   taking the announcement back brings it back. Preparing teams, heats or a
   draft does not. */
export function lobbyOver(state) {
  if (!state) return true;
  if (state.live || state.frozen || state.poker) return true;
  if (Object.values(state.results || {}).some(result => result?.slots?.length)) return true;
  return Object.values(state.eventOps || {}).some(op => !!op?.announcedAt);
}

/* The room's arrivals: one seat per roster player in roster order (a seat
   never moves, so an arrival drops into its own), who is here, and for an
   empty seat whether that player's flight has landed. `stage`:
     "lobby"  check-in open and no game announced yet: the TV is the lobby
     "corner" a game announced, the door open and someone still on the way
     "off"    otherwise (check-in closed, everyone in, or the board frozen) */
export function arrivalsBoard(state, now = Date.now()) {
  const roster = rosterOf(state);
  const open = arrivalsOpen(state);
  const at = state?.arrivals?.at || {};
  const seats = roster.map(player => {
    const here = hasArrived(state, player);
    const landing = here ? null : landedAt(etaOf(state, player));
    return { player, here, at:here ? Number(at[player]) || 0 : 0,
      landed:!here && (landedFlag(state, player) || (landing !== null && now >= landing)) };
  });
  const here = seats.filter(seat => seat.here).length;
  const latest = seats.filter(seat => seat.here).sort((a, b) => b.at - a.at)[0] || null;
  const checkIn = !!state && !state.frozen && roster.length > 0 && canCheckIn(state, now);
  const stage = !checkIn ? "off" : !lobbyOver(state) ? "lobby" : open && here < roster.length ? "corner" : "off";
  return { open, stage, here, total:roster.length, seats, full:here === roster.length && roster.length > 0,
    onTheWay:seats.filter(seat => !seat.here).map(seat => seat.player),
    latest:latest ? { player:latest.player, at:latest.at } : null };
}

/* Scan the TV on a guest's own Home: "lobby" (the pane at the top), "row"
   (the compact row once a game is announced), or null: not on the roster,
   already in, check-in closed (before Friday at the house, or the door
   shut), or the board frozen. */
export function arrivalOffer(state, me, now = Date.now()) {
  if (!me || !state || state.frozen) return null;
  if (!rosterOf(state).includes(me) || hasArrived(state, me)) return null;
  if (!canCheckIn(state, now)) return null;
  return lobbyOver(state) ? "row" : "lobby";
}

/* the seats that should play their drop on this render: arrived within the
   drop's window and not already here when this screen first saw the board
   (`seen`), so a load, reload or reconnect shows the end state */
export function droppingSeats(board, now = Date.now(), seen = null, ms = ARRIVAL_DROP_MS) {
  if (!board || board.stage === "off") return [];
  return board.seats.filter(seat => seat.here && now - seat.at < ms && now >= seat.at - 1000
    && !(seen && seen.has(seat.player))).map(seat => seat.player);
}

/* the roster sheet's and travel board's word for a player while the door is open */
export const arrivalState = (state, player) => !arrivalsOpen(state) ? null
  : hasArrived(state, player) ? "here" : "road";

/* ── the code ── */

/* what the TV's QR carries */
export const arriveUrl = (origin, code) => `${String(origin || "").replace(/\/+$/, "")}/?arrive=${code}`;

/* the check-in code in a scanned text or a page's address, or null: only
   an `arrive` parameter holding a well-formed code counts */
export function arriveCodeFrom(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  let value = null;
  try { value = new URL(raw, "https://fielddayseries.com").searchParams.get("arrive"); } catch { value = null; }
  if (value === null) value = (/[?&]arrive=([^&#\s]+)/.exec(raw) || [])[1] || null;
  const code = value ? value.trim().toUpperCase() : null;
  return isArriveCode(code) ? code : null;
}

/* The address without its arrive parameter, so a reload never checks in
   again and nothing lingers in the history; null when there is none. */
export function stripArriveParam(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (!url.searchParams.has("arrive")) return null;
  url.searchParams.delete("arrive");
  return `${url.pathname}${url.search}${url.hash}`;
}

/* A page opened from the TV's QR in a browser (iPhone's Camera opens the
   link in Safari, not the installed app). Once the first state is in:
   "send" when the server knows this device's player, "drop" when it does
   not (a stranger's browser does nothing special), "wait" until then. A
   device with a local claim waits for its re-claim to land, at most
   `patience` ms. */
export const ARRIVE_LINK_PATIENCE_MS = 8000;
export function arriveLinkStep({ code, ready, you, me, waited = 0, patience = ARRIVE_LINK_PATIENCE_MS }) {
  if (!code) return "none";
  if (!ready) return "wait";
  if (you) return "send";
  return me && waited < patience ? "wait" : "drop";
}

/* ── the TV lobby's seats ──
   Thirteen seats around the code as a horseshoe, open at the top where the
   code stands: an ellipse arc from the upper left down round the floor to
   the upper right, the seats at equal steps along the curve (so neighbours
   stand the same distance apart on the sides as on the floor). Canvas
   pixels: each point is a seat's center. */
export const LOBBY_RING = Object.freeze({ cx:960, cy:440, rx:790, ry:464, from:210, to:-30 });
export function lobbySeats(count, ring = LOBBY_RING) {
  const n = Math.max(0, Math.floor(count) || 0);
  if (!n) return [];
  const steps = 1200;
  const rad = deg => deg * Math.PI / 180;
  const at = t => {
    const a = rad(ring.from + (ring.to - ring.from) * t);
    /* the canvas's y runs down, so 90 degrees is the floor */
    return { x:ring.cx + ring.rx * Math.cos(a), y:ring.cy + ring.ry * Math.sin(a) };
  };
  const points = [], lengths = [0];
  for (let i = 0; i <= steps; i++) {
    points.push(at(i / steps));
    if (i) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = lengths[steps];
  return Array.from({ length:n }, (_, k) => {
    const want = n === 1 ? total / 2 : total * k / (n - 1);
    let i = lengths.findIndex(length => length >= want);
    if (i <= 0) i = Math.max(1, i);
    const span = lengths[i] - lengths[i - 1] || 1;
    const f = (want - lengths[i - 1]) / span;
    return { x:Math.round(points[i - 1].x + (points[i].x - points[i - 1].x) * f),
      y:Math.round(points[i - 1].y + (points[i].y - points[i - 1].y) * f) };
  });
}
