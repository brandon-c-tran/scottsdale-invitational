/* What each connection is allowed to see. The Durable Object keeps the whole
   tournament in memory; every hello and broadcast goes through this
   projection instead of sending raw state.

   - Server-only ledgers never leave the Worker: wagerOps, and the per-event
     contest/draft replay maps. Their keys embed device ids, and a device id
     is the only thing a claim trusts.
   - Wager chips go out as { stake, ts }; their requestKey embeds a device id.
   - Private ratings (seeds) are the commissioner's. A player gets their own
     back so the rating form can show saved answers.
   - Shirt size and flights are for the commissioner and the owner. Name,
     number, chip, photo and walkout stay public: every card renders them.
   - Logistics stay public (the house, and Brandon's own times).

   Viewers: { isGm, player }. An unclaimed device and the TV route get the
   public view. */
import * as core from "../shared/core.js";

const { isActivePlayer } = core;

const SERVER_ONLY_STATE_KEYS = Object.freeze(["wagerOps"]);
const SERVER_ONLY_EVENT_OP_KEYS = Object.freeze(["contestCommands", "draftCommands"]);
const PRIVATE_PROFILE_FIELDS = Object.freeze(["size", "jersey", "flightsBooked", "flightIn", "flightOut"]);
const PER_VIEWER_KEYS = Object.freeze(["seeds", "profiles", "duels"]);

function normalizeViewer(viewer) {
  return {
    isGm:viewer?.isGm === true,
    player:isActivePlayer(viewer?.player) ? viewer.player : null,
  };
}

const viewerKey = viewer => {
  const { isGm, player } = normalizeViewer(viewer);
  return `${isGm ? "gm" : "guest"}:${player || ""}`;
};

const publicChip = chip => {
  const out = {};
  if (chip?.stake !== undefined) out.stake = chip.stake;
  if (chip?.ts !== undefined) out.ts = chip.ts;
  return out;
};

const publicWager = wager => Array.isArray(wager?.chips)
  ? { ...wager, chips:wager.chips.map(publicChip) }
  : wager;

function publicEventOps(eventOps) {
  const out = {};
  for (const [eventId, op] of Object.entries(eventOps || {})) {
    if (!op || typeof op !== "object" || !SERVER_ONLY_EVENT_OP_KEYS.some(key => key in op)) {
      out[eventId] = op;
      continue;
    }
    const copy = { ...op };
    for (const key of SERVER_ONLY_EVENT_OP_KEYS) delete copy[key];
    out[eventId] = copy;
  }
  return out;
}

function publicProfile(profile) {
  if (!profile || typeof profile !== "object") return profile;
  if (!PRIVATE_PROFILE_FIELDS.some(key => key in profile)) return profile;
  const copy = { ...profile };
  for (const key of PRIVATE_PROFILE_FIELDS) delete copy[key];
  return copy;
}

/* ── LEAD MERGE HOOK: duel redaction ─────────────────────────────────────
   The duel-privacy work adds redactDuelsForViewer to shared/core.js. Once it
   is exported this calls it for every viewer; until then duels pass through
   unchanged. The namespace import keeps a missing export from failing the
   module link. Adjust the call if the final signature differs. */
function redactDuels(duels, viewer, state) {
  const redact = core.redactDuelsForViewer;
  if (typeof redact !== "function") return duels;
  return redact(duels, viewer, state) ?? duels;
}

/* Everything identical for every viewer. Serialized once per broadcast. */
function sharedProjection(state) {
  const out = {};
  for (const [key, value] of Object.entries(state || {})) {
    if (SERVER_ONLY_STATE_KEYS.includes(key) || PER_VIEWER_KEYS.includes(key)) continue;
    out[key] = value;
  }
  if (Array.isArray(out.wagers)) out.wagers = out.wagers.map(publicWager);
  if (out.eventOps && typeof out.eventOps === "object") out.eventOps = publicEventOps(out.eventOps);
  return out;
}

/* The small part that differs by viewer. */
function viewerProjection(state, viewer) {
  const { isGm, player } = normalizeViewer(viewer);
  const seeds = state?.seeds || {};
  const profiles = state?.profiles || {};
  return {
    seeds:isGm ? seeds : player && seeds[player] ? { [player]:seeds[player] } : {},
    profiles:isGm ? profiles : Object.fromEntries(Object.entries(profiles)
      .map(([id, profile]) => [id, id === player ? profile : publicProfile(profile)])),
    duels:redactDuels(state?.duels || [], { isGm, player }, state),
  };
}

function publicState(state, viewer) {
  return { ...sharedProjection(state), ...viewerProjection(state, viewer) };
}

/* One serializer per broadcast: the shared part is stringified once and each
   viewer class adds only its own seeds/profiles/duels. */
function createStateSerializer(state) {
  let shared = null;
  const cache = new Map();
  return viewer => {
    const key = viewerKey(viewer);
    if (cache.has(key)) return cache.get(key);
    if (shared === null) shared = JSON.stringify(sharedProjection(state));
    const own = JSON.stringify(viewerProjection(state, viewer));
    const json = shared === "{}" ? own : `${shared.slice(0, -1)},${own.slice(1)}`;
    cache.set(key, json);
    return json;
  };
}

export {
  PRIVATE_PROFILE_FIELDS,
  SERVER_ONLY_EVENT_OP_KEYS,
  SERVER_ONLY_STATE_KEYS,
  createStateSerializer,
  normalizeViewer,
  publicState,
  sharedProjection,
  viewerKey,
  viewerProjection,
};
