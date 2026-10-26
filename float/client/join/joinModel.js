/* The standalone join (/float/play, float/PROTOCOL.md "Pages"), pure: the
   rider this phone remembers, the colours it offers, the room code it
   accepts. ControllerApp and the tests read the same answers.

   A standalone room code is four of the screen's consonants (no vowels, so
   no words): the screen makes it, its QR carries /float/play?room=<code>. */
import { cleanColor, cleanName, ROOM_ID, CODE_LETTERS, CODE_LENGTH, STANDALONE_CODE } from "../../shared/protocol.js";
import { cleanLook, defaultLook } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";

export const RIDER_KEY = "float-rider";
/* the room-code letters live in protocol.js; re-exported for the join */
export { CODE_LETTERS, CODE_LENGTH, STANDALONE_CODE };

/* colours that stay apart at TV distance and off the river's blue (the
   room gives bots the rest of its palette) */
export const JOIN_COLORS = Object.freeze(["#e4572e", "#ff9f1c", "#ffd23f", "#c0d461", "#29bf12", "#00b3b3",
  "#2e86ab", "#9b5de5", "#7353ba", "#ff7aa2", "#d81159", "#f2ead8"]);

const browserStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/* what a typed or pasted code becomes: its legal letters, lower case, at most four */
export function cleanCode(text = "") {
  return [...String(text).toLowerCase()].filter(ch => CODE_LETTERS.includes(ch)).join("").slice(0, CODE_LENGTH);
}

/* the room in a URL's ?room=, if it is one the room accepts */
export function roomFromSearch(search = "") {
  const room = String(new URLSearchParams(search).get("room") || "").trim().toLowerCase();
  return ROOM_ID.test(room) ? room : null;
}

/* a rider made legal: a name or none, a colour from the list (or a legal
   one already chosen), a look, drinking yes, no, or not yet answered */
export function cleanDraft(draft = {}, { seed = "" } = {}) {
  const color = cleanColor(draft.color);
  return {
    name:cleanName(draft.name),
    color:color || JOIN_COLORS[0],
    look:cleanLook(draft.look || defaultLook(seed, FLOATIE_IDS), { floatieIds:FLOATIE_IDS, seed }),
    drinks:draft.drinks === true || draft.drinks === false ? draft.drinks : null,
  };
}

/* ready to ride: a name and an answer to "Drinking?" */
export const canJoin = draft => !!cleanName(draft?.name) && (draft?.drinks === true || draft?.drinks === false);

/* the rider the room hears (PROTOCOL "rider") */
export const riderOf = draft => ({ name:cleanName(draft.name), color:cleanColor(draft.color) || JOIN_COLORS[0],
  look:draft.look, drinks:draft.drinks !== false });

/* the rider this phone remembers, or null */
export function loadRider(storage = browserStorage(), { seed = "" } = {}) {
  try {
    const saved = JSON.parse(storage?.getItem(RIDER_KEY) || "null");
    if (!saved || typeof saved !== "object") return null;
    const draft = cleanDraft(saved, { seed });
    return canJoin(draft) ? draft : null;
  } catch { return null; }
}

export function saveRider(draft, storage = browserStorage()) {
  try { storage?.setItem(RIDER_KEY, JSON.stringify(riderOf(draft))); return true; } catch { return false; }
}

/* the page's URL for a room (the code goes in ?room=, nothing else changes) */
export function withRoom(href, room) {
  const url = new URL(href);
  if (room) url.searchParams.set("room", room); else url.searchParams.delete("room");
  return `${url.pathname}${url.search}${url.hash}`;
}
