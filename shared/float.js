/* Float in Field Day (float/PROTOCOL.md "Field Day"). Float takes Beerio
   Kart's slot on Saturday night: everyone paddles on their phone, the TV
   draws the river, and the room (a FloatRoom Durable Object of its own)
   runs the Cup and posts the result back. This file is Field Day's side of
   the bridge, read by the Worker, the phones and the TV:

   - the Cup Field Day starts (state.float, written by Lock and start in
     the same write) and the body the Tournament posts to the room;
   - each rider: their profile's look (profiles[p].float), chip and photo;
   - the director pill's beat while Float runs;
   - the slate's default (Float plays, Beerio Kart stands by);
   - a rider's feedback card, as the Tournament keeps it.

   Pure: no DOM, no Workers APIs. */
import {
  ALL_PLAYERS, CHIP_COLORS, CHIP_GRAY, CHIP_SKINS, ROSTER, allEventsOf, disp, presentPlayers, resolveEventLifecycle, rosterOf,
} from "./core.js";
import { cleanFreeText } from "./freeText.js";
import { cleanLook, defaultLook } from "../float/shared/looks.js";
import { FLOATIE_IDS } from "../float/shared/floaties.js";

export const FLOAT_GAME = "float";
/* the built-in's id, and the event it stands in for */
export const FLOAT_EVENT = "float";
export const FLOAT_STANDBY = "beerio";
/* the groom: the one rider whose locker offers the crown (PROTOCOL "The
   groom"). Brandon is the groom and the owner. */
export const FLOAT_GROOM = "Brandon";
/* from Lock and start to the Cup's start: long enough for every phone to
   open its controller and every rider to pick up their phone */
export const FLOAT_START_LEAD_MS = 20 * 1000;
/* QA's solo Cup: computer riders fill the field to this many */
export const FLOAT_SOLO_BOTS = 13;

/* a Field Day room: "fd-<eventId>", inside the room id rule [a-z0-9-]{1,32} */
export const floatRoom = evId => `fd-${String(evId || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 29) || "event"}`;
export const isFloatEvent = ev => ev?.game === FLOAT_GAME;
export const floatEventOf = (state, events = allEventsOf(state || {})) => events.find(isFloatEvent) || null;

/* ── looks ── */
export const floatGroom = player => player === FLOAT_GROOM;
/* a look made legal for this player: unknown ids fall back to the player's
   own default, the crown only for the groom */
export const cleanFloatLook = (look, player) => cleanLook(look && typeof look === "object" ? look : {},
  { groom:floatGroom(player), floatieIds:FLOATIE_IDS, seed:player || "" });
/* the look a rider races in: the one they saved, else their default */
export const floatLookOf = (profile, player) => profile?.float
  ? cleanFloatLook(profile.float, player) : defaultLook(player || "", FLOATIE_IDS);
export const hasFloatLook = profile => !!profile?.float && typeof profile.float === "object";

/* ── a rider, as the room takes it (PROTOCOL "rider" plus pid) ── */
const chipColor = hex => (CHIP_COLORS.find(color => color.hex === hex)?.hex || CHIP_GRAY).toLowerCase();
export const floatPhoto = (profile, player) =>
  profile?.photoV ? `/api/photo/${encodeURIComponent(player)}?v=${profile.photoV}` : null;
export function floatRider(state, player) {
  const profile = state?.profiles?.[player] || {};
  const index = ROSTER.indexOf(player);
  const name = String(disp(state || {}, player) || player).replace(/\s+/g, " ").trim().slice(0, 16) || player;
  return {
    pid:player,
    name,
    color:chipColor(profile.color),
    skin:CHIP_SKINS.includes(profile.skin) ? profile.skin : "ticks",
    number:profile.num ?? (index < 0 ? null : index + 1),
    photo:floatPhoto(profile, player),
    look:floatLookOf(profile, player),
    /* only a guest who said they are not drinking skips the drink */
    drinks:profile.drinking !== false,
    groom:floatGroom(player),
  };
}

/* ── the Cup ── */
/* the Cup on the board: { evId, room, cupId, startAt, startedAt, players, solo?, error? } */
export const floatCup = state => state?.float && typeof state.float === "object" && state.float.cupId && state.float.evId
  ? state.float : null;
/* racing now: started, not finished, its event neither posted nor skipped */
export function floatLive(state) {
  const cup = floatCup(state);
  return !!cup && !cup.finishedAt && !state.results?.[cup.evId] && !state.shelved?.[cup.evId];
}
/* the room has it: racing, and the post to the room has not failed */
export const floatOn = state => floatLive(state) && !state.float.error;
export const floatPlays = (state, player) => !!player && floatLive(state) && (state.float.players || []).includes(player);
/* who rides when a Cup starts: everyone here, or QA's one player */
export const floatPlayersAt = (state, solo = null) => Array.isArray(solo) && solo.length ? [...solo] : presentPlayers(state);

/* the body POST /internal/cup takes (PROTOCOL "Starting"), from the board
   as it stands when the Tournament posts it */
export function floatCupBody(state) {
  const cup = floatCup(state);
  if (!cup) return null;
  return {
    evId:cup.evId,
    cupId:cup.cupId,
    mode:"fieldday",
    drinking:true,
    startAt:cup.startAt,
    bots:cup.solo ? FLOAT_SOLO_BOTS : 0,
    entrants:(cup.players || []).map(player => floatRider(state, player)),
  };
}

/* The result the room reports (PROTOCOL "Finishing": `order`, real players
   only, 1st to last) as the event's paid places: one rider a place, the
   first three, each on this weekend's roster, never twice. */
export function floatSlots(order, state, places = 3) {
  const roster = new Set(rosterOf(state || {}));
  const seen = new Set();
  const slots = [];
  for (const player of Array.isArray(order) ? order : []) {
    if (typeof player !== "string" || !roster.has(player) || seen.has(player)) continue;
    seen.add(player);
    slots.push([player]);
    if (slots.length >= places) break;
  }
  return slots;
}

/* The director pill while Float is its event's game: start it when the
   Cup is not running (the capability on), otherwise the result by hand is
   the beat (the room posts its own), and a Cup the room never took asks to
   be started again. Null: the ordinary beat. */
export function floatBeat(state, ev, { float = false } = {}) {
  if (!isFloatEvent(ev) || state?.results?.[ev.id] || state?.shelved?.[ev.id]) return null;
  const cup = floatCup(state)?.evId === ev.id ? state.float : null;
  if (cup && !cup.finishedAt) {
    if (cup.error) return { type:"float-start", label:"Start Float again", subject:ev.name, restart:true,
      note:`Didn't start: ${cup.error.text}` };
    return { type:"float-live", label:"Enter result", subject:ev.name, note:"Float posts its own result" };
  }
  if (!cup && float && resolveEventLifecycle(state, ev).phase === "in-progress")
    return { type:"float-start", label:"Start Float", subject:ev.name };
  return null;
}
/* the tray's Restart Float asks first: the scores so far are gone */
export const FLOAT_RESTART_CONFIRM = "Float starts over. Scores so far are lost.";

/* ── the slate ──
   Float stands in Beerio Kart's slot. Beerio stays a built-in, so it is
   one Restore away (the event sheet's Restore, `shelve { on:false }`), but
   it is shelved by default while nothing has happened in it. `floatSlate`
   is a progress mark (EMPTY_STATE's 0, cleared with the rest of progress):
   set once the default has been applied to this board, so a commissioner
   who restores Beerio keeps it restored, and a game-progress reset of a
   board that had the default (worker/actions.js resetTournament, worker/
   qa.js resetProgress) applies it again. A board that never had it (every
   EMPTY_STATE a test builds) is left alone. */
export function standbyTouched(state, id = FLOAT_STANDBY) {
  const op = state?.eventOps?.[id] || {};
  return !!(state?.results?.[id] || state?.draws?.[id] || state?.brackets?.[id] || state?.stages?.[id]
    || state?.drafts?.[id] || state?.onDeck === id
    || op.startedAt || op.bettingOpenedAt || op.bettingLockedAt || op.contest || op.announcedAt || op.resultEntryAt
    || (state?.wagers || []).some(wager => wager?.eventId === id));
}
export function floatSlate(state) {
  if (!state || typeof state !== "object" || state.floatSlate) return state;
  const events = allEventsOf({ ...state, eventOrder:[] });
  const float = events.find(ev => ev.id === FLOAT_EVENT), standby = events.find(ev => ev.id === FLOAT_STANDBY);
  if (float && standby && !state.shelved?.[FLOAT_EVENT] && !state.shelved?.[FLOAT_STANDBY] && !standbyTouched(state))
    state.shelved = { ...(state.shelved || {}), [FLOAT_STANDBY]:true };
  state.floatSlate = 1;
  return state;
}

/* ── feedback (PROTOCOL "Feedback") ──
   A rider's end card, as POST /internal/float/feedback carries it:
   { cupId, pid, answers:{ fun, again, better } }: how fun (1 to 5), would
   they play it with other friends (true or false), what would make it
   better (optional, 200 at most). Kept as { cupId, pid, fun, again,
   better, at }; a card with no answer at all, or no cupId, is not kept. */
export const FLOAT_FEEDBACK_TEXT_MAX = 200;
export function cleanFloatFeedback(body, now = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const cupId = typeof body.cupId === "string" && /^[\w-]{1,64}$/.test(body.cupId) ? body.cupId : null;
  if (!cupId) return null;
  const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : {};
  const fun = Number.isInteger(answers.fun) && answers.fun >= 1 && answers.fun <= 5 ? answers.fun : null;
  const again = typeof answers.again === "boolean" ? answers.again : null;
  const better = cleanFreeText(typeof answers.better === "string" ? answers.better : "", FLOAT_FEEDBACK_TEXT_MAX) || null;
  if (fun === null && again === null && !better) return null;
  return { cupId, pid:ALL_PLAYERS.includes(body.pid) ? body.pid : null, fun, again, better, at:now };
}
