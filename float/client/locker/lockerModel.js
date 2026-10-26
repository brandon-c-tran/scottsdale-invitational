/* The Locker, pure (LockerPicker.jsx; float/PROTOCOL.md "Looks",
   "Floaties"): its tabs, what each offers (the crown only for the groom,
   and first for him), the stats a floatie switch moves, and the rider the
   preview draws. */
import { CRITTERS, HATS, POSES, SHADES, cleanLook } from "../../shared/looks.js";
import { FLOATIES, FLOATIE_IDS, STATS, floatieOf } from "../../shared/floaties.js";

export const LOCKER_TABS = Object.freeze([
  { id:"critter", name:"Critter" },
  { id:"floatie", name:"Floatie" },
  { id:"hat", name:"Hat" },
  { id:"shades", name:"Shades" },
  { id:"pose", name:"Pose" },
]);

/* a preview without the rider's colour is drawn in this */
export const LOCKER_NEUTRAL = "#aab6c2";

export function lockerOptions(tab, { groom = false } = {}) {
  if (tab === "critter") return CRITTERS;
  if (tab === "floatie") return FLOATIES;
  if (tab === "hat") {
    const hats = HATS.filter(hat => !hat.groom || groom);
    return groom ? [...hats.filter(hat => hat.groom), ...hats.filter(hat => !hat.groom)] : hats;
  }
  if (tab === "shades") return SHADES;
  if (tab === "pose") return POSES;
  return [];
}

export const lockerLook = (look, { groom = false } = {}) => cleanLook(look || {}, { groom, floatieIds:FLOATIE_IDS });

/* the next look after picking `id` in `tab`, or null when nothing changes */
export function pickLook(look, tab, id, { groom = false } = {}) {
  const clean = lockerLook(look, { groom });
  if (!LOCKER_TABS.some(t => t.id === tab) || clean[tab] === id) return null;
  if (!lockerOptions(tab, { groom }).some(option => option.id === id)) return null;
  return lockerLook({ ...clean, [tab]:id }, { groom });
}

/* each stat of `to`, with how it moved from `from`: pips gained, pips lost */
export function statMoves(fromId, toId) {
  const from = floatieOf(fromId), to = floatieOf(toId);
  return STATS.map(stat => ({ id:stat.id, name:stat.name, value:to[stat.id], was:from[stat.id],
    gain:Math.max(0, to[stat.id] - from[stat.id]), loss:Math.max(0, from[stat.id] - to[stat.id]) }));
}

/* the rider the preview draws: the look on the rider's own colour and chip */
export function lockerEntrant({ look, color = null, name = "", photo = null, number = null, skin = null, groom = false } = {}) {
  return { name, color:color || LOCKER_NEUTRAL, look:lockerLook(look, { groom }),
    ...(photo ? { photo } : {}), ...(number !== null && number !== undefined ? { number } : {}), ...(skin ? { skin } : {}),
    ...(groom ? { groom:true } : {}) };
}

/* a critter's tile draws just the critter, so thirteen tiles render once
   and a hat change never redraws them */
export const critterTile = (entrant, critter) => ({ ...entrant, photo:undefined, number:undefined,
  look:{ critter, floatie:entrant.look.floatie, hat:"none", shades:"none", pose:entrant.look.pose } });

export const optionName = (tab, id) => lockerOptions(tab, { groom:true }).find(option => option.id === id)?.name || "";
