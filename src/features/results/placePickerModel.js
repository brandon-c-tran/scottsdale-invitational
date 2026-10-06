/* The place picker's rules, pure (ResultEntry.jsx draws them).

   Slots are the result's three places, index 0 = 1st, each a list of
   players. A unit is what one tap places: a player, or a whole team. The
   target is the place index the next tap lands in, or null when every place
   that can still be filled is filled.

   One tap on a unit that is not placed puts it in the target: an empty
   place takes it, a filled place that allows a tie takes it beside the
   others, and a filled place that does not (a sequenced event's 1st, which
   the server holds to one player or one team) swaps it in. The target then
   moves to the first open place. A tap on a placed unit takes it back out,
   and a place left empty by that becomes the target. */

export const PLACE_NAMES = Object.freeze(["1st", "2nd", "3rd"]);

/* the places an event pays, in order */
export const paidPlaces = table => (table || []).map((pts, i) => pts > 0 ? i : null).filter(i => i !== null);

const copy = slots => [0, 1, 2].map(i => [...(slots?.[i] || [])]);
const without = (slot, players) => slot.filter(p => !players.includes(p));

/* the place a unit holds: every one of its players in one place */
export function unitPlace(slots, players) {
  if (!players?.length) return -1;
  return (slots || []).findIndex(slot => (slot || []).length && players.every(p => slot.includes(p)));
}

/* a place a tie can join: never the fixed 1st, never a sequenced event's
   1st (one player or one team), and only while a unit is left to place */
export function tieAllowed(place, { sequenced = false, fixedFirst = false } = {}) {
  if (place === 0) return !sequenced && !fixedFirst;
  return place > 0;
}

/* the first open place the next tap should land in */
export function nextTarget(slots, editable, sidesInPlay = Infinity) {
  const open = editable.find(place => place < sidesInPlay && !(slots?.[place] || []).length);
  return open ?? null;
}

/* place one unit at the target, per the rules above; returns new slots */
export function placeUnit(slots, players, target, rules = {}) {
  const next = copy(slots).map(slot => without(slot, players));
  if (target === null || target === undefined || !players?.length) return copy(slots);
  const filled = next[target].length > 0;
  if (filled && !tieAllowed(target, rules)) next[target] = [...players];
  else next[target] = [...next[target], ...players];
  return next;
}

/* take one unit out of whatever place holds any of its players */
export function removeUnit(slots, players) {
  return copy(slots).map(slot => without(slot, players));
}

/* One tap on a unit: place it or take it back. Returns { slots, target }. */
export function tapUnit(slots, players, target, { editable, sidesInPlay = Infinity, ...rules } = {}) {
  const held = unitPlace(slots, players);
  const anyHeld = (slots || []).findIndex(slot => players.some(p => (slot || []).includes(p)));
  if (held >= 0 || anyHeld >= 0) {
    const place = held >= 0 ? held : anyHeld;
    if (!editable.includes(place)) return { slots, target };
    const next = removeUnit(slots, players);
    return { slots:next, target:next[place].length ? target ?? nextTarget(next, editable, sidesInPlay) : place };
  }
  if (target === null || target === undefined || !editable.includes(target)) return { slots, target };
  const next = placeUnit(slots, players, target, rules);
  return { slots:next, target:nextTarget(next, editable, sidesInPlay) };
}

/* What a filled place shows: whole teams first (any team all of whose
   players are in it), then its other players one by one. */
export function placeUnits(players, teams = []) {
  const left = [...(players || [])];
  const units = [];
  teams.forEach((team, index) => {
    const members = team?.players || [];
    if (members.length && members.every(p => left.includes(p))) {
      units.push({ key:`team:${index}`, team:index, players:[...members] });
      members.forEach(p => left.splice(left.indexOf(p), 1));
    }
  });
  return [...units, ...left.map(p => ({ key:`player:${p}`, team:null, players:[p] }))];
}

/* a paid place still owed: open, after 1st, and some side could fill it */
export function emptyPaidPlaces(slots, editable, sidesInPlay) {
  return editable.filter(place => place > 0 && place < sidesInPlay && !(slots?.[place] || []).length);
}
