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
   - Ballots (D6, shared/prompts.js projectPrompts): drafts are the
     commissioner's, answers never leave, a viewer gets their own back, and
     a question's totals appear only after the TV reveals it.
   - Photo desk records (worker/moments.js) are not in state; the Durable
     Object passes its index in. Everyone gets the visible ones, the
     commissioner also the hidden ones; never byte counts or device ids.

   Viewers: { isGm, player }. An unclaimed device and the TV route get the
   public view. */
import * as core from "../shared/core.js";
import { projectPrompts } from "../shared/prompts.js";
import { publicMoments } from "./moments.js";

const { isActivePlayer } = core;

/* contestMarkets is a leftover of the reverted July betting experiment; some
   stored states still carry it, with device ids inside its chips. */
const SERVER_ONLY_STATE_KEYS = Object.freeze(["wagerOps", "contestMarkets"]);
/* Last line of defence for anything the projection does not know about: no
   frame ever carries a device id or a replay key, at any depth. */
const NEVER_SENT_FIELDS = new Set(["requestKey", "deviceId"]);
const scrub = (key, value) => NEVER_SENT_FIELDS.has(key) ? undefined : value;
const SERVER_ONLY_EVENT_OP_KEYS = Object.freeze(["contestCommands", "draftCommands"]);
const PRIVATE_PROFILE_FIELDS = Object.freeze(["size", "jersey", "flightsBooked", "flightIn", "flightOut"]);
const PER_VIEWER_KEYS = Object.freeze(["seeds", "profiles", "duels", "prompts", "moments"]);

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

/* Duel fairness: until a duel settles, a viewer sees only their own run time.
   Commissioners play duels too, so the GM view is redacted the same way. */
function redactDuels(duels, viewer) {
  return core.redactDuelsForViewer(duels, viewer?.player ?? null) ?? duels;
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

/* The small part that differs by viewer. `extras.moments` is the photo
   desk's index; a frame carries it only when it has something to show. */
function viewerProjection(state, viewer, extras = {}) {
  const { isGm, player } = normalizeViewer(viewer);
  const seeds = state?.seeds || {};
  const profiles = state?.profiles || {};
  const moments = publicMoments(extras?.moments, { isGm });
  return {
    seeds:isGm ? seeds : player && seeds[player] ? { [player]:seeds[player] } : {},
    profiles:isGm ? profiles : Object.fromEntries(Object.entries(profiles)
      .map(([id, profile]) => [id, id === player ? profile : publicProfile(profile)])),
    duels:redactDuels(state?.duels || [], { isGm, player }),
    prompts:projectPrompts(state?.prompts, { isGm, player }),
    ...(moments.length ? { moments } : {}),
  };
}

function publicState(state, viewer, extras = {}) {
  return JSON.parse(JSON.stringify({ ...sharedProjection(state), ...viewerProjection(state, viewer, extras) }, scrub));
}

/* One serializer per broadcast: the shared part is stringified once and each
   viewer class adds only its own seeds/profiles/duels. */
function createStateSerializer(state, extras = {}) {
  let shared = null;
  const cache = new Map();
  return viewer => {
    const key = viewerKey(viewer);
    if (cache.has(key)) return cache.get(key);
    if (shared === null) shared = JSON.stringify(sharedProjection(state), scrub);
    const own = JSON.stringify(viewerProjection(state, viewer, extras), scrub);
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
