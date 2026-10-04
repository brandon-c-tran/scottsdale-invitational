/* What a guest still owes before the weekend, and the jersey they confirm.
   Pure: the server validates with these helpers and Home lists from them.

   The jersey prints a back name, the player number and the one apparel size.
   A guest confirms what they see; the confirmation stores that exact triple,
   so any later change to the name, number or size reads as unconfirmed
   without anything having to clear it. Once the commissioner marks jerseys
   ordered (`state.jerseysLocked`), guests can no longer change those three. */

const JERSEY_NAME_MAX = 12;
const NEEDS_MAX = 120;

const jerseyChars = /[^\p{L}\p{N} .'-]/gu;
const badJerseyChar = /[^\p{L}\p{N} .'-]/u;
const squeeze = text => text.replace(/\s+/g, " ").trim();

/* undefined: not a usable value; null: clear it */
function cleanBackName(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = squeeze(value).toLocaleUpperCase("en-US");
  if (!text) return null;
  return text.length > JERSEY_NAME_MAX || badJerseyChar.test(text) ? undefined : text;
}

/* what the back says: the saved back name, else the display name made legal */
function jerseyName(profile, player = "") {
  if (profile?.backName) return profile.backName;
  const base = squeeze(String(profile?.display || player || "").replace(jerseyChars, ""));
  return base.toLocaleUpperCase("en-US").slice(0, JERSEY_NAME_MAX).trim();
}

const jerseyConfirmed = (profile, player) => {
  const ok = profile?.jerseyOk;
  return !!ok && ok.name === jerseyName(profile, player)
    && ok.num === profile.num && ok.size === profile.size;
};

/* a Venmo username, without the @ */
function cleanVenmo(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/^@+/, "");
  if (!text) return null;
  return /^[A-Za-z0-9_-]{2,30}$/.test(text) ? text : undefined;
}

function cleanNeeds(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = squeeze(value);
  if (!text) return null;
  return text.length > NEEDS_MAX ? undefined : text;
}

/* Home's list, in the order a guest should do them. `songs` is whether the
   Win song picker is on. Flights appear only once booked: the yes/no itself
   is Home's own question. */
function setupTodo(state, player, { songs = false } = {}) {
  const profile = state?.profiles?.[player];
  if (!player || !profile) return [];
  const todo = [];
  if (!profile.color) todo.push({ id:"chip", section:"card", label:"Pick your chip color" });
  if (!profile.photoV) todo.push({ id:"photo", section:"card", label:"Add a photo" });
  if (!state.jerseysLocked && !jerseyConfirmed(profile, player))
    todo.push({ id:"jersey", section:"jersey", label:"Confirm your jersey" });
  if (profile.flightsBooked === true && (!profile.flightIn || !profile.flightOut))
    todo.push({ id:"flights", section:"travel", label:"Add your flights" });
  if (typeof profile.drinking !== "boolean" || !profile.venmo)
    todo.push({ id:"details", section:"travel", label:"Venmo and drinks" });
  if (songs && !profile.walkoutTrack) todo.push({ id:"song", section:"walkout", label:"Pick a win song" });
  return todo;
}

export {
  JERSEY_NAME_MAX, NEEDS_MAX, cleanBackName, cleanNeeds, cleanVenmo, jerseyConfirmed, jerseyName, setupTodo,
};
